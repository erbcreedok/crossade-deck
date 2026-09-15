// АДРЕС МАКА. Страницу стола может отдать реле под постоянным адресом Mini App (`/t` на Fly) — тогда оно же
// кладёт сюда адрес мака, и скрипт, картинки, звуки и комната берутся оттуда. Открыт напрямую — это свой адрес.

export const HOST: string = ((globalThis as { __TABLE_HOST__?: string }).__TABLE_HOST__ ?? globalThis.location?.origin ?? "").replace(/\/+$/, "");
