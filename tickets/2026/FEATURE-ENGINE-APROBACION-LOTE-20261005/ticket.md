---
schema_version: 2
id: FEATURE-ENGINE-APROBACION-LOTE-20261005
title: Aprobar planes en lote desde Telegram con enlace firmado
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
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-APROBACION-LOTE-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-004: La aprobación de los planes DEBE poder darse en lote desde Telegram
Depende de: FEATURE-ENGINE-JORNADA-PREPARACION-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: poder aprobar los planes listos de una jornada en lote desde Telegram (R-JORN-004): un mensaje con un código de aprobación por plan y uno para el lote, firmados con el HMAC que ya usa el harness para decidir compuertas a distancia; la aprobación se registra según R-CTRL-001, con fuente `token` y la frase de quien aprueba. Fuera de alcance: la ejecución de los tickets aprobados, el aviso de «plan listo» en sí (lo arma el vigilante) y cualquier aprobación de despliegue o de riesgo alto, que sigue sin poder decidirse a distancia.
- Usuario o rol afectado: el responsable que aprueba planes desde el celular, y el agente, que no puede aprobar.
- Comportamiento actual: el token firmado de `packages/engine/src/approval.ts` decide el veredicto de una **compuerta** de un ticket (`gate-decide --code`), con techo de riesgo, un solo uso y registro append-only; no existe un token para aprobar un **plan** ni uno para varios tickets a la vez, y la aprobación del plan se registra solo con `valmen approve-plan` en la máquina (fuentes `cli` y `mission-control`).
- Comportamiento esperado: `valmen journey notify-plans --project <id> [--journey <id>] [--to telegram]` reúne los tickets de la jornada que están en `planned` con la compuerta `plan` aprobada, emite un código por plan —atado al hash del plan de ese momento— y uno de lote, y los envía en un mensaje; `valmen plan-approve --code <código> --actor <nombre> --quote "<frase>"` verifica el código y registra la aprobación del plan con fuente `token` (el lote registra una por ticket). Un plan que cambió desde que se emitió el código no se aprueba, un código se usa una sola vez y un ticket por encima del techo de riesgo no recibe código. La fuente `token` solo vale si el proyecto la declara en `plan-approval-sources`: sin eso, nada cambia.

## Diagnóstico

- Archivos y flujo investigados: `mintApproval`, `verifyApproval`, `resolveApprovalCode`, `appendApproval` y `motivoDeTecho` en `packages/engine/src/approval.ts` emiten, verifican y registran los códigos (claims con compuerta, ticket, recibo, hash del estado, expiración y nonce; techo de riesgo que impide emitir para `high`, `critical` y los impactos de sincronización, migración y contenedores); `decideByCode` en `packages/cli/src/hermes.ts:562` consume el código y llama a `recordHumanDecision`; `registrarAprobacionDePlan` y `aprobacionDePlanVigente` en `packages/engine/src/plan-approval.ts` registran y verifican la aprobación con actor, fuente, frase y hash del plan, y la exigencia ya está en `transition.ts` para entrar a `approved`; el envío por Telegram usa `hermesSendChannel` de `packages/engine/src/notify.ts`; el avance de la jornada y la preparación están en `journey-advance.ts` y `journey-preparation.ts`.
- Causa raíz o hipótesis: el token firmado se diseñó para decidir una compuerta con un recibo como sujeto; un plan aprobado necesita otro sujeto —el hash del plan— y el lote necesita agrupar varios sujetos. Comprobado: los claims no tienen un campo para el hash del plan ni para una lista. La decisión debe pasar por el mismo registro que ya existe (`registrarAprobacionDePlan`) y no escribir la aprobación por otro camino: dos caminos para aprobar divergen.
- Riesgos y compatibilidad: es una autoridad de aprobación nueva, por eso exige tu aprobación del plan. El token firmado cubre ticket y hash del plan, no se puede reutilizar ni cambiar de sujeto; el techo de riesgo se aplica antes de emitir; el secreto sigue en el almacén de credenciales (`VALMEN_APPROVAL_SECRET` o `~/.valmen/.credentials.yaml`) y nunca se genera ni se guarda en el repositorio. La fuente `token` es opt-in por proyecto (`plan-approval-sources`), así que los proyectos que no la declaran no cambian. Los tickets de tipo `SECURITY` no reciben código remoto: su aprobación exige la máquina. Consumidores comprobados: `mintApproval` y `verifyApproval` los llaman `packages/cli/src/hermes.ts` y sus pruebas; los claims nuevos son aditivos y los tokens antiguos siguen verificándose igual. La barrera de sesión desatendida no se salta: el consumo del código lo hace una persona con `plan-approve`.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), Juan Andrade, 2026-10-06: «si apruebo los planes»; compuerta `plan` aprobada por el evaluador y registrada en su recibo.
- Alcance: tokens de aprobación de plan y de lote, su emisión por jornada, su consumo con registro según R-CTRL-001 y el aviso por Telegram. Exclusiones: ejecución, despliegues, riesgo alto o crítico y tickets de seguridad.
- Pasos ordenados:
  1. En `packages/engine/src/approval.ts` agregar los claims de plan (`planHash` y la clase de sujeto `plan`) y las funciones `mintPlanApproval` y `verifyPlanApproval`: el token cubre ticket y hash del plan, se rechaza para tickets que `motivoDeTecho` excluye y para tipo `SECURITY`, conserva el nonce, el uso único y el registro append-only; los tokens antiguos se verifican como hasta ahora.
  2. Crear `packages/engine/src/plan-approval-batch.ts` con `emitirAprobacionesDeJornada({ project, journeyId, secret, ahora })`: reúne los tickets de la jornada en `planned` con la compuerta `plan` aprobada y sin aprobación vigente, emite un código por plan y uno de lote (que lista los códigos de plan), y devuelve el texto del mensaje; y `aprobarPorCodigo({ paths, code, secret, actor, quote, ahora })`, que verifica el código, comprueba que el hash del plan actual coincide con el firmado, consume el código y llama a `registrarAprobacionDePlan` con fuente `token` (el lote registra una por ticket y reporta cada resultado).
  3. En `packages/adapter/src/config.ts` y `packages/engine/src/plan-approval.ts` hacer que la fuente `token` solo la acepte `registrarAprobacionDePlan` cuando el proyecto la declara en `plan-approval-sources`, sin cambiar el valor por defecto.
  4. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `journey notify-plans` (emite y envía por `hermesSendChannel`, y si el envío falla lo dice sin invalidar los códigos) y `plan-approve --code --actor --quote`, con su ayuda y las banderas declaradas.
  5. Crear `tests/aprobacion-de-lote.test.ts` con: tres planes listos emiten tres códigos y uno de lote, el lote registra tres aprobaciones con fuente `token` y la frase de quien aprueba y deja los tickets elegibles, un plan editado después de emitir no se aprueba, un código no se usa dos veces ni vence fuera de plazo, un ticket de riesgo alto o `SECURITY` no recibe código, sin `token` en `plan-approval-sources` la aprobación se rechaza, y un token de compuerta no sirve como aprobación de plan; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; sin `token` en la configuración nadie lo usa y los códigos emitidos caducan; los claims nuevos son aditivos.

