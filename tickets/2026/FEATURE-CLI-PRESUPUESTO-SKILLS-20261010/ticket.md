---
schema_version: 2
id: FEATURE-CLI-PRESUPUESTO-SKILLS-20261010
title: Clave skill-budget y aviso de valmen sync por skill que lo pasa
type: FEATURE
module: CLI
workflow_status: approved
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

# FEATURE-CLI-PRESUPUESTO-SKILLS-20261010

## Solicitud original

Parte del sprint: Las skills tienen presupuesto con aviso en sync, referencias proyectadas y catálogo recortado bajo un tope.
- R-SKL-001: `valmen sync` DEBE avisar de cada skill que pasa el presupuesto declarado
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: `valmen sync` DEBE avisar de cada skill que pasa el presupuesto declarado
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: R-SKL-001 (`.valmen/features/guardas-verificacion-harness/spec/s7-skills/spec.md:13-23`) con la decisión D7 (`.valmen/features/guardas-verificacion-harness/design.md:64-72`): una clave nueva de `.valmen/config.yaml`, `skill-budget`, en bytes por skill y con la misma forma y validación que `agents-md-budget`; `valmen sync` y `valmen sync --check` avisan de cada skill proyectada que la pasa, con sus bytes y su estimación de tokens; el aviso no bloquea y sin la clave no hay aviso. Incluye declarar `skill-budget: 6500` en el `.valmen/config.yaml` de este repositorio (D7) y documentar la clave junto al presupuesto de `AGENTS.md`. Fuera: la prueba del tope del catálogo (R-SKL-002) y el recorte de las skills (R-SKL-003), que son de IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010; la carpeta de referencias, de FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010; el prompt MCP de las skills y la plantilla de `valmen adopt`.
- Usuario o rol afectado: quien corre `valmen sync` o `valmen sync --check` —una persona o el CI de este repositorio (`.github/workflows/verificacion.yml:80`)— en un proyecto que declare la clave, y los agentes, que cargan cada skill entera al activarla.
- Comportamiento actual: no existe presupuesto de skills. `sync` ignora la clave en silencio: con `skill-budget: 6500` proyecta `planificacion` con 10 747 B sin ningún aviso y sale con 0, y con `skill-budget: mucho` también sale con 0 (reproducción en el diagnóstico). El único tope que hay es una prueba particular de 6 500 B para `corrida-orquestada` (`tests/skill-corrida-orquestada.test.ts:26` y `:57-59`).
- Comportamiento esperado: con `skill-budget: 6500`, `sync` escribe todo como hoy, sale con 0 y agrega un «Aviso:» por cada skill que pasa el tope, con su nombre, sus bytes, sus tokens estimados (`bytes / 4`), el tope y cuánto sobra; `sync --check` repite esos avisos con la salida al día (código 0) y los lleva junto al error cuando hay archivos desactualizados; una skill que cabe no se nombra; sin la clave no hay aviso; un valor que no sea un entero de bytes de al menos 1 000 hace fallar la proyección con un mensaje que nombra `skill-budget`.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad que falta, no un defecto; comprobado leyendo el código y corriendo el binario del worktree.
  1. El presupuesto solo existe para `AGENTS.md`. `projectFiles` mide únicamente ese documento (`packages/adapter/src/projection.ts:168-170`) y sus `warnings` solo llevan ese aviso y los conflictos de `allow` de Claude Code (`packages/adapter/src/projection.ts:234-237`). La única clave de presupuesto que se lee es `agents-md-budget` (`packages/adapter/src/agents-size.ts:45-57`), con `readString` (`packages/adapter/src/config.ts:61-68`); `skill-budget` no aparece en `packages/`, `tests/` ni `docs/`.
  2. Reproducción con `node packages/cli/dist/main.js --root <laboratorio> sync` (binario del worktree, laboratorio temporal con `name: Demo` y `skill-budget: 6500`): `sync` instaló las 8 skills del catálogo, proyectó `planificacion` con 10 747 B (fuente 10 584 B) y salió con 0 sin aviso; `sync --check` respondió «Archivos generados al día» sin aviso y con 0; con `skill-budget: mucho`, `sync --check` también salió con 0. La clave se ignora, que es justo lo que la validación de `agents-md-budget` existe para impedir (`packages/adapter/src/agents-size.ts:41-44`).
  3. Dónde sale el aviso: `syncProject` (`packages/cli/src/commands.ts:882-1005`) ya imprime cada entrada de `proyeccion.warnings` en los tres caminos sin cambiar el código de salida —`sync` (`packages/cli/src/commands.ts:1002`), `--check` al día por `lineasDeTamano` (`packages/cli/src/commands.ts:863-868`, usada en `:942-945`) y `--check` desactualizado (`packages/cli/src/commands.ts:938`)—. Un aviso que entre en `Projection.warnings` llega a los tres sin tocar el CLI.
  4. Qué es «la skill» que carga el agente: `renderSkill` (`packages/adapter/src/skills.ts:268-298`) escribe el frontmatter reducido a `name` y `description` (`:290`), el cuerpo, las reglas encaminadas por `rules-to-skills` (`:286-288`), la marca de generado (`:270-280`) y, después de ella, `local.md` (`:292`, leído por `readSkills` en `:239-246`). El contenido no depende del runtime, solo la ruta (`:294-295`): medido en el laboratorio, las cuatro copias de `planificacion` pesan lo mismo (10 828 B con un `local.md` de 81 B). Tamaños de este repositorio, fuente → proyectado: `planificacion` 10 584 → 10 747, `programar-trabajo-de-tickets` 11 772 → 11 950, `feature` 6 668 → 6 825, `revision-final` 6 554 → 6 718, `corrida-orquestada` 6 125 → 6 293; las otras siete, entre 3 668 y 4 651 B de fuente y 4 818 B como máximo proyectadas. Con 6 500 B pasan las mismas cuatro midiendo una cosa u otra.
  5. Skills que no son del catálogo: `readSkills` (`packages/adapter/src/skills.ts:213-250`) lee todas las de `.valmen/skills/`, publicadas o propias. Este repositorio tiene doce: ocho copias del catálogo `skills/` y cuatro propias (`desarrollo-agente-local`, `desarrollo-backend`, `desarrollo-frontend`, `validacion-ui`). La copia de una publicada la reescribe `sync` (`instalarPublicadas`, `packages/adapter/src/skills.ts:632-645`), así que recortarla en `.valmen/skills/` no sirve; se distingue por `origen: valmen` (`packages/adapter/src/skills.ts:200-201`, exigido en `publicadas`, `:481-486`).
  - Memoria: `valmen memory search` con «presupuesto skills tamaño sync aviso», «skill tamaño bytes», «agents-md-budget» y «presupuesto AGENTS.md» solo devuelve AP-011 (`.valmen/memory/aprendizajes.md:92`): el tope de 20 000 caracteres de `projectRulesFor` (`packages/engine/src/decompose.ts:114` y `:136`) dejaba la skill de descomposición fuera del prompt del arquitecto. Es otro mecanismo —un recorte del prompt, no la proyección— y no resuelve este ticket; confirma que el tamaño de una skill ya tuvo un coste.
