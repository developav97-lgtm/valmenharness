---
schema_version: 2
id: FEATURE-WEB-VIVO-AGENTES-20261014
title: Agentes con titular, pregunta pendiente y selector de mundo
type: FEATURE
module: WEB
workflow_status: closed
qa_status: approved
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

# FEATURE-WEB-VIVO-AGENTES-20261014

## Solicitud original

Parte del sprint: En vivo y Reglas rediseñados: marco nuevo de Agentes, Procesos con detenidas primero y Estándares por estado.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-VIVO-001: Agentes DEBE titular cuántos agentes trabajan y poner una pregunta pendiente arriba de la escena
- R-VIVO-002: Agentes DEBE enmarcar la escena con el selector de mundo y listar debajo quién trabaja
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Agentes DEBE titular cuántos agentes trabajan y poner una pregunta pendiente arriba de la escena Agentes DEBE enmarcar la escena con el selector de mundo y listar debajo quién trabaja
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROYECTO-20261014 (Proyecto con bloques e interruptores y YAML en Avanzado)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/agentes.html` — Boceto aprobado por el PO el 2026-10-14: Agentes en vivo (HTML autónomo, el original) (sha256 ac4e113abb13…)
- `.valmen/features/rediseno-mission-control/assets/agentes.png` — Captura a 1440 px del boceto aprobado: Agentes en vivo (sha256 ed81aa541fc2…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el marco de la vista Agentes de Mission Control (`#/agentes`, con los alias `#/corrida` y `#/jornadas`): `vistaCorrida()` y las funciones que solo ella usa en `packages/server/web/index.html`, más su bloque de estilos, y la parte de R-MARCO-006 que le toca (a 390 px la vista no desplaza la página a lo ancho). El motor de escena y los tres mundos (`packages/server/web/agentes/`) se conservan sin tocar: solo cambia el marco alrededor del lienzo (spec `s4-vivo-reglas/spec.md`). Referencia visual: `assets/agentes.html` y `assets/agentes.png` de la feature `rediseno-mission-control`, que mandan sobre el texto de la spec.
- Usuario o rol afectado: la persona (PO) que mira la corrida orquestada para saber cuántos agentes trabajan, si alguno le está preguntando algo y quién hace qué.
- Comportamiento actual: la vista abre con un `h2` «Agentes», una barra con «N de M agentes» y un desplegable «Simultáneos» con el texto «Se recuerda solo en este navegador»; luego seis tarjetas de cifras (entregados, cerrados, esperan al PO, trabajando, en cola, aprobaciones pendientes); después, solo si el módulo de escena cargó, los avisos de pregunta que arma el módulo, el lienzo, un selector de mundo con miniaturas (botones `aria-pressed`, en el orden pastelería, centro de control, invernadero) y el lema del mundo; debajo, tres paneles en rejilla —«Agentes vivos» con una tabla de cinco columnas (Ticket, Fase, Herramienta, Modelo, Tiempo), «Cola» por olas y «Entregados»— y al pie el detalle plegado de la jornada. No hay titular con cuentas, la pregunta pendiente no se distingue arriba ni dice la fase ni ofrece una acción, la sesión principal solo aparece en la tabla cuando cargó el módulo de escena y la escena no está enmarcada.
- Comportamiento esperado: como el boceto. Arriba, la ceja «En vivo · Agentes» y un titular con las cuentas —«2 agentes trabajando, 1 te pregunta algo»—, con el control «A la vez» a la derecha (− , la cuenta viva sobre la deseada, +). Debajo, un aviso ámbar por pregunta abierta con el ticket, la fase, el texto de la pregunta cuando el servidor lo entrega y la acción «Responder en la sesión». Luego el panel «Escena» con pestañas de mundo (Sala de control, Pastelería, Invernadero), el lienzo animado de siempre con la nota del mundo y la línea de la sesión principal; cambiar de pestaña cambia el mundo sin recargar y el mundo elegido se sigue recordando en el navegador. Debajo, la tabla de quién trabaja: la sesión principal primero y cada subagente con su ticket, fase, modelo y tiempo. Funciona a 390 px sin desplazar la página a lo ancho.

## Diagnóstico

