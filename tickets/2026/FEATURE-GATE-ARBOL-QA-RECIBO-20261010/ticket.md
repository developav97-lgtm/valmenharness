---
schema_version: 2
id: FEATURE-GATE-ARBOL-QA-RECIBO-20261010
title: Recibo de qa-mechanical atado al árbol probado y rechazo si cambia
type: FEATURE
module: GATE
workflow_status: approved
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-ARBOL-QA-RECIBO-20261010

## Solicitud original

Parte del sprint: La revisión del diff es una compuerta con riesgo calculado en código y recibos atados al árbol entregado.
- R-REV-001: El recibo de qa-mechanical DEBE guardar el árbol probado y la entrega DEBE rechazarlo si el árbol cambió
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El recibo de qa-mechanical DEBE guardar el árbol probado y la entrega DEBE rechazarlo si el árbol cambió
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el recibo de la compuerta `qa-mechanical` y la entrega `in_progress → awaiting_user_tests`. El recibo pasa a guardar el árbol de trabajo que se probó y el motor compara ese árbol con el actual al entregar, además del texto del ticket; el siguiente paso que se le da al agente (`valmen resume`) aplica la misma regla. Cubre R-REV-001 del sprint S4 de la feature `guardas-verificacion-harness` (`.valmen/features/guardas-verificacion-harness/spec/s4-revision-diff/spec.md`, decisión D4 del `design.md`). Fuera de alcance: el riesgo y la compuerta `code-review` (R-REV-002 a R-REV-005, tickets FEATURE-ENGINE-RIESGO-REVISION-20261010 y FEATURE-GATE-CODE-REVIEW-20261010), el recibo de `qa-agent`, el `hashProbado` de la jornada autónoma y el marcado de criterios al cerrar.
- Usuario o rol afectado: la persona responsable que recibe el trabajo en `awaiting_user_tests` (el PO); los agentes y subagentes que entregan con `valmen transition`, `mover_ticket` del MCP o Mission Control; la jornada autónoma, que corre `qa-mechanical` y entrega en la misma llamada.
- Comportamiento actual: el recibo de `qa-mechanical` no dice qué código se probó, y la entrega acepta un código cambiado después de la prueba. Reproducido hoy con el `dist` del worktree (commit b55d06c) en un laboratorio git del scratchpad: un ticket en `in_progress` con el criterio `<!-- test: node prueba.mjs -->`; `runGate` de `qa-mechanical` sale con 0 y escribe un recibo `approve` cuyas claves no tienen ningún campo de árbol ni de commit, con `subject.revision` igual a `"1945"` (el largo del texto del ticket); después se edita `suma.mjs` (de `a + b` a `a - b`), `node prueba.mjs` pasa a salir con 1, y `transition(… to: "awaiting_user_tests")` se acepta («Workflow: in_progress -> awaiting_user_tests.»). En el mismo laboratorio, `git status --porcelain` justo después de la compuerta ya muestra `?? .valmen/receipts/`: el propio recibo ensucia el árbol.
- Comportamiento esperado: el recibo de `qa-mechanical` guarda el árbol probado —el del commit si no había cambios funcionales sin commitear, o el hash del árbol de trabajo si los había—; con un archivo funcional editado, creado o borrado después del recibo, la entrega a `awaiting_user_tests` se rechaza diciendo que el árbol cambió desde el recibo y nombrando la compuerta a repetir (`valmen gate qa-mechanical --id <ID> --evaluator command`); los cambios del propio registro (`tickets/` y `.valmen/`) no invalidan el recibo; y los recibos ya escritos, que no traen el campo, se siguen leyendo.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  1. El recibo no tiene ningún campo sobre el código. `GateReceipt` (`packages/gate/src/receipt.ts:148-233`) y `buildReceipt` (`packages/gate/src/receipt.ts:362-415`) guardan `stateHash = hashState(input.state)` (`packages/gate/src/receipt.ts:377`, con `hashState` en `packages/gate/src/receipt.ts:306-308`), y el estado es `buildGateState(ticket.text)` (`packages/engine/src/gate.ts:474`), que solo toma secciones del ticket (`packages/engine/src/state.ts:25-48`). El comentario de `packages/engine/src/gate.ts:466-470` lo dice: el `stateHash` responde «¿cambió el texto del ticket?». Y `subject.revision` es `ticket.text.length` (`packages/engine/src/gate.ts:881-885`).
  2. La entrega compara solo el texto. `exigirVerificacionMecanica` (`packages/engine/src/transition.ts:194-225`), llamada al entrar a `awaiting_user_tests` (`packages/engine/src/transition.ts:451-453`), exige que exista el último recibo de `qa-mechanical`, que su `stateHash` sea el del ticket actual (`packages/engine/src/transition.ts:210-216`) y que no haya bloqueado (`packages/engine/src/transition.ts:218-224`). Un cambio de código que no toca el ticket deja los tres en verde: es el síntoma reproducido.
  3. La orientación del agente repite la misma comparación: el caso `in_progress` de `computeNextStep` (`packages/engine/src/next-step.ts:373-426`) declara la verificación vigente si el `stateHash` coincide (`packages/engine/src/next-step.ts:411-420`) y le indica entregar.
