---
schema_version: 2
id: CHORE-CLI-RETIRO-DISPARADOR-JORNADA-20261008
title: Retirar el disparador por launchd y el bucle desatendido de la jornada
type: CHORE
module: CLI
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# CHORE-CLI-RETIRO-DISPARADOR-JORNADA-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: retirar lo que la corrida orquestada reemplaza: el disparador por launchd y Hermes (`journey install-trigger`, journey-trigger.ts), el avance desatendido `journey advance` como bucle, la caducidad de la jornada y `clear-stop`, y el bloqueo por árbol sucio, que pasa a ser un aviso. Se conserva lo reutilizable: journey plan, el roadmap, --max, la preparación manual de planes, los límites, la reserva de capacidad y los avisos. Actualiza la documentación y las pruebas que dependen de lo retirado. Va después de que la skill y los comandos nuevos existan.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: retirar lo que la corrida orquestada en sesión reemplaza: el disparador periódico (`journey install-trigger` y `packages/cli/src/journey-trigger.ts`, con el plist de launchd y el job de Hermes), el avance desatendido de la ejecución (`journey advance` sin fase y con `--fase ejecucion`, y el despacho que lo sustenta en `packages/engine/src/journey-dispatch.ts`), el bloqueo del despacho por árbol sucio (pasa a ser un aviso que se calcula al consultar) y la clave `execution.dispatcher`. Se conserva `journey plan`, la hoja de ruta, `--max`, la preparación manual de planes (`journey advance --fase preparacion`), los topes, la reserva de capacidad, `journey clear-stop` y los avisos del vigilante. Fuera de alcance: todo lo que toca la seguridad de la aprobación o de la autorización (`plan-approve`, `approve-plan`, `qa-authorize`, `packages/engine/src/plan-approval.ts`, `packages/engine/src/plan-approval-batch.ts` y la marca `VALMEN_UNATTENDED`), la política `autonomous:` y `valmen run`.
- Usuario o rol afectado: el PO, que ya no programa la jornada con una tarea periódica sino que abre una sesión de Claude Code que orquesta; el orquestador y los subagentes, que dejan de compartir el checkout principal con un proceso desatendido; quien tenga instalada la tarea de launchd o el job de Hermes, que sigue disparando un comando que ahora responde con el aviso de retiro.
- Comportamiento actual: `valmen journey install-trigger` imprime o escribe el plist de launchd (`com.valmen.jornada.<proyecto>`) o el script del job de Hermes; ese disparador corre `valmen journey advance`, que en cada pasada despacha un ticket aprobado con `claude --print` en el checkout principal (un solo carril) y prepara otro en `intake`. Si el árbol de trabajo tiene archivos ajenos, el despacho no arranca, registra la pasada sucia y el vigilante avisa tras dos pasadas.
- Comportamiento esperado: `journey install-trigger` y el avance de ejecución responden en español que se retiraron, explican que la jornada se ejecuta ahora desde una sesión orquestadora (`journey next --wave`, `journey brief --id`, la skill de la corrida) y no escriben nada; `journey advance --fase preparacion` sigue preparando planes a mano; un árbol sucio ya no impide nada, se avisa al consultar la ola; lo conservado se comporta igual, y una prueba lo demuestra.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es un retiro, no un defecto. El propio documento de la propuesta lo declara en `docs/propuesta-corrida-orquestada.md:100-104` (qué se retira) y `:140-143` (ticket 7); el pedido del PO fija lo que se retira y lo que se conserva. El disparador nace en `packages/cli/src/commands.ts:3686` (`journeyInstallTriggerCommand`) y `packages/cli/src/journey-trigger.ts:34` (plist) y `:97` (job de Hermes); invoca `journeyAdvanceCommand` (`packages/cli/src/commands.ts:2910`) que llama `avanzarJornada` (`packages/engine/src/journey-advance.ts:115`), cuya fase de ejecución entra por `dispatchJourney` (`packages/engine/src/journey-dispatch.ts:81`), que compone selección, topes (`:104`), rama de trabajo, árbol limpio (`:131-150`), reserva de capacidad (`:196`) y `runAutonomous` (`:217`).
- Hipótesis pendientes: ninguna sobre el mapa de consumidores. Dos puntos del pedido chocan con lo que el código ya usa y se resuelven como decisiones D1 y D2 de abajo; el PO puede cambiarlas al aprobar.
- Consumidores afectados, uno por uno (búsqueda de cada símbolo en `packages`, `tests`, `docs`, `skills`, `templates` y `.valmen`):
  1. `journey install-trigger` y `packages/cli/src/journey-trigger.ts`: lo importan `packages/cli/src/commands.ts:234` y lo despacha `packages/cli/src/main.ts:1998`, con ayuda en `main.ts:295`. Lo prueban `tests/despachador-hermes.test.ts` (todo el archivo) y el bloque «el disparador de launchd» de `tests/avance-jornada.test.ts:311`.
  2. `readJourneyDispatcher` y `JourneyDispatcher` en `packages/adapter/src/config.ts:1140-1155`: solo los usa `despachadorDelProyecto` (`packages/cli/src/commands.ts:3739`), que solo usa `install-trigger`. La clave `execution.dispatcher: machine` está en `.valmen/config.yaml:61`. No hay plantilla ni documentación que la declare.
  3. `journey advance` y `packages/engine/src/journey-advance.ts`: lo usan `journeyAdvanceCommand` (`commands.ts:2910`), `main.ts:1996`, `packages/engine/src/journey-plan.ts:17` (importa `jornadaVigente` y `ticketsPendientesDeJornada`), `packages/engine/src/journey-passes.ts:11` (tipos) y las pruebas `tests/avance-jornada.test.ts`, `tests/jornada-ejecucion.test.ts`, `tests/jornada-topes.test.ts`, `tests/jornada-preparacion.test.ts` e `tests/integracion-autonoma.test.ts`. No existe una herramienta MCP de avance: `packages/mcp/src/tools.ts` solo tiene `armar_jornada` (`:370`) y `ver_jornadas` (`:338`), y `packages/server/src/hermes.ts:182-191` solo las lista como permitidas.
  4. `dispatchJourney` en `packages/engine/src/journey-dispatch.ts`: su único llamador de producción es `avanzarEjecucion` (`journey-advance.ts:210`); lo prueban `tests/journey-dispatch.test.ts`. `dispatchEventId` (`journey-dispatch.ts:258`) lo usa también la preparación (`packages/engine/src/journey-preparation.ts:20` y `:364`) y debe sobrevivir con el mismo digest, porque los eventos históricos lo llevan.
  5. Caducidad de la jornada (BUGFIX-CLI-JORNADA-CADUCA-MEDIANOCHE-20261007): vive en `jornadaVigente` y `jornadaDelDia` (`journey-advance.ts:96-125`), en la herencia de pendientes de `armarJornada` (`journey-plan.ts`, usada por `journey plan` y por `armar_jornada`) y en el aviso `jornada-terminada` del vigilante (`packages/cli/src/hermes.ts:833-849`). No es del disparador: lo necesitan `journey plan` y el comando de la ola (el ticket FEATURE-ENGINE-JORNADA-OLA-20261008 usa `jornadaVigente`). Se conserva (D2).
  6. `journey clear-stop`: `journeyClearStopCommand` (`commands.ts:3658`) llama `liberarParada` (`packages/engine/src/autonomous-stops.ts:142`). Las paradas las escribe la preparación (`journey-preparation.ts:148`), que la preparación manual conserva, y las lee la preparación (`:290`), la hoja de ruta (`journey-roadmap.ts:64`), el parte del vigilante (`hermes.ts:1369`) y la ola (la selección de FEATURE-ENGINE-JORNADA-OLA-20261008 trata una parada liberada como ofrecible de nuevo). Lo prueba `tests/jornada-topes.test.ts:190`. Se conserva (D1).
  7. Bloqueo por árbol sucio: `registrarPasadaDeArbol` y las lecturas de `packages/engine/src/journey-dirty-tree.ts`, llamadas solo desde `journey-dispatch.ts:28` y `:143-150`; el vigilante las lee en `packages/cli/src/hermes.ts:822-831` (tipo `arbol-sucio`, `:726`) y las envía en `:1022-1046` con `renderDirtyTreeNotification` (`packages/engine/src/notify.ts:510-525`) y `arbolesSuciosAvisados` (`packages/engine/src/approval.ts:515`); el tipo `JourneyDirtyTreeNotice` (`approval.ts:184`) forma parte del lector del registro de avisos. Lo prueban `tests/vigilante-jornada.test.ts:103` y `tests/integracion-autonoma.test.ts:200-290`. La comprobación de árbol de `runAutonomous` (`packages/engine/src/autonomous-run.ts`, vía `asegurarRamaDeTrabajo`) pertenece a `valmen run` y no se toca.
  8. Configuración `autonomous:` (`.valmen/config.yaml:64`, lector `packages/adapter/src/config.ts:825`): sigue vigente, porque la leen `autonomousConfig` (`packages/engine/src/discovery.ts`), la preparación, los topes (`journey-limits.ts`), la reserva de capacidad (`machine-capacity.ts`), `journey-plan.ts`, `journey-phases.ts`, `journey-selection.ts` y `valmen run`. No se borra ninguna de sus claves.
  9. Registro de pasadas: `registrarPasada` y `leerPasadas` (`packages/engine/src/journey-passes.ts`) lo alimenta el avance y lo lee la hoja de ruta (`journey-roadmap.ts:65`), que sirve `GET /api/journeys` (`packages/server/src/server.ts:998`) y `valmen execution journeys` (`packages/cli/src/execution.ts:54`). La vista Jornadas (`packages/server/web/index.html:5787-5793`) pinta «Próxima pasada (estimada)», que supone una cadencia del disparador; lo prueban `tests/jornadas-progreso-pantalla.test.ts:70-72`, `tests/journey-passes.test.ts` y `tests/journey-roadmap.test.ts`.
  10. Enrutamiento por fase: cuatro roles declaran `consumer: "valmen journey advance"` (`packages/adapter/src/routing.ts:155-170`); lo afirman `tests/jornada-ejecucion.test.ts:165` y `tests/routing.test.ts:136`.
  11. Texto de `armar_jornada`: `packages/mcp/src/tools.ts:2566` dice «despacha con el disparador»; lo recorren `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts`.
  12. Avisos del vigilante que se conservan: parada autónoma (`hermes.ts:806`), jornada terminada (`:833`), listo para pruebas y cierre por política (`:850-889`) y el plan del día; el aviso `autonomous-stop-notice` también lo emite `avisoDeParada` (`journey-advance.ts:60`), que la preparación manual sigue usando.
  13. Índice del motor: `packages/engine/src/index.ts` reexporta `journey-dispatch.js` (`:28`) y `journey-dirty-tree.js` (`:29`) con `export *`; al borrar el primero hay que quitar su línea y comprobar con búsqueda que `@valmen/cli`, `@valmen/mcp` y `@valmen/server` no importan ninguno de los símbolos borrados. `packages/adapter/src/index.ts` reexporta `config.js` y se revisa igual para `readJourneyDispatcher`.
  14. Documentación: una búsqueda de `install-trigger`, `journey advance`, `launchd`, `clear-stop` y `dispatcher` en `docs`, `skills`, `.valmen/skills`, `templates`, `README.md` y `AGENTS.md` solo encuentra la ayuda de `packages/cli/src/main.ts` y la propuesta; los partes diarios son historia y no se reescriben. `AGENTS.md` y las skills no nombran el disparador, así que no hay `valmen sync` que regenerar.
