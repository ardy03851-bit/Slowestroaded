import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const archiveDir = process.argv[2];
if (!archiveDir) throw new Error("Usage: node tools/pack-surfaces.mjs <folder with ambientCG 1K-JPG ZIPs>");
const output = new URL("../static/media/surfaces/", import.meta.url);
await mkdir(output, { recursive: true });
for (const [kind, id] of Object.entries({ grass: "Grass004", earth: "Ground024", asphalt: "Asphalt002" })) {
  const source = type => sharp(execFileSync("unzip", ["-p", resolve(archiveDir, `${id}.zip`), `${id}_1K-JPG_${type}.jpg`], { maxBuffer: 8 * 1024 * 1024 }));
  await source("Color").resize(512, 512).jpeg({ quality: 88 }).toFile(new URL(`${kind}-color.jpg`, output).pathname);
  const channels = await Promise.all([["NormalGL", 0], ["NormalGL", 1], ["Roughness", 0], ["Displacement", 0]]
    .map(([type, channel]) => source(type).resize(256, 256).extractChannel(channel).raw().toBuffer()));
  const packed = Buffer.alloc(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) for (let channel = 0; channel < 4; channel++) {
    packed[i * 4 + channel] = channels[channel][i];
  }
  await sharp(packed, { raw: { width: 256, height: 256, channels: 4 } }).png()
    .toFile(new URL(`${kind}-surface.png`, output).pathname);
}
