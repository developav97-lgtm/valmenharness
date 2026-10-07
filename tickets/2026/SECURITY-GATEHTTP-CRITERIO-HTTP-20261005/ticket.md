---
schema_version: 2
id: SECURITY-GATEHTTP-CRITERIO-HTTP-20261005
title: Verificar criterios HTTP contra hosts permitidos con gramática cerrada
type: SECURITY
module: GATEHTTP
workflow_status: planned
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

# SECURITY-GATEHTTP-CRITERIO-HTTP-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-007: Un criterio PUEDE verificarse con una petición HTTP contra hosts permitidos
Depende de: CHORE-ENGINE-SALIDA-COMPUERTAS-CONTROL-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que un criterio de aceptación se pueda verificar con una petición HTTP contra un host permitido (R-QAAG-007): una anotación `<!-- http: MÉTODO ruta expect: aserciones -->`, un verificador que solo toma del ticket el método, la ruta y las expectativas —el host, la credencial y el ejecutor salen de la configuración del proyecto—, una gramática cerrada de aserciones y un resultado que guarda el status, la latencia y el hash del cuerpo sin cabeceras de autenticación ni cookies. Fuera de alcance: correr la compuerta `qa-agent` sobre un árbol limpio y cerrar tickets (tickets siguientes de S6); este ticket entrega el verificador y la lectura del criterio.
- Usuario o rol afectado: quien escribe criterios de backend y quiere verificarlos con una petición real, y el responsable que no puede aceptar que un ticket elija a qué servidor se le habla.
- Comportamiento actual: un criterio declara `test:` (un comando permitido) o `verify: manual`; no hay forma de verificar una respuesta HTTP, y `extractCriteriaSpecs` trata cualquier otra anotación como verificación manual.
- Comportamiento esperado: `extractCriteriaSpecs` reconoce `http:` y devuelve el criterio con su petición declarada; `verificarCriterioHttp` valida la petición contra la sección `qa-http` de `.valmen/config.yaml` (hosts, métodos, plazo y variable de entorno de la credencial), rechaza **sin hacer la petición** un host fuera de la lista, un esquema o host dentro de la ruta y un método no declarado, evalúa las aserciones de una gramática cerrada (`status=`, `json.<ruta>==`, `!=`, `.length==`, `.length>=`) y devuelve el status, la latencia, el hash del cuerpo y el resultado de cada aserción, sin guardar cabeceras ni cookies.

## Diagnóstico

