# 02 — El motor: tickets, features y procesos

## 1. Herencia directa del esquema de SaiOpenCloud

El esquema de tickets que ya corre en SaiOpenCloud es el activo más valioso del flujo
actual. Tiene decisiones de diseño que se conservan **tal cual** porque resolvieron
problemas reales:

| Decisión heredada | Por qué se conserva |
|---|---|
| Frontmatter YAML **restringido** (una clave por línea, escalares, sin anclas) | El CLI usa solo la stdlib de Python y no puede fallar por una construcción YAML inesperada. En TS se conserva como Zod estricto. |
| Bloques JSON *fenced* append-only para Puntos, QA, Evidencia, Retests, Cierre, Consumo, Eventos | El agente puede añadir, nunca reescribir. Es la garantía de auditoría. |
| `POINT-NNN` inmutable y monótono, máximo 20 por funcionalidad | Una lista de hallazgos no se convierte en tickets nuevos ni pierde su historia. |
| Tres máquinas de estado **separadas**: ticket (`workflow_status`), hallazgo (`point.status`), publicación (`release_status`) | Evita el estado ambiguo. Confundir "cerrado" con "publicado" es el error clásico. |
| No existe el estado `completed` | Es ambiguo. Se usan estados con salida obligatoria verificable. |
| `approved` siempre se conserva aunque el gate no fuera exigible | Si no era exigible, el plan registra la razón. Nunca se salta el registro. |
| SHA de 40 caracteres o `worktree:sha256:<hash>` como referencia de build | Referencia inmutable al artefacto probado. |
| Reapertura `closed → changes_requested` solo si `unreleased` | Un bug posterior a la release es un ticket nuevo con `related_ticket`, no una reapertura. |

## 2. Tipos de trabajo

Se generalizan los tipos de SaiOpenCloud y se añaden dos que hoy no existen:

```yaml
types:
  FEATURE:      { label: Funcionalidad,   plan_gate: always,   qa: required }
  BUGFIX:       { label: Corrección,      plan_gate: proportional, qa: required }
  IMPROVEMENT:  { label: Mejora,          plan_gate: if_architectural, qa: required }
  SYNC:         { label: Sincronización,  plan_gate: always,   qa: required, critical: true }
  INTEGRATION:  { label: Integración,     plan_gate: always,   qa: required, critical: true }
  AGENT:        { label: Agente local,    plan_gate: always,   qa: required, critical: true }
  SECURITY:     { label: Seguridad,       plan_gate: always,   qa: required, critical: true }
  CHORE:        { label: Mantenimiento,   plan_gate: never,    qa: waived_ok }   # NUEVO
  DOCS:         { label: Documentación,   plan_gate: never,    qa: waived_ok }   # NUEVO
```

`CHORE` y `DOCS` cubren trabajo interno del harness o documentación, que hoy se atiende en
modo directo y por eso no queda registrado en ningún lado.

> ⚠ **Dependencia crítica de esquema.** El validador actual define `TICKET_TYPES` como un
> conjunto **cerrado** y exige `schema_version: 1` de forma literal. Añadir estos dos tipos (y
> el estado `blocked`) requiere **schema v2, opt-in, sin tocar los 57 tickets existentes**.
> Está desarrollado en [`09-MIGRACION-SAICLOUD.md` §2ter](09-MIGRACION-SAICLOUD.md) y es la
> decisión **Q16** de [`11-OPEN-QUESTIONS.md`](11-OPEN-QUESTIONS.md).
>
> Regla de integridad: `valmen` valida según la versión declarada en cada ticket y **jamás
> escribe v2 en un ticket v1**. Si decides no mantener dos vocabularios, la alternativa es no
> añadir nada y usar `IMPROVEMENT` para el trabajo interno.

## 3. Máquinas de estado

### 3.1 Ticket

Se conserva la de SaiOpenCloud, con una adición: **`blocked`**, que hoy no existe y obliga a
usar `changes_requested` para cosas que no son cambios.

```
ticket:  intake → analyzed → planned → approved → in_progress
                 ↘ blocked ──────────────────────↗
         → awaiting_user_tests → in_qa ─┬→ changes_requested → in_progress ↗
                                       └→ qa_approved → closed
                                                          ↘ changes_requested
                                                            (solo unreleased)
```

Verificado contra `TICKET_TRANSITIONS` de `ticket.py` (11 transiciones):
`awaiting_user_tests` tiene **una única salida, `in_qa`**. El PO no devuelve un ticket
directamente a cambios: registra el hallazgo como punto y el flujo pasa a QA, que es quien
devuelve con `changes_requested`. Es una decisión deliberada del contrato actual y se
conserva.

```yaml
addition:
  blocked:
    meaning: "Hay una dependencia externa o una decisión pendiente que impide avanzar."
    requires: "blocked_reason no vacío + next_action"
    exits: [analyzed, planned, approved, in_progress]
    schema: v2        # NO existe en v1: el mapa de transiciones actual es cerrado
```

### 3.2 Punto (`POINT-NNN`)

Idéntica a SaiOpenCloud. Sin cambios.

