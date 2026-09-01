/* Node test suite: run with `node test/test-core.js ../save-file/savegame.dat` */
const fs = require('fs');
const path = require('path');
const SaveCore = require('../js/save-core.js');

const file = process.argv[2] || '../../save-file/savegame.dat';
const orig = new Uint8Array(fs.readFileSync(path.resolve(__dirname, file)));
const SAVE_G = require('../js/save-data.js').model.global;
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) failures++;
}
function diffOffsets(a, b) {
  const d = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i);
  return d;
}

/* 1. parse + dump */
const s = SaveCore.parse(orig);
check('parse succeeds', true);
console.log('unlocked chars:', SaveCore.CHARS.filter(c => s.chars[c].unlocked).join(', '));
SaveCore.CHARS.forEach(ch => {
  const c = s.chars[ch];
  console.log(` ${ch}: HP ${c.curHP} MP ${c.curMP} LV ${c.level} EXP ${c.exp} accArm ${c.accessory_arm}(${SaveCore.itemName(c.accessory_arm)})`);
});
console.log('inventory entries:', s.inventory.length, '| unknown:', s.unknownInventory.length);
console.log('misc:', JSON.stringify(s.misc));

/* 2. round trip byte-identity */
s._t = 1; /* junk prop must not matter */
const rt = SaveCore.serialize(orig, s);
check('unchanged round-trip is byte-identical', diffOffsets(orig, rt).length === 0,
  diffOffsets(orig, rt).slice(0, 10).join(','));

/* 3. targeted edits touch only intended offsets */
function U32(o) { return SaveCore.readU32(orig, o); }
const s2 = SaveCore.parse(orig);
s2.misc.gold = U32(SAVE_G.gold) + 5;
const b2 = SaveCore.serialize(orig, s2);
const d2 = diffOffsets(orig, b2);
check('gold edit: 1-2 bytes at 20654..20655 only', d2.every(x => x >= 20652 && x < 20656), d2.join(','));
check('gold incremented by 5', SaveCore.readU32(b2, SAVE_G.gold) === U32(SAVE_G.gold) + 5);

const s3 = SaveCore.parse(orig);
s3.chars.shu.exp = 999999;
const b3 = SaveCore.serialize(orig, s3);
const d3 = diffOffsets(orig, b3);
check('exp edit: bytes at 168..171 only', d3.every(x => x >= 168 && x < 172), d3.join(','));
check('exp reparse = 999999', SaveCore.parse(b3).chars.shu.exp === 999999);

/* 4. unlock toggle */
const s4 = SaveCore.parse(orig);
s4.chars.zola.unlocked = true;
const b4 = SaveCore.serialize(orig, s4);
const p4 = SaveCore.parse(b4);
check('zola unlock writes 50 in 5th slot', SaveCore.readU32(b4, SAVE_G.characterUnlockTable + 16) === 50);
check('zola unlocked after reparse', p4.chars.zola.unlocked);
check('others unchanged', SaveCore.CHARS.filter(c => c !== 'zola' && p4.chars[c].unlocked).join(',') === 'shu,jiro,kluke,marumaro');
/* and undo */
s4.chars.zola.unlocked = false;
const b4b = SaveCore.serialize(orig, s4);
check('undo unlock = original bytes', diffOffsets(orig, b4b).length === 0);

/* 5. inventory add / remove / slot allocation */
const s5 = SaveCore.parse(orig);
const before = s5.inventory.length;
/* remove first entry, add 2 new items */
const removedCode = s5.inventory[0].code;
s5.inventory.splice(0, 1);
s5.inventory.push({ slot: -1, code: 402, qty: 3 }); // Giant Light Crystal
s5.inventory.push({ slot: -1, code: 431, qty: 1 }); // Head Doctor's Office Key
SaveCore.normalizeInventory(s5);
const b5 = SaveCore.serialize(orig, s5);
const p5 = SaveCore.parse(b5);
check('inventory: removed code gone', !p5.inventory.some(e => e.code === removedCode));
check('inventory: new codes present', p5.inventory.some(e => e.code === 402 && e.qty === 3) && p5.inventory.some(e => e.code === 431 && e.qty === 1));
check('inventory: count = before -1 +2', p5.inventory.length === before + 1, p5.inventory.length + ' vs ' + before);
check('inventory: no slot collisions', new Set(p5.inventory.map(e => e.slot).concat(p5.unknownInventory.map(e => e.slot))).size === p5.inventory.length + p5.unknownInventory.length);
check('inventory: no slot >= 512', p5.inventory.every(e => e.slot < SAVE_G.inventoryMax));
/* removed entry's slot was freed; newcomers should not collide with unknown slots */

