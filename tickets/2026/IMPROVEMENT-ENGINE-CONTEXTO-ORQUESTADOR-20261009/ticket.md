---
schema_version: 2
id: IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009
title: Reducir el contexto que relee la sesión orquestadora en cada turno de una corrida
type: IMPROVEMENT
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-09
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009

## Solicitud original

El PO eligió el 2026-10-09 «arreglemos las fugas» con la opción «Contexto del orquestador»: que la sesión madre no relea toda la conversación en cada turno (resúmenes por ola); es la línea más cara y depende del cliente. Hallazgo medido en los transcripts de la corrida vista-agentes: la sesión orquestadora (Sonnet, 391 mensajes) leyó 111 M de tokens de caché, más que los 31 subagentes juntos en lectura de Opus (71 M) o de Sonnet (64 M); cada turno relee la conversación entera, incluidos los informes completos de cada subagente y salidas largas de comandos. Hay que averiguar qué parte controla el harness (brief, informes, skill corrida-orquestada, comandos de jornada) y qué parte es del cliente.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- D1 · Tope del informe del subagente. Pregunta: ¿el informe final del subagente se limita a 8 líneas y 900 caracteres, con la forma fija estado · commit · archivos · pruebas · decisión? Por defecto: sí, 8 líneas y 900 caracteres.
- D2 · Brief por archivo. Pregunta: ¿`valmen journey brief --id <ID> --out <ruta>` escribe el brief en un archivo y el orquestador le pasa al subagente solo la ruta con la orden de leerlo entero, en vez de pegar el texto en el prompt? Por defecto: sí; el texto del brief no cambia y sigue siendo el único contexto del subagente.
- D3 · Forma corta de `resume`. Pregunta: ¿la bandera se llama `--quiet` e imprime solo identificador, estado, el título del siguiente paso y el alto, en tres líneas como máximo? Por defecto: `--quiet`, tres líneas.
- D4 · Cierre por comandos sin delegación. Pregunta: ¿entra en este ticket un `valmen journey close` que haga el ciclo de QA y el cierre con la frase del PO cuando no hay delegación (hoy `delegation close` exige una, `packages/cli/src/delegation.ts:330`)? Por defecto: no; va a un ticket aparte porque es funcionalidad nueva del motor.
- D5 · Tamaño de `AGENTS.md`. Pregunta: ¿se recorta `AGENTS.md` (18 630 caracteres que el cliente carga en cada llamada)? Por defecto: no en este ticket; se propone aparte.
- Decisiones del PO (2026-10-09, por AskUserQuestion, palabras literales):
  - Sobre la compuerta `plan` en REVIEW (recibo `GR-20261009-IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009-plan-1`): «Añadir la línea y repetir (Recomendado)».
  - Sobre D1–D5: «Acepto las cinco (Recomendado)»; quedan decididas D1, D2, D3, D4 y D5 con su opción por defecto.

## Descripción funcional

- Alcance: lo que el harness pone en el contexto de la sesión orquestadora de una corrida: el contrato de entrega del brief (`journey brief`), la forma de pasar el brief al subagente, la salida de `valmen resume` cuando el orquestador solo necesita el estado, y la guía de la skill `corrida-orquestada` sobre salidas largas y la suite. Queda fuera cómo Claude Code relee, compacta o envuelve los mensajes.
- Usuario o rol afectado: el PO que paga la corrida y la sesión orquestadora (hoy Sonnet) que relee la conversación entera en cada llamada.
- Comportamiento actual: en la corrida vista-agentes la sesión orquestadora hizo 391 llamadas Sonnet y leyó 111 261 636 tokens de caché; el contexto pasó de 76 671 tokens en la segunda llamada a 536 219 en la 390. Todo lo que entra se relee en cada llamada siguiente: los informes de subagente (mediana 16 líneas, hasta 38), los briefs pegados en el prompt de `Agent`, cada `valmen resume` con el plan vigente completo y los guiones de cierre que el orquestador escribe a mano.
- Comportamiento esperado: el orquestador recibe informes de forma fija y corta, pasa el brief por archivo, consulta el estado con una salida de tres líneas y la skill le dice que no pegue salidas largas y que de la suite muestre solo el resumen, sin perder evidencia: el detalle sigue en el ticket, los recibos y el archivo del brief.