- Dónde falta el comportamiento esperado: no existe el símbolo; la falta está en la llamada a `buildReceipt` de `runGate` (`packages/engine/src/gate.ts:876-916`), que no pasa ningún árbol; en el tipo del recibo (`packages/gate/src/receipt.ts:148-233` y `ReceiptInput` en `packages/gate/src/receipt.ts:328-359`); y en las dos comparaciones (`packages/engine/src/transition.ts:210` y `packages/engine/src/next-step.ts:411`). El cálculo del árbol vivirá en un módulo nuevo del motor (arbol-probado, junto a `packages/engine/src/references.ts`), con una prueba nueva en `tests/` y un recibo real de `qa-mechanical` sin el campo copiado a `tests/fixtures/` como vector de compatibilidad.
- Lo que ya existe y por qué no alcanza tal cual:
  - `qa-agent` guarda `base`, `delivered` y `treeHash = <delivered>^{tree}` (`packages/engine/src/qa-agent.ts:92-94` y `packages/engine/src/qa-agent.ts:113-125`), pero es otro recibo (`qa-agent-receipt`) y exige un commit entregado; `qa-mechanical` corre casi siempre con el trabajo sin commitear, porque el commit va después de las pruebas del responsable.
  - `calculateWorktreeReference` (`packages/engine/src/references.ts:150-193`), que D4 propone para el caso sin commit, hashea solo los `affected_files` de los puntos o lo que lista `git diff --name-only --diff-filter=ACMR HEAD` (`packages/engine/src/references.ts:127-140`): no ve un archivo nuevo sin versionar ni un borrado, falla con código 5 si un archivo no está versionado (`packages/engine/src/references.ts:176-178`) y falla si no hay diferencias con `HEAD` (`packages/engine/src/references.ts:157-159`), que es justo lo que pasa si alguien commitea el contenido probado antes de entregar.
  - `<commit>^{tree}` literal incluye `tickets/` y `.valmen/`: el recibo se anexa en `.valmen/receipts/<id>.jsonl` después de calcular (`packages/engine/src/gate.ts:1112`, `packages/engine/src/receipts.ts:33-35` y `packages/engine/src/receipts.ts:193-202`), así que ningún árbol con el registro dentro coincidiría con el de la entrega.
  - El encuadre del hash por (longitud, ruta, longitud, contenido) ya existe dos veces: `encuadrar` (`packages/engine/src/integration-commit.ts:82-98`, privada) y el de `packages/engine/src/references.ts:180-189`. La jornada autónoma calcula con él un `hashProbado` antes de `qa-mechanical` (`packages/engine/src/autonomous-run.ts:470-483`) y lo compara al commitear (`packages/engine/src/integration-commit.ts:254-258`), pero no lo guarda en el recibo y solo existe dentro de la jornada.
  - La exclusión del registro ya es la regla del motor: `references.ts` deja fuera `tickets/` y `.valmen/` (`packages/engine/src/references.ts:121-126` y `packages/engine/src/references.ts:137`), y `repartirCambios` separa lo funcional de lo del registro con el mismo criterio (`packages/engine/src/integration-commit.ts:214-231`).
