---
schema_version: 2
id: FEATURE-CLI-CODEGRAPH-ESTADO-20261007
title: Mostrar en el diagnóstico si CodeGraph está instalado, indexado y al día, y registrar su MCP en los clientes del proyecto
type: FEATURE
module: CLI
workflow_status: awaiting_user_tests
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

# FEATURE-CLI-CODEGRAPH-ESTADO-20261007

## Solicitud original

Parte del sprint: CodeGraph se ofrece al montar o adoptar un proyecto y su estado es visible.
- R-SKILL-004: CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-SKILL-004: lo cubre FEATURE-CLI-CODEGRAPH-MONTAJE-20261007 (Ofrecer instalar e indexar CodeGraph al montar o adoptar, solo con confirmación)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la parte de R-SKILL-004 que no instala nada. (1) `valmen doctor` muestra si CodeGraph está instalado en la máquina, si el proyecto tiene índice y si ese índice está al día, con el comando exacto para cada caso y sin indexar por su cuenta (escenario «Proyecto sin índice» de la spec). (2) `valmen mcp --install` registra, además del servidor `valmen`, el servidor MCP `codegraph` en los clientes de proyecto que el harness ya escribe (`.mcp.json` de Claude Code y `opencode.json`), y `--global` lo añade al `config.toml` de codex, solo cuando CodeGraph está instalado. Ofrecer instalar CodeGraph o indexar al montar o adoptar queda en FEATURE-CLI-CODEGRAPH-MONTAJE-20261007.
- Usuario o rol afectado: la persona o el agente que monta, adopta o pone a punto un proyecto con el harness y corre `valmen doctor` / `valmen mcp --install`.
- Comportamiento actual: `valmen doctor` no menciona CodeGraph; solo `valmen adopt` lo nombra como capacidad si existe `.codegraph/`, sin decir si el índice sirve. `valmen mcp --install` declara únicamente el servidor `valmen`; el MCP de CodeGraph hay que registrarlo a mano o con `codegraph install`, que por defecto escribe la configuración global de la persona.
- Comportamiento esperado: el diagnóstico tiene una línea «CodeGraph» con cuatro estados distinguibles —no instalado, instalado sin índice, índice al día, índice con cambios pendientes— y el arreglo correspondiente (`codegraph init`, `codegraph sync`); y una línea por cliente que dice si el servidor `codegraph` está declarado para el proyecto. `valmen mcp --install` deja la entrada `codegraph` (`codegraph serve --mcp`) junto a la de `valmen`, conservando lo demás e idempotente.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad nueva, no un defecto. (a) `doctorCommand` (`packages/cli/src/setup.ts:398`) arma sus hallazgos en nueve bloques fijos —Node, adopción, registro, AGENTS.md, MCP, routing, credenciales, selección, Hermes (`setup.ts:452`, `setup.ts:473`, `setup.ts:645`)— y ninguno consulta CodeGraph. (b) La única referencia a CodeGraph en el código es la detección de la carpeta en `profileProject` (`packages/adapter/src/adopt.ts:436`): mira que exista `.codegraph/`, no si el índice está inicializado ni al día, y solo se imprime como comentario de `adopt`. (c) Las fusiones de configuración MCP tienen el identificador del servidor fijo: `MCP_SERVER_ID = "valmen"` (`packages/adapter/src/mcp.ts:56`) y lo usan `mergeOpencodeConfig` (`mcp.ts:175`), `mergeClaudeConfig` (`mcp.ts:242`) y `mergeCodexConfig` (`mcp.ts:306`); por eso `mcpCommand` (`packages/cli/src/mcp.ts:155`, escrituras en `mcp.ts:203`, `mcp.ts:231`, `mcp.ts:262`) no puede declarar otro servidor sin generalizarlas. (d) La comprobación de MCP del doctor busca la subcadena «valmen» en el archivo (`setup.ts:452-470`), así que tampoco distingue otro servidor.
- Hipótesis pendientes: ninguna que bloquee. Comprobado en esta máquina con CodeGraph 0.9.9 (`codegraph --version`): `codegraph status --json` devuelve `{"initialized":false,…}` con salida 0 en una carpeta sin índice y no crea nada (`/tmp/cg-probe` siguió vacía); con índice devuelve `initialized:true` y `pendingChanges{added,modified,removed}` (SaiOpenCloud: 2 añadidos y 4 modificados; ValmenHarness: 0/0/0). `codegraph install --print-config claude|opencode|codex` imprime la entrada `codegraph` con `command: "codegraph"` y `args: ["serve","--mcp"]` sin escribir. Queda sin comprobar el formato de versiones de CodeGraph anteriores a 0.9.9: se trata como «estado ilegible» y no como «al día».
- Consumidores afectados: `valmen doctor` (`main.ts:1925-1926`) y su uso dentro de `onboarding-verify.ts:72`, que acepta salida 0 o 2 —CodeGraph es opcional y no debe cambiar el código de salida—; `valmen mcp` con y sin `--install`/`--global`/`--json` (`main.ts:1677`, `main.ts:1706`); las pruebas `tests/puesta-en-marcha.test.ts:186` (doctor) y `tests/mcp-registration.test.ts` (fusiones), que hoy asumen solo el servidor `valmen`.
- Archivos y flujo investigados: `packages/cli/src/setup.ts` (doctor, hallazgos `Hallazgo`, prioridad de pasos y salida), `packages/cli/src/mcp.ts` (mostrar/instalar por runtime), `packages/adapter/src/mcp.ts` (entradas y fusiones idempotentes), `packages/adapter/src/adopt.ts:418-452` (perfil y capacidades), `packages/cli/src/hermes.ts:181-188` (`hermesBinaryWorks`, el patrón existente de sondear un binario ejecutándolo con `spawnSync` y tope de tiempo), la spec `.valmen/features/skills-de-terceros-y-ux/spec/skills/spec.md:40-50` y `tickets.yaml` de la feature (este ticket no depende de otro; MONTAJE depende de este).
- Riesgos y compatibilidad: (1) el doctor documenta que **no escribe nada** (`setup.ts:13`, `setup.ts:393`): el sondeo debe limitarse a `codegraph status --json`, que es de solo lectura; nunca `init`, `index` ni `sync`. (2) Sondear un binario ajeno puede colgarse: lleva tope de tiempo y cualquier error se reporta como aviso, no como falta. (3) CodeGraph es opcional: todos sus hallazgos van en «Capacidades opcionales» con estado `aviso`/`ok`, sin alterar la salida 0/2 que consumen guiones y `onboarding-verify`. (4) Generalizar las fusiones por identificador de servidor no debe cambiar la salida actual para `valmen`: el parámetro tiene por defecto `MCP_SERVER_ID` y las pruebas existentes deben seguir pasando sin cambios. (5) `.mcp.json` y `opencode.json` se versionan: la entrada `codegraph` no lleva rutas absolutas (comando por nombre), igual que la de `valmen`. (6) Si CodeGraph no está instalado, `mcp --install` no declara un servidor que no arrancaría.
- Impactos de sync, migración, Docker o despliegue: ninguno — cambia el CLI local y su adaptador; no toca sincronización, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance y exclusiones: diagnóstico del estado de CodeGraph y registro de su MCP en los clientes que `valmen mcp` ya maneja. Fuera: instalar CodeGraph, correr `codegraph init`/`index`/`sync`, ofrecerlo en `adopt` (FEATURE-CLI-CODEGRAPH-MONTAJE-20261007), clientes que el harness no escribe hoy (Cursor, Hermes) y `codegraph install`, que escribe la configuración global de la persona.
- Pasos ordenados:
  1. `packages/adapter/src/codegraph.ts` (nuevo, exportado desde `packages/adapter/src/index.ts`): `CODEGRAPH_SERVER_ID = "codegraph"`, `codegraphEntry()` → `mcpEntry("codegraph", ["serve", "--mcp"])`, y la función pura `readCodegraphStatus(resultado)` que traduce la salida de `codegraph status --json` —o el error al lanzarlo— a un estado: `no-instalado` (ENOENT), `sin-indice` (`initialized:false`), `al-dia` (`pendingChanges` en 0/0/0), `desactualizado` (con los conteos) o `ilegible` (JSON inválido, salida distinta de 0, tope de tiempo). (C1, C2, C3, C4, C5)
  2. `packages/adapter/src/mcp.ts`: `mergeOpencodeConfig` (`mcp.ts:175`), `mergeClaudeConfig` (`mcp.ts:242`), `mergeCodexConfig` (`mcp.ts:306`) y `codexToml` reciben un identificador de servidor opcional con valor por defecto `MCP_SERVER_ID`; las notas nombran ese identificador. La salida para `valmen` no cambia. (C9, C10)
  3. `packages/cli/src/codegraph.ts` (nuevo): `probeCodegraph(root)` lanza `spawnSync("codegraph", ["status", "--json"], { cwd: root, timeout: 10_000 })` —el mismo patrón que `hermesBinaryWorks` en `packages/cli/src/hermes.ts:181`— y devuelve `readCodegraphStatus(...)`. Solo `status`: nunca `init`, `index` ni `sync`. (C6)
  4. `packages/cli/src/setup.ts`, `doctorCommand` (`setup.ts:398`): opción inyectable `codegraph?: () => CodegraphState` (por defecto `probeCodegraph(paths.root)`), un bloque nuevo tras el de Hermes (`setup.ts:645`) que añade a `opcionales` la línea «CodeGraph» con estado `ok` solo si está al día y `aviso` en lo demás, con arreglo `codegraph init` (sin índice) o `codegraph sync` (desactualizado); y, si está instalado, una línea «MCP codegraph en <cliente>» por `.mcp.json` y `opencode.json` que lee la clave `codegraph` del JSON (no una subcadena), con arreglo `valmen mcp --install`. Nada de esto entra en `basicos` ni cambia el código de salida. (C1, C2, C3, C4, C5, C7, C8)
  5. `packages/cli/src/mcp.ts`, `mcpCommand` (`mcp.ts:155`): `McpRequest` gana `codegraph?: CodegraphState`, que `main.ts` (`main.ts:1677`, `main.ts:1706`) llena con `probeCodegraph`. Si el estado no es `no-instalado`, `--install` fusiona también la entrada `codegraph` en `opencode.json` y `.mcp.json`, `--global` la añade al `config.toml` de codex, y sin `--install` se imprime su fragmento; con `no-instalado` se dice en una línea que no se declara porque no arrancaría. `--json` incluye la entrada. (C9, C11, C12)
  6. `tests/codegraph-estado.test.ts` (nuevo): casos de `readCodegraphStatus` para los cinco estados, doctor con sonda inyectada (sin depender del binario de la máquina), que el doctor no escribe archivos y conserva la salida 0/2, fusión idempotente de `codegraph` junto a `valmen` y `mcpCommand` con y sin CodeGraph instalado; el caso de `--global` corre con `HOME` apuntando a una carpeta temporal, porque `codexConfigPath()` (`packages/cli/src/mcp.ts:86`) resuelve `~/.codex/config.toml` con `homedir()` y la prueba no debe tocar el de la persona. `tests/mcp-registration.test.ts` y `tests/puesta-en-marcha.test.ts` quedan sin cambios y deben seguir pasando. (C1–C12)
  7. Verificación: `npx vitest run tests/codegraph-estado.test.ts tests/mcp-registration.test.ts tests/puesta-en-marcha.test.ts`, `npx tsc -b` y la suite completa `npx vitest run`; prueba manual de `valmen doctor` en este repositorio (indexado, al día) y en una carpeta temporal sin índice. (C13)
