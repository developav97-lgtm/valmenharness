---
name: programar-trabajo-de-tickets
description: Usar cuando haya que dejar agendado el trabajo de varios tickets para que corran solos, o cuando se revise cómo se programó. Cubre el orden, las guardas, la cadencia, el aviso de arranque con la pantalla del ticket, la autorización y el costeo por sesión.
version: 1.1.0
origen: valmen
---

# Programar el trabajo de los tickets

Dejar agendado el trabajo de varios tickets de una feature para que arranquen solos, en el
orden del grafo y **cada uno en su propia sesión**. La forma se ejecuta con
`scripts/programar-tickets.mjs` del harness, que rellena la plantilla
`templates/programar/prompt-eslabon.md` y, por cada eslabón, escribe su aviso de arranque
desde `templates/programar/aviso-eslabon.sh`.

## El aviso de arranque y la pantalla del ticket

Una tanda avisa **cuando empieza y cuando termina**, y al empezar entrega el enlace al
ticket para seguirlo desde el celular. Son dos jobs por eslabón y no es un capricho: un job
entrega sólo su respuesta final, así que el aviso de arranque no puede salir del job del
trabajo —el que termina es el único que habla—; el aviso es un `no_agent` tres minutos
antes, que no gasta modelo.

El aviso es un script y hace tres cosas, en este orden:

1. **Se asegura de que Mission Control del proyecto esté sirviendo y de que abra desde el
   celular.** Un servidor escuchando sólo en `127.0.0.1` da un enlace que no abre desde el
   teléfono, y el aviso que lo promete es una mentira: el script busca el puerto donde ya
   sirve ese proyecto (comprobando por `/api/health` que el `root` sea el del proyecto, no
   que algo escuche), y si escucha sólo en loopback lo releva en el mismo puerto con
   `--host 0.0.0.0`. Si no estaba sirviendo, lo levanta en el primer puerto libre.
2. **Comprueba que el harness sea el del árbol.** `dist/` no se versiona, así que un build
   atrás de `src/` deja al MCP y al CLI corriendo código viejo. Lo reconstruye **sólo con el
   árbol limpio**: con cambios a medias de otra sesión, reconstruir publicaría un build roto.
   Y después de reconstruir deja caer el proceso del MCP, que sigue siendo el del build
   viejo, para que la próxima llamada lo levante nuevo.
3. Imprime el aviso: el eslabón, el ticket, el proyecto, la hora, el enlace y el estado del
   árbol y del build.

El enlace lo arma una sola vez ese script. La sesión del eslabón lo reusa al entregar con
`--enlace` (imprime sólo la URL): así el enlace no se calcula dos veces con dos criterios, y
si la pantalla no está sirviendo el script no imprime nada y la sesión lo dice en vez de
inventar una URL.

«Actualizado» quiere decir que lo que el PO mira sea el código del árbol, y el enlace lo da
la IP de la máquina, no `127.0.0.1`. Por eso el estándar publica la pantalla en la red
local: la franja de puertos `4173-4199`, un proyecto por puerto, con la frontera de
confianza en la red doméstica.

## Al cerrar: el enlace y el siguiente eslabón

La entrega de un eslabón termina con dos líneas más, y las dos son parte del estándar:

1. **El enlace de la pantalla del ticket**, para abrirlo desde el celular.
2. **Si queda otro eslabón de la tanda por correr**, se nombra con su hora y su ticket y se
   ofrece adelantarlo. No lo adelanta: la orden la da el PO. Si la tanda terminó antes de
   tiempo, nadie tiene por qué esperar dos horas a que dispare un job.

Cuando el PO responde a ese hilo —por eso el job de trabajo se crea con
`attach_to_session`, para que su respuesta siga en la misma sesión—, el que adelanta corre
`cronjob_manage` `action='update'` con `schedule='in 5m'` sobre el job que él nombre. Ese
job trabaja su propio ticket en su propia sesión: no se trabaja acá.

## Por qué una sesión por ticket

Un job de cron crea su propia sesión (`cron_<job>_<fecha>`) con su fila de costo. Dos
tickets en la misma sesión comparten esa fila y el registro termina con dos tickets cuyo
gasto es el mismo número, que no es el de ninguno de los dos. Un ticket, un job, una
sesión: es lo que hace que el consumo sea un dato y no un reparto a ojo.

