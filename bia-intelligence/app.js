/* BIA Intelligence — interactive study companion. Vanilla JS, no build step. */
"use strict";
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- data ---------- */
const BASE_TABLES = ["observations","cards","mistake_guides","generated","topic_notes","topic_summaries","syllabus"];
/* CAF-2 Taxation tables (paraphrase-only throughout — no verbatim ICAP text). */
const TAX_TABLES = ["tax_syllabus","tax_topics","tax_questions","tax_observations","tax_legislation","tax_practice"];
const DB = {};
const TYPES = {
  question:   {table:"questions",      label:"Question"},
  observation:{table:"observations",   label:"Examiner note"},
  card:       {table:"cards",          label:"Flashcard"},
  guide:      {table:"mistake_guides", label:"Mistake guide"},
  generated:  {table:"generated",      label:"Practice question"},
  note:       {table:"topic_notes",    label:"Revision note"},
  taxquestion:{table:"tax_questions",  label:"Tax question summary"},
  taxobs:     {table:"tax_observations", label:"Tax examiner note"},
  taxpractice:{table:"tax_practice",   label:"Generated tax practice"},
  taxtopic:   {table:"tax_topics",     label:"Tax topic"},
};
const titleOf = (type, row) => {
  if (type === "question") return `Q${row.number} · ${row.session} (${row.marks==null?"?":row.marks} marks)`;
  if (type === "observation") return row.id + " · " + row.session;
  if (type === "card") return row.front.slice(0, 80);
  if (type === "guide") return row.title;
  if (type === "generated") return row.id + " · generated practice";
  if (type === "note") return row.title;
  if (type === "taxquestion") return `Q${row.number} · ${row.session} (${row.marks==null?"?":row.marks} marks)`;
  if (type === "taxobs") return row.id + " · " + row.session;
  if (type === "taxpractice") return row.id + " · generated practice";
  if (type === "taxtopic") return row.title;
  return row.id;
};
const bodyOf = (type, row) => {
  if (type === "question") return [row.summary, row.verbatim||"", (row.command_words||[]).join(" "), (row.topic_tags||[]).join(" ")].join(" ");
  if (type === "observation") return [row.observation, row.what_went_wrong||"", row.stronger_answer||""].join(" ");
  if (type === "card") return row.front + " " + row.back;
  if (type === "guide") return [row.title, row.description||"", row.why||""].join(" ");
  if (type === "generated") return row.prompt + " " + (row.skills||"");
  if (type === "note") return [row.title, row.overview||"", row.key_concepts||""].join(" ");
  if (type === "taxquestion") return [row.summary, (row.topic_codes||[]).join(" "), (row.legislation_refs||[]).join(" "), row.type_label||""].join(" ");
  if (type === "taxobs") return [row.observation, row.what_went_wrong||"", row.stronger_answer||""].join(" ");
  if (type === "taxpractice") return [row.question_text, row.topic_title||"", row.type_label||""].join(" ");
  if (type === "taxtopic") return [row.summary, (row.key_points||[]).join(" ")].join(" ");
  return "";
};
const SYN = {
  wacc:["weighted average cost of capital"], npv:["net present value"],
  irr:["internal rate of return"], bcg:["boston"], swot:[], pestel:["pestle"],
  capm:[], ethics:["ethical"], sustainability:["esg","sustainable"],
  budgeting:["budget"], debtors:["receivables"], creditors:["payables"],
  fx:["foreign exchange","currency"], hedging:["hedge"],
  application:["apply","applied"], evaluation:["evaluate","evaluated"],
  analysis:["analyse","analyze"],
  tax:["taxation"], ito:["income tax ordinance"], sta:["sales tax act"],
  wht:["withholding tax"], fbr:["federal board of revenue"],
};

