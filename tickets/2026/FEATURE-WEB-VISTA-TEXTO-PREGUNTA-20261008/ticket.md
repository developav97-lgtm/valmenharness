---
schema_version: 2
id: FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008
title: Vista muestra el texto de la pregunta y la respuesta
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

# FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008

## Solicitud original

Parte del sprint: Opción B: texto de la pregunta y la respuesta, solo con la decisión escrita del PO en el ticket.
- R-DAT-004: El endpoint PUEDE exponer el texto de la pregunta y la respuesta solo con decisión escrita del PO
- R-ESC-007: El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo
Depende de: FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El endpoint PUEDE exponer el texto de la pregunta y la respuesta solo con decisión escrita del PO El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-DAT-004: lo cubre FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008 (Lector expone texto de pregunta y respuesta con lista blanca ampliada, bajo decisión escrita del PO)
- R-ESC-007: lo cubre FEATURE-WEB-VISTA-LIENZO-20261008 (Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados)

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- **Decisión del PO que habilita el texto (R-DAT-004):** ya registrada en FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008 (cita literal: «Habilita la opción B yo lo cocaria a los dos deberia ser multiproyecto , siempre activa en 127.0.0.1»). Este ticket solo la consume; no la amplía.
- **Supuesto 1 (decidido por Claude por delegación del PO, 2026-10-09, sujeto a su revisión: opción por defecto) — qué mundos dibujan el texto dentro del lienzo.** El prototipo (`.valmen/features/vista-agentes/assets/vista-agentes.html:406`) solo escribe el texto de la pregunta en la franja del centro de control; la pastelería y el invernadero no escriben texto en el lienzo y se apoyan en el aviso sobre el lienzo (`vista-agentes.html:505-509`), que es común a los tres mundos. Pregunta al PO: ¿basta con el aviso en los tres mundos más la franja del centro de control, o quieres además un bocadillo con el texto dentro de la pastelería y del invernadero? Opción por defecto: la del prototipo (aviso en los tres + franja del centro de control; sin bocadillo nuevo).
- **Supuesto 2 (decidido por Claude por delegación del PO, 2026-10-09, sujeto a su revisión: opción por defecto) — largo del texto en la franja del lienzo.** El servidor entrega hasta 500 caracteres (`packages/server/src/agentes.ts:49`) y la franja del prototipo mide 912 px a 12 px de letra (~110 caracteres). Pregunta al PO: ¿se recorta en la franja al ancho disponible con «…», dejando el texto completo en el aviso? Opción por defecto: sí, recorte con «…» en la franja y texto completo (con salto de línea) en el aviso.
- **Supuesto 3 (decidido por Claude por delegación del PO, 2026-10-09, sujeto a su revisión: opción por defecto) — sin texto, la franja del centro de control.** Hoy la franja inventa la pregunta según la estación («¿Apruebo el plan?» / «¿Pasaron tus pruebas?», `packages/server/web/agentes/mundos/control.js:127`). Pregunta al PO: cuando `texto` no llega (servidor fuera de loopback), ¿se conserva ese texto inferido como hoy? Opción por defecto: sí, se conserva tal cual; con `texto` presente, la franja muestra el texto real.

## Descripción funcional

