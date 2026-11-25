import { basename, pyTitle, stem } from "./util.js";
import { BUILDER_VERSION } from "./version.js";

export const PROJECT_FILE = "ThemeProject.json";

export const BUTTON_IDS = ["LATESTSAVE", "SOLO", "COOP", "MULTIPLAYER", "OPTIONS", "MODS",
  "WORKSHOP", "TUTORIAL", "CREDITS", "EXIT", "LOAD"];

export const LAYOUTS = {
  rail: ["Zomboid (vanilla list)", "LayoutRail", "Zomboid"],
  left: ["Stacked", "LayoutLeft", "Stacked"],
  strip: ["Strip", "LayoutStrip", "Strip"],
  carousel: ["Carousel", "LayoutCarousel", "Carousel"],
  cards_wide: ["Horizontal Cards", "LayoutCardsWide", "Horizontal Cards"],
  cards_vertical: ["Vertical Cards", "LayoutCardsVertical", "Vertical Cards"],
};

export const TRANSITIONS = [["slide", "Horizontal Slide"], ["slidedown", "Vertical Slide"], ["fade", "Fade"]];

export const PATH_FIELDS = ["poster", "icon", "logo", "logo_alt", "options_icon", "strip",
  "arrow_h", "arrow_v", "caption", "card_default"];

export function newFont() {
  return { file: "", name: "", scale: 100, license: "" };
}

export function newTrack() {
  return { path: "", title: "", length_ms: 0 };
}

export function newClip() {
  return { video: "", still: "", sound: "", width: 1920, height: 1080, length_ms: 0,
    sound_volume: 100, restart_video: false, restart_sound: false };
}

export function newTheme() {
  return {
    name: "My Menu Theme",
    theme_id: "MyMenuTheme",
    prefix: "MMT",
    auto_ids: true,
    author: "",
    description: "A main menu Theme for Menu Theme Framework.",
    mod_version: "1.0.0",
    version_min: "42.19.0",
    poster: "",
    icon: "",
    backgrounds: [],
    hold_ms: 8000,
    transition_ms: 450,
    transition_style: "slide",
    no_transition: false,
    drift: false,
    drift_px: 30,
    zoom: false,
    zoom_pct: 8,
    image_scale: 100,
    seamless_slide: true,
    logo: "",
    logo_alt: "",
    logo_scale: 100,
    logo_slide: true,
    buttons_instant: false,
    logo_place: "default",
    logo_x: 60,
    logo_y: 40,
    options_icon: "",
    layouts: ["rail", "left", "strip", "carousel", "cards_wide", "cards_vertical"],
    default_layout: "cards_wide",
    strip: "",
    arrow_h: "",
    arrow_v: "",
    list_highlight: "default",
    caption: "",
    caption_tint_on: false,
    caption_tint: "#000000",
    highlight_tint_on: false,
    highlight_tint: "#ffffff",
    card_default: "",
    cards: {},
    fonts: [],
    tracks: [],
    repeat_one: false,
    music_volume: 50,
    video_volume: 50,
    logo_fade_ms: 1000,
    video_mode: "random",
    default_bg_mode: "images",
    clips: [],
    credits_text: "",
    auto_credits: true,
    auto_music: false,
    auto_fonts: false,
    about: "",
  };
}

export function modId(t) {
  return t.theme_id + "B42";
}

export function slug(text, dflt = "Theme") {
  let s = pyTitle(text.replace(/[^A-Za-z0-9]+/g, " ")).replace(/ /g, "");
  if (!s) s = dflt;
  if (/[0-9]/.test(s[0])) s = "T" + s;
  return s;
}

export function autoPrefix(name) {
  const words = name.match(/[A-Za-z0-9]+/g) || [];
  let p = words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  if (p.length < 3) p = (slug(name).slice(0, 3) || "THM").toUpperCase();
  if (/[0-9]/.test(p[0])) p = "T" + p;
  return p;
}

export function sanitizeStem(text) {
  const s = text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s || "File";
}

