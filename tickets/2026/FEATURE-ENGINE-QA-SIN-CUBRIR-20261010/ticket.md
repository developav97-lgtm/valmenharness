---
schema_version: 2
id: FEATURE-ENGINE-QA-SIN-CUBRIR-20261010
title: El cierre del ciclo de QA registra lo que quedó sin cubrir
type: FEATURE
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-QA-SIN-CUBRIR-20261010

## Solicitud original

Parte del sprint: El cierre de QA declara lo no cubierto, compatible con ciclos anteriores, y la vista del ticket lo muestra.
- R-QAC-001: Cerrar un ciclo de QA DEBE declarar lo que quedó sin cubrir
- R-QAC-002: Los ciclos cerrados antes del cambio DEBEN seguir leyéndose
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cerrar un ciclo de QA DEBE declarar lo que quedó sin cubrir Los ciclos cerrados antes del cambio DEBEN seguir leyéndose
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
«Lo que quedó sin cubrir» no existe en el código: el bloque `QA` tiene `findings`
(`packages/core/src/blocks.ts:211`), pero ya significa hallazgos —la reapertura escribe ahí
su motivo (`packages/engine/src/transition.ts:624-627`)— y se escribe vacío en el cierre
(`packages/engine/src/append.ts:699`). Traducción por búsqueda:

1. Campo nuevo y opcional `not_covered` en la entrada de **cierre** del ciclo: ausente =
   «sin declarar» (ciclos viejos), `[]` = cobertura completa declarada, lista = elementos sin
   cubrir. Parámetros: `--not-covered <texto, un elemento por línea>` y `--all-covered` en
   `valmen qa-close`; `sin_cubrir` y `todo_cubierto` en `cerrar_qa`.
   Pregunta al PO: ¿se confirma el campo nuevo `not_covered` en vez de reutilizar `findings`?
2. La spec nombra solo `cerrar_qa` y `valmen qa-close` (spec s3-qa, R-QAC-001). Otros tres
   caminos cierran ciclos sin pasar por ellos: la ceremonia `valmen close` / `delegation close`
   (`packages/cli/src/ceremony.ts:349`), el cierre por política (`append.ts:783-812`) y la
   reapertura (`transition.ts:602-628`). El plan los deja fuera: escriben el ciclo sin el campo,
   que se lee «sin declarar».
   Pregunta al PO: ¿la ceremonia `valmen close` debe exigir también la declaración (con
   `--not-covered`/`--all-covered`) en este ticket, o queda para uno aparte?

## Descripción funcional

- Alcance: cierre del ciclo de QA por `valmen qa-close` y por la herramienta MCP `cerrar_qa`,
  y la validación del bloque `QA`. La vista web (R-QAC-003) es de
  FEATURE-WEB-QA-SIN-CUBRIR-20261010, que depende de este.
- Usuario o rol afectado: el PO o la persona que cierra la QA, y el agente que llama `cerrar_qa`;
  quien audite el ticket después lee qué no se probó.
- Comportamiento actual: el cierre guarda resultado y confirmación del PO, y `findings: []`
  siempre (`append.ts:693-702`); no hay forma de decir qué quedó sin probar.
- Comportamiento esperado: cerrar exige la lista de lo no cubierto o la declaración de
  cobertura completa; sin ninguna, falla nombrando el parámetro y el ticket no cambia. Lo
  declarado queda en la entrada de cierre. Los ciclos cerrados antes siguen validando.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): `qaClose` (`packages/engine/src/append.ts:645-717`) no
  recibe ningún dato de cobertura —`QaCloseRequest` (`append.ts:637-643`) tiene solo
  `result` y `poConfirmation`— y empuja la entrada de cierre con `findings: []`
  (`append.ts:697-702`). `validateQa` (`packages/core/src/blocks.ts:198-262`) exige las claves
  exactas con `requireExactKeys` sin opcionales (`blocks.ts:203-215`), así que hoy una clave
  nueva haría inválido el ticket; `requireExactKeys` ya admite opcionales
  (`packages/core/src/validators.ts:210-223`).
- Hipótesis pendientes: ninguna sobre la causa. Sin medir: cuántos de los 228 tickets válidos
  tienen ciclos cerrados (364 entradas con resultado final); la base es `valmen validate --all`
  → «Tickets válidos: 228», salida 0, en este worktree el 2026-10-11.
