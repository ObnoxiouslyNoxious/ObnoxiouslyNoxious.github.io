import { basename } from "./util.js";

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function setValue(el, v) {
  const s = String(v ?? "");
  if (el.value !== s) el.value = s;
}

export function setChecked(el, v) {
  if (el.checked !== !!v) el.checked = !!v;
}

export function note(text) {
  return h("p", { class: "note" }, text);
}

export function group(title, ...kids) {
  return h("fieldset", { class: "group" }, h("legend", {}, title), ...kids);
}

export function details(title, ...kids) {
  return h("details", { class: "more" }, h("summary", {}, title), h("div", { class: "more-body" }, ...kids));
}

export function row(label, control, help) {
  return h("div", { class: "row" }, h("span", { class: "lbl" }, label), h("div", { class: "ctl" }, control, help ? h("small", {}, help) : null));
}

export function button(text, onclick, attrs = {}) {
  return h("button", { type: "button", onclick, ...attrs }, text);
}

function wrapAfter(c, after) {
  return () => {
    if (after) after();
    c.touch();
  };
}

export function textField(c, label, obj, prop, { help, area, after, rows = 3, mono } = {}) {
  const input = area ? h("textarea", { rows, spellcheck: "true" }) : h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
  if (mono) input.classList.add("mono");
  const done = wrapAfter(c, after);
  input.addEventListener("input", () => {
    obj()[prop] = input.value;
    done();
  });
  c.syncs.push(() => setValue(input, obj()[prop]));
  return { el: row(label, input, help), input };
}

export function numberField(c, label, obj, prop, min, max, step, { suffix, help, after } = {}) {
  const input = h("input", { type: "number", min, max, step, inputmode: "numeric" });
  const done = wrapAfter(c, after);
  input.addEventListener("input", () => {
    if (input.value === "") return;
    const n = Math.trunc(Number(input.value));
    if (!Number.isFinite(n)) return;
    obj()[prop] = Math.min(max, Math.max(min, n));
    done();
  });
  input.addEventListener("change", () => setValue(input, obj()[prop]));
  c.syncs.push(() => setValue(input, obj()[prop]));
  const ctl = suffix ? h("span", { class: "with-suffix" }, input, h("span", { class: "suffix" }, suffix)) : input;
  return { el: row(label, ctl, help), input };
}

export function checkField(c, label, obj, prop, after) {
  const input = h("input", { type: "checkbox" });
  const done = wrapAfter(c, after);
  input.addEventListener("change", () => {
    obj()[prop] = input.checked;
    done();
  });
  c.syncs.push(() => setChecked(input, obj()[prop]));
  return { el: h("label", { class: "check" }, input, h("span", {}, label)), input };
}

export function selectField(c, label, obj, prop, options, { help, after } = {}) {
  const sel = h("select", {}, options.map(([v, text]) => h("option", { value: v }, text)));
  const done = wrapAfter(c, after);
  sel.addEventListener("change", () => {
    obj()[prop] = sel.value;
    done();
  });
  c.syncs.push(() => setValue(sel, obj()[prop]));
  return { el: row(label, sel, help), input: sel };
}

function dropTarget(el, onFiles) {
  el.addEventListener("dragover", (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
      e.preventDefault();
      el.classList.add("drop");
    }
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop");
    if (e.dataTransfer && e.dataTransfer.files.length) {
      e.preventDefault();
      onFiles([...e.dataTransfer.files]);
    }
  });
}

export { dropTarget };

export function imageField(c, label, hint, obj, prop, { after } = {}) {
  const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp", hidden: true });
  const thumb = h("img", { class: "thumb", alt: "", hidden: true });
  const name = h("span", { class: "fname" });
  const clear = button("Clear", () => {
    obj()[prop] = "";
    sync();
    if (after) after();
    c.touch();
  });
  const choose = button("Choose…", () => input.click());
  const done = wrapAfter(c, after);
  async function setFile(file) {
    if (!file) return;
    try {
      const key = await c.store.addImage(file);
      obj()[prop] = key;
      sync();
      done();
    } catch (e) {
      c.notice(e.message, "error");
    }
  }
  input.addEventListener("change", () => {
    const f = input.files[0];
    input.value = "";
    setFile(f);
  });
  const el = h("div", { class: "image-field" },
    h("div", { class: "image-head" }, h("span", { class: "lbl" }, label), hint ? h("small", {}, hint) : null),
    h("div", { class: "image-body" }, thumb, h("div", { class: "image-info" }, name, h("div", { class: "btns" }, choose, clear)), input));
  dropTarget(el, (files) => setFile(files[0]));
  function sync() {
    const o = obj();
    const key = o ? o[prop] : "";
    if (key && c.store.has(key)) {
      thumb.src = c.store.url(key);
      thumb.hidden = false;
      const s = c.store.size(key);
      name.textContent = basename(key) + (s ? `  (${s.w}x${s.h})` : "");
      clear.disabled = false;
    } else {
      thumb.hidden = true;
      thumb.removeAttribute("src");
      name.textContent = "No file chosen";
      clear.disabled = true;
    }
  }
  c.syncs.push(sync);
  return { el, sync };
}

export function fileField(c, label, accept, obj, prop, onPick, hint) {
  const input = h("input", { type: "file", accept, hidden: true });
  const name = h("span", { class: "fname" });
  const syncAll = () => c.syncs.forEach((f) => f());
  const clear = button("Clear", () => {
    obj()[prop] = "";
    if (onPick) onPick("", null);
    syncAll();
    c.touch();
  });
  const choose = button("Choose…", () => input.click());
  async function setFile(file) {
    if (!file) return;
    const key = c.store.add(file);
    try {
      if (onPick) await onPick(key, file);
    } catch (e) {
      c.store.files.delete(key);
      c.notice(e.message, "error");
      return;
    }
    obj()[prop] = key;
    syncAll();
    c.touch();
  }
  input.addEventListener("change", () => {
    const f = input.files[0];
    input.value = "";
    setFile(f);
  });
  const el = row(label, h("div", { class: "file-field" }, name, choose, clear, input), hint);
  dropTarget(el, (files) => setFile(files[0]));
  function sync() {
    const o = obj();
    const key = o ? o[prop] : "";
    name.textContent = key && c.store.has(key) ? basename(key) : "No file chosen";
    clear.disabled = !key;
  }
  c.syncs.push(sync);
  return { el, sync };
}
