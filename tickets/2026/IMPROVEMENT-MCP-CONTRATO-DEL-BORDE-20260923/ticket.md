---
schema_version: 2
id: IMPROVEMENT-MCP-CONTRATO-DEL-BORDE-20260923
title: El contrato del borde del MCP, lo que declara y lo que devuelve
type: IMPROVEMENT
module: MCP
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-23
updated: 2026-09-23
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-MCP-CONTRATO-DEL-BORDE-20260923

## Solicitud original

vamos a realizar la implementación con el orden que me indicaste, lo único es que no quiero aún incluir nada de Hermes, vamos con todo menos con eso por ahora

Este ticket es el **paso 1** de ese orden —el「Bloque 0», las correcciones del borde— y se
justifica solo: la puerta por la que entra todo lo demás está mal declarada, y ensancharla
antes de arreglarla deja el defecto dentro. Los pasos siguientes (exponer el ciclo de
anotado, las skills como *prompts*, features y procesos, y la memoria) van en tickets
propios, en ese orden.

## Descripción funcional

- Alcance: el **contrato que ve un cliente MCP** —los esquemas de entrada de las ocho
  herramientas, lo que devuelven y lo que anuncia la autocomprobación—. No cambia ninguna
  función del motor ni el registro: `@valmen/engine` y `@valmen/cli` se siguen llamando
  exactamente igual.
- Usuario o rol afectado: el agente (opencode, codex, Claude Code) que llama a las
  herramientas, y quien tiene que diagnosticar un servidor que «no aparece».
- Comportamiento actual: las ocho herramientas declaran `additionalProperties: false` y
  **ninguna declara `root`**, aunque `main.ts` lo lee y `docs/02-MOTOR.md` §10 lo promete.
  Todas devuelven únicamente texto. `valmen-mcp --check` dice cuántas herramientas hay y sus
  títulos, pero no qué necesita cada una.
- Comportamiento esperado: `root` declarado y **opcional** en las ocho; las herramientas
  cuya fuente ya es un dato canónico devuelven además `structuredContent` con su
  `outputSchema`, con el criterio de cuándo lo hacen escrito y aplicado por el código;
  `--check` dice de cada herramienta qué argumentos exige.

## Diagnóstico

- **El síntoma, reproducido.** El servidor promete dos cosas que no cumple. La primera:
  `docs/02-MOTOR.md` §10 dice que cada herramienta acepta un `root` en sus argumentos, y
  `main.ts` lo lee de verdad, pero **ningún esquema lo declara**. Como los ocho llevan
  `additionalProperties: false`, un cliente que valide el esquema rechaza el argumento antes
  de llamar, y desde dentro del agente eso se ve como «no puedo apuntar a otro proyecto».
  No hace falta creerlo: se comprueba sobre el catálogo **compilado**, y da 8 de 8 —
  `node --input-type=module -e 'import { TOOLS } from "./packages/mcp/dist/tools.js" …'`
  imprime `declara root=false  additionalProperties=false` para las ocho herramientas. La
  segunda: el test que debía impedirlo se llama «declara `root` opcional en todas» y pasa en
  verde sin llegar a comprobar `root` — un test que afirma más de lo que hace es peor que no
  tenerlo, porque da por cubierto justo lo que no lo está. Lo que **no** hay es un cliente
  concreto que lo haya rechazado en producción, y eso se dice en vez de exagerarlo: el
  defecto está reproducido, pero su alcance hoy es el de una promesa incumplida.
- Archivos y flujo investigados: `packages/mcp/src/tools.ts` (catálogo `TOOLS` y
  `callTool`), `packages/mcp/src/protocol.ts` (`ToolDefinition`, `ToolResult`,
  `initialize`, `tools/call`), `packages/mcp/src/main.ts` (`contextoConRoot`, `describe`),
  `tests/mcp-server.test.ts` (línea 150), `docs/02-MOTOR.md` §10,
  `packages/engine/src/receipts.ts` (el recibo como artefacto canónico) y
  `packages/server/src/tickets.ts` (`TicketRow`, `filterTickets`, para saber qué forma
  tendría un resultado estructurado y de dónde saldría).