/* inverted index */
const INDEX = new Map(), DOCS = new Map();
const tok = s => (String(s||"").toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)||[]);
function buildIndex(){
  for (const [type] of Object.entries(TYPES)) {
    const table = TYPES[type].table;
    for (const row of DB[table] || []) {
      const key = type+":"+row.id;
      const text = titleOf(type,row)+" "+bodyOf(type,row);
      DOCS.set(key,{type,id:row.id,title:titleOf(type,row),text});
      for (const t of new Set(tok(text))) {
        if(!INDEX.has(t)) INDEX.set(t,new Set());
        INDEX.get(t).add(key);
      }
    }
  }
}
function docsForTerm(t){
  const s = new Set(INDEX.get(t)||[]);
  for(const e of (SYN[t]||[])){
    const et = tok(e);
    if(et.length<=1){ for(const k of (INDEX.get(et[0])||[])) s.add(k); }
    else { const phrase = et.join(" ");
      for(const [k,d] of DOCS) if(d.text.toLowerCase().includes(phrase)) s.add(k); }
  }
  return s;
}
function searchDocs(q, typeFilter, limit){
  const terms = tok(q);
  if(!terms.length) return [];
  const expanded = new Set(terms);
  for (const t of terms){ (SYN[t]||[]).forEach(s=>tok(s).forEach(x=>expanded.add(x))); }
  let cand = null;
  for (const t of terms){
    const s = docsForTerm(t);
    cand = cand===null ? new Set(s) : new Set([...cand].filter(x=>s.has(x)));
    if(!cand.size) break;
  }
  if(!cand || !cand.size){
    cand = new Set();
    for(const t of terms) for(const k of docsForTerm(t)) cand.add(k);
  }
  const scored = [...cand].map(k=>{
    const d = DOCS.get(k);
    if(typeFilter && d.type!==typeFilter) return null;
    const dt = new Set(tok(d.title));
    let score = 0;
    const dtext = d.text.toLowerCase();
    for(const t of expanded){ if(dtext.includes(t)) score+=1; if(dt.has(t)) score+=3; }
    return {d,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return scored.slice(0,limit||24);
}
const routeFor = (type,id) => type==="question" ? "#/q/"+id
  : type==="guide" ? "#/g/"+id
  : type==="taxquestion" ? "#/tax/questions/"+id
  : type==="taxobs" ? "#/tax/examiner"
  : type==="taxpractice" ? "#/tax/practice/"+id
  : type==="taxtopic" ? "#/tax/topic/"+id
  : "#/search?q="+encodeURIComponent(id);

/* ---------- small markdown renderer ---------- */
function md(src){
  const lines = String(src||"").split("\n"); let html="", inList=false, para=[];
  const flushP=()=>{ if(para.length){ html+="<p>"+para.join(" ")+"</p>"; para=[]; } };
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
    .replace(/`([^`]+)`/g,"<code>$1</code>");
  for(const ln of lines){
    if(/^#{1,4}\s/.test(ln)){ flushP(); if(inList){html+="</ul>";inList=false;}
      const lvl=ln.match(/^#+/)[0].length, t=ln.replace(/^#+\s*/,"");
      html+=`<h${Math.min(lvl+1,3)}>${inline(t)}</h${Math.min(lvl+1,3)}>`; continue; }
    if(/^\s*---\s*$/.test(ln)){ flushP(); if(inList){html+="</ul>";inList=false;} html+="<hr>"; continue; }
    const lm = ln.match(/^\s*([-*]|\d+\.)\s+(.*)/);
    if(lm){ flushP(); if(!inList){html+="<ul>";inList=true;} html+=`<li>${inline(lm[2])}</li>`; continue; }
    if(/^\s*$/.test(ln)){ flushP(); if(inList){html+="</ul>";inList=false;} continue; }
    para.push(inline(ln.trim()));
  }
  flushP(); if(inList)html+="</ul>";
  return html;
}

/* ---------- local progress store ---------- */
const LS = "biaWeb.v1";
let S = {attempted:{}, checks:{}, sm2:{}, mocks:{active:null, history:[]}};
try { const raw = localStorage.getItem(LS); if(raw) S = Object.assign(S, JSON.parse(raw)); } catch(e){}
if(!S.mocks || typeof S.mocks !== "object") S.mocks = {active:null, history:[]};
if(!Array.isArray(S.mocks.history)) S.mocks.history = [];
/* Taxation progress lives under S.tax so BIA keys are never touched. */
if(!S.tax || typeof S.tax !== "object") S.tax = {attempted:{}};
if(!S.tax.attempted || typeof S.tax.attempted !== "object") S.tax.attempted = {};
const save = () => { try{ localStorage.setItem(LS, JSON.stringify(S)); }catch(e){} };

/* SM-2 */
function sm2grade(cardId, quality){
  const c = S.sm2[cardId] || {ef:2.5, interval:0, reps:0, due:0};
  if(quality < 3){ c.reps = 0; c.interval = 1; }
  else {
    if(c.reps === 0) c.interval = 1;
    else if(c.reps === 1) c.interval = 6;
    else c.interval = Math.round(c.interval * c.ef);
    c.ef = Math.max(1.3, c.ef + (0.1 - (5-quality)*(0.08 + (5-quality)*0.02)));
    c.reps++;
  }
  c.due = Date.now() + c.interval*86400000;
  S.sm2[cardId] = c; save();
  return c;
}
const dueCards = () => (DB.cards||[]).filter(c => {
  const s = S.sm2[c.id]; return !s || s.due <= Date.now();
});

/* ---------- helpers ---------- */
const app = () => $("#app");
const areaOf = q => (q.topic_tags && q.topic_tags[0]) ? q.topic_tags[0][0] : "?";
const topicArea = t => (t||"").replace("CAF7-TOP-","").replace("KR","KR");
const AREA_NAME = {A:"Managerial Analysis", B:"Risk Management", C:"Financial Analysis", D:"Introduction to Sustainability", KR:"Knowledge References"};
const badge = (cls, txt) => `<span class="badge ${cls}">${esc(txt)}</span>`;
const qBadges = q => [
  badge("b-type", q.type==="MCQ" ? "MCQ" : "Constructed"),
  badge("b-id", (q.marks==null?"?":q.marks) + (q.marks===1?" mark":" marks")),
  q.predecessor ? badge("b-pred","CAF-6 MFA") : badge("b-auth","CAF-7 BIA"),
  `<span class="badge b-diff" title="${esc(q.difficulty_basis)}">${esc(q.difficulty)} · est.</span>`,
].join("");
const obsById = id => (DB.observations||[]).find(o=>o.id===id);
const qById = id => (DB.questions||[]).find(q=>q.id===id);

function setNav(key){
  $$(".site-nav a").forEach(a=>{
    if(a.dataset.nav===key) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
}

/* ---------- views: home ---------- */
function vHome(){
  setNav("home");
  const nQ = (DB.questions||[]).filter(q=>!q.excluded).length;
  const nO = (DB.observations||[]).length;
  const nC = (DB.cards||[]).length;
  const nG = (DB.mistake_guides||[]).length;
  const due = dueCards().length;
  const attempted = Object.keys(S.attempted||{}).length;
  const byArea = {};
  for(const q of DB.questions||[]){ if(q.excluded||S.attempted[q.id]) continue;
    const a = areaOf(q); byArea[a]=(byArea[a]||0)+1; }
  const weakest = Object.entries(byArea).sort((a,b)=>b[1]-a[1])[0];
  const next = [];
  if(due) next.push(`<li><strong>${due} flashcard${due===1?"":"s"}</strong> due for review — <a href="#/revision/cards">open the deck</a>.</li>`);
  if(weakest) next.push(`<li>Most unattempted questions are in <strong>Area ${esc(weakest[0])} — ${esc(AREA_NAME[weakest[0]]||"")}</strong> (${weakest[1]} waiting) — <a href="#/questions?area=${esc(weakest[0])}">practise them</a>.</li>`);
  if(!attempted && !due) next.push(`<li>Start with the <a href="#/syllabus">syllabus browser</a>, then try <a href="#/questions?type=MCQ">MCQ drills</a>.</li>`);
  if(!next.length) next.push(`<li>Everything attempted and no cards due — pick a <a href="#/questions">weak spot to re-drill</a>.</li>`);
  app().innerHTML = `
  <div class="hero">
    <p class="eyebrow">ICAP CAF-7 · Business Insights and Analysis</p>
    <h1>Study <em>smarter</em> for BIA.</h1>
    <p class="lede">245 past-paper questions, 221 examiner observations and a full revision system —
    every question mapped to the current syllabus, every claim traceable to its source.</p>
    <form class="hero-search" id="heroForm" role="search">
      <input id="hq" type="search" placeholder="Search questions, examiner notes, flashcards…" aria-label="Search the knowledge base" autocomplete="off">
      <button type="submit">Search</button>
    </form>
    <div class="chips" role="group" aria-label="Example searches">
      ${["WACC","BCG matrix","sustainability","value chain","capital rationing","examiner: application"].map(c=>
        `<button type="button" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}
    </div>
  </div>
  <div class="stats" role="list">
    <a class="stat" role="listitem" href="#/questions"><b>${nQ}</b><span>past-paper questions</span></a>
    <a class="stat" role="listitem" href="#/examiner"><b>${nO}</b><span>examiner observations</span></a>
    <a class="stat" role="listitem" href="#/revision/cards"><b>${nC}</b><span>flashcards</span></a>
    <a class="stat" role="listitem" href="#/examiner"><b>${nG}</b><span>mistake guides</span></a>
  </div>
  <div class="nextup" aria-label="What to study next">
    <h2>What to study next</h2>
    <ul>${next.join("")}</ul>
  </div>
  <div class="notice"><strong>Studying CAF-2 as well?</strong>
  <a href="#/tax">Taxation: Principles and Compliance</a> — 9 topics, paraphrased question summaries,
  a legislation browser and generated practice questions. All tax content is paraphrase-only.</div>
  <div class="notice"><strong>Predecessor note:</strong> questions before 2025 come from
  <strong>CAF-6 Managerial and Financial Analysis</strong>, the renamed predecessor of CAF-7 BIA —
  each one mapped to current-syllabus topics; removed topics are excluded from practice.</div>
  <div class="trust">
    <h2>How to trust this site</h2>
    <p>Every item is labeled by origin. Question wording is verbatim from the official papers;
    examiner notes and study content are paraphrased summaries; the desktop app holds the full local archive.</p>
    <div class="legend">
      <span class="badge b-auth">● CAF-7 BIA — current syllabus</span>
      <span class="badge b-pred">● CAF-6 MFA — predecessor, mapped</span>
      <span class="badge b-diff">● difficulty · est. — heuristic, not validated</span>
      <span class="badge b-review">● own teaching — project explanations</span>
    </div>
  </div>`;
  document.title = "BIA Intelligence — CAF-7 Business Insights and Analysis";
  $("#heroForm").addEventListener("submit", e=>{
    e.preventDefault();
    const q = $("#hq").value.trim();
    if(q) location.hash = "#/search?q="+encodeURIComponent(q);
  });
  $$("[data-chip]").forEach(b=>b.addEventListener("click",()=>{
    location.hash = "#/search?q="+encodeURIComponent(b.dataset.chip.replace(/^examiner: /,""));
  }));
}

/* ---------- views: syllabus ---------- */
function summaryCard(topicId){
  const s = (DB.topic_summaries||[]).find(x=>x.topic_id===topicId);
  if(!s) return "";
  return `<section class="sumcard" aria-label="Topic summary">
    <h2>Topic summary</h2>
    <p>${esc(s.summary)}</p>
    <h3>Key points</h3>
    <ul>${(s.key_points||[]).map(k=>`<li>${esc(k)}</li>`).join("")}</ul>
    <p class="sumhow"><strong>How it&rsquo;s examined:</strong> ${esc(s.how_examined)}</p>
    <p class="sumsrc"><span class="badge b-review">&#9679; own teaching</span></p>
  </section>`;
}
function vSyllabus(){
  setNav("syllabus");
  const areas = (DB.syllabus&&DB.syllabus.areas)||[];
  const removed = (DB.syllabus&&DB.syllabus.removed_2021)||[];
  app().innerHTML = `
  <h2 class="page-title">Syllabus</h2>
  <p class="page-sub">The 2025 CAF-7 grid — four learning areas. Flags show what changed
  versus the 2021 predecessor (CAF-6 MFA).</p>
  <div class="card-grid">
    ${areas.map(a=>{
      const nNew = a.los.filter(l=>l.flag==="new").length;
      return `<a class="card" href="#/syllabus/${a.id}">
        <span class="k">Area ${esc(a.id)} · ${esc(a.weight)}% weight</span>
        <h3>${esc(a.name)}</h3>
        <p>${a.los.length} learning outcomes · ${esc(a.hours)} teaching hours${nNew?` · <strong>${nNew} new</strong>`:""}</p>
        <span class="count">${a.los.length} LOs</span></a>`;
    }).join("")}
  </div>
  <div class="section-head"><h2>Removed from the 2021 syllabus</h2><p>pre-2025 questions on these are excluded from practice</p></div>
  <ul class="about-list">
    ${removed.map(r=>`<li><strong>${esc(r.ref)}</strong> — ${esc(r.title)}</li>`).join("")}
  </ul>
  <div class="notice">${esc((DB.syllabus&&DB.syllabus.note)||"")}</div>`;
  document.title = "Syllabus — BIA Intelligence";
}
function vArea(id){
  setNav("syllabus");
  const a = ((DB.syllabus&&DB.syllabus.areas)||[]).find(x=>x.id===id);
  if(!a){ location.hash="#/syllabus"; return; }
  const flagBadge = f => f==="new" ? `<span class="badge b-new">● new in 2025</span>` : `<span class="badge b-auth">● kept</span>`;
  const qs = (DB.questions||[]).filter(q=>!q.excluded && areaOf(q)===id);
  app().innerHTML = `
  <p class="crumb"><a href="#/syllabus">Syllabus</a> › Area ${esc(a.id)}</p>
  <div class="record-head">
    <span class="badge b-type">Area ${esc(a.id)}</span>
    <h1>${esc(a.name)}</h1>
    <p class="page-sub">Weightage ${esc(a.weight)}% · ${esc(a.hours)} teaching hours · ${qs.length} practice questions</p>
  </div>
  ${summaryCard("CAF7-TOP-"+a.id)}
  <div class="section-head"><h2>Learning outcomes</h2></div>
  <ul class="results">
    ${a.los.map(l=>`<li class="result">
      <div class="meta">${flagBadge(l.flag)}<span class="badge b-id">${esc(l.ref)}</span></div>
      <p style="margin:8px 0 0"><strong>${esc(l.title)}</strong></p>
      ${l.note?`<p class="snip">${esc(l.note)}</p>`:""}
    </li>`).join("")}
  </ul>
  <div class="actions">
    <a class="btn btn-primary" href="#/questions?area=${esc(a.id)}">Practise Area ${esc(a.id)} questions</a>
    <a class="btn btn-ghost" href="#/revision?topic=CAF7-TOP-${esc(a.id)}">Revise Area ${esc(a.id)}</a>
  </div>`;
  document.title = `Area ${esc(a.id)} — ${esc(a.name)} — BIA Intelligence`;
}

/* ---------- views: questions ---------- */
const MARKS_BANDS = [["1","1 mark"],["2-4","2–4 marks"],["5-9","5–9 marks"],["10+","10+ marks"]];
function bandOf(m){ if(m==null) return "?"; if(m<=1) return "1"; if(m<=4) return "2-4"; if(m<=9) return "5-9"; return "10+"; }
function vQuestions(params){
  setNav("questions");
  const sessions = [...new Set((DB.questions||[]).map(q=>q.session))].sort((a,b)=>((DB.questions.find(q=>q.session===a)||{}).session_order||0)-((DB.questions.find(q=>q.session===b)||{}).session_order||0));
  const f = {
    session: params.get("session")||"",
    area: params.get("area")||"",
    type: params.get("type")||"",
    band: params.get("band")||"",
    showEx: params.get("showEx")==="1",
    att: params.get("att")||"",
  };
  const list = (DB.questions||[]).filter(q=>{
    if(q.excluded && !f.showEx) return false;
    if(f.session && q.session!==f.session) return false;
    if(f.area && areaOf(q)!==f.area) return false;
    if(f.type && q.type!==f.type) return false;
    if(f.band && bandOf(q.marks)!==f.band) return false;
    if(f.att==="done" && !S.attempted[q.id]) return false;
    if(f.att==="todo" && S.attempted[q.id]) return false;
    return true;
  }).sort((a,b)=>(a.session_order-b.session_order)||String(a.number).localeCompare(String(b.number)));
  const opt = (v,t,sel)=>`<option value="${esc(v)}"${v===sel?" selected":""}>${esc(t)}</option>`;
  app().innerHTML = `
  <h2 class="page-title">Question bank</h2>
  <p class="page-sub">${list.length} questions · official wording on each question page.</p>
  <form class="filters" id="qf" aria-label="Filter questions">
    <label>Session <select class="fselect" name="session">${opt("","All sessions")}${sessions.map(s=>opt(s,s)).join("")}</select></label>
    <label>Area <select class="fselect" name="area">${opt("","All areas")}${["A","B","C","D"].map(a=>opt(a,"Area "+a)).join("")}</select></label>
    <label>Type <select class="fselect" name="type">${opt("","All types")}${opt("MCQ","MCQ")}${opt("constructed","Constructed")}</select></label>
    <label>Marks <select class="fselect" name="band">${opt("","Any marks")}${MARKS_BANDS.map(b=>opt(b[0],b[1])).join("")}</select></label>
    <label>Progress <select class="fselect" name="att">${opt("","All")}${opt("todo","Not attempted")}${opt("done","Attempted")}</select></label>
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="showEx" value="1"${f.showEx?" checked":""}> Show removed-topic questions</label>
  </form>
  <p role="status" aria-live="polite" class="src">${list.length} question${list.length===1?"":"s"} match</p>
  <ul class="results" id="qGrid">
    ${list.map(q=>`<li class="result">
      <a class="rt" href="#/q/${esc(q.id)}">Q${esc(q.number)} — ${esc(q.session)}</a>
      <p class="snip">${esc(q.summary||"")}</p>
      <div class="meta">${qBadges(q)}${S.attempted[q.id]?`<span class="badge b-review">✓ attempted</span>`:""}${q.excluded?`<span class="badge b-sugg">excluded: removed topic</span>`:""}</div>
    </li>`).join("") || `<li class="noresults"><h2>No questions match</h2><p>Loosen a filter.</p></li>`}
  </ul>`;
  document.title = "Question bank — BIA Intelligence";
  $("#qf").addEventListener("change", ()=>{
    const fd = new FormData($("#qf"));
    const p = new URLSearchParams();
    for(const [k,v] of fd.entries()) if(v) p.set(k,v);
    if(!fd.get("showEx")) p.delete("showEx");
    location.hash = "#/questions" + (p.toString() ? "?"+p.toString() : "");
  });
}
function vQuestion(id){
  setNav("questions");
  const q = qById(id);
  if(!q){ location.hash="#/questions"; return; }
  const traps = (q.trap_briefing||[]).map(obsById).filter(Boolean);
  const done = S.checks[id]||[];
  const related = (DB.questions||[]).filter(x=>x.id!==id && !x.excluded && areaOf(x)===areaOf(q)).slice(0,6);
  app().innerHTML = `
  <p class="crumb"><a href="#/questions">Questions</a> › ${esc(q.id)}</p>
  <div class="record-head">
    <div class="badges">${qBadges(q)}${q.excluded?`<span class="badge b-sugg">excluded: ${esc(q.exclusion_reason||"removed topic")}</span>`:""}</div>
    <h1>Q${esc(q.number)} — ${esc(q.session)}</h1>
    <p class="page-sub">${esc(q.summary||"")}</p>
  </div>
  <div class="meta-table"><dl>
    <dt>Session</dt><dd>${esc(q.session)}${q.predecessor?' <span class="badge b-pred">CAF-6 MFA predecessor</span>':""}</dd>
    <dt>Source ref</dt><dd>${esc(q.source)}</dd>
    <dt>Command words</dt><dd>${(q.command_words||[]).map(esc).join(", ")||"—"}</dd>
    <dt>Topics</dt><dd>${(q.topic_tags||[]).map(esc).join(", ")||"—"}</dd>
    <dt>Difficulty</dt><dd>${esc(q.difficulty)} <span class="src">(estimate — ${esc(q.difficulty_basis)})</span></dd>
  </dl></div>
  ${q.verbatim?`<div class="section-head"><h2>Official question wording</h2><p><span class="badge b-auth">● verbatim — ICAP past paper</span></p></div>
  <div class="prose verbatim">${md(q.verbatim)}</div>`:""}
  ${traps.length?`<div class="section-head"><h2>⚠️ Trap briefing</h2><p>what examiners saw go wrong on related questions</p></div>
  <ul class="results">${traps.map(o=>`<li class="result">
    <p class="snip" style="margin-top:0">${esc(o.observation)}</p>
    <div class="meta"><span class="src">${esc(o.source)}</span><span class="badge b-sugg">${esc(o.category)}</span></div>
  </li>`).join("")}</ul>`:""}
  <div class="section-head"><h2>Self-marking checklist</h2><p>tick as you verify against the suggested answer</p></div>
  <ul class="checklist" id="ckl">
    ${(q.checklist||[]).map((c,i)=>`<li class="${done[i]?"done":""}"><input type="checkbox" data-i="${i}"${done[i]?" checked":""} aria-label="${esc(c)}"><span>${esc(c)}</span></li>`).join("")}
  </ul>
  <div class="actions">
    <button class="btn ${S.attempted[id]?"btn-ghost":"btn-primary"}" id="attBtn">${S.attempted[id]?"✓ Attempted — undo":"Mark as attempted"}</button>
    <a class="btn btn-ghost" href="#/questions?area=${esc(areaOf(q))}">More Area ${esc(areaOf(q))}</a>
  </div>
  ${related.length?`<div class="section-head"><h2>Related questions</h2></div>
  <div class="card-grid">${related.map(r=>`<a class="card" href="#/q/${esc(r.id)}"><span class="k">Q${esc(r.number)} · ${esc(r.session)}</span><h3>${esc((r.summary||"").slice(0,80))}…</h3><span class="count">${r.marks==null?"?":r.marks} marks</span></a>`).join("")}</div>`:""}
  <div class="notice"><strong>Data note:</strong> the question wording above is verbatim from the official paper.
  Trap briefings and examiner notes are paraphrased. Attempt the question first, then check yourself
  against the official suggested answer in your own materials.</div>`;
  document.title = `Q${q.number} ${q.session} — BIA Intelligence`;
  $$("#ckl input").forEach(cb=>cb.addEventListener("change",()=>{
    const d = S.checks[id]||[];
    d[+cb.dataset.i] = cb.checked;
    S.checks[id]=d; save();
    cb.closest("li").classList.toggle("done", cb.checked);
  }));
  $("#attBtn").addEventListener("click",()=>{
    if(S.attempted[id]) delete S.attempted[id]; else S.attempted[id]=Date.now();
    save(); vQuestion(id);
  });
}

/* ---------- views: examiner ---------- */
function vExaminer(params){
  setNav("examiner");
  const q = params.get("q")||"";
  const cat = params.get("cat")||"";
  const guides = DB.mistake_guides||[];
  const cats = [...new Set((DB.observations||[]).map(o=>o.category).filter(Boolean))];
  let results = [];
  if(q){
    results = searchDocs(q, "observation", 30).map(r=>r.d);
    if(cat) results = results.filter(o=>o.category===cat);
  }
  app().innerHTML = `
  <h2 class="page-title">Examiner intelligence</h2>
  <p class="page-sub">${(DB.observations||[]).length} examiner observations plus ${guides.length} mistake-prevention guides.</p>
  <form class="searchbar" id="exForm" role="search" style="position:static;border:0;padding:0">
    <div class="row"><input id="q" type="search" value="${esc(q)}" placeholder="Search examiner observations…" aria-label="Search examiner observations"></div>
    <div class="fchips" role="group" aria-label="Filter by category">
      ${["",...cats].map(c=>`<button type="button" data-cat="${esc(c)}" aria-pressed="${c===cat}">${c||"all"}</button>`).join("")}
    </div>
  </form>
  ${q?`<p role="status" aria-live="polite" class="src">${results.length} observations match</p>
  <ul class="results">
    ${results.map(o=>`<li class="result">
      <p class="snip" style="margin-top:0">${esc(o.observation)}</p>
      ${o.what_went_wrong?`<p class="snip"><strong>Went wrong:</strong> ${esc(o.what_went_wrong)}</p>`:""}
      ${o.stronger_answer?`<p class="snip"><strong>Stronger answer:</strong> ${esc(o.stronger_answer)}</p>`:""}
      <div class="meta"><span class="src">${esc(o.source)}</span><span class="badge b-sugg">${esc(o.category||"")}</span></div>
    </li>`).join("") || `<li class="noresults"><h2>No observations match</h2></li>`}
  </ul>`:""}
  <div class="section-head"><h2>Mistake-prevention guides</h2><p>each built from examiner evidence</p></div>
  <div class="card-grid">
    ${guides.map(g=>`<a class="card" href="#/g/${esc(g.id)}"><span class="k">${esc(g.category||"mistake")}</span><h3>${esc(g.title)}</h3><p>${esc((g.description||"").slice(0,140))}…</p></a>`).join("")}
  </div>`;
  document.title = "Examiner intelligence — BIA Intelligence";
  const go = ()=>{ const v=$("#q").value.trim();
    location.hash = "#/examiner"+(v||cat ? "?"+new URLSearchParams(Object.assign({}, v?{q:v}:{}, cat?{cat}:{})).toString() : ""); };
  $("#exForm").addEventListener("submit",e=>{e.preventDefault();go();});
  let t; $("#q").addEventListener("input",()=>{clearTimeout(t);t=setTimeout(go,700);});
  $$("#exForm [data-cat]").forEach(b=>b.addEventListener("click",()=>{
    const c=b.dataset.cat, v=$("#q").value.trim();
    location.hash="#/examiner"+(v||c?"?"+new URLSearchParams(Object.assign({},v?{q:v}:{},c?{cat:c}:{})).toString():"");
  }));
}
function vGuide(id){
  setNav("examiner");
  const g = (DB.mistake_guides||[]).find(x=>x.id===id);
  if(!g){ location.hash="#/examiner"; return; }
  app().innerHTML = `
  <p class="crumb"><a href="#/examiner">Examiner</a> › Mistake guide</p>
  <div class="record-head">
    <div class="badges"><span class="badge b-type">Mistake guide</span><span class="badge b-sugg">${esc(g.category||"")}</span><span class="badge b-review">● own teaching</span></div>
    <h1>${esc(g.title)}</h1>
  </div>
  <div class="prose">
    <h2>What the mistake is</h2><p>${esc(g.description||"")}</p>
    <h2>Why candidates make it</h2><p>${esc(g.why||"")}</p>
    <h2>How it damages an answer</h2><p>${esc(g.damage||"")}</p>
    <h2>Weak vs strong</h2>
    <p><strong>Weak:</strong> ${esc(g.weak||"")}</p>
    <p><strong>Strong:</strong> ${esc(g.strong||"")}</p>
    <h2>Prevention checklist</h2>
    <ul>${(g.checklist||[]).map(c=>`<li>${esc(c)}</li>`).join("")}</ul>
    ${g.practice?`<h2>Practise it</h2><p>${esc(g.practice)}</p>`:""}
  </div>
  <div class="actions"><a class="btn btn-ghost" href="#/examiner">Back to examiner intelligence</a></div>`;
  document.title = g.title+" — BIA Intelligence";
}

/* ---------- views: revision ---------- */
const DEPTHS = [["quick","Quick revision"],["detailed","Detailed revision"],["mastery","Exam mastery"]];
function vRevision(params){
  setNav("revision");
  const topics = ["CAF7-TOP-A","CAF7-TOP-B","CAF7-TOP-C","CAF7-TOP-D","CAF7-TOP-KR"];
  const topic = params.get("topic")||"CAF7-TOP-A";
  const depth = params.get("depth")||"quick";
  const note = (DB.topic_notes||[]).find(n=>n.topic===topic && n.depth===depth);
  const due = dueCards().length;
  app().innerHTML = `
  <h2 class="page-title">Revision</h2>
  <p class="page-sub">Topic notes at three depths plus ${due} flashcards due — <a href="#/revision/cards">open the deck</a>.</p>
  ${summaryCard(topic)}
  <div class="deck-tools" role="group" aria-label="Choose topic">
    <label>Topic <select class="fselect" id="revTopic">${topics.map(t=>`<option value="${t}"${t===topic?" selected":""}>${esc(AREA_NAME[topicArea(t)]||t)}</option>`).join("")}</select></label>
  </div>
  <div class="dtabs" role="group" aria-label="Revision depth">
    ${DEPTHS.map(d=>`<button data-depth="${d[0]}" aria-pressed="${d[0]===depth}">${d[1]}</button>`).join("")}
  </div>
  ${note?`<div class="prose">
    <h2>${esc(note.title)}</h2>
    ${note.overview?`<p>${esc(note.overview)}</p>`:""}
    ${note.key_concepts?`<h2>Key concepts</h2>${md(note.key_concepts)}`:""}
    ${note.frameworks?`<h2>Frameworks</h2>${md(note.frameworks)}`:""}
    ${note.methods?`<h2>Methods</h2>${md(note.methods)}`:""}
    ${note.examples?`<h2>Examples</h2>${md(note.examples)}`:""}
    ${note.misconceptions?`<h2>Common misconceptions</h2>${md(note.misconceptions)}`:""}
    ${note.examiner_expectations?`<h2>Examiner expectations</h2>${md(note.examiner_expectations)}`:""}
    ${note.quick_notes?`<h2>Quick notes</h2>${md(note.quick_notes)}`:""}
  </div>
  <div class="actions">
    <a class="btn btn-primary" href="#/revision/cards?topic=${esc(topic)}">Drill ${esc(AREA_NAME[topicArea(topic)]||"")} flashcards</a>
    <a class="btn btn-ghost" href="#/questions?area=${esc(topicArea(topic))}">Practise questions</a>
  </div>`:`<div class="notice">No notes for this combination yet.</div>`}`;
  document.title = "Revision — BIA Intelligence";
  $("#revTopic").addEventListener("change",e=>{ location.hash = `#/revision?topic=${e.target.value}&depth=${depth}`; });
  $$(".dtabs button").forEach(b=>b.addEventListener("click",()=>{ location.hash = `#/revision?topic=${topic}&depth=${b.dataset.depth}`; }));
}
function vCards(params){
  setNav("revision");
  const topic = params.get("topic")||"";
  const deck = (DB.cards||[])
    .filter(c=>!topic || c.topic===topic)
    .sort((a,b)=>{ const da=(S.sm2[a.id]||{due:0}).due, db=(S.sm2[b.id]||{due:0}).due; return da-db; });
  const dueN = deck.filter(c=>{const s=S.sm2[c.id];return !s||s.due<=Date.now();}).length;
  app().innerHTML = `
  <p class="crumb"><a href="#/revision">Revision</a> › Flashcards</p>
  <h2 class="page-title">Flashcards</h2>
  <p class="page-sub">Spaced repetition (SM-2). Progress is saved on this device.</p>
  <div class="deck-tools" role="group" aria-label="Filter deck">
    <label>Topic <select class="fselect" id="deckTopic">
      <option value="">All topics</option>
      ${["CAF7-TOP-A","CAF7-TOP-B","CAF7-TOP-C","CAF7-TOP-D","CAF7-TOP-KR"].map(t=>`<option value="${t}"${t===topic?" selected":""}>${esc(AREA_NAME[topicArea(t)]||t)}</option>`).join("")}
    </select></label>
    <button class="btn btn-ghost" id="deckReset" style="padding:8px 16px">Reset deck progress</button>
  </div>
  <p class="deck-progress" role="status" aria-live="polite" id="deckStatus">${dueN} of ${deck.length} due</p>
  <div id="deckHost"></div>`;
  document.title = "Flashcards — BIA Intelligence";
  $("#deckTopic").addEventListener("change",e=>{ location.hash = "#/revision/cards"+(e.target.value?`?topic=${e.target.value}`:""); });
  $("#deckReset").addEventListener("click",()=>{
    for(const c of DB.cards||[]) delete S.sm2[c.id];
    save(); vCards(params);
  });
  let i = 0;
  // start at first due card
  i = Math.max(0, deck.findIndex(c=>{const s=S.sm2[c.id];return !s||s.due<=Date.now();}));
  const host = $("#deckHost");
  function render(){
    const c = deck[i];
    if(!c){ host.innerHTML = `<div class="notice">Deck complete — nothing due. Come back later or reset progress.</div>`; return; }
    host.innerHTML = `
    <div class="fcard" id="fcard" role="button" tabindex="0" aria-label="Flashcard: tap to flip">
      <div class="fkind">${esc(c.kind||"card")} · ${esc(AREA_NAME[topicArea(c.topic)]||"")}</div>
      <div class="fbody ffront">${esc(c.front)}</div>
      <div class="fbody fback">${esc(c.back)}</div>
      <div class="fhint">tap to flip</div>
    </div>
    <div class="grade-row" id="grades" hidden>
      <button data-q="0">Again</button><button data-q="3">Hard</button><button data-q="4">Good</button><button data-q="5">Easy</button>
    </div>
    <p class="deck-progress">card ${i+1} of ${deck.length}</p>`;
    const card = $("#fcard");
    const flip = ()=>{ card.classList.add("flipped"); $("#grades").hidden=false; };
    card.addEventListener("click",flip);
    card.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();flip();} });
    $$("#grades button").forEach(b=>b.addEventListener("click",()=>{
      sm2grade(c.id, +b.dataset.q);
      i = (i+1) % deck.length;
      const due2 = deck.filter(x=>{const s=S.sm2[x.id];return !s||s.due<=Date.now();}).length;
      $("#deckStatus").textContent = `${due2} of ${deck.length} due`;
      render();
    }));
  }
  render();
}

/* ---------- views: about ---------- */
function vAbout(){
  setNav("about");
  app().innerHTML = `
  <h2 class="page-title">About this companion</h2>
  <p class="page-sub">What it is, how to trust it, and where its limits are.</p>
  <div class="prose">
  <h2>What it is</h2>
  <p>A personal study companion for ICAP CAF-7 <strong>Business Insights and Analysis</strong>, built from
  the official syllabus, two BIA exam sessions, seven predecessor sessions (CAF-6 Managerial and Financial
  Analysis), the model paper, and examiner commentary — every past question mapped to current-syllabus topics.</p>
  <h2>How verification works</h2>
  <ul class="about-list">
    <li><span class="badge b-auth">● CAF-7 BIA</span> — from the current Scheme 2025 syllabus and papers.</li>
    <li><span class="badge b-pred">● CAF-6 MFA</span> — predecessor questions, mapped via a documented syllabus delta; removed topics excluded.</li>
    <li><span class="badge b-diff">● difficulty · est.</span> — heuristic from marks and type; not statistically validated.</li>
    <li><span class="badge b-review">● own teaching</span> — revision notes, checklists and trap briefings written for this project.</li>
  </ul>
  <h2>Known limitations</h2>
  <ul class="about-list">
    <li><strong>Data policy.</strong> Question wording is verbatim from the official papers (past papers are public on ICAP's own site). Suggested answers, examiner comments and study text are paraphrased only — they sit behind ICAP's student login and are never published verbatim here.</li>
    <li><strong>Only two sessions under the BIA name.</strong> Trend patterns lean on predecessor papers through the delta mapping; treat them as indicative, never as predictions.</li>
    <li><strong>Generated practice questions</strong> are the project's own — clearly labeled, never presented as past papers.</li>
    <li><strong>Difficulty ratings are estimates</strong>, refined only by your own attempt data in the desktop app.</li>
    <li><strong>The desktop Streamlit app</strong> adds the deterministic answer-evaluation engine, performance analytics and the study planner — this site is the portable companion.</li>
  </ul>
  <div class="notice"><strong>Student-level framing:</strong> this companion explains and connects; it never poses as a
  qualified accountant's judgement or a substitute for the official ICAP study text.</div>
  </div>`;
  document.title = "About — BIA Intelligence";
}

/* ---------- views: search ---------- */
function vSearch(q0){
  setNav("");
  const q = q0||"";
  const results = q ? searchDocs(q, "", 30) : [];
  app().innerHTML = `
  <h2 class="page-title">Search</h2>
  <form class="searchbar" id="sForm" role="search" style="position:static;border:0;padding:0">
    <div class="row"><input id="q" type="search" value="${esc(q)}" placeholder="Search questions, examiner notes, flashcards, guides…" aria-label="Search everything"></div>
  </form>
  ${q?`<p role="status" aria-live="polite" class="src">${results.length} results for “${esc(q)}”</p>
  <ul class="results">
    ${results.map(r=>`<li class="result">
      <a class="rt" href="${routeFor(r.d.type,r.d.id)}">${esc(r.d.title)}</a>
      <p class="snip">${esc(r.d.text.slice(0,180))}…</p>
      <div class="meta"><span class="badge b-type">${esc(TYPES[r.d.type].label)}</span></div>
    </li>`).join("") || `<li class="noresults"><h2>No results</h2><p>Try fewer or different words.</p></li>`}
  </ul>`:`<div class="notice">Type above to search across questions, examiner notes, flashcards, guides and revision notes.</div>`}`;
  document.title = (q?`“${q}” — `:"")+"Search — BIA Intelligence";
  const go = ()=>{ const v=$("#q").value.trim(); if(v) location.hash = "#/search?q="+encodeURIComponent(v); };
  $("#sForm").addEventListener("submit",e=>{e.preventDefault();go();});
  let t; $("#q").addEventListener("input",()=>{clearTimeout(t);t=setTimeout(()=>{const v=$("#q").value.trim();if(v&&v!==q)location.hash="#/search?q="+encodeURIComponent(v);},700);});
}

/* ---------- views: mocks ---------- */
const MOCK_DEFAULT_MIN = 195; // 3h15 incl. reading time, like the real exam
let mockTimer = null, mockIdx = 0;
function clearMockTimer(){ if(mockTimer){ clearInterval(mockTimer); mockTimer = null; } }

function mockSessions(){
  const seen = {};
  for(const q of DB.questions||[]){
    if(q.excluded || !q.session_order || q.session_order > 9) continue;
    if(!seen[q.session]) seen[q.session] = {session:q.session, order:q.session_order, scheme:q.scheme, ids:[], marks:0};
    seen[q.session].ids.push(q.id);
    if(typeof q.marks === "number") seen[q.session].marks += q.marks;
  }
  return Object.values(seen).sort((a,b)=>a.order-b.order);
}
function mockQuestions(session){
  return (DB.questions||[])
    .filter(q=>q.session===session && !q.excluded)
    .sort((a,b)=>{
      const na=parseInt(a.qnum,10), nb=parseInt(b.qnum,10);
      if(na!==nb) return (isNaN(na)?99:na)-(isNaN(nb)?99:nb);
      return String(a.number).localeCompare(String(b.number));
    });
}
function vMocks(){
  setNav("mocks");
  const sessions = mockSessions();
  const hist = (S.mocks&&S.mocks.history)||[];
  const active = S.mocks&&S.mocks.active;
  app().innerHTML = `
  <h2 class="page-title">Mock exams</h2>
  <p class="page-sub">Full past papers under exam conditions — ${MOCK_DEFAULT_MIN} minutes (3h15 including reading time), like the real paper. Answers autosave on this device.</p>
  ${active?`<div class="notice"><strong>Mock in progress:</strong> ${esc(active.session)} — <a href="#/mocks/run">resume</a> · <button class="btn btn-ghost" id="mockAbandon" style="padding:6px 12px">abandon</button></div>`:""}
  <div class="card-grid">
    ${sessions.map(s=>`
    <div class="card">
      <span class="k">${esc(s.session)} · ${esc(s.scheme)}</span>
      <h3>${s.ids.length} questions · ${s.marks} marks</h3>
      <p>Sections A and B, in paper order.</p>
      <div class="actions" style="margin-top:12px"><a class="btn btn-primary" href="#/mocks/${encodeURIComponent(s.session)}/setup">Start mock</a></div>
    </div>`).join("")}
  </div>
  ${hist.length?`<div class="section-head"><h2>Past mocks</h2><p>self-scored against checklists</p></div>
  <ul class="results">${hist.slice().reverse().map(h=>`<li class="result">
    <p style="margin:0"><strong>${esc(h.session)}</strong> — ${esc(new Date(h.date).toLocaleDateString())} · ${h.durationMin} min · self-score <strong>${h.total}/${h.maxTotal}</strong></p>
  </li>`).join("")}</ul>`:""}
  <div class="notice"><strong>Honest scoring:</strong> mocks are self-marked against checklists — not examiner marking. Use them for timing, stamina and technique.</div>`;
  document.title = "Mock exams — BIA Intelligence";
  const ab = $("#mockAbandon");
  if(ab) ab.addEventListener("click",()=>{ S.mocks.active=null; save(); vMocks(); });
}
function vMockSetup(sessEnc){
  setNav("mocks");
  const session = decodeURIComponent(sessEnc||"");
  const qs = mockQuestions(session);
  if(!qs.length){ location.hash="#/mocks"; return; }
  const marks = qs.reduce((t,q)=>t+(typeof q.marks==="number"?q.marks:0),0);
  app().innerHTML = `
  <p class="crumb"><a href="#/mocks">Mocks</a> › ${esc(session)}</p>
  <h2 class="page-title">${esc(session)} — mock setup</h2>
  <p class="page-sub">${qs.length} questions · ${marks} marks · Sections A and B in paper order.</p>
  <ul class="results">
    ${qs.map(q=>`<li class="result"><p style="margin:0"><strong>Q${esc(q.number)}</strong> — ${q.marks==null?"?":q.marks} marks <span class="badge b-type">Section ${esc(q.section||"?")}</span></p></li>`).join("")}
  </ul>
  <form id="mockForm" class="mock-setup">
    <label class="mock-alabel" for="mockDur">Duration (minutes)</label>
    <input type="number" id="mockDur" min="1" max="600" value="${MOCK_DEFAULT_MIN}" inputmode="numeric">
    <p class="src">The real exam is ${MOCK_DEFAULT_MIN} minutes (3h15 including reading time).</p>
    <button class="btn btn-primary" type="submit">Start the clock</button>
  </form>`;
  document.title = `Mock setup — ${session} — BIA Intelligence`;
  $("#mockForm").addEventListener("submit",e=>{
    e.preventDefault();
    const dur = Math.max(1, Math.min(600, +$("#mockDur").value || MOCK_DEFAULT_MIN));
    const now = Date.now();
    S.mocks = S.mocks || {active:null, history:[]};
    S.mocks.active = {id:"mock-"+now, session, durationMin:dur, startedAt:now,
                      endsAt:now+dur*60000, order:qs.map(q=>q.id), answers:{}, warned:{}};
    save();
    location.hash = "#/mocks/run";
  });
}
function vMockRun(){
  setNav("mocks");
  const m = S.mocks && S.mocks.active;
  if(!m){ location.hash="#/mocks"; return; }
  const qs = m.order.map(qById).filter(Boolean);
  if(!qs.length){ location.hash="#/mocks"; return; }
  mockIdx = 0;
  app().innerHTML = `
  <div class="mockbar" role="region" aria-label="Mock exam controls">
    <div class="mock-timer"><span id="mockClock" aria-hidden="true">--:--</span><span class="src">${esc(m.session)}</span></div>
    <div class="mock-nav" role="group" aria-label="Question navigator" id="mockNav"></div>
    <button class="btn btn-primary" id="mockFinish">Finish &amp; review</button>
  </div>
  <p id="mockWarn" class="sr-only" aria-live="polite"></p>
  <div id="mockQ"></div>`;
  const renderNav = ()=>{
    $("#mockNav").innerHTML = qs.map((q,i)=>{
      const ans = (m.answers[q.id]||"").trim();
      return `<button data-jump="${i}" class="${i===mockIdx?"cur":""}" aria-label="Go to question ${esc(q.number)}${ans?" (answered)":""}">Q${esc(q.number)}${ans?'<i aria-hidden="true">●</i>':""}</button>`;
    }).join("");
    $$("#mockNav button").forEach(b=>b.addEventListener("click",()=>{ mockIdx=+b.dataset.jump; renderQ(); renderNav(); }));
  };
  const renderQ = ()=>{
    const q = qs[mockIdx];
    $("#mockQ").innerHTML = `
    <p class="crumb">Section ${esc(q.section||"?")} · Question ${mockIdx+1} of ${qs.length}</p>
    <div class="record-head">
      <div class="badges">${qBadges(q)}</div>
      <h1>Q${esc(q.number)}</h1>
    </div>
    ${q.verbatim?`<div class="prose verbatim">${md(q.verbatim)}</div>`:`<p class="page-sub">${esc(q.summary||"")}</p>`}
    <label class="mock-alabel" for="mockAnswer">Your answer</label>
    <textarea id="mockAnswer" rows="12" placeholder="Write your answer here — it saves automatically as you type.">${esc(m.answers[q.id]||"")}</textarea>
    <div class="actions">
      <button class="btn btn-ghost" id="mockPrev"${mockIdx===0?" disabled":""}>← Previous</button>
      <button class="btn btn-ghost" id="mockNext"${mockIdx===qs.length-1?" disabled":""}>Next →</button>
    </div>`;
    document.title = `Q${q.number} — mock ${m.session} — BIA Intelligence`;
    let deb = null;
    $("#mockAnswer").addEventListener("input",e=>{
      clearTimeout(deb);
      deb = setTimeout(()=>{ m.answers[q.id]=e.target.value; save(); renderNav(); },500);
    });
    $("#mockPrev").addEventListener("click",()=>{ if(mockIdx>0){ mockIdx--; renderQ(); renderNav(); window.scrollTo(0,0); } });
    $("#mockNext").addEventListener("click",()=>{ if(mockIdx<qs.length-1){ mockIdx++; renderQ(); renderNav(); window.scrollTo(0,0); } });
  };
  const fmt = ms => { ms=Math.max(0,ms); const s=Math.floor(ms/1000);
    return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };
  const tick = ()=>{
    const clock = $("#mockClock");
    if(!clock){ clearMockTimer(); return; }
    const rem = m.endsAt - Date.now();
    clock.textContent = fmt(rem);
    for(const t of [30,10,5]){
      if(rem <= t*60000 && rem > 0 && !(m.warned&&m.warned[t])){
        m.warned = m.warned||{}; m.warned[t] = true; save();
        $("#mockWarn").textContent = t+" minutes remaining.";
      }
    }
    if(rem <= 0){ $("#mockWarn").textContent = "Time is up — submitting your mock."; finishMock(); }
  };
  const finishMock = ()=>{ clearMockTimer(); location.hash = "#/mocks/review"; };
  renderNav(); renderQ(); tick();
  clearMockTimer();
  mockTimer = setInterval(tick,1000);
  $("#mockFinish").addEventListener("click",finishMock);
}
function vMockReview(){
  setNav("mocks");
  const m = S.mocks && S.mocks.active;
  if(!m){ location.hash="#/mocks"; return; }
  const qs = m.order.map(qById).filter(Boolean);
  const maxTotal = qs.reduce((t,q)=>t+(typeof q.marks==="number"?q.marks:0),0);
  let sec = "";
  app().innerHTML = `
  <p class="crumb"><a href="#/mocks">Mocks</a> › Review</p>
  <h2 class="page-title">${esc(m.session)} — self-marking review</h2>
  <p class="page-sub">Go through each answer with its checklist, then give yourself a mark. Be strict — examiners are.</p>
  <div class="notice"><strong>Honest scoring:</strong> this is self-marking against checklists, not examiner marking. Compare with the official suggested answer in your own materials.</div>
  <form id="reviewForm">
  ${qs.map(q=>{
    const h = q.section!==sec ? `<div class="section-head"><h2>Section ${esc(q.section||"?")}</h2></div>` : "";
    sec = q.section;
    return `${h}<section class="review-q" aria-label="Question ${esc(q.number)} review">
    <h3>Q${esc(q.number)} <span class="src">(${q.marks==null?"?":q.marks} marks)</span></h3>
    <details><summary>Show official question wording</summary><div class="prose verbatim">${q.verbatim?md(q.verbatim):"<p>"+esc(q.summary||"")+"</p>"}</div></details>
    <h4>Your answer</h4>
    <div class="prose your-answer">${(m.answers[q.id]||"").trim()?md(m.answers[q.id]):'<p class="src">Not answered.</p>'}</div>
    <h4>Self-marking checklist</h4>
    <ul class="checklist review-ckl">${(q.checklist||[]).map(c=>`<li><span>${esc(c)}</span></li>`).join("")}</ul>
    <label class="mock-alabel">Your self-score (0–${q.marks==null?"?":q.marks})
      <input type="number" class="review-score" data-qid="${esc(q.id)}" min="0"${typeof q.marks==="number"?` max="${q.marks}"`:""} step="1" inputmode="numeric">
    </label>
  </section>`;}).join("")}
  <div class="actions"><button class="btn btn-primary" type="submit">Save mock result</button></div>
  </form>`;
  document.title = `Review — mock ${m.session} — BIA Intelligence`;
  $("#reviewForm").addEventListener("submit",e=>{
    e.preventDefault();
    const scores = {}; let total = 0;
    $$(".review-score").forEach(inp=>{
      const v = inp.value==="" ? 0 : Math.max(0, +inp.value||0);
      scores[inp.dataset.qid] = v; total += v;
    });
    S.mocks.history.push({id:m.id, session:m.session, date:Date.now(),
      durationMin:m.durationMin, scores, total, maxTotal});
    S.mocks.active = null; save();
    location.hash = "#/mocks";
  });
}

/* ---------- views: tax (CAF-2 Taxation: Principles and Compliance) ----------
   Paraphrase-only throughout: no verbatim ICAP wording appears in any tax view. */
const taxSyllabus = () => DB.tax_syllabus || {areas:[], exam:{}};
const taxTopicById = id => (DB.tax_topics||[]).find(t=>t.id===id);
const taxQById = id => (DB.tax_questions||[]).find(q=>q.id===id);
const taxPracticeById = id => (DB.tax_practice||[]).find(p=>p.id===id);
const taxQB = q => [
  badge("b-type", q.type_label||q.type||"?"),
  badge("b-id", (q.marks==null?"?":q.marks) + (q.marks===1?" mark":" marks")),
  q.predecessor ? badge("b-pred","2021 predecessor") : badge("b-auth","2025 scheme"),
  `<span class="badge b-sugg" title="Wording is paraphrased, never verbatim ICAP text">● paraphrased</span>`,
].join("");
const taxObsRow = o => `<li class="result">
    <p class="snip" style="margin-top:0">${esc(o.observation)}</p>
    ${o.what_went_wrong?`<p class="snip"><strong>Went wrong:</strong> ${esc(o.what_went_wrong)}</p>`:""}
    ${o.stronger_answer?`<p class="snip"><strong>Stronger answer:</strong> ${esc(o.stronger_answer)}</p>`:""}
    <div class="meta"><span class="src">${esc(o.source)}</span>${o.question?`<span class="badge b-id">${esc(o.question)}</span>`:""}<span class="badge b-sugg">${esc(o.category||"")}</span></div>
  </li>`;
const taxPracticeCard = p => `<a class="card" href="#/tax/practice/${esc(p.id)}">
    <span class="k">${esc(p.id)} · ${esc(p.type_label||"")}</span>
    <h3>${esc(p.topic_title||"")}</h3>
    <p>${esc((p.question_text||"").slice(0,120))}…</p>
    <span class="count">${p.marks==null?"?":p.marks} marks</span></a>`;

function vTax(){
  setNav("tax");
  const syl = taxSyllabus();
  const areas = syl.areas||[];
  const leg = DB.tax_legislation||{provisions:[],rate_tables:[]};
  const nQ = (DB.tax_questions||[]).filter(q=>!q.excluded).length;
  const stats = [
    [nQ, "paraphrased question summaries", "#/tax/questions"],
    [(DB.tax_observations||[]).length, "examiner observations", "#/tax/examiner"],
    [(leg.provisions||[]).length + (leg.rate_tables||[]).length, "legislation entries", "#/tax/legislation"],
    [(DB.tax_practice||[]).length, "generated practice questions", "#/tax/practice"],
  ];
  app().innerHTML = `
  <div class="hero">
    <p class="eyebrow">ICAP CAF-2 · Taxation: Principles and Compliance</p>
    <h1>Study <em>smarter</em> for Taxation.</h1>
    <p class="lede">Nine topics, ${nQ} paraphrased question summaries and ${(DB.tax_observations||[]).length}
    examiner observations — every item mapped to the 2025 syllabus for the Spring 2027 attempt.</p>
  </div>
  <div class="stats" role="list">
    ${stats.map(s=>`<a class="stat" role="listitem" href="${s[2]}"><b>${s[0]}</b><span>${s[1]}</span></a>`).join("")}
  </div>
  <div class="section-head"><h2>Syllabus areas</h2><p>2025 scheme · ${esc(syl.total_weightage||100)} marks · ${esc(syl.total_los||"")} learning outcomes</p></div>
  <div class="card-grid">
    ${areas.map(a=>`<a class="card" href="#/tax/topics?area=${esc(a.code)}">
      <span class="k">Area ${esc(a.code)} · ${esc(a.weightage)}% weight</span>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.hours)} teaching hours · ${a.topics.length} topics</p>
      <span class="count">${a.topics.reduce((t,x)=>t+(x.los||[]).length,0)} LOs</span></a>`).join("")}
  </div>
  <div class="section-head"><h2>Explore</h2></div>
  <div class="card-grid">
    <a class="card" href="#/tax/topics"><span class="k">Library</span><h3>Topic library</h3><p>9 topics — summaries, key points and how each is examined.</p></a>
    <a class="card" href="#/tax/questions"><span class="k">Practice</span><h3>Question summaries</h3><p>Paraphrased summaries of past-paper questions — never verbatim wording.</p></a>
    <a class="card" href="#/tax/legislation"><span class="k">Reference</span><h3>Legislation browser</h3><p>Provisions, schedules and rate tables with verification badges.</p></a>
    <a class="card" href="#/tax/examiner"><span class="k">Examiner</span><h3>Examiner intelligence</h3><p>Paraphrased examiner observations, grouped by mistake category.</p></a>
    <a class="card" href="#/tax/practice"><span class="k">Drills</span><h3>Generated practice</h3><p>20 project-authored questions with model notes — labeled, not ICAP papers.</p></a>
    <a class="card" href="#/tax/tax-year"><span class="k">Concept</span><h3>Tax-year explainer</h3><p>Historical vs current law, and what counts as examinable for Spring 2027.</p></a>
  </div>
  <div class="notice"><strong>Examinable edition:</strong> ICAP's notice names the
  <strong>Sep-26 study-text edition</strong> for the Spring 2027 attempt — no Finance Act is named.
  Treat "Finance Act 2026 amendments incorporated" as inference, not fact.
  <a href="#/tax/tax-year">Read the tax-year explainer</a>.</div>
  <div class="notice"><strong>Paraphrase-only.</strong> Everything in the Taxation section is paraphrased or
  project-authored. No verbatim ICAP question wording, suggested solutions, examiner comments or
  study-text extracts appear anywhere here — the desktop app holds the full local archive.</div>`;
  document.title = "CAF-2 Taxation — BIA Intelligence";
}

