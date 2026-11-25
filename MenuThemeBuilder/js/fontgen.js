import { pyRound } from "./util.js";

export const FONT_TIERS = [["", 18], ["1x", 24], ["2x", 27], ["3x", 34], ["4x", 37]];
const ATLAS_SIZES = [256, 512, 1024, 2048];

export class FontError extends Error {}

export function charset() {
  const ids = [];
  for (let i = 32; i < 127; i += 1) ids.push(i);
  for (let i = 161; i < 384; i += 1) ids.push(i);
  ids.push(8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226, 8230, 8240, 8249, 8250, 8364, 8482);
  return ids;
}

export function pack(glyphs, spacing = 1, sizes = ATLAS_SIZES) {
  const items = glyphs.filter((g) => g.w && g.h);
  const order = items.slice().sort((a, b) => (b.h - a.h) || (b.w - a.w) || (a.id - b.id));
  for (const size of sizes) {
    let x = spacing;
    let y = spacing;
    let shelf = 0;
    let ok = true;
    for (const g of order) {
      if (x + g.w + spacing > size) {
        x = spacing;
        y = y + shelf + spacing;
        shelf = 0;
      }
      if (y + g.h + spacing > size || g.w + 2 * spacing > size) {
        ok = false;
        break;
      }
      g.x = x;
      g.y = y;
      x += g.w + spacing;
      shelf = Math.max(shelf, g.h);
    }
    if (ok) {
      for (const g of glyphs) {
        if (g.x === undefined) g.x = 0;
        if (g.y === undefined) g.y = 0;
      }
      return size;
    }
  }
  throw new FontError("The font is too large to fit in a texture. Lower 'Size adjustment' and try again.");
}

export function normalizeLines(glyphs, ascent) {
  const ink = glyphs.filter((g) => g.h);
  if (!ink.length) throw new FontError("The font has no visible letters.");
  const top = Math.min(...ink.map((g) => g.yo));
  const bottom = Math.max(...ink.map((g) => g.yo + g.h));
  const lineH = bottom - top + 1;
  for (const g of glyphs) if (g.h) g.yo -= top;
  const base = Math.max(1, Math.min(lineH, pyRound(ascent - top)));
  return [lineH, base];
}

const pad4 = (v) => String(v).padEnd(4, " ");

export function fntText(face, px, lineH, base, atlas, pageFile, glyphs) {
  const L = [
    `info face="${face}" size=${px} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0`,
    `common lineHeight=${lineH} base=${base} scaleW=${atlas} scaleH=${atlas} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4`,
    `page id=0 file="${pageFile}"`,
    `chars count=${glyphs.length}`,
  ];
  for (const g of glyphs.slice().sort((a, b) => a.id - b.id)) {
    L.push(`char id=${pad4(g.id)} x=${pad4(g.x)} y=${pad4(g.y)} width=${pad4(g.w)} height=${pad4(g.h)} xoffset=${pad4(g.xo)} yoffset=${pad4(g.yo)} xadvance=${pad4(g.adv)} page=0  chnl=15`);
  }
  return L.join("\r\n") + "\r\n";
}

