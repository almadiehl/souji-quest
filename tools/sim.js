// 戦闘バランスのシミュレータ
// 使い方: node tools/sim.js
//
// 数式は index.html の実装と1対1で対応させること。ここが実装とずれた瞬間、
// この道具は「それらしい嘘」を出すだけの装置になる。過去に3回それでバランスを壊した。
// 装備表・気力の定数は index.html から直接読むので、手で写す必要はない。

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grab(re){ const m = re.exec(src); if(!m) throw new Error('見つからない: ' + re); return m[0]; }
eval([
  /var SHOP = \{[\s\S]*?\n\};/,
  /var SLOTS = \[[^\]]*\];/,
  /var KI = \{[^}]*\};/,
  /var AREAS = \[[\s\S]*?\n\];/
].map(grab).join('\n'));

const rnd = () => 0.85 + Math.random() * 0.30;

// ===== おまかせAI（index.html の decide() と同じ） =====
// naive = ボタンの意味を分かっていない人の打ち方。バランスはこちら側に合わせる。
function decide(s, naive){
  const { ki, php, ehp, charged, e, p } = s;
  if(charged) return "hataku";
  const normal = Math.max(1, p.atk - e.def * 0.85);
  const charge = p.atk * KI.TAMERU;
  const big    = p.atk * KI.OOSOUJI;
  const incoming = Math.max(1, e.atk - p.def * 0.60);
  const heal = Math.round(p.hp * KI.HEAL);
  if(naive){
    if(php <= p.hp * 0.35 && heal > incoming * 0.8 && ehp > normal * 3) return "pick";
    return "hataku";
  }
  if(normal >= ehp) return "hataku";
  if(ki >= KI.MAX && big >= ehp) return "oosouji";
  if(ki >= 1 && charge >= ehp) return "tameru";
  if(php <= p.hp * 0.45 && heal > incoming * 1.15 && ehp > normal * 3) return "pick";
  if(normal < p.atk * 0.45){
    if(ki >= KI.MAX && ehp > big) return "oosouji";
    if(ki >= 1) return "tameru";
    if(ehp > normal * 4) return "pick";
  }
  return "hataku";
}

function fight(p, e, naive){
  let php = p.hp, ehp = e.hp, ki = KI.START, charged = false, turn = 0;
  while(turn < 60){
    turn++;
    const act = decide({ ki, php, ehp, charged, e, p }, naive);
    if(act === "hataku"){
      const c = Math.random() < 0.10;
      ehp -= charged
        ? Math.max(1, Math.round(p.atk * KI.TAMERU * rnd() * (c ? 1.6 : 1)))
        : Math.max(1, Math.round((p.atk - e.def * 0.85) * rnd() * (c ? 1.6 : 1)));
      charged = false;
    } else if(act === "oosouji"){
      ehp -= Math.max(1, Math.round(p.atk * KI.OOSOUJI * rnd()));
      ki -= KI.MAX;
    } else if(act === "tameru"){
      charged = true; ki -= 1;
    } else if(act === "pick"){
      ki = Math.min(KI.MAX, ki + KI.PICK);
      php = Math.min(p.hp, php + Math.round(p.hp * KI.HEAL));
    }
    if(ehp <= 0) return true;
    const c = Math.random() < 0.06;
    php -= Math.max(1, Math.round((e.atk - p.def * 0.60) * rnd() * (c ? 1.5 : 1)));
    if(php <= 0) return false;
  }
  return false;   // 60ターン超過は敗北扱い（実装と同じ）
}

function rate(p, e, n, naive){
  let w = 0;
  for(let i = 0; i < n; i++) if(fight(p, e, naive)) w++;
  return w / n;
}

// ===== そのレベルで持っていそうな装備 =====
// 「買える金が貯まるのはこのあたり」という現実的な線。強すぎる想定で組むと
// 実際のプレイヤーが勝てなくなる（これも過去に踏んだ）。
const TIMELINE = [
  [1,  null, null, null, null, null],
  [3,  'w1', 'a1', null, null, null],
  [5,  'w2', 'a1', 'g1', 'b1', 'c1'],
  [7,  'w3', 'a2', 'g1', 'b1', 'c1'],
  [9,  'w3', 'a2', 'g2', 'b2', 'c2'],
  [10, 'w3', 'a3', 'g2', 'b2', 'c2'],
  [12, 'w4', 'a3', 'g2', 'b2', 'c2'],
  [13, 'w4', 'a3', 'g3', 'b3', 'c3'],
  [15, 'w4', 'a4', 'g3', 'b3', 'c3'],
  [17, 'w5', 'a4', 'g4', 'b4', 'c4'],
  [18, 'w5', 'a5', 'g4', 'b4', 'c4'],
  [21, 'w6', 'a5', 'g5', 'b5', 'c5']
];
function gearAt(lv){
  let g = [null, null, null, null, null];
  for(const [l, ...r] of TIMELINE) if(lv >= l) g = r;
  return g;
}
function itemById(slot, id){ return id ? SHOP[slot].find(x => x.id === id) : null; }

// 素の値は index.html の stats() と同じ。鍛錬(train)は0で見る。
function P(lv){
  const g = gearAt(lv);
  let atk = 4 + (lv - 1) * 2,
      def = 2 + Math.round((lv - 1) * 1.5),
      hp  = 24 + (lv - 1) * 6;
  SLOTS.forEach((slot, i) => {
    const it = itemById(slot, g[i]);
    if(it){ atk += it.atk || 0; def += it.def || 0; hp += it.hp || 0; }
  });
  return { atk, def, hp };
}

