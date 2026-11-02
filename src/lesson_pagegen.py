from pathlib import Path
from html import escape
import json
import math
from bot_widget import bot_widget_markup

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "src" / "content"
OUT = ROOT / "lessons"
OUT.mkdir(exist_ok=True)
ALL_UNITS = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CONTENT.glob("unit-*.json"))]
COLORS = ["#246f84", "#d66f4d", "#c39a42", "#718f83"]
COURSE_LESSONS = [(unit, index, lesson) for unit in ALL_UNITS for index, lesson in enumerate(unit["lessons"])]

def diagram_markup(diagram):
    if not diagram:
        return ""
    raw_nodes = diagram["nodes"]
    edges = diagram["links"]
    n = len(raw_nodes)
    width, height, nw, nh = 1000, 360, 190, 76
    incoming = [0] * n
    outgoing = [[] for _ in raw_nodes]
    for a, b in edges:
        outgoing[a].append(b)
        incoming[b] += 1

    # Layer a directed acyclic graph from its inputs to its outputs.
    levels = [0] * n
    queue = [i for i in range(n) if incoming[i] == 0]
    indeg = incoming[:]
    order = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for target in outgoing[node]:
            levels[target] = max(levels[target], levels[node] + 1)
            indeg[target] -= 1
            if indeg[target] == 0:
                queue.append(target)
    cyclic = len(order) != n

    if cyclic:
        if n == 3:
            coords = [(500, 65), (790, 260), (210, 260)]
        else:
            coords = []
            for i in range(n):
                angle = -math.pi / 2 + (2 * math.pi * i / n)
                coords.append((500 + 285 * math.cos(angle), 180 + 135 * math.sin(angle)))
    else:
        groups = {}
        for i, level in enumerate(levels):
            groups.setdefault(level, []).append(i)
        maxlevel = max(levels) if levels else 0
        coords = [(0, 0)] * n
        for level, group in groups.items():
            x = 110 if maxlevel == 0 else 110 + level * (780 / maxlevel)
            spacing = min(112, 300 / max(1, len(group) - 1)) if len(group) > 1 else 0
            for rank, node in enumerate(group):
                y = 180 + (rank - (len(group) - 1) / 2) * spacing
                coords[node] = (x, y)

    paths = []
    for a, b in edges:
        x1, y1 = coords[a]
        x2, y2 = coords[b]
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            continue
        def edge_point(x, y, vx, vy):
            sx = (nw / 2) / abs(vx) if vx else float("inf")
            sy = (nh / 2) / abs(vy) if vy else float("inf")
            scale = min(sx, sy)
            return x + vx * scale, y + vy * scale
        sx, sy = edge_point(x1, y1, dx, dy)
        ex, ey = edge_point(x2, y2, -dx, -dy)
        bend = 0
        if cyclic:
            bend = 36 if (a + b) % 2 == 0 else -36
        mx, my = (sx + ex) / 2, (sy + ey) / 2
        if bend:
            norm = math.hypot(dx, dy) or 1
            cx, cy = mx - dy / norm * bend, my + dx / norm * bend
            paths.append(f'<path class="diagram-edge" d="M {sx:.1f} {sy:.1f} Q {cx:.1f} {cy:.1f} {ex:.1f} {ey:.1f}" marker-end="url(#arrow)"/>')
        else:
            paths.append(f'<path class="diagram-edge" d="M {sx:.1f} {sy:.1f} C {mx:.1f} {sy:.1f}, {mx:.1f} {ey:.1f}, {ex:.1f} {ey:.1f}" marker-end="url(#arrow)"/>')

    boxes = []
    for i, node in enumerate(raw_nodes):
        x, y = coords[i]
        title_words = str(node[0]).split()
        title_lines = []
        current = ""
        for word in title_words:
            proposed = (current + " " + word).strip()
            if len(proposed) > 18 and current:
                title_lines.append(current)
                current = word
            else:
                current = proposed
        if current:
            title_lines.append(current)
        if len(title_lines) > 2:
            title_lines = [title_lines[0], title_lines[1][:15] + "…"]
        title_spans = "".join(f'<tspan x="{x:.1f}" dy="{0 if j == 0 else 18}">{escape(line)}</tspan>' for j, line in enumerate(title_lines))
        title_y = y - 12 if len(title_lines) > 1 else y - 3
        detail_y = y + 27 if len(title_lines) > 1 else y + 21
        detail = escape(str(node[1])) if len(node) > 1 else ""
        boxes.append(f'''<g class="diagram-node">
          <rect x="{x-nw/2:.1f}" y="{y-nh/2:.1f}" width="{nw}" height="{nh}" rx="14" fill="{COLORS[i%len(COLORS)]}"/>
          <path d="M {x-nw/2+14:.1f} {y-nh/2+2:.1f} H {x+nw/2-14:.1f}" stroke="rgba(255,255,255,.48)" stroke-width="2"/>
          <text x="{x:.1f}" y="{title_y:.1f}" class="diagram-title">{title_spans}</text>
          <text x="{x:.1f}" y="{detail_y:.1f}" class="diagram-detail">{detail}</text>
        </g>''')
    alt = escape(diagram["title"] + ". " + diagram.get("caption", ""))
    return f'''<figure class="concept-diagram">
      <figcaption><strong>{escape(diagram["title"])}</strong><span>{escape(diagram.get("caption", ""))}</span></figcaption>
      <div class="diagram-scroll"><svg viewBox="0 0 {width} {height}" role="img" aria-label="{alt}" xmlns="http://www.w3.org/2000/svg">
        <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#60757b"/></marker></defs>
        {''.join(paths)}{''.join(boxes)}
      </svg></div>
    </figure>'''

