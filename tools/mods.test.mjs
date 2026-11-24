import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Matrix4, Scene, Vector3 } from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { BirchLayer } from "../src/birches.js";
import { legacyWind, relief, wind } from "../src/graphics.js";
import { vehicleCatalog, vehicleOptions } from "../src/vehicle-catalog.js";

test("published vehicles have sane wheel geometry and self-contained GLBs", async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const spec of Object.values(vehicleCatalog)) {
    const { radius, length, width, vector } = vehicleOptions(spec);
    assert.ok(radius > 0.25 && radius < 0.55);
    assert.ok(length > 2.4 && length < 3.5);
    assert.ok(width > 1.25 && width < 2);
    assert.ok(vector(spec.headlight).z > length);
    assert.ok(vector(spec.tail).z < 0);
    const asset = new URL(`../static/media/models/${spec.file}`, import.meta.url);
    const doc = await io.readBinary(await readFile(asset));
    assert.ok(doc.getRoot().listMeshes().length > 5);
    assert.ok(doc.getRoot().listMaterials().some(m => spec.wheelMaterials.test(m.getName())));
  }
});

test("near birches inherit terrain placement and restore billboard variants", () => {
  const layer = new BirchLayer(new Scene(), true);
  const variants = { array: new Float32Array([4, 5]) };
  const mesh = {
    visible: true, count: 2, instanceVariant: variants,
    matrixWorld: new Matrix4().makeTranslation(10, 0, 0), updateWorldMatrix() {},
    getMatrixAt(index, target) { target.makeTranslation(0, 5, index * 100); },
  };
  layer.update(1, new Vector3(10, 5, 0), [{ mesh }], "Hills", "default");
  assert.deepEqual([...variants.array], [-10, 5]);
  const tree = layer.container.children[0];
  const matrix = new Matrix4();
  tree.getMatrixAt(0, matrix);
  assert.deepEqual(matrix.elements.slice(12, 15), [10, 5, 0]);
  layer.update(2, new Vector3(), [{ mesh }], "Planet", "default");
  assert.deepEqual([...variants.array], [4, 5]);
  assert.equal(tree.count, 0);
});

test("shader hooks keep the base shader and share the same wind clock", () => {
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <project_vertex>" };
  legacyWind(shader);
  assert.equal(shader.uniforms.srWind, wind);
  assert.match(shader.vertexShader, /GRASS.*BUSH.*TREES/);
  const terrain = { onBeforeCompile(s) { s.base = true; } };
  const road = {};
  relief(terrain, road, name => name);
  const ground = { uniforms: {}, fragmentShader: "#include <common>\n#include <normal_fragment_maps>" };
  terrain.onBeforeCompile(ground);
  assert.equal(road.bumpMap, "asphalt");
  assert.equal(ground.uniforms.srGroundHeight.value, "ground");
  assert.equal(ground.base, true);
});
