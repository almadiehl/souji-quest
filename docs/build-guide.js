// 装備大全を index.html の実データから生成する
// 使い方: node docs/build-guide.js
const fs=require('fs');
const src=fs.readFileSync(__dirname + '/../index.html','utf8');
function grab(re){ const m=re.exec(src); if(!m) throw new Error('not found: '+re); return m[0]; }
const code=[
 /var SHOP = \{[\s\S]*?\n\};/, /var RARITY = \[[\s\S]*?\n\];/,
 /var RARITY_W\s+= \[[^\]]*\];/, /var RARITY_W_BOSS = \[[^\]]*\];/,
 /var BAG_MAX = \d+;/, /var AFFIX = \[[\s\S]*?\n\];/,
 /var SLOT_AFFIX = \{[\s\S]*?\n\};/, /var UNIQUES = \{[\s\S]*?\n\};/,
 /var BLESS = \[[\s\S]*?\n\];/, /var REROLL_COST = \d+, PROMOTE_COST = \d+;/,
 /var KI = \{[^}]*\};/, /var SLOTS = \[[^\]]*\];/
].map(grab).join('\n');
eval(code);
const SLOT_JA={weapon:'ぶき',armor:'よろい',glove:'てぶくろ',boots:'はきもの',acc:'おまもり'};
const RAR_JA=['並','上質な','業物の','銘品・','伝説'];
function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function num(v){ return v ? v : '—'; }

// ===== 装備表 =====
function gearTable(slot){
  const rows=SHOP[slot].map((g,i)=>{
    const when = g.deep ? `B${g.deep}F〜` : (i===0 ? '最初' : `Lv${i*4}〜`);
    const st=[g.atk?`<b>こ</b>${g.atk}`:null, g.def?`<b>ま</b>${g.def}`:null, g.hp?`<b>H</b>${g.hp}`:null]
      .filter(Boolean).join(' ');
    return `<tr class="${g.deep?'deep':''}">
      <td class="nm">${esc(g.n)}${g.deep?'<i class="dtag">深</i>':''}</td>
      <td class="st">${st}</td>
      <td class="n g">${g.cost.toLocaleString()}</td>
      <td class="w">${when}</td></tr>`;
  }).join('');
  return `<div class="tw"><table>
    <thead><tr><th>名前</th><th>数値</th><th class="n">値段</th><th>出る</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
const gearSections = SLOTS.map(s=>`
  <h3 id="g-${s}">${SLOT_JA[s]}<span class="cnt">${SHOP[s].length}点</span></h3>
  <p class="lead">出やすい接辞：${SLOT_AFFIX[s].map(k=>{const a=AFFIX.find(x=>x.k===k);return `<b>${a?a.n:k}</b>`;}).join(' / ')}</p>
  ${gearTable(s)}`).join('');

// ===== 接辞表 =====
const affixRows=AFFIX.map(a=>{
  const slots=SLOTS.filter(s=>SLOT_AFFIX[s].includes(a.k)).map(s=>SLOT_JA[s]).join('・')||'—';
  const sign=a.minus?'−':'+';
  return `<tr><td class="nm">${esc(a.n)}<em class="sub">${esc(a.d)}</em></td>
    <td class="n">${sign}${a.min}〜${a.max}${a.u}<em class="t2">深 ${sign}${a.m2}〜${a.x2}${a.u}</em></td>
    <td class="w">${slots}</td></tr>`;
}).join('');

// ===== レア度 =====
const wSum=RARITY_W.reduce((x,y)=>x+y,0), wbSum=RARITY_W_BOSS.reduce((x,y)=>x+y,0);
const rarRows=[0,1,2,3].map(i=>`<tr>
  <td class="nm" style="color:${RARITY[i].col}">${RAR_JA[i]||'並'}</td>
  <td class="n">×${RARITY[i].mul.toFixed(2)}</td><td class="n">${RARITY[i].af}個</td>
  <td class="n">${(RARITY_W[i]/wSum*100).toFixed(1)}%</td>
  <td class="n">${(RARITY_W_BOSS[i]/wbSum*100).toFixed(1)}%</td></tr>`).join('');

// ===== ユニーク =====
const uqRows=Object.keys(UNIQUES).map(k=>{
  const u=UNIQUES[k];
  const boss={e3:'靴箱のヌシ',e7:'万年筆騎士',e11:'乾燥機の番人',e15:'冷蔵庫竜',e19:'混沌王カオス'}[k];
  const af=u.af.map(a=>{const d=AFFIX.find(x=>x.k===a.k);return `◇${d.d} ${d.minus?'−':'+'}${a.v}${d.u}`;}).join('<br>');
  return `<tr><td class="nm">${esc(u.n)}<em class="sub">${boss} ／ ${SLOT_JA[u.s]}</em></td>
    <td class="st">${[u.atk?`<b>こ</b>${u.atk}`:null,u.def?`<b>ま</b>${u.def}`:null,u.hp?`<b>H</b>${u.hp}`:null].filter(Boolean).join(' ')}</td>
    <td class="afx">${af}</td></tr>`;
}).join('');

// ===== 加護 =====
const blRows=BLESS.map(b=>`<tr><td class="nm">${esc(b.n)}</td><td>${esc(b.d)}</td></tr>`).join('');

const html=`<meta charset="utf-8">
<title>塵界そうじクエスト 装備大全</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap">
<style>
:root{
  --ink:#0E1118; --panel:#171C28; --panel2:#1E2434; --line:#2C3446; --line2:#212838;
  --text:#E6E9F2; --muted:#8E97AE; --dim:#5F6883;
  --gold:#F0C14B; --gold-dim:#8A6E24; --mint:#57D6A6; --violet:#8C7BFF; --ember:#FF7A59; --blood:#E8574C;
  --hud:"DotGothic16","Courier New",monospace;
  --body:"Zen Kaku Gothic New",-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--text);font-family:var(--body);font-size:15px;line-height:1.8;-webkit-text-size-adjust:100%}
