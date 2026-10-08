---
schema_version: 2
id: FEATURE-CLI-PERFILES-MODELOS-20261007
title: Listar, mostrar y elegir perfiles por CLI y desde Hermes
type: FEATURE
module: CLI
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-CLI-PERFILES-MODELOS-20261007

## Solicitud original

Parte del sprint: La persona elige perfiles y ve qué modelo corre cada fase, en Mission Control, el CLI y Hermes.
- R-PERF-002: La persona DEBERÍA poder crear, editar y elegir perfiles
- R-PERF-005: El modelo efectivo de cada fase DEBE ser visible con su origen
Depende de: FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La persona DEBERÍA poder crear, editar y elegir perfiles El modelo efectivo de cada fase DEBE ser visible con su origen
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-002: lo cubre FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007 (Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen)
- R-PERF-002: lo cubre FEATURE-MC-PERFILES-MODELOS-20261007 (Crear, editar y elegir perfiles desde Mission Control)
- R-PERF-005: lo cubre FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007 (Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen)
- R-PERF-005: lo cubre FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 (Mostrar el modelo efectivo, su origen y el realmente usado por fase)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: un comando de CLI `valmen perfiles` para listar los perfiles de modelos (incorporados y del proyecto) con la elección vigente, mostrar uno rol por rol, elegir el perfil del proyecto o de un ejecutor y quitar esa elección; el origen del perfil (id y alcance) en `valmen routing show`; y una herramienta MCP de solo lectura `ver_perfiles` para que Hermes —que habla con el harness por el servidor MCP que declara `valmen hermes connect`— liste, muestre y vea el modelo efectivo por fase con su origen. Fuera de alcance: crear y editar perfiles (FEATURE-MC-PERFILES-MODELOS-20261007, ya en Mission Control), la resolución del perfil (FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007) y la vista de modelos efectivos de Mission Control (FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007). Elegir desde Hermes no entra: el cambio de perfil lo hace una persona por el CLI o por Mission Control.
- Usuario o rol afectado: el PO que trabaja desde la terminal o desde Hermes (Telegram) y quiere saber qué perfil rige y qué modelo corre cada fase, y elegir el perfil sin abrir Mission Control.
- Comportamiento actual: elegir un perfil solo se puede desde Mission Control (`PUT /api/perfiles/seleccion`); el CLI no tiene comando de perfiles y `valmen routing show` dice `perfil` como origen sin decir cuál ni con qué alcance; el modelo por fase con su origen solo aparece dentro del brief de un ticket (`valmen resume`, `reanudar_ticket`); el catálogo MCP no tiene ninguna herramienta de perfiles, así que Hermes no puede consultarlos.
- Comportamiento esperado: `valmen perfiles` lista los perfiles con su origen y marca el elegido para el proyecto y para cada ejecutor; `valmen perfiles show <id>` muestra cada rol con proveedor, modelo y esfuerzo; `valmen perfiles elegir <id> [--cliente <ejecutor>]` y `valmen perfiles quitar [--cliente <ejecutor>]` escriben solo la clave `seleccion` de `.valmen/profiles.yaml`; `valmen routing show` nombra el perfil y el alcance de cada rol que sale de un perfil; `ver_perfiles` devuelve a Hermes la lista, un perfil, la elección y el modelo efectivo por fase con su origen.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el modelo de datos y la lectura de perfiles ya existen en el adaptador —`PerfilDeModelos` (`packages/adapter/src/routing.ts:443`), `PERFILES_INCORPORADOS` (`packages/adapter/src/routing.ts:490`), `perfilesPath` → `.valmen/profiles.yaml` (`packages/adapter/src/routing.ts:621`), `readSeleccionDePerfil` (`packages/adapter/src/routing.ts:700`), `perfilElegido` (`packages/adapter/src/routing.ts:717`), `listarPerfiles` (`packages/adapter/src/routing.ts:797`), `rutasDelProyecto` (`packages/adapter/src/routing.ts:1465`) y `fasesDeSesion` (`packages/adapter/src/routing.ts:1226`)—, y la escritura de la elección ya existe en el servidor —`elegirPerfil` (`packages/server/src/routing.ts:443`), que valida el ejecutor contra `EJECUTORES_CON_PERFIL` y el id contra `listarPerfiles`, y reescribe con `renderPerfiles` conservando los perfiles del proyecto—, pero sus únicos consumidores son las rutas de Mission Control `GET /api/perfiles` y `PUT /api/perfiles/seleccion` (`packages/server/src/server.ts:1580`, `packages/server/src/server.ts:1607`). El CLI no tiene comando de perfiles: el despacho de `main.ts` solo conoce `routing` (`packages/cli/src/main.ts:1990`) y la ayuda (`packages/cli/src/main.ts:515`); `routingCommand` (`packages/cli/src/setup.ts:221`) imprime `ruta.source` (`packages/cli/src/setup.ts:254`) e ignora `ruta.perfil`, que `ResolvedRoute` ya trae (`packages/adapter/src/routing.ts:846`). El catálogo MCP (`packages/mcp/src/tools.ts`) no declara ninguna herramienta de perfiles —solo usa `EJECUTORES_CON_PERFIL` para el `cliente` de `reanudar_ticket` (`packages/mcp/src/tools.ts:832`)—, y Hermes solo alcanza al harness por ese catálogo (`valmen hermes connect`, `packages/cli/src/hermes.ts:254`). El modelo efectivo por fase con origen ya se pinta con `renderFases` (`packages/engine/src/resume.ts:213`), pero solo dentro del brief de un ticket. Lo que falta es, por tanto, solo la puerta de CLI y la de MCP sobre funciones que ya existen; `valmen routing` no lista ni elige perfiles (comprobado en `packages/cli/src/setup.ts:221-373`).
- Hipótesis pendientes: ninguna de comportamiento. Decisión para el PO: Hermes solo lee (sin herramienta MCP que escriba `profiles.yaml`), porque una herramienta MCP la ejecuta el modelo y el cambio de perfil lo decide una persona; si el PO quiere elegir desde Hermes, es otra herramienta con su confirmación y otro ticket.
- Consumidores afectados: `packages/cli/src/setup.ts` (comando nuevo junto a `routingCommand` y columna de origen de `routing show`), `packages/cli/src/main.ts` (ayuda, despacho), `packages/cli/src/index.ts` (exporta el comando para el MCP), `packages/mcp/src/tools.ts` (herramienta nueva y su `case`), `packages/server/src/hermes.ts` (`HERRAMIENTAS_DE_LECTURA`, que clasifica las herramientas de una sesión de Hermes), y las pruebas que enumeran el catálogo: `tests/mcp-server.test.ts`, `tests/mcp-anotaciones.test.ts`, `tests/mcp-resumen-siguiente-paso.test.ts`, `tests/hermes.test.ts`; más `tests/puesta-en-marcha.test.ts` (pruebas de `routingCommand`) y `tests/cli.test.ts` (ayuda contra banderas). No cambian: `elegirPerfil` y `/api/perfiles` (Mission Control sigue igual), `rutasDelProyecto`, `fasesDeSesion`, `renderFases` y el brief de `resume`.
- Archivos y flujo investigados: `packages/adapter/src/routing.ts`, `packages/server/src/routing.ts`, `packages/server/src/server.ts`, `packages/server/src/hermes.ts`, `packages/cli/src/setup.ts`, `packages/cli/src/main.ts`, `packages/cli/src/hermes.ts`, `packages/cli/src/index.ts`, `packages/mcp/src/tools.ts`, `packages/engine/src/resume.ts`, `packages/cli/package.json` (el CLI ya depende de `@valmen/server`), `packages/mcp/package.json` (el MCP depende de `@valmen/cli`). Flujo hoy: Mission Control → `PUT /api/perfiles/seleccion` → `elegirPerfil` → `.valmen/profiles.yaml` → `readSeleccionDePerfil` → `rutasDelProyecto` → compuertas, jornada y `fasesDeSesion`. Flujo nuevo: `valmen perfiles elegir` → mismo `elegirPerfil`; `valmen perfiles` / `ver_perfiles` → `listarPerfiles` + `readSeleccionDePerfil` + `fasesDeSesion` + `renderFases`.
- Riesgos y compatibilidad: elegir un perfil cambia los modelos de las compuertas y de las fases en la próxima corrida; por eso solo lo hace una persona por el CLI y el comando lo dice. La escritura reutiliza `elegirPerfil`, que no crea perfiles, no toca `.valmen/routing.yaml`, `.valmen/config.yaml` ni credenciales, y no escribe si el id o el ejecutor no existen; no amplía ninguna autoridad. `renderPerfiles` reescribe el archivo y pierde comentarios escritos a mano, como ya ocurre desde Mission Control. Un `profiles.yaml` ilegible hace fallar `readSeleccionDePerfil`: el comando y la herramienta deben devolver el error con su mensaje, no una excepción. Agregar una herramienta al catálogo obliga a sumarla en las listas de las pruebas y de Hermes; si falta, `tests/hermes.test.ts` lo dice.
- Impactos de sync, migración, Docker o despliegue: ninguno; es un comando local del CLI y una herramienta MCP de lectura sobre un archivo de configuración del proyecto, sin datos sincronizados, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: el comando `valmen perfiles [list|show <id>|elegir <id>|quitar] [--cliente <ejecutor>]` en el CLI, el id y el alcance del perfil en la columna de origen de `valmen routing show`, y la herramienta MCP de solo lectura `ver_perfiles` para Hermes. Todo reutiliza funciones que ya existen (`listarPerfiles`, `readSeleccionDePerfil`, `fasesDeSesion`, `renderFases`, `elegirPerfil`); no se cambia cómo se resuelve ni cómo se guarda un perfil. Exclusiones: crear o editar perfiles por CLI, una herramienta MCP que elija perfil, Mission Control y la resolución del perfil.
- Quién elige y qué autoridad tiene: elegir o quitar un perfil escribe la clave `seleccion` de `.valmen/profiles.yaml`, configuración del proyecto; lo hace una persona con `valmen perfiles elegir` (o desde Mission Control, como hoy). Ninguna herramienta MCP escribe ese archivo, así que ni Hermes ni un agente cambian el perfil por su cuenta: `ver_perfiles` devuelve el comando exacto para que la persona lo corra. El cambio solo acepta ids que ya existen y ejecutores de `EJECUTORES_CON_PERFIL`; no crea perfiles, no toca `.valmen/routing.yaml`, `.valmen/config.yaml`, credenciales ni hosts permitidos, y no amplía la autoridad de ninguna compuerta ni de ningún agente.
- Pasos ordenados:
  1. Dependencias: confirmar con `grep -n "export function elegirPerfil" packages/server/src/routing.ts` y `grep -n "export function fasesDeSesion" packages/adapter/src/routing.ts` que la escritura de la elección y la resolución por fase están en la rama, y que `packages/cli/package.json` ya depende de `@valmen/server`; si falta algo, detenerse (C1, C7).
  2. En `packages/cli/src/setup.ts`, junto a `routingCommand`, agregar `perfilesCommand(paths, flags, subcomando, id)`: `list` (por defecto) imprime cada perfil de `listarPerfiles(paths.root)` con su `origen`, marca «elegido para el proyecto» y «elegido para <ejecutor>» según `readSeleccionDePerfil`, y agrega las líneas de `renderFases(fasesDeSesion(paths.root, { cliente }))` con el `--cliente` si viene; `show <id>` imprime cada rol con proveedor, modelo y esfuerzo, o falla con `EXIT_SCHEMA` si el id no existe; `elegir <id>` y `quitar` llaman a `elegirPerfil(paths.root, { perfil, ejecutor })` con `perfil` igual a `null` para quitar, devuelven los `errores` con código distinto de cero sin escribir, y al escribir dicen qué cambió y que rige en la próxima corrida. Un error de lectura de `profiles.yaml` se captura con `toFailure` y sale como mensaje, no como excepción (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15).
  3. En el mismo `routingCommand` de `packages/cli/src/setup.ts`, la columna de origen de `show` pinta `perfil <id> (<alcance>)` cuando `ruta.perfil` viene, en vez de solo `ruta.source` (C16).
  4. En `packages/cli/src/main.ts`, agregar `perfiles [list|show|elegir|quitar]` a la ayuda junto a `routing [show|set|clear]`, documentando `--cliente <ejecutor>` y que elegir lo hace una persona; despachar `command === "perfiles"` a `perfilesCommand` junto al despacho de `routing`. `--cliente` ya está en la lista de banderas con valor y no se agrega otra (C17, C18).
  5. En `packages/cli/src/index.ts`, exportar `perfilesCommand` para que el MCP lo use sin depender del servidor (C20).
  6. En `packages/mcp/src/tools.ts`, declarar `ver_perfiles` con anotación `SOLO_LEE`, propiedades opcionales `id` y `cliente` (enum `EJECUTORES_CON_PERFIL`) y una descripción que diga que solo lee y que elegir lo hace una persona con `valmen perfiles elegir`; en `callTool`, el `case "ver_perfiles"` llama a `perfilesCommand` con `list` o `show` y nunca con `elegir` ni `quitar` (C19, C20, C21, C22, C23).
  7. En `packages/server/src/hermes.ts`, sumar `ver_perfiles` a `HERRAMIENTAS_DE_LECTURA` (C24).
  8. Pruebas: en `tests/puesta-en-marcha.test.ts`, un bloque «perfiles» sobre una raíz temporal con `.valmen/profiles.yaml` que declara un perfil del proyecto, `.valmen/routing.yaml` y `.valmen/config.yaml`: lista, marcas, fases, `show`, id inexistente, `elegir` del proyecto y por ejecutor, ejecutor no admitido, `quitar` en los dos alcances, bytes de `routing.yaml` y `config.yaml` iguales antes y después, `profiles.yaml` ilegible, y `routing show` con el perfil elegido. En `tests/cli.test.ts`, que la ayuda nombra `perfiles`. En `tests/mcp-server.test.ts`, sumar `ver_perfiles` a la lista del catálogo y llamar `callTool` sin `id`, con `id` y con `cliente`, comprobando que `profiles.yaml` no cambia. En `tests/mcp-anotaciones.test.ts`, sumarla a las de solo lectura; en `tests/mcp-resumen-siguiente-paso.test.ts`, sumarla a las llamadas de lectura si esa lista lo exige (C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C19, C20, C21, C22, C23, C24).
  9. Correr desde la raíz del worktree: `npx vitest run tests/puesta-en-marcha.test.ts tests/cli.test.ts tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts tests/mcp-resumen-siguiente-paso.test.ts tests/hermes.test.ts tests/routing.test.ts` y `npx tsc --noEmit -p tsconfig.json`; luego `valmen secrets` (C18, C25).
  10. Validación manual en este repositorio: (a) `valmen perfiles` y `valmen perfiles show claude-code-completo`; (b) `valmen perfiles elegir claude-code-completo`, luego `valmen routing show` y `valmen resume --id FEATURE-CLI-PERFILES-MODELOS-20261007 --cliente claude` muestran el origen `perfil claude-code-completo`; (c) `valmen perfiles quitar` deja el archivo sin elección; (d) desde Hermes conectado (`valmen hermes status`), pedirle los perfiles y comprobar que usa `ver_perfiles` y responde la lista con la elección vigente (C26, C27, C28).
  11. Entrega: contrato de pruebas en `## Pruebas` con los comandos del paso 9 (directorio: raíz del repositorio; resultado esperado: todo en verde), los pasos manuales del paso 10 con su resultado esperado y los requisitos de ambiente (Node 24, `valmen` enlazado, Hermes conectado para el paso 10d); registrar el consumo de IA, marcar con `- [x]` los criterios verificados y pasar a `awaiting_user_tests`; commit solo en la rama del worktree tras la confirmación, sin push ni merge.
