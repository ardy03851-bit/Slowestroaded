// Coordinates are in source-model space, with +Y up and +Z forward.
// An OBJ vehicle keeps working if its GLB is missing or cannot be decoded.
export const vehicleCatalog = {
  Roadster: {
    title: "Concept Roadster", file: "concept-025.glb", scale: 1.04,
    axle: { x: 0.895, y: 0.365, rear: -3.46, front: -0.95, ground: -0.008 },
    headlight: [0.47, 0.62, -0.36], tail: [0.69, 0.83, -3.84],
    wheelMaterials: /^(rubber___tires|tireProtector|brakeCalipers|metal_1|rims|chrome\.001)/i,
    heads: /^light$/, tails: /^taillights$/,
  },
  Lambo: {
    title: "Concept GT", file: "concept-006.glb", scale: 0.91,
    axle: { x: 0.98, y: 0.469, rear: -3.96, front: -1.10, ground: -0.002 },
    headlight: [0.65, 1.16, -0.4], tail: [0.70, 0.61, -4.73],
    wheelMaterials: /^(wheel_|Material\.010|brakedisk|Material\.04[235])/i,
    heads: /^(headlights|fog_lights)$/, tails: /^taillight_chrome$/, addRearLamps: true,
  },
  Supercar: {
    title: "Concept Supercar", file: "concept-033.glb", scale: 0.87,
    axle: { x: 0.79, y: 0.334, rear: -4.595, front: -0.955, ground: -0.01 },
    headlight: [0.60, 0.43, 0.04], tail: [0.68, 0.68, -5.01],
    wheelMaterials: /^(rubber___tires|tireProtector)/i,
    heads: /^Material\.001$/, tails: /^Material\.00[2345]$/,
  },
};

export const localPresets = {
  camaro: {
    title: "Camaro (local)", scale: 2.43,
    axle: { x: 0.33, y: -0.13, rear: -0.56, front: 0.61, ground: -0.28 },
    headlight: [0.27, 0.01, 0.89], tail: [0.27, 0.08, -0.93],
    wheelMaterials: /^tire$/,
    wheelNodes: /polySurface(?:5|33|35|37)_a_carbon/,
    heads: /headlight/, tails: /taillight/,
  },
  teorema: {
    title: "Teorema (local)", scale: 45,
    axle: { x: 0.017, y: 0.008, rear: -0.032, front: 0.034, ground: 0.0005 },
    headlight: [0.017, 0.012, 0.055], tail: [0.017, 0.015, -0.055],
    wheelNodes: /wheel(?:FL|FR|BL|BR)/, skipNodes: /motion|caliper/i,
    heads: /Glass_light/, tails: /^Emiss$/, addRearLamps: true,
  },
};

export function vehicleOptions(spec) {
  const { axle: a, scale: s, title } = spec;
  const radius = (a.y - a.ground) * s;
  const length = (a.front - a.rear) * s;
  const width = 2 * a.x * s;
  const vector = ([x, y, z]) => ({ x: x * s, y: (y - a.ground) * s, z: (z - a.rear) * s });
  return { title, radius, length, width, vector };
}
