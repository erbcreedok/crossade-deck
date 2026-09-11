export type BotEnv = {
  botToken: string;
  serverUrl: string;
  hubUrl: string;
  /** `HUB_URL` is a fallback only: a fresh address is asked of `scripts/hub-tunnel.sh` instead (`hubUrl.ts`). */
  hubTunnel: boolean;
  appName?: string;
  /** Общий с сервером секрет: им бот подтверждает привязку телеграма (`link.ts`). */
  linkSecret?: string;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  const botToken = source.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return {
    botToken,
    serverUrl: source.SERVER_URL || "http://localhost:2567",
    hubUrl: source.HUB_URL || "http://localhost:9569",
    hubTunnel: source.HUB_TUNNEL === "1",
    appName: source.TELEGRAM_APP_NAME || undefined,
    linkSecret: source.TELEGRAM_LINK_SECRET || undefined,
  };
}
