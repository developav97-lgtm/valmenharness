---
schema_version: 2
id: FEATURE-WEB-TEMA-TOKENS-20261014
title: Tema sala de control con tokens, fuentes locales y modo claro
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

# FEATURE-WEB-TEMA-TOKENS-20261014

## Solicitud original

Parte del sprint: Marco común entregable: tema sala de control con fuentes locales, menú por grupos con proyecto y perfil activo, acción Pedir un cambio e Inicio como pantalla de apertura.
- R-MARCO-001: La interfaz DEBE usar el tema «sala de control» definido como tokens
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La interfaz DEBE usar el tema «sala de control» definido como tokens
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/inicio.html` — Boceto aprobado por el PO el 2026-10-14: Inicio (HTML autónomo, el original) (sha256 d3d757a58383…)
- `.valmen/features/rediseno-mission-control/assets/inicio.png` — Captura a 1440 px del boceto aprobado: Inicio (sha256 6c7749d2fadd…)
- `.valmen/features/rediseno-mission-control/assets/menu.html` — Boceto aprobado por el PO el 2026-10-14: Menú lateral por grupos (HTML autónomo, el original) (sha256 802d68d45244…)
- `.valmen/features/rediseno-mission-control/assets/menu.png` — Captura del boceto aprobado: Menú lateral por grupos (sha256 7ba35b11696d…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Origen de los archivos `woff2` de Chakra Petch, IBM Plex Sans e IBM Plex Mono: el repositorio no tiene ninguno (búsqueda en el repo, `node_modules` y las carpetas de fuentes del equipo, 2026-10-14) y obtenerlos exige descargar de un tercero. Pregunta al PO: ¿se descargan de la distribución oficial con licencia SIL OFL (Google Fonts / repositorios de los autores, pesos 500-700 de Chakra Petch y 400-600 de las Plex, subconjunto latino) y se versionan en `packages/server/web/fuentes/` junto a su `OFL.txt`? Es lo único del ticket que el agente no puede validar sin permiso; el plan no lo adivina y deja el paso de fuentes condicionado a esa respuesta.
  - Respuesta del PO (2026-10-14, por AskUserQuestion, transmitida por el orquestador): «Descargar de Fontsource». Alcance autorizado según el orquestador: solo los nueve `woff2` y `OFL.txt` de `@fontsource/chakra-petch`, `@fontsource/ibm-plex-sans` e `@fontsource/ibm-plex-mono`, como archivos y no como dependencia, y la copia a `packages/server/web/fuentes/` solo con el ticket en `approved`.

## Descripción funcional

- Alcance: el marco visual común de Mission Control (`packages/server/web/index.html`, cliente sin framework servido por `valmen serve`): los tokens de color del tema «sala de control» en `:root` y su versión clara bajo `prefers-color-scheme: light`, el fondo con cuadrícula de 40 px, las tres familias tipográficas servidas como archivos locales y el reemplazo de los colores a mano que quedan fuera de los mundos de Agentes. No incluye reorganizar el menú (FEATURE-WEB-MENU-GRUPOS-20261014), Inicio (FEATURE-WEB-INICIO-DECISIONES-20261014) ni rehacer el marcado de cada vista (tickets de S2-S4): este ticket deja los tokens de los que esas vistas dependen.
- Usuario o rol afectado: el PO y cualquier persona que abra Mission Control en el navegador, en modo oscuro o claro del sistema.
- Comportamiento actual: paleta azul/gris genérica (`--fondo #0d1014`, acento azul `#5b8dff`, alerta `#d6a022`) sin significado fijo por quién decide; texto en `system-ui` y identificadores en `ui-monospace`; fondo liso; ocho reglas con color escrito a mano; el servidor solo sabe servir texto UTF-8.
- Comportamiento esperado: toda pantalla toma colores, tipografías y fondo de los tokens de `.valmen/features/rediseno-mission-control/design.md` (Decisión 3): fondo `#0a1114` con cuadrícula de 40 px, superficies `#122027`/`#172a32`, línea `#24383f`, ámbar = decide una persona, cian = decide el código, lila = trabaja un modelo, verde = hecho, rojo = negado; Chakra Petch en títulos, IBM Plex Sans en texto, IBM Plex Mono en identificadores y rótulos, servidas desde el propio servidor con pilas de respaldo del sistema; el modo claro redefine los mismos tokens y sus textos cumplen AA; `revisar_presentacion` no avisa de colores a mano. Referencia visual: `.valmen/features/rediseno-mission-control/assets/inicio.html`/`inicio.png` y `.valmen/features/rediseno-mission-control/assets/menu.html`/`menu.png` (abiertos y revisados en el análisis).

## Diagnóstico

