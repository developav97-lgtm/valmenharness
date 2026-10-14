---
schema_version: 2
id: FEATURE-WEB-AJUSTES-PROYECTO-20261014
title: Proyecto con bloques e interruptores y YAML en Avanzado
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

# FEATURE-WEB-AJUSTES-PROYECTO-20261014

## Solicitud original

Parte del sprint: Ajustes rediseñados: Modelos con perfil activo y roles agrupados, cambio de perfil con vista previa, Proveedores y Proyecto por bloques.
- R-MARCO-006: Cada pantalla DEBERÍA funcionar en el celular
- R-AJU-006: Proyecto DEBE presentar la configuración como bloques con interruptores y dejar el YAML en «Avanzado»
Depende de: FEATURE-WEB-MENU-GRUPOS-20261014.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Cada pantalla DEBERÍA funcionar en el celular Proyecto DEBE presentar la configuración como bloques con interruptores y dejar el YAML en «Avanzado»
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-MARCO-006: lo cubre FEATURE-WEB-MENU-GRUPOS-20261014 (Menú por grupos con proyecto, perfil activo y Pedir un cambio)
- R-MARCO-006: lo cubre FEATURE-WEB-INICIO-DECISIONES-20261014 (Inicio con lo que espera una decisión de la persona)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-MODELOS-20261014 (Vista Modelos con perfil activo, roles agrupados y aviso de cliente)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014 (Cambiar de perfil con vista previa de lo que cambia)
- R-MARCO-006: lo cubre FEATURE-WEB-AJUSTES-PROVEEDORES-20261014 (Proveedores con estado y uso por el perfil activo)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-TICKETS-20261014 (Tickets y detalle con filtro por turno y ciclo de ocho pasos)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-FEATURES-20261014 (Features con estado y tablero de recorrido y siguiente paso)
- R-MARCO-006: lo cubre FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (Portafolio con una tarjeta por proyecto)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-AGENTES-20261014 (Agentes con titular, pregunta pendiente y selector de mundo)
- R-MARCO-006: lo cubre FEATURE-WEB-VIVO-PROCESOS-20261014 (Procesos con las corridas detenidas primero)
- R-MARCO-006: lo cubre FEATURE-WEB-REGLAS-ESTANDARES-20261014 (Estándares separados en vigor, propuestos y descartados)

### Referencias de diseño

Adjuntos que citan los requisitos de este ticket. Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/rediseno-mission-control/assets/proyecto.html` — Boceto aprobado por el PO el 2026-10-14: Ajustes › Proyecto (HTML autónomo, el original) (sha256 2bad9a01646d…)
- `.valmen/features/rediseno-mission-control/assets/proyecto.png` — Captura a 1440 px del boceto aprobado: Ajustes › Proyecto (sha256 7b547f50f4cc…)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la vista Ajustes › Proyecto de Mission Control (`#/proyecto`, también `#/configuracion`), es decir `vistaConfiguracion()` de `packages/server/web/index.html`, rediseñada según el boceto aprobado `.valmen/features/rediseno-mission-control/assets/proyecto.html` (captura `proyecto.png`), más lo mínimo del servidor que haga falta para que los bloques tengan dato real. No entra el menú, ni otras vistas, ni `conRevocacion()`/`grupoDeCasillas()` (compartidas), ni la semántica de las autorizaciones del motor.
- Usuario o rol afectado: el PO (Juan Andrade) y quien configure el harness de un proyecto desde Mission Control; las escrituras de autorizaciones siguen siendo de una persona con actor y frase literal.
- Comportamiento actual: la vista abre con una nota sobre el subconjunto de YAML, el título «Configuración del proyecto», la ruta y el `textarea` crudo de `config.yaml`; debajo «Lo que el harness entiende», «Aprobación por defecto» como lista de texto con el comando de CLI para revocarla, «Políticas autónomas», un «Avanzado» con los formularios completos de autorizaciones explícitas (QA y aprobación) y al final las diferencias y «Guardar». No hay bloques con interruptores, ni bloque de Avisos, ni de Pruebas, y la aprobación por defecto no se puede apagar desde la pantalla.
- Comportamiento esperado: según el boceto, el encabezado «Ajustes · Proyecto», el título «Cómo trabaja el harness en <nombre>» y la bajada «Antes «Configuración». Cada cambio muestra las diferencias del archivo antes de guardarse.»; luego los bloques «Quién aprueba el análisis y el plan» (estado activa/apagada con interruptor, «El agente decide», «Tú ratificas», «Siempre tuyo» y el candado «Crear o ampliar esta autorización lo hace una persona; el agente no puede.»), «QA por agente» (estado y «Crear autorización»), «Avisos» (interruptores por canal) y «Pruebas» (comandos permitidos con «+ añadir» y «Tiempo máximo» en segundos), y al final «Avanzado: editar config.yaml a mano», plegado, con el editor y sus diferencias antes de guardar. Apagar la aprobación por defecto pide actor y frase literal antes de revocarla y sin ellos no cambia nada (escenario de R-AJU-006). La vista funciona en el celular (R-MARCO-006, la parte de esta vista).

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
  - La vista es un editor de texto con paneles, no bloques: `packages/server/web/index.html:9516-10019` (`vistaConfiguracion`) pinta nota, `h2` «Configuración del proyecto» y el `textarea` arriba (`:9523-9538`, `:9794`), y el orden final está en `:10014-10017`. No existe ningún interruptor (`role="switch"`) en `index.html` (búsqueda sin resultados), así que hay que crear el control y sus estilos.
  - La aprobación por defecto se muestra como texto y comando de CLI (`index.html:9985-10005`, «Para volver a aprobar tú: valmen approval-authorize revoke --id POLITICA-POR-DEFECTO …»), sin acción en pantalla.
  - La pantalla no puede saber si la aprobación por defecto está activa: `GET /api/approval/authorizations` (`packages/server/src/server.ts:1991-1993`) devuelve `listarAutorizacionesDeAprobacion` (`packages/server/src/approval-autorizaciones.ts:31-40`), que lee `leerAutorizacionesDeAprobacion` del motor (`packages/engine/src/approval-authorization.ts:403-408`) y esa solo trae las del registro; la política por defecto no vive en el registro (`:363-401`) y solo la suma `autorizacionesQueRespaldan` (`:414-423`, privada; la pública es `autorizacionQueRespalda(root, id, hash)` en `:426-433`, exportada vía `packages/engine/src/index.ts:127`). Una revocación de `POLITICA-POR-DEFECTO` sí es posible por la misma ruta (`approval-authorization.ts:335-341` acepta ese id) y queda como entrada `approval-authorization-revoked` que `conEstado` (`:435-460`) solo aplica a una entrada `created`.
  - Pruebas y Avisos no tienen dato en la respuesta: `ConfigSummary` (`packages/server/src/config.ts:44-55`) solo expone nombre, descripción, registro, gates, claves, adopción y políticas; `checkConfig` (`:180-198`) no resume `test-commands` (`.valmen/config.yaml:25-28`), `test-timeout` (`:31`) ni el bloque `hermes:` que lee `readHermesConfig` (`packages/adapter/src/config.ts:508-533`: `enabled`, `notify.gate`, `notify.budget`). El `config.yaml` de este proyecto no tiene bloque `hermes:` (búsqueda sin resultados).
  - QA por agente hoy pinta su lista y el formulario completo dentro de «Avanzado» (`index.html:9797-9885`, `:10006-10013`); el boceto lo quiere como bloque propio con estado y «Crear autorización».
