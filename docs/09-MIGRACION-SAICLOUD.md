# 09 — Migración de SaiOpenCloud

Objetivo del MVP: **igualar lo que ya tienes y reemplazarlo**, empezando a probarlo contra un
proyecto en producción con clientes activos. Este documento es el plan concreto.

## 1. Inventario de lo que hay hoy

Auditoría del estado real del repositorio (2026-09-20):

### 1.1 Fuente de verdad y gobierno

| Artefacto | Tamaño | Estado | Destino en el harness |
|---|---|---|---|
| `AGENTS.md` | 94 líneas / 11.5 KB | Fuente de verdad activa | `.valmen/rules/` (proyecto) + `.valmen/config.yaml` (flujo) |
| `CLAUDE.md` | 7.8 KB | Marcado legado en su propia cabecera | `.valmen/legacy/` — no se toca |
| `docs/agentic/PHASE-MAP.md` | 178 líneas | Contrato de workflow, gates y routing | `.valmen/workflows/default.yaml` + `.valmen/gates/` |
| `docs/agentic/ticket-schema.md` | 238 líneas | Contrato del ticket | El motor del harness lo implementa |
| `docs/agentic/MANUAL-FLUJO-TRABAJO-CODEX.md` | 13 KB | Manual operativo | `.valmen/skills/flujo-trabajo/SKILL.md` |
| `docs/agentic/rules/*.md` | 6 archivos | Reglas transversales | `.valmen/rules/` |

### 1.2 Sistema de tickets (el activo principal)

| Artefacto | Tamaño | Estado | Destino |
|---|---|---|---|
| `tools/agentic/ticket.py` | 2.171 líneas | **CLI activo en producción** | Adaptador de compatibilidad en Fase 1 |
| `tools/agentic/ticket_viewer.py` | 395 líneas | Visor local | Reemplazado por Mission Control (Fase 3) |
| `tools/agentic/release_notes.py` | 190 líneas | Genera notas de release | `.valmen/processes/release-notes.yaml` |
| `tools/agentic/ticket_viewer_static/` | HTML/CSS/JS | UI del visor | Reemplazado por Mission Control |
| `tools/agentic/tests/` | 3 archivos | Tests del CLI | Se conservan; se añaden tests de equivalencia |
| `docs/tickets/2026/*/ticket.md` | **57 tickets** | Producción con historial | **Intactos** — mismo formato |
| `docs/tickets/index.md` | Derivado | Regenerado por el CLI | Derivado en el motor |

### 1.3 Skills

13 skills activas en `.agents/skills/`, compartidas por Codex y opencode:

```
saicloud-panel-admin          saicloud-backend-django     saicloud-despliegue
saicloud-planificacion        saicloud-pruebas-unitarias  saicloud-frontend-angular
saicloud-agente-go-local      saicloud-revision-final     saicloud-validacion-ui
saiopencloud-orquestador      saiopendcloud-reporte-incidencias
claudio-backlog-manager       claudio-scheduler
+ 4 source-command-* (envoltorios de comandos slash)
+ 4 archivadas en .agents/archive/skills/
```

Todas migran a `.valmen/skills/` sin cambios de contenido (el formato es idéntico).

### 1.4 Agentes

12 agentes **duplicados en dos formatos** — el problema que motiva el proyecto:

```
.codex/agents/           .opencode/agents/          equivalente
─────────────────────    ──────────────────────     ────────────────────────
planner.toml             planner.md                 architect
explorer.toml            explorer.md                explorer
django.toml              django.md                  implementer (backend)
angular.toml             angular.md                 implementer (frontend)
offline-sync.toml        offline-sync.md            implementer (sync)
sincsaicloud.toml        sincsaicloud.md            implementer (sync)
go-local.toml            go-local.md                implementer (agentes)
test-designer.toml       test-designer.md           test-author
reviewer.toml            reviewer.md                critic
qa-evidence.toml         qa-evidence.md             verifier
release-manager.toml     release-manager.md         release
devops-aws.toml          devops-aws.md              devops
```

**Divergencia ya detectada** entre `planner.toml` y `planner.md` (una frase distinta). Con
12 agentes × 2 formatos, esto va a pasar más veces.

### 1.5 Integraciones

| Integración | Estado | Destino |
|---|---|---|
| CodeGraph MCP | Activo, índice en `.codegraph/` | `@valmen/plugin-codegraph` |
| Hooks de Codex | Desactivados (`.codex/hooks.json` vacío) | Se reactivan como checks mecánicos |
| GitHub Actions | 1 workflow (publicación de imágenes) | Sin cambios |
| AWS CodeBuild | 8 buildspecs | Sin cambios |
| Docker / docker-compose | Activo | Procesos de deploy/rollback |
| `scripts/migrate-tenant.sh` | Script manual de 9 pasos | `.valmen/processes/migrar-tenant.yaml` |
| Notificaciones Telegram | `.claude/.env.telegram`, `config/telegram.setup.md` | `@valmen/plugin-hermes` |

### 1.6 Deuda que la migración debe resolver

| Deuda | Magnitud | Cómo la resuelve el harness |
|---|---|---|
| Config duplicada en 2–3 formatos | 12 agentes × 2, más skills | `valmen sync` genera todo desde `.valmen/` |
| `.claude/` con 989 drafts sin gestión | ~989 archivos | No se toca; se analiza y se propone rescate |
| 4 directorios de backup dentro de `.claude/` | Ruido | No se toca |
| `telemetry.jsonl` de 142 KB | Sin uso declarado | No se toca |
| `AGENTS.md` marcado como fuente de verdad pero con legado | Riesgo de confusión | Cabecera de generado + `valmen doctor` detecta ediciones a mano |
| Sin entidad "feature" | Bloquea el trabajo grande | `features/` del motor |
| Gates 100% humanos | Cuello de botella | Jev en `analysis` y `plan` |
| Sin trazabilidad de costo por ticket | Solo `## Consumo de IA` manual | Medición automática con `usage.cost` |

## 2. Principio rector de la migración

> **Primero equivalencia, después mejora.**