- Hipótesis pendientes:
  - H1 (costo de leer el árbol): hashear el contenido de todos los archivos funcionales que git ve. Medido con `git ls-files`: 688 archivos funcionales y unos 9,7 MB en este repositorio; 3.116 archivos y unos 133 MB en SaiOpenCloud. El tiempo de cálculo no está medido; se mide en la implementación sobre este repositorio y se anota en `## Implementación`.
  - H2 (comandos que escriben en el árbol): si un comando de `qa-mechanical` crea o modifica un archivo funcional no ignorado, el árbol después de correr difiere del de antes. Aquí `dist/`, `coverage/` y `*.tsbuildinfo` están en `.gitignore`, así que no se espera; en otros proyectos no está comprobado.
  - H3 (git en el proceso del servidor): `mover_ticket` y Mission Control llaman a `transition` desde el servidor. `references.ts` ya invoca git en esos procesos (`packages/engine/src/references.ts:46-53`), pero que `git` esté en el `PATH` del servidor no está comprobado aquí.
- Consumidores afectados:
  - Escritura del recibo: `runGate` (`packages/engine/src/gate.ts:412`), rama `commandPropositions` —el árbol se calcula antes de la preparación del ambiente (`packages/engine/src/gate.ts:706-711`) y se pasa a `buildReceipt` (`packages/engine/src/gate.ts:876-916`)—; el informe del recibo en `packages/engine/src/gate.ts:1096-1105`.
  - Tipo y construcción: `GateReceipt`, `ReceiptInput` y `buildReceipt` de `packages/gate/src/receipt.ts`, que se exportan por `packages/gate/src/index.ts:14`. El campo nuevo es opcional y aditivo, con el precedente de `commandResults` (`packages/gate/src/receipt.ts:193-202`): `RECEIPT_VERSION` no sube.
  - Comparación: `exigirVerificacionMecanica` (`packages/engine/src/transition.ts:194-225`) y `computeNextStep` (`packages/engine/src/next-step.ts:373-426`). Las dos tienen que decir lo mismo: es el principio de `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:121-123`).
  - Encuadre compartido: `encuadrar` (`packages/engine/src/integration-commit.ts:82-98`) pasa a exportarse para que el módulo nuevo no sea una tercera copia; `packages/engine/src/index.ts:30` ya reexporta ese módulo.
  - Jornada autónoma: `runAutonomous` corre `runGate` (`packages/engine/src/autonomous-run.ts:483`) y entrega enseguida (`packages/engine/src/autonomous-run.ts:516`) sin tocar archivos en medio, así que el árbol coincide; su `hashProbado` no cambia.
  - Lectores de recibos que no cambian: `readReceipts` parsea cada línea sin esquema (`packages/engine/src/receipts.ts:44-55`), así que un recibo sin el campo se lee igual y uno con el campo se lee con código viejo; `usageReport` (`packages/engine/src/usage.ts:55`); el marcado de criterios al cerrar (`packages/engine/src/append.ts:996-1011`); la elegibilidad por autorización (`packages/engine/src/approval-eligibility.ts:136-146`); y la aprobación a distancia, que firma `subject.revision` (`packages/cli/src/hermes.ts:1567`, `packages/engine/src/approval.ts:367`): por eso `subject.revision` no se toca.
  - Pruebas existentes que entregan: `tests/gate-mecanico.test.ts:222-299`, `tests/next-step.test.ts:459-487`, `tests/jornada-ejecucion.test.ts:155-158` y `tests/mcp-server.test.ts:1266-1267` y `:1363-1370` usan laboratorios sin git; `tests/autonomous-run.test.ts:71-76` y `:179-195` e `tests/integracion-autonoma.test.ts:118`, `:254` y `:314` usan git y entregan justo después de la compuerta.
  - Datos: 251 recibos de `qa-mechanical` en `.valmen/receipts/` (200 archivos `.jsonl`), ninguno con el campo nuevo; hoy no hay tickets en `in_progress` ni en `changes_requested` en este registro.
