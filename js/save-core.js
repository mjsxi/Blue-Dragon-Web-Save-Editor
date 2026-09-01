/* save-core.js — parse/edit/serialize Blue Dragon (PC recomp & Xbox 360 blob) savegame.dat
 * Field offsets, semantics and caps transcribed from "Blue Dragon Complete Save Editor"
 * (decompiled C#) — verified against a real PC save. Big-endian uint32 throughout. */
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.SaveCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA = (typeof SAVE_DATA !== 'undefined') ? SAVE_DATA : require('./save-data.js');
  var M = DATA.model;
  var G = M.global;
  var CHARS = ['shu', 'jiro', 'kluke', 'marumaro', 'zola'];
  var CHAR_NAMES = { shu: 'Shu', jiro: 'Jiro', kluke: 'Kluke', marumaro: 'Marumaro', zola: 'Zola' };
  var SHADOW_CLASSES = ['whiteMagic', 'blackMagic', 'supportMagic', 'barrierMagic', 'swordMaster', 'monk', 'guardian', 'assassin', 'generalist'];
  var SHADOW_LABELS = { whiteMagic: 'White Magic', blackMagic: 'Black Magic', supportMagic: 'Support Magic', barrierMagic: 'Barrier Magic', swordMaster: 'Sword Master', monk: 'Monk', guardian: 'Guardian', assassin: 'Assassin', generalist: 'Generalist' };
  /* Shadow unlock bitmask: uint32 at (character base + SHADOW_UNLOCK_REL), bit i of
   * the low 9 bits = SHADOW_CLASSES[i]. Found by matching Shu's known set
   * (White, Black, Sword Master, Monk, Generalist = 0x133 = 307) against every word
   * in his record - offset 120 is the only match, and it agrees with which classes
   * have SP spent for all five characters. The next word (+124) is the older master
   * flag, kept untouched for round-trip fidelity. */
  var SHADOW_UNLOCK_REL = 120;
  var ACC_SLOTS = ['arm', 'finger', 'ear', 'neck', 'special1', 'special2', 'special3'];
  var ACC_SUBTYPE = { arm: 'Arm', finger: 'Finger', ear: 'Ear', neck: 'Neck', special1: 'Special', special2: 'Special', special3: 'Special' };
  var UNLOCK_VALUES = { shu: 10, jiro: 20, kluke: 30, marumaro: 40, zola: 50 };
  var DIFFICULTY = ['Normal', 'Hard', 'Impossible'];
  /* Highest absolute field offset + 4 (Zola bonus agility) */
  var MIN_LENGTH = M.chars.zola.zola_bonusAgility + 4;

  /* ---- big-endian uint32 ---- */
  function readU32(b, o) { return (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0); }
  function writeU32(b, o, v) { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; }

  /* ---- item / monster lookups ---- */
  var ITEMS = DATA.items;            // code -> {name, type, sub}
  var MONSTERS = DATA.monsters;      // id   -> {name, type}
  var BOSSES = DATA.bosses;          // id   -> {name, type}
  function itemName(code) { return (ITEMS[code] && ITEMS[code].name) || null; }
  /* Spellbook names carry their spell rank: "Lv 3 - Flara" */
  function itemLevel(name) {
    var m = /^Lv\s*(\d+)\b/i.exec(name || '');
    return m ? +m[1] : null;
  }
  /* Enigma Meds are stored as ordinary Item/Support, but the UI lists them in a
   * section of their own (13 colour variants, out of place among the elixirs). */
  function isEnigmaMed(name) { return /^Enigma Med\b/i.test(name || ''); }

  /* Items in one category ("Item" | "Spellbook" | "Accessory" | "Valuable") and
   * sub-type. Sub-types are not unique across categories — both Items and
   * Spellbooks have a "Support" set — so the type must be part of the filter.
   * Spellbooks come back ordered by spell level, everything else by code. */
  function itemsFor(type, sub) {
    var out = [];
    Object.keys(ITEMS).forEach(function (k) {
      var it = ITEMS[k];
      if (it.sub !== sub || (type && it.type !== type)) return;
      out.push({ code: parseInt(k, 10), name: it.name, level: itemLevel(it.name) });
    });
    out.sort(function (a, b) {
      var la = a.level == null ? 99 : a.level, lb = b.level == null ? 99 : b.level;
      if (la !== lb) return la - lb;
      return a.code - b.code;
    });
    return out;
  }

  /* ---- parse ---- */
  function parse(bytes) {
    if (bytes.length < MIN_LENGTH) {
      throw new Error('File too small: expected at least ' + MIN_LENGTH + ' bytes, got ' + bytes.length + '. This does not look like a Blue Dragon savegame.dat.');
    }
    var s = { chars: {}, inventory: [], unknownInventory: [], monsters: {}, bosses: {}, misc: {} };

    /* character unlock table: canonical values 10/20/30/40/50, 0xFFFFFFFF = empty */
    var unlocked = {};
    for (var i = 0; i < G.unlockMax; i++) {
      var v = readU32(bytes, G.characterUnlockTable + i * 4);
      Object.keys(UNLOCK_VALUES).forEach(function (k) { if (UNLOCK_VALUES[k] === v) unlocked[k] = true; });
    }

    CHARS.forEach(function (ch) {
      var m = M.chars[ch];
      var c = { unlocked: !!unlocked[ch] };
      ['curHP', 'curMP', 'level', 'exp'].forEach(function (f) { c[f] = readU32(bytes, m[f]); });
      c.shadowsUnlocked = readU32(bytes, m.shadowsUnlocked) === 1;
      /* per-class unlock mask */
      c.shadowUnlockBits = readU32(bytes, m.base + SHADOW_UNLOCK_REL);
      c.shadowUnlocked = {};
      SHADOW_CLASSES.forEach(function (sc, i) {
        c.shadowUnlocked[sc] = !!(c.shadowUnlockBits & (1 << i));
      });
      SHADOW_CLASSES.forEach(function (sc) {
        c['shadow_' + sc + '_level'] = readU32(bytes, m['shadow_' + sc + '_level']);
        c['shadow_' + sc + '_sp'] = readU32(bytes, m['shadow_' + sc + '_sp']);
      });
      ACC_SLOTS.forEach(function (a) { c['accessory_' + a] = readU32(bytes, m['accessory_' + a]); });
      ['bonusHP', 'bonusMP', 'bonusAttack', 'bonusMagicAttack', 'bonusDefense', 'bonusMagicDefense', 'bonusAgility'].forEach(function (b) {
        c[b] = readU32(bytes, m[ch + '_' + b]);
      });
      s.chars[ch] = c;
    });

    /* inventory: 512 slots of (code, qty); unknown codes are preserved as-is */
    for (var j = 0; j < G.inventoryMax; j++) {
      var code = readU32(bytes, G.inventory + j * 8);
      var qty = readU32(bytes, G.inventory + j * 8 + 4);
      if (code !== 0) {
        if (itemName(code)) s.inventory.push({ slot: j, code: code, qty: qty });
        else s.unknownInventory.push({ slot: j, code: code, qty: qty });
      }
    }

    for (var k = 0; k < G.monsterRecordMax; k++) {
      if (MONSTERS[k]) s.monsters[k] = readU32(bytes, G.monsterRecords + k * 4);
    }
    for (var l = 0; l < G.bossRecordMax; l++) {
      if (BOSSES[l]) s.bosses[l] = readU32(bytes, G.bossRecords + l * 4);
    }

    s.misc.gold = readU32(bytes, G.gold);
    s.misc.medals = readU32(bytes, G.medals);
    s.misc.nothings = readU32(bytes, G.nothings);
    s.misc.difficulty = readU32(bytes, G.difficulty);
    s.misc.playSeconds = readU32(bytes, G.playTime);
    s.misc.totalEncounters = readU32(bytes, G.totalEncounters);
    s.misc.wins = readU32(bytes, G.wins);
    s.misc.monsterFights = readU32(bytes, G.monsterFights);
    s.misc.multiMonsterEncounters = readU32(bytes, G.multiMonsterEncounters);
    s.misc.escapes = readU32(bytes, G.escapes);
    s.misc.backAttack = readU32(bytes, G.backAttack);
    s.misc.surpriseAttack = readU32(bytes, G.surpriseAttack);
    return s;
  }

  /* ---- inventory slot allocation ----
   * UI marks newcomers with slot = -1; this assigns them the lowest free slot
   * and keeps existing / unknown entries exactly where they were. */
  function normalizeInventory(s) {
    var used = {};
    s.unknownInventory.forEach(function (e) { used[e.slot] = true; });
    var next = 0;
    function takeFree() { while (used[next]) next++; used[next] = true; return next; }
    s.inventory.forEach(function (e) {
      if (e.slot >= 0 && !used[e.slot]) { used[e.slot] = true; return; }
      e.slot = takeFree();
    });
  }

  /* ---- serialize ----
   * Contract: every entry in s.inventory / s.unknownInventory has a unique
   * slot >= 0 (parse preserves original slots; the UI allocates new ones via
   * normalizeInventory). Unchanged state round-trips byte-identically. */
  function serialize(original, s) {
    var bytes = new Uint8Array(original.length);
    bytes.set(original, 0);

    /* character unlock table */
    var idx = 0;
    CHARS.forEach(function (ch) {
      if (s.chars[ch].unlocked) { writeU32(bytes, G.characterUnlockTable + idx * 4, UNLOCK_VALUES[ch]); idx++; }
    });
    for (var i = idx; i < G.unlockMax; i++) writeU32(bytes, G.characterUnlockTable + i * 4, 0xFFFFFFFF);

    CHARS.forEach(function (ch) {
      var m = M.chars[ch]; var c = s.chars[ch];
      ['curHP', 'curMP', 'level', 'exp'].forEach(function (f) { writeU32(bytes, m[f], c[f]); });
      /* unlocked = manual checkbox OR any shadow level above 0 */
      var anyLvl = SHADOW_CLASSES.some(function (sc) { return c['shadow_' + sc + '_level'] > 0; });
      writeU32(bytes, m.shadowsUnlocked, (c.shadowsUnlocked || anyLvl) ? 1 : 0);
      /* per-class unlock bits; bits above the 9 known classes are preserved as read */
      if (c.shadowUnlocked) {
        var bits = (c.shadowUnlockBits || 0) >>> 0;
        SHADOW_CLASSES.forEach(function (sc, i) {
          var bit = 1 << i;
          bits = c.shadowUnlocked[sc] ? (bits | bit) : (bits & ~bit);
        });
        writeU32(bytes, m.base + SHADOW_UNLOCK_REL, bits >>> 0);
      }
      SHADOW_CLASSES.forEach(function (sc) {
        writeU32(bytes, m['shadow_' + sc + '_level'], c['shadow_' + sc + '_level']);
        writeU32(bytes, m['shadow_' + sc + '_sp'], c['shadow_' + sc + '_sp']);
      });
      ACC_SLOTS.forEach(function (a) { writeU32(bytes, m['accessory_' + a], c['accessory_' + a] || 0); });
      ['bonusHP', 'bonusMP', 'bonusAttack', 'bonusMagicAttack', 'bonusDefense', 'bonusMagicDefense', 'bonusAgility'].forEach(function (b) {
        writeU32(bytes, m[ch + '_' + b], c[b]);
      });
    });

    /* inventory */
    var bySlot = {};
    s.inventory.forEach(function (e) { bySlot[e.slot] = e; });
    s.unknownInventory.forEach(function (e) { bySlot[e.slot] = e; });
    for (var sl = 0; sl < G.inventoryMax; sl++) {
      var e = bySlot[sl];
      writeU32(bytes, G.inventory + sl * 8, e ? e.code : 0);
      writeU32(bytes, G.inventory + sl * 8 + 4, e ? e.qty : 0);
    }

    for (var k = 0; k < G.monsterRecordMax; k++) writeU32(bytes, G.monsterRecords + k * 4, s.monsters[k] || 0);
    for (var l = 0; l < G.bossRecordMax; l++) writeU32(bytes, G.bossRecords + l * 4, s.bosses[l] || 0);

    var misc = s.misc;
    writeU32(bytes, G.gold, misc.gold);
    writeU32(bytes, G.medals, misc.medals);
    writeU32(bytes, G.nothings, misc.nothings);
    writeU32(bytes, G.difficulty, misc.difficulty);
    writeU32(bytes, G.playTime, misc.playSeconds);
    writeU32(bytes, G.totalEncounters, misc.totalEncounters);
    writeU32(bytes, G.wins, misc.wins);
    writeU32(bytes, G.monsterFights, misc.monsterFights);
    writeU32(bytes, G.multiMonsterEncounters, misc.multiMonsterEncounters);
    writeU32(bytes, G.escapes, misc.escapes);
    writeU32(bytes, G.backAttack, misc.backAttack);
    writeU32(bytes, G.surpriseAttack, misc.surpriseAttack);
    return bytes;
  }

  return {
    MIN_LENGTH: MIN_LENGTH,
    CHARS: CHARS, CHAR_NAMES: CHAR_NAMES,
    SHADOW_CLASSES: SHADOW_CLASSES, SHADOW_LABELS: SHADOW_LABELS,
    ACC_SLOTS: ACC_SLOTS, ACC_SUBTYPE: ACC_SUBTYPE, UNLOCK_VALUES: UNLOCK_VALUES,
    DIFFICULTY: DIFFICULTY, SHADOW_UNLOCK_REL: SHADOW_UNLOCK_REL,
    CAPS: M.caps,
    ITEMS: ITEMS, MONSTERS: MONSTERS, BOSSES: BOSSES,
    itemName: itemName, itemsFor: itemsFor, itemLevel: itemLevel, isEnigmaMed: isEnigmaMed,
    readU32: readU32, writeU32: writeU32,
    parse: parse, serialize: serialize, normalizeInventory: normalizeInventory
  };
});
