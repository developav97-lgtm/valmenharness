---
schema_version: 2
id: FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010
title: Proyección de la carpeta de referencias junto al SKILL.md
type: FEATURE
module: ADAPTER
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010

## Solicitud original

Parte del sprint: Las skills tienen presupuesto con aviso en sync, referencias proyectadas y catálogo recortado bajo un tope.
- R-SKL-003: Las skills que pasan el tope DEBEN recortarse sin perder reglas
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Las skills que pasan el tope DEBEN recortarse sin perder reglas
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-SKL-003: lo cubre IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010 (Recorte de skills sin perder reglas y prueba del tope del catálogo)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la parte de R-SKL-003 que toca la proyección, según la decisión D7 de `.valmen/features/guardas-verificacion-harness/design.md:64-72`: una skill puede tener una carpeta `referencias/` con archivos `*.md` junto a su `SKILL.md`, y `valmen sync` la copia junto al `SKILL.md` en cada runtime proyectado; `valmen sync --check` la compara igual que el `SKILL.md`. Para las skills publicadas, la carpeta viaja también del catálogo (`skills/<id>/referencias/`) a la copia del proyecto y a la capa global de Hermes. Fuera de alcance: recortar skills y mover texto a referencias (R-SKL-002 y el resto de R-SKL-003, ticket IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010).
- Usuario o rol afectado: el agente que carga una skill en Claude Code, Codex, OpenCode o Hermes (`.agents/skills`), y quien mantiene las skills del proyecto o del catálogo.
- Comportamiento actual: solo existe el `SKILL.md`; cualquier otro archivo de `.valmen/skills/<id>/` se ignora al proyectar, al instalar publicadas y al comprobar la deriva. Una skill que citara `referencias/x.md` quedaría con la cita rota en los cuatro runtimes.
- Comportamiento esperado: cada `.valmen/skills/<id>/referencias/<nombre>.md` aparece byte a byte en `<runtime>/skills/<id>/referencias/<nombre>.md` de cada runtime en alcance, la cita relativa desde el `SKILL.md` proyectado resuelve, y `sync --check` nombra una referencia que falta o que se editó a mano.

## Diagnóstico

Es un requisito nuevo, sin síntoma previo (AP-005, `.valmen/memory/aprendizajes.md:41`): la «causa» es la ausencia del comportamiento, comprobada en el código. `buscar_memoria` («proyección de skills archivos adicionales referencias») no devolvió un caso resuelto; AP-011 (`.valmen/memory/aprendizajes.md:92`) es el antecedente de recorte, no de proyección.

- Causa comprobada (con `ruta:línea`):
  - `readSkills` solo lee `SKILL.md` y `local.md` de cada carpeta (`packages/adapter/src/skills.ts:213`, `:232-246`); `SkillDefinition` no tiene campo para otros archivos (`packages/adapter/src/skills.ts:33-66`).
  - `renderSkill` devuelve un único archivo con ruta `${SKILL_RUNTIMES[runtime]}/${skill.id}/SKILL.md` (`packages/adapter/src/skills.ts:268`, `:295`), y `renderAllSkills` emite uno por skill y runtime (`packages/adapter/src/skills.ts:377-385`); por eso `projectFiles` no incluye nada más bajo la carpeta de la skill (`packages/adapter/src/projection.ts:231`) ni lo lista en `sources` (`packages/adapter/src/projection.ts:165-170`).
  - `sync` escribe exactamente `projection.files` (`packages/cli/src/commands.ts:948-950`) y `sync --check` compara exactamente esa lista (`packages/cli/src/commands.ts:907-912`): lo que la proyección no emite ni se escribe ni se compara.
  - Catálogo publicado: `publicadas` lee solo `skills/<id>/SKILL.md` y su huella es el hash de ese texto (`packages/adapter/src/skills.ts:450`, `:468-494`, `hashDeTexto` en `:434`); `instalarPublicadas` copia solo ese archivo a `.valmen/skills/<id>/SKILL.md` (`packages/adapter/src/skills.ts:632-645`); `derivaPublicada` compara versión y hash del `SKILL.md` y nada más (`packages/adapter/src/skills.ts:549-590`). Una referencia publicada no llegaría al proyecto y una editada a mano no se detectaría.
  - Hermes global: `instalarPublicadasEnHermes` escribe solo `<hermes>/skills/<id>/SKILL.md` (`packages/adapter/src/mcp.ts:885-910`, ruta en `:893`).
