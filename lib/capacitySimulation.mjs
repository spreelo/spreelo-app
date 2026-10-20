// Predictive, deterministic, isolated queue simulation for Spreelo admins.
// NO database, media, publishing, credits, HTTP, storage, or production workers.
// Results do not constitute a real end-to-end capacity test.
const WEEK_MINUTES = 7 * 24 * 60;
const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));

export function sanitizeCapacityInputs(inputs = {}) {
  return {
    customers: clampInt(inputs.customers, 1, 10000),
    postsPerWeek: clampInt(inputs.postsPerWeek, 1, 10),
    videoShare: clampInt(inputs.videoShare, 0, 100),
    workers: clampInt(inputs.workers, 1, 50),
    videoWorkerMinutes: clampInt(inputs.videoWorkerMinutes, 1, 20),
    peakFactor: clampInt(inputs.peakFactor, 1, 5),
  };
}

export function simulateCapacityScenario(raw = {}) {
  const settings = sanitizeCapacityInputs(raw);
  const arrivals = settings.customers * settings.postsPerWeek;
  const minutes = WEEK_MINUTES;
  const weights = new Float64Array(minutes);
  let weightTotal = 0;
  for (let t = 0; t < minutes; t++) {
    const hour = (t % 1440) / 60;
    // Higher daytime demand creates bursts while preserving weekly volume.
    const officeHours = hour >= 8 && hour < 22;
    const weight = officeHours ? settings.peakFactor : 1;
    weights[t] = weight;
    weightTotal += weight;
  }
  const videoQueue = [];
  const otherQueue = [];
  const nextAvailable = new Int32Array(settings.workers);
  let videoHead = 0;
  let otherHead = 0;
  let completed = 0;
  let completedInWeek = 0;
  let videosCompleted = 0;
  let maxWaiting = 0;
  let waitingEndOfWeek = 0;
  let minutesUntilDrained = 0;
  let emitted = 0;
  let fractional = 0;
  const waits = [];

  // Simulate an additional week only for work that was not handled on time.
  for (let minute = 0; minute < minutes * 2; minute++) {
    if (minute < minutes) {
      fractional += arrivals * weights[minute] / weightTotal;
      const wanted = minute === minutes - 1 ? arrivals - emitted : Math.min(arrivals - emitted, Math.floor(fractional + 1e-10));
      fractional -= wanted;
      for (let j = 0; j < wanted; j++) {
        // Deterministic ratio, not random or dependent on real customer data.
        if (((emitted + j) * 37) % 100 < settings.videoShare) videoQueue.push(minute);
        else otherQueue.push(minute);
      }
      emitted += wanted;
    }

    const queued = (videoQueue.length - videoHead) + (otherQueue.length - otherHead);
    maxWaiting = Math.max(maxWaiting, queued);
    for (let w = 0; w < nextAvailable.length; w++) {
      if (nextAvailable[w] > minute) continue;
      const videoReady = videoHead < videoQueue.length;
      const otherReady = otherHead < otherQueue.length;
      if (!videoReady && !otherReady) continue;
      const chooseVideo = videoReady && (!otherReady || videoQueue[videoHead] <= otherQueue[otherHead]);
      if (chooseVideo) {
        waits.push(minute - videoQueue[videoHead++]);
        nextAvailable[w] = minute + settings.videoWorkerMinutes;
        videosCompleted++;
        completed++;
      } else {
        // Current queue's nominal two non-video jobs per worker execution.
        const count = Math.min(2, otherQueue.length - otherHead);
        for (let j = 0; j < count; j++) {
          waits.push(minute - otherQueue[otherHead++]);
          completed++;
        }
        nextAvailable[w] = minute + 1;
      }
      if (minute < minutes) completedInWeek = completed;
    }
    if (minute === minutes - 1) {
      waitingEndOfWeek = (videoQueue.length - videoHead) + (otherQueue.length - otherHead);
    }
    if (minute >= minutes && completed === arrivals) {
      minutesUntilDrained = minute - minutes + 1;
      break;
    }
  }
  waits.sort((a, b) => a - b);
  const p95 = waits.length ? waits[Math.min(waits.length - 1, Math.ceil(waits.length * 0.95) - 1)] : null;
  return {
    settings,
    requestedPosts: arrivals,
    averagePerDay: Math.round(arrivals / 7),
    completedInWeek,
    waitingEndOfWeek,
    maxWaiting,
    videosCompleted,
    p95QueueWaitMinutes: p95,
    minutesUntilDrained,
    simulationComplete: completed === arrivals,
    synthetic: true,
    note: "Modellberäkning av köväntan med antagna varaktigheter. Varken faktisk Vercel-, Supabase- eller leverantörskapacitet mäts.",
  };
}