- Archivos y flujo investigados: los de la lista anterior, más `packages/engine/src/journey-selection.ts` (lo reutiliza la ola; se conserva entero), `packages/engine/src/machine-capacity.ts` (la reserva que usa el ticket de integración por worktree) y `packages/engine/src/integration-commit.ts` (`estadoDelArbolDeTrabajo`, que el aviso reutiliza). `buscar_memoria` («jornada launchd install-trigger journey advance caducidad clear-stop») solo devolvió AP-006 y AP-007, sin relación con este retiro.
- Dependencias de orden (todas deben estar hechas antes de implementar): FEATURE-ENGINE-JORNADA-OLA-20261008 (`journey next --wave` y `journey brief`), FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008 (crear, integrar y quitar el worktree), FEATURE-ENGINE-JORNADA-HANDOFF-20261008 (el parte de pruebas) y FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008 (la skill que reemplaza al avance). Si alguna falta, el mensaje de retiro apuntaría a un comando inexistente y quien dependa de la jornada se queda sin camino: el paso 1 lo comprueba y detiene el trabajo. Este ticket modifica además un archivo que esos tickets tocan (`packages/cli/src/main.ts`, el mensaje «journey admite» y la ayuda), así que se parte de la rama ya integrada.
- Riesgos y compatibilidad: (1) una tarea de launchd o un job de Hermes ya instalados siguen invocando `journey advance`; pasan a recibir el aviso de retiro con salida 2 cada intervalo hasta que una persona los desinstale (el harness nunca ejecuta `launchctl` ni `hermes`); el paso de entrega lista los comandos exactos. (2) Borrar `dispatchJourney` obliga a migrar las pruebas que ejercitaban a `runAutonomous` a través del avance: se migran al ejecutor directo para no perder la cobertura de topes, verificación y parada, y las que solo probaban el bucle se borran. (3) Los registros históricos (`.valmen/journeys/arbol-sucio.jsonl`, `pasadas.jsonl`, líneas `journey-dirty-tree-notice` de `approvals.jsonl`) son append-only: no se tocan y el lector sigue leyendo el tipo de aviso. (4) La clave `execution.dispatcher` de un `config.yaml` existente queda sin efecto y sin error: el lector se borra, nadie la valida. (5) `AvanceDeFase.fase` conserva el valor `ejecucion` solo para leer pasadas antiguas. (6) Nada de lo que toca la aprobación o la autorización cambia: los controles de `tests/jornada-sin-autoaprobacion.test.ts` deben seguir en verde sin modificarse.
- Impactos de sync, migración, Docker o despliegue: ninguno de sync, migración ni contenedores. En despliegue solo existe la desinstalación manual de la tarea de launchd o del job de Hermes que una persona instaló; no es parte del código y la hace una persona.
- Decisiones de diseño que el PO puede cambiar al aprobar:
  - D1: `journey clear-stop` se conserva, aunque el pedido lo nombra entre lo retirado. Sin él una parada de la preparación manual no se libera nunca y la ola de la corrida (que reutiliza las paradas) no podría volver a ofrecer el ticket. Si el PO prefiere retirarlo, el costo es no tener cómo liberar una parada.
  - D2: la caducidad de la jornada se conserva (`jornadaVigente`, herencia de pendientes y aviso de jornada terminada): el pedido la nombra, pero `journey plan` y la ola la usan y no dependen del disparador. Nada de ese bloque se retira; queda dicho aquí para que el PO lo vea.
  - D3: `journey advance --fase preparacion` sigue funcionando porque el pedido conserva «la preparación manual de planes»; `install-trigger`, `advance` sin fase y `advance --fase ejecucion` se DEPRECAN con un mensaje y salida 2 en vez de borrar el subcomando, para que la tarea ya instalada no falle en silencio.
  - D4: el aviso de árbol sucio se calcula al consultar la ola, no se registra por pasada; se borra el registro de pasadas sucias y el aviso del vigilante.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Qué se BORRA: `packages/cli/src/journey-trigger.ts`; `journeyInstallTriggerCommand` y `despachadorDelProyecto` de `packages/cli/src/commands.ts`; `readJourneyDispatcher` y `JourneyDispatcher` de `packages/adapter/src/config.ts`; la línea `dispatcher: machine` de `.valmen/config.yaml`; `dispatchJourney` y sus tipos de `packages/engine/src/journey-dispatch.ts` (el archivo desaparece, `dispatchEventId` se muda a la preparación); `avanzarEjecucion` y la opción `execute` de `journey-advance.ts`; el registro de pasadas sucias de `journey-dirty-tree.ts`, el tipo `arbol-sucio` del vigilante, `renderDirtyTreeNotification` y `arbolesSuciosAvisados`; `tests/despachador-hermes.test.ts` y `tests/journey-dispatch.test.ts`.