```
point: open → analyzed → in_progress → awaiting_retest → verified → closed
       ↘ not_reproducible | deferred | duplicate   (requieren motivo)
```

### 3.3 Release

Idéntica a SaiOpenCloud. Sin cambios.

```
release: not_applicable | unreleased → planned → released
```

### 3.4 Feature (NUEVO)

La entidad que hoy no existe y que bloquea el trabajo grande.

```
feature: draft → specified → planned → decomposed → in_progress
                ↘ blocked ──────────────────────────↗
         → complete → archived
```

| Estado | Significa | Salida obligatoria |
|---|---|---|
| `draft` | Existe el brief, sin spec. | Objetivo, alcance, problema, restricciones. |
| `specified` | Spec por dominio con requisitos RFC 2119 y escenarios. | `spec/<dominio>/spec.md` completo. |
| `planned` | Design técnico y criterios de aceptación globales. | `design.md` con alternativas y decisión. |
| `decomposed` | Existe el grafo de tickets con dependencias y cobertura. | `tickets.yaml` + validación spec→tickets sin huecos. |
| `in_progress` | Al menos un ticket hijo está en ejecución. | Derivado del estado de los hijos. |
| `complete` | Todos los tickets hijos cerrados y la spec verificada. | `verify.md` con evidencia. |
| `archived` | Specs compuestas en `specs/` y feature movida a `archive/`. | `diff -r` vacío en la composición. |

**Regla dura:** una feature no entra a `decomposed` si algún requisito de la spec no está
cubierto por al menos un ticket. Es un check mecánico, no una revisión.

## 4. Los tres modos de trabajo

### 4.1 Modo directo (sin registro)

Consultas, diagnósticos, exploración, cambios visuales o de contenido que no alteran
funcionalidad, prototipos desechables, y **cambios de la propia configuración del harness**.

El modo directo **no relaja los gates de impacto**. Si el cambio toca sync, migraciones,
docker, autenticación o despliegue, se exige ticket, plan aprobado y gate humano, aunque
el pedido haya sido "cámbiame este texto".

### 4.2 Ticket (ODD — trabajo acotado)

Un solo archivo canónico. Pipeline corto:

```
intake ──▶ analyze ──▶ plan ──▶[GATE]──▶ implement ──▶ verify ──▶ review ──▶ close
  │           │          │                 │             │           │
  │           │          │                 │             │           └─ recibo de cierre
  │           │          │                 │             └─ pruebas + evidencia
  │           │          │                 └─ archivos + SHA de commits
  │           │          └─ pasos, criterios, rollback
  │           └─ archivos, causa raíz, riesgos
  └─ solicitud original preservada literalmente
```

Protocolo de 7 pasos que el agente debe seguir **en orden** en cada turno (adaptado de ODD
de gentle-ai, que resolvió el problema de agentes que editan cuando se les pidió analizar):

1. **Autorizar.** ¿El pedido autoriza explícitamente un cambio? Investigar, explicar,
   revisar, auditar, comparar y proponer son *read-only*.
2. **Explorar** el código existente de forma proporcional al pedido.
3. **Resolver incertidumbre.** Preguntar al usuario **una** cosa enfocada, solo si hay una
   decisión de producto real sin resolver.
4. **Clasificar.** Trivial → modo directo. Acotado → ticket. Grande → feature.
5. **Registrar antes de escribir.** El ticket se crea *antes* del primer cambio de código,
   sin pedir permiso para registrarlo.
6. **Implementar tarea por tarea**, cerrando cada una con un commit-unidad y evidencia.
7. **Cerrar** reportando el resultado verificado, cada check fallido/omitido/pendiente, y
   el siguiente paso.

### 4.3 Feature (SDD — trabajo grande)

Pipeline completo, con artefactos formales:

```
brief ─▶ probe ─▶ specify ─▶ design ─▶ tasks ─▶[GATE]─▶ decompose ─▶[GATE]─▶
        (opcional)                                   execution
                                                       │
   ┌───────────────────────────────────────────────────┘
   ▼
implement (N tickets en paralelo/secuencia según grafo) ─▶ verify ─▶ archive
```

**Deltas de spec** (lo mejor de SDD de gentle-ai, simplificado):

```markdown
# spec/inventario/spec.md — delta del cambio "modulo-inventario"

## ADDED Requirements

### Requirement: Registro de movimientos de inventario
El sistema MUST registrar cada entrada, salida y ajuste de inventario con
fecha, usuario, sucursal, producto, cantidad y motivo.

#### Scenario: Entrada por compra
- GIVEN un producto existente en la sucursal activa
- WHEN se registra una entrada de 10 unidades con motivo "compra"
- THEN el saldo del producto aumenta en 10
- AND queda un movimiento con el usuario y la fecha

## MODIFIED Requirements
### Requirement: Saldo de producto
(se copia el bloque COMPLETO del requisito original + todos sus escenarios,
 porque el archive reemplaza el bloque entero)

## REMOVED Requirements
### Requirement: Ajuste manual sin autorización
(Reason: reemplazado por el flujo de aprobación de ajustes)
```

Reglas de forma, tomadas de SDD de gentle-ai porque previenen bugs reales de composición:

