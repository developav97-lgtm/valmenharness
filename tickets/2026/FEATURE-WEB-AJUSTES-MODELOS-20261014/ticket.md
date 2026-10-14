---
schema_version: 2
id: FEATURE-WEB-AJUSTES-MODELOS-20261014
title: Vista Modelos con perfil activo, roles agrupados y aviso de cliente
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
created: 2026-10-14
updated: 2026-10-14
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-AJUSTES-MODELOS-20261014

## Solicitud original

Parte del sprint: Ajustes rediseñados: Modelos con perfil activo y roles agrupados, cambio de perfil con vista previa, Proveedores y Proyecto por bloques.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-AJU-001: Modelos DEBE abrir con el perfil activo como primer bloque
- R-AJU-002: Modelos DEBE agrupar los roles en El agente, Coordinación y Compuertas y revisión, con el origen de cada modelo
- R-AJU-003: Modelos DEBE avisar cuando el perfil no se aplica por falta de cliente declarado, con la corrección en el mismo aviso
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Modelos DEBE abrir con el perfil activo como primer bloque Modelos DEBE agrupar los roles en El agente, Coordinación y Compuertas y revisión, con el origen de cada modelo Modelos DEBE avisar cuando el perfil no se aplica por falta de cliente declarado, con la corrección en el mismo aviso
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/modelos.html` — Boceto aprobado por el PO el 2026-10-14: Ajustes › Modelos (HTML autónomo, el original) (sha256 a130ffc14411…)
- `.valmen/features/rediseno-mission-control/assets/modelos.png` — Captura a 1440 px del boceto aprobado: Ajustes › Modelos (sha256 3d76bb4569ec…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- «Declarar» el cliente: el código no guarda un cliente declarado (solo la opción `--cliente` por sesión). ¿Qué escribe «Declarar»? Decidido por el agente en D-001 (solo la pantalla y la corrección de la sesión, sin archivos); lo ratifica la persona antes de cerrar.
- La pantalla «Cambiar de perfil» (`#/modelos/perfil`) todavía no existe. ¿A dónde lleva el botón? Decidido en D-002; lo ratifica la persona antes de cerrar.

## Descripción funcional

