---
schema_version: 2
id: FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926
title: Agregar portafolio de proyectos en Mission Control
type: FEATURE
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-PORTAFOLIO-PROYECTOS-20260926

## Solicitud original

Parte del sprint: Adoptar el harness y habilitar la operación multiproyecto con registros independientes.
- R-S2-005: Vista de portafolio en Mission Control — Mission Control DEBE ofrecer una vista que agregue los proyectos declarados:
Depende de: FEATURE-CLI-ADOPTAR-PROYECTO-20260926, FEATURE-HERMES-PERFIL-PROYECTO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: Mission Control de este repositorio — el endpoint nuevo del servidor (`packages/server/src/`) y la vista nueva de la interfaz (`packages/server/web/index.html`) que agrega los proyectos declarados en `~/.valmen/bindings.local.yaml`. No incluye cambiar de proyecto dentro de una instancia ni resolver cada operación contra un proyecto elegido: eso es FEATURE-MC-SELECTOR-PROYECTOS-20261001, que depende de este ticket (`.valmen/features/control-jornadas-ejecucion/tickets.yaml:72-81`).
- Usuario o rol afectado: el PO que opera más de un proyecto adoptado y hoy tiene que abrir una instancia de Mission Control por proyecto para ver qué quedó esperando una decisión suya.
- Comportamiento actual: la aplicación sirve una sola raíz —`ServerContext.root`, en `packages/server/src/server.ts:130`, resuelta de `--root` en `defaultContext` (`packages/server/src/server.ts:159`)— y ninguna de sus vistas agrega proyectos: `grep -rn "portafolio" packages/` no devuelve código. Lo que la persona quiere saber por proyecto existe hoy, pero solo se puede ver de a uno y solo del proyecto servido: las compuertas escaladas se leen por ticket (`packages/server/src/gates.ts:509`), las corridas detenidas por proceso (`packages/server/src/processes.ts:108`) y el consumo del propio harness por rango de fechas (`packages/engine/src/usage.ts:124`, ya expuesto como `valmen usage`).
- Comportamiento esperado: una vista de portafolio, de solo lectura, que por cada proyecto declarado con su raíz diga cuántas compuertas esperan decisión, cuántos procesos quedaron detenidos y cuál fue el consumo del mes, sin exigir que los proyectos compartan registro ni máquina —cada uno se lee de su propio `.valmen/` y el que no es legible en esta máquina se informa como no disponible con su motivo, en vez de omitirse—.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/machine-bindings.ts` (el catálogo declarado), `packages/engine/src/project-resolution.ts` (su resolución), `packages/engine/src/discovery.ts:174` (`choosePaths`, que resuelve el layout del registro de cualquier raíz), `packages/engine/src/receipts.ts:35,56` y `packages/engine/src/usage.ts:30,124` (recibos y consumo), `packages/engine/src/run-state.ts:117,132` (corridas), `packages/server/src/server.ts:309,467` (despacho de la API y el endpoint de procesos como molde), `packages/server/src/processes.ts:108` y `packages/server/src/gates.ts:483,509` (las proyecciones que ya existen), `packages/server/web/index.html:1923,6668,6810` (navegación, títulos y enrutado de la vista) y `scripts/verificar-interfaz.mjs:232,635,655` (el arnés de la interfaz).
- Causa raíz o hipótesis: **el síntoma es que no hay ninguna pantalla que muestre los proyectos a la vez**, y ocurre porque la vista nunca se escribió: no hay defecto que arreglar. No se escribió porque la aplicación se construyó con **una raíz única** —el contexto del servidor lleva `root` y nada más (`packages/server/src/server.ts:130`), y `defaultContext` lo toma del `--root` del arranque (`:159`)—, mientras la declaración de proyectos por máquina llegó después: FEATURE-CONFIG-BINDINGS-MAQUINA-20261001 (cerrado) dejó el catálogo `~/.valmen/bindings.local.yaml` con `schema-version`, `machine-id` y un mapa `projects` de project-id a `{root, hermes-profile}` (`packages/adapter/src/machine-bindings.ts:13,22-25,40`), y su resolución se escribió **de a un proyecto**: `resolveAuthorizedProject` valida una entrada y falla si no está declarada (`packages/engine/src/project-resolution.ts:32-38`), y `resolveProjectForHermesProfile` busca el proyecto de un perfil (`:57-66`). Ninguna función del motor lee el catálogo entero, así que no hay con qué agregar: el catálogo está en disco y validado, y lo que falta es la lectura que lo recorre y las tres cuentas por proyecto. De ahí el síntoma completo: hoy la única forma de ver lo que espera en otro proyecto es abrir otra instancia de Mission Control contra su raíz.
- Alcance: los cuatro archivos de código que se tocan y los dos de pruebas (pasos del plan). Queda **fuera**: el selector y la resolución por operación (FEATURE-MC-SELECTOR-PROYECTOS-20261001), la disponibilidad por máquina y por fuente en su forma completa (FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001, que depende del selector) y cualquier escritura: la vista no mueve estados, no aprueba compuertas y no escribe en el registro. El mecanismo de declaración **no se duplica**: la feature del ciclo lo pide coordinar con este ticket para no dejar dos catálogos incompatibles (`.valmen/features/control-jornadas-ejecucion/design.md:53`).
- Riesgos y compatibilidad: el riesgo real es de **alcance**, no técnico —implementar acá el selector o la resolución autorizada por petición adelantaría dos tickets que dependen de este y cambiaría lo que el PO firma—; se acota en las decisiones 2 y 3. Compatibilidad: el endpoint nuevo es aditivo (ninguna ruta existente cambia), la vista es aditiva en la navegación, y `~/.valmen/bindings.local.yaml` no se toca. Un `bindings.local.yaml` ausente o ilegible no puede tumbar la pantalla: la vista de portafolio degrada con una fila que lo dice, igual que el resto de la app.
- Puntos de extensión que YA existen: (1) el catálogo declarado con su raíz y su perfil, ya parseado y validado por esquema cerrado —`parseMachineBindings`, `packages/adapter/src/machine-bindings.ts:40`, y la ruta canónica `machineBindingsPath`, `:35`, que resuelve `~/.valmen/bindings.local.yaml` sin escribirla a mano—; (2) la validación de pertenencia que este ticket reutiliza por proyecto —raíz legible y `project-id` coincidente con el binding—, ya escrita en `resolveAuthorizedProject` (`packages/engine/src/project-resolution.ts:32-46`); (3) `choosePaths` (`packages/engine/src/discovery.ts:174`), que elige `tickets` o `docs/tickets` según el proyecto, así que una raíz adoptada se agrega sin caso especial; (4) las tres cuentas que el requisito pide, ya implementadas y probadas sobre una raíz: compuertas escaladas sin decisión humana —recibos vigentes con `escalatedTo === "human"` y `humanDecision === null`, vía `currentReceipts` (`packages/engine/src/receipts.ts:56`), la misma colapsación que usa `pendingCorrections` (`packages/server/src/gates.ts:483`) y el consumo por gate (`packages/engine/src/usage.ts:229`)—, corridas detenidas —`waitingRuns` (`packages/engine/src/run-state.ts:132`), la que ya usa `listRunRows` (`packages/server/src/processes.ts:108`)— y consumo por rango —`usageReport` (`packages/engine/src/usage.ts:124`)—; (5) el nombre para mostrar de cada proyecto, que ya lee `readConfig` (`packages/server/src/config.ts:163`) con `basename` de respaldo (`packages/server/src/config.ts:80`); y (6) los cuatro bordes donde una vista se cablea: el despacho de la API (`packages/server/src/server.ts:309`, con `/api/processes` en `:467` como molde), el enlace de la navegación (`packages/server/web/index.html:1923-1932`), el mapa de títulos (`:6668`) y la rama del enrutado (`:6810-6843`), más el arnés que las recorre (`scripts/verificar-interfaz.mjs:635`).
- Impactos de sync, migración, Docker o despliegue: ninguno: no toca la proyección `.valmen/` → `AGENTS.md` (sync), no escribe esquema ni datos —la vista es de solo lectura y `bindings.local.yaml` queda intacto— (migración), no cambia el arranque del servidor ni la forma en que se levanta (Docker) y no publica nada: `release_status` sigue en `unreleased` (despliegue).

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Aprobación delegada: el PO delegó esta aprobación el 2026-10-01 por Telegram —«Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets»—, así que la firma es de esta sesión **por esa delegación** y no una frase suya escrita después. La compuerta `plan` devolvió APPROVE (recibo `GR-20261002-plan`, 7 de 7 criterios sobre el umbral; las proposiciones marcadas descriptivas no votan) y la decisión quedó registrada en el recibo con el actor «Juan Andrade (delegación, 2026-10-01)».
- Pasos ordenados:
  1. `packages/engine/src/project-resolution.ts` — agregar `listAuthorizedProjects({home})`: recorre el mapa `projects` del catálogo declarado y, por cada entrada, reutiliza la misma validación que `resolveAuthorizedProject` (raíz absoluta que el parser ya validó, `.valmen/config.yaml` legible y `project-id` coincidente con el binding, `packages/engine/src/project-resolution.ts:39-46`), devolviendo las entradas no disponibles con su motivo en lugar de fallar por la primera. Archivos reutilizados: `machineBindingsPath` y `parseMachineBindings` de `packages/adapter/src/machine-bindings.ts` (ya importados en ese archivo).
  2. `packages/server/src/portafolio.ts` (archivo nuevo) — `listPortfolioRows(catalogo, raizActual)` y `summarizePortfolio(rows)`: por cada proyecto, el nombre para mostrar (`readConfig`, `packages/server/src/config.ts:163`), las compuertas que esperan decisión (recibos vigentes con `escalatedTo === "human"` y `humanDecision === null`, sobre `readAllReceipts` + `currentReceipts`, `packages/engine/src/receipts.ts:56`), las correcciones pendientes (`pendingCorrections`, `packages/server/src/gates.ts:483`), las corridas detenidas (`waitingRuns`, `packages/engine/src/run-state.ts:132`) y el consumo del mes (`usageReport`, `packages/engine/src/usage.ts:124`) con el rango del mes calendario en curso, más el aviso de disponibilidad y si es la raíz servida.
  3. `packages/server/src/server.ts` — `ServerContext` gana `bindingsFile` inyectable (por defecto `machineBindingsPath(homedir())`, para que las pruebas no lean el `$HOME` real) y el endpoint `GET /api/portafolio` junto al de procesos (`:467`), con `desde`/`hasta` opcionales y ninguna ruta en la query; un catálogo ausente o ilegible responde 200 con la lista vacía y el motivo, no un 500.
  4. `packages/server/web/index.html` — el enlace `#/portafolio` en la navegación (`:1923-1932`), su entrada en `TITULOS` (`:6668`), la rama `else if (nombre === "portafolio") await vistaPortafolio();` en el enrutado (`:6841`) y `vistaPortafolio()`, que pinta las métricas del conjunto y una fila por proyecto con sus tres números, su raíz y el aviso cuando no está disponible.
  5. `scripts/verificar-interfaz.mjs` — el payload de `/api/portafolio` en `respuesta()` (`:232`), la vista en `VISTAS` (`:635`) y las frases que tiene que decir en `AFIRMACIONES` (`:655`), para que el arnés recorra la rama nueva y compruebe que dice los números.
  6. `tests/portafolio.test.ts` (archivo nuevo) — catálogo de laboratorio en un `$HOME` temporal con tres raíces (dos legibles y una inexistente): la agregación por proyecto, el proyecto ilegible informado como no disponible, el proyecto sin recibos que informa cero en vez de fallar y el endpoint `GET /api/portafolio` por `handleApi`, sin red y sin tocar el `$HOME` real.
  7. `npm run build` y la corrida del arnés — el servidor sirve `packages/cli/dist/web/index.html`, y el arnés falla si la copia publicada no coincide con la fuente (`scripts/verificar-interfaz.mjs:730-740`), así que el build va antes de la verificación.
