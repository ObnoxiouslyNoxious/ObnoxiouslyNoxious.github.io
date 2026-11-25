import { generateMenuFont } from "./fontgen.js";
import { blankPng, solidPng, squarePng, toPng } from "./media.js";

const enc = new TextEncoder();

export async function materialize(files, store, onProgress) {
  const out = [];
  let done = 0;
  const fonts = new Map();
  const fontTiers = (f) => {
    const id = `${f.key}|${f.scale}|${f.label}|${f.stem}`;
    if (!fonts.has(id)) {
      fonts.set(id, store.get(f.key).arrayBuffer().then((buf) => generateMenuFont(new Uint8Array(buf), f.label, f.scale, f.stem)));
    }
    return fonts.get(id);
  };
  for (const f of files) {
    let blob;
    if (f.kind === "text") blob = new Blob([enc.encode(f.text)], { type: "text/plain" });
    else if (f.kind === "copy") blob = store.get(f.key);
    else if (f.kind === "png") blob = await toPng(store.get(f.key));
    else if (f.kind === "square") blob = await squarePng(f.key ? store.get(f.key) : null, f.size, f.label);
    else if (f.kind === "blank") blob = await blankPng(f.w, f.h);
    else if (f.kind === "solid") blob = await solidPng(f.w, f.h, f.color);
    else if (f.kind === "fontfnt") {
      const tier = (await fontTiers(f)).find((x) => x.tier === f.tier);
      blob = new Blob([enc.encode(tier.fnt)], { type: "text/plain" });
    } else if (f.kind === "fontpng") blob = (await fontTiers(f)).find((x) => x.tier === f.tier).png;
    else throw new Error("Unknown file kind: " + f.kind);
    out.push({ name: f.path, blob });
    done += 1;
    if (onProgress) onProgress(done, files.length);
  }
  return out;
}