- Archivos y flujo investigados: `packages/gate/src/receipt.ts`, `packages/engine/src/state.ts`, `packages/engine/src/gate.ts` (`runGate`), `packages/engine/src/transition.ts`, `packages/engine/src/next-step.ts`, `packages/engine/src/receipts.ts`, `packages/engine/src/references.ts`, `packages/engine/src/qa-agent.ts`, `packages/engine/src/integration-commit.ts`, `packages/engine/src/integration-rules.ts`, `packages/engine/src/autonomous-run.ts`, `packages/engine/src/append.ts`, `packages/engine/src/approval-eligibility.ts`, `packages/engine/src/approval.ts`, `packages/cli/src/hermes.ts`, `tests/gate-mecanico.test.ts`, `tests/next-step.test.ts`, `tests/autonomous-run.test.ts`, `tests/helpers/fixtures.ts`, la spec `.valmen/features/guardas-verificacion-harness/spec/s4-revision-diff/spec.md` y `.valmen/features/guardas-verificacion-harness/design.md` (D4). Flujo: `valmen gate qa-mechanical` → `runGate` congela `buildGateState(ticket.text)`, corre la preparación y los comandos de los criterios, construye el recibo y lo anexa en `.valmen/receipts/<id>.jsonl`; `valmen transition --to awaiting_user_tests` → `exigirVerificacionMecanica` lee el último recibo de `qa-mechanical` y compara solo `stateHash` y `outcome`. La memoria del proyecto no tiene antecedente (búsquedas «recibo qa-mechanical árbol treeHash» y «stateHash entrega awaiting_user_tests recibo»: AP-002, AP-005, AP-007, AP-008, AP-009 y AP-010, ninguno sobre el árbol probado).
- Riesgos y compatibilidad:
  - Recibos ya escritos: el registro es append-only y no se reescribe; el campo nuevo es opcional y los lectores no cambian. Lo que hay que decidir es qué hace la entrega con un recibo sin árbol: aceptarlo dejaría pasar en silencio justo el caso que esta compuerta cierra (por ejemplo, un ticket que vuelve de `changes_requested` con el recibo de antes); rechazarlo obliga a repetir `qa-mechanical`, que corre con el evaluador `command`, sin modelo ni costo, y que el control de repeticiones no frena (`packages/engine/src/gate.ts:512-517`). Se decide en el plan.
  - El propio registro: el recibo, el ticket, el índice, el consumo de IA y el estado del harness cambian entre la compuerta y la entrega; si entraran al árbol, toda entrega se rechazaría. Excluir `tickets/` y `.valmen/` enteros tiene un costo: un cambio en `.valmen/config.yaml` (por ejemplo `test-commands`) después de la compuerta no invalida el recibo.
  - Commit entre la compuerta y la entrega: con un árbol definido por el commit, commitear el mismo contenido cambiaría el árbol y rechazaría una entrega correcta.
  - Sin git (proyecto sin repositorio): no hay árbol que calcular.
  - Un cambio de permisos de archivo (bit de ejecución) no cambia el contenido.
  - Costo de cálculo (H1) y escrituras de los comandos (H2).
  - Autoaplicación: una vez implementado, la entrega de este mismo ticket queda sujeta a la regla; `qa-mechanical` se corre con el código terminado y no se toca nada funcional antes de entregar.
- Impactos de sync, migración, Docker o despliegue: ninguno. No toca sincronización, contenedores ni despliegue, y no migra el registro: los recibos existentes no se reescriben y el campo nuevo es opcional. Cambia el motor y el CLI locales (`@valmen/gate` y `@valmen/engine`) y sus pruebas.

## Plan

