---
schema_version: 2
id: FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007
title: Mostrar el modelo efectivo, su origen y el realmente usado por fase
type: FEATURE
module: MC
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

# FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007

## Solicitud original

Parte del sprint: La persona elige perfiles y ve qué modelo corre cada fase, en Mission Control, el CLI y Hermes.
- R-PERF-005: El modelo efectivo de cada fase DEBE ser visible con su origen
- R-PERF-006: El modelo realmente usado DEBE quedar registrado por fase
Depende de: FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007, FEATURE-MC-PERFILES-MODELOS-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El modelo efectivo de cada fase DEBE ser visible con su origen El modelo realmente usado DEBE quedar registrado por fase
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-005: lo cubre FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007 (Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen)
- R-PERF-005: lo cubre FEATURE-CLI-PERFILES-MODELOS-20261007 (Listar, mostrar y elegir perfiles por CLI y desde Hermes)
- R-PERF-006: lo cubre FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007 (Registrar el modelo realmente usado por fase, compararlo con el declarado y decir «sin reportar» el costo ausente)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la vista Modelos de Mission Control (`packages/server/web/index.html`) gana una sección «Modelo por fase» que muestra, para cada fase del agente (analysis, plan, implementation, verification) y por ejecutor (claude, codex, opencode, hermes), el modelo efectivo con su proveedor, esfuerzo y origen, y al lado el último modelo realmente usado que registró `fases.jsonl`, si coincide con el declarado y el costo reportado o «sin reportar». Lo sirve una ruta de solo lectura nueva del servidor. Fuera de alcance: elegir perfiles (ya existe), la resolución del perfil (FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007, cerrado), el CLI y Hermes (FEATURE-CLI-PERFILES-MODELOS-20261007) y el registro del modelo usado (FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007).
- Usuario o rol afectado: el PO que en Mission Control elige perfiles y quiere ver qué modelo corre cada fase y cuál corrió de verdad.
- Comportamiento actual: la vista Modelos muestra «Perfiles» y «Modelo por rol» desde `GET /api/routing`, resuelto sin ejecutor; la columna Origen no traduce el origen `perfil` ni dice qué perfil ni con qué alcance; no hay ninguna vista del modelo usado por fase: `fases.jsonl` solo lo leen el CLI y el parte de Hermes.
- Comportamiento esperado: la pantalla dice, por fase y por ejecutor elegido, el modelo efectivo y de dónde sale (perfil `<id>` del proyecto o del ejecutor, definido en el proyecto, preset o sistema), y el último modelo usado registrado con su coincidencia y su costo, diciendo «sin reportar» cuando el cliente no lo reportó y «sin registros» cuando la fase no corrió.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la resolución por fase con origen ya existe en el adaptador —`fasesDeSesion` en `packages/adapter/src/routing.ts:1226` devuelve por fase `provider`, `model`, `effort` y `origen.source`/`origen.perfil` (`FaseDeSesion`, `packages/adapter/src/routing.ts:1173`)— y el registro del modelo usado ya existe en el motor —`RegistroDeFase` con `modeloUsado`, `coincide` y `costeUsd` en `packages/engine/src/journey-phases.ts:30` y su lector `leerFases` en `packages/engine/src/journey-phases.ts:85`—, pero ninguna ruta del servidor los expone: `packages/server/src/server.ts` no importa `fasesDeSesion` ni `leerFases`, y la vista Modelos (`packages/server/web/index.html:6942`) solo pide `GET /api/routing` (`packages/server/src/server.ts:1504`), que resuelve los roles sin ejecutor, y `GET /api/perfiles` (`packages/server/src/server.ts:1580`). Además el mapa `ORIGEN` de la tabla «Modelo por rol» (`packages/server/web/index.html:7103`) no tiene la clave `perfil` del tipo `RouteSource` (`packages/adapter/src/routing.ts:819`), así que un rol que sale del perfil muestra la palabra cruda y sin el id del perfil.
- Hipótesis pendientes: ninguna de comportamiento. La forma de mostrar varias corridas de la misma fase se resuelve tomando el último registro por fase y ejecutor (el más reciente por `registradoEn`), sin agregar historial; es una decisión de presentación anotada para el PO.
- Consumidores afectados: la vista Modelos de `packages/server/web/index.html` (sección nueva y mapa `ORIGEN`); la prueba de contrato de rutas `tests/api-rutas.test.ts` (ruta nueva declarada); `tests/perfiles-pantalla.test.ts`, que simula las respuestas de la vista Modelos y debe responder la ruta nueva; `tests/routing.test.ts` (bloque «la API de routing»). No cambian: `renderFases` de `packages/engine/src/resume.ts:135` y el parte de Hermes (`packages/cli/src/hermes.ts:1362`), que siguen leyendo lo mismo; la vista Corrida (`packages/server/web/index.html:5945`), que muestra el modelo de los agentes vivos desde `/api/corrida/agentes` y no se toca.
- Archivos y flujo investigados: `packages/adapter/src/routing.ts` (`RouteSource`, `EJECUTORES_CON_PERFIL`, `ClienteDeSesion`, `fasesDeSesion`, `mismoModelo`), `packages/engine/src/journey-phases.ts` (`registrarFase`, `leerFases`, `fasesPath` → `.valmen/journeys/fases.jsonl`), `packages/engine/src/resume.ts` (`renderFases`), `packages/server/src/server.ts` (`/api/routing`, `/api/perfiles`, `/api/ticket/fases`), `packages/server/web/index.html` (`vistaModelos`, `seccionPerfiles`, vista Corrida), `tests/api-rutas.test.ts`, `tests/perfiles-pantalla.test.ts`, `tests/routing.test.ts`. Flujo: perfil elegido (`.valmen/profiles.yaml`) → `rutasDelProyecto(root, {ejecutor})` → `fasesDeSesion` → (nuevo) ruta del servidor → sección de la vista; y `registrarFase` → `fases.jsonl` → `leerFases` → (nuevo) misma ruta → columna «usado».
- Riesgos y compatibilidad: solo lectura, sin escritura de registro ni de configuración. Un `profiles.yaml` ilegible no debe dar 500: `fasesDeSesion` ya devuelve el error como `aviso`, y la pantalla lo muestra. Un `fases.jsonl` ausente o con renglones viejos se lee como «sin registros» o «sin reportar» (`leerFases` ya normaliza a `null`). El costo es el reportado por el cliente (equivalente de suscripción, no factura) y se rotula así. Colores: la sección usa las variables del tema, sin colores escritos a mano, para no romper el modo oscuro.
- Impactos de sync, migración, Docker o despliegue: ninguno; es una pantalla local de Mission Control y una ruta de solo lectura, sin datos sincronizados, migraciones ni contenedores.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: una ruta de solo lectura `GET /api/modelos/fases` en el servidor y una sección «Modelo por fase» en la vista Modelos, más la traducción del origen `perfil` en la tabla «Modelo por rol». Exclusiones: no se cambia cómo se resuelve el perfil ni cómo se registra el modelo usado, ni el CLI, Hermes o la vista Corrida.
- Pasos ordenados:
  1. Dependencias: confirmar con `grep -n "export function fasesDeSesion" packages/adapter/src/routing.ts` y `grep -n "export function leerFases" packages/engine/src/journey-phases.ts` que la resolución por fase y el registro del modelo usado están en la rama; si falta alguno, detenerse (C1, C6).
  2. En `packages/server/src/server.ts`, junto a `GET /api/perfiles`, agregar `GET /api/modelos/fases?ejecutor=`: valida `ejecutor` contra `EJECUTORES_CON_PERFIL` (400 si no está), llama a `fasesDeSesion(context.root, { cliente })` y por cada fase devuelve `fase`, `rol`, `provider`, `model`, `effort`, `origen` y `usado`, que es el registro de `leerFases(context.root)` de esa fase —y de ese ejecutor si se pidió— con el `registradoEn` mayor, reducido a `modeloUsado`, `modelo`, `coincide`, `costeUsd`, `ticketId` y `registradoEn`, o `null`. La respuesta lleva también `ejecutor`, `ejecutores` y `aviso`; si `fasesDeSesion` devuelve aviso sin fases, se responde 200 con ese aviso. Importa `fasesDeSesion` y `EJECUTORES_CON_PERFIL` de `@valmen/adapter` y `leerFases` de `@valmen/engine` (C1, C2, C3, C4, C5, C6, C7, C8).
  3. En `tests/api-rutas.test.ts`, sumar `"GET /api/modelos/fases"` a `RUTAS` (C9).
  4. En `tests/routing.test.ts`, en el bloque «la API de routing», agregar casos con `handleApi` sobre una raíz temporal: perfil del proyecto y perfil por ejecutor escritos en `.valmen/profiles.yaml`, un `fases.jsonl` con dos registros de la misma fase y distinto `registradoEn` y ejecutor, uno con `modeloUsado` nulo y otro con `coincide: false`, un ejecutor desconocido y un `profiles.yaml` ilegible (C1, C2, C3, C4, C5, C6, C7, C8).
  5. En `packages/server/web/index.html`, dentro de `vistaModelos`, después de `seccionPerfiles`, agregar `seccionModeloPorFase(cont)`: un selector de ejecutor (opción «sin ejecutor» más `ejecutores`), y una tabla con columnas Fase, Efectivo, Origen y Usado; el origen se traduce con un mapa que incluye `perfil` («perfil <id> (proyecto|ejecutor)»); la celda Usado pinta modelo y ticket, «sin reportar» para `modeloUsado` o `costeUsd` nulos, el costo rotulado «reportado por el cliente», una marca de discrepancia con clase `discrepancia` si `coincide` es `false`, y «sin registros» si `usado` es `null`; el `aviso` se pinta como texto. Todo texto del servidor entra por `el(tag, texto)`. Cambiar el selector vuelve a pedir la ruta con `?ejecutor=` (C10, C11, C12, C13, C14, C15, C16, C17, C18).
  6. En el mismo archivo, sumar la clave `perfil` al mapa `ORIGEN` de la tabla «Modelo por rol» (`const ORIGEN = {`), con el id del perfil si `rol.perfil` viene (C19).
  7. Estilos en `packages/server/web/index.html`, junto a «Modelos: routing por rol»: la tabla nueva reutiliza la clase `roles`; la clase `discrepancia` usa solo variables del tema; bajo `@media (max-width: 640px)` las filas se apilan como en `.corrida-agente` (C22, C23, C24, C25, C26, C27, C28).
  8. En `tests/perfiles-pantalla.test.ts`, que ya simula la vista Modelos con `ejecutarInterfaz`, responder `/api/modelos/fases` en el simulador y agregar casos: fila por fase, origen de perfil por ejecutor, usado con ticket, «sin reportar» de modelo y de costo, discrepancia, «sin registros», cambio de ejecutor con la llamada registrada, aviso, y la traducción de `perfil` en «Modelo por rol» (C10, C11, C12, C13, C14, C15, C16, C17, C18, C19, C20).
  9. Correr desde la raíz del worktree: `npx vitest run tests/routing.test.ts tests/perfiles-pantalla.test.ts tests/api-rutas.test.ts tests/interfaz-ejecutable.test.ts` y `npx tsc --noEmit -p tsconfig.json`; luego la herramienta `revisar_presentacion` sobre el cambio y `valmen secrets` (C9, C20, C21, C22).
  10. Verificación en el navegador, validación manual con `valmen serve` sobre este repositorio (que ya tiene `.valmen/journeys/fases.jsonl` con registros reales): (a) abrir `#/modelos` en tema claro y comprobar que «Modelo por fase» muestra las cuatro fases con efectivo, origen y usado, con texto legible y la fila con discrepancia distinguible; (b) elegir `claude` en el selector y comprobar que el origen y el usado cambian al del ejecutor; (c) repetir (a) en tema oscuro y comprobar el contraste del texto y que la fila con discrepancia se distingue; (d) emular 375 px de ancho y comprobar que no hay desplazamiento horizontal de la página y que cada fase se lee completa, apilada (C23, C24, C25, C26, C27, C28).
  11. Entrega: contrato de pruebas en `## Pruebas` con los comandos del paso 9 (directorio: raíz del repositorio; resultado esperado: todo en verde), los pasos manuales del paso 10 con su resultado esperado y los requisitos de ambiente (Node 24, navegador moderno, sin red); registrar el consumo de IA, marcar con `- [x]` los criterios verificados y pasar a `awaiting_user_tests`; commit solo en la rama del worktree tras la confirmación, sin push ni merge.
