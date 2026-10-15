#!/usr/bin/env bash
# ============================================================
#  Publica la API en internet a través de un túnel de Cloudflare.
#
#  Por qué un túnel y no un hosting: el servidor no es una función que
#  responde y muere. Mantiene WebSockets abiertos, cronómetros vivos y
#  un mapa de presencia en memoria (realtime/presence.ts, trafico.ts).
#  Eso necesita UN proceso de verdad, y el que ya tienes funcionando en
#  esta máquina lo es. El túnel solo le abre una puerta desde fuera.
#
#  Uso:  npm run tunel
#        npm run tunel -- mi-app.vercel.app   (imprime el enlace listo)
#
#  Lo que imprime al final es lo único que se reparte a la sala.
# ============================================================
set -euo pipefail

PUERTO=${PORT:-4000}
VERCEL=${1:-${VERCEL_APP:-}}

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<'AYUDA'
Falta `cloudflared`. Instálalo con una de estas:

  yay -S cloudflared-bin          # Arch / CachyOS (AUR)
  sudo pacman -S cloudflared      # si está en los repos
  brew install cloudflared        # macOS

O el binario suelto, sin gestor de paquetes:
  curl -L -o ~/.local/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x ~/.local/bin/cloudflared
AYUDA
  exit 1
fi

# Un túnel hacia un puerto vacío arranca igual de contento y no avisa de
# nada: da una URL que devuelve 502 a todo el mundo. Mejor decirlo ahora
# que descubrirlo con la sala ya conectada.
if ! curl -fsS --max-time 3 "http://localhost:$PUERTO/api/health" >/dev/null 2>&1; then
  echo "AVISO: nadie responde en http://localhost:$PUERTO/api/health" >&2
  echo "       Arranca el backend antes (cd server && npm run dev)." >&2
  echo >&2
fi

echo "Abriendo túnel hacia http://localhost:$PUERTO ..."
echo

anunciada=""
cloudflared tunnel --url "http://localhost:$PUERTO" --no-autoupdate 2>&1 |
  while IFS= read -r linea; do
    echo "$linea"
    if [[ -z "$anunciada" && "$linea" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
      url="${BASH_REMATCH[1]}"
      anunciada=1
      echo
      echo "============================================================"
      echo "  API pública:  $url"
      if [[ -n "$VERCEL" ]]; then
        limpia=${VERCEL#http://}; limpia=${limpia#https://}; limpia=${limpia%/}
        echo
        echo "  REPARTE ESTE ENLACE:"
        echo "  https://$limpia/?api=$url"
      else
        echo
        echo "  Pon esto en Vercel como VITE_API_URL, o reparte:"
        echo "  https://TU-APP.vercel.app/?api=$url"
      fi
      echo
      echo "  Mientras esta ventana siga abierta, el juego está en línea."
      echo "  Ctrl+C lo cierra para todos."
      echo "============================================================"
      echo
    fi
  done
