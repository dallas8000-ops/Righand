import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const WEB_ERROR_MESSAGES = {
  'not-allowed': 'Microphone blocked — allow mic access in device settings.',
  'no-speech': 'No speech detected. Hold button and speak clearly.',
  aborted: '',
  network: 'Voice requires an internet connection.',
};

export function useVoiceCapture(onTranscript) {
  const onTranscriptRef = useRef(onTranscript);
  const speechRecognitionRef = useRef(null);
  const voiceSessionActiveRef = useRef(false);
  const latestTranscriptRef = useRef('');
  const nativePartialHandleRef = useRef(null);

  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState('none');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const applyTranscript = useCallback((text) => {
    const transcript = String(text || '').trim();
    if (transcript && onTranscriptRef.current) {
      onTranscriptRef.current(transcript);
    }
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let mounted = true;
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

          nativePartialHandleRef.current = await SpeechRecognition.addListener('partialResults', (data) => {
            const match = data?.matches?.[0];
            if (match) latestTranscriptRef.current = match;
          });

          speechRecognitionRef.current = SpeechRecognition;
          setVoiceEngine('native');
          setVoiceAvailable(true);
        } catch (error) {
          setVoiceHint(error?.message || 'Native voice recognition unavailable.');
        }
      })();

      return () => {
        mounted = false;
        nativePartialHandleRef.current?.remove?.();
        nativePartialHandleRef.current = null;
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
      if (!voiceSessionActiveRef.current) return;
      voiceSessionActiveRef.current = false;
      if (voiceEngine === 'web') {
        try {
          speechRecognitionRef.current?.stop();
        } catch {
          /* ignore */
        }
      } else if (voiceEngine === 'native') {
        speechRecognitionRef.current?.stop()
          .then(() => applyTranscript(latestTranscriptRef.current))
          .catch(() => {});
        setIsListening(false);
        setTimeout(() => setVoiceHint(''), 2000);
      }
    };
    window.addEventListener('pointerup', releaseVoice);
    window.addEventListener('pointercancel', releaseVoice);
    return () => {
      window.removeEventListener('pointerup', releaseVoice);
      window.removeEventListener('pointercancel', releaseVoice);
    };
  }, [applyTranscript, voiceEngine]);

  const startVoiceCapture = useCallback(async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!voiceAvailable || !speechRecognitionRef.current) {
      setVoiceHint('Voice recognition is not available on this device.');
      return;
    }
    if (voiceSessionActiveRef.current) return;

    voiceSessionActiveRef.current = true;
    latestTranscriptRef.current = '';
    setVoiceHint('Starting microphone…');

    if (voiceEngine === 'native') {
      try {
        await speechRecognitionRef.current.start({
          language: 'en-US',
          maxResults: 1,
          partialResults: true,
          popup: false,
        });
        setIsListening(true);
        setVoiceHint('Listening… speak now, release when done.');
      } catch (error) {
        voiceSessionActiveRef.current = false;
        setIsListening(false);
        setVoiceHint(error?.message || 'Microphone busy — wait a moment and try again.');
      }
      return;
    }

    try {
      speechRecognitionRef.current.start();
    } catch {
      voiceSessionActiveRef.current = false;
      setVoiceHint('Microphone busy — wait a moment and try again.');
    }
  }, [voiceAvailable, voiceEngine]);

  const stopVoiceCapture = useCallback(async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!speechRecognitionRef.current) return;

    voiceSessionActiveRef.current = false;

    if (voiceEngine === 'native') {
      try {
        await speechRecognitionRef.current.stop();
        applyTranscript(latestTranscriptRef.current);
      } catch {
        /* ignore */
      }
      setIsListening(false);
      setTimeout(() => setVoiceHint(''), 2000);
      return;
    }

    try {
      speechRecognitionRef.current.stop();
    } catch {
      /* ignore */
    }
  }, [applyTranscript, voiceEngine]);

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