- Decisiones de diseño:
  1. El catálogo es `~/.valmen/bindings.local.yaml` —el que dejó FEATURE-CONFIG-BINDINGS-MAQUINA-20261001— y no un archivo nuevo. Lo sostiene el diseño de la feature que encadena este ticket: «El mecanismo de declaración se coordina con el ticket de portafolio para evitar dos catálogos incompatibles» (`.valmen/features/control-jornadas-ejecucion/design.md:53`). Alternativa descartada: `.valmen/projects.yaml` versionado — sería el segundo catálogo que ese diseño prohíbe, y además llevaría rutas absolutas de una máquina a un archivo versionado, contra R-PRO-004 (`.valmen/features/control-jornadas-ejecucion/spec/proyectos/spec.md:45-50`).
  2. La vista es agregación de solo lectura desde el catálogo declarado, y el endpoint no acepta rutas en la query. El selector y la resolución autorizada por operación son de FEATURE-MC-SELECTOR-PROYECTOS-20261001, que depende de este ticket (`.valmen/features/control-jornadas-ejecucion/tickets.yaml:72-81`); adelantarlos cambiaría lo que el PO firma.
  3. Un proyecto declarado cuya raíz no es legible en esta máquina se informa como no disponible con su motivo, en vez de omitirse: R-PRO-005 exige declarar la disponibilidad en vez de fingir que la vista conjunta está completa (`.valmen/features/control-jornadas-ejecucion/spec/proyectos/spec.md:58-69`). La forma completa —disponibilidad por máquina y por fuente— queda para FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001, que depende del selector.
  4. El rango del consumo es el mes calendario en curso, acotable con `desde`/`hasta`; la cuenta la hace `usageReport` (`packages/engine/src/usage.ts:124`), la misma función que alimenta `valmen usage`, así que la pantalla y el comando no pueden divergir. Alternativa descartada: contar los recibos en la capa de la vista —dos cuentas del mismo dato terminan discrepando.
  - Trazabilidad: el hallazgo «el catálogo está en disco y validado pero ninguna función lo lee entero» es la decisión 1 y el paso 1; el hallazgo «el contexto del servidor lleva una raíz única» es el paso 3; el hallazgo «los cuatro bordes de la vista no existen» son los pasos 4 y 5; el hallazgo «nada informa un proyecto ilegible» es la decisión 3 y el paso 2; el rango del mes es la decisión 4 y el paso 2.