- Alcance: la vista «Agentes» de `valmen serve` (pestaña Corrida → Agentes) muestra el texto real de la pregunta pendiente (`pregunta.texto`) y, cuando llega, el de la respuesta (`pregunta.respuesta`) en el aviso sobre el lienzo de los tres mundos y en la franja del centro de control, como en el prototipo aprobado. Solo cambia la presentación web; el endpoint ya entrega los campos (FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008, en main desde a20b391).
- Usuario o rol afectado: el PO o responsable que mira la corrida desde su máquina (servidor en 127.0.0.1) y debe contestar la pregunta de un agente.
- Comportamiento actual: el aviso dice «Pregunta pendiente para una persona», el ticket, «hace N s» y la expresión del mundo; al responder dice «una persona respondió». Nunca muestra qué se preguntó ni qué se contestó, aunque la fila ya traiga `texto` y `respuesta`. La franja del centro de control muestra una pregunta inferida de la estación, no la real.
- Comportamiento esperado: con `pregunta.texto` en la fila, el aviso pendiente añade una línea con ese texto y la franja del centro de control lo usa en lugar del inferido; con `pregunta.respuesta`, el aviso «respondió» añade una línea con la respuesta. Sin esos campos (servidor fuera de loopback, R-DAT-002) la vista queda exactamente como hoy. El texto viene de transcripts y se pinta siempre como texto plano (`textContent` en el DOM, `fillText` en el lienzo), nunca como HTML.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es funcionalidad nueva, no un defecto; la causa de que el texto no se vea es que ningún consumidor web lee los campos nuevos. `avisosDePregunta` (`packages/server/web/agentes/montaje.js:52-79`) arma el aviso solo con `desde` y `respondidaEn` y descarta `texto` y `respuesta`; `pintarAvisos` (`packages/server/web/index.html:6454-6462`) pinta solo `encabezado`, `ticket · hace` y `expresion`; `franja` (`packages/server/web/agentes/mundos/control.js:123-131`) construye la pregunta a partir de la estación (`esperando.estacion === 3 ? "¿Apruebo el plan?" : "¿Pasaron tus pruebas?"`). El servidor sí entrega los campos: `PreguntaPendiente` (`packages/server/src/agentes.ts:61-66`), `preguntaDe` (`packages/server/src/agentes.ts:443-454`) y `conTexto: context.writeToken === undefined` (`packages/server/src/server.ts:1043`), recortados a 500 caracteres por `recortar` (`packages/server/src/agentes.ts:69-73`).
- Hipótesis pendientes: ninguna sobre la causa. Quedan como supuestos de diseño (arriba) qué mundos escriben texto dentro del lienzo, el recorte en la franja y la franja sin texto.
- Consumidores afectados: `avisosDePregunta` (montaje.js) y su único llamador `pintarLienzoDeAgentes` en `index.html:6444-6499`; `franja` y su uso en el dibujo del centro de control (`control.js`); las pruebas `tests/vista-lienzo.test.ts:185-208` (avisos) y `tests/mundo-control.test.ts:167-176` (franja C18/C19), que deben seguir pasando sin texto. La pastelería (`mundos/pasteleria.js:117-136`) y el invernadero (`mundos/invernadero.js:98-120`) leen `pregunta` solo para el «?» y la ventanilla; no cambian con la opción por defecto. El tipo `FilaDeAgente` (`packages/server/web/agentes/motor.d.ts:28-36`) no declara `pregunta`; el motor no la usa.
- Archivos y flujo investigados: endpoint `/api/agentes` → `listarAgentes` con `conTexto` solo en loopback (`server.ts:1023-1043`) → fila con `pregunta { desde, respondidaEn, texto?, respuesta? }` → `index.html:6597` llama `pintarLienzoDeAgentes(cont, moduloDeEscena, agentes, ahora, …)` → `pintarAvisos` → `modulo.avisosDePregunta(agentes, ahora, mundoActual)` → cajas con `el(tag, texto, clase)`, que asigna `nodo.textContent` (`index.html:2573-2578`; el comentario de `index.html:2572` ya prohíbe innerHTML con datos del registro y es la única aparición de «innerHTML» en el archivo; `grep innerHTML web/agentes` da 0). En paralelo `montaje.montar` → `mundo.dibujar` → centro de control dibuja `franja(...).texto` con `T` → `ctx.fillText` (`control.js:225-230`). Prototipo: aviso pendiente con quién / `ticket · que` / `hace N s` (`vista-agentes.html:505-507`) y aviso de respuesta con quién / texto de la respuesta / «el agente sigue» (`vista-agentes.html:508-509`); franja `ESPERANDO A ANITA · LÍNEA 1 · ticket · que` (`vista-agentes.html:406`). Memoria consultada (`buscar_memoria` «vista agentes aviso pregunta pendiente texto respuesta»): sin antecedente de este flujo; aplica AP-005 (funcionalidad nueva sin síntoma).
- Riesgos y compatibilidad: (1) inyección de HTML: el texto viene de transcripts de sesiones; el prototipo lo interpola con `innerHTML` (`vista-agentes.html:507-509`) y eso **no** se copia: se pinta con `el()`/`textContent` y en el lienzo con `fillText`, que no interpreta marcado; se fija con prueba. (2) Compatibilidad: sin `texto`/`respuesta` (o con `null`) el aviso y la franja deben producir exactamente la salida actual, para servidor fuera de loopback y para las pruebas existentes. (3) Desborde: 500 caracteres no caben en la franja de 912 px; se recorta solo en el lienzo. (4) Privacidad: no se agrega ningún dato nuevo al endpoint ni se guarda el texto en `localStorage`; la vista solo pinta lo que el servidor ya decidió exponer. (5) Modo oscuro: no se añaden colores a mano; las clases nuevas usan variables existentes (`--alerta-suave`, `--ok-suave`).
- Impactos de sync, migración, Docker o despliegue: ninguno (solo archivos estáticos de `packages/server/web` y pruebas; sin cambio de contrato del endpoint, sin migraciones, sin contenedores).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-2cf4af creada por el PO.
- Alcance: presentación web de `pregunta.texto` y `pregunta.respuesta` en el aviso sobre el lienzo (tres mundos) y en la franja del centro de control, según los supuestos 1-3 decididos. Exclusiones: el endpoint y su lista blanca (FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008), el nombre del responsable en lugar de «una persona» (FEATURE-WEB-VISTA-LIENZO-20261008), bocadillos de texto en la pastelería y el invernadero (supuesto 1), y cualquier persistencia del texto en el navegador.
- Pasos ordenados:
  1. `packages/server/web/agentes/montaje.js`, `avisosDePregunta`: función interna `textoVisible(valor)` que devuelve el valor si es string con algún carácter no blanco y `null` en otro caso; el aviso `pendiente` añade la clave `texto` solo cuando `textoVisible(p.texto)` no es `null`, y el aviso `respondio` añade la clave `respuesta` solo cuando `textoVisible(p.respuesta)` no es `null`. Sin esos campos el objeto queda idéntico al de hoy. (C1-C6)
  2. `packages/server/web/agentes/montaje.js`: nueva exportación `cajaDeAviso(doc, aviso)` que construye la caja con `doc.createElement` y asigna cada texto solo con `textContent`: `rotulo` (encabezado), `id` (`ticket · hace`), `texto` (pregunta o respuesta, si viene) y `resultado` (expresión del mundo, si viene). El documento llega inyectado: el módulo sigue sin `document` en su nivel. (C7-C10)
  3. `packages/server/web/index.html`, `pintarAvisos` dentro de `pintarLienzoDeAgentes` (`index.html:6454-6462`): reemplazar el armado en línea por `avisos.append(modulo.cajaDeAviso(document, aviso))`; añadir en el CSS, junto a `.corrida-aviso` (`index.html:2215-2232`), la regla `.corrida-aviso .texto { white-space: pre-wrap; overflow-wrap: anywhere; }` sin colores nuevos. (C11-C13)
  4. `packages/server/web/agentes/mundos/control.js`: `franja(agentes)` usa `fila.pregunta.texto` del agente que espera cuando `texto` es string no vacío, con cada secuencia de saltos de línea y espacios reducida a un espacio; sin `texto` conserva el texto inferido de hoy. Nueva exportación `ajustarAlAncho(ctx, texto, anchoPx)`: devuelve el texto si `ctx.measureText(texto).width <= anchoPx`; si no, el prefijo más largo (por puntos de código) que con «…» añadido cabe en `anchoPx`. En `dibujar` (`control.js:304-306`) la franja se escribe con `ajustarAlAncho(ctx, aviso.texto, 896)`; la fuente se fija antes de medir. (C14-C21)
  5. `tests/vista-texto-pregunta.test.ts` (nuevo): pruebas `C1:` … `C24:` con un documento falso cuyo elemento registra `textContent` y lanza un error si se asigna `innerHTML`, y un contexto 2D falso con `measureText` de 7 px por carácter que registra cada `fillText`. Usa el texto hostil `<script>alert("x")</script><b>'negrita'</b> & "comillas"`. (C1-C24)
  6. Compilación y regresión: `npx tsc --build tsconfig.build.json` y las cuatro pruebas existentes de la vista. (C25, C26)
  7. Preparar el navegador: `npm run build` y `node packages/cli/dist/main.js serve --port 4793` desde el worktree (escucha en 127.0.0.1); en `#/agentes` se parchea `window.fetch` desde la consola para que `GET /api/corrida/agentes` devuelva filas simuladas con la forma de `AgenteDeCorrida` leídas de `window.__filas` (variable global editable), como en FEATURE-WEB-MUNDO-CONTROL-20261008. Filas: la sesión principal; un subagente en `approved` con `estado` `esperando` y `pregunta { desde: hace 40 s, respondidaEn: null, texto: "¿Apruebo el plan de FEATURE-X?" }`; un subagente en `in_progress` `trabajando` sin pregunta. Variaciones editando `window.__filas` y esperando el refresco de 5 s: (a) `texto` hostil del paso 5; (b) `texto` de 500 caracteres; (c) `respondidaEn` ahora y `respuesta: "Sí, aprobado. Sigue con el plan."`; (d) sin las claves `texto` ni `respuesta`. Se observa en los tres mundos, a 1280 px y 390 px, en claro y oscuro; se corre `revisar_presentacion` sobre el cambio. Capturas y observaciones van a `## Evidencia`. (C27-C38)
