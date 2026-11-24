import {
  BoxGeometry, CanvasTexture, Color, EquirectangularReflectionMapping, Group, Matrix4,
  Mesh, MeshStandardMaterial, sRGBEncoding, Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { vehicleCatalog, vehicleOptions } from "./vehicle-catalog.js";

const loader = new GLTFLoader();
const files = new Map();
const sides = ["fl", "fr", "rl", "rr"];
const positive = name => name.endsWith("l");
let studio;

function reflectionMap() {
  if (studio) return studio;
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "#7694b4");
  gradient.addColorStop(0.35, "#c9d5dd");
  gradient.addColorStop(0.49, "#e1ddcb");
  gradient.addColorStop(0.53, "#78786d");
  gradient.addColorStop(1, "#282b28");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#fff9e9"; ctx.fillRect(19, 10, 27, 8);
  studio = new CanvasTexture(canvas);
  studio.mapping = EquirectangularReflectionMapping;
  studio.encoding = sRGBEncoding;
  return studio;
}

function configureMaterial(material) {
  if (!material.isMeshStandardMaterial) return material;
  material.envMap = reflectionMap();
  material.envMapIntensity = 0.3;
  if (material.transmission > 0) {
    // Rendering a transmission pass for every pane is expensive on iPad.
    material.transmission = 0;
    material.transparent = true;
    material.opacity = 0.83;
    material.depthWrite = false;
  }
  return material;
}

function lightChannel(material, color, strength) {
  material.emissive ??= new Color();
  material.emissive.set(color);
  material.emissiveIntensity = strength;
}

function sourceScene(url) {
  if (!files.has(url)) {
    files.set(url, loader.loadAsync(url).then(gltf => gltf.scene).catch(error => {
      files.delete(url); throw error;
    }));
  }
  return files.get(url);
}

function detachedMesh(mesh, geometry, material, transform, castsShadow) {
  const instance = new Mesh(geometry, material);
  instance.matrixAutoUpdate = false;
  instance.matrix.copy(transform).multiply(mesh.matrixWorld);
  instance.castShadow = castsShadow && !material.transparent;
  return instance;
}

function nearestWheel(point, axle) {
  return `${point.z > (axle.front + axle.rear) / 2 ? "f" : "r"}${point.x > 0 ? "l" : "r"}`;
}

function splitTriangles(mesh, axle) {
  const geo = mesh.geometry;
  const position = geo.attributes.position;
  const count = geo.index?.count ?? position.count;
  const chunks = {};
  const center = new Vector3();
  const point = new Vector3();
  for (let i = 0; i + 2 < count; i += 3) {
    center.set(0, 0, 0);
    const tri = [];
    for (let j = i; j < i + 3; j++) {
      const index = geo.index ? geo.index.getX(j) : j;
      tri.push(index);
      center.add(point.fromBufferAttribute(position, index));
    }
    center.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    (chunks[nearestWheel(center, axle)] ??= []).push(...tri);
  }
  return Object.entries(chunks).map(([key, index]) => {
    const part = geo.clone();
    part.setIndex(index);
    return [key, part];
  });
}

