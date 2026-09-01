/* app.js — UI for the Blue Dragon Save Editor (all client-side) */
(function () {
'use strict';
var C = window.SaveCore;
var G = window.SAVE_DATA.model.global;
var $ = function (sel, el) { return (el || document).querySelector(sel); };
var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

var state = {
  original: null,   // Uint8Array as loaded
  name: 'savegame.dat',
  s: null           // parsed save model
};

/* ---------- helpers ---------- */
function toast(msg, err) {
  var t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.className = ''; }, 4000);
}
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function clampInput(inp) {
  var v = Math.round(+inp.value || 0);
  inp.value = Math.max(+(inp.min || 0), Math.min(+(inp.max || 1e9), v));
  return +inp.value;
}
function numField(label, value, cap, onChange) {
  var f = el('div', 'field');
  f.appendChild(el('label', null, label));
  var inp = el('input');
  inp.type = 'number'; inp.min = '0'; inp.max = cap;
  inp.value = value;
  inp.addEventListener('change', function () {
    onChange(clampInput(inp));
  });
  f.appendChild(inp);
  return f;
}

/* ---------- file loading ---------- */
function loadFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var bytes = new Uint8Array(reader.result);
    try {
      state.s = C.parse(bytes);
    } catch (err) {
      toast('Could not parse file: ' + err.message, true);
      return;
    }
    state.original = bytes;
    state.name = file.name;
    $('#app').classList.remove('empty');
    $('#tabs').classList.remove('hidden');
    renderAll();
    toast('Save loaded');
  };
  reader.readAsArrayBuffer(file);
}

$('#fileInput').addEventListener('change', function (e) {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});
document.addEventListener('dragover', function (e) { e.preventDefault(); $('#dropOverlay').classList.add('show'); });
document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) $('#dropOverlay').classList.remove('show'); });
document.addEventListener('drop', function (e) {
  e.preventDefault(); $('#dropOverlay').classList.remove('show');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

/* ---------- tabs ---------- */
$$('#tabs [data-tab]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    $$('#tabs [data-tab]').forEach(function (b) { b.classList.toggle('active', b === btn); });
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab); });
  });
});

/* ---------- characters tab ---------- */
/* level first, as requested */
var STAT_FIELDS = [
  ['level', 'Level', 'level'], ['exp', 'Experience', 'exp'],
  ['curHP', 'Current HP', 'curHP'], ['curMP', 'Current MP', 'curMP'],
  ['bonusHP', 'Bonus HP', 'bonusHP'], ['bonusMP', 'Bonus MP', 'bonusMP'], ['bonusAttack', 'Bonus Attack', 'bonusAttack'],
  ['bonusMagicAttack', 'Bonus Magic Atk', 'bonusMagicAttack'], ['bonusDefense', 'Bonus Defense', 'bonusDefense'],
  ['bonusMagicDefense', 'Bonus Magic Def', 'bonusMagicDefense'], ['bonusAgility', 'Bonus Agility', 'bonusAgility']
];
var ACC_LABELS = { arm: 'Arm', finger: 'Finger', ear: 'Ear', neck: 'Neck', special1: 'Special 1', special2: 'Special 2', special3: 'Special 3' };

