import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { lanURLs } from './lib/red.js';
import { prisma } from './lib/prisma.js';
import { corsOrigin } from './lib/cors.js';
import { buildLeaderboard } from './lib/timing.js';
import { buildLobbyFor } from './lib/snapshot.js';
import { attachRealtime } from './realtime/server.js';
import { arrancarVigiaFinal } from './realtime/luces.js';

// En un evento en vivo, un fallo silencioso es un fallo que descubres
// cuando alguien levanta la mano. Que todo quede en el log.
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

const app = express();
app.use(cors({ origin: corsOrigin(), credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Snapshot para el ADMIN (ve todo, sin censura).
app.get('/api/state', async (_req, res) => {
  const [event, phases, teams] = await Promise.all([
    prisma.eventState.findUnique({ where: { id: 'singleton' } }),
    prisma.phase.findMany({ orderBy: { order: 'asc' } }),
    prisma.team.findMany({
      // Mismo orden estable que el snapshot del panel, para que las dos
      // vistas del mismo evento no cuenten los equipos en otro orden.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      // `select` para no arrastrar los bytes del logo a un JSON que
      // nadie va a mirar: el logo se pide por su propia ruta.
      select: {
        id: true, name: true, score: true, logoAt: true,
        members: { select: { id: true, displayName: true, role: true, connected: true } },
      },
    }),
  ]);
  res.json({ event, phases, teams });
});

// LOBBY de un equipo (misma proyección que emite el WebSocket).
app.get('/api/lobby/:teamId', async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: req.params.teamId } });
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });
  const event = await prisma.eventState.findUniqueOrThrow({ where: { id: 'singleton' } });
  res.json({ eventStatus: event.status, phases: await buildLobbyFor(team.id) });
});

// El logo de un equipo. Va por HTTP y no dentro del snapshot porque
// diez logos serían varios megas repetidos en cada repintado y a cada
// cliente; aquí el navegador lo pide una vez y se lo queda.
app.get('/api/equipos/:id/logo', async (req, res) => {
  const equipo = await prisma.team.findUnique({
    where: { id: req.params.id },
    select: { logo: true, logoMime: true },
  });
  if (!equipo?.logo || !equipo.logoMime) return res.status(404).json({ error: 'Sin logo' });

  res.setHeader('Content-Type', equipo.logoMime);
  // La URL lleva `?v=` con la fecha del logo, así que ESTA respuesta no
  // cambia nunca: cambiar el logo cambia la URL. Sin esto, el proyector
  // volvería a pedir diez imágenes en cada recarga.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(equipo.logo));
});

// Ranking por tiempos. Fuente para decidir al ganador.
app.get('/api/leaderboard', async (_req, res) => {
  const teams = await prisma.team.findMany({ include: { progress: true } });
  res.json(buildLeaderboard(teams));
});

// Al arrancar nadie está conectado: limpia banderas que hubieran quedado
// colgadas de un cierre brusco del proceso.
await prisma.user.updateMany({ data: { connected: false, socketId: null } });

const server = createServer(app);
attachRealtime(server);
// `FINAL_DERROTA` no la provoca nadie: pasa cuando un reloj llega a
// cero, y una luz la tiene que encender el servidor.
arrancarVigiaFinal();
const PORT = Number(process.env.PORT ?? 4000);
// 0.0.0.0 y no `localhost`: si solo escuchara en la interfaz de loopback,
// el resto de la sala vería la conexión rechazada sin más explicación.
const HOST = process.env.HOST ?? '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`API HackMeThon → http://localhost:${PORT}`);
  for (const url of lanURLs(PORT)) console.log(`         en la red → ${url}`);
});
