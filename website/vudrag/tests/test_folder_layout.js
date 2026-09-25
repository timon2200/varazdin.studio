const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script, 'Moodboard inline script is present');
new Function(script);

const start = script.indexOf('function calculateFolderFanLayout(');
const end = script.indexOf('\n    function layoutFolder(', start);
assert(start >= 0 && end > start, 'The production fan layout function is present');
const calculate = new Function(`${script.slice(start, end)}; return calculateFolderFanLayout;`)();

function checkLayout(name, sizes, viewport, cameraScale, anchor) {
  const margin = 32;
  const bounds = {
    left: margin / cameraScale,
    right: (viewport.width - margin) / cameraScale,
    top: margin / cameraScale,
    bottom: (viewport.height - margin) / cameraScale
  };
  const poses = calculate(sizes, bounds, anchor.x, anchor.y, cameraScale);
  assert.equal(poses.length, sizes.length, `${name}: every card has a pose`);
  const rectangles = poses.map((pose, index) => {
    assert(Number.isFinite(pose.x) && Number.isFinite(pose.y), `${name}: finite position for card ${index}`);
    assert(pose.scale > 0 && pose.scale <= 1, `${name}: valid scale for card ${index}`);
    const angle = pose.rot * Math.PI / 180;
    const width = pose.scale * (Math.abs(Math.cos(angle)) * sizes[index].w + Math.abs(Math.sin(angle)) * sizes[index].h);
    const height = pose.scale * (Math.abs(Math.cos(angle)) * sizes[index].h + Math.abs(Math.sin(angle)) * sizes[index].w);
    const rect = {
      left: pose.x - width / 2, right: pose.x + width / 2,
      top: pose.y - height / 2, bottom: pose.y + height / 2
    };
    assert(rect.left >= bounds.left - 0.01 && rect.right <= bounds.right + 0.01,
      `${name}: card ${index} fits horizontally`);
    assert(rect.top >= bounds.top - 0.01 && rect.bottom <= bounds.bottom + 0.01,
      `${name}: card ${index} fits vertically`);
    return rect;
  });
  rectangles.forEach((a, i) => rectangles.slice(i + 1).forEach((b, offset) => {
    const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    assert(overlapWidth * overlapHeight < 0.01, `${name}: cards ${i} and ${i + offset + 1} do not overlap`);
  }));
}

const small = { w: 360, h: 220 };
const largeVideo = { w: 1100, h: 620 };
const portrait = { w: 310, h: 520 };
const cases = [
  ['screenshot-size mixed folder', [small, small, largeVideo, small, portrait], { width: 1508, height: 939 }, 0.8, { x: 900, y: 500 }],
  ['large video as folder root', [largeVideo, small, small, portrait], { width: 1508, height: 939 }, 0.8, { x: 0, y: 0 }],
  ['large video at narrow desktop width', [small, largeVideo, small], { width: 900, height: 700 }, 0.9, { x: 3000, y: -3000 }],
  ['mobile portrait viewport', [largeVideo, small, portrait], { width: 375, height: 667 }, 1, { x: 0, y: 0 }],
  ['mobile landscape viewport', [small, largeVideo, small], { width: 667, height: 375 }, 1.4, { x: 0, y: 0 }],
  ['maximum camera zoom', [largeVideo, portrait, small], { width: 1440, height: 900 }, 2.5, { x: 0, y: 0 }],
  ['minimum camera zoom', [largeVideo, portrait, small], { width: 1440, height: 900 }, 0.12, { x: 0, y: 0 }],
  ['many mixed cards', Array.from({ length: 20 }, (_, i) => i % 5 === 0 ? largeVideo : i % 3 === 0 ? portrait : small), { width: 1280, height: 800 }, 0.7, { x: 0, y: 0 }]
];
cases.forEach(args => checkLayout(...args));

let seed = 12345;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
for (let run = 0; run < 200; run++) {
  const sizes = Array.from({ length: 2 + Math.floor(random() * 16) }, () => ({
    w: 180 + Math.floor(random() * 1100),
    h: 120 + Math.floor(random() * 650)
  }));
  const viewport = { width: 350 + Math.floor(random() * 1700), height: 350 + Math.floor(random() * 900) };
  const cameraScale = 0.12 + random() * 2.38;
  checkLayout(`random case ${run}`, sizes, viewport, cameraScale, {
    x: (random() - 0.5) * 6000,
    y: (random() - 0.5) * 6000
  });
}

console.log(`${cases.length + 200} folder layout cases passed`);