export function parseCredits(text) {
  const groups = [];
  let cur = null;
  for (const line of (text || "").split(/\r\n|[\n\r\x0b\x0c\x1c-\x1e\x85\u2028\u2029]/)) {
    const s = line.trim();
    if (!s) continue;
    if (s.startsWith("#")) {
      cur = { header: s.replace(/^#+/, "").trim(), rows: [] };
      groups.push(cur);
    } else {
      if (cur === null) {
        cur = { header: "", rows: [] };
        groups.push(cur);
      }
      cur.rows.push(s);
    }
  }
  return groups.filter((g) => g.header || g.rows.length);
}

export function creditHeader(text) {
  const h = (text || "").trim().replace(/:+$/, "").trim();
  return h ? h + ":" : "";
}

export const BUILDER_CREDIT = "JFlowersB & ObnoxiouslyNoxious";

export function finalCreditGroups(t) {
  const groups = [];
  const add = (header, rows) => {
    header = creditHeader(header);
    rows = rows.filter((r) => r && r.trim()).map((r) => r.trim());
    if (!rows.length) return;
    for (const g of groups) {
      if (g.header.toLowerCase() === header.toLowerCase()) {
        for (const r of rows) if (!g.rows.includes(r)) g.rows.push(r);
        return;
      }
    }
    groups.push({ header, rows: [...new Set(rows)] });
  };
  if (t.auto_credits) {
    add("Theme", [t.author]);
  }
  if (t.auto_music) add("Music", t.tracks.map((tr) => tr.title || stem(tr.path)));
  if (t.auto_fonts) add("Fonts", t.fonts.filter((f) => f.file).map((f) => f.name));
  for (const g of parseCredits(t.credits_text)) add(g.header, g.rows);
  add("Menu Theme Builder", [BUILDER_CREDIT]);
  return groups;
}

export function stampText() {
  return `Built with Menu Theme Builder (Version ${BUILDER_VERSION})`;
}

export function creditScreenGroups(t) {
  const groups = finalCreditGroups(t);
  groups.push({ header: "Menu Theme Framework:", rows: ["ObnoxiouslyNoxious"] });
  if (t.about.trim()) groups.push({ header: "About this Mod:", rows: [t.about.trim()] });
  groups.push({ header: stampText(), rows: [] });
  return groups;
}

export function mapPaths(theme, fn) {
  const t = structuredClone(theme);
  for (const a of PATH_FIELDS) t[a] = t[a] ? fn(t[a]) : "";
  for (const f of t.fonts) {
    f.file = f.file ? fn(f.file) : "";
    f.license = f.license ? fn(f.license) : "";
  }
  t.backgrounds = t.backgrounds.map((p) => fn(p));
  const cards = {};
  for (const [k, v] of Object.entries(t.cards)) if (v) cards[k] = fn(v);
  t.cards = cards;
  for (const tr of t.tracks) tr.path = tr.path ? fn(tr.path) : "";
  for (const c of t.clips) {
    c.video = c.video ? fn(c.video) : "";
    c.still = c.still ? fn(c.still) : "";
    c.sound = c.sound ? fn(c.sound) : "";
  }
  return t;
}

function coerce(value, dflt) {
  if (typeof dflt === "boolean") return typeof value === "boolean" ? value : dflt;
  if (typeof dflt === "number") {
    if (typeof value === "boolean" || value === null) return dflt;
    if (typeof value === "string" && !/^\s*[+-]?\d+\s*$/.test(value)) return dflt;
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? n : dflt;
  }
  if (typeof dflt === "string") return typeof value === "string" ? value : dflt;
  if (Array.isArray(dflt)) return Array.isArray(value) ? value : dflt;
  if (dflt && typeof dflt === "object") return value && typeof value === "object" && !Array.isArray(value) ? value : dflt;
  return value;
}

function build(base, data) {
  const out = base();
  for (const k of Object.keys(out)) if (k in data) out[k] = coerce(data[k], out[k]);
  return out;
}

export function loadProject(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(PROJECT_FILE + " is not a valid project file.");
  const items = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) : []);
  const tracks = items(data.tracks).map((x) => build(newTrack, x));
  const clips = items(data.clips).map((x) => build(newClip, x));
  let fonts = items(data.fonts).map((x) => build(newFont, x));
  if (!fonts.length && typeof data.font_file === "string" && data.font_file) {
    fonts = [{ file: data.font_file, name: coerce(data.font_name, ""), scale: coerce(data.font_scale, 100), license: coerce(data.font_license, "") }];
  }
  const rest = { ...data };
  delete rest.tracks;
  delete rest.clips;
  delete rest.fonts;
  const t = build(newTheme, rest);
  t.tracks = tracks;
  t.clips = clips;
  t.fonts = fonts;
  t.backgrounds = t.backgrounds.filter((p) => typeof p === "string");
  t.layouts = t.layouts.filter((i) => Object.prototype.hasOwnProperty.call(LAYOUTS, i));
  const cards = {};
  for (const [k, v] of Object.entries(t.cards)) if (BUTTON_IDS.includes(k) && typeof v === "string") cards[k] = v;
  t.cards = cards;
  return t;
}

export { basename };
