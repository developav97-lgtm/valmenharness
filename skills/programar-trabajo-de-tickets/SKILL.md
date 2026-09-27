---
name: programar-trabajo-de-tickets
description: Usar cuando haya que dejar agendado el trabajo de varios tickets para que corran solos, o cuando se revise cómo se programó. Cubre el orden, las guardas, la cadencia, la autorización y el costeo por sesión.
version: 1.0.0
origen: valmen
---

# Programar el trabajo de los tickets

Dejar agendado el trabajo de varios tickets de una feature para que arranquen solos, en el
orden del grafo y **cada uno en su propia sesión**. La forma se ejecuta con
`scripts/programar-tickets.mjs` del harness, que rellena la plantilla
`templates/programar/prompt-eslabon.md`.

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
  existe porque cada eslabón gasta sin que nadie mire.
- Un eslabón que arranca tarde entra por `catch_up_missed`, pero **la máquina tiene que
  estar despierta**: el planificador es un proceso del host.

## La autorización, citada

El prompt lleva la autorización del PO **en sus palabras**, con la fecha, y el alcance
escrito al lado: qué habilita (aprobar la compuerta de análisis, la del plan y el QA) y qué
no (commit, push, PR, tag ni despliegue). Si el PO delega el QA, el cierre se registra como
**aprobación delegada** citando su frase; nunca se escribe como palabras suyas algo que no
dijo.

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
  [--permitir-criticos] [--dry-run] [--salida <dir>]
```

- **`--dry-run` primero, siempre.** Escribe los prompts en `--salida` y muestra la tabla
  sin crear nada. Se leen los prompts antes de agendar.
- De qué sale cada dato: el nombre del proyecto y los comandos de prueba de
  `.valmen/config.yaml`; el servidor MCP del perfil; la ruta del ticket y la de la feature
  del registro; el resumen, del título y de los `R-*` que el ticket cita. Lo que no se puede
  derivar va por bandera (`--autorizacion`, `--skills`, `--deliver`).
- **`--implementador`**: `sesion` cuando el código lo escribe la sesión con TDD (el caso de
  un repositorio de tests propios); `opencode` cuando el proyecto implementa con su propio
  ejecutor.

## Qué se verifica después

```bash
hermes -p <perfil> cron list      # el job, su hora, su deliver, su workdir y sus skills
hermes -p <perfil> cron doctor    # salud de los jobs
```

Y se comprueba en el `jobs.json` del perfil que **cada job cita un solo ticket**: si un
prompt nombra dos, la sesión va a trabajar dos y el costeo se rompe.

## Al pulirla

La plantilla es el artefacto a mejorar: si un eslabón tropieza siempre en el mismo punto,
la corrección va **en la plantilla**, no en el prompt de ese job —así el arreglo llega a la
próxima tanda y a los otros proyectos—. Un marcador nuevo necesita su reemplazo en el
script; el script falla si queda un marcador sin rellenar, a propósito.
