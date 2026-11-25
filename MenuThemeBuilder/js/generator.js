import {
  BUTTON_IDS, LAYOUTS, PROJECT_FILE, finalCreditGroups, mapPaths, modId, sanitizeStem, stampText,
} from "./model.js";
import { basename, pyJsonDumps, pyRound, stem, toInt } from "./util.js";
import { FONT_TIERS } from "./fontgen.js";
import { BUILDER_VERSION } from "./version.js";

export class BuildError extends Error {}

const ID_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const PREFIX_RE = /^[A-Za-z][A-Za-z0-9]{1,9}$/;

export function validate(t, env) {
  const errs = [];
  const warns = [];
  if (!String(t.name).trim()) errs.push("The Theme needs a name.");
  if (!ID_RE.test(t.theme_id || "")) errs.push("Theme ID may only contain letters and digits (and must start with a letter).");
  if (!PREFIX_RE.test(t.prefix || "")) errs.push("Prefix must be 2-10 letters/digits and start with a letter (e.g. MMT).");
  if (!t.backgrounds.length && !t.clips.length) errs.push("Add at least one background Image or one Video clip.");

  const need = (path, what) => {
    if (path && !env.has(path)) errs.push(`${what}: file not found (${path}).`);
  };

  for (const p of t.backgrounds) need(p, "Background");
  for (const tr of t.tracks) {
    need(tr.path, "Music track");
    if (tr.path && !tr.path.toLowerCase().endsWith(".ogg")) errs.push(`Music must be .ogg: ${basename(tr.path)}`);
    if (tr.length_ms <= 0) warns.push(`Track '${tr.title}' has no length; MTF needs the real length to advance to the next track.`);
  }
  t.clips.forEach((c, i) => {
    const n = i + 1;
    if (!c.video) errs.push(`Video clip ${n} has no .bik file.`);
    need(c.video, `Video clip ${n}`);
    need(c.still, `Video clip ${n} still`);
    need(c.sound, `Video clip ${n} sound`);
    if (c.sound && !c.sound.toLowerCase().endsWith(".ogg")) errs.push(`Video clip ${n}: the sound must be .ogg.`);
    if (t.video_mode !== "random" && c.length_ms <= 0) warns.push(`Video clip ${n}: '${t.video_mode}' mode needs the clip length (ms).`);
  });
  t.fonts.forEach((f, i) => {
    if (!f.file) errs.push(`Font ${i + 1} has no file.`);
    need(f.file, `Font ${i + 1}`);
  });
  for (const [a, what] of [["poster", "Poster"], ["icon", "Icon"], ["logo", "Logo"], ["logo_alt", "Alternative logo"],
    ["options_icon", "Settings icon"], ["strip", "Strip art"], ["arrow_h", "Horizontal arrow"],
    ["arrow_v", "Vertical arrow"], ["caption", "Caption bar"], ["card_default", "Default card Image"]]) {
    need(t[a], what);
  }
  for (const [k, p] of Object.entries(t.cards)) need(p, `Card ${k}`);
  if (!t.layouts.includes(t.default_layout) && t.layouts.length) {
    warns.push("The default layout is not among the enabled layouts; the first enabled one will be used.");
  }
  for (const p of t.backgrounds) {
    const s = env.imageSize(p);
    if (s && (s.w < 1920 || s.h < 1080)) warns.push(`${basename(p)} is ${s.w}x${s.h}; 1920x1080 or larger is recommended.`);
  }
  const needPct = 100 + Math.floor((toInt(t.drift_px) * 5 + 47) / 48);
  if (t.drift && toInt(t.drift_px) > 0 && t.backgrounds.length && imageScale(t) < needPct) {
    warns.push(`Drift moves the Image ${toInt(t.drift_px)} px, so a strip of the screen can show at its edge. Set Image scale to at least ${needPct}%.`);
  }
  return [errs, warns];
}

// Needs Menu Theme Framework 1.0.3 (the field is unknown, and only logs a warning, on older versions). Set true at the MTF 1.0.3 release.
export const EMIT_CAPTION_UNDER_BORDER = false;

export function imageScale(t) {
  return Math.max(100, Math.min(150, toInt(t.image_scale)));
}

export function pictureHelper() {
  return ["local function drawPicture(ctx, img, offsetX, offsetY, zoom)",
    "\tlocal tw, th = img:getWidth(), img:getHeight()",
    "\tif tw <= 0 or th <= 0 then", "\t\treturn", "\tend",
    "\tlocal k = math.max(ctx.width / tw, ctx.height / th) * zoom",
    "\tlocal w, h = tw * k, th * k",
    "\tlocal x, y = (ctx.width - w) / 2 + offsetX, (ctx.height - h) / 2 + offsetY",
    "\tif ctx.draw and ctx.draw.smooth then", "\t\tctx.draw.smooth(img, x, y, w, h, 1, 1, 1, 1)", "\telse",
    "\t\tctx.screen:drawTextureScaled(img, x, y, w, h, 1, 1, 1, 1)", "\tend",
    "end", ""];
}

