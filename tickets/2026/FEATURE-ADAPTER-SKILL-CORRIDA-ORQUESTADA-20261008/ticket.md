---
schema_version: 2
id: FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008
title: Skill que guía a la sesión orquestadora para repartir los tickets en subagentes
type: FEATURE
module: ADAPTER
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008

## Solicitud original

Contexto: el PO paró la jornada por launchd (6 tickets en 9 h, un solo carril, 5 despachos fallidos, ~8 rescates a mano) y la reemplaza por una corrida orquestada en sesión: la sesión de Claude Code que el PO abre es el orquestador, y reparte los tickets en subagentes, cada uno en su worktree y rama, con 3 simultáneos por defecto (el PO lo cambia al pedir la corrida). Propuesta aprobada y comparativa con datos: docs/propuesta-corrida-orquestada.md y https://claude.ai/artifact/RvWQx8zH1LZ7e9H6dw6dEN. Decisiones del PO: 3 a la vez por defecto y cambiable con --concurrency N o al pedirlo; worktree por ticket; aprobación según la política por tipo de ticket (automática si hay autorización vigente y el ticket es elegible, en lote para el PO si no; SECURITY y despliegue nunca se aprueban solos); la visibilidad de los agentes se lee de los transcripts de los subagentes, sin instalar pixel-agents. Este ticket: la skill `corrida-orquestada` en el catálogo (.valmen/skills y su proyección con valmen sync), que le dice a la sesión: leer la jornada y pedir la ola (journey next --wave), lanzar un subagente por ticket en segundo plano en su worktree con el brief de journey brief, leer la política de aprobación por tipo (autorizaciones vigentes y approval-eligibility) para aprobar sola lo elegible y llevar el resto en lote al PO, integrar de a uno con journey worktree integrate, correr la suite completa una sola vez tras integrar, y cerrar con journey handoff. Reglas: solo el orquestador toca el checkout principal, SECURITY y despliegue se detienen para una persona, 3 simultáneos por defecto y el PO puede pedir otro número. Depende de los tickets de ola, worktree y handoff.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Ninguno bloquea el plan. Dos lecturas adoptadas, cada una se cambia con una línea de la skill. 1) Los comandos de los tickets hermanos aún no existen: la skill los cita con una sección «Dependencias» que dice de qué ticket sale cada uno y, mientras falten, el orquestador cae al camino que ya existe (`valmen journey plan`, `valmen resume`, `git worktree` a mano no se autoriza: se detiene y avisa). Pregunta al PO si prefiere otra caída. 2) El registro de la aprobación por autorización lo entrega SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007: la skill manda a decidir con `valmen approval-eligibility --id <ID> --stage plan` y, mientras no haya comando que registre la aprobación atribuida a la autorización, el plan va al lote del PO. Pregunta al PO: ¿el lote lo aprueba él con `approve-plan` por ticket citando su frase, como en la sesión de SaiOpenCloud?

## Descripción funcional

