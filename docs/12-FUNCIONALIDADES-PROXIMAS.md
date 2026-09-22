# 12 — Funcionalidades propuestas

Pediste explícitamente que propusiera más funcionalidades para llegar a un sistema
semi-autónomo. Estas son, ordenadas por **valor / esfuerzo**, con lo que hacen y por qué
importan.

No todas se construyen. Este documento existe para que elijas.

---

## A. Alto valor, esfuerzo bajo — construir temprano

### A1. `/pregunta` — modo pregunta forzado

**Qué es.** Un comando que garantiza que el agente responde sin tocar nada.

```
/ticket FEATURE-INVENTARIO-API ¿este plan rompe la compatibilidad de sync?
```

**Por qué importa.** El modo de fallo más frecuente y más caro de los agentes es editar
cuando se pidió analizar. El primer paso del protocolo ODD ("Autorizar") es una instrucción;
esto lo convierte en un **mecanismo**: en modo pregunta el motor no concede permisos de
escritura, y el agente no puede editar aunque quiera.

**Cómo.** El CLI expone `valmen ask`, que corre el agente con `permissions.write = false` y
un system prompt reducido. Determinista, no depende de que el modelo obedezca.

**Esfuerzo:** 2–3 días.

---

### A2. Detector de specs y tickets desactualizados

**Qué es.** Un check que compara el artefacto con el código y detecta drift.

```
$ valmen drift
⚠ tickets/2026/FEATURE-INVENTARIO-API-20260921/ticket.md
  El plan declara modificar `BackEnd/inventario/api/views.py`
  → ese archivo no existe todavía (esperado si el ticket está en planned)
  El plan cita `MovimientoInventario.saldo_actual`
  → el modelo existe pero el campo se llama `saldo`       [drift real]

⚠ features/modulo-inventario/spec/kardex/spec.md
  Requisito R12 dice "exportable a PDF"
  → el ticket FEATURE-INVENTARIO-REPORTES implementa "exportable a Excel"
  → posible requisito cambiado sin actualizar la spec
```

**Por qué importa.** Un ticket que cita símbolos que ya no existen es un ticket que va a
generar un cambio equivocado. Detectar esto **antes** de implementar ahorra el ciclo entero.

**Cómo.** CodeGraph para verificar símbolos y archivos; comparación mecánica. Sin LLM.

**Esfuerzo:** 3–4 días.

---

### A3. Simulador de sprint

**Qué es.** Dado el grafo de una feature y las dependencias, calcula los caminos críticos y
propone un orden que maximiza el paralelismo.

```
$ valmen feature plan modulo-inventario --simulate --agents 3

Paralelismo máximo: 3 escritores
Camino crítico: MODELO → API → PANTALLA-SALDOS → REPORTES   (4 saltos)

  Ola 1  ███ MODELO          ███ PANTALLA-MOVIMIENTOS   (2 en paralelo)
  Ola 2  ███ API             ░░░ (espera MODELO)         1 bloqueado
  Ola 3  ███ PANTALLA-SALDOS ███ EXPORTABLE
  Ola 4  ███ REPORTES
  ────────────────────────────────────────────────────────
  Serial: 6 olas · Paralelo: 4 olas → 33% más rápido

⚠ Colisión de archivos detectada:
  API y PANTALLA-MOVIMIENTOS ambos modifican
  `FrontEnd/src/app/inventario/inventario.module.ts`
  → serializar, o asignar el cambio del módulo a un solo ticket
```

**Por qué importa.** Tu caso de inventario es exactamente esto: muchos tickets que se pueden
paralelizar pero que colisionan en archivos compartidos. Detectar la colisión antes de
lanzar 3 agentes evita un merge conflictivo.

**Esfuerzo:** 1 semana.

---

### A4. Detección y resolución de colisiones de escritura

**Qué es.** El motor sabe qué archivos planea tocar cada ticket activo y avisa antes de
lanzar un subagente.

```yaml
# .valmen/config.yaml
concurrency:
  max_writers: 3
  collision_policy: warn        # warn | serialize | block
  lock_scope: file              # file | module | repo
  stale_lock_minutes: 60
```