- Hipótesis pendientes (se resuelven en el plan con `valmen agent-decision`, sin planificar sobre la adivinanza):
  - H1 — Avisos: el boceto tiene un interruptor por canal (Telegram encendido, Slack apagado), pero el único dato en `config.yaml` es `hermes.enabled` con un destino por tipo (`notify.gate`, `notify.budget`); los avisos de la jornada salen con `--to telegram` por el gateway (`packages/cli/src/commands.ts:4475`, estándar «Gateway y avisos por Telegram»), fuera de `config.yaml`. Falta decidir qué refleja cada interruptor y si escribe en el archivo.
  - H2 — Encender la aprobación por defecto: la revocación es append-only y no hay forma de volver a crear `POLITICA-POR-DEFECTO`; encenderla equivale a que una persona cree una autorización explícita con actor y frase (`POST /api/approval/authorizations`, `approval-autorizaciones.ts:42-78`). Falta decidir qué hace el interruptor en ese sentido.
  - H3 — «Crear autorización» de QA: se supone que abre el formulario actual (actor, frase, tipos, módulos, riesgo, cupo, vigencia) y no crea nada sin esos datos.
  - H4 — «+ añadir» comando y «Tiempo máximo»: se supone que cambian el texto del editor y pasan por `POST /api/config/check` y las diferencias antes de `PUT /api/config`, como dice la bajada del boceto, sin guardar solos.
  - H5 — Con un servidor anterior sin el dato nuevo de la política por defecto, la vista no debe afirmar «activa»: falta decidir el estado mostrado.
- Consumidores afectados:
  - `tests/revocar-autorizacion-pantalla.test.ts:104-177` sobre `#/configuracion`: exige exactamente dos botones «Revocar» (QA en `[0]`, aprobación en `[1]`), ningún campo con `placeholder` «Tu …» al abrir, y «Confirmar revocación»/«Cancelar» al pulsar. El interruptor nuevo no puede llamarse «Revocar» ni pintar esos campos al abrir, y el orden QA → aprobación de los «Revocar» se conserva.
  - `tests/politicas-autonomas-pantalla.test.ts:85-160`: texto «Políticas autónomas», cuatro tarjetas `.politica`, el primer `TEXTAREA` es el editor, botones «Agregar un ejemplo» y «Editar en el archivo» que solo tocan el texto.
  - `tests/pantalla-autorizaciones.test.ts:305-330`: cadenas del HTML (`/api/authorizations/options`, `caja.type = "radio"`, «un módulo nuevo no queda cubierto») y el bloque CSS `autorizacion-casillas` sin colores a mano.
  - `tests/menu-grupos.test.ts:83-85` (enlace `#/proyecto`), `scripts/verificar-interfaz.mjs` `VISTAS` (`configuracion`, `proyecto`) que usa `tests/interfaz-ejecutable.test.ts`, `tests/tema-tokens.test.ts` y `tests/vista-marco-responsivo.test.ts` (tokens y corte por debajo de 768 px).
  - Servidor: `tests/config-view.test.ts:85-125` (compara `summary.keys` y `summary.gates` con `toEqual`; un campo nuevo del resumen no los altera) y `tests/autorizacion-aprobacion-canales.test.ts:120-220` (lista y revocación por HTTP; un campo nuevo de la respuesta no los altera).
  - La copia publicada `packages/cli/dist/web/index.html` (`npm run build`) y `tests/estaticos-web.test.ts`.
- Archivos y flujo investigados: `packages/server/web/index.html` (`vistaConfiguracion` `:9516-10019`, `conRevocacion` `:3420-3460`, `grupoDeCasillas` `:3372`, ruteo `:10720-10721`, menú `:3235`, estilos `.editor`/`.qa-agente`/`.politicas` `:2323-2489`, tokens `:70-130`); `packages/server/src/server.ts:1560-1606` (config), `:1972-1999` (autorizaciones); `packages/server/src/approval-autorizaciones.ts`; `packages/server/src/config.ts`; `packages/engine/src/approval-authorization.ts:145-175`, `:322-460`; `packages/adapter/src/config.ts:508-533`; `.valmen/config.yaml`; boceto `.valmen/features/rediseno-mission-control/assets/proyecto.html` y su captura `.png`; spec `.valmen/features/rediseno-mission-control/spec/s2-ajustes/spec.md:94-108`. Memoria: `buscar_memoria` no devolvió antecedentes de esta vista (solo AP-007, ajeno).
- Riesgos y compatibilidad:
  - Otro ticket edita otra vista del mismo `index.html`: solo se toca `vistaConfiguracion` y funciones nuevas propias, más un bloque CSS propio; nada se reformatea ni se mueve fuera de eso.
  - Revocar la aprobación por defecto es una escritura append-only que no se deshace (no hay re-creación de `POLITICA-POR-DEFECTO`): el interruptor nunca revoca sin actor y frase, y las pruebas y la verificación en el navegador no la ejecutan sobre el registro real.
  - Los cambios de servidor deben ser aditivos (campos nuevos en respuestas existentes) para no romper a los consumidores citados; los cambios a `config.yaml` siguen pasando por `writeConfig`, que no escribe un texto que no parsea.
  - Los colores salen de los tokens del tema (`revisar_presentacion`), sin valores a mano, para que el modo claro funcione.
