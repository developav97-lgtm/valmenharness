---
schema_version: 2
id: IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008
title: Marco con tokens del tema, celular, iPad y reduced-motion
type: IMPROVEMENT
module: WEB
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

# IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008

## Solicitud original

Parte del sprint: Vista Agentes renombrada, motor de escena con tests deterministas, lienzo montado con selector, aviso y paneles, marco responsivo.
- R-ESC-010: La vista DEBE funcionar en celular e iPad y respetar `prefers-reduced-motion`
- R-ESC-011: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada
Depende de: FEATURE-WEB-VISTA-LIENZO-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La vista DEBE funcionar en celular e iPad y respetar `prefers-reduced-motion` El marco DEBE usar los tokens del tema y cada mundo su paleta marcada
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-INVERNADERO-20261008 (Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo)

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

- Alcance: el **marco** de la vista «Agentes» (lienzo como elemento de página, selector de mundo, avisos de pregunta, paneles «Agentes vivos», «Cola» y «Entregados») y el **ritmo del bucle** de animación en `montaje.js`. Tres cosas: (1) el marco usa solo variables del tema de `index.html` y se ve bien en claro y oscuro; (2) en celular (390 px) e iPad (768 y 1024 px) el lienzo escala al ancho sin desplazamiento horizontal y los paneles van en una columna por debajo de 700 px y lado a lado por encima; (3) con `prefers-reduced-motion: reduce` la escena se redibuja a cuatro cuadros por segundo.
- Fuera de alcance (asignado por el grafo de la feature, AP-003 `.valmen/memory/aprendizajes.md:21`): la paleta y la tipografía propias de cada mundo en lienzo y paneles (pizarra, telemetría, cuaderno) y su marca `valmen:allow-color`, que son de FEATURE-WEB-MUNDO-PASTELERIA/CONTROL/INVERNADERO; los mundos provisionales (`packages/server/web/agentes/mundos/*.js`) no se tocan aquí. Tampoco cambia el motor (`motor.js`) ni el endpoint `/api/corrida/agentes`.
- Usuario o rol afectado: el PO y quien siga una corrida desde la vista «Agentes» en `valmen serve`, sobre todo desde el celular o el iPad, y quien tenga activada la reducción de movimiento del sistema.
- Comportamiento actual: el bucle pide un cuadro por cada `requestAnimationFrame` (~60 por segundo) sin mirar `prefers-reduced-motion`; el lienzo se escala con suavizado (sin `image-rendering: pixelated`); los dos tipos de aviso (pregunta pendiente y «una persona respondió») se pintan iguales; los paneles son una secuencia de `h3` y tablas, siempre en una sola columna, también en escritorio e iPad horizontal.
- Comportamiento esperado: el de R-ESC-010 y la parte de marco de R-ESC-011 (`.valmen/features/vista-agentes/spec/s2-motor-escena/spec.md:138-159`), construido contra el prototipo aprobado (`.valmen/features/vista-agentes/assets/vista-agentes.html`): lienzo pixelado a ancho completo (`:58`), avisos con `--alerta-suave`/`--alerta` y `--ok-suave`/`--ok` (`:51-53`), paneles en rejilla que se apila (`:60`) y bucle a 250 ms con movimiento reducido (`:548-554`).

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - Movimiento reducido: `crearMontaje` (`packages/server/web/agentes/montaje.js:112-119`) no recibe ninguna señal de preferencia de movimiento, y `cuadroDeAnimacion` (`montaje.js:134-146`) avanza y dibuja en cada cuadro que pide; la vista lo crea en `packages/server/web/index.html:6328-6333` pasando solo almacén, cuadro, cancelación y visibilidad. No hay `matchMedia` ni `prefers-reduced-motion` en `index.html` ni en `packages/server/web/agentes/` (búsqueda sin resultados).
  - Escalado: `.corrida-lienzo` (`index.html:2179-2187`) ya tiene `width: 100%`, `max-width: 960px` y `height: auto`, así que el lienzo sí escala al ancho; le falta `image-rendering: pixelated`, que el diseño fija (`.valmen/features/vista-agentes/design.md:9-10`), y las miniaturas del selector (`index.html:6373-6376`) tampoco lo tienen.
  - Avisos: la caja recibe la clase del tipo (`index.html:6355`, `corrida-aviso pendiente|respondio`), pero el CSS solo define `.corrida-aviso` (`index.html:2209-2216`) con el borde de acento: no hay regla para `.pendiente` ni para `.respondio`, y los dos se ven iguales.
  - Paneles: «Agentes vivos», «Cola» y «Entregados» se agregan como `h3` sueltos al contenedor (`index.html:6497`, `:6502`, `:6523`), sin contenedor de rejilla; el único punto de quiebre de la vista es `max-width: 640px` (`index.html:2304`), que convierte la tabla en tarjetas, distinto del de 700 px de la spec.
  - Tokens: todo el CSS de la vista (`index.html:2168-2335`) ya usa variables (`--panel-alto`, `--borde`, `--acento`, `--ok`, `--alerta`…), que se redefinen para el tema claro en `index.html:40-61`; la falta no es de colores a mano en el marco sino de las reglas anteriores que todavía no existen.