- Qué se DEPRECA con mensaje en español: `journey install-trigger`, `journey advance` sin fase y `journey advance --fase ejecucion` (salida 2, no escriben nada); el valor `ejecucion` de `AvanceDeFase.fase` queda solo para leer pasadas antiguas; el tipo `JourneyDirtyTreeNotice` queda solo para leer el registro de avisos.
- Qué se CONSERVA y se prueba: `journey plan` y `armar_jornada` con `--max` y herencia de pendientes; la hoja de ruta; `journey advance --fase preparacion`; `journey clear-stop` y las paradas; `jornadaVigente`; los topes (`journey-limits.ts`); la reserva de capacidad (`machine-capacity.ts`); `journey-selection.ts`; los avisos del vigilante; la política `autonomous:`; `valmen run`.
- Pasos ordenados:
  1. Comprobar las dependencias antes de tocar nada: `git log --oneline` en la rama debe contener los commits de OLA, INTEGRACION-WORKTREE, HANDOFF y la skill de la corrida, y `valmen journey next --help`, `valmen journey brief` y `valmen journey handoff` deben existir. Si falta alguno, detenerse y avisar al PO. (C1, C2)
  2. Crear tests/retiro-disparador.test.ts en rojo, sobre un registro temporal con `bindings.local.yaml` como en `tests/jornada-diaria.test.ts` y un repositorio git temporal como en `tests/integracion-autonoma.test.ts`: un caso por criterio y un control por cada barrera (preparación que sigue, parada que se libera, tope que frena, capacidad que reserva, aviso que sigue saliendo, aprobación que sigue negada). Correr `npx vitest run tests/retiro-disparador.test.ts` y ver que falla por las razones esperadas. (C1 a C33)
  3. En `packages/cli/src/commands.ts` reemplazar el cuerpo de `journeyInstallTriggerCommand` por una respuesta fija de retiro con salida `EXIT_SCHEMA` que nombra `journey next --wave`, `journey brief --id` y la skill de la corrida, y borrar `despachadorDelProyecto` y los imports de `./journey-trigger.js`, `readJourneyDispatcher` y `JourneyDispatcher`. En `journeyAdvanceCommand` exigir `--fase preparacion`: sin fase o con `ejecucion` devolver el mismo tipo de respuesta de retiro, sin resolver el proyecto ni anexar pasada; con `preparacion` seguir como hoy. Borrar `packages/cli/src/journey-trigger.ts`. (C3, C4, C5, C6, C7)
  4. En `packages/cli/src/main.ts` reescribir la ayuda de `journey install-trigger` y `journey advance` para decir que están retiradas y qué usar, y dejar el mensaje «journey admite» con los subcomandos vivos (incluidos los que sumaron los tickets de la ola, el worktree y el parte). (C3, C8)
  5. En `packages/adapter/src/config.ts` borrar `readJourneyDispatcher` y `JourneyDispatcher`; en `.valmen/config.yaml` borrar la línea `dispatcher: machine`. Comprobar con una búsqueda que ningún otro archivo los nombra y que un `config.yaml` con `execution.dispatcher` sigue cargando. (C9, C10, C11)
  6. En `packages/engine/src/journey-advance.ts` quitar `avanzarEjecucion`, la opción `execute` y el recorrido de dos fases: `avanzarJornada` prepara solamente; conservar `jornadaDelDia`, `ticketsPendientesDeJornada`, `jornadaVigente`, `avisoDeParada` y `avisarParada`, y dejar `ejecucion` en `AvanceDeFase.fase` con un comentario de lectura histórica. Mudar `dispatchEventId` a `packages/engine/src/journey-preparation.ts` con el mismo digest, borrar `packages/engine/src/journey-dispatch.ts` y su línea en `packages/engine/src/index.ts`. (C12, C13, C14)
  7. Árbol sucio como aviso: en `packages/engine/src/journey-dirty-tree.ts` borrar el registro de pasadas y escribir `advertenciaDeArbolSucio(root, propias?)`, que reutiliza `estadoDelArbolDeTrabajo` de `packages/engine/src/integration-commit.ts`, no escribe nada y devuelve el texto del aviso (archivos ajenos y qué hacer) o `null`. Conectar ese aviso a la salida de `journey next --wave` y a la de `journey brief` en el CLI de la ola; el comando sigue siendo de solo lectura. (C15, C16, C17)
  8. Vigilante: en `packages/cli/src/hermes.ts` borrar el tipo `arbol-sucio` de `pendientesDeAvisar`, su lectura de pasadas sucias y su envío; en `packages/engine/src/notify.ts` borrar `renderDirtyTreeNotification`; en `packages/engine/src/approval.ts` borrar `arbolesSuciosAvisados` y dejar `JourneyDirtyTreeNotice` en el lector con un comentario de compatibilidad. Los avisos de parada, jornada terminada, pruebas listas y cierre por política no se tocan. (C18, C19, C20)
  9. Vista y textos: quitar de `packages/server/web/index.html` la línea «Próxima pasada» (queda «Última pasada»); cambiar `consumer` de los cuatro roles de `packages/adapter/src/routing.ts` a `valmen journey brief`; cambiar el `siguiente_paso` de `armar_jornada` en `packages/mcp/src/tools.ts` para apuntar a `journey next --wave`. (C21, C22, C23)
  10. Migrar las pruebas: borrar `tests/despachador-hermes.test.ts` y `tests/journey-dispatch.test.ts`; en `tests/avance-jornada.test.ts` quitar el bloque del plist y los casos de ejecución y dejar preparación, pasadas y jornada vigente; en `tests/jornada-ejecucion.test.ts`, `tests/jornada-topes.test.ts` y `tests/integracion-autonoma.test.ts` pasar a `runAutonomous` los casos de verificación, topes y parada que dependían del avance, y borrar los del bloqueo por árbol sucio; en `tests/vigilante-jornada.test.ts` reemplazar el bloque de árbol sucio por el control de que un `arbol-sucio.jsonl` histórico ya no produce aviso; actualizar `tests/jornadas-progreso-pantalla.test.ts`, `tests/routing.test.ts` y `tests/jornada-ejecucion.test.ts:165`. Ninguna prueba de las conservadas se borra para ponerla en verde. (C24, C25, C26, C27, C28, C29)
  11. Documentación: dejar en `docs/propuesta-corrida-orquestada.md` una nota breve de que el retiro se ejecutó con este ticket y qué se conservó (D1 a D4); la ayuda del CLI ya queda actualizada en el paso 4. (C30)
  12. Verificar: `npm run build`, `npx tsc --noEmit -p tsconfig.json` sin salida, `npx eslint` sobre los archivos tocados, las pruebas del paso 2 y la regresión de los archivos conservados (comandos en `## Pruebas`), y `valmen secrets`. (C31, C32)
  13. Entrega: dejar en `## Pruebas` el contrato (comandos, directorio, resultado esperado, validación manual y ambiente), marcar con `- [x]` los criterios verificados, registrar el consumo de IA y pasar el ticket a `awaiting_user_tests`. La validación manual lista, sin ejecutarlos, los comandos que el PO ejecuta en su máquina para desinstalar el disparador y comprobar que no queda activo: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.valmen.jornada.<proyecto>.plist` y `hermes cron remove valmen-jornada-<proyecto>`; y para comprobarlo, `launchctl list | grep com.valmen.jornada` y `hermes cron list | grep valmen-jornada`, que no deben devolver líneas. La confirmación del PO queda como resultado de la prueba manual, no como acción del agente. (C33)
- Dependencias: las cuatro del diagnóstico (ola, worktree, parte de pruebas, skill), en ese orden de integración; el paso 1 las verifica. No hay dependencia de sincronización ni de despliegue.
- Impactos declarados: ninguno de sincronización, migración ni contenedores; el despliegue se limita a la desinstalación manual del disparador, que hace una persona.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <sha>`. No hay datos que migrar: los registros históricos no se tocan, la clave `execution.dispatcher` solo se ignoraba y `.valmen/config.yaml` vuelve con la línea. Un disparador desinstalado a mano se reinstala con el comando `journey install-trigger` de la versión revertida. Si solo hay que recuperar el avance de ejecución, basta revertir los pasos 3 y 6 con sus pruebas.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Antes del retiro el CLI ya ofrece el subcomando `journey next --wave` al que apunta el aviso de retiro
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C2. La skill de la corrida orquestada existe en `.valmen/skills`
      <!-- verify: manual -->
