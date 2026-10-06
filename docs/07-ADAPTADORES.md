# 07 — Adaptadores: proyección a cada agente

## 1. El principio

> Un solo `.valmen/` genera la configuración de todos los agentes, y **nada se escribe a
> mano dos veces**.

Esto es exactamente el dolor que originó el proyecto. Hoy en SaiOpenCloud el agente
`planner` existe en dos archivos con el mismo contenido en dos formatos:

```toml
# .codex/agents/planner.toml
name = "planner"
description = "Diseña el plan proporcional y sus gates, sin implementar ni editar el ticket."
sandbox_mode = "read-only"
developer_instructions = """
Lee AGENTS.md, docs/agentic/PHASE-MAP.md …
"""
```

```markdown
<!-- .opencode/agents/planner.md -->
---
description: Diseña el plan proporcional y sus gates, sin implementar ni editar el ticket.
mode: subagent
permission:
  edit: deny
---

Lee AGENTS.md, docs/agentic/PHASE-MAP.md …
```

El texto es idéntico (salvo una frase final que **ya divergió**: `"El sandbox no sustituye
ownership"` vs `"Los permisos de la herramienta no sustituyen ownership"`). Multiplicado por
12 agentes × 2 formatos, más skills, más hooks. Cada edición es un riesgo de divergencia.

## 2. La cadena de generación

```
.valmen/
├── config.yaml                 ─┐
├── rules/*.md                   │
├── skills/*/SKILL.md            │   FUENTE ÚNICA
├── agents/*.md                  │   (lo que se escribe a mano)
├── gates/*.yaml                 │
├── processes/*.yaml            ─┘
│
│   valmen sync
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Modelo intermedio neutral                                             │
│  ─────────────────────────                                             │
│  { agent: { id, description, permissions, model, instructions },       │
│    skills: [...], rules: [...], commands: [...], mcp: [...] }          │
└────────────────────────────────────────────────────────────────────────┘
│
├──▶ AGENTS.md            (común y canónico — lo leen casi todos)
├──▶ CLAUDE.md            (solo si hay Claude Code)
├──▶ .claude/             agents/*.md · skills/ · commands/ · settings.json · hooks
├──▶ .codex/              agents/*.toml · config.toml · hooks.json
├──▶ .opencode/           agents/*.md · opencode.json · plugins/
├──▶ .cursor/rules/       *.mdc
├──▶ .github/copilot-instructions.md
├──▶ .gemini/  .qwen/  .windsurf/  .kilo/   (por adaptador)
└──▶ .valmen/state/projection.json        (qué se generó y con qué hash)
```

## 3. Contrato de un adaptador

```ts
interface AgentAdapter {
  id: string;                          // 'codex' | 'claude' | 'opencode' | …
  displayName: string;

  detect(cwd: string): Promise<DetectionResult>;
  // ¿está el agente instalado? ¿hay config previa? ¿qué versión?

  targetFiles(): string[];             // qué archivos gestiona (para el diff y el .gitignore)
  render(model: NeutralModel, opts): Promise<RenderedFile[]>;
  validate?(files: RenderedFile[]): ValidationIssue[];

  capabilities: {
    subagents: boolean;
    skills: boolean;
    hooks: boolean;
    mcp: boolean;
    permissions: boolean;
    modelSelection: boolean;
    slashCommands: boolean;
  };
}
```

Regla dura: **un adaptador nunca escribe fuera de `targetFiles()`**, y todo archivo que
escribe lleva la cabecera de generado. `valmen sync --diff` muestra exactamente qué cambiaría;
`valmen sync --check` (usado en CI) falla si los archivos generados no corresponden a la
fuente. Eso detecta cuando alguien editó un archivo generado a mano.

## 4. Estado de los adaptadores

