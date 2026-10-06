---
schema_version: 2
id: IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006
title: Compactar las plantillas del harness para acercar el AGENTS.md proyectado a la meta de tamaño
type: IMPROVEMENT
module: ADAPTER
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006

## Solicitud original

PO, 2026-10-06: «el de SaiOpenCloud pesa 54 KB y la meta de la feature es unos 22 KB» (pedido de la sesión de IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005). Al cierre de ese ticket se le presentó la decisión sobre cómo acercar el AGENTS.md a esa meta: «A) Ticket nuevo con plan y aprobación → cambia el texto base de todos los proyectos y sus pruebas de contenido, y queda medido contra la meta de 22 KB». Respuesta del PO: «vamos con las recomendads».

Contexto que aporta el agente, no es palabra del PO: R-RESP-001 y R-RESP-005 dejaron el AGENTS.md de SaiOpenCloud (copia de su .valmen/, nada tocado en ValMenTech) en 41 083 B (~10 271 tokens) con la regla de pantalla en las skills, desde 54 425 B (~13 607 tokens). De lo que queda, ~15,6 KB son las tres plantillas fijas del harness en packages/adapter/src/templates.ts (WORKFLOW_TEMPLATE 11 920 B, INVARIANTS_TEMPLATE 876 B, DELIVERY_TEMPLATE 2 668 B) y ~13 KB el texto propio de SaiOpenCloud (.valmen/rules/proyecto.md), que es del proyecto. Detalle y medidas en tickets/2026/IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005/ticket.md, secciones Diagnóstico e Implementación.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
1. Meta de tamaño. Pregunta: ¿los ~22 KB son para el AGENTS.md completo de SaiOpenCloud (con su `proyecto.md` de ~13 KB, que es del proyecto y no se toca desde el harness) o para lo que genera el harness sin reglas propias? Con las plantillas de hoy más el contrato, el AGENTS.md de un proyecto sin reglas pesa ~17 KB; con lo de SaiOpenCloud, ~41 KB.
   **Respuesta del PO (2026-10-06, en la sesión, opción elegida literal):** «A) Solo lo que genera el harness (Recomendado)». La meta aplica a lo que genera el harness; los 22 KB del AGENTS.md completo de SaiOpenCloud quedan fuera de este ticket y pasarían a otro del proyecto (recortar `proyecto.md` o llevarlo a skills), que el agente no abre sin propuesta previa.
2. Qué se queda siempre en AGENTS.md. Pregunta: ¿qué partes de `WORKFLOW_TEMPLATE`, `INVARIANTS_TEMPLATE` y `DELIVERY_TEMPLATE` se consideran reglas que se cargan siempre y cuáles pueden vivir en las skills publicadas (`feature`, `planificacion`, `pruebas-unitarias`, `revision-final`) dejando en AGENTS.md un puntero? Sin esa respuesta el análisis no puede decir qué se recorta.
   **Respuesta del PO (2026-10-06, literal):** «A) Fijo lo que frena una acción (Recomendado)». Fijo: autorización, modo directo y gates de impacto, quién abre ticket, continuar ticket, acciones que nunca se automatizan, invariantes, commits/secretos y memoria. A las skills, con un puntero de una línea: el recorrido de feature, los estados, cómo verificar un criterio, el marcado de criterios y el consumo de IA.
3. Orden con IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005. Pregunta: ese ticket también agrega texto a las plantillas (la QA por agente y la autorización como acción humana); ¿se hace antes o después de este? Si es antes, este parte de un documento más largo.
   **Respuesta del PO (2026-10-06, literal):** «A) Este primero (Recomendado)». QA-AGENTS suma su bloque sobre la plantilla ya compacta; además depende de SECURITY-ENGINE-QA-POR-POLITICA-20261005, que sigue en `intake`.

## Descripción funcional

