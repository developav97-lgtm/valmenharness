---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-APROBACION-20261007
title: Aprobar los planes elegibles al preparar la jornada y dejar para una persona el resto con su aviso
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
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-JORNADA-APROBACION-20261007

## Solicitud original

Parte del sprint: La jornada aprueba los planes elegibles al armarse y la regla queda escrita en AGENTS.md.
- R-APRO-006: La jornada DEBE poder aprobar los planes al armarse
Depende de: SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007, FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La jornada DEBE poder aprobar los planes al armarse
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: reinterpretado para el modelo vigente. La jornada por launchd (`journey advance` desatendido, `install-trigger`) se retiró en CHORE-CLI-RETIRO-DISPARADOR-JORNADA; hoy los planes los prepara `valmen journey advance --fase preparacion` y la corrida la lleva el orquestador de la sesión con la skill `corrida-orquestada`. «Aprobar los planes elegibles al armarse» pasa a ser: el orquestador, con una sola orden sobre la jornada, aprueba atribuidos a la autorización vigente los planes elegibles y los deja en `approved`, y obtiene la lista de los no elegibles con su decisión pendiente en formato de opciones y efecto, para avisarla al PO por el canal de avisos.
- Exclusiones: no se cambian las reglas de `elegibilidadDeAprobacion` ni de `aprobarPorAutorizacion`; no se aprueba nada SECURITY, con despliegue ni con un `block`; no se deriva nada al revisor (queda listado como pendiente con la marca «derivable al revisor»); no se crea un aviso nuevo en el vigilante de `packages/cli/src/hermes.ts` (ver decisión pendiente en el plan); no se reactiva ninguna ejecución desatendida.
- Usuario o rol afectado: el PO, que hoy recibe en lote todos los planes de la ola aunque una autorización suya ya los cubra, y el orquestador de la sesión, que no tiene una orden de jornada para aprobar por autorización.
- Comportamiento actual: la aprobación por autorización existe ticket a ticket (`valmen approval-eligibility` y `valmen approve-by-authorization`), y `journey notify-plans` emite códigos para **todos** los planes en `planned` de la jornada; la skill `corrida-orquestada` todavía dice que la aprobación por autorización «no existe» y manda todos los planes en lote al PO.
- Comportamiento esperado: con cinco tickets en `planned` y una autorización que cubre cuatro, una orden de jornada deja cuatro en `approved` con la aprobación atribuida a la autorización y uno pendiente con su aviso de opciones y efecto; `journey notify-plans` después solo emite código para el pendiente; la skill dice al orquestador cuándo correr cada orden.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): las piezas existen pero nadie las une a nivel de jornada. `packages/engine/src/approval-eligibility.ts:93` (`elegibilidadDeAprobacion`) decide en código y `packages/engine/src/approval-eligibility.ts:340` (`aprobarPorAutorizacion`) registra la aprobación de un solo ticket, con las barreras SECURITY (línea 116), despliegue (línea 127), `block` y sesión atendida (línea 343); su único consumidor es `packages/cli/src/commands.ts:3605` (`approveByAuthorizationCommand`), por ticket. `aprobarPorAutorizacion` solo anexa el evento `plan-approved`: no mueve el ticket, y `packages/engine/src/journey-wave.ts:253` deja todo ticket en `planned` esperando «la aprobación de una persona», así que un plan aprobado por autorización tampoco entra en la ola hasta que alguien lo mueva. `packages/engine/src/plan-approval-batch.ts:52` (`emitirAprobacionesDeJornada`) recorre la jornada y emite códigos para todo plan en `planned` sin aprobación vigente (línea 73), sin mirar la autorización, y su mensaje (línea 142) lista códigos, no una decisión con opciones y efecto. La skill `.valmen/skills/corrida-orquestada/SKILL.md:17` declara ausente la dependencia SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007, que ya está en `main`, y su paso 3 (línea 39) no nombra ninguna orden.
- Lo que ya existe y no se replanifica: `approval-eligibility`, `approve-by-authorization`, `journey notify-plans --to telegram` (envío por `hermesSendChannel`, `packages/cli/src/commands.ts:3011`), `plan-approve --code` y `approve-plan`; la re-verificación de la fuente `autorizacion` al entrar a `approved` (`packages/engine/src/transition.ts:429`); el parte diario cuenta los planes en `planned` (`packages/cli/src/hermes.ts:1391`).
- Hipótesis pendientes: ninguna sobre el código. Queda una decisión de producto, no una hipótesis: si el aviso de los pendientes debe salir además por el vigilante (`pendientesDeAvisar`, `packages/cli/src/hermes.ts:759`) o basta `journey notify-plans --to telegram`; se plantea al PO en el plan.
- Consumidores afectados: el orquestador de la sesión (skill `corrida-orquestada`), `journey notify-plans` y `plan-approve` (que verán menos planes porque los aprobados ya no están en `planned`), `journey next --wave` (que ofrecerá los aprobados) y el parte diario de `packages/cli/src/hermes.ts:1304` (`armarParte`). Las pruebas `tests/aprobacion-de-lote.test.ts` y `tests/elegibilidad-aprobacion.test.ts` cubren las funciones reutilizadas.
- Archivos y flujo investigados: `packages/engine/src/approval-eligibility.ts`, `packages/engine/src/plan-approval-batch.ts`, `packages/engine/src/plan-approval.ts:117` (`aprobacionDePlanVigente`) y `packages/engine/src/plan-approval.ts:239` (`assertSesionAtendida`), `packages/engine/src/transition.ts:112`, `packages/engine/src/journey-wave.ts`, `packages/engine/src/journey-advance.ts:117`, `packages/engine/src/journey-preparation.ts:71`, `packages/cli/src/commands.ts` (`proyectoDeLaOla`, línea 3759), `packages/cli/src/main.ts:2047` (enrutado de `journey`) y `packages/cli/src/hermes.ts`. Memoria: `buscar_memoria` no devolvió un caso igual; AP-007 (recibo que no evaluó el texto actual) ya lo cubre `aprobarPorAutorizacion` en la línea 365.
- Riesgos y compatibilidad: el riesgo es aprobar de más. Se mitiga reutilizando `aprobarPorAutorizacion` sin cambiar sus reglas, de modo que SECURITY, despliegue, `block` y sesión desatendida siguen siendo barreras del motor, y `transition` re-verifica la autorización al entrar a `approved`. Un fallo en un ticket no debe cortar el lote ni dejar un cupo consumido sin aprobación distinta de la que ya admite `aprobarPorAutorizacion`. Compatible: ninguna orden existente cambia de salida ni de semántica; los eventos se anexan.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: una función de motor que aprueba por autorización los planes elegibles de una jornada y los mueve a `approved`, una orden `valmen journey approve-eligible` que la expone al orquestador, el aviso de los pendientes en formato de opciones y efecto, y la actualización de la skill `corrida-orquestada`. Exclusiones: las de la descripción funcional.
- Decisiones que este plan toma y la persona confirma al aprobarlo: (a) la orden es atendida —hereda `assertSesionAtendida`—, así que la «preparación» que aprueba es la del orquestador en sesión, no una corrida desatendida; (b) el aviso de los pendientes sale por la orden existente `journey notify-plans --to telegram`, que ya excluye lo aprobado, y no se agrega un tipo nuevo al vigilante; (c) un ticket `derivableAlRevisor` queda pendiente con esa marca y no se le pide nada al revisor.
- Pasos ordenados:
  1. En `packages/engine/src/plan-approval-batch.ts`, agregar `aprobarPlanesElegiblesDeJornada({ project, journeyId, ahora?, env? })`. Llama a `assertSesionAtendida` de `packages/engine/src/plan-approval.ts` antes de leer nada (C6). Recorre los tickets de la jornada con `readJourneys` en el mismo orden que `emitirAprobacionesDeJornada` (prioridad y orden), salta los que no están en `planned` o ya tienen `aprobacionDePlanVigente` vigente, y por cada uno llama a `elegibilidadDeAprobacion` con etapa `plan`. Si es elegible, llama a `aprobarPorAutorizacion` y después a `transition` de `packages/engine/src/transition.ts` con `to: "approved"`, y lo cuenta como aprobado con el id de la autorización y el recibo (C1, C2, C3). Si no es elegible, lo cuenta como pendiente con todas las reglas que fallan y la marca `derivableAlRevisor` (C4, C5, C7, C8, C11). Un error de un ticket (por ejemplo, el recibo que evaluó otro texto) se captura y ese ticket queda pendiente con el motivo, sin cortar el resto (C9). Un ticket ya aprobado no se vuelve a aprobar ni consume cupo (C10).
  2. En el mismo archivo, la función devuelve `mensaje`: una línea por aprobado («aprobado por la autorización <id>») y, por cada pendiente, un bloque con `Decisión: aprobar el plan de <ID> — <título>`, el motivo, `A) lo apruebas con valmen approve-plan --id <ID> --actor <tú> --quote "<tus palabras>" → pasa a approved y entra en la ola` y `B) no lo apruebas → queda en planned y la ola no lo ofrece` (C12, C13). Exportarla desde `packages/engine/src/index.ts`, que ya reexporta el módulo.
  3. En `packages/cli/src/commands.ts`, agregar `journeyApproveEligibleCommand(flags, { home?, root?, ahora?, env? })` junto a `journeyNotifyPlansCommand` (línea 3011): resuelve el proyecto con `proyectoDeLaOla` (línea 3759), exige `--journey <id>`, imprime el `mensaje` y sale con 0; sin `--journey` sale con el código de esquema (C14, C15). En `packages/cli/src/main.ts`, enrutar `journey approve-eligible` en la cadena de la línea 2047, sumarlo al mensaje de subcomandos admitidos y documentarlo en `USAGE` junto a `journey notify-plans` (línea 258) (C16).
  4. Pruebas en `tests/aprobacion-de-lote.test.ts`, que ya arma una jornada, planes en `planned` y recibos de `plan`: un `describe` «aprobar los elegibles de la jornada» con autorizaciones creadas como en `tests/elegibilidad-aprobacion.test.ts` (`crearAutorizacionDeAprobacion`): el escenario de cinco tickets con una autorización que cubre cuatro; un SECURITY, un `block` y un despliegue cubiertos por la autorización que no se aprueban; la sesión desatendida; el recibo viejo que no corta el lote; la repetición idempotente; el `notify-plans` posterior que solo emite el pendiente; y la orden del CLI. Correr `npx vitest run tests/aprobacion-de-lote.test.ts tests/elegibilidad-aprobacion.test.ts` y `npx tsc --noEmit -p tsconfig.json` (C1–C17, C19).
  5. En `.valmen/skills/corrida-orquestada/SKILL.md`, quitar la dependencia de la línea 17 que ya está en `main`, y reescribir «Aprobar» (líneas 33-41): primero `valmen journey approve-eligible --journey <id>`; después `valmen journey notify-plans --project <id> --journey <id> --to telegram` para los pendientes; el lote al PO con `approve-plan` o `plan-approve --code`; SECURITY, despliegue y `block` siguen siendo de una persona. Regenerar la proyección con `valmen sync` y comprobar con `valmen sync --check` (C18).
  6. Entrega: escribir en `## Pruebas` el contrato (los comandos del paso 4, el directorio del worktree, el resultado esperado, la validación manual de C20 sobre una jornada real con `valmen journey approve-eligible` y que no requiere red), correr la compuerta `valmen gate qa-mechanical --id FEATURE-ENGINE-JORNADA-APROBACION-20261007 --evaluator command`, registrar el consumo de IA, correr `valmen secrets`, commit en la rama del worktree y pasar a `awaiting_user_tests`; la QA y el cierre son de una persona (C20).
