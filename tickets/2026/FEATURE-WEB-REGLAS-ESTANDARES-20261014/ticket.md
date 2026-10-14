---
schema_version: 2
id: FEATURE-WEB-REGLAS-ESTANDARES-20261014
title: Estándares separados en vigor, propuestos y descartados
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

# FEATURE-WEB-REGLAS-ESTANDARES-20261014

## Solicitud original

Parte del sprint: En vivo y Reglas rediseñados: marco nuevo de Agentes, Procesos con detenidas primero y Estándares por estado.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-VIVO-004: Estándares DEBE separar en vigor, propuestos y descartados, y abrir cada uno con su regla, su motivo y la frase con que se aceptó
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Estándares DEBE separar en vigor, propuestos y descartados, y abrir cada uno con su regla, su motivo y la frase con que se aceptó
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
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/estandares.html` — Boceto aprobado por el PO el 2026-10-14: Estándares (HTML autónomo, el original) (sha256 9fafd8d91f68…)
- `.valmen/features/rediseno-mission-control/assets/estandares.png` — Captura a 1440 px del boceto aprobado: Estándares (sha256 2fe538ade1e7…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la vista Reglas › Estándares (`vistaEstandares` en `packages/server/web/index.html:5164`) con sus ayudantes y estilos. Se reemplaza su aspecto por el del boceto aprobado `.valmen/features/rediseno-mission-control/assets/estandares.html` (captura `estandares.png`) y se cubre la parte de R-MARCO-006 que toca a esta vista (que funcione en el celular). Las demás vistas del mismo `index.html`, el menú y su contador quedan fuera: las cubren otros tickets del sprint. El servidor (`GET /api/standards`, `POST /api/standards/:id/decision`) y el motor (`packages/engine/src/standards.ts`) no cambian.
- Usuario o rol afectado: el PO o responsable que abre Mission Control para saber qué reglas están en vigor, cuáles esperan su decisión y cuáles descartó, y con qué palabras decidió cada una; en el escritorio y en el celular.
- Comportamiento actual: título «Estándares del proyecto» y una bajada; un aviso ámbar si hay propuestas; las propuestas pendientes como tarjetas con regla, porqué, tickets y los botones «Aceptar y poner en vigor» / «Descartar»; «En vigor» como **un acordeón por archivo** (`estandares-proceso.md`) que vuelca el Markdown entero del archivo, sin id, sin fecha ni frase de quien lo aceptó; y un `details` «Historial» cerrado que mezcla aceptados y descartados con su fecha y su frase. No hay pestañas ni filas plegables por estándar.
- Comportamiento esperado (boceto): migas «Reglas · Estándares», título «Lo que este proyecto ya decidió» y la bajada «Cada regla salió de una corrección. Ábrela para ver por qué existe y con qué palabras la aceptaste.». Pestañas «En vigor», «Propuestos», «Descartados», cada una con su cuenta, y a la derecha el área y el archivo de donde salen. Debajo, una lista con una fila plegable por estándar: id, título y fecha; al pulsarla se abre (y la fila marca `aria-expanded="true"`) con «Regla», «Por qué» y, en ámbar, «Lo aceptaste con estas palabras» con la frase literal de la persona tomada del registro. Aceptar o descartar sigue siendo de una persona: la vista no decide nada por nadie ni inventa una frase que nadie dijo.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto, es una funcionalidad que falta. `packages/server/web/index.html:5164` (`vistaEstandares`) pide `/api/standards` (`index.html:5167`) y pinta tres bloques fijos uno debajo de otro: las propuestas pendientes como tarjetas (`index.html:5179-5254`), «En vigor» como un acordeón por **archivo** que vuelca el Markdown con `seccionDeTicket` (`index.html:5262-5283`) y el historial de decididas en un `details` cerrado (`index.html:5290-5332`). Con esa forma la pantalla no puede separar por estado con cuentas ni abrir **un** estándar con su regla, su porqué y su frase. Los datos que pide el boceto ya llegan en la respuesta, sin dato nuevo:
  - Id, título, área, regla, porqué, tickets, fecha de la propuesta, fecha de la decisión, frase literal y estado de cada estándar: `packages/engine/src/standards.ts:134` (`listProposals`) los lee de `.valmen/estandares-propuestos.md`; la frase sale de la línea `- **Decidido:** AAAA-MM-DD · «…»` (`standards.ts:124`, `DECIDIDO_RE`) y `packages/server/src/server.ts:1190-1207` la entrega en `proposals`.
  - La regla en vigor tal como la lee el agente: `server.ts:1191-1203` entrega en `standards` el contenido de cada `.valmen/rules/estandares-<área>.md` (`standards.ts:398`, `standardsFiles`); cada estándar es una sección `## <título>` con la regla, `**Por qué:**` y `**Visto en:**` (`standards.ts:345-357`, lo escribe `decideProposal`). La regla del archivo puede haberse ampliado después de aceptarla: en el registro real, «Gateway y avisos por Telegram» lleva en `.valmen/rules/estandares-proceso.md:15` una frase de 2026-10-13 que la propuesta EST-002 (`.valmen/estandares-propuestos.md:26`) no tiene.
  - Datos reales hoy: 11 entradas en `.valmen/estandares-propuestos.md` (10 `aceptado`, 1 `descartado` —EST-005—, 0 `propuesto`), las mismas cuentas del boceto, y 10 secciones `##` en `.valmen/rules/estandares-proceso.md`. EST-006, EST-009 y EST-010 no tienen frase (`.valmen/estandares-propuestos.md:70`, `:106`, `:117`): se decidieron sin cita, y `standards.ts:120-123` dice que inventarla sería peor que dejarla sin frase.
  - La fecha del boceto es la de la propuesta: EST-006 muestra «04 oct» y su `**Propuesto:**` es 2026-10-04, mientras su decisión es del 2026-10-05 (`.valmen/estandares-propuestos.md:68-70`).
