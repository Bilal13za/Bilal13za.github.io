#!/usr/bin/env python3
"""Headless-Chromium test suite for the BIA Intelligence web UI.

Serves via file:// with Playwright route interception for data/*.json
(the sandbox blocks localhost navigation in Chromium).
"""
import re
from playwright.sync_api import sync_playwright

WEB = "/home/hatch/workspace/bia-intelligence/web"
BASE = "file://" + WEB + "/index.html"
fails = []

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f" [{extra}]" if extra else ""))
    if not cond:
        fails.append(name)

def serve_data(route):
    # Strict: serve the EXACT requested filename so a wrong URL (e.g. a
    # doubled ".json.json") fails loudly instead of being papered over.
    m = re.search(r"data/([^?#]+)", route.request.url)
    p = WEB + "/data/" + m.group(1)
    try:
        route.fulfill(path=p, content_type="application/json")
    except Exception:
        route.abort()

# --- copyright: tax web data must contain no >20-word verbatim ICAP runs ---
# Pure-python mirror of scripts/export_web_data.py's 21-word shingle gate
# (the tax companion is paraphrase-only; runs without a browser).
import json as _json, glob as _glob
from hashlib import blake2b as _b2
def _norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", str(s).lower())).strip()
_src_shingles = set()
for _f in _glob.glob("/home/hatch/workspace/bia-intelligence/data/extracted/*.txt") + \
           _glob.glob("/home/hatch/workspace/bia-intelligence/data/portal-tax/extracted/*.txt"):
    _w = _norm(open(_f, encoding="utf-8", errors="replace").read()).split()
    for _i in range(len(_w) - 21 + 1):
        _src_shingles.add(_b2(" ".join(_w[_i:_i+21]).encode()).digest())
def _strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for _v in o.values():
            yield from _strings(_v)
    elif isinstance(o, list):
        for _v in o:
            yield from _strings(_v)
_viol = []
for _f in sorted(_glob.glob(WEB + "/data/tax_*.json")):
    for _s in _strings(_json.load(open(_f, encoding="utf-8"))):
        _w = _norm(_s).split()
        for _i in range(len(_w) - 21 + 1):
            if _b2(" ".join(_w[_i:_i+21]).encode()).digest() in _src_shingles:
                _viol.append((_f, " ".join(_w[_i:_i+12])))
                break
        if _viol:
            break
    if _viol:
        break
check("tax copyright shingles", not _viol,
      str(_viol[:2]) if _viol else "no >20-word verbatim runs")
# structural: tax question records carry no verbatim/original-text fields
_tq = _json.load(open(WEB + "/data/tax_questions.json", encoding="utf-8"))
check("tax questions paraphrase-only",
      all("verbatim" not in q and "original_text" not in q for q in _tq),
      f"{len(_tq)} records")
check("tax questions flagged",
      all(q.get("wording") == "paraphrased" for q in _tq))