- Impactos declarados: sincronización: ninguno, no hay datos ya sincronizados ni clientes que todavía no se actualizaron; migración: ninguna, no hay orden de aplicación ni reversión de datos; contenedores: ninguno, no hay imagen ni publicación. El único archivo que se escribe es `.valmen/profiles.yaml`, y solo por una persona desde el CLI, con el mismo escritor que ya usa Mission Control.
- Riesgos y decisiones para el PO: (1) Hermes solo lee: elegir desde Hermes queda fuera, porque una herramienta MCP la ejecuta el modelo y el cambio de perfil lo hace una persona; si se quiere, es otro ticket con su confirmación. (2) El comando no crea ni edita perfiles: eso sigue en Mission Control. (3) Elegir reescribe `profiles.yaml` con `renderPerfiles` y pierde comentarios escritos a mano, igual que hoy desde la pantalla. (4) Elegir un perfil cambia los modelos de las compuertas y fases en la próxima corrida; el comando lo avisa al escribir.
- Rollback (obligatorio): revertir el commit del ticket; el CLI pierde `perfiles` y vuelve el origen anterior de `routing show`, el catálogo MCP pierde `ver_perfiles` y Hermes su entrada en la lista de lectura. Si se eligió un perfil durante las pruebas, `valmen perfiles quitar` o borrar la clave `seleccion` de `.valmen/profiles.yaml` lo deja como estaba; el resto del archivo no cambia.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: R-PERF-002: `valmen perfiles` lista los perfiles incorporados y los del proyecto, cada uno con su origen.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C2: R-PERF-002: la lista marca el perfil elegido para el proyecto.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C3: R-PERF-002: la lista marca el perfil elegido para cada ejecutor.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C4: R-PERF-005: la lista incluye el modelo efectivo de cada fase con su origen, resuelto para el `--cliente` si viene.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C5: R-PERF-002: `valmen perfiles show <id>` muestra cada rol del perfil con proveedor, modelo y esfuerzo.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C6: `valmen perfiles show` con un id que no existe sale con código distinto de cero y lo dice.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C7: R-PERF-002: `valmen perfiles elegir <id>` escribe el perfil elegido para el proyecto en `.valmen/profiles.yaml`.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C8: `valmen perfiles elegir` conserva los perfiles del proyecto ya guardados en `.valmen/profiles.yaml`.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C9: R-PERF-002: `valmen perfiles elegir <id> --cliente <ejecutor>` escribe la elección de ese ejecutor sin cambiar la del proyecto.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C10: `valmen perfiles elegir` con un id que no existe sale con error y no crea ni modifica `.valmen/profiles.yaml`.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C11: `valmen perfiles elegir` con un ejecutor que no admite perfil sale con error y no escribe.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C12: `valmen perfiles quitar` quita la elección del proyecto.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C13: `valmen perfiles quitar --cliente <ejecutor>` quita solo la elección de ese ejecutor.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C14: Elegir o quitar un perfil deja `.valmen/routing.yaml` y `.valmen/config.yaml` con los mismos bytes.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C15: Con un `.valmen/profiles.yaml` ilegible, `valmen perfiles` sale con el mensaje del error y código distinto de cero, sin excepción.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C16: R-PERF-005: `valmen routing show` muestra, en un rol que sale de un perfil, el id del perfil y su alcance.
      <!-- test: npx vitest run tests/puesta-en-marcha.test.ts -->