- Hipótesis pendientes:
  - H1 (se decide en el plan, verificable con prueba): la fila «En vigor» se arma cruzando cada sección `##` de los archivos de reglas con la propuesta aceptada del mismo título; regla y porqué salen del archivo (lo que está en vigor) y id, fecha y frase de la propuesta. Una sección sin propuesta (escrita a mano) se lista sin id ni frase, y una propuesta aceptada cuya sección no aparece se lista con los datos de la propuesta y el aviso de que no está en el archivo.
  - H2: los botones «Aceptar y poner en vigor» / «Descartar» (`index.html:5218-5248`) se conservan dentro de la fila abierta de un propuesto, con la misma llamada existente `POST /api/standards/:id/decision` (`index.html:5226-5230`, declarada en `tests/api-rutas.test.ts:73`). El servidor solo lee `decision` (`server.ts:1221-1230`): la decisión por pantalla no lleva frase, y la vista no inventa una.
  - H3: con propuestas pendientes la pestaña inicial es «Propuestos» y su cuenta va en ámbar (es lo único que pide una acción, y hoy el aviso de `index.html:5179-5187` cumple ese papel); sin pendientes, «En vigor», como el boceto.
- Consumidores afectados:
  - `/api/standards`: lo leen `vistaEstandares` y el contador del menú (`index.html:12861-12869`, cuenta los `propuesto`). Ninguno cambia de contrato.
  - Simulacros que responden `/api/standards` solo con `{ proposals: [] }`, sin `standards`: `tests/interfaz-ejecutable.test.ts:121,271`, `tests/menu-grupos.test.ts:253`, `tests/inicio-decisiones.test.ts:259`, `tests/ajustes-proveedores.test.ts:149`. La vista nueva tiene que tolerar la ausencia de `standards`.
  - `scripts/verificar-interfaz.mjs:486-523` simula un archivo de reglas con «# Reglas\n\nUna regla.» (sin secciones `##`), una propuesta pendiente y una aceptada, y `scripts/verificar-interfaz.mjs:790` ejecuta `#/estandares` exigiendo que la vista se pinte sin fallos.
  - `tests/api-rutas.test.ts`: la única URL con plantilla de la vista es la existente de la decisión; no se agrega ninguna.
- Archivos y flujo investigados: `packages/server/web/index.html` (`vistaEstandares` 5164-5333, estilos `.tarjeta-estandar` 1468-1478 y `.historial-estandares` 1682-1693 —solo los usa esta vista—, `el` 4205, `acordeon` 7936, contador del menú 12861-12869, enrutado 13038, tokens de color 76-147 y su versión clara 119-147, pestañas de Tickets 4787-4806 como patrón de `role="tablist"`); `packages/server/src/server.ts:1184-1250`; `packages/engine/src/standards.ts` (`listProposals` 134, `DECIDIDO_RE` 124, `decideProposal` 306, bloque de regla 345-357, `standardsFiles` 398); `.valmen/estandares-propuestos.md`; `.valmen/rules/estandares-proceso.md`; `scripts/verificar-interfaz.mjs`; `tests/api-rutas.test.ts`; `tests/portafolio-vista.test.ts` (patrón de prueba de vista con `ejecutarInterfaz`); el boceto `.valmen/features/rediseno-mission-control/assets/estandares.html` y `estandares.png`; la spec `.valmen/features/rediseno-mission-control/spec/s4-vivo-reglas/spec.md` (R-VIVO-004). Memoria: `valmen memory search "vista Estándares web propuestos descartados"` solo trae AP-003 (las compuertas respetan el alcance asignado por el grafo: el menú y las otras vistas son de otros tickets) y AP-011, ajeno.
- Riesgos y compatibilidad:
  - Colisión de nombres en `index.html`: otros agentes editan otras vistas del mismo archivo; todo ayudante, constante o clase nueva lleva el prefijo `estandares…`/`.est-…`, y el script no lleva comentarios HTML literales.
  - Decidir por la persona: la vista no agrega ninguna escritura; la única es la existente de los botones, que pulsa una persona. Ninguna frase se compone en la interfaz: si el registro no la tiene, se dice que no la tiene.
  - Pruebas existentes en rojo: las que simulan `{ proposals: [] }` y el verificador de interfaz; el plan los cubre sin editarlos (tolerar `standards` ausente y archivos sin secciones `##`).
  - Lectura del Markdown en el navegador: se parte por `## ` y por las etiquetas `**Por qué:**` y `**Visto en:**`, que es el formato que escribe `decideProposal`; un archivo con otra forma se muestra igual, con el texto completo de la sección como regla.
  - Modo claro y celular: los colores salen de los tokens (`--persona` para el ámbar, `--codigo` para el id), que ya tienen su versión clara; la fila del boceto usa columnas fijas (76 px y 110 px) y una sangría de 108 px que no caben en 375 px.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia una vista web local de Mission Control, sin datos sincronizados, sin migración, sin contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: pendiente; la compuerta `plan` se evalúa con `--evaluator cascade` y la aprobación es de la política por defecto o de una persona, no de este agente.
