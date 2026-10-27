import { useEffect } from 'react';
import { content } from './content';
import { Brand } from './LandingPage';
import { Bidi } from './components/Bidi';
import { Icon } from './components/Icon';
import { Button } from './components/ui/button';
import type { Receipt } from './lib/lead';

export default function ThankYou({ receipt, ready }: { receipt: Receipt | null; ready: boolean }) {
  useEffect(() => {
    if (receipt?.analyticsConsent) void import('./lib/analytics').then(m => m.trackQuoteSubmitted(receipt)).catch(() => undefined);
  }, [receipt]);
  return <main className="min-h-screen bg-paper pb-16">
    <header className="page-width flex min-h-24 items-center justify-between border-b border-ink/10 py-3"><Brand /><a href={`tel:+${content.identity.e164}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><Icon name="phone" className="size-4" /><Bidi>{content.identity.phone}</Bidi></a></header>
    <div className="page-width grid items-center gap-10 py-16 md:grid-cols-[1fr_0.7fr] md:gap-20 md:py-24">
      <div aria-live="polite">
        <span className="mb-7 grid size-16 place-items-center rounded-full bg-sand text-ink"><Icon name={receipt ? 'check' : 'message'} className="size-8" /></span>
        <h1 className="text-4xl font-extrabold md:text-5xl">{receipt ? <>הפרטים התקבלו.<br /><span className="text-accent-strong">מכאן אנחנו איתכם.</span></> : ready ? <>עוד לא נשלחה בקשה.<br />אפשר להתחיל כאן.</> : <>נשארים בקשר.<br />בודקים את פרטי הבקשה.</>}</h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">{receipt ? 'תודה שפניתם לאקסלנט. יורם יחזור אליכם לשיחה ראשונית, כדי להבין את הצרכים שלכם ומה כדאי לבדוק.' : 'השאירו שם וטלפון בדף הבדיקה, ונחזור אליכם בעניין המשכנתא.'}</p>
        {receipt ? <><p className="mt-5 text-sm text-muted-foreground">יעד המענה הוא עד שעה בשעות הפעילות. מחוץ לשעות הפעילות חוזרים ביום העסקים הבא.</p><p className="mt-5 text-sm">מספר הפנייה שלכם: <Bidi className="font-semibold">{receipt.requestId}</Bidi></p><div className="mt-8 flex flex-wrap gap-3"><Button asChild><a href={`tel:+${content.identity.e164}`}><Icon name="phone" className="size-4" />אפשר גם להתקשר</a></Button><Button asChild variant="outline"><a href="/">חזרה לדף הבדיקה</a></Button></div></> : <Button asChild className="mt-8"><a href="/#lead-form">לבקשת שיחה<Icon name="arrow" className="size-4 rtl:rotate-180" /></a></Button>}
        <p className="mt-8 text-xs text-muted-foreground">הבדיקה הראשונית ללא עלות ואינה התחייבות להמשך ליווי.</p>
      </div>
      <figure className="ms-auto me-auto w-full max-w-sm overflow-hidden rounded-t-[45%] rounded-b-2xl"><img src="/cro-assets/portrait-480.webp" alt="יורם פלד, אקסלנט משכנתאות ופיננסים" width="480" height="600" className="w-full" /><figcaption className="bg-white p-5 text-center"><p className="font-extrabold">{content.identity.name}</p><p className="text-sm text-muted-foreground">נעים להכיר, ונשמח לעזור.</p></figcaption></figure>
    </div>
  </main>;
}
