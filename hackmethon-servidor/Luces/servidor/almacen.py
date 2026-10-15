"""
Almacen de botones en JSON.

Toda la informacion vive aqui: nombres, ondas y parametros de emision.
El Arduino no guarda nada, asi que este archivo es la unica fuente de
verdad y se puede respaldar, versionar o editar a mano.
"""

from __future__ import annotations

import glob
import json
import os
import shutil
import tempfile
import threading
import uuid
from datetime import datetime

# Cuantas versiones anteriores se conservan en respaldos/.
RESPALDOS_MAX = 30

MAX_PULSOS = 200          # el firmware no acepta mas
MAX_US     = 65535        # cada duracion se guarda en un uint16 en la placa

# Pines que el firmware acepta para emitir. Quedan fuera el 0 y el 1
# (RX/TX del serial), el 11 (entrada del receptor) y el 13 (LED de
# estado). El 12 queda libre. Son exactamente 9.
PINES_VALIDOS = [2, 3, 4, 5, 6, 7, 8, 9, 10]
PINES_DEFECTO = [2]


class DatosInvalidos(ValueError):
    """Lo que mando el cliente no pasa validacion."""


def _ahora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalizar_pulsos(valor) -> list[int]:
    """Acepta una lista de numeros o un texto separado por comas/espacios."""
    if isinstance(valor, str):
        crudos = [t for t in valor.replace(",", " ").split() if t]
    elif isinstance(valor, (list, tuple)):
        crudos = list(valor)
    else:
        raise DatosInvalidos("los pulsos deben ser una lista o un texto de numeros")

    pulsos: list[int] = []
    for t in crudos:
        try:
            v = int(float(t))
        except (TypeError, ValueError):
            raise DatosInvalidos(f"'{t}' no es un numero valido") from None
        if not (1 <= v <= MAX_US):
            raise DatosInvalidos(f"duracion fuera de rango: {v} us (debe ser 1..{MAX_US})")
        pulsos.append(v)

    if not pulsos:
        raise DatosInvalidos("la onda esta vacia")
    if len(pulsos) > MAX_PULSOS:
        raise DatosInvalidos(f"la onda trae {len(pulsos)} pulsos; el maximo es {MAX_PULSOS}")

    # Un patron empieza con marca y alterna. Si termina en espacio, ese
    # ultimo valor no emite nada: es silencio al final, y se descarta.
    if len(pulsos) % 2 == 0:
        pulsos.pop()

    return pulsos


def normalizar_pines(valor) -> list[int]:
    """Acepta una lista de numeros o un texto separado por comas/espacios."""
    if valor is None:
        return []
    if isinstance(valor, str):
        crudos = [t for t in valor.replace(",", " ").split() if t]
    elif isinstance(valor, (list, tuple)):
        crudos = list(valor)
    else:
        raise DatosInvalidos("los pines deben ser una lista o un texto de numeros")

    pines: list[int] = []
    for t in crudos:
        try:
            v = int(t)
        except (TypeError, ValueError):
            raise DatosInvalidos(f"'{t}' no es un numero de pin valido") from None
        if v not in PINES_VALIDOS:
            raise DatosInvalidos(
                f"el pin {v} no sirve para emitir; los validos son "
                + ", ".join(map(str, PINES_VALIDOS)))
        if v not in pines:
            pines.append(v)

    return sorted(pines)


def mascara_de(pines: list[int]) -> int:
    """Convierte una lista de pines en la mascara de bits que espera la placa."""
    m = 0
    for p in pines:
        m |= 1 << p
    return m


def _validar_campos(datos: dict, parcial: bool = False) -> dict:
    limpio: dict = {}

    if "nombre" in datos or not parcial:
        nombre = str(datos.get("nombre", "")).strip()
        if not nombre:
            raise DatosInvalidos("el nombre no puede estar vacio")
        if len(nombre) > 60:
            raise DatosInvalidos("el nombre no puede pasar de 60 caracteres")
        limpio["nombre"] = nombre

    if "pulsos" in datos or not parcial:
        limpio["pulsos"] = normalizar_pulsos(datos.get("pulsos", []))

    # Los pines de un boton son opcionales. Vacio significa "usar los que
    # esten seleccionados globalmente", que es el caso normal: el boton
    # dice QUE señal mandar, y los pines globales dicen POR DONDE.
    if "pines" in datos:
        limpio["pines"] = normalizar_pines(datos.get("pines"))
    elif not parcial:
        limpio["pines"] = []

    enteros = {
        "freq":         (25000, 60000, 38000),
        "repeticiones": (1,     20,    1),
        "gap_ms":       (0,     1000,  40),
    }
    for campo, (lo, hi, porDefecto) in enteros.items():
        if campo in datos:
            try:
                v = int(datos[campo])
            except (TypeError, ValueError):
                raise DatosInvalidos(f"{campo} debe ser un numero entero") from None
            if not (lo <= v <= hi):
                raise DatosInvalidos(f"{campo} debe estar entre {lo} y {hi}")
            limpio[campo] = v
        elif not parcial:
            limpio[campo] = porDefecto

    return limpio