- Alcance y exclusiones: el recibo de `qa-mechanical` guarda el árbol probado en un campo opcional nuevo, `testedTree`; la entrega a `awaiting_user_tests` (`exigirVerificacionMecanica`) y el siguiente paso del agente (`computeNextStep`) lo comparan con el árbol actual. Quedan fuera: R-REV-002 a R-REV-005 (FEATURE-ENGINE-RIESGO-REVISION-20261010 y FEATURE-GATE-CODE-REVIEW-20261010, que reutilizarán este cálculo); el recibo de `qa-agent` (`packages/engine/src/qa-agent.ts:92-94`), que sigue con su `treeHash` de commit; el `hashProbado` de la jornada autónoma (`packages/engine/src/autonomous-run.ts:470-483`), que no cambia; el marcado de criterios al cerrar (`packages/engine/src/append.ts:996-1011`); `subject.revision`, que sigue siendo el largo del texto porque lo firma la aprobación a distancia (`packages/cli/src/hermes.ts:1567`); y la reescritura de recibos ya emitidos, que no se hace.
- Decisiones de diseño (confirman y precisan D4 de `.valmen/features/guardas-verificacion-harness/design.md`):
  - Qué es el árbol probado: el contenido de los archivos funcionales que git ve en el árbol de trabajo —los versionados más los nuevos no ignorados (`git ls-files -z --cached --others --exclude-standard`)—, sin los del registro. Cada archivo entra con su ruta y el sha256 de su contenido, encuadrados con `encuadrar` (`packages/engine/src/integration-commit.ts:82-98`), y el resultado es `testedTree.hash = "sha256:<64 hex>"`. Un archivo listado que ya no existe en disco (borrado) no entra, así que su ausencia cambia el hash; un enlace simbólico entra por su destino.
  - Árbol de trabajo sin commit: es el caso normal, porque el commit va después de las pruebas del responsable. El mismo cálculo sirve para los dos casos y es el único que se compara. Cuando no hay cambios funcionales sin commitear, el recibo guarda además `testedTree.commitTree = <head>^{tree}`, que es «el tree del commit» de la spec; con cambios, `commitTree` es `null` y vale el hash. `testedTree.head` guarda el commit de `HEAD` (o `null` si el repositorio no tiene commits) y `testedTree.files` cuántos archivos entraron. Como se compara el contenido y no el commit, commitear lo probado antes de entregar no rechaza la entrega.
  - Archivos del propio registro: `${paths.ticketsDir}/` (en este repositorio `tickets/`) y `.valmen/` no entran al árbol, con la regla que ya aplican `packages/engine/src/references.ts:121-137` y `repartirCambios` (`packages/engine/src/integration-commit.ts:214-231`). Así el recibo anexado en `.valmen/receipts/`, el ticket, el índice, el consumo de IA y el estado del harness pueden cambiar entre la compuerta y la entrega sin invalidarla. El costo aceptado: un cambio en `.valmen/config.yaml` después de la compuerta tampoco la invalida.
  - Cuándo se toma: antes de la preparación del ambiente y de los comandos, que es lo que se probó; al terminar se vuelve a calcular y, si difiere, el recibo guarda el de antes y anota las rutas que cambiaron (hasta 10), para que se vea que la corrida escribe en el árbol (H2) y por qué la entrega se va a rechazar.
  - Recibos sin el campo: se siguen leyendo igual (`readReceipts` no valida esquema). En la entrega, dentro de un repositorio git, un recibo de `qa-mechanical` sin `testedTree` no prueba qué código se verificó y se rechaza pidiendo repetir la compuerta, que corre con el evaluador `command`, sin costo; aceptarlo dejaría pasar un ticket que vuelve de `changes_requested` con el recibo de antes. Fuera de git no hay árbol que calcular: se mantiene la regla de hoy (solo `stateHash`) y el recibo lo anota. Si el recibo trae árbol y el actual no se puede calcular (git falla), se rechaza: se falla cerrado (H3).
  - Descartado: (a) `<commit>^{tree}` literal, que incluye el registro —el recibo que se anexa lo cambiaría— y no existe sin commit; (b) un árbol git real con índice temporal (`GIT_INDEX_FILE` + `git add -A` + `git write-tree`), que escribe objetos en `.git` y usa `git add -A`, que `packages/engine/src/integration-rules.ts:111-114` prohíbe; (c) reutilizar `calculateWorktreeReference` (`packages/engine/src/references.ts:150-193`), que no ve archivos nuevos sin versionar ni borrados y falla si lo probado ya está commiteado.