- Memoria consultada: `buscar_memoria` («vista Agentes corrida escena mundos pregunta pendiente marco») no devolvió nada de esta vista; AP-001 (`.valmen/memory/aprendizajes.md:5`) aplica al plan: un criterio por comportamiento, sin «y».
- Causa comprobada (con `ruta:línea`): no es un defecto, es la pantalla anterior al rediseño. (1) Sin titular: `vistaCorrida()` (`packages/server/web/index.html:8427`) pinta un `h2` fijo «Agentes» (`:8467`) y la cuenta va en la barra «N de M agentes» (`:8471-8496`). (2) La pregunta pendiente no tiene aviso propio del marco: los avisos los arma el módulo (`avisosDePregunta` y `cajaDeAviso`, `packages/server/web/agentes/montaje.js:57`, `:97`) desde `pintarLienzoDeAgentes` (`index.html:8374-8390`), solo cuando el módulo cargó, sin la fase ni una acción. (3) La escena no está enmarcada: lienzo, selector de mundo con miniaturas y lema se añaden sueltos al contenido (`index.html:8392-8423`), y el orden y los nombres salen del registro de mundos (`packages/server/web/agentes/mundos/index.js:7`, pastelería primero; `packages/server/web/agentes/mundos/control.js:371` se llama «Centro de control»). (4) La tabla (`tablaDeAgentes`, `index.html:8284-8321`) tiene la columna Herramienta y un punto de estado, no el avatar ni el título del ticket; la sesión principal solo entra cuando el módulo cargó (`index.html:8546` usa `filasDePanelAgentes`, `montaje.js:115`).
- Datos con que se construye cada pieza del boceto (todos existen hoy):
  - Cuántos trabajan: `agentesVivos` (`index.html:8127`), los subagentes en `trabajando` o `esperando`, sin la sesión principal (la misma cuenta que el menú, `:8462`).
  - Cuántos preguntan: cada fila de `GET /api/corrida/agentes` trae `pregunta` (`packages/server/src/agentes.ts:94`, `PreguntaPendiente` en `:62-67`): abierta si `respondidaEn` es null. El texto (`pregunta.texto`) solo viaja cuando el servidor escucha en la máquina local (`conTexto`, `packages/server/src/server.ts:1106-1137`; recortado a 500 caracteres, `agentes.ts:48`); fuera de loopback llega sin texto y el aviso se queda en ticket y fase.
  - Fase del aviso y de la tabla: `faseConfirmada` o `faseInferida` (`fraseDeFase`, `index.html:8164`).
  - Título del ticket en la tabla: `title` de cada fila de `GET /api/tickets` (`packages/engine/src/tickets.ts:33`, devuelto en `server.ts:540-547`), que la vista ya pide (`index.html:8448`).
  - Sesión principal: la fila con `principal: true` (`agentes.ts:79-80`, armada en `:582-602`) trae `modelo`, `esfuerzo`, `rama`, `estado` y `ultimaHerramientaEn`; su ticket y sus fases son null.
  - «A la vez»: la preferencia `valmen.corrida.simultaneos` (1 a 8, por defecto 3) que ya se guarda solo en el navegador (`index.html:8119-8120`, `:8236-8252`).
  - Mundos: `montaje.mundos()`, `montaje.mundoActual()` y `montaje.elegirMundo(id)` (`montaje.js:206-224`), que ya recuerda el elegido en `valmen.agentes.mundo` (`:11`, `:33-49`); cada mundo trae `nombre` y `lema` (`packages/server/web/agentes/mundos/control.js:370-376`).
- Lo que el boceto muestra y el dato no permite (se registrará con `valmen agent-decision` y se listará en el plan como diferencia):
  - «Tiempo» como duración («41 min»): el servidor no entrega la hora de inicio de un agente, solo `ultimaHerramientaEn` (`agentes.ts:86-87`); la columna dice «hace N min» de la última herramienta, como hoy.
  - La fase de la sesión principal («Integrando»): su fila trae las fases en null (`agentes.ts:597-598`); se muestra su estado (trabajando o esperando).
  - «Responder en la sesión» no puede contestar desde la web: no hay ruta que escriba en la sesión de Claude Code; la acción despliega la indicación de dónde se contesta.
  - El texto de la pregunta, cuando el servidor no escucha en la máquina local (`server.ts:1135`).
