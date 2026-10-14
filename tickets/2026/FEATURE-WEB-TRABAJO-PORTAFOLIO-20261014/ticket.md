---
schema_version: 2
id: FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014
title: Portafolio con una tarjeta por proyecto
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

# FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014

## Solicitud original

Parte del sprint: Trabajo rediseñado: Tickets y detalle con el ciclo de ocho pasos, Features con su tablero y Portafolio por tarjetas.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-TRA-004: Portafolio DEBE mostrar cada proyecto como una tarjeta con lo que espera decisión, agentes y consumo
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Portafolio DEBE mostrar cada proyecto como una tarjeta con lo que espera decisión, agentes y consumo
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
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/portafolio.html` — Boceto aprobado por el PO el 2026-10-14: Portafolio (HTML autónomo, el original) (sha256 de87080f5ab9…)
- `.valmen/features/rediseno-mission-control/assets/portafolio.png` — Captura a 1440 px del boceto aprobado: Portafolio (sha256 92f8f5d1c86f…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la vista Trabajo › Portafolio (`vistaPortafolio` en `packages/server/web/index.html`) y la proyección de solo lectura que la alimenta (`listPortfolioRows` en `packages/server/src/portafolio.ts`). Se reemplaza su aspecto por el del boceto aprobado `.valmen/features/rediseno-mission-control/assets/portafolio.html` (captura `portafolio.png`) sin perder lo que hoy muestra (`.valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md:3-4`). Las demás vistas del mismo `index.html` quedan fuera: las cubren otros tickets del sprint.
- Usuario o rol afectado: el PO o responsable que lleva varios proyectos y abre Mission Control para ver de un vistazo dónde lo esperan, qué agentes trabajan y cuánto se gastó; en el escritorio y en el celular (R-MARCO-006).
- Comportamiento actual: una línea «Solo lectura · Consumo de compuertas del … al …», cuatro tarjetas (proyectos disponibles, compuertas pendientes, corridas detenidas, consumo en USD con seis decimales) y una tabla con una fila por proyecto (nombre, id, ruta, «Instancia actual», disponibilidad por fuente, compuertas y correcciones pendientes, corridas detenidas, consumo y evaluaciones). El rango es siempre el mes calendario: la pantalla no ofrece elegirlo. No dice qué espera decisión de la persona, ni los agentes trabajando, ni el perfil de modelos, ni permite abrir un proyecto desde ahí.
- Comportamiento esperado (boceto): cabecera «Trabajo · Portafolio», título «Todos tus proyectos de un vistazo», bajada «Solo lectura. Para trabajar en uno, ábrelo: el menú cambia a ese proyecto.» y un selector «Rango» (Últimos 7 días, Este mes, Todo). Cuatro cifras: «N de M proyectos disponibles», «esperan tu decisión» (en ámbar), «agentes trabajando» (en lila) y «consumo del rango» (US$ con dos decimales). Una tarjeta por proyecto con su nombre, la marca «abierto ahora» en el proyecto abierto, `project-id · ruta`, las fuentes Máquina y Registro local con su punto de estado, el perfil de modelos, tres cifras (esperan tu decisión, agentes, consumo) y la acción «Ir al inicio del proyecto» (el abierto) o «Abrir este proyecto» (los demás), que cambia el proyecto del menú y lleva a su Inicio. Un proyecto no disponible marca la fuente caída con su motivo y los totales dicen que son parciales (escenario de R-TRA-004). Sigue siendo de solo lectura: no escribe en ningún registro.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no es un defecto, es una funcionalidad que falta. `packages/server/web/index.html:7471` (`vistaPortafolio`) pinta tarjetas genéricas y una tabla (`index.html:7499-7534`) y pide `/api/portafolio` sin rango (`index.html:7474`), así que la pantalla no puede mostrar las piezas del boceto. El dato por proyecto de `packages/server/src/portafolio.ts:56-128` (`listPortfolioRows`) trae disponibilidad por fuente, compuertas, correcciones, corridas detenidas y consumo, pero **no** trae lo que espera decisión, los agentes ni el perfil. Los tres existen en el código y se pueden leer por raíz, sin dato nuevo:
  - Esperan tu decisión: `packages/server/src/inicio.ts:67` (`leerInicio(paths)`) devuelve `pendientes` —decisiones por ratificar, tickets en `awaiting_user_tests` y compuertas en REVIEW sin decidir—; es la misma cuenta que el título y el contador de Inicio (`index.html:11643`, `server.ts:535`). Recibe `RegistryPaths`, que el catálogo ya resuelve por proyecto (`project.paths`, usado en `portafolio.ts:85`).
  - Agentes: `packages/server/src/agentes.ts:574` (`leerAgentesDeCorrida(root, { home, ahora, paths, project })`) lee la sesión orquestadora de Claude Code de esa raíz (`agentes.ts:444-498`, por carpeta del proyecto en `~/.claude/projects`). «Agentes trabajando» es el mismo filtro que usa Inicio y el menú: `index.html:7659` (`agentesVivos`: no principal y estado `trabajando` o `esperando`).
  - Perfil: `packages/adapter/src/routing.ts:730` (`readSeleccionDePerfil(root)`) da el perfil elegido para el proyecto (`seleccion.proyecto`), el mismo que el menú pinta en `index.html:11655` (`marcarPerfilActivo`) vía `server.ts:1687`.
  - Consumo: `packages/engine/src/usage.ts:132` (`usageReport(paths, rango)`) suma el coste de los recibos de compuertas vigentes en el rango; es lo que la vista ya muestra y lo que acepta el endpoint con `desde`/`hasta` (`server.ts:631-676`).
  - Abrir un proyecto: `index.html:3851` (`seleccionarProyecto(projectId)`) ya cambia el proyecto del menú, lo recuerda en `localStorage` y vuelve a navegar; el selector del menú se llena desde el mismo `/api/portafolio` (`index.html:3863`) solo con proyectos disponibles.
- Hipótesis pendientes:
  - H1 (se decide en el plan, verificable con prueba): los totales nuevos (esperan tu decisión, agentes) deben sumarse en la vista a partir de las filas y no en `summarizePortfolio`, porque `tests/portafolio.test.ts:152` compara el resumen con `toEqual` exacto: añadirle campos pondría en rojo una prueba existente.
  - H2: «Todo» del selector se traduce a un `desde` fijo anterior a cualquier registro, porque el endpoint exige fechas válidas `AAAA-MM-DD` (`server.ts:645-660`) y no tiene un modo «sin límite».
  - H3: la lectura de agentes por cada proyecto agrega un recorrido de `~/.claude/projects` por raíz en cada pedido del portafolio; con dos o tres proyectos el coste es el mismo que ya paga Inicio por uno (con caché en `leerConCache`), pero se medirá en la verificación manual.
- Consumidores afectados:
  - `/api/portafolio` (`server.ts:631`): lo leen `vistaPortafolio` y `cargarSelectorDeProyectos` (`index.html:3866`); las filas ganan campos nuevos y opcionales, los existentes no cambian.
  - Pruebas que simulan `/api/portafolio`: `tests/reconexion-mc.test.ts:104,205`, `tests/vista-marco-responsivo.test.ts:164`, `tests/vista-corrida.test.ts:183,228,398,452`, `tests/estado-publico-web.test.ts:202`, `tests/jornadas-progreso-pantalla.test.ts:69` (solo para el selector de proyectos) y `scripts/verificar-interfaz.mjs:287-325`, cuyo simulacro **no** trae `sources` ni los campos nuevos y cuyas afirmaciones (`scripts/verificar-interfaz.mjs:807-818`) exigen ver «Proyecto laboratorio», «3 compuertas pendientes», «2 corridas detenidas», «USD 0.125000», «7 evaluaciones», «No disponible» y «Totales parciales». La vista nueva tiene que conservar esos textos (spec s3: «sin perder lo que hoy muestran») y tolerar filas sin los campos nuevos.
  - `tests/portafolio.test.ts` (servidor): usa `toMatchObject` sobre las filas (campos nuevos compatibles) y `toEqual` sobre el resumen y sobre el cuerpo del endpoint frente a `rows()` (compatible si la lectura es determinista para la misma raíz).
- Archivos y flujo investigados: `packages/server/web/index.html` (`vistaPortafolio` 7471-7533, `enviar` 3684-3720 con `vistaConjunta` en 3686, `seleccionarProyecto` 3851, `cargarSelectorDeProyectos` 3863, `vistaInicio` 3986, `agentesVivos` 7659, `marcarPendientes` 11607, `marcarPerfilActivo` 11655, `TITULOS` 11557 y el enrutado 11803); `packages/server/src/portafolio.ts` (completo); `packages/server/src/server.ts` (endpoint 631-676, `contextoDeProyecto` 315, rechazo de `X-Valmen-Project` para el portafolio 2438); `packages/server/src/inicio.ts:67`; `packages/server/src/agentes.ts:444-640`; `packages/adapter/src/routing.ts:730`; `packages/engine/src/usage.ts:132`; tokens de color de `index.html:77-147` (cian `--acento`, ámbar `--persona`, lila `--modelo`, verde `--ok`, rojo `--error`, con su versión clara); `tests/portafolio.test.ts`; `scripts/verificar-interfaz.mjs`; `tests/helpers/claude.ts` (`escribirSesionDeClaude`, para simular una sesión con subagentes); el boceto `.valmen/features/rediseno-mission-control/assets/portafolio.html` y su captura `.valmen/features/rediseno-mission-control/assets/portafolio.png`; la spec `.valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md:59-71`. Memoria: `valmen memory search "portafolio tarjeta proyecto"` no trae antecedentes de este módulo (solo AP-011, ajeno).
- Riesgos y compatibilidad:
  - Colisión de nombres en `index.html`: otros tickets del sprint editan otras vistas del mismo archivo; todo ayudante, constante o clase nueva lleva el prefijo `portafolio…`/`.port-…` para que la fusión no deje dos declaraciones iguales (la interfaz dejaría de cargar).
  - Pruebas existentes en rojo: `tests/portafolio.test.ts:152` (resumen con `toEqual`) y las afirmaciones del verificador de interfaz; el plan los evita sin editarlas (H1, y conservar los textos en un detalle de la tarjeta).
  - Lectura de `~/.claude/projects` desde el portafolio: es solo lectura y ya la hace `/api/corrida/agentes`; no expone texto de preguntas (no se pide `conTexto`).
  - Solo lectura: la vista no llama a ninguna escritura; «Abrir este proyecto» solo cambia la selección del navegador (`localStorage`), igual que el selector del menú.
  - Datos que el boceto muestra y no existen para todos los casos: un proyecto sin perfil elegido no tiene perfil que mostrar (se dice «sin perfil», como el menú); un proyecto no disponible no tiene cifras (se muestra «—», como hoy).
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia una vista web local y una proyección de lectura del servidor de Mission Control, sin datos sincronizados, sin migración, sin contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: pendiente; la compuerta `plan` se evalúa con `--evaluator cascade` y la aprobación es de la política por defecto o de una persona, no de este agente.
- Alcance: la vista `vistaPortafolio` de `packages/server/web/index.html` con sus ayudantes y estilos nuevos, y la proyección `listPortfolioRows` de `packages/server/src/portafolio.ts` (campos nuevos y opcionales por proyecto). Exclusiones: el menú lateral, el selector de proyecto del menú y las demás vistas (otros tickets del sprint); `summarizePortfolio` y el contrato existente de `/api/portafolio` no cambian; ninguna escritura nueva.
- Pasos ordenados:
  1. Pruebas primero, vistas en rojo antes de tocar el código: `tests/portafolio-tarjetas.test.ts` (raíces de laboratorio en una carpeta temporal, `HOME` y reloj inyectados, sesión de Claude con subagentes simulada con `escribirSesionDeClaude` de `tests/helpers/claude.ts`, `profiles.yaml` con un perfil elegido) para C1, C2, C3 y C4; `tests/portafolio-vista.test.ts` con `ejecutarInterfaz` y `disparar` de `scripts/verificar-interfaz.mjs` para C6 a C14, C16 y C19; entre sus casos, uno dispara `change` en el selector «Rango» y comprueba que el pedido siguiente a `/api/portafolio` lleva el `desde` y el `hasta` de la opción elegida (C8), y otro, con un proyecto `available: false` y `summary.unavailable: 1`, comprueba que bajo las cifras se pinta «Totales parciales: hay proyectos no disponibles.» (C14). Comando: `npx vitest run tests/portafolio-tarjetas.test.ts tests/portafolio-vista.test.ts` (C1, C2, C3, C4, C6, C7, C8, C9, C10, C11, C12, C13, C14, C16, C19).
  2. `packages/server/src/portafolio.ts`: `PortfolioRow` gana `decisionsPending` (largo de `leerInicio(project.paths).pendientes`, `packages/server/src/inicio.ts:67`), `agentsWorking` (subagentes de `leerAgentesDeCorrida(project.root, { home, ahora, paths, project })` que no son la sesión principal y están `trabajando` o `esperando`, el mismo filtro que `agentesVivos` en `packages/server/web/index.html:7659`, en un ayudante `portfolioLiveAgents`), `profile` (`readSeleccionDePerfil(project.root).proyecto`, `packages/adapter/src/routing.ts:730`) y `profileError`; todos `null` en un proyecto no disponible. `listPortfolioRows` acepta un cuarto parámetro opcional `{ home, ahora }`. Agentes y perfil se leen en su propio `try`: si fallan, ese dato queda `null` (el perfil, con su motivo) sin marcar el registro como caído (C1, C2, C3, C4).
  3. `packages/server/src/server.ts:665`: el endpoint pasa `{ home: context.home }` a `listPortfolioRows` cuando está declarado; el resto del endpoint, su validación de rango y `summarizePortfolio` quedan igual (C2, C5).
  4. `packages/server/web/index.html`, `vistaPortafolio` y ayudantes nuevos, todos con prefijo propio para no chocar con las otras vistas del archivo: `portafolioRangoElegido` (lee y recuerda el rango en `localStorage` con `try/catch`), `portafolioFechasDe(rango)` (Últimos 7 días: de hoy menos seis a hoy; Este mes: sin parámetros, el mes del servidor; Todo: desde `2000-01-01` hasta hoy), `portafolioDinero(usd)` (US$ con dos decimales y coma decimal), `portafolioCifra`, `portafolioFuente` y `portafolioTarjeta(proyecto, abierto)`. Cabecera «Trabajo · Portafolio», título, bajada de solo lectura y selector «Rango»; el evento `change` del selector recuerda la opción y vuelve a llamar a `vistaPortafolio`, que pide `/api/portafolio?desde=…&hasta=…` con las fechas de `portafolioFechasDe` (C6, C8); cuatro cifras, con «esperan tu decisión» y «agentes trabajando» sumadas desde las filas (C7); cuando `summary.unavailable > 0`, justo debajo de la fila de cifras se pinta la línea «Totales parciales: hay proyectos no disponibles.» con la clase `resultado`, el mismo texto que la vista ya pinta hoy (`packages/server/web/index.html:7494`) (C14); una tarjeta por proyecto con nombre, «abierto ahora», `project-id · ruta`, fuentes con punto verde o rojo y su motivo, perfil, tres cifras y una línea de detalle que conserva compuertas pendientes, correcciones pendientes, corridas detenidas, evaluaciones, el USD exacto con seis decimales y los recibos ilegibles (C9, C10, C13, C14, C15); «Abrir este proyecto» / «Ir al inicio del proyecto» fija `location.hash = "#/inicio"`, actualiza el selector del menú y llama a `seleccionarProyecto(projectId)` (C10, C11, C12); el proyecto abierto es el elegido en el menú o, en la vista conjunta, el de la instancia (`current`). Una fila sin los campos nuevos (el simulacro de `scripts/verificar-interfaz.mjs`) se pinta con «—». La vista solo hace `GET` (C19).
  5. Estilos `.port-*` en el bloque de estilos de `packages/server/web/index.html`, con los tokens existentes (`--panel`, `--borde`, `--acento`, `--persona`, `--modelo`, `--ok`, `--error`, `--fuente-titulo`, `--mono`) y sin colores a mano: rejilla de cifras `repeat(auto-fit, minmax(min(100%, 150px), 1fr))` y de tarjetas `repeat(auto-fit, minmax(min(100%, 380px), 1fr))`, y las tres cifras de la tarjeta bajan a una columna por debajo de 480 px (C16, C17, C18).
  6. Regresión sin editar pruebas existentes: `npx vitest run tests/portafolio.test.ts tests/reconexion-mc.test.ts tests/vista-marco-responsivo.test.ts tests/vista-corrida.test.ts tests/estado-publico-web.test.ts tests/jornadas-progreso-pantalla.test.ts tests/menu-grupos.test.ts`, `npm run build` y `node scripts/verificar-interfaz.mjs` («Interfaz verificada.») (C5, C15). Si una prueba existente se pone en rojo, se detiene la implementación y se reporta en el ticket.
  7. Verificación en el navegador con `valmen serve`, a 1440 px contra `.valmen/features/rediseno-mission-control/assets/portafolio.png` y a 375 px, y `revisar_presentacion` sobre el cambio (C17, C18).
- Respuesta al diagnóstico:
  - Hallazgo «la vista pinta tarjetas genéricas y una tabla, sin rango» (`packages/server/web/index.html:7471`, `packages/server/web/index.html:7499-7534`, `packages/server/web/index.html:7474`) → paso 4 (reescritura de `vistaPortafolio` y selector «Rango») y paso 5 (estilos) → C6, C7, C8, C9, C16, C17, C18 → D2, D7.
  - Hallazgo «la fila no trae lo que espera decisión» (`packages/server/src/inicio.ts:67`, `packages/server/src/portafolio.ts:56-128`) → paso 2 (`decisionsPending`) y paso 4 (cifra por tarjeta y suma) → C1, C7, C9 → D8.
  - Hallazgo «la fila no trae los agentes» (`packages/server/src/agentes.ts:574`, filtro `agentesVivos` en `packages/server/web/index.html:7659`) → pasos 2 y 3 (`agentsWorking`, `home` del contexto) → C2, C7, C9.
  - Hallazgo «la fila no trae el perfil» (`packages/adapter/src/routing.ts:730`, `packages/server/web/index.html:11655`) → paso 2 (`profile`, `profileError`) y paso 4 → C3, C9 → D5.
  - Hallazgo «el consumo es el de recibos de compuertas» (`packages/engine/src/usage.ts:132`, `packages/server/src/server.ts:631-676`) → paso 4 (`portafolioDinero`, detalle exacto) → C7, C15 → D1.
  - Hallazgo «abrir un proyecto ya existe» (`packages/server/web/index.html:3851`, `packages/server/web/index.html:3863`) → paso 4 (acciones de la tarjeta) → C10, C11, C12 → D6.
  - Escenario «Proyecto no disponible» (`.valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md:68-71`, `packages/server/web/index.html:7494`) → paso 4 (fuente caída con motivo, cifras «—», línea de totales parciales) → C4, C13, C14 → D6.
  - Hipótesis H1, resumen con `toEqual` (`tests/portafolio.test.ts:152`) → paso 4 suma en la vista y paso 6 corre la prueba sin editarla → C5.
  - Hipótesis H2, el endpoint exige fechas válidas (`packages/server/src/server.ts:645-660`) → paso 4 (`portafolioFechasDe`, «Todo» desde `2000-01-01`) → C8 → D2.
  - Hipótesis H3, coste de leer agentes por raíz (`packages/server/src/agentes.ts:444-498`) → paso 7 (verificación en el navegador) → C17, C18.
  - Consumidor «simulacro y afirmaciones del verificador» (`scripts/verificar-interfaz.mjs:287-325`, `scripts/verificar-interfaz.mjs:807-818`) → paso 4 (filas sin campos nuevos con «—», línea de detalle) y paso 6 → C15 → D3.
  - Riesgo «colisión de nombres en `index.html`» → pasos 4 y 5 (prefijos `portafolio…` y `.port-…`) y paso 6 (`node scripts/verificar-interfaz.mjs`) → C15.
- Diferencias con el boceto (cada una registrada con `valmen agent-decision`):
  - D1 «consumo» es el consumo de compuertas del rango (`usageReport`, `packages/engine/src/usage.ts:132`), el mismo que la vista ya mostraba; no suma el `## Consumo de IA` de las sesiones.
  - D2 «Todo» se pide como `desde=2000-01-01` hasta hoy, porque el endpoint exige fechas válidas; el rango por defecto es «Últimos 7 días», como en el boceto, y se recuerda en el navegador.
  - D3 La tarjeta añade, debajo de sus tres cifras, una línea de detalle con lo que la vista ya mostraba (compuertas pendientes, correcciones, corridas detenidas, evaluaciones, USD exacto, recibos ilegibles): la spec s3 pide no perderlo y el verificador de interfaz lo exige.
  - D4 La ruta se muestra absoluta, como la entrega el servidor; el boceto la abrevia con `~`.
  - D5 El perfil es el id real elegido para cada proyecto, o «sin perfil» si no hay elección; el boceto pone «perfil del proyecto» como relleno.
  - D6 Un proyecto no disponible no ofrece «Abrir este proyecto» (el menú tampoco lo lista) y sus cifras se muestran «—»; el boceto no dibuja ese caso.
  - D7 La nota al pie «Cifras de ejemplo en este boceto.» se reemplaza por la del rango real: «Consumo de compuertas del … al …».
  - D8 La cifra «esperan tu decisión» del encabezado va en ámbar solo cuando es mayor que cero; con cero queda neutra.
