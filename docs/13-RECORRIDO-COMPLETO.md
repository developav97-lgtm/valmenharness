# 13 — Recorrido completo: un ticket de principio a fin

Los demás documentos explican las piezas por separado. Este las junta: un caso real,
recorrido paso a paso, mostrando **quién hace qué, qué se guarda en disco y dónde entra el
humano**.

El escenario es un bug real de tu repositorio: el filtro de órdenes del POS no encuentra el
número indicado.

---

## Escena 0 — El pedido

```
Tú (en Claude Code, dentro de SaiOpenCloud):
  "El filtro de órdenes del POS no encuentra la orden cuando busco por número.
   Si escribo el número exacto aparece, pero si escribo parte del número no
   encuentra nada. ¿lo revisamos?"
```

El agente tiene `AGENTS.md` generado por el harness, que incluye el protocolo ODD. Su primer
paso **no es tocar código**: es autorizar.

```
Agente (internamente, paso 1 del protocolo):

  AUTORIZAR — el pedido dice "¿lo revisamos?". Es una solicitud de investigación.
  Read-only. No se escribe hasta que el usuario pida un cambio.

  EXPLORAR — antes de leer archivos, consultar el grafo.

    valmen mcp → codegraph_search(symbol: "OrderFilter")
    → 3 candidatos en BackEnd/pos/, 1 en FrontEnd/

  CLASIFICAR — esto no es trivial: hay que entender el flujo de filtrado en
  backend y frontend. Es un ticket, no modo directo. Tipo: BUGFIX.
```

**Lo que ya ganamos:** el agente no editó nada. El sistema no creó archivos. La respuesta va
a ser un diagnóstico, no un parche a ciegas.

---

## Escena 1 — Crear el ticket (`intake`)

```bash
$ valmen ticket new \
    --type BUGFIX \
    --module POS \
    --title "El filtro de órdenes no encuentra por número parcial" \
    --request "El filtro de órdenes del POS no encuentra la orden cuando busco por número. Si escribo el número exacto aparece, pero si escribo parte del número no encuentra nada. ¿lo revisamos?"
```

```
✓ Ticket creado: BUGFIX-POS-FILTRO-ORDENES-20260921
  tickets/2026/BUGFIX-POS-FILTRO-ORDENES-20260921/ticket.md
  workflow_status: intake   qa_status: pending   release_status: unreleased

  Clasificación preliminar:
    tipo      BUGFIX (declarado)
    módulo    POS
    impactos  sync·no  migration·no  docker·no  auth·no  deploy·no
    riesgo    normal
  Gate `intake` → auto
```

El **gate `intake` corre solo**, porque es 100% mecánico:

```yaml
checks:
  - id: solicitud_preservada
    kind: assert
    expr: "sha256(ticket.sections['Solicitud original']) == ticket.request_hash"
    # Verifica que nadie reescribió el pedido original.
  - id: tipo_valido
    kind: assert
    expr: "ticket.type in config.types.allowed"
  - id: impactos_declarados
    kind: assert
    expr: "ticket.impacts is not null"
```

```
  Gate `intake` → approve  (3/3 checks mecánicos)
  workflow_status: intake → analyzed
  Recibo: .valmen/receipts/BUGFIX-POS-FILTRO-ORDENES-20260921.jsonl#GR-…-0001
```

**Coste:** $0. Sin modelo involucrado. La máquina de estados avanzó con verificación
determinista.

---

## Escena 2 — Investigar y escribir el diagnóstico

El agente ahora sí lee. Con el grafo sabe dónde mirar:

```
  codegraph_impact(OrderFilter) → archivos afectados reales
  read  BackEnd/pos/filters.py
  read  BackEnd/pos/views.py
  read  FrontEnd/src/app/pos/order-list/order-list.component.ts
```

Y escribe el diagnóstico en el ticket:

