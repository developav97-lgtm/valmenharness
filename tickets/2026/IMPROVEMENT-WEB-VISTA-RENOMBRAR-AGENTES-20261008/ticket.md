---
schema_version: 2
id: IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008
title: Renombrar Corrida a Agentes y redirigir rutas viejas
type: IMPROVEMENT
module: WEB
workflow_status: closed
qa_status: approved
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

# IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008

## Solicitud original

Parte del sprint: Vista Agentes renombrada, motor de escena con tests deterministas, lienzo montado con selector, aviso y paneles, marco responsivo.
- R-ESC-001: La vista DEBE llamarse «Agentes» y conservar las rutas viejas
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La vista DEBE llamarse «Agentes» y conservar las rutas viejas
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: solo el cliente de Mission Control (`packages/server/web/index.html`): el enlace del menú lateral, el título de la barra, el encabezado de la vista y la ruta pasan de «Corrida» (`#/corrida`) a «Agentes» (`#/agentes`); `#/corrida` y `#/jornadas` quedan como alias que pintan la misma vista y marcan «Agentes» como activa en el menú. Fuera de alcance: el endpoint `/api/corrida/agentes`, las clases CSS `corrida-*`, la clave `valmen.corrida.simultaneos` de localStorage, los nombres de funciones internas y la palabra «ejecución» para el proceso (R-ESC-001 y design.md §«Lo que no cambia»); el lienzo y los mundos son de otros tickets de la feature.
- Usuario o rol afectado: la persona que usa Mission Control (PO u operador) para seguir a los agentes de la ejecución; y quien tenga enlaces o marcadores guardados a `#/corrida` o `#/jornadas`.
- Comportamiento actual: el menú muestra «Corrida» y apunta a `#/corrida`; la barra y el `h2` dicen «Corrida»; `#/jornadas` pinta la misma vista pero el menú no queda marcado como activo, porque la comparación es `enlace.dataset.vista === nombre` y `"jornadas" !== "corrida"`.
- Comportamiento esperado: el menú dice «Agentes» y apunta a `#/agentes`; la barra y el encabezado dicen «Agentes»; abrir `#/agentes`, `#/corrida` o `#/jornadas` muestra la misma vista con «Agentes» marcado (`aria-current="page"`) y el refresco de 5 s sigue funcionando en las tres rutas.

## Diagnóstico

- Memoria consultada: `valmen memory search "vista corrida renombrar ruta hash alias"` no devuelve ningún antecedente de esta vista (AP-002, AP-003, AP-006, AP-010 son de compuertas e imports); no hay causa previa que citar.
- Causa comprobada (con `ruta:línea`): el nombre «Corrida» y la ruta `corrida` están escritos a mano en cinco puntos del cliente, sin una lista única de alias:
  - `packages/server/web/index.html:2323` — enlace del menú `<a href="#/corrida" data-vista="corrida">…Corrida</a>`.
  - `packages/server/web/index.html:8618-8619` — `TITULOS.jornadas` y `TITULOS.corrida` valen «Corrida» (título de la barra, que pinta `marcarTitulo` en `:8627-8637`).
  - `packages/server/web/index.html:6301` — `cont.append(el("h2", "Corrida"))` en `vistaCorrida`.
  - `packages/server/web/index.html:8791` — el enrutador `navegar` despacha `nombre === "corrida" || nombre === "jornadas"` a `vistaCorrida()`; `:8762` decide con la misma pareja si se invalida `revisionVistaJornadas`.
  - `packages/server/web/index.html:6272` (`sigueVigente` de `vistaCorrida`) y `:6409` (`programarRefrescoDeCorrida`) comprueban `["corrida", "jornadas"].includes(...)` para no pintar ni refrescar fuera de la vista.
  - `packages/server/web/index.html:8772-8775` — la marca del menú es `enlace.dataset.vista === nombre` más las excepciones de `ticket` y `feature`; ningún alias de la vista Corrida está contemplado, por eso hoy `#/jornadas` pinta la vista pero deja el menú sin marcar. Al renombrar a `agentes`, `#/corrida` caería en el mismo hueco: la regla del escenario «Ruta vieja» (menú marcado) no se cumple sin tocar esta comparación.
