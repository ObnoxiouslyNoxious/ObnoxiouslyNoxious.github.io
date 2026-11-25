const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Update(crc, bytes) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function crc32Blob(blob, chunk = 4 * 1024 * 1024) {
  let crc = 0;
  for (let i = 0; i < blob.size; i += chunk) {
    crc = crc32Update(crc, new Uint8Array(await blob.slice(i, i + chunk).arrayBuffer()));
  }
  return crc;
}

const LIMIT = 0xffffffff;

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time & 0xffff, date & 0xffff];
}

export async function buildZip(entries, onProgress) {
  const enc = new TextEncoder();
  const [dosTime, dosDate] = dosDateTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;
  let done = 0;
  if (entries.length > 0xfffe) throw new Error("Too many files for a zip.");
  for (const { name, blob } of entries) {
    if (blob.size > LIMIT) throw new Error(`${name} is larger than 4 GB, which a plain zip cannot hold.`);
    const nameBytes = enc.encode(name);
    const crc = await crc32Blob(blob);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, blob.size, true);
    local.setUint32(22, blob.size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, nameBytes, blob);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, blob.size, true);
    cd.setUint32(24, blob.size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, nameBytes);
    offset += 30 + nameBytes.length + blob.size;
    if (offset > LIMIT) throw new Error("The finished mod is larger than 4 GB, which a plain zip cannot hold.");
    done += 1;
    if (onProgress) onProgress(done, entries.length);
  }
  let cdSize = 0;
  for (const p of central) cdSize += p.byteLength;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

export async function readZip(blob) {
  const tailLen = Math.min(blob.size, 65536 + 22);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not a zip file.");
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === LIMIT || cdOffset === LIMIT) throw new Error("Zip64 archives are not supported.");
  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cv = new DataView(cd.buffer);
  const dec = new TextDecoder();
  const entries = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cv.getUint32(p, true) !== 0x02014b50) throw new Error("The zip's file list is damaged.");
    const method = cv.getUint16(p + 10, true);
    const csize = cv.getUint32(p + 20, true);
    const size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const localOffset = cv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, csize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    async get(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.size > 0x7fffffff) throw new Error(`${name} is too large to open in the browser.`);
      const lh = new DataView(await blob.slice(e.localOffset, e.localOffset + 30).arrayBuffer());
      const start = e.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      const raw = blob.slice(start, start + e.csize);
      if (e.method === 0) return raw;
      if (e.method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
      throw new Error(`${name} uses a zip compression method this page cannot read.`);
    },
  };
}
