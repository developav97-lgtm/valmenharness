---
schema_version: 2
id: BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010
title: Una conjunción dentro de un nombre no hace compuesto a un criterio
type: BUGFIX
module: GATE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010

## Solicitud original

packages/gate/src/criteria.ts:47 define CONJUNCIONES = /(?:^|\s)(?:así como|y|e|o|u)(?=\s)/giu y cuenta cada coincidencia como una afirmación más. Un criterio manual con una «y» dentro de un nombre o de una condición, p. ej. «Con OpenCode 2.0.16 y --auto» o «quedan idénticas, en su orden original», se lee como compuesto y vota 0: la compuerta de plan de SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 dio BLOCK dos veces (recibos plan-1 y plan-2) hasta reescribirlo sin la «y», y el motor lo calificó como hueco del plan. Se pide reproducir primero con los recibos plan-1 y plan-2 de ese ticket (en .valmen/receipts/) y con el texto exacto de C13 y C14, y luego que la detección distinga una conjunción entre dos afirmaciones de una «y» dentro de un sintagma, con pruebas que fallen sin el arreglo: los dos criterios reales (deben pasar a atómicos), un criterio verdaderamente compuesto («El sistema valida el monto y envía el aviso», debe seguir contando 2) y el caso de «o» y «e». Decisión del PO del 2026-10-10: «BUGFIX de la conjunción «y» en criteria.ts». Es modo directo si el cambio queda chico (EST-008), con las dos reglas.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el conteo de afirmaciones de un criterio (`afirmacionesDe`, `packages/gate/src/criteria.ts:57-65`). Nada más: ni umbrales, ni política, ni el evaluador.
- Usuario o rol afectado: quien escribe el plan de un ticket (agente o PO) y el orquestador, que ve un BLOCK de la compuerta de plan sin hueco real en el plan.
- Comportamiento actual: una «y», «e», «o» o «u» dentro de una condición inicial («Con OpenCode 2.0.16 y `--auto`, …») o dentro de un literal (`` `### Supuestos y decisiones pendientes` ``, «Gate de plan y aprobación:») cuenta como una afirmación más. Un criterio manual así vota 0 («agrupa 2 afirmaciones; partilo») aunque un paso lo cite, y el gate de plan da BLOCK.
- Comportamiento esperado: la condición inicial y los literales no suman afirmaciones; la conjunción de la cláusula principal sí. «Con OpenCode 2.0.16 y `--auto`, un agente proyectado no puede leer `.env`» cuenta 1; «El sistema valida el monto y envía el aviso» sigue contando 2.

## Diagnóstico

- Memoria consultada: `valmen memory search "GATE criterio compuesto conjunción afirmaciones"` → AP-013 (`.valmen/memory/aprendizajes.md:107`) describe este mismo síntoma, sin arreglo; AP-001 (`:5`) es el origen de la heurística (un compuesto cae en banda). Este diagnóstico los cita y no los contradice.
- Reproducción con datos reales (código real, `npm run build` y `afirmacionesDe` de `packages/gate/dist/index.js`, script en el scratchpad de la sesión):
  - Recibos `GR-20261011-SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010-plan-1` y `-plan-2` (`.valmen/receipts/SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010.jsonl`): `criterio_13=0.00` y `criterio_14=0.00`, outcome `block`, nota «criterio_13 decidido en código: agrupa 2 afirmaciones; partilo» (igual para criterio_14).
  - Texto exacto de esos recibos: C13 «Con OpenCode 2.0.16 y `--auto`, un agente proyectado no puede leer `.env`» → `afirmacionesDe` = **2**; C14 «Con OpenCode 2.0.16 y `--auto`, un agente proyectado no puede ejecutar `git -C . reset --hard`» → **2**. Reescritos «en modo `--auto`», el recibo `plan-3` les da 0.99.
  - Control: «El sistema valida el monto y envía el aviso» → **2** hoy (correcto, debe seguir así).
  - El caso citado en la solicitud «quedan idénticas, en su orden original» es el C6 ya reescrito: no tiene conjunción y hoy cuenta 1. Su texto anterior en `plan-1`/`plan-2` («quedan con su texto y su orden, delante de las del harness») es un criterio `test:` de comportamiento: lo votó el evaluador (0.895, banda), no este conteo, que solo alimenta el aviso de forma. Queda fuera del alcance (ver hipótesis).
