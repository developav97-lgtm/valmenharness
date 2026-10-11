---
schema_version: 2
id: FEATURE-WEB-QA-SIN-CUBRIR-20261010
title: La vista del ticket muestra lo no cubierto por ciclo
type: FEATURE
module: WEB
workflow_status: awaiting_user_tests
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

# FEATURE-WEB-QA-SIN-CUBRIR-20261010

## Solicitud original

Parte del sprint: El cierre de QA declara lo no cubierto, compatible con ciclos anteriores, y la vista del ticket lo muestra.
- R-QAC-003: La vista del ticket DEBE mostrar lo no cubierto de cada ciclo
Depende de: FEATURE-ENGINE-QA-SIN-CUBRIR-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La vista del ticket DEBE mostrar lo no cubierto de cada ciclo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la sección «QA» de la vista del ticket en Mission Control (`packages/server/web/index.html`) pinta el campo `not_covered` que FEATURE-ENGINE-QA-SIN-CUBRIR-20261010 (cerrado en main) agregó a la entrada que cierra cada ciclo de QA. Solo interfaz: el motor, el validador y la API no cambian.
- Usuario o rol afectado: el PO y quien revisa un ticket en Mission Control antes de aprobar QA o cerrar.
- Comportamiento actual: la tarjeta de la entrada de cierre dice «not_covered: 2 elemento(s)» sin los elementos; con cobertura completa (`[]`) no dice nada, y un ciclo cerrado antes del cambio tampoco, así que «todo cubierto» y «sin declarar» se ven igual.
- Comportamiento esperado (R-QAC-003): bajo la tarjeta de cada entrada que cierra un ciclo se lista cada elemento no cubierto; una lista vacía se lee «Todo cubierto»; un cierre sin el campo se lee «Sin cubrir: sin declarar» (la lectura que fija R-QAC-002). La entrada que abre el ciclo no muestra nada de esto.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): la vista pinta el bloque QA con la tarjeta genérica `tarjetaDato` (`packages/server/web/index.html:5171-5186`, `["QA", t.qa]` en la línea 5176). `tarjetaDato` (`index.html:6053-6105`) salta los arreglos vacíos (`index.html:6089-6091`) y resume los no vacíos con su conteo, «`${clave}: ${valor.length} elemento(s)`» (`index.html:6092-6096`). Por eso los textos de `not_covered` nunca llegan a la pantalla y `[]` desaparece. El dato sí llega: `GET /api/tickets/:id` devuelve `readTicket` sin transformar (`packages/server/src/server.ts:1292-1304`), y la entrada de cierre lleva `not_covered` solo cuando se declaró (`packages/engine/src/append.ts:736`).
- Hipótesis pendientes: ninguna sobre la causa. El registro real no tiene todavía ningún ciclo con `not_covered` (el 2026-10-11, `grep -rl '"not_covered": \[' tickets/` solo devuelve el ticket del motor, que la nombra en su plan y no en su bloque `QA`): la verificación en el navegador necesita un registro de prueba armado con los comandos reales (`valmen qa-start` / `valmen qa-close --not-covered`).
- Consumidores afectados: solo la vista del ticket. `tarjetaDato` también pinta Puntos, Evidencia, Retests y Cierre (`index.html:5173-5180`); su resumen de arreglos por conteo debe seguir igual para esos bloques. El verificador de interfaz (`scripts/verificar-interfaz.mjs:754-765`, fixture con `qa: []` en la línea 164) y `tests/interfaz-ejecutable.test.ts` recorren la vista del ticket y no deben cambiar.
- Archivos y flujo investigados: `valmen qa-close`/`cerrar_qa` → `qaClose` (`packages/engine/src/append.ts:715-745`) → bloque `QA` validado por `validateQa` (`packages/core/src/blocks.ts:198-279`: `not_covered` opcional en la línea 217, solo en la entrada impar que cierra, líneas 254-274) → `readTicket` → `GET /api/tickets/:id` (`server.ts:1292`) → `vistaTicket` (`index.html:4820`) → acordeón «QA» → `tarjetaDato`. Arnés que ejecuta el HTML real con DOM mínimo: `scripts/verificar-interfaz.mjs:624` (`ejecutarInterfaz`, `buscarNodos`), usado como en `tests/firma-de-bloqueo-pantalla.test.ts:50-82`. Estilos: `.tarjeta-dato*` en `index.html:1553-1571`, con variables (`var(--tenue)`, `var(--borde)`), que son las que mantienen el modo oscuro.
- Riesgos y compatibilidad: (1) tocar `tarjetaDato` para todos los bloques cambiaría cómo se ven los arreglos de Evidencia o Cierre; el cambio se limita a la entrada de QA. (2) La paridad de entradas (par abre, impar cierra) es la que fija `validateQa`; la vista la usa para no decir «sin declarar» bajo una entrada que abre un ciclo ni bajo un ciclo todavía abierto (`result: pending`). (3) Colores: solo variables existentes; `revisar_presentacion` se corre al entregar. (4) Un texto con HTML se pinta con `textContent` (función `el`, `index.html:2644-2649`), sin `innerHTML`.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia solo el HTML estático que sirve `valmen serve`.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-11 con «Aprobar tal cual (Recomendado)».
- Modo: harness completo (FEATURE de una feature descompuesta, sprint S3; es pantalla).
- Alcance: la vista del ticket (`packages/server/web/index.html`) pinta `not_covered` bajo la tarjeta de cada entrada que cierra un ciclo de QA: la lista de elementos, «Todo cubierto» para `[]`, «Sin cubrir: sin declarar» para un cierre sin el campo.
- Exclusiones: motor, validador, API, CLI y MCP no cambian; la tarjeta genérica `tarjetaDato` sigue igual para Puntos, Evidencia, Retests y Cierre; `findings` no cambia.
- Tamaño previsto: 12 criterios; unas 220 líneas (≈45 de producción entre JS y CSS, ≈175 de pruebas). Si supera 400, se parte el ticket.
- Estándares leídos antes de escribir: `.valmen/rules/stack.md`, `.valmen/rules/proyecto.md`, `.valmen/rules/estandares-proceso.md` (no hay `estandares-web`); skills `desarrollo-frontend` y `validacion-ui`. UI UX Pro Max no está habilitada (`valmen skills external`: sin skills de terceros), así que no se lee.
- Pasos ordenados:
  1. Prueba primero: crear `tests/qa-sin-cubrir-vista.test.ts`, que ejecuta el HTML real con `ejecutarInterfaz` y `buscarNodos` de `scripts/verificar-interfaz.mjs` (como `tests/firma-de-bloqueo-pantalla.test.ts:50-82`), con `#/ticket/<ID>` y un ticket leído con `readTicket` cuyo bloque `qa` se reemplaza en la respuesta falsa de la API. Una prueba parametrizada por la regla R-QAC-003 con los casos de C1–C7, más una de regresión por la función tocada (C8: un arreglo de Evidencia sigue resumido «N elemento(s)»). Observarlas en rojo con `npx vitest run tests/qa-sin-cubrir-vista.test.ts` y anotar la salida en `## Pruebas`. (C1–C8)
  2. `packages/server/web/index.html`, `vistaTicket` (bloques en `index.html:5171-5186`): el bloque QA usa una tarjeta propia, `tarjetaCicloQa(registro, indice)`, que llama a `tarjetaDato` con el registro sin la clave `not_covered` y, solo en la entrada impar que cierra el ciclo, agrega una caja «Sin cubrir» con un `ul`/`li` por elemento (texto con `el`, que usa `textContent`), «Todo cubierto» si la lista está vacía o «Sin cubrir: sin declarar» si falta la clave. El índice sale de `t.qa.indexOf(registro)`; `tarjetasDe` no cambia. (C1–C7)
  3. `index.html`, estilos junto a `.tarjeta-dato-nota` (`index.html:1567-1571`): clase `tarjeta-dato-cobertura` con `var(--tenue)` / `var(--borde)`, sin colores escritos a mano. (C11)
  4. Verde y regresiones: `npx vitest run tests/qa-sin-cubrir-vista.test.ts tests/interfaz-ejecutable.test.ts tests/firma-de-bloqueo-pantalla.test.ts tests/estaticos-web.test.ts`; `node scripts/verificar-interfaz.mjs packages/server/web/index.html`. (C8, C9)
  5. Verificación en el navegador (C10, C11, C12): `npm run build`; registro de prueba en el scratchpad armado con comandos reales —`git init`, `valmen init`, `valmen create --id FEATURE-PRUEBA-QA-20261011 ...`, `valmen qa-start --environment local --build-reference commit:<hash>`, `valmen qa-close --result changes_requested --not-covered` con dos líneas («modo oscuro en iPad», «teclado en Safari»), segundo ciclo cerrado `approved --all-covered --po-confirmation "prueba"`—; `valmen serve --port 4310` desde ese registro y, aparte, `valmen serve --port 4311` desde este worktree. Pantallas: `http://localhost:4310/#/ticket/FEATURE-PRUEBA-QA-20261011`, acordeón «QA» abierto (se ven los dos elementos bajo QA-002, «Todo cubierto» bajo QA-004); `http://localhost:4311/#/ticket/FEATURE-ENGINE-QA-SIN-CUBRIR-20261010` (se ve «Sin cubrir: sin declarar» bajo QA-002). Antes de entregar, `revisar_presentacion` sobre el cambio.
  6. Capturas al PO (en `## Evidencia` del ticket con su ruta): (a) ciclo con dos elementos, modo claro; (b) el mismo, modo oscuro; (c) «Todo cubierto» del segundo ciclo; (d) «sin declarar» del ticket con ciclo anterior al cambio.