- Alcance: las tres plantillas fijas que el adaptador inyecta en el `AGENTS.md` de todo proyecto (`WORKFLOW_TEMPLATE`, `INVARIANTS_TEMPLATE`, `DELIVERY_TEMPLATE` en `packages/adapter/src/templates.ts`) y las dos skills publicadas que reciben el detalle que sale de ellas (`planificacion` y `revision-final`). Por la respuesta 1 del PO, la meta aplica a lo que genera el harness; el texto propio de SaiOpenCloud (`proyecto.md`, estándares, stack) no entra. No cubre el aviso de presupuesto en `valmen sync` (otra sesión tiene `commands.ts` en edición) ni el bloque de QA por agente (IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005).
- Usuario o rol afectado: los agentes de todo proyecto que monte el harness (Claude Code, Codex, OpenCode, Hermes por MCP), que leen `AGENTS.md` entero en cada sesión; y quien mantiene un proyecto adoptado, que verá `valmen sync --check` marcar el documento y dos skills publicadas como desactualizados hasta correr `valmen sync`.
- Comportamiento actual: las tres plantillas pesan 15 464 B y, con el contrato de respuesta (887 B), el `AGENTS.md` de un proyecto sin reglas propias pasa de 17 KB; el de SaiOpenCloud pesa 41 083 B (~10 271 tokens) con `rules-to-skills` aplicado a la regla de pantalla. Cada sesión carga completo lo que se consulta a veces: el recorrido de feature (que ya está en la skill `feature`), el diagrama de estados, los detalles de `test-commands`/`test-timeout`, el marcado de criterios (que ya está en `revision-final`) y las reglas de la fuente del consumo de IA.
- Comportamiento esperado: las tres plantillas pesan ≤ 9 400 B (≈ −39 %, con margen sobre el borrador de 9 162 B), conservan íntegras las reglas que frenan una acción y dejan un puntero de una línea donde el detalle vive en una skill publicada; las skills `planificacion` y `revision-final` (v1.1.0) llevan el detalle que salió. Medido sobre una copia de `.valmen/` de SaiOpenCloud, su `AGENTS.md` baja de 41 083 B a ≤ 35 200 B.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/adapter/src/templates.ts:19,248,266`: `WORKFLOW_TEMPLATE` (11 920 B), `INVARIANTS_TEMPLATE` (876 B) y `DELIVERY_TEMPLATE` (2 668 B) = 15 464 B. `packages/adapter/src/project.ts:217-219` las agrega al final de `projectAgentsMd`, y `project.ts:178` inserta antes el `RESPONSE_CONTRACT_TEMPLATE` (887 B). Son texto del harness, igual en todo proyecto; por eso compactarlas mejora a todos y obliga a todos a un `valmen sync`.
  - Medida por sección de `WORKFLOW_TEMPLATE` (bytes): Continuar un ticket 2 639 · Los estándares y cómo crecen 1 509 · Modo directo 1 203 · Cómo se verifica un criterio 1 079 · Estados del ticket 1 011 · Quién decide 919 · Acciones que nunca se automatizan 911 · Antes de diagnosticar 802 · Gates 696 · Antes de registrar 690 · Autorización 238 · encabezado 212. Los 11 920 B incluyen el diagrama de estados y la tabla de gates, que son formato y no regla.
  - Duplicación ya existente entre plantilla y skill publicada: el recorrido de feature (diagrama de `valmen feature new … materialize` y «Hasta el último paso los tickets son un plan») está en `skills/feature/SKILL.md` («El recorrido, en orden», paso 6); el marcado de criterios con `- [x]` está en `skills/revision-final/SKILL.md` («Los criterios se marcan»); el contrato de pruebas con comando, directorio y resultado está en `skills/pruebas-unitarias/SKILL.md` («Entrega al responsable»). Falta en las skills: el diagrama de estados y las máquinas de punto y release, y los detalles de `test-commands`/`test-timeout` y del gate `qa-mechanical` (van a `skills/planificacion/SKILL.md`, que hoy no los dice: sus secciones son De dónde sale el stack, Fuentes y límites, Investigación previa, Contenido del plan, Controles por impacto, Aprobación y transición y Handoff), y las reglas de la fuente del consumo de IA (van a `skills/revision-final/SKILL.md`, que no habla de consumo). `skills/pruebas-unitarias/SKILL.md` y `skills/feature/SKILL.md` no cambian.
  - Catálogo y deriva: las skills se publican desde `skills/<id>/SKILL.md` con `version:` (`packages/adapter/src/skills.ts:450-513`, `publicadas`, `versionPublicada`, `hashPublicado`); `syncProject` las instala antes de proyectar (`packages/cli/src/commands.ts:693-697`) y `sync --check` compara versión y hash contra la copia de `.valmen/skills/<id>/`. Subir la versión a 1.1.0 hace que todo proyecto con la copia 1.0.0 vea el motivo `version` hasta correr `valmen sync`; es el mecanismo previsto, no un efecto lateral. `tests/skills-publicadas.test.ts` lee la versión del catálogo (`:81-92`), no una cifra fija.
  - Pruebas que afirman texto de las plantillas (`tests/adapters.test.ts:204-234`): «## Flujo de trabajo», «## Invariantes de operación», «## Entrega y documentación», «Autorización antes de acción», «Acciones que nunca se automatizan», «los bloques append-only no se reescriben», «### Quién decide que hace falta un ticket», «**La persona, no el agente.**», «el modo por defecto es el directo», «El agente lo dice y se detiene», «aplicar **sobre un proyecto real**». `tests/respuesta-agents-md.test.ts:71` exige `## Flujo de trabajo` después de las reglas. Todas son reglas que la respuesta 2 del PO deja fijas, así que las aserciones se conservan y la compactación debe respetar esas frases; las que no apliquen se actualizan con criterio, no se borran.
  - `tests/dogfooding-registro.test.ts:60-69` exige que `AGENTS.md` sea idéntico a `projectFiles(REPO)`: se regenera con la misma función que usa `valmen sync` (no se edita a mano). El mismo archivo exige que la proyección nombre «modo directo», «triviales», «funcionalidad nueva», «flujo» y «fuente de verdad» (`:35-42`), que salen de `.valmen/rules/proyecto.md` y de la plantilla.
  - Medida de SaiOpenCloud (copia de `.valmen/rules`, `skills`, `agents` y `config.yaml` en el scratchpad de esta sesión, con `rules-to-skills` de `estandares-presentacion` a `desarrollo-frontend` y `validacion-ui`; nada tocado en ValMenTech): 41 083 B, ~10 271 tokens (`bytes / 4`), idéntico a lo que midió la sesión anterior. Reparto: partes del harness 17 052 B (plantillas 15 464, contrato 998 con su encabezado, marca de generado 472, registro 118), estándares `estandares-*` 8 007 B, `proyecto.md` + `stack.md` ~15 988 B. Con las plantillas en ~9 200 B más el contrato, el documento queda en ~34 800 B: los 22 KB completos exigirían además bajar ~13 KB de texto propio, que es del proyecto (respuesta 1).
  - Borrador de comprobación de la meta (scratchpad, no en el repositorio): `WORKFLOW` compacto 6 754 B + `DELIVERY` compacto 1 532 B + `INVARIANTS` sin cambios 876 B = 9 162 B (−6 302 B). Aplicado a la copia de SaiOpenCloud da ~34 781 B. La estimación que se le dio al PO al preguntar («~−7,5 KB», «~33 KB») era optimista; la cifra medida es −6,3 KB y ~34,8 KB, y el criterio de aceptación usa la medida.
  - Memoria: `buscar_memoria` con «plantillas del adaptador AGENTS.md tamaño presupuesto rules-to-skills Por qué compacto» solo devuelve AP-001 (un criterio compuesto bloquea el gate de plan por banda), que se aplica a la redacción de los criterios de este ticket: uno por afirmación. No hay decisión previa sobre el tamaño de las plantillas. AP-010 (la proposición `corresponde_a_la_investigacion` da ~0 si el plan crea o toca archivos que el diagnóstico no nombra) se aplica así: este diagnóstico nombra todos los archivos que el plan agrega o modifica.
  - Archivos que el plan modifica: `packages/adapter/src/templates.ts`, `skills/planificacion/SKILL.md`, `skills/revision-final/SKILL.md`, `.valmen/skills/planificacion/SKILL.md` y `.valmen/skills/revision-final/SKILL.md` (copias que instala `valmen sync`), `AGENTS.md` (regenerado), `tests/adapters.test.ts`, `docs/07-ADAPTADORES.md` (§6 y §8), este `ticket.md` y `tickets/index.md`. Archivo que el plan crea: `tests/plantillas-compactas.test.ts`. Archivos que **no** toca: `packages/cli/src/commands.ts` y `tests/agents-md-tamano.test.ts` (cambios sin commitear de otra sesión), `packages/adapter/src/machine-bindings.ts`, `skills/feature/SKILL.md`, `skills/pruebas-unitarias/SKILL.md`, `packages/mcp/src/prompts.ts`, y todo `/Users/juanandrade/Desktop/ValMenTech`.