- Restricciones de las pruebas existentes que el marco debe respetar sin editarlas (AGENTS.md «Pruebas»): `tests/vista-corrida.test.ts` exige un `h2` con el texto exacto «Agentes» y el rótulo «Agentes vivos» (`:245-247`), las seis tarjetas `tarjeta` de cifras (`:263-277`), dos filas `TR` con el modelo completo «claude-sonnet-5-5 · high», la herramienta «Edit» y «hace» (`:279-293`), la fase inferida como «implementando | inferida» (`:295-304`), el texto «2 de 3 agentes» y un `SELECT` que arranca en 3 y guarda en `valmen.corrida.simultaneos` sin escribir en el servidor (`:328-361`), la descripción pintada como texto (`:363-376`), cola por olas y entregados (`:306-326`), el aviso cuando falla `/api/corrida/agentes` (`:378-385`), el vacío sin tarjetas (`:418-430`) y el refresco cada 5 s (`:432-480`); `tests/vista-marco-responsivo.test.ts` exige un único `.corrida-paneles` con tres `.corrida-panel` titulados «Agentes vivos», «Cola», «Entregados» (`:157-232`), que la primera regla `@media (min-width: 700px)` del archivo reparta `.corrida-paneles` en dos columnas (`:133-139`) y las reglas `.corrida-lienzo`, `.corrida-mundo canvas`, `.corrida-aviso.pendiente` y `.corrida-aviso.respondio` (`:111-131`); `tests/estado-publico-web.test.ts` exige la tabla `corrida-agente` con el estado público del ticket en la fila (`:313-330`) y las líneas `corrida-item` de cola y entregados (`:297-311`); `tests/mundos-correcciones.test.ts:285-296`, `:362-385` y `tests/mundo-pasteleria.test.ts:375-388` leen reglas CSS de `.corrida-panel` y el bloque hasta `.corrida-cuenta {`; `tests/vista-texto-pregunta.test.ts:220-223` exige `.corrida-aviso .texto` con `pre-wrap`.
- Hipótesis pendientes: (H1) que el marco pueda probarse con el módulo de escena real en el arnés de Node sustituyendo `import("/agentes/montaje.js")` por la ruta del archivo e inyectando `requestAnimationFrame` (el arnés no tiene cuadro de animación, `index.html:8334`, y su `createElement("canvas")` no trae `getContext`, que `montaje.js:166` tolera); se confirma al escribir la prueba en rojo. (H2) que la tabla con avatar y cuatro columnas quepa a 390 px con la presentación en tarjetas que ya existe por debajo de 640 px (`index.html:3646-3675`); se comprueba en el navegador.
- Consumidores afectados: la persona en Mission Control; la cuenta del menú (`ponerCuenta("agentes", …)`, `index.html:8462`) y el resumen de Inicio, que leen `agentesVivos` (`:4117-4122`) y no cambian; el refresco cada 5 s (`programarRefrescoDeCorrida`, `:8603`), que vuelve a pintar el marco sin reiniciar la escena (el lienzo es único, `:8376`); el módulo de escena y sus pruebas (`tests/motor-escena.test.ts`, `tests/mundo-*.test.ts`, `tests/mundos-correcciones.test.ts`, `tests/vista-texto-pregunta.test.ts`), que no cambian porque el módulo no se toca. `GET /api/corrida/agentes` no cambia: el marco solo lee campos que ya viajan.
- Archivos y flujo investigados: `packages/server/web/index.html` (vista `:8116-8597`, estilos `:3409-3690`, tokens del tema `:77-150` con `--alerta`, `--alerta-suave`, `--modelo`, `--acento`, `--mono`, `--fuente-titulo`, enrutado `:12020-12035`, `:12272`), `packages/server/web/agentes/montaje.js`, `packages/server/web/agentes/mundos/index.js`, `packages/server/web/agentes/mundos/control.js`, `packages/server/src/agentes.ts`, `packages/server/src/server.ts:485-547` y `:1106-1137`, `packages/engine/src/tickets.ts:31-50`, `scripts/verificar-interfaz.mjs` (arnés: `ejecutarInterfaz` `:649`, DOM mínimo `:31-140`), el boceto `.valmen/features/rediseno-mission-control/assets/agentes.html` y `.valmen/features/rediseno-mission-control/assets/agentes.png`, la spec `.valmen/features/rediseno-mission-control/spec/s4-vivo-reglas/spec.md`.
- Riesgos y compatibilidad: (R1) Otros agentes editan otras vistas del mismo `index.html`: se toca solo `vistaCorrida`, `pintarLienzoDeAgentes`, `tablaDeAgentes` y funciones nuevas con prefijo propio (`agentesMarco…`, estilos `.agm-…`), sin nombres genéricos ni código ajeno; el estilo nuevo va en un bloque propio después de la primera `@media (min-width: 700px)` para no romper la lectura de `tests/vista-marco-responsivo.test.ts:133`. (R2) El texto de la pregunta es dato ajeno (sale de la conversación de un agente): se pinta solo con `textContent`, nunca como HTML. (R3) Un `\x3c!--` literal dentro del script detiene el navegador: no se escribe; se verifica en el navegador además del arnés. (R4) El refresco cada 5 s no debe reiniciar el mundo ni el lienzo: se reutiliza el lienzo único y `montaje.montar`, como hoy.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es la interfaz web local de Mission Control; no cambia la API, no hay sincronización de datos, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: en `packages/server/web/index.html`, `vistaCorrida()`, `pintarLienzoDeAgentes()`, `tablaDeAgentes()` y funciones nuevas con el prefijo `agentesMarco…` que solo ellas llaman, más un bloque de estilos propio con clases `.agm-…`; la prueba nueva `tests/vista-agentes-marco.test.ts`. Exclusiones: `packages/server/web/agentes/` (motor, montaje y los tres mundos) no se toca; no cambia ninguna ruta del servidor ni el menú; no se tocan otras vistas ni sus estilos; las pruebas existentes no se editan.
- Decisiones registradas: D-001 (Tiempo como «hace N min»), D-002 (fase de la sesión principal = su estado), D-003 («Responder en la sesión» despliega dónde se contesta, sin escribir), D-004 (se conservan cifras, cola, entregados, herramienta, modelo completo y «N de M agentes»), D-005 (pestañas rotuladas y ordenadas como la spec con `agentesMarcoMundos`), D-006 (el aviso lo arma el marco) y D-007 (ceja con `h2` «Agentes» y titular en `h1`).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - (1) Sin titular (`index.html:8467`, `:8471-8496`): paso 3 (C1, C2, C7, C8).
  - (2) Pregunta sin aviso propio (`montaje.js:57`, `:97`; `index.html:8374-8390`): paso 3 (C3, C4, C5, C6).
  - (3) Escena sin marco (`index.html:8392-8423`, `mundos/index.js:7`, `mundos/control.js:371`): paso 4 (C9, C10, C11, C12, C13).
  - (4) Tabla sin sesión principal ni título (`index.html:8284-8321`, `:8546`): paso 5 (C14, C15, C16).
  - H1 (probar con el módulo real): paso 1, la prueba sustituye la ruta del `import` e inyecta `requestAnimationFrame`.
  - H2 (390 px): pasos 6 y 9 (C17).
  - Restricciones de las pruebas existentes: pasos 3 a 6 las respetan; paso 8 las corre (C19).
