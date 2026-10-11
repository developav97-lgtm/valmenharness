---
schema_version: 2
id: FEATURE-GATE-CODE-REVIEW-20261010
title: Compuerta code-review con profundidad por riesgo y una corrección
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

# FEATURE-GATE-CODE-REVIEW-20261010

## Solicitud original

Parte del sprint: La revisión del diff es una compuerta con riesgo calculado en código y recibos atados al árbol entregado.
- R-REV-003: La revisión DEBE ajustar su profundidad al riesgo
- R-REV-004: El recibo de la revisión DEBE quedar atado al árbol revisado y caducar si cambia
- R-REV-005: Un hallazgo severo DEBE admitir una sola corrección acotada antes de escalar
Depende de: FEATURE-GATE-ARBOL-QA-RECIBO-20261010, FEATURE-ENGINE-RIESGO-REVISION-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La revisión DEBE ajustar su profundidad al riesgo El recibo de la revisión DEBE quedar atado al árbol revisado y caducar si cambia Un hallazgo severo DEBE admitir una sola corrección acotada antes de escalar
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la compuerta nueva `code-review`, que revisa el diff entregado de un ticket en `in_progress` antes de pasar a `awaiting_user_tests`: profundidad según el riesgo que ya calcula el motor, un recibo atado al árbol revisado que caduca si el árbol cambia, y una sola corrección acotada tras un bloqueo antes de escalar a una persona. La exigencia en la entrega, la adaptación de la jornada autónoma y de la corrida delegada, y la clave `code-review: exigida` son de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010 (el PO partió el ticket el 2026-10-10 y decidió no activar la clave en este repositorio). Cubre R-REV-003, R-REV-004 y R-REV-005 del sprint S4 de la feature `guardas-verificacion-harness` (`.valmen/features/guardas-verificacion-harness/spec/s4-revision-diff/spec.md`, decisión D4 de `.valmen/features/guardas-verificacion-harness/design.md`). Fuera de alcance: el cálculo del riesgo (R-REV-002, integrado con FEATURE-ENGINE-RIESGO-REVISION-20261010) y el árbol probado de `qa-mechanical` (R-REV-001, FEATURE-GATE-ARBOL-QA-RECIBO-20261010), que se reutilizan sin cambiar su regla; la skill `revision-final`, que sigue siendo la revisión en prosa; la prueba de punta a punta con un modelo guionado (sprint S6); y las rutas renombradas de `--name-only` (BUGFIX-ENGINE-DIFF-RUTAS-RENOMBRE-20261010).
- Usuario o rol afectado: el PO, que decide lo que la compuerta escala; los agentes y subagentes que la corren a mano con `valmen gate`, `evaluar_compuerta` del MCP o Mission Control; y quien configura el rol `reviewer` del enrutado. La jornada autónoma, la corrida delegada y la entrega no cambian en este ticket.
- Comportamiento actual: la compuerta no existe y la entrega no pide ninguna revisión del código. Reproducido hoy con el `dist` del worktree (commit d0bbcb0): `node packages/cli/dist/main.js gate code-review --id FEATURE-GATE-CODE-REVIEW-20261010 --dry-run` sale con 2 y «Gate desconocido: "code-review". Disponibles: analysis, plan, qa-mechanical.». Para entregar basta el recibo de `qa-mechanical` vigente por texto y por árbol. La revisión del diff es la skill `revision-final`, en prosa y sin recibo. `riesgoDeRevision` y `cambiosDelDiff` no tienen consumidor de producción: solo los usa su prueba.
- Comportamiento esperado: `valmen gate code-review --id <ID>` congela el diff del árbol de trabajo contra la base (por defecto `main`) y calcula el riesgo en código. Riesgo bajo: solo comprobaciones estructurales (secretos en lo agregado, archivos prohibidos, colores fijos como aviso), sin revisores. Medio: un revisor. Alto: un revisor con cuatro lentes (riesgo, resiliencia, legibilidad, fiabilidad). SECURITY: dos revisores a la vez, sin que uno vea la respuesta del otro; un hallazgo bloquea solo si lo confirman los dos y, si se contradicen, la compuerta queda en `review`. Los revisores son modelos sin herramientas que responden proposiciones de hecho —si el cambio introduce un defecto severo, citado con `ruta:línea`— y el código decide: un hallazgo cuenta solo si su cita cae en una línea que el cambio agrega o modifica. El recibo guarda la base, el árbol revisado, el riesgo, los revisores, sus respuestas y el costo. Tras un bloqueo se admite una corrección y una segunda ronda sobre lo que cambió desde el árbol revisado; si vuelve a bloquear, la compuerta queda escalada a una persona con los dos recibos y una tercera corrida se rechaza. La compuerta se corre a mano y su recibo todavía no condiciona la entrega a `awaiting_user_tests`: exigirlo es de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  1. No hay compuerta que revise el diff: `GATES` (`packages/gate/src/definitions.ts:377-381`) declara solo `analysis`, `plan` y `qa-mechanical`, y `gateById` (`packages/gate/src/definitions.ts:384-392`) rechaza cualquier otra; es el mensaje reproducido. `GateDefinition` (`packages/gate/src/decide.ts:210-281`) tiene banderas para desplegar criterios, impactos y comandos, y ninguna para un diff.
  2. `runGate` solo congela el texto del ticket: el estado es `buildGateState(ticket.text)` (`packages/engine/src/gate.ts:514`), el `stateHash` sale de ese estado (`packages/engine/src/gate.ts:548`) y el recibo se arma con él (`packages/engine/src/gate.ts:946-987`). Lo único que mira el código es el árbol de `qa-mechanical` (`packages/engine/src/gate.ts:749`, con `tomarArbol` en `packages/engine/src/gate.ts:418-427`), que guarda un hash, no el diff ni su contenido. `GateRunOptions` (`packages/engine/src/gate.ts:164-234`) ya inyecta `jev` y `judge` para las pruebas (`packages/engine/src/gate.ts:205-207`), pero no un revisor de diff.
  3. Ningún evaluador sabe citar `ruta:línea`, ni el código comprobar la cita: el juez pide por proposición solo `holds`, `confidence` y `reason` (`buildSchema`, `packages/gate-llm-judge/src/judge.ts:107-159`) sobre un estado JSON (`packages/gate-llm-judge/src/judge.ts:295-415`). El revisor que existe, `reviewWithModel` (`packages/gate-llm-judge/src/reviewer.ts:300-353`), devuelve `approve` o `reject` sobre un `review` de análisis o plan (`ETAPAS_REVISABLES`, `packages/engine/src/reviewer.ts:75`): justo lo que R-REV-003 excluye («ningún revisor aprueba»). Su lector estricto (`leerDecision`, `packages/gate-llm-judge/src/reviewer.ts:204-292`) sí es el patrón a seguir: lo que sale del esquema es `JudgeError`, nunca una aprobación.
  4. La entrega no exige revisión: al entrar a `awaiting_user_tests`, `transition` llama solo a `exigirVerificacionMecanica` (`packages/engine/src/transition.ts:461-463`, función en `packages/engine/src/transition.ts:201-235`), y `COMPUERTA_DE_DESTINO` (`packages/engine/src/transition.ts:245-248`) solo cubre `planned` y `approved`. `motivoDeArbolNoVigente` (`packages/engine/src/arbol-probado.ts:226-261`) ya compara el árbol de un recibo con el actual, pero el comando que propone repetir está fijo a `qa-mechanical` (`packages/engine/src/arbol-probado.ts:231`). La orientación del agente dice lo mismo: el caso `in_progress` de `computeNextStep` (`packages/engine/src/next-step.ts:374-431`) da la entrega por buena con el recibo mecánico.
  5. El diff que se entrega no se puede leer con lo que hay: el trabajo llega sin commitear (el commit va después de las pruebas del responsable), y `cambiosDelDiff` (`packages/engine/src/review-risk.ts:61-82`) compara dos refs. `pendingChanges` (`packages/engine/src/diff.ts:76`) lee las líneas agregadas con su número —lo que hace falta para comprobar una cita— y los archivos nuevos sin versionar, pero solo contra `HEAD`: en un worktree con commits propios no ve lo commiteado desde `main`. `git diff --merge-base main` da el árbol de trabajo contra la base común con `main`, que cubre los dos casos (comprobado aquí con git 2.54).
  6. No existe la noción de ronda: el control de repeticiones de `runGate` (`packages/engine/src/gate.ts:539-574`) solo impide repetir el mismo estado con el mismo evaluador, así que nada limita cuántas correcciones distintas se revisan. Lo que sí existe es la lectura del último recibo con la decisión humana colapsada (`veredictoDeCompuerta`, `packages/engine/src/receipts.ts:125-145`), y `withHumanDecision` ya admite decidir sobre un `block` con la frase literal salvo en `qa-mechanical` (`packages/gate/src/receipt.ts:475-499`).