| Adaptador | Prioridad | Subagentes | Skills | Hooks | MCP | Estado objetivo |
|---|---|---|---|---|---|---|
| **codex** | MVP | Sí (TOML) | Sí | Sí | Sí | Completo |
| **claude** | MVP | Sí (MD) | Sí | Sí | Sí | Completo |
| **opencode** | MVP | Sí (MD) | Sí | Plugin TS | Sí | Completo |
| **generic** | MVP | — | Sí | — | — | `AGENTS.md` + skills (cubre 16 agentes) |
| **cursor** | Fase 3 | Auto-delegación | Reglas `.mdc` | — | Sí | Reglas + MCP |
| **copilot** | Fase 4 | — | Instrucciones | — | Sí | Un archivo |
| **gemini** | Fase 4 | Sí | Sí | — | Sí | Config YAML |
| **qwen** | Fase 4 | Sí | Sí | — | Sí | Comparte el de gemini |
| **windsurf** | Fase 5 | — | Workflows | — | Sí | Workflows |
| **hermes** | Fase 5 | Delegación efímera | — | — | Sí | Orquestador + MCP |

**La jugada inteligente es el adaptador `generic`.** 16 agentes leen `AGENTS.md` y skills en
formato estándar. Con un solo adaptador genérico bien hecho, el producto funciona en agentes
que ni conocíamos, sin escribir código específico. Los adaptadores específicos se escriben
solo cuando aportan algo que el genérico no puede dar (subagentes con permisos, hooks).

## 5. Ejemplo: la misma definición, dos proyecciones

**Fuente única:**

```markdown
<!-- .valmen/agents/planner.md -->
---
id: planner
description: Diseña el plan proporcional y sus gates, sin implementar ni editar el ticket.
role: architect
permissions:
  write: false
  bash: read-only
  network: false
tools: [read, grep, glob, codegraph_impact, ticket_show]
escalates_to: orchestrator
---

Lee las reglas del proyecto, el ticket canónico y las skills aplicables antes de
proponer nada. Comprueba ID, POINT-NNN, intención, alcance, plan/gate, archivos
asignados y salida.

Toda implementación necesita plan proporcional. Un FEATURE, SYNC, INTEGRATION,
AGENT o SECURITY, y todo impacto de sync, migración, Docker o despliegue,
requiere aprobación explícita antes de escribir. Si surge uno fuera del plan,
detener y escalar.

No cambiar estados ni historial del ticket: entregar evidencia al coordinador
para que la registre por el CLI. No crear commits, push, tags, PRs ni despliegues.
```

**Proyección a Codex:**

```toml
# .codex/agents/planner.toml  — GENERADO POR valmen · NO EDITAR
# fuente: .valmen/agents/planner.md (sha256:a3f1c9d…)
# regenerar: valmen sync

name = "planner"
description = "Diseña el plan proporcional y sus gates, sin implementar ni editar el ticket."
sandbox_mode = "read-only"
model = "gpt-5.6-sol"
model_reasoning_effort = "high"

developer_instructions = """
Lee las reglas del proyecto, el ticket canónico y las skills aplicables antes de
proponer nada. …
"""
```

**Proyección a opencode:**

```markdown
<!-- .opencode/agents/planner.md — GENERADO POR valmen · NO EDITAR -->
<!-- fuente: .valmen/agents/planner.md (sha256:a3f1c9d…) -->
---
description: Diseña el plan proporcional y sus gates, sin implementar ni editar el ticket.
mode: subagent
model: openrouter/anthropic/claude-opus-4.6
permission:
  edit: deny
  bash:
    "*": ask
    "git status*": allow
    "git log*": allow
    "grep*": allow
tools:
  codegraph_impact: true
---

Lee las reglas del proyecto, el ticket canónico y las skills aplicables antes de
proponer nada. …
```

Nótese que **el modelo viene del routing**, no del archivo del agente. El mismo agente usa
`gpt-5.6-sol` en Codex, `claude-opus-4.6` en opencode, y el que corresponda en Claude, todo
desde un solo `routing.yaml`. Cambiar el preset cambia las tres proyecciones.

## 6. Generación de `AGENTS.md`

Es el archivo más importante, porque lo leen los agentes con y sin adaptador específico. Se
compone en secciones con presupuesto de bytes (los agentes truncan archivos largos; hay que
caber).