- Dependencias: SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 y FEATURE-ENGINE-VISIBILIDAD-APROBACIONES-20261007, integrados en `main` (los dos últimos en `awaiting_user_tests`); se usan sus funciones sin cambiar sus reglas.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket. Las aprobaciones ya registradas por la orden quedan como historial append-only atribuido a su autorización; para anular su efecto, una persona revoca la autorización con `valmen approval-authorize revoke`, y `transition` deja de aceptar esa fuente en lo que todavía no entró a `approved`. Un ticket que ya entró a `approved` por error se devuelve con `valmen transition --id <ID> --entity ticket --to blocked` y su motivo.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1. R-APRO-006: con cinco tickets de la jornada en `planned` y una autorización que cubre cuatro, `aprobarPlanesElegiblesDeJornada` deja cuatro en `approved`
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C2. Cada plan aprobado por la orden lleva un evento `plan-approved` de fuente `autorizacion` cuyo actor nombra la autorización, no a una persona ni a un modelo
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C3. Cada plan aprobado por la orden consume exactamente un cupo de la autorización
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C4. En el escenario de cinco tickets, el quinto queda en `planned` y aparece como pendiente
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C5. Un ticket SECURITY cubierto por la autorización no se aprueba y queda pendiente
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C6. Con `VALMEN_UNATTENDED` declarado la orden falla sin aprobar ningún plan
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C7. Un ticket con un recibo `block` en la compuerta de `plan` no se aprueba y queda pendiente
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C8. Un ticket cuyo diagnóstico declara despliegue no se aprueba y queda pendiente
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C9. Un ticket cuyo recibo de `plan` evaluó otro texto queda pendiente con el motivo y los demás elegibles se aprueban igual
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C10. Correr la orden dos veces no consume más cupo que la primera vez
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C11. Un pendiente lista todas las reglas de elegibilidad que no cumple
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C12. El aviso de cada pendiente trae la decisión con la opción A de aprobar y su efecto
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C13. El aviso de cada pendiente trae la opción B de no aprobar y su efecto
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C14. `journeyApproveEligibleCommand` con `--journey` imprime aprobados y pendientes y sale con 0
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C15. `journeyApproveEligibleCommand` sin `--journey` sale con el código de esquema
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C16. `USAGE` documenta `journey approve-eligible`
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C17. Tras la orden, `emitirAprobacionesDeJornada` emite código solo para los planes pendientes
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [ ] C18. La skill `corrida-orquestada` nombra `journey approve-eligible` y ya no declara ausente la aprobación por autorización
      <!-- test: node -e "const t=require('fs').readFileSync('.valmen/skills/corrida-orquestada/SKILL.md','utf8');process.exit(t.includes('journey approve-eligible')&&!t.includes('Mientras no exista')?0:1)" -->
- [ ] C19. El código compila sin errores de tipos
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C20. Sobre una jornada real con un plan elegible y uno no elegible, `valmen journey approve-eligible` aprueba el primero y avisa el segundo con sus opciones
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:56.682Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:55:57.819Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:57:11.507Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T22:03:11.300Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de JORNADA-APROBACION completo, con el aviso por journey notify-plans)\",\"planHash\":\"sha256:f3520cfab49284823d472a795f83b4abb3738958401a82965c56fd10085dd804\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T22:03:11.695Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:f3520cfab49284823d472a795f83b4abb3738958401a82965c56fd10085dd804."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T22:03:11.695Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