- [x] C17: La ayuda del CLI documenta el comando `perfiles`.
      <!-- test: npx vitest run tests/cli.test.ts -->
- [x] C18: Las banderas con valor que documenta la ayuda siguen declaradas en la lista del CLI.
      <!-- test: npx vitest run tests/cli.test.ts -->
- [x] C19: El catálogo MCP declara `ver_perfiles` con la anotación de solo lectura.
      <!-- test: npx vitest run tests/mcp-anotaciones.test.ts -->
- [x] C20: R-PERF-002: `ver_perfiles` sin `id` devuelve la lista de perfiles con su origen y la elección vigente.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [x] C21: R-PERF-002: `ver_perfiles` con `id` devuelve los roles de ese perfil con proveedor, modelo y esfuerzo.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [x] C22: R-PERF-005: `ver_perfiles` con `cliente` devuelve el modelo efectivo de cada fase con su origen para ese ejecutor.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [x] C23: Llamar a `ver_perfiles` no crea ni modifica `.valmen/profiles.yaml`.
      <!-- test: npx vitest run tests/mcp-server.test.ts -->
- [x] C24: `ver_perfiles` figura en la lista de herramientas de lectura que clasifica las sesiones de Hermes.
      <!-- test: npx vitest run tests/hermes.test.ts -->