- Alcance: la vista `vistaEstandares` de `packages/server/web/index.html` con sus ayudantes y estilos nuevos (prefijo `estandares…` en funciones y constantes, `.est-…` en clases) y una prueba nueva, `tests/estandares-vista.test.ts`. Exclusiones: el menú lateral y su contador (`index.html:12861-12869`), las demás vistas del archivo (otros tickets del sprint), el servidor (`packages/server/src/server.ts:1184-1250`), el motor (`packages/engine/src/standards.ts`) y `tests/api-rutas.test.ts`, que no cambian; ninguna ruta ni escritura nueva.
- Pasos ordenados:
  1. Pruebas primero, vistas en rojo antes de tocar la vista: `tests/estandares-vista.test.ts` con `ejecutarInterfaz`, `disparar` y `buscarNodos` de `scripts/verificar-interfaz.mjs`, como `tests/portafolio-vista.test.ts`. Simulacro de `/api/standards` con la forma real: un archivo `.valmen/rules/estandares-proceso.md` con secciones `## <título>`, regla, `**Por qué:**` y `**Visto en:**` —una cuya regla difiere de la de su propuesta y una sin propuesta— y propuestas `aceptado` (con frase y sin frase), `descartado` (con frase) y `propuesto`; un segundo simulacro sin propuestas pendientes; y un tercero con solo `{ proposals: [] }`. Casos: cabecera (C1); pestañas con cuenta (C2); cambiar de pestaña (C3); fila con id, título y fecha (C4); abrir y cerrar una fila (C5); regla, porqué y frase (C6, C7, C8, C9); regla del archivo y sección sin propuesta (C10); pestaña inicial con pendientes (C11); botones del propuesto y su `POST` (C12, C13); solo `GET` al abrir (C14); respuesta sin `standards` (C15); regla `@media` de la fila (C18). Comando: `npx vitest run tests/estandares-vista.test.ts`, que debe fallar antes del paso 2 (C1–C15, C18).
  2. `packages/server/web/index.html`, ayudantes nuevos junto a la vista: `estandaresSecciones(contenido)` parte un archivo de reglas por `## ` y separa regla, `**Por qué:**` y `**Visto en:**` (una sección con otra forma se toma entera como regla); `estandaresFilas(datos)` arma `{ vigor, propuestos, descartados }`: «En vigor» cruza cada sección de `datos.standards` (o `[]` si falta) con la propuesta `aceptado` del mismo título —regla y porqué del archivo, id, fecha y frase de la propuesta—, agrega las secciones sin propuesta y las propuestas aceptadas cuya sección no aparece, con su aviso; «Propuestos» y «Descartados» salen de `datos.proposals` por `state`; cada lista ordenada por id de mayor a menor; `estandaresFecha(iso)` da «13 oct» (fecha de la propuesta, o la de la decisión si falta, o «—»); `ESTANDARES_MESES` con las abreviaturas; estado de la página en `estandaresPestana` y `estandaresAbierto` (C2, C4, C10, C15).
  3. `vistaEstandares` (`index.html:5164`) reescrita sobre la misma llamada `api("GET", "/api/standards")`: migas «Reglas · Estándares», `h1` «Lo que este proyecto ya decidió» y la bajada del boceto (C1); `div role="tablist"` con tres `button role="tab"` «En vigor», «Propuestos», «Descartados», cada uno con su cuenta y `aria-selected`; la cuenta de «Propuestos» en ámbar si es mayor que cero; al pulsar una pestaña se vuelve a pintar la lista con lo ya leído, sin pedir de nuevo (C2, C3); pestaña inicial «Propuestos» si hay pendientes y «En vigor» si no (C11); a la derecha, «Área: <área> · <archivo>» por cada archivo de reglas en «En vigor» y `.valmen/estandares-propuestos.md` en las otras dos; una `ul` con una fila por estándar: `button` con id, título, fecha y chevrón y `aria-expanded` (C4, C5); una sola fila abierta a la vez, la primera abierta al entrar a la pestaña; la fila abierta muestra «Regla», «Por qué», «Visto en» si hay tickets, y una caja ámbar «Lo aceptaste con estas palabras» o «Lo descartaste con estas palabras» con la frase literal entre comillas angulares, o «Decidido el <fecha>, sin frase registrada.» si el registro no la tiene (C6, C7, C8, C9); la fila de un propuesto conserva los botones «Aceptar y poner en vigor» y «Descartar», la misma llamada existente `POST /api/standards/${id}/decision` con `{ decision }` (`index.html:5226-5230`) y el aviso «También se decide hablando…» (C12, C13); cada pestaña vacía dice que no hay estándares en ese estado, y «En vigor» vacío conserva el texto actual de `index.html:5265-5269`. La vista no compone ninguna frase y no hace otra escritura (C14).
  4. Estilos `.est-*` en el bloque de estilos de `index.html`, con los tokens existentes (`--panel`, `--panel-alto`, `--borde`, `--codigo`, `--tenue`, `--persona`, `--alerta-suave`, `--fuente-titulo`, `--mono`) y sin colores a mano; la fila es una rejilla `76px minmax(0, 1fr) 110px 22px` como el boceto y, con `@media (max-width: 640px)`, pasa a id, fecha y chevrón arriba y el título debajo, y el cuerpo pierde la sangría de 108 px (C18, C19). Se quitan `.tarjeta-estandar`, `.tarjeta-estandar .nombre`, `.tarjeta-estandar.historial` e `.historial-estandares > summary` (`index.html:1468-1478`, `index.html:1682-1693`), que solo usaba la vista vieja.
  5. Regresión sin editar pruebas existentes: `npx vitest run tests/api-rutas.test.ts` (C17), `npx vitest run tests/interfaz-ejecutable.test.ts tests/menu-grupos.test.ts tests/inicio-decisiones.test.ts tests/ajustes-proveedores.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts` (C16), `npm run build` y `node scripts/verificar-interfaz.mjs` («Interfaz verificada.») (C15, C16). Si una prueba existente se pone en rojo, se detiene la implementación y se reporta en el ticket.
  6. Verificación en el navegador con `valmen serve` sobre el registro real (10 en vigor, 0 propuestos, 1 descartado): a 1440 px contra `.valmen/features/rediseno-mission-control/assets/estandares.png` y a 375 px, en oscuro y claro, con capturas como evidencia del ticket, y `revisar_presentacion` sobre el cambio (C19, C20).
