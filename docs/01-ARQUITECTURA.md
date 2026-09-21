# 01 — Arquitectura

## 1. Las cuatro capas

El producto se organiza en capas con una regla dura: **cada capa hacia abajo no conoce a la
de arriba**. El motor no sabe que existe Codex. El core no sabe que existe una GUI.

```
┌─────────────────────────────────────────────────────────────────────┐
│ L4  ADAPTADORES        codex · claude · opencode · cursor · hermes   │
│     Proyectan el contrato canónico al formato nativo de cada agente  │
├─────────────────────────────────────────────────────────────────────┤
│ L3  SUPERFICIES        CLI · MCP server · Web API · hooks            │
│     Transporte. Solo hablan con L1/L2. Cero lógica de negocio.       │
├─────────────────────────────────────────────────────────────────────┤
│ L2  AGENTE             orquestador · routing · gates LLM · tools     │
│     El agente del harness cuando corre headless o como plugin.       │
├─────────────────────────────────────────────────────────────────────┤
│ L1  CORE               workflow · gates · spec · providers · plugins │
│     Determinista, testeable sin red, sin LLM en el camino crítico.   │
├─────────────────────────────────────────────────────────────────────┤
│ L0  ARTEFACTOS         archivos en disco, versionados con git        │
│     tickets · specs · features · recibos · evidencia · config        │
└─────────────────────────────────────────────────────────────────────┘
```

**L0 y L1 son el producto.** L2–L4 son formas de llegar a él. Esto permite que el MVP sea
útil sin GUI ni agente propio: el CLI sobre el core ya reemplaza lo que hoy hace
`tools/agentic/ticket.py`.

## 2. Layout en disco

### 2.1 Global (una vez por máquina)

Análogo a `~/.dsh`. Nunca se versiona. Guarda secretos y sesiones.

```
~/.valmen/
├── settings.yaml             # preferencias globales (tema, telemetría, canal de update)
├── .credentials.yaml         # API keys cifradas con el keychain del SO   (chmod 600)
├── vault/                    # tokens de suscripción (Claude OAuth, Codex auth, OpenRouter)
├── sessions/                 # historial de conversaciones (JSONL append-only)
├── storages/                 # caché e índices derivados (reconstruibles, borrables)
├── plugins/                  # node_modules de los plugins instalados
├── models/
│   ├── catalog.json          # catálogo de modelos (refrescable desde providers)
│   └── presets.yaml          # presets de routing: quality / balanced / economy / diversity
└── profiles/
    └── <perfil>/
        └── valmen.config.yaml
```

### 2.2 Proyecto (versionado en git)

Es lo que se comparte con el equipo y lo que se revisa en un PR. **Todo es texto.**

```
<repo>/
├── .valmen/
│   ├── config.yaml           # configuración del harness en este proyecto
│   ├── workflows/
│   │   ├── default.yaml      # pipeline por defecto (referencia al core)
│   │   ├── hotfix.yaml       # pipeline alterno, más corto
│   │   └── epic.yaml         # pipeline para features grandes
│   ├── gates/
│   │   ├── plan.yaml         # definición declarativa de cada gate
│   │   ├── qa.yaml
│   │   ├── deploy.yaml
│   │   └── _checks/          # scripts de checks mecánicos del proyecto
│   ├── processes/            # procesos = pasos encadenables (deploy, manuales…)
│   │   ├── deploy.yaml
│   │   └── actualizar-manuales.yaml
│   ├── routing.yaml          # modelo por rol de workflow
│   ├── rules/                # reglas del proyecto (lo que NO es del harness)
│   │   ├── stack.md
│   │   ├── dominio.md
│   │   └── invariantes.md
│   ├── skills/               # skills del proyecto
│   ├── agents/               # definiciones de subagentes del proyecto
│   └── receipts/             # recibos de gate (append-only, JSONL por ticket)
│
├── .valmen/state/            # DERIVADO — reconstruible con `valmen index`
│   ├── index.json
│   └── graph.json
│
├── tickets/                  # registro canónico de trabajo
│   ├── index.md              # vista derivada
│   └── 2026/
│       └── <TICKET-ID>/ticket.md
│
├── features/                 # trabajo grande: spec + descomposición
│   └── <feature-slug>/
│       ├── brief.md
│       ├── spec/             # spec por dominio, con requisitos RFC 2119
│       ├── design.md
│       ├── tasks.md
│       ├── tickets.yaml      # grafo de tickets de la feature
│       ├── verify.md
│       └── archive/
│
├── AGENTS.md                 # GENERADO por el adaptador (no editar a mano)
├── CLAUDE.md                 # GENERADO (solo si hay Claude Code)
└── .codex/ .claude/ .opencode/  # GENERADOS por los adaptadores
```