def table_markup(table):
    if not table:
        return ""
    head = "".join(f"<th scope=\"col\">{escape(str(v))}</th>" for v in table["headers"])
    rows = "".join("<tr>" + "".join(f"<td>{escape(str(v))}</td>" for v in row) + "</tr>" for row in table["rows"])
    return f'<div class="example-table-wrap"><table class="example-table"><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'

def worked_markup(worked):
    steps = worked["steps"]
    buttons = "".join(f'<button class="walk-step{" is-active" if i == 0 else ""}" type="button" data-step-index="{i}" aria-pressed="{"true" if i == 0 else "false"}"><span>{i+1:02d}</span><strong>{escape(step["title"])}</strong></button>' for i, step in enumerate(steps))
    panels = "".join(f'<div class="walk-detail{" is-active" if i == 0 else ""}" data-detail-index="{i}"><span>STEP {i+1:02d}</span><h3>{escape(step["title"])}</h3><p>{escape(step["body"])}</p></div>' for i, step in enumerate(steps))
    code = f'<pre class="lesson-code"><code>{escape(worked["code"])}</code></pre>' if worked.get("code") else ""
    return f'''<section class="worked-example" id="worked-example" data-walkthrough>
      <div class="worked-heading"><span class="section-label">WORKED EXAMPLE · SELECT A STEP</span><h2>{escape(worked["title"])}</h2><p>{escape(worked["setup"])}</p>{table_markup(worked.get("table"))}{code}</div>
      <div class="walkthrough"><div class="walk-steps" role="group" aria-label="Select a worked example step">{buttons}</div><div class="walk-panels" aria-live="polite">{panels}</div></div>
      <div class="worked-answer"><span class="section-label">RESULT</span><p>{escape(worked["answer"])}</p></div>
    </section>'''

def lesson_nav_markup(unit_no, lesson_no):
    position = next(i for i, (unit, index, _) in enumerate(COURSE_LESSONS) if unit["n"] == unit_no and index == lesson_no - 1)

    def link(entry, direction):
        if entry is None:
            label = "COURSE START" if direction == "previous" else "COURSE COMPLETE"
            title = "This is the first lesson" if direction == "previous" else "You reached the last lesson"
            return f'<div class="lesson-nav-edge"><span>{label}</span><strong>{title}</strong></div>'
        unit, index, lesson = entry
        href = f"unit-{unit['n']:02d}-lesson-{index+1:02d}.html"
        place = f"UNIT {unit['n']:02d} · LESSON {index+1:02d}"
        arrow = "←" if direction == "previous" else "→"
        return f'<a class="lesson-nav-link lesson-nav-{direction}" href="{href}"><span>{arrow} {direction.upper()} LESSON</span><strong>{place}</strong><em>{escape(lesson["title"])}</em></a>'

    previous = COURSE_LESSONS[position - 1] if position > 0 else None
    following = COURSE_LESSONS[position + 1] if position + 1 < len(COURSE_LESSONS) else None
    return f'''<nav class="lesson-navigation" aria-label="Move between lessons">
      {link(previous, "previous")}
      <a class="lesson-nav-unit button-secondary" href="../units/unit-{unit_no:02d}.html">Return to Unit {unit_no:02d}</a>
      {link(following, "next")}
    </nav>'''