- Hipótesis pendientes:
  - H1 (qué se mide): se propone medir el contenido proyectado de cada skill, el que el agente carga, como el presupuesto de `AGENTS.md` mide el documento proyectado (`packages/adapter/src/projection.ts:113-118`). Medir solo el `SKILL.md` fuente dejaría fuera las reglas que `rules-to-skills` mueve desde `AGENTS.md`, que es lo que el aviso de `AGENTS.md` recomienda (`packages/adapter/src/agents-size.ts:93-94`), y el `local.md` del proyecto. Coste: unos 160 a 180 B de marca respecto de la fuente. Se fija en el plan.
  - H2 (coherencia con R-SKL-002): si la prueba del catálogo de IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010 mide la fuente `skills/<id>/SKILL.md` y `sync` mide la proyección, una skill de entre unos 6 330 y 6 500 B de fuente pasaría la prueba y avisaría en `sync`. Queda anotado para ese ticket; aquí no se implementa.
  - H3 (mínimo): se asume el mismo mínimo de 1 000 B que `agents-md-budget` (`packages/adapter/src/agents-size.ts:18`); la skill más chica del repositorio pesa 3 668 B.
- Consumidores afectados:
  - `projectFiles` (`packages/adapter/src/projection.ts:138-239`) gana la lectura de la clave y los avisos. Sus llamadores: `syncProject` (`packages/cli/src/commands.ts:898`); Mission Control, `projectionImpact` y `syncProjections` (`packages/server/src/config.ts:250` y `:295`), que solo leen `.files`; y los worktrees, `dejarDenegacionesEnElWorktree` (`packages/engine/src/worktree.ts:124`), que solo lee `.files`. Un `skill-budget` inválido los hace fallar igual que hoy un `agents-md-budget` inválido: `projectionImpact` devuelve `null` (`packages/server/src/config.ts:247-255`), `syncProjections` devuelve el error (`packages/server/src/config.ts:292-302`) y el worktree lanza para deshacerse (`packages/engine/src/worktree.ts:120-121`).
  - `syncProject` (`packages/cli/src/commands.ts:854-868`, `:938` y `:1002`): imprime los avisos nuevos sin cambio de código; el comentario de `lineasDeTamano` habla solo de `AGENTS.md`.
  - Pruebas que corren `syncProject` en laboratorios sin la clave y exigen que no haya «Aviso» (`tests/proyeccion-denegados.test.ts:321`, `tests/agents-md-tamano.test.ts:620-630`): no cambian, porque sin la clave no hay aviso.
  - La guarda de exportaciones (`npm run exports:check`, `scripts/exports-sin-uso.mjs`; `knip.json` cuenta `tests/**/*.test.ts` como consumidores): cada símbolo nuevo tendrá consumidor en `packages/adapter/src/projection.ts` o en la prueba nueva; `agents-size.ts` ya se reexporta desde `packages/adapter/src/index.ts:16`.
  - El CI de este repositorio (`.github/workflows/verificacion.yml:80`) corre `sync --check`: con `skill-budget: 6500` mostrará cuatro avisos hasta el recorte de R-SKL-003, con código 0.
  - Documentación: `docs/07-ADAPTADORES.md:274-291` (§6.3 «Presupuesto de tamaño») describe solo `agents-md-budget`.
