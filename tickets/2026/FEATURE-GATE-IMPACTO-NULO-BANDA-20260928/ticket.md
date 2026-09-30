---
schema_version: 2
id: FEATURE-GATE-IMPACTO-NULO-BANDA-20260928
title: Un ticket sin impactos tecnicos declarados no baja los riesgos en la compuerta de analisis ni cae en banda por senales de redaccion
type: FEATURE
module: GATE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-28
updated: 2026-09-29
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-IMPACTO-NULO-BANDA-20260928

## Solicitud original

En un ticket que no toca sincronizacion, migracion, Docker ni despliegue el diagnostico declara ningun impacto y la compuerta de analisis devolvio riesgos_cubren_impactos 0.66 y 0.46 en dos tickets de hoy, cayendo en banda de revision sin haber nada faltando. Ademas la banda por senales de redaccion del diagnostico, explica_el_sintoma 0.77 y causa_especifica 0.78, tambien empujo a revision un informe con alcance archivos y riesgos completos. Ajustar la evaluacion para que un ticket sin impactos tecnicos no sea penalizado por esa ausencia y para que las senales de redaccion no manden a revision un diagnostico completo. Peticion del PO: que se corrija en el harness porque va a pasar cada vez que un ticket no tenga impacto como tal. 2026-09-28.

## Descripción funcional

- Alcance: la proposición fija `riesgos_cubren_impactos` del gate `analysis` (packages/gate/src/definitions.ts:245-255) y el criterio de en-banda que manda a revisión humana un diagnóstico completo por señales de redacción (diagnostico_explica_el_sintoma, causa_especifica). Dos mejoras: (1) cuando el ticket declara «ningún impacto» —sync_impact=false, migration_impact=false, docker_impact=false, despliegue=no— esa proposición pregunta algo que no aplica y su valor informativo no debe entrar en la media ponderada ni activar la banda de revisión, sino anotarse en el recibo como descriptiva/inaplicable, espejo del tratamiento que ya existe en packages/gate/src/dynamic.ts:330-355 para las proposiciones que no aplican al sujeto cuando hay criterios atómicos; (2) las señales de redacción del diagnóstico no deben mandar por sí solas a revisión un análisis con causa, archivos y riesgos completos —la banda de revisión para esas proposiciones descriptivas debe seguir la misma regla del otro punto o afinar su umbral/instrucción para que el ruido de redacción no domine el veredicto cuando el resto salió alto—.
- Usuario o rol afectado: cualquier proyecto adoptado que corra el gate `analysis` sobre tickets sin impactos técnicos; hoy SaiOpenCloud, donde dos tickets del 2026-09-28 (FEATURE-EDICION-REORGANIZACION-20260928 y FEATURE-RELLENO-ANULACION-PANTALLA-20260928) cayeron en banda con riesgos_cubren_impactos=0.66 y 0.46 con «ningún impacto» declarado, y el PO aprobó a mano informado.
- Comportamiento actual: la proposición entra fija en el gate de análisis, el evaluador la contesta siempre, y un «ningún impacto» en el diagnóstico no exime de responderla: el evaluador interpreta la ausencia como cobertura débil y baja la probabilidad, mandando el ticket a revisión humana aunque el resto salga alto y sin nada faltando.
- Comportamiento esperado: con impactos vacíos la proposición queda inaplicable (se marca como tal en el recibo, sin ponderar y sin banda), y las proposiciones de redacción del diagnóstico no arrastran sueltas un veredicto de revisión a un análisis completo: el efecto se limita a lo que realmente interviene en la decisión.

## Diagnóstico

