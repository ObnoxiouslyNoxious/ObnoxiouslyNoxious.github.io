import { LAYOUTS } from "./model.js";

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const LABELS = ["CONTINUE", "SOLO", "MULTIPLAYER", "MODS", "OPTIONS"];
export const STYLE_NAMES = { slide: "Horizontal slide", slidedown: "Vertical slide", fade: "Fade" };

export const MENU = { icon: 48, cornerPad: 24, margin: 32, buttonH: 38, cornerLeft: 1710 };

const defaultIcon = new Image();
defaultIcon.src = new URL("../img/MTF_Options_Icon.png", import.meta.url).href;

export function optionsIconBox(t, store) {
  const bmp = store.bitmap(t.options_icon, 256);
  const art = bmp || (defaultIcon.complete && defaultIcon.naturalWidth ? defaultIcon : null);
  const w0 = art ? art.naturalWidth || art.width : 1;
  const h0 = art ? art.naturalHeight || art.height : 1;
  const h = MENU.icon;
  return { art, x: MENU.cornerPad, y: 1080 - MENU.cornerPad - h, w: Math.min(h * (w0 / h0), 160), h };
}

function drawFadedBar(ctx, bar, art, fadeFraction) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.ceil(bar.w));
  off.height = Math.max(1, Math.ceil(bar.h));
  const oc = off.getContext("2d");
  if (art) {
    oc.drawImage(art, 0, 0, off.width, off.height);
  } else {
    oc.fillStyle = "rgba(0,0,0,0.85)";
    oc.fillRect(0, 0, off.width, off.height);
  }
  const g = oc.createLinearGradient(0, 0, off.width, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(fadeFraction, "rgba(0,0,0,1)");
  g.addColorStop(1 - fadeFraction, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  oc.globalCompositeOperation = "destination-in";
  oc.fillStyle = g;
  oc.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(off, bar.x, bar.y, bar.w, bar.h);
}

const tintCache = new Map();

function tinted(bmp, color, key) {
  const k = `${key}|${color}|${bmp.width}`;
  let c = tintCache.get(k);
  if (!c) {
    if (tintCache.size > 40) tintCache.clear();
    c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const x = c.getContext("2d");
    x.drawImage(bmp, 0, 0);
    x.globalCompositeOperation = "multiply";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(bmp, 0, 0);
    tintCache.set(k, c);
  }
  return c;
}

function captionArt(t, store) {
  const bmp = store.bitmap(t.caption, 1024);
  if (!bmp) return null;
  return t.caption_tint_on ? tinted(bmp, t.caption_tint, t.caption) : bmp;
}

export function drawCaptionBar(ctx, r, t, store) {
  const art = captionArt(t, store);
  if (art) {
    ctx.drawImage(art, r.x, r.y, r.w, r.h);
  } else {
    ctx.fillStyle = t.caption_tint_on ? t.caption_tint : "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

export function drawListHighlight(ctx, box, t, mode, store) {
  if (mode === "white") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    return "#000";
  }
  if (mode === "caption") {
    const art = store.bitmap(t.caption, 1024);
    if (art) {
      ctx.drawImage(t.highlight_tint_on ? tinted(art, t.highlight_tint, t.caption + "|highlight") : art, box.x, box.y, box.w, box.h);
      return "#fff";
    }
    if (t.highlight_tint_on) {
      ctx.fillStyle = t.highlight_tint;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      return "#fff";
    }
  }
  ctx.fillStyle = "rgba(77,77,77,0.5)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  return "#fff";
}

export function drawArrow(ctx, art, cx, cy, side, flip) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  if (art) {
    ctx.drawImage(art, -side / 2, -side / 2, side, side);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(side * 0.22, -side * 0.34);
    ctx.lineTo(-side * 0.26, 0);
    ctx.lineTo(side * 0.22, side * 0.34);
    ctx.lineTo(side * 0.1, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawCenteredInk(ctx, r, text) {
  const m = ctx.measureText(text);
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(text, r.x + (r.w - w) / 2 + m.actualBoundingBoxLeft, r.y + (r.h - h) / 2 + m.actualBoundingBoxAscent);
}

function lineMetrics(ctx) {
  const m = ctx.measureText("Mg");
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  return { ascent, height: ascent + descent };
}

export function drawHighlightTile(ctx, w, h, t, mode, selected, store) {
  ctx.fillStyle = "#101215";
  ctx.strokeStyle = selected ? "#3d7ad6" : "#3a3f46";
  ctx.lineWidth = selected ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, 6);
  ctx.fill();
  ctx.stroke();
  ctx.font = `bold 15px ${FONT}`;
  const lm = lineMetrics(ctx);
  const row = h / 5;
  ["CONTINUE", "SOLO", "MULTIPLAYER", "MODS"].forEach((name, i) => {
    const x = 26;
    const y = row * (i + 0.9);
    let col = "#dddddd";
    if (i === 1) {
      const box = { x: x - 12, y: y - lm.ascent - 2, w: ctx.measureText("MULTIPLAYER").width + 24, h: lm.height + 4 };
      col = drawListHighlight(ctx, box, t, mode, store);
    }
    ctx.fillStyle = col;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(name, x, y);
  });
}

export function drawCaptionSample(ctx, w, h, t, store) {
  const box = { x: 0, y: 0, w: Math.min(w, 213), h: 120 };
  const img = store.bitmap(t.card_default, 480);
  if (img) {
    const k = Math.max(box.w / img.width, box.h / img.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.drawImage(img, box.x + (box.w - img.width * k) / 2, box.y + (box.h - img.height * k) / 2, img.width * k, img.height * k);
    ctx.restore();
  } else {
    ctx.fillStyle = "#2b2f36";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = "#777";
    ctx.font = `14px ${FONT}`;
    drawCenteredInk(ctx, { x: 0, y: 0, w: box.w, h: box.h - 40 }, "card picture");
  }
  const bar = { x: box.x, y: box.y + box.h - 34, w: box.w, h: 34 };
  drawCaptionBar(ctx, bar, t, store);
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillStyle = "#fff";
  drawCenteredInk(ctx, bar, "SOLO");
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
}

export class Preview {
  constructor(canvas, store, getTheme, onInfo) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.store = store;
    this.getTheme = getTheme;
    this.onInfo = onInfo;
    this.index = 0;
    this.prevIndex = 0;
    this.anim = 1;
    this.layoutId = "";
    this.grid = false;
    this.logoBox = null;
    this.raf = 0;
    this.timer = 0;
    this.holdStart = performance.now();
    this.motionQueued = false;
    this.queued = false;
    if (!defaultIcon.complete) defaultIcon.addEventListener("load", () => this.redraw(), { once: true });
    this.schedule();
    new ResizeObserver(() => this.redraw()).observe(canvas);
  }

  stop() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
  }

  seamless(t) {
    return !!t.seamless_slide && !t.no_transition && t.backgrounds.length > 1 && (t.transition_style === "slide" || t.transition_style === "slidedown");
  }

  holdMs() {
    const t = this.getTheme();
    const h = t ? Math.trunc(Number(t.hold_ms)) : 8000;
    return Number.isFinite(h) && h > 0 ? h : 8000;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.step(1), Math.min(12000, Math.max(1500, this.holdMs())));
  }

  holdProgress(t) {
    const hold = this.holdMs();
    const el = performance.now() - this.holdStart;
    if (t.backgrounds.length < 2) return (((el % hold) + hold) % hold) / hold;
    return Math.min(1, Math.max(0, el / hold));
  }

  baseScale(t) {
    return Math.max(100, Math.min(150, Math.trunc(Number(t.image_scale)) || 100)) / 100;
  }

  motion(t, p) {
    const sc = this.scale || 1;
    return {
      dx: t.drift ? -(Number(t.drift_px) || 0) * sc * p : 0,
      z: this.baseScale(t) * (t.zoom ? 1 + (Math.max(1, Math.min(50, Number(t.zoom_pct) || 0)) / 100) * (0.5 - 0.5 * Math.cos(2 * Math.PI * p)) : 1),
    };
  }

  setStore(store) {
    this.store = store;
    this.index = 0;
    this.prevIndex = 0;
    this.anim = 1;
  }

  setLayout(id) {
    this.layoutId = id;
    this.redraw();
  }

  redraw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  step(d) {
    this.schedule();
    const t = this.getTheme();
    if (!t || t.backgrounds.length < 2) return;
    this.prevIndex = this.index;
    this.index = (this.index + d + t.backgrounds.length) % t.backgrounds.length;
    const ms = t.no_transition ? 0 : Math.trunc(Number(t.transition_ms)) * (this.seamless(t) ? 1 : 2);
    if (ms <= 0) {
      this.anim = 1;
      this.holdStart = performance.now();
      this.redraw();
      return;
    }
    const dur = Math.min(Math.max(ms, 150), 4000);
    const start = performance.now();
    this.holdStart = start + dur;
    cancelAnimationFrame(this.raf);
    const tick = (now) => {
      this.anim = Math.min(1, (now - start) / dur);
      this.draw();
      if (this.anim < 1) this.raf = requestAnimationFrame(tick);
    };
    this.anim = 0;
    this.raf = requestAnimationFrame(tick);
  }

  info() {
    const t = this.getTheme();
    if (!t) return "";
    if (t.backgrounds.length === 0) return "Slideshow: add a background Image.";
    if (t.backgrounds.length === 1) return "Slideshow: a single Image is shown still - no animation.";
    if (t.no_transition || t.transition_ms <= 0) return "Slideshow: Images change instantly (no animation).";
    return `Slideshow: ${STYLE_NAMES[t.transition_style] || t.transition_style}, ${t.transition_ms} ms${this.seamless(t) ? " per push" : " per half"}.`;
  }

  bg(i) {
    const t = this.getTheme();
    if (t.backgrounds.length) return this.store.bitmap(t.backgrounds[i % t.backgrounds.length], 960);
    if (t.clips.length) return this.store.bitmap(t.clips[0].still, 960);
    return null;
  }

  cover(ctx, r, bmp, ox = 0, oy = 0, z = 1) {
    const k = Math.max(r.w / bmp.width, r.h / bmp.height) * z;
    const w = bmp.width * k;
    const h = bmp.height * k;
    ctx.drawImage(bmp, r.x + (r.w - w) / 2 + ox, r.y + (r.h - h) / 2 + oy, w, h);
  }

  drawBackground(ctx, r, t) {
    const cur = this.bg(this.index);
    if (!cur) {
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, "#1b1e24");
      g.addColorStop(1, "#0a0b0d");
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "#555";
      ctx.font = `14px ${FONT}`;
      drawCenteredInk(ctx, r, "No background yet");
      return;
    }
    this.scale = r.w / 1920;
    if (this.anim >= 1 || t.backgrounds.length < 2) {
      const m = this.motion(t, this.holdProgress(t));
      this.cover(ctx, r, cur, m.dx, 0, m.z);
      return;
    }
    const style = t.transition_style;
    if (this.seamless(t)) {
      const old = this.bg(this.prevIndex);
      if (!old) return;
      const u = this.anim;
      const full = this.motion(t, 1);
      const sc = this.baseScale(t);
      if (style === "slide") {
        this.cover(ctx, r, old, full.dx - r.w * u, 0, full.z);
        this.cover(ctx, r, cur, Math.max(0, r.w + full.dx - r.w * u), 0, sc);
      } else {
        this.cover(ctx, r, old, full.dx, r.h * u, full.z);
        this.cover(ctx, r, cur, full.dx * (1 - u), -r.h * (1 - u), sc);
      }
      return;
    }
    if (this.anim < 0.5) {
      const u = this.anim * 2;
      const old = this.bg(this.prevIndex);
      if (!old) return;
      const full = this.motion(t, 1);
      if (style === "slide") this.cover(ctx, r, old, full.dx - r.w * u, 0, full.z);
      else if (style === "slidedown") this.cover(ctx, r, old, full.dx, r.h * u, full.z);
      else {
        this.cover(ctx, r, old, full.dx, 0, full.z);
        ctx.fillStyle = `rgba(0,0,0,${u})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    } else {
      const u = (this.anim - 0.5) * 2;
      const sc = this.baseScale(t);
      if (style === "slide") this.cover(ctx, r, cur, r.w * (1 - u), 0, sc);
      else if (style === "slidedown") this.cover(ctx, r, cur, 0, -r.h * (1 - u), sc);
      else {
        this.cover(ctx, r, cur, 0, 0, sc);
        ctx.fillStyle = `rgba(0,0,0,${1 - u})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
  }

  drawCards(ctx, r, s, t, lid) {
    const X = (v) => r.x + v * s;
    const Y = (v) => r.y + v * s;
    const names = LABELS.slice(1);
    const fullH = Math.max(160, Math.round(1080 * 0.196));
    const k = fullH / 696;
    const border = Math.max(2, Math.round(24 * k));
    const capH = Math.max(4, Math.round(120 * k));
    const thick = Math.max(1, Math.round(3 * k));
    const defaultPic = this.store.bitmap(t.card_default, 640);
    const drawCard = (i, x, y, w, h, vertical) => {
      const name = names[i];
      const selected = i === 0;
      ctx.fillStyle = "#000";
      ctx.fillRect(X(x), Y(y), w * s, h * s);
      const pic = this.store.bitmap(t.cards[name] || "", 640) || defaultPic;
      const wx = x + border, wy = y + border, ww = w - 2 * border, wh = h - 2 * border;
      ctx.save();
      ctx.beginPath();
      ctx.rect(X(wx), Y(wy), ww * s, wh * s);
      ctx.clip();
      if (pic) {
        const sc = Math.max(ww / pic.width, wh / pic.height);
        const dw = pic.width * sc, dh = pic.height * sc;
        ctx.drawImage(pic, X(wx + (ww - dw) / 2), Y(wy + (wh - dh) / 2), dw * s, dh * s);
      } else {
        ctx.fillStyle = "#23262b";
        ctx.fillRect(X(wx), Y(wy), ww * s, wh * s);
      }
      ctx.restore();
      if (vertical) {
        const fontPx = Math.max(10, Math.round(h * 0.2));
        const padX = Math.max(6, Math.round(h * 0.2));
        const padY = Math.max(2, Math.round(h * 0.07));
        ctx.font = `600 ${fontPx * s}px ${FONT}`;
        const textW = ctx.measureText(name).width / s;
        const barH = fontPx + 2 * padY;
        const barEnd = Math.min(w, border + padX + textW + border + padX);
        drawCaptionBar(ctx, { x: X(x), y: Y(y + h - barH), w: barEnd * s, h: barH * s }, t, this.store);
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(name, X(x + border + padX), Y(y + h - barH / 2));
      } else if (selected) {
        drawCaptionBar(ctx, { x: X(x), y: Y(y + h - capH), w: w * s, h: capH * s }, t, this.store);
        ctx.font = `600 ${Math.round(capH * 0.55) * s}px ${FONT}`;
        ctx.fillStyle = "#fff";
        drawCenteredInk(ctx, { x: X(x), y: Y(y + h - capH), w: w * s, h: capH * s }, name);
      }
      if (selected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = Math.max(1, thick * s);
        const half = ctx.lineWidth / 2;
        ctx.strokeRect(X(x) + half, Y(y) + half, w * s - ctx.lineWidth, h * s - ctx.lineWidth);
      }
    };
    if (lid === "cards_wide") {
      const margin = Math.max(12, Math.round(1080 * 0.03));
      const cardW = Math.round(1228 * k);
      const gap = Math.max(12, Math.round(28 * k));
      const inner = 1920 - 2 * margin;
      const capacity = Math.max(1, Math.floor((inner + gap) / (cardW + gap)));
      const shown = Math.min(names.length, capacity);
      const used = shown * cardW + (shown - 1) * gap;
      const startX = margin + (inner - used) / 2;
      const rowY = 1080 - margin - fullH;
      for (let i = 0; i < shown; i++) drawCard(i, startX + i * (cardW + gap), rowY, cardW, fullH, false);
    } else {
      const margin = Math.max(12, Math.round(1080 * 0.012));
      const gap = Math.max(6, Math.round(140 * 0.04));
      const x0 = Math.max(8, Math.round(1920 * 0.01));
      const restW = Math.round(1920 * 0.257);
      const vanillaY = Math.round(1080 * 0.43);
      let y0 = vanillaY;
      if (this.logoBox) y0 = Math.max(margin, Math.min(vanillaY, Math.round((this.logoBox.lr.y + this.logoBox.lr.h - r.y) / s + margin)));
      const limitBottom = Math.round(1080 * 0.9);
      const visible = 4;
      const shown = Math.min(names.length, visible);
      const avail = Math.max(120, limitBottom - y0);
      const cardH = Math.max(40, Math.floor((avail - (shown - 1) * gap) / shown));
      for (let i = 0; i < shown; i++) drawCard(i, x0, y0 + i * (cardH + gap), restW, cardH, true);
    }
  }

  draw() {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d0e10";
    ctx.fillRect(0, 0, cw, ch);
    const t = this.getTheme();
    if (!t) return;
    let rw;
    let rh;
    if (cw / ch > 16 / 9) {
      rw = (ch * 16) / 9;
      rh = ch;
    } else {
      rw = cw;
      rh = (cw * 9) / 16;
    }
    const r = { x: (cw - rw) / 2, y: (ch - rh) / 2, w: rw, h: rh };
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const s = r.w / 1920;
    this.drawBackground(ctx, r, t);

    this.logoBox = null;
    const size = this.store.size(t.logo);
    const logo = this.store.bitmap(t.logo, 1000);
    if (logo && size && size.w > 0 && size.h > 0) {
      const hh = (size.h * Math.max(1, t.logo_scale)) / 100;
      const ww = (hh * size.w) / size.h;
      let [x, y] = t.logo_place === "custom" ? [t.logo_x, t.logo_y] : [50, 50];
      if (this.layoutId === "left") [x, y] = [1920 - 50 - ww, 50];
      const lr = { x: r.x + x * s, y: r.y + y * s, w: ww * s, h: hh * s };
      ctx.drawImage(logo, lr.x, lr.y, lr.w, lr.h);
      this.logoBox = { lr, x, y, ww, hh };
    }

    const px = Math.max(6, Math.floor(26 * s));
    ctx.font = `bold ${px}px ${FONT}`;
    const lm = lineMetrics(ctx);
    const lid = this.layoutId;
    const icon = optionsIconBox(t, this.store);
    if (lid === "rail") {
      const pad = 20 * s;
      LABELS.forEach((name, i) => {
        const x = r.x + 90 * s;
        const y = r.y + r.h * 0.52 + i * 52 * s;
        let col = "#fff";
        if (i === 1) {
          const box = { x: x - pad, y: y - lm.ascent - 3 * s, w: ctx.measureText("MULTIPLAYER").width + 2 * pad, h: lm.height + 6 * s };
          col = drawListHighlight(ctx, box, t, t.list_highlight, this.store);
        }
        ctx.fillStyle = col;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillText(name, x, y);
      });
    } else if (lid === "left") {
      const pad = 20 * s;
      LABELS.forEach((name, i) => {
        const x = r.x + 78 * s;
        const y = r.y + r.h * 0.5 + (i - (LABELS.length - 1) / 2) * 52 * s + lm.ascent / 2;
        let col = "#fff";
        if (i === 1) {
          const box = { x: x - pad, y: y - lm.ascent - 3 * s, w: ctx.measureText("MULTIPLAYER").width + 2 * pad, h: lm.height + 6 * s };
          col = drawListHighlight(ctx, box, t, t.list_highlight, this.store);
        }
        ctx.fillStyle = col;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillText(name, x, y);
      });
    } else if (lid === "cards_wide" || lid === "cards_vertical") {
      this.drawCards(ctx, r, s, t, lid);
    } else if (lid === "strip") {
      const H = MENU.buttonH;
      const padH = Math.max(12, Math.round(H * 0.45));
      const gap = Math.max(16, Math.round(H * 0.7));
      ctx.font = `bold ${Math.max(6, Math.round(30 * s))}px ${FONT}`;
      const spanL = icon.x + icon.w + MENU.margin;
      const spanR = MENU.cornerLeft - MENU.margin;
      const span = spanR - spanL;
      const fadeW = span * 0.1;
      const inner = span - 2 * fadeW;
      const stripH = Math.max(Math.round(H * 1.7), icon.h);
      const stripY = 1080 - MENU.cornerPad - stripH;
      drawFadedBar(ctx, { x: r.x + spanL * s, y: r.y + stripY * s, w: span * s, h: stripH * s }, this.store.bitmap(t.strip, 960), 0.1);
      const widths = LABELS.map((name) => ctx.measureText(name).width / s + 2 * padH);
      const region = widths.reduce((a, b) => a + b, 0) + gap * (LABELS.length - 1);
      const arrowSize = H;
      const drawn = region + 2 * (arrowSize + gap);
      const startX = spanL + fadeW + (inner - drawn) / 2;
      const rowX = startX + arrowSize + gap;
      ctx.fillStyle = "#fff";
      let x = rowX;
      LABELS.forEach((name, i) => {
        drawCenteredInk(ctx, { x: r.x + x * s, y: r.y + stripY * s, w: widths[i] * s, h: stripH * s }, name);
        x += widths[i] + gap;
      });
      const arrow = this.store.bitmap(t.arrow_h, 128);
      const cy = r.y + (stripY + stripH / 2) * s;
      drawArrow(ctx, arrow, r.x + (startX + arrowSize / 2) * s, cy, arrowSize * s, false);
      drawArrow(ctx, arrow, r.x + (rowX + region + gap + arrowSize / 2) * s, cy, arrowSize * s, true);
    } else if (lid === "carousel") {
      const H = MENU.buttonH;
      const gap = Math.round(H * 0.3);
      const padH = Math.max(12, Math.round(H * 0.45));
      ctx.font = `bold ${Math.max(6, Math.round(30 * s))}px ${FONT}`;
      const widest = Math.max(...LABELS.map((name) => ctx.measureText(name).width / s));
      const boxW = widest + 2 * padH + 2 * gap;
      const total = 2 * H + 2 * gap + boxW;
      const startX = (1920 - total) / 2;
      const panelX = startX + H + gap;
      const cy = r.y + (icon.y + icon.h / 2) * s;
      ctx.fillStyle = "#fff";
      drawCenteredInk(ctx, { x: r.x + panelX * s, y: cy - (H / 2) * s, w: boxW * s, h: H * s }, "SOLO");
      const arrow = this.store.bitmap(t.arrow_h, 128);
      drawArrow(ctx, arrow, r.x + (startX + H / 2) * s, cy, H * s, false);
      drawArrow(ctx, arrow, r.x + (panelX + boxW + gap + H / 2) * s, cy, H * s, true);
    }
    if (icon.art) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(icon.art, r.x + icon.x * s, r.y + icon.y * s, icon.w * s, icon.h * s);
      ctx.globalAlpha = 1;
    }
    if (this.grid) this.drawGrid(ctx, r);
    ctx.restore();
    ctx.strokeStyle = "#3a3f46";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (this.onInfo) this.onInfo(this.info());
    if ((t.drift || t.zoom) && this.anim >= 1 && t.backgrounds.length && !this.motionQueued) {
      this.motionQueued = true;
      requestAnimationFrame(() => {
        this.motionQueued = false;
        this.draw();
      });
    }
  }

  drawGrid(ctx, r) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.235)";
    ctx.lineWidth = 1;
    for (const f of [0.25, 0.75]) {
      const xx = r.x + r.w * f;
      const yy = r.y + r.h * f;
      ctx.beginPath();
      ctx.moveTo(xx, r.y);
      ctx.lineTo(xx, r.y + r.h);
      ctx.moveTo(r.x, yy);
      ctx.lineTo(r.x + r.w, yy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,70,70,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, r.y);
    ctx.lineTo(cx, r.y + r.h);
    ctx.moveTo(r.x, cy);
    ctx.lineTo(r.x + r.w, cy);
    ctx.stroke();
    if (this.logoBox) {
      const { lr, x, y, ww, hh } = this.logoBox;
      ctx.strokeStyle = "rgba(80,200,255,0.92)";
      ctx.lineWidth = 1;
      ctx.strokeRect(lr.x, lr.y, lr.w, lr.h);
      const c = { x: lr.x + lr.w / 2, y: lr.y + lr.h / 2 };
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y);
      ctx.lineTo(c.x + 6, c.y);
      ctx.moveTo(c.x, c.y - 6);
      ctx.lineTo(c.x, c.y + 6);
      ctx.stroke();
      ctx.fillStyle = "rgba(80,200,255,0.92)";
      ctx.font = `12px ${FONT}`;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText(`logo X ${Math.round(x)}  Y ${Math.round(y)}  |  centre ${Math.round(x + ww / 2)}, ${Math.round(y + hh / 2)}  (screen centre 960, 540)`, lr.x + 4, lr.y + lr.h + 14);
    }
  }
}

export function layoutName(id) {
  return LAYOUTS[id] ? LAYOUTS[id][0] : id;
}
