# 08 — Adopción: incorporar el harness a un proyecto en marcha

El pedido: *"que se pueda incluir en un proyecto ya funcionando y reemplace la configuración
agéntica establecida, pero no los procesos únicos del proyecto. Si antes había una
configuración de `CLAUDE.md` o algo así, que el sistema pueda revisarla, contrastarla contra
el proyecto y generar el `AGENTS.md` con lo puntual del repositorio + las configuraciones de
nuestro harness para el flujo de trabajo."*

## 1. El problema central: separar el *cómo* del *qué*

Toda configuración agéntica existente mezcla dos cosas:

| Tipo | Ejemplo real de SaiOpenCloud | Destino |
|---|---|---|
| **Del harness** (el *cómo* se trabaja) | "el commit requiere confirmación del PO", "no mezclar tickets", "modo directo sin ticket" | Se **reemplaza** por la config del harness |
| **Del proyecto** (el *qué* es este sistema) | "`AdminClient (TenantMixin)` define cada tenant", "OfflineSync prioriza natural keys, cloud gana", "Django Admin es solo interno" | Se **preserva** como reglas del proyecto |

`valmen adopt` hace esa separación de forma explícita y **auditable**: clasifica cada
afirmación, la presenta, y tú corriges las que clasificó mal. No adivina y sigue.

## 2. El flujo de adopción en 7 pasos

```bash
cd /ruta/al/proyecto
valmen adopt
```

