import Legend from '../components/Legend';
import { exampleFactors, illustrative, intro, outputExamples, steps } from './content';

// The tour as one readable column. Shown without WebGL or with reduced motion, and it is the
// whole tour until the 3D scenes exist. Figures are drawings of the idea, labelled as such.

function Figure({ label, children }) {
  return (
    <figure className="tour-figure">
      {children}
      <figcaption>{illustrative}. {label}</figcaption>
    </figure>
  );
}

// Seeded so the "invented" arcs look random but render the same every time
function scatter(count, seed = 7) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => [next() * 300, 20 + next() * 100, next() * 300, 20 + next() * 100]);
}

const INVENTED = scatter(14);

function InventedFigure() {
  return (
    <Figure label="Left: invented arcs from anywhere to anywhere. Right: only routes a source reports, weighted by share.">
      <svg viewBox="0 0 640 140" role="img" aria-label="Two panels. The left is crowded with random arcs marked invented; the right has three arcs of different thickness.">
        <g>
          {INVENTED.map(([x1, y1, x2, y2], i) => (
            <path key={i} className="fig-invented" d={`M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 40} ${x2} ${y2}`} />
          ))}
          <text className="fig-stamp" x="150" y="130" textAnchor="middle">invented</text>
        </g>
        <g transform="translate(340 0)">
          <path className="fig-l3" strokeWidth="5" d="M20 110 Q140 10 280 100" />
          <path className="fig-l7" strokeWidth="3" strokeDasharray="8 5" d="M40 60 Q120 20 200 70" />
          <path className="fig-l3" strokeWidth="1.5" d="M60 120 Q160 70 250 120" />
          <text className="fig-label" x="150" y="134" textAnchor="middle">reported routes, by share</text>
        </g>
      </svg>
    </Figure>
  );
}

function FactorsFigure() {
  const max = Math.max(...exampleFactors.map((f) => Math.abs(f.value)));
  return (
    <Figure label="Example of the three factors and the rest for one made-up network.">
      <ul className="fig-factors">
        {exampleFactors.map(({ label, value }) => (
          <li key={label}>
            <span className="fig-factor-name">{label}</span>
            <span className="fig-factor-track" aria-hidden="true">
              <span className={value >= 0 ? 'fig-bar up' : 'fig-bar down'} style={{ '--w': `${(Math.abs(value) / max) * 50}%` }} />
            </span>
            <span className="fig-factor-effect">{value >= 0 ? 'raises' : 'lowers'}</span>
          </li>
        ))}
      </ul>
    </Figure>
  );
}

function SeparateFigure() {
  return (
    <Figure label="Radar routes and AbuseIPDB networks sit on separate layers. A line joining them is refused.">
      <svg viewBox="0 0 640 150" role="img" aria-label="An upper layer of route arcs and a lower layer of dots, with a crossed-out dashed line between them.">
        <rect className="fig-shell" x="40" y="10" width="560" height="50" rx="8" />
        <text className="fig-label" x="56" y="30">Cloudflare Radar: country routes</text>
        <path className="fig-l3" strokeWidth="3" d="M300 52 Q400 16 520 52" />
        <rect className="fig-shell" x="40" y="90" width="560" height="50" rx="8" />
        <text className="fig-label" x="56" y="110">AbuseIPDB: reported networks</text>
        {[340, 380, 430, 470, 520].map((x) => <circle key={x} className="fig-dot" cx={x} cy="122" r="5" />)}
        <path className="fig-refused" d="M430 116 L410 52" />
        <path className="fig-cross" d="M410 76 l16 16 M426 76 l-16 16" />
        <text className="fig-label" x="440" y="82">never joined</text>
      </svg>
    </Figure>
  );
}

// A flat series with noise, then a surge: drawn in the shape the detector looks for
const SERIES = [40, 42, 39, 44, 41, 43, 40, 45, 42, 41, 44, 43, 41, 42, 70, 92, 88, 75, 47, 43, 42, 44, 41, 43];

function SpikeFigure() {
  const x = (i) => 20 + i * (600 / (SERIES.length - 1));
  const y = (v) => 130 - v;
  const line = SERIES.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
  return (
    <Figure label="A series in 15-minute buckets, the band of normal around its median, and a spike marked where it leaves the band.">
      <svg viewBox="0 0 640 150" role="img" aria-label="A line chart that runs flat inside a shaded band, then jumps far above it where a spike is marked.">
        <rect className="fig-band" x="20" y={y(50)} width="600" height="16" />
        <text className="fig-label" x="24" y={y(50) + 30}>normal band (median ± MAD, previous 24 h)</text>
        <path className="fig-series" d={line} />
        <rect className="fig-spike" x={x(14)} y="20" width={x(17) - x(14)} height="110" />
        <text className="fig-label" x={x(14) - 8} y="34" textAnchor="end">spike: z ≥ 3.5 twice in a row</text>
      </svg>
    </Figure>
  );
}

const FIGURES = { invented: InventedFigure, factors: FactorsFigure, separate: SeparateFigure, spike: SpikeFigure };

function Step({ step }) {
  const Diagram = FIGURES[step.diagram];
  return (
    <section className="tour-step" id={step.id} aria-labelledby={`${step.id}-h`}>
      <h2 id={`${step.id}-h`}>{step.heading}</h2>
      {step.body?.map((text) => <p key={text}>{text}</p>)}
      {step.points && <ul className="tour-points">{step.points.map((text) => <li key={text}>{text}</li>)}</ul>}
      {step.legend && <Legend hasPoints={step.legend.points} hasFlagged={step.legend.flagged} />}
      {Diagram && <Diagram />}
      {step.outputs && (
        <dl className="tour-cards">
          {step.outputs.map(({ name, detail }) => (
            <div key={name}><dt>{name}</dt><dd>{detail}</dd><dd><pre><code>{outputExamples[name]}</code></pre></dd></div>
          ))}
        </dl>
      )}
      {step.stations && (
        <dl className="tour-cards">
          {step.stations.map(({ name, detail }) => <div key={name}><dt>{name}</dt><dd>{detail}</dd></div>)}
        </dl>
      )}
      {step.cta && <a className="btn primary" href="/">{intro.liveMap} →</a>}
    </section>
  );
}

// `onEnter3D` is only passed when 3D can work (reduced motion chose this page, not a missing WebGL)
export default function Fallback({ onEnter3D }) {
  return (
    <>
      <a className="skip-link" href="#tour-main">Skip to content</a>
      <header className="tour-header">
        <span className="tour-brand">{intro.title}</span>
        <a className="btn" href="/">{intro.liveMap} →</a>
      </header>
      <main id="tour-main" className="tour">
        <div className="tour-hero">
          <h1>{intro.title}</h1>
          <p>{intro.subtitle}</p>
          <div className="tour-actions">
            <a className="btn primary" href="/">{intro.liveMap}</a>
            <a className="btn" href={`#${steps[0].id}`}>{intro.howItWorks} ↓</a>
            {onEnter3D && <button type="button" className="btn" onClick={onEnter3D}>{intro.enter3D}</button>}
          </div>
        </div>
        <nav className="tour-nav" aria-label="Tour steps">
          <ol>
            {steps.filter((s) => s.nav).map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.nav}</a></li>)}
          </ol>
        </nav>
        {steps.map((step) => <Step key={step.id} step={step} />)}
      </main>
    </>
  );
}