- Alcance: una skill de proceso nueva, `corrida-orquestada`, que le dice a la sesión de Claude Code que el PO abre (el orquestador) cómo ejecutar una jornada o una feature repartiendo los tickets en subagentes. Cubre: leer la jornada y pedir la ola, lanzar un subagente por ticket en segundo plano y en su worktree con el brief que el motor genera, decidir la aprobación de cada plan según la política por tipo (sola si hay autorización vigente y el ticket es elegible, en lote al PO si no), integrar de a uno, correr la suite completa una sola vez tras integrar y cerrar con el parte. Se publica en el catálogo del harness (`skills/corrida-orquestada/SKILL.md`), `valmen sync` la instala en `.valmen/skills/corrida-orquestada/SKILL.md` y la proyecta a cada runtime. Fuera de alcance: los comandos que la skill cita (`journey next --wave` y `journey brief`: FEATURE-ENGINE-JORNADA-OLA-20261008; `journey worktree create|integrate|remove`: FEATURE-ENGINE-INTEGRACION-WORKTREE-20261008; `journey handoff`: FEATURE-ENGINE-JORNADA-HANDOFF-20261008), el registro de la aprobación por autorización (SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007), la vista de agentes, el retiro del disparador por launchd y cambiar compuertas o la política de autonomía.
- Usuario o rol afectado: la sesión orquestadora (agente) que ejecuta la corrida, y el PO que la pide, aprueba en lote y recibe el parte.
- Comportamiento actual: la jornada solo se ejecuta con `journey advance` desde launchd, un ticket a la vez; el AGENTS.md solo conoce la delegación en serie (`corrida-delegada`). Una sesión que quiera repartir tickets en subagentes no tiene un procedimiento escrito: en la sesión de SaiOpenCloud del 2026-10-07 se improvisó, sin worktree, y rompió «un solo escritor» (`docs/propuesta-corrida-orquestada.md`, sección 1).
- Comportamiento esperado: ante «ejecuta la jornada de hoy» o «ejecuta el feature X de corrido», el agente carga `corrida-orquestada` y sigue su recorrido: ola (3 simultáneos por defecto, otro número si el PO lo pide o con `--concurrency N`), un subagente por ticket en worktree propio y en segundo plano, aprobación por política, integración de a uno por el orquestador, suite completa una sola vez tras integrar y parte final. La skill declara dónde se detiene para una persona (SECURITY, despliegue, cualquier BLOCK) y que solo el orquestador toca el checkout principal.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): es una capacidad que falta, no un defecto. El catálogo publicado (`skills/`) no tiene skill para la corrida orquestada: solo `skills/corrida-delegada/SKILL.md` (serie, un solo escritor del ticket) y `skills/programar-trabajo-de-tickets/SKILL.md` (agenda sesiones por launchd/Hermes). El motor reconoce las skills publicadas por una lista fija en `packages/engine/src/next-step.ts:79` y las que no están en ella cuentan como de dominio (`packages/engine/src/next-step.ts:122` a `:129`): una skill nueva sin agregarla ahí haría que `valmen resume` ofreciera «las skills de dominio del proyecto» a todos los tickets. La plantilla del AGENTS.md solo apunta a `corrida-delegada` (`packages/adapter/src/templates.ts:55`), y el tope de las tres plantillas es 9 800 B (`tests/plantillas-compactas.test.ts:41`).
- Hipótesis pendientes: (a) cuánto margen quedan bajo el tope de bytes de las plantillas para un puntero de una línea; el paso 4 lo mide y, si no cabe, acorta la frase de `corrida-delegada` en vez de subir el tope. (b) El nombre final de los flags de los tickets hermanos puede variar al implementarse; la prueba compara la skill contra el texto de ayuda de `main.ts` y contra una lista explícita de comandos pendientes, de modo que un cambio de nombre falla a la vista.
- Consumidores afectados: `packages/adapter/src/skills.ts:450` (`publicadas`), que lee `skills/` y por eso la skill entra al catálogo sin tocar código; `packages/cli/src/commands.ts:884` (`instalarPublicadas` en `sync`) que la copia a `.valmen/skills/` y la proyecta; `packages/engine/src/next-step.ts:79` (lista de publicadas); `packages/adapter/src/templates.ts:55` (puntero en AGENTS.md); `tests/skills-publicadas.test.ts`, `tests/plantillas-compactas.test.ts` y `tests/next-step.test.ts`, que recorren el catálogo y las plantillas. Tickets hermanos que editan `next-step.ts` o `templates.ts`: ninguno según su alcance; JORNADA-OLA, INTEGRACION-WORKTREE y JORNADA-HANDOFF editan `main.ts`, que este ticket solo lee.
- Archivos y flujo investigados: `AGENTS.md`, `docs/propuesta-corrida-orquestada.md` (secciones 2 y 3), `.valmen/skills/corrida-delegada/SKILL.md` (forma y tono: 3 800 B, frontmatter con `version: 1.0.0` y `origen: valmen`), `skills/programar-trabajo-de-tickets/SKILL.md`, `packages/adapter/src/skills.ts`, `packages/engine/src/next-step.ts`, `packages/adapter/src/templates.ts`, `packages/cli/src/main.ts` (ayuda de `approval-eligibility`, `approval-authorize`, `qa-authorize`, `approve-plan`, `journey`), `tests/skills-publicadas.test.ts`, `tests/plantillas-compactas.test.ts`, `tests/next-step.test.ts` y los tickets hermanos. Comprobado: `skills/` y `.valmen/skills/` son idénticos para las publicadas (`diff -r`), es decir `.valmen/skills/` es la copia que instala `valmen sync` y la fuente se edita en `skills/`.
- Riesgos y compatibilidad: (a) la skill puede inducir al orquestador a aprobar lo que decide una persona: lo cubren las reglas escritas (SECURITY, despliegue y todo BLOCK se detienen; `approve-plan` solo con frase literal del PO) y pruebas de texto con casos de control. (b) Citar comandos que no existen: la prueba separa los existentes (contra la ayuda de `main.ts`) de los pendientes, que deben estar en la sección «Dependencias». (c) Dos subagentes sobre los mismos archivos: la skill manda integrar de a uno y devolver el diff al subagente si hay conflicto. (d) Tamaño: tope de 6 500 B para la skill, para que se lea entera. (e) Compatibilidad: solo se agrega un archivo del catálogo, un id a una lista y una frase; los proyectos ya adoptados reciben la skill con el próximo `valmen sync`.
- Impactos de sync, migración, Docker o despliegue: ninguno de datos ni de contenedores. La instalación es la del harness (`valmen sync` instala la skill nueva en `.valmen/skills/` y proyecta); sin migraciones, sin imagen y sin despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. Crear `skills/corrida-orquestada/SKILL.md` (nuevo) con frontmatter `name: corrida-orquestada`, `description`, `version: 1.0.0` y `origen: valmen`, y un cuerpo de 6 500 B o menos, en este orden: «Cuándo se usa» y quién es el orquestador; «Dependencias» (qué comando sale de qué ticket hermano y qué hacer mientras falte); «Pedir la ola» (`valmen journey next --wave [--concurrency N]`, 3 por defecto, el PO puede pedir otro número); «Lanzar los subagentes» (uno por ticket, en segundo plano, con `isolation: worktree`, `valmen journey worktree create --id <ID>` y el texto de `valmen journey brief --id <ID>` como único contexto del subagente); «Aprobar» (`valmen approval-eligibility --id <ID> --stage plan`, `valmen approval-authorize list`, `valmen qa-authorize list`: sola si hay autorización vigente y es elegible, en lote al PO si no, SECURITY y despliegue nunca); «Integrar» (de a uno con `valmen journey worktree integrate --id <ID>`, conflicto: resolverlo o devolverlo al subagente con el diff, y `valmen journey worktree remove --id <ID>` después); «Suite completa una sola vez tras integrar» (`npx vitest run`); «Reglas duras» (solo el orquestador toca el checkout principal, nunca push ni force, un BLOCK y una compuerta humana dura se detienen); «Cerrar» (`valmen journey handoff --id <JORNADA>`). Cubre C1 a C16.
  2. Ejecutar `npx valmen sync` en el worktree para instalar `.valmen/skills/corrida-orquestada/SKILL.md` (nuevo, lo escribe la instalación) y proyectar a los runtimes, y verificar con `npx valmen sync --check` que quedó al día. Cubre C17.
  3. Agregar `"corrida-orquestada"` a `SKILLS_PUBLICADAS` en `packages/engine/src/next-step.ts` y un caso en `tests/next-step.test.ts` (dentro de `describe("las skills: ...")`): con `planificacion` y `corrida-orquestada` instaladas `skillsDeDominio` es `false`, y con una skill propia sigue siendo `true` (caso de control). Cubre C18.
  4. Agregar a la frase de «Corrida delegada» de `packages/adapter/src/templates.ts` un puntero de una línea a la skill `corrida-orquestada`, medir con `npx vitest run tests/plantillas-compactas.test.ts` y, si pasa el tope de 9 800 B, acortar esa frase hasta que quepa sin subir el tope; luego `npx valmen sync` regenera `AGENTS.md`. Cubre C19.
  5. Crear `tests/skill-corrida-orquestada.test.ts` (nuevo) que lee `skills/corrida-orquestada/SKILL.md` y afirma: frontmatter, publicación, tope de bytes, comandos y reglas citados (C1 a C16), instalación por `adoptProject` y `syncProject` en un directorio temporal (C17), y una comprobación de comandos que extrae cada `valmen <subcomando>` de la skill y exige que esté en el texto de ayuda de `packages/cli/src/main.ts` o en la lista explícita de pendientes de los tres tickets hermanos (C20). La prueba no ejecuta ningún comando de la skill. Casos de control: la skill no contiene `git push`, `--force` ni `--no-verify`; no manda a un subagente a integrar ni a aprobar; y una copia de la skill sin la regla de SECURITY hace fallar la afirmación de esa regla.
  6. Correr las pruebas del ticket: `npx vitest run tests/skill-corrida-orquestada.test.ts tests/skills-publicadas.test.ts tests/plantillas-compactas.test.ts tests/next-step.test.ts`, `npx tsc --noEmit -p tsconfig.json`, `npx valmen secrets` y `npx valmen sync --check`.
  7. Entrega: preparar el contrato de pruebas para el responsable (comandos del paso 6 ejecutados desde la raíz del worktree o del repositorio tras integrar, resultado esperado: archivos de prueba en verde, `tsc` sin errores, `sync --check` con «Archivos generados al día.»; validación manual: leer `skills/corrida-orquestada/SKILL.md` y confirmar que el recorrido coincide con la sección 2 de `docs/propuesta-corrida-orquestada.md`; requisito de ambiente: Node 24 y `node_modules` instalados). El ticket pasa a `awaiting_user_tests`; el commit solo tras la confirmación.