La Fase 1 no añade nada nuevo: reproduce exactamente lo que `ticket.py` hace hoy, con los
mismos 57 tickets, los mismos estados, las mismas validaciones. El criterio de aceptación es
**equivalencia verificable**, no "funciona parecido".

```bash
# El test que define el éxito de la Fase 1
valmen ticket validate --all > /tmp/valmen.txt
python3 tools/agentic/ticket.py validate --all > /tmp/python.txt
diff /tmp/valmen.txt /tmp/python.txt    # debe estar vacío
```

Solo cuando eso pasa, se empieza a mejorar. Esto es lo que permite migrar un sistema en
producción sin riesgo.

## 2bis. Contrato real verificado de los 57 tickets

Esto no está en `ticket-schema.md`. Se extrajo parseando los 57 tickets reales, y es lo que
la reimplementación en TypeScript tiene que respetar **exactamente**.

### 2bis.1 Volumetría

| Métrica | Valor |
|---|---|
| Tickets | 57, todos `closed` |
| `validate --all` hoy | **57 válidos, exit 0** ← la línea base del test de equivalencia |
| Eventos `ticket-event` | **1.851** |
| Entradas `ticket-close` | 61 |
| Puntos `POINT-NNN` | 48 tickets los tienen; 137 puntos en total |
| Ciclos `QA-NNN` | 55 tickets; 166 ciclos |
| Entradas `EVIDENCE-NNN` | 45 tickets; 177 entradas |
| `RETEST-NNN` | 47 tickets; 137 retests |
| `CONSUMO-NNN` | **1 ticket, 1 entrada** ← ver §2bis.4 |

### 2bis.2 Los 11 verbos de evento y sus formatos exactos de `details`

Los eventos usan una envoltura uniforme:
`{ kind, id, date, action, actor, details }`. El estado de la transición **no está en un
campo estructurado**: está embebido en el string `details` con un formato estable.

| `action` | Formato de `details` | Ocurrencias |
|---|---|---|
| `created` | `Ticket creado sin sobrescribir historial.` | 57 |
| `ticket-transition` | `Workflow: {desde} -> {hasta}.` | 530 |
| `point-transition` | `{POINT-NNN}: {desde} -> {hasta}.` | 491 |
| `evidence-added` | `Se agregó {EVIDENCE-NNN}.` | 176 |
| `retest-added` | `Se agregó {RETEST-NNN} para {POINT-NNN}.` | 137 |
| `point-added` | `Se agregó {POINT-NNN}.` | 137 |
| `release-transition` | `Release: {desde} -> {hasta}.` | 101 |
| `qa-started` | `Se inició {QA-NNN}.` | 80 |
| `qa-closed` | `Se registró {QA-NNN} con resultado {resultado}.` | 80 |
| `close-attempted` | `Se agregó {CLOSE-NNN}.` | 61 |
| `ai-usage-added` | `Se agregó {CONSUMO-NNN}.` | 1 |

**Verificación de parseabilidad:** de los 1.851 eventos, **1.848 (99,84%)** casan con un
patrón estricto. Los **3 que no** son todos `ticket-transition` de reapertura, donde el CLI
anexó el motivo al final del string:

```
Workflow: closed -> changes_requested. Reapertura por hallazgo: <texto libre del motivo>
```

Corresponden a la regla documentada de reapertura (`closed → changes_requested` solo si
`unreleased`, con motivo QA documentado). El CLI **acumula el motivo en el mismo string** en
vez de usar un campo propio.

**Consecuencia para la implementación:** el parser TS usa una expresión regular tolerante
(`^Workflow: (\S+) -> (\S+)\..*$`) y el contrato nuevo añade un campo `reason` opcional. Los
3 eventos históricos se conservan sin reescribir; los nuevos usan el campo.

**Invariante confirmada:** los `EVENT-NNN` son monótonos desde `EVENT-001` sin huecos en los
57 tickets (0 excepciones). Ese check se hereda tal cual.

**Dato para el diseño de actores:** `actor` es `"cli"` en los **1.851** eventos. El campo
existe pero nunca se usó otro valor. El harness lo aprovecha: `actor` pasa a distinguir
`human` · `model` · `engine` · `cli`, que es lo que permite saber quién aprobó qué en un gate
híbrido.

### 2bis.2bis La matriz de transiciones real (extraída de producción)

`PHASE-MAP.md` y `ticket-schema.md` documentan las máquinas de estado. Esto es lo que
**realmente ocurrió** en los 57 tickets. Es el conjunto de datos de aceptación de la Fase 1.

**Ticket (`workflow_status`) — 11 transiciones distintas, 530 ejecuciones**

| # | Transición | Veces |
|---|---|---|
| 1 | `in_progress` → `awaiting_user_tests` | 74 |
| 2 | `awaiting_user_tests` → `in_qa` | 74 |
| 3 | `in_qa` → `qa_approved` | 60 |
| 4 | `qa_approved` → `closed` | 60 |
| 5 | `intake` → `analyzed` | 57 |
| 6 | `analyzed` → `planned` | 57 |
| 7 | `planned` → `approved` | 57 |
| 8 | `approved` → `in_progress` | 57 |
| 9 | `changes_requested` → `in_progress` | 17 |
| 10 | `in_qa` → `changes_requested` | 14 |
| 11 | **`closed` → `changes_requested`** | **3** |

**Point (`point.status`) — 5 transiciones, 491 ejecuciones**

| Transición | Veces |
|---|---|
| `in_progress` → `awaiting_retest` | 137 |
| `open` → `analyzed` | 136 |
| `analyzed` → `in_progress` | 136 |
| `verified` → `closed` | 81 |
| `open` → `deferred` | 1 |

**Release (`release_status`) — 2 transiciones, 101 ejecuciones**

| Transición | Veces |
|---|---|
| `unreleased` → `planned` | 50 |
| `planned` → `released` | 51 |

### 2bis.2ter Qué se valida de verdad: contrato autoritativo del validador

Lo siguiente **no se dedujo**: se extrajo del código fuente de `ticket.py` y se comprobó
ejecutándolo sobre un ticket de prueba en un repositorio aislado.

#### Tablas de transición autoritativas

