import { PATH_FIELDS, loadProject, mapPaths, newTheme } from "./model.js";
import { buildMod, validate } from "./generator.js";
import { materialize } from "./assemble.js";
import { buildZip, readZip } from "./zip.js";
import { AssetStore } from "./store.js";
import { Preview, layoutName } from "./preview.js";
import { LAYOUTS } from "./model.js";
import { buildTabs } from "./tabs.js";
import { BUILDER_VERSION, workshopCredit } from "./version.js";
import { button, h } from "./ui.js";
import { basename } from "./util.js";
import { CHANGELOG } from "./changelog.js";

const state = { theme: newTheme(), store: new AssetStore(), dirty: false, active: "info", result: null, busy: false };

const c = {
  theme: () => state.theme,
  get store() {
    return state.store;
  },
  touch,
  notice,
  syncAll,
  redrawers: [],
};

const $ = (id) => document.getElementById(id);
const tabs = buildTabs(c);

function assetKeys(t) {
  const keys = [...PATH_FIELDS.map((f) => t[f]), ...t.backgrounds, ...Object.values(t.cards)];
  for (const tr of t.tracks) keys.push(tr.path);
  for (const cp of t.clips) keys.push(cp.video, cp.still, cp.sound);
  return keys.filter(Boolean);
}

function env() {
  return { has: (k) => state.store.has(k), imageSize: (k) => state.store.size(k) };
}

let noticeTimer = 0;
function notice(message, kind = "info") {
  const box = $("notice");
  clearTimeout(noticeTimer);
  box.className = "notice " + kind;
  box.hidden = false;
  box.replaceChildren(h("span", { class: "msg" }, message), button("✕", () => {
    box.hidden = true;
  }, { title: "Dismiss", class: "x" }));
  if (kind === "info") noticeTimer = setTimeout(() => (box.hidden = true), 8000);
}

function renderStatus() {
  const [errs, warns] = validate(state.theme, env());
  const box = $("status");
  const kids = [];
  if (errs.length) kids.push(h("div", { class: "bad" }, h("strong", {}, "Fix before building"), h("ul", {}, errs.map((e) => h("li", {}, e)))));
  if (warns.length) kids.push(h("div", { class: "warn" }, h("strong", {}, "Warnings"), h("ul", {}, warns.map((e) => h("li", {}, e)))));
  if (!errs.length) kids.unshift(h("div", { class: "good" }, "Ready to build."));
  box.replaceChildren(...kids);
  $("build").disabled = state.busy || errs.length > 0;
}

let preview;
function syncPreviewControls() {
  const t = state.theme;
  const sel = $("layout-select");
  const ids = Object.keys(LAYOUTS).filter((id) => t.layouts.includes(id));
  const want = ids.includes(preview.layoutId) ? preview.layoutId : ids.includes(t.default_layout) ? t.default_layout : ids[0] || "";
  const same = sel.options.length === ids.length && ids.every((id, i) => sel.options[i].value === id);
  if (!same) sel.replaceChildren(...ids.map((id) => h("option", { value: id }, layoutName(id))));
  sel.disabled = !ids.length;
  sel.value = want;
  preview.setLayout(want);
}

function touch() {
  state.dirty = true;
  renderStatus();
  syncPreviewControls();
  preview.redraw();
}

function activeTab() {
  return tabs.find((tab) => tab.id === state.active);
}

function syncAll() {
  for (const tab of tabs) tab.sync();
  renderStatus();
  syncPreviewControls();
  preview.redraw();
}

function selectTab(id) {
  state.active = id;
  tabs.forEach((tab) => {
    tab.button.setAttribute("aria-selected", String(tab.id === id));
    tab.button.tabIndex = tab.id === id ? 0 : -1;
    tab.panel.hidden = tab.id !== id;
  });
  activeTab().sync();
}

function attachStore(store) {
  store.onchange = () => {
    preview.redraw();
    c.redrawers.forEach((f) => f());
  };
}

