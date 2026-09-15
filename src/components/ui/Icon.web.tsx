import type { ReactNode } from 'react';

import type { IconName, IconProps } from './Icon.types';

export type { IconName, IconProps } from './Icon.types';

const artwork: Record<IconName, ReactNode> = {
  camera: (
    <>
      <path d="M8 5 9.5 3h5L16 5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  cog: (
    <>
      <path d="m9 3-.6 2.4-2 .9L4 5.6 2 9l1.8 1.7v2.6L2 15l2 3.4 2.4-.7 2 .9L9 21h4l.6-2.4 2-.9 2.4.7 2-3.4-1.8-1.7v-2.6L20 9l-2-3.4-2.4.7-2-.9L13 3Z" />
      <circle cx="11" cy="12" r="3" />
    </>
  ),
  meal: (
    <>
      <path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 9h5M19 3v18" />
    </>
  ),
  'arrow-right': <path d="M4 12h16m-7-7 7 7-7 7" />,
  'arrow-left': <path d="M20 12H4m7-7-7 7 7 7" />,
  swap: <path d="M3 7h17l-4-4m4 14H3l4 4M20 7l-4 4M3 17l4-4" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 10h18M7 14h2m6 0h2M7 17h2m6 0h2" />
    </>
  ),
  pantry: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M5 10h14M8 6v1m0 7v3M8 21v1m8-1v1" />
    </>
  ),
  sunrise: (
    <>
      <path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 3v4M3 10l3 3m15-3-3 3M2 21h20" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  produce: <path d="M20 4C12 4 5 8 5 16c0 2.2 1.8 4 4 4 8 0 11-7 11-16ZM4 20c3-4 7-7 12-10" />,
  protein: (
    <>
      <path d="M5 19c-2.5-2.5-2.5-6.5 0-9l3-3 8 8-3 3c-2.5 2.5-6.5 2.5-8 0Z" />
      <path d="M15 5a3 3 0 0 1 4-1 3 3 0 0 1 1 4l-4 4-4-4Z" />
    </>
  ),
  dairy: (
    <>
      <path d="M7 5h10l-1 15H8L7 5Z" />
      <path d="M8 9h8" />
    </>
  ),
  'dry-pantry': (
    <>
      <path d="M5 7h14v13H5zM7 4h10v3H7z" />
      <path d="M9 12h6" />
    </>
  ),
  seasoning: (
    <>
      <path d="M8 9h8l1 11H7L8 9Z" />
      <path d="M9 4h6v5H9zM10 2h4" />
      <path d="M10 13h4" />
    </>
  ),
  ingredient: (
    <>
      <path d="M5 6h14v14H5z" />
      <path d="M8 3h8v3M9 11h6m-6 4h4" />
    </>
  ),
};

/** Inline geometry stays visible when web fonts fail, are blocked, or are still loading. */
export function Icon({ name, size = 24, color }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {artwork[name]}
    </svg>
  );
}