- [x] C25: El tipado del proyecto compila sin errores.
      <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C26: En este repositorio, tras `valmen perfiles elegir claude-code-completo`, `valmen resume` muestra el origen `perfil claude-code-completo` en «Modelos por fase».
      <!-- verify: manual -->
- [x] C27: En este repositorio, `valmen perfiles quitar` deja `.valmen/profiles.yaml` sin elección.
      <!-- verify: manual -->
- [x] C28: Desde Hermes conectado, pedir los perfiles responde la lista con la elección vigente usando `ver_perfiles`.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-CLI-PERFILES-MODELOS-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/index.ts",
      "packages/cli/src/main.ts",
      "packages/cli/src/setup.ts",
      "packages/mcp/src/tools.ts",
      "packages/server/src/hermes.ts",
      "tests/cli.test.ts"
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

- `packages/cli/src/setup.ts`: `perfilesCommand` (list, show, elegir, quitar; `--cliente`), que reutiliza `listarPerfiles`, `readSeleccionDePerfil`, `fasesDeSesion`, `renderFases` y `elegirPerfil`; los errores salen como mensaje, no como excepción. `routing show` pinta `perfil <id> (<alcance>)` en el origen.
- `packages/cli/src/main.ts`: ayuda y despacho de `perfiles` (mínimo). `packages/cli/src/index.ts`: exporta `perfilesCommand`.
- `packages/mcp/src/tools.ts`: herramienta `ver_perfiles` (SOLO_LEE) que solo llama a `list` o `show`; ninguna herramienta MCP escribe `profiles.yaml`. `packages/server/src/hermes.ts`: `ver_perfiles` en `HERRAMIENTAS_DE_LECTURA`.
- Pruebas: `tests/puesta-en-marcha.test.ts`, `tests/cli.test.ts`, `tests/mcp-server.test.ts`, `tests/mcp-anotaciones.test.ts` (conteos 55 a 56 y 23 a 24).

