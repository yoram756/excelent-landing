import { useEffect, useState } from 'react';
import { content } from './content';
import { Button } from './components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './components/ui/accordion';
import { Bidi, BidiText } from './components/Bidi';
import { Icon, type IconName } from './components/Icon';
import { LeadForm } from './components/LeadForm';
import type { Receipt } from './lib/lead';

const whatsapp = `https://wa.me/${content.identity.e164}`;
const tel = `tel:+${content.identity.e164}`;

export function Brand({ className = '' }: { className?: string }) {
  return <a href="/" className={`inline-flex shrink-0 ${className}`} aria-label="אקסלנט, לדף הראשי"><img src="/cro-assets/logo.png" alt="אקסלנט משכנתאות ופיננסים" width="695" height="305" fetchPriority="low" decoding="async" className="h-auto w-32 md:w-36" /></a>;
}

function Hero() {
  return <section data-section="hero" aria-labelledby="hero-title" className="relative overflow-hidden bg-paper">
    <header className="page-width flex min-h-24 items-center justify-between gap-4 border-b border-ink/10 py-3">
      <Brand />
      <div className="flex items-center gap-5 md:gap-8">
        <a href="#benefits" className="hidden text-sm font-semibold text-ink/75 hover:text-ink md:inline">איך עוזרים לכם</a>
        <a href={tel} className="inline-flex items-center gap-2 text-sm font-semibold"><Icon name="phone" className="size-4 text-accent-strong" /><Bidi>{content.identity.phone}</Bidi></a>
      </div>
    </header>
    <div className="page-width grid items-center gap-12 pb-14 pt-10 md:grid-cols-[1.05fr_0.95fr] md:gap-12 md:pb-20 md:pt-14 lg:gap-20">
      <div>
        <span className="eyebrow inline-flex items-center gap-2"><span className="size-2 rounded-full bg-accent-strong" />{content.hero.eyebrow}</span>
        <h1 id="hero-title" className="mt-4 text-[3.25rem] font-extrabold md:text-[4.4rem] lg:text-[5rem]">{content.hero.title}<br /><span className="text-accent-strong">{content.hero.accent}</span></h1>
        <p className="mt-5 max-w-lg text-lg text-ink/75 md:text-xl">{content.hero.description}</p>
        <div className="mt-8 flex flex-col items-stretch gap-4 sm:items-start">
          <Button asChild className="min-h-14 ps-6 pe-6 text-base shadow-[0_8px_24px_#b8994a25]"><a href="#lead-form">{content.hero.cta}<Icon name="arrow" className="size-5 rtl:rotate-180" /></a></Button>
          <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start"><Icon name="check" className="size-4" />בדיקה ראשונית ללא עלות וללא התחייבות</span>
        </div>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center gap-2 border-b border-ink/25 text-sm font-semibold hover:border-ink"><Icon name="message" className="size-4" />מעדיפים להתחיל בוואטסאפ?<span className="sr-only">נפתח בחלון חדש. ההודעה נשלחת רק אם תבחרו לשלוח אותה.</span></a>
      </div>
      <figure className="relative ms-auto me-auto w-full max-w-[440px] pb-5 ps-3 pe-3 md:ps-0 md:pe-0">
        <div className="absolute start-0 end-0 top-8 bottom-6 rounded-t-[46%] rounded-b-[1.5rem] bg-sand" aria-hidden="true" />
        <picture className="relative block overflow-hidden rounded-t-[46%] rounded-b-[1.5rem] border border-ink/10">
          <source media="(max-width: 767px)" srcSet="/cro-assets/portrait-480.webp" />
          <img src="/cro-assets/portrait.webp" alt="יורם פלד במשרד, משוחח בטלפון" width="800" height="1000" fetchPriority="high" className="aspect-[4/5] w-full object-cover" />
        </picture>
        <div className="absolute -bottom-1 start-0 flex items-center gap-3 rounded-xl border border-ink/10 bg-white py-4 ps-5 pe-6 shadow-[0_8px_24px_#172f3610] md:-start-5">
          <span className="grid size-10 place-items-center rounded-full bg-paper text-accent-strong"><Icon name="shield" className="size-5" /></span>
          <figcaption><span className="block text-lg font-extrabold">{content.identity.name}</span><span className="text-xs text-muted-foreground">ליווי אישי. החלטות עם תמונה מלאה.</span></figcaption>
        </div>
        <span aria-hidden="true" className="absolute end-0 top-5 rounded-full bg-ink py-2 ps-4 pe-4 text-sm text-white md:-end-4">קודם בודקים, אחר כך מחליטים.</span>
      </figure>
    </div>
  </section>;
}