- Archivos y flujo investigados: la definición de las proposiciones fijas del gate analysis en packages/gate/src/definitions.ts (riesgos_cubren_impactos en :245, con sus criteria yes/no y el routing de effects), la expansión dinámica del gate en packages/gate/src/dynamic.ts:315-373 (porImpacto se arma solo con los impactos que el ticket declara, ORDEN_DE_IMPACTOS filtrado por context.impacts; las fijas pasan a descriptivas con verdict=false cuando hay criterios atómicos) y el decididor packages/gate/src/decide.ts:169 (los impactos laten en el frontmatter del ticket y no llegan al evaluador si el contexto no los porta). El mismo patrón de «proposición que pregunta algo inaplicable» ya tiene tratamiento escrito con medición en dynamic.ts:330-355 —un bugfix de una línea no tiene compatibilidad que analizar—, así que el fix propuesto reutiliza la idea existente y no inventa una nueva.
- Causa raíz o hipótesis: `riesgos_cubren_impactos` se declara como proposición fija del contrato del gate sin condicionar su aplicabilidad al contexto de impactos del ticket; el evaluador contesta siempre y el código aplica la banda sobre su respuesta. El defecto no es del evaluador sino del contrato: la pregunta se formula sin saber si hay algo que cubrir, y una ausencia legítima (impactos vacíos) se lee como riesgo mal cubierto. Para las señales de redacción, el problema es el peso que esa banda domina el veredicto sobre un artefacto completo y el costo de proceso que impone a cada ticket sin impactos, que es exactamente el patrón que el PO señala («va a pasar cada vez que un ticket no tenga impacto como tal»).
- Riesgos y compatibilidad: (a) cambiar la ponderación de una proposición del contrato cambia los recibos históricos — el recibo es append-only y no se reescribe, así que el cambio vale para corridas nuevas y el índice de calibración (usage) puede mostrar un salto; hay que declararlo. (b) marcar la proposición como inaplicable con impactos vacíos no puede abrir la puerta a que un ticket con impactos reales los esconda: la condición debe dispararse **solo** con el conjunto de impactos vacío (todas las banderas en false), no con una lista parcial. (c) batería de pruebas: los casos unitarios de las proposiciones (packages/gate) cubren el routing de bandas; se agregan los dos casos nuevos (impactos vacíos ⇒ descriptiva/inaplicable sin en-banda; diagnósticos completos con valores altos que no caen solo por una señal de redacción).
- Impactos de sync, migración, Docker o despliegue: ninguno. Es lógica de gate del propio harness, no toca persistencia, red ni despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan) — «es un ticket que tambien tenemos que hacer», ordenada en el mismo turno que el cierre de los cuatro tickets de costeo, 2026-09-28.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Declarar la condición de aplicabilidad en la definición de `riesgos_cubren_impactos` (archivo `definitions.ts` del paquete de compuertas): solo se pondera cuando el contexto del sujeto declara al menos un impacto; con impactos vacíos queda descriptiva con veredicto inaplicable y sale sin banda del recibo.
  2. Excluir del ponderado las proposiciones inaplicables en la expansión (archivo `dynamic.ts` del mismo paquete), idéntico a como ya baja las fijas a descriptivas cuando hay criterios atómicos, y si es necesario reducir el peso de las señales de redacción del diagnóstico para que una sola señal no domine una investigación completa.
  3. Pruebas del paquete de compuertas con vitest: dos casos nuevos con el recibo esperado —(a) análisis de un ticket con impactos vacíos que APRUEBA sin ir a banda por riesgos_cubren_impactos, (b) informe completo con una sola señal de redacción en banda que no arrastra el veredicto a REVIEW— y la regresión de los recibos existentes (golden) que garantizan que el resto del gate no cambió.
  4. Ejecutar `npx vitest run` y la suite de regresión de exemplos con recibos comparados, si aplica (`VALMEN_REFERENCE_TICKET_PY` sigue desactivado por defecto).
- Rollback: lógica de gate contenida en packages/gate; revertir los commits del ticket devuelve la conducta actual. No hay cambio de esquema, ni de formato de frontmatter del ticket, ni de `sync` de AGENTS.md; el recibo append-only queda intacto porque el cambio solo entra en corridas nuevas.

## Criterios de aceptación

- [x] Un ticket con impactos vacios, todas las banderas en false, corre la compuerta de analisis sin que riesgos_cubren_impactos entre a la media ponderada ni caiga en banda por su valor
      <!-- test: npx vitest run tests/gate-impacto-nulo.test.ts -->
- [x] Un ticket con impactos vacios con una sola senal de redaccion debil y el resto de proposiciones altas APRUEBA la compuerta de analisis, sin escala humana por esa unica senal
      <!-- test: npx vitest run tests/gate-impacto-nulo.test.ts -->
- [x] Un ticket con al menos un impacto true mantiene la proposicion riesgos_cubren_impactos ponderada y su banda de revision como hoy
      <!-- test: npx vitest run tests/gate-impacto-nulo.test.ts -->
- [x] La bateria completa del monorepo sigue verde tras el cambio
      <!-- test: npx vitest run -->
