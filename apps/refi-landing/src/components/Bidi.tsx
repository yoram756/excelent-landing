import type { ReactNode } from 'react';

export function Bidi({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={className}>{children}</bdi>;
}

export function BidiText({ text }: { text: string }) {
  return <>{text.split(/([A-Za-z][A-Za-z0-9_.:/?%+@#&=-]*|\d[\d,.:\u0025₪+\-/]*|₪[\d,.+]+)/g).map((part, i) =>
    /^[A-Za-z\d₪]/.test(part) ? <Bidi key={i}>{part}</Bidi> : part,
  )}</>;
}