function vTaxTopics(params){
  setNav("tax");
  const area = params.get("area")||"";
  const areas = (taxSyllabus().areas||[]).filter(a=>!area||a.code===area);
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › Topic library</p>
  <h2 class="page-title">Topic library</h2>
  <p class="page-sub">9 topics · summaries and key points are project-authored teaching.</p>
  <div class="deck-tools" role="group" aria-label="Filter by area">
    <label>Area <select class="fselect" id="taxAreaF">
      <option value="">All areas</option>
      ${(taxSyllabus().areas||[]).map(a=>`<option value="${esc(a.code)}"${a.code===area?" selected":""}>Area ${esc(a.code)} — ${esc(a.title)}</option>`).join("")}
    </select></label>
  </div>
  ${areas.map(a=>`
  <div class="section-head"><h2>Area ${esc(a.code)} — ${esc(a.title)}</h2><p>${esc(a.weightage)}% weight</p></div>
  <div class="card-grid">
    ${(DB.tax_topics||[]).filter(t=>t.area===a.code).map(t=>`
    <a class="card" href="#/tax/topic/${esc(t.id)}">
      <span class="k">${esc(t.code)}</span>
      <h3>${esc(t.title)}</h3>
      <p>${esc((t.summary||"").slice(0,140))}…</p>
      <span class="count">${(t.key_points||[]).length} key points</span>
    </a>`).join("")}
  </div>`).join("")}
  <p class="src" style="margin-top:8px"><span class="badge b-review">● own teaching</span> all summaries and key points</p>`;
  document.title = "Topic library — CAF-2 Taxation";
  $("#taxAreaF").addEventListener("change",e=>{
    location.hash = "#/tax/topics"+(e.target.value?`?area=${e.target.value}`:"");
  });
}

function vTaxTopic(id){
  setNav("tax");
  const t = taxTopicById(id);
  if(!t){ location.hash="#/tax/topics"; return; }
  const qs = (DB.tax_questions||[]).filter(q=>!q.excluded && (q.topic_codes||[]).includes(t.code));
  const pr = (DB.tax_practice||[]).filter(p=>p.topic_code===t.code);
  const ob = (DB.tax_observations||[]).filter(o=>(o.topics||[]).includes(t.code)).slice(0,4);
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › <a href="#/tax/topics">Topics</a> › ${esc(t.code)}</p>
  <div class="record-head">
    <div class="badges"><span class="badge b-type">Area ${esc(t.area)}</span><span class="badge b-id">${esc(t.code)}</span><span class="badge b-review">● own teaching</span></div>
    <h1>${esc(t.title)}</h1>
    <p class="page-sub">${esc(t.area_title)} · area weight ${esc(t.area_weightage)}%</p>
  </div>
  <section class="sumcard" aria-label="Topic summary">
    <h2>Topic summary</h2>
    <p>${esc(t.summary)}</p>
    <h3>Key points</h3>
    <ul>${(t.key_points||[]).map(k=>`<li>${esc(k)}</li>`).join("")}</ul>
    <p class="sumhow"><strong>How it&rsquo;s examined:</strong> ${esc(t.how_examined)}</p>
    ${(t.legislation_refs||[]).length?`<p class="sumhow"><strong>Legislation:</strong> ${t.legislation_refs.map(esc).join("; ")}</p>`:""}
  </section>
  ${qs.length?`<div class="section-head"><h2>Question summaries</h2><p>${qs.length} paraphrased</p></div>
  <ul class="results">${qs.map(q=>`<li class="result">
    <a class="rt" href="#/tax/questions/${esc(q.id)}">Q${esc(q.number)} — ${esc(q.session)}</a>
    <p class="snip">${esc(q.summary||"")}</p>
    <div class="meta">${taxQB(q)}</div>
  </li>`).join("")}</ul>`:""}
  ${pr.length?`<div class="section-head"><h2>Generated practice</h2><p>project-authored</p></div>
  <div class="card-grid">${pr.map(taxPracticeCard).join("")}</div>`:""}
  ${ob.length?`<div class="section-head"><h2>Examiner notes</h2><p>paraphrased</p></div>
  <ul class="results">${ob.map(taxObsRow).join("")}</ul>`:""}
  <div class="actions"><a class="btn btn-ghost" href="#/tax/topics">Back to topic library</a></div>`;
  document.title = `${t.title} — CAF-2 Taxation`;
}