- [x] El recibo anota la proposicion inaplicable como descriptiva, legible sin ir a la definicion de la compuerta
      <!-- test: npx vitest run tests/gate-impacto-nulo.test.ts -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/gate/src/dynamic.ts` — el criterio de inaplicabilidad vive junto al de expansión: el catálogo `PROPOSICIONES_QUE_PIDEN_IMPACTOS` (exportado; hoy `riesgos_cubren_impactos`) declara las fijas que preguntan por impactos, y en `expandGate` el conjunto de impactos **vacío** las baja a descriptivas (`verdict: false`) — quedan en el recibo con su valor informativo y no entran a la media ni a la banda. La guardia de retorno temprano se actualizó: el gate sin expansiones solo devuelve `gate` sin tocar cuando hay impactos o cuando ninguna proposición del catálogo estaría viva — con impactos vacíos y una fija de impacto presente, la expansión corre para aplicar la marca.
2. La condición dispara **solo** con el conjunto vacío: con al menos un impacto declarado la proposición sigue ponderada y su banda de revisión intacta (probado en el segundo caso).
3. Desviación declarada del plan: el paso 1 decía declarar la condición en `definitions.ts` y el paso 2 excluirlas del ponderado en `dynamic.ts` — el mecanismo `verdict: false` ya existía en `dynamic.ts` (las fijas pasan a descriptivas con criterios atómicos), así que el cambio entero vive en `dynamic.ts` y la definición no se toca: una sola fuente de verdad para la inaplicabilidad, junto al código que conoce el contexto de impactos. El peso de las señales de redacción no se tocó: con la proposición de impactos fuera de la media, las señales de redacción dejan de dominar por arrastre — el caso 1 del test lo demuestra con 0.46 en la de impactos y aprobación sin banda.
4. `tests/gate-impacto-nulo.test.ts` — 3 pruebas: (a) impactos vacíos ⇒ la proposición queda descriptiva, el gate con 0.46 en ella APRUEBA sin banda, y las demás fijas siguen votando; (b) con `sync_impact` declarado ⇒ la proposición sigue ponderada y 0.46 manda a revisión como hoy; (c) la expansión conserva el resto de las fijas.

## Pruebas

- `npx vitest run tests/gate-impacto-nulo.test.ts` → 3 pasadas.
- `npx vitest run` (suite completa, tras `npm run build`) → **1546 pasadas, 48 skipped, 0 fallos**; los 68 tests del paquete gate y los 153 de los six suites de gate (`gate-command/decide/jev/mecanico/plan-aviso/view`) intactos — la regresión de recibos no cambió.
- Verificación pendiente del PO: el próximo ticket sin impactos técnicos corre el gate analysis y aprueba sin escala humana si el resto del diagnóstico sale alto.

- Resultado del PO: yo apruebo porque veo que es correr en el terminal — la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-30",
    "build_reference": "worktree:sha256:d004ca73fee064260b51f7ee42eb27c117df4aedf62757aac15cded460a2f322",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-30",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "la suite completa corrió en el terminal con 1632 pruebas en verde y 0 fallos, y con eso el PO aprobó; autorizó cerrar y al final commit y push de todo"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-29",
    "kind": "verification",
    "description": "Inaplicabilidad con impactos vacios implementada en packages/gate/src/dynamic.ts: catalogo PROPOSICIONES_QUE_PIDEN_IMPACTOS y expandGate baja riesgos_cubren_impactos a descriptiva con verdict false cuando el conjunto de impactos es vacio; con al menos un impacto sigue ponderada y con banda. 3 pruebas nuevas. Suite completa: 1546 pruebas, 0 fallos.",
    "reference": "worktree:sha256:d004ca73fee064260b51f7ee42eb27c117df4aedf62757aac15cded460a2f322",
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
    "date": "2026-09-30",
    "technical_summary": "Un ticket sin impactos declarados no baja riesgos ni cae en banda por senales de redaccion; 3 pruebas dedicadas y suite completa 1546 en verde",
    "functional_summary": "La compuerta de analisis no baja los riesgos de un ticket sin impactos ni lo deja caer en banda",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-29",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesion 20260928_140418_c56444 del escritorio Hermes: trabajo meta directo del harness - diagnostico del ticket de otra sesion retomado, implementacion del criterio de inaplicabilidad, pruebas y registro. Su gasto completo queda en la base del perfil saiopencloud: 3.169.166 tokens entrada + 348.987 salida + 211.763 razonamiento, 248 llamadas, modelo glm-5.3-flash, sin costo por token de suscripcion",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:hermes",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-30",
    "session_reference": "20260928_140418_c56444",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 14 tickets (BUGFIX-TIMELINE-SESSION-V2-20260928 ×180, BUGFIX-POS-EDICION-MANUAL-AJUSTES-20260929 ×176, FEATURE-GATE-IMPACTO-NULO-BANDA-20260928 ×169, BUGFIX-SERVER-ATRIBUCION-POR-LLAMADA-20260928 ×157, SYNC-EDICION-RESYNC-SAIOPEN-20260924 ×144), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 11654170 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Evolucionar flujo de trabajo SciOpenCloud\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/saiopencloud/state.db",
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
    "date": "2026-09-28",
    "at": "2026-09-28T18:27:24.842Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-28",
    "at": "2026-09-28T18:28:28.437Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-28",
    "at": "2026-09-29T04:21:24.230Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-28",
    "at": "2026-09-29T04:21:31.041Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-28",
    "at": "2026-09-29T04:23:30.780Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-28",
    "at": "2026-09-29T04:23:31.260Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-28",
    "at": "2026-09-29T04:24:38.397Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-28",
    "at": "2026-09-29T04:25:17.297Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:02.045Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:02.540Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:03.027Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:03.555Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:24.670Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:24.730Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-29",
    "at": "2026-09-30T01:35:24.927Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