- Hipótesis pendientes:
  - Que a 390 px ningún otro elemento de la vista (barra de simultáneos `.corrida-barra`, `.tarjetas` de indicadores, la columna lateral del armazón) provoque desplazamiento horizontal: el CSS los declara flexibles (`flex-wrap`, `grid`), pero se comprueba en el navegador con `document.documentElement.scrollWidth <= innerWidth` durante la implementación.
  - Que la tabla «Agentes vivos» quepa en media columna entre 700 y 960 px sin desbordar la página: si no cabe, el contenedor `.corrida-desplazable` existente (`index.html:2225-2228`) desplaza solo la tabla dentro del panel, no la página.
- Consumidores afectados: la vista «Agentes» (`vistaCorrida`, `index.html:6398-6543`, y su refresco de 5 s); el montaje y sus pruebas (`tests/vista-lienzo.test.ts`); las pruebas que ejecutan la interfaz (`tests/vista-corrida.test.ts`, `tests/interfaz-ejecutable.test.ts`, `scripts/verificar-interfaz.mjs`), que dependen del orden de los encabezados y no deben romperse al envolver los paneles; los tickets de S3, que darán a cada panel la paleta de su mundo sobre el contenedor que este ticket crea.
- Archivos y flujo investigados: `navegar` → `vistaCorrida` (`index.html:6398`) → `cargarEscena` (`:6312-6339`, importa `/agentes/montaje.js` y llama a `crearMontaje`) → `pintarLienzoDeAgentes` (`:6342-6396`, avisos, lienzo, selector, lema) → `montaje.montar` → `cuadroDeAnimacion` (`montaje.js:134`) → `mundo.dibujar`; paneles en `vistaCorrida` (`index.html:6497-6533`); CSS de la vista en `index.html:2168-2335`; tokens en `index.html:8-61`; prototipo `assets/vista-agentes.html:26-72` y `:540-560`; spec `s2-motor-escena/spec.md:138-159`; `design.md` decisiones 1 y 4.
- Riesgos y compatibilidad: bajar a cuatro cuadros por segundo no debe teletransportar agentes: el paso de tiempo por cuadro ya está acotado a 0,25 s (`montaje.js:17`), que coincide con el intervalo de 250 ms, así que el movimiento sigue siendo continuo. La preferencia se lee por cuadro (función inyectada), de modo que cambiarla con la vista abierta surte efecto sin recargar. Envolver los paneles en un contenedor cambia el árbol del DOM que leen las pruebas de interfaz: se conservan los mismos encabezados y textos. Sin cambios de contrato del servidor ni del motor; con la preferencia ausente (un navegador sin `matchMedia`) el comportamiento es el actual.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es CSS y JavaScript del cliente servidos por `valmen serve` desde archivos ya declarados en el mapa de estáticos; no se agrega ningún archivo nuevo al mapa.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: marco de la vista «Agentes» (lienzo como elemento de página, selector, avisos, paneles) y ritmo del bucle en `montaje.js`. Exclusiones: paleta y tipografía de cada mundo y su `valmen:allow-color` (FEATURE-WEB-MUNDO-PASTELERIA/CONTROL/INVERNADERO); `motor.js`; `/api/corrida/agentes`; los archivos de `packages/server/web/agentes/mundos/`.
- Pasos ordenados:
  1. `packages/server/web/agentes/montaje.js`, `crearMontaje`: nuevo parámetro inyectado `reducirMovimiento = () => false` y constante exportada `INTERVALO_REDUCIDO_MS = 250`. En `cuadroDeAnimacion`, si `reducirMovimiento()` es verdadero y pasaron menos de 250 ms desde el último cuadro avanzado, se pide el siguiente cuadro sin avanzar ni dibujar y sin actualizar `ultimo`; así `dt` se mide desde el último cuadro dibujado y sigue acotado por `DT_MAXIMO_S` (0,25 s). La preferencia se lee en cada cuadro. (C1, C2, C3)
  2. `packages/server/web/index.html`, `cargarEscena`: la vista crea una sola vez `matchMedia("(prefers-reduced-motion: reduce)")` si `matchMedia` existe y pasa a `crearMontaje` `reducirMovimiento: () => consulta?.matches === true`. (C4)
  3. `packages/server/web/index.html`, CSS de la vista: `image-rendering: pixelated` en `.corrida-lienzo` y en `.corrida-mundo canvas`; reglas `.corrida-aviso.pendiente` (`--alerta-suave` de fondo, `--alerta` de borde) y `.corrida-aviso.respondio` (`--ok-suave`, `--ok`), como el prototipo `assets/vista-agentes.html:51-53`; `.corrida-paneles` en rejilla de una columna, con `@media (min-width: 700px)` a dos columnas, y `.corrida-panel { min-width: 0 }` para que una tabla ancha no desborde la página. Solo variables del tema, sin colores a mano. (C5, C6, C7, C8, C10, C11)
  4. `packages/server/web/index.html`, `vistaCorrida`: los bloques «Agentes vivos», «Cola» y «Entregados» (hoy `h3` sueltos en `:6497`, `:6502`, `:6523`) se envuelven cada uno en un `div.corrida-panel`, y los tres en un `div.corrida-paneles`; los textos y el orden de los encabezados no cambian. (C9)
  5. `tests/vista-marco-responsivo.test.ts` (nuevo): pruebas del montaje con reloj y cuadros inyectados (C1-C3), lectura estática de `index.html` para la consulta de movimiento y las reglas CSS (C4-C8, C10, C11), y la vista ejecutada con `ejecutarInterfaz` como en `tests/vista-corrida.test.ts` para el contenedor de paneles (C9). Cada prueba lleva su criterio en el nombre.
  6. Verificación en el navegador con `valmen serve` a 390, 768 y 1024 px, en claro y oscuro, comparando con el prototipo; `document.documentElement.scrollWidth <= innerWidth` en cada ancho; y `revisar_presentacion` sobre el cambio. Las capturas quedan como evidencia en el ticket. (C12, C13, C14, C15, C16, C17, C18, C19)
  7. Regresión: `npx vitest run tests/vista-lienzo.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts`. (C20)
