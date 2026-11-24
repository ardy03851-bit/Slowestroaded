import { touchDevice, attachControls } from "./touch-controls.js";
import { localPresets } from "./vehicle-catalog.js";
import { applyVehicleCatalog, importVehicle, loadVehicle, registerVehicle } from "./gltf-vehicles.js";
import { BirchLayer } from "./birches.js";
import { legacyWind, relief, wind } from "./graphics.js";

window.Slowroaded = {
  touchDevice, attachControls, localPresets, applyVehicleCatalog, importVehicle,
  loadVehicle, registerVehicle, BirchLayer, legacyWind, relief, wind,
};