- Hipótesis pendientes: ninguna sobre la causa. Decisión de diseño a fijar en el plan: concentrar los nombres de la vista en una sola constante (por ejemplo `RUTAS_DE_AGENTES = ["agentes", "corrida", "jornadas"]`) usada en `:6272`, `:6409`, `:8762`, `:8772` y `:8791`, en vez de repetir la lista; y si `#/corrida` debe reescribir el hash a `#/agentes` (`history.replaceState`) o solo pintar la vista. La spec pide que «sigan funcionando y lleven a la misma vista», lo que ambas cumplen; reescribir evita dos URLs para la misma pantalla pero cambia lo que la persona ve en la barra de direcciones.
- Consumidores afectados:
  - `tests/vista-corrida.test.ts:124-127` exige literalmente `<a href="#/corrida" data-vista="corrida">.*Corrida</a>` y `:130-135` que `#/corrida` y `#/jornadas` pinten un texto que contiene «Corrida»: ambas aserciones cambian con el renombre (el resto del archivo usa `hash: "#/corrida"` y `/api/corrida/agentes`, que siguen válidos como alias y endpoint).
  - `tests/jornadas-progreso-pantalla.test.ts:43` y `tests/reconexion-mc.test.ts:83,172` abren `#/jornadas`: siguen funcionando si el alias se conserva; no buscan el texto «Corrida».
  - `marcarPendientes` (`index.html:8647`) localiza enlaces por `nav a[data-vista="…"]`; hoy no pone cuenta en `corrida`, así que el cambio de `data-vista` no lo afecta.
  - Tickets siguientes de la feature (`FEATURE-WEB-VISTA-LIENZO-20261008` depende de este) montarán el lienzo dentro de la vista renombrada.
  - Enlaces externos: `docs/disenos/vista-agentes.html:94` y la spec citan `/api/corrida/agentes`, que no cambia.
- Archivos y flujo investigados: `hashchange` (`index.html:8814`) → `navegar` (`:8756`) → `marcarTitulo` (`:8627`, `TITULOS` en `:8611-8625`) → marca del menú (`:8770-8778`) → despacho a `vistaCorrida` (`:8791`, definida en `:6265`) → `sigueVigente` (`:6268-6272`) → pinta `h2` (`:6301`), agentes vivos (`:6353`) y detalle de jornada (`:6391-6394`) → `programarRefrescoDeCorrida` (`:6404-6417`) vuelve a llamar a `navegar` cada 5 s mientras el hash sea de la vista. Spec `.valmen/features/vista-agentes/spec/s2-motor-escena/spec.md:7-16`, `design.md` §«Lo que no cambia» y el prototipo `assets/vista-agentes.html:2,93` (título «Vista Agentes», `h1` «Agentes»).
- Riesgos y compatibilidad: (1) si una de las cinco comprobaciones de ruta no incluye `agentes`, la vista se pinta pero el refresco o `sigueVigente` la descartan y queda en blanco o congelada; por eso la lista única. (2) Marcadores a `#/corrida` y `#/jornadas` deben seguir abriendo la vista (escenario «Ruta vieja»). (3) No cambiar el endpoint ni la clave de localStorage: cambiarlos perdería la preferencia de «simultáneos» guardada y rompería la feature anterior. (4) Las pruebas de `tests/vista-corrida.test.ts` que fijan el texto «Corrida» se actualizan en el mismo cambio; no hay otros consumidores en `packages/*/src` (búsqueda de `#/corrida` y `'corrida'` solo encuentra `index.html`).
- Impactos de sync, migración, Docker o despliegue: ninguno — cambio solo en el HTML estático que sirve el servidor local; sin datos, contratos de API, contenedores ni migraciones.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: renombrar la vista «Corrida» a «Agentes» en el cliente `packages/server/web/index.html` (menú, título de barra, encabezado, ruta `#/agentes`) y conservar `#/corrida` y `#/jornadas` como alias con el menú marcado; actualizar `tests/vista-corrida.test.ts` al nombre nuevo y cubrir los alias.
- Exclusiones: endpoint `/api/corrida/agentes`; clases CSS `corrida-*`; clave `valmen.corrida.simultaneos`; nombres internos (`vistaCorrida`, `programarRefrescoDeCorrida`, `revisionVistaJornadas`); textos que nombran el proceso de ejecución o las corridas de procesos (`vistaProcesos`, portafolio); lienzo, motor y mundos (otros tickets de la feature).
- Decisión de diseño tomada en el plan: los alias **no reescriben** la URL (sin `history.replaceState`): `#/corrida` y `#/jornadas` pintan la vista «Agentes» y marcan su enlace, tal como pide el escenario «Ruta vieja». Motivo: el cliente no usa hoy la API de historial y el entorno de pruebas no la expone; reescribir la barra de direcciones es un cambio visible que la spec no pide. Queda como supuesto del plan: el PO no respondió sobre la reescritura (2026-10-08); si la prefiere, se ajusta antes de aprobar.
- Pasos ordenados:
  1. `packages/server/web/index.html`, junto a `TITULOS` (`:8611`): declarar `const RUTAS_DE_AGENTES = ["agentes", "corrida", "jornadas"];` y una función `esRutaDeAgentes(nombre)` que la consulta; cambiar `TITULOS` a `agentes: "Agentes"`, `corrida: "Agentes"`, `jornadas: "Agentes"`. (C3, C5, C6)
  2. `packages/server/web/index.html:2323`: el enlace del menú pasa a `<a href="#/agentes" data-vista="agentes">…Agentes</a>`, con el mismo icono. (C1, C2)
  3. `packages/server/web/index.html`, `navegar` (`:8762`, `:8772-8775`, `:8791`): usar `esRutaDeAgentes(nombre)` para invalidar `revisionVistaJornadas`, para despachar a `vistaCorrida()` y para marcar `aria-current` en el enlace `data-vista="agentes"` cuando la ruta es un alias. (C4, C5, C6, C7)
  4. `packages/server/web/index.html`, `vistaCorrida` (`:6272` `sigueVigente`, `:6301` `h2`) y `programarRefrescoDeCorrida` (`:6409`): reemplazar `["corrida", "jornadas"].includes(...)` por `esRutaDeAgentes(...)` y el `h2` «Corrida» por «Agentes». (C3, C8)
  5. `tests/vista-corrida.test.ts`: cambiar la aserción del menú (`:124-127`) a `#/agentes`/«Agentes», asegurar que ya no existe `data-vista="corrida"` ni `data-vista="jornadas"`; extender la prueba de alias (`:130-135`) a `#/agentes`, `#/corrida` y `#/jornadas`, comprobando el `h2` «Agentes», el título de barra y `aria-current="page"` en el enlace `agentes`; añadir que la ruta `#/agentes` también se refresca a los 5 s (mismo patrón que la prueba de refresco existente, `:284-320`). (C1–C8)
  6. Correr `npx vitest run tests/vista-corrida.test.ts tests/jornadas-progreso-pantalla.test.ts tests/reconexion-mc.test.ts` (consumidores de `#/jornadas`) y verificar en el navegador con Mission Control las tres rutas. (C9, C10, C11, C12)
