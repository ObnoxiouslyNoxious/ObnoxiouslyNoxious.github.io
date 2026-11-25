export function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d === 0.5) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

export function toInt(v) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) throw new Error("Not a number: " + v);
  return n;
}

export function basename(p) {
  const s = String(p).split(/[\\/]/);
  return s[s.length - 1];
}

export function stem(p) {
  const n = basename(p);
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(0, i) : n;
}

export function pyTitle(text) {
  let out = "";
  let prevLetter = false;
  for (const ch of text) {
    const isLetter = /[A-Za-z]/.test(ch);
    out += isLetter ? (prevLetter ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevLetter = isLetter;
  }
  return out;
}

export function pyJsonDumps(value, indent) {
  return JSON.stringify(value, null, indent).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}