```
┌─ PASO 1/7 · DESCUBRIMIENTO ─────────────────────────────────────────────────┐
│ Configuración agéntica encontrada:                                          │
│                                                                             │
│   CLAUDE.md                    7.8 KB   (marcado "legado" en su cabecera)   │
│   AGENTS.md                   11.5 KB   (fuente de verdad declarada)        │
│   .claude/settings.json        3.0 KB                                       │
│   .claude/agents/*.md          19 archivos                                  │
│   .claude/commands/             8 archivos                                  │
│   .codex/config.toml           218 B                                        │
│   .codex/agents/*.toml         12 archivos                                  │
│   .codex/hooks.json            (vacío, hooks desactivados)                  │
│   .opencode/agents/*.md        12 archivos                                  │
│   opencode.json                203 B                                        │
│   .agents/skills/*/SKILL.md    13 skills                                    │
│   .agents/rules/saicloud.md.bak                                             │
│   docs/agentic/                PHASE-MAP, ticket-schema, rules/, plans/     │
│   tools/agentic/ticket.py      2.171 líneas                                 │
│   docs/tickets/2026/*          57 tickets                                   │
│                                                                             │
│ Legado no gestionado (no se tocará):                                        │
│   .claude/drafts/              989 archivos                                 │
│   .claude/*-backup-*/          4 directorios                                │
│   .claude/telemetry.jsonl      142 KB                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ PASO 2/7 · PERFIL DEL PROYECTO ────────────────────────────────────────────┐
│ Analizando el repositorio (sin llamar a ningún modelo todavía):             │
│                                                                             │
│   Lenguajes      Python 38% · TypeScript 34% · HTML 18% · Go 6% · Shell 4%  │
│   Backend        Django 5.2.1 · DRF 3.17.1 · django-tenants 3.10.1          │
│                  (leído de requirements.txt / Dockerfile, no de los .md)    │
│   Base de datos  PostgreSQL 16 (docker-compose.yml)                         │
│   Frontend       Angular 14.3 · Material 14.2 · TypeScript 4.6 (package.json)│
│   Otros          Node 20 (WebSocket/) · Go 1.22 (LocalAgents/)              │
│   CI             GitHub Actions (1 workflow) · AWS CodeBuild (8 buildspecs) │
│   Tests          Django TestCase (BackEnd/**/tests/) · Karma (FrontEnd/)    │
│   Módulos        49 en BackEnd/ · 29 en FrontEnd/                           │
│   Multi-tenant   Sí — django-tenants, schema por tenant                     │
│   Migraciones    1.247 archivos en 41 apps                                  │
│   Tamaño         ~412k líneas · 3.180 archivos rastreados                   │
│                                                                             │
│   ⚠ Discrepancia detectada:                                                 │
│     CLAUDE.md dice "django-tenant-schemas"                                  │
│     El código usa "django-tenants"                                          │
│     → CLAUDE.md está desactualizado. Se propone corregirlo en la adopción.  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ PASO 3/7 · CLASIFICACIÓN DE REGLAS ────────────────────────────────────────┐
│ Extrayendo afirmaciones y clasificando cada una:                            │
│                                                                             │
│   HARNESS (se reemplaza por la config del harness) ............... 34       │
│   PROYECTO (se preserva como .valmen/rules/) ..................... 41       │
│   OBSOLETO (contradice al código o al flujo vigente) ............. 12       │
│   DUPLICADO (ya está en el harness) .............................. 18       │
│   SIN CLASIFICAR (necesita tu decisión) .......................... 6        │
│                                                                             │
│   Preparando revisión interactiva…  (o --auto para aceptar la propuesta)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

El paso 3 es el corazón del proceso. Presenta la clasificación en una interfaz revisable:

```
┌─ REVISIÓN DE REGLAS ─────────────────────────────────────── 111 de 111 ─────┐
│ [Todas] [Proyecto 41] [Harness 34] [Obsoleto 12] [Duplicado 18] [Dudosas 6] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✓ PROYECTO                                             AGENTS.md:39-46     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ "AdminClient (TenantMixin) define cada tenant; usar siempre el contexto  ││
│  │  del tenant correcto antes de consultar o mutar datos tenant-scoped."    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  → .valmen/rules/invariantes.md § multi-tenancy                             │
│  Verificado contra el código: ✓ `AdminClient` existe en BackEnd/…/models.py  │
│                                                    [proyecto ▾] [editar ✎]  │
│                                                                             │
│  ✓ PROYECTO                                             AGENTS.md:42-45     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ "OfflineSync y SincSaiCloud priorizan natural keys; nunca emplear un id  ││
│  │  local como identidad de upsert. Ante conflicto, el cloud gana. Las      ││
│  │  operaciones deben ser idempotentes y no duplicar datos tras reintentos."││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  → .valmen/rules/invariantes.md § sincronización                            │
│  Verificado contra el código: ✓ `register_bulk_sync`, `disable_sync_signals` │
│                                                    [proyecto ▾] [editar ✎]  │
│                                                                             │
│  ⟳ HARNESS                                              AGENTS.md:56-66     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ "La creación de tickets es bajo demanda: solo se crea o reutiliza un     ││
│  │  ticket canónico cuando el PO lo pide explícitamente."                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  → Reemplazado por .valmen/rules/flujo.md (configurable en el harness)      │
│  ¿Conservar la política "bajo demanda" como override del proyecto?          │
│                              [Sí, conservar ▾]  [No, usar el default]      │
│                                                                             │
│  ✗ OBSOLETO                                             CLAUDE.md:20-21     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ "Multi-tenant explícito: schema PostgreSQL por tenant via               ││
│  │  django-tenant-schemas."                                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  → Contradice el código: el proyecto usa `django-tenants` 3.10.1            │
│  → Se propone: descartar, y registrar en .valmen/legacy/OBSOLETO.md         │
│                                              [descartar ▾] [conservar]      │
│                                                                             │
│  ? SIN CLASIFICAR                                       AGENTS.md:52       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ "Antes de cerrar un ticket que agregue configuración, comprobar que      ││
│  │  existe la pantalla correspondiente bajo FrontEnd/src/app/; si no se     ││
│  │  conoce su ubicación, detenerse y pedir decisión al PO."                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  → ¿Es regla del proyecto (política Admin vs Frontend) o del harness        ││
│    (gate de cierre)?                                                        │
│  → Mi recomendación: AMBAS. El invariante "el cliente configura por Angular" │
│    es del proyecto; el check "el ticket de configuración tiene pantalla"     │
│    es un gate reutilizable.                                                 │
│                       [ambas ▾]  [solo proyecto]  [solo harness]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