- Causa raíz o hipótesis: **síntoma** —el `AGENTS.md` de SaiOpenCloud carga 41 083 B (~10 271 tokens) en cada sesión contra una meta de ~22 KB, y 15 464 B de ese peso son las tres plantillas del harness, iguales en todo proyecto—. **Causa** —las plantillas se escribieron como documentación completa y se cargan en cada sesión, aunque casi la mitad es procedimiento que se consulta al hacer una fase concreta (estados, verificación de criterios, marcado, fuente del consumo) o ya está repetido en una skill publicada (recorrido de feature, marcado, contrato de pruebas). El mecanismo para repartir ya existe (skills publicadas con versión, `rules-to-skills` para texto del proyecto) pero las plantillas, que son texto del harness, nunca se repartieron: R-RESP-005 compactó el «Por qué» y encaminó la regla de pantalla, que son del proyecto. Es una hipótesis comprobada con la medida y con un borrador de 9 162 B, no una prueba de que ningún agente deje de seguir una regla: el riesgo de que un cliente no cargue la skill es real y se acota en «Riesgos».
- Riesgos y compatibilidad:
  - Un cliente que no carga skills pierde el detalle movido. Mitigación: por la respuesta 2 del PO queda fijo todo lo que frena una acción; lo que se mueve lo exige el motor (el gate `qa-mechanical` detiene al criterio sin anotación, `preparar_cierre` rechaza un cierre sin consumo, `reanudar_ticket` calcula el siguiente paso y `mover_ticket` rechaza un salto de estado ilegal) y cada punto de movimiento deja un puntero de una línea con el nombre de la skill. Riesgo residual: un agente sin skills tarda en descubrir el detalle por el rechazo del motor, no por la lectura.
  - Cobertura del impacto declarado (el cambio no mueve datos, pero sí lo que proyecta `valmen sync` en todo proyecto): cada riesgo de esta lista nombra su mitigación o su límite. Todo proyecto adoptado verá `sync --check` fallar en `AGENTS.md`, y `planificacion` y `revision-final` marcadas por `version`, hasta correr `valmen sync`. Es el efecto buscado, igual que con el contrato de respuesta, y se dice en la entrega y en `docs/07-ADAPTADORES.md`.
  - Una copia local de `planificacion` o `revision-final` editada a mano en un proyecto se reemplaza al sincronizar (motivo `editada`, deliberado); el check lo nombra antes y el sitio de una edición propia es `local.md`.
  - Compactar redacción puede quitar un matiz: la sección «Modo directo» explica por qué un repositorio que es el producto no sigue la regla de proyecto real; se conserva la distinción en dos frases. Las aserciones de `tests/adapters.test.ts` fijan las frases clave y una prueba nueva fija las siete acciones que nunca se automatizan.
  - Otra sesión tiene `packages/cli/src/commands.ts` y `tests/agents-md-tamano.test.ts` modificados sin commitear. No se tocan ni se mezclan en el commit; si la suite completa falla por ellos se dice y se separa de lo de este ticket. Regenerar `AGENTS.md` mientras otra sesión corre la suite puede dar un rojo transitorio en `dogfooding-registro`.
  - QA-AGENTS (R-QAAG-009) agregará su bloque a la plantilla después de este ticket (respuesta 3); este ticket no lo anticipa ni reserva espacio.
