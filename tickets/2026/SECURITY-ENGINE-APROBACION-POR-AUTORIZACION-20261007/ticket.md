---
schema_version: 2
id: SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007
title: Registrar la aprobación de análisis y plan atribuida a la autorización cuando la compuerta está en approve vigente
type: SECURITY
module: ENGINE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007

## Solicitud original

Parte del sprint: Un ticket elegible con la compuerta en approve se aprueba solo, atribuido a la autorización, con elegibilidad decidida en código y visible.
- R-APRO-002: Con la compuerta en approve, el ticket elegible DEBE aprobarse solo
Depende de: FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Con la compuerta en approve, el ticket elegible DEBE aprobarse solo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: registrar en el motor la aprobación de la etapa `analysis` o `plan` de un ticket **elegible** (decidido por `elegibilidadDeAprobacion`) como un hecho atribuido a la autorización vigente que lo cubre —su id y su hash, no una persona ni el agente—, consumir un cupo de esa autorización, y hacer que `transition --to approved` acepte esa aprobación de plan con las mismas exigencias de vigencia que la de una persona. Exclusiones: el agente revisor de los `review` (SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007), el listado y el parte diario (FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007), la aprobación al preparar la jornada (FEATURE-ENGINE-JORNADA-APROBACION-20261007) y cualquier herramienta MCP nueva.
- Usuario o rol afectado: el PO que delegó la aprobación con una autorización (R-APRO-001); quien prepara la jornada y mueve tickets a `approved`; quien audita después quién aprobó qué.
- Comportamiento actual: aunque la compuerta `plan` esté en `approve` y una autorización vigente cubra el ticket, entrar a `approved` exige un evento `plan-approved` registrado por una persona con `valmen approve-plan` y la línea «aprobado explícitamente por el PO» en `## Plan`; la elegibilidad se calcula (`valmen approval-eligibility`) pero nadie la aplica, y el cupo nunca se consume.
- Comportamiento esperado: con la compuerta de la etapa en `approve`, el recibo vigente respecto al ticket y una autorización vigente que lo cubre con cupo, `valmen approve-by-authorization --id <ID> --stage analysis|plan` registra el evento atribuido a la autorización (id, hash, frase de quien la creó, recibo y hash del plan) y consume un cupo; con ese evento vigente el ticket entra a `approved`. Si cualquier barrera falla —SECURITY, despliegue, impacto no listado, `block`, `review`, cupo agotado, sesión desatendida, autorización revocada o recibo viejo— no se registra nada y el motivo se dice. Sin autorización, R-CTRL-001 no cambia.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la elegibilidad existe pero es de solo lectura por diseño: `packages/engine/src/approval-eligibility.ts:70` (`elegibilidadDeAprobacion`) devuelve `elegible` y `autorizacion { id, hash }` y su cabecera dice que registrar la aprobación «es de quien consume esta decisión»; hoy el único consumidor es el comando de lectura `packages/cli/src/commands.ts:3525` (`approvalEligibilityCommand`). El cupo tiene escritor (`packages/engine/src/approval-authorization.ts:336`, `registrarUsoDeCupoDeAprobacion`) pero ningún llamador. Para entrar a `approved`, `packages/engine/src/transition.ts:356` exige `hasPlanGate` (`packages/core/src/validate.ts:265`), que para un tipo crítico (`packages/core/src/validate.ts:245`: FEATURE, SYNC, INTEGRATION, AGENT, SECURITY o con impactos) solo acepta la frase «aprobado explícitamente por el PO»; y `packages/engine/src/transition.ts:385` exige `aprobacionDePlanVigente` (`packages/engine/src/plan-approval.ts:91`), que lee eventos `plan-approved` con `actor`, `source`, `quote` y `planHash` y compara con `hashDelPlan` (`packages/engine/src/plan-approval.ts:40`). El único escritor de ese evento es `registrarAprobacionDePlan` (`packages/engine/src/plan-approval.ts:147`), que exige actor y frase humanos y una fuente de `plan-approval-sources`. No hay camino para una aprobación atribuida a una autorización.
- Barreras que ya resuelve el código y se reutilizan sin duplicar: SECURITY, despliegue declarado en el diagnóstico, `block` o rechazo humano de la compuerta de la etapa, `block` de `qa-mechanical`, `review`, cobertura de tipo/módulo/riesgo/impactos (migración, sincronización y contenedores solo si la autorización los lista) y cupo diario, todas en `packages/engine/src/approval-eligibility.ts:70`; la vigencia y la revocación (que vale desde su instante y también la produce un hash roto) en `packages/engine/src/approval-authorization.ts:251` (`leerAutorizacionesDeAprobacion`); el cupo restante en `packages/engine/src/approval-authorization.ts:357`; la barrera de sesión desatendida (`VALMEN_UNATTENDED`) en `packages/engine/src/plan-approval.ts:31` y `packages/engine/src/plan-approval.ts:197` (`assertSesionAtendida`).
- Barrera que falta: la elegibilidad no comprueba que el recibo `approve` siga vigente respecto al ticket. El recibo guarda `stateHash` del estado del ticket (`packages/engine/src/state.ts`, `buildGateState`, que incluye diagnóstico, plan y criterios), y la comparación ya se usa para `qa-mechanical` en `packages/engine/src/transition.ts:208`. Sin ella, un plan editado después del `approve` se aprobaría con un recibo que evaluó otro texto.
- Hipótesis pendientes: ninguna sobre la causa. Decisiones abiertas para el PO, con la opción que el plan toma por defecto: (1) la aprobación de `analysis` no destraba nada hoy —`analyzed → planned` ya avanza con el recibo en `approve`— y se registra solo como hecho atribuido y consume cupo, para que la visibilidad la cuente; (2) una autorización revocada **después** de registrar la aprobación y antes de `transition --to approved` invalida la aprobación pendiente (se re-verifica al avanzar).
- Memoria consultada: AP-007 (`.valmen/memory/aprendizajes.md:60`, la aprobación tiene que quedar ligada al recibo) —el evento cita el id del recibo y su `stateHash`—; AP-010 (`.valmen/memory/aprendizajes.md:84`) —el plan extiende archivos existentes en vez de crear módulos nuevos—.
- Consumidores afectados: de `aprobacionDePlanVigente` y del evento `plan-approved`: `packages/engine/src/transition.ts:385`, `packages/engine/src/next-step.ts:344`, `packages/engine/src/autonomous-run.ts:139`, `packages/engine/src/journey-preparation.ts:233`, `packages/engine/src/plan-approval-batch.ts:73` y `packages/cli/src/delegation.ts:244`; todos ven la aprobación por autorización como vigente sin cambio propio porque el evento conserva la forma `actor/source/quote/planHash`. De `hasPlanGate`: `packages/engine/src/transition.ts:356` y la validación R23 de `packages/core/src/validate.ts:620`. De la elegibilidad: `packages/cli/src/commands.ts:3525` y el despacho `packages/cli/src/main.ts:2042`. Pruebas existentes que fijan el comportamiento: `tests/aprobacion-de-plan.test.ts` y `tests/elegibilidad-aprobacion.test.ts`.
- Archivos y flujo investigados: `packages/engine/src/approval-authorization.ts`, `packages/engine/src/approval-authorization-link.ts`, `packages/engine/src/approval-eligibility.ts`, `packages/engine/src/plan-approval.ts`, `packages/engine/src/receipts.ts` (`veredictoDeCompuerta`, línea 125), `packages/engine/src/transition.ts`, `packages/engine/src/state.ts`, `packages/engine/src/reviewer.ts` (solo lectura, no registra), `packages/core/src/validate.ts`, `packages/cli/src/commands.ts`, `packages/cli/src/main.ts` y la spec `.valmen/features/aprobacion-autonoma-de-planes/spec/aprobacion/spec.md` (R-APRO-002 y sus dos escenarios). Flujo: compuerta → recibo `approve` → elegibilidad → [nuevo] registro atribuido + cupo → `transition --to approved` re-verifica.
- Riesgos y compatibilidad: es una ampliación de autoridad de aprobación, por eso SECURITY. Riesgos: (a) que el agente forje la aprobación escribiendo el evento o usando `approve-plan --source autorizacion` —se cierra rechazando esa fuente en `registrarAprobacionDePlan` y re-verificando al avanzar contra los registros `.valmen/approval/authorizations.jsonl` y `.valmen/approval/uses.jsonl`, que el evento no puede inventar—; (b) que la frase de la autorización se lea como frase de una persona sobre este plan —el actor del evento nombra la autorización y la fuente es `autorizacion`—; (c) consumir cupo sin registrar si la escritura del evento falla —queda del lado seguro: se pierde un cupo, no se aprueba nada—. Compatibilidad: sin autorización vigente, `approve-plan`, `hasPlanGate` y `transition` se comportan igual que hoy; los eventos `plan-approved` existentes conservan su forma.
- Impactos de sync, migración, Docker o despliegue: ninguno; el ticket no declara sincronización, migración ni contenedores, y solo agrega registros append-only bajo `.valmen/approval/` y eventos del ticket.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: registrar la aprobación atribuida a la autorización, su verificación al avanzar a `approved`, el comando de la CLI y sus pruebas. Exclusiones: las de la descripción funcional (revisor, visibilidad, jornada, MCP).
- Pasos ordenados:
  1. En `packages/engine/src/approval-eligibility.ts`, junto a `elegibilidadDeAprobacion`, agregar `aprobarPorAutorizacion({ paths, ticketId, etapa, ahora?, env? })`, la única función del módulo que escribe (actualizar la cabecera para decirlo). Orden: `assertSesionAtendida` de `packages/engine/src/plan-approval.ts` primero, antes de leer nada (C14); luego `elegibilidadDeAprobacion` y, si no es elegible, falla con `EXIT_INVARIANT` citando cada regla que no cumple, sin escribir ni consumir cupo (C6, C7, C8, C9, C10, C11); luego la regla nueva `recibo-vigente`: el recibo `approve` de `veredictoDeCompuerta` debe tener `stateHash === hashState(buildGateState(texto))` (las funciones de `packages/engine/src/state.ts` que ya usa `packages/engine/src/transition.ts:208`), y si no coincide falla pidiendo volver a correr la compuerta (C5). Si la etapa ya tiene una aprobación por autorización vigente para el mismo hash del plan, no escribe ni consume (C13). Si todo cumple: `registrarUsoDeCupoDeAprobacion` de `packages/engine/src/approval-authorization.ts` (C12) y después `appendEvent` de `packages/engine/src/mutate.ts` con la acción `plan-approved` (etapa `plan`) o `analysis-approved` (etapa `analysis`) y `details` JSON `{ actor: "autorización <id>", source: "autorizacion", quote: <frase literal de la autorización>, planHash: hashDelPlan(...), authorizationId, authorizationHash, stage, receiptId, receiptStateHash }` (C1, C18). Se exporta por `packages/engine/src/index.ts`.
  2. En `packages/engine/src/plan-approval.ts`: exportar `FUENTE_AUTORIZACION = "autorizacion"`; `registrarAprobacionDePlan` rechaza esa fuente siempre, venga de donde venga, para que `valmen approve-plan --source autorizacion` no pueda forjarla (C16); `leerAprobacion` conserva `authorizationId` y `authorizationHash` opcionales en `AprobacionDePlan`, sin cambiar la forma de los eventos existentes (C19).
  3. En `packages/core/src/validate.ts`, `hasPlanGate` acepta además un evento `plan-approved` del bloque `Eventos` cuyo `details.source` sea `autorizacion` y traiga `authorizationId`, también para los tipos críticos de `isCriticalPlanGate`; un SECURITY nunca lo acepta (C3, C6). La frase «aprobado explícitamente por el PO» sigue siendo la única vía humana.
  4. En `packages/engine/src/transition.ts`, en el bloque de `to === "approved"` (línea 385), si la aprobación vigente es de fuente `autorizacion` se re-verifica contra el registro: la autorización `authorizationId` existe en `leerAutorizacionesDeAprobacion` con el mismo `hash` y estado `vigente` ahora (C15), y `.valmen/approval/uses.jsonl` tiene un uso de esa autorización para este ticket y la etapa `plan` (C17); si falla, se rechaza con el motivo y la orden `valmen approve-plan` para una persona. El evento `plan-approval-verified` dice «autorización <id>», no una persona (C1, C2). Un plan editado después da `plan-cambiado` por `hashDelPlan` sin cambio adicional (C4).
  5. En `packages/cli/src/commands.ts` agregar `approveByAuthorizationCommand` y en `packages/cli/src/main.ts` el despacho y la ayuda de `valmen approve-by-authorization --id <ID> --stage analysis|plan`: imprime la autorización usada y el cupo que queda, o las reglas que fallan con salida de invariante (C20). Sin herramienta MCP.
  6. Pruebas sobre el registro temporal que ya arma `tests/elegibilidad-aprobacion.test.ts` (ticket, recibos y autorizaciones escritos por la prueba): un `describe` nuevo «aprobar por autorización» con el caso de control (BUGFIX normal, plan en `approve`, autorización que lo cubre con cupo) y un caso por barrera; en `tests/aprobacion-de-plan.test.ts` los casos de `hasPlanGate`, la fuente prohibida y la compatibilidad. Correr `npx vitest run tests/elegibilidad-aprobacion.test.ts tests/aprobacion-de-plan.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C21)
  7. Entrega: escribir en `## Pruebas` el contrato (comandos de arriba, directorio del worktree, resultado esperado, la validación manual de C20 con `valmen approve-by-authorization` sobre un registro temporal, y que no requiere red ni credenciales), correr la compuerta `valmen gate qa-mechanical --id SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007`, registrar el consumo de IA, `valmen secrets`, commit en la rama del worktree y pasar a `awaiting_user_tests`; la QA y el cierre son de una persona. (C21)