```
┌─ PASO 4/7 · CONTRATO DE TRABAJO ────────────────────────────────────────────┐
│ Detectado del proyecto:                                                     │
│                                                                             │
│   Tipos de ticket    FEATURE, BUGFIX, IMPROVEMENT, SYNC, INTEGRATION,       │
│                      AGENT, SECURITY, CLAUDIO                               │
│                      → se proponen añadir CHORE y DOCS                      │
│                                                                             │
│   Estados            intake → analyzed → planned → approved → in_progress   │
│                      → awaiting_user_tests → in_qa → changes_requested      │
│                      → qa_approved → closed                                 │
│                      → idénticos al default del harness ✓                   │
│                      → se propone añadir `blocked`                          │
│                                                                             │
│   Gates actuales     Todos humanos (aprobación explícita del PO)            │
│                      → se propone: hybrid para analysis/plan,              │
│                        human para deploy/release/security/migration        │
│                                                                             │
│   Presupuesto        No existe → se propone $2 soft / $8 hard por ticket    │
│                                                                             │
│   Registro           docs/tickets/YYYY/<ID>/ticket.md                       │
│                      → se conserva tal cual (config: paths.tickets)         │
│                                                                             │
│   CLI                tools/agentic/ticket.py (2.171 líneas, Python stdlib)  │
│                      → ver paso 6                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ PASO 5/7 · EXTRAER PROCESOS Y SKILLS ──────────────────────────────────────┐
│ De la documentación existente se detectaron procesos ejecutables:           │
│                                                                             │
│   ✓ Deploy / release        .agents/skills/saicloud-despliegue/SKILL.md     │
│                             7 pasos de dry-run + frase "APROBAR DEPLOY vX"  │
│     → .valmen/processes/deploy.yaml                                         │
│                                                                             │
│   ✓ Migración de tenant     scripts/migrate-tenant.sh (9 pasos) + preflight │
│     → .valmen/processes/migrar-tenant.yaml                                  │
│                                                                             │
│   ⚠ Manuales                docs/manuales/usuario-final/PROCESO-MANUALES.md │
│                             (documento de 200+ líneas, no una skill)        │
│     → se propone: .valmen/skills/manuales-usuario-final/SKILL.md            │
│       + proceso actualizar-manuales con 4 pasos y gate                      │
│                                                                             │
│   ✓ Reportes                /daily-standup, /reporte-semanal (read-only)    │
│     → .valmen/processes/reporte-diario.yaml, reporte-semanal.yaml           │
│                                                                             │
│   ⚠ Cierre y release        .agents/skills/saicloud-revision-final,         │
│                             saicloud-revision-final, release-manager        │
│     → gates close + release-publish                                         │
│                                                                             │
│ Skills encontradas: 13 activas + 4 archivadas                               │
│   → se copian a .valmen/skills/ y se enlazan a cada agente                  │
│   → las archivadas van a .valmen/legacy/skills-archivadas/                  │
│                                                                             │
│ Agentes encontrados: 12 (idénticos en .codex/ y .opencode/)                 │
│   ⚠ DIVERGENCIA: planner.toml y planner.md difieren en 1 frase              │
│     toml: "El sandbox no sustituye ownership, autorización funcional…"      │
│     md:   "Los permisos de la herramienta no sustituyen ownership…"         │
│     → se propone unificar con el texto del .toml (más preciso)              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ PASO 6/7 · COMPATIBILIDAD CON EL CLI EXISTENTE ────────────────────────────┐
│ Se encontró tools/agentic/ticket.py con 57 tickets en producción.           │
│                                                                             │
│ Opciones:                                                                   │
│                                                                             │
│   ○ (a) Reemplazar por `valmen ticket`                                      │
│         Migra los 57 tickets al schema del harness. El CLI de Python deja   │
│         de ser necesario. Más limpio, pero rompe cualquier script o hábito  │
│         que dependa de `ticket.py`.                                         │
│                                                                             │
│   ● (b) Coexistir — adaptador de compatibilidad            [RECOMENDADO]    │
│         `valmen` lee y escribe el MISMO formato. `ticket.py` sigue          │
│         funcionando en paralelo. Se congelan las features nuevas del CLI    │
│         de Python y se migra el uso de a poco. Cero disrupción.             │
│                                                                             │
│   ○ (c) Importar una sola vez y congelar el Python                          │
│         Los 57 tickets se importan; `ticket.py` queda read-only con un      │
│         aviso que apunta a `valmen`.                                        │
│                                                                             │
│ Con (b), la verificación es:                                                │
│   valmen ticket validate --all   ≡   python3 tools/agentic/ticket.py validate --all│
│   (mismo veredicto para los mismos 62 archivos, verificado en la adopción)  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ PASO 7/7 · RESUMEN Y APLICACIÓN ───────────────────────────────────────────┐
│ Se creará:                                                                  │
│   .valmen/config.yaml                     nuevo                             │
│   .valmen/rules/{stack,invariantes,dominio,delivery}.md   desde AGENTS.md   │
│   .valmen/gates/*.yaml                    8 gates                           │
│   .valmen/processes/*.yaml                5 procesos                        │
│   .valmen/skills/*/SKILL.md               13 skills (enlazadas)             │
│   .valmen/agents/*.md                     12 agentes (unificados)           │
│   .valmen/legacy/                         manifiesto de lo no gestionado    │
│                                                                             │
│ Se regenerará (con backup en .valmen/legacy/pre-adopcion/):                 │
│   AGENTS.md            ← reemplazado, con las reglas del proyecto extraídas │
│   .codex/agents/*.toml ← regenerado desde .valmen/agents/                   │
│   .opencode/agents/*.md← regenerado desde .valmen/agents/                   │
│                                                                             │
│ NO se toca:                                                                 │
│   .claude/**            (989 drafts, backups, telemetría — legado)          │
│   CLAUDE.md             (se deja; el AGENTS.md generado lo marca legado)    │
│   docs/**               (toda tu documentación)                             │
│   tools/agentic/*       (compatibilidad total)                              │
│   .codegraph/           (se integra como MCP)                               │
│                                                                             │
│ ⚠ Nada se borra. Todo lo reemplazado queda en .valmen/legacy/pre-adopcion/. │
│                                                                             │
│ Crear también un ticket de adopción?  ● Sí, tipo CHORE                      │
│ Aplicar gates automáticos desde el inicio?  ○ No (empezar en humano)  ● Sí, │
│                                                solo analysis y plan         │
│                                                                             │
│              [ Aplicar ]   [ Ver el plan completo ]   [ Cancelar ]          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Modos de ejecución

```bash
valmen adopt                          # interactivo, paso a paso (recomendado)
valmen adopt --dry-run                # solo el análisis, no escribe nada
valmen adopt --auto                   # acepta toda la clasificación propuesta
valmen adopt --only=claude            # importa solo de una fuente
valmen adopt --no-legacy-backup       # no guarda copia (no recomendado)
valmen adopt --json > adopcion.json   # para revisar el plan fuera de la terminal
```

**Equivalente en la app web:** el mismo flujo, con la clasificación en una tabla editable y
el diff final renderizado. Es la vía recomendada para proyectos grandes, porque revisar 111
afirmaciones en la terminal es tedioso.

## 4. Análisis del proyecto: cómo se contrasta contra el código

La parte que responde a *"contrastarlo contra el proyecto"*. Todo sin llamar a un modelo,
en orden:

| Paso | Qué hace | Herramienta |
|---|---|---|
| 1. Inventario | Lenguajes, tamaño, archivos rastreados, estructura de directorios | `git ls-files` + parser de extensiones |
| 2. Manifiestos | Lee `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Dockerfile`, `docker-compose.yml` | Parsers por tipo |
| 3. Versiones reales | **La verdad está en el manifiesto y el Dockerfile, no en el `.md`** | Comparación |
| 4. Estructura de pruebas | Encuentra runners configurados y tests existentes | Glob + lectura de config |
| 5. CI/CD | Workflows de GitHub, buildspecs, pipelines | Parseo de YAML |
| 6. Módulos | Agrupa el código en dominios por directorio | Análisis de árbol |
| 7. MCP disponibles | Detecta `.codegraph/`, `mcp.json`, servidores declarados | Lectura de config |
| 8. Contraste | **Compara cada afirmación de los `.md` contra los hallazgos** | Motor de reglas |
| 9. Propuesta | Genera las reglas del proyecto con las correcciones | Plantillas |

El paso 8 es el que produce valor inmediato: **detecta la documentación desactualizada**. En
SaiOpenCloud encontrará al menos:

- `CLAUDE.md` dice `django-tenant-schemas`; el código usa `django-tenants` (ya lo sabemos).
- `CLAUDE.md` referencia `docs/claudio-backlog.json`, `docs/claudio-status.md` y comandos
  `claudio` que **ya no existen** (el propio archivo lo admite en su cabecera).
- `.agents/archive/` tiene 4 skills archivadas que conviene revisar.
- 989 archivos en `.claude/drafts/` sin gestión: ¿son legado puro o hay algo que rescatar?

Ese último punto se convierte en una tarea concreta de la adopción: revisar los drafts y
proponer cuáles se rescatan a `.valmen/skills/` o se documentan.

## 5. Qué se preserva siempre

Invariantes de la adopción, no configurables:

1. **Nada se borra.** Todo lo reemplazado va a `.valmen/legacy/pre-adopcion/` con un
   manifiesto que dice qué era y por qué se reemplazó.
2. **El historial se preserva.** Los 57 tickets quedan intactos y legibles.
3. **El CLI existente sigue funcionando** (si eliges el modo coexistencia).
4. **Los archivos no gestionados no se tocan.** `.claude/drafts/`, los backups, la
   telemetría: el harness no los toca ni los menciona en sus proyecciones.
5. **Git es la red de seguridad.** La adopción **no hace commit**. Te deja el diff completo
   y tú decides. `git diff --stat` después de la adopción muestra exactamente qué cambió.
6. **Reversible.** `valmen adopt --revert` restaura desde `.valmen/legacy/pre-adopcion/` y
   borra `.valmen/`. (No deshace el trabajo que hayas hecho con el harness después.)

## 6. Adopción de un proyecto nuevo (sin configuración previa)

```bash
valmen init --template django-angular --name SaiOpenCloud
valmen init --template node-ts
valmen init --template generic        # solo AGENTS.md + harness básico
```

El flujo es el mismo, saltando los pasos 3 y 6. Las plantillas aportan:

- Estructura de `.valmen/` con reglas de stack ya escritas para ese stack.
- Gates apropiados: un proyecto Django+Angular tiene gates de migración y de pantalla; un
  proyecto de librería no.
- Skills base del stack (`django-backend`, `angular-frontend`, `pruebas-django`).
- Agentes: `explorer`, `planner`, `implementer`, `reviewer`, `test-author`.

SaiOpenCloud se convierte en la plantilla `django-angular-multitenant`, extraída del propio
proyecto una vez adoptado. Así el siguiente proyecto de ValMenTech con el mismo stack
arranca con todo el conocimiento acumulado.

## 7. Adopción incremental (para proyectos grandes)

Adoptar 3.180 archivos y 111 reglas de una sola vez da miedo, con razón. El modo incremental
permite adoptar por partes:

```bash
valmen adopt --phase=config-only      # solo .valmen/config.yaml, sin tocar nada existente
valmen adopt --phase=rules            # extrae reglas del proyecto a .valmen/rules/
valmen adopt --phase=agents           # unifica agentes y regenera proyecciones
valmen adopt --phase=processes        # extrae procesos de la documentación
valmen adopt --phase=compat           # activa el adaptador de compatibilidad del CLI
```

Entre fase y fase, el proyecto sigue funcionando como antes. Este es el camino recomendado
para SaiOpenCloud, porque permite validar cada paso en producción antes del siguiente. Ver
[`09-MIGRACION-SAICLOUD.md`](09-MIGRACION-SAICLOUD.md).