- Dónde falta el comportamiento esperado: la definición, en `packages/gate/src/definitions.ts` (junto a `QA_MECHANICAL_GATE`, `packages/gate/src/definitions.ts:351-375`), con una bandera nueva en `GateDefinition`; un campo opcional del recibo en `packages/gate/src/receipt.ts`, como `testedTree` (`packages/gate/src/receipt.ts:253-265`), dentro de `GateReceipt` (`packages/gate/src/receipt.ts:148-243`) y `ReceiptInput` (`packages/gate/src/receipt.ts:360-393`); el diff contra la base, en `packages/engine/src/diff.ts`; un revisor de diff nuevo en el paquete gate-llm-judge (packages/gate-llm-judge/src/revisor-diff.ts, a crear); la corrida de la compuerta, en un módulo nuevo del motor (packages/engine/src/code-review.ts, a crear) al que `runGate` (`packages/engine/src/gate.ts:452`) despacha; y, para que el recibo caduque, la compuerta como parámetro de `motivoDeArbolNoVigente`. La exigencia en `packages/engine/src/transition.ts`, `packages/engine/src/next-step.ts`, `packages/engine/src/journey-brief.ts`, `packages/engine/src/autonomous-run.ts`, `packages/engine/src/discovery.ts` y `packages/cli/src/delegation.ts` es de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010. Las pruebas, en dos archivos nuevos de tests/ (code-review y revisor-diff).
- Lo que ya existe y se reutiliza sin cambiar su regla: el riesgo, `riesgoDeRevision` (`packages/engine/src/review-risk.ts:152-199`) con `categoriasDeRuta` (`packages/engine/src/path-categories.ts:64-73`); el árbol, `calcularArbolProbado` (`packages/engine/src/arbol-probado.ts:133-203`) y `rutasQueCambiaron` (`packages/engine/src/arbol-probado.ts:206-212`); la decisión por umbrales, `decide` (`packages/gate/src/decide.ts:435-527`) con `DEFAULT_POLICY` (`packages/gate/src/decide.ts:323`); la confianza convertida en probabilidad, `confidenceToProbability` (`packages/gate-llm-judge/src/judge.ts:241-245`); los escáneres, `scanSecrets` (`packages/engine/src/secrets.ts:174`), `scanFixedColors` con `isUiFile` (`packages/engine/src/presentation.ts:247` y `packages/engine/src/presentation.ts:60`) y `motivoDeArchivoProhibido` (`packages/engine/src/integration-rules.ts:43-51`); la llamada a un modelo sin herramientas, `claude -p --tools ""` sin configuración heredada ni MCP (`claudeCliArgs`, `packages/credentials/src/claude-cli.ts:132-165`), lanzado desde un directorio temporal (`packages/credentials/src/claude-cli.ts:394`); el rol `reviewer` del enrutado (`packages/adapter/src/routing.ts:131-136`); y la inyección de evaluadores falsos que ya usan la cascada (`packages/engine/src/cascade.ts:160-162` y `packages/engine/src/cascade.ts:273-274`) y la prueba del revisor con `fetchImpl` y `cliRunner` (`tests/agente-revisor.test.ts:216-222`).
- Hipótesis pendientes:
  - H1 (tamaño de la entrada): el diff con `--unified=5`, sin `tickets/` ni `.valmen/`, de los últimos 40 commits mide hasta 111 KB (e824417, 10 archivos) y en su mayoría menos de 75 KB; el contenido completo de los archivos tocados no está medido. Se mide en la implementación y dice si el tope de entrada del plan alcanza.
  - H2 (tope de salida): que `maxTokens` —que en `claude -p` viaja por `CLAUDE_CODE_MAX_OUTPUT_TOKENS`— no corte la salida estructurada no está comprobado.
  - H3 (mismo modelo): en `.valmen/routing.yaml:47-50` el rol `reviewer` es `claude-sonnet-5-5`, el mismo modelo que `agent-implementation` (`.valmen/routing.yaml:15-18`); el efecto de revisar con el modelo que implementó no está medido.
  - H4 (texto dirigido al revisor dentro del diff): como el revisor no aprueba, el efecto posible es un falso negativo, no una aprobación; no está medido.
  - H5 (git): `git diff --merge-base` exige git 2.30 o posterior; aquí hay 2.54, y en otras máquinas no está comprobado.
