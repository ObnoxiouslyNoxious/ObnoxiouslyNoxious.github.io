export const GOOGLE_FONT_NAMES = [
  "Pixelify Sans", "Press Start 2P", "VT323", "Silkscreen", "Germania One", "Cinzel", "Special Elite", "Creepster",
  "Metal Mania", "Eater", "Butcherman", "Nosifer", "Staatliches", "Bebas Neue", "Oswald", "Anton", "Teko",
  "Black Ops One", "Orbitron", "Rajdhani", "Saira Condensed", "Permanent Marker", "Rock Salt", "UnifrakturMaguntia",
  "MedievalSharp", "Jolly Lodger", "Fredericka the Great", "Cabin Sketch", "Roboto Condensed", "Share Tech Mono",
  "Cutive Mono", "Rubik Glitch", "Kelly Slab", "New Rocker", "Uncial Antiqua", "Almendra",
];

const ROOT = "https://raw.githubusercontent.com/google/fonts/main/";
const FOLDERS = [["ofl", ["OFL.txt"]], ["apache", ["LICENSE.txt"]], ["ufl", ["UFL.txt"]]];
const TTF_MAGIC = ["0,1,0,0", "79,84,84,79", "116,114,117,101", "116,116,99,102"];

const dirName = (family) => family.toLowerCase().replace(/[^a-z0-9]/g, "");
const fileStem = (family) => family.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Font";

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

function pickFilename(meta) {
  const blocks = [...meta.matchAll(/fonts\s*\{([^}]*)\}/g)].map((m) => m[1]);
  let best = null;
  for (const b of blocks) {
    const file = (b.match(/filename:\s*"([^"]+)"/) || [])[1];
    if (!file || !/\.ttf$/i.test(file)) continue;
    const style = (b.match(/style:\s*"([^"]+)"/) || [])[1];
    const weight = Number((b.match(/weight:\s*(\d+)/) || [])[1]) || 400;
    const score = (style === "normal" ? 0 : 1000) + Math.abs(weight - 400);
    if (!best || score < best.score) best = { file, score };
  }
  return best ? best.file : "";
}

export async function downloadGoogleFont(family) {
  const name = String(family).trim();
  if (!name) throw new Error("Type the name of a Google Font first.");
  const dir = dirName(name);
  let folder = "";
  let file = "";
  try {
    for (const [f] of FOLDERS) {
      const meta = await fetchBytes(`${ROOT}${f}/${dir}/METADATA.pb`);
      if (meta) {
        folder = f;
        file = pickFilename(new TextDecoder().decode(meta));
        break;
      }
    }
  } catch {
    throw new Error("Could not reach Google's font repository. Check your connection, or download the .ttf yourself and use Choose.");
  }
  if (!folder || !file) {
    throw new Error(`Could not find "${name}" in Google's font repository. Check the spelling, or download the .ttf yourself and use Choose.`);
  }
  let bytes = null;
  try {
    bytes = await fetchBytes(`${ROOT}${folder}/${dir}/${encodeURIComponent(file)}`);
  } catch {
    bytes = null;
  }
  if (!bytes || !TTF_MAGIC.includes(Array.from(bytes.slice(0, 4)).join(","))) {
    throw new Error(`Could not download "${name}". Download the .ttf yourself and use Choose.`);
  }
  const stem = fileStem(name);
  const font = new File([bytes], `${stem}.ttf`, { type: "font/ttf" });
  let license = null;
  for (const lic of FOLDERS.find(([f]) => f === folder)[1]) {
    try {
      const text = await fetchBytes(`${ROOT}${folder}/${dir}/${lic}`);
      if (text) {
        license = new File([text], `OFL-${stem}.txt`, { type: "text/plain" });
        break;
      }
    } catch {
      license = null;
    }
  }
  return { font, license };
}
