import sharp from "sharp";

const expectedSharpVersion = "0.34.5";

if (sharp.versions?.sharp !== expectedSharpVersion) {
  throw new Error(
    `Unexpected Sharp runtime ${sharp.versions?.sharp || "unknown"}; expected ${expectedSharpVersion}.`,
  );
}

const probe = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .png()
  .toBuffer();

if (!Buffer.isBuffer(probe) || probe.length === 0) {
  throw new Error("Sharp runtime probe did not produce a valid PNG buffer.");
}

console.log(
  `Sharp runtime verified: sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}.`,
);
