---
schema_version: 2
id: FEATURE-WEB-VISTA-LIENZO-20261008
title: Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados
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

# FEATURE-WEB-VISTA-LIENZO-20261008

## Solicitud original

Parte del sprint: Vista Agentes renombrada, motor de escena con tests deterministas, lienzo montado con selector, aviso y paneles, marco responsivo.
- R-ESC-005: La vista DEBE recordar el mundo elegido solo en el navegador
- R-ESC-006: La escena NO DEBE reiniciarse en cada refresco de datos
- R-ESC-007: El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo
- R-ESC-008: Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual
Depende de: IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008, FEATURE-WEB-MOTOR-ESCENA-20261008, FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La vista DEBE recordar el mundo elegido solo en el navegador La escena NO DEBE reiniciarse en cada refresco de datos El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-006: lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008 (Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo)
- R-ESC-007: lo cubre FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008 (Vista muestra el texto de la pregunta y la respuesta)

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

- Alcance: montar en la vista «Agentes» de Mission Control (`packages/server/web/index.html`) un lienzo Canvas 2D de 960×480 que dibuja la escena a partir del motor ya integrado (`packages/server/web/agentes/motor.js`); un selector de mundo recordado solo en `localStorage` (R-ESC-005); la parte de montaje de R-ESC-006 (la escena sobrevive al repintado periódico de la vista: se reemplazan filas, no se recrea la escena ni se reinicia el bucle); el aviso de pregunta pendiente sobre el lienzo con a quién le toca, el ticket y desde cuándo, y «respondió» durante un minuto (parte de R-ESC-007 sin texto, opción A); dos paneles bajo el lienzo —agentes (sesión principal primero) y cola con entregados— con los mismos datos que hoy pintan «Agentes vivos», «Cola» y «Entregados» (R-ESC-008); y declarar los nuevos archivos en el mapa de estáticos del servidor.
- Fuera de alcance (asignado por el grafo de la feature, AP-003 `.valmen/memory/aprendizajes.md:21`): el dibujo completo de cada mundo contra el prototipo (FEATURE-WEB-MUNDO-PASTELERIA/CONTROL/INVERNADERO, S3); tokens del tema, celular/iPad y `prefers-reduced-motion` (IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO); la lógica pura del motor y sus tests (FEATURE-WEB-MOTOR-ESCENA, ya en main); el texto de la pregunta y la respuesta (FEATURE-WEB-VISTA-TEXTO-PREGUNTA, opción B).
- Usuario o rol afectado: el PO / responsable que sigue la ejecución orquestada en Mission Control.
- Comportamiento actual: la vista «Agentes» solo pinta texto: barra de simultáneos, seis KPI, tabla «Agentes vivos», «Cola» por olas y «Entregados» (`packages/server/web/index.html:6303-6390`). No hay lienzo, selector de mundo ni aviso de pregunta; el campo `pregunta` que ya entrega `GET /api/corrida/agentes` no se lee en el cliente. El motor existe pero ningún código del cliente lo importa.
- Comportamiento esperado: al abrir `#/agentes` (o sus alias) se ve el lienzo con la escena del mundo elegido (pastelería sin elección previa o si `localStorage` lanza), el selector con los mundos registrados y su miniatura, el aviso por cada pregunta abierta o recién respondida, y bajo el lienzo los paneles de agentes y de cola/entregados. Cada refresco de 5 s actualiza filas y paneles sin devolver a los agentes al puesto principal. Si la escena no puede montarse (sin `canvas` o sin módulo), la vista sigue pintando los paneles de texto.

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - La vista se pinta entera en cada refresco: `vistaCorrida` vacía el contenedor con `cont.textContent = ""` (`packages/server/web/index.html:6302`) y la reprograma `programarRefrescoDeCorrida` cada 5 s vía `navegar({ conservarVista: true })` (`packages/server/web/index.html:6406-6419`, `:8766`). Un `<canvas>` y un bucle creados dentro de `vistaCorrida` se perderían en cada repintado: por eso el estado de la escena (escena del motor, mundo, `requestAnimationFrame`) tiene que vivir fuera de la función y del DOM de la vista, y el repintado solo debe volver a enganchar el lienzo y pasar filas (diseño §4, `.valmen/features/vista-agentes/design.md`).
  - El motor es puro y no ofrece montaje: exporta `crearEscena`, `actualizar(escena, filas, ahoraMs)` y `avanzar(escena, dt, ahoraMs)` (`packages/server/web/agentes/motor.js:73`, `:96`, `:131`; tipos en `motor.d.ts`). `actualizar` ya conserva posición, carril y paso por id (`motor.js:96-128`), así que R-ESC-006 se cumple si la vista llama a `actualizar` sobre la **misma** escena; lo que falta es la capa que el diseño llama `montar(canvas, filas)` / `desmontar()`, que no existe y es de este ticket.
  - El servidor solo sirve lo declarado: `loadStatics(raizWeb, ["index.html"])` (`packages/cli/src/main.ts:1674`) y `serveStatic` busca el nombre exacto en el mapa (`packages/server/src/server.ts:1998-2012`); hoy `agentes/motor.js` se copia a `dist/web` (`scripts/copy-web.mjs` copia recursivo) pero **no se sirve**: un `import` desde el navegador daría 404. El MIME de `.js` ya existe (`server.ts:1993`).
  - Las preferencias del navegador se guardan con `try/catch` en `leerSimultaneos`/`guardarSimultaneos` (`index.html:6196-6212`, clave `valmen.corrida.simultaneos` en `:6088`); el mundo elegido seguirá el mismo patrón con su propia clave, sin escritura al servidor.
  - El dato de la pregunta ya llega por fila: `pregunta: { desde, respondidaEn } | null` (`packages/server/src/agentes.ts:56-59`, `:79`), sin texto. El registro de tickets no tiene campo de responsable (búsqueda de `responsable|owner|assignee` en `packages/engine/src` sin un campo de ticket), así que el aviso usa el respaldo de la spec, «una persona».
  - Los paneles reutilizan los datos ya calculados: `agentesVivos`, `kpisDeCorrida` (cola y `entregadosIds`), `olasDeCola`, `fraseDeFase` y `etiquetaDeEstadoRegistro` (`index.html:6097-6221`); la sesión principal está excluida de `agentesVivos` (`:6097-6101`) y el panel de agentes debe añadirla primero desde `agentes` (fila con `principal: true`).
