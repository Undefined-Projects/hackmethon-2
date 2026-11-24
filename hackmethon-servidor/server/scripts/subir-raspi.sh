#!/usr/bin/env bash
# ============================================================
#  Sube lo que hay en esta laptop a la raspi y reinicia el juego.
#
#  La raspi sirve el juego por Tailscale (http://raspi.<tailnet>.ts.net:5173)
#  con dos servicios de usuario: hackmethon-api y hackmethon-web.
#  Su base de datos NO se toca: se excluyen los *.db, así que las partidas
#  que se jueguen allí sobreviven a cada subida.
#
#  Uso:  npm run subir:raspi            (host ssh por defecto: raspi)
#        RASPI=raspi-local npm run subir:raspi
# ============================================================
set -euo pipefail

HOST="${RASPI:-raspi}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"

echo "→ Copiando código a $HOST:~/hackmethon"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .vercel \
  --exclude '*.db' --exclude '*.db-journal' --exclude '*.pdf' \
  "$RAIZ/server" "$RAIZ/client" "$HOST:hackmethon/"

echo "→ Instalando y compilando en $HOST"
ssh "$HOST" 'set -e
  export PATH=$HOME/.local/node/bin:$PATH
  cd ~/hackmethon/server
  npm ci --no-audit --no-fund --loglevel=error
  npx prisma generate >/dev/null
  npx prisma db push --skip-generate
  npm run build --silent
  cd ../client
  npm ci --no-audit --no-fund --loglevel=error
  npm run build --silent >/dev/null
  systemctl --user restart hackmethon-api hackmethon-web
  sleep 3
  systemctl --user is-active hackmethon-api hackmethon-web'

NOMBRE="$(ssh "$HOST" 'tailscale status --json | python3 -c "import json,sys;print(json.load(sys.stdin)[\"Self\"][\"DNSName\"].rstrip(\".\"))"')"
echo
echo "  Listo. Juego en: http://$NOMBRE:5173"
