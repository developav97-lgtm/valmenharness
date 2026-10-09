---
schema_version: 2
id: FEATURE-WEB-MUNDO-PASTELERIA-20261008
title: Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo
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
created: 2026-10-08
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-MUNDO-PASTELERIA-20261008

## Solicitud original

Parte del sprint: Los tres mundos completos y validados contra el prototipo.
- R-ESC-011: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada
- R-MUN-001: Cada mundo DEBE implementar la misma interfaz sobre el motor
- R-MUN-002: Cada mundo DEBE dar un puesto propio a la sesión principal
- R-MUN-003: Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje
- R-MUN-004: La pastelería DEBE ser el obrador del prototipo
- R-MUN-007: Los personajes DEBEN ser los sprites del prototipo
- R-MUN-008: Cada mundo DEBE pasar la validación visual contra el prototipo
Depende de: FEATURE-WEB-VISTA-LIENZO-20261008, IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada Cada mundo DEBE implementar la misma interfaz sobre el motor Cada mundo DEBE dar un puesto propio a la sesión principal Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje La pastelería DEBE ser el obrador del prototipo Los personajes DEBEN ser los sprites del prototipo Cada mundo DEBE pasar la validación visual contra el prototipo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-011: lo cubre IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008 (Marco con tokens del tema, celular, iPad y reduced-motion)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008 (Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ningún elemento del pedido nombra algo que el código no tenga: estaciones, estados visuales, `pregunta`, cola y entregados ya existen (`packages/server/web/agentes/motor.js:8-19`, `packages/server/src/agentes.ts:63-79`, `packages/server/web/index.html:6222-6227`). Había tres decisiones de diseño donde el código actual y el prototipo no coinciden. El PO las decidió el 2026-10-09 con estas palabras: «Recomiendo B, con lo propuesto en las tres decisiones». Queda decidida la propuesta de cada una:

1. Paneles. El prototipo tiene dos (`vista-agentes.html:115-123`: «Comandas» con los agentes y «Vitrina» con cola y entregados); la vista tiene tres (`index.html:6531-6573`: «Agentes vivos», «Cola», «Entregados»), ya aprobados en IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008. Pregunta: ¿se conservan los tres paneles con títulos del mundo («Comandas», «En espera», «Vitrina») o se funden cola y entregados en una sola «Vitrina» como en el prototipo? Decidido por el PO: tres paneles con títulos del mundo, «Comandas», «En espera» y «Vitrina» (fundirlos cambiaría el marco de otro ticket).
2. Tipografía. El prototipo carga Fraunces desde Google Fonts (`vista-agentes.html:3`); la interfaz local no carga ninguna fuente externa (`index.html` no tiene `fonts.googleapis` ni `@font-face`). Pregunta: ¿se acepta la pila `"Fraunces", Georgia, serif` sin descarga externa, anotando la diferencia en la validación de UI? Decidido por el PO: Fraunces sin descargarla de Google Fonts, con Georgia de respaldo (una herramienta local no pide recursos a un tercero).
3. Señal en «Degustación». En el prototipo la lámpara solo existe en el mostrador de Anita (`vista-agentes.html:316-324`); en la estación 5 la pregunta se ve solo con el rótulo rojo y el «?» del personaje. Pregunta: ¿la degustación conserva exactamente eso o lleva también su propia señal? Decidido por el PO: la degustación solo con el rótulo rojo y el «?», como el prototipo.

## Descripción funcional

- Alcance: reemplazar el dibujo provisional de `packages/server/web/agentes/mundos/pasteleria.js` por el obrador del prototipo `.valmen/features/vista-agentes/assets/vista-agentes.html` (mundo pastelería): escenario, ocho puestos, pase de la sesión principal con su cola, pasteleros como sprites 12×16 a escala 3, pastel que crece por estación, señal de pregunta y respuesta, miniatura del selector y paneles con el estilo de pizarra. Como es el primer mundo, fija la plantilla que reutilizan FEATURE-WEB-MUNDO-CONTROL-20261008 y FEATURE-WEB-MUNDO-INVERNADERO-20261008: el módulo de sprites compartido, los datos extra que el montaje entrega al dibujo y el formato de los criterios. Fuera de alcance: el motor (`motor.js`), los otros dos mundos y el marco responsivo, que el grafo asigna a otros tickets (AP-003, `.valmen/memory/aprendizajes.md:21`).
- Usuario o rol afectado: el PO que sigue la corrida en la vista Agentes de la consola local con el mundo «Pastelería», que es el mundo por defecto (`packages/server/web/agentes/mundos/index.js:9`).
- Comportamiento actual: la pastelería es un esquema provisional: fondo crema, ocho rectángulos rotulados en fila a y=130, un rectángulo para el puesto principal arriba al centro y cada agente como un círculo de color según su estado visual (`pasteleria.js:17-52`). No hay sprites, pastel, pase, cola, vitrina, señal de pregunta ni respuesta; los paneles usan los tokens del tema sin estilo de mundo.
- Comportamiento esperado: la escena es la vista lateral del obrador del prototipo con los datos reales de `/api/corrida/agentes`: la sesión principal en el pase con delantal oscuro, insignia dorada y las comandas de la cola junto a ella; cada subagente es un pastelero con toque y delantal blanco que camina por detrás del mostrador hasta el puesto de su `ticketEstado`, llevando el pastel de su estación; el horno brilla y echa vapor mientras alguien trabaja ahí; la lámpara del mostrador de Anita parpadea con una pregunta abierta y Anita aparece en la ventanilla cuando se respondió hace menos de un minuto; la vitrina muestra los entregados; los paneles se ven como pizarra verde con marco de madera y títulos en Fraunces.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - El dibujo de la pastelería es provisional por diseño: el propio archivo lo declara y delega el dibujo fiel en este ticket (`packages/server/web/agentes/mundos/pasteleria.js:3-5`). `dibujar` pinta rectángulos y círculos (`pasteleria.js:22-50`) y la paleta son literales sin `valmen:allow-color` (`pasteleria.js:10,22,24,31,38`).
  - Las posiciones no son las del prototipo: `posicion` pone las estaciones en `60 + i*120`, con carril vertical `200 + (carril % 5) * 50` (`pasteleria.js:12-14`), y el puesto principal en `{480, 70}` (`pasteleria.js:60`). En el prototipo las estaciones van en `180 + i*101`, todos los pies en y=364 con desplazamiento horizontal `((idx % 3) - 1) * 22`, y el pase en `{64, 364}` (`vista-agentes.html:224-229,294`).
  - El dibujo no recibe lo que el prototipo necesita para el pase y la vitrina: el montaje llama a `mundo.dibujar({ ctx, escena, miniatura: false }, escena.t)` (`packages/server/web/agentes/montaje.js:132-136`) y `montar(lienzo, filas, ahoraMs)` solo guarda las filas de agentes (`montaje.js:156-165`). La cola y los entregados existen en la vista (`kpis.cola`, `kpis.entregadosIds`, `index.html:6222-6227,6541-6571`) pero no llegan al mundo, y tampoco la hora de pared: `escena.t` son segundos de animación (`motor.js:132`), mientras `pregunta.respondidaEn` es ISO (`agentes.ts:78-79`) y se compara con `VENTANA_RESPUESTA_MS` (`montaje.js:14,69-70`).
  - Los sprites no tienen dónde vivir: el prototipo los define una vez para los tres mundos (`vista-agentes.html:170-198`, bases, piernas, sombreros y `personaje`), y hoy no existe un módulo compartido. Un archivo nuevo del cliente solo se sirve si está en `ARCHIVOS_WEB` (`packages/server/src/server.ts:2346-2354`), y la prueba C27 fija esa lista exacta (`tests/estaticos-web.test.ts:16-28`): de ahí el «estático declarado» del título.
  - El prototipo usa azar en el dibujo (vapor con `Math.random`, `vista-agentes.html:331`; colores, pelo y piel por agente, `vista-agentes.html:204-206`), y el motor es puro y sin azar (`motor.js:3-5`). Los atributos del sprite y el vapor tienen que derivarse de datos estables (el `carril` del agente, `motor.js:104`, y `escena.t`).
  - Los paneles de la vista usan solo tokens del tema (`index.html:2233-2247,6531-6535`) y no saben qué mundo está activo; el estilo de pizarra del prototipo está en CSS por `data-mundo` (`vista-agentes.html:73-75`) y sus títulos salen del mundo (`vista-agentes.html:147,484-488`).
  - `revisar_presentacion` no inspecciona los `.js`: `UI_EXTENSIONS` no incluye `.js` (`packages/engine/src/presentation.ts:38-57`), así que los colores del lienzo no los ve la herramienta y el marcado `valmen:allow-color` de R-ESC-011 en `pasteleria.js` y en el módulo de sprites solo se puede comprobar con una prueba propia; el CSS de los paneles en `index.html` sí lo revisa (`presentation.ts:96`, marca por línea).
- Hipótesis pendientes:
  - El contrato de dibujo se amplía sin romper el motor: `dibujar(estado, t)` ya recibe `estado: unknown` (`motor.d.ts:24`) y `validarMundo` no mira campos extra (`motor.js:52-71`), así que agregar `cola`, `entregados` y `ahoraMs` al estado, y `paneles` (títulos y nombre de estilo) al mundo como campo opcional, no debería tocar `motor.js`. Se comprueba al planificar con las pruebas del motor (`tests/motor-escena.test.ts`).
  - La miniatura del selector se dibuja con una escena vacía y sin cola (`index.html:6410-6416`); el dibujo debe tolerar la ausencia de `cola`, `entregados` y `ahoraMs`. Se comprueba con una prueba sobre un contexto de lienzo falso.
  - El paso de marcha del prototipo es `[0, 1, 0, 2][floor(paso) % 4]` (`vista-agentes.html:188`) y el motor ya avanza `paso` a 8 por segundo en marcha y 2 en reposo (`motor.js:154`), igual que el prototipo (`vista-agentes.html:246`): se puede reutilizar tal cual.
  - El pastel por estación usa el índice de estación del motor (`AgenteEnEscena.estacion`, `motor.d.ts:48`) en lugar de `tk.etapa`; con desvío (`blocked`, `changes_requested`) el agente queda en la última estación válida (`motor.js:33-36`) y el pastel debería mostrarse en esa etapa.
- Consumidores afectados:
  - `packages/server/web/index.html:6375-6430` (lienzo, miniatura y `montar`) y `:6530-6573` (paneles): pasa la cola, los entregados y la hora al montaje, y aplica el título y el estilo del mundo a los paneles.
  - `packages/server/web/agentes/montaje.js:132-136,156-180`: entrega al dibujo los datos extra y los conserva al cambiar de mundo.
  - `packages/server/src/server.ts:2346-2354` y `tests/estaticos-web.test.ts:16-28`: si se agrega el módulo de sprites.
  - `tests/vista-lienzo.test.ts:238-246` (C16, C17): los mundos registrados deben seguir cumpliendo la interfaz.
  - FEATURE-WEB-MUNDO-CONTROL-20261008 y FEATURE-WEB-MUNDO-INVERNADERO-20261008: heredan el módulo de sprites y la forma del estado de dibujo que este ticket define.
- Archivos y flujo investigados: `GET /api/corrida/agentes` → `vistaCorrida` (`index.html:6432-6530`) → `cargarEscena` importa `/agentes/montaje.js` (`index.html:6343-6373`) → `pintarLienzoDeAgentes` crea el lienzo 960×480 y llama a `montaje.montar` (`index.html:6376-6430`) → `actualizar` fusiona filas y fija objetivos con `mundo.posicion` / `puestoPrincipal` (`motor.js:80-128`) → cada cuadro `avanzar` y `mundo.dibujar` (`montaje.js:138-153`). Leídos además `motor.d.ts`, `mundos/index.js`, `server.ts` (`ARCHIVOS_WEB`, `loadStatics`), `presentation.ts`, la spec `s3-mundos/spec.md` (R-MUN-002, 003, 004, 007, 008), `s2-motor-escena/spec.md` (R-ESC-011), `design.md` §3 y el prototipo completo (`vista-agentes.html:60-123,133-373,481-560`).
- Riesgos y compatibilidad:
  - Conflicto entre tickets en paralelo: `montaje.js`, `index.html`, `server.ts` y `tests/estaticos-web.test.ts` los tocarán también los otros dos mundos. Mitigación: este ticket define y entrega primero la ampliación compartida (sprites y estado de dibujo); los otros solo agregan su mundo.
  - Cambiar `posicion` y `puestoPrincipal` mueve a los agentes ya en escena: el motor no reinicia la escena y los lleva caminando al nuevo objetivo (`motor.js:86-90,140-153`), sin teletransporte.
  - Rendimiento: el prototipo dibuja con `fillRect` por píxel de sprite (12×16 por agente) a 60 cuadros; con ocho agentes es del orden del prototipo, que ya corre fluido. Con `prefers-reduced-motion` baja a 4 cuadros por segundo (`montaje.js:146`).
  - Modo oscuro: el lienzo y los paneles del mundo tienen paleta propia (no cambian con el tema), como pide R-ESC-011; el marco (cabecera, selector, avisos) no se toca y sigue con los tokens.
  - Sin red: no se carga Fraunces desde un tercero (decisión 2, decidida por el PO); el texto cae en Georgia.
  - Compatibilidad hacia atrás: `montar` con tres argumentos debe seguir funcionando (las pruebas existentes llaman así, `tests/vista-lienzo.test.ts:82-106`).
- Impactos de sync, migración, Docker o despliegue: ninguno. Es código de cliente servido por la consola local (`packages/server/web/`); no hay datos sincronizados, esquema, imagen ni despliegue; el único cambio de servidor posible es declarar un estático más en `ARCHIVOS_WEB`.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-2cf4af creada por el PO.
- Alcance: el mundo «Pastelería» completo contra el prototipo (`assets/vista-agentes.html`, mundo pastelería): `mundos/pasteleria.js` reescrito, un módulo de sprites compartido declarado como estático, la ampliación del estado de dibujo en `montaje.js` (cola, entregados y hora) y, en `index.html`, el paso de esos datos y el título y el estilo de pizarra de los paneles para la pastelería. Exclusiones: `motor.js` y `motor.d.ts` (sin cambios), los mundos `control.js` e `invernadero.js` (siguen con su dibujo provisional y heredan la plantilla en sus tickets), el marco y sus tokens (IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008), `/api/corrida/agentes` y el texto de la pregunta (S4).
- Pasos ordenados:
  1. `packages/server/web/agentes/mundos/sprites.js` (nuevo): constantes `BASE`, `PIERNAS`, `SOMBREROS` copiadas del prototipo (`vista-agentes.html:170-185`); función pura `cuadroDeMarcha(agente)` con `[0, 1, 0, 2][Math.floor(paso) % 4]` en marcha y 0 en reposo; función pura `rasgosDe(carril)` que elige color, pelo y piel de las paletas del prototipo por `carril` (`vista-agentes.html:200-201`), sin azar; `dibujarPersonaje(ctx, agente, cx, pies, opciones)` con el bitmap 12×16 a escala 3, balanceo en reposo, sombrero por opción e insignia dorada si `agente.principal` (`vista-agentes.html:186-198`). Cada línea con un color lleva `valmen:allow-color` con el motivo «paleta de los sprites del prototipo». (C22, C23, C24, C25, C26, C27)
  2. `packages/server/src/server.ts`, `ARCHIVOS_WEB`: agregar `"agentes/mundos/sprites.js"`; `tests/estaticos-web.test.ts` (C27 existente) actualiza la lista esperada. (C28)
  3. `packages/server/web/agentes/montaje.js`, `crearMontaje`: `montar(lienzo, filas, ahoraMs, datos = {})` guarda `datos.cola` y `datos.entregados` (listas de identificadores; vacías si faltan); `dibujarCuadro` pasa a `mundo.dibujar` el estado `{ ctx, escena, miniatura: false, cola, entregados, ahoraMs: ahora(), ventanaRespuestaMs: VENTANA_RESPUESTA_MS }`; `elegirMundo` conserva esos datos. `montar` con tres argumentos sigue igual. (C2, C3)
  4. `packages/server/web/agentes/mundos/pasteleria.js` (reescrito sobre el prototipo `vista-agentes.html:294-373`): `PALETA` con un color por línea marcado `valmen:allow-color` «paleta del obrador de la pastelería»; `estaciones` = los ocho nombres del prototipo (`vista-agentes.html:146`), sin cambios respecto a hoy; `posicion(i, carril)` = `{ x: 180 + i*101 + ((carril % 3) - 1) * 22, y: 364 }`; `puestoPrincipal` = `{ x: 64, y: 364 }`; `paneles` = `{ agentes: "Comandas", cola: "En espera", entregados: "Vitrina" }` (decisión 1); funciones puras exportadas `etapaDelPastel(agente)` (devuelve `agente.estacion`), `comandasDelPase(cola)`, `vitrina(entregados)` (los seis últimos), `hornoEncendido(agentes)` (verdadero si algún agente con `estado` `trabajando`, `moviendo` falso y `estacion` 4), `senalDeAnita(agentes, ahoraMs, ventanaMs)` (lámpara encendida con una pregunta abierta en la estación 3; Anita en la ventanilla con una respondida dentro de la ventana), `llevaPregunta(agente)` (`estado` `esperando` y `moviendo` falso) y `aparienciaDe(agente)` (delantal, camisa y sombrero por estado visual; la principal con delantal `#1d2129` y camisa `#2a2f3a` del prototipo, `vista-agentes.html:342`); y `dibujar(estado, t)` que pinta pared, estante, ventana, letrero «LA COMANDA», pase con las comandas de la cola, los ocho puestos, pasteleros, pastel por estación (en la mano al caminar y sobre el mostrador quieto), «?» y vapor del horno derivado de `t` sin azar. Sin `cola`, `entregados` ni `ahoraMs` (la miniatura) dibuja el obrador vacío sin lanzar. (C1, C4-C21, C29)
  5. `packages/server/web/index.html`, `vistaCorrida` y `pintarLienzoDeAgentes`: pasar `{ cola: kpis.cola.map((t) => t.ticketId), entregados: kpis.entregadosIds }` a `montaje.montar`; poner `data-mundo` del mundo actual en `.corrida-paneles` y tomar los títulos de los tres paneles de `mundo.paneles` cuando existan (los actuales si no), y actualizarlos al elegir otro mundo. CSS `.corrida-paneles[data-mundo="pasteleria"] .corrida-panel` como pizarra verde con marco de madera y títulos con `font-family: "Fraunces", Georgia, serif` sin cargar fuentes externas (decisión 2), cada línea con color marcada `valmen:allow-color` «paleta de la pastelería». (C30, C31)
  6. `tests/mundo-pasteleria.test.ts` (nuevo): pruebas con un contexto de lienzo falso que registra las llamadas y con agentes de escena fabricados; una prueba por criterio con su número en el nombre; la de C30 lee el CSS de `index.html`. (C1-C27, C29, C31)
  7. Verificación en el navegador con `valmen serve` sobre una corrida con la sesión principal, tres subagentes (uno en `approved` con pregunta abierta), dos tickets en cola y un entregado, comparada lado a lado con el prototipo abierto en el mismo ancho: escritorio (1280 px) y celular (390 px), en claro y oscuro; `revisar_presentacion` sobre el cambio. Las capturas y las diferencias con su motivo quedan en `## Evidencia`. Preparación de las filas: con `valmen serve` del worktree en `#/agentes`, se parchea `window.fetch` desde la consola del navegador para que `/api/corrida/agentes` devuelva filas simuladas con la forma de `AgenteDeCorrida` (`packages/server/src/agentes.ts:63-79`), como se hizo en FEATURE-WEB-VISTA-LIENZO-20261008; la respuesta parcheada lee las filas de una variable global que se edita desde la consola. Para C32 y C33: un subagente empieza con `ticketEstado` `in_progress` y `estado` `trabajando` (quieto en el horno, x = 584 ± 22); se cambia en la variable su `ticketEstado` a `awaiting_user_tests` y su `estado` a `esperando`; el refresco de 5 s (`programarRefrescoDeCorrida`, `index.html:6590-6603`) trae la fila nueva, `actualizar` (`motor.js:96-128`) fija el objetivo en la estación 5 sin reiniciar la escena y se observa y se captura el trayecto hasta x = 685 ± 22. (C30, C32-C39)
  8. Regresión: `npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts`. (C40)
- Impactos declarados: ninguno; sin sincronización, migración ni contenedores. Un archivo servido nuevo (`agentes/mundos/sprites.js`) declarado en el mapa de estáticos de `valmen serve`.
- Rollback (obligatorio): revertir el commit del ticket en su rama; vuelven el dibujo provisional, el mapa de estáticos sin `sprites.js`, `montar` sin datos extra y los paneles sin estilo de mundo. No hay datos ni estado persistido que deshacer (la preferencia de mundo en `localStorage` no cambia de clave ni de valores).

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-MUN-001: `validarMundo` aplicado al mundo pastelería devuelve una lista vacía.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C1 -->
- [x] C2 — R-MUN-001: el estado que el montaje entrega a `dibujar` incluye la cola, los entregados y la hora pasados a `montar`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C2 -->
- [x] C3 — R-MUN-001: `montar` con tres argumentos entrega al dibujo una cola vacía.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C3 -->
- [x] C4 — R-MUN-002: el puesto principal de la pastelería es el pase, en `{ x: 64, y: 364 }`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C4 -->
- [x] C5 — R-MUN-002: con una cola de dos identificadores, `comandasDelPase` devuelve una lista de longitud 2.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C5 -->
- [x] C6 — R-MUN-002: cada comanda que devuelve `comandasDelPase` tiene `x` entre 16 y 112, el ancho del pase.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C6 -->
- [x] C7 — R-MUN-003: `aparienciaDe` devuelve una apariencia distinta para cada uno de los cuatro estados visuales.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C7 -->
- [x] C8 — R-MUN-003: con un agente `esperando` y pregunta abierta en `approved`, `senalDeAnita` devuelve la lámpara encendida.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C8 -->
- [x] C9 — R-MUN-003: sin pregunta abierta, `senalDeAnita` devuelve la lámpara apagada.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C9 -->
- [x] C10 — R-MUN-003: con una pregunta respondida hace 30 s, `senalDeAnita` devuelve a Anita en la ventanilla.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C10 -->
- [x] C11 — R-MUN-003: con una pregunta respondida hace 61 s, `senalDeAnita` no devuelve a Anita en la ventanilla.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C11 -->
- [x] C12 — R-MUN-003: `llevaPregunta({ estado: "esperando", moviendo: false })` devuelve `true`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C12 -->
- [x] C13 — R-MUN-003: `llevaPregunta({ estado: "esperando", moviendo: true })` devuelve `false`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C13 -->
- [x] C14 — R-MUN-004: `mundo.estaciones` es igual a `["Pedidos", "Recetario", "Báscula", "Mostrador de Anita", "Horno", "Degustación", "Control", "Vitrina"]`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C14 -->
- [x] C15 — R-MUN-004: para cada estación `i` y carril de 0 a 2, `posicion(i, carril)` devuelve `y` = 364 y `x` a no más de 22 px de `180 + 101 * i`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C15 -->
- [x] C16 — R-MUN-004: `etapaDelPastel({ estacion: 5 })` devuelve 5.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C16 -->
- [x] C17 — R-MUN-004: `hornoEncendido` devuelve `true` con un agente `trabajando`, quieto y en la estación 4.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C17 -->
- [x] C18 — R-MUN-004: `hornoEncendido` devuelve `false` cuando el único agente de la estación 4 está `esperando`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C18 -->
- [x] C19 — R-MUN-004: con ocho entregados, `vitrina` devuelve los seis últimos.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C19 -->
- [x] C20 — R-MUN-004: `mundo.paneles` es igual a `{ agentes: "Comandas", cola: "En espera", entregados: "Vitrina" }`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C20 -->
- [x] C21 — R-ESC-011: toda línea de `mundos/pasteleria.js` que contiene un color lleva `valmen:allow-color`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C21 -->
- [x] C22 — R-ESC-011: toda línea de `mundos/sprites.js` que contiene un color lleva `valmen:allow-color`.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C22 -->
- [x] C23 — R-MUN-007: un agente que camina recorre los cuadros de marcha 0, 1, 0, 2 en cuatro pasos seguidos.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C23 -->
- [x] C24 — R-MUN-007: un agente quieto usa el cuadro de marcha 0.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C24 -->
- [x] C25 — R-MUN-007: `rasgosDe` devuelve el mismo color, pelo y piel para el mismo carril en dos llamadas.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C25 -->
- [x] C26 — R-MUN-007: el sprite de un pastelero quieto ocupa un rectángulo de 36 px de ancho por 48 px de alto sobre sus pies.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C26 -->
- [x] C27 — R-MUN-007: la sesión principal se dibuja con insignia dorada en el pecho.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C27 -->
- [x] C28 — `ARCHIVOS_WEB` declara `agentes/mundos/sprites.js`.
      <!-- test: npx vitest run tests/estaticos-web.test.ts -->
- [x] C29 — R-MUN-001: dibujar la miniatura con una escena vacía y sin cola no lanza.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C29 -->
- [x] C30 — R-ESC-011: `revisar_presentacion` sobre el cambio del ticket no reporta ningún color sin `valmen:allow-color`.
      <!-- verify: manual -->
- [x] C31 — R-ESC-011: cada `valmen:allow-color` del CSS de paneles de `index.html` nombra la pastelería en su motivo.
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts -t C31 -->
- [x] C32 — R-MUN-004: en el navegador, al cambiar en las filas simuladas el `ticketEstado` de un subagente de `in_progress` a `awaiting_user_tests`, el pastelero camina desde el horno hasta la degustación (x = 685 ± 22).
      <!-- verify: manual -->
- [x] C33 — R-MUN-004: en el navegador, durante ese trayecto el pastelero lleva en la mano el pastel glaseado (etapa 5).
      <!-- verify: manual -->
- [ ] C34 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema claro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C35 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema oscuro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C36 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema claro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C37 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema oscuro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C38 — R-MUN-008: cada captura de la vista en `## Evidencia` va junto a la del prototipo tomada con el mismo ancho y el mismo tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C39 — R-MUN-008: cada diferencia observada con el prototipo queda anotada en `## Evidencia` con su motivo. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [x] C40 — Las pruebas existentes del lienzo, del motor, de los estáticos, del marco, de la vista Agentes y de la interfaz ejecutable siguen pasando.
      <!-- test: npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de FEATURE-WEB-MUNDO-PASTELERIA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y el PO valida la pantalla.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/server/src/server.ts",
      "packages/server/web/agentes/montaje.js",
      "packages/server/web/agentes/mundos/pasteleria.js",
      "packages/server/web/agentes/mundos/sprites.js",
      "packages/server/web/index.html",
      "tests/estaticos-web.test.ts",
      "tests/mundo-pasteleria.test.ts"
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

Hecho el 2026-10-09 sobre el plan aprobado (rama `valmen/ticket-mundo-pasteleria`), sin salirse del alcance:

- `packages/server/web/agentes/mundos/sprites.js` (nuevo, declarado en `ARCHIVOS_WEB`): bitmap 12×16 a escala 3, `cuadroDeMarcha`, `rasgosDe`, `dibujarPersonaje` con insignia dorada.
- `packages/server/web/agentes/mundos/pasteleria.js` (reescrito sobre el prototipo): `PALETA`, funciones puras (`comandasDelPase`, `vitrina`, `hornoEncendido`, `senalDeAnita`, `llevaPregunta`, `aparienciaDe`, `etapaDelPastel`) y `dibujar`; paneles «Comandas», «En espera» y «Vitrina».
- `packages/server/web/agentes/montaje.js`: `montar(lienzo, filas, ahoraMs, datos = {})` guarda `cola` y `entregados`; `dibujarCuadro` los pasa con `ahoraMs` y `ventanaRespuestaMs`.
- `packages/server/web/index.html`: paso de `cola` y `entregados` al montaje, `data-mundo` y títulos de los paneles desde `mundo.paneles` (también al elegir otro mundo), y CSS de pizarra con Fraunces y respaldo Georgia, sin descargar fuentes.
- `packages/server/src/server.ts`: `agentes/mundos/sprites.js` en `ARCHIVOS_WEB`; `tests/estaticos-web.test.ts` actualizado.
- `tests/mundo-pasteleria.test.ts` (nuevo): una prueba por criterio con su número en el nombre.

Decisiones del PO aplicadas: tres paneles con esos nombres; Fraunces sin descargar con Georgia de respaldo; degustación solo con rótulo rojo y «?».

Pendiente: C34-C39 (capturas de la vista y del prototipo en escritorio y 390 px, claro y oscuro, con las diferencias anotadas): no se hicieron; el ticket sigue `in_progress`.

## Pruebas

Directorio de ejecución: la raíz del repositorio (o del worktree).

1. `npm run build` y `npx tsc --noEmit -p .`: el build pasa. `tsc --noEmit` repite el aviso TS7016 (módulos `.js` sin declaración) que ya daban 6 importaciones de las pruebas existentes, más la de `sprites.js` en la prueba nueva: mismo origen, sin errores nuevos de otra clase.
2. `npx vitest run tests/mundo-pasteleria.test.ts`: 30 pruebas, todas pasan (C1-C27, C29, C31).
3. `npx vitest run tests/estaticos-web.test.ts`: pasa (C28).
4. `npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts`: pasan (C40). Requiere `npm run build` antes.

Validaciones manuales:

- C30: `scanPendingColors` (lo que corre `revisar_presentacion`) sobre el cambio del worktree: 1 archivo de interfaz revisado, 0 colores sin `valmen:allow-color`.
- C32 y C33: `node packages/cli/dist/main.js serve --port 4587` en el worktree, `#/agentes` con `window.fetch` parcheado para devolver filas simuladas. Al pasar un subagente de `in_progress` a `awaiting_user_tests` el pastelero caminó del horno (x≈584) a la degustación (x≈685) y, durante el trayecto y después, el lienzo mostró el pastel glaseado de la etapa 5 (color del glaseado ausente antes del cambio). Medido con `getImageData` sobre el lienzo, no con capturas guardadas.
- Pendiente manual (C34-C39): capturas lado a lado con el prototipo, en 1280 y 390 px, claro y oscuro, y las diferencias con su motivo en `## Evidencia`.

Requisitos de ambiente: Node 24, `npm install` hecho y `npm run build` previo a `interfaz-ejecutable`.
- Resultado del PO: «si se ven bien los 3 mundos» · «A cierralos» (2026-10-09; validó la pantalla con una corrida real).

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
    "po_confirmation": "«si se ven bien los 3 mundos» · «A cierralos»"
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
    "reference": "worktree:sha256:59d7f8b5bd3333a108517270c29047a3a68ff9de7fcca5c396b54a360b81b740",
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
    "po_confirmation": "«si se ven bien los 3 mundos» · «A cierralos»"
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
    "technical_summary": "Mundo pastelería sobre el motor (mundos/pasteleria.js y sprites.js) con paneles Comandas, En espera y Vitrina; las capturas contra el prototipo (C34-C39) no se produjeron y el PO validó el mundo a ojo.",
    "functional_summary": "Un obrador animado donde cada ticket recorre las mesas hasta la vitrina.",
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
    "notes": "Sesión de subagente (implementación) sin agregado de consumo expuesto: sin números.",
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
    "at": "2026-10-08T23:30:59.357Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T01:17:55.139Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T01:20:50.705Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T01:44:32.834Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-FEATURE-WEB-MUNDO-PASTELERIA-20261008-plan-3, canal cli, decidida 2026-10-09T01:44:32.827Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: tras tres vueltas los criterios son atómicos (media 0.926), 9 de 13 en banda están exactamente en 0.90 y el evaluador es inconsistente (C37 marcado compuesto con la misma forma que C34-C36, aprobados)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T01:51:42.262Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-2cf4af\",\"source\":\"autorizacion\",\"quote\":\"aprobación de planes y análisis de la feature vista-agentes\",\"planHash\":\"sha256:4ae6c765bfa320c8cfa751cd1ea252d69946d565dda7de07514d3ce75c874f9a\",\"authorizationId\":\"APA-20261009-2cf4af\",\"authorizationHash\":\"sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-FEATURE-WEB-MUNDO-PASTELERIA-20261008-plan-3\",\"receiptStateHash\":\"sha256:27596c37b4cd4bbec40cfb480e4fff2498cc2d6826b03a8d6622c80d0aee37c4\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T01:51:46.657Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-2cf4af (fuente autorizacion, hash sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3), plan sha256:4ae6c765bfa320c8cfa751cd1ea252d69946d565dda7de07514d3ce75c874f9a."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T01:51:46.657Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T01:52:03.467Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T01:57:57.594Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T02:00:37.200Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:30.748Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:31.046Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:31.337Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:31.642Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:31.945Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:32.334Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:32.791Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:33.130Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:33.450Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:33.743Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:34.041Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:34.335Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:36.179Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:36.352Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:11.597Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
