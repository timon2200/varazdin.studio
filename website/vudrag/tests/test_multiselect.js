const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function runTests() {
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
    addEventListener(name, fn) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(fn);
    }
    removeEventListener(name, fn) {
      if (this.listeners.has(name)) {
        this.listeners.set(name, this.listeners.get(name).filter(f => f !== fn));
      }
    }
    dispatchEvent(name, eventObj = {}) {
      const list = this.listeners.get(name) || [];
      list.forEach(fn => fn(eventObj));
    }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    }
    closest(selector) {
      if (selector === '.media-card' && this.classList.contains('media-card')) return this;
      if (selector === '#command-backdrop' && this.tag === 'command-backdrop') return this;
      return null;
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
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    getBoundingClientRect() {
      const localX = Number(this.dataset.x || 0) - Number(this.dataset.w || 320) / 2;
      const localY = Number(this.dataset.y || 0) - Number(this.dataset.h || 240) / 2;
      const w = Number(this.dataset.w || 320) * 0.55;
      const h = Number(this.dataset.h || 240) * 0.55;
      const centerX = 750 + (localX + Number(this.dataset.w || 320) / 2) * 0.55;
      const centerY = 450 + (localY + Number(this.dataset.h || 240) / 2) * 0.55;
      return { left: centerX - w / 2, right: centerX + w / 2, top: centerY - h / 2, bottom: centerY + h / 2, width: w, height: h };
    }
  }

  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const windowListeners = new Map();
  const windowObj = {
    innerWidth: 1500,
    innerHeight: 900,
    addEventListener: (name, fn) => {
      if (!windowListeners.has(name)) windowListeners.set(name, []);
      windowListeners.get(name).push(fn);
    },
    removeEventListener: (name, fn) => {
      if (windowListeners.has(name)) {
        windowListeners.set(name, windowListeners.get(name).filter(f => f !== fn));
      }
    },
    dispatchEvent: (name, eventObj = {}) => {
      const list = windowListeners.get(name) || [];
      list.forEach(fn => fn(eventObj));
    },
    location: { hash: '' }
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
      querySelector: selector => element('world').querySelector(selector),
      addEventListener: () => {},
      body: new FakeElement('body')
    },
    window: windowObj
  });

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(script, 'Moodboard script exists');
  vm.runInContext(script.replace(/\n\s*init\(\);\s*$/, ''), context);

  console.log('--- TEST 1: Command Palette Entries ---');
  const commands = vm.runInContext('getMasterCommandList()', context);
  const cmdIds = commands.map(c => c.id);
  assert(cmdIds.includes('edit_select_all'), 'edit_select_all is in command list');
  assert(cmdIds.includes('edit_deselect_all'), 'edit_deselect_all is in command list');
  assert(cmdIds.includes('edit_group_selected'), 'edit_group_selected is in command list');
  assert(cmdIds.includes('edit_rearrange_selected'), 'edit_rearrange_selected is in command list');
  assert(cmdIds.includes('edit_ungroup_selected'), 'edit_ungroup_selected is in command list');
  console.log('✓ Command palette actions registered successfully');

  console.log('--- TEST 2: Board Rendering & Multi-Selection State ---');
  const testItems = [
    { id: 'card-1', type: 'image', title: 'Item 1', img_src: '1.jpg', x: 0, y: 0, w: 300, h: 200 },
    { id: 'card-2', type: 'image', title: 'Item 2', img_src: '2.jpg', x: 400, y: 0, w: 300, h: 200 },
    { id: 'card-3', type: 'image', title: 'Item 3', img_src: '3.jpg', x: 800, y: 0, w: 300, h: 200 },
    { id: 'card-4', type: 'image', title: 'Item 4', img_src: '4.jpg', x: 0, y: 400, w: 300, h: 200 }
  ];
  context.testItems = testItems;
  vm.runInContext('renderBoard(testItems)', context);

  // Single select
  vm.runInContext('selectCard(getCard("card-1"))', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 1);
  assert.equal(vm.runInContext('selectedCardIds.has("card-1")', context), true);
  assert.equal(vm.runInContext('getCard("card-1").classList.contains("is-selected")', context), true);
  assert.equal(vm.runInContext('getCard("card-2").classList.contains("is-selected")', context), false);

  // Toggle / Add selection
  vm.runInContext('selectCard(getCard("card-2"), "toggle")', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 2);
  assert.equal(vm.runInContext('selectedCardIds.has("card-1")', context), true);
  assert.equal(vm.runInContext('selectedCardIds.has("card-2")', context), true);

  // Select All
  vm.runInContext('selectAllCards()', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 4);
  assert.equal(vm.runInContext('getSelectedCards().length', context), 4);

  // Clear Selection
  vm.runInContext('selectCard(null)', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 0);
  assert.equal(vm.runInContext('getSelectedCards().length', context), 0);
  console.log('✓ Multi-selection state management verified');

  console.log('--- TEST 3: Middle Mouse Button Panning ---');
  const initPanX = vm.runInContext('panX', context);
  const initPanY = vm.runInContext('panY', context);

  // Middle mousedown (button 1)
  const viewport = element('viewport');
  viewport.dispatchEvent('mousedown', { button: 1, clientX: 500, clientY: 500, preventDefault() {}, target: viewport });
  assert.equal(vm.runInContext('isMiddlePanning', context), true, 'Middle panning is active');
  assert.equal(context.document.body.classList.contains('middle-panning'), true, 'Body has middle-panning class');

  // Mousemove during middle pan
  windowObj.dispatchEvent('mousemove', { clientX: 600, clientY: 550 });
  assert.equal(vm.runInContext('panX', context), initPanX + 100, 'panX updated by delta');
  assert.equal(vm.runInContext('panY', context), initPanY + 50, 'panY updated by delta');

  // Mouseup ends middle pan
  windowObj.dispatchEvent('mouseup', { button: 1 });
  assert.equal(vm.runInContext('isMiddlePanning', context), false, 'Middle panning ended');
  assert.equal(context.document.body.classList.contains('middle-panning'), false, 'Body class removed');
  console.log('✓ Middle mouse button panning verified');

  console.log('--- TEST 4: Multi-Card Dragging in Lockstep ---');
  vm.runInContext('renderBoard(testItems)', context);
  vm.runInContext('selectCard(getCard("card-1"), "replace")', context);
  vm.runInContext('selectCard(getCard("card-2"), "add")', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 2);

  // Start drag on card-1
  vm.runInContext('onCardMouseDown({ button: 0, clientX: 750, clientY: 450, stopPropagation() {} }, getCard("card-1"))', context);
  assert.equal(vm.runInContext('draggedGroupCards.length', context), 2, 'Both selected cards added to dragged group');
  assert.equal(vm.runInContext('getCard("card-1").classList.contains("dragging")', context), true);
  assert.equal(vm.runInContext('getCard("card-2").classList.contains("dragging")', context), true);

  // Move mouse by dx = 100, dy = 50 in screen space (delta in world = 100 / scale, 50 / scale)
  const scaleVal = vm.runInContext('scale', context);
  const startWorldX1 = 0;
  const startWorldX2 = 400;
  windowObj.dispatchEvent('mousemove', { clientX: 850, clientY: 500 });

  const newWorldX1 = Number(vm.runInContext('getCard("card-1").dataset.x', context));
  const newWorldX2 = Number(vm.runInContext('getCard("card-2").dataset.x', context));
  const deltaX1 = newWorldX1 - startWorldX1;
  const deltaX2 = newWorldX2 - startWorldX2;
  assert(Math.abs(deltaX1 - deltaX2) < 0.001, 'Both cards moved by the exact same world delta');
  assert(Math.abs(deltaX1 - (100 / scaleVal)) < 0.001, 'World delta matches mouse delta / scale');

  // Release mouse
  vm.runInContext('onCardMouseUp()', context);
  assert.equal(vm.runInContext('getCard("card-1").classList.contains("dragging")', context), false);
  assert.equal(vm.runInContext('getCard("card-2").classList.contains("dragging")', context), false);
  console.log('✓ Multi-card synchronized dragging verified');

  console.log('--- TEST 5: Group Selected Cards ---');
  vm.runInContext('renderBoard(testItems)', context);
  vm.runInContext('selectCard(getCard("card-1"), "replace")', context);
  vm.runInContext('selectCard(getCard("card-2"), "add")', context);
  vm.runInContext('selectCard(getCard("card-3"), "add")', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 3);

  // Group selected
  vm.runInContext('groupSelectedCards()', context);
  const rootCard = vm.runInContext('getCard("card-1")', context);
  assert.equal(rootCard.dataset.folderId, undefined, 'First card is root');
  assert.equal(vm.runInContext('getCard("card-2").dataset.folderId', context), 'card-1', 'card-2 joined root folder');
  assert.equal(vm.runInContext('getCard("card-3").dataset.folderId', context), 'card-1', 'card-3 joined root folder');
  assert.equal(vm.runInContext('folderCards("card-1").length', context), 3, 'Folder contains all 3 grouped cards');

  // Centroid check: avg of (0, 400, 800) = 400
  assert.equal(Number(rootCard.dataset.x), 400, 'Group positioned at centroid x');

  // Direct stack pose check: root card has 0deg base rotation, cards on top have slight organic rotations
  const stackCards = vm.runInContext('folderCards("card-1")', context);
  stackCards.forEach((c, idx) => {
    if (idx === 0) {
      assert(c.style.transform.includes('rotate(0deg)'), `Root Card ${c.dataset.id} has 0deg base rotation`);
    } else {
      assert(!c.style.transform.includes('rotate(0deg)'), `Top card ${c.dataset.id} has slight rotation in stack`);
    }
    const match = c.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
    assert(match, 'Card transform has valid translation');
    const expectedX = 400 - Number(c.dataset.w) / 2;
    const expectedY = 0 - Number(c.dataset.h) / 2;
    assert.equal(Number(match[1]), expectedX, `Card ${c.dataset.id} is directly stacked at centroid X with no horizontal offset`);
    assert.equal(Number(match[2]), expectedY, `Card ${c.dataset.id} is directly stacked at centroid Y with no vertical displacement`);
  });

  // TEST 5.1: Dragging card on top of CLOSED stack moves the WHOLE group
  const topCard = stackCards[2]; // top-most card in closed stack
  vm.runInContext(`onCardMouseDown({ button: 0, clientX: 750, clientY: 450, stopPropagation: () => {} }, getCard("${topCard.dataset.id}"))`, context);
  vm.runInContext('onCardMouseMove({ clientX: 850, clientY: 550 })', context);
  assert.equal(vm.runInContext('draggedGroupCards.length', context), 3, 'Dragging card on top of closed stack drags all 3 cards in group');
  vm.runInContext('onCardMouseUp()', context);
  assert.equal(vm.runInContext('folderCards("card-1").length', context), 3, 'Closed stack stays intact after dragging whole group');

  // TEST 5.2: Dragging card from OPEN deck detaches only that card
  vm.runInContext('toggleFolder("card-1")', context);
  assert.equal(vm.runInContext('expandedFolders.has("card-1")', context), true, 'Deck is now open');
  const cardToExtract = vm.runInContext('getCard("card-2")', context);
  vm.runInContext(`onCardMouseDown({ button: 0, clientX: 750, clientY: 450, stopPropagation: () => {} }, getCard("card-2"))`, context);
  vm.runInContext('onCardMouseMove({ clientX: 950, clientY: 650 })', context);
  assert.equal(vm.runInContext('draggedGroupCards.length', context), 1, 'Dragging card from open deck drags only the selected card');
  vm.runInContext('onCardMouseUp()', context);
  assert.equal(vm.runInContext('getCard("card-2").dataset.folderId', context), undefined, 'Extracted card is now independent');
  assert.equal(vm.runInContext('folderCards("card-1").length', context), 2, 'Remaining deck has 2 cards');

  // TEST 5.3: Click anywhere outside closes open deck
  vm.runInContext('closeAllFolders()', context);
  assert.equal(vm.runInContext('expandedFolders.size', context), 0, 'Clicking outside closes all open decks');

  console.log('✓ Group selected cards, stack rotation, closed stack whole-group drag, open deck single drag, and outside-close verified');

  console.log('--- TEST 6: Rearrange Selected Grid ---');
  vm.runInContext('renderBoard(testItems)', context);
  vm.runInContext('selectCard(getCard("card-1"), "replace")', context);
  vm.runInContext('selectCard(getCard("card-2"), "add")', context);
  vm.runInContext('selectCard(getCard("card-3"), "add")', context);
  vm.runInContext('selectCard(getCard("card-4"), "add")', context);

  vm.runInContext('rearrangeSelectedGrid()', context);
  const rearrangedPositions = testItems.map(item => ({
    id: item.id,
    x: Number(vm.runInContext(`getCard("${item.id}").dataset.x`, context)),
    y: Number(vm.runInContext(`getCard("${item.id}").dataset.y`, context))
  }));
  // Check all cards have distinct arranged coordinates
  const uniqueCoords = new Set(rearrangedPositions.map(p => `${p.x},${p.y}`));
  assert.equal(uniqueCoords.size, 4, 'All 4 cards rearranged into grid cells');
  console.log('✓ Rearrange selected grid verified');

  console.log('--- TEST 7: Ungroup Selected ---');
  // card-1 is root of folder with card-2 and card-3
  vm.runInContext('renderBoard(testItems)', context);
  vm.runInContext('attachToFolder(getCard("card-2"), getCard("card-1"))', context);
  vm.runInContext('attachToFolder(getCard("card-3"), getCard("card-1"))', context);
  assert.equal(vm.runInContext('folderCards("card-1").length', context), 3);

  vm.runInContext('selectCard(getCard("card-1"), "replace")', context);
  vm.runInContext('ungroupSelected()', context);
  assert.equal(vm.runInContext('getCard("card-2").dataset.folderId', context), undefined, 'card-2 ungrouped');
  assert.equal(vm.runInContext('getCard("card-3").dataset.folderId', context), undefined, 'card-3 ungrouped');
  assert.equal(vm.runInContext('folderCards("card-1").length', context), 1, 'Folder disbanded');
  console.log('✓ Ungroup selected verified');

  console.log('--- TEST 8: Multi-Card Deletion ---');
  vm.runInContext('renderBoard(testItems)', context);
  vm.runInContext('selectCard(getCard("card-1"), "replace")', context);
  vm.runInContext('selectCard(getCard("card-2"), "add")', context);
  assert.equal(vm.runInContext('selectedCardIds.size', context), 2);

  await vm.runInContext('deleteSelectedCard()', context);
  assert.equal(vm.runInContext('getCard("card-1")', context), null, 'card-1 deleted');
  assert.equal(vm.runInContext('getCard("card-2")', context), null, 'card-2 deleted');
  assert.notEqual(vm.runInContext('getCard("card-3")', context), null, 'card-3 preserved');
  assert.notEqual(vm.runInContext('getCard("card-4")', context), null, 'card-4 preserved');
  console.log('✓ Multi-card deletion verified');

  console.log('\n🎉 ALL MULTISELECT & REARRANGING TESTS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