- Consumidores afectados:
  - Entrega, de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010 y no de este ticket: `transition` (`packages/engine/src/transition.ts:461-463`) y `computeNextStep` (`packages/engine/src/next-step.ts:374-431`). Aquí solo cambia cómo llaman a `motivoDeArbolNoVigente`: le pasan `qa-mechanical`, con el mismo mensaje de hoy.
  - Quienes entregan en la misma llamada: la jornada autónoma corre `qa-mechanical` (`packages/engine/src/autonomous-run.ts:483`) y entrega enseguida (`packages/engine/src/autonomous-run.ts:516`); la corrida delegada resuelve `qa-mechanical` y entrega (`packages/cli/src/delegation.ts:314-323`) con `resolverCompuerta` (`packages/cli/src/ceremony.ts:110`), que aprueba un `review` por delegación cuando trae un motivo. No cambian en este ticket: sin exigencia, no se frenan; adaptarlas es de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010.
  - El brief del subagente lista las compuertas de implementación (`packages/engine/src/journey-brief.ts:195-201`); sumar `code-review` es de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010.
  - Bordes que corren compuertas: `runGateFromFlags` del CLI (`packages/cli/src/main.ts:1470-1534`), que pasa credenciales por proveedor solo a la cascada; `correrCompuerta` del MCP (`packages/mcp/src/tools.ts:2392`) y el `enum` de `evaluar_compuerta` (`packages/mcp/src/tools.ts:936`); el servidor de Mission Control (`packages/server/src/gates.ts:445`), que además arma una tarjeta por cada entrada de `GATES` (`packages/server/src/gates.ts:285` y `packages/server/src/gates.ts:331`).
  - Medición sobre el histórico: `simulateGate` (`packages/engine/src/simulate.ts:149`), que el CLI llama con cualquier id que acepte `gateById` (`packages/cli/src/main.ts:1808` y `packages/cli/src/main.ts:1860`). Un ticket histórico no tiene el diff de su entrega, así que la compuerta nueva no se puede simular. Las listas fijas de umbrales y promociones (`packages/engine/src/discovery.ts:216`, `packages/engine/src/gate-promotion.ts:96`, `packages/server/src/politicas.ts:25`) y los `enum` de `simular_compuerta` y `calibrar_compuerta` (`packages/mcp/src/tools.ts:1077` y `packages/mcp/src/tools.ts:1226`) no la incluyen y no tienen por qué.
  - Enrutado: el rol `reviewer` tiene hoy un consumidor, `valmen review-agent` (`packages/adapter/src/routing.ts:131-136`). Un rol nuevo obligaría a declararlo en todo perfil, porque `comprobarPerfilCompleto` (`packages/adapter/src/routing.ts:550-575`) da un error por cada rol que falte.
  - Lectores de recibos: `readReceipts`, el informe de consumo y la precisión leen el recibo sin esquema; un campo opcional nuevo no los cambia. `review-agent` y la aprobación por autorización solo actúan sobre `analysis` y `plan` (`packages/engine/src/reviewer.ts:75`), así que ningún modelo puede aprobar un `review` de `code-review`.
  - Riesgo: `riesgoDeRevision` gana su primer consumidor de producción; `cambiosDelDiff` sigue con el suyo, la prueba (`tests/riesgo-revision.test.ts:20-21`).
  - Pruebas existentes que tocan lo que cambia aquí: `tests/gate-mecanico.test.ts`, `tests/arbol-probado.test.ts` y `tests/next-step.test.ts` (llaman a `motivoDeArbolNoVigente` por la entrega); `tests/routing.test.ts`, que fija el `consumer` del rol `reviewer` (`tests/routing.test.ts:147`); `tests/gate-view.test.ts` y `tests/mcp-server.test.ts` (tarjetas y compuertas que se pueden evaluar). Su entrega queda igual.
