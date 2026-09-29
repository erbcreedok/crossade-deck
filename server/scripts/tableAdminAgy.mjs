// СТРАНИЦА ХОЗЯИНА — вкладка «agy»: заказ уходит, видно «рисует…» и ход в логе, потом «годно» с листом; «В каталог» —
// часть появляется в каталоге (`/table/tunes`) и во вкладке «Спрайты»; «Другую» заполняет форму тем же; «Удалить»
// убирает попытку и её рисунки. Стол должен брать заглушку вместо agy (стенд table-probe: TABLE_SPRITE_SCRIPT).
//   node scripts/tableAdminAgy.mjs [base] [secret] [shot.png]
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4];
const ROOT = resolve(import.meta.dirname, "../..");
const ID = `zzprobe${Date.now().toString(36)}`;
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.click('[data-tab="agy"]');
  await p.waitForSelector("[data-order]");
  await p.click('[data-pane="agy"] [data-slot="head"]');
  await p.click('[data-pane="agy"] [data-sides="2"]');
  await p.fill('[data-a="brief"]', "лис в очках");
  await p.fill('[data-a="id"]', ID);
  await p.fill('[data-a="name"]', "Лис");
  await p.click("[data-go]");
  const card = p.locator(".job", { hasText: "Лис" }).first();
  await card.waitFor();
  await p.waitForFunction(() => /заглушка|agy рисует/.test(document.querySelector("[data-log]")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  check("заказ ушёл — «рисует…», и в логе ход работы", /рисует/.test(await card.innerText()) && /заглушка|agy рисует/.test((await card.locator("[data-log]").innerText().catch(() => "")) || ""), await card.innerText());
  // бриф, набранный, пока список обновляется сам, не сбивается
  await p.fill('[data-a="brief"]', "черновик следующего");
  await card.locator(".badge.good").waitFor({ timeout: 20_000 });
  check("список обновился сам, форма осталась как набрана", (await p.inputValue('[data-a="brief"]')) === "черновик следующего", await p.inputValue('[data-a="brief"]'));
  await p.waitForSelector(".sheet", { timeout: 5000 }).catch(() => {});
  check("«годно» — и лист виден", (await card.locator(".badge.good").count()) === 1 && (await card.locator(".sheet").count()) === 1, await card.innerText());
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  await card.locator("[data-accept]").click();
  await card.locator(".badge.part").waitFor({ timeout: 5000 }).catch(() => {});
  const tunes = await (await fetch(`${base}/table/tunes`)).json();
  check("«В каталог» — часть в каталоге стола", (tunes.extra ?? []).some((x) => x.id === `${ID}:head` && x.name === "Лис" && x.facing === "tilt"), tunes.extra);
  check("рисунки легли к столу", (await fetch(`${base}/table/skins/${ID}/front-head.svg`)).status === 200, null);
  await p.click('[data-tab="sprites"]');
  await p.click('[data-pane="sprites"] [data-slot="hair"]');
  await p.click('[data-pane="sprites"] [data-slot="head"]');
  check("во вкладке «Спрайты» — новая часть с именем", (await p.locator(`[data-part="${ID}:head"]`).innerText().catch(() => "")) === "Лис", null);
  await p.click('[data-tab="agy"]');
  await card.locator("[data-again]").click();
  check("«Другую» — форма заполнена той же заявкой", (await p.inputValue('[data-a="brief"]')) === "лис в очках" && (await p.inputValue('[data-a="id"]')) === ID, [await p.inputValue('[data-a="brief"]'), await p.inputValue('[data-a="id"]')]);
  await p.click("[data-go]");
  const second = p.locator(".job", { hasText: `${ID}-2` }).first();
  await second.waitFor({ timeout: 5000 }).catch(() => {});
  check("вторая попытка — в новой папке", (await second.count()) === 1, await p.locator("[data-jobs]").innerText());
  await second.locator(".badge.good").waitFor({ timeout: 20_000 }).catch(() => {});
  await second.locator("[data-drop]").click();
  await p.waitForTimeout(800);
  check("«Удалить» убирает попытку и её рисунки", (await p.locator(".job", { hasText: `${ID}-2` }).count()) === 0 && !existsSync(join(ROOT, "design/persona/skins", `${ID}-2`)), null);
  const denied = await fetch(`${base}/table/admin/sprites`);
  check("без ключа стол не пускает", denied.status === 403, denied.status);
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
  // принятое в каталог прогона — убрать с диска (база прогона в памяти)
  for (const dir of [join(ROOT, "design/persona/skins", ID), join(ROOT, "design/persona/skins", `${ID}-2`), join(ROOT, "server/table-client/skins", ID)]) await rm(dir, { recursive: true, force: true });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
