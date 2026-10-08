---
schema_version: 2
id: FEATURE-ADAPTER-SKILLS-UX-20261007
title: Integrar UI UX Pro Max en el diseño e Impeccable en la revisión de pantallas, con el informe como evidencia sin bloquear
type: FEATURE
module: ADAPTER
workflow_status: planned
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

# FEATURE-ADAPTER-SKILLS-UX-20261007

## Solicitud original

Parte del sprint: La revisión de UX usa UI UX Pro Max e Impeccable en los tickets que tocan pantallas, como evidencia.
- R-SKILL-003: La revisión de UX DEBERÍA usar UI UX Pro Max e Impeccable en los tickets que tocan pantallas
Depende de: SECURITY-CLI-REVISION-SKILLS-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La revisión de UX DEBERÍA usar UI UX Pro Max e Impeccable en los tickets que tocan pantallas
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Ids de las dos skills: el código no declara ninguna skill de terceros todavía. El plan usa `ui-ux-pro-max` e `impeccable` como ids en `external-skills`. Pregunta al PO: ¿se declaran con esos ids?
- Proyección a los runtimes: el plan no copia las skills habilitadas a `.claude/skills` ni a los demás runtimes; el agente las lee de `.valmen/external-skills/<id>/`. Pregunta al PO: ¿la proyección a los runtimes queda para otro ticket?

## Descripción funcional

- Alcance: que un ticket que toca pantallas reciba, antes de la entrega, un informe de UX registrado como evidencia, que reúna el chequeo de colores de `revisar_presentacion`, el estado de las skills de terceros `ui-ux-pro-max` (UI UX Pro Max, sistema de diseño) e `impeccable` (Impeccable, revisión de la pantalla) y, si existe, el informe que produjo Impeccable; y que las skills de proceso del catálogo indiquen usar UI UX Pro Max en el diseño e Impeccable en la revisión cuando estén habilitadas. Fuera: descargar, instalar o actualizar las dos skills (es de una persona, R-SKILL-001 y R-SKILL-002), proyectarlas a `.claude/skills`, `.codex/skills`, `.opencode/skills` o `.agents/skills`, y cualquier bloqueo de la entrega por el informe.
- Usuario o rol afectado: el agente que diseña o revisa un ticket con pantallas y la persona responsable que recibe la entrega y lee la evidencia del ticket.
- Comportamiento actual: la revisión de pantallas se reduce a `revisar_presentacion`, que solo avisa de colores fijos, no deja nada en el ticket y no conoce las skills de terceros; las skills de proceso no nombran UI UX Pro Max ni Impeccable, así que aunque una persona las declare y las revise quedan sin uso en el flujo.
- Comportamiento esperado: con las dos skills habilitadas, la planificación de un ticket con pantallas se apoya en UI UX Pro Max y la revisión previa a la entrega en Impeccable junto con `revisar_presentacion`; `valmen ux review --id <ID>` (y la herramienta MCP `revisar_ux`) anexa al ticket una evidencia `ux-review` con el resultado; con las skills ausentes o no habilitadas la evidencia lo dice con el motivo; un cambio sin archivos de interfaz no anexa nada; en ningún caso el comando falla ni bloquea la entrega por lo que el informe encuentre (R-SKILL-003: «NO DEBE bloquear la entrega por sí solo»).

## Diagnóstico