- Hipótesis pendientes:
  - El arnés que ejecuta la interfaz en los tests copia solo el `<script type="module">` inline a un `.mjs` en `tmpdir` (`scripts/verificar-interfaz.mjs:571`, `:661-672`): un `import` estático relativo (`./agentes/…`) no resolvería allí y rompería `tests/vista-corrida.test.ts` e `tests/interfaz-ejecutable.test.ts`. Hipótesis a resolver en el plan: carga dinámica (`import()` con `catch` que deja los paneles) o que el arnés reescriba los imports relativos a la ruta real de `packages/server/web/`. El documento falso del arnés tampoco tiene `getContext`, `requestAnimationFrame` ni `document.fonts` (`verificar-interfaz.mjs:583-598`), así que el montaje debe degradar sin lanzar.
  - Los módulos de mundo completos son de S3; para que este ticket monte algo verificable hacen falta mundos registrados que cumplan `validarMundo` (`motor.js:52-71`). Hipótesis para el plan: registrar los tres mundos con nombre, lema, pregunta y estaciones del prototipo (`.valmen/features/vista-agentes/assets/vista-agentes.html:145-153`) y un dibujo esquemático mínimo que los tickets de S3 sustituyen.
  - Si el nombre de quien responde debiera salir del actor local de Mission Control (`valmen.actor`, `index.html:2501`) en vez de «una persona»: la spec dice «responsable del ticket, si el registro lo tiene», y el registro no lo tiene; se toma el respaldo y no el actor local.
