import { useId } from 'react';

export function BrandMark(props: { size?: number; className?: string }) {
  const size = props.size ?? 24;
  const uid = useId();
  const bgId = `me-brand-bg-${uid}`;
  const hiId = `me-brand-hi-${uid}`;

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
        <linearGradient id={bgId} x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--me-brand-start, #f43f8e)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--me-brand-end, #8b5cf6)' }} />
        </linearGradient>
        <linearGradient id={hiId} x1="9" y1="8" x2="27" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.82)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="9" fill={`url(#${bgId})`} />
      <rect x="2.5" y="2.5" width="31" height="31" rx="8.5" stroke="rgba(255,255,255,0.28)" />
      <path
        d="M9.5 25.2V11.2C9.5 10.6 10.2 10.3 10.6 10.7L18 17.8L25.4 10.7C25.8 10.3 26.5 10.6 26.5 11.2V25.2H23.1V17.4L18.5 21.8C18.2 22.1 17.8 22.1 17.5 21.8L12.9 17.4V25.2H9.5Z"
        fill={`url(#${hiId})`}
      />
    </svg>
  );
}
