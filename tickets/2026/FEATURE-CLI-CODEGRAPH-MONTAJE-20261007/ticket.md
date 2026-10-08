---
schema_version: 2
id: FEATURE-CLI-CODEGRAPH-MONTAJE-20261007
title: Ofrecer instalar e indexar CodeGraph al montar o adoptar, solo con confirmación
type: FEATURE
module: CLI
workflow_status: approved
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

# FEATURE-CLI-CODEGRAPH-MONTAJE-20261007

## Solicitud original

Parte del sprint: CodeGraph se ofrece al montar o adoptar un proyecto y su estado es visible.
- R-SKILL-004: CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto
Depende de: FEATURE-CLI-CODEGRAPH-ESTADO-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-SKILL-004: lo cubre FEATURE-CLI-CODEGRAPH-ESTADO-20261007 (Mostrar en el diagnóstico si CodeGraph está instalado, indexado y al día, y registrar su MCP en los clientes del proyecto)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la parte de R-SKILL-004 que **ofrece** CodeGraph durante la puesta en marcha y solo actúa con confirmación. «Montar» no es un comando del harness: es la puesta en marcha que documentan `README.md:26-29` y `docs/15-PUESTA-EN-MARCHA.md:58-60` —`valmen adopt && valmen sync && valmen doctor`, luego `valmen mcp --install`—, y su único punto de entrada que perfila el proyecto es `valmen adopt`. Por eso el ofrecimiento vive en `valmen adopt` y en la guía de puesta en marcha que sigue el agente. (1) `valmen adopt` (también con `--dry-run`) agrega una sección «CodeGraph» con el estado que calcula la sonda de FEATURE-CLI-CODEGRAPH-ESTADO-20261007 y la oferta que corresponde, sin ejecutar nada. (2) La confirmación es una bandera explícita, `valmen adopt --codegraph`: indexa el proyecto (`codegraph init <raíz>` si no hay índice, `codegraph sync <raíz>` si está desactualizado). (3) Instalar el binario se ofrece con el comando exacto que el propio paquete documenta (`npm install -g @colbymchenry/codegraph`), y lo ejecuta la persona: el harness no instala software global. (4) La guía `docs/15-PUESTA-EN-MARCHA.md` y su texto para el agente suman el paso «preguntar si quiere CodeGraph».
- Usuario o rol afectado: la persona o el agente que adopta un proyecto con el harness siguiendo la puesta en marcha.
- Comportamiento actual: `valmen adopt` solo nombra «CodeGraph» entre las capacidades si existe la carpeta `.codegraph/` (`packages/adapter/src/adopt.ts:436`, impreso en `packages/cli/src/commands.ts:1144`); no dice si está instalado, no ofrece instalarlo ni indexar, y la guía de puesta en marcha no lo menciona.
- Comportamiento esperado: al adoptar, la salida dice en una sección «CodeGraph» uno de cinco estados —no instalado, instalado sin índice, al día, desactualizado, ilegible— y la oferta exacta: instalar con el comando del paquete y luego `valmen adopt --codegraph`; indexar con `valmen adopt --codegraph`; nada si está al día. Sin `--codegraph` no se lanza ningún proceso que escriba; con `--codegraph` se indexa una sola vez y se informa el resultado; con `--codegraph --dry-run` se dice qué se ejecutaría sin ejecutarlo. Tras indexar, se recuerda `valmen mcp --install` para registrar el servidor MCP (eso lo hace FEATURE-CLI-CODEGRAPH-ESTADO-20261007).

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad nueva, no un defecto. (a) `adoptProject` (`packages/cli/src/commands.ts:1064`) arma su salida con el perfil de `profileProject` (`packages/adapter/src/adopt.ts:418`), cuya única señal de CodeGraph es `existsSync(join(root, ".codegraph"))` (`adopt.ts:436`): no ejecuta el binario, así que no distingue instalado de no instalado ni índice válido de carpeta vacía. (b) `adoptProject` acepta solo `dryRun`, `home` y `machineId` (`commands.ts:1067`) y `main.ts:1440-1447` solo traduce `--dry-run` y `--machine-id`; no hay forma de confirmar una acción sobre CodeGraph. (c) El CLI no tiene ningún diálogo interactivo (no hay `readline` ni `isTTY` en `packages/cli/src`): la confirmación en el harness es siempre una bandera explícita —`mcp` imprime y `mcp --install` escribe (`docs/15-PUESTA-EN-MARCHA.md:208-214`); `adopt --dry-run` simula—. (d) La guía para el agente (`docs/15-PUESTA-EN-MARCHA.md:337-351`) pregunta por proveedor, MCP y Hermes, pero no por CodeGraph. (e) Las banderas booleanas no se registran: `parseArgs` (`packages/cli/src/main.ts:748`) solo exige declarar en `VALUE_OPTIONS` (`main.ts:559`) las que llevan valor, así que `--codegraph` entra sin tocar esa lista; la ayuda sí se actualiza (`main.ts:213`).
- Hipótesis pendientes: ninguna que bloquee. Comprobado en esta máquina (CodeGraph 0.9.9, `codegraph --help`): `init [path]` crea `.codegraph/` y construye el índice (la indexación corre por defecto; `-i` quedó obsoleto), `sync [path]` actualiza desde el último índice y `status --json` es de solo lectura —lo dejó comprobado el ticket ESTADO—. El comando de instalación sale del propio paquete instalado fuera del repositorio (~/.codegraph/versions/v0.9.9/lib): su instalador, en dist/installer/index.js línea 128, ejecuta `npm install -g @colbymchenry/codegraph`, y su binario, en dist/bin/codegraph.js línea 78, lo recomienda para reinstalar. `codegraph init` escribe `.codegraph/.gitignore` que excluye la base y la caché, y este repositorio además ignora `.codegraph/` (`.gitignore:47`). Queda sin medir cuánto tarda `init` en un proyecto grande: el tope de tiempo se fija holgado y su vencimiento se informa como fallo, sin repetir.
- Consumidores afectados: `valmen adopt` con y sin `--dry-run` (`main.ts:1440`); `verifyOnboarding` (`packages/cli/src/onboarding-verify.ts:52`), que adopta una raíz temporal y debe seguir sin indexar nada; las pruebas que llaman `adoptProject` sin opciones —`tests/adopt.test.ts:192-237` y `tests/skills-publicadas.test.ts:71-170`— y que hoy no dependen del binario de la máquina; la guía `docs/15-PUESTA-EN-MARCHA.md`.
- Archivos y flujo investigados: `packages/cli/src/commands.ts:1064-1300` (`adoptProject`: perfil, binding, extracción de reglas, salida y escrituras), `packages/adapter/src/adopt.ts:418-452` (`profileProject`, capacidades), `packages/cli/src/main.ts:213`, `main.ts:559`, `main.ts:748-800`, `main.ts:1440-1447` (ayuda, parseo y despacho de `adopt`), `packages/cli/src/onboarding-verify.ts:39-100`, `docs/15-PUESTA-EN-MARCHA.md`, `README.md:20-30`, la spec `.valmen/features/skills-de-terceros-y-ux/spec/skills/spec.md:40-50`, `tickets.yaml` de la feature (este ticket depende de FEATURE-CLI-CODEGRAPH-ESTADO-20261007) y el plan de ese ticket, que define `readCodegraphStatus` y `probeCodegraph`, que este reutiliza.
- Riesgos y compatibilidad: (1) **Escribir sin confirmación**: `codegraph init` crea `.codegraph/` y una base en el proyecto; solo puede lanzarlo `--codegraph` sin `--dry-run`, y la sonda por defecto se limita a `codegraph status --json`. (2) **Instalar software global**: el harness no ejecuta `npm install -g`; solo imprime el comando —el motor no toca la red y la puesta en marcha deja a la persona instalar lo de su máquina—. (3) **Adopción ya hecha**: `adoptProject` corta antes con «Ya existe una configuración» (`commands.ts:1235-1246`); la sección CodeGraph y `--codegraph` deben funcionar también en ese camino, porque es el caso de un proyecto ya montado al que se le ofrece CodeGraph después. (4) **Pruebas y onboarding**: la sonda y el ejecutor se inyectan como opciones de `adoptProject`; sin inyección se usa la sonda real (solo lectura) y nunca se indexa sin la bandera, así que `verifyOnboarding` y las pruebas existentes no cambian de comportamiento. (5) **Fallo de CodeGraph**: un `init` que falla o vence el tope no deshace ni bloquea la adopción; se informa con su código y la salida de `adopt` sigue siendo 0, igual que el doctor trata CodeGraph como opcional. (6) Dependencia: requiere `probeCodegraph`/`readCodegraphStatus` del ticket ESTADO; si ese ticket no está implementado, este no puede empezar.
- Impactos de sync, migración, Docker o despliegue: ninguno — cambia el CLI local y la guía de puesta en marcha; no toca sincronización, migraciones, contenedores ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance y exclusiones: ofrecer CodeGraph en `valmen adopt` y en la guía de puesta en marcha, e indexar solo con `--codegraph`. Fuera: instalar el binario (el harness imprime el comando y lo corre la persona), registrar el MCP y la línea del doctor (FEATURE-CLI-CODEGRAPH-ESTADO-20261007), `codegraph uninit`, clientes MCP que el harness no escribe y cualquier diálogo interactivo.
- Dependencias: FEATURE-CLI-CODEGRAPH-ESTADO-20261007 implementado (`readCodegraphStatus` en `packages/adapter/src/codegraph.ts` y `probeCodegraph` en `packages/cli/src/codegraph.ts`). Si cambia su forma al implementarse, este plan se ajusta antes de empezar.
- Pasos ordenados:
  1. `packages/cli/src/codegraph.ts` (el del ticket ESTADO): sumar `runCodegraphIndex(root, estado)`, que elige `["init", root]` si el estado es `sin-indice` o `["sync", root]` si es `desactualizado`, lo lanza con `spawnSync("codegraph", args, { cwd: root, timeout: 600_000 })` —mismo patrón que `probeCodegraph`— y devuelve `{ comando, exitCode, error }`; en `al-dia`, `no-instalado` o `ilegible` no lanza nada. (C5, C6, C7, C8, C9)
  2. `packages/cli/src/commands.ts`, `adoptProject` (`commands.ts:1064`): opciones nuevas `codegraph?: boolean` (la confirmación), `probeCodegraph?: () => CodegraphState` y `runCodegraph?: (root, estado) => …` (inyectables; por defecto las reales). Una función `codegraphOfferLines(estado, { confirmado, dryRun, resultado })` arma la sección «CodeGraph» con el estado y la oferta: no instalado → `npm install -g @colbymchenry/codegraph` y luego `valmen adopt --codegraph`; sin índice o desactualizado → `valmen adopt --codegraph`; al día → nada que hacer; ilegible → `codegraph status` para revisarlo a mano. Tras indexar con éxito, recuerda `valmen mcp --install`. (C1, C2, C3, C4, C10)
  3. Misma función, en los dos caminos de salida: la sección se agrega antes del corte de «ya adoptado» (`commands.ts:1235`) para que un proyecto ya montado también reciba la oferta y pueda confirmarla, y antes de la simulación (`commands.ts:1249`). La indexación corre solo si `codegraph === true && dryRun === false`; con `--dry-run` se imprime «se ejecutaría: codegraph init <raíz>». Un fallo o vencimiento de `codegraph` se informa con su código y no cambia el código de salida 0 de `adopt` ni deshace lo escrito. (C5, C6, C7, C8, C9, C11)
  4. `packages/cli/src/main.ts`: en el despacho de `adopt` (`main.ts:1440-1447`) pasar `codegraph: options.flags["codegraph"] === true`; en la ayuda (`main.ts:213`) `adopt [--dry-run] [--machine-id <id>] [--codegraph]` con una línea que diga que indexa con CodeGraph y que sin la bandera solo se ofrece. `--codegraph` es booleana: no va en `VALUE_OPTIONS`. (C12)
  5. `docs/15-PUESTA-EN-MARCHA.md`: una sección corta «CodeGraph (opcional)» con los tres pasos (instalar con el comando del paquete, `valmen adopt --codegraph`, `valmen mcp --install`) y, en el texto para el agente (`docs/15-PUESTA-EN-MARCHA.md:337-351`), un paso «Preguntame si querés CodeGraph; sólo si lo autorizás, corré `valmen adopt --codegraph`; no instales nada global sin que te lo diga». `README.md:26-29` no cambia. (C13)
  6. `tests/codegraph-montaje.test.ts` (nuevo): `adoptProject` en una raíz temporal con sonda y ejecutor inyectados (no depende del binario de la máquina) para los cinco estados, sin bandera, con `--codegraph`, con `--codegraph --dry-run`, en un proyecto ya adoptado y con un ejecutor que falla; aserciones sobre la salida, el código de salida, las llamadas registradas al ejecutor y que sin confirmación no aparece `.codegraph/`. `tests/adopt.test.ts` y `tests/skills-publicadas.test.ts` quedan sin cambios y deben seguir pasando. (C1–C11, C14)
  7. Verificación: `npx vitest run tests/codegraph-montaje.test.ts tests/adopt.test.ts tests/skills-publicadas.test.ts`, `npx tsc -b`, la suite completa `npx vitest run` y `valmen onboarding verify` (sigue verde y sin indexar). Manual: en `mktemp -d` con un `package.json`, `valmen adopt --root <dir>` ofrece indexar y no crea `.codegraph/`; `valmen adopt --root <dir> --codegraph` lo crea; repetirlo dice «al día» y no relanza `init`. (C14, C15)