- Pruebas existentes: ninguna cambia a propósito. Si una de `tests/interfaz-ejecutable.test.ts` o de `tests/estaticos-web.test.ts` se pone en rojo, se detiene y se reporta en el ticket (EST-009).
- Impactos declarados: ninguno de sincronización, migración ni contenedores; cambia solo el HTML estático que sirve `valmen serve`.
- Rollback (obligatorio): revertir el commit del ticket; el HTML vuelve a la tarjeta genérica y el registro no cambia, porque la vista solo lee.

## Criterios de aceptación

- [x] C1 (R-QAC-003): Un cierre con dos elementos sin cubrir pinta cada elemento como un ítem de lista en la tarjeta de ese cierre.
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [x] C2 (R-QAC-003): La tarjeta de un cierre con elementos sin cubrir ya no pinta el resumen «not_covered: 2 elemento(s)».
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [x] C3 (R-QAC-003): Un cierre con `not_covered` vacío pinta «Todo cubierto» en su tarjeta.
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [x] C4 (R-QAC-003): Un cierre sin la clave `not_covered` pinta «Sin cubrir: sin declarar» en su tarjeta.
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [x] C5 (R-QAC-003): La tarjeta de una entrada que abre un ciclo no pinta ninguna línea de cobertura.
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [x] C6 (R-QAC-003): Con dos ciclos cerrados, cada lista aparece en la tarjeta de su propio cierre.
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [x] C7 (R-QAC-003): Un elemento con marcado HTML se pinta como texto literal, sin crear nodos.
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [ ] C8: Un arreglo no vacío de un registro de Evidencia sigue pintándose como «N elemento(s)».
      <!-- test: npx vitest run tests/qa-sin-cubrir-vista.test.ts -->