- Consumidores afectados: CLI `qa-close` (`packages/cli/src/main.ts:1080-1087`, ayuda en
  `main.ts:389-390`, banderas en `packages/cli/src/command-table.ts:453`); MCP `cerrar_qa`
  (esquema `packages/mcp/src/tools.ts:1925-1950`, despacho `tools.ts:3556-3565`); ceremonia
  `valmen close` (`packages/cli/src/ceremony.ts:349`), que llama `qaClose` directo; lectores
  del bloque que no cambian: `packages/core/src/validate.ts:360-468`,
  `packages/engine/src/qa-shadow.ts:55`, `qa-policy-verify.ts:66`, `journey-handoff.ts:213`,
  `packages/cli/src/hermes.ts:875`. El servidor solo lista `qa-close` como subcomando que
  escribe (`packages/server/src/claude.ts:340`).
- Archivos y flujo investigados: `cerrar_qa`/`qa-close` → `qaClose` → `conTicket` → `replaceBlock`
  del bloque `QA` → `validateQa` al releer. Pruebas que hoy cierran por la frontera:
  `tests/mcp-server.test.ts:1288, 1395, 1488` (MCP sin declaración) y
  `tests/equivalence-ticketpy.test.ts:838, 1208, 1371` (CLI, desactivada por defecto). Las que
  llaman al motor directo (`tests/jornada-sin-autoaprobacion.test.ts:112-131`,
  `tests/qa-commit-referencia.test.ts:154`, `tests/qa-por-politica.test.ts:303, 332`) y la
  ceremonia (`tests/approve-close-shortcut.test.ts`, `tests/delegation.test.ts`) no cambian si
  la exigencia vive en la frontera.
- Riesgos y compatibilidad: (1) hacer obligatoria la declaración rompe a propósito las tres
  llamadas de `tests/mcp-server.test.ts` y las de la prueba de equivalencia, porque el
  comportamiento cambia; el plan las cita. (2) La implementación de referencia `ticket.py`
  rechazaría la clave nueva: la equivalencia diverge en `not_covered`. (3) Exigirlo en el motor
  rompería la ceremonia y el cierre por política; por eso se exige en las dos fronteras que
  nombra la spec. (4) Compatibilidad hacia atrás: la clave es opcional, los ciclos viejos no se
  reescriben (bloque append-only).
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia el formato del registro de
  tickets con una clave opcional, sin migración.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar tal cual (Recomendado)»; el REVIEW del recibo plan-1 lo decidió el PO, incluido el cambio a propósito de tres pruebas existentes de tests/mcp-server.test.ts (EST-009).
