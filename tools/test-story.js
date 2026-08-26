// 物語モードのデータ検証
// 使い方: node tools/test-story.js
//
// 章を足したり選択肢を書き換えたりすると、行き先の書き間違いや
// 到達できない章が静かに混ざる。ここで落とす。
// index.html から実データを読むので、書き写した内容を検証する事故は起きない。

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grab(re){ const m = re.exec(src); if(!m) throw new Error('見つからない: ' + re); return m[0]; }
eval([
  /var STORY_NAME = [^\n]*/,
  /var STORY = \{[\s\S]*?\n\};/,
  /var STORY_END = \[[\s\S]*?\n\];/,
  /var STORY_TIER = \[[^\]]*\];/
].map(grab).join('\n'));

let ng = 0, ok = 0;
function check(cond, msg){ if(cond) ok++; else { ng++; console.log('  NG ' + msg); } }

const ids = Object.keys(STORY);

// ===== 行き先 =====
console.log('■ 行き先');
ids.forEach(id => {
  const n = STORY[id];
  const outs = [];
  if(n.to) outs.push(['to', n.to]);
  (n.c || []).forEach((c, i) => outs.push(['選択' + (i + 1), c.to]));
  outs.forEach(([label, dest]) => {
    check(dest && STORY[dest], id + ' の ' + label + ' → "' + dest + '" が存在しない');
  });
  if(n.k !== 'end'){
    check(outs.length > 0, id + ' から先へ進めない（行き止まり）');
  }
});

// ===== 到達性 =====
console.log('■ 到達性');
const seen = new Set(), stack = ['c1'];
while(stack.length){
  const id = stack.pop();
  if(seen.has(id) || !STORY[id]) continue;
  seen.add(id);
  const n = STORY[id];
  if(n.to) stack.push(n.to);
  (n.c || []).forEach(c => c.to && stack.push(c.to));
}
ids.forEach(id => check(seen.has(id), id + ' に到達できない'));
check(ids.some(id => STORY[id].k === 'end'), '終章が無い');

// ===== 中身 =====
console.log('■ 章の中身');
ids.forEach(id => {
  const n = STORY[id];
  if(n.k === 'end') return;
  check(!!n.h, id + ' に見出しが無い');
  check(!!n.t, id + ' に本文が無い');
  if(n.k === 'battle'){
    check(!!n.en && !!n.sig, id + ' に敵名か印が無い');
    check(n.tier >= 1 && n.tier < STORY_TIER.length, id + ' の tier が範囲外: ' + n.tier);
    check(!!n.win, id + ' に勝利時の文章が無い');
    check(!!n.to, id + ' の戦闘後の行き先が無い');
    // 数値を物語データに書いていないこと（書くと式と二重管理になる）
    ['hp','atk','def','g'].forEach(k =>
      check(n[k] === undefined, id + ' が敵の数値 ' + k + ' を直接持っている'));
  }
  (n.c || []).forEach((c, i) => {
    check(!!c.t, id + ' の選択' + (i + 1) + ' に文言が無い');
    if(c.task){
      check(!!c.task.n, id + ' の選択' + (i + 1) + ' のタスクに名前が無い');
      check(c.task.sec > 0, id + ' の選択' + (i + 1) + ' のタスクに秒数が無い');
    }
  });
});

// ===== 結末の偏り =====
console.log('■ 結末');
let maxKeep = 0, maxGo = 0;
ids.forEach(id => (STORY[id].c || []).forEach(c => { maxKeep += c.keep || 0; maxGo += c.go || 0; }));
check(maxKeep === maxGo,
  'のこす(' + maxKeep + ')とてばなす(' + maxGo + ')の最大値が非対称。どちらかの結末が出にくい');
check(STORY_END.length === 3, '結末が3つ揃っていない');
STORY_END.forEach((e, i) => check(!!e.h && !!e.t, '結末' + (i + 1) + ' が空'));

// 到達しうる差分で、3つの結末すべてに入りうるか
const reachable = new Set();
(function walk(id, keep, go, depth){
  if(depth > 40 || !STORY[id]) return;
  const n = STORY[id];
  if(n.k === 'end'){ const d = keep - go; reachable.add(d <= -2 ? 0 : (d >= 2 ? 1 : 2)); return; }
  if(n.to) walk(n.to, keep, go, depth + 1);
  (n.c || []).forEach(c => walk(c.to, keep + (c.keep || 0), go + (c.go || 0), depth + 1));
})('c1', 0, 0, 0);
[0, 1, 2].forEach(i =>
  check(reachable.has(i), '結末「' + STORY_END[i].h + '」に到達できる選び方が無い'));

console.log('\n' + (ng ? 'NG ' + ng + '件 / ' : '') + 'OK ' + ok + '件'
  + '（' + ids.length + '章・' + ids.filter(i => STORY[i].k === 'battle').length + '戦闘）');
process.exit(ng ? 1 : 0);
