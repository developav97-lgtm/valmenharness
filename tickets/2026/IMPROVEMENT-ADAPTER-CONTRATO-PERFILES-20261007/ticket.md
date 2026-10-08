---
schema_version: 2
id: IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007
title: Documentar en AGENTS.md y en la skill de flujo cómo se ejecuta por fases
type: IMPROVEMENT
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
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007

## Solicitud original

Parte del sprint: Una sesión interactiva delega cada fase a un subagente con el modelo del perfil cuando el cliente lo admite.
- R-PERF-007: Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil
Depende de: FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Una sesión interactiva DEBERÍA delegar cada fase a un subagente con el modelo del perfil
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-PERF-007: lo cubre FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 (Proveer a la sesión el modelo de cada fase y avisar si el cliente no admite subagentes)
- R-PERF-007: lo cubre FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 (Delegar cada fase a un subagente con el modelo del perfil sin cambiar el modelo de la sesión anfitriona)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el texto del contrato que lee una sesión interactiva —la plantilla `WORKFLOW_TEMPLATE` que proyecta `AGENTS.md` y la skill de flujo `corrida-delegada`— para que diga qué hacer cuando `resume` devuelve «Delegación de la fase». El motor ya calcula y dice la delegación; este ticket no toca código del motor.
- Usuario o rol afectado: el agente de una sesión interactiva que continúa un ticket o corre una delegación, y el PO que lee `AGENTS.md`.
- Comportamiento actual: `resume` imprime «Delegación de la fase X» con las instrucciones de lanzar un subagente con el modelo del perfil, pero `AGENTS.md` («Continuar un ticket») y la skill `corrida-delegada` no lo mencionan: un agente que solo lee el contrato puede hacer la fase con el modelo de la sesión o cambiar el modelo de la sesión.
- Comportamiento esperado: «Continuar un ticket» y el paso 1 de `corrida-delegada` dicen que, si `resume` trae «Delegación de la fase», la fase la hace un subagente con el modelo que indica, sin cambiar el modelo de la sesión, y que quien recibió el brief hace la fase él mismo.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): lo que falta es texto, no código. El motor ya resuelve la delegación: `packages/engine/src/resume.ts:195-202` arma las cinco instrucciones (worktree, subagente con el modelo de la fase, «No cambies el modelo de esta sesión», integrar, «si eres el subagente… no delegues») y `packages/engine/src/resume.ts:206-211` las imprime como «Delegación de la fase»; `packages/adapter/src/routing.ts:1289` da el motivo cuando el cliente no admite subagentes; `packages/engine/src/journey-brief.ts:119` imprime el «Alias de subagente» en el brief. En el contrato, `packages/adapter/src/templates.ts:45-47` («Continuar un ticket», proyectado en `AGENTS.md:144-146`) no nombra la delegación por fase, y `skills/corrida-delegada/SKILL.md:22` (paso 1, «`valmen resume --id <ID>`…») tampoco. `skills/corrida-orquestada/SKILL.md:29` ya lo cubre («Pide el modelo y esfuerzo que el brief declara para la fase») y la sección «Corrida orquestada» de `templates.ts:57-59` cubre el reparto en subagentes: no se tocan.
- Medición del tope: `WORKFLOW_TEMPLATE` 7 749 B + `INVARIANTS_TEMPLATE` 876 B + `DELIVERY_TEMPLATE` 1 710 B = 10 335 B, contra `TOPE_BYTES = 10400` en `tests/plantillas-compactas.test.ts:43`: quedan 65 B. La frase nueva medida pesa 139 B, así que no cabe sin recortar: se propone quitar el inciso redundante del paso 1 de `templates.ts:45` («—qué escribir, qué skill cargar, qué compuerta correr y dónde detenerse—», 80 B, que ninguna prueba fija; solo lo cita un comentario en `tests/next-step.test.ts:8-9`). Resultado medido: 10 394 B, sin subir el tope.
- Hipótesis pendientes: ninguna sobre el código. Queda como decisión del PO aceptar el recorte del inciso en vez de subir el tope.
- Consumidores afectados: `projectAgentsMd` (`packages/adapter/src/project.ts:170`) que proyecta `AGENTS.md` en este repositorio y en cada proyecto al correr `valmen sync`; la copia instalada `.valmen/skills/corrida-delegada/SKILL.md` (hoy idéntica a `skills/corrida-delegada/SKILL.md`); las pruebas `tests/plantillas-compactas.test.ts` (tope y frases), `tests/agents-md-tamano.test.ts` (presupuesto de `AGENTS.md`), `tests/adapters.test.ts` (proyección) y `tests/respuesta-agents-md.test.ts`.
- Archivos y flujo investigados: `packages/adapter/src/templates.ts`, `AGENTS.md`, `packages/engine/src/resume.ts`, `packages/engine/src/journey-brief.ts`, `packages/adapter/src/routing.ts`, `skills/corrida-delegada/SKILL.md`, `skills/corrida-orquestada/SKILL.md`, `tests/plantillas-compactas.test.ts`, `tickets/2026/IMPROVEMENT-ADAPTER-CONTRATO-CORRIDA-20261008/ticket.md` (patrón del ticket hermano). Flujo: `templates.ts` → `projectAgentsMd` → `valmen sync` → `AGENTS.md`; `resume` → `renderDelegacion` → texto que el agente lee.
- Riesgos y compatibilidad: margen de 6 B tras el cambio; el próximo añadido a la plantilla tendrá que recortar o pedir tope. Quitar el inciso del paso 1 no cambia ninguna frase que fijen las pruebas. Los `AGENTS.md` de otros proyectos solo cambian cuando una persona corre `valmen sync`. Las dependencias FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 y FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 están en `awaiting_user_tests`, con su código ya en `main`: el texto documenta un comportamiento existente.
- Impactos de sync, migración, Docker o despliegue: ninguno; solo texto de plantilla y de skill.