export function seamlessLines(P, picture, zoomOn) {
  const draw = (img, x, y, z) => (picture ? `drawPicture(ctx, ${img}, ${x}, ${y}, ${z})` : `ctx.drawCover(${img}, 1, ${x}, ${y})`);
  const out = ["local function drawSeamless(ctx, style, count)",
    `\tlocal T = ${P}_Config.TRANSITION_MS`,
    `\tlocal cycleMs = T + ${P}_Config.IMAGE_HOLD_MS + T`,
    "\tlocal s = ctx.now - run.startMs + T / 2",
    "\tlocal k = math.floor(s / cycleMs)",
    "\tlocal r = s - k * cycleMs",
    "\tlocal w, h = ctx.width, ctx.height",
    `\tlocal drift = ${P}_Config.IMAGE_DRIFT and ${P}_Config.DRIFT_PX * ctx.layout.uiScale or 0`];
  if (picture) out.push(`\tlocal scale = ${P}_Config.IMAGE_SCALE / 100`);
  out.push("\tlocal function pose(p)");
  if (picture && zoomOn) out.push(`\t\treturn -drift * p, scale * (1 + ${P}_Config.IMAGE_ZOOM / 100 * (0.5 - 0.5 * math.cos(2 * math.pi * p)))`);
  else if (picture) out.push("\t\treturn -drift * p, scale");
  else out.push("\t\treturn -drift * p");
  out.push("\tend",
    `\tlocal cur = ctx.tex(${P}_Config.BG_IMAGES[k % count + 1])`,
    "\tif not cur then", "\t\treturn", "\tend",
    "\tif k > 0 and r < T then",
    `\t\tlocal prev = ctx.tex(${P}_Config.BG_IMAGES[(k - 1) % count + 1])`,
    "\t\tif not prev then", "\t\t\treturn", "\t\tend",
    "\t\tlocal t = r / T",
    picture ? "\t\tlocal px, pz = pose(1)" : "\t\tlocal px = pose(1)",
    '\t\tif style == "slide" then',
    "\t\t\t" + draw("prev", "px - w * t", "0", "pz"),
    "\t\t\t" + draw("cur", "math.max(0, w + px - w * t)", "0", "scale"),
    "\t\telse",
    "\t\t\t" + draw("prev", "px", "h * t", "pz"),
    "\t\t\t" + draw("cur", "px * (1 - t)", "-h * (1 - t)", "scale"),
    "\t\tend",
    "\telse",
    picture ? "\t\tlocal x, z = pose(math.min(1, math.max(0, (r - T) / (cycleMs - T))))"
      : "\t\tlocal x = pose(math.min(1, math.max(0, (r - T) / (cycleMs - T))))",
    "\t\t" + draw("cur", "x", "0", "z"),
    "\tend", "end", "");
  return out;
}

export function pictureBody(P, lines, zoomOn) {
  const out = [];
  for (let line of lines) {
    if (line.includes("ctx.drawCover(img, 1, driftX")) line = line.replace("ctx.drawCover(img, 1, driftX", "drawPicture(ctx, img, driftX").slice(0, -1) + ", zoom)";
    else if (line.includes("ctx.drawCover(img, 1, ")) line = line.replace("ctx.drawCover(img, 1, ", "drawPicture(ctx, img, ").slice(0, -1) + ", scale)";
    out.push(line);
    if (line.startsWith("\tlocal driftX =")) {
      out.push(`\tlocal scale = ${P}_Config.IMAGE_SCALE / 100`);
      if (zoomOn) {
        out.push(`\tlocal progress = math.min(1, math.max(0, (into - ${P}_Config.TRANSITION_MS) / ${P}_Config.IMAGE_HOLD_MS))`);
        out.push(`\tlocal zoom = scale * (1 + ${P}_Config.IMAGE_ZOOM / 100 * (0.5 - 0.5 * math.cos(2 * math.pi * progress)))`);
      } else {
        out.push("\tlocal zoom = scale");
      }
    }
  }
  return out;
}

export function lq(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n") + '"';
}

export function needsCaptionArt(t) {
  return !t.caption && (t.caption_tint_on || (t.list_highlight === "caption" && t.highlight_tint_on));
}

export function oneLine(s) {
  return String(s).replace(/[\x00-\x1f\x7f]+/g, " ").trim();
}

export function fontLabel(f) {
  return oneLine(f.name) || stem(f.file);
}

