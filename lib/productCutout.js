import sharp from "sharp";

function findAlphaBounds(alphaChannel, width, height, threshold = 24) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = alphaChannel[y * width + x];
      if (alpha < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const padding = 12;
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);

  return {
    left,
    top,
    width: Math.max(1, right - left + 1),
    height: Math.max(1, bottom - top + 1),
  };
}


function getCornerBackgroundStats(data, width, height) {
  const sampleSize = Math.max(10, Math.min(28, Math.floor(Math.min(width, height) * 0.05)));
  const corners = [
    { left: 0, top: 0 },
    { left: Math.max(0, width - sampleSize), top: 0 },
    { left: 0, top: Math.max(0, height - sampleSize) },
    { left: Math.max(0, width - sampleSize), top: Math.max(0, height - sampleSize) },
  ];
  const averages = corners.map((corner) => {
    let rTotal = 0;
    let gTotal = 0;
    let bTotal = 0;
    let count = 0;
    for (let y = corner.top; y < Math.min(height, corner.top + sampleSize); y += 1) {
      for (let x = corner.left; x < Math.min(width, corner.left + sampleSize); x += 1) {
        const index = (y * width + x) * 4;
        if (data[index + 3] < 8) continue;
        rTotal += data[index];
        gTotal += data[index + 1];
        bTotal += data[index + 2];
        count += 1;
      }
    }
    return count
      ? {
          r: Math.round(rTotal / count),
          g: Math.round(gTotal / count),
          b: Math.round(bTotal / count),
        }
      : { r: 245, g: 245, b: 245 };
  });
  const background = {
    r: Math.round(averages.reduce((sum, color) => sum + color.r, 0) / averages.length),
    g: Math.round(averages.reduce((sum, color) => sum + color.g, 0) / averages.length),
    b: Math.round(averages.reduce((sum, color) => sum + color.b, 0) / averages.length),
  };
  let maximumDistance = 0;
  for (let first = 0; first < averages.length; first += 1) {
    for (let second = first + 1; second < averages.length; second += 1) {
      const a = averages[first];
      const b = averages[second];
      maximumDistance = Math.max(
        maximumDistance,
        Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
      );
    }
  }
  return { background, maximumDistance, averages };
}

function getAlphaEdgeRatio(alphaChannel, width, height, threshold = 48) {
  const edgeSize = Math.max(3, Math.round(Math.min(width, height) * 0.025));
  let visible = 0;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x >= edgeSize &&
        x < width - edgeSize &&
        y >= edgeSize &&
        y < height - edgeSize
      ) {
        continue;
      }
      area += 1;
      if (alphaChannel[y * width + x] >= threshold) visible += 1;
    }
  }
  return area ? visible / area : 0;
}

