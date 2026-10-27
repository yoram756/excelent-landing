import { useId, useRef, useState, type FormEvent } from 'react';
import { content } from '../content';
import { createPayload, normalizeInput, submitLead, type LeadPayload, type Receipt } from '../lib/lead';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Icon } from './Icon';

export function LeadForm({ onConfirmed }: { onConfirmed: (receipt: Receipt) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'phone', string>>>({});
  const [failure, setFailure] = useState('');
  const busy = useRef(false);
  const draft = useRef<{ signature: string; payload: LeadPayload } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const input = { name, phone, analyticsConsent };
    const normalized = normalizeInput(input);
    setErrors(normalized.errors); setFailure('');
    if (Object.keys(normalized.errors).length) {
      const field = normalized.errors.name ? 'name' : 'phone';
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
      return;
    }
    busy.current = true; setSubmitting(true);
    const signature = JSON.stringify([normalized.name, normalized.phone]);
    try {
      if (!draft.current || draft.current.signature !== signature) draft.current = { signature, payload: createPayload(input, content) };
      const receipt = await submitLead(draft.current.payload, analyticsConsent, content.endpoint);
      onConfirmed(receipt);
    } catch (error) {
      setFailure(error instanceof Error && error.message === 'rate' ? 'התקבלו הרבה בקשות בזמן קצר. נסו שוב בעוד דקה, או התקשרו אלינו.' : 'לא התקבל אישור לשמירת הפנייה. הפרטים נשמרו בטופס ואפשר לנסות שוב, או להתקשר אלינו.');
    } finally { busy.current = false; setSubmitting(false); }
  }

  return <section id="lead-form" data-section="lead-form" tabIndex={-1} aria-labelledby="form-heading" className="section-space scroll-mt-8 bg-ink text-white">
    <div className="page-width grid items-center gap-10 lg:grid-cols-[1fr_1.08fr] lg:gap-20">
      <div>
        <span className="eyebrow text-gold-light">השיחה הראשונה היא עלינו</span>
        <h2 id="form-heading" className="mt-4 text-[2rem] font-extrabold md:text-[2.75rem]">מתחילים בשיחה.<br />ממשיכים כשזה נכון לכם.</h2>
        <p className="mt-5 max-w-md text-lg text-white/75">משאירים שם וטלפון, ויורם חוזר אליכם לשיחה קצרה. בלי טופס ארוך ובלי לחפש מסמכים עכשיו.</p>
        <ul className="mt-7 space-y-3 text-white/85">
          {['בדיקה ראשונית ללא עלות', 'בלי התחייבות לליווי בהמשך', 'הפנייה אינה מצרפת אתכם לדיוור'].map(text => <li key={text} className="flex items-center gap-3"><Icon name="check" className="size-5 shrink-0 text-gold-light" /><span>{text}</span></li>)}
        </ul>
        <p className="mt-8 border-s border-white/25 ps-4 text-sm text-white/65">״קודם נבין מה חשוב לכם. אחר כך נבדוק את המספרים.״<br /><span className="font-semibold text-white">{content.identity.name}</span></p>
      </div>
      <form onSubmit={handleSubmit} noValidate aria-label="בקשה לבדיקת משכנתא" aria-busy={submitting} className="rounded-[1.5rem] bg-white p-6 text-ink shadow-xl md:p-9">
        <h3 className="text-2xl font-extrabold">נעים להכיר. איך חוזרים אליכם?</h3>
        <p className="mt-2 text-sm text-muted-foreground">שני פרטים, ואפשר להתחיל.</p>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>שם מלא</Label>
            <Input id={`${id}-name`} name="name" autoComplete="name" maxLength={40} required value={name} onChange={e => setName(e.target.value)} placeholder="איך קוראים לכם?" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${id}-name-error` : undefined} />
            {errors.name ? <p id={`${id}-name-error`} className="text-sm text-destructive">{errors.name}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-phone`}>טלפון נייד</Label>
            <Input id={`${id}-phone`} name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" maxLength={24} required value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-0000000" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? `${id}-phone-error` : undefined} />
            {errors.phone ? <p id={`${id}-phone-error`} className="text-sm text-destructive">{errors.phone}</p> : null}
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground">
            <input type="checkbox" name="analytics-consent" checked={analyticsConsent} onChange={e => setAnalyticsConsent(e.target.checked)} className="mt-1 size-4 shrink-0 accent-ink" />
            <span>אפשר למדוד את השימוש לשיפור האתר, בלי לשלוח את פרטי הקשר למדידה. לא חובה.</span>
          </label>
          <p className="text-xs text-muted-foreground">בלחיצה אתם מבקשים שנחזור אליכם בעניין הבדיקה, ומאשרים את <a href={content.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">מדיניות הפרטיות<span className="sr-only">, נפתחת בחלון חדש</span></a>. אין הסכמה לתוכן שיווקי.</p>
          {failure ? <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{failure}</p> : null}
          <Button type="submit" disabled={submitting} className="min-h-14 w-full text-base">{submitting ? 'שומרים את הפנייה…' : 'כן, אשמח לבדיקה ראשונית'}<Icon name="arrow" className="size-5 rtl:rotate-180" /></Button>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Icon name="shield" className="size-4" />הפרטים משמשים לחזרה לבקשתכם בלבד</p>
        </div>
      </form>
    </div>
  </section>;
}
