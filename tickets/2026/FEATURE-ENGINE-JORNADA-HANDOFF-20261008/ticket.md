---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-HANDOFF-20261008
title: Entregar al terminar la corrida el parte de qué probar y cómo en cada ticket
type: FEATURE
module: ENGINE
workflow_status: approved
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

# FEATURE-ENGINE-JORNADA-HANDOFF-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: `valmen journey handoff --id <JORNADA|corrida>` arma el parte final de la corrida, de solo lectura: por cada ticket de la jornada en awaiting_user_tests, qué probar y cómo (sale del contrato de pruebas del ticket: comandos, directorio, resultado esperado y validaciones manuales) y marca los que se cerraron por política de QA; lo imprime y, con --to telegram:<id>, lo envía por el vigilante de avisos que ya existe. El parte se guarda en la jornada para consultarlo después. No cierra ni mueve ningún ticket.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
1. Resuelto por el PO: `--id` acepta solo el id de jornada (JOR-…) y no se agrega DEL-…. Pregunta original: ¿Qué es la «corrida» de `--id <JORNADA|corrida>`? El código no tiene un identificador de corrida orquestada: la corrida se arma con `journey plan` o `armar_jornada` (`packages/engine/src/journey-plan.ts`) y lo que queda en el registro es la jornada (`JOR-AAAAMMDD`). Lo único que el código llama corrida aparte de eso es una delegación (`DEL-…`, `packages/engine/src/delegation.ts`) o una corrida de proceso. Pregunta al PO: ¿`journey handoff --id` acepta solo el id de la jornada, o también el de una delegación? Este plan implementa solo el id de jornada y rechaza cualquier otro con un mensaje que lo dice. Aceptar `DEL-…` queda fuera porque una delegación no tiene jornada donde guardar el parte; lo que se implementa aquí hace falta con cualquiera de las dos respuestas.

## Descripción funcional