- Impactos declarados: sincronización: ninguno de datos ya sincronizados ni de clientes sin actualizar; los proyectos adoptados reciben la skill con su próximo `valmen sync`. Migración: ninguna. Contenedores: ninguno, sin imagen ni publicación.
- Rollback (obligatorio): revertir el commit del ticket (`git revert <hash>`), que borra las carpetas de la skill nueva en el catálogo y en el proyecto, quita el id de `SKILLS_PUBLICADAS`, la frase de la plantilla y la prueba; después `npx valmen sync` regenera `AGENTS.md` y las proyecciones. Los proyectos que ya la instalaron la conservan hasta que alguien borre su copia local; no afecta datos ni tickets.

## Criterios de aceptación

- [x] C1: la skill `corrida-orquestada` existe en el catálogo y declara `version` y `origen: valmen`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C2: el catálogo `publicadas()` incluye la skill y la distingue de las del stack
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C3: la skill pesa 6 500 B o menos
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C4: la skill manda a pedir la ola con `valmen journey next --wave`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C5: la skill fija 3 simultáneos por defecto y deja al PO cambiarlo al pedirlo o con `--concurrency`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C6: la skill manda lanzar un subagente por ticket en segundo plano y en su propio worktree
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C7: la skill manda entregar al subagente el texto de `valmen journey brief` como su contexto
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C8: la skill decide la aprobación con `valmen approval-eligibility` y las autorizaciones vigentes, sola si es elegible y en lote para el PO si no
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C9: la skill declara que SECURITY y despliegue nunca se aprueban solos y se detienen para una persona
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C10: la skill integra de a uno con `valmen journey worktree integrate` y retira el worktree con `valmen journey worktree remove`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C11: la skill manda correr la suite completa una sola vez, después de integrar
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C12: la skill cierra la corrida con `valmen journey handoff`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C13: la skill declara que solo el orquestador toca el checkout principal
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C14: la skill nombra de qué ticket hermano sale cada comando que aún no existe
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C15: la skill no autoriza push, force ni saltar hooks, ni que un subagente integre o apruebe
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C16: la skill manda detenerse ante un BLOCK, una compuerta humana dura y lo que quede fuera del alcance
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C17: `valmen sync` instala la skill en `.valmen/skills/` idéntica al catálogo
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C18: `valmen resume` no trata la skill como de dominio, y una skill propia sigue tratándose como de dominio
      <!-- test: npx vitest run tests/next-step.test.ts -->