- [x] C3. `journey install-trigger` responde en español que está retirado, nombra `journey next --wave` y sale con código 2
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C4. `journey install-trigger --write` no escribe ni el plist ni el script del job
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C5. `journey advance` sin fase responde con el aviso de retiro, sale con código 2 y no despacha ni anexa una pasada
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C6. `journey advance --fase ejecucion` responde con el mismo aviso de retiro y no despacha ni anexa una pasada
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C7. El archivo `packages/cli/src/journey-trigger.ts` ya no existe y ningún paquete exporta el renderizado del plist
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C8. La ayuda del CLI marca `install-trigger` y el avance de ejecución como retirados y apunta a `journey next --wave`
      <!-- test: npx vitest run tests/retiro-disparador.test.ts tests/cli.test.ts -->
- [x] C9. `@valmen/adapter` ya no exporta `readJourneyDispatcher`
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C10. Un `config.yaml` que todavía declara `execution.dispatcher: hermes` se carga sin error
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C11. El `.valmen/config.yaml` del repositorio ya no declara `dispatcher`
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C12. `@valmen/engine` ya no exporta `dispatchJourney` y el archivo `journey-dispatch.ts` no existe
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C13. `journey advance --fase preparacion` lleva un ticket de `intake` a `planned` sin registrar ninguna aprobación
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts tests/retiro-disparador.test.ts -->
- [x] C14. Pasada la medianoche UTC, `jornadaVigente` sigue eligiendo la jornada más reciente con tickets pendientes
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] C15. `advertenciaDeArbolSucio` devuelve un aviso que nombra los archivos ajenos cuando el árbol está sucio y `null` cuando está limpio
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C16. `advertenciaDeArbolSucio` no escribe ningún archivo del registro
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C17. `journey next --wave` con el árbol sucio imprime el aviso y sigue listando la ola
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C18. El vigilante no produce un aviso de árbol sucio aunque exista un `arbol-sucio.jsonl` histórico con dos pasadas sucias
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] C19. El vigilante sigue avisando una parada autónoma y una jornada terminada
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts tests/retiro-disparador.test.ts -->
- [x] C20. `readApprovalLog` sigue leyendo una línea histórica `journey-dirty-tree-notice` sin error
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C21. La vista Jornadas no muestra la próxima pasada estimada y sí muestra la última pasada
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts -->
- [x] C22. Los cuatro roles de fase del enrutamiento declaran `valmen journey brief` como consumidor
      <!-- test: npx vitest run tests/routing.test.ts tests/jornada-ejecucion.test.ts -->