- Alcance: un comando que no modifica ningún ticket, `valmen journey handoff --id <jornada> [--project <id>] [--to <destino>] [--saved]`, que arma el parte final de la corrida. Por cada ticket de la jornada en `awaiting_user_tests` dice qué probar y cómo (comandos con su resultado esperado, directorio y validaciones manuales, tomados del contrato de `## Pruebas`), marca los tickets de la jornada cuyo ciclo de QA cerró por política, lista los que todavía no se entregan, imprime el parte, lo guarda en `.valmen/journeys/handoffs.jsonl` y, solo con `--to telegram:<id>`, lo envía por el vigilante de avisos. Fuera de alcance: cerrar o mover tickets, aprobar nada, enviar el parte sin que se pida (el vigilante no lo manda solo), la skill del orquestador que lo invoca (FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008), la vista de Mission Control (FEATURE-MC-VISTA-CORRIDA-20261008) y aceptar ids de delegación (ver «Supuestos y decisiones pendientes»).
- Usuario o rol afectado: el PO, que al terminar la corrida recibe un solo mensaje con lo que tiene que probar y cómo, y la sesión orquestadora, que lo pide al cerrar (`docs/propuesta-corrida-orquestada.md`, §2.1 paso 6).
- Comportamiento actual: `journey handoff` no existe (`journey admite: plan, advance, install-trigger, notify-plans y clear-stop`, `packages/cli/src/main.ts:2004`). Lo más parecido son avisos sueltos del vigilante: uno por ticket que llega a `awaiting_user_tests`, con los comandos pero sin directorio ni validaciones manuales (`packages/cli/src/hermes.ts:850-869`), uno por ticket cerrado por política (`packages/cli/src/hermes.ts:870-889`) y «jornada terminada», que solo sale cuando todos los tickets están `closed` (`packages/cli/src/hermes.ts:833-849`), de modo que una corrida cuyos tickets esperan las pruebas del PO nunca lo dispara. Nada junta esos hechos por jornada ni deja un parte guardado para consultarlo después.
- Comportamiento esperado: `valmen journey handoff --id JOR-AAAAMMDD` imprime el parte completo en tres bloques (esperan tus pruebas, cerrados por política, sin entregar) y lo guarda una vez por contenido distinto. Con `--to telegram:<id>` lo envía una vez por el canal de Hermes, recortado a un tope seguro y diciendo cuántos tickets quedaron fuera, y anota el envío para no repetirlo; si el canal falla, el parte queda guardado, no se da por avisado y el reintento lo envía. `--saved` imprime el último parte guardado sin recalcular ni escribir. El aviso dice que no aprueba nada ni cierra ningún ticket.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): falta la capacidad; no hay un defecto que corregir. Los datos existen separados. La jornada con sus tickets y su orden se lee con `readJourneys` (`packages/engine/src/journeys.ts:143`). El estado, el título y el contrato de pruebas de cada ticket salen de `findTicket` (`packages/engine/src/discovery.ts:381`) y de la sección `## Pruebas`, cuyos comandos ya extrae `comandosDelContrato` (`packages/engine/src/autonomous-run.ts:289`). Si un ciclo de QA cerró por política lo dice `parsePolicyConfirmation` (`packages/core/src/blocks.ts:43`) sobre el último ciclo, como ya hace el vigilante (`packages/cli/src/hermes.ts:870-889`). El canal es `hermesSendChannel` (`packages/engine/src/notify.ts:127`) y lo ya avisado se anota con `appendApproval` (`packages/engine/src/approval.ts:495`), que es como el vigilante no repite un aviso (`pruebasListasAvisadas`, `packages/engine/src/approval.ts:530`). Lo que falta es un módulo del motor que arme el parte desde esos hechos, un tipo de aviso nuevo en el vigilante y el subcomando; la familia `journey` solo despacha cinco (`packages/cli/src/main.ts:1992-2004`). Además `journey plan` y `journey notify-plans` envían con un `hermesSendChannel(...).notify({...})` escrito en línea (`packages/cli/src/commands.ts:3785`, `packages/cli/src/commands.ts:3032`): ese es el mensaje suelto que `AGENTS.md` pide no repetir. Memoria consultada (`buscar_memoria` «jornada handoff parte de pruebas awaiting_user_tests contrato de pruebas aviso Telegram vigilante de avisos»): AP-003, AP-006, AP-007, AP-009 y AP-010 tratan compuertas y aprobaciones, no este parte; AP-010 pide que el diagnóstico liste los archivos que el plan crea, y por eso va la línea de archivos más abajo.
- Hipótesis pendientes: ninguna sobre dónde va el cambio. Queda una decisión del PO, escrita en «Supuestos y decisiones pendientes»: qué es la «corrida» de `--id`; el plan implementa el id de jornada, que hace falta con cualquier respuesta.
- Consumidores afectados: ningún comportamiento existente cambia. El registro de aprobaciones lo leen `readApprovalLog` (`packages/engine/src/approval.ts:462`), `pendingApprovals` (`packages/engine/src/approval.ts:576`), `ultimoIntento` (`packages/engine/src/approval.ts:628`, que enumera a mano los tipos sin código y hay que ampliar) y `packages/engine/src/plan-approval-batch.ts`; todos filtran por tipo, así que una línea de tipo nuevo no los altera, y `readApprovalLog` descarta los tipos que no conoce (`packages/engine/src/approval.ts:470-481`), por lo que un motor anterior ignora lo nuevo. El vigilante (`pendientesDeAvisar`, `packages/cli/src/hermes.ts:764`, y `hermesNotifyPendientes`, `packages/cli/src/hermes.ts:928`) no se modifica. Lectores futuros de lo nuevo: la skill del orquestador y la vista de Mission Control, tickets hermanos de la feature. Pruebas vecinas que deben seguir en verde: `tests/vigilante-jornada.test.ts`, `tests/hermes-notify.test.ts`, `tests/approval.test.ts` y `tests/cli.test.ts`.
- Archivos y flujo investigados: `packages/engine/src/journeys.ts:113-165` (lectura validada de jornadas y su última foto), `packages/engine/src/journey-plan.ts` (cómo se arma la jornada de la corrida), `packages/engine/src/journey-passes.ts` (precedente de registro append-only de la jornada con lector que ignora líneas ilegibles), `packages/engine/src/notify.ts:127-210` y `:549-620` (canal de Hermes y los renderizadores de «pruebas listas», «jornada terminada» y «cierre por política»), `packages/engine/src/approval.ts:91-101` y `:462-545` (tipos de aviso y su registro), `packages/engine/src/secrets.ts:174` (`scanSecrets`), `packages/core/src/fs.ts:161` (`MutationLock`), `packages/cli/src/main.ts:235-242` (ayuda de `journey`), `packages/cli/src/commands.ts:3758` (`journeyPlanCommand`, precedente de resolución de proyecto con `--project`), `tests/vigilante-jornada.test.ts` y `tests/jornada-diaria.test.ts` (patrones de prueba con canal falso y home con bindings), `tests/qa-sombra.test.ts:41-56` (ciclo de QA por política en un ticket de prueba). Flujo: el orquestador integra las ramas (paso 5 de la propuesta), pide el parte (paso 6) y el motor lee el registro del checkout donde corre.
- Archivos que el plan toca o crea: existentes, `packages/engine/src/approval.ts`, `packages/engine/src/notify.ts`, `packages/engine/src/index.ts`, `packages/cli/src/hermes.ts` y `packages/cli/src/main.ts`; nuevos, que todavía no existen, el módulo journey-handoff.ts en `packages/engine/src`, otro journey-handoff.ts en `packages/cli/src` y el archivo de pruebas tests/jornada-handoff.test.ts.
- Riesgos y compatibilidad: (1) `## Pruebas` es texto libre y clasificar sus viñetas por patrón (directorio, manual, comando entre comillas invertidas) puede dejar fuera una línea con otra redacción; si el patrón no reconoce nada, el parte imprime el texto de la sección y cada entrada lleva la ruta del ticket, que sigue siendo la fuente. (2) Telegram acota el largo de cada mensaje (4096 caracteres según su documentación, dato externo que este repositorio no comprueba): sin tope, un parte de varios tickets podría rechazarse entero; por eso el envío se recorta a 3500 caracteres diciendo cuántos tickets quedan fuera, y el parte completo se imprime y se guarda. (3) El parte sale a un canal externo y se guarda en el repositorio, así que una credencial escrita en un contrato no puede viajar: `scanSecrets` revisa `## Pruebas` y, si encuentra algo, esa entrada omite el contrato y dice el tipo de hallazgo sin copiar el valor. (4) El parte lee el registro del checkout donde corre: un ticket entregado en un worktree que todavía no se integró aparece sin entregar; el orquestador integra antes de pedirlo. (5) `packages/cli/src/main.ts` y `packages/engine/src/index.ts` también los tocan los tickets hermanos FEATURE-ENGINE-JORNADA-OLA-20261008 y FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008; el comando vive en un archivo nuevo para reducir el choque y el orquestador integra de a uno. (6) Dos ejecuciones simultáneas no deben duplicar la línea guardada: la comparación de huella y el anexo van bajo `MutationLock`. (7) En un worktree sin `node_modules` propio, `tsc` resuelve `@valmen/engine` contra el `dist` del checkout principal y no ve los exports nuevos; la verificación de tipos exige `npm ci` y `npm run build` en el worktree, o correrse tras integrar.
- Impactos de sync, migración, Docker o despliegue: ninguno. Agrega un archivo de registro nuevo bajo `.valmen/journeys/` y un tipo de línea nuevo en el registro de aprobaciones (approvals.jsonl, que se crea al primer aviso), ambos append-only; los motores anteriores los ignoran y no hay nada que aplicar ni revertir fuera del commit.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: el módulo del motor que arma, guarda y lee el parte, el tipo de aviso nuevo del vigilante con su redacción y su envío, el subcomando `journey handoff` y sus pruebas. Exclusiones: cerrar o mover tickets, enviar sin `--to`, la skill del orquestador, la vista de Mission Control, ids de delegación y cambiar `pendientesDeAvisar`.
- Decisiones de diseño fijadas aquí para que la implementación no las adivine: el parte tiene tres bloques (esperan tus pruebas, cerrados por política de QA, sin entregar) y su huella es el sha256 del contenido sin la hora; el tope del envío es 3500 caracteres y recorta por tickets completos; `--project` es opcional y, si falta, se toma el `project-id` de `.valmen/config.yaml` de la raíz y se resuelve por el binding de la máquina como el resto de la familia `journey`; un envío fallido no cambia el código de salida, como en `journey plan`, y el mensaje dice que no se envió.
- Pasos ordenados:
  1. Crear `tests/jornada-handoff.test.ts` en rojo sobre un registro temporal, con un home con `bindings.local.yaml` como en `tests/jornada-diaria.test.ts`, la jornada creada con `createJourney`, los tickets con `writeFixtureTicket` de `tests/helpers/fixtures.ts`, los ciclos de QA por política escritos como en `tests/qa-sombra.test.ts` y un `CommandRunner` falso como en `tests/vigilante-jornada.test.ts`. Un caso por criterio y un control por cada barrera: un ticket cerrado por una persona (C7), un ticket fuera de la jornada (C8), un contrato sin credenciales que sí se incluye (C2), sin `--to` el canal no se invoca (C17) y los tickets y `events.jsonl` quedan iguales (C16). Correr `npx vitest run tests/jornada-handoff.test.ts` y comprobar que falla por lo que falta. (C1–C25)
  2. Crear `packages/engine/src/journey-handoff.ts` con los tipos `EntradaDePruebas` y `ParteDeJornada` y la función `armarParteDeJornada({ project, journeyId, ahora? })`. Lee la jornada con `readJourneys` y, por cada ticket en su orden, usa `findTicket` y `parseTicket`: en `awaiting_user_tests` produce una entrada con `ticketId` (el id), título, ruta, `directorio`, `probar` (las viñetas de `## Pruebas` con un comando entre comillas invertidas, con su resultado esperado y las líneas sangradas unidas), `manuales` (las que empiezan por «Manual» o «Validación manual») y la marca `sinContrato` si `contratoDePruebasEscrito` da falso; en `qa_approved` o `closed` con el último ciclo de QA en `parsePolicyConfirmation` produce un cierre por política con autorización y recibo; el resto va a «sin entregar» con su estado, y un ticket ilegible va ahí con estado `?` sin tumbar el parte. Si `scanSecrets` encuentra algo en `## Pruebas`, la entrada omite el contrato y dice el tipo de hallazgo, nunca el valor. Una jornada inexistente falla con `EXIT_INVARIANT` nombrándola. Exportar el módulo desde `packages/engine/src/index.ts`. (C1–C11)
  3. En ese mismo archivo agregar `guardarParteDeJornada({ project, parte })` y `leerPartesDeJornada(root, journeyId?)`. Guardar anexa a `.valmen/journeys/handoffs.jsonl` una línea `{ kind: "journey-handoff", version: 1, journeyId, generadoEn, huella, parte }` bajo `MutationLock.run`, y no anexa si la última línea de esa jornada tiene la misma huella; leer ignora líneas ilegibles como `leerPasadas` en `packages/engine/src/journey-passes.ts`. Ninguna función escribe fuera de ese archivo. (C12–C16)
  4. En `packages/engine/src/approval.ts` agregar `JourneyHandoffNotice` (`kind: "journey-handoff-notice"`, `journeyId`, `huella`, `notifiedAt`) a `ApprovalLogEntry`, a los tipos que admite `readApprovalLog`, a la exclusión de `ultimoIntento` y el lector `partesDeJornadaAvisados` (conjunto `jornada:huella`). En `packages/engine/src/notify.ts` agregar `renderJourneyHandoffNotification(parte, { maxCaracteres? })`: redacta los tres bloques, deja tickets completos hasta el tope y cierra con «… y N más» y cómo ver el parte completo, y termina con la frase de que el aviso no aprueba nada ni cierra ningún ticket. (C21, C22)
  5. En `packages/cli/src/hermes.ts` agregar `avisarParteDeJornada({ paths, parte, to, now, runner? })`, el camino del vigilante para este aviso: si `partesDeJornadaAvisados` ya trae la huella devuelve `ya-enviado`; si no, envía con `hermesSendChannel({ target: to, runner })` el payload de `renderJourneyHandoffNotification` con tope de 3500; entregado, anexa `journey-handoff-notice` con `appendApproval`; no entregado, no anota nada y devuelve `fallido` con el detalle del canal. No toca `pendientesDeAvisar` ni `hermesNotifyPendientes`. (C18, C19, C20)
  6. Crear `packages/cli/src/journey-handoff.ts` con `journeyHandoffCommand(flags, opciones)`: exige `--id` con la forma de `JOURNEY_ID_RE` y, si falta o es inválido, devuelve `EXIT_SCHEMA` con el uso `journey handoff --id <jornada> [--project <id>] [--to <destino>] [--saved]`, resuelve el proyecto con `resolveAuthorizedProject` (`--project` o el `project-id` de `.valmen/config.yaml`), arma, guarda e imprime el parte completo; con `--to` llama a `avisarParteDeJornada` y dice si se envió, si ya estaba enviado o por qué falló; `--saved` imprime el último guardado sin escribir y se rechaza junto con `--to`. En `packages/cli/src/main.ts` agregar el despacho `rest[0] === "handoff"` en el bloque `journey` (`:1992`), el mensaje de subcomandos (`:2004`) y la ayuda junto a `journey notify-plans` (`:241`), y confirmar que `--id`, `--to` y `--project` ya están en `VALUE_OPTIONS` (`packages/cli/src/main.ts:583`, `:599`, `:740`) y que `--saved` es booleana, para que `tests/cli.test.ts` siga verificando la coherencia entre ayuda y banderas. (C15, C16, C17, C23, C24, C25, C26)
  7. Verificar: `npx vitest run tests/jornada-handoff.test.ts` en verde; `npx vitest run tests/cli.test.ts tests/vigilante-jornada.test.ts tests/hermes-notify.test.ts tests/approval.test.ts` sin regresión; `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sobre los archivos del ticket sin errores. Comprobar por mutación que cada barrera falla sin su guarda (secretos, jornada ajena, política contra persona, huella, tope). Dejar escrito el contrato de entrega en `## Pruebas` con los comandos, el directorio, el resultado esperado, la validación manual y los requisitos de ambiente, y marcar con `- [x]` los criterios verificados. (C1–C29)