## Diagnóstico

- Medición (transcript `~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/4f9b1b12-ced4-4132-9151-c3a025ede085.jsonl`, solo lectura, guion en el scratchpad de la sesión; cubre las 451 llamadas hasta 2026-10-09T15:35, de ellas 391 Sonnet de la corrida vista-agentes): texto visible 787 402 caracteres. «Relecturas» = caracteres × llamadas posteriores, que es lo que se vuelve a leer de caché; total 167,7 M de caracteres releídos.
  - Informes de subagente (`task-notification`): 145 546 car, 57 bloques, 19,9 % de las relecturas; de ellos 104 063 car son el informe y ~41 000 el sobre que pone el cliente.
  - Llamadas Bash escritas por el orquestador: 137 072 car, 15,6 %; los guiones de cierre por ticket (python con heredoc y funciones `cierre()`) suman ~17 300 car en cinco bloques.
  - Texto propio del orquestador: 110 655 car, 13,3 %.
  - Prompts de `Agent` (briefs pegados): 64 004 car, 38 lanzamientos, 7,3 %.
  - Acuse de lanzamiento de `Agent` (texto del cliente): 40 774 car, 5,6 %.
  - Salidas de `valmen resume`: 27 201 car, 48 llamadas, 4,6 %; `journey brief` 11 361 car (2,3 %); `journey next`/`plan` 8 519 car (2,1 %); otros `journey` 9 001 car (1,2 %); otros `valmen` 30 687 car (3,9 %); suite `vitest` 19 068 car (2,3 %), ya filtrada con `grep` por el orquestador; lecturas de archivos 1 864 car (0,5 %).
  - Diez bloques más grandes por relectura: resultado MCP valmen 6 699 car (3,0 M); salida de `journey brief` 6 118 (2,7 M); skill `corrida-orquestada` cargada 5 565 (2,5 M); `journey plan`+`next` 4 540 (2,0 M); `valmen resume` 4 426 (1,9 M); texto pegado por el PO 13 600 (1,8 M); tres informes de subagente de 2 953, 2 684 y 2 667 (1,3, 1,2 y 1,2 M); `journey handoff` 6 506 (1,3 M).
  - Fuera del texto visible: la base fija de cada llamada es ~76 000 tokens (sistema, herramientas, `AGENTS.md`), ~29,7 M de los 111 M; 197 bloques de razonamiento con 337 320 car de firma; 17 capturas; ninguna compactación en 451 llamadas.
- Causa comprobada (con `ruta:línea`):
  - El contrato de entrega pide «Responde en pocas líneas» sin forma ni tope (`packages/engine/src/journey-brief.ts:219`); los informes salieron con mediana de 16 líneas y ~1 800 car.
  - La skill ordena pasar el brief «entero» como prompt (`.valmen/skills/corrida-orquestada/SKILL.md:28`) y `journey brief` solo imprime en stdout (`packages/cli/src/commands.ts:3860`, `packages/engine/src/journey-brief.ts:94`): el brief entra dos veces al contexto del orquestador, como salida de Bash y como prompt.
  - `valmen resume` no tiene forma corta: el caso del CLI no lee más banderas que `--id` y `--cliente` (`packages/cli/src/main.ts:1409`) y el render incluye siempre el plan vigente completo, las fases y las duraciones (`packages/engine/src/resume.ts:257`, `resume.ts:268`, `resume.ts:279`); la skill lo manda a consultar «ante la duda» (`SKILL.md:60`).
  - La skill no dice cómo mostrar la suite ni que no se peguen salidas largas (`SKILL.md:50-52`), y «QA por comandos» no nombra un comando de cierre (`SKILL.md:62-64`), de modo que el orquestador escribió el ciclo de QA de ~12 pasos a mano por ticket.
