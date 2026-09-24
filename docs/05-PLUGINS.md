# 05 — Plugins, procesos y herramientas

El pedido: *"quisiera poder añadir cosas como `scripts/migrate-tenant.sh`, y hay otro para
el deploy. Agregar skills, por ejemplo `docs/manuales/usuario-final/PROCESO-MANUALES.md`,
que es para cuando se necesiten actualizar los manuales y sea solo llegar y llamar la
herramienta. Poder configurar el flujo y agregar cosas. Que todo sea muy configurable y se
pueda configurar por texto, diciéndole al LLM principal que quiere y que lo configure."*

## 1. Los cuatro tipos de extensión

El sistema tiene exactamente cuatro formas de añadir capacidad. Cada una tiene un propósito
distinto, y confundirlas es lo que hace inmanejable un harness.

| Tipo | Qué es | Dónde vive | Se versiona | Ejemplo tuyo |
|---|---|---|---|---|
| **Skill** | Conocimiento procedimental: *cómo* se hace algo en este proyecto. Texto que el agente lee. | `.valmen/skills/<nombre>/SKILL.md` | Sí | `saicloud-backend-django`, `saicloud-planificacion` |
| **Tool** | Una capacidad ejecutable que el agente puede invocar. Tiene contrato tipado. | Plugin (código) o MCP server | El plugin sí | CodeGraph, `valmen ticket`, MCP de Hermes |
| **Proceso** | Un paso a paso encadenable con gates y evidencia. | `.valmen/processes/<id>.yaml` | Sí | `deploy`, `actualizar-manuales`, `migrate-tenant` |
| **Plugin** | Un paquete que aporta tools, procesos, gates, adaptadores o proveedores. | npm + `.valmen/plugins.yaml` | El lock sí | `@valmen/plugin-deploy` |

**Regla de decisión:**

> Si se puede escribir como texto que un humano entendería → **skill**.
> Si se puede escribir como una secuencia de pasos con entradas y salidas → **proceso**.
> Si necesita código que se ejecuta → **tool**, dentro de un **plugin**.

## 2. Skills

Se conserva el formato que SaiOpenCloud ya usa (y que gentle-ai también usa porque es el
estándar de facto de Claude Code), con una mejora: **resolución a paths exactos**.

```markdown
---
name: saicloud-backend-django
description: Usar al modificar comportamiento de backend en Django, DRF, datos
  tenant-scoped, migraciones, o integración con OfflineSync/SincSaisCloud.
when_to_use:
  - El ticket cambia modelos, vistas, serializers o tareas del BackEnd.
  - El cambio toca datos por tenant.
  - El ticket declara sync_impact o migration_impact.
requires: [saicloud-contexto]
model_role: implementer
---

# Backend Django — SaiOpenCloud

## Runtime y límites
- Django 5.2.1, DRF 3.17.1, django-tenants 3.10.1, PostgreSQL 16.
- La versión soportada de Python se toma del Dockerfile vigente; no se infiere
  de docs heredadas.
...
```

**El problema que resuelve la resolución a paths exactos** (patrón tomado de gentle-ai):
cuando el contexto se compacta, los agentes empiezan a "recordar" las skills en vez de
leerlas, y empiezan a inventar. La solución es que el orquestador resuelva el registro de
skills **una vez por sesión** y pase a cada subagente **la ruta exacta del `SKILL.md`**, no
un resumen. El subagente reporta qué recibió:

```
skill_resolution: paths-injected | fallback-registry | fallback-path | none
```

Si el orquestador ve un `fallback-*`, sabe que perdió contexto y se autocorrige. Esto es un
mecanismo concreto contra el modo de fallo más caro de las sesiones largas.

### 2.1 Herencia de skills

```yaml
# .valmen/config.yaml
skills:
  sources:
    - kind: project       # .valmen/skills/
      path: .valmen/skills
    - kind: global        # ~/.valmen/skills/ — compartidas entre proyectos
      path: ~/.valmen/skills
    - kind: plugin        # aportadas por plugins npm
      from: [@valmen/plugin-manuals, @valmen/plugin-deploy]
  precedence: [project, plugin, global]   # la primera que defina el nombre gana
  conflict: warn                          # warn | error | silent
```

Esto te da algo que hoy no tienes: **una skill escrita una vez en `~/.valmen/skills/` sirve
para todos los proyectos**, y se puede sobreescribir por proyecto sin copiarla.