function vTaxQuestions(params){
  setNav("tax");
  const all = DB.tax_questions||[];
  const sessions = [...new Set(all.map(q=>q.session))]
    .sort((a,b)=>((all.find(q=>q.session===a)||{}).session_order||0)-((all.find(q=>q.session===b)||{}).session_order||0));
  const types = [...new Set(all.map(q=>q.type_label).filter(Boolean))];
  const areas = taxSyllabus().areas||[];
  const f = {
    session: params.get("session")||"",
    type: params.get("type")||"",
    area: params.get("area")||"",
    att: params.get("att")||"",
  };
  const attd = ((S.tax||{}).attempted)||{};
  const list = all.filter(q=>{
    if(q.excluded) return false;
    if(f.session && q.session!==f.session) return false;
    if(f.type && q.type_label!==f.type) return false;
    if(f.area && !((q.topic_codes||[]).some(c=>(c||"")[0]===f.area))) return false;
    if(f.att==="done" && !attd[q.id]) return false;
    if(f.att==="todo" && attd[q.id]) return false;
    return true;
  }).sort((a,b)=>(a.session_order-b.session_order)||String(a.number).localeCompare(String(b.number)));
  const opt = (v,t,sel)=>`<option value="${esc(v)}"${v===sel?" selected":""}>${esc(t)}</option>`;
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › Questions</p>
  <h2 class="page-title">Question summaries</h2>
  <p class="page-sub">${list.length} paraphrased summaries · wording is never verbatim from ICAP papers.</p>
  <form class="filters" id="taxqf" aria-label="Filter tax questions">
    <label>Session <select class="fselect" name="session">${opt("","All sessions")}${sessions.map(s=>opt(s,s)).join("")}</select></label>
    <label>Type <select class="fselect" name="type">${opt("","All types")}${types.map(t=>opt(t,t)).join("")}</select></label>
    <label>Area <select class="fselect" name="area">${opt("","All areas")}${areas.map(a=>opt(a.code,"Area "+a.code)).join("")}</select></label>
    <label>Progress <select class="fselect" name="att">${opt("","All")}${opt("todo","Not attempted")}${opt("done","Attempted")}</select></label>
  </form>
  <p role="status" aria-live="polite" class="src">${list.length} summar${list.length===1?"y":"ies"} match</p>
  <ul class="results" id="taxQGrid">
    ${list.map(q=>`<li class="result">
      <a class="rt" href="#/tax/questions/${esc(q.id)}">Q${esc(q.number)} — ${esc(q.session)}</a>
      <p class="snip">${esc(q.summary||"")}</p>
      <div class="meta">${taxQB(q)}${attd[q.id]?`<span class="badge b-review">✓ attempted</span>`:""}</div>
    </li>`).join("") || `<li class="noresults"><h2>No summaries match</h2><p>Loosen a filter.</p></li>`}
  </ul>`;
  document.title = "Question summaries — CAF-2 Taxation";
  $("#taxqf").addEventListener("change", ()=>{
    const fd = new FormData($("#taxqf"));
    const p = new URLSearchParams();
    for(const [k,v] of fd.entries()) if(v) p.set(k,v);
    location.hash = "#/tax/questions" + (p.toString() ? "?"+p.toString() : "");
  });
}

function vTaxQuestion(id){
  setNav("tax");
  const q = taxQById(id);
  if(!q){ location.hash="#/tax/questions"; return; }
  const att = (((S.tax||{}).attempted)||{})[id];
  const related = (DB.tax_observations||[])
    .filter(o=>(o.topics||[]).some(t=>(q.topic_codes||[]).includes(t))).slice(0,3);
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › <a href="#/tax/questions">Questions</a> › ${esc(q.id)}</p>
  <div class="record-head">
    <div class="badges">${taxQB(q)}</div>
    <h1>Q${esc(q.number)} — ${esc(q.session)}</h1>
    <p class="page-sub">${esc(q.summary||"")}</p>
  </div>
  <div class="meta-table"><dl>
    <dt>Session</dt><dd>${esc(q.session)}${q.predecessor?' <span class="badge b-pred">2021 predecessor</span>':""}</dd>
    <dt>Source ref</dt><dd>${esc(q.source||"—")}</dd>
    <dt>Paper section</dt><dd>${esc(q.section||"—")}</dd>
    <dt>Type</dt><dd>${esc(q.type_label||q.type||"—")}</dd>
    <dt>Tax year</dt><dd>${esc(q.tax_year||"—")}</dd>
    <dt>Topics</dt><dd>${(q.topic_codes||[]).map(esc).join(", ")||"—"}</dd>
    <dt>Legislation</dt><dd>${(q.legislation_refs||[]).map(esc).join(", ")||"—"}</dd>
    <dt>LO refs</dt><dd>${(q.lo_refs||[]).map(esc).join(", ")||"—"}</dd>
    <dt>Difficulty</dt><dd>${esc(q.difficulty)} <span class="src">(estimate — ${esc(q.difficulty_basis||"not validated")})</span></dd>
  </dl></div>
  ${related.length?`<div class="section-head"><h2>Examiner notes</h2><p>paraphrased</p></div>
  <ul class="results">${related.map(taxObsRow).join("")}</ul>`:""}
  <div class="actions">
    <button class="btn ${att?"btn-ghost":"btn-primary"}" id="taxAttBtn">${att?"✓ Attempted — undo":"Mark as attempted"}</button>
    <a class="btn btn-ghost" href="#/tax/questions">Back to questions</a>
  </div>
  <div class="notice"><strong>Data note:</strong> the summary above is paraphrased — it is not the official
  question wording. Work the question from the summary, then check yourself against the official paper
  and suggested answer in your own materials.</div>`;
  document.title = `Q${q.number} ${q.session} — CAF-2 Taxation`;
  $("#taxAttBtn").addEventListener("click",()=>{
    S.tax = S.tax||{attempted:{}}; S.tax.attempted = S.tax.attempted||{};
    if(S.tax.attempted[id]) delete S.tax.attempted[id]; else S.tax.attempted[id]=Date.now();
    save(); vTaxQuestion(id);
  });
}

