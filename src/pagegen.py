from pathlib import Path
from html import escape
import json
from bot_widget import bot_widget_markup

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "content"
OUT = ROOT / "units"
ALL_UNITS = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CONTENT.glob("unit-*.json"))]

for source in sorted(CONTENT.glob("unit-*.json")):
    unit = json.loads(source.read_text(encoding="utf-8"))
    detail_file = CONTENT / "lesson-details" / source.name
    details = json.loads(detail_file.read_text(encoding="utf-8"))["lessons"]
    topic_count = sum(len(detail.get("topics", [])) for detail in details)
    cards = []
    topic_groups = []
    for i, (lesson, detail) in enumerate(zip(unit["lessons"], details), start=1):
        href = f"../lessons/unit-{unit['n']:02d}-lesson-{i:02d}.html"
        cards.append(f"""
        <a class="lesson-choice" href="{href}" style="--unit-accent:var(--{unit['accent']})">
          <div class="choice-top"><span>LESSON {i:02d}</span><span class="choice-number">{i:02d}</span></div>
          <h2>{escape(lesson['title'])}</h2>
          <p>{escape(detail['plain'])}</p>
          <span class="choice-link">Open this lesson <b aria-hidden="true">↗</b></span>
        </a>""")
        topic_cards = []
        for topic_no, topic in enumerate(detail.get("topics", []), start=1):
            topic_cards.append(f'''<a class="syllabus-topic-card" href="{href}#topic-{topic_no}">
              <span class="syllabus-topic-number">{topic_no:02d}</span>
              <span class="syllabus-topic-copy"><strong>{escape(topic['title'])}</strong><small>{escape(topic.get('definition', 'Open the lesson for the explanation.'))}</small></span>
              <span class="syllabus-topic-arrow" aria-hidden="true">↗</span>
            </a>''')
        topic_groups.append(f'''<section class="syllabus-topic-group" aria-label="Lesson {i}: {escape(lesson['title'])}">
          <div class="syllabus-topic-heading"><span>LESSON {i:02d}</span><h3>{escape(lesson['title'])}</h3><a href="{href}">Open lesson ↗</a></div>
          <div class="syllabus-topic-grid">{''.join(topic_cards)}</div>
        </section>''')
    number = unit["n"]
    title = escape(unit["title"])
    deck = escape(unit["deck"])
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f2eb"><meta name="description" content="{deck}"><title>Unit {number:02d}: {title} | DBMS Field Guide</title><link rel="stylesheet" href="../assets/site.css"><link rel="stylesheet" href="../assets/bot.css"></head>
<body class="unit-page" style="--unit-accent:var(--{unit['accent']})">
<header class="site-header"><a class="brand" href="../index.html"><span class="brand-mark">D</span><span>DBMS <small>FIELD GUIDE</small></span></a><nav class="main-nav"><a href="../index.html#units">All units</a><a href="../index.html#exam-map">Exam map</a></nav></header>
<main class="wrap unit-main">
  <div class="breadcrumb"><a href="../index.html#units">All units</a><span>›</span><span>Unit {number:02d}</span></div>
  <section class="unit-intro"><div class="eyebrow"><span class="eyebrow-line"></span>UNIT {number:02d} · FOUR LESSONS · {topic_count} TOPICS</div><h1>{title}</h1><p>{deck}</p><div class="unit-promise"><strong>Start anywhere.</strong> Each lesson has its own page, and the complete topic map below links every concept directly to its explanation.</div></section>
  <section class="unit-motion" aria-hidden="true"><div class="motion-heading"><span class="section-label">A SIMPLE LEARNING FLOW</span><span class="motion-live"><i></i> LIVE PREVIEW</span></div><div class="motion-steps"><div class="motion-step motion-step-one"><span>01</span><strong>Choose a topic</strong><small>Open one lesson</small></div><div class="motion-step motion-step-two"><span>02</span><strong>Understand the idea</strong><small>Start with the meaning</small></div><div class="motion-step motion-step-three"><span>03</span><strong>Follow an example</strong><small>See each step unfold</small></div><div class="motion-cursor motion-cursor-one"><i></i></div><div class="motion-cursor motion-cursor-two"><i></i></div><div class="motion-type"><span>NOW EXPLORING</span><strong style="--type-width:{len(unit['lessons'][0]['title'])}ch">{escape(unit['lessons'][0]['title'])}</strong><i></i></div></div></section>
  <section class="lesson-choices" aria-label="Lessons in this unit">{''.join(cards)}</section>
  <section class="syllabus-map" id="syllabus-map"><div class="eyebrow"><span class="eyebrow-line"></span>COMPLETE SYLLABUS TOPIC MAP</div><div class="syllabus-map-intro"><h2>All {topic_count} topics in Unit {number}, linked to their lessons.</h2><p>Each card opens the exact explanation. The unit is organized into four lessons, with all syllabus concepts listed below.</p></div><div class="syllabus-topic-groups">{''.join(topic_groups)}</div></section>
  <div class="unit-return"><a class="button-secondary" href="../index.html#units">Return to all units</a></div>
</main>
<footer class="site-footer"><div class="wrap footer-inner"><span>Unit {number:02d} · 4 lesson pages · {topic_count} topic explanations</span><a href="../index.html">Home</a></div></footer>
{bot_widget_markup("../", ALL_UNITS)}
<script src="../assets/site.js"></script><script src="../assets/bot-knowledge.js"></script><script src="../assets/bot.js"></script>
</body></html>"""
    (OUT / f"unit-{number:02d}.html").write_text(html, encoding="utf-8")
    print(f"Generated unit-{number:02d}.html")
