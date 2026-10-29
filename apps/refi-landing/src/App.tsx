import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import LandingPage from './LandingPage';
import ThankYou from './ThankYou';
import { ContentProvider, pageForPath } from './content';
import { DirectionProvider } from './components/ui/direction';
import { isReceipt, receiptKey, saveReceipt, type Receipt } from './lib/lead';

function subscribeReceipt(listener: () => void) {
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
function receiptSnapshot() { try { return sessionStorage.getItem(receiptKey); } catch { return null; } }
const serverReceipt = () => null;
const clientReady = () => true;
const serverReady = () => false;

export default function App({ initialPath = '/' }: { initialPath?: string }) {
  const [path, setPath] = useState(initialPath);
  const [localReceipt, setLocalReceipt] = useState<Receipt | null>(null);
  const raw = useSyncExternalStore(subscribeReceipt, receiptSnapshot, serverReceipt);
  const ready = useSyncExternalStore(subscribeReceipt, clientReady, serverReady);
  const storedReceipt = useMemo(() => { try { const value: unknown = JSON.parse(raw || 'null'); return isReceipt(value) ? value : null; } catch { return null; } }, [raw]);
  useEffect(() => {
    const onPopState = () => setPath(location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const content = pageForPath(path);
  const thankYou = path.replace(/\/$/, '') === content.thankYouPath;
  const validReceipt = (receipt: Receipt | null) => receipt && (receipt.landingId || 'refi') === content.landingId ? receipt : null;
  useEffect(() => { document.title = thankYou ? 'נשארים בקשר | אקסלנט' : content.meta.title; }, [thankYou, content]);

  function onConfirmed(receipt: Receipt) {
    const scoped = { ...receipt, landingId: content.landingId };
    saveReceipt(scoped);
    setLocalReceipt(scoped);
    history.pushState(null, '', content.thankYouPath);
    setPath(content.thankYouPath);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return <ContentProvider value={content}><DirectionProvider dir="rtl">{thankYou ? <ThankYou ready={ready || Boolean(localReceipt)} receipt={validReceipt(localReceipt) || validReceipt(storedReceipt)} /> : <LandingPage key={content.landingId} onConfirmed={onConfirmed} />}</DirectionProvider></ContentProvider>;
}