- Qué hace cada runtime con los archivos adicionales de la carpeta de una skill (evidencia real):
  - Claude Code: carga solo el `SKILL.md` y antepone «Base directory for this skill: <ruta>»; el resto se lee bajo demanda con la herramienta de lectura. Recibo: la carga de `planificacion` en esta misma sesión mostró esa línea con `.claude/skills/planificacion`, y las skills sincronizadas en `~/.claude/skills/synced/*/skill-creator/references/` siguen ese patrón.
  - OpenCode (`/opt/homebrew/Cellar/opencode-v2/2.0.16/bin/opencode`): el binario contiene «Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory», «Base directory for this skill:» y el bloque `<skill_files>`: lista los archivos de la carpeta y los deja para lectura bajo demanda; no los incrusta.
  - Codex: el binario no está instalado en esta máquina; la evidencia es su skill de sistema `~/.codex/skills/.system/skill-creator/SKILL.md:42` y `:72` («references/ … loaded as needed»), con carpetas `references/`, `scripts/`, `assets/` reales al lado. Ninguno de los tres carga los archivos adicionales en el contexto de forma automática: se leen solo si el `SKILL.md` los cita y el agente lo decide.
  - Consecuencia: los archivos que el `SKILL.md` no cita no se cargan en ningún runtime; por eso la proyección copia la carpeta tal cual (la cita relativa `referencias/<nombre>.md` resuelve contra el directorio base) y el recorte de otro ticket es responsable de citar cada referencia.
- Hipótesis pendientes:
  - Hermes (`.agents/skills`, comentario en `packages/adapter/src/skills.ts:89-100`): no hay binario para comprobarlo; se supone el mismo directorio base del estándar. No cambia el plan: la copia es la misma en los cuatro runtimes.
  - El prompt MCP de una skill (`packages/mcp/src/prompts.ts:101-125`, cuerpo vía `skillText`, `packages/adapter/src/skills.ts:365`) sirve el texto sin directorio base: una cita relativa no resuelve ahí. Se deja fuera de este ticket y se declara como exclusión del plan; el agente con acceso al disco tiene la fuente en `.valmen/skills/<id>/referencias/`.
- Consumidores afectados:
  - `projectFiles` (`packages/adapter/src/projection.ts:142`, `:151`, `:231`) y sus tres consumidores: `syncProject` (`packages/cli/src/commands.ts:898`), Mission Control (`packages/server/src/config.ts:250`, `:295`) y el worktree (`packages/engine/src/worktree.ts:124`, solo toma `settings.json`, no le afecta).
  - `instalarPublicadas` (`packages/cli/src/commands.ts:891`, `:1440`) y `derivaPublicada` (`packages/cli/src/commands.ts:917`).
  - `instalarPublicadasEnHermes` (`packages/cli/src/hermes.ts:523`).
  - `readSkills` también lo usan `packages/cli/src/hermes.ts:1247` y `packages/mcp/src/prompts.ts:101`, `:116`: el campo nuevo de `SkillDefinition` no les cambia el comportamiento.
  - La medida de `skill-budget` (`packages/adapter/src/projection.ts:178-188`) mide el `SKILL.md` renderizado; las referencias no cuentan contra el tope, que es lo que D7 busca.