export function fontPlan(t) {
  const plan = [];
  const stems = new Set();
  const ids = new Set();
  for (const f of t.fonts) {
    const label = fontLabel(f);
    const base = sanitizeStem(label);
    let fstem = `${t.prefix}_${base}`;
    let id = base.toLowerCase();
    let k = 2;
    while (stems.has(fstem.toLowerCase()) || ids.has(id)) {
      fstem = `${t.prefix}_${base}_${k}`;
      id = `${base.toLowerCase()}_${k}`;
      k += 1;
    }
    stems.add(fstem.toLowerCase());
    ids.add(id);
    plan.push({ font: f, label, stem: fstem, id, key: `IGUI_${t.prefix}_Font${plan.length + 1}` });
  }
  return plan;
}

export function logoDisplayHeight(t, env) {
  if (!t.logo || toInt(t.logo_scale) === 100) return 0;
  const size = env.imageSize(t.logo);
  if (!size || size.h <= 0) return 0;
  return Math.max(1, pyRound((size.h * toInt(t.logo_scale)) / 100));
}

function fixed(x, digits) {
  return x.toFixed(digits);
}

function tintChannels(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex));
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
}

export function genConfig(t, a) {
  const P = t.prefix;
  const L = [`${P}_Config = {}`, ""];
  L.push(`${P}_Config.BG_IMAGES = {`);
  for (const p of a.bgs) L.push(`\t${lq(p)},`);
  L.push("}");
  L.push(`${P}_Config.IMAGE_HOLD_MS = ${toInt(t.hold_ms)}`);
  const transMs = t.no_transition || a.bgs.length < 2 ? 0 : toInt(t.transition_ms);
  L.push(`${P}_Config.TRANSITION_MS = ${transMs}`);
  L.push(`${P}_Config.IMAGE_DRIFT = ${t.drift ? "true" : "false"}`);
  L.push(`${P}_Config.DRIFT_PX = ${toInt(t.drift_px)}`);
  if (t.zoom) L.push(`${P}_Config.IMAGE_ZOOM = ${Math.max(1, Math.min(50, toInt(t.zoom_pct)))}`);
  if (t.zoom || imageScale(t) !== 100) L.push(`${P}_Config.IMAGE_SCALE = ${imageScale(t)}`);
  if (a.card_default) L.push(`${P}_Config.CARD_DEFAULT_PHOTO = ${lq(a.card_default)}`);
  if (a.logo_alt) L.push(`${P}_Config.LOGO_ALT = ${lq(a.logo_alt)}`);
  if (a.clips.length) {
    L.push("", `${P}_Config.VIDEO = {`, `\tmode = ${lq(t.video_mode)},`, "\tclips = {");
    for (const c of a.clips) {
      L.push("\t\t{");
      L.push(`\t\t\tvideo = ${lq(c.video)},`);
      L.push(`\t\t\tstill = ${lq(c.still)},`);
      if (c.sound) L.push(`\t\t\tsound = ${lq(c.sound)},`);
      if (t.video_mode !== "random" && c.length_ms > 0) L.push(`\t\t\tlengthMs = ${toInt(c.length_ms)},`);
      L.push(`\t\t\twidth = ${toInt(c.width)}, height = ${toInt(c.height)},`);
      L.push(`\t\t\tsoundVolume = ${toInt(c.sound_volume)},`);
      L.push(`\t\t\trestartVideo = ${c.restart_video ? "true" : "false"},`);
      L.push(`\t\t\trestartSound = ${c.restart_sound ? "true" : "false"},`);
      L.push("\t\t},");
    }
    L.push("\t},", "}");
  }
  return L.join("\n") + "\n";
}

function creditLua(groups, indent = "\t\t") {
  return groups.map((g) => {
    if (!g.rows.length) return `${indent}{ header = ${lq(g.header)} },`;
    const rows = g.rows.map((r) => lq(r)).join(", ");
    return `${indent}{ header = ${lq(g.header)}, rows = { ${rows} } },`;
  });
}