function renderChars() {
  var host = $('#tab-chars');
  host.textContent = '';
  C.CHARS.forEach(function (ch) {
    var c = state.s.chars[ch];
    var card = el('div', 'char-card open');
    var head = el('div', 'card-head');
    head.appendChild(el('h3', null, C.CHAR_NAMES[ch]));
    /* character unlock lives in the header so it is reachable without expanding */
    var unlockChk = el('input'); unlockChk.type = 'checkbox'; unlockChk.checked = c.unlocked;
    var unlockLab = el('label', 'head-check');
    unlockLab.appendChild(unlockChk);
    unlockLab.appendChild(document.createTextNode('Unlocked'));
    head.appendChild(unlockLab);
    var badge = el('span', 'badge ' + (c.unlocked ? 'on' : 'off'), c.unlocked ? 'unlocked' : 'locked');
    head.appendChild(badge);
    unlockChk.addEventListener('change', function () {
      c.unlocked = unlockChk.checked;
      badge.className = 'badge ' + (c.unlocked ? 'on' : 'off');
      badge.textContent = c.unlocked ? 'unlocked' : 'locked';
    });
    var body = el('div', 'card-body');

    var doLevel = function () { c.level = C.CAPS.level; c.exp = C.CAPS.exp; };
    var doStats = function () {
      ['curHP', 'curMP'].forEach(function (f) { c[f] = C.CAPS[f]; });
      ['bonusHP','bonusMP','bonusAttack','bonusMagicAttack','bonusDefense','bonusMagicDefense','bonusAgility'].forEach(function (f) { c[f] = C.CAPS[ch + '_' + f]; });
    };
    var doShadows = function () {
      C.SHADOW_CLASSES.forEach(function (sc) {
        c.shadowUnlocked[sc] = true;   /* unlock mask, not just the numbers */
        c['shadow_' + sc + '_level'] = C.CAPS['shadow_' + sc + '_level'];
        c['shadow_' + sc + '_sp'] = C.CAPS['shadow_' + sc + '_sp'];
      });
    };

    var macros = el('div', 'macros');
    [['Max Level', doLevel], ['Max Stats', doStats], ['Max Shadows', doShadows],
     ['Max Everything', function () { doLevel(); doStats(); doShadows(); }]]
    .forEach(function (m) {
      var b = el('button', 'btn btn-small', m[0]);
      b.addEventListener('click', function () {
        m[1]();
        syncCharInputs(card, ch);
        if (card._paintShadows) card._paintShadows(); /* macros change SP/Level */
      });
      macros.appendChild(b);
    });
    body.appendChild(macros);

    var g1 = el('div', 'grid');
    STAT_FIELDS.forEach(function (f) {
      var cap = f[2].indexOf('bonus') === 0 ? C.CAPS[ch + '_' + f[2]] : C.CAPS[f[2]];
      var inp = numField(f[1], c[f[2]], cap, function (v) { c[f[2]] = v; });
      $('input', inp).dataset.field = f[2];
      g1.appendChild(inp);
    });
    body.appendChild(g1);

    /* shadows: unlock bit per class (bitmask at character + 120) + Level/SP.
     * A shadow class always sits at level 1 or above, so Level is not what locks
     * one out - the unlock mask is. */
    body.appendChild(el('div', 'section-title', 'Shadows'));

    var shList = el('div', 'shadow-list');
    C.SHADOW_CLASSES.forEach(function (sc) {
      var row = el('div', 'shadow-row');
      row.dataset.sc = sc;
      var onOff = el('input', 'onoff'); onOff.type = 'checkbox';
      onOff.checked = !!c.shadowUnlocked[sc];
      onOff.title = 'Unlocked for this character - bit ' + C.SHADOW_CLASSES.indexOf(sc) + ' of the shadow unlock mask.';
      onOff.addEventListener('change', function () { c.shadowUnlocked[sc] = onOff.checked; paintShadows(); });
      row.appendChild(onOff);
      row.appendChild(el('span', 'name', C.SHADOW_LABELS[sc]));
      ['level', 'sp'].forEach(function (p) {
        var key = 'shadow_' + sc + '_' + p;
        var f = el('span', 'shadow-field');
        f.appendChild(el('label', null, p === 'level' ? 'Level' : 'SP'));
        var inp = el('input'); inp.type = 'number';
        inp.min = p === 'level' ? 1 : 0;   /* levels start at 1; 0 is not used */
        inp.max = C.CAPS[key];
        inp.value = c[key]; inp.dataset.field = key;
        if (p === 'level') inp.title = 'Shadow levels start at 1.';
        inp.addEventListener('change', function () { c[key] = clampInput(inp); paintShadows(); });
        f.appendChild(inp);
        row.appendChild(f);
      });
      row.appendChild(el('span', 'badge shadow-state'));
      shList.appendChild(row);
    });
    body.appendChild(shList);

    /* badges + dimming, re-read from state on every edit */
    function paintShadows() {
      $$('.shadow-row', shList).forEach(function (row) {
        var sc = row.dataset.sc;
        var lvl = c['shadow_' + sc + '_level'], sp = c['shadow_' + sc + '_sp'];
        var got = !!c.shadowUnlocked[sc];
        var b = $('.shadow-state', row);
        b.textContent = !got ? 'locked' : (sp === 0 ? 'unused' : 'in use');
        b.title = !got ? 'Not unlocked for this character' : (sp === 0 ? 'Unlocked, no SP spent in it yet' : 'Unlocked, SP invested');
        b.className = 'badge shadow-state ' + (!got ? 'off' : (sp === 0 ? 'idle' : 'on'));
        row.classList.toggle('locked', !got);
        $('input.onoff', row).checked = got;
        var nums = $$('input[type=number]', row);
        nums[0].value = lvl; nums[1].value = sp;
      });
    }
    paintShadows();
    card._paintShadows = paintShadows;

    /* accessories */
    body.appendChild(el('div', 'section-title', 'Accessories'));
    var g3 = el('div', 'grid');
    C.ACC_SLOTS.forEach(function (a) {
      var f = el('div', 'field');
      f.appendChild(el('label', null, ACC_LABELS[a]));
      var sel = el('select');
      sel.appendChild(new Option('< Empty >', 0));
      C.itemsFor('Accessory', C.ACC_SUBTYPE[a]).forEach(function (it) { sel.appendChild(new Option(it.name, it.code)); });
      sel.value = c['accessory_' + a];
      sel.addEventListener('change', function () { c['accessory_' + a] = +sel.value; });
      f.appendChild(sel);
      g3.appendChild(f);
    });
    body.appendChild(g3);

    head.addEventListener('click', function (e) {
      if (e.target.closest('input, label')) return; /* toggling the checkbox must not collapse the card */
      card.classList.toggle('open');
    });
    card.appendChild(head); card.appendChild(body);
    host.appendChild(card);
  });
}
function syncCharInputs(card, ch) {
  var c = state.s.chars[ch];
  $$('input[data-field]', card).forEach(function (inp) { inp.value = c[inp.dataset.field]; });
}