- Guardas comprobadas en el árbol: `~/.valmen/bindings.local.yaml` existe con dos proyectos declarados (`valmen-harness` y `saiopencloud`); `npx vitest run` corre en verde antes de empezar (92 archivos, 1694 pruebas, 0 fallos) y `packages/cli/dist/web/index.html` existe; `choosePaths`, `parseMachineBindings`, `machineBindingsPath`, `readAllReceipts`, `currentReceipts`, `waitingRuns`, `usageReport` y `readConfig` están exportados por los índices de sus paquetes (`packages/engine/src/index.ts:17,31,36,51`, `packages/adapter/src/index.ts:11`, `packages/server/src/config.ts:163`).
- Rollback: revertir los seis archivos tocados (cuatro de código y dos de pruebas) y volver a correr `npm run build`. No hay datos que deshacer: la vista no escribe en el registro, no mueve estados y no toca `~/.valmen/bindings.local.yaml`; lo único que sobrevive al revert es el recibo de las compuertas y el historial del ticket, que son append-only a propósito.

## Criterios de aceptación

- [x] R-S2-005: la vista de portafolio agrega los proyectos declarados y por cada uno informa cuántas compuertas esperan decisión.
      <!-- test: npx vitest run tests/portafolio.test.ts -->
- [x] El portafolio informa por proyecto cuántas corridas de proceso quedaron detenidas.
      <!-- test: npx vitest run tests/portafolio.test.ts -->