function vTaxLegislation(params){
  setNav("tax");
  const leg = DB.tax_legislation||{provisions:[],rate_tables:[],verification_key:{}};
  const tab = params.get("tab")||"provisions";
  const cat = params.get("cat")||"", ver = params.get("ver")||"";
  const cats = [...new Set((leg.provisions||[]).map(p=>p.category).filter(Boolean))].sort();
  const vers = [...new Set((leg.provisions||[]).map(p=>p.verification).filter(Boolean))].sort();
  const list = (leg.provisions||[]).filter(p=>
    (!cat || p.category===cat) && (!ver || p.verification===ver));
  const catLabel = c => ({"statute_section":"Statute section","schedule":"Schedule","tax_year":"Tax year",
    "finance_act":"Finance Act","sro":"SRO","rules":"Rules",
    "knowledge_reference":"Knowledge reference","rate_table":"Rate table"}[c]||c);
  const provRow = p => `<li class="result">
      <p style="margin:0"><strong>${esc(p.identifier||"")}</strong></p>
      ${p.reference?`<p class="snip">${esc(p.reference)}</p>`:""}
      ${p.description?`<p class="snip">${esc(p.description)}</p>`:""}
      <div class="meta">
        <span class="badge ${esc((p.badge||{}).class||"b-diff")}">● ${esc((p.badge||{}).label||p.verification||"")}</span>
        ${p.category?`<span class="badge b-id">${esc(catLabel(p.category))}</span>`:""}
        ${p.applicable_period?`<span class="src">${esc(p.applicable_period)}</span>`:""}
        ${p.source?`<span class="src">${esc(p.source)}</span>`:""}
      </div>
    </li>`;
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › Legislation</p>
  <h2 class="page-title">Legislation browser</h2>
  <p class="page-sub">${(leg.provisions||[]).length} provisions and knowledge references · ${(leg.rate_tables||[]).length} rate tables. Names, section refs and rates are facts; descriptions are own-wording.</p>
  <div class="dtabs" role="group" aria-label="Browse legislation">
    <button data-tab="provisions" aria-pressed="${tab==="provisions"}">Provisions</button>
    <button data-tab="rates" aria-pressed="${tab==="rates"}">Rate tables</button>
  </div>
  ${tab==="provisions"?`
  <form class="filters" id="legF" aria-label="Filter provisions">
    <label>Category <select class="fselect" name="cat"><option value="">All</option>${cats.map(c=>`<option value="${esc(c)}"${c===cat?" selected":""}>${esc(catLabel(c))}</option>`).join("")}</select></label>
    <label>Verification <select class="fselect" name="ver"><option value="">All</option>${vers.map(v=>`<option value="${esc(v)}"${v===ver?" selected":""}>${esc(v.replace(/_/g," "))}</option>`).join("")}</select></label>
  </form>
  <p role="status" aria-live="polite" class="src">${list.length} entries</p>
  <ul class="results">
    ${list.map(provRow).join("") || `<li class="noresults"><h2>No entries match</h2><p>Loosen a filter.</p></li>`}
  </ul>`:`<ul class="results">
    ${(leg.rate_tables||[]).map(provRow).join("")}
  </ul>`}
  <div class="section-head"><h2>Verification key</h2></div>
  <ul class="about-list">
    ${Object.entries(leg.verification_key||{}).map(([k,v])=>`<li><strong>${esc(k.replace(/_/g," "))}</strong> — ${esc(v)}</li>`).join("")}
  </ul>
  <div class="notice">${esc(leg.note||"")}</div>`;
  document.title = "Legislation — CAF-2 Taxation";
  $$(".dtabs button").forEach(b=>b.addEventListener("click",()=>{
    location.hash = "#/tax/legislation"+(b.dataset.tab==="rates"?"?tab=rates":"");
  }));
  const lf = $("#legF");
  if(lf) lf.addEventListener("change",()=>{
    const fd = new FormData(lf);
    const p = new URLSearchParams();
    for(const [k,v] of fd.entries()) if(v) p.set(k,v);
    location.hash = "#/tax/legislation"+(p.toString()?"?"+p.toString():"");
  });
}

function vTaxExaminer(params){
  setNav("tax");
  const q = params.get("q")||"";
  const cat = params.get("cat")||"";
  const cats = [...new Set((DB.tax_observations||[]).map(o=>o.category).filter(Boolean))];
  let results = [];
  if(q){
    results = searchDocs(q, "taxobs", 30).map(r=>r.d);
    if(cat) results = results.filter(o=>o.category===cat);
  } else if(cat){
    results = (DB.tax_observations||[]).filter(o=>o.category===cat);
  }
  const showResults = q || cat;
  const byCat = {};
  for(const o of DB.tax_observations||[]){ (byCat[o.category||"other"]=byCat[o.category||"other"]||[]).push(o); }
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › Examiner</p>
  <h2 class="page-title">Examiner intelligence</h2>
  <p class="page-sub">${(DB.tax_observations||[]).length} paraphrased examiner observations — what went wrong and what a stronger answer does.</p>
  <form class="searchbar" id="taxExForm" role="search" style="position:static;border:0;padding:0">
    <div class="row"><input id="q" type="search" value="${esc(q)}" placeholder="Search examiner observations…" aria-label="Search tax examiner observations"></div>
    <div class="fchips" role="group" aria-label="Filter by category">
      ${["",...cats].map(c=>`<button type="button" data-cat="${esc(c)}" aria-pressed="${c===cat}">${c||"all"}</button>`).join("")}
    </div>
  </form>
  ${showResults?`<p role="status" aria-live="polite" class="src">${results.length} observations match${cat?` in “${esc(cat)}”`:""}</p>
  <ul class="results">
    ${results.map(taxObsRow).join("") || `<li class="noresults"><h2>No observations match</h2></li>`}
  </ul>`
  :Object.entries(byCat).map(([c,os])=>`
  <div class="section-head"><h2 style="text-transform:capitalize">${esc(c)}</h2><p>${os.length} observations</p></div>
  <ul class="results">${os.slice(0,4).map(taxObsRow).join("")}</ul>
  ${os.length>4?`<p class="src"><a href="#/tax/examiner?cat=${encodeURIComponent(c)}">View all ${os.length} ${esc(c)} observations</a></p>`:""}`).join("")}
  <div class="notice"><strong>Paraphrased.</strong> These are own-wording summaries of ICAP examiner comments — never verbatim.</div>`;
  document.title = "Examiner intelligence — CAF-2 Taxation";
  const go = ()=>{ const v=$("#q").value.trim();
    location.hash = "#/tax/examiner"+(v||cat ? "?"+new URLSearchParams(Object.assign({}, v?{q:v}:{}, cat?{cat}:{})).toString() : ""); };
  $("#taxExForm").addEventListener("submit",e=>{e.preventDefault();go();});
  let t; $("#q").addEventListener("input",()=>{clearTimeout(t);t=setTimeout(go,700);});
  $$("#taxExForm [data-cat]").forEach(b=>b.addEventListener("click",()=>{
    const c=b.dataset.cat, v=$("#q").value.trim();
    location.hash="#/tax/examiner"+(v||c?"?"+new URLSearchParams(Object.assign({},v?{q:v}:{},c?{cat:c}:{})).toString():"");
  }));
}