_tp = _json.load(open(WEB + "/data/tax_practice.json", encoding="utf-8"))
check("practice labeled generated",
      all(q.get("kind") == "generated" and "NOT an ICAP question" in q.get("origin_label", "")
          for q in _tp),
      f"{len(_tp)} records")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/meta-chromium/chrome",
                          args=["--no-sandbox", "--no-proxy-server"])
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.route("**/data/*", serve_data)
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE)
    pg.wait_for_selector("#loader.done", timeout=20000)
    pg.wait_for_timeout(600)

    # --- home ---
    check("home hero", pg.is_visible(".hero h1"))
    check("example chips", pg.eval_on_selector_all("[data-chip]", "e=>e.length") >= 5)
    check("4 stat cards", pg.eval_on_selector_all("a.stat", "e=>e.length") == 4)
    check("stat counts > 0", pg.eval_on_selector_all("a.stat b", "els=>els.every(e=>+e.textContent>0)"))
    check("next-up panel", pg.is_visible(".nextup"))
    check("predecessor note", "CAF-6 Managerial and Financial Analysis" in pg.inner_text("#app"))
    check("skip link", pg.eval_on_selector(".skip", "e=>e.textContent.includes('Skip')"))

    # hero search
    pg.fill("#hq", "WACC")
    pg.click(".hero-search button")
    pg.wait_for_timeout(900)
    check("hero search results", pg.eval_on_selector_all(".result", "e=>e.length") > 2)
    check("aria-live status", pg.is_visible('[role="status"]'))

    # stat tap -> questions
    pg.goto(BASE + "#/")
    pg.wait_for_timeout(500)
    pg.click('a.stat[href="#/questions"]')
    pg.wait_for_timeout(600)
    check("stat tap -> questions", pg.eval_on_selector_all("#qGrid .result", "e=>e.length") > 50)

    # --- syllabus ---
    pg.goto(BASE + "#/syllabus")
    pg.wait_for_timeout(500)
    check("4 area cards", pg.eval_on_selector_all(".card-grid .card", "e=>e.length") == 4)
    check("removed list", "data systems" in pg.inner_text("#app").lower())
    pg.click('.card-grid .card[href="#/syllabus/D"]')
    pg.wait_for_timeout(500)
    body = pg.inner_text("#app")
    check("area D LOs", "D.1" in body and "D.3" in body)
    check("NEW badges", pg.eval_on_selector_all(".b-new", "e=>e.length") >= 3)

    # --- topic summaries ---
    for area in ["A", "B", "C", "D"]:
        pg.goto(BASE + "#/syllabus/" + area)
        pg.wait_for_timeout(400)
        check(f"summary card area {area}", pg.is_visible(".sumcard"))
    check("summary key points", pg.eval_on_selector_all(".sumcard li", "e=>e.length") >= 5)
    check("how examined line", "examined" in pg.inner_text(".sumcard").lower())
    check("own-teaching badge", "own teaching" in pg.inner_text(".sumcard").lower())
    pg.goto(BASE + "#/revision?topic=CAF7-TOP-KR")
    pg.wait_for_timeout(500)
    check("revision summary (KR)", pg.is_visible(".sumcard"))

    # --- questions: filters ---
    pg.goto(BASE + "#/questions")
    pg.wait_for_timeout(500)
    n_all = pg.eval_on_selector_all("#qGrid .result", "e=>e.length")
    pg.select_option('select[name="type"]', "MCQ")
    pg.wait_for_timeout(700)
    n_mcq = pg.eval_on_selector_all("#qGrid .result", "e=>e.length")
    check("MCQ filter reduces", 0 < n_mcq < n_all, f"{n_mcq}/{n_all}")
    check("MCQ badges", pg.eval_on_selector_all("#qGrid .b-type", "els=>els.every(e=>e.textContent==='MCQ')"))

    # --- question detail ---
    pg.goto(BASE + "#/q/BIA-Q-2022A-01i")
    pg.wait_for_timeout(600)
    qbody = pg.inner_text("#app")
    check("question meta", "Autumn 2022" in qbody and "1 mark" in qbody)
    check("difficulty estimate badge", "est." in qbody)
    check("checklist items", pg.eval_on_selector_all("#ckl li", "e=>e.length") >= 3)
    # checklist persistence
    pg.check('#ckl input[data-i="0"]')
    pg.wait_for_timeout(300)
    pg.reload()
    pg.wait_for_selector("#loader.done", timeout=20000)
    pg.wait_for_timeout(600)
    check("checklist persists", pg.is_checked('#ckl input[data-i="0"]'))
    # attempted toggle persists
    pg.click("#attBtn")
    pg.wait_for_timeout(400)
    check("attempted badge", "attempted" in pg.inner_text("#app").lower())
    pg.goto(BASE + "#/questions?att=done")
    pg.wait_for_timeout(600)
    check("attempted filter finds it", pg.eval_on_selector_all("#qGrid .result", "e=>e.length") >= 1)

    # --- examiner ---
    pg.goto(BASE + "#/examiner")
    pg.wait_for_timeout(500)
    check("14 guides", pg.eval_on_selector_all(".card-grid .card", "e=>e.length") == 14)
    pg.fill("#q", "application")
    pg.wait_for_timeout(1200)
    n_obs = pg.eval_on_selector_all(".results .result", "e=>e.length")
    check("examiner search results", n_obs > 5, f"{n_obs}")
    pg.goto(BASE + "#/g/BIA-M-001")
    pg.wait_for_timeout(500)
    gbody = pg.inner_text("#app")
    check("guide sections", all(s in gbody for s in ["Why candidates make it", "Prevention checklist"]))

    # --- revision ---
    pg.goto(BASE + "#/revision")
    pg.wait_for_timeout(500)
    check("depth tabs", pg.eval_on_selector_all(".dtabs button", "e=>e.length") == 3)
    check("quick note renders", len(pg.inner_text(".prose")) > 200)
    pg.click('.dtabs button[data-depth="mastery"]')
    pg.wait_for_timeout(500)
    check("mastery tab switches", pg.eval_on_selector('.dtabs button[data-depth="mastery"]', "e=>e.getAttribute('aria-pressed')") == "true")

    # flashcards: flip + SM-2 grade persists
    pg.goto(BASE + "#/revision/cards")
    pg.wait_for_timeout(600)
    check("flashcard renders", pg.is_visible("#fcard"))
    pg.click("#fcard")
    pg.wait_for_timeout(300)
    check("card flips", pg.eval_on_selector("#fcard", "e=>e.classList.contains('flipped')"))
    check("grade buttons", pg.eval_on_selector_all("#grades button", "e=>e.length") == 4)
    pg.click('#grades button[data-q="4"]')
    pg.wait_for_timeout(400)
    sm2n = pg.evaluate("()=>{try{return Object.keys(JSON.parse(localStorage.getItem('biaWeb.v1')).sm2).length}catch(e){return -1}}")
    check("SM-2 saved", sm2n >= 1, f"{sm2n}")

    # --- about ---
    pg.goto(BASE + "#/about")
    pg.wait_for_timeout(500)
    abody = pg.inner_text("#app")
    check("limitations listed", "Data policy" in abody)
    check("desktop app note", "desktop" in abody.lower())
    check("verification legend", pg.eval_on_selector_all(".b-auth, .b-pred, .b-diff", "e=>e.length") >= 3)

    # --- keyboard + layout + nav ---
    pg.goto(BASE + "#/")
    pg.wait_for_timeout(500)
    pg.keyboard.press("/")
    pg.wait_for_timeout(400)
    check("/ focuses search", pg.evaluate("document.activeElement && document.activeElement.id") == "hq")
    check("no h-overflow", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth+1"))
    pg.goto(BASE + "#/syllabus")
    pg.wait_for_timeout(500)
    check("nav aria-current", pg.eval_on_selector('.site-nav a[aria-current="page"]', "e=>e.textContent.trim()") == "Syllabus")

    # --- verbatim question wording ---
    pg.goto(BASE + "#/q/BIA-Q-2022A-01i")
    pg.wait_for_timeout(600)
    check("verbatim block", pg.is_visible(".verbatim"))
    vlen = pg.eval_on_selector(".verbatim", "e=>e.innerText.length")
    check("verbatim substantive", vlen > 120, f"{vlen} chars")
    check("verbatim badge", "verbatim" in pg.inner_text("#app").lower())

    # --- mocks ---
    pg.goto(BASE + "#/mocks")
    pg.wait_for_timeout(600)
    check("9 mock sessions", pg.eval_on_selector_all(".card-grid .card", "e=>e.length") == 9)
    check("mocks nav", pg.eval_on_selector('.site-nav a[aria-current="page"]', "e=>e.textContent.trim()") == "Mocks")
    pg.click('.card-grid .card:first-child .btn')
    pg.wait_for_timeout(600)
    check("mock setup page", pg.is_visible("#mockForm"))
    check("default 195 min", pg.eval_on_selector("#mockDur", "e=>e.value") == "195")
    check("setup lists questions", pg.eval_on_selector_all(".results .result", "e=>e.length") >= 8)
    pg.click('#mockForm button[type="submit"]')
    pg.wait_for_timeout(900)
    check("mock timer visible", pg.is_visible("#mockClock"))
    check("mock navigator", pg.eval_on_selector_all(".mock-nav button", "e=>e.length") >= 8)
    check("mock question verbatim", pg.is_visible("#mockQ .verbatim"))
    check("mock textarea", pg.is_visible("#mockAnswer"))
    # autosave + restore across reload
    pg.fill("#mockAnswer", "Test answer on WACC and risk")
    pg.wait_for_timeout(1000)
    pg.reload()
    pg.wait_for_selector("#loader.done", timeout=20000)
    pg.wait_for_timeout(900)
    check("mock answer restored", pg.eval_on_selector("#mockAnswer", "e=>e.value") == "Test answer on WACC and risk")
    # timer ticks
    t1 = pg.inner_text("#mockClock")
    pg.wait_for_timeout(2300)
    t2 = pg.inner_text("#mockClock")
    check("timer ticks", t1 != t2, f"{t1} -> {t2}")
    # navigator answered dot
    check("navigator answered dot", pg.eval_on_selector('.mock-nav button.cur i', "e=>e.textContent") == "●")
    # jump to next question
    pg.click('.mock-nav button[data-jump="1"]')
    pg.wait_for_timeout(500)
    check("navigator jumps", "Question 2 of" in pg.inner_text("#app"))
    # force auto-submit via localStorage (endsAt -> ~1s away)
    pg.evaluate("()=>{const k='biaWeb.v1';const s=JSON.parse(localStorage.getItem(k));s.mocks.active.endsAt=Date.now()+1200;localStorage.setItem(k,JSON.stringify(s));}")
    pg.reload()
    pg.wait_for_selector("#loader.done", timeout=20000)
    pg.wait_for_timeout(4000)
    check("auto-submit to review", "self-marking review" in pg.inner_text("#app").lower())
    check("review checklists", pg.eval_on_selector_all(".review-ckl", "e=>e.length") >= 1)
    check("review honesty note", "not examiner marking" in pg.inner_text("#app").lower())
    # save mock result -> history (fill a valid score: first question's max may be < 5)
    pg.fill(".review-score >> nth=0", "1")
    pg.click('#reviewForm button[type="submit"]')
    pg.wait_for_timeout(800)
    check("mock history entry", "Past mocks" in pg.inner_text("#app"))
    check("history self-score", "self-score" in pg.inner_text("#app").lower())

    # --- tax: CAF-2 Taxation companion (paraphrase-only) ---
    pg.goto(BASE + "#/tax")
    pg.wait_for_timeout(600)
    check("tax nav", pg.eval_on_selector('.site-nav a[aria-current="page"]', "e=>e.textContent.trim()") == "Taxation")
    tbody = pg.inner_text("#app")
    check("tax home hero", "taxation: principles and compliance" in tbody.lower())
    check("tax 10 cards", pg.eval_on_selector_all(".card-grid .card", "e=>e.length") == 10)
    check("tax paraphrase notice", "Paraphrase-only" in tbody)
    check("tax examinable edition", "Sep-26" in tbody)

    pg.goto(BASE + "#/tax/topics")
    pg.wait_for_timeout(500)
    check("tax 9 topics", pg.eval_on_selector_all('.card[href^="#/tax/topic/"]', "e=>e.length") == 9)
    pg.select_option("#taxAreaF", "B")
    pg.wait_for_timeout(700)
    check("tax area filter", pg.eval_on_selector_all('.card[href^="#/tax/topic/"]', "e=>e.length") == 2)
    pg.goto(BASE + "#/tax/topic/TAX-T-B2")
    pg.wait_for_timeout(500)
    tbody = pg.inner_text("#app")
    check("tax topic summary", "Chargeability and Computation" in tbody)
    check("tax topic key points", "Key points" in tbody)
    check("tax own-teaching badge", "own teaching" in tbody.lower())

    pg.goto(BASE + "#/tax/questions")
    pg.wait_for_timeout(500)
    n_tax = pg.eval_on_selector_all("#taxQGrid .result", "e=>e.length")
    check("tax question summaries", n_tax >= 100, f"{n_tax}")
    pg.select_option('select[name="type"]', "MCQ")
    pg.wait_for_timeout(700)
    n_mcq = pg.eval_on_selector_all("#taxQGrid .result", "e=>e.length")
    check("tax MCQ filter", 0 < n_mcq < n_tax, f"{n_mcq}/{n_tax}")
    pg.goto(BASE + "#/tax/questions/TAX-Q-2026S-01i")
    pg.wait_for_timeout(500)
    qbody = pg.inner_text("#app")
    check("tax question paraphrase note", "paraphrased" in qbody.lower())
    check("tax question no verbatim", pg.eval_on_selector_all("#app .verbatim", "e=>e.length") == 0)
    check("tax question meta", "Spring 2026" in qbody and "tax year" in qbody.lower())
    pg.click("#taxAttBtn")
    pg.wait_for_timeout(400)
    check("tax attempted persists", pg.evaluate("()=>{try{return !!JSON.parse(localStorage.getItem('biaWeb.v1')).tax.attempted['TAX-Q-2026S-01i']}catch(e){return false}}"))

    pg.goto(BASE + "#/tax/legislation")
    pg.wait_for_timeout(500)
    check("legislation entries", pg.eval_on_selector_all(".results .result", "e=>e.length") > 50)
    lbody = pg.inner_text("#app")
    check("verification badges", "authoritative" in lbody or "official guidance" in lbody)
    check("verification key", "Verification key" in lbody)
    pg.click('.dtabs button[data-tab="rates"]')
    pg.wait_for_timeout(600)
    check("rate tables tab", "slab" in pg.inner_text("#app").lower())

    pg.goto(BASE + "#/tax/examiner")
    pg.wait_for_timeout(500)
    check("tax examiner categories", pg.eval_on_selector_all(".section-head h2", "e=>e.length") >= 5)
    check("tax examiner paraphrase note", "Paraphrased" in pg.inner_text("#app"))
    pg.fill("#q", "income")
    pg.wait_for_timeout(1400)
    check("tax examiner search", pg.eval_on_selector_all(".results .result", "e=>e.length") >= 5)

    pg.goto(BASE + "#/tax/practice")
    pg.wait_for_timeout(500)
    check("tax 20 practice cards", pg.eval_on_selector_all('.card[href^="#/tax/practice/"]', "e=>e.length") == 20)
    check("practice not-ICAP label", "Not ICAP questions" in pg.inner_text("#app"))
    pg.goto(BASE + "#/tax/practice/TAX-PQ-001")
    pg.wait_for_timeout(500)
    pbody = pg.inner_text("#app")
    check("practice generated badge", "not an ICAP question" in pbody)
    check("practice rubric", "Marking rubric" in pbody)
    check("practice model approach", "Model approach" in pbody)

    pg.goto(BASE + "#/tax/tax-year")
    pg.wait_for_timeout(500)
    ybody = pg.inner_text("#app")
    check("tax-year explainer", "Tax years" in ybody)
    check("tax-year inference caveat", "inference" in ybody.lower())
    check("tax-year Sep-26", "Sep-26" in ybody)

    # global search reaches tax content
    pg.goto(BASE + "#/search?q=sales%20tax")
    pg.wait_for_timeout(900)
    check("search finds tax docs", "Tax" in pg.inner_text("#app"))

    b.close()

print("console errors:", errors if errors else "none")
real_errors = [e for e in errors if "fonts.g" not in e and "ERR_SSL_PROTOCOL_ERROR" not in e]
if real_errors:
    fails.append("console errors")
print("\n%d FAILURES" % len(fails) if fails else "\nALL GREEN")
raise SystemExit(1 if fails else 0)