- Dependencias: FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 y SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007; usa sus funciones sin cambiar sus reglas.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket. Los eventos `plan-approved` de fuente `autorizacion` ya escritos dejan de satisfacer `hasPlanGate` y `transition` (vuelve a exigirse la aprobación de una persona) y los renglones de `.valmen/approval/uses.jsonl` quedan como historial append-only sin efecto; para cortar en caliente sin revertir, una persona revoca la autorización con `valmen approval-authorize revoke`, lo que el paso 4 hace valer de inmediato.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. R-APRO-002: con la compuerta `plan` en `approve` y una autorización vigente que cubre al ticket, `aprobarPorAutorizacion` registra un evento `plan-approved` cuyo actor y fuente nombran la autorización (id y hash) y no a una persona ni al agente
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C2. Un BUGFIX con esa aprobación registrada entra a `approved` con `transition`
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C3. Un FEATURE con esa aprobación registrada entra a `approved` sin la frase «aprobado explícitamente por el PO» en `## Plan`
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C4. Un plan editado después de aprobarse por autorización deja de valer y `transition --to approved` se rechaza
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C5. Un recibo `approve` cuyo hash de estado no coincide con el ticket actual no permite registrar la aprobación
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C6. Un ticket SECURITY no se aprueba por autorización y no consume cupo
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C7. Un ticket cuyo diagnóstico declara despliegue no se aprueba por autorización
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C8. Un ticket con impacto de migración que la autorización no lista no se aprueba por autorización
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C9. Un recibo `block` de la compuerta de la etapa impide registrar la aprobación
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C10. Un recibo `review` de la compuerta de la etapa impide registrar la aprobación
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C11. Una autorización con el cupo diario agotado impide registrar la aprobación
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C12. Registrar la aprobación consume exactamente un cupo de la autorización
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C13. Repetir el registro con la aprobación todavía vigente no escribe otro evento ni consume otro cupo
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C14. Una sesión con `VALMEN_UNATTENDED=1` no puede registrar la aprobación por autorización
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C15. Una autorización revocada después de registrar la aprobación hace que `transition --to approved` se rechace
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C16. `registrarAprobacionDePlan` rechaza la fuente `autorizacion`
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] C17. Un evento `plan-approved` de fuente `autorizacion` sin uso de cupo registrado para el ticket no permite entrar a `approved`
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C18. Con la compuerta `analysis` en `approve`, el registro deja un evento `analysis-approved` atribuido a la autorización
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C19. Sin autorización, la aprobación de una persona con `approve-plan` y la entrada a `approved` se comportan como antes
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [ ] C20. `valmen approve-by-authorization` imprime la autorización usada o las reglas que fallan
      <!-- verify: manual -->