**`TICKET_TRANSITIONS` — 10 orígenes, 11 transiciones**

```
intake               -> analyzed
analyzed             -> planned
planned              -> approved
approved             -> in_progress
in_progress          -> awaiting_user_tests
awaiting_user_tests  -> in_qa                 ← única salida
in_qa                -> changes_requested | qa_approved
changes_requested    -> in_progress
qa_approved          -> closed
closed               -> changes_requested
```

**`POINT_TRANSITIONS` — 9 estados, con los 3 terminales como salida de escape**

```
open              -> analyzed | not_reproducible | deferred | duplicate
analyzed          -> in_progress | not_reproducible | deferred | duplicate
in_progress       -> awaiting_retest | not_reproducible | deferred | duplicate
awaiting_retest   -> verified | not_reproducible | deferred | duplicate
verified          -> closed
closed            -> (terminal)      not_reproducible -> (terminal)
deferred          -> (terminal)      duplicate          -> (terminal)
```

**`RELEASE_TRANSITIONS` — 4 estados**

```
unreleased     -> planned | not_applicable
planned        -> released
released       -> (terminal)
not_applicable -> (terminal)
```

#### Los enums: cuáles están guardados y cuál no

| Constante | Valores | ¿Validado? |
|---|---|---|
| `TICKET_TYPES` | FEATURE, BUGFIX, IMPROVEMENT, SYNC, INTEGRATION, AGENT, SECURITY, CLAUDIO | **Sí** |
| `RISK_LEVELS` | low, normal, high, critical | **Sí** |
| `WORKFLOW_STATES` | 10 estados | **Sí** |
| `QA_STATES` | pending, in_qa, approved, waived | **Sí** |
| `RELEASE_STATES` | not_applicable, unreleased, planned, released | **Sí** |
| `POINT_STATES` | 9 estados | **Sí** |
| `severity` de punto | low, normal, high, critical | **Sí** — `severity no pertenece al esquema` |
| `result` de retest | — | **Sí** |
| **`evidence.kind`** | — | **NO** — solo `validate_text()`, un string no vacío |

**Ahí está la causa raíz exacta de los 30 valores de `evidence.kind`.** No fue descuido de
los operadores ni del agente: **el validador nunca miró ese campo**. Todos los demás enums del
esquema están guardados; ese no. La deriva no fue un fallo de disciplina, fue un hueco.

#### Comprobación empírica

Ejecutado sobre un ticket de prueba en un repositorio aislado:

| Prueba | Resultado | Código de salida |
|---|---|---|
| `transition --entity ticket --to closed` desde `intake` | `Transición de ticket intake -> closed no permitida.` | 3 |
| `transition --entity ticket --to qa_approved` desde `analyzed` | `Transición de ticket analyzed -> qa_approved no permitida.` | 3 |
| `transition --entity ticket --to pepe` (estado inventado) | `Transición de ticket intake -> pepe no permitida.` | 3 |
| `transition --entity point --to closed` desde `open` | `Transición de punto open -> closed no permitida.` | 3 |
| `add-point --severity gravisimo` | `severity no pertenece al esquema.` | 2 |
| **`add-evidence --kind pepito_el_kind`** | **ACEPTADO** | 0 |
| `transition --to planned` con plan vacío | `No se puede marcar planned con placeholders o un plan vacío.` | 3 |

**El validador es real y estricto.** No es documentación decorativa: rechaza saltos de fase,
estados inventados, severidades fuera del esquema, y **planes vacíos o con placeholders**.

Esa última es notable: un agente no puede marcar un ticket como `planned` si el plan tiene
`<!-- Preservar… -->` o un cuerpo vacío. Es un gate mecánico que ya funciona hoy y que el
harness hereda tal cual.

#### Niveles de salida (contrato para el test de equivalencia)

El CLI usa **cinco** códigos de salida, no tres como estimé en la primera pasada. La
reimplementación debe replicarlos todos:

| Código | Constante | Significado | Ejemplo |
|---|---|---|---|
| `0` | — | Éxito | transición aplicada |
| `2` | `EXIT_SCHEMA` | Entrada inválida | `severity` fuera del esquema, ruta inexistente |
| `3` | `EXIT_INVARIANT` | **Invariante de estado violada** | transición no permitida, plan con placeholders (45 usos) |
| `4` | `EXIT_HISTORY` | Incoherencia histórica del registro | eventos sin punto de referencia |
| `5` | `EXIT_REFERENCE` | Referencia de artefacto inválida | `affected_files` inexistente, SHA mal formado |
| `6` | `EXIT_AMBIGUOUS` | Sujeto no identificable sin ambigüedad | `resume` con varios candidatos |

Distinguirlos permite que un script sepa si el usuario escribió mal (`2`), si el motor rechazó
una operación por contrato (`3`), o si hay que arreglar el registro (`4`).

**Dependencia no documentada que hay que replicar** (ver más abajo): `create` exige que exista
`docs/agentic/templates/ticket.template.md`.

#### Un detalle del contrato que se conserva aunque parezca un bug

El mensaje de error R5 del frontmatter dice literalmente **"en el orden del esquema 1"**,
incluso cuando el validador se amplíe al esquema 2. Y el primer mensaje del parser termina con
un **espacio final** antes del cierre de comilla:

```
"ticket.md debe iniciar con frontmatter restringido delimitado por ---. "
```

El espacio es parte del contrato: un test de equivalencia que compare mensajes byte a byte
falla si se "limpia". Se conserva a propósito, y se documenta para que nadie lo corrija por
descuido.

#### Dependencia no documentada que hay que replicar

`create` **exige que exista** `docs/agentic/templates/ticket.template.md`:

```python
template_path = root / "docs" / "agentic" / "templates" / "ticket.template.md"
ensure_secure_path(root, template_path)   # falla si no existe
```

Y el directorio `docs/tickets/<YYYY>/<TICKET-ID>/` **debe existir antes** de invocar `create`
— el CLI escribe en una ruta canónica que valida como preexistente. Ninguna de las dos cosas
está en `ticket-schema.md`.

