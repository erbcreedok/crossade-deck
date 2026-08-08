import { webkit } from "@playwright/test";
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const bad = [];
p.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace("https://erbcreedok.github.io/crossade-deck/","")}`); });
p.on("pageerror", e => bad.push("pageerror: " + e.message.slice(0, 200)));
p.on("console", m => { if (m.type() === "error") bad.push("console: " + m.text().slice(0, 200)); });
await p.goto("https://erbcreedok.github.io/crossade-deck/", { waitUntil: "load" }).catch(e => bad.push("goto: " + e.message.slice(0,80)));
await p.waitForTimeout(10000);
const seen = await p.evaluate(() => ({
  body: (document.body.innerText || "").trim().slice(0, 120),
  iframe: !!document.querySelector("iframe#storybook-preview-iframe"),
  sw: "serviceWorker" in navigator ? "поддерживается" : "нет",
}));
const inner = await p.frameLocator("iframe#storybook-preview-iframe").locator("body").innerText().catch(e => "НЕ ПРОЧИТАТЬ");
console.log("WebKit, чистый профиль");
console.log("  body:", JSON.stringify(seen.body));
console.log("  iframe:", seen.iframe, "| внутри:", JSON.stringify((inner||"").trim().slice(0,120)));
console.log("  ошибки:", bad.length ? bad.slice(0, 6) : "нет");
await b.close();