- [x] El portafolio informa el consumo del mes por proyecto, y un proyecto sin recibos en el rango informa cero evaluaciones en vez de fallar.
      <!-- test: npx vitest run tests/portafolio.test.ts -->
- [x] Un proyecto declarado cuya raíz no es legible en esta máquina aparece como no disponible con su motivo, sin ocultarse ni interrumpir la agregación de los demás.
      <!-- test: npx vitest run tests/portafolio.test.ts -->
- [x] El endpoint devuelve los proyectos declarados y no acepta rutas en la query, así que ninguna petición amplía el acceso al disco.
      <!-- test: npx vitest run tests/portafolio.test.ts -->
- [x] La interfaz ofrece la vista de portafolio en su navegación y la pinta diciendo los tres números por proyecto.
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->
- [x] El servidor y el comando cuentan el mismo consumo: la vista usa `usageReport` por rango de fechas, no una cuenta propia.
      <!-- test: npx vitest run tests/portafolio.test.ts -->

## Puntos

```json
[]
```

## Implementación

Escrita por el ejecutor OpenCode (`opencode run --standalone --auto`, sesión sobre `/Users/juanandrade/Desktop/ValmenHarness`), siguiendo el plan paso por paso; el verificador revisó el diff y corrió las pruebas de abajo.

