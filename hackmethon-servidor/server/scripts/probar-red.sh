#!/usr/bin/env bash
# ============================================================
#  ¿Esta red deja pasar el túnel?
#
#  No todas lo permiten. Una red institucional o de oficina puede dejar
#  salir HTTPS normal y aun así cortar el túnel: el TCP conecta, el
#  handshake TLS expira y `cloudflared` se queda reintentando mientras
#  la URL pública devuelve 530. Visto desde la sala, eso es el juego
#  entero caído sin una sola pista de por qué.
#
#  Esto lo responde en medio minuto, y lo responde de la única forma
#  que vale: levantando un túnel de verdad y pidiéndole la API por su
#  URL pública. Úsalo en la sede ANTES del evento, no durante.
#
#  Uso:  npm run probar:red
# ============================================================
set -uo pipefail

PUERTO=${PORT:-4000}
ESPERA=${ESPERA:-90}
log=$(mktemp) ; tuneles=()
limpiar() { for p in "${tuneles[@]:-}"; do kill "$p" 2>/dev/null; done; rm -f "$log"; }
trap limpiar EXIT

echo "Red actual:"
ip -4 -o addr show scope global 2>/dev/null | awk '{print "  " $2 "  " $4}'
echo

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Falta cloudflared. Instálalo: sudo pacman -S cloudflared" >&2
  exit 1
fi

if ! curl -fsS --max-time 3 "http://localhost:$PUERTO/api/health" >/dev/null 2>&1; then
  echo "El backend no responde en :$PUERTO. Arráncalo antes (npm run dev)." >&2
  exit 1
fi
echo "Backend local ....... OK"

# Paso 1: ¿se alcanza siquiera el puerto del edge? Un TCP que abre no
# garantiza nada —el filtro suele actuar después, en el TLS— pero un TCP
# que NO abre ya cierra el caso.
if timeout 6 bash -c "cat < /dev/null > /dev/tcp/region1.v2.argotunnel.com/7844" 2>/dev/null; then
  echo "TCP 7844 al edge ... OK"
else
  echo "TCP 7844 al edge ... BLOQUEADO"
fi

# Paso 2: el que manda. Un túnel real, y una petición real a través de él.
#
# Con calma deliberada. Un nombre recién creado tarda en propagarse por
# DNS, así que la primera petición puede expirar resolviendo mientras el
# túnel está perfectamente sano. Cortar pronto aquí da un FALSO NEGATIVO
# —«esta red no sirve» sobre una sede que sí servía—, que es el peor
# error que puede cometer esta herramienta.
echo "Levantando un túnel de prueba (hasta ${ESPERA}s)..."
cloudflared tunnel --url "http://localhost:$PUERTO" --no-autoupdate > "$log" 2>&1 &
tuneles+=($!)

url="" ; registrado=""
for ((i = 0; i < ESPERA; i++)); do
  sleep 1
  [[ -z "$url" ]] && url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1)
  if [[ -z "$registrado" ]] && grep -q "Registered tunnel connection" "$log"; then
    registrado=1
    echo "Túnel registrado ... OK (probando tráfico real)"
  fi
  # Solo se pregunta cuando hay canal; y se pregunta con paciencia.
  if [[ -n "$url" && -n "$registrado" ]] && (( i % 10 == 0 )); then
    if curl -fsS --max-time 20 "$url/api/health" >/dev/null 2>&1; then
      echo
      echo "============================================================"
      echo "  ✅ ESTA RED SIRVE."
      echo "  El túnel levantó y la API respondió por internet."
      echo "  URL de prueba: $url"
      echo "============================================================"
      exit 0
    fi
  fi
done

echo
echo "============================================================"
echo "  ❌ ESTA RED NO SIRVE PARA EL TÚNEL."
if grep -q "hard_fail=true" "$log"; then
  echo "  El propio cloudflared lo detecta (precheck: hard_fail)."
fi
grep -oE "QUIC connection failed|HTTP/2 connection is blocked or unreachable" "$log" |
  sort -u | sed 's/^/  · /'
grep -oE "TLS handshake with edge error[^\"]*" "$log" | head -1 | sed 's/^/  · /'
if [[ -n "$registrado" ]]; then
  echo "  El túnel SÍ registró conexión, pero el tráfico no llegó en"
  echo "  ${ESPERA}s. Puede ser solo el DNS, que tarda en propagarse:"
  echo "  reintenta con  ESPERA=180 npm run probar:red  antes de"
  echo "  descartar esta red."
elif [[ -n "$url" ]]; then
  echo "  Dio una URL ($url) pero nunca registró conexión: eso es el 530."
fi
echo
echo "  Prueba otra red (hotspot del móvil) o sube el backend a un"
echo "  hosting, que no necesita túnel."
echo "============================================================"
exit 1