- Alcance: la vista Ajustes › Modelos de Mission Control (`vistaModelos()` y sus secciones `seccionPerfiles()` y `seccionModeloPorFase()` en `packages/server/web/index.html`, con sus estilos): un primer bloque con el perfil activo, el aviso de cliente sin declarar con su corrección, los roles agrupados en «El agente», «Coordinación» y «Compuertas y revisión» con el origen de cada modelo, y lo que hoy es la pantalla entera (perfiles, preset, modelo por rol con sus diferencias, modelo por fase con lo usado) plegado en «Avanzado». Su parte de R-MARCO-006: la vista funciona a 390 px. No cambia el servidor, la API, el menú ni otras vistas; la pantalla «Cambiar de perfil» (`#/modelos/perfil`, R-AJU-004) es de FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014, que depende de este ticket.
- Usuario o rol afectado: la persona que opera Mission Control (el PO o quien configure un proyecto) y quiere saber con qué modelo trabaja cada parte del harness, en escritorio y en el celular, en modo oscuro y claro.
- Comportamiento actual: Modelos abre con una nota desactualizada («Son cuatro…» roles), sigue con la lista plana de todos los perfiles con sus botones y dos o más desplegables de elección, una tabla «Modelo por fase» con lo usado, los botones de preset y una tabla «Modelo por rol» con los trece roles en el orden de `ROLES`, todos con selectores de proveedor, modelo y esfuerzo; el origen se escribe como texto («definido en este proyecto», «perfil X (proyecto)», «del preset balanced»). El perfil activo no tiene un bloque propio, los roles no se agrupan y nada avisa en la vista que, sin cliente declarado, las fases del agente usan el modelo de la sesión.
- Comportamiento esperado: tal como `.valmen/features/rediseno-mission-control/assets/modelos.html` y `modelos.png` (abiertos y revisados en este análisis): encabezado «Ajustes · Modelos», título «Qué modelo hace cada trabajo» y su bajada; tarjeta lila «Perfil activo» con id, origen (incorporado o del proyecto), descripción, las marcas «elegido para el proyecto» y «elegido para <cliente>», las acciones «Cambiar de perfil» y «Duplicar y editar», y la regla de precedencia «cambiado aquí» gana a «del perfil», que gana a «preset base»; aviso ámbar «Las fases del agente usan el modelo de la sesión.» con el selector «Cliente» y el botón «Declarar»; «El agente» con cuatro tarjetas (Análisis, Plan, Implementación, Verificación) con modelo, esfuerzo y origen —una fase definida en el proyecto con borde ámbar, «cambiado aquí», «El perfil diría <modelo>» y «Volver al perfil»—; «Coordinación» (Orquestador, Arquitecto, Especificación de UI) con modelo, esfuerzo y origen; «Compuertas y revisión» (Evaluador de compuertas, Verificador, Juez de respaldo, Productor, Revisor, Escalada) con modelo, esfuerzo y proveedor; «Avanzado» plegado. Las cifras del boceto son de ejemplo: se compara estructura, jerarquía, colores por quién decide y textos fijos.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es funcionalidad nueva sobre una vista que no la tiene; lo comprobado leyendo el código:
  - `vistaModelos()` (`packages/server/web/index.html:7883`) pide `GET /api/routing` (`:7887`), pinta la nota de los «cuatro» roles (`:7908-7920`), llama a `seccionPerfiles(cont, catalogo)` y `seccionModeloPorFase(cont)` (`:7922-7923`), y sigue con «Preset» (`:7924`), «Modelo por rol» (`:7971`) con su `ORIGEN` en texto (`:8045`), los roles explícitos (`:8093`), la vista previa del archivo con `POST /api/routing/preview` (`:8109`) y el guardado con `PUT /api/routing` (`:8162`). No hay bloque de perfil activo ni agrupación: los trece roles salen en el orden de `ROLES` (`packages/adapter/src/routing.ts:84-196`).
  - `seccionPerfiles()` (`index.html:8311`) pide `GET /api/perfiles` y pinta una `.fila-perfil` por perfil con las marcas «elegido para el proyecto» / «elegido para <ejecutor>» (`:8453`), los selectores «Perfil del proyecto» y «Perfil de <ejecutor>» (`:8492-8499`) que llaman a `PUT /api/perfiles/seleccion` (`elegir`, `:8338`) y el editor `abrirEditor(base, editando)` (`:8356`), local a la función: «Duplicar y editar» necesita que la sección lo exponga.
  - `seccionModeloPorFase()` (`index.html:8200`) pide `GET /api/modelos/fases` y solo pinta `datos.aviso` (`:8220`). El servidor lo manda únicamente cuando no hay fases: `aviso: sesion.fases.length === 0 ? sesion.aviso : null` (`packages/server/src/server.ts:1765`). Sin `?ejecutor=`, `fasesDeSesion()` resuelve con `cliente = null` (`packages/adapter/src/routing.ts:1290`), marca cada fase con «sin cliente declarado: la fase usa el modelo de la sesión» (`:1316`) y arma el aviso general «No se declaró el cliente de la sesión…» (`:1352`), pero ninguno llega a la pantalla con fases: la respuesta solo dice `ejecutor: null` (`server.ts:1762`). Por eso hoy la vista nunca avisa; R-AJU-003 se apoya en `ejecutor === null`.
  - «Declarar el cliente» no existe como dato persistido: el cliente de la sesión es la opción `--cliente` de `valmen resume` y `valmen journey brief` (`packages/cli/src/command-table.ts:106`, `:350`; `packages/cli/src/main.ts:189`), y `GET /api/modelos/fases?ejecutor=` lo acepta solo para resolver esa respuesta (`server.ts:1709-1724`). No hay clave en `.valmen/config.yaml` ni en `.valmen/profiles.yaml` que lo guarde (`profiles.yaml` solo tiene `seleccion.proyecto` y `seleccion.ejecutores`, `routing.ts:855-858`).
  - Los datos que el boceto necesita ya llegan: `GET /api/routing` devuelve los trece roles resueltos con `source` (`proyecto`, `perfil`, `preset`, `sistema`, `sin-asignar`), `perfil: { id, alcance }` cuando sale del perfil y `anulaPerfil` cuando el proyecto pisa un rol que el perfil declara (`routing.ts:1036-1060`, vía `checkRouting`, `packages/server/src/routing.ts:257-298`); `GET /api/perfiles` devuelve los perfiles con sus `roles`, `origen` y `description`, y la `seleccion` (`server.ts:1678-1702`), de donde sale «El perfil diría <modelo>». Los perfiles no tienen un nombre legible aparte del id (`PerfilDeModelos`, `routing.ts:512-560`).
  - En este proyecto `.valmen/routing.yaml` define en el proyecto los cuatro `agent-*`, `architect`, `escalation`, `gate-judge`, `orchestrator`, `producer`, `reviewer` y `ui-specs`, varios con el mismo modelo que el perfil `claude-code-completo` elegido: con datos reales casi todas las fases saldrían «cambiado aquí» aunque el modelo coincida.
  - `#/modelos/perfil` hoy resuelve a `vistaModelos()` porque `navegar()` parte la ruta y solo mira `nombre` (`index.html:9675`, `:9713`); la vista de cambio de perfil todavía no existe.
- Hipótesis pendientes:
  - H1 — Qué hace «Declarar» sin un cliente persistido: la opción conservadora es que declare el cliente para esta pantalla (vuelve a pedir `GET /api/modelos/fases?ejecutor=<id>`, recordado en `localStorage` del navegador, sin escribir archivos) y que el mismo aviso muestre la corrección de la sesión, `valmen resume --cliente <id>`; un cliente por defecto persistido sería un cambio de adapter, CLI y servidor que no pide este ticket. Se decide en el plan con `valmen agent-decision`.
  - H2 — «Cambiar de perfil» antes de que exista `#/modelos/perfil`: la opción conservadora es abrir «Avanzado» y llevar el foco al selector «Perfil del proyecto», que ya cambia el perfil, y dejar el enlace a la ruta nueva para FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014. Se decide en el plan.
  - H3 — Cuándo es «cambiado aquí»: `source === "proyecto"` es la verdad del resolvedor (el proyecto gana al perfil, `routing.ts:1036`), aunque el modelo coincida; la opción conservadora es marcarlo igual y decir «El perfil diría lo mismo» cuando coinciden, para no ocultar una definición que sí impide que el perfil cambie esa fase. Se decide en el plan.
  - H4 — «Volver al perfil» quita la definición de la fase de `.valmen/routing.yaml` con el mismo camino que «Modelo por rol» (`POST /api/routing/preview` con los roles explícitos menos ese, diferencias a la vista y `PUT /api/routing` al confirmar). Los explícitos se toman de los roles que el texto guardado declara bajo `roles:`, no de `source === "proyecto"`, porque `ui-specs` también puede venir de `playwright:` (`routing.ts:1018-1027`) y escribirlo sería un cambio que nadie pidió. Se confirma en el plan.
  - H5 — «Cambiar solo esta fase» (boceto) no está en los requisitos; lo conservador es que lleve al rol en «Modelo por rol» dentro de «Avanzado», que ya edita y guarda con diferencias, en vez de un segundo editor. Se decide en el plan.