- Separación harness / cliente:
  - Del harness: texto del brief y su contrato (`journey-brief.ts:211-231`), forma de pasar el brief, salida de `resume`, `journey next --wave` (`commands.ts:3824`), `journey worktree integrate`, la guía de la skill y `AGENTS.md`.
  - Del cliente (no se planifica aquí): que cada llamada relea la conversación entera sin compactar, la base fija de ~76 000 tokens, el sobre de `task-notification` (~730 car por aviso), el acuse de `Agent` (1 073 car por lanzamiento), la retención del razonamiento y las capturas.
- Ahorro estimado por cambio, medido sobre el transcript (relecturas de caracteres; ~3 car por token):
  - Informe de forma fija con tope de 900 car: de 104 063 a ~51 000 car; ~13,7 M relecturas (~8 % del texto visible, ~4,6 M tokens).
  - Brief por archivo: los prompts de `Agent` bajan de 64 004 a ~15 000 car y desaparece la salida de `journey brief` (11 361): ~12,5 M relecturas (~7 %, ~4,2 M tokens).
  - `resume --quiet` en el orquestador: de 27 201 a ~9 600 car (48 × 200): ~5,0 M relecturas (~3 %, ~1,7 M tokens).
  - Guía en la skill (suite solo resumen, no pegar salidas, recortar `journey`): ~50 % de vitest y `journey`: ~6,6 M relecturas (~4 %, ~2,2 M tokens); depende de que el modelo la siga.
  - Total del harness: ~38 M de 167,7 M relecturas visibles (~23 %), ~12,7 M tokens, ~11 % de los 111 M de caché; el resto es base fija y comportamiento del cliente.
- Hipótesis pendientes:
  - La relación de ~3 caracteres por token es aproximada: el crecimiento medido (~460 000 tokens) supera lo que explica el texto visible; la diferencia se atribuye a razonamiento retenido y capturas, sin poder medirla desde el transcript.
  - El ahorro de la guía de la skill depende de que el modelo orquestador la cumpla; se medirá en la próxima corrida.
  - `delegation close` cubre el cierre por comandos solo con delegación (`packages/cli/src/delegation.ts:330`); sin ella falta un comando (D4).