- [x] C23. La respuesta de `armar_jornada` apunta a `journey next --wave` en vez de al disparador
      <!-- test: npx vitest run tests/jornada-diaria.test.ts tests/mcp-server.test.ts -->
- [x] C24. `journey plan` sigue respetando `--max` y heredando los pendientes de la jornada anterior
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] C25. La hoja de ruta sigue sirviéndose por `ver_jornadas`, `GET /api/journeys` y `valmen execution journeys`
      <!-- test: npx vitest run tests/journey-roadmap.test.ts tests/journeys-api.test.ts tests/execution-cli.test.ts tests/execution-mcp.test.ts -->
- [x] C26. `journey clear-stop` libera la parada de un ticket y la preparación vuelve a elegirlo
      <!-- test: npx vitest run tests/jornada-topes.test.ts -->
- [x] C27. Los topes de la política siguen frenando la preparación y lo dicen
      <!-- test: npx vitest run tests/jornada-topes.test.ts -->
- [x] C28. La reserva de capacidad compartida sigue limitando las sesiones simultáneas
      <!-- test: npx vitest run tests/machine-capacity.test.ts tests/journey-selection.test.ts -->
- [x] C29. Una sesión desatendida sigue sin poder registrar la aprobación de un plan ni de un ciclo de QA
      <!-- test: npx vitest run tests/jornada-sin-autoaprobacion.test.ts -->