- Requisitos con **RFC 2119** (MUST / SHALL / SHOULD / MAY).
- Escenarios con **GIVEN / WHEN / THEN / AND**.
- `MODIFIED` **debe copiar el bloque completo**. `REMOVED` exige `(Reason: …)`.
- La composición de specs al archivar es **mecánica** (aplicar
  `RENAMED → MODIFIED → REMOVED → ADDED`), nunca por LLM.

## 5. Descomposición: de feature a tickets

El paso que resuelve tu caso de "módulo de inventario con muchas pantallas". Lo ejecuta un
modelo de razonamiento fuerte (K3 / Opus / GPT-Sol según routing), no el modelo barato.

**Entrada:** `spec/` + `design.md`.
**Salida:** `tickets.yaml` con el grafo.

```yaml
feature: modulo-inventario
generated_by: { provider: openrouter, model: anthropic/claude-opus-4.6, cost_usd: 1.84 }
sprints:
  - id: S1
    goal: "Modelo de datos y API de movimientos"
    tickets: [FEATURE-INVENTARIO-MODELO-20260921, FEATURE-INVENTARIO-API-20260921]
  - id: S2
    goal: "Pantallas de consulta"
    tickets: [FEATURE-INVENTARIO-PANTALLA-SALDOS-20260921]
  - id: S3
    goal: "Reportes y exportables"
    tickets: [FEATURE-INVENTARIO-REPORTES-20260921]
coverage:
  - requirement: "Registro de movimientos de inventario"
    covered_by: [FEATURE-INVENTARIO-MODELO-20260921, FEATURE-INVENTARIO-API-20260921]
  - requirement: "Aprobación de ajustes"
    covered_by: [FEATURE-INVENTARIO-API-20260921]
gaps: []          # debe estar vacío para pasar el gate de descomposición
```

### La compuerta de descomposición (gate épico)

Tres validaciones, en este orden, y **ninguna la hace el mismo modelo que descompuso**:

1. **Mecánica (código).** Cero requisitos sin cobertura. Cero ciclos en el grafo de
   dependencias. Cada ticket hijo con `type`, `module` y `risk_level`. Máximo de archivos
   estimado por ticket dentro del presupuesto de revisión.
2. **Cobertura semántica (Jev).** Preguntas booleanas por requisito: *"¿el ticket X
   implementa el requisito Y de la spec?"* Probabilidad ≥ 0.9 aprueba, ≤ 0.1 bloquea, el
   resto va a revisión humana. Barato: ~$0.0001 por requisito.
3. **Suficiencia del plan (Jev).** Preguntas sobre el plan del ticket: *"¿el plan cubre
   todos los pasos del requisito?"*, *"¿el plan identifica los archivos que debe tocar?"*,
   *"¿el plan incluye rollback si el impacto es crítico?"*.

Si la compuerta 2 o 3 deja huecos, el sistema **no adivina**: devuelve los requisitos sin
cobertura al modelo descomponedor con feedback y permite **exactamente un reintento
correctivo**. Segundo fallo → para y reporta al humano. (Patrón gatekeeper de gentle-ai.)

## 6. Seguimiento vivo de una feature

Una feature no es un plan congelado. Cambia durante la ejecución, y el sistema debe
absorberlo sin perder historia:

| Evento durante la ejecución | Cómo lo maneja el motor |
|---|---|
| Faltó un requisito | `valmen feature amend <slug>` → nuevo requisito en la spec (delta `ADDED`), gate de cobertura re-evaluado, y si hace falta, un ticket nuevo al sprint activo. |
| Bug causado por un ticket ya cerrado | **Ticket nuevo** `BUGFIX` con `related_ticket` al original y `feature` apuntando a la feature. El original **no se reabre** (regla de SaiOpenCloud: una release publicada es inmutable). |
| Un ticket resultó mucho más grande | Se parte: `valmen ticket split <id> --into A,B`. El original pasa a `deferred` con motivo y los nuevos heredan `point`s y contexto. |
| Un ticket no depende de otro | Se corrige el grafo con `valmen feature unlink` y se recalcula el sprint. |
| Cambió el alcance de la feature | `valmen feature amend --scope` → nueva versión de spec; los tickets ya cerrados se conservan como están. |

El estado general de la feature se **deriva** de los hijos, no se escribe a mano:

```
modulo-inventario   in_progress   S1 ████████░░ 2/2   S2 ███░░░░░░░ 1/3   S3 ░░░░░░░░░░ 0/1
spec: 14 requisitos · cubiertos 14 · verificados 9 · gaps 0
costo: $4.12 (descomposición $1.84 + ejecución $2.28)   tickets: 6/6 abiertos 2 cerrados 4
```

## 7. Procesos: pasos encadenables

Tu pedido concreto: *"en el deploy agregar la herramienta de actualizar los manuales y que
ya cuando se llame el deploy haga ese punto"*.

Un **proceso** es un paso a paso declarativo, encadenable y con gates.

