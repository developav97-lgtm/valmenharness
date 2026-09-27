#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Aviso de arranque de un eslabón de una tanda programada.
#
# Lo escribe `scripts/programar-tickets.mjs` del harness rellenando los marcadores
# `{{...}}` de esta plantilla, en `scripts/` del perfil de Hermes del proyecto.
# NO se edita a mano: se mejora esta plantilla y se vuelve a programar.
#
# Corre sin agente (`no_agent`): su stdout es el mensaje que recibe el PO. Por eso
# todo lo que decide se decide con código; ninguna llamada a un modelo.
#
# Hace tres cosas, en este orden:
#   1. Se asegura de que Mission Control del proyecto esté sirviendo **y de que se
#      pueda abrir desde el celular**: escuchando en 0.0.0.0, no sólo en
#      127.0.0.1. Un servidor que escucha sólo en loopback da un enlace que no
#      abre desde el teléfono, y el aviso que lo promete es una mentira.
#   2. Comprueba que el harness que va a usar la sesión sea el del árbol: `dist/`
#      no se versiona, así que un build atrás de `src/` deja al MCP y al CLI
#      corriendo código viejo. Lo reconstruye **sólo con el árbol limpio**
#      (con cambios a medias de otra sesión, reconstruir publicaría un build roto).
#   3. Imprime el aviso de arranque con el enlace al ticket.
#
# Con `--enlace` imprime sólo el enlace: así lo usa la sesión del eslabón al
# entregar, sin repetir acá la lógica de puertos y de IP.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO="{{RUTA_REPO}}"
PROYECTO="{{PROYECTO}}"
PERFIL="{{PERFIL}}"
TICKET="{{TICKET_ID}}"
ESLABON="{{ESLABON}}"
HORA="{{HORA}}"

VALMEN="${HOME}/.local/bin/valmen"
LOGS="${HOME}/.hermes/profiles/${PERFIL}/logs"
LOG="${LOGS}/pantalla-{{NOMBRE_JOB}}.log"

PRIMERO=4173
ULTIMO=4199

solo_enlace=0
[ "${1:-}" = "--enlace" ] && solo_enlace=1

# ¿Responde Mission Control de ESTE proyecto en ese puerto? Que algo escuche no
# alcanza: en el mismo rango puede estar el de otro proyecto.
es_del_proyecto() {
  curl -s --max-time 2 "http://127.0.0.1:$1/api/health" 2>/dev/null | grep -Fq "\"root\": \"${REPO}\""
}

# El puerto donde ya está sirviendo este proyecto; vacío si no está.
puerto_actual() {
  local p
  for p in $(seq "$PRIMERO" "$ULTIMO"); do
    lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || continue
    es_del_proyecto "$p" && { echo "$p"; return 0; }
  done
  return 1
}

# ¿Escucha sólo en loopback? Entonces el enlace no abre desde el celular.
solo_loopback() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | grep -q "127\.0\.0\.1:$1"
}

primer_libre() {
  local p
  for p in $(seq "$PRIMERO" "$ULTIMO"); do
    lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { echo "$p"; return 0; }
  done
  return 1
}

esperar_respuesta() {
  local p="$1" i
  for i in $(seq 1 40); do
    es_del_proyecto "$p" && return 0
    sleep 0.5
  done
  return 1
}

esperar_liberacion() {
  local p="$1" i
  for i in $(seq 1 24); do
    lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.25
  done
  return 1
}

# Levanta Mission Control del proyecto escuchando en todas las interfaces.
levantar() {
  local p="$1"
  mkdir -p "$LOGS"
  nohup "$VALMEN" --root "$REPO" serve --port "$p" --host 0.0.0.0 >>"$LOG" 2>&1 &
  esperar_respuesta "$p"
}

ip_lan() {
  local ip iface defecto
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null)" || continue
    [ -n "$ip" ] && { echo "$ip"; return 0; }
  done
  defecto="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' | head -1)"
  [ -n "$defecto" ] || return 1
  ipconfig getifaddr "$defecto" 2>/dev/null
}

# ── 1. La pantalla ───────────────────────────────────────────────────────────
PUERTO="$(puerto_actual)"
if [ -z "$PUERTO" ]; then
  PUERTO="$(primer_libre)"
  if [ -z "$PUERTO" ]; then
    NOTA_PANTALLA="no encontré puerto libre para la pantalla"
  elif levantar "$PUERTO"; then
    NOTA_PANTALLA="no estaba sirviendo: la levanté en el ${PUERTO}"
  else
    NOTA_PANTALLA="no pude levantarla en el ${PUERTO}; mirá ${LOG}"
    PUERTO=""
  fi
elif solo_loopback "$PUERTO"; then
  kill "$(lsof -t -iTCP:"$PUERTO" -sTCP:LISTEN 2>/dev/null | head -1)" 2>/dev/null
  if esperar_liberacion "$PUERTO" && levantar "$PUERTO"; then
    NOTA_PANTALLA="escuchaba sólo en 127.0.0.1: la relevé en el ${PUERTO} para que abra desde el celular"
  else
    NOTA_PANTALLA="no pude relevarla en el ${PUERTO}; mirá ${LOG}"
    PUERTO=""
  fi
else
  NOTA_PANTALLA="ya estaba sirviendo en el ${PUERTO}"
fi

IP="$(ip_lan)" || IP=""
URL=""
if [ -n "$PUERTO" ] && [ -n "$IP" ]; then
  URL="http://${IP}:${PUERTO}/#/ticket/${TICKET}"
else
  [ -z "$IP" ] && NOTA_PANTALLA="${NOTA_PANTALLA}; no encontré la IP de la red local"
fi

# ── 2. El build del harness, que no se versiona ──────────────────────────────
SHA="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo "sin-git")"
BUILD=""
if [ -f "$REPO/packages/cli/dist/main.js" ]; then
  if [ -z "$(find "$REPO/packages" -name '*.ts' -path '*/src/*' -newer "$REPO/packages/cli/dist/main.js" -print -quit 2>/dev/null)" ]; then
    BUILD="build al día"
  elif [ -z "$(git -C "$REPO" status --porcelain 2>/dev/null)" ]; then
    if (cd "$REPO" && npm run build >>"$LOG" 2>&1); then
      # El MCP que Hermes tenga levantado sigue siendo el del build viejo: se lo deja caer
      # para que la próxima llamada lo levante del build nuevo. Sólo acá, después de
      # reconstruir y con el árbol limpio, nunca por rutina.
      pkill -f "${REPO}/packages/mcp/dist/main.js" 2>/dev/null
      BUILD="reconstruí el build, que estaba atrás del árbol, y reinicié el MCP"
    else
      BUILD="el build estaba atrás del árbol y no pude reconstruirlo: mirá ${LOG}"
    fi
  else
    BUILD="build atrás del árbol y el árbol tiene cambios sin commitear: no lo reconstruí (otra sesión puede estar a medias)"
  fi
fi

# ── 3. La salida ─────────────────────────────────────────────────────────────
if [ "$solo_enlace" = "1" ]; then
  [ -n "$URL" ] && printf '%s\n' "$URL"
  exit 0
fi

echo "▶️ Arranca el eslabón ${ESLABON} de hoy: ${TICKET} en ${PROYECTO} — ${HORA}."
if [ -n "$URL" ]; then
  echo "Pantalla: ${URL}"
else
  echo "Pantalla: sin enlace (${NOTA_PANTALLA})"
fi
echo "Árbol en ${SHA} · ${NOTA_PANTALLA}${BUILD:+ · ${BUILD}}"