- Consumidores afectados:
  - `tests/perfiles-pantalla.test.ts` (14 pruebas: `.fila-perfil`, «Crear a partir de este», «Editar», selectores «Perfil del proyecto» y «Perfil de hermes», «Modelo por fase» con sus filas `TR` con `.fase-nombre`, `Ejecutor`, avisos y «Modelo por rol»): abre `#/modelos` y tiene que seguir en verde sin editarse; por eso lo de hoy se conserva entero dentro de «Avanzado» en vez de borrarse.
  - `tests/interfaz-ejecutable.test.ts` con `scripts/verificar-interfaz.mjs` (`VISTAS` incluye `["modelos", "#/modelos"]`; su respuesta simulada de `/api/modelos/fases` es `{}` y la de `/api/perfiles` trae `roles: {}`): la vista no puede caerse con datos incompletos.
  - `tests/tema-tokens.test.ts` C8 (ningún color a mano en `index.html`) y `tests/menu-grupos.test.ts` (la línea del perfil del menú lleva a `#/modelos`).
  - FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014, que reemplazará la acción «Cambiar de perfil», y dos tickets en paralelo que también editan `index.html`: este cambio se limita a `vistaModelos()`, sus dos secciones y un bloque de estilos propio.
  - La copia publicada `packages/cli/dist/web/index.html` (la que sirve el servidor) se regenera con `npm run build`.
- Archivos y flujo investigados: `packages/server/web/index.html` (tokens `:77-151`, corte `@media (max-width: 767px)` `:501`, estilos de perfiles y fases `:1107-1132`, `:2383-2450`, `api()` `:2885`, `el()` `:2946`, `catalogoDeModelos()` `:7652`, `selectorDeModelo()` `:7689`, `vistaModelos()` `:7883-8186`, `seccionModeloPorFase()` `:8200-8309`, `seccionPerfiles()` `:8311-8500`, `marcarPerfilActivo()` `:9573`, `navegar()` `:9671-9733`); `packages/server/src/server.ts:1601-1870`; `packages/server/src/routing.ts:250-304`; `packages/adapter/src/routing.ts` (`ROLES` `:84`, `PERFILES_INCORPORADOS` `:512`, `EJECUTORES_CON_PERFIL` `:852`, resolución `:1000-1062`, `fasesDeSesion()` `:1286-1356`); `.valmen/routing.yaml`, `.valmen/profiles.yaml`; `tests/perfiles-pantalla.test.ts`, `tests/menu-grupos.test.ts`, `scripts/verificar-interfaz.mjs`; la spec `.valmen/features/rediseno-mission-control/spec/s2-ajustes/spec.md` y `design.md`. `buscar_memoria` («vista Modelos perfil activo fases cliente declarado web») no devolvió nada sobre esta vista (AP-003, AP-009, AP-014 tratan de compuertas). Línea base: `npx vitest run tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts` → 120 pruebas en verde.
- Riesgos y compatibilidad:
  - Borrar lo que hoy hace la pantalla (elegir por ejecutor, crear y editar perfiles, preset, modelo por rol, lo usado por fase) dejaría sin interfaz funciones vigentes de R-PERF-002/005/006 y pondría en rojo `tests/perfiles-pantalla.test.ts`; se conserva plegado en «Avanzado».
  - «Volver al perfil» escribe `.valmen/routing.yaml`: sin mostrar las diferencias antes, un clic cambiaría el modelo de una fase sin que la persona vea qué; el escenario exige confirmarlas.
  - Un aviso que diga «declarado» sin que la sesión lo esté sería falso: la corrección tiene que nombrar el comando de la sesión.
  - Celular: cuatro tarjetas y tablas de cuatro columnas no caben en 390 px; necesitan su corte por debajo de 768 px sin desplazamiento horizontal.
  - Sin colores a mano (C8 de `tests/tema-tokens.test.ts`): ámbar y lila salen de `--persona`/`--alerta-suave` y `--modelo`/`--modelo-suave`.
  - Conflicto de integración: otros dos tickets editan `index.html` a la vez; no se mueve ni reformatea código fuera de la vista.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambia solo el cliente estático de Mission Control: sin sincronización, sin migraciones, sin contenedores y sin cambios del servidor ni de la API.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: `vistaModelos()`, `seccionPerfiles()` y `seccionModeloPorFase()` de `packages/server/web/index.html`, un bloque de estilos propio de la vista y la prueba nueva `tests/vista-modelos-ajustes.test.ts`. Exclusiones: el servidor y la API (no cambian), el menú y `navegar()`, la pantalla `#/modelos/perfil` (FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014) y cualquier código de otras vistas: no se mueve ni se reformatea nada fuera de estas tres funciones, porque otros dos tickets editan el mismo archivo a la vez.