- Archivos y flujo investigados: `packages/adapter/src/agents-size.ts` (completo), `packages/adapter/src/skills.ts` (completo: `parseSkill`, `readSkills`, `renderSkill`, `renderAllSkills`, `publicadas`, `instalarPublicadas`), `packages/adapter/src/projection.ts` (completo), `packages/adapter/src/config.ts:61-68`, `packages/adapter/src/index.ts:16`, `packages/cli/src/commands.ts:840-1005`, `packages/server/src/config.ts:240-300`, `packages/engine/src/worktree.ts:115-130`, `tests/agents-md-tamano.test.ts:39-60`, `:231-320` y `:613-687` (el patrón de pruebas a repetir), `tests/skill-corrida-orquestada.test.ts:20-30` y `:57-59`, `tests/skills.test.ts:189-200`, `tests/dogfooding-registro.test.ts:59-69` (la cabecera de `AGENTS.md` lista `.valmen/config.yaml` sin hash: declarar la clave no cambia la proyección), `knip.json`, `scripts/exports-sin-uso.mjs:1-60`, `.valmen/config.yaml`, `docs/07-ADAPTADORES.md:274-321`, la spec S7 y D7. Flujo: `valmen sync` → `syncProject` → `instalarPublicadas` → `projectFiles` → `readSkills` + `withRoutedRules` → `renderAllSkills` → escritura, y los `warnings` → salida.
- Riesgos y compatibilidad:
  - Opcional: sin la clave nada cambia. Ningún proyecto adoptado ve avisos nuevos ni cambia su `sync --check`.
  - El aviso no cambia el código de salida ni impide escribir: una skill pasada de tamaño sigue siendo la que el proyecto declaró.
  - Un valor inválido hace fallar la proyección, como el precedente: un proyecto que lo escriba mal ve fallar `sync`, Mission Control y la creación de worktrees hasta corregirlo, con un mensaje que nombra la clave.
  - Ruido esperado: en este repositorio, cuatro avisos en cada `sync` hasta que R-SKL-003 recorte; es el objetivo del sprint.
  - La marca lleva `ADAPTER_VERSION` (`packages/adapter/src/skills.ts:274`): subir de versión mueve el tamaño medido en pocos bytes.
  - Riesgos residuales H1, H2 y H3, declarados arriba.
