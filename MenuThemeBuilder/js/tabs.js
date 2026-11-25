import {
  BUTTON_IDS, LAYOUTS, TRANSITIONS, autoPrefix, creditScreenGroups, finalCreditGroups, modId, newClip, parseCredits, slug,
} from "./model.js";
import { fontFamilyName, loadFontFace } from "./fontgen.js";
import { GOOGLE_FONT_NAMES, downloadGoogleFont } from "./googlefonts.js";
import { readBikInfo, readOggInfo } from "./media.js";
import { drawCaptionSample, drawHighlightTile } from "./preview.js";
import { basename, pyRound, stem } from "./util.js";
import {
  button, checkField, details, dropTarget, fileField, group, h, imageField, note, numberField, row, selectField,
  setChecked, setValue, textField,
} from "./ui.js";

const MAX_FONTS = 4;
const IMAGE_TYPES = /\.(png|jpe?g|webp|gif|bmp)$/i;
const CREDIT_ROLES = ["Theme", "Music", "Fonts", "Art", "Video", "Sounds", "Special thanks"];

function tabCtx(c) {
  return {
    get store() {
      return c.store;
    },
    touch: c.touch,
    notice: c.notice,
    syncs: [],
  };
}

function finish(t, el) {
  return { el, sync: () => t.syncs.forEach((f) => f()) };
}

function swap(list, a, b) {
  [list[a], list[b]] = [list[b], list[a]];
}

function infoTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  const modIdText = h("span", { class: "readonly" });
  const idSync = () => {
    modIdText.textContent = modId(T());
  };
  t.syncs.push(idSync);
  const name = textField(t, "Theme name", T, "name", {
    help: "Shown in the game's Mods list and in the Theme's settings window.",
    after: () => {
      if (T().auto_ids) {
        T().theme_id = slug(T().name);
        T().prefix = autoPrefix(T().name);
        t.syncs.forEach((f) => f());
      }
    },
  });
  const author = textField(t, "Author", T, "author", { help: "Your name. It is also added to the Credits automatically." });
  const desc = textField(t, "Description", T, "description", { area: true, rows: 4 });
  const version = textField(t, "Version", T, "mod_version", { help: "Raise it when you publish an update (1.0.0, 1.1.0 ...)." });
  const poster = imageField(t, "Poster", "256x256. Left empty, it is made from your first background.", T, "poster");
  const icon = imageField(t, "Icon", "Small mod icon. Left empty, it is made from your first background.", T, "icon");
  const prefix = textField(t, "File prefix", T, "prefix", {
    help: "A short tag put in front of every file and sound this Theme creates (for example MMT_Background_1.png), so two Themes never overwrite each other's files. 2-10 letters/digits. It is made from the Theme name for you; change it only if you want a specific one.",
    after: () => {
      T().auto_ids = false;
    },
  });
  const themeId = textField(t, "Theme ID", T, "theme_id", {
    help: "The internal name and the folder name inside your Workshop folder. Letters and digits only. Compiled automatically from the Theme name.",
    after: () => {
      T().auto_ids = false;
      idSync();
    },
  });
  const vmin = textField(t, "Minimum game version", T, "version_min", { help: "Lowest Build 42 version the Theme works on." });
  const el = h("div", { class: "tab-body" },
    group("About your Theme", name.el, author.el, desc.el, version.el),
    details("Poster and icon (optional - made for you if left empty)", poster.el, icon.el),
    details("Advanced - you normally don't need to touch this", prefix.el, themeId.el,
      row("Mod ID", modIdText, 'Theme ID + "B42". This is the id the game uses for the mod.'), vmin.el));
  return finish(t, el);
}

function backgroundsTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  const selected = new Set();
  const grid = h("div", { class: "bg-grid" });

  function renderGrid() {
    const list = T().backgrounds;
    for (const i of [...selected]) if (i >= list.length) selected.delete(i);
    grid.replaceChildren(...list.map((key, i) => h("button", {
      type: "button",
      class: "bg-tile" + (selected.has(i) ? " sel" : ""),
      title: basename(key),
      onclick: () => {
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        renderGrid();
      },
    }, c.store.has(key) ? h("img", { src: c.store.url(key), alt: "" }) : h("span", { class: "missing" }, "missing"),
    h("span", { class: "cap" }, `${i + 1}. ${basename(key)}`))));
    if (!list.length) grid.append(h("p", { class: "empty" }, "No Images yet. Drop files here or use Add Images."));
  }

  async function addFiles(files) {
    const good = files.filter((f) => IMAGE_TYPES.test(f.name));
    const bad = files.filter((f) => !IMAGE_TYPES.test(f.name)).map((f) => f.name);
    const errors = [];
    for (const f of good) {
      try {
        T().backgrounds.push(await c.store.addImage(f));
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (bad.length) errors.push(`Skipped (not an Image the browser can read): ${bad.join(", ")}`);
    if (errors.length) c.notice(errors.join("\n"), "error");
    renderGrid();
    c.touch();
  }

  function remove() {
    T().backgrounds = T().backgrounds.filter((_, i) => !selected.has(i));
    selected.clear();
    renderGrid();
    c.touch();
  }

  function move(d) {
    const rows = [...selected].sort((a, b) => a - b);
    const b = T().backgrounds;
    if (!rows.length || (d < 0 && rows[0] === 0) || (d > 0 && rows[rows.length - 1] === b.length - 1)) return;
    for (const r of d < 0 ? rows : [...rows].reverse()) swap(b, r, r + d);
    selected.clear();
    for (const r of rows) selected.add(r + d);
    renderGrid();
    c.touch();
  }

  const picker = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp", multiple: true, hidden: true });
  picker.addEventListener("change", () => {
    const files = [...picker.files];
    picker.value = "";
    addFiles(files);
  });
  dropTarget(grid, addFiles);

  let hold;
  let trans;
  let style;
  let drift;
  let driftPx;
  let zoom;
  let zoomPct;
  let imageScale;
  let seamless;
  let instant;
  const states = () => {
    const inst = T().no_transition;
    trans.input.disabled = inst;
    style.input.disabled = inst;
    seamless.input.disabled = inst;
    driftPx.input.disabled = !T().drift;
    zoomPct.input.disabled = !T().zoom;
  };
  hold = numberField(t, "Time each Image stays", T, "hold_ms", 500, 600000, 500, { suffix: "ms" });
  instant = checkField(t, "Change Images instantly (no animation at all)", T, "no_transition", states);
  trans = numberField(t, "Animation time", T, "transition_ms", 0, 5000, 50, { suffix: "ms", help: "How long the old Image takes to leave, and the new one to arrive." });
  style = selectField(t, "Animation style", T, "transition_style", TRANSITIONS, { help: "Players can still change the style in the Theme's settings window." });
  seamless = checkField(t, "Seamless Background Slides (the slide styles push the old Image out as the new one arrives, with no black between)", T, "seamless_slide", states);
  drift = checkField(t, "Slowly drift sideways while an Image is shown", T, "drift", states);
  driftPx = numberField(t, "Drift distance", T, "drift_px", 0, 500, 5, { suffix: "px", help: "In pixels, at 1080p." });
  zoom = checkField(t, "Slowly zoom in and out while an Image is shown", T, "zoom", states);
  zoomPct = numberField(t, "Zoom amount", T, "zoom_pct", 1, 50, 1, { suffix: "%", help: "How much bigger the Image gets at the middle of its time on screen." });
  imageScale = numberField(t, "Image scale", T, "image_scale", 100, 150, 1, { suffix: "%", help: "Draws every Image this much bigger than the screen and crops it, which gives Drift, Zoom and the slide room to move without showing an edge. 100% fits the screen exactly." });
  t.syncs.push(states, renderGrid);

  const el = h("div", { class: "tab-body" },
    note("Background Images shown as a slideshow behind the main menu (PNG recommended; other formats are converted to PNG when building). 1920x1080 or larger. Drop files here, click Images to select them, then use the buttons to reorder."),
    grid,
    h("div", { class: "btns" }, button("Add images…", () => picker.click()), button("Remove", remove),
      button("◀ Move left", () => move(-1)), button("Move right ▶", () => move(1)), picker),
    group("Slideshow", hold.el, instant.el, trans.el, style.el, seamless.el, drift.el, driftPx.el, zoom.el, zoomPct.el, imageScale.el));
  return finish(t, el);
}

function musicTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  const body = h("div", { class: "rows" });

  function render() {
    const tracks = T().tracks;
    body.replaceChildren(...tracks.map((tr, i) => {
      const title = h("input", { type: "text", value: tr.title, placeholder: "Title" });
      title.addEventListener("input", () => {
        tr.title = title.value;
        c.touch();
      });
      const len = h("input", { type: "number", min: 0, step: 1000, value: tr.length_ms, title: "Length in milliseconds" });
      len.addEventListener("input", () => {
        const n = Math.trunc(Number(len.value));
        if (Number.isFinite(n) && n >= 0) {
          tr.length_ms = n;
          c.touch();
        }
      });
      return h("div", { class: "track" },
        h("span", { class: "idx" }, String(i + 1)), title, h("span", { class: "with-suffix" }, len, h("span", { class: "suffix" }, "ms")),
        h("span", { class: "fname", title: tr.path }, basename(tr.path)),
        button("▲", () => reorder(i, -1), { title: "Move up", disabled: i === 0 }),
        button("▼", () => reorder(i, 1), { title: "Move down", disabled: i === tracks.length - 1 }),
        button("✕", () => {
          tracks.splice(i, 1);
          render();
          c.touch();
        }, { title: "Remove" }));
    }));
    if (!tracks.length) body.append(h("p", { class: "empty" }, "No music yet. The menu will play the game's own music."));
  }

  function reorder(i, d) {
    swap(T().tracks, i, i + d);
    render();
    c.touch();
  }

  async function add(files) {
    const bad = [];
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith(".ogg")) {
        bad.push(`${f.name}: not an .ogg file (convert it to Ogg Vorbis first)`);
        continue;
      }
      try {
        const info = await readOggInfo(f);
        T().tracks.push({ path: c.store.add(f), title: stem(f.name).replace(/_/g, " ").trim(), length_ms: info.duration_ms });
      } catch (e) {
        bad.push(`${f.name}: ${e.message}`);
      }
    }
    if (bad.length) c.notice("Some files were skipped:\n" + bad.join("\n"), "error");
    render();
    c.touch();
  }

  const picker = h("input", { type: "file", accept: ".ogg,audio/ogg", multiple: true, hidden: true });
  picker.addEventListener("change", () => {
    const files = [...picker.files];
    picker.value = "";
    add(files);
  });
  dropTarget(body, add);
  const repeat = checkField(t, "Play ONE track per menu visit and repeat it (no playlist)", T, "repeat_one");
  const vol = numberField(t, "Starting volume", T, "music_volume", 0, 100, 5, { suffix: "%", help: "The volume players start with. They can change it in the Theme's settings window." });
  t.syncs.push(render);
  const el = h("div", { class: "tab-body" },
    note("Menu Music. Only Ogg files (.ogg) are supported. The length is read from the file automatically; MTF needs it to move on to the next track."),
    h("div", { class: "track head" }, h("span", { class: "idx" }, "#"), h("span", {}, "Title (shown to the player)"), h("span", {}, "Length"), h("span", {}, "File"), h("span", {}), h("span", {}), h("span", {})),
    body,
    h("div", { class: "btns" }, button("Add .ogg…", () => picker.click()), picker),
    repeat.el, vol.el);
  return finish(t, el);
}

function videoTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  let cur = 0;
  const dummy = newClip();
  const cl = () => T().clips[cur] || dummy;
  const list = h("div", { class: "clip-list" });
  const form = h("fieldset", { class: "group" });

  function renderList() {
    const clips = T().clips;
    if (cur >= clips.length) cur = Math.max(0, clips.length - 1);
    list.replaceChildren(...clips.map((cp, i) => h("button", {
      type: "button",
      class: "clip" + (i === cur ? " active" : ""),
      onclick: () => {
        cur = i;
        renderList();
        t.syncs.forEach((f) => f());
      },
    }, `${i + 1}. ${cp.video ? basename(cp.video) : "(no Video yet)"}`)));
    if (!clips.length) list.append(h("p", { class: "empty" }, "No clips yet."));
    form.disabled = !clips.length;
  }

  function move(d) {
    const n = cur + d;
    if (!T().clips.length || n < 0 || n >= T().clips.length) return;
    swap(T().clips, cur, n);
    cur = n;
    renderList();
    c.touch();
  }

  const mode = selectField(t, "Playback mode", T, "video_mode", [
    ["random", "Random: one clip per menu visit, looped"],
    ["order", "Order: clips chained in list order"],
    ["shuffle", "Shuffle: clips chained in random order"]]);
  const bgmode = selectField(t, "Default background (when both exist)", T, "default_bg_mode", [["images", "Images"], ["video", "Video"]]);
  const vvol = numberField(t, "Starting Video sound volume", T, "video_volume", 0, 100, 5, { suffix: "%", help: "Players can change it in the Theme's settings window." });

  const video = fileField(t, "Video (.bik)", ".bik", cl, "video", async (key, file) => {
    if (!key) return;
    let info;
    try {
      info = await readBikInfo(file);
    } catch (e) {
      throw new Error(`${file.name}: ${e.message}\nOnly Bink (.bik) videos work in Project Zomboid.`);
    }
    const cp = cl();
    cp.width = info.width;
    cp.height = info.height;
    if (!cp.sound) cp.length_ms = info.duration_ms;
  });
  const still = imageField(t, "Still image", "Shown when the Video can't play (Video Effects off, older builds). Left empty, your first background is used.", cl, "still");
  const sound = fileField(t, "Sound (.ogg)", ".ogg,audio/ogg", cl, "sound", async (key, file) => {
    if (!key) return;
    if (!file.name.toLowerCase().endsWith(".ogg")) throw new Error("Sound must be an .ogg file");
    cl().length_ms = (await readOggInfo(file)).duration_ms;
  });
  const w = numberField(t, "Video width", cl, "width", 1, 16384, 1, { suffix: "px" });
  const hh = numberField(t, "Video height", cl, "height", 1, 16384, 1, { suffix: "px" });
  const length = numberField(t, "Clip length", cl, "length_ms", 0, 36000000, 100, { suffix: "ms", help: "Only needed for Order / Shuffle. Read from the files when possible." });
  const svol = numberField(t, "Sound volume", cl, "sound_volume", 0, 100, 5, { suffix: "%" });
  const rv = checkField(t, "Restart the Video when the next clip is the same Video", cl, "restart_video");
  const rs = checkField(t, "Restart the sound when the next clip uses the same sound", cl, "restart_sound");
  form.append(h("legend", {}, "Selected clip"), video.el, still.el, sound.el, w.el, hh.el, length.el, svol.el, rv.el, rs.el);
  t.syncs.push(renderList);

  const el = h("div", { class: "tab-body" },
    note("Optional looping Video background (needs game Build 42.22 or later; older builds show the still image). Videos must be Bink 1 (.bik) without sound inside; put the sound in a separate .ogg. Convert Videos with RAD Video Tools (radgametools.com/bnkdown.htm). The page copies your .bik file unchanged into the mod."),
    mode.el, bgmode.el, vvol.el, list,
    h("div", { class: "btns" },
      button("Add clip", () => {
        T().clips.push(newClip());
        cur = T().clips.length - 1;
        renderList();
        t.syncs.forEach((f) => f());
        c.touch();
      }),
      button("Remove", () => {
        if (!T().clips.length) return;
        T().clips.splice(cur, 1);
        renderList();
        t.syncs.forEach((f) => f());
        c.touch();
      }),
      button("▲ Up", () => move(-1)), button("▼ Down", () => move(1))),
    form);
  return finish(t, el);
}

function layoutTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  const checks = {};
  const defaultSel = h("select", {});
  const layoutBox = h("div", { class: "checks" });
  for (const [lid, info] of Object.entries(LAYOUTS)) {
    const input = h("input", { type: "checkbox" });
    input.addEventListener("change", () => {
      T().layouts = Object.keys(LAYOUTS).filter((id) => checks[id].checked);
      fillDefault();
      if (defaultSel.options.length) T().default_layout = defaultSel.value;
      c.touch();
    });
    checks[lid] = input;
    layoutBox.append(h("label", { class: "check" }, input, h("span", {}, info[0])));
  }
  function fillDefault() {
    defaultSel.replaceChildren(...Object.keys(LAYOUTS).filter((id) => T().layouts.includes(id)).map((id) => h("option", { value: id }, LAYOUTS[id][0])));
    defaultSel.disabled = !defaultSel.options.length;
    const want = T().layouts.includes(T().default_layout) ? T().default_layout : defaultSel.options[0] && defaultSel.options[0].value;
    if (want) setValue(defaultSel, want);
  }
  defaultSel.addEventListener("change", () => {
    if (defaultSel.options.length) {
      T().default_layout = defaultSel.value;
      c.touch();
    }
  });
  t.syncs.push(() => {
    for (const [lid, input] of Object.entries(checks)) setChecked(input, T().layouts.includes(lid));
    fillDefault();
  });

  const logo = imageField(t, "Main menu logo", "Transparent PNG, 697x450.", T, "logo", { after: () => states() });
  const logoAlt = imageField(t, "Alternative logo", "Adds a 'Logo' choice to the Theme settings.", T, "logo_alt");
  const scale = numberField(t, "Size", T, "logo_scale", 10, 400, 5, { suffix: "%", help: "100% = the picture's own size. Needs a logo picture. The preview shows it." });
  const place = selectField(t, "Position", T, "logo_place", [["default", "Vanilla position (top left)"], ["custom", "Choose the position"]], { after: () => states() });
  const lx = numberField(t, "X", T, "logo_x", -2000, 4000, 5, { suffix: "px" });
  const ly = numberField(t, "Y", T, "logo_y", -2000, 4000, 5, { suffix: "px" });

  function centre(both) {
    const size = c.store.size(T().logo);
    if (!size) {
      c.notice("Choose a logo picture first.", "info");
      return;
    }
    const ww = (size.w * T().logo_scale) / 100;
    const hh = (size.h * T().logo_scale) / 100;
    T().logo_place = "custom";
    T().logo_x = pyRound((1920 - ww) / 2);
    if (both) T().logo_y = pyRound((1080 - hh) / 2);
    t.syncs.forEach((f) => f());
    c.touch();
  }
  const centreBtns = h("div", { class: "btns" }, button("Centre horizontally", () => centre(false)), button("Centre on screen", () => centre(true)));

  const fade = numberField(t, "Logo fade-in time", T, "logo_fade_ms", 0, 10000, 100, { suffix: "ms", help: "How long the logo takes to appear. 0 = it appears instantly.", after: () => states() });
  const slide = checkField(t, "Logo also slides down a little while it fades in", T, "logo_slide");
  const instant = checkField(t, "Menu buttons appear instantly (no fade-in)", T, "buttons_instant");
  const allOff = button("Turn off ALL animations", () => {
    Object.assign(T(), { no_transition: true, drift: false, logo_fade_ms: 0, logo_slide: false, buttons_instant: true });
    c.syncAll();
    c.touch();
  }, { title: "Instant background changes, no drift, logo and buttons appear at once." });

  function states() {
    const has = !!T().logo;
    scale.input.disabled = !has;
    lx.input.disabled = T().logo_place !== "custom";
    ly.input.disabled = T().logo_place !== "custom";
    for (const b of centreBtns.querySelectorAll("button")) b.disabled = !has;
    slide.input.disabled = !(T().logo_fade_ms > 0);
  }
  t.syncs.push(states);

  const MODES = [["default", "MTF default"], ["white", "Inverted Hover"], ["caption", "Caption bar"]];
  const tiles = MODES.map(([mode, label]) => {
    const canvas = h("canvas", { width: 220, height: 150, class: "tile-canvas" });
    const wrap = h("button", {
      type: "button",
      class: "tile",
      onclick: () => {
        T().list_highlight = mode;
        hlStates();
        c.touch();
      },
    }, canvas, h("span", {}, label));
    return { mode, label, canvas, wrap };
  });
  function redrawTiles() {
    for (const tile of tiles) {
      const ctx = tile.canvas.getContext("2d");
      ctx.clearRect(0, 0, 220, 150);
      const sel = T().list_highlight === tile.mode;
      drawHighlightTile(ctx, 220, 150, T(), tile.mode, sel, c.store);
      tile.wrap.classList.toggle("sel", sel);
      tile.wrap.lastChild.textContent = tile.label + (sel ? "  ✓" : "") + (tile.mode === "caption" && !c.store.has(T().caption) && !T().highlight_tint_on ? "  (needs caption art)" : "");
    }
  }
  t.syncs.push(redrawTiles);
  c.redrawers.push(redrawTiles);

  const hlOn = checkField(t, "Colour the highlight", T, "highlight_tint_on", () => hlStates());
  const hlColor = h("input", { type: "color", class: "color" });
  hlColor.addEventListener("input", () => {
    T().highlight_tint = hlColor.value;
    redrawTiles();
    c.touch();
  });
  function hlStates() {
    const caption = T().list_highlight === "caption";
    hlOn.input.disabled = !caption;
    hlColor.disabled = !(caption && T().highlight_tint_on);
    redrawTiles();
  }
  t.syncs.push(() => setValue(hlColor, T().highlight_tint), hlStates);

  const opt = imageField(t, "Settings button icon", "240x240. MTF has its own if empty.", T, "options_icon");
  const strip = imageField(t, "Strip bar art", "1920x128. Used by Strip and Carousel layouts.", T, "strip");
  const ah = imageField(t, "Horizontal arrow", "128x128, facing left.", T, "arrow_h");
  const av = imageField(t, "Vertical arrow", "256x64, facing up.", T, "arrow_v");

  const el = h("div", { class: "tab-body" },
    group("Button layouts offered to the player", layoutBox, row("Layout shown first", defaultSel),
      note("Two or more layouts give the player a 'Button Layout' choice. With none, the vanilla list is kept.")),
    group("Logo", logo.el, scale.el, place.el, lx.el, ly.el, centreBtns,
      note("Turn on 'Grid' in the preview to see the screen centre and your logo's centre."),
      details("Alternative logo (optional)", logoAlt.el)),
    group("Menu animations", fade.el, slide.el, instant.el,
      note("The change between background Images has its own switch in the Backgrounds tab."), allOff),
    group("Hover highlight of the Zomboid list",
      note("Only used by the 'Zomboid (vanilla list)' layout: how a button looks when the mouse is over it. Click the look you want."),
      h("div", { class: "tiles" }, tiles.map((x) => x.wrap)),
      note('"Caption bar" uses the caption art from the Cards tab. To change its colour, turn on "Colour the highlight". With no caption art, the page makes a plain bar for you.'),
      h("div", { class: "row-inline" }, hlOn.el, hlColor)),
    details("More art (optional)", opt.el, strip.el, ah.el, av.el));
  return finish(t, el);
}

function cardsTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  const def = imageField(t, "Card picture", "1820x1024. Used by every card that has no picture of its own.", T, "card_default", { after: () => drawSample() });
  const caption = imageField(t, "Name bar art (optional)", "1024x128, white art. Without it the bar is plain black, or your colour when 'Colour the bar' is on.", T, "caption", { after: () => drawSample() });
  const tintOn = checkField(t, "Colour the bar", T, "caption_tint_on", () => states());
  const color = h("input", { type: "color", class: "color" });
  color.addEventListener("input", () => {
    T().caption_tint = color.value;
    drawSample();
    c.touch();
  });
  const sample = h("canvas", { width: 213, height: 120, class: "sample" });
  function drawSample() {
    const ctx = sample.getContext("2d");
    ctx.clearRect(0, 0, 213, 120);
    drawCaptionSample(ctx, 213, 120, T(), c.store);
  }
  function states() {
    color.disabled = !T().caption_tint_on;
    drawSample();
  }
  t.syncs.push(() => setValue(color, T().caption_tint), states);
  c.redrawers.push(drawSample);
  const per = BUTTON_IDS.map((bid) => imageField(t, bid, "", () => T().cards, bid, {
    after: () => {
      if (!T().cards[bid]) delete T().cards[bid];
    },
  }));
  const el = h("div", { class: "tab-body" },
    note("Cards are used by the two card layouts: every main-menu button becomes a card with a picture and a name bar."),
    def.el,
    group("Name bar of the cards", caption.el, h("div", { class: "row-inline" }, tintOn.el, color),
      note("This is how a card's name bar will look:"), sample),
    details("A different picture for each button (optional)", ...per.map((p) => p.el)));
  return finish(t, el);
}

function fontTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  const families = new Map();
  const list = h("div", { class: "font-list" });
  const empty = h("p", { class: "note" }, "No custom font. The game's own button font is used.");
  let cardCtx = tabCtx(c);

  async function familyOf(key) {
    if (!families.has(key)) {
      const bytes = new Uint8Array(await c.store.get(key).arrayBuffer());
      families.set(key, (await loadFontFace(bytes)).family);
    }
    return families.get(key);
  }

  async function addFont(file, license) {
    if (T().fonts.length >= MAX_FONTS) throw new Error(`A Theme can carry up to ${MAX_FONTS} fonts here.`);
    const key = c.store.add(file);
    try {
      await familyOf(key);
    } catch {
      c.store.files.delete(key);
      throw new Error(`${file.name} could not be read as a font. Use a .ttf or .otf file.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    T().fonts.push({ file: key, name: fontFamilyName(bytes) || stem(file.name), scale: 100, license: license ? c.store.add(license) : "" });
  }

  function move(i, by) {
    const fonts = T().fonts;
    const k = i + by;
    if (k < 0 || k >= fonts.length) return;
    [fonts[i], fonts[k]] = [fonts[k], fonts[i]];
    render();
    c.touch();
  }

  function remove(i) {
    T().fonts.splice(i, 1);
    render();
    c.touch();
  }

  function fontCard(i) {
    const obj = () => T().fonts[i];
    const sample = h("div", { class: "font-sample" }, "CONTINUE   NEW GAME   MULTIPLAYER");
    const source = h("p", { class: "note font-source" });
    function refresh() {
      const f = obj();
      if (!f) return;
      source.textContent = `File: ${basename(f.file)}${i === 0 ? ". Used until the player picks another font." : "."}`;
      sample.style.fontSize = `${Math.max(8, pyRound((30 * f.scale) / 100))}px`;
      if (c.store.has(f.file)) {
        familyOf(f.file).then((fam) => {
          sample.style.fontFamily = `"${fam}"`;
        }).catch(() => {});
      }
    }
    const name = textField(cardCtx, "Name in the Button Font list", obj, "name", {
      help: "Players see this name in Menu Theme Settings, next to the fonts of other Themes.",
      after: () => refresh(),
    });
    const scale = numberField(cardCtx, "Size adjustment", obj, "scale", 50, 200, 5, {
      suffix: "%",
      help: "Every font looks bigger or smaller at the same size. Change this until it fits your menu (see the sample).",
      after: () => refresh(),
    });
    const licence = fileField(cardCtx, "Licence text (optional)", ".txt,text/plain", obj, "license", null,
      "The font's licence file, shipped next to the font in your mod. Open fonts such as the SIL Open Font License need it.");
    const up = button("Move up", () => move(i, -1), { disabled: i === 0 });
    const down = button("Move down", () => move(i, 1), { disabled: i === T().fonts.length - 1 });
    const del = button("Remove font", () => remove(i));
    cardCtx.syncs.push(refresh);
    const card = group(`Font ${i + 1}`, source, sample, name.el, scale.el, licence.el, h("div", { class: "row-inline" }, up, down, del));
    card.classList.add("font-card");
    return card;
  }

  function render() {
    cardCtx = tabCtx(c);
    const fonts = T().fonts;
    list.replaceChildren(...fonts.map((f, i) => fontCard(i)));
    empty.hidden = fonts.length > 0;
    cardCtx.syncs.forEach((f) => f());
  }

  async function addFiles(files) {
    const errors = [];
    for (const f of files) {
      if (!/\.(ttf|otf)$/i.test(f.name)) {
        errors.push(`${f.name} is not a .ttf or .otf file.`);
        continue;
      }
      try {
        await addFont(f, null);
      } catch (e) {
        errors.push(e.message);
      }
    }
    render();
    c.touch();
    if (errors.length) c.notice(errors.join("\n"), "error");
  }

  const addInput = h("input", { type: "file", accept: ".ttf,.otf", multiple: true, hidden: true, class: "font-add" });
  addInput.addEventListener("change", () => {
    const files = [...addInput.files];
    addInput.value = "";
    addFiles(files);
  });
  const addBtn = button("Add a font file…", () => addInput.click());

  const gList = h("datalist", { id: "mtb-google-fonts" }, ...GOOGLE_FONT_NAMES.map((n) => h("option", { value: n })));
  const gInput = h("input", { type: "text", list: "mtb-google-fonts", class: "google-name", placeholder: "For example Pixelify Sans" });
  const gMsg = h("span", { class: "note" });
  const gGo = button("Download and add", async () => {
    const family = gInput.value.trim();
    if (!family) return;
    gGo.disabled = true;
    gMsg.textContent = `Downloading ${family}…`;
    try {
      const { font, license } = await downloadGoogleFont(family);
      await addFont(font, license);
      render();
      c.touch();
      gMsg.textContent = `${family} was added.`;
    } catch (e) {
      gMsg.textContent = "";
      c.notice(e.message, "error");
    } finally {
      gGo.disabled = false;
    }
  });
  const google = row("Free font from Google Fonts", h("div", { class: "file-field" }, gInput, gGo, gMsg, gList),
    "Type a font name from Google Fonts. The page downloads it, with its licence, from Google's open font repository on GitHub. Only the font name is sent, never your project.");

  t.syncs.push(render);
  const group1 = group("Menu button fonts",
    note("Give the main-menu buttons your own fonts. Add as many as you like. The first one is used until the player picks another in Menu Theme Settings, Display, Button Font. The page turns each font into the game's bitmap font (5 sizes) when you build. Everything stays in your browser."),
    empty, list, h("div", { class: "row-inline" }, addBtn, addInput), google);
  dropTarget(group1, (files) => addFiles(files));
  const el = h("div", { class: "tab-body" },
    group1,
    note("Good to know: the fonts are added to the Button Font choice in Menu Theme Settings, so players can also use them in other Menu Themes. They cover Latin letters; languages such as Russian, Chinese, Japanese or Korean keep the game's font."));
  return finish(t, el);
}

function creditsTab(c) {
  const t = tabCtx(c);
  const T = c.theme;
  let rows = [];
  let last = null;
  const body = h("div", { class: "rows" });
  const result = h("pre", { class: "result" });
  const roleList = h("datalist", { id: "credit-roles" }, CREDIT_ROLES.map((r) => h("option", { value: r })));

  function fromText() {
    const out = [];
    for (const g of parseCredits(T().credits_text)) {
      const role = g.header.trim().replace(/:+$/, "").trim();
      if (g.rows.length) for (const r of g.rows) out.push([role, r]);
    }
    return out;
  }

  function commit() {
    const order = [];
    const groups = new Map();
    for (const [roleRaw, textRaw] of rows) {
      const text = textRaw.trim().replace(/^#+/, "").trim();
      if (!text) continue;
      const role = roleRaw.trim().replace(/:+$/, "").trim() || "Other";
      const key = role.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, [role, []]);
        order.push(key);
      }
      groups.get(key)[1].push(text);
    }
    const lines = [];
    for (const k of order) {
      const [role, items] = groups.get(k);
      lines.push("# " + role, ...items);
    }
    T().credits_text = lines.join("\n");
    last = T().credits_text;
    updateResult();
    showAutos();
    c.touch();
  }

  function updateResult() {
    const lines = [];
    for (const g of creditScreenGroups(T())) {
      if (g.header) lines.push(g.header);
      for (const r of g.rows) lines.push("    " + r);
      lines.push("");
    }
    result.textContent = lines.join("\n").trim() || "(no credits yet)";
  }

  function render(focusLast) {
    body.replaceChildren(...rows.map((r, i) => {
      const role = h("input", { type: "text", list: "credit-roles", value: r[0], placeholder: "Role" });
      const text = h("input", { type: "text", value: r[1], placeholder: "Name / text" });
      role.addEventListener("input", () => {
        r[0] = role.value;
        commit();
      });
      text.addEventListener("input", () => {
        r[1] = text.value;
        commit();
      });
      return h("div", { class: "credit" }, role, text,
        button("▲", () => reorder(i, -1), { disabled: i === 0 }), button("▼", () => reorder(i, 1), { disabled: i === rows.length - 1 }),
        button("✕", () => {
          rows.splice(i, 1);
          render();
          commit();
        }));
    }));
    if (!rows.length) body.append(h("p", { class: "empty" }, "No credits of your own yet."));
    if (focusLast) {
      const inputs = body.querySelectorAll(".credit:last-child input");
      const target = rows[rows.length - 1][0] ? inputs[1] : inputs[0];
      if (target) target.focus();
    }
  }

  function reorder(i, d) {
    swap(rows, i, i + d);
    render();
    commit();
  }

  const addSel = h("select", {}, h("option", { value: "" }, "Add credit…"),
    CREDIT_ROLES.map((r) => h("option", { value: r }, r)), h("option", { value: "__other" }, "Other role…"));
  addSel.addEventListener("change", () => {
    if (!addSel.value) return;
    rows.push([addSel.value === "__other" ? "" : addSel.value, ""]);
    addSel.value = "";
    render(true);
    showAutos();
  });

  const auto = checkField(t, "Add my Author name automatically", T, "auto_credits", updateResult);
  const autoMusic = checkField(t, "Auto generate for Music (the titles of my Tracks)", T, "auto_music", updateResult);
  const autoFonts = checkField(t, "Auto generate for Fonts (the names of my Fonts)", T, "auto_fonts", updateResult);
  const hasRole = (name) => rows.some((r) => r[0].trim().replace(/:+$/, "").trim().toLowerCase() === name);
  function showAutos() {
    autoMusic.el.hidden = !(hasRole("music") || T().auto_music);
    autoFonts.el.hidden = !(hasRole("fonts") || T().auto_fonts);
  }
  const about = textField(t, "About this mod (optional)", T, "about", { area: true, rows: 3, help: "A short text shown at the very bottom of the Credits tab." });
  t.syncs.push(() => {
    if (T().credits_text !== last) {
      rows = fromText();
      last = T().credits_text;
      render();
    }
    updateResult();
    showAutos();
  });
  const el = h("div", { class: "tab-body" },
    note("Credits are shown in the Theme's Settings window. Each line has a role (Music, Fonts...) and a name; lines with the same role are grouped for you - no # needed."),
    auto.el, h("div", { class: "track head credit-head" }, h("span", {}, "Role"), h("span", {}, "Name / text")), body,
    h("div", { class: "btns" }, addSel, roleList), autoMusic.el, autoFonts.el,
    h("h3", {}, "How it will look in the game"), result, about.el);
  return finish(t, el);
}

export function buildTabs(c) {
  return [
    ["info", "Theme", infoTab(c)],
    ["backgrounds", "Backgrounds", backgroundsTab(c)],
    ["music", "Music", musicTab(c)],
    ["video", "Video", videoTab(c)],
    ["layout", "Menu & Logo", layoutTab(c)],
    ["cards", "Cards", cardsTab(c)],
    ["font", "Font", fontTab(c)],
    ["credits", "Credits", creditsTab(c)],
  ].map(([id, title, tab]) => ({ id, title, ...tab }));
}
