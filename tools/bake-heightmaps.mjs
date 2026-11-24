import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const out = new URL("../static/media/heights/", import.meta.url);
await mkdir(out, { recursive: true });
const size = 256;
// Tile-periodic fBm plus fine mineral grain; grayscale images are linear data.
function heightmap(kind) {
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = 2 * Math.PI * x / size, v = 2 * Math.PI * y / size;
    const a = Math.sin(u * 9 + Math.cos(v * 8)) * Math.cos(v * 11 + Math.sin(u * 6));
    const b = Math.sin(u * 19 + v * 14) * Math.cos(v * 21 - u * 17);
    const c = Math.cos(u * 43 - v * 37) * Math.sin(v * 43 + u * 41);
    const d = Math.sin(u * 61 + v * 57) * Math.cos(v * 69 - u * 41);
    const rock = kind === "ground" ? 36 * a + 26 * b + 18 * c + 8 * d :
      11 * a + 29 * b + 31 * c + 15 * d;
    pixels[y * size + x] = Math.round(128 + rock);
  }
  return pixels;
}
for (const type of ["asphalt", "ground"]) {
  await sharp(heightmap(type), { raw: { width: size, height: size, channels: 1 } })
    .png().toFile(new URL(`${type}.png`, out).pathname);
}
