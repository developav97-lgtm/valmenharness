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
├── agents/*.md                  │   (lo único que se escribe a mano)
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

**Presupuesto de bytes:** el motor mide el resultado y avisa si excede el límite configurado
(64 KB por defecto, el que usa DSH para `AGENTS.md`). Si excede, sugiere qué mover a una
skill (que se carga bajo demanda en vez de siempre).

Esto resuelve un problema real que tienes hoy: `AGENTS.md` tiene 94 líneas y crecerá. Con
secciones y presupuesto, se sabe cuándo hay que sacar algo a una skill.

## 7. Skills compartidas entre agentes

SaiOpenCloud ya tiene la idea correcta (`.agents/skills/` compartido por Codex y opencode).
El harness la generaliza:

```yaml
# .valmen/config.yaml
skills:
  install_to:
    claude:   { path: .claude/skills,   layout: bundle }   # <name>/SKILL.md
    codex:    { path: .agents/skills,   layout: bundle }
    opencode: { path: .opencode/skills, layout: bundle }
    generic:  { path: .agents/skills,   layout: bundle }
```

Opciones por adaptador:

- `layout: bundle` → copia/symlink `<name>/SKILL.md`
- `layout: flat` → `<name>.md` (algunos agentes lo prefieren)
- `mode: symlink` (default) → enlaces al `.valmen/skills/`, cero duplicación
- `mode: copy` → copia real (necesario en Windows o si el agente no sigue symlinks)

**Advertencia documentada:** los symlinks en Windows requieren permisos o modo desarrollador.
El manual de instalación lo dice, y `valmen doctor` detecta el problema y sugiere `copy`.

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