- Impactos de sync, migración, Docker o despliegue: ninguno — es una vista web y campos aditivos de lectura en la API local de Mission Control; no hay datos sincronizados, esquema, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: compuerta `plan` con el evaluador `cascade`; la aprobación sale de la política por defecto del PO (`valmen approve-by-authorization` si da APPROVE, `valmen review-agent --record` si da REVIEW) y la decide el orquestador o el PO, no el subagente que planifica.
- Alcance: `vistaConfiguracion()` de `packages/server/web/index.html` y funciones nuevas propias de la vista (`bloqueAprobacionPorDefecto`, `bloqueQaPorAgente`, `bloqueAvisos`, `bloquePruebas`, `prepararCambioDeConfig` y los transformadores de texto `conClaveHermes`, `conComandoDePrueba`, `conTiempoMaximo`), un bloque de estilos propio delimitado por `/* proyecto-ajustes:inicio */` y `/* proyecto-ajustes:fin */`; en el servidor, `listarAutorizacionesDeAprobacion` de `packages/server/src/approval-autorizaciones.ts` y `summarize`/`ConfigSummary` de `packages/server/src/config.ts`, con campos aditivos; pruebas nuevas `tests/vista-proyecto-ajustes.test.ts` y `tests/proyecto-ajustes-servidor.test.ts`. Exclusiones: el menú y `navegar()`, `conRevocacion()` y `grupoDeCasillas()` (se reusan sin tocarlas), el motor (`packages/engine`) y la semántica de las autorizaciones, las demás vistas y su CSS: no se mueve ni se reformatea nada fuera de lo nombrado, porque otro ticket edita otra vista del mismo archivo.
- Decisiones registradas: D-001 (campo aditivo `porDefecto` en `GET /api/approval/authorizations`; sin él, «sin dato» e interruptor deshabilitado), D-002 (apagar con `conRevocacion`, nombre y frase literal, `POST /api/approval/authorizations/revoke` con `POLITICA-POR-DEFECTO`), D-003 (encender una política revocada no crea nada: abre el formulario explícito con el foco en «Responsable»), D-004 (bloque QA con estado, lista y «Crear autorización» que despliega el formulario existente), D-005 (Avisos desde `hermes.enabled` y `notify.gate`/`notify.budget`, el cambio se prepara en el texto y se guarda tras ver las diferencias), D-006 (Pruebas: «+ añadir» y «Tiempo máximo» preparan el texto y se guardan tras ver las diferencias), D-007 (dos plegados: «Avanzado: editar config.yaml a mano» con lo de hoy y «Avanzado: autorizaciones explícitas de aprobación»).
- Respuesta al diagnóstico (cada hallazgo y el paso que lo resuelve):
  - Editor arriba y sin bloques (`index.html:9516-10019`, `:10014-10017`), sin interruptor en el archivo: pasos 4 y 9 (C1, C2, C16, C17).
  - Aprobación por defecto como texto y comando (`index.html:9985-10005`): paso 5 (C3, C4, C5, C6, C7, C8).
  - El GET de autorizaciones no expone la política por defecto (`approval-autorizaciones.ts:31-40`, `approval-authorization.ts:403-433`): paso 2 (C9) y D-001 en el paso 5.
  - Sin dato de Pruebas ni Avisos en el resumen (`config.ts:44-55`, `:83-93`): paso 3 (C10) y pasos 7 y 8 (C12, C13, C14, C15).
  - QA dentro de Avanzado (`index.html:9797-9885`): paso 6 (C11).
  - H1: D-005, paso 7. H2: D-003, paso 5. H3: D-004, paso 6. H4: D-006, paso 8. H5: D-001, pasos 2 y 5.
  - Consumidores (`revocar-autorizacion-pantalla`, `politicas-autonomas-pantalla`, `pantalla-autorizaciones`, `menu-grupos` (su prueba de `#/configuracion`), `autorizacion-qa-canales`, `autorizacion-aprobacion-canales`, `config-view`, `interfaz-ejecutable`, `tema-tokens`, `vista-marco-responsivo`, `estaticos-web`, copia publicada): pasos 9, 11 y 12 (C20).
