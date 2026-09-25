const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    if (force === undefined ? !this.values.has(name) : force) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.scrollTop = 0;
    this.clientHeight = 560;
    this.scrollHeight = 1200;
    this.offsetHeight = 76;
    this.offsetTop = 0;
    this.value = '';
    this._innerHTML = '';
    this.parentElement = null;
  }
  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    if (val.includes('command-selection')) {
      const sel = new FakeElement('div');
      sel.className = 'command-selection is-instant';
      sel.parentElement = this;
      this.children.push(sel);
    }
    const itemMatches = [...val.matchAll(/class="command-item\b([^"]*)"\s+data-index="(\d+)"/g)];
    itemMatches.forEach(m => {
      const item = new FakeElement('div');
      const idx = Number(m[2]);
      item.className = 'command-item ' + (m[1] || '').trim();
      item.dataset.index = String(idx);
      item.offsetTop = idx * 76;
      item.offsetHeight = 76;
      item.parentElement = this;
      this.children.push(item);
    });
  }
  get innerHTML() { return this._innerHTML; }
  set className(value) { this.classList.values = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classList.values].join(' '); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }
  removeEventListener(name, fn) {
    if (this.listeners.has(name)) {
      this.listeners.set(name, this.listeners.get(name).filter(f => f !== fn));
    }
  }
  dispatchEvent(event) {
    const list = this.listeners.get(event.type || 'keydown') || [];
    list.forEach(fn => fn(event));
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (selector.includes('.command-item.selected')) {
        if (child.classList.contains('command-item') && child.classList.contains('selected')) result.push(child);
      } else if (selector === '.command-item') {
        if (child.classList.contains('command-item')) result.push(child);
      } else if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (child.classList.contains(cls)) result.push(child);
      } else if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (child.id === id) result.push(child);
      }
    }
    return result;
  }
  focus() {}
  blur() {}
}

const elements = new Map();
const element = id => {
  if (!elements.has(id)) {
    const el = new FakeElement(id);
    el.id = id;
    elements.set(id, el);
  }
  return elements.get(id);
};

const modal = element('command-modal');
const cmdList = element('command-list');
cmdList.parentElement = modal;

const rafCallbacks = new Map();
let nextRaf = 1;
let mockTime = 1000;

function stepFrames(count = 1, dt = 16) {
  for (let i = 0; i < count; i++) {
    mockTime += dt;
    const callbacks = [...rafCallbacks.values()];
    rafCallbacks.clear();
    callbacks.forEach(cb => cb(mockTime));
  }
}

function stepUntilSettled(maxFrames = 30) {
  let f = 0;
  while (rafCallbacks.size > 0 && f < maxFrames) {
    stepFrames(1, 16);
    f++;
  }
}

const context = vm.createContext({
  console,
  Math,
  Date,
  Number,
  String,
  Array,
  Set,
  Map,
  JSON,
  URL,
  structuredClone,
  performance: { now: () => mockTime },
  requestAnimationFrame: fn => { const id = nextRaf++; rafCallbacks.set(id, fn); return id; },
  cancelAnimationFrame: id => rafCallbacks.delete(id),
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  fetch: async () => ({ ok: true, json: async () => ({ status: 'ok' }) }),
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: {
    getElementById: element,
    createElement: tag => new FakeElement(tag),
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: new FakeElement('body')
  },
  window: {
    innerWidth: 1500,
    innerHeight: 900,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { hash: '' }
  }
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script, 'Moodboard script exists');
vm.runInContext(script.replace(/\n\s*init\(\);\s*$/, ''), context);

// 1. Open command palette
vm.runInContext('openCommandBar()', context);
assert.equal(vm.runInContext('isCommandBarOpen', context), true, 'Command bar opened');

cmdList.clientHeight = 400;
cmdList.scrollHeight = 1400;
cmdList.scrollTop = 0;

// 2. Test rapid hold down simulation (multiple rapid keydown events)
for (let i = 0; i < 6; i++) {
  mockTime += 40;
  vm.runInContext('selectedIndex = Math.min(filteredCommands.length - 1, selectedIndex + 1); updateSelectedCommandUI(true);', context);
  stepFrames(1, 16);
}

assert(cmdList.scrollTop > 0, 'Scroll smoothly advanced during rapid key hold without resetting');

// Settle after release
stepUntilSettled();

assert(cmdList.scrollTop > 100, 'Scroll settled smoothly above the bottom blur zone');

// 3. Test holding Up to the top
for (let i = 0; i < 8; i++) {
  mockTime += 40;
  vm.runInContext('selectedIndex = Math.max(0, selectedIndex - 1); updateSelectedCommandUI(true);', context);
  stepFrames(1, 16);
}

stepUntilSettled();

assert.equal(cmdList.scrollTop, 0, 'Holding up clamped and smoothly settled at top (scrollTop = 0)');
assert.equal(modal.classList.contains('fade-tail'), true, 'Bottom blur (fade-tail) remains persistent');

console.log('✅ Rapid hold and continuous smooth scroll tests passed successfully!');