- Archivos y flujo investigados: la spec `.valmen/features/guardas-verificacion-harness/spec/s4-revision-diff/spec.md` (R-REV-003 a R-REV-005) y `.valmen/features/guardas-verificacion-harness/design.md` (D4); `packages/gate/src/definitions.ts`, `packages/gate/src/decide.ts`, `packages/gate/src/receipt.ts`, `packages/engine/src/gate.ts`, `packages/engine/src/transition.ts`, `packages/engine/src/next-step.ts`, `packages/engine/src/receipts.ts`, `packages/engine/src/arbol-probado.ts`, `packages/engine/src/review-risk.ts`, `packages/engine/src/path-categories.ts`, `packages/engine/src/diff.ts`, `packages/engine/src/secrets.ts`, `packages/engine/src/presentation.ts`, `packages/engine/src/integration-rules.ts`, `packages/engine/src/reviewer.ts`, `packages/engine/src/cascade.ts`, `packages/engine/src/autonomous-run.ts`, `packages/engine/src/journey-brief.ts`, `packages/engine/src/discovery.ts`, `packages/gate-llm-judge/src/judge.ts`, `packages/gate-llm-judge/src/reviewer.ts`, `packages/credentials/src/claude-cli.ts`, `packages/adapter/src/routing.ts`, `packages/adapter/src/config.ts`, `packages/cli/src/main.ts`, `packages/cli/src/delegation.ts`, `packages/cli/src/ceremony.ts`, `packages/mcp/src/tools.ts`, `packages/server/src/gates.ts` y `scripts/exports-sin-uso.mjs`. Flujo de hoy: `valmen gate <id>` → `runGateFromFlags` → `runGate`: `gateById`, estado aplicable, congelado de `buildGateState`, control de repeticiones, expansión, evaluador, `decide`, `buildReceipt` y `appendReceipt`; `valmen transition --to awaiting_user_tests` → `exigirVerificacionMecanica`. Memoria del proyecto (búsquedas «gate code-review revisión diff riesgo corrección» y «cascade judge jev inyectar pruebas revisor»): AP-001, AP-003 a AP-005 y AP-007 a AP-010; ninguno trata la revisión del diff; AP-004 y AP-009 aplican a cómo se decide y se firma un bloqueo, y AP-010 a cómo se lee el plan de un ticket que crea archivos.
- Riesgos y compatibilidad:
  - Entrega: este ticket no la cambia, y el recibo de `qa-mechanical` con su regla tampoco. Exigir la revisión, con su efecto sobre la jornada y la delegación, es de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010.
  - Costo: cada corrida con revisores es una o dos llamadas a un modelo con el diff completo; sin topes, una entrega grande es una llamada cara y una corrección tras otra no tiene fin. El plan fija el tope de entrada, el de salida y el de rondas.
  - Autoridad de la propia compuerta: un diff que cambia la compuerta, su riesgo o su configuración se juzgaría con las reglas que él mismo cambia.
  - Datos que salen a un modelo: el diff y los archivos tocados van a un proveedor; el revisor de análisis ya se niega a enviar un artefacto con una credencial (`packages/engine/src/reviewer.ts:261-268`).
  - Árbol que cambia mientras corre la compuerta, revisores caídos o fuera de esquema, falsos negativos (H4) y mismo modelo (H3).
  - Recibos ya escritos: el campo nuevo es opcional y `RECEIPT_VERSION` no sube; los lectores ignoran lo que no conocen.
- Impactos de sync, migración, Docker o despliegue: ninguno. No toca sincronización, contenedores ni despliegue, y no migra el registro: los recibos existentes no se reescriben. Cambia el motor, el CLI, el MCP y el servidor locales (`@valmen/gate`, `@valmen/gate-llm-judge`, `@valmen/engine`, `@valmen/adapter`, `@valmen/cli`, `@valmen/mcp`, `@valmen/server`) y sus pruebas.

## Plan