- Respuesta al diagnóstico:
  - Hallazgo «tres bloques fijos sin pestañas ni filas por estándar» (`packages/server/web/index.html:5164`, `packages/server/web/index.html:5179-5254`, `packages/server/web/index.html:5262-5283`, `packages/server/web/index.html:5290-5332`) → pasos 2, 3 y 4 → C1, C2, C3, C4, C5, C20 → D6, D9.
  - Hallazgo «los datos de cada estándar ya llegan en `proposals`» (`packages/engine/src/standards.ts:134`, `packages/engine/src/standards.ts:124`, `packages/server/src/server.ts:1190-1207`) → paso 2 (`estandaresFilas`) y paso 3 (cuerpo de la fila) → C6, C7, C8 → D2.
  - Hallazgo «la regla en vigor es la del archivo y puede diferir de la propuesta» (`packages/server/src/server.ts:1191-1203`, `packages/engine/src/standards.ts:398`, `packages/engine/src/standards.ts:345-357`, `.valmen/rules/estandares-proceso.md:15` frente a `.valmen/estandares-propuestos.md:26`) → paso 2 (`estandaresSecciones`, cruce por título) → C10 → D4.
  - Hallazgo «hay estándares decididos sin frase» (`.valmen/estandares-propuestos.md:70`, `.valmen/estandares-propuestos.md:106`, `.valmen/estandares-propuestos.md:117`, `packages/engine/src/standards.ts:120-123`) → paso 3 (texto «sin frase registrada», nada inventado) → C9, C14 → D3.
  - Hallazgo «la fecha del boceto es la de la propuesta» (`.valmen/estandares-propuestos.md:68-70`) → paso 2 (`estandaresFecha`) → C4 → D8.
  - Hipótesis H1 (cruce por título) → paso 2 → C10 → D4.
  - Hipótesis H2 (los botones se conservan; el servidor solo lee `decision`, `packages/server/src/server.ts:1221-1230`; ruta declarada en `tests/api-rutas.test.ts:73`) → paso 3 → C12, C13, C17 → D1.
  - Hipótesis H3 (pestaña inicial con pendientes, aviso de `packages/server/web/index.html:5179-5187`) → paso 3 → C11 → D6.
  - Consumidor «contador del menú» (`packages/server/web/index.html:12861-12869`) → fuera de alcance y sin cambios; lo cubre paso 5 → C16.
  - Consumidores «simulacros con `{ proposals: [] }`» (`tests/interfaz-ejecutable.test.ts:121`, `tests/menu-grupos.test.ts:253`, `tests/inicio-decisiones.test.ts:259`, `tests/ajustes-proveedores.test.ts:149`) → paso 2 (`standards` ausente es `[]`) y paso 5 → C15, C16.
  - Consumidor «verificador de interfaz» (`scripts/verificar-interfaz.mjs:486-523`, `scripts/verificar-interfaz.mjs:790`), con un archivo sin secciones `##` → paso 2 (sección sin `##` no rompe) y paso 5 → C16.
  - Riesgo «colisión de nombres en `index.html`» → pasos 2 y 4 (prefijos `estandares…`/`.est-…`, sin comentarios HTML literales en el script) y paso 5 → C16.
  - Riesgo «decidir por la persona» → paso 3 (sin escrituras nuevas ni frases compuestas) → C9, C13, C14 → D1, D3.
  - Riesgo «modo claro y celular» → paso 4 (tokens y `@media`) y paso 6 → C18, C19, C20.
