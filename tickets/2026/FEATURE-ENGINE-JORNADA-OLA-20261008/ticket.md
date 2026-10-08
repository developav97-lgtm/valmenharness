---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-OLA-20261008
title: Calcular la ola de tickets listos y el brief de cada uno para la corrida orquestada
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
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

# FEATURE-ENGINE-JORNADA-OLA-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: un comando de solo lectura `valmen journey next --wave [--concurrency N]` que, con la jornada armada por `journey plan` (orden, dependencias y --max), devuelve los tickets listos para despachar ahora: los que no están entregados ni en curso y cuyas dependencias ya están en awaiting_user_tests o cerradas, sin pasar de N (3 por defecto) contando los que ya están en curso; y `valmen journey brief --id <ID>` que imprime el brief autocontenido de un ticket para un subagente: ruta del worktree y rama sugeridas, el siguiente paso de `reanudar_ticket`, el modelo y esfuerzo del perfil de la fase (profiles.yaml), las skills a cargar, qué compuertas aplican, el contrato de entrega y lo que el subagente no puede hacer (SECURITY, aprobar lo que decide una persona, tocar el checkout principal, correr la suite completa). Reutiliza journey-roadmap.ts, journey-selection.ts y la resolución de perfiles; no escribe en el registro.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ningún elemento del pedido falta en el código: `--concurrency` es lo que este ticket agrega, `--wave` y `--id` son banderas del propio comando, y la resolución de perfiles ya existe (`fasesDeSesion` en `packages/adapter/src/routing.ts:1164`; hoy el proyecto no tiene `profiles.yaml`, solo `.valmen/routing.yaml` y los perfiles incorporados). Dos lecturas del pedido se adoptan como supuesto, ninguna bloquea el plan y cada una se cambia con una línea:

- SECURITY. El pedido pone «SECURITY» entre lo que el subagente no puede hacer. Supuesto adoptado: el subagente no aprueba nada de un ticket SECURITY (ni plan ni QA, ni siquiera con una autorización vigente) y el brief lo declara «solo persona»; la ola sigue ofreciendo el ticket, como pasó con los SECURITY de la sesión de SaiOpenCloud. Pregunta si es otra cosa: ¿el subagente no debe tomar tickets SECURITY de una ola?
- Rama y worktree sugeridos. Supuesto adoptado: `valmen/ticket-<nombre>` y `.claude/worktrees/ticket-<nombre>`, con `<nombre>` el id sin el tipo, el módulo ni la fecha final (FEATURE-ENGINE-JORNADA-OLA-20261008 da `ticket-jornada-ola`), que es como ya se llaman los worktrees de la corrida. Pregunta si es otra cosa: ¿prefieres el id completo, como dice la propuesta (`valmen/ticket-<id>`)? La ola reconoce ambas formas.
- Entregado. Supuesto adoptado: para una dependencia cuentan como entregadas `awaiting_user_tests`, `in_qa`, `qa_approved` y `closed`; el pedido nombra las dos extremas y las dos intermedias son estados posteriores a la entrega, de modo que excluirlas dejaría esperando a un dependiente mientras su dependencia se está probando. Pregunta si es otra cosa: ¿solo `awaiting_user_tests` y `closed`?

## Descripción funcional