- Gate de plan y aprobación: pendiente; tras la compuerta de plan, el plan lo aprueba una persona.
- Pasos ordenados:
  1. En `packages/gate/src/receipt.ts`, agregar la interfaz `TestedTreeRecord` (`hash`, `head`, `commitTree`, `files`) y el campo opcional `testedTree?: TestedTreeRecord` en `GateReceipt` (junto a `setup`, `:203-204`) y en `ReceiptInput` (`:349-350`), con el comentario de compatibilidad de `commandResults` (`:193-202`); `buildReceipt` (`:362-415`) lo copia solo si viene; `RECEIPT_VERSION` (`:30`) sigue en 1. (C1, C13)
  2. Copiar con shell, sin pasar los bytes por el modelo, un recibo real de `qa-mechanical` sin el campo como vector de compatibilidad: `grep -m1 '"gate":"qa-mechanical"' .valmen/receipts/FEATURE-CLI-TABLA-COMANDOS-20261010.jsonl > tests/fixtures/recibo-qa-mechanical-sin-arbol.jsonl`, y comprobar que tiene una línea y que `node -e` la parsea con `gate` igual a `qa-mechanical` y sin `testedTree`. (C13, C14)
  3. En `packages/engine/src/integration-commit.ts`, exportar `encuadrar` (`:82-98`) sin cambiar su comportamiento. (C1, C23)
  4. Crear `packages/engine/src/arbol-probado.ts` con: `calcularArbolProbado(paths: RegistryPaths)`, que devuelve `null` si `git rev-parse --show-toplevel` falla y, si no, el `TestedTreeRecord` más el mapa ruta→sha256 de cada archivo; `rutasQueCambiaron(antes, despues)`; y `motivoDeArbolNoVigente(recibo: GateReceipt, paths: RegistryPaths, ticketId: string): string | null`, que devuelve `null` si el árbol coincide o si no hay git ni árbol en el recibo, y si no el motivo: árbol cambiado («El árbol de trabajo cambió desde la verificación mecánica (recibo <id>): lo que se probó no es lo que se entrega»), recibo sin árbol en un repositorio git, o árbol actual incalculable; los tres terminan con `valmen gate qa-mechanical --id <ID> --evaluator command`. Git solo en lectura y sin shell, como `packages/engine/src/references.ts:46-53`: `rev-parse --show-toplevel`, `rev-parse --verify -q HEAD`, `ls-files -z --cached --others --exclude-standard`, `status --porcelain -z -uall` y `rev-parse <head>^{tree}`; ni `add`, ni `write-tree`, ni escritura del índice. (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C14, C15)
  5. En `packages/engine/src/gate.ts`, dentro de `runGate` (`:412`) y solo para `qa-mechanical` (`definition.commandPropositions === true`, también cuando todos los criterios son manuales): calcular el árbol antes de `runTestSetup` (`:706-711`) y de nuevo después de la evaluación (antes de armar `notas`, `:851`); si los hashes difieren, agregar a `notas` las rutas de `rutasQueCambiaron` (hasta 10) diciendo que el recibo guarda el árbol de antes de correr; si el cálculo da `null`, la nota «sin árbol: el proyecto no es un repositorio git»; pasar `testedTree` a `buildReceipt` (`:876-916`); y agregar al bloque «Recibo» del informe (`:1096-1105`) la línea `árbol probado` con el prefijo del hash, la cantidad de archivos y «commit <head>» o «cambios sin commitear». (C1, C2, C3, C4, C17, C18)
  6. En `packages/engine/src/transition.ts`, dentro de `exigirVerificacionMecanica` (`:194-225`), después de la comparación del `stateHash` (`:210-216`) y antes de la del bloqueo (`:218`), llamar a `motivoDeArbolNoVigente` y fallar con `EXIT_INVARIANT` si devuelve un motivo; actualizar el comentario de `:181-193`. (C5, C6, C7, C8, C9, C10, C11, C12, C14, C15)
  7. En `packages/engine/src/next-step.ts`, en el caso `in_progress` de `computeNextStep` (`:373-426`), después de la comparación del `stateHash` (`:411-420`), devolver el paso «verificación» con el motivo de `motivoDeArbolNoVigente` cuando no sea `null`, para que la orientación y el motor digan lo mismo. (C16)
  8. Crear `tests/arbol-probado.test.ts`: un laboratorio git (`git init`, `config` y commit con `spawnSync`, como `tests/autonomous-run.test.ts:71-76`), el ticket en `in_progress` con `writeFixtureTicket` (`tests/helpers/fixtures.ts`), un criterio `<!-- test: node -e "process.exit(0)" -->`, el contrato en `## Pruebas` y `.valmen/config.yaml` con `test-commands: node` (como `tests/gate-mecanico.test.ts:44-52`). Casos: forma del hash y `head` (C1, C2); `commitTree` limpio y con cambios (C3, C4); edición, archivo nuevo y borrado después del recibo (C5–C9); cambios en `tickets/` y en `.valmen/` (C10, C11); commit del mismo contenido (C12); el recibo de `tests/fixtures/recibo-qa-mechanical-sin-arbol.jsonl` leído con `readReceipts` y, con `subject.id` y `stateHash` adaptados en memoria al ticket del laboratorio, rechazado al entregar (C13, C14); un laboratorio sin git que entrega con el recibo vigente (C15); `computeNextStep` con el árbol cambiado (C16); un criterio cuyo comando escribe un archivo funcional (`node -e "require('fs').writeFileSync('generado.txt','x')"`) y la nota con esa ruta (C17); y la línea `árbol probado` en la salida de `runGate` (C18). (C1–C18)
  9. Desde la raíz del worktree, correr `npx vitest run tests/arbol-probado.test.ts`; después las pruebas que entregan o leen recibos de `qa-mechanical` (comando de C19) y `npx vitest run tests/mcp-server.test.ts`; y por último `npx tsc --build tsconfig.build.json`, `npx tsc --noEmit -p tsconfig.json` y `node scripts/exports-sin-uso.mjs`. Medir el tiempo de `calcularArbolProbado` sobre este repositorio (H1) y anotarlo en `## Implementación`. Con el código terminado, correr `valmen gate qa-mechanical --id FEATURE-GATE-ARBOL-QA-RECIBO-20261010 --evaluator command` como último paso antes de entregar, sin tocar archivos funcionales después: la regla nueva se aplica a este mismo ticket. (C19, C20, C21, C22, C23)