- Pasos ordenados:
  1. Escribir `tests/vista-agentes-marco.test.ts` y verla en rojo con `npx vitest run tests/vista-agentes-marco.test.ts` antes de tocar código. Usa `ejecutarInterfaz` (`scripts/verificar-interfaz.mjs:649`) con `#/agentes` y respuestas de `/api/corrida/agentes`, `/api/journeys` y `/api/tickets`: una sesión principal (`principal: true`, `rama: "main"`), dos subagentes vivos —uno con `pregunta: { desde, respondidaEn: null, texto }`— y uno que terminó. Para las pestañas, una copia temporal del HTML con `import("/agentes/montaje.js")` cambiado por la URL `file://` de `packages/server/web/agentes/montaje.js` y `requestAnimationFrame`/`cancelAnimationFrame` de mentira al principio del módulo (el mismo truco que `tests/vista-corrida.test.ts:438-446`). Casos: titular con preguntas y sin agentes (C1, C2); aviso con ticket, fase, texto y marcado como texto (C3, C4, C5); «Responder en la sesión» (C6); «A la vez» (C7, C8); pestañas, `aria-selected`, sin peticiones y tabla igual (C9-C12); línea de la sesión principal (C13); tabla (C14, C15, C16).
  2. Leer los estilos de la vista (`index.html:3409-3690`) y los tokens (`:77-150`) para el bloque nuevo; leer `.valmen/rules/` de interfaz si las hay.
  3. `index.html`, cabecera y aviso: funciones nuevas `agentesMarcoTitular(vivos, preguntas)` (texto del `h1`: «N agente(s) trabajando», «, M te pregunta(n) algo» si hay preguntas abiertas, «Ningún agente trabajando» sin vivos, «Agentes» si falló la lectura), `agentesMarcoPreguntasAbiertas(filas)` (filas de la sesión principal y de los vivos con `pregunta` y `respondidaEn` null), `agentesMarcoCabecera(...)` (ceja `.agm-ceja` con «En vivo · » y el `h2` «Agentes», `h1` titular y el control «A la vez»: botón «−», cuenta viva, «/», el `select#corrida-simultaneos` de hoy estilado como cifra, botón «+» y un `span` de estado `role="status"` solo para lector de pantalla con «N de M agentes»; los botones cambian el `select`, guardan con `guardarSimultaneos` y no piden nada) y `agentesMarcoAviso(fila, numero)` (`role="alert"`, círculo «?», línea mono «TICKET · fase», el texto de la pregunta con `textContent` si viene, botón «Responder en la sesión» con `aria-expanded` que despliega «La pregunta espera en la sesión de Claude Code que orquesta la corrida: contéstala ahí. Esta pantalla solo la muestra.»); una pregunta contestada dentro del minuto que da el servidor pinta una franja verde «Una persona respondió» con la respuesta. `vistaCorrida()` pinta cabecera y avisos en lugar del `h2` y la barra de hoy (C1-C8).
  4. `index.html`, escena: `pintarLienzoDeAgentes` pasa a devolver la sección `agentesMarcoEscena` (`section aria-label="Escena de la ejecución"`): título «Escena», `role="tablist"` con una pestaña `role="tab"` por mundo según `agentesMarcoMundos = [["control", "Sala de control"], ["pasteleria", "Pastelería"], ["invernadero", "Invernadero"]]` (solo los ids que `montaje.mundos()` trae; otro mundo va al final con su `nombre`), `aria-selected` y flechas izquierda/derecha entre pestañas; el panel con la nota del mundo (`mundo.lema`) en mono, el lienzo único de hoy y, si hay sesión principal, la línea discontinua «S · Sesión principal: reparte e integra · solo ella toca main». Elegir pestaña llama a `montaje.elegirMundo(id)`, actualiza `aria-selected`, la nota y los títulos de los paneles (`aplicarMundoAPaneles`), sin repintar la vista ni pedir nada. Sin módulo de escena la sección no se pinta, como hoy (C9-C13).
  5. `index.html`, tabla: `agentesMarcoFilas(agentes)` (la sesión principal primero y luego los vivos, sin depender del módulo) y `tablaDeAgentes` reescrita con la tabla `corrida-agente` de cinco columnas (avatar, Ticket, Fase, Modelo, Tiempo, con `data-rotulo`): avatar «S» en cian para la principal y «A1…An» en lila para los subagentes, con anillo ámbar si preguntan; Ticket con el título del registro (o la descripción, o el id) en negrita, el id en mono, el estado público del ticket (`etiquetaDeEstadoPublico`) y la descripción si difiere del título; para la principal, «Sesión principal» y «orquesta N tickets · <rama>»; Fase con `corrida-fase`, la marca «inferida», la marca ámbar «pregunta» si la hay y la herramienta con su hora en segunda línea; Modelo en mono lila con el esfuerzo; Tiempo «hace N min» (D-001, D-002). La tabla va en el panel «Agentes vivos», primero de `.corrida-paneles`, que ocupa el ancho completo con la clase `agm-quien`; cola, entregados y las seis cifras siguen debajo (D-004) (C14, C15, C16).
  6. `index.html`, estilos en un bloque propio `/* ── Agentes: marco (FEATURE-WEB-VIVO-AGENTES-20261014) */` después de los de la vista, solo con tokens (`--alerta`, `--alerta-suave`, `--modelo`, `--acento`, `--sobre-acento`, `--panel`, `--panel-alto`, `--borde`, `--tenue`, `--mono`, `--fuente-titulo`) y clases `.agm-…`: cabecera flexible que envuelve, titular de 38 px que baja a 28 px por debajo de 640 px, aviso ámbar con borde y botón ámbar, pestañas segmentadas con desplazamiento propio, panel de escena con radio 16 px, avatar de 30 px, `.agm-quien { grid-column: 1 / -1; }`, `.agm-solo-lector` para el estado oculto; sin una regla `@media (min-width: 700px)` antes de la existente (C17).
  7. `npm run build` para que `packages/cli/dist/web/index.html` coincida con la fuente (C19).
  8. Regresión: `npx vitest run tests/vista-agentes-marco.test.ts tests/vista-corrida.test.ts tests/vista-marco-responsivo.test.ts tests/estado-publico-web.test.ts tests/mundos-correcciones.test.ts tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/mundo-invernadero.test.ts tests/motor-escena.test.ts tests/vista-texto-pregunta.test.ts tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts tests/estaticos-web.test.ts tests/tema-tokens.test.ts tests/inicio-decisiones.test.ts` y `node scripts/verificar-interfaz.mjs`; si una prueba existente se pone en rojo no se edita: se detiene y se reporta en el ticket (C19).
  9. Verificación en el navegador con `node packages/cli/dist/main.js serve` desde el worktree, con Chrome sin pantalla: `#/agentes` a 1440 px en oscuro contra `.valmen/features/rediseno-mission-control/assets/agentes.png` y en claro (C18), a 390 px sin desplazamiento horizontal de la página en los dos modos (C17), cambio de pestaña con la escena animada, la consola sin errores; `revisar_presentacion` sin avisos; capturas como evidencia del ticket. Se cierran el servidor y el navegador al terminar.
