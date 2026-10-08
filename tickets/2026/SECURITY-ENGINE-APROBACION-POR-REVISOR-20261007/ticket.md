---
schema_version: 2
id: SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007
title: Guardar la decisión del revisor como suya, rechazar el mismo modelo y reservar los block a una persona
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

# SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007

## Solicitud original

Parte del sprint: Un agente revisor decide los review autorizados, con un modelo distinto al productor y registrado como decisión del revisor. Depende de la feature perfiles-de-modelos para elegir el modelo.
- R-APRO-003: Un agente revisor DEBERÍA decidir los review cuando la autorización lo declara
- R-APRO-004: Un block NO DEBE aprobarse sin una persona
Depende de: SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007, FEATURE-ADAPTER-AGENTE-REVISOR-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un agente revisor DEBERÍA decidir los review cuando la autorización lo declara Un block NO DEBE aprobarse sin una persona
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-003: lo cubre FEATURE-ADAPTER-AGENTE-REVISOR-20261007 (Definir el rol revisor y ejecutarlo con un modelo distinto al que produjo el artefacto)
- R-APRO-004: lo cubre FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 (Decidir en código la elegibilidad con los tipos declarados (incluye SYNC, INTEGRATION y AGENT), impactos explícitos y sin SECURITY, block ni despliegue)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: registrar la decisión del agente revisor sobre un recibo `review` de `analysis` o `plan` como decisión **del revisor** (no de una persona ni de la autorización sola), con barreras del motor —no solo del enrutado— contra el mismo modelo que produjo el artefacto, contra un recibo que ya no corresponde al ticket (`stateHash`) y contra cualquier recibo `block`; y hacer que `transition` acepte esa decisión, re-verificada, para entrar a `planned` y `approved`. Exclusiones: la elegibilidad (tipo, impactos, cupo, modo de la autorización) es de FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 y se usa sin cambiar sus reglas; elegir y ejecutar al revisor es de FEATURE-ADAPTER-AGENTE-REVISOR-20261007; la jornada que lo despacha es de FEATURE-ENGINE-JORNADA-APROBACION-20261007; sin herramienta MCP.
- Usuario o rol afectado: el PO que declara una autorización de modo `reviewer`; el agente revisor; quien mueve el ticket con `transition`.
- Comportamiento actual: `valmen review-agent` ejecuta al revisor e imprime `approve` o `reject`, pero no lo guarda (`packages/cli/src/commands.ts:3506`); el recibo `review` sigue esperando a una persona y `transition` lo rechaza sin `humanDecision` (`packages/engine/src/transition.ts:268`). El modo `reviewer` de la autorización solo se refleja en `derivableAlRevisor` (`packages/engine/src/approval-eligibility.ts:255`), que nadie ejerce.
- Comportamiento esperado: con un recibo `review` vigente, una autorización vigente de modo `reviewer` que cubre al ticket y cupo, el revisor —un modelo distinto de todo productor registrado— decide; un `approve` queda guardado en una versión nueva del recibo como `reviewerDecision` y en un evento de etapa de fuente `revisor`, consume un cupo y deja avanzar; un `reject` queda guardado y el recibo sigue esperando a una persona. Un `block` nunca llega al revisor ni se registra por él: es de una persona. Un ticket SECURITY no se aprueba por revisor.

## Diagnóstico

