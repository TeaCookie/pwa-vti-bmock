// Template-based seed examples for the v5 tool set: query, reasoning, answers. Deterministic for a given seed.
// The templates are mine, so they will resemble the dev and hold-out prompts I also wrote: build_data.mjs check
// removes exact matches and reports near matches. LLM-augmented data (cactus generate-data) adds independent phrasing.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIGHTS = {
  'blue-left': ['blue left', 'left blue', 'the left blue light', 'the blue left light', 'blue left light'],
  'blue-right': ['blue right', 'right blue', 'the right blue light', 'the blue right light', 'blue right light'],
  yellow: ['yellow', 'the yellow light', 'yellow light', 'the yellow one'],
  red: ['red', 'the red light', 'red light', 'the red one']
};

// word shown in the prompt -> state
const ON_FRAMES = [
  ['turn on {L}', 'turn on'], ['switch on {L}', 'switch on'], ['turn {L} on', 'on'], ['switch {L} on', 'on'],
  ['put {L} on', 'on'], ['light up {L}', 'light up'], ['{L} on please', 'on'], ['can you turn on {L}', 'turn on'],
  ['could you switch {L} on', 'on'], ['please turn on {L}', 'turn on'], ['um turn {L} on', 'on'], ['hey switch on {L}', 'switch on'],
  ['i want {L} on', 'on'], ['power up {L}', 'power up'], ['enable {L}', 'enable']
];
const OFF_FRAMES = [
  ['turn off {L}', 'turn off'], ['switch off {L}', 'switch off'], ['turn {L} off', 'off'], ['switch {L} off', 'off'],
  ['shut off {L}', 'shut off'], ['kill {L}', 'kill'], ['{L} off please', 'off'], ['can you turn off {L}', 'turn off'],
  ['could you switch {L} off', 'off'], ['please turn off {L}', 'turn off'], ['um turn {L} off', 'off'], ['hey shut off {L}', 'shut off'],
  ['i want {L} off', 'off'], ['disable {L}', 'disable'], ['power down {L}', 'power down']
];

// per column: [phrase, args, reasoning fragment]
const STATE = {
  blue: [
    ['both halves on', { left: true, right: true }, "'both halves on' -> left true, right true"],
    ['both on', { left: true, right: true }, "'both on' -> left true, right true"],
    ['both halves off', { left: false, right: false }, "'both halves off' -> left false, right false"],
    ['both off', { left: false, right: false }, "'both off' -> left false, right false"],
    ['neither half on', { left: false, right: false }, "'neither half on' -> left false, right false"],
    ['the left half on', { left: true }, "'left half on' -> left true; right not mentioned"],
    ['the left half off', { left: false }, "'left half off' -> left false; right not mentioned"],
    ['the right half on', { right: true }, "'right half on' -> right true; left not mentioned"],
    ['the right half off', { right: false }, "'right half off' -> right false; left not mentioned"],
    ['left on and right off', { left: true, right: false }, "'left on' -> left true; 'right off' -> right false"],
    ['left off and right on', { left: false, right: true }, "'left off' -> left false; 'right on' -> right true"],
    ['only the left half on', { left: true, right: false }, "'only the left half on' -> left true, right false"],
    ['only the right half on', { left: false, right: true }, "'only the right half on' -> left false, right true"],
    ['the left half on and the right half off', { left: true, right: false }, "'left half on' -> left true; 'right half off' -> right false"]
  ],
  yellow: [
    ['on', { on: true }, "'on' -> on true"],
    ['off', { on: false }, "'off' -> on false"],
    ['the light on', { on: true }, "'light on' -> on true"],
    ['the light off', { on: false }, "'light off' -> on false"],
    ['turned on', { on: true }, "'turned on' -> on true"],
    ['turned off', { on: false }, "'turned off' -> on false"]
  ],
  red: [
    ['off to on', { transition: 'off-to-on' }, "'off to on' -> transition 'off-to-on'"],
    ['on to off', { transition: 'on-to-off' }, "'on to off' -> transition 'on-to-off'"],
    ['going from off to on', { transition: 'off-to-on' }, "'from off to on' -> transition 'off-to-on'"],
    ['going from on to off', { transition: 'on-to-off' }, "'from on to off' -> transition 'on-to-off'"],
    ['an off to on transition', { transition: 'off-to-on' }, "'off to on transition' -> transition 'off-to-on'"],
    ['an on to off transition', { transition: 'on-to-off' }, "'on to off transition' -> transition 'on-to-off'"]
  ]
};