- Impactos de sync, migración, Docker o despliegue: ninguno de sincronización de datos, migración, Docker ni despliegue. Sí cambia lo que genera `valmen sync` en todo proyecto (`AGENTS.md` y dos skills publicadas): `sync --check` los marca desactualizados hasta correr `valmen sync`. No se corre `valmen sync` ni se toca ningún archivo de ValMenTech; SaiOpenCloud se mide sobre una copia.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-06, en la sesión, con estas palabras: «si el A apruebo» (respuesta a la decisión «A) Aprobar → implemento los 10 pasos y paro en `awaiting_user_tests`»). Compuerta de plan: recibo `GR-20261006-IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006-plan-1` en approve (evaluador auto, Jev; la cascada no corrió por un HTTP 429 de codex). El análisis se aprobó el 2026-10-06 por decisión humana sobre el recibo `GR-20261006-IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006-analysis-2` (evaluó el evaluador auto, Jev; la cascada no corrió por un HTTP 429 de codex). 
- Alcance: reescribir `WORKFLOW_TEMPLATE`, `DELIVERY_TEMPLATE` y, solo si hace falta para el tope, `INVARIANTS_TEMPLATE` en `packages/adapter/src/templates.ts`; subir a 1.1.0 las skills publicadas `skills/planificacion/SKILL.md` y `skills/revision-final/SKILL.md` con el detalle que sale de las plantillas; regenerar `AGENTS.md` y las copias `.valmen/skills/planificacion/SKILL.md` y `.valmen/skills/revision-final/SKILL.md` de este repositorio; actualizar `tests/adapters.test.ts`, crear `tests/plantillas-compactas.test.ts` y documentar en `docs/07-ADAPTADORES.md`.
- Exclusiones: texto propio de un proyecto (`proyecto.md`, estándares, stack) y los 22 KB completos de SaiOpenCloud (respuesta 1 del PO); el aviso de presupuesto en `valmen sync` (`packages/cli/src/commands.ts`) y `tests/agents-md-tamano.test.ts`, que otra sesión tiene sin commitear; `skills/feature/SKILL.md` y `skills/pruebas-unitarias/SKILL.md`, que ya contienen lo que sale; `packages/mcp/src/prompts.ts`; el bloque de QA por agente (IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005, que va después); cualquier archivo de `/Users/juanandrade/Desktop/ValMenTech` y correr `valmen sync` allí.
- Dependencias y orden: ninguna dependencia entrante; va antes de IMPROVEMENT-ADAPTER-CONTRATO-QA-AGENTS-20261005 (respuesta 3 del PO). Responsable de todos los pasos: la sesión de este ticket; las pruebas del contrato de entrega las ejecuta el PO.
- Compuerta que aplica: `plan` (cascada si hay cupo; si no, el evaluador auto, declarado en el recibo) y, tras implementar, `qa-mechanical`. La aprobación del plan y la QA son de una persona.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Línea base, sin tocar nada del repositorio: correr `npx vitest run` desde `/Users/juanandrade/Desktop/ValmenHarness` y anotar pasadas y fallidas (con los cambios ajenos de `commands.ts` y `tests/agents-md-tamano.test.ts` presentes, para poder separar lo ajeno); y medir `AGENTS.md` de la copia de SaiOpenCloud del scratchpad con `medir.mjs` (41 083 B, ~10 271 tokens).
  2. Crear `tests/plantillas-compactas.test.ts` (nuevo, en rojo): importa `WORKFLOW_TEMPLATE`, `INVARIANTS_TEMPLATE` y `DELIVERY_TEMPLATE` de `packages/adapter/src/templates.ts` y comprueba (a) que suman ≤ 9 400 B (criterio 1), (b) que `WORKFLOW_TEMPLATE` nombra las siete acciones de «Acciones que nunca se automatizan» (criterio 2), (c) los tres pasos de «Continuar un ticket» con `reanudar_ticket` y la regla de no tocar el código sin `approved` (criterio 3), (d) que `DELIVERY_TEMPLATE` conserva el contrato de pruebas, los commits tras confirmación, el consumo de IA, `valmen secrets` y un ticket por commit (criterio 5), (e) un puntero a `planificacion`, `revision-final` y `feature` donde salió el detalle (criterio 6), y (f) que `skills/planificacion/SKILL.md` y `skills/revision-final/SKILL.md` declaran `versionPublicada(...)` = 1.1.0 y contienen el texto movido (criterios 7 y 8).
  3. Reescribir en `packages/adapter/src/templates.ts` las constantes `WORKFLOW_TEMPLATE` y `DELIVERY_TEMPLATE` (y recortar `INVARIANTS_TEMPLATE` solo si el total no baja de 9 400 B), a partir del borrador medido en 9 162 B: se compacta la redacción de «Modo directo», «Quién decide», «Continuar un ticket», «Antes de registrar», «Gates», «Memoria» y «Los estándares»; «Estados del ticket» y «Cómo se verifica un criterio» quedan en una o dos líneas con puntero a `planificacion`; el recorrido de feature queda en un puntero a `feature`; el marcado de criterios y las reglas de la fuente del consumo de IA quedan en un puntero a `revision-final`; la tabla de «Acciones que nunca se automatizan» pasa a lista de siete ítems y la de gates a un párrafo. Se conservan las frases que `tests/adapters.test.ts` afirma («el modo por defecto es el directo», «El agente lo dice y se detiene», «aplicar **sobre un proyecto real**», «**La persona, no el agente.**»).
  4. Editar `skills/planificacion/SKILL.md`: `version: 1.1.0` y dos secciones nuevas, «Estados del ticket» (el diagrama de ticket, punto y release, `blocked`, `changes_requested` y la nota de que no existe `completed`) y «Cómo se verifica un criterio» (las anotaciones `<!-- test: … -->` y `<!-- verify: manual -->`, el gate `qa-mechanical`, `test-commands` y `test-timeout` en `.valmen/config.yaml`). El texto sale de lo que hoy dice `WORKFLOW_TEMPLATE`, sin cambiar su sentido.
  5. Editar `skills/revision-final/SKILL.md`: `version: 1.1.0` y una sección nueva, «El consumo de IA se registra antes de cerrar» (una entrada por sesión con números del transcript, los prefijos `opencode:`, `hermes:`, `codex:`, `claude:`, `manual:` y `process:` con su base, la sesión de varios tickets con `manual:` sin números y una sesión por ticket). El texto sale de `DELIVERY_TEMPLATE` actual.
  6. Actualizar `tests/adapters.test.ts` (`:204-234`) y `tests/respuesta-agents-md.test.ts` (`:71`) solo donde la frase de la plantilla cambió, conservando cada aserción; y correr `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/respuesta-agents-md.test.ts` hasta verde.
  7. Regenerar con la misma función que usa `valmen sync` (`syncProject` de `packages/cli/src/commands.ts`), llamada desde una prueba temporal fuera de la suite versionada y luego borrada, como hizo el ticket anterior: instala las copias `.valmen/skills/planificacion/SKILL.md` y `.valmen/skills/revision-final/SKILL.md` y reescribe `AGENTS.md`. No se edita ninguno a mano. Comprobar `sync --check` en 0 y que `git status` no muestre más archivos propios que los del alcance.
  8. Medir: reconstruir el adaptador con `npx tsc -b packages/adapter` y correr `medir.mjs` sobre la copia de SaiOpenCloud del scratchpad (con el `rules-to-skills` de la copia, sin `valmen sync` ni escritura en ValMenTech); anotar bytes y tokens antes (41 083 B) y después, y que cada regla de acción sigue en `AGENTS.md` (criterio 12). Si el resultado supera 35 200 B se recorta redacción en el paso 3, no se toca `proyecto.md`.
  9. Documentar en `docs/07-ADAPTADORES.md`: nueva §6.5 «Plantillas compactas» (qué queda fijo, qué va a skills, medida antes y después, efecto en `sync --check`) y una línea en §8 sobre las versiones 1.1.0 de `planificacion` y `revision-final`.
  10. Verificación final: `npx vitest run` completo contra la línea base del paso 1 (criterio 13), `valmen secrets`, y `valmen validate --id IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006`. Escribir `## Implementación` y `## Pruebas` en el ticket, correr `qa-mechanical`, marcar los criterios que el recibo confirma y mover a `awaiting_user_tests`. El commit del código se hace solo tras las pruebas del PO, sin los archivos ajenos, y sin push.
