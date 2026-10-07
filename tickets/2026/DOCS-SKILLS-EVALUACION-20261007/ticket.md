---
schema_version: 2
id: DOCS-SKILLS-EVALUACION-20261007
title: Evaluar Ponytail, Addy Osmani, Awesome Claude Skills, Archify, Superpowers y Caveman con fuente, solapamiento, riesgo y decisión
type: DOCS
module: SKILLS
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-07
related_ticket: null
target_release: null
released_in: null
---

# DOCS-SKILLS-EVALUACION-20261007

## Solicitud original

Parte del sprint: Las skills restantes quedan evaluadas con su decisión y motivo.
- R-SKILL-005: Las skills restantes DEBEN evaluarse con una decisión registrada
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: Las skills restantes DEBEN evaluarse con una decisión registrada
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: dejar por escrito la evaluación de seis skills de terceros de la lista del PO —Ponytail, Addy Osmani Skills, Awesome Claude Skills, Archify, Superpowers y Caveman— con la fuente consultada, lo que hace, el solapamiento con el harness, el riesgo y una decisión (incluir, probar o descartar) con su motivo (R-SKILL-005). Fuera de alcance: instalar o integrar ninguna; UI UX Pro Max, Impeccable y CodeGraph tienen sus propios tickets.
- Usuario o rol afectado: el PO, que decide qué skills entran al harness, y los agentes que luego integran las que se aprueben.
- Comportamiento actual: no existe un registro de por qué una skill de terceros entra o se descarta; la lista salió de una imagen cuyo ranking de estrellas no coincide con las fuentes consultadas.
- Comportamiento esperado: un documento de la feature, `evaluacion-skills.md`, con una sección por skill y una decisión explícita con su motivo; Archify queda marcada como no verificable si no hay una fuente comprobable.

## Diagnóstico

