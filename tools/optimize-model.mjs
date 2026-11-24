// Example: node tools/optimize-model.mjs input.glb static/media/models/model.glb
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { Box3, Matrix4, Vector3 } from "three";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node tools/optimize-model.mjs input.glb output.glb");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
for (const clip of doc.getRoot().listAnimations()) clip.dispose();
for (const node of doc.getRoot().listNodes()) {
  if (!node.getMesh()) continue;
  const bounds = new Box3();
  const world = new Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of node.getMesh().listPrimitives()) {
    if (primitive.getMaterial()?.getName() === "shadow") continue;
    const p = primitive.getAttribute("POSITION");
    if (!p) continue;
    bounds.union(new Box3(new Vector3().fromArray(p.getMin([])), new Vector3().fromArray(p.getMax([]))).applyMatrix4(world));
  }
  // Some Sketchfab animations store a second, exploded workshop layout far
  // below the road. Remove those parts before joining compatible materials.
  if (bounds.isEmpty() || bounds.getCenter(new Vector3()).y < -0.065 ||
      bounds.min.length() > 30 || bounds.max.length() > 30) node.setMesh(null);
}
await MeshoptSimplifier.ready;
await doc.transform(
  prune(), flatten(), join(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.0015 }),
  dedup(), prune(),
  textureCompress({ encoder: sharp, resize: [1024, 1024], targetFormat: "webp", quality: 80 }),
);
await mkdir(dirname(output), { recursive: true });
await io.write(output, doc);
