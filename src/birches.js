import {
  Box3, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh,
  Matrix4, MeshStandardMaterial, Quaternion, Vector3,
} from "three";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyWind } from "./graphics.js";

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
  const trunk = bottom > .07;
  return new CylinderGeometry(tip, bottom, direction.length(), trunk ? 7 : 4, 1, !trunk).applyMatrix4(m);
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
  const leaves = [], colors = [], anchors = [];
  const palette = [0x768d44, 0x558044, 0xa0ac61, 0x769750].map(hex => new Color(hex));
  const u = new Vector3(), v = new Vector3(), w = new Vector3();
  const profile = [[0,-1],[-.84,-.20],[-.58,.59],[0,1],[.58,.59],[.84,-.20]];
  for (let i = 0; i < 19; i++) {
    const h = 2.37 + i * .265;
    const base = h < 4.15 ? root.clone().lerp(mid, h / 4.15) : mid.clone().lerp(tip, (h - 4.15) / 3.4);
    const angle = i * 2.4 + random() * 0.27;
    const spread = (2.2 - i * 0.084) * (0.77 + random() * 0.32);
    const end = base.clone().add(new Vector3(Math.cos(angle) * spread, 0.85, Math.sin(angle) * spread));
    branches.push(limb(base, end, 0.047 - i * 0.002, 0.008));
    for (let j = 0; j < 5; j++) {
      const fork = base.clone().lerp(end, .45 + j * .132);
      const forkAngle = angle + (j % 2 ? -.94 : 1.18);
      const l = (.70 - j * .056) * (1 - i * .025);
      const twig = fork.clone().add(new Vector3(Math.cos(forkAngle)*l, .49 + .14 * random(), Math.sin(forkAngle)*l));
      branches.push(limb(fork, twig, .011 - i*.00027, .0026));
      for (let k = 0; k < 10; k++) {
        const center = fork.clone().lerp(twig, .19 + random() * 1.05);
        center.add(new Vector3((random()-.5)*.85, (random()-.35)*.63, (random()-.5)*.85));
        const a = random() * Math.PI * 2, length = .095 + .125 * random();
        const span = length * (.61 + .28 * random());
        u.set(Math.cos(a), .38 * (random()-.5), Math.sin(a)).normalize();
        v.set(-Math.sin(a), (random()-.42)*2.1, Math.cos(a)).normalize();
        w.crossVectors(u, v).normalize();
        const color = palette[Math.floor(random()*palette.length)];
        function vertex(p, q, fold) {
          leaves.push(center.x + u.x*p*span + v.x*q*length + w.x*fold,
            center.y + u.y*p*span + v.y*q*length + w.y*fold,
            center.z + u.z*p*span + v.z*q*length + w.z*fold);
          anchors.push(center.x, center.y, center.z);
          colors.push(color.r, color.g, color.b);
        }
        for (let k = 1; k < profile.length - 1; k++) {
          vertex(...profile[0], .011);
          vertex(...profile[k], k === 3 ? .02 : 0);
          vertex(...profile[k+1], k === 2 ? .02 : 0);
        }
      }
    }
  }
  const canopy = new BufferGeometry();
  canopy.setAttribute("position", new Float32BufferAttribute(leaves, 3));
  canopy.setAttribute("color", new Float32BufferAttribute(colors, 3));
  canopy.setAttribute("srLeaf", new Float32BufferAttribute(anchors, 3));
  canopy.computeVertexNormals();
  return [
    { geometry: combine(branches), material: new MeshStandardMaterial({ color: bark, roughness: 0.94 }), leaves: false, bark: true },
    { geometry: canopy, material: new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide,
      roughness: .83, emissive: 0x1e290d, emissiveIntensity: .13 }), leaves: true, pivot: true },
  ];
}