- Dimensión del falso positivo (criterios con `<!-- test: … -->` o `<!-- verify: manual -->` de los 205 tickets `closed` de `tickets/2026/`): 2222 criterios; 886 cuentan ≥2 hoy (59 manuales). Con la regla propuesta en el plan, 56 bajan su conteo y 38 pasan a 1 —revisados uno por uno, los 38 son falsos positivos: 35 por una conjunción dentro de la condición inicial —sola o junto a un literal— («Con `--codegraph` y sin índice, …», «con cliente `claude` y un perfil mixto…, …»), 3 solo por un literal entre comillas angulares o acentos graves—. 2 de los 38 son manuales (FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008 C17, FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008 C29). Ningún criterio con dos verbos en la cláusula principal pasa a 1. Los otros ~830 son coordinación en la cláusula principal y siguen como hoy.
- Causa comprobada (con `ruta:línea`): `packages/gate/src/criteria.ts:47` define `CONJUNCIONES = /(?:^|\s)(?:as[íi] como|y|e|o|u)(?=\s)/giu` y `packages/gate/src/criteria.ts:61-64` suma 1 por cada coincidencia en todo el texto, sin distinguir la condición inicial ni los literales; `packages/engine/src/revision-previa.ts:432-434` convierte ese 2 en voto 0 de un criterio manual.
- Hipótesis pendientes: (H1) la coordinación de dos sintagmas nominales bajo un solo verbo en la cláusula principal («guarda el saldo y el historial», «quedan con su texto y su orden») sigue contando 2: las pruebas vigentes la fijan como compuesta (`tests/gate-plan-aviso.test.ts:122`, `tests/gate-criterios-por-forma.test.ts:165`, `:435-436`), y distinguir «un objeto con nombre doble» de «dos objetos» exige un modelo; no se toca en este ticket. (H2) una condición inicial sin coma («Sin jornada del día el avance lo dice y explica…») no se reconoce y sigue contando como hoy: falso positivo residual, no regresión.
- Consumidores afectados (todos por `afirmacionesDe`, ninguno cambia de firma):
  - Compuerta de plan, voto en código de un manual: `packages/engine/src/revision-previa.ts:432` (`decidirCriterioEnCodigo`), llamado desde `packages/engine/src/gate.ts:692`.
  - Clasificación «se decide en código» de un `test:` que «pasa»: `packages/gate/src/criteria.ts:115` (`esCriterioDePrueba`) → `:122` (`seDecideEnCodigo`) → `packages/gate/src/dynamic.ts:650`.
  - Aviso de forma del recibo en REVIEW: `packages/gate/src/criteria.ts:77-82` (`analizarFormaDeCriterios`) → `packages/engine/src/gate.ts:366` (`avisoDeForma`).
  - Precheck, tope de 40 afirmaciones: `packages/engine/src/revision-previa.ts:324`.
  - Reexportación pública: `packages/gate/src/index.ts:18`.
