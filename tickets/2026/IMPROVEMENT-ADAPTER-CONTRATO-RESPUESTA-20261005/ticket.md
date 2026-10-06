---
schema_version: 2
id: IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005
title: Abrir AGENTS.md con el contrato de respuesta y acotar su tamaño
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

# IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005

## Solicitud original

Parte del sprint: Respuesta concisa en todos los clientes, independiente de los demás sprints.
- R-RESP-001: El AGENTS.md proyectado DEBE abrir con el contrato de respuesta
- R-RESP-005: El AGENTS.md proyectado DEBE respetar un presupuesto de tamaño
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el `AGENTS.md` y las skills que proyecta `valmen sync` desde `.valmen/` (módulo `adapter`). Cubre R-RESP-001 (sección «Cómo se responde» al abrir el documento, verificada por `sync --check`) y R-RESP-005 (el «Por qué» de cada estándar en una línea, aviso cuando el documento supera el presupuesto del proyecto y reglas de pantalla proyectables a las skills de interfaz). No cubre el output style ni CLAUDE.md (R-RESP-002/003), los agentes (R-RESP-004) ni MCP (R-RESP-006).
- Usuario o rol afectado: los agentes de todo proyecto que monte el harness (Claude Code, Codex, OpenCode, Hermes por MCP), que leen `AGENTS.md`; y el PO, que recibe las decisiones. Quien mantiene un proyecto adoptado ve su `AGENTS.md` cambiar en el próximo `valmen sync`.
- Comportamiento actual: `projectAgentsMd` compone cabecera, título, reglas del proyecto íntegras y tres plantillas de flujo (`project.ts:158-183`); ninguna dice cómo se responde, así que el cliente aplica su modo por defecto o el heredado. Cada estándar entra con su «Por qué» completo y las reglas de pantalla cargan siempre. No hay presupuesto ni aviso. Medido sobre una copia de `.valmen/` de SaiOpenCloud: 54 425 bytes, ~13 607 tokens.
- Comportamiento esperado: el `AGENTS.md` abre con «Cómo se responde» (contrato de respuesta y su precedencia sobre cualquier modo heredado) antes de las reglas del proyecto; los «Por qué» de los `estandares-*` se proyectan en una línea con el texto completo en `.valmen/rules/`; el proyecto puede declarar `agents-md-budget` y `sync` avisa si se supera; y puede declarar `rules-to-skills` para que una regla viva en las skills de interfaz en lugar de en `AGENTS.md`. Sincronizar dos veces deja la sección una sola vez.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/adapter/src/project.ts:158-213` `projectAgentsMd`: cabecera (`:161`), título (`:163-165`), reglas (`:175-179`, vía `demoteTitle` `:132-137`), plantillas (`:181-183`), gates y registro. Es pura y determinista: `sync --check` compara el archivo entero (`packages/cli/src/commands.ts:695-721`), así que la sección nueva queda verificada sin código aparte.
  - `packages/adapter/src/templates.ts:19,248,266`: `WORKFLOW_TEMPLATE` (11 920 B), `INVARIANTS_TEMPLATE` (876 B), `DELIVERY_TEMPLATE` (2 668 B). Ninguna habla de formato de respuesta.
  - `packages/adapter/src/projection.ts:93-144` `projectFiles`: arma `AGENTS.md` (`:122`) y las skills (`:124`); lo consumen `syncProject` (`commands.ts:687`) y el servidor (`packages/server/src/config.ts:245,290`).
  - `packages/adapter/src/skills.ts:250-275` `renderSkill`: concatena `local.md` al final (`:269`). `packages/mcp/src/prompts.ts:52` sirve `projectAgentsMd` como prompt `reglas-del-proyecto`, y `:126-141` sirve de cada skill solo `instructions` —ni `local.md`—.
  - `packages/adapter/src/adopt-rules.ts:195` no extrae un `AGENTS.md` con la marca «GENERADO POR valmen» (un generado no se duplica), pero un `AGENTS.md` escrito a mano con un `## Cómo se responde` propio sí queda en `.valmen/rules/como-se-responde.md`, y el sync lo proyectaría junto a la sección del harness.
  - `tests/dogfooding-registro.test.ts:60-69` exige que el `AGENTS.md` del repositorio sea idéntico a la proyección: cualquier cambio del adaptador obliga a regenerarlo con `valmen sync`.
  - Memoria: `buscar_memoria` no devuelve nada sobre tamaño del documento ni formato de respuesta (AP-003/004/007/008 son de compuertas); no hay decisión previa que citar.
  - Medida de SaiOpenCloud (copia de `.valmen/rules`, `config.yaml` y `skills` en el scratchpad; nada tocado en ValMenTech): 54 425 B = 15 585 B de plantillas fijas del harness + ~38 800 B de reglas del proyecto. Dentro de las reglas: 18 párrafos «Por qué» suman 8 424 B y `estandares-presentacion` pesa 12 085 B.
  - Simulación de las palancas del spec sobre ese texto: «Por qué» a una línea (primera oración, tope de 160 caracteres) −5 722 B; `estandares-presentacion` a las skills −8 771 B ya compactada, más un puntero de ~350 B; sección nueva ~+1 300 B. Resultado estimado: ~41 KB, ~10 300 tokens, −24 %.
- Causa raíz o hipótesis: (1) el adaptador no proyecta ninguna regla de formato de respuesta, por eso cada cliente responde con su modo propio o el heredado —el pedido del PO no tiene dónde vivir—. (2) El documento crece sin tope porque no distingue lo que debe cargarse siempre (la regla) de lo que se consulta (la evidencia del «Por qué», las reglas de pantalla) y nada avisa del tamaño. (3) La meta de ~22 KB no sale de estas dos palancas: de los 54 KB, 15,6 KB son plantillas fijas y ~13 KB el texto propio de SaiOpenCloud (`proyecto.md`); con R-RESP-001 y R-RESP-005 como están escritos el documento queda en ~41 KB. Llegar a ~22 KB exige además compactar las plantillas del harness y recortar `proyecto.md`, que es del proyecto.
- Riesgos y compatibilidad:
  - Todo proyecto adoptado verá su `AGENTS.md` y sus skills de interfaz cambiar; `sync --check` falla en CI hasta que corra `valmen sync`. Es el efecto buscado, pero hay que decirlo.
  - Acortar el «Por qué» saca la evidencia del contexto fijo. El texto completo sigue en `.valmen/rules/` y en `ver_estandares`; se comprime solo en `estandares-*`, no en `proyecto.md`.
  - Una regla encaminada a skills depende de que el cliente cargue la skill. Mitigación: queda un puntero en `AGENTS.md` y el prompt MCP de la skill las sirve. Riesgo residual: un cliente que no cargue skills.
  - Colisión de título: un proyecto con su propio `## Cómo se responde`. Se conserva su texto y se retitula en la proyección, sin tocar la fuente.
  - `packages/cli/src/commands.ts` tiene cambios sin commitear de otra sesión (hunks en `adoptProject`, no en `syncProject`) y no se toca: el aviso de presupuesto se calcula y se expone en el adaptador, pero imprimirlo en `valmen sync` exige una edición pequeña en `syncProject` (`commands.ts:727-767`) que queda condicionada a que esa sesión commitee antes.
  - El contrato es texto: un cliente puede ignorarlo. Por eso el sprint sigue con output style y CLAUDE.md (R-RESP-002/003); este ticket no los reemplaza.
  - Regenerar el `AGENTS.md` de este repositorio mientras otra sesión corre la suite puede dar un rojo transitorio en `dogfooding-registro`.