- Impactos de sync, migración, Docker o despliegue: ninguno. El «sync» de este ticket es la proyección de archivos del harness, no sincronización de datos; no hay migraciones, contenedores ni despliegue, y ningún archivo generado cambia de contenido: solo la salida del comando y la validación de una clave nueva.

## Plan

- Alcance y exclusiones: R-SKL-001 completo —la clave `skill-budget`, su validación, la medición de cada skill proyectada y su aviso en `sync` y `sync --check`—, más declarar `skill-budget: 6500` en el `.valmen/config.yaml` de este repositorio (D7) y documentarla en `docs/07-ADAPTADORES.md` §6.3. Fuera: R-SKL-002 (prueba del tope del catálogo y retiro del tope de `tests/skill-corrida-orquestada.test.ts`) y R-SKL-003 (recorte), de IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010; la carpeta de referencias, de FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010; el prompt MCP (`skillText`), Mission Control y la plantilla de `valmen adopt`.
- Decisiones de diseño (confirman D7 y resuelven H1 y H3 del diagnóstico):
  - Qué se mide (H1): el contenido **proyectado** de cada skill, el que escribe `renderSkill` (`packages/adapter/src/skills.ts:268-298`) y carga el agente: frontmatter, cuerpo, reglas encaminadas por `rules-to-skills`, marca de generado y `local.md`. No se mide además la fuente: una sola cifra por skill, la que pesa de verdad, como el presupuesto de `AGENTS.md` mide el documento proyectado. Se mide una vez por skill y no por runtime, porque el contenido es el mismo en los cuatro (diagnóstico, causa 4). Para el ticket de R-SKL-002 queda anotado (H2) que su prueba debería medir igual, renderizando la skill, o aceptar el margen de la marca; aquí no se toca.
  - Skill que no es del catálogo: el presupuesto se aplica a **todas** las skills de `.valmen/skills/`, publicadas y propias; solo cambia la indicación de dónde recortar. Una con `origen: valmen` la publica el harness y `sync` reescribe su copia, así que el aviso remite al catálogo del harness (`skills/<id>/SKILL.md`) y a `local.md` para lo propio; una propia remite a `.valmen/skills/<id>/SKILL.md` y a su `local.md`.
  - Validación (H3): la misma que `agents-md-budget`, con el mismo mínimo de 1 000 B: sin la clave, `null` y sin aviso; un valor que no sea un entero de al menos 1 000 falla con un mensaje que nombra `skill-budget`. Se extrae un ayudante privado `leerPresupuesto(config, clave, ejemplo)` en `packages/adapter/src/agents-size.ts` que usan las dos claves; el mensaje de `agents-md-budget` queda idéntico.
  - Forma del aviso: uno por skill, en orden de id (`readSkills` ya ordena), después del aviso de `AGENTS.md` y antes de los conflictos de `allow`: «La skill `<id>` pasa del presupuesto: <bytes> B (~<tokens> tokens) contra <tope> B, <sobra> B de más. <dónde recortar>», con los miles separados por espacio como el de `AGENTS.md`.
  - Superficie nueva en `packages/adapter/src/agents-size.ts`, cada símbolo con consumidor para la guarda de exportaciones: `SKILL_BUDGET_MIN` (prueba), `readSkillBudget(config)` (`projection.ts` y prueba), `interface SkillSize extends AgentsMdSize { id; publicada }` (`projection.ts`), `measureSkill(id, content, publicada, budget)` (`projection.ts` y prueba) y `skillWarning(size)` (`projection.ts` y prueba). `Projection` no gana campos: los avisos viajan en `warnings`.
  - Pseudocódigo (`projectFiles`, después de `agentsMdWarning`):
    ```text
    tope = readSkillBudget(model.config)                // null sin la clave; falla si es inválida
    avisosDeSkills = []
    si tope ≠ null:
      para cada skill de skills (orden de id):
        contenido = renderSkill(skill, runtimes[0]).content     // igual en todo runtime
        medida = measureSkill(skill.id, contenido, skill.origen = "valmen", tope)
        aviso = skillWarning(medida); si aviso ≠ null → avisosDeSkills += aviso
    warnings = [avisoDeAgentsMd?, ...avisosDeSkills, ...claudeAllowConflicts]
    ```
  - El CLI no cambia de código: `syncProject` ya imprime cada `warnings` en `sync`, en `--check` al día y en `--check` desactualizado sin tocar el código de salida (`packages/cli/src/commands.ts:863-868`, `:938`, `:1002`).
  - Descartado: (a) medir la fuente `SKILL.md`, que no ve las reglas encaminadas ni `local.md`; (b) medir por runtime, que repetiría cuatro veces el mismo aviso; (c) un campo `Projection.skills`, sin consumidor hoy; (d) que el aviso bloquee `sync --check`, contra R-SKL-001 y el precedente.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 20 criterios atómicos, la medida de la skill proyectada (con `local.md` y la marca) y el aviso sin bloqueo.
