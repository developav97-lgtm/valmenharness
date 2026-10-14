---
schema_version: 2
id: FEATURE-WEB-MENU-GRUPOS-20261014
title: Menú por grupos con proyecto, perfil activo y Pedir un cambio
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

# FEATURE-WEB-MENU-GRUPOS-20261014

## Solicitud original

Parte del sprint: Marco común entregable: tema sala de control con fuentes locales, menú por grupos con proyecto y perfil activo, acción Pedir un cambio e Inicio como pantalla de apertura.
- R-MARCO-002: El menú lateral DEBE agrupar las vistas en Hoy, Trabajo, En vivo, Reglas y Ajustes
- R-MARCO-003: El menú DEBE mostrar arriba el proyecto activo y debajo su perfil de modelos
- R-MARCO-004: El chat de configuración DEBE abrirse como la acción «Pedir un cambio» desde cualquier pantalla
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
Depende de: FEATURE-WEB-TEMA-TOKENS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El menú lateral DEBE agrupar las vistas en Hoy, Trabajo, En vivo, Reglas y Ajustes El menú DEBE mostrar arriba el proyecto activo y debajo su perfil de modelos El chat de configuración DEBE abrirse como la acción «Pedir un cambio» desde cualquier pantalla Cada pantalla DEBERÍA funcionar en el celular
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
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
- `.valmen/features/rediseno-mission-control/assets/menu.html` — Boceto aprobado por el PO el 2026-10-14: Menú lateral por grupos (HTML autónomo, el original) (sha256 802d68d45244…)
- `.valmen/features/rediseno-mission-control/assets/menu-antes-despues.html` — Boceto aprobado por el PO el 2026-10-14: Menú antes y después (HTML autónomo, el original) (sha256 b42250f67f88…)
- `.valmen/features/rediseno-mission-control/assets/menu-antes-despues.png` — Captura a 1440 px del boceto aprobado: Menú antes y después (sha256 7191f6790a97…)
- `.valmen/features/rediseno-mission-control/assets/menu.png` — Captura del boceto aprobado: Menú lateral por grupos (sha256 7ba35b11696d…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el marco común de Mission Control (`packages/server/web/index.html`): la barra lateral (marcado, estilos y la lógica que la marca y le pone cuentas), el enrutado de `#/configurar` y `#/configuracion`, la acción «Pedir un cambio» (panel con el chat de configuración que hoy es una vista) con su atajo ⌘K/Ctrl+K, y el comportamiento de la barra por debajo de 768 px. No cambia ninguna llamada a la API ni el servidor. No rediseña el contenido de ninguna vista: Inicio, Modelos, Proveedores, Proyecto y el resto son de los tickets que la sección «Fuera de alcance» nombra. Incluye el hallazgo de contraste heredado de FEATURE-WEB-TEMA-TOKENS-20261014 (acentos sobre `--fondo-2` en modo claro).
- Usuario o rol afectado: la persona que opera Mission Control (el PO o quien revise un proyecto), en escritorio y en el celular, en modo oscuro y claro.
- Comportamiento actual: el menú es una lista plana de diez entradas bajo un único rótulo «Registro», con «Configurar» (un chat) y «Configuración» (un editor de YAML) como entradas distintas y fáciles de confundir; el selector de proyecto vive al pie y el perfil de modelos activo no se ve en ningún lado fuera de Modelos; el chat solo se abre navegando a su vista, que reemplaza la pantalla en la que se estaba; por debajo de 768 px la barra conserva sus 232 px fijos a la izquierda del contenido.
- Comportamiento esperado: tal como `.valmen/features/rediseno-mission-control/assets/menu.html` (captura `menu.png`) y `menu-antes-despues.html`/`.png` —abiertos y revisados en este análisis—: cabecera con la marca, la caja «Proyecto» con el proyecto activo y debajo una línea lila «Perfil <id>» (o «sin perfil») que lleva a Modelos; cinco grupos con rótulo en mono, en este orden: Hoy (Inicio), Trabajo (Tickets, Features, Portafolio), En vivo (Agentes con la cuenta de agentes vivos en lila, Procesos), Reglas (Estándares), Ajustes (Modelos, Proveedores, Proyecto); sin ninguna entrada «Configurar» ni «Configuración»; al pie, el botón punteado «Pedir un cambio» con «⌘K» y el latido de conexión. El botón y ⌘K/Ctrl+K (sin campo en foco) abren el chat de configuración como panel sobre la pantalla actual, con el foco en su campo; Esc lo cierra; lo que propone y aplica no cambia. `#/configurar` abre ese panel; `#/configuracion` muestra Ajustes › Proyecto con «Proyecto» marcado en el menú. A menos de 768 px el menú se apila sobre el contenido sin desplazamiento horizontal de la página.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es funcionalidad nueva sobre un marco que no la tiene; lo comprobado leyendo el código:
  - El menú es un único `<nav>` plano bajo el rótulo `<div class="grupo">Registro</div>` (`packages/server/web/index.html:2617`), con diez enlaces `data-vista` en el orden Tickets, Features, Portafolio, Agentes, Procesos, Estándares, Configurar, Modelos, Configuración, Proveedores (`packages/server/web/index.html:2618-2629`). «Configurar» apunta a `#/configurar` y «Configuración» a `#/configuracion` (`index.html:2625`, `index.html:2627`). La clase `.lateral .grupo` ya existe (`index.html:242`), así que los rótulos de grupo no necesitan estilo nuevo, solo el tratamiento mono del boceto.
  - El selector de proyecto está en el pie (`<div class="pie">`, `index.html:2631`; `<select id="selector-proyectos">`, `index.html:2634`), lo llena `cargarSelectorDeProyectos()` desde `GET /api/portafolio` (`index.html:2883`) y lo cambia `seleccionarProyecto()` (`index.html:2873`), que reconecta eventos y vuelve a navegar.
  - El perfil activo no se pinta fuera de Modelos: solo `seccionPerfiles()` llama a `GET /api/perfiles` (`index.html:8066`). El servidor devuelve `seleccion: { proyecto, ejecutores }` con `readSeleccionDePerfil(context.root)` (`packages/server/src/server.ts:1677-1684`) y `seleccion: { proyecto: null, ejecutores: {} }` cuando no puede leerla (`server.ts:1696`); `seleccion.proyecto` es el id que la línea del menú tiene que mostrar.
  - El chat es una vista que vacía `#contenido`: `vistaConfigurar()` (`index.html:7165`) la pinta y, al aplicar con éxito, llama a `navegar()` (`index.html:7221-7222`), que vuelve a pintar la vista del hash. `navegar()` la elige con `nombre === "configurar"` (`index.html:9403`) y el editor de YAML con `nombre === "configuracion"` → `vistaConfiguracion()` (`index.html:9405`, `index.html:8258`). Los títulos salen de `TITULOS` (`index.html:9224`), con «Configurar» y «Configuración» como valores.
  - El marcado de la entrada activa recorre `document.querySelectorAll("nav a")` comparando `data-vista` con el nombre de la ruta (`index.html:9387-9396`, dentro de `navegar()` en `index.html:9370`); una ruta alias (`configuracion` → «Proyecto») necesita una regla ahí, como las que ya existen para `ticket` y `feature`.
  - Las cuentas del menú las pone `marcarPendientes()` (`index.html:9261`) en Tickets (`awaiting_user_tests`) y Estándares (propuestas), siempre en ámbar; no hay cuenta en Agentes. La cuenta de vivos ya se calcula para la vista Agentes con `agentesVivos()` (`index.html:6477`) sobre `GET /api/corrida/agentes` (`index.html:6792`).
  - El refresco en vivo no repinta con un `dialog[open]` ni con foco en un campo (`puedeRefrescar()`, `index.html:9095`): si el panel es un `<dialog>`, lo que se está escribiendo en el chat no se pierde por un evento del servidor.
  - El armazón es una rejilla fija `grid-template-columns: var(--lateral) 1fr` (`index.html:187`) con `.lateral` en `position: sticky; height: 100vh` (`index.html:195`), y no hay ningún `@media` que la cambie por debajo de 768 px (los únicos cortes son 640 y 700 px de vistas concretas, `index.html:2217`, `index.html:2256`, `index.html:2412`, `index.html:2565`).
  - Contraste heredado: en modo claro `--fondo-2` es `#e8eef0` (`index.html:121`); recalculado con la fórmula WCAG de `tests/tema-tokens.test.ts`: `--acento` 4.31, `--alerta` 4.39 y `--ok` 4.28 sobre él (por debajo de 4.5), mientras `--texto` 15.13, `--tenue` 5.74, `--modelo` 5.81 y `--error` 4.82 pasan. `--panel-hover` claro tiene el mismo valor (`index.html:124`), así que el mismo fallo aparece en cualquier acento sobre un hover. Además, `--acento` sobre `--acento-suave` mezclado con `--fondo-2` da 3.71 y `--alerta` sobre `--alerta-suave` 3.78: las cuentas actuales del menú (`.cuenta`, `index.html:291-304`) no llegarían a AA si la barra pasa a `--fondo-2` como en el boceto (`menu.html`: `background:#0e181c`). En oscuro todos pasan (≥6.03 sobre `--fondo-2`).
- Hipótesis pendientes:
  - H1 — Inicio todavía no existe como vista: no hay ruta `inicio` en `navegar()` (`index.html:9398-9410`) y la vista y su cuenta «lo que espera una decisión» son de FEATURE-WEB-INICIO-DECISIONES-20261014 (R-MARCO-005, que depende de este ticket). Qué muestra `#/inicio` hasta que ese ticket llegue y quién pone la cuenta ámbar de Inicio se decide en el plan con `valmen agent-decision`; la hipótesis de partida es que este ticket deja la entrada y la ruta, y la cuenta la pone el ticket de Inicio con su propio cálculo.
  - H2 — Ajustes › Proyecto todavía es el editor de YAML (`vistaConfiguracion()`); su rediseño es de FEATURE-WEB-AJUSTES-PROYECTO-20261014. Se espera que la entrada «Proyecto» use una ruta nueva `#/proyecto` que pinte `vistaConfiguracion()` y que `#/configuracion` sea alias de esa ruta sin redirigir, para no romper los enlaces guardados ni las pruebas que la abren por ese hash; se confirma en el plan.
  - H3 — Cómo se resuelve el contraste de los acentos sobre `--fondo-2` sin tocar los valores de los tokens que fija `tests/tema-tokens.test.ts` (C1/C2): la opción conservadora a evaluar en el plan es que en modo claro la barra no pinte acentos como texto sobre `--fondo-2` (cuentas con fondo sólido y `--sobre-acento`, rótulos y «⌘K» en `--tenue`) o que la barra use una superficie que sí da AA; se elige en el plan con el cálculo de contraste como prueba.
  - H4 — El arnés `scripts/verificar-interfaz.mjs` simula un DOM mínimo: `document.querySelectorAll` devuelve `[]` y `document.addEventListener` no guarda oyentes (`scripts/verificar-interfaz.mjs:648-650`), aunque los de `window` sí (`scripts/verificar-interfaz.mjs:657`). Las pruebas del atajo y del panel tienen que engancharse a `window` o ampliar el arnés; se decide en el plan.
- Consumidores afectados:
  - Las pruebas que abren la interfaz por hash: `tests/politicas-autonomas-pantalla.test.ts:38` y `tests/revocar-autorizacion-pantalla.test.ts:60` (`#/configuracion`), `tests/perfiles-pantalla.test.ts:85` (`#/modelos`) y la lista `VISTAS` de `scripts/verificar-interfaz.mjs:754-766`, que recorre `#/configurar` y `#/configuracion` y usa `tests/interfaz-ejecutable.test.ts`. Tienen que seguir en verde.
  - `tests/tema-tokens.test.ts` (valores exactos de los tokens en `:root` y en el bloque claro, contraste de textos sobre `--fondo`, `--panel` y `--panel-alto`, y C8: ningún color a mano en `index.html`) y `tests/vista-marco-responsivo.test.ts` (reglas de la vista Agentes).
  - La documentación que nombra la ruta del chat: `docs/06-CONTROL-APP.md:453` («El chat existe en la ruta `#/configurar`»).
  - Los enlaces guardados por personas a `#/configurar` y `#/configuracion`, y la preferencia `valmen-lateral` en `localStorage` del pliegue (`montarPliegue()`), que tiene que seguir funcionando.
  - La copia publicada `packages/cli/dist/web/index.html`, que sirve el servidor y que `scripts/verificar-interfaz.mjs` compara con la fuente: se regenera con `npm run build`.
- Archivos y flujo investigados: `packages/server/web/index.html` (tokens `:79-151`, armazón y barra `:187-350`, marcado `:2610-2656`, `api()` `:2685`, selector `:2865-2900`, `vistaConfigurar()` `:7165-7333`, `seccionPerfiles()` `:8053`, `vistaConfiguracion()` `:8258`, refresco en vivo `:8982-9132`, `TITULOS`/`marcarPendientes()`/`montarPliegue()` `:9224-9302`, `navegar()` `:9370-9425`); `packages/server/src/server.ts:1677-1700` (`GET /api/perfiles`); `scripts/verificar-interfaz.mjs` (arnés de la interfaz ejecutable); `tests/tema-tokens.test.ts`, `tests/vista-marco-responsivo.test.ts`, `tests/politicas-autonomas-pantalla.test.ts`, `tests/perfiles-pantalla.test.ts`, `tests/interfaz-ejecutable.test.ts`; `.valmen/features/rediseno-mission-control/spec/s1-marco/spec.md`, `design.md`, `tickets.yaml`; los cuatro adjuntos de «Referencias de diseño»; la sección de contraste de `tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/ticket.md:181`. `buscar_memoria` («menú lateral web grupos navegación perfil activo chat configuración») no devolvió resultados.
- Riesgos y compatibilidad:
  - Rutas: `#/configurar` deja de ser una vista y pasa a abrir el panel; un enlace guardado sigue funcionando. `#/configuracion` sigue pintando el editor y solo cambia la entrada marcada. Ningún hash existente deja de resolver.
  - El chat aplica cambios y hoy recarga su propia vista; dentro del panel tiene que recargar la pantalla de debajo sin cerrar el panel ni perder la conversación en curso, o lo que «propone y aplica» cambiaría para la persona.
  - Teclado: ⌘K/Ctrl+K no debe dispararse con foco en un campo (lo dice el escenario) ni pisar atajos del navegador fuera de ese caso; Esc y el foco de vuelta al botón al cerrar son de accesibilidad.
  - Contraste: mover la barra a `--fondo-2` sin resolver H3 dejaría en modo claro las cuentas y los acentos por debajo de AA.
  - Celular: apilar la barra cambia la rejilla del armazón para todas las vistas; el pliegue (`lateral-oculta`) y el halo de `.principal::before` (`index.html:470-482`, anclado a `var(--lateral)`) tienen que seguir bien en los dos tamaños.
  - Sin colores a mano: C8 de `tests/tema-tokens.test.ts` falla con cualquier hexadecimal o `rgba()` nuevo fuera de los tokens.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambia solo el cliente estático de Mission Control: sin sincronización, sin migraciones, sin contenedores y sin cambios del servidor ni de la API.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: el marco común de `packages/server/web/index.html` —marcado y estilos de la barra lateral, `marcarPendientes()`, el marcado de la entrada activa y las ramas `inicio`, `proyecto`, `configurar` y `configuracion` de `navegar()`, el chat de configuración convertido en panel con ⌘K/Ctrl+K y el corte por debajo de 768 px—; el arnés `scripts/verificar-interfaz.mjs` (D-004); una prueba nueva `tests/menu-grupos.test.ts`; y la frase de `docs/06-CONTROL-APP.md:453`. Exclusiones: el contenido de Inicio y su cuenta (FEATURE-WEB-INICIO-DECISIONES-20261014, D-001), el rediseño de Modelos, Proveedores y Proyecto (S2), el de Tickets, Features, Portafolio, Agentes, Procesos y Estándares (S3-S4), la ruta por defecto (sigue en Tickets hasta el ticket de Inicio), los valores de los tokens (los fija `tests/tema-tokens.test.ts`) y cualquier cambio del servidor o de la API.
- Decisiones registradas: D-001 (Inicio entra con su ruta transitoria; su cuenta es del ticket de Inicio), D-002 (`#/proyecto` nuevo y `#/configuracion` como alias sin redirigir), D-003 (la barra usa `--fondo-2` y no pinta cian, ámbar ni verde como texto sobre él: cuentas sólidas con `--sobre-acento`, vivos en `--modelo`, rótulos y ⌘K en `--tenue`) y D-004 (atajo en `window`; el arnés gana `showModal()`, `open`, `focus()` que fija `document.activeElement` y `nodo(id)`).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Menú plano bajo «Registro» con «Configurar» y «Configuración» (`index.html:2617-2629`): paso 3; lo comprueba el paso 1 (C1-C3).
  - Selector de proyecto al pie y perfil invisible (`index.html:2631-2634`, `index.html:8066`, `server.ts:1677-1696`): pasos 3 y 4; lo comprueba el paso 1 (C5-C7).
  - Chat como vista que reemplaza la pantalla (`index.html:7165`, `index.html:7221-7222`, `index.html:9403`): paso 5; lo comprueba el paso 1 (C8-C13).
  - Marcado de la entrada activa y alias (`index.html:9387-9396`, `index.html:9405`, `index.html:9224`): paso 6; lo comprueban el paso 1 (C14) y el paso 9 (C15).
  - Cuentas en ámbar suave y sin cuenta de vivos (`index.html:9261`, `index.html:291-304`, `index.html:6477`): pasos 3 y 4; lo comprueba el paso 1 (C4, C16).
  - Armazón fijo sin corte de 768 px (`index.html:187`, `index.html:195`, `index.html:470-482`): paso 3; lo comprueban el paso 1 (C17) y el paso 9 (C18).
  - Contraste de acentos sobre `--fondo-2` en claro (H3): D-003, paso 3; lo comprueba el paso 1 (C16).
  - H1 (Inicio): D-001, paso 6. H2 (Proyecto): D-002, paso 6. H4 (arnés): D-004, paso 2.
  - Consumidores (pruebas por hash, `tema-tokens`, `vista-marco-responsivo`, `VISTAS`, `docs/06-CONTROL-APP.md:453`, copia publicada): pasos 7 y 8 (C19).
- Pasos ordenados:
  1. Escribir `tests/menu-grupos.test.ts` y verlo en rojo con `npx vitest run tests/menu-grupos.test.ts`, antes de tocar `index.html`. Lectura del HTML como texto: rótulos de grupo del `<aside class="lateral">` en orden y, en una tabla de casos, las entradas de cada grupo con su `href` (C1, C2); ningún enlace con los rótulos retirados «Configurar», «Configuración» (C3); la caja `#proyecto-activo` con `#selector-proyectos` antes del primer `.grupo` (C5); tabla de pares texto-fondo de la barra (`.lateral`, `.lateral .grupo`, `.lateral nav a`, `.lateral nav a .cuenta`, `.lateral nav a .cuenta.alerta`, `.lateral nav a .cuenta.vivos`, `.lateral .perfil-activo`, `.pedir-cambio .atajo`), comprobando que cada regla declara esos `var()` y que el contraste WCAG con la fórmula de `tests/tema-tokens.test.ts` (mezclando los `-suave` al 12 % sobre `--fondo-2`) llega a 4.5:1 en los dos modos (C16); y el bloque `@media (max-width: 767px)` con `body.armazon` en una columna y `.lateral` en `position: static` y `height: auto` (C17). Interfaz ejecutada con `ejecutarInterfaz` y respuestas simuladas: `GET /api/corrida/agentes` con dos vivos, un principal y uno terminado deja «2» en `#cuenta-agentes` (C4); `GET /api/perfiles` con `seleccion.proyecto = "claude-code-completo"` pinta «Perfil» y el id en `#perfil-activo`, con `null` pinta «sin perfil» (una tabla de casos, C6), y su `href` es `#/modelos` (C7); clic en `#pedir-cambio-boton` deja `#pedir-cambio` abierto con el campo «Qué quieres configurar» (C8); `keydown` en `window` con `metaKey` y `k` lo abre, con `ctrlKey` y `k` lo abre, y con `document.activeElement` en un `INPUT` no lo abre (una tabla de casos, C9); al abrir, `document.activeElement` es el campo del chat (C10); enviar un mensaje llama a `POST /api/chat/config` con `{ message }` y aplicar una propuesta llama a `POST /api/chat/config/apply` con `{ changes }` (C12); regresión de `#/configurar`: abre el panel y `#contenido` pinta la vista por defecto sin «No se pudo cargar la vista» (C13); regresión de `#/configuracion`: `#contenido` pinta «Configuración del proyecto» con el editor y `#titulo-vista` dice «Proyecto» (C14).
  2. `scripts/verificar-interfaz.mjs` (D-004): `Nodo` gana `showModal()` y `close()` que fijan `open`, y `focus()` que fija `globalThis.document.activeElement`; `ejecutarInterfaz` devuelve además `nodo(id)` sobre el mapa `porId`; `VISTAS` agrega `["proyecto", "#/proyecto"]` (C8-C10, C13, C14).
  3. `packages/server/web/index.html`, marcado y estilos de la barra: cabecera con la marca, caja `#proyecto-activo` (rótulo «Proyecto» y `#selector-proyectos`, movido desde el pie) y el enlace `#perfil-activo` a `#/modelos`; cinco `.grupo` (Hoy, Trabajo, En vivo, Reglas, Ajustes) con sus entradas y los iconos del boceto `.valmen/features/rediseno-mission-control/assets/menu.html`, cada enlace con `data-vista` (`inicio`, `tickets`, `features`, `portafolio`, `agentes`, `procesos`, `estandares`, `modelos`, `proveedores`, `proyecto`) y su `<span class="cuenta" id="cuenta-<vista>" hidden>`; al pie, `<button id="pedir-cambio-boton" class="pedir-cambio">` con «Pedir un cambio» y `<kbd class="atajo">⌘K</kbd>`, y el latido; CSS solo con tokens (D-003): `.lateral` sobre `var(--fondo-2)`, `.grupo` en `var(--mono)` y `var(--tenue)`, `.cuenta` sólida `var(--acento)`/`var(--sobre-acento)`, `.cuenta.alerta` sólida `var(--alerta)`/`var(--sobre-acento)`, `.cuenta.vivos` en `var(--modelo)` sin fondo, `.perfil-activo` sobre `var(--modelo-suave)` con el id en `var(--modelo)`, `.pedir-cambio` con borde punteado `var(--borde)` y `.atajo` en `var(--tenue)`; `@media (max-width: 767px)`: `body.armazon` en `grid-template-columns: minmax(0, 1fr)`, `.lateral` en `position: static; height: auto`, y `.principal::before` con `left: 0` (C1-C3, C5, C16-C17).
  4. `index.html`, lógica del menú: `marcarPendientes()` escribe en `#cuenta-<vista>` con `$()` (Tickets y Estándares como hoy, en `.cuenta alerta`) y añade Agentes con `agentesVivos()` sobre `GET /api/corrida/agentes` en `.cuenta vivos`, sin cuenta si la llamada falla o no hay proyecto; `marcarPerfilActivo()` pide `GET /api/perfiles` al cargar y al cambiar de proyecto (`seleccionarProyecto()`) y pinta «Perfil <id>» o «sin perfil» en `#perfil-activo` (C4, C6-C7).
  5. `index.html`, «Pedir un cambio»: `<dialog id="pedir-cambio" aria-labelledby="pedir-cambio-titulo">` con título, botón «Cerrar» y `#pedir-cambio-cuerpo`; `vistaConfigurar()` pasa a `montarChatDeConfiguracion(cont)` con el mismo marcado y las mismas llamadas, y al aplicar con éxito vuelve a montar el chat en el panel y refresca la vista de debajo con `navegar({ conservarVista: true })`; `abrirPedirCambio()` monta el chat, llama a `showModal()` y enfoca el campo; el botón del pie y un `keydown` en `window` con `k` y `metaKey` o `ctrlKey`, sin `INPUT`, `TEXTAREA`, `SELECT` ni contenido editable en foco y sin otro diálogo abierto, la llaman con `preventDefault()`; Esc lo cierra el `<dialog>` y al cerrar el foco vuelve a `#pedir-cambio-boton`; `puedeRefrescar()` ya no repinta con el panel abierto (C8-C12).
  6. `index.html`, enrutado (D-001, D-002): `TITULOS` quita «Configurar» y «Configuración», agrega `inicio: "Inicio"` y `proyecto: "Proyecto"` y titula `configuracion` como «Proyecto»; en `navegar()`, `configurar` abre el panel y pinta la vista por defecto debajo, `proyecto` y `configuracion` pintan `vistaConfiguracion()`, `inicio` pinta la vista por defecto, y el marcado de la entrada activa trata `configuracion` como `proyecto` y `configurar` como la vista por defecto (C13, C14, C15).
  7. `docs/06-CONTROL-APP.md:453`: el chat se abre con «Pedir un cambio» (⌘K o Ctrl+K) desde cualquier pantalla y con la ruta `#/configurar`. `npm run build` para que `packages/cli/dist/web/index.html` coincida con la fuente (C19).
  8. Regresión: `npx vitest run tests/menu-grupos.test.ts tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/politicas-autonomas-pantalla.test.ts tests/revocar-autorizacion-pantalla.test.ts tests/perfiles-pantalla.test.ts tests/pantalla-autorizaciones.test.ts tests/estaticos-web.test.ts` y `node scripts/verificar-interfaz.mjs`; si una prueba existente se pone en rojo, se detiene y se reporta en el ticket sin editarla (C19).
  9. Verificación en el navegador con `node packages/cli/dist/main.js serve` desde el worktree: el menú a 1440 px en modo oscuro contra `.valmen/features/rediseno-mission-control/assets/menu.png` y `menu-antes-despues.png` y en modo claro (C20); ⌘K en Tickets abre el panel y Esc lo cierra (C11); `#/configuracion` marca «Proyecto» (C15); a 390 px el menú queda sobre el contenido sin desplazamiento horizontal de la página (C18); `revisar_presentacion` sin avisos; capturas como evidencia del ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 580 líneas (unas 320 de producción —unas 295 de `index.html`, 20 de `scripts/verificar-interfaz.mjs` y 5 de `docs/06-CONTROL-APP.md`— y unas 260 de pruebas); 20 criterios.
- Si excede el tope: no excede el tope (`delivery-budget: 600`; 20 afirmaciones, el tope del precheck). Si la implementación pasa de 600 líneas, sigue: los cuatro requisitos tocan el mismo bloque de marcado de la barra, la misma rejilla del armazón y la misma rama de `navegar()`, y no hay un corte que deje a cada parte con su código y sus pruebas sin pisar las mismas líneas de `index.html`.
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni API que deshacer. Las rutas viejas siguen resolviendo en los dos sentidos, así que volver atrás no rompe enlaces guardados.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-MARCO-002): el menú muestra los cinco grupos del boceto en su orden
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C2 (R-MARCO-002): cada grupo lista sus entradas del boceto en orden con su ruta
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C3 (R-MARCO-002): el menú no tiene ninguna de las entradas retiradas («Configurar», «Configuración»)
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C4 (R-MARCO-002): la entrada Agentes muestra la cuenta de agentes vivos
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C5 (R-MARCO-003): la caja del proyecto activo va antes del primer grupo del menú
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C6 (R-MARCO-003): la línea del perfil refleja la elección de `GET /api/perfiles`, con «sin perfil» cuando no hay ninguna
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C7 (R-MARCO-003): la línea del perfil lleva a `#/modelos`
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C8 (R-MARCO-004): el botón «Pedir un cambio» abre el panel con el chat de configuración
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C9 (R-MARCO-004): el atajo `⌘K`/`Ctrl+K` abre el panel solo cuando ningún campo tiene el foco
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C10 (R-MARCO-004): al abrirse el panel, el foco queda en su campo de texto
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C11 (R-MARCO-004): Esc cierra el panel en el navegador
      <!-- verify: manual -->