- Impactos declarados: ninguno; sin sincronización, migración ni contenedores. Archivos del cliente ya declarados en el mapa de estáticos de `valmen serve`; ningún archivo servido nuevo.
- Rollback (obligatorio): revertir el commit del ticket en la rama; restaura el bucle a cada cuadro, el CSS y el árbol de paneles anteriores. No hay datos ni estado persistido que deshacer (la preferencia de mundo en `localStorage` no cambia).

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-ESC-010: con `reducirMovimiento` verdadero, el montaje dibuja como máximo un cuadro cada 250 ms.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C1 -->
- [x] C2 — R-ESC-010: con `reducirMovimiento` verdadero, un segundo de cuadros avanza un segundo el tiempo de la escena.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C2 -->
- [x] C3 — R-ESC-010: sin la preferencia de movimiento reducido, el montaje dibuja en cada cuadro pedido.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C3 -->
- [x] C4 — R-ESC-010: la vista pasa a `crearMontaje` una función que consulta `prefers-reduced-motion: reduce`.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C4 -->
- [x] C5 — R-ESC-010: `.corrida-lienzo` declara `image-rendering: pixelated`.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C5 -->
- [x] C6 — R-ESC-010: las miniaturas del selector de mundo declaran `image-rendering: pixelated`.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C6 -->
- [x] C7 — R-ESC-011: el aviso de pregunta pendiente usa las variables de alerta del tema.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C7 -->
- [x] C8 — R-ESC-011: el aviso «una persona respondió» usa las variables ok del tema.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C8 -->
- [x] C9 — R-ESC-010: los paneles «Agentes vivos», «Cola» y «Entregados» se pintan dentro de un contenedor `.corrida-paneles`.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C9 -->
- [x] C10 — R-ESC-010: desde 700 px de ancho, `.corrida-paneles` reparte los paneles en dos columnas.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C10 -->
- [x] C11 — R-ESC-010: por debajo de 700 px, `.corrida-paneles` pone los paneles en una columna.
      <!-- test: npx vitest run tests/vista-marco-responsivo.test.ts -t C11 -->