- Consumidores afectados: la sesión orquestadora y los subagentes de `corrida-orquestada`; las pruebas `tests/journey-brief.test.ts`, `tests/skill-corrida-orquestada.test.ts` y `tests/journey-ola-cli.test.ts`; la proyección de la skill que regenera `valmen sync` en `.claude/skills/`. `resume` sin `--quiet` y `journey brief` sin `--out` no cambian.
- Archivos y flujo investigados: `packages/engine/src/journey-brief.ts:59` (armado), `:94` (render), `:211` (contrato), `:223` (prohibiciones); `packages/cli/src/commands.ts:3824` (`journey next --wave`), `:3860` (`journey brief`); `packages/engine/src/resume.ts:102` y `:227`; `packages/cli/src/main.ts:171` y `:1409`; `packages/cli/src/delegation.ts:323`; `.valmen/skills/corrida-orquestada/SKILL.md:28`, `:31`, `:50-52`, `:60`, `:62-64`. Memoria: `buscar_memoria` sin antecedentes (AP-006, AP-007 y AP-010 no tratan el contexto).
- Riesgos y compatibilidad: un tope de informe demasiado bajo puede esconder una parada; la forma fija exige nombrar siempre la decisión pendiente. El brief por archivo deja el texto fuera de la conversación del orquestador, pero el archivo queda en disco y el subagente lo lee entero; si el archivo falta, el subagente debe detenerse. Las banderas nuevas son opcionales: sin ellas la salida es la de hoy.
- Impactos de sync, migración, Docker o despliegue: ninguno; cambia texto de salida del CLI, el brief y una skill del propio harness.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por la autorización APA-20261009-326fff; el PO eligió «Añadir la línea y repetir (Recomendado)» y la compuerta repetida dio APPROVE.
- Alcance: contrato de entrega del brief, bandera `--out` de `journey brief`, bandera `--quiet` de `resume` y guía de la skill `corrida-orquestada`.
- Exclusiones: comportamiento del cliente (relectura, compactación, sobre de `task-notification`, acuse de `Agent`, razonamiento retenido); `valmen journey close` sin delegación (D4); recorte de `AGENTS.md` (D5); salidas de `journey next --wave`, `journey worktree integrate` y `journey handoff`, que suman el 3,5 % de las relecturas y quedan cubiertas por la guía de la skill.
- Pasos ordenados:
  1. `packages/engine/src/journey-brief.ts`, función `contratoDeEntrega` (`:211`): reemplazar la línea «Responde en pocas líneas…» (`:219`) por la forma fija del informe —8 líneas y 900 caracteres como máximo, con los campos estado, commit, archivos, pruebas y decisión— y añadir la línea que prohíbe pegar salidas de comandos o recibos completos, que quedan en el ticket y en `.valmen/receipts/`. (C1, C2, C3, C4)
  2. `packages/cli/src/commands.ts`, función `journeyBriefCommand` (`:3860`): aceptar `--out <ruta>`; con ella, escribir `renderBriefDeSubagente(brief)` con `writeFileSync` en la ruta —el mismo texto, byte a byte, que `ok(...)` imprime sin `--out`, incluido el aviso de árbol sucio—, crear el directorio si falta e imprimir una sola línea con la ruta y los caracteres escritos; sin ella, la salida queda igual. Actualizar la ayuda de `journey brief` en `packages/cli/src/main.ts`. (C5, C6, C7)
  3. `packages/engine/src/resume.ts`: añadir `renderResumeQuiet(context)` junto a `renderResumeContext` (`:227`), con tres líneas: `id — estado`, el título del siguiente paso y su alto o la decisión que falta; `renderResumeQuiet` omite el plan vigente, los puntos abiertos, las fases, el último recibo y las duraciones. `packages/cli/src/main.ts`, caso `resume` (`:1409`), y la función `resumeTicket` (`packages/cli/src/commands.ts:470`) que llama: leer `--quiet` y usar ese render; sin la bandera nada cambia. Actualizar la ayuda en `main.ts:171`. (C8, C9, C10, C11, C12)
  4. `.valmen/skills/corrida-orquestada/SKILL.md`: en «Lanzar los subagentes» (`:28`), pasar el brief con `valmen journey brief --id <ID> --out <ruta>` y dar al subagente la ruta con la orden de leerlo entero; en «Reglas duras» (`:60`), consultar con `valmen resume --id <ID> --quiet`; nueva sección «Contexto del orquestador» tras «Suite completa» (`:50-52`): de la suite mostrar solo las líneas `Test Files` y `Tests` y los fallos, no pegar salidas largas de comandos, y leer el informe del subagente sin pedirle más detalle que el ticket. Subir `version` a 1.3.0 y ejecutar `valmen sync` para la proyección local. (C13, C14, C15, C16)
  5. `tests/contexto-orquestador.test.ts` (nuevo): pruebas de `contratoDeEntrega` vía `renderBriefDeSubagente`, de `journeyBriefCommand` con y sin `--out` (el contenido del archivo es igual a la salida sin `--out`) sobre un entorno temporal (`tests/helpers/ola.js`, `crearEntornoOla`), de `resume` con y sin `--quiet` y de la fuente de la skill. Ajustar `tests/journey-brief.test.ts` si afirma el texto exacto de la línea reemplazada. (C1–C16, C18)
  6. Compilar con `npx tsc --build tsconfig.build.json` y correr `npx vitest run tests/contexto-orquestador.test.ts tests/journey-brief.test.ts tests/journey-ola-cli.test.ts tests/skill-corrida-orquestada.test.ts`. (C17, C18)