```markdown
## Diagnóstico

- **Comportamiento actual:** el filtro `OrderFilter.number` usa `exact` en el
  `FilterSet`. Buscar "1042" encuentra la orden; buscar "104" no encuentra nada.
- **Comportamiento esperado:** la búsqueda parcial por número debe devolver
  todas las órdenes cuyo número contenga el texto.
- **Archivos y flujo investigados:**
  - `BackEnd/pos/filters.py:88` — `number = django_filters.CharFilter(lookup_expr='exact')`
  - `BackEnd/pos/views.py:214` — el ViewSet pasa `filterset_class=OrderFilter`
  - `FrontEnd/src/app/pos/order-list/order-list.component.ts:142` — envía
    `?number=${term}` sin normalizar
- **Causa raíz:** el `lookup_expr` es `exact` cuando la especificación de la
  pantalla documenta búsqueda parcial. El frontend no es la causa: el backend
  descarta los resultados.
- **Riesgos y compatibilidad:** cambiar a `icontains` altera el contrato del
  endpoint. Hay un cliente LocalAgent (Go) que consume `?number=` con el número
  exacto; `icontains` sigue devolviendo ese resultado, así que es compatible
  hacia atrás. No hay impacto de sync: el filtro es solo de lectura.
- **Impactos:** sync·no  migration·no  docker·no  deploy·no
```

---

## Escena 3 — El gate de análisis (`analyzed → planned`)

```bash
$ valmen gate run analysis --subject BUGFIX-POS-FILTRO-ORDENES-20260921
```

### Fase 1 — checks mecánicos (código, $0)

```
  ✓ solicitud_preservada          el hash del pedido original coincide
  ✓ archivos_existen              los 3 archivos citados existen en el repo
  ✓ lineas_citadas_corresponden   filters.py:88 contiene lookup_expr='exact'
  ✓ riesgos_cubren_impactos       impactos declarados: 0 → no se exige nada
  ✓ causa_raiz_presente           la sección nombra "Causa raíz:" con contenido
```

El tercer check es interesante: el motor **abre el archivo y verifica que la línea citada
contiene lo que el diagnóstico dice**. Eso detecta diagnósticos inventados sin llamar a
ningún modelo.

### Fase 2 — evaluación semántica (Jev, $0.0001)

```jsonc
// POST https://openrouter.ai/api/alpha/decisions
{
  "model": "typesafe/jev-1.13",
  "session_id": "BUGFIX-POS-FILTRO-ORDENES-20260921",   // ata la request al ticket
  "state": {
    "solicitud":     "…texto literal del PO…",
    "investigacion": "…la sección Diagnóstico…",
    "reglas_proyecto": "…de .valmen/rules/…"
  },
  "questions": {
    "diagnostico_corresponde_al_pedido": {
      "type": "noul",
      "instructions": "La `investigacion` describe un defecto que explica el síntoma reportado en `solicitud`.",
      "criteria": {
        "true":  "La causa descrita produce exactamente el síntoma reportado.",
        "false": "La causa descrita no explica el síntoma, o el síntoma reportado es otro."
      }
    },
    "causa_es_especifica": {
      "type": "noul",
      "instructions": "`investigacion` nombra una causa concreta y verificable, no una hipótesis vaga."
    },
    "riesgos_completos": {
      "type": "noul",
      "instructions": "`investigacion` declara el impacto sobre otros consumidores del mismo endpoint."
    },
    "clasificacion": {
      "type": "choice",
      "instructions": "¿Cuál es el estado de la investigación?",
      "criteria": {
        "completa":        "Identifica causa, archivos, flujo y riesgos.",
        "falta_causa":     "Describe el síntoma sin identificar la causa.",
        "falta_archivos":  "No nombra los archivos concretos afectados.",
        "falta_impacto":   "No analiza el efecto sobre otros consumidores."
      }
    }
  }
}
```

