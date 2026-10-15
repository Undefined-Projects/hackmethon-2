"""
Capa serial: habla el protocolo de lineas del firmware LucesIR.

El Arduino es solo el actuador. Aqui se traduce cada operacion del
servidor a una linea de comando y se devuelve la respuesta ya parseada.
"""

from __future__ import annotations

import glob
import threading
import time

import serial


class ArduinoError(RuntimeError):
    """Falla de comunicacion con la placa, o un ERR devuelto por ella."""


class Arduino:
    # Abrir el puerto baja DTR y eso reinicia la placa: hay que darle
    # tiempo a arrancar antes de mandarle nada.
    ESPERA_ARRANQUE = 2.0

    def __init__(self, puerto: str | None = None, baud: int = 115200):
        self._puerto_pedido = puerto
        self._baud = baud
        self._ser: serial.Serial | None = None
        self._lock = threading.Lock()
        self.puerto: str | None = None
        self.version: str | None = None

    # ---------- conexion ----------

    @staticmethod
    def puertos_disponibles() -> list[str]:
        return sorted(glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*"))

    def conectado(self) -> bool:
        return self._ser is not None and self._ser.is_open

    def conectar(self) -> None:
        if self.conectado():
            return

        puerto = self._puerto_pedido
        if puerto is None:
            libres = self.puertos_disponibles()
            if not libres:
                raise ArduinoError("no hay ningun puerto serial disponible")
            puerto = libres[0]

        try:
            ser = serial.Serial(puerto, self._baud, timeout=3)
        except serial.SerialException as e:
            raise ArduinoError(f"no se pudo abrir {puerto}: {e}") from e

        time.sleep(self.ESPERA_ARRANQUE)
        ser.reset_input_buffer()

        self._ser = ser
        self.puerto = puerto

        try:
            self.version = self._enviar("PING").removeprefix("PONG ").strip()
        except ArduinoError:
            self.cerrar()
            raise

    def cerrar(self) -> None:
        if self._ser is not None:
            try:
                self._ser.close()
            except Exception:
                pass
        self._ser = None
        self.puerto = None
        self.version = None

    # ---------- transporte ----------

    def _enviar(self, linea: str, timeout: float = 5.0) -> str:
        """Manda una linea y devuelve la respuesta sin el prefijo 'OK '."""
        if not self.conectado():
            raise ArduinoError("la placa no esta conectada")

        with self._lock:
            try:
                self._ser.reset_input_buffer()
                self._ser.write((linea + "\n").encode("ascii"))
                self._ser.flush()
                self._ser.timeout = timeout
                cruda = self._ser.readline().decode("ascii", errors="replace").strip()
            except serial.SerialException as e:
                self.cerrar()
                raise ArduinoError(f"se perdio la conexion: {e}") from e

        if not cruda:
            raise ArduinoError(f"la placa no respondio a '{linea.split()[0]}'")
        if cruda.startswith("ERR "):
            raise ArduinoError(cruda[4:])
        if not cruda.startswith("OK "):
            raise ArduinoError(f"respuesta inesperada: {cruda!r}")
        return cruda[3:]

    def _reintentando(self, linea: str, timeout: float = 5.0) -> str:
        """Igual que _enviar, pero reconecta una vez si el puerto se cayo."""
        try:
            if not self.conectado():
                self.conectar()
            return self._enviar(linea, timeout)
        except ArduinoError:
            self.cerrar()
            self.conectar()
            return self._enviar(linea, timeout)

    # ---------- operaciones ----------

    def ping(self) -> str:
        return self._reintentando("PING")

    def info(self) -> str:
        return self._reintentando("INFO")

    def enviar(self, pulsos: list[int], freq: int = 38000,
               repeticiones: int = 1, gap_ms: int = 40,
               mascara_pines: int = 1 << 2) -> dict:
        """Emite un patron por los pines de la mascara."""
        if not pulsos:
            raise ArduinoError("no hay pulsos que enviar")
        if mascara_pines <= 0:
            raise ArduinoError("no hay ningun pin seleccionado para emitir")

        linea = (f"SEND {freq} {repeticiones} {gap_ms} {mascara_pines} "
                 + " ".join(str(int(p)) for p in pulsos))
        # Cada repeticion dura lo que dure el patron mas el gap; se le da
        # margen suficiente para que no venza antes de que la placa conteste.
        dur_s = sum(pulsos) / 1_000_000 * repeticiones + (gap_ms / 1000) * repeticiones
        r = self._reintentando(linea, timeout=max(5.0, dur_s + 5.0))

        campos = dict(p.split("=", 1) for p in r.split()[1:])
        return {
            "pulsos": int(campos.get("pulsos", 0)),
            "repeticiones": int(campos.get("rep", 0)),
            "eco": int(campos.get("eco", 0)),
        }

    def capturar(self, timeout_ms: int = 15000) -> list[int]:
        """Espera una trama del control remoto y devuelve sus duraciones."""
        r = self._reintentando(f"CAPTURE {timeout_ms}",
                               timeout=timeout_ms / 1000 + 3.0)
        return [int(x) for x in r.split()[1:]]

    def nivel(self) -> dict:
        r = self._reintentando("LEVEL")          # "LEVEL actual=1 reposo=1"
        campos = dict(p.split("=", 1) for p in r.split()[1:])
        return {k: int(v) for k, v in campos.items()}

    def parpadear(self, mascara_pines: int, ms: int = 1000,
                  freq: int = 38000) -> dict:
        """Emite portadora continua, para identificar un LED con la camara."""
        if mascara_pines <= 0:
            raise ArduinoError("no hay ningun pin seleccionado")
        ms = max(1, min(int(ms), 3000))
        r = self._reintentando(f"BLINK {freq} {mascara_pines} {ms}",
                               timeout=ms / 1000 + 5.0)
        campos = dict(p.split("=", 1) for p in r.split()[1:])
        return {"ms": int(campos.get("ms", 0))}