- Impactos declarados: ninguno de sincronización, migración ni contenedores; las banderas son opcionales y sin ellas la salida del CLI es la de hoy.
- Medición posterior: en la próxima corrida orquestada se repite la medición del diagnóstico sobre el transcript y se anota en `## Evidencia` la caída de relecturas por categoría; no es criterio de este ticket porque depende de una corrida futura.
- Rollback (obligatorio): revertir el commit del ticket con `git revert <hash>` y ejecutar `valmen sync`; no hay datos ni registros que migrar, y los briefs escritos con `--out` son archivos temporales que se pueden borrar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1: El contrato de entrega del brief fija el informe final en 8 líneas como máximo.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C2: El contrato de entrega del brief fija el informe final en 900 caracteres como máximo.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C3: El contrato de entrega del brief nombra los cinco campos del informe: estado, commit, archivos, pruebas y decisión.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C4: El contrato de entrega del brief prohíbe pegar en el informe salidas de comandos o recibos completos.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C5: El archivo que escribe `valmen journey brief --id <ID> --out <ruta>` es idéntico a la salida de `valmen journey brief --id <ID>`.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C6: `valmen journey brief --id <ID> --out <ruta>` imprime una sola línea con la ruta escrita.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C7: `valmen journey brief --id <ID>` sin `--out` imprime el brief igual que antes del cambio.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C8: `valmen resume --id <ID> --quiet` imprime tres líneas como máximo.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C9: `valmen resume --id <ID> --quiet` incluye el estado del ticket.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C10: `valmen resume --id <ID> --quiet` incluye el título del siguiente paso.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C11: `valmen resume --id <ID> --quiet` no incluye el plan vigente.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C12: `valmen resume --id <ID>` sin `--quiet` imprime la misma salida que antes del cambio.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C13: La skill `corrida-orquestada` indica pasar el brief al subagente con `journey brief --out` y la ruta.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C14: La skill `corrida-orquestada` indica consultar el estado con `valmen resume --id <ID> --quiet`.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C15: La skill `corrida-orquestada` indica mostrar de la suite solo el resumen de archivos y pruebas.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C16: La skill `corrida-orquestada` indica no pegar en la conversación salidas largas de comandos.
      <!-- test: npx vitest run tests/contexto-orquestador.test.ts -->
- [x] C17: El monorepo compila sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C18: Las pruebas existentes del brief, de la ola y de la skill siguen en verde.
      <!-- test: npx vitest run tests/journey-brief.test.ts tests/journey-ola-cli.test.ts tests/skill-corrida-orquestada.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/engine/src/journey-brief.ts",
      "packages/engine/src/resume.ts",
      "skills/corrida-orquestada/SKILL.md",
      "tests/contexto-orquestador.test.ts",
      "tests/skill-corrida-orquestada.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/engine/src/journey-brief.ts` (`contratoDeEntrega`): informe de forma fija (8 líneas, 900 caracteres, campos estado, commit, archivos, pruebas y decisión) y línea que prohíbe pegar salidas de comandos o recibos completos.
- `packages/cli/src/commands.ts` (`journeyBriefCommand`): `--out <ruta>` escribe el mismo texto byte a byte, crea el directorio e imprime una línea; sin ella la salida no cambia. `packages/cli/src/main.ts`: `--out` en `VALUE_OPTIONS` y en la ayuda.
- `packages/engine/src/resume.ts`: `renderResumeQuiet` (tres líneas: id y estado, fase del siguiente paso, alto). `resumeTicket` y `resultadoReanudacion` reciben `quiet`; `main.ts` lee `--quiet` y actualiza la ayuda.
- `.valmen/skills/corrida-orquestada/SKILL.md` y su catálogo `skills/corrida-orquestada/SKILL.md` (v1.3.0, 6 125 B): brief por archivo, `resume --quiet`, sección «Contexto del orquestador». `valmen sync` ejecutado con el CLI compilado del worktree.
- Pruebas: `tests/contexto-orquestador.test.ts` (nuevo) y `tests/skill-corrida-orquestada.test.ts` (versión 1.3.0).
- Desvío del plan: la skill vive también en el catálogo `skills/` (lo que `sync` publica y lo que lee la prueba de la skill), por eso se editó en las dos rutas, idénticas.