- Rollback: es solo texto versionado. `git revert` del commit del código devuelve las plantillas, las dos skills y `AGENTS.md`; en un proyecto que ya sincronizó con 1.1.0, `valmen sync` reemplaza las copias por las del catálogo revertido y regenera `AGENTS.md`. Antes del commit basta descartar los archivos del alcance con `git checkout -- <archivo>`. Ningún dato, migración ni despliegue que revertir.

## Criterios de aceptación

<!-- Una afirmación verificable por criterio. Una frase con «y» son dos criterios:
     cada uno se despliega como una proposición propia, y una que agrupa varias
     afirmaciones cae en banda de revisión aunque el plan la cubra entera. -->
- [x] 1. Las tres plantillas fijas (`WORKFLOW_TEMPLATE`, `INVARIANTS_TEMPLATE` y `DELIVERY_TEMPLATE`) pesan en conjunto 9 400 B o menos, desde 15 464 B
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] 2. `WORKFLOW_TEMPLATE` nombra cada una de las siete acciones de la lista vigente «Acciones que nunca se automatizan», sin quitar ninguna
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] 3. `WORKFLOW_TEMPLATE` conserva los tres pasos de «Continuar un ticket» y la regla de no tocar el código de la aplicación mientras el ticket no esté `approved`
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] 4. `WORKFLOW_TEMPLATE` conserva el modo directo con su límite sobre un proyecto real y la regla de que abrir un ticket es decisión de la persona, con las frases que `tests/adapters.test.ts` ya afirma
      <!-- test: npx vitest run tests/adapters.test.ts -->
- [x] 5. `DELIVERY_TEMPLATE` conserva cada regla de entrega que hoy declara, sin dejar ninguna solo en una skill
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] 6. Cada fragmento que salió de las plantillas deja en ellas un puntero de una línea que nombra la skill donde vive el detalle (`planificacion` para estados y verificación de criterios, `revision-final` para el marcado de criterios y el consumo de IA, `feature` para el recorrido de feature)
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] 7. `skills/planificacion/SKILL.md` declara la versión 1.1.0 y contiene el diagrama de estados con las máquinas de punto y release y la verificación de criterios (`test`/`verify`, `test-commands`, `test-timeout` y el gate `qa-mechanical`)
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts tests/skills-publicadas.test.ts -->
- [x] 8. `skills/revision-final/SKILL.md` declara la versión 1.1.0 y contiene las reglas de la fuente del consumo de IA (prefijos por cliente, sesión que sirvió varios tickets con `manual:` sin números y una sesión por ticket)
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts tests/skills-publicadas.test.ts -->
- [x] 9. Las copias `.valmen/skills/planificacion/SKILL.md` y `.valmen/skills/revision-final/SKILL.md` de este repositorio coinciden con el catálogo y `valmen sync --check` no marca deriva de skills publicadas
      <!-- test: npx vitest run tests/skills-publicadas.test.ts -->
- [x] 10. El `AGENTS.md` de este repositorio es idéntico a lo que proyecta `valmen sync`
      <!-- test: npx vitest run tests/dogfooding-registro.test.ts -->
- [x] 11. Las aserciones sobre las plantillas de `tests/adapters.test.ts` y `tests/respuesta-agents-md.test.ts` siguen presentes —actualizadas donde la frase cambió, no borradas— y pasan
      <!-- test: npx vitest run tests/adapters.test.ts tests/respuesta-agents-md.test.ts -->