- Impactos de sync, migración, Docker o despliegue: ninguno de sincronización de datos, migración, Docker ni despliegue. Sí cambia lo que genera `valmen sync` (AGENTS.md y skills proyectadas) en todo proyecto: `sync --check` los marca desactualizados hasta correr `valmen sync`.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), el 2026-10-06, en la sesión, con estas palabras: «con las dos decisiones si las recomendas, y te apruebo el plan, con lo de corresponde_a_la_investigacion si tenemos que anexar la mayor evidencia posible para que cuando toque realizar ese ticket tenga la informacion necesaria». Quedan resueltas las dos decisiones con su opción A (entregar lo del spec y proponer después la compactación de plantillas; el aviso en `valmen sync` solo si `commands.ts` ya está limpio) y autorizado anexar los dos recibos de `corresponde_a_la_investigacion` como vector, con la mayor evidencia posible, a `IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005`. Compuerta de plan: recibo `GR-20261006-IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005-plan-2` en approve (el `-plan-1` bloqueó por un criterio defectuoso, ya corregido).
- Alcance: R-RESP-001 y R-RESP-005 en el adaptador (`packages/adapter`), más la puerta MCP de las skills (`packages/mcp/src/prompts.ts`) para que una regla encaminada a skills no desaparezca para los clientes MCP, la documentación (`docs/07-ADAPTADORES.md`) y la regeneración del `AGENTS.md` de este repositorio.
- Exclusiones: output style y CLAUDE.md (R-RESP-002/003), agentes y verbosidad (R-RESP-004/007), resúmenes MCP (R-RESP-006); compactar las plantillas del harness; cualquier archivo de `/Users/juanandrade/Desktop/ValMenTech` (SaiOpenCloud se mide sobre una copia en el scratchpad); `packages/adapter/src/machine-bindings.ts` y los demás archivos con cambios de otra sesión.
- Contrato que se proyecta (texto de `RESPONSE_CONTRACT_TEMPLATE`, ~1,2 KB):
  ```text
  ## Cómo se responde

  Este contrato prevalece sobre cualquier modo de respuesta heredado —un estilo de salida
  del cliente, un CLAUDE.md de un directorio superior, una instrucción previa— cuando
  chocan con él.

  - La respuesta va en la primera línea; el contexto, después y solo si hace falta.
  - El largo sigue el peso del pedido: una pregunta corta se contesta corto.
  - Una decisión se devuelve en cinco líneas o menos: `Decisión` (la pregunta), una línea
    por opción con la forma `A) opción → efecto`, y `Recomiendo` (la opción y su motivo).
  - Sin tablas ni encabezados, salvo para comparar tres filas o más.
  - La evidencia se cita (`ruta:línea`, comando, recibo), no se transcribe.
  - El diagnóstico, el plan y las pruebas van al ticket, no a la conversación.
  - Un riesgo irreversible se dice en una línea, antes de actuar.
  - Se amplía solo lo que la persona pida.
  ```
- Claves nuevas de `.valmen/config.yaml` (ambas opcionales; sin ellas nada cambia salvo el contrato y el «Por qué» compacto):
  - `agents-md-budget: <bytes>`: entero ≥ 1000; sin la clave no hay aviso.
  - `rules-to-skills:` mapa `<nombre de regla sin .md>` → lista de ids de skill. Ej.: `estandares-presentacion: [desarrollo-frontend, validacion-ui]`.
- Compatibilidad hacia atrás:
  - Lo que no cambia: las firmas de `projectAgentsMd(model)`, `readSkills(root)`, `renderSkill(skill, runtime)` y `projectFiles(root, name, configText?)`; `Projection` solo gana un campo; el esquema de `config.yaml` no rechaza claves nuevas y las dos nuevas son opcionales; una skill sin reglas encaminadas ni `local.md` se proyecta byte a byte igual (lo comprueba una prueba contra el texto actual); `.valmen/rules/` no se escribe nunca.
  - Lo que cambia, y es lo que piden R-RESP-001 y R-RESP-005 (DEBE): el contenido del `AGENTS.md` de todo proyecto (sección nueva y «Por qué» de `estandares-*` en una línea), que `sync --check` marca como desactualizado hasta correr `valmen sync`. Las skills solo cambian en los proyectos que declaren `rules-to-skills`. El prompt MCP de una skill pasa a servir también su `local.md`, que hoy no sirve.
  - Quién consume la proyección y cómo se comprueba: el servidor (`packages/server/src/config.ts:245,290`, por `projectFiles`) con `tests/config-view.test.ts`; el MCP (`prompts.ts:52`) con `tests/mcp-prompts.test.ts`; la CLI (`commands.ts:687`) con `tests/adapters.test.ts`, `tests/skills.test.ts` y `tests/skills-publicadas.test.ts`; el repositorio mismo con `tests/dogfooding-registro.test.ts`.
- Trazabilidad con el diagnóstico (hallazgo → paso):
  - Ninguna regla de formato de respuesta en el adaptador → pasos 1 y 4.
  - Documento sin tope: «Por qué» íntegro, reglas de pantalla siempre cargadas, sin aviso → pasos 2, 3, 4, 5 y 6.
  - Meta de 22 KB no alcanzable con las dos palancas → la decisión «Meta de tamaño» y el paso 12, que mide lo que sí se logra.
  - El prompt MCP de la skill sirve solo `instructions` → paso 7.
  - Colisión de título con un `AGENTS.md` previo escrito a mano → paso 4 y su prueba del paso 8.
  - `dogfooding-registro` exige el `AGENTS.md` regenerado → paso 10.
  - `commands.ts` con cambios de otra sesión → paso 11 condicionado.
