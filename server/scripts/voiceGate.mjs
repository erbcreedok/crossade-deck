// ГОЛОС ОТКРЫТ ЛИ ИГРОКАМ — тот же флажок, что у клиента (`VOICE_OPEN` в `table-client/screenConst.ts`).
// Прогоны голоса спрашивают его здесь: пока голос закрыт, они проверяют то, что работает сейчас (кнопка чата
// не становится микрофоном), а проверки разговора ждут его возвращения — и говорят об этом вслух.
import { readFileSync } from "fs";

export const voiceOpen = () =>
  /export const VOICE_OPEN\s*=\s*true/.test(readFileSync(new URL("../table-client/screenConst.ts", import.meta.url), "utf8"));

export const VOICE_WAITS = "⏸ голос игрокам закрыт (VOICE_OPEN = false, table-client/screenConst.ts) — проверки разговора ждут его возвращения";