- Impactos declarados: sincronización: ninguno, no hay datos sincronizados ni clientes sin actualizar; migración: ninguna, no hay orden de aplicación ni reversión de datos; contenedores: ninguno, no hay imagen ni publicación. La ruta y la vista solo leen `profiles.yaml`, el routing y `fases.jsonl`.
- Riesgos y decisiones para el PO: (1) se muestra solo el último registro por fase, no un historial; (2) sin ejecutor elegido, el efectivo es el del perfil del proyecto y el usado es el último de cualquier ejecutor; (3) el costo es el reportado por el cliente, equivalente de suscripción y no factura.
- Rollback (obligatorio): revertir el commit del ticket; `server.ts` pierde la ruta, `index.html` vuelve a la vista Modelos anterior y las pruebas vuelven a su versión previa. No hay datos que deshacer: la ruta no escribe nada.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: R-PERF-005: `GET /api/modelos/fases` responde una entrada por cada una de las cuatro fases del agente con proveedor, modelo y esfuerzo efectivos.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C2: R-PERF-005: cada fase de la respuesta trae su origen (`proyecto`, `perfil`, `preset`, `sistema` o `sin-asignar`).
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C3: R-PERF-005: con `?ejecutor=<id>` y un perfil elegido para ese ejecutor, el origen de la fase nombra ese perfil con alcance `ejecutor`.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C4: Un `ejecutor` que no está en `EJECUTORES_CON_PERFIL` responde 400 con el mensaje de los ejecutores vigentes.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C5: Un `profiles.yaml` ilegible responde 200 con el error como `aviso` y sin fases, no un 500.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C6: R-PERF-006: cada fase trae en `usado` el registro más reciente de `fases.jsonl` de esa fase, con `modeloUsado`, `coincide`, `costeUsd`, `ticketId` y `registradoEn`.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C7: R-PERF-006: con `ejecutor`, `usado` solo considera los registros de ese ejecutor.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C8: R-PERF-006: una fase sin registros responde `usado: null`.
      <!-- test: npx vitest run tests/routing.test.ts -->