- [x] 12. Sobre una copia de `.valmen/` de SaiOpenCloud, el `AGENTS.md` pesa 35 200 B o menos (desde 41 083 B) y la medida, en bytes y tokens estimados, queda escrita en el ticket y la lee el PO
      <!-- verify: manual -->
- [x] 13. La suite completa `npx vitest run` no tiene fallos nuevos respecto de la línea base registrada antes del cambio
      <!-- verify: manual -->
- [x] 14. `docs/07-ADAPTADORES.md` describe el reparto entre plantillas y skills publicadas y el efecto sobre `valmen sync --check` en los proyectos adoptados
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Rama: `main`, en `/Users/juanandrade/Desktop/ValmenHarness`, sin worktree; no trabajé en una rama distinta de `main`. Commit del código: `282459a` (`feat(adapter): compactar las plantillas del AGENTS.md…`), creado tras la corrida de pruebas que el PO delegó en el agente y cuyo resultado fue el esperado (ver `## Pruebas`); el registro del cierre (este ticket, el índice y los recibos) va en un commit aparte, y el push a `origin/main` lo pidió el PO en la misma frase de delegación.

Archivos del ticket (el resto del árbol no se tocó):

- `packages/adapter/src/templates.ts`: `WORKFLOW_TEMPLATE` (11 920 → 6 791 B) y `DELIVERY_TEMPLATE` (2 668 → 1 415 B) reescritos; `INVARIANTS_TEMPLATE` (876 B) sin cambios. «Estados del ticket», «Cómo se verifica un criterio», el recorrido de feature, el marcado de criterios y la fuente del consumo de IA quedan en una o dos líneas con puntero a la skill; la tabla de acciones pasa a lista de siete ítems y la de gates a un párrafo.
- `skills/planificacion/SKILL.md` (1.0.0 → 1.1.0): secciones «Estados del ticket» y «Cómo se verifica un criterio».
- `skills/revision-final/SKILL.md` (1.0.0 → 1.1.0): sección «El consumo de IA se registra antes de cerrar».
- `.valmen/skills/planificacion/SKILL.md`, `.valmen/skills/revision-final/SKILL.md` y `AGENTS.md`: regenerados con `syncProject` (la función de `valmen sync`) desde una prueba temporal, ya borrada; ninguno se editó a mano. `sync --check` por el CLI: «Archivos generados al día».
- `tests/plantillas-compactas.test.ts` (nuevo, 11 pruebas): tope de 9 400 B, las siete acciones, los pasos de «Continuar un ticket», el límite del modo directo, las reglas de entrega, los punteros y que cada skill trae el detalle. Estaba en rojo antes del cambio (7 de 11 fallaban) y quedó en verde.
- `docs/07-ADAPTADORES.md`: §6.5 «Plantillas compactas» y un párrafo en §8 sobre las versiones 1.1.0.

Diferencias con el plan, de forma y no de alcance:

- Paso 6: `tests/adapters.test.ts` y `tests/respuesta-agents-md.test.ts` **no cambiaron**: la compactación conservó cada frase que afirman («el modo por defecto es el directo», «El agente lo dice y se detiene», «aplicar **sobre un proyecto real**», «**La persona, no el agente.**»), así que no hubo aserción que actualizar ni borrar.
- Las reglas de la fuente del consumo de IA (los prefijos) pasaron a `revision-final`; en `DELIVERY_TEMPLATE` quedan la regla, el rechazo del motor, «una sesión por ticket» y la regla de varios tickets con `manual:`, porque esas frenan una acción (inventar un número).
- Mientras se implementaba, la otra sesión commiteó `packages/cli/src/commands.ts` y `tests/agents-md-tamano.test.ts` (commits `e790413` y `20bb20d`): el árbol quedó solo con los archivos de este ticket, y `valmen sync` ya imprime el tamaño del `AGENTS.md` (`16 613 B (~4 154 tokens)` en este repositorio).

Medidas, sobre una copia de `.valmen/` de SaiOpenCloud en el scratchpad con `rules-to-skills` de `estandares-presentacion` a `desarrollo-frontend` y `validacion-ui` (nada tocado en ValMenTech, sin `valmen sync` allí); bytes del `AGENTS.md` y tokens estimados como `bytes / 4`:

| versión | bytes | tokens estimados | variación |
|---|---|---|---|
| original sin compactar (sesión anterior) | 54 425 | 13 607 | — |
| antes de este ticket (con contrato y `rules-to-skills`) | 41 083 | 10 271 | −24,5 % vs el original |
| después de este ticket | 34 701 | 8 676 | −15,5 % vs el anterior; −36,2 % vs el original |

Plantillas fijas: 15 464 B → 9 082 B (−6 382 B). Este repositorio: `AGENTS.md` 22 995 B → 16 613 B (~4 154 tokens). Criterio 12 (≤ 35 200 B): cumple con 34 701 B, 499 B de margen. El borrador previo daba 34 781 B; el texto final es 80 B más chico.

La meta de los ~22 KB completos de SaiOpenCloud no se alcanza ni se pretendía (respuesta 1 del PO): de los 34 701 B, ~16 KB son `proyecto.md` y `stack.md` y ~8 KB los `estandares-*`, que son del proyecto.

Línea base y resultado de la suite completa, `npx vitest run` desde la raíz: antes, 142 archivos pasados y 1 omitido, 2 231 pruebas pasadas y 48 omitidas; después, 143 archivos pasados y 1 omitido, 2 242 pruebas pasadas y 48 omitidas (+11, las nuevas). Sin fallos nuevos. `valmen secrets`: sin secretos en los 11 archivos con cambios.

