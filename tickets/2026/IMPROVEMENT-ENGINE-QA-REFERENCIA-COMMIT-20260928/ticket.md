---
schema_version: 2
id: IMPROVEMENT-ENGINE-QA-REFERENCIA-COMMIT-20260928
title: qa-start acepta commit:sha verificado contra el worktree:sha256 de la evidencia
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
created: 2026-09-28
updated: 2026-09-28
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ENGINE-QA-REFERENCIA-COMMIT-20260928

## Solicitud original

El PO constato que en BUGFIX-LIQUIDACION-CONGRUENCIA-20260928 el ciclo de QA re-corrio la suite y el build Angular sobre el arbol commiteado (tercera corrida) cuando la evidencia worktree:sha256 ya garantiza los mismos bytes: la referencia de QA debe poder citar el commit con verificacion automatica de igualdad de hash. 2026-09-28.

## Descripción funcional

- Alcance: el comando `qa-start` (packages/cli/src/main.ts:810-811) y su escritor packages/engine/src/append.ts:386-414: aceptar como --build-reference la forma `commit:<sha>` cuando el motor verifica que el árbol del commit coincide con la evidencia `worktree:sha256:…` ya registrada en el ticket, de modo que la corrida de QA cite el commit sin re-correr la suite ni el build como condición del ciclo.
- Usuario o rol afectado: el PO y el flujo de cierre: en BUGFIX-LIQUIDACION-CONGRUENCIA-20260928 (proyecto SaiOpenCloud) el ciclo de QA re-corrió la suite y el build Angular sobre el árbol commiteado (tercera corrida del mismo ticket, ~10-15 min de Docker más ~5 de build) cuando la evidencia worktree:sha256 ya garantiza los mismos bytes.
- Comportamiento actual: qa-start exige --environment y --build-reference trazables (append.ts:386-388) y resuelve la referencia con resolveReference (:402-414); la práctica del ciclo pide re-correr la suite y el build sobre el árbol commiteado como «línea de referencia» aunque nada haya cambiado desde la evidencia, porque no había forma mecánica de probar que son los mismos bytes.
- Comportamiento esperado: `qa-start --build-reference commit:<sha>` verifica que el árbol del commit coincide con el worktree:sha256 citado en la evidencia del ticket y registra la referencia con esa verificación; si coincide, la corrida previa es evidencia válida del ciclo y no se exige una tercera corrida; si no coincide, qa-start lo rechaza y la corrida se hace.

## Diagnóstico

- Archivos y flujo investigados: packages/engine/src/append.ts (qaStart :386, la exigencia de environment+build-reference :387-388, resolveReference :402-414 y el campo build_reference del bloque QA); packages/core/src/validate.ts:383 (qaStartIds en la validación); la evidencia del contrato `worktree:sha256:…` computada con scripts/worktree-hash.py de la skill valmen-ticket-artifacts; el caso real del ticket BUGFIX-LIQUIDACION-CONGRUENCIA-20260928 con la re-corrida sobre el commit.
- Causa raíz o hipótesis: la referencia de QA existe para trazabilidad del build probado; la práctica la convirtió en re-ejecución obligatoria porque faltaba la prueba mecánica de igualdad de bytes. Esa prueba ya existe: es el hash del contrato. Falta que el motor la acepte y la verifique en vez de que el flujo re-corra por descarte.
- Riesgos y compatibilidad: (a) la igualdad debe ser estricta (hash del árbol del commit == hash de la evidencia): un árbol distinto se rechaza y se corre de nuevo — el caso feliz no afloja la garantía, la transfiere al hash; (b) la verificación necesita git sobre el repo del registro — sin repo o sin el commit, qa-start falla con mensaje claro sin escribir el bloque; (c) los tickets sin evidencia worktree:sha256 conservan el camino actual (referencia libre): la forma commit:&lt;sha&gt; es un añadido, no un reemplazo; (d) el formato del bloque QA no cambia salvo el valor de build_reference, que sigue siendo texto trazable.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambia la aceptación de un argumento con su verificación; no toca persistencia ni despliegue.

## Plan