- Impactos declarados: ninguno — no hay sincronización, migración ni contenedores; el cambio es del CLI local.
- Pruebas: directorio `/Users/juanandrade/Desktop/ValmenHarness`; `npx vitest run tests/codegraph-estado.test.ts` (todo verde), `npx vitest run` (sin regresiones), `npx tsc -b` (sin errores). Manual: `valmen doctor` aquí muestra «CodeGraph» al día; en `mktemp -d` con `valmen doctor --root <dir>` muestra «falta indexar» con `codegraph init` y la carpeta sigue sin `.codegraph/`. Requisito de ambiente: CodeGraph ≥ 0.9.9 en el `PATH` solo para la prueba manual.
- Rollback (obligatorio): revertir el commit del ticket; no hay datos ni esquemas que deshacer. Una entrada `codegraph` que `valmen mcp --install` ya haya escrito en `.mcp.json`/`opencode.json` se quita borrando esa clave o con `codegraph uninstall`; el resto del archivo no se toca porque la fusión conserva lo ajeno.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] R-SKILL-004: CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto (solo la parte de «Mostrar en el diagnóstico si CodeGraph está instalado, indexado y al día, y registrar su MCP en los clientes del proyecto»; el resto lo cubre FEATURE-CLI-CODEGRAPH-MONTAJE-20261007)
      <!-- verify: manual -->
