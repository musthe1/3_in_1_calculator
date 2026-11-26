/* Calculator: math.js is loaded from index.html before this file. */
/* ===== js/engine.js ===== */
/* Math engine: a thin wrapper around math.js.
 * Trig functions honour the Deg/Rad setting; everything else is math.js built-in. */
(function (global) {
  'use strict';

  global.Calc = global.Calc || {};
  var math = global.math;
  var DEG = Math.PI / 180;
  var angle = 'deg';
  var instance = null;

  function build() {
    var m = math.create(math.all);
    var isDeg = angle === 'deg';
    var overrides = {};
    ['sin', 'cos', 'tan'].forEach(function (name) {
      var f = Math[name];
      overrides[name] = function (x) { return f(isDeg ? x * DEG : x); };
    });
    ['asin', 'acos', 'atan'].forEach(function (name) {
      var f = Math[name];
      overrides[name] = function (x) {
        var r = f(x);
        return isDeg ? r / DEG : r;
      };
    });
    m.import(overrides, { override: true });
    return m;
  }

  function inst() {
    if (!instance) instance = build();
    return instance;
  }

  function setAngle(mode) {
    angle = mode === 'rad' ? 'rad' : 'deg';
    instance = build();
  }

  function getAngle() {
    return angle;
  }

  function evaluate(expr, scope) {
    return inst().evaluate(expr, scope || {});
  }

  function compile(expr) {
    return inst().compile(expr);
  }

  function format(value) {
    return inst().format(value, { precision: 12 });
  }

  global.Calc.Engine = {
    setAngle: setAngle,
    getAngle: getAngle,
    evaluate: evaluate,
    compile: compile,
    format: format,
  };
})(window);