- Impactos declarados: ninguno de sincronización, migración ni contenedores; no cambia el contrato del endpoint ni se publica nada.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); los archivos tocados son estáticos (`montaje.js`, `control.js`, `index.html`) y una prueba nueva, sin datos ni estado que deshacer. Sin `texto` en la fila la vista ya se comporta como hoy, así que revertir solo quita el texto.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: R-ESC-007/R-DAT-004: `avisosDePregunta` con una pregunta abierta cuyo `texto` es «¿Apruebo el plan de FEATURE-X?» devuelve un aviso `pendiente` con `texto` igual a «¿Apruebo el plan de FEATURE-X?»
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C1: -->
- [x] C2: `avisosDePregunta` con una pregunta respondida hace 10 s cuya `respuesta` es «Sí, aprobado.» devuelve un aviso `respondio` con `respuesta` igual a «Sí, aprobado.»
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C2: -->
- [x] C3: `avisosDePregunta` con una pregunta abierta sin la clave `texto` devuelve un aviso igual (`toEqual`) a `{ tipo: "pendiente", encabezado: "Pregunta pendiente para una persona", quien: "una persona", ticket, hace: "hace 40 s", expresion: mundo.pregunta }`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C3: -->
- [x] C4: `avisosDePregunta` con `texto: null` devuelve el mismo objeto que C3, sin la clave `texto`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C4: -->
- [x] C5: `avisosDePregunta` con `texto: "   \n "` devuelve el mismo objeto que C3, sin la clave `texto`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C5: -->
- [x] C6: `avisosDePregunta` con una pregunta respondida hace 10 s sin la clave `respuesta` devuelve un aviso igual (`toEqual`) a `{ tipo: "respondio", encabezado: "una persona respondió", ticket, hace: "hace 10 s" }`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C6: -->
- [x] C7: `cajaDeAviso` con el texto hostil `<script>alert("x")</script><b>'negrita'</b> & "comillas"` produce un hijo de clase `texto` cuyo `textContent` es exactamente ese texto
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C7: -->
- [x] C8: `cajaDeAviso` con el texto hostil no asigna `innerHTML` en ningún elemento (el documento falso lanza un error si se asigna)
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C8: -->
- [x] C9: `cajaDeAviso` con un aviso `respondio` cuya `respuesta` es «Sí, aprobado.» produce un hijo de clase `texto` con `textContent` «Sí, aprobado.»
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C9: -->
- [x] C10: `cajaDeAviso` con un aviso `pendiente` sin `texto` produce tres hijos con clases `rotulo`, `id` y `resultado`, en ese orden
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C10: -->
- [x] C11: `packages/server/web/index.html` no contiene ninguna asignación `innerHTML =`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C11: -->
- [x] C12: `pintarAvisos` en `packages/server/web/index.html` arma cada caja con `modulo.cajaDeAviso(document, aviso)`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C12: -->
- [x] C13: el CSS de `packages/server/web/index.html` declara `.corrida-aviso .texto` con `white-space: pre-wrap`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C13: -->
- [x] C14: `franja` con un operador en la estación 3 que espera con `texto` «¿Despliego a staging?» devuelve `ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Despliego a staging?`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C14: -->
- [x] C15: `franja` con `texto` «línea uno\n\nlínea dos» termina en «línea uno línea dos»
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C15: -->
- [x] C16: `franja` sin `texto` en la estación 3 devuelve `ESPERANDO A ANITA · LÍNEA 1 · FEATURE-WEB · ¿Apruebo el plan?`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C16: -->
- [x] C17: `franja` sin `texto` en la estación 5 termina en «¿Pasaron tus pruebas?»
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C17: -->
- [x] C18: `ajustarAlAncho` con un texto de 500 caracteres, 7 px por carácter y 896 px devuelve un texto de 128 caracteres como máximo que termina en «…»
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C18: -->
- [x] C19: `ajustarAlAncho` con un texto de 20 caracteres, 7 px por carácter y 896 px lo devuelve sin cambios
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C19: -->
- [x] C20: el `dibujar` del centro de control con el texto hostil en la pregunta abierta llama a `fillText` con una cadena que contiene `<script>alert("x")</script>` literal
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C20: -->
- [x] C21: el `dibujar` del centro de control con un `texto` de 500 caracteres escribe la franja con una cadena cuyo ancho medido es de 896 px o menos
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C21: -->
- [x] C22: el `dibujar` de la pastelería con el texto hostil en la pregunta abierta no pasa ese texto a `fillText`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C22: -->
- [x] C23: el `dibujar` del invernadero con el texto hostil en la pregunta abierta no pasa ese texto a `fillText`
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C23: -->
- [x] C24: `packages/server/web/agentes/montaje.js` no referencia `document` fuera de un parámetro (no contiene `document.`)
      <!-- test: npx vitest run tests/vista-texto-pregunta.test.ts -t C24: -->
