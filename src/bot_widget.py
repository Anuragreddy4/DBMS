from html import escape


def bot_widget_markup(root_prefix, units):
    options = ''.join(
        f'<option value="{u["n"]}">Unit {u["n"]}: {escape(u["title"])}</option>'
        for u in units
    )
    unit_buttons = ''.join(
        f'<button class="qno-unit-link" type="button" data-qno-unit="{u["n"]}"><span>{u["n"]:02d}</span>{escape(u["title"])}</button>'
        for u in units
    )
    return f'''<button class="qno-launcher" id="qno-open" type="button" aria-haspopup="dialog" aria-controls="qno-overlay" aria-label="Open Qno, the DBMS study assistant">
  <span class="qno-launcher-mark" aria-hidden="true">Q</span><span class="qno-launcher-copy"><strong>Ask Qno</strong><small>DBMS study guide</small></span><span class="qno-launcher-dot" aria-hidden="true"></span>
</button>
<section class="qno-overlay" id="qno-overlay" role="dialog" aria-modal="true" aria-labelledby="qno-title" aria-describedby="qno-description" data-root-prefix="{escape(root_prefix, quote=True)}" hidden>
  <div class="qno-window">
    <header class="qno-header"><button class="qno-brand" type="button" data-qno-action="new" aria-label="Start a new conversation"><span class="qno-brand-mark">Q</span><span><strong id="qno-title">Qno</strong><small>QnOka · DBMS study companion</small></span></button><div class="qno-header-status"><span class="qno-status-dot"></span><span data-qno-status>Checking Gemini</span></div><button class="qno-close" type="button" data-qno-close aria-label="Close Qno">×</button></header>
    <div class="qno-layout">
      <aside class="qno-sidebar" aria-label="Qno menu">
        <button class="qno-new-chat" type="button" data-qno-action="new"><span>＋</span> New doubt</button>
        <div class="qno-side-label">STUDY TOOLS</div>
        <button class="qno-menu-link" type="button" data-qno-action="browse"><span>⌕</span> Find a topic</button>
        <button class="qno-menu-link" type="button" data-qno-action="quiz"><span>◇</span> Take a quiz</button>
        <button class="qno-menu-link" type="button" data-qno-action="example"><span>▤</span> Show a worked example</button>
        <div class="qno-side-label qno-unit-label">DOUBT BY UNIT</div>
        <nav class="qno-unit-list" aria-label="Choose a DBMS unit">{unit_buttons}</nav>
        <div class="qno-sidebar-note"><span class="qno-sidebar-note-dot"></span><p>The question bank comes from your Important Questions PDF; unit labels follow the official syllabus.</p></div>
      </aside>
      <main class="qno-main">
        <div class="qno-chat-scroll" id="qno-scroll" aria-live="polite" aria-relevant="additions text">
          <section class="qno-welcome" id="qno-welcome">
            <div class="qno-welcome-orbit" aria-hidden="true"><span>Q</span><i></i><b></b></div>
            <div class="qno-eyebrow">YOUR DBMS STUDY COMPANION</div>
            <h1>Hi, I’m Qno.<br><span>What would you like to understand?</span></h1>
            <p id="qno-description">Ask in your own words—even with a spelling mistake. I can explain course topics clearly, answer follow-up questions, find lesson pages, walk through examples, or quiz you.</p>
            <div class="qno-welcome-actions"><button type="button" data-qno-action="browse"><span>⌕</span><strong>Find a topic</strong><small>Locate it in the course</small></button><button type="button" data-qno-action="units"><span>▦</span><strong>Choose a unit</strong><small>Browse its lessons</small></button><button type="button" data-qno-action="quiz"><span>◇</span><strong>Take a quick quiz</strong><small>Check your understanding</small></button></div>
            <div class="qno-prompt-label">TRY ASKING</div>
            <div class="qno-prompt-chips"><button type="button" data-qno-prompt="What is a DBMS? Explain with an example.">What is a DBMS?</button><button type="button" data-qno-prompt="Where can I learn about normalization?">Find normalization</button><button type="button" data-qno-prompt="Quiz me on Unit 4">Quiz me on Unit 4</button></div>
          </section>
          <div class="qno-messages" id="qno-messages" role="log" aria-label="Conversation with Qno"></div>
        </div>
        <form class="qno-composer" id="qno-form">
          <label class="qno-scope"><span class="sr-only">Limit search to a unit</span><select id="qno-scope"><option value="">All units</option>{options}</select><span aria-hidden="true">⌄</span></label>
          <label class="sr-only" for="qno-input">Ask Qno a DBMS question</label><textarea id="qno-input" rows="1" placeholder="Ask a DBMS question or say “where is…”" autocomplete="off"></textarea>
          <button class="qno-send" type="submit" aria-label="Send question"><span aria-hidden="true">↑</span></button>
        </form>
        <div class="qno-footer-note" data-qno-privacy>Checking AI connection…</div>
      </main>
    </div>
  </div>
</section>'''
