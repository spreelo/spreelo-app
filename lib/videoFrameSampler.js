let browserLaunchPromise = null;

async function getBrowserLaunchOptions() {
  if (!browserLaunchPromise) {
    browserLaunchPromise = (async () => {
      const [{ default: puppeteer }, chromiumModule] = await Promise.all([
        import("puppeteer-core"),
        import("@sparticuz/chromium"),
      ]);
      const chromium = chromiumModule.default || chromiumModule;
      const configuredExecutable = String(process.env.CHROMIUM_EXECUTABLE_PATH || "").trim();
      const executablePath = configuredExecutable || (await chromium.executablePath());
      return {
        puppeteer,
        launchOptions: {
          args: chromium.args,
          defaultViewport: { width: 540, height: 960, deviceScaleFactor: 1 },
          executablePath,
          headless: chromium.headless,
        },
      };
    })();
  }
  return browserLaunchPromise;
}

export async function sampleRemoteVideoFrames({
  videoUrl,
  durationSeconds,
  fractions = [0.18, 0.38, 0.58, 0.78, 0.93],
  timesSeconds = null,
}) {
  if (!videoUrl) throw new Error("Video URL is required for frame sampling");
  const duration = Math.max(2, Number(durationSeconds || 0) || 6);
  const { puppeteer, launchOptions } = await getBrowserLaunchOptions();
  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;background:#000;overflow:hidden"><video id="v" muted playsinline preload="auto" style="width:540px;height:960px;object-fit:contain;background:#000"></video></body></html>`,
      { waitUntil: "domcontentloaded" }
    );
    const actualDuration = await page.evaluate(async (src) => {
      const video = document.getElementById("v");
      video.src = src;
      video.load();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("video metadata timeout")), 15000);
        video.addEventListener("loadedmetadata", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        video.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("video load failed"));
        }, { once: true });
      });
      if (!Number.isFinite(video.duration) || video.duration <= 0.1) throw new Error("Invalid decoded video duration");
      return video.duration;
    }, videoUrl);

    const safeEnd = Math.max(0.05, actualDuration - 0.02);
    const requestedTimes = Array.isArray(timesSeconds) && timesSeconds.length
      ? timesSeconds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
          .map((value) => Math.max(0.05, Math.min(safeEnd, value)))
      : fractions.map((fraction) =>
          Math.max(0.05, Math.min(safeEnd, actualDuration * Number(fraction)))
        );

    const frames = [];
    for (const time of [...new Set(requestedTimes)]) {
      await page.evaluate(async (targetTime) => {
        const video = document.getElementById("v");
        if (Math.abs(video.currentTime - targetTime) < 0.001 && video.readyState >= 2) return;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("video seek timeout")), 8000);
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          video.addEventListener("seeked", done, { once: true });
          video.currentTime = targetTime;
        });
      }, time);
      await page.waitForFunction(() => {
        const video = document.getElementById("v");
        return !video.seeking && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      }, { timeout: 8000 });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const buffer = await page.screenshot({
        type: "jpeg",
        quality: 82,
        clip: { x: 0, y: 0, width: 540, height: 960 },
      });
      frames.push({ time, buffer: Buffer.from(buffer) });
    }
    return frames;
  } finally {
    await browser.close().catch(() => {});
  }
}