export function genTheme(t, a, env) {
  const P = t.prefix;
  const hasImg = a.bgs.length > 0;
  const hasVid = a.clips.length > 0;
  const isStatic = t.no_transition || a.bgs.length < 2;
  const L = ['require "MTF_Core"', `require "${P}_Config"`, "",
    `-- ${oneLine(t.name)}: generated by Menu Theme Builder.`,
    "-- Re-open this mod in the tool to edit it; manual changes here are overwritten when you save from the tool.", ""];
  if (hasImg) L.push(`for _, path in ipairs(${P}_Config.BG_IMAGES) do`, "\tgetTexture(path)", "end");
  if (a.card_default) L.push(`getTexture(${P}_Config.CARD_DEFAULT_PHOTO)`);
  if (a.logo_alt) L.push(`getTexture(${P}_Config.LOGO_ALT)`);
  L.push("");

  if (a.logo_alt) {
    L.push(`local function ${P}_LogoPath(ctx)`,
      `\tif ctx.settings.get("LogoVariant") == "alt" and getTexture(${P}_Config.LOGO_ALT) then`,
      `\t\treturn ${P}_Config.LOGO_ALT`, "\tend", "\treturn nil", "end", "");
  }
  const stacked = t.layouts.includes("left");
  if (stacked) {
    L.push(`local function ${P}_LeftCentreY(ctx)`, "\treturn ctx.height / 2", "end", "",
      `local function ${P}_LeftX(ctx)`,
      "\tlocal icon = MenuThemeFramework.optionsButtonRect and MenuThemeFramework.optionsButtonRect()",
      "\tif icon then", "\t\tlocal theme = MenuThemeFramework.theme",
      '\t\tlocal pad = theme and type(theme.menu) == "table" and theme.menu.listHighlightPad',
      '\t\treturn icon.x + (type(pad) == "number" and pad or 6)', "\tend", "\treturn nil", "end", "");
  }
  if (t.logo_place === "custom" || stacked) {
    L.push(`local function ${P}_LogoPlace(ctx, w, h, uiScale)`);
    if (stacked) {
      L.push('\tif ctx.menu.layoutId() == "left" then',
        "\t\treturn ctx.layout.originX + ctx.layout.refW - 50 * uiScale - w, ctx.layout.originY + 50 * uiScale",
        "\tend");
    }
    if (t.logo_place === "custom") {
      L.push(`\treturn ctx.layout.originX + ${toInt(t.logo_x)} * uiScale, ctx.layout.originY + ${toInt(t.logo_y)} * uiScale`);
    } else {
      L.push("\treturn nil");
    }
    L.push("end", "");
  }

  L.push("local run = nil", "",
    "local function startRun(ctx)", "\trun = { screen = ctx.screen, startMs = ctx.now }", "end", "");

  if (hasImg) {
    const picture = !!(t.zoom || imageScale(t) !== 100);
    const seamless = !!t.seamless_slide && !isStatic;
    const drawLines = [
      "local function drawImages(ctx)",
      `\tlocal count = #${P}_Config.BG_IMAGES`,
      "\tif count == 0 then", "\t\treturn", "\tend",
      ...(seamless ? [
        '\tlocal transition = ctx.settings.get("Transition")',
        '\tif count > 1 and (transition == "slide" or transition == "slidedown") then',
        "\t\tdrawSeamless(ctx, transition, count)", "\t\treturn", "\tend",
      ] : []),
      `\tlocal cycleMs = ${P}_Config.TRANSITION_MS + ${P}_Config.IMAGE_HOLD_MS + ${P}_Config.TRANSITION_MS`,
      "\tlocal elapsed = ctx.now - run.startMs",
      "\tlocal index = math.floor(elapsed / cycleMs) % count + 1",
      "\tlocal into = elapsed % cycleMs",
      `\tif elapsed < cycleMs and into < ${P}_Config.TRANSITION_MS then`,
      `\t\tinto = ${P}_Config.TRANSITION_MS`,
      "\tend", "",
      `\tlocal img = ctx.tex(${P}_Config.BG_IMAGES[index])`,
      "\tif not img then", "\t\treturn", "\tend",
      isStatic ? '\tlocal style = "fade"' : '\tlocal style = ctx.settings.get("Transition")',
      "\tlocal w, h = ctx.width, ctx.height",
      `\tlocal drift = ${P}_Config.IMAGE_DRIFT and ${P}_Config.DRIFT_PX * ctx.layout.uiScale or 0`,
      `\tlocal driftX = -drift * math.min(1, math.max(0, (into - ${P}_Config.TRANSITION_MS) / ${P}_Config.IMAGE_HOLD_MS))`,
      "",
      `\tif into < ${P}_Config.TRANSITION_MS then`,
      `\t\tlocal t = into / ${P}_Config.TRANSITION_MS`,
      '\t\tif style == "slide" then', "\t\t\tctx.drawCover(img, 1, w * (1 - t), 0)",
      '\t\telseif style == "slidedown" then', "\t\t\tctx.drawCover(img, 1, 0, -h * (1 - t))",
      "\t\telse", "\t\t\tctx.drawCover(img, 1, 0, 0)",
      "\t\t\tctx.screen:drawRect(0, 0, w, h, 1 - t, 0, 0, 0)", "\t\tend",
      `\telseif into < ${P}_Config.TRANSITION_MS + ${P}_Config.IMAGE_HOLD_MS then`,
      "\t\tctx.drawCover(img, 1, driftX, 0)",
      "\telse",
      `\t\tlocal t = (into - ${P}_Config.TRANSITION_MS - ${P}_Config.IMAGE_HOLD_MS) / ${P}_Config.TRANSITION_MS`,
      '\t\tif style == "slide" then', "\t\t\tctx.drawCover(img, 1, driftX - w * t, 0)",
      '\t\telseif style == "slidedown" then', "\t\t\tctx.drawCover(img, 1, driftX, h * t)",
      "\t\telse", "\t\t\tctx.drawCover(img, 1, driftX, 0)",
      "\t\t\tctx.screen:drawRect(0, 0, w, h, t, 0, 0, 0)", "\t\tend",
      "\tend", "end", ""];
    if (picture) L.push(...pictureHelper());
    if (seamless) L.push(...seamlessLines(P, picture, t.zoom));
    L.push(...(picture ? pictureBody(P, drawLines, t.zoom) : drawLines));
  }

  L.push(`local function ${P}_renderBackground(ctx)`,
    "\tif not run or run.screen ~= ctx.screen then", "\t\tstartRun(ctx)", "\tend",
    "\tctx.screen:drawRect(0, 0, ctx.width, ctx.height, 1, 0, 0, 0)");
  if (hasImg && hasVid) {
    L.push('\tif ctx.settings.get("BackgroundMode") == "video" then', "\t\tctx.video.play()", "\telse",
      "\t\tctx.video.stop()", "\t\tdrawImages(ctx)", "\tend");
  } else if (hasVid) {
    L.push("\tctx.video.play()");
  } else {
    L.push("\tdrawImages(ctx)");
  }
  L.push("end", "");

  L.push("MenuThemeFramework.registerTheme({",
    `\tid = ${lq(t.theme_id)},`,
    `\tname = "IGUI_${P}_Name",`,
    `\tmodId = ${lq(modId(t))},`,
    `\tassetPrefix = ${lq(P)},`,
    `\tsettingsFolder = ${lq(t.theme_id)},`, "");
  const groups = finalCreditGroups(t);
  if (groups.length) L.push("\tcredits = {", ...creditLua(groups), "\t},");
  const footer = [];
  if (t.about.trim()) footer.push({ header: "About this Mod:", rows: [t.about.trim()] });
  footer.push({ header: stampText(), rows: [] });
  L.push("\tcreditsFooter = {", ...creditLua(footer), "\t},");

  if (t.layouts.length) {
    const dflt = t.layouts.includes(t.default_layout) ? t.default_layout : t.layouts[0];
    L.push("", "\tlayouts = {");
    const extras = {
      rail: 'preset = "keep"',
      left: `preset = "keep", alignY = ${P}_LeftCentreY, alignX = ${P}_LeftX`,
      strip: 'preset = "strip"',
      carousel: 'preset = "carousel", carouselAlign = "centre"',
      cards_wide: 'preset = "cards", cardWidth = 1228',
      cards_vertical: 'preset = "cards", cardOrientation = "vertical"',
    };
    for (const lid of t.layouts) {
      const suffix = LAYOUTS[lid][1];
      const base = `\t\t{ id = "${lid}", name = "IGUI_${P}_${suffix}", `;
      L.push(base + extras[lid] + " },");
    }
    L.push("\t},", `\tdefaultLayout = "${dflt}",`);
  }

  const sett = [];
  if (hasImg && hasVid) {
    sett.push(`\t\t{ key = "BackgroundMode", type = "choice", default = ${lq(t.default_bg_mode)}, first = true, ` +
      `values = { "images", "video" }, labels = { "IGUI_${P}_BackgroundImages", "IGUI_${P}_BackgroundVideo" }, ` +
      `label = "IGUI_${P}_Background" },`);
  }
  if (hasImg && !isStatic) {
    sett.push(`\t\t{ key = "Transition", type = "choice", default = ${lq(t.transition_style)}, ` +
      'values = { "slide", "slidedown", "fade" }, ' +
      `labels = { "IGUI_${P}_AnimSlide", "IGUI_${P}_AnimSlideDown", "IGUI_${P}_AnimFade" }, label = "IGUI_${P}_Transition" },`);
  }
  if (a.logo_alt) {
    sett.push('\t\t{ key = "LogoVariant", type = "choice", default = "standard", values = { "standard", "alt" }, ' +
      `labels = { "IGUI_${P}_LogoStandard", "IGUI_${P}_LogoAlt" }, label = "IGUI_${P}_Logo" },`);
  }
  if (sett.length) L.push("", "\tsettings = {", ...sett, "\t},");

  L.push("", "\trender = {", `\t\tbackground = ${P}_renderBackground,`, "\t},");

  const logo = ["\tlogo = {", t.logo_slide ? "\t\tslide = 0.35," : "\t\tslide = 0,"];
  let n = 0;
  if (t.logo_place === "custom" || stacked) {
    logo.push(`\t\tplace = ${P}_LogoPlace,`);
    n += 1;
  }
  if (a.logo_alt) {
    logo.push(`\t\tpath = ${P}_LogoPath,`);
    n += 1;
  }
  if (n || t.logo_slide) L.push("", ...logo, "\t},");

  if (t.tracks.length) {
    L.push("", "\tmusic = {");
    for (const tr of a.tracks) {
      L.push(`\t\t{ ${lq(tr.sound)}, ${lq(tr.title)}, ${Math.max(1, toInt(tr.length_ms))} },`);
    }
    L.push("\t},");
    if (t.repeat_one) L.push("\tmusicRepeatOne = true,");
  }
  if (hasVid) L.push("", `\tvideo = ${P}_Config.VIDEO,`);

  const menu = [];
  if (t.list_highlight === "white" || t.list_highlight === "caption") menu.push(`\t\tlistHighlight = "${t.list_highlight}",`);
  if (t.list_highlight === "caption" && t.highlight_tint_on) {
    const [hr, hg, hb] = tintChannels(t.highlight_tint);
    menu.push(`\t\tlistHighlightTint = { r = ${fixed(hr, 3)}, g = ${fixed(hg, 3)}, b = ${fixed(hb, 3)} },`);
  }
  if (t.fonts.length) {
    menu.push("\t\tfonts = {");
    for (const fp of fontPlan(t)) {
      menu.push(`\t\t\t{ id = ${lq(fp.id)}, name = "${fp.key}", fnt = ${lq(`media/fonts/${P}/${fp.stem}.fnt`)} },`);
    }
    menu.push("\t\t},");
  }
  if (menu.length) L.push("", "\tmenu = {", ...menu, "\t},");

  if (hasImg) {
    L.push("", "\tloadCover = {", "\t\tready = function(ctx)",
      `\t\t\treturn MenuThemeFramework.texturesReady(${P}_Config.BG_IMAGES)`, "\t\tend,",
      "\t\tfadeMs = 500,", "\t\tmaxHoldMs = 10000,", "\t},");
  }
  if (isStatic) L.push("", "\ttransitionSpeed = false,");

  if (a.card_default) {
    L.push("", "\tcardPhoto = function(buttonId)", `\t\treturn ${P}_Config.CARD_DEFAULT_PHOTO`, "\tend,");
  }
  if (t.caption || t.caption_tint_on || needsCaptionArt(t)) {
    const look = [];
    if (t.caption_tint_on || needsCaptionArt(t)) {
      const [r, g, b] = tintChannels(t.caption_tint_on ? t.caption_tint : "#000000");
      look.push(`\t\t\tcaptionTint = { r = ${fixed(r, 3)}, g = ${fixed(g, 3)}, b = ${fixed(b, 3)} },`);
    }
    if (EMIT_CAPTION_UNDER_BORDER) look.push("\t\t\tcaptionUnderBorder = true,");
    if (look.length) L.push("", "\tcards = {", "\t\tlook = {", ...look, "\t\t},", "\t},");
  }

  if (t.buttons_instant) L.push("", '\treveal = { fadeMs = 0, slide = "none" },');

  const cfg = [`\t\tMUSIC_VOLUME = ${fixed(t.music_volume / 100, 2)},`];
  if (hasVid) cfg.push(`\t\tVIDEO_VOLUME = ${fixed(t.video_volume / 100, 2)},`);
  cfg.push(`\t\tLOGO_FADE_IN_MS = ${toInt(t.logo_fade_ms)},`);
  const lh = logoDisplayHeight(t, env);
  if (lh) cfg.push(`\t\tLOGO_DISPLAY_HEIGHT = ${lh},`);
  L.push("", "\tconfig = {", ...cfg, "\t},", "})", "");
  return L.join("\n");
}