- Búsqueda en memoria: `buscar_memoria` («tema colores modo claro modo oscuro variables CSS Mission Control web fuentes», 2026-10-14) no devolvió nada del tema ni de los estáticos (solo AP-002/004/007/009/012, ajenos): no hay causa raíz previa que citar.
- Causa comprobada (con `ruta:línea`): no es un defecto sino una funcionalidad que el código no tiene, y hay tres huecos concretos:
  1. Los tokens actuales son otra paleta y otros nombres: `packages/server/web/index.html:11-38` (`:root`, oscuro) y `:40-63` (claro) definen `--fondo/--panel/--panel-alto/--borde/--texto/--tenue/--acento/--acento-2/--ok/--alerta/--error` y sus `-suave`; no hay tokens de tipografía (solo `--mono` en `:32`) y el cuerpo usa `system-ui` (`index.html:79-88`). Uso medido: `var(--borde)` 75, `var(--tenue)` 71, `var(--acento)` 49, `var(--mono)` 33, `var(--alerta)` 32, `var(--error)` 31, `var(--texto)` 25, `var(--panel)` 24, `var(--ok)` 24, `var(--panel-alto)` 14, `var(--fondo)` 12: cambiar los **valores** de esos nombres reestiliza todo el cliente de una vez, sin tocar el marcado de las vistas.
  2. Quedan ocho colores a mano fuera de los mundos de Agentes: `index.html:504` (`button.principal { color: #fff }`), `:762` (`dialog::backdrop rgba(0,0,0,.6)`), `:1145` y `:1726` (`rgba(210,153,34,.12)`, ámbar viejo), `:2002` (`rgba(63,185,80,.12)`), `:2006` y `:2225` (`rgba(248,81,73,.12)`), `:2217` (`rgba(79,140,255,.1)`). Los de `:2326-2383` ya llevan `valmen:allow-color` (paletas propias del invernadero, el centro de control y la pastelería) y quedan fuera.
  3. El servidor no puede servir una fuente: `loadStatics` lee cada archivo como texto (`packages/server/src/server.ts:2516`, `readFileSync(ruta, "utf8")`), el tipo de `statics` es `body: string` (`server.ts:203-206`), `send` con `raw` hace `String(body)` (`server.ts:2481`, llamado desde `:2453-2457`) y `MIME` no conoce `.woff2` (`server.ts:2112-2117`). Un `woff2` leído como UTF-8 llega corrupto, con `application/octet-stream`. Además solo se sirve lo declarado en `ARCHIVOS_WEB` (`server.ts:2496-2505`), que el CLI carga en `packages/cli/src/main.ts:1638-1642`; `scripts/copy-web.mjs:31-32` copia `packages/server/web` entero a `packages/cli/dist/web`, así que una carpeta `fuentes/` sí viaja.
- Hipótesis pendientes:
  - El token «tenue» de `design.md` (`#5f767d` oscuro, `#7d9198` claro) **no cumple AA como texto**: contraste 3.96 sobre fondo y 3.47 sobre superficie en oscuro, 3.03/3.29 en claro (cálculo WCAG con un script local, 2026-10-14). Hoy `--tenue` pinta texto en 71 reglas. Los bocetos usan `#9aaeb4` (atenuado, 8.24) para texto secundario y `#7d949b` (5.97) para rótulos de grupo. Propuesta conservadora para el plan, a registrar con `valmen agent-decision`: `--tenue` toma el valor «atenuado» (`#9aaeb4`/`#4a5f66`, ≥6.19) y el «tenue» de la tabla queda como token aparte solo para bordes punteados y decoración no textual. El resto de los tokens claros sí pasa AA sobre fondo y superficie (cian 4.65, ámbar 4.73, verde 4.61, rojo 5.19, lila 6.26, atenuado 6.19).
  - Texto sobre acento: hoy `button.principal` pinta `#fff` sobre `--acento`; con cian `#4cc8e6` daría 1.96 (falla). El boceto pinta el botón principal en ámbar con texto `#0a1114` (10.31). Hace falta un token «texto sobre acento» que cambie por modo (oscuro `#0a1114`; claro `#ffffff`, 5.06 sobre cian claro y 5.14 sobre ámbar claro). Qué acento lleva el botón principal (cian del código o ámbar de la persona) depende de la acción y lo fija cada vista; este ticket solo deja el token.
  - Origen y licencia de los `woff2`: ver «Supuestos y decisiones pendientes».