export function cmapCoverage(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  let base = 0;
  const sig = tag(0);
  if (sig === "ttcf") base = dv.getUint32(12);
  const known = [0x00010000, 0x4f54544f, 0x74727565];
  if (!known.includes(dv.getUint32(base)) && sig !== "ttcf") return null;
  const count = dv.getUint16(base + 4);
  let cmapOff = -1;
  for (let i = 0; i < count; i += 1) {
    const rec = base + 12 + i * 16;
    if (tag(rec) === "cmap") cmapOff = dv.getUint32(rec + 8);
  }
  if (cmapOff < 0) return null;
  const n = dv.getUint16(cmapOff + 2);
  const covered = new Set();
  let best = null;
  for (let i = 0; i < n; i += 1) {
    const pid = dv.getUint16(cmapOff + 4 + i * 8);
    const eid = dv.getUint16(cmapOff + 6 + i * 8);
    const off = cmapOff + dv.getUint32(cmapOff + 8 + i * 8);
    const fmt = dv.getUint16(off);
    const unicode = pid === 0 || (pid === 3 && (eid === 1 || eid === 10));
    if (!unicode || (fmt !== 4 && fmt !== 12)) continue;
    if (!best || fmt === 12) best = { off, fmt };
  }
  if (!best) return null;
  if (best.fmt === 4) {
    const o = best.off;
    const segX2 = dv.getUint16(o + 6);
    const endO = o + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < segX2 / 2; s += 1) {
      const end = dv.getUint16(endO + s * 2);
      const start = dv.getUint16(startO + s * 2);
      const delta = dv.getInt16(deltaO + s * 2);
      const range = dv.getUint16(rangeO + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c += 1) {
        let gid;
        if (range === 0) gid = (c + delta) & 0xffff;
        else {
          const g = dv.getUint16(rangeO + s * 2 + range + (c - start) * 2);
          gid = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (gid !== 0) covered.add(c);
      }
    }
  } else {
    const o = best.off;
    const groups = dv.getUint32(o + 12);
    for (let g = 0; g < groups; g += 1) {
      const start = dv.getUint32(o + 16 + g * 12);
      const end = dv.getUint32(o + 20 + g * 12);
      const gid0 = dv.getUint32(o + 24 + g * 12);
      for (let c = start; c <= end && c - start < 70000; c += 1) if (gid0 + (c - start) !== 0) covered.add(c);
    }
  }
  return covered;
}

let familyCounter = 0;

export async function loadFontFace(bytes) {
  familyCounter += 1;
  const family = `MTBFont${familyCounter}`;
  const face = new FontFace(family, bytes.slice().buffer);
  await face.load();
  document.fonts.add(face);
  return { family, face };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function alphaBox(data, w, h) {
  let top = -1;
  let bottom = -1;
  let left = w;
  let right = -1;
  for (let y = 0; y < h; y += 1) {
    let rowLeft = -1;
    let rowRight = -1;
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] !== 0) {
        if (rowLeft < 0) rowLeft = x;
        rowRight = x;
      }
    }
    if (rowLeft >= 0) {
      if (top < 0) top = y;
      bottom = y;
      left = Math.min(left, rowLeft);
      right = Math.max(right, rowRight);
    }
  }
  return top < 0 ? null : [left, top, right, bottom];
}

function renderTier(family, px, covered) {
  const probe = makeCanvas(8, 8).getContext("2d");
  const font = `${px}px "${family}"`;
  probe.font = font;
  const m = probe.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent !== undefined ? m.fontBoundingBoxAscent : px * 0.8;
  const descent = m.fontBoundingBoxDescent !== undefined ? m.fontBoundingBoxDescent : px * 0.2;
  const height = ascent + descent;
  const lineH = Math.ceil(height);
  const pad = Math.max(2, Math.floor(px / 4));
  const padY = pad + Math.max(0, Math.ceil(height - px * 2));
  const glyphs = [];
  for (const cid of charset()) {
    const ch = String.fromCodePoint(cid);
    if (cid !== 32 && covered && !covered.has(cid)) continue;
    const adv = Math.max(1, pyRound(probe.measureText(ch).width));
    if (cid === 32) {
      glyphs.push({ id: 32, w: 0, h: 0, xo: 0, yo: 0, adv, img: null });
      continue;
    }
    const w = adv + 2 * pad + 2;
    const h = lineH + 2 * padY;
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(ch, pad, padY + ascent);
    const data = ctx.getImageData(0, 0, w, h).data;
    if (!covered) {
      const spare = makeCanvas(w, h);
      const sctx = spare.getContext("2d", { willReadFrequently: true });
      sctx.font = `${px}px "MTBNoSuchFont"`;
      sctx.textBaseline = "alphabetic";
      sctx.fillStyle = "#ffffff";
      sctx.fillText(ch, pad, padY + ascent);
      const other = sctx.getImageData(0, 0, w, h).data;
      let same = other.length === data.length;
      for (let i = 3; same && i < data.length; i += 4) if (data[i] !== other[i]) same = false;
      if (same) continue;
    }
    const box = alphaBox(data, w, h);
    if (!box) {
      glyphs.push({ id: cid, w: 0, h: 0, xo: 0, yo: 0, adv, img: null });
      continue;
    }
    const [x0, y0, x1, y1] = box;
    const gw = x1 - x0 + 1;
    const gh = y1 - y0 + 1;
    const crop = makeCanvas(gw, gh);
    crop.getContext("2d").putImageData(ctx.getImageData(x0, y0, gw, gh), 0, 0);
    glyphs.push({ id: cid, w: gw, h: gh, xo: x0 - pad, yo: y0 - padY, adv, img: crop });
  }
  const [normLine, base] = normalizeLines(glyphs, ascent);
  return { glyphs, lineH: normLine, base };
}