- [x] C25: `npx tsc --build tsconfig.build.json` termina con código 0
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C26: las pruebas existentes de la vista pasan sin cambios en sus expectativas
      <!-- test: npx vitest run tests/vista-lienzo.test.ts tests/mundo-control.test.ts tests/mundo-pasteleria.test.ts tests/mundo-invernadero.test.ts -->
- [x] C27: en el navegador (paso 7), con `texto` «¿Apruebo el plan de FEATURE-X?», el aviso sobre el lienzo muestra esa frase en los tres mundos
      <!-- verify: manual -->
- [x] C28: en el navegador, con la variación (a), el aviso muestra el texto hostil literal
      <!-- verify: manual -->
- [x] C29: en el navegador, con la variación (a), no aparece ningún diálogo `alert`
      <!-- verify: manual -->
- [x] C30: en el navegador, con la variación (a), `document.querySelectorAll(".corrida-avisos b").length` es 0
      <!-- verify: manual -->
- [x] C31: en el navegador, con la variación (c), el aviso «una persona respondió» muestra «Sí, aprobado. Sigue con el plan.»
      <!-- verify: manual -->
- [x] C32: en el navegador, con la variación (d), el aviso se ve igual que antes del cambio
      <!-- verify: manual -->
- [x] C33: en el navegador, mundo «Centro de control», la franja muestra el texto real de la pregunta
      <!-- verify: manual -->