- Decisiones registradas: D-001 («Declarar» declara el cliente para la pantalla y muestra `valmen resume --cliente <id>`, sin escribir archivos), D-002 («Cambiar de perfil» abre «Avanzado» con el foco en «Perfil del proyecto» hasta que exista `#/modelos/perfil`), D-003 («cambiado aquí» siempre que `source` sea `proyecto`, con «El perfil diría lo mismo» si coincide), D-004 («Volver al perfil» toma los roles declarados en el texto guardado y escribe solo tras confirmar las diferencias) y D-005 («Cambiar solo esta fase» lleva al rol en «Modelo por rol»).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Sin bloque de perfil activo (`index.html:7883-7923`, `:8453`): paso 3 (C1, C2, C3, C4, C5).
  - Roles sin agrupar en el orden de `ROLES` (`index.html:7971`, `routing.ts:84-196`): paso 4 (C6, C7, C8, C9, C12, C13).
  - El aviso de cliente nunca llega con fases (`server.ts:1765`, `routing.ts:1316`, `:1352`): paso 5 sobre `ejecutor === null` (C15, C16), con H1 resuelta por D-001.
  - «Declarar» sin dato persistido (H1): D-001, paso 5. «Cambiar de perfil» sin ruta (H2, `index.html:9675`, `:9713`): D-002, paso 3. «Cambiado aquí» con el mismo modelo (H3): D-003, paso 4. Roles explícitos y `playwright:` (H4): D-004, paso 4 (C10, C11). «Cambiar solo esta fase» (H5): D-005, paso 4.
  - `abrirEditor` local a `seccionPerfiles()` (`index.html:8356`): paso 2 (C3).
  - Lo de hoy sin interfaz si se borra y `tests/perfiles-pantalla.test.ts` en rojo: paso 2, todo dentro de «Avanzado» (C14, C20).
  - Celular sin corte para tarjetas y tablas: paso 6 (C17, C18).
  - Consumidores (`perfiles-pantalla`, `interfaz-ejecutable`, `tema-tokens` C7, `menu-grupos`, copia publicada): pasos 7 y 8 (C20).
