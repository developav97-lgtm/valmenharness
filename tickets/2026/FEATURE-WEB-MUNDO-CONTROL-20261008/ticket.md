---
schema_version: 2
id: FEATURE-WEB-MUNDO-CONTROL-20261008
title: Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo
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
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-MUNDO-CONTROL-20261008

## Solicitud original

Parte del sprint: Los tres mundos completos y validados contra el prototipo.
- R-ESC-011: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada
- R-MUN-001: Cada mundo DEBE implementar la misma interfaz sobre el motor
- R-MUN-002: Cada mundo DEBE dar un puesto propio a la sesión principal
- R-MUN-003: Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje
- R-MUN-005: El centro de control DEBE ser la sala del prototipo
- R-MUN-007: Los personajes DEBEN ser los sprites del prototipo
- R-MUN-008: Cada mundo DEBE pasar la validación visual contra el prototipo
Depende de: FEATURE-WEB-VISTA-LIENZO-20261008, IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada Cada mundo DEBE implementar la misma interfaz sobre el motor Cada mundo DEBE dar un puesto propio a la sesión principal Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje El centro de control DEBE ser la sala del prototipo Los personajes DEBEN ser los sprites del prototipo Cada mundo DEBE pasar la validación visual contra el prototipo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-011: lo cubre IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008 (Marco con tokens del tema, celular, iPad y reduced-motion)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008 (Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ningún elemento del pedido nombra algo que el código no tenga: estaciones, estados visuales, `pregunta`, cola, entregados, el módulo de sprites y el título de paneles por mundo ya existen en main (`packages/server/web/agentes/motor.js:8-19`, `packages/server/src/agentes.ts:63-79`, `packages/server/web/agentes/montaje.js:134-141`, `packages/server/web/agentes/mundos/sprites.js:70-101`, `packages/server/web/index.html:6395-6404`). Había seis decisiones de diseño donde el prototipo y el motor no coinciden. Las decidió Claude por delegación del PO el 2026-10-09: el orquestador transmitió las palabras del PO «vamos a seguir tus recomendaciones para este feature», y la decisión del REVIEW del análisis quedó en el recibo (`humanDecision`, actor `claude`, `.valmen/receipts/FEATURE-WEB-MUNDO-CONTROL-20261008.jsonl`). En cada una queda decidida la opción por defecto propuesta:

1. Paneles. El prototipo tiene dos, «Telemetría» y «Misiones» (`vista-agentes.html:150`); la vista tiene tres (`index.html:6566-6570`), y en la pastelería el PO decidió conservar los tres con títulos del mundo. Pregunta: ¿qué títulos llevan los tres paneles en el centro de control? Decidido (opción por defecto): `{ agentes: "Telemetría", cola: "Misiones en espera", entregados: "Misiones cerradas" }`.
2. Tipografía. El prototipo carga Chakra Petch desde Google Fonts (`vista-agentes.html:3,13`). Pregunta: ¿se aplica la misma regla que en la pastelería, la pila `"Chakra Petch", "Segoe UI", sans-serif` sin descarga externa? Decidido (opción por defecto): sí, sin descarga, anotando la diferencia en la evidencia.
3. Qué se mueve al cambiar de estación. En el prototipo el operador se queda sentado en su consola (`vista-agentes.html:230`, objetivo por `idx`, no por etapa) y lo que viaja es el punto del ticket por la pista a 120 px/s (`vista-agentes.html:221,249`); el motor solo anima agentes hacia `mundo.posicion(estacion, carril)` (`motor.js:80-84,131-155`) y no tiene puntos de ticket. Pregunta: ¿el punto se desliza por la pista o salta de pantalla en pantalla? Decidido (opción por defecto): `posicion` ignora la estación y devuelve la consola del carril, y el mundo desliza el punto con una memoria propia por agente que avanza con el `t` de la escena a 120 px/s (sin azar, sin tocar `motor.js`).
4. Número de consolas. El prototipo pone las consolas en `130 + idx * 175` (`vista-agentes.html:230`), que caben cinco en 960 px; el carril del motor crece sin tope (`motor.js:104,108`). Pregunta: ¿qué pasa con el sexto agente? Decidido (opción por defecto): cinco consolas y `carril % 5` (la corrida orquestada lanza tres a la vez por defecto, AGENTES.md «Corrida orquestada»).
5. Texto de la franja. El prototipo muestra «OLA n» y la pregunta (`¿Apruebo el plan?` / `¿Pasaron tus pruebas?`) derivada de la etapa (`vista-agentes.html:256,406-407`); la fila no trae ola (`agentes.ts:63-79`) y el texto real de la pregunta es de FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008. Pregunta: ¿qué dice la franja? Decidido (opción por defecto): «TURNO DE NOCHE · n MISIONES ACTIVAS» sin ola, y en pregunta «ESPERANDO A ANITA · LÍNEA 1 · <ticket corto> · <pregunta por estación>», con la pregunta derivada de la estación 3 o 5 como en el prototipo.
6. Salida del operador. El motor lleva al puesto principal a todo agente que termina o desaparece de las filas (`motor.js:80-81,120,125`); en el prototipo el operador cerrado se queda en su consola con el monitor azul «CERRADA» hasta irse (`vista-agentes.html:227,419-421`). Pregunta: ¿se acepta que el operador camine hasta la dirección antes de salir? Decidido (opción por defecto): sí, el monitor de su consola queda azul con «CERRADA» durante los 5 s de salida (`SALIDA_MS`, `motor.js:25`), y la diferencia se anota en la evidencia; cambiar `objetivoDe` es del motor, fuera de alcance (AP-003, `.valmen/memory/aprendizajes.md:21`).

## Descripción funcional

- Alcance: reemplazar el dibujo provisional de `packages/server/web/agentes/mundos/control.js` por la sala del prototipo `.valmen/features/vista-agentes/assets/vista-agentes.html` (mundo centro de control, `vista-agentes.html:374-429`): sala oscura con suelo en perspectiva, ocho pantallas con los tickets de cada etapa y su barra de avance, pista con un punto por ticket y su haz hasta la consola, franja de turno que se vuelve roja con la pregunta, dirección en tarima con teléfono rojo y «Anita en línea», consolas con monitor por estado y operadores con auricular que teclean; además los títulos y el estilo oscuro de los paneles para este mundo. Reutiliza lo que la pastelería ya dejó en main: `mundos/sprites.js` (declarado en `ARCHIVOS_WEB`, `packages/server/src/server.ts:2352`), el estado de dibujo con `cola`, `entregados`, `ahoraMs` y `ventanaRespuestaMs` (`montaje.js:134-141`) y `aplicarMundoAPaneles` (`index.html:6398-6404`). Fuera de alcance: el motor, la pastelería, el invernadero y el marco (AP-003).
- Usuario o rol afectado: el PO que sigue la corrida en la vista Agentes de la consola local y elige el mundo «Centro de control» en el selector (`index.html:6440-6457`).
- Comportamiento actual: el centro de control es un esquema provisional: fondo azul noche, título «CENTRO DE CONTROL», ocho rectángulos en fila a y=130 (las humanas en rojo), un rectángulo para la principal y cada agente como un círculo coloreado por estado (`control.js:17-52`). No hay pantallas con tickets, pista, franja, dirección, consolas, sprites ni señal de pregunta; los paneles salen con los títulos por defecto («Agentes vivos», «Cola», «Entregados», `index.html:6395`) y sin estilo de mundo.
- Comportamiento esperado: con los datos reales de `/api/corrida/agentes`, la escena es la sala del prototipo: la sesión principal es el director, sentado de espaldas con gafas en la tarima central (480, 282); cada subagente es un operador con auricular sentado en su consola, con monitor del color de su carril mientras trabaja, ámbar parpadeante con «ESPERA» si espera a una persona y azul con «CERRADA» al terminar; en la pantalla de su etapa aparece su ticket con barra de avance y su punto en la pista con un haz hasta la consola; con una pregunta abierta la franja se vuelve roja y parpadea con «ESPERANDO A ANITA · LÍNEA 1 · …» y el teléfono rojo parpadea; con una respuesta reciente aparece «Anita en línea»; los paneles se ven oscuros con títulos en Chakra Petch.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - El dibujo del centro de control es provisional por diseño: el archivo lo declara y delega el dibujo fiel en FEATURE-WEB-MUNDO-* (`packages/server/web/agentes/mundos/control.js:3-5`). `dibujar` pinta rectángulos y círculos (`control.js:17-52`) y la paleta son literales sin `valmen:allow-color` (`control.js:10,22,24,31,38`).
  - Las posiciones no son las del prototipo: `posicion` pone a cada agente en `60 + i*120` según su estación (`control.js:12-14`) y el puesto principal en `{480, 70}` (`control.js:60`). En el prototipo el director está en `{480, 282}` y cada operador en su consola `{130 + idx*175, 420}`, que no depende de la etapa (`vista-agentes.html:230`); lo que recorre las etapas es el punto del ticket en `x = 24 + etapa*116 + 54`, `y = 165` (`vista-agentes.html:221`).
  - El motor no anima nada más que agentes: `objetivoDe` usa `mundo.posicion(estacion, carril)` y `avanzar` solo mueve agentes (`motor.js:80-84,131-155`). El deslizamiento del punto por la pista (`vista-agentes.html:249`, 120 px/s) tiene que vivir en el mundo, derivado de `escena.t` y de `agente.estacion`, sin azar (`motor.js:3-5`) (decisión 3).
  - El montaje ya entrega al dibujo `cola`, `entregados`, `ahoraMs` y `ventanaRespuestaMs` (`montaje.js:134-141`), y `index.html` ya aplica `mundo.paneles` y `data-mundo` a los paneles (`index.html:6398-6404,6456,6615`): este ticket no necesita tocar `montaje.js` ni el JavaScript de `index.html`, solo el CSS de paneles por `data-mundo="control"` (hoy solo existe el de la pastelería, `index.html:2248-2267`).
  - El sprite del operador ya existe: `SOMBREROS.auricular` y `SOMBREROS.gafas` (`sprites.js:25,28`), `dibujarPersonaje` con la opción `sentado` que corta las piernas (`sprites.js:65-90`) y la insignia dorada de la principal (`sprites.js:96-99`). No hace falta un estático nuevo: `control.js` ya está en `ARCHIVOS_WEB` (`server.ts:2353`), que es el «estático declarado» del título.
  - La fila no trae la ola ni el texto de la pregunta (`agentes.ts:55-79`): la franja del prototipo (`vista-agentes.html:406-407`) solo se puede reproducir con la cuenta de misiones activas y una pregunta derivada de la estación (decisión 5).
  - `revisar_presentacion` no inspecciona `.js` (`packages/engine/src/presentation.ts:38-62`): el marcado `valmen:allow-color` de `control.js` solo se comprueba con una prueba propia, como en la pastelería; el CSS nuevo de `index.html` sí lo revisa la herramienta.
- Hipótesis pendientes:
  - Una memoria por agente dentro del mundo (un `Map` de identificador a `x` del punto, con el último `t` visto) basta para el deslizamiento: el mundo es el mismo objeto para el lienzo y para la miniatura (`index.html:6444`), así que la miniatura debe dibujar sin leer ni escribir esa memoria. Se comprueba con una prueba que dibuja la miniatura entre dos cuadros y verifica que el punto no salta.
  - Al elegir el centro de control, `elegirMundo` crea una escena nueva (`montaje.js:179-186`) y los agentes nacen en el puesto principal (`motor.js:103`): caminan desde la tarima hasta su consola, como el prototipo al arrancar. Los puntos deben arrancar en la pantalla de su etapa sin deslizarse desde x = 0.
  - El color translúcido del prototipo concatena un alfa hexadecimal al color (`color + "88"`, `vista-agentes.html:392,402,420`); los colores de `rasgosDe` son `#rrggbb` (`sprites.js:31`), así que la concatenación da `#rrggbbaa` válido. Se confirma en la verificación del navegador.
  - Con desvío (`blocked`, `changes_requested`) el agente queda en la última estación válida (`motor.js:33-36`): su ticket se ve en esa pantalla, sin marca de desvío, como el prototipo (que no tiene desvíos).
- Consumidores afectados:
  - `packages/server/web/agentes/mundos/control.js`: se reescribe; lo registra `mundos/index.js:3,7` y lo dibujan el lienzo (`montaje.js:137`) y la miniatura del selector (`index.html:6444`).
  - `packages/server/web/index.html:2248-2267`: se agrega el CSS de paneles para `data-mundo="control"`.
  - `tests/vista-lienzo.test.ts` (los mundos registrados cumplen la interfaz) y `tests/estaticos-web.test.ts` (la lista de estáticos no cambia).
  - FEATURE-WEB-MUNDO-INVERNADERO-20261008 corre en paralelo y toca `index.html` (CSS de su mundo, otro bloque): riesgo de conflicto de integración solo de texto.
- Archivos y flujo investigados: `GET /api/corrida/agentes` → `vistaCorrida` (`index.html:6464`) → `pintarLienzoDeAgentes` y `montaje.montar(lienzo, agentes, ahora, datos)` (`index.html:6406-6461`) → `actualizar` fija objetivos con `mundo.posicion` / `puestoPrincipal` (`motor.js:96-128`) → cada cuadro `avanzar` y `mundo.dibujar(estado, escena.t)` (`montaje.js:134-158`); al elegir mundo, `elegirMundo` (`montaje.js:179-186`) y `aplicarMundoAPaneles` (`index.html:6398-6404,6456`); refresco cada 5 s con `programarRefrescoDeCorrida` (`index.html:6631-6639`). Leídos además `motor.d.ts`, `mundos/sprites.js`, `mundos/pasteleria.js` (plantilla), `server.ts:2346-2354`, `presentation.ts`, la spec `s3-mundos/spec.md` (R-MUN-003, R-MUN-005, R-MUN-008), el ticket FEATURE-WEB-MUNDO-PASTELERIA-20261008 (plan, criterios y decisiones del PO) y el prototipo (`vista-agentes.html:3-16,73-85,133-260,374-429,481-511`). `buscar_memoria` no devolvió nada del mundo; aplica AP-003 al alcance.
- Riesgos y compatibilidad:
  - Estado propio en el mundo: es el primer mundo con memoria entre cuadros (el punto). Mitigación: la memoria solo guarda posiciones de dibujo, se purga de agentes que ya no están en la escena y la miniatura no la usa; el motor sigue puro.
  - Cambiar `posicion` y `puestoPrincipal` mueve a los agentes ya en escena: el motor los lleva caminando, sin reiniciar (`motor.js:121,140-153`).
  - Rendimiento: el prototipo traza 13 líneas de perspectiva, ~60 franjas de escaneo y un sprite 12×16 por agente por cuadro; es del orden del prototipo, que corre fluido. Con `prefers-reduced-motion` el montaje baja a 4 cuadros por segundo (`montaje.js:151`) y el parpadeo de la franja (2 Hz, `vista-agentes.html:376`) se ve más lento.
  - Modo oscuro: la sala y los paneles del mundo tienen paleta propia y no cambian con el tema (R-ESC-011); el marco sigue con los tokens.
  - Sin red: no se carga Chakra Petch desde un tercero (decisión 2); el texto cae en la fuente de respaldo.
  - Conflicto en `index.html` con el invernadero en paralelo: bloques CSS distintos; lo integra el orquestador.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es código de cliente servido por la consola local (`packages/server/web/`); no hay datos sincronizados, esquema, imagen ni despliegue, y no cambia `ARCHIVOS_WEB` (`control.js` ya está declarado).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-2cf4af creada por el PO.
- Alcance: el mundo «Centro de control» completo contra el prototipo (`assets/vista-agentes.html:374-429`): `mundos/control.js` reescrito con la sala, el director, las consolas, las pantallas, la pista con su punto por ticket y la franja de turno; y en `index.html` el CSS de los paneles para `data-mundo="control"`. Reutiliza sin cambios `mundos/sprites.js`, `montaje.js` (estado de dibujo con `cola`, `entregados`, `ahoraMs`, `ventanaRespuestaMs`) y `aplicarMundoAPaneles`. Exclusiones: `motor.js` y `motor.d.ts` (la salida hacia el puesto principal se queda como está, decisión 6), `montaje.js`, `sprites.js`, `pasteleria.js`, `invernadero.js`, el JavaScript de `index.html`, `ARCHIVOS_WEB` (sin estático nuevo), `/api/corrida/agentes` y el texto real de la pregunta (FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008). Sin «?» sobre el operador: el prototipo del centro de control no lo dibuja (`vista-agentes.html:416-428`) y la spec del mundo pone la señal en la franja, el teléfono y el monitor ámbar «ESPERA» (`s3-mundos/spec.md`, escenario de R-MUN-005); manda la sala del prototipo.
- Pasos ordenados:
  1. `packages/server/web/agentes/mundos/control.js` (reescrito sobre `vista-agentes.html:374-429`): `PALETA` con un color por línea marcado `valmen:allow-color` «paleta de la sala del centro de control»; `ESTACIONES` sin cambios (`["Ingreso", "Análisis", "Plan", "Autorización", "Ejecución", "Pruebas", "QA", "Cierre"]`); `PUESTO_PRINCIPAL = { x: 480, y: 282 }`; `posicion(indice, carril)` = `{ x: 130 + (carril % 5) * 175, y: 420 }` (decisiones 3 y 4); `paneles` = `{ agentes: "Telemetría", cola: "Misiones en espera", entregados: "Misiones cerradas" }` (decisión 1). Funciones puras exportadas: `corto(id)` (dos primeros segmentos, `vista-agentes.html:167`); `xDePantalla(i)` = `78 + 116 * i`; `anchoDeBarra(i)` = `92 * (i + 1) / 8`; `ticketsEnPantalla(agentes, entregados, i)` (los tickets de los operadores con `estacion` `i` y, en la pantalla 7, los últimos entregados; como mucho 3); `monitorDe(agente, t)` (`esperando`: `{ color: "#f2a52a", rotulo: "ESPERA" }` con `Math.floor(t * 2) % 2 === 0` y `"#7a5212"` si no; `termino`: `{ color: "#5b8dff", rotulo: "CERRADA" }`; `trabajando`: color del carril de `rasgosDe` + `"77"` y rótulo el primer segmento del ticket); `franja(agentes)` («TURNO DE NOCHE · n MISIONES ACTIVAS» sin ola, o con pregunta abierta «ESPERANDO A ANITA · LÍNEA 1 · <corto> · ¿Apruebo el plan?» en la estación 3 y «¿Pasaron tus pruebas?» en la 5, decisión 5); `colorDeFranja(alerta, t)` (`"#4a1118"`/`"#2a0b10"` alternando a 2 Hz, `"#0d1730"` sin alerta); `telefono(agentes, ahoraMs, ventanaMs)` (`{ encendido, anitaEnLinea }`, misma ventana que `senalDeAnita` de la pastelería); `aparienciaDelDirector()` = `{ sentado: true, camisa: "#1e2c55", sombrero: "gafas" }`; `aparienciaDelOperador(agente)` = `{ sentado: !agente.moviendo, sombrero: "auricular" }`; y `avanzarPuntos(memoria, agentes, t)`, que mueve el punto de cada operador hacia `xDePantalla(agente.estacion)` a 120 px/s con el `t` de la escena, hace nacer el punto de un agente nuevo ya en su pantalla y borra los de agentes que no están (decisión 3). `dibujar(estado, t)` pinta fondo, perspectiva, pantallas con nombre, id del estado, «REQUIERE PERSONA» en 3 y 5, tickets con barra y franjas de escaneo, pista con puntos y haz, franja, tarima con escritorio, teléfono rojo y «Anita en línea», director, consolas con monitor, manos que teclean, operadores y los rótulos de nombre (cuatro primeros caracteres de `fila.agente`), ticket corto y herramienta sin `mcp__valmen__`. La memoria de puntos es del módulo y solo la usa el dibujo con `miniatura: false`; la miniatura dibuja los puntos en su pantalla sin leer ni escribir la memoria. Sin `cola`, `entregados` ni `ahoraMs`, no lanza. (C1-C30)
  2. `packages/server/web/index.html`, CSS junto al bloque de la pastelería (`index.html:2248-2267`): `.corrida-paneles[data-mundo="control"] .corrida-panel` con fondo `#080d1a`, texto `#9fd3ff` y borde `#223a6e`, títulos `h3` en `#8fb4ff` con `font-family: "Chakra Petch", "Segoe UI", sans-serif` sin cargar fuentes externas (decisión 2), y `.id`, `td` y `.rotulo` en `#dfe9ff` como el prototipo (`vista-agentes.html:76-79`); cada línea con color lleva `valmen:allow-color` con «centro de control» en el motivo. (C31, C32)
  3. `tests/mundo-control.test.ts` (nuevo, mismo armado que `tests/mundo-pasteleria.test.ts`: contexto de lienzo falso con `Proxy` que registra llamadas y agentes de escena fabricados): una prueba por criterio con su número al inicio del nombre (`C1:` …); C30 y C31 leen el texto de `control.js` y de `index.html`. (C1-C31)
  4. Verificación en el navegador con `valmen serve` del worktree en `#/agentes`, mundo «Centro de control». Preparación de las filas: se parchea `window.fetch` desde la consola del navegador para que `/api/corrida/agentes` devuelva filas simuladas con la forma de `AgenteDeCorrida` (`packages/server/src/agentes.ts:63-79`), leídas de una variable global editable (`window.__filas`), como en FEATURE-WEB-MUNDO-PASTELERIA-20261008. Datos: la sesión principal, tres subagentes (uno en `approved` con `estado` `esperando` y pregunta abierta, uno en `in_progress` `trabajando`, uno en `planned` `trabajando`), dos tickets en cola y un entregado. Para C33 y C34: se cambia en `window.__filas` el `ticketEstado` del subagente en `in_progress` a `awaiting_user_tests`; el refresco de 5 s (`programarRefrescoDeCorrida`, `index.html:6631-6639`) trae la fila nueva, `actualizar` (`motor.js:96-128`) no mueve su objetivo porque `posicion` no depende de la estación, y se observa y captura el punto deslizándose por la pista de x = 542 a x = 658 con el operador quieto en su consola. Capturas lado a lado con el prototipo abierto en el mismo ancho y tema: escritorio (1280 px) y 390 px, claro y oscuro; `revisar_presentacion` sobre el cambio. Las capturas y las diferencias con su motivo (fuente de respaldo, salida hacia la dirección, franja sin ola) quedan en `## Evidencia`. (C32-C39)
  5. Regresión: `npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/mundo-pasteleria.test.ts tests/vista-corrida.test.ts`. (C40)
- Impactos declarados: ninguno; sin sincronización, migración ni contenedores. No hay archivo servido nuevo: `agentes/mundos/control.js` ya está en `ARCHIVOS_WEB` (`server.ts:2353`).
- Rollback (obligatorio): revertir el commit del ticket en su rama; vuelven el dibujo provisional de `control.js` y los paneles sin estilo para este mundo. No hay datos ni estado persistido que deshacer: la memoria de puntos vive en la página y la preferencia de mundo en `localStorage` no cambia de clave ni de valores.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-MUN-001: `validarMundo` aplicado al mundo centro de control devuelve una lista vacía.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C1: -->
- [x] C2 — R-MUN-001: dibujar la miniatura con una escena vacía y sin cola no lanza.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C2: -->
- [x] C3 — R-MUN-001: dibujar la miniatura entre dos cuadros del lienzo no cambia la `x` guardada del punto de un operador.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C3: -->
- [x] C4 — R-MUN-002: el puesto principal del centro de control es la tarima, en `{ x: 480, y: 282 }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C4: -->
- [x] C5 — R-MUN-002: `aparienciaDelDirector()` es igual a `{ sentado: true, camisa: "#1e2c55", sombrero: "gafas" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C5: -->
- [x] C6 — R-MUN-005: para cada estación `i` de 0 a 7 y carril de 0 a 9, `posicion(i, carril)` es igual a `{ x: 130 + 175 * (carril % 5), y: 420 }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C6: -->
- [x] C7 — R-MUN-005: `mundo.estaciones` es igual a `["Ingreso", "Análisis", "Plan", "Autorización", "Ejecución", "Pruebas", "QA", "Cierre"]`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C7: -->
- [x] C8 — R-MUN-005: para cada `i` de 0 a 7, `xDePantalla(i)` devuelve `78 + 116 * i`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C8: -->
- [x] C9 — R-MUN-005: con un operador en la estación 4 y ticket `T-1`, `ticketsEnPantalla(agentes, [], 4)` contiene `T-1`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C9: -->
- [x] C10 — R-MUN-005: con los entregados `["E-1", "E-2"]`, `ticketsEnPantalla([], entregados, 7)` contiene `E-2`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C10: -->
- [x] C11 — R-MUN-005: con cinco operadores en la estación 2, `ticketsEnPantalla` de la pantalla 2 devuelve 3 tickets.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C11: -->
- [x] C12 — R-MUN-005: para cada `i` de 0 a 7, `anchoDeBarra(i)` devuelve `92 * (i + 1) / 8`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C12: -->
- [x] C13 — R-MUN-005: dibujar la escena sin miniatura escribe «REQUIERE PERSONA» exactamente 2 veces.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C13: -->
- [x] C14 — R-MUN-003: `monitorDe` de un operador `esperando` en `t = 0` es igual a `{ color: "#f2a52a", rotulo: "ESPERA" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C14: -->
- [x] C15 — R-MUN-003: `monitorDe` de un operador `termino` es igual a `{ color: "#5b8dff", rotulo: "CERRADA" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C15: -->
- [x] C16 — R-MUN-003: `monitorDe` de un operador `trabajando` en el carril 0 con ticket `FEATURE-WEB-X-1` es igual a `{ color: "#2f9e6b77", rotulo: "FEATURE" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C16: -->
- [x] C17 — R-MUN-003: con dos operadores `trabajando` y sin pregunta, `franja(agentes)` es igual a `{ alerta: false, texto: "TURNO DE NOCHE · 2 MISIONES ACTIVAS" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C17: -->
- [x] C18 — R-MUN-003: con una pregunta abierta en la estación 3 del ticket `FEATURE-WEB-MUNDO-CONTROL-20261008`, `franja(agentes).texto` es «ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Apruebo el plan?».
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C18: -->
- [x] C19 — R-MUN-003: con una pregunta abierta en la estación 5, `franja(agentes).texto` termina en «¿Pasaron tus pruebas?».
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C19: -->
- [x] C20 — R-MUN-003: `colorDeFranja(true, 0)` es distinto de `colorDeFranja(true, 0.5)`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C20: -->
- [x] C21 — R-MUN-003: con una pregunta abierta, `telefono(agentes, ahoraMs, 60000).encendido` es `true`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C21: -->
- [x] C22 — R-MUN-003: con una pregunta respondida hace 30 s, `telefono(agentes, ahoraMs, 60000).anitaEnLinea` es `true`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C22: -->
- [x] C23 — R-MUN-003: con una pregunta respondida hace 61 s, `telefono(agentes, ahoraMs, 60000).anitaEnLinea` es `false`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C23: -->
- [x] C24 — R-MUN-005: el punto de un operador nuevo en la estación 2 nace en `x = 310`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C24: -->
- [x] C25 — R-MUN-005: tras pasar ese operador a la estación 3 y avanzar `t` 0.5 s, su punto está en `x = 370`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C25: -->
- [x] C26 — R-MUN-005: tras avanzar `t` 2 s más, su punto está en `x = 426`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C26: -->
- [x] C27 — R-MUN-007: el sprite de un operador quieto ocupa un rectángulo de 36 px de ancho por 36 px de alto (sentado, sin piernas).
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C27: -->
- [x] C28 — R-MUN-007: `aparienciaDelOperador({ moviendo: true })` es igual a `{ sentado: false, sombrero: "auricular" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C28: -->
- [x] C29 — R-ESC-011: `mundo.paneles` es igual a `{ agentes: "Telemetría", cola: "Misiones en espera", entregados: "Misiones cerradas" }`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C29: -->
- [x] C30 — R-ESC-011: toda línea de `mundos/control.js` que contiene un color lleva `valmen:allow-color`.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C30: -->
- [x] C31 — R-ESC-011: cada `valmen:allow-color` del CSS `data-mundo="control"` de `index.html` nombra «centro de control» en su motivo.
      <!-- test: npx vitest run tests/mundo-control.test.ts -t C31: -->
- [x] C32 — R-ESC-011: `revisar_presentacion` sobre el cambio del ticket no reporta ningún color sin `valmen:allow-color`.
      <!-- verify: manual -->
- [x] C33 — R-MUN-005: en el navegador, al cambiar en las filas simuladas el `ticketEstado` de un subagente de `in_progress` a `awaiting_user_tests`, su punto se desliza por la pista de x = 542 a x = 658.
      <!-- verify: manual -->
- [x] C34 — R-MUN-005: en el navegador, durante ese cambio el operador sigue sentado en su consola sin desplazarse.
      <!-- verify: manual -->
- [ ] C35 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema claro junto a la del prototipo con el mismo ancho y tema.
      <!-- verify: manual -->
- [ ] C36 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema oscuro junto a la del prototipo con el mismo ancho y tema.
      <!-- verify: manual -->
- [ ] C37 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema claro junto a la del prototipo con el mismo ancho y tema.
      <!-- verify: manual -->
- [ ] C38 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema oscuro junto a la del prototipo con el mismo ancho y tema.
      <!-- verify: manual -->
- [ ] C39 — R-MUN-008: cada diferencia observada con el prototipo queda anotada en `## Evidencia` con su motivo.
      <!-- verify: manual -->
- [x] C40 — Las pruebas existentes del lienzo, del motor, de los estáticos, del marco, de la pastelería y de la vista Agentes siguen pasando.
      <!-- test: npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/mundo-pasteleria.test.ts tests/vista-corrida.test.ts -->

## Puntos

```json
[]
```

## Implementación

Hecho el 2026-10-09 sobre el plan aprobado (rama `valmen/ticket-mundo-control`), sin salirse del alcance:

- `packages/server/web/agentes/mundos/control.js` (reescrito sobre `vista-agentes.html:374-429`): `PALETA` con `valmen:allow-color`; `PUESTO_PRINCIPAL` `{ x: 480, y: 282 }`; `posicion` por carril (`130 + 175 * (carril % 5)`, `y: 420`, sin depender de la estación); `paneles` «Telemetría», «Misiones en espera», «Misiones cerradas»; funciones puras `corto`, `xDePantalla`, `anchoDeBarra`, `ticketsEnPantalla`, `monitorDe`, `franja`, `colorDeFranja`, `telefono`, `aparienciaDelDirector`, `aparienciaDelOperador`, `crearMemoria` y `avanzarPuntos`; y `dibujar` con las ocho pantallas, la pista con su punto por ticket, la franja, la tarima con el teléfono rojo, el director y las cinco consolas. La memoria de puntos (`memoriaDePuntos`) la usa solo el dibujo con `miniatura: false`.
- `packages/server/web/index.html`: CSS de los paneles `data-mundo="control"` (fondo, texto, borde, títulos en Chakra Petch con respaldo Segoe UI, sin descargar fuentes), puesto antes del bloque de la pastelería para no entrar en el recorte de su prueba.
- `tests/mundo-control.test.ts` (nuevo): una prueba por criterio automático con su número en el nombre (C1-C31) más una de dibujo completo.

Decisiones aplicadas tal como quedaron en «Supuestos y decisiones pendientes» (1-6). Una precisión de implementación: la consola del operador que sale se dibuja en la posición de su carril, no en la del agente, para que el monitor azul «CERRADA» se quede en su sitio mientras camina hacia la dirección (decisión 6).

Pendiente: C35-C39 (capturas contra el prototipo en escritorio y 390 px, claro y oscuro, y diferencias anotadas): quedan para el responsable; el ticket pasa a `awaiting_user_tests` con eso declarado.

## Pruebas

Directorio de ejecución: la raíz del repositorio (o del worktree).

1. `npm run build` y `npx tsc --noEmit -p .`: el build pasa. `tsc --noEmit` repite el aviso TS7016 (módulos `.js` sin declaración) que ya dan las pruebas existentes, más el de `control.js` y `sprites.js` en la prueba nueva: mismo origen, sin errores de otra clase.
2. `npx vitest run tests/mundo-control.test.ts`: 32 pruebas, todas pasan (C1-C31 y una de dibujo completo). Cada criterio corre con `-t C<n>:`.
3. `npx vitest run tests/vista-lienzo.test.ts tests/motor-escena.test.ts tests/estaticos-web.test.ts tests/vista-marco-responsivo.test.ts tests/mundo-pasteleria.test.ts tests/vista-corrida.test.ts`: 95 pruebas, todas pasan (C40). `tests/interfaz-ejecutable.test.ts` también (requiere `npm run build` antes).

Validaciones manuales (hechas por el agente, medidas, sin capturas guardadas):

- C32: `revisar_presentacion` con `root` en el worktree: 1 archivo de interfaz revisado, 0 colores sin `valmen:allow-color`.
- C33 y C34: `node packages/cli/dist/main.js serve --port 4791` en el worktree, `#/agentes`, mundo «Centro de control», con `window.fetch` parcheado (`window.__filas`: principal, tres subagentes, uno `approved` con pregunta abierta, uno `in_progress`, uno `planned`). Al pasar el subagente de `in_progress` a `awaiting_user_tests` el punto de la memoria fue de x = 542 a 604 a 658 en unos 2 s; al pasarlo luego a `in_qa`, de 658 a 774. En las 540 muestras de `dibujar` su operador estuvo siempre en x = 480, `moviendo: false`, con la estación cambiando de 5 a 6.
- Comprobado a ojo en 1280 px: ocho pantallas con «REQUIERE PERSONA» en Autorización y Pruebas, franja roja «ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Apruebo el plan?», director en la tarima, monitor ámbar «ESPERA» y paneles azul noche con título «Telemetría».

Pendiente del responsable (C35-C39): capturas lado a lado con el prototipo (`.valmen/features/vista-agentes/assets/vista-agentes.html`) en 1280 y 390 px, tema claro y oscuro, con las diferencias y su motivo en `## Evidencia`. Diferencias ya conocidas: fuente de respaldo (Segoe UI) en lugar de Chakra Petch (decisión 2); franja sin «OLA n» (decisión 5); el operador que cierra camina hasta la dirección durante los 5 s de salida, con el monitor «CERRADA» fijo en su consola (decisión 6); el punto de una misión entregada no queda en la pista, la pantalla 7 lista los entregados.

Requisitos de ambiente: Node 24, `npm install` hecho y `npm run build` previo a `interfaz-ejecutable`.

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
    "at": "2026-10-08T23:30:59.500Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T02:04:09.568Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T02:05:24.812Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por claude (recibo GR-20261009-FEATURE-WEB-MUNDO-CONTROL-20261008-analysis-1, canal cli, decidida 2026-10-09T02:05:24.809Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: un solo punto bajo (nombra_archivos_reales 0.77, patrón ya visto: el precheck no comprueba citas desde el worktree), el resto en 0.91 o más, y el diagnóstico cita lo ya existente en main."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T02:08:00.785Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T02:09:33.091Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-FEATURE-WEB-MUNDO-CONTROL-20261008-plan-1, canal cli, decidida 2026-10-09T02:09:33.088Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: pasos, verificabilidad y rollback en 0.99; la banda (27 criterios entre 0.55 y 0.89) viene de la redacción —partir C36-C38 pasaría de 40 criterios y el precheck lo rechaza— y la pastelería pasó con la misma forma."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T02:09:33.536Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-2cf4af\",\"source\":\"autorizacion\",\"quote\":\"aprobación de planes y análisis de la feature vista-agentes\",\"planHash\":\"sha256:d075c1955b6f4389becf1916d2021170743abe58b495458ec8160379aebb3442\",\"authorizationId\":\"APA-20261009-2cf4af\",\"authorizationHash\":\"sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-FEATURE-WEB-MUNDO-CONTROL-20261008-plan-1\",\"receiptStateHash\":\"sha256:31ef6bf180a6e18ebaffcd243a7fe379eaf7ed0c982d782d355db5da30db31ac\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T02:09:39.774Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-2cf4af (fuente autorizacion, hash sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3), plan sha256:d075c1955b6f4389becf1916d2021170743abe58b495458ec8160379aebb3442."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T02:09:39.774Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T02:09:58.623Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T02:15:36.777Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T02:16:07.866Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
