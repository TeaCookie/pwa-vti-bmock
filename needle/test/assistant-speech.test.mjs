import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSpeechInput } = require('../../assistant-ui.js');

class FakeInput extends EventTarget {
  constructor(value = '') { super(); this.value = value; }
}

function harness({ supported = true } = {}) {
  const states = [], errors = [];
  let recognition;
  class Recognition {
    constructor() { recognition = this; }
    start() { this.started = true; if (this.onstart) this.onstart(); }
    stop() { this.stopped = true; if (this.onend) this.onend(); }
  }
  class FakeRoot {
    constructor() {
      this.Event = Event;
      this.navigator = { language: 'en-CA' };
      if (supported) this.SpeechRecognition = Recognition;
    }
  }
  const input = new FakeInput('existing text');
  const root = new FakeRoot();
  const speech = createSpeechInput({ root, input, onState: (s) => states.push(s), onError: (e) => errors.push(e) });
  return { speech, input, states, errors, get recognition() { return recognition; } };
}

test('speech recognition is optional when the browser does not support it', () => {
  const { speech, states } = harness({ supported: false });
  assert.equal(speech.supported, false);
  assert.equal(speech.start(), false);
  assert.deepEqual(states, ['unsupported']);
});

test('speech starts only on explicit invocation and inserts final transcription as editable text', () => {
  const { speech, input, states, recognition } = harness();
  let inputEvents = 0;
  input.addEventListener('input', () => inputEvents++);
  assert.equal(recognition.started, undefined);
  assert.equal(speech.start(), true);
  assert.equal(recognition.started, true);
  recognition.onresult({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: 'turn the red light on' }], { isFinal: true }),
      Object.assign([{ transcript: 'partial words' }], { isFinal: false })
    ]
  });
  assert.equal(input.value, 'existing text turn the red light on');
  assert.equal(inputEvents, 1);
  assert.deepEqual(states, ['listening']);
});

test('transcription never submits the assistant form', () => {
  const { speech, input, recognition } = harness();
  let submits = 0;
  input.addEventListener('submit', () => submits++);
  speech.start();
  recognition.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: 'hello assistant' }], { isFinal: true })]
  });
  assert.equal(input.value, 'existing text hello assistant');
  assert.equal(submits, 0);
});

test('permission denial and browser speech-service errors are explained', () => {
  const { speech, recognition, errors, states } = harness();
  speech.start();
  recognition.onerror({ error: 'not-allowed' });
  assert.match(errors[0], /permission was denied/i);
  assert.equal(states.at(-1), 'idle');
  recognition.onerror({ error: 'network' });
  assert.match(errors[1], /remote|speech service|connection/i);
});

test('active recognition can be stopped by the same control', () => {
  const { speech, recognition, states } = harness();
  speech.start();
  assert.equal(speech.start(), true);
  assert.equal(recognition.stopped, true);
  assert.equal(states.at(-1), 'idle');
});
