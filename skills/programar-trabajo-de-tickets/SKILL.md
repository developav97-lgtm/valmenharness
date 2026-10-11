---
name: programar-trabajo-de-tickets
description: Usar cuando haya que dejar agendado el trabajo de varios tickets para que corran solos, o cuando se revise cómo se programó. Cubre el orden, las guardas, la cadencia, el aviso de arranque con la pantalla del ticket, la autorización y el costeo por sesión.
version: 1.2.0
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
ticket para seguirlo desde el celular. Son dos jobs por eslabón: un job entrega sólo su
respuesta final, así que el aviso de arranque es un `no_agent` tres minutos antes, que no
gasta modelo. El script asegura que Mission Control sirva y abra desde el celular, comprueba
el build y arma el enlace una sola vez; la sesión lo reusa con `--enlace`, y si la pantalla
no sirve lo dice en vez de inventar una URL. Los tres pasos y la franja de puertos están en
`referencias/aviso-de-arranque.md`.

## Al cerrar: el enlace y el siguiente eslabón

La entrega de un eslabón termina con dos líneas más, y las dos son parte del estándar:

1. **El enlace de la pantalla del ticket**, para abrirlo desde el celular.
2. **Si queda otro eslabón de la tanda por correr**, se nombra con su hora y su ticket y se
   ofrece adelantarlo. No lo adelanta: la orden la da el PO.

Cuando el PO responde a ese hilo (el job de trabajo se crea con `attach_to_session`), se corre `cronjob_manage` `action='update'` con `schedule='in 5m'` sobre el job
que él nombre. Ese job trabaja su propio ticket en su propia sesión: no se trabaja acá.

## Por qué una sesión por ticket

Un job de cron crea su propia sesión (`cron_<job>_<fecha>`) con su fila de costo. Dos
tickets en la misma sesión comparten esa fila y el registro termina con dos tickets cuyo
gasto es el mismo número, que no es el de ninguno de los dos. Un ticket, un job, una
sesión: es lo que hace que el consumo sea un dato y no un reparto a ojo.

Corolario: **el prompt de un eslabón no encadena a los demás creando jobs**, porque la
tanda entera ya está agendada. Si el PO pide seguir con otro ticket, ahí sí se crea el job
de ese ticket —sesión nueva— y se le dice por qué no se trabaja en la que ya está abierta.

## El orden, que no se escribe a mano

El orden sale del `tickets.yaml` de la feature:

1. Se recorre en el orden del archivo (sprint y luego posición).
2. Es elegible el ticket que está en `intake` y cuyas dependencias están **todas** en
   `closed`, contando como cerradas las que esta misma tanda va a cerrar antes de su turno.
3. Se saltean los tipos que piden autorización aparte (`SYNC`, `SECURITY`, `MIGRATION`) y
   cualquier ticket con impacto crítico: eso no se hereda de la autorización de la tanda,
   se pide. El salteado se dice en la entrega, con el motivo.

El script lo calcula: escribir la lista a mano es equivocarse.

## La cadencia y los topes

- Cada dos horas es una cadencia razonable para tickets del mismo repositorio: deja aire
  para que el anterior termine.
- **Tope de cinco eslabones por día y nada después de las 20:00** hora del PO. Si el PO pide
  horas que cruzan el tope, se programan igual —es su palabra, no una excepción silenciosa—
  y se le dice en la entrega que la tanda pasa de las 20:00.
- Un eslabón que arranca tarde entra por `catch_up_missed`, pero **la máquina tiene que
  estar despierta**: el planificador es un proceso del host.

## La autorización, citada

El prompt lleva la autorización del PO **en sus palabras**, con la fecha, y el alcance
escrito al lado: qué habilita (aprobar la compuerta de análisis, la del plan y el QA) y qué
no (commit, push, PR, tag ni despliegue). Si el PO delega el QA, el cierre se registra como
**aprobación delegada** citando su frase; nunca se escribe como palabras suyas algo que no
dijo.

La aprobación delegada de una compuerta **se registra, no se escribe sólo en prosa**, con
`valmen gate-decide`; sin ese registro el recibo queda en blanco y no se puede re-decidir
después. El comando y el porqué están en `referencias/autorizacion-registrada.md`.

## Cómo se corre

Con `scripts/programar-tickets.mjs` y las banderas de `referencias/como-se-corre.md`.

- **`--dry-run` primero, siempre**: escribe los prompts y los avisos en `--salida` sin crear
  nada, y se leen antes de agendar.
- **A una tanda ya agendada no se le aplica la forma nueva volviéndola a programar.** El
  script **crea** jobs: correrlo otra vez deja los viejos y suma los nuevos, y cada ticket
  corre dos veces. Se regenera en seco y se edita el prompt de los jobs existentes.
- **`--implementador`** es `sesion` (TDD en la sesión) u `opencode`; **`--sin-aviso`** sólo
  cuando el PO ya está mirando la corrida.
- El `attach_to_session` se pone después, con `cronjob_manage`: el CLI de Hermes no lo acepta.

## Qué se verifica después

```bash
hermes -p <perfil> cron list      # los jobs, su hora, su deliver, su workdir y sus skills
hermes -p <perfil> cron doctor    # salud de los jobs
```

Y se comprueba en el `jobs.json` del perfil que **cada job cita un solo ticket**: si un
prompt nombra dos, la sesión va a trabajar dos y el costeo se rompe. Por cada eslabón tienen
que quedar **dos** jobs —el del trabajo y su aviso `aviso-<nombre>` tres minutos antes—, y el
job de trabajo con `attach_to_session`.

El aviso se prueba antes de su hora, no en ella; cómo, en `referencias/aviso-de-arranque.md`.

## Al pulirla

La plantilla es el artefacto a mejorar: si un eslabón tropieza siempre en el mismo punto,
la corrección va **en la plantilla**, no en el prompt de ese job —así el arreglo llega a la
próxima tanda y a los otros proyectos—. Un marcador nuevo necesita su reemplazo en el
script; el script falla si queda un marcador sin rellenar, a propósito.