// ===== 敵 =====
// ストーリーの敵は AREAS からそのまま読む
function storyEnemies(){
  const out = [];
  AREAS.forEach(a => a.e.forEach(e => out.push(e)));
  return out;
}
// 今日の魔物・積もった塵は「いまの自分」から逆算される
function dailyBoss(p){
  return { n:"今日の魔物", hp:Math.max(12, Math.round(p.atk * 6.0)),
           atk:Math.max(2, Math.round(p.hp / 8 + p.def * 0.6)),
           def:Math.max(0, Math.round(p.atk * 0.25)) };
}
function debtEnemy(p, days){
  const hard = Math.min(days, 8), k = 1 + 0.04 * (hard - 1);
  return { n:days + "日ぶん", hp:Math.max(20, Math.round(p.atk * 5.0 * k)),
           atk:Math.max(2, Math.round(p.hp / 8 + p.def * 0.6)),
           def:Math.max(0, Math.round(p.atk * 0.22)) };
}
function deepEnemy(f){
  const lord = (f % 5 === 0);
  return { n:"B" + f + "F" + (lord ? "（層主）" : ""),
           hp:Math.round(674 * Math.pow(1.035, f - 1) * (lord ? 1.25 : 1)),
           atk:Math.round(70 * Math.pow(1.020, f - 1) * (lord ? 1.10 : 1)),
           def:Math.round(34 * Math.pow(1.015, f - 1)) };
}

// その階まで潜った人が現実的に持っている装備と鍛錬。深層装備は B3/B8/B15F で解放される。
function delver(floor, trainPts){
  const p = P(22);
  SLOTS.forEach(slot => {
    const best = SHOP[slot].filter(x => !x.deep || floor >= x.deep).slice(-1)[0];
    const base = itemById(slot, gearAt(22)[SLOTS.indexOf(slot)]);   // Lv22時点で着けているもの
    if(best && best !== base){
      p.atk += (best.atk || 0) - (base.atk || 0);
      p.def += (best.def || 0) - (base.def || 0);
      p.hp  += (best.hp  || 0) - (base.hp  || 0);
    }
  });
  // 鍛錬は3種に均等配分（こう+2 / まも+2 / HP+10）
  const each = trainPts / 3;
  p.atk += Math.round(each * 2); p.def += Math.round(each * 2); p.hp += Math.round(each * 10);
  return p;
}

function cumTrain(n){ let sum = 0; for(let i = 0; i < n; i++) sum += Math.round(100 * Math.pow(1.06, i)); return sum; }

module.exports = { rate, fight, P, gearAt, delver, cumTrain, storyEnemies, dailyBoss, debtEnemy, deepEnemy, KI, SHOP, AREAS };

// ===== そのまま実行したときの通し確認 =====
if(require.main === module){
  const N = 3000;
  const pc = x => String(Math.round(x * 100)).padStart(3) + "%";

  console.log("\n■ ストーリー（適正レベル・鍛錬なし）");
  console.log("  " + "敵".padEnd(18) + " 雑   上手い   自分 こ/ま/H");
  storyEnemies().forEach(e => {
    const p = P(e.lv);
    console.log("  " + (e.n + (e.boss ? "★" : "")).padEnd(18),
      pc(rate(p, e, N, true)), " ", pc(rate(p, e, N, false)),
      "  " + p.atk + "/" + p.def + "/" + p.hp);
  });

  console.log("\n■ 今日の魔物（毎日出る・いつ挑んでも同じ手応え）");
  [5, 10, 16, 22].forEach(lv => {
    const p = P(lv);
    console.log("  Lv" + String(lv).padEnd(3), pc(rate(p, dailyBoss(p), N, true)), "（雑）",
      pc(rate(p, dailyBoss(p), N, false)), "（上手い）");
  });

  console.log("\n■ 積もった塵（空けた日数ぶん・戻ってきた人を跳ね返さないこと）");
  [2, 5, 8, 14, 30].forEach(d => {
    const r = [12, 16, 22].map(lv => rate(P(lv), debtEnemy(P(lv), d), 1500, true));
    console.log("  " + String(d).padStart(2) + "日ぶん", pc(r.reduce((a, b) => a + b) / 3), "（雑・Lv12/16/22の平均）");
  });

  console.log("\n■ 深層：どこで止まるか（単発勝率が70%を切る階）");
  console.log("  深層は稼いだゴールドの捨て場。装備と鍛錬に注ぎ込んだ前提でないと意味がない。");
  console.log("  HPは階をまたいで持ち越すので、実際の到達階はこれより手前になる。");
  [0, 10, 25, 50, 100].forEach(t => {
    let wall = 1;
    for(let f = 1; f <= 200; f++){
      if(rate(delver(f, t), deepEnemy(f), 600, false) < 0.70){ wall = f; break; }
      wall = f + 1;
    }
    console.log("  鍛錬" + String(t).padStart(3) + "回 → B" + wall + "F で頭打ち"
      + "（鍛錬費 約" + Math.round(cumTrain(t) / 1000) + "k G）");
  });
  console.log("");
}