- Pasos ordenados:
  1. Escribir `tests/vista-proyecto-ajustes.test.ts` y `tests/proyecto-ajustes-servidor.test.ts` y verlas en rojo con `npx vitest run tests/vista-proyecto-ajustes.test.ts tests/proyecto-ajustes-servidor.test.ts`, antes de tocar el código. La de la vista ejecuta `#/proyecto` con `ejecutarInterfaz` de `scripts/verificar-interfaz.mjs` y respuestas simuladas de `/api/config` y `/api/config/check` (con `checkConfig` real sobre un texto con `name`, `test-commands`, `test-timeout` y sin `hermes:`), `/api/approval/authorizations` (con `porDefecto` vigente, revocado y ausente), `/api/qa/authorizations` (vacía) y `/api/authorizations/options`, y registra las llamadas: encabezado y título (C1), orden de bloques (C2), interruptor y rótulo de la aprobación (C3, C8), las tres tarjetas (C4), apagar (C5, C6, C7), QA (C11), Avisos (C12, C13), Pruebas (C14, C15), Avanzado (C16) y corte de 768 px leyendo el CSS del bloque `proyecto-ajustes` (C17). La del servidor usa una raíz temporal: `listarAutorizacionesDeAprobacion` con y sin revocación de `POLITICA-POR-DEFECTO` (C9) y `checkConfig` con `test-commands`, `test-timeout` y `hermes:` (C10).
  2. `packages/server/src/approval-autorizaciones.ts`, `listarAutorizacionesDeAprobacion`: añadir `porDefecto: { id, estado, revocacion }` con `autorizacionQueRespalda(root, POLITICA_POR_DEFECTO_ID, POLITICA_POR_DEFECTO.hash, ahora)` de `@valmen/engine`; si no la encuentra, `estado: "revocada"` solo cuando el registro tiene una revocación de ese id y, si no, `"desconocida"`. `authorizations` no cambia (C9).
  3. `packages/server/src/config.ts`, `ConfigSummary` y `summarize`: añadir `testCommands` (`readList(config, "test-commands", [])`), `testTimeout` (número o `null`) y `avisos: { enabled, gate, budget }` leídos de `hermes:` con `readMap`/`readString` sin lanzar (no se usa `readHermesConfig`, que falla con `token-hours` inválido y tumbaría el resumen). Las claves existentes no cambian (C10).
  4. `index.html`, `vistaConfiguracion()`: encabezado «Ajustes · Proyecto», `h1` «Cómo trabaja el harness en <summary.name>» y la bajada del boceto; luego, en este orden, los contenedores de «Quién aprueba el análisis y el plan», «QA por agente», una rejilla con «Avisos» y «Pruebas», el `<details class="avanzado-proyecto">` «Avanzado: editar config.yaml a mano» (plegado; dentro, sin cambio de comportamiento: nota del YAML, `h2` «Configuración del proyecto», ruta, el único `textarea`, error, «Lo que el harness entiende», «Políticas autónomas», «Diferencias antes de guardar», `Guardar`/`Regenerar`) y el `<details>` «Avanzado: autorizaciones explícitas de aprobación» con `aprobacionAuto` («Aprobación automática de planes», lista con «Revocar» y formulario). Se quita la sección de texto «El agente aprueba y tú ratificas al cerrar» con el comando de CLI. Función `prepararCambioDeConfig(texto, bloque)`: pone el texto en el editor, llama a `analizar()`, abre «Avanzado» y deja en el bloque «Cambio preparado: revisa las diferencias en Avanzado y guarda.» (C1, C2, C16).
  5. `index.html`, `bloqueAprobacionPorDefecto(contenedor, datos)`: `<section aria-labelledby>` con borde ámbar, `h2` «Quién aprueba el análisis y el plan», texto de activa/apagada del boceto, rótulo «activa»/«apagada»/«sin dato» y `<button role="switch" aria-checked aria-label="Aprobación por defecto">` (deshabilitado con «sin dato»), la lista «El agente decide», «Tú ratificas», «Siempre tuyo» con sus textos y el candado «Crear o ampliar esta autorización lo hace una persona; el agente no puede.». Activa: `conRevocacion(seccion, interruptor, mensaje, …)` manda `POST /api/approval/authorizations/revoke` con `{ id: "POLITICA-POR-DEFECTO", actor, quote }` y repinta (D-002). Apagada: el clic no manda nada; abre el plegado de autorizaciones explícitas, enfoca «Responsable» y escribe la explicación de D-003 (C3-C8).
  6. `index.html`, `bloqueQaPorAgente(contenedor)`: mueve `qaAgente` (la lista y el formulario de `pintarQaAgente`, sin cambiar sus llamadas) al bloque «QA por agente» con la bajada del boceto, el rótulo «sin autorización» o «N vigente(s)» y «Crear autorización», que muestra el formulario (oculto con `hidden` al abrir) y enfoca «Responsable». El `h2` «Autorización de QA por agente» se conserva como título accesible del formulario (C11).
  7. `index.html`, `bloqueAvisos(contenedor, resumen)` y `conClaveHermes(texto, { enabled, gate })`: filas «Telegram» y «Slack» con interruptor `role="switch"` según D-005; subtítulos «compuertas en REVIEW y presupuesto» y «canal secundario», y la nota de la jornada por el gateway. Pulsar llama a `prepararCambioDeConfig(conClaveHermes(...))`; `conClaveHermes` agrega el bloque `hermes:` al final si no existe o reemplaza/inserta `  enabled:` y `    gate:` bajo `  notify:` dentro del bloque, sin tocar otras líneas (C12, C13).
  8. `index.html`, `bloquePruebas(contenedor, resumen)`, `conComandoDePrueba(texto, comando)` y `conTiempoMaximo(texto, segundos)`: «Comandos que las compuertas pueden correr», un chip `mono` por comando, «+ añadir» que muestra un campo con «Añadir»; «Tiempo máximo» `<input type="number">` con «s». Los dos preparan el texto con `prepararCambioDeConfig`; un comando vacío o repetido no cambia nada y lo dice (C14, C15).
  9. `index.html`, estilos del bloque `proyecto-ajustes` solo con tokens (`--panel`, `--borde`, `--fondo`, `--tenue`, `--texto`, `--ok`, `--persona`, `--modelo`, `--error`, `--acento`, `--mono`, `--fuente-titulo`, `--radio`): tarjetas, interruptor (pista y perilla, foco visible), tres tarjetas en rejilla `auto-fit minmax(240px, 1fr)`, rejilla de Avisos y Pruebas `auto-fit minmax(300px, 1fr)`, chips y `details`. Dentro de `@media (max-width: 767px)` un bloque propio: todo a una columna, cabecera del bloque con el interruptor debajo del texto, `overflow-wrap: anywhere` en chips y ruta (C17, C18). Fuera del rango `.qa-agente {`…`.politicas {` para no tocar lo que lee `autorizacion-qa-canales`.
  10. `npx vitest run tests/vista-proyecto-ajustes.test.ts tests/proyecto-ajustes-servidor.test.ts` en verde; `revisar_presentacion` sin colores a mano en el bloque nuevo.
  11. `npm run build` para que `packages/cli/dist/web/index.html` coincida con la fuente (C20).
  12. Regresión: `npx vitest run tests/revocar-autorizacion-pantalla.test.ts tests/politicas-autonomas-pantalla.test.ts tests/pantalla-autorizaciones.test.ts tests/menu-grupos.test.ts tests/autorizacion-qa-canales.test.ts tests/autorizacion-aprobacion-canales.test.ts tests/config-view.test.ts tests/interfaz-ejecutable.test.ts tests/tema-tokens.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts`; si una prueba existente se pone en rojo no se edita: se detiene y se reporta en el ticket (C20).
  13. Verificación en el navegador con `node packages/cli/dist/main.js serve` desde el worktree, `#/proyecto`: a 1440 px en modo oscuro contra `proyecto.png` y `proyecto.html` (estructura, jerarquía, colores y textos fijos) y en modo claro (C19); a 390 px sin desplazamiento horizontal en los dos modos (C18). Sin pulsar «Confirmar revocación», «Autorizar» ni «Guardar los cambios» sobre el registro y el `config.yaml` reales. Capturas como evidencia del ticket.
- Diferencias con el boceto (cada una con su decisión):
  - Avisos refleja el archivo real: este proyecto no tiene `hermes:`, así que Telegram sale apagado (el boceto lo muestra encendido) (D-005).
  - El subtítulo de Telegram dice «compuertas en REVIEW y presupuesto» en lugar de «arranque, pruebas tuyas y compuertas en REVIEW», y se agrega la nota de que los avisos de la jornada salen por el gateway (D-005).
  - Pulsar un interruptor de Avisos, «+ añadir» o «Tiempo máximo» no guarda: prepara el cambio, abre «Avanzado» con las diferencias y deja la línea «Cambio preparado…» (D-005, D-006).
  - «Avanzado: editar config.yaml a mano» es el editor de hoy (un `textarea` con diferencias y «Guardar»), no un `pre` de solo lectura, y lleva además «Lo que el harness entiende», «Políticas autónomas» y «Regenerar» (D-007).
  - Un segundo plegado, «Avanzado: autorizaciones explícitas de aprobación», que el boceto no tiene (D-007).
  - Apagar la aprobación abre en el bloque «Tu nombre», «Tu frase literal de revocación», «Confirmar revocación» y «Cancelar» (D-002); encenderla una revocada lleva al formulario explícito (D-003); con un servidor sin el dato, «sin dato» y el interruptor deshabilitado (D-001).
  - «QA por agente» muestra, cuando las hay, sus autorizaciones con «Revocar», y «Crear autorización» despliega el formulario completo (D-004).
  - «Pruebas» no ofrece quitar un comando (el boceto tampoco); «+ añadir» abre un campo con «Añadir» (D-006).
  - El menú lateral, la caja del proyecto y la línea del perfil del boceto ya están en `main` (FEATURE-WEB-MENU-GRUPOS-20261014) y no se tocan.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores; `sync_impact`, `migration_impact` y `docker_impact` en `false`). Los campos nuevos de la API local son aditivos.