- Causa raíz o hipótesis: el catálogo se escribió antes de que existiera `contextoConRoot`.
  El `root` se resolvió en el arranque —que es el sitio correcto, porque la raíz es del
  proceso y no de la llamada— y nadie volvió a los esquemas. El test que debía impedirlo se
  llama «declara `root` opcional en todas» pero su cuerpo solo comprueba
  `additionalProperties`: **el nombre afirmaba más de lo que el test hacía**, y por eso pasó
  en verde durante toda la construcción del servidor. Con `structuredContent` pasó lo
  simétrico: el protocolo se escribió con las tres llamadas mínimas y no con las
  capacidades de la versión `2025-06-18` que ya se anuncia en `initialize`.
- Riesgos y compatibilidad, uno por uno:
  1. **`structuredContent` no es gratis.** Las herramientas llaman a `@valmen/cli` a
     propósito —regla 1 del archivo: no hay una segunda implementación de nada— y devuelven
     su texto; construir un JSON paralelo sería una segunda representación que puede
     desincronizarse de ese texto. *Mitigación:* es de criterio, no de código. Solo se
     declara `outputSchema` donde la fuente **ya es un dato canónico en disco** —el recibo
     que el motor acaba de escribir en `.valmen/receipts/`, el frontmatter del ticket— y
     nunca donde habría que inventar una proyección del texto.
  2. **`root` en el esquema.** Declararlo mal —dentro de `required`— convertiría un argumento
     opcional en obligatorio y rompería a todos los clientes actuales. *Mitigación:* se
     declara fuera de `required`, y un criterio de aceptación lo comprueba.
  3. **Clientes que no conocen `outputSchema`.** *Mitigación:* el campo es aditivo y el
     bloque `content` con el texto se conserva siempre; los tests que hoy comparan
     `resultado.text` siguen pasando sin cambios.
  4. **El contrato es de todos los agentes.** Un cambio aquí lo notan opencode, codex y
     Claude Code a la vez. *Mitigación:* nada de este ticket cambia el comportamiento de una
     herramienta —solo lo que declara y lo que acompaña al texto— y el rollback es revertir
     el commit.
- Impactos de sync, migración, Docker o despliegue: **ninguno, y cada uno por su motivo**.
  No se toca `valmen sync` (no se añade ninguna fuente a la proyección, así que `AGENTS.md`
  se regenera idéntico: `sync_impact: false`). No se toca el esquema del registro ni se
  escribe en ningún ticket existente, así que no hay migración que correr
  (`migration_impact: false`). No se toca ningún contenedor ni el arranque del servidor
  (`docker_impact: false`). No hay despliegue ni release asociada: el paquete no se publica
  en este ticket.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO (gate de plan)** el
  2026-09-23, con estas palabras: «1. si apruebo el plan». El veredicto `REVIEW` de la
  compuerta de análisis queda asumido por la persona que aprueba, que es lo que `REVIEW`
  significa: la compuerta no cambia estados y la decisión es suya. Las tres evaluaciones y
  sus recibos quedan en `.valmen/receipts/` como la evidencia de por qué se aprobó a mano.
- Pasos ordenados:
  1. `packages/mcp/src/tools.ts`: declarar `root` (opcional, fuera de `required`) en los
     ocho `inputSchema`, con **un solo texto de descripción compartido** en vez de repetirlo
     ocho veces, para que no se desincronicen entre sí.
  2. `packages/mcp/src/protocol.ts`: extender `ToolDefinition` con `outputSchema?` y
     `ToolResult` con `data?`, y emitir `structuredContent` en `tools/call` **solo** cuando
     hay `data`, conservando el bloque `content` con el texto. `capabilities.tools` no
     cambia: el catálogo sigue siendo fijo.
  3. `packages/mcp/src/tools.ts`: aplicar el criterio en las dos herramientas donde la
     fuente ya es un dato —`evaluar_compuerta` (el recibo recién escrito) y `ver_ticket`
     (el frontmatter)— y dejar las demás devolviendo texto, con el porqué escrito en el
     archivo para que la próxima herramienta no lo decida por costumbre.
  4. `packages/mcp/src/main.ts`: `describe()` lista cada herramienta con sus argumentos
     obligatorios, para que el primer fallo —«la herramienta no existe»— se diagnostique sin
     adivinar.
  5. `tests/mcp-server.test.ts`: el test de la línea 150 pasa a comprobar
     `properties.root` de verdad; tests nuevos para `structuredContent` presente y ausente,
     para que `root` no sea obligatorio, y para la salida de `--check`.
  6. `docs/02-MOTOR.md` §10 y `packages/mcp/README.md`: escribir el criterio de cuándo hay
     `outputSchema`, que es lo que impide que el punto 3 se convierta en excepción.

