(() => {
  document.documentElement.classList.add("js");

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (finePointer && !reducedMotion) {
    const root = document.documentElement;
    let latestPointer = null;
    let pointerFrame = 0;
    let glowFrame = 0;

    const pointerCue = document.createElement("div");
    pointerCue.className = "pointer-cue";
    pointerCue.setAttribute("aria-hidden", "true");
    pointerCue.innerHTML = '<span class="pointer-ring"></span><span class="pointer-core"></span><span class="pointer-tail tail-one"></span><span class="pointer-tail tail-two"></span><span class="pointer-tail tail-three"></span>';
    document.body.append(pointerCue);
    const cueParts = [...pointerCue.children];
    const cuePoints = cueParts.map(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    const animateCue = () => {
      const speeds = [0.2, 0.62, 0.39, 0.27, 0.18];
      cuePoints.forEach((point, index) => {
        const target = index === 0 ? { x: targetX - 12, y: targetY - 12 } : index === 1 ? { x: targetX - 3, y: targetY - 3 } : cuePoints[index - 1];
        point.x += (target.x - point.x) * speeds[index];
        point.y += (target.y - point.y) * speeds[index];
        cueParts[index].style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
      });
      const settled = cuePoints.every((point, index) => {
        const target = index === 0 ? { x: targetX - 12, y: targetY - 12 } : index === 1 ? { x: targetX - 3, y: targetY - 3 } : cuePoints[index - 1];
        return Math.abs(point.x - target.x) + Math.abs(point.y - target.y) < 0.8;
      });
      if (settled) pointerFrame = 0;
      else pointerFrame = window.requestAnimationFrame(animateCue);
    };

    document.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      latestPointer = event;
      targetX = event.clientX;
      targetY = event.clientY;
      pointerCue.classList.add("is-active");
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(animateCue);
      if (!glowFrame) glowFrame = window.requestAnimationFrame(() => {
        glowFrame = 0;
        if (!latestPointer) return;
        root.style.setProperty("--pointer-x", `${latestPointer.clientX}px`);
        root.style.setProperty("--pointer-y", `${latestPointer.clientY}px`);
      });
    }, { passive: true });

    document.addEventListener("pointerover", (event) => {
      if (event.target.closest("a, button, [data-tilt-card]")) pointerCue.classList.add("is-hovering");
      else pointerCue.classList.remove("is-hovering");
    }, { passive: true });

    document.querySelectorAll(".unit-card, .important-unit-card, .lesson-choice, .subtopic-card, .concept-panel, .worked-example, .exam-focus, .how-card, .exam-item").forEach((card) => {
      card.dataset.tiltCard = "";
      const strength = card.matches(".concept-panel, .worked-example, .exam-focus") ? 3 : 8;

      card.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch") return;
        const bounds = card.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        card.style.setProperty("--tilt-x", `${(x - 0.5) * strength * 2}deg`);
        card.style.setProperty("--tilt-y", `${(0.5 - y) * strength * 2}deg`);
        card.style.setProperty("--spot-x", `${x * 100}%`);
        card.style.setProperty("--spot-y", `${y * 100}%`);
      }, { passive: true });

      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  const scrollMotionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (scrollMotionAllowed && "IntersectionObserver" in window) {
    document.documentElement.classList.add("motion-ready");

    const revealSelector = [
      ".site-header", ".breadcrumb", ".hero-copy", ".hero-visual", ".course-strip", ".unit-intro", ".unit-promise",
      ".unit-motion", ".unit-grid > .unit-card", ".important-section", ".important-unit-grid > .important-unit-card", ".lesson-choices > .lesson-choice", ".lesson-intro", ".plain-definition",
      ".learning-goals", ".lesson-topic-map", ".subtopic-grid > .subtopic-card", ".concept-list > .concept-panel",
      ".concept-panel .definition-box", ".concept-panel .small-example", ".concept-diagram", ".worked-example",
      ".worked-heading", ".example-table-wrap", ".lesson-code", ".worked-answer", ".worked-example .walk-step", ".worked-example .walk-panels",
      ".exam-focus", ".exam-copy", ".exam-list > .exam-item", ".how-card", ".unit-return", ".lesson-navigation", ".site-footer"
    ].join(",");
    const revealTargets = [...document.querySelectorAll(revealSelector)];
    const parentIndexes = new Map();

    revealTargets.forEach((element) => {
      element.dataset.scrollReveal = "";
      const parent = element.parentElement;
      const index = parentIndexes.get(parent) || 0;
      parentIndexes.set(parent, index + 1);
      const delay = Math.min(index * 105, 525);
      element.style.setProperty("--reveal-delay", `${delay}ms`);

      if (element.matches(".unit-card, .important-unit-card, .lesson-choice, .subtopic-card, .how-card, .exam-item, .concept-panel")) {
        const direction = index % 3;
        const distance = window.innerWidth < 640 ? 42 : 72;
        const x = direction === 0 ? -distance : direction === 2 ? distance : 0;
        const y = direction === 1 ? 42 : 20;
        element.style.setProperty("--reveal-x", `${x}px`);
        element.style.setProperty("--reveal-y", `${y}px`);
        element.style.setProperty("--reveal-rotate", `${direction === 0 ? -1.8 : direction === 2 ? 1.8 : 0}deg`);
      }

    });

    const typeSelector = [
      ".hero h1", ".hero-copy>p", ".unit-intro h1", ".unit-intro>p", ".unit-card h3", ".unit-card p", ".important-unit-card>strong",
      ".lesson-choice h2", ".lesson-choice p", ".lesson-intro h1", ".plain-definition p", ".learning-goals li",
      ".subtopic-card strong", ".concept-panel h2", ".definition-box p", ".concept-panel>p", ".small-example p",
      ".concept-diagram figcaption strong", ".concept-diagram figcaption span", ".worked-heading h2", ".worked-heading>p", ".walk-detail h3", ".walk-detail p", ".worked-answer p",
      ".exam-focus h2", ".exam-focus p"
    ].join(",");

    const typeIndexes = new Map();
    const typeTargets = [...document.querySelectorAll(typeSelector)];
    typeTargets.forEach((element) => {
      const length = element.textContent.trim().length;
      const steps = Math.min(Math.max(length, 20), 64);
      element.dataset.typeReveal = "";
      element.dataset.scrollReveal = "";
      element.style.setProperty("--typing-steps", steps);
      element.style.setProperty("--typing-time", `${Math.min(1.8, Math.max(0.65, steps * 0.026))}s`);
      const group = element.closest(".concept-panel, .unit-intro, .lesson-intro, .lesson-choice, .unit-card, .worked-example, .exam-focus, .hero-copy") || element.parentElement;
      const index = typeIndexes.get(group) || 0;
      typeIndexes.set(group, index + 1);
      element.style.setProperty("--type-delay", `${Math.min(index * 80, 400)}ms`);
      element.style.setProperty("--reveal-delay", `${Math.min(index * 85, 425)}ms`);
    });

    document.querySelectorAll(".concept-diagram .diagram-node").forEach((node, index) => {
      node.style.setProperty("--node-delay", `${220 + index * 150}ms`);
    });
    document.querySelectorAll(".concept-diagram .diagram-edge").forEach((edge, index) => {
      edge.style.setProperty("--edge-delay", `${index * 120}ms`);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-revealed", entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

    [...new Set([...revealTargets, ...typeTargets])].forEach((element) => observer.observe(element));
  }

  document.querySelectorAll("[data-walkthrough]").forEach((walkthrough) => {
    const buttons = [...walkthrough.querySelectorAll("[data-step-index]")];
    const panels = [...walkthrough.querySelectorAll("[data-detail-index]")];
    const select = (index) => {
      buttons.forEach((button) => {
        const active = Number(button.dataset.stepIndex) === index;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        panel.classList.toggle("is-active", Number(panel.dataset.detailIndex) === index);
        if (Number(panel.dataset.detailIndex) === index) {
          panel.classList.add("is-revealed");
          panel.querySelectorAll("[data-type-reveal]").forEach((text) => text.classList.add("is-revealed"));
        }
      });
    };
    buttons.forEach((button) => {
      button.addEventListener("click", () => select(Number(button.dataset.stepIndex)));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault();
        const current = Number(button.dataset.stepIndex);
        const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
        const next = (current + (forward ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
        select(next);
      });
    });
  });

  document.querySelectorAll("[data-important-open]").forEach((button) => {
    const dialog = document.getElementById(button.dataset.importantOpen);
    if (!dialog) return;
    button.addEventListener("click", () => {
      if (!dialog.open) dialog.showModal();
    });
  });

  document.querySelectorAll(".important-dialog").forEach((dialog) => {
    dialog.querySelectorAll("[data-important-close]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
})();
