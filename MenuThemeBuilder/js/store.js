import { readImageSize } from "./media.js";

export class AssetStore {
  constructor() {
    this.files = new Map();
    this.sizes = new Map();
    this.bitmaps = new Map();
    this.pending = new Set();
    this.urls = new Map();
    this.n = 0;
    this.onchange = null;
  }

  add(file) {
    this.n += 1;
    const key = `${this.n}/${file.name}`;
    this.files.set(key, file);
    return key;
  }

  async addImage(file) {
    const key = this.add(file);
    try {
      await this.loadSize(key);
    } catch {
      this.files.delete(key);
      throw new Error(`${file.name} could not be read as an Image. PNG, JPG, WebP, GIF and BMP work.`);
    }
    return key;
  }

  get(key) {
    return this.files.get(key);
  }

  has(key) {
    return this.files.has(key);
  }

  size(key) {
    return this.sizes.get(key) || null;
  }

  async loadSize(key) {
    if (this.sizes.has(key)) return this.sizes.get(key);
    const s = await readImageSize(this.files.get(key));
    this.sizes.set(key, s);
    return s;
  }

  async ensureSizes(keys) {
    for (const k of keys) {
      if (k && this.files.has(k) && !this.sizes.has(k)) {
        try {
          await this.loadSize(k);
        } catch {
          this.sizes.set(k, null);
        }
      }
    }
  }

  url(key) {
    let u = this.urls.get(key);
    if (!u) {
      u = URL.createObjectURL(this.files.get(key));
      this.urls.set(key, u);
    }
    return u;
  }

  bitmap(key, maxW) {
    if (!key || !this.files.has(key)) return null;
    const ck = `${key}|${maxW}`;
    const hit = this.bitmaps.get(ck);
    if (hit) return hit === "x" ? null : hit;
    if (!this.pending.has(ck)) {
      this.pending.add(ck);
      this.loadBitmap(key, maxW, ck);
    }
    return null;
  }

  async loadBitmap(key, maxW, ck) {
    try {
      const size = await this.loadSize(key);
      const opts = maxW && size.w > maxW ? { resizeWidth: maxW, resizeQuality: "medium" } : undefined;
      this.bitmaps.set(ck, await createImageBitmap(this.files.get(key), opts));
    } catch {
      this.bitmaps.set(ck, "x");
    }
    this.pending.delete(ck);
    if (this.onchange) this.onchange();
  }

  dispose() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    for (const b of this.bitmaps.values()) if (b !== "x") b.close();
    this.files.clear();
    this.sizes.clear();
    this.bitmaps.clear();
    this.urls.clear();
    this.onchange = null;
  }
}