- Consumidores afectados:
  - Todas las vistas del cliente (consumen los tokens por nombre) y la vista Agentes en lo que no es mundo (`.corrida-aviso`, banda de fases).
  - Pruebas que **fijan los nombres** de tokens y no deben ponerse en rojo: `tests/interfaz-ejecutable.test.ts:42-62` (el bloque claro con la regex `@media (prefers-color-scheme: light) { … \n }` debe declarar `--fondo/--panel/--panel-alto/--borde/--texto/--tenue/--acento/--ok/--alerta/--error`), `:474-479` (la banda de fases usa `var(--acento)` y `var(--error)` sin colores a mano), `tests/vista-marco-responsivo.test.ts:119-130` (`--alerta-suave/--alerta`, `--ok-suave/--ok`), `tests/mundos-correcciones.test.ts:370-383` (los mundos no usan `var(--fondo)`/`var(--panel)`). Conclusión: se conservan los nombres actuales y se les cambia el valor; los nuevos (persona, código, modelo, hecho, negado, fondo 2, superficie 2, cuadrícula, fuentes, texto sobre acento) se agregan como tokens nuevos o alias.
  - `tests/estaticos-web.test.ts:16-29` (C27) fija la lista **exacta** de `ARCHIVOS_WEB`: agregar las fuentes a esa constante la pone en rojo. Camino que la conserva: una lista aparte de estáticos binarios (fuentes) que el CLI carga junto a `ARCHIVOS_WEB` en `main.ts:1642`; C28 (`:31-37`) sigue igual.
  - `scripts/verificar-interfaz.mjs:858-867` compara `index.html` publicado con la fuente: tras el cambio hay que correr `npm run build` para que `dist/web` no quede vieja.
  - `revisar_presentacion` (`tests/presentation.test.ts`) mira solo las líneas agregadas: los valores dentro de `:root` y del bloque claro son la definición del tema y la herramienta los admite como declaración de variable (`presentation.test.ts:81`).
- Archivos y flujo investigados: `packages/server/web/index.html` (`:root`, bloque claro, `body`, `button.principal`, `dialog::backdrop` y las ocho reglas con color), `packages/server/src/server.ts` (`MIME`, `serveStatic`, `send`, `ARCHIVOS_WEB`, `loadStatics`, tipo `ServerContext.statics`), `packages/cli/src/main.ts:1630-1655` (`serve` carga los estáticos), `scripts/copy-web.mjs`, `scripts/verificar-interfaz.mjs`, las pruebas citadas, `.valmen/features/rediseno-mission-control/design.md` (Decisiones 1-3), `.valmen/features/rediseno-mission-control/spec/s1-marco/spec.md` (R-MARCO-001) y los bocetos `.valmen/features/rediseno-mission-control/assets/inicio.html`, `.valmen/features/rediseno-mission-control/assets/inicio.png`, `.valmen/features/rediseno-mission-control/assets/menu.html`, `.valmen/features/rediseno-mission-control/assets/menu.png` (cuadrícula `rgba(120,170,185,.06)` cada 40 px sobre `#0a1114`, títulos Chakra Petch 600, rótulos Plex Mono en mayúsculas con espaciado `.14em`, cifras y chips por color de quien decide).
- Riesgos y compatibilidad:
  - Cambio visual amplio en una sola línea de tokens: toda vista cambia de color a la vez. Mitigación: nombres conservados, verificación en navegador a 1440 px y 390 px, oscuro y claro, contra los bocetos, y `node scripts/verificar-interfaz.mjs` para comprobar que el módulo sigue montando cada vista.
  - Hasta que lleguen los tickets de S1-S4 las vistas conservan su marcado actual con los colores nuevos: la estructura todavía no será la de los bocetos, solo la paleta, las fuentes y el fondo.
  - Servir binarios cambia el contrato de `statics` y de `send`: lo que hoy es texto debe seguir saliendo idéntico (mismo `Content-Type`, mismas cabeceras `X-Frame-Options`, `nosniff`, `no-store`).
  - Licencia: SIL OFL permite redistribuir las fuentes con su archivo de licencia; sin `OFL.txt` junto a los `woff2` se incumple.
  - Sin red, las pilas de respaldo del sistema deben dejar la interfaz legible; nada se pide a Google Fonts (Decisión 2 de `design.md`).