- Contrato de pruebas previsto, que se escribe en `## Pruebas` al entregar y no antes: directorio, la raíz del repositorio o del worktree con `node_modules` instalado y `npm run build` al día; comandos, `npx vitest run tests/jornada-handoff.test.ts` (todas las pruebas pasan), `npx vitest run tests/cli.test.ts tests/vigilante-jornada.test.ts tests/hermes-notify.test.ts tests/approval.test.ts` (sin regresión) y `npx tsc --noEmit -p tsconfig.json` (sin salida); validación manual del responsable, `valmen journey handoff --id <jornada real> --project valmen-harness` con el CLI construido, que debe imprimir los tres bloques y dejar una línea en `.valmen/journeys/handoffs.jsonl` sin cambiar ningún ticket, y que el responsable compruebe en cada ticket del parte, uno por uno y sin abrir el ticket, que sabe qué comandos correr, desde qué directorio, qué resultado esperar y qué validar a mano; después, solo si lo decide, el mismo comando con `--to telegram:<su id>` para ver llegar el mensaje. Las pruebas de este ticket corren sus propios archivos, no la suite completa.
- Dependencias: ninguna abierta. Usa `readJourneys`, `findTicket`, `comandosDelContrato`, `parsePolicyConfirmation`, `hermesSendChannel`, `appendApproval` y `scanSecrets` sin cambiarlas; solo amplía `approval.ts` y `notify.ts` con un tipo nuevo. Los tickets hermanos de la skill y de la vista dependen de este.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <sha>`. Lo ya escrito en `.valmen/journeys/handoffs.jsonl` y las líneas `journey-handoff-notice` de `.valmen/approvals.jsonl` quedan como historia append-only: el código anterior no lee el primero y `readApprovalLog` descarta las líneas de un tipo desconocido, así que no hay nada que migrar ni restaurar. Un parte ya enviado a Telegram no se retira, porque es un mensaje.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1. El parte incluye, por cada ticket de la jornada en `awaiting_user_tests`, su id, su título y la ruta de su ticket
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C2. La entrada de cada ticket lleva los comandos del contrato de `## Pruebas` junto con su resultado esperado
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C3. La entrada de cada ticket lleva el directorio de ejecución que declara su contrato
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C4. La entrada de cada ticket lleva las validaciones manuales que declara su contrato
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C5. Un ticket en `awaiting_user_tests` cuyo contrato sigue pendiente sale marcado sin contrato de pruebas y sin comandos inventados
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C6. Un ticket de la jornada en `qa_approved` o `closed` cuyo último ciclo de QA cerró por política sale marcado como cerrado por política, con la autorización y el recibo
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C7. Un ticket cerrado con la confirmación de una persona no se marca como cerrado por política (control de C6)
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C8. Un ticket en `awaiting_user_tests` que no pertenece a la jornada no aparece en el parte (control de aislamiento)
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C9. Los tickets de la jornada que todavía no se entregaron salen en «sin entregar» con su estado
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C10. Un contrato de pruebas que contiene una credencial se omite del parte, con el tipo de hallazgo y sin copiar el valor
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C11. Una jornada que no existe falla con un mensaje que la nombra y no escribe nada
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C12. El comando guarda el parte en `.valmen/journeys/handoffs.jsonl` como una línea nueva con el id de la jornada y la huella del contenido
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C13. Repetir el comando sin cambios en los tickets no añade otra línea
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C14. Un cambio de estado de un ticket entre dos corridas añade una línea nueva y deja la anterior intacta
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C15. `--saved` imprime el último parte guardado sin escribir nada
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C16. El comando deja byte a byte iguales los `ticket.md` y `.valmen/journeys/events.jsonl`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C17. Sin `--to` no se invoca ningún canal de envío
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C18. Con `--to telegram:<id>` el parte sale una vez por `hermes send` hacia ese destino y se anota `journey-handoff-notice` en el registro de aprobaciones
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C19. Repetir el envío con el mismo contenido no reenvía y el comando lo dice
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C20. Si el canal falla, el parte queda guardado, el aviso no se anota, el comando dice que no se envió y un reintento con el canal sano lo envía
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C21. El cuerpo enviado no pasa de 3500 caracteres y, cuando recorta, dice cuántos tickets quedaron fuera
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C22. El aviso dice que no aprueba nada ni cierra ningún ticket
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C23. `--saved` junto con `--to` se rechaza sin enviar ni escribir
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C24. Sin `--id` el comando falla con el código de uso y muestra cómo se invoca
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C25. Sin `--project`, el proyecto sale del `project-id` de `.valmen/config.yaml` de la raíz
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [ ] C26. La ayuda documenta `journey handoff` y sus banderas con valor están declaradas
      <!-- test: npx vitest run tests/cli.test.ts -->
- [ ] C27. Las pruebas existentes del vigilante y del registro de aprobaciones siguen pasando
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts tests/hermes-notify.test.ts tests/approval.test.ts -->
- [ ] C28. La comprobación de tipos pasa
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C29. En un parte real, el responsable comprueba en cada ticket del parte, uno por uno, que reconoce qué probar y cómo sin abrir el ticket
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

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
[]
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
    "at": "2026-10-08T13:44:12.064Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T14:45:17.781Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T14:46:25.699Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:44.304Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:a8599fd6f863aebd6ff27829ae95ec62dd29ce16a4e1ce79f4d8ccc631aec71b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:46.303Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:a8599fd6f863aebd6ff27829ae95ec62dd29ce16a4e1ce79f4d8ccc631aec71b."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:46.303Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