- Pasos ordenados:
  1. Escribir `tests/vista-modelos-ajustes.test.ts` y verlo en rojo con `npx vitest run tests/vista-modelos-ajustes.test.ts`, antes de tocar `index.html`. Ejecuta `#/modelos` con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs` y respuestas simuladas de `/api/routing` (los trece roles con `source` y `perfil`), `/api/perfiles` (perfiles incorporados con `seleccion: { proyecto: "claude-code-completo", ejecutores: { claude: "claude-code-completo" } }`), `/api/modelos/fases` (`ejecutor: null` y con `?ejecutor=`) y `/api/routing/preview`, y registra las llamadas: orden de los bloques y sus textos (C1, C2, C5, C6), tarjetas de fase y sus marcas (C7, C8, C9), «Volver al perfil» y su confirmación (C10, C11), filas de Coordinación y Compuertas (C12, C13), «Avanzado» (C14), aviso y «Declarar» (C15, C16), botones de la tarjeta (C3, C4); y lectura del HTML como texto para el corte por debajo de 768 px (C17).
  2. `index.html`, `vistaModelos()`: en lugar de la nota de los «cuatro» roles, el encabezado «Ajustes · Modelos», el título «Qué modelo hace cada trabajo» y la bajada del boceto; pide `GET /api/perfiles` y `GET /api/modelos/fases` además de `GET /api/routing` (con `try/catch` y valores por defecto: la vista no se cae con `{}`); pinta los bloques nuevos y después un `<details class="avanzado-modelos">` plegado con el resumen «Avanzado: perfiles, preset base y archivo de configuración», dentro del cual van, sin cambios de comportamiento, `seccionPerfiles(avanzado, catalogo)`, `seccionModeloPorFase(avanzado)`, «Preset», «Modelo por rol», el aviso de Jev, las diferencias y la barra de guardado. `seccionPerfiles()` devuelve `{ abrirEditor, selectorDelProyecto }` para que la tarjeta los use (C3, C4, C14).
  3. `index.html`, función nueva `bloquePerfilActivo(datosPerfiles, rutas, acciones)` llamada desde `vistaModelos()`: `<section aria-label="Perfil activo" class="perfil-activo-modelos">` con el rótulo «Perfil activo», el id (como título, porque el perfil no tiene nombre aparte), «<id> · incorporado|del proyecto», la descripción, las marcas «elegido para el proyecto» y «elegido para <cliente>» (tabla `claude` → «Claude Code», `codex` → «Codex», `opencode` → «OpenCode», `hermes` → «Hermes»), los botones «Cambiar de perfil» (D-002: abre `details.open = true` y enfoca el selector «Perfil del proyecto») y «Duplicar y editar» (abre «Avanzado» y llama a `abrirEditor(perfil, false)`), y la línea «Cómo se decide cada modelo:» con las marcas «cambiado aquí» (ámbar), «del perfil» (lila) y «preset base» (tenue) separadas por «gana a». Sin perfil elegido: «sin perfil» y solo «Cambiar de perfil» (C1, C2, C3, C4, C5).
  4. `index.html`, funciones nuevas `grupoDelAgente(rutas, perfilActivo, routing)` y `tablaDeRoles(titulo, bajada, filas, columnaFinal)`: «El agente» con «las cuatro fases de un ticket» y una `<article class="tarjeta-fase">` por `agent-analysis`, `agent-plan`, `agent-implementation`, `agent-verification` (Análisis 1, Plan 2, Implementación 3, Verificación 4) con modelo, «esfuerzo <auto|alto|medio|bajo>» y la marca de origen (`proyecto` → «cambiado aquí» y clase `cambiada`, `perfil` → «del perfil», `preset`/`sistema` → «preset base», `sin-asignar` → «sin asignar»); una cambiada dice «El perfil diría <modelo>» con el modelo de `perfil.roles[rol]`, o «El perfil diría lo mismo» si coincide (D-003), y ofrece «Volver al perfil»; las demás ofrecen «Cambiar solo esta fase», que abre «Avanzado» y enfoca el selector de ese rol en «Modelo por rol» (D-005). «Volver al perfil» (D-004): roles explícitos = los nombres declarados bajo `roles:` en `routing.text` (regex por línea `^  <rol>:`) menos esa fase, con su proveedor, modelo y esfuerzo resueltos; `POST /api/routing/preview` con `{ preset, roles }`, pinta las diferencias en la tarjeta con «Confirmar» y «Cancelar», y solo «Confirmar» manda `PUT /api/routing` con `{ text }` y vuelve a pintar la vista; si la vista previa no es `ok`, muestra el error y no ofrece confirmar. «Coordinación» («reparte el trabajo y diseña antes de programar») con Orquestador, Arquitecto, Especificación de UI y su bajada del boceto, columnas Trabajo, Modelo, Esfuerzo, Origen; «Compuertas y revisión» («el modelo responde, el código decide») con Evaluador de compuertas, Verificador, Juez de respaldo, Productor, Revisor, Escalada, columnas Trabajo, Modelo, Esfuerzo, Proveedor (C6-C13).
  5. `index.html`, función nueva `avisoDeCliente(fases, ejecutores, alDeclarar)`: si `GET /api/modelos/fases` trae `ejecutor` nulo o ausente y no hay cliente recordado, un `<div role="status" class="aviso-cliente">` ámbar entre el perfil y «El agente» con «Las fases del agente usan el modelo de la sesión.» y «Falta declarar con qué cliente trabajas; sin eso, el perfil no se aplica.», la etiqueta «Cliente» con un `<select>` de `ejecutores` (preseleccionado el primero que tenga perfil elegido, si no `claude`) y el botón «Declarar». «Declarar» (D-001) guarda el id en `localStorage` (`valmen-cliente-modelos`, con `try/catch`), pide `GET /api/modelos/fases?ejecutor=<id>` y cambia el aviso por la línea «Cliente declarado en esta pantalla: <cliente>. En la sesión: valmen resume --cliente <id>» con «Cambiar»; con un cliente recordado la vista pide directamente con `?ejecutor=` (C15, C16).
  6. `index.html`, estilos de la vista con tokens (`--modelo`, `--modelo-suave`, `--persona`, `--alerta-suave`, `--panel`, `--borde`, `--tenue`, `--mono`, `--fuente-titulo`), sin colores a mano: tarjeta del perfil, marcas, aviso, rejilla de cuatro tarjetas (`repeat(4, minmax(0, 1fr))`), tabla de roles en rejilla de cuatro columnas y `details`. Dentro de `@media (max-width: 767px)` un bloque propio: tarjetas en una columna, filas de tabla apiladas con la cabecera oculta, acciones del perfil debajo del texto, aviso en columna y `overflow-wrap: anywhere` en los ids de modelo (C17, C18).
  7. `npm run build` para que `packages/cli/dist/web/index.html` coincida con la fuente (C20).
  8. Regresión: `npx vitest run tests/vista-modelos-ajustes.test.ts tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts` y `node scripts/verificar-interfaz.mjs`; si una prueba existente se pone en rojo no se edita: se detiene y se reporta en el ticket (C20).
  9. Verificación en el navegador con `node packages/cli/dist/main.js serve` desde el worktree, `#/modelos`: a 1440 px en modo oscuro contra `.valmen/features/rediseno-mission-control/assets/modelos.png` y `modelos.html` (estructura, jerarquía, colores por quién decide y textos fijos) y en modo claro (C19); a 390 px sin desplazamiento horizontal en los dos modos (C18); sin pulsar «Confirmar» de «Volver al perfil» sobre el `routing.yaml` real. Capturas como evidencia del ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 560 líneas (unas 300 de producción en `index.html` —unas 220 de JavaScript y 80 de estilos— y unas 260 de pruebas); 20 criterios.
- Si excede el tope: no excede el tope (`delivery-budget: 600`; 20 afirmaciones). Si la implementación pasa de 600 líneas, sigue: los tres requisitos pintan la misma vista con los mismos datos (`/api/routing`, `/api/perfiles`, `/api/modelos/fases`) y no hay un corte que deje a cada parte con su código y sus pruebas sin pisar las mismas líneas de `vistaModelos()`.
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni API que deshacer. La clave `valmen-cliente-modelos` del navegador queda sin uso y no afecta a nada.

## Criterios de aceptación