```jsonc
// Respuesta — nótese que todas las preguntas vienen en una sola llamada
{
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": {
    "diagnostico_corresponde_al_pedido": { "type": "noul", "noul": 0.97 },
    "causa_es_especifica":               { "type": "noul", "noul": 0.95 },
    "riesgos_completos":                 { "type": "noul", "noul": 0.91 },
    "clasificacion": { "type": "choice", "choice": "completa",
                       "confidence": 0.89,
                       "probabilities": { "completa": 0.89, "falta_causa": 0.06 } }
  },
  "usage": { "input_tokens": 1847, "output_tokens": 18, "cost": 0.000078 }
}
```

### Combinación en código

```ts
// Umbrales del gate: approve_at 0.90, block_at 0.10
noul: 0.97 ✓  0.95 ✓  0.91 ✓        → todas ≥ 0.90
choice: "completa"                  → no hay veto
→ OUTCOME: approve
```

```
  Gate `analysis` → approve
  workflow_status: analyzed → planned
  Coste: $0.000078 · 384 ms
```

### Lo que queda en disco

```jsonc
// .valmen/receipts/BUGFIX-POS-FILTRO-ORDENES-20260921.jsonl  (append-only)
{
  "kind": "gate-receipt",
  "id": "GR-20260921-0002",
  "gate": "plan…" /* analysis */,
  "gateVersion": "sha256:a3f1c9d2…",
  "subject": { "type": "ticket", "id": "BUGFIX-POS-FILTRO-ORDENES-20260921", "revision": 2 },
  "outcome": "approve",
  "reason": "todas las proposiciones claras",
  "actor": "model",
  "stateHash": "sha256:9c2e4b17…",
  "stateRef": ".valmen/receipts/_state/GR-20260921-0002.json.zst",
  "mechanicalChecks": [
    { "id": "archivos_existen", "result": "pass" },
    { "id": "lineas_citadas_corresponden", "result": "pass" }
  ],
  "modelAnswers": [
    { "id": "diagnostico_corresponde_al_pedido", "weight": 3, "noul": 0.97 },
    { "id": "causa_es_especifica", "weight": 1, "noul": 0.95 },
    { "id": "riesgos_completos", "weight": 1, "noul": 0.91 },
    { "id": "clasificacion", "choice": "completa", "confidence": 0.89 }
  ],
  "model": { "provider": "openrouter", "model": "typesafe/jev-1.13",
             "resolvedVersion": "typesafe/jev-1.13-20260917" },
  "usage": { "inputTokens": 1847, "outputTokens": 18, "costUsd": 0.000078 },
  "latencyMs": 384,
  "escalatedTo": null,
  "humanDecision": null
}
```

**Nótese que el contexto exacto quedó guardado y comprimido.** Si en tres meses alguien
pregunta "¿por qué se aprobó esto?", la respuesta es el archivo, no una reconstrucción.

---

## Escena 4 — El plan y el gate donde el humano sí entra

El agente escribe el plan:

```markdown
## Plan

- **Gate de plan y aprobación:** BUGFIX, riesgo normal, sin impactos críticos.
  Proporcional: no requiere aprobación del PO antes de escribir, pero el gate
  `plan` corre en modo hybrid.
- **Pasos ordenados:**
  1. `BackEnd/pos/filters.py` — cambiar `number` de `lookup_expr='exact'` a
     `lookup_expr='icontains'`.
  2. `BackEnd/pos/tests/test_filters.py` — agregar prueba de búsqueda parcial
     y prueba de que el número exacto sigue funcionando.
  3. `FrontEnd/src/app/pos/order-list/order-list.component.ts` — no requiere
     cambio; se verifica que el debounce sigue siendo correcto.
- **Criterios de aceptación:**
  - [ ] Buscar "104" devuelve la orden "1042".
  - [ ] Buscar "1042" sigue devolviendo la orden "1042".
  - [ ] Buscar "999" no devuelve resultados.
  - [ ] El LocalAgent que consulta con el número exacto sigue funcionando.
- **Compatibilidad hacia atrás:** `icontains` es superconjunto de `exact`; todo
  resultado que devolvía `exact` lo sigue devolviendo.
- **Rollback:** revertir un cambio de una línea en `filters.py`.
```