- Impactos declarados: ninguno; sin sincronización, sin migración y sin contenedores.
- Tamaño previsto: unas 560 líneas (290 de producción —unas 45 en `portafolio.ts`, 1 en `server.ts`, 170 de vista y 75 de estilos en `index.html`— y 270 de pruebas), 19 criterios.
- Si excede el tope: no excede el tope.
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`); no hay datos, migraciones ni configuración que deshacer, y los campos nuevos de `/api/portafolio` son aditivos, así que ningún consumidor depende de ellos al revertir.

## Criterios de aceptación

- [x] C1 (R-TRA-004): cada proyecto disponible de `/api/portafolio` trae `decisionsPending` igual a la cantidad de pendientes que Inicio cuenta para esa raíz.
      <!-- test: npx vitest run tests/portafolio-tarjetas.test.ts -->
- [x] C2 (R-TRA-004): cada proyecto disponible trae `agentsWorking` con los subagentes vivos de la sesión de Claude Code de esa raíz, sin contar la sesión principal ni los terminados.
      <!-- test: npx vitest run tests/portafolio-tarjetas.test.ts -->
- [x] C3 (R-TRA-004): cada proyecto disponible trae `profile` con el perfil de modelos elegido para esa raíz, que es `null` sin elección.
      <!-- test: npx vitest run tests/portafolio-tarjetas.test.ts -->
- [x] C4 (R-TRA-004): un proyecto no disponible trae `decisionsPending`, `agentsWorking`, `profile` en `null`.
      <!-- test: npx vitest run tests/portafolio-tarjetas.test.ts -->
- [x] C5 (regresión): `/api/portafolio` conserva su contrato anterior: filas, resumen, validación del rango, rechazo de otros parámetros.
      <!-- test: npx vitest run tests/portafolio.test.ts -->
- [x] C6 (R-TRA-004): Portafolio pinta el título «Todos tus proyectos de un vistazo» con la bajada de solo lectura.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C7 (R-TRA-004): Portafolio pinta cuatro cifras: «proyectos disponibles», «esperan tu decisión», «agentes trabajando», «consumo del rango».
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C8 (R-TRA-004): cambiar el selector «Rango» vuelve a pedir `/api/portafolio` con las fechas de la opción elegida.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C9 (R-TRA-004): cada proyecto se pinta como una tarjeta con nombre, ruta, fuentes «Máquina» / «Registro local», perfil, tres cifras.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C10 (R-TRA-004): la tarjeta del proyecto abierto lleva «abierto ahora» con la acción «Ir al inicio del proyecto».
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C11 (R-TRA-004): las demás tarjetas disponibles ofrecen «Abrir este proyecto».
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C12 (R-TRA-004): pulsar «Abrir este proyecto» lleva al Inicio de ese proyecto, que queda elegido en el menú.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C13 (R-TRA-004, escenario «Proyecto no disponible»): la tarjeta de un proyecto no disponible marca la fuente caída con su motivo.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C14 (R-TRA-004, escenario «Proyecto no disponible»): con un proyecto no disponible, los totales avisan que son parciales.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C15 (regresión): la interfaz carga todas sus vistas con Portafolio conservando lo que mostraba: compuertas pendientes, corridas detenidas, evaluaciones, consumo exacto.
      <!-- test: node scripts/verificar-interfaz.mjs -->
- [x] C16 (R-MARCO-006): las rejillas de Portafolio usan columnas acotadas con `min(100%, …)`, que caben en 375 px.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->
- [x] C17 (R-MARCO-006): a 375 px de ancho Portafolio se lee sin desplazamiento horizontal.
      <!-- verify: manual -->
- [x] C18 (R-TRA-004): a 1440 px Portafolio coincide con `.valmen/features/rediseno-mission-control/assets/portafolio.png` salvo las diferencias D1 a D8 del plan.
      <!-- verify: manual -->
- [x] C19 (R-TRA-004): Portafolio sigue siendo de solo lectura: todos sus pedidos son `GET`, también al cambiar el rango.
      <!-- test: npx vitest run tests/portafolio-vista.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Modo: harness completo (FEATURE de varios módulos: servidor y vista), plan aprobado por el revisor (recibo `GR-20261014-FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014-plan-2`).
- Paso 1, pruebas primero: `tests/portafolio-tarjetas.test.ts` (3 casos de una tabla) y `tests/portafolio-vista.test.ts` (5 casos) se vieron en rojo antes de tocar el código (3 y 5 fallos) y en verde después.
- Paso 2: `packages/server/src/portafolio.ts` añade a `PortfolioRow` `decisionsPending`, `agentsWorking`, `profile` y `profileError`, el tipo `PortfolioOptions`, el ayudante `portfolioLiveAgents` y `portfolioExtras` (agentes y perfil en su propio `try`). `listPortfolioRows` acepta un cuarto parámetro opcional `{ home, ahora }`. `summarizePortfolio` no cambia.
- Paso 3: `packages/server/src/server.ts`, en `GET /api/portafolio`, pasa `{ home: context.home }` cuando está declarado. No hay ruta nueva.
- Pasos 4 y 5: `packages/server/web/index.html` reemplaza `vistaPortafolio` y añade `PORTAFOLIO_RANGOS`, `PORTAFOLIO_CLAVE_RANGO`, `portafolioRangoElegido`, `portafolioDia`, `portafolioFechasDe`, `portafolioDinero`, `portafolioCifra`, `portafolioSuma`, `portafolioFuente`, `portafolioAbrir` y `portafolioTarjeta`, y los estilos `.port-*` (solo tokens, `valmen estandar revisar`: 0 colores fijos). El título de la tarjeta anula el estilo global de `h2` (mayúsculas y color tenue), visto en la primera captura.
- Paso 6: ninguna prueba existente se editó ni se puso en rojo.
- Paso 7: verificación en Chrome sin pantalla por CDP contra `valmen serve --port 4791` del worktree, con el catálogo real de la máquina (ValmenHarness y SaiOpenCloud).
- Desvío de tamaño: el plan preveía unas 560 líneas y la entrega tiene unas 900 (502 de producción: 70 en `portafolio.ts`, 7 en `server.ts`, 426 añadidas en `index.html`, de las que unas 230 son estilos en el formato de una propiedad por línea del archivo; 343 de pruebas). Supera `delivery-budget` (600) sin cambiar el alcance: no hay un corte que deje código y pruebas propios en cada parte, porque la vista consume los campos del servidor. Se informa para que lo valore quien integra.
- Diferencias con el boceto: D-001 a D-008 del plan, registradas con `valmen agent-decision`; la persona las ratifica antes de cerrar.

## Pruebas

Contrato de pruebas para el responsable. Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-trabajo-portafolio` (o la raíz del repositorio una vez integrado). Requisitos: Node 24, `npm install` hecho, `npm run build` antes de la verificación de interfaz y de `valmen serve`.

