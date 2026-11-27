export const LAYER_KEYS = ['l3', 'l7'];

// Colours live in tokens.css. Canvas and WebGL code reads them from there so there is one source of truth.
export function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff';
}

export const layerColor = (layer) => cssColor(`--data-${layer}`);