- Tamaño previsto: unas 720 líneas (unas 400 de producción —unas 270 de JavaScript y 90 de estilos en `index.html` y unas 40 del servidor— y unas 320 de pruebas); 20 criterios.
- Si excede el tope: sigue: R-AJU-006 es una sola vista pintada por `vistaConfiguracion()` con un solo orden de bloques; partir entre aprobación/QA y Avisos/Pruebas obliga a dos pasadas sobre las mismas líneas de esa función y deja un estado intermedio que no coincide con el boceto. La integración avisa al pasar de 600 y no bloquea.
- Rollback (obligatorio): revertir el commit del ticket en su rama; los campos nuevos de la API desaparecen y nadie más los lee. Las pruebas y la verificación no revocan, no crean autorizaciones ni guardan `config.yaml` reales; si una persona revoca la aprobación por defecto desde la pantalla, eso queda en el registro append-only y se compensa creando una autorización explícita.

## Criterios de aceptación

- [x] C1 (R-AJU-006): Proyecto abre con el título «Cómo trabaja el harness en <nombre del proyecto>»
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C2 (R-AJU-006): los bloques siguen el orden «Quién aprueba el análisis y el plan», «QA por agente», «Avisos», «Pruebas», «Avanzado: editar config.yaml a mano»
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C3 (R-AJU-006): el interruptor «Aprobación por defecto» marca `aria-checked` según `porDefecto.estado` (`vigente` encendido, `revocada` apagado)
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C4 (R-AJU-006): el bloque de aprobación lista «El agente decide», «Tú ratificas», «Siempre tuyo» con el aviso del candado
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C5 (R-AJU-006): pulsar el interruptor de la aprobación vigente pide «Tu nombre» con «Tu frase literal de revocación» sin llamar al servidor
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C6 (R-AJU-006): «Confirmar revocación» con nombre, frase escritos manda `POST /api/approval/authorizations/revoke` con el id `POLITICA-POR-DEFECTO`
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C7 (R-AJU-006): «Confirmar revocación» con cualquiera de los dos datos vacío no manda ninguna escritura
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C8 (R-AJU-006): pulsar el interruptor apagado abre «Avanzado: autorizaciones explícitas de aprobación» sin mandar ninguna escritura
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C9 (R-AJU-006): tras revocar `POLITICA-POR-DEFECTO`, `GET /api/approval/authorizations` informa `porDefecto.estado` como `revocada`
      <!-- test: npx vitest run tests/proyecto-ajustes-servidor.test.ts -->
- [x] C10 (R-AJU-006): el resumen de `GET /api/config` trae los campos `testCommands`, `testTimeout`, `avisos` leídos del archivo
      <!-- test: npx vitest run tests/proyecto-ajustes-servidor.test.ts -->
- [x] C11 (R-AJU-006): «Crear autorización» del bloque «QA por agente» muestra el formulario oculto, con «Responsable», «Frase literal de quien autoriza», sin llamar al servidor
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C12 (R-AJU-006): sin bloque `hermes:`, los dos interruptores de «Avisos» están en `aria-checked="false"`
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C13 (R-AJU-006): encender «Telegram» deja en el editor el bloque `hermes:` con `enabled: true`, `gate: telegram` sin mandar `PUT /api/config`
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C14 (R-AJU-006): «Pruebas» muestra un chip por cada comando de `test-commands` junto al valor de `test-timeout`
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C15 (R-AJU-006): «+ añadir» con un comando agrega su línea a `test-commands` en el editor sin mandar `PUT /api/config`
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C16 (R-AJU-006): al abrir la vista, «Avanzado: editar config.yaml a mano» está plegado con el único editor dentro
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C17 (R-MARCO-006): por debajo de 768 px los bloques de Proyecto pasan a una sola columna
      <!-- test: npx vitest run tests/vista-proyecto-ajustes.test.ts -->
- [x] C18 (R-MARCO-006): a 390 px la vista Proyecto no tiene desplazamiento horizontal en modo oscuro ni en claro
      <!-- verify: manual -->
- [x] C19 (R-AJU-006): a 1440 px la vista coincide con `proyecto.png` en estructura, jerarquía, colores, textos fijos, salvo las diferencias listadas en el plan
      <!-- verify: manual -->
- [x] C20 (R-AJU-006): las pruebas existentes de la pantalla siguen en verde sin editarse
      <!-- test: npx vitest run tests/revocar-autorizacion-pantalla.test.ts tests/politicas-autonomas-pantalla.test.ts tests/pantalla-autorizaciones.test.ts tests/menu-grupos.test.ts tests/autorizacion-qa-canales.test.ts tests/autorizacion-aprobacion-canales.test.ts tests/config-view.test.ts tests/interfaz-ejecutable.test.ts tests/tema-tokens.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Rama `valmen/ticket-ajustes-proyecto` (worktree `.claude/worktrees/ticket-ajustes-proyecto`), plan aprobado (recibo plan-1, REVIEW decidido por el revisor). Se siguió el plan paso por paso, sin ampliar el alcance.
