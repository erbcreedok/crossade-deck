#!/usr/bin/env python3
"""Сервер стендов — тот же http.server, но БЕЗ КЭША.

Стенд правится по десять раз за разговор и смотрится с телефона. Обычный
`http.server` отдаёт Last-Modified, и Safari честно кладёт файлы в кэш — а
дальше начинается худшее, что бывает со стендом: страница обновилась, скрипт
рядом с ней остался прежним. На экране получается смесь двух версий, и её
обсуждают как настоящий экран. Именно так и вышло: заголовки уехали в иконки, а
кнопки в них приехали из старых правил, удалённых двумя коммитами раньше.

Поэтому каждый ответ помечен `no-store`: телефон всегда берёт свежее.

И сервер ОБЯЗАН быть многопоточным. Обычный `HTTPServer` держит одно соединение за раз, а
браузер на ноутбуке не отпускает своё (keep-alive) — телефон в той же сети после этого
просто висит на пустой странице, и выглядит это как «стенд не поднят».

    python3 design/serve.py <порт> <папка>
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1])
    directory = sys.argv[2]
    handler = partial(NoCache, directory=directory)
    ThreadingHTTPServer(("", port), handler).serve_forever()


if __name__ == "__main__":
    main()