- Diferencias con el boceto (se repiten en «Implementación» con lo que quede): (1) Tiempo «hace N min» en vez de duración (D-001); (2) la fase de la sesión principal es su estado, no «Integrando» (D-002); (3) «Responder en la sesión» despliega dónde se contesta (D-003); (4) el modelo se muestra completo con su esfuerzo («claude-sonnet-5-5 · high», no «sonnet-5-5»), la fase lleva la herramienta en segunda línea y el ticket su estado público, y debajo de la tabla siguen la cola, los entregados, las seis cifras y el detalle plegado de la jornada (D-004); (5) el panel de la tabla conserva su título «Agentes vivos», que cada mundo renombra como hoy, y los estilos de panel de cada mundo; (6) la escena es el lienzo animado de siempre, no la fila de estaciones del boceto, que el boceto mismo marca como ilustración del motor que se conserva; (7) el texto de la pregunta falta cuando el servidor no escucha en la máquina local; (8) el mundo por defecto sigue siendo la pastelería del montaje.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 700 líneas (unas 380 de producción —unas 230 de JavaScript y 150 de estilos en `index.html`— y unas 320 de pruebas); 19 criterios.
- Si excede el tope: sigue: titular, aviso, escena y tabla son el marco de una sola vista que se pinta en la misma función y comparte las mismas pruebas; el grafo de la feature asignó R-VIVO-001 y R-VIVO-002 a este ticket y partirlo exige abrir otro, que es decisión de una persona.
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni API que deshacer, y la preferencia `valmen.corrida.simultaneos` y el mundo elegido siguen en las mismas claves del navegador.

## Criterios de aceptación

- [x] C1 (R-VIVO-001): con dos agentes vivos y uno con pregunta abierta, el `h1` dice «2 agentes trabajando, 1 te pregunta algo»
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C2 (R-VIVO-001): sin agentes vivos, el `h1` dice «Ningún agente trabajando»
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C3 (R-VIVO-001): una pregunta abierta pinta antes de la escena un aviso `role="alert"` que nombra su ticket con su fase
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C4 (R-VIVO-001): el aviso muestra el texto de la pregunta cuando la fila lo trae
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C5 (R-VIVO-001): un texto de pregunta con marcado HTML se pinta como texto, sin crear elementos
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C6 (R-VIVO-001): «Responder en la sesión» despliega la indicación de dónde se contesta sin ninguna petición al servidor
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C7 (R-VIVO-001): el control «A la vez» muestra la cuenta viva sobre la deseada como «2 / 3»
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C8 (R-VIVO-001): «+» sube la deseada a 4 guardada en `valmen.corrida.simultaneos` sin escribir en el servidor
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C9 (R-VIVO-002): la escena tiene un `tablist` con las pestañas de mundo en el orden de la spec («Sala de control» primero)
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C10 (R-VIVO-002): elegir «Pastelería» desde «Sala de control» deja solo esa pestaña con `aria-selected="true"`
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C11 (R-VIVO-002): cambiar de mundo no hace ninguna petición al servidor
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C12 (R-VIVO-002): cambiar de mundo deja la tabla de agentes con las mismas filas
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C13 (R-VIVO-002): con sesión principal, la escena muestra la línea «Sesión principal: reparte e integra · solo ella toca main»
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C14 (R-VIVO-002): la primera fila de la tabla es la sesión principal con su rama
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C15 (R-VIVO-002): la fila de cada subagente vivo lleva el título de su ticket encima de su id
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C16 (R-VIVO-002): la fila de un agente con pregunta abierta marca su fase con «pregunta»
      <!-- test: npx vitest run tests/vista-agentes-marco.test.ts -->
- [x] C17 (R-MARCO-006): a 390 px la vista Agentes no desplaza la página a lo ancho en ninguno de los dos modos de color
      <!-- verify: manual -->
- [x] C18 (R-VIVO-002): a 1440 px la vista coincide con `agentes.png` salvo las diferencias listadas en el plan
      <!-- verify: manual -->
- [x] C19 (R-VIVO-002): las pruebas existentes de la vista Agentes siguen en verde sin editarse
      <!-- test: npx vitest run tests/vista-corrida.test.ts tests/vista-marco-responsivo.test.ts tests/estado-publico-web.test.ts tests/mundos-correcciones.test.ts tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/mundo-invernadero.test.ts tests/motor-escena.test.ts tests/vista-texto-pregunta.test.ts tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts tests/estaticos-web.test.ts tests/tema-tokens.test.ts tests/inicio-decisiones.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-WEB-VIVO-AGENTES-20261014",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/web/index.html",
      "tests/vista-agentes-marco.test.ts"
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