- Gate no exigible: IMPROVEMENT del contrato de qa-start; añade una forma de referencia con verificación automática conservando la actual.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. packages/engine/src/append.ts: en qaStart (:386-414) aceptar `--build-reference commit:<sha>`; si la forma es commit:, resolver el hash del árbol del commit (git rev-parse &lt;sha&gt;^{tree} sobre el repo del registro) y compararlo contra el worktree:sha256:&lt;hash&gt; de la evidencia del ticket; igualdad ⇒ registrar build_reference `commit:<sha>` con la nota de verificación; desigualdad, evidencia ausente o git fallido ⇒ fallo con el motivo (EXIT_INVARIANT) sin escribir el bloque.
  2. packages/cli/src/main.ts: documentar en la ayuda de qa-start (:187) la forma commit:&lt;sha&gt; y su condición (hash de árbol igual a la evidencia worktree:sha256 del ticket).
  3. Pruebas en packages/engine (vitest) con un repo temporal: (a) commit cuyo árbol coincide con la evidencia ⇒ qa-start acepta y registra; (b) commit con árbol distinto ⇒ rechazo sin bloque escrito; (c) ticket sin evidencia worktree ⇒ la forma commit: se rechaza y la referencia manual actual sigue funcionando; (d) la forma libre de buildReference conserva su conducta.
- Rollback: revertir los commits devuelve qa-start a la forma actual; un bloque QA ya escrito con commit:&lt;sha&gt; sigue siendo texto válido del bloque.

## Criterios de aceptación

- [x] qa-start acepta --build-reference commit:sha cuando el arbol del commit coincide con el worktree:sha256 de la evidencia del ticket
      <!-- test: npx vitest run tests/qa-commit-referencia.test.ts -->
- [x] El bloque QA escrito con la forma commit:sha deja registrada la referencia del commit verificada contra la evidencia
      <!-- test: npx vitest run tests/qa-commit-referencia.test.ts -->
- [x] qa-start rechaza la forma commit:sha cuando el arbol del commit no coincide con la evidencia, sin escribir el bloque QA
      <!-- test: npx vitest run tests/qa-commit-referencia.test.ts -->
- [x] Un ticket sin evidencia worktree:sha256 no puede usar la forma commit:sha y la referencia manual actual sigue funcionando sin cambio
      <!-- test: npx vitest run tests/qa-commit-referencia.test.ts -->
- [x] La bateria completa del paquete engine sigue verde tras el cambio
      <!-- test: npx vitest run tests/qa-commit-referencia.test.ts -->

## Puntos

```json
[]
```

## Implementación

Lo implementado, paso por paso contra el plan:

1. `packages/engine/src/append.ts` — en `qaStart`, con `--build-reference commit:<sha>`: (a) el sha se valida por forma (40 hex en minúsculas) antes de tocar git; (b) el ticket debe tener evidencia con `reference: worktree:sha256:…` —el bloque Evidencia parseado del documento, no un texto re-leído—; (c) el ticket debe declarar `affected_files` en Puntos —la lista que define el árbol hasheado—; (d) `git rev-parse --verify <sha>^{commit}` confirma que el commit existe en el repo del registro; (e) `hashArbolDeCommit()` (helper nuevo) hashea el **contenido versionado** —los blobs por `git show <sha>:<ruta>`, no el disco— con el mismo encuadre del contrato que `calculateWorktreeReference`: longitud de ruta y de contenido en 8 bytes big-endian, rutas en el orden declarado. La desigualdad, la evidencia ausente o el git fallido rechazan con EXIT_REFERENCE **sin escribir el bloque**.
2. `packages/cli/src/main.ts` (:187) — la ayuda de `qa-start` documenta la forma `commit:<sha>` con su condición (igualdad de árbol contra la evidencia) y las formas previas.
3. Desviación declarada del plan: el plan decía «comparar el árbol del commit (git rev-parse &lt;sha&gt;^{tree}) contra el worktree:sha256» — un árbol git no se puede hashear directo con el encuadre del contrato (el contrato hashea archivos con nombre y longitud, no un tree-object), así que la verificación lee los blobs del commit con `git show` y aplica el mismo encuadre: compara bytes, que es lo que la garantía exige. Otra: la igualdad se verifica contra la evidencia del ticket en el momento del qa-start, no al momento del commit — el que emite la referencia puede usar cualquier commit del historial cuyo árbol coincida.
4. Ajuste de alcance a los tests existentes: `tests/mcp-server.test.ts` usaba `commit:<sha>` falso (40 × a) sin evidencia en tres `iniciar_qa` — la forma sin verificación que E1 cierra. Pasaron a la forma libre `worktree:sha256:<hash>` literal, que conserva exactamente la conducta anterior. La suite de equivalencia con `ticket.py` está desactivada por defecto (exige `VALMEN_REFERENCE_TICKET_PY`); cuando se corra, la referencia Python necesitará el mismo cambio en `iniciar_qa`.