- [ ] C12 — R-ESC-010: a 390 px de ancho, `document.documentElement.scrollWidth` de la vista no supera `innerWidth`.
      <!-- verify: manual -->
- [ ] C13 — R-ESC-010: a 768 px de ancho (iPad vertical), `document.documentElement.scrollWidth` de la vista no supera `innerWidth`.
      <!-- verify: manual -->
- [ ] C14 — R-ESC-010: a 1024 px de ancho (iPad horizontal), los paneles «Agentes vivos» y «Cola» comparten la misma fila.
      <!-- verify: manual -->
- [ ] C15 — R-ESC-011: en tema oscuro, la barra de simultáneos de la cabecera toma sus colores de las variables del tema.
      <!-- verify: manual -->
- [ ] C16 — R-ESC-011: en tema oscuro, el selector de mundo toma sus colores de las variables del tema.
      <!-- verify: manual -->
- [ ] C17 — R-ESC-011: en tema oscuro, el aviso de pregunta toma sus colores de las variables del tema.
      <!-- verify: manual -->
- [ ] C18 — R-ESC-011: en tema oscuro, cada panel toma sus colores de las variables del tema.
      <!-- verify: manual -->
- [ ] C19 — R-ESC-011: `revisar_presentacion` sobre el cambio del ticket no reporta colores a mano.
      <!-- verify: manual -->
