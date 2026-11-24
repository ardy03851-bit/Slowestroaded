import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Matrix4, Scene, Vector3 } from "three";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { BirchLayer, roadsideTrees } from "../src/birches.js";
import { atmosphere, legacyWind, relief, climate, wind } from "../src/graphics.js";
import { coachDoors } from "../src/coach.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import sharp from "sharp";
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
    assert.ok(doc.getRoot().listMaterials().some(m => spec.wheelMaterials?.test(m.getName())) ||
      doc.getRoot().listNodes().some(n => spec.wheelNodes?.test(n.getName())));
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
  const road = { onBeforeCompile() {} };
  relief(terrain, road, name => name);
  const ground = {
    uniforms: {}, vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>",
  };
  terrain.onBeforeCompile(ground);
  assert.equal(ground.uniforms.srAPacked.value, "grass-surface.png");
  assert.equal(ground.uniforms.srBPacked.value, "earth-surface.png");
  assert.match(ground.fragmentShader, /roughnessFactor = mix.*srPBR/);
  climate("Hills", "winter", "rain", .5);
  assert.deepEqual(ground.uniforms.srClimate.value, [1, 1, 1]);
  climate("Planet", "default", "clouds", .5);
  assert.deepEqual(ground.uniforms.srClimate.value, [0, 0, 0]);
  assert.equal(ground.base, true);
});

test("roadside woodland is deterministic, grounded, and survives missing billboards", () => {
  const nodes = Array.from({ length: 18 }, (_, i) => ({ i, p: { x: 0, y: 13, z: i*10 }, n: { x: 1, z: 0 } }));
  for (const [i, n] of nodes.entries()) { n.prev = nodes[i-1]; n.next = nodes[i+1]; }
  const treeSet = () => roadsideTrees(nodes[4], () => 13, x => Math.abs(x) > 10, true);
  const trees = treeSet();
  assert.ok(trees.length >= 6);
  assert.deepEqual(trees, treeSet());
  assert.ok(trees.every(m => Math.abs(m.elements[12]) > 10 && Math.abs(m.elements[13] - 12.89) < 0.0001));
  assert.deepEqual(roadsideTrees(nodes[4], () => -3, () => true, true), []);
  const layer = new BirchLayer(new Scene(), true);
  layer.update(1, new Vector3(0,13,40), [], "Hills", "winter", treeSet);
  assert.ok(layer.container.children[0].count > 0);
  assert.equal(layer.container.children[1].visible, false);
  layer.update(2, new Vector3(0,13,40), [], "Hills", "default", treeSet);
  assert.equal(layer.container.children[1].visible, true);
});

test("Coach has glazing, seals, and handles on the driver and passenger sides", async () => {
  const model = new OBJLoader().parse(await readFile(new URL("../static/media/bus-02.07c5f9f2.obj", import.meta.url), "utf8"));
  const doors = coachDoors(model);
  for (const name of ["Passenger entry", "Driver entry", "Emergency exit"]) for (const part of ["seal", "glazing", "handle"]) {
    assert.ok(doors.userData.panelVertexCounts[`${name} ${part}`] >= 6, `${name} ${part} must fit the shell`);
  }
  assert.equal(Object.keys(doors.userData.panelVertexCounts).filter(name => /^Side -?1 window \d$/.test(name)).length, 8);
  assert.ok(doors.children.length <= 7, "body details are batched by material");
});

test("scanned surface maps and HDR reflections ship with valid formats", async () => {
  const maps = new URL("../static/media/surfaces/", import.meta.url);
  for (const surface of ["asphalt", "grass", "earth"]) {
    const color = await sharp(new URL(`${surface}-color.jpg`, maps).pathname).metadata();
    assert.deepEqual([color.format, color.width, color.height], ["jpeg", 512, 512]);
    const packed = await sharp(new URL(`${surface}-surface.png`, maps).pathname).stats();
    assert.equal(packed.channels.length, 4);
    assert.ok(packed.channels.every(channel => channel.stdev >= 1));
  }
  const bytes = await readFile(new URL("country-road.hdr", maps));
  const hdr = new RGBELoader().parse(Uint8Array.from(bytes).buffer);
  assert.deepEqual([hdr.width, hdr.height], [1024, 512]);
  const sun = { intensity: .47, sunOffset: new Vector3(1,2,3) };
  const sky = { onBeforeCompile(s) { s.base = true; } };
  atmosphere(sky, sun);
  sky.onBeforeRender();
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <fog_fragment>" };
  sky.onBeforeCompile(shader);
  assert.equal(shader.base, true);
  assert.equal(shader.uniforms.srDaylight.value, .47);
  assert.equal(shader.uniforms.srSun.value, sun.sunOffset);
  assert.match(shader.fragmentShader, /gl_FragColor\.rgb.*srClearSky/);
});
