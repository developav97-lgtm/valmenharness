---
schema_version: 2
id: FEATURE-MC-PERFILES-MODELOS-20261007
title: Crear, editar y elegir perfiles desde Mission Control
type: FEATURE
module: MC
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-PERFILES-MODELOS-20261007

## Solicitud original

Parte del sprint: La persona elige perfiles y ve qué modelo corre cada fase, en Mission Control, el CLI y Hermes.
- R-PERF-002: La persona DEBERÍA poder crear, editar y elegir perfiles
Depende de: FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La persona DEBERÍA poder crear, editar y elegir perfiles
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-002: lo cubre FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007 (Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen)
- R-PERF-002: lo cubre FEATURE-CLI-PERFILES-MODELOS-20261007 (Listar, mostrar y elegir perfiles por CLI y desde Hermes)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la parte de R-PERF-002 que el grafo (`.valmen/features/perfiles-de-modelos/tickets.yaml`, sprint S3) asigna a Mission Control —«Mission Control DEBE permitir crear un perfil a partir de otro, editar sus modelos y elegirlo», por proyecto y por ejecutor (`.valmen/features/perfiles-de-modelos/spec/perfiles/spec.md`)—: la API HTTP que expone listar, guardar y elegir perfiles y la sección «Perfiles» de la vista Modelos. El contrato de perfiles y su resolución ya existen (FEATURE-ADAPTER-PERFILES-MODELOS-20261007 y FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007, cerrados); este ticket los conecta a la pantalla, no los cambia.
- Usuario o rol afectado: el PO que configura con qué modelo trabaja cada fase desde Mission Control, sin editar a mano el archivo de perfiles (`perfilesPath`).
- Comportamiento actual: los perfiles se pueden guardar (`guardarPerfil`) y elegir (`elegirPerfil`) solo llamando a esas funciones desde código; Mission Control no tiene ningún endpoint de perfiles ni ningún control para verlos, crearlos, editarlos o elegirlos. La vista Modelos solo ofrece preset y overrides por rol.
- Comportamiento esperado: en la vista Modelos la persona ve los perfiles (incorporados y del proyecto), crea uno nuevo a partir de cualquiera, edita proveedor, modelo y esfuerzo de cada rol de un perfil del proyecto, lo guarda —y si un modelo no existe en el catálogo de su proveedor ve el rechazo con el rol y el modelo—, y elige el perfil del proyecto y, si quiere, uno distinto por ejecutor (`claude`, `codex`, `opencode`, `hermes`), o quita la elección.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): no hay camino desde Mission Control hasta las funciones de perfiles que ya existen.
  - `handleApi` (`packages/server/src/server.ts:404`) solo atiende `/api/routing` (`server.ts:1459`, `:1474`, `:1483`, `:1535`): ningún endpoint lee `listarPerfiles` ni llama a `guardarPerfil` o `elegirPerfil`. `grep -n "perfil" packages/server/src/server.ts` no devuelve ninguna ruta.
  - `guardarPerfil` (`packages/server/src/routing.ts:401`) y `elegirPerfil` (`packages/server/src/routing.ts:433`) existen y validan (incorporado, completitud, catálogo vía `catalogoParaPerfil` `:363`; perfil existente y ejecutor en `EJECUTORES_CON_PERFIL`), y solo escriben con `renderPerfiles` + `atomicWrite`; hoy solo los usan las pruebas de `tests/routing.test.ts`.
  - `vistaModelos` (`packages/server/web/index.html:6448`) pinta preset (`:6487-6513`), catálogo (`:6518-6532`) y la tabla de roles con `selectorDeModelo` (`:6254`), y guarda con `PUT /api/routing` (`:6726`). No hay ningún control de perfiles.
