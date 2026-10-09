---
schema_version: 2
id: FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009
title: Pantalla de autorizaciones con casillas y módulos leídos del registro de cada proyecto
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
created: 2026-10-08
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009

## Solicitud original

"necesito que mejoremos esa pantalla que yo pueda seleccionar varios o todos no escribir porque pasa esto debe darme las opciones el formulario para cada opcion". Contexto del PO: copió los tipos y los pegó en módulos y escribió «todos» porque no sabe cuáles módulos hay; pasó igual en la autorización de QA por agente y en las de saiopencloud, y necesita acomodar la de QA de este proyecto y arreglar las de saiopencloud. Pantalla: tipos, módulos, etapas y modo como casillas con «seleccionar todos»; los módulos salen del registro de cada proyecto.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Cada elemento es una decisión del PO; ninguno tiene opción por defecto que amplíe autoridad, y el plan no avanza sobre ninguno sin su respuesta.

1. **Qué significa «seleccionar todos» en módulos.** Pregunta: ¿«todos» guarda la lista concreta de los módulos que el registro tiene hoy (A: no cubre un módulo que nazca después; el motor no cambia), o guarda un comodín que cubre también los módulos futuros (B: amplía la autoridad de la autorización y deroga la barrera escrita en `packages/engine/src/approval-authorization.ts:170-171` y `packages/engine/src/qa-authorization.ts:145-146`)? Mientras no responda, el análisis supone A, que no amplía autoridad.
2. **De dónde salen los módulos ofrecidos en SaiOpenCloud.** Su registro (`docs/tickets`, 189 tickets) tiene 42 módulos y mezcla módulos de negocio (POS, RESTAURANTE, SUPERADMIN) con nombres de pantalla o de acción (RELLENO 7, CREACION 6, EDICION 5, HUECOS 2, PANTALLA 1) y duplicados de forma (REPORTE/REPORTES, LOCALAGENT/LOCALAGENTS, ADMIN/ADMINISTRACION). Propuesta: ofrecer los módulos del registro ordenados por número de tickets y mostrando ese número, y permitir que el proyecto declare en `.valmen/config.yaml` una lista explícita que, si existe, reemplaza a la del registro. Pregunta: ¿se acepta la lista declarada como fuente que manda, o se ofrece siempre todo lo del registro sin filtro?
3. **«Modo» admite un solo valor.** El motor guarda `mode` como texto único (`packages/engine/src/approval-authorization.ts:185-188`, valores `on-approve` y `reviewer` en `:37`). Pregunta: ¿el modo se muestra como opción única (radio) y no como casillas con «seleccionar todos», que no tienen significado para un campo de un valor?
4. **Impactos y riesgo quedan fuera de «seleccionar todos».** El pedido nombra tipos, módulos, etapas y modo; los impactos (`sync_impact`, `migration_impact`, `docker_impact`) y el riesgo máximo amplían autoridad sobre cambios críticos. Pregunta: ¿los impactos pasan a casillas sin botón «seleccionar todos» (cada uno se marca a mano), o se dejan como están?
5. **Rechazo de palabras reservadas.** Propuesta que restringe, no amplía: el motor rechaza en `modules` las palabras `todos`, `all` y `*` con un mensaje que manda a elegir los módulos en la lista. Pregunta: ¿se acepta?
6. **Las autorizaciones ya creadas con «todos» no se corrigen desde este ticket.** Son renglones append-only (`.valmen/approval/authorizations.jsonl:1-2` en ValmenHarness: APA-20261008-d04177 y APA-20261008-c2d3a3; `.valmen/qa/authorizations.jsonl:1`: QAA-20261008-a5fb57; en SaiOpenCloud APA-20261007-20db96 y QAA-20261007-304ad6). Corregirlas es revocarlas y crearlas de nuevo con la pantalla nueva, y eso lo hace el PO. Pregunta: ¿confirma que la revocación y la nueva creación quedan a su cargo, fuera del alcance del código?

**Decisión del PO (2026-10-09), frase literal:** «Acepto 1 a 5 como recomiendas»