- Compatibilidad: los recibos ya escritos no se reescriben y se siguen leyendo; el campo es opcional y `RECEIPT_VERSION` no cambia; un recibo con el campo se lee con el código anterior, que lo ignora. Cambia a propósito una sola cosa: la entrega con un código distinto del probado, o con un recibo de `qa-mechanical` sin árbol dentro de git, se rechaza y pide repetir la compuerta. Se conservan `stateHash`, `subject.revision`, el control de repeticiones (`packages/engine/src/gate.ts:512-517`), el veredicto de la compuerta, la jornada autónoma y los proyectos sin git, que siguen comparando solo el texto. Hoy no hay tickets en `in_progress` ni en `changes_requested` en este registro, así que ninguno queda frenado al integrar.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 24 con las dependencias del monorepo instaladas y `git` en el `PATH`, sin red ni credenciales; resultado esperado, los comandos del paso 9 sin fallos. Comprobación manual opcional tras `npm run build`: repetir la reproducción del diagnóstico —compuerta, editar un archivo funcional y entregar— y ver el rechazo que nombra `valmen gate qa-mechanical`.
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que quita el campo del tipo, el módulo `packages/engine/src/arbol-probado.ts`, la comparación de la entrega y del siguiente paso, la exportación de `encuadrar` y las pruebas con su vector. No hay datos que migrar ni restaurar: los recibos emitidos con `testedTree` quedan en el registro append-only y el código anterior los lee ignorando el campo. Si tras integrar una entrega legítima se rechaza por un archivo que no debía contar, el arreglo dirigido es excluir esa ruta en `calcularArbolProbado`; el revert queda para cuando el rechazo no tenga una causa acotada.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 — R-REV-001: En un repositorio git, el recibo de `qa-mechanical` guarda `testedTree.hash` con la forma `sha256:<64 hex>`.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C2 — R-REV-001: `testedTree.head` es el commit de `HEAD` en el momento de correr la compuerta.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C3 — R-REV-001: Sin cambios funcionales sin commitear, `testedTree.commitTree` es el `tree` de ese commit.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C4 — R-REV-001: Con un cambio funcional sin commitear, `testedTree.commitTree` es `null`.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C5 — R-REV-001: Con un recibo `approve` de `qa-mechanical` y un archivo funcional editado después, la transición a `awaiting_user_tests` se rechaza.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C6 — R-REV-001: El rechazo por árbol cambiado dice que el árbol cambió desde el recibo.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C7 — R-REV-001: El rechazo por árbol cambiado nombra la compuerta a repetir con `valmen gate qa-mechanical --id <ID>`.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C8 — R-REV-001: Un archivo funcional nuevo sin versionar, creado después del recibo, rechaza la entrega.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C9 — R-REV-001: Un archivo funcional borrado después del recibo rechaza la entrega.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C10 — R-REV-001: Un cambio en `tickets/` después del recibo no rechaza la entrega.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C11 — R-REV-001: Un cambio en `.valmen/` después del recibo no rechaza la entrega.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C12 — R-REV-001: Commitear después del recibo el mismo contenido probado no rechaza la entrega.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C13 — R-REV-001: Un recibo real de `qa-mechanical` sin `testedTree` se lee con `readReceipts`.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C14 — R-REV-001: En un repositorio git, la entrega con un recibo de `qa-mechanical` sin `testedTree` se rechaza pidiendo repetir la compuerta.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C15 — R-REV-001: En un proyecto sin git, la entrega con un recibo vigente por el texto del ticket se acepta.
      <!-- test: npx vitest run tests/arbol-probado.test.ts tests/gate-mecanico.test.ts -->