- [x] C1. Sin el binario `codegraph`, `valmen doctor` muestra la línea «CodeGraph» como no instalado, con estado de aviso.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C2. Con CodeGraph instalado y sin índice, `valmen doctor` dice que falta indexar y propone `codegraph init`.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C3. Con índice y `pendingChanges` en cero, la línea «CodeGraph» sale en estado ok.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C4. Con cambios pendientes, la línea muestra los conteos y propone `codegraph sync`.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C5. Una salida de `codegraph status` que no es JSON válido, o que sale con código distinto de 0, se informa como estado ilegible y no como al día.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C6. `valmen doctor` no crea `.codegraph/` ni ningún otro archivo en un proyecto sin índice.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C7. Ningún estado de CodeGraph cambia el código de salida de `valmen doctor`.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C8. Con CodeGraph instalado, el doctor muestra por `.mcp.json` y por `opencode.json` si el servidor `codegraph` está declarado.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C9. Con CodeGraph instalado, `valmen mcp --install` deja en `.mcp.json` y `opencode.json` la entrada `codegraph` con `codegraph serve --mcp` y conserva la de `valmen`.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C10. Repetir `valmen mcp --install` no modifica los archivos ya fusionados.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C11. Sin CodeGraph instalado, `valmen mcp --install` no declara el servidor `codegraph`.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C12. Con CodeGraph instalado, `valmen mcp --install --global` añade `[mcp_servers.codegraph]` al `config.toml` de codex.
      <!-- test: npx vitest run tests/codegraph-estado.test.ts -->
