# Slowroaded

A static Slow Roads mod with a GLB vehicle catalog, PBR vehicle materials and scanned terrain surfaces, animated roadside woodland, and a touch driving layout. The original game bundle still owns terrain streaming, physics, cameras, audio, and save state; new features live in `src/`.

## Play

On a computer, use the existing keyboard controls. On iPad, hold Drive or Brake with your right thumb while steering with your left. Camera, Lights, Auto, Reset, and Pause are at the top. Garage lets you change vehicles, world, season, weather, road, and render resolution. If the game is slow, set render resolution to Battery saver.

The three concepts replace the stock Roadster, Lambo, and Supercar. The Quaternius Sports Car, Coach, and Bike remain available. To try one of your own copies of the Camaro, Teorema, White Birch, or Stylized Birch, open **Garage → Import a local GLB**, choose the matching preset, and select the original file. Models stay in the current tab and are not retained on reload. Imported trees replace the near 3D birch style in Hills; the distant woodland is unchanged.

## Build and test

```sh
npm ci
npm run build:mods
npm test
npx serve .
```

Run the site through a local HTTP server, not `file://`. GitHub Pages serves the checked-in root, so commit the generated `static/js/mods.v2.js` after changing anything in `src/`. The build does not overwrite the original webpack game. When changing the shipped runtime, also bump the script cache version in `index.html` if necessary.

## Add or replace a car

1. Export a self-contained `.glb` with `+Y` up, `+Z` forward, and wheels centered symmetrically along X. Give tires and rims distinctive node or material names. Give the lamps separate materials if you want independent headlight and brake emission.
2. Put redistributable runtime assets in `static/media/models/`. Optionally run `node tools/optimize-model.mjs input.glb static/media/models/my-car.glb`. The script is intended for these concept-car assets; inspect its culling thresholds before applying it to models at a different scale or origin.
3. Edit `src/vehicle-catalog.js`. To replace a vehicle, keep its catalog key. For a new entry, use a new key and set `base` to a supported vehicle key such as `Roadster` to inherit its driving behavior and OBJ fallback. Set `axle`, `scale`, light positions, and the node/material patterns for your model. Coordinates are measured in the original file before applying the scale. `axle.x` is half the track; `axle.y` is wheel-center height.
4. Build, run the tests, and check the model from the chase and side views. Verify grounding, all four wheels, steering, night lighting, brake emission, and car switching. If the GLB fails, the inherited OBJ remains driveable.

`src/graphics.js` blends scanned albedo, tangent normals, roughness, and height into the world-space terrain and road materials. Winter keeps its snow colors, rain darkens pavement and reduces its roughness, and fine detail fades at a distance. To repack the maps, put the ambientCG 1K JPG ZIPs in one folder and run `node tools/pack-surfaces.mjs <folder>`. The packed RGBA maps hold normal X/Y, roughness, and height in that order.

`src/birches.js` combines the original woodland placement with terrain-checked roadside trees independent of the billboard pool. The wind shader shares travelling gusts between grass, brush and trees; near leaves also bend around their own pivots. In winter the roadside birches are bare, and Offworld remains treeless. `src/coach.js` fits the door geometry to the original Coach shell without changing its handling.

## Asset credits and distribution

- **Scanned surfaces:** ambientCG [Grass 004](https://ambientcg.com/view?id=Grass004), [Ground 024](https://ambientcg.com/view?id=Ground024), and [Asphalt 002](https://ambientcg.com/view?id=Asphalt002), [CC0](https://docs.ambientcg.com/license/). The repository includes resized and channel-packed maps.
- **Vehicle reflections:** [Rural Asphalt Road](https://polyhaven.com/a/rural_asphalt_road) by Poly Haven, CC0.
- **Concept 006, 025 and 033:** [Concept 006](https://sketchfab.com/3d-models/free-concept-car-006-public-domain-cc0-a4e19bb6e6394c4a95d4319ef7d265ba), [Concept 025](https://sketchfab.com/3d-models/free-concept-car-025-public-domain-cc0-e3a65443d3e44c33b594cec591c01c05), and [Concept 033](https://sketchfab.com/3d-models/free-concept-car-033-public-domain-cc0-58f9d30f8e734de8ba05fa64e0e6584a) are offered under CC0 in their creator descriptions. The repository contains optimized copies. The public birches are generated in code.
- **Sports Car:** [Quaternius, via Poly Pizza](https://poly.pizza/m/1mkmFkAz5v), CC0.
- **Local-only presets:** [Camaro](https://sketchfab.com/3d-models/chevrolet-camaro-car-freee-0daac42293c6425682e98df2bf525108), [White Birch](https://sketchfab.com/3d-models/white-birch-de573241a1ba421889fb70c7bdd85ec3), and [Stylized Birch](https://sketchfab.com/3d-models/stylized-birch-tree-game-ready-low-poly-439ed34f4e604759965f5524126240fc) carry [Sketchfab distribution terms](https://sketchfab.com/licenses). The supplied [Teorema](https://sketchfab.com/3d-models/2021-pininfarina-teorema-concept-5e2ccdc012224de2bdb5f857b923fb01) embeds CC BY-NC-SA terms. None of these four original files is served by this repository.
