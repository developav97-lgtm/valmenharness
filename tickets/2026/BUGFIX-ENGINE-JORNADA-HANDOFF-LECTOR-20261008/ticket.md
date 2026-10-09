---
schema_version: 2
id: BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008
title: El parte reconoce el contrato de pruebas en lista numerada y no lista como sin entregar a los cerrados
type: BUGFIX
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008

## Solicitud original

Al correr `valmen journey handoff --id JOR-20261008 --project valmen-harness` con el parte real de la corrida de prueba del 2026-10-08, dos de siete tickets (FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007 y FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007) salieron como «sin contrato de pruebas: el ticket no trae comandos» aunque su sección `## Pruebas` sí los trae, escritos como lista numerada (`1. \`npx vitest run …\` — esperado: …`). Además la sección «SIN ENTREGAR TODAVÍA» lista tickets que ya están cerrados (por ejemplo SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007 [closed]). Esperado: el parte extrae el comando y el resultado esperado también de la lista numerada con raya, y «sin entregar» solo lista tickets que no llegaron a awaiting_user_tests ni a un estado posterior. Origen: criterio C29 de FEATURE-ENGINE-JORNADA-HANDOFF-20261008, que quedó abierto por este defecto.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el armado del parte de la jornada (`armarParteDeJornada` en `packages/engine/src/journey-handoff.ts`): la lectura del contrato de `## Pruebas` y la clasificación de cada ticket de la jornada en los bloques del parte. No cambia el formato de `.valmen/journeys/handoffs.jsonl` ni el envío por mensajería.
- Usuario o rol afectado: el PO, que recibe el parte (`valmen journey handoff`, `--to telegram:<id>`) y decide qué probar sin abrir cada ticket.
- Comportamiento actual: un contrato escrito como lista numerada (`1. \`npx vitest run …\` — esperado: …`) sale como «sin contrato de pruebas: el ticket no trae comandos», sin directorio ni validaciones manuales; y un ticket cerrado o en QA cuya QA confirmó una persona sale en «SIN ENTREGAR TODAVÍA».
- Comportamiento esperado: los ítems numerados se leen igual que las viñetas con guion (comando con su resultado esperado, directorio y validación manual); una línea suelta `Directorio: …` también da el directorio; «sin entregar» lista solo los tickets cuyo estado es anterior a `awaiting_user_tests` (`intake`, `analyzed`, `planned`, `approved`, `in_progress`), los devueltos o detenidos (`changes_requested`, `blocked`) y los ilegibles (`?`); `in_qa`, `qa_approved` y `closed` no confirmados por política no aparecen en ningún bloque.

## Diagnóstico

- Memoria: `buscar_memoria` («parte jornada handoff contrato de pruebas lista numerada sin entregar cerrados») no devolvió nada de este módulo (solo AP-003/006/007/008/010, de compuertas).
- Reproducción con datos reales: el primer parte guardado de JOR-20261008 (`.valmen/journeys/handoffs.jsonl:1`, generado 2026-10-08T22:42:10Z) trae `sinContrato: true, probar: []` para FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007 y FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007, y lista en `sinEntregar` siete tickets `closed` (entre ellos SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007); el segundo (`handoffs.jsonl:2`, 2026-10-09T03:24:15Z) repite lo segundo con FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 y FEATURE-WEB-MOTOR-ESCENA-20261008 `closed`. Reproducido además en un registro temporal (`crearEntornoOla`) con el texto real de esos tres tickets, los dos primeros puestos en `awaiting_user_tests`: FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 sale `sinContrato=true probar=0 directorio=null manuales=0` aunque su `## Pruebas` trae `1. \`npx vitest run tests/routing.test.ts …\` — esperado: …`, `2. \`npx tsc --noEmit -p tsconfig.json\` — esperado: sin errores` y `3. Manual: …`; SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007 (`closed`, QA confirmada por el PO) sale `SIN … closed`. (FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007 hoy da `probar=1` solo por una viñeta `- Confirmación del PO …` con backticks añadida después del parte; sus ítems numerados siguen sin leerse.)
- Causa comprobada (con `ruta:línea`):
  1. `packages/engine/src/journey-handoff.ts:76`: `viñetas()` solo abre un ítem con `/^[-*]\s+(.*)$/`; una línea `1. …` no abre ítem y, al no estar sangrada, `:79` tampoco la une a otro: el ítem numerado se descarta entero. Por eso `leerContrato` (`:91-106`) no ve comandos, `probar` queda vacío y `:129` marca `sinContrato` aunque `contratoDePruebasEscrito` (`packages/engine/src/autonomous-run.ts:283-289`) sí encuentra backticks. Los mismos ítems pierden `Validación manual`/`Manual` (`:87`, `:99`).
  2. `packages/engine/src/journey-handoff.ts:86` y `:96`: el directorio solo se busca dentro de una viñeta; los dos contratos reales lo escriben como línea suelta `Directorio: …`, así que sale `directorio=null`.
  3. `packages/engine/src/journey-handoff.ts:166-181`: de los estados posteriores a `awaiting_user_tests` solo `qa_approved`/`closed` **con** confirmación de política se desvían (`:170-178`); todo lo demás —`closed` o `qa_approved` confirmados por una persona, e `in_qa`— cae en `sinEntregar.push` de `:181`.