- [x] C19: las plantillas del AGENTS.md siguen bajo 9 800 B y apuntan a la skill `corrida-orquestada`
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [x] C20: cada comando `valmen` que cita la skill existe en la ayuda del CLI o figura como pendiente de un ticket hermano
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [x] C21: el recorrido de la skill coincide con la sección 2 de la propuesta
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación del cierre de FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta cerrar su QA.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      ".valmen/skills/corrida-orquestada/SKILL.md",
      "packages/adapter/src/templates.ts",
      "packages/engine/src/next-step.ts",
      "skills/corrida-orquestada/SKILL.md",
      "tests/next-step.test.ts",
      "tests/plantillas-compactas.test.ts"
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

- `skills/corrida-orquestada/SKILL.md` (nuevo, 4 947 B, versión 1.0.0): cuándo se usa, dependencias, pedir la ola, lanzar subagentes, aprobar, integrar, suite completa una sola vez, reglas duras y cierre. Por decisión del PO, mientras no exista la aprobación automática por autorización todos los planes van en lote al PO, que los aprueba con `valmen approve-plan` por ticket citando su frase. Los comandos pendientes (`journey worktree integrate`: FEATURE-ENGINE-INTEGRACION-RAMA-20261008; `journey handoff`: FEATURE-ENGINE-JORNADA-HANDOFF-20261008) figuran en «Dependencias» con su ticket.
- `.valmen/skills/corrida-orquestada/SKILL.md`: instalada por `valmen sync`, idéntica al catálogo; `sync --check` al día.
- `packages/engine/src/next-step.ts`: `corrida-orquestada` en `SKILLS_PUBLICADAS`; caso en `tests/next-step.test.ts` con control (skill propia sigue siendo de dominio).
- `packages/adapter/src/templates.ts`: la frase de «Corrida delegada» apunta a `corrida-orquestada`; para no pasar el tope de 9 800 B se acortó la frase (se quitó la mención `valmen delegation`, que sigue en la skill `corrida-delegada`). `tests/plantillas-compactas.test.ts` afirma el puntero.
- `tests/skill-corrida-orquestada.test.ts` (nuevo): C1 a C17 y C20, con casos de control; extrae cada `valmen <comando>` de la skill y lo compara con `USAGE` de `main.ts` o con la lista de pendientes (y exige que un pendiente que ya exista se retire de la lista).
- C21 queda para el responsable (verificación manual).