- Impactos de sync, migración, Docker o despliegue: ninguno (no toca datos, esquema, contenedores ni despliegue; el cambio vive en el cliente web y en cómo el servidor local sirve estáticos).

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica. El supuesto «Origen de los archivos `woff2`» lo respondió el PO: Fontsource (ver paso 4).
- Alcance: tokens del tema en `packages/server/web/index.html` (oscuro y claro), fondo con cuadrícula, tipografías locales con pilas de respaldo, los ocho colores a mano fuera de los mundos y el servido binario de fuentes en `packages/server/src/server.ts` y `packages/cli/src/main.ts`. Exclusiones: el menú por grupos, Inicio, el marcado de cada vista (S1-S4), las paletas propias de los mundos de Agentes (ya marcadas con `valmen:allow-color`) y la regla de 390 px (R-MARCO-006, otro ticket).
- Decisiones registradas: D-001 (se conservan los nombres actuales de tokens con valores nuevos y las fuentes van en `ARCHIVOS_FUENTES`, no en `ARCHIVOS_WEB`) y D-002 (el token `--tenue` toma el valor «atenuado» y el «tenue» de la tabla queda como `--tenue-deco`, solo para decoración). Mapa de nombres: `--fondo` = fondo, `--fondo-2` = fondo 2, `--panel` = superficie, `--panel-alto` = superficie 2, `--borde` = línea, `--texto` = texto, `--tenue` = atenuado, `--tenue-deco` = tenue, `--acento` y `--codigo` = cian, `--alerta` y `--persona` = ámbar, `--acento-2` y `--modelo` = lila, `--ok` y `--hecho` = verde, `--error` y `--negado` = rojo, `--cuadricula`, `--sobre-acento` (oscuro `#0a1114`, claro `#ffffff`), `--velo` (velo del diálogo) y cada `-suave` como el mismo color al 12 %; tipografías `--fuente-titulo`, `--fuente-texto` y `--mono`.
- Respuesta al diagnóstico (cada hallazgo de `## Diagnóstico` y el paso que lo resuelve):
  - Hallazgo 1, los tokens actuales son otra paleta (`packages/server/web/index.html:11-38` y `:40-63`) y no hay tokens de tipografía (`index.html:79-88`): lo resuelve el paso 5, que reescribe esos dos bloques con los valores de `design.md` y agrega `--fuente-titulo`, `--fuente-texto` y `--mono`; lo comprueba el paso 1 (C1-C7).
  - Hallazgo 2, los ocho colores a mano (`index.html:504`, `:762`, `:1145`, `:1726`, `:2002`, `:2006`, `:2217`, `:2225`): lo resuelve el paso 5 con `var(--sobre-acento)`, `var(--velo)` y los `-suave`; lo comprueba el paso 1 (C8) y el paso 8 con `revisar_presentacion` (C20).
  - Hallazgo 3a, `loadStatics` lee cada archivo como texto (`packages/server/src/server.ts:2516`) y `send` hace `String(body)` (`server.ts:2481`): lo resuelve el paso 2, que lee como `Buffer` las extensiones binarias y escribe el `Buffer` sin convertirlo; lo comprueba el paso 1 (C10, C12).
  - Hallazgo 3b, `MIME` no conoce `.woff2` (`server.ts:2112`): lo resuelve el paso 2 con `.woff2` → `font/woff2`; lo comprueba el paso 1 (C11).
  - Hallazgo 3c, solo se sirve lo declarado en `ARCHIVOS_WEB` (`server.ts:2496-2505`, cargado en `packages/cli/src/main.ts:1642`): lo resuelven el paso 2 (`ARCHIVOS_FUENTES`) y el paso 3 (`serve` carga las dos listas); lo comprueba el paso 1 (C10).
  - Hipótesis del contraste del «tenue» de `design.md` (3.03-3.96, falla AA): la cierra D-002 y la aplica el paso 5; lo comprueba el paso 1 (C3).
  - Hipótesis del texto sobre acento (`#fff` sobre cian da 1.96): la resuelve el token `--sobre-acento` del paso 5; lo comprueba el paso 1 (C3, C8).
  - Consumidores que fijan nombres (`tests/interfaz-ejecutable.test.ts:42-62`, `tests/vista-marco-responsivo.test.ts:119-130`, `tests/mundos-correcciones.test.ts:370-383`) y la lista exacta de `ARCHIVOS_WEB` (`tests/estaticos-web.test.ts:16-29`): los protege D-001 (nombres conservados y `ARCHIVOS_FUENTES` aparte) y lo comprueba el paso 7 (C14).
  - Copia publicada (`scripts/verificar-interfaz.mjs:858-867`): la cubre el paso 6 (C15).
  - Supuesto del origen de las fuentes y su licencia: lo cierra el paso 4 con la respuesta del PO y lo comprueba el paso 1 (C9, C13).