- Modo: harness completo (FEATURE de una feature descompuesta; toca core, engine, cli y mcp).
- Alcance: campo opcional `not_covered` en la entrada de cierre del bloque `QA`; exigencia de declararlo en `valmen qa-close` y `cerrar_qa`; lectura compatible de ciclos viejos.
- Exclusiones: la vista web (FEATURE-WEB-QA-SIN-CUBRIR-20261010); la ceremonia `valmen close`/`delegation close`, el cierre por política (`qaApproveByPolicy`) y la reapertura, que siguen escribiendo el ciclo sin `not_covered` («sin declarar») salvo que el PO decida otra cosa (ver «Supuestos y decisiones pendientes», pregunta 2); `findings` no cambia.
- Tamaño previsto: 18 criterios; unas 320 líneas (≈90 de producción, ≈230 de pruebas). Si supera 700, se parte el ticket.
- Pasos ordenados:
  1. Prueba primero: crear `tests/qa-sin-cubrir.test.ts` con una prueba parametrizada por regla —R-QAC-001 (casos de C1–C9 por CLI `qa-close` y por MCP `cerrar_qa`) y R-QAC-002 (casos de C10–C12 sobre `validateQa`)— y una de regresión por comando tocado (C14 para `qa-close`, C15 para `cerrar_qa`); observarlas en rojo con `npx vitest run tests/qa-sin-cubrir.test.ts` y anotar la salida en `## Pruebas`. (C1–C12, C14, C15)
  2. `packages/core/src/blocks.ts` `validateQa`: pasar `not_covered` como clave opcional a `requireExactKeys`; si está, `requireList` con textos no vacíos (lista vacía permitida = cobertura completa); rechazarla en la entrada par que abre el ciclo. (C10, C11, C12, C13)
  3. `packages/engine/src/append.ts` `QaCloseRequest`/`qaClose`: campo opcional `notCovered?: readonly string[]`; si llega, se escribe como `not_covered` en la entrada de cierre; si no llega, la entrada queda sin la clave. El motor no lo exige, para no romper la ceremonia (`packages/cli/src/ceremony.ts:349`). (C1–C4, C16)
  4. Función pura nueva en `packages/engine/src/append.ts`, `declaracionDeCobertura(lista, todoCubierto, nombres)`: parte el texto por líneas, recorta, descarta vacías; error que nombra el parámetro si no hay ninguna de las dos (C5, C6), si llegan ambas (C8) o si la lista queda vacía (C9). Se valida antes de `conTicket`, así el ticket no se escribe (C7).
  5. `packages/cli/src/command-table.ts:453`: `--not-covered` en `conValor` y `--all-covered` en `booleanas`; `packages/cli/src/main.ts:1080-1087` pasa la declaración a `qaClose` con nombres `--not-covered`/`--all-covered`; ayuda en `main.ts:389-390`. (C1, C3, C5, C14)
  6. `packages/mcp/src/tools.ts:1925-1950`: propiedades `sin_cubrir` (texto, un elemento por línea) y `todo_cubierto` (booleano) con su descripción; despacho en `tools.ts:3556-3565` con nombres `sin_cubrir`/`todo_cubierto`. (C2, C4, C6, C15)
  7. Cambio a propósito de pruebas existentes: `tests/mcp-server.test.ts:1288, 1395, 1488` cierran `cerrar_qa` sin declaración; el pedido cambia ese comportamiento (R-QAC-001), así que se les agrega `todo_cubierto: true` y nada más. `tests/equivalence-ticketpy.test.ts:838, 1208, 1371` no se edita: está desactivada por defecto y `ticket.py` no conoce la bandera; la divergencia queda anotada en `## Implementación`. (C17)
  8. Verde y regresiones: `npx vitest run tests/qa-sin-cubrir.test.ts tests/mcp-server.test.ts tests/approve-close-shortcut.test.ts tests/delegation.test.ts tests/qa-por-politica.test.ts tests/jornada-sin-autoaprobacion.test.ts tests/qa-commit-referencia.test.ts tests/cli-tabla-comandos.test.ts`; `npx tsc --build tsconfig.build.json`; `node packages/cli/dist/main.js validate --all` (base: «Tickets válidos: 228», salida 0). (C13, C16, C17, C18)
- Impactos declarados: ninguno de sincronización, migración ni contenedores; el formato del registro gana una clave opcional que los lectores existentes ignoran.
- Rollback (obligatorio): revertir el commit del ticket. Un ticket que ya tenga `not_covered` escrito dejaría de validar con el código anterior; antes de revertir se busca la clave con `grep -rl '"not_covered"' tickets/` y, si aparece, se revierte también el validador como último paso o se mantiene solo el paso 2.

## Criterios de aceptación

- [x] C1 (R-QAC-001): `valmen qa-close --not-covered` guarda cada línea no vacía como elemento de `not_covered` en la entrada de cierre.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C2 (R-QAC-001): `cerrar_qa` con `sin_cubrir` guarda cada línea no vacía como elemento de `not_covered` en la entrada de cierre.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C3 (R-QAC-001): `valmen qa-close --all-covered` guarda `not_covered` como lista vacía.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C4 (R-QAC-001): `cerrar_qa` con `todo_cubierto: true` guarda `not_covered` como lista vacía.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C5 (R-QAC-001): `valmen qa-close` sin declaración falla con un mensaje que nombra `--not-covered`.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C6 (R-QAC-001): `cerrar_qa` sin declaración devuelve un error que nombra `sin_cubrir`.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C7 (R-QAC-001): Un cierre rechazado por falta de declaración deja el `ticket.md` byte a byte igual.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C8 (R-QAC-001): Un cierre que declara lista junto con cobertura completa se rechaza.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C9 (R-QAC-001): Un cierre cuya lista no tiene ningún elemento no vacío se rechaza.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C10 (R-QAC-002): `validateQa` acepta una entrada de cierre sin `not_covered`.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C11 (R-QAC-002): `validateQa` rechaza un `not_covered` que no es una lista de textos no vacíos.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C12 (R-QAC-002): `validateQa` rechaza `not_covered` en la entrada que abre el ciclo.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C13 (R-QAC-002): `valmen validate --all` sobre el registro del repositorio termina con salida 0.
      <!-- test: node packages/cli/dist/main.js validate --all -->
- [x] C14: `valmen qa-close --result approved` sin `--po-confirmation` sigue fallando.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C15: `cerrar_qa` con `approved` sin `confirmacion_po` sigue fallando.
      <!-- test: npx vitest run tests/qa-sin-cubrir.test.ts -->