const CREATE_FRAMES = [
  'log {C} {S}{T}', 'log the {C} {S}{T}', 'record {C} {S}{T}', 'add a {C} log {S}{T}', 'add a {C} log entry {S}{T}',
  'make a {C} log entry, {S}{T}', 'new {C} log: {S}{T}', 'put {C} {S} in the log{T}'
];
const UPDATE_FRAMES = [
  'change the {C} log entry at {X} to {S}', 'update the {C} log at {X} so it is {S}', 'set the {C} entry at {X} to {S}',
  'fix the {C} log from {X}: {S}', 'edit the {C} log entry at {X}, {S}', 'correct the {C} entry at {X} to {S}'
];
const DELETE_FRAMES = [
  'delete the {C} log entry at {X}', 'remove the {C} entry from {X}', 'erase the {C} log at {X}', 'drop the {C} log entry from {X}',
  'get rid of the {C} entry at {X}', 'delete the {C} log from {X}', 'remove the {C} log entry at {X}'
];
const CLEAR_FRAMES = [
  'clear all the {C} logs', 'wipe the {C} log column', 'empty the {C} log', 'delete everything in the {C} log',
  'clear the {C} log column', 'erase all {C} logs', 'remove every {C} log entry', 'wipe all the {C} entries',
  'delete all of the {C} logs', 'reset the {C} log column', 'purge the {C} logs', 'start the {C} log over from scratch',
  'get rid of every entry in the {C} log', 'i want the {C} log column emptied', 'nuke the {C} logs', 'clean out the {C} log'
];
const READ_FRAMES = [
  'show me the {C} logs', 'list the {C} log entries', 'display the {C} logs', "what's in the {C} log", 'view the {C} log',
  'see the {C} entries', 'pull up the {C} logs', 'show the {C} log entries', 'read me the {C} logs', 'print the {C} log',
  'open the {C} log', 'let me see the {C} log entries', 'which entries are in the {C} log', 'give me the {C} log', 'check the {C} logs',
  'bring up the {C} log column', 'what have I logged in {C}'
];
const READ_ALL = ['show all the logs', 'list every log entry', 'display all log entries', 'show me the logs', 'view all logs',
  'pull up all the logs', 'what logs do I have', 'read me all the log entries'];
const EXPORT_FMT = ['export the logs as {F}', 'give me a {F} export of the logs', 'download the logs as {F}', 'save all logs as {F}',
  'export all log data to {F}', 'i need the logs in {F}'];
const EXPORT_ANY = ['export the logs', 'export all log data', 'download the logs', 'i want to export my logs'];
const STATUS = ['what is the status of the lights', 'which lights are on', 'are any lights on', 'check the lights', 'is the red light on',
  'how are the lights', 'are the lights on or off', 'what state are the lights in', 'is the yellow one on', 'status of the lights please'];
const TIME = ['what time is it', 'what does the clock say', 'tell me the time', 'show me the clock', 'current time please',
  'what is the time', 'do you have the time', 'read the clock', 'time check'];
const TERMINAL = ['show the terminal history', 'what commands did I run in the terminal', 'list the terminal command history',
  'what did I type in the terminal', 'terminal history please', 'show previous terminal commands', 'what was my last terminal command',
  'recall the terminal commands'];

const OFF_TOPIC = [
  'what is the weather today', 'tell me a joke', 'hello', 'how are you', 'thanks a lot', 'good evening', 'play some jazz',
  'set an alarm for six', 'what is the capital of Spain', 'translate good night into german', 'remind me to buy milk',
  'who wrote hamlet', 'how many days are in a leap year', 'order me a pizza', 'call my brother', 'what is fifteen times four',
  'turn up the heat', 'open the window', 'lock the front door', 'send a text to Dana', 'what is the news today',
  'how far is the moon', 'give me a recipe for pancakes', 'dim the screen', 'take a photo', 'start a timer for ten minutes',
  'what is my schedule tomorrow', 'sing me a song', 'tell me something interesting', 'what is the exchange rate for euros',
  'how tall is mount everest', 'goodbye', 'never mind', 'what is your name', 'can you help me', 'next track please',
  'volume down', 'what day is it', 'is it going to rain', 'spell necessary'
];
const NEAR_MISS = [
  'what time does the store open', 'red wine recommendations', 'log in to my account', 'the clock tower in london',
  'what time zone is tokyo in', 'how do I read a book faster', 'blue sky or grey sky today', 'is the yellow bus coming',
  'show me a red car', 'which color is warmer, red or blue', 'list the planets in the solar system', 'display a picture of a lighthouse',
  'export my photos to the cloud', 'delete my email account', 'clear my browser history', 'what is the history of the clock',
  'terminal velocity of a falling cat', 'turn on the television', 'switch off the oven', 'turn off the music',
  'light a candle for me', 'status of my package delivery', 'the left side of the road', 'right now I am tired',
  'record a voice memo', 'add milk to my shopping list', 'remove the background from this image', 'clear the table',
  'what is the time complexity of quicksort', 'show me the menu', 'list my contacts', 'switch on the orange light',
  'switch on the purple light', 'turn off the white light', 'upload logs from my phone', 'reset the terminal screen',
  'close the terminal window', 'set the clock to midnight', 'make the yellow brighter', 'delete the last log'
];

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