- [ ] C16 — R-REV-001: Con el árbol cambiado, `computeNextStep` en `in_progress` indica volver a correr `qa-mechanical`.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C17 — R-REV-001: Si los comandos de la compuerta cambian un archivo funcional, el recibo anota la ruta que cambió.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C18 — R-REV-001: La salida de `valmen gate qa-mechanical` muestra el árbol probado.
      <!-- test: npx vitest run tests/arbol-probado.test.ts -->
- [ ] C19 — R-REV-001: Las pruebas existentes de la compuerta mecánica, la entrega y los recibos pasan con el árbol.
      <!-- test: npx vitest run tests/gate-mecanico.test.ts tests/next-step.test.ts tests/autonomous-run.test.ts tests/integracion-autonoma.test.ts tests/jornada-ejecucion.test.ts tests/receipts-compat.test.ts tests/gate-command.test.ts tests/preparacion-ambiente.test.ts tests/compuerta-repetida.test.ts tests/cierre-criterios.test.ts -->
- [ ] C20 — R-REV-001: Las pruebas del servidor MCP que corren `qa-mechanical` y entregan pasan.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [ ] C21 — R-REV-001: El monorepo compila con el campo nuevo.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [ ] C22 — R-REV-001: Las pruebas tipan contra el código nuevo.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C23 — R-REV-001: El cambio no deja exportaciones nuevas sin consumidor.
      <!-- test: node scripts/exports-sin-uso.mjs -->

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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:32.344Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-10T23:00:46.031Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-10T23:03:47.880Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:33.263Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-326fff\",\"source\":\"autorizacion\",\"quote\":\"aprobacion de planes y analisis agentico\",\"planHash\":\"sha256:c9613d035a71d21267cbb80bf93381d2273d83060bfd75bb42b84146fc42a784\",\"authorizationId\":\"APA-20261009-326fff\",\"authorizationHash\":\"sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d\",\"stage\":\"plan\",\"receiptId\":\"GR-20261010-FEATURE-GATE-ARBOL-QA-RECIBO-20261010-plan-1\",\"receiptStateHash\":\"sha256:6b9a8717fc01297cdb308f7928b11f8abbcd993f7e814d8399eaeefa2850dff6\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:37.222Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-326fff (fuente autorizacion, hash sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d), plan sha256:c9613d035a71d21267cbb80bf93381d2273d83060bfd75bb42b84146fc42a784."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-10T23:12:37.222Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