**Consecuencia para la suite de equivalencia:** el fixture no es solo los 57 tickets. Hay que
copiar también la plantilla y respetar la precreación de directorios, o el test falla por una
razón que no tiene nada que ver con la lógica que se quiere verificar. Ya está resuelto en
`tests/fixtures/saicloud/`.

#### Corrección que me hice a mí mismo

Mi diseño afirmaba que existía la transición `awaiting_user_tests → changes_requested`. **No
existe.** `awaiting_user_tests` tiene una única salida: `in_qa`.

Eso significa que la ausencia de esa transición en los datos **no es un hueco** — es el
diseño. El PO no puede devolver un ticket directamente a cambios: si encuentra un problema
durante sus pruebas, el flujo pasa a QA, y es QA quien devuelve con hallazgo. Es una decisión
deliberada de tu parte, y mi diseño la estaba contradiciendo al proponer estados `blocked`
adicionales sin respetar esta restricción. Corregido.

### 2bis.2quater El hueco confirmado: 55 puntos quedaron en `verified`

Ahora con la causa raíz exacta, extraída del código:

```python
BLOCKING_POINT_STATES = {"open", "analyzed", "in_progress", "awaiting_retest"}
```

**`verified` no está en el conjunto, y eso es deliberado.** El código distingue
explícitamente entre "verificado" y "cerrado", y solo lo primero bloquea la aprobación de QA.
Así que un punto puede quedar verificado sin cerrarse y el ticket cierra igual.

Eso **no es un bug**: es una decisión de diseño coherente. El hueco es otro:

> **No existe ninguna regla que establezca qué pasa con los puntos `verified` al cerrar el
> ticket.** `verified → closed` existe como transición, y hay 81 cierres explícitos, pero 55
> puntos nunca la recibieron. Nada en el validador lo detecta, porque no es un error.

Un reporte de "puntos cerrados" da 81 cuando la realidad son 137 verificados. Es el mismo
patrón que `evidence.kind`: **un hueco en el contrato no da error, da un número equivocado.**

El harness lo resuelve con un check que obliga a decidirlo explícitamente al cerrar:

```yaml
# .valmen/gates/close.yaml
checks:
  - id: puntos_verified_al_cerrar
    kind: assert
    description: >
      Al cerrar un ticket no deben quedar puntos en `verified`: o se cierran,
      o el cierre documenta por qué quedan abiertos.
    expr: >
      all(p.status != 'verified' for p in ticket.points)
      or 'puntos verified:' in ticket.sections.Cierre.body
    on_failure: review        # no bloquea: obliga a decidir explícitamente
```

Y la decisión sobre los 55 históricos es de `valmen adopt`, no del motor.

### 2bis.2quinquies La reconciliación cuadra

Vale la pena dejarlo escrito, porque es la prueba de que el contrato verificado es correcto.
Cada número tiene su explicación, sin residuos:

**Release**

| Comprobación | Resultado |
|---|---|
| Tickets con `release_status: released` | 51 |
| Transiciones `unreleased -> planned` | 50 |
| Transiciones `planned -> released` | 51 |
| Tickets con `release_status: unreleased` | 6 |
| **Cuadra** | 51 + 6 = 57 ✓ · los 51 `released` finales coinciden exactamente con las 51 transiciones `planned -> released` ✓ |
| **Explicación de 50 vs 51** | Un ticket entró a `planned` sin evento registrado (transición anterior al uso del CLI en ese flujo). No afecta la reconciliación, porque lo que se cuenta son los estados finales |

**Ticket**

| Comprobación | Resultado |
|---|---|
| Transiciones `qa_approved -> closed` | 60 |
| Eventos `close-attempted` | 61 |
| Transiciones `closed -> changes_requested` | 3 |
| Tickets finalmente `closed` | 57 |
| **Cuadra** | 57 + 3 reaperturas = 60 cierres efectivos ✓ |
| **Residuo** | 61 intentos − 60 cierres = **1 intento sin cierre**, coherente con el único ticket que se cerró, se reabrió y se volvió a cerrar |

**Point**

| Comprobación | Resultado |
|---|---|
| Puntos agregados | 137 |
| Estados finales | 81 `closed` + 55 `verified` + 1 `deferred` = **137** ✓ |

**Todo cuadra.** Ese es el nivel con el que se escribe el test de equivalencia: no *"los 57
validan"*, sino *"las 530 transiciones de ticket, 491 de punto y 101 de release se reproducen
exactamente, y cualquier residuo es un hallazgo"*.

Y los dos residuos que aparecieron —el intento de cierre sin cerrar y los 55 puntos
`verified`— **son** hallazgos reales, ya documentados en §2bis.2quater. El ejercicio de
reconciliación no fue un formalismo: encontró dos cosas que el contrato no cubre.

## 2ter. Contradicción que encontré en mi propio diseño: el vocabulario es de conjunto cerrado

El diseño propone añadir dos tipos de ticket (`CHORE`, `DOCS`) y un estado (`blocked`). Al
leer el validador, resulta que **hoy eso es imposible**:

```python
TICKET_TYPES = { "FEATURE", "BUGFIX", "IMPROVEMENT", "SYNC",
                 "INTEGRATION", "AGENT", "SECURITY", "CLAUDIO" }   # conjunto cerrado

TICKET_TRANSITIONS = { ... }        # mapa cerrado, sin `blocked` como destino
```

Un ticket `CHORE-...` sería rechazado con `--type no es permitido o no coincide con el ID.`
Y `transition --to blocked` sería rechazado con `Transición de ticket X -> blocked no
permitida.`

**Y el campo `schema_version` está hardcodeado a `1`:**

```python
if fields["schema_version"] != "1":
    fail("schema_version debe ser el entero literal 1.")
```

El diseño decía "se conserva `schema_version`" pero no explicaba cómo convive con añadir
vocabulario nuevo. **Eso era una contradicción sin resolver**, y la habría encontrado en la
Fase 1 con el diseño ya aprobado.

### La resolución: v1 congelado + v2 opt-in

El campo `schema_version` ya existe y el validador ya lo rechaza si no es `1`. Eso da el
mecanismo de escape limpio, sin inventar nada:

| | **Schema v1** | **Schema v2** |
|---|---|---|
| Aplica a | Los 57 tickets existentes y todo ticket empezado antes de la adopción | Tickets nuevos, creados con el harness |
| Tipos | Los 8 actuales | Los 8 + `CHORE` + `DOCS` |
| Estados | Los 10 actuales | Los 10 + `blocked` |
| Vocabulario cerrado en | `.valmen/config.yaml` → `schema.v1.*` | `.valmen/config.yaml` → `schema.v2.*` |
| Escrito por | El CLI Python (coexistencia) o `valmen` | Solo `valmen` |
| Regla | **Inmutable. Nunca se reescribe.** | Evoluciona con la configuración |

```yaml
# .valmen/config.yaml
schema:
  v1:
    frozen: true                     # inmutable; los 57 tickets no se tocan
    types: [FEATURE, BUGFIX, IMPROVEMENT, SYNC, INTEGRATION, AGENT, SECURITY, CLAUDIO]
    states: { ticket: [...], point: [...], release: [...] }
  v2:
    default_for: new                 # los tickets nuevos nacen en v2
    types: [ ...v1, CHORE, DOCS ]
    states:
      ticket: { ...v1, blocked: { exits: [analyzed, planned, approved, in_progress] } }
```

**La regla de integridad, que es lo importante:**

> `valmen` valida según la versión declarada en cada ticket y **jamás escribe v2 en un ticket
> v1**. Migrar un ticket a v2 es una operación explícita, por ticket, con su propio recibo.

### Por qué esto es mejor que "solo añadir los tipos"

Tres razones concretas:

1. **El test de equivalencia de la Fase 1 sigue siendo verificable.** Con v1 congelado, la
   suite compara `valmen` contra `ticket.py` sobre los 57 tickets y ambos deben aceptar y
   rechazar exactamente lo mismo. Si `valmen` añadiera `CHORE` al conjunto, la suite tendría
   que distinguir "diferencia esperada" de "bug", y ahí es donde los tests se vuelven
   mentira.

2. **`ticket.py` sigue funcionando durante la coexistencia.** Si `valmen` empezara a escribir
   tickets con `schema_version: 2` o tipos nuevos, el CLI de Python los rechazaría y el modo
   coexistencia se rompería el primer día. v1 congelado es lo que hace posible la transición
   sin disrupción.

3. **La evolución queda versionada de verdad.** El día que haga falta v3, el mecanismo ya
   existe y está probado. Y el historial muestra qué vocabulario se usó en cada época.

### Coste, dicho con honestidad

`CHORE` y `DOCS` no estarán disponibles en los tickets que ya existen (no se pueden cambiar
de tipo), y `blocked` tampoco. En la práctica no importa: los 57 están cerrados. Pero implica
que el harness mantiene **dos conjuntos de reglas en paralelo**, y eso es complejidad real.
La alternativa —migrar los 57 tickets a v2— es peor: reescribiría 1.851 eventos históricos y
rompería la trazabilidad que es justamente el activo del sistema.

**Decisión propuesta:** v1 congelado + v2 para tickets nuevos. Si prefieres la simplicidad de
un solo esquema, la alternativa honesta es **no añadir `CHORE`, `DOCS` ni `blocked`** y
resolver el trabajo interno con los 8 tipos actuales usando `IMPROVEMENT` para chores. Es una
pérdida menor de expresividad a cambio de no mantener dos vocabularios.

Está en [`11-OPEN-QUESTIONS.md`](11-OPEN-QUESTIONS.md) como Q16.

---


El esquema documenta `kind` como string libre. El resultado real, sobre 177 entradas:

```
30 valores distintos, de los cuales estos son la MISMA cosa:
  test automatizado:   automated×58 · automated_test×15 · test×12 · automated-test×4 · automated-build×1
  revisión de código:  code×10 · code-inspection×4 · source_review×2 · source-review×1 · review×2 · source_diagnosis×1
  validación usuario:  user-report×2 · user-validation×1 · user-test×1 · user-validation-reference-correction×1 · manual_report×1
  build/despliegue:    build×17 · build_verification×2 · workflow_run×3 · dry-run×1 · canary×1 · infrastructure-readonly×1
  → 8 valores más quedan fuera de cualquier agrupación
```

Con `automated`, `automated_test`, `automated-test` y `test` coexistiendo, cualquier reporte
que agrupe por `kind` da un resultado **silenciosamente incorrecto**. No hay error ni alerta:
el número simplemente está mal.

**Este es el mejor argumento del proyecto, y salió de tus propios datos.** Un campo de texto
libre en un contrato que se supone mecánico deriva. El harness lo resuelve con un enum
cerrado más una vía de escape explícita:

```yaml
# .valmen/config.yaml
evidence:
  kinds:                       # enum cerrado, validado mecánicamente
    - automated-test
    - manual-test
    - code-inspection
    - build
    - deployment
    - user-report
    - runtime-log
    - static-analysis
  allow_custom: true           # permitido, pero con prefijo y justificación
  custom_pattern: '^x-[a-z0-9-]+$'
```

Y una migración **opcional y no destructiva** de los 30 valores históricos a los 8 del enum,
propuesta por `valmen adopt` y aprobada por ti. Los archivos no se reescriben sin tu visto
bueno.

### 2bis.3 Hallazgo: el vocabulario de `evidence.kind` divergió

El esquema documenta `kind` como string libre. El resultado real, sobre 177 entradas:

```
30 valores distintos, de los cuales estos son la MISMA cosa:
  test automatizado:   automated×58 · automated_test×15 · test×12 · automated-test×4 · automated-build×1
  revisión de código:  code×10 · code-inspection×4 · source_review×2 · source-review×1 · review×2 · source_diagnosis×1
  validación usuario:  user-report×2 · user-validation×1 · user-test×1 · user-validation-reference-correction×1 · manual_report×1
  build/despliegue:    build×17 · build_verification×2 · workflow_run×3 · dry-run×1 · canary×1 · infrastructure-readonly×1
  → 8 valores más quedan fuera de cualquier agrupación
```

**La causa raíz, confirmada en el código:** `evidence.kind` es **el único campo del esquema
sin validar**. Todos los demás enums están guardados; ese solo pasa por `validate_text()`, que
verifica que sea un string no vacío y nada más.