- Diferencias con el boceto (cada una registrada con `valmen agent-decision`):
  - D1 La fila abierta de un propuesto muestra regla, porqué y «Visto en», y conserva los botones «Aceptar y poner en vigor» / «Descartar» y el aviso «También se decide hablando…» de la vista actual; no tiene caja de frase porque nadie decidió todavía. El boceto no dibuja un propuesto (hay 0).
  - D2 En «Descartados» la caja ámbar dice «Lo descartaste con estas palabras»; el boceto solo dibuja la de un aceptado.
  - D3 Un estándar decidido sin frase (hoy EST-006, EST-009 y EST-010) muestra en la caja «Decidido el <fecha>, sin frase registrada.» en lugar del relleno del boceto: la vista no inventa palabras.
  - D4 En «En vigor» la regla y el porqué salen del archivo de reglas (lo que lee el agente) y el id, la fecha y la frase de la propuesta del mismo título; una sección sin propuesta se lista con «—» como id y «Sin decisión registrada en .valmen/estandares-propuestos.md.», y una propuesta aceptada sin sección, con sus datos y «No aparece en <archivo>.».
  - D5 La línea «Área: … · archivo» nombra cada archivo de reglas en «En vigor» (hoy uno, como el boceto) y `.valmen/estandares-propuestos.md` en «Propuestos» y «Descartados».
  - D6 Con propuestas pendientes la pestaña inicial es «Propuestos» y su cuenta va en ámbar; sin pendientes, «En vigor», como el boceto. El aviso ámbar suelto de la vista actual se quita: su información queda en la cuenta de la pestaña y en el contador del menú.
  - D7 Una sola fila abierta a la vez y la primera de la pestaña abierta al entrar, como el estado del boceto (`abierto: 'EST-011'`).
  - D8 La fecha es la de la propuesta en formato «13 oct» (la del boceto); si falta, la de la decisión; si falta también, «—».
  - D9 Se quitan el acordeón por archivo con el Markdown completo y el «Historial» plegado: su contenido pasa a las filas de «En vigor» y «Descartados».
- Impactos declarados: ninguno; sin sincronización, sin migración y sin contenedores.
- Tamaño previsto: unas 700 líneas añadidas y borradas (unas 230 de vista y 60 de estilos añadidas, unas 200 de la vista y estilos viejos borradas, y 210 de pruebas), 20 criterios.
- Si excede el tope: sigue: la vista se reescribe entera y no hay un corte en tickets que lleven cada uno su código y sus pruebas; el exceso son líneas borradas de la vista vieja, y el tope avisa, no bloquea.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); no hay datos, migraciones, rutas ni configuración que deshacer, y el contrato de `/api/standards` no cambia.

## Criterios de aceptación

- [x] C1 (R-VIVO-004): Estándares pinta el título «Lo que este proyecto ya decidió» bajo las migas «Reglas · Estándares».
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C2 (R-VIVO-004): Estándares pinta las pestañas «En vigor», «Propuestos», «Descartados», cada una con la cuenta de su estado.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C3 (R-VIVO-004): pulsar la pestaña «Descartados» lista solo los estándares descartados.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C4 (R-VIVO-004): cada fila muestra id, título, fecha del estándar en formato «13 oct».
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C5 (R-VIVO-004, escenario «Abrir un estándar»): pulsar una fila cerrada la abre con `aria-expanded="true"`.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C6 (R-VIVO-004): la fila abierta muestra la regla del estándar con su porqué.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C7 (R-VIVO-004): la fila abierta de un estándar aceptado muestra «Lo aceptaste con estas palabras» con la frase literal del registro.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C8 (R-VIVO-004): la fila abierta de un estándar descartado muestra «Lo descartaste con estas palabras» con la frase literal del registro.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C9 (R-VIVO-004): un estándar decidido sin frase muestra «sin frase registrada» sin comillas de cita.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C10 (R-VIVO-004): la regla de un estándar en vigor es la de su sección del archivo de reglas cuando difiere de la propuesta.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C11 (R-VIVO-004): con propuestas pendientes la vista abre en la pestaña «Propuestos».
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C12 (regresión): la fila abierta de un propuesto ofrece los botones «Aceptar y poner en vigor», «Descartar».
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C13 (regresión): pulsar «Aceptar y poner en vigor» envía `POST /api/standards/<id>/decision` con el cuerpo `{ decision: "aceptado" }` como única escritura.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C14 (R-VIVO-004): recorrer las pestañas de Estándares abriendo sus filas solo hace pedidos `GET`.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C15 (regresión): con una respuesta de `/api/standards` sin `standards` la vista se pinta sin fallos.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C16 (regresión): la interfaz carga todas sus vistas, Estándares incluida.
      <!-- test: node scripts/verificar-interfaz.mjs -->
- [x] C17 (regresión): cada URL que la interfaz pide corresponde a una ruta declarada del servidor.
      <!-- test: npx vitest run tests/api-rutas.test.ts -->
- [x] C18 (R-MARCO-006): la fila de Estándares tiene una regla `@media (max-width: 640px)` que la reacomoda.
      <!-- test: npx vitest run tests/estandares-vista.test.ts -->
