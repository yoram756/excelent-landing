import type { SVGProps } from 'react';

const paths = {
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  phone: <path d="m8 3 3 5-3 3c2 3 3 4 5 5l3-3 5 3c0 3-2 5-5 5C9 20 4 15 3 8c0-3 2-5 5-5Z" />,
  chart: <><path d="M4 4v16h16M8 15l4-4 3 2 5-7" /><path d="M16 6h4v4" /></>,
  file: <><path d="M14 3H5v18h14V8l-5-5Z" /><path d="M14 3v5h5M8 12h8M8 16h5" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  message: <><path d="M21 11a9 9 0 0 1-9 9c-1 0-3 0-4-1l-5 2 1-5a9 9 0 1 1 17-5Z" /><path d="M8 8c1 4 3 6 7 7" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  quote: <><path d="M5 13h4v6H3v-6c0-5 3-8 6-8M16 13h4v6h-6v-6c0-5 3-8 6-8" /></>,
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>{paths[name]}</svg>;
}