function vTaxPractice(){
  setNav("tax");
  const list = DB.tax_practice||[];
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › Practice</p>
  <h2 class="page-title">Generated practice questions</h2>
  <p class="page-sub">${list.length} project-authored questions with model notes and marking rubrics.</p>
  <div class="notice"><strong>Not ICAP questions.</strong> Every question here was written for this project —
  none is taken from an ICAP paper. Rates and treatment rules used in computations are stated inside each
  question, the way the exam paper's rate sheet states them.</div>
  <div class="card-grid">${list.map(taxPracticeCard).join("")}</div>`;
  document.title = "Practice — CAF-2 Taxation";
}

function vTaxPracticeQ(id){
  setNav("tax");
  const p = taxPracticeById(id);
  if(!p){ location.hash="#/tax/practice"; return; }
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › <a href="#/tax/practice">Practice</a> › ${esc(p.id)}</p>
  <div class="record-head">
    <div class="badges">
      <span class="badge b-new">● generated — not an ICAP question</span>
      <span class="badge b-type">${esc(p.type_label||"")}</span>
      <span class="badge b-id">${p.marks==null?"?":p.marks}${p.marks===1?" mark":" marks"}</span>
      ${p.time_minutes?`<span class="badge b-id">~${esc(p.time_minutes)} min</span>`:""}
    </div>
    <h1>${esc(p.id)} — ${esc(p.topic_title||"")}</h1>
    <p class="page-sub">Topic ${esc(p.topic_code||"")} · difficulty ${p.difficulty==null?"?":esc(p.difficulty)}/5 (project estimate) · tax year ${esc(p.tax_year||"—")}</p>
  </div>
  <div class="section-head"><h2>Question</h2></div>
  <div class="prose"><p>${esc(p.question_text||"")}</p></div>
  ${(p.steps||[]).length?`<div class="section-head"><h2>Suggested working order</h2></div>
  <div class="prose"><ol>${p.steps.map(s=>`<li>${esc(s.label||s.key||"")}</li>`).join("")}</ol></div>`:""}
  <div class="section-head"><h2>Model approach</h2><p>compare after attempting</p></div>
  <div class="prose"><p>${esc(p.model_notes||"")}</p></div>
  ${(p.rubric||[]).length?`<div class="section-head"><h2>Marking rubric</h2></div>
  <div class="prose"><table><thead><tr><th>Dimension</th><th>What earns it</th><th>Marks</th></tr></thead>
  <tbody>${p.rubric.map(r=>`<tr><td><strong>${esc(r.dimension||"")}</strong></td><td>${esc(r.guidance||"")}</td><td>${r.max_marks==null?"—":esc(r.max_marks)}</td></tr>`).join("")}</tbody></table></div>`:""}
  <div class="actions"><a class="btn btn-ghost" href="#/tax/practice">Back to practice</a></div>`;
  document.title = `${p.id} — practice — CAF-2 Taxation`;
}

