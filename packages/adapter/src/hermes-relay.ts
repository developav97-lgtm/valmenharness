import { existsSync } from "node:fs";

/**
 * El relé: contestar en el chat y que la decisión se ejecute.
 *
 * El puente avisa al celular con un código corto, y hasta acá el código servía
 * para correr `gate-decide` **en la máquina**. Esto cierra esa última milla: el
 * gancho de Hermes lee el mensaje crudo de la persona, reconoce el código, y
 * ejecuta el comando localmente.
 *
 * **Es un gancho y no una herramienta, y esa es la decisión de seguridad de todo
 * el puente.** Si la aprobación viajara como herramienta MCP, el harness no podría
 * distinguir una decisión humana de una aserción del agente: bastaría una
 * inyección de prompt en el cuerpo de un ticket para aprobar. El gancho corre
 * sobre el mensaje que escribió la persona, antes de que el modelo lo vea, así que
 * el agente no puede dispararlo ni inventarlo.
 *
 * Tres cosas más que conviene tener presentes al leerlo:
 *
 * 1. **El código no lo conoce el agente.** Lo emite el harness y viaja por
 *    `hermes send`, que no pasa por el contexto del modelo. Cuando la persona lo
 *    escribe, es la primera vez que aparece en la conversación.
 * 2. **El gancho no puede bloquear el turno.** `pre_llm_call` solo puede inyectar
 *    contexto, así que además de decidir le dice al agente qué pasó: si no, el
 *    agente contestaría «no puedo aprobar compuertas» sobre una decisión ya
 *    registrada, que es peor que no contestar.
 * 3. **No reemplaza a la persona.** Ejecuta exactamente el mismo
 *    `gate-decide` que el botón de Mission Control, con el techo de riesgo que ya
 *    aplica el motor y el token de un solo uso.
 */

/** Lo que el gancho necesita saber del proyecto, resuelto al instalar. */
export interface RelayOptions {
  /** Ruta absoluta del CLI. El gancho no puede confiar en el `PATH`. */
  readonly valmen: string;
  /** Ruta absoluta del proyecto cuyo registro se decide. */
  readonly root: string;
}

/** El nombre del archivo del gancho, dentro de `~/.hermes/hooks/`. */
export const RELAY_SCRIPT_NAME = "valmen-decide.py";

/**
 * El script, tal como se escribe.
 *
 * Es Python y no TypeScript porque lo ejecuta Hermes, que es Python: meter un
 * `node` en el medio agregaría una dependencia —y un arranque de Node— a un
 * gancho que corre en **cada mensaje** que le llega al agente.
 *
 * Las rutas van grabadas y no se buscan en el `PATH`: el servicio de Hermes corre
 * con un `PATH` mínimo (`/usr/bin:/bin:/usr/sbin:/sbin` en macOS), así que un
 * `valmen` a secas no se encuentra y el gancho fallaría en silencio —que es
 * exactamente el modo de fallo que este script existe para no tener—.
 */
