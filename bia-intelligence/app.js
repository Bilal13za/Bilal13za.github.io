/* BIA Intelligence — interactive study companion. Vanilla JS, no build step. */
"use strict";
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- data ---------- */
const TABLES = ["questions_a","questions_b","observations","cards","mistake_guides","generated","topic_notes","syllabus","manifest"];
const DB = {};
const Q_TABLES = ["questions_a","questions_b"]; // merged into DB.questions on load
const TYPES = {
  question:   {table:"questions",      label:"Question"},
  observation:{table:"observations",   label:"Examiner note"},
  card:       {table:"cards",          label:"Flashcard"},
  guide:      {table:"mistake_guides", label:"Mistake guide"},
  generated:  {table:"generated",      label:"Practice question"},
  note:       {table:"topic_notes",    label:"Revision note"},
};
const titleOf = (type, row) => {
  if (type === "question") return `Q${row.number} · ${row.session} (${row.marks==null?"?":row.marks} marks)`;
  if (type === "observation") return row.id + " · " + row.session;
  if (type === "card") return row.front.slice(0, 80);
  if (type === "guide") return row.title;
  if (type === "generated") return row.id + " · generated practice";
  if (type === "note") return row.title;
  return row.id;
};
const bodyOf = (type, row) => {
  if (type === "question") return [row.summary, (row.command_words||[]).join(" "), (row.topic_tags||[]).join(" ")].join(" ");
  if (type === "observation") return [row.observation, row.what_went_wrong||"", row.stronger_answer||""].join(" ");
  if (type === "card") return row.front + " " + row.back;
  if (type === "guide") return [row.title, row.description||"", row.why||""].join(" ");
  if (type === "generated") return row.prompt + " " + (row.skills||"");
  if (type === "note") return [row.title, row.overview||"", row.key_concepts||""].join(" ");
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
  : type==="guide" ? "#/g/"+id : "#/search?q="+encodeURIComponent(id);

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
let S = {attempted:{}, checks:{}, sm2:{}};
try { const raw = localStorage.getItem(LS); if(raw) S = Object.assign(S, JSON.parse(raw)); } catch(e){}
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
  <div class="notice"><strong>Predecessor note:</strong> questions before 2025 come from
  <strong>CAF-6 Managerial and Financial Analysis</strong>, the renamed predecessor of CAF-7 BIA —
  each one mapped to current-syllabus topics; removed topics are excluded from practice.</div>
  <div class="trust">
    <h2>How to trust this site</h2>
    <p>Every item is labeled by origin. Nothing here is verbatim ICAP wording — questions and
    examiner notes are paraphrased summaries for study; the desktop app holds the full local archive.</p>
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
  <p class="page-sub">${list.length} questions · paraphrased summaries — the desktop app holds the full archive.</p>
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
  <div class="notice"><strong>Study note:</strong> summaries here are paraphrased — no verbatim ICAP wording is published on this site.
  Attempt the question first, then check yourself against the official suggested answer in your own materials.</div>`;
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
    <li><strong>Paraphrase only.</strong> No verbatim ICAP question, suggested-answer, examiner-comment or study-text wording is published on this public site, by copyright. Summaries are faithful but not quotations.</li>
    <li><strong>Only two sessions under the BIA name.</strong> Trend patterns lean on predecessor papers through the delta mapping; treat them as indicative, never as predictions.</li>
    <li><strong>Generated practice questions</strong> are the project's own — clearly labeled, never presented as past papers.</li>
    <li><strong>Difficulty ratings are estimates</strong>, refined only by your own attempt data in the desktop app.</li>
    <li><strong>The desktop Streamlit app</strong> adds timed mocks, the deterministic answer-evaluation engine, performance analytics and the study planner — this site is the portable companion.</li>
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

/* ---------- router ---------- */
function route(){
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
  else if(seg0==="about") vAbout();
  else if(seg0==="search") vSearch(params.get("q")||"");
  else vHome();
  window.scrollTo(0,0);
}

/* ---------- boot ---------- */
async function boot(){
  const fill=$("#loaderFill"), count=$("#loaderCount");
  let done=0;
  const jobs=TABLES.map(t=>fetch("data/"+t+".json?v=20261023a").then(r=>{if(!r.ok)throw new Error(t+" "+r.status);return r.json();})
    .then(j=>{DB[t]=j;done++;fill.style.width=Math.round(done/TABLES.length*100)+"%";count.textContent=done+" / "+TABLES.length+" collections";}));
  try{ await Promise.all(jobs); }
  catch(e){ count.textContent="Failed to load data: "+e.message; return; }
  DB.questions = [...(DB.questions_a||[]), ...(DB.questions_b||[])];
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