function vTaxYear(){
  setNav("tax");
  app().innerHTML = `
  <p class="crumb"><a href="#/tax">Taxation</a> › Tax-year explainer</p>
  <h2 class="page-title">Tax years &amp; historical vs current law</h2>
  <p class="page-sub">Why a 2022 paper and the Spring 2027 exam don't run on the same law.</p>
  <div class="prose">
  <h2>Tax year, in one paragraph</h2>
  <p>Pakistan taxes income on a July-to-June cycle: the <strong>income year</strong> is the twelve months in
  which the income is earned (e.g. 1 July 2025 – 30 June 2026), and the <strong>tax year</strong> is the year in
  which that income is assessed (Tax Year 2026). Every question summary on this site carries the tax year it was
  set in — treat its rates and provisions as belonging to that year.</p>
  <h2>Historical vs current law</h2>
  <p>Tax law moves every year through Finance Acts. A question from Autumn 2022 was examined on the law as it
  stood then; some of those provisions and rates have since been amended. Use older sessions for
  <em>technique</em> — how to structure a computation, which adjustments examiners reward — and learn the
  <em>current</em> rates and provisions from the Sep-26 study-text edition.</p>
  <h2>What is examinable for Spring 2027</h2>
  <p>ICAP's Examinable Editions notice names the <strong>Sep-26 edition of the study text</strong> — it names no
  Finance Act directly. "Finance Act 2026 amendments incorporated" is therefore an <strong>inference</strong>,
  not a fact ICAP has stated; this site flags it as such wherever it matters. In the exam itself, the paper
  prints the rates you need — always use the paper's figures over memory.</p>
  <h2>How this site labels law-sensitive content</h2>
  <ul class="about-list">
    <li><span class="badge b-auth">● authoritative — ICAP syllabus</span> — stated by ICAP in the syllabus or examinable knowledge references.</li>
    <li><span class="badge b-public">● official guidance — ICAP materials</span> — printed or stated by ICAP in papers, suggested answers, marking plans or study material; exam-session specific.</li>
    <li><span class="badge b-review">● inference — not stated by ICAP</span> — inferred from the materials; never presented as fact.</li>
  </ul>
  </div>
  <div class="actions"><a class="btn btn-ghost" href="#/tax">Back to Taxation home</a></div>`;
  document.title = "Tax-year explainer — CAF-2 Taxation";
}