- Impactos declarados: ninguno — no hay sincronización, migración ni contenedores; el cambio es del CLI local y de la guía.
- Pruebas: directorio `/Users/juanandrade/Desktop/ValmenHarness`; `npx vitest run tests/codegraph-montaje.test.ts` (todo verde), `npx vitest run` (sin regresiones), `npx tsc -b` (sin errores), `valmen onboarding verify` (salida 0). Manual descrita en el paso 7. Requisito de ambiente: CodeGraph ≥ 0.9.9 en el `PATH` solo para la prueba manual; las automáticas no lo necesitan.
- Rollback (obligatorio): revertir el commit del ticket; no hay datos ni esquemas que deshacer. Un índice que `valmen adopt --codegraph` ya haya creado se quita con `codegraph uninit <raíz>` o borrando `.codegraph/`, que no se versiona.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] R-SKILL-004: CodeGraph DEBERÍA ofrecerse al montar o adoptar un proyecto (solo la parte de «Ofrecer instalar e indexar CodeGraph al montar o adoptar, solo con confirmación»; el resto lo cubre FEATURE-CLI-CODEGRAPH-ESTADO-20261007)
      <!-- verify: manual -->
- [ ] C1. Sin el binario `codegraph`, `valmen adopt` muestra la sección «CodeGraph» como no instalado.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C2. Sin el binario `codegraph`, la sección ofrece `npm install -g @colbymchenry/codegraph` seguido de `valmen adopt --codegraph`.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C3. Con CodeGraph instalado y sin índice, `valmen adopt` sin `--codegraph` ofrece `valmen adopt --codegraph` para indexar.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C4. Con el índice al día, la sección dice que no hay nada que hacer.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C5. Sin `--codegraph`, `valmen adopt` no lanza ningún comando de CodeGraph distinto de `status`.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C6. Con `--codegraph` y sin índice, `valmen adopt` lanza `codegraph init` sobre la raíz una sola vez.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C7. Con `--codegraph` y el índice desactualizado, `valmen adopt` lanza `codegraph sync` sobre la raíz.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C8. Con `--codegraph --dry-run`, `valmen adopt` dice qué comando ejecutaría y no lo lanza.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C9. Con `--codegraph` y CodeGraph no instalado o ilegible, `valmen adopt` no lanza ningún comando de indexación.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C10. En un proyecto ya adoptado, `valmen adopt --codegraph` indexa sin sobrescribir `.valmen/config.yaml`.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C11. Un `codegraph init` que falla se informa con su código y `valmen adopt` sigue saliendo con 0.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C12. `valmen --help` lista `--codegraph` en la línea de `adopt`.
      <!-- test: npx vitest run tests/codegraph-montaje.test.ts -->
- [ ] C13. El texto para el agente de `docs/15-PUESTA-EN-MARCHA.md` pide preguntar a la persona antes de correr `valmen adopt --codegraph`.
      <!-- verify: manual -->
- [ ] C14. Las pruebas existentes de adopción y de skills publicadas siguen pasando sin cambios.
      <!-- test: npx vitest run tests/adopt.test.ts tests/skills-publicadas.test.ts -->
- [ ] C15. En una carpeta temporal real, `valmen adopt --codegraph` crea `.codegraph/` y una segunda corrida informa el índice al día.
      <!-- verify: manual -->

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
    "at": "2026-10-07T18:03:50.282Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T22:32:04.950Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T22:33:46.540Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:29.730Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La a (aprueba los cuatro planes: contexto de fases, CodeGraph estado, CodeGraph montaje y skills de UX)\",\"planHash\":\"sha256:fbcab5202be6167082de969a628772d630b5647c1c194e129efaf9e4965e1a04\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:30.429Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:fbcab5202be6167082de969a628772d630b5647c1c194e129efaf9e4965e1a04."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-08T01:02:30.429Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
