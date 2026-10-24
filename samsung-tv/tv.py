#!/usr/bin/env python3
"""Управление телевизором Samsung (Tizen) по локальной сети.

Компьютер должен быть в той же сети (Wi-Fi/роутер), что и телевизор.

    python tv.py find                 найти телевизор в сети
    python tv.py connect [IP]         подключиться (на ТВ нажать «Разрешить»)
    python tv.py info                 модель, MAC, состояние
    python tv.py on | off             включить (Wake-on-LAN) / выключить
    python tv.py vol up 5             громкость (up / down / mute)
    python tv.py key KEY_HOME         любая кнопка пульта
    python tv.py app youtube          запустить приложение
    python tv.py apps                 список установленных приложений
    python tv.py url https://ya.ru    открыть сайт в браузере ТВ
    python tv.py text "привет"        ввести текст в открытое поле ввода
    python tv.py remote               интерактивный пульт
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from samsungtvws import SamsungTVWS
from samsungtvws.exceptions import ConnectionFailure, UnauthorizedError
from websocket import WebSocketException

CONFIG = Path(__file__).with_name("tv.json")
REMOTE_NAME = "Python Remote"
PROXY_VARS = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")

APPS = {
    "youtube": "111299001912",
    "netflix": "3201907018807",
    "prime": "3201910019365",
    "spotify": "3201606009684",
}

# Короткие команды интерактивного пульта
KEYS = {
    "up": "KEY_UP",
    "down": "KEY_DOWN",
    "left": "KEY_LEFT",
    "right": "KEY_RIGHT",
    "ok": "KEY_ENTER",
    "back": "KEY_RETURN",
    "home": "KEY_HOME",
    "menu": "KEY_MENU",
    "source": "KEY_SOURCE",
    "info": "KEY_INFO",
    "+": "KEY_VOLUP",
    "-": "KEY_VOLDOWN",
    "mute": "KEY_MUTE",
    "ch+": "KEY_CHUP",
    "ch-": "KEY_CHDOWN",
    "play": "KEY_PLAY",
    "pause": "KEY_PAUSE",
    "stop": "KEY_STOP",
    "power": "KEY_POWER",
}

REMOTE_HELP = """\
Команды: up down left right ok back home menu source info
         + - mute ch+ ch- play pause stop power
         цифры (например 15 = кнопки 1 и 5), любой KEY_... (например KEY_EXIT)
Несколько команд можно писать через пробел: down down ok
Выход: q"""


def die(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def load_config() -> dict:
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    return {}


def save_config(cfg: dict) -> None:
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def device_info(host: str, timeout: float = 3.0) -> dict | None:
    """REST API телевизора: http://<IP>:8001/api/v2/ (работает без авторизации)."""
    try:
        with requests.Session() as session:
            session.trust_env = False  # без системного прокси
            response = session.get(f"http://{host}:8001/api/v2/", timeout=timeout)
        return response.json().get("device")
    except (requests.RequestException, ValueError):
        return None


def ssdp_search(timeout: float = 3.0) -> set[str]:
    message = (
        "M-SEARCH * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:1900\r\n"
        'MAN: "ssdp:discover"\r\n'
        "MX: 2\r\n"
        "ST: urn:samsung.com:device:RemoteControlReceiver:1\r\n\r\n"
    )
    found = set()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP) as sock:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(0.5)
        try:
            sock.sendto(message.encode(), ("239.255.255.250", 1900))
        except OSError:
            return found
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                _, (ip, _) = sock.recvfrom(4096)
            except socket.timeout:
                continue
            found.add(ip)
    return found


def local_ip() -> str | None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("10.255.255.255", 1))  # пакет не отправляется, только выбор интерфейса
            return sock.getsockname()[0]
        except OSError:
            return None


def port_open(ip: str, port: int = 8001, timeout: float = 0.4) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def scan_subnet() -> set[str]:
    """Запасной поиск, если SSDP заблокирован: перебор x.x.x.1-254 на порт 8001."""
    ip = local_ip()
    if not ip:
        return set()
    prefix = ip.rsplit(".", 1)[0]
    candidates = [f"{prefix}.{i}" for i in range(1, 255)]
    with ThreadPoolExecutor(max_workers=64) as pool:
        return {c for c, ok in zip(candidates, pool.map(port_open, candidates)) if ok}


def print_device(host: str, info: dict) -> None:
    print(f"  {info.get('name', '?')}")
    print(f"    IP:        {host}")
    print(f"    Модель:    {info.get('modelName', '?')}")
    print(f"    ОС:        {info.get('OS', '?')}")
    print(f"    MAC:       {info.get('wifiMac', '?')}")
    print(f"    Сеть:      {info.get('networkType', '?')}")
    print(f"    Состояние: {info.get('PowerState', '?')}")