/* 6. item names resolve for every known inventory code */
const s6 = SaveCore.parse(orig);
check('all inventory items recognised', s6.unknownInventory.length === 0,
  s6.unknownInventory.map(e => e.code).join(','));

/* 7. monster records round trip */
const s7 = SaveCore.parse(orig);
s7.monsters[2] = 999; /* Poo Snake */
s7.bosses[3] = 5;     /* Land Shark A */
const b7 = SaveCore.serialize(orig, s7);
const p7 = SaveCore.parse(b7);
check('monster record write', p7.monsters[2] === 999);
check('boss record write', p7.bosses[3] === 5);
check('monster diffs confined to record tables',
  diffOffsets(orig, b7).every(x => (x >= SAVE_G.monsterRecords && x < SAVE_G.monsterRecords + SAVE_G.monsterRecordMax * 4) || (x >= SAVE_G.bossRecords && x < SAVE_G.bossRecords + SAVE_G.bossRecordMax * 4)),
  diffOffsets(orig, b7).join(','));

/* 8. caps table completeness (used by UI macros and inputs) */
check('curHP/curMP/level/exp caps present', [SaveCore.CAPS.curHP, SaveCore.CAPS.curMP, SaveCore.CAPS.level, SaveCore.CAPS.exp].every(x => x > 0));
check('per-character bonus caps present (9999)', ['shu','jiro','kluke','marumaro','zola'].every(ch => SaveCore.CAPS[ch + '_bonusHP'] === 9999));
check('shadow caps present', ['whiteMagic','blackMagic','supportMagic','barrierMagic','swordMaster','monk','guardian','assassin','generalist'].every(sc => SaveCore.CAPS['shadow_' + sc + '_level'] === 99 && SaveCore.CAPS['shadow_' + sc + '_sp'] === 9999));
check('misc caps present', [SaveCore.CAPS.gold, SaveCore.CAPS.medals, SaveCore.CAPS.nothings, SaveCore.CAPS.playTimeHours, SaveCore.CAPS.itemQty].every(x => x > 0));

/* 9. shadow auto-unlock rule: level > 0 => unlocked flag written as 1 */
const s9 = SaveCore.parse(orig);
SaveCore.SHADOW_CLASSES.forEach(sc => { s9.chars.zola['shadow_' + sc + '_level'] = 0; });
s9.chars.zola.shadowsUnlocked = false;
const b9a = SaveCore.serialize(orig, s9);
const p9a = SaveCore.parse(b9a);
check('all levels 0 + unchecked => flag 0', p9a.chars.zola.shadowsUnlocked === false);
s9.chars.zola.shadow_generalist_level = 5;
const b9b = SaveCore.serialize(orig, s9);
const p9b = SaveCore.parse(b9b);
check('level > 0 unlocks shadows automatically', p9b.chars.zola.shadowsUnlocked === true);
check('level value persisted', p9b.chars.zola.shadow_generalist_level === 5);

/* 10. difficulty + playtime */
const s8 = SaveCore.parse(orig);
s8.misc.difficulty = 2; /* Impossible */
s8.misc.playSeconds = 3600 * 999 + 59 * 60 + 59;
const b8 = SaveCore.serialize(orig, s8);
const p8 = SaveCore.parse(b8);
check('difficulty write', p8.misc.difficulty === 2);
check('playtime write', p8.misc.playSeconds === 3600 * 999 + 59 * 60 + 59);

/* 11. item lookup: sections are scoped by type, spellbooks ordered by level */
const itemSupport = SaveCore.itemsFor('Item', 'Support');
const bookSupport = SaveCore.itemsFor('Spellbook', 'Support');
check('Item/Support excludes spellbooks (incl. Enigma Meds)', itemSupport.length > 0 && !itemSupport.some(i => /^Lv \d/.test(i.name)), itemSupport.length + ' items');
check('Spellbook/Support is books only', bookSupport.length > 0 && bookSupport.every(i => SaveCore.itemLevel(i.name) != null), bookSupport.length + ' books');
check('no code overlap between Item/Support and Spellbook/Support',
  !itemSupport.some(i => bookSupport.some(b => b.code === i.code)));