- [x] C9: La ruta `GET /api/modelos/fases` está declarada en la lista de rutas del contrato.
      <!-- test: npx vitest run tests/api-rutas.test.ts -->
- [x] C10: R-PERF-005: la vista Modelos pinta la sección «Modelo por fase» con una fila por fase.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C11: R-PERF-005: la fila muestra el modelo efectivo con su origen legible, incluido «perfil <id> (ejecutor)» o «perfil <id> (proyecto)».
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C12: R-PERF-006: la fila muestra el último modelo usado con el ticket donde corrió.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C13: R-PERF-006: un `modeloUsado` nulo se muestra como «sin reportar».
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C14: R-PERF-006: un `costeUsd` nulo se muestra como «sin reportar» y uno numérico se rotula como reportado por el cliente.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C15: R-PERF-006: una fila con `coincide: false` se marca como discrepancia entre declarado y usado.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C16: Una fase con `usado: null` muestra «sin registros».
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C17: Cambiar el ejecutor en el selector de la sección vuelve a pedir `/api/modelos/fases` con ese `ejecutor`.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C18: Un `aviso` de la respuesta se pinta en la sección como texto.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C19: La columna Origen de «Modelo por rol» traduce el origen `perfil` a un texto legible en vez de la palabra cruda.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C20: Las pruebas existentes de la sección Perfiles siguen en verde.
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -->
- [x] C21: El tipado del proyecto compila sin errores.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C22: Los estilos nuevos no usan colores escritos a mano (`revisar_presentacion` sin hallazgos nuevos).
      <!-- verify: manual -->