- `packages/server/src/approval-autorizaciones.ts`: `listarAutorizacionesDeAprobacion` devuelve además `porDefecto: { id, estado, revocacion }` con `autorizacionQueRespalda(root, POLITICA_POR_DEFECTO_ID, POLITICA_POR_DEFECTO.hash)`; `authorizations` no cambia (D-001, C9).
- `packages/server/src/config.ts`: `ConfigSummary` suma `testCommands`, `testTimeout` y `avisos { enabled, gate, budget }`, leídos sin lanzar (un `token-hours` inválido no tumba el resumen) (C10).
- `packages/server/web/index.html`, bloque CSS `/* proyecto-ajustes:inicio */`…`/* proyecto-ajustes:fin */` solo con tokens del tema, con corte propio por debajo de 768 px (C17).
- `index.html`, funciones nuevas antes de `vistaConfiguracion()`: `interruptorDeProyecto`, `bloqueDeClave`, `conClaveHermes`, `conComandoDePrueba`, `conTiempoMaximo`, `bloqueAprobacionPorDefecto`, `bloqueAvisos`, `bloquePruebas`.
- `index.html`, `vistaConfiguracion()`: encabezado y título del boceto; bloques «Quién aprueba el análisis y el plan», «QA por agente», «Avisos» y «Pruebas»; «Avanzado: editar config.yaml a mano» (plegado, con el editor, «Lo que el harness entiende», «Políticas autónomas», las diferencias y «Guardar»/«Regenerar» de siempre) y «Avanzado: autorizaciones explícitas de aprobación». `prepararCambioDeConfig` cambia el texto del editor, abre «Avanzado», pide `POST /api/config/check` y deja «Cambio preparado…»: nada se guarda sin «Guardar los cambios». Se quitó la sección de texto con el comando de CLI para revocar la política por defecto.
- Fuera del plan, nada. `conRevocacion()`, `grupoDeCasillas()`, el menú, `navegar()` y las demás vistas no se tocaron; el diff de `index.html` queda en el bloque CSS nuevo y en la sección «Vista: configuración».
- Diferencias con el boceto (cada una con su decisión registrada; la persona las ratifica antes de cerrar):
  - Avisos refleja el archivo real: este proyecto no tiene `hermes:`, así que Telegram sale apagado; el boceto lo muestra encendido (D-005).
  - El subtítulo de Telegram dice «compuertas en REVIEW y presupuesto» en lugar de «arranque, pruebas tuyas y compuertas en REVIEW», y hay una nota de que los avisos de la jornada salen por el gateway (D-005).
  - Un interruptor de Avisos, «+ añadir» y «Tiempo máximo» no guardan: preparan el cambio, abren «Avanzado» con las diferencias y dejan «Cambio preparado…» (D-005, D-006).
  - «Avanzado: editar config.yaml a mano» es el editor de siempre (un `textarea` con diferencias y «Guardar»), no un `pre` de solo lectura, y lleva además «Lo que el harness entiende», «Políticas autónomas» y «Regenerar» (D-007).
  - Hay un segundo plegado, «Avanzado: autorizaciones explícitas de aprobación», que el boceto no tiene (D-007).
  - Apagar la aprobación abre en el bloque «Tu nombre», «Tu frase literal de revocación», «Confirmar revocación» y «Cancelar» (D-002). Encender una revocada lleva al formulario explícito (D-003). Con un servidor sin el dato, «sin dato» y el interruptor deshabilitado (D-001).
  - «QA por agente» muestra sus autorizaciones, también las revocadas, con «Revocar» en la vigente, y su estado («1 vigente» con los datos reales). La bajada del boceto se conserva tal cual. «Crear autorización» despliega el formulario completo (D-004).
  - «Pruebas» no ofrece quitar un comando, igual que el boceto; «+ añadir» abre un campo con «Añadir» (D-006).
  - El menú lateral del boceto ya estaba en `main` y no se tocó.
