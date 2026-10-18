import { createNativeVoiceSession, NATIVE_FINAL_WAIT_MS, NATIVE_QUIET_LIMIT_MS, NATIVE_SPEECH_LIMIT_MS, NOTHING_HEARD_HINT } from './nativeVoiceSession';

const neverAnswers = () => new Promise(() => {});

const makeSession = (pluginOverrides = {}) => {
  const plugin = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(neverAnswers),
    ...pluginOverrides,
  };
  const events = { listening: [], transcripts: [], hints: [] };
  const session = createNativeVoiceSession({
    plugin,
    onListening: (value) => events.listening.push(value),
    onTranscript: (text) => events.transcripts.push(text),
    onHint: (text) => events.hints.push(text),
  });
  return { plugin, events, session };
};

describe('native voice session', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('releasing the button ends the session even though stop() never answers', async () => {
    const { plugin, events, session } = makeSession();
    await session.start();
    expect(events.listening).toEqual([true]);

    session.handlePartial(['fuel 50000']);
    session.end();

    expect(events.listening).toEqual([true, false]);
    expect(plugin.stop).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(NATIVE_FINAL_WAIT_MS);
    expect(events.transcripts).toEqual(['fuel 50000']);
  });

  test('releasing with nothing heard shows a helpful hint and resets', async () => {
    const { events, session } = makeSession();
    await session.start();
    session.end();
    jest.advanceTimersByTime(NATIVE_FINAL_WAIT_MS);

    expect(events.transcripts).toEqual([]);
    expect(events.hints[events.hints.length - 1]).toBe(NOTHING_HEARD_HINT);
    expect(session.isActive()).toBe(false);
  });

  test('gives up by itself when the recogniser fails silently (no speech detected)', async () => {
    const { events, session } = makeSession();
    await session.start();
    jest.advanceTimersByTime(NATIVE_QUIET_LIMIT_MS);

    expect(events.listening).toEqual([true, false]);
    expect(session.isActive()).toBe(false);
  });

  test('speech starting extends the limit, and the recogniser stopping ends the session', async () => {
    const { events, session } = makeSession();
    await session.start();
    session.handleState('started');
    jest.advanceTimersByTime(NATIVE_QUIET_LIMIT_MS + 1000);
    expect(session.isActive()).toBe(true);

    session.handlePartial(['diesel 120000']);
    session.handleState('stopped');
    jest.advanceTimersByTime(NATIVE_FINAL_WAIT_MS);
    expect(events.listening).toEqual([true, false]);
    expect(events.transcripts).toEqual(['diesel 120000']);
  });

  test('a very long hold is cut off', async () => {
    const { session } = makeSession();
    await session.start();
    session.handleState('started');
    jest.advanceTimersByTime(NATIVE_SPEECH_LIMIT_MS);
    expect(session.isActive()).toBe(false);
  });

  test('a start failure resets the button and shows the reason', async () => {
    const { events, session } = makeSession({ start: jest.fn().mockRejectedValue(new Error('Missing permission')) });
    await session.start();

    expect(session.isActive()).toBe(false);
    expect(events.listening).toEqual([false]);
    expect(events.hints[events.hints.length - 1]).toBe('Missing permission');
  });

  test('releasing while the microphone is still starting stops it and never shows listening', async () => {
    let finishStart;
    const { plugin, events, session } = makeSession({ start: jest.fn(() => new Promise((resolve) => { finishStart = resolve; })) });
    const starting = session.start();
    session.end();
    finishStart();
    await starting;

    expect(events.listening).toEqual([false]);
    expect(plugin.stop).toHaveBeenCalledTimes(2);
  });

  test('a second press while active is ignored and a new session starts clean', async () => {
    const { plugin, events, session } = makeSession();
    await session.start();
    await session.start();
    expect(plugin.start).toHaveBeenCalledTimes(1);

    session.handlePartial(['old text']);
    session.end();
    jest.advanceTimersByTime(NATIVE_FINAL_WAIT_MS);
    await session.start();
    session.end();
    jest.advanceTimersByTime(NATIVE_FINAL_WAIT_MS);
    expect(events.transcripts).toEqual(['old text']);
  });
});
