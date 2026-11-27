// Colour maths for the design-system tests: WCAG contrast, colour-vision simulation, CIEDE2000.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function luminance(color) {
  const [r, g, b] = hex(color).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Machado, Oliveira and Fernandes 2009, severity 1.0, applied in linear RGB
const MATRICES = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export const VISIONS = ['normal', ...Object.keys(MATRICES)];

export function simulate(color, vision) {
  if (vision === 'normal') return color;
  const v = hex(color).map(toLinear);
  const out = MATRICES[vision].map((row) => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
  return `#${out.map((c) => Math.round(toGamma(c) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function lab(color) {
  const [r, g, b] = hex(color).map(toLinear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function deltaE(c1, c2) {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const mean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(mean ** 7 / (mean ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const hue = (y, x) => { const t = Math.atan2(y, x) * deg; return t < 0 ? t + 360 : t; };
  const h1 = C1 ? hue(b1, a1p) : 0;
  const h2 = C2 ? hue(b2, a2p) : 0;
  let dh = 0;
  if (C1 * C2) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2;
  const Cm = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Rc = 2 * Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7));
  const Rt = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad) * Rc;
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cm;
  const Sh = 1 + 0.015 * Cm * T;
  const dL = (L2 - L1) / Sl;
  const dC = (C2 - C1) / Sc;
  const dHs = dH / Sh;
  return Math.sqrt(dL ** 2 + dC ** 2 + dHs ** 2 + Rt * dC * dHs);
}

// The least distinguishable pair under normal vision and the three kinds of colour blindness
export function worstPair(palette) {
  const names = Object.keys(palette);
  let worst = { delta: Infinity };
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const vision of VISIONS) {
        const delta = deltaE(simulate(palette[names[i]], vision), simulate(palette[names[j]], vision));
        if (delta < worst.delta) worst = { delta, pair: `${names[i]} / ${names[j]}`, vision };
      }
    }
  }
  return worst;
}