Interpretación, aparte de la frase:
- (1) «Seleccionar todos» en módulos marca y envía la lista concreta de los módulos ofrecidos hoy; sin comodín, y la barrera de `packages/engine/src/approval-authorization.ts:170-171` no se toca.
- (2) Si `.valmen/config.yaml` declara una lista de módulos para autorizaciones, esa lista reemplaza a la del registro; si no la declara, se ofrecen los del registro ordenados por número de tickets. Declarar la lista en SaiOpenCloud (qué módulos van) es configuración de ese proyecto y la escribe el PO; este ticket solo trae el mecanismo.
- (3) El modo se muestra como opción única (radio), sin «seleccionar todos».
- (4) Los impactos pasan a casillas sin «seleccionar todos»; ninguna viene marcada por defecto.
- (5) El motor rechaza `todos`, `all` y `*` como módulo, en aprobación y en QA.
- (6) No forma parte de la decisión: revocar y recrear las cinco autorizaciones con «todos» es del PO y queda fuera del ticket.

## Descripción funcional

- Alcance: los dos formularios de creación de autorizaciones de la vista Configuración de Mission Control —«Autorización de QA por agente» y «Aprobación automática de planes»— cambian los campos de texto libre de tipos, módulos y etapas por casillas con «seleccionar todos», y los módulos ofrecidos salen del registro del proyecto elegido en la cabecera. Fuera de alcance: crear, revocar o corregir autorizaciones existentes (lo hace el PO), el riesgo máximo, el cupo y la vigencia, la CLI `approval-authorize`/`qa-authorize`, y cualquier cambio en `.valmen/approval/` o `.valmen/qa/`.
- Usuario o rol afectado: el PO que autoriza la aprobación automática y la QA por agente desde Mission Control, en ValmenHarness y en SaiOpenCloud.
- Comportamiento actual: la pantalla sí crea autorizaciones (no solo las lista). Tipos, módulos, etapas, impactos y modo son campos de texto libre separados por coma; el PO no sabe qué módulos existen, escribe «todos», el motor lo guarda como el módulo literal `todos` y ninguna autorización cubre a ningún ticket: `approval-eligibility` responde «no lista el módulo WEB (lista todos)».
- Comportamiento esperado: el formulario ofrece casillas con los valores válidos —tipos según el formulario (cuatro para QA, siete para aprobación), etapas `analysis` y `plan`, y los módulos del registro del proyecto elegido—, cada grupo con «seleccionar todos»; lo que se envía es la lista concreta de lo marcado, y una autorización creada con «todos» marcado cubre a cada módulo que el formulario ofreció.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - Los formularios son texto libre: QA en `packages/server/web/index.html:8307-8308` (tipos y módulos) y su envío en `:8322-8330`; aprobación en `packages/server/web/index.html:8387-8392` (tipos, módulos, riesgo, impactos, etapas, modo) y su envío en `:8405-8416`. Ningún dato del registro llega al formulario: el campo «Módulos» nace vacío y sin opciones.
  - El servidor parte el texto por comas sin validar contra nada: `packages/server/src/approval-autorizaciones.ts:17-19` (`lista`) y `:36-41`; `packages/server/src/qa-autorizaciones.ts:17-19` y `:36-37`.
  - El motor normaliza a minúsculas y solo rechaza la lista vacía y el comodín `*`: `packages/engine/src/approval-authorization.ts:169-172` y `packages/engine/src/qa-authorization.ts:144-147`. La palabra «todos» pasa como un módulo más y se guarda como `"modules":["todos"]` (comprobado en `.valmen/approval/authorizations.jsonl:1-2` y `.valmen/qa/authorizations.jsonl:1`, y en los dos archivos equivalentes de SaiOpenCloud).
  - La cobertura compara por pertenencia exacta: `packages/engine/src/approval-authorization.ts:306` y `packages/engine/src/qa-authorization.ts:251` exigen `a.modules.includes(ticket.module.toLowerCase())`, y el motivo de rechazo sale de `packages/engine/src/approval-eligibility.ts:267-268`. Con `["todos"]`, ningún ticket coincide: «todos» no es lista vacía ni comodín, es un módulo inexistente.
  - El comodín está prohibido a propósito («Una autorización declara módulos concretos: ni vacía ni con comodín», `packages/engine/src/approval-authorization.ts:171`): hacer que «todos» cubra los módulos futuros es una ampliación de autoridad (Supuesto 1).