def lesson_html(unit, lesson, detail, index):
    unit_no = unit["n"]
    lesson_no = index + 1
    unit_title = escape(unit["title"])
    lesson_title = escape(lesson["title"])
    plain = escape(detail["plain"])
    goals = "".join(f'<li>{escape(x)}</li>' for x in detail["goals"])
    topic_cards = "".join(f'<a class="subtopic-card" href="#topic-{i+1}"><span class="subtopic-number">{i+1:02d}</span><strong>{escape(t["title"])}</strong><span class="subtopic-arrow" aria-hidden="true">↘</span></a>' for i, t in enumerate(detail["topics"]))
    diagram_inserted = False
    diagram_topic = detail.get("diagramTopic")
    sections = []
    for i, topic in enumerate(detail["topics"]):
        details = "".join(f'<p>{escape(p)}</p>' for p in topic.get("details", []))
        example = f'<div class="small-example"><span class="section-label">QUICK EXAMPLE</span><p>{escape(topic["example"])}</p></div>' if topic.get("example") else ""
        topic_table = table_markup(topic.get("table"))
        diagram = ""
        if not diagram_inserted and detail.get("diagram") and (not diagram_topic or topic["title"] == diagram_topic):
            diagram = diagram_markup(detail["diagram"])
            diagram_inserted = True
        sections.append(f'''<section class="concept-panel" id="topic-{i+1}">
          <div class="concept-number">TOPIC {i+1:02d}</div><h2>{escape(topic["title"])}</h2>
          <div class="definition-box"><span class="section-label">DEFINITION</span><p>{escape(topic["definition"])}</p></div>
          {topic_table}{diagram}{details}{example}
        </section>''')
    if detail.get("diagram") and not diagram_inserted:
        sections.append(diagram_markup(detail["diagram"]))
    worked = worked_markup(detail["worked"])
    lesson_navigation = lesson_nav_markup(unit_no, lesson_no)
    unit_link = f"../units/unit-{unit_no:02d}.html"
    plain_slug = f"Unit {unit_no:02d} · Lesson {lesson_no:02d}"
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f2eb"><meta name="description" content="{escape(plain, quote=True)}"><title>{lesson_title} | DBMS Field Guide</title><link rel="stylesheet" href="../assets/site.css"><link rel="stylesheet" href="../assets/bot.css"></head>
<body class="lesson-page" style="--unit-accent:var(--{unit['accent']})">
<header class="site-header"><a class="brand" href="../index.html"><span class="brand-mark">D</span><span>DBMS <small>FIELD GUIDE</small></span></a><nav class="main-nav"><a href="{unit_link}">Unit {unit_no:02d}</a><a href="../index.html#units">All units</a></nav></header>
<main class="wrap lesson-main">
  <div class="breadcrumb"><a href="../index.html#units">All units</a><span>›</span><a href="{unit_link}">Unit {unit_no:02d}: {unit_title}</a><span>›</span><span>Lesson {lesson_no:02d}</span></div>
  <section class="lesson-intro"><div class="eyebrow"><span class="eyebrow-line"></span>{plain_slug.upper()}</div><h1>{lesson_title}</h1><div class="plain-definition"><span class="section-label">IN PLAIN WORDS</span><p>{plain}</p></div><div class="learning-goals"><strong>By the end, you can:</strong><ul>{goals}</ul></div></section>
  <section class="lesson-topic-map"><div class="section-label">TOPICS IN THIS LESSON</div><div class="subtopic-grid">{topic_cards}</div></section>
  <section class="concept-list"><div class="section-label">EXPLANATION</div>{''.join(sections)}</section>
  {worked}
  <section class="exam-focus"><span class="section-label">EXAM FOCUS</span><h2>What to be ready to explain</h2><p>{escape(detail["exam"])}</p></section>
  {lesson_navigation}
</main>
<footer class="site-footer"><div class="wrap footer-inner"><span>{escape(unit["title"])} · {lesson_no:02d} of 04</span><a href="../index.html">Home</a></div></footer>
{bot_widget_markup("../", ALL_UNITS)}
<script src="../assets/site.js"></script><script src="../assets/bot-knowledge.js"></script><script src="../assets/bot.js"></script></body></html>'''

for source in sorted(CONTENT.glob("unit-*.json")):
    unit = json.loads(source.read_text(encoding="utf-8"))
    details = json.loads((CONTENT/"lesson-details"/source.name).read_text(encoding="utf-8"))["lessons"]
    for i, (lesson, detail) in enumerate(zip(unit["lessons"], details)):
        out = OUT / f"unit-{unit['n']:02d}-lesson-{i+1:02d}.html"
        out.write_text(lesson_html(unit, lesson, detail, i), encoding="utf-8")
        print(f"Generated {out.name}")
