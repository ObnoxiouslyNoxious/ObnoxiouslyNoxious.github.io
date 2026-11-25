import { pyRound } from "./util.js";

const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));

export async function readOggInfo(blob) {
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  if (head.length < 28 || ascii(head, 0, 4) !== "OggS") throw new Error("Not an Ogg file");
  const nsegs = head[26];
  let segSum = 0;
  for (let i = 0; i < nsegs; i++) segSum += head[27 + i] || 0;
  const payload = head.subarray(27 + nsegs, 27 + nsegs + segSum);
  let codec;
  let channels;
  let rate;
  let preskip = 0;
  const pv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (payload.length >= 16 && payload[0] === 1 && ascii(payload, 1, 7) === "vorbis") {
    codec = "vorbis";
    channels = payload[11];
    rate = pv.getUint32(12, true);
  } else if (payload.length >= 12 && ascii(payload, 0, 8) === "OpusHead") {
    codec = "opus";
    channels = payload[9];
    rate = 48000;
    preskip = pv.getUint16(10, true);
  } else {
    throw new Error("Unsupported audio codec inside the Ogg container");
  }
  const size = blob.size;
  const tail = new Uint8Array(await blob.slice(Math.max(0, size - 65536)).arrayBuffer());
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const findLast = (from) => {
    for (let i = Math.min(from, tail.length - 4); i >= 0; i--) {
      if (tail[i] === 0x4f && tail[i + 1] === 0x67 && tail[i + 2] === 0x67 && tail[i + 3] === 0x53) return i;
    }
    return -1;
  };
  let idx = findLast(tail.length);
  let granule = -1n;
  while (idx !== -1) {
    if (idx + 14 <= tail.length && tail[idx + 4] === 0) {
      granule = tv.getBigInt64(idx + 6, true);
      if (granule >= 0n) break;
    }
    idx = idx > 0 ? findLast(idx - 1) : -1;
  }
  if (granule < 0n || !rate) throw new Error("Could not work out the length of this file");
  return { duration_ms: pyRound(((Number(granule) - preskip) / rate) * 1000), rate, channels, codec };
}

export async function readBikInfo(blob) {
  const h = new Uint8Array(await blob.slice(0, 40).arrayBuffer());
  if (ascii(h, 0, 3) !== "BIK" || h.length < 36) throw new Error("Not a Bink (.bik) file");
  const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
  const frames = v.getUint32(8, true);
  const width = v.getUint32(20, true);
  const height = v.getUint32(24, true);
  const num = v.getUint32(28, true);
  const den = v.getUint32(32, true);
  const duration_ms = num ? pyRound(((frames * den) / num) * 1000) : 0;
  return { width, height, duration_ms };
}

export async function isPng(blob) {
  const h = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return h.length === 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => h[i] === b);
}

export async function readImageSize(blob) {
  const bmp = await createImageBitmap(blob);
  const size = { w: bmp.width, h: bmp.height };
  bmp.close();
  return size;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the PNG"))), "image/png");
  });
}

export async function toPng(blob) {
  if (await isPng(blob)) return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return canvasBlob(canvas);
}

export async function solidPng(w, h, color) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = color;
  x.fillRect(0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

export async function blankPng(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  return canvasBlob(canvas);
}

export async function squarePng(blob, size, label) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#23262b";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  if (blob) {
    const bmp = await createImageBitmap(blob);
    const s = Math.max(size / bmp.width, size / bmp.height);
    const w = Math.floor(bmp.width * s + 0.5);
    const h = Math.floor(bmp.height * s + 0.5);
    ctx.drawImage(bmp, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    bmp.close();
  } else {
    ctx.fillStyle = "#e8e8e8";
    ctx.font = `bold ${Math.max(8, Math.floor(size / 3))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.slice(0, 3).toUpperCase(), size / 2, size / 2);
  }
  return canvasBlob(canvas);
}