## Criterios de aceptación

- [x] Tres planes listos emiten un código por plan y uno de lote en un solo mensaje
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [x] Aprobar el lote registra una aprobación por ticket con fuente `token` y la frase de quien aprueba, y cada ticket queda elegible para ejecutar
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [x] Un plan editado después de emitir el código no se aprueba con él
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [x] Un código se usa una sola vez y un ticket de riesgo alto o de tipo `SECURITY` no recibe código
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->
- [x] Sin `token` en `plan-approval-sources` la aprobación por código se rechaza, y un token de compuerta no sirve como aprobación de plan
      <!-- test: npx vitest run tests/aprobacion-de-lote.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/approval.ts`: sujetos `plan-approval` y `plan-approval-lote` y la entrada `approval-batch` (un código de lote que reúne los códigos de cada plan), reconocida al leer el registro y excluida del cálculo de intentos de compuertas.
- `packages/engine/src/plan-approval-batch.ts` (nuevo): `emitirAprobacionesDeJornada` emite, con el mismo HMAC y techo de riesgo de siempre, un código por plan listo de la jornada —atado al hash de su plan— y uno de lote; no emite para riesgo alto, impactos de sincronización, migración o contenedores, ni para tickets `SECURITY`, ni para planes sin la compuerta aprobada, y dice por qué. `aprobarPorCodigo` verifica el código, comprueba que el plan no cambió, registra la aprobación por `registrarAprobacionDePlan` con fuente `token` y la frase de quien aprueba, y consume el código solo después de registrar; el lote aprueba cada plan por separado. La fuente `token` solo vale si el proyecto la declara en `plan-approval-sources` (se comprueba antes de consumir nada) y una sesión desatendida no puede aprobar.
- `packages/cli/src/commands.ts`, `main.ts` y `hermes.ts`: `journey notify-plans` (emite y envía; un envío fallido deja los códigos válidos y lo dice) y `plan-approve`; `gate-decide --code` rechaza un código de plan diciendo que use `plan-approve`.
- `tests/aprobacion-de-lote.test.ts` (nuevo, 12 pruebas).
- Ajuste frente al plan: no hizo falta tocar `packages/adapter/src/config.ts` —la lista de fuentes ya admite cualquier nombre válido y el valor por defecto sigue sin incluir `token`, que es justo lo que se quiere—.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin enviar mensajes reales:

1. `npx vitest run tests/aprobacion-de-lote.test.ts` — esperado: 12 pruebas pasan.
2. `npx vitest run` — esperado: 181 archivos pasan y 1 omitido; 2626 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. Manual (responsable, opcional): con `plan-approval-sources` que incluya `token` y `VALMEN_APPROVAL_SECRET` definido, `valmen journey notify-plans --project <id> --journey <JOR-…> --to telegram` y aprobar un plan con `valmen plan-approve --code <código> --actor <tú> --quote "<tus palabras>"`.

Resultado de la ejecución del agente (2026-10-06): 1–3 dieron lo esperado.

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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:50.746Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:36:30.541Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:36:53.155Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:23.808Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"si apruebo los planes\",\"planHash\":\"sha256:333a9d805e769e24dfa2074b691ad459559d510a801a8975c182328c15ee4cff\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:24.298Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:333a9d805e769e24dfa2074b691ad459559d510a801a8975c182328c15ee4cff."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:24.298Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:12:24.611Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:15:51.928Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