- Archivos: `packages/server/web/index.html` (vista Agentes y su bloque de estilos) y la prueba nueva `tests/vista-agentes-marco.test.ts`. `packages/server/web/agentes/` (motor, montaje y los tres mundos) no se tocó; ninguna ruta del servidor cambió.
- Funciones nuevas, todas con prefijo propio: `agentesMarcoMundos`, `agentesMarcoIndicacion`, `agentesMarcoEstados`, `agentesMarcoIndicacionesAbiertas`, `agentesMarcoFilas`, `agentesMarcoPreguntaAbierta`, `agentesMarcoTextoVisible`, `agentesMarcoSiglas`, `agentesMarcoTitular`, `agentesMarcoAvatar`, `agentesMarcoQuien`, `agentesMarcoAviso`, `agentesMarcoALaVez`, `agentesMarcoCabecera`, `agentesMarcoCeldaTicket` y `agentesMarcoEscena`; estilos `.agm-…` en el bloque «Agentes: marco», solo con tokens del tema (`revisar_presentacion`: nada que avisar).
- `vistaCorrida()` pinta la ceja con el `h2` «Agentes», el titular en `h1` y «A la vez» (−, la cuenta viva, «/», el `select#corrida-simultaneos` de siempre, +, y «N de M agentes» para lector de pantalla); luego un aviso ámbar `role="alert"` por pregunta abierta; la escena enmarcada (pestañas `role="tab"` Sala de control, Pastelería, Invernadero con flechas, nota del mundo, el lienzo único y la línea de la sesión principal); la tabla `corrida-agente` en el panel «Agentes vivos» a todo el ancho; cola y entregados; las seis cifras; el detalle plegado de la jornada.
- Desvío menor del paso 4 del plan: `pintarLienzoDeAgentes` se reemplazó por `agentesMarcoEscena` (devuelve la sección) en vez de conservar el nombre; sin otros llamadores.
- Ajustes hallados en el navegador: la indicación de «Responder en la sesión» se recuerda entre los refrescos de 5 s (`agentesMarcoIndicacionesAbiertas`); los `:hover` del marco suben de especificidad para ganar al `button:hover` general; la tabla de quién trabaja no toma el tema de panel de cada mundo (papel, pizarra, telemetría), porque sus colores fijos dejaban la fase ilegible en modo claro: cola y entregados lo conservan.
- Pruebas existentes que se pusieron en rojo durante el desarrollo, sin editarlas: (1) `tests/vista-texto-pregunta.test.ts` «C12: pintarAvisos arma la caja con modulo.cajaDeAviso(document, aviso)» (busca ese texto en `index.html`): la vista volvió a usar `modulo.cajaDeAviso(document, aviso)` para las preguntas recién respondidas, como antes; las abiertas van en el aviso del marco (D-006). (2) `tests/vista-corrida.test.ts` «C15: una descripción con marcado HTML se pinta como texto» (no admite ningún `B`): los títulos de fila van en `span` con peso 600, no en `<b>`. (3) `tests/estado-publico-web.test.ts` «C13» (busca `className === "corrida-agente"`): la tabla conserva esa clase exacta y el estilo nuevo se ancla en `.agm-quien`. Las tres vuelven a verde sin tocarlas.
- Diferencias con el boceto (D-001 a D-007): (1) Tiempo dice «hace N min» de la última herramienta, no la duración (D-001); (2) la fase de la sesión principal es su estado (Trabajando, Esperando, Terminó), no «Integrando» (D-002); (3) «Responder en la sesión» despliega dónde se contesta, sin escribir nada (D-003); (4) se conservan las seis cifras, la cola, los entregados y el detalle de la jornada debajo de la tabla, la herramienta con su hora en la fase, el modelo completo con su esfuerzo («claude-opus-5-5», no «opus-5-5») y el estado público del ticket en la fila (D-004); (5) las pestañas siguen la spec, aunque el mundo por defecto sigue siendo la pastelería del montaje (D-005); (6) las preguntas recién respondidas siguen en la caja verde del módulo y solo con el módulo cargado (D-006); (7) la ceja lleva el `h2` «Agentes» (D-007); además, el panel de la tabla conserva su título, que cada mundo renombra («Telemetría», «Comandas»), la escena es el lienzo animado y no la fila de estaciones dibujada en el boceto, y el texto de la pregunta falta si el servidor no escucha en la máquina local.

## Pruebas

- Directorio: la raíz del repositorio (o del worktree `.claude/worktrees/ticket-vivo-agentes`).
- Requisitos de ambiente: Node 24 con `npm install` hecho; `npm run build` antes de abrir la interfaz (el servidor sirve `packages/cli/dist/web/` y la lee al arrancar: tras compilar hay que reiniciar `serve`); Chrome para la verificación visual.
- Rojo antes de implementar: `npx vitest run tests/vista-agentes-marco.test.ts` → 11 fallidas de 11 (sin titular, sin aviso, sin pestañas).
- Comandos y resultado esperado:
  1. `npx vitest run tests/vista-agentes-marco.test.ts` → 11 pruebas en verde (C1-C16).
  2. `npx vitest run tests/vista-corrida.test.ts tests/vista-marco-responsivo.test.ts tests/estado-publico-web.test.ts tests/mundos-correcciones.test.ts tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/mundo-invernadero.test.ts tests/motor-escena.test.ts tests/vista-texto-pregunta.test.ts tests/menu-grupos.test.ts tests/interfaz-ejecutable.test.ts tests/estaticos-web.test.ts tests/tema-tokens.test.ts tests/inicio-decisiones.test.ts` → todas en verde (C19); con la prueba nueva, 15 archivos y 335 pruebas.
  3. `npm run build` y `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.».
- Validaciones manuales hechas por el agente (Chrome sin pantalla por CDP, datos de muestra inyectados antes del módulo: sesión principal, un subagente con pregunta abierta y otro trabajando; capturas en `evidencia/`):
  1. 1440 px oscuro (`evidencia/agentes-1440-oscuro.png`) y claro (`evidencia/agentes-1440-claro.png`) contra `agentes.png`: ceja, titular «2 agentes trabajando, 1 te pregunta algo», «A la vez 2 / 3», aviso ámbar con ticket, fase, pregunta y botón, escena con pestañas y línea de la sesión principal, tabla S/A1/A2 con la fase ámbar «análisis · pregunta» (C18).
  2. 390 px oscuro y claro (`evidencia/agentes-390-*.png`): `scrollWidth` = 390, sin desplazamiento horizontal de la página; la tabla pasa a tarjetas y las pestañas desplazan dentro de su caja (C17).
  3. Pestaña «Pastelería» desde «Sala de control» sin recargar (`evidencia/agentes-1440-oscuro-pasteleria.png`): cambia `aria-selected`, guarda `valmen.agentes.mundo`, cambia la nota del mundo y la tabla queda igual; el lienzo anima (cambian sus píxeles entre dos lecturas); consola sin errores.
  4. Con los datos reales del proyecto (`node packages/cli/dist/main.js serve --port 48731`, proyecto `valmen-harness`): la vista pinta la corrida en marcha y la escena anima.
- Tras traer main (commit de fusión 13b890d): `npm run build`, las 18 pruebas de interfaz (con `tests/portafolio-vista.test.ts`, `tests/trabajo-features.test.ts` y `tests/vista-tickets-turno.test.ts`: 372 en verde), `node scripts/verificar-interfaz.mjs` («Interfaz verificada.») y las capturas de `evidencia/` rehechas sobre el resultado fusionado; con datos reales, Agentes, Tickets, Features, Portafolio e Inicio pintan.
- Validaciones manuales para el responsable: abrir `#/agentes` con una corrida orquestada en marcha; con un subagente que pregunte (AskUserQuestion) ver el aviso ámbar y el titular «…, 1 te pregunta algo»; pulsar «Responder en la sesión» y comprobar que la indicación sigue abierta tras el refresco de 5 s; cambiar de mundo; mirar la vista a 390 px.
- Hallazgo ajeno al ticket (no se corrigió): con mucha actividad en el registro, cada evento del flujo dispara `marcarPendientes` (`/api/standards`, `/api/tickets`, `/api/inicio`) y el servidor tarda en responder, así que cualquier vista puede tardar varios segundos en pintar; se vio también con el servidor de otra rama.