- Consumidores afectados: la vista «Agentes» (`vistaCorrida` y su refresco); el arranque de `valmen serve` (`packages/cli/src/main.ts:1674`, mapa de estáticos); los tests que ejecutan la interfaz (`tests/vista-corrida.test.ts`, `tests/interfaz-ejecutable.test.ts`, `scripts/verificar-interfaz.mjs`); los tickets de S3 y el marco responsivo, que consumirán la interfaz de montaje y el registro de mundos. El endpoint `/api/corrida/agentes` y el motor no cambian.
- Archivos y flujo investigados: `packages/server/web/index.html` (`:2379` módulo, `:6085-6419` vista y refresco, `:8615-8629` rutas, `:8766` `navegar`); `packages/server/web/agentes/motor.js` y `motor.d.ts`; `packages/server/src/agentes.ts:40-80`; `packages/server/src/server.ts:1990-2012`, `:2343-2357`; `packages/cli/src/main.ts:1665-1690`; `scripts/copy-web.mjs`; `scripts/verificar-interfaz.mjs:566-675`; `tests/vista-corrida.test.ts`; spec `.valmen/features/vista-agentes/spec/s2-motor-escena/spec.md` y `s3-mundos/spec.md`; `design.md`; prototipo `assets/vista-agentes.html:111-113`, `:505-558`. Flujo: `navegar` → `vistaCorrida` → `GET /api/corrida/agentes`, `/api/journeys`, `/api/tickets` → pinta → `programarRefrescoDeCorrida` → `navegar` cada 5 s.
- Riesgos y compatibilidad:
  - Romper el arnés de la interfaz con un import relativo (ver hipótesis): mitigación en el plan y regresión con `tests/vista-corrida.test.ts` e `tests/interfaz-ejecutable.test.ts`.
  - Fuga del bucle de animación al salir de la vista o al cambiar de proyecto: `desmontar()` debe cancelar el `requestAnimationFrame`; pestaña oculta no anima.
  - Inyección: el aviso y los paneles deben pintar con `el()`/`textContent`, nunca con `innerHTML` (el prototipo usa `innerHTML`, `assets/vista-agentes.html:507-509`; no se copia así).
  - Un archivo no declarado en `loadStatics` da 404 en el navegador y el mapa también falla al arrancar si se declara uno que no existe (`server.ts:2343-2357` lee cada archivo): la lista y los archivos van juntos.
  - Compatibilidad: los paneles conservan los textos y datos de las tablas actuales que verifica `tests/vista-corrida.test.ts`; el endpoint y la cola por olas no cambian.
- Impactos de sync, migración, Docker o despliegue: ninguno — cambio solo del cliente web y del mapa de estáticos del servidor local; sin datos sincronizados, sin migraciones ni contenedores.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: capa de montaje del lienzo sobre el motor, registro de los tres mundos con un dibujo esquemático provisional, selector de mundo recordado en `localStorage`, aviso de pregunta pendiente (opción A, sin texto), paneles de agentes y de cola/entregados bajo el lienzo, y los archivos nuevos declarados en el mapa de estáticos.
- Exclusiones: el dibujo fiel de cada mundo contra el prototipo (S3: FEATURE-WEB-MUNDO-PASTELERIA/CONTROL/INVERNADERO sustituyen la función `dibujar` de su archivo); tokens del tema, celular/iPad y `prefers-reduced-motion` (IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO); cambios al motor (`motor.js`) o al endpoint `/api/corrida/agentes`; el texto de la pregunta y la respuesta (FEATURE-WEB-VISTA-TEXTO-PREGUNTA).
- Decisiones que resuelven las hipótesis del diagnóstico:
  - Sin `import` relativo en el módulo de `index.html`: la vista carga la escena con `import("/agentes/montaje.js")` dinámico y absoluto, memorizado en una promesa del módulo; si falla (el arnés de `scripts/verificar-interfaz.mjs`, que ejecuta el módulo desde `tmpdir`, o un navegador sin el archivo), la vista pinta paneles y KPI sin lienzo y sin lanzar. No se toca el arnés.
  - El aviso dice «una persona»: el registro no tiene responsable del ticket; no se usa el actor local (`valmen.actor`).
  - Los tres mundos se registran aquí con nombre, lema, expresión de pregunta y ocho estaciones del prototipo (`assets/vista-agentes.html:145-153`) y un `dibujar` esquemático (mostrador o sala de ocho puestos y figuras por estado visual); S3 reemplaza el dibujo dentro del mismo archivo, ya declarado en estáticos.