export function hermesRelayScript(opciones: RelayOptions): string {
  return `#!/usr/bin/env python3
"""Relé de decisiones del harness: contesta en el chat y la decisión se ejecuta.

Lo instala \`valmen hermes relay --install\`. Lee el mensaje de la persona desde
stdin —el contrato de los ganchos \`pre_llm_call\` de Hermes—, y si es un código
seguido de \`aprobar\` o \`rechazar\`, corre el mismo \`gate-decide\` que Mission
Control.

Por qué es un gancho y no una herramienta: una herramienta MCP la puede llamar el
agente, y entonces el harness no podría distinguir una decisión de una persona de
una aserción del modelo. Este script corre sobre el mensaje crudo, antes de que el
modelo lo vea.
"""

import json
import re
import subprocess
import sys

VALMEN = ${JSON.stringify(opciones.valmen)}
ROOT = ${JSON.stringify(opciones.root)}

# El código corto, y la decisión en las dos formas que la gente escribe.
PATRON = re.compile(r"^\\s*([0-9A-Za-z]{4}-[0-9A-Za-z]{4})\\s+(aprobar|rechazar)\\s*$", re.I)
VERBO = {"aprobar": "approve", "rechazar": "reject"}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    mensaje = str(payload.get("user_message") or "")
    coincidencia = PATRON.match(mensaje)
    # No es una decisión: el gancho no se mete. Devolver nada deja el turno
    # exactamente como estaba, que es lo que corresponde cuando no es para él.
    if coincidencia is None:
        return 0

    codigo = coincidencia.group(1).upper()
    decision = VERBO[coincidencia.group(2).lower()]
    # Quién decide sale del mensaje, no de una suposición: el recibo tiene que
    # poder decir quién lo aprobó dentro de seis meses.
    actor = str(payload.get("sender_id") or "").strip() or "celular"

    try:
        corrida = subprocess.run(
            [VALMEN, "gate-decide", "--code", codigo, "--decision", decision,
             "--actor", actor, "--root", ROOT],
            capture_output=True, text=True, timeout=60,
        )
    except Exception as error:  # noqa: BLE001 — el gancho nunca rompe el turno
        print(json.dumps({"context": CONTEXTO_ERROR.format(detalle=str(error))}))
        return 0

    salida = (corrida.stdout or "").strip() or (corrida.stderr or "").strip()
    if corrida.returncode == 0:
        print(json.dumps({"context": CONTEXTO_OK.format(detalle=salida)}))
    else:
        print(json.dumps({"context": CONTEXTO_FALLO.format(detalle=salida)}))
    return 0


# El agente ve esto **además** de tu mensaje, y existe para que su respuesta sea
# coherente: sin esto contestaría «no puedo aprobar compuertas» sobre una decisión
# que el harness ya registró.
CONTEXTO_OK = (
    "El harness ya registró esta decisión a partir del código de la persona, "
    "que es quien la tomó. No la intentes registrar de nuevo ni la cuestiones: "
    "confirmá en una línea lo que dice este resultado.\\n\\n{detalle}"
)
CONTEXTO_FALLO = (
    "La persona contestó con un código de decisión y el harness lo **rechazó**. "
    "Decile por qué, tal cual, sin inventar una causa distinta ni intentar "
    "arreglarlo por tu cuenta.\\n\\n{detalle}"
)
CONTEXTO_ERROR = (
    "La persona contestó con un código de decisión y no se pudo ejecutar el "
    "comando del harness. Decíselo tal cual y no intentes aprobar nada por tu "
    "cuenta.\\n\\n{detalle}"
)


if __name__ == "__main__":
    sys.exit(main())
`;
}

/**
 * El bloque `hooks:` que declara el gancho.
 *
 * Va como lista bajo `pre_llm_call` porque es la forma que Hermes espera, y lleva
 * `matcher` vacío a propósito: el gancho decide él mismo si el mensaje es para él.
 */
export function hermesRelayHookBlock(scriptPath: string, python: string): string {
  // El intérprete va escrito y no se confía en el shebang ni en el bit de
  // ejecución: el servicio de Hermes arranca con un `PATH` mínimo y un archivo sin
  // `+x` falla como «command not found», que no dice nada de la causa. La ruta va
  // entre comillas simples porque puede tener espacios —el proyecto de ejemplo de
  // este repo vive bajo «10-Proyectos»—.
  const comando = `${python} '${scriptPath.replace(/'/g, `'\\''`)}'`;
  // **Sin la cabecera `hooks:`**, que la pone la fusión: es el mismo contrato que
  // el bloque del servidor MCP, y romperlo duplicó la clave en la configuración
  // del primer proyecto donde se instaló.
  return [
    "  pre_llm_call:",
    `    - command: ${JSON.stringify(comando)}`,
    "      timeout: 60",
    "",
  ].join("\n");
}

/** El archivo donde Hermes guarda los ganchos. */
export function hermesHookPath(home: string, configPath: string): string {
  // El directorio del config es el `HERMES_HOME` efectivo, así que los ganchos
  // viven al lado y respetar `HERMES_HOME` sale gratis.
  return `${configPath.replace(/\/config\.yaml$/, "")}/hooks/${RELAY_SCRIPT_NAME}`;
}

/** Un Python 3 razonable, o `null` si no hay ninguno. */
export function relayPythonCommand(): string | null {
  for (const candidato of [
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
  ]) {
    if (existsSync(candidato)) return candidato;
  }
  return null;
}