**Ampliación de alcance, autorizada por el PO el 2026-09-23** con estas palabras: «en la
migración no podemos arreglarlo aqui mismo para no abrir tickets adicionales». El
procedimiento pide que ampliar el alcance sea un consentimiento explícito de una persona y no
una decisión del modelo; queda registrado aquí con su frase, y no se abre un ticket aparte
porque el defecto se descubrió trabajando este.

  7. `packages/adapter/src/routing.ts`: extraer el análisis del archivo a una función con dos
     modos, de modo que `parseRouting` **siga rechazando** un rol retirado —el rechazo es
     deliberado y está afirmado por un test— y exista además una lectura tolerante que los
     devuelva aparte en vez de fallar. Sin esto no hay forma de leer el archivo para
     arreglarlo: el error que se quiere corregir es el que impide leerlo.
  8. `packages/cli/src/commands.ts`: `valmen migrate` limpia también `.valmen/routing.yaml`.
     El registro de tickets tiene migración desde el principio; el archivo de configuración no
     tenía ninguna, y su vocabulario se encogió una vez —de trece roles a tres— sin que nada
     reescribiera los archivos ya escritos. Se reescribe con `renderRouting`, que es el
     escritor canónico, así que el archivo queda en la forma que produce el propio harness.
  9. Tests de la migración: un archivo con un rol retirado se limpia y conserva el preset y
     los roles vigentes; `--dry-run` no escribe nada; un archivo sano no se toca.
  10. `docs/02-MOTOR.md` §9: la línea de `migrate` dice que también alcanza el routing.

- Rollback: revertir el commit. Los puntos 1 a 6 no cambian el comportamiento de ninguna
  herramienta, solo lo que declara y lo que acompaña al texto. Los puntos 7 a 10 reescriben un
  archivo de configuración, y solo cuando tiene claves que ya no existen: el estado anterior
  está en el control de versiones y `--dry-run` lo muestra antes de tocar nada.

## Criterios de aceptación

- [ ] Los ocho esquemas declaran `root`, y un test lo comprueba leyendo `properties.root` de cada uno.
- [ ] `root` no aparece en el `required` de ninguna herramienta.
- [ ] `evaluar_compuerta` y `ver_ticket` devuelven `structuredContent` que valida contra su `outputSchema`, y su bloque de texto sigue siendo el mismo de antes.
- [ ] Una herramienta sin `outputSchema` no devuelve `structuredContent`.
- [ ] `valmen-mcp --check` nombra, por herramienta, los argumentos obligatorios.
- [ ] El criterio de cuándo hay `outputSchema` está escrito en `docs/02-MOTOR.md` §10 y en `packages/mcp/README.md`.
- [ ] `valmen migrate` limpia de `.valmen/routing.yaml` los roles que ya no existen, y un test lo comprueba con un archivo que los tiene.
- [ ] `valmen migrate --dry-run` anuncia la limpieza del routing sin escribir el archivo, y un archivo sin roles retirados no se toca.
- [ ] `parseRouting` sigue rechazando un rol retirado: la lectura tolerante es para migrar, no para dejar de avisar.

## Puntos

```json
[]
```

## Implementación

Hecha. Sin commit: el protocolo pide la confirmación de las pruebas antes de commitear.