function resetTo(theme, store) {
  const old = state.store;
  state.theme = theme;
  state.store = store;
  old.dispose();
  attachStore(store);
  preview.setStore(store);
  state.dirty = false;
  state.result = null;
  $("result").hidden = true;
  syncAll();
}

function newProject() {
  if (state.dirty && !confirm("Discard the current Theme and start a new one?")) return;
  resetTo(newTheme(), new AssetStore());
}

function setBusy(busy, text) {
  state.busy = busy;
  $("progress").hidden = !busy;
  $("progress").textContent = text || "";
  $("build").disabled = busy;
  $("open").disabled = busy;
  $("new").disabled = busy;
  if (!busy) renderStatus();
}

function formatSize(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  return url;
}

async function build() {
  if (state.busy) return;
  const t = state.theme;
  const [errs, warns] = validate(t, env());
  if (errs.length) {
    renderStatus();
    notice("Fix the problems listed above first.", "error");
    return;
  }
  if (warns.length && !confirm("Warnings:\n\n• " + warns.join("\n• ") + "\n\nBuild anyway?")) return;
  setBusy(true, "Preparing…");
  try {
    await state.store.ensureSizes(assetKeys(t));
    const { files, root } = buildMod(t, env());
    const entries = await materialize(files, state.store, (d, n) => {
      $("progress").textContent = `Preparing files ${d}/${n}…`;
    });
    const zip = await buildZip(entries, (d, n) => {
      $("progress").textContent = `Writing zip ${d}/${n}…`;
    });
    const name = `${root}.zip`;
    const url = download(zip, name);
    state.result = { url, name, size: zip.size, root };
    state.dirty = false;
    showResult();
  } catch (e) {
    notice(e.message || String(e), "error");
  } finally {
    setBusy(false);
  }
}

function creditSnippet() {
  const input = h("input", { type: "text", readonly: true, class: "credit-snippet", value: workshopCredit() });
  const copy = h("button", { type: "button", class: "btn" }, "Copy");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    copy.textContent = "Copied";
    setTimeout(() => {
      copy.textContent = "Copy";
    }, 1800);
  });
  return h("div", { class: "copy-row" }, input, copy);
}

function showResult() {
  const r = state.result;
  const box = $("result");
  box.hidden = false;
  box.replaceChildren(
    h("h3", {}, "Mod built"),
    h("p", {}, `${r.name} (${formatSize(r.size)}) was downloaded. Nothing was uploaded anywhere.`),
    h("ol", {},
      h("li", {}, `Extract the zip so the folder "${r.root}" sits directly inside your Workshop folder, usually C:\\Users\\<you>\\Zomboid\\Workshop\\ (Windows) or ~/Zomboid/Workshop/.`),
      h("li", {}, 'In the game, open Mods, enable "Menu Theme Framework" and your Theme, then accept.'),
      h("li", {}, "To edit the Theme later, use Open and choose this zip again.")),
    h("p", {}, "Publishing to the Steam Workshop? Paste this line into the Workshop description to credit the Builder with a link (the Mod's own Credits tab already says it was built with the Builder):"),
    creditSnippet(),
    h("a", { class: "btn", href: r.url, download: r.name }, "Download again"));
}

async function openZip(file) {
  if (state.dirty && !confirm("Discard the current Theme and open this zip?")) return;
  setBusy(true, "Reading zip…");
  try {
    const zip = await readZip(file);
    const projName = zip.names.find((n) => /^[^/]+\/ThemeProject\.json$/.test(n));
    if (!projName) throw new Error("This zip has no ThemeProject.json. Only mods made with Menu Theme Builder (web or desktop) can be opened.");
    const root = projName.split("/")[0];
    const loaded = loadProject(JSON.parse(await (await zip.get(projName)).text()));
    const store = new AssetStore();
    const cache = new Map();
    mapPaths(loaded, (p) => {
      cache.set(p, "");
      return p;
    });
    const missing = [];
    for (const rel of cache.keys()) {
      if (rel.split("/").includes("..") || rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) {
        missing.push(rel);
        continue;
      }
      const blob = await zip.get(`${root}/${rel}`);
      if (blob) cache.set(rel, store.add(new File([blob], basename(rel))));
      else missing.push(rel);
    }
    const theme = mapPaths(loaded, (p) => cache.get(p) || "");
    await store.ensureSizes(assetKeys(theme));
    resetTo(theme, store);
    const notes = [];
    if (missing.length) notes.push(`${missing.length} file(s) listed in the project were not found and were left empty.`);
    notice(notes.length ? `Opened ${file.name}.\n${notes.join("\n")}` : `Opened ${file.name}.`, notes.length ? "error" : "info");
  } catch (e) {
    notice(e.message || String(e), "error");
  } finally {
    setBusy(false);
  }
}