// Grammars that widen the pool of requests no tool can serve.
const G_COUNTRY = ['Spain', 'Japan', 'Brazil', 'Canada', 'Kenya', 'Norway', 'Peru', 'Egypt', 'Chile', 'India'];
const G_CITY = ['Paris', 'Denver', 'Osaka', 'Lagos', 'Oslo', 'Lima', 'Cairo', 'Boston', 'Perth', 'Seoul'];
const G_FOOD = ['rice', 'pancakes', 'a omelette', 'lasagna', 'tomato soup', 'tacos', 'bread', 'noodles'];
const G_PERSON = ['Dana', 'my brother', 'Sam', 'mom', 'the plumber', 'Alex', 'my boss', 'grandma'];
const G_TOPIC = ['black holes', 'the roman empire', 'honey bees', 'volcanoes', 'jazz', 'the printing press', 'glaciers', 'chess'];
const G_THING = ['telephone', 'lightbulb', 'bicycle', 'compass', 'piano', 'camera', 'microscope', 'zipper'];
const G_CHORE = ['water the plants', 'buy milk', 'pay the rent', 'call the dentist', 'take out the trash', 'book a flight'];
const G_PLACE = ['bank', 'library', 'pharmacy', 'museum', 'post office', 'gym', 'bakery', 'cinema'];
const G_COLOR = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'grey'];
const G_ITEM = ['car', 'bicycle', 'jacket', 'sofa', 'balloon', 'sunset', 'apple', 'umbrella'];
const G_DEVICE = ['television', 'oven', 'radio', 'fan', 'coffee machine', 'projector', 'kettle', 'heater'];
const G_OTHERLIGHT = ['green', 'orange', 'purple', 'white', 'pink', 'blue and red', 'ceiling', 'porch'];
const G_ACCT = ['email account', 'profile', 'subscription', 'old photos', 'chat history', 'cache'];
const G_DATA = ['photos', 'contacts', 'playlist', 'calendar', 'notes', 'bookmarks'];

const OFF_FRAMES_GEN = [
  (r) => 'what is the capital of ' + pick(r, G_COUNTRY), (r) => 'what is the weather in ' + pick(r, G_CITY),
  (r) => 'how do I cook ' + pick(r, G_FOOD), (r) => 'call ' + pick(r, G_PERSON), (r) => 'text ' + pick(r, G_PERSON) + ' that I am late',
  (r) => 'tell me about ' + pick(r, G_TOPIC), (r) => 'who invented the ' + pick(r, G_THING), (r) => 'remind me to ' + pick(r, G_CHORE),
  (r) => 'what is ' + (2 + Math.floor(r() * 30)) + ' plus ' + (2 + Math.floor(r() * 30)),
  (r) => 'set a timer for ' + (2 + Math.floor(r() * 50)) + ' minutes', (r) => 'play some ' + pick(r, ['jazz', 'rock', 'classical', 'pop']) + ' music',
  (r) => 'book a table for ' + (2 + Math.floor(r() * 6)), (r) => 'how far is ' + pick(r, G_CITY) + ' from ' + pick(r, G_CITY)
];
const NEAR_FRAMES_GEN = [
  (r) => 'what time does the ' + pick(r, G_PLACE) + ' ' + pick(r, ['open', 'close']), (r) => pick(r, G_COLOR) + ' ' + pick(r, G_ITEM) + ' recommendations',
  (r) => 'show me a ' + pick(r, G_COLOR) + ' ' + pick(r, G_ITEM), (r) => 'turn on the ' + pick(r, G_DEVICE), (r) => 'switch off the ' + pick(r, G_DEVICE),
  (r) => 'turn on the ' + pick(r, G_OTHERLIGHT) + ' light', (r) => 'turn off the ' + pick(r, G_OTHERLIGHT) + ' light',
  (r) => 'delete my ' + pick(r, G_ACCT), (r) => 'export my ' + pick(r, G_DATA) + ' to the cloud', (r) => 'what is the history of the ' + pick(r, G_THING),
  (r) => 'list the ' + pick(r, ['planets', 'continents', 'oceans', 'primes under twenty']), (r) => 'clear the ' + pick(r, ['table', 'dishes', 'desk', 'whiteboard']),
  (r) => 'what is the status of my ' + pick(r, ['order', 'package', 'refund', 'visa application']), (r) => 'record a ' + pick(r, ['voice memo', 'video', 'podcast']),
  (r) => 'read me the ' + pick(r, ['news', 'headlines', 'recipe']), (r) => 'which is warmer, ' + pick(r, G_COLOR) + ' or ' + pick(r, G_COLOR)
];

