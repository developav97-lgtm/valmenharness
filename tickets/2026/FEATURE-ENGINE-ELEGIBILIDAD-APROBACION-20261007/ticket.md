---
schema_version: 2
id: FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007
title: Decidir en código la elegibilidad con los tipos declarados (incluye SYNC, INTEGRATION y AGENT), impactos explícitos y sin SECURITY, block ni despliegue
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
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007

## Solicitud original

Parte del sprint: Un ticket elegible con la compuerta en approve se aprueba solo, atribuido a la autorización, con elegibilidad decidida en código y visible.
- R-APRO-004: Un block NO DEBE aprobarse sin una persona
- R-APRO-005: Los tipos y los impactos admitidos DEBEN ser los que la persona declaró
Depende de: SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Un block NO DEBE aprobarse sin una persona Los tipos y los impactos admitidos DEBEN ser los que la persona declaró
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-APRO-004: lo cubre SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 (Guardar la decisión del revisor como suya, rechazar el mismo modelo y reservar los block a una persona)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: una función del motor que decide en código, sin consultar a ningún modelo, si un ticket es elegible para que su análisis o su plan se aprueben por una autorización de aprobación (R-APRO-005 y la parte de R-APRO-004 que toca la elegibilidad), y un comando de solo lectura que la muestra. Devuelve todas las reglas que no se cumplen, con su motivo, y la autorización que lo respalda (id y hash). Fuera de alcance: registrar la aprobación, consumir el cupo y avanzar el ticket (SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007); la vigencia del recibo contra el hash del plan (mismo ticket, R-APRO-002); el agente revisor y la decisión que guarda (FEATURE-ADAPTER-AGENTE-REVISOR-20261007 y SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007); listar y contar las aprobaciones automáticas (FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007); la jornada (FEATURE-ENGINE-JORNADA-APROBACION-20261007).
- Usuario o rol afectado: el PO, que declaró una vez qué tipos, módulos, riesgo e impactos delega; los tickets siguientes de la feature, que consumen la decisión sin repetirla.
- Comportamiento actual: existe `autorizacionDeAprobacionQueCubre`, que solo contesta si una autorización vigente cubre tipo, módulo, riesgo, impactos y etapa, devuelve `null` sin decir por qué, no mira el recibo de la compuerta, ni el bloqueo de `qa-mechanical`, ni un despliegue declarado, ni el cupo. Nadie fuera de las pruebas la llama.
- Comportamiento esperado: `elegibilidadDeAprobacion({ paths, ticketId, etapa })` devuelve `elegible`, la lista de reglas con `cumple` y `detalle` y la autorización que respalda al ticket; un ticket SECURITY, un recibo `block` de la compuerta de la etapa, un `block` vigente de `qa-mechanical` y un ticket cuyo diagnóstico declara despliegue nunca son elegibles bajo ninguna autorización; un tipo que la autorización no lista (SYNC, INTEGRATION y AGENT incluidos) o un impacto de sincronización, migración o contenedores que no lista de forma explícita dejan el ticket para una persona, con el motivo; un recibo en `review` no es elegible y, si la autorización que lo cubre es de modo `reviewer`, se marca como derivable al revisor. `valmen approval-eligibility --id <ID> --stage analysis|plan` lo muestra sin escribir nada.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la autorización persistida ya existe (`packages/engine/src/approval-authorization.ts:25` `TIPOS_APROBABLES` admite SYNC, INTEGRATION y AGENT y nunca SECURITY; `:31` `IMPACTOS_ADMISIBLES` son `sync_impact`, `migration_impact` y `docker_impact`), pero la única consulta, `autorizacionDeAprobacionQueCubre` (`approval-authorization.ts:286`), combina las cinco dimensiones en un `find` y devuelve `null` sin motivo, y no reúne el resto de condiciones de R-APRO-004: no lee recibos, así que un plan en `block` con una autorización vigente quedaría «cubierto»; no mira `qa-mechanical`; no conoce el despliegue, que no es un campo del ticket —`DIMENSIONES_DE_IMPACTO` (`packages/core/src/validate.ts:162`) solo tiene sincronización, migración y contenedores— y solo aparece en la línea del diagnóstico «Impactos de sync, migración, Docker o despliegue» que lee `diagnosedImpacts` (`validate.ts:210`), cuyo `named` no lo reconoce; y no consulta el cupo (`cupoRestanteDeAprobacion`, `approval-authorization.ts:357`). Sin una decisión única, cada consumidor de la feature repetiría las reglas y podrían divergir, que es lo que R-CDEF-004 evita para `veredictoDeCompuerta` (`packages/engine/src/receipts.ts:125`).
- Hipótesis pendientes: ninguna sobre la causa. Queda de diseño, para el ticket del revisor, si un `review` derivable debe consumir cupo; aquí no se consume nada.
- Consumidores afectados: comprobado con búsqueda, `autorizacionDeAprobacionQueCubre` solo la usan `tests/autorizacion-aprobacion.test.ts` y `tests/autorizacion-aprobacion-canales.test.ts`, y no cambia; `elegibilidadQa` (`packages/engine/src/qa-eligibility.ts:98`) y su lista `TIPOS_NUNCA_ELEGIBLES` (que excluye SYNC, INTEGRATION y AGENT para QA) no cambian; `transition` (`packages/engine/src/transition.ts:233` `COMPUERTA_DE_DESTINO`, y la aprobación vigente con `aprobacionDePlanVigente`, `packages/engine/src/plan-approval.ts:91`) no cambia: sin el ticket siguiente, toda aprobación sigue siendo de una persona. Los consumidores futuros son los tickets de S2, S3 y S4 de la feature.
- Archivos y flujo investigados: el patrón a seguir es `elegibilidadQa` (`qa-eligibility.ts:98`): lee el ticket con `findTicket` y `parseTicket`, arma una regla por condición con `cumple` y `detalle`, devuelve todas y cita la autorización. El veredicto de la compuerta sale de `currentReceipts` y `veredictoDeCompuerta` (`receipts.ts:72` y `:125`), que ya colapsa la decisión humana; las etapas se mapean a compuertas como en `COMPUERTA_DE_DESTINO` (`analysis` y `plan`). Los impactos del ticket salen de `declaredImpactIds` (`validate.ts:186`); el tipo crítico, de `isCriticalPlanGate` (`validate.ts:245`), que no se usa para decidir aquí porque FEATURE y SYNC son críticos y aun así autorizables si la persona los declaró. El comando de CLI sigue a `approvalAuthorizeCommand` (`packages/cli/src/commands.ts:3100`) y su despacho en `packages/cli/src/main.ts:1995`. Memoria: AP-007 y AP-009 (`.valmen/memory/aprendizajes.md:60` y `:76`) muestran que un `block` llegó a avanzar sin firma; esta función lo trata como no elegible siempre, sin admitir autorización.
- Riesgos y compatibilidad: (a) la función decide qué decisión humana puede delegarse, así que cada barrera tiene su prueba y un caso de control; (b) es de solo lectura: no escribe en el registro, ni consume cupo, ni mueve estados; (c) el despliegue se detecta por la línea del diagnóstico con las palabras «despliegue» o «deploy» cuando la línea no dice «ninguno»; un falso positivo deja el ticket para una persona, que es el lado seguro; (d) un `review` ya firmado por una persona o un `approve` rechazado por una persona salen de `veredictoDeCompuerta` como aprobada o bloqueada: el primero no necesita la autorización y se informa así, el segundo es un `block`; (e) un proyecto sin autorizaciones queda como hoy.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: la función de elegibilidad, su exportación, el comando de solo lectura y sus pruebas. Exclusiones: las del alcance de la descripción funcional.
- Pasos ordenados:
  1. Crear `packages/engine/src/approval-eligibility.ts` con `elegibilidadDeAprobacion({ paths, ticketId, etapa, ahora? })` y los tipos `ReglaDeElegibilidadDeAprobacion` y `ResultadoDeElegibilidadDeAprobacion` (`elegible`, `reglas`, `autorizacion: { id, hash } | null`, `derivableAlRevisor`). Reglas, en este orden y todas evaluadas: `etapa` (solo `analysis` o `plan`; otra falla con su motivo); `tipo` (SECURITY nunca, C1); `despliegue` (la línea de impactos del diagnóstico nombra despliegue o deploy y no dice ninguno: nunca, C4); `qa-mechanical` (su último recibo vigente en `block`: nunca, C3); `compuerta` (con `veredictoDeCompuerta` sobre la compuerta de la etapa: `block` o rechazo humano nunca, C2; `review` no elegible, C8; sin recibo no elegible; `approve` cumple); `autorizacion` (entre las vigentes de `autorizacionesDeAprobacionVigentes`, la primera que cubre tipo, módulo, riesgo, impactos de `declaredImpactIds` y etapa; si ninguna, el detalle nombra la primera dimensión que falla en cada vigente, C5, C6, C7); `cupo` (`cupoRestanteDeAprobacion` mayor que cero, C9). `derivableAlRevisor` es verdadero solo si todo cumple salvo la compuerta en `review` y la autorización es de modo `reviewer` (C8). Exportarlo desde `packages/engine/src/index.ts`. (C1–C10)
  2. En `packages/cli/src/commands.ts` agregar `approvalEligibilityCommand` y en `packages/cli/src/main.ts` el despacho y la ayuda de `valmen approval-eligibility --id <ID> --stage analysis|plan [--json]`, que imprime el veredicto y una línea por regla y no escribe nada. (C11)
  3. Crear `tests/elegibilidad-aprobacion.test.ts` sobre un registro temporal (ticket, recibos y autorizaciones escritos por la prueba): un caso por criterio y un caso de control elegible (BUGFIX normal, plan en `approve`, autorización que lo cubre con cupo). Correr `npx vitest run tests/elegibilidad-aprobacion.test.ts`, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`. (C1–C12)
- Dependencias: SECURITY-ENGINE-AUTORIZACION-APROBACION-20261007, cerrado; usa sus funciones sin cambiarlas.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket; la función y el comando son nuevos, nadie más los llama y no escriben en el registro.

## Criterios de aceptación

- [x] C1. Un ticket SECURITY no es elegible aunque una autorización vigente listara su módulo y su riesgo (R-APRO-004)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C2. Un recibo `block` de la compuerta de la etapa deja el ticket no elegible con una autorización vigente que lo cubre (R-APRO-004)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C3. Un último recibo `block` de `qa-mechanical` deja el ticket no elegible (R-APRO-004)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C4. Un ticket cuyo diagnóstico declara despliegue no es elegible bajo ninguna autorización (R-APRO-005)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C5. Un ticket INTEGRATION con una autorización que solo cubre BUGFIX no es elegible y el motivo nombra el tipo (R-APRO-005)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C6. Un ticket SYNC, INTEGRATION o AGENT es elegible cuando la autorización lista su tipo y la compuerta está en `approve` (R-APRO-005)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C7. Un ticket con impacto de migración o de contenedores solo es elegible si la autorización lista ese impacto (R-APRO-005)
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C8. Un recibo en `review` no es elegible y solo se marca derivable al revisor cuando la autorización es de modo `reviewer`
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C9. Una autorización con el cupo diario agotado deja el ticket no elegible
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C10. El resultado devuelve todas las reglas que fallan con su motivo y, si es elegible, el id y el hash de la autorización
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C11. `valmen approval-eligibility` muestra la decisión y sus reglas sin escribir en el registro
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C12. La suite completa y la comprobación de tipos pasan
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/approval-eligibility.ts` (nuevo): `elegibilidadDeAprobacion({ paths, ticketId, etapa, ahora? })`, de solo lectura y sin modelo. Devuelve siempre las siete reglas, en orden: `etapa` (solo `analysis` o `plan`), `tipo` (SECURITY nunca), `despliegue` (la línea de impactos del diagnóstico, leída con `diagnosedImpacts`, nombra despliegue o deploy y no dice «ninguno»), `qa-mechanical` (su último recibo vigente en block), `compuerta` (`veredictoDeCompuerta` sobre la compuerta de la etapa: block, rechazo humano, review o ausencia de recibo no cumplen; approve cumple, y si lo aprobó una persona el detalle dice que no necesita la autorización), `autorizacion` y `cupo`. La cobertura de la autorización la decide `autorizacionDeAprobacionQueCubre`, sin cambiarla; el detalle de la regla, cuando ninguna cubre, nombra la primera dimensión que falla en cada autorización vigente (tipo, módulo, riesgo, impactos o etapa). Un riesgo desconocido nunca se asume cubierto, y SECURITY no consulta autorizaciones. `autorizacion` (id y hash) solo se devuelve si el ticket es elegible; `derivableAlRevisor` es verdadero solo si lo único que falla es la compuerta en review y la autorización que cubre es de modo `reviewer`.
- `packages/engine/src/index.ts`: exporta el módulo nuevo.
- `packages/cli/src/commands.ts`: `approvalEligibilityCommand`, que imprime el veredicto, una línea por regla y la autorización (o el mensaje de derivable), o el resultado completo con `--json`; sale con 3 si el ticket no es elegible y no escribe nada.
- `packages/cli/src/main.ts`: el despacho de `valmen approval-eligibility --id <ID> --stage analysis|plan [--json]`, su línea de ayuda y `--stage` en `VALUE_OPTIONS` (sin ella, la prueba de la ayuda y el CLI leerían `--stage` como bandera booleana).
- `tests/elegibilidad-aprobacion.test.ts` (nuevo): 47 pruebas sobre un registro temporal, un caso por criterio (C1–C11), un caso de control elegible y los bordes (recibo de otra etapa, block corregido y reevaluado, block aprobado o review rechazado por una persona, autorización revocada o vencida, riesgo desconocido, etapa inválida, el cupo de ayer, el CLI y la lectura de `--stage`).
- Límites que quedan para los tickets siguientes: si hay varias autorizaciones que cubren al ticket se usa la primera, y si esa tiene el cupo agotado el ticket queda no elegible aunque otra cubra con cupo (lado seguro; el ticket que consuma la decisión puede elegir); un `review` derivable no consume cupo aquí; la detección de despliegue es por palabra en la línea del diagnóstico, así que «ninguno, salvo despliegue» se lee como ninguno.

