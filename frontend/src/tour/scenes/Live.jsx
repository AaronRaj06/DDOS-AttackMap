import { intro, scenes } from '../content';
import { Caption, Scene } from '../parts';

// The hand-off. By now the camera is at the dashboard's opening view, so following the link continues
// the same picture; browsers with cross-document view transitions also cross-fade (base.css).
export default function Live({ step, active }) {
  return (
    <Scene id={step.id} active={active}>
      <Caption id={step.id} heading={step.heading}>
        {step.body.map((text) => <p key={text}>{text}</p>)}
        <p className="tour-note">{scenes.handoff}</p>
        <a className="btn primary" href="/">{intro.liveMap} →</a>
      </Caption>
    </Scene>
  );
}