export function genSounds(a) {
  const L = ["module Base", "{"];
  const entries = [
    ...a.tracks.map((x) => [x.sound, x.file, true]),
    ...a.clips.filter((c) => c.sound).map((c) => [c.sound, c.sound_file, c.loop]),
  ];
  entries.forEach(([name, f, loop], i) => {
    L.push(`    sound ${name}`, "    {", "        category = Ambient,", "        master = Primary,",
      `        loop = ${loop ? "true" : "false"},`, "        volume = 1.0,", "        is3D = false,", "        clip", "        {",
      `            file = ${f},`, "        }", "    }");
    if (i !== entries.length - 1) L.push("");
  });
  L.push("}");
  return L.join("\r\n") + "\r\n";
}

export function genTranslation(t) {
  const P = t.prefix;
  const d = {
    [`IGUI_${P}_Name`]: t.name,
    [`IGUI_${P}_Background`]: "Background",
    [`IGUI_${P}_BackgroundImages`]: "Images",
    [`IGUI_${P}_BackgroundVideo`]: "Video",
    [`IGUI_${P}_Transition`]: "Slideshow Animation",
    [`IGUI_${P}_AnimSlide`]: "Horizontal Slide",
    [`IGUI_${P}_AnimSlideDown`]: "Vertical Slide",
    [`IGUI_${P}_AnimFade`]: "Fade",
    [`IGUI_${P}_Logo`]: "Logo",
    [`IGUI_${P}_LogoStandard`]: "Standard",
    [`IGUI_${P}_LogoAlt`]: "Alternative",
  };
  for (const lid of t.layouts) d[`IGUI_${P}_${LAYOUTS[lid][1]}`] = LAYOUTS[lid][2];
  for (const fp of fontPlan(t)) d[fp.key] = fp.label;
  return JSON.stringify(d, null, "\t") + "\n";
}