- [x] C20 — Las pruebas existentes del lienzo, de la vista Agentes y de la interfaz ejecutable siguen pasando.
      <!-- test: npx vitest run tests/vista-lienzo.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/web/agentes/montaje.js`: `crearMontaje` recibe `reducirMovimiento` (por defecto `() => false`) y exporta `INTERVALO_REDUCIDO_MS = 250`; con la preferencia activa, un cuadro que llega antes de 250 ms del último dibujado se salta sin avanzar ni tocar `ultimo`, así que `dt` sigue acotado por `DT_MAXIMO_S`. La preferencia se lee en cada cuadro.
- `packages/server/web/index.html`: `cargarEscena` crea una vez `matchMedia("(prefers-reduced-motion: reduce)")` y pasa `reducirMovimiento`; CSS con `image-rendering: pixelated` en `.corrida-lienzo` y `.corrida-mundo canvas`, avisos `.pendiente` (`--alerta-suave`/`--alerta`) y `.respondio` (`--ok-suave`/`--ok`), `.corrida-paneles` en rejilla de una columna y dos desde 700 px, `.corrida-panel` con `min-width: 0` y `overflow-x: auto` (añadido al verificar en el navegador: a 768 px con la barra lateral abierta la tabla «Agentes vivos» desbordaba la página); `vistaCorrida` envuelve «Agentes vivos», «Cola» y «Entregados» en `div.corrida-panel` dentro de `div.corrida-paneles`, con los mismos textos y orden.
- `tests/vista-marco-responsivo.test.ts` (nuevo, 12 pruebas, una por criterio C1-C11).
- Hallazgo fuera de alcance: el armazón (`body.armazon`, `index.html:94-101`) no tiene modo celular: la barra lateral de 232 px ocupa ancho en línea y a 390 px, con ella abierta, las `.tarjetas` (140 px) desbordan la página (`scrollWidth` 400 > 390). Con la barra oculta (botón de la cabecera) a 390 px no hay desborde. Es del armazón, no del marco de la vista; queda como propuesta de ticket.

## Pruebas

Directorio de ejecución: raíz del repositorio (o del worktree). Ambiente: Node 24, `npm ci` hecho; `npm run build` antes de `interfaz-ejecutable`.

Automáticas (resultado esperado: todo en verde):
- `npx vitest run tests/vista-marco-responsivo.test.ts` — 12 pruebas, C1-C11. Resultado: 12 passed.
- `npx vitest run tests/vista-lienzo.test.ts tests/vista-corrida.test.ts tests/interfaz-ejecutable.test.ts` — C20. Resultado: 50 passed (18 + 16 + 16).
- `npx tsc --noEmit -p .` — solo quedan los TS7016 de importar `.js` sin declaración, ya presentes en `tests/vista-lienzo.test.ts`.
- `valmen secrets`: sin secretos.

Manuales (siguen sin marcar; las hace el responsable con `valmen serve` y la preferencia de Proyecto «ValmenHarness»):
- C12-C13: con el navegador a 390 y 768 px, `document.documentElement.scrollWidth <= innerWidth`. Medido por el agente en el navegador del worktree: 390 px con la barra lateral oculta = 390/390; 768 px con la barra abierta = 753/768 (753 es el ancho útil sin la barra de desplazamiento vertical). A 390 px con la barra abierta desborda por las tarjetas del armazón (fuera de alcance, ver Implementación).
- C14: a 1024 px «Agentes vivos» y «Cola» quedan en la misma fila (tops 908/908, columnas 349 px). Medido por el agente.
- C15-C18: en tema oscuro, inspeccionar barra de simultáneos, selector, aviso de pregunta y paneles. El agente comprobó en oscuro la ausencia de colores a mano en las reglas nuevas (C7/C8 por prueba); la inspección visual de las cuatro piezas queda al responsable.
- C19: `revisar_presentacion` sobre el cambio sin colores a mano (lo corrió el agente en el checkout principal y reportó 0 archivos revisados; hay que repetirlo sobre el diff del ticket).

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
    "notes": "Sesión de subagente (claude-sonnet-5-5) sin agregado de tokens expuesto; no se estima.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-subagente-implementacion",
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
    "at": "2026-10-08T23:30:59.216Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T00:53:26.325Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T00:55:07.701Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261009-IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008-analysis-1, canal cli, decidida 2026-10-09T00:55:07.695Z): PO: \"Recomiendo A, aprueba el análisis\""
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T00:56:05.543Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T01:05:16.880Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008-plan-2, canal cli, decidida 2026-10-09T01:05:16.871Z): PO: \"Recomiendo A, aprueba el plan\" (respuesta a la REVIEW del plan)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T01:05:17.184Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Recomiendo A, aprueba el plan\",\"planHash\":\"sha256:4c0200bf7678de06628c81fec0f50c1cfa317f410e0023a306b4999ad5ac55c0\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T01:05:17.501Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:4c0200bf7678de06628c81fec0f50c1cfa317f410e0023a306b4999ad5ac55c0."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T01:05:17.501Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T01:05:29.235Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T01:11:23.079Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  }
]
```