function animate(part) {
  const { material, leaves, bark, pivot } = part;
  material.onBeforeCompile = shader => {
    applyWind(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 srBirchLocal;\n${pivot ? "attribute vec3 srLeaf;" : ""}`)
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        srBirchLocal = position;
        vec3 root = (modelMatrix * instanceMatrix[3]).xyz;
        vec3 anchor = ${pivot ? "srLeaf" : "position"};
        float a = clamp(anchor.y / 7.55, 0.0, 1.0);
        transformed.xz += srLocalWind(root, a) * .76;
        ${leaves ? `
          float flutter = sin(srWind * 7.1 + dot(root.xz,vec2(.22,.36)) + dot(anchor,vec3(6.5,2.7,5.1)));
          transformed.xz += .052 * a * flutter * vec2(.65,-.9);
          transformed.y += .022 * a * flutter;
          ${pivot ? "transformed.y += (position.x-anchor.x+position.z-anchor.z)*flutter*.54*srWindStrength;" : ""}
        ` : ""}
      `);
    if (bark) shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 srBirchLocal;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        float stripe = sin(srBirchLocal.y * 39.0 + sin(srBirchLocal.z * 23.0) * 2.0);
        float spots = sin(srBirchLocal.x * 24.0 + srBirchLocal.z * 18.0 + srBirchLocal.y * 11.0);
        diffuseColor.rgb *= mix(1.0, 0.27, smoothstep(0.71, 0.94, stripe) * smoothstep(-0.33, 0.49, spots));
      `);
  };
  material.customProgramCacheKey = () => `srBirch-${Number(leaves)}-${Number(!!bark)}-${Number(!!pivot)}`;
}

export function roadsideTrees(node, heightAt, clearAt, lowPower) {
  const out = [];
  if (!node) return out;
  let start = node;
  for (let i = 0; i < 4 && start.prev; i++) start = start.prev;
  for (let i = 0, n = start; n && i < (lowPower ? 11 : 16); n = n.next, i++) {
    if (!n.n || !n.next || !Number.isFinite(n.i)) continue;
    const rand = seeded(Math.imul(n.i + 131, 387421));
    for (const side of [-1, 1]) {
      if ((n.i + (side < 0 ? 0 : 2)) % 3 === 1) continue;
      const setback = 9.5 + rand() * 15;
      const advance = rand() * 4.5 - 2.2;
      const x = n.p.x + n.n.x * side * setback - n.n.z * advance;
      const z = n.p.z + n.n.z * side * setback + n.n.x * advance;
      if (!clearAt(x, z, n)) continue;
      const y = heightAt(x,z);
      if (!Number.isFinite(y) || y < 1.1 || Math.abs(y - n.p.y) > 11 ||
          Math.abs(heightAt(x+1,z) - y) > .64 || Math.abs(heightAt(x,z+1) - y) > .64) continue;
      const scale = .74 + rand()*.51;
      const matrix = new Matrix4().makeRotationY(rand() * Math.PI * 2).scale(
        new Vector3(scale * (.86 + rand()*.24), scale, scale * (.88 + rand()*.24)));
      matrix.setPosition(x, y-.11, z);
      out.push(matrix);
    }
  }
  return out;
}

export class BirchLayer {
  constructor(scene, lowPower) {
    this.container = new Group();
    this.container.name = "Animated 3D birches";
    scene.add(this.container);
    this.limit = lowPower ? 16 : 34;
    this.range = lowPower ? 62 : 91;
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
  update(time, location, groups, sceneName, season, supplemental = () => []) {
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
        if (d > this.range * this.range || (pattern % 3 !== 0 && d > 27 * 27)) continue;
        candidates.push({ mesh, index, matrix: world.clone(), d });
      }
    }
    if (sceneName === "Hills") for (const matrix of supplemental()) {
      position.setFromMatrixPosition(matrix);
      const d = position.distanceToSquared(location);
      if (d > this.range * this.range || candidates.some(other => {
        const m = other.matrix.elements;
        return (m[12]-position.x)**2 + (m[14]-position.z)**2 < 19;
      })) continue;
      candidates.push({ matrix, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    const selected = candidates.slice(0, this.limit);
    for (const [index, candidate] of selected.entries()) {
      const { mesh, index: source } = candidate;
      if (mesh) {
        this.current.push({ mesh, index: source, value: mesh.instanceVariant.array[source] });
        mesh.instanceVariant.array[source] = -10;
        mesh.instanceVariant.needsUpdate = true;
      }
      for (const tree of this.container.children) tree.setMatrixAt(index, candidate.matrix);
    }
    for (const [i, mesh] of this.container.children.entries()) {
      mesh.count = selected.length;
      mesh.instanceMatrix.needsUpdate = true;
      const part = this.parts[i];
      mesh.visible = !part.leaves || season !== "winter";
      if (part.pivot) mesh.material.color.set(season === "autumn" ? 0xffb34d : 0xffffff);
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