- Archivos y flujo investigados: `packages/gate/src/criteria.ts` (completo), `packages/gate/src/dynamic.ts:640-655`, `packages/engine/src/gate.ts:355-385`, `packages/engine/src/revision-previa.ts:315-335` y `:425-450`, `tests/gate-plan-aviso.test.ts`, `tests/gate-criterios-por-forma.test.ts`.
- Riesgos y compatibilidad: el cambio solo puede bajar el conteo, nunca subirlo; un criterio que hoy es atómico sigue atómico. El riesgo es un falso negativo (un compuesto real leído como 1): se acota porque la condición se reconoce solo si empieza por una palabra de condición y termina en la primera coma, y la cláusula principal se sigue contando entera. El tope del precheck (`revision-previa.ts:324`) puede bajar unas afirmaciones en tickets con condiciones: es la corrección buscada. Sin cambios de API ni de recibos.
- Impactos de sync, migración, Docker o despliegue: ninguno

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 19 criterios y la regla mínima que distingue una conjunción entre dos afirmaciones de una dentro de un nombre o una condición.
- Modo y tamaño: BUGFIX chico, acotado a `packages/gate/src/criteria.ts` más una prueba nueva. Previsto: 19 criterios; unas 40 líneas de producción más unas 130 de pruebas (unas 170 en total, por debajo de la banda de 300 a 700: no se infla). Reproducción hecha con datos reales (ver Diagnóstico); la prueba nueva falla sin el arreglo.
- Regla mínima, sin modelo: una conjunción une dos afirmaciones solo si está en la cláusula principal, fuera de un literal. Dos cosas no son cláusula principal: (a) un literal —el texto entre acentos graves, entre comillas angulares o entre comillas dobles—, que es un nombre; (b) la condición inicial —lo que va desde una palabra de condición al principio del criterio, después de su etiqueta, hasta la primera coma—. Las palabras de condición son una lista cerrada de 14: con, sin, si, cuando, tras, ante, al, dado, dada, mientras, según, antes de, después de, para cada. Sin coma no hay condición reconocible y se cuenta todo, como hoy. La coordinación de dos sintagmas en la cláusula principal sigue contando como hoy (H1): no hay lista de excepciones.
- Pasos ordenados:
  1. `packages/gate/src/criteria.ts`, `afirmacionesDe`: antes de partir por `;`, reemplazar cada literal por un marcador sin espacios con una constante no exportada `LITERALES` (regex de acentos graves, comillas angulares, comillas dobles) (C9, C10).
  2. `packages/gate/src/criteria.ts`: nueva función no exportada `clausulaPrincipal(parte)` que quita la etiqueta inicial con una constante no exportada `ETIQUETA` (`Cn` con su separador `.`, `:` o `—`, más un `R-…` opcional entre paréntesis o seguido de `:`) y, si lo que queda empieza por una palabra de `CONDICION_INICIAL`, devuelve lo que sigue a la primera coma; sin coma devuelve la parte entera (C1, C2, C6, C7, C8, C11, C12, C13).
  3. `packages/gate/src/criteria.ts:61-64`: el `reduce` cuenta `CONJUNCIONES` sobre `clausulaPrincipal(parte)`; `CONJUNCIONES` (`:47`) queda igual, igual que la firma de `afirmacionesDe`, `analizarFormaDeCriterios`, `esCriterioDePrueba` y `seDecideEnCodigo`; se actualiza el JSDoc de `afirmacionesDe` con la regla. Sin exportaciones nuevas (C3, C4, C5, C18).
  4. Crear `tests/gate-conjuncion-criterios.test.ts` con una sola tabla `it.each([texto, esperado])` que recorre los casos de C1 a C13: C13 y C14 reales del recibo `plan-1`, el control «El sistema valida el monto y envía el aviso» = 2, el par con «e», el par con «o», «u» en condición, el C2 real de un ticket cerrado con «o» en la condición, un literal entre acentos graves, uno entre comillas angulares, una condición seguida de dos verbos = 2, una condición sin coma, una etiqueta `C13. (R-PER-002)`. Un caso aparte llama `decidirCriterioEnCodigo` de `packages/engine/src/revision-previa.ts` con el C13 real citado por un paso (C14).
  5. Comprobar que la tabla falla sin el arreglo: con `git stash push packages/gate/src/criteria.ts`, `npx vitest run tests/gate-conjuncion-criterios.test.ts` debe fallar en las filas de condición, literal, etiqueta; después `git stash pop` (C15).
  6. Correr sin editarlas `npx vitest run tests/gate-plan-aviso.test.ts` (C16) y `npx vitest run tests/gate-criterios-por-forma.test.ts` (C17): sus textos («guarda el saldo y el historial», «nombra el paso y el motivo del cambio», «se cumple en la pantalla y en el informe», «sale con fecha; el recibo queda anexado») no tienen condición inicial ni literal, así que cuentan lo mismo; medido con el prototipo de la regla.
  7. `node scripts/exports-sin-uso.mjs` (C18) y `npx tsc -p tsconfig.json --noEmit` (C19).
- Pruebas existentes que el cambio pone en rojo a propósito: ninguna. Medido: todos los textos de `tests/gate-plan-aviso.test.ts:120-131` y de `tests/gate-criterios-por-forma.test.ts:165`, `:179`, `:432-436` dan el mismo conteo con la regla. Si una prueba existente se pone en rojo, es un defecto del arreglo: no se edita (EST-009) y se reporta.
- Impactos declarados: ninguno; sin sincronización, migración, contenedores ni despliegue.
- Rollback (obligatorio): revertir el commit del ticket en su rama; `criteria.ts` vuelve al conteo anterior y la prueba nueva se va con él.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `afirmacionesDe` cuenta 1 para el texto de C13 del recibo `plan-1` de SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C2. `afirmacionesDe` cuenta 1 para el texto de C14 del recibo `plan-1` de SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C3. Un criterio con dos verbos unidos por «y» en la cláusula principal sigue contando 2
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C4. Un criterio con dos verbos unidos por «e» en la cláusula principal sigue contando 2
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C5. Un criterio con dos verbos unidos por «o» en la cláusula principal sigue contando 2
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C6. Una «o» dentro de la condición inicial no suma una afirmación
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C7. Una «e» dentro de la condición inicial no suma una afirmación
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C8. Una «u» dentro de la condición inicial no suma una afirmación
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C9. Una conjunción dentro de un literal entre acentos graves no suma una afirmación
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C10. Una conjunción dentro de un literal entre comillas angulares no suma una afirmación
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C11. Una conjunción de la cláusula principal que sigue a una condición inicial suma una afirmación
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C12. Una condición inicial sin coma de cierre se cuenta entera, igual que antes del arreglo
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C13. La etiqueta inicial `C13. (R-PER-002)` no impide reconocer la condición que la sigue
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C14. `decidirCriterioEnCodigo` vota 0.99 al texto real de C13 como criterio manual citado por un paso del plan
      <!-- test: npx vitest run tests/gate-conjuncion-criterios.test.ts -->