- Alcance y exclusiones: la Parte A de la compuerta `code-review`: su definición, el revisor de diff, la corrida con profundidad por riesgo, el recibo atado al árbol revisado, las rondas con una sola corrección y su invocación a mano desde el CLI (`valmen gate code-review --id <ID>`), el MCP (`evaluar_compuerta`) y Mission Control. Por decisión del PO del 2026-10-10 («Partir: A aquí, B en un ticket nuevo (Recomendado)»), la exigencia en la entrega (`transition`, `computeNextStep` y el brief del subagente), la adaptación de la jornada autónoma y de la corrida delegada, y la clave `code-review: exigida` son de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010, que depende de este ticket; y la clave no se activa en este repositorio («No activar ahora (Recomendado)»). Quedan fuera además: la regla del riesgo (`riesgoDeRevision`) y la del árbol probado, que se usan tal cual; `qa-mechanical`, cuyo recibo y entrega no cambian; la skill `revision-final`; subir el riesgo a mano desde el CLI (`subirA` ya existe en el motor; exponerlo es otro ticket); la diversidad obligatoria de modelos entre revisores; y la prueba con un modelo guionado (sprint S6).
- Decisiones de diseño (confirman D4 de `.valmen/features/guardas-verificacion-harness/design.md`, opción B):
  - Qué responde el modelo: proposiciones de hecho, nunca «¿apruebas?». Riesgo medio: `sin_hallazgo_severo` («el cambio no introduce un defecto severo causado por él mismo: rompe un comportamiento existente, pierde o corrompe datos, abre un acceso indebido o deja un error sin manejar»). Riesgo alto: cuatro lentes, `sin_hallazgo_severo_riesgo`, `sin_hallazgo_severo_resiliencia`, `sin_hallazgo_severo_legibilidad` y `sin_hallazgo_severo_fiabilidad`. Por proposición el revisor devuelve `cumple`, `confianza`, `motivo` y `hallazgos` con `ruta`, `linea` y `motivo`; lo que ya estaba antes del cambio no cuenta.
  - Qué ve cada revisor: solo la entrada congelada, un texto que arma el código antes de llamar: (a) contexto del ticket —id, tipo, título, `## Descripción funcional` y `## Plan`—, marcado como contexto y no como evidencia; (b) el parche `git diff --no-color --no-ext-diff --no-renames --unified=5 --merge-base <base> --` de los archivos funcionales, sin el registro del propio ticket (la regla de `esRegistroDelTicket`, `packages/engine/src/review-risk.ts:85-91`), más los archivos nuevos sin versionar como altas completas; (c) el contenido completo, después del cambio, de cada archivo de texto tocado (de un binario, solo el nombre). Nunca el árbol vivo: el revisor corre sin herramientas (`claude -p --tools ""` desde un directorio temporal, o una llamada HTTP sin herramientas) y el prompt de sistema dice que el diff es dato, no instrucciones. Si la entrada trae una credencial fuera de las líneas agregadas, no se envía y la compuerta queda en `review`. En SECURITY los dos revisores reciben el mismo texto en dos llamadas simultáneas (`Promise.all`) y ninguno recibe la salida del otro.
  - Cómo se congela el árbol: `calcularArbolProbado` (T0) antes de leer el diff; se arma la entrada; se recalcula (T1) y, si difiere de T0, se aborta sin llamar a nadie ni escribir recibo. El `stateHash` es `hashState` de la entrada congelada (texto, base, riesgo, ronda) y `testedTree` guarda T0, el árbol revisado. Al volver los revisores se recalcula (T2): si difiere de T0, el recibo conserva T0 y anota hasta 10 rutas de `rutasQueCambiaron`, como `qa-mechanical`. El recibo caduca si el árbol cambia: `motivoDeArbolNoVigente` con la compuerta `code-review` lo da por vencido y nombra `valmen gate code-review --id <ID>`. Que la entrega exija un recibo vigente es de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010.
  - Cómo decide el código: un hallazgo cuenta solo si su `ruta` está en el diff y su `linea` cae en un tramo que el cambio agrega o modifica (los `@@ +n,m @@` del parche; en un borrado, la línea del corte). Valor de la proposición: `cumple` verdadero → `confidenceToProbability(true, c)`; falso con un hallazgo verificado → `confidenceToProbability(false, c)`; falso sin hallazgo verificado → 0.5, en banda: una persona lo mira, no se bloquea sin cita ni se aprueba en silencio. Decide `decide` con `DEFAULT_POLICY` (aprueba desde 0.9, bloquea hasta 0.1). En SECURITY, por proposición: hallazgo verificado de los dos revisores en la misma ruta a 3 líneas o menos → el menor valor (bloquea); de uno solo → 0.5 (`review`); de ninguno → el menor de los dos valores. Después, topes que solo bajan el veredicto: secreto en una línea agregada → `block` sin revisores; archivo que rechaza `motivoDeArchivoProhibido` → `review` sin revisores; archivo de la propia compuerta → como máximo `review`; entrada mayor que el tope → `review` sin revisores. Un color fijo agregado es una nota y no veta.
  - Profundidad: el riesgo sale de `riesgoDeRevision` con los cambios contra la base, el ticket, `ticketsDir` y los scripts que nombran los prefijos de `test-commands`. Bajo → sin revisores (evaluador `command`); medio → un revisor; alto → un revisor con las cuatro lentes en una llamada; tipo SECURITY → dos revisores con las cuatro lentes (evaluador `llm-judge`). Las proposiciones que la profundidad no usa quedan en `notApplicable` con su motivo. El revisor es la ruta del rol `reviewer` (`routeFor(rutasDelProyecto(root), "reviewer")`), sin rol nuevo; si su modelo es el de `agent-implementation`, el recibo lo anota (H3).
  - Una sola corrección: el ciclo vigente son los recibos de `code-review` posteriores a la última decisión humana. Ronda 1 si el ciclo está vacío o su último recibo aprobó; ronda 2 si el último es de ronda 1 y no aprobó; con el último de ronda 2 sin aprobar, la corrida se rechaza con `EXIT_INVARIANT`, sin revisores ni recibo, y dice que lo decide una persona con `valmen gate-decide`. Un rechazo humano abre un ciclo nuevo. La ronda 2 recibe los hallazgos verificados de la ronda 1 y se acota a lo que cambió desde el árbol revisado —archivos del diff con otro sha256 que en la ronda 1, o que entraron o salieron del diff—, pero solo si la ronda 1 corrió revisores sobre el diff completo; si no, revisa el diff completo. Un hallazgo de la ronda 1 en un archivo que la corrección no tocó bloquea sin llamar al revisor. La profundidad de la ronda 2 es la mayor entre la de la ronda 1 y la del diff actual. Una ronda 2 que no aprueba queda en `review` (`escalatedTo: human`) con el motivo «segunda ronda: lo decide una persona; recibos <R1> y <R2>; no se abre una tercera».
  - Costo máximo por corrida: revisores 0 (bajo), 1 (medio o alto) o 2 (SECURITY); entrada de hasta `TOPE_DE_ENTRADA` = 240 000 bytes por llamada (unos 60 000 a 80 000 tokens): si el parche con los archivos completos lo pasa se envía solo el parche, y si el parche solo lo pasa no se llama a nadie; salida de hasta 4 096 tokens por llamada (`maxTokens`); espera de hasta `TIMEOUT_JUEZ_MS`. Por ciclo, a lo sumo 2 rondas: 4 llamadas. El recibo suma el `usage` real (tokens y `costUsd`) de todos los revisores. Una falla del revisor (red, esquema) no deja recibo, igual que hoy (`packages/engine/src/gate.ts:828-835`), y no consume ronda.
  - Cómo se prueba sin gastar tokens: `GateRunOptions.reviewDiff` inyecta un revisor falso, con el mismo nombre en `runCodeReview`, como hoy `judge` y `jev`; las pruebas cuentan las llamadas y comparan la entrada que recibió cada revisor. El revisor real se prueba con `fetchImpl` y `cliRunner` falsos, como `tests/agente-revisor.test.ts`. Los laboratorios son repositorios git temporales con `spawnSync`, sin red ni credenciales.
  - Cómo se evita que la compuerta amplíe su propia autoridad: (a) la profundidad la decide el riesgo y `--evaluator` se rechaza; (b) un diff que toca un archivo de la propia compuerta —lista `ARCHIVOS_DE_LA_COMPUERTA`: `packages/gate/src/definitions.ts`, `packages/gate/src/decide.ts`, `packages/gate/src/receipt.ts`, `packages/gate-llm-judge/src/revisor-diff.ts`, `packages/engine/src/code-review.ts`, `packages/engine/src/review-risk.ts`, `packages/engine/src/path-categories.ts`, `packages/engine/src/arbol-probado.ts`, `packages/engine/src/diff.ts`, `packages/engine/src/secrets.ts`, `packages/engine/src/presentation.ts`, `packages/engine/src/integration-rules.ts`, `packages/engine/src/transition.ts`, `.valmen/config.yaml` y `.valmen/routing.yaml`— queda como máximo en `review`; (c) ningún modelo aprueba un `review` de esta compuerta: `review-agent` y la aprobación por autorización siguen limitados a `analysis` y `plan`; (d) un `block` de `code-review` admite la decisión de una persona con su frase literal (`withHumanDecision`), nunca la del agente; (e) en este ticket la compuerta no condiciona ninguna entrega, así que su recibo no puede habilitar nada (C30).
  - Invocación sin exigencia: no se agrega ninguna clave ni se cambia la entrega. La compuerta se corre a mano con `valmen gate code-review --id <ID>` sobre un ticket en `in_progress`, deja su recibo y no frena ni habilita la entrega a `awaiting_user_tests`, que sigue pidiendo solo `qa-mechanical` (C29, C30).
  - Base: `--base <ref>` en el CLI; sin ella, `main` si existe y si no `HEAD`. El recibo guarda el ref pedido y el commit de `git merge-base <ref> HEAD`.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma la partición (este ticket es la Parte A; la exigencia en la entrega y la clave `code-review: exigida` son de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010) y que la clave no se activa en este repositorio por ahora.
