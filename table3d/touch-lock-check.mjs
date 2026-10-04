// БРАУЗЕРНЫЕ ЖЕСТЫ ЗАПЕРТЫ: нет выделения/лупы/выноски на любом элементе, нет зума страницы; поля ввода остаются текстовыми.
//   node touch-lock-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=top`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1200);
const r = await p.evaluate(() => {
  const st = (el) => { const c = getComputedStyle(el); return { sel: c.userSelect, call: c.webkitTouchCallout, ta: c.touchAction }; };
  const canvas = document.querySelector("#stage canvas"), input = Object.assign(document.createElement("input"), { type: "text" });
  document.body.append(input);
  const ev = (type, t) => { const e = new Event(type, { bubbles: true, cancelable: true }); t.dispatchEvent(e); return e.defaultPrevented; };
  return {
    body: st(document.body), canvas: st(canvas), input: st(input),
    selectstart: ev("selectstart", canvas), dbl: ev("dblclick", canvas), gesture: ev("gesturestart", canvas), typingSelect: ev("selectstart", input),
    touchstart: ev("touchstart", canvas),
    meta: document.querySelector('meta[name="viewport"]').content,
  };
});
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
check("тело страницы: выделение выключено", r.body.sel === "none", r.body);
check("холст: выделение выключено", r.canvas.sel === "none", r.canvas);
check("холст: двойной тап не зумит (manipulation или none)", ["manipulation", "none"].includes(r.canvas.ta), r.canvas);
check("поле ввода остаётся текстовым", r.input.sel === "text" && !r.typingSelect, r);
check("выделение, двойной щелчок и щипок гасятся", r.selectstart && r.dbl && r.gesture, r);
check("касание холста отменяется на touchstart (иначе iOS успевает вызвать лупу)", r.touchstart, r);
check("viewport без зума", /user-scalable=no/.test(r.meta) && /maximum-scale=1/.test(r.meta), r.meta);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