### 2.3 Reglas del layout

1. **`.valmen/` es la fuente de verdad.** Todo lo demás (`AGENTS.md`, `.codex/`,
   `.claude/`, `.opencode/`) son **salidas generadas** y llevan una cabecera:
   ```markdown
   <!-- GENERADO POR valmen v0.4.2 — NO EDITAR A MANO -->
   <!-- fuente: .valmen/rules/*.md + .valmen/config.yaml -->
   <!-- regenerar: valmen sync -->
   ```
2. **`.valmen/state/` está en `.gitignore`.** Es derivado. Borrarlo y correr `valmen index`
   debe reproducirlo byte a byte. Esto es un test de integración obligatorio.
3. **Nombres de directorio configurables.** Un proyecto que ya usa `docs/tickets/` no
   cambia su estructura: `.valmen/config.yaml` declara las rutas. El default es
   `tickets/` y `features/`.
4. **Nada de estado en memoria.** El motor es *stateless*: lee archivos, calcula, escribe.
   Esto es lo que permite que dos máquinas y un agente vean lo mismo.

## 3. El núcleo: estado event-sourced con proyecciones

El patrón más valioso que se toma de DSH, aplicado al workflow en vez de al chat.

```
  ARCHIVOS CANÓNICOS          LOG DE EVENTOS              PROYECCIONES
  ───────────────────         ──────────────              ────────────
  ticket.md          ──┐
  features/*/spec    ──┤      events.jsonl         ┌──▶  status --json
  receipts/*.jsonl   ──┼──▶   (append-only,   ─────┼──▶  index.md
  .valmen/config     ──┘       inmutable)           ├──▶  AGENTS.md / .codex/
                                                    ├──▶  grafo de dependencias
                                                    └──▶  vista web
```

- **Canónico:** los `.md` con frontmatter restringido y los bloques JSON append-only (el
  contrato que SaiOpenCloud ya validó en producción). El humano puede leerlo y editarlo.
- **Derivado:** `state/index.json`, `index.md`, el grafo, las proyecciones para cada
  agente, las vistas de la web. Todo reconstruible.
- **Eventos:** cada mutación del motor escribe exactamente un evento con actor, timestamp,
  acción y detalle. El log es la base de la auditoría y del aprendizaje (Fase 6).

Esta separación es lo que hace que el sistema sea confiable: si una proyección se corrompe,
se regenera; si el canónico se corrompe, el log y git lo detectan.

## 4. Modelo de dominio

Entidades del core, todas serializables y versionadas:

```ts
// ── Unidades de trabajo ──────────────────────────────────────────────
type Ticket = {
  id: string;              // <TIPO>-<MODULO>-<DESC>-<YYYYMMDD>
  type: 'FEATURE'|'BUGFIX'|'IMPROVEMENT'|'SYNC'|'INTEGRATION'|'AGENT'|'SECURITY'|'CHORE'|'DOCS';
  module: string;
  workflowStatus: WorkflowStatus;
  qaStatus: QaStatus;
  releaseStatus: ReleaseStatus;
  impacts: { sync, migration, docker, auth, deploy: boolean };
  riskLevel: 'low'|'normal'|'high'|'critical';
  points: Point[];         // POINT-NNN inmutable
  featureId?: string;      // si pertenece a una feature
  dependsOn: string[];     // otros tickets
};

type Feature = {           // trabajo grande
  slug: string;
  title: string;
  status: FeatureStatus;
  specDomains: string[];
  ticketGraph: TicketGraph;
  decomposedAt?: string;
  decomposedBy?: { model: string; cost: number };
};

type Point = { id: string; status: PointStatus; severity: Severity; /* … */ };

// ── Contratos de verificación ────────────────────────────────────────
type GateDefinition = {
  id: string;
  scope: 'transition'|'ticket'|'feature'|'release'|'process';
  mode: 'human'|'auto'|'hybrid';
  checks: Check[];         // mecánicos primero, LLM después
  policy: GatePolicy;      // umbrales
  onOutcome: Record<Outcome, Action>;
};

type GateReceipt = {       // append-only, la auditoría
  id: string; gateId: string; subject: string;
  outcome: 'approve'|'block'|'review';
  reason: string;
  evidence: Evidence[];
  modelAnswers?: { question: string; probability: number }[];
  model?: { provider: string; model: string; costUsd: number; latencyMs: number };
  actor: 'human'|'model'|'engine';
  decidedAt: string;
};

type Process = {           // paso a paso encadenable
  id: string;
  steps: ProcessStep[];
  onSuccess?: { runProcess?: string[] };   // encadenamiento
  gates: string[];
};
```

## 5. El meta-modelo: trabajo normalizado

Todo trabajo, sin importar su tamaño, se normaliza a la misma forma. Esto es lo que
permite que un bugfix de una línea y un módulo de inventario usen el mismo motor.

| Tamaño | Entidad | Pipeline | Artefactos |
|---|---|---|---|
| Trivial (texto, estilo) | **Modo directo** | Sin registro | Ninguno |
| Acotado (bug, mejora) | **Ticket** | `default.yaml` | `ticket.md` |
| Grande (feature, módulo) | **Feature** → N tickets | `epic.yaml` | `features/<slug>/` + tickets hijos |
| Proyecto nuevo | **Feature** raíz + bootstrap | `epic.yaml` + `init` | Todo lo anterior |

**Regla de clasificación mecánica** (no de juicio del modelo): si el análisis revela 2 o
más pasos de implementación con archivos distintos, o el trabajo vale registrar para
recuperarlo tras una interrupción, es ticket. Si el ticket excede N archivos o M puntos de
dominio, el motor sugiere elevarlo a feature.

## 6. Stack técnico propuesto

| Componente | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** sobre Node 22+ | Es donde vive el ecosistema (MCP, Agent SDK, Vercel AI SDK, adaptadores de proveedor). Un solo runtime para CLI + core + web. Ya tienes Node 24. |
| Monorepo | **pnpm workspaces** + Turborepo | Estándar; permite publicar paquetes independientes. |
| CLI | `commander` (o parsing propio mínimo) | Sin dependencias pesadas en el camino crítico. |
| Validación | **Zod 4** | Un solo esquema sirve para validar, tipar y generar JSON Schema. Crítico: el contrato se publica como JSON Schema para los adaptadores. |
| Estado derivado | **SQLite** (`better-sqlite3`) para consultas + JSON/JSONL como canónico | SQLite es un índice, no la verdad. Permite que la GUI consulte rápido. |
| Servidor web | **Hono** | Ligero, tipado, corre en Node. |
| Frontend | **Vite + React 19 + Tailwind 4 + shadcn/ui** | Estándar actual para este tipo de panel. |
| Config | **YAML** para config humana, **JSON** para recibos y estado | YAML restringido para el frontmatter canónico (regla heredada de SaiOpenCloud). |
| Tests | `vitest` + un corpus determinista tipo *journeys* | Probar el motor sin llamar a ningún modelo. |
| Distribución | npm global (`npm i -g valmen`) + `npx valmen` | Instalación trivial; sin binarios firmados en fase 1. |

**Dependencias que se evitan deliberadamente:** frameworks de agentes pesados en el core
(el core no hace tool-calling), ORM (los archivos son el modelo), y cualquier cosa que
requiera red para funcionar.

## 7. Estructura del monorepo

