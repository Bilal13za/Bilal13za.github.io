/* CA Audit Intelligence — interactive UI. Vanilla JS, no build step. */
"use strict";
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- data ---------- */
const TABLES = ["audit_areas","assertions","audit_risks","risk_factors","controls","audit_procedures",
  "evidence_types","industries","standards","regulations","publishers","case_studies","fraud_patterns",
  "knowledge_records","audit_programmes","working_paper_templates","reasoning_rules","study_resources",
  "risk_assertion","risk_control","risk_procedure","factor_risk","industry_risk","case_study_risk",
  "standard_procedure","procedure_evidence","known_limitations"];
const DB = {};
const BYID = {};   // type -> Map(id -> row)

const TYPES = {
  risk:{table:"audit_risks",label:"Risk",t:"title",b:["description"]},
  procedure:{table:"audit_procedures",label:"Procedure",t:"title",b:["description"]},
  control:{table:"controls",label:"Control",t:"title",b:["description"]},
  evidence:{table:"evidence_types",label:"Evidence",t:"name",b:["description"]},
  assertion:{table:"assertions",label:"Assertion",t:"name",b:["description"]},
  area:{table:"audit_areas",label:"Audit area",t:"name",b:["description"]},
  industry:{table:"industries",label:"Industry",t:"name",b:["business_model","common_accounting_issues","significant_inherent_risks","typical_controls","regulatory_requirements","notes"]},
  standard:{table:"standards",label:"Standard",t:"title",b:[]},
  regulation:{table:"regulations",label:"Regulation",t:"title",b:["summary","applicability_notes"]},
  case:{table:"case_studies",label:"Case study",t:"title",b:["background","reporting_issue","what_went_wrong","lessons"]},
  fraud:{table:"fraud_patterns",label:"Fraud pattern",t:"name",b:["how_it_works","pressure","opportunity","rationalization"]},
  knowledge:{table:"knowledge_records",label:"Knowledge",t:"title",b:["description","practical_application"]},
  programme:{table:"audit_programmes",label:"Programme",t:"title",b:["summary"]},
  template:{table:"working_paper_templates",label:"Template",t:"title",b:["objective"]},
  factor:{table:"risk_factors",label:"Risk factor",t:"title",b:["description"]},
  rule:{table:"reasoning_rules",label:"Reasoning rule",t:"name",b:["rationale"]},
  study:{table:"study_resources",label:"Study",t:"title",b:[]},
};
const titleOf = (type,row)=>{const c=TYPES[type];return row[c.t]||row.title||row.name||row.id;};
const bodyOf = (type,row)=>{const c=TYPES[type];return c.b.map(f=>row[f]).filter(Boolean).join("\n\n");};

const SYN = {receivables:["debtors"],debtors:["receivables"],inventory:["stock"],stock:["inventory"],
  ppe:["fixed assets"],payables:["creditors"],creditors:["payables"],revenue:["sales","turnover"],
  cutoff:["cut-off"],payroll:["wages","salaries"],fraud:["fraudulent"]};