- `packages/engine/src/project-resolution.ts`: `listAuthorizedProjects({home, bindingsFile})` devuelve el catálogo declarado con `available` y `reason`, y la validación de una entrada se extrajo a `validateProject`, que ahora comparten la resolución individual y el catálogo. Un catálogo ausente o ilegible devuelve `available: false` con el motivo en vez de fallar.
- `packages/server/src/portafolio.ts` (nuevo): `portfolioRange` (mes calendario, acotable), `listPortfolioRows` y `summarizePortfolio`. Por proyecto: nombre de `.valmen/config.yaml`, compuertas escaladas sin decisión humana (recibos vigentes), correcciones pendientes, corridas detenidas y el consumo del rango con `usageReport` del motor. Un proyecto no disponible queda con métricas en `null`, nunca en cero.
- `packages/server/src/server.ts`: `ServerContext.bindingsFile` inyectable (por defecto `machineBindingsPath(homedir())`) y `GET /api/portafolio`, que solo admite `desde` y `hasta` —cualquier otra clave responde 400, así que ninguna petición amplía el acceso al disco— y degrada a 200 con el motivo cuando el catálogo no se puede leer.
- `packages/server/web/index.html`: vista `#/portafolio` (enlace en la navegación, título y rama del enrutado) con las métricas del conjunto, una fila por proyecto con sus tres números y su raíz, la marca de la instancia actual y el aviso de no disponible.
- `scripts/verificar-interfaz.mjs` y `tests/portafolio.test.ts` (nuevo): el arnés recorre la vista nueva contra un payload falso y afirma sus frases; el archivo enfocado prueba la agregación sobre un catálogo de laboratorio en un `$HOME` temporal.
- Fuera del ticket y sin tocar: los cambios sin commitear de otras sesiones (entre ellos la rama de refresco de la banda de fases en `index.html`) se dejaron intactos.

## Pruebas

Contrato de pruebas del ticket. Directorio de ejecución: `/Users/juanandrade/Desktop/ValmenHarness` (rama `main`, árbol con cambios sin commitear de otras sesiones).

- Resultado del PO: aprobación DELEGADA — el PO delegó el cierre y el QA de este ticket el 2026-10-01 por Telegram («Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets»); esta sesión corrió el contrato sobre el árbol de abajo y aprueba por esa delegación, no con palabras suyas.