/* ---------- router ---------- */
function route(){
  clearMockTimer();
  const h = location.hash || "#/";
  const noHash = h.slice(2);
  const qi = noHash.indexOf("?");
  const path = (qi<0?noHash:noHash.slice(0,qi)).split("/").filter(Boolean);
  const params = new URLSearchParams(qi<0?"":noHash.slice(qi+1));
  const seg0 = path[0]||"";
  if(seg0==="") vHome();
  else if(seg0==="syllabus") path[1] ? vArea(path[1]) : vSyllabus();
  else if(seg0==="questions") vQuestions(params);
  else if(seg0==="q" && path[1]) vQuestion(path[1]);
  else if(seg0==="examiner") vExaminer(params);
  else if(seg0==="g" && path[1]) vGuide(path[1]);
  else if(seg0==="revision") path[1]==="cards" ? vCards(params) : vRevision(params);
  else if(seg0==="mocks"){
    if(path[1]==="run") vMockRun();
    else if(path[1]==="review") vMockReview();
    else if(path[2]==="setup" && path[1]) vMockSetup(path[1]);
    else vMocks();
  }
  else if(seg0==="about") vAbout();
  else if(seg0==="tax"){
    const t1 = path[1]||"";
    if(t1==="topics") vTaxTopics(params);
    else if(t1==="topic" && path[2]) vTaxTopic(path[2]);
    else if(t1==="questions") path[2] ? vTaxQuestion(path[2]) : vTaxQuestions(params);
    else if(t1==="legislation") vTaxLegislation(params);
    else if(t1==="examiner") vTaxExaminer(params);
    else if(t1==="practice") path[2] ? vTaxPracticeQ(path[2]) : vTaxPractice();
    else if(t1==="tax-year") vTaxYear();
    else vTax();
  }
  else if(seg0==="search") vSearch(params.get("q")||"");
  else vHome();
  window.scrollTo(0,0);
}

/* ---------- boot ---------- */
async function boot(){
  const fill=$("#loaderFill"), count=$("#loaderCount");
  let done=0, total=1;
  const load=t=>fetch("data/"+t+".json?v=20261023e").then(r=>{if(!r.ok)throw new Error(t+" "+r.status);return r.json();})
    .then(j=>{DB[t]=j;done++;fill.style.width=Math.round(done/total*100)+"%";count.textContent=done+" / "+total+" collections";});
  try{
    const mresp = await fetch("data/manifest.json?v=20261023e");
    if(!mresp.ok) throw new Error("manifest "+mresp.status);
    DB.manifest = await mresp.json();
    // Normalize shard names: manifest may list "questions_a.json"; loader appends ".json" itself.
    if(Array.isArray(DB.manifest.question_shards)) DB.manifest.question_shards = DB.manifest.question_shards.map(s=>String(s).replace(/\.json$/,""));
    const shards = (DB.manifest&&DB.manifest.question_shards)||["questions_a","questions_b"];
    const tables = [...shards, ...BASE_TABLES, ...TAX_TABLES];
    total = tables.length + 1; done = 1;
    fill.style.width=Math.round(done/total*100)+"%";count.textContent=done+" / "+total+" collections";
    await Promise.all(tables.map(load));
  }
  catch(e){ count.textContent="Failed to load data: "+e.message; return; }
  DB.questions = [];
  for(const s of (DB.manifest.question_shards||[])) DB.questions.push(...(DB[s]||[]));
  buildIndex();
  $("#loader").classList.add("done");
  setTimeout(()=>$("#loader").remove(),500);
  route();
}
document.addEventListener("DOMContentLoaded",boot);
window.addEventListener("hashchange",()=>{
  if($("#loader")){ const t=setInterval(()=>{ if(!$("#loader")){ clearInterval(t); route(); } },200); }
  else route();
});
document.addEventListener("keydown",e=>{
  if(e.key==="/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement&&document.activeElement.tagName||"")){
    e.preventDefault();
    const t = $("#q")||$("#hq");
    if(t){ t.focus(); t.scrollIntoView({block:"center"}); }
    else { location.hash="#/search"; setTimeout(()=>{const q=$("#q"); if(q) q.focus();},300); }
  }
});
document.getElementById("searchTrigger").addEventListener("click",()=>{
  const t = $("#q")||$("#hq");
  if(t){ t.focus(); t.scrollIntoView({block:"center"}); }
  else location.hash="#/search";
});