El gate `plan` corre. **Y aquí se pone interesante**, porque uno de los criterios es
problemático:

```
  ── checks mecánicos ──
  ✓ criterios_presentes            4 criterios
  ✓ rollback_declarado             riesgo normal, rollback presente
  ✓ presupuesto_revision           3 archivos, dentro del presupuesto
  ✓ regla_admin_vs_frontend        no propone configuración en Django Admin

  ── evaluación Jev ──
  cubre_todos_los_criterios         0.71  ⚠ BANDA MEDIA
  corresponde_a_la_investigacion    0.96  ✓
  pasos_ejecutables                 0.94  ✓
  criterios_verificables            0.88  ⚠ BANDA MEDIA
  compatibilidad_hacia_atras        0.93  ✓

  clasificacion: falta_evidencia (0.41) vs completo (0.38)

  → OUTCOME: review   (ninguna ≤0.10, no todas ≥0.90)

  Gate `plan` → ESCALADO A HUMANO
  Motivo: 2 proposiciones en banda media (0.71, 0.88)
```

### El humano decide — desde el celular

Llega la notificación por el gateway de Hermes:

```
┌─ Telegram ──────────────────────────────────────────────────────────────────┐
│ ⚠ GATE PENDIENTE · plan                                                     │
│ Ticket: BUGFIX-POS-FILTRO-ORDENES-20260921                                  │
│ BUGFIX · POS · riesgo normal · sin impactos críticos                        │
│                                                                             │
│ El plan propone 3 pasos para corregir el filtro de órdenes.                 │
│                                                                             │
│ Jev evaluó 5 proposiciones:                                                 │
│   ⚠ cubre todos los criterios        0.71  ← banda media                    │
│   ✓ corresponde a la investigación   0.96                                   │
│   ✓ pasos ejecutables                0.94                                   │
│   ⚠ criterios verificables           0.88  ← banda media                    │
│   ✓ compatibilidad hacia atrás       0.93                                   │
│                                                                             │
│ Por qué duda: el criterio "El LocalAgent sigue funcionando" no tiene un     │
│ comando de verificación concreto en el plan.                                │
│                                                                             │
│ Costo de esta evaluación: $0.00009                                          │
│                                                                             │
│ [ ✅ Aprobar ]   [ ❌ Rechazar ]   [ 📄 Ver el plan completo ]               │
│ Enlace válido por 24h · token de un solo uso                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

Tú ves lo mismo en el Mission Control, con el estado congelado completo, y decidís:

```
  [ ✓ Aprobar ]   [ ✗ Rechazar con motivo ]   [ ↻ Devolver al agente ]

  Aprobar esta vez:  ● solo este ticket   ○ y promover el gate a auto

  Motivo (queda en el recibo):
  "El criterio del LocalAgent es una verificación manual razonable para un
   bugfix de una línea. No amerita un test automatizado nuevo."
```

```yaml
# Recibo actualizado — el humano decidió
{
  "outcome": "review",
  "escalatedTo": "human",
  "humanDecision": {
    "actor": "juanandrade",
    "decision": "approve",
    "reason": "El criterio del LocalAgent es una verificación manual razonable…",
    "channel": "telegram",
    "decidedAt": "2026-09-21T15:04:22Z"
  }
}
```

```
  Gate `plan` → approve (por decisión humana)
  workflow_status: planned → approved → in_progress
```

### Y aquí está el punto de todo el diseño

El sistema **no** cambió el umbral para que aprobara. **No** le preguntó a otro modelo.
Registró la decisión humana con su motivo, y sigue adelante.

Si esto se repite 25 veces —Jev duda por el mismo motivo y el humano siempre aprueba— la
siguiente vez que corras `valmen gate simulate` verás:

```
$ valmen gate simulate plan --last 30

  pregunta con más banda media: criterios_verificables (11/30)
    En 9 de esos 11, el humano aprobó con un motivo similar:
    "criterio manual es aceptable para bugfix de bajo riesgo"

  → Sugerencia: añadir a la proposición
      `criterios_verificables`:
      "Un criterio que requiere verificación manual explícita cuenta como
       verificable si el plan nombra quién lo verifica."
    Con ese cambio, 9 de los 11 casos pasarían a approve.
    Precisión estimada del gate tras el cambio: 97% (29/30)
                                                  [aplicar sugerencia]
