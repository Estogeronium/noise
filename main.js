import { API_URL } from "./config.js";
import { localSignals } from "./grammar.js";
import { createGlitch } from "./glitch.js";

const C = {
  bg: "#06070b",
  ink: "#eef1f6",
  dim: "#5c6578",
  cyan: "#19f3ff",
  magenta: "#ff2bd6",
};
const HEAD = '"Russo One", Impact, "Arial Black", sans-serif';
const MONO = '"Share Tech Mono", "Courier New", monospace';
const KIND_LABEL = {
  ticker: "ПЕРЕХВАТ // НОВОСТИ",
  slogan: "ПЕРЕХВАТ // ЛОЗУНГ",
  notice: "ПЕРЕХВАТ // УВЕДОМЛЕНИЕ",
  alert: "ПЕРЕХВАТ // ТРЕВОГА",
  standby: "НЕТ СИГНАЛА",
};
const SCRAMBLE = "▓▒░█#%@/\\<>+=*";
const MAX_HISTORY = 6;

const $ = (id) => document.getElementById(id);
const display = $("screen");
const src = document.createElement("canvas");
const ctx = src.getContext("2d");
const glitch = createGlitch(display);
const dctx = glitch ? null : display.getContext("2d");

const state = {
  entered: false,
  reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  current: { kind: "standby", text: "ОЖИДАНИЕ СИГНАЛА", sub: "" },
  shownAt: 0,
  history: [],
  queue: [],
  recent: [],
  swapAt: 0, // момент глитч-перехода, когда подменяется передача
  swapDone: true,
  nextMicro: 0,
  microAt: -1,
  tickerX: 0,
  startedAt: performance.now(),
  seed: Math.floor(Math.random() * 1e6),
  reserve: 0, // место под форму ввода, в пикселях canvas
  foot: 0, // нижний отступ под футер, в пикселях canvas
};

// ---------- очередь передач ----------

const fetchState = { loading: false, cooldownUntil: 0 };

function valid(it) {
  return it && typeof it.text === "string" && it.text.length > 5 && it.kind in KIND_LABEL;
}

async function refill() {
  if (!API_URL || fetchState.loading || Date.now() < fetchState.cooldownUntil) return;
  fetchState.loading = true;
  try {
    const res = await fetch(`${API_URL}/feed`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const items = (data.items || []).filter(valid);
    if (!items.length) throw new Error("empty");
    state.queue.push(...items);
  } catch {
    fetchState.cooldownUntil = Date.now() + 60000; // эфир не молчит: ниже включается локальный генератор
  } finally {
    fetchState.loading = false;
  }
}

function nextItem() {
  if (state.queue.length < 3) refill();
  let it;
  while ((it = state.queue.shift())) {
    if (!state.recent.includes(it.text)) break;
  }
  if (!it) {
    do {
      it = localSignals(1)[0];
    } while (state.recent.includes(it.text));
  }
  state.recent.push(it.text);
  if (state.recent.length > 30) state.recent.shift();
  return it;
}

// ---------- глитч-события ----------

function triggerSwap(now) {
  state.swapAt = now;
  state.swapDone = false;
}

function glitchLevel(now) {
  let g = 0.025;
  const p = (now - state.swapAt) / 750;
  if (p >= 0 && p <= 1) {
    if (p >= 0.45 && !state.swapDone) commitSwap(now);
    g = Math.max(g, Math.pow(Math.sin(Math.PI * p), 0.7));
  }
  if (!state.reduced) {
    if (now > state.nextMicro) {
      state.microAt = now;
      state.nextMicro = now + 2000 + Math.random() * 3500;
    }
    const m = (now - state.microAt) / 180;
    if (m >= 0 && m <= 1) g = Math.max(g, 0.35 * Math.sin(Math.PI * m));
  }
  return state.reduced ? Math.min(g, 0.12) : g;
}

function commitSwap(now) {
  state.swapDone = true;
  state.current = nextItem();
  state.shownAt = now;
  state.history.push(state.current.text);
  if (state.history.length > MAX_HISTORY) state.history.shift();
  $("sr").textContent = `${state.current.text} ${state.current.sub || ""}`;
}

function holdTime(item) {
  return 5200 + item.text.length * 45;
}

// ---------- отрисовка экрана ----------

function wrap(text, maxW) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function barcode(x, y, w, h, seed) {
  let s = seed;
  let cx = x;
  ctx.fillStyle = C.dim;
  while (cx < x + w) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const bw = 1 + (s % 4);
    if ((s >> 8) % 3) ctx.fillRect(cx, y, bw, h);
    cx += bw + 1 + ((s >> 4) % 3);
  }
}