```python
# lo que SÍ se valida
if severity not in SEVERITIES: fail("severity no pertenece al esquema.")
if fields["workflow_status"] not in WORKFLOW_STATES: fail("workflow_status no pertenece al esquema.")
# lo que NO se valida
kind = validate_text(args.kind, "kind")     # ← un string cualquiera
```

Con `automated`, `automated_test`, `automated-test` y `test` coexistiendo, cualquier reporte
que agrupe por `kind` da un resultado **silenciosamente incorrecto**. No hay error ni alerta:
el número simplemente está mal.

**Este es el mejor argumento del proyecto, y salió de tus propios datos.** Un campo de texto
libre en un contrato que se supone mecánico deriva. El harness lo resuelve con un enum
cerrado más una vía de escape explícita:

```yaml
# .valmen/config.yaml
evidence:
  kinds:                       # enum cerrado, validado mecánicamente
    - automated-test
    - manual-test
    - code-inspection
    - build
    - deployment
    - user-report
    - runtime-log
    - static-analysis
  allow_custom: true           # permitido, pero con prefijo y justificación
  custom_pattern: '^x-[a-z0-9-]+$'
```

Y una migración **opcional y no destructiva** de los 30 valores históricos a los 8 del enum,
propuesta por `valmen adopt` y aprobada por ti. Los archivos no se reescriben sin tu visto
bueno.

### 2bis.4 Hallazgo: la trazabilidad de consumo de IA no se usa

`## Consumo de IA` está en el esquema desde el principio, con `CONSUMO-NNN` monótono y campos
de tokens, costo, modelo, esfuerzo, fuente y confianza. **En 57 tickets hay exactamente 1
entrada.**

No es un fallo de disciplina: es que el registro es **manual** y depende de que alguien se
acuerde y de que el agente reporte datos que no tiene. El esquema previó la honestidad del
caso (`confidence: low`, `source: "No disponible en Codex; registro manual del PO"`), y aun
así el campo quedó vacío.

Esto no invalida el esquema —lo hace más valioso— pero confirma que **un campo que depende de
que un humano lo llene no se llena**. Es exactamente lo que resuelve medir el consumo desde
el harness: cuando el motor es quien hace la llamada, el `usage.cost` viene en la respuesta y
el registro pasa de `confidence: low` a `high` **sin intervención humana**.

Es la diferencia entre un campo correcto y un campo útil.

## 3. Plan por fases

### Fase 1 — Equivalencia del motor de tickets (2–3 semanas)

**Objetivo:** `valmen` reemplaza a `ticket.py` sin que nada se rompa.

| # | Entregable | Criterio de aceptación |
|---|---|---|
| 1.1 | `@valmen/core` con el esquema de ticket | Los 57 tickets validan idéntico a `ticket.py` (línea base verificada: **57 válidos, exit 0**) |
| 1.2 | CLI `valmen ticket *` | Los 14 subcomandos de `ticket.py` existen y dan el mismo resultado |
| 1.3 | Parser de los 11 verbos de evento | Los **1.851** eventos: 1.848 con patrón estricto + los 3 de reapertura con regex tolerante y campo `reason` nuevo (§2bis.2) |
| 1.4 | Modo coexistencia | `ticket.py` sigue funcionando; ambos escriben el mismo formato |
| 1.5 | `valmen index` reconstruible | Borrar `state/`, reconstruir, `index.md` idéntico byte a byte |
| 1.6 | Tests de equivalencia | Suite que corre ambos CLI sobre los 57 tickets y compara. Cubre **1.851 eventos · 137 puntos · 166 ciclos QA · 177 evidencias · 137 retests · 61 cierres** |
| 1.7 | **Matriz de transiciones** | Reproduce exactamente las 11 transiciones de ticket, las 9 de punto y las 3 de release de `TICKET_TRANSITIONS` / `POINT_TRANSITIONS` / `RELEASE_TRANSITIONS`, y las 530 / 491 / 101 ejecuciones reales (§2bis.2bis y §2bis.2ter) |
| 1.8 | **Rechazo de entradas inválidas** | La suite verifica que se **rechaza** lo mismo: transiciones no permitidas, estados inventados, `severity` fuera del esquema, y plan vacío o con placeholders. Revisar solo los casos válidos no es equivalencia |
| 1.9 | **Códigos de salida** | `0` éxito · `2` entrada inválida · `3` invariante violada. Distinguirlos es parte del contrato: permite saber si el usuario escribió mal o si el motor rechazó por contrato |
| 1.10 | **Dependencias no documentadas** | El fixture incluye `docs/agentic/templates/ticket.template.md` y precrea `docs/tickets/<YYYY>/<ID>/`. Sin ambas, `create` falla por una razón ajena a la lógica bajo prueba |
| 1.11 | Reconciliación sin residuos | Todo conteo cuadra: puntos 81+55+1=137 · release 51+6=57 · cierres 57+3=60 de 61 intentos. Un residuo inesperado **falla el test** |
| 1.12 | Invariantes heredadas | `EVENT-NNN` monótono desde 001 sin huecos (0 excepciones hoy) · SHA de 40 chars · referencias `worktree:sha256:` |
| 1.13 | `valmen doctor` básico | Detecta: schema inválido, índice obsoleto, ticket inconsistente |

**Riesgo principal:** que el parser YAML restringido de Python y el de TS difieran en algún
caso borde. Mitigación: el test de equivalencia corre sobre los 57 tickets reales con sus
1.851 eventos, no sobre casos inventados.

**Segundo riesgo, ya identificado y acotado:** el estado de las transiciones vive **embebido
en el string `details`**, no en campos estructurados. El parser TS debe replicar los 11
formatos exactos (están tabulados en §2bis.2) y el contrato nuevo añade campos estructurados
para las transiciones futuras, **sin reescribir los 1.851 eventos históricos**. Los 3 casos
de reapertura son la prueba de que este riesgo es real: el CLI ya tuvo que meter texto libre
donde no había campo.