function build(scene, spec) {
  scene.updateMatrixWorld(true);
  const { axle: a, scale: s } = spec;
  const { radius, width, length, vector } = vehicleOptions(spec);
  const origin = new Matrix4().makeScale(s, s, s);
  origin.setPosition(0, -a.ground * s, -a.rear * s);
  const body = new Group();
  const wheels = Object.fromEntries(sides.map(side => [side, new Group()]));
  const head = new Set(), tail = new Set(), surfaces = new Map();
  const transforms = {};
  for (const side of sides) {
    const sign = positive(side) ? 1 : -1;
    transforms[side] = new Matrix4().makeRotationY(-sign * Math.PI / 2)
      .multiply(new Matrix4().makeTranslation(-sign * width / 2, -radius, side[0] === "f" ? -length : 0))
      .multiply(origin);
  }
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry.attributes.position) return;
    const name = mesh.material.name ?? "";
    if (name === "shadow" || spec.skipNodes?.test(mesh.name) || spec.skipMaterials?.test(name)) return;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    const center = bounds.getCenter(new Vector3());
    if (center.y < a.ground - 0.06 || bounds.min.length() > 30 || bounds.max.length() > 30) return;
    if (!surfaces.has(mesh.material)) surfaces.set(mesh.material, configureMaterial(mesh.material.clone()));
    const material = surfaces.get(mesh.material);
    if (spec.heads?.test(name)) head.add(material);
    if (spec.tails?.test(name)) tail.add(material);
    if (spec.wheelMaterials?.test(name) || spec.wheelNodes?.test(mesh.name)) {
      const split = bounds.min.x < -a.x * 0.3 && bounds.max.x > a.x * 0.3;
      for (const [side, geometry] of split ? splitTriangles(mesh, a) : [[nearestWheel(center, a), mesh.geometry]]) {
        wheels[side].add(detachedMesh(mesh, geometry, material, transforms[side], true));
      }
    } else {
      body.add(detachedMesh(mesh, mesh.geometry, material, origin, !/glass|cover|light/i.test(name)));
    }
  });
  if (!body.children.length) throw new Error("No visible GLB chassis");
  if (!Object.values(wheels).every(wheel => wheel.children.length)) {
    throw new Error("The model did not contain four identifiable wheels");
  }
  const rearGeometry = spec.addRearLamps ? new BoxGeometry(0.23, 0.037, 0.018) : null;
  if (rearGeometry) {
    const mat = new MeshStandardMaterial({ color: 0x911d0d, roughness: 0.43 });
    const p = vector(spec.tail);
    for (const sign of [1, -1]) {
      const lamp = new Mesh(rearGeometry, mat);
      lamp.position.set(sign * p.x, p.y, p.z - 0.017);
      body.add(lamp);
    }
    tail.add(mat);
  }
  let lastEnvironment = -1;
  return {
    body, wheels,
    lights(on, braking, intensity) {
      for (const mat of head) lightChannel(mat, 0xffeed8, on ? 1.05 : 0);
      for (const mat of tail) lightChannel(mat, 0xff2111, braking ? 1.65 : on ? 0.42 : 0);
      const environment = intensity > 0.8 ? 0.07 : 0.3;
      if (environment !== lastEnvironment) {
        lastEnvironment = environment;
        for (const mat of surfaces.values()) if (mat.isMeshStandardMaterial) mat.envMapIntensity = environment;
      }
    },
    dispose() {
      for (const mat of surfaces.values()) mat.dispose();
      if (rearGeometry) {
        body.children.at(-1).material.dispose();
        rearGeometry.dispose();
      }
      for (const wheel of Object.values(wheels)) wheel.traverse(child => {
        if (child.isMesh && !sourceGeometries.has(child.geometry)) child.geometry.dispose();
      });
    },
  };
}

const sourceGeometries = new WeakSet();
export async function loadVehicle(base, spec) {
  const scene = spec.scene ?? await sourceScene(`${base}static/media/models/${spec.file}`);
  scene.traverse(node => { if (node.isMesh) sourceGeometries.add(node.geometry); });
  return build(scene, spec);
}

export function applyVehicleCatalog(vehicles) {
  const stock = { ...vehicles };
  for (const [key, spec] of Object.entries(vehicleCatalog)) {
    registerVehicle(vehicles, key, spec, stock[spec.base ?? key] ?? stock.Roadster);
  }
}

export function registerVehicle(vehicles, key, spec, base) {
  const { radius, length, width, vector } = vehicleOptions(spec);
  vehicles[key] = {
    ...base,
    name: spec.title,
    gltf: spec,
    fallback: base,
    wheels: { ...base.wheels, radius, length, width, circumference: 2 * Math.PI * radius },
    metrics: { ...base.metrics, axleHeight: radius, headlightPos: vector(spec.headlight) },
    cameras: {
      ...base.cameras,
      Chase: { ...base.cameras.Chase, posOffset: [0, 0, length / 2] },
      ChaseFar: { ...base.cameras.ChaseFar, posOffset: [0, 0, length / 2] },
      FirstPerson: { ...base.cameras.FirstPerson, posOffset: [0, 0.74, length + 0.1], hideVehicle: true },
      Bonnet: { ...base.cameras.Bonnet, posOffset: [0, 0.40, length + 0.42], hideVehicle: true },
    },
  };
}

// Intended for personal copies: the selected file is never uploaded.
export async function importVehicle(file, preset) {
  if (!preset) throw new Error("Choose a vehicle preset");
  const scene = (await loader.parseAsync(await file.arrayBuffer(), "")).scene;
  const spec = { ...preset, scene };
  (await loadVehicle("./", spec)).dispose();
  return spec;
}