```yaml
# .valmen/processes/deploy.yaml
id: deploy
title: Despliegue de release a producción
description: Promoción dev → production con dry-run obligatorio y aprobación literal.

params:
  version: { type: string, required: true, pattern: '^\d+\.\d+\.\d+$' }
  tickets: { type: string, required: true }

steps:
  - id: preflight
    title: Dry-run obligatorio
    kind: command
    run: git log --oneline production..dev
    evidence: [stdout]
    on_failure: abort

  - id: version-check
    title: Validar SemVer y manifest
    kind: check
    check: .valmen/gates/_checks/version-manifest.sh
    on_failure: abort

  - id: gate-deploy
    title: Aprobación final del PO
    kind: gate
    gate: deploy
    # gate humano con frase literal: "APROBAR DEPLOY v{version}"
    on_failure: abort

  - id: tag
    title: Crear tag anotado sobre production
    kind: command
    run: git tag -a v{version} -m "Release v{version}"
    on_failure: abort

  - id: publish
    title: Publicar tickets de la release
    kind: command
    run: valmen release publish --version {version} --tickets {tickets}

  # ── AQUÍ ESTÁ TU PEDIDO: encadenar procesos ──
  - id: manuals
    title: Actualizar manuales de usuario final
    kind: process
    process: actualizar-manuales
    params: { scope: "modulos afectados por {tickets}" }
    continue_on_failure: true     # los manuales no bloquean la release
    notify_on_failure: true

  - id: post-release
    title: Registrar release y notificar
    kind: process
    process: notificar-release
    params: { version: "{version}" }

on_success:
  run_process: [actualizar-contexto, generar-changelog]
```

```yaml
# .valmen/processes/actualizar-manuales.yaml
id: actualizar-manuales
title: Actualizar manuales de usuario final
description: >
  Sigue docs/manuales/usuario-final/PROCESO-MANUALES.md. El código real siempre manda:
  leer el .component.ts y el .html completos antes de escribir una línea.

inputs:
  - docs/manuales/usuario-final/PROCESO-MANUALES.md
  - docs/manuales/usuario-final/decision-*.md

steps:
  - id: detectar-pantallas
    title: Detectar pantallas nuevas o modificadas
    kind: agent
    agent: manual-writer
    model_role: implementation          # modelo barato basta
    instructions: >
      Para cada pantalla afectada, localizar el .component.ts y el .component.html.
      Si comparten componente entre módulos, leer ambos contextos de uso.

  - id: escribir
    title: Escribir o corregir los manuales
    kind: agent
    agent: manual-writer
    parallel_by: modulo                # un agente por módulo, en paralelo

  - id: auditar
    title: Auditar contra el código real
    kind: agent
    agent: documentation-reality-checker
    model_role: verification           # modelo de verificación, no el que escribió
    rule: "Nunca aprueba sin cita textual del código como evidencia."

  - id: gate-manuales
    title: Validación de los manuales
    kind: gate
    gate: manuals

  - id: pdf
    title: Regenerar exportables PDF
    kind: command
    run: docs/manuales/usuario-final/scripts/generar-pdf.sh

produces: [docs/manuales/usuario-final/**]
```

### El paso de agente: el harness delega, no ejecuta

Un `kind: agent` **no** lo ejecuta el harness. El harness no tiene bucle, ni contexto de
conversación, ni forma de leer un diff y decidir si el trabajo está hecho: eso es un runtime,
y hay varios. Lo que el harness sabe es qué hay que hacer, con qué instrucciones y qué
evidencia exigir.

De ahí la forma que quedó:

```yaml
- id: escribir
  title: Escribir o corregir los manuales
  kind: agent
  runtime: dsh --profile headless      # con qué se ejecuta
  model_role: implementer              # qué rol del routing elige el modelo
  instructions: >
    Documenta las pantallas del módulo {modulo}. Lee el .component.ts y el .html
    completos antes de escribir una línea.
```

Las instrucciones van **como un argumento** del runtime, ya sustituidas y protegidas del
shell: una instrucción con comillas dobles —«cita textual del código»— llegaría partida sin
protegerlas.

Tres decisiones que están en el código con su porqué:

| Decisión | Por qué |
|---|---|
| El `runtime` se declara y no se elige | Elegirlo el harness sería decidir por el proyecto qué modelo y qué agente usa. No hay un runtime por defecto |
| Un agente sin `runtime:` no se ejecuta, y se dice **al cargar** | Un proceso que se detiene a mitad deja trabajo hecho y a medias; el error tiene que salir antes de empezar |
| Dos pasos no comparten runtime | Compartirlo les pisaría el contexto, que es la parte del trabajo que no se ve |

`model_role` se lee y se conserva en el contrato, y todavía no viaja al runtime: cada runtime
elige su modelo a su manera —`dsh` por perfil, `codex` por su `config.toml`—, así que
traducirlo es trabajo de cada adaptador y no del motor.

### Motor de plantillas de proceso

Los procesos usan variables (`{version}`, `{tickets}`, `{slug}`) resueltas desde los
parámetros, el ticket, la feature o el entorno. Además soportan:

- **Condicionales:** `when: "impacts.migration == true"` para incluir un paso de migración.
- **Paralelismo:** `parallel_by: modulo` lanza un subagente por módulo con presupuesto de
  concurrencia (el default es 3, como el `max_concurrent_threads_per_session` de Codex).