function surface(r, s) {
  const x = r();
  if (x < 0.08) return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  if (x < 0.14) return s.charAt(0).toUpperCase() + s.slice(1);
  if (x < 0.18) return s + ' please';
  if (x < 0.21) return 'uh ' + s;
  if (x < 0.23) return s.toUpperCase();
  return s;
}

const pad = (n) => String(n).padStart(2, '0');
function randomTime(r) {
  const h = Math.floor(r() * 24);
  const m = pick(r, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, Math.floor(r() * 60)]);
  const hhmm = pad(h) + ':' + pad(m);
  const x = r();
  if (x < 0.78) return { value: hhmm, say: hhmm, why: "'" + hhmm + "' -> time '" + hhmm + "'" };
  if (x < 0.9) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const say = h12 + ':' + pad(m) + (h < 12 ? ' am' : ' pm');
    return { value: hhmm, say, why: "'" + say + "' -> 24-hour time '" + hhmm + "'" };
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const say = h12 + (h < 12 ? ' am' : ' pm');
  const value = pad(h) + ':00';
  return { value, say, why: "'" + say + "' -> 24-hour time '" + value + "'" };
}

const fill = (frame, map) => frame.replace(/\{(\w)\}/g, (_, k) => (k in map ? map[k] : ''));

function toggleExample(r) {
  const id = pick(r, Object.keys(LIGHTS));
  const on = r() < 0.5;
  const [frame, word] = pick(r, on ? ON_FRAMES : OFF_FRAMES);
  const L = pick(r, LIGHTS[id]);
  return {
    query: surface(r, fill(frame, { L })),
    reasoning: "'" + L + "' -> light '" + id + "'; '" + word + "' -> state " + on + '.',
    answers: [{ name: 'toggle_light', arguments: { light: id, state: on } }]
  };
}

function logExample(r, kind) {
  const col = pick(r, ['blue', 'yellow', 'red']);
  const [S, args, why] = pick(r, STATE[col]);
  const needTime = kind !== 'create' || r() < 0.5;
  const t = needTime ? randomTime(r) : null;
  const frames = kind === 'create' ? CREATE_FRAMES : UPDATE_FRAMES;
  const frame = pick(r, frames);
  const query = fill(frame, { C: col, S, T: t ? ' at ' + t.say : '', X: t ? t.say : '' });
  const a = { column: col };
  if (t) a.time = t.value;
  Object.assign(a, args);
  const bits = ["'" + col + "' -> column '" + col + "'", why, t ? t.why : 'no time given, so time is omitted'];
  return { query: surface(r, query), reasoning: bits.join('; ') + '.', answers: [{ name: 'set_log_entry', arguments: a }] };
}

function deleteExample(r) {
  const col = pick(r, ['blue', 'yellow', 'red']);
  const t = randomTime(r);
  return {
    query: surface(r, fill(pick(r, DELETE_FRAMES), { C: col, X: t.say })),
    reasoning: "'" + col + "' -> column '" + col + "'; " + t.why + '; one entry at a time, so delete_log_entry.',
    answers: [{ name: 'delete_log_entry', arguments: { column: col, time: t.value } }]
  };
}

function clearExample(r) {
  const col = pick(r, ['blue', 'yellow', 'red']);
  return {
    query: surface(r, fill(pick(r, CLEAR_FRAMES), { C: col })),
    reasoning: "'" + col + "' -> column '" + col + "'; every entry in the column, so clear_logs.",
    answers: [{ name: 'clear_logs', arguments: { column: col } }]
  };
}

