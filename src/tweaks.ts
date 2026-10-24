import GUI from "lil-gui";

/** Live-tunable numbers and mechanic switches. Saved in this browser, so a reload keeps them. */
export const tweaks = {
  deeperIsFaster: true,
  timeFactorPerTile: 1.1,
  refinerySecondsPerCoal: 5,
  refineryCostInCoal: 3,
  moveSpeed: 220,
  flyThrust: 400,
  fuelPerSecond: 25,
  mineCooldownMs: 200,
};

const defaults = { ...tweaks };
const storageKey = "event-miner-tweaks";

try {
  Object.assign(tweaks, JSON.parse(localStorage.getItem(storageKey) ?? "{}"));
} catch {
  // Blocked or broken storage: keep the defaults.
}

function save(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tweaks));
  } catch {
    // Blocked storage: the values still apply until reload.
  }
}

export function createTweaksPanel(): void {
  const gui = new GUI({ title: "Tweaks" });
  gui.add(tweaks, "deeperIsFaster").name("deeper is faster");
  gui.add(tweaks, "timeFactorPerTile", 1, 1.5, 0.01).name("time x per tile");
  gui.add(tweaks, "refinerySecondsPerCoal", 0.5, 30, 0.5).name("refinery s / coal");
  gui.add(tweaks, "refineryCostInCoal", 0, 20, 1).name("refinery cost");
  gui.add(tweaks, "moveSpeed", 50, 600, 10).name("move speed");
  gui.add(tweaks, "flyThrust", 100, 1000, 10).name("fly thrust");
  gui.add(tweaks, "fuelPerSecond", 0, 100, 1).name("fuel / s flying");
  gui.add(tweaks, "mineCooldownMs", 0, 1000, 10).name("mine cooldown ms");
  gui.add(
    {
      reset: () => {
        Object.assign(tweaks, defaults);
        gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
        save();
      },
    },
    "reset",
  );
  gui.onChange(save);
  gui.close();
}