- [x] C19 (R-MARCO-006): a 375 px de ancho Estándares se lee sin desplazamiento horizontal.
      <!-- verify: manual -->
- [x] C20 (R-VIVO-004): a 1440 px Estándares coincide con `.valmen/features/rediseno-mission-control/assets/estandares.png` salvo las diferencias D1 a D9 del plan.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (FEATURE de interfaz con boceto), plan aprobado por la autorización POLITICA-POR-DEFECTO (recibo `GR-20261014-FEATURE-WEB-REGLAS-ESTANDARES-20261014-plan-1`).
- Paso 1, pruebas primero: `tests/estandares-vista.test.ts` (10 casos) se vio en rojo antes de tocar la vista (10 de 10 fallos) y en verde después. La única corrección de la prueba antes del verde fue aflojar a `\s+` los espacios de la línea «Área: proceso · …», que se arma con nodos separados.
- Pasos 2 y 3: `packages/server/web/index.html` reemplaza `vistaEstandares` y añade `estandaresPestana`, `estandaresAbierto`, `ESTANDARES_PESTANAS`, `ESTANDARES_MESES`, `ESTANDARES_PROPUESTAS`, `estandaresFecha`, `estandaresSecciones`, `estandaresFilas`, `estandaresBloque` y `estandaresCita`. La regla y el porqué se pintan con `renderMarkdown` (código en línea del registro real). Sin rutas nuevas: la única escritura sigue siendo `POST /api/standards/${id}/decision` con `{ decision }`, la misma de antes. El script no lleva comentarios HTML literales.
- Paso 4: estilos `.est-*` solo con tokens; se quitaron `.tarjeta-estandar`, `.tarjeta-estandar .nombre`, `.tarjeta-estandar.historial` e `.historial-estandares > summary`. El chevrón es CSS (bordes rotados), sin SVG.
- Ajuste pedido por el orquestador sobre D-009 (registrado como D-010): ninguna prueba ni flujo usaba el «Historial» ni el acordeón por archivo (búsqueda de `tarjeta-estandar` e `historial-estandares` en `tests/` y `scripts/`: 0), pero el archivo de reglas completo y la fecha de cada decisión no se ven en las pestañas. Se conservan plegados en «Más detalle» al pie: «Archivos de reglas completos» (un acordeón por archivo con su Markdown, como antes) e «Historial de decisiones» (id · estado · fecha · frase · título). Lo cubre el caso «D-009» de `tests/estandares-vista.test.ts`.
- Paso 5: ninguna prueba existente se editó. La única que se vio en rojo fue `tests/interfaz-ejecutable.test.ts` («se ejecuta sin errores y pinta la vista del ticket») antes de `npm run build`: el verificador exige que `packages/cli/dist/web/` coincida con la fuente. Después de compilar pasa.
- Paso 6: verificación en Chrome sin pantalla por CDP contra `valmen serve --port 4795` del worktree, con el registro real (11 estándares: 10 aceptados, 1 descartado).
- Desvío de tamaño: el plan preveía unas 700 líneas añadidas más borradas; la entrega tiene unas 1025 (`index.html` +577/−165, de las que unas 300 son estilos con una propiedad por línea, y 283 de pruebas). Supera `delivery-budget` (600) sin cambiar el alcance, porque la vista no tiene un corte con código y pruebas propios. Se informa a quien integra.
- Diferencias con el boceto: D-001 a D-008, D-010 (que ajusta D-009) y una más: la fila abierta muestra «Visto en» (tickets del registro) cuando existe, y el boceto no lo dibuja; queda dentro de D-010. Todas están registradas con `valmen agent-decision` y la persona las ratifica antes de cerrar.

## Pruebas

Contrato de pruebas para el responsable. Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-reglas-estandares` (o la raíz del repositorio una vez integrado). Requisitos: Node 24, `npm install` hecho y `npm run build` antes de la verificación de interfaz y de `valmen serve`.

| Comando | Resultado esperado | Cubre |
|---|---|---|
| `npx vitest run tests/estandares-vista.test.ts` | 10 pruebas pasan | C1 a C15, C18 |
| `npx vitest run tests/api-rutas.test.ts` | 6 pruebas pasan (sin cambios) | C17 |
| `npm run build && node scripts/verificar-interfaz.mjs` | última línea «Interfaz verificada.» | C16 |

Resultados de esta sesión (2026-10-14), antes de traer main: los 36 archivos de prueba que ejecutan la interfaz (los de `tests/` que leen `web/index.html` o usan `scripts/verificar-interfaz.mjs`, incluido el nuevo) pasaron juntos: 604 pruebas. `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.» (14 vistas). `valmen gate qa-mechanical --evaluator command` → APPROVE.

