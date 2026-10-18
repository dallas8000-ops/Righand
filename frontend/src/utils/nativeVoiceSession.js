// Android speech recognition session for hold-to-talk.
// The Capacitor speech plugin never answers stop() and does not report "no speech" errors once
// partial results are on, so this session never waits for stop() and ends itself on a timer.

export const NATIVE_FINAL_WAIT_MS = 1200;
export const NATIVE_QUIET_LIMIT_MS = 9000;
export const NATIVE_SPEECH_LIMIT_MS = 20000;

export const NOTHING_HEARD_HINT = 'I did not hear anything. Hold the button, speak, then let go.';

export function createNativeVoiceSession({ plugin, language = 'en-US', onListening, onTranscript, onHint }) {
  let active = false;
  let latest = '';
  let watchdog = null;
  let finishTimer = null;

  const clearWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = null;
  };

  const requestStop = () => {
    try {
      Promise.resolve(plugin.stop()).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const end = () => {
    if (!active) return;
    active = false;
    clearWatchdog();
    onListening(false);
    requestStop();
    clearTimeout(finishTimer);
    // Final results arrive shortly after the recogniser stops.
    finishTimer = setTimeout(() => {
      const transcript = latest.trim();
      latest = '';
      if (transcript) {
        onHint('');
        onTranscript(transcript);
      } else {
        onHint(NOTHING_HEARD_HINT);
      }
    }, NATIVE_FINAL_WAIT_MS);
  };

  const start = async () => {
    if (active) return;
    active = true;
    latest = '';
    clearTimeout(finishTimer);
    onHint('Starting microphone…');
    try {
      await plugin.start({ language, maxResults: 1, partialResults: true, popup: false });
    } catch (error) {
      active = false;
      onListening(false);
      onHint(error?.message || 'Microphone busy — wait a moment and try again.');
      return;
    }
    if (!active) {
      // Released while the microphone was still starting.
      requestStop();
      return;
    }
    onListening(true);
    onHint('Listening… speak now, release when done.');
    watchdog = setTimeout(end, NATIVE_QUIET_LIMIT_MS);
  };

  return {
    start,
    end,
    isActive: () => active,
    handlePartial(matches) {
      const match = matches?.[0];
      if (match) latest = match;
    },
    handleState(status) {
      if (status === 'started') {
        clearWatchdog();
        watchdog = setTimeout(end, NATIVE_SPEECH_LIMIT_MS);
      } else if (status === 'stopped') {
        end();
      }
    },
    dispose() {
      active = false;
      clearWatchdog();
      clearTimeout(finishTimer);
    },
  };
}