### 2.2 Skills que se declaran por chat

```
Tú (en el chat del agente principal):
  "Crea una skill para el proceso de facturación electrónica DIAN: hay que
   validar el XML contra el esquema XSD antes de enviar, y si el CUFE no
   cuadra con el cálculo local, abortar y registrar en docs/errors.md."

El agente:
  1. Detecta que es una skill (conocimiento procedimental).
  2. Genera .valmen/skills/saicloud-facturacion-dian/SKILL.md con frontmatter válido.
  3. Muestra el diff y pide confirmación.
  4. Registra el cambio como un ticket tipo CHORE si el proyecto lo exige.
```

## 3. Procesos: el corazón de tu pedido

Ver [`02-MOTOR.md` §7](02-MOTOR.md#7-procesos-pasos-encadenables) para el formato completo.
Aquí los tres casos que pediste, resueltos.

### 3.1 `migrate-tenant.sh` como proceso

Hoy es un script bash de 8 pasos con prerrequisitos, que se ejecuta a mano y del cual no
queda registro estructurado. Como proceso:

```yaml
# .valmen/processes/migrar-tenant.yaml
id: migrar-tenant
title: Migrar un tenant de Virginia (us-east-1) a Ohio (us-east-2)
risk: critical
requires_gate: [migration]

params:
  tenant: { type: string, required: true, pattern: '^[a-z0-9-]+$' }

preflight:                  # todo esto se verifica ANTES de tocar nada
  - id: herramientas
    kind: command
    run: command -v pg_dump pg_restore psql
  - id: perfil-aws
    kind: command
    run: aws sts get-caller-identity --profile migracion
  - id: backup-reciente
    kind: check
    check: .valmen/gates/_checks/backup-fresco.sh --tenant {tenant} --max-age 24h
    on_failure: block         # sin backup de menos de 24h no se migra

steps:
  - id: dump
    title: Dump del schema desde Virginia
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only dump
    evidence: [stdout, artifact:"dump/{tenant}.sql.gz"]
    on_failure: abort         # nada se modificó todavía

  - id: schema-ohio
    title: Crear schema en Ohio
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only schema
    on_failure: rollback:drop-schema

  - id: restore
    title: Restore del dump
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only restore
    on_failure: rollback:drop-schema

  - id: migraciones
    title: Aplicar migraciones del stack upgrade
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only migrate
    on_failure: rollback:drop-schema

  - id: verificar
    title: Health check del tenant en Ohio
    kind: check
    check: .valmen/gates/_checks/tenant-health.sh {tenant}
    on_failure: rollback:route53-virginia

  - id: gate-corte
    title: Aprobación humana del corte de tráfico
    kind: gate
    gate: migration-cutover
    # El humano ve: dump verificado, health check OK, plan de rollback listo.
    # Se le pide la frase: "CORTAR {tenant} A OHIO"

  - id: route53
    title: Registrar alias Route53 → ALB de Ohio
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only dns
    on_failure: rollback:route53-virginia

  - id: passwords
    title: Hashear passwords en texto plano
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only fix-passwords

  - id: sqs
    title: Aprovisionar cola SQS dedicada
    kind: command
    run: ./scripts/migrate-tenant.sh {tenant} --only sqs

  - id: post
    title: Notificar y documentar
    kind: process
    process: notificar-migracion
    params: { tenant: "{tenant}" }

on_failure:
  notify: { channel: critical, template: migracion_fallida }
  keep_evidence: true
```

**Lo que se gana:** cada migración deja un ticket con evidencia estructurada, el preflight
no se puede saltar, el rollback está declarado antes de empezar, y el corte de tráfico tiene
un gate humano con frase literal. Hoy eso vive en la cabeza de quien ejecuta el script.

### 3.2 El deploy con manuales encadenados

Ese caso ya está desarrollado en [`02-MOTOR.md` §7](02-MOTOR.md#7-procesos-pasos-encadenables).
El resumen de la mecánica que pediste:

```yaml
- id: manuals
  kind: process
  process: actualizar-manuales        # ← el proceso se llama desde otro proceso
  params: { scope: "modulos afectados por {tickets}" }
  continue_on_failure: true           # los manuales no bloquean la release
  notify_on_failure: true             # pero si fallan, alguien se entera
```

Un proceso puede invocar a otro, recibir parámetros, condicionar su ejecución
(`when:`), y decidir si su fallo bloquea o solo avisa. Eso es lo que convierte "el paso a
paso del deploy" en una cosa que se configura en vez de una cosa que se recuerda.

### 3.3 Procesos que el usuario crea por chat

```
Tú: "Cuando cerremos un ticket SECURITY, quiero que se ejecute un proceso que
     corra bandit en el BackEnd, revise si hay secretos en el diff, y si algo
     falla que se lo mande a Juan por Telegram. Si todo pasa, que lo marque
     como verificado solo."

El agente:
  1. Clasifica: es un proceso.
  2. Genera .valmen/processes/security-post-close.yaml.
  3. Añade el gate `security-post-close` a .valmen/gates/security.yaml.
  4. Enlaza el proceso al evento `ticket.closed` filtrando por type: SECURITY.
  5. Muestra TODO el diff de configuración y pide confirmación.
  6. Ofrece probarlo en seco: `valmen process run security-post-close --dry-run`.
```

## 4. Plugins

Un plugin es un paquete npm que aporta capacidad al harness.

### 4.1 Manifiesto

```json
{
  "name": "@valmen/plugin-deploy",
  "version": "0.3.1",
  "valmen": {
    "apiVersion": "1",
    "provides": {
      "processes": ["./processes/deploy.yaml", "./processes/rollback.yaml"],
      "gates":     ["./gates/deploy.yaml"],
      "skills":    ["./skills/despliegue-aws"],
      "tools":     ["./tools/verify-tag.js"],
      "adapters":  ["./adapters/aws-ecs.js"],
      "commands":  ["./commands/deploy.js"]
    },
    "requires": {
      "valmen": ">=0.4.0",
      "credentials": ["AWS_PROFILE:migracion"],
      "mcp": ["codegraph"]
    },
    "config": {
      "schema": "./schema.json",
      "defaults": { "region": "us-east-2", "require_phrase": true }
    }
  }
}
```

### 4.2 Carga: composición por capas con último-gana

Adoptado de DSH (ver [`01-ARQUITECTURA.md` §8](01-ARQUITECTURA.md)), porque resolvió el
problema de componer 230 paquetes sin imports entre ellos:

```yaml
# .valmen/plugins.yaml — el orden importa: el último gana
layers:
  - core                                  # gates y procesos del sistema
  - { plugin: "@valmen/plugin-deploy" }
  - { plugin: "@valmen/plugin-manuals" }
  - { plugin: "@acme/plugin-jira-sync", config: { project: SAI } }
  - { path: "./local/plugins/experimental", disabled: false }
```

```yaml
# Override local: desactivar un paso del deploy sin tocar el plugin
# .valmen/overrides/deploy.yaml
patch:
  - target: { process: deploy, step: canary }
    disabled: true
    reason: "No hay ambiente de canario en este proyecto."
```

**Semántica que se documenta desde el día uno** (lección de DSH): un patch **reemplaza el
bloque completo** de la fila, no hace merge profundo. Por eso las filas se direccionan por
`id` estable y estable.

### 4.3 Plugins de primera parte (los que se construyen)

| Plugin | Aporta | Fase |
|---|---|---|
| `@valmen/plugin-deploy` | Proceso de deploy, gates de release, dry-run, verificación de tag | 2 |
| `@valmen/plugin-manuals` | Proceso de manuales, agente `manual-writer`, agente reality-checker, exportables PDF | 2 |
| `@valmen/plugin-tickets` | Compatibilidad con el `ticket.py` de SaiOpenCloud | 1 |
| `@valmen/plugin-codegraph` | Integración MCP, check de impacto en el gate de plan | 2 |
| `@valmen/plugin-memory` | Memoria persistente: decisiones, errores, patrones. Alimenta `docs/decisions.md` y `docs/errors.md`. | 4 |
| ~~`@valmen/plugin-hermes`~~ | **No se construyó como plugin**: el puente vive en `@valmen/adapter`, `@valmen/engine` y el CLI. Ver [`12` §C6](12-FUNCIONALIDADES-PROXIMAS.md#c6-integración-bidireccional-con-hermes). | 6 |
| `@valmen/plugin-observability` | OTEL, costos por sesión, dashboards | 5 |
| `@valmen/plugin-jira` | Sincronización bidireccional de tickets | 6 |
| `@valmen/plugin-sprint` | Planificación de sprint, capacidad, velocidad | 6 |

### 4.4 `@valmen/plugin-manuals` en detalle

Es el plugin que demuestra el valor de la arquitectura, porque codifica un proceso que hoy
existe como documento de 200+ líneas que hay que releer cada vez.

```
plugins/manuals/
├── plugin.json
├── processes/
│   └── actualizar-manuales.yaml
├── gates/
│   └── manuals.yaml
├── skills/
│   └── manuales-usuario-final/
│       └── SKILL.md            # extraído de PROCESO-MANUALES.md
├── agents/
│   ├── manual-writer.md
│   └── documentacion-reality-checker.md
└── adapters/
    └── pdf-export.js
```

La skill codifica las reglas duras que ya están documentadas:

```markdown
---
name: manuales-usuario-final
description: Usar al crear, actualizar o auditar los manuales de
  docs/manuales/usuario-final/. El código real siempre manda.
---

# Manuales de usuario final

## Regla de oro
Ningún manual se escribe ni se corrige por intuición de "cómo debería funcionar".
Se leen el `.component.ts` Y el `.component.html` completos de la pantalla —nunca
solo uno de los dos— antes de escribir una línea.

## Reglas duras
- `**¿Dónde encontrarla?:**` usa navegación en lenguaje de menú, NUNCA la ruta técnica.
- El sujeto de la descripción es el sistema o la pantalla, nunca "Acá se…" ni "Es la
  pantalla que…".
- Los pasos van en infinitivo impersonal, en el orden real del flujo.
- Los mensajes de error se copian **literales del código**, no se parafrasean.
- Toda ambigüedad va en `## ⚠️ Pendiente de validación con el equipo`, no se inventa.
- Encabezado con `<!-- rutas-fuente: ... -->` para que el check de frescura funcione.

## Código ISO
El código del manual se toma de `mapeo-codigos-iso.xlsx`. No se inventa.
```

Y el gate correspondiente, con checks mecánicos para lo que sí es mecánico:

```yaml
# plugins/manuals/gates/manuals.yaml
id: manuals
mode: auto
checks:
  - id: rutas_fuente_declaran_archivos_reales
    kind: assert
    expr: "all(frontmatter.rutas_fuente | exists_in_repo)"
    on_failure: block
  - id: sin_rutas_tecnicas_en_lenguaje_usuario
    kind: rule
    ruleset: plugins/manuals/rules.md#sin-rutas-tecnicas
    on_failure: block
  - id: frescura
    kind: command
    run: docs/manuales/usuario-final/scripts/verificar-frescura.sh
    on_failure: block
  - id: novedades_vencidas
    kind: command
    run: docs/manuales/usuario-final/scripts/verificar-novedades.sh
    on_failure: review

evaluation:
  evaluator: jev
  questions:
    - id: citas_del_codigo_real
      type: noul
      instructions: >
        Cada afirmación sobre el comportamiento de la pantalla en `manual`
        corresponde a algo observable en el código de `fuente_componente` y
        `fuente_template`. Una afirmación que no se puede verificar en el código
        hace falsa esta proposición.
    - id: errores_son_literales
      type: noul
      instructions: >
        Los mensajes listados en la sección "Qué hacer si algo sale mal" aparecen
        literalmente en `fuente_componente` o `fuente_template`.
```

Esto convierte tu `PROCESO-MANUALES.md` en algo que **se ejecuta**: el agente lee la skill
(corta), corre los checks mecánicos, y Jev valida lo semántico. Sin releer 200 líneas ni
confiar en que el agente se acuerde de las reglas.

### 4.5 Qué NO conviene convertir en plugin

Criterio de disciplina, para no repetir el error de gentle-ai (que llegó a 325 archivos de
CLI y 981 issues abiertos):

- Un plugin por **capacidad**, no por archivo.
- Si un proceso tiene menos de 3 pasos y no tiene gate, es un comando del CLI, no un plugin.
- Si algo solo lo usa un proyecto, va en `.valmen/` del proyecto, no en un plugin.
- Si algo cambia más de una vez por semana, probablemente todavía no es un plugin: es
  configuración del proyecto. Se promueve a plugin cuando un segundo proyecto lo necesita.