- [x] C16: La ceremonia `valmen close` sigue cerrando el ciclo de QA sin pedir declaración.
      <!-- test: npx vitest run tests/approve-close-shortcut.test.ts -->
- [x] C17: Las pruebas del servidor MCP pasan con la declaración agregada a sus cierres.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [x] C18: El monorepo compila.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

Hecho según el plan aprobado, en el orden declarado:

1. Prueba primero: `tests/qa-sin-cubrir.test.ts` (20 casos: R-QAC-001 por CLI y por MCP, R-QAC-002 sobre `validateQa`, regresión C14 y C15). En rojo antes de implementar: 10 de 20 fallaban (`--not-covered`/`--all-covered` inexistentes en `qa-close`, `cerrar_qa` sin `not_covered`, `validateQa` rechazando la clave); los otros 10 pasaban de rebote porque el comportamiento antiguo ya rechazaba o ya aceptaba lo mismo.
2. `packages/core/src/blocks.ts` `validateQa`: `not_covered` como clave opcional; si está, lista de textos no vacíos (también sin espacios solos); rechazada en la entrada que abre el ciclo.
3. `packages/engine/src/append.ts`: `QaCloseRequest.notCovered` opcional; si llega se escribe como `not_covered` en la entrada de cierre, si no, la clave no existe. El motor no lo exige: la ceremonia (`ceremony.ts:349`), el cierre por política y la reapertura siguen escribiendo el ciclo «sin declarar».
4. `declaracionDeCobertura(lista, todoCubierto, nombres)` en `append.ts`: error con el nombre del parámetro si no hay declaración, si hay ambas o si la lista queda vacía; se evalúa antes de `qaClose`, así el ticket no se escribe.
5. CLI: `--not-covered` y `--all-covered` en `command-table.ts`, despacho en `main.ts` y ayuda.
6. MCP: `sin_cubrir` y `todo_cubierto` en el esquema de `cerrar_qa` y su despacho en `tools.ts`.
7. Cambio a propósito de pruebas existentes (EST-009, autorizado en el plan): `tests/mcp-server.test.ts`, las tres llamadas a `cerrar_qa` (cierre en `hastaCerrado`, cierre del flujo con retest y la prueba «la aprobación de QA exige las palabras de quien aprobó») ganan `todo_cubierto: true` y nada más. Ninguna otra prueba existente falló.

Divergencia anotada: `tests/equivalence-ticketpy.test.ts:838, 1208, 1371` no se edita (desactivada por defecto); `ticket.py` no conoce `not_covered` ni la bandera.

## Pruebas

Directorio de ejecución: raíz del repositorio. Sin requisitos de ambiente (raíces temporales, sin red).

- `npx vitest run tests/qa-sin-cubrir.test.ts` — esperado: 20 pruebas pasan (C1-C12, C14, C15). Antes de implementar: 10 en rojo.
- `npx vitest run tests/mcp-server.test.ts tests/approve-close-shortcut.test.ts tests/delegation.test.ts tests/qa-por-politica.test.ts tests/jornada-sin-autoaprobacion.test.ts tests/qa-commit-referencia.test.ts tests/cli-tabla-comandos.test.ts` — esperado: verde (C16, C17).
- `npx tsc --build tsconfig.build.json` y `npx tsc --noEmit -p .` — esperado: sin salida (C18).
- `node packages/cli/dist/main.js validate --all` — esperado: «Tickets válidos: 228», salida 0 (C13).
- Validación manual (opcional): en un proyecto temporal con un ticket `in_qa`, `valmen qa-close --id <ID> --result changes_requested` debe fallar nombrando `--not-covered`; con `--all-covered` debe guardar `"not_covered": []`.

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
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente; el cliente no expone los números de tokens.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente sonnet de implementación, sin agregado que leer",
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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:34.673Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T19:17:56.068Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T19:19:41.436Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T19:23:38.977Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-FEATURE-ENGINE-QA-SIN-CUBRIR-20261010-plan-1, canal cli, decidida 2026-10-11T19:23:38.958Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T19:23:42.569Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:a5863d7e471a59e4308e844720e5ecb6424eb2ee0a4749706d1c91385807557f\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T19:23:46.871Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:a5863d7e471a59e4308e844720e5ecb6424eb2ee0a4749706d1c91385807557f."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T19:23:46.871Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T19:23:49.387Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T19:33:21.086Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T19:33:21.534Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