- Alcance: dos subcomandos de solo lectura de `valmen journey`. `journey next --wave [--concurrency <n>] [--journey <id>] [--project <id>]` lee la jornada armada por `journey plan` (orden, dependencias y `--max` ya están en ella) y devuelve los tickets que se pueden despachar ahora a subagentes. `journey brief --id <ID> [--cliente <c>] [--project <id>]` imprime el brief autocontenido de un ticket. Los dos se apoyan en dos módulos nuevos del motor (la ola y el brief) y reutilizan el historial de jornadas, la selección y el roadmap de jornada, las paradas, `resume`/`next-step` y la resolución de perfiles de `@valmen/adapter`. Fuera de alcance: lanzar subagentes, crear o borrar worktrees, integrar ramas, aprobar planes y el parte de pruebas (skill de la corrida orquestada, integración por worktree y handoff: tickets 2 a 4 de la feature); el endpoint de actividad y la vista de agentes (tickets 5 y 6); retirar el disparador por launchd (ticket 7); una herramienta MCP para los dos comandos; cambiar `journey plan`, `journey advance`, las compuertas o la política de autonomía.
- Usuario o rol afectado: el orquestador (la sesión de Claude Code que el PO abre para ejecutar la jornada) y el PO que lee la ola; el subagente, que recibe el brief como su único contexto.
- Comportamiento actual: la jornada solo se recorre con `journey advance`, que despacha un único ticket en `approved` con todas sus dependencias en `closed` (`packages/engine/src/journey-selection.ts:96`, `:149` y `:166`) y lo ejecuta con `claude --print`. No existe una consulta que devuelva varios tickets listos con un tope de simultáneos, ni un brief por ticket: lo más parecido son los prompts de cinco a siete líneas `promptFor` (`packages/engine/src/autonomous-run.ts:180`) y `promptDePreparacion` (`packages/engine/src/journey-preparation.ts:72`), pensados para un ejecutor sin worktree. El mensaje de `journey` solo admite plan, advance, install-trigger, notify-plans y clear-stop (`packages/cli/src/main.ts:2004`).
- Comportamiento esperado: `journey next --wave` clasifica cada ticket de la jornada vigente (o de `--journey`) y devuelve cuatro listas. `listos`: tickets en `intake`, `analyzed`, `approved` o `changes_requested`, con todas sus dependencias (las de la jornada y las del grafo de la feature) entregadas, sin parada ni bloqueo y con la ventana abierta, en el orden de la jornada y hasta N menos los que ya están en curso. `enCurso`, con la señal que lo prueba: estado `in_progress`, un worktree de git de la rama del ticket o una actividad de ejecución abierta. `enEspera`, con el motivo de cada uno: dependencia (nombrando cuál y en qué estado), aprobación del plan, parada o bloqueo, ventana, cupo o ticket ausente. `entregados`. N vale 3 y se cambia con `--concurrency`. `journey brief --id` imprime la ruta y la rama sugeridas del worktree, el siguiente paso de `reanudar_ticket`, el modelo y el esfuerzo de la fase del lanzamiento, las skills a cargar, las compuertas que aplican con su evaluador, el contrato de entrega y lo que el subagente no puede hacer (aprobar lo que decide una persona, tocar el checkout principal, correr la suite completa y, en SECURITY, cualquier aprobación). Ninguno de los dos escribe en el registro.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad que falta, no un defecto con síntoma. El despacho de `journey` termina en cinco subcomandos (`packages/cli/src/main.ts:1992` a `:2004`) y en el motor ninguna función devuelve más de un candidato ni acepta un tope de simultáneos. `selectJourneyTickets` (`packages/engine/src/journey-selection.ts:63`) entrega solo un `manualCandidate` y un `dispatchCandidate` (`:96`), exige estado `approved` (`workflowReason`, `:166`) y dependencias `closed` (`:149`), y su cupo sale de `machine-capacity` para el despachador de launchd (`:102`); no sirve tal cual para una ola donde el subagente arranca en `intake` y las dependencias basta con que estén entregadas. Tampoco sirve el roadmap para saber qué está en curso: `faseDelTicket` (`packages/engine/src/journey-roadmap.ts:144`) toma como «en curso» cualquier actividad abierta de `journey-dispatch` o `journey-preparation` (`:154` a `:156`), y el registro real tiene un `started` de `journey-dispatch` sin cierre sobre FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 (cursor 49 de `.valmen/executions/events.jsonl`) que hoy está en `awaiting_user_tests`. Y con un worktree por ticket el estado del checkout principal no basta: el subagente escribe `ticket.md` en la rama de su worktree y el principal sigue en `intake` hasta que el orquestador integra, de modo que sin otra señal una segunda llamada a la ola volvería a ofrecer el mismo ticket y dos subagentes trabajarían sobre él. Esa señal sale de dos hechos comprobables: el worktree de git (`git worktree list --porcelain`) y la actividad de ejecución registrada (`readExecutionEvents`, `packages/engine/src/execution-events.ts:152`). El brief tampoco existe: `buildResumeContext` (`packages/engine/src/resume.ts:80`) ya calcula el siguiente paso (`computeNextStep`, `packages/engine/src/next-step.ts:151`) y los modelos por fase (`fasesDeSesion`, `packages/adapter/src/routing.ts:1164`), pero se imprime para una sesión interactiva, sin worktree, compuertas por fase, contrato de entrega ni prohibiciones.
- Ubicación del cambio: donde debe agregarse el comportamiento es junto a la selección y al roadmap, en dos módulos nuevos del motor (journey-wave.ts y journey-brief.ts, en el directorio de fuentes del motor, junto a journey-selection.ts), en el despacho de `journey` del CLI y en tres archivos de prueba nuevos (journey-wave.test.ts, journey-brief.test.ts y journey-ola-cli.test.ts, junto a tests/journey-selection.test.ts).
- Hipótesis pendientes: ninguna sobre la causa. Tres decisiones de diseño quedan declaradas como supuesto en la sección de supuestos (SECURITY, nombre de la rama y qué estados cuentan como entregados). La actividad de un subagente que murió sin cerrar se leería como en curso: la ola imprime la fuente y la hora de esa actividad para que se vea, y se libera anexando una actividad `failed` o `finished` con `registrar_actividad_ejecucion`; poner un umbral de antigüedad sería inventar un número.
- Consumidores afectados: `packages/engine/src/journey-selection.ts` se toca solo para extraer la regla de ventana a una función exportada y para exportar `compareTicket`, sin cambiar su comportamiento; su único consumidor es `dispatchJourney` (`packages/engine/src/journey-dispatch.ts:81`, que a su vez usa `journey advance`) y lo cubren `tests/journey-selection.test.ts` y `tests/journey-dispatch.test.ts`. `packages/engine/src/resume.ts` solo exporta `renderFases` (hoy privada, usada en `:188` por `renderResumeContext`); lo cubre `tests/next-step.test.ts`. `packages/cli/src/main.ts` gana `--concurrency` en `VALUE_OPTIONS` (`:580`), dos líneas en `USAGE` (`:153`, junto a `:293`) y dos ramas en el despacho de `journey`; todos los comandos pasan por `parseArgs`, pero la bandera nueva solo cambia la lectura de `--concurrency`, que ningún comando usa hoy, y `tests/cli.test.ts` compara la ayuda con `VALUE_OPTIONS`. `packages/engine/src/index.ts` agrega dos exportaciones; `@valmen/cli`, `@valmen/mcp` y `@valmen/server` importan ese índice, y una búsqueda de los nombres nuevos no encuentra colisiones. `journey-roadmap.ts`, `journeys.ts`, `autonomous-stops.ts`, `next-step.ts`, `routing.ts`, `journey plan`, `journey advance` y la vista Jornadas no cambian: la ola los lee.
- Archivos y flujo investigados: el historial de jornadas (`readJourneys`, `packages/engine/src/journeys.ts:143`, con `JourneyTicketInput` en `:46`) guarda orden, prioridad y dependencias de la jornada; `armarJornada` (`packages/engine/src/journey-plan.ts:88`) aplica `--max` al elegir los tickets (`:154`) y deja en `dependsOn` solo las dependencias que van en la jornada (`:167`), así que las demás hay que sumarlas del grafo de la feature con `dependenciasEnGrafos` (`packages/engine/src/materialize.ts:155`), como ya hace la selección (`journey-selection.ts:148`). La jornada vigente sale de `jornadaVigente` (`packages/engine/src/journey-advance.ts:112`). Las paradas activas salen de `paradasActivas` (`packages/engine/src/autonomous-stops.ts:131`) y, junto con `blocked`, `faseDelTicket` ya las convierte en «detenido» con su motivo (`journey-roadmap.ts:149` y `:153`); la ola lo reutiliza pasando la actividad en `null` a propósito. La ventana se evalúa con `evaluateJourneyWindow` (`packages/engine/src/journey-windows.ts`) dentro de `baseReasons` (`journey-selection.ts:153` a `:162`). La fase de cada estado la da `faseDelEstado` (`packages/adapter/src/routing.ts:1139`), el modelo y el esfuerzo salen de `rutasDelProyecto` (`:1359`), que es el único camino que lee perfil y enrutamiento. El comando se escribe como `journeyClearStopCommand` y `journeyPlanCommand` (`packages/cli/src/commands.ts:3658` y `:3758`), que resuelven el proyecto por su binding con `resolveAuthorizedProject` (`packages/engine/src/project-resolution.ts:36`). El modo pregunta de `withAccessMode` (`packages/core/src/permissions.ts:65`) niega la escritura del motor y se usa para garantizar que los dos comandos no escriben. Los worktrees que ya existen siguen el patrón `.claude/worktrees/ticket-<nombre>` con rama `valmen/ticket-<nombre>`. Memoria: `buscar_memoria` devolvió AP-003, AP-006 y AP-007, que tratan de compuertas y no de este flujo; no hay una causa raíz previa de la ola. Diseño de origen: `docs/propuesta-corrida-orquestada.md`, secciones 2.1 y 3.
- Riesgos y compatibilidad: (a) el riesgo central es ofrecer dos veces el mismo ticket; lo cubren las tres señales de «en curso» y un caso de control por cada una (un `finished`, la rama de otro ticket y el worktree del checkout principal no cuentan). (b) La ola y el brief no escriben: se corren dentro del modo pregunta y una prueba compara el árbol del registro antes y después. (c) Una rama sugerida puede coincidir con la de otro ticket que comparta nombre; el error cae del lado seguro (se retrasa un despacho, nunca se duplica). (d) La ola solo cuenta como en curso a los tickets de la jornada; el cupo no mira otros worktrees de la máquina. (e) Si git falla o el proyecto no es un repositorio, la señal del worktree se omite y la salida lo dice; si el historial de actividad está corrupto el comando falla en vez de adivinar. (f) Un proyecto sin `routing.yaml` ni perfiles usa los valores del sistema y el brief lo dice. (g) La compatibilidad hacia atrás es total: solo se agregan subcomandos, una bandera, exportaciones y dos extracciones sin cambio de comportamiento.
- Impactos de sync, migración, Docker o despliegue: ninguno; no hay datos persistidos nuevos ni cambia ningún contrato de sincronización, migración, contenedor o despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: los dos subcomandos, sus dos módulos del motor, las extracciones mínimas de reutilización y las pruebas. Exclusiones: las de la descripción funcional.
- Pasos ordenados:
  1. En `packages/engine/src/journey-selection.ts` extraer de `baseReasons` la regla de ventana a `razonesDeVentana(ticket, windows, at)` exportada, y exportar `compareTicket`; `baseReasons` la llama y no cambia de comportamiento. En `packages/engine/src/resume.ts` exportar `renderFases`. (C36)
  2. Crear `packages/engine/src/journey-wave.ts` (nuevo) con `slugDeTicket(id)`, `worktreeDelTicket(raiz, id)` (rama `valmen/ticket-<nombre>`, ruta `<raíz>/.claude/worktrees/ticket-<nombre>`), `esWorktreeDelTicket` (acepta el nombre corto y el id completo), `parsearWorktrees(texto)` y `listarWorktreesDeGit(raiz)` sobre `git worktree list --porcelain` (con aviso si falla), `calcularOlaDeJornada({ project, journeyId?, concurrency?, ahora?, worktrees? })` y `renderOlaDeJornada(ola)`. Orden de clasificación por ticket: ausente, entregado (`awaiting_user_tests`, `in_qa`, `qa_approved`, `closed`), detenido (parada de `paradasActivas` o `blocked`, con `faseDelTicket(estado, null, parada)`), en curso (`in_progress`, worktree o última actividad abierta de `readExecutionEvents`), `planned` espera aprobación, dependencias (las de `JourneyTicketInput.dependsOn` más `dependenciasEnGrafos`), ventana (`razonesDeVentana`) y listo; los listos se recortan a `concurrency` menos los en curso y el resto espera por cupo. La jornada sale de `jornadaVigente` o de `journeyId`; si no hay jornada vigente o el `journeyId` no existe, la función falla con un mensaje que manda a `valmen journey plan`. Un ticket `planned` se clasifica como espera de aprobación **antes** de mirar worktree o actividad, de modo que nunca cuenta como en curso. Los listos se ordenan con `compareTicket`, que compara `priority` y desempata por `order` de la jornada. `concurrency` vale 3 por defecto (constante `OLA_CONCURRENCIA_POR_DEFECTO`). Un ticket que espera por dependencias lleva el motivo `dependencia` con el id de cada dependencia no entregada y su estado en el registro (`ausente` si no existe). Solo se clasifican los tickets de `journey.tickets`: nada fuera de la jornada, como lo que `--max` dejó fuera al armarla, entra en ninguna lista. (C1–C18)
  3. Crear `packages/engine/src/journey-brief.ts` (nuevo) con `armarBriefDeSubagente({ project, ticketId, cliente? })` y `renderBriefDeSubagente(brief)`: worktree sugerido y comando `git worktree add` para el orquestador, `buildResumeContext` (siguiente paso con `renderNextStep`, modelos con `renderFases`, cliente `claude` por defecto), skills del paso, tabla de compuertas por fase con evaluador, contrato de entrega, prohibiciones (aprobar lo que decide una persona, tocar el checkout principal con su ruta, suite completa, push y merge, y el bloque SECURITY) y `lanzable` solo en `intake`, `analyzed`, `approved`, `in_progress` y `changes_requested`. Detalle por criterio: el modelo, el esfuerzo y el alias de subagente de la fase del estado salen de `FasesDeSesion` (si el proveedor de la fase no es `claude-code` el brief imprime el aviso de `FaseDeSesion.aviso` y ningún alias); la tabla de compuertas por fase es análisis → `valmen precheck analysis` y `valmen gate analysis --evaluator cascade`, plan → `valmen precheck plan` y `valmen gate plan --evaluator cascade`, implementación → `valmen gate qa-mechanical --evaluator command`, y sin compuertas para el subagente en verificación; el contrato de entrega lista comandos exactos, directorio, resultado esperado y validaciones manuales en la sección de pruebas del ticket, criterios con `- [x]`, `registrar_consumo_ia`, `valmen secrets`, commit solo en la rama del worktree con `git add` explícito y sin push ni merge; las prohibiciones incluyen correr `npx vitest run` sin archivos y mandan a correr solo los archivos de prueba del ticket; para un ticket SECURITY el brief declara que plan, QA y toda aprobación son solo de una persona, aun con autorización vigente; si `lanzable` es falso el brief trae `motivoNoLanzable`; un ticket inexistente lanza un error que nombra el id. (C19–C32)
  4. Exportar ambos módulos en `packages/engine/src/index.ts` con `export *`. (C36, C37)
  5. En `packages/cli/src/commands.ts` agregar `journeyNextCommand` y `journeyBriefCommand`, que corren dentro de `withAccessMode("ask", ...)`, aceptan `--project` o lo derivan del `project-id` de `<raíz>/.valmen/config.yaml`, validan `--concurrency` (entero de al menos 1; si no, salen con `EXIT_SCHEMA`) y `--cliente`, devuelven el error de la ola o del brief con su código (jornada ausente, ticket inexistente) y no llaman a `anexarPasada`. En `packages/cli/src/main.ts` agregar las ramas `next` y `brief` al despacho de `journey`, ampliar el mensaje de subcomandos, sumar `--concurrency` a `VALUE_OPTIONS` y las dos entradas de `USAGE`. (C12, C17, C33–C35)
  6. Crear `tests/journey-wave.test.ts`, `tests/journey-brief.test.ts` y `tests/journey-ola-cli.test.ts` sobre un registro temporal (bindings, `config.yaml`, tickets con `writeFixtureTicket`, jornada con `createJourney`, grafo con `tickets.yaml`, worktrees inyectados y un caso con repositorio git temporal): un caso por criterio y un caso de control por cada barrera: dependencia entregada deja pasar, `finished` y otra rama no cuentan, parada liberada vuelve a ofrecerse, FEATURE sin bloque SECURITY, y árbol del registro idéntico antes y después. (C1–C35)
  7. Correr `npx vitest run tests/journey-wave.test.ts tests/journey-brief.test.ts tests/journey-ola-cli.test.ts`, la regresión `npx vitest run tests/journey-selection.test.ts tests/journey-dispatch.test.ts tests/next-step.test.ts tests/cli.test.ts` y `npx tsc --noEmit -p tsconfig.json`; entregar el contrato de pruebas, registrar el consumo de IA y pasar el ticket a `awaiting_user_tests`. (C36, C37)
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores, y no toca autenticación ni despliegue.
- Rollback (obligatorio): revertir el commit del ticket con `git revert`; los dos módulos y los tres archivos de prueba son nuevos y los cambios en archivos existentes son exportaciones, ramas de despacho y una bandera que no alteran los comandos actuales. No se escribe ningún dato en el registro, así que no hay nada que migrar ni limpiar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. La ola ordena los listos por prioridad y posición de la jornada
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C2. Un ticket cuyas dependencias están en `awaiting_user_tests`, `in_qa`, `qa_approved` o `closed` sale como listo
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C3. Un ticket con una dependencia en otro estado, o ausente del registro, espera y el motivo nombra la dependencia y su estado
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C4. Una dependencia del grafo de la feature que no va en la jornada también deja esperando al ticket
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C5. Un ticket en `awaiting_user_tests`, `in_qa`, `qa_approved` o `closed` no se ofrece y figura entre los entregados
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C6. Un ticket en `in_progress` cuenta como en curso y no se ofrece
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C7. Un ticket con un worktree de git de su rama sugerida cuenta como en curso aunque el registro diga `intake`
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C8. Un ticket cuya última actividad de ejecución es `started`, `active` o `waiting` cuenta como en curso y la salida muestra su fuente y su hora
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C9. Una actividad `finished`, la rama de otro ticket y el worktree del checkout principal no cuentan como en curso
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C10. La ola no pasa de 3 tickets por defecto contando los que ya están en curso
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C11. `--concurrency N` cambia el tope de la ola
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C12. Un `--concurrency` que no es un entero de al menos 1 se rechaza con el código de error de esquema
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C13. Un ticket `planned` espera la aprobación del plan, no se ofrece y no cuenta como en curso
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C14. Un ticket bloqueado o con una parada activa no se ofrece y muestra su motivo, y vuelve a ofrecerse al liberar la parada
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C15. Un ticket cuya ventana no permite despachar no se ofrece
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C16. Un ticket que la jornada no contiene, por ejemplo el que `--max` dejó fuera, nunca se ofrece
      <!-- test: npx vitest run tests/journey-wave.test.ts -->