async function canvasPng(canvas) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

export async function generateMenuFont(bytes, label, scalePercent, stemName, onProgress) {
  const { family } = await loadFontFace(bytes);
  const face = String(label).replace(/"/g, "'");
  let covered = null;
  try {
    covered = cmapCoverage(bytes);
  } catch {
    covered = null;
  }
  const out = [];
  let step = 0;
  for (const [tier, size] of FONT_TIERS) {
    const px = Math.max(6, pyRound((size * scalePercent) / 100));
    const { glyphs, lineH, base } = renderTier(family, px, covered);
    if (glyphs.filter((g) => g.id >= 33 && g.id <= 126).length < 60) {
      throw new FontError(`'${label}' has too few Latin letters to be used as a menu font.`);
    }
    const atlasSize = pack(glyphs);
    const atlas = makeCanvas(atlasSize, atlasSize);
    const actx = atlas.getContext("2d");
    for (const g of glyphs) if (g.img) actx.drawImage(g.img, g.x, g.y);
    const png = await canvasPng(atlas);
    out.push({ tier, fnt: fntText(face, px, lineH, base, atlasSize, `${stemName}_0.png`, glyphs), png, px, glyphCount: glyphs.length });
    step += 1;
    if (onProgress) onProgress(step, FONT_TIERS.length);
  }
  return out;
}

function nameString(dv, start, len, platform) {
  let s = "";
  if (platform === 1) {
    for (let i = 0; i < len; i += 1) s += String.fromCharCode(dv.getUint8(start + i));
  } else {
    for (let i = 0; i + 1 < len; i += 2) s += String.fromCharCode(dv.getUint16(start + i));
  }
  return s.trim();
}

export function fontFamilyName(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let base = 0;
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) === "ttcf") base = dv.getUint32(12);
    const count = dv.getUint16(base + 4);
    let off = -1;
    for (let i = 0; i < count; i += 1) {
      const rec = base + 12 + i * 16;
      const tag = String.fromCharCode(dv.getUint8(rec), dv.getUint8(rec + 1), dv.getUint8(rec + 2), dv.getUint8(rec + 3));
      if (tag === "name") off = dv.getUint32(rec + 8);
    }
    if (off < 0) return "";
    const n = dv.getUint16(off + 2);
    const strOff = off + dv.getUint16(off + 4);
    let best = "";
    let bestScore = -1;
    for (let i = 0; i < n; i += 1) {
      const rec = off + 6 + i * 12;
      const platform = dv.getUint16(rec);
      const nameId = dv.getUint16(rec + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const value = nameString(dv, strOff + dv.getUint16(rec + 10), dv.getUint16(rec + 8), platform);
      const score = (nameId === 16 ? 2 : 0) + (platform === 3 ? 1 : 0);
      if (value && score > bestScore) {
        best = value;
        bestScore = score;
      }
    }
    return best;
  } catch {
    return "";
  }
}
