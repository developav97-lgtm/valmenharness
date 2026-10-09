---
schema_version: 2
id: FEATURE-WEB-MUNDO-INVERNADERO-20261008
title: Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo
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

# FEATURE-WEB-MUNDO-INVERNADERO-20261008

## Solicitud original

Parte del sprint: Los tres mundos completos y validados contra el prototipo.
- R-ESC-011: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada
- R-MUN-001: Cada mundo DEBE implementar la misma interfaz sobre el motor
- R-MUN-002: Cada mundo DEBE dar un puesto propio a la sesión principal
- R-MUN-003: Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje
- R-MUN-006: El invernadero DEBE ser el cultivo del prototipo
- R-MUN-007: Los personajes DEBEN ser los sprites del prototipo
- R-MUN-008: Cada mundo DEBE pasar la validación visual contra el prototipo
Depende de: FEATURE-WEB-VISTA-LIENZO-20261008, IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada Cada mundo DEBE implementar la misma interfaz sobre el motor Cada mundo DEBE dar un puesto propio a la sesión principal Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje El invernadero DEBE ser el cultivo del prototipo Los personajes DEBEN ser los sprites del prototipo Cada mundo DEBE pasar la validación visual contra el prototipo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-011: lo cubre IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008 (Marco con tokens del tema, celular, iPad y reduced-motion)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008 (Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ningún elemento del pedido nombra algo que el código no tenga: estaciones, estados visuales, `pregunta` con `respondidaEn`, cola, entregados, el sombrero `paja` y el título de paneles por mundo ya existen en main (`packages/server/web/agentes/motor.js:8-19`, `packages/server/src/agentes.ts:56-79`, `packages/server/web/agentes/montaje.js:137-140`, `packages/server/web/agentes/mundos/sprites.js:27,70-100`, `packages/server/web/index.html:6413-6422`). Había cinco decisiones de diseño donde el prototipo y el motor no coinciden. Las decidió Claude por delegación del PO el 2026-10-09: el orquestador transmitió las palabras del PO «vamos a seguir tus recomendaciones para este feature», y la decisión del REVIEW del análisis quedó en el recibo (`humanDecision`, actor `claude`, `.valmen/receipts/FEATURE-WEB-MUNDO-INVERNADERO-20261008.jsonl`). En cada una queda decidida la opción por defecto propuesta:

1. Paneles. El prototipo tiene dos, «Bitácora de cultivo» y «Cosecha» (`vista-agentes.html:153`); la vista tiene tres (`index.html:6413`), y la pastelería y el centro de control conservaron los tres con títulos del mundo. Pregunta: ¿qué títulos llevan los tres paneles en el invernadero? Decidido (opción por defecto): `{ agentes: "Bitácora de cultivo", cola: "Semillero", entregados: "Cosecha" }`.
2. Tipografía. El prototipo carga Caveat desde Google Fonts (`vista-agentes.html:3,14`). Pregunta: ¿se aplica la regla de los otros dos mundos, la pila `"Caveat", "Comic Sans MS", cursive` sin descarga externa? Decidido (opción por defecto): sí, sin descarga, anotando la diferencia en la evidencia.
3. Gotas de la regadera. En el prototipo las gotas son 14 partículas con `Math.random()` lanzadas una sola vez al responder y que viven entre 1,2 y 2,2 s (`vista-agentes.html:261,466`); el motor no admite azar (`motor.js:3-5`) y la respuesta llega con el refresco de 5 s (`index.html:6649-6657`), así que una lluvia de 2 s se perdería casi siempre. Pregunta: ¿cuánto dura la lluvia y cómo se generan las gotas? Decidido (opción por defecto): llueve sobre el cantero del jardinero mientras su pregunta respondida esté dentro de la ventana de respuesta (60 s, `montaje.js:14`, la misma que la ventanilla de la pastelería y «Anita en línea» del centro de control), con 14 gotas en posiciones fijas por índice que caen en bucle según `t`, sin azar.
4. Sobres de la cola en el semillero. El prototipo pinta un sobre por ticket en cola en `x = 30 + k * 30` (`vista-agentes.html:443`) sin tope, y la caseta mide de x = 20 a x = 130 (`vista-agentes.html:441`). Pregunta: ¿cuántos sobres se pintan? Decidido (opción por defecto): los tres primeros de la cola (el tercero termina en x = 114, dentro de la caseta); el resto se ve en el panel.
5. Salida del jardinero. En el prototipo el jardinero que termina camina a `{ x: 110, y: 296 }`, junto al semillero (`vista-agentes.html:227`); el motor lleva a todo agente que termina o desaparece al puesto principal (`motor.js:80-81,120,125`), que en el invernadero será `{ x: 75, y: 296 }`. Pregunta: ¿se acepta que salga hacia la puerta del semillero (35 px más a la izquierda que en el prototipo)? Decidido (opción por defecto): sí, y la diferencia se anota en la evidencia; cambiar `objetivoDe` es del motor, fuera de alcance (AP-003, `.valmen/memory/aprendizajes.md:21`).

## Descripción funcional

- Alcance: reemplazar el dibujo provisional de `packages/server/web/agentes/mundos/invernadero.js` por el cultivo del prototipo `.valmen/features/vista-agentes/assets/vista-agentes.html` (mundo invernadero, `vista-agentes.html:431-479`): vidrio con montantes y sol, estante de macetas, caseta «SEMILLERO» con la puerta y los sobres de la cola, camino de grava, ocho canteros con letrero y nombre de estación (los humanos en rojo), la planta que crece por estación (ocho etapas), la regadera que cuelga en los canteros 3 y 5 y flota con «?» mientras alguien espera, las gotas al responder, el cajón «COSECHA» con los entregados y los jardineros con sombrero de paja y peto que caminan por el camino y se arrodillan a trabajar; además los títulos y el estilo de cuaderno rayado de los paneles para este mundo. Reutiliza lo que ya está en main: `mundos/sprites.js` (con `SOMBREROS.paja` y `bandaColor`, `sprites.js:27,93`), el estado de dibujo con `cola`, `entregados`, `ahoraMs` y `ventanaRespuestaMs` (`montaje.js:137-140`) y `aplicarMundoAPaneles` (`index.html:6416-6422`). Fuera de alcance: el motor, la pastelería, el centro de control y el marco (AP-003).
- Usuario o rol afectado: el PO que sigue la corrida en la vista Agentes de la consola local y elige el mundo «Invernadero» en el selector (`index.html:6450-6476`).
- Comportamiento actual: el invernadero es un esquema provisional: fondo verde claro, título «INVERNADERO», ocho rectángulos en fila a y = 130 (los humanos en ámbar), un rectángulo para la principal en `{ 480, 70 }` y cada agente como un círculo coloreado por estado en `60 + i*120`, apilado por carril en y (`invernadero.js:12-14,17-52,60`). No hay vidrio, semillero, canteros, plantas, regadera, gotas, cosecha ni sprites; los paneles salen con los títulos por defecto («Agentes vivos», «Cola», «Entregados», `index.html:6413`) y sin estilo de mundo.
- Comportamiento esperado: con los datos reales de `/api/corrida/agentes`, la escena es el cultivo del prototipo: la sesión principal es el jardinero jefe con sombrero de paja de banda verde e insignia dorada, de pie ante el semillero (75, 296); cada subagente es un jardinero con sombrero de paja de banda dorada y peto azul que camina por el camino de grava hasta el cantero de su estación llevando una maceta con su planta, y al llegar se arrodilla junto a la planta de su ticket, que muestra la etapa de esa estación (semilla con etiqueta, brote, hojas, capullo, tallo alto, flor, fruto, cesta); si espera a una persona en «Riego de Anita» o «Floración», la regadera de ese cantero flota y lleva «?», y el jardinero también lleva «?»; con una respuesta reciente caen gotas sobre su cantero; el jardinero que termina deja de mostrar su planta y vuelve al semillero; los entregados se ven como tomates en el cajón «COSECHA»; los paneles se ven como un cuaderno rayado con títulos en Caveat.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - El dibujo del invernadero es provisional por diseño: el archivo lo declara y delega el dibujo fiel en FEATURE-WEB-MUNDO-* (`packages/server/web/agentes/mundos/invernadero.js:3-5`). `dibujar` pinta rectángulos y círculos (`invernadero.js:17-52`) y la paleta son literales sin `valmen:allow-color` (`invernadero.js:10,22,24,31,38,46`).
  - Las posiciones no son las del prototipo: `posicion` pone a cada agente en `x = 60 + i*120`, `y = 200 + (carril % 5) * 50` (`invernadero.js:12-14`) y el puesto principal en `{ 480, 70 }` (`invernadero.js:60`). En el prototipo la principal está en `{ 75, 296 }` y cada jardinero en `x = 150 + etapa*100 + 30 + desp/2`, `y = 296`, con `desp = ((idx % 3) - 1) * 22` (`vista-agentes.html:226,229`), es decir `x = 180 + 100*i + ((carril % 3) - 1) * 11`. El jardinero sí recorre las estaciones caminando (a diferencia del centro de control), así que el motor ya produce el movimiento correcto con solo cambiar `posicion` y `puestoPrincipal` (`motor.js:80-84,131-155`).
  - El arrodillado y la maceta en la mano se derivan del agente sin estado propio: en el prototipo el jardinero quieto con ticket y sin terminar se dibuja sentado con los pies 26 px más abajo (`vista-agentes.html:461-462`), y al caminar lleva la maceta con la planta en etapa `min(etapa, 2)` (`vista-agentes.html:463`). `dibujarPersonaje` ya admite `sentado`, `bandaColor`, `delantal` y `pantalon` (`sprites.js:65-94`).
  - La planta de cada ticket depende solo de la estación del agente (`vista-agentes.html:456,468-479`), y el motor ya la da en `agente.estacion` (`motor.js:112-116`).
  - La regadera flota según si hay un agente `esperando` en el cantero humano (`vista-agentes.html:450-455`); la escena lo da con `estado` y `estacion`. Las gotas del prototipo usan `Math.random()` y viven ~2 s tras la respuesta (`vista-agentes.html:261,466`): hay que derivarlas de `t` y de `fila.pregunta.respondidaEn` contra `ahoraMs` y `ventanaRespuestaMs` (decisión 3), igual que `senalDeAnita` de la pastelería (`pasteleria.js:126-136`).
  - El montaje ya entrega al dibujo `cola`, `entregados`, `ahoraMs` y `ventanaRespuestaMs` (`montaje.js:137-140`), e `index.html` ya aplica `mundo.paneles` y `data-mundo` a los paneles (`index.html:6416-6422,6474,6633`): este ticket no necesita tocar `montaje.js` ni el JavaScript de `index.html`, solo agregar el CSS de paneles para `data-mundo="invernadero"` junto a los de control y pastelería (`index.html:2248-2285`). El prototipo los pinta como cuaderno: fondo `#fbf7e8`, texto `#3b4a2f`, borde `#a67c52`, rayado con `repeating-linear-gradient` y títulos en Caveat verde `#3f8f4a` de 24 px (`vista-agentes.html:80-85`).
  - No hace falta un estático nuevo: `agentes/mundos/invernadero.js` ya está en `ARCHIVOS_WEB` (`packages/server/src/server.ts:2354`), que es el «estático declarado» del título, y `sprites.js` también (`server.ts:2352`).
  - `revisar_presentacion` no inspecciona `.js` (`packages/engine/src/presentation.ts:38-57`): el marcado `valmen:allow-color` de `invernadero.js` solo se comprueba con una prueba propia, como en los otros dos mundos; el CSS nuevo de `index.html` sí lo revisa la herramienta.
- Hipótesis pendientes:
  - Con más de tres jardineros en el mismo cantero, el desplazamiento `((carril % 3) - 1) * 11` repite posición para los carriles 0 y 3 y se pisan; el prototipo tiene el mismo comportamiento (solo simula tres agentes). Se comprueba en el navegador con cuatro subagentes en la misma estación y se anota en la evidencia.
  - Al elegir el invernadero, `elegirMundo` crea una escena nueva (`montaje.js:179-186`) y los agentes nacen en el puesto principal (`motor.js:103`): caminan desde el semillero hasta su cantero llevando la maceta, que es lo que hace el prototipo cuando entra un agente nuevo (`vista-agentes.html:287`). Se confirma en el navegador.
  - La miniatura del selector se dibuja con escena vacía y sin `cola` ni `ahoraMs` (`index.html:6462`): el dibujo debe tolerar esos campos ausentes, como la pastelería (`pasteleria.js:212-217`).
  - Con desvío (`blocked`, `changes_requested`) el agente queda en la última estación válida (`motor.js:33-36`): su planta se ve en la etapa de esa estación, sin marca de desvío, como el prototipo (que no tiene desvíos).
  - Los colores translúcidos del prototipo (`rgba(255,255,255,.75)` de los montantes, `rgba(255,224,138,.25)` del halo del sol, `vista-agentes.html:436-437`) se reproducen con `globalAlpha`, como el `pincel` de la pastelería (`pasteleria.js:165-179`), para que cada color de la paleta sea un `#rrggbb` marcado.
- Consumidores afectados:
  - `packages/server/web/agentes/mundos/invernadero.js`: se reescribe; lo registra `mundos/index.js:4,7` y lo dibujan el lienzo (`montaje.js:137`) y la miniatura del selector (`index.html:6462`).
  - `packages/server/web/index.html:2248-2285`: se agrega el CSS de paneles para `data-mundo="invernadero"`.
  - `tests/vista-lienzo.test.ts` (los mundos registrados cumplen la interfaz) y `tests/estaticos-web.test.ts` (la lista de estáticos no cambia).
  - Ningún otro mundo ni el motor: `sprites.js` se usa sin cambios.
- Archivos y flujo investigados: `GET /api/corrida/agentes` → `vistaCorrida` → `pintarLienzoDeAgentes` y `montaje.montar(lienzo, agentes, ahora, datos)` (`index.html:6425-6480`) → `actualizar` fija objetivos con `mundo.posicion` / `puestoPrincipal` (`motor.js:96-128`) → cada cuadro `avanzar` y `mundo.dibujar(estado, escena.t)` (`montaje.js:134-158`); al elegir mundo, `elegirMundo` (`montaje.js:179-186`) y `aplicarMundoAPaneles` (`index.html:6416-6422,6474`); refresco cada 5 s con `programarRefrescoDeCorrida` (`index.html:6649-6657`). Leídos además `mundos/invernadero.js`, `mundos/sprites.js`, `mundos/pasteleria.js` y el ticket del centro de control (plantillas: plan, criterios, decisiones), `server.ts:2346-2354`, `presentation.ts`, la spec `s3-mundos/spec.md` (R-MUN-003, R-MUN-006, R-MUN-007) y el prototipo (`vista-agentes.html:3-16,80-85,151-153,170-197,220-262,431-479`). `buscar_memoria` («invernadero mundo vista agentes») solo devolvió AP-003, que aplica al alcance.
- Riesgos y compatibilidad:
  - Cambiar `posicion` y `puestoPrincipal` mueve a los agentes ya en escena: el motor los lleva caminando, sin reiniciar (`motor.js:121,140-153`).
  - Rendimiento: el prototipo traza 160 granos de grava, 18 terrones por cantero (144) y un sprite 12×16 por agente por cuadro; es del orden del prototipo, que corre fluido. Con `prefers-reduced-motion` el montaje baja a 4 cuadros por segundo (`montaje.js:151`) y la regadera flota y las gotas caen a saltos.
  - Determinismo: sin `Math.random()` en el mundo; la grava y los terrones ya son deterministas en el prototipo (`(i * 73) % W`, `vista-agentes.html:444,447`) y las gotas se derivan de `t` (decisión 3).
  - Modo oscuro: el cultivo y los paneles del mundo tienen paleta propia y no cambian con el tema (R-ESC-011); el marco sigue con los tokens. El cuaderno claro sobre la página oscura es lo que muestra el prototipo en tema oscuro.
  - Sin red: no se carga Caveat desde un tercero (decisión 2); los rótulos caen en la fuente de respaldo y pueden verse más anchos que en el prototipo.
  - Conflicto en `index.html` con otros tickets del sprint: bloque CSS propio, solo de texto; lo integra el orquestador.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es código de cliente servido por la consola local (`packages/server/web/`); no hay datos sincronizados, esquema, imagen ni despliegue, y no cambia `ARCHIVOS_WEB` (`invernadero.js` ya está declarado).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-2cf4af creada por el PO.
- Alcance: el mundo «Invernadero» completo contra el prototipo (`assets/vista-agentes.html:431-479`): `mundos/invernadero.js` reescrito con el vidrio, el estante de macetas, el semillero con los sobres de la cola, el camino de grava, los ocho canteros con su planta por estación, las regaderas de los canteros humanos, las gotas al responder, el cajón «COSECHA» y los jardineros; y en `index.html` el CSS de los paneles para `data-mundo="invernadero"`. Reutiliza sin cambios `mundos/sprites.js` (`SOMBREROS.paja`, `bandaColor`, `sentado`), `montaje.js` (estado de dibujo con `cola`, `entregados`, `ahoraMs`, `ventanaRespuestaMs`) y `aplicarMundoAPaneles`. Exclusiones: `motor.js` y `motor.d.ts` (la salida hacia el puesto principal se queda como está, decisión 5), `montaje.js`, `sprites.js`, `pasteleria.js`, `control.js`, el JavaScript de `index.html`, `ARCHIVOS_WEB` (sin estático nuevo), `/api/corrida/agentes` y el texto real de la pregunta (FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008).
- Pasos ordenados:
  1. `packages/server/web/agentes/mundos/invernadero.js` (reescrito sobre `vista-agentes.html:431-479`, con el `pincel` R/C/T con `globalAlpha` de `pasteleria.js:165-188`): `PALETA` con un color `#rrggbb` por línea marcado `valmen:allow-color` «paleta del cultivo del invernadero» (los translúcidos del prototipo con `globalAlpha`); `ESTACIONES` sin cambios (`["Semilla", "Brote", "Hojas", "Riego de Anita", "Crecimiento", "Floración", "Fruto", "Cosecha"]`); `PUESTO_PRINCIPAL = { x: 75, y: 296 }`; `posicion(indice, carril)` = `{ x: 180 + 100 * indice + ((carril % 3) - 1) * 11, y: 296 }` (`vista-agentes.html:226,229`); `paneles` = `{ agentes: "Bitácora de cultivo", cola: "Semillero", entregados: "Cosecha" }` (decisión 1). Funciones puras exportadas: `xDeCantero(i)` = `150 + 100 * i`; `arrodillado(agente)` (no principal, quieto, con `fila.ticket` y estado distinto de `termino`, `vista-agentes.html:461`); `piesDibujados(agente)` = `agente.y + 26` si está arrodillado y `agente.y` si no; `macetaEnMano(agente)` (`Math.min(agente.estacion, 2)` si camina con ticket y no es la principal, `null` si no, `vista-agentes.html:463`); `aparienciaDe(agente)` = `{ sombrero: "paja", bandaColor, delantal: "#4a5e8a", pantalon: "#4a5e8a", sentado: arrodillado(agente) }` con `bandaColor` `"#3f8f4a"` para la principal y `"#e8b84a"` para los demás (`vista-agentes.html:462`); `llevaPregunta(agente)` (`esperando` y quieto); `regadera(agentes, i, t)` = `{ flota, y }` con `flota` si algún agente `esperando` está en la estación `i`, `y = 226 + 4 * Math.sin(3 * t)` si flota y `282` si no (`vista-agentes.html:450-455`); `gotas(agentes, ahoraMs, ventanaMs, t)`: para cada agente cuya `fila.pregunta.respondidaEn` esté entre 0 y `ventanaMs` antes de `ahoraMs`, 14 gotas con `x = agente.x - 40 + (k * 29) % 30` e `y = 240 + (k * 17 + t * 80) % 60`, sin azar (decisión 3); `sobresDelSemillero(cola)` = los tres primeros con `x = 30 + 30 * k`, `y = 236` (decisión 4); `cosecha(entregados)` = los nueve últimos con `x = 860 + (k % 5) * 14`, `y = 426 + Math.floor(k / 5) * 12` (`vista-agentes.html:459`). `dibujar(estado, t)` pinta, en el orden del prototipo, vidrio con montantes, línea de estante, sol con halo, estante de macetas, caseta con techo, puerta, «SEMILLERO» y «sesión principal» en Caveat, los sobres, el camino de grava (160 granos deterministas), los ocho canteros con terrones, estaca, letrero, nombre (rojo en 3 y 5) e id de estación, las regaderas de 3 y 5 con «?» si flotan, la planta de cada agente arrodillado en `xDeCantero(estacion) - 6` con la etapa de su estación (`planta` del prototipo, ocho etapas, `vista-agentes.html:468-479`), el cajón «COSECHA» con los tomates de `cosecha`, los jardineros con `dibujarPersonaje(ctx, a, a.x, piesDibujados(a), aparienciaDe(a))`, la maceta con su planta en la mano, el «?» de `llevaPregunta` y las gotas. Sin `cola`, `entregados` ni `ahoraMs`, no lanza; con `miniatura` omite los rótulos finos. Sin `Math.random()`. (C1-C30)
  2. `packages/server/web/index.html`, CSS junto a los bloques del centro de control y la pastelería (`index.html:2248-2285`): `.corrida-paneles[data-mundo="invernadero"] .corrida-panel` con fondo `#fbf7e8`, texto `#3b4a2f`, borde `#a67c52` y el rayado `repeating-linear-gradient(transparent 0 27px, rgba(166, 124, 82, 0.25) 27px 28px)`; títulos `h3` en `#3f8f4a`, 24 px, sin mayúsculas, con `font-family: "Caveat", "Comic Sans MS", cursive` sin cargar fuentes externas (decisión 2); `th` en `#7a8a6f` (`vista-agentes.html:80-85`); cada línea con color lleva `valmen:allow-color` con «invernadero» en el motivo. (C31, C32)
  3. `tests/mundo-invernadero.test.ts` (nuevo, mismo armado que `tests/mundo-control.test.ts`: contexto de lienzo falso con `Proxy` que registra llamadas y agentes de escena fabricados): una prueba por criterio con su número al inicio del nombre (`C1:` …); C29 y C30 leen el texto de `invernadero.js` y C31 el de `index.html`. (C1-C31)
  4. Verificación en el navegador con `valmen serve` del worktree en `#/agentes`, mundo «Invernadero». Preparación de las filas: se parchea `window.fetch` desde la consola del navegador para que `/api/corrida/agentes` devuelva filas simuladas con la forma de `AgenteDeCorrida` (`packages/server/src/agentes.ts:63-79`), leídas de una variable global editable (`window.__filas`), como en FEATURE-WEB-MUNDO-PASTELERIA-20261008 y FEATURE-WEB-MUNDO-CONTROL-20261008. Datos, en este orden (fija los carriles 0 a 3): la sesión principal, un subagente en `in_progress` `trabajando`, uno en `approved` `esperando` con pregunta abierta, uno en `planned` `trabajando`; dos tickets en cola y un entregado. Para C33 y C34: se cambia en `window.__filas` el `ticketEstado` del subagente en `in_progress` (carril 1) a `awaiting_user_tests`; tras el refresco de 5 s (`programarRefrescoDeCorrida`, `index.html:6649-6657`) se observa y captura al jardinero caminando de x = 580 a x = 680 con la maceta en la mano. Para C35: se pone `pregunta.respondidaEn` del subagente en `approved` a la hora actual y se observa la lluvia sobre el cantero 3. Capturas lado a lado con el prototipo abierto en el mismo ancho y tema: escritorio (1280 px) y 390 px, claro y oscuro; `revisar_presentacion` sobre el cambio. Las capturas y las diferencias con su motivo (fuente de respaldo, salida hacia el semillero, lluvia durante la ventana, tope de sobres) quedan en `## Evidencia`. (C32-C39)
  5. Regresión: `npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/vista-corrida.test.ts`. (C40)
- Impactos declarados: ninguno; sin sincronización, migración ni contenedores. No hay archivo servido nuevo: `agentes/mundos/invernadero.js` ya está en `ARCHIVOS_WEB` (`server.ts:2354`).
- Rollback (obligatorio): revertir el commit del ticket en su rama; vuelven el dibujo provisional de `invernadero.js` y los paneles sin estilo para este mundo. No hay datos ni estado persistido que deshacer: el mundo no guarda memoria entre cuadros y la preferencia de mundo en `localStorage` no cambia de clave ni de valores.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-MUN-001: `validarMundo` aplicado al mundo invernadero devuelve una lista vacía.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C1: -->
- [x] C2 — R-MUN-001: dibujar la miniatura con una escena vacía, sin cola y sin `ahoraMs` no lanza.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C2: -->
- [x] C3 — R-MUN-002: el puesto principal del invernadero es el semillero, en `{ x: 75, y: 296 }`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C3: -->
- [x] C4 — R-MUN-002: `aparienciaDe` de la sesión principal devuelve `bandaColor` igual a `"#3f8f4a"`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C4: -->
- [x] C5 — R-MUN-007: `aparienciaDe` de un subagente `trabajando`, quieto y con ticket es igual a `{ sombrero: "paja", bandaColor: "#e8b84a", delantal: "#4a5e8a", pantalon: "#4a5e8a", sentado: true }`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C5: -->
- [x] C6 — R-MUN-006: `mundo.estaciones` es igual a `["Semilla", "Brote", "Hojas", "Riego de Anita", "Crecimiento", "Floración", "Fruto", "Cosecha"]`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C6: -->
- [x] C7 — R-MUN-006: para cada estación `i` de 0 a 7 y carril de 0 a 5, `posicion(i, carril)` es igual a `{ x: 180 + 100 * i + ((carril % 3) - 1) * 11, y: 296 }`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C7: -->
- [x] C8 — R-MUN-006: para cada `i` de 0 a 7, `xDeCantero(i)` devuelve `150 + 100 * i`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C8: -->
- [x] C9 — R-MUN-003: `arrodillado` de un subagente `trabajando`, quieto y con ticket devuelve `true`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C9: -->
- [x] C10 — R-MUN-003: `arrodillado` de un subagente que camina devuelve `false`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C10: -->
- [x] C11 — R-MUN-003: `arrodillado` de un subagente `termino` y quieto devuelve `false`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C11: -->
- [x] C12 — R-MUN-007: `piesDibujados` de un jardinero arrodillado en `y = 296` devuelve 322.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C12: -->
- [x] C13 — R-MUN-006: `macetaEnMano` de un subagente que camina en la estación 5 devuelve 2.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C13: -->
- [x] C14 — R-MUN-006: `macetaEnMano` de un subagente quieto devuelve `null`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C14: -->
- [x] C15 — R-MUN-006: dibujar la escena sin miniatura escribe «SEMILLERO» exactamente una vez.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C15: -->
- [x] C16 — R-MUN-003: con un agente `esperando` en la estación 3, `regadera(agentes, 3, 0).flota` es `true`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C16: -->
- [x] C17 — R-MUN-003: sin agentes `esperando`, `regadera(agentes, 5, 0)` es igual a `{ flota: false, y: 282 }`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C17: -->
- [x] C18 — R-MUN-003: con un agente `esperando` en la estación 3, `regadera(agentes, 3, Math.PI / 6).y` es 230.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C18: -->
- [x] C19 — R-MUN-003: `llevaPregunta({ estado: "esperando", moviendo: false })` devuelve `true`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C19: -->
- [x] C20 — R-MUN-003: `llevaPregunta({ estado: "esperando", moviendo: true })` devuelve `false`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C20: -->
- [x] C21 — R-MUN-003: con una pregunta respondida hace 30 s, `gotas(agentes, ahoraMs, 60000, 0)` devuelve 14 gotas.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C21: -->
- [x] C22 — R-MUN-003: con una pregunta respondida hace 61 s, `gotas(agentes, ahoraMs, 60000, 0)` devuelve una lista vacía.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C22: -->
- [x] C23 — R-MUN-003: cada gota de un jardinero en `x = 480` tiene `x` entre 440 y 469.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C23: -->
- [x] C24 — R-MUN-003: dos llamadas a `gotas` con los mismos argumentos devuelven listas iguales.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C24: -->
- [x] C25 — R-MUN-006: con una cola de cinco identificadores, `sobresDelSemillero` devuelve 3 sobres.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C25: -->
- [x] C26 — R-MUN-006: el tercer sobre de `sobresDelSemillero` está en `x = 90`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C26: -->
- [x] C27 — R-MUN-006: con doce entregados, `cosecha` devuelve los nueve últimos.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C27: -->
- [x] C28 — R-ESC-011: `mundo.paneles` es igual a `{ agentes: "Bitácora de cultivo", cola: "Semillero", entregados: "Cosecha" }`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C28: -->
- [x] C29 — R-ESC-011: el texto de `mundos/invernadero.js` no contiene `Math.random`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C29: -->
- [x] C30 — R-ESC-011: toda línea de `mundos/invernadero.js` que contiene un color lleva `valmen:allow-color`.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C30: -->
- [x] C31 — R-ESC-011: cada `valmen:allow-color` del CSS `data-mundo="invernadero"` de `index.html` nombra «invernadero» en su motivo.
      <!-- test: npx vitest run tests/mundo-invernadero.test.ts -t C31: -->
- [x] C32 — R-ESC-011: `revisar_presentacion` sobre el cambio del ticket no reporta ningún color sin `valmen:allow-color`.
      <!-- verify: manual -->
- [x] C33 — R-MUN-006: en el navegador, al cambiar en las filas simuladas el `ticketEstado` del subagente del carril 1 de `in_progress` a `awaiting_user_tests`, el jardinero camina de x = 580 a x = 680.
      <!-- verify: manual -->
- [x] C34 — R-MUN-006: en el navegador, durante ese trayecto el jardinero lleva la maceta con la planta en la mano.
      <!-- verify: manual -->
- [x] C35 — R-MUN-003: en el navegador, al poner `pregunta.respondidaEn` del subagente en `approved` a la hora actual, caen gotas sobre el cantero «Riego de Anita».
      <!-- verify: manual -->
- [ ] C36 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema claro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C37 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema oscuro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C38 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema claro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [ ] C39 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema oscuro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
      <!-- verify: manual -->
- [x] C40 — Las pruebas existentes del lienzo, del motor, de los estáticos, del marco, de la pastelería, del centro de control y de la vista Agentes siguen pasando.
      <!-- test: npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/vista-corrida.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de FEATURE-WEB-MUNDO-INVERNADERO-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y el PO valida la pantalla.",
    "evidence": [
      "EVIDENCE-002"
    ],
    "affected_files": [
      "packages/server/web/agentes/mundos/invernadero.js",
      "packages/server/web/index.html",
      "tests/mundo-invernadero.test.ts"
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

Se reescribió `packages/server/web/agentes/mundos/invernadero.js` sobre el prototipo (`vista-agentes.html:431-479`): `PALETA` marcada, funciones puras exportadas (`xDeCantero`, `arrodillado`, `piesDibujados`, `macetaEnMano`, `aparienciaDe`, `llevaPregunta`, `regadera`, `gotas`, `sobresDelSemillero`, `cosecha`), `posicion` y `puestoPrincipal` `{ 75, 296 }`, títulos de panel de la decisión 1 y dibujo en el orden del prototipo con `pincel` R/C/T con `globalAlpha`. En `packages/server/web/index.html` se agregó el CSS del cuaderno rayado para `data-mundo="invernadero"` (antes del bloque del centro de control; cada color con `valmen:allow-color` y «invernadero»). Pruebas nuevas en `tests/mundo-invernadero.test.ts` (C1-C31). Sin cambios en motor, montaje, sprites, otros mundos ni `ARCHIVOS_WEB`.

Decisiones aplicadas: 1 (paneles), 2 (Caveat sin descarga), 3 (gotas sin azar dentro de la ventana de 60 s), 4 (tres sobres), 5 (salida hacia el puesto principal).

## Pruebas

Directorio: la raíz del repositorio (o del worktree). Requisito: `npm run build` antes de `tests/vista-corrida.test.ts` (usa la interfaz ejecutable).

1. `npx vitest run tests/mundo-invernadero.test.ts` — esperado: 31 pruebas verdes (C1-C31).
2. `npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/vista-corrida.test.ts` — esperado: verdes (C40). Corridas juntas con la 1: 8 archivos, 158 pruebas verdes.
3. `npm run build` — esperado: sin errores (el `tsc` de `tests/` ya reportaba TS7016 por los `.js` sin declaración en las demás pruebas de mundos; no es de este ticket).

Validaciones manuales (el PO):
- `npm run build && node packages/cli/dist/main.js serve --port 4191`, abrir `#/agentes`, elegir «Invernadero» y comparar con `.valmen/features/vista-agentes/assets/vista-agentes.html` en 1280 px y 390 px, claro y oscuro (C36-C39, sin marcar).
- Verificado por el agente en el navegador con `fetch` parcheado (C33-C35): al pasar `ticketEstado` del carril 1 a `awaiting_user_tests` el jardinero camina de x = 579 a 679 (centro del sprite medido, tolerancia de 1 px) llevando la maceta; al poner `respondidaEn` ahora caen 14 gotas entre x = 451 y 480 (cantero «Riego de Anita»). A 390 px no hay desbordamiento horizontal.
- `revisar_presentacion`: sin colores fijos sin marca (C32).
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
    "kind": "browser",
    "description": "Navegador con fetch parcheado (servidor del worktree): C33 jardinero de x=579 a 679 (centro del sprite), C34 maceta dibujada durante el trayecto, C35 14 gotas en x 451-480 al responder. Sin capturas contra el prototipo (C36-C39, del PO). Diferencias a revisar: Caveat cae en Comic Sans MS (decisión 2); salida del jardinero hacia el semillero (75,296) en vez de (110,296) (decisión 5); lluvia durante la ventana de 60 s y no 2 s (decisión 3); tope de 3 sobres (decisión 4); las tablas y la cola dentro de los paneles conservan el fondo oscuro del marco, a diferencia del cuaderno del prototipo.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-09",
    "kind": "manual-test",
    "description": "Suite completa en verde y validación del PO con una corrida real en Mission Control",
    "reference": "worktree:sha256:8cca0f08d133480f35ee2f1bbc8bf08e1deb879702f2ab0b6c208d0920470766",
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
    "technical_summary": "Mundo invernadero (mundos/invernadero.js) con canteros, jardinero y regadera sin azar; las capturas contra el prototipo (C36-C39) no se produjeron y el PO validó el mundo a ojo.",
    "functional_summary": "Un jardín donde cada ticket es una planta que pasa de maceta en maceta.",
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
    "model": "claude-sonnet-5-5",
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
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 15 tickets (FEATURE-SERVER-SESION-PRINCIPAL-20261008 ×130, FEATURE-WEB-VISTA-LIENZO-20261008 ×119, FEATURE-WEB-MOTOR-ESCENA-20261008 ×118, FEATURE-WEB-MUNDO-PASTELERIA-20261008 ×117, IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 ×107), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 6659235 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Feature vista-agentes\".",
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
    "at": "2026-10-08T23:30:59.658Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T02:20:22.604Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T02:21:29.325Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por claude (recibo GR-20261009-FEATURE-WEB-MUNDO-INVERNADERO-20261008-analysis-1, canal cli, decidida 2026-10-09T02:21:29.321Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: un solo punto bajo (nombra_archivos_reales 0.81, patrón ya visto: el precheck no comprueba citas desde el worktree), el resto entre 0.91 y 0.95 y clasificación completa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T02:23:56.492Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T02:26:14.556Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-FEATURE-WEB-MUNDO-INVERNADERO-20261008-plan-1, canal cli, decidida 2026-10-09T02:26:14.552Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: pasos, verificabilidad y rollback en 0.99; ningún criterio bajó a zona de bloqueo (24 de 40 entre 0.80 y 0.89 por redacción); partir los siete compuestos choca con el tope de 40 y los otros dos mundos pasaron con la misma forma."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T02:26:15.072Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-2cf4af\",\"source\":\"autorizacion\",\"quote\":\"aprobación de planes y análisis de la feature vista-agentes\",\"planHash\":\"sha256:161615b5561989880827e72048bd26e282a9bcb6a04d7262871217bdffa53e12\",\"authorizationId\":\"APA-20261009-2cf4af\",\"authorizationHash\":\"sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-FEATURE-WEB-MUNDO-INVERNADERO-20261008-plan-1\",\"receiptStateHash\":\"sha256:df4a9d36033c02579f1b2f83ef4a4faeb9d3c07e64c4299d344c119e38c081c4\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T02:26:15.455Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-2cf4af (fuente autorizacion, hash sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3), plan sha256:161615b5561989880827e72048bd26e282a9bcb6a04d7262871217bdffa53e12."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T02:26:15.455Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T02:26:32.247Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T02:35:02.021Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T02:35:02.368Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-09T02:35:41.223Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:22.190Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:22.490Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:22.800Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:23.089Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:23.400Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:23.742Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:24.107Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:24.423Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:24.725Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:25.024Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:25.334Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:25.645Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:27.283Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:27.489Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-09",
    "at": "2026-10-09T14:07:27.904Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