- Hipótesis pendientes: que un módulo escrito en minúsculas por el PO y en mayúsculas en el ticket ya coincide (el motor baja ambos a minúsculas en `:169` y `:306`), por lo que la pantalla puede enviar los módulos tal como los tiene el registro; se confirma con una prueba del plan.
- Consumidores afectados: la vista Configuración (`vistaConfiguracion`, `packages/server/web/index.html:7990`); los endpoints `POST /api/approval/authorizations` y `POST /api/qa/authorizations` (`packages/server/src/server.ts:1852` y `:1864`), que ya aceptan arreglos además de texto (`lista` en `approval-autorizaciones.ts:18-19`); `approval-eligibility`, la aprobación por lote y `qa-agent`, que leen `modules` y no cambian.
- Archivos y flujo investigados: el navegador manda el proyecto elegido en la cabecera `X-Valmen-Project` (`packages/server/web/index.html:2545-2558`), el servidor la convierte en `context.root` y `context.paths` del proyecto autorizado (`packages/server/src/server.ts:2275-2286` y `contextoDeProyecto` en `:299-309`), y con esa raíz crea la autorización (`:1864`). Los módulos reales se pueden leer con `listTickets(paths)` (`packages/engine/src/tickets.ts:174`, campo `module` en `:35`), la misma fuente que ya usa `GET /api/tickets` (`packages/server/src/server.ts:439-447`). Constantes de valores válidos: `TIPOS_APROBABLES`, `IMPACTOS_ADMISIBLES`, `ETAPAS_APROBABLES`, `MODOS_DE_APROBACION` (`packages/engine/src/approval-authorization.ts:25`, `:31`, `:34`, `:37`) y `TIPOS_AUTORIZABLES` (`packages/engine/src/qa-authorization.ts:21`). Módulos por registro: ValmenHarness tiene 25 (ENGINE 64, MC 23, GATE 18, ADAPTER 18, CLI 17, WEB 9…); SaiOpenCloud tiene 42 en `docs/tickets` (`tickets-dir`), con el ruido descrito en el Supuesto 2. No hay pruebas de la pantalla de autorizaciones más allá de `tests/autorizacion-qa-canales.test.ts:95-99`, que lee `index.html` como texto.
- Riesgos y compatibilidad: (1) una casilla «seleccionar todos» en tipos de aprobación marca SYNC, INTEGRATION y AGENT de un clic; el motor ya los admite y la pantalla no amplía lo que el motor permite, pero el riesgo se dice al PO (Supuesto 4 para impactos). (2) Con la opción A, una autorización con «todos» no cubre módulos que nazcan después; el texto de la pantalla debe decirlo. (3) Las autorizaciones existentes con `todos` siguen sin cubrir nada hasta que el PO las revoque y recree (Supuesto 6). (4) El contrato HTTP no cambia de forma: los endpoints ya aceptan arreglos; un endpoint nuevo de solo lectura para las opciones no escribe nada. (5) No se toca `.valmen/approval/` ni `.valmen/qa/` desde el código del ticket ni desde sus pruebas (las pruebas usan raíces temporales).
- Impactos de sync, migración, Docker o despliegue: ninguno; es interfaz de Mission Control y un endpoint de lectura en el servidor local, sin datos sincronizados, sin migraciones y sin imágenes.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Decisión del PO el 2026-10-09: «Recomiendo A, aprueba el plan».
- Alcance: los formularios de creación de «Autorización de QA por agente» y «Aprobación automática de planes» en la vista Configuración pasan a casillas; un endpoint de solo lectura entrega las opciones; el motor rechaza `todos` y `all` como módulo; una clave opcional `authorization-modules` en `.valmen/config.yaml` reemplaza la lista del registro.
- Exclusiones: revocar o recrear autorizaciones existentes (del PO); escribir la lista `authorization-modules` de SaiOpenCloud (configuración de ese proyecto, la decide el PO); riesgo máximo, cupo y vigencia; la CLI `approval-authorize`/`qa-authorize`; cualquier escritura en `.valmen/approval/` o `.valmen/qa/` desde el código o las pruebas del ticket.
- Pasos ordenados:
  1. `packages/adapter/src/config.ts`: nueva `readAuthorizationModules(config)` junto a `readApprovalAuthorizationSources` (`:1149`). Devuelve `null` si la clave `authorization-modules` no existe; falla si es lista vacía o si un nombre no cumple `^[A-Za-z][A-Za-z0-9_-]{0,63}$`. Se exporta desde el índice del paquete. (C4, C5, C6)
  2. `packages/engine/src/discovery.ts`: nueva `authorizationModules(root)` con el mismo patrón que `approvalAuthorizationSources` (`:225-227`). (C4, C5)
  3. `packages/engine/src/authorization-options.ts` (archivo nuevo): `opcionesDeAutorizacion(root, paths)` devuelve `{ source, modules: [{ module, tickets }], approval: { types, stages, modes, impacts }, qa: { types } }`. Con la clave declarada, `source: "config"` y los módulos de la lista con su conteo del registro; sin ella, `source: "registry"` y los módulos de `listTickets(paths)` (`packages/engine/src/tickets.ts:174`) agrupados en mayúsculas y ordenados por número de tickets descendente y luego por nombre. Los tipos, etapas, modos e impactos salen de `TIPOS_APROBABLES`, `ETAPAS_APROBABLES`, `MODOS_DE_APROBACION`, `IMPACTOS_ADMISIBLES` y `TIPOS_AUTORIZABLES`; no escribe nada. Se exporta desde `packages/engine/src/index.ts`. (C1, C2, C3, C7, C8, C9, C10, C11, C12, C13)
  4. `packages/engine/src/approval-authorization.ts:169-172` y `packages/engine/src/qa-authorization.ts:144-147`: después de normalizar, si `modules` contiene `todos` o `all`, falla con «Los módulos `todos` y `all` no existen: elige los módulos en la lista». La comprobación existente de vacía o `*` y su mensaje quedan sin cambios. (C14, C15, C16, C17, C18, C19)
  5. `packages/server/src/autorizaciones-opciones.ts` (archivo nuevo) con `listarOpcionesDeAutorizacion(root, paths)`, y la ruta `GET /api/authorizations/options` en `packages/server/src/server.ts` junto a las de `/api/approval/authorizations` (`:1859-1868`), con `context.root` y `context.paths` del proyecto que ya resolvió `X-Valmen-Project` (`:2275-2286`). Solo GET. (C1, C7, C13)
  6. `packages/server/web/index.html`, vista Configuración (`:8299-8424`): un ayudante `grupoDeCasillas(titulo, opciones, { conTodos, marcadas })` que pinta casillas y, con `conTodos: true`, la casilla «Seleccionar todos». QA: tipos y módulos con `conTodos: true`. Aprobación: tipos, módulos y etapas con `conTodos: true`; impactos con `conTodos: false` y ninguno marcado; modo como `input type="radio"` con `on-approve` marcado. Junto a módulos, el aviso «Seleccionar todos marca los módulos de hoy: un módulo nuevo no queda cubierto». Las opciones se piden con `enviar("GET", "/api/authorizations/options")`; el POST de «Autorizar» envía arreglos con lo marcado (sin la palabra «todos»). Estilos con variables de tema, sin colores a mano. (C25, C26, C27, C28, C29, C30, C36, C37, C38, C39, C40)
  7. `tests/pantalla-autorizaciones.test.ts` (archivo nuevo): raíces temporales con `mkdtempSync`, tickets de prueba y `.valmen/config.yaml` propios; antes y después de la suite compara el sha256 de `.valmen/approval/authorizations.jsonl` y `.valmen/qa/authorizations.jsonl` del repositorio. (C1–C24, C25–C30)
  8. Comprobación: `npx tsc --build tsconfig.build.json` y `npx vitest run` con los archivos de C24 y C31–C34. (C31, C32, C33, C34, C35)
  9. Preparar el navegador para lo visual: `npm run build` y `node packages/cli/dist/main.js serve --port 4317` desde el worktree (declarado en `.claude/launch.json` del worktree y abierto con `preview_start`); antes de tocar el formulario, `javascript_tool` reemplaza `window.fetch` para que todo `POST` a `/api/approval/authorizations` y `/api/qa/authorizations` se guarde en `window.__postsInterceptados` y responda 200 falso sin llegar al servidor; los GET pasan. Ninguna autorización se crea durante la verificación. (C36–C40)