| Comando | Resultado esperado | Cubre |
|---|---|---|
| `npx vitest run tests/portafolio-tarjetas.test.ts` | 3 pruebas pasan | C1, C2, C3, C4 |
| `npx vitest run tests/portafolio.test.ts` | 20 pruebas pasan (sin cambios) | C5 |
| `npx vitest run tests/portafolio-vista.test.ts` | 5 pruebas pasan | C6 a C14, C16, C19 |
| `npm run build && node scripts/verificar-interfaz.mjs` | última línea «Interfaz verificada.» | C15 |

Resultados de esta sesión (2026-10-14): `npx vitest run tests/portafolio-tarjetas.test.ts tests/portafolio-vista.test.ts tests/portafolio.test.ts` → 28 pruebas pasan; las 22 pruebas de interfaz juntas (los archivos de `tests/` que usan `scripts/verificar-interfaz.mjs` o `web/index.html`) → 304 pruebas pasan; `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.» (14 vistas ejecutadas).

Tras traer main (commit `1135b02`, con `uses.jsonl` unido por `git merge-file --union` y `tickets/index.md` tomado de main): `npm run build` en verde; los 23 archivos de prueba de interfaz juntos más `tests/portafolio-tarjetas.test.ts`, `tests/portafolio.test.ts` y `tests/api-rutas.test.ts` → 26 archivos, 348 pruebas pasan; `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.».

