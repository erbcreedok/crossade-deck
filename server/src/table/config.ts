// НАСТРОЙКИ СТОЛА — из окружения, и читаются в момент вопроса, а не при загрузке модуля: тест
// выставляет переменную и сразу получает её, не перезагружая сервер.
//
//   TELEGRAM_BOT_TOKEN   проверка подписи Mini App
//   TABLE_SECRET         общий с ботом секрет: подпись id комнат и управление ими по HTTP
//   TABLE_GUESTS=1       пускать без Telegram (браузер разработчика)
//   TABLE_PUBLIC_URL     где этот сервер виден снаружи — его маяк несёт реле
//   TABLE_RELAY_URL      куда слать маяк (сервер на Fly)

export const tableConfig = () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
  secret: process.env.TABLE_SECRET || undefined,
  guests: process.env.TABLE_GUESTS === "1",
  publicUrl: process.env.TABLE_PUBLIC_URL || undefined,
  relayUrl: process.env.TABLE_RELAY_URL || undefined,
});