```
valmenharness/
├── packages/
│   ├── core/                 # @valmen/core — dominio puro, cero I/O de red
│   │   ├── src/ticket/       # máquina de estados, validación, POINT-NNN
│   │   ├── src/feature/      # spec, descomposición, grafo
│   │   ├── src/gate/         # evaluación de gates, recibos
│   │   ├── src/receipt/      # log append-only
│   │   └── src/schema/       # Zod → JSON Schema
│   ├── fs/                   # @valmen/fs — lectura/escritura atómica de artefactos
│   ├── engine/               # @valmen/engine — orquesta core + fs + plugins
│   ├── providers/            # @valmen/providers — adaptadores LLM
│   ├── gate-jev/             # @valmen/gate-jev — TypeSafe Jev (Decisions API)
│   ├── routing/              # @valmen/routing — modelo por rol, presets, costos
│   ├── plugins/              # @valmen/plugins — loader y contratos
│   ├── adapters/             # @valmen/adapter-{codex,claude,opencode,generic}
│   ├── adopt/                # @valmen/adopt — análisis de proyecto y AGENTS.md
│   ├── cli/                  # @valmen/cli — superficie de comandos
│   ├── mcp/                  # @valmen/mcp — servidor MCP para los agentes
│   ├── server/               # @valmen/server — API HTTP + SSE
│   └── web/                  # @valmen/web — Mission Control
├── plugins/                  # plugins de primera parte
│   ├── deploy/
│   ├── manuals/
│   ├── codegraph/
│   ├── memory/
│   └── hermes/
├── templates/                # plantillas de proyecto (Django+Angular, Node, etc.)
├── docs/                     # esta documentación
└── bench/                    # corpus determinista de journeys
```

## 8. Patrones adoptados de la arquitectura de DSH

DSH resolvió a escala un problema idéntico: cómo componer ~230 capacidades sin que se
conviertan en una maraña. Cuatro de sus patrones se adoptan explícitamente porque son
baratos al principio y carísimos de retrofitear.

### 8.1 Seam / Provider / Consumer

Toda capacidad con más de una implementación posible se declara como **contrato (seam)**
sin sufijo, con implementaciones nombradas por su tecnología:

```
@valmen/gate           (seam: GateEvaluator, CheckRunner, ReceiptStore)
@valmen/gate-jev       (provider: TypeSafe Jev sobre la Decisions API)
@valmen/gate-mcp       (provider: MCP server de validación)
@valmen/gate-command   (provider: exit code de un script)
@valmen/store          (seam: IndexStore)
@valmen/store-sqlite   (provider)
@valmen/store-json     (provider)
```

Los consumidores importan **el seam, nunca el provider**. Esto es lo que permite cambiar
Jev por otro evaluador sin tocar un solo gate. En DSH este patrón se repite 15 veces y es
la razón por la que 230 paquetes siguen siendo navegables.

### 8.2 "Model-visible ⟺ logged"

Todo lo que un modelo recibe en una petición del harness debe ser reconstruible desde un
log. Aplicado al workflow:

- El contexto que se envía a un gate (spec + plan + diff + reglas) se **congela y se
  loguea** antes del dispatch, con su hash.
- Un recibo de gate no es "el modelo aprobó": es la evidencia exacta que vio el modelo,
  las preguntas, las probabilidades y el resultado.
- Consecuencia práctica: si Jev cambia de versión y los resultados se mueven, se puede
  reproducir con el mismo input congelado y ver si el cambio es del modelo o del artefacto.

### 8.3 Fail-loud en arranque, fail-soft en runtime

- **Arranque:** si `.valmen/config.yaml` o un gate son inválidos, `valmen` **no arranca** y
  dice exactamente qué archivo, qué línea y qué se esperaba. Un setup roto a medias es peor
  que un setup roto.
- **Runtime:** si editas un gate mientras corre la app, una edición inválida **conserva la
  última versión buena** y avisa. Nunca deja el sistema en un estado intermedio.
- **Estado escrito:** si algo falla a mitad de una transición, la operación es atómica
  (temp + fsync + rename) o no ocurre. Nunca hay un ticket a medio transicionar.

### 8.4 Códigos de error estables

Los consumidores enrutan por **código**, nunca por texto. Vocabulario del harness:

```
Autorización     AUTH_REQUIRED · CREDENTIAL_MISSING · CREDENTIAL_INVALID · QUOTA_EXCEEDED
Gate             GATE_BLOCKED · GATE_NEEDS_REVIEW · GATE_EVALUATOR_UNAVAILABLE
                 GATE_CRITERION_UNANSWERED · GATE_THRESHOLD_MISSING
Motor            INVALID_TRANSITION · POINT_ALREADY_CLOSED · QA_NOT_APPROVED
                 COVERAGE_GAP · DEPENDENCY_CYCLE · REVISION_CONFLICT
Artefactos       ARTIFACT_MISSING · ARTIFACT_DRIFT · SCHEMA_INVALID
Ejecución        PROCESS_STEP_FAILED · TOOL_TIMEOUT · TOOL_DENIED · ABORTED
Proveedores      NO_ADAPTER · RATE_LIMIT · CONTEXT_WINDOW_EXCEEDED · TRANSPORT
```

Beneficio concreto: un mensaje en español puede cambiar sin romper la lógica que decide
si reintentar, escalar a humano o abortar.

### 8.5 Protección contra corrupción silenciosa

Dos invariantes que DSH demostró necesarios y que se adoptan como tests obligatorios:

1. **Round-trip de persistencia.** Escribir y releer cualquier artefacto debe dar el mismo
   resultado, y una escritura truncada debe detectarse y recuperarse, no ignorarse.
2. **Reconstrucción de derivados.** Borrar `.valmen/state/` completo y correr
   `valmen index` debe reproducir `index.md`, `index.json` y el grafo exactamente. Este es
   el test que garantiza que el estado derivado nunca se vuelve fuente de verdad por
   accidente.

## 9. Decisiones arquitectónicas (ADR)

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| ADR-001 | CLI + archivos como núcleo; GUI como cliente | GUI-first | La GUI no puede ser la única forma de operar si el agente tiene que hacerlo también. |
| ADR-002 | Estado canónico en archivos versionados con git | Base de datos | El equipo ya revisa cambios en PRs. Una DB rompe la revisión y el rollback. |
| ADR-003 | SQLite solo como índice derivado, borrable | SQLite como fuente | Si la DB es la verdad, se pierde la auditoría por git y el "borrar y reconstruir". |
| ADR-004 | Gates declarativos en YAML, no en código | Gates en código | El usuario pidió configurar por texto/chat. YAML auditable > código recompilado. |
| ADR-005 | El LLM evalúa proposiciones, el código decide | LLM decide | Es la única forma de que un gate automático sea reproducible y auditable. |
| ADR-006 | Jev como evaluador por defecto, sustituible | Acoplar a Jev | Jev es alpha. El contrato `GateEvaluator` permite cambiarlo sin tocar gates. |
| ADR-007 | Skills como archivos, resueltas a paths exactos | Skills como prompts | Un path inyectado no se resume ni se trunca por compactación. |
| ADR-008 | Proyección multi-agente desde una sola fuente | Mantener N configs en paralelo | Es exactamente el dolor que originó el proyecto. |
| ADR-009 | Procesos encadenables declarativos | Scripts bash ad-hoc | El usuario pidió "que el deploy llame a actualizar manuales" como configuración. |
| ADR-010 | Modo headless es fase 5, no MVP | Empezar con agente propio | El valor inmediato está en el contrato, no en otro loop de agente. |
| ADR-011 | Seam / Provider / Consumer para toda capacidad | Implementación directa | Permite sustituir Jev, SQLite, o el transporte sin tocar consumidores. |
| ADR-012 | "Model-visible ⟺ logged": congelar y loguear el contexto de cada gate | Guardar solo el veredicto | Sin el input congelado, un cambio de modelo es indistinguible de un cambio de artefacto. |
| ADR-013 | Recibos de gate en JSONL append-only, un archivo por sujeto | Un JSON reescrito | Concurrencia segura, merge trivial en git, tolerante a truncamiento. |
| ADR-014 | Granularidad de ~20 paquetes, no 200 | Un paquete por capacidad al estilo DSH | La disciplina de DSH solo paga con su escala. Se empieza con 20 y se parte cuando duela. |