- [x] C13. Las pruebas existentes del registro MCP y del doctor siguen pasando sin cambios.
      <!-- test: npx vitest run tests/mcp-registration.test.ts tests/puesta-en-marcha.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se implementó el plan aprobado sin desviaciones de alcance.

- `packages/adapter/src/codegraph.ts` (nuevo, exportado desde `index.ts`): `CODEGRAPH_SERVER_ID`, `codegraphEntry()` y la función pura `readCodegraphStatus` con los cinco estados (`no-instalado`, `sin-indice`, `al-dia`, `desactualizado`, `ilegible`). Un JSON sin `initialized` o sin conteos válidos es `ilegible`, nunca «al día».
- `packages/adapter/src/mcp.ts`: `mergeOpencodeConfig`, `mergeClaudeConfig`, `mergeCodexConfig` y `codexToml` reciben `serverId` (por defecto `MCP_SERVER_ID`). Para `valmen` la salida y las notas no cambian; para otro servidor la nota lo nombra entre paréntesis.
- `packages/cli/src/codegraph.ts` (nuevo): `probeCodegraph(root, env)` lanza solo `codegraph status --json` con tope de 10 s. Recibe el `env` del doctor, de modo que las pruebas existentes (`env: {}`) no dependen del binario de la máquina.
- `packages/cli/src/setup.ts`: `doctorCommand` acepta `codegraph?: () => CodegraphState`; añade a «Capacidades opcionales» la línea «CodeGraph» (ok solo si está al día; `codegraph init` / `codegraph sync` como arreglo) y, si está instalado, «MCP codegraph en <cliente>» leyendo la clave del JSON. No entra en `basicos` ni cambia el código de salida.
- `packages/cli/src/mcp.ts` y `main.ts`: `McpRequest.codegraph`; con CodeGraph instalado, `--install` fusiona `codegraph` junto a `valmen` en `.mcp.json` y `opencode.json` (un solo write y solo si cambió), `--global` lo añade a codex, sin `--install` se imprime el fragmento y `--json` lo incluye; sin CodeGraph se dice en una línea que no se declara.
- `tests/codegraph-estado.test.ts` (nuevo, 17 pruebas). `--global` corre con `HOME` en una carpeta temporal.

