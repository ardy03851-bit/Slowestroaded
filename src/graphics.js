import { PCFSoftShadowMap } from "three";

export const wind = { value: 0 };
const strength = { value: 0.72 };
const conditions = { value: [1, 0, 0] }; // Hills, rain, winter
export function climate(scene, season, weather, dt) {
  const state = conditions.value;
  state[0] = Number(scene === "Hills");
  state[2] = Number(season === "winter");
  const rainy = /rain|storm|shower/i.test(weather);
  state[1] += (Number(rainy) - state[1]) * Math.min(1, Math.max(0, dt) * 2);
  strength.value = 0.72 + state[1] * 0.82;
}

export function softShadows(renderer) {
  renderer.shadowMap.type = PCFSoftShadowMap;
}

export function atmosphere(sky, sun) {
  const base = sky.onBeforeCompile;
  const daylight = { value: 1 };
  sky.onBeforeRender = () => { daylight.value = sun.intensity; };
  sky.onBeforeCompile = (shader) => {
    base.call(sky, shader);
    Object.assign(shader.uniforms, {
      srSun: { value: sun.sunOffset }, srDaylight: daylight, srSkyClimate: conditions,
    });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 srSkyRay;")
      .replace("#include <project_vertex>", "srSkyRay = wPos.xyz - cameraPosition;\n#include <project_vertex>");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec3 srSkyRay;
      uniform vec3 srSun;
      uniform vec3 srSkyClimate;
      uniform float srDaylight;
    `).replace("#include <fog_fragment>", `
      vec3 srRay = normalize(srSkyRay);
      float srAltitude = max(0., srRay.y);
      float srClearSky = srSkyClimate.x * (1.0 - .94 * srSkyClimate.y) * clamp(srDaylight * 2.1, 0., 1.);
      float srSkyBlend = smoothstep(.05,.78,srAltitude);
      vec3 srSkyTint = mix(vec3(.95,1.01,1.03),vec3(.55,.79,1.02),srSkyBlend);
      float srSunDot = clamp(dot(srRay,normalize(srSun)),0.,1.);
      gl_FragColor.rgb *= mix(vec3(1.),srSkyTint,srClearSky*.57);
      gl_FragColor.rgb += vec3(1.,.82,.59) * srClearSky * (.12*pow(srSunDot,32.) + .47*pow(srSunDot,2100.));
      #include <fog_fragment>
    `);
  };
  sky.customProgramCacheKey = () => "sr-daylight-atmosphere";
}

export const windCode = `
  uniform float srWind;
  uniform float srWindStrength;
  vec2 srLocalWind(vec3 root, float height) {
    float wave = sin(dot(root.xz, vec2(.088,.062)) - srWind * 1.52);
    float fronts = sin(dot(root.xz, vec2(.028,.034)) - srWind * .69);
    float gust = .15 + .62 * pow(.5 + .5 * fronts, 2.0) + .18 * wave;
    vec2 heading = normalize(vec2(.84, .54 + .21 * sin(srWind * .43)));
    vec3 axisX = normalize((modelMatrix * instanceMatrix[0]).xyz);
    vec3 axisZ = normalize((modelMatrix * instanceMatrix[2]).xyz);
    vec2 bend = vec2(dot(axisX.xz, heading), dot(axisZ.xz, heading));
    return bend * srWindStrength * gust * height * height;
  }
`;

export function applyWind(shader) {
  shader.uniforms.srWind = wind;
  shader.uniforms.srWindStrength = strength;
  shader.vertexShader = shader.vertexShader.replace("#include <common>",
    `#include <common>\n#ifdef USE_INSTANCING\n${windCode}\n#endif`);
}

export function legacyWind(shader) {
  applyWind(shader);
  shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
    #if defined(USE_INSTANCING) && (defined(GRASS) || defined(BUSH) || defined(TREES))
      vec3 windRoot = (modelMatrix * instanceMatrix[3]).xyz;
      float ripple = sin(srWind * 5.3 + dot(windRoot.xz, vec2(.32, -.14)) + position.y * 4.0);
      #ifdef TREES
        float bend = clamp(position.y / 7.0, 0.0, 1.0);
        transformed.xz += srLocalWind(windRoot, bend) * .60;
        transformed.x += .05 * bend * bend * ripple;
        if (variant < -8.0) transformed = vec3(0.0);
      #else
        float bend = clamp(position.y / 1.15, 0.0, 1.0);
        vec2 sway = srLocalWind(windRoot, bend) * .34;
        transformed.xz += sway + vec2(.05, -.025) * bend * bend * ripple;
        transformed.y -= length(sway) * .17;
      #endif
    #endif
    #include <project_vertex>
  `);
}

function surface(material, maps, road) {
  const existing = material.onBeforeCompile;
  material.roughness = road ? .88 : .94;
  material.metalness = 0;
  material.onBeforeCompile = shader => {
    existing.call(material, shader);
    Object.assign(shader.uniforms, maps, { srClimate: conditions });
    shader.vertexShader = shader.vertexShader.replace("#include <common>",
      "#include <common>\nvarying vec2 srXZ;")
      .replace("#include <project_vertex>", `
        srXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
        #include <project_vertex>
      `).replace("texture2D( displacementMap, vUv ).x * steepness * 1.25",
        "(texture2D( displacementMap, vUv ).x - 0.42) * steepness * 0.16");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec2 srXZ;
      uniform vec3 srClimate;
      uniform sampler2D srAColor;
      uniform sampler2D srAPacked;
      ${road ? "" : "uniform sampler2D srBColor; uniform sampler2D srBPacked;"}
      vec3 srNormal(vec3 n, vec2 sampleXY, float amount) {
        vec3 x = (viewMatrix * vec4(1.,0.,0.,0.)).xyz;
        vec3 z = (viewMatrix * vec4(0.,0.,1.,0.)).xyz;
        vec3 a = x - n * dot(x,n), b = z - n * dot(z,n);
        return normalize(n + amount * (a * sampleXY.x + b * sampleXY.y));
      }
    `).replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      float srDistance = length(vViewPosition);
      float srNear = srClimate.x * (1.0 - smoothstep(${road ? "29.0, 93.0" : "24.0, 99.0"}, srDistance));
      vec2 srUV = srXZ * ${road ? "0.37" : "0.27"};
      vec4 srPBR = vec4(.5,.5,1.,.5);
      if(srNear > 0.001) {
        srPBR = texture2D(srAPacked, srUV);
        vec3 srPhoto = texture2D(srAColor, srUV).rgb;
        ${road ? `
          float srPavement = 1.0 - smoothstep(.57,.76,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));
          float coarse = sin(dot(srXZ, vec2(.16,.073))) * sin(dot(srXZ,vec2(-.21,.18)));
          diffuseColor.rgb *= 1.0 + srPavement * srNear * (.39 * (srPhoto.r - .27) + .05 * coarse + .09 * (srPBR.a - .5));
          diffuseColor.rgb *= 1.0 - srPavement * srClimate.y * .22;
          roughnessFactor = mix(roughnessFactor, mix(srPBR.b, .54, srClimate.y), srNear * srPavement * .92);
        ` : `
          float srCover = smoothstep(.55, 2.7, roadProx) * (1.0-smoothstep(.15,.8,steepness));
          srCover *= smoothstep(2.0, 7.0, height) * (1.-srClimate.z) * (1.-vTreeMask*.48);
          vec2 srSoilUV = mat2(.88,.47,-.47,.88) * srUV * 1.34 + vec2(.21,.39);
          vec4 srSoil = texture2D(srBPacked, srSoilUV);
          vec3 srSoilPhoto = texture2D(srBColor, srSoilUV).rgb;
          float macro = sin(dot(srXZ, vec2(.069,.045))) * sin(dot(srXZ,vec2(-.057,.078)));
          srCover = clamp(srCover + macro * .15 * srCover,0.,1.);
          srPBR = mix(srSoil, srPBR, srCover);
          vec3 srLand = mix(srSoilPhoto, srPhoto, srCover);
          float preserve = mix(.21, .42, srCover) * (1.-srClimate.z*.88) * smoothstep(.05,1.4,roadProx);
          diffuseColor.rgb = mix(diffuseColor.rgb, srLand * vec3(.89,.96,.85), srNear*preserve);
          diffuseColor.rgb *= ((1. + .15 * macro) - srClimate.y * .09) * mix(vec3(1.),vec3(.87,.93,.83),srCover*.65);
          diffuseColor.rgb *= 1. + srNear * .13 * (srPBR.a - .5);
          roughnessFactor = mix(roughnessFactor, mix(srPBR.b,.73,srClimate.y), srNear*.7);
        `}
      }
    `).replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      normal = srNormal(normal, (srPBR.rg -.5)*2.0, srNear * ${road ? ".26" : "mix(.27,.05,srClimate.z)"});
    `);
  };
  material.customProgramCacheKey = () => `sr-scan-${road ? "road" : "terrain"}`;
}

export function relief(terrain, road, texture) {
  const pair = (kind, letter) => ({
    [`sr${letter}Color`]: { value: texture(`${kind}-color.jpg`) },
    [`sr${letter}Packed`]: { value: texture(`${kind}-surface.png`) },
  });
  surface(terrain, { ...pair("grass", "A"), ...pair("earth", "B") }, false);
  surface(road, pair("asphalt", "A"), true);
}
