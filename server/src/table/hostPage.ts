// СТРАНИЦА СТОЛА ПОД ПОСТОЯННЫМ АДРЕСОМ — у реле на fly и у Worker'а (`deploy/relay-worker`) одна.

/** Страница мака под чужим адресом: относительные пути — к `host`, адрес `host` — столу. */
export function hostPage(html: string, host: string): string {
  const safe = JSON.stringify(host).replace(/</g, "\\u003c");
  return html.replace(/<head>/i, `<head>\n<base href="${host.replace(/"/g, "&quot;")}/table/">\n<script>window.__TABLE_HOST__ = ${safe};</script>`);
}

/** Стол не отвечает — страница вместо стола под постоянным адресом. */
export const DOWN_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Стол недоступен</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0704;color:#f5ead0;font:16px system-ui;text-align:center;padding:24px">
<div><p style="font-size:20px">Столы сейчас недоступны</p><p style="color:#cdb98f">Стол не отвечает. Попробуй через минуту.</p></div>`;