- [x] C17. Sin jornada vigente, o con un `--journey` inexistente, el comando falla y manda a `valmen journey plan`
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C18. `journey next --wave` deja idéntico todo el árbol del registro
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C19. El brief sugiere la ruta del worktree y la rama del ticket, y la ola reconoce esa rama como del ticket
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C20. El brief incluye el siguiente paso que `valmen resume` calcula para el estado del ticket
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C21. El brief da el modelo, el esfuerzo y el alias de subagente del perfil de la fase del lanzamiento
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C22. Si el perfil de la fase es de otro proveedor, el brief lo avisa y no inventa un alias
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C23. El brief nombra las skills de proceso que la fase carga
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C24. El brief nombra las compuertas de la fase con su evaluador: `cascade` para análisis y plan, `command` para `qa-mechanical`
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C25. El brief declara el contrato de entrega: pruebas con comandos exactos, criterios marcados, consumo de IA, `valmen secrets` y commit solo en la rama del worktree
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C26. El brief prohíbe aprobar lo que decide una persona
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C27. El brief prohíbe tocar el checkout principal y nombra su ruta
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C28. El brief prohíbe correr la suite completa y manda a correr los archivos de prueba del ticket
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C29. El brief de un ticket SECURITY lo declara solo de persona, y el de un FEATURE no lleva ese bloque
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C30. Un ticket en `planned`, `awaiting_user_tests`, `in_qa`, `qa_approved`, `closed` o `blocked` produce un brief marcado como no lanzable con su motivo
      <!-- test: npx vitest run tests/journey-brief.test.ts -->