- `packages/mcp/src/tools.ts`: los ocho esquemas se arman con `conRoot()`, que inyecta `root`
  y `additionalProperties: false` desde un solo sitio. Se declara `outputSchema` en
  `ver_ticket` y `evaluar_compuerta`, y esas dos devuelven `data` leído de su fuente
  canónica —`parseTicket` para el frontmatter, `readReceipts` para el recibo—, nunca de una
  proyección nueva. `bien()` acepta el dato como segundo argumento.
- `packages/mcp/src/protocol.ts`: `ToolDefinition` gana `outputSchema?` y `ToolResult` gana
  `data?`. La respuesta de `tools/call` se extrajo a `respuestaDeHerramienta()`, que emite
  `structuredContent` **solo** cuando hay dato; antes esa lógica vivía dentro del manejador y
  no se podía probar sin afirmar sobre `stdout`.
- `packages/mcp/src/main.ts`: `describe()` lista cada herramienta con sus argumentos
  obligatorios.
- `tests/mcp-server.test.ts`: el test de la línea 150 pasa a comprobar `properties.root` de
  verdad —antes miraba `additionalProperties` y pasaba en verde con el argumento sin
  declarar—, y se suman seis: `root` opcional, la lista exacta de las que tienen
  `outputSchema`, los esquemas de salida cerrados, el frontmatter como dato, el recibo como
  dato, la ausencia de dato donde no hay esquema, y la emisión de `structuredContent`.
- `docs/02-MOTOR.md` §10 y `packages/mcp/README.md`: el criterio de cuándo hay `outputSchema`
  y la salida real de `--check`.

**Segunda parte, la migración del routing** (commit `2e35eec` la primera; esta va aparte):

- `packages/adapter/src/routing.ts`: el análisis del archivo se extrajo a `analizarRouting`,
  con dos modos. `parseRouting` **sigue rechazando** un rol retirado —el rechazo es deliberado
  y está afirmado por un test— y `parseRoutingTolerante` devuelve los retirados aparte. Existe
  porque **el error que se quiere corregir es el que impide leer el archivo**: una migración no
  podría ni abrirlo con la estricta. Un preset inexistente no se tolera en ninguno de los dos
  modos: sin preset no hay de dónde resolver los roles, y adivinar uno sería peor que decirlo.
- `packages/cli/src/commands.ts`: `migrateRouting()` corre dentro de `valmen migrate`. Reescribe
  con `renderRouting`, el escritor canónico, y **no toca un archivo sano**, porque reescribirlo
  perdería los comentarios de quien lo editó a mano sin ganar nada. Respeta `--dry-run`.
- `tests/migrate.test.ts`: cuatro pruebas —limpia y conserva el preset y los roles vigentes,
  `--dry-run` no escribe, un archivo sano no se toca, un proyecto sin routing no se inventa
  uno—. `tests/routing.test.ts`: dos más, que las dos lecturas conviven y que la tolerante
  tampoco se traga un preset inexistente.
- `packages/cli/src/main.ts` y `docs/02-MOTOR.md` §9: la ayuda del comando dice que `migrate`
  alcanza también el routing.

## Pruebas

- Resultado del PO: **pasaron**, comunicado el 2026-09-23 con estas palabras —«ya las pruebas
  pasaron»—, sobre el contrato de abajo. El contrato se amplió después con la migración del
  routing, autorizada en el mismo mensaje.

Contrato para el responsable. Directorio de ejecución: la raíz del repositorio,
`/Users/juanandrade/Desktop/ValmenHarness`. Requisitos de ambiente: Node 22 o superior y las
dependencias ya instaladas (`node_modules` presente). No hace falta ninguna credencial para
los tres primeros comandos.

