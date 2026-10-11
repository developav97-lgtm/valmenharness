---
schema_version: 2
id: IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK-20261010
title: El precheck rechaza un plan de más de 20 criterios, no de más de 40
type: IMPROVEMENT
module: ENGINE
workflow_status: approved
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

# IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK-20261010

## Solicitud original

La compuerta exige que TODAS las proposiciones pasen approveAt (0,90) y evalúa los criterios en tandas de MAX_CRITERIA_PROPOSITIONS = 12 (packages/gate/src/dynamic.ts:32); cuantos más criterios, más probable que uno caiga entre 0,85 y 0,90 aunque esté cubierto. Medido sobre los 299 recibos cascade del registro el 2026-10-10: la tasa de REVIEW en planes de 12 a 20 proposiciones es del 10 %, de 20 a 30 del 51 % y de 30 a 60 del 69 %; los 14 REVIEW de la jornada JOR-20261010 con mínimo entre 0,80 y 0,90 se aprobaron todos sin cambiar el plan (AP-012 y AP-013). El tope del precheck es hoy TOPE_DE_CRITERIOS = 40 (packages/engine/src/revision-previa.ts:50, hallazgo mas_criterios_que_el_tope). Se pide bajarlo a 20 criterios de aceptación para tickets nuevos, con el mismo mensaje de «partí el ticket», sin invalidar los tickets que ya pasaron la compuerta con más (no se reabren), y con la regla ya escrita en las skills descomposicion y planificacion como referencia. Decisión del PO del 2026-10-10: «Tope de 20 criterios en el precheck (Recomendado)». Cuida que la suma incluya los criterios compuestos partidos, como hoy (revision-previa.ts:45-48).

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la revisión previa sin modelo de la compuerta de plan (`valmen precheck plan`, la herramienta MCP `revision_previa` y el paso previo de `valmen gate plan`) baja el tope de afirmaciones de los criterios de 40 a 20 para los tickets creados desde la fecha de vigencia del cambio. No cambia el tamaño de las tandas del evaluador, ni los umbrales, ni la compuerta de análisis.
- Usuario o rol afectado: el agente que planifica un ticket y el PO que aprueba planes; indirectamente, el coste de cada compuerta de plan.
- Comportamiento actual: el precheck del plan solo rechaza con `mas_criterios_que_el_tope` cuando la suma de afirmaciones de los criterios pasa de 40, aunque las skills `descomposicion` y `planificacion` ya dicen 20. Un plan de 21 a 40 afirmaciones llega al evaluador y sale en REVIEW la mitad de las veces o más.
- Comportamiento esperado: un ticket creado desde la vigencia con más de 20 afirmaciones se rechaza antes del evaluador con el mismo hallazgo y el mismo mensaje («…más que el tope de 20; partí el ticket.»). Un ticket creado antes de la vigencia conserva el tope de 40: no se reabre ni se invalida, aunque vuelva a pedir la compuerta. La suma sigue contando afirmaciones, de modo que partir un criterio compuesto no cambia el conteo.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el tope es una constante fija, `TOPE_DE_CRITERIOS = 40` en `packages/engine/src/revision-previa.ts:50`, que `reviewBeforeGate` compara en `packages/engine/src/revision-previa.ts:324-332` contra la suma de `afirmacionesDe` de cada criterio (`packages/gate/src/criteria.ts:57-65`), solo cuando la compuerta es `plan` (`packages/engine/src/revision-previa.ts:256`, `:290`). La suma por afirmaciones es la que documenta el comentario de `packages/engine/src/revision-previa.ts:42-49`: partir un compuesto no cambia la suma. El tope no depende del ticket: no lee `created`, ni el tipo, ni el estado, así que hoy no hay forma de bajarlo sin afectar a los tickets en curso. Las tandas del evaluador son otra cosa: `MAX_CRITERIA_PROPOSITIONS = 12` está en `packages/gate/src/dynamic.ts:37` (la solicitud dice `:32`; la línea real es la 37) y lo usa el reparto de `packages/engine/src/evaluators.ts:365-372`, más la nota del recibo de `packages/engine/src/gate.ts:997-1003`; ese valor no se toca.
- Evidencia medida: reproduje la tasa con un guion de solo lectura sobre `.valmen/receipts/*.jsonl` (recibos de `analysis` y `plan` con evaluador cascade, agrupados por número de respuestas del modelo). Hoy son 318 recibos, no 299, porque la jornada sumó más: 13 a 20 proposiciones dan REVIEW 6 de 55 (11 %), 21 a 30 dan 34 de 61 (56 %), 31 o más dan 42 de 59 (71 %). Confirma la tendencia de la solicitud (10 %, 51 %, 69 %). La memoria lo respalda: AP-012 (`.valmen/memory/aprendizajes.md:99`) registra que los REVIEW se aprobaron sin cambios; AP-013 (`.valmen/memory/aprendizajes.md:107`) que la heurística de conjunciones de `packages/gate/src/criteria.ts:47` cuenta cada «y» como afirmación.
- Hipótesis pendientes: ninguna que bloquee. Queda sin medir si 20 es el punto óptimo o si 16 bajaría más el REVIEW; la decisión del PO del 2026-10-10 fija 20.
- Consumidores afectados: `valmen precheck` en `packages/cli/src/commands.ts:346-363`; la herramienta MCP `revision_previa` en `packages/mcp/src/tools.ts:3395-3405`; la revisión previa de `valmen gate` en `packages/engine/src/gate.ts:770-786`. Los tres llaman a `reviewBeforeGate`, así que el cambio en un solo lugar llega a los tres. La exportación sale por `packages/engine/src/index.ts:89`. Las skills que ya citan 20 son `.valmen/skills/descomposicion/SKILL.md:16` y `.valmen/skills/planificacion/SKILL.md:90`; quedan como están.
- Archivos y flujo investigados: `packages/engine/src/revision-previa.ts` (constante, `reviewBeforeGate`, mensaje), `packages/gate/src/criteria.ts` (`afirmacionesDe`), `packages/gate/src/dynamic.ts` (tandas), `packages/engine/src/evaluators.ts`, `packages/engine/src/gate.ts`, `packages/core/src/parser.ts:353-358` (`parseTicket` devuelve `fields`, de donde sale `created`), las pruebas `tests/revision-previa.test.ts:197-215` y `tests/gate-criterios-por-forma.test.ts:432-491`, y el generador `tests/helpers/fixtures.ts:163`, que fija `created: 2026-09-21` en todos los tickets de prueba.
- Riesgos y compatibilidad: (1) un ticket en `intake` o `analyzed` con 21 a 40 afirmaciones quedaría bloqueado si el tope bajara para todos; por eso el tope nuevo aplica por fecha de creación. (2) Las pruebas existentes fijan 40 o construyen tickets con 21 criterios usando la constante; con el ticket de prueba fechado antes de la vigencia, varias quedan en rojo hasta ajustarlas, y se declaran en el plan. (3) `npm run exports:check` exige consumidor para cada exportación nueva; las pruebas cuentan como consumidor. (4) Un ticket con `created` ilegible o ausente: se trata como nuevo (tope 20), que es el lado seguro.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es una constante del motor del harness; no hay datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 20 criterios: tope de 20 para tickets con created desde el 2026-10-12, los anteriores conservan 40, sin aviso previo y sin excepción por tipo.
- Decisiones del plan:
  - Corte sin aviso previo, por fecha de creación: el tope baja a 20 de golpe para los tickets con `created` igual o posterior a `VIGENCIA_DEL_TOPE = "2026-10-12"`. No hace falta un periodo de aviso porque las skills `descomposicion` (`.valmen/skills/descomposicion/SKILL.md:16`) y `planificacion` (`.valmen/skills/planificacion/SKILL.md:90`) ya piden 20, así que la regla no es nueva para quien planifica; el precheck solo deja de tolerar lo que la regla ya prohibía.
  - Tickets en curso: un ticket creado antes de la vigencia conserva `TOPE_DE_CRITERIOS_HEREDADO = 40`, aunque vuelva a pedir la compuerta de plan (por ejemplo, tras un REVIEW). Un ticket ya aprobado no vuelve a pasar por la revisión previa (solo la corren `valmen precheck`, `revision_previa` y `valmen gate analysis|plan`), así que no se reabre ni se invalida nada; ningún recibo se reescribe.
  - Sin excepción por tipo: SECURITY, migraciones o despliegue tampoco pasan de 20. El REVIEW crece con el número de proposiciones, no con el tipo (Diagnóstico, evidencia medida), y esos tickets ya tienen siempre gate humano; un SECURITY que necesita más criterios se parte, que es lo que dice la skill `descomposicion`. Lo prueban C13 con C14.
  - `created` ausente o ilegible cuenta como ticket nuevo (tope 20): es el lado que no deja pasar un plan grande por un frontmatter roto.
  - El mensaje no cambia: sigue «son N afirmaciones en M criterio(s), más que el tope de T; partí el ticket.», con T = el tope que aplica al ticket. La suma sigue siendo de afirmaciones (`afirmacionesDe`), como hoy.
  - Las tandas de `MAX_CRITERIA_PROPOSITIONS = 12` (`packages/gate/src/dynamic.ts:37`) no se tocan.
  - Cómo se prueba sin modelo: todo pasa por `reviewBeforeGate`, que no llama a ningún evaluador; la prueba de `valmen gate plan` usa el espía de `tests/revision-previa.test.ts` (`espia()`), que cuenta las llamadas al evaluador y debe quedar en 0.
