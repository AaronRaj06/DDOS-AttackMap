// One icon family: 24px grid, 1.75px round strokes, decorative by default (the label is always text beside it).
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  triangle: <path d="M12 4L3 20h18L12 4zM12 10v4.5M12 17.2v.1" />,
  burst: <path d="M13 3L5 13.5h6L10 21l9-11h-6.2L13 3z" />,
  dash: <path d="M6 12h12" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5z" /></>,
  map: <path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5zM9 4v13.5M15 6.5V20" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M8 5l11 7-11 7V5z" />,
  download: <path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></>,
  flag: <path d="M6 21V4M6 5h11l-2 4 2 4H6" />,
  motion: <path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.1" /></>,
};

export default function Icon({ name }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