- Impactos declarados: ninguno — sin sincronización, migración ni contenedores; cambio solo en el HTML estático del servidor local y en sus pruebas.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); el cambio es autocontenido en `packages/server/web/index.html` y `tests/vista-corrida.test.ts`, no deja datos ni preferencias migradas (la clave de localStorage y el endpoint no cambian), así que volver atrás restaura «Corrida» sin efectos colaterales.

## Criterios de aceptación

- [x] C1 (R-ESC-001): El menú lateral muestra el enlace «Agentes» con `href="#/agentes"` y `data-vista="agentes"`.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C2: El menú ya no contiene enlaces con `data-vista="corrida"` ni `data-vista="jornadas"`.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C3: Al abrir `#/agentes` el encabezado de la vista dice «Agentes» y se listan los agentes vivos.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C4: Al abrir `#/agentes` el enlace «Agentes» del menú queda con `aria-current="page"`.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C5 (R-ESC-001): Al abrir el enlace guardado `#/corrida` se muestra la vista «Agentes» con su enlace marcado como activo.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C6 (R-ESC-001): Al abrir el enlace guardado `#/jornadas` se muestra la vista «Agentes» con su enlace marcado como activo.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C7: El título de la barra dice «Agentes» en las tres rutas.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C8: Con la vista abierta en `#/agentes`, el refresco de 5 s vuelve a consultar `/api/corrida/agentes`.
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C9: Las pantallas que abren `#/jornadas` (progreso de jornada y reconexión) siguen pasando sus pruebas.
      <!-- test: npx vitest run tests/jornadas-progreso-pantalla.test.ts tests/reconexion-mc.test.ts -->
- [x] C10: En Mission Control, en el navegador, `#/agentes` muestra la vista «Agentes» con su enlace del menú marcado.
      <!-- verify: manual -->
- [x] C11: En Mission Control, en el navegador, el enlace guardado `#/corrida` muestra la vista «Agentes» con su enlace del menú marcado.
      <!-- verify: manual -->
- [x] C12: En Mission Control, en el navegador, el enlace guardado `#/jornadas` muestra la vista «Agentes» con su enlace del menú marcado.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/web/index.html",
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

