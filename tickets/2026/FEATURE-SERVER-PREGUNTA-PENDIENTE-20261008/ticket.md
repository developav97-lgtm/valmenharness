---
schema_version: 2
id: FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008
title: Fila declara la pregunta pendiente sin copiar su texto, con test de lista blanca
type: FEATURE
module: SERVER
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008

## Solicitud original

Parte del sprint: El endpoint devuelve la sesión principal como fila propia y la pregunta pendiente de cada agente, sin copiar texto del transcript.
- R-DAT-002: Cada fila DEBE declarar su pregunta pendiente sin copiar su texto
- R-DAT-003: El endpoint NO DEBE copiar contenido del transcript
Depende de: FEATURE-SERVER-SESION-PRINCIPAL-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada fila DEBE declarar su pregunta pendiente sin copiar su texto El endpoint NO DEBE copiar contenido del transcript
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Referencias de diseño

Adjuntos de la feature (ningún requisito de este ticket cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el lector `packages/server/src/agentes.ts` y la respuesta de `GET /api/corrida/agentes` (`packages/server/src/server.ts:1021`). Cada fila —la sesión principal y cada subagente— agrega el campo `pregunta`: `{ desde: <ISO>, respondidaEn: null }` mientras hay un `AskUserQuestion` sin `tool_result`; `{ desde, respondidaEn: <ISO> }` durante los 60 s siguientes al resultado (reloj inyectado `ahora`); `null` en cualquier otro caso. Opción A de la spec (`.valmen/features/vista-agentes/spec/s1-datos-agentes`, R-DAT-002 y R-DAT-003): nunca se copia el texto de la pregunta ni de la respuesta. Fuera de alcance: la opción B (R-DAT-004, texto de la pregunta), que es de FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008, y el pintado en la vista (S2/S3).
- Usuario o rol afectado: el PO que mira la vista Agentes (hoy «Corrida») durante una corrida orquestada; necesita ver qué agente le está haciendo una pregunta y desde cuándo, sin que el servidor exponga contenido del transcript.
- Comportamiento actual: la fila no distingue una pregunta al PO de cualquier otra herramienta abierta. Un `AskUserQuestion` sin resultado solo se ve como `estado: "esperando"` (igual que un permiso de `Bash` pendiente) y como `ultimaHerramienta: "AskUserQuestion"`; cuando se responde, no queda rastro de cuándo.
- Comportamiento esperado: la fila lleva `pregunta` según los tres escenarios de R-DAT-002 (abierta → `esperando` con `desde` = hora del `tool_use`; respondida hace < 60 s → `respondidaEn` = hora del `tool_result` y estado `trabajando`; otra herramienta abierta → `pregunta: null` y `esperando`), y la respuesta serializada sigue sin contener texto de prompts, entradas ni resultados (R-DAT-003), comprobado con un test de lista blanca de claves.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el campo no existe porque el lector descarta la información que haría falta. `leerTranscript` guarda las herramientas abiertas solo como un `Set` de ids (`packages/server/src/agentes.ts:130`, alta en `:189`, baja en `:159`) y al final las reduce a un booleano `pendiente` (`:197`); el nombre y la hora quedan solo para la *última* herramienta (`:184-188`), así que se pierde qué herramienta abierta es un `AskUserQuestion`, cuándo se abrió y cuándo llegó su `tool_result` (la hora del evento `user` que lo trae se lee en `:142-146` pero no se asocia al id). La interfaz pública `AgenteDeCorrida` (`:51-67`) no tiene el campo, y las dos construcciones de fila —principal (`:348-364`) y subagentes (`:383-399`)— no lo emiten. `estadoDe` (`:321-331`) ya da `esperando` con una herramienta abierta y `trabajando` cuando se cierra con un evento reciente, de modo que los estados que pide la spec salen de la regla actual sin cambiarla.
- Forma real del dato, comprobada en transcripts locales de Claude Code (`~/.claude/projects/*/*.jsonl`, script de solo estructura, sin leer contenido): `AskUserQuestion` llega como bloque `{type:"tool_use", id, name:"AskUserQuestion", input}` en un evento `assistant` con `timestamp`, y su respuesta como bloque `{type:"tool_result", tool_use_id, content}` en un evento `user` con `timestamp`; a veces con `is_error: true` (pregunta rechazada o cancelada). El texto vive en `input` y en `content`, que el lector nunca debe copiar.
- Hipótesis pendientes: (1) en la muestra local solo aparecieron `AskUserQuestion` en sesiones principales, ninguno en `subagents/agent-*.jsonl`; es probable que un subagente no tenga esa herramienta, pero la regla se aplica igual a ambas filas porque la spec dice «cada fila» y el costo es el mismo. (2) Un `tool_result` con `is_error: true` se tomará como respondida (la pregunta dejó de estar pendiente); se confirma en el plan. (3) Con dos `AskUserQuestion` abiertos a la vez manda el más reciente; con una abierta y otra respondida, manda la abierta. (4) La ventana de 60 s reutiliza `ESPERA_MAXIMA_MS` (`:44`) o una constante propia; se decide en el plan.
- Consumidores afectados: `packages/server/src/server.ts:1035` (pasa la lista tal cual, sin cambios); `packages/server/web/index.html:6282` (vista Corrida: ignora campos que no conoce, sin cambios); `tests/actividad-agentes.test.ts:278` (SP-C8) y `:384` (C14) fijan la lista exacta de claves de la fila y deben incluir `pregunta`, que es justamente el test de lista blanca que pide el título; `tests/vista-corrida.test.ts` y `tests/api-rutas.test.ts` usan fixtures propios y no dependen de la forma exacta. Los tickets siguientes de la feature (FEATURE-WEB-VISTA-LIENZO y los mundos de S3) consumirán `pregunta`; FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008 la ampliará con `texto`/`respuesta`. `packages/server/dist/` y `packages/cli/dist/` son salidas de build, no se editan.
- Archivos y flujo investigados: `GET /api/corrida/agentes` (`packages/server/src/server.ts:1016-1043`) → `leerAgentesDeCorrida` (`packages/server/src/agentes.ts:334`) → `sesionOrquestadora` (`:238`) → `leerConCache` (`:201`, caché por `mtime:size`, independiente del reloj) → `leerTranscript` (`:117`) → `estadoDe` (`:321`) → fila. Como la caché no depende de `ahora`, la lectura debe guardar horas absolutas (`desde`, `respondidaEn` en ms) y la ventana de 60 s se aplica al armar la fila, no al leer, para no servir un estado viejo desde la caché. Spec y diseño: `.valmen/features/vista-agentes/spec/s1-datos-agentes`, `.valmen/features/vista-agentes/design.md` §5 («la pregunta pendiente se decide en el servidor»). Memoria: `valmen memory search` sin antecedentes del lector ni de `AskUserQuestion`.
- Riesgos y compatibilidad: el riesgo central es filtrar contenido: el lector debe tomar de `AskUserQuestion` solo el `id`, el `name` y el `timestamp` del evento, nunca `input` ni `content`; lo cubre el test con el texto centinela `SECRETO` metido en la entrada y en el resultado de la pregunta, más la lista exacta de claves (incluidas las de `pregunta`: `desde`, `respondidaEn`). Compatibilidad: el campo es aditivo; la vista actual lo ignora; el endpoint, su ruta y su parámetro `sesion` no cambian. La caché queda correcta porque la ventana se calcula con `ahora` fuera de ella. Ningún cambio al registro: todo es lectura.
- Impactos de sync, migración, Docker o despliegue: ninguno (lectura de transcripts locales y un campo aditivo en una respuesta JSON del servidor local; sin datos sincronizados, sin migraciones, sin contenedores).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: campo aditivo `pregunta` en cada fila de `GET /api/corrida/agentes`, calculado en `packages/server/src/agentes.ts`, y sus pruebas en `tests/actividad-agentes.test.ts`. Opción A: solo id, nombre y hora del evento; nunca `input` ni `content`.
- Exclusiones: la opción B (`pregunta.texto`/`pregunta.respuesta`, R-DAT-004) es de FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008; la vista (`packages/server/web/index.html`) no cambia; `packages/server/src/server.ts` no cambia; `dist/` no se edita a mano.
- Decisiones del plan sobre las hipótesis del diagnóstico: (1) la regla se aplica a la fila principal y a las de subagentes; (2) un `tool_result` con `is_error: true` cuenta como respondida; (3) si hay varias `AskUserQuestion`, manda la abierta más reciente; si no hay abierta, la última respondida; (4) constante propia `VENTANA_RESPUESTA_MS = 60_000`, separada de `ESPERA_MAXIMA_MS`, para que cambiar una no mueva la otra.
- Pasos ordenados:
  1. `packages/server/src/agentes.ts`, interfaz `Lectura`: agregar `preguntaDesde: number | null` y `preguntaRespondidaEn: number | null` (horas absolutas en ms, independientes del reloj, para que la caché `leerConCache` siga siendo válida). (C1, C3, C9)
  2. `packages/server/src/agentes.ts`, `leerTranscript`: llevar un `Map<id, desde>` solo de los `tool_use` con `name === "AskUserQuestion"` (se toma `id` y la marca del evento; nunca `input`). En el bloque `tool_result` (`:158`), si el `tool_use_id` está en ese mapa, registrar `respondidaEn` con la marca del evento `user`, sin mirar `content` ni `is_error`. Al final, fijar `preguntaDesde`/`preguntaRespondidaEn` con la regla de la decisión (3). (C1, C3, C6, C9)
  3. `packages/server/src/agentes.ts`: exportar `VENTANA_RESPUESTA_MS`, el tipo `PreguntaPendiente { desde: string; respondidaEn: string | null }` y agregar `readonly pregunta: PreguntaPendiente | null` a `AgenteDeCorrida`; nueva función pura `preguntaDe(lectura, ahora)` que devuelve abierta, respondida dentro de la ventana, o `null` si pasó la ventana o no hay pregunta. (C1, C3, C5, C6, C12)
  4. `packages/server/src/agentes.ts`, `leerAgentesDeCorrida`: emitir `pregunta: preguntaDe(lectura, ahora)` en la fila principal (`:348`) y en las de subagentes (`:383`). `estadoDe` no cambia: ya da `esperando` con herramienta abierta y `trabajando` tras el resultado con evento reciente. (C2, C4, C7, C8)
  5. `tests/actividad-agentes.test.ts`: nuevo `describe("pregunta pendiente")` con pruebas `PP-C1`…`PP-C12`, reusando `linea()`/`sesion()` con reloj inyectado; el texto centinela `SECRETO` va en el `input` y en el `content` de la `AskUserQuestion`. Actualizar las listas exactas de claves de SP-C8 (`:278`) y C14 (`:384`) para incluir `pregunta`. (C1–C12)
  6. Comprobar: `npx vitest run tests/actividad-agentes.test.ts tests/vista-corrida.test.ts tests/api-rutas.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C13, C14)
- Impactos declarados: ninguno; sin sincronización, sin migración, sin contenedores. Campo aditivo en una respuesta JSON del servidor local; la vista actual ignora campos que no conoce.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); al ser un campo aditivo sin datos persistidos, quitarlo deja el endpoint como estaba y ningún consumidor actual lo lee.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-DAT-002): con una `AskUserQuestion` sin resultado, la fila lleva `pregunta.desde` igual a la hora ISO del `tool_use` y `pregunta.respondidaEn` en `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C1 -->
- [x] C2 (R-DAT-002): con una `AskUserQuestion` sin resultado, el estado de la fila es `esperando`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C2 -->
- [x] C3 (R-DAT-002): con el resultado de la pregunta hace 20 s según el reloj inyectado, `pregunta.respondidaEn` es la hora ISO del `tool_result`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C3 -->
- [x] C4 (R-DAT-002): con el resultado de la pregunta hace 20 s, el estado de la fila es `trabajando`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C4 -->
- [x] C5 (R-DAT-002): con el resultado de la pregunta hace más de 60 s, `pregunta` es `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C5 -->
- [x] C6 (R-DAT-002): con un `Bash` abierto sin resultado y ninguna pregunta, `pregunta` es `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C6 -->
- [x] C7 (R-DAT-002): con un `Bash` abierto sin resultado, el estado de la fila sigue siendo `esperando`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C7 -->
- [x] C8 (R-DAT-002): la fila de la sesión principal declara su `AskUserQuestion` abierta con `pregunta.desde`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C8 -->
- [x] C9 (R-DAT-002): un `tool_result` con `is_error: true` cuenta como respondida y llena `pregunta.respondidaEn`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C9 -->
- [x] C10 (R-DAT-003): la respuesta del endpoint no contiene el texto centinela puesto en la entrada de la `AskUserQuestion`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C10 -->
- [x] C11 (R-DAT-003): la respuesta del endpoint no contiene el texto centinela puesto en el resultado de la `AskUserQuestion`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C11 -->
- [x] C12 (R-DAT-003): las claves de `pregunta` son exactamente `desde` y `respondidaEn`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C12 -->
- [x] C13 (R-DAT-003): las claves de cada fila son exactamente la lista blanca anterior más `pregunta`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C14: el monorepo compila sin errores de tipos
      <!-- test: npx tsc --noEmit -p tsconfig.json -->

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
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: sesión de implementación claude-sonnet-5-5 (subagente), sin números expuestos",
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
    "date": "2026-10-08",
    "at": "2026-10-08T23:30:58.614Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T00:06:56.169Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T00:10:37.026Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261009-FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008-analysis-1, canal cli, decidida 2026-10-09T00:10:37.022Z): PO: \"Recomiendo A en ambos, aprueba los análisis\""
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T00:11:29.489Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:42.606Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A en ambos, aprueba los planes\",\"planHash\":\"sha256:385d14f35924a93e3f91164f8417028464bfaf7f89af72b656d5e29b8652bb7f\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:47.159Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:385d14f35924a93e3f91164f8417028464bfaf7f89af72b656d5e29b8652bb7f."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T00:13:47.159Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T00:14:01.297Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T00:15:00.324Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T00:15:44.028Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
