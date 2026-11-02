import { DEFAULT_CAMERA, type CameraSettings } from './camera';

const STORAGE_KEY = 'pocoman.camera';

interface Slider {
  key: keyof CameraSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: Slider[] = [
  { key: 'yaw', label: 'Yaw', min: -45, max: 45, step: 1, format: (v) => `${v}°` },
  { key: 'pitch', label: 'Pitch', min: 15, max: 90, step: 1, format: (v) => `${v}°` },
  { key: 'wallHeight', label: 'Wall height', min: 0.1, max: 1.5, step: 0.05, format: (v) => `${v.toFixed(2)} cells` },
];

function loadSettings(): CameraSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) return { ...DEFAULT_CAMERA, ...saved };
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return { ...DEFAULT_CAMERA };
}

function saveSettings(s: CameraSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not critical; the settings just won't survive a reload.
  }
}

export interface TuningPanel {
  settings: CameraSettings;
  visible: boolean;
}

/** Floating panel for tuning the camera live; hidden until switched on in Options. */
export function createTuningPanel(onChange: (s: CameraSettings) => void): TuningPanel {
  const settings = loadSettings();

  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; left: 16px; bottom: 40px; width: 240px; padding: 12px 14px;
    background: rgba(240, 220, 180, 0.94); color: #4a3420; border-radius: 8px;
    border: 2px solid rgba(138, 106, 64, 0.6); font: 13px Georgia, serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); user-select: none; z-index: 30; display: none;`;
  panel.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Camera</div>`;

  const readout = document.createElement('code');
  readout.style.cssText = 'display:block;margin-top:8px;font-size:11px;opacity:.8;white-space:pre-wrap';

  const inputs = new Map<keyof CameraSettings, HTMLInputElement>();
  const update = () => {
    readout.textContent = JSON.stringify(settings);
    saveSettings(settings);
    onChange({ ...settings });
  };

  for (const s of SLIDERS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin:6px 0';
    const value = document.createElement('span');
    value.style.float = 'right';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String(s.step);
    input.value = String(settings[s.key]);
    input.style.cssText = 'width:100%;accent-color:#8a6a40';
    // Arrow keys move the player; keep them away from a focused slider.
    input.addEventListener('keydown', (e) => e.preventDefault());
    input.addEventListener('input', () => {
      settings[s.key] = Number(input.value);
      value.textContent = s.format(settings[s.key]);
      update();
    });
    value.textContent = s.format(settings[s.key]);
    row.append(s.label, value, input);
    panel.appendChild(row);
    inputs.set(s.key, input);
  }

  const reset = document.createElement('button');
  reset.textContent = 'Reset to defaults';
  reset.style.cssText = 'margin-top:6px;font:12px Georgia,serif;cursor:pointer';
  reset.addEventListener('click', () => {
    Object.assign(settings, DEFAULT_CAMERA);
    for (const s of SLIDERS) inputs.get(s.key)!.value = String(settings[s.key]);
    panel.querySelectorAll('label span').forEach((el, i) => {
      el.textContent = SLIDERS[i].format(settings[SLIDERS[i].key]);
    });
    update();
    reset.blur();
  });

  panel.append(reset, readout);
  document.body.appendChild(panel);
  readout.textContent = JSON.stringify(settings);

  return {
    settings,
    get visible() {
      return panel.style.display !== 'none';
    },
    set visible(on: boolean) {
      panel.style.display = on ? '' : 'none';
    },
  };
}
