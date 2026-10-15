import { useEffect, useRef, useState } from 'react';
import type { AppSocket } from '../lib/socket';
import { call } from '../lib/socket';
import { ERROR_IDENTIDAD, LOGO_MAX, urlLogo } from '../lib/logo';

// ============================================================
//  Nombre y logo de un equipo, editables en caliente.
//
//  Lo que hay sembrado —ALFA, BRAVO…— son nombres de relleno: el día
//  del evento cada equipo llega con el suyo y con un PNG. Esto es lo
//  que permite ponérselos sin tocar el seed ni reiniciar nada.
//
//  Lo que NO cambia es el código de acceso de cada persona. Se imprime
//  y se reparte antes de empezar, y cambiarlo a media tarde dejaría
//  fuera a quien ya tiene el suyo en la mano.
// ============================================================

type Equipo = { id: string; name: string; logoAt: number | null };
type Aviso = { tipo: 'ok' | 'err'; texto: string };

export function IdentidadEquipo({
  equipo, socket, bloqueado, onAviso,
}: {
  equipo: Equipo;
  socket: AppSocket;
  bloqueado: boolean;
  onAviso: (a: Aviso) => void;
}) {
  const [borrador, setBorrador] = useState(equipo.name);
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  // Si el nombre cambia por fuera —otro admin, un reinicio— el campo lo
  // sigue. Solo se dispara cuando cambia de verdad, así que escribir
  // aquí mientras llegan snapshots no borra lo tecleado.
  useEffect(() => { setBorrador(equipo.name); }, [equipo.name]);

  const fallo = (r: { error?: string }) =>
    onAviso({ tipo: 'err', texto: ERROR_IDENTIDAD[r.error ?? ''] ?? r.error ?? 'Error' });

  async function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    const nombre = borrador.replace(/\s+/g, ' ').trim();
    // Un campo vaciado y enviado se repone solo. Dejarlo en blanco y
    // callar sería peor que el error: parece que se guardó algo.
    if (!nombre) { setBorrador(equipo.name); return; }
    if (nombre === equipo.name) { setBorrador(equipo.name); return; }
    setOcupado(true);
    const r = await call(socket, 'admin:equipo:nombre', { teamId: equipo.id, nombre });
    setOcupado(false);
    if (r.ok) onAviso({ tipo: 'ok', texto: `${equipo.name} ahora se llama ${nombre}` });
    else { setBorrador(equipo.name); fallo(r); }
  }

  async function subirLogo(f: File) {
    // El tamaño se mira ANTES de mandarlo: pasarse del tope del socket no
    // da un error, cierra la conexión, y el panel solo diría «sin
    // conexión» justo al subir un logo.
    if (f.size > LOGO_MAX) {
      onAviso({
        tipo: 'err',
        texto: `«${f.name}» pesa ${Math.round(f.size / 1024)} kB y el tope son 512 kB`,
      });
      return;
    }
    setOcupado(true);
    const r = await call(socket, 'admin:equipo:logo', {
      teamId: equipo.id,
      datos: await f.arrayBuffer(),
    });
    setOcupado(false);
    if (r.ok) onAviso({ tipo: 'ok', texto: `Logo puesto en ${equipo.name}` });
    else fallo(r);
  }

  async function quitarLogo() {
    setOcupado(true);
    const r = await call(socket, 'admin:equipo:logo', { teamId: equipo.id, datos: null });
    setOcupado(false);
    if (r.ok) onAviso({ tipo: 'ok', texto: `Logo retirado de ${equipo.name}` });
    else fallo(r);
  }

  const logo = urlLogo(equipo.id, equipo.logoAt);
  const quieto = bloqueado || ocupado;
  const cambiado = borrador.replace(/\s+/g, ' ').trim() !== equipo.name;

  return (
    <div className="identidad">
      {/* El escudo ES el botón de subir: pulsar sobre el hueco del logo
          para poner un logo no hay que explicarlo. */}
      <button
        type="button"
        className={`escudo ${logo ? 'puesto' : ''}`}
        title={`Subir el logo de ${equipo.name} (PNG, JPG o WEBP, hasta 512 kB)`}
        disabled={quieto}
        onClick={() => archivo.current?.click()}
      >
        {logo
          ? <img src={logo} alt={`Logo de ${equipo.name}`} />
          : <span className="escudo-hueco">LOGO</span>}
      </button>
      <input
        ref={archivo}
        type="file"
        className="escudo-archivo"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // El valor se limpia para que volver a elegir EL MISMO archivo
          // —tras recortarlo, por ejemplo— siga disparando el cambio.
          e.target.value = '';
          if (f) void subirLogo(f);
        }}
      />

      {/* Quitar va pegado al escudo, no al otro extremo de la fila: se
          entiende a qué se refiere sin leer nada. Y con la rotulación
          de la casa —`><`, `[OK]`, `><!`— para no meter una palabra de
          seis letras en una cabecera que ya va justa. */}
      {equipo.logoAt !== null && (
        <button
          type="button"
          className="sutil quitar-logo"
          title={`Quitar el logo de ${equipo.name}`}
          disabled={quieto}
          onClick={quitarLogo}
        >
          [x]
        </button>
      )}

      <form className="identidad-nombre" onSubmit={guardarNombre}>
        <input
          value={borrador}
          maxLength={24}
          disabled={quieto}
          aria-label={`Nombre del equipo ${equipo.name}`}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setBorrador(equipo.name); }}
        />
        {/* El botón solo aparece si hay algo que guardar: con diez
            equipos, diez botones encendidos sin nada que hacer son diez
            sitios donde equivocarse. */}
        {cambiado && (
          <button type="submit" className="primaria" disabled={quieto}>
            {ocupado ? '…' : 'GUARDAR'}
          </button>
        )}
      </form>
    </div>
  );
}