- Pasos ordenados:
  1. Crear `tests/skill-presupuesto.test.ts` con el patrón de `tests/agents-md-tamano.test.ts:39-60` (laboratorio en `os.tmpdir()`, `scaffold`, `skill`) y verlo en rojo antes de implementar: lectura y validación de la clave; aviso por skill pasada con bytes y tokens; ausencia de aviso sin clave, con una skill que cabe y justo en el tope; `local.md` sumado a la medida; la indicación de una publicada y de una propia; `syncProject` con y sin `--check`; clave inválida; y la clave declarada en el `.valmen/config.yaml` del repositorio. Las pruebas de `syncProject` usan skills sintéticas con ids propios para no depender del tamaño actual del catálogo, que R-SKL-003 recorta. (C1–C17)
  2. En `packages/adapter/src/agents-size.ts`: el ayudante privado `leerPresupuesto` a partir de `readAgentsMdBudget` (`:45-57`), que pasa a delegar en él; `SKILL_BUDGET_MIN`, `readSkillBudget`, `SkillSize`, `measureSkill` (reusa `measureAgentsMd`, `:60-68`) y `skillWarning` (reusa `conMiles`, `:71-73`); el comentario del módulo (`:1-12`) pasa a hablar de lo que se carga entero: `AGENTS.md` y cada skill. (C3, C4, C7, C8, C15, C16)
  3. En `packages/adapter/src/projection.ts`: importar `readSkillBudget`, `measureSkill`, `skillWarning` y `renderSkill`; después de `agentsMdWarning` (`:170`) calcular los avisos de skills según el pseudocódigo y sumarlos a `warnings` (`:234-237`); actualizar el comentario de `warnings` (`:124`). (C1, C2, C5, C6, C9, C11, C12, C14)
  4. En `packages/cli/src/commands.ts`, solo el comentario de `lineasDeTamano` (`:854-862`) para decir que los avisos incluyen las skills; sin cambio de código, así que el código de salida no cambia. (C10, C13)
  5. En `.valmen/config.yaml`, agregar `skill-budget: 6500` con un comentario de una línea (tope de D7, aviso sin bloqueo). (C17)
  6. En `docs/07-ADAPTADORES.md` §6.3 (`:274-291`), un párrafo y el ejemplo YAML de `skill-budget`: qué mide (la skill proyectada), el mínimo, que avisa sin bloquear y la indicación distinta para publicadas y propias. (C20)
  7. Desde la raíz del worktree, en este orden: `npx tsc --build tsconfig.build.json`; `npx vitest run tests/skill-presupuesto.test.ts`; la regresión `npx vitest run tests/agents-md-tamano.test.ts tests/proyeccion-denegados.test.ts tests/skills.test.ts tests/dogfooding-registro.test.ts`; `node scripts/exports-sin-uso.mjs`; y `node packages/cli/dist/main.js sync --check` para ver los cuatro avisos de este repositorio con código 0. (C18, C19)