- Pasos ordenados:
  1. En `packages/gate/src/decide.ts`, agregar el campo opcional `diffReview?: boolean` a `GateDefinition` (`:210-281`). En `packages/gate/src/definitions.ts`, crear `CODE_REVIEW_GATE` (id `code-review`, transición `in_progress → awaiting_user_tests`, modo `hybrid`, `appliesTo: ["in_progress"]`, `DEFAULT_POLICY`, `diffReview: true`, checks `sin_secretos`, `sin_archivos_prohibidos` y `colores_fijos`, y las cinco proposiciones `noul` de las decisiones de diseño) y registrarla en `GATES` (`:377-381`). (C5, C6, C9, C11)
  2. En `packages/gate/src/receipt.ts`, agregar la interfaz `CodeReviewRecord` y el campo opcional `codeReview` en `GateReceipt` (`:148-243`) y en `ReceiptInput` (`:360-393`): `base` (`ref`, `commit`), `riesgo` (`nivel`, `motivos`), `profundidad`, `ronda`, `reciboAnterior`, `entrada` (`sha256`, `bytes`, `soloParche`, `archivos` con `ruta`, `estado`, `sha256`), `revisores` (`rol`, `provider`, `model`, `resolvedVersion`, `effort`, `respuestas` con `proposicion`, `cumple`, `confianza`, `motivo`, `hallazgos` con `ruta`, `linea`, `motivo`, `verificado`; `usage`, `latencyMs`) y `propiaCompuerta`. `buildReceipt` (`:396`) lo copia solo si viene; `RECEIPT_VERSION` sigue en 1. (C17, C19, C20, C21)
  3. En `packages/engine/src/diff.ts`, crear `cambiosContraBase(root, base, ticketId, ticketsDir)` con el `git` de solo lectura del módulo (`:39-47`): `merge-base <base> HEAD`, `diff --name-status --no-renames -z --merge-base <base> --`, el parche de las decisiones de diseño y `ls-files --others --exclude-standard -z`. Devuelve el commit base, los cambios `{ estado, ruta }` con la forma que pide `riesgoDeRevision`, el parche, los tramos cambiados por archivo y los bloques agregados para `scanSecrets` y `scanFixedColors`, sin el registro del propio ticket. `pendingChanges` (`:76`) no cambia. (C2, C4, C9, C10, C17, C24)
  4. Crear `packages/gate-llm-judge/src/revisor-diff.ts` con `reviewDiffWithModel({ provider, model, effort, entrada, proposiciones, apiKey?, fetchImpl?, cliRunner?, timeoutMs? })`: `callChat` con `maxTokens: 4096`, salida estructurada con una clave por proposición y un lector estricto como `leerDecision` (`packages/gate-llm-judge/src/reviewer.ts:204-292`) que lanza `JudgeError` (`MALFORMED_RESPONSE`, `MISSING_ANSWER`) ante cualquier respuesta fuera del esquema; exportarlo en `packages/gate-llm-judge/src/index.ts`. (C5, C6, C13)
  5. Crear `packages/engine/src/code-review.ts` con `runCodeReview(paths, options, ticket)`, primera mitad: T0 con `calcularArbolProbado`; `cambiosContraBase`; `riesgoDeRevision`; comprobaciones estructurales (`scanSecrets` sobre los bloques agregados, `motivoDeArchivoProhibido` sobre las rutas, `scanFixedColors` sobre los bloques de `isUiFile`, `ARCHIVOS_DE_LA_COMPUERTA`); profundidad; entrada congelada con `TOPE_DE_ENTRADA`; T1 y aborto si cambió. (C1, C2, C3, C4, C15, C16)
  6. En `packages/engine/src/code-review.ts`, segunda mitad: llamar a `options.reviewDiff ?? reviewDiffWithModel` con la ruta del rol `reviewer` (dos llamadas con `Promise.all` en SECURITY); verificar cada hallazgo contra los tramos cambiados; convertir con `confidenceToProbability`; combinar los dos revisores de SECURITY; decidir con `decide`; aplicar los topes. (C5, C6, C7, C8, C9, C10, C11, C12, C13, C15, C16)
  7. En `packages/engine/src/code-review.ts`, las rondas: `rondaDelCiclo(recibos)` con `currentReceipts`; el rechazo de la tercera corrida; el acotado de la ronda 2 por sha256 contra `codeReview.entrada.archivos` de la ronda 1; el bloqueo en código del hallazgo no atendido; la escalada a `review` que cita los dos recibos. (C24, C25, C26, C27, C28)
  8. En `packages/engine/src/code-review.ts`, el recibo y el informe: T2 con la nota de `rutasQueCambiaron`; `buildReceipt` con `testedTree` = T0, `codeReview`, `usage` sumado, `model` del primer revisor, `evaluator` (`command` sin revisores, `llm-judge` con revisores), `notApplicable` y el `stateHash` de la entrada congelada; el control de repeticiones sobre ese estado; el id de `defaultReceiptId` (`packages/engine/src/gate.ts:397-412`, que se exporta para no copiarlo); y las líneas del informe (riesgo con motivos, profundidad, ronda, revisores, costo, árbol revisado). (C17, C18, C19, C20, C21, C22, C29)
  9. En `packages/engine/src/gate.ts`, sumar `reviewDiff` y `base` a `GateRunOptions` (`:164-234`); en `runGate` (`:452`), después de la comprobación de estado (`:494-504`), si `definition.diffReview === true`, rechazar `options.evaluator` con `EXIT_SCHEMA` sin llamar a nadie y despachar a `runCodeReview`. En `packages/engine/src/simulate.ts`, `simulateGate` (`:149`) rechaza una compuerta con `diffReview`. En `packages/engine/src/arbol-probado.ts`, `motivoDeArbolNoVigente` (`:226-261`) recibe la compuerta y nombra su comando (`:231`); `packages/engine/src/transition.ts` y `packages/engine/src/next-step.ts` le pasan `qa-mechanical` donde ya la llaman, sin cambiar su comportamiento ni sumar ninguna exigencia. (C14, C23, C29, C30)
  10. Bordes: en `packages/cli/src/main.ts`, `runGateFromFlags` (`:1470-1534`) pasa `--base` y un resolvedor de credenciales por proveedor para `code-review`; en `packages/mcp/src/tools.ts`, `code-review` entra al `enum` de `evaluar_compuerta` (`:936`) y `correrCompuerta` (`:2392`) pasa el resolvedor; en `packages/server/src/gates.ts`, la evaluación (`:445`) pasa el resolvedor; en `packages/adapter/src/routing.ts`, el `consumer` del rol `reviewer` (`:131-136`) suma `valmen gate code-review`, y la aserción de `tests/routing.test.ts:147`, que fija ese texto, se actualiza al nuevo. (C5, C6, C7, C29)
  11. Crear `tests/revisor-diff.test.ts` (revisor real con `fetchImpl` y `cliRunner` falsos: esquema válido, respuesta en prosa, proposición faltante) y `tests/code-review.test.ts` (laboratorios git con base `main`, sin la clave `code-review: exigida`, con un revisor falso inyectado que cuenta llamadas y guarda su entrada: C1–C30). Correr desde la raíz del worktree `npx vitest run tests/revisor-diff.test.ts tests/code-review.test.ts`; luego las suites existentes del comando de C31, que empieza por `tests/gate-mecanico.test.ts`; después `npm run build`, `npx tsc --build tsconfig.build.json`, `npx tsc --noEmit -p tsconfig.json` y `node scripts/exports-sin-uso.mjs`. Medir el tamaño de la entrada sobre el diff de este ticket (H1) y anotarlo en `## Implementación`. (C1–C33)