- [x] C31. `journey brief` de un ticket inexistente falla con un mensaje que nombra el id
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C32. `journey brief` deja idéntico todo el árbol del registro
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C33. `--concurrency` consume su valor en `parseArgs` y la ayuda documenta `journey next` y `journey brief`
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C34. Sin `--project`, los dos comandos resuelven el proyecto por el `project-id` de la configuración de la raíz
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C35. Un subcomando de `journey` desconocido responde con la lista que incluye `next` y `brief`
      <!-- test: npx vitest run tests/journey-ola-cli.test.ts -->
- [x] C36. La selección, el despacho, el siguiente paso y la ayuda del CLI siguen pasando sus pruebas tras las dos extracciones
      <!-- test: npx vitest run tests/journey-selection.test.ts tests/journey-dispatch.test.ts tests/next-step.test.ts tests/cli.test.ts -->
- [x] C37. El código nuevo compila sin errores de tipos
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-ENGINE-JORNADA-OLA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/journey-brief.ts",
      "packages/engine/src/journey-selection.ts",
      "packages/engine/src/journey-wave.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

Se implementó el plan aprobado sin salirse de su alcance ni de sus exclusiones.

- `packages/engine/src/journey-selection.ts`: la regla de ventana de `baseReasons` se extrajo a `razonesDeVentana(ticket, windows, at)` (exportada) y `compareTicket` se exportó; `baseReasons` la llama y el comportamiento no cambia. `packages/engine/src/resume.ts`: `renderFases` se exportó.
- `packages/engine/src/journey-wave.ts` (nuevo): `slugDeTicket`, `worktreeDelTicket`, `esWorktreeDelTicket` (acepta el nombre corto y el id completo, nunca el checkout principal), `parsearWorktrees`, `listarWorktreesDeGit` (con aviso si git falla), `calcularOlaDeJornada` y `renderOlaDeJornada`, con `OLA_CONCURRENCIA_POR_DEFECTO = 3`. Orden de clasificación por ticket: ausente, entregado (`awaiting_user_tests`, `in_qa`, `qa_approved`, `closed`), detenido (parada activa o `blocked`, por `faseDelTicket`), `planned` (espera de aprobación, antes de mirar worktree o actividad), en curso (`in_progress`, worktree de la rama o última actividad abierta), dependencias (las de la jornada más `dependenciasEnGrafos`), ventana y listo; los listos se ordenan con `compareTicket` y se recortan a `concurrency` menos los en curso, y el resto espera por cupo. Solo se clasifican los tickets de `journey.tickets`.
- `packages/engine/src/journey-brief.ts` (nuevo): `armarBriefDeSubagente` y `renderBriefDeSubagente`, con worktree y comando `git worktree add`, el siguiente paso y los modelos de `buildResumeContext` (cliente `claude` por defecto), modelo, esfuerzo y alias de la fase, skills, tabla de compuertas por fase con evaluador, contrato de entrega, prohibiciones, bloque SECURITY solo para tickets SECURITY y `lanzable` solo en `intake`, `analyzed`, `approved`, `in_progress` y `changes_requested`.
- `packages/engine/src/index.ts`: dos líneas `export *`.
- `packages/cli/src/commands.ts`: `journeyNextCommand` y `journeyBriefCommand`, dentro de `withAccessMode("ask", ...)`, con `--project` o el `project-id` de `<raíz>/.valmen/config.yaml`, validación de `--concurrency` (entero de al menos 1, si no `EXIT_SCHEMA`) y de `--cliente`; no escriben en el registro ni llaman a `anexarPasada`. `packages/cli/src/main.ts`: ramas `next` y `brief` del despacho de `journey`, mensaje de subcomandos ampliado, `--concurrency` en `VALUE_OPTIONS` y dos entradas de `USAGE`.
- Pruebas nuevas: `tests/journey-wave.test.ts` (26), `tests/journey-brief.test.ts` (14), `tests/journey-ola-cli.test.ts` (12) y el ayudante `tests/helpers/ola.ts`.