- Resultado del PO: pasaron — «se ejecutaron los comandos de prueba y pasan correctamente» (juan andrade, Mission Control, 2026-10-14)

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-14",
    "build_reference": "commit:bf9cb463ca84842f5d8c287a7216f6e67b4db693",
    "environment": "local: Mission Control con valmen serve, Chrome, modo oscuro y claro",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-14",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "ya he estado verificando y yo veo casi todo bien; podrias correr las ratificaciones y cerrar"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "npx vitest run: 5481 pruebas en verde; node scripts/verificar-interfaz.mjs: Interfaz verificada; tests/vista-agentes-marco.test.ts; tests/ancho-vistas.test.ts: la vista llena el ancho a 2000 px",
    "reference": "worktree:sha256:0613397ca18d417db7d1618ab517078bee340ea2ec97bdb3528dd562ad2f87d8",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-14",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "ya he estado verificando y yo veo casi todo bien; podrias correr las ratificaciones y cerrar"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-14",
    "technical_summary": "Marco nuevo de la vista Agentes (titular con cuentas, aviso de pregunta pendiente, selector de mundo y tabla); el motor de escena y los mundos no cambian.",
    "functional_summary": "Agentes dice cuantos agentes trabajan y cuantos preguntan, y lista quien hace que.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Solo visual en la interfaz local de Mission Control; sin migracion, sincronizacion ni despliegue. Se revierte con el commit del ticket."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-14",
    "session_reference": null,
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de la sesión orquestadora 4bafa011-0b4c-4a99-9312-df4519e031cc; hizo análisis, plan e implementación de este ticket en una sola sesión. Sin números: el subagente no ve el agregado de tokens; el costo completo queda en la sesión orquestadora.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de la corrida orquestada sin agregado de tokens expuesto en la sesión",
    "confidence": "medium",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-14",
    "session_reference": "4bafa011-0b4c-4a99-9312-df4519e031cc",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 6 tickets (FEATURE-WEB-TEMA-TOKENS-20261014 ×32, FEATURE-WEB-VIVO-PROCESOS-20261014 ×23, FEATURE-WEB-VIVO-AGENTES-20261014 ×18, FEATURE-WEB-MENU-GRUPOS-20261014 ×15, FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 ×13), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 1062354 tokens (sin los subagentes con ticket propio). Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Rediseño visual del harness\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:4bafa011-0b4c-4a99-9312-df4519e031cc",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-14",
    "session_reference": "4bafa011-0b4c-4a99-9312-df4519e031cc/agent-ab83e95b02626acde",
    "model": "anthropic/claude-opus-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 30 intervención(es) sobre el registro, 3 con fallo. 30 de 148 mensajes tocaron el registro. Subagente de la sesión 4bafa011-0b4c-4a99-9312-df4519e031cc; su gasto no está en la madre. Duró 35 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 36590581 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 341020,
    "output_tokens": 128321,
    "total_tokens": 469341,
    "estimated_cost_usd": null,
    "source": "claude:4bafa011-0b4c-4a99-9312-df4519e031cc/agent-ab83e95b02626acde",
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
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:28.868Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:56.577Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/agentes.html, .valmen/features/rediseno-mission-control/assets/agentes.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T13:51:28.720Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:51.513Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿Qué muestra la columna Tiempo si el servidor no entrega la hora de inicio del agente?\",\"eleccion\":\"«hace N min» desde la última herramienta (ultimaHerramientaEn), como hoy\",\"alternativas\":[\"duración desde el inicio (dato inexistente); agregar la hora de inicio a /api/corrida/agentes (cambio de servidor fuera del alcance de un marco)\"],\"criterio\":\"conservador y reversible: solo se leen campos que ya viajan; la spec dice que en Agentes cambia solo el marco\",\"fuente\":\"packages/server/src/agentes.ts:86\",\"reversion\":\"cambiar la celda Tiempo en tablaDeAgentes de index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:51.890Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Qué fase muestra la fila de la sesión principal, que el boceto rotula «Integrando»?\",\"eleccion\":\"su estado (Trabajando o Esperando), porque su fila trae las fases en null\",\"alternativas\":[\"inventar «Integrando» (dato que no existe); dejar «—»\"],\"criterio\":\"no se pinta un dato que el servidor no da; el estado es real y dice si la sesión está activa\",\"fuente\":\"packages/server/src/agentes.ts:597\",\"reversion\":\"cambiar la celda Fase de la fila principal en index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:52.228Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Qué hace «Responder en la sesión» si la web no puede contestar en la sesión de Claude Code?\",\"eleccion\":\"despliega una indicación de dónde se contesta (la sesión de Claude Code que orquesta la corrida), con aria-expanded; no escribe nada\",\"alternativas\":[\"un enlace profundo a la app (no hay contrato conocido); quitar el botón (se aparta del boceto)\"],\"criterio\":\"conserva la acción del boceto sin prometer lo que la web no hace; solo lectura como el resto de la vista\",\"fuente\":\"packages/server/src/server.ts:1106\",\"reversion\":\"quitar el botón del aviso en index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:52.569Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Qué se hace con lo que hoy muestra la vista y el boceto no: las seis cifras, la cola por olas, los entregados, la herramienta, el modelo completo y la cuenta «N de M agentes»?\",\"eleccion\":\"se conserva: la cola y los entregados debajo de la tabla, las cifras después, la herramienta en una segunda línea de la fase, el modelo con su esfuerzo y «N de M agentes» como estado para lector de pantalla del control «A la vez»\",\"alternativas\":[\"quitarlo para calcar el boceto (pone en rojo pruebas existentes que no se editan)\"],\"criterio\":\"AGENTS.md: una prueba existente en rojo no se edita; la spec solo cambia el marco y estas piezas son información que la persona usa hoy\",\"fuente\":\"tests/vista-corrida.test.ts:263\",\"reversion\":\"mover o quitar los bloques en vistaCorrida de index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:52.915Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"¿Cómo se nombran y ordenan las pestañas de mundo si el registro de mundos dice «Centro de control» y pone la pastelería primero?\",\"eleccion\":\"el marco las ordena y rotula como la spec (Sala de control, Pastelería, Invernadero) con una tabla propia agentesMarcoMundos; el mundo por defecto sigue siendo el del montaje\",\"alternativas\":[\"usar mundo.nombre y el orden del registro (se aparta de la spec); cambiar mundos/index.js o control.js (el motor y los mundos se conservan sin tocar)\"],\"criterio\":\"la spec R-VIVO-002 nombra las tres pestañas y prohíbe tocar packages/server/web/agentes/\",\"fuente\":\".valmen/features/rediseno-mission-control/spec/s4-vivo-reglas/spec.md:27\",\"reversion\":\"usar mundo.nombre en la pestaña\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:53.254Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"¿El aviso de pregunta lo arma el módulo de escena o el marco?\",\"eleccion\":\"el marco, con los datos de pregunta de cada fila, aunque el módulo no cargue; el módulo conserva avisosDePregunta y cajaDeAviso sin uso desde la vista\",\"alternativas\":[\"seguir con cajaDeAviso del módulo (sin fase ni acción y solo con el módulo cargado)\"],\"criterio\":\"R-VIVO-001 pide el aviso arriba de la escena con ticket, fase y acción; el módulo no se toca\",\"fuente\":\"packages/server/web/agentes/montaje.js:97\",\"reversion\":\"volver a llamar a cajaDeAviso desde pintarLienzoDeAgentes\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T13:52:58.875Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"¿Cómo se encabeza la vista si una prueba existente exige un h2 con el texto exacto «Agentes» y el boceto pone la ceja «En vivo · Agentes» sobre el titular?\",\"eleccion\":\"la ceja lleva «En vivo · » y un h2 «Agentes» en línea; el titular con las cuentas es el h1\",\"alternativas\":[\"titular en h2 (rompe la prueba); quitar el h2 (rompe la prueba)\"],\"criterio\":\"AGENTS.md: una prueba existente no se edita; el aspecto queda igual al boceto\",\"fuente\":\"tests/vista-corrida.test.ts:245\",\"reversion\":\"cambiar la ceja en vistaCorrida de index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T13:54:55.896Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T13:58:22.708Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El plan respalda las tres proposiciones: C12 tiene un caso de prueba y un mecanismo que no repinta la vista, el diagnóstico queda cubierto punto por punto y las pruebas existentes se protegen con regresión y exclusiones explícitas.\",\"planHash\":\"sha256:96bed747a50525e1fa8d4ba91d56297e5ee61fbdd2361503e266e074a695fc21\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-VIVO-AGENTES-20261014-plan-1\",\"receiptStateHash\":\"sha256:c66261d072f175dacae52f73068562c0e04e4c2fb7c2bfefd675a1711f217f93\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T13:58:26.264Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:96bed747a50525e1fa8d4ba91d56297e5ee61fbdd2361503e266e074a695fc21."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T13:58:26.264Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T13:58:35.364Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T14:18:47.672Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T14:18:50.934Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T14:21:20.831Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":995,\"borradas\":112,\"total\":1107,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T14:47:35.341Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261014-FEATURE-WEB-VIVO-AGENTES-20261014-plan-1, canal mission-control, decidida 2026-10-14T14:47:35.325Z): se revisa y pasa lo pedido"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T14:48:43.774Z",
    "action": "user-tests-result",
    "actor": "cli",
    "details": "juan andrade anotó el resultado de sus pruebas: pasaron."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T14:48:44.244Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:49.561Z",
    "action": "agent-decisions-ratified",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"quote\":\"podrias correr las ratificaciones y cerrar\",\"source\":\"cli\",\"ratifica\":[\"D-001\",\"D-002\",\"D-003\",\"D-004\",\"D-005\",\"D-006\",\"D-007\",\"EVENT-012\"]}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:51.870Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:52.498Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:52.833Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:53.200Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:53.519Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:53.804Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:54.368Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:54.765Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:55.057Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:55.331Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:55.606Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:55.879Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:56.186Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-10-14",
    "at": "2026-10-14T15:10:56.657Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