- Compatibilidad: la entrega no cambia en ningún proyecto, tampoco en este: sigue pidiendo solo `qa-mechanical`. El recibo de `qa-mechanical`, su `stateHash`, `subject.revision`, el control de repeticiones de las otras compuertas y la cascada no cambian; `motivoDeArbolNoVigente` da el mismo mensaje para `qa-mechanical`. El campo `codeReview` es opcional y `RECEIPT_VERSION` no sube: los recibos ya escritos no se reescriben y el código anterior ignora el campo. No se agrega un rol al enrutado, así que los perfiles existentes siguen completos; cambia solo el texto `consumer` del rol `reviewer`. Mission Control muestra una tarjeta más (la de `code-review`) y `evaluar_compuerta` acepta el id nuevo. `simulateGate` rechaza la compuerta nueva en vez de dar un número sin significado.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false), y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 24 con las dependencias del monorepo, `git` 2.30 o posterior en el `PATH`, sin red ni credenciales; resultado esperado, los comandos del paso 11 sin fallos. Comprobación manual opcional, que gasta una llamada: `valmen gate code-review --id <ID>` sobre un ticket en `in_progress` con un diff pequeño y el revisor del enrutado, y leer el recibo con `valmen show`.
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que quita la compuerta, el campo del recibo, el revisor de diff, el módulo `packages/engine/src/code-review.ts`, el parámetro de `motivoDeArbolNoVigente`, los cambios en el CLI, el MCP, el servidor y el texto del rol `reviewer`, y las pruebas. No hay datos que migrar ni entregas que deshacer: la compuerta no condiciona ninguna, y los recibos con `codeReview` quedan en el registro append-only, donde el código anterior los lee ignorando el campo.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 — R-REV-003: Con un diff que solo toca pruebas, el recibo de `code-review` aprueba sin llamar a ningún revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C2 — R-REV-003: Un secreto en una línea agregada bloquea la compuerta sin llamar a ningún revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C3 — R-REV-003: Un archivo que rechaza `motivoDeArchivoProhibido` deja la compuerta en `review` sin llamar a ningún revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C4 — R-REV-003: Un color fijo agregado en un archivo de interfaz queda como nota del recibo sin cambiar el veredicto.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C5 — R-REV-003: Con riesgo medio, la compuerta llama una sola vez al revisor con la proposición `sin_hallazgo_severo`.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C6 — R-REV-003: Con riesgo alto, la compuerta llama una sola vez al revisor con las cuatro proposiciones de lente.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C7 — R-REV-003: En un ticket SECURITY, la compuerta llama a dos revisores con la misma entrada congelada.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C8 — R-REV-003: En un ticket SECURITY, ninguno de los dos revisores recibe la respuesta del otro.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C9 — R-REV-003: Un hallazgo severo citado con `ruta:línea` dentro de las líneas cambiadas bloquea la compuerta.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C10 — R-REV-003: Un hallazgo citado fuera de las líneas cambiadas deja su proposición en banda de revisión.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C11 — R-REV-003: En un ticket SECURITY, un hallazgo que confirman los dos revisores bloquea la compuerta.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C12 — R-REV-003: En un ticket SECURITY, un hallazgo que informa un solo revisor deja la compuerta en `review`.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C13 — R-REV-003: Una respuesta del revisor fuera del esquema no deja ningún recibo `approve`.
      <!-- test: npx vitest run tests/revisor-diff.test.ts tests/code-review.test.ts -->
