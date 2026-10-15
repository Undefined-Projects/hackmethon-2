#!/usr/bin/env python3
"""
Servidor de control IR.

Guarda los botones, expone una API HTTP y una interfaz web, y manda las
ordenes al Arduino, que funciona solo como actuador.

Uso:
    python3 servidor.py                      # autodetecta el puerto
    python3 servidor.py --puerto /dev/ttyACM0 --http 8000
    python3 servidor.py --sin-arduino        # solo la API, para editar sin placa
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from almacen import Almacen, DatosInvalidos, mascara_de, normalizar_pines, normalizar_pulsos
from arduino import Arduino, ArduinoError

AQUI = os.path.dirname(os.path.abspath(__file__))
WEB  = os.path.join(AQUI, "web")

almacen: Almacen
placa: Arduino | None = None
# La placa es un recurso unico: dos envios simultaneos se pisarian.
candado_placa = threading.Lock()


# ============ API ============

def _placa_lista() -> Arduino:
    if placa is None:
        raise ArduinoError("el servidor se inicio con --sin-arduino")
    if not placa.conectado():
        placa.conectar()
    return placa


def api_estado() -> dict:
    if placa is None:
        return {"conectado": False, "motivo": "iniciado con --sin-arduino",
                "puertos": Arduino.puertos_disponibles()}
    if placa.conectado():
        return {"conectado": True, "puerto": placa.puerto, "version": placa.version}
    try:
        placa.conectar()
        return {"conectado": True, "puerto": placa.puerto, "version": placa.version}
    except ArduinoError as e:
        return {"conectado": False, "motivo": str(e),
                "puertos": Arduino.puertos_disponibles()}


def api_enviar_boton(id_: str) -> dict:
    boton = almacen.obtener(id_)
    if boton is None:
        raise KeyError(id_)
    pines = almacen.pines_de(boton)
    if not pines:
        raise DatosInvalidos("no hay pines de emision seleccionados")
    with candado_placa:
        r = _placa_lista().enviar(
            boton["pulsos"], boton["freq"], boton["repeticiones"], boton["gap_ms"],
            mascara_de(pines))
    return {"boton": boton["nombre"], "pines": pines,
            **r, **_diagnostico_eco(r, boton["pulsos"], pines)}


def api_enviar_crudo(cuerpo: dict) -> dict:
    pulsos = normalizar_pulsos(cuerpo.get("pulsos", []))
    freq   = int(cuerpo.get("freq", 38000))
    rep    = int(cuerpo.get("repeticiones", 1))
    gap    = int(cuerpo.get("gap_ms", 40))
    pines  = normalizar_pines(cuerpo.get("pines")) or almacen.config()["pines"]
    if not pines:
        raise DatosInvalidos("no hay pines de emision seleccionados")
    with candado_placa:
        r = _placa_lista().enviar(pulsos, freq, rep, gap, mascara_de(pines))
    return {"boton": "(sin guardar)", "pines": pines,
            **r, **_diagnostico_eco(r, pulsos, pines)}


def _diagnostico_eco(r: dict, pulsos: list[int], pines: list[int]) -> dict:
    """El eco es lo que el receptor oyo de la propia emision de la placa.

    Como el receptor esta en la misma placa que los emisores, siempre
    deberia oir lo que sale. Un eco en cero significa que por esos pines
    no salio luz.
    """
    eco = r.get("eco", 0)
    esperados = len(pulsos)
    lista = ", ".join(map(str, pines))
    if eco == 0:
        return {"ok": False,
                "aviso": f"el receptor no oyo nada: revisa los LEDs de los pines {lista}"}
    if abs(eco - esperados) > 2:
        return {"ok": False,
                "aviso": f"se emitieron {esperados} pulsos pero el receptor oyo {eco}"}
    return {"ok": True}


# Patron corto que solo sirve para comprobar si por un pin sale luz. No
# corresponde a ningun aparato: son marcas y espacios de 600 us.
PATRON_PRUEBA = [600] * 11


def api_probar_pines(cuerpo: dict) -> dict:
    """Emite un patron de prueba por unos pines y comprueba si hubo luz."""
    pines = normalizar_pines(cuerpo.get("pines"))
    if not pines:
        raise DatosInvalidos("hay que indicar al menos un pin")
    with candado_placa:
        r = _placa_lista().enviar(PATRON_PRUEBA, 38000, 1, 40, mascara_de(pines))
    eco = r.get("eco", 0)
    lista = ", ".join(map(str, pines))
    return {
        "pines": pines,
        "eco": eco,
        "ok": eco > 0,
        "detalle": (f"el receptor oyo {eco} pulsos: por el pin {lista} si sale luz"
                    if eco > 0 else
                    f"el receptor no oyo nada por el pin {lista}: revisa el LED, "
                    "su polaridad y su resistencia"),
    }


def api_identificar(cuerpo: dict) -> dict:
    """Emite portadora continua para localizar un LED a ojo con la camara."""
    pines = normalizar_pines(cuerpo.get("pines"))
    if not pines:
        raise DatosInvalidos("hay que indicar al menos un pin")
    ms = int(cuerpo.get("ms", 1500))
    with candado_placa:
        r = _placa_lista().parpadear(mascara_de(pines), ms)
    return {
        "pines": pines,
        "ms": r["ms"],
        "ok": True,
        "detalle": (f"emitiendo {r['ms']} ms por el pin {', '.join(map(str, pines))}: "
                    "apunta la camara del celular al LED para verlo"),
    }


def api_capturar(cuerpo: dict) -> dict:
    """Espera una trama del control remoto y devuelve sus duraciones."""
    timeout = int(cuerpo.get("timeout_ms", 15000))
    with candado_placa:
        pulsos = _placa_lista().capturar(timeout)
    return {"pulsos": pulsos, "total": len(pulsos)}


def api_nivel() -> dict:
    with candado_placa:
        return _placa_lista().nivel()


# ============ HTTP ============

class Handler(BaseHTTPRequestHandler):
    server_version = "LucesIR/1.0"

    def log_message(self, formato, *args):
        sys.stderr.write("  %s %s\n" % (self.address_string(), formato % args))

    # ---------- utilidades ----------

    def _json(self, datos, codigo: int = 200) -> None:
        cuerpo = json.dumps(datos, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _error(self, mensaje: str, codigo: int = 400) -> None:
        self._json({"error": mensaje}, codigo)

    def _cuerpo(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n == 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise DatosInvalidos(f"JSON invalido: {e}") from None

    def _estatico(self, ruta: str) -> None:
        archivo = "index.html" if ruta in ("/", "") else ruta.lstrip("/")
        destino = os.path.normpath(os.path.join(WEB, archivo))
        # Evita que un ".." en la URL saque el path fuera de web/.
        if not destino.startswith(WEB) or not os.path.isfile(destino):
            self._error("no encontrado", 404)
            return
        tipos = {".html": "text/html; charset=utf-8",
                 ".css": "text/css; charset=utf-8",
                 ".js": "application/javascript; charset=utf-8"}
        tipo = tipos.get(os.path.splitext(destino)[1], "application/octet-stream")
        with open(destino, "rb") as f:
            datos = f.read()
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)

    def _despachar(self, metodo: str):
        ruta = urlparse(self.path).path

        if not ruta.startswith("/api/"):
            if metodo == "GET":
                return self._estatico(ruta)
            return self._error("metodo no permitido", 405)

        partes = [p for p in ruta[5:].split("/") if p]

        try:
            # /api/estado
            if partes == ["estado"] and metodo == "GET":
                return self._json(api_estado())

            # /api/config
            if partes == ["config"]:
                if metodo == "GET":
                    return self._json(almacen.config())
                if metodo in ("PUT", "PATCH"):
                    return self._json(almacen.guardar_config(self._cuerpo()))

            # /api/pines/probar  y  /api/pines/identificar
            if partes == ["pines", "probar"] and metodo == "POST":
                return self._json(api_probar_pines(self._cuerpo()))
            if partes == ["pines", "identificar"] and metodo == "POST":
                return self._json(api_identificar(self._cuerpo()))

            # /api/capturar
            if partes == ["capturar"] and metodo == "POST":
                return self._json(api_capturar(self._cuerpo()))

            # /api/nivel
            if partes == ["nivel"] and metodo == "GET":
                return self._json(api_nivel())

            # /api/enviar
            if partes == ["enviar"] and metodo == "POST":
                return self._json(api_enviar_crudo(self._cuerpo()))

            # /api/botones
            if partes == ["botones"]:
                if metodo == "GET":
                    return self._json({"botones": almacen.listar()})
                if metodo == "POST":
                    return self._json(almacen.crear(self._cuerpo()), 201)

            # /api/botones/<id>[/enviar]
            if len(partes) >= 2 and partes[0] == "botones":
                id_ = partes[1]
                if len(partes) == 2:
                    if metodo == "GET":
                        b = almacen.obtener(id_)
                        return self._json(b) if b else self._error("no existe ese boton", 404)
                    if metodo in ("PUT", "PATCH"):
                        return self._json(almacen.editar(id_, self._cuerpo()))
                    if metodo == "DELETE":
                        return self._json({"borrado": almacen.borrar(id_)})
                if len(partes) == 3 and partes[2] == "enviar" and metodo == "POST":
                    return self._json(api_enviar_boton(id_))

            return self._error("ruta no encontrada", 404)

        except DatosInvalidos as e:
            return self._error(str(e), 400)
        except KeyError:
            return self._error("no existe ese boton", 404)
        except ArduinoError as e:
            return self._error(f"Arduino: {e}", 503)
        except Exception as e:                    # pragma: no cover
            return self._error(f"error interno: {e}", 500)

    def do_GET(self):    self._despachar("GET")
    def do_POST(self):   self._despachar("POST")
    def do_PUT(self):    self._despachar("PUT")
    def do_PATCH(self):  self._despachar("PATCH")
    def do_DELETE(self): self._despachar("DELETE")


def main() -> int:
    global almacen, placa

    ap = argparse.ArgumentParser(description="Servidor de control IR")
    ap.add_argument("--puerto", help="puerto serial del Arduino (autodetecta si se omite)")
    ap.add_argument("--http", type=int, default=8000, help="puerto HTTP (por defecto 8000)")
    ap.add_argument("--datos", default=os.path.join(AQUI, "botones.json"),
                    help="archivo JSON de botones")
    ap.add_argument("--sin-arduino", action="store_true",
                    help="no abrir el serial; sirve para editar botones sin la placa")
    args = ap.parse_args()

    almacen = Almacen(args.datos)
    cfg = almacen.config()
    print(f"Botones:  {args.datos}  ({len(almacen.listar())} guardados)")
    print(f"Pines:    emision por {', '.join(map(str, cfg['pines']))}"
          f"   (validos: {', '.join(map(str, cfg['pines_validos']))})")

    if args.sin_arduino:
        placa = None
        print("Arduino:  deshabilitado (--sin-arduino)")
    else:
        placa = Arduino(args.puerto)
        try:
            placa.conectar()
            print(f"Arduino:  {placa.puerto}  [{placa.version}]")
        except ArduinoError as e:
            # No es fatal: la interfaz funciona igual y reintenta sola.
            print(f"Arduino:  sin conexion ({e})")
            print("          se reintenta solo cuando llegue la primera orden")

    httpd = ThreadingHTTPServer(("127.0.0.1", args.http), Handler)
    print(f"\n  ->  http://127.0.0.1:{args.http}\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nsaliendo...")
    finally:
        httpd.server_close()
        if placa:
            placa.cerrar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
