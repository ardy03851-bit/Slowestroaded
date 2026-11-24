export const touchDevice = () =>
  navigator.maxTouchPoints > 0 && (matchMedia("(any-pointer: coarse)").matches ||
    /iPad|iPhone|Android/i.test(navigator.userAgent) ||
    navigator.platform === "MacIntel");

const button = (text, className, click) => {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = text;
  if (click) el.addEventListener("click", click);
  return el;
};

function select(label, apply) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("select");
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => apply(input.value));
  wrapper.append(input);
  return [wrapper, input];
}

function options(input, entries, selected) {
  input.replaceChildren(...entries.map(([key, title]) => new Option(title, key)));
  input.value = selected;
}

export function attachControls(root, api) {
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const mobile = touchDevice();
  root.dataset.touch = String(mobile);
  document.documentElement.classList.toggle("sr-touch", mobile);
  const active = new Map();
  const clear = () => {
    for (const key of new Set(active.values())) api.hold(key, false);
    active.clear();
    for (const pedal of drive.children) pedal.classList.remove("pressed");
  };
  const drive = document.createElement("div");
  drive.className = "sr-drive";
  drive.setAttribute("aria-label", "Driving controls");
  for (const [label, key, description] of [
    ["◀", "KeyA", "Steer left"], ["▶", "KeyD", "Steer right"],
    ["Brake", "KeyS", "Brake or reverse"], ["Drive", "KeyW", "Accelerate"],
  ]) {
    const control = button(label, "sr-pedal");
    control.setAttribute("aria-label", description);
    control.dataset.key = key;
    control.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      if (api.hold(key, true) === false) return;
      active.set(e.pointerId, key);
      control.setPointerCapture(e.pointerId);
      control.classList.add("pressed");
    });
    const stop = e => {
      const held = active.get(e.pointerId);
      active.delete(e.pointerId);
      if (held && ![...active.values()].includes(held)) {
        api.hold(held, false);
        control.classList.remove("pressed");
      }
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) control.addEventListener(type, stop);
    drive.append(control);
  }
  const actions = document.createElement("div");
  actions.className = "sr-actions";
  for (const [text, code, description] of [
    ["Camera", "KeyC", "Change camera"], ["Lights", "KeyH", "Toggle headlights"],
    ["Auto", "KeyF", "Toggle autodrive"], ["Reset", "KeyR", "Reset vehicle"],
    ["Pause", "KeyP", "Pause or resume"],
  ]) {
    const el = button(text, "sr-tool", () => {
      if (code === "KeyP" || code === "KeyR") clear();
      api.command(code);
    });
    el.setAttribute("aria-label", description);
    el.dataset.action = code;
    actions.append(el);
  }
  const panel = document.createElement("section");
  panel.className = "sr-garage";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Garage and driving settings");
  const menu = button("Garage", "sr-tool sr-open", () => {
    clear();
    panel.hidden = !panel.hidden;
    menu.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) sync();
  });
  menu.setAttribute("aria-expanded", "false");
  actions.append(menu);
  const close = button("Close", "sr-tool sr-close", () => menu.click());
  const [vehicles, vehicle] = select("Vehicle", api.vehicle);
  const [scenes, scene] = select("Location", api.scene);
  const [seasons, season] = select("Season", api.season);
  const [weatherLabel, weather] = select("Weather", api.weather);
  const [roads, road] = select("Road", api.road);
  const [qualities, quality] = select("Render resolution", api.quality);
  const sync = () => {
    const s = api.options();
    options(vehicle, s.vehicles, s.vehicle);
    options(scene, s.scenes, s.scene);
    options(season, s.seasons, s.season);
    options(weather, s.weathers, s.weather);
    options(road, s.roads, s.road);
    options(quality, [["0", "Battery saver"], ["1", "Balanced"], ["2", "Native"], ["3", "Supersampled"]], s.quality);
  };
  for (const input of [scene, season]) input.addEventListener("change", sync);
  const local = document.createElement("details");
  const heading = document.createElement("summary");
  heading.textContent = "Import a local GLB";
  const [modelTypeLabel, modelType] = select("Model preset", () => {});
  options(modelType, [
    ["camaro", "Chevrolet Camaro"], ["teorema", "Pininfarina Teorema"],
    ["whiteBirch", "White Birch"], ["stylizedBirch", "Stylized Birch"],
  ], "camaro");
  const uploadLabel = document.createElement("label");
  uploadLabel.textContent = "Choose model file";
  const upload = document.createElement("input");
  upload.type = "file";
  upload.setAttribute("aria-label", "Choose model file");
  upload.accept = ".glb,model/gltf-binary";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  message.textContent = "The file stays in this tab. Nothing is uploaded.";
  upload.addEventListener("change", async () => {
    if (!upload.files[0]) return;
    upload.disabled = true;
    message.textContent = "Preparing model…";
    try {
      message.textContent = await api.importModel(upload.files[0], modelType.value);
      sync();
    } catch (e) {
      message.textContent = `Could not load the model: ${e.message}`;
    } finally { upload.value = ""; upload.disabled = false; }
  });
  uploadLabel.append(upload);
  local.append(heading, modelTypeLabel, uploadLabel, message);
  panel.append(close, vehicles, scenes, seasons, weatherLabel, roads, qualities, local);
  root.append(drive, actions, panel);
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  window.addEventListener("orientationchange", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  root.addEventListener("contextmenu", e => e.preventDefault());
}