- [x] C12 (R-MARCO-004): el chat del panel usa las mismas llamadas `/api/chat/config` de la vista anterior
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C13 (R-MARCO-004): `#/configurar` abre el panel «Pedir un cambio»
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C14 (R-MARCO-004): `#/configuracion` muestra el editor de la configuración del proyecto con el título «Proyecto»
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C15 (R-MARCO-004): `#/configuracion` marca «Proyecto» en el menú del navegador
      <!-- verify: manual -->
- [x] C16 (R-MARCO-001): cada par de texto con su fondo en la barra llega a 4.5:1 en los dos modos del sistema
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [x] C17 (R-MARCO-006): por debajo de 768 px el armazón pone la barra sobre el contenido en una sola columna
      <!-- test: npx vitest run tests/menu-grupos.test.ts -->
- [ ] C18 (R-MARCO-006): a 390 px la página no tiene desplazamiento horizontal
      <!-- verify: manual -->
- [x] C19 (R-MARCO-002): las pruebas existentes de la interfaz siguen en verde sin editarse
      <!-- test: npx vitest run tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/politicas-autonomas-pantalla.test.ts tests/revocar-autorizacion-pantalla.test.ts tests/perfiles-pantalla.test.ts tests/pantalla-autorizaciones.test.ts tests/estaticos-web.test.ts -->