- [x] C30. Ningún documento vigente ni skill instruye a usar `install-trigger` o el avance de ejecución
      <!-- test: npx vitest run tests/retiro-disparador.test.ts -->
- [x] C31. La comprobación de tipos del repositorio no produce salida
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C32. La construcción y el lint de los archivos tocados terminan sin errores
      <!-- verify: manual -->
- [x] C33. La entrega incluye los comandos exactos para desinstalar la tarea de launchd y el job de Hermes y el que comprueba que ninguno queda activo, para que el PO los ejecute
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Se implementó el plan aprobado paso por paso, sobre la rama que ya traía la ola, el worktree, el parte y la skill (paso 1: `journey next --wave`, `journey brief` y `journey handoff` existen en `packages/cli/src/main.ts` y la skill `corrida-orquestada` en `.valmen/skills`).

- Retirado (aviso en español, salida 2, no escribe nada): `journey install-trigger` y `journey advance` sin fase o con `--fase ejecucion` (`retiroDelDisparador` en `packages/cli/src/commands.ts`); se borró `packages/cli/src/journey-trigger.ts` y `despachadorDelProyecto`.
- Borrado: `readJourneyDispatcher` y `JourneyDispatcher` (`packages/adapter/src/config.ts`), la línea `dispatcher: machine` de `.valmen/config.yaml`, `packages/engine/src/journey-dispatch.ts` (`dispatchEventId` se mudó a `journey-preparation.ts` con el mismo digest), `avanzarEjecucion` y la opción `execute` de `journey-advance.ts` (`avanzarJornada` solo prepara), el registro de pasadas sucias, el tipo `arbol-sucio` del vigilante, `renderDirtyTreeNotification` y `arbolesSuciosAvisados`.
- Árbol sucio como aviso: `advertenciaDeArbolSucio(root, propias?)` en `packages/engine/src/journey-dirty-tree.ts` (solo lee); `journey next --wave` y `journey brief` lo imprimen al final de su salida sin escribir nada.
- Vista y textos: sin la línea «Próxima pasada» en `packages/server/web/index.html`; los cuatro roles de fase declaran `valmen journey brief`; `armar_jornada` apunta a `journey next --wave`.
- Conservado y probado: `journey plan`/`armar_jornada`, la hoja de ruta, `journey advance --fase preparacion`, `journey clear-stop`, `jornadaVigente`, los topes, la reserva de capacidad, `journey-selection`, los avisos del vigilante, la política `autonomous:` y `valmen run`. `JourneyDirtyTreeNotice` queda solo para leer el registro histórico de avisos.
- Pruebas migradas: se borraron `tests/despachador-hermes.test.ts` y `tests/journey-dispatch.test.ts` (solo probaban lo retirado); `tests/avance-jornada.test.ts` quedó en preparación, pasadas y jornada vigente; `tests/jornada-ejecucion.test.ts` e `tests/integracion-autonoma.test.ts` pasaron a `runAutonomous`; los topes de `tests/jornada-topes.test.ts` se ejercitan con la preparación (que los respeta) y la verificación y el tiempo máximo con `runAutonomous`; el bloqueo por árbol sucio y el registro de pasadas sucias se borraron; `tests/vigilante-jornada.test.ts` tiene el control del `arbol-sucio.jsonl` histórico; `tests/journey-ola-cli.test.ts` actualiza el mensaje «journey admite». Nueva `tests/retiro-disparador.test.ts` (20 casos).
- Nota para el PO: `tests/journey-ola-cli.test.ts` esperaba un mensaje «journey admite» sin `handoff` (ya desactualizado en la base); se alineó con el mensaje nuevo. `tests/routing.test.ts:808` tiene un error de lint preexistente (`_quitado`), ajeno al ticket.
- Documentación: nota de ejecución en `docs/propuesta-corrida-orquestada.md` (D1 a D4).
- Decisión de orden: `tests/retiro-disparador.test.ts` se escribió junto con el código y no antes (no se observó en rojo previamente).

