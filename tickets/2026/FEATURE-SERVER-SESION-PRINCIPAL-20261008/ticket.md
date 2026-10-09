---
schema_version: 2
id: FEATURE-SERVER-SESION-PRINCIPAL-20261008
title: Lector emite la sesión principal como fila propia
type: FEATURE
module: SERVER
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-SERVER-SESION-PRINCIPAL-20261008

## Solicitud original

Parte del sprint: El endpoint devuelve la sesión principal como fila propia y la pregunta pendiente de cada agente, sin copiar texto del transcript.
- R-DAT-001: El endpoint DEBE devolver la sesión principal como una fila propia
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El endpoint DEBE devolver la sesión principal como una fila propia
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

- Alcance: el lector `packages/server/src/agentes.ts` y la respuesta de `GET /api/corrida/agentes` agregan, como **primera fila**, la sesión orquestadora que el lector ya localiza, con `principal: true`, `ticket: null`, su estado (`trabajando`, `esperando`, `termino`), su última herramienta y la hora. Las filas de subagentes llevan `principal: false`. Fuera de alcance: la pregunta pendiente (R-DAT-002/003, ticket FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008), el texto de pregunta y respuesta (R-DAT-004) y el dibujo de la escena (S2/S3).
- Usuario o rol afectado: el PO que mira la vista Corrida (futura vista Agentes) durante una corrida orquestada; hoy no ve qué hace la sesión que él mismo abrió.
- Comportamiento actual: el endpoint devuelve solo una fila por `subagents/agent-*.jsonl`; la sesión orquestadora se usa para encontrar esos archivos y no se emite. Sin subagentes, la lista es vacía.
- Comportamiento esperado: con una sesión orquestadora que tiene subagentes dentro de la ventana de 24 h, la primera fila es la sesión principal (`principal: true`, `ticket: null`, estado, `ultimaHerramienta` y `ultimaHerramientaEn`) y le siguen los subagentes con `principal: false`. Sin carpeta `subagents/`, la respuesta sigue siendo la lista vacía (escenario «Sesión orquestadora sin subagentes todavía» de `.valmen/features/vista-agentes/spec/s1-datos-agentes`).

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto sino una omisión de diseño. `sesionOrquestadora` (`packages/server/src/agentes.ts:232-269`) devuelve la ruta del `.jsonl` de la sesión principal y `leerAgentesDeCorrida` (`packages/server/src/agentes.ts:315-369`) solo la usa para iterar `archivosDeSubagentes(ruta)` (`packages/server/src/agentes.ts:327`, definido en `packages/server/src/claude.ts:498-510`); el transcript principal nunca pasa por `leerConCache`/`leerTranscript` (`packages/server/src/agentes.ts:111-219`). La interfaz `AgenteDeCorrida` (`packages/server/src/agentes.ts:47-61`) no tiene el campo `principal`. Comprobado en una sesión real del proyecto (`~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/<sesión>.jsonl`, 0,5 MB): el transcript principal tiene el mismo formato de eventos (`type`, `timestamp`, `message.content[].tool_use` con `name`, `cwd`, `gitBranch`) que el de un subagente, así que `leerTranscript` lo puede leer sin cambios.
- Hipótesis pendientes:
  - H1: la herramienta `Agent` lanzada en primer plano (`run_in_background: false`) queda sin `tool_result` hasta que el subagente termina; con la regla actual (`packages/server/src/agentes.ts:331-339`, `pendiente` ⇒ `esperando`) la principal aparecería `esperando` mientras espera a sus subagentes. La spec acepta los tres estados sin distinguir este caso; se comprueba con un transcript de prueba y, si el PO quiere otro estado, va a un punto aparte.
  - H2: `ticket` del transcript principal se forzará a `null` aunque el primer mensaje nombre un ticket (la spec lo exige); `ticketEstado`, `faseConfirmada` y `faseInferida` quedan `null` para la principal, salvo que el plan decida conservar `faseInferida`.
  - H3: el identificador `agente` de la fila principal: se propone el id de sesión (`basename(ruta, ".jsonl")`), que no choca con los `a<hex>` de los subagentes; se confirma en el plan.