- Impactos declarados: ninguno; sin sincronización, sin migración y sin contenedores. El cambio no amplía autoridad: la pantalla envía al motor la misma forma de datos que hoy y el motor restringe más (paso 4).
- Compatibilidad: los endpoints de creación no cambian de contrato (ya aceptan arreglos, `packages/server/src/approval-autorizaciones.ts:18-19`); sin la clave `authorization-modules` el proyecto ofrece los módulos de su registro; las autorizaciones existentes con `todos` se leen igual y siguen sin cubrir nada hasta que el PO las revoque.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <hash>`; no hay datos ni migraciones que deshacer, y la clave `authorization-modules` es opcional (un proyecto que la haya declarado la ignora al revertir porque el lector deja de existir).

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `opcionesDeAutorizacion` sobre una raíz temporal con tickets de módulos `WEB`, `ENGINE` y `WEB` devuelve `modules` igual a `[{"module":"WEB","tickets":2},{"module":"ENGINE","tickets":1}]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C2. Sin la clave `authorization-modules`, `opcionesDeAutorizacion` devuelve `source` igual a `"registry"`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C3. Con dos raíces temporales distintas, `opcionesDeAutorizacion` de la segunda no incluye ningún módulo que solo existe en la primera.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C4. Con `authorization-modules: [POS, RESTAURANTE]` en el config temporal, `opcionesDeAutorizacion` devuelve `source` igual a `"config"`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C5. Con `authorization-modules: [POS, RESTAURANTE]` y un ticket del módulo `RELLENO` en el registro temporal, `modules` no incluye `RELLENO`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C6. `readAuthorizationModules` con `authorization-modules: []` falla con un mensaje que contiene «no puede estar vacía».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C7. `GET /api/authorizations/options` responde 200 con el cuerpo de `opcionesDeAutorizacion` de la raíz del contexto.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C8. `approval.types` es exactamente `["BUGFIX","IMPROVEMENT","CHORE","FEATURE","SYNC","INTEGRATION","AGENT"]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C9. `qa.types` es exactamente `["BUGFIX","IMPROVEMENT","CHORE","FEATURE"]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C10. `approval.stages` es exactamente `["analysis","plan"]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C11. `approval.modes` es exactamente `["on-approve","reviewer"]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C12. `approval.impacts` es exactamente `["sync_impact","migration_impact","docker_impact"]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C13. Después de `GET /api/authorizations/options` no existe ningún archivo bajo `.valmen/approval/` ni `.valmen/qa/` de la raíz temporal.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C14. `crearAutorizacionDeAprobacion` con `modules: ["todos"]` falla con un mensaje que contiene «elige los módulos en la lista».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C15. `crearAutorizacionDeAprobacion` con `modules: ["ALL"]` falla con un mensaje que contiene «elige los módulos en la lista».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C16. `crearAutorizacionDeAprobacion` con `modules: ["*"]` falla con un mensaje que contiene «ni vacía ni con comodín».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C17. `crearAutorizacion` de QA con `modules: ["Todos"]` falla con un mensaje que contiene «elige los módulos en la lista».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C18. `crearAutorizacion` de QA con `modules: ["*"]` falla con un mensaje que contiene «ni vacía ni con comodín».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C19. Caso de control: `crearAutorizacionDeAprobacion` en raíz temporal con `modules: ["WEB","ENGINE"]` crea la autorización con `modules` igual a `["web","engine"]`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C20. `POST /api/approval/authorizations` en raíz temporal con `modules` como arreglo `["WEB","ENGINE"]` responde 200.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C21. Con la autorización de C19 vigente, la elegibilidad de un ticket FEATURE del módulo `WEB` no contiene «no lista el módulo».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C22. Caso de control: con la autorización de C19 vigente, la elegibilidad de un ticket FEATURE del módulo `GATE` contiene «no lista el módulo GATE».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C23. Una autorización con `modules: ["todos"]` escrita a mano en raíz temporal sigue sin cubrir un ticket del módulo `WEB`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C24. El sha256 de `.valmen/approval/authorizations.jsonl` y de `.valmen/qa/authorizations.jsonl` del repositorio es el mismo antes y después de la suite.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C25. `index.html` no contiene el rótulo «Módulos (separados por coma)».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C26. `index.html` contiene la ruta `/api/authorizations/options`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C27. En `index.html`, el grupo de impactos se construye con `conTodos: false`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C28. En `index.html`, el modo de aprobación se pinta con `type = "radio"`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C29. `index.html` contiene el aviso «un módulo nuevo no queda cubierto».
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C30. El bloque CSS de las casillas de autorización no contiene `#hex` ni `rgb(`.
      <!-- test: npx vitest run tests/pantalla-autorizaciones.test.ts -->
