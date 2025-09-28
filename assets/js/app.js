(() => {
  const els = {
    names: document.getElementById('names'),
    mode: document.getElementById('mode'),
    question: document.getElementById('question'),
    preview: document.getElementById('question-preview'),
    spinBtn: document.getElementById('spinBtn'),
    clearBtn: document.getElementById('clearBtn'),
    wheelCanvas: document.getElementById('wheelCanvas'),
    questionCanvas: document.getElementById('questionCanvas'),
    resultName: document.getElementById('resultName'),
    resultQuestion: document.getElementById('resultQuestion'),
    deleteBtn: document.getElementById('deleteBtn'),
    wheelStage: document.getElementById('wheelStage'),
    diceStage: document.getElementById('diceStage'),
    chestStage: document.getElementById('chestStage'),
    dice: document.getElementById('dice'),
    chest: document.getElementById('chest'),
    spinQuestionBtn: document.getElementById('spinQuestionBtn'),
    themeSel: document.getElementById('themeSel')
  };

  // Simple WebAudio helper for UI sounds (no external files)
  const audio = (() => {
    let ctx = null;
    const ensureCtx = () => {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx;
    };
    const now = () => ensureCtx().currentTime;
    const out = () => ensureCtx().destination;

    const tone = (freq = 600, dur = 0.05, gain = 0.045, type = 'square') => {
      const c = ensureCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.connect(g);
      g.connect(out());
      const t = now();
      // Envelope
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Slight vibrato for character
      try {
        const lfo = c.createOscillator();
        const lfoGain = c.createGain();
        lfo.frequency.value = 10;
        lfoGain.gain.value = 4; // +/-4 Hz
        lfo.connect(lfoGain).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur);
      } catch {}
      o.start(t);
      o.stop(t + dur + 0.02);
    };

    const click = () => tone(1200, 0.02, 0.035, 'square');
    // Remove start sound per request: no tone on button tap
    const startSpin = () => {};
    const win = () => {
      // Pleasant ascending chime: C5 -> E5 -> G5 -> C6
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const gaps = [0, 110, 110, 140];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.14, 0.05, 'sine'), gaps.slice(0, i + 1).reduce((a, b) => a + b, 0)));
    };

    const resume = async () => { try { await ensureCtx().resume(); } catch {} };
    return { click, startSpin, win, resume };
  })();

  // Helper: refresh both wheels from current inputs
  const refreshWheelsFromState = () => {
    if (studentWheel) studentWheel.setNames(parseNames(els.names.value));
    if (questionWheel) {
      const labels = questionLines.map((_, i) => String(i + 1));
      questionWheel.setNames(labels);
    }
  };

  // Local storage keys
  const LS = {
    names: 'rsp:names',
    mode: 'rsp:mode',
    theme: 'rsp:theme'
  };

  // Helpers
  const parseNames = (text) => {
    return text
      .split(/\n|,/)
      .map(s => s.trim())
      .filter(Boolean);
  };

  const saveState = () => {
    const names = els.names.value || '';
    const mode = els.mode.value;
    const theme = els.themeSel ? els.themeSel.value : 'system';
    try {
      localStorage.setItem(LS.names, names);
      localStorage.setItem(LS.mode, mode);
      localStorage.setItem(LS.theme, theme);
    } catch (e) { /* ignore */ }
  };

  const loadState = () => {
    try {
      const names = localStorage.getItem(LS.names);
      if (names) els.names.value = names;
      const mode = localStorage.getItem(LS.mode);
      if (mode) els.mode.value = mode;
      const theme = localStorage.getItem(LS.theme);
      if (els.themeSel && theme) els.themeSel.value = theme;
    } catch (e) { /* ignore */ }
  };

  // Theme handling
  const mql = window.matchMedia('(prefers-color-scheme: light)');
  const applyTheme = (sel) => {
    const choice = sel || (els.themeSel ? els.themeSel.value : 'system');
    const prefersLight = mql.matches;
    if (choice === 'light' || (choice === 'system' && prefersLight)) {
      document.body.setAttribute('data-theme', 'light');
    } else {
      document.body.removeAttribute('data-theme'); // dark/default
    }
  };
  const onSystemThemeChange = () => {
    if (!els.themeSel || els.themeSel.value !== 'system') return;
    applyTheme('system');
  };
  mql.addEventListener?.('change', onSystemThemeChange);

  // File preview and DOCX/TXT extraction
  let questionLines = [];
  const previewFile = (file) => {
    els.preview.innerHTML = '';
    questionLines = [];
    if (!file) {
      // No file selected: clear question wheel immediately
      if (questionWheel) questionWheel.setNames([]);
      return;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.alt = 'Question preview';
      img.style.maxHeight = '200px';
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(file);
      els.preview.appendChild(img);
      return;
    }

    const p = document.createElement('div');
    p.textContent = `Selected: ${file.name}`;
    els.preview.appendChild(p);

    if (ext === 'txt') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target.result);
        const pre = document.createElement('pre');
        pre.textContent = text.slice(0, 1000);
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.maxHeight = '200px';
        pre.style.overflow = 'auto';
        pre.style.marginTop = '6px';
        pre.style.border = '1px solid rgba(255,255,255,0.08)';
        pre.style.padding = '8px';
        pre.style.borderRadius = '8px';
        els.preview.appendChild(pre);
        // Extract question lines from text file
        questionLines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        // Update question wheel with numeric labels 1..N
        if (questionWheel) {
          const labels = questionLines.map((_, i) => String(i + 1));
          questionWheel.setNames(labels);
        }
      };
      reader.readAsText(file);
    } else if (ext === 'docx' && window.mammoth) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const result = await window.mammoth.extractRawText({ arrayBuffer });
          const text = result.value || '';
          questionLines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          if (questionWheel) {
            const labels = questionLines.map((_, i) => String(i + 1));
            questionWheel.setNames(labels);
          }
          const pre = document.createElement('pre');
          pre.textContent = text.slice(0, 1000);
          pre.style.whiteSpace = 'pre-wrap';
          pre.style.maxHeight = '200px';
          pre.style.overflow = 'auto';
          pre.style.marginTop = '6px';
          pre.style.border = '1px solid rgba(255,255,255,0.08)';
          pre.style.padding = '8px';
          pre.style.borderRadius = '8px';
          els.preview.appendChild(pre);
        } catch (err) {
          const errEl = document.createElement('div');
          errEl.textContent = 'Could not read DOCX file.';
          errEl.style.color = 'var(--danger)';
          errEl.style.marginTop = '6px';
          els.preview.appendChild(errEl);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };
  
  function createWheel(canvas) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width; // assume square
    const center = size / 2;
    const radius = size / 2 - 12;

    let items = [];
    let rotation = 0;
    let isSpinning = false;
    let handlers = { onStart: null, onTick: null, onEnd: null };
    // Highlight state for post-selection smooth blinking
    let highlightIdx = -1;
    let blinkRAF = null;
    let blinkStart = 0;
    const BLINK_PERIOD = 1400; // ms

    const randColor = (i) => {
      const hues = [265, 205, 155, 115, 45];
      const hue = hues[i % hues.length];
      const l = 45 + ((i * 7) % 15);
      return `hsl(${hue} 70% ${l}%)`;
    };

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const N = Math.max(items.length, 1);
      const angle = (Math.PI * 2) / N;
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(rotation);
      for (let i = 0; i < N; i++) {
        const start = i * angle;
        const end = start + angle;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, end);
        ctx.closePath();
        let baseColor = items.length ? randColor(i) : 'rgba(255,255,255,0.06)';
        ctx.fillStyle = baseColor;
        ctx.fill();
        // If this slice is highlighted, overlay a smooth white pulse
        if (i === highlightIdx && items.length) {
          const t = performance.now();
          const p = ((t - blinkStart) % BLINK_PERIOD) / BLINK_PERIOD; // 0..1
          const alpha = 0.55 * (0.5 - 0.5 * Math.cos(2 * Math.PI * p)); // 0..0.55
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, radius, start, end);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, end);
        ctx.stroke();
        if (items[i]) {
          const mid = start + angle / 2;
          const labelR = radius * 0.68;
          const chord = 2 * labelR * Math.sin(angle / 2) - 14; // horizontal width available
          const maxWidth = Math.max(40, Math.min(radius * 0.75, chord));
          const lineHeight = 18;
          ctx.save();
          // orient to slice direction, translate outward
          ctx.rotate(mid);
          ctx.translate(labelR, 0);
          // keep upright on left side
          const globalAngle = (mid % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (globalAngle > Math.PI / 2 && globalAngle < (Math.PI * 3) / 2) {
            ctx.rotate(Math.PI);
          }
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          drawWrappedLabel(ctx, String(items[i]), maxWidth, lineHeight, 18, 12);
          ctx.restore();
        }
      }
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#eaf0ff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#7c5cff';
      ctx.fill();
      ctx.restore();
    };

    function drawWrappedLabel(context, text, maxWidth, lineHeight, baseSize, minSize) {
      // shrink font until two-line wrap fits
      const fontTpl = 'bold ${size}px Inter, sans-serif';
      let size = baseSize;
      const toLines = (t) => {
        const words = t.split(/\s+/);
        const lines = [];
        let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          context.font = fontTpl.replace('${size}', String(size));
          if (context.measureText(test).width <= maxWidth) {
            line = test;
          } else {
            if (line) lines.push(line);
            line = w;
            if (lines.length >= 1) break; // only two lines supported
          }
        }
        if (line) lines.push(line);
        return lines.slice(0, 2);
      };
      let lines = toLines(text);
      while ((lines.length > 2 || lines.some(l => context.measureText(l).width > maxWidth)) && size > minSize) {
        size -= 1;
        lines = toLines(text);
      }
      // if still too wide, ellipsize second line
      if (lines.length === 2) {
        while (context.measureText(lines[1] + '…').width > maxWidth && lines[1].length > 1) {
          lines[1] = lines[1].slice(0, -1);
        }
        if (lines[1] && context.measureText(lines[1]).width > maxWidth) {
          lines[1] = lines[1].slice(0, -1);
        }
      }
      context.font = fontTpl.replace('${size}', String(size));
      const totalH = lineHeight * lines.length;
      let y = -totalH / 2 + lineHeight / 2;
      for (const ln of lines) {
        context.fillText(ln, 0, y);
        y += lineHeight;
      }
    }

    const startBlink = (idx) => {
      stopBlink();
      highlightIdx = idx;
      blinkStart = performance.now();
      const loop = () => {
        draw();
        blinkRAF = requestAnimationFrame(loop);
      };
      blinkRAF = requestAnimationFrame(loop);
    };

    const stopBlink = () => {
      if (blinkRAF) { cancelAnimationFrame(blinkRAF); blinkRAF = null; }
      highlightIdx = -1;
      draw();
    };

    const setNames = (arr) => { items = arr.slice(); draw(); };

    const indexFromPointer = () => {
      if (!items.length) return -1;
      const N = items.length;
      const anglePer = (Math.PI * 2) / N;
      let a = (-Math.PI / 2 - rotation) % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      const idx = Math.floor(a / anglePer);
      return idx;
    };

    const spin = async () => {
      if (isSpinning) return null;
      const N = items.length;
      if (!N) return null;
      isSpinning = true;
      // Stop any previous highlight blinking
      stopBlink();
      handlers.onStart && handlers.onStart();
      const targetIndex = Math.floor(Math.random() * N);
      const anglePer = (Math.PI * 2) / N;
      // Choose where inside the target slice we land.
      // Most of the time near the center; sometimes dramatically near the edge.
      const edgeMarginFrac = 0.08; // keep at least 8% away from boundaries
      const nearEdge = Math.random() < 0.28; // 28% chance to be close to an edge
      let offsetFrac;
      if (nearEdge) {
        const sign = Math.random() < 0.5 ? -1 : 1;
        offsetFrac = sign * (0.5 - edgeMarginFrac - Math.random() * 0.02); // hug the edge with tiny randomness
      } else {
        // small offset around center
        offsetFrac = (Math.random() - 0.5) * 0.30; // +/-15% of slice width
        // clamp so we won't cross boundaries
        const maxOff = 0.5 - edgeMarginFrac;
        if (offsetFrac > maxOff) offsetFrac = maxOff;
        if (offsetFrac < -maxOff) offsetFrac = -maxOff;
      }
      const targetAngle = -Math.PI / 2 - (targetIndex + 0.5 + offsetFrac) * anglePer;
      const current = rotation;
      let delta = ((targetAngle - current) % (Math.PI * 2));
      if (delta < 0) delta += Math.PI * 2;
      const extra = Math.PI * 2 * (3 + Math.floor(Math.random() * 3));
      const total = delta + extra;
      const duration = 3000 + Math.random() * 1200;
      const start = performance.now();
      let lastTickIdx = indexFromPointer();
      return new Promise(resolve => {
        const animate = (t) => {
          const elapsed = t - start;
          const p = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          rotation = current + total * eased;
          draw();
          // fire tick each time pointer crosses a slice
          const curIdx = indexFromPointer();
          if (curIdx !== lastTickIdx) {
            handlers.onTick && handlers.onTick();
            lastTickIdx = curIdx;
          }
          if (p < 1) {
            requestAnimationFrame(animate);
          } else {
            isSpinning = false;
            rotation = (rotation % (Math.PI * 2));
            draw();
            const idx = indexFromPointer();
            // Start blinking the landed slice
            startBlink(idx);
            handlers.onEnd && handlers.onEnd(idx);
            resolve(idx);
          }
        };
        requestAnimationFrame(animate);
      });
    };

    // initial draw
    draw();
    const setHandlers = (h) => { handlers = Object.assign({ onStart: null, onTick: null, onEnd: null }, h || {}); };
    const clearHighlight = () => stopBlink();
    return { setNames, spin, indexFromPointer, setHandlers, clearHighlight };
  }

  // Instantiate wheels
  const studentWheel = els.wheelCanvas ? createWheel(els.wheelCanvas) : null;
  const questionWheel = els.questionCanvas ? createWheel(els.questionCanvas) : null;

  // Mode switching
  const updateModeVisibility = () => {
    const mode = els.mode.value;
    els.wheelStage.classList.toggle('hidden', mode !== 'wheel');
    els.diceStage.classList.toggle('hidden', mode !== 'dice');
    els.chestStage.classList.toggle('hidden', mode !== 'chest');
    saveState();
    if (mode === 'wheel') {
      refreshWheelsFromState();
    }
  };

  // Enable/disable delete button depending on selection
  const updateDeleteEnabled = () => {
    if (!els.deleteBtn) return;
    const current = (els.resultName.textContent || '').trim();
    const list = parseNames(els.names.value);
    const enabled = current && current !== '—' && list.some(n => n === current);
    els.deleteBtn.disabled = !enabled;
  };

  // Actions
  const doSpin = async () => {
    // Stop previous blinking as we're initiating a new selection
    els.resultName.classList.remove('flash-win');
    const list = parseNames(els.names.value);
    if (els.mode.value === 'wheel') {
      if (list.length === 0) {
        notify('Please enter at least one name.');
        return;
      }
      // Update wheels
      if (studentWheel) studentWheel.setNames(list);
      if (questionWheel) {
        const labels = questionLines.map((_, i) => String(i + 1));
        questionWheel.setNames(labels);
      }
      // Ensure audio can play (browser gesture already satisfied by this click)
      await audio.resume();
      // Wire sound handlers
      if (studentWheel) studentWheel.setHandlers({
        onStart: () => {}, // no sound on button tap / spin start
        onTick: () => audio.click(),
        onEnd: () => audio.win()
      });
      if (questionWheel) questionWheel.setHandlers({
        onStart: () => {},
        onTick: () => audio.click(),
        onEnd: () => {}
      });
      disableActions(true);
      // Spin both in parallel (if question wheel exists)
      const [idx, qidx] = await Promise.all([
        studentWheel ? studentWheel.spin() : Promise.resolve(null),
        questionWheel ? questionWheel.spin() : Promise.resolve(null)
      ]);
      disableActions(false);
      if (idx != null && idx >= 0) {
        const chosen = list[idx];
        els.resultName.textContent = chosen;
        // If we have a question wheel result index, use it; otherwise fall back to random line
        if (qidx != null && qidx >= 0 && questionLines.length) {
          const q = questionLines[qidx % questionLines.length];
          els.resultQuestion.textContent = q || '—';
        } else if (questionLines.length) {
          els.resultQuestion.textContent = questionLines[Math.floor(Math.random() * questionLines.length)];
        } else { els.resultQuestion.textContent = '—'; }
        flashResult();
        updateDeleteEnabled();
      }
    } else if (els.mode.value === 'dice') {
      if (list.length === 0) {
        notify('Please enter at least one name.');
        return;
      }
      disableActions(true);
      const idx = Math.floor(Math.random() * list.length);
      // simple roll animation via CSS class toggle
      els.dice.classList.add('rolling');
      await sleep(1200 + Math.random() * 600);
      els.dice.classList.remove('rolling');
      disableActions(false);
      els.resultName.textContent = list[idx];
      els.resultQuestion.textContent = questionLines.length ? questionLines[Math.floor(Math.random() * questionLines.length)] : '—';
      flashResult();
      updateDeleteEnabled();
    } else {
      // chest mode placeholder
      if (list.length === 0) {
        notify('Please enter at least one name.');
        return;
      }
      disableActions(true);
      els.chest.classList.add('open');
      await sleep(1400);
      els.chest.classList.remove('open');
      disableActions(false);
      const idx = Math.floor(Math.random() * list.length);
      els.resultName.textContent = list[idx];
      els.resultQuestion.textContent = questionLines.length ? questionLines[Math.floor(Math.random() * questionLines.length)] : '—';
      flashResult();
      updateDeleteEnabled();
    }
  };

  const clearNames = () => {
    els.names.value = '';
    saveState();
    els.resultName.textContent = '—';
    els.resultName.classList.remove('flash-win');
    // reset shown question and clear question wheel visually
    els.resultQuestion.textContent = '—';
    updateDeleteEnabled();
    if (studentWheel) studentWheel.setNames([]);
    // Clear the questions wheel display as well (do not delete uploaded file)
    if (questionWheel) questionWheel.setNames([]);
    // Stop any blinking highlights on wheels
    if (studentWheel && studentWheel.clearHighlight) studentWheel.clearHighlight();
    if (questionWheel && questionWheel.clearHighlight) questionWheel.clearHighlight();
  };

  const removeChosen = () => {
    const current = (els.resultName.textContent || '').trim();
    if (!current || current === '—') return;
    const list = parseNames(els.names.value);
    const idx = list.indexOf(current);
    if (idx === -1) return;
    list.splice(idx, 1);
    // Update textarea: keep original delimiter style simple by joining with newlines
    els.names.value = list.join('\n');
    saveState();
    // Refresh student wheel and clear selection
    if (studentWheel) studentWheel.setNames(list);
    els.resultName.textContent = '—';
    els.resultName.classList.remove('flash-win');
    els.resultQuestion.textContent = '—';
    // Also clear the questions wheel visually so both wheels reset
    if (questionWheel) questionWheel.setNames([]);
    // Stop any blinking highlights on wheels
    if (studentWheel && studentWheel.clearHighlight) studentWheel.clearHighlight();
    if (questionWheel && questionWheel.clearHighlight) questionWheel.clearHighlight();
    updateDeleteEnabled();
  };

  const disableActions = (disabled) => {
    els.spinBtn.disabled = disabled;
    els.clearBtn.disabled = disabled;
    els.mode.disabled = disabled;
    els.names.disabled = disabled;
    els.question.disabled = disabled;
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const notify = (msg) => {
    // minimal unobtrusive alert
    window.alert(msg);
  };

  const flashResult = () => {
    const el = els.resultName;
    // Restart CSS keyframe animation
    el.classList.remove('flash-win');
    // Force reflow to allow re-adding the class to restart animation
    void el.offsetWidth;
    el.classList.add('flash-win');
    // Small scale pop using inline styles (complements chroma/blink)
    el.style.transition = 'none';
    el.style.transform = 'scale(1.0)';
    requestAnimationFrame(() => {
      el.style.transition = 'transform 250ms ease';
      el.style.transform = 'scale(1.12)';
      setTimeout(() => {
        el.style.transform = 'scale(1.0)';
      }, 300);
    });
  };

  // Event listeners
  els.names.addEventListener('input', () => { saveState(); if (studentWheel) studentWheel.setNames(parseNames(els.names.value)); });
  els.mode.addEventListener('change', () => { updateModeVisibility(); saveState(); });
  if (els.themeSel) {
    els.themeSel.addEventListener('change', () => { applyTheme(); saveState(); });
  }
  els.question.addEventListener('change', (e) => previewFile(e.target.files?.[0] || null));
  els.spinBtn.addEventListener('click', doSpin);
  els.clearBtn.addEventListener('click', clearNames);
  if (els.deleteBtn) {
    els.deleteBtn.addEventListener('click', removeChosen);
  }
  if (els.spinQuestionBtn && questionWheel) {
    els.spinQuestionBtn.addEventListener('click', async () => {
      if (!questionLines.length) { notify('Upload a DOCX/TXT with questions first.'); return; }
      const labels = questionLines.map((_, i) => String(i + 1));
      questionWheel.setNames(labels);
      disableActions(true);
      const qidx = await questionWheel.spin();
      disableActions(false);
      if (qidx != null && qidx >= 0) {
        els.resultQuestion.textContent = questionLines[qidx % questionLines.length] || '—';
      }
    });
  }

  // Init
  loadState();
  applyTheme();
  updateModeVisibility();
  // Initialize wheel with any saved names to draw labels
  if (studentWheel) studentWheel.setNames(parseNames(els.names.value));
  if (questionWheel) questionWheel.setNames(questionLines);
  updateDeleteEnabled();
})();