- Archivos y flujo investigados: `.valmen/skills/<id>/{SKILL.md,local.md}` → `readSkills` → `withRoutedRules` → `renderAllSkills` → `projectFiles` (filtro `enAlcance` por `RUNTIME_DIRS`, `packages/adapter/src/projection.ts:158-160`) → `syncProject` escribe o compara. Catálogo `skills/<id>/SKILL.md` → `publicadas` → `instalarPublicadas` (antes de proyectar, `packages/cli/src/commands.ts:887-891`) y `derivaPublicada`. Worktrees: `.valmen/skills/` está versionado y llega por git; los directorios de runtime están ignorados en este repositorio (`.gitignore:25-27`, `:34`), igual que hoy el `SKILL.md` proyectado, y `.worktreeinclude` solo lleva `.claude/settings.json` (`packages/adapter/src/claude-code.ts:262-266`). La carpeta `referencias/` no cambia esa situación.
- Riesgos y compatibilidad:
  - Sin carpeta `referencias/` la proyección queda byte a byte igual: ningún proyecto adoptado ve diferencias en `sync --check` tras actualizar.
  - La proyección solo escribe y nunca borra (`packages/adapter/src/skills.ts:99-100`): una referencia eliminada de la fuente queda huérfana en los runtimes. Se mantiene esa política (compartir `.agents/` con otras herramientas) y se declara como limitación conocida.
  - Copiar subcarpetas o archivos que no son `.md` abriría la puerta a binarios o scripts en la proyección: se limita a `referencias/*.md` del primer nivel, en orden por nombre para que la proyección sea determinista.
  - Exportaciones nuevas deben tener consumidor (`npm run exports:check`).
- Impactos de sync, migración, Docker o despliegue: ninguno de sync de datos, migración, contenedores ni despliegue; cambia la proyección de archivos de `valmen sync`, que es local y reversible regenerando.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 19 criterios y el alcance: sin el prompt MCP ni el borrado de huérfanos.
- Alcance (R-SKL-003, parte de la proyección; decisión D7): proyectar `.valmen/skills/<id>/referencias/*.md` junto al `SKILL.md` en cada runtime en alcance, compararla en `sync --check`, y llevar la carpeta del catálogo publicado al proyecto y a Hermes, con su deriva. Solo archivos `*.md` del primer nivel de `referencias/`, copiados byte a byte (sin marca de generado: la cita relativa y el contenido son el contrato), en orden por nombre.
- Exclusiones: el recorte de skills y las citas a referencias en los `SKILL.md` (IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010); el prompt MCP de la skill (`packages/mcp/src/prompts.ts`), que no tiene directorio base; borrar referencias huérfanas en los runtimes (la proyección solo escribe, `packages/adapter/src/skills.ts:99-100`); subcarpetas y archivos que no son `.md`.
- Tamaño previsto: unas 140 líneas de producción (`skills.ts` ~100, `projection.ts` ~5, `mcp.ts` ~30) y unas 300 de pruebas; entra en un ticket.
- Pasos ordenados:
  1. `packages/adapter/src/skills.ts`: campo opcional `referencias?: readonly { readonly nombre: string; readonly contenido: string }[]` en `SkillDefinition` (opcional, para no romper los literales de `withRoutedRules` y de las pruebas), función privada `leerReferencias(carpeta)` que lee `referencias/` del primer nivel, filtra `*.md` que son archivos y ordena por nombre; `readSkills` la usa. Sin exportaciones nuevas. (C4, C5, C6)
  2. `packages/adapter/src/skills.ts`, `renderAllSkills`: por cada skill y runtime emite, tras el `SKILL.md`, un `RenderedSkill` por referencia con ruta `${SKILL_RUNTIMES[runtime]}/${skill.id}/referencias/${nombre}` y el contenido sin cambios. `renderSkill` no cambia, así que la medida de `skill-budget` (`packages/adapter/src/projection.ts:178-188`) sigue midiendo solo el `SKILL.md`. (C1, C3, C10)
  3. `packages/adapter/src/projection.ts`: `sources` suma `.valmen/skills/<id>/referencias/<nombre>`; el filtro `enAlcance` existente deja fuera los runtimes no declarados. `syncProject` (`packages/cli/src/commands.ts:907-912`, `:948-950`) no cambia: escribe y compara la lista que recibe. (C2, C7, C8, C9)
  4. `packages/adapter/src/skills.ts`, catálogo: `Publicada` gana `referencias` (mismo tipo), leídas por `publicadas` con `leerReferencias`; `instalarPublicadas` escribe cada referencia en `.valmen/skills/<id>/referencias/<nombre>` si falta o difiere (idempotente, devuelve el id una vez); `derivaPublicada` agrega el motivo `"referencia"` con el campo `referencia` y el detalle `falta` o `editada`, y `descripcionDeDeriva` lo imprime con el id y la ruta. (C11, C12, C13)
  5. `packages/adapter/src/mcp.ts`, `instalarPublicadasEnHermes`: parámetro opcional `dir` (por defecto `CATALOGO_DIR`, consumidor de prueba y de `packages/cli/src/hermes.ts:523`) y copia de las referencias con la misma política que el `SKILL.md`: una existente distinta va a `pendientes` salvo `forzar`. (C14, C15)
  6. Pruebas nuevas en `tests/skill-referencias.test.ts`, una prueba parametrizada por regla con `it.each`: proyección por runtime (los cuatro), qué se copia (`.md` sí, `.txt` no, subcarpeta no), orden, `sync --check` (falta, editada, al día), presupuesto, instalación y deriva publicada (falta, editada) y Hermes (nueva, editada sin forzar). Fixtures en directorios temporales con catálogo propio pasado por `dir`; no se toca `skills/` real. (C1–C15)
  7. Regresión y guardas: `npx vitest run tests/skills.test.ts tests/skills-publicadas.test.ts tests/skill-presupuesto.test.ts tests/agent-projection.test.ts`, `npx tsc -b` y `node scripts/exports-sin-uso.mjs`. (C16, C17, C18)
  8. Verificación manual en Claude Code: una skill de prueba en `.valmen/skills/` con `referencias/ejemplo.md` citada desde su `SKILL.md`, `valmen sync`, cargarla y comprobar que el agente lee `.claude/skills/<id>/referencias/ejemplo.md` desde el directorio base; luego se borra la skill de prueba. (C19)
