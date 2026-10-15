#!/usr/bin/env bash
# ============================================================
#  Deja la máquina lista para que la sala se conecte.
#
#  Dos cosas: decir por qué dirección se entra, y abrir el cortafuegos.
#  Lo segundo es lo que se olvida siempre — el servidor arranca bien, el
#  log dice la IP, y desde el portátil de al lado no carga nada.
#
#  Uso:  sudo server/scripts/red-local.sh          (abre solo a la subred)
#        sudo server/scripts/red-local.sh --todo   (abre a cualquier origen)
#        server/scripts/red-local.sh --cerrar      (retira las reglas)
# ============================================================
set -euo pipefail

PUERTO_API=4000
PUERTO_WEB=5173

cidr=$(ip -4 -o addr show scope global | awk 'NR==1 {print $4}')
ip=${cidr%%/*}

if [[ -z "$ip" ]]; then
  echo "No hay ninguna interfaz de red con IP. ¿Wi-Fi conectado?" >&2
  exit 1
fi

# La subred, no la IP suelta: 10.33.6.174/19 → 10.33.0.0/19
subred=$(python3 -c "import ipaddress,sys; print(ipaddress.ip_network(sys.argv[1], strict=False))" "$cidr")

if [[ "${1:-}" == "--cerrar" ]]; then
  for p in "$PUERTO_API" "$PUERTO_WEB"; do
    sudo ufw --force delete allow "$p/tcp" 2>/dev/null || true
    sudo ufw --force delete allow from "$subred" to any port "$p" proto tcp 2>/dev/null || true
  done
  echo "Puertos $PUERTO_API y $PUERTO_WEB cerrados."
  exit 0
fi

for p in "$PUERTO_API" "$PUERTO_WEB"; do
  if [[ "${1:-}" == "--todo" ]]; then
    sudo ufw allow "$p/tcp" comment 'hackmethon'
  else
    sudo ufw allow from "$subred" to any port "$p" proto tcp comment 'hackmethon'
  fi
done

cat <<FIN

  Listo. Reparte estas direcciones:

    Jugadores y admin →  http://$ip:$PUERTO_WEB
    (la API queda en   http://$ip:$PUERTO_API, no hace falta darla)

  Todos deben estar en la MISMA red Wi-Fi. Si el router tiene
  "aislamiento de clientes" / AP isolation, apágalo o nadie se verá.

FIN