function readExample(r) {
  if (r() < 0.3) {
    return { query: surface(r, pick(r, READ_ALL)), reasoning: 'all log columns, no column named; reading, not deleting.', answers: [{ name: 'read_logs', arguments: {} }] };
  }
  const col = pick(r, ['blue', 'yellow', 'red']);
  return {
    query: surface(r, fill(pick(r, READ_FRAMES), { C: col })),
    reasoning: "'" + col + "' -> column '" + col + "'; showing entries, not deleting.",
    answers: [{ name: 'read_logs', arguments: { column: col } }]
  };
}

function exportExample(r) {
  if (r() < 0.3) return { query: surface(r, pick(r, EXPORT_ANY)), reasoning: 'export with no format named, so format is omitted.', answers: [{ name: 'export_logs', arguments: {} }] };
  const F = pick(r, ['csv', 'json', 'CSV', 'JSON']);
  return {
    query: surface(r, fill(pick(r, EXPORT_FMT), { F })),
    reasoning: "'" + F + "' -> format '" + F.toLowerCase() + "'.",
    answers: [{ name: 'export_logs', arguments: { format: F.toLowerCase() } }]
  };
}

const simple = (name, list, why) => (r) => ({ query: surface(r, pick(r, list)), reasoning: why, answers: [{ name, arguments: {} }] });
const statusExample = simple('get_light_status', STATUS, 'asking whether the lights are on or off, so get_light_status.');
const timeExample = simple('get_clock_time', TIME, 'asking for the time on the clock, so get_clock_time.');
const terminalExample = simple('get_terminal_history', TERMINAL, 'commands typed in the terminal, not log entries, so get_terminal_history.');

function negativeExample(r) {
  const near = r() < 0.5;
  const q = r() < 0.4 ? pick(r, near ? NEAR_MISS : OFF_TOPIC) : pick(r, near ? NEAR_FRAMES_GEN : OFF_FRAMES_GEN)(r);
  return {
    query: surface(r, q),
    reasoning: near
      ? "'" + q + "' is not about the indicator lights, the clock, the logs or the terminal history, so no tool applies."
      : 'nothing here asks for the lights, clock, logs or terminal, so no tool applies.',
    answers: []
  };
}

const LEAF = [toggleExample, statusExample, timeExample, readExample, exportExample, terminalExample];
const JOIN = [' and ', ' then ', ' and then ', ', then ', ' and also '];
function compoundExample(r) {
  const parts = [];
  const n = r() < 0.85 ? 2 : 3;
  for (let tries = 0; parts.length < n && tries < 20; tries++) {
    const p = (r() < 0.15 ? (rr) => logExample(rr, 'create') : pick(r, LEAF))(r);
    const key = p.answers[0].name + (p.answers[0].name === 'toggle_light' ? p.answers[0].arguments.light : '');
    if (parts.some((q) => q.answers[0].name + (q.answers[0].name === 'toggle_light' ? q.answers[0].arguments.light : '') === key)) continue;
    parts.push(p);
  }
  // phrases inside a compound read better without the surface noise, so rebuild from the leaf query
  const query = parts.map((p) => p.query.replace(/[.]$/, '').replace(/ please$/i, '').replace(/^uh /, '').toLowerCase()).join(pick(r, JOIN));
  return {
    query: surface(r, query),
    reasoning: parts.map((p, i) => 'part ' + (i + 1) + ': ' + p.reasoning).join(' '),
    answers: parts.flatMap((p) => p.answers)
  };
}

export function generateSeed(count = 1100, seed = 20261120) {
  const r = rng(seed);
  const plan = [
    [toggleExample, 0.20], [(rr) => logExample(rr, 'create'), 0.12], [(rr) => logExample(rr, 'update'), 0.12],
    [deleteExample, 0.06], [clearExample, 0.04], [readExample, 0.08], [exportExample, 0.03], [statusExample, 0.04],
    [timeExample, 0.04], [terminalExample, 0.04], [compoundExample, 0.10], [negativeExample, 0.19]
  ];
  const total = plan.reduce((s, p) => s + p[1], 0);
  const out = [];
  for (const [fn, share] of plan) {
    const n = Math.round((count * share) / total);
    for (let i = 0; i < n; i++) out.push(fn(r));
  }
  return out;
}