**Tercer riesgo, con evidencia:** `evidence.kind` ya divergió a 30 valores (§2bis.3). El
enum cerrado se introduce en la Fase 1, pero la migración de los valores históricos es
**opcional, no destructiva y aprobada por ti** — no automática.

**Qué NO se hace en la Fase 1:** nada de features, nada de gates automáticos, nada de web.
Solo equivalencia. Esto es lo que permite probarlo en producción sin arriesgar el flujo.

### Fase 2 — Adopción de la configuración (1–2 semanas)

**Objetivo:** `.valmen/` es la fuente de verdad; `AGENTS.md`, `.codex/` y `.opencode/` son
generados.

| # | Entregable | Criterio de aceptación |
|---|---|---|
| 2.1 | `valmen adopt --phase=config-only` | `.valmen/config.yaml` con las rutas reales del proyecto |
| 2.2 | `valmen adopt --phase=rules` | 41 reglas del proyecto extraídas a `.valmen/rules/`, revisadas por ti |
| 2.3 | Adaptadores codex + opencode + generic | `valmen sync` reproduce los 12 agentes en ambos formatos |
| 2.4 | `valmen sync --check` en CI | Falla si un archivo generado fue editado a mano |
| 2.5 | Migración de skills | Las 13 skills en `.valmen/skills/`, enlazadas a los 3 agentes |
| 2.6 | Reducción de `AGENTS.md` | Pasa de 94 líneas acopladas a secciones generadas con presupuesto |

**Punto crítico:** la regla "la creación de tickets es bajo demanda del PO" debe decidirse
explícitamente: ¿es política del proyecto o del harness? (la sección 6 de
[`08-ADOPCION.md`](08-ADOPCION.md) lo plantea). Recomendación: **política del proyecto**,
porque es una decisión de gestión, no del motor.

**Qué NO se hace:** no se borra `.claude/`, no se toca `CLAUDE.md`, no se cambia el flujo.

### Fase 3 — Gates automáticos con Jev (1–2 semanas)

**Objetivo:** los gates de `analysis` y `plan` pasan de humanos a híbridos.

| # | Entregable | Criterio de aceptación |
|---|---|---|
| 3.1 | `@valmen/gate` + `@valmen/gate-jev` | Recibo generado con probabilidades y costo |
| 3.2 | Gate `intake` (auto) | 100% mecánico: hash de la solicitud, clasificación, impactos |
| 3.3 | Gate `analysis` (hybrid) | 6 proposiciones, umbral 0.90/0.10, escalado a humano |
| 3.4 | Gate `plan` (hybrid) | 7 proposiciones incluyendo el check de CodeGraph |
| 3.5 | `valmen gate simulate` sobre los últimos 30 tickets | Reporte de precisión vs. decisiones humanas pasadas |
| 3.6 | Checks mecánicos | `sync_impact` → exige las 3 menciones; riesgo alto → exige rollback; Admin vs Frontend |

**Criterio de éxito medible:** en la simulación sobre los últimos 30 tickets cerrados, el
gate automático coincide con la decisión humana en ≥90%, y **cero falsos aprobados** en
tickets con impacto crítico. Si no se cumple, el gate se queda en `human` y se recalibran
las proposiciones.

**Regla de seguridad:** `deploy`, `release`, `security`, `migration` y todo lo crítico
**siguen siendo humanos**. No se automatizan en esta fase ni en ninguna.

### Fase 4 — Mission Control (2–3 semanas)

| # | Entregable | Criterio de aceptación |
|---|---|---|
| 4.1 | `valmen serve` | App en `127.0.0.1:4173`, sin lógica de negocio, llamando al motor |
| 4.2 | Vistas: Mission Control, Tickets, Features | Estado en vivo por SSE |
| 4.3 | Vista de gate en revisión | Muestra el estado congelado y las probabilidades; aprobar/rechazar |
| 4.4 | Configuración editable | Formulario + texto crudo, diff antes de guardar |
| 4.5 | Proveedores y routing | Selección de modelo y esfuerzo por rol desde la UI |
| 4.6 | Chat de configuración | Propone change sets, nunca escribe directo |
| 4.7 | Reemplazo del `ticket_viewer.py` | El visor viejo se puede retirar |

**Criterio de éxito:** puedes operar un día completo de trabajo sin abrir la terminal ni
editar un archivo a mano.

### Fase 5 — Features grandes (2–3 semanas)

**Objetivo:** el módulo de inventario puede entrar en el sistema.

| # | Entregable | Criterio de aceptación |
|---|---|---|
| 5.1 | Entidad `feature` + spec con deltas | Spec de inventario con 14 requisitos RFC 2119 |
| 5.2 | Descomposición con modelo fuerte | Genera `tickets.yaml` con grafo y sprints |
| 5.3 | Gate de descomposición | Cero requisitos sin cobertura; cero ciclos |
| 5.4 | Gate de cobertura con Jev | Una verificación por requisito, ~$0.02 total |
| 5.5 | Seguimiento vivo | Agregar requisito, bug posterior, partir ticket |
| 5.6 | Procesos encadenables | `deploy` → `actualizar-manuales` funcionando |
| 5.7 | `migrate-tenant` y `manuales` como procesos | Con preflight, gates y rollback |

**Prueba de aceptación real:** tomar el módulo de inventario como piloto. Al terminar la
fase, debe estar especificado, descompuesto en tickets con sprints, y con al menos los dos
primeros tickets implementados y cerrados a través del harness.

### Fase 6 — Autonomía y memoria (continuo)

