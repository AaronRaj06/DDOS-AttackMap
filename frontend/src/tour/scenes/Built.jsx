import { Caption, Scene } from '../parts';

// How it is built: one line of proof per station. No counts typed by hand.
export default function Built({ step, active }) {
  return (
    <Scene id={step.id} active={active}>
      <Caption id={step.id} heading={step.heading}>
        <dl className="tour-stations">
          {step.stations.map(({ name, detail }) => <div key={name}><dt>{name}</dt><dd>{detail}</dd></div>)}
        </dl>
      </Caption>
    </Scene>
  );
}
