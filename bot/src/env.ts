export type BotEnv = {
  botToken: string;
  serverUrl: string;
  hubUrl: string;
  appName?: string;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  const botToken = source.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return {
    botToken,
    serverUrl: source.SERVER_URL || "http://localhost:2567",
    hubUrl: source.HUB_URL || "http://localhost:9569",
    appName: source.TELEGRAM_APP_NAME || undefined,
  };
}