**Por qué importa.** Con agentes en paralelo, dos escritores en el mismo archivo es el
problema número uno. Tu `PHASE-MAP.md` ya lo declara como regla *("la concurrencia no permite
que dos escritores modifiquen el mismo archivo sin coordinación explícita")* — pero hoy es
una regla que hay que recordar. Esto la convierte en un mecanismo.

**Esfuerzo:** 4–5 días.

---

### A5. Captura pasiva de conocimiento (`Key Learnings`)

**Qué es.** Cada subagente termina su reporte con 1–5 frases factuales de lo aprendido. El
motor las acumula y las propone como reglas del proyecto o entradas de `docs/errors.md`.

```json
{
  "status": "success",
  "artifacts": ["BackEnd/inventario/api/views.py"],
  "key_learnings": [
    "El proyecto usa `django-tenants` y no `django-tenant-schemas`; los docs heredados están mal.",
    "`register_bulk_sync()` debe llamarse después de `bulk_create` o el sync pierde los registros.",
    "El módulo de inventario comparte `inventario.module.ts` con POS: cambios ahí afectan ambos."
  ]
}
```

```bash
$ valmen memory review
3 aprendizajes nuevos sin clasificar:
  1. [error conocido] register_bulk_sync después de bulk_create
     → ¿agregar a docs/errors.md?  [sí] [no] [ya está]
  2. [regla de proyecto] django-tenants, no django-tenant-schemas
     → ¿agregar a .valmen/rules/stack.md?  [sí] [no]
  3. [gotcha] inventario.module.ts es compartido con POS
     → ¿agregar a .valmen/rules/dominio.md?  [sí] [no]
```

**Por qué importa.** Es lo que hace que el ecosistema **mejore con el uso** sin que nadie se
siente a escribir documentación. El conocimiento se captura en el momento en que se descubre,
que es cuando alguien lo tiene fresco.

**Esfuerzo:** 1 semana (con el plugin de memoria).

---

### A6. Detector de secretos y datos sensibles

**Qué es.** Un check mecánico obligatorio en los gates `pre-apply`, `qa-mechanical` y `close`.

- Patrones de credenciales (AWS keys, tokens, contraseñas, connection strings).
- Datos de clientes reales en tickets, evidencia o prompts.
- Valores de respaldo expuestos.

**Por qué importa.** Tu `AGENTS.md` lo prohíbe explícitamente (*"No modificar ni exponer
credenciales, valores de respaldo o información sensible en tickets, planes, logs o
reportes"*). Hoy es una regla; esto la vuelve imposible de violar por descuido. Además, los
prompts viajan a proveedores externos: un secreto en un prompt es un secreto filtrado.

**Esfuerzo:** 3–4 días (`gitleaks` + reglas propias de datos de cliente).

---

### A7. Diff de intención

**Qué es.** Compara lo que se pidió con lo que se implementó, mecánicamente.

```
$ valmen ticket audit-intent FEATURE-INVENTARIO-API-20260921

Solicitud original:  "Endpoint para registrar movimientos de inventario con
                      validación de saldo y registro en la cola de sync"

Archivos modificados: 7
  ✓ BackEnd/inventario/api/views.py        (registrar movimientos)
  ✓ BackEnd/inventario/api/serializers.py  (validación de saldo)
  ✓ BackEnd/inventario/models.py           (cola de sync)
  ✓ BackEnd/inventario/tests/test_api.py
  ⚠ FrontEnd/src/app/inventario/...        → NO solicitado en la petición original
  ⚠ docker-compose.yml                     → NO solicitado

→ 2 archivos fuera del alcance declarado. ¿Estaban en el plan aprobado?
```

**Por qué importa.** Detecta el "scope creep" del agente, que es una causa real de tickets
que no cierran. Si el plan los autorizaba, es legítimo; si no, hay que justificarlo.

**Esfuerzo:** 3 días.

---

## B. Alto valor, esfuerzo medio — las que suben el nivel

### B1. Verificación de criterios de aceptación como tests ejecutables

**Qué es.** El motor convierte cada criterio de aceptación en un test concreto, lo corre, y
el gate de QA se basa en el resultado.

```yaml
# En el ticket, los criterios se escriben con una anotación opcional:
## Criterios de aceptación
- [ ] El endpoint rechaza cantidades negativas con HTTP 400
      <!-- test: BackEnd/inventario/tests/test_api.py::test_cantidad_negativa -->
- [ ] El movimiento queda en la cola de sync con natural key (sucursal, producto, fecha)
      <!-- test: BackEnd/inventario/tests/test_sync.py::test_natural_key -->
- [ ] La pantalla muestra el saldo actualizado tras el movimiento
      <!-- verify: manual -->
```

```bash
$ valmen gate run qa-mechanical --subject FEATURE-INVENTARIO-API-20260921
✓ test_cantidad_negativa          PASS  (0.42s)
✓ test_natural_key                PASS  (0.61s)
◐ La pantalla muestra el saldo…   MANUAL → requiere prueba del PO
→ Gate: review (1 criterio requiere verificación humana)
```

**Por qué importa.** Convierte "criterios de aceptación" de prosa en algo que se ejecuta. Los
criterios que sí se pueden automatizar se automatizan; los que no, se marcan explícitamente
como manuales en vez de quedar ambiguos.

**Esfuerzo:** 2 semanas. Es el salto al Nivel 3 de capacidad.

---

### B2. Cascada verificada (verificar lo barato con Jev antes de escalar)

**Qué es.** Un patrón documentado por OpenRouter que aplica directamente a tu problema de
costo: un modelo barato hace el trabajo, Jev verifica la respuesta contra el contexto, y
**solo si falla la verificación se escala** a un modelo caro.

```
                    ┌─────────────────┐
Pregunta ──────────▶│ modelo barato   │──── respuesta ────┐
                    │ (v4-flash, $0.04)│                   │
                    └─────────────────┘                    ▼
                                                  ┌──────────────────┐
                                                  │ Jev verifica     │
                                                  │ ¿respaldada por  │
                                                  │ el contexto?     │
                                                  └────────┬─────────┘
                                                     ≥0.9  │  ≤0.9
                                              ┌────────────┴───────────┐
                                              ▼                        ▼
                                        ACCEPTAR                ESCALAR a modelo caro
                                        (barato)                (solo cuando hace falta)
```

Resultado reportado en la documentación de OpenRouter: **0 respuestas erróneas al ~7% del
costo** de mandar todo al modelo caro.

**Por qué importa.** Es la palanca más grande de reducción de costo de todo el diseño. Aplica
a: clasificación de tickets, exploración, extracción de reglas, generación de resúmenes, y
descomposición de primer nivel (con escalado a Opus/K3 cuando Jev no valida).

**Esfuerzo:** 1 semana.

---

### B3. Revisión adversarial por riesgo (RDD simplificado)

**Qué es.** Antes de aprobar un cambio, un revisor independiente lo ataca. La **profundidad
se deriva del riesgo medido, no del juicio del modelo**.

| Riesgo | Lentes | Qué se revisa |
|---|---|---|
| `low` | 0 | Solo lectura estructural del diff, sin llamar a un modelo |
| `normal` | 1 | Una lente: la que corresponda al tipo de cambio |
| `high` / `critical` | 4 | **Risk · Resilience · Readability · Reliability** + refutador |

**Reglas que la hacen funcionar** (tomadas de RDD de gentle-ai, que resolvió el problema de
los bucles infinitos de revisión):

1. El candidato se **congela** antes de revisar: la evidencia pertenece a esos bytes exactos.
2. **Una sola corrección acotada** por candidato. Sin bucles "hasta que esté limpio".
3. El revisor **no es el autor** y usa otro modelo (diversidad de modelo, no solo de prompt).
4. Un **refutador** intenta probar que la corrección no corrige nada.

**Por qué importa.** Es la diferencia entre "el agente dice que está listo" y "un proceso
independiente no pudo encontrarle fallas". Tu skill `saicloud-revision-final` ya apunta a
esto; esto lo generaliza y le pone presupuesto.

**Esfuerzo:** 2–3 semanas.

---

### B4. Detección de regresiones entre tickets

**Qué es.** Cuando un ticket cierra, el motor identifica qué otros tickets podrían haberse
roto por su causa (por archivos y símbolos compartidos) y sugiere un smoke test dirigido.

```
$ valmen ticket close FEATURE-INVENTARIO-API-20260921

Símbolos modificados: registrar_movimiento, SaldoInventario.actualizar

Tickets que dependen de esos símbolos:
  ○ BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907     (cerrado, toca SaldoInventario)
  ○ FEATURE-POS-CASH-TRANSFER-20260811          (cerrado, usa registrar_movimiento)

→ Smoke test sugerido (2 comandos, ~40s):
    python manage.py test BackEnd.pos.tests.test_reporte_z
    python manage.py test BackEnd.pos.tests.test_cash_transfer

  [Ejecutar] [Omitir y registrar el riesgo]
```

**Por qué importa.** Responde directo a tu caso *"un bug reportado quizá de un ticket ya
cerrado porque se agregó otra funcionalidad y se dañó por consecuencia"*. Hoy eso se descubre
en producción; esto lo detecta en el cierre.

**Esfuerzo:** 1 semana (necesita CodeGraph para el mapa de símbolos).

---

### B5. Reporte de valor por ticket

**Qué es.** Cada ticket cerrado acumula un registro de lo que costó y lo que aportó.

```
$ valmen usage value --month 2026-09

Ticket                                     Costo   Gates  Humano  Ciclos  Valor
FEATURE-INVENTARIO-API-20260921            $4.12   2/2    1 gate  0 reanud.  cerrado
BUGFIX-RESTAURANTE-CAJA-USUARIOS           $0.31   2/2    1 gate  0 reanud.  cerrado
BUGFIX-POS-FILTRO-ORDENES                  $1.87   3/3    2 gates 2 reanud.  cerrado ⚠
SYNC-OFFLINESYNC-COLA                      $3.40   2/2    2 gates 1 reanud.  cerrado

Costo total: $9.70   ·   Costo medio por ticket: $2.43
Tickets con más de 1 reanudación: 2 (50%)  → revisar calidad del análisis
Gate automático: 6 aprobaciones, 0 reversadas por humano  ✓
```

**Por qué importa.** Es lo que permite responder "¿esto está sirviendo?" con números. Y
detecta los tickets que se reanudan mucho, que es donde está el desperdicio real.

**Esfuerzo:** 4–5 días.

---

### B6. Plantillas de proyecto por stack

**Qué es.** `valmen init --template <stack>` con todo preconfigurado: reglas, gates, skills y
agentes apropiados.

```
django-angular-multitenant     ← extraída de SaiOpenCloud (el activo más valioso)
django-rest-api
node-typescript
angular-spa
go-service
python-cli
monorepo-turborepo
```

**Por qué importa.** SaiOpenCloud se convirtió en un proyecto con 4 años de decisiones
acumuladas. Extraer eso como plantilla significa que el siguiente proyecto con el mismo stack
arranca con ese conocimiento, en vez de desde cero.

**Esfuerzo:** 1 semana por plantilla, mucho menos para las derivadas.

---

## C. Esfuerzo alto, valor estratégico — el sistema semi-autónomo

### C1. Modo headless: ejecución desatendida

**Qué es.** El harness corre como agente propio y ejecuta tickets de bajo riesgo de punta a
punta sin intervención, dejando solo el gate de pruebas del PO.

```bash
valmen run --queue                      # toma tickets del backlog elegibles
valmen run --ticket BUGFIX-POS-...      # un ticket específico
valmen daemon                           # servicio continuo con límites
```

Elegibilidad automática, por configuración:

```yaml
autonomous:
  enabled: true
  eligible:
    types: [BUGFIX, CHORE, DOCS, IMPROVEMENT]
    max_risk: normal
    require: [plan_approved, tests_exist, no_critical_impacts]
    excluded_modules: [offline-sync, sincsaicloud, auth, deploy]
  limits:
    max_concurrent: 2
    max_per_day: 8
    budget_per_ticket: 5.00
    stop_on: [gate_blocked_twice, test_failure, secret_detected]
```

**Por qué importa.** Es el Nivel 4. Y la clave de que sea **seguro** es que la elegibilidad es
una decisión de configuración auditable, no del modelo: el agente no elige qué ticket tomar
libremente, el motor le ofrece una lista de tickets que cumplen criterios que tú definiste.

**Esfuerzo:** 3–4 semanas. Es la fase más delicada; se construye al final, con las métricas
de acierto de gates ya medidas.

---

### C2. Presupuestos adaptativos y degradación automática

**Qué es.** El sistema aprende qué tan caro sale cada tipo de trabajo y ajusta antes de
pasarse.

```yaml
budgets:
  adaptive:
    enabled: true
    learn_from: last_90_days
    per_ticket:
      BUGFIX:    { typical: 0.40, alert_at: 2.0x }
      FEATURE:   { typical: 3.80, alert_at: 2.5x }
    actions:
      at_1_5x:  notify
      at_2_0x:  degrade_routing      # implementer: opus → v4-flash
      at_3_0x:  pause_and_ask
```

**Por qué importa.** Un ticket que cuesta 5× lo típico es una señal de que algo está mal
(el plan era malo, el agente está dando vueltas, el problema era más grande). Detectarlo a
tiempo ahorra dinero y tiempo.

**Esfuerzo:** 1–2 semanas.

---

### C3. Observabilidad completa

**Qué es.** Trazas OpenTelemetry de cada sesión, dashboard con:

- Costo por hora/día/mes, por rol, por ticket, por proyecto.
- Tasa de acierto por gate y por proposición, en el tiempo.
- Distribución de duración de tickets y de ciclos de reanudación.
- Frecuencia de cada código de error (`GATE_BLOCKED`, `DEPENDENCY_CYCLE`, …).
- Tasa de uso del modo directo vs registro.
- Heatmap de archivos conflictivos.

**Por qué importa.** Un harness sin observabilidad es un harness en el que no se puede
confiar. Y es lo que hace posible el ajuste continuo de umbrales y presets basado en datos.

**Esfuerzo:** 1–2 semanas (con Grafana).

---

### C4. Servidor MCP bidireccional de primera clase

**Estado: construido en su primera mitad.** El servidor existe (`@valmen/mcp`, ejecutable
`valmen-mcp`), habla el protocolo por stdio sin dependencias, y `valmen mcp --install` lo
declara en opencode y entrega el fragmento de codex. Las ocho herramientas implementadas
—y lo que deliberadamente **no** se expone— están en `docs/02-MOTOR.md` §10.

**Lo que falta para cerrar C4** es la segunda mitad: que el harness también sea *cliente*
MCP —hablar con CodeGraph y con Hermes— y las herramientas que dependen de trabajo que
todavía no existe.

| Herramienta MCP | Qué hace | Estado |
|---|---|---|
| `crear_ticket`, `ver_ticket`, `listar_tickets`, `validar_ticket` | Ciclo de vida del ticket | **Hecho** |
| `mover_ticket`, `reanudar_ticket` | Estado y contexto para retomar | **Hecho** |
| `evaluar_compuerta`, `simular_compuerta` | Gates y calibración | **Hecho** |
| `descomponer_feature` | Features | Falta: expone `decomposeFeature` |
| `process_run` / `process_status` | Procesos | Falta: expone `runProcess` |
| `usage_report` | Costos | Falta: `valmen usage report` no existe |
| `memory_search` / `memory_save` | Memoria | Fase 6 |
| `drift_check` | Drift de artefactos | Falta |

**`gate_approve` / `gate_reject` no se van a exponer.** Estaban en esta tabla y se
descartaron a propósito: la aprobación de un gate es una decisión humana, y un agente que
pudiera tomarla convertiría el control en un trámite. La decisión vive en Mission Control y
en `valmen gate-decide`.

**Por qué importa.** Es el mecanismo que hace que el harness sea verdaderamente agnóstico:
funciona desde Claude, Codex, opencode, Cursor, Hermes o cualquier cliente MCP presente y
futuro — sin escribir un adaptador por agente.

**Esfuerzo:** 1 semana (gran parte ya diseñada).

---

### C5. Memoria persistente con grafo de conocimiento

**Qué es.** Un almacén consultable de decisiones, errores, patrones y aprendizajes, con
búsqueda semántica y vínculos a tickets y archivos.

```
$ valmen memory search "por qué usamos natural keys en sync"

  [decisión] ADR-012 · 2026-03-14
  "OfflineSync usa natural keys porque los IDs locales colisionan entre
   terminales offline. Se probó y generó duplicados en 3 tenants."
  → docs/decisions.md:412 · ticket SYNC-OFFLINESYNC-COLA-20260902

  [error] E093 · 2026-06-30
  "bulk_create sin register_bulk_sync() pierde los registros en la cola."
  → docs/errors.md:2841 · 4 tickets afectados

  [patrón] 2026-08-11
  "Los guards disable_sync_signals y skip_sync_queue deben respetarse en
   cualquier operación masiva."
  → .valmen/rules/invariantes.md
```

**Por qué importa.** Hoy tienes `docs/decisions.md` (101 KB) y `docs/errors.md` (531 KB). Son
enormes y valiosos, pero `grep` es la única forma de consultarlos y el agente no sabe cuándo
mirarlos. Con búsqueda y disparadores automáticos ("este ticket toca sync → buscar errores
conocidos de sync"), el conocimiento se usa en el momento en que importa.

**Esfuerzo:** 2–3 semanas (embeddings locales + índice).

---

### C6. Integración bidireccional con Hermes

Ver [`06-CONTROL-APP.md` §5](06-CONTROL-APP.md#5-integración-con-hermes-control-desde-el-celular).

**Esfuerzo:** 1–2 semanas.

---

## D. Ideas de mayor alcance — evaluar más adelante

| Idea | Qué aportaría | Por qué esperar |
|---|---|---|
| **Multi-proyecto / portafolio** | Un Mission Control para todos los proyectos de ValMenTech; vista de portafolio, capacidad compartida, presets globales | Necesita ≥3 proyectos adoptados |
| **Sincronización con Jira / Azure DevOps** | Tickets en ambos lados, con el harness como fuente de verdad técnica | Solo si un cliente lo exige |
| **Colaboración multi-usuario** | Servidor compartido, roles, atribución por persona, gates asignados | Hoy sos vos; añade complejidad de auth y permisos |
| **API pública + webhooks** | Que un CI externo o un cliente dispare procesos | Después de estabilizar el contrato |
| **Análisis de causa raíz automático** | Dado un error de producción, buscar tickets y errores conocidos similares y proponer hipótesis | Alto valor, necesita la memoria (C5) madura |
| **Modo "explicar el código"** | Genera y mantiene un mapa navegable del sistema, por dominio | CodeGraph ya cubre buena parte |
| **Simulación de cambios** | "¿Qué pasa si cambio este modelo?" con análisis de impacto antes de tocar | CodeGraph + criterios; valioso pero complejo |
| **Benchmarks propios de modelos** | Medir qué modelo rinde mejor en *tus* tickets, no en benchmarks genéricos | Necesita volumen de datos; muy valioso a los 6 meses |
| **Reglas vivas** | Reglas que se validan contra el código en CI y fallan si dejaron de ser ciertas | Interesante; riesgo de falsos positivos |
| **Migración asistida entre agentes** | `valmen migrate-to <agente>` que proyecta todo y valida | El MVP ya lo resuelve con `sync` |

---

## E. Lo que NO hay que construir (y por qué)

Disciplina de alcance, aprendida del error de gentle-ai (981 issues abiertos, waves de
simplificación de un subsistema que se les fue de las manos):

| Anti-feature | Por qué no |
|---|---|
| **Un agente propio de propósito general** | Ya tienes Claude, Codex, opencode. Competir ahí es perder. El harness aporta el contrato, no el loop. |
| **Un lenguaje de workflow con sintaxis propia** | YAML con expresiones es suficiente. Un DSL propio es un producto aparte y una trampa de mantenimiento. |
| **Un sistema de memoria propietario obligatorio** | Debe ser un plugin sustituible. Acoplar el producto a la memoria de un vendor es lo que hace frágil a gentle-ai. |
| **Un editor de código** | Fuera de alcance. Los archivos se editan donde el usuario quiera. |
| **Un orquestador de contenedores** | Docker ya existe. El harness lo invoca. |
| **Gates configurables por el propio agente** | Un gate que puede ampliar su autoridad no es un gate. |
| **200 paquetes** | La granularidad agresiva paga solo con escala. Se parte cuando duela. |
| **Telemetría obligatoria** | Opt-in, con preview y off por defecto. La confianza se gana, no se asume. |
| **Modo "auto aprueba todo"** | Un interruptor que desactiva todos los gates convierte el sistema en un riesgo. Si alguien quiere eso, que edite los gates uno por uno y quede registrado. |

---

## F. Priorización sugerida

Si tuviera que ordenar estas propuestas por retorno sobre esfuerzo, para tu contexto:

| Orden | Funcionalidad | Por qué ahora |
|---|---|---|
| 1 | **A1 `/pregunta`** | 2–3 días, elimina el modo de fallo más caro |
| 2 | **A6 detector de secretos** | 3–4 días, convierte una regla en un mecanismo |
| 3 | **A5 captura de aprendizajes** | El sistema mejora con el uso desde el día 1 |
| 4 | **B2 cascada verificada** | La mayor palanca de costo |
| 5 | **A2 detector de drift** | Evita ciclos completos de trabajo equivocado |
| 6 | **A4 colisiones de escritura** | Necesario antes de paralelizar en serio |
| 7 | **B4 regresiones entre tickets** | Responde directo a tu caso de bugs posteriores |
| 8 | **B1 criterios como tests** | El salto al Nivel 3 |
| 9 | **C4 servidor MCP** | Multiplica el valor de todo lo demás |
| 10 | **B3 revisión adversarial** | Sube la confianza antes de la autonomía |
| 11 | **C1 modo headless** | Nivel 4, solo con las métricas ya medidas |
