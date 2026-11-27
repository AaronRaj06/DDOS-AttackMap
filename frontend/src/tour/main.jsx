import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/tour.css';
import Tour from './Tour';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Tour />
  </StrictMode>,
);
