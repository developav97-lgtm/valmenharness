---
schema_version: 2
id: CHORE-ENGINE-SALIDA-COMPUERTAS-CONTROL-20261005
title: Medir la salida de S1 a S3 con ambos registros y dejarla en verify.md
type: CHORE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# CHORE-ENGINE-SALIDA-COMPUERTAS-CONTROL-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CPRE-011: El harness DEBE medir la precisión de las compuertas de forma continua
Depende de: BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005, FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926, BUGFIX-ENGINE-REUTILIZAR-COMPUERTA-20261005, IMPROVEMENT-CORE-PLANTILLA-Y-MATERIALIZACION-20261005, FEATURE-ENGINE-REVISION-PREVIA-20261005, FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005, SECURITY-CORE-TRANSICION-APPROVED-20261005, SECURITY-ENGINE-APROBACION-DESPLIEGUE-20261005, SECURITY-MC-ESCRITURAS-AUTENTICADAS-20261005, BUGFIX-ENGINE-CIERRE-CRITERIOS-20261005, BUGFIX-ENGINE-CONSUMO-FIABLE-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: medir la salida de los sprints S1 a S3 con ambos registros históricos —el de este repositorio y el de SaiOpenCloud— y dejarla en la evidencia de cierre de la feature (R-CPRE-011): que el código nuevo sigue leyendo y validando los dos registros, y qué tasa de banda, revisiones aprobadas sin cambios y bloqueos por tipo y por evaluador dan hoy. Fuera de alcance: cambiar umbrales (los decide una persona) y escribir en el registro de SaiOpenCloud: se lee, no se toca.
- Usuario o rol afectado: el responsable que decide si las compuertas están listas para soportar las jornadas (S5) y el QA por agente (S6).
- Comportamiento actual: las métricas existen (`valmen precision`) y la validación también (`valmen validate --all`), pero nadie las corre juntas contra los dos registros ni deja el resultado donde se audite; `verify.md` se genera solo desde los tickets y no admite evidencia adicional.
- Comportamiento esperado: un script mide un registro (validación y precisión por compuerta y evaluador) y devuelve un informe en Markdown, y si el registro no valida lo dice en un mensaje explícito y falla; el resultado de ambos registros queda en `salida-s1-s3.md` dentro de la feature; y `verify.md` incluye como anexos los archivos `salida-*.md` de la feature.

## Diagnóstico

- Archivos y flujo investigados: el informe de precisión lo calcula `precisionCommand` en `packages/cli/src/commands.ts` sobre los recibos del registro, y la validación es `valmen validate --all`; `renderFeatureVerify` y `writeFeatureVerify` en `packages/engine/src/feature-verify.ts` arman `verify.md` solo desde el estado de cada ticket y no lo pisan sin `--rewrite`; la feature `autonomia-confiable` vive en `.valmen/features/autonomia-confiable/`. Medición previa hecha para este diagnóstico: el registro de este repositorio valida con 134 tickets y el de SaiOpenCloud con 136, y `valmen precision` responde sobre los dos.
- Causa raíz o hipótesis: la salida de un sprint se declaraba de palabra; faltaba un procedimiento repetible que pase por los dos registros y un lugar donde quede escrito. Comprobado: `renderFeatureVerify` no recibe más datos que los estados de los tickets. La medición es de solo lectura sobre ambos registros, de modo que no modifica el de SaiOpenCloud.
- Riesgos y compatibilidad: el segundo registro está en otra ruta de esta máquina (`/Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud`), así que el script recibe las raíces por argumento y las pruebas usan un ejecutor simulado; los números del informe son de un momento y se fechan. Las revisiones decididas por la delegación no cuentan como decisiones de una persona (ya lo separa `valmen precision`). Los consumidores de `writeFeatureVerify`, comprobados con búsqueda, son el comando `valmen feature verify` (`packages/cli/src/features.ts:196`), la herramienta MCP de la feature (`packages/mcp/src/tools.ts:3015`) y `tests/feature-verify.test.ts`; `renderFeatureVerify` solo lo llama `writeFeatureVerify`. Ninguno pasa anexos hoy, así que ninguno resulta afectado. Agregar anexos a `verify.md` es aditivo: sin archivos `salida-*.md` el texto no cambia.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el script de medición, su informe para ambos registros, los anexos de `verify.md` y las pruebas. Exclusiones: cambiar umbrales y escribir en el registro de SaiOpenCloud.
- Pasos ordenados:
  1. Crear `scripts/medir-salida-s1-s3.mjs` que, para cada `--root`, corre `valmen validate --all` y `valmen precision`, y devuelve un informe en Markdown con los tickets válidos y la precisión por compuerta y evaluador; exporta `medirRegistro(root, ejecutar)` con el ejecutor inyectable y, si algún registro no valida, imprime en el informe un mensaje explícito con la raíz que falló y la salida de la validación, y sale con código 3.
  2. Agregar `scripts/medir-salida-s1-s3.d.mts` con los tipos y crear `tests/medicion-salida.test.ts`: informe con ejecutor simulado, fallo con el mensaje explícito si el registro no valida, una corrida real sobre el registro de este repositorio y la comprobación de que el informe de la feature existe y trae ambos registros.
  3. En `packages/engine/src/feature-verify.ts` hacer que `renderFeatureVerify` reciba los anexos y que `writeFeatureVerify` lea los `salida-*.md` de la carpeta de la feature y los agregue al final bajo «Anexos»; probarlo en `tests/medicion-salida.test.ts`.
  4. Correr el script contra los dos registros reales, escribir `.valmen/features/autonomia-confiable/salida-s1-s3.md` con la fecha, los números y una lectura de qué cumple cada sprint, y comprobar con `npx vitest run tests/medicion-salida.test.ts`, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket y borrar `salida-s1-s3.md`; el cambio de `verify.md` es aditivo y sin anexos no altera el texto.