- Decisiones que necesita el PO (no bloquean la escritura del plan, sí su aprobación):
  - Meta de tamaño. `Decisión`: con R-RESP-001/005 el AGENTS.md de SaiOpenCloud queda en ~41 KB, no en ~22 KB. A) entregar lo del spec y proponer después un ticket para compactar las plantillas del harness → ~41 KB ahora, ~26 KB después. B) compactar las plantillas en este ticket → ~32 KB, cambia el texto base de todos los proyectos y de sus pruebas de contenido. `Recomiendo` A: la meta de 22 KB además pide recortar `proyecto.md` (13 KB, del proyecto) y B mezcla dos cambios de alcance distinto.
  - Aviso en `valmen sync`. `Decisión`: imprimirlo exige editar `syncProject` en `commands.ts`, que otra sesión tiene sin commitear. A) el paso 11 se hace solo si esa sesión ya commiteó el archivo; si no, me detengo y entrego sin esa línea (criterio 10 sin marcar, dicho en la entrega). B) editar ya el archivo y commitear solo mis hunks → toca un archivo ajeno. `Recomiendo` A.
- Pasos ordenados:
  1. `packages/adapter/src/templates.ts`: exportar `RESPONSE_CONTRACT_RULES` (las ocho reglas), `RESPONSE_CONTRACT_PRECEDENCE` y `RESPONSE_CONTRACT_TEMPLATE` (la sección «Cómo se responde»), de modo que R-RESP-002/003/004 deriven del mismo texto.
  2. Archivo nuevo `packages/adapter/src/rule-projection.ts` (funciones puras): `compactPorQue(content)` reemplaza cada bloque `**Por qué:**` por una línea (primera oración, tope 160 caracteres, cortada en palabra y con «…») y deja intacto `**Visto en:**`; `isStandardRule(rule)` (`name` empieza por `estandares-`); `routedRules(config)` lee `rules-to-skills` y falla con el nombre de la clave si la forma es inválida; `routedRuleBody(rule)`.
  3. Archivo nuevo `packages/adapter/src/agents-size.ts` (puro): `readAgentsMdBudget(config)` (falla si no es entero ≥ 1000), `measureAgentsMd(content, budget)` → `{bytes, estimatedTokens, budget, exceeded}` con tokens = `ceil(bytes / 4)`, y `describeAgentsMdSize(measure)` → líneas de informe y aviso.
  4. `packages/adapter/src/project.ts`, `projectAgentsMd` (`:158-213`): insertar `RESPONSE_CONTRACT_TEMPLATE` justo después del título y antes de la nota «no declara reglas propias» y de las reglas; en cada regla `estandares-*` aplicar `compactPorQue`; si la regla está encaminada, emitir su título y un puntero a las skills y a `.valmen/rules/<regla>.md`; si el título de una regla del proyecto coincide con «Cómo se responde», retitularlo «Cómo se responde en este proyecto» en la proyección (la fuente no se toca); cuando algún «Por qué» se acortó, una línea de nota antes de las reglas que dice dónde está el texto completo.
  5. `packages/adapter/src/skills.ts`: `SkillDefinition` gana `rulesFrom` (rutas fuente); nueva `withRoutedRules(skills, model)` que concatena a `local` las reglas encaminadas a cada skill (compactadas con la misma función); `renderSkill` (`:250-275`) agrega al pie `<!-- reglas proyectadas: <ruta> -->` solo cuando `rulesFrom` no está vacío, así las demás skills no cambian.
  6. `packages/adapter/src/projection.ts`, `projectFiles` (`:93-144`): aplicar `withRoutedRules` antes de `renderAllSkills`, fallar con mensaje claro si `rules-to-skills` nombra una regla o una skill que no existe, y exponer `Projection.agentsMd` (la medida) y su aviso; exportar lo nuevo desde `packages/adapter/src/index.ts`.
  7. `packages/mcp/src/prompts.ts`, `getPromptFor` (`:126-141`): servir `instructions` más `local` de la skill ya con sus reglas encaminadas (hoy ni `local.md` se sirve), para que el cliente MCP las lea.
  8. Pruebas nuevas: `tests/respuesta-agents-md.test.ts` (R-RESP-001: sección y orden, ocho reglas y precedencia, `sync --check` falla sin la sección y pasa tras `sync`, dos sincronizaciones no la duplican, colisión de título, `.valmen/` intacto) y `tests/agents-md-tamano.test.ts` (R-RESP-005: «Por qué» a una línea solo en `estandares-*`, texto completo intacto en `.valmen/rules/`, presupuesto válido e inválido, aviso solo cuando se excede, `rules-to-skills` en los cuatro runtimes y en el prompt MCP, referencias inexistentes, ninguna regla perdida en un corpus que imita a SaiOpenCloud, y una skill sin reglas encaminadas ni `local.md` proyectada igual que antes del cambio).
  9. `docs/07-ADAPTADORES.md` §6: documentar la sección «Cómo se responde», el «Por qué» compacto, `agents-md-budget` y `rules-to-skills`, con la advertencia de que cambian el `AGENTS.md` de todo proyecto en el próximo `valmen sync`.
  10. Regenerar el `AGENTS.md` de este repositorio con `valmen sync` (CLI compilado en `/Users/juanandrade/Desktop/ValmenHarness`), revisar que `git diff --stat` solo toque `AGENTS.md` y lo proyectado por este cambio, y comprobar `valmen sync --check`. No se edita a mano.
  11. Condicionado a la decisión «Aviso en `valmen sync`»: en `packages/cli/src/commands.ts`, `syncProject` (`:695-767`), una línea `AGENTS.md  <bytes> B (~<tokens> tokens)` y el aviso si se supera el presupuesto, tanto al escribir como con `--check`, con su prueba en `tests/agents-md-tamano.test.ts`. Solo si `git diff --quiet -- packages/cli/src/commands.ts` confirma que el archivo está limpio.
  12. Medición ANTES/DESPUÉS sobre una copia de `.valmen/` de SaiOpenCloud en el scratchpad (bytes y tokens estimados; el ANTES ya está: 54 425 B, ~13 607 tokens), con `rules-to-skills` declarado solo en la copia. Nada se ejecuta dentro de ValMenTech.
  13. Suite completa: `npx vitest run` desde `/Users/juanandrade/Desktop/ValmenHarness`, antes de tocar código (baseline, para separar lo que ya falla por cambios de otra sesión) y después, y comparar las dos corridas.
  14. Entrega: contrato de pruebas, criterios marcados con `- [x]` solo cuando el recibo del gate mecánico o el responsable lo confirmen, medidas antes y después, rama usada, consumo de IA con fuente `claude:` y commit del código solo tras la confirmación de las pruebas del PO; sin push.