- Pasos ordenados:
  1. Escribir `tests/tema-tokens.test.ts` y verlo en rojo con `npx vitest run tests/tema-tokens.test.ts`: una tabla de casos token → valor oscuro → valor claro leída de `:root` y del bloque `@media (prefers-color-scheme: light)` de `index.html`; el cálculo WCAG de cada token de texto sobre `--fondo` y `--panel` en los dos modos; la ausencia de colores a mano fuera de las declaraciones de variables y de las líneas `valmen:allow-color`; la cuadrícula de 40 px en `body`; los `@font-face` y los usos de `--fuente-titulo`, `--fuente-texto` y `--mono`; y, con `createMissionControl` y `loadStatics` sobre `ARCHIVOS_FUENTES`, que cada `woff2` llega byte a byte con `font/woff2` y que `index.html` sigue llegando como `text/html` con el mismo cuerpo; y, para C13, que `packages/server/web/fuentes/OFL.txt` existe, no está vacío y contiene el texto «SIL OPEN FONT LICENSE Version 1.1» (C1-C13).
  2. `packages/server/src/server.ts`: `MIME` agrega `.woff2` → `font/woff2`; el tipo de `ServerContext.statics` admite `body: string | Uint8Array`; `loadStatics` lee como `Buffer` los archivos de extensión binaria y como UTF-8 el resto; `send` escribe el `Buffer` tal cual cuando el cuerpo es binario y conserva `String(body)` para el texto; se exporta `ARCHIVOS_FUENTES` con las rutas `fuentes/*.woff2` (C10, C11, C12).
  3. `packages/cli/src/main.ts:1642`: `serve` carga `loadStatics(raizWeb, [...ARCHIVOS_WEB, ...ARCHIVOS_FUENTES])`, conservando el mensaje de error actual (C10).
  4. `packages/server/web/fuentes/`: nueve `woff2` de subconjunto latino —Chakra Petch 500, 600 y 700; IBM Plex Sans 400, 500 y 600; IBM Plex Mono 400, 500 y 600— y `OFL.txt`, tomados de los paquetes públicos `@fontsource/chakra-petch`, `@fontsource/ibm-plex-sans` e `@fontsource/ibm-plex-mono` sin añadirlos como dependencia (respuesta del PO «Descargar de Fontsource», 2026-10-14, transmitida por el orquestador): se descargan a un directorio nuevo y vacío fuera del repo, se verifican su sha256 y la licencia OFL, y se copian con shell, sin pasar bytes por el modelo, solo con el ticket en `approved` (C9, C13).
  5. `packages/server/web/index.html`: reescribir `:root` (`:11-38`) y el bloque claro (`:40-63`) con los valores de `design.md` y el mapa de nombres de arriba, conservando la forma del bloque que lee `tests/interfaz-ejecutable.test.ts:44-45` (C1, C2, C3); agregar los nueve `@font-face` con `font-display: swap` (C9); `body` con la cuadrícula `linear-gradient` de 40 px con `var(--cuadricula)` sobre `var(--fondo)` (C4) y con `var(--fuente-texto)` (C5); `h1`, `h2` y `h3` con `var(--fuente-titulo)` (C6); `--mono` con IBM Plex Mono y su pila actual de respaldo (C7); y los ocho colores a mano de `:504`, `:762`, `:1145`, `:1726`, `:2002`, `:2006`, `:2217` y `:2225` por `var(--sobre-acento)`, `var(--velo)` y los `-suave` del acento que corresponde (C8).
  6. `npm run build` y `node scripts/verificar-interfaz.mjs`: la copia publicada coincide con la fuente y cada vista monta sin el aviso de error (C15).
  7. Regresión: `npx vitest run tests/tema-tokens.test.ts tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts tests/mundos-correcciones.test.ts tests/presentation.test.ts` y `npx tsc -p packages/server/tsconfig.json --noEmit`; si una prueba existente se pone en rojo, se detiene y se reporta en el ticket sin editarla (C14, C16).
  8. Verificación en el navegador con `valmen serve`: Tickets (y de paso Features y Agentes) a 1440 px en modo oscuro contra `.valmen/features/rediseno-mission-control/assets/inicio.png` y `.valmen/features/rediseno-mission-control/assets/menu.png` (fondo, cuadrícula, superficies, tipografías y colores por quién decide), las mismas en modo claro, y la pestaña de red sin peticiones a `fonts.googleapis.com`; capturas como evidencia del ticket y `revisar_presentacion` sin avisos (C17, C18, C19, C20).
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 430 líneas (unas 190 de producción —150 de `index.html`, 35 de `server.ts`, 5 de `main.ts`— y unas 240 de pruebas), más nueve `woff2` binarios y `OFL.txt`; 20 criterios.
- Si excede el tope: no excede el tope (`delivery-budget: 600`).
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema ni configuración que deshacer, y como los nombres de tokens se conservan, las vistas vuelven a la paleta anterior sin tocar su marcado. Si solo fallan las fuentes, quitar los `@font-face` deja las pilas de respaldo del sistema.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-MARCO-001): `:root` de `index.html` declara cada token del tema con su valor oscuro de `design.md`
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C2 (R-MARCO-001): el bloque `prefers-color-scheme: light` redefine cada token del tema con su valor claro de `design.md`
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C3 (R-MARCO-001): cada token de texto alcanza contraste 4.5:1 sobre las superficies del tema en ambos modos
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C4 (R-MARCO-001): el fondo de `body` es la cuadrícula de 40 px de `var(--cuadricula)` sobre `var(--fondo)`
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C5 (R-MARCO-001): el texto de `body` usa `var(--fuente-texto)`, que empieza por IBM Plex Sans
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C6 (R-MARCO-001): los títulos de nivel 1 a 3 usan `var(--fuente-titulo)`, que empieza por Chakra Petch
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C7 (R-MARCO-001): el token `--mono` empieza por IBM Plex Mono
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C8 (R-MARCO-001): `index.html` no tiene colores a mano fuera de las declaraciones de variables, salvo las líneas marcadas `valmen:allow-color`
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C9 (R-MARCO-001): cada `@font-face` apunta a un archivo de `fuentes/` que existe en `packages/server/web`
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C10 (R-MARCO-001): el servidor entrega cada `woff2` de `ARCHIVOS_FUENTES` idéntico byte a byte al archivo en disco
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C11 (R-MARCO-001): el servidor entrega cada `woff2` con `Content-Type: font/woff2`
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C12 (R-MARCO-001): el servidor sigue entregando `index.html` con el mismo cuerpo que el archivo
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C13 (R-MARCO-001): `packages/server/web/fuentes/OFL.txt` acompaña a las fuentes
      <!-- test: npx vitest run tests/tema-tokens.test.ts -->