- **Continuidad:** `continue_on_failure` para pasos que no deben bloquear (manuales, docs).
- **Rollback:** `on_failure.rollback: <step-id>` para procesos con pasos compensables.
- **Evidencia automática:** cada paso captura stdout, archivos tocados y su hash.

## 8. Análisis y plan: qué valida realmente el gate

Tu requisito explícito: *"que pueda revisar si lo que se pidió originalmente corresponde
con la investigación del caso y también si el plan está bien propuesto"*. Eso se traduce en
preguntas concretas, no en "¿está bien?".

### Gate de análisis (`intake → analyzed`)

| # | Pregunta | Tipo |
|---|---|---|
| A1 | La descripción funcional corresponde a la solicitud original, sin inventar alcance. | mecánico (diff de intención) + Jev |
| A2 | El diagnóstico identifica archivos reales que existen en el repo. | mecánico |
| A3 | El diagnóstico nombra la causa raíz o una hipótesis falsable. | Jev |
| A4 | Los riesgos declarados cubren los impactos marcados (`sync`, `migration`, `docker`, `auth`, `deploy`). | mecánico |
| A5 | Si hay `sync_impact`, el análisis menciona natural keys, idempotencia y conflicto cloud-gana. | Jev + reglas |
| A6 | La solicitud original se conservó literalmente y sin reescribir. | mecánico (hash) |

### Gate de plan (`planned → approved`)

| # | Pregunta | Tipo |
|---|---|---|
| P1 | El plan cubre **todos** los requisitos/criterios de la solicitud. | Jev (una pregunta por criterio) |
| P2 | Los pasos están ordenados y son ejecutables (nombran archivo o acción concreta). | Jev |
| P3 | Los criterios de aceptación son verificables (no "funciona bien"). | Jev |
| P4 | El plan identifica compatibilidad hacia atrás cuando aplica. | Jev condicional |
| P5 | El plan incluye rollback si el riesgo es `high` o `critical`. | mecánico + Jev |
| P6 | El plan no propone dejar configuración funcional en Django Admin. | mecánico (regla de proyecto) |
| P7 | El presupuesto de revisión (líneas estimadas) es razonable o propone división. | mecánico |

Cada una de estas preguntas existe como **proposición completa y autocontenida** en un
archivo de gate, con su umbral. Ver [`03-GATES.md`](03-GATES.md).

## 9. Comandos del CLI

**La fuente de esto es `valmen --help`, no este documento.** La lista se copió de ahí y
se revisa contra ahí: una lista escrita a mano deriva, y esta derivó —durante varias fases
tuvo comandos que nunca existieron con ese nombre (`valmen ticket new`, `valmen gate run`)
y le faltaban los que sí—. Si algo no coincide, manda el comando.

```text
# El registro
valmen create --id --title --type --module --request   # alta, en intake
valmen validate --all | --id <ID>     # el contrato del ticket
valmen active                         # los no cerrados (alias: list)
valmen show <ID>                      # el resumen de un ticket
valmen resume [--id <ID>]             # contexto para retomar
valmen transition --id --entity --to  # mueve estados, con la tabla del contrato
valmen index [--check]                # el índice derivado
valmen report [--desde --hasta --type --q]   # cierres, por fecha de CIERRE
valmen drift [--id] [--todos] [--strict]     # lo que el ticket cita y el código no confirma

# Compuertas
valmen gate <gate> --id <ID>          # evalúa, y emite recibo
      --evaluator auto|command|jev|llm-judge
valmen gate-decide --id <ID> --receipt <GR-…> --decision --actor
valmen gate-decide --code <CÓDIGO> --decision --actor   # desde el celular
valmen simulate <gate> [--limit] [--json] [--calibrate]

# QA, evidencia y cierre
valmen add-point --id --title --severity --actual --expected [--files]
valmen qa-start --id --environment --build-reference
valmen qa-close --id --result [--po-confirmation]
valmen add-evidence --id --kind --description [--reference] [--point-id]
valmen add-retest --id --point-id --result
valmen add-ai-usage --id --source --confidence
valmen close-attempt --id --technical-summary --functional-summary --qa-status --release-impact

# Features
valmen feature list | show <slug> | new <slug> --title | decompose <slug> [--dry-run]

# Procesos
valmen process list | show <id> | run <id> [--set n=v] [--skip-gates]
valmen process approve <gate> --actor <nombre>
valmen process runs | show-run <corrida> | resume [corrida] | abandon <corrida>

# Memoria y estándares
valmen memory search <consulta> | save --title --body | list | review
valmen memory clasificar <AP-001> --decision regla|caso|descartar
valmen estandar listar | proponer --title --rule --area | revisar
valmen estandar aceptar|descartar <EST-001|pendientes> --instruccion <frase>

# Entrega
valmen deliver-manifest --version --tickets       # el manifiesto, sin publicar
valmen release-publish --version --tickets        # exige el tag anotado

# Puesta en marcha
valmen doctor                                  # qué falta, y el comando que lo arregla
valmen provider list | set <id> --key <k> | test <id> | models <id>
valmen routing show | set --preset <p> | set <rol> --provider <p> --model <m> | clear <rol>

# Proyecto
valmen init | adopt [--dry-run] | migrate [--dry-run] | sync [--check]
valmen template list | show <nombre> | apply <nombre>
valmen secrets [--staged]

# Consumo
valmen usage [--desde --hasta]
valmen usage value [--desde --hasta] [--limite <n>]   # ticket por ticket

# Servicios
valmen serve [--port <n>]             # Mission Control en 127.0.0.1
valmen mcp [--install] [--global]     # qué declarar en cada agente
valmen hermes status|connect|test|notify|brief   # el puente, para el celular
```

