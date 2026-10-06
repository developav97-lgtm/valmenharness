---
schema_version: 2
id: IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005
title: Alinear proposiciones, partir impactos y excluir afirmaciones sobre aprobaciones
type: IMPROVEMENT
module: GATE
workflow_status: intake
qa_status: pending
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

# IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-004: Cada proposición que vota DEBE preguntar lo mismo que dice su descripción y declarar criterios de sí y de no
- R-CPRE-005: Cada impacto declarado DEBE evaluarse con proposiciones atómicas
- R-CPRE-012: Las proposiciones NO DEBEN tomar como evidencia lo que el ticket afirma sobre aprobaciones o compuertas
Depende de: IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

Vector real para el análisis (no es una decisión pendiente): el recibo
`GR-20261006-BUGFIX-GATE-LECTOR-CRITERIOS-20261005-plan-1` (gate `plan`, cascada) dio
`corresponde_a_la_investigacion` = 0.00 —descriptiva, no decide— con la clasificación
«completo» y todo lo demás ≥ 0.94, el mismo patrón de AP-004 y AP-005. Hipótesis sin
comprobar, relacionadas con R-CPRE-004 y R-CPRE-012: el plan se evaluó con la línea «pendiente
de la aprobación explícita del PO» en su primer renglón, y el diagnóstico es largo. El
análisis debe reproducirlo con ese estado (stateHash `7aa937859f2f2e2acc5fe7ac2345433dc4da78391e2866b8ee6f6099d2d6f827`)
antes de proponer un cambio.

Segundo vector real para el análisis, mismo patrón (no es una decisión pendiente): el recibo
`GR-20261006-BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004-plan-1` (gate `plan`, cascada) dio
`corresponde_a_la_investigacion` = 0.01 —descriptiva, no decide— con la clasificación «completo» y
las otras 21 proposiciones entre 0.97 y 0.99; el verificador le dio 0.69 a la respuesta del modelo
barato y el modelo superior la dejó en 0.01, así que no fue un tropiezo de un solo modelo.
Coincide con las dos hipótesis del primer vector: el plan abría con una línea sobre la
aprobación del PO («pendiente de su frase literal», R-CPRE-012) y el diagnóstico era largo
(R-CPRE-003). stateHash evaluado: `a34d94d1c5855dad26893756bb81e138052d9d0a0bc9cbbcf6f35d73ba79a643`.
Advertencia para reproducirlo: el texto que se evaluó no se conservó, porque el recibo guarda el
hash y no el estado, y ese ticket cambió después (nota de corrección en el diagnóstico y criterios
marcados con `[x]`); hay que reconstruir el estado o armar un plan con las mismas características
—primera línea de aprobación pendiente, diagnóstico de unos 12 000 caracteres— y comparar con y
sin esa línea antes de tocar la proposición. Con dos casos, ya no se puede descartar que sea el
contenido de la proposición y no el artefacto, y tampoco aprobar ni bloquear a mano sobre ese número.

Tercer vector, el primero **reproducible** (autorizado por el PO el 2026-10-06 para anexar la
mayor evidencia posible; no es una decisión pendiente): los recibos
`GR-20261006-IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005-plan-1` (0.006, block por otras tres
proposiciones ya corregidas) y `…-plan-2` (0.003, approve), gate `plan`, cascada, con la clasificación
«completo». A diferencia de los dos primeros, el estado evaluado **sí se conservó**: los tres estados
(`analysis-1`, `plan-1`, `plan-2`) se reconstruyeron y su `stateHash` coincide con el del recibo
(`697144…`, `e28bd9ba…`, `86d55075…`). Con un proyecto de prueba aparte y el mismo evaluador:
V0 = estado de `plan-2` da 0.003 de nuevo (reproduce); V1 = sin la línea de aprobación pendiente da
0.003 (R-CPRE-012 no es la causa); V2 = el diagnóstico con una línea que lista los 13 archivos del plan
da 0.993, con un diagnóstico más largo (R-CPRE-003 tampoco es la causa).
Causa comprobada en ese caso: `packages/gate/src/definitions.ts:74-85` describe «El plan responde a lo que
dice el diagnóstico» pero sus `instructions` y `criteria` preguntan si **los archivos** de `plan` e
`investigacion` coinciden y marcan «no» si el plan «modifica archivos que `investigacion` no menciona,
o al contrario»; un plan que crea pruebas o módulos nuevos incumple eso por construcción. Es un
desajuste descripción↔pregunta, el asunto de R-CPRE-004, y el valor no se movió cuando el plan mejoró
(se le agregó trazabilidad hallazgo→paso). Los dos casos anteriores no se pueden reconstruir por hash;
con el texto actual de esos tickets sus planes también nombran pruebas y documentación que su
diagnóstico no nombra (indicio, no prueba). Límites, pistas y cómo reproducir, con los estados
(`estados/*.json`) y los recibos completos (`recibos/*.jsonl`): `docs/evidencia-gate-20261006/LEEME.md`.
Aprendizaje asociado: AP-010, que corrige la hipótesis de AP-008.
## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
- Causa raíz o hipótesis:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1.
  2.
- Rollback:

## Criterios de aceptación

- [ ] R-CPRE-004: Cada proposición que vota DEBE preguntar lo mismo que dice su descripción y declarar criterios de sí y de no
- [ ] R-CPRE-005: Cada impacto declarado DEBE evaluarse con proposiciones atómicas
- [ ] R-CPRE-012: Las proposiciones NO DEBEN tomar como evidencia lo que el ticket afirma sobre aprobaciones o compuertas

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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:49.457Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