- Consumidores afectados:
  - `packages/server/src/server.ts:1016-1034` (endpoint): solo serializa lo que devuelve el lector; no cambia.
  - `packages/server/web/index.html:6097-6099` (`agentesVivos`), `:6151-6177` (`kpisDeCorrida`), `:6137-6142` (`idsDeLaCorrida`), `:6229-6262` (`tablaDeAgentes`) y `:6318` (cuenta «N de M agentes»): la fila principal contaría como agente vivo, inflaría `trabajando`/`esperan al PO` en uno y aparecería en la tabla con su id de sesión. El cliente debe filtrar `principal === true` o el plan lo incluye en este ticket; la vista nueva la consume FEATURE-WEB-MOTOR-ESCENA-20261008 y FEATURE-WEB-VISTA-LIENZO-20261008.
  - Pruebas: `tests/actividad-agentes.test.ts:116-120` (C1 espera exactamente `["a0","a1","a2"]`), `:122-125`, `:265-291` y `tests/vista-corrida.test.ts:109`, `:233`, `:301` (fixtures del cliente). Las que comparan la lista completa cambian.
- Archivos y flujo investigados: `GET /api/corrida/agentes` (`packages/server/src/server.ts:1021`) → `leerAgentesDeCorrida` (`packages/server/src/agentes.ts:315`) → `sesionOrquestadora` (`:232`) → `archivosDeSubagentes` (`packages/server/src/claude.ts:498`) → por archivo `leerConCache` (`packages/server/src/agentes.ts:195`) → `leerTranscript` (`:111`) → estado (`:331-339`) → fila. Fixture de pruebas: `escribirSesionDeClaude` (`tests/helpers/claude.ts:177`), que ya escribe líneas del transcript principal. `buscar_memoria` sin antecedentes para este módulo.
- Riesgos y compatibilidad:
  - Rendimiento: el transcript principal crece a varios MB y se modifica en cada turno; `leerConCache` (`packages/server/src/agentes.ts:195-219`) lo releerá entero cada vez que cambie su `mtime`, con el refresco de 5 s del cliente (`packages/server/web/index.html:6404-6417`). Aceptable para una vista local; se mide en la prueba manual.
  - Lista blanca: la fila principal usa los mismos campos que hoy; no se agrega texto del transcript (R-DAT-003 sigue vigente). `descripcion` de la principal queda `null` (no hay `meta.json`).
  - Compatibilidad del contrato: campo nuevo `principal` y una fila más al inicio; un cliente viejo que no filtre la contaría como agente (ver consumidores).
  - Sin subagentes la respuesta sigue vacía: `sesionOrquestadora` ya exige `archivosDeSubagentes(ruta).length > 0` (`packages/server/src/agentes.ts:245`, `:257`).
- Impactos de sync, migración, Docker o despliegue: ninguno; es lectura local de transcripts en el servidor del harness, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: lector `packages/server/src/agentes.ts` (fila principal y campo `principal`), filtro de la fila principal en la vista Corrida actual (`packages/server/web/index.html`) para que la cuenta y los KPI no cambien, y sus pruebas. Exclusiones: pregunta pendiente (FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008), texto de pregunta y respuesta (R-DAT-004), escena y mundos (S2/S3), endpoint `packages/server/src/server.ts:1021` (no cambia: serializa lo que devuelve el lector).
- Decisiones de este plan (resuelven las hipótesis del diagnóstico):
  - H1: el estado de la principal usa la misma regla que un subagente (`packages/server/src/agentes.ts:331-339`); un `Agent` en primer plano sin resultado la deja `esperando`, que es lo que la spec admite. Si el PO quiere distinguir «esperando a sus subagentes», va a un punto aparte.
  - H2: en la fila principal `ticket`, `descripcion`, `ticketEstado`, `faseConfirmada` y `faseInferida` son `null`; no se consulta el registro para ella.
  - H3: `agente` de la fila principal es el id de sesión, `basename(ruta, ".jsonl")`.