Decisiones del PO que el plan dejó abiertas, resueltas con lo asumido en el plan: rama `valmen/ticket-<nombre>`; un subagente nunca aprueba SECURITY; `in_qa` y `qa_approved` cuentan como entregados además de `awaiting_user_tests` y `closed`.

## Pruebas

Contrato de pruebas:

- Directorio: raíz del checkout o del worktree del ticket, con `node_modules` (en un worktree sin él, enlazar el del checkout principal o correr `npm install`). Requisitos: Node 24 y `git` en el PATH.
- `npx vitest run tests/journey-wave.test.ts tests/journey-brief.test.ts tests/journey-ola-cli.test.ts`: los tres archivos en verde. Resultado obtenido: 3 archivos, 52 pruebas pasadas.
- `npx vitest run tests/journey-selection.test.ts tests/journey-dispatch.test.ts tests/next-step.test.ts tests/cli.test.ts`: regresión de lo tocado, en verde. Resultado obtenido: 4 archivos, 88 pruebas pasadas.
- `npx tsc --noEmit -p tsconfig.json`: sin errores (obtenido).
- Validación manual: con una jornada armada por el PO, `valmen journey next --wave --concurrency 2` y `valmen journey brief --id <ID>` imprimen la ola y el brief, y `git status` no cambia después de correrlos.
- No se corrió la suite completa (`npx vitest run`): la corre el orquestador al integrar.

Entrega verificada por el subagente; la validación manual queda para el responsable.

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:d1654fbfca4900d34164c7bc26aa5460a0ce9671",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:77e13366093ef4ed2d6c8cd7fe32ab194dd217d43e8abaed3d23315832800875",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Calcular la ola de tickets listos y el brief de cada uno para la corrida orquestada",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
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
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-jornada-ola",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×103, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16592385 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "at": "2026-10-08T13:44:11.448Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T13:57:28.787Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T14:47:51.652Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:47.823Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:1b7ad9e2fee03d87d1a9ef8224ba29f187d422034a0ae59e3b7f991d20e4941b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:50.183Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:1b7ad9e2fee03d87d1a9ef8224ba29f187d422034a0ae59e3b7f991d20e4941b."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:50.183Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T15:25:25.867Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T15:48:08.765Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T15:48:09.070Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:23.888Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:24.373Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:24.746Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:25.110Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:25.415Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:25.806Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:26.267Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:26.623Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:26.968Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:27.309Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:27.664Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:27.976Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:29.426Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:29.572Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:20:29.864Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