function TrustBar() {
  return <section data-section="trust" aria-label="אקסלנט במספר מילים" className="border-y border-ink/10 bg-white">
    <div className="page-width flex flex-col items-center gap-6 py-8 md:flex-row md:gap-7 md:py-10">
      <img src="/cro-assets/logo.png" alt="אקסלנט משכנתאות ופיננסים" width="695" height="305" loading="lazy" className="h-auto w-24 shrink-0" />
      <div className="grid w-full grid-cols-2 gap-y-6 md:grid-cols-4">
      <div className="ps-3 pe-3 text-center"><p className="text-[1.65rem] font-extrabold">מאז <Bidi>{content.since}</Bidi></p><p className="text-sm text-muted-foreground">מלווים משפחות בדרך לבית</p></div>
      <div className="border-s border-ink/10 ps-3 pe-3 text-center"><p className="text-[1.65rem] font-extrabold">ללא עלות</p><p className="text-sm text-muted-foreground">שיחה ובדיקה ראשונית</p></div>
      <div className="ps-3 pe-3 text-center md:border-s md:border-ink/10"><p className="text-[1.65rem] font-extrabold">כתובת אחת</p><p className="text-sm text-muted-foreground">שמכירה את התמונה שלכם</p></div>
      <div className="border-s border-ink/10 ps-3 pe-3 text-center"><p className="text-[1.65rem] font-extrabold"><Bidi>{content.locations.length}</Bidi> מוקדי שירות</p><p className="text-sm text-muted-foreground">{content.locations.join(' · ')}</p></div>
      </div>
    </div>
  </section>;
}

function Benefits() {
  return <section id="benefits" data-section="benefits" aria-labelledby="benefits-title" className="section-space bg-paper">
    <div className="page-width">
      <div className="max-w-2xl"><span className="eyebrow">בלי לנחש. בלי להתרוצץ.</span><h2 id="benefits-title" className="mt-3 text-[2rem] font-extrabold md:text-[2.65rem]">לא רק לבדוק ריבית.<br />להבין מה נכון לכם.</h2></div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {content.benefits.map((benefit, index) => <article key={benefit.title} className="group rounded-2xl border border-ink/10 bg-white p-6 transition-shadow hover:shadow-lg md:p-8">
          <div className="flex items-center justify-between"><span className="grid size-12 place-items-center rounded-xl bg-paper text-accent-strong"><Icon name={benefit.icon as IconName} /></span><Bidi className="text-sm font-semibold text-muted-foreground">0{index + 1}</Bidi></div>
          <h3 className="mt-7 text-xl font-extrabold">{benefit.title}</h3><p className="mt-3 text-muted-foreground">{benefit.text}</p>
        </article>)}
      </div>
    </div>
  </section>;
}

function Testimonials() {
  const videos = content.testimonials.videos;
  return <section data-section="testimonials" aria-labelledby="testimonials-title" className="section-space bg-white">
    <div className="page-width">
      <div className="flex flex-wrap items-end justify-between gap-6"><div><span className="eyebrow">האנשים שמאחורי המספרים</span><h2 id="testimonials-title" className="mt-3 text-[2rem] font-extrabold md:text-[2.65rem]">לקוחות, במילים שלהם.</h2></div><p className="max-w-sm text-muted-foreground">משפחות שהגיעו עם שאלות, וקיבלו כתובת אישית לאורך הדרך.</p></div>
      {videos.length ? <div className="mt-10 grid gap-6 md:grid-cols-2">{videos.map(video => <figure key={video.src} className="overflow-hidden rounded-2xl border border-ink/10 bg-paper"><video controls playsInline preload="none" poster={video.poster} className="aspect-video w-full" aria-label={video.title}><source src={video.src} /><track kind="captions" srcLang="he" label="כתוביות בעברית" src={video.captions} default /></video><figcaption className="p-5"><h3 className="font-extrabold">{video.title}</h3><p className="text-sm text-muted-foreground">{video.name}</p></figcaption></figure>)}</div> : <div className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <figure className="overflow-hidden rounded-2xl bg-paper"><img src="/cro-assets/clients.webp" alt="יורם פלד עם זוג לקוחות שליווה" width="720" height="540" loading="lazy" className="aspect-[4/3] h-full w-full object-cover" /><figcaption className="sr-only">תמונת לקוחות אמיתית מהדף הקיים, מוצגת באישורם.</figcaption></figure>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">{content.testimonials.quotes.map(quote => <figure key={quote.name} className="flex flex-col justify-between rounded-2xl bg-paper p-6 md:p-7"><Icon name="quote" className="size-6 text-accent-strong" /><blockquote className="mt-4 text-lg font-semibold">״{quote.quote}״</blockquote><figcaption className="mt-5 border-t border-ink/10 pt-4"><span className="block text-sm font-extrabold">{quote.name}</span><span className="text-xs text-muted-foreground"><Bidi>{quote.source}</Bidi> · <Bidi>{quote.date}</Bidi></span></figcaption></figure>)}</div>
      </div>}
      <p className="mt-6 max-w-3xl text-xs text-muted-foreground">{content.testimonials.note}</p>
    </div>
  </section>;
}

