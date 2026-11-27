import { lazy, Suspense, useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { useMotion } from '../hooks/useMotion';
import Fallback from './Fallback';

const Stage = lazy(() => import('./Stage'));

// 3D unless reduced motion is on when the page opens (then the 2D page, with a way in) or WebGL fails
// (then the 2D page, for good). Turning motion down later only changes how the camera moves.
export default function Tour() {
  const motion = useMotion();
  const [threeD, setThreeD] = useState(!motion.reduced);

  if (!threeD) return <Fallback onEnter3D={() => setThreeD(true)} />;
  return (
    <ErrorBoundary fallback={<Fallback />}>
      <Suspense fallback={null}>
        <Stage motion={motion} />
      </Suspense>
    </ErrorBoundary>
  );
}