/* inverted index: token -> Set("type:id") */
const INDEX = new Map();
const DOCS = new Map(); // "type:id" -> {type,id,title,text}
const tok = s => (String(s||"").toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)||[]);
function buildIndex(){
  for(const [type,c] of Object.entries(TYPES)){
    for(const row of DB[c.table]||[]){
      const key = type+":"+row.id;
      const text = titleOf(type,row)+" "+bodyOf(type,row);
      DOCS.set(key,{type,id:row.id,title:titleOf(type,row),text});
      for(const t of new Set(tok(text))){
        if(!INDEX.has(t)) INDEX.set(t,new Set());
        INDEX.get(t).add(key);
      }
    }
  }
}
function searchDocs(q, typeFilter, limit){
  let terms = tok(q), expanded = new Set();
  for(const t of terms){ expanded.add(t); (SYN[t]||[]).forEach(s=>tok(s).forEach(x=>expanded.add(x))); }
  if(!expanded.size) return [];
  let cand = null;
  for(const t of expanded){
    const s = INDEX.get(t)||new Set();
    cand = cand===null ? new Set(s) : new Set([...cand].filter(x=>s.has(x)));
    if(!cand.size) break;
  }
  // fall back: union (OR) when AND is empty
  if(!cand || !cand.size){
    cand = new Set();
    for(const t of expanded) for(const k of (INDEX.get(t)||[])) cand.add(k);
  }
  const scored = [...cand].map(k=>{
    const d = DOCS.get(k);
    if(typeFilter && d.type!==typeFilter) return null;
    const dt = new Set(tok(d.title));
    let score = 0;
    for(const t of expanded){ if(INDEX.get(t)&&[...tok(d.text)].includes(t)) score+=1; if(dt.has(t)) score+=3; }
    return {d,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return scored.slice(0,limit||20);
}

/* ---------- small markdown renderer (headings, bold, lists, tables, rules) ---------- */
function md(src){
  const lines = String(src||"").split("\n"); let html="", inList=false, inTable=false, para=[];
  const flushP=()=>{ if(para.length){ html+="<p>"+para.join(" ")+"</p>"; para=[]; } };
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,"$1");
  for(let i=0;i<lines.length;i++){
    const ln = lines[i];
    if(/^#{1,4}\s/.test(ln)){ flushP(); if(inList){html+="</ul>";inList=false;}
      const lvl=ln.match(/^#+/)[0].length, t=ln.replace(/^#+\s*/,"");
      if(/^\d+\./.test(t)||/^##?\s*\d+\./.test(ln)){ html+=`<h2>${inline(t)}</h2>`; } else html+=`<h${Math.min(lvl+1,3)}>${inline(t)}</h${Math.min(lvl+1,3)}>`; continue; }
    if(/^\s*---\s*$/.test(ln)){ flushP(); if(inList){html+="</ul>";inList=false;} html+="<hr>"; continue; }
    if(/^\s*\|.*\|\s*$/.test(ln)){
      flushP(); if(inList){html+="</ul>";inList=false;}
      if(!inTable){ html+="<table>"; inTable=true; }
      const cells = ln.trim().replace(/^\||\|$/g,"").split("|").map(c=>inline(c.trim()));
      if(/^-+/.test(cells[0])) continue;
      const tag = /th|header/i.test(lines[i-1]||"")||!html.endsWith("<table>") ? "td":"td";
      html+="<tr>"+cells.map(c=>`<${tag}>${c}</${tag}>`).join("")+"</tr>"; continue;
    } else if(inTable){ html+="</table>"; inTable=false; }
    const lm = ln.match(/^\s*([-*]|\d+\.)\s+(.*)/);
    if(lm){ flushP(); if(!inList){html+="<ul>";inList=true;} html+=`<li>${inline(lm[2])}</li>`; continue; }
    if(/^\s*$/.test(ln)){ flushP(); if(inList){html+="</ul>";inList=false;} continue; }
    para.push(inline(ln.trim()));
  }
  flushP(); if(inList)html+="</ul>"; if(inTable)html+="</table>";
  return html;
}

/* ---------- badges / meta ---------- */
const VS_BADGE = vs => {
  vs = String(vs||"");
  if(/authoritative|official_guidance/.test(vs)) return `<span class="badge b-auth">● authoritative</span>`;
  if(/public_record/.test(vs)) return `<span class="badge b-public">● public record</span>`;
  if(/internal_review/.test(vs)) return `<span class="badge b-review">● internal review</span>`;
  return `<span class="badge b-sugg">● ${esc(vs||"guidance")}</span>`;
};
const suggTag = mt => mt==="suggested" ? `<span class="tag-sugg">suggested</span>` : "";
const areaName = id => { const a=(DB.audit_areas||[]).find(x=>x.id===id); return a?a.name:id; };

/* ---------- link resolution ---------- */
function linksFor(type,id){
  const L = [];
  const link = (label, rows, mtField) => { if(rows&&rows.length) L.push({label, rows}); };
  const R = {
    risk_assertion:DB.risk_assertion||[], risk_control:DB.risk_control||[], risk_procedure:DB.risk_procedure||[],
    factor_risk:DB.factor_risk||[], industry_risk:DB.industry_risk||[], case_study_risk:DB.case_study_risk||[],
    standard_procedure:DB.standard_procedure||[], procedure_evidence:DB.procedure_evidence||[] };
  const byId = t => { const m=new Map(); for(const r of DB[TYPES[t].table]||[]) m.set(r.id,r); return m; };
  if(type==="risk"){
    link("Assertions", R.risk_assertion.filter(m=>m.risk_id===id).map(m=>({...m,row:byId("assertion").get(m.assertion_id),t:"assertion",rid:m.assertion_id})));
    link("Controls", R.risk_control.filter(m=>m.risk_id===id).map(m=>({...m,row:byId("control").get(m.control_id),t:"control",rid:m.control_id})));
    link("Procedures", R.risk_procedure.filter(m=>m.risk_id===id).map(m=>({...m,row:byId("procedure").get(m.procedure_id),t:"procedure",rid:m.procedure_id})));
    link("Risk factors", R.factor_risk.filter(m=>m.risk_id===id).map(m=>({...m,row:byId("factor").get(m.factor_id),t:"factor",rid:m.factor_id})));
    link("Industries", R.industry_risk.filter(m=>m.risk_id===id).map(m=>({...m,row:byId("industry").get(m.industry_id),t:"industry",rid:m.industry_id})));
    link("Case studies", R.case_study_risk.filter(m=>m.risk_id===id).map(m=>({...m,row:byId("case").get(m.case_id),t:"case",rid:m.case_id})));
  } else if(type==="procedure"){
    link("Risks addressed", R.risk_procedure.filter(m=>m.procedure_id===id).map(m=>({...m,row:byId("risk").get(m.risk_id),t:"risk",rid:m.risk_id})));
    link("Standards", R.standard_procedure.filter(m=>m.procedure_id===id).map(m=>({...m,row:byId("standard").get(m.standard_id),t:"standard",rid:m.standard_id})));
    link("Evidence", R.procedure_evidence.filter(m=>m.procedure_id===id).map(m=>({...m,row:byId("evidence").get(m.evidence_id),t:"evidence",rid:m.evidence_id})));
  } else if(type==="standard"){
    link("Procedures", R.standard_procedure.filter(m=>m.standard_id===id).map(m=>({...m,row:byId("procedure").get(m.procedure_id),t:"procedure",rid:m.procedure_id})));
  } else if(type==="industry"){
    link("Risks", R.industry_risk.filter(m=>m.industry_id===id).map(m=>({...m,row:byId("risk").get(m.risk_id),t:"risk",rid:m.risk_id})));
  } else if(type==="case"){
    link("Risks illustrated", R.case_study_risk.filter(m=>m.case_id===id).map(m=>({...m,row:byId("risk").get(m.risk_id),t:"risk",rid:m.risk_id})));
  } else if(type==="control"){
    link("Risks", R.risk_control.filter(m=>m.control_id===id).map(m=>({...m,row:byId("risk").get(m.risk_id),t:"risk",rid:m.risk_id})));
  } else if(type==="evidence"){
    link("Procedures", R.procedure_evidence.filter(m=>m.evidence_id===id).map(m=>({...m,row:byId("procedure").get(m.procedure_id),t:"procedure",rid:m.procedure_id})));
  } else if(type==="assertion"){
    link("Risks", R.risk_assertion.filter(m=>m.assertion_id===id).map(m=>({...m,row:byId("risk").get(m.risk_id),t:"risk",rid:m.risk_id})));
  } else if(type==="factor"){
    link("Risks", R.factor_risk.filter(m=>m.factor_id===id).map(m=>({...m,row:byId("risk").get(m.risk_id),t:"risk",rid:m.risk_id})));
  } else if(type==="fraud"){
    const fp=(DB.fraud_patterns||[]).find(r=>r.id===id);
    let pids=[]; try{ pids=JSON.parse(fp.detection_procedure_ids||"[]"); }catch(e){}
    link("Detection procedures", pids.map(p=>({row:byId("procedure").get(p),t:"procedure",rid:p})));
  } else if(type==="knowledge"){
    const kr=(DB.knowledge_records||[]).find(r=>r.id===id);
    let sids=[]; try{ sids=JSON.parse(kr.standard_ids||"[]"); }catch(e){}
    link("Standards", sids.map(s=>({row:byId("standard").get(s),t:"standard",rid:s})));
  }
  return L.map(s=>({...s, rows:s.rows.filter(r=>r.row)}));
}

/* ---------- router ---------- */
const app = $("#app");
function nav(){ $$(".site-nav a").forEach(a=>a.removeAttribute("aria-current"));
  const h=(location.hash||"#/").split("?")[0];
  let m="home";
  if(h.startsWith("#/search")) m="search";
  else if(h.startsWith("#/browse")) m="browse";
  else if(h.startsWith("#/library")) m="library";
  else if(h.startsWith("#/about")) m="about";
  const a=$(`.site-nav a[data-nav="${m}"]`);
  if(a) a.setAttribute("aria-current","page"); }
function route(){
  nav();
  const h=(location.hash||"#/").slice(2);
  const [path,qs]=h.split("?");
  const params=new URLSearchParams(qs||"");
  const seg=path.split("/").filter(Boolean);
  window.scrollTo(0,0);
  if(seg[0]==="search") return vSearch(params.get("q")||"",params.get("type")||"");
  if(seg[0]==="r"&&seg[1]&&seg[2]) return vRecord(seg[1],decodeURIComponent(seg[2]));
  if(seg[0]==="browse") return vBrowse(seg[1]||"");
  if(seg[0]==="chain"&&seg[1]) return vChain(decodeURIComponent(seg[1]));
  if(seg[0]==="library") return vLibrary(seg[1]||"");
  if(seg[0]==="about") return vAbout();
  return vHome();
}
window.addEventListener("hashchange",route);
document.addEventListener("keydown",e=>{
  if(e.key==="/"&&!/input|textarea/i.test(document.activeElement.tagName)){e.preventDefault();location.hash="#/search";setTimeout(()=>{const i=$("#q");if(i)i.focus();},60);}
  if(e.key==="Escape"&&document.activeElement&&/input/i.test(document.activeElement.tagName))document.activeElement.blur();
});
$("#searchTrigger").addEventListener("click",()=>{location.hash="#/search";setTimeout(()=>{const i=$("#q");if(i)i.focus();},80);});

/* ---------- views: home ---------- */
const COLLECTIONS=[
  {k:"risk",t:"Risks",d:"What can go wrong, assertion by assertion.",table:"audit_risks"},
  {k:"procedure",t:"Procedures",d:"Tests of controls, analytics and tests of details.",table:"audit_procedures"},
  {k:"standard",t:"Standards",d:"ISA/ISQM as adopted in Pakistan, plus the ethics code.",table:"standards"},
  {k:"industry",t:"Industries",d:"Sector risk profiles with Pakistan regulation.",table:"industries"},
  {k:"case",t:"Case studies",d:"Real audit failures — facts separated from allegations.",table:"case_studies"},
  {k:"fraud",t:"Fraud patterns",d:"How schemes work, red flags, how to detect them.",table:"fraud_patterns"},
  {k:"knowledge",t:"Knowledge",d:"Companies Act provisions, ethics structure, tax index.",table:"knowledge_records"},
  {k:"programme",t:"Programmes",d:"Full audit programmes per cycle.",table:"audit_programmes"},
  {k:"template",t:"Templates",d:"Working-paper templates, ready to adapt.",table:"working_paper_templates"},
];
function vHome(){
  const counts=Object.fromEntries(COLLECTIONS.map(c=>[c.k,(DB[c.table]||[]).length]));
  const stats=[["audit_risks","risks","risk"],["audit_procedures","procedures","procedure"],["standards","standards","standard"],
    ["industries","industries","industry"],["case_studies","case studies","case"],["fraud_patterns","fraud patterns","fraud"]]
    .map(([t,l,k])=>`<a class="stat" href="#/browse/${k}" aria-label="Browse ${l}"><b data-count="${DB[t].length}">0</b><span>${l}</span></a>`).join("");
  app.innerHTML=`
  <section class="hero" aria-labelledby="hero-h">
    <p class="eyebrow">CA Audit Intelligence · Interactive knowledge base</p>
    <h1 id="hero-h">Every audit question, <em>traceable</em> to its source.</h1>
    <p class="lede">Risks, procedures, standards, industries, fraud patterns and real case studies —
    linked into one explorable system. Suggested links are labelled; verified facts are sourced.</p>
    <form class="hero-search" role="search" id="heroForm" aria-label="Search the knowledge base">
      <input type="search" id="hq" placeholder="Try “revenue cut-off”, “fictitious revenue”, “ISA 240”…" aria-label="Search the knowledge base" autocomplete="off">
      <button type="submit">Search</button>
    </form>
    <div class="chips" role="group" aria-label="Example searches">
      ${["revenue cut-off","bank confirmations","fictitious revenue","ISA 240","inventory count","management override"].map(q=>`<button data-q="${esc(q)}">${esc(q)}</button>`).join("")}
    </div>
  </section>
  <div class="stats" aria-label="Knowledge base statistics">${stats}</div>
  <div class="section-head"><h2>Browse the collections</h2><p>Start anywhere — everything is linked.</p></div>
  <div class="card-grid">
    ${COLLECTIONS.map(c=>`<a class="card" href="#/browse/${c.k}"><span class="k">${esc(c.t)}</span><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p><span class="count">${counts[c.k]} records</span></a>`).join("")}
  </div>
  <div class="trust">
    <h2>Built to be trusted, not just searched</h2>
    <p>Every record carries a verification status and a source. Mappings labelled <em>suggested</em> are professional associations — never requirements.</p>
    <div class="legend">${VS_BADGE("authoritative")+VS_BADGE("public_record")+VS_BADGE("internal_review")}<span class="badge b-sugg">● suggested mapping</span></div>
  </div>`;
  $("#heroForm").addEventListener("submit",e=>{e.preventDefault();const q=$("#hq").value.trim();location.hash="#/search"+(q?"?q="+encodeURIComponent(q):"");});
  $$(".chips button").forEach(b=>b.addEventListener("click",()=>{location.hash="#/search?q="+encodeURIComponent(b.dataset.q);}));
  // animated counters
  $$("[data-count]").forEach(el=>{
    const target=+el.dataset.count, t0=performance.now(), dur=900;
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced){el.textContent=target;return;}
    (function tick(t){const p=Math.min(1,(t-t0)/dur);el.textContent=Math.round(target*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(tick);})(t0);
  });
}

/* ---------- views: search ---------- */
const TYPE_FILTERS=[["","All"],["risk","Risks"],["procedure","Procedures"],["standard","Standards"],
  ["knowledge","Knowledge"],["case","Cases"],["fraud","Fraud"],["industry","Industries"],["control","Controls"],["evidence","Evidence"]];
function snippet(text,q){
  const terms=tok(q).filter(t=>t.length>2);
  let s=text.replace(/\s+/g," ").trim();
  let idx=-1; for(const t of terms){const i=s.toLowerCase().indexOf(t);if(i>=0&&(idx<0||i<idx))idx=i;}
  if(idx>60) s="…"+s.slice(idx-60); s=s.slice(0,260);
  for(const t of terms){ s=s.replace(new RegExp("("+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","ig"),"<mark>$1</mark>"); }
  return s;
}
function vSearch(q,type){
  q=q||"";type=type||"";
  app.innerHTML=`
  <div class="searchbar"><div class="row" role="search">
    <input type="search" id="q" value="${esc(q)}" placeholder="Search risks, procedures, standards, cases…" aria-label="Search query" autocomplete="off">
  </div>
  <div class="fchips" role="group" aria-label="Filter by type">
    ${TYPE_FILTERS.map(([v,l])=>`<button data-t="${v}" aria-pressed="${String(v===type)}">${l}</button>`).join("")}
  </div></div>
  <div id="resWrap" aria-live="polite"></div>`;
  const input=$("#q");
  const render=()=>{
    const query=input.value.trim(), tf=$('.fchips button[aria-pressed="true"]').dataset.t;
    const wrap=$("#resWrap");
    if(!query){wrap.innerHTML=`<div class="noresults"><h2>Ask the knowledge base</h2><p>Type above — synonyms like <em>debtors</em> for receivables work automatically.</p></div>`;return;}
    const hits=searchDocs(query,tf||"",40);
    history.replaceState(null,"","#/search?q="+encodeURIComponent(query)+(tf?"&type="+tf:""));
    if(!hits.length){wrap.innerHTML=`<div class="noresults"><h2>No results for “${esc(query)}”</h2><p>Try fewer words, a synonym, or browse a collection below.</p><p><a class="btn btn-ghost" href="#/browse">Browse collections</a></p></div>`;return;}
    wrap.innerHTML=`<p class="page-sub" role="status">${hits.length} result${hits.length>1?"s":""} for “${esc(query)}”</p>
    <ul class="results">${hits.map(({d})=>{
      const row=(DB[TYPES[d.type].table]||[]).find(r=>r.id===d.id)||{};
      const vs=row.verification_status||"";
      return `<li class="result"><span class="badge b-type">${TYPES[d.type].label}</span>
        <a class="rt" href="#/r/${d.type}/${encodeURIComponent(d.id)}">${esc(d.title)}</a>
        <p class="snip">${snippet(d.text,query)}</p>
        <div class="meta">${VS_BADGE(vs)}<span class="badge b-id">${esc(d.id)}</span></div></li>`;}).join("")}</ul>`;
  };
  let deb; input.addEventListener("input",()=>{clearTimeout(deb);deb=setTimeout(render,160);});
  input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();render();}});
  $$(".fchips button").forEach(b=>b.addEventListener("click",()=>{
    $$(".fchips button").forEach(x=>x.setAttribute("aria-pressed","false"));
    b.setAttribute("aria-pressed","true");render();input.focus();
  }));
  render(); input.focus();
}

/* ---------- views: record ---------- */
function metaRows(type,row){
  const M=[];
  const add=(k,v)=>{if(v)M.push([k,v]);};
  add("Record ID",`<code>${esc(row.id)}</code>`);
  if(row.audit_area_id)add("Audit area",`${esc(row.audit_area_id)} — ${esc(areaName(row.audit_area_id))}`);
  if(row.verification_status)add("Verification",esc(String(row.verification_status).replace(/_/g," ")));
  if(row.sources)add("Sources",esc(String(row.sources).slice(0,220)));
  if(row.source_ref)add("Source",esc(String(row.source_ref).slice(0,180)));
  if(row.source_url)add("Official source",`<a href="${esc(row.source_url)}" target="_blank" rel="noopener">publisher link ↗</a>`);
  if(row.jurisdiction)add("Jurisdiction",esc(row.jurisdiction));
  if(row.section_ref)add("Section",esc(row.section_ref));
  if(row.authority_class)add("Authority class",esc(row.authority_class));
  if(row.procedure_type)add("Procedure type",esc(row.procedure_type));
  if(row.status)add("Status",esc(row.status));
  if(row.standard_set)add("Set",esc(row.standard_set));
  if(row.code)add("Code",esc(row.code));
  if(row.industry&&type!=="industry")add("Industry",esc(row.industry));
  if(row.record_type)add("Record type",esc(row.record_type));
  if(row.category)add("Category",esc(row.category));
  if(row.last_verified)add("Last verified",esc(row.last_verified));
  return M.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join("");
}
function sectionsFor(type,row){
  const S=[];
  const sec=(h,v)=>{if(v)S.push(`<h2>${h}</h2><p>${esc(v).replace(/\n\n/g,"</p><p>")}</p>`);};
  const list=(h,arr)=>{try{const a=JSON.parse(arr||"[]");if(a.length)S.push(`<h2>${h}</h2><ul>${a.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`);}catch(e){}};
  if(type==="risk"){ sec("Description",row.description); sec("Causes",row.causes); sec("Misstatement scenario",row.misstatement_scenario); }
  else if(type==="procedure"){ sec("Description",row.description); }
  else if(type==="industry"){
    sec("Business model",row.business_model); sec("Common accounting issues",row.common_accounting_issues);
    sec("Significant inherent risks",row.significant_inherent_risks); sec("Typical controls",row.typical_controls);
    sec("Regulatory requirements",row.regulatory_requirements); sec("Notes",row.notes);
  }
  else if(type==="case"){
    sec("Background",row.background); sec("Reporting issue",row.reporting_issue);
    sec("What went wrong",row.what_went_wrong); sec("Lessons",row.lessons);
  }
  else if(type==="fraud"){
    sec("How it works",row.how_it_works); list("Red flags",row.red_flags);
    sec("Pressure",row.pressure); sec("Opportunity",row.opportunity); sec("Rationalization",row.rationalization);
  }
  else if(type==="knowledge"){
    sec("Summary",row.description); sec("Practical application",row.practical_application); sec("Limitations",row.limitations);
  }
  else if(type==="regulation"){ sec("Summary",row.summary); sec("Applicability",row.applicability_notes); }
  else if(type==="rule"){ sec("Rationale",row.rationale); }
  else { sec("Detail",bodyOf(type,row)); }
  return S.join("");
}
function vRecord(type,id){
  const c=TYPES[type];
  if(!c){app.innerHTML=`<div class="noresults"><h2>Unknown record type</h2></div>`;return;}
  const row=(DB[c.table]||[]).find(r=>String(r.id)===id);
  if(!row){app.innerHTML=`<div class="noresults"><h2>Record not found</h2><p>No ${c.label.toLowerCase()} with ID <code>${esc(id)}</code>.</p></div>`;return;}
  const title=titleOf(type,row);
  const linked=linksFor(type,id);
  const facts=(type==="case"&&row.facts_vs_allegations)?
    `<div class="facts" role="note" aria-label="Facts versus allegations"><h2>Facts vs allegations</h2><p>${esc(row.facts_vs_allegations)}</p></div>`:"";
  const mdBody=(row.body_md&&row.body_md.trim())?`<div class="prose">${md(row.body_md)}</div>`:"";
  const cite=`${title} [${row.id}] — CA Audit Intelligence Database`;
  app.innerHTML=`
  <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a> › <a href="#/browse/${type}">${c.label}s</a> › ${esc(row.id)}</nav>
  <article>
  <header class="record-head">
    <div class="badges"><span class="badge b-type">${c.label}</span>${VS_BADGE(row.verification_status)}<span class="badge b-id">${esc(row.id)}</span></div>
    <h1>${esc(title)}</h1>
  </header>
  ${facts}
  <div class="meta-table"><dl>${metaRows(type,row)}</dl></div>
  <div class="prose">${sectionsFor(type,row)}</div>
  ${mdBody}
  <div class="actions">
    <button class="btn btn-ghost" id="copyCite">⧉ Copy citation</button>
    ${type==="risk"?`<a class="btn btn-primary" href="#/chain/${encodeURIComponent(row.id)}">Explore the full chain →</a>`:""}
  </div>
  ${linked.map(s=>`
    <section class="links-sec" aria-label="${esc(s.label)}">
      <h2>${esc(s.label)}</h2><p>Linked records — click to explore.</p>
      <div class="link-cards">${s.rows.map(r=>`
        <a class="link-card" href="#/r/${r.t}/${encodeURIComponent(r.rid)}">
          <b>${esc(titleOf(r.t,r.row))}</b>
          <small><span class="badge b-id">${esc(r.rid)}</span> ${suggTag(r.mapping_type)}</small>
        </a>`).join("")}</div>
    </section>`).join("")}
  </article>`;
  $("#copyCite").addEventListener("click",async e=>{
    try{await navigator.clipboard.writeText(cite);e.target.textContent="✓ Copied";}
    catch(err){e.target.textContent="Copy failed — select manually";}
  });
  document.title=title+" — CA Audit Intelligence";
}

/* ---------- views: browse ---------- */
function vBrowse(key){
  const col=COLLECTIONS.find(c=>c.k===key);
  if(!col){ // index of collections
    app.innerHTML=`<h2 class="page-title">Browse</h2><p class="page-sub">Every collection in the knowledge base.</p>
    <div class="card-grid">${COLLECTIONS.map(c=>`<a class="card" href="#/browse/${c.k}"><span class="k">${esc(c.t)}</span><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p><span class="count">${(DB[c.table]||[]).length} records</span></a>`).join("")}</div>`;
    document.title="Browse — CA Audit Intelligence"; return;
  }
  const rows=[...(DB[col.table]||[])];
  const hasArea=rows.length&&rows[0].audit_area_id!==undefined;
  const areas=[...new Set(rows.map(r=>r.audit_area_id).filter(Boolean))];
  app.innerHTML=`
  <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a> › <a href="#/browse">Browse</a> › ${esc(col.t)}</nav>
  <h2 class="page-title">${esc(col.t)}</h2>
  <p class="page-sub">${esc(col.d)} · ${rows.length} records</p>
  ${hasArea&&areas.length>1?`<div class="fchips" role="group" aria-label="Filter by audit area">
    <button data-a="" aria-pressed="true">All areas</button>
    ${areas.map(a=>`<button data-a="${esc(a)}" aria-pressed="false">${esc(areaName(a))}</button>`).join("")}</div>`:""}
  <div class="kicker-grid" id="browseGrid"></div>`;
  const grid=$("#browseGrid");
  const paint=(f)=>{
    const list=rows.filter(r=>!f||r.audit_area_id===f);
    grid.innerHTML=list.map(r=>`
      <a class="card" href="#/r/${col.k}/${encodeURIComponent(r.id)}">
        <h3>${esc(titleOf(col.k,r))}</h3>
        <p>${esc((bodyOf(col.k,r)||"").slice(0,140))}${(bodyOf(col.k,r)||"").length>140?"…":""}</p>
        <span style="display:flex;gap:8px;flex-wrap:wrap">${VS_BADGE(r.verification_status)}<span class="badge b-id">${esc(r.id)}</span></span>
      </a>`).join("")||`<p class="page-sub">No records in this area.</p>`;
  };
  paint("");
  $$(".fchips button").forEach(b=>b.addEventListener("click",()=>{
    $$(".fchips button").forEach(x=>x.setAttribute("aria-pressed","false"));
    b.setAttribute("aria-pressed","true");paint(b.dataset.a);
  }));
  document.title=col.t+" — CA Audit Intelligence";
}

/* ---------- views: chain ---------- */
function vChain(riskId){
  const risk=(DB.audit_risks||[]).find(r=>r.id===riskId);
  if(!risk){app.innerHTML=`<div class="noresults"><h2>Risk not found</h2></div>`;return;}
  const L=Object.fromEntries(linksFor("risk",riskId).map(s=>[s.label,s.rows]));
  const step=(k,title,items,emptyNote)=>`
    <div class="chain-step"><span class="k">${k}</span><h3>${title}</h3>
    ${items&&items.length?`<ul>${items.map(r=>`<li><a href="#/r/${r.t}/${encodeURIComponent(r.rid)}">${esc(titleOf(r.t,r.row))}</a>${suggTag(r.mapping_type)}<br><small style="color:var(--muted)">${esc(r.rid)}</small></li>`).join("")}</ul>`:`<p style="color:var(--muted);font-size:14px">${emptyNote}</p>`}
    </div>`;
  app.innerHTML=`
  <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a> › <a href="#/r/risk/${encodeURIComponent(riskId)}">${esc(riskId)}</a> › Chain</nav>
  <h2 class="page-title">The chain: ${esc(risk.title)}</h2>
  <p class="page-sub">From risk factors to evidence — how one risk connects across the whole knowledge base. Links marked <span class="tag-sugg">suggested</span> are professional associations, not requirements.</p>
  <div class="chain" role="list" aria-label="Knowledge chain">
    ${step("Factors","What makes this risk possible",L["Risk factors"],"No linked factors yet.")}
    <div class="chain-step" role="listitem"><span class="k">Risk</span><h3>${esc(risk.title)}</h3><p style="font-size:14.5px;color:var(--muted)">${esc((risk.description||"").slice(0,220))}…</p></div>
    ${step("Assertions","Assertions addressed",L["Assertions"],"")}
    ${step("Controls","Controls that mitigate it",L["Controls"],"No linked controls yet.")}
    ${step("Procedures","Procedures that test it",L["Procedures"],"")}
    <div class="chain-step" role="listitem"><span class="k">Evidence</span><h3>Evidence to obtain</h3>
      <ul>${(L["Procedures"]||[]).flatMap(p=>{const pe=(DB.procedure_evidence||[]).filter(m=>m.procedure_id===p.rid);return pe.map(m=>{const e=(DB.evidence_types||[]).find(x=>x.id===m.evidence_id);return e?`<li><a href="#/r/evidence/${e.id}">${esc(e.name)}</a><br><small style="color:var(--muted)">${esc(e.id)}</small></li>`:"";});}).filter(Boolean).join("")||"<li style='color:var(--muted)'>—</li>"}</ul></div>
  </div>
  <div class="actions"><a class="btn btn-ghost" href="#/r/risk/${encodeURIComponent(riskId)}">← Back to risk</a></div>`;
  document.title="Chain: "+risk.title+" — CA Audit Intelligence";
}

/* ---------- views: library ---------- */
function vLibrary(which){
  const progs=DB.audit_programmes||[], tmpls=DB.working_paper_templates||[];
  if(which&&which.startsWith("programme-")){
    const id=which.slice(10); return vRecord("programme",id);
  }
  if(which&&which.startsWith("template-")){
    const id=which.slice(9); return vRecord("template",id);
  }
  app.innerHTML=`
  <h2 class="page-title">Library</h2>
  <p class="page-sub">Audit programmes and working-paper templates. Illustrative — adapt to the engagement; not a firm's methodology.</p>
  <div class="section-head"><h2>Audit programmes</h2><p>${progs.length} programmes</p></div>
  <div class="kicker-grid">${progs.map(p=>`<a class="card" href="#/library/programme-${esc(p.id)}"><span class="k">Programme</span><h3>${esc(p.title)}</h3><p>${esc((p.summary||"").slice(0,150))}…</p><span class="count">${esc(p.id)}</span></a>`).join("")}</div>
  <div class="section-head"><h2>Working-paper templates</h2><p>${tmpls.length} templates</p></div>
  <div class="kicker-grid">${tmpls.map(t=>`<a class="card" href="#/library/template-${esc(t.id)}"><span class="k">Template</span><h3>${esc(t.title)}</h3><p>${esc((t.objective||"").slice(0,150))}…</p><span class="count">${esc(t.id)}</span></a>`).join("")}</div>`;
  document.title="Library — CA Audit Intelligence";
}

/* ---------- views: about ---------- */
function vAbout(){
  const lims=DB.known_limitations||[];
  app.innerHTML=`
  <h2 class="page-title">About this knowledge base</h2>
  <p class="page-sub">What it is, how to trust it, and where its limits are.</p>
  <div class="prose">
  <h2>What it is</h2>
  <p>A personal, offline-first audit knowledge system built for a CA student — useful through
  articleship and beyond. It links risks → assertions → controls → procedures → evidence → standards
  into explorable chains, alongside industries, fraud patterns, real case studies, programmes and templates.</p>
  <h2>How verification works</h2>
  <ul class="about-list">
    <li><strong>Authoritative / official guidance</strong> — from official sources (legislation, adopted standards).</li>
    <li><strong>Public record</strong> — case-study facts established in public proceedings and filings.</li>
    <li><strong>Internal review</strong> — project content reviewed during the build; guidance, not authority.</li>
    <li><strong>Suggested</strong> — mapping labels on professional associations; never requirements.</li>
  </ul>
  <h2>Known limitations</h2>
  <ul class="about-list">${lims.map(l=>`<li><strong>[${esc(l.status)}] ${esc(l.area)}</strong> — ${esc(l.description)}</li>`).join("")}</ul>
  <div class="notice"><strong>Student-level framing:</strong> this system explains and connects; it never poses as a
  qualified auditor's judgement, a firm's methodology, or a substitute for the ISAs.</div>
  </div>`;
  document.title="About — CA Audit Intelligence";
}

/* ---------- boot ---------- */
async function boot(){
  const fill=$("#loaderFill"), count=$("#loaderCount");
  let done=0;
  const jobs=TABLES.map(t=>fetch("data/"+t+".json").then(r=>{if(!r.ok)throw new Error(t+" "+r.status);return r.json();})
    .then(j=>{DB[t]=j;done++;fill.style.width=Math.round(done/TABLES.length*100)+"%";count.textContent=done+" / "+TABLES.length+" collections";}));
  try{ await Promise.all(jobs); }
  catch(e){ count.textContent="Failed to load data: "+e.message; return; }
  buildIndex();
  $("#loader").classList.add("done");
  setTimeout(()=>$("#loader").remove(),500);
  route();
}
document.addEventListener("DOMContentLoaded",boot);
