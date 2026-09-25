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
    this.hidden = false;
  }
  set className(value) { this.classList.values = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classList.values].join(' '); }
  get offsetWidth() { return Number(this.dataset.w || 0); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
  querySelectorAll(selector) {
    return this.children.filter(child => {
      if (!child.classList.contains('media-card')) return false;
      if (selector.includes('[data-id]') && !child.dataset.id) return false;
      if (selector.includes('[data-folder-id]') && !child.dataset.folderId) return false;
      if (selector.includes('.is-selected') && !child.classList.contains('is-selected')) return false;
      return true;
    });
  }
  getBoundingClientRect() {
    const transform = this.style.transform || '';
    const match = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
    const localX = match ? Number(match[1]) : Number(this.dataset.x || 0) - Number(this.dataset.w || 0) / 2;
    const localY = match ? Number(match[2]) : Number(this.dataset.y || 0) - Number(this.dataset.h || 0) / 2;
    const cardScale = Number(transform.match(/scale\(([-\d.]+)\)/)?.[1] || 1);
    const w = Number(this.dataset.w || 0) * cardScale * 0.55;
    const h = Number(this.dataset.h || 0) * cardScale * 0.55;
    const centerX = 750 + (localX + Number(this.dataset.w || 0) / 2) * 0.55;
    const centerY = 450 + (localY + Number(this.dataset.h || 0) / 2) * 0.55;
    return { left: centerX - w / 2, right: centerX + w / 2, top: centerY - h / 2, bottom: centerY + h / 2, width: w, height: h };
  }
}

const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, new FakeElement(id));
  return elements.get(id);
};
const timers = new Map();
const storage = new Map();
const requests = [];
let nextTimer = 1;
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
  performance: { now: () => 1000 },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
  clearTimeout: id => timers.delete(id),
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ status: 'ok' }) };
  },
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  },
  document: {
    getElementById: element,
    createElement: tag => new FakeElement(tag),
    querySelectorAll: selector => element('world').querySelectorAll(selector),
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

const items = [
  { id: 'small-root', type: 'image', title: 'Small root', img_src: 'root.jpg', x: 0, y: 0, w: 360, h: 220 },
  { id: 'large-video', type: 'video', title: 'Large video', video_src: 'video.mp4', x: 700, y: 0, w: 1100, h: 620 },
  { id: 'second-image', type: 'image', title: 'Second image', img_src: 'second.jpg', x: -700, y: 0, w: 360, h: 220 },
  { id: 'dragged-image', type: 'image', title: 'Dragged image', img_src: 'dragged.jpg', x: 900, y: 0, w: 360, h: 220 }
];
context.testItems = items;
vm.runInContext('renderBoard(testItems)', context);
vm.runInContext('attachToFolder(getCard("large-video"), getCard("small-root"))', context);
assert.equal(element('world').querySelectorAll('.media-card[data-folder-id]').length, 1, 'Large video joins folder');
assert.equal(vm.runInContext('getCard("large-video").dataset.folderId', context), 'small-root');
assert(requests.some(request => request.url.includes('save_positions') && JSON.parse(request.options.body).positions['large-video'].folderId === 'small-root'),
  'Folder membership is sent to persistence API');

vm.runInContext('attachToFolder(getCard("second-image"), getCard("small-root"))', context);
vm.runInContext('toggleFolder("small-root")', context);
assert.equal(vm.runInContext('getCard("large-video").attributes["aria-expanded"]', context), 'true', 'Folder is expanded');
assert(vm.runInContext('getCard("large-video").style.transform.includes("scale(")', context), 'Expanded cards receive fitted poses');
vm.runInContext('toggleFolder("small-root")', context);
assert.equal(vm.runInContext('getCard("large-video").attributes["aria-expanded"]', context), 'false', 'Folder collapses');

const savedPositions = vm.runInContext('captureBoardSnapshot().positions', context);
context.savedPositions = savedPositions;
vm.runInContext('renderBoard(testItems, savedPositions)', context);
assert.equal(vm.runInContext('getCard("large-video").dataset.folderId', context), 'small-root', 'Video membership restores on reload');
assert.equal(vm.runInContext('getCard("second-image").dataset.folderId', context), 'small-root', 'Image membership restores on reload');

vm.runInContext('openLightbox(testItems[2])', context);
assert.equal(element('folder-lightbox-prev').hidden, false, 'Folder lightbox shows previous navigation');
assert.equal(element('folder-lightbox-next').hidden, false, 'Folder lightbox shows next navigation');
vm.runInContext('navigateFolderLightbox(1)', context);
assert.equal(vm.runInContext('activeLightboxItem.id', context), 'small-root', 'Lightbox wraps to next image');
vm.runInContext('closeLightbox()', context);
assert.equal(element('folder-lightbox-prev').hidden, true, 'Lightbox navigation hides on close');

vm.runInContext('onCardMouseDown({button:0,clientX:1245,clientY:450,stopPropagation(){}},getCard("dragged-image"))', context);
vm.runInContext('onCardMouseMove({clientX:750,clientY:450})', context);
const hoverTimer = [...timers.values()].find(timer => timer.delay === 1500);
assert(hoverTimer, 'Dragging over a folder starts the 1.5 second hold timer');
hoverTimer.fn();
assert.equal(vm.runInContext('getCard("dragged-image").dataset.folderId', context), 'small-root', 'Hold timer stacks dragged card');

console.log('Folder interaction, persistence, lightbox, and 1.5 second hover checks passed');