- [x] C34: en el navegador, con la variación (b), la franja termina en «…» dentro de su rectángulo de 912 px
      <!-- verify: manual -->
- [x] C35: en el navegador, con la variación (b), el aviso muestra los 500 caracteres del texto
      <!-- verify: manual -->
- [x] C36: a 390 px de ancho, con la variación (b), la página no tiene desborde horizontal
      <!-- verify: manual -->
- [x] C37: el aviso con texto es legible en tema oscuro
      <!-- verify: manual -->
- [x] C38: `revisar_presentacion` sobre el cambio no reporta colores a mano nuevos
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/server/web/agentes/montaje.js`: `textoVisible` (interna); `avisosDePregunta` añade `texto` al aviso `pendiente` y `respuesta` al `respondio` solo si traen algún carácter no blanco; nueva exportación `cajaDeAviso(doc, aviso)` que arma la caja con `doc.createElement` y asigna cada cadena solo con `textContent` (el módulo sigue sin `document` propio).
- `packages/server/web/index.html`: `pintarAvisos` usa `modulo.cajaDeAviso(document, aviso)`; regla `.corrida-aviso .texto { white-space: pre-wrap; overflow-wrap: anywhere; }` sin colores nuevos.
- `packages/server/web/agentes/mundos/control.js`: `franja` usa `fila.pregunta.texto` (saltos y espacios reducidos a uno) y conserva el texto inferido sin él; nueva `ajustarAlAncho(ctx, texto, anchoPx)` (prefijo por puntos de código + «…», búsqueda binaria; sin `measureText` devuelve el texto); `dibujar` fija la fuente y escribe la franja ajustada a 896 px.
- `tests/vista-texto-pregunta.test.ts` (nuevo): C1…C24.
- Sin cambios en el servidor, `dist/` ni la pastelería y el invernadero (supuesto 1). Rollback: `git revert` del commit del ticket.

## Pruebas

Directorio de ejecución: raíz del repositorio (o del worktree). Requisitos: Node 24, `npm install` hecho; para el navegador, `npm run build`.

- `npx vitest run tests/vista-texto-pregunta.test.ts` → 24 pruebas pasan (C1–C24; incluye el escapado con `<script>alert("x")</script><b>'negrita'</b> & "comillas"` y un documento falso que lanza si se asigna `innerHTML`).
- `npx vitest run tests/vista-lienzo.test.ts tests/mundo-control.test.ts tests/mundo-pasteleria.test.ts tests/mundo-invernadero.test.ts` → 4 archivos, 111 pruebas pasan, sin cambios en ellas (C26).
- `npx tsc --build tsconfig.build.json` → código 0 (C25).
- Medición del agente en el navegador (C27–C38), servidor del worktree `node packages/cli/dist/main.js serve --port 4793`, proyecto «ValmenHarness» elegido en el selector, `window.fetch` parcheado para `GET /api/corrida/agentes` con filas simuladas en `window.__filas` (principal; subagente `approved` esperando con `pregunta`; subagente `in_progress`); refresco de 5 s:
  - C27: el aviso muestra «¿Apruebo el plan de FEATURE-X?» en pastelería, control e invernadero (`.corrida-aviso .texto`).
  - C28–C30 (variación a): el aviso muestra el texto hostil literal; `alert` sustituido por un contador: 0 llamadas; `.corrida-avisos b` = 0 y `.corrida-avisos script` = 0.
  - C31 (c): «una persona respondió … Sí, aprobado. Sigue con el plan.».
  - C32 (d): sin `texto` ni `respuesta` el aviso queda con rótulo, id y expresión del mundo, sin `.texto` (comprobado por estructura del DOM, no contra una captura anterior).
  - C33–C34: la franja del centro de control, medida interceptando `fillText`: «…· FEATURE-X · ¿Apruebo el plan de FEATURE-X?» (465 px); con 500 caracteres termina en «…» y mide 891 px, dentro de 896 (rectángulo de 912).
  - C35: el aviso con la variación (b) contiene 500 caracteres.
  - C36: a 390 px, `scrollWidth` = `innerWidth` (sin desborde horizontal).
  - C37: tema oscuro (esquema del sistema oscuro): texto `rgb(232,234,240)` sobre el fondo ámbar suave; legible en la captura.
  - C38: `valmen ux review` → 0 colores fijos (EVIDENCE-001); `git diff` sin colores hex ni `rgb(` nuevos. La herramienta `revisar_presentacion` corre sobre el checkout principal y reportó 0 archivos.
- Limitaciones de lo medido: el viewport de 390 px dejó la página en 400 px por el menú lateral, que ya era así; el tema claro no se miró; la comparación visual contra el prototipo `vista-agentes.html` y una sesión real con `AskUserQuestion` quedan para el responsable.
## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
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
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente de implementación (claude-sonnet-5-5); no expone los números de tokens ni de costo; sin cifras para no inventarlas.",
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
    "at": "2026-10-08T23:30:59.926Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-09T03:06:57.210Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-09T03:08:28.008Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por claude (recibo GR-20261009-FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008-analysis-1, canal cli, decidida 2026-10-09T03:08:28.005Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: un solo punto bajo (nombra_archivos_reales 0.76, patrón ya visto), ubica el cambio 0.95 y causa específica 0.91; el diagnóstico cita los tres consumidores con ruta:línea y el escapado ya existente (textContent y fillText)."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-09T03:10:59.978Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-09T03:17:08.328Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por claude (recibo GR-20261009-FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008-plan-1, canal cli, decidida 2026-10-09T03:17:08.321Z): PO delegó en chat: \"vamos a seguir tus recomendaciones para este feature\". Claude recomienda aprobar: sin BLOCK, media ponderada 0.926 con cascade, 38 criterios de una sola afirmación y diez en banda entre 0.82 y 0.90 por redacción; el escapado tiene prueba (C7, C8, C20, C22, C23) y el caso sin texto también."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-09T03:17:08.805Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-2cf4af\",\"source\":\"autorizacion\",\"quote\":\"aprobación de planes y análisis de la feature vista-agentes\",\"planHash\":\"sha256:f71434d918421a72424c88eabce0336607f95f29acdf4d3ff8c60f7a013ebe70\",\"authorizationId\":\"APA-20261009-2cf4af\",\"authorizationHash\":\"sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008-plan-1\",\"receiptStateHash\":\"sha256:f36319ee032f9c34ea1a84ee857aaca535484f17db23a428543dcc34ab7c05b8\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-09T03:17:09.187Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-2cf4af (fuente autorizacion, hash sha256:f0d68588da9cc594af9adb952801aafb03f62078768f4203d65c21c14fd66be3), plan sha256:f71434d918421a72424c88eabce0336607f95f29acdf4d3ff8c60f7a013ebe70."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-09T03:17:09.187Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-09T03:17:30.285Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-09T03:21:24.087Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-09T03:21:45.760Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-09T03:22:21.252Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