export function genModinfo(t) {
  const desc = t.description.trim().replace(/\r/g, "").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "").replace(/\n/g, " <LINE> ");
  const lines = [`name=${oneLine(t.name)}`, `id=${modId(t)}`, `description=${desc}`, "poster=poster.png",
    `author=${oneLine(t.author)}`, "icon=icon.png", "require=ObnoxMenuThemeFrameworkB42",
    "loadAfter=ObnoxMenuThemeFrameworkB42", `versionMin=${oneLine(t.version_min)}`,
    `modversion=${oneLine(t.mod_version)}`];
  return lines.join("\r\n") + "\r\n";
}

export function buildMod(theme, env) {
  const [errs] = validate(theme, env);
  if (errs.length) throw new BuildError(errs.join("\n"));
  const t = theme;
  const P = t.prefix;
  const root = t.theme_id;
  const modDir = `${root}/Contents/mods/${t.theme_id}`;
  const m42 = `${modDir}/42`;
  const files = [];
  const a = { bgs: [], tracks: [], clips: [], card_default: "", logo_alt: "" };
  const out = mapPaths(t, (p) => p);
  const finalRel = (p) => `Contents/mods/${t.theme_id}/42/${p}`;
  const png = (key, path) => files.push({ path, kind: "png", key });
  const copy = (key, path) => files.push({ path, kind: "copy", key });
  const text = (path, body) => files.push({ path, kind: "text", text: body });

  t.backgrounds.forEach((src, i) => {
    const rel = `media/ui/backgrounds/${P}_Background_${i + 1}.png`;
    png(src, `${m42}/${rel}`);
    a.bgs.push(rel);
    out.backgrounds[i] = finalRel(rel);
  });

  const conv = (attr, rel) => {
    const src = t[attr];
    if (src) {
      png(src, `${m42}/${rel}`);
      out[attr] = finalRel(rel);
      return rel;
    }
    return "";
  };
  conv("logo", `media/ui/logos/${P}_Menu_Logo.png`);
  a.logo_alt = conv("logo_alt", `media/ui/logos/${P}_Menu_Logo_Alt.png`);
  conv("options_icon", `media/ui/icons/${P}_Options_Icon.png`);
  conv("strip", `media/ui/layout/${P}_Strip.png`);
  conv("arrow_h", `media/ui/layout/${P}_Arrow_H.png`);
  conv("arrow_v", `media/ui/layout/${P}_Arrow_V.png`);
  conv("caption", `media/ui/cards/captions/${P}_Caption.png`);
  if (needsCaptionArt(t)) files.push({ path: `${m42}/media/ui/cards/captions/${P}_Caption.png`, kind: "solid", w: 256, h: 64, color: "#ffffff" });
  a.card_default = conv("card_default", `media/ui/cards/backgrounds/${P}_Card_Default.png`);
  for (const bid of BUTTON_IDS) {
    const src = t.cards[bid];
    if (src) {
      const rel = `media/ui/cards/backgrounds/${P}_Card_${bid}.png`;
      png(src, `${m42}/${rel}`);
      out.cards[bid] = finalRel(rel);
    }
  }

  if (t.fonts.length) {
    const fdir = `${m42}/media/fonts/${P}`;
    const kept = new Set();
    const keep = (name) => {
      const st = stem(name);
      const ext = name.slice(st.length);
      let n = name;
      let k = 2;
      while (kept.has(n.toLowerCase())) {
        n = `${st}_${k}${ext}`;
        k += 1;
      }
      kept.add(n.toLowerCase());
      return n;
    };
    fontPlan(t).forEach((fp, i) => {
      const f = fp.font;
      for (const [tier] of FONT_TIERS) {
        const dir = tier ? `${fdir}/${tier}` : fdir;
        files.push({ path: `${dir}/${fp.stem}.fnt`, kind: "fontfnt", key: f.file, scale: f.scale, tier, label: fp.label, stem: fp.stem });
        files.push({ path: `${dir}/${fp.stem}_0.png`, kind: "fontpng", key: f.file, scale: f.scale, tier, label: fp.label, stem: fp.stem });
      }
      const fname = keep(basename(f.file));
      copy(f.file, `${root}/FontSource/${fname}`);
      out.fonts[i].file = `FontSource/${fname}`;
      if (f.license && env.has(f.license)) {
        copy(f.license, `${fdir}/OFL-${sanitizeStem(stem(fname))}.txt`);
        const lname = keep(basename(f.license));
        copy(f.license, `${root}/FontSource/${lname}`);
        out.fonts[i].license = `FontSource/${lname}`;
      } else {
        out.fonts[i].license = "";
      }
    });
  }

  const used = new Set();
  const unique = (s) => {
    let n = s;
    let k = 2;
    while (used.has(n.toLowerCase())) {
      n = `${s}_${k}`;
      k += 1;
    }
    used.add(n.toLowerCase());
    return n;
  };
  t.tracks.forEach((tr, i) => {
    let baseStem = sanitizeStem(stem(tr.path));
    if (baseStem.toLowerCase().startsWith(P.toLowerCase() + "_")) baseStem = baseStem.slice(P.length + 1) || "Track";
    const s = unique(`${P}_${baseStem}`);
    const rel = `media/sounds/${s}.ogg`;
    copy(tr.path, `${m42}/${rel}`);
    out.tracks[i].path = finalRel(rel);
    a.tracks.push({ sound: s, file: rel, title: tr.title || stem(tr.path), length_ms: tr.length_ms });
  });

  t.clips.forEach((c, i) => {
    const n = i + 1;
    const vrel = `media/videos/${P}_Clip_${n}.bik`;
    copy(c.video, `${m42}/${vrel}`);
    out.clips[i].video = finalRel(vrel);
    const srel = vrel + ".png";
    const stillKey = c.still || t.backgrounds[0] || "";
    if (stillKey) png(stillKey, `${m42}/${srel}`);
    else files.push({ path: `${m42}/${srel}`, kind: "blank", w: Math.max(16, Math.floor(c.width / 8)), h: Math.max(9, Math.floor(c.height / 8)) });
    out.clips[i].still = c.still ? finalRel(srel) : "";
    const entry = {
      video: `${P}_Clip_${n}.bik`, still: srel, sound: "", sound_file: "",
      width: c.width, height: c.height, length_ms: c.length_ms,
      sound_volume: c.sound_volume, restart_video: c.restart_video,
      restart_sound: c.restart_sound,
      loop: !(t.video_mode !== "random" && c.length_ms > 0 && c.restart_sound),
    };
    if (c.sound) {
      const s = unique(`${P}_Clip_${n}`);
      const arel = `media/sounds/${s}.ogg`;
      copy(c.sound, `${m42}/${arel}`);
      out.clips[i].sound = finalRel(arel);
      entry.sound = s;
      entry.sound_file = arel;
    }
    a.clips.push(entry);
  });

  text(`${m42}/media/lua/shared/${P}_Config.lua`, genConfig(t, a));
  text(`${m42}/media/lua/client/${P}_Theme.lua`, genTheme(t, a, env));
  if (a.tracks.length || a.clips.some((c) => c.sound)) text(`${m42}/media/scripts/${P}_Sounds.txt`, genSounds(a));
  text(`${modDir}/common/media/lua/shared/Translate/EN/IG_UI.json`, genTranslation(t));
  const info = genModinfo(t);
  text(`${modDir}/mod.info`, info);
  text(`${m42}/mod.info`, info);

  const firstBg = t.backgrounds[0] || null;
  for (const d of [modDir, m42]) {
    if (t.poster) png(t.poster, `${d}/poster.png`);
    else files.push({ path: `${d}/poster.png`, kind: "square", key: firstBg, size: 256, label: P });
    if (t.icon) png(t.icon, `${d}/icon.png`);
    else files.push({ path: `${d}/icon.png`, kind: "square", key: firstBg, size: 82, label: P });
  }
  if (t.poster) out.poster = `Contents/mods/${t.theme_id}/poster.png`;
  if (t.icon) out.icon = `Contents/mods/${t.theme_id}/icon.png`;
  files.push({ path: `${root}/preview.png`, kind: "square", key: t.poster || firstBg, size: 512, label: P });

  out.builder_version = BUILDER_VERSION;
  text(`${root}/${PROJECT_FILE}`, pyJsonDumps(out, 2));
  return { files, project: out, root };
}