- [x] C1 (R-AJU-001): el primer bloque de Modelos es la sección «Perfil activo» con el id del perfil elegido para el proyecto
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C2 (R-AJU-001): con `claude-code-completo` elegido para el proyecto, también para claude, la tarjeta lleva sus dos marcas de elección, «elegido para el proyecto», «elegido para Claude Code»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C3 (R-AJU-001): «Duplicar y editar» abre el editor «Nuevo perfil a partir de <id>» del perfil activo
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C4 (R-AJU-001): «Cambiar de perfil» abre «Avanzado» con el foco en el selector «Perfil del proyecto»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C5 (R-AJU-001): la línea de precedencia ordena las marcas «cambiado aquí», «del perfil», «preset base»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C6 (R-AJU-002): después del perfil, los grupos siguen el orden «El agente», «Coordinación», «Compuertas y revisión»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C7 (R-AJU-002): «El agente» tiene una tarjeta por fase («Análisis», «Plan», «Implementación», «Verificación») con su modelo, esfuerzo, origen
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C8 (R-AJU-002): una fase definida en el proyecto con otro modelo que el perfil se marca «cambiado aquí» junto a «El perfil diría <modelo>», «Volver al perfil»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C9 (R-AJU-002): una fase que sale del perfil se marca «del perfil»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C10 (R-AJU-002): «Volver al perfil» muestra las diferencias de la vista previa sin esa fase antes de escribir el archivo
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C11 (R-AJU-002): «Confirmar» las diferencias manda `PUT /api/routing` con el texto de la vista previa
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C12 (R-AJU-002): «Coordinación» lista «Orquestador», «Arquitecto», «Especificación de UI» con el origen de cada modelo
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C13 (R-AJU-002): «Compuertas y revisión» lista los seis roles de evaluación con su proveedor
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C14 (R-AJU-002): «Avanzado» queda plegado al abrir la vista, con lo que hoy hace la pantalla dentro
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C15 (R-AJU-003): sin cliente declarado, bajo el perfil aparece el aviso «Las fases del agente usan el modelo de la sesión» con el selector «Cliente», el botón «Declarar»
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C16 (R-AJU-003): «Declarar» cambia el aviso por la corrección de la sesión `valmen resume --cliente <id>`
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C17 (R-MARCO-006): por debajo de 768 px la vista Modelos pasa a una sola columna
      <!-- test: npx vitest run tests/vista-modelos-ajustes.test.ts -->
- [x] C18 (R-MARCO-006): a 390 px la vista Modelos no tiene desplazamiento horizontal en modo oscuro ni en claro
      <!-- verify: manual -->
- [x] C19 (R-AJU-002): a 1440 px la vista coincide con `modelos.png` en estructura, jerarquía, colores por quién decide, textos fijos, en los dos modos
      <!-- verify: manual -->
