# Design system

A dark, data-dense monitoring dashboard with a 3D globe. The tokens live in
[`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css), and
[`frontend/test/tokens.test.js`](../frontend/test/tokens.test.js) fails the build if a colour stops
meeting the numbers below.

## How it was made

Generated with UI/UX Pro Max 2.15.0 (`.claude/skills/ui-ux-pro-max`), then checked by maths instead
of taste.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "security monitoring dashboard dark data-dense 3D globe" \
  --design-system -p "Global DoS Attack Map" --density 8 --motion 3 --variance 2
```

The dials were density 8 (dense), motion 3 (subtle) and variance 2 (centered, minimal). Follow-up
searches covered dark styles, colour-blind-safe series, anomaly and streaming charts, reduced motion
and focus visibility, one concern per query.

### Where I deviated, and why

| The skill recommended | I did instead | Why |
|---|---|---|
| A light theme: Minimalism and Swiss, background `#F0FDF4`, green primary | Kept the dark theme and the coral accent | The brief asks for a dark monitoring dashboard, and the skill's own dark-mode style says light mode is not recommended for it. |
| Green `#16A34A` as the primary colour | Coral `#ff6b6b` stays the brand accent. Teal is used only for "normal" | Green against red collapses under deuteranopia (dE 8, measured below). |
| Fira Code and Fira Sans, loaded from Google Fonts | Fira first in the font stack, nothing downloaded | The CSP is `default-src 'self'`, a font request would tell Google about every visitor, and a self-hosted font is a new dependency for little gain. It applies wherever Fira is installed. |
| A scroll-reveal GSAP animation | None | A live dashboard should not animate content in. The only motion is the arcs and the pulse. |
| The App-UI checklist (safe areas, Dynamic Type, 44pt iOS and 48dp Android) | Used the web sections: Quick Reference 1 to 3, plus the checklist items that apply | Those are native-app rules. The 44px target is kept because the brief asks for it. WCAG 2.2 AA itself needs only 24px. |

## Colour roles

Contrast is WCAG 2.x, measured on the three surfaces: page `--bg-0` `#0e1012`, panel `--bg-1`
`#14171a` and raised `--bg-2` `#1c2024`. The surfaces are graphite, not navy, so the data colours on the globe are the only real colour on screen. Text needs 4.5:1, and everything else that carries meaning
needs 3:1.

| Token | Value | Page | Panel | Raised |
|---|---|---|---|---|
| `--text-1` | `#eef0f2` | 16.7 | 15.7 | 14.3 |
| `--text-2` | `#c2c7cd` | 11.2 | 10.6 | 9.6 |
| `--text-3` (muted, never smaller than 12px) | `#9ea4ac` | 7.6 | 7.2 | 6.5 |
| `--accent` (brand coral) | `#ff6b6b` | 6.9 | 6.5 | 5.9 |
| `--accent-hover` | `#ff8a8a` | 8.4 | 7.9 | 7.2 |
| `--link` | `#ff9b9b` | 9.5 | 8.9 | 8.1 |
| `--border-control` (edges of controls) | `#6b7179` | 3.9 | 3.7 | 3.3 |
| `--focus` (ring) | `#7cc8f2` | 10.4 | 9.8 | 8.9 |
| `--text-on-accent` on `--accent` | | 6.8 | | |
| `--map-land` on the globe core | | 5.0 | | |

`--border-subtle` (`#262a2f`, 1.3:1) is decoration only. A control's edge always uses
`--border-control`. Surfaces are solid colours, not translucent layers, so contrast is the same wherever
a panel sits.

## Data colours

| Token | Value | Page | Panel | Raised |
|---|---|---|---|---|
| `--data-l3` network layer | `#4fc3f7` | 9.5 | 8.9 | 8.1 |
| `--data-l7` application layer | `#e69f00` | 8.4 | 7.9 | 7.2 |
| `--data-reported` reported IP | `#b48ead` | 6.7 | 6.3 | 5.7 |
| `--data-flagged` likely DoS source | `#ffd1d1` | 13.8 | 13.0 | 11.8 |

How far apart the pairs stay, as CIEDE2000 under normal vision, protanopia, deuteranopia and
tritanopia (the Machado 2009 simulation). Above 15 is clearly different. The earlier red, purple and
orange set had a worst pair of 8.6.

| Pair | Normal | Protan | Deutan | Tritan |
|---|---|---|---|---|
| network / application | 53 | 51 | 54 | 55 |
| network / reported | 42 | 15 | 15 | 56 |
| network / flagged | 41 | 23 | 32 | 58 |
| application / reported | 44 | 40 | 38 | 15 |
| application / flagged | 33 | 29 | 26 | 17 |
| reported / flagged | 21 | 22 | 24 | 17 |

The brightest colour is the most important one: flagged points are the lightest and are drawn as
**rings**. Reported points are a muted mauve, because there are hundreds of them and they should
recede.

**Colour is never the only signal.** Layers are named in the legend, lists and cards. Flagged points
differ by shape. Severity carries an icon and a word. This is a rule, and a test cannot check it, so
the review checklist below does.

## Severity and source state

| Level | Token | Value | Page | Icon and word |
|---|---|---|---|---|
| Normal | `--sev-normal` | `#2bc4c4` | 8.8 | check, "Normal" |
| Elevated | `--sev-elevated` | `#f0e442` | 14.3 | triangle, "Elevated" |
| Spike | `--sev-spike` | `#ff4d4f` | 5.8 | burst, "Spike" |
| Unavailable | `--sev-unavailable` | `#9ea4ac` | 7.6 | dash, "No data" |

It runs cool, then warm, then hot. The worst pair is elevated against spike under deuteranopia, at
dE 20. Green was rejected because green against red measured dE 8. Source state reuses it:
ok, warning and failing.

## Type

System fonts, so nothing is downloaded. Numerals are always tabular. `--font-mono` is for
figures, IDs and networks.

| Token | Size | Use |
|---|---|---|
| `--text-xs` | 12px | Labels, captions. The floor. |
| `--text-sm` | 13px | Lists, chips |
| `--text-base` | 14px | Body, dense dashboard default |
| `--text-md` | 16px | Inputs, so iOS does not zoom on focus |
| `--text-lg` / `--text-xl` | 20px / 24px | Title, card headings |
| `--text-stat` | 28px | Status tiles |
| `--text-stat-kiosk` | 36 to 72px, fluid | Tiles in kiosk mode |

All sizes are in `rem`, so the browser's text-size setting scales the whole layout.

## Spacing, shape and size

- **Spacing** is a 4px scale: 4, 8, 12, 16, 20, 24 and 32. It is dense on purpose.
- **Radius:** 4px for chips, 8px for panels, and a full pill for status badges.
- **Targets:** `--target-min` is 44px for every pointer target, including on desktop. Related targets
  are at least 8px apart.
- **Breakpoints:** 480px and 820px. CSS variables cannot be used in media queries, so they are written
  out in the stylesheet.
- **Layers** (z-index): header 20, popover 40, sheet 50, toast 60.

## Motion

The data is the motion. Everything else is still.

- **Press and hover feedback** takes `--dur-instant` (80ms). Other state changes take `--dur-fast`
  (150ms) or `--dur-base` (250ms), with `--ease-out`.
- **Arcs** draw in 1.2 seconds and fade out. A moving point pulses at 6 radians a second. Nothing else loops.
- **Reduced motion is one switch.** `prefers-reduced-motion`, or the in-app toggle that sets
  `data-motion="reduced"` on `<html>`, drives both the CSS durations and the globe. With it on, arcs appear
  at full length, nothing pulses, auto-rotation stops, and camera damping is off.
- **Nothing flashes** more than three times a second, and nothing moving starts without a way to pause it.
  Pause is always visible and works from the keyboard.

## Maps and charts

- **Land and grid are muted** (`--map-land`, `--map-grid` at 12%), so the only saturated hues on the map are data.
- **Globe and 2D map show the same data** with the same colours, shapes and legend.
- **Dot density.** Zoomed out, points merge into a soft heat glow. Zoomed in, they become single
  points. Flagged points are rings at every zoom.
- **Anomalies** (timeline) get a distinct marker shape, a text label such as "Spike 3.4x" and a tinted
  band, not just a colour.
- **Every chart has a text equivalent.** The globe, the map and the timeline are listed as text in the
  panels, with the same facts and the same actions. Keyboard users lose nothing.
- **Honest labelling.** Arcs are samples of country-level trends. The legend and notice say so, and
  demo data is always labelled as demo.
- **Numbers on screen** are tabular, in a fixed width so they do not jitter as they tick.

## Accessibility rules

1. **Contrast:** AA at least. 4.5:1 for text, 3:1 for icons, control edges, focus rings and chart marks.
2. **Focus:** every interactive element shows a 2px `--focus` ring with a 2px offset. Sticky UI offsets
   scrolling with `scroll-padding`, so it never covers the focused element.
3. **Targets:** at least 44px by 44px, 8px apart.
4. **Keyboard:** everything works without a pointer. The globe takes arrow keys to rotate, plus and
   minus to zoom and space to pause. Dragging always has a keyboard alternative.
5. **Semantics:** native controls first. Icon-only buttons have names, and decorative icons are hidden
   from assistive tech. Headings are in order. There is a skip link.
6. **Live updates** are announced as one polite status phrase and never move focus. Ticking times are
   not announced.
7. **Reduced motion, text size and zoom** to 200% work without breaking layout or losing content.
8. **No horizontal scroll** at 320px.

## Components and where they come from

Everything is built from scratch in plain CSS on these tokens. The 21st.dev plugin was installed, but its
sign-in was not completed, so no 21st component was used. They would not have beaten building here
anyway: they are shadcn and Tailwind based, this project has neither, and the initial JavaScript budget
(80 kB gzip) leaves under 1 kB of room.

| Need | Used | Why it is enough |
|---|---|---|
| Segmented control, toggles | Buttons with `aria-pressed` | The standard toggle pattern, nothing to add |
| Country search | A hand-written ARIA 1.2 combobox | About 70 lines, keyboard-complete, loaded only when opened |
| Bottom sheet, dialog | The native `<dialog>` | Focus trap, Escape and an inert page come with the browser |
| Collapsible panels | The native `<details>` | Keyboard and screen reader behaviour come with it |
| Skeletons | One CSS class | The pulse stops under reduced motion |
| Toast | Not needed | Results and errors appear inline |

## Review checklist

The checklist from the UI/UX Pro Max skill, restricted to the items that apply to a web dashboard, run at
the end of the build. The evidence is a test or a measurement, not an opinion.

- [x] No emoji used as icons, and all icons from one family and style: one 20-icon SVG set in `Icon.jsx`
- [x] Press states do not shift layout: buttons change background only
- [x] Semantic tokens only, with no raw colour in component CSS: enforced by `tokens.test.js`
- [x] Text at least 4.5:1 and meaningful marks at least 3:1, in every state: `tokens.test.js` on all three surfaces
- [x] Targets at least 44px and a visible focus ring everywhere: an e2e test measures every control and
      tabs through 40 stops
- [x] Colour is never the only indicator: layers are named, flagged points are rings, severity has an
      icon and a word, and trend changes have an arrow and a word
- [x] Keyboard order matches visual order, and nothing is a trap: walked in a real browser, 43 stops
- [x] Reduced motion works from both the OS and the toggle: e2e covers both
- [x] Sticky UI never hides focus: nothing is sticky, and `scroll-padding` is set anyway
- [x] No horizontal scroll at 320px, and layouts hold at 360, 390, 820 and 1366px: e2e at four widths
- [x] Moving content can be paused: the header Pause, and Space on the map
- [x] Accessibility: axe-core reports 0 violations in 9 states, and Lighthouse scores 100
- [x] Layout shift: 0.005 on a phone and 0.000 on desktop. Space is held for the notice, the mode
      badge and the tile text.
