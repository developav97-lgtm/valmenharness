---
schema_version: 2
id: SECURITY-ENGINE-SKILLS-TERCEROS-20261007
title: Declarar skills de terceros por proyecto con fuente, versión fijada y hash, sin instalar ni actualizar solas
type: SECURITY
module: ENGINE
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

# SECURITY-ENGINE-SKILLS-TERCEROS-20261007

## Solicitud original

Parte del sprint: Las skills de terceros se declaran con versión fijada y no se habilitan sin una revisión registrada.
- R-SKILL-001: Una skill de terceros DEBE declararse por proyecto con fuente y versión fijada
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una skill de terceros DEBE declararse por proyecto con fuente y versión fijada
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: poder declarar skills de terceros por proyecto (R-SKILL-001) con su fuente, una versión o commit fijado y el hash de su contenido, validar esa declaración al leer la configuración y listarla; sin instalar, descargar ni actualizar nada. Fuera de alcance: la revisión humana que las habilita (ticket siguiente), proyectar su contenido a los clientes y la integración de skills concretas.
- Usuario o rol afectado: el responsable del proyecto que quiere usar skills de terceros sin asumir su riesgo a ciegas, y el agente, que no debe poder traer código nuevo a sus propios permisos.
- Comportamiento actual: las skills del harness viven en `.valmen/skills/<id>/` y se proyectan con `readSkills` y `renderSkill` en `packages/adapter/src/skills.ts`; no existe una forma de declarar una skill ajena con su procedencia, y una skill de terceros copiada a mano a esa carpeta no deja constancia de dónde salió ni de qué versión es.
- Comportamiento esperado: la clave `external-skills` de `.valmen/config.yaml` lista cada skill con `id`, `source` (URL de git o ruta), `version` (un tag o commit fijado, nunca una rama ni `latest`) y `sha256` del contenido; una declaración sin versión fijada o con una versión móvil se rechaza con el nombre de la skill; `valmen skills external` la lista con su estado («declarada», sin revisión todavía); el harness no descarga ni instala nada por sí mismo.

## Diagnóstico