- [x] C14 (R-MARCO-001): las pruebas existentes de la interfaz siguen en verde sin editarse
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts tests/mundos-correcciones.test.ts tests/presentation.test.ts -->
- [x] C15 (R-MARCO-001): el módulo de la interfaz monta cada vista con el tema nuevo
      <!-- test: node scripts/verificar-interfaz.mjs -->
- [x] C16 (R-MARCO-001): el paquete del servidor compila con el nuevo tipo de `statics`
      <!-- test: npx tsc -p packages/server/tsconfig.json --noEmit -->
- [ ] C17 (R-MARCO-001): en modo oscuro a 1440 px la pantalla Tickets toma la paleta de `inicio.png`
      <!-- verify: manual -->
- [ ] C18 (R-MARCO-001): en modo claro a 1440 px la pantalla Tickets toma los valores claros de los tokens
      <!-- verify: manual -->
- [ ] C19 (R-MARCO-001): al abrir Mission Control el navegador no pide nada a `fonts.googleapis.com`
      <!-- verify: manual -->
- [ ] C20 (R-MARCO-001): `revisar_presentacion` no avisa de colores a mano en el cambio
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Plan aprobado seguido paso a paso (recibo `GR-20261014-FEATURE-WEB-TEMA-TOKENS-20261014-plan-2`):

1. `tests/tema-tokens.test.ts` escrito primero y visto en rojo (51 de 53 en rojo: C12 y `--panel` claro ya pasaban, porque ese comportamiento no cambia).
2. `packages/server/src/server.ts`: `MIME` con `.woff2` → `font/woff2`; conjunto `BINARIOS` (`.woff2`) que `loadStatics` lee como `Buffer`; `ServerContext.statics` y `loadStatics` admiten `string | Uint8Array`; `send` escribe los bytes sin convertirlos; nueva lista exportada `ARCHIVOS_FUENTES` con los nueve `woff2` (D-001: `ARCHIVOS_WEB` no cambia).
3. `packages/cli/src/main.ts`: `serve` carga `[...ARCHIVOS_WEB, ...ARCHIVOS_FUENTES]`.
4. `packages/server/web/fuentes/`: nueve `woff2` y `OFL.txt` de `@fontsource` 5.3.0, copiados con `cp` y verificados con `shasum -a 256 -c` (10 OK, 172 KB; EVIDENCE-001).
5. `packages/server/web/index.html`: nueve `@font-face` con `font-display: swap`; `:root` y el bloque claro con los valores de `design.md`, los nombres de siempre conservados (D-001), `--tenue` con el valor «atenuado» y `--tenue-deco` para decoración (D-002), alias `--codigo`, `--persona`, `--modelo`, `--hecho`, `--negado`, más `--fondo-2`, `--modelo-suave`, `--cuadricula`, `--sobre-acento`, `--velo`, `--fuente-titulo` y `--fuente-texto`; `body` con la cuadrícula de 40 px y `var(--fuente-texto)`; `h1, h2, h3` con `var(--fuente-titulo)`; los ocho colores a mano reemplazados por `var(--sobre-acento)`, `var(--velo)`, `var(--alerta-suave)`, `var(--ok-suave)`, `var(--error-suave)` y `var(--acento-suave)`.
6. `npm run build` y `node scripts/verificar-interfaz.mjs`: «Interfaz verificada», 11 vistas ejecutadas.
7. Regresión en verde sin editar ninguna prueba existente.
8. Verificación en navegador (EVIDENCE-002 a 004) y `revisar_presentacion`: «nada que avisar».

