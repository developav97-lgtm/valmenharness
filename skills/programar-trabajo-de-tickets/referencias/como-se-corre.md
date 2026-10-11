# Cómo se corre el programador

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
