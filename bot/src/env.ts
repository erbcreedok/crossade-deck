export type BotEnv = {
  botToken: string;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  const botToken = source.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return { botToken };
}
