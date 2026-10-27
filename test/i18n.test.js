// Every piece of screen text must have a Chinese line in src/renderer/zh.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'src', 'renderer');

function loadZh() {
  const sandbox = { window: { I18N: { zh: {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'zh.js'), 'utf8'), sandbox);
  return sandbox.window.I18N.zh;
}

function usedKeys() {
  const files = ['app.js', 'print.js', 'main-ui.js', 'index.html']
    .concat(fs.readdirSync(path.join(dir, 'pages')).map((f) => path.join('pages', f)));
  const keys = new Set();
  const call = /\b(?:App\.)?tx?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const attr = /data-i18n(?:-title)?="([^"]+)"/g;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    let m;
    while ((m = call.exec(src))) keys.add(m[2].replace(/\\(['"\\])/g, '$1'));
    while ((m = attr.exec(src))) keys.add(m[1]);
  }
  // messages that come from main.js (restore from backup)
  keys.add('This file cannot be read.');
  keys.add('This is not an MRT backup file.');
  return [...keys];
}

test('every screen text has a Chinese translation', () => {
  const zh = loadZh();
  const missing = usedKeys().filter((k) => !zh[k]);
  assert.deepStrictEqual(missing, []);
});

test('translations keep the same {placeholders} and **bold** marks', () => {
  const zh = loadZh();
  for (const [en, cn] of Object.entries(zh)) {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    assert.strictEqual(vars(cn), vars(en), `placeholders differ for: ${en}`);
    assert.strictEqual((cn.match(/\*\*/g) || []).length % 2, 0, `unbalanced ** in: ${cn}`);
  }
});

test('no unused translations', () => {
  const used = new Set(usedKeys());
  const extra = Object.keys(loadZh()).filter((k) => !used.has(k));
  assert.deepStrictEqual(extra, []);
});
