// ПЕРЕНОС СЕБЯ НА ДРУГОЕ УСТРОЙСТВО — одной ссылкой, которую открывают, а не кодом, который некуда
// вводить.
//
// Экрана ввода кода у нас нет и не будет: человек с двумя устройствами открывает ссылку на втором,
// и оно становится им. Код восстановления внутри ссылки — тот же самый, что и был, просто его
// вводит не человек, а адрес.
//
// ССЫЛКА — ЭТО «ЗАБЕРИ СЕБЯ», А НЕ «ПОЗОВИ ДРУГА». Открывший её становится тобой: со своим именем,
// цветом, предметами и своими столами. Поэтому экран, который её показывает, обязан это говорить, а
// сам адрес — стираться сразу после того, как сработал.

import { restoreAccount, type Account } from "@crossade/wire";

/** Чем ссылка отличается от обычного адреса хаба. */
export const RESTORE_PARAM = "restore";

/** Ссылка на этот же хаб, несущая код. Хвост адреса (игра, комната) не тащим: это не приглашение. */
export function transferLink(code: string, href: string): string {
  const url = new URL(href);
  url.hash = "";
  url.search = "";
  url.searchParams.set(RESTORE_PARAM, code);
  return url.toString();
}

/** Код из адреса, если он там есть. */
export function codeInUrl(href: string): string | undefined {
  const code = new URL(href).searchParams.get(RESTORE_PARAM);
  return code && code.trim() ? code.trim() : undefined;
}

/** Адрес без кода — тот же самый, но чистый. */
export function withoutCode(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(RESTORE_PARAM);
  return url.toString();
}

export interface TakeOverParts {
  href(): string;
  clean(href: string): void;
  restore(code: string): Promise<Account | undefined>;
}

/**
 * ЭТО УСТРОЙСТВО СТАНОВИТСЯ ТЕМ, КОГО НАЗЫВАЕТ АДРЕС — до того, как страница успеет завести себе
 * гостя, иначе человек окажется двумя разными людьми на одном экране.
 *
 * АДРЕС ЧИСТИТСЯ ВСЕГДА, сработал перенос или нет. Код в адресной строке уезжает в историю, в
 * `Referer` и в пересланную ссылку; а неверный код, оставшийся в адресе, срабатывал бы на каждой
 * перезагрузке заново.
 */
export async function takeOverFromUrl(parts: TakeOverParts): Promise<boolean> {
  const code = codeInUrl(parts.href());
  if (!code) return false;
  const clean = withoutCode(parts.href());
  try {
    const account = await parts.restore(code);
    return account !== undefined;
  } finally {
    parts.clean(clean);
  }
}

/** Тот же перенос, но на настоящей странице. */
export function takeOverHere(): Promise<boolean> {
  return takeOverFromUrl({
    href: () => globalThis.location.href,
    clean: (href) => globalThis.history.replaceState(null, "", href),
    restore: (code) => restoreAccount(code),
  });
}
