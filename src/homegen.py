from pathlib import Path
from html import escape
import json
from bot_widget import bot_widget_markup

ROOT = Path(__file__).resolve().parents[1]
units = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((ROOT/"src"/"content").glob("unit-*.json"))]
question_bank = json.loads((ROOT/"knowledge"/"dbms"/"question_bank.json").read_text(encoding="utf-8"))["items"]
cards = ""
important_cards = ""
important_dialogs = ""
for u in units:
    cards += f"""<a class="unit-card" href="units/unit-{u['n']:02d}.html" style="--accent:var(--{u['accent']})">
      <div class="unit-top"><span>UNIT {u['n']:02d}</span><span class="unit-number">{u['n']:02d}</span></div>
      <div><h3>{escape(u['title'])}</h3><p>{escape(u['deck'])}</p></div>
      <div class="unit-bottom"><span>4 lesson pages · full topic map</span><span class="topic-arrow" aria-hidden="true">↗</span></div>
    </a>"""
    unit_number = u["n"]
    part_a = sorted((item for item in question_bank if item["unit"] == unit_number and item["part"] == "A"), key=lambda item: item["number"])
    part_b = sorted((item for item in question_bank if item["unit"] == unit_number and item["part"] == "B"), key=lambda item: item["number"])
    dialog_id = f"important-unit-{unit_number:02d}"
    important_cards += f'''<button class="important-unit-card" type="button" data-important-open="{dialog_id}" aria-haspopup="dialog" aria-controls="{dialog_id}" style="--accent:var(--{u['accent']})">
      <span class="important-card-top">UNIT {unit_number:02d}<b aria-hidden="true">↗</b></span>
      <strong>Unit {unit_number} Important Questions</strong>
      <span class="important-card-counts"><span>Part A <b>{len(part_a)}</b></span><span>Part B <b>{len(part_b)}</b></span></span>
    </button>'''
    list_a = "".join(f'<li value="{item["number"]}"><span class="important-question-text">{escape(item["text"])}</span><button class="important-ask-button" type="button" data-qno-question-id="{escape(item["id"], quote=True)}" aria-label="Ask Qno to answer Part A question {item["number"]}">Ask Qno <span aria-hidden="true">↗</span></button></li>' for item in part_a)
    list_b = "".join(f'<li value="{item["number"]}"><span class="important-question-text">{escape(item["text"])}</span><button class="important-ask-button" type="button" data-qno-question-id="{escape(item["id"], quote=True)}" aria-label="Ask Qno to answer Part B question {item["number"]}">Ask Qno <span aria-hidden="true">↗</span></button></li>' for item in part_b)
    important_dialogs += f'''<dialog class="important-dialog" id="{dialog_id}" aria-labelledby="{dialog_id}-title">
      <div class="important-dialog-frame">
        <header class="important-dialog-header"><div><span class="eyebrow"><span class="eyebrow-line"></span>UNIT {unit_number:02d}</span><h2 id="{dialog_id}-title">Unit {unit_number} Important Questions</h2></div><button class="important-close" type="button" data-important-close aria-label="Close important questions">×</button></header>
        <div class="important-dialog-content">
          <section class="important-part" id="{dialog_id}-part-a"><h3>Part A</h3><ol class="important-question-list">{list_a}</ol></section>
          <section class="important-part" id="{dialog_id}-part-b"><h3>Part B</h3><ol class="important-question-list">{list_b}</ol></section>
        </div>
      </div>
    </dialog>'''

home = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f2eb"><meta name="description" content="A clear, interactive DBMS study guide with six units, separate lesson pages, worked examples, and colorful diagrams."><title>DBMS Field Guide · Understand databases</title><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/bot.css"></head>
<body class="home-page">
<header class="site-header" id="top"><a class="brand" href="index.html" aria-label="DBMS Field Guide home"><span class="brand-mark">D</span><span>DBMS <small>FIELD GUIDE</small></span></a><nav class="main-nav" aria-label="Main navigation"><a href="#units">Learning path</a><a href="#important-questions">Important questions</a><a href="#approach">How to study</a><a href="#exam-map">Exam map</a><a class="header-button" href="#units">Explore units <b>↘</b></a></nav></header>
<main>
  <section class="wrap hero">
    <div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span>A clearer way into databases</div><h1>Understand how data is <span>organized and used.</span></h1><p><strong>What is a DBMS?</strong> It is software that helps people store, find, change, and protect shared data. Learn the ideas in plain language, then work through examples one step at a time.</p><div class="hero-actions"><a class="button-primary" href="#units">Start with a unit <b>↘</b></a><a class="button-secondary" href="#exam-map">See recurring exam topics</a></div><div class="hero-notes"><span><i></i>Study in any order</span><span><i></i>No student account</span><span><i></i>Gemini-powered Qno tutor</span></div></div>
    <div class="hero-visual" role="img" aria-label="Animated three-dimensional illustration of a DBMS organizing shared records and answering a query">
      <div class="hero-stamp">A DATABASE, MADE CLEAR</div>
      <div class="art-board"><div class="art-eyebrow">DATA · RULES · ACCESS</div><div class="art-orbit"></div>
        <div class="data-stack"><div class="stack-layer layer-top"><span>DBMS</span></div><div class="stack-layer layer-mid"><span>organized records</span></div><div class="stack-layer layer-low"><span>shared data</span></div></div>
        <div class="art-table"><b>STUDENT</b><span>sid&nbsp;&nbsp; name</span><span>21&nbsp;&nbsp;&nbsp; Mina</span><span>22&nbsp;&nbsp;&nbsp; Arjun</span></div>
        <div class="art-query"><i>SELECT</i><strong>name</strong><small>WHERE sid = 21</small></div>
        <div class="art-caption"><strong>One system manages many useful views.</strong><span>Structure → query → answer</span></div>
      </div>
    </div>
  </section>
  <section class="wrap course-strip"><strong>One connected path through the subject.</strong><div class="strip-stats"><span><b>06</b> study units</span><span><b>24</b> separate lesson pages</span><span><b>24</b> detailed worked examples</span></div></section>
  <section class="wrap units-section" id="units"><div class="section-head"><div><div class="eyebrow"><span class="eyebrow-line"></span>Choose where to begin</div><h2>Six units. Every syllabus topic has a lesson.</h2></div><p>Open a unit for its four lessons and complete linked topic map. Each topic has a plain definition, a clear explanation, an example, and a diagram where it helps.</p></div><div class="unit-grid">{cards}</div></section>
  <section class="wrap important-section" id="important-questions"><div class="section-head"><div><div class="eyebrow"><span class="eyebrow-line"></span>Question bank · Unit-wise</div><h2>Important Questions</h2></div><p>Choose a unit to view every question from the DBMS Important Questions PDF, separated into Part A and Part B. Questions only; no answers.</p></div><div class="important-unit-grid">{important_cards}</div></section>
  <section class="exam-section" id="exam-map"><div class="wrap exam-layout"><div class="exam-copy"><div class="eyebrow"><span class="eyebrow-line"></span>Aligned to your syllabus</div><h2>Follow every unit from its foundations to its exam concepts.</h2><p>The six topic maps follow the official syllabus image and connect each named concept to its lesson explanation. The unit-wise Important Questions PDF provides the exam question list.</p></div><div class="exam-list"><div class="exam-item"><b>01</b><span>DBMS structure, file-system comparison, and ER design</span></div><div class="exam-item"><b>02</b><span>Relational model, integrity, algebra, calculus, and views</span></div><div class="exam-item"><b>03</b><span>Schema refinement, normal forms, and decomposition</span></div><div class="exam-item"><b>04</b><span>Transactions, serializability, and recoverability</span></div><div class="exam-item"><b>05</b><span>Locking, timestamps, validation, recovery, and buffers</span></div><div class="exam-item"><b>06</b><span>External storage, file organization, and indexing</span></div><div class="exam-note"><strong>Coverage:</strong> each unit page now lists every lesson topic and links directly to its explanation.</div></div></div></section>
  <section class="wrap how-section" id="approach"><div class="eyebrow"><span class="eyebrow-line"></span>How to study a lesson</div><div class="section-head"><h2>Start with the meaning. Then use the idea.</h2><p>Each lesson is its own page. Topics are named directly, explanations define the terms, and diagrams appear beside the idea they clarify.</p></div><div class="how-grid"><article class="how-card"><div class="count">01</div><h3>Read the plain definition</h3><p>See what the term means before working with symbols or a formal rule.</p></article><article class="how-card"><div class="count">02</div><h3>Walk through the example</h3><p>Follow the complete worked solution and select each step to focus the explanation.</p></article><article class="how-card"><div class="count">03</div><h3>Review the exam focus</h3><p>Connect the concept to the comparison, diagram, or calculation asked in the papers.</p></article></div></section>
</main>
<footer class="site-footer"><div class="wrap footer-inner"><span>A browser-based DBMS guide with a Gemini-powered study assistant.</span><a href="#top" aria-label="Qnoka">Qnoka</a></div></footer>
{bot_widget_markup("", units)}
{important_dialogs}
<script src="assets/site.js"></script><script src="assets/bot-knowledge.js"></script><script src="assets/bot.js"></script></body></html>"""
(ROOT/"index.html").write_text(home,encoding="utf-8")
print("Generated index.html")