Opciones globales: `--root <ruta>`, `--tickets-dir <ruta>`, `--legacy-layout`, `--credentials <ruta>`.

Los comandos de anexado llevan un valor por bandera y no `--json`: escriben bloques
append-only, y la confirmación es el identificador que devuelven. Los que deciden
—`gate`, `simulate`— sí aceptan `--json`, porque su resultado es un dato.

---

## 10. El servidor MCP: el flujo sin terminal

`valmen mcp` **no arranca el servidor**: imprime lo que hay que declarar en cada agente y,
con `--install`, lo escribe. El servidor es `valmen-mcp`, un proceso aparte que el agente
lanza como hijo y con el que habla JSON-RPC por stdin y stdout.

Existe porque el flujo no puede empezar en una terminal. Quien reporta un problema habla
con su agente —opencode, codex, Claude Code—, y el agente necesita poder dar de alta el
ticket, validarlo, evaluar la compuerta y mover el estado. Sin esto, cada ticket empieza
con alguien copiando un comando.

### Las veintiocho herramientas

| Herramienta | Qué hace | Reutiliza |
|---|---|---|
| `crear_ticket` | Alta en `intake`, devuelve la ruta del archivo | `createTicket` |
| `ver_ticket` | Resumen del ticket: frontmatter, secciones, bloques | `valmen show` |
| `listar_tickets` | Filtros por estado, tipo, módulo, texto, puntos, impacto y fechas | `listTickets` + `filterTickets` |
| `validar_ticket` | Contrato del ticket; sin `id`, todo el registro | `valmen validate` |
| `mover_ticket` | Aplica la tabla de estados, y reabre un cerrado con su motivo | `transition` |
| `anotar_punto` | Un hallazgo, con `actual`, `expected` y los archivos que toca | `addPoint` |
| `mover_punto` | El ciclo del punto, independiente del ticket | `transition` |
| `anotar_evidencia` | La prueba de algo hecho, enlazada al punto que la originó | `addEvidence` |
| `reanudar_ticket` | Contexto para retomar trabajo empezado | `valmen resume` |
| `evaluar_compuerta` | Evalúa un gate y escribe el recibo | `runGate` |
| `simular_compuerta` | Mide un gate sobre el histórico, para calibrar | `simulateGate` |
| `ver_features` | Las features, o una con su brief y sus artefactos | `featureList` / `featureShow` |
| `descomponer_feature` | El grafo de tickets, propuesto por el rol `architect` | `featureDecompose` |
| `ver_procesos` | Los procesos declarados, o uno con sus pasos y parámetros | `listProcesses` / `showProcess` |
| `estado_proceso` | Las corridas, y dónde se detuvo la que espera | `listProcessRuns` / `showProcessRun` |
| `ejecutar_proceso` | Corre un proceso; se detiene en el primer gate sin aprobar | `runProcessCommand` |
| `reporte_cierres` | Reporte de lo cerrado en un rango, por fecha de cierre | `reportClosed` |
| `calibrar_compuerta` | Un gate contra el histórico, con sus falsos aprobados | `calibrateReport` |
| `manifiesto_entrega` | La versión y los tickets de una entrega; no publica nada | `deliverManifest` |
| `indexar_registro` | Regenera el índice, o dice si se desincronizó | `buildIndex` |
| `revisar_secretos` | Credenciales en el cambio pendiente, o en el texto que se le pase | `scanPendingChanges` |
| `reporte_consumo` | Evaluaciones, coste y **cuánto se decidió en código**, con la calibración real | `usageReport` |
| `buscar_memoria` | Lo que el proyecto ya decidió y ya falló, por sus palabras | `searchMemory` |
| `guardar_aprendizaje` | Anexa lo que este trabajo enseñó, cuando se descubre | `saveLearning` |
| `iniciar_qa` | Abre el ciclo con su ambiente y su referencia de build | `qaStart` |
| `anotar_retest` | El resultado de retestar un punto | `addRetest` |
| `cerrar_qa` | Cierra el ciclo: hallazgos, o la aprobación con la frase del PO | `qaClose` |
| `registrar_consumo_ia` | Lo que costó una sesión: tokens, coste y de dónde salieron | `addAiUsage` |
| `preparar_cierre` | Los dos resúmenes y el impacto de release, con el consumo ya registrado | `closeAttempt` |

**Nada escribe en stdout salvo el protocolo, y eso incluye a las funciones del CLI
que se reutilizan.** `runProcessCommand` imprimía el avance de cada paso directo a
`process.stdout`: desde una terminal es lo correcto —se ve al vuelo y no hace falta
al final—, y desde acá metería un renglón suelto entre dos respuestas JSON-RPC y
rompería la sesión del agente con un síntoma que no dice nada de la causa. El avance
es un parámetro inyectable, y la herramienta lo devuelve como parte del resultado.
Hay una prueba que espía `process.stdout.write` durante la llamada y exige que no se
haya escrito nada.

