import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { createNativeVoiceSession } from '../utils/nativeVoiceSession';

const WEB_ERROR_MESSAGES = {
  'not-allowed': 'Microphone blocked — allow mic access for this site in the browser address bar.',
  'no-speech': 'No speech detected. Hold button and speak clearly.',
  'audio-capture': 'No microphone found — in Windows Sound settings choose your headset as the input device, then try again.',
  aborted: '',
};

const EMBEDDED_BROWSER_HINT = 'Voice entry does not work inside this built-in browser. Open the app in Chrome or Edge, or use the Android app. You can type the entry instead.';
const SPEECH_SERVICE_HINT = 'This browser cannot reach its speech service, so voice is turned off. Use Chrome or Edge, or the Android app, or type the entry.';

export function useVoiceCapture(onTranscript, onUnavailable) {
  const onTranscriptRef = useRef(onTranscript);
  const onUnavailableRef = useRef(onUnavailable);
  const speechRecognitionRef = useRef(null);
  const nativeSessionRef = useRef(null);
  const voiceSessionActiveRef = useRef(false);

  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState('none');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onUnavailableRef.current = onUnavailable;
  }, [onTranscript, onUnavailable]);

  const applyTranscript = useCallback((text) => {
    const transcript = String(text || '').trim();
    if (transcript && onTranscriptRef.current) {
      onTranscriptRef.current(transcript);
    }
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let mounted = true;
      const handles = [];
      (async () => {
        try {
          const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
          const { available } = await SpeechRecognition.available();
          if (!mounted || !available) return;

          const permission = await SpeechRecognition.requestPermissions();
          if (permission.speechRecognition === 'denied') {
            setVoiceHint('Microphone blocked — allow mic access in Android settings.');
            return;
          }

          const session = createNativeVoiceSession({
            plugin: SpeechRecognition,
            onListening: setIsListening,
            onTranscript: applyTranscript,
            onHint: setVoiceHint,
          });
          handles.push(
            await SpeechRecognition.addListener('partialResults', (data) => session.handlePartial(data?.matches)),
            await SpeechRecognition.addListener('listeningState', (data) => session.handleState(data?.status)),
          );
          nativeSessionRef.current = session;
          speechRecognitionRef.current = SpeechRecognition;
          setVoiceEngine('native');
          setVoiceAvailable(true);
        } catch (error) {
          setVoiceHint(error?.message || 'Native voice recognition unavailable.');
        }
      })();

      return () => {
        mounted = false;
        nativeSessionRef.current?.dispose();
        nativeSessionRef.current = null;
        handles.forEach((handle) => handle?.remove?.());
        import('@capacitor-community/speech-recognition')
          .then(({ SpeechRecognition }) => SpeechRecognition.removeAllListeners())
          .catch(() => {});
      };
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceHint('Voice entry works in Chrome or the RigHand Android app with mic permission.');
      return undefined;
    }
    // Embedded Chromium (e.g. the VS Code browser) exposes the API but has no speech service behind it.
    if (/Electron\//i.test(navigator.userAgent)) {
      setVoiceHint(EMBEDDED_BROWSER_HINT);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceHint('Listening… speak now, release when done.');
    };
    recognition.onend = () => {
      voiceSessionActiveRef.current = false;
      setIsListening(false);
      setTimeout(() => setVoiceHint(''), 2000);
    };
    recognition.onerror = (event) => {
      voiceSessionActiveRef.current = false;
      setIsListening(false);
      if (event.error === 'network' || event.error === 'service-not-allowed') {
        if (navigator.onLine === false) {
          setVoiceHint('You are offline. Voice needs a connection - type the entry instead.');
        } else {
          setVoiceHint(SPEECH_SERVICE_HINT);
          setVoiceAvailable(false);
        }
        onUnavailableRef.current?.();
        return;
      }
      const msg = WEB_ERROR_MESSAGES[event.error] || `Voice error: ${event.error}`;
      if (msg) setVoiceHint(msg);
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      applyTranscript(transcript);
    };

    speechRecognitionRef.current = recognition;
    setVoiceEngine('web');
    setVoiceAvailable(true);

    return () => {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, [applyTranscript]);

  useEffect(() => {
    const releaseVoice = () => {
      if (voiceEngine === 'native') {
        nativeSessionRef.current?.end();
        return;
      }
      if (!voiceSessionActiveRef.current) return;
      voiceSessionActiveRef.current = false;
      try {
        speechRecognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointerup', releaseVoice);
    window.addEventListener('pointercancel', releaseVoice);
    return () => {
      window.removeEventListener('pointerup', releaseVoice);
      window.removeEventListener('pointercancel', releaseVoice);
    };
  }, [voiceEngine]);

  const startVoiceCapture = useCallback(async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!voiceAvailable || !speechRecognitionRef.current) {
      setVoiceHint('Voice recognition is not available on this device.');
      return;
    }

    if (voiceEngine === 'native') {
      await nativeSessionRef.current?.start();
      return;
    }

    if (voiceSessionActiveRef.current) return;
    voiceSessionActiveRef.current = true;
    setVoiceHint('Starting microphone…');
    try {
      speechRecognitionRef.current.start();
    } catch {
      voiceSessionActiveRef.current = false;
      setVoiceHint('Microphone busy — wait a moment and try again.');
    }
  }, [voiceAvailable, voiceEngine]);

  const stopVoiceCapture = useCallback((e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (voiceEngine === 'native') {
      nativeSessionRef.current?.end();
      return;
    }
    if (!speechRecognitionRef.current) return;

    voiceSessionActiveRef.current = false;
    try {
      speechRecognitionRef.current.stop();
    } catch {
      /* ignore */
    }
  }, [voiceEngine]);

  const toggleVoiceCapture = useCallback(() => {
    if (isListening || voiceSessionActiveRef.current) {
      stopVoiceCapture();
    } else {
      startVoiceCapture({ preventDefault: () => {}, stopPropagation: () => {} });
    }
  }, [isListening, startVoiceCapture, stopVoiceCapture]);

  return {
    voiceAvailable,
    voiceHint,
    isListening,
    startVoiceCapture,
    stopVoiceCapture,
    toggleVoiceCapture,
  };
}