- Archivos y flujo investigados: el lector de criterios es `extractCriteriaSpecs` en `packages/gate/src/dynamic.ts:114`, que reconoce `test:` y trata las demás anotaciones como `manual` (la interfaz `CriterionSpec` está en `packages/gate/src/dynamic.ts:65`); sus consumidores son `packages/gate/src/criteria.ts` (proposiciones por criterio) y `packages/engine/src/gate.ts` (compuerta `qa-mechanical`); los comandos de verificación los ejecuta `packages/gate-command/src/command.ts` con una lista permitida por proyecto; la configuración se lee por clave con validación en `packages/adapter/src/config.ts`; la revisión previa y la regla `tests-declared` del run autónomo cuentan un criterio como declarado si tiene comando o es manual (`packages/engine/src/autonomous-run.ts`).
- Causa raíz o hipótesis: la verificación mecánica se diseñó para comandos de consola; una petición HTTP es otra clase de verificación y su riesgo es distinto —el ticket escribe el criterio y podría apuntar la petición a donde quiera—, por lo que su seguridad no sale de confiar en el texto sino de **qué se toma del ticket**: solo método, ruta y expectativas. Comprobado: no hay referencia a `http:` ni a peticiones en `packages/gate*/src`. Un host o esquema dentro de la ruta es el vector obvio y se rechaza antes de abrir una conexión.
- Riesgos y compatibilidad: es un verificador que sale a la red desde la máquina del responsable, por eso exige tu aprobación del plan. Las peticiones no siguen redirecciones (una redirección a otro host sería la forma de saltarse la lista), el plazo es el de la configuración y la credencial viaja solo en memoria, leída de una variable de entorno cuyo **nombre** declara la configuración: nunca se escribe en el recibo ni en el registro. La anotación nueva es aditiva: los criterios con `test:` y `verify:` no cambian, y un proyecto sin la sección `qa-http` rechaza todo criterio `http:` con un mensaje que dice qué declarar. Consumidores comprobados con búsqueda: `CriterionSpec` lo usan `packages/gate/src/criteria.ts`, `packages/engine/src/gate.ts` y sus pruebas; el campo nuevo es opcional. La `qa-mechanical` sigue sin ejecutar peticiones: el verificador lo llamará la compuerta de QA por agente.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente
- Alcance: la anotación `http:`, la configuración `qa-http`, el verificador con su gramática cerrada y su resultado. Exclusiones: la compuerta `qa-agent`, el árbol limpio y el cierre de tickets.
- Pasos ordenados:
  1. En `packages/gate/src/dynamic.ts` hacer que `extractCriteriaSpecs` reconozca la anotación `http:` y agregue el campo opcional `http` (la petición declarada, sin interpretar) a `CriterionSpec`, de modo que un criterio `http:` cuente como declarado y no como manual; ajustar `packages/gate/src/criteria.ts` si lee el campo.
  2. En `packages/adapter/src/config.ts` agregar `readQaHttpConfig(config)` con la sección `qa-http` (`hosts` como URL base permitidas, `methods` con defecto `GET`, `timeout-seconds` con defecto 10 y `credential-env`, el nombre de la variable de entorno de la credencial); ausente devuelve `null`, y una forma inválida falla nombrando la clave.
  3. Crear `packages/gate-command/src/http-criterion.ts` con `parsearCriterioHttp(texto)` (método, ruta y aserciones; rechaza esquema o host dentro de la ruta, `//`, `@`, saltos de línea y rutas que no empiezan en `/`) y `verificarCriterioHttp({ criterio, config, entorno, fetch? })`: valida método y host contra la configuración antes de abrir una conexión, hace la petición sin seguir redirecciones y con el plazo configurado, evalúa la gramática cerrada de aserciones y devuelve status, latencia, hash sha256 del cuerpo y el resultado de cada aserción, sin cabeceras de autenticación ni cookies; exportarlo desde `packages/gate-command/src/index.ts`.
  4. Crear `tests/criterio-http.test.ts` con un servidor HTTP local: un criterio válido pasa y su resultado trae status, latencia y hash del cuerpo; un host distinto, un esquema o host dentro de la ruta y un método no declarado se rechazan sin que el servidor reciba ninguna petición; una redirección a otro host no se sigue; una aserción fuera de la gramática se rechaza; el resultado y el texto serializado no contienen la credencial ni cabeceras de autenticación; un proyecto sin `qa-http` rechaza el criterio diciendo qué declarar; y los criterios `test:` y `verify:` no cambian; correr esas pruebas, las de criterios, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la anotación es aditiva, la sección `qa-http` es opcional y ningún flujo existente llama al verificador.

## Criterios de aceptación

- [ ] Un criterio `http:` válido se verifica contra el host de la configuración y el resultado guarda status, latencia y hash del cuerpo
      <!-- test: npx vitest run tests/criterio-http.test.ts -->
- [ ] Un host fuera de la lista, un esquema o host dentro de la ruta y un método no declarado se rechazan sin hacer la petición
      <!-- test: npx vitest run tests/criterio-http.test.ts -->
- [ ] Una redirección a otro host no se sigue y una aserción fuera de la gramática cerrada se rechaza
      <!-- test: npx vitest run tests/criterio-http.test.ts -->
- [ ] El resultado no contiene cabeceras de autenticación, cookies ni la credencial
      <!-- test: npx vitest run tests/criterio-http.test.ts -->
- [ ] Un proyecto sin `qa-http` rechaza el criterio con el mensaje de qué declarar, y los criterios `test:` y `verify:` no cambian
      <!-- test: npx vitest run tests/criterio-http.test.ts tests/gate-plan-aviso.test.ts -->

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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:51.295Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:09:37.558Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:10:01.065Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