| # | Entregable | Estado |
|---|---|---|
| 6.1 | Memoria persistente: decisiones, errores, patrones aprendidos | **Hecho**, con la memoria y los estándares: búsqueda sobre `memory-sources`, `guardar_aprendizaje`, y la regla que se propone, se decide con las palabras de la persona y entra en vigor. Falta la captura pasiva (A5) con su cola de revisión |
| 6.2 | Puente de Hermes para control desde el celular | **Descartado por decisión del responsable** |
| 6.3 | Promoción automática de gates `hybrid` → `auto` por evidencia | **La evidencia, hecha**: `valmen usage` calibra cada compuerta contra el veredicto humano del ticket. Falta el acto de promover (hoy se edita la configuración con el número delante) |
| 6.4 | Modo headless: ejecución desatendida de tickets de bajo riesgo | **Falta**, y va al final a propósito: necesita el histórico de calibración que todavía no existe |
| 6.5 | Reportes diario/semanal generados del motor | **El contenido, hecho** (`valmen report`, `valmen usage`, el visor); falta la cadencia — nada los genera solo |
| 6.6 | Observabilidad: OTEL, dashboards de costo y acierto de gates | **La primera mitad, hecha**: consumo por compuerta y modelo, calibración real, línea de tiempo por ticket con coste por sesión. Falta lo externo: trazas, series temporales, tableros |
| 6.7 | Extraer la plantilla `django-angular-multitenant` para otros proyectos | **La primera, hecha** (`valmen template`); faltan las demás de la lista de B6 |

## 4. Cronograma y esfuerzo

| Fase | Duración | Depende de | Riesgo |
|---|---|---|---|
| 1. Motor de tickets | 2–3 sem | — | Bajo (equivalencia verificable) |
| 2. Adopción y proyección | 1–2 sem | Fase 1 | Medio (111 reglas que revisar) |
| 3. Gates con Jev | 1–2 sem | Fase 2 | Medio (API alpha; calibración de proposiciones) |
| 4. Mission Control | 2–3 sem | Fase 2 (Fase 3 deseable) | Bajo |
| 5. Features grandes | 2–3 sem | Fases 1–3 | Medio (la descomposición es lo difícil) |
| 6. Autonomía | continuo | Fases 1–5 | — |

**Total hasta el final de la Fase 5: 8–13 semanas.** El punto en que ya reemplaza lo actual
es el final de la **Fase 2** (3–5 semanas): en ese momento `.valmen/` es la fuente de verdad
y `AGENTS.md` se genera. La Fase 4 (Mission Control) es cuando la experiencia de uso supera
lo que tienes hoy.

Puede solaparse: la Fase 4 (web) es independiente de la 3 (gates) y ambas pueden avanzar en
paralelo si hay más de una persona.

## 5. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El parser de tickets difiere de `ticket.py` en un caso borde | Media | Alto | Test de equivalencia sobre 57 tickets reales; modo coexistencia |
| Alguno de los 57 tickets tiene formato inválido no detectado | Media | Medio | `valmen validate --all` primero, en modo solo lectura |
| La API alpha de Jev cambia o se cae | Media | Medio | `on_evaluator_unavailable: review` (fail-closed) + seam intercambiable + smoke test diario |
| Las proposiciones de gate dan malas probabilidades | Alta al inicio | Medio | `valmen gate simulate` antes de activar; empezar en `hybrid`, nunca en `auto` |
| La adopción toca algo que no debía | Baja | Alto | Nada se borra, todo va a `legacy/`, sin commit automático, `--revert` |
| El equipo sigue editando `AGENTS.md` a mano | Alta | Medio | `valmen sync --check` en CI + cabecera de generado + `doctor` avisa |
| Exceso de maquinaria (el error de gentle-ai) | Media | Alto | Disciplina de alcance: 20 paquetes, no 200. Cada fase entrega valor por sí sola. |
| Costo de modelos mayor al presupuesto | Media | Medio | Presupuestos con corte duro, presets, `usage report` semanal |
| El flujo nuevo es más lento que el actual | Media | Alto | Cada fase se valida en producción antes de la siguiente; el modo directo sigue existiendo |

## 6. Qué se conserva exactamente y qué cambia

### Se conserva sin cambios

- Los 57 tickets y su formato de archivo.
- `docs/tickets/YYYY/<ID>/ticket.md` como ruta canónica.
- Los estados, subestados y reglas de transición.
- `POINT-NNN` inmutable, append-only, máximo 20.
- La regla de las tres máquinas de estado separadas.
- La prohibición de `completed`.
- La confirmación del PO antes de commit/push.
- La frase literal para el deploy.
- Las reglas del proyecto (multi-tenancy, OfflineSync, Admin vs Frontend).
- El modo directo para trabajo sin registro.
- Toda la documentación de `docs/`.
- `scripts/`, `buildspecs`, workflows de CI, Docker.

### Cambia

| Antes | Después | Por qué |
|---|---|---|
| `AGENTS.md` editado a mano | Generado por `valmen sync` | Elimina la divergencia |
| 12 agentes en 2 formatos | 1 fuente, 2 proyecciones | Elimina la duplicación |
| Sin entidad "feature" | `features/` con spec y descomposición | Permite el trabajo grande |
| Gates 100% humanos | Híbridos donde el riesgo lo permite | Elimina el cuello de botella |
| `## Consumo de IA` manual | Medido automáticamente | Pasa de `confidence: low` a `high` |
| `ticket_viewer.py` local | Mission Control | Más capacidad, misma superficie |
| Deploy como skill de 101 líneas | Proceso con pasos, gates y encadenamiento | Ejecutable, no releíble |
| `PROCESO-MANUALES.md` de 200+ líneas | Skill + proceso + gate | Se ejecuta en vez de releerse |

## 7. Cómo se verifica que la migración funcionó

Métricas concretas, medidas antes y después:

| Métrica | Hoy | Objetivo tras Fase 5 |
|---|---|---|
| Archivos de config agéntica editados a mano por cambio de stack | 3 (AGENTS.md, .codex, .opencode) | **0** (solo `.valmen/rules/stack.md`) |
| Tiempo de migrar la config a otro agente | ~1 día | **~1 minuto** (`valmen sync`) |
| Gates que requieren intervención humana por ticket | ~4 de 4 | ~1 de 4 (solo QA y cierre) |
| Costo de un gate de plan | $0 ($0 si humano, tiempo) o infinito (no existe) | **$0.0003** |
| Tiempo de análisis de un ticket | 20–40 min de agente caro | 10–15 min (grafo + modelo barato) |
| Tickets que puede manejar una feature | 1 | Ilimitados, con grafo y sprints |
| Trazabilidad de costo por ticket | Manual, `confidence: low` | Automática, `confidence: high` |
| Detección de config desactualizada | Manual | `valmen doctor` en CI |