class Almacen:
    def __init__(self, ruta: str):
        self.ruta = ruta
        self._lock = threading.Lock()
        self._botones: list[dict] = []
        self._config: dict = {"pines": list(PINES_DEFECTO)}
        self._cargar()

    # ---------- persistencia ----------

    def _cargar(self) -> None:
        if not os.path.exists(self.ruta):
            self._botones = []
            return
        try:
            with open(self.ruta, encoding="utf-8") as f:
                datos = json.load(f)
            self._botones = datos.get("botones", [])
        except (json.JSONDecodeError, OSError) as e:
            raise RuntimeError(f"no se pudo leer {self.ruta}: {e}") from e

        guardado = datos.get("config") or {}
        if guardado.get("pines"):
            try:
                self._config["pines"] = normalizar_pines(guardado["pines"])
            except DatosInvalidos:
                pass          # config vieja o invalida: se queda la de fabrica

        # Los botones grabados antes de que existiera la seleccion de
        # pines no traen el campo. Se les agrega vacio, que significa
        # "usar los pines globales"; las ondas quedan intactas.
        for b in self._botones:
            b.setdefault("pines", [])

    def _respaldar(self) -> None:
        """Copia la version actual a respaldos/ antes de pisarla.

        Las ondas son trabajo manual que no se puede regenerar: si el
        archivo se pierde o alguien lo sobrescribe, no hay de donde
        sacarlas de vuelta. Cada guardado deja una copia fechada.
        """
        if not os.path.exists(self.ruta):
            return
        carpeta = os.path.join(os.path.dirname(os.path.abspath(self.ruta)), "respaldos")
        os.makedirs(carpeta, exist_ok=True)
        sello = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
        try:
            shutil.copy2(self.ruta, os.path.join(carpeta, f"botones-{sello}.json"))
        except OSError:
            return          # un respaldo fallido no debe impedir guardar

        viejos = sorted(glob.glob(os.path.join(carpeta, "botones-*.json")))
        for f in viejos[:-RESPALDOS_MAX]:
            try:
                os.unlink(f)
            except OSError:
                pass

    def _guardar(self) -> None:
        self._respaldar()
        # Escritura atomica: si el proceso muere a medias, el archivo
        # original queda intacto en vez de quedar truncado.
        carpeta = os.path.dirname(os.path.abspath(self.ruta))
        os.makedirs(carpeta, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=carpeta, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"config": self._config, "botones": self._botones},
                          f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.ruta)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise

    # ---------- operaciones ----------

    def config(self) -> dict:
        with self._lock:
            return {"pines": list(self._config["pines"]),
                    "pines_validos": list(PINES_VALIDOS)}

    def guardar_config(self, datos: dict) -> dict:
        pines = normalizar_pines(datos.get("pines"))
        if not pines:
            raise DatosInvalidos("hay que seleccionar al menos un pin de emision")
        with self._lock:
            self._config["pines"] = pines
            self._guardar()
        return self.config()

    def pines_de(self, boton: dict) -> list[int]:
        """Los pines del boton si los tiene propios; si no, los globales."""
        propios = boton.get("pines") or []
        with self._lock:
            return list(propios) if propios else list(self._config["pines"])

    def listar(self) -> list[dict]:
        with self._lock:
            return [dict(b) for b in self._botones]

    def obtener(self, id_: str) -> dict | None:
        with self._lock:
            for b in self._botones:
                if b["id"] == id_:
                    return dict(b)
        return None

    def crear(self, datos: dict) -> dict:
        limpio = _validar_campos(datos, parcial=False)
        with self._lock:
            if any(b["nombre"].lower() == limpio["nombre"].lower() for b in self._botones):
                raise DatosInvalidos(f"ya existe un boton llamado '{limpio['nombre']}'")
            boton = {
                "id": uuid.uuid4().hex[:8],
                **limpio,
                "creado": _ahora(),
                "modificado": _ahora(),
            }
            self._botones.append(boton)
            self._guardar()
            return dict(boton)

    def editar(self, id_: str, datos: dict) -> dict:
        limpio = _validar_campos(datos, parcial=True)
        with self._lock:
            for b in self._botones:
                if b["id"] == id_:
                    nuevo = limpio.get("nombre")
                    if nuevo and any(o["id"] != id_ and o["nombre"].lower() == nuevo.lower()
                                     for o in self._botones):
                        raise DatosInvalidos(f"ya existe un boton llamado '{nuevo}'")
                    b.update(limpio)
                    b["modificado"] = _ahora()
                    self._guardar()
                    return dict(b)
        raise KeyError(id_)

    def borrar(self, id_: str) -> dict:
        with self._lock:
            for i, b in enumerate(self._botones):
                if b["id"] == id_:
                    fuera = self._botones.pop(i)
                    self._guardar()
                    return dict(fuera)
        raise KeyError(id_)