Corolario: **el prompt de un eslabón no encadena a los demás creando jobs**, porque la
tanda entera ya está agendada. Si el PO responde al hilo pidiendo seguir con otro ticket,
ahí sí se crea el job de ese ticket —sesión nueva— y se le dice por qué no se trabaja en la
que ya está abierta.

## El orden, que no se escribe a mano

El orden sale del `tickets.yaml` de la feature:

1. Se recorre en el orden del archivo (sprint y luego posición).
2. Es elegible el ticket que está en `intake` y cuyas dependencias están **todas** en
   `closed`, contando como cerradas las que esta misma tanda va a cerrar antes de que le
   toque el turno.
3. Se saltean los tipos que piden autorización aparte (`SYNC`, `SECURITY`, `MIGRATION`) y
   cualquier ticket con impacto crítico: eso no se hereda de la autorización de la tanda,
   se pide. El salteado se dice en la entrega, con el motivo.

El script calcula esto solo. Escribir la lista a mano es la forma de equivocarse: el grafo
cambia y la lista no.

## La cadencia y los topes

- Cada dos horas es una cadencia razonable para tickets del mismo repositorio: deja aire
  para que el anterior termine, y el siguiente tiene la guarda de repositorio ocupado si no
  terminó.
- **Tope de cinco eslabones por día y nada después de las 20:00** hora del PO. El tope
  existe porque cada eslabón gasta sin que nadie mire. Cuando el PO pide horas que cruzan el
  tope, se programan igual —es su palabra, no una excepción silenciosa— y se le dice en la
  entrega que la tanda pasa de las 20:00. Desde que la tanda avisa al arrancar y al cerrar, y
  el que cierra ofrece adelantar el siguiente, el tope dejó de ser lo único que impide que
  algo gaste sin que nadie mire; lo que no cambia es que se declara.
- Un eslabón que arranca tarde entra por `catch_up_missed`, pero **la máquina tiene que
  estar despierta**: el planificador es un proceso del host.

## La autorización, citada

El prompt lleva la autorización del PO **en sus palabras**, con la fecha, y el alcance
escrito al lado: qué habilita (aprobar la compuerta de análisis, la del plan y el QA) y qué
no (commit, push, PR, tag ni despliegue). Si el PO delega el QA, el cierre se registra como
**aprobación delegada** citando su frase; nunca se escribe como palabras suyas algo que no
dijo.

La aprobación delegada de una compuerta **se registra, no se escribe sólo en prosa**: la
línea del plan es lo que el motor exige para mover el ticket, y el `valmen gate-decide --id
<ID> --receipt <GR-…> --decision approve --actor "<nombre> (delegación, <fecha>)" --reason
"<qué quedó en banda y por qué se recomienda>"` es lo que deja la decisión en el recibo. Sin
ese registro el recibo queda con la decisión en blanco: el registro sigue contando esa
compuerta como esperando a una persona —en un ticket ya cerrado— y el relé de Hermes la
vuelve a avisar. El motor no lo exige para avanzar (sólo `qa-mechanical` bloquea una
transición), así que un eslabón que aprueba «en prosa» avanza igual y deja el hueco: por eso
lo pide la plantilla, y por eso el recibo **no se puede re-decidir** después (responde «ya
tiene una decisión humana registrada»): la primera vez es la que vale.

## Cómo se corre

```bash
node scripts/programar-tickets.mjs \
  --raiz   <ruta del proyecto> \
  --feature <slug de la feature> \
  --perfil  <perfil de Hermes del proyecto, p. ej. saiopencloud> \
  --cantidad 5 --inicio 2026-09-28T08:00:00 --cada 2h \
  --deliver slack:<canal> \
  --skills  <las skills del flujo del proyecto> \
  --autorizacion '<frase literal del PO>' --autorizado-por '<nombre>' --autorizado-el <fecha> \
  --implementador sesion|opencode \
  --linea-base '<la suite en verde al día tal>' \
  [--nota '<particularidad del proyecto>'] [--mcp <servidor>] \
  [--permitir-criticos] [--sin-aviso] [--dry-run] [--salida <dir>]
```