- Rollback: `git revert` del commit del código y `valmen sync` en cada proyecto para volver a proyectar la versión anterior; la proyección es determinista, `.valmen/` no cambia y las dos claves nuevas son opcionales (una versión anterior del harness las ignora). No hay migración de datos.

## Criterios de aceptación

- [x] 1. R-RESP-001: `projectAgentsMd` abre con la sección «Cómo se responde» antes de las reglas del proyecto, con las ocho reglas del contrato y la declaración de que prevalece sobre cualquier modo de respuesta heredado
      <!-- test: npx vitest run tests/respuesta-agents-md.test.ts -->
- [x] 2. R-RESP-001: `sync --check` falla con un AGENTS.md sin la sección y pasa tras `valmen sync`; sincronizar dos veces deja la sección una sola vez, también cuando una regla del proyecto ya se titula «Cómo se responde»
      <!-- test: npx vitest run tests/respuesta-agents-md.test.ts tests/adapters.test.ts -->
- [x] 3. R-RESP-005: el «Por qué» de cada regla `estandares-*` se proyecta en una línea y el texto completo queda intacto en `.valmen/rules/`; las reglas que no son estándares no se comprimen
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->
- [x] 4. R-RESP-005: `agents-md-budget` se lee y se valida, `Projection.agentsMd` informa bytes y tokens estimados, y el aviso aparece solo cuando se supera el presupuesto
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->
- [x] 5. R-RESP-005: una regla declarada en `rules-to-skills` sale de `AGENTS.md` dejando un puntero, entra en las skills indicadas de los cuatro runtimes y en el prompt MCP de cada skill, y nombrar una regla o una skill inexistente falla con un mensaje que lo dice
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts tests/mcp-prompts.test.ts -->
- [x] 6. R-RESP-005: en un corpus que imita a SaiOpenCloud el documento proyectado es más chico que sin compactar y ninguna regla vigente se pierde (cada título y cada línea que no es «Por qué» sigue en `AGENTS.md` o en una skill)
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->
- [x] 7. El `AGENTS.md` de este repositorio es idéntico a lo que proyecta `valmen sync`
      <!-- test: npx vitest run tests/dogfooding-registro.test.ts -->
- [x] 8. Compatibilidad hacia atrás: una skill sin reglas encaminadas ni `local.md` se proyecta byte a byte igual que antes del cambio, y las pruebas existentes del adaptador, de skills, de MCP y de configuración siguen en verde
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts tests/adapters.test.ts tests/skills.test.ts tests/skills-publicadas.test.ts tests/config-view.test.ts tests/mcp-prompts.test.ts -->
- [x] 9. Se entregan las medidas de bytes y tokens estimados del AGENTS.md de SaiOpenCloud antes (54 425 B) y después, medidas sobre una copia, y el PO las lee
      <!-- verify: manual -->
- [x] 10. `valmen sync` imprime el tamaño del AGENTS.md y el aviso de presupuesto (condicionado al paso 11; si `commands.ts` sigue con cambios ajenos queda sin marcar y se dice en la entrega)
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Rama: `main`, en `/Users/juanandrade/Desktop/ValmenHarness`, sin worktree. Nada commiteado ni empujado.

Archivos del ticket (el resto de lo pendiente en el árbol es de otra sesión y no se tocó):

- `packages/adapter/src/templates.ts`: `RESPONSE_CONTRACT_TITLE`, `RESPONSE_CONTRACT_PRECEDENCE`, `RESPONSE_CONTRACT_RULES` (ocho reglas) y `RESPONSE_CONTRACT_TEMPLATE`.
- `packages/adapter/src/rule-projection.ts` (nuevo, puro): `compactPorQue`, `isStandardRule`, `routedRules`, `routedRulePointer`, `retitleCollision`.
- `packages/adapter/src/agents-size.ts` (nuevo, puro): `readAgentsMdBudget`, `measureAgentsMd`, `describeAgentsMdSize`, `agentsMdWarning`.
- `packages/adapter/src/project.ts`: `projectAgentsMd` inserta el contrato tras el título, compacta los `estandares-*`, deja un puntero en las reglas encaminadas, retitula una colisión y agrega la nota de «Por qué» resumido; `demoteTitle` pasa a exportarse.
- `packages/adapter/src/skills.ts`: `SkillDefinition.rules` (opcional), `withRoutedRules`, `skillText`; `renderSkill` lista `reglas proyectadas` solo si hay reglas.
- `packages/adapter/src/projection.ts`: `projectFiles` aplica `withRoutedRules` y expone `Projection.agentsMd` y `Projection.warnings`.
- `packages/adapter/src/index.ts`: exporta los dos módulos nuevos.
- `packages/mcp/src/prompts.ts`: el prompt de cada skill sirve `skillText` (instrucciones, reglas encaminadas y `local.md`); sin `config.yaml` no encamina nada.
- `tests/respuesta-agents-md.test.ts` (11 pruebas) y `tests/agents-md-tamano.test.ts` (39 pruebas), nuevos.
- `docs/07-ADAPTADORES.md` §6.1 a §6.4.
- `AGENTS.md`: regenerado con la misma función que usa `valmen sync` (`syncProject`), no a mano; 22 460 B → 22 995 B (+535: la sección nueva pesa más de lo que ahorra el «Por qué» de sus 5 estándares).

Diferencias con el plan, todas de forma y no de alcance:

- `describeAgentsMdSize` devuelve una línea y el aviso lo arma `agentsMdWarning` (el plan decía «líneas»).
- Las reglas encaminadas se guardan en `SkillDefinition.rules` y no en `rulesFrom`/`local`: así van antes de la marca de «generado» y `local.md` sigue siendo lo único que el harness no escribe. `routedRulePointer` reemplaza al `routedRuleBody` del plan.
- Se agregó un refinamiento no previsto: `compactPorQue` corta en el último límite de cláusula antes del tope de 160 caracteres y solo si no hay uno cae a la palabra entera. Salió de leer el resultado en este repositorio («…y solo lo que el verificador no…» no dice nada). Está probado.
- **Paso 11 no hecho, por la decisión A del PO**: `packages/cli/src/commands.ts` sigue con cambios sin commitear de otra sesión (`git diff --quiet` lo confirma). `valmen sync` todavía no imprime el tamaño ni el aviso; el dato y el aviso ya salen de `projectFiles` (`Projection.agentsMd`, `Projection.warnings`) y el cableado es de unas líneas en `syncProject` cuando ese archivo esté limpio. El criterio 10 queda sin marcar.
- El `AGENTS.md` se regeneró con `syncProject` desde una prueba temporal (borrada) en vez del CLI compilado, para no compilar el árbol con el trabajo ajeno; es el mismo código que ejecuta `valmen sync` y `sync --check` quedó en 0.