- Memoria consultada: `buscar_memoria` con «skills de terceros revisión UX revisar_presentacion evidencia informe pantallas» devolvió solo aprendizajes de compuertas (AP-001, AP-004 a AP-009); ninguno trata este síntoma ni lo tiene resuelto.
- Causa comprobada (con `ruta:línea`): el síntoma es que la revisión de UX no usa las skills de terceros y no deja evidencia en el ticket. Se comprobó leyendo el código: (1) `revisar_presentacion` en `packages/mcp/src/tools.ts:1634` y su caso en `packages/mcp/src/tools.ts:3048` solo llaman a `scanPendingColors` (`packages/engine/src/presentation.ts:310`) y devuelven el texto de `renderColorReport` (`packages/engine/src/presentation.ts:335`); la herramienta está anotada `SOLO_LEE` y no escribe el ticket; (2) el estado de las skills de terceros existe en `estadoDeSkillsExternas` (`packages/engine/src/external-skills.ts:113`), que devuelve «declarada», «sin-revisión», «habilitada» o «deshabilitada» con su motivo, pero el único consumidor es `skillsExternalCommand` (`packages/cli/src/commands.ts:3043`): ningún flujo de revisión lo consulta; (3) las skills del catálogo que guían el diseño y la revisión, `skills/planificacion/SKILL.md` (versión 1.1.0) y `skills/revision-final/SKILL.md` (versión 1.2.0), no nombran UI UX Pro Max ni Impeccable, y el texto del flujo en `packages/adapter/src/templates.ts:79` solo pide `revisar_presentacion`; (4) el registro de evidencia append-only ya existe en `addEvidence` (`packages/engine/src/append.ts:221`), con tipo, descripción y referencia, y no lo usa ninguna revisión de presentación. La causa es que falta el eslabón que une las tres piezas: qué cuenta como «toca pantallas» (ya resuelto por `isUiFile`, `packages/engine/src/presentation.ts:62`, sobre `pendingChanges`, `packages/engine/src/diff.ts:76`), el estado de las dos skills y el registro de la evidencia.
- Hipótesis pendientes: (a) que el informe de Impeccable sea un archivo de texto que el agente escribe junto al ticket y que `resolveReference` de `packages/engine/src/append.ts` lo acepte como referencia relativa; se confirma con una prueba al implementar; (b) que UI UX Pro Max e Impeccable se declaren con los ids `ui-ux-pro-max` e `impeccable` (ver Supuestos y decisiones pendientes).
- Consumidores afectados: comprobado con búsqueda que `estadoDeSkillsExternas` lo llaman solo `skillsExternalCommand` y las pruebas `tests/skills-externas.test.ts` y `tests/revision-skills.test.ts`, que no cambian porque el módulo nuevo solo lo lee; `scanPendingColors` lo llaman `revisar_presentacion` y el comando de presentación del CLI, que no cambian; la lista de herramientas de lectura y escritura de `packages/server/src/hermes.ts:180` debe clasificar la herramienta nueva; la deriva del catálogo (`derivaPublicada`, `packages/adapter/src/skills.ts:549`) compara las copias de `.valmen/skills/` contra `skills/`, así que el cambio de catálogo exige subir la versión y actualizar la copia del proyecto en el mismo cambio.
- Archivos y flujo investigados: `packages/engine/src/external-skills.ts` (declaración, hash, revisión y estado), `packages/adapter/src/config.ts:1109` (`readExternalSkills`), `packages/engine/src/presentation.ts` (archivos de interfaz y colores), `packages/engine/src/diff.ts` (cambios pendientes), `packages/engine/src/append.ts` (evidencia), `packages/mcp/src/tools.ts` (herramienta `revisar_presentacion`), `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` (comandos `skills external` y `skills review`), `packages/adapter/src/projection.ts:129` y `packages/adapter/src/skills.ts` (proyección y catálogo), `packages/adapter/src/templates.ts:79` y las skills `skills/planificacion`, `skills/revision-final`, `.valmen/skills/validacion-ui` y `.valmen/skills/desarrollo-frontend`. Flujo: el agente cambia una pantalla → antes de entregar corre la revisión → hoy recibe solo el aviso de colores en la conversación; con el cambio, el informe queda en `## Evidencia` del ticket.
- Riesgos y compatibilidad: (a) el informe no bloquea: el comando sale con código 0 aunque haya colores fijos o falte el informe de Impeccable, y ninguna compuerta lo lee; (b) el harness nunca instala ni ejecuta UI UX Pro Max ni Impeccable: solo consulta su estado; usarlas es leer su `SKILL.md` de `.valmen/external-skills/<id>/` cuando están habilitadas, y una skill «deshabilitada» por contenido cambiado no se nombra como utilizable; (c) la evidencia es append-only, así que correr la revisión dos veces anexa dos entradas y no reescribe ninguna; (d) subir la versión de dos skills del catálogo hace que los proyectos adoptados vean deriva hasta que una persona corra `valmen sync`, que es el comportamiento previsto del catálogo; (e) un proyecto sin `external-skills` sigue funcionando: la evidencia dice que las skills no están declaradas.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente de la aprobación explícita del PO; el ticket se detiene en `planned` con el recibo de la compuerta `plan`.
- Alcance: el informe de UX como evidencia, su comando y su herramienta MCP, y la guía de uso de UI UX Pro Max e Impeccable en las skills del catálogo y en el texto del flujo. Exclusiones: descargar, instalar, actualizar o proyectar las skills de terceros a los runtimes; cualquier bloqueo de entrega por el informe; cambios en `revisar_presentacion`, que sigue siendo de solo lectura.
- Dependencias: SECURITY-ENGINE-SKILLS-TERCEROS-20261007 y SECURITY-CLI-REVISION-SKILLS-20261007, ambos `closed`, que aportan `readExternalSkills` y `estadoDeSkillsExternas`.
- Pasos ordenados:
  1. Crear `packages/engine/src/ux-review.ts` con la constante `SKILLS_DE_UX` (`ui-ux-pro-max` para el diseño, `impeccable` para la revisión) y `revisarUx({ paths, ticketId, informe?, staged? })`: toma los archivos de interfaz del cambio con `pendingChanges` e `isUiFile`; si no hay ninguno devuelve «sin pantallas» sin escribir; si hay, toma los colores con `scanPendingColors`, el estado y el motivo de las dos skills con `estadoDeSkillsExternas` (o «no declarada»), y anexa una evidencia `ux-review` con `addEvidence` cuya descripción dice archivos revisados, colores fijos, el estado de cada skill y si hay informe de Impeccable, y cuya referencia es el informe cuando se pasa; nunca falla por hallazgos. Exportarlo desde `packages/engine/src/index.ts`. (C1, C2, C3, C4, C5)
  2. En `packages/cli/src/commands.ts` agregar `uxReviewCommand` y en `packages/cli/src/main.ts` registrar `ux review --id <ID> [--report <ruta>] [--staged]` con su ayuda, que imprime el informe y sale con código 0 con o sin hallazgos. (C6)
  3. En `packages/mcp/src/tools.ts` agregar la herramienta `revisar_ux` con la anotación de las que anexan y los mismos argumentos, y clasificarla en la lista de herramientas que escriben de `packages/server/src/hermes.ts`. (C7)
  4. En `skills/planificacion/SKILL.md` (1.1.0 → 1.2.0) agregar que el diseño de un ticket con pantallas se apoya en UI UX Pro Max cuando `valmen skills external` la muestra habilitada, leyendo `.valmen/external-skills/ui-ux-pro-max/SKILL.md`; en `skills/revision-final/SKILL.md` (1.2.0 → 1.3.0) agregar que antes de entregar un cambio con pantallas se revisa con Impeccable si está habilitada, se guarda su informe junto al ticket y se corre `valmen ux review --id <ID> --report <ruta>`, y que el informe es evidencia que no bloquea; copiar ambas a `.valmen/skills/` y agregar la misma línea en `packages/adapter/src/templates.ts:79`. (C8, C9)
  5. Crear `tests/revision-ux.test.ts` con un caso por criterio C1 a C7 sobre un repositorio git temporal, y actualizar en `tests/plantillas-compactas.test.ts` la versión que fija `versionPublicada("planificacion")` (1.1.0 → 1.2.0) y la de `revision-final` si la fija; correr `npx vitest run tests/revision-ux.test.ts`, `npx vitest run tests/skills-externas.test.ts tests/revision-skills.test.ts`, `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`; regenerar la proyección con `valmen sync` y comprobar con `valmen sync --check`. (C1 a C9)