- Tamaño real: unas 556 líneas de producción (`index.html` +485/−41, servidor +71/−2) y 369 de pruebas; unas 970 líneas en total, sobre el tope de 600. Sigue, por el motivo del plan: es una sola vista y no admite un corte que deje cada parte con su código y sus pruebas.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-ajustes-proyecto` (o la raíz del repositorio tras integrar).
- Requisitos de ambiente: Node 24, `npm install` hecho; para lo manual, `npm run build` y `node packages/cli/dist/main.js serve --port 4817`, con Chrome.
- Comandos y resultado esperado:
  1. `npx vitest run tests/vista-proyecto-ajustes.test.ts tests/proyecto-ajustes-servidor.test.ts` → 22 de 22 en verde (C1-C17).
  2. `npx vitest run tests/revocar-autorizacion-pantalla.test.ts tests/politicas-autonomas-pantalla.test.ts tests/pantalla-autorizaciones.test.ts tests/menu-grupos.test.ts tests/autorizacion-qa-canales.test.ts tests/autorizacion-aprobacion-canales.test.ts tests/config-view.test.ts tests/interfaz-ejecutable.test.ts tests/tema-tokens.test.ts tests/vista-marco-responsivo.test.ts tests/estaticos-web.test.ts` → 215 de 215 en verde (C20; `interfaz-ejecutable` exige `npm run build` antes).
  3. `node scripts/verificar-interfaz.mjs` → «vistas ejecutadas: 13» e «Interfaz verificada.».
- Validaciones manuales en http://127.0.0.1:4817/#/proyecto:
  - A 1440 px, en oscuro y en claro, la vista se ve como `.valmen/features/rediseno-mission-control/assets/proyecto.png`, con las diferencias listadas en «Implementación» (C19; `evidencia/proyecto-1440-dark.png`, `evidencia/proyecto-1440-light.png`).
  - A 390 px no hay desplazamiento horizontal (C18; `evidencia/proyecto-390-dark.png`, `evidencia/proyecto-390-light.png`).
  - El interruptor «Aprobación por defecto» pide nombre y frase; «Cancelar» no cambia nada. **«Confirmar revocación» revoca de verdad y no se deshace** (registro de solo-añadir): no confirmarlo sobre el registro real salvo que se quiera apagar la política.
  - «Crear autorización» de QA despliega y pliega el formulario; «Autorizar» crea una autorización real.
  - «Telegram», «+ añadir» y «Tiempo máximo» muestran las diferencias en «Avanzado» sin guardar; «Guardar los cambios» escribe `.valmen/config.yaml`.
- Resultado local: los comandos 1-3 pasaron (EVIDENCE-001, EVIDENCE-002). Las validaciones manuales se hicieron con Chrome sin pantalla por CDP y en el navegador (EVIDENCE-003 a EVIDENCE-005), sin confirmar ninguna escritura; las huellas de `config.yaml` y de los dos registros de autorizaciones no cambiaron.

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
    "kind": "automated-test",
    "description": "Prueba primero: npx vitest run tests/vista-proyecto-ajustes.test.ts tests/proyecto-ajustes-servidor.test.ts antes de tocar el código: 22 de 22 en rojo (sin porDefecto, sin testCommands/testTimeout/avisos en el resumen, sin bloques ni interruptores, sin estilos proyecto-ajustes). Después de implementar: 22 de 22 en verde.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-14",
    "kind": "automated-test",
    "description": "Regresión sin editar pruebas existentes: npx vitest run de las 11 pruebas de C20 más las 2 nuevas → 13 archivos, 237 de 237 en verde; node scripts/verificar-interfaz.mjs → Interfaz verificada (13 vistas); npx tsc -p packages/server --noEmit sin errores; revisar_presentacion sin colores fijos. interfaz-ejecutable falló una vez solo porque la copia publicada no estaba regenerada (paso 11, npm run build) y pasó tras el build, sin editar la prueba.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "En el navegador, sin confirmar nada: el interruptor de aprobación abrió Tu nombre/Tu frase/Confirmar revocación y Cancelar lo cerró; Crear autorización desplegó y plegó el formulario de QA; Avisos por Telegram, + añadir (npx eslint) y Tiempo máximo 600 prepararon el texto y mostraron las diferencias en Avanzado sin Guardar. Red: solo GET y POST /api/config/check. md5 de .valmen/config.yaml, .valmen/approval/authorizations.jsonl y .valmen/qa/authorizations.jsonl iguales antes y después.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "Chrome sin pantalla por CDP con datos reales del worktree (serve --port 4817), #/proyecto a 1440 px en oscuro y claro (evidencia/proyecto-1440-dark.png, sha256 en la referencia; evidencia/proyecto-1440-light.png) contra proyecto.png: mismo encabezado, título, bloque de aprobación con borde ámbar, interruptor activa, tres tarjetas lila/ámbar/rojo y candado, QA con estado y Crear autorización, Avisos y Pruebas en dos columnas, Avanzado plegado. Diferencias: las listadas en el plan (Telegram apagado por falta de hermes:, lista de autorizaciones de QA con historial, segundo plegado).",
    "reference": "worktree:sha256:97d5bad88cd3fbf259c9ecbe3e5453628dd9ec90f39cb3423f2c75091847f2f4",
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-10-14",
    "kind": "manual-test",
    "description": "A 390 px en oscuro y claro (evidencia/proyecto-390-dark.png, sha256 en la referencia; evidencia/proyecto-390-light.png): una sola columna, scrollWidth 390 = ancho, sin desplazamiento horizontal. Se corrigió en el camino un hueco del encabezado del bloque en columna (flex-basis de .texto-bloque).",
    "reference": "worktree:sha256:67222e5f12ea55927bee172863d7983834fdfccdbd7c4a91208d0fc64c44d6c7",
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
    "notes": "Subagente claude-opus-5-5 del orquestador para análisis, plan e implementación de este ticket; la sesión no expone sus números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente de Claude Code sin agregado de tokens expuesto",
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
    "at": "2026-10-14T05:09:28.129Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-14",
    "at": "2026-10-14T05:09:55.929Z",
    "action": "design-references-updated",
    "actor": "cli",
    "details": "Referencias de diseño actualizadas: .valmen/features/rediseno-mission-control/assets/proyecto.html, .valmen/features/rediseno-mission-control/assets/proyecto.png."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-14",
    "at": "2026-10-14T07:07:35.709Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:58.766Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-001\",\"pregunta\":\"Cómo sabe la pantalla si la aprobación por defecto está activa, si GET /api/approval/authorizations solo lista el registro (H5)\",\"eleccion\":\"Campo aditivo porDefecto { id, estado, revocacion } en la respuesta de GET /api/approval/authorizations, calculado con autorizacionQueRespalda(root, POLITICA_POR_DEFECTO_ID, POLITICA_POR_DEFECTO.hash); sin ese campo (servidor anterior) el bloque dice «sin dato» y el interruptor queda deshabilitado\",\"alternativas\":[\"Deducirlo en el navegador buscando una revocación de POLITICA-POR-DEFECTO (el GET no trae revocaciones sueltas)\",\"Ruta nueva GET /api/approval/default (más superficie para el mismo dato)\",\"Suponer «activa» siempre (afirmaría algo que puede ser falso)\"],\"criterio\":\"Conservadora y reversible: el motor ya calcula el estado; el campo es aditivo y no cambia a ningún consumidor; la vista no afirma un estado que no leyó\",\"fuente\":\"packages/server/src/approval-autorizaciones.ts:31-40; packages/engine/src/approval-authorization.ts:363-433\",\"reversion\":\"Revertir el commit; el campo nuevo deja de existir y nadie más lo lee\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:59.209Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-002\",\"pregunta\":\"Qué hace el interruptor al apagar la aprobación por defecto\",\"eleccion\":\"Reusa conRevocacion(): abre en el bloque «Tu nombre», «Tu frase literal de revocación», «Confirmar revocación» y «Cancelar»; solo con los dos datos manda POST /api/approval/authorizations/revoke con id POLITICA-POR-DEFECTO, y sin ellos no manda nada y lo dice\",\"alternativas\":[\"Un diálogo nuevo propio del bloque (duplica lo que ya hace conRevocacion)\",\"Mostrar el comando de CLI como hoy (no cumple el escenario de la spec)\"],\"criterio\":\"La spec exige pedir actor y frase literal antes de revocar; conRevocacion ya lo hace con pruebas y la ruta del servidor ya rechaza sin frase\",\"fuente\":\"packages/server/web/index.html:3420-3460; .valmen/features/rediseno-mission-control/spec/s2-ajustes/spec.md:105-108; packages/engine/src/approval-authorization.ts:335-341\",\"reversion\":\"Revertir el commit; una revocación ya hecha queda en el registro append-only y se compensa creando una autorización explícita\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-14",
    "at": "2026-10-14T07:10:59.608Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-003\",\"pregunta\":\"Qué hace el interruptor al encender una aprobación por defecto ya revocada (H2)\",\"eleccion\":\"No crea nada: abre «Avanzado: autorizaciones explícitas de aprobación», lleva el foco a «Responsable» del formulario existente y explica que la política revocada no vuelve sola y que una persona crea una autorización nueva con su nombre y su frase literal\",\"alternativas\":[\"Crear desde el interruptor una autorización con el alcance de la política (crearía o ampliaría una autorización con un clic)\",\"Deshabilitar el interruptor apagado (el boceto lo muestra como acción)\"],\"criterio\":\"AGENTS.md «Acciones que nunca se automatizan»: crear o ampliar una autorización es de una persona; la revocación es append-only y no hay re-creación de POLITICA-POR-DEFECTO en el motor\",\"fuente\":\"AGENTS.md (Acciones que nunca se automatizan); packages/engine/src/approval-authorization.ts:363-401; packages/server/src/approval-autorizaciones.ts:42-78\",\"reversion\":\"Revertir el commit; el formulario explícito sigue siendo el de hoy\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-14",
    "at": "2026-10-14T07:11:18.230Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-004\",\"pregunta\":\"Qué muestra el bloque «QA por agente» y qué hace «Crear autorización» (H3)\",\"eleccion\":\"Estado «sin autorización» o «N vigente(s)» desde GET /api/qa/authorizations, la lista de autorizaciones con su «Revocar» dentro del bloque, y «Crear autorización» despliega el formulario existente (oculto al abrir) que no envía nada sin «Autorizar» con responsable y frase literal\",\"alternativas\":[\"Dejar la QA dentro de Avanzado como hoy (el boceto la quiere como bloque)\",\"Formulario nuevo reducido (cambiaría el alcance que fija una persona)\"],\"criterio\":\"Fiel al boceto con el dato real; no cambia el contrato ni las barreras (POST /api/qa/authorizations sigue exigiendo actor y frase); conserva el orden de «Revocar» que exige tests/revocar-autorizacion-pantalla.test.ts\",\"fuente\":\"packages/server/web/index.html:9797-9885; tests/revocar-autorizacion-pantalla.test.ts:111-120\",\"reversion\":\"Revertir el commit\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-14",
    "at": "2026-10-14T07:11:18.622Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-005\",\"pregunta\":\"Qué reflejan y qué hacen los interruptores de «Avisos» (Telegram, Slack) si config.yaml solo tiene hermes.enabled y un destino por tipo (H1)\",\"eleccion\":\"Un canal está encendido si hermes.enabled es true y notify.gate o notify.budget empieza por ese canal. Pulsar prepara el cambio en el texto del editor (encender X: enabled true y gate X; apagar: enabled false), abre «Avanzado» con las diferencias y solo «Guardar los cambios» escribe. Subtítulo con lo que gobierna de verdad (compuertas en REVIEW y presupuesto) y una nota: los avisos de la jornada salen por el gateway con --to telegram y no dependen de este interruptor\",\"alternativas\":[\"Interruptores de solo lectura que llevan a la clave del archivo (menos fiel al boceto)\",\"Escribir config.yaml directamente al pulsar (salta las diferencias que promete la bajada del boceto)\",\"Copiar el estado del boceto (Telegram encendido) sin dato que lo respalde\"],\"criterio\":\"Usa el único dato real (readHermesConfig) y el camino que ya valida y muestra diferencias (POST /api/config/check, PUT /api/config); no promete avisos que el archivo no gobierna\",\"fuente\":\"packages/adapter/src/config.ts:508-533; packages/cli/src/commands.ts:4475; .valmen/rules/estandares-proceso.md:15\",\"reversion\":\"No guardar el cambio preparado, o revertir el commit; un cambio guardado se deshace editando hermes: en config.yaml\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-14",
    "at": "2026-10-14T07:11:18.990Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-006\",\"pregunta\":\"Qué hacen «+ añadir» y «Tiempo máximo» del bloque «Pruebas» (H4)\",\"eleccion\":\"Chips desde el resumen nuevo (testCommands, testTimeout). «+ añadir» abre un campo y «Añadir» inserta «  - <comando>» al final de test-commands en el editor (o crea la lista); «Tiempo máximo» reemplaza o agrega la línea test-timeout. Los dos preparan el texto, abren «Avanzado» con las diferencias y solo «Guardar los cambios» escribe\",\"alternativas\":[\"Ruta nueva del servidor que edita claves (más superficie; writeConfig ya valida)\",\"Guardar al pulsar (salta las diferencias)\"],\"criterio\":\"La bajada del boceto promete diferencias antes de guardar; writeConfig no escribe un texto que no parsea; reversible antes de guardar\",\"fuente\":\"packages/server/src/config.ts:83-93, :180-220; .valmen/config.yaml:25-31\",\"reversion\":\"No guardar el cambio preparado, o revertir el commit\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-14",
    "at": "2026-10-14T07:11:19.410Z",
    "action": "agent-decision",
    "actor": "cli",
    "details": "{\"id\":\"D-007\",\"pregunta\":\"Dónde quedan lo que hoy hace la pantalla y el boceto no muestra: interpretación, políticas autónomas, regenerar y las autorizaciones explícitas de aprobación\",\"eleccion\":\"Dentro de «Avanzado: editar config.yaml a mano» (plegado): ruta, nota del YAML, editor, «Configuración del proyecto», «Lo que el harness entiende», «Políticas autónomas», diferencias y «Guardar»/«Regenerar». Las autorizaciones explícitas de aprobación (lista con «Revocar» y formulario) van en un segundo plegado «Avanzado: autorizaciones explícitas de aprobación», después de «QA por agente»\",\"alternativas\":[\"Quitarlas (perdería funciones con pruebas en verde)\",\"Dentro del bloque de aprobación (cambia el orden de «Revocar» y pone en rojo tests/revocar-autorizacion-pantalla.test.ts)\"],\"criterio\":\"No se pierde nada de lo que hoy funciona y las pruebas existentes siguen en verde sin editarse; el boceto conserva su primer plano\",\"fuente\":\"packages/server/web/index.html:9985-10017; tests/politicas-autonomas-pantalla.test.ts:85-160; tests/menu-grupos.test.ts:443-467; tests/revocar-autorizacion-pantalla.test.ts:111-120\",\"reversion\":\"Revertir el commit\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-14",
    "at": "2026-10-14T07:14:10.141Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-14",
    "at": "2026-10-14T07:17:11.665Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO)\",\"source\":\"revisor\",\"quote\":\"El plan respalda las cinco proposiciones. Cada criterio en duda tiene una prueba planificada y un paso que lo implementa. El diagnóstico se responde hallazgo por hallazgo. La compatibilidad queda protegida con campos aditivos, exclusiones explícitas y una regresión de 11 pruebas existentes que no se editan.\",\"planHash\":\"sha256:e91ca87376a804b3d8f366ca70b36ebcbf0faaf175118a809681d8f684333828\",\"authorizationId\":\"POLITICA-POR-DEFECTO\",\"authorizationHash\":\"sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a\",\"reviewerModel\":\"claude-sonnet-5-5\",\"stage\":\"plan\",\"receiptId\":\"GR-20261014-FEATURE-WEB-AJUSTES-PROYECTO-20261014-plan-1\",\"receiptStateHash\":\"sha256:1f45b45823bea421914e715c8ef604fda86d30f0f4a42262ec02585448145368\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-14",
    "at": "2026-10-14T07:17:15.691Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: revisor claude-code/claude-sonnet-5-5 (autorización POLITICA-POR-DEFECTO) (fuente revisor, hash sha256:c1bb46dd45f48a215d91a242f445eab06b4ac6f78aa546bf15d8b85902a01a0a), plan sha256:e91ca87376a804b3d8f366ca70b36ebcbf0faaf175118a809681d8f684333828."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-14",
    "at": "2026-10-14T07:17:15.691Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-14",
    "at": "2026-10-14T07:17:26.662Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:08.052Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:08.703Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:09.733Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:16.538Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-14",
    "at": "2026-10-14T13:31:17.151Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-14",
    "at": "2026-10-14T13:32:59.172Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-14",
    "at": "2026-10-14T13:33:02.569Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-14",
    "at": "2026-10-14T13:34:58.007Z",
    "action": "delivery-size",
    "actor": "cli",
    "details": "{\"añadidas\":925,\"borradas\":43,\"total\":968,\"tope\":600,\"pasaElTope\":true,\"via\":\"worktree\"}"
  }
]
```
