export function BrandMark(props: { size?: number; className?: string }) {
  const size = props.size ?? 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={props.className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="me-brand-bg" x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="me-brand-hi" x1="8" y1="7" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="8" fill="url(#me-brand-bg)" />
      <rect x="2.5" y="2.5" width="31" height="31" rx="7.5" stroke="rgba(255,255,255,0.24)" />
      <path
        d="M9.5 25.5V11.2L18 18.8L26.5 11.2V25.5H23.1V17.4L18 22L12.9 17.4V25.5H9.5Z"
        fill="url(#me-brand-hi)"
      />
    </svg>
  );
}