- [x] C15. La tabla de `tests/gate-conjuncion-criterios.test.ts` falla contra el `criteria.ts` anterior al arreglo
      <!-- verify: manual -->
- [x] C16. Las pruebas de `tests/gate-plan-aviso.test.ts` pasan sin editarlas
      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->
- [x] C17. Las pruebas de `tests/gate-criterios-por-forma.test.ts` pasan sin editarlas
      <!-- test: npx vitest run tests/gate-criterios-por-forma.test.ts -->
- [x] C18. `node scripts/exports-sin-uso.mjs` pasa sin exportaciones nuevas sin consumidor
      <!-- test: node scripts/exports-sin-uso.mjs -->
- [x] C19. El monorepo compila con `npx tsc -p tsconfig.json --noEmit`
      <!-- test: npx tsc -p tsconfig.json --noEmit -->

## Puntos

```json
[]
```

## Implementación

- `packages/gate/src/criteria.ts`: `afirmacionesDe` reemplaza cada literal por un marcador (`LITERALES`) y cuenta `CONJUNCIONES` solo sobre `clausulaPrincipal(parte)`, que quita la etiqueta (`ETIQUETA`) y la condición inicial (`CONDICION_INICIAL`, hasta la primera coma). Sin cambios de firma ni exportaciones nuevas.
- `tests/gate-conjuncion-criterios.test.ts`: una tabla `it.each` de 13 casos (C1 a C13) y un caso de `decidirCriterioEnCodigo` (C14).
- Reproducción previa (REGLA 1): antes del arreglo los textos reales de C13 y C14 contaban 2; la prueba nueva falló en 9 de 14 filas (C1, C2, C6 a C10, C13, C14) y el control de «y» siguió en 2.
- Ninguna prueba existente se puso en rojo.

## Pruebas

Directorio: raíz del repositorio (worktree).

- `npx vitest run tests/gate-conjuncion-criterios.test.ts` → 14 pruebas pasan; con `git stash push packages/gate/src/criteria.ts` fallan 9 de 14 (C15).
- `npx vitest run tests/gate-plan-aviso.test.ts tests/gate-criterios-por-forma.test.ts` → pasan sin editarlas (46 con la nueva).
- Consumidores de `criteria.ts` (`revision-previa`, `cierre-criterios`, `gate-jev`, `gate-decide`, `gate-impacto-nulo`, `gate-jev-propositions`, `gate-playwright-plan`, `gate-view`, `statehash-archivos-citados`) → 182 pruebas pasan.
- `npx tsc --noEmit -p tsconfig.json` → 0 errores; `npm run exports:check` → sin entradas nuevas (línea base 439); `npm run lint` → 0 errores; `npm run format:check` → limpio.
- Validación manual del responsable: volver a correr la compuerta de plan de SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 y comprobar que C13 y C14 ya no dan «agrupa 2 afirmaciones».

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
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: sesión de implementación sin números expuestos",
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
    "at": "2026-10-11T04:20:49.540Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T06:36:08.479Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T06:38:42.814Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:10.917Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010-plan-1, canal cli, decidida 2026-10-11T06:44:10.914Z): Firmar y aprobar (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:11.283Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Firmar y aprobar (Recomendado)\",\"planHash\":\"sha256:cdcc42663781f94b94ebdcfe197913c3f7cf1366087ef74f977f32ed78cde5eb\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:11.598Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:cdcc42663781f94b94ebdcfe197913c3f7cf1366087ef74f977f32ed78cde5eb."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:11.598Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T06:44:28.833Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T06:46:03.202Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T06:46:33.468Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