function init() {
  $("builder-version").textContent = BUILDER_VERSION;
  const dlg = $("changelog-dialog");
  dlg.append(
    h("h2", {}, "Changelog"),
    ...CHANGELOG.flatMap((r) => [
      h("h3", {}, `Version ${r.version}`, h("span", { class: "date" }, r.date)),
      h("ul", {}, ...r.changes.map((c) => h("li", {}, c))),
    ]),
    h("form", { method: "dialog" }, h("button", { class: "btn" }, "Close")),
  );
  $("changelog-btn").addEventListener("click", () => dlg.showModal());
  const help = $("help-dialog");
  help.append(
    h("h2", {}, "Help"),
    h("ol", {},
      h("li", {}, "Start on the Theme tab (name and Author), then add Images, Music, Video, Menu and Logo, Cards, Fonts and Credits as you like. The preview follows every change."),
      h("li", {}, "Press Build mod (.zip). Any problems are listed first, and nothing is uploaded anywhere."),
      h("li", {}, "Extract the zip into your Zomboid Workshop folder, then enable Menu Theme Framework and your Theme in the game's Mods screen."),
      h("li", {}, "To change a Theme later, use Open built zip and choose the zip again.")),
    h("p", {}, "The full guide is in the Menu Theme Framework documentation. Open Documentation, then choose Menu Theme Builder."),
    h("p", {}, h("a", { href: "https://obnox.dev/docs", target: "_blank", rel: "noopener" }, "Open Documentation")),
    h("form", { method: "dialog" }, h("button", { class: "btn" }, "Close")),
  );
  $("help-btn").addEventListener("click", () => help.showModal());
  for (const d of [dlg, help]) {
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
  }
  const bar = $("tabbar");
  const panels = $("panels");
  for (const tab of tabs) {
    tab.button = h("button", { type: "button", role: "tab", class: "tab", onclick: () => selectTab(tab.id) }, tab.title);
    tab.panel = h("section", { role: "tabpanel", class: "panel", hidden: true }, tab.el);
    bar.append(tab.button);
    panels.append(tab.panel);
  }
  bar.addEventListener("keydown", (e) => {
    const i = tabs.findIndex((x) => x.id === state.active);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    const tab = tabs[(next + tabs.length) % tabs.length];
    selectTab(tab.id);
    tab.button.focus();
  });

  preview = new Preview($("canvas"), state.store, () => state.theme, (text) => {
    $("preview-info").textContent = text;
  });
  attachStore(state.store);
  $("grid").addEventListener("change", (e) => {
    preview.grid = e.target.checked;
    preview.redraw();
  });
  $("layout-select").addEventListener("change", (e) => preview.setLayout(e.target.value));
  $("prev").addEventListener("click", () => preview.step(-1));
  $("next").addEventListener("click", () => preview.step(1));

  $("new").addEventListener("click", newProject);
  $("build").addEventListener("click", build);
  const zipInput = $("zip-input");
  $("open").addEventListener("click", () => zipInput.click());
  zipInput.addEventListener("change", () => {
    const f = zipInput.files[0];
    zipInput.value = "";
    if (f) openZip(f);
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.dirty && assetKeys(state.theme).length) e.preventDefault();
  });
  selectTab("info");
  syncAll();
}

init();
