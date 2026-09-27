---
schema_version: 2
id: IMPROVEMENT-SKILLS-PUBLICADAS-20260926
title: Publicar las skills de proceso desde el harness
type: IMPROVEMENT
module: SKILLS
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-26
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-SKILLS-PUBLICADAS-20260926

## Solicitud original

La idea es que si alguien instala el harness de ValmenTech tenga acceso a eso, entonces no creo que deban ir solo en el skill de Hermes. La idea es que si reforzamos el diseño de una skill, o en este caso de la planificación, aplique para los otros proyectos; porque si no, en ValmenHarness tendríamos tipos de planificación diferentes que en SaiOpenCloud.

## Descripción funcional

- Alcance: las skills de **proceso** del harness —planificación, pruebas, revisión, entrega— pasan a publicarse desde el repositorio del harness. Las skills del **stack** siguen siendo del proyecto.
- Usuario o rol afectado: quien instala y adopta el harness (PO y agentes), y los proyectos ya adoptados que hoy tienen su propia copia.
- Comportamiento actual: cada proyecto guarda su copia en `.valmen/skills/<id>/SKILL.md` y la proyecta a los runtimes declarados en `runtimes:`; nada compara esa copia con una versión publicada. La skill `valmen` —cómo se usa el harness— ya se escribe desde el código en el directorio global de skills del agente, con el motivo escrito: describe algo que es igual en todos los proyectos.
- Comportamiento esperado: el harness publica las de proceso con versión; `adopt` las instala en el proyecto adoptado; `sync` las actualiza; `sync --check` nombra la deriva contra la versión publicada; y las publicadas se instalan además en el directorio global de skills del agente, para que cualquier proyecto y cualquier perfil las tenga sin un paso por proyecto. Las skills del proyecto no se tocan.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/skills.ts` (lee `.valmen/skills/<id>/SKILL.md` y proyecta por runtime, con el encabezado que nombra la fuente; su comentario declara la intención «una sola fuente y una proyección por runtime»), `packages/adapter/src/mcp.ts:636-768` (`HERMES_SKILL_ID = "valmen"`, `hermesSkill()`, `hermesSkillPath()` → `~/.hermes/skills/valmen/SKILL.md`, con el motivo: esa skill «es el mismo en todos los proyectos»), `packages/adapter/src/adopt.ts:91`, `packages/adapter/src/projection.ts:118`, y los subcomandos `adopt` y `sync` en `packages/cli/src/main.ts`.
- Causa raíz o hipótesis: la «única fuente» quedó implementada **por proyecto**. `sync --check` compara el `SKILL.md` del proyecto contra sus proyecciones, nunca contra una versión publicada, así que cada proyecto es su propia verdad y no hay detector de deriva. Está medido: `planificacion` tiene 81 líneas en ValmenHarness y 77 en SaiOpenCloud, y a la segunda le falta el bloque literal que el motor reconoce para registrar la aprobación del gate de plan (`- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).`); en la otra dirección, `descomposicion` existe en SaiOpenCloud y no en el harness. Dos proyectos, dos verdades.
- Riesgos y compatibilidad: los proyectos ya adoptados tienen copias editadas a mano que no deben pisarse en silencio —el check las tiene que nombrar y `sync` decidir con el PO—; la ruta y la forma de las proyecciones no cambian, y `SKILL.md` sigue siendo el archivo que los runtimes leen, así que un proyecto que no actualice el harness sigue funcionando igual.
- Impactos de sync, migración, Docker o despliegue: sync — es el corazón del cambio (check de versión y capa global); migración — las copias actuales de dos proyectos quedan como versión anterior y su alineación se decide caso por caso; Docker y despliegue — ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-09-26, para el alcance completo del plan, en respuesta a «Aprobado: arrancá con el paso 1 y vamos viendo» sobre la propuesta del plan que la compuerta evaluó APPROVE.
- Pasos ordenados:
  1. Publicar el catálogo en `skills/<id>/SKILL.md` del repositorio del harness, una por skill de proceso (`planificacion`, `pruebas-unitarias`, `revision-final`, `feature`, `descomposicion`), con `version:` y `origen: valmen` en el frontmatter y el mismo `id` que usa `.valmen/skills/`.
  2. En `packages/adapter/src/skills.ts`, leer el catálogo publicado y exponer `versionPublicada(id)`, `hashPublicado(id)`, `publicada(id)` y `publicadas()`.
  3. En `packages/adapter/src/adopt.ts`, escribir las publicadas en `.valmen/skills/<id>/SKILL.md` del proyecto adoptado, sin tocar las del proyecto.
  4. En `packages/adapter/src/skills.ts`, extender el check de `sync` para comparar la copia del proyecto contra la publicada por versión y por hash, y nombrar la skill, las dos versiones y la copia editada a mano.
  5. En `packages/adapter/src/skills.ts`, hacer que el check de versión recorra sólo `publicadas()`, de modo que las skills del proyecto queden fuera.
  6. En `packages/adapter/src/skills.ts`, mantener el mensaje `Archivos generados al día.` del check cuando la copia del proyecto coincide con la publicada.
  7. En `packages/adapter/src/skills.ts`, hacer que `sync` escriba en `.valmen/skills/<id>/SKILL.md` el contenido publicado cuando la copia esté en una versión anterior, y que deje `local.md` como está.
  8. En `packages/adapter/src/mcp.ts`, instalar las publicadas en el directorio global de skills del agente (`hermesSkillsDir()`), junto a la skill `valmen`.
  9. En `packages/adapter/src/skills.ts`, concatenar `local.md` —si existe— al final del `SKILL.md` publicado en cada proyección, y no escribir nunca ese archivo.
  10. Documentar el reparto y la extensión sin bifurcar en `docs/07-ADAPTADORES.md` y `docs/08-ADOPCION.md`.
  11. Alinear contra el catálogo las dos copias divergentes de hoy (`ValmenHarness/.valmen/skills/planificacion` y `SaiOpenCloud/.valmen/skills/planificacion`) y decidir con el PO qué queda en `local.md`.
- Rollback: quitar `skills/` y las llamadas nuevas de `adopt` y `sync`; las rutas y las proyecciones quedan como hoy, y ninguna copia de proyecto se toca por el solo hecho de revertir.

## Criterios de aceptación

- [x] El catálogo publicado existe en el repositorio del harness: el archivo `skills/planificacion/SKILL.md`.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] El catálogo declara su versión: el frontmatter de `skills/planificacion/SKILL.md` incluye `version:`.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] El catálogo declara su origen: el frontmatter de `skills/planificacion/SKILL.md` incluye `origen: valmen`.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] El adaptador expone la versión publicada: `versionPublicada("planificacion")` devuelve la del catálogo.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] `adopt` instala la publicada en el proyecto adoptado: tras adoptar un registro temporal, `.valmen/skills/planificacion/SKILL.md` coincide con el catálogo.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] `sync --check` imprime `Archivos generados al día.` cuando la copia del proyecto coincide con la publicada.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] `sync --check` nombra la deriva con las dos versiones cuando la copia del proyecto está en una versión anterior.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] `sync --check` nombra la copia editada a mano cuando el contenido de la publicada fue alterado.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] `sync` deja la copia del proyecto igual al catálogo publicado.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] `sync` conserva el contenido de `local.md` tras actualizar la copia.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] La proyección concatena `local.md`: el archivo proyectado en `.opencode/skills/planificacion/SKILL.md` termina con el contenido de `local.md`.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] El check de versión compara las skills publicadas: su salida nombra `planificacion` entre las comparadas.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] La capa global queda instalada: con un `HERMES_HOME` temporal, la instalación escribe `skills/planificacion/SKILL.md`.
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->

## Puntos

```json
[]
```

## Implementación

**El catálogo.** `skills/<id>/SKILL.md` en el repositorio del harness, con `version:` y `origen: valmen` en el frontmatter. Publica cuatro: `planificacion`, `pruebas-unitarias`, `revision-final` y `feature`. El adaptador lo lee desde su propia ruta (`CATALOGO_DIR` en `packages/adapter/src/skills.ts`), no desde el directorio de trabajo, así que la misma llamada sirve desde el repositorio, desde `dist/` y desde un proyecto adoptado en cualquier parte del disco.

**La capa global.** `instalarPublicadasEnHermes()` (`packages/adapter/src/mcp.ts`) escribe las publicadas en el directorio global de skills del agente, y `valmen hermes connect` las instala junto a la skill `valmen` (`instalarSkill` en `packages/cli/src/hermes.ts`). Política de esa capa: **no pisa** una copia distinta sin `--force` —misma regla que la skill del harness—, porque ahí no hay versión publicada con la que comparar y una copia distinta suele ser una edición del usuario.

**La comparación.** `derivaPublicada()` compara versión y sha256 y distingue tres motivos: `falta`, `version` y `editada`. `sync --check` nombra el id, el motivo y las dos versiones; `sync` instala y actualiza. **`sync` pisa una copia editada a mano**, y es deliberado: el check la nombra antes, y quien ejecuta `sync` acepta el reemplazo. La edición deliberada tiene su sitio en `.valmen/skills/<id>/local.md`, que la proyección concatena al final y `sync` nunca toca.

**Lo que se apartó del plan, dicho.** El paso 1 listaba cinco skills; publiqué cuatro. `descomposicion` quedó fuera porque su única copia —la de SaiOpenCloud— se declara a sí misma «las reglas de reparto de SaiOpenCloud y no las generales», y publicarla como genérica sería una skill que miente en el proyecto siguiente. Cuando exista una versión genérica, entra al catálogo sin tocar código.

**Dos cosas que aparecieron al implementar.** (1) `sync --check` ganó una línea que nombra las publicadas comparadas —el criterio 12 la exige— y `tests/adapters.test.ts` comparaba esa salida por igualdad exacta: se cambió a comprobar el mensaje, porque la línea nueva es deliberada. (2) La `planificacion` del harness tenía un bloque de código mal cerrado —la cerca de cierre llevaba texto en la misma línea, así que el párrafo siguiente entraba al bloque—: se corrigió **al publicar**, y los dos proyectos lo recibieron con su `sync`. Es el primer efecto real del catálogo: un arreglo de texto que antes había que repetir en cada copia.

**La alineación de las copias divergentes** (paso 11). `valmen sync` en el repositorio del harness: cuatro skills actualizadas. `valmen sync` en SaiOpenCloud: cuatro actualizadas —`planificacion` con la cerca corregida y la versión, las otras tres con la versión—, y ninguna skill del proyecto tocada: `desarrollo-backend`, `desarrollo-frontend`, `desarrollo-agente-local`, `descomposicion` y `validacion-ui` quedaron como estaban. Los dos registros responden ahora lo mismo: `Skills publicadas comparadas: feature, planificacion, pruebas-unitarias, revision-final`.

**Documentación:** `docs/07-ADAPTADORES.md` suma la sección 8 —las tres capas, la regla de reparto, cómo se extiende sin bifurcar y qué significa cada veredicto del check— y `docs/08-ADOPCION.md` dice que la adopción instala las de proceso además de la configuración.

## Pruebas

<!-- El contrato de pruebas para el responsable, en la sección siguiente. -->

| Comando | Resultado |
|---|---|
| `npx vitest run tests/skills-publicadas.test.ts` | 16 pasan |
| `npx vitest run tests/adapters.test.ts tests/skills-publicadas.test.ts tests/skills.test.ts` | 62 pasan (3 archivos) |
| `npm test` | 1.432 pasan, 48 omitidas |
| `npm run build` | en verde |
| `npm run typecheck` | en verde |
| `valmen sync --check` en el harness | `Archivos generados al día.` y las cuatro publicadas comparadas |
| `valmen sync --check` en SaiOpenCloud | `Archivos generados al día.` y las mismas cuatro comparadas |

Resultado del PO: «listo pasan las pruebas cierra, verifica todo, haces el commit y push» — corrió el contrato de pruebas y lo aprobó el 2026-09-26.

### Contrato de pruebas para el responsable

1. `npx vitest run tests/skills-publicadas.test.ts` — las trece afirmaciones del catálogo: que existe con versión y origen, que `adopt` lo instala sin tocar lo del proyecto, que el check nombra la deriva y la edición a mano, que `sync` actualiza sin pisar `local.md`, que la proyección lo concatena y que la capa global se instala.
2. `npm test` — la suite entera: 1.432 pasan, 48 omitidas.
3. En el repositorio del harness y en SaiOpenCloud: `valmen --root <raíz> sync --check` debe imprimir `Archivos generados al día.` y nombrar las cuatro publicadas comparadas.
4. A ojo, en los dos proyectos: `.valmen/skills/<id>/SKILL.md` de las cuatro publicadas empieza con `version: 1.0.0` y `origen: valmen`, y las skills del proyecto —`desarrollo-*`, `descomposicion`, `validacion-ui`— no llevan esos campos porque nadie las tocó.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-27",
    "build_reference": "commit:3497d3012ba5d6193128de20891e0dfc517c6fc0",
    "environment": "darwin/27.0.0/node v22.16.0",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "listo pasan las pruebas cierra, verifica todo, haces el commit y push"
  }
]
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-27",
    "technical_summary": "El harness publica las skills de proceso en skills/<id>/SKILL.md con version y origen, y el proyecto las recibe por adopt y sync. Tres capas: publicada, global del agente y del proyecto; la comparacion de sync --check distingue falta, version y editada y nombra el id con las dos versiones; lo que el proyecto agrega va en local.md, concatenado al proyectar y nunca escrito por sync. El catalogo lee su ruta desde el propio modulo, no desde el directorio de trabajo.",
    "functional_summary": "Dos proyectos ya no pueden tener criterios de planificacion distintos sin que nadie se entere: el check lo dice, con las dos versiones. Adoptar o sincronizar deja las cuatro skills de proceso iguales en todos, y un arreglo de texto se hace una vez y llega a todos con el sync.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "No cambia la interfaz ni los datos del registro. Los proyectos adoptados antes del catalogo reciben las publicadas con valmen sync; ninguno pierde sus skills de proyecto."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": null,
    "model": "typesafe/jev-1.13-20260917",
    "reasoning_effort": null,
    "notes": "Las compuertas de este ticket, sumadas de los recibos: seis corridas del gate de plan (cuatro en banda de revision mientras se corrigio el plan y dos approve) mas el gate mecanico con coste 0, sobre el commit 3497d30.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": 0.001012,
    "source": "process:.valmen/receipts/IMPROVEMENT-SKILLS-PUBLICADAS-20260926.jsonl",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "20260926_182737_425c0d",
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesion de Hermes que trabajo este ticket es la misma que ya declaro su costo en FEATURE-ENGINE-REANUDAR-COMPACTO-20260926 (CONSUMO-001, 0.229688 del modelo gpt-6-luna). Registrarla otra vez contaria dos veces el mismo gasto; el modelo con el que se trabajo despues, deepseek-v4.1-flash, informa coste 0.0 en ~/.hermes/state.db: no hay numero nuevo que declarar y no se inventa ninguno.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion 20260926_182737_425c0d",
    "confidence": "low",
    "id": "CONSUMO-002"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-26",
    "at": "2026-09-27T03:30:15.414Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-26",
    "at": "2026-09-27T03:33:05.300Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-26",
    "at": "2026-09-27T03:33:05.478Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-26",
    "at": "2026-09-27T03:37:34.782Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-26",
    "at": "2026-09-27T03:47:12.259Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-26",
    "at": "2026-09-27T03:48:08.254Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:07.464Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:07.687Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:07.862Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:08.044Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:08.235Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:08.414Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:08.772Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-26",
    "at": "2026-09-27T03:53:08.955Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