- Pasos ordenados:
  1. `packages/server/src/agentes.ts`, interfaz `AgenteDeCorrida` (`:47-61`): agregar `readonly principal: boolean` y documentarlo en el comentario de cabecera (`:1-19`). (C1, C2)
  2. `packages/server/src/agentes.ts`, función nueva `estadoDe(lectura, ahora)`: extraer la regla de estado de `leerAgentesDeCorrida` (`:331-339`) sin cambiarla, para usarla en la principal y en los subagentes. (C4, C5)
  3. `packages/server/src/agentes.ts`, `leerAgentesDeCorrida` (`:315-369`): tras localizar `ruta`, leer el transcript principal con `leerConCache(ruta)` y, si se lee, empujar primero la fila `{ agente: basename(ruta, ".jsonl"), principal: true, ticket: null, descripcion: null, modelo, esfuerzo, rama, carpeta, ultimaHerramienta, ultimaHerramientaEn, estado: estadoDe(...), ticketEstado: null, faseConfirmada: null, faseInferida: null }`; las filas de subagentes llevan `principal: false`. Si el transcript principal no se puede leer, se emiten solo los subagentes. (C1, C2, C3, C4, C5, C6)
  4. `packages/server/web/index.html`, `agentesVivos` (`:6097-6099`): excluir `a.principal === true`, de modo que la cuenta «N de M agentes» (`:6318`), `kpisDeCorrida` (`:6151-6177`) y `tablaDeAgentes` (`:6229`) no cambien con la fila nueva. La vista Agentes que la pinta llega en FEATURE-WEB-VISTA-LIENZO-20261008. (C9)
  5. `tests/actividad-agentes.test.ts`: ajustar las pruebas que comparan la lista completa (`:116-125`, `:265-291`) para leer solo `principal === false`, y agregar un bloque `describe("sesión principal")` con pruebas nombradas `SP-C1`…`SP-C8`, usando `escribirSesionDeClaude` (`tests/helpers/claude.ts:177`) con líneas del transcript principal y el reloj inyectado (`ahora`). (C1–C8)
  6. `tests/vista-corrida.test.ts`: agregar `SP-C9`, con una fila `principal: true` en el fixture de `/api/corrida/agentes` (`:109`), que comprueba que la cuenta de agentes vivos no la incluye. (C9)
  7. Correr `npx tsc -p packages/server` y los dos archivos de prueba; prueba manual contra una sesión real con subagentes. (C10, C11)
- Impactos declarados: ninguno; sin sincronización, migración ni contenedores. El contrato del endpoint suma el campo `principal` y una fila; el único cliente es `packages/server/web/index.html`, que se ajusta en el paso 4 dentro del mismo cambio.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); no hay datos persistidos ni estado que limpiar, el lector vuelve a emitir solo subagentes y la vista vuelve a su filtro anterior.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-DAT-001): con una sesión orquestadora con subagentes, la primera fila del lector tiene `principal: true` y `ticket: null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C1" -->
- [x] C2 (R-DAT-001): las filas que siguen a la principal son los subagentes, cada una con `principal: false`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C2" -->
- [x] C3 (R-DAT-001): la fila principal trae el nombre de su última herramienta y su hora en ISO
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C3" -->
- [x] C4 (R-DAT-001): la fila principal está `termino` si su último mensaje cerró con `end_turn`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C4" -->
- [x] C5 (R-DAT-001): la fila principal está `esperando` con una herramienta sin resultado o más de 60 s sin eventos, y `trabajando` en otro caso
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C5" -->
- [x] C6 (R-DAT-001): una sesión reciente sin carpeta `subagents/` produce la lista vacía
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C6" -->
- [x] C7 (R-DAT-001): `GET /api/corrida/agentes` responde 200 con la fila principal en primera posición
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C7" -->
- [x] C8 (R-DAT-003): la respuesta del endpoint con la fila principal no contiene texto de prompts, entradas ni resultados del transcript principal
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t "SP-C8" -->
- [x] C9: la vista Corrida no cuenta la fila principal entre los agentes vivos
      <!-- test: npx vitest run tests/vista-corrida.test.ts -t "SP-C9" -->
- [x] C10: el paquete del servidor compila sin errores de tipos
      <!-- test: npx tsc -p packages/server --noEmit -->
- [x] C11: con una corrida orquestada real, `GET /api/corrida/agentes` devuelve primero la sesión principal con su última herramienta
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de FEATURE-SERVER-SESION-PRINCIPAL-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y el PO valida la pantalla.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/src/agentes.ts",
      "packages/server/web/index.html",
      "tests/actividad-agentes.test.ts",
      "tests/vista-corrida.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/server/src/agentes.ts`: campo `principal` en `AgenteDeCorrida`; `estadoDe` extraída sin cambiar la regla; `leerAgentesDeCorrida` emite primero la fila de la sesión principal (`agente` = id de sesión, `ticket`/`descripcion`/fases null) y los subagentes con `principal: false`.