- Hallazgo que el plan debe cubrir: `guardarPerfil` (`packages/server/src/routing.ts:401-428`) no valida el formato del id, pero `parsePerfiles` (`packages/adapter/src/routing.ts:587-589`) falla con un id que no sea kebab-case. Si la pantalla manda «Mi Perfil», el archivo se escribe y a partir de ahí `listarPerfiles` (`routing.ts:753`) —y con él toda resolución con perfiles (`rutasDelProyecto`, `checkRouting` vía `perfilDelProyecto`, `packages/server/src/routing.ts:247`)— falla al leerlo. Hoy no ocurre porque nadie llama a `guardarPerfil` con texto libre; con un formulario sí. `ID_DE_PERFIL` (`routing.ts:500`) no está exportado.
- Lo que se reutiliza sin cambios: `listarPerfiles` (`routing.ts:753`), `readSeleccionDePerfil` (`routing.ts:656`), `derivarPerfil` (`routing.ts:758`), `EJECUTORES_CON_PERFIL` (`routing.ts:778`), `ROLES`, `catalogoParaPerfil`, y en la interfaz `catalogoDeModelos` (`index.html:6217`) y `selectorDeModelo` (`index.html:6254`). Las credenciales y el catálogo se pasan como ya lo hace `GET /api/providers/:id/models` (`server.ts:485-495`: `filePath: context.credentialsFile`, `env`, `fetchImpl`).
- Hipótesis pendientes: ninguna sobre la causa. Interpretaciones de alcance, citadas: (1) «editar sus modelos» aplica a los perfiles del proyecto; los incorporados no se pueden sobrescribir (`guardarPerfil`, `packages/server/src/routing.ts:406-412`), así que en la pantalla se editan creando uno a partir de ellos; (2) borrar un perfil no lo pide la spec y no entra.
- Consumidores afectados: la vista Modelos de Mission Control y quien llame a la API nueva; las escrituras pasan por `exigirTokenEnEscritura` (`server.ts:211`, aplicada en `server.ts:2013` a todo método distinto de GET). Elegir un perfil cambia lo que resuelven compuertas, cascada y jornada (FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007), igual que hoy lo haría `elegirPerfil` desde código. `scripts/verificar-interfaz.mjs` recorre la vista `modelos` (`VISTAS`, `:695`) con respuestas simuladas: su respuesta por defecto no conoce `/api/perfiles` (`:455` solo cubre `/api/routing`), así que la sección debe pintarse sin fallar con una respuesta vacía.
- Archivos y flujo investigados: `packages/server/src/server.ts` (`handleApi` `:404`, rutas de routing `:1458-1560`, catálogo por proveedor `:471-530`, token `:211`, `:2013`); `packages/server/src/routing.ts` (`perfilDelProyecto` `:246`, `checkRouting` `:251`, `catalogoParaPerfil` `:363`, `guardarPerfil` `:401`, `elegirPerfil` `:433`); `packages/adapter/src/routing.ts` (`PerfilDeModelos` `:406`, `PERFILES_INCORPORADOS` `:446`, `ID_DE_PERFIL` `:500`, `parsePerfiles` `:582`, `renderPerfiles` `:693`, `listarPerfiles` `:753`, `derivarPerfil` `:758`, `EJECUTORES_CON_PERFIL` `:778`); `packages/server/web/index.html` (`catalogoDeModelos` `:6217`, `selectorDeModelo` `:6254`, `vistaModelos` `:6448-6741`, mapa `ORIGEN` `:6607`); `scripts/verificar-interfaz.mjs` (`ejecutarInterfaz` `:557`, `VISTAS` `:687`); pruebas `tests/routing.test.ts` (API de routing `:593-680`, `context()` `:73`) y `tests/politicas-autonomas-pantalla.test.ts` (patrón de prueba de pantalla con DOM mínimo). Memoria consultada (`buscar_memoria` «perfiles modelos mission control»): sin antecedentes del síntoma; AP-003 recuerda que la traducción del origen y la vista del modelo efectivo son de FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007, y AP-010 que un plan con archivos nuevos confunde a la compuerta, por lo que el plan extiende los archivos investigados y crea solo una suite de prueba de pantalla.
- Riesgos y compatibilidad:
  - Aditivo: `/api/routing`, `routingFromForm`, `renderRouting` y el guardado del routing no cambian; sin el archivo de perfiles (`perfilesPath`) la API devuelve los tres incorporados y ninguna elección, y la vista Modelos sigue funcionando igual debajo de la sección nueva.
  - Un solo escritor: la API no escribe el archivo por su cuenta; delega en `guardarPerfil` y `elegirPerfil`, que usan `renderPerfiles` + `atomicWrite`, igual que el CLI del ticket hermano.
  - Red: guardar consulta el catálogo de cada proveedor del perfil (`catalogoParaPerfil`); un proveedor caído rechaza el guardado diciendo que no se pudo comprobar, no pasa en silencio. Las pruebas simulan la red con `fetchImpl`.
  - Elegir un perfil en este proyecto cambia poco: `.valmen/routing.yaml` fija diez roles a mano y siguen ganando al perfil (FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007, §Riesgos). La pantalla no los toca.
  - Un `profiles.yaml` ilegible hace fallar `listarPerfiles`; la API debe devolver el error legible en vez de un 500 sin cuerpo, y la vista debe mostrarlo sin romper el resto de la pantalla.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: se extienden `packages/server/src/routing.ts` (validación del id), `packages/server/src/server.ts` (tres endpoints), `packages/server/web/index.html` (sección «Perfiles» en `vistaModelos`), `scripts/verificar-interfaz.mjs` (respuesta simulada de `/api/perfiles`) y `tests/routing.test.ts`; se crea una sola suite de pantalla, `tests/perfiles-pantalla.test.ts`, con el patrón de `tests/politicas-autonomas-pantalla.test.ts`. **Fuera**: traducir el origen `perfil` en la tabla de roles, marcar los roles que anulan el perfil y el modelo realmente usado (FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007); comandos del CLI y de Hermes (FEATURE-CLI-PERFILES-MODELOS-20261007); la resolución y su precedencia (FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007, cerrado); borrar perfiles; cambiar `.valmen/routing.yaml` o los overrides del proyecto.