Tras traer main (commit `893c890`, con `.valmen/approval/uses.jsonl` unido por `git merge-file --union` y `tickets/index.md` tomado de main): `npm run build` pasa; los 37 archivos de prueba de interfaz juntos más `tests/estandares.test.ts` suman 38 archivos y 632 pruebas, todas pasan; `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.» (14 vistas). Las capturas se rehicieron sobre la rama fusionada con los mismos resultados. Servidor y Chrome quedaron cerrados.

Evidencia visual con el registro real (Chrome sin pantalla por CDP, `valmen serve --port 4795` del worktree), en `tickets/2026/FEATURE-WEB-REGLAS-ESTANDARES-20261014/evidencia/`: `est-1440-oscuro.png`, `est-1440-claro.png`, `est-1440-oscuro-descartados.png`, `est-390-oscuro.png` y `est-390-claro.png`. Pestañas «En vigor 10 / Propuestos 0 / Descartados 1», las mismas cuentas del boceto. Las 10 filas en vigor cruzan con su propuesta (ningún aviso), en el orden y con las fechas del boceto (EST-011 13 oct … EST-001 27 sep). EST-011 está abierta con su frase literal. En Descartados, EST-005 aparece con «Lo descartaste con estas palabras». Al pulsar EST-010 queda `aria-expanded="true"` y EST-011 `false`. A 390 px, `scrollWidth` = `clientWidth` = 390 en oscuro y en claro.

Validaciones manuales:
1. `node packages/cli/dist/main.js serve --port 4795` y abrir `http://127.0.0.1:4795/#/estandares` a 1440 px, en tema oscuro y claro. Comparar con `.valmen/features/rediseno-mission-control/assets/estandares.png`: migas, título, bajada, pestañas con cuenta, línea de área, lista con EST-011 abierta y su caja ámbar (C20). Hecho en esta sesión: coincide salvo D-001 a D-010.
2. A 390 px de ancho, la página no se desplaza en horizontal y cada fila pone id, fecha y chevrón arriba y el título debajo (C19). Medido en esta sesión.
3. Pulsar «Descartados»: aparece solo EST-005 con su frase. Abrir «Más detalle»: debe mostrar el archivo de reglas completo y el historial de las 11 decisiones.
4. Con una propuesta pendiente (por ejemplo `valmen estandar proponer …` en un registro de prueba), la vista abre en «Propuestos» con la cuenta en ámbar, y los botones «Aceptar y poner en vigor» / «Descartar» deciden como antes. Lo decide una persona; no se hizo sobre el registro real.

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
    "kind": "ux-review",
    "description": "Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "screenshot",
    "description": "Capturas con el registro real (Chrome sin pantalla, valmen serve --port 4795): evidencia/est-1440-oscuro.png, est-1440-claro.png, est-1440-oscuro-descartados.png, est-390-oscuro.png, est-390-claro.png; a 390 px scrollWidth = clientWidth = 390.",
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
    "notes": "Subagente de la corrida orquestada (análisis, plan e implementación en una sesión); el cliente no expone los números de la sesión del subagente.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-reglas-estandares",
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
    "at": "2026-10-14T05:09:29.247Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:56.900Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/estandares.html, .valmen/features/rediseno-mission-control/assets/estandares.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T14:21:23.312Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:35.090Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"D1: ¿Qué muestra la fila abierta de un estándar propuesto, que el boceto no dibuja?\",\"eleccion\":\"Regla, porqué y Visto en, con los botones Aceptar y poner en vigor / Descartar y el aviso de decidir hablando que ya tiene la vista\",\"alternativas\":[\"quitar los botones y decidir solo por la conversación\",\"agregar un campo de frase (exige cambiar el servidor)\"],\"criterio\":\"Conservador: mantiene la única puerta de decisión existente sin escritura nueva; el servidor solo lee decision\",\"fuente\":\"packages/server/web/index.html:5218-5248; packages/server/src/server.ts:1221-1230\",\"reversion\":\"Quitar los botones de la fila del propuesto en vistaEstandares\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:35.522Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"D2: ¿Qué título lleva la caja ámbar de un estándar descartado?\",\"eleccion\":\"Lo descartaste con estas palabras\",\"alternativas\":[\"Lo aceptaste con estas palabras para todos\",\"sin caja en descartados\"],\"criterio\":\"La caja del boceto dice aceptaste; para un descartado sería falso\",\"fuente\":\".valmen/features/rediseno-mission-control/assets/estandares.html (caja ámbar); .valmen/estandares-propuestos.md:57\",\"reversion\":\"Cambiar el texto de la caja en vistaEstandares\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:35.882Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"D3: ¿Qué muestra la caja de un estándar decidido sin frase registrada?\",\"eleccion\":\"Decidido el <fecha>, sin frase registrada.\",\"alternativas\":[\"ocultar la caja\",\"mostrar el relleno del boceto\"],\"criterio\":\"El motor dice que inventar una frase es peor que dejarla sin frase; la vista no decide ni cita por nadie\",\"fuente\":\"packages/engine/src/standards.ts:120-123; .valmen/estandares-propuestos.md:70\",\"reversion\":\"Cambiar el texto en vistaEstandares\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:36.227Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"D4: ¿De dónde salen la regla y el porqué de un estándar en vigor?\",\"eleccion\":\"Del archivo de reglas (sección ## del mismo título), con id, fecha y frase de la propuesta; secciones sin propuesta y propuestas sin sección se listan con su aviso\",\"alternativas\":[\"solo de la propuesta\",\"solo del archivo, sin id ni frase\"],\"criterio\":\"Lo que está en vigor es lo que lee el agente desde el archivo; la regla puede ampliarse tras aceptarla\",\"fuente\":\".valmen/rules/estandares-proceso.md:15; .valmen/estandares-propuestos.md:26; packages/engine/src/standards.ts:345-357\",\"reversion\":\"Tomar regla y porqué de la propuesta en estandaresFilas\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:36.570Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"D5: ¿Qué nombra la línea Área · archivo en cada pestaña?\",\"eleccion\":\"Cada archivo de reglas en En vigor y .valmen/estandares-propuestos.md en Propuestos y Descartados\",\"alternativas\":[\"siempre solo el primer archivo de reglas\"],\"criterio\":\"El boceto muestra un área porque hoy hay un archivo; con varios no se puede elegir uno\",\"fuente\":\"packages/engine/src/standards.ts:398; packages/engine/src/standards.ts:80\",\"reversion\":\"Mostrar una sola línea fija\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:36.908Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"D6: ¿Qué pestaña se abre al entrar y qué pasa con el aviso ámbar de propuestas?\",\"eleccion\":\"Propuestos si hay pendientes, con su cuenta en ámbar; En vigor si no. El aviso suelto se quita\",\"alternativas\":[\"siempre En vigor y conservar el aviso\"],\"criterio\":\"Lo pendiente es lo único que pide acción; sin pendientes coincide con el boceto; el contador del menú sigue avisando\",\"fuente\":\"packages/server/web/index.html:5179-5187; packages/server/web/index.html:12861-12869\",\"reversion\":\"Fijar la pestaña inicial en En vigor\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:37.272Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"D7: ¿Cuántas filas pueden estar abiertas y cuál abre al entrar?\",\"eleccion\":\"Una a la vez, la primera de la pestaña abierta al entrar\",\"alternativas\":[\"todas cerradas al entrar\",\"varias abiertas\"],\"criterio\":\"Es el estado del boceto (abierto: EST-011, una sola)\",\"fuente\":\".valmen/features/rediseno-mission-control/assets/estandares.html (state.abierto)\",\"reversion\":\"Cambiar estandaresAbierto inicial\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:37.615Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-008\",\"pregunta\":\"D8: ¿Qué fecha muestra cada fila?\",\"eleccion\":\"La de la propuesta en formato 13 oct; si falta, la de la decisión; si no, —\",\"alternativas\":[\"la de la decisión\"],\"criterio\":\"El boceto muestra la fecha de propuesta (EST-006 04 oct, decidido 05 oct)\",\"fuente\":\".valmen/estandares-propuestos.md:68-70\",\"reversion\":\"Usar decidedOn en estandaresFecha\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:37.974Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-009\",\"pregunta\":\"D9: ¿Qué pasa con el acordeón por archivo y el Historial plegado de la vista actual?\",\"eleccion\":\"Se quitan; su contenido pasa a las filas de En vigor y Descartados\",\"alternativas\":[\"conservarlos debajo de la lista\"],\"criterio\":\"El boceto no los tiene y duplicarían lo que ya muestran las pestañas\",\"fuente\":\"packages/server/web/index.html:5262-5283; packages/server/web/index.html:5290-5332\",\"reversion\":\"git revert del commit del ticket\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T14:24:42.540Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T14:28:07.779Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización POLITICA-POR-DEFECTO\",\"source\":\"autorizacion\",\"quote\":\"si es necesario que un agente verifique y tome la decision de los analisis, review o planes para que yo no los tenga que tomar en cada punto esta bien y ya al final si hay decisiones tomadas por el agente antes de poder cerrar el ticket yo los apruebo\",\"planHash\":\"sha256:8e411a90f58bd1db8443c4194b6e751d77ea8937d866e493bca539d9961744b3\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-REGLAS-ESTANDARES-20261014-plan-1\",\"receiptStateHash\":\"sha256:8436c22b8179b1fa3161c2c26b2a9e260e76e15a9211c335d3abca9f6216b0f2\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T14:28:08.204Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización POLITICA-POR-DEFECTO (fuente autorizacion, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:8e411a90f58bd1db8443c4194b6e751d77ea8937d866e493bca539d9961744b3."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T14:28:08.204Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T14:28:26.520Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T14:34:37.300Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-010\",\"pregunta\":\"D10 (ajusta D-009 por pedido del orquestador): ¿Se pierde algo al quitar el Historial y el acordeón por archivo?\",\"eleccion\":\"Se conservan en un bloque plegado «Más detalle» al pie: los archivos de reglas completos (acordeón por archivo con el Markdown, como antes) y el historial de decisiones (id · estado · fecha de decisión · frase · título). Además la fila abierta muestra «Visto en» cuando el registro lo tiene\",\"alternativas\":[\"eliminarlos (D-009 original)\",\"dejarlos abiertos bajo la lista\"],\"criterio\":\"Ninguna prueba ni flujo los usa (grep de tarjeta-estandar/historial-estandares en tests y scripts: 0), pero el archivo entero y la fecha de cada decisión no se ven en las pestañas; plegado no compite con el boceto\",\"fuente\":\"packages/server/web/index.html (vistaEstandares, est-mas); tests/estandares-vista.test.ts (D-009)\",\"reversion\":\"Quitar el bloque est-mas de vistaEstandares\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T14:35:55.090Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T14:36:03.080Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T14:36:03.409Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-14",
    "at": "2026-10-14T14:36:38.043Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
