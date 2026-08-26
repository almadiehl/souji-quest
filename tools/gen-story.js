// 物語の章をAPIで生成する（ビルド時。アプリにキーは入らない）
//
// 使い方:
//   node tools/gen-story.js                    … 試し打ち。何も送らず、送る内容だけ表示する
//   node tools/gen-story.js --seed 42 --n 8    … 章数と乱数の種を変える
//   OPENAI_API_KEY=sk-... node tools/gen-story.js --go   … 実際に生成する
//
// 設計の一線：
//   骨格（場所・章の型・敵の役割・のこす/てばなすの重み）は下の表と乱数で決める。
//   AIが書くのは文章だけ。敵の数値はそもそも渡さないし、返させない。
//   生成物は tools/test-story.js と同じ検証を通してからでないと採用しない。
//
// キーは環境変数からしか読まない。ファイルにも index.html にも書かない。

const fs = require('fs');
const path = require('path');

/* ============ 骨格（AIには決めさせない） ============ */
const PLACES = [
  "押入れの奥", "台所の隅", "洗面所の棚", "本棚の下段", "クローゼット",
  "ベランダ", "冷蔵庫の奥", "引き出しの底", "靴箱", "机の下", "寝室の隅", "玄関"
];
const KINDS = [
  { k:"探索", w:3 }, { k:"遭遇", w:2 }, { k:"発見", w:2 },
  { k:"選択", w:3 }, { k:"ひと息", w:1 }
];
const ROLES = [
  "守り手", "溜まったもの", "見ないふり", "未練", "重なったもの",
  "期限の切れたもの", "借りたままのもの", "作りかけのもの"
];
// 現実の片づけ。場所に紐づけて、選択の向きで振り分ける
const ACTIONS = {
  "てばなす": [
    "{place}から、いらないものを1つ選んで捨てる",
    "{place}にある「もう使わない」を1つ決める",
    "{place}の中身を1つだけ取り出して、置き場所を決める"
  ],
  "のこす": [
    "{place}のものを、崩さないように整える",
    "{place}にあるものを1つ、使う日を決める",
    "{place}のものを1つ、あるべき場所に戻す"
  ]
};
const SECS = [180, 300, 600];

/* ============ 再現できる乱数 ============ */
function rng(seed){
  let s = seed >>> 0;
  return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function pick(r, arr){ return arr[Math.floor(r() * arr.length)]; }
function pickW(r, arr){
  let t = 0; arr.forEach(a => t += a.w);
  let x = r() * t;
  for(const a of arr){ x -= a.w; if(x < 0) return a; }
  return arr[0];
}

/* ============ 章の設計図を組む ============ */
// keep と go の合計が必ず等しくなるように積む（結末が偏らない）
function blueprint(seed, n){
  const r = rng(seed);
  const nodes = [];
  const battleAt = new Set();
  // 戦闘は4章に1回くらい。最後は必ず章ボス
  for(let i = 3; i < n - 1; i += 3 + Math.floor(r() * 2)) battleAt.add(i);
  battleAt.add(n - 1);

  let lastPlace = null, lastKind = null;
  for(let i = 0; i < n; i++){
    const id = "g" + (i + 1);
    const to = (i === n - 1) ? "end" : "g" + (i + 2);
    // 同じ場所が続くと単調になる。直前と違う場所を引き直す
    let place = pick(r, PLACES);
    for(let g = 0; g < 8 && place === lastPlace; g++) place = pick(r, PLACES);
    lastPlace = place;
    if(battleAt.has(i)){
      const last = (i === n - 1);
      nodes.push({ id, k:"battle", place, role: pick(r, ROLES),
                   tier: last ? 3 : (r() < 0.4 ? 2 : 1), to });
      lastKind = "戦闘";
    } else {
      // 出だしは必ず探索。「ひと息」は序盤に置かず、連続もさせない
      let kind;
      if(i === 0) kind = "探索";
      else {
        kind = pickW(r, KINDS).k;
        for(let g = 0; g < 8; g++){
          const bad = (kind === "ひと息") && (i < 3 || lastKind === "ひと息");
          if(!bad) break;
          kind = pickW(r, KINDS).k;
        }
      }
      lastKind = kind;
      const weight = 1 + Math.floor(r() * 2);          // 1か2
      nodes.push({ id, k:"read", place, kind, to,
        choices: [
          { dir:"てばなす", go: weight,   act: pick(r, ACTIONS["てばなす"]).replace("{place}", place), sec: pick(r, SECS) },
          { dir:"のこす",   keep: weight, act: pick(r, ACTIONS["のこす"]).replace("{place}", place),   sec: pick(r, SECS) }
        ] });
    }
  }
  return nodes;
}

/* ============ プロンプト ============ */
const VOICE = `
文体の決まり:
- 二人称は使わず、「あなた」は最小限。静かで短い文。説明しない。
- 説教しない。片づけていないことを責めない。これは絶対。
- 比喩は1章に1つまで。感嘆符は使わない。
- 各章の本文は3〜4行。1行は40字以内。行は \\n で区切る。
- 既存の作品の語り口の例:
  「開けてみれば、要るものは3つだけだった。忘れていたということは、要らなかったということでもある。」
  「『まだ使える』と『これから使う』は、違う言葉だった。それだけのことに、ずいぶん長くかかった。」
  「少ないことは、寂しいことではない。ぜんぶ、選んだものだった。」
`.trim();

function buildPrompt(bp, arcTheme){
  const spec = bp.map(n => {
    if(n.k === "battle"){
      return `- ${n.id}｜戦闘｜場所:${n.place}｜敵の役割:${n.role}｜${n.tier === 3 ? "この章の最後の敵" : "道中の敵"}`;
    }
    return `- ${n.id}｜${n.kind}｜場所:${n.place}｜選択2つ（A=てばなす方向 / B=のこす方向）`;
  }).join("\n");

  return `部屋の片づけを題材にした一人用RPGの、章立ての物語を書いてください。
この物語の主題は「${arcTheme}」です。

${VOICE}

次の設計図のとおりに、章ごとの文章だけを作ってください。
場所・章の型・敵の役割・選択の向きは決定済みです。変更しないでください。

${spec}

守ること:
- 敵のHP・攻撃力・報酬などの数値は書かない。こちらで計算します。
- 選択肢の文言は、その場の行為として書く（「捨てる」「戻す」など）。
  現実の片づけ内容は別に指定済みなので、選択肢と同じ言葉にしないでください。
- 戦闘章には、敵に出会う場面の文章と、倒したあとの文章の両方が必要です。
- 章の見出しは6字以内。`;
}

/* ============ 返させる形（数値を入れる余地を作らない） ============ */
function schemaFor(bp){
  return {
    type: "object",
    additionalProperties: false,
    required: ["chapters"],
    properties: {
      chapters: {
        type: "array",
        minItems: bp.length, maxItems: bp.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "h", "t", "win", "choices"],
          properties: {
            id: { type: "string" },
            h:  { type: "string", maxLength: 12 },
            t:  { type: "string", maxLength: 260 },
            win:{ type: "string", maxLength: 160 },   // 戦闘以外は空文字
            choices: {
              type: "array", maxItems: 2,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["t"],
                properties: { t: { type: "string", maxLength: 40 } }
              }
            }
          }
        }
      }
    }
  };
}