Limitación conocida: `mergeCodexConfig` no crea `~/.codex/`; es comportamiento previo y no se tocó (la prueba crea la carpeta).

## Pruebas

Ejecutadas por el agente de implementación el 2026-10-07 en `/Users/juanandrade/Desktop/ValmenHarness`:

- `npx vitest run tests/codegraph-estado.test.ts tests/mcp-registration.test.ts tests/puesta-en-marcha.test.ts` → 3 archivos, 59 pruebas, todas verdes (las dos suites existentes sin modificar: C13).
- Typecheck: `npx tsc -p tsconfig.json --noEmit --composite false --incremental false` y `npx tsc --build tsconfig.build.json` → sin errores. (`npx tsc -b` a secas no compila nada en este repositorio: el tsconfig raíz no lista archivos.)
- Suite completa `npx vitest run`: 13 archivos con fallos antes de la última corrección de mi prueba; los 12 ajenos (`autorizacion-*-canales`, `delegation`, `firma-de-compuerta`, `gate-human-decision`, `gate-view`, `hermes-notify`, `jornada-sin-autoaprobacion`, `mcp-server`, `qa-commit-referencia`, `qa-por-politica`, `qa-sombra`) **fallan igual sin estos cambios** (comparado con `git stash`), no son de este ticket. Hay que decidir aparte qué hacer con ellos.
- Manual con el CLI compilado: `node packages/cli/dist/main.js doctor` aquí muestra «CodeGraph» con cambios pendientes (3 añadidos, 5 modificados) y `codegraph sync`; en `mktemp -d` con `--root` muestra «instalado, falta indexar» con `codegraph init` y la carpeta queda vacía (sin `.codegraph/`).

### Contrato de entrega para el responsable

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- `npx vitest run tests/codegraph-estado.test.ts tests/mcp-registration.test.ts tests/puesta-en-marcha.test.ts` → esperado: 59 pruebas verdes.
- `npx tsc --build tsconfig.build.json` → esperado: sin salida.
- Manual: `valmen doctor` muestra la línea «CodeGraph»; tras `codegraph sync` debe salir `✓` al día. `d=$(mktemp -d); valmen doctor --root $d` muestra «falta indexar» y `ls -A $d` sigue vacío. `valmen mcp --install` en una copia del proyecto deja la clave `codegraph` junto a `valmen`; repetirlo dice «sin cambios».
- Ambiente: CodeGraph ≥ 0.9.9 en el `PATH` solo para la prueba manual.
- Pendiente de la persona: marcar el criterio `R-SKILL-004` (verify: manual) tras la prueba manual.

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
    "at": "2026-10-07T18:03:50.134Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T22:12:31.132Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T22:13:43.259Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:28.120Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La a (aprueba los cuatro planes: contexto de fases, CodeGraph estado, CodeGraph montaje y skills de UX)\",\"planHash\":\"sha256:c43f72fadb7d3ed5019fb1e1e8036b31ff12313502f8aa1765bdd0302c4542d4\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:28.825Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:c43f72fadb7d3ed5019fb1e1e8036b31ff12313502f8aa1765bdd0302c4542d4."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:28.825Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-08T02:05:30.418Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-08T02:16:06.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