Evaluadores: las compuertas `analysis` y `plan` se corrieron con el evaluador auto (Jev); la cascada falló dos veces con HTTP 429 de codex (cupo agotado). El análisis quedó en `review` (recibo `-analysis-2`) y lo aprobó el PO; el plan salió `approve` (recibo `-plan-1`).

## Pruebas

Directorio de ejecución: `/Users/juanandrade/Desktop/ValmenHarness`. Requisitos: Node 24 y `npm install` hecho; no hace falta red, Docker ni servicios.

1. `npx vitest run tests/plantillas-compactas.test.ts` → 1 archivo, 11 pruebas pasadas (tope de 9 400 B, siete acciones, pasos de «Continuar un ticket», reglas de entrega, punteros y skills 1.1.0).
2. `npx vitest run tests/adapters.test.ts tests/respuesta-agents-md.test.ts tests/skills-publicadas.test.ts tests/dogfooding-registro.test.ts` → todas pasadas (frases afirmadas, copias de skills al día, `AGENTS.md` idéntico a la proyección).
3. `npx vitest run` → 143 archivos pasados y 1 omitido; 2 242 pruebas pasadas y 48 omitidas; sin fallos.
4. `node packages/cli/dist/main.js sync --check` → «Archivos generados al día.» y las seis skills publicadas comparadas.
5. `valmen secrets` (`node packages/cli/dist/main.js secrets`) → «Sin secretos».

Validaciones manuales (criterios 12, 13 y 14):

- Criterio 12, la medida de SaiOpenCloud: copiar `rules`, `skills`, `agents` y `config.yaml` de `.valmen/` de SaiOpenCloud a un directorio temporal (solo lectura del original), agregar a su `config.yaml` el `rules-to-skills` de `estandares-presentacion` a `desarrollo-frontend` y `validacion-ui`, correr `npx tsc -b packages/adapter` en este repositorio y llamar `projectAgentsMd(loadProjectModel(<temporal>, "SaiOpenCloud"))` de `packages/adapter/dist/index.js`. Resultado esperado: 34 701 B (±0), ~8 676 tokens, y cada una de las siete acciones que nunca se automatizan presente en el texto.
- Criterio 13: leer el resumen de la suite del punto 3 contra la línea base de la sección Implementación.
- Criterio 14: leer `docs/07-ADAPTADORES.md` §6.5 y el párrafo nuevo de §8.
- Lectura de contenido: `git diff packages/adapter/src/templates.ts` y comprobar que ninguna regla de «Acciones que nunca se automatizan», «Continuar un ticket» ni «Entrega y documentación» quedó solo en una skill.

Corrida del responsable delegada al agente (2026-10-06). El PO dijo, con sus palabras: «podrias ejecutar tu los test y si el resultado es el esperado aprobar QA, documentar, cerrar y hacer commit y push». El agente corrió el contrato desde cero, en `/Users/juanandrade/Desktop/ValmenHarness`, y el resultado fue el esperado en todas:

- Prueba 1 (`npx vitest run tests/plantillas-compactas.test.ts`): 1 archivo y 11 pruebas en verde.
- Prueba 2 (`tests/adapters.test.ts`, `tests/respuesta-agents-md.test.ts`, `tests/skills-publicadas.test.ts`, `tests/dogfooding-registro.test.ts`): 4 archivos y 60 pruebas en verde.
- Prueba 3 (`npx vitest run`): 143 archivos pasados y 1 omitido; 2 242 pruebas pasadas y 48 omitidas, sin fallos (la línea base eran 142 y 2 231).
- Prueba 4 (`node packages/cli/dist/main.js sync --check`): «Archivos generados al día.» y las seis skills publicadas comparadas.
- Prueba 5 (`valmen secrets`): «Sin secretos en 11 archivo(s) con cambios». Además, `npx tsc --noEmit -p tsconfig.json`: código 0.
- Criterio 12, medida de SaiOpenCloud sobre una copia nueva de su `.valmen/` (solo lectura del original, `rules-to-skills` de la regla de pantalla en la copia): 34 701 B y 8 676 tokens estimados, igual a la medida de `## Implementación`, y las siete acciones que nunca se automatizan presentes en el texto proyectado.
- Criterio 13: la suite completa del punto 3 contra la línea base, sin fallos nuevos.
- Criterio 14: `docs/07-ADAPTADORES.md` trae §6.5 «Plantillas compactas» (qué queda fijo, qué va a skills, medidas y efecto en `sync --check`) y el párrafo de §8 sobre las versiones 1.1.0.
- Los criterios 12, 13 y 14 se marcan por esa verificación y por la delegación del PO; él no leyó los resultados por separado.
- Resultado del PO: delegó la corrida en el agente y la condicionó con las palabras de arriba; el agente la corrió y el resultado fue el esperado; la condición se cumplió.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:8766a922b55588d0acb211c8239997bf700d0edbc9175964503bb39631be5507",
    "environment": "macOS (Darwin), Node 24, vitest 2.1.9, repositorio /Users/juanandrade/Desktop/ValmenHarness en main, commit 282459abc8ef8aa5173198ce708c94ce609f8a12 (los seis archivos funcionales del commit: AGENTS.md, docs/07-ADAPTADORES.md, packages/adapter/src/templates.ts, skills/planificacion/SKILL.md, skills/revision-final/SKILL.md, tests/plantillas-compactas.test.ts; hash calculado con calculateWorktreeReference sobre ellos); árbol limpio salvo el registro de este ticket; sin red, base de datos ni servicios. SaiOpenCloud solo se midió sobre una copia de su .valmen/ en un directorio temporal; nada tocado en ValMenTech.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-06",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "podrias ejecutar tu los test y si el resultado es el esperado aprobar QA, documentar, cerrar y hacer commit y push"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-06",
    "kind": "automated-test",
    "description": "Corrida del agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, 2026-10-06, sobre el commit 282459a. (1) npx vitest run tests/plantillas-compactas.test.ts: 1 archivo, 11 pruebas en verde (7 de ellas fallaban antes del cambio). (2) npx vitest run tests/adapters.test.ts tests/respuesta-agents-md.test.ts tests/skills-publicadas.test.ts tests/dogfooding-registro.test.ts: 4 archivos, 60 pruebas en verde. (3) npx vitest run: 143 archivos pasados y 1 omitido, 2 242 pruebas pasadas y 48 omitidas, sin fallos (línea base: 142 archivos y 2 231 pruebas). (4) node packages/cli/dist/main.js sync --check: «Archivos generados al día.» con las seis skills publicadas comparadas. (5) valmen secrets: sin secretos en 11 archivos con cambios. (6) npx tsc --noEmit -p tsconfig.json: código 0. (7) Medida de SaiOpenCloud sobre una copia nueva de su .valmen/ con rules-to-skills de la regla de pantalla: AGENTS.md de 41 083 B (~10 271 tokens) a 34 701 B (~8 676 tokens), −15,5 %, con las siete acciones que nunca se automatizan presentes; las tres plantillas fijas de 15 464 B a 9 082 B. Gate qa-mechanical: recibos qa-mechanical-1 y qa-mechanical-2 en approve (criterios 1 a 11).",
    "reference": "worktree:sha256:8766a922b55588d0acb211c8239997bf700d0edbc9175964503bb39631be5507",
    "point_id": null
  }
]
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
    "date": "2026-10-06",
    "technical_summary": "Se reescribieron WORKFLOW_TEMPLATE y DELIVERY_TEMPLATE de packages/adapter/src/templates.ts (INVARIANTS_TEMPLATE sin cambios): las tres plantillas fijas pasan de 15 464 B a 9 082 B. Quedan en AGENTS.md las reglas que frenan una acción; los estados del ticket y la verificación de criterios pasan a skills/planificacion/SKILL.md y las reglas de la fuente del consumo de IA a skills/revision-final/SKILL.md, ambas en la versión 1.1.0, con un puntero de una línea en la plantilla. Se regeneraron AGENTS.md y las copias de .valmen/skills con syncProject, se agregó tests/plantillas-compactas.test.ts (11 pruebas: tope de 9 400 B, siete acciones, pasos de «Continuar un ticket», reglas de entrega, punteros y skills) y la §6.5 de docs/07-ADAPTADORES.md. Commit 282459a.",
    "functional_summary": "Los agentes de todo proyecto que monte el harness cargan menos contexto fijo en cada sesión sin perder ninguna regla que frene una acción: el AGENTS.md de SaiOpenCloud baja de 41 083 B a 34 701 B (de ~10 271 a ~8 676 tokens, −15,5 %), medido sobre una copia, y el de este repositorio de 22 995 B a 16 613 B. Cada proyecto adoptado verá su AGENTS.md y dos skills publicadas marcadas como desactualizadas en valmen sync --check hasta correr valmen sync. Los ~22 KB completos de SaiOpenCloud no se alcanzan: ~24 KB son texto propio del proyecto.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Queda unreleased: es un cambio del texto que proyecta el harness en todo proyecto, sin release planificada; los proyectos adoptados lo reciben con valmen sync."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "7e307cfe-6646-4ae1-af3b-f0835914f882",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesión de Claude Code (app de escritorio), modelo claude-sonnet-5-5, esfuerzo de razonamiento 30; sin costo en USD declarado porque la app no expone el precio por token de esta sesión (no se pone cero para que no se lea como «gratis»). Números sumados del transcript ~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/7e307cfe-6646-4ae1-af3b-f0835914f882.jsonl, 102 respuestas únicas (deduplicadas por id) entre 2026-10-06T04:20:33Z y 04:42:14Z: input_tokens suma entrada directa (204), creación de caché (243 187) y lectura de caché (19 371 608); output_tokens 96 894. La sesión siguió después de ese corte con el cierre del ticket, el commit y el push, y ese tramo no está sumado: el motor no admite una segunda entrada para la misma sesión. Una sola sesión por ticket: esta sesión no trabajó otro ticket.",
    "input_tokens": 19614999,
    "output_tokens": 96894,
    "total_tokens": 19711893,
    "estimated_cost_usd": null,
    "source": "claude:7e307cfe-6646-4ae1-af3b-f0835914f882",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "ea141ab1-2f16-4951-b480-a0d3d7a541af",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 2 tickets (IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005 ×184, IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006 ×9), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 781919 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Trabajar IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:ea141ab1-2f16-4951-b480-a0d3d7a541af",
    "confidence": "high",
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
    "date": "2026-10-05",
    "at": "2026-10-06T04:17:32.407Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:07.633Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T04:28:12.770Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO (recibo GR-20261006-IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006-analysis-2, canal mission-control, decidida 2026-10-06T04:28:12.763Z): PO, 2026-10-06, en la sesión, eligió «A) Aprobarlo (Recomendado)» ante la revisión humana del análisis (diagnostico_explica_el_sintoma=0.78, nombra_archivos_reales=0.89; clasificación completa=1.0). Evaluó el evaluador auto (Jev); la cascada no corrió por HTTP 429 de codex."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T04:28:57.168Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T04:35:10.453Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T04:35:14.764Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T04:39:15.543Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T04:41:35.251Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:06.200Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:11.542Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:15.045Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:32.868Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:39.993Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:45.155Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-06T04:42:55.246Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-05",
    "at": "2026-10-06T04:43:03.467Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