/* ============ 検証（採用する前に必ず通す） ============ */
function validate(bp, out){
  const ng = [];
  if(!out || !Array.isArray(out.chapters)) return ["chapters が配列で返っていない"];
  if(out.chapters.length !== bp.length) ng.push("章数が違う: " + out.chapters.length + " / 期待 " + bp.length);
  bp.forEach((n, i) => {
    const c = out.chapters[i];
    if(!c) { ng.push(n.id + " が無い"); return; }
    if(!c.h) ng.push(n.id + " に見出しが無い");
    if(!c.t) ng.push(n.id + " に本文が無い");
    if(c.h && c.h.length > 12) ng.push(n.id + " の見出しが長い: " + c.h);
    if(n.k === "battle"){
      if(!c.win) ng.push(n.id + " に勝利文が無い");
    } else {
      if(!c.choices || c.choices.length !== 2) ng.push(n.id + " の選択肢が2つでない");
    }
    // 数値の混入（敵のステータスを書かせない）
    const numish = /(HP|ＨＰ|攻撃力|防御力|ゴールド|\d+\s*(点|ポイント|G))/;
    if(numish.test(c.t || "") || numish.test(c.win || "")) ng.push(n.id + " の文章に数値らしき記述がある");
    // 説教・叱責の混入
    const scold = /(だらしな|怠け|サボ|反省しろ|しなさい|べきだ)/;
    if(scold.test(c.t || "") || scold.test(c.win || "")) ng.push(n.id + " の文章が責める言い方になっている");
  });
  return ng;
}

/* ============ アプリのデータ形式に組み立てる ============ */
function assemble(bp, out){
  const story = {};
  bp.forEach((n, i) => {
    const c = out.chapters[i];
    if(n.k === "battle"){
      story[n.id] = { k:"battle", h:c.h, tier:n.tier, sig:n.role.slice(0,1), en:c.h,
                      t:c.t, win:c.win, to:n.to };
    } else {
      story[n.id] = { k: n.kind === "ひと息" ? "rest" : "read", h:c.h, t:c.t,
        c: n.choices.map((ch, j) => {
          const o = { t: (c.choices[j] && c.choices[j].t) || ch.dir, to: n.to,
                      task: { n: ch.act, sec: ch.sec } };
          if(ch.keep) o.keep = ch.keep;
          if(ch.go)   o.go   = ch.go;
          return o;
        }) };
    }
  });
  story.end = { k:"end", h:"扉の外" };
  return story;
}