- Pasos ordenados:
  1. `packages/server/web/agentes/mundos/pasteleria.js`, `control.js`, `invernadero.js` y `packages/server/web/agentes/mundos/index.js` (export `MUNDOS`, `MUNDO_POR_DEFECTO = "pasteleria"`): cada mundo cumple la interfaz `Mundo` de `motor.d.ts` (`id`, `nombre`, `lema`, `pregunta`, `estaciones` de ocho textos, `puestoPrincipal`, `posicion(indice, carril)`, `dibujar(estado, t)` que recibe `{ ctx, escena, miniatura }`). (C16, C17)
  2. `packages/server/web/agentes/montaje.js` (nuevo) con funciones puras y la capa de montaje, sin `document` en el nivel del módulo:
     - `leerMundoElegido(almacen, ids)` / `guardarMundoElegido(almacen, id)` con clave `valmen.agentes.mundo`, en `try/catch`, pastelería por defecto o si la clave no es un id registrado. (C4, C5, C6)
     - `avisosDePregunta(filas, ahoraMs, mundo)`: un aviso por fila con `pregunta`; abierta → `{ tipo: "pendiente", quien: "una persona", ticket, hace: "hace 40 s", expresion: mundo.pregunta }`; `respondidaEn` dentro de 60 s → `{ tipo: "respondio" }`; respondida hace más de 60 s → sin aviso. Reutiliza el formato de `haceCuanto` de `index.html` copiado como función pura. (C7, C8, C9, C10, C11, C12)
     - `filasDePanelAgentes(agentes)`: la sesión principal primero, luego los vivos (`trabajando`/`esperando`), con nombre, ticket, fase (`faseConfirmada` o `faseInferida` rotulada) y última herramienta. (C13, C14)
     - `crearMontaje({ mundos, almacen, pedirCuadro, cancelarCuadro, visible })` que devuelve `montar(canvas, filas, ahoraMs)`, `desmontar()`, `elegirMundo(id)`, `mundoActual()` y `escena()`. `montar` crea la escena del motor la primera vez y después solo llama a `actualizar` sobre la misma escena; el bucle `pedirCuadro` llama a `avanzar` y al `dibujar` del mundo y no se duplica en montajes sucesivos; `visible()` falso salta el avance; `desmontar` cancela el cuadro pendiente; `elegirMundo` crea una escena nueva con las filas vigentes y guarda la elección solo en el almacén. Todo inyectado, para probarlo sin `document`. (C1, C2, C3, C15, C18, C19)
  3. `packages/server/web/index.html`, en la vista «Agentes» (`vistaCorrida`, `:6267`): promesa `cargarEscena()` con el `import()` absoluto; un `<canvas width="960" height="480">` que vive en una variable del módulo y se vuelve a anexar en cada repintado (no se recrea); selector de mundos con una miniatura por mundo dibujada por su `dibujar` con `miniatura: true`; el bloque de avisos sobre el lienzo pintado con `el()`/`textContent` desde `avisosDePregunta`; bajo el lienzo, el panel «Agentes» desde `filasDePanelAgentes` y el panel «Cola y entregados» con las olas (`olasDeCola`) y los entregados con `etiquetaDeEstadoRegistro`; KPI y barra de simultáneos se conservan. Si `cargarEscena()` falla, se omiten lienzo, selector y avisos y se pintan paneles. (C20, C21, C22, C23, C25)
  4. `packages/server/web/index.html`, `navegar` (`:8766`): al salir de las rutas de agentes (`esRutaDeAgentes`) o cambiar de proyecto, `montaje.desmontar()`. (C19, C26)
  5. `packages/server/src/server.ts`: exportar `ARCHIVOS_WEB` = `["index.html", "agentes/motor.js", "agentes/montaje.js", "agentes/mundos/index.js", "agentes/mundos/pasteleria.js", "agentes/mundos/control.js", "agentes/mundos/invernadero.js"]` desde `@valmen/server`, y usarlo en `packages/cli/src/main.ts:1674` en lugar de `["index.html"]`. (C27, C28, C29, C30)
  6. Pruebas: `tests/vista-lienzo.test.ts` (nuevo) para `montaje.js` y `mundos/` sin `document`, con reloj y cuadro inyectados; `tests/estaticos-web.test.ts` (nuevo) para el mapa de estáticos y la ausencia de `import` relativo en el módulo de `index.html`; ajustar `tests/vista-corrida.test.ts` solo donde cambien los rótulos de los paneles, sin quitar comprobaciones de datos. (todos)
  7. Verificación en el navegador con `valmen serve` sobre un proyecto con jornada y agentes: lienzo, selector, miniaturas, aviso y diez refrescos sin reinicio; evidencia en `## Evidencia`. (C23, C24, C25, C26)
