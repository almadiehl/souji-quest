// docs/SPEC.md から読み物としての仕様書ページを作る
// 使い方: node docs/build-spec.js
// 出典は SPEC.md ただ1つ。生成される spec.html を直接編集しないこと。
const fs = require('fs');
const md = fs.readFileSync(__dirname + '/SPEC.md', 'utf8');
// 行数は実物から数える（手で書くと必ず古くなる）
const APP_LINES = fs.readFileSync(__dirname + '/../index.html', 'utf8').split('\n').length;

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ===== インライン =====
// コード片は先に取り出しておく（中の ** や [ ] を装飾として拾わないため）
function inline(raw){
  const code = [];
  let t = esc(raw).replace(/`([^`]+)`/g, (_, c) => '' + (code.push(c) - 1) + '');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/(^|[\s（])(https?:\/\/[^\s<）]+)/g, '$1<a href="$2">$2</a>');
  return t.replace(/(\d+)/g, (_, i) => '<code>' + code[i] + '</code>');
}

// 表題に出す情報は SPEC.md の前書きから読む（二重管理にしない）
const metaLine = /最終更新:\s*(\S+)\s*\/\s*対象コミット:\s*`([^`]+)`/.exec(md);
const UPDATED = metaLine ? metaLine[1] : '';
const COMMIT  = metaLine ? metaLine[2] : '';

// ===== ブロック =====
// 前書き（最初の ## より前）は表題が兼ねるので落とす
const lines = md.slice(md.indexOf('\n## ')).split('\n');
const out = [];
const toc = [];
let i = 0, secNo = 0;

// 段落の終わりの判定。行頭のバッククォートは「コード片で始まる文」でもあるので、
// フェンス（```）だけをブロック扱いにする
function isBlockStart(s){
  return s.trim() === '' || s.trim() === '---' || s.startsWith('```') ||
         /^#{1,6}\s/.test(s) || s.startsWith('> ') ||
         s.trim().startsWith('|') || /^[-*]\s/.test(s) || /^\d+\.\s/.test(s);
}

function tableAt(){
  const rows = [];
  while(i < lines.length && lines[i].trim().startsWith('|')){
    rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    i++;
  }
  if(rows.length < 2) return '';
  const head = rows[0], body = rows.slice(2);          // rows[1] は区切り行
  const bare = head.every(c => c === '');              // 見出しの無い表
  const th = bare ? '' : '<thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead>';
  const tb = '<tbody>' + body.map(r =>
    '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody>';
  return '<div class="tw"><table>' + th + tb + '</table></div>';
}

while(i < lines.length){
  const L = lines[i];

  if(L.startsWith('```')){                             // コードブロック
    const lang = L.slice(3).trim(); i++;
    const buf = [];
    while(i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
    i++;
    out.push('<pre class="code"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') +
             '><code>' + esc(buf.join('\n')) + '</code></pre>');
    continue;
  }

  if(/^#{1,6}\s/.test(L)){                             // 見出し
    const lv = L.match(/^#+/)[0].length;
    const txt = L.replace(/^#+\s/, '');
    if(lv === 1){ i++; continue; }                     // 表題はマストヘッドに出す
    if(lv === 2){
      const m = txt.match(/^(\d+)\.\s*(.+)$/);
      secNo++;
      const id = 's' + secNo;
      const num = m ? m[1] : '';
      const label = m ? m[2] : txt;
      toc.push({ id: id, num: num, label: label });
      out.push('<section id="' + id + '"><h2>' +
        (num ? '<span class="no">' + num + '</span>' : '') +
        '<span>' + inline(label) + '</span></h2>');
      i++; continue;
    }
    out.push('<h3>' + inline(txt.replace(/^\d+\.\d+\s*/, '')) + '</h3>');
    i++; continue;
  }

  if(L.trim() === '---'){ i++; continue; }             // 章の境目。線は h2 の下線が兼ねる
  if(L.trim().startsWith('|')){ out.push(tableAt()); continue; }

  if(L.startsWith('> ')){                              // 注意書き
    const buf = [];
    while(i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2));
    out.push('<div class="warn"><p>' + buf.map(inline).join('<br>') + '</p></div>');
    continue;
  }

  if(/^\d+\.\s/.test(L)){                              // 番号つき（本当に順序のあるものだけ）
    const items = [];
    while(i < lines.length && (/^\d+\.\s/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))){
      if(/^\d+\.\s/.test(lines[i])) items.push(lines[i].replace(/^\d+\.\s/, ''));
      else items[items.length - 1] += ' ' + lines[i].trim();
      i++;
    }
    out.push('<ol>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ol>');
    continue;
  }

  if(/^[-*]\s/.test(L)){                               // 箇条書き（続き行のぶら下げ対応）
    const items = [];
    while(i < lines.length && (/^[-*]\s/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))){
      if(/^[-*]\s/.test(lines[i])) items.push(lines[i].replace(/^[-*]\s/, ''));
      else items[items.length - 1] += ' ' + lines[i].trim();
      i++;
    }
    out.push('<ul>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ul>');
    continue;
  }

  if(L.trim() === ''){ i++; continue; }

  // 段落。かならず1行は食べてから続きを見る（食べないと無限ループになる）
  const buf = [lines[i++]];
  while(i < lines.length && !isBlockStart(lines[i])) buf.push(lines[i++]);
  out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
}

// section を順に閉じる
let body = out.join('\n').replace(/<section /g, '</section><section ').replace(/^<\/section>/, '') + '</section>';

const nav = toc.map(t =>
  '<a href="#' + t.id + '"><span class="n">' + t.num + '</span>' + esc(t.label) + '</a>').join('\n    ');

const html = `<meta charset="utf-8">
<title>塵界のそうじクエスト 設計仕様書</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* 配色も書体もアプリ本体のものを引き継いでいる。
   仕様書がその製品の見た目をまとっている状態にしたい。 */
:root{
  --paper:#EDF0F5; --card:#FFFFFF; --ink:#131926; --muted:#59637A; --faint:#8A93A6;
  --rule:#D6DCE7; --rule-2:#E7EBF2;
  --accent:#8A6E24; --accent-soft:#F4EAD1; --warn:#A8362B; --warn-soft:#FAEDEB;
  --slab:#141A26; --slab-ink:#DFE4EF; --slab-line:#2A3346;
  --f-hud:"DotGothic16","Courier New",monospace;
  --f-body:"Zen Kaku Gothic New",-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0E1118; --card:#171C28; --ink:#E6E9F2; --muted:#8E97AE; --faint:#5F6883;
    --rule:#2C3446; --rule-2:#212838;
    --accent:#F0C14B; --accent-soft:#20180A; --warn:#E8574C; --warn-soft:#2A1614;
    --slab:#080B11; --slab-ink:#DFE4EF; --slab-line:#232C3D;
  }
}
:root[data-theme="dark"]{
  --paper:#0E1118; --card:#171C28; --ink:#E6E9F2; --muted:#8E97AE; --faint:#5F6883;
  --rule:#2C3446; --rule-2:#212838;
  --accent:#F0C14B; --accent-soft:#20180A; --warn:#E8574C; --warn-soft:#2A1614;
  --slab:#080B11; --slab-ink:#DFE4EF; --slab-line:#232C3D;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:var(--f-body); font-size:16px; line-height:1.85;
  -webkit-text-size-adjust:100%;
}
.wrap{max-width:1120px; margin:0 auto; padding:0 20px 96px; display:grid; gap:0 56px; grid-template-columns:1fr}

/* ===== 表題 ===== */
.mast{padding:60px 0 30px; border-bottom:1px solid var(--rule); margin-bottom:40px}
.mast .eyebrow{
  font-family:var(--f-hud); font-size:12px; letter-spacing:.22em; color:var(--accent);
  text-transform:uppercase; margin-bottom:16px;
}
.mast h1{
  font-weight:700; font-size:clamp(28px,6vw,42px);
  line-height:1.3; margin:0 0 16px; text-wrap:balance; letter-spacing:.01em;
}
.mast .sub{color:var(--muted); font-size:15px; max-width:62ch; margin:0}
.mast .meta{display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; font-family:var(--f-mono); font-size:12px}
.mast .meta span{
  border:1px solid var(--rule); border-radius:2px; padding:4px 10px;
  color:var(--muted); background:var(--card); font-variant-numeric:tabular-nums;
}

/* ===== 目次 ===== */
.toc{margin-bottom:44px}
.toc .lbl{
  font-family:var(--f-hud); font-size:11px; letter-spacing:.2em; color:var(--faint);
  text-transform:uppercase; margin-bottom:10px;
}
.toc a{
  display:flex; gap:12px; align-items:baseline; padding:7px 0;
  color:var(--ink); text-decoration:none; border-bottom:1px solid var(--rule-2); font-size:14.5px;
}
.toc a:last-child{border-bottom:0}
.toc a:hover{color:var(--accent)}
.toc .n{
  font-family:var(--f-hud); font-size:13px; color:var(--accent);
  min-width:2ch; text-align:right; font-variant-numeric:tabular-nums; flex:none;
}

/* ===== 本文 ===== */
main{min-width:0}
section{margin-bottom:56px; scroll-margin-top:20px}
h2{
  display:flex; align-items:baseline; gap:14px; margin:0 0 22px;
  font-size:clamp(20px,3.6vw,25px); font-weight:700; line-height:1.4; text-wrap:balance;
  padding-bottom:13px; border-bottom:2px solid var(--ink);
}
h2 .no{font-family:var(--f-hud); font-size:19px; color:var(--accent); font-variant-numeric:tabular-nums; flex:none}
h3{margin:34px 0 12px; font-size:16.5px; font-weight:700; line-height:1.5; padding-left:12px; border-left:3px solid var(--accent)}
p{margin:0 0 16px; max-width:70ch}
ul{margin:0 0 18px; padding-left:0; list-style:none; max-width:70ch}
li{position:relative; padding-left:20px; margin-bottom:9px}
li::before{content:""; position:absolute; left:2px; top:.78em; width:6px; height:6px; background:var(--accent); opacity:.6}
ol{margin:0 0 18px; padding-left:0; list-style:none; counter-reset:n; max-width:70ch}
ol>li{position:relative; padding-left:30px; margin-bottom:11px; counter-increment:n}
ol>li::before{
  content:counter(n); position:absolute; left:0; top:.06em;
  font-family:var(--f-hud); font-size:13px; color:var(--accent);
  font-variant-numeric:tabular-nums;
}
strong{font-weight:700}
a{color:var(--accent); text-underline-offset:3px}
code{
  font-family:var(--f-mono); font-size:.87em; background:var(--accent-soft);
  color:var(--ink); padding:1px 5px; border-radius:2px; word-break:break-word;
}

/* ===== コード。アプリの暗い画面をそのまま持ってきている ===== */
.code{
  position:relative; background:var(--slab); color:var(--slab-ink);
  border:1px solid var(--slab-line); border-radius:4px;
  padding:20px 18px 18px; overflow-x:auto; margin:0 0 22px;
  font-family:var(--f-mono); font-size:13px; line-height:1.75;
}
.code code{background:none; padding:0; color:inherit; font-size:inherit}
.code[data-lang]::before{
  content:attr(data-lang); position:absolute; top:0; right:0;
  font-family:var(--f-hud); font-size:10px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--slab-ink); opacity:.4; padding:5px 10px;
}

/* ===== 注意書き ===== */
.warn{border-left:3px solid var(--warn); background:var(--warn-soft); padding:15px 18px; margin:0 0 22px; border-radius:0 3px 3px 0}
.warn p{margin:0; max-width:66ch; font-size:15px}
.warn strong{color:var(--warn)}

/* ===== 表 ===== */
.tw{overflow-x:auto; margin:0 0 24px; border:1px solid var(--rule); border-radius:4px; background:var(--card)}
table{border-collapse:collapse; width:100%; font-size:14px; line-height:1.7}
th{
  text-align:left; font-family:var(--f-hud); font-weight:400; font-size:12px;
  letter-spacing:.1em; color:var(--muted); text-transform:uppercase;
  padding:11px 14px; border-bottom:1px solid var(--rule); white-space:nowrap;
}
td{padding:11px 14px; border-bottom:1px solid var(--rule-2); vertical-align:top; font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:0}
td:first-child{font-weight:500}
table code{font-size:.85em; background:none; padding:0; color:var(--accent)}

@media (min-width:940px){
  .wrap{grid-template-columns:210px 1fr}
  .mast{grid-column:1/-1}
  .toc{position:sticky; top:22px; align-self:start; max-height:calc(100vh - 44px); overflow-y:auto; margin-bottom:0}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}
a:focus-visible{outline:2px solid var(--accent); outline-offset:3px}
</style>

<div class="wrap">
  <header class="mast">
    <div class="eyebrow">Design Specification</div>
    <h1>塵界のそうじクエスト</h1>
    <p class="sub">部屋の掃除が進まない人のための一人用RPG。ゴミを1個すてると経験値とゴールドが1増える。<br>
      この文書は、新しいセッションへの引き継ぎと、外部レビューに渡すための資料。</p>
    <div class="meta">
      <span>最終更新 ${UPDATED}</span>
      <span>対象コミット ${COMMIT}</span>
      <span>単一HTML / ${APP_LINES.toLocaleString()}行</span>
    </div>
  </header>
  <nav class="toc">
    <div class="lbl">目次</div>
    ${nav}
  </nav>
  <main>
${body}
  </main>
</div>`;

fs.writeFileSync(__dirname + '/spec.html', html);
console.log('書き出し:', html.length, '字 /', toc.length, '章');