**El ciclo entero se recorre sin terminal**: alta, plan, compuertas, implementación con sus
hallazgos y su evidencia, prueba del PO, ciclo de QA, cierre. Y las dos únicas cosas que el
agente no puede hacer solo son las que no debe: **aprobar** —ni una compuerta ni un QA— y
**reabrir un ticket ya publicado**, que el motor rechaza porque una release publicada no se
despublica.

Anotar consumo de IA tampoco está, y no por olvido: el coste real vive en la base de datos de
opencode, y un modelo que declara lo que gastó lo está estimando. Ese dato lo escribe quien lo
mide —Mission Control, que la lee—, no quien lo protagoniza.

Las herramientas **no son una segunda implementación**: las de lectura llaman literalmente
a las funciones de `@valmen/cli`, y las de escritura al mismo motor. Si el agente creara un
ticket de una forma y el comando de otra, el registro dejaría de ser el mismo registro — que
es justo lo que el harness existe para impedir.

### Qué declara cada herramienta

**`root` va en todas, y es opcional.** Es la salida para la sesión que trabaja sobre dos
repositorios: gana sobre el directorio de trabajo con el que se lanzó el servidor. Que
estuviera prometido aquí, leído en `main.ts` y **ausente de los esquemas** fue un defecto
durante toda la construcción del servidor: como todos declaran `additionalProperties: false`,
un cliente que validara el esquema rechazaba el argumento antes de llamar, y desde dentro del
agente eso se ve como «no puedo apuntar a otro proyecto». Ahora los esquemas se arman con una
función que lo inyecta, así que una herramienta no puede quedar sin admitirlo por olvido.

**El resultado es texto, y en tres casos además dato.** El texto es el informe del motor —dice
qué falta y con qué código de salida, y parafrasearlo le quitaría al agente lo que necesita
para corregir—. `ver_ticket`, `listar_tickets` y `evaluar_compuerta` devuelven **además**
`structuredContent`, para que el agente ramifique por estado, por fila o por veredicto sin
interpretar prosa.

El criterio de cuándo se declara `outputSchema` es una sola frase: **solo donde la fuente ya
es un dato canónico en disco.** En `ver_ticket` es el frontmatter, leído con el mismo
`parseTicket` de `@valmen/core` que usa el motor; en `evaluar_compuerta` es el recibo que el
motor acaba de anexar a `.valmen/receipts/`. En ningún caso se construye una proyección nueva
del texto: dos representaciones del mismo hecho se desincronizan, y la que se desincroniza es
siempre la que nadie mira. Las otras seis devuelven solo texto, y el test afirma la lista
exacta —`["ver_ticket", "evaluar_compuerta"]`— para que una herramienta nueva no lo decida por
costumbre.

### Las anotaciones: qué declara cada herramienta de sí misma

Una herramienta no solo tiene forma: tiene **carácter**, y un cliente MCP necesita saberlo
**antes** de llamarla. Hasta ahora no lo decía ninguna, así que las treinta y cinco se veían
iguales y un cliente con aprobación por herramienta —Hermes con `trust: untrusted`, Claude
Code, Cursor— solo tenía dos opciones, y ninguna sirve: preguntar por todo convierte un
servidor de consulta en un trámite, y no preguntar por nada deja que un agente escriba en el
registro sin que nadie mire.

Cada una declara ahora las cuatro anotaciones del protocolo, y el criterio se escribe **una
vez** en `packages/mcp/src/tools.ts`, como cuatro constantes que las herramientas eligen:

| Constante | Qué significa | Cuántas |
| --- | --- | --- |
| `SOLO_LEE` | No escribe **y no gasta** | 15 |
| `ANEXA` | Solo agrega: un archivo nuevo o un bloque append-only | 10 |
| `REESCRIBE` | Cambia algo que ya existía | 4 |
| `GASTA` | No toca el registro y sale del proyecto: llama a un modelo | 3 |

Tres no encajan en ninguna —`descomponer_feature`, `ejecutar_proceso` e `indexar_registro`—
y declaran su objeto entero, que también dice algo: son las que combinan cosas que las otras
separan.

**La segunda condición de `SOLO_LEE` importa tanto como la primera.** `simular_compuerta` y
`calibrar_compuerta` no tocan un archivo, pero cada llamada evalúa el histórico contra un
proveedor: sin esa condición, «permiso para leer» sería «permiso para gastar sin tope».

`ANEXA` con `destructiveHint: false` es el invariante 4 del harness —los bloques append-only
no se reescriben— visto desde afuera: una herramienta que solo anexa no puede destruir nada,
y por eso puede declararlo sin mentir.

