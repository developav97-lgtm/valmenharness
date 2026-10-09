---
schema_version: 2
id: FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008
title: Lector expone texto de pregunta y respuesta con lista blanca ampliada, bajo decisión escrita del PO
type: FEATURE
module: SERVER
workflow_status: in_progress
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

# FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008

## Solicitud original

Parte del sprint: Opción B: texto de la pregunta y la respuesta, solo con la decisión escrita del PO en el ticket.
- R-DAT-004: El endpoint PUEDE exponer el texto de la pregunta y la respuesta solo con decisión escrita del PO
Depende de: FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008, FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008, FEATURE-WEB-MUNDO-INVERNADERO-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El endpoint PUEDE exponer el texto de la pregunta y la respuesta solo con decisión escrita del PO
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-DAT-004: lo cubre FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008 (Vista muestra el texto de la pregunta y la respuesta)

### Referencias de diseño

Adjuntos de la feature (ningún requisito de este ticket cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- **Decisión escrita del PO (R-DAT-004), 2026-10-09, cita literal:** «Habilita la opción B yo lo cocaria a los dos deberia ser multiproyecto , siempre activa en 127.0.0.1»
  - Interpretación (no es parte de la cita): se habilita la opción B; aplica a todos los proyectos que sirve Mission Control (ValmenHarness y SaiOpenCloud: el endpoint ya resuelve el proyecto por `X-Valmen-Project`, `packages/server/src/server.ts:2271`); siempre activa, sin bandera ni configuración por proyecto; y solo cuando el servidor escucha en la máquina local (127.0.0.1, el valor por defecto de `valmen serve`, `packages/cli/src/main.ts:1697`).
- **Estado de los tres supuestos que siguen (2026-10-09):** decididos por Claude y sujetos a revisión del PO. La compuerta de análisis (recibo GR-20261009-FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008-analysis-1, REVIEW) se resolvió por delegación del PO; esa resolución no convierte estos supuestos en decisión del PO. Si el PO cambia alguno, el plan se ajusta y se vuelve a aprobar.
- **Supuesto (decidido por Claude, sujeto a revisión del PO): servidor abierto con `--host`.** Si `valmen serve` escucha fuera de loopback (`--host 0.0.0.0` u otra dirección no local), el endpoint **no** expone `texto` ni `respuesta`: la fila cumple R-DAT-002 tal cual. La señal es la que ya existe: `context.writeToken` solo se fija cuando el anfitrión no es local (`packages/cli/src/main.ts:1702-1711`, `esAnfitrionLocal` en `packages/server/src/server.ts:211`). Pregunta al PO: ¿basta con apagarlo cuando el servidor está abierto a la red, o se quiere además filtrar por la dirección remota de cada petición?
- **Supuesto (decidido por Claude, sujeto a revisión del PO): recorte de longitud.** El PO no fijó un tope. Por defecto, `texto` y `respuesta` se recortan a **500 caracteres** cada uno, con `…` al final cuando se recorta. Pregunta al PO: ¿500 caracteres le sirve, o prefiere otro tope?
- **Supuesto (decidido por Claude, sujeto a revisión del PO): qué es «texto» y qué es «respuesta».** `texto` son los `input.questions[].question` de la `AskUserQuestion` elegida, unidos por salto de línea; `respuesta` son los valores de `toolUseResult.answers` del evento del resultado, en el mismo orden, unidos por salto de línea. No se lee `content` del `tool_result` (repite la pregunta en prosa) ni `header`, `options`, `label` o `description`. Un resultado con `is_error: true` o sin `answers` deja `respuesta: null`.

## Descripción funcional

- Alcance: el lector `packages/server/src/agentes.ts` y el endpoint `GET /api/corrida/agentes` amplían la lista blanca de la fila con `pregunta.texto` y `pregunta.respuesta` (R-DAT-004, opción B), y con nada más del transcript. La vista que los muestra queda fuera: la cubre FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008.
- Usuario o rol afectado: el PO que mira la vista Corrida → Agentes en Mission Control, en cualquiera de los proyectos que sirve.
- Comportamiento actual: `pregunta` lleva solo `desde` y `respondidaEn` (`packages/server/src/agentes.ts:56-59`); el lector guarda solo el id y la hora de cada `AskUserQuestion` y nunca su entrada ni su resultado (`agentes.ts:150-152`, `agentes.ts:182-183`, `agentes.ts:215`).
- Comportamiento esperado: con el servidor escuchando en loopback, una pregunta abierta lleva `pregunta.texto` (recortado a 500) y `respuesta: null`; contestada hace menos de `VENTANA_RESPUESTA_MS`, lleva también `pregunta.respuesta`; con el servidor abierto a la red, `pregunta` vuelve a ser `{desde, respondidaEn}`. Ningún otro texto del transcript (prompts, entradas o resultados de otras herramientas, `header`, `options`) aparece en la respuesta.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto; es una ampliación deliberada de la lista blanca que la spec condicionó a la decisión escrita del PO (`.valmen/features/vista-agentes/spec/s1-datos-agentes/spec.md:59-77`), que ya está arriba. Hoy el lector descarta a propósito el contenido: `leerTranscript` registra `preguntas.set(id, marca)` sin la entrada (`packages/server/src/agentes.ts:215`), y en el resultado mira solo `tool_use_id` y la hora (`agentes.ts:180-183`); `preguntaDe` construye `{desde, respondidaEn}` (`agentes.ts:380-386`), y las dos filas la usan (`agentes.ts:419`, `agentes.ts:455`). El endpoint llama a `leerAgentesDeCorrida(context.root, …)` sin saber si el servidor está abierto a la red (`packages/server/src/server.ts:1021-1043`).
- Forma real de los datos, comprobada en un transcript de `~/.claude/projects` (solo estructura, sin copiar texto): el `tool_use` de `AskUserQuestion` trae `input.questions[]` con `question`, `header`, `multiSelect` y `options[]{label, description}`; el evento `user` del resultado trae `message.content[].tool_result.content` como cadena y, a nivel de evento, `toolUseResult` con `questions` y `answers` (objeto pregunta → respuesta).
- Hipótesis pendientes:
  - La caché por firma de archivo (`agentes.ts:247-271`) guardará el texto en memoria del proceso; no sale del servidor, pero el plan debe confirmar que el recorte se aplica al leer y no al serializar, para no retener textos largos.
  - Con varias preguntas en un mismo `AskUserQuestion`, el orden de `answers` sigue el de `questions`; se asume y se cubre con una prueba.
- Consumidores afectados:
  - `packages/server/web/agentes/montaje.js:51-65` y los tres mundos (`packages/server/web/agentes/mundos/pasteleria.js`, `control.js`, `invernadero.js`) leen `fila.pregunta.desde` y `respondidaEn`; dos claves nuevas no los rompen.
  - `tests/actividad-agentes.test.ts`: PP-C12 (`:478-481`) exige que las claves de `pregunta` sean exactamente `desde` y `respondidaEn`, y cambiará; PP-C10 y PP-C11 (`:466-476`) y SP-C8/C14 (`:269-286`, `:379-391`) siguen siendo la prueba de no filtrado y se amplían con un texto fuera de la lista blanca. Las fixtures de la pregunta (`:414-415`, `linea` en `:49-80`) hoy ponen `input: { command: SECRETO }` y `content: SECRETO`: habrá que darles la forma real.
  - `tests/mundo-*.test.ts` y `tests/vista-lienzo.test.ts` construyen `pregunta` a mano; no dependen del lector.
- Archivos y flujo investigados: `packages/server/src/agentes.ts` (completo), `packages/server/src/server.ts:156-240` (contexto, `writeToken`, `esAnfitrionLocal`), `:298-320` (proyecto autorizado), `:1016-1043` (endpoint), `:2271-2285` (selección de proyecto), `packages/cli/src/main.ts:1690-1740` (`serve --host`), `packages/server/src/claude.ts:152` (carpeta por proyecto), `tests/actividad-agentes.test.ts`, la spec s1-datos-agentes. Flujo: navegador → `GET /api/corrida/agentes` con `X-Valmen-Project` → `contextoDeProyecto` → `leerAgentesDeCorrida(root)` → `sesionOrquestadora` + `archivosDeSubagentes` → `leerConCache` → `leerTranscript` → `preguntaDe`.
- Riesgos y compatibilidad:
  - Riesgo de exposición: es el primer campo con texto del transcript. Se mitiga con la lista blanca estricta (solo `question` y `answers`), el recorte a 500 y el apagado cuando el servidor está abierto a la red; R-DAT-003 se mantiene con una prueba que siembra texto en prompts, en la entrada de otra herramienta, en `header`/`options` y en `content` del resultado, y comprueba que ninguno aparece.
  - Compatibilidad: las claves nuevas son aditivas; un cliente que no las lee no cambia. Con el servidor abierto la forma es la de hoy.
  - Multiproyecto: no hace falta configuración por proyecto; cada petición ya lee las carpetas de Claude Code del proyecto elegido (`claude.ts:152`), así que vale igual para ValmenHarness y SaiOpenCloud.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambio local del servidor de Mission Control, sin datos persistidos nuevos, sin migración, sin contenedores y sin despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-2cf4af creada por el PO.
- Alcance: campos aditivos `pregunta.texto` y `pregunta.respuesta` en cada fila de `GET /api/corrida/agentes`, calculados en `packages/server/src/agentes.ts` y activados por `packages/server/src/server.ts` solo cuando el servidor escucha en la máquina local; pruebas en `tests/actividad-agentes.test.ts`.
- Exclusiones: la vista que muestra el texto (`packages/server/web/agentes/**`) es de FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008; `packages/cli/src/main.ts` no cambia (la señal `writeToken` ya existe); no hay bandera ni configuración por proyecto; `dist/` no se edita a mano; nada más del transcript entra a la lista blanca.
- Decisiones del plan sobre las hipótesis del diagnóstico: (1) el recorte a 500 se aplica al leer, en `leerTranscript`, así la caché `leerConCache` nunca guarda más de 500 caracteres por campo; (2) con varias preguntas en una `AskUserQuestion`, `respuesta` sigue el orden de `input.questions` buscando cada `question` como clave de `toolUseResult.answers`, y omite las que no tengan respuesta; si no queda ninguna, `respuesta` es `null`; (3) el lector no expone texto por defecto: hace falta `conTexto: true` en `OpcionesDeLectura`, para que otro llamador futuro no lo exponga por descuido; (4) el endpoint pasa `conTexto: context.writeToken === undefined`.
- Pasos ordenados:
  1. `packages/server/src/agentes.ts`: constante exportada `LARGO_MAXIMO_TEXTO = 500` y función pura `recortar(texto)` que devuelve el texto tal cual hasta 500 caracteres, o sus primeros 499 más `…`. (C7, C8, C9)
  2. `packages/server/src/agentes.ts`, interfaz `Lectura`: agregar `preguntaTexto: string | null` y `preguntaRespuesta: string | null`. En `leerTranscript`, junto a `preguntas.set(id, marca)` (`:215`), guardar en un `Map` aparte solo `input.questions[].question` (cadenas) de esa `AskUserQuestion`; nada de `header`, `options` ni `multiSelect`. En el bloque `tool_result` (`:180-184`), si el id es de una pregunta y el bloque no trae `is_error: true`, leer `evento.toolUseResult.answers` y quedarse solo con los valores cadena de las claves que coinciden con las `question` guardadas; no leer `content`. Al elegir la pregunta (`:226-243`), fijar `preguntaTexto` y `preguntaRespuesta` recortados con `recortar`, unidos por `\n`. (C1–C5, C10, C11, C15–C20)
  3. `packages/server/src/agentes.ts`: ampliar `PreguntaPendiente` con `texto?: string | null` y `respuesta?: string | null`; ampliar `OpcionesDeLectura` con `conTexto?: boolean`; `preguntaDe(lectura, ahora, conTexto)` agrega `texto` y `respuesta` solo si `conTexto` es `true`; actualizar los comentarios de cabecera (`:1-23`, `:52-55`, `:61`) para decir que la lista blanca incluye la pregunta y la respuesta bajo R-DAT-004. (C12, C14, C21)
  4. `packages/server/src/agentes.ts`, `leerAgentesDeCorrida`: pasar `opciones.conTexto === true` a `preguntaDe` en la fila principal (`:419`) y en las de subagentes (`:455`). (C6, C14)
  5. `packages/server/src/server.ts`, endpoint `GET /api/corrida/agentes` (`:1033-1040`): pasar `conTexto: context.writeToken === undefined` a `leerAgentesDeCorrida`, y actualizar el comentario `:1016-1020`. (C1, C12, C13)
  6. `tests/actividad-agentes.test.ts`: dar a `linea()` (`:49-80`) una variante con la forma real de `AskUserQuestion` (`input.questions[]` con `question`, `header`, `options[]{label, description}`) y de su resultado (`content` cadena y `toolUseResult.answers`), con centinelas distintos para cada campo fuera de la lista blanca. Nuevo `describe("texto de pregunta y respuesta (R-DAT-004)")` con pruebas `TP-C01`…`TP-C19`, con `ctx()` local y otro `ctx()` con `writeToken`. Reescribir PP-C10 (la entrada de la pregunta: `header`, `label` y `description` no aparecen), PP-C11 (el `content` del resultado no aparece) y PP-C12 (en loopback las claves de `pregunta` son exactamente `desde`, `respondidaEn`, `texto` y `respuesta`). Las pruebas de no filtrado y de ventana se escriben así, todas contra `handleApi("GET", "/api/corrida/agentes", {}, ctx())` en loopback (sin `writeToken`) y con una `AskUserQuestion` respondida en la misma sesión para que la lista blanca ampliada esté activa: `TP-C15` siembra `TP-PROMPT` en el primer mensaje del usuario; `TP-C16` siembra `TP-BASH-IN` en `input.command` de un `tool_use` `Bash`; `TP-C17` siembra `TP-BASH-OUT` en el `content` del `tool_result` de ese `Bash`; cada una comprueba que `JSON.stringify(body)` no contiene su centinela. `TP-C18` usa la pregunta respondida en `T0 + 3 s` y el reloj inyectado en `T0 + 64 s`, y comprueba `pregunta === null`. Las pruebas de los mundos y de `vista-lienzo` no cambian. (C1–C21)
  7. Verificación: `npx vitest run tests/actividad-agentes.test.ts`, las pruebas de mundos y lienzo, `npx tsc --noEmit -p tsconfig.json` y `valmen secrets`. (C22–C24)
  8. Validación manual del responsable, con una sesión de Claude Code que tenga subagentes y una `AskUserQuestion` abierta y luego contestada:
     - ValmenHarness: `valmen serve` (sin `--host`, escucha en 127.0.0.1:4173) y `curl -s http://127.0.0.1:4173/api/corrida/agentes`; con la pregunta abierta se mira `pregunta.texto` y, ya contestada (menos de 60 s), `pregunta.respuesta`. (C25, C26)
     - SaiOpenCloud: el mismo `curl` con `-H 'X-Valmen-Project: <project-id de SaiOpenCloud en los bindings>'`, con la pregunta abierta y luego contestada en una sesión de ese proyecto. (C27, C28)
     - Servidor abierto: `valmen serve --host 0.0.0.0` y el mismo `curl` a `http://127.0.0.1:4173/api/corrida/agentes` con la pregunta abierta; `pregunta` no trae `texto`. (C29)
- Impactos declarados: ninguno de sincronización, migración ni contenedores; sin despliegue. Es un cambio del servidor local de Mission Control que solo agrega campos de lectura.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`). No hay datos persistidos, migraciones ni configuración que deshacer; la vista vuelve a recibir `{desde, respondidaEn}`, que ya maneja.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-DAT-004): con el servidor en loopback y una `AskUserQuestion` sin resultado, `pregunta.texto` del endpoint es igual a su `input.questions[0].question`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C01 -->
- [x] C2 (R-DAT-004): con el servidor en loopback y una `AskUserQuestion` sin resultado, `pregunta.respuesta` es `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C02 -->
- [x] C3 (R-DAT-004): con la pregunta respondida hace 20 s, `pregunta.respuesta` es igual al valor de `toolUseResult.answers` para esa pregunta
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C03 -->
- [x] C4 (R-DAT-004): con dos `questions` en la misma `AskUserQuestion`, `pregunta.texto` es la primera, un `\n` y la segunda
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C04 -->
- [x] C5 (R-DAT-004): con dos respuestas en `toolUseResult.answers`, `pregunta.respuesta` las une con `\n` en el orden de `input.questions`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C05 -->
- [x] C6 (R-DAT-004): la fila de la sesión principal con una `AskUserQuestion` abierta lleva `pregunta.texto`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C06 -->
- [x] C7 (R-DAT-004): una `question` de 600 caracteres produce un `pregunta.texto` de 500 caracteres
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C07 -->
- [x] C8 (R-DAT-004): un `pregunta.texto` recortado termina en `…`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C08 -->
- [x] C9 (R-DAT-004): una respuesta de 600 caracteres produce un `pregunta.respuesta` de 500 caracteres
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C09 -->
- [x] C10 (R-DAT-004): un `tool_result` con `is_error: true` deja `pregunta.respuesta` en `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C10 -->
- [x] C11 (R-DAT-004): un resultado sin `toolUseResult.answers` deja `pregunta.respuesta` en `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C11 -->
- [x] C12 (R-DAT-004): con `writeToken` en el contexto (servidor abierto con `--host`), las claves de `pregunta` son exactamente `desde` y `respondidaEn`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C12 -->
- [x] C13 (R-DAT-004): con `writeToken` en el contexto, la respuesta serializada del endpoint no contiene el texto de la `question`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C13 -->
- [x] C14 (R-DAT-004): `leerAgentesDeCorrida` sin la opción `conTexto` devuelve `pregunta` con claves exactamente `desde` y `respondidaEn`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C14 -->
- [x] C15 (R-DAT-003): la respuesta del endpoint no contiene el `header`, el `label` ni la `description` de la entrada de la pregunta (PP-C10 reescrita)
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C10 -->
- [x] C16 (R-DAT-003): la respuesta del endpoint no contiene el `content` del `tool_result` de la pregunta (PP-C11 reescrita)
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C11 -->
- [x] C17 (R-DAT-003): con `TP-PROMPT` en el primer mensaje del usuario, la respuesta serializada del endpoint no contiene `TP-PROMPT`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C15 -->
- [x] C18 (R-DAT-003): con `TP-BASH-IN` en `input.command` de un `Bash`, la respuesta serializada del endpoint no contiene `TP-BASH-IN`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C16 -->
- [x] C19 (R-DAT-003): con `TP-BASH-OUT` en el `content` del resultado de un `Bash`, la respuesta serializada del endpoint no contiene `TP-BASH-OUT`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C17 -->
- [x] C20 (R-DAT-002): con la pregunta respondida en `T0 + 3 s` y el reloj en `T0 + 64 s`, `pregunta` es `null`
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t TP-C18 -->
- [x] C21 (R-DAT-004): en loopback, las claves de `pregunta` son exactamente `desde`, `respondidaEn`, `texto` y `respuesta` (PP-C12 reescrita)
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -t PP-C12 -->
- [x] C22: el archivo `tests/actividad-agentes.test.ts` pasa completo
      <!-- test: npx vitest run tests/actividad-agentes.test.ts -->
- [x] C23: las pruebas de los tres mundos y del lienzo pasan sin cambios
      <!-- test: npx vitest run tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/mundo-invernadero.test.ts tests/vista-lienzo.test.ts -->
- [ ] C24: el proyecto compila sin errores de tipos
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [ ] C25 (R-DAT-004): en ValmenHarness, `curl -s http://127.0.0.1:4173/api/corrida/agentes` con una `AskUserQuestion` abierta devuelve `pregunta.texto` igual a la pregunta mostrada en Claude Code
      <!-- verify: manual -->
- [ ] C26 (R-DAT-004): en ValmenHarness, el mismo `curl` dentro de los 60 s posteriores a contestar devuelve `pregunta.respuesta` igual a la opción elegida
      <!-- verify: manual -->
- [ ] C27 (R-DAT-004): en SaiOpenCloud, el `curl` con `X-Valmen-Project` de SaiOpenCloud y una `AskUserQuestion` abierta devuelve `pregunta.texto` igual a la pregunta mostrada
      <!-- verify: manual -->
- [ ] C28 (R-DAT-004): en SaiOpenCloud, el mismo `curl` dentro de los 60 s posteriores a contestar devuelve `pregunta.respuesta` igual a la opción elegida
      <!-- verify: manual -->
- [ ] C29 (R-DAT-004): con `valmen serve --host 0.0.0.0` y una `AskUserQuestion` abierta, `pregunta` del `curl` no trae la clave `texto`
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/src/agentes.ts`: `LARGO_MAXIMO_TEXTO = 500` y `recortar` (499 + `…`); `Lectura` gana `preguntaTexto` y `preguntaRespuesta`, calculados y recortados en `leerTranscript` (antes de la caché) a partir solo de `input.questions[].question` y de `toolUseResult.answers` (claves iguales a las `question`, sin `is_error`, sin `content`); `OpcionesDeLectura.conTexto` (por defecto no) y `preguntaDe(lectura, ahora, conTexto)`; comentarios de cabecera actualizados a R-DAT-004.
- `packages/server/src/server.ts`: el endpoint pasa `conTexto: context.writeToken === undefined` (`writeToken` solo existe con `--host` fuera de loopback) y su comentario lo dice.
- `tests/actividad-agentes.test.ts`: `linea()` con la forma real de `AskUserQuestion` y su resultado; PP-C10, PP-C11 y PP-C12 reescritas; nuevo `describe` TP-C01…TP-C18 (reloj fijado con `vi.useFakeTimers({ toFake: ["Date"] })` porque el endpoint usa el reloj real).
- Sin cambios en `packages/cli/src/main.ts`, `packages/server/web/**` ni `dist/`. Rollback: `git revert` del commit del ticket.

## Pruebas

Directorio de ejecución: raíz del repositorio (o del worktree). Requisitos: Node 24, `npm install` hecho.

- `npx vitest run tests/actividad-agentes.test.ts` → 60 pruebas pasan (incluye TP-C01…TP-C18, PP-C10/11/12 reescritas). Cubre C1–C22.
- `npx vitest run tests/mundo-pasteleria.test.ts tests/mundo-control.test.ts tests/mundo-invernadero.test.ts tests/vista-lienzo.test.ts` → 4 archivos, 111 pruebas pasan, sin cambios en ellas (C23).
- `npx tsc --noEmit -p tsconfig.json` → **no queda en cero**: 10 errores TS7016 (módulos `.js` de `packages/server/web/agentes/**` sin declaración, importados por `tests/mundo-*.test.ts`, `tests/vista-*.test.ts`). Son idénticos con y sin este cambio (se comprobó con `git stash`) y también en el checkout principal; ninguno está en `agentes.ts`, `server.ts` ni `actividad-agentes.test.ts`. Por eso **C24 queda sin marcar**: decide una persona si basta con «sin errores nuevos».
- Medición manual hecha por el agente (no sustituye C25–C29, que piden una sesión real): con `HOME` temporal, un proyecto temporal y transcripts sintéticos (una `AskUserQuestion` abierta y otra contestada, con centinelas en prompt, `header`, `label`, `description` y `content`), el servidor del worktree (`packages/cli/dist/main.js serve`) respondió por `curl http://127.0.0.1:<puerto>/api/corrida/agentes`:
  - sin `--host`: la pregunta abierta trae `texto` y `respuesta: null`; la contestada trae `texto` y `respuesta`; ningún centinela aparece en la respuesta.
  - con `--host 0.0.0.0`: `pregunta` trae solo `desde` y `respondidaEn`.
- Pendiente del responsable (C25–C29, `verify: manual`): repetir con sesiones reales en ValmenHarness y en SaiOpenCloud (`X-Valmen-Project`; la cabecera no se midió) y con `valmen serve --host 0.0.0.0`.

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
    "notes": "Sesión de subagente de implementación (claude-sonnet-5-5); el subagente no expone los números de tokens ni de costo de su sesión; sin cifras para no inventarlas.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion-sonnet-5-5",
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
    "at": "2026-10-08T23:30:59.790Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T02:46:41.356Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T02:47:45.165Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por claude (recibo GR-20261009-FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008-analysis-1, canal cli, decidida 2026-10-09T02:47:45.159Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: dos puntos en banda (causa_especifica 0.89, nombra_archivos_reales 0.75, patrón ya visto: el precheck no comprueba citas desde el worktree), el resto aprobado; el diagnóstico cita lector, endpoint y --host con ruta:línea. La decisión de privacidad (R-DAT-004) es la frase literal del PO, no de Claude."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T02:49:53.203Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T02:57:04.565Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008-plan-2, canal cli, decidida 2026-10-09T02:57:04.560Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar tras dos vueltas: C17, C19 y C20 salieron de la banda, los nueve restantes están entre 0.84 y 0.89 (forma de redacción), y el plan cubre no filtrado, --host y recorte con pruebas concretas."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T02:57:05.036Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-2cf4af\",\"source\":\"autorizacion\",\"quote\":\"aprobación de planes y análisis de la feature vista-agentes\",\"planHash\":\"sha256:9f9060953d92d2f8963028b3b90eccf9f504834212cd4ae944d06bb655fcdf90\",\"authorizationId\":\"APA-20261009-2cf4af\",\"authorizationHash\":\"sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008-plan-2\",\"receiptStateHash\":\"sha256:86e4a042a5f4805d6926bfed984669b924c24f37d348132a93e7e927de419460\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T02:57:05.394Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-2cf4af (fuente autorizacion, hash sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3), plan sha256:9f9060953d92d2f8963028b3b90eccf9f504834212cd4ae944d06bb655fcdf90."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T02:57:05.394Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T02:57:22.958Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T02:59:51.678Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  }
]
```