/* ===== js/store.js ===== */
/* Persistence: Electron file store via preload bridge, localStorage in browser preview. */
(function (global) {
  'use strict';

  global.Calc = global.Calc || {};
  var KEY = 'calculator-data';

  function load() {
    if (global.calcAPI) {
      return global.calcAPI.load().catch(function () { return {}; });
    }
    try {
      return Promise.resolve(JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (err) {
      return Promise.resolve({});
    }
  }

  function save(data) {
    if (global.calcAPI) {
      return global.calcAPI.save(data).catch(function () { return false; });
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (err) {
      /* storage full or blocked: keep working in memory */
    }
    return Promise.resolve(true);
  }

  global.Calc.Store = { load: load, save: save };
})(window);

/* ===== js/keypads.js ===== */
/* Keypad layouts for each mode.
 * ins: text inserted into the expression. alt: 2nd-function. alpha: Alpha-mode letter.
 * action: handled in app.js (clear, back, eval, second, alpha, angle).
 * key: physical keyboard key that lights this button up. */
(function (global) {
  'use strict';

  global.Calc = global.Calc || {};

  function n(digit) {
    return { label: digit, cls: 'num', ins: digit, key: digit };
  }

  function op(label, ins) {
    return { label: label, cls: 'op', ins: ins, key: ins };
  }

  function fn(label, ins, extra) {
    return Object.assign({ label: label, cls: 'fn', ins: ins, key: null }, extra || {});
  }

  var BASIC = {
    cols: 4,
    cells: [
      { label: 'C', cls: 'fn', action: 'clear', key: 'Escape' },
      { label: '⌫', cls: 'fn', action: 'back', key: 'Backspace' },
      fn('(', '(', { key: '(' }),
      fn(')', ')', { key: ')' }),
      n('7'), n('8'), n('9'), op('÷', '/'),
      n('4'), n('5'), n('6'), op('×', '*'),
      n('1'), n('2'), n('3'), op('−', '-'),
      n('0'), n('.'), { label: '=', cls: 'op', action: 'eval', key: 'Enter' }, op('+', '+'),
    ],
  };

  var SCI = {
    cols: 4,
    cells: [
      fn('sin', 'sin(', { alt: { label: 'sin⁻¹', ins: 'asin(' }, alpha: { label: 'x', ins: 'x' } }),
      fn('cos', 'cos(', { alt: { label: 'cos⁻¹', ins: 'acos(' }, alpha: { label: 'y', ins: 'y' } }),
      fn('tan', 'tan(', { alt: { label: 'tan⁻¹', ins: 'atan(' }, alpha: { label: 'z', ins: 'z' } }),
      fn('log', 'log10(', { alt: { label: '10ˣ', ins: '10^' } }),
      fn('ln', 'log(', { alt: { label: 'eˣ', ins: 'e^' } }),
      fn('x²', '^2'),
      fn('x³', '^3'),
      fn('xʸ', '^'),
      fn('√', 'sqrt(', { alt: { label: '∛', ins: 'cbrt(' } }),
      fn('π', 'pi'),
      fn('e', 'e'),
      fn('EE', '*10^'),
      fn('x!', '!'),
      { label: 'Deg', cls: 'fn', action: 'angle' },
      { label: '2nd', cls: 'second', action: 'second' },
      { label: 'Alpha', cls: 'alpha', action: 'alpha' },
    ],
  };

  var GRAPH = {
    cols: 4,
    cells: [
      fn('x', 'x', { key: 'x' }),
      fn('sin', 'sin('),
      fn('cos', 'cos('),
      fn('tan', 'tan('),
      fn('log', 'log10('),
      fn('ln', 'log('),
      fn('√', 'sqrt('),
      fn('^', '^'),
      n('7'), n('8'), n('9'), op('÷', '/'),
      n('4'), n('5'), n('6'), op('×', '*'),
      n('1'), n('2'), n('3'), op('−', '-'),
      n('0'), n('.'), fn('(', '(', { key: '(' }), fn(')', ')', { key: ')' }),
      { label: 'C', cls: 'fn', action: 'clear', key: 'Escape' },
      { label: '⌫', cls: 'fn', action: 'back', key: 'Backspace' },
      op('+', '+'),
      { label: 'Plot', cls: 'op', action: 'eval', key: 'Enter' },
    ],
  };

  global.Calc.Keypads = { BASIC: BASIC, SCI: SCI, GRAPH: GRAPH };
})(window);

/* ===== js/graph.js ===== */
/* Graphing: plots y = f(x) on a canvas with pan (drag) and zoom (wheel). */
(function (global) {
  'use strict';

  global.Calc = global.Calc || {};
  var COLORS = ['#4a90e2', '#50c878', '#f5a623', '#e74c3c', '#9b59b6', '#1abc9c'];

  var fns = [];
  var canvas = null;
  var ctx = null;
  var legend = null;
  var parentEl = null;
  var onChange = function () {};
  var cssW = 0;
  var cssH = 0;
  var view = { xmin: -10, xmax: 10, ymin: -6, ymax: 6 };
  var drag = null;

  function engine() { return global.Calc.Engine; }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function niceStep(raw) {
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / pow;
    var mult = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
    return mult * pow;
  }

  function tickLabel(n) {
    return String(Number(n.toPrecision(4)));
  }

  // Compile (or reuse) a function for the current angle mode.
  function ensure(f) {
    var ang = engine().getAngle();
    if (f.angle === ang && f.compiled !== undefined) return !!f.compiled;
    f.angle = ang;
    f.compiled = null;
    f.error = '';
    try {
      var c = engine().compile(f.expr);
      c.evaluate({ x: 0 });
      f.compiled = c;
    } catch (err) {
      f.error = String((err && err.message) || err);
    }
    return !!f.compiled;
  }

  function resize() {
    if (!canvas) return;
    var r = parentEl.getBoundingClientRect();
    cssW = Math.max(1, Math.round(r.width));
    cssH = Math.max(1, Math.round(r.height));
    var dpr = global.devicePixelRatio || 1;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function renderLegend() {
    legend.innerHTML = '';
    fns.forEach(function (f, i) {
      var row = document.createElement('div');
      row.className = 'legend-row' + (f.error ? ' bad' : '');
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = f.color;
      var label = document.createElement('span');
      label.className = 'legend-expr';
      label.style.color = f.color;
      label.textContent = 'y = ' + f.expr;
      if (f.error) label.title = f.error;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.dataset.i = String(i);
      rm.title = 'Remove';
      rm.textContent = '×';
      row.appendChild(sw);
      row.appendChild(label);
      row.appendChild(rm);
      legend.appendChild(row);
    });
  }

  function draw() {
    if (!ctx || !cssW) return;
    var W = cssW;
    var H = cssH;
    var v = view;
    var sx = W / (v.xmax - v.xmin);
    var sy = H / (v.ymax - v.ymin);
    function toX(x) { return (x - v.xmin) * sx; }
    function toY(y) { return H - (y - v.ymin) * sy; }

    var gridColor = cssVar('--grid', '#333');
    var axisColor = cssVar('--axis', '#888');
    var textColor = cssVar('--muted', '#888');
    var stepX = niceStep((v.xmax - v.xmin) / 8);
    var stepY = niceStep((v.ymax - v.ymin) / 6);

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = Math.ceil(v.xmin / stepX) * stepX; gx <= v.xmax; gx += stepX) {
      ctx.moveTo(toX(gx), 0);
      ctx.lineTo(toX(gx), H);
    }
    for (var gy = Math.ceil(v.ymin / stepY) * stepY; gy <= v.ymax; gy += stepY) {
      ctx.moveTo(0, toY(gy));
      ctx.lineTo(W, toY(gy));
    }
    ctx.stroke();

    // Axes
    var showY = v.xmin <= 0 && v.xmax >= 0;
    var showX = v.ymin <= 0 && v.ymax >= 0;
    var ax = toX(0);
    var ay = toY(0);
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (showY) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
    if (showX) { ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = textColor;
    ctx.font = '11px system-ui, sans-serif';
    var labelY = showX ? Math.min(Math.max(ay + 4, 4), H - 16) : H - 16;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (gx = Math.ceil(v.xmin / stepX) * stepX; gx <= v.xmax; gx += stepX) {
      if (Math.abs(gx) < stepX / 100) continue;
      ctx.fillText(tickLabel(gx), toX(gx), labelY);
    }
    var labelX = showY ? Math.min(Math.max(ax + 4, 4), W - 44) : 4;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (gy = Math.ceil(v.ymin / stepY) * stepY; gy <= v.ymax; gy += stepY) {
      if (Math.abs(gy) < stepY / 100) continue;
      ctx.fillText(tickLabel(gy), labelX, toY(gy));
    }

    // Curves
    var span = v.ymax - v.ymin;
    fns.forEach(function (f) {
      if (!ensure(f)) return;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      var pen = false;
      var prev = null;
      for (var i = 0; i <= W; i++) {
        var x = v.xmin + (i * (v.xmax - v.xmin)) / W;
        var y;
        try {
          y = f.compiled.evaluate({ x: x });
        } catch (err) {
          y = NaN;
        }
        if (typeof y !== 'number' || !isFinite(y)) {
          pen = false;
          prev = null;
          continue;
        }
        // Break the line at asymptotes (e.g. tan, 1/x) instead of drawing across them.
        if (prev !== null && Math.abs(y - prev) > span * 4) pen = false;
        var py = toY(y);
        if (!pen) {
          ctx.moveTo(i, py);
          pen = true;
        } else {
          ctx.lineTo(i, py);
        }
        prev = y;
      }
      ctx.stroke();
    });

    renderLegend();
  }

  function init(cv, legendEl, cb) {
    canvas = cv;
    legend = legendEl;
    ctx = canvas.getContext('2d');
    parentEl = canvas.parentElement;
    if (cb) onChange = cb;

    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, v: Object.assign({}, view) };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var sx = (drag.v.xmax - drag.v.xmin) / cssW;
      var sy = (drag.v.ymax - drag.v.ymin) / cssH;
      var dx = (e.clientX - drag.x) * sx;
      var dy = (e.clientY - drag.y) * sy;
      view.xmin = drag.v.xmin - dx;
      view.xmax = drag.v.xmax - dx;
      view.ymin = drag.v.ymin + dy;
      view.ymax = drag.v.ymax + dy;
      draw();
    });
    var endDrag = function () {
      drag = null;
      canvas.classList.remove('grabbing');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      var r = canvas.getBoundingClientRect();
      var px = (e.clientX - r.left) / cssW;
      var py = (e.clientY - r.top) / cssH;
      var cx = view.xmin + px * (view.xmax - view.xmin);
      var cy = view.ymax - py * (view.ymax - view.ymin);
      view.xmin = cx - (cx - view.xmin) * f;
      view.xmax = cx + (view.xmax - cx) * f;
      view.ymin = cy - (cy - view.ymin) * f;
      view.ymax = cy + (view.ymax - cy) * f;
      draw();
    }, { passive: false });

    legend.addEventListener('click', function (e) {
      var btn = e.target.closest('.rm');
      if (btn) remove(Number(btn.dataset.i));
    });

    if (global.ResizeObserver) {
      new ResizeObserver(resize).observe(parentEl);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();
  }

  function assignColors() {
    fns.forEach(function (f, i) { f.color = COLORS[i % COLORS.length]; });
  }

  function makeFn(expr) {
    return { expr: expr, color: '', compiled: undefined, angle: null, error: '' };
  }

  function add(expr) {
    fns.push(makeFn(expr));
    assignColors();
    draw();
    onChange();
  }

  function remove(i) {
    if (i < 0 || i >= fns.length) return;
    fns.splice(i, 1);
    assignColors();
    draw();
    onChange();
  }

  function getExprs() {
    return fns.map(function (f) { return f.expr; });
  }

  function setExprs(list) {
    fns = (Array.isArray(list) ? list : [])
      .filter(function (s) { return typeof s === 'string' && s.trim(); })
      .map(makeFn);
    assignColors();
    draw();
  }

  global.Calc.Graph = {
    init: init,
    add: add,
    remove: remove,
    getExprs: getExprs,
    setExprs: setExprs,
    draw: draw,
  };
})(window);

/* ===== js/split.js ===== */
/* Resizable panes: drag handles to change the display/keypad split, the side panel width,
 * and the history/notes split. Sizes are written to CSS variables on <html>. */
(function (global) {
  'use strict';

  global.Calc = global.Calc || {};
  var root = document.documentElement;
  var refs = {};
  var onChange = function () {};

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function bind(handle, o) {
    if (!handle) return;
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('active');
      var horizontal = o.axis === 'x';
      var start = horizontal ? e.clientX : e.clientY;
      var startVal = o.get();

      function move(ev) {
        var pos = horizontal ? ev.clientX : ev.clientY;
        o.set(clamp(startVal + o.sign * (pos - start), o.min(), o.max()));
      }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        handle.classList.remove('active');
        onChange();
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function setVar(name, px) {
    root.style.setProperty(name, Math.round(px) + 'px');
  }

  function init(opts) {
    refs = { display: opts.display, side: opts.side, history: opts.history };
    onChange = opts.onChange || onChange;

    bind(document.getElementById('splitH'), {
      axis: 'y', sign: 1,
      get: function () { return refs.display.offsetHeight; },
      set: function (v) { setVar('--display-h', v); },
      min: function () { return 120; },
      max: function () { return refs.display.parentElement.offsetHeight - 200; },
    });
    bind(document.getElementById('splitV'), {
      axis: 'x', sign: -1,
      get: function () { return refs.side.offsetWidth; },
      set: function (v) { setVar('--side-w', v); },
      min: function () { return 240; },
      max: function () { return window.innerWidth - 420; },
    });
    bind(document.getElementById('splitS'), {
      axis: 'y', sign: 1,
      get: function () { return refs.history.offsetHeight; },
      set: function (v) { setVar('--history-h', v); },
      min: function () { return 90; },
      max: function () { return refs.side.offsetHeight - 140; },
    });
  }

  function restore(layout) {
    if (!layout) return;
    if (layout.displayH) setVar('--display-h', layout.displayH);
    if (layout.sideW) setVar('--side-w', layout.sideW);
    if (layout.historyH) setVar('--history-h', layout.historyH);
  }

  function getLayout() {
    if (!refs.display) return {};
    return {
      displayH: refs.display.offsetHeight,
      sideW: refs.side.offsetWidth,
      historyH: refs.history.offsetHeight,
    };
  }

  global.Calc.Split = { init: init, restore: restore, getLayout: getLayout };
})(window);

/* ===== js/app.js ===== */
/* App controller: state, rendering, keypad and keyboard input, history, notes, theme. */
(function (global) {
  'use strict';

  var Calc = global.Calc;
  var E = Calc.Engine;
  var KP = Calc.Keypads;
  var Store = Calc.Store;
  var Graph = Calc.Graph;
  var Split = Calc.Split;

  var MAX_HISTORY = 500;
  var MODES = ['simple', 'scientific', 'graphing'];
  var saveTimer = null;
  var holdKey = null; // 'Shift' or 'Control' while held in Scientific mode
  var el = {};

  // Keyboard keys for the 2nd-function labels in Scientific mode (2nd + key).
  var SECOND_KEYS = { s: 'asin(', c: 'acos(', t: 'atan(', l: '10^', n: 'e^', r: 'cbrt(' };

  var state = {
    mode: 'simple',
    theme: 'dark',
    angle: 'deg',
    input: '',
    cursor: 0,
    justEvaluated: false,
    lastExpr: '',
    lastResult: '',
    error: '',
    ans: 0,
    second: false,
    alpha: false,
    history: [],
    notes: '',
    layout: {},
  };

  function $(id) { return document.getElementById(id); }

  // ---------- persistence ----------

  function snapshot() {
    return {
      mode: state.mode,
      theme: state.theme,
      angle: state.angle,
      history: state.history,
      notes: state.notes,
      fns: Graph.getExprs(),
      layout: Split.getLayout(),
    };
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { Store.save(snapshot()); }, 250);
  }

  function applyData(d) {
    state.mode = MODES.indexOf(d.mode) >= 0 ? d.mode : 'simple';
    state.theme = d.theme === 'light' ? 'light' : 'dark';
    state.angle = d.angle === 'rad' ? 'rad' : 'deg';
    state.history = Array.isArray(d.history)
      ? d.history.filter(function (h) {
          return h && typeof h.expr === 'string' && typeof h.result === 'string';
        })
      : [];
    state.notes = typeof d.notes === 'string' ? d.notes : '';
    state.layout = d.layout || {};
  }

  // ---------- evaluation helpers ----------

  function friendly(err) {
    var m = String((err && err.message) || err);
    var unknown = m.match(/Undefined symbol (\w+)/);
    if (unknown) return 'Unknown name: ' + unknown[1];
    if (/parenthesis/i.test(m)) return 'Check the parentheses';
    if (/Unexpected end|Value expected|Unexpected operator/i.test(m)) return 'Expression is incomplete';
    if (/Not a value/.test(m)) return 'Not a value';
    return 'Invalid expression';
  }

  // Auto-close any open parentheses so "sin(30" evaluates the way a user expects.
  function closeParens(expr) {
    var open = (expr.match(/\(/g) || []).length;
    var close = (expr.match(/\)/g) || []).length;
    return open > close ? expr + new Array(open - close + 1).join(')') : expr;
  }

  function livePreview(expr) {
    try {
      var v = E.evaluate(closeParens(expr), { ans: state.ans });
      if (typeof v === 'function' || v === undefined) return '';
      return E.format(v);
    } catch (err) {
      return '';
    }
  }

  // ---------- input actions ----------

  function clampCursor() {
    return Math.max(0, Math.min(state.cursor, state.input.length));
  }

  // Text typed at the caret. Simple and Scientific: x is the multiplication shortcut.
  // Graphing keeps x as the variable, since it is what gets plotted.
  function typedText(k) {
    return (k === 'x' || k === 'X') && state.mode !== 'graphing' ? '*' : k;
  }

  function insert(text) {
    if (state.justEvaluated) {
      // Operators continue from the last result; anything else starts a new expression.
      state.input = /^[\^*\/+\-!]/.test(text) ? state.lastResult : '';
      state.cursor = state.input.length;
      state.justEvaluated = false;
    }
    state.error = '';
    var c = clampCursor();
    state.input = state.input.slice(0, c) + text + state.input.slice(c);
    state.cursor = c + text.length;
    render();
  }

  // Delete the character (or whole function name like "sin(") before the caret.
  function backspace() {
    if (state.justEvaluated) {
      state.input = '';
      state.cursor = 0;
      state.justEvaluated = false;
    } else {
      var c = clampCursor();
      var fnToken = state.input.slice(0, c).match(/(asin|acos|atan|sin|cos|tan|log10|log|sqrt|cbrt)\($/);
      var n = fnToken ? fnToken[0].length : Math.min(1, c);
      state.input = state.input.slice(0, c - n) + state.input.slice(c);
      state.cursor = c - n;
    }
    state.error = '';
    render();
  }

  // Left/Right arrows move the caret. After a result, the arrows bring the calculation back for editing.
  function moveCursor(step) {
    if (state.justEvaluated) {
      if (!state.lastExpr) return;
      state.input = state.lastExpr;
      state.cursor = state.input.length;
      state.justEvaluated = false;
    }
    state.cursor = Math.max(0, Math.min(clampCursor() + step, state.input.length));
    state.error = '';
    render();
  }

  function clearInput() {
    state.input = '';
    state.cursor = 0;
    state.justEvaluated = false;
    state.error = '';
    state.second = false;
    state.alpha = false;
    render();
  }

  function commit() {
    var typed = state.input.trim();
    if (!typed) return;
    var expr = closeParens(typed);
    var value;
    var text;
    try {
      value = E.evaluate(expr, { ans: state.ans });
      if (typeof value === 'function' || value === undefined) throw new Error('Not a value');
      text = E.format(value);
    } catch (err) {
      state.error = friendly(err);
      render();
      return;
    }
    if (typeof value === 'number') state.ans = value;
    state.history.push({ expr: expr, result: text, ts: Date.now() });
    if (state.history.length > MAX_HISTORY) {
      state.history.splice(0, state.history.length - MAX_HISTORY);
    }
    state.lastExpr = expr;
    state.lastResult = text;
    state.justEvaluated = true;
    state.input = '';
    state.cursor = 0;
    state.error = '';
    state.second = false;
    state.alpha = false;
    persist();
    renderHistory();
    render();
  }

  function addFunction() {
    var expr = closeParens(state.input.replace(/^\s*y\s*=\s*/, '').trim());
    if (!expr) return;
    try {
      E.compile(expr).evaluate({ x: 0 });
    } catch (err) {
      state.error = friendly(err);
      render();
      return;
    }
    state.input = '';
    state.cursor = 0;
    state.error = '';
    Graph.add(expr); // triggers persist via onChange
    render();
  }

  function press(def) {
    if (def.action === 'clear') return clearInput();
    if (def.action === 'back') return backspace();
    if (def.action === 'eval') return state.mode === 'graphing' ? addFunction() : commit();
    if (def.action === 'second') {
      state.second = !state.second;
      state.alpha = false;
      return render();
    }
    if (def.action === 'alpha') {
      state.alpha = !state.alpha;
      state.second = false;
      return render();
    }
    if (def.action === 'angle') {
      state.angle = state.angle === 'deg' ? 'rad' : 'deg';
      E.setAngle(state.angle);
      persist();
      return render();
    }
    var text = def.ins;
    if (state.second && def.alt) text = def.alt.ins;
    else if (state.alpha && def.alpha) text = def.alpha.ins;
    state.second = false;
    state.alpha = false;
    insert(text);
  }

  // ---------- rendering ----------

  function buildButton(def) {
    var b = document.createElement('button');
    b.type = 'button';
    var label = def.label;
    if (def.action === 'angle') label = state.angle === 'deg' ? 'Deg' : 'Rad';

    var cls = 'btn ' + def.cls;
    if (def.action === 'second' && state.second) cls += ' on';
    if (def.action === 'alpha' && state.alpha) cls += ' on';
    b.className = cls;
    if (def.key) b.dataset.key = def.key;

    var main = label;
    if (state.second && def.alt) main = def.alt.label;
    else if (state.alpha && def.alpha) main = def.alpha.label;

    var lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = main;
    b.appendChild(lbl);

    if (def.alt && !state.second) {
      var h = document.createElement('span');
      h.className = 'hint second-hint';
      h.textContent = def.alt.label;
      b.appendChild(h);
    }
    if (def.alpha && !state.alpha) {
      var a = document.createElement('span');
      a.className = 'hint alpha-hint';
      a.textContent = def.alpha.label;
      b.appendChild(a);
    }

    b.addEventListener('click', function () {
      var all = el.keypad.querySelectorAll('.btn');
      var idx = Array.prototype.indexOf.call(all, b);
      press(def);
      pulseAt(idx);
    });
    return b;
  }

  function renderKeypad() {
    var layouts = state.mode === 'scientific' ? [KP.SCI, KP.BASIC]
      : state.mode === 'graphing' ? [KP.GRAPH]
      : [KP.BASIC];
    el.keypad.innerHTML = '';
    el.keypad.className = 'keypad mode-' + state.mode;
    layouts.forEach(function (layout) {
      var grid = document.createElement('div');
      grid.className = 'grid';
      grid.style.gridTemplateColumns = 'repeat(' + layout.cols + ', 1fr)';
      layout.cells.forEach(function (def) { grid.appendChild(buildButton(def)); });
      el.keypad.appendChild(grid);
    });
  }

  function renderDisplay() {
    var text;
    var preview = '';
    if (state.justEvaluated) {
      text = state.lastExpr + ' = ' + state.lastResult;
    } else {
      text = state.input;
      if (state.mode === 'graphing') {
        if (!state.input) preview = 'Type f(x), e.g. sin(x), then press Enter to plot';
      } else if (state.input.trim()) {
        preview = livePreview(state.input);
      }
    }
    var pos = state.justEvaluated ? text.length : clampCursor();
    el.expr.textContent = '';
    el.expr.appendChild(document.createTextNode(text.slice(0, pos)));
    var caret = document.createElement('span');
    caret.className = 'caret';
    el.expr.appendChild(caret);
    el.expr.appendChild(document.createTextNode(text.slice(pos)));
    el.preview.textContent = preview;
    el.error.textContent = state.error;
  }

  function renderHistory() {
    var list = el.historyList;
    list.innerHTML = '';
    if (!state.history.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No calculations yet.';
      list.appendChild(empty);
      return;
    }
    state.history.forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'hist-item';
      row.title = 'Click to reuse';
      var a = document.createElement('span');
      a.className = 'h-expr';
      a.textContent = h.expr;
      var r = document.createElement('span');
      r.className = 'h-res';
      r.textContent = h.result;
      row.appendChild(a);
      row.appendChild(r);
      row.addEventListener('click', function () {
        state.input = h.expr;
        state.cursor = h.expr.length;
        state.justEvaluated = false;
        state.error = '';
        render();
      });
      list.appendChild(row);
    });
    list.scrollTop = list.scrollHeight;
  }

  function render() {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.body.setAttribute('data-mode', state.mode);
    el.themeBtn.textContent = state.theme === 'dark' ? 'Light mode' : 'Dark mode';
    el.tabs.forEach(function (t) {
      var on = t.dataset.mode === state.mode;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    renderKeypad();
    renderDisplay();
    if (state.mode === 'graphing') Graph.draw();
  }

  // ---------- button pulse (glow + brief resize) ----------

  function pulseAt(index) {
    var nodes = el.keypad.querySelectorAll('.btn');
    var node = nodes[index];
    if (!node) return;
    node.classList.add('pressed');
    clearTimeout(node._pulse);
    node._pulse = setTimeout(function () { node.classList.remove('pressed'); }, 180);
  }

  function flashKey(key) {
    var nodes = el.keypad.querySelectorAll('.btn');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].dataset.key === key) pulseAt(i);
    }
  }

  // ---------- keyboard ----------

  // Scientific mode: holding Shift enables 2nd and holding Ctrl enables Alpha.
  // Releasing the key turns that mode off again.
  function releaseHold() {
    if (!holdKey) return;
    if (holdKey === 'Shift') state.second = false;
    else state.alpha = false;
    holdKey = null;
    render();
  }

  function onKeyUp(e) {
    if (holdKey && e.key === holdKey) releaseHold();
  }

  function onKeyDown(e) {
    var t = e.target;
    var editable = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
    var k = e.key;
    var sci = state.mode === 'scientific';

    if (k === 'Shift' || k === 'Control') {
      if (sci && !editable && !e.repeat && !holdKey) {
        holdKey = k;
        if (k === 'Shift') { state.second = true; state.alpha = false; }
        else { state.alpha = true; state.second = false; }
        render();
      }
      return;
    }
    if (editable) return;

    var isChar = k.length === 1;
    var lower = k.toLowerCase();

    // Scientific mode: an armed 2nd or Alpha applies to the next key. While Ctrl is held
    // (Alpha), Ctrl+key is typed as an Alpha letter instead of a shortcut.
    if (isChar && sci && (state.second || state.alpha) && !e.metaKey && !e.altKey &&
        (!e.ctrlKey || holdKey === 'Control')) {
      e.preventDefault();
      var text;
      if (state.second && SECOND_KEYS[lower]) text = SECOND_KEYS[lower];
      else if (state.alpha && /^[a-z]$/.test(lower)) text = lower;
      else text = typedText(k);
      // A held Shift/Ctrl stays on until released; a clicked 2nd/Alpha button clears after one key.
      if (!holdKey) {
        state.second = false;
        state.alpha = false;
      }
      insert(text);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Any single printable character is typed at the caret: digits, operators,
    // parentheses, and letters so function names like sin, sqrt, log10 and variables like x work.
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      moveCursor(k === 'ArrowLeft' ? -1 : 1);
    } else if (isChar && /^[0-9a-zA-Z.+\-*\/^()!%,=]$/.test(k) && k !== '=') {
      e.preventDefault();
      var ch = typedText(k);
      insert(ch);
      flashKey(ch);
    } else if (k === 'Enter' || k === '=') {
      e.preventDefault();
      if (state.mode === 'graphing') addFunction(); else commit();
      flashKey('Enter');
    } else if (k === 'Backspace') {
      e.preventDefault();
      backspace();
      flashKey('Backspace');
    } else if (k === 'Escape' || k === 'Delete') {
      e.preventDefault();
      clearInput();
      flashKey('Escape');
    }
  }

  // ---------- wiring ----------

  function bindEvents() {
    el.tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        state.mode = t.dataset.mode;
        state.second = false;
        state.alpha = false;
        state.error = '';
        persist();
        render();
      });
    });

    el.themeBtn.addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      persist();
      render();
    });

    // Keep focus off keypad buttons so the keyboard always drives the calculator.
    el.keypad.addEventListener('mousedown', function (e) { e.preventDefault(); });

    // Two-click confirm built into the page: window.confirm() is blocked in some hosts.
    armConfirm(el.clearHistory, 'Erase', 'Confirm erase', function () {
      state.history = [];
      persist();
      renderHistory();
    }, function () { return state.history.length > 0; });

    el.notes.addEventListener('input', function () {
      state.notes = el.notes.value;
      persist();
    });

    // Math Notes: x right after a number or ")" (and not before a word) is a multiplication sign,
    // so "2x3" becomes "2×3" while words such as "max" are left alone.
    el.notes.addEventListener('keydown', function (e) {
      if ((e.key !== 'x' && e.key !== 'X') || e.ctrlKey || e.metaKey || e.altKey) return;
      var v = el.notes.value;
      var s = el.notes.selectionStart;
      var end = el.notes.selectionEnd;
      var before = v.slice(0, s).replace(/\s+$/, '');
      var after = v.slice(end).replace(/^\s+/, '');
      if (!/[0-9)]$/.test(before) || /^[A-Za-z]/.test(after)) return;
      e.preventDefault();
      el.notes.value = v.slice(0, s) + '×' + v.slice(end);
      el.notes.selectionStart = el.notes.selectionEnd = s + 1;
      state.notes = el.notes.value;
      persist();
    });

    armConfirm(el.eraseNotes, '⌫', 'Erase?', function () {
      state.notes = '';
      el.notes.value = '';
      persist();
      el.notes.focus();
    }, function () { return state.notes.length > 0; });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    // Losing focus while Shift/Ctrl is held would otherwise leave 2nd or Alpha stuck on.
    window.addEventListener('blur', releaseHold);
  }

  // First click arms the button and shows the confirm label; a second click within 3s runs the action.
  function armConfirm(btn, normalLabel, confirmLabel, action, enabled) {
    var timer = null;
    btn.addEventListener('click', function () {
      if (!btn._armed) {
        if (enabled && !enabled()) return;
        btn._armed = true;
        btn.textContent = confirmLabel;
        btn.classList.add('armed');
        timer = setTimeout(disarm, 3000);
        return;
      }
      clearTimeout(timer);
      disarm();
      action();
    });
    function disarm() {
      btn._armed = false;
      btn.textContent = normalLabel;
      btn.classList.remove('armed');
    }
  }

  function init() {
    el = {
      tabs: document.querySelectorAll('.tab'),
      keypad: $('keypad'),
      expr: $('exprText'),
      preview: $('resultPreview'),
      error: $('errorLine'),
      historyList: $('historyList'),
      notes: $('notes'),
      themeBtn: $('themeBtn'),
      clearHistory: $('clearHistory'),
      eraseNotes: $('eraseNotes'),
      pencil: $('pencilBtn'),
      display: $('display'),
      historyPanel: $('historyPanel'),
      side: $('side'),
      canvas: $('graphCanvas'),
      legend: $('graphLegend'),
    };

    Graph.init(el.canvas, el.legend, persist);

    Store.load().then(function (raw) {
      applyData(raw || {});
      E.setAngle(state.angle);
      Graph.setExprs((raw && raw.fns) || []);
      el.notes.value = state.notes;
      Split.init({
        display: el.display,
        side: el.side,
        history: el.historyPanel,
        onChange: persist,
      });
      Split.restore(state.layout);
      bindEvents();
      renderHistory();
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);