.wrap{max-width:820px;margin:0 auto;padding:0 18px 80px}
header{border-bottom:1px solid var(--line);margin-bottom:26px;padding:38px 0 22px;text-align:center}
header .eye{font-family:var(--hud);font-size:11px;letter-spacing:.42em;color:var(--gold);padding-left:.42em}
header h1{font-size:30px;margin:12px 0 6px;letter-spacing:.04em;text-wrap:balance}
header p{margin:0;color:var(--muted);font-size:13px}
header .warn{margin-top:14px;display:inline-block;border:1px solid var(--blood);color:var(--blood);
  font-family:var(--hud);font-size:11px;letter-spacing:.16em;padding:4px 12px;border-radius:4px}
nav{position:sticky;top:0;z-index:5;background:rgba(14,17,24,.95);border-bottom:1px solid var(--line);
  margin:0 -18px 26px;padding:9px 18px;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch}
nav a{flex:none;font-family:var(--hud);font-size:11.5px;letter-spacing:.1em;color:var(--muted);text-decoration:none;
  border:1px solid var(--line);border-radius:99px;padding:5px 11px;white-space:nowrap}
nav a:hover{color:var(--gold);border-color:var(--gold-dim)}
h2{font-size:19px;margin:44px 0 8px;padding-bottom:8px;border-bottom:1px solid var(--line);letter-spacing:.03em}
h2 .no{font-family:var(--hud);font-size:12px;color:var(--gold);margin-right:10px;letter-spacing:.14em}
h3{font-size:16px;margin:30px 0 6px;color:var(--gold)}
h3 .cnt{font-family:var(--hud);font-size:11px;color:var(--dim);margin-left:10px;letter-spacing:.08em}
p.lead{color:var(--muted);font-size:13px;margin:4px 0 12px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-family:var(--hud);font-size:10px;letter-spacing:.06em;color:var(--dim);font-weight:400;
  text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:8px 8px;border-bottom:1px solid var(--line2);vertical-align:top}
tr:last-child td{border-bottom:none}
td.n,th.n{text-align:right;font-family:var(--hud);font-variant-numeric:tabular-nums;white-space:nowrap}
td.g{color:var(--gold)}
td.nm{font-weight:700;line-height:1.5}
td.nm em.sub{display:block;font-style:normal;font-size:11px;color:var(--muted);font-weight:400}
td.st{font-family:var(--hud);font-size:12px;color:var(--mint);white-space:nowrap;letter-spacing:.02em}
td.st b{color:var(--dim);font-weight:400;margin-right:1px}
td.n em.t2{display:block;font-style:normal;font-size:11px;color:var(--ember);font-family:var(--hud)}
td.w{color:var(--muted);font-size:11px;white-space:nowrap}
td.t2{color:var(--ember)}
td.afx{color:var(--violet);font-size:12px;line-height:1.6}
tr.deep td.nm{color:var(--ember)}
.dtag{font-style:normal;font-family:var(--hud);font-size:9px;border:1px solid var(--ember);color:var(--ember);
  border-radius:3px;padding:0 4px;margin-left:7px;vertical-align:2px}