def remember_device(cfg: dict, host: str, info: dict) -> None:
    cfg["host"] = host
    cfg["name"] = info.get("name")
    cfg["mac"] = info.get("wifiMac")
    if info.get("TokenAuthSupport") == "false":
        cfg["port"] = 8001  # старые модели без токена


def open_tv(cfg: dict, port: int | None, timeout: float = 30) -> SamsungTVWS:
    host = cfg.get("host")
    if not host:
        die("IP телевизора неизвестен. Выполните: python tv.py find  или  python tv.py connect <IP>")
    port = port or cfg.get("port", 8002)
    tv = SamsungTVWS(
        host,
        token=cfg.get("token"),
        port=port,
        timeout=timeout,
        name=REMOTE_NAME,
        key_press_delay=0.3,
    )
    try:
        tv.open()
    except UnauthorizedError:
        die(
            "Телевизор отклонил подключение.\n"
            "Разрешите его: Настройки → Общие → Диспетчер внешних устройств →\n"
            "Диспетчер подключения устройств → «Python Remote» → Разрешить."
        )
    except (OSError, WebSocketException, ConnectionFailure) as err:
        die(
            f"Не удалось подключиться к {host}:{port} ({err}).\n"
            "Проверьте, что ТВ включён и компьютер в той же сети.\n"
            "Если на ТВ был запрос доступа — нажмите «Разрешить» и повторите."
        )
    if tv.token and tv.token != cfg.get("token"):
        cfg["token"] = tv.token
        cfg["port"] = port
        save_config(cfg)
    return tv


def cmd_find(args, cfg):
    print("Ищу телевизоры Samsung в локальной сети...")
    ips = ssdp_search()
    if not ips:
        print("SSDP ничего не нашёл, сканирую подсеть (порт 8001)...")
        ips = scan_subnet()
    tvs = []
    for ip in sorted(ips):
        info = device_info(ip)
        if info:
            tvs.append((ip, info))
    if not tvs:
        die(
            "Телевизор не найден.\n"
            "Посмотрите IP на ТВ: Настройки → Общие → Сеть → Состояние сети → Настройки IP,\n"
            "затем выполните: python tv.py connect <IP>"
        )
    print(f"Найдено: {len(tvs)}")
    for ip, info in tvs:
        print_device(ip, info)
    if len(tvs) == 1:
        remember_device(cfg, *tvs[0])
        save_config(cfg)
        print("\nСохранено в tv.json. Дальше: python tv.py connect")
    else:
        print("\nВыберите нужный: python tv.py connect <IP>")


def cmd_connect(args, cfg):
    if args.ip and args.ip != cfg.get("host"):
        cfg.clear()  # другой телевизор — старый токен не подойдёт
        cfg["host"] = args.ip
    if not cfg.get("host"):
        die("Укажите IP: python tv.py connect 192.168.1.50  (или сначала python tv.py find)")
    info = device_info(cfg["host"])
    if info:
        remember_device(cfg, cfg["host"], info)
        print_device(cfg["host"], info)
    else:
        print(f"REST API {cfg['host']}:8001 не ответил — пробую подключиться напрямую.")
    save_config(cfg)
    print("\nПодключаюсь... Если на экране ТВ появится запрос — нажмите «Разрешить» (до 30 сек).")
    tv = open_tv(cfg, args.port)
    tv.close()
    print("Подключено ✓  Токен сохранён в tv.json, повторно разрешать не нужно.")


def cmd_info(args, cfg):
    if not cfg.get("host"):
        die("IP телевизора неизвестен. Выполните: python tv.py find")
    info = device_info(cfg["host"])
    if not info:
        die(f"{cfg['host']} не отвечает (ТВ выключен или в другой сети).")
    print_device(cfg["host"], info)


def cmd_on(args, cfg):
    mac = cfg.get("mac")
    if not mac:
        die("MAC-адрес неизвестен. Выполните python tv.py connect, пока ТВ включён.")
    packet = b"\xff" * 6 + bytes.fromhex(mac.replace(":", "").replace("-", "")) * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(packet, ("255.255.255.255", 9))
    print(f"Wake-on-LAN отправлен на {mac}. ТВ должен включиться через несколько секунд.")


def cmd_off(args, cfg):
    with open_tv(cfg, args.port) as tv:
        tv.send_key("KEY_POWER")
    print("Выключаю.")


