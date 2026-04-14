import { useState, useCallback, useEffect } from 'react';
import { WorkerProvider, useWorker } from './WorkerContext';
import WorkerSplashScreen from './WorkerSplashScreen';
import WorkerAuthScreen from './WorkerAuthScreen';
import WorkerLayout from './WorkerLayout';
import './WorkerDashboard.css';

const LANG_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
};

function WorkerDashboardInner() {
  const { state } = useWorker();
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashComplete = useCallback(() => setSplashDone(true), []);
  const handleLogin = useCallback(() => {}, []); // state.isLoggedIn handles transition

  // Select-to-Speak: read aloud clicked text when voice is enabled
  useEffect(() => {
    if (!state.isVoiceEnabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Skip if clicking on interactive elements (buttons, inputs, selects, toggles)
      const tag = target.tagName.toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag)) return;

      // Get the innermost text content
      const text = (target.innerText || target.textContent || '').trim();
      if (!text || text.length > 500) return; // skip empty or excessively long text

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANG_MAP[state.language] || 'en-IN';
      utterance.rate = 0.95;
      utterance.pitch = 1;

      window.speechSynthesis.speak(utterance);
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
      window.speechSynthesis.cancel();
    };
  }, [state.isVoiceEnabled, state.language]);

  if (!splashDone) {
    return <WorkerSplashScreen onComplete={handleSplashComplete} />;
  }

  if (!state.isLoggedIn) {
    return (
      <div className={`worker-dashboard ${state.theme === 'light' ? 'light-theme' : ''}`}>
        <WorkerAuthScreen onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className={`worker-dashboard ${state.theme === 'light' ? 'light-theme' : ''}`}>
      <WorkerLayout />
    </div>
  );
}

export default function WorkerDashboardPage() {
  return (
    <WorkerProvider>
      <WorkerDashboardInner />
    </WorkerProvider>
  );
}