.box{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--gold);
  border-radius:10px;padding:14px 16px;margin:16px 0}
.box.v{border-left-color:var(--violet)}
.box.m{border-left-color:var(--mint)}
.box b{color:var(--gold)}
.box.v b{color:var(--violet)}
.box.m b{color:var(--mint)}
.f{font-family:var(--hud);font-size:12.5px;background:#0B0E16;border:1px solid var(--line);
  border-radius:8px;padding:12px 14px;margin:12px 0;color:var(--mint);overflow-x:auto;white-space:pre;line-height:1.9}
.f .c{color:var(--dim)}
ul{padding-left:1.2em;color:var(--muted);font-size:13.5px}
li{margin:5px 0}
li b{color:var(--text)}
footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);color:var(--dim);font-size:12px;text-align:center}
@media (max-width:520px){ header h1{font-size:24px} body{font-size:14.5px} }
</style>

<div class="wrap">
<header>
  <div class="eye">SOUJI QUEST</div>
  <h1>装備大全</h1>
  <p>塵界のそうじクエスト ／ 装備・接辞・合成のすべて</p>
  <div class="warn">ネタバレあり</div>
</header>

<nav>
  <a href="#kihon">基本</a><a href="#rarity">レア度</a><a href="#affix">接辞</a>
  <a href="#g-weapon">ぶき</a><a href="#g-armor">よろい</a><a href="#g-glove">てぶくろ</a>
  <a href="#g-boots">はきもの</a><a href="#g-acc">おまもり</a>
  <a href="#uniq">伝説</a><a href="#drop">出現率</a><a href="#craft">合成</a><a href="#bless">加護</a><a href="#tips">狙い方</a>
</nav>

<h2 id="kihon"><span class="no">01</span>装備の基本</h2>
<p>装備は<b>5つのスロット</b>に1点ずつ。すべて<b>1点もの</b>で、同じ名前でも数値が違います。</p>
<div class="f">装備の数値 ＝ 基準値 × レア度倍率 × 個体差(0.88〜1.12) × 強化(1 + 0.05 × 段数)</div>
<ul>
<li><b>個体差</b>は拾った瞬間に決まり、あとから変わりません。±12%の幅があります。</li>
<li><b>強化（+N）</b>は何段でも積めます。1段ごとに基準の5%ずつ増加。</li>
<li><b>接辞</b>はレア度で個数が決まり、粉で引き直せます。</li>
</ul>
<div class="box m"><b>覚えておくこと。</b>ドロップ率は「その戦闘でゴミを拾った回数」で上がります。0回なら基礎の4割、2回で満額、3回以上で1.3倍。<b>拾わないと落ちません。</b></div>

<h2 id="rarity"><span class="no">02</span>レア度</h2>
<div class="tw"><table>
<thead><tr><th>レア度</th><th class="n">倍率</th><th class="n">接辞</th><th class="n">通常</th><th class="n">ボス</th></tr></thead>
<tbody>${rarRows}</tbody></table></div>
<p class="lead">※「宝を抱えた敵」からは必ず上質以上が落ちます。伝説（ユニーク）はボス初回撃破の確定枠で、この抽選とは別です。</p>

<h2 id="affix"><span class="no">03</span>接辞 ${AFFIX.length}種</h2>
<p>装備に付くランダムな特性。<b class="dtag" style="border-color:var(--ember)">深層</b>で拾ったものは<b style="color:var(--ember)">上位の値幅</b>で出ます。</p>
<div class="tw"><table>
<thead><tr><th>名前 ／ 効果</th><th class="n">値幅</th><th>付きやすい</th></tr></thead>
<tbody>${affixRows}</tbody></table></div>
<div class="box v">8割はスロット固有の候補から、<b>2割は完全ランダム</b>で選ばれます。てぶくろに「鋭さ」が付くこともあります。</div>

<h2 id="cat"><span class="no">04</span>装備カタログ ${SLOTS.reduce((a,s)=>a+SHOP[s].length,0)}点</h2>
<p class="lead">数値は<b>基準値</b>（並・個体差なし・強化なし）です。実際に拾うものはこれに倍率がかかります。</p>
${gearSections}