- Tamaño previsto: 20 criterios; unas 300 líneas (producción unas 35 en `packages/engine/src/revision-previa.ts`, pruebas unas 250 en el archivo nuevo, unas 25 en `tests/revision-previa.test.ts`, 6 de ajuste en `tests/gate-criterios-por-forma.test.ts`).
- Pasos ordenados:
  1. En `packages/engine/src/revision-previa.ts`: cambiar `TOPE_DE_CRITERIOS` a 20; añadir `TOPE_DE_CRITERIOS_HEREDADO = 40`, `VIGENCIA_DEL_TOPE = "2026-10-12"` con la función exportada `topeDeCriterios(created: string | undefined): number` (20 si `created` no casa con `/^\d{4}-\d{2}-\d{2}$/` o es igual o posterior a la vigencia por comparación de cadenas ISO; 40 si es anterior). Actualizar el comentario de `:42-49` con la vigencia. (C1, C2, C3, C4, C5, C6)
  2. En `reviewBeforeGate` (`packages/engine/src/revision-previa.ts`): leer `parseTicket(input.ticketText).fields.created`, calcular `const tope = topeDeCriterios(created)` dentro del bloque `esPlan`, comparar la suma de `afirmacionesDe` contra `tope` con el mensaje interpolando `tope`. No cambiar nada fuera del bloque `esPlan`. (C7, C8, C9, C10, C11, C12, C13, C14, C15, C16)
  3. Crear `tests/tope-criterios-precheck.test.ts` con dos tablas `it.each`: una para `topeDeCriterios` (fecha igual, posterior, anterior, ausente, ilegible) con otra para `reviewBeforeGate` (columnas: `created`, tipo, impactos, compuerta, criterios atómicos, criterios compuestos, hallazgo esperado, tope citado). Los tickets salen de `renderFixtureTicket` (`tests/helpers/fixtures.ts`) con `.replace("created: 2026-09-21", "created: <fecha>")`, sin tocar el generador. Más una prueba de C10 (junto contra partido), una de `precheckCommand` (`packages/cli/src/commands.ts`) con una de `callTool(contexto, "revision_previa", …)` (`packages/mcp/src/tools.ts`). (C1–C16, C18, C19)
  4. En `tests/revision-previa.test.ts`: añadir un `it` junto al de la línea 197 que reescribe el ticket con `created: 2026-10-12`, 21 criterios, llama a `pedirPlan(espia())`, exige `exitCode` 3, «el tope de 20» en `stderr` con `e.llamadas()` en 0. (C17)
  5. Ajustar en `tests/gate-criterios-por-forma.test.ts` con `tests/revision-previa.test.ts` las pruebas existentes que el cambio pone en rojo a propósito (declaradas para EST-009; ninguna otra prueba existente se edita):
     - `tests/gate-criterios-por-forma.test.ts:453`: `expect(TOPE_DE_CRITERIOS).toBe(40)` pasa a `expect(TOPE_DE_CRITERIOS_HEREDADO).toBe(40)`, con el import de `:22` ampliado. Motivo: el ticket de prueba tiene `created: 2026-09-21`, anterior a la vigencia, así que sus comparaciones siguen contra 40.
     - `tests/gate-criterios-por-forma.test.ts:489`: `` `el tope de ${TOPE_DE_CRITERIOS}` `` pasa a `` `el tope de ${TOPE_DE_CRITERIOS_HEREDADO}` ``. Motivo: el mismo.
     - `tests/revision-previa.test.ts:199`: `length: TOPE_DE_CRITERIOS + 1` pasa a `length: TOPE_DE_CRITERIOS_HEREDADO + 1`, con el import de `:24` ampliado. Motivo: con 21 criterios un ticket de 2026-09-21 ya no pasa el tope heredado, así que la prueba dejaría de dar el hallazgo.
     - `tests/revision-previa.test.ts:214`: `` `más que el tope de ${TOPE_DE_CRITERIOS}` `` pasa a `` `más que el tope de ${TOPE_DE_CRITERIOS_HEREDADO}` ``. Motivo: el mismo.
     Las demás pruebas de `tests/gate-criterios-por-forma.test.ts:432-491` (C22 a C24 de su ticket) siguen en verde sin cambios porque su ticket es anterior a la vigencia. (C11, C12)
  6. Correr `npm run build`, luego `npx vitest run tests/tope-criterios-precheck.test.ts tests/revision-previa.test.ts tests/gate-criterios-por-forma.test.ts tests/mcp-server.test.ts`, luego `node scripts/exports-sin-uso.mjs` con `npx tsc -b`. Las exportaciones nuevas (`TOPE_DE_CRITERIOS_HEREDADO`, `VIGENCIA_DEL_TOPE`, `topeDeCriterios`) tienen consumidor en las pruebas. (C20)
  7. Antes de integrar, el orquestador corre `valmen precheck plan --id <ID>` sobre cada ticket que devuelva `grep -l "created: 2026-10-1[2-9]" tickets/2026/*/ticket.md` en `intake` o `analyzed`; si alguno da `mas_criterios_que_el_tope`, se avisa al PO antes de integrar. (C7)
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Rollback (obligatorio): revertir el commit del ticket. Restaura `TOPE_DE_CRITERIOS = 40` sin estado persistido que deshacer: el tope no se escribe en tickets ni en recibos, así que ningún ticket queda marcado por el cambio.