- [x] C31. `tests/autorizacion-qa-canales.test.ts` pasa.
      <!-- test: npx vitest run tests/autorizacion-qa-canales.test.ts -->
- [x] C32. `tests/autorizacion-aprobacion.test.ts` pasa.
      <!-- test: npx vitest run tests/autorizacion-aprobacion.test.ts -->
- [x] C33. `tests/elegibilidad-aprobacion.test.ts` pasa.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C34. `tests/autorizacion-qa.test.ts` pasa.
      <!-- test: npx vitest run tests/autorizacion-qa.test.ts -->
- [x] C35. El monorepo compila sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C36. En el formulario de aprobación, tipos, módulos y etapas se muestran como casillas, cada grupo con «Seleccionar todos».
      <!-- verify: manual -->
- [x] C37. En el formulario de QA por agente, tipos y módulos se muestran como casillas, cada grupo con «Seleccionar todos».
      <!-- verify: manual -->
- [x] C38. Con «Seleccionar todos» marcado en módulos, el POST interceptado por el `fetch` parcheado lleva en `modules` cada módulo ofrecido y no lleva «todos».
      <!-- verify: manual -->
- [x] C39. Al cambiar de proyecto en la cabecera, la lista de módulos del formulario pasa a la del proyecto elegido.
      <!-- verify: manual -->