## Pruebas

Contrato de entrega:

- Directorio: la raíz del repositorio o del worktree, con `node_modules` instalado y `npm run build` al día. Node 24. No hace falta red ni modelo.
- Comandos: `npx vitest run tests/retiro-disparador.test.ts` (todo en verde, 20 casos); regresión de lo conservado, `npx vitest run tests/avance-jornada.test.ts tests/jornada-preparacion.test.ts tests/jornada-topes.test.ts tests/jornada-diaria.test.ts tests/jornada-sin-autoaprobacion.test.ts tests/jornada-ejecucion.test.ts tests/integracion-autonoma.test.ts tests/vigilante-jornada.test.ts tests/machine-capacity.test.ts tests/journey-selection.test.ts tests/journey-roadmap.test.ts tests/journey-passes.test.ts tests/journeys-api.test.ts tests/jornadas-progreso-pantalla.test.ts tests/routing.test.ts tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts tests/execution-cli.test.ts tests/execution-mcp.test.ts tests/cli.test.ts tests/journey-ola-cli.test.ts` (22 archivos, 351 pruebas en verde); tipos, `npx tsc --noEmit -p tsconfig.json` sin salida; `npm run build` y `npx eslint` sobre los archivos tocados sin errores nuevos.
- Resultado esperado: todas las pruebas pasan; `tests/despachador-hermes.test.ts` y `tests/journey-dispatch.test.ts` ya no existen y ninguna otra prueba conservada se borró para ponerla en verde. La suite completa no se corrió en esta sesión (la corre quien integra).
- Validación manual del responsable, en un clon de laboratorio y no en el checkout real: `valmen journey install-trigger --project <id>` y `valmen journey advance --project <id>` responden con el aviso de retiro y salen con 2; `valmen journey advance --project <id> --fase preparacion` sigue funcionando; `valmen journey next --wave` con un archivo ajeno sin commitear imprime el aviso de árbol sucio. Después, en su máquina, desinstalar el disparador si aún existe (el harness no ejecuta ninguno de los dos): `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.valmen.jornada.<proyecto>.plist` y `hermes cron remove valmen-jornada-<proyecto>`. Comprobación de que no queda nada activo: `launchctl list | grep com.valmen.jornada` y `hermes cron list | grep valmen-jornada` no deben devolver líneas. La confirmación del PO queda como resultado de esta prueba manual.
- Ambiente: los tickets de la ola, el worktree, el parte y la skill ya integrados en la rama de partida.

## QA

```json
[]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "confidence": "low",
    "id": "CONSUMO-001"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-08",
    "at": "2026-10-08T13:44:13.106Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T15:11:27.184Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T15:12:12.913Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:35.829Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:e0435402658fc3e0ff3c51a51cc082592f51d86a5aff03c3dc7e08836740c9d2\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:36.423Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:e0435402658fc3e0ff3c51a51cc082592f51d86a5aff03c3dc7e08836740c9d2."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:36.423Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T16:13:29.797Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T16:26:23.404Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T16:26:23.717Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