- Archivo enfocado: `npx vitest run tests/portafolio.test.ts` → 20 pruebas, 20 pasan.
- Interfaz: `npx vitest run tests/interfaz-ejecutable.test.ts` → 13 pruebas, 13 pasan (11 vistas recorridas, incluida `#/portafolio`).
- Arnés de la interfaz publicado: `node scripts/verificar-interfaz.mjs` → «Interfaz verificada.», 11 vistas ejecutadas, sin fallos (comprueba que `packages/cli/dist/web/index.html` coincide con la fuente).
- Suite completa: `npx vitest run` → 93 archivos pasan, 1 omitido; 1714 pruebas pasan, 48 omitidas, 0 fallos. Línea base antes del cambio: 92 archivos y 1694 pruebas; la diferencia son el archivo y las 20 pruebas nuevas.
- Build y tipos: `npm run build` copia la interfaz a `packages/cli/dist/web`; `npx tsc --noEmit -p tsconfig.json` informa 2 errores **ajenos** en `tests/cascada-verificada.test.ts` (archivo modificado por otra sesión a las 18:32, antes de esta), ninguno en los archivos de este ticket.
- Endpoint en vivo: sobre el panel de Mission Control de este proyecto (puerto 4176), `GET /api/portafolio` responde 200 con los 2 proyectos declarados —`valmen-harness` (1 compuerta pendiente, 0 corridas detenidas, 6 evaluaciones de octubre) y `saiopencloud`— y la interfaz publicada ya sirve el enlace Portafolio.
- Verificación visual pendiente: la mirada humana en el navegador (tema claro y oscuro) no se pudo hacer en esta sesión —no hay navegador disponible—, así que la vista quedó ejercitada por el arnés ejecutable y no mirada por una persona.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:5b8205b60e94ccaa2035e33f693ebeb4d3e4dc693b83f6e6bb888decb4e3d09b",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-02",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Aprobación DELEGADA (no son palabras suyas de hoy): el PO delegó el QA y el cierre de este ticket el 2026-10-01 por Telegram con la frase \"Si termina el ciclo QA y hacemos los commit y push para dejar todo listo para en la noche programar otro ciclo con otros tickets\", y esta sesión corrió el contrato sobre el árbol worktree:sha256:5b8205b6 en local: archivo enfocado 20/20, interfaz ejecutable 13/13, suite completa 93 archivos y 1714 pruebas sin fallos."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-02",
    "kind": "worktree",
    "description": "Verificacion del verificador (no del ejecutor): diff revisado y contrato corrido sobre el arbol. Archivos hasheados en orden alfabetico: packages/engine/src/project-resolution.ts, packages/server/src/portafolio.ts, packages/server/src/server.ts, packages/server/web/index.html, scripts/verificar-interfaz.mjs, tests/portafolio.test.ts. Corrio: npx vitest run tests/portafolio.test.ts (20/20); npx vitest run tests/interfaz-ejecutable.test.ts (13/13); node scripts/verificar-interfaz.mjs (Interfaz verificada, 11 vistas); npx vitest run (93 archivos / 1714 pruebas / 0 fallos; base 92/1694); npm run build; y GET /api/portafolio en vivo sobre el panel 4176 (200, 2 proyectos declarados).",
    "reference": "worktree:sha256:5b8205b60e94ccaa2035e33f693ebeb4d3e4dc693b83f6e6bb888decb4e3d09b",
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-02",
    "technical_summary": "Mission Control gana la vista de portafolio: listAuthorizedProjects lee el catalogo local y devuelve cada proyecto declarado con su raiz y su disponibilidad sin fallar por uno ilegible; portafolio.ts agrega por proyecto las compuertas que esperan decision, las correcciones pendientes, las corridas detenidas y el consumo del mes con usageReport del motor; el endpoint GET /api/portafolio solo admite desde y hasta y degrada a 200 con motivo si el catalogo no se lee; la vista entra en la navegacion, el titulo y el enrutado, con una fila por proyecto y el aviso de no disponible. Verificado: archivo enfocado 20 de 20, interfaz ejecutable 13 de 13, arnes de interfaz verificado con 11 vistas, suite completa 93 archivos y 1714 pruebas sin fallos, build al dia y endpoint probado en vivo sobre el panel.",
    "functional_summary": "El PO ve en una pantalla todos los proyectos declarados de la maquina y, por cada uno, cuantas compuertas esperan su decision, cuantos procesos quedaron detenidos y cuanto consumio el harness en el mes. Un proyecto cuya raiz no es legible localmente aparece como no disponible con el motivo, en vez de desaparecer. La vista es de solo lectura y no toca el registro.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "ses_f05a182e5ffe7kAY7pCVQiWvN4",
    "model": "unbiased/pareto-26.10-preview",
    "reasoning_effort": null,
    "notes": "ejecutor del ticket: implemento el plan paso por paso, creo portafolio.ts y la vista, y corrio las pruebas; 21:08 a 21:14 hora de Bogota",
    "input_tokens": 402243,
    "output_tokens": 14741,
    "total_tokens": 416984,
    "estimated_cost_usd": 0.47267371,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "cron_2a8a7ce642e8_20261001_210040",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "sesion cron del eslabon 1: diagnostico, plan, compuertas, despacho del ejecutor, verificacion y cierre; lectura al cierre del turno, asi que la fila sigue creciendo unos miles de tokens mas; la base de Hermes no calcula costo para esta sesion",
    "input_tokens": 216250,
    "output_tokens": 53045,
    "total_tokens": 299179,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": "01a0f8a2-aabe-7542-8be9-2888dc93415b",
    "model": null,
    "reasoning_effort": null,
    "notes": "sesion de codex de las 13:03 en este repositorio que menciona decenas de tickets de los dos proyectos, entre ellos este: no se le adjudica gasto porque su costo es de todos los que atendio y la base de codex no le registra proveedor ni modelo. Gasto completo en /Users/juanandrade/.codex/sessions/2026/10/01/rollout-2026-10-01T13-03-25-01a0f8a2-aabe-7542-8be9-2888dc93415b.jsonl, 1424296 entrada / 198693 salida / 65014 razonamiento. Se declara para que la foto del cierre no la sume a este ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex",
    "confidence": "low",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T02:05:47.065Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T02:06:28.595Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (delegación, 2026-10-01): Aprobación delegada por el PO (Telegram 2026-10-01): la compuerta de análisis quedó en REVIEW por redacción, no por fondo — diagnostico_explica_el_sintoma 0.88 y nombra_archivos_reales 0.89 contra el umbral 0.90, con causa_especifica 0.95 y los cuatro checks mecánicos en verde. La recomendación es avanzar: la causa es concreta, cada afirmación cita ruta:línea verificada contra el árbol y el alcance queda acotado dejando fuera el selector y la disponibilidad por fuente, que son tickets posteriores. Una pasada de mejora ya se hizo y la banda no cedió: es redacción, no sustancia."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T02:07:11.046Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T02:07:31.149Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T02:21:15.769Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T02:22:46.889Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T02:24:42.003Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T02:24:42.167Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T02:24:51.345Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T02:25:37.787Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T02:25:37.973Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T02:26:39.431Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T02:26:48.008Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T02:28:29.611Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T02:28:38.103Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T02:28:46.127Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