- [x] C40. Las casillas, el radio de modo y el aviso se leen bien en modo oscuro.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Los nueve pasos del plan aprobado, sin salir de su alcance:

1. `packages/adapter/src/config.ts`: `readAuthorizationModules` (null sin clave; falla si vacía o nombre inválido).
2. `packages/engine/src/discovery.ts`: `authorizationModules(root)`.
3. `packages/engine/src/authorization-options.ts` (nuevo, exportado en el índice): `opcionesDeAutorizacion`, solo lectura.
4. `approval-authorization.ts` y `qa-authorization.ts`: rechazan `todos` y `all` con «elige los módulos en la lista».
5. `packages/server/src/autorizaciones-opciones.ts` (nuevo) y `GET /api/authorizations/options` en `server.ts`.
6. `packages/server/web/index.html`: `grupoDeCasillas`, formularios de QA y de aprobación con casillas, radio de modo, aviso de módulos y CSS con tokens del tema (bloque entre `autorizacion-casillas:inicio` y `:fin`).
7. `tests/pantalla-autorizaciones.test.ts` (nuevo, 24 pruebas, raíces temporales y sha256 de C24).
8. Compilación y pruebas de C31 a C35.
9. Verificación visual con el servidor del worktree y el `fetch` parcheado.

Fuera del plan, necesario por el cambio: la interfaz ahora pide `/api/authorizations/options`, así que se agregó esa respuesta simulada a `scripts/verificar-interfaz.mjs` y a `tests/revocar-autorizacion-pantalla.test.ts`; sin ella esas dos suites (que ejecutan la interfaz con respuestas falsas) fallaban con «reading 'types'».