## Plan

- Gate de plan y aprobación: pendiente; lo aprueba una persona (el PO) antes de implementar.
- Alcance: una frase en el paso 2 de «Continuar un ticket» de `WORKFLOW_TEMPLATE` (`packages/adapter/src/templates.ts`), con el recorte del inciso del paso 1 para no subir el tope; una frase en el paso 1 de `skills/corrida-delegada/SKILL.md` y su copia `.valmen/skills/corrida-delegada/SKILL.md`; las pruebas. Exclusiones: el motor (`resume.ts`, `journey-brief.ts`, `routing.ts`), la skill `corrida-orquestada` y la sección «Corrida orquestada» (ya lo dicen), el tope `TOPE_BYTES` y `valmen sync` en otros proyectos.
- Pasos ordenados:
  1. Pruebas en rojo en `tests/plantillas-compactas.test.ts`: un `describe` nuevo sobre la sección «Continuar un ticket» de `WORKFLOW_TEMPLATE` aplanado que afirma que, con «Delegación de la fase», la fase la hace un subagente con ese modelo (C1), sin cambiar el modelo de la sesión (C2), y que quien recibió el brief hace la fase él (C3); y, con el ayudante `skill("corrida-delegada")` del mismo archivo, que la skill nombra «Delegación de la fase» con el subagente que indica (C4) y que no se cambia el modelo de la sesión (C5). (C1 a C5)
  2. En `tests/adapters.test.ts`, junto a los casos de `projectAgentsMd`, comprobar que el `AGENTS.md` proyectado contiene «Delegación de la fase» (C7).
  3. En `packages/adapter/src/templates.ts`, `WORKFLOW_TEMPLATE`, paso 1 de «Continuar un ticket»: quitar el inciso «—qué escribir, qué skill cargar, qué compuerta correr y dónde detenerse—» (80 B); paso 2: añadir « Si trae «Delegación de la fase», la hace un subagente con ese modelo sin cambiar el de la sesión; quien recibió el brief la hace él.» (139 B medidos). Sin tocar las frases que fijan otras pruebas ni `TOPE_BYTES`. (C1, C2, C3, C8, C9)
  4. En `skills/corrida-delegada/SKILL.md`, paso 1 de «Por cada ticket, en orden»: añadir «Si `resume` trae «Delegación de la fase», lanza el subagente que indica; no cambies el modelo de esta sesión.»; subir `version` de 1.0.0 a 1.1.0; copiar el archivo idéntico a `.valmen/skills/corrida-delegada/SKILL.md` con `cp` (sin pasarlo por el modelo). (C4, C5, C6)
  5. Ejecutar `valmen sync` en la raíz del worktree para regenerar `AGENTS.md` (nunca a mano). (C7, C10, C11)
  6. Correr `npx vitest run tests/plantillas-compactas.test.ts tests/adapters.test.ts tests/agents-md-tamano.test.ts tests/respuesta-agents-md.test.ts tests/next-step.test.ts tests/skills-publicadas.test.ts`, `npx tsc --noEmit -p tsconfig.json`, el `node -e` de C6 y `valmen secrets`; después la compuerta `qa-mechanical` con `valmen gate qa-mechanical --id IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007 --evaluator command`. (C1 a C10)
  7. Entrega: en `## Pruebas`, el contrato para el responsable con los comandos del paso 6 ejecutados desde la raíz del worktree (resultado esperado: archivos en verde, `tsc` sin errores, C6 imprime `iguales`); validación manual: leer «Continuar un ticket» en `AGENTS.md` y el paso 1 de la skill y confirmar que coinciden con las instrucciones de `packages/engine/src/resume.ts:195-202`, y `valmen sync --check` sin diferencias en el checkout principal tras integrar (C11); requisitos de ambiente: Node 24 y `node_modules` instalados. Registrar el consumo de IA, pasar a `awaiting_user_tests` y commit solo en la rama del worktree tras la confirmación.
