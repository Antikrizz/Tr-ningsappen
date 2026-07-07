// Tunna linje-ikoner (24×24, stroke=currentColor) — ersätter emoji i navigeringen
const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

export function IconDumbbell(props) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="6" y1="8" x2="6" y2="16" />
      <line x1="9" y1="6" x2="9" y2="18" />
      <line x1="18" y1="8" x2="18" y2="16" />
      <line x1="15" y1="6" x2="15" y2="18" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

export function IconTrend(props) {
  return (
    <svg {...base} {...props}>
      <polyline points="3 17 9 11 13 14 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </svg>
  );
}

export function IconSliders(props) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2" fill="var(--bg)" />
      <circle cx="15" cy="12" r="2" fill="var(--bg)" />
      <circle cx="7" cy="17" r="2" fill="var(--bg)" />
    </svg>
  );
}