Ni el código ni las pruebas escriben `.valmen/approval/` ni `.valmen/qa/` del repositorio. Rollback: `git revert` del commit del ticket.

## Pruebas

Directorio de ejecución: raíz del worktree (o del repositorio tras integrar). Requisito: Node 24 y `npm install`.

1. `npx tsc --build tsconfig.build.json` — sin salida y código 0 (C35).
2. `npx vitest run tests/pantalla-autorizaciones.test.ts` — 24 pruebas pasan (C1 a C30).
3. `npx vitest run tests/autorizacion-qa-canales.test.ts tests/autorizacion-aprobacion.test.ts tests/elegibilidad-aprobacion.test.ts tests/autorizacion-qa.test.ts` — pasan (C31 a C34).
4. `npm run build && npx vitest run tests/interfaz-ejecutable.test.ts tests/revocar-autorizacion-pantalla.test.ts tests/autorizacion-aprobacion-canales.test.ts tests/estaticos-web.test.ts tests/vista-*.test.ts tests/linea-de-tiempo-interfaz.test.ts` — pasan (regresión de la interfaz).

Resultado de la sesión de implementación: tsc código 0; 14 archivos y 265 pruebas pasan.

Validaciones manuales (C36 a C40), medidas en el navegador con `node packages/cli/dist/main.js serve --port 4317` desde el worktree y `window.fetch` reemplazado para que todo POST a `/api/approval/authorizations` y `/api/qa/authorizations` se guardara en `window.__postsInterceptados` sin llegar al servidor (no se creó ninguna autorización):

- C36 y C37: medido con el DOM; QA muestra Tipos y Módulos como casillas, cada uno con «Seleccionar todos»; aprobación muestra Tipos, Módulos y Etapas con «Seleccionar todos», Impactos sin él y Modo como radio.
- C38: con «Seleccionar todos» en módulos de aprobación, el POST interceptado llevó los 25 módulos ofrecidos, en el mismo orden, y ningún «todos».
- C39: al elegir SaiOpenCloud en la cabecera, las casillas pasaron de 25 a 42 módulos y coincidieron con la respuesta de `/api/authorizations/options` de ese proyecto.
- C40: visto en captura y con estilos calculados en modo oscuro (casillas con `accent-color` del tema, aviso en el color de alerta del tema); también se miró en claro. Un juicio de legibilidad sigue siendo de una persona.

Para repetirlo: abrir `http://127.0.0.1:4317/#/configuracion`, parchear `fetch` como arriba y operar los formularios.

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
    "notes": "Sesión del subagente de implementación (sonnet) de este ticket; el cliente no expone los números de la sesión al subagente, por eso no se declaran cifras.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de implementación sin agregado de la sesión",
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
    "at": "2026-10-09T03:27:00.110Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T05:39:55.321Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T13:10:36.111Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T13:27:40.135Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009-plan-2, canal cli, decidida 2026-10-09T13:27:40.128Z): PO: \"Recomiendo A, aprueba el plan\" (respuesta a la REVIEW del plan, con la cascada real: 22 criterios en banda, media 0.857)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T13:27:40.460Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A, aprueba el plan\",\"planHash\":\"sha256:c9bc2ee3767894407f502ba9892731f471a40a2e81ab23b53aa3defb4bfd3ed2\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T13:27:40.794Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:c9bc2ee3767894407f502ba9892731f471a40a2e81ab23b53aa3defb4bfd3ed2."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T13:27:40.794Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T13:28:10.343Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T13:35:42.084Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T13:37:00.356Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