## Pruebas

Directorio: raíz del repositorio (Node 24).

1. `npx vitest run tests/puesta-en-marcha.test.ts tests/cli.test.ts tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts tests/mcp-resumen-siguiente-paso.test.ts tests/hermes.test.ts tests/routing.test.ts` — esperado: 7 archivos, 262 pruebas en verde (corrido).
2. `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores (corrido).
3. `valmen secrets` — sin hallazgos (corrido).

Validación manual (la hace el responsable; C26 a C28 siguen sin marcar):
- a. `valmen perfiles` y `valmen perfiles show claude-code-completo`: lista con origen y fases; roles con proveedor, modelo y esfuerzo.
- b. `valmen perfiles elegir claude-code-completo`; luego `valmen routing show` y `valmen resume --id FEATURE-CLI-PERFILES-MODELOS-20261007 --cliente claude` muestran `perfil claude-code-completo` (C26).
- c. `valmen perfiles quitar` deja `.valmen/profiles.yaml` sin la clave `seleccion` (C27).
- d. Con Hermes conectado (`valmen hermes status`), pedirle los perfiles: usa `ver_perfiles` y responde la lista con la elección vigente (C28).

Requisitos de ambiente: `valmen` enlazado a este build y Hermes conectado para (d).

- Verificación 2026-10-08 sobre un laboratorio: `valmen perfiles elegir claude-code-completo` escribe `seleccion`, `valmen routing show` muestra `perfil claude-code-completo (proyecto)`, y `valmen perfiles quitar` deja `.valmen/profiles.yaml` sin la clave. C28: el PO consultó los perfiles con Hermes y trajo los 3 (2026-10-08).

- Resultado del PO: «si hermes consultó y me trajo los 3» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:39214d83d425e9db724d7b737bf5fdb6c6374479",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«si hermes consultó y me trajo los 3» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:5750d80e4b5e1291a443a75c6aea9d5f7479fec60a15aa001b85cbac16301864",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«si hermes consultó y me trajo los 3» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Listar, mostrar y elegir perfiles por CLI y desde Hermes",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesion de implementacion en subagente; la sesion no expone numeros.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion-20261008",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×104, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16627901 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:48.767Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:48:59.932Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:50:38.699Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:52:13.535Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba el plan de CLI-PERFILES-MODELOS: Hermes solo lee, elegir perfil es una acción de la persona por el CLI)\",\"planHash\":\"sha256:91540cd6c9ae78548790cec13a0db7ade6ef995888141f2a1b2949bf76811135\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:52:13.867Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:91540cd6c9ae78548790cec13a0db7ade6ef995888141f2a1b2949bf76811135."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:52:13.867Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:52:36.494Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:56:18.793Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:56:19.079Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:31.749Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:32.035Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:32.329Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:32.599Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:32.884Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:33.261Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:33.654Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:33.957Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:34.259Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:34.552Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:34.840Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:35.161Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:36.595Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:36.777Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:37.099Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