```markdown
<!-- GENERADO POR valmen v0.4.2 · NO EDITAR A MANO -->
<!-- fuente: .valmen/config.yaml + .valmen/rules/*.md + .valmen/agents/*.md -->
<!-- regenerar: valmen sync   ·   verificar: valmen sync --check -->

# SaiOpenCloud — instrucciones activas

## Cómo se responde
Este contrato prevalece sobre cualquier modo de respuesta heredado ...
- La respuesta va en la primera línea; el contexto, después y solo si hace falta.
...

> Este archivo es generado. Las reglas de negocio viven en `.valmen/rules/`.
> Los cambios se hacen ahí y se propagan con `valmen sync`.

## Fuente de verdad
- `.valmen/` es la configuración canónica del harness.
- `tickets/2026/<ID>/ticket.md` es el registro canónico de trabajo.
- `.valmen/rules/` contiene las reglas de este proyecto.
- `CLAUDE.md`, `AGENTS.md`, `.codex/`, `.claude/`, `.opencode/` son **generados**.

## Flujo de trabajo
<!-- incluido desde .valmen/rules/flujo.md -->
...

## Stack técnico vigente
<!-- incluido desde .valmen/rules/stack.md -->
- Backend: Django 5.2.1, DRF 3.17.1, django-tenants 3.10.1
- Base de datos: PostgreSQL 16
- Frontend: Angular 14.3, Angular Material 14.2, TypeScript 4.6
...

## Invariantes del proyecto
<!-- incluido desde .valmen/rules/invariantes.md -->
...

## Gates
<!-- generado desde .valmen/gates/*.yaml — resumen, no la definición -->
| Transición | Gate | Modo | Qué valida |
...

## Permisos y acciones prohibidas
...
```

### 6.1 Cómo se responde

**Implementado.** `valmen sync` escribe, justo después del título y **antes de las reglas del
proyecto**, la sección «Cómo se responde»: el contrato de respuesta y la declaración de que
prevalece sobre cualquier modo de respuesta heredado (un estilo de salida del cliente, el
`CLAUDE.md` de un directorio superior). Es lo que lee todo cliente que lea `AGENTS.md`, y por eso
es el sitio del pedido «si hay que decidir, solo las opciones y en qué afecta cada una».

El texto vive en `packages/adapter/src/templates.ts` (`RESPONSE_CONTRACT_RULES`,
`RESPONSE_CONTRACT_PRECEDENCE`, `RESPONSE_CONTRACT_TEMPLATE`) y no en `.valmen/rules/`: es del
harness, no del proyecto, y mejora para todos a la vez. `sync --check` lo verifica porque compara
el archivo entero. El documento se reescribe completo en cada `sync`, así que sincronizar dos
veces no duplica la sección. Si el proyecto ya tenía una regla propia titulada «Cómo se responde»
(por ejemplo, porque `valmen adopt` la extrajo de su `AGENTS.md` anterior), su texto se conserva y
se retitula **en la proyección** como «Cómo se responde en este proyecto»; el archivo en
`.valmen/rules/` no se toca.

### 6.2 El «Por qué» en una línea

**Implementado.** En las reglas `.valmen/rules/estandares-*.md`, cada párrafo `**Por qué:**` se
proyecta en una línea: la primera oración (se suman oraciones hasta tener unos 80 caracteres) con
tope de 160 caracteres, cortada en palabra entera y marcada con «…» si se recorta. `**Visto en:**`
no se toca. Cuando algún «Por qué» se acorta, el documento lo dice con una nota; el texto completo
se queda en `.valmen/rules/` (y lo devuelve `ver_estandares`). Las demás reglas, como `proyecto.md`,
no se comprimen.

### 6.3 Presupuesto de tamaño

**Implementado, opt-in.** `AGENTS.md` se carga entero en cada sesión; el proyecto decide cuánto
está dispuesto a cargar:

```yaml
# .valmen/config.yaml
agents-md-budget: 24000     # bytes; entero ≥ 1000. Sin la clave no hay presupuesto ni aviso.
```

La proyección mide el documento (`Projection.agentsMd`: bytes, tokens estimados como `bytes / 4`
y si pasa del presupuesto) y arma el aviso (`Projection.warnings`), que dice cuánto se pasa y
sugiere `rules-to-skills`. `valmen sync` imprime la línea «tamaño de AGENTS.md» (bytes, tokens
estimados y presupuesto si lo hay) y el aviso; con `--check`, el resultado al día repite
`AGENTS.md: <tamaño>` y el aviso, y un resultado desactualizado lo lleva junto al error. El aviso
**no bloquea**: un documento pasado de tamaño sigue siendo el
que el proyecto declaró. Un valor que no sea un entero ≥ 1000 hace fallar la proyección en vez de
ignorarse.