- Hipótesis pendientes: ninguna sobre la causa. Decisión de alcance tomada del pedido: los tickets ya entregados y no cerrados por política no se listan en un bloque nuevo (el pedido solo pide sacarlos de «sin entregar»); `changes_requested` y `blocked` siguen en «sin entregar» porque vuelven a deber la entrega.
- Consumidores afectados: `renderJourneyHandoffNotification` (`packages/engine/src/notify.ts:751-790`: la línea «sin contrato de pruebas» de `:762`, las de `sinEntregar` de `:776` y el contador del encabezado de `:788`); `journeyHandoffCommand` (`packages/cli/src/journey-handoff.ts:72-82`), que arma, guarda y avisa; `avisarParteDeJornada` (`packages/cli/src/hermes.ts:891`). `approval.ts:595` y `journey-wave.ts:274` usan otro `sinEntregar` (avisos y dependencias de ola), no el del parte: no se tocan.
- Archivos y flujo investigados: `valmen journey handoff` → `journeyHandoffCommand` (`packages/cli/src/journey-handoff.ts:72`) → `armarParteDeJornada` (`packages/engine/src/journey-handoff.ts:135`) → por ticket `findTicket` + `parseTicket` → `entradaDePruebas` (`:108`) → `leerContrato` (`:91`) → `viñetas` (`:73`); luego `guardarParteDeJornada` (`:239`) y `renderJourneyHandoffNotification`. Pruebas actuales: `tests/jornada-handoff.test.ts` (C1–C26 de FEATURE-ENGINE-JORNADA-HANDOFF-20261008), que no cubren lista numerada ni `closed` por persona en «sin entregar».
- Riesgos y compatibilidad: la huella (`huellaDelParte`, `:62`) cambia para las jornadas afectadas, así que el próximo `journey handoff` anexa una línea nueva en `handoffs.jsonl` y un `--to` reenvía una vez: es el comportamiento buscado. Las líneas ya guardadas no se reescriben (append-only). La forma de `ParteDeJornada` no cambia. Riesgo de falso positivo: un párrafo que empiece con número y punto (`2026. …`) no aparece en `## Pruebas` reales; se exige `^\d+[.)]\s+`. `ES_NEGACION` (`:89`) debe seguir aplicando a los ítems numerados.
- Impactos de sync, migración, Docker o despliegue: ninguno (lectura del registro y texto del aviso; sin datos sincronizados, esquema, contenedores ni despliegue).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por PO con valmen approve («Aprobar ya (Recomendado)»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: `packages/engine/src/journey-handoff.ts` y `tests/jornada-handoff.test.ts`. Exclusiones: `notify.ts`, `hermes.ts`, el CLI y el formato de `.valmen/journeys/handoffs.jsonl` no cambian; las líneas ya guardadas no se reescriben.
- Pasos ordenados:
  1. Causa 1 — `packages/engine/src/journey-handoff.ts`, función `viñetas()` (`:73-84`): el patrón de apertura de ítem pasa de `/^[-*]\s+(.*)$/` a `/^(?:[-*]|\d+[.)])\s+(.*)$/`, de modo que un ítem numerado abre viñeta, pierde el `1. ` y sus líneas sangradas se le unen; `ES_NEGACION` y `ES_MANUAL` de `leerContrato()` (`:91-106`) se aplican igual al texto ya sin número. Prueba en `tests/jornada-handoff.test.ts`. (C1, C2, C3, C4, C5)
  2. Causa 2 — `packages/engine/src/journey-handoff.ts`, función `leerContrato()`: si ninguna viñeta trae `Directorio:`, se toma la primera línea suelta de la sección (sin viñeta y sin sangría) que case `ES_DIRECTORIO`; la de una viñeta sigue teniendo prioridad. Prueba en `tests/jornada-handoff.test.ts`, con un fixture que copia el `## Pruebas` real de FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007. (C6, C7)
  3. Causa 3 — `packages/engine/src/journey-handoff.ts`, función `armarParteDeJornada()` (`:166-181`): tras el desvío por política, un ticket en `in_qa`, `qa_approved` o `closed` hace `continue` y no llega a `sinEntregar.push`; los demás estados (`intake`, `analyzed`, `planned`, `approved`, `in_progress`, `blocked`, `changes_requested`) y el ilegible `?` siguen en `sinEntregar`. El conjunto de estados entregados va en una constante con nombre junto a `ES_DIRECTORIO`. Prueba en `tests/jornada-handoff.test.ts`. (C8, C9, C10, C11, C12, C13)
  4. `tests/jornada-handoff.test.ts`: un `describe` nuevo «lista numerada y estados entregados» con un caso por criterio C1–C13, sobre `crearEntornoOla`/`conContrato`/`ticketEn` como las pruebas actuales; correr `npx vitest run tests/jornada-handoff.test.ts` en verde sin tocar las aserciones de C1–C26 existentes. (C1–C14)
  5. Regresión del aviso: `npx vitest run tests/hermes-notify.test.ts` en verde, archivo de prueba `tests/hermes-notify.test.ts`. (C15)
  6. Compilación: `npx tsc --build tsconfig.build.json` sin errores. (C16)
  7. Entrega: contrato en `## Pruebas` (comandos, directorio raíz del worktree, resultado esperado, ambiente Node 24 con `npm ci`), criterios verificados con `- [x]`, consumo de IA, `valmen secrets`, commit con `git add` explícito de los dos archivos y el ticket, y paso a `awaiting_user_tests`.
- Impactos declarados: ninguno de sincronización, migración ni contenedores; el único efecto colateral es que la huella del parte cambia para las jornadas afectadas y el próximo `valmen journey handoff` anexa una línea nueva (y un `--to` lo reenvía una vez).
- Rollback (obligatorio): `git revert` del commit del ticket; no hay datos que migrar ni deshacer, porque `handoffs.jsonl` es append-only y las líneas que el arreglo haya anexado quedan como historial válido.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. Un contrato con el ítem `1. \`npx vitest run tests/x.test.ts\` — esperado: todo en verde` da en `probar` exactamente ese texto sin el `1. `
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C2. Un contrato escrito solo como lista numerada con comandos sale con `sinContrato: false`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C3. Un ítem numerado `3. Manual: abrir #/modelos` sale en `manuales` y no en `probar`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C4. Una línea sangrada bajo un ítem numerado queda unida al texto de ese ítem
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C5. Un ítem numerado que empieza con «No » y nombra un comando no entra en `probar`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C6. Una línea suelta `Directorio: raíz del repositorio.` fuera de toda viñeta da `directorio: "raíz del repositorio."`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C7. El `## Pruebas` real de FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007, como fixture en `awaiting_user_tests`, sale con `sinContrato: false` y 2 comandos en `probar`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C8. Un ticket `closed` cuya última QA confirmó una persona no aparece en `sinEntregar`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C9. Un ticket `qa_approved` cuya última QA confirmó una persona no aparece en `sinEntregar`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C10. Un ticket `in_qa` no aparece en `sinEntregar`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C11. Un ticket `in_progress` sigue en `sinEntregar` con `estado: "in_progress"`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C12. Un ticket `changes_requested` sigue en `sinEntregar` con `estado: "changes_requested"`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C13. Un ticket de la jornada que no se puede leer sigue en `sinEntregar` con `estado: "?"`
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C14. Las pruebas C1–C26 que ya existían en `tests/jornada-handoff.test.ts` siguen en verde sin cambiar sus aserciones
      <!-- test: npx vitest run tests/jornada-handoff.test.ts -->
- [x] C15. Las pruebas del aviso del parte en `tests/hermes-notify.test.ts` siguen en verde
      <!-- test: npx vitest run tests/hermes-notify.test.ts -->
- [x] C16. El monorepo compila sin errores con `npx tsc --build tsconfig.build.json`
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/journey-handoff.ts`: `viñetas()` abre ítem también con `1. ` / `1) ` (causa 1); `leerContrato()` toma la línea suelta `Directorio: …` si ninguna viñeta la trae (causa 2); la constante `ESTADOS_YA_ENTREGADOS` (`in_qa`, `qa_approved`, `closed`) saca esos tickets de «sin entregar» tras el desvío por política (causa 3).
- `tests/jornada-handoff.test.ts`: `describe` «lista numerada y estados entregados» con un caso por criterio C1–C13. Sin el arreglo en el motor fallan 10 de los 13 (C11, C12 y C13 son de control y pasan antes y después).
- Sin cambios en `notify.ts`, `hermes.ts`, el CLI ni el formato de `handoffs.jsonl`.

## Pruebas

Directorio: raíz del worktree del ticket (`npm ci` hecho, Node 24); sin servicios ni red.

1. `npx vitest run tests/jornada-handoff.test.ts` — esperado: 44 pruebas pasan (C1–C26 previas más los 13 casos nuevos).
2. `npx vitest run tests/hermes-notify.test.ts` — esperado: 45 pruebas pasan.
3. `npx tsc --build tsconfig.build.json` — esperado: sin errores.
4. Manual: `valmen journey handoff --id JOR-20261008 --project valmen-harness` tras integrar; los contratos en lista numerada salen con comandos y «sin entregar» no lista tickets cerrados.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "code-inspection",
    "description": "A/B 2026-10-09 con el mismo pedido en dos worktrees: rama directa (sonnet, 77 s, salida 1,9 k y 0,76 M de caché leída, commit f6727dc en ab/directo-handoff-lector) halló 2 de 3 causas y falló 1 de 44 pruebas de la rama harness (C6, línea Directorio suelta); rama harness (opus y sonnet, ~12 min con 2 esperas del PO, salida 6,6 k y 3,66 M de caché) halló 3 de 3 y pasó las 33 pruebas de la directa. Suite completa verde en ambas. Se integró la rama harness por decisión del PO.",
    "reference": null,
    "point_id": null
  }
]
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
    "at": "2026-10-08T22:44:34.685Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T17:04:10.260Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T17:08:21.454Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261009-BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008-analysis-1, canal cli, decidida 2026-10-09T17:08:21.447Z): PO por AskUserQuestion: \"Aprobar el análisis (Recomendado)\" (REVIEW de un solo punto, 0.89; diagnóstico reproducido con datos reales)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T17:08:54.189Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T17:10:50.785Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-BUGFIX-ENGINE-JORNADA-HANDOFF-LECTOR-20261008-plan-2, canal cli, decidida 2026-10-09T17:10:50.783Z): por el PO PO (valmen approve): REVIEW solo por la forma de C5 (0.87); el resto en 0.96 o más — palabras del PO: «Aprobar ya (Recomendado)»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T17:10:50.963Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar ya (Recomendado)\",\"planHash\":\"sha256:38d10270b7c9d1c5235f9037fe339f512b9eb2001db6072a4d743b92ae38a51a\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T17:10:51.112Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:38d10270b7c9d1c5235f9037fe339f512b9eb2001db6072a4d743b92ae38a51a."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T17:10:51.112Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T17:11:14.036Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T17:12:54.102Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T17:47:51.955Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  }
]
```