- Impactos declarados: sincronización: ninguna; los `AGENTS.md` de otros proyectos solo cambian cuando una persona corre `valmen sync`. Migración: ninguna. Contenedores: ninguno, sin imagen ni publicación.
- Rollback (obligatorio): revertir el commit del ticket (`git revert <hash>`) y correr `valmen sync` para regenerar `AGENTS.md`; la skill vuelve a 1.0.0 con el mismo revert y no hay datos que restaurar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [ ] C1: «Continuar un ticket» de `WORKFLOW_TEMPLATE` dice que, con «Delegación de la fase», la fase la hace un subagente con ese modelo (R-PERF-007, parte documental)
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C2: «Continuar un ticket» dice que no se cambia el modelo de la sesión
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C3: «Continuar un ticket» dice que quien recibió el brief hace la fase él
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C4: el paso 1 de `skills/corrida-delegada/SKILL.md` dice que, con «Delegación de la fase», se lanza el subagente que indica
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C5: `skills/corrida-delegada/SKILL.md` dice que no se cambia el modelo de la sesión
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C6: `.valmen/skills/corrida-delegada/SKILL.md` es idéntica byte a byte a `skills/corrida-delegada/SKILL.md`
      <!-- test: node -e "const f=require('fs');const a=f.readFileSync('skills/corrida-delegada/SKILL.md');const b=f.readFileSync('.valmen/skills/corrida-delegada/SKILL.md');if(!a.equals(b))process.exit(1);console.log('iguales')" -->
- [ ] C7: el `AGENTS.md` que proyecta `projectAgentsMd` contiene «Delegación de la fase»
      <!-- test: npx vitest run tests/adapters.test.ts -->
- [ ] C8: las tres plantillas fijas suman 10 400 B o menos sin subir `TOPE_BYTES`
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts -->
- [ ] C9: las pruebas existentes de la plantilla y de `resume` siguen pasando sin cambiar sus frases
      <!-- test: npx vitest run tests/respuesta-agents-md.test.ts tests/next-step.test.ts tests/skills-publicadas.test.ts -->
- [ ] C10: el `AGENTS.md` proyectado sigue dentro de su presupuesto de tamaño
      <!-- test: npx vitest run tests/agents-md-tamano.test.ts -->
- [ ] C11: el `AGENTS.md` del repositorio queda regenerado por `valmen sync` y `valmen sync --check` no da diferencias tras integrar
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:49.081Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:58:40.647Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:59:43.877Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
