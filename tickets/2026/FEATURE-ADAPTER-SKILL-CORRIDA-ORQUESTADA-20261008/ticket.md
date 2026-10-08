---
schema_version: 2
id: FEATURE-ADAPTER-SKILL-CORRIDA-ORQUESTADA-20261008
title: Skill que guía a la sesión orquestadora para repartir los tickets en subagentes
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

- Gate de plan y aprobación: pendiente de la aprobación explícita del PO; el ticket es de bajo riesgo (texto de una skill, una lista y una frase de plantilla) y sin impactos críticos.
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

- [ ] C1: la skill `corrida-orquestada` existe en el catálogo y declara `version` y `origen: valmen`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C2: el catálogo `publicadas()` incluye la skill y la distingue de las del stack
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C3: la skill pesa 6 500 B o menos
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C4: la skill manda a pedir la ola con `valmen journey next --wave`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C5: la skill fija 3 simultáneos por defecto y deja al PO cambiarlo al pedirlo o con `--concurrency`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C6: la skill manda lanzar un subagente por ticket en segundo plano y en su propio worktree
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C7: la skill manda entregar al subagente el texto de `valmen journey brief` como su contexto
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C8: la skill decide la aprobación con `valmen approval-eligibility` y las autorizaciones vigentes, sola si es elegible y en lote para el PO si no
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C9: la skill declara que SECURITY y despliegue nunca se aprueban solos y se detienen para una persona
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C10: la skill integra de a uno con `valmen journey worktree integrate` y retira el worktree con `valmen journey worktree remove`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C11: la skill manda correr la suite completa una sola vez, después de integrar
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C12: la skill cierra la corrida con `valmen journey handoff`
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C13: la skill declara que solo el orquestador toca el checkout principal
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C14: la skill nombra de qué ticket hermano sale cada comando que aún no existe
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C15: la skill no autoriza push, force ni saltar hooks, ni que un subagente integre o apruebe
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C16: la skill manda detenerse ante un BLOCK, una compuerta humana dura y lo que quede fuera del alcance
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C17: `valmen sync` instala la skill en `.valmen/skills/` idéntica al catálogo
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C18: `valmen resume` no trata la skill como de dominio, y una skill propia sigue tratándose como de dominio
      <!-- test: npx vitest run tests/next-step.test.ts -->
- [ ] C19: las plantillas del AGENTS.md siguen bajo 9 800 B y apuntan a la skill `corrida-orquestada`
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C20: cada comando `valmen` que cita la skill existe en la ayuda del CLI o figura como pendiente de un ticket hermano
      <!-- test: npx vitest run tests/skill-corrida-orquestada.test.ts -->
- [ ] C21: el recorrido de la skill coincide con la sección 2 de la propuesta
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Directorio de ejecución: la raíz del worktree (o del repositorio tras integrar). Requisitos: Node 24 y `node_modules` instalados.

- `npx vitest run tests/skill-corrida-orquestada.test.ts tests/skills-publicadas.test.ts tests/plantillas-compactas.test.ts tests/next-step.test.ts` — esperado: los cuatro archivos en verde.
- `npx tsc --noEmit -p tsconfig.json` — esperado: sin errores.
- `npx valmen sync --check` — esperado: «Archivos generados al día.».
- `npx valmen secrets` — esperado: sin hallazgos.
- Manual: leer `skills/corrida-orquestada/SKILL.md` y comparar su recorrido con la sección 2 de `docs/propuesta-corrida-orquestada.md`.
- Los comandos `journey next --wave`, `journey brief`, `journey worktree` y `journey handoff` no se ejecutan en este ticket: pertenecen a los tickets hermanos.

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
  }
]
```