Medidas sobre una copia de `.valmen/` de SaiOpenCloud en el scratchpad (nada tocado en ValMenTech), bytes del `AGENTS.md` y tokens estimados como `bytes / 4`:

| versión | bytes | tokens estimados | variación |
|---|---|---|---|
| antes (HEAD) | 54 425 | 13 607 | — |
| después, sin configurar nada (contrato + «Por qué» en una línea) | 49 520 | 12 380 | −9,0 % |
| después, con `rules-to-skills` de `estandares-presentacion` a `desarrollo-frontend` y `validacion-ui` | 41 083 | 10 271 | −24,5 % |

Con la regla de pantalla en las skills, cada una de las dos pasa de ~3,9 KB a ~12,7 KB (se cargan solo cuando el trabajo las pide), y ninguna de las demás skills cambia. En la copia ninguna regla vigente se pierde: cada línea que no es «Por qué» de las seis reglas sigue en `AGENTS.md` o en la skill. La meta de ~22 KB **no se alcanza** con R-RESP-001 y R-RESP-005 (decisión 1 del plan, opción A): 15,6 KB son plantillas fijas del harness y ~13 KB el texto propio de SaiOpenCloud.

Anexo pedido por el PO, que no es trabajo de este ticket: la evidencia de `corresponde_a_la_investigacion` quedó en `docs/evidencia-gate-20261006/` y en un tercer vector de `IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005`, más el aprendizaje AP-010. Resultado: la causa es la proposición (pregunta por archivos iguales y un plan que crea archivos nuevos incumple su cláusula «no»), no la línea de aprobación ni el largo del diagnóstico.

### Reapertura: paso 11 (criterio 10), 2026-10-06

El PO eligió reabrir este ticket para cablear el aviso en `valmen sync` («vamos con las recomendadas» y «las recomendadas», 2026-10-06) y hacerlo cuando `commands.ts` quedara libre. Quedó libre con el commit `95f7cb1` de la otra sesión (`git diff --quiet -- packages/cli/src/commands.ts` confirmó el archivo limpio antes de editarlo), y el ticket pasó `closed → changes_requested → in_progress` con ese motivo. Sigue `unreleased`.

- `packages/cli/src/commands.ts`: `lineasDeTamano` (nueva) y cuatro cambios en `syncProject`, sin tocar nada más del archivo (27 líneas agregadas, 1 cambiada). Al escribir, el informe suma `tamaño de AGENTS.md <bytes> B (~<tokens> tokens)` —con el presupuesto si hay— y, si se pasa, `Aviso: …`. Con `--check` al día repite `AGENTS.md: <tamaño>` y el aviso; desactualizado, el aviso viaja junto al error. El aviso no cambia el código de salida. Importa `describeAgentsMdSize` del adaptador; el dato sale de `Projection.agentsMd` y `Projection.warnings`, que ya existían.
- `tests/agents-md-tamano.test.ts`: seis pruebas nuevas en «valmen sync informa el tamaño» (al escribir sin y con presupuesto, presupuesto holgado, `--check` al día, `--check` desactualizado y presupuesto inválido). Quitar la línea de tamaño, el aviso al escribir o el tamaño en `--check` hace fallar entre 1 y 3 de ellas.
- `docs/07-ADAPTADORES.md` §6.3: dice qué imprime `valmen sync`.
- Salida real sobre la copia de SaiOpenCloud (scratchpad) con `agents-md-budget: 30000` y la regla de pantalla en las skills: `tamaño de AGENTS.md  41 083 B (~10 271 tokens), presupuesto 30 000 B` y `Aviso: AGENTS.md pasa del presupuesto: 41 083 B … contra 30 000 B, 11 083 B de más`; `--check` repite ambos y sale en 0. En este repositorio, `--check`: `AGENTS.md: 22 995 B (~5 749 tokens)`.
- El `AGENTS.md` de este repositorio no cambia: el contenido proyectado es el mismo.
- Consumo de IA: `CONSUMO-001` cubre la sesión hasta 2026-10-06T03:49Z y esta reapertura es posterior, así que su gasto no está sumado en esa entrada; el motor no admite una segunda entrada para la misma sesión.

## Pruebas

Estado: corridas locales en verde; la confirmación de las pruebas es del responsable.

Contrato para el responsable. Directorio de todas: `/Users/juanandrade/Desktop/ValmenHarness`. Entorno: Node 24 y `npm ci` ya hecho; sin red ni servicios.

| # | Comando | Resultado esperado |
|---|---|---|
| 1 | `npx vitest run tests/respuesta-agents-md.test.ts` | 11 pruebas en verde: la sección va después del título y antes de las reglas, lleva las ocho reglas y la precedencia, `sync --check` falla sin ella y pasa tras `sync`, dos sincronizaciones no la duplican y la colisión de título se conserva retitulada |
| 2 | `npx vitest run tests/agents-md-tamano.test.ts` | 39 pruebas en verde: «Por qué» en una línea solo en `estandares-*`, presupuesto válido e inválido, aviso solo al pasarse, `rules-to-skills` en los cuatro runtimes y en el prompt MCP, referencias inexistentes, corpus tipo SaiOpenCloud y compatibilidad |
| 3 | `npx vitest run tests/dogfooding-registro.test.ts` | en verde: el `AGENTS.md` del repositorio es idéntico a la proyección |
| 4 | `npx vitest run tests/agents-md-tamano.test.ts tests/adapters.test.ts tests/skills.test.ts tests/skills-publicadas.test.ts tests/config-view.test.ts tests/mcp-prompts.test.ts` | en verde |
| 5 | `npx vitest run` | 141 archivos y 2 221 pruebas en verde, 48 omitidas (la línea base de esta sesión era 138 archivos y 2 161 pruebas; la diferencia son las 50 pruebas de este ticket y las de otra sesión) |
| 6 | `npx tsc --noEmit -p tsconfig.json` | sin salida y código 0 |

Las pruebas se comprobaron también al revés: quitar el contrato, la compactación, el encaminamiento o el retitulado de `projectAgentsMd` hace fallar entre 1 y 9 de ellas, y el archivo se restauró idéntico.

