'use client';

/**
 * Voice: talk to MerchantPilot in Spanish or English (Web Speech API – Chrome, Edge, Safari).
 * The transcript is sent to the AI chat; optionally the answer is read back aloud.
 */
import { useEffect, useRef, useState } from 'react';
import { ASK_AI_EVENT } from './studio/MoneyAtStakeWidget';

type Lang = 'es-ES' | 'en-US';

function getRecognition(): any {
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  return SR ? new SR() : null;
}

/** Read the next assistant answer aloud once it stops streaming. */
function speakNextAnswer(lang: Lang) {
  const panel = document.querySelector('.ag-studio-ai-output-message-content')?.closest('[class*="ag-studio"]')?.parentElement ?? document.body;
  const before = document.querySelectorAll('.ag-studio-ai-output-message-content').length;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  const obs = new MutationObserver(() => {
    const all = document.querySelectorAll('.ag-studio-ai-output-message-content');
    if (all.length <= before) return;
    const text = (all[all.length - 1] as HTMLElement).innerText.trim();
    if (text === last) return;
    last = text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      obs.disconnect();
      const u = new SpeechSynthesisUtterance(text.slice(0, 900));
      u.lang = lang;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }, 2500);
  });
  obs.observe(panel, { subtree: true, childList: true, characterData: true });
  setTimeout(() => obs.disconnect(), 120_000);
}

export default function VoiceButton() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<Lang>('es-ES');
  const [speak, setSpeak] = useState(true);
  const [interim, setInterim] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const rec = useRef<any>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setSupported(Boolean(getRecognition()));
      if (!navigator.language.toLowerCase().startsWith('es')) setLang('en-US');
    });
  }, []);

  const start = () => {
    if (!supported) {
      setHint('Voice works in Chrome, Edge or Safari (Firefox does not support speech recognition yet).');
      setTimeout(() => setHint(null), 6000);
      return;
    }
    const r = getRecognition();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = t;
      }
      setInterim(t);
    };
    r.onerror = (e: any) => {
      setHint(e.error === 'not-allowed' ? 'Allow microphone access to use voice.' : `Voice error: ${e.error}`);
      setTimeout(() => setHint(null), 5000);
    };
    r.onend = () => {
      setListening(false);
      const text = (finalText || '').trim();
      setInterim('');
      if (text) {
        if (speak) speakNextAnswer(lang);
        window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: text }));
      }
    };
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="relative flex items-center">
      <button
        className={`rounded-l-md border border-[var(--line)] px-2.5 py-1 text-xs ${listening ? 'animate-pulse bg-rose-600 text-white' : 'hover:bg-[var(--hover)]'}`}
        onClick={() => (listening ? rec.current?.stop() : start())}
        title={supported ? `Talk to MerchantPilot (${lang === 'es-ES' ? 'Español' : 'English'})` : 'Voice needs Chrome, Edge or Safari'}
        aria-label="Voice"
        data-testid="voice-button"
      >
        {listening ? '● Listening' : '🎤'}
      </button>
      <button
        className="border-y border-[var(--line)] px-1.5 py-1 text-[10px] font-semibold hover:bg-[var(--hover)]"
        onClick={() => setLang((l) => (l === 'es-ES' ? 'en-US' : 'es-ES'))}
        title="Voice language"
      >
        {lang === 'es-ES' ? 'ES' : 'EN'}
      </button>
      <button
        className="rounded-r-md border border-[var(--line)] px-1.5 py-1 text-[10px] hover:bg-[var(--hover)]"
        onClick={() => setSpeak((s) => !s)}
        title={speak ? 'Answers are read aloud (click to mute)' : 'Answers are not read aloud (click to enable)'}
        aria-pressed={speak}
      >
        {speak ? '🔊' : '🔇'}
      </button>
      {(interim || hint) && (
        <div className="absolute right-0 top-8 z-[60] w-72 rounded-md border border-[var(--line)] bg-[var(--panel)] p-2 text-xs shadow-lg">{interim || hint}</div>
      )}
    </div>
  );
}
