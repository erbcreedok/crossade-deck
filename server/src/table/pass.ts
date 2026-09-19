// ПРОПУСК НА ЗАПИСЬ — право посмотреть ОДНУ партию и больше ничего.
//
// Секрет стола пускает не только читать журнал: им открывают и закрывают комнаты, им распоряжаются
// столами. Носить такой ключ в адресной строке телефона, копировать его в мессенджер и оставлять в
// истории команд — значит рано или поздно его потерять.
//
// Пропуск устроен иначе: он назван одной комнатой, протухает и ничего, кроме чтения записи, не даёт.
// Потерянный пропуск — это чужой человек, посмотревший одну партию, а не чужой человек за пультом.
//
// Подписью служит тот же секрет стола, и отдельного хранилища выданных пропусков нет: всё, что нужно
// для проверки, лежит в самом пропуске. Отозвать поштучно нельзя — зато нечему рассыпаться при
// перезапуске, а смена секрета отзывает разом все.

import { createHmac, timingSafeEqual } from "crypto";

/** Сколько живёт пропуск по умолчанию. Хватает посмотреть и переслать, мало чтобы забыть о нём. */
export const PASS_HOURS = 12;

const sign = (body: string, secret: string): string => createHmac("sha256", secret).update(body).digest("base64url").slice(0, 24);

/**
 * Выписать пропуск на комнату.
 *
 * @param until когда протухнет, в миллисекундах
 */
export function mintPass(room: string, secret: string, until: number): string {
  const body = `${room}.${until}`;
  return `${body}.${sign(body, secret)}`;
}

/** Кому этот пропуск годен. `null` — негоден: подделан, протух или это вовсе не пропуск. */
export function passRoom(pass: string | undefined, secret: string, now = Date.now()): string | null {
  if (!pass) return null;
  // Комната сама содержит точки? Нет — её алфавит их не знает, поэтому делим с конца.
  const cut = pass.lastIndexOf(".");
  const bodyEnd = pass.lastIndexOf(".", cut - 1);
  if (cut < 0 || bodyEnd < 0) return null;
  const [body, mark] = [pass.slice(0, cut), pass.slice(cut + 1)];
  const [room, until] = [pass.slice(0, bodyEnd), Number(pass.slice(bodyEnd + 1, cut))];
  if (!room || !Number.isFinite(until)) return null;

  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mark);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return until > now ? room : null;
}