- `packages/server/web/index.html`: `RUTAS_DE_AGENTES` y `esRutaDeAgentes` junto a `TITULOS`; `TITULOS` con `agentes`, `corrida` y `jornadas` en «Agentes»; enlace del menú `#/agentes` con `data-vista="agentes"`; `navegar` (invalidación de `revisionVistaJornadas`, despacho a `vistaCorrida` y `aria-current` del enlace `agentes` también en los alias); `vistaCorrida` (`sigueVigente`, `h2` «Agentes») y `programarRefrescoDeCorrida` usan `esRutaDeAgentes`.
- Los alias no reescriben la URL (decisión del plan). Intactos: endpoint, clases `corrida-*`, clave `valmen.corrida.simultaneos`, nombres internos.
- `tests/vista-corrida.test.ts`: menú nuevo, ausencia de `data-vista="corrida"`/`"jornadas"`, tres rutas con `h2`, título de barra y `aria-current`, y refresco de 5 s en `#/agentes`.

## Pruebas

Directorio: raíz del repositorio (o del worktree). Requisito: Node 24, `npm run build` previo para `tests/interfaz-ejecutable.test.ts` (compara contra `packages/cli/dist/web/`, ignorado por git).

- `npx vitest run tests/vista-corrida.test.ts` — esperado: 15 pruebas verdes (C1–C8). Resultado: verde.
- `npx vitest run tests/jornadas-progreso-pantalla.test.ts tests/reconexion-mc.test.ts` — esperado: verde (C9). Resultado: verde.
- `npx vitest run tests/interfaz-ejecutable.test.ts` — esperado: verde tras `npm run build`. Resultado: verde.
- `npx tsc --noEmit -p .` — sin errores.

Validaciones manuales (C10–C12, pendientes del responsable): abrir Mission Control y visitar `#/agentes`, `#/corrida` y `#/jornadas`; en las tres, el encabezado y el título de barra dicen «Agentes» y el enlace «Agentes» del menú queda marcado; la dirección no se reescribe.

- Resultado del PO: «Sí, cierra el renombrado también» (C10–C12 verificados en el navegador por el orquestador: las tres rutas muestran «Agentes» con el menú marcado y sin reescribir la URL).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:7c3e00a9c6a545e3c56e1ffe96e61bf0879eb6f5",
    "environment": "macOS, Node 24, main tras integrar; Mission Control en el navegador",
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
    "po_confirmation": "Sí, cierra el renombrado también"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa (3552 pruebas) en verde; C10-C12 verificados en Mission Control",
    "reference": "worktree:sha256:2aa1599b3d23daeaa1a2171e60a75dc528797d580a85a7630281773a2f858335",
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
    "po_confirmation": "Sí, cierra el renombrado también"
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
    "technical_summary": "Rutas y nombre de la vista concentrados en una constante en index.html: #/agentes es la ruta; #/corrida y #/jornadas la muestran sin reescribir la URL y con el menú marcado. Endpoint y clases CSS sin cambios.",
    "functional_summary": "La vista que se llamaba «Corrida» ahora se llama «Agentes» en menú, ruta y título, y los enlaces guardados siguen funcionando.",
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
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: subagente sonnet-5-5 de corrida orquestada, fase implementación; la sesión no expone los números",
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
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 4 tickets (FEATURE-SERVER-SESION-PRINCIPAL-20261008 ×120, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 ×105, FEATURE-WEB-MOTOR-ESCENA-20261008 ×102, FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008 ×87), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 1123304 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Feature vista-agentes\".",
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
    "at": "2026-10-08T23:30:58.760Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T23:55:12.857Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T23:56:34.890Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T00:05:59.304Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008-plan-2, canal cli, decidida 2026-10-09T00:05:59.298Z): PO: \"Recomiendo A, aprueba el plan\" (respuesta a la REVIEW del plan)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T00:05:59.637Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A, aprueba el plan\",\"planHash\":\"sha256:ad6b5860b3be1c5890ca32dd2238b50f4897cbfc5a701707748e8a6892c68c48\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T00:06:05.123Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:ad6b5860b3be1c5890ca32dd2238b50f4897cbfc5a701707748e8a6892c68c48."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T00:06:05.123Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T00:06:16.805Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T00:07:47.148Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T00:10:06.796Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:42.673Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:43.078Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:43.450Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:43.773Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:44.066Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:44.388Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:44.722Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:45.022Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:45.422Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:45.732Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:46.009Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:46.526Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:48.581Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:48.725Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001. Criterios marcados desde el recibo GR-20261009-IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008-qa-mechanical-1 de qa-mechanical: C1, C2, C3, C4, C5, C6, C7, C8, C9."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-08",
    "at": "2026-10-09T00:22:49.002Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