- [x] C20 (R-MARCO-002): a 1440 px el menú se ve como `menu.png` en los dos modos del sistema
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (FEATURE de varios puntos del marco común), plan aprobado por la autorización POLITICA-POR-DEFECTO (recibo plan-1).
- Paso 1 — `tests/menu-grupos.test.ts` (nuevo, 37 casos): escrito antes de tocar `index.html` y visto en rojo (33 fallidas, 4 pasadas; EVIDENCE-001).
- Paso 2 — `scripts/verificar-interfaz.mjs` y `scripts/verificar-interfaz.d.mts` (D-004): `Nodo` gana `showModal()`/`close()` con `open` y `focus()` que fija `document.activeElement`; el documento arranca con `activeElement: null`; `ejecutarInterfaz` devuelve `nodo(id)`; `VISTAS` agrega `#/proyecto`.
- Paso 3 — `packages/server/web/index.html`, marcado y CSS de la barra: marca, caja `#proyecto-activo` con `#selector-proyectos` (movido desde el pie), enlace `#perfil-activo` a `#/modelos`, cinco `.grupo` con las entradas y los iconos del boceto, cuentas `#cuenta-<vista>` ocultas por defecto, pie con `#pedir-cambio-boton` («Pedir un cambio» + `⌘K`) y el latido; CSS solo con tokens según D-003 (barra sobre `--fondo-2`, cuentas sólidas con `--sobre-acento`, vivos en `--modelo`, rótulos y atajo en `--tenue`); `--lateral` pasa de 232 a 264 px, el ancho del boceto, para que el id del perfil no se corte; `@media (max-width: 767px)` apila la barra sobre el contenido con las entradas en dos columnas.
- Paso 4 — `ponerCuenta()` y `marcarPendientes()` escriben en `#cuenta-<vista>`; Agentes cuenta `agentesVivos()` de `GET /api/corrida/agentes` (sin proyecto: sin cuenta); `marcarPerfilActivo()` pinta «Perfil <id>» o «sin perfil» de `GET /api/perfiles` al cargar y al cambiar de proyecto.
- Paso 5 — `<dialog id="pedir-cambio">`; `vistaConfigurar()` pasa a `montarChatDeConfiguracion(cont)` con las mismas llamadas (sin el `h2` «Configurar por chat»: el título lo pone el panel); al aplicar con éxito vuelve a montar el chat y refresca la vista de debajo con `navegar({ conservarVista: true })`; `abrirPedirCambio()` y `montarPedirCambio()` (botón, cerrar, ⌘K/Ctrl+K en `window` sin campo en foco ni otro diálogo abierto; al cerrar, el foco vuelve al botón y `#/configurar` se reemplaza por `#/tickets` sin navegar). En otros sistemas el atajo se rotula «Ctrl K».
- Paso 6 — `TITULOS` sin «Configurar»/«Configuración», con `inicio` y `proyecto`; `navegar()`: `configurar` abre el panel sobre Tickets, `proyecto` y `configuracion` pintan `vistaConfiguracion()`, `inicio` pinta la vista por defecto (D-001), y la entrada marcada trata `configuracion` como `proyecto`.
- Paso 7 — `docs/06-CONTROL-APP.md:453` y `npm run build`.
- Dos pruebas existentes se pusieron en rojo y no se editaron (EVIDENCE-003): `tests/vista-corrida.test.ts` «el menú lleva Agentes a #/agentes…» (la cuenta quedaba entre el rótulo y `</a>`) y «repinta cada 5 s…» (2 llamadas a `/api/corrida/agentes` en vez de 1). Se ajustó la implementación, dentro de los pasos 3 y 4: la cuenta va delante del rótulo con `order: 1` y, con Agentes abierta, la pone `vistaCorrida()` con `ponerCuenta()` en lugar de una segunda petición.
- Tamaño real: unas 900 líneas (unas 430 de producción —409 de `index.html`, 27 del arnés, 3 de docs— y 468 de pruebas), más que el previsto y que `delivery-budget: 600`. Sigue, con el motivo que el plan declaró: los cuatro requisitos tocan el mismo marcado, la misma rejilla y la misma rama de `navegar()`; la prueba es la mayor parte (tablas de casos de contraste y de atajo).
- Hallazgo fuera de alcance: a 390 px la tabla de Tickets (887 px) y el editor de Proyecto (460 px) desbordan la página; es de FEATURE-WEB-TRABAJO-TICKETS-20261014 y FEATURE-WEB-AJUSTES-PROYECTO-20261014 (R-MARCO-006). El menú mide 390 px y en Estándares no hay desplazamiento horizontal.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-menu-grupos` (o la raíz del repositorio tras integrar).
- Requisitos de ambiente: Node 24, `npm install` hecho; para lo manual, `npm run build` y `node packages/cli/dist/main.js serve --port 4173`, con Chrome.
- Comandos y resultado esperado:
  1. `npx vitest run tests/menu-grupos.test.ts` → 37 de 37 en verde (C1-C10, C12-C14, C16, C17).
  2. `npx vitest run tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/politicas-autonomas-pantalla.test.ts tests/revocar-autorizacion-pantalla.test.ts tests/perfiles-pantalla.test.ts tests/pantalla-autorizaciones.test.ts tests/estaticos-web.test.ts` → todos en verde, sin editar ninguno (C19).
  3. `npx vitest run tests/vista-corrida.test.ts` → 16 de 16 en verde.
  4. `node scripts/verificar-interfaz.mjs` → «vistas ejecutadas: 12» e «Interfaz verificada.» (exige `npm run build` antes).
  5. `npx tsc --noEmit -p tsconfig.json` → sin errores.
- Validaciones manuales (en http://127.0.0.1:4173):
  - A 1440 px, en modo oscuro y en claro, el menú se ve como `.valmen/features/rediseno-mission-control/assets/menu.png`: proyecto arriba, «Perfil <id>» en lila, cinco grupos, «Pedir un cambio ⌘K» al pie (C20; `evidencia/menu-oscuro-1440.png`, `evidencia/menu-claro-1440.png`).
  - En Tickets, con el foco fuera de un campo, ⌘K (Ctrl+K fuera de macOS) abre «Pedir un cambio» con el cursor en el campo; Esc lo cierra (C11).
  - Abrir `#/configuracion`: se ve el editor de la configuración, el título dice «Proyecto» y el menú marca «Proyecto» (C15).
  - Abrir `#/configurar`: se abre el panel; al cerrarlo, la dirección pasa a `#/tickets`.
  - Con un proyecto con agentes vivos, «Agentes» muestra la cuenta en lila; al elegir otro perfil en Modelos, la línea del perfil cambia al recargar.
  - En una ventana de 390 px, el menú queda sobre el contenido y Estándares no se desplaza a lo ancho (C18; Tickets y Proyecto sí, por su contenido: otros tickets).
