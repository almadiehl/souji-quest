// タスクの予定（曜日・時間帯）の判定テスト
// 使い方: node tools/test-slots.js
//
// index.html から判定の実物を抜き出して動かす。写したコードを試しても意味がないので、
// 実装が変わればここも自然に追随する。時刻に依存するロジックなので、
// 実時計ではなく「その時刻だったら」を差し込んで確かめる。

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grab(re){ const m = re.exec(src); if(!m) throw new Error('見つからない: ' + re); return m[0]; }

// 判定に必要なぶんだけ取り出す
const code = [
  /var WD = \[[^\]]*\];/,
  /var HOURS = \[[\s\S]*?\n\];/,
  /function hourIdx\(h\)\{[\s\S]*?\n\}/,
  /function hasSlot\(t\)\{[^\n]*\}/,
  /function slotNow\(t\)\{[\s\S]*?\n\}/,
  /function slotLabel\(t\)\{[\s\S]*?\n\}/
].map(grab).join('\n');

// 実装が使う外部の2つを差し替え可能にしておく
let NOW = new Date();
function shifted(off){
  const d = new Date(NOW.getTime());
  d.setHours(d.getHours() - 4);              // dayStart は既定の4時
  if(off) d.setDate(d.getDate() + off);
  return d;
}
const Date_ = Date;
function FakeDate(){ return new Date_(NOW.getTime()); }
FakeDate.now = () => NOW.getTime();

const fn = new Function('shifted', 'Date', code + '\nreturn { slotNow, slotLabel, hasSlot, HOURS, WD };');
const M = fn(shifted, FakeDate);

// 2026-08-26 は水曜。wd(0=日) の日付にずらして時刻をあてる
function setNow(hour, wd){
  const d = new Date_(2026, 7, 26);
  d.setDate(d.getDate() + (((wd - 3) % 7) + 7) % 7);
  d.setHours(hour, 0, 0, 0);
  NOW = d;
}

let pass = 0, fail = 0;
function check(name, task, hour, wd, want){
  setNow(hour, wd);
  const got = M.slotNow(task);
  if(got === want){ pass++; }
  else { fail++; console.log('  NG ' + name + ' → ' + got + '（期待 ' + want + '）'); }
}

console.log('■ 時間帯の判定');
check('深夜0-5 @2時',        { h:[0,5] },   2,  3, true);
check('深夜0-5 @6時',        { h:[0,5] },   6,  3, false);
check('深夜0-5 @0時',        { h:[0,5] },   0,  3, true);
check('夜19-24 @23時',       { h:[19,24] }, 23, 3, true);
check('夜19-24 @18時',       { h:[19,24] }, 18, 3, false);
check('夜19-24 @0時',        { h:[19,24] }, 0,  3, false);
check('朝5-11 @5時（境界）',  { h:[5,11] },  5,  3, true);
check('朝5-11 @11時（境界）', { h:[5,11] },  11, 3, false);

console.log('■ 曜日の判定');
check('水のみ @水曜',        { w:[3] }, 10, 3, true);
check('水のみ @木曜',        { w:[3] }, 10, 4, false);
check('月水金 @金曜',        { w:[1,3,5] }, 10, 5, true);
check('月水金 @土曜',        { w:[1,3,5] }, 10, 6, false);

console.log('■ 組み合わせ');
check('水+夕方 @水17時',     { w:[3], h:[16,19] }, 17, 3, true);
check('水+夕方 @木17時',     { w:[3], h:[16,19] }, 17, 4, false);
check('水+夕方 @水10時',     { w:[3], h:[16,19] }, 10, 3, false);
check('予定なしは出さない',   {},                  10, 3, false);
check('空配列も予定なし',     { w:[] },            10, 3, false);

console.log('■ 4時区切り（深夜2時は前日あつかい）');
// 水曜の深夜2時 = 4時区切りでは「火曜」。火曜指定が当たり、水曜指定は外れる
check('火指定 @水2時',       { w:[2] }, 2, 3, true);
check('水指定 @水2時',       { w:[3] }, 2, 3, false);

console.log('■ 表示ラベル');
setNow(10, 3);
[[{ w:[1,3,5], h:[19,24] }, '月水金 夜'],
 [{ w:[3] },                '水'],
 [{ h:[5,11] },             '朝'],
 [{ w:[0,1,2,3,4,5,6] },    '毎日'],
 [{},                       '']].forEach(function(c){
  const got = M.slotLabel(c[0]);
  if(got === c[1]) pass++;
  else { fail++; console.log('  NG ラベル → "' + got + '"（期待 "' + c[1] + '"）'); }
});

console.log('\n' + (fail ? 'NG ' + fail + '件 / ' : '') + 'OK ' + pass + '件');
process.exit(fail ? 1 : 0);
