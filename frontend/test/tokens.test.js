import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contrast, deltaE, simulate, VISIONS, worstPair } from './color.js';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/g)].map(([, name, value]) => [name, value]));
const SURFACES = ['bg-0', 'bg-1', 'bg-2'];
const pick = (...names) => Object.fromEntries(names.map((name) => [name, tokens[name]]));

test('the tokens parse', () => {
  const required = [...SURFACES, 'bg-globe', 'border-subtle', 'border-control', 'text-1', 'text-2', 'text-3', 'text-on-accent',
    'accent', 'accent-hover', 'link', 'data-l3', 'data-l7', 'data-reported', 'data-flagged', 'sev-normal', 'sev-elevated',
    'sev-spike', 'sev-unavailable', 'map-land', 'map-grid', 'focus'];
  for (const name of required) assert.match(tokens[name] ?? '', /^#[0-9a-f]{6}$/, `missing or malformed --${name}`);
});

test('text, accent and link pass WCAG AA (4.5:1) on every surface', () => {
  for (const name of ['text-1', 'text-2', 'text-3', 'accent', 'accent-hover', 'link']) {
    for (const surface of SURFACES) assert.ok(contrast(tokens[name], tokens[surface]) >= 4.5, `${name} on ${surface}`);
  }
  assert.ok(contrast(tokens['text-on-accent'], tokens.accent) >= 4.5, 'text on an accent fill');
});

test('severity colours carry text, so they pass 4.5:1 too', () => {
  for (const name of ['sev-normal', 'sev-elevated', 'sev-spike', 'sev-unavailable']) {
    for (const surface of SURFACES) assert.ok(contrast(tokens[name], tokens[surface]) >= 4.5, `${name} on ${surface}`);
  }
});

test('data colours, control edges and the focus ring pass the 3:1 non-text rule on every surface', () => {
  for (const name of ['data-l3', 'data-l7', 'data-reported', 'data-flagged', 'border-control', 'focus']) {
    for (const surface of SURFACES) assert.ok(contrast(tokens[name], tokens[surface]) >= 3, `${name} on ${surface}`);
  }
  assert.ok(contrast(tokens['map-land'], tokens['bg-globe']) >= 3, 'coastline on the globe');
});

test('the data palette stays separable under protanopia, deuteranopia and tritanopia', () => {
  const worst = worstPair(pick('data-l3', 'data-l7', 'data-reported', 'data-flagged'));
  assert.ok(worst.delta >= 15, `${worst.pair} is only dE ${worst.delta.toFixed(1)} under ${worst.vision}`);
});

test('so does the severity scale', () => {
  const worst = worstPair(pick('sev-normal', 'sev-elevated', 'sev-spike'));
  assert.ok(worst.delta >= 15, `${worst.pair} is only dE ${worst.delta.toFixed(1)} under ${worst.vision}`);
});

test('the checker itself: known pairs behave as they should', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.equal(deltaE('#336699', '#336699'), 0);
  assert.ok(deltaE('#ff0000', '#00ff00') > 50);
  // green and red really do collapse under deuteranopia, which is why severity avoids that pair
  assert.ok(deltaE(simulate('#3ddc97', 'deuteranopia'), simulate('#ff7b72', 'deuteranopia')) < 10);
  assert.deepEqual(VISIONS, ['normal', 'protanopia', 'deuteranopia', 'tritanopia']);
});

test('no component stylesheet uses a raw colour: everything goes through the tokens', () => {
  const dir = new URL('../src/styles/', import.meta.url);
  const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
  const checked = readdirSync(dir).filter((name) => name.endsWith('.css') && name !== 'tokens.css');
  assert.ok(checked.length >= 2, 'found the stylesheets');
  for (const name of checked) {
    const lines = readFileSync(new URL(name, dir), 'utf8').split('\n');
    lines.forEach((line, i) => assert.ok(!raw.test(line), `${name}:${i + 1} has a raw colour: ${line.trim()}`));
  }
});