## Pruebas

Directorio de ejecución: la raíz del worktree (o del repositorio tras integrar). Requisitos: Node 24 y `node_modules` instalados.

- `npx vitest run tests/skill-corrida-orquestada.test.ts tests/skills-publicadas.test.ts tests/plantillas-compactas.test.ts tests/next-step.test.ts` — esperado: los cuatro archivos en verde.
- `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores.
- `npx valmen sync --check` — esperado: «Archivos generados al día.».
- `npx valmen secrets` — esperado: sin hallazgos.
- Manual: leer `skills/corrida-orquestada/SKILL.md` y comparar su recorrido con la sección 2 de `docs/propuesta-corrida-orquestada.md`.
- Los comandos `journey next --wave`, `journey brief`, `journey worktree` y `journey handoff` no se ejecutan en este ticket: pertenecen a los tickets hermanos.

- Verificación 2026-10-08: el orquestador comparó el recorrido de la skill con la sección 2.1 de `docs/propuesta-corrida-orquestada.md`; faltaba el paso de QA por comandos y se añadió a la skill («QA por comandos»).

- Resultado del PO: «prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08. Las pruebas de comando del ticket las ejecutó el orquestador (compuerta qa-mechanical en approve, verificaciones por comando del 2026-10-08 y suite completa en main: 3535 pruebas verdes); lo que es de pantalla o de entorno queda para el PO.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-08",
    "build_reference": "commit:39214d83d425e9db724d7b737bf5fdb6c6374479",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-08",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde (ver ## Pruebas)",
    "reference": "worktree:sha256:4d2be9a72c4bcdece9136c8f25bbbbfb66ccb3aa99d2c83d5e6b5bfcaf9c32f3",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«prueba y cierra lo que puedas cerrar tú con pruebas de comando» — Juan Andrade, 2026-10-08"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-08",
    "technical_summary": "Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.",
    "functional_summary": "Skill que guía a la sesión orquestadora para repartir los tickets en subagentes",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicar; sin impacto de despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Subagente de Claude Code dedicado solo a este ticket; la sesión no expone agregado de tokens",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-sin-agregado",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión orquestadora que cerró varios tickets; sin números por ticket para no repartir a ojo un costo que no se midió.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code orquestadora, subagente por ticket",
    "confidence": "low",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": "9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 34 tickets (FEATURE-ENGINE-JORNADA-OLA-20261008 ×115, SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007 ×104, FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 ×102, FEATURE-ENGINE-JORNADA-HANDOFF-20261008 ×84, BUGFIX-CLI-CANAL-DECISION-20261005 ×83), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 16627901 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"ValmenHarness CLI attachments feature\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:9f1455c8-a551-4602-ac40-a8d026bd66b8",
    "confidence": "high",
    "id": "CONSUMO-003"
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
    "date": "2026-10-08",
    "at": "2026-10-08T13:44:12.848Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T15:02:21.170Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T15:02:55.534Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:37.082Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 9 planes de la corrida orquestada)\",\"planHash\":\"sha256:4563ff5b6f2bcb1509856bbb1d41906ef7be86c1fe3eb4449d2417809ee01355\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:38.155Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:4563ff5b6f2bcb1509856bbb1d41906ef7be86c1fe3eb4449d2417809ee01355."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T15:23:38.155Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T15:53:27.915Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T16:08:47.695Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T16:08:50.067Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:23.657Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:23.944Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:24.279Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:24.586Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:24.877Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:25.247Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:25.681Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:26.003Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:26.314Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:26.684Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:26.992Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:27.291Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:28.995Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:29.173Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-08",
    "at": "2026-10-08T22:43:29.505Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