/* ---------- inventory tab ---------- */
/* One long, scrollable list per category, grouped by type. */
/* type = the item's data type; sub = the section within it. Both are needed:
 * "Support" exists as a section under Items *and* under Spellbooks.
 * A section may be { sub, title?, only?, skip? } to split one data sub-type
 * into several UI sections (only/skip are name predicates). */
var INV_CATS = [
  { name: 'Items', type: 'Item', subs: ['Heal', 'Attack',
    { sub: 'Support', skip: C.isEnigmaMed },
    { sub: 'Support', title: 'Enigma Meds', only: C.isEnigmaMed },
    'Enhancement'] },
  { name: 'Spellbooks', type: 'Spellbook', subs: ['Black', 'White', 'Support', 'Barrier'] },
  { name: 'Accessories', type: 'Accessory', subs: ['Arm', 'Finger', 'Ear', 'Neck', 'Special'] },
  { name: 'Valuables', type: 'Valuable', subs: ['None'] }
];
var invCurCat = 0;
var invSummary;

function qtyFor(code) {
  var e = state.s.inventory.filter(function (x) { return x.code === code; })[0];
  return e ? e.qty : 0;
}
function setQty(code, qty) {
  var i = -1, entry = null;
  state.s.inventory.forEach(function (x, ix) { if (x.code === code) { i = ix; entry = x; } });
  if (qty > 0) {
    if (entry) entry.qty = qty;
    else state.s.inventory.push({ slot: -1, code: code, qty: qty }); /* slot allocated at save */
  } else if (entry) {
    state.s.inventory.splice(i, 1);
  }
}