- Compuerta que aplica: `plan` antes de aprobar; en implementación, `qa-mechanical` con los comandos de los criterios; en verificación, las pruebas del responsable.
- Compatibilidad: el endpoint, el refresco de 5 s, los KPI y la memoria de «simultáneos» no cambian; un navegador sin el módulo o sin `canvas` ve la vista de texto actual.
- Impactos declarados: ninguno — sin sincronización, sin migración y sin contenedores; el cambio es del cliente web y de la lista de estáticos del servidor local.
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`); devuelve `loadStatics` a `["index.html"]` y la vista a sus tablas. No hay datos persistidos salvo la clave `valmen.agentes.mundo` en el `localStorage` de cada navegador, que queda inerte.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-ESC-006): diez llamadas a `montar` con las mismas filas reutilizan el mismo objeto de escena
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C2 (R-ESC-006): tras diez llamadas a `montar` con las mismas filas, un agente en camino conserva su posición y no vuelve al puesto principal
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C3 (R-ESC-006): montar varias veces deja un único cuadro de animación pendiente
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C4 (R-ESC-005): sin elección guardada, el mundo actual es la pastelería
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C5 (R-ESC-005): un mundo elegido con `elegirMundo` se recupera al crear otro montaje sobre el mismo almacén
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C6 (R-ESC-005): un almacén que lanza al leer deja la pastelería como mundo actual
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C7 (R-ESC-007): una pregunta abierta produce un aviso cuyo encabezado es «Pregunta pendiente para una persona»
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C8 (R-ESC-007): el aviso de una pregunta abierta nombra el ticket de la fila
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C9 (R-ESC-007): el aviso de una pregunta abierta hace 40 s dice «hace 40 s»
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C10 (R-ESC-007): el aviso de una pregunta abierta lleva la expresión `pregunta` del mundo actual
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C11 (R-ESC-007): una pregunta respondida hace 10 s produce el aviso «una persona respondió»
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C12 (R-ESC-007): una pregunta respondida hace más de 60 s no produce aviso
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C13 (R-ESC-008): `filasDePanelAgentes` pone la fila de la sesión principal en primer lugar
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C14 (R-ESC-008): cada fila de `filasDePanelAgentes` trae nombre, ticket, fase y última herramienta del agente
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C15 (R-ESC-006): con `visible()` falso, un cuadro no avanza el tiempo de la escena
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C16 (R-MUN-001): `MUNDOS` registra exactamente los ids `pasteleria`, `control` e `invernadero`
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C17 (R-MUN-001): `validarMundo` devuelve una lista vacía para cada mundo de `MUNDOS`
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C18 (R-ESC-005): tras `elegirMundo`, la escena nueva contiene los agentes de las filas vigentes
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C19 (R-ESC-006): `desmontar` cancela el cuadro pendiente
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] C20 (R-ESC-008): sin el módulo de escena, la vista Agentes pinta la cola agrupada por olas
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C21 (R-ESC-008): sin el módulo de escena, la vista Agentes pinta cada entregado con su estado del registro
      <!-- test: npx vitest run tests/vista-corrida.test.ts -->
- [x] C22: el módulo de `index.html` se ejecuta en el arnés de la interfaz sin rechazos no capturados
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [x] C23 (R-ESC-005): en el navegador el selector ofrece los tres mundos con una miniatura cada uno
      <!-- verify: manual -->
- [x] C24 (R-ESC-005): en el navegador el mundo elegido sigue elegido después de recargar la página
      <!-- verify: manual -->
- [x] C25 (R-ESC-007): en el navegador una pregunta abierta muestra su aviso sobre el lienzo
      <!-- verify: manual -->
- [x] C26 (R-ESC-006): en el navegador los agentes no vuelven al puesto principal tras diez refrescos de 5 s
      <!-- verify: manual -->
- [x] C27: `ARCHIVOS_WEB` lista `index.html`, `agentes/motor.js`, `agentes/montaje.js` y los cuatro archivos de `agentes/mundos/`
      <!-- test: npx vitest run tests/estaticos-web.test.ts -->
- [x] C28: `loadStatics` sobre `packages/server/web` con `ARCHIVOS_WEB` carga cada archivo sin lanzar
      <!-- test: npx vitest run tests/estaticos-web.test.ts -->
- [x] C29: el módulo inline de `index.html` no contiene un `import` estático relativo
      <!-- test: npx vitest run tests/estaticos-web.test.ts -->
- [x] C30: el build de TypeScript del repositorio termina sin errores con `main.ts` usando `ARCHIVOS_WEB`
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] R-ESC-005: La vista DEBE recordar el mundo elegido solo en el navegador (C4, C5, C6, C18, C23, C24)
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] R-ESC-006: La escena no se reinicia en cada refresco de datos (C1, C2, C3, C15, C19, C26)
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] R-ESC-007: El aviso de pregunta pendiente dice a quién le toca (C7, C25)
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] R-ESC-007: El aviso de pregunta pendiente dice desde cuándo (C9)
      <!-- test: npx vitest run tests/vista-lienzo.test.ts -->
- [x] R-ESC-008: Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual (C13, C14, C20, C21)
      <!-- test: npx vitest run tests/vista-lienzo.test.ts tests/vista-corrida.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de la entrega de FEATURE-WEB-VISTA-LIENZO-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y el PO valida la pantalla.",
    "evidence": [
      "EVIDENCE-002"
    ],
    "affected_files": [
      "packages/cli/src/main.ts",
      "packages/server/src/server.ts",
      "packages/server/web/agentes/montaje.js",
      "packages/server/web/agentes/mundos/control.js",
      "packages/server/web/agentes/mundos/index.js",
      "packages/server/web/agentes/mundos/invernadero.js",
      "packages/server/web/agentes/mundos/pasteleria.js",
      "packages/server/web/index.html",
      "tests/estaticos-web.test.ts",
      "tests/vista-corrida.test.ts",
      "tests/vista-lienzo.test.ts"
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

Hecho según el plan aprobado, sin salirse del alcance:
- `packages/server/web/agentes/mundos/{pasteleria,control,invernadero,index}.js`: los tres mundos con la interfaz `Mundo` del motor, ocho estaciones del prototipo y un dibujo esquemático provisional (S3 lo sustituye dentro de su archivo); `MUNDOS` y `MUNDO_POR_DEFECTO = "pasteleria"`.
- `packages/server/web/agentes/montaje.js` (nuevo): `leerMundoElegido`/`guardarMundoElegido` (clave `valmen.agentes.mundo`, en `try/catch`), `avisosDePregunta`, `filasDePanelAgentes`, `crearMontaje` con todo inyectado (cuadro, reloj, almacén, visibilidad); `montar` reutiliza la escena y un único cuadro pendiente.
- `packages/server/web/index.html`: `cargarEscena()` con `import("/agentes/montaje.js")` dinámico y memorizado; lienzo único reutilizado en cada repintado, selector con miniatura por mundo, avisos con `textContent`, panel de agentes desde `filasDePanelAgentes`, cola y entregados sin cambios; `desmontar()` al salir de las rutas de agentes, en el estado vacío y al cambiar de proyecto. Sin `requestAnimationFrame` (el arnés de la interfaz) ni siquiera se pide el archivo: la vista queda en paneles, sin tocar `scripts/verificar-interfaz.mjs`.
- `packages/server/src/server.ts` exporta `ARCHIVOS_WEB`; `packages/cli/src/main.ts` lo usa en `loadStatics`.
- Pruebas: `tests/vista-lienzo.test.ts` y `tests/estaticos-web.test.ts` (nuevos); `tests/vista-corrida.test.ts` solo etiqueta C20/C21 en dos pruebas existentes.

Desviación menor del plan: `crearMontaje` recibe además `ahora` (reloj) y expone `mundos()` y `reiniciar()` (para que otro proyecto no herede las posiciones).

## Pruebas

- Directorio: raíz del worktree (o del repositorio tras integrar).
- Comando 1: `npx vitest run tests/vista-lienzo.test.ts tests/estaticos-web.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts tests/motor-escena.test.ts`. Esperado: todo en verde. Obtenido: 5 archivos, 69 pruebas pasadas (requiere `npm run build` antes: `interfaz-ejecutable` compara `dist/web` con la fuente).
- Comando 2: `npx tsc --build tsconfig.build.json`. Esperado: sin errores. Obtenido: sin errores (también dentro de `npm run build`).
- Validaciones manuales (C23-C26, sin marcar: las confirma el responsable): `npm run build`, `valmen serve` sobre un proyecto con jornada, abrir `#/agentes`; ver que el selector ofrece Pastelería, Centro de control e Invernadero con su miniatura (C23); elegir uno, recargar y comprobar que sigue elegido (C24); con un agente que tenga una pregunta abierta, ver el aviso «Pregunta pendiente para una persona» sobre el lienzo (C25); dejar pasar diez refrescos de 5 s y ver que los agentes no vuelven al puesto principal (C26).
- Comprobación hecha por el agente en el navegador (no sustituye lo anterior): servidor del worktree, filas simuladas con fetch sobre `#/agentes`: aparecieron lienzo, tres miniaturas, aviso con ticket, «hace 40 s» y la expresión del mundo; el mismo `<canvas>` sobrevivió a los refrescos; el mundo elegido quedó en `localStorage` y volvió tras recargar; sin errores de consola. Con datos reales no había agentes vivos.
- Ambiente: Node 24; navegador con Canvas 2D.
- Resultado del PO: «los lienzos estan bien» · «A cierralos» (2026-10-09; validó la pantalla con una corrida real).

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
    "po_confirmation": "«los lienzos estan bien» · «A cierralos»"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "test",
    "description": "vitest de 5 archivos del ticket: 69 pruebas en verde; tsc --build tsconfig.build.json sin errores; comprobación en navegador con filas simuladas (lienzo, tres miniaturas, aviso, mundo recordado tras recargar, mismo canvas entre refrescos)",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-09",
    "kind": "manual-test",
    "description": "Suite completa en verde y validación del PO con una corrida real en Mission Control",
    "reference": "worktree:sha256:b57b36973e1b5b3156fdd4604407baa44fa65d99783f98b49d318e961b84c6ad",
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
    "po_confirmation": "«los lienzos estan bien» · «A cierralos»"
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
    "technical_summary": "Lienzo montado desde el motor (montaje.js) con selector de mundo recordado, avisos de pregunta y estáticos declarados en ARCHIVOS_WEB; la vista carga la escena con import dinámico.",
    "functional_summary": "La vista Agentes dibuja una escena animada con selector de mundo y aviso de pregunta pendiente.",
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
    "source": "manual:subagente de implementación (sonnet) de la corrida orquestada; la sesión no expone números",
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
    "at": "2026-10-08T23:30:59.065Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T00:23:18.541Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T00:24:28.694Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261009-FEATURE-WEB-VISTA-LIENZO-20261008-analysis-1, canal cli, decidida 2026-10-09T00:24:28.691Z): PO: \"Recomiendo A, aprueba el análisis\""
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T00:26:15.226Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T00:34:53.415Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-FEATURE-WEB-VISTA-LIENZO-20261008-plan-2, canal cli, decidida 2026-10-09T00:34:53.405Z): PO: \"Recomiendo A, aprueba el plan\" (respuesta a la REVIEW del plan)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T00:34:53.744Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A, aprueba el plan\",\"planHash\":\"sha256:74257f656ab285906314ea6f6d60239a15a2b9697156257367403248dd830af1\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T00:34:54.095Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:74257f656ab285906314ea6f6d60239a15a2b9697156257367403248dd830af1."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T00:34:54.095Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T00:35:06.750Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T00:40:14.049Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T00:40:17.199Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-09T00:47:42.975Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:15.664Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:15.951Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:16.240Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:16.528Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:16.822Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:17.267Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:17.786Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:18.109Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:18.411Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:18.719Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:19.017Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:19.303Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:21.104Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:21.273Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001. Criterios marcados desde el recibo GR-20261009-FEATURE-WEB-VISTA-LIENZO-20261008-qa-mechanical-2 de qa-mechanical: C31, C32, C33, C34."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-10-09",
    "at": "2026-10-09T14:06:21.600Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