## Criterios de aceptación

- [x] El script mide un registro: tickets válidos y precisión por compuerta y evaluador, en Markdown
      <!-- test: npx vitest run tests/medicion-salida.test.ts -->
- [x] Si un registro no valida, el script sale con código 3 y lo dice
      <!-- test: npx vitest run tests/medicion-salida.test.ts -->
- [x] El registro de este repositorio y el de SaiOpenCloud validan con el código nuevo y el informe de la feature trae ambos
      <!-- test: npx vitest run tests/medicion-salida.test.ts -->
- [x] `verify.md` incluye como anexos los archivos `salida-*.md` de la feature y sin ellos no cambia
      <!-- test: npx vitest run tests/medicion-salida.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de CHORE-ENGINE-SALIDA-COMPUERTAS-CONTROL-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "scripts/medir-salida-s1-s3.mjs",
      "scripts/medir-salida-s1-s3.d.mts",
      "packages/engine/src/feature-verify.ts",
      ".valmen/features/autonomia-confiable/salida-s1-s3.md",
      "tests/medicion-salida.test.ts",
      "tests/feature-verify.test.ts"
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

- `scripts/medir-salida-s1-s3.mjs` (nuevo) y su `.d.mts`: `medirRegistro` y `medirSalida` corren `valmen validate --all` y `valmen precision` por cada `--root` (solo lectura) y arman un informe en Markdown; si un registro no valida, el informe lo dice con la raíz y la salida, y el script sale con código 3. Ejecutor inyectable.
- `packages/engine/src/feature-verify.ts`: `renderFeatureVerify` recibe anexos opcionales y `anexosDeLaFeature` lee los `salida-*.md` de la carpeta de la feature; `writeFeatureVerify` los agrega bajo «Anexos». Sin anexos el texto no cambia.
- `.valmen/features/autonomia-confiable/salida-s1-s3.md` (nuevo): la medición real de ambos registros —este repositorio (134 tickets válidos) y SaiOpenCloud (136, leído sin escribirlo)— con una lectura de los números.
- `tests/medicion-salida.test.ts` (nuevo, 6 pruebas) y un caso nuevo en `tests/feature-verify.test.ts`.

## Pruebas

Desde la raíz del repositorio, Node 24:

1. `npx vitest run tests/medicion-salida.test.ts tests/feature-verify.test.ts` — esperado: 16 pruebas pasan.
2. `node scripts/medir-salida-s1-s3.mjs --root . --root /Users/juanandrade/Desktop/ValMenTech/10-Proyectos/SaiOpenCloud` — esperado: código de salida 0 y «Validación: correcta» en los dos registros.
3. `npx vitest run` — esperado: 173 archivos pasan y 1 omitido; 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2525 pasan), tsc sin errores, medición de ambos registros

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:645fd4ae1e42fbe6e04c36b5c7f6c7a9228cc5fc",
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
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
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
    "description": "npx vitest run (2525 pasan), tsc sin errores, medición de ambos registros",
    "reference": "worktree:sha256:44024bd4dc69210c70f4359460144003682d3684685a5f59367a49299325ab5e",
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
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
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
    "technical_summary": "Script de medición de solo lectura, anexos de verify.md y el informe real de los dos registros históricos.",
    "functional_summary": "Queda escrito, y se puede repetir, que el código de S1 a S3 valida los dos registros y cómo se comportan las compuertas.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguno"
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
    "source": "manual:sesión de Claude Code por delegación DEL-20261006-001",
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:50.200Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:15:45.325Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:16:40.193Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:17:44.517Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:14406c9747c4fa2856dedaefc8cbacb930e55d4effa3cd36e1d886a9d89fc54f\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:17:44.660Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:14406c9747c4fa2856dedaefc8cbacb930e55d4effa3cd36e1d886a9d89fc54f."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:17:44.660Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:17:44.765Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.271Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.363Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.449Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.534Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.616Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.699Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:39.856Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.046Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.126Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.207Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.292Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.374Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.454Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.536Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:19:40.619Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