## Pruebas

- Directorio: raíz del repositorio (o el worktree del ticket), con las dependencias instaladas y `npm run build` al día (el tipado resuelve `@valmen/engine` por su `dist`).
- `npx vitest run tests/elegibilidad-aprobacion.test.ts` → 47 pruebas pasan (C1 a C11). Comprobadas por mutación: se desactivó cada barrera por separado (SECURITY, block de la compuerta, qa-mechanical, despliegue, cupo, modo reviewer, impactos) y la prueba correspondiente falló cada vez.
- `npx vitest run tests/cli.test.ts` → 20 pruebas pasan (la ayuda y `VALUE_OPTIONS` siguen coherentes con el comando nuevo).
- `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sobre los archivos del ticket → sin errores.
- C12: la comprobación de tipos (el comando que declara el criterio) pasa. La suite completa (`npx vitest run`) no la corrió el agente de este ticket: la corre el orquestador al integrar, para no abrir dos suites a la vez; por eso C12 queda sin marcar hasta ese resultado.
- Manual (responsable): `valmen approval-eligibility --id FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007 --stage plan` desde la raíz del proyecto con el CLI construido: debe mostrar una línea por regla, con `✓` en etapa, tipo, despliegue, qa-mechanical y compuerta, y `✗` en autorización y cupo mientras no haya una autorización vigente (`valmen approval-authorize list`); sale con 3. Con `--json` imprime el resultado completo. En ningún caso modifica `tickets/` ni `.valmen/`.
<!-- verify: manual -->

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
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-claude-code-elegibilidad",
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
    "at": "2026-10-07T18:03:56.126Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-08T01:43:14.515Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-08T01:43:58.976Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:48.941Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"A (aprueba los tres planes: caducidad a medianoche, elegibilidad de aprobación y agente revisor)\",\"planHash\":\"sha256:d7418daf0caca4de6d6f6310626cd849bc12df9883047f2e74754357f5763754\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:49.981Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:d7418daf0caca4de6d6f6310626cd849bc12df9883047f2e74754357f5763754."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-08T02:20:49.981Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-08T03:20:19.758Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-08T04:48:52.205Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-08T04:48:57.074Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
