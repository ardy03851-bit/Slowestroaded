import { touchDevice, attachControls } from "./touch-controls.js";
import { localPresets } from "./vehicle-catalog.js";
import { applyVehicleCatalog, importVehicle, loadVehicle, registerVehicle } from "./gltf-vehicles.js";
import { BirchLayer, roadsideTrees } from "./birches.js";
import { atmosphere, climate, legacyWind, relief, softShadows, wind } from "./graphics.js";
import { coachDoors } from "./coach.js";

window.Slowroaded = {
  touchDevice, attachControls, localPresets, applyVehicleCatalog, importVehicle,
  loadVehicle, registerVehicle, BirchLayer, roadsideTrees, legacyWind, relief, atmosphere, climate, softShadows, wind, coachDoors,
};