```

**El gate no se relajó por decreto: se ajustó por evidencia acumulada, con una sugerencia
explícita y tu aprobación.** Eso es el Nivel 5 de capacidad funcionando.

---

## Escena 5 — Implementación

```
  El agente implementa el plan aprobado.

  edit  BackEnd/pos/filters.py
        -  number = django_filters.CharFilter(lookup_expr='exact')
        +  number = django_filters.CharFilter(lookup_expr='icontains')

  edit  BackEnd/pos/tests/test_filters.py
        +  def test_busqueda_parcial_por_numero(self): …
        +  def test_numero_exacto_sigue_funcionando(self): …

  Ejecuta las pruebas:
        python manage.py test BackEnd.pos.tests.test_filters --keepdb
        → Ran 12 tests in 3.4s   OK

  Registra la implementación en el ticket:
        valmen ticket evidence add … --kind automated-test \
          --description "12 pruebas de filtros, OK" \
          --reference "worktree:sha256:7f3a…"
```

El check `qa-mechanical` corre solo antes de entregarte nada:

```
  ✓ tests_declarados_corren           12 tests, OK
  ✓ git_diff_check_limpio             sin espacios en blanco sobrantes
  ✓ sin_secretos_en_el_diff           ningún patrón de credencial
  ✓ atribucion_de_archivos            los 2 archivos están dentro del alcance del plan
  ✓ sync_no_afectado                  el diff no toca cola de sync ni naturales keys
  → approve
  workflow_status: in_progress → awaiting_user_tests
```

**El cuarto check es el que evita el scope creep.** Si el agente hubiera tocado
`docker-compose.yml`, el check falla y te avisa antes de que revises nada.

Ahora el sistema te entrega el contrato de pruebas:

```
  ┌─ PRUEBAS PARA EL PO ────────────────────────────────────────────────────┐
  │ Directorio: /Users/…/SaiOpenCloud                                        │
  │ Build: worktree:sha256:7f3a9e21…                                         │
  │                                                                          │
  │ 1. Aplicar el cambio:                                                    │
  │      git checkout dev && git pull                                        │
  │                                                                          │
  │ 2. Prueba manual (pantalla de órdenes del POS):                          │
  │      a. Abrir el listado de órdenes del POS.                             │
  │      b. En el filtro de número escribir "104".                           │
  │      c. Esperado: aparece la orden 1042 (y cualquier otra que contenga   │
  │         "104"), no una lista vacía.                                      │
  │      d. Escribir "1042". Esperado: aparece solo la orden 1042.           │
  │      e. Escribir "999". Esperado: lista vacía, sin error.                │
  │                                                                          │
  │ 3. Prueba del cliente local (LocalAgent):                                │
  │      Ejecutar la consulta habitual con el número exacto y confirmar que  │
  │      sigue respondiendo igual.                                           │
  │                                                                          │
  │ Requisitos de ambiente: backend y frontend locales, tenant de prueba.    │
  │ [ Marcar como probado ]  [ Reportar un problema ]                        │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## Escena 6 — Encontraste un problema

Probaste y algo falla:

```
Tú: "Funciona con 104, pero si busco '1042' con un espacio al final no
     encuentra nada. El frontend no está limpiando el input."
```

El sistema **no** reabre el ticket ni pierde historia. Agrega un punto:

```bash
$ valmen ticket point add BUGFIX-POS-FILTRO-ORDENES-20260921 \
    --title "El filtro no tolera espacios al inicio o final" \
    --severity normal \
    --actual "Buscar '1042 ' no devuelve resultados." \
    --expected "Los espacios al inicio o final no deben afectar la búsqueda."
```