- Síntoma comprobado: la solicitud dejó el comportamiento actual por establecer; leyendo el código, es este: con una autorización de modo `reviewer` y un recibo `review` que el revisor aprueba, el ticket **no puede avanzar** —`transition --to planned|approved` falla pidiendo `gate-decide` de una persona (`packages/engine/src/transition.ts:308-318`)—, porque la decisión del revisor no se guarda en ningún lado, y nada en el motor impide que, si se guardara por la vía existente, la registrara el mismo modelo productor, sobre un recibo viejo o sobre un `block`. La causa siguiente explica cada parte del síntoma.
- Causa comprobada (con `ruta:línea`): (1) `ejecutarRevisor` (`packages/engine/src/reviewer.ts:271`) devuelve `ResultadoDeRevision` sin escribir, por diseño de AGENTE-REVISOR (`reviewer.ts:9-13`): no hay función que guarde la decisión. (2) La separación de modelos solo existe al **elegir** (`modeloDelRevisor`, `packages/adapter/src/routing.ts:1329`, llamada en `reviewer.ts:230`); nada la re-comprueba al registrar, así que un resultado armado a mano o un enrutado cambiado entre la elección y el registro no se detectaría. (3) `prepararRevision` no compara `recibo.stateHash` con el ticket actual (`reviewer.ts:162-189`), a diferencia de `aprobarPorAutorizacion`, que sí lo hace (`packages/engine/src/approval-eligibility.ts:364-371`): un revisor podría aprobar un recibo que evaluó otro texto (AP-007, `.valmen/memory/aprendizajes.md:60`). (4) `prepararRevision` solo envía las proposiciones `inBand` (`reviewer.ts:192-212`): si el `review` viene de otra causa no hay nada que el revisor pueda resolver, y una aprobación del revisor no debe cubrir proposiciones que nunca vio. (5) La única forma de dejar pasar un recibo `review` es `humanDecision` (`packages/engine/src/receipts.ts:133-142`, `packages/gate/src/receipt.ts:410`), que es de una persona y admite `block`; escribir ahí la decisión del revisor la atribuiría a una persona y le abriría los `block`. (6) `hasAuthorizationPlanApproval` (`packages/core/src/validate.ts:256`) y la re-verificación de `transition` (`packages/engine/src/transition.ts:397`) solo conocen la fuente `autorizacion`; `registrarAprobacionDePlan` prohíbe esa fuente (`packages/engine/src/plan-approval.ts:179`) pero no conoce una fuente `revisor`.
- Hipótesis pendientes: ninguna sobre el código. Decisiones de diseño que el plan toma y la persona confirma al aprobarlo: un `reject` del revisor no bloquea (el recibo sigue esperando a una persona); el registro exige sesión atendida, como `aprobarPorAutorizacion` (`plan-approval.ts:222`).
- Consumidores afectados: `transition` al entrar a `planned` (`exigirDecisionDeCompuerta`, `transition.ts:268`) y a `approved` (`transition.ts:382-410`); `hasPlanGate` (`validate.ts:282`) que usan `valmen validate` y la compuerta de plan; `registrarAprobacionDePlan` (`valmen approve-plan`); `reviewAgentCommand` (`packages/cli/src/commands.ts:3453`) y su ayuda (`packages/cli/src/main.ts:265`). Lectores del recibo que **no cambian** y siguen viendo el recibo en `review` con `humanDecision: null`: `veredictoDeCompuerta` (`receipts.ts:125`) y por él `next-step.ts`, `approval-eligibility.ts`, `hermes.ts:767`, `precision.ts:128` y `umbrales-propuestos.ts:72` —la precisión de compuertas no cuenta la decisión del revisor como humana, lo cual es correcto—.
- Archivos y flujo investigados: `packages/engine/src/reviewer.ts` (preparar → ejecutar), `packages/engine/src/approval-eligibility.ts` (elegibilidad, `aprobarPorAutorizacion`, `motivoDeAprobacionPorAutorizacionInvalida`), `packages/engine/src/plan-approval.ts`, `packages/engine/src/transition.ts`, `packages/engine/src/receipts.ts`, `packages/gate/src/receipt.ts`, `packages/core/src/validate.ts`, `packages/adapter/src/routing.ts`, `packages/gate-llm-judge/src/reviewer.ts` (la decisión `approve` exige todas respaldadas, `:283`), `packages/cli/src/commands.ts`, `tests/agente-revisor.test.ts`, `tests/elegibilidad-aprobacion.test.ts`. Memoria: AP-007 y AP-009 (`.valmen/memory/aprendizajes.md:60` y `:76`).
- Riesgos y compatibilidad: es una ampliación de quién puede aprobar; el riesgo es que un modelo apruebe lo que una persona habría bloqueado. Se mitiga con barreras en el motor y re-verificación al avanzar, cada una con su prueba de control. Los recibos y eventos existentes no cambian de forma: `reviewerDecision` es un campo opcional nuevo, como `notes` (`receipt.ts:183`), y los recibos sin él se leen igual. Si el commit se revierte, una `reviewerDecision` ya escrita deja de tener efecto y vuelve a exigirse una persona.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: guardar la decisión del revisor como suya (en el recibo y en un evento de etapa de fuente `revisor`), las barreras del motor al registrarla, la re-verificación en `transition`, la opción `--record` de `valmen review-agent` y sus pruebas. Exclusiones: las de la descripción funcional; no se cambian las reglas de `elegibilidadDeAprobacion` ni la elección del revisor; no se toca el tipo del recibo del paquete de compuertas ni `withHumanDecision`.
- Decisiones que este plan toma y la persona confirma al aprobarlo: (a) un `reject` del revisor se guarda pero **no** bloquea: el recibo sigue esperando a una persona y no consume cupo; (b) registrar exige sesión atendida, como `aprobarPorAutorizacion`; (c) un recibo `review` con causas fuera de la banda media (por ejemplo, la contradicción interna de AP-004) no se deriva al revisor y queda para una persona.
- Pasos ordenados:
  1. En `packages/engine/src/plan-approval.ts`, exportar `FUENTE_REVISOR = "revisor"` junto a `FUENTE_AUTORIZACION` y hacer que `registrarAprobacionDePlan` la rechace siempre, como ya rechaza `autorizacion` en la línea 179, para que `valmen approve-plan --source revisor` no la pueda forjar; `leerAprobacion` conserva un campo opcional `reviewerModel` sin cambiar los eventos existentes. (C20, C22)
  2. En `packages/engine/src/approval-eligibility.ts`, `motivoDeAprobacionPorAutorizacionInvalida` recibe un parámetro opcional `etapa` (por defecto `plan`, sin cambio para quien ya la llama) y lo pasa a `hayUsoDeCupoDeAprobacion`, para reutilizarla desde el revisor sin duplicar la re-verificación de autorización (existe con el mismo hash, vigente ahora, cupo usado para el ticket y la etapa). (C19, C22)
  3. En `packages/engine/src/reviewer.ts`, agregar `barrerasDelRegistro({ paths, ticketId, etapa, reciboId, porProposicion, revisor, ahora })`, pura, que devuelve **todas** las barreras que fallan con su motivo, en este orden: ticket SECURITY (C15); último recibo de la etapa por `veredictoDeCompuerta` de `packages/engine/src/receipts.ts` igual a `reciboId`, en `review`, sin `humanDecision` y sin `reviewerDecision` previa, y un `block` falla diciendo que es de una persona (C12, C21); `recibo.stateHash` igual a `hashState(buildGateState(texto))`, como en `packages/engine/src/approval-eligibility.ts:364` (C10); proposiciones `inBand` no vacías, toda proposición fuera de banda con efecto `approve` y el conjunto de `porProposicion` igual al de las `inBand` (C13, C14); `productoresDelTicket` no vacío y ni `revisor.model` ni `revisor.resolvedVersion`, normalizados con `normalizarModelo` de `packages/adapter/src/routing.ts:1310`, entre los productores (C8, C9); y `elegibilidadDeAprobacion(...).derivableAlRevisor` verdadero, que ya cubre tipo, despliegue, `qa-mechanical`, modo `reviewer` de la autorización y cupo (C16, C17). `prepararRevision` llama a la parte de recibo vigente y `stateHash` antes de elegir al revisor, para no pagar un modelo sobre un recibo viejo (C11).
  4. En `packages/engine/src/reviewer.ts`, agregar `registrarDecisionDelRevisor({ paths, ticketId, resultado, ahora?, env? })`, la única función del módulo que escribe (actualizar la cabecera de las líneas 9-13). Orden: `assertSesionAtendida` de `packages/engine/src/plan-approval.ts` antes de leer nada (C18); `barrerasDelRegistro` y, si alguna falla, `fail` con `EXIT_INVARIANT` citando cada una, sin escribir ni consumir cupo (C8–C17). Con `approve`: `registrarUsoDeCupoDeAprobacion` de `packages/engine/src/approval-authorization.ts` (C3); `appendReceipt` de una versión nueva del mismo recibo con `reviewerDecision: { decision, reason, porProposicion, revisor, productores, authorizationId, authorizationHash, receiptStateHash, usage, decidedAt }` y `humanDecision` en `null`, tipada en el motor como extensión opcional del recibo (C1); y `appendEvent` de `packages/engine/src/mutate.ts` con `analysis-approved` o `plan-approved`, `details` `{ actor: "revisor <proveedor>/<modelo> (autorización <id>)", source: "revisor", quote, planHash, authorizationId, authorizationHash, reviewerModel, stage, receiptId, receiptStateHash }` (C2). Con `reject`: solo la versión del recibo con `reviewerDecision` y un evento `reviewer-rejected`, sin cupo (C6, C7). Un recibo que ya tiene `reviewerDecision` no se vuelve a escribir (C21).
  5. En `packages/engine/src/transition.ts`, en `exigirDecisionDeCompuerta` (línea 268), antes de fallar por un recibo `review` sin decisión humana, aceptar una `reviewerDecision` `approve` re-verificada por una función nueva `motivoDeDecisionDelRevisorInvalida` de `packages/engine/src/reviewer.ts` (no SECURITY, recibo no `block`, `receiptStateHash` igual al del recibo, revisor fuera de los productores registrados ahora, y `motivoDeAprobacionPorAutorizacionInvalida` con la etapa y modo `reviewer`) (C4, C5, C19); un `reject` del revisor deja el error actual pidiendo a una persona (C6). En el bloque de `to === "approved"` (línea 382) la fuente `revisor` se re-verifica igual que `autorizacion`, y `plan-approval-verified` nombra al revisor y la autorización (C4, C19).
  6. En `packages/core/src/validate.ts`, `hasAuthorizationPlanApproval` (línea 256) acepta también `source: "revisor"` con `authorizationId`; un SECURITY sigue sin aceptarla (línea 298). (C23)
  7. En `packages/cli/src/commands.ts`, `reviewAgentCommand` (línea 3453) gana `--record`: tras `ejecutarRevisor` llama a `registrarDecisionDelRevisor` e imprime decisión, recibo, autorización y cupo restante; sin `--record` sigue sin escribir (línea 3506). En `packages/cli/src/main.ts` se actualiza la ayuda de la línea 265. Sin herramienta MCP. (C24)
  8. Pruebas: en `tests/agente-revisor.test.ts`, que ya arma recibos, fases y un `fetch` simulado, un `describe` «la decisión del revisor se registra» con el caso de control (BUGFIX normal, recibo `plan` en `review` con una proposición en banda, autorización `reviewer` con cupo, revisor distinto) y un caso por barrera, más las transiciones a `planned` y `approved`; en `tests/aprobacion-de-plan.test.ts` la fuente prohibida y `hasPlanGate`. Correr `npx vitest run tests/agente-revisor.test.ts tests/aprobacion-de-plan.test.ts tests/elegibilidad-aprobacion.test.ts tests/transicion-approved-registrada.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C25)
  9. Entrega: escribir en `## Pruebas` el contrato (los comandos del paso 8, el directorio del worktree, el resultado esperado, la validación manual de C24 con `valmen review-agent --record` y que no requiere red porque el modelo se simula), correr la compuerta `valmen gate qa-mechanical --id SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 --evaluator command`, registrar el consumo de IA, correr `valmen secrets`, commit en la rama del worktree y pasar a `awaiting_user_tests`; la QA y el cierre son de una persona. (C25)
