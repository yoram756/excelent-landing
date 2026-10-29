import proof from '../../../../config/landing/trust.json';
import { Bidi } from './Bidi';

export function TrustProof() {
  return <div data-trust-proof className="mt-5 rounded-xl border border-ink/15 bg-paper p-4 text-ink">
    <div className="flex flex-wrap items-center gap-3">
      <img src={proof.midrag.logo} alt="מידרג" width="180" height="180" loading="lazy" className="size-14 shrink-0 rounded-md bg-white object-contain" />
      <div><p className="text-sm font-semibold">ציון במידרג <Bidi className="text-xl font-extrabold">{proof.midrag.score}</Bidi> מתוך <Bidi>{proof.midrag.scale}</Bidi></p><p className="text-xs text-muted-foreground">{proof.midrag.sourceLabel}</p></div>
    </div>
    <a href={proof.reviews.url} target="_blank" rel="noopener noreferrer" className="mt-3 block min-h-8 text-sm font-semibold underline underline-offset-4"><Bidi>{proof.reviews.platform}</Bidi>: <Bidi>{proof.reviews.score}</Bidi> מתוך <Bidi>{proof.reviews.scale}</Bidi>, <Bidi>{proof.reviews.count}</Bidi> חוות דעת<span className="sr-only">. לקריאת חוות הדעת, נפתח בחלון חדש</span></a>
    <p className="mt-2 text-xs text-muted-foreground">{proof.scope}</p>
  </div>;
}