- [ ] C14 — R-REV-003: `valmen gate code-review` con `--evaluator` se rechaza sin llamar a ningún revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C15 — R-REV-003: Un diff que toca un archivo de la propia compuerta deja como máximo un recibo `review`.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C16 — R-REV-003: Un diff mayor que el tope de entrada deja la compuerta en `review` sin llamar a ningún revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C17 — R-REV-004: El recibo de `code-review` guarda la base resuelta como commit.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C18 — R-REV-004: El recibo de `code-review` guarda en `testedTree` el árbol revisado.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C19 — R-REV-004: El recibo de `code-review` guarda el nivel de riesgo calculado con sus motivos.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C20 — R-REV-004: El recibo de `code-review` guarda el modelo de cada revisor con sus respuestas.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C21 — R-REV-004: El recibo de `code-review` suma en `usage.costUsd` el costo de todos los revisores.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C22 — R-REV-004: Si el árbol cambia mientras corren los revisores, el recibo anota las rutas que cambiaron.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C23 — R-REV-004: Con un archivo funcional cambiado después del recibo de `code-review`, `motivoDeArbolNoVigente` lo da por vencido nombrando `valmen gate code-review --id <ID>`.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C24 — R-REV-005: Tras un bloqueo, la segunda corrida envía al revisor solo los archivos que cambiaron desde el árbol revisado.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C25 — R-REV-005: Un hallazgo de la primera ronda en un archivo que la corrección no tocó bloquea la segunda ronda sin llamar al revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C26 — R-REV-005: Una segunda ronda que vuelve a bloquear deja un recibo escalado a una persona que cita los dos recibos.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C27 — R-REV-005: Tras la segunda ronda sin decisión humana, una tercera corrida se rechaza sin llamar a ningún revisor.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C28 — R-REV-005: Tras el rechazo humano de la segunda ronda, la siguiente corrida vuelve a ser la primera ronda.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C29 — R-REV-003: Sin la clave `code-review: exigida`, `valmen gate code-review --id <ID>` corre a mano hasta dejar su recibo.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C30 — R-REV-004: Un recibo `block` de `code-review` no impide entregar a `awaiting_user_tests` con el recibo vigente de `qa-mechanical`.
      <!-- test: npx vitest run tests/code-review.test.ts -->
- [ ] C31 — Las pruebas existentes de compuertas, entrega, recibos, calibración, riesgo, revisor, enrutado, panel, servidor MCP pasan con la compuerta nueva.
      <!-- test: npx vitest run tests/gate-mecanico.test.ts tests/arbol-probado.test.ts tests/next-step.test.ts tests/gate-command.test.ts tests/compuerta-repetida.test.ts tests/receipts-compat.test.ts tests/calibration.test.ts tests/riesgo-revision.test.ts tests/agente-revisor.test.ts tests/routing.test.ts tests/gate-view.test.ts tests/mcp-server.test.ts -->
- [ ] C32 — El monorepo compila con la compuerta nueva.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [ ] C33 — El cambio no deja exportaciones nuevas sin consumidor.
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
    "at": "2026-10-10T21:47:32.618Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T00:41:45.105Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T00:47:13.676Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T01:42:54.624Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-GATE-CODE-REVIEW-20261010-plan-2, canal cli, decidida 2026-10-11T01:42:54.618Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T01:42:55.026Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado)\",\"planHash\":\"sha256:43fa0f4d395e10bf7f0bbfc567fae4438188dabd90472c7a5386cc8128b3f3fd\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T01:42:55.603Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:43fa0f4d395e10bf7f0bbfc567fae4438188dabd90472c7a5386cc8128b3f3fd."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T01:42:55.603Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