Hallazgo durante la fusión: la primera versión pedía el portafolio con una plantilla con acento grave (`/api/portafolio${…}`), y `tests/api-rutas.test.ts` —prueba existente, que no se editó— la leyó como ruta no declarada: lista solo las URL escritas como plantilla, y `GET /api/portafolio` no está en su lista porque la interfaz la pedía entre comillas dobles. No es una ruta nueva: se volvió a pedir entre comillas dobles más la consulta, como `cargarSelectorDeProyectos`, y la prueba pasa sin cambios. Declarar `GET /api/portafolio` en esa lista queda como decisión de quien integra.

Evidencia visual con el catálogo real (ValmenHarness y SaiOpenCloud), Chrome sin pantalla por CDP contra `valmen serve --port 4791` del worktree: `tickets/2026/FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014/evidencia/port-1440-dark.png`, `port-1440-light.png`, `port-390-dark.png` y `port-390-light.png`. A 390 px, `scrollWidth` = `clientWidth` = 390 en ambos temas. En el navegador real: cambiar «Rango» a «Todo» deja la nota «Consumo de compuertas del 2000-01-01 al 2026-10-14.», y pulsar «Abrir este proyecto» en SaiOpenCloud deja `#/inicio`, `valmen.project` = `saiopencloud` y el selector del menú en SaiOpenCloud.