- Resultado local: los comandos 1-5 pasaron (EVIDENCE-001, EVIDENCE-002); las validaciones manuales se hicieron en el navegador (EVIDENCE-004 a EVIDENCE-006), salvo la del perfil cambiado, que queda para el responsable.

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
    "description": "Prueba primero: npx vitest run tests/menu-grupos.test.ts antes de tocar index.html dio 33 fallidas y 4 pasadas de 37 (las 4 pasadas son pares de contraste de reglas que ya existían). Tras la implementación: 37 de 37 en verde.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Regresión: npx vitest run sobre los 27 archivos de tests/ que ejecutan o leen la interfaz (incluye tema-tokens, interfaz-ejecutable, vista-marco-responsivo, politicas-autonomas-pantalla, revocar-autorizacion-pantalla, perfiles-pantalla, pantalla-autorizaciones, estaticos-web, vista-corrida y menu-grupos): 476 de 476 en verde. node scripts/verificar-interfaz.mjs: 12 vistas ejecutadas, «Interfaz verificada». npx tsc --noEmit -p tsconfig.json sin errores; npx eslint tests/menu-grupos.test.ts sin hallazgos; revisar_presentacion sin colores a mano.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Dos pruebas existentes de tests/vista-corrida.test.ts se pusieron en rojo con la primera versión y NO se editaron: (1) «el menú lleva Agentes a #/agentes» (regex <a href=\"#/agentes\" data-vista=\"agentes\">.*Agentes</a>) fallaba porque la cuenta iba detrás del rótulo; (2) «repinta cada 5 s» esperaba 1 llamada a /api/corrida/agentes y había 2, porque marcarPendientes() pedía la cuenta además de la vista. Se corrigió la implementación: la cuenta va delante del rótulo en el marcado y CSS order:1 la muestra detrás, y con la vista Agentes abierta la cuenta la pone vistaCorrida con ponerCuenta() sin una segunda petición. Las dos vuelven a verde sin tocarse.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Capturas a 1440 px con Chrome sin pantalla (--blink-settings=preferredColorScheme=0/1, servidor del worktree en 127.0.0.1:4173): tickets/2026/FEATURE-WEB-MENU-GRUPOS-20261014/evidencia/menu-oscuro-1440.png y menu-claro-1440.png, comparadas con .valmen/features/rediseno-mission-control/assets/menu.png y menu-antes-despues.png: marca arriba, caja Proyecto con el selector, línea lila «Perfil claude-code-completo», cinco grupos con rótulo en mono (Hoy, Trabajo, En vivo, Reglas, Ajustes) y sus entradas en el orden del boceto, entrada activa con borde cian, cuenta ámbar sólida, botón punteado «Pedir un cambio ⌘K» y latido al pie. En claro los mismos tokens con sus valores claros. Diferencias con el boceto: Inicio todavía sin cuenta (D-001) y Tickets/Estándares conservan sus cuentas de siempre.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Navegador (panel de Claude, 127.0.0.1:4173): ⌘K en Tickets con el foco fuera de un campo abre #pedir-cambio con el foco en «Qué quieres configurar» (captura evidencia/pedir-cambio-oscuro.jpg); Esc lo cierra y el foco vuelve a #pedir-cambio-boton (C11). #/configuracion muestra el editor con el título «Proyecto» y aria-current solo en data-vista=proyecto (C15). #/configurar abre el panel con Tickets marcada; al cerrarlo el hash pasa a #/tickets sin reabrirse.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "390x844 en modo oscuro (panel de Claude): el menú se apila sobre el contenido a 390 px de ancho, con las entradas en dos columnas (evidencia/menu-oscuro-390.jpg). En Estándares innerWidth=390 y scrollWidth=390: sin desplazamiento horizontal. En Tickets (887) y en Proyecto (460) la página sí se desplaza por el contenido de la vista (la tabla de tickets y el editor), no por el menú: es de FEATURE-WEB-TRABAJO-TICKETS-20261014 y FEATURE-WEB-AJUSTES-PROYECTO-20261014 (R-MARCO-006). Por eso C18 queda sin marcar.",
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
    "model": "claude-code/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Subagente opus de la corrida orquestada (sesión 4bafa011-0b4c-4a99-9312-df4519e031cc del orquestador): análisis, plan e implementación de este ticket en el worktree ticket-menu-grupos. La sesión no expone tokens ni costo al subagente; sin números para no inventarlos. Compuertas: analysis $0.000314, plan $0.001050 y qa-mechanical $0 (recibos en .valmen/receipts/).",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de Claude Code sin agregado de tokens expuesto",
    "confidence": "medium",
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
    "at": "2026-10-14T05:09:27.106Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:54.995Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/menu.html, .valmen/features/rediseno-mission-control/assets/menu-antes-despues.html, .valmen/features/rediseno-mission-control/assets/menu-antes-despues.png, .valmen/features/rediseno-mission-control/assets/menu.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T05:52:21.696Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T05:55:23.237Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿Qué hace la entrada Inicio y quién pone su cuenta mientras la vista Inicio no existe?\",\"eleccion\":\"Este ticket agrega la entrada Inicio con href #/inicio y la ruta inicio, que pinta la vista por defecto actual (Tickets) con el título Inicio hasta que FEATURE-WEB-INICIO-DECISIONES-20261014 la reemplace; la cuenta ámbar de lo que espera una decisión la pone ese ticket, que define el cálculo (R-MARCO-005)\",\"alternativas\":[\"omitir Inicio hasta el ticket de Inicio (incumple R-MARCO-002)\",\"calcular aquí una cuenta parcial con awaiting_user_tests (divergiría del título de Inicio)\"],\"criterio\":\"GET /api/tickets no trae decisiones por ratificar ni compuertas en REVIEW; R-MARCO-005 dice que el menú muestra la misma cuenta que Inicio; la ruta transitoria es reversible y la reemplaza el ticket dependiente\",\"fuente\":\"packages/server/web/index.html:9398-9410; .valmen/features/rediseno-mission-control/spec/s1-marco/spec.md (R-MARCO-005); .valmen/features/rediseno-mission-control/tickets.yaml (INICIO depende de MENU)\",\"reversion\":\"quitar la entrada Inicio del aside y la rama inicio de navegar() en index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T05:55:23.629Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Qué ruta usa la entrada Proyecto y qué pasa con #/configuracion?\",\"eleccion\":\"La entrada Proyecto usa #/proyecto, que pinta vistaConfiguracion(); #/configuracion queda como alias que pinta la misma vista sin redirigir, con el título Proyecto y la entrada Proyecto marcada\",\"alternativas\":[\"redirigir #/configuracion a #/proyecto con location.replace (un hashchange más y las pruebas que abren por ese hash verían el redireccionamiento)\",\"mantener data-vista=configuracion en la entrada Proyecto\"],\"criterio\":\"R-MARCO-004 pide que #/configuracion lleve a Ajustes › Proyecto y el menú marque Proyecto; sin redirigir no cambia nada para tests/politicas-autonomas-pantalla.test.ts:38 ni tests/revocar-autorizacion-pantalla.test.ts:60\",\"fuente\":\"packages/server/web/index.html:9405; packages/server/web/index.html:9387-9396; tests/politicas-autonomas-pantalla.test.ts:38\",\"reversion\":\"devolver la entrada Configuración con #/configuracion y quitar la ruta proyecto de navegar() y TITULOS\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T05:55:23.965Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Cómo se resuelve que en modo claro los acentos sobre --fondo-2 no llegan a AA (4.28-4.39)?\",\"eleccion\":\"La barra usa --fondo-2 como el boceto y no pinta cian, ámbar ni verde como texto sobre él: las cuentas pasan a fondo sólido del acento con texto var(--sobre-acento) (claro 5.06-5.14, oscuro ≥9.71), la cuenta de agentes vivos va en --modelo (claro 5.81, oscuro 7.75), y rótulos de grupo y ⌘K en --tenue (claro 5.74); los valores de los tokens no cambian\",\"alternativas\":[\"oscurecer --acento, --alerta y --ok claros (rompe C2 de tests/tema-tokens.test.ts y la tabla de design.md)\",\"aclarar --fondo-2 claro (rompe C2)\",\"usar --panel como fondo de la barra en modo claro (se aparta del boceto y deja el mismo fallo en --panel-hover)\"],\"criterio\":\"R-MARCO-001 exige AA en modo claro; los tokens los fija una prueba existente que no se edita; cálculo WCAG con la fórmula de tests/tema-tokens.test.ts\",\"fuente\":\"packages/server/web/index.html:121; packages/server/web/index.html:291-304; tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/ticket.md:181\",\"reversion\":\"devolver .lateral y .cuenta a sus reglas anteriores en index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T05:55:24.326Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Cómo se prueba el panel Pedir un cambio y ⌘K con el arnés de interfaz, que no guarda oyentes de document ni tiene showModal?\",\"eleccion\":\"El atajo se escucha en window (keydown), que el arnés ya guarda; scripts/verificar-interfaz.mjs gana showModal()/close() con la propiedad open en Nodo y devuelve nodo(id) para leer nodos fuera de #contenido; la lista VISTAS agrega #/proyecto\",\"alternativas\":[\"escuchar en document y ampliar el arnés con oyentes de document\",\"probar solo leyendo el HTML como texto (no ejecuta el atajo)\"],\"criterio\":\"R-MARCO-004 es comportamiento ejecutable; ampliar el arnés en tres puntos es menor que simular document y no cambia las pruebas existentes\",\"fuente\":\"scripts/verificar-interfaz.mjs:648-660; scripts/verificar-interfaz.mjs:754-766\",\"reversion\":\"revertir los cambios de scripts/verificar-interfaz.mjs y volver a escuchar en document\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T05:58:09.955Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T06:00:31.043Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:3db87a4e103484d968906069ebd09fa30c0050a78134ac194ceb3b80c0f57ec1\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-MENU-GRUPOS-20261014-plan-1\",\"receiptStateHash\":\"sha256:1f712f7dcd366eff4d308252a2ab6cffa3bbc9548dfb01f7dcfdabecb645d108\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T06:00:34.045Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:3db87a4e103484d968906069ebd09fa30c0050a78134ac194ceb3b80c0f57ec1."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T06:00:34.045Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T06:00:41.660Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T06:15:05.802Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T06:15:06.182Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T06:15:06.528Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T06:15:06.942Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T06:15:07.294Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T06:15:07.635Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T06:16:40.519Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T06:16:44.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T06:17:14.177Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":907,\"borradas\":101,\"total\":1008,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
