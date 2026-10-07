---
schema_version: 2
id: SECURITY-CLI-REVISION-SKILLS-20261007
title: Registrar la revisión de una persona y deshabilitar la skill si su contenido cambia
type: SECURITY
module: CLI
workflow_status: analyzed
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

# SECURITY-CLI-REVISION-SKILLS-20261007

## Solicitud original

Parte del sprint: Las skills de terceros se declaran con versión fijada y no se habilitan sin una revisión registrada.
- R-SKILL-002: Una skill de terceros DEBE tener una revisión registrada antes de habilitarse
Depende de: SECURITY-ENGINE-SKILLS-TERCEROS-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una skill de terceros DEBE tener una revisión registrada antes de habilitarse
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que una persona registre la revisión de una skill de terceros declarada (R-SKILL-002) y que el harness la deshabilite si su contenido cambia respecto del hash revisado: `valmen skills review <id>` guarda quién revisó, cuándo, con qué frase, qué permisos usa y el hash revisado; el contenido instalado se mide en `.valmen/external-skills/<id>/` y `valmen skills external` muestra el estado de cada skill y el motivo. Fuera de alcance: descargar o instalar la skill (una persona coloca el contenido), proyectarla a los clientes y las skills concretas.
- Usuario o rol afectado: el responsable que habilita una skill de terceros, y el agente, que no puede revisarse a sí mismo ni habilitar una skill.
- Comportamiento actual: una skill de terceros declarada en `external-skills` queda en estado «declarada» (`estadoDeSkillsExternas` en `packages/engine/src/external-skills.ts`); no existe una revisión registrada, no se mide el contenido y ninguna skill puede pasar de declarada a habilitada.
- Comportamiento esperado: el estado de una skill es «declarada» (sin contenido en `.valmen/external-skills/<id>/`), «sin revisión» (hay contenido y no revisión), «habilitada» (hay revisión de una persona con la misma versión y el mismo hash que el contenido y que lo declarado) o «deshabilitada» con el motivo (el contenido cambió respecto del hash revisado, o el hash revisado no es el declarado); `valmen skills review` exige una sesión atendida, responsable, frase literal y los permisos que la skill usa, y solo se puede revisar contenido que coincide con el hash declarado; el registro es append-only.

## Diagnóstico

- Archivos y flujo investigados: la declaración se lee con `readExternalSkills` en `packages/adapter/src/config.ts` y su estado con `estadoDeSkillsExternas` en `packages/engine/src/external-skills.ts`; el comando que la muestra es `skillsExternalCommand` en `packages/cli/src/commands.ts`; la barrera de sesión desatendida es `assertSesionAtendida` en `packages/engine/src/plan-approval.ts`; el patrón de registro append-only con frase literal de una persona es `crearAutorizacion` en `packages/engine/src/qa-authorization.ts`.
- Causa raíz o hipótesis: el síntoma es que una skill de terceros declarada nunca puede quedar habilitada con garantías, porque nada registra quién revisó qué contenido ni detecta que ese contenido cambió después. La causa comprobada es que `estadoDeSkillsExternas` solo conoce el estado «declarada» y que ningún módulo calcula el hash del contenido instalado ni guarda una revisión. La seguridad sale de atar la habilitación al hash exacto del contenido revisado y a una persona con su frase: cualquier cambio posterior invalida la revisión sin que nadie tenga que acordarse. Hipótesis a confirmar al implementar: que un hash estable del directorio (archivos ordenados por ruta relativa, con separadores POSIX) sea reproducible entre máquinas.
- Riesgos y compatibilidad: (a) una revisión se hace sobre contenido que ya está en el disco, nunca sobre algo que el agente traiga; (b) el hash del directorio ignora la metadata del sistema de archivos y cubre rutas y bytes; (c) Consumidores comprobados con búsqueda: `estadoDeSkillsExternas` y `skillsExternalCommand` los llaman el CLI y las pruebas de skills externas, que deben seguir pasando con el estado «declarada» cuando no hay contenido; (d) un proyecto sin skills externas no cambia.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente
- Alcance: el hash del contenido instalado, el registro de revisiones y los estados que se derivan. Exclusiones: descargar o instalar la skill y proyectarla a los clientes.
- Pasos ordenados:
  1. En `packages/engine/src/external-skills.ts` agregar `hashDeContenidoDeSkill(dir)` (sha256 sobre las rutas relativas ordenadas y los bytes de cada archivo regular, sin seguir enlaces simbólicos), `registrarRevisionDeSkill` (anexa a `.valmen/external-skills/reviews.jsonl`: id, versión, hash, actor, frase literal, permisos y fecha; exige sesión atendida con `assertSesionAtendida`, un responsable, una frase no vacía, al menos una línea de permisos —o «ninguno» explícito— y que el hash del contenido coincida con el `sha256` declarado) y `leerRevisionesDeSkills`.
  2. En el mismo `packages/engine/src/external-skills.ts` extender `estadoDeSkillsExternas` para devolver «declarada», «sin-revisión», «habilitada» o «deshabilitada» con su motivo, comparando versión y hash de la última revisión contra lo declarado y contra el hash del contenido en `.valmen/external-skills/<id>/`.
  3. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `skills review <id> --actor … --quote … --permissions "…"` y mostrar en `skills external` el estado con su motivo, sin descargar ni instalar nada.
  4. Crear `tests/revision-skills.test.ts` con un caso por criterio (sin contenido, sin revisión, revisión válida que habilita, contenido cambiado que deshabilita con su motivo, hash revisado distinto del declarado, sesión desatendida, frase o permisos vacíos y que el hash del directorio es estable y cubre rutas y bytes); correr esas pruebas, `npx vitest run tests/skills-externas.test.ts` y `npx vitest run`, y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; sin revisiones el estado sigue siendo el de antes y el registro de revisiones es un archivo nuevo.

## Criterios de aceptación

- [ ] Una persona registra la revisión de una skill con su frase y los permisos que usa, y la skill pasa a habilitada solo si el contenido coincide con el hash declarado
      <!-- test: npx vitest run tests/revision-skills.test.ts -->
- [ ] Si el contenido cambia respecto del hash revisado, la skill queda deshabilitada y el estado dice por qué
      <!-- test: npx vitest run tests/revision-skills.test.ts -->
- [ ] La revisión se rechaza en una sesión desatendida, sin responsable, sin frase o sin permisos declarados
      <!-- test: npx vitest run tests/revision-skills.test.ts -->
- [ ] Una skill declarada sin contenido o sin revisión no queda habilitada
      <!-- test: npx vitest run tests/revision-skills.test.ts tests/skills-externas.test.ts -->

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
    "at": "2026-10-07T18:03:49.585Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T18:40:04.467Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  }
]
```