```
✓ POINT-002 agregado. EVENT-009 registrado.
  workflow_status: awaiting_user_tests  (sin cambio)
  ────────────────────────────────────────────────────────────────────
  Por qué el estado NO cambia: `awaiting_user_tests` tiene una única
  salida, `in_qa`. El PO no puede devolver un ticket directamente a
  cambios (verificado en TICKET_TRANSITIONS de ticket.py). El flujo
  correcto es: se registra el hallazgo como punto, y al confirmar las
  pruebas se pasa a QA, que es quien devuelve con `changes_requested`
  si corresponde.

  Nota: el POINT-001 pasa a awaiting_retest (su corrección sigue
        pendiente de confirmación junto con la nueva).
```

El agente corrige el `POINT-002`. El ticket sigue en `awaiting_user_tests` con **ambos**
puntos por verificar. Cuando confirmas:

```bash
$ valmen ticket retest add BUGFIX-POS-FILTRO-ORDENES-20260921 \
    --point POINT-001 --result verified \
    --po-confirmation "Probado con 104, 1042 y 999. Correcto."
$ valmen ticket retest add BUGFIX-POS-FILTRO-ORDENES-20260921 \
    --point POINT-002 --result verified \
    --po-confirmation "Probado '1042 ' y ' 1042'. Correcto."
```

```
  POINT-001: awaiting_retest → verified → closed
  POINT-002: awaiting_retest → verified → closed
  Gate `qa`: sin puntos bloqueantes ✓  (BLOCKING_POINT_STATES no incluye `verified`)
  workflow_status: awaiting_user_tests → in_qa → qa_approved
```

**Nótese que los puntos se cerraron explícitamente** (`verified → closed`). Esto es una
decisión consciente, porque en los 57 tickets históricos **55 de 137 puntos quedaron en
`verified` sin cerrar**, y no hay regla que establezca qué debería pasar. El gate `close` del
harness obliga a decidirlo (ver [`09-MIGRACION-SAICLOUD.md` §2bis.2quater](09-MIGRACION-SAICLOUD.md)).
Aquí el agente los cierra porque es lo correcto; el gate se asegura de que no se olvide.

---

## Escena 7 — Cierre

```bash
$ valmen ticket close BUGFIX-POS-FILTRO-ORDENES-20260921 \
    --technical-summary "Se cambió lookup_expr de exact a icontains en
      OrderFilter.number y se normaliza el término en el frontend." \
    --functional-summary "El filtro de órdenes ahora encuentra por número
      parcial y tolera espacios." \
    --qa-status approved
```

```
  Gate `close` → approve
  ✓ causa_y_solucion_documentadas
  ✓ evidencia_presente                (2 EVIDENCE, 2 RETEST verificados)
  ✓ sin_puntos_bloqueantes
  ✓ shas_de_commits_atribuibles       2 commits, 40 caracteres cada uno
  ✓ release_status_valido             unreleased (correcto, no se ha publicado)

  workflow_status: qa_approved → closed
  release_status: unreleased
  docs/tickets/index.md regenerado (57 → 58 tickets)

  ── CONSUMO DE IA (medido, no estimado) ──────────────────────────────────
  Total: $0.31
    explorer     (glm-4.7-flash)      $0.04   12 llamadas
    implementer  (deepseek-v4-flash)  $0.24   31 llamadas
    test-author  (deepseek-v4-flash)  $0.02
    gate analysis(jev-1.13)           $0.000078
    gate plan    (jev-1.13)           $0.000090
    gate qa      (jev-1.13)           $0.000061
  Humano: 2 decisiones (plan, retests)
```

**Compáralo con lo que tienes hoy:** ese desglose de costo no existe. `## Consumo de IA`
tiene 1 entrada en 57 tickets porque era manual. Aquí es un subproducto de haber corrido.

---

## Escena 8 — Release

Tres semanas después, este ticket y otros once entran en la v1.42.0:

```bash
$ valmen process run deploy --version 1.42.0 \
    --tickets BUGFIX-POS-FILTRO-ORDENES-20260921,SYNC-…,FEATURE-…
```

```
■■■ deploy  1/8  preflight                                    ✓  0.3s
    git log --oneline production..dev → 14 commits
    git diff --stat production...dev  → 31 archivos

■■■ deploy  2/8  version-check                                ✓  0.1s
    SemVer válido · manifest coherente · 12 tickets unreleased

■■■ deploy  3/8  gate-deploy                                  ⏸ ESPERANDO
    Gate humano. Frase literal requerida.
```

```
┌─ GATE: deploy ──────────────────────────────────────────────────────────────┐
│ Versión: 1.42.0   ·   12 tickets   ·   14 commits   ·   31 archivos          │
│                                                                             │
│ Ticket que cerraste hace 3 semanas:                                         │
│   ✓ BUGFIX-POS-FILTRO-ORDENES-20260921   QA approved   commit a3f1c9d       │
│                                                                             │
│ Este gate NO se automatiza. No existe umbral de confianza que lo habilite.  │
│ Ver la sección 11 de 03-GATES.md para la lista completa de acciones que      │
│ nunca se automatizan.                                                       │
│                                                                             │
│ Rollback planificado: tag v1.41.3, artefacto sha256:…, validado.            │
│                                                                             │
│ Escribe la frase para confirmar:  APROBAR DEPLOY v1.42.0                     │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

Tras la frase:

```
■■■ deploy  4/8  tag                     ✓  v1.42.0 anotado sobre production
■■■ deploy  5/8  publish                 ✓  12 tickets → release_status: released
■■■ deploy  6/8  manuals                 ◐  proceso `actualizar-manuales`
       └─ detectar-pantallas   ✓  0 pantallas nuevas, 1 modificada
       └─ escribir             ✓  order-list.md actualizado
       └─ auditar              ✓  reality-checker: 2 citas del código verificadas
       └─ gate-manuals         ✓  approve
       └─ pdf                  ✓  regenerado
■■■ deploy  7/8  post-release            ✓  release registrada, changelog generado
■■■ deploy  8/8  notify                  ✓  notificado
```

**Ese paso 6 es tu pedido, funcionando:** *"en el deploy agregar la herramienta de actualizar
los manuales y que ya cuando se llame el deploy haga ese punto"*. Está declarado en
`.valmen/processes/deploy.yaml` como un paso `kind: process` con `continue_on_failure: true`,
así que un fallo en los manuales avisa pero no bloquea la release.

---

## Resumen del recorrido

| Escena | Quién decide | Coste | Qué queda registrado |
|---|---|---|---|
| 0 · Pedido | Agente (read-only) | ~$0.01 | Nada |
| 1 · Intake | **Motor** (3 checks) | $0 | Recibo GR-0001 |
| 2 · Diagnóstico | Agente | ~$0.08 | Sección `Diagnóstico` |
| 3 · Gate análisis | **Motor + Jev** | $0.0001 | Recibo GR-0002 + estado congelado |
| 4 · Gate plan | **Jev → humano** | $0.0001 | Recibo GR-0003 con decisión humana y motivo |
| 5 · Implementación | Agente | ~$0.20 | Evidencia + SHA + `awaiting_user_tests` |
| 6 · Punto nuevo | **Humano** (reporta) | $0 | `POINT-002` + reciclo de QA |
| 7 · Cierre | **Motor + humano** | ~$0.0001 | Recibo de cierre + consumo medido |
| 8 · Deploy | **Humano (frase literal)** | $0 | Proceso + manuales encadenados |

**Total: ~$0.31 y 2 intervenciones humanas** — el gate de plan (donde Jev dudó con razón) y
los retests. Todo lo demás lo decidió el motor con evidencia registrada.

**Comparado con el flujo actual:** 4 gates humanos, sin registro de costo, sin
encadenamiento de manuales, y sin forma de saber por qué se aprobó algo hace tres meses.