function drawScreen(now) {
  const W = src.width;
  const H = src.height;
  const K = Math.min(W, H) / 720;
  const m = Math.round(Math.min(W, H) * 0.05);
  const item = state.current;
  const age = now - state.shownAt;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // верхняя панель
  ctx.textBaseline = "top";
  ctx.font = `${Math.round(15 * K)}px ${MONO}`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = "left";
  ctx.fillText("ШУМ  //  КАНАЛ 07", m, m);
  const sec = Math.floor((now - state.startedAt) / 1000);
  const tc = [sec / 3600, (sec / 60) % 60, sec % 60]
    .map((v) => String(Math.floor(v)).padStart(2, "0"))
    .join(":");
  ctx.textAlign = "right";
  ctx.fillStyle = C.ink;
  ctx.fillText(`${Math.floor(now / 500) % 2 ? "●" : "○"} REC ${tc}`, W - m, m);
  ctx.textAlign = "left";

  // уголки рамки
  const L = Math.round(26 * K);
  const fx = m * 0.55;
  const fy = m * 0.55;
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = Math.max(1, 2 * K);
  for (const [x, y, dx, dy] of [
    [fx, fy, 1, 1],
    [W - fx, fy, -1, 1],
    [fx, H - fy, 1, -1],
    [W - fx, H - fy, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * L, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * L);
    ctx.stroke();
  }

  // область текста
  const bandH = Math.round(46 * K);
  const foot = state.foot || m;
  const top = m + Math.round(52 * K);
  const bottom = H - foot - bandH - state.reserve - Math.round(12 * K);
  const availH = Math.max(bottom - top, 40);
  const availW = W - m * 2;

  // метка типа
  ctx.font = `${Math.round(16 * K)}px ${MONO}`;
  const label = KIND_LABEL[item.kind] || KIND_LABEL.ticker;
  const lw = ctx.measureText(label).width + 20 * K;
  ctx.fillStyle = item.kind === "alert" ? C.magenta : C.cyan;
  ctx.fillRect(m, top, lw, 26 * K);
  ctx.fillStyle = C.bg;
  ctx.fillText(label, m + 10 * K, top + 5 * K);

  // основной текст: подбираем кегль, чтобы влезло
  const upper = item.kind === "slogan" || item.kind === "alert" || item.kind === "standby";
  const full = upper ? item.text.toUpperCase() : item.text;
  const textTop = top + 44 * K;
  const textH = availH - 44 * K - 30 * K; // 30K — строка-источник под текстом
  let size = Math.round(92 * K);
  let lines;
  for (; size > 20 * K; size -= 4 * K) {
    ctx.font = `${Math.round(size)}px ${HEAD}`;
    lines = wrap(full, availW);
    if (lines.length * size * 1.12 <= textH) break;
  }
  ctx.font = `${Math.round(size)}px ${HEAD}`;

  const cps = state.reduced ? 1e9 : 42;
  let budget = Math.floor((age / 1000) * cps);
  const done = budget >= full.length;
  ctx.fillStyle = item.kind === "alert" ? C.magenta : C.ink;
  lines.forEach((ln, i) => {
    const y = textTop + i * size * 1.12;
    if (budget <= 0) return;
    if (budget >= ln.length + 1) {
      ctx.fillText(ln, m, y);
    } else {
      const part = ln.slice(0, budget);
      ctx.fillText(part, m, y);
      const x = m + ctx.measureText(part).width;
      ctx.fillStyle = C.cyan;
      ctx.fillText(SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)], x, y);
      ctx.fillStyle = item.kind === "alert" ? C.magenta : C.ink;
    }
    budget -= ln.length + 1;
  });

  // подпись-источник
  if (done && item.sub) {
    ctx.font = `${Math.round(17 * K)}px ${MONO}`;
    ctx.fillStyle = C.cyan;
    ctx.fillText(`> ${item.sub}`, m, Math.min(textTop + lines.length * size * 1.12 + 8 * K, bottom - 20 * K));
  }

  // штрихкод и «хекс-поток» справа
  barcode(W - m - 150 * K, m + 24 * K, 150 * K, 18 * K, state.seed + state.history.length * 97);
  if (W > 900) {
    ctx.font = `${Math.round(12 * K)}px ${MONO}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = "right";
    const tick = Math.floor(now / 260);
    for (let i = 0; i < 9; i++) {
      const v = ((tick * 2654435761 + i * 40503) >>> 0).toString(16).padStart(8, "0").toUpperCase();
      ctx.fillText(v, W - m, top + 40 * K + i * 16 * K);
    }
    ctx.textAlign = "left";
  }

  // бегущая строка
  const by = H - foot - bandH;
  ctx.fillStyle = C.magenta;
  ctx.fillRect(m, by, W - m * 2, bandH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(m, by, W - m * 2, bandH);
  ctx.clip();
  ctx.font = `${Math.round(19 * K)}px ${MONO}`;
  ctx.fillStyle = C.bg;
  ctx.textBaseline = "middle";
  const strip = (state.history.length ? state.history : ["ШУМ — ЭФИР ПЕРЕХВАЧЕН"]).join("   ///   ") + "   ///   ";
  const sw = ctx.measureText(strip).width;
  state.tickerX = (state.tickerX - (state.reduced ? 20 : 90) * K * (1 / 60)) % sw;
  for (let x = state.tickerX; x < W; x += sw) ctx.fillText(strip, m + x, by + bandH / 2);
  ctx.restore();
  ctx.textBaseline = "top";
}

// ---------- цикл ----------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  src.width = w;
  src.height = h;
  display.width = w;
  display.height = h;
  // форма ввода — DOM поверх canvas: резервируем под неё место и выравниваем по бегущей строке
  const k = Math.min(innerWidth, innerHeight) / 720;
  const footCss = Math.max(innerHeight * 0.05, $("foot").offsetHeight + 10);
  document.documentElement.style.setProperty("--k", String(k));
  document.documentElement.style.setProperty("--foot", `${footCss}px`);
  state.foot = Math.round(footCss * dpr);
  state.reserve = Math.round(($("inject").offsetHeight + 14) * dpr);
}

function frame(now) {
  if (state.entered && state.swapDone && now - state.shownAt > holdTime(state.current)) triggerSwap(now);
  const g = glitchLevel(now);
  drawScreen(now);
  if (glitch) glitch.render(src, now / 1000, g);
  else dctx.drawImage(src, 0, 0);
  requestAnimationFrame(frame);
}

// ---------- ввод посетителя ----------

const form = $("inject");
const field = $("theme");
const status = $("status");
const submit = form.querySelector("button");
let busy = false;

const ERR = {
  429: "лимит внедрений: попробуй позже",
  422: "сигнал отклонён цензором",
  503: "эфир перегружен, держу локальный канал",
};

function inject(items, now) {
  state.queue.unshift(...items);
  triggerSwap(now);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const theme = field.value.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!theme || busy || !state.entered) return;
  busy = true;
  submit.disabled = true;
  status.textContent = "внедряю сигнал…";
  try {
    let items = [];
    let note = "";
    let blocked = false; // цензуру и лимит локальным режимом не обходим
    if (API_URL) {
      try {
        const res = await fetch(`${API_URL}/inject`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: theme }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          items = ((await res.json()).items || []).filter(valid);
          note = "сигнал внедрён";
        } else {
          blocked = res.status === 422 || res.status === 429;
          note = ERR[res.status] || "помехи в канале связи";
        }
      } catch {
        note = "помехи в канале связи";
      }
    }
    if (!items.length && !blocked) {
      items = localSignals(5, theme);
      note = note ? `${note} · локальный канал` : "сигнал внедрён (локально)";
    }
    status.textContent = note;
    if (items.length) {
      inject(items, performance.now());
      field.value = "";
    }
  } finally {
    setTimeout(() => {
      busy = false;
      submit.disabled = false;
    }, 4000);
  }
});

// ---------- вход и настройки ----------

$("enter").addEventListener("click", () => {
  state.reduced = $("calm").checked;
  state.entered = true;
  $("gate").hidden = true;
  triggerSwap(performance.now());
  field.focus({ preventScroll: true });
  refill();
});

$("calm").checked = state.reduced;
$("calmToggle").addEventListener("click", () => {
  state.reduced = !state.reduced;
  $("calmToggle").setAttribute("aria-pressed", String(state.reduced));
  $("calmToggle").textContent = state.reduced ? "щадящий режим: вкл" : "щадящий режим: выкл";
});
$("calmToggle").textContent = state.reduced ? "щадящий режим: вкл" : "щадящий режим: выкл";
$("calmToggle").setAttribute("aria-pressed", String(state.reduced));

addEventListener("resize", resize);
resize();
document.fonts?.load(`20px "Russo One"`);
document.fonts?.load(`20px "Share Tech Mono"`);
requestAnimationFrame(frame);