## Criterios de aceptación

- [ ] C1. `TOPE_DE_CRITERIOS` vale 20 en `packages/engine/src/revision-previa.ts`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C2. `TOPE_DE_CRITERIOS_HEREDADO` vale 40 en `packages/engine/src/revision-previa.ts`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C3. `topeDeCriterios` devuelve 20 para un `created` igual a `VIGENCIA_DEL_TOPE`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C4. `topeDeCriterios` devuelve 20 para un `created` posterior a `VIGENCIA_DEL_TOPE`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C5. `topeDeCriterios` devuelve 40 para un `created` anterior a `VIGENCIA_DEL_TOPE`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C6. `topeDeCriterios` devuelve 20 cuando `created` no es una fecha `AAAA-MM-DD`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C7. Un ticket nuevo con 21 criterios atómicos da `mas_criterios_que_el_tope` en el precheck del plan.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C8. Un ticket nuevo con 20 criterios atómicos pasa el precheck del plan sin `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C9. Un ticket nuevo con 11 criterios compuestos de dos afirmaciones da `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C10. Partir un criterio compuesto en dos atómicos deja igual la suma que informa el hallazgo.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C11. Un ticket creado antes de la vigencia con 40 criterios atómicos pasa el precheck del plan sin `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C12. Un ticket creado antes de la vigencia con 41 criterios atómicos recibe un hallazgo que cita «el tope de 40».
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C13. Un ticket nuevo de tipo SECURITY con 21 criterios atómicos da `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C14. Un ticket nuevo con `migration_impact: true` con 21 criterios atómicos da `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C15. La revisión previa de la compuerta `analysis` de un ticket nuevo con 25 criterios atómicos no da `mas_criterios_que_el_tope`.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C16. El hallazgo de un ticket nuevo con 21 criterios cita «el tope de 20».
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C17. `valmen gate plan` sobre un ticket nuevo con 21 criterios sale con código 3 sin llamar al evaluador.
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [ ] C18. `precheckCommand` sobre un ticket nuevo con 21 criterios devuelve código 3.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C19. La herramienta MCP `revision_previa` informa `mas_criterios_que_el_tope` sobre un ticket nuevo con 21 criterios.
      <!-- test: npx vitest run tests/tope-criterios-precheck.test.ts -->
- [ ] C20. `node scripts/exports-sin-uso.mjs` termina sin exportaciones nuevas sin consumidor.
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
    "at": "2026-10-11T04:20:48.833Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T06:35:19.493Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T06:37:55.231Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:12.252Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-IMPROVEMENT-ENGINE-TOPE-CRITERIOS-PRECHECK-20261010-plan-1, canal cli, decidida 2026-10-11T06:44:12.249Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:12.609Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado)\",\"planHash\":\"sha256:a3844f024ed22c63958abf846e549f2a95b1ca4c4c2bb068022f7db767e4bf57\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:12.918Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:a3844f024ed22c63958abf846e549f2a95b1ca4c4c2bb068022f7db767e4bf57."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:12.918Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