- Impactos declarados: ninguno de sincronización de datos, migración ni contenedores; solo cambia lo que `valmen sync` escribe en los directorios de runtime y en `.valmen/skills/` de las publicadas.
- Compatibilidad: sin carpeta `referencias/` la proyección, la instalación y la deriva quedan byte a byte iguales (C3); el catálogo actual no tiene referencias, así que ningún proyecto adoptado ve cambios hasta el ticket de recorte.
- Rollback (obligatorio): revertir el commit del ticket y correr `valmen sync`; las referencias ya escritas en los runtimes quedan como archivos ignorados que se borran a mano (`.claude/skills/*/referencias/`, `.codex/…`, `.opencode/…`, `.agents/…`), sin efecto sobre el `SKILL.md`.

## Criterios de aceptación

- [x] C1. `valmen sync` escribe cada `referencias/<nombre>.md` de una skill, con el mismo contenido, en `<runtime>/skills/<id>/referencias/` de cada runtime en alcance.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C2. Un runtime fuera de `runtimes` en la configuración no recibe la referencia.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C3. Una skill sin carpeta `referencias/` produce la misma lista de archivos proyectados que antes del cambio.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C4. Un archivo de `referencias/` que no termina en `.md` no se proyecta.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C5. Una subcarpeta dentro de `referencias/` no se proyecta.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C6. Las referencias de una skill se proyectan en orden por nombre.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C7. `valmen sync --check` nombra la referencia proyectada que falta en un runtime.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C8. `valmen sync --check` nombra la referencia proyectada que se editó a mano.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C9. `valmen sync --check` responde «Archivos generados al día.» cuando las referencias proyectadas coinciden con la fuente.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C10. El aviso de `skill-budget` no suma el tamaño de las referencias de la skill.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C11. `valmen sync` copia la referencia de una skill publicada del catálogo a `.valmen/skills/<id>/referencias/`.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C12. `valmen sync --check` nombra la referencia publicada que falta en `.valmen/skills/<id>/referencias/`.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C13. `valmen sync --check` nombra la referencia publicada que se editó a mano en el proyecto.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C14. La instalación global de Hermes escribe la referencia publicada junto al `SKILL.md`.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C15. La instalación global de Hermes deja como pendiente una referencia global editada cuando no se pasa `forzar`.
      <!-- test: npx vitest run tests/skill-referencias.test.ts -->