function renderInventory() {
  var host = $('#tab-inventory');
  host.textContent = '';
  var bar = el('div', 'inv-toolbar');
  var catSel = el('select');
  INV_CATS.forEach(function (cat, i) { catSel.appendChild(new Option(cat.name, i)); });
  var qtyAll = el('input'); qtyAll.type = 'number'; qtyAll.min = 0; qtyAll.max = C.CAPS.itemQty; qtyAll.value = 99; qtyAll.style.width = '76px';
  var setAllBtn = el('button', 'btn btn-small', 'Set all in this category');
  invSummary = el('span', 'file-info');
  bar.appendChild(el('span', null, 'Category:')); bar.appendChild(catSel);
  bar.appendChild(el('span', null, 'Qty:')); bar.appendChild(qtyAll);
  bar.appendChild(setAllBtn); bar.appendChild(invSummary);
  host.appendChild(bar);

  function renderList() {
    var cat = INV_CATS[invCurCat];
    var list = el('div', 'inv-wrap');
    cat.subs.forEach(function (def) {
      var sec = typeof def === 'string' ? { sub: def } : def;
      var items = C.itemsFor(cat.type, sec.sub).filter(function (it) {
        if (sec.only) return sec.only(it.name);
        if (sec.skip) return !sec.skip(it.name);
        return true;
      });
      if (!items.length) return;
      var title = sec.title || (sec.sub !== 'None' ? sec.sub : null);
      if (title) list.appendChild(el('div', 'section-title', title));
      var grid = el('div', 'inv-list');
      items.forEach(function (it) {
        var row = el('div', 'inv-row');
        var inp = el('input'); inp.type = 'number'; inp.min = 0; inp.max = C.CAPS.itemQty; inp.classList.add('qty');
        inp.value = qtyFor(it.code);
        row.classList.toggle('has', inp.value > 0);
        inp.addEventListener('change', function () {
          var v = clampInput(inp);
          setQty(it.code, v);
          row.classList.toggle('has', v > 0);
          updateSummary();
        });
        row.appendChild(inp);
        row.appendChild(el('span', 'name', it.name));
        grid.appendChild(row);
      });
      list.appendChild(grid);
    });
    var old = $('#invList', host);
    if (old) old.remove();
    list.id = 'invList';
    host.appendChild(list);
  }
  function updateSummary() {
    invSummary.textContent = (state.s.inventory.length + state.s.unknownInventory.length) + ' / ' + G.inventoryMax + ' slots used';
  }
  catSel.value = invCurCat;
  catSel.addEventListener('change', function () { invCurCat = +catSel.value; renderList(); });
  setAllBtn.addEventListener('click', function () {
    var q = clampInput(qtyAll);
    $$('#invList input.qty').forEach(function (inp) {
      inp.value = q;
      inp.dispatchEvent(new Event('change'));
    });
  });
  renderList(); updateSummary();
}

/* allocate slots for new items / free removed ones, before serialize */
function normalizeInventory() { C.normalizeInventory(state.s); }