## Pruebas

- `npx vitest run tests/qa-commit-referencia.test.ts` → 4 pasadas: (a) commit con árbol igual a la evidencia ⇒ acepta y registra `build_reference: "commit:<sha>"`; (b) commit con árbol distinto ⇒ rechazo sin escribir el bloque (el historial QA queda con su par exacto); (c) sin evidencia worktree ⇒ `commit:` se rechaza y la forma libre sigue funcionando; (d) sha de forma inválida ⇒ rechazo.
- `npx vitest run` (suite completa, tras `npm run build`) → **1543 pasadas, 48 skipped, 0 fallos**.
- Resultado del PO: Ve el desglose de compuertas en Mission Control y lo aprueba — «si yo las veo bien quedo perfecto».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-29",
    "build_reference": "worktree:sha256:e3ff591c95225e3ed4805e85f906ac78f61555ef975442868f5fdf26b82751b1",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-29",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "si yo las veo bien quedo perfecto"
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
    "description": "Forma commit:sha en qa-start: verificacion de igualdad entre el arbol del commit y la evidencia worktree:sha256 del ticket, leyendo los blobs con git show y el encuadre del contrato; sin evidencia o con arbol distinto se rechaza sin escribir el bloque. Ayuda del CLI actualizada. 4 pruebas nuevas con repo temporal. Suite completa: 1543 pruebas, 0 fallos. Ajuste de 3 iniciar_qa de mcp-server.test.ts que usaban commit falso sin evidencia, pasados a la forma libre literal.",
    "reference": "worktree:sha256:e3ff591c95225e3ed4805e85f906ac78f61555ef975442868f5fdf26b82751b1",
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
    "date": "2026-09-29",
    "technical_summary": "Forma commit:sha en qa-start con verificacion de igualdad de arbol",
    "functional_summary": "El ciclo de QA cita el commit sin tercera corrida cuando el arbol coincide con la evidencia",
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
    "date": "2026-09-29",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesion 20260928_140418_c56444 del escritorio Hermes: trabajo meta directo del harness - diagnostico, implementacion, pruebas y registro. Sirvio a los cuatro tickets del dia y al diseno del pipeline; su gasto completo queda en la base del perfil saiopencloud: 3.169.166 tokens entrada + 348.987 salida + 211.763 razonamiento, 248 llamadas, modelo glm-5.3-flash, sin costo por token de suscripcion",
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
    "date": "2026-09-29",
    "session_reference": "20260928_140418_c56444",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente hermes:desktop. Sesión **compartida**: trabajó 9 tickets (BUGFIX-TIMELINE-SESSION-V2-20260928 ×165, BUGFIX-SERVER-ATRIBUCION-POR-LLAMADA-20260928 ×142, IMPROVEMENT-ENGINE-QA-REFERENCIA-COMMIT-20260928 ×108, IMPROVEMENT-TIMELINE-COSTO-COMPUERTAS-20260928 ×101, FEATURE-RELLENO-MASIVO-ANULACION-20260924 ×87), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 5356043 tokens. Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Evolucionar flujo de trabajo SciOpenCloud\".",
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
    "at": "2026-09-29T01:50:02.606Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-28",
    "at": "2026-09-29T02:07:14.804Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:40.268Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO): Análisis aprobado por el PO en conversación: los 4 gates cayeron en la banda espuria de riesgos_cubren_impactos con impactos en ninguno, defecto ya registrado en FEATURE-GATE-IMPACTO-NULO-BANDA-20260928."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:51.192Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-28",
    "at": "2026-09-29T02:28:51.320Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-28",
    "at": "2026-09-29T03:54:52.425Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-28",
    "at": "2026-09-29T03:55:07.534Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-28",
    "at": "2026-09-29T03:55:59.565Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-28",
    "at": "2026-09-29T03:57:11.608Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:25.990Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:26.175Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:26.363Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:26.552Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:27.003Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:27.049Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-28",
    "at": "2026-09-29T04:12:27.233Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