- **`--dry-run` primero, siempre.** Escribe los prompts y los avisos en `--salida` y muestra
  la tabla sin crear nada. Se leen los prompts antes de agendar. Ese directorio —por defecto
  `.valmen/programar/` del proyecto— es derivado y se agrega al `.gitignore` del proyecto: los
  prompts contienen la autorización citada y se regeneran al programar la tanda siguiente.
- **A una tanda ya agendada no se le aplica la forma nueva volviéndola a programar.** El
  script **crea** jobs (`hermes cron create`): correrlo otra vez —con `--tickets` o sin él—
  deja los jobs viejos agendados y suma los nuevos, y cada ticket corre dos veces. Lo que
  corresponde es regenerar en seco (`--dry-run --tickets <los ids, en orden> --salida <dir>`) y
  editar los jobs que ya existen con su prompt nuevo:
  `hermes -p <perfil> cron edit <job_id> --prompt "$(cat <dir>/eslabon-<n>-<ID>.txt)"`. Antes
  de editar, respaldá el `jobs.json` del perfil y los prompts agendados; al terminar, compará
  campo por campo que el horario, el `deliver`, las `skills`, el `workdir` y el
  `attach_to_session` quedaron iguales y que **sólo** cambió el prompt. Los avisos de arranque
  no se tocan. Y copiá los prompts nuevos sobre la copia del proyecto (`.valmen/programar/`) o
  quedan describiendo una tanda que ya no es la agendada.
- De qué sale cada dato: el nombre del proyecto y los comandos de prueba de
  `.valmen/config.yaml`; el servidor MCP del perfil; la ruta del ticket y la de la feature
  del registro; el resumen, del título y de los `R-*` que el ticket cita. Lo que no se puede
  derivar va por bandera (`--autorizacion`, `--skills`, `--deliver`).
- **`--implementador`**: `sesion` cuando el código lo escribe la sesión con TDD (el caso de
  un repositorio de tests propios); `opencode` cuando el proyecto implementa con su propio
  ejecutor.
- **`--sin-aviso`** deja la tanda sin aviso de arranque: se usa cuando el PO ya está mirando
  la corrida, no por comodidad. La forma por defecto crea los dos jobs por eslabón.
- **El `attach_to_session` se pone después, con `cronjob_manage`.** El CLI de Hermes todavía
  no tiene bandera para eso —`cron create` y `cron edit` no lo aceptan—, así que el paso que
  sigue al programador es `cronjob_manage` `action='update'` con `attach_to_session: true`
  sobre cada job de trabajo. Sin eso, la respuesta del PO al mensaje de cierre abre una
  sesión nueva en vez de continuar la del eslabón, y el que adelanta el siguiente eslabón ya
  no tiene el brief en contexto.

## Qué se verifica después

```bash
hermes -p <perfil> cron list      # los jobs, su hora, su deliver, su workdir y sus skills
hermes -p <perfil> cron doctor    # salud de los jobs
```

Y se comprueba en el `jobs.json` del perfil que **cada job cita un solo ticket**: si un
prompt nombra dos, la sesión va a trabajar dos y el costeo se rompe. Por cada eslabón tienen
que quedar **dos** jobs —el del trabajo y su aviso `aviso-<nombre>` tres minutos antes—, y el
job de trabajo con `attach_to_session`.

El aviso se prueba antes de esa hora, no en la hora: correrlo a mano en seco —con la copia
que dejó el `--dry-run`— dice si el enlace sale con la IP de la máquina y si Mission Control
queda sirviendo fuera de loopback (`lsof -nP -iTCP:<puerto> -sTCP:LISTEN` debe mostrar `*:`).
Un aviso que nunca se probó falla justo cuando el PO lo está esperando.

## Al pulirla

La plantilla es el artefacto a mejorar: si un eslabón tropieza siempre en el mismo punto,
la corrección va **en la plantilla**, no en el prompt de ese job —así el arreglo llega a la
próxima tanda y a los otros proyectos—. Un marcador nuevo necesita su reemplazo en el
script; el script falla si queda un marcador sin rellenar, a propósito.