- [x] C21. La comprobación de tipos del monorepo pasa
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/approval-eligibility.ts`: `aprobarPorAutorizacion` (sesión atendida primero; elegibilidad completa con todas las reglas que fallan; regla nueva de recibo vigente por `stateHash`; idempotencia; cupo y después evento atribuido con id y hash de la autorización, recibo y hash del plan) y `motivoDeAprobacionPorAutorizacionInvalida` (re-verificación contra el registro: SECURITY, existencia con el mismo hash, vigente ahora, uso de cupo del ticket en la etapa plan).
- `packages/engine/src/plan-approval.ts`: `FUENTE_AUTORIZACION`; `registrarAprobacionDePlan` la rechaza siempre; `AprobacionDePlan` conserva `authorizationId` y `authorizationHash` opcionales.
- `packages/engine/src/approval-authorization.ts`: `hayUsoDeCupoDeAprobacion` (solo lectura).
- `packages/core/src/validate.ts`: `hasPlanGate` acepta la última aprobación `plan-approved` de fuente `autorizacion` con su id, nunca en SECURITY.
- `packages/engine/src/transition.ts`: al entrar a `approved` re-verifica la aprobación por autorización; una revocación posterior al registro la anula (decisión 2 del PO). La aprobación de `analysis` se registra como `analysis-approved` y consume cupo, sin destrabar nada (decisión 1 del PO).
- `packages/cli/src/commands.ts` y `main.ts`: `valmen approve-by-authorization --id <ID> --stage analysis|plan`. Sin herramienta MCP.
- Pruebas: `tests/elegibilidad-aprobacion.test.ts` (describe «aprobar por autorización») y `tests/aprobacion-de-plan.test.ts`.

## Pruebas

- Directorio: la raíz del worktree del ticket (o del repositorio tras integrar). No requiere red ni credenciales.
- `npx vitest run tests/elegibilidad-aprobacion.test.ts tests/aprobacion-de-plan.test.ts`: 81 pruebas, todas en verde (C1 a C19, con caso de control por barrera).
- `npx tsc --noEmit -p tsconfig.json`: sin errores (C21).
- Validación manual (C20), sobre un registro temporal con un ticket `planned`, su recibo `plan` en approve y una autorización creada con `valmen approval-authorize`: `valmen approve-by-authorization --id <ID> --stage plan` imprime la autorización usada y el cupo que queda; sin autorización sale con 3 y lista las reglas que fallan. Después `valmen transition --id <ID> --entity ticket --to approved` entra; si antes se revoca la autorización, se rechaza.
- Verificado también con la prueba del comando `approveByAuthorizationCommand` (salida y códigos de salida).

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
    "notes": "Sesión de implementación del orquestador; el cliente no expone los números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:implementación en subagente sonnet, sin agregado de la sesión",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:56.247Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:17:59.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:19:17.528Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:21:36.933Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de SECURITY-ENGINE-APROBACION-POR-AUTORIZACION con los dos defectos: análisis registrado con cupo y revocación tardía que anula)\",\"planHash\":\"sha256:67aae11f5a82eb7bffd0e0267902636b00c68a68dfbb82c67da93066196a48e5\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:21:38.443Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:67aae11f5a82eb7bffd0e0267902636b00c68a68dfbb82c67da93066196a48e5."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:21:38.443Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:22:35.089Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:30:42.711Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:30:43.042Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
