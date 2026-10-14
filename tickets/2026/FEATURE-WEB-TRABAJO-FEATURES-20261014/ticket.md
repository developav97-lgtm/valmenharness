---
schema_version: 2
id: FEATURE-WEB-TRABAJO-FEATURES-20261014
title: Features con estado y tablero de recorrido y siguiente paso
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

# FEATURE-WEB-TRABAJO-FEATURES-20261014

## Solicitud original

Parte del sprint: Trabajo rediseñado: Tickets y detalle con el ciclo de ocho pasos, Features con su tablero y Portafolio por tarjetas.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-TRA-003: Features DEBE listar las features con su estado y abrir su tablero con el recorrido y el siguiente paso
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Features DEBE listar las features con su estado y abrir su tablero con el recorrido y el siguiente paso
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
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/features.html` — Boceto aprobado por el PO el 2026-10-14: Features y su tablero (HTML autónomo, el original) (sha256 4870e53da503…)
- `.valmen/features/rediseno-mission-control/assets/features.png` — Captura a 1440 px del boceto aprobado: Features y su tablero (sha256 8b8ee6831572…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: solo la vista Trabajo › Features de Mission Control (`#/features` y `#/feature/<slug>`) en `packages/server/web/index.html` —`vistaFeatures`, `vistaFeature` y las funciones que ellas usan (`marcasArtefactos`, `panelResumen`, `panelRequisitos`, `panelTablero`, `panelGrafo`, `barraDeProgreso`, `moverFeature`, `descomponerFeature`)— y la proyección de solo lectura `packages/server/src/features.ts`, que hoy no entrega los adjuntos. Cubre R-TRA-003 entero y la parte de R-MARCO-006 que toca a esta pantalla (390 px sin desplazamiento horizontal de la página). El menú, el tema y el perfil activo ya están en `main` (FEATURE-WEB-MENU-GRUPOS-20261014) y no se tocan. Modo: harness completo, porque es una funcionalidad de una feature descompuesta y el ticket ya existe.
- Usuario o rol afectado: el PO o desarrollador que sigue el avance de las features desde Mission Control, en escritorio y en el celular.
- Comportamiento actual: `#/features` pinta cinco tarjetas de métricas y una tabla de ocho columnas (Feature, Estado, Artefactos, Requisitos, Progreso, Huecos, Actualizada, Ver) con el estado crudo del registro (`decomposed`, `complete`) y las once features mezcladas, completas incluidas. Para ver una feature hay que ir a `#/feature/<slug>`, que es otra página con pestañas (Tablero por estado, Resumen, Requisitos, Grafo, Brief, Diseño, tickets.yaml, spec). Ninguna de las dos dice **en qué paso del recorrido está la feature ni cuál es el siguiente**: con vista-agentes 11 de 11 tickets cerrados y sin `verify.md`, la pantalla dice «decomposed» y nada más. A 390 px la tabla de ocho columnas es más ancha que la pantalla.
- Comportamiento esperado (boceto aprobado `.valmen/features/rediseno-mission-control/assets/features.html` y su captura `features.png`): cabecera «Trabajo · Features» con el título «Features», el interruptor «Mostrar completas» (apagado oculta las completas) y el botón «Nueva feature»; una rejilla de tarjetas, una por feature, con la marca de estado en palabras («falta verificar», «descompuesta», «completa»…), la fecha, el título y el slug; la feature elegida resaltada y, debajo, su tablero: slug, título, «N/M tickets cerrados», el recorrido de seis pasos (Brief, Spec, Diseño, Grafo, Tickets, Verificación) con «✓ hecho», «✓ N de M» o «falta» y el paso actual resaltado, una franja con el siguiente paso y su acción («Todos los tickets están cerrados. Falta escribir la verificación…» → «Verificar la feature»), los tickets agrupados por sprint con «cerrados/total» y un icono de color por estado (listo para empezar, en curso, esperando a otro, cerrado), y el pie con la leyenda y los adjuntos («Adjuntos: 1 prototipo»). En el celular las rejillas pasan a una columna sin desplazamiento horizontal.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es un requisito nuevo, no un defecto. La lista se pinta en `vistaFeatures` (`packages/server/web/index.html:4808-4933`) desde `GET /api/features` (`index.html:4812` → `packages/server/src/server.ts:754-765` → `listFeatureRows`/`summarizeFeatures`, `packages/server/src/features.ts:282-300`), y el detalle en `vistaFeature` (`index.html:5074-5186`) desde `GET /api/features/:slug` (`server.ts:956-970` → `readFeatureDetail`, `features.ts:306-400`). El estado se muestra crudo (`index.html:4875`, `index.html:5085`) y los artefactos como marcas sueltas (`marcasArtefactos`, `index.html:4794-4806`): no hay ningún cálculo de «paso actual» ni de «siguiente paso» ni en la interfaz ni en el motor (la búsqueda de `nextStep` en `packages/engine/src` solo da tickets, `next-step.ts`). Los datos para derivarlo **ya los entrega el servidor**: `hasSpec`, `hasDesign`, `hasDecomposition`, `hasVerify` (`features.ts:41-71`, de `FeatureArtifacts`, `packages/engine/src/features.ts:61-124`), `tickets` y `closedTickets` (`features.ts:230-240`), y por sprint cada ticket con `exists`, `state` y `dependsOn` (`features.ts:92-105`, `:345-360`). Lo único que falta es el adjunto: el motor sabe `hasAssets` (`engine/src/features.ts:123`) y `listFeatureAssets` lee el manifiesto con su `kind` (`packages/engine/src/feature-assets.ts:45-56`, `:109-135`), pero `toRow` no copia `hasAssets` (`features.ts:248-262`) y el detalle no lee el manifiesto, así que «Adjuntos: 1 prototipo» no se puede pintar sin un campo de solo lectura en la proyección. Las acciones del boceto existen en el CLI y no en el servidor: «Verificar la feature» es `valmen feature verify <slug>` (`packages/cli/src/features.ts:200-224`, escribe `verify.md` con `writeFeatureVerify`, `engine/src/feature-verify.ts:212`) y «Nueva feature» es `valmen feature new <slug> --title <título>` (`cli/src/features.ts:302-320`); el servidor solo expone `transition`, `materialize` y `decompose` (`server.ts:768-950`). Datos reales hoy (proyección de `listFeatureRows` sobre este registro): vista-agentes `decomposed` 11/11 sin `verify.md` (el «falta verificar» del boceto), perfiles-de-modelos 10/10, aprobacion-autonoma-de-planes 9/9 y skills-de-terceros-y-ux 6/6 también sin `verify.md`, rediseno-mission-control 0/13, y seis `complete`.
- Hipótesis pendientes: (1) el boceto marca «descompuesta» a tres features que, con los datos reales, tienen todos sus tickets cerrados y no tienen `verify.md`; si la marca sale del recorrido, las cuatro dirán «falta verificar». Se elige derivar la marca del paso actual (el dato manda sobre el ejemplo del boceto) y se registra como decisión del agente. (2) El diseño es opcional en el motor (aprobacion-autonoma-de-planes está `decomposed` sin `design.md`; `advanceFeature` no lo exige, `engine/src/features.ts:278-330`): un Diseño ausente con el grafo ya escrito se muestra «sin diseño» y no es el paso actual. (3) El boceto pone lista y tablero en la misma página; hoy son dos rutas. Se conserva `#/feature/<slug>` (lo usan enlaces y el ruteo, `index.html:11786-11788`) y las dos rutas pintan la misma página: `#/features` elige la primera feature visible y `#/feature/<slug>` la indicada. (4) El boceto no muestra las pestañas actuales (Resumen con «Mover a» y «Descomponer», Requisitos, Grafo, Brief, Diseño, tickets.yaml, spec) ni el tablero por estado con «Escribir los N que faltan»: son funciones que existen y que nadie pidió quitar, y `tests/tablero-feature.test.ts` fija sus textos; se conservan debajo del tablero en un bloque plegable «Más detalle» y se registra como decisión. (5) «Verificar la feature» y «Nueva feature» no tienen ruta en el servidor y el pedido prohíbe crear rutas de escritura: se muestran como el comando CLI copiable. (6) La fecha de la tarjeta sale de `updated` («08 oct»); el boceto pone «—» en tres, que es un valor de ejemplo.
- Consumidores afectados: solo la persona que abre `#/features` o `#/feature/<slug>`. `moverFeature`, `descomponerFeature` y el botón de `materialize` vuelven a llamar a `vistaFeature(slug)` (`index.html:5024`, `:5064`, `:5441`) y buscan `.resultado-feature` (`index.html:5025-5034`): la página nueva tiene que conservar esa firma y esa clase. El ruteo marca la entrada del menú con `nombre === "feature"` (`index.html:11778`). La proyección gana un campo opcional (`hasAssets` en la fila y `assets` en el detalle): `tests/features-view.test.ts` no compara filas enteras con `toEqual` y el CLI no usa `@valmen/server`, así que nadie se rompe. `tests/api-rutas.test.ts:54-57` exige que la interfaz solo llame rutas conocidas: no se agrega ninguna. `scripts/verificar-interfaz.mjs:195-216` da una feature de prueba sin `assets`: la vista tiene que tolerar el campo ausente.
- Archivos y flujo investigados: `packages/server/web/index.html` (vista `:4786-5584`, ruteo `:11770-11801`, tokens de tema `:77-147`, interruptor `.interruptor` `:2501-2512`); `packages/server/src/server.ts:754-970`; `packages/server/src/features.ts` completo; `packages/engine/src/features.ts:61-124`, `:278-330`; `packages/engine/src/feature-assets.ts:45-135`; `packages/engine/src/feature-verify.ts:212-260`; `packages/core/src/feature.ts:34-70` (estados y transiciones); `packages/cli/src/features.ts:40-224`, `:302-320`, `:520-560`; el boceto y su captura; `tests/tablero-feature.test.ts`, `tests/features-view.test.ts`, `tests/interfaz-ejecutable.test.ts`, `tests/api-rutas.test.ts` y `scripts/verificar-interfaz.mjs`. `buscar_memoria` («vista Features tablero web recorrido siguiente paso feature») no devolvió nada de este módulo: los cinco resultados (AP-001, AP-003, AP-011, AP-013, AP-014) son de compuertas y descomposición.
- Riesgos y compatibilidad: (a) otros agentes editan a la vez `packages/server/web/index.html`: el cambio se limita a las funciones de Features y a un bloque de estilos propio con prefijo `.feat-`, y todo ayudante nuevo lleva el prefijo `features…` para no chocar con nombres que otros integren. (b) Las pruebas existentes `tests/tablero-feature.test.ts` fijan textos del tablero por estado («Sin crear · 1», «espera a …», «Escribir los 1 que faltan en el registro»): si se pusieran en rojo, se detiene y se reporta sin editarlas. (c) Colores solo con tokens del tema (`--ok`, `--alerta`, `--acento`, `--error`, `--tenue-deco`) para no romper el modo claro. (d) El portapapeles puede no existir (contexto no seguro, arnés de pruebas): el comando se muestra siempre como texto seleccionable y «Copiar» degrada sin error. (e) Un manifiesto de adjuntos ilegible lanza en `listFeatureAssets`: la proyección lo atrapa y deja `assets` vacío para que la página no se caiga.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambia el HTML estático de Mission Control y un campo de solo lectura de la proyección del servidor; no hay rutas nuevas, ni datos, ni migración, ni contenedores, ni despliegue.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: la vista Trabajo › Features de `packages/server/web/index.html` —`vistaFeatures()` y `vistaFeature(slug)`, que pasan a pintar la misma página, más ayudantes nuevos con prefijo `features…` y un bloque de estilos propio con prefijo `.feat-`— y la proyección de solo lectura `packages/server/src/features.ts` (campo `hasAssets` en la fila y `assets` en el detalle). Una prueba nueva `tests/trabajo-features.test.ts`. Se reutilizan sin cambiar su llamada al servidor `moverFeature`, `descomponerFeature`, `panelResumen`, `panelRequisitos`, `panelTablero`, `panelGrafo` y `bloqueCrudo`. Exclusiones: rutas nuevas del servidor (D-005), el menú, el tema y el perfil activo (ya en `main`), y las demás vistas que otros agentes editan a la vez en el mismo archivo: no se mueve ni se reformatea código ajeno.
- Decisiones registradas: D-001 (marca de la tarjeta según el paso actual), D-002 (seis pasos; Diseño opcional nunca es el paso actual), D-003 (una página para `#/features` y `#/feature/<slug>`), D-004 (pestañas actuales en «Más detalle», plegado; «Tablero» pasa a «Por estado»), D-005 (Verificar, Nueva y Completar como comando CLI copiable), D-006 (adjuntos por campo de solo lectura en la proyección) y D-007 (fecha `updated` corta; «Mostrar completas» oculta `complete` y `archived` salvo la elegida).
- Diferencias con el boceto (cada una con su decisión): (1) la marca de tres tarjetas dirá «falta verificar» y no «descompuesta», porque sus tickets están todos cerrados (D-001); (2) las tarjetas muestran la fecha `updated` donde el boceto pone «—» (D-007); (3) debajo del tablero queda el bloque plegable «Más detalle» con las pestañas actuales (D-004); (4) «Verificar la feature» y «Nueva feature» muestran el comando copiable en vez de ejecutar (D-005); (5) el Diseño ausente dice «opcional» (D-002); (6) los títulos de sprint usan el `goal` real del `tickets.yaml`, más largo que los del boceto. El menú lateral del boceto ya está en `main` y no es de este ticket.
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Estado crudo y tabla de ocho columnas (`index.html:4808-4933`): pasos 3 y 4 con D-001 y D-007; lo comprueba el paso 1 (C1-C3).
  - Lista y detalle en dos páginas (`index.html:5074-5186`): paso 5 con D-003; lo comprueba el paso 1 (C4, C5).
  - Ningún cálculo de paso actual ni siguiente paso: pasos 2 y 5 con D-002; lo comprueba el paso 1 (C6-C9).
  - Acciones sin ruta en el servidor (`cli/src/features.ts:200`, `:302`): paso 5 con D-005; lo comprueba el paso 1 (C10, C11).
  - Tickets por sprint sin estado de color (`index.html:5326-5463` agrupa por estado, no por sprint): paso 5; lo comprueba el paso 1 (C12, C13).
  - Adjuntos sin proyectar (`features.ts:248-262`): paso 6 con D-006; lo comprueba el paso 1 (C14-C16).
  - Pestañas actuales y textos que fija `tests/tablero-feature.test.ts`: paso 5 con D-004; lo comprueba el paso 8 (C20).
  - Tabla más ancha que 390 px: paso 7; lo comprueban el paso 1 (C17) y el paso 9 (C18).
