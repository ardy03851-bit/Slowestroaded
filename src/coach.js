import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from "three";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const coat = new MeshStandardMaterial({ color: 0xc4c9c5, metalness: .22, roughness: .36, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
const rubber = new MeshStandardMaterial({ color: 0x172024, roughness: .86, side: DoubleSide });
const glass = new MeshStandardMaterial({ color: 0x30474e, metalness: .30, roughness: .25, side: DoubleSide });
const handle = new MeshStandardMaterial({ color: 0xaebcc2, metalness: .53, roughness: .24, side: DoubleSide });
const molding = new MeshStandardMaterial({ color: 0x767f80, metalness: .36, roughness: .48, side: DoubleSide });
const seam = new MeshStandardMaterial({ color: 0x485458, metalness: .20, roughness: .70, side: DoubleSide });
const skyTint = new MeshStandardMaterial({ color: 0x455c63, metalness: .18, roughness: .34, side: DoubleSide });
let template;

export function coachDoors(body) {
  if (template) {
    const kit = template.clone();
    body.add(kit);
    return kit;
  }
  const shell = body.children.filter(mesh => mesh.isMesh && /_body_|_window_|_black_/.test(mesh.name));
  const kit = new Group();
  kit.name = "Coach door assemblies";
  if (!shell.length) return kit;
  body.updateMatrixWorld(true);
  const ray = new Raycaster();
  const batches = new Map();
  const panelVertexCounts = kit.userData.panelVertexCounts = {};
  function panel(name, material, side, x0, x1, y0, y1, lift) {
    const p = [];
    const nx = Math.max(2, Math.ceil((x1-x0)*13));
    const ny = Math.max(2, Math.ceil((y1-y0)*13));
    const samples = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1-x0)*i/nx, y = y0 + (y1-y0)*j/ny;
      ray.set(new Vector3(x,y,side*3), new Vector3(0,0,-side));
      const hit = ray.intersectObjects(shell, false)[0];
      samples.push(hit && hit.point.z * side > .72 ? [x,y,hit.point.z+side*lift] : null);
    }
    const stride = nx+1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const index = i+j*stride;
      const a = samples[index], b = samples[index+1], c = samples[index+stride], d = samples[index+stride+1];
      if (a && b && c && d) p.push(...a,...b,...c,...b,...d,...c);
    }
    if (!p.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(p,3));
    geo.computeVertexNormals();
    panelVertexCounts[name] = p.length / 3;
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geo);
  }
  function doorway(label, side, x, width, split) {
    panel(`${label} seal`, rubber, side, x, x+width, .65, 2.54, .014);
    panel(`${label} paint`, coat, side, x+.035, x+width-.035, .703, 2.507, .024);
    panel(`${label} glass gasket`, rubber, side, x+.09, x+width-.09, 1.48, 2.43, .034);
    panel(`${label} glazing`, glass, side, x+.112, x+width-.112, 1.503, 2.401, .047);
    panel(`${label} step`, rubber, side, x+.05, x+width-.05, .742, .795, .045);
    panel(`${label} handle mount`, rubber, side, x+width-.251, x+width-.083, 1.288, 1.379, .049);
    panel(`${label} handle`, handle, side, x+width-.226, x+width-.105, 1.309, 1.356, .060);
    if (split) panel(`${label} split`, rubber, side, x+width*.5-.018, x+width*.5+.018, .716, 2.49, .055);
  }
  doorway("Passenger entry", -1, 5.87, 1.01, true);
  doorway("Driver entry", 1, 5.81, .84, false);
  doorway("Emergency exit", -1, .47, .81, false);
  for (const side of [-1, 1]) {
    const windows = side < 0
      ? [[-1.77,.31],[1.42,2.63],[2.73,4.09],[4.19,5.74]]
      : [[-1.77,-.12],[-.02,1.72],[1.82,3.68],[3.78,5.69]];
    for (const [i, [x0, x1]] of windows.entries()) {
      panel(`Side ${side} window ${i+1} frame`, molding, side, x0, x1, 1.98, 2.52, .016);
      panel(`Side ${side} window ${i+1} gasket`, rubber, side, x0+.016, x1-.016, 1.994, 2.506, .022);
      panel(`Side ${side} window ${i+1}`, glass, side, x0+.041, x1-.041, 2.021, 2.478, .030);
      panel(`Side ${side} window ${i+1} upper reflection`, skyTint, side, x0+.053, x1-.053, 2.435, 2.462, .034);
    }
    for (const [x0,x1] of [[1.48,2.61],[2.68,3.82],[3.89,5.01]]) {
      panel("Luggage door top seam", seam, side, x0, x1, 1.21, 1.228, .013);
      panel("Luggage door bottom seam", seam, side, x0, x1, .65, .666, .013);
      panel("Luggage door front seam", seam, side, x0, x0+.016, .65, 1.21, .013);
      panel("Luggage door rear seam", seam, side, x1-.016, x1, .65, 1.21, .013);
      panel("Luggage latch", molding, side, (x0+x1)*.5-.077, (x0+x1)*.5+.077, 1.136, 1.17, .025);
    }
  }
  for (const [material, panels] of batches) {
    kit.add(new Mesh(mergeBufferGeometries(panels), material));
    for (const panel of panels) panel.dispose();
  }
  if (kit.children.length) template = kit;
  body.add(kit);
  return kit;
}