- Gate de plan y aprobación: pendiente de la aprobación explícita del PO; el ticket se detiene en `planned` hasta recibirla.
- Decisión técnica (sujeta a la aprobación del plan): la API vive bajo `/api/perfiles` y devuelve los datos tal como los producen las funciones existentes:
  - `GET /api/perfiles` → `200 { perfiles: PerfilDeModelos[], seleccion: SeleccionDePerfil, ejecutores: EJECUTORES_CON_PERFIL, roles: ROLES }`; si el archivo no se puede leer, `200 { error, perfiles: PERFILES_INCORPORADOS, seleccion: sin elección, … }` para que la pantalla diga qué falla.
  - `PUT /api/perfiles` con `{ id, description, base?, roles }` → si viene `base`, `derivarPerfil` sobre ese perfil con los `roles` como cambios; si no, los `roles` completos; llama a `guardarPerfil` con `filePath: context.credentialsFile`, `env` y `fetchImpl` del contexto → `200 { ok, errores, written }`; cuerpo mal formado o `base` inexistente → `400 { error }`.
  - `PUT /api/perfiles/seleccion` con `{ perfil: string | null, ejecutor?: string }` → `elegirPerfil` → `200 { ok, errores, written }`; cuerpo mal formado → `400`.
- Pasos ordenados:
  1. `packages/server/src/routing.ts` — `guardarPerfil` (`:401`) rechaza, antes de consultar el catálogo y sin escribir, un id que no cumpla el patrón kebab-case de `parsePerfiles`, con el mismo texto («el id de perfil "<id>" debe ser kebab-case …»). Para no duplicar la regla se exporta `ID_DE_PERFIL` desde `packages/adapter/src/routing.ts:500` (sale por `index.ts` con `export *`). (C4)
  2. `packages/server/src/server.ts` — en `handleApi`, junto a las rutas de routing (`:1458-1560`): `GET /api/perfiles`, `PUT /api/perfiles` y `PUT /api/perfiles/seleccion` con la forma de la decisión técnica, importando `listarPerfiles`, `readSeleccionDePerfil`, `derivarPerfil`, `EJECUTORES_CON_PERFIL`, `ROLES` y `PERFILES_INCORPORADOS` de `@valmen/adapter` y `guardarPerfil`, `elegirPerfil` de `./routing.js`. Las escrituras quedan detrás de `exigirTokenEnEscritura` sin cambios (`server.ts:2013`). (C1, C2, C3, C5, C6, C7, C8, C9)
  3. `packages/server/web/index.html` — en `vistaModelos` (`:6448`), antes del bloque «Preset», una sección `h2` «Perfiles» pintada por una función nueva `seccionPerfiles(cont, catalogo)` en el mismo archivo: (a) una fila por perfil con id, descripción y origen («incorporado» o «del proyecto»), y la marca «elegido para el proyecto» / «elegido para <ejecutor>»; (b) dos controles de elección —«Perfil del proyecto» y, por cada ejecutor de `ejecutores`, un `select` con «sin perfil propio» más los perfiles— que llaman a `PUT /api/perfiles/seleccion` y recargan la vista; (c) botón «Crear a partir de este» en cada perfil y «Editar» solo en los del proyecto, que abren un editor con id (fijo al editar), descripción y una fila por rol de `roles` con `selectorDeModelo` y el `select` de esfuerzo; (d) «Guardar el perfil» manda `PUT /api/perfiles` y muestra cada línea de `errores` tal como llega (rol y modelo) sin cerrar el editor; con `written` recarga la vista. Si `GET /api/perfiles` trae `error`, la sección lo muestra y el resto de la vista sigue. Cada `select` y campo lleva su etiqueta asociada, los estados de carga, error y éxito se muestran en el mismo `div.resultado` que ya usa la vista, y los colores salen de las variables existentes del archivo, sin colores escritos a mano. (C10, C11, C12, C13, C14, C15, C16)
  4. `scripts/verificar-interfaz.mjs` — la respuesta por defecto (`:455`) devuelve para `/api/perfiles` los tres incorporados y ninguna elección, para que `ejecutarTodasLasVistas` siga recorriendo `modelos` sin fallos. (C17)
  5. `tests/routing.test.ts` — `describe("la API de perfiles")` con `handleApi` y `context()` (`:73`) sobre el directorio temporal; el catálogo se simula con `fetchImpl` o con `candidates` en `.valmen/config.yaml` del directorio temporal. Casos con prefijo «R-PERF-002 API». (C1–C9)
  6. `tests/perfiles-pantalla.test.ts` — la vista `#/modelos` ejecutada con `ejecutarInterfaz` y respuestas simuladas, registrando las llamadas: casos con prefijo «R-PERF-002 pantalla». (C10–C16)
  7. Verificación: `npx vitest run tests/routing.test.ts tests/perfiles-pantalla.test.ts`, `node scripts/verificar-interfaz.mjs` y la suite completa `npx vitest run`; `revisar_presentacion` sobre `index.html` antes de entregar; y en el navegador, con `valmen` sirviendo Mission Control sobre un proyecto de prueba, crear, editar y elegir un perfil. (C17, C18, C19)