- Archivos y flujo investigados: las skills propias se leen de `.valmen/skills/` con `readSkills` y se publican con `renderSkill` y `renderAllSkills` en `packages/adapter/src/skills.ts`; la deriva de las skills publicadas respecto del catálogo del harness se mide con `publicadas` y `derivaPublicada` en el mismo archivo; la configuración del proyecto se lee con `parseConfig` y lectores como `readQaAuthorizationSources` en `packages/adapter/src/config.ts`; los comandos del CLI se declaran en `packages/cli/src/main.ts`.
- Causa raíz o hipótesis: el síntoma es que una skill de terceros entra al proyecto sin que quede escrito de dónde viene ni qué versión es, así que no se puede saber si lo que corre con los permisos del agente es lo que alguien revisó. La causa comprobada es que el modelo de skills del harness solo conoce las skills propias y las del catálogo, ambas versionadas por el propio harness; no tiene un tipo de skill ajena con procedencia y versión fijada. La seguridad sale de exigir versión fijada y hash antes de cualquier uso, y de que la declaración sea un archivo que una persona edita, no algo que el agente instale. Hipótesis a confirmar al implementar: que el formato de lista de mapas del analizador de configuración admita los campos propuestos.
- Riesgos y compatibilidad: (a) es la puerta de entrada de código de terceros con los permisos del agente, así que se rechaza todo lo que no sea una versión fijada (una rama, `latest`, `main`, un rango); (b) declarar no habilita: la habilitación es el ticket siguiente, con revisión registrada; (c) Archivos que el plan toca además de los de la investigación, todos aditivos: un módulo nuevo del motor para el estado de las skills externas, la reexportación en `packages/engine/src/index.ts`, el comando en `packages/cli/src/commands.ts` y `packages/cli/src/main.ts`, y un archivo de pruebas nuevo. Consumidores comprobados con búsqueda: nadie lee todavía una clave de skills externas; `readSkills` y la proyección no cambian; (d) un proyecto sin la clave no cambia.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance: la declaración, su validación y su listado. Exclusiones: descargar o instalar, la revisión que habilita y la proyección a los clientes.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` agregar `readExternalSkills(config)` y el tipo `ExternalSkill` (`id`, `source`, `version`, `sha256`): cada elemento exige los cuatro campos, un `id` válido y único, un `sha256` de 64 hex y una `version` fija (se rechazan `latest`, `main`, `master`, `HEAD`, rangos con `^`, `~`, `*` y cualquier rama); cada error de rechazo empieza por el nombre de la skill y dice qué campo falla (por ejemplo «skill ponytail: la versión «main» no está fijada»); sin la clave devuelve una lista vacía; exportarla.
  2. En `packages/engine/src/external-skills.ts` (nuevo) agregar `estadoDeSkillsExternas(root)`, que devuelve cada skill declarada con su estado («declarada» mientras no exista revisión) sin tocar el disco más que para leer la configuración; exportarlo desde `packages/engine/src/index.ts`.
  3. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `skills external` que lista las declaradas con su fuente, versión y estado, con su ayuda, y que no descarga ni instala nada.
  4. Crear `tests/skills-externas.test.ts` con un caso por criterio; correr esas pruebas, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; ningún flujo usa todavía la clave y sin ella no hay cambios.

## Criterios de aceptación

- [x] Una skill declarada con fuente, versión fijada y hash se lee y se lista con su estado
      <!-- test: npx vitest run tests/skills-externas.test.ts -->
- [x] Una declaración sin versión, con una rama, `latest` o un rango, o sin hash, se rechaza con el nombre de la skill
      <!-- test: npx vitest run tests/skills-externas.test.ts -->
- [x] Un identificador duplicado se rechaza y un proyecto sin la clave queda sin skills externas
      <!-- test: npx vitest run tests/skills-externas.test.ts -->
- [x] Declarar o listar no descarga, instala ni actualiza nada
      <!-- test: npx vitest run tests/skills-externas.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/config.ts`: `readExternalSkills` lee `external-skills`; cada elemento exige `id` (minúsculas y guiones, único), `source`, `version` fijada (se rechazan `latest`, `main`, `master`, `HEAD`, ramas habituales, rangos con `^`, `~`, `>`, `<`, `=` o `*`) y `sha256` de 64 hex; todo error empieza por el nombre de la skill. Sin la clave no hay skills externas.
- `packages/engine/src/external-skills.ts` (nuevo): `estadoDeSkillsExternas` devuelve cada skill con su estado «declarada»; solo lee la configuración.
- `packages/cli/src/commands.ts` y `main.ts`: `valmen skills external` lista las declaradas; no descarga, instala ni actualiza nada y avisa que la habilitación exige una revisión registrada.
- `tests/skills-externas.test.ts` (nuevo): declaración válida, rechazos con el nombre de la skill, duplicados, forma inválida y que lista y estado no cambian el disco.
- La revisión que habilita, la proyección a los clientes y las skills concretas son de otros tickets.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/skills-externas.test.ts` → 16 pruebas pasan.
- Suite completa: `npx vitest run` → 193 archivos, 2800 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
- Manual (responsable): declarar una skill en `external-skills` de `.valmen/config.yaml` y correr `valmen skills external`.
<!-- verify: manual -->

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
    "at": "2026-10-07T18:03:49.456Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T18:23:00.114Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T18:27:41.659Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (recibo GR-20261007-SECURITY-ENGINE-SKILLS-TERCEROS-20261007-analysis-1, canal mission-control, decidida 2026-10-07T18:27:41.656Z): A"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T18:27:41.924Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:55.351Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A\",\"planHash\":\"sha256:58262a369a2651c4d1a2daf234cc7005c3b8b5edaa26eaa0f0c5d530b3a095fb\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:55.596Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:58262a369a2651c4d1a2daf234cc7005c3b8b5edaa26eaa0f0c5d530b3a095fb."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:55.596Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T18:29:55.846Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T18:34:55.355Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