<h2 id="uniq"><span class="no">05</span>伝説の一点もの</h2>
<p>各ボスの<b>初回撃破で確定</b>。素の数値では見劣りしますが、特別な接辞を持ちます。</p>
<div class="tw"><table>
<thead><tr><th>名前 ／ 出どころ</th><th>数値</th><th>特別な効果</th></tr></thead>
<tbody>${uqRows}</tbody></table></div>

<h2 id="drop"><span class="no">06</span>出現率のしくみ</h2>
<div class="f">ドロップ率 ＝ 基礎率 × min(1.3, 0.4 + 0.3 × 拾った回数) × (1 + 宝運/100)
<span class="c">※「宝を抱えた敵」は必ず落とす</span>

<span class="c">基礎率</span>  通常の敵 40%  ／  ボス 100%
       深層 55%      ／  層主・今日の魔物 100%</div>
<div class="box"><b>宝を抱えた敵</b>は通常12%、深層18%の確率で現れます。HP1.3倍・攻撃1.15倍・報酬2倍。<b>戦利品は必ず上質以上。</b></div>
<div class="f"><span class="c">深層で落ちる装備の段は、階層で解放される</span>
B3F〜   7段目（虚無の箒 など）
B8F〜   8段目（静寂の柄 など）
B15F〜  9段目（塵払いの神器 など）

<span class="c">本編では深層専用の装備は落ちない。店にも並ばない。</span></div>

<h2 id="craft"><span class="no">07</span>粉と合成</h2>
<div class="f">分解で得る粉 ＝ (2 + レア度 × 3 + 強化段数 × 2) × (1 + 収集/100)

接辞を引き直す  ${REROLL_COST} 粉   <span class="c">個数はそのまま。深層産は深層産のまま</span>
格上げする      ${PROMOTE_COST} 粉   <span class="c">レア度+1・数値も上がる・接辞が増える</span>
強化 +1         基準値 × 0.45 × 1.5^(現在の段数) ゴールド
売る            基準値 × レア度 × 0.35 × (1 + 0.35 × 段数) ゴールド</div>
<div class="box m">持ち物は<b>${BAG_MAX}点</b>まで。いっぱいのときに拾うと、<b>弱いほうが自動で売却</b>されます。強いものが消えることはありません。</div>

<h2 id="bless"><span class="no">08</span>潜行の加護 ${BLESS.length}種</h2>
<p>深層で1階越えるごとに、3つから1つ選びます。<b>その潜行のあいだだけ</b>効きます。</p>
<div class="tw"><table>
<thead><tr><th>名前</th><th>効果</th></tr></thead><tbody>${blRows}</tbody></table></div>

<h2 id="tips"><span class="no">09</span>狙い方</h2>
<ul>
<li><b>戦闘中は必ず2回は拾う。</b>ドロップ率が4割から満額になります。回復と気力も付いてくるので、拾わない理由がありません。</li>
<li><b>気力型を組むなら「てぶくろ」を集める。</b>「拾い上手（拾うと気力+1）」はてぶくろに出やすく、大掃除の回転が上がります。</li>
<li><b>深層産の接辞は別物。</b>会心率は通常2〜4%に対し深層産は5〜8%。同じ名前の装備でも拾い直す価値があります。</li>
<li><b>格上げは「個体差の良いもの」に。</b>格上げは今の数値に倍率をかけ直すので、元が良いほど伸びます。</li>
<li><b>強化は費用が1.5倍ずつ増える。</b>+5あたりから急に重くなります。長く使うと決めた1点に絞るのが得です。</li>
<li><b>伝説は数値で選ばない。</b>「ヌシの靴べら」は素の数値では負けますが、宝運+15%は拾う量そのものを増やします。</li>
<li><b>潜行の加護は「活力」か「不屈」を早めに。</b>HPが階をまたいで戻らないので、生存に関わる加護が最優先です。</li>
</ul>

<footer>塵界のそうじクエスト ／ 装備大全<br>数値はアプリの実装から自動抽出しています</footer>
</div>`;
fs.writeFileSync(__dirname + '/equipment-guide.html', html);
console.log('書き出し:', html.length, '字');
console.log('装備', SLOTS.reduce((a,s)=>a+SHOP[s].length,0), '点 / 接辞', AFFIX.length, '種 / 加護', BLESS.length, '種 / 伝説', Object.keys(UNIQUES).length, '点');