- `packages/server/web/index.html`: `agentesVivos` excluye `principal === true`.
- `tests/actividad-agentes.test.ts`: pruebas existentes leen solo subagentes; bloque «sesión principal» con SP-C1…SP-C8.
- `tests/vista-corrida.test.ts`: SP-C9.

## Pruebas

Directorio de ejecución: raíz del repositorio (worktree del ticket). Requisitos de ambiente: Node 24, `npm install` hecho; sin red ni HOME real (transcripts sintéticos).

- `npx vitest run tests/actividad-agentes.test.ts tests/vista-corrida.test.ts` — esperado: 2 archivos, 45 pruebas verdes (SP-C1…SP-C8 y SP-C9 incluidas). Resultado: 45 de 45 verdes.
- `npx tsc -p packages/server --noEmit` — esperado: sin errores. Resultado: sin errores.
- Manual (C11, sin marcar): con una corrida orquestada real, `GET /api/corrida/agentes` debe devolver primero la sesión principal con su última herramienta, y la vista Corrida debe mantener la cuenta «N de M agentes» sin contarla.
- Resultado del PO: «si ya se puede ver la sesion principal bien» · «A cierralos» (2026-10-09; validó la pantalla con una corrida real).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:8881bbddbff8b3b845c4998cb1cfbbc7c4466dd5",
    "environment": "macOS, Node 24, main tras integrar; Mission Control del PO en el computador y el iPad",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«si ya se puede ver la sesion principal bien» · «A cierralos»"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "manual-test",
    "description": "Suite completa en verde y validación del PO con una corrida real en Mission Control",
    "reference": "worktree:sha256:032779a134b7ca77b7de31fce08f9865705877d9601bf611f74e2484bca2e670",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«si ya se puede ver la sesion principal bien» · «A cierralos»"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "El lector devuelve la sesión orquestadora como primera fila (principal: true, ticket null) con su estado y última herramienta; la vista la excluye de la cuenta de agentes vivos.",
    "functional_summary": "La vista Agentes muestra ahora la sesión principal junto a sus subagentes.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: entra con la feature vista-agentes"
  }
]
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
    "notes": "Subagente sonnet de corrida orquestada; la sesión no expone números de tokens.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagentes por fase; sin números por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesiones de Claude Code de la corrida orquestada vista-agentes",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": "4f9b1b12-ced4-4132-9151-c3a025ede085",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 15 tickets (FEATURE-SERVER-SESION-PRINCIPAL-20261008 ×129, FEATURE-WEB-MOTOR-ESCENA-20261008 ×118, FEATURE-WEB-VISTA-LIENZO-20261008 ×118, FEATURE-WEB-MUNDO-PASTELERIA-20261008 ×110, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 ×107), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 6649907 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Feature vista-agentes\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:4f9b1b12-ced4-4132-9151-c3a025ede085",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "at": "2026-10-08T23:30:58.336Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T23:55:03.973Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T23:57:17.932Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261008-FEATURE-SERVER-SESION-PRINCIPAL-20261008-analysis-1, canal cli, decidida 2026-10-08T23:57:17.928Z): PO: \"Recomiendo A, sigue con el plan\""
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T23:58:04.082Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T00:00:21.531Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A, aprueba el plan\",\"planHash\":\"sha256:9be538bcb881531c8bf480b2e4d36defac5fce40b465adfe882bd9509daf810b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T00:00:59.816Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261008-FEATURE-SERVER-SESION-PRINCIPAL-20261008-plan-1, canal cli, decidida 2026-10-09T00:00:59.810Z): PO: \"Recomiendo A, aprueba el plan\" (respuesta a la REVIEW del plan)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T00:01:02.378Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A, aprueba el plan\",\"planHash\":\"sha256:9be538bcb881531c8bf480b2e4d36defac5fce40b465adfe882bd9509daf810b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T00:01:13.065Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:9be538bcb881531c8bf480b2e4d36defac5fce40b465adfe882bd9509daf810b."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T00:01:13.065Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T00:01:23.244Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T00:02:18.384Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-09T00:02:42.836Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:07.209Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:07.651Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:08.062Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:08.430Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:08.759Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:09.173Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:09.579Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:09.924Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:10.242Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:10.547Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:10.848Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:11.166Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:13.153Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:13.338Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001. Criterios marcados desde el recibo GR-20261009-FEATURE-SERVER-SESION-PRINCIPAL-20261008-qa-mechanical-1 de qa-mechanical: C9, C10."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:13.735Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