- Dependencias: FEATURE-ADAPTER-AGENTE-REVISOR-20261007, FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 y SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007, ya en `main`; se usan sus funciones sin cambiar sus reglas.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket. Las versiones de recibo con `reviewerDecision` y los eventos de fuente `revisor` ya escritos quedan como historial append-only sin efecto: `transition` y `hasPlanGate` vuelven a exigir la decisión de una persona. Para cortar en caliente sin revertir, una persona revoca la autorización con `valmen approval-authorize revoke`, que el paso 5 hace valer de inmediato.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. R-APRO-003: un `approve` del revisor queda en una versión nueva del recibo como `reviewerDecision` con el modelo revisor, y `humanDecision` sigue en `null`
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C2. El `approve` del revisor anexa un evento de etapa de fuente `revisor` cuyo actor nombra al modelo revisor y a la autorización, no a una persona
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C3. Un `approve` registrado consume exactamente un cupo de la autorización
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C4. Un BUGFIX con el `approve` del revisor registrado sobre el recibo de `plan` entra a `approved` con `transition`
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C5. Un ticket con el `approve` del revisor registrado sobre el recibo de `analysis` entra a `planned` con `transition`
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C6. Un `reject` del revisor queda en el recibo y `transition` sigue exigiendo la decisión de una persona
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C7. Un `reject` del revisor no consume cupo
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C8. Si el modelo revisor coincide con un productor registrado, el registro se rechaza sin escribir nada
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C9. Si el ticket no tiene productor registrado, el registro se rechaza sin escribir nada
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C10. Si el `stateHash` del recibo no coincide con el ticket actual, el registro se rechaza sin escribir nada
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C11. `prepararRevision` rechaza un recibo con `stateHash` desactualizado sin elegir ni llamar al revisor
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C12. R-APRO-004: un recibo `block` no admite el registro del revisor y no se escribe nada
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C13. Un recibo `review` sin proposiciones en banda media, o con otra proposición que no aprobó, no admite el registro del revisor
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C14. Una decisión cuyas proposiciones no son exactamente las de la banda media del recibo se rechaza
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C15. Un ticket SECURITY no admite el registro del revisor y no consume cupo
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C16. Una autorización de modo `on-approve` no habilita el registro del revisor
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C17. Una autorización con el cupo del día agotado no habilita el registro del revisor
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C18. Una sesión desatendida no puede registrar la decisión del revisor
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C19. Revocar la autorización después del registro hace que `transition` rechace el avance
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C20. `registrarAprobacionDePlan` rechaza la fuente `revisor`
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] C21. Registrar dos veces sobre el mismo recibo no escribe otra versión ni consume otro cupo
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C22. La aprobación por autorización y los recibos sin `reviewerDecision` se comportan como antes
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts tests/transicion-approved-registrada.test.ts -->
- [x] C23. `hasPlanGate` acepta la aprobación de fuente `revisor` en un FEATURE y la rechaza en un SECURITY
      <!-- test: npx vitest run tests/aprobacion-de-plan.test.ts -->