Hallazgos fuera del alcance, para los tickets que siguen:
- En modo claro, los acentos sobre `--fondo-2` (`#e8eef0`) quedan entre 4.28 y 4.39 (por debajo de AA); el texto y `--tenue` sí pasan (≥5.74). `--fondo-2` todavía no lo usa ninguna vista; quien lo use para el menú (FEATURE-WEB-MENU-GRUPOS-20261014) debe poner sobre él solo texto, `--tenue` o acentos en tamaño grande.
- A 390 px la página de Tickets mide 1063 px de ancho (la tabla desborda): es R-MARCO-006, de otro ticket.

## Pruebas

Directorio de ejecución: la raíz del worktree (`/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-tema-tokens`) o, tras integrar, la raíz del repositorio. Entorno: Node 24 y dependencias instaladas (`npm install`); sin red ni servicios externos.

| Comando | Resultado esperado | Criterios |
|---|---|---|
| `npx vitest run tests/tema-tokens.test.ts` | 53 pruebas en verde | C1-C13 |
| `npx vitest run tests/interfaz-ejecutable.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts tests/mundos-correcciones.test.ts tests/presentation.test.ts` | 74 pruebas en verde, ninguna editada | C14 |
| `npm run build` y después `node scripts/verificar-interfaz.mjs` | «Interfaz verificada.» con 11 vistas ejecutadas | C15 |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | sale con 0, sin errores | C16 |

Resultado local (2026-10-14): las seis suites, 127 de 127 en verde; `verificar-interfaz` verificada; `tsc` con salida 0.