**El campo es obligatorio en `ToolDefinition`, y eso es lo que lo sostiene.** Una anotación que
se puede omitir es una anotación que se omite, y el default del protocolo para
`destructiveHint` es `true`: una herramienta nueva sin anotar no rompería nada, se declararía
peligrosa en silencio y el cliente le pediría permiso a la persona para leer un ticket.
Haciéndolo obligatorio, la herramienta que se agregue sin anotar **no compila**. El
compilador garantiza que están; un test fija los valores con las listas explícitas, para que
cambiar el carácter de una herramienta exija editar el test y decirlo.

### Lo que **no** hay, y por qué

**No hay herramienta para aprobar una compuerta.** El diseño original de
`docs/12-FUNCIONALIDADES-PROXIMAS.md` (§C4) listaba `valmen_gate_approve/reject`; no está, y
no es un olvido. Un gate puede *prepararse* automáticamente, pero la aprobación es de una
persona: es la primera regla de acciones que nunca se automatizan. Un agente que pudiera
aprobarse a sí mismo convertiría el control en un trámite, y el recibo registraría como
decisión humana algo que ninguna persona decidió.

Tampoco hay herramienta para saltar la tabla de estados: `mover_ticket` la aplica, y un
salto ilegal se rechaza con el motivo. Un agente puede recorrer el camino legal completo
—`intake → analyzed → planned`— y **no puede cruzar** a `approved`, porque el motor exige
la línea de aprobación explícita del PO en el plan y la plantilla la deja vacía.

### La raíz del proyecto

El servidor resuelve el registro por su **directorio de trabajo**, y los dos runtimes lo
fijan al proyecto al lanzarlo. Por eso la entrada que se declara **no lleva `--root`**:
grabar la raíz de un proyecto haría que la misma configuración dejara de valer en cualquier
otro. En el `config.toml` de codex —que es único para todos los proyectos de una persona—
sería directamente un error: todas las sesiones escribirían en el registro del primer
proyecto registrado.

Cada herramienta acepta un `root` en sus argumentos, que gana sobre todo lo demás. Es la
salida para el caso raro: una sesión que trabaja sobre dos repositorios.

### Las skills, como prompts

Las skills del proyecto se publican también como **prompts** del protocolo
—`prompts/list` y `prompts/get`—, y esa es la segunda mitad de la tesis de C4: el
harness deja de necesitar un adaptador por agente.

La proyección a `.opencode/skills/`, `.claude/skills/` y `.codex/skills/` sigue
existiendo y sigue siendo la que usan esos clientes de forma nativa. Lo que cambia es
que **un cliente que no esté en esa lista ya no exige escribir código**: pide el
prompt y recibe el procedimiento. Y se sirve desde `.valmen/skills/`, la fuente, así
que el prompt no puede quedar viejo como puede quedar una copia proyectada.

### Las reglas del proyecto, también como prompt

El catálogo empieza con un prompt reservado, `reglas-del-proyecto`, que devuelve el mismo
documento que `valmen sync` escribe en `AGENTS.md` —generado por la misma función pura, y
leído de `.valmen/` en vez del archivo proyectado—, sin su encabezado de archivo generado.

Existe por un caso concreto: un agente lee las convenciones del proyecto del `AGENTS.md`
que encuentra en su directorio de trabajo, y **la sesión del celular no tiene ese
directorio**. Hermes corre desde donde viva la pasarela, no desde el proyecto, así que su
prompt de sistema no incluye nada de esto. Sin esta puerta, la conversación del celular
contesta sin saber cómo se trabaja acá y el agente parece ignorar reglas que el de la
máquina sí leyó.

El nombre está **reservado**: si un proyecto declara una skill con ese nombre, gana el
prompt de reglas. La alternativa —que gane la skill— dejaría tapado el mecanismo que
existe justamente para que un agente lea las reglas, y hay un test que lo afirma.

Las reglas van primero en el catálogo, por la misma razón por la que van antes en el
`AGENTS.md`: quien lee necesita saber de qué sistema se trata antes de un procedimiento
suelto. Y no dependen de que el proyecto declare skills —un proyecto sin skills también
tiene flujo, estados y gates que un agente tiene que conocer—.

### Diagnóstico

El primer fallo de un servidor MCP es que el cliente no lo encuentra, y desde dentro del
agente eso se ve como «la herramienta no existe». Por eso hay una autocomprobación que no
habla el protocolo:

```bash
valmen-mcp --check
# servidor:    valmen 0.0.1
# raíz:        /proyectos/tienda
# registro:    tickets
# credenciales: /proyectos/tienda/.valmen/.credentials.yaml
# herramientas: 28
#   - crear_ticket(id, title, type, module, request): Crear un ticket
#   - ver_ticket(id): Ver un ticket
#   - listar_tickets(): Listar tickets
#   …
# prompts:      7
#   - planificacion: Planificación
#   …
```

Cada herramienta va con **sus argumentos obligatorios** y no solo con su título: cuando el
agente dice que no puede llamar a algo, la diferencia entre «no la ve» y «la ve y le falta un
argumento» es la diferencia entre revisar la configuración del cliente y revisar la llamada.

Y una regla que no se puede romper: **nada escribe en stdout salvo el protocolo**. Un
`console.log` perdido o un aviso de Node rompen la sesión del agente de una forma que
después nadie sabe explicar. Todos los diagnósticos van a stderr, que el cliente sí muestra.

