import {
  Box3, Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh,
  Matrix4, MeshStandardMaterial, Quaternion, Vector3,
} from "three";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { wind } from "./graphics.js";

const up = new Vector3(0, 1, 0);
const bark = 0xbfc2b1;

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function limb(a, b, bottom, tip) {
  const direction = b.clone().sub(a);
  const m = new Matrix4().compose(
    a.clone().lerp(b, 0.5),
    new Quaternion().setFromUnitVectors(up, direction.clone().normalize()),
    new Vector3(1, 1, 1)
  );
  return new CylinderGeometry(tip, bottom, direction.length(), 6, 1).applyMatrix4(m);
}

function combine(parts) {
  const normalized = parts.map(g => {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(geo.attributes)) {
      if (!["position", "normal", "uv"].includes(key)) geo.deleteAttribute(key);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    return geo;
  });
  const combined = mergeBufferGeometries(normalized);
  for (const geo of new Set([...parts, ...normalized])) geo.dispose();
  if (!combined) throw new Error("Could not merge tree geometry");
  return combined;
}

function procedural() {
  const random = seeded(4235);
  const root = new Vector3(0, 0, 0);
  const mid = new Vector3(0.16, 4.15, -0.08);
  const tip = new Vector3(-0.34, 7.55, 0.17);
  const branches = [limb(root, mid, 0.16, 0.096), limb(mid, tip, 0.096, 0.024)];
  const leaves = [[], [], []];
  for (let i = 0; i < 14; i++) {
    const h = 2.5 + i * 0.34;
    const base = h < 4.15 ? root.clone().lerp(mid, h / 4.15) : mid.clone().lerp(tip, (h - 4.15) / 3.4);
    const angle = i * 2.4 + random() * 0.27;
    const spread = (1.96 - i * 0.085) * (0.82 + random() * 0.22);
    const end = base.clone().add(new Vector3(Math.cos(angle) * spread, 0.85, Math.sin(angle) * spread));
    branches.push(limb(base, end, 0.047 - i * 0.002, 0.008));
    for (let j = 0; j < 3; j++) {
      const leaf = new IcosahedronGeometry(1, 1);
      const size = (0.56 + random() * 0.28) * (1 - i * 0.024);
      const pt = base.clone().lerp(end, 0.62 + j * 0.18);
      leaf.scale(size * 1.5, size * 0.8, size);
      leaf.rotateY(angle + j * 0.6);
      leaf.translate(pt.x, pt.y + 0.18 + random() * 0.25, pt.z);
      leaves[j].push(leaf);
    }
  }
  return [
    { geometry: combine(branches), material: new MeshStandardMaterial({ color: bark, roughness: 0.94 }), leaves: false, bark: true },
    ...leaves.map((group, i) => ({
      geometry: combine(group),
      material: new MeshStandardMaterial({ color: [0x739d40, 0x537f37, 0x8ea853][i], roughness: 0.82, flatShading: true }),
      leaves: true, tint: i,
    })),
  ];
}

function animate(part) {
  const { material, leaves, bark } = part;
  material.onBeforeCompile = shader => {
    shader.uniforms.srWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float srWind;\nvarying vec3 srBirchLocal;")
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        srBirchLocal = position;
        vec3 root = (modelMatrix * instanceMatrix[3]).xyz;
        float a = smoothstep(0.0, 8.0, position.y);
        float phase = dot(root.xz, vec2(0.046, 0.077));
        transformed.xz += a*a * (0.26 * sin(srWind * 1.7 + phase)
          + 0.08 * sin(srWind * 3.15 + phase * 2.0)) * vec2(0.85, 0.32);
        ${leaves ? `
          float flutter = sin(srWind * 6.5 + phase + dot(position, vec3(1.9, 2.7, 3.4)));
          transformed.xz += 0.10 * a * flutter * vec2(0.65, -0.9);
          transformed.y += 0.034 * a * flutter;
        ` : ""}
      `);
    if (bark) shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 srBirchLocal;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        float stripe = sin(srBirchLocal.y * 35.0 + sin(srBirchLocal.z * 14.0) * 2.0);
        float spots = sin(srBirchLocal.x * 24.0 + srBirchLocal.z * 18.0 + srBirchLocal.y * 11.0);
        diffuseColor.rgb *= mix(1.0, 0.27, smoothstep(0.71, 0.94, stripe) * smoothstep(-0.33, 0.49, spots));
      `);
  };
  material.customProgramCacheKey = () => `srBirch-${Number(leaves)}-${Number(!!bark)}`;
}