export async function prepareSafeProductCutout(sourceImageBuffer) {
  const normalized = await sharp(sourceImageBuffer)
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { data, info } = await sharp(normalized)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const originalAlphaChannel = Buffer.alloc(pixelCount);
  let transparentPixelCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const alpha = data[pixel * 4 + 3];
    originalAlphaChannel[pixel] = alpha;
    if (alpha < 245) transparentPixelCount += 1;
  }

  const existingTransparencyRatio = pixelCount
    ? transparentPixelCount / pixelCount
    : 0;

  if (transparentPixelCount > 0) {
    const existingBounds = findAlphaBounds(
      originalAlphaChannel,
      info.width,
      info.height,
      18
    );
    if (!existingBounds) {
      throw new Error("Product image transparency contained no visible product");
    }
    const boundsAreaRatio =
      (existingBounds.width * existingBounds.height) / Math.max(1, pixelCount);
    const edgeVisibleRatio = getAlphaEdgeRatio(
      originalAlphaChannel,
      info.width,
      info.height,
      48
    );
    if (boundsAreaRatio > 0.97 && edgeVisibleRatio > 0.22) {
      throw new Error("Product image still contained a full rectangular background");
    }
    return {
      cutoutBuffer: await sharp(normalized).extract(existingBounds).png().toBuffer(),
      score: 210 - boundsAreaRatio * 30 - edgeVisibleRatio * 40,
      analysis: {
        mode: "existing_transparency",
        version: 342,
        sourceBounds: existingBounds,
        existingTransparencyRatio,
        boundsAreaRatio,
        edgeVisibleRatio,
      },
    };
  }

  const cornerStats = getCornerBackgroundStats(data, info.width, info.height);
  if (cornerStats.maximumDistance > 62) {
    throw new Error(
      `Product image background was too complex to remove safely (corner distance ${Math.round(cornerStats.maximumDistance)})`
    );
  }

  const background = cornerStats.background;
  const rgba = Buffer.from(data);
  const alphaChannel = Buffer.from(originalAlphaChannel);
  // Only pixels connected to the image border can be photographic background.
  // White keys, metallic highlights and printed white panels enclosed by the
  // product contour retain the original RGB and alpha, regardless of color.
  const distance = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    distance[p] = Math.hypot(data[i] - background.r, data[i+1] - background.g, data[i+2] - background.b);
  }
  const exterior = new Uint8Array(pixelCount), queue = new Int32Array(pixelCount);
  let head = 0, tail = 0;
  const enqueue = p => {
    if (!exterior[p] && (distance[p] <= 14 || originalAlphaChannel[p] < 8)) {
      exterior[p] = 1; queue[tail++] = p;
    }
  };
  for (let x = 0; x < info.width; x++) { enqueue(x); enqueue((info.height-1)*info.width+x); }
  for (let y = 0; y < info.height; y++) { enqueue(y*info.width); enqueue(y*info.width+info.width-1); }
  while (head < tail) {
    const p = queue[head++], x = p % info.width, y = Math.floor(p / info.width);
    if (x > 0) enqueue(p-1); if (x+1 < info.width) enqueue(p+1);
    if (y > 0) enqueue(p-info.width); if (y+1 < info.height) enqueue(p+info.width);
  }
  // Feather only the immediate exterior boundary, never flood through a pale
  // product using the old 62-color-distance fade. RGB pixels remain unchanged.
  let protectedPixels = 0;
  for (let p = 0; p < pixelCount; p++) {
    let alpha = originalAlphaChannel[p];
    if (exterior[p]) alpha = 0;
    else {
      const x = p % info.width, y = Math.floor(p / info.width);
      let besideBackground = false;
      for (let dy=-1; dy<=1 && !besideBackground; dy++) for (let dx=-1; dx<=1; dx++) {
        const xx=x+dx, yy=y+dy;
        if (xx>=0 && xx<info.width && yy>=0 && yy<info.height && exterior[yy*info.width+xx]) { besideBackground=true; break; }
      }
      if (besideBackground && distance[p] < 62) alpha = Math.min(alpha, Math.round(Math.max(0, (distance[p]-14)/48)*255));
      else if (distance[p] < 62 && alpha >= 245) protectedPixels++;
    }
    rgba[p*4+3] = alpha; alphaChannel[p] = alpha;
  }

  const bounds = findAlphaBounds(alphaChannel, info.width, info.height, 28);
  if (!bounds) {
    throw new Error("Product image background removal left no visible product");
  }

  let stronglyVisiblePixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (alphaChannel[pixel] >= 180) stronglyVisiblePixels += 1;
  }
  const stronglyVisibleRatio = pixelCount
    ? stronglyVisiblePixels / pixelCount
    : 0;
  const boundsAreaRatio = (bounds.width * bounds.height) / Math.max(1, pixelCount);
  const edgeVisibleRatio = getAlphaEdgeRatio(alphaChannel, info.width, info.height, 48);

  if (stronglyVisibleRatio < 0.08) {
    throw new Error("Product image background removal removed too much of the product");
  }
  if (boundsAreaRatio > 0.93 || edgeVisibleRatio > 0.08) {
    throw new Error("Product image still contained a visible rectangular or lifestyle background");
  }

  const visited = new Uint8Array(pixelCount);
  let largestAmbiguousRegion = 0;
  for (let p=0; p<pixelCount; p++) {
    if (exterior[p] || visited[p] || distance[p] > 14) continue;
    head=0; tail=1; queue[0]=p; visited[p]=1;
    while (head<tail) {
      const q=queue[head++], x=q%info.width, y=Math.floor(q/info.width);
      const nexts=[x>0?q-1:-1,x+1<info.width?q+1:-1,y>0?q-info.width:-1,y+1<info.height?q+info.width:-1];
      for (const n of nexts) if(n>=0 && !exterior[n] && !visited[n] && distance[n]<=14) {visited[n]=1;queue[tail++]=n;}
    }
    largestAmbiguousRegion=Math.max(largestAmbiguousRegion,tail);
  }
  if (largestAmbiguousRegion/(bounds.width*bounds.height) > 0.13) {
    throw new Error("Product image has an ambiguous pale surface or enclosed background; semantic isolation is required");
  }

  const cutoutBuffer = await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .extract(bounds)
    .png()
    .toBuffer();

  return {
    cutoutBuffer,
    score:
      150 -
      cornerStats.maximumDistance * 0.7 -
      boundsAreaRatio * 25 -
      edgeVisibleRatio * 80,
    analysis: {
      mode: "uniform_background_cutout",
      version: 342,
      sourceBounds: bounds,
      removalScope: "border_connected_one_pixel_feather",
      protectedProductPixels: protectedPixels,
      backgroundColor: `#${[background.r, background.g, background.b].map(v => v.toString(16).padStart(2, "0")).join("")}`,
      maximumCornerDistance: cornerStats.maximumDistance,
      stronglyVisibleRatio,
      boundsAreaRatio,
      edgeVisibleRatio,
    },
  };
}