- Pruebas: en la raíz del repositorio, `npx vitest run tests/revision-ux.test.ts` y `npx vitest run` deben pasar en verde; `npx tsc --noEmit -p tsconfig.json` sin errores; `valmen sync --check` sin deriva. Manual: en un ticket de prueba con un `.html` modificado, `valmen ux review --id <ID>` anexa una evidencia `ux-review` y sale con 0. Sin requisitos de entorno ni de red.
- Impactos declarados: ninguno; no hay sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket; las evidencias `ux-review` ya anexadas quedan como historial append-only y no las lee ningún flujo; las dos skills del catálogo vuelven a su versión anterior con el mismo revert y `valmen sync`.

## Criterios de aceptación

- [ ] C1. (R-SKILL-003) Con un cambio que modifica un archivo de interfaz y las dos skills habilitadas, `revisarUx` anexa al ticket una evidencia de tipo `ux-review` que nombra ambas skills como habilitadas
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C2. Con una skill no declarada, sin revisión o deshabilitada, la evidencia dice su estado y su motivo
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C3. Con colores fijos en el cambio, la evidencia cuenta los hallazgos y la revisión termina sin error
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C4. Un cambio sin archivos de interfaz no anexa ninguna evidencia
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C5. El informe de Impeccable que se pasa queda como referencia de la evidencia
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C6. `valmen ux review --id <ID>` sale con código 0 cuando hay hallazgos
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C7. La herramienta MCP `revisar_ux` anexa la misma evidencia que el comando
      <!-- test: npx vitest run tests/revision-ux.test.ts -->
- [ ] C8. Las skills `planificacion` y `revision-final` del catálogo nombran UI UX Pro Max e Impeccable con su condición de habilitadas
      <!-- verify: manual -->
- [ ] C9. La suite completa pasa sin regresiones
      <!-- test: npx vitest run -->

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
    "at": "2026-10-07T18:03:49.735Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T23:47:51.699Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T23:48:18.067Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