/* ============ API（プロバイダは差し替えられる薄い層） ============ */
async function callAPI(prompt, schema, model){
  const key = process.env.OPENAI_API_KEY;
  if(!key) throw new Error("OPENAI_API_KEY が設定されていません");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":"Bearer " + key },
    body: JSON.stringify({
      model: model,
      messages: [{ role:"user", content: prompt }],
      response_format: { type:"json_schema",
        json_schema: { name:"story", strict:true, schema: schema } }
    })
  });
  if(!res.ok) throw new Error("API エラー " + res.status + ": " + (await res.text()).slice(0, 300));
  const j = await res.json();
  return { data: JSON.parse(j.choices[0].message.content), usage: j.usage };
}

/* ============ 実行 ============ */
const argv = process.argv.slice(2);
function arg(name, def){ const i = argv.indexOf("--" + name); return i < 0 ? def : argv[i + 1]; }
const SEED  = parseInt(arg("seed", "1"), 10);
const N     = parseInt(arg("n", "10"), 10);
const THEME = arg("theme", "元に戻す");
const MODEL = arg("model", "gpt-5-mini");
const GO    = argv.includes("--go");
const MOCK  = argv.includes("--mock");   // APIを呼ばずに、通し確認だけする

// APIの返答をこちらで作る。配管が通っているかを課金せずに確かめるため
function mockAnswer(bp){
  return { chapters: bp.map(n => ({
    id: n.id,
    h: (n.k === "battle" ? n.role.slice(0,3) : n.place.slice(0,3)) + "の間",
    t: n.place + "に立つ。\n何かが置かれたままになっている。\nまだ decide していない、という顔をしている。",
    win: n.k === "battle" ? "それは静かになった。\n置いたままにしていたのは、決めていなかったからだった。" : "",
    choices: n.k === "battle" ? [] : [{ t:"手に取る" }, { t:"そのままにする" }]
  })) };
}

const bp = blueprint(SEED, N);
const prompt = buildPrompt(bp, THEME);
const schema = schemaFor(bp);

// 骨格の健全性は送る前に確かめる
let keep = 0, go = 0;
bp.forEach(n => (n.choices || []).forEach(c => { keep += c.keep || 0; go += c.go || 0; }));

console.log("=== 骨格（AIには決めさせない部分）===");
console.log("  種:" + SEED + " / " + N + "章 / 主題「" + THEME + "」");
console.log("  のこす計 " + keep + " ／ てばなす計 " + go + (keep === go ? "  対称OK" : "  ← 非対称。結末が偏る"));
bp.forEach(n => console.log("  " + n.id.padEnd(4) +
  (n.k === "battle" ? "戦闘 tier" + n.tier + " 役割:" + n.role : n.kind.padEnd(4)) + "  " + n.place));

if(!GO && !MOCK){
  console.log("\n=== 送る内容（試し打ち。まだ何も送っていません）===\n");
  console.log(prompt);
  console.log("\n=== 見積り ===");
  const inChars = prompt.length;
  console.log("  入力 約" + inChars + "字（日本語はおよそ1字=1トークン前後）");
  console.log("  出力 " + N + "章 × 約120字 ＝ 約" + (N * 120) + "字");
  console.log("  ざっくり " + (inChars + N * 120) + " トークン規模。1回あたり1円未満の見込み。");
  console.log("\n本番で走らせるには:");
  console.log("  OPENAI_API_KEY=sk-... node tools/gen-story.js --seed " + SEED + " --n " + N + " --go");
  process.exit(0);
}

(async () => {
  let data, usage = null;
  if(MOCK){
    console.log("\n【模擬】APIは呼びません。組み立てと検証だけ通します。");
    data = mockAnswer(bp);
  } else {
    console.log("\n生成中… model=" + MODEL);
    ({ data, usage } = await callAPI(prompt, schema, MODEL));
  }
  const ng = validate(bp, data);
  if(ng.length){
    console.log("\n検証に落ちました。採用しません:");
    ng.forEach(m => console.log("  NG " + m));
    process.exit(1);
  }
  const story = assemble(bp, data);
  const outPath = path.join(__dirname, "..", "docs",
    (MOCK ? "mock-story-" : "generated-story-") + SEED + ".js");
  fs.writeFileSync(outPath,
    "// 自動生成（種:" + SEED + " 主題:" + THEME + " model:" + MODEL + "）\n" +
    "// index.html に入れる前に node tools/test-story.js を通すこと\n" +
    "var STORY = " + JSON.stringify(story, null, 2) + ";\n");
  console.log("検証 OK。書き出し: " + path.relative(process.cwd(), outPath));
  if(usage) console.log("使用トークン: 入力 " + usage.prompt_tokens + " / 出力 " + usage.completion_tokens);
  console.log("\n中身を読んでから index.html に入れてください。良くなければ --seed を変えて引き直す。");
})().catch(e => { console.error("失敗: " + e.message); process.exit(1); });
