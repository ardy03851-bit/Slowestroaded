export const wind = { value: 0 };

export function legacyWind(shader) {
  shader.uniforms.srWind = wind;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>", "#include <common>\nuniform float srWind;"
  ).replace("#include <project_vertex>", `
    #if defined(USE_INSTANCING) && (defined(GRASS) || defined(BUSH) || defined(TREES))
      vec3 windRoot = (modelMatrix * instanceMatrix[3]).xyz;
      float gust = sin(srWind * 1.55 + dot(windRoot.xz, vec2(0.051, 0.084)));
      float flutter = sin(srWind * 4.6 + dot(windRoot.xz, vec2(-0.31, 0.17)) + position.y * 1.7);
      #ifdef TREES
        float bend = clamp(position.y / 8.0, 0.0, 1.0);
        transformed.xz += vec2(0.9, 0.32) * bend * bend * (gust * 0.29 + flutter * 0.11);
        if (variant < -8.0) transformed = vec3(0.0);
      #else
        float bend = clamp(position.y / 1.6, 0.0, 1.0);
        transformed.xz += vec2(0.85, 0.4) * bend * bend * (gust * 0.13 + flutter * 0.09);
      #endif
    #endif
    #include <project_vertex>
  `);
}

export function relief(terrain, road, texture) {
  road.bumpMap = texture("asphalt");
  road.bumpScale = 0.055;
  road.roughness = 0.86;
  terrain.roughness = 0.94;
  const existing = terrain.onBeforeCompile;
  const height = { value: texture("ground") };
  terrain.onBeforeCompile = shader => {
    existing(shader);
    shader.uniforms.srGroundHeight = height;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D srGroundHeight;")
      .replace("#include <normal_fragment_maps>", `
        #include <normal_fragment_maps>
        float srNear = 1.0 - smoothstep(18.0, 78.0, length(vViewPosition));
        float srH = texture2D(srGroundHeight, vUv * 4.0).r * srNear * 0.15;
        vec3 srDx = dFdx(-vViewPosition);
        vec3 srDy = dFdy(-vViewPosition);
        vec3 srR1 = cross(srDy, normal);
        vec3 srR2 = cross(normal, srDx);
        float srDet = dot(srDx, srR1);
        vec3 srDelta = sign(srDet) * (srR1 * dFdx(srH) + srR2 * dFdy(srH));
        if (abs(srDet) > 1e-6) normal = normalize(abs(srDet) * normal - srDelta);
      `);
  };
}