- [ ] C9: El verificador de interfaz recorre todas las vistas sin fallos.
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [ ] C10: En el navegador, la sección QA del ticket de prueba lista los dos elementos bajo su ciclo.
      <!-- verify: manual -->
- [ ] C11: En modo oscuro, la lista sin cubrir se lee con el mismo contraste que las demás notas de la tarjeta.
      <!-- verify: manual -->
- [ ] C12: En el navegador, el ticket con un ciclo anterior al cambio muestra «sin declarar» bajo su cierre.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/web/index.html`: nueva `tarjetaCicloQa(registro, indice)` junto a `tarjetasDe`; llama a `tarjetaDato` con el registro sin `not_covered` y, en la entrada impar (la que cierra), agrega dentro de la tarjeta la caja `tarjeta-dato-cobertura`: «Sin cubrir» con un `li` por elemento (texto con `el`, sin `innerHTML`), «Todo cubierto» si la lista es vacía, «Sin cubrir: sin declarar» si falta la clave. `vistaTicket` usa esa tarjeta solo para el bloque QA; los demás bloques siguen con `tarjetaDato`.
- Estilos `.tarjeta-dato-cobertura` con `var(--borde)`; sin colores escritos a mano.
- `tests/qa-sin-cubrir-vista.test.ts` (nuevo): una prueba parametrizada por R-QAC-003 (seis casos) y una de regresión de `tarjetaDato` (Evidencia).
- Ninguna prueba existente se editó.

## Pruebas

- Rojo previo (antes de implementar): `npx vitest run tests/qa-sin-cubrir-vista.test.ts` dio 5 fallidas y 2 pasadas (las dos que afirman ausencia: la entrada que abre y la regresión de Evidencia).
- Directorio: raíz del worktree/repositorio. Comando: `npx vitest run tests/qa-sin-cubrir-vista.test.ts tests/interfaz-ejecutable.test.ts tests/firma-de-bloqueo-pantalla.test.ts tests/estaticos-web.test.ts` (requiere `npm run build` antes: el verificador compara `dist/web` con la fuente). Resultado esperado: 4 archivos, 36 pruebas en verde. Además `node scripts/verificar-interfaz.mjs packages/server/web/index.html` («Interfaz verificada.»), `npx tsc --noEmit -p .`, `node scripts/exports-sin-uso.mjs`.
- Validación manual (C10, C11, C12), a cargo del responsable: desde un registro con un ciclo cerrado con `valmen qa-close --not-covered "a" --not-covered "b"` y otro `--all-covered`, `valmen serve --port 4310`, abrir `#/ticket/<ID>` y el acordeón «QA»: se ven los dos elementos bajo el cierre y «Todo cubierto» bajo el segundo; en un ticket con ciclo anterior (p. ej. FEATURE-ENGINE-QA-SIN-CUBRIR-20261010) «Sin cubrir: sin declarar»; repetir en modo oscuro.
- Limitación: el agente no pudo levantar el servidor de desarrollo con `preview_start` (la herramienta lee `.claude/launch.json` del checkout principal, que no se toca) y no se usó Bash para servidores; C10–C12 y las capturas quedan sin verificar. Hay un registro de prueba armado con comandos reales en el scratchpad de la sesión (`reg-prueba`, ticket FEATURE-WEB-PRUEBAQA-20261011).

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
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente sonnet sin acceso a sus números de consumo.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:34.823Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T20:42:26.097Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T20:44:24.071Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T20:47:15.361Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:6de21b81e050192262592ace88c7af58a851187c4a25bd8502b35a18a1cf0e78\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T20:47:15.917Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:6de21b81e050192262592ace88c7af58a851187c4a25bd8502b35a18a1cf0e78."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T20:47:15.917Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T20:47:16.261Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T20:51:21.496Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T20:51:22.051Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T20:51:45.143Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":231,\"borradas\":1,\"total\":232,\"tope\":400,\"pasaElTope\":false,\"via\":\"worktree\"}"
  }
]
```