- Impactos declarados: ninguno de sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en `false`). Se añaden tres endpoints locales de Mission Control que escriben solo el archivo de perfiles (`perfilesPath`) a través de las funciones existentes.
- Compatibilidad: sin el archivo de perfiles (`perfilesPath`) nada cambia en la resolución; `/api/routing` y su formulario no cambian; `guardarPerfil` solo gana un rechazo para ids que hoy ya romperían la lectura del archivo; `ID_DE_PERFIL` se exporta sin renombrar.
- Rollback (obligatorio): revertir el commit del ticket en los seis archivos. Un archivo de perfiles (`perfilesPath`) escrito desde la pantalla sigue siendo válido para el código anterior (mismo escritor `renderPerfiles`), y la elección se quita con `elegirPerfil(root, { perfil: null })` o borrando la clave `seleccion:`; no hay datos que migrar.
- Pruebas para la entrega: directorio `/Users/juanandrade/Desktop/ValmenHarness`; `npx vitest run tests/routing.test.ts tests/perfiles-pantalla.test.ts -t "R-PERF-002"` → casos de API y pantalla en verde; `node scripts/verificar-interfaz.mjs` → sin fallos en la vista `modelos`; `npx vitest run` → suite completa en verde. Entorno: Node 24, sin red (catálogo simulado). Validación manual en el navegador: abrir Modelos, crear `mi-perfil` a partir de `claude-code-completo` cambiando `agent-implementation` a `codex`/`gpt-6-sol`, guardarlo, ver el rechazo con un modelo inventado, elegirlo para el proyecto y elegir `codex-completo` para `hermes`; comprobar el resultado en el archivo de perfiles (`perfilesPath`) de un proyecto de prueba, no de este repositorio.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 (R-PERF-002): `GET /api/perfiles` sin archivo de perfiles devuelve los tres incorporados y ninguna elección
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API lista sin archivo" -->
- [ ] C2 (R-PERF-002): `GET /api/perfiles` devuelve los perfiles del proyecto con origen `proyecto` y la elección guardada
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API lista con archivo" -->
- [ ] C3 (R-PERF-002): `PUT /api/perfiles` con `base` y un rol cambiado guarda un perfil que conserva los demás roles de la base
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API crea a partir de otro" -->
- [ ] C4 (R-PERF-002): guardar un perfil con un id que no es kebab-case se rechaza sin escribir el archivo de perfiles
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API id inválido" -->
- [ ] C5 (R-PERF-003): `PUT /api/perfiles` con un modelo ausente del catálogo responde `ok: false` con un error que nombra el rol y el modelo
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API modelo inexistente" -->
- [ ] C6 (R-PERF-002): `PUT /api/perfiles` sobre un perfil del proyecto existente reemplaza sus modelos
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API edita" -->
- [ ] C7 (R-PERF-002): `PUT /api/perfiles/seleccion` sin ejecutor deja el perfil elegido para el proyecto
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API elige para el proyecto" -->
- [ ] C8 (R-PERF-002): `PUT /api/perfiles/seleccion` con `ejecutor: "hermes"` elige para Hermes sin cambiar la elección del proyecto
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API elige por ejecutor" -->
- [ ] C9 (R-PERF-002): `PUT /api/perfiles` y `PUT /api/perfiles/seleccion` con cuerpo mal formado responden 400 sin escribir
      <!-- test: npx vitest run tests/routing.test.ts -t "R-PERF-002 API cuerpo mal formado" -->