### 6.4 Reglas que viven en las skills

**Implementado, opt-in.** Una regla que solo aplica a un tipo de trabajo —las de pantalla, por
ejemplo— no tiene por qué cargarse en toda sesión. `rules-to-skills` la saca de `AGENTS.md` y la
proyecta a las skills que el proyecto nombre:

```yaml
# .valmen/config.yaml
rules-to-skills:
  estandares-presentacion:       # nombre del archivo en .valmen/rules/, sin .md
    - desarrollo-frontend
    - validacion-ui
```

En `AGENTS.md` quedan el título de la regla y un puntero (a qué skills se fue y dónde está el texto
completo). En cada skill nombrada, en los cuatro runtimes, la regla entra antes de la marca de
«generado», con el mismo tratamiento que en `AGENTS.md`, y el pie lista `reglas proyectadas`. El
prompt MCP de cada skill sirve lo mismo, junto con su `local.md`. Nombrar una regla o una skill
que no existe hace fallar la proyección y lo dice.

Riesgo conocido: la regla solo llega al agente si su cliente carga la skill. El puntero de
`AGENTS.md` existe para eso, pero no lo garantiza.

**Cambia el `AGENTS.md` de todo proyecto.** La sección nueva y el «Por qué» en una línea no son
opcionales: tras actualizar el harness, `valmen sync --check` marca el archivo como desactualizado
hasta que se corra `valmen sync`.

Esto resuelve un problema medido: el `AGENTS.md` de SaiOpenCloud pesaba 54 KB, y 8 KB eran el
«Por qué» de 18 estándares y 12 KB reglas de pantalla.

## 7. Skills compartidas entre agentes

**Implementado.** La fuente es `.valmen/skills/<id>/SKILL.md`, con el formato del estándar
—un directorio por skill, `SKILL.md` dentro— para que la misma carpeta se pueda leer tal cual
desde el cliente sin pasar por la proyección. `valmen sync` la proyecta a las tres rutas que
los clientes buscan de verdad:

| Runtime | Ruta | Quién la lee |
|---|---|---|
| opencode | `.opencode/skills/<id>/SKILL.md` | opencode |
| claude | `.claude/skills/<id>/SKILL.md` | Claude Code, y opencode también |
| codex | `.codex/skills/<id>/SKILL.md` | Codex |

El contenido se **copia**, no se enlaza. El diseño original de esta sección proponía
symlinks con `mode: copy` como alternativa; se descartó por dos razones concretas: un enlace
simbólico dentro de un repositorio versionado apunta a una ruta absoluta de una máquina, y
buena parte de las herramientas que leen estos archivos no los siguen. Copiar hace que la
proyección sea determinista y que `valmen sync --check` pueda comparar bytes, que es lo que
detecta una edición a mano.

### Dos trampas del formato, las dos silenciosas

Las dos se comprueban **al proyectar**, que es donde el error se puede explicar, y no al
usar, que es donde ya no:

- El `name` del frontmatter tiene que coincidir con el nombre del directorio. Los tres
  clientes descartan la skill que no coincide **sin ningún error**: para el agente,
  simplemente no existe.
- El frontmatter tiene que ser lo primero del archivo. Por eso la marca de «generado» va al
  **final** y no delante: un comentario previo rompería el frontmatter y la skill dejaría de
  cargarse, con el motivo en el generador y no en el cliente.

### El stack no va dentro

Una skill del harness **no nombra tecnologías**: las versiones, los servicios y las
convenciones salen de `.valmen/rules/stack.md` del proyecto. Sin eso, la misma tabla de
«qué debe quedar resuelto antes de implementar según el impacto» viviría copiada en cada
proyecto y divergiría en todos. Hay una prueba que lo impide: recorre las skills publicadas
con el harness y falla si alguna nombra una tecnología concreta.

Lo que **no** es genérico se queda en el proyecto: rutas, servicios, versiones y políticas
de dominio van a las reglas del proyecto, que es lo que compone `AGENTS.md`.

### Skills preexistentes