Validaciones manuales (C17-C20 sin marcar hasta que el responsable las confirme; el agente ya las recorrió con Chrome sin pantalla y `revisar_presentacion`, EVIDENCE-002 a 005, sin diferencias de paleta, fondo ni tipografía contra `inicio.png` y `menu.png`):
1. `npm run build` y `node packages/cli/dist/main.js serve`; abrir `http://127.0.0.1:4173/#/tickets` con el sistema en modo oscuro a 1440 px y compararlo con `.valmen/features/rediseno-mission-control/assets/inicio.png`: fondo casi negro azulado con cuadrícula tenue de 40 px, tarjetas `#122027`, cian para enlaces y acciones del código, títulos en Chakra Petch y rótulos o identificadores en IBM Plex Mono (C17). Referencia: `tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-oscuro-1440.png` y `ticket-oscuro-1440.png`.
2. Cambiar el sistema a modo claro y recargar: fondo `#f2f6f7` con cuadrícula, tarjetas blancas, cian oscuro `#0a7898`, texto casi negro y legible (C18). Referencia: `evidencia/tickets-claro-1440.png` y `ticket-claro-1440.png`.
3. En las herramientas del navegador, pestaña Red, recargar: las fuentes llegan de `/fuentes/*.woff2` con `font/woff2` y no hay ninguna petición a `fonts.googleapis.com` ni a otro anfitrión (C19).
4. `revisar_presentacion` (herramienta MCP `valmen`) sobre el cambio: «nada que avisar» (C20).
Lo que no se cambia en este ticket: la estructura del menú y de cada vista sigue siendo la actual; solo cambian la paleta, el fondo y las tipografías.

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
    "kind": "fuentes",
    "description": "Nueve woff2 (subconjunto latino) y OFL.txt de @fontsource/chakra-petch, @fontsource/ibm-plex-sans e @fontsource/ibm-plex-mono 5.3.0 (licencia OFL-1.1), descargados por el orquestador con la autorización del PO («Descargar de Fontsource») y copiados con cp a packages/server/web/fuentes/; shasum -a 256 -c contra SHA256SUMS: 10 OK; 172 KB en total; magic wOF2 y OFL.txt con «SIL OPEN FONT LICENSE Version 1.1».",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "captura",
    "description": "Modo oscuro a 1440 px (tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-oscuro-1440.png, tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/ticket-oscuro-1440.png; Chrome sin pantalla por CDP con prefers-color-scheme: dark) comparado con .valmen/features/rediseno-mission-control/assets/inicio.png y menu.png: fondo #0a1114 con cuadrícula de 40 px, superficies #122027, línea #24383f, cian para lo que decide el código, títulos en Chakra Petch, rótulos e identificadores en IBM Plex Mono, texto en IBM Plex Sans; ninguna petición a terceros.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "captura",
    "description": "Modo claro a 1440 px (tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-claro-1440.png, tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/ticket-claro-1440.png; prefers-color-scheme: light): fondo #f2f6f7 con cuadrícula, superficies blancas, acento cian #0a7898, texto #0d1a1f; cada token toma su valor claro.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "captura",
    "description": "Tickets a 390 px en oscuro y claro, solo como referencia (tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-oscuro-390.png, tickets/2026/FEATURE-WEB-TEMA-TOKENS-20261014/evidencia/tickets-claro-390.png): el documento mide 1063 px de ancho porque la tabla desborda la página. Fuera del alcance de este ticket: lo cubre R-MARCO-006 en otro ticket de la feature.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "ux-review",
    "description": "Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.",
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
    "notes": "Subagente claude-opus-5-5 lanzado por el orquestador (sesión 4bafa011, que sirve varios tickets) para análisis, plan e implementación de este ticket; el subagente no expone sus tokens ni su coste, así que no se inventan números. Los costes de las compuertas están en .valmen/receipts/FEATURE-WEB-TEMA-TOKENS-20261014.jsonl.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-ticket-tema-tokens",
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
    "at": "2026-10-14T05:09:26.816Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:54.717Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/inicio.html, .valmen/features/rediseno-mission-control/assets/inicio.png, .valmen/features/rediseno-mission-control/assets/menu.html, .valmen/features/rediseno-mission-control/assets/menu.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T05:16:15.129Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T05:18:12.338Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿Se renombran los tokens actuales a los nombres del tema y las fuentes entran en ARCHIVOS_WEB?\",\"eleccion\":\"Se conservan los nombres actuales (--fondo, --panel, --acento, --alerta, --ok, --error…) con valores nuevos, se agregan los nombres del tema como tokens nuevos, y las fuentes van en una lista aparte ARCHIVOS_FUENTES\",\"alternativas\":[\"renombrar todo a los nombres del tema\",\"agregar las fuentes a ARCHIVOS_WEB\"],\"criterio\":\"Las pruebas existentes fijan esos nombres y la lista exacta de ARCHIVOS_WEB; una prueba existente en rojo no se edita (estándar de proceso de AGENTS.md)\",\"fuente\":\"tests/interfaz-ejecutable.test.ts:51-62; tests/vista-marco-responsivo.test.ts:119-130; tests/estaticos-web.test.ts:16-29\",\"reversion\":\"revertir el commit del ticket; los nombres viejos siguen existiendo\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T05:18:17.960Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Qué valor toma el token tenue, que hoy pinta texto en 71 reglas, si el «tenue» de design.md no cumple AA como texto?\",\"eleccion\":\"El token tenue toma el valor «atenuado» (#9aaeb4 oscuro, #4a5f66 claro) y el «tenue» de la tabla queda como token aparte tenue-deco solo para bordes y decoración no textual\",\"alternativas\":[\"usar #5f767d/#7d9198 como texto (3.03-3.96, falla AA)\",\"usar #7d949b del boceto solo en oscuro\"],\"criterio\":\"R-MARCO-001 exige contraste AA en modo claro; atenuado da 8.24 y 6.19 sobre el fondo; es lo que los bocetos usan para texto secundario\",\"fuente\":\".valmen/features/rediseno-mission-control/design.md:40; packages/server/web/index.html:19; .valmen/features/rediseno-mission-control/assets/inicio.html:21\",\"reversion\":\"cambiar el valor del token tenue en :root y en el bloque claro de index.html\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T05:19:52.257Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T05:23:19.106Z",
    "action": "reviewer-rejected",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TEMA-TOKENS-20261014-plan-1\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"reviewerModel\":\"claude-sonnet-5-5\",\"reason\":\"C13 y la compatibilidad hacia atrás tienen respaldo en el plan. El artefacto no contiene el diagnóstico, así que no se puede confirmar que el plan responda a él. Basta una proposición sin respaldo para rechazar.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T05:33:42.822Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"C3 tiene una prueba WCAG concreta en el paso 1 y el plan trata de forma explícita los dos fallos de contraste conocidos. La compatibilidad hacia atrás se apoya en que se conservan los nombres de los tokens, en que las fuentes van en una lista aparte, en las pruebas existentes que se ejecutan sin editarlas y en un rollback claro.\",\"planHash\":\"sha256:3dd6f786b84c938630820fb79335e0aa91be5cfef4240264cd2d526926fdb3d4\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TEMA-TOKENS-20261014-plan-2\",\"receiptStateHash\":\"sha256:1276662262c66d956e6806b9703af5d06cf0cdc2f833dbe1cc6b084acdf03df4\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T05:34:38.603Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:3dd6f786b84c938630820fb79335e0aa91be5cfef4240264cd2d526926fdb3d4."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T05:34:38.603Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T05:34:54.762Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T05:43:10.625Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T05:43:11.006Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T05:43:11.359Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T05:43:11.705Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T05:44:16.863Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T05:44:27.625Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T05:45:10.950Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T05:45:48.498Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":680,\"borradas\":62,\"total\":742,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