Validaciones manuales:
1. `node packages/cli/dist/main.js serve --port 4791` y abrir `http://127.0.0.1:4791/#/portafolio` a 1440 px, en tema oscuro y claro. Comparar con `.valmen/features/rediseno-mission-control/assets/portafolio.png`: cabecera, selector «Rango», cuatro cifras, una tarjeta por proyecto con fuentes, perfil, tres cifras y acción (C18). Hecho en esta sesión con Chrome sin pantalla: coincide salvo D-001 a D-008. Con la vista conjunta y el servidor arrancado desde un worktree, ninguna tarjeta dice «abierto ahora», porque la raíz del worktree no es la del catálogo; al elegir un proyecto en el menú, su tarjeta pasa a «abierto ahora».
2. A 390 px de ancho, la página no se desplaza en horizontal (C17). Medido en esta sesión: `scrollWidth` 390 = `clientWidth` 390, en oscuro y en claro.
3. Cambiar «Rango» a «Todo» y a «Este mes»: la nota al pie cambia de fechas. Pulsar «Abrir este proyecto» en SaiOpenCloud: el menú pasa a SaiOpenCloud y se abre su Inicio.

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
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de corrida orquestada (claude-opus-5-5) en el worktree ticket-trabajo-portafolio; el subagente no expone los números de su sesión",
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
    "at": "2026-10-14T05:09:28.667Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:56.420Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/portafolio.html, .valmen/features/rediseno-mission-control/assets/portafolio.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T13:42:14.646Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:09.245Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"D1: ¿qué consumo muestra la tarjeta y el total «consumo del rango»?\",\"eleccion\":\"El consumo de compuertas del rango (usageReport), el que la vista ya mostraba\",\"alternativas\":[\"Sumar el Consumo de IA de las sesiones\",\"Sumar ambos\"],\"criterio\":\"Conserva la fuente y el contrato existentes; el Consumo de IA no tiene una lectura por rango en el endpoint y cambiar la fuente excede el alcance de la vista\",\"fuente\":\"packages/engine/src/usage.ts:132; packages/server/src/portafolio.ts:111\",\"reversion\":\"Cambiar la fuente en listPortfolioRows y el rótulo de la vista\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:09.608Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"D2: ¿cómo se pide «Todo» y cuál es el rango por defecto?\",\"eleccion\":\"Todo = desde 2000-01-01 hasta hoy; por defecto «Últimos 7 días», recordado en el navegador\",\"alternativas\":[\"Por defecto «Este mes» como hoy\",\"Añadir un modo sin límite al endpoint\"],\"criterio\":\"El endpoint exige fechas válidas AAAA-MM-DD; el boceto aprobado muestra «Últimos 7 días» elegido\",\"fuente\":\"packages/server/src/server.ts:645; .valmen/features/rediseno-mission-control/assets/portafolio.html\",\"reversion\":\"Cambiar portafolioFechasDe y el valor por defecto en la vista\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:09.995Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"D3: ¿se conserva el detalle que la vista mostraba aunque el boceto no lo dibuje?\",\"eleccion\":\"Sí, en una línea de detalle debajo de las tres cifras de la tarjeta\",\"alternativas\":[\"Quitarlo para calcar el boceto\"],\"criterio\":\"La spec s3 pide reemplazar el aspecto sin perder lo que hoy muestran y el verificador de interfaz exige esos textos\",\"fuente\":\".valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md:3; scripts/verificar-interfaz.mjs:807\",\"reversion\":\"Quitar la línea de detalle de portafolioTarjeta\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:10.524Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"D4: ¿la ruta se abrevia con ~ como en el boceto?\",\"eleccion\":\"Se muestra absoluta, como la entrega el servidor\",\"alternativas\":[\"Abreviar con ~ en el servidor\",\"Abreviar en el navegador\"],\"criterio\":\"El navegador no conoce el HOME y añadir un campo al contrato solo por estética no compensa; la ruta absoluta es la verdadera\",\"fuente\":\"packages/server/src/portafolio.ts:66\",\"reversion\":\"Añadir la abreviatura en la vista o en el servidor\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:10.865Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"D5: ¿qué perfil muestra la tarjeta de un proyecto?\",\"eleccion\":\"El id real elegido para ese proyecto, o «sin perfil» si no hay elección\",\"alternativas\":[\"Poner «perfil del proyecto» como el boceto\"],\"criterio\":\"readSeleccionDePerfil lee la elección de cada raíz; el texto del boceto es de relleno y el menú usa «sin perfil»\",\"fuente\":\"packages/adapter/src/routing.ts:730; packages/server/web/index.html:11655\",\"reversion\":\"Cambiar el texto en portafolioTarjeta\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:11.205Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"D6: ¿qué ofrece la tarjeta de un proyecto no disponible?\",\"eleccion\":\"Sin acción para abrirlo y con sus cifras en «—», con la fuente caída y su motivo\",\"alternativas\":[\"Mostrar el botón deshabilitado\"],\"criterio\":\"El selector del menú solo lista proyectos disponibles; el boceto no dibuja este caso y la spec pide marcar la fuente con el motivo\",\"fuente\":\"packages/server/web/index.html:3869; .valmen/features/rediseno-mission-control/spec/s3-trabajo/spec.md:68\",\"reversion\":\"Añadir la acción deshabilitada en portafolioTarjeta\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:11.541Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"D7: ¿qué nota va al pie de la vista?\",\"eleccion\":\"«Consumo de compuertas del … al …» con el rango real, en lugar de «Cifras de ejemplo en este boceto.»\",\"alternativas\":[\"Sin nota al pie\"],\"criterio\":\"La nota del boceto solo describe el boceto; la del rango ya existía y explica la cifra de consumo\",\"fuente\":\"packages/server/web/index.html:7477\",\"reversion\":\"Cambiar el texto de la nota\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:11.898Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-008\",\"pregunta\":\"D8: ¿la cifra «esperan tu decisión» va siempre en ámbar?\",\"eleccion\":\"En ámbar solo cuando es mayor que cero; con cero queda neutra\",\"alternativas\":[\"Siempre en ámbar como el boceto\"],\"criterio\":\"El ámbar en este diseño significa que algo espera a la persona; con cero no espera nada\",\"fuente\":\"packages/server/web/index.html:102\",\"reversion\":\"Quitar la condición en vistaPortafolio\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T13:47:15.689Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T13:50:46.388Z",
    "action": "reviewer-rejected",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014-plan-1\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"reviewerModel\":\"claude-sonnet-5-5\",\"reason\":\"C8 y la compatibilidad hacia atrás están respaldados. C14 no lo está: el plan nunca describe el aviso de totales parciales. La correspondencia con el diagnóstico tampoco está respaldada, porque el artefacto no incluye ningún diagnóstico con el que compararla. Basta una proposición sin respaldo para rechazar.\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T13:53:25.427Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El plan respalda las cuatro proposiciones. Cada criterio C1 a C19 tiene un paso y una verificación asignados. La respuesta al diagnóstico enlaza cada hallazgo con pasos y criterios. Los cambios son aditivos y hay pruebas de regresión que se corren sin editarlas.\",\"planHash\":\"sha256:121f92e1e20718661e5140a359d8547b3877073d20388d5bbf6693a32bb47036\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014-plan-2\",\"receiptStateHash\":\"sha256:a3138bed98c0979d6a8073c1ebc13bd2c5cc60b1a00b3d83a242ed7ece1285c3\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T13:53:35.576Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:121f92e1e20718661e5140a359d8547b3877073d20388d5bbf6693a32bb47036."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T13:53:35.576Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T13:53:44.458Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T14:02:12.534Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T14:03:24.261Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T14:03:24.756Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