export const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: content.faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) };

function FAQ() {
  return <section id="faq" data-section="faq" aria-labelledby="faq-title" className="section-space bg-paper pb-28 md:pb-16">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />
    <div className="page-width grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
      <div><span className="eyebrow">טוב ששאלתם</span><h2 id="faq-title" className="mt-3 text-[2rem] font-extrabold md:text-[2.65rem]">קצת יותר ברור,<br />עוד לפני השיחה.</h2><a href={tel} className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold underline decoration-accent-strong/50 underline-offset-8">יש שאלה אחרת? דברו איתנו<Icon name="arrow" className="size-4 rtl:rotate-180" /></a></div>
      <Accordion type="single" collapsible className="w-full">{content.faq.map((item, index) => <AccordionItem key={item.question} value={`faq-${index}`}><AccordionTrigger className="py-5 text-start text-base font-bold hover:no-underline">{item.question}</AccordionTrigger><AccordionContent className="text-base text-muted-foreground"><BidiText text={item.answer} /></AccordionContent></AccordionItem>)}</Accordion>
    </div>
    <footer className="page-width mt-16 flex flex-col items-start justify-between gap-7 border-t border-ink/10 pt-8 md:flex-row md:items-center">
      <div><p className="text-sm font-bold">{content.identity.brand}</p><p className="mt-1 text-xs text-muted-foreground">{content.identity.name} · <Bidi>{content.identity.phone}</Bidi></p></div>
      <nav aria-label="מידע על האתר" className="flex flex-wrap gap-5 text-xs text-muted-foreground"><a href={content.privacyUrl} className="min-h-8 underline underline-offset-4">מדיניות פרטיות</a><a href={content.accessibilityUrl} className="min-h-8 underline underline-offset-4">הצהרת נגישות</a><a href="#lead-form" className="min-h-8 underline underline-offset-4">בקשת שיחה</a></nav>
    </footer>
  </section>;
}

function MobileCTA() {
  const [formVisible, setFormVisible] = useState(false);
  useEffect(() => {
    const form = document.getElementById('lead-form');
    if (!form || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(form); return () => observer.disconnect();
  }, []);
  return <aside data-section="mobile-cta" aria-label="פנייה מהירה" className={`mobile-cta fixed start-0 end-0 bottom-0 z-40 border-t border-ink/10 bg-white/95 p-3 backdrop-blur-md md:hidden ${formVisible ? 'invisible pointer-events-none' : ''}`}>
    <div className="flex items-center gap-3"><Button asChild className="min-h-12 flex-1"><a href="#lead-form">לבדיקה ללא עלות<Icon name="arrow" className="size-4 rtl:rotate-180" /></a></Button><Button asChild variant="outline" className="min-h-12 shrink-0"><a href={tel}><Icon name="phone" className="size-4" />חיוג</a></Button></div>
  </aside>;
}

export default function LandingPage({ onConfirmed }: { onConfirmed: (receipt: Receipt) => void }) {
  return <><a className="skip-link" href="#lead-form">דילוג לטופס הבקשה</a><main><Hero /><TrustBar /><Benefits /><Testimonials /><LeadForm onConfirmed={onConfirmed} /><FAQ /><MobileCTA /></main><noscript><p className="bg-ink p-5 text-center text-white">כדי להשתמש בטופס יש להפעיל ג׳אווהסקריפט, או להתקשר אלינו: <a href={tel}><Bidi>{content.identity.phone}</Bidi></a>.</p></noscript></>;
}