```bash
# 1. Compila. Esperado: sin salida de error, código 0.
npm run build

# 2. La suite completa. Esperado: 37 archivos pasan, 1 saltado;
#    878 tests pasan, 48 saltados (los de equivalencia, desactivados por defecto).
npx vitest run

# 3. La suite del contrato del borde. Esperado: 33 tests, 0 fallos.
npx vitest run tests/mcp-server.test.ts

# 4. La comprobación que originó el ticket, sobre el catálogo compilado.
node --input-type=module -e 'import { TOOLS } from "./packages/mcp/dist/tools.js";
for (const t of TOOLS) { const p = t.inputSchema.properties ?? {};
console.log(t.name, "root=" + Object.prototype.hasOwnProperty.call(p, "root"),
"opcional=" + !(t.inputSchema.required ?? []).includes("root")); }'
# Esperado: las ocho líneas con root=true opcional=true.

# 5. La autocomprobación del servidor.
valmen-mcp --check
```

Validación manual del punto 5: la salida tiene que listar las ocho con sus argumentos
obligatorios —`crear_ticket(id, title, type, module, request)`, `ver_ticket(id)`,
`listar_tickets()`, `validar_ticket()`, `evaluar_compuerta(gate, id)`, `mover_ticket(id, to)`,
`reanudar_ticket()`, `simular_compuerta(gate)`— y no solo el título como antes.

Validación manual opcional, si se quiere ver el dato estructurado de punta a punta: abrir una
sesión de opencode en el repositorio y pedirle que muestre un ticket; el cliente recibirá
además el `structuredContent`. No es necesaria para dar por buena la entrega, porque el punto
4 y los tests ya lo comprueban sobre el catálogo real.

### La migración del routing

```bash
# 6. Las suites de la migración. Esperado: 49 tests entre las dos, 0 fallos.
npx vitest run tests/migrate.test.ts tests/routing.test.ts

# 7. La migración sobre un proyecto de verdad, con un rol retirado dentro.
LAB=$(mktemp -d); mkdir -p "$LAB/.valmen"
printf 'preset: quality\n\nroles:\n  explorer:\n    model: glm-5.3\n    effort: low\n' \
  > "$LAB/.valmen/routing.yaml"

valmen migrate --root "$LAB" --dry-run     # anuncia, y NO escribe
grep -c explorer "$LAB/.valmen/routing.yaml"   # esperado: 1 — sigue ahí

valmen migrate --root "$LAB"               # ahora sí
cat "$LAB/.valmen/routing.yaml"            # sin explorer, con preset: quality
rm -rf "$LAB"
```

Lo que hay que mirar en el punto 7: que `--dry-run` **no** toque el archivo, que la ejecución
real lo deje sin `explorer` y **con** `preset: quality` —una migración que arregla una clave
borrando la configuración de al lado es peor que el defecto— y que el archivo quede en la
forma que produce `renderRouting`.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-23",
    "build_reference": "commit:2e35eec78685ad4f695dce06c7abb0f5eaebed12",
    "environment": "local, macOS, Node 22+, sin despliegue — revisión del commit del contrato del borde",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-23",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-003",
    "date": "2026-09-24",
    "build_reference": "commit:eeab5d62edc9e22ecae5b36b4c673206110770ea",
    "environment": "local, macOS, Node 24 — sesión de opencode contra el servidor MCP del repositorio",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-24",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "yo lo que probé funcionó correcto"
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-24",
    "technical_summary": "El servidor MCP declara lo que promete: root opcional en los treinta y dos esquemas —antes ninguno lo declaraba y additionalProperties:false hacía que un cliente que validara rechazara el argumento—, structuredContent con outputSchema en las herramientas cuyo dato ya es canónico, y una autocomprobación (valmen-mcp --check) que dice por herramienta qué argumentos exige. Además, valmen migrate limpia de .valmen/routing.yaml los roles retirados, que antes detenían todas las compuertas.",
    "functional_summary": "Un agente puede apuntar el harness a otro proyecto sin que su cliente rechace la llamada, recibe el dato estructurado cuando existe en vez de solo texto, y quien diagnostica un servidor que no aparece tiene en --check la lista de argumentos obligatorios. Y una clave retirada del routing deja de romper el trabajo: migrate la limpia sin borrar la configuración de al lado.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
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
    "date": "2026-09-23",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-23",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-23",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-23",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-23",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-23",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