`valmen adopt` **no borra ni reordena** las skills que ya existan en `.agents/skills/`,
`.opencode/skills/` o `.claude/skills/`. Las detecta y las informa. Durante una adopción
conviven con las del harness, que es deliberado: permite comparar antes de retirar las
viejas, y ninguna se pierde.

## 8. El catálogo publicado: el harness publica las skills de proceso

**Implementado.** La sección anterior describe la **proyección**; esta describe la **fuente**
cuando la fuente es el harness y no el proyecto.

**Por qué existe.** La misma skill de proceso vivía en una copia por proyecto, y las copias
divergieron: medido, `planificacion` tenía 81 líneas en el harness y 77 en SaiOpenCloud, y a
la segunda le faltaba justo el bloque que el motor reconoce para registrar la aprobación del
gate de plan; en la otra dirección, `descomposicion` existía en el proyecto y no en el
harness. Nada lo detectaba —`valmen sync --check` comparaba la copia del proyecto contra sus
proyecciones, nunca contra una versión publicada—, así que cada proyecto era su propia
verdad.

El harness ya había resuelto este problema una vez: la skill `valmen` —cómo se usa el
harness— no vive en ningún proyecto, la escribe el harness desde el código y la instala en el
directorio global de skills del agente, con el motivo escrito en `packages/adapter/src/mcp.ts`:
describe algo que es igual en todos los proyectos. Las de proceso lo son igual.

### Las tres capas

| Capa | Qué contiene | Dónde vive | Quién la actualiza |
|---|---|---|---|
| Publicada por el harness | cómo se planifica, se prueba, se revisa y se entrega en cualquier proyecto | `skills/<id>/SKILL.md` del repositorio del harness, con `version:` y `origen: valmen` | el harness |
| Global del agente | las publicadas, instaladas | el directorio global de skills —`~/.hermes/skills/<id>/SKILL.md`—, junto a la skill `valmen` | `valmen hermes connect` |
| Del proyecto | el stack, las rutas, los servicios, las convenciones | `.valmen/skills/<id>/SKILL.md` | el proyecto |

La regla de reparto es una sola: **si la skill nombra un archivo, un servicio, una versión o
una convención de un stack concreto, es del proyecto; si describe cómo cualquier proyecto
planifica, prueba, revisa o entrega, es del harness.** Hoy publica cuatro —`planificacion`,
`pruebas-unitarias`, `revision-final` y `feature`—; `descomposicion` quedó fuera porque la de
SaiOpenCloud se declara a sí misma «las reglas de reparto de SaiOpenCloud y no las generales»,
y una skill que miente en el proyecto siguiente no se publica.

### Cómo se extiende sin bifurcar

Un proyecto que necesita agregar algo a una publicada escribe
`.valmen/skills/<id>/local.md`. La proyección lo concatena **al final** del archivo
proyectado —después de la marca de generado, que señala dónde termina lo que el harness
reescribe— y `valmen sync` **nunca lo toca**. Extender no exige editar el archivo publicado,
que es justo lo que la comparación detecta.

### La comparación, y qué hace cada veredicto

`valmen sync --check` compara, para cada id publicado que el proyecto tenga copiado, la
versión declarada y el sha256 del contenido, y nombra el id, el motivo y las dos versiones:

| Motivo | Qué pasó | Cómo se resuelve |
|---|---|---|
| `falta` | el proyecto no tiene la copia | `valmen sync` la instala |
| `version` | la copia es de una versión anterior del catálogo | `valmen sync` la actualiza |
| `editada` | el contenido se cambió a mano sobre la versión publicada | `valmen sync` **la reemplaza**; si la edición era deliberada, su sitio es `local.md` |

`sync` pisa una copia editada a mano, y es deliberado: el check la nombra **antes**, así que
nadie pierde su edición sin haberlo leído. La capa global usa la política contraria —no pisa
sin `--force`— porque ahí no hay una versión publicada con la que comparar, y una copia
distinta suele ser una edición propia del usuario.

### Adoptar un proyecto que ya existía

`valmen adopt` instala las publicadas en `.valmen/skills/` del proyecto adoptado, y **no
toca** las skills del proyecto. Un proyecto adoptado antes de que existiera el catálogo las
recibe con `valmen sync`: es el mismo camino, sin volver a adoptar.