Validación manual (criterio 9, la lee el PO): abrir `AGENTS.md` y comprobar que a continuación del título está «Cómo se responde» (líneas 13 a 27) y que los «Por qué» de «Estándares de proceso» son una línea; y leer la tabla de medidas de `## Implementación`. No hay validación visual: el cambio no toca pantallas, y `revisar_presentacion` no aplica.

Limitaciones: `valmen sync` no imprime todavía el tamaño ni el aviso (criterio 10); un `AGENTS.md` de otro proyecto cambiará en su próximo `valmen sync` y `sync --check` lo marcará desactualizado hasta entonces; una regla encaminada a una skill solo llega al agente si su cliente carga la skill.

Corrida del responsable delegada al agente (2026-10-06, ~03:55Z). El PO dijo, con sus palabras: «si los corres tu y el resultado es el esperado te apruebo para que se apruebe QA y se pueda cerrar». El agente corrió desde cero, en `/Users/juanandrade/Desktop/ValmenHarness`, y el resultado fue el esperado en todas:

- Pruebas 1 a 3 (`respuesta-agents-md`, `agents-md-tamano`, `dogfooding-registro`): 3 archivos y 54 pruebas en verde.
- Prueba 4 (adaptador, skills, skills publicadas, configuración y prompts MCP): 6 archivos y 138 pruebas en verde.
- Prueba 5 (`npx vitest run`): 141 archivos y 2 221 pruebas en verde, 48 omitidas.
- Prueba 6 (`npx tsc --noEmit -p tsconfig.json`): código 0.
- Validación manual del criterio 9: `AGENTS.md` abre con «Cómo se responde» en las líneas 13 a 27 y las medidas están en `## Implementación`. El criterio 9 se marca por esa verificación y por la aprobación del PO; él no leyó el resultado por separado.
- El estado que entra al commit se comprobó aparte: exportado el índice (`git checkout-index`) sin el trabajo ajeno, `tsc` da 0 y 153 pruebas de ocho archivos pasan, incluida `dogfooding-registro`.
- Commit del código: `5f1bfce335cc3a5e1cc63bdbfa69815665e9f277` en `main`, sin push.

- Resultado del PO: delegó la corrida en el agente y la condicionó con estas palabras: «si los corres tu y el resultado es el esperado te apruebo para que se apruebe QA y se pueda cerrar». El agente la corrió y el resultado fue el esperado (detalle arriba); la condición se cumplió.

El criterio 10 (`valmen sync` imprime el tamaño y el aviso) no se verificó y sigue sin marcar: `packages/cli/src/commands.ts` conserva cambios sin commitear de otra sesión, y la decisión A del PO fue no editarlo mientras fuera así.

### Segundo ciclo: paso 11 (reapertura, 2026-10-06)

Contrato para el responsable, desde `/Users/juanandrade/Desktop/ValmenHarness`, sin red ni servicios:

| # | Comando | Resultado esperado |
|---|---|---|
| 7 | `npx vitest run tests/agents-md-tamano.test.ts` | 45 pruebas en verde; las seis de «valmen sync informa el tamaño» fallan si se quita la línea de tamaño o el aviso |
| 8 | `npx vitest run` | 142 archivos y 2 231 pruebas en verde, 48 omitidas |
| 9 | `npx tsc --noEmit -p tsconfig.json` | sin salida y código 0 |

Validación manual (criterio 10): en un proyecto cuyo `.valmen/config.yaml` declare `agents-md-budget: 1000`, `valmen sync` imprime `tamaño de AGENTS.md … presupuesto 1 000 B` y una línea `Aviso: AGENTS.md pasa del presupuesto…` y sale en 0; sin esa clave imprime solo el tamaño. Se comprobó con `syncProject` sobre la copia de SaiOpenCloud; el CLI compilado (`dist`) puede estar viejo hasta correr `npm run build`.

Corrida del responsable delegada al agente (2026-10-06, segundo ciclo). El PO dijo, con sus palabras: «corre los comandos y si el resultado es el esperado te aprubo para que documentes, cierres y hagas commit y push». El agente corrió las pruebas 7 a 9 desde cero y el resultado fue el esperado:

- Prueba 7 (`npx vitest run tests/agents-md-tamano.test.ts`): 1 archivo y 45 pruebas en verde.
- Prueba 8 (`npx vitest run`): 142 archivos y 2 231 pruebas en verde, 48 omitidas.
- Prueba 9 (`npx tsc --noEmit -p tsconfig.json`): código 0.
- Validación manual del criterio 10: la salida real de `syncProject` sobre la copia de SaiOpenCloud con `agents-md-budget: 30000` imprime la línea de tamaño y el aviso y sale en 0 (arriba, en `## Implementación`); con presupuesto 1000 lo comprueban las pruebas de `valmen sync informa el tamaño`. El criterio 10 se marca por esa verificación y por la aprobación del PO; él no vio la salida por separado.
- Resultado del PO: delegó la corrida en el agente y la condicionó con las palabras de arriba; el agente la corrió y el resultado fue el esperado; la condición se cumplió.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:e38cdc37548db9d15f436aee0752a324d8c7fa119083c5bc08e9c47bfcb63a43",
    "environment": "macOS (Darwin 27.0.0), Node v26.10.0, vitest 2.1.9, repositorio /Users/juanandrade/Desktop/ValmenHarness en main, commit 5f1bfce335cc3a5e1cc63bdbfa69815665e9f277, con cambios sin commitear de otra sesión en el árbol que no se tocaron; sin red, base de datos ni servicios. Los proyectos de prueba son carpetas temporales creadas por las pruebas; SaiOpenCloud solo se midió sobre una copia de su .valmen/ en el scratchpad de la sesión. La referencia es el hash de los 12 archivos funcionales del commit (AGENTS.md, docs/07-ADAPTADORES.md, packages/adapter/src/agents-size.ts, index.ts, project.ts, projection.ts, rule-projection.ts, skills.ts, templates.ts, packages/mcp/src/prompts.ts, tests/agents-md-tamano.test.ts, tests/respuesta-agents-md.test.ts), con el algoritmo de calculateWorktreeReference sobre el contenido de git show; el contenido del commit es idéntico al del árbol de trabajo que se probó.",
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
    "po_confirmation": "si los corres tu y el resultado es el esperado te apruebo para que se apruebe QA y se pueda cerrar"
  },
  {
    "id": "QA-003",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:e38cdc37548db9d15f436aee0752a324d8c7fa119083c5bc08e9c47bfcb63a43",
    "environment": "macOS (Darwin 27.0.0), Node v26.10.0, vitest 2.1.9, repositorio /Users/juanandrade/Desktop/ValmenHarness en main, commit 5f1bfce335cc3a5e1cc63bdbfa69815665e9f277, con cambios sin commitear de otra sesión en el árbol que no se tocaron; sin red, base de datos ni servicios. Los proyectos de prueba son carpetas temporales creadas por las pruebas; SaiOpenCloud solo se midió sobre una copia de su .valmen/ en el scratchpad de la sesión. La referencia es el hash de los 12 archivos funcionales del commit (AGENTS.md, docs/07-ADAPTADORES.md, packages/adapter/src/agents-size.ts, index.ts, project.ts, projection.ts, rule-projection.ts, skills.ts, templates.ts, packages/mcp/src/prompts.ts, tests/agents-md-tamano.test.ts, tests/respuesta-agents-md.test.ts), con el algoritmo de calculateWorktreeReference sobre el contenido de git show; el contenido del commit es idéntico al del árbol de trabajo que se probó.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-10-06",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [
      "El criterio 10 (valmen sync imprime el tamaño del AGENTS.md y el aviso de presupuesto) quedó sin cumplir porque commands.ts tenía cambios de otra sesión; esos cambios se commitearon en 95f7cb1 y el archivo está limpio. El PO eligió reabrir este ticket para cablear las líneas en syncProject, probarlas y volver a cerrarlo."
    ],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-005",
    "date": "2026-10-06",
    "build_reference": "worktree:sha256:f82880905706b324e192aba2d982c3b48593f2cea5852f5fc05e014e3addb8d4",
    "environment": "macOS (Darwin 27.0.0), Node v26.10.0, vitest 2.1.9, repositorio /Users/juanandrade/Desktop/ValmenHarness en main, commit e790413b4a13452aad046afc4cf67b68b3020185 (sobre 5f1bfce), sin cambios ajenos pendientes salvo tickets/index.md y el ticket de otra sesión; sin red, base de datos ni servicios. Los proyectos de prueba son carpetas temporales creadas por las pruebas; SaiOpenCloud solo se midió sobre una copia de su .valmen/ en el scratchpad de la sesión. La referencia es el hash de los 13 archivos funcionales del commit (AGENTS.md, docs/07-ADAPTADORES.md, packages/adapter/src/agents-size.ts, index.ts, project.ts, projection.ts, rule-projection.ts, skills.ts, templates.ts, packages/cli/src/commands.ts, packages/mcp/src/prompts.ts, tests/agents-md-tamano.test.ts, tests/respuesta-agents-md.test.ts), con el algoritmo de calculateWorktreeReference sobre el contenido de git show; el contenido del commit es idéntico al del árbol de trabajo que se probó.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-10-06",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "corre los comandos y si el resultado es el esperado te aprubo para que documentes, cierres y hagas commit y push"
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
    "description": "Corrida del agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, 2026-10-06. (1) npx vitest run tests/respuesta-agents-md.test.ts tests/agents-md-tamano.test.ts tests/dogfooding-registro.test.ts: 3 archivos, 54 pruebas en verde. (2) npx vitest run tests/agents-md-tamano.test.ts tests/adapters.test.ts tests/skills.test.ts tests/skills-publicadas.test.ts tests/config-view.test.ts tests/mcp-prompts.test.ts: 6 archivos, 138 pruebas en verde. (3) npx vitest run: 141 archivos y 2221 pruebas en verde, 48 omitidas (línea base antes del cambio: 138 archivos y 2161 pruebas). (4) npx tsc --noEmit -p tsconfig.json: código 0. (5) Estado del índice exportado con git checkout-index, sin el trabajo ajeno: tsc en 0 y 153 pruebas de ocho archivos en verde. (6) Gate qa-mechanical: recibo GR-20261006-IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005-qa-mechanical-2 en approve, 8 de 8 criterios con test. Mutaciones sobre project.ts (sin contrato, sin compactación, sin encaminamiento, sin retitulado) hacen fallar 9, 2, 2 y 1 pruebas y el archivo se restauró idéntico. Commit 5f1bfce335cc3a5e1cc63bdbfa69815665e9f277.",
    "reference": "worktree:sha256:e38cdc37548db9d15f436aee0752a324d8c7fa119083c5bc08e9c47bfcb63a43",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-06",
    "kind": "automated-test",
    "description": "Segundo ciclo (reapertura por el criterio 10), corrida del agente a pedido del PO, desde /Users/juanandrade/Desktop/ValmenHarness, 2026-10-06. (7) npx vitest run tests/agents-md-tamano.test.ts: 1 archivo, 45 pruebas en verde (6 nuevas de «valmen sync informa el tamaño»). (8) npx vitest run: 142 archivos y 2231 pruebas en verde, 48 omitidas. (9) npx tsc --noEmit -p tsconfig.json: código 0. Mutaciones sobre syncProject (sin aviso al escribir, sin línea de tamaño, sin tamaño en --check) hacen fallar 1, 3 y 1 pruebas y el archivo se restauró idéntico. Salida real de syncProject sobre una copia de SaiOpenCloud con agents-md-budget: 30000 y la regla de pantalla en las skills: «tamaño de AGENTS.md  41 083 B (~10 271 tokens), presupuesto 30 000 B» y «Aviso: AGENTS.md pasa del presupuesto … 11 083 B de más», con salida 0; --check repite ambos. Commit e790413b4a13452aad046afc4cf67b68b3020185.",
    "reference": "worktree:sha256:f82880905706b324e192aba2d982c3b48593f2cea5852f5fc05e014e3addb8d4",
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
    "technical_summary": "En packages/adapter: templates.ts exporta el contrato (RESPONSE_CONTRACT_*), rule-projection.ts (nuevo, puro) compacta el «Por qué» de los estandares-*, lee rules-to-skills, deja el puntero y retitula una colisión con «Cómo se responde», agents-size.ts (nuevo, puro) lee agents-md-budget y mide bytes y tokens (bytes/4), project.ts compone todo en projectAgentsMd, skills.ts suma las reglas encaminadas a SkillDefinition.rules con withRoutedRules y skillText, y projection.ts expone Projection.agentsMd y Projection.warnings. packages/mcp/src/prompts.ts sirve cada skill con sus reglas encaminadas y su local.md. sync --check verifica la sección porque compara el archivo entero; el AGENTS.md de este repositorio se regeneró con la misma función. Pruebas nuevas: tests/respuesta-agents-md.test.ts y tests/agents-md-tamano.test.ts (50). Queda fuera por decisión del PO imprimir el tamaño y el aviso en valmen sync (criterio 10): commands.ts tenía cambios de otra sesión.",
    "functional_summary": "Todo proyecto que monte el harness recibe, en el AGENTS.md que lee cada cliente, la sección «Cómo se responde» antes de sus reglas: la respuesta en la primera línea, las decisiones como opciones con su efecto y una recomendación en cinco líneas o menos, la evidencia citada y no transcrita, y la declaración de que eso prevalece sobre cualquier modo de respuesta heredado. Además el documento pesa menos: el «Por qué» de los estándares va en una línea y un proyecto puede declarar un presupuesto de tamaño y mandar las reglas de pantalla a las skills de interfaz. Medido sobre una copia de SaiOpenCloud: de 54 425 B a 49 520 B sin configurar nada y a 41 083 B con la regla de pantalla en las skills; la meta de ~22 KB queda sin alcanzar y exige compactar las plantillas del harness, que es otro ticket por proponer.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Queda unreleased: el cambio vive en main sin etiqueta ni publicación; lo recibe cada proyecto en su próximo valmen sync, y sync --check lo marca desactualizado hasta entonces. Si algún proyecto lo rechaza se revierte el commit 5f1bfce y se vuelve a correr valmen sync."
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-10-06",
    "technical_summary": "En packages/adapter: templates.ts exporta el contrato (RESPONSE_CONTRACT_*), rule-projection.ts (nuevo, puro) compacta el «Por qué» de los estandares-*, lee rules-to-skills, deja el puntero y retitula una colisión con «Cómo se responde», agents-size.ts (nuevo, puro) lee agents-md-budget y mide bytes y tokens (bytes/4), project.ts compone todo en projectAgentsMd, skills.ts suma las reglas encaminadas a SkillDefinition.rules con withRoutedRules y skillText, y projection.ts expone Projection.agentsMd y Projection.warnings. packages/mcp/src/prompts.ts sirve cada skill con sus reglas encaminadas y su local.md. En packages/cli/src/commands.ts, syncProject imprime el tamaño y el aviso (lineasDeTamano) y no cambia el código de salida. sync --check verifica la sección porque compara el archivo entero; el AGENTS.md de este repositorio se regeneró con la misma función. Pruebas nuevas en tests/respuesta-agents-md.test.ts y tests/agents-md-tamano.test.ts (56). Commits: 5f1bfce (R-RESP-001 y R-RESP-005) y e790413 (criterio 10, tras reabrir).",
    "functional_summary": "Todo proyecto que monte el harness recibe, en el AGENTS.md que lee cada cliente, la sección «Cómo se responde» antes de sus reglas: la respuesta en la primera línea, las decisiones como opciones con su efecto y una recomendación en cinco líneas o menos, la evidencia citada y no transcrita, y la declaración de que eso prevalece sobre cualquier modo de respuesta heredado. El documento pesa menos: el «Por qué» de los estándares va en una línea y el proyecto puede declarar un presupuesto de tamaño y mandar las reglas de pantalla a las skills de interfaz. Y `valmen sync` dice cuánto pesa el AGENTS.md y avisa cuando pasa del presupuesto, tanto al escribir como con --check, sin bloquear. Medido sobre una copia de SaiOpenCloud: de 54 425 B (~13 607 tokens) a 49 520 B sin configurar nada y a 41 083 B (~10 271 tokens) con la regla de pantalla en las skills; la meta de ~22 KB queda para el ticket de compactación de las plantillas del harness (IMPROVEMENT-ADAPTER-PLANTILLAS-COMPACTAS-20261006).",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Queda unreleased: el cambio vive en main sin etiqueta ni publicación; lo recibe cada proyecto en su próximo valmen sync, y sync --check lo marca desactualizado hasta entonces. Si algún proyecto lo rechaza se revierten los commits 5f1bfce y e790413 y se vuelve a correr valmen sync."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-06",
    "session_reference": "ea141ab1-2f16-4951-b480-a0d3d7a541af",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesión de Claude Code (app de escritorio, id local local_dafc2f45-e48f-4f45-856a-4d91e4b2ce60), modelo claude-sonnet-5-5, esfuerzo xhigh, plan Max: suscripción, por eso sin costo en USD. Números sumados del transcript ~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/ea141ab1-2f16-4951-b480-a0d3d7a541af.jsonl hasta 2026-10-06T03:49:31Z, 123 respuestas únicas (deduplicadas por id); la sesión siguió después con la entrega y lo que falte hasta el cierre no está sumado. input_tokens = entrada sin caché 248 + escritura de caché 402 968 + lectura de caché 34 122 836; la lectura de caché es el 98,8 % y es el contexto releído en cada llamada, no texto nuevo. Salida 179 509 (incluye razonamiento). La sesión trabajó este ticket de punta a punta y además, por pedido expreso del PO, anexó la evidencia de corresponde_a_la_investigacion (reconstrucción de estados por hash, 3 corridas del evaluador en un proyecto de prueba, docs/evidencia-gate-20261006/, un tercer vector en IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005 y el aprendizaje AP-010). Ese trabajo no es de este ticket y su parte del gasto no es separable de este número: no se repartió a ojo.",
    "input_tokens": 34526052,
    "output_tokens": 179509,
    "total_tokens": 34705561,
    "estimated_cost_usd": null,
    "source": "claude:ea141ab1-2f16-4951-b480-a0d3d7a541af",
    "confidence": "high",
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:50.267Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-06T03:23:10.088Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-06T03:25:03.217Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-06T03:31:43.106Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-06T03:38:06.009Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-06T03:49:38.207Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-06T03:49:42.004Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-06T03:53:23.610Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-06T03:54:06.571Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-06T03:54:13.255Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-06T03:54:20.120Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-06T03:54:22.327Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-06T03:54:31.102Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-06T03:54:33.140Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-06T04:20:20.165Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: closed -> changes_requested. Reapertura por hallazgo: El criterio 10 (valmen sync imprime el tamaño del AGENTS.md y el aviso de presupuesto) quedó sin cumplir porque commands.ts tenía cambios de otra sesión; esos cambios se commitearon en 95f7cb1 y el archivo está limpio. El PO eligió reabrir este ticket para cablear las líneas en syncProject, probarlas y volver a cerrarlo."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-05",
    "at": "2026-10-06T04:20:35.393Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-05",
    "at": "2026-10-06T04:23:21.086Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:00.401Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:09.436Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:13.150Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:15.858Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:17.507Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:25.614Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-05",
    "at": "2026-10-06T04:26:27.283Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