- [x] C16. Las pruebas existentes de skills, publicadas, presupuesto y proyección de agentes siguen pasando.
      <!-- test: npx vitest run tests/skills.test.ts tests/skills-publicadas.test.ts tests/skill-presupuesto.test.ts tests/agent-projection.test.ts -->
- [x] C17. El monorepo compila sin errores de tipos.
      <!-- test: npx tsc -b -->
- [x] C18. La guarda de exportaciones sin uso no encuentra hallazgos.
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [ ] C19. En Claude Code, una skill proyectada que cita `referencias/ejemplo.md` lee ese archivo desde su directorio base.
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/skills.ts`: `SkillDefinition.referencias` opcional; `leerReferencias` (solo `*.md` de primer nivel, por nombre); `renderAllSkills` emite cada referencia tras el `SKILL.md`; `Publicada.referencias`; `instalarPublicadas` las copia; deriva con motivo `referencia` (`falta` o `editada`) y su descripción.
- `packages/adapter/src/projection.ts`: las referencias entran en `sources`; el filtro de runtimes existente las deja fuera donde no aplica.
- `packages/adapter/src/mcp.ts`: `instalarPublicadasEnHermes` copia las referencias con la política del `SKILL.md` (distinta sin `forzar` va a `pendientes`); el catálogo se pasa por `options.dir` (por defecto `CATALOGO_DIR`).
- `scripts/exports-sin-uso.linea-base.json`: se quita `CATALOGO_DIR`, que ahora consume `mcp.ts` (no se agrega ninguna entrada).
- Pruebas: `tests/skill-referencias.test.ts`, una prueba parametrizada por regla, escrita antes y observada en rojo (13 de 17 fallaban).

## Pruebas

Directorio: raíz del worktree/repositorio. Requisitos: Node 24, `npm install` hecho; sin servicios.

- `npx vitest run tests/skill-referencias.test.ts tests/skills.test.ts tests/skills-publicadas.test.ts tests/skill-presupuesto.test.ts tests/agent-projection.test.ts tests/adapters.test.ts` → 6 archivos, 112 pruebas en verde (C1-C16).
- `npx tsc -b` → sin errores (C17).
- `node scripts/exports-sin-uso.mjs` → «Sin exportaciones nuevas sin consumidor» (C18).
- Validación manual (C19, sin verificar): en un proyecto de prueba crear `.valmen/skills/<id>/referencias/ejemplo.md` citada desde su `SKILL.md`, correr `valmen sync`, cargar la skill en Claude Code y comprobar que lee `.claude/skills/<id>/referencias/ejemplo.md`; luego borrar la skill de prueba. No correr `valmen sync` sobre un proyecto real sin saber que escribe reglas `deny` en `.claude/settings.json`.

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
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesión no expone números de consumo; implementación con claude-sonnet-5-5.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-sin-agregado",
    "confidence": "low",
    "id": "CONSUMO-001"
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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:33.625Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T03:39:13.294Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T03:41:17.468Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T03:43:52.822Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010-plan-1, canal cli, decidida 2026-10-11T03:43:52.818Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T03:43:53.174Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado)\",\"planHash\":\"sha256:aca2d90834b0fb35fc23e2ba31edc1f97f66320cf782b5e4cd4984de9c381f00\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T03:43:53.512Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:aca2d90834b0fb35fc23e2ba31edc1f97f66320cf782b5e4cd4984de9c381f00."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T03:43:53.512Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-11T03:44:13.192Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-11T03:46:17.308Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-10",
    "at": "2026-10-11T03:47:17.146Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