- Tamaño previsto: 20 criterios y unas 360 líneas de cambio: unas 110 de producción y documentación (`agents-size.ts` ~70, `projection.ts` ~20, comentario de `commands.ts`, `.valmen/config.yaml` y `docs/07-ADAPTADORES.md`) y unas 250 de prueba (`tests/skill-presupuesto.test.ts`). Dentro del objetivo de 300 a 700 líneas.
- Compatibilidad: sin la clave, `readSkillBudget` devuelve `null` y la proyección, los archivos y la salida son idénticos a hoy; la regresión es `tests/agents-md-tamano.test.ts` y `tests/proyeccion-denegados.test.ts:321`. Con la clave solo cambia la salida (avisos), nunca el código de salida ni los archivos escritos. Ningún archivo generado cambia al declarar la clave en este repositorio: la cabecera de `AGENTS.md` no lleva hash de `.valmen/config.yaml`.
- Impactos declarados: ninguno; el ticket no declara sincronización, migración ni contenedores (`sync_impact`, `migration_impact` y `docker_impact` en false) y no hay despliegue.
- Pruebas previstas: directorio, la raíz del worktree; requisitos, Node 22 o posterior con las dependencias del monorepo instaladas y `npm run build` hecho (la guarda de exportaciones y el `sync --check` usan `dist`); sin red ni credenciales. Resultado esperado: los comandos del paso 7 sin fallos; el último imprime «Archivos generados al día» o la lista de desactualizados, y cuatro avisos de skill (`feature`, `planificacion`, `programar-trabajo-de-tickets`, `revision-final`).
- Rollback (obligatorio): revertir el commit del ticket en su rama (`git revert <hash>`), que quita la clave, sus funciones, los avisos, la línea de `.valmen/config.yaml`, el párrafo de la documentación y la prueba. No hay datos que migrar ni archivos generados que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1 — R-SKL-001: Sin la clave `skill-budget`, `projectFiles` no devuelve ningún aviso de skill.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C2 — R-SKL-001: Una skill `planificacion` de 10 584 B de fuente, con `skill-budget: 6500`, produce un aviso de `projectFiles` que la nombra.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C3 — R-SKL-001: El aviso de una skill da los bytes de su archivo proyectado.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C4 — R-SKL-001: El aviso de una skill da `ceil(bytes / 4)` como tokens estimados.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C5 — R-SKL-001: Una skill que cabe en el presupuesto no aparece en los avisos.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C6 — R-SKL-001: Los bytes medidos de una skill incluyen su `local.md`.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C7 — R-SKL-001: El aviso de una skill con `origen: valmen` remite al catálogo del harness.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C8 — R-SKL-001: El aviso de una skill propia remite a `.valmen/skills/<id>/SKILL.md`.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C9 — R-SKL-001: `syncProject` sin `--check` imprime el aviso de la skill pasada.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C10 — R-SKL-001: `syncProject` sin `--check` sale con 0 cuando hay avisos de skill.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C11 — R-SKL-001: `syncProject` sin `--check` deja escrito el archivo proyectado de la skill pasada.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C12 — R-SKL-001: `syncProject` con `--check` al día imprime el aviso de la skill pasada.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C13 — R-SKL-001: `syncProject` con `--check` al día sale con 0 cuando hay avisos de skill.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C14 — R-SKL-001: La salida de error de `syncProject` con `--check` desactualizado incluye el aviso de la skill.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C15 — R-SKL-001: Un `skill-budget` que no es un entero de al menos 1 000 hace salir a `syncProject` con un código distinto de 0.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C16 — R-SKL-001: El mensaje de error de un `skill-budget` inválido nombra la clave `skill-budget`.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C17 — R-SKL-001: El `.valmen/config.yaml` de este repositorio declara `skill-budget: 6500`.
      <!-- test: npx vitest run tests/skill-presupuesto.test.ts -->
- [ ] C18 — R-SKL-001: Las pruebas existentes del presupuesto de `AGENTS.md`, de la proyección de denegaciones, de las skills y del dogfooding siguen pasando.
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts tests/proyeccion-denegados.test.ts tests/skills.test.ts tests/dogfooding-registro.test.ts -->
- [ ] C19 — R-SKL-001: La guarda de exportaciones no encuentra exportaciones nuevas sin consumidor.
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [ ] C20 — R-SKL-001: `docs/07-ADAPTADORES.md` §6.3 documenta la clave `skill-budget`.
      <!-- verify: manual -->

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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:33.493Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T01:52:46.543Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T01:54:49.892Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T03:32:24.913Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-FEATURE-CLI-PRESUPUESTO-SKILLS-20261010-plan-2, canal cli, decidida 2026-10-11T03:32:24.910Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T03:32:25.220Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado)\",\"planHash\":\"sha256:2238e1e66bc511e9cdc99996f6236cdf61d7decbc0c644ef8234b28ec34957d7\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T03:32:25.518Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:2238e1e66bc511e9cdc99996f6236cdf61d7decbc0c644ef8234b28ec34957d7."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T03:32:25.518Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