export class BirchLayer {
  constructor(scene, lowPower) {
    this.container = new Group();
    this.container.name = "Animated 3D birches";
    scene.add(this.container);
    this.limit = lowPower ? 12 : 28;
    this.range = lowPower ? 39 : 64;
    this.current = [];
    this.lastTime = -1;
    this.install(procedural());
  }
  install(parts) {
    this.restore();
    for (const mesh of [...this.container.children]) {
      this.container.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
    }
    this.parts = parts;
    for (const part of parts) {
      animate(part);
      const mesh = new InstancedMesh(part.geometry, part.material, this.limit);
      mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true;
      this.container.add(mesh);
    }
    this.lastTime = -1;
  }
  restore() {
    for (const { mesh, index, value } of this.current) {
      // Instance pools can recycle a group between passes.
      if (mesh.instanceVariant?.array[index] === -10) {
        mesh.instanceVariant.array[index] = value;
        mesh.instanceVariant.needsUpdate = true;
      }
    }
    this.current.length = 0;
  }
  update(time, location, groups, sceneName, season) {
    if (time >= this.lastTime && time - this.lastTime < 0.24) return;
    this.lastTime = time;
    this.restore();
    const matrix = new Matrix4(), world = new Matrix4(), position = new Vector3();
    const candidates = [];
    if (sceneName === "Hills" && season !== "winter") for (const { mesh } of groups) {
      if (!mesh.visible || !mesh.instanceVariant) continue;
      mesh.updateWorldMatrix(true, false);
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        world.multiplyMatrices(mesh.matrixWorld, matrix);
        position.setFromMatrixPosition(world);
        const d = position.distanceToSquared(location);
        // Preserve the established mixed woodland and keep 3D vegetation near the road.
        const pattern = Math.abs(Math.floor(position.x * 17 + position.z * 23));
        if (d > this.range * this.range || (pattern % 4 !== 0 && d > 25 * 25)) continue;
        candidates.push({ mesh, index, matrix: world.clone(), d });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    const selected = candidates.slice(0, this.limit);
    for (const [index, candidate] of selected.entries()) {
      const { mesh, index: source } = candidate;
      this.current.push({ mesh, index: source, value: mesh.instanceVariant.array[source] });
      mesh.instanceVariant.array[source] = -10;
      mesh.instanceVariant.needsUpdate = true;
      for (const tree of this.container.children) tree.setMatrixAt(index, candidate.matrix);
    }
    for (const [i, mesh] of this.container.children.entries()) {
      mesh.count = selected.length;
      mesh.instanceMatrix.needsUpdate = true;
      const part = this.parts[i];
      if (part.tint !== undefined) {
        mesh.material.color.set((season === "autumn" ? [0xd79d3e, 0xb1762f, 0xd7b34c] : [0x739d40, 0x537f37, 0x8ea853])[part.tint]);
      }
    }
  }
  async importTree(file, preset) {
    const scene = (await new GLTFLoader().parseAsync(await file.arrayBuffer(), "")).scene;
    scene.updateMatrixWorld(true);
    const p = preset === "stylizedBirch" ? scene.getObjectByName("Birch-421_3") : scene;
    if (!p) throw new Error("The selected file does not match the tree preset");
    const box = new Box3().setFromObject(p);
    const h = box.max.y - box.min.y;
    if (!Number.isFinite(h) || h < 0.01) throw new Error("The file has no tree geometry");
    const s = 7.7 / h;
    const center = box.getCenter(new Vector3());
    const transform = new Matrix4().makeScale(s, s, s).setPosition(-center.x * s, -box.min.y * s, -center.z * s);
    const byMaterial = new Map();
    p.traverse(node => {
      if (!node.isMesh) return;
      const list = byMaterial.get(node.material) ?? [];
      const matrix = new Matrix4().multiplyMatrices(transform, node.matrixWorld);
      const geometry = node.geometry.clone().applyMatrix4(matrix);
      list.push(geometry); byMaterial.set(node.material, list);
    });
    if (!byMaterial.size) throw new Error("The file has no tree meshes");
    const parts = [...byMaterial].map(([original, group]) => {
      const material = original.clone();
      // Alpha cutouts avoid per-instance transparent object sorting.
      if (material.transparent) { material.transparent = false; material.alphaTest = 0.48; material.depthWrite = true; }
      return { geometry: combine(group), material, leaves: /Leaves|Material\.001/i.test(original.name) };
    });
    this.install(parts);
  }
}