- [x] C20 (R-AJU-002): las pruebas existentes de la interfaz siguen en verde sin editarse
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (FEATURE de tres requisitos sobre la misma vista), plan aprobado por la autorización POLITICA-POR-DEFECTO.
- Paso 1 — `tests/vista-modelos-ajustes.test.ts` (nuevo, 10 casos, una tabla por requisito): escrito antes de tocar `index.html` y visto en rojo, 10 de 10 (EVIDENCE-001).
- Paso 2 — `vistaModelos()`: la nota de los «cuatro» roles se reemplaza por el encabezado del boceto; lo de hoy (Perfiles, Modelo por fase, Preset, Modelo por rol, diferencias y barra de guardado) va sin cambios de comportamiento dentro de `<details class="avanzado-modelos">`, plegado. `seccionPerfiles()` devuelve `{ datos, abrirEditor, selectorDelProyecto }`; el bucle de «Modelo por rol» guarda el control de cada rol en `controlDeRol` para D-005.
- Paso 3 — `pintarResumenDeModelos()`: tarjeta «Perfil activo» (id, incorporado/del proyecto, descripción, marcas «elegido para el proyecto» y «elegido para <cliente>», «Cambiar de perfil» según D-002, «Duplicar y editar» con `abrirEditor`) y la línea de precedencia con `marcaDeOrigen()`.
- Paso 4 — `grupoDelAgente()` (cuatro `article.tarjeta-fase`, «cambiado aquí» en ámbar con «El perfil diría…» y «Volver al perfil», D-003; «Cambiar solo esta fase» según D-005), `previsualizarVolver()` (roles declarados en el texto guardado menos la fase, `POST /api/routing/preview`, diferencias con «Confirmar»/«Cancelar», `PUT /api/routing` solo al confirmar, D-004) y `tablaDeRoles()` para Coordinación (origen) y Compuertas y revisión (proveedor).
- Paso 5 — `pintarAvisoDeCliente()`: aviso ámbar con «Cliente» y «Declarar» cuando `GET /api/modelos/fases` trae `ejecutor` nulo; «Declarar» guarda `valmen-cliente-modelos` en `localStorage`, pide `?ejecutor=<id>` y muestra `valmen resume --cliente <id>` con «Cambiar» (D-001: no escribe archivos).
- Paso 6 — estilos propios con tokens tras los de «modelo por fase»: rejilla de cuatro tarjetas (dos por debajo de 1100 px) y, en `@media (max-width: 767px)`, una columna para tarjetas y filas de roles con rótulos `data-rotulo`. Los `h2` de la vista anulan las mayúsculas del `h2` global para coincidir con el boceto.
- Paso 7 — `npm run build`: `packages/cli/dist/web/index.html` igual a la fuente.
- Ninguna prueba existente se puso en rojo; no se editó ninguna.
- Tamaño real: unas 866 líneas (553 de `index.html` —unas 400 de JavaScript y 150 de estilos— y 313 de pruebas), más que el previsto (560) y que `delivery-budget: 600`. Sigue, con el motivo que el plan declaró: los tres requisitos pintan la misma vista con los mismos datos y no hay un corte con su código y sus pruebas sin pisar `vistaModelos()`.
- Diferencias con el boceto, para el PO: (1) «Declarar» no escribe nada: declara el cliente para esta pantalla y muestra el comando de la sesión (D-001); (2) «Cambiar de perfil» abre «Avanzado» con el foco en «Perfil del proyecto» hasta que FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 traiga `#/modelos/perfil` (D-002); (3) el título de la tarjeta es el id del perfil, porque los perfiles no tienen nombre legible; (4) con el `routing.yaml` de este repositorio las cuatro fases, Coordinación y cuatro roles de evaluación están definidos en el proyecto, así que salen «cambiado aquí» y casi todas con «El perfil diría lo mismo» (D-003); (5) Compuertas lleva solo la bajada «el modelo responde, el código decide», sin «iguales en los tres perfiles», que no vale para perfiles del proyecto.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-ajustes-modelos` (o la raíz del repositorio tras integrar).
- Requisitos de ambiente: Node 24, `npm install` hecho; para lo manual, `npm run build` y `node packages/cli/dist/main.js serve --port 4877`, con Chrome.
- Comandos y resultado esperado:
  1. `npx vitest run tests/vista-modelos-ajustes.test.ts` → 10 de 10 en verde (C1-C17).
  2. `npx vitest run tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts` → 135 de 135 en verde (C20).
  3. `node scripts/verificar-interfaz.mjs` → «vistas ejecutadas: 12» e «Interfaz verificada.» (exige `npm run build` antes).
- Validaciones manuales (en http://127.0.0.1:4877/#/modelos; la vista tarda unos segundos porque pide el catálogo de cada proveedor):
  - A 1440 px, en oscuro y en claro, la vista se ve como `.valmen/features/rediseno-mission-control/assets/modelos.png`, con las diferencias listadas en «Implementación» (C19; `evidencia/modelos-1440-dark.png`, `evidencia/modelos-1440-light.png`).
  - A 390 px no hay desplazamiento horizontal (C18; `evidencia/modelos-390-dark.png`, `evidencia/modelos-390-light.png`).
  - «Volver al perfil» en una fase muestra las diferencias de `.valmen/routing.yaml`; «Cancelar» no cambia nada. «Confirmar» escribe el archivo: hacerlo solo en un repositorio de prueba o revertir con git.
  - «Declarar» con un cliente muestra `valmen resume --cliente <id>`; «Cambiar» vuelve al aviso; al recargar se recuerda en ese navegador.
  - «Cambiar de perfil» abre «Avanzado» con el foco en «Perfil del proyecto»; «Duplicar y editar» abre el editor del perfil activo.
- Resultado local: los comandos 1-3 pasaron (EVIDENCE-001, EVIDENCE-002); las validaciones manuales se hicieron con Chrome sin pantalla y en el navegador (EVIDENCE-003 a EVIDENCE-005), sin confirmar «Volver al perfil» sobre el archivo real.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Prueba primero: npx vitest run tests/vista-modelos-ajustes.test.ts antes de tocar index.html: 10 de 10 en rojo (sin bloque de perfil, sin grupos, sin aviso, sin corte de 768 px). Después de implementar: 10 de 10 en verde.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Regresión sin editar pruebas existentes: npx vitest run tests/perfiles-pantalla.test.ts tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts → 135 de 135; node scripts/verificar-interfaz.mjs → Interfaz verificada (12 vistas); revisar_presentacion sin colores fijos; valmen secrets sin hallazgos.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Chrome sin pantalla por CDP con datos reales de /api/routing, /api/perfiles y /api/modelos/fases del worktree, a 1440 px en oscuro y claro (evidencia/modelos-1440-dark.png, evidencia/modelos-1440-light.png), comparado con modelos.png: misma estructura, jerarquía, lila/ámbar por quién decide y textos fijos; scrollWidth 1440 = clientWidth. Diferencias: el título es el id (el perfil no tiene nombre), con los datos reales todas las fases salen «cambiado aquí» porque routing.yaml las define (D-003), y «Cambiar de perfil» abre Avanzado (D-002).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Chrome sin pantalla por CDP a 390 px (móvil) en oscuro y claro (evidencia/modelos-390-dark.png, evidencia/modelos-390-light.png): scrollWidth 390 = clientWidth, sin desplazamiento horizontal; tarjetas del agente y filas de Coordinación y Compuertas en una columna con rótulos.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Recorrido en el navegador (127.0.0.1:4877/#/modelos): «Volver al perfil» en Implementación muestra solo las 4 líneas de agent-implementation que se quitarían de .valmen/routing.yaml; se pulsó Cancelar (no se confirmó: routing.yaml sin cambios). «Declarar» con Claude Code pide ?ejecutor=claude y muestra «valmen resume --cliente claude»; «Cambiar» vuelve al aviso. «Cambiar de perfil» abre Avanzado con el foco en «Perfil del proyecto»; «Duplicar y editar» abre «Nuevo perfil a partir de claude-code-completo».",
    "reference": null,
    "point_id": null
  }
]
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
    "date": "2026-10-14",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente claude-opus-5-5 del orquestador para análisis, plan e implementación de este ticket; la sesión no expone sus números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de Claude Code sin agregado de tokens expuesto",
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
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:27.565Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:55.350Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/modelos.html, .valmen/features/rediseno-mission-control/assets/modelos.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T06:25:17.381Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T06:26:56.503Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"Qué hace «Declarar» en el aviso de cliente si el cliente de la sesión no se guarda en ningún archivo (H1)\",\"eleccion\":\"Declara el cliente para la pantalla: vuelve a pedir GET /api/modelos/fases?ejecutor=<id>, lo recuerda en localStorage del navegador y el aviso pasa a mostrar la corrección de la sesión «valmen resume --cliente <id>», sin escribir archivos\",\"alternativas\":[\"Persistir un cliente por defecto en .valmen/config.yaml (cambia adapter, CLI y servidor)\",\"Elegir el perfil activo para ese ejecutor con PUT /api/perfiles/seleccion (escribe profiles.yaml y no declara el cliente de la sesión)\"],\"criterio\":\"Conservadora y reversible: no inventa un dato persistido que el código no tiene y no dice «declarado» donde la sesión no lo está\",\"fuente\":\"packages/server/src/server.ts:1709-1765; packages/adapter/src/routing.ts:1286-1356; packages/cli/src/command-table.ts:106\",\"reversion\":\"Quitar la clave valmen-cliente-modelos del navegador o revertir el commit; no hay datos que deshacer\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T06:26:56.888Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"Qué hace «Cambiar de perfil» mientras no exista la pantalla #/modelos/perfil (H2)\",\"eleccion\":\"Abre «Avanzado» y lleva el foco al selector «Perfil del proyecto», que ya cambia el perfil; FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 lo cambia por la ruta nueva\",\"alternativas\":[\"Enlazar ya a #/modelos/perfil (hoy vuelve a pintar Modelos sin hacer nada)\",\"Ocultar el botón hasta que llegue la pantalla\"],\"criterio\":\"La acción funciona hoy con el camino existente y no deja un enlace que no lleva a ningún lado\",\"fuente\":\"packages/server/web/index.html:8492-8499, :9675, :9713\",\"reversion\":\"Revertir el commit; el ticket de cambiar perfil reemplaza el manejador\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T06:26:57.257Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"Cuándo una fase se marca «cambiado aquí» si el proyecto la define con el mismo modelo que el perfil (H3)\",\"eleccion\":\"Siempre que source sea proyecto; si el modelo coincide con el del perfil dice «El perfil diría lo mismo»\",\"alternativas\":[\"Marcar solo si el modelo difiere (ocultaría una definición que impide que el perfil cambie esa fase)\"],\"criterio\":\"Es lo que resuelve el código: el proyecto gana al perfil aunque coincidan\",\"fuente\":\"packages/adapter/src/routing.ts:1036-1060\",\"reversion\":\"Revertir el commit\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T06:26:57.625Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"Qué roles escribe «Volver al perfil» al quitar la fase de routing.yaml (H4)\",\"eleccion\":\"Los que el texto guardado declara bajo roles: (regex sobre el texto), menos la fase; vista previa con POST /api/routing/preview, diferencias a la vista y PUT /api/routing solo al confirmar\",\"alternativas\":[\"Tomar los de source proyecto (incluiría ui-specs venido de playwright: y lo escribiría en el archivo)\"],\"criterio\":\"Cambia solo la fase pedida y la persona ve las diferencias antes, como exige el escenario\",\"fuente\":\"packages/server/web/index.html:8093-8180; packages/adapter/src/routing.ts:1018-1027\",\"reversion\":\"Volver a definir la fase en «Modelo por rol» o revertir routing.yaml con git\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T06:26:57.996Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"Qué hace «Cambiar solo esta fase» del boceto, que no está en los requisitos (H5)\",\"eleccion\":\"Abre «Avanzado» y lleva el foco al selector de modelo de ese rol en «Modelo por rol», que ya edita y guarda con diferencias\",\"alternativas\":[\"Un editor nuevo dentro de la tarjeta (duplica el de Modelo por rol y suma unas 120 líneas)\"],\"criterio\":\"Reutiliza el editor existente y mantiene el tamaño de la entrega\",\"fuente\":\"packages/server/web/index.html:7971-8186\",\"reversion\":\"Revertir el commit\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T06:29:34.859Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:45.845Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:1886cbb9cd3aa0613d7bfc1a018fe87c56eca9987f9f965e5fd48602ce0d444e\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-AJUSTES-MODELOS-20261014-plan-1\",\"receiptStateHash\":\"sha256:fcbd5f40ee4a56b2ca2b50c0c386a39278082500d64fab3de2aa52f6acb2747e\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:46.260Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:1886cbb9cd3aa0613d7bfc1a018fe87c56eca9987f9f965e5fd48602ce0d444e."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:46.260Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T06:31:53.961Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T06:44:49.621Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T06:44:50.731Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T06:44:52.519Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T06:44:53.911Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T06:44:55.050Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T06:50:34.085Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T06:50:43.773Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T06:55:35.948Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":848,\"borradas\":18,\"total\":866,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