['Black', 'White', 'Support', 'Barrier'].forEach(sub => {
  const lv = SaveCore.itemsFor('Spellbook', sub).map(i => i.level);
  check(`Spellbook/${sub} sorted by level`, lv.every((v, i) => i === 0 || lv[i - 1] <= v), lv.join(','));
});
/* Enigma Meds: own UI section, carved out of Item/Support (app.js INV_CATS) */
const meds = itemSupport.filter(i => SaveCore.isEnigmaMed(i.name));
const restSupport = itemSupport.filter(i => !SaveCore.isEnigmaMed(i.name));
check('Enigma Meds are found in Item/Support', meds.length > 0, meds.length + ' meds');
check('meds + rest partition Item/Support exactly', meds.length + restSupport.length === itemSupport.length);
check('Support section keeps non-med items', restSupport.some(i => /Elixir/.test(i.name)) && !restSupport.some(i => SaveCore.isEnigmaMed(i.name)));
check('isEnigmaMed does not catch spellbooks or other categories',
  !SaveCore.itemsFor('Spellbook', 'Support').some(i => SaveCore.isEnigmaMed(i.name)) &&
  !SaveCore.itemsFor('Item', 'Heal').some(i => SaveCore.isEnigmaMed(i.name)));
check('accessory lookup excludes non-accessories', SaveCore.itemsFor('Accessory', 'Arm').length > 0 && !SaveCore.itemsFor('Accessory', 'Arm').some(i => /^Lv \d/.test(i.name)));

/* 12. shadow unlock mask (u32 at character base + 120, bit i = SHADOW_CLASSES[i]) */
const MODEL = require('../js/save-data.js').model;
const s12 = SaveCore.parse(orig);
const shuOn = SaveCore.SHADOW_CLASSES.filter(sc => s12.chars.shu.shadowUnlocked[sc]);
check('shu mask = White/Black/Sword/Monk/Generalist',
  ['whiteMagic', 'blackMagic', 'swordMaster', 'monk', 'generalist'].every(sc => s12.chars.shu.shadowUnlocked[sc]) &&
  ['supportMagic', 'barrierMagic', 'guardian', 'assassin'].every(sc => !s12.chars.shu.shadowUnlocked[sc]),
  shuOn.join(',') + ' (bits ' + SaveCore.readU32(orig, MODEL.chars.shu.base + SaveCore.SHADOW_UNLOCK_REL) + ')');
check('mask round-trips unchanged', diffOffsets(orig, SaveCore.serialize(orig, s12)).length === 0);
check('every character has at least one shadow unlocked',
  SaveCore.CHARS.every(ch => SaveCore.SHADOW_CLASSES.some(sc => s12.chars[ch].shadowUnlocked[sc])));
check('any class with SP spent is flagged unlocked',
  SaveCore.CHARS.every(ch => SaveCore.SHADOW_CLASSES.every(sc => !(s12.chars[ch]['shadow_' + sc + '_sp'] > 0) || s12.chars[ch].shadowUnlocked[sc])));
const shuMaskAbs = MODEL.chars.shu.base + SaveCore.SHADOW_UNLOCK_REL;
s12.chars.shu.shadowUnlocked.guardian = true;
const b12 = SaveCore.serialize(orig, s12);
check('unlocking Guardian writes only the mask word', diffOffsets(orig, b12).every(x => x >= shuMaskAbs && x < shuMaskAbs + 4), diffOffsets(b12, orig).join(','));
const p12 = SaveCore.parse(b12);
check('Guardian reads back unlocked', p12.chars.shu.shadowUnlocked.guardian === true);
check('other bits survive the edit', ['whiteMagic', 'monk', 'generalist'].every(sc => p12.chars.shu.shadowUnlocked[sc]) && !p12.chars.shu.shadowUnlocked.assassin);
p12.chars.shu.shadowUnlocked.whiteMagic = false;
const p12b = SaveCore.parse(SaveCore.serialize(orig, p12));
check('clearing a bit works too', p12b.chars.shu.shadowUnlocked.whiteMagic === false && p12b.chars.shu.shadowUnlocked.generalist === true);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