## Pruebas

Directorio de ejecución: la raíz del worktree. Todas corren sobre raíces temporales; sin requisitos de ambiente.

- `npx tsc --build tsconfig.build.json` — esperado: sin salida, código 0. Resultado: OK.
- `npx vitest run tests/contexto-orquestador.test.ts` — esperado: 19 pruebas en verde (C1–C16). Resultado: OK.
- `npx vitest run tests/journey-brief.test.ts tests/journey-ola-cli.test.ts tests/skill-corrida-orquestada.test.ts tests/next-step.test.ts` — esperado: en verde (C18). Resultado: OK (5 archivos y 137 pruebas con el nuevo).
- `npx vitest run tests/skills-publicadas.test.ts tests/skills.test.ts tests/revision-skills.test.ts` — esperado: en verde (sync y skills). Resultado: 43 pruebas OK.
- `node packages/cli/dist/main.js secrets` — Sin secretos.
- Validación manual (opcional): `valmen journey brief --id <ID> --out /tmp/b.txt` imprime una línea; `valmen resume --id <ID> --quiet` imprime tres.
- No corrida: la suite completa (la corre el orquestador al integrar).

- Resultado del PO: Cerrarlos (Recomendado). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Pruebas del ticket y suite completa en verde; qa-mechanical approve

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:00b0558788fcfdaa36730e24ac6d7ae7c90e092d",
    "environment": "macOS, Node 24, main tras integrar; suite completa 231 archivos y 3927 pruebas en verde",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde; qa-mechanical approve",
    "reference": "worktree:sha256:e222eb74a857bda0f6876b6f10adb2cb80d8fe1def99c90531e4136ef0426dd2",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "Informe de subagente con forma fija (8 líneas, 900 caracteres), journey brief --out para pasar el brief por archivo, resume --quiet, y guía en la skill corrida-orquestada 1.3.0.",
    "functional_summary": "La sesión que orquesta una corrida relee menos texto en cada turno, lo que baja su costo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": "claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Sesión de subagente de implementación sin agregado de tokens expuesto; sin números.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
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
    "date": "2026-10-09",
    "at": "2026-10-09T14:34:21.497Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T15:40:30.330Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T15:43:53.026Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T15:51:45.983Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"autorización APA-20261009-326fff\",\"source\":\"autorizacion\",\"quote\":\"aprobacion de planes y analisis agentico\",\"planHash\":\"sha256:40e8b628c8557e90877e0e2d9bfcc95259d7e7ba98a75a8c6cc17c387cc236bf\",\"authorizationId\":\"APA-20261009-326fff\",\"authorizationHash\":\"sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d\",\"stage\":\"plan\",\"receiptId\":\"GR-20261009-IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009-plan-2\",\"receiptStateHash\":\"sha256:439038e70452ada51b0a01e115f40a9c74b4dc6eacdd65779e7e8a1efcbed778\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T15:52:03.700Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: autorización APA-20261009-326fff (fuente autorizacion, hash sha256:c19a86ffa26fde8eedf8f789eff6a06a13a941ae1e68c983ec078f02eba6be0d), plan sha256:40e8b628c8557e90877e0e2d9bfcc95259d7e7ba98a75a8c6cc17c387cc236bf."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T15:52:03.700Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T15:52:35.561Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T15:59:55.550Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T16:07:11.342Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:19.325Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:19.486Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:19.631Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:19.779Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:19.919Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:20.157Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:20.418Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:20.565Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:20.698Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:20.850Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:20.994Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:21.140Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:21.278Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