- Pasos ordenados:
  1. Escribir `tests/trabajo-features.test.ts` y verlo en rojo con `npx vitest run tests/trabajo-features.test.ts`, antes de tocar el código. Interfaz ejecutada con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs` y respuestas simuladas de `GET /api/features` y `GET /api/features/:slug` con cinco features: `vista-agentes` (`decomposed`, 3/3 cerrados, sin `verify.md`, con diseño y un adjunto `prototipo`), `perfiles` (`decomposed`, sin diseño, un ticket cerrado, uno en curso, uno listo y uno esperando), `rediseno` (`decomposed`, un ticket sin crear), `borrador` (`draft`, sin spec) y `autonomia` (`complete`, con `verify.md`). Casos: una tarjeta por feature visible con su título y su slug (C1); tabla de casos de la marca de cada tarjeta: «falta verificar», «descompuesta», «borrador», «completa», «por completar» (C2); el interruptor «Mostrar completas» apagado no pinta `autonomia` y encendido sí (C3); la tarjeta elegida lleva `aria-current` (C4); `#/features` abre el tablero de la primera visible y `#/feature/perfiles` el de `perfiles` (C5); el tablero dice «3/3» y «tickets cerrados» (C6); el recorrido pinta Brief, Spec, Diseño, Grafo, Tickets y Verificación con «✓ hecho», «✓ 3 de 3», «falta» u «opcional» (C7); tabla de casos del paso con `aria-current="step"` por feature (C8); tabla de casos de la franja del siguiente paso: «Todos los tickets están cerrados», «Falta la spec», «Descomponer», «sin escribir en el registro», «La verificación está escrita» (C9); el clic en «Verificar la feature» pinta `valmen feature verify vista-agentes` (C10); el clic en «Nueva feature» pinta `valmen feature new` (C11); los sprints se pintan con su nombre y «cerrados/total» (C12); tabla de casos del rótulo de cada ticket: «cerrado», «en curso», «listo para empezar», «esperando a otro», «sin crear» (C13); el pie dice «Adjuntos: 1 prototipo» (C14). Proyección (`readFeatureDetail` y `listFeatureRows` sobre un laboratorio en `tmpdir` como `tests/features-view.test.ts`): con un `assets/manifest.json` el detalle trae el adjunto con su `kind` y la fila `hasAssets: true` (C15); con un manifiesto ilegible el detalle se lee y `assets` sale vacío (C16). Lectura de `index.html` como texto: las reglas de `.feat-tarjetas` y `.feat-sprints` usan `repeat(auto-fill|auto-fit, minmax(min(100%, …), 1fr))` (C17).
  2. `index.html`, ayudantes puros nuevos: `featuresRecorrido(f)` → seis pasos `{ nombre, marca, estado: "hecho" | "falta" | "opcional" | "actual" }` (D-002); `featuresMarca(f)` → `{ texto, tono }` (D-001); `featuresFecha(iso)` → «08 oct» (D-007); `featuresEstadoTicket(t, porId)` → `cerrado | en-curso | listo | espera | sin-crear | bloqueado` con su rótulo; `featuresSiguientePaso(f)` → `{ fuerte, texto, accion }` (D-002, D-005) (C2, C7-C9, C13).
  3. `index.html`, `featuresComando(texto)`: el comando en `<code>` seleccionable con botón «Copiar» que usa `navigator.clipboard` dentro de `try/catch` y dice «Copiado» o «Selecciónalo y cópialo» (D-005) (C10, C11).
  4. `index.html`, `featuresPagina(slug)` llamada por `vistaFeatures()` y `vistaFeature(slug)`: pide `GET /api/features` y, para la elegida, `GET /api/features/:slug`; cabecera «Trabajo · Features», `<h1>Features</h1>`, interruptor `role="switch"` «Mostrar completas» (estado en la variable de módulo `featuresVerCompletas`, D-007) y botón «Nueva feature» que abre `featuresComando('valmen feature new <slug> --title "<título>"')`; rejilla `.feat-tarjetas` con un `<a href="#/feature/<slug>">` por feature visible con marca, fecha, título y slug, y `aria-current="true"` en la elegida (C1-C5, C11).
  5. `index.html`, tablero `.feat-tablero` de la elegida: slug, `<h2>` con el título, «N/M» y «tickets cerrados»; los avisos que ya existen (feature inválida, `tickets.yaml` ilegible, huecos, ciclos) se conservan; recorrido `<ol aria-label="Recorrido de la feature">` con `aria-current="step"` en el paso actual; franja del siguiente paso con su acción: «Descomponer» (reusa `descomponerFeature`), «Escribir los N que faltan» (`POST /api/features/:slug/materialize`, ruta existente), «Verificar la feature» y «Completar la feature» (comando copiable); los sprints en `.feat-sprints`, cada uno con «Sn · goal» y «cerrados/total», y cada ticket con icono `role="img"` y `aria-label` de su estado, título y enlace `#/ticket/<id>` si existe; el pie con la leyenda y «Adjuntos: …» contados por `kind`; debajo, `<details class="feat-detalle">` «Más detalle» con la barra de pestañas actual, «Tablero» renombrada «Por estado» (D-004). `moverFeature`, `descomponerFeature` y el botón de `materialize` siguen repintando con `vistaFeature(slug)` y escribiendo en `.resultado-feature` (C5-C10, C12-C14, C20).
  6. `packages/server/src/features.ts`: `hasAssets` en `FeatureListRow` (de `fila.artifacts.hasAssets`) y `assets: { path, kind, description }[]` en `FeatureDetail`, leídos con `listFeatureAssets` de `@valmen/engine` dentro de `try/catch` que deja `[]` (D-006). Sin rutas nuevas (C15, C16).
  7. `index.html`, estilos `.feat-*` solo con tokens del tema (`--panel`, `--panel-alto`, `--borde`, `--texto`, `--tenue`, `--tenue-deco`, `--acento`, `--acento-suave`, `--alerta`, `--alerta-suave`, `--ok`, `--error`, `--fuente-titulo`, `--mono`); rejillas con `repeat(auto-fill, minmax(min(100%, 250px), 1fr))` para las tarjetas, `repeat(auto-fit, minmax(min(100%, 120px), 1fr))` para el recorrido y `repeat(auto-fit, minmax(min(100%, 260px), 1fr))` para los sprints; el interruptor reusa la clase `.interruptor` que ya existe (C17-C19).
  8. Regresión: `npx vitest run tests/trabajo-features.test.ts tests/tablero-feature.test.ts tests/features-view.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/menu-grupos.test.ts tests/vista-marco-responsivo.test.ts` y `node scripts/verificar-interfaz.mjs` («Interfaz verificada.»); si una prueba existente se pone en rojo, se detiene y se reporta en el ticket sin editarla (C20).
  9. Verificación en el navegador con `npm run build` y `node packages/cli/dist/main.js serve` desde el worktree: `#/features` y `#/feature/vista-agentes` a 1440 px contra `.valmen/features/rediseno-mission-control/assets/features.png`, en modo oscuro y claro (C19); a 390 px sin desplazamiento horizontal de la página (C18); `revisar_presentacion` sin avisos de color; capturas como evidencia del ticket.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`).
- Tamaño previsto: unas 580 líneas (unas 270 de producción —250 en `index.html` entre vista y estilos, 20 en `features.ts`— y unas 310 de pruebas); 20 criterios.
- Si excede el tope: no excede el tope (`delivery-budget: 600`; 20 criterios, el tope del precheck). Si la implementación pasa de 600 líneas, sigue: la página vive en `vistaFeatures`/`vistaFeature`, sus ayudantes y su bloque de estilos, y el campo de adjuntos no tiene uso sin el pie que lo pinta; no hay un corte que deje a cada parte con su código y sus pruebas.
- Rollback (obligatorio): revertir el commit del ticket en su rama; no hay datos, esquema, configuración ni rutas que deshacer.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 (R-TRA-003): la vista Features pinta una tarjeta por cada feature visible
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C2 (R-TRA-003): la marca de cada tarjeta dice el estado de la feature en palabras según su paso actual
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C3 (R-TRA-003): el interruptor «Mostrar completas» decide si se ven las features completas
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C4 (R-TRA-003): la tarjeta de la feature abierta queda marcada como la elegida
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C5 (R-TRA-003): al elegir una feature se abre su tablero en la misma página
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C6 (R-TRA-003): el tablero dice cuántos tickets del grafo están cerrados
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C7 (R-TRA-003): el recorrido muestra los seis pasos de la feature con su marca
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C8 (R-TRA-003): el recorrido resalta el paso en que está la feature
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C9 (R-TRA-003): la franja del siguiente paso dice qué falta según el paso actual
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C10 (R-TRA-003): «Verificar la feature» muestra el comando `valmen feature verify` de esa feature
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C11 (R-TRA-003): «Nueva feature» muestra el comando `valmen feature new`
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C12 (R-TRA-003): los tickets del tablero se agrupan por sprint con su cuenta de cerrados
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C13 (R-TRA-003): cada ticket del tablero muestra un rótulo con su estado de trabajo
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C14 (R-TRA-003): el pie del tablero cuenta los adjuntos de la feature por tipo
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C15 (R-TRA-003): el detalle de una feature en la API entrega los adjuntos de su manifiesto
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C16 (R-TRA-003): un manifiesto de adjuntos ilegible no impide abrir la feature
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C17 (R-MARCO-006): las rejillas del tablero pasan a una columna cuando el ancho no da para dos
      <!-- test: npx vitest run tests/trabajo-features.test.ts -->
- [x] C18 (R-MARCO-006): a 390 px la pantalla de Features no tiene desplazamiento horizontal de la página
      <!-- verify: manual -->
- [x] C19 (R-TRA-003): a 1440 px la pantalla se ve como `features.png` en los dos modos del sistema
      <!-- verify: manual -->
- [x] C20 (R-TRA-003): las pruebas existentes de la interfaz siguen en verde sin editarse
      <!-- test: npx vitest run tests/tablero-feature.test.ts tests/features-view.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/menu-grupos.test.ts tests/vista-marco-responsivo.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Estado: terminada (pasos 1-9 del plan), sin desvíos del plan aprobado y sin pruebas existentes en rojo.
- Prueba primero: `tests/trabajo-features.test.ts` escrita antes del código y vista en rojo, 17 de 17 (`npx vitest run tests/trabajo-features.test.ts`). Durante la implementación se corrigió un dato de esa prueba nueva (no de una existente): el caso «N de M tickets cerrados» de C9 usaba `perfiles`, que tiene un ticket sin crear y por eso dice con razón «sin escribir en el registro»; se agregó la feature simulada `encurso` para ese caso.
- `packages/server/src/features.ts`: `hasAssets` en `FeatureListRow` y `assets` (`path`, `kind`, `description`) en `FeatureDetail`, leídos con `listFeatureAssets` dentro de `adjuntosDe`, que deja `[]` si el manifiesto no se puede leer (D-006). No hay rutas nuevas.
- `packages/server/web/index.html`: `vistaFeatures()` y `vistaFeature(slug)` pintan la misma página con `featuresPagina(slug)` (D-003); ayudantes nuevos con el prefijo `features…`: `featuresFecha`, `featuresTerminada`, `featuresRecorrido` (D-002), `featuresMarca` (D-001), `featuresTicketCerrado`, `featuresEstadoTicket`, `featuresSiguientePaso`, `featuresAdjuntos`, `featuresComando` (D-005), `featuresTablero` y `featuresPestanas` (D-004; «Tablero» pasa a llamarse «Por estado»), más la variable `featuresVerCompletas` y las constantes `FEATURES_ESTADOS`, `FEATURES_MESES` y `FEATURES_PLURALES` (D-007). Bloque de estilos propio `.feat-*`, solo con tokens del tema; el interruptor reusa `.interruptor`. Se quitaron `marcasArtefactos`, `barraDeProgreso` y su CSS `.barra-progreso`, que solo usaba la tabla anterior. `moverFeature`, `descomponerFeature`, `panelResumen`, `panelRequisitos`, `panelTablero`, `panelGrafo` y `bloqueCrudo` siguen sin cambios.
- Sin «<» seguido de «!--» literal en el script; `revisar_presentacion`: «Colores fijos — nada que avisar»; `valmen secrets`: sin secretos.
- Navegador (paso 9): Chrome sin pantalla por CDP contra `node packages/cli/dist/main.js serve --port 4188` del worktree, con los datos reales del registro (11 features) y solo lectura: 1440 px en oscuro y en claro, y 390 px con `scrollWidth` 390 (sin desplazamiento horizontal); con «Mostrar completas» encendido se ven las 11 tarjetas; «Verificar la feature» muestra `valmen feature verify vista-agentes`; «Nueva feature» muestra `valmen feature new <slug> --title "<título>"`; «Más detalle» trae las pestañas de antes. Capturas en `evidencia/`. Ajuste tras mirar la captura: el `goal` del sprint se recorta a dos renglones, con el texto completo en el `title`.
- Tamaño real: `index.html` con unas 620 líneas añadidas y 200 quitadas (parte es el bloque de pestañas que se movió a `featuresPestanas`), `features.ts` +27 y la prueba 475; por encima de las 580 previstas. Sigue, como decía el plan: la página vive en las dos vistas, sus ayudantes y su bloque de estilos.
- Diferencias con el boceto: (1) la marca de tres tarjetas dice «falta verificar» y no «descompuesta», porque sus tickets están todos cerrados y no tienen `verify.md` (D-001); (2) las tarjetas muestran la fecha `updated` donde el boceto pone «—» (D-007); (3) debajo del tablero queda el bloque plegable «Más detalle» con las pestañas de antes (D-004); (4) «Verificar la feature», «Nueva feature» y «Completar la feature» muestran el comando copiable en vez de ejecutarlo (D-005); (5) si falta el Diseño, ese paso dice «opcional» (D-002); (6) los títulos de sprint usan el `goal` real, recortado a dos renglones; (7) `#/features` elige la primera feature visible, que hoy es rediseno-mission-control y no vista-agentes (D-003); (8) los iconos de cada ticket son glifos de texto (✓ ◐ ○ … ·) coloreados con tokens, no SVG.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-trabajo-features` (o la raíz del repositorio tras integrar).
- Requisitos de ambiente: Node 24 con `npm install` hecho; `npm run build` antes del verificador y de lo manual; para lo manual, `node packages/cli/dist/main.js serve --port 4188` y Chrome. Solo se mira: los botones «Descomponer» y «Escribir los N que faltan» escriben en `.valmen/features` y en el registro, y no hacen falta para validar.
- Comandos y resultado esperado:
  1. `npx vitest run tests/trabajo-features.test.ts` → 17 de 17 en verde (C1-C17).
  2. `npx vitest run tests/tablero-feature.test.ts tests/features-view.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/menu-grupos.test.ts tests/vista-marco-responsivo.test.ts` → todas en verde, sin editarlas (C20).
  3. `node scripts/verificar-interfaz.mjs` → «vistas ejecutadas: 14» e «Interfaz verificada.».