def cmd_vol(args, cfg):
    key = {"up": "KEY_VOLUP", "down": "KEY_VOLDOWN", "mute": "KEY_MUTE"}[args.direction]
    with open_tv(cfg, args.port) as tv:
        tv.send_key(key, times=1 if args.direction == "mute" else args.times)


def cmd_key(args, cfg):
    key = args.key.upper()
    if not key.startswith("KEY_"):
        key = "KEY_" + key
    with open_tv(cfg, args.port) as tv:
        tv.send_key(key, times=args.times)


def cmd_app(args, cfg):
    app_id = APPS.get(args.name.lower(), args.name)
    with open_tv(cfg, args.port) as tv:
        tv.run_app(app_id)
    print(f"Запускаю {args.name} ({app_id}).")


def cmd_apps(args, cfg):
    with open_tv(cfg, args.port) as tv:
        apps = tv.app_list()
    if not apps:
        die("Этот телевизор не отдаёт список приложений.")
    for app in sorted(apps, key=lambda a: a.get("name", "").lower()):
        print(f"  {app.get('appId'):<24} {app.get('name')}")
    print("\nЗапуск: python tv.py app <appId>")


def cmd_url(args, cfg):
    with open_tv(cfg, args.port) as tv:
        tv.open_browser(args.url)


def cmd_text(args, cfg):
    with open_tv(cfg, args.port) as tv:
        tv.send_text(args.text)


def cmd_remote(args, cfg):
    tv = open_tv(cfg, args.port)
    tv.key_press_delay = 0.1
    print(f"Пульт подключён к {cfg.get('name') or cfg['host']}.")
    print(REMOTE_HELP)
    try:
        while True:
            try:
                line = input("пульт> ").strip()
            except EOFError:
                break
            if line.lower() in ("q", "quit", "exit"):
                break
            for word in line.split():
                lower = word.lower()
                if lower in KEYS:
                    tv.send_key(KEYS[lower])
                elif word.isdigit():
                    for digit in word:
                        tv.send_key(f"KEY_{digit}")
                elif word.upper().startswith("KEY_"):
                    tv.send_key(word.upper())
                else:
                    print(f"Неизвестная команда: {word}")
    except KeyboardInterrupt:
        print()
    finally:
        tv.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Управление телевизором Samsung (Tizen) по локальной сети."
    )
    parser.add_argument(
        "--port", type=int, help="8002 — по умолчанию (с токеном), 8001 — старые модели"
    )
    sub = parser.add_subparsers(dest="cmd", required=True, metavar="команда")

    sub.add_parser("find", help="найти телевизор в сети").set_defaults(func=cmd_find)

    p = sub.add_parser("connect", help="подключиться и получить токен")
    p.add_argument("ip", nargs="?", help="IP телевизора")
    p.set_defaults(func=cmd_connect)

    sub.add_parser("info", help="сведения о телевизоре").set_defaults(func=cmd_info)
    sub.add_parser("on", help="включить (Wake-on-LAN)").set_defaults(func=cmd_on)
    sub.add_parser("off", help="выключить").set_defaults(func=cmd_off)

    p = sub.add_parser("vol", help="громкость")
    p.add_argument("direction", choices=["up", "down", "mute"])
    p.add_argument("times", nargs="?", type=int, default=1)
    p.set_defaults(func=cmd_vol)

    p = sub.add_parser("key", help="нажать кнопку пульта (KEY_HOME, KEY_VOLUP, ...)")
    p.add_argument("key")
    p.add_argument("times", nargs="?", type=int, default=1)
    p.set_defaults(func=cmd_key)

    p = sub.add_parser("app", help=f"запустить приложение ({', '.join(APPS)} или appId)")
    p.add_argument("name")
    p.set_defaults(func=cmd_app)

    sub.add_parser("apps", help="список приложений").set_defaults(func=cmd_apps)

    p = sub.add_parser("url", help="открыть сайт в браузере ТВ")
    p.add_argument("url")
    p.set_defaults(func=cmd_url)

    p = sub.add_parser("text", help="ввести текст в открытое на ТВ поле ввода")
    p.add_argument("text")
    p.set_defaults(func=cmd_text)

    sub.add_parser("remote", help="интерактивный пульт").set_defaults(func=cmd_remote)

    args = parser.parse_args()
    # ТВ всегда в локальной сети, а websocket-client иначе пойдёт через HTTP(S)_PROXY
    for var in PROXY_VARS:
        os.environ.pop(var, None)
    try:
        args.func(args, load_config())
    except (OSError, WebSocketException) as err:
        die(f"Связь с телевизором прервалась: {err}")


if __name__ == "__main__":
    main()
