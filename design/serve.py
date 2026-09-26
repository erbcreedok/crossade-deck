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

    python3 design/serve.py <порт> <папка> [--tls <порт>]

`--tls` поднимает рядом второй порт с HTTPS: камера в браузере (`getUserMedia`) открывается только
в защищённом контексте, а телефон заходит по IP — это не localhost, и по HTTP камеры ему не дадут.
Сертификат самоподписанный, лежит в `design/.tls/` и выписывается сам на localhost и на текущий IP
в локальной сети; телефон один раз ругнётся «соединение не защищено» — «подробнее → перейти».
"""

import os
import socket
import ssl
import subprocess
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TLS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".tls")


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def lan_ip() -> str:
    """IP в локальной сети — тот, по которому зайдёт телефон. Пакет никуда не уходит: UDP без отправки."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def certificate() -> tuple[str, str]:
    """Самоподписанный сертификат на localhost и текущий IP. Перевыписывается, если IP сменился."""
    os.makedirs(TLS_DIR, exist_ok=True)
    cert, key, stamp = (os.path.join(TLS_DIR, n) for n in ("cert.pem", "key.pem", "ip"))
    ip = lan_ip()
    if not (os.path.exists(cert) and os.path.exists(stamp) and open(stamp).read() == ip):
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
             "-keyout", key, "-out", cert, "-subj", "/CN=crossade-stand",
             "-addext", f"subjectAltName=DNS:localhost,IP:127.0.0.1,IP:{ip}"],
            check=True, capture_output=True)
        with open(stamp, "w") as f:
            f.write(ip)
    return cert, key


def main() -> None:
    port = int(sys.argv[1])
    directory = sys.argv[2]
    handler = partial(NoCache, directory=directory)
    if "--tls" in sys.argv:
        tls_port = int(sys.argv[sys.argv.index("--tls") + 1])
        cert, key = certificate()
        secure = ThreadingHTTPServer(("", tls_port), handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        secure.socket = context.wrap_socket(secure.socket, server_side=True)
        threading.Thread(target=secure.serve_forever, daemon=True).start()
        print(f"https://{lan_ip()}:{tls_port}/  — с телефона", flush=True)
    ThreadingHTTPServer(("", port), handler).serve_forever()


if __name__ == "__main__":
    main()