- Validaciones manuales (en http://127.0.0.1:4188/#/features):
  - A 1440 px, en oscuro y en claro, `#/feature/vista-agentes` se ve como `.valmen/features/rediseno-mission-control/assets/features.png`, con las diferencias de «Implementación» (C19; `evidencia/features-1440-oscuro.png`, `evidencia/features-1440-claro.png`).
  - A 390 px la página no se desplaza a lo ancho (C18; `evidencia/features-390-oscuro.png`, `evidencia/features-390-claro.png`).
  - «Mostrar completas» muestra y oculta las seis completas; elegir una tarjeta abre su tablero debajo; «Verificar la feature» muestra el comando con «Copiar» (`evidencia/features-verificar.png`).
- Resultado local: los comandos 1-3 pasaron y las validaciones manuales se hicieron con Chrome sin pantalla por CDP (ver Evidencia).

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
    "kind": "test",
    "description": "npx vitest run tests/trabajo-features.test.ts → 17 de 17 en verde (C1-C17); antes de tocar el código, 17 de 17 en rojo.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "test",
    "description": "Regresión C20: npx vitest run tests/trabajo-features.test.ts tests/tablero-feature.test.ts tests/features-view.test.ts tests/interfaz-ejecutable.test.ts tests/api-rutas.test.ts tests/menu-grupos.test.ts tests/vista-marco-responsivo.test.ts → 7 archivos, 118 de 118, sin editar ninguna existente; npm run build y node scripts/verificar-interfaz.mjs → «vistas ejecutadas: 14», «Interfaz verificada.»; npx tsc -p packages/server --noEmit sin errores.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "manual",
    "description": "Chrome sin pantalla por CDP contra serve --port 4188 del worktree, datos reales (11 features), solo lectura: #/feature/vista-agentes a 1440 px en oscuro y claro frente a features.png (evidencia/features-1440-oscuro.png, features-1440-claro.png), con las diferencias listadas en Implementación (C19).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "manual",
    "description": "A 390 px, en oscuro (#/feature/vista-agentes) y claro (#/features), document.documentElement.scrollWidth = 390 = innerWidth: sin desplazamiento horizontal (evidencia/features-390-oscuro.png, features-390-claro.png) (C18).",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "manual",
    "description": "Interacción en Chrome real: 5 tarjetas con «Mostrar completas» apagado y 11 encendido (aria-checked true); «Verificar la feature» muestra valmen feature verify vista-agentes; «Nueva feature» muestra valmen feature new <slug> --title \"<título>\"; «Más detalle» trae Por estado, Resumen, Requisitos, Grafo, Brief, Diseño, tickets.yaml y las specs (evidencia/features-verificar.png). revisar_presentacion: sin colores fijos; valmen secrets: sin secretos.",
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
    "notes": "Subagente del orquestador (corrida orquestada S3): análisis, plan e implementación de este ticket en una sola sesión de subagente; la sesión no expone sus tokens. Las compuertas cascade de analysis y plan tienen su coste en los recibos ($0.000270 y $0.000954).",
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
    "at": "2026-10-14T05:09:28.501Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:56.256Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/features.html, .valmen/features/rediseno-mission-control/assets/features.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T13:41:49.727Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:24.955Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"¿De dónde sale la marca de estado de cada tarjeta de feature?\",\"eleccion\":\"Del paso actual del recorrido: «falta verificar» con todos los tickets cerrados y sin verify.md, «por completar» con verify.md y sin complete, «bloqueada», «completa», «archivada»; si no, el estado del registro en español (borrador, especificada, planeada, descompuesta, en curso)\",\"alternativas\":[\"el estado crudo del registro, como hoy\",\"copiar las marcas del boceto tal cual\"],\"criterio\":\"Con los datos reales cuatro features tienen todos sus tickets cerrados sin verify.md; el boceto marca «descompuesta» a tres de ellas como ejemplo, y el dato manda sobre el ejemplo\",\"fuente\":\"packages/server/src/features.ts:230; packages/engine/src/feature-verify.ts:249\",\"reversion\":\"Cambiar featuresMarca para devolver el estado crudo\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:25.918Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"¿Cómo se ordenan el recorrido y el paso actual de una feature?\",\"eleccion\":\"Seis pasos: Brief (siempre hecho), Spec (hasSpec), Diseño (hasDesign; si falta se muestra «opcional» y nunca es el paso actual), Grafo (hasDecomposition), Tickets (N de M cerrados), Verificación (hasVerify); el paso actual es el primero pendiente de Spec, Grafo, Tickets y Verificación\",\"alternativas\":[\"Diseño obligatorio como paso actual\",\"un paso séptimo Completar en el recorrido\"],\"criterio\":\"El motor no exige design.md para avanzar (aprobacion-autonoma-de-planes está decomposed sin él) y completar exige verify.md y tickets cerrados\",\"fuente\":\"packages/engine/src/features.ts:278; packages/engine/src/feature-verify.ts:249; packages/core/src/feature.ts:59\",\"reversion\":\"Cambiar featuresRecorrido\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:26.833Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"¿Lista y tablero van en una página o en dos rutas?\",\"eleccion\":\"En una página como el boceto: #/features pinta las tarjetas y el tablero de la primera feature visible, y #/feature/<slug> pinta lo mismo con esa feature elegida; las dos rutas siguen existiendo\",\"alternativas\":[\"mantener dos páginas separadas\",\"una sola ruta y redirigir la vieja\"],\"criterio\":\"El boceto pone el tablero bajo las tarjetas; la ruta #/feature/<slug> la usan el ruteo y los botones que repintan con vistaFeature(slug)\",\"fuente\":\"packages/server/web/index.html:11786; packages/server/web/index.html:5024\",\"reversion\":\"Revertir el commit de la vista\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:28.025Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"¿Qué pasa con las pestañas actuales del detalle (Resumen, Requisitos, Grafo, Brief, Diseño, tickets.yaml, spec) y el tablero por estado que el boceto no muestra?\",\"eleccion\":\"Se conservan debajo del tablero en un bloque plegable «Más detalle», cerrado por defecto; la pestaña Tablero pasa a llamarse «Por estado»\",\"alternativas\":[\"quitarlas para que la página sea idéntica al boceto\",\"dejarlas abiertas encima\"],\"criterio\":\"Son funciones vigentes (mover estado, descomponer, escribir tickets, leer specs) que nadie pidió quitar y tests/tablero-feature.test.ts fija sus textos; plegadas no cambian lo que el boceto muestra\",\"fuente\":\"packages/server/web/index.html:5135; tests/tablero-feature.test.ts:120\",\"reversion\":\"Quitar el bloque plegable en vistaFeature\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:29.213Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"¿Cómo se ofrecen «Verificar la feature» y «Nueva feature», que el servidor no expone?\",\"eleccion\":\"Como el comando CLI copiable (valmen feature verify <slug>; valmen feature new <slug> --title \\\"<título>\\\"; y valmen feature advance <slug> --to complete para completar), con botón Copiar que degrada sin error si no hay portapapeles; sin rutas nuevas\",\"alternativas\":[\"crear rutas POST nuevas en el servidor\",\"ocultar los botones\"],\"criterio\":\"El pedido prohíbe rutas de escritura nuevas y tests/api-rutas.test.ts exige que la interfaz llame solo rutas conocidas\",\"fuente\":\"packages/cli/src/features.ts:200; packages/cli/src/features.ts:302; tests/api-rutas.test.ts:54\",\"reversion\":\"Cambiar el botón por una llamada cuando exista la ruta, en otro ticket\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:30.443Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"¿De dónde salen los adjuntos del pie («Adjuntos: 1 prototipo»)?\",\"eleccion\":\"Campo de solo lectura en la proyección: hasAssets en la fila y assets (path, kind, description) en el detalle, leídos con listFeatureAssets; un manifiesto ilegible deja la lista vacía; la vista cuenta por kind\",\"alternativas\":[\"omitir los adjuntos\",\"ruta nueva GET /api/features/:slug/assets\"],\"criterio\":\"El motor ya lee el manifiesto; añadir un campo a una respuesta existente no crea rutas ni escribe nada\",\"fuente\":\"packages/engine/src/feature-assets.ts:109; packages/server/src/features.ts:248\",\"reversion\":\"Quitar los dos campos de packages/server/src/features.ts\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T13:44:31.617Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"¿Qué fecha lleva cada tarjeta y en qué orden van?\",\"eleccion\":\"La fecha updated en formato corto («08 oct»); el orden es el que entrega GET /api/features; «Mostrar completas» apagado oculta complete y archived salvo la feature elegida por la ruta\",\"alternativas\":[\"fecha «—» como en el boceto\",\"ordenar en el cliente\"],\"criterio\":\"updated es el único dato de fecha de la fila; el «—» del boceto es un valor de ejemplo\",\"fuente\":\"packages/server/src/features.ts:45\",\"reversion\":\"Cambiar featuresFecha\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:17.816Z",
    "action": "analysis-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El diagnóstico nombra la causa con precisión: es un requisito nuevo. Indica qué falta (el cálculo de paso actual y siguiente, y el campo de adjuntos) y dónde, con referencias ruta:línea, datos reales y funciones concretas. Es comprobable y no vago.\",\"planHash\":\"sha256:556802ea44b44cd8a06e1012df98877d9d2ceadcf8fa71212ba30f0c2de9850d\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"analysis\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TRABAJO-FEATURES-20261014-analysis-2\",\"receiptStateHash\":\"sha256:a3514009801a57f2df139cba576792b5451dad4f5fd314ac7f9ca188158a0673\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:29.120Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T13:49:18.357Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:556802ea44b44cd8a06e1012df98877d9d2ceadcf8fa71212ba30f0c2de9850d\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TRABAJO-FEATURES-20261014-plan-1\",\"receiptStateHash\":\"sha256:a3514009801a57f2df139cba576792b5451dad4f5fd314ac7f9ca188158a0673\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T13:49:18.756Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:556802ea44b44cd8a06e1012df98877d9d2ceadcf8fa71212ba30f0c2de9850d."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T13:49:18.756Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T13:49:28.304Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T14:04:01.862Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T14:04:02.270Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T14:04:02.675Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T14:04:03.396Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T14:04:03.964Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-14",
    "at": "2026-10-14T14:06:36.401Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-14",
    "at": "2026-10-14T14:06:37.314Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