- Archivos y flujo investigados: el comportamiento que falta es el artefacto de decisión que pide el requisito R-SKILL-005 en `.valmen/features/skills-de-terceros-y-ux/spec/skills/spec.md` («el resultado DEBE quedar en un documento de la feature»); el brief `.valmen/features/skills-de-terceros-y-ux/feature.md` lo declara dentro del alcance («una evaluación registrada de las skills restantes») y su sección Artefactos lista solo la spec, el diseño, los tickets y la verificación, así que ningún archivo de esa carpeta contiene hoy una evaluación de skills. El directorio `.valmen/features/skills-de-terceros-y-ux/` es donde falta y donde irá el documento; el contraste de solapamiento se hace contra `AGENTS.md` (contrato de respuesta y flujo de tickets). Las fuentes de cada skill se consultaron en la web el 2026-10-07.
- Causa raíz o hipótesis: el síntoma es que adoptar una skill por su popularidad en una imagen no deja rastro de por qué se eligió, y varias duplican lo que el harness ya hace: Caveman repite la brevedad que ya impone el contrato de respuesta, y Superpowers impone su propio flujo de plan y revisión, que choca con el ticket, las compuertas y la aprobación humana. La causa comprobada es que no hay un documento de decisión. Hipótesis a confirmar al escribirlo: que Archify no tenga una fuente verificable con ese nombre.
- Riesgos y compatibilidad: (a) las skills de terceros corren con los permisos del agente, así que cada decisión «probar» debe pasar por la declaración con versión fijada y la revisión registrada de los tickets de seguridad de esta feature; (b) las cifras de las fuentes (estrellas, ahorro de código o de tokens) son declaraciones de sus autores y no medidas propias, y el documento lo dice; (c) Consumidores comprobados con búsqueda: ningún código lee este documento, es registro para personas, y no cambia ningún archivo del producto; (d) escribirlo no instala nada.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261007-001 del 2026-10-07 (««el la decision si seria la A» … «la A su con lo de los tickets no elegibles si sigue» — Juan Andrade, 2026-10-07: la corrida delegada lleva los tickets SECURITY y DOCS de las tres features nuevas, en orden de dependencias, deteniéndose en cada plan SECURITY para su aprobación»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: un documento de evaluación y su comprobación de forma. Exclusiones: instalar o integrar skills.
- Pasos ordenados:
  1. Crear `.valmen/features/skills-de-terceros-y-ux/evaluacion-skills.md` con una sección «## <skill>» por cada una de las seis (Ponytail, Addy Osmani Skills, Awesome Claude Skills, Archify, Superpowers y Caveman) que contenga: fuente consultada con su enlace, qué hace, solapamiento con el harness, riesgo, y una línea «Decisión: incluir, probar o descartar» con su motivo.
  2. En el mismo `evaluacion-skills.md`, redactar las decisiones con la evidencia ya reunida: Caveman descartada por solapar el contrato de respuesta; Superpowers no se adopta entera pero se toman ideas sueltas (verificar antes de dar por terminado, depuración sistemática); Ponytail y Addy Osmani Skills a probar con versión fijada y revisión; Awesome Claude Skills descartada como instalable porque es un índice sin auditoría; Archify no verificable sin una fuente comprobable.
  3. Verificar con el comando del criterio que el documento nombra las seis skills y que cada sección trae su decisión, y correr `npx vitest run` para confirmar que el registro sigue válido.
- Rollback: borrar el documento; nada depende de él.

## Criterios de aceptación

- [x] El documento tiene una sección por cada una de las seis skills evaluadas
      <!-- test: node -e "const t=require('fs').readFileSync('.valmen/features/skills-de-terceros-y-ux/evaluacion-skills.md','utf8');for(const n of ['Ponytail','Addy Osmani Skills','Awesome Claude Skills','Archify','Superpowers','Caveman'])if(!t.includes('## '+n))process.exit(1)" -->
- [x] Cada sección declara una decisión (incluir, probar, descartar o no verificable) con su motivo y su fuente
      <!-- test: node -e "const t=require('fs').readFileSync('.valmen/features/skills-de-terceros-y-ux/evaluacion-skills.md','utf8');const s=t.split('\n## ').slice(1);if(s.length<6||!s.every(x=>/Decisión:/.test(x)&&/Fuente/.test(x)))process.exit(1)" -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de DOCS-SKILLS-EVALUACION-20261007",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      ".valmen/features/skills-de-terceros-y-ux/evaluacion-skills.md"
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

- `.valmen/features/skills-de-terceros-y-ux/evaluacion-skills.md` (nuevo): una sección por skill (Ponytail, Addy Osmani Skills, Awesome Claude Skills, Archify, Superpowers y Caveman) con fuente consultada, qué hace, solapamiento con el harness, riesgo y decisión con su motivo. Decisiones: probar Ponytail y la skill de interfaces de Addy Osmani con versión fijada y revisión; descartar Awesome Claude Skills (índice sin auditoría), Superpowers entero (impone su flujo; se toman ideas sueltas) y Caveman (duplica el contrato de respuesta); Archify no verificable sin una fuente.
- No se instaló nada ni se tocó código del producto.

## Pruebas

- Directorio: raíz del repositorio. Los dos comandos de los criterios (`node -e …`) comprueban que el documento tiene las seis secciones y que cada una trae «Fuente» y «Decisión:»: ambos salen con código 0.
- Suite: `npx vitest run` → ver cierre; `valmen secrets` sin hallazgos.
<!-- verify: manual -->

- Resultado del PO: ««el la decision si seria la A» … «la A su con lo de los tickets no elegibles si sigue» — Juan Andrade, 2026-10-07: la corrida delegada lleva los tickets SECURITY y DOCS de las tres features nuevas, en orden de dependencias, deteniéndose en cada plan SECURITY para su aprobación» — delegación DEL-20261007-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:c6acb069cee5919fb69146703648ad434fa2e9a2",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "««el la decision si seria la A» … «la A su con lo de los tickets no elegibles si sigue» — Juan Andrade, 2026-10-07: la corrida delegada lleva los tickets SECURITY y DOCS de las tres features nuevas, en orden de dependencias, deteniéndose en cada plan SECURITY para su aprobación» — delegación DEL-20261007-001 del PO Juan Andrade"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run",
    "reference": "worktree:sha256:8ad4667bd826bbfc67e3a8572417f24eac452d8ff64b07567dfd89a89e163c34",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "««el la decision si seria la A» … «la A su con lo de los tickets no elegibles si sigue» — Juan Andrade, 2026-10-07: la corrida delegada lleva los tickets SECURITY y DOCS de las tres features nuevas, en orden de dependencias, deteniéndose en cada plan SECURITY para su aprobación» — delegación DEL-20261007-001 del PO Juan Andrade"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "Documento de evaluación de seis skills de terceros con fuente y decisión.",
    "functional_summary": "El PO tiene por escrito por qué se prueba, se descarta o no se puede verificar cada skill.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets de la delegación; sin números por ticket para no repartir a ojo un costo que no se midió por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code por delegación DEL-20261007-001",
    "confidence": "medium",
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
    "date": "2026-10-07",
    "at": "2026-10-07T18:03:50.406Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-07",
    "at": "2026-10-07T18:19:09.882Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-07",
    "at": "2026-10-07T18:20:05.750Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:02.093Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"«el la decision si seria la A» … «la A su con lo de los tickets no elegibles si sigue» — Juan Andrade, 2026-10-07: la corrida delegada lleva los tickets SECURITY y DOCS de las tres features nuevas, en orden de dependencias, deteniéndose en cada plan SECURITY para su aprobación\",\"planHash\":\"sha256:2af48d6b53d8ae917933e4fc579ec1678d83f847dcd57da0c0c9e717e027670d\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:02.264Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:2af48d6b53d8ae917933e4fc579ec1678d83f847dcd57da0c0c9e717e027670d."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:02.264Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:02.375Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:10.472Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:10.577Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:10.706Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:10.807Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:10.904Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.002Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.121Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.261Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.355Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.452Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.547Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.642Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.742Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.850Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-07",
    "at": "2026-10-07T18:21:11.961Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