- [ ] C10 (R-PERF-002): la vista Modelos muestra una fila por perfil con su origen
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla lista" -->
- [ ] C11 (R-PERF-002): la vista marca el perfil elegido para el proyecto y el elegido para cada ejecutor
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla marca la elección" -->
- [ ] C12 (R-PERF-002): cambiar el perfil del proyecto en la vista llama a `PUT /api/perfiles/seleccion` con ese perfil
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla elige" -->
- [ ] C13 (R-PERF-002): «Crear a partir de este» abre un editor con los modelos de la base y al guardar llama a `PUT /api/perfiles` con esa base
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla crea" -->
- [ ] C14 (R-PERF-002): los perfiles incorporados no ofrecen «Editar»
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla incorporados" -->
- [ ] C15 (R-PERF-003): un guardado rechazado muestra cada error con el rol y el modelo y deja el editor abierto
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla rechazo" -->
- [ ] C16 (R-PERF-002): si `GET /api/perfiles` trae `error`, la sección lo muestra y la tabla de roles se sigue pintando
      <!-- test: npx vitest run tests/perfiles-pantalla.test.ts -t "R-PERF-002 pantalla archivo ilegible" -->
- [ ] C17: el recorrido de todas las vistas de Mission Control termina sin fallos
      <!-- test: node scripts/verificar-interfaz.mjs -->
- [ ] C18: en el navegador se crea, edita y elige un perfil sobre un proyecto de prueba y el archivo de perfiles (`perfilesPath`) refleja cada paso
      <!-- verify: manual -->
- [ ] C19: la suite completa del repositorio pasa sin cambios en los casos existentes
      <!-- test: npx vitest run -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

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
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:48.565Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T20:34:02.646Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T20:34:42.593Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