- [x] C23: En tema claro el texto de la sección «Modelo por fase» se lee con contraste suficiente.
      <!-- verify: manual -->
- [x] C24: En tema claro una fila con discrepancia se distingue de una fila sin discrepancia.
      <!-- verify: manual -->
- [x] C25: En tema oscuro el texto de la sección «Modelo por fase» se lee con contraste suficiente.
      <!-- verify: manual -->
- [x] C26: En tema oscuro una fila con discrepancia se distingue de una fila sin discrepancia.
      <!-- verify: manual -->
- [x] C27: Con 375 px de ancho la sección no provoca desplazamiento horizontal de la página.
      <!-- verify: manual -->
- [x] C28: Con 375 px de ancho cada fase se lee completa, apilada.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/src/server.ts`: ruta de solo lectura `GET /api/modelos/fases?ejecutor=` (fasesDeSesion + último registro de `leerFases` por fase y ejecutor; 400 para ejecutor desconocido; aviso 200 si `profiles.yaml` es ilegible).
- `packages/server/web/index.html`: sección «Modelo por fase» (`seccionModeloPorFase`) en la vista Modelos con selector de ejecutor, origen legible, usado con ticket, «sin reportar», costo rotulado «reportado por el cliente», marca de discrepancia y «sin registros»; clave `perfil` en el mapa `ORIGEN` de «Modelo por rol»; estilos solo con variables del tema y apilado bajo 640 px.
- Pruebas: `tests/routing.test.ts` (bloque «la API de modelos por fase»), `tests/perfiles-pantalla.test.ts` (bloque «la sección Modelo por fase»), `tests/api-rutas.test.ts` (ruta declarada).

## Pruebas

Directorio: raíz del repositorio. Ambiente: Node 24, navegador moderno, sin red.

1. `npx vitest run tests/routing.test.ts tests/perfiles-pantalla.test.ts tests/api-rutas.test.ts tests/interfaz-ejecutable.test.ts` — esperado: todo en verde (corrido: 4 archivos, 138 pruebas, verde; `interfaz-ejecutable` exige `npm run build` antes).
2. `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores (corrido: limpio).
3. Manual: `npm run build && node packages/cli/dist/main.js serve --port <libre>` y abrir `#/modelos`: (a) en claro, «Modelo por fase» muestra las cuatro fases con efectivo, origen y usado; (b) elegir `claude` en «Ejecutor» cambia origen y usado; (c) en oscuro, texto legible y la fila con discrepancia se distingue; (d) a 375 px cada fase se apila completa y la sección no desborda.
   Verificado por el agente en el navegador (claro, oscuro, 375 px) con un registro de ejemplo temporal con discrepancia en `fases.jsonl` (ya revertido). Nota: a 375 px la página completa ya desbordaba antes de este cambio por la barra lateral fija (232 px) y la sección Perfiles; la sección nueva no desborda.
4. `revisar_presentacion` revisó 0 archivos desde el checkout principal; se comprobó a mano que las líneas añadidas a `index.html` no traen colores escritos a mano. `valmen secrets`: sin hallazgos.

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
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-subagente-implementacion-sonnet",
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
    "at": "2026-10-07T18:03:48.666Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:42:24.354Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:43:46.615Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:47:26.459Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de MC-VISTA-MODELOS-EFECTIVOS: último registro por fase, sin historial; costo rotulado como reportado por el cliente)\",\"planHash\":\"sha256:2272731655bff356baee894c94c3a747d3879b798cb0f211e8111ca0ba610730\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:47:26.741Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:2272731655bff356baee894c94c3a747d3879b798cb0f211e8111ca0ba610730."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:47:26.741Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:49:48.758Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:58:15.655Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:58:15.966Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