## 8. Hooks y validaciones mecánicas

El contrato heredado de SaiOpenCloud es correcto y se conserva: *"los hooks solo pueden
realizar validaciones deterministas: nunca crean commits, hacen push, despliegan, alteran
documentación ni interpretan una prueba como aprobada sin confirmación del PO"*.

```yaml
# .valmen/config.yaml
hooks:
  # Validaciones que se confían al agente que estás usando (capa rápida, local).
  - id: schema-ticket
    event: [pre-write, pre-commit]
    match: "tickets/**/ticket.md"
    run: valmen ticket validate --file {file}
    on_failure: block
    targets: [claude, codex, opencode]     # cada adaptador lo traduce a su formato

  - id: sin-secretos
    event: [pre-commit]
    run: .valmen/gates/_checks/scan-secrets.sh
    on_failure: block
    targets: [claude, codex]

  - id: sync-check
    event: [pre-commit]
    run: valmen sync --check
    on_failure: block
    targets: [claude, codex, opencode]
```

Traducción por adaptador:

| Adaptador | Mecanismo | Archivo destino |
|---|---|---|
| Claude Code | `hooks` en settings | `.claude/settings.json` |
| Codex | `hooks.json` | `.codex/hooks.json` |
| opencode | Plugin TypeScript | `.opencode/plugins/valmen-hooks.ts` |
| genérico | Instrucción en `AGENTS.md` | — (el agente lo hace por instrucción) |

**Doble capa, y esto es importante:** los hooks del agente son la capa rápida (feedback
inmediato mientras el agente trabaja), pero **no son la garantía**. La garantía es el motor:
`valmen` valida en cada transición y en el commit. Un agente que ignore su hook no puede
saltarse el gate porque el gate vive en el motor, no en el agente.

## 9. Detección y conflictos

```bash
$ valmen doctor
valmen 0.4.2 · SaiOpenCloud · /Users/…/SaiOpenCloud

Motor
  ✓ .valmen/ válido (schema 1)
  ✓ 8 tickets válidos, 1 con advertencia
  ✓ índice reconstruible (último: hace 2 min)
  ⚠ state/ tiene 3 entradas obsoletas → valmen index

Configuración detectada
  ✓ AGENTS.md        generado por valmen (hash coincide)
  ✗ CLAUDE.md        EDITADO A MANO desde el último sync
                     → valmen sync --force  (sobrescribe)
                     → o mueve el cambio a .valmen/rules/ y vuelve a sincronizar
  ⚠ .codex/agents/  3 archivos editados a mano
  ✓ .opencode/      generado por valmen (hash coincide)
  ⚠ .claude/        14 archivos no gestionados (legado) — no se tocan

Agentes detectados
  ✓ claude 2.1.212      (OAuth activo, plan Max)
  ✓ codex 0.9.1         (encontrado en PATH)
  ✗ opencode            no encontrado en PATH

Proveedores
  ✓ openrouter   446 modelos · $52.18 este mes
  ✓ claude-code  OAuth · token válido por 6h
  ⚠ codex        OAuth · token expira en 12 min → se renovará solo
  ✗ deepseek     sin clave configurada

Gates
  ⚠ gate `plan` en modo hybrid: precisión medida 91% (23/30)
    → por debajo del 98% requerido para promover a auto

Problemas: 1 error, 5 avisos
```

`valmen doctor` es **read-only** por contrato. Nunca arregla nada por su cuenta; dice qué
haría falta y el comando exacto.

## 10. Migración desde configuraciones existentes

Si el proyecto ya tiene `CLAUDE.md`, `AGENTS.md`, `.codex/`, `.claude/` o `.opencode/`
escritos a mano, `valmen adopt` los analiza y **no los borra**. Ver
[`08-ADOPCION.md`](08-ADOPCION.md).

Regla dura: **nada se elimina en la adopción.** Los archivos viejos se mueven a
`.valmen/legacy/` con un README que explica de dónde vinieron, o se marcan como legado sin
tocarlos (el comportamiento que SaiOpenCloud ya eligió para `.claude/` y que fue una buena
decisión). El usuario decide qué se descarta, después.