- [x] C24. `valmen review-agent --record` imprime la decisión registrada con la autorización y el cupo restante
      <!-- test: npx vitest run tests/agente-revisor.test.ts -->
- [x] C25. El proyecto compila sin errores de tipos
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/plan-approval.ts`: `FUENTE_REVISOR` y `registrarAprobacionDePlan` la rechaza siempre; `leerAprobacion` conserva `reviewerModel` (C20).
- `packages/engine/src/approval-eligibility.ts`: `motivoDeAprobacionPorAutorizacionInvalida` recibe `etapa` opcional (por defecto `plan`), se reutiliza sin duplicar la re-verificación (C19, C22).
- `packages/engine/src/reviewer.ts`: `barrerasDelRegistro` (todas las barreras que fallan), `registrarDecisionDelRevisor` (única función que escribe: sesión atendida, barreras, cupo solo en `approve`, nueva versión del recibo con `reviewerDecision` y `humanDecision` en `null`, evento de fuente `revisor` o `reviewer-rejected`), `motivoDeDecisionDelRevisorInvalida` (re-verificación) y `prepararRevision` rechaza un recibo con `stateHash` desactualizado antes de elegir revisor (C1-C18, C21).
- `packages/engine/src/transition.ts`: `exigirDecisionDeCompuerta` acepta un `approve` del revisor re-verificado (un `reject` o un `block` siguen pidiendo a una persona); `approved` re-verifica la fuente `revisor` contra el recibo de plan y la autorización (C4, C5, C6, C19).
- `packages/core/src/validate.ts`: `hasPlanGate` acepta la fuente `revisor` (nunca en SECURITY) (C23).
- `packages/cli/src/commands.ts` y `main.ts`: `review-agent --record` (C24).
- `tests/agente-revisor.test.ts` y `tests/aprobacion-de-plan.test.ts`: caso de control y un caso por barrera; el helper de recibos usa el `stateHash` real del ticket.

## Pruebas

Directorio: la raíz del worktree/repositorio (`/Users/juanandrade/Desktop/ValmenHarness`, o el worktree `.claude/worktrees/ticket-aprobacion-por-revisor`). No requiere red ni claves: el modelo se simula con un `fetch` falso.

1. `npx vitest run tests/agente-revisor.test.ts tests/aprobacion-de-plan.test.ts tests/elegibilidad-aprobacion.test.ts tests/transicion-approved-registrada.test.ts` — esperado: 4 archivos, 165 pruebas en verde.
2. `npx tsc --noEmit -p tsconfig.json` — esperado: sin salida y código 0.

Validación manual (C24, la cubre también `tests/agente-revisor.test.ts`): en un proyecto con un recibo `plan` en `review`, una autorización de modo `reviewer` (`valmen approval-authorize`) y un productor distinto registrado, `valmen review-agent --id <ID> --stage plan --record` imprime «Registrada como decisión del revisor en el recibo … (autorización APA-…)» y los cupos que quedan; sin `--record` sigue imprimiendo «No se registró». Un recibo `block`, un SECURITY o el mismo modelo salen con código 3 sin escribir.

Limitación: la llamada real al modelo revisor no se probó (se simula la red); el PO decide si la prueba con un proveedor real es necesaria.

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
    "notes": "Sesión de subagente (claude-sonnet-5-5, implementación); sin agregado de tokens expuesto, no se estima.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion-sonnet-5-5",
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
    "at": "2026-10-07T18:03:56.575Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:34:44.506Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:39:25.571Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (recibo GR-20261008-SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007-analysis-2, canal cli, decidida 2026-10-08T21:39:25.567Z): A"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:39:37.814Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:41:42.502Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de SECURITY-ENGINE-APROBACION-POR-REVISOR con sus tres decisiones de diseño)\",\"planHash\":\"sha256:b1ab142541f2b2105cb2831d3aee1286ecc0024bc695997a2a1e0def260b14cd\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:41:42.841Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:b1ab142541f2b2105cb2831d3aee1286ecc0024bc695997a2a1e0def260b14cd."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:41:42.841Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:44:01.606Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:52:38.916Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T21:52:39.354Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
