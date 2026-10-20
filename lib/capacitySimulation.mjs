// Predictive, deterministic, isolated queue simulation for Spreelo admins.
// NO database, media, publishing, credits, HTTP, storage, or production workers.
// Results do not constitute a real end-to-end capacity test.
// Jobs are batched by their arrival minute to keep browser memory bounded for 100k customers.
const WEEK_MINUTES = 7 * 24 * 60;
const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));

export function sanitizeCapacityInputs(inputs = {}) {
  return {
    customers: clampInt(inputs.customers, 1, 100000),
    postsPerWeek: clampInt(inputs.postsPerWeek, 1, 10),
    videoShare: clampInt(inputs.videoShare, 0, 100),
    workers: clampInt(inputs.workers, 1, 50),
    videoWorkerMinutes: clampInt(inputs.videoWorkerMinutes, 1, 20),
    peakFactor: clampInt(inputs.peakFactor, 1, 5),
  };
}

function buildVideoPrefix(videoShare) {
  // Same deterministic video distribution as the previous per-post simulation.
  const prefix = new Int32Array(101);
  for (let i = 0; i < 100; i++) {
    prefix[i + 1] = prefix[i] + (i * 37 % 100 < videoShare ? 1 : 0);
  }
  return prefix;
}

function countVideoBefore(index, videoShare, prefix) {
  return Math.floor(index / 100) * videoShare + prefix[index % 100];
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

  // Count jobs per arrival minute instead of storing one item per simulated post.
  const videoQueue = [];
  const otherQueue = [];
  const nextAvailable = new Int32Array(settings.workers);
  const videoPrefix = buildVideoPrefix(settings.videoShare);
  const waitHistogram = new Int32Array(minutes * 2 + 1);
  let videoHead = 0;
  let otherHead = 0;
  let pendingVideo = 0;
  let pendingOther = 0;
  let completed = 0; // Jobs STARTED, not finished by an external service.
  let completedInWeek = 0;
  let videosCompleted = 0;
  let maxWaiting = 0;
  let waitingEndOfWeek = 0;
  let minutesUntilDrained = 0;
  let emitted = 0;
  let fractional = 0;

  // Simulate an additional week only for work that was not started on time.
  for (let minute = 0; minute < minutes * 2; minute++) {
    if (minute < minutes) {
      fractional += arrivals * weights[minute] / weightTotal;
      const wanted = minute === minutes - 1 ? arrivals - emitted : Math.min(arrivals - emitted, Math.floor(fractional + 1e-10));
      fractional -= wanted;
      const videoWanted = countVideoBefore(emitted + wanted, settings.videoShare, videoPrefix) - countVideoBefore(emitted, settings.videoShare, videoPrefix);
      const otherWanted = wanted - videoWanted;
      if (videoWanted) videoQueue.push({ minute, count: videoWanted });
      if (otherWanted) otherQueue.push({ minute, count: otherWanted });
      pendingVideo += videoWanted;
      pendingOther += otherWanted;
      emitted += wanted;
    }

    maxWaiting = Math.max(maxWaiting, pendingVideo + pendingOther);
    for (let w = 0; w < nextAvailable.length; w++) {
      if (nextAvailable[w] > minute) continue;
      const videoReady = pendingVideo > 0;
      const otherReady = pendingOther > 0;
      if (!videoReady && !otherReady) continue;
      const chooseVideo = videoReady && (!otherReady || videoQueue[videoHead].minute <= otherQueue[otherHead].minute);
      if (chooseVideo) {
        const group = videoQueue[videoHead];
        waitHistogram[minute - group.minute]++;
        if (--group.count === 0) videoHead++;
        pendingVideo--;
        nextAvailable[w] = minute + settings.videoWorkerMinutes;
        videosCompleted++;
        completed++;
      } else {
        // Current queue's nominal two non-video jobs per worker execution.
        const count = Math.min(2, pendingOther);
        for (let j = 0; j < count; j++) {
          const group = otherQueue[otherHead];
          waitHistogram[minute - group.minute]++;
          if (--group.count === 0) otherHead++;
          pendingOther--;
          completed++;
        }
        nextAvailable[w] = minute + 1;
      }
      if (minute < minutes) completedInWeek = completed;
    }
    if (minute === minutes - 1) waitingEndOfWeek = pendingVideo + pendingOther;
    if (minute >= minutes && completed === arrivals) {
      minutesUntilDrained = minute - minutes + 1;
      break;
    }
  }

  const p95Rank = Math.ceil(completed * 0.95);
  let p95 = null;
  let rankCount = 0;
  for (let wait = 0; wait < waitHistogram.length; wait++) {
    rankCount += waitHistogram[wait];
    if (rankCount >= p95Rank && p95Rank > 0) { p95 = wait; break; }
  }
  return {
    settings,
    requestedPosts: arrivals,
    averagePerDay: Math.round(arrivals / 7),
    completedInWeek, // Legacy field name: STARTED in the model (not actually rendered/published).
    waitingEndOfWeek,
    maxWaiting,
    videosCompleted,
    p95QueueWaitMinutes: p95,
    minutesUntilDrained,
    simulationComplete: completed === arrivals,
    synthetic: true,
    note: "Modellberäkning av väntan till jobbstart med antagna varaktigheter. Varken faktisk Vercel-, Supabase- eller leverantörskapacitet mäts.",
  };
}