/* ---------- encyclopedia tab ---------- */
function renderEncyclopedia() {
  var host = $('#tab-encyclopedia');
  host.textContent = '';
  var bar = el('div', 'inv-toolbar');
  var search = el('input', 'searchbox'); search.type = 'search'; search.placeholder = 'Search monsters…';
  bar.appendChild(search); host.appendChild(bar);
  function monRows(map, names, title) {
    host.appendChild(el('div', 'section-title', title));
    var list = el('div', 'mon-list');
    Object.keys(names).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var row = el('div', 'mon-row');
      row.dataset.name = names[id].name.toLowerCase();
      var inp = el('input'); inp.type = 'number'; inp.min = 0; inp.max = 9999999; inp.style.width = '76px';
      inp.value = map[id] || 0;
      row.classList.toggle('has', (map[id] || 0) > 0);
      inp.addEventListener('change', function () {
        var v = clampInput(inp);
        if (v > 0) map[id] = v; else delete map[id];
        row.classList.toggle('has', v > 0);
      });
      row.appendChild(inp);
      row.appendChild(el('span', 'name', names[id].name));
      row.appendChild(el('span', 'type', names[id].type));
      list.appendChild(row);
    });
    host.appendChild(list);
  }
  monRows(state.s.monsters, C.MONSTERS, 'Monster records');
  monRows(state.s.bosses, C.BOSSES, 'Boss records');
  search.addEventListener('input', function () {
    var q = search.value.toLowerCase();
    $$('.mon-row', host).forEach(function (r) {
      r.style.display = r.dataset.name.indexOf(q) >= 0 ? '' : 'none';
    });
  });
}

/* ---------- misc tab ---------- */
function renderMisc() {
  var host = $('#tab-misc');
  host.textContent = '';
  var grid = el('div', 'misc-grid');
  var m = state.s.misc;
  [['gold', 'Gold'], ['medals', 'Medals'], ['nothings', 'Nothings'],
   ['totalEncounters', 'Total encounters'], ['wins', 'Wins'], ['monsterFights', 'Monster fights'],
   ['multiMonsterEncounters', 'Multi-monster encounters'], ['escapes', 'Escapes'],
   ['backAttack', 'Back attacks'], ['surpriseAttack', 'Surprise attacks']].forEach(function (f) {
    grid.appendChild(numField(f[1], m[f[0]], C.CAPS[f[0]] || 9999999, function (v) { m[f[0]] = v; }));
  });
  var diff = el('div', 'field');
  diff.appendChild(el('label', null, 'Difficulty'));
  var sel = el('select');
  C.DIFFICULTY.forEach(function (d, i) { sel.appendChild(new Option(d, i)); });
  sel.value = m.difficulty;
  sel.addEventListener('change', function () { m.difficulty = +sel.value; });
  diff.appendChild(sel);
  grid.appendChild(diff);
  host.appendChild(grid);

  host.appendChild(el('div', 'section-title', 'Play time'));
  var pg = el('div', 'misc-grid');
  var secs = m.playSeconds || 0;
  var hF = numField('Hours', Math.floor(secs / 3600), C.CAPS.playTimeHours, null);
  var mF = numField('Minutes', Math.floor(secs % 3600 / 60), 59, null);
  var sF = numField('Seconds', secs % 60, 59, null);
  [hF, mF, sF].forEach(function (f) {
    var inp = $('input', f);
    inp.addEventListener('change', function () {
      m.playSeconds = (+$('input', hF).value || 0) * 3600 + (+$('input', mF).value || 0) * 60 + (+$('input', sF).value || 0);
    });
    pg.appendChild(f);
  });
  host.appendChild(pg);
}

/* ---------- save / revert ---------- */
function download(bytes, filename) {
  var blob = new Blob([bytes], { type: 'application/octet-stream' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

$('#saveBtn').addEventListener('click', function () {
  try {
    normalizeInventory();
    var bytes = C.serialize(state.original, state.s);
    var stem = state.name.replace(/\.[^.]*$/, '');
    /* Two files: the untouched original as <name>-backup.dat, and the edits under
     * the original filename so it drops straight back into the game folder. */
    download(state.original, stem + '-backup.dat');
    setTimeout(function () { download(bytes, state.name); }, 400);
    toast('Downloaded ' + state.name + ' (edited) and ' + stem + '-backup.dat (your original). Swap the edited one into your game folder.');
  } catch (err) {
    toast('Failed: ' + err.message, true);
  }
});
$('#resetBtn').addEventListener('click', function () {
  state.s = C.parse(state.original);
  renderAll();
  toast('Reverted to the loaded save.');
});

function renderAll() {
  renderChars(); renderInventory(); renderEncyclopedia(); renderMisc();
}
})();
