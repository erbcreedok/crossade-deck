// ВХОД ЧЕРЕЗ TELEGRAM ДЛЯ ПРИЛОЖЕНИЯ CROSSADE — `?login`. Приложение открывает эту страницу в системном окне
// входа, здесь стоит кнопка Telegram (Login Widget); Telegram подтверждает человека, стол по его подписи
// выдаёт ключ приложения (`/table/app/telegram`), и страница отдаёт ключ приложению адресом `crossade://login`.
//
// Кнопка Telegram работает только на домене, который боту назначен в BotFather (`/setdomain`): это
// постоянный адрес реле, под которым отдаётся и эта страница.

import { nativeShell } from "./arNative.js";
import { HOST } from "./host.js";

export function mountLogin(host: HTMLElement, bot: string): void {
  const page = document.createElement("div");
  page.dataset.login = "";
  page.style.cssText = "position:fixed;inset:0;z-index:900;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;box-sizing:border-box;"
    + "background:#10170f;color:#f5ead0;font:15px/1.45 system-ui,sans-serif;text-align:center";
  page.innerHTML = `<div style="font-size:22px;font-weight:650">Вход в Crossade</div>`
    + `<div style="color:#cdb98f;font-size:13.5px;max-width:300px">Telegram подтвердит, что это ты, — и в приложении будут твои столы.</div>`
    + `<div data-login-widget></div><div data-login-note style="color:#e8836f;font-size:13px;min-height:18px"></div>`;
  host.append(page);
  const note = page.querySelector<HTMLElement>("[data-login-note]")!;

  (globalThis as { onCrossadeTelegram?: (user: Record<string, unknown>) => void }).onCrossadeTelegram = (user) => {
    note.style.color = "#cdb98f";
    note.textContent = "Вхожу…";
    void fetch(`${HOST}/table/app/telegram`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(user) })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Telegram не подтвердил вход — попробуй ещё раз." : `Стол ответил ${res.status}.`);
        const { key } = (await res.json()) as { key: string };
        // Страница открыта внутри приложения — ключ ему напрямую; в окне входа — адресом, его ловит окно.
        nativeShell()?.key?.(key);
        location.href = `crossade://login?key=${encodeURIComponent(key)}`;
      })
      .catch((err: unknown) => {
        note.style.color = "#e8836f";
        note.textContent = err instanceof Error ? err.message : "Стол не отвечает.";
      });
  };
  const widget = document.createElement("script");
  widget.async = true;
  widget.src = "https://telegram.org/js/telegram-widget.js?22";
  widget.dataset.telegramLogin = bot;
  widget.dataset.size = "large";
  widget.dataset.radius = "12";
  widget.dataset.onauth = "onCrossadeTelegram(user)";
  widget.dataset.requestAccess = "write";
  page.querySelector("[data-login-widget]")!.append(widget);
}
