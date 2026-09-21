# 99 — Referencias y hallazgos de la investigación

Resultados de la investigación que fundamenta este diseño. Todo verificado contra fuentes
primarias; se indica el nivel de confianza de cada hallazgo.

---

## 1. TypeSafe Jev 1.13 — CONFIRMADO

**Nivel de verificación:** alto. Contrato leído de la documentación oficial de OpenRouter.
No se ejecutó una llamada real (requiere API key).

### 1.1 El hallazgo más importante

Jev **no es un modelo de chat**. No aparece en `GET https://openrouter.ai/api/v1/models`
(446 modelos, cero coincidencias para "jev" o "typesafe") porque **no se invoca por
`/api/v1/chat/completions`**. Se sirve por endpoints propios:

| Endpoint | Uso |
|---|---|
| `POST https://openrouter.ai/api/alpha/decisions` | API de Decisions (alpha) |
| `POST https://openrouter.ai/api/v1/systemone` | System One API, compatible con el SDK de TypeSafe |

Para el SDK de TypeSafe: `baseURL: 'https://openrouter.ai/api'` y la API key de OpenRouter
como bearer.

### 1.2 Especificaciones

| Dato | Valor | Fuente |
|---|---|---|
| ID | `typesafe/jev-1.13` · alias `~typesafe/jev-latest` | docs OpenRouter |
| Versión concreta | `typesafe/jev-1.13-20260917` | ejemplo de respuesta |
| Precio entrada | $0.042 / M tokens | página del modelo |
| Precio salida | **$0.00** (no genera texto, emite probabilidades) | página del modelo |
| Costo por verificación | $0.00003–0.000036 medido en los ejemplos | cookbook |
| Latencia | < 600 ms | cookbook |
| Contexto | 32.000 tokens | Vercel AI Gateway |
| Privacidad | Zero-data-retention y no-training completos | Vercel AI Gateway |
| Tool calling | **No aplica.** Es un verificador, no un agente. | docs |
| Provider slug | `typesafe` (1 de 109 en `/api/v1/providers`) | API |

### 1.3 Los tres tipos de pregunta — esquema verificado contra el OpenAPI

Fuente: `https://openrouter.ai/docs/openapi/openapi.yaml`, componentes `DecisionsRequest`,
`DecisionsNoulQuestion`, `DecisionsChoiceQuestion`, `DecisionsScoreQuestion`.

```jsonc
// ── PETICIÓN ────────────────────────────────────────────────────────────────
// Claves obligatorias: model, state, questions
{
  "model": "typesafe/jev-1.13",

  // state: string | object | array  (anyOf en el spec)
  "state": { "solicitud": "…", "investigacion": "…", "plan": "…" },

  // Opcionales útiles:
  "session_id": "sess_a3f1c9",     // ≤256 chars; agrupa requests para observabilidad.
                                   // NUNCA se envía al provider. Ideal para atar el gate al ticket.
  "user": "juanandrade",           // ≤256 chars
  "provider": { },                 // ProviderPreferences: routing de proveedor
  "trace": { },                    // TraceConfig

  "questions": {

    // ── noul: probabilidad booleana ──
    "cubre_R3": {
      "type": "noul",
      "instructions": "El plan cubre el requisito R3 de la spec.",
      // criteria OPCIONAL: describe los dos polos. required: [true, false] si se usa.
      "criteria": {
        "true":  "Hay al menos un paso del plan que satisface R3.",
        "false": "Ningún paso del plan satisface R3."
      }
    },

    // ── choice: elegir una opción de un conjunto ──
    "clasificacion": {
      "type": "choice",
      "instructions": "¿Qué le falta al plan para poder aprobarse?",
      // criteria OBLIGATORIO y es un MAPA: clave = nombre de la opción,
      // valor = descripción de la opción.
      "criteria": {
        "completo":        "Cubre alcance, pasos, criterios, pruebas y rollback.",
        "falta_alcance":   "No cubre todo lo que pide la solicitud.",
        "falta_evidencia": "No define cómo se va a probar el resultado."
      }
    },

    // ── score: posición en una escala ordinal ──
    "riesgo": {
      "type": "score",
      "instructions": "¿Cuál es el riesgo de este cambio?",
      // criteria OBLIGATORIO y es un ARRAY ORDENADO de descripciones,
      // de menor a mayor. El número de nivel es la POSICIÓN (base 0).
      // minItems: 1 en el spec; la documentación recomienda ≥2 y acepta hasta 10.
      "criteria": [
        "Trivial: no toca comportamiento observable.",
        "Bajo: cambio localizado con pruebas.",
        "Medio: afecta un flujo compartido.",
        "Alto: toca datos, sync o migraciones.",
        "Crítico: irreversible para clientes en producción."
      ]
    }
  }
}
```

```jsonc
// ── RESPUESTA ───────────────────────────────────────────────────────────────
// Claves garantizadas (required en el spec): model, answers, usage
// OJO: `id` y `provider` NO son required — hay que leerlos de forma defensiva.
{
  "id": "gen-dec-1789738314-X5e5eKGQdvR9rblyX250",   // opcional
  "model": "typesafe/jev-1.13-20260917",             // la versión CONCRETA resuelta
  "provider": "TypeSafe",                            // opcional
  "answers": {
    "cubre_R3":      { "type": "noul",   "noul": 0.94 },
    "clasificacion": { "type": "choice", "choice": "falta_alcance",
                       "confidence": 0.64,
                       "probabilities": { "completo": 0.31, "falta_alcance": 0.44 } },
    "riesgo":        { "type": "score",  "score": 2.4,      // ← double, puede caer ENTRE niveles
                       "confidence": 0.71,
                       "probabilities": { }, "legend": { } }
  },
  "usage": { "input_tokens": 275, "output_tokens": 20, "cost": 0.00003 }
}
```

**Campos requeridos y opcionales, por tipo:**

| Esquema | Requeridos | Opcionales |
|---|---|---|
| `DecisionsNoulQuestion` | `type`, `instructions` | `criteria` (con `true` y `false` ambos requeridos si se usa) |
| `DecisionsChoiceQuestion` | `type`, `instructions`, `criteria` (mapa) | — |
| `DecisionsScoreQuestion` | `type`, `instructions`, `criteria` (array, minItems 1) | — |
| `DecisionsNoulAnswer` | `type`, `noul` | — |
| `DecisionsChoiceAnswer` | `type`, `choice` | `confidence`, `probabilities` |
| `DecisionsScoreAnswer` | `type`, `score` | `confidence`, `probabilities`, `legend` |
| `DecisionsResponse` | `model`, `answers`, `usage` | `id`, `provider` |

`instructions` y los valores de `criteria` aceptan **string, objeto o array** (`anyOf`), lo
que permite guía estructurada cuando una descripción plana no alcanza. `score` es un
`double`, no un entero: **el modelo puede devolver 2.4**, y el motor debe decidir cómo
redondear o si tratar la banda intermedia como ambigua.

### 1.4 El error que corregí en el diseño

Mi primera versión del diseño de gates tenía el esquema de `score` **mal**: usaba
`legend: { 0: '…', 1: '…' }` en la *pregunta*. Eso no existe. Lo correcto es:

- En la **pregunta**: `criteria` es un **array ordenado** de descripciones.
- En la **respuesta**: `legend` aparece como campo **opcional** del answer, no se envía.

También faltaba que `noul` acepta `criteria` con los dos polos, que es la forma de
desambiguar una proposición que de otro modo quedaría ambigua.

### 1.5 Formato de la petición y la respuesta (verbatim de la documentación)

```bash
curl https://openrouter.ai/api/alpha/decisions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "typesafe/jev-1.13",
    "state": { "policy": "…", "ticket": { … }, "refund": { … } },
    "questions": {
      "customer_asked": { "type": "noul", "instructions": "…" }
    }
  }'
```

```json
{
  "id": "gen-dec-1789738314-X5e5eKGQdvR9rblyX250",
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": { "customer_asked": { "type": "noul", "noul": 0.98 } },
  "usage": { "input_tokens": 275, "output_tokens": 20, "cost": 0.00003 }
}
```

### 1.6 Citas que definen el diseño de nuestro gate

> *"Jev fits here because it doesn't generate text. It reads the state you give it and
> returns a probability per question, so the gate is a few numeric comparisons your code
> controls rather than another prompt to parse."*

> *"Each proposition is complete on its own and is either true or false of the state. Don't
> ask 'should this refund be approved'. That's the decision your code makes in step 3, and
> splitting it into named checks is what gives you a reason for every block and a readable
> audit record."*

> *"The thresholds are deliberately far apart so the human reviews only calls with
> probabilities in the middle."*

> *"After a few weeks of real traffic, look at which `review` decisions the human approved
> and which they rejected. If nearly all were approved, the ambiguity is in your policy text,
> and tightening the wording moves those cases to `approve` without touching the
> thresholds."*

> *"Store the whole `GateDecision` with the ticket. `reason` and `checks` are the audit record
> for the outcome."*

### 1.7 Advertencias

- **La API de Decisions está en `/api/alpha/`.** Es alpha. Tratar como dependencia con riesgo
  de breaking changes. Mitigación: fail-closed + seam intercambiable + smoke test diario.
- Con `@openrouter/sdk` hay que instanciar un cliente aparte con `serverURL:
  'https://openrouter.ai'`; el base URL por defecto no sirve para esa ruta.
- **Reproducibilidad:** repetir la misma llamada movió las probabilidades hasta 0.08 (ejemplo
  oficial: `policy_covers` de 0.35 a 0.43 en cuatro repeticiones), pero el resultado
  (`approve`/`block`/`review`) se mantuvo. Es la razón de tener umbrales bien separados.
- No se confirmó explícitamente soporte de instrucciones en español. Hay que probarlo en la
  primera llamada real.

### 1.8 Modelos sustitutos si Jev falla (evaluadores de chat con salida estructurada)

| Modelo | Precio in/out (por M) | Contexto | Nota |
|---|---|---|---|
| `deepseek/deepseek-v4-flash` | $0.036 / $0.071 | 1.048.576 | Mejor relación costo/contexto |
| `openai/gpt-oss-20b` | $0.030 / $0.130 | 131.072 | Peso abierto, Apache 2.0 |
| `qwen/qwen3-30b-a3b-instruct-2507` | $0.048 / $0.193 | 262.144 | Modo no-thinking = más determinista |
| `openai/gpt-5-nano` | $0.050 / $0.400 | 400.000 | Mejor instruction-following barato |
| `z-ai/glm-4.7-flash` | $0.061 / $0.400 | 200.000 | Optimizado para agentic coding |

Todos soportan `response_format` con JSON Schema estricto, que es lo que necesita el
evaluador `llm-judge` para respetar el mismo contrato de umbrales.

### 1.9 URLs

**Evidencia primaria — especificación de la API:**
- https://openrouter.ai/docs/openapi/openapi.yaml ← **el OpenAPI oficial**; esquemas
  `DecisionsRequest`, `DecisionsNoulQuestion`, `DecisionsChoiceQuestion`,
  `DecisionsScoreQuestion` y sus respuestas. Es la fuente del §1.3.
- https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request
- https://openrouter.ai/docs/client-sdks/typescript/sdks/systemone/README
- https://openrouter.ai/docs/client-sdks/python/sdks/decisions/README
- https://openrouter.ai/docs/llms.txt ← índice completo de la documentación

**TypeSafe — documentación del modelo:**
- https://docs.typesafe.ai/introduction
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/primitives/score
- https://docs.typesafe.ai/primitives/noul
- https://docs.typesafe.ai/confidence
- https://docs.typesafe.ai/patterns/composite-scoring

**OpenRouter — recetas y precios:**
- https://openrouter.ai/typesafe/jev-1.13
- https://openrouter.ai/docs/cookbook/building-agents/gate-tool-calls-with-jev
- https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-verified-cascade
- https://openrouter.ai/docs/guides/community/typesafe-sdk
- https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway

**Hermes (fuente del §5 de [`06-CONTROL-APP.md`](06-CONTROL-APP.md)):**
- https://openrouter.ai/docs/cookbook/coding-agents/hermes-integration
- https://github.com/NousResearch/hermes-agent

---

## 1bis. Estado de verificación de este diseño

Para que se sepa qué está comprobado y qué no, sin tener que confiar en esta narrativa:

| Afirmación del diseño | Nivel | Cómo se verificó |
|---|---|---|
| Jev existe y es accesible en OpenRouter | **Confirmado** | Página del modelo + provider `typesafe` en `/api/v1/providers` |
| El endpoint es `/api/alpha/decisions`, no chat completions | **Confirmado** | OpenAPI oficial + cookbook |
| Esquema exacto de `noul` / `choice` / `score` | **Confirmado** | OpenAPI oficial, componentes leídos línea por línea |
| Precio $0.042/M entrada, $0 salida | **Confirmado** | Página del modelo + Vercel AI Gateway |
| `usage.cost` viene en la respuesta | **Confirmado** | OpenAPI (`DecisionsResponse.usage.cost`) |
| `session_id` permite atar la request a un ticket | **Confirmado** | OpenAPI (`DecisionsRequest.session_id`) |
| Latencia < 600 ms y costo ~$0.00003 | **Documentado** | Ejemplos del cookbook; no medido por nosotros |
| Estabilidad de las bandas de umbral | **Documentado** | El cookbook reporta ±0.08 de variación en la probabilidad; el outcome se mantuvo |
| Soporte de instrucciones en español | **SIN VERIFICAR** | Requiere llamada real |
| Que el endpoint responda hoy con nuestra cuenta | **SIN VERIFICAR** | Requiere API key de OpenRouter |
| Que `~typesafe/jev-latest` resuelva al modelo esperado | **Documentado** | El alias existe; la resolución concreta no se probó |
| Auditoría de SaiOpenCloud (57 tickets, 13 skills, 12 agentes ×2) | **Confirmado** | Inspección directa del repositorio |
| Arquitectura de DSH (plugins, composición, event sourcing) | **Confirmado** | Inspección directa de los 241 paquetes instalados |
| gentle-ai: ODD/SDD/RDD, 373k líneas, 981 issues | **Confirmado** | Clon del repositorio + API de GitHub |
| Hermes: 21+ plataformas, config, modelos auxiliares | **Confirmado** | Documentación de OpenRouter + repo de Nous Research |
| Estimaciones de esfuerzo y costo del roadmap | **Estimación** | Criterio propio, sin datos históricos de construcción |

**Las tres verificaciones pendientes se resuelven con una llamada y una instalación.**
Ninguna bloquea el MVP (Fases 1–2), que **no depende de Jev en absoluto** — eso fue
deliberado: el valor inmediato es la unificación de configuración, y el gate automático es
una mejora posterior que se activa cuando esté probado.

---

## 2. gentle-ai — SDD, ODD y RDD

**Nivel de verificación:** alto. Clon superficial del repositorio e inspección directa de
2.301 archivos versionados.

### 2.1 Corrección importante de la premisa

Las siglas no significan lo que se suponía:

| Sigla | Significado real | Qué es |
|---|---|---|
| **ODD** | **Organic Driven Development** | El flujo por defecto, 7 pasos, un único documento de feature |
| **SDD** | **Spec-Driven Development** ✅ | Rama *opt-in* con 10 fases y artefactos formales |
| **RDD** | **Receipt-Driven Development** | Revisión adversarial sobre candidato congelado, activa por defecto |

Y **no es un pack de prompts**: es un binario Go (~373k líneas en `internal/`, 1.267
archivos `.go`, 773 de test) que actúa como motor determinista de estado + configurador de
16 agentes. MIT. v3.4.0. 7.067 estrellas, **981 issues abiertos**.

### 2.2 ODD — el protocolo de 7 pasos

De `internal/components/agentguidance/routing.go`, inyectado **incondicionalmente en los 16
agentes**:

```
1. Authorize.       ¿El pedido autoriza explícitamente un cambio? Investigar, explicar,
                    revisar, auditar, comparar y proponer son read-only.
2. Explore.         Explorar el código y los requisitos, proporcionalmente al pedido.
3. Resolve          Recomendar investigación solo para una incertidumbre nombrada;
   uncertainty.     preguntar una cosa enfocada solo por una decisión de producto real.
4. Classify.        Es sustancial cuando la exploración revela 2+ pasos de implementación
                    significativos, o progreso que valga recuperar tras una interrupción.
5. Track before     Para implementación sustancial, crear odd/tasks/<feature>.md ANTES de
   the first write. la primera escritura, sin pedir permiso para registrarlo.
6. Implement        Cada tarea cierra con al menos un commit-unidad en la rama de feature,
   task by task.    con tests y docs junto al comportamiento.
7. Close.           Reportar el resultado verificado, cada check fallido/omitido/pendiente,
                    y el siguiente paso.
```

**Los gates ODD, que son lo más valioso que aporta:**

- **Regla de 4 archivos** → delegar la exploración si entender requiere 4+ archivos.
- **Writer trigger** → delegar 1 writer si se tocan 2+ archivos no triviales.
- **Backstop de sesión larga** → tras ~20 tool calls, 5 lecturas exploratorias o 2 ediciones
  no mecánicas sin delegar, pausar y delegar.
- **Heurística de ~400 líneas por tarea** — explícitamente **no** es un cap: *"not a task
  acceptance criterion, hard cap, counter-trigger, automatic stop, forced split, or RDD
  trigger"*; prohibido minificar u omitir tests para cuadrar.

### 2.3 SDD — las fases y los artefactos

```
Explore → [Research] → Propose → (aprobación humana) → Spec → Design → Tasks
        → Apply → [Verify] → Archive → política del repositorio
```

Estructura en disco:

```
openspec/
├── config.yaml
├── specs/{domain}/spec.md                    ← fuente de verdad
└── changes/
    ├── archive/YYYY-MM-DD-{change}/
    └── {change}/
        ├── state.yaml        (pista de recuperación; puede tener dependsOn)
        ├── exploration.md    (opcional)
        ├── research.md       (opcional)
        ├── proposal.md
        ├── specs/{domain}/spec.md   ← delta spec
        ├── design.md
        ├── tasks.md
        └── verify-report.md
```

**Gates SDD concretos, todos adoptados en el diseño:**

1. **Native SDD Dispatcher Guard.** El comando `sdd-status` es la **única autoridad de
   estado**. No re-derivar, no reconstruir readiness. Rutar solo por `nextRecommended`;
   `blockedReasons` no vacío ⇒ parar.
2. **Edit Authority Consent.** Si `tasks.md` referencia paths fuera de `allowedEditRoots`,
   `applyState: blocked` con un envelope tipado de dos opciones (`granted`/`declined`). El
   humano decide; **el agente nunca ejecuta el grant sin respuesta explícita**.
3. **Automatic Mode Gatekeeper.** Tras cada fase valida contrato + **existencia real del
   artefacto (read-back)** + no-alucinación de paths + no-drift. Falla ⇒ **exactamente un
   reintento correctivo**; segunda falla ⇒ parar y reportar.
4. **Review Workload Forecast.** Líneas de texto **literales** para que un guard determinista
   las parsee sin LLM:
   ```text
   Decision needed before apply: Yes|No
   Chained PRs recommended: Yes|No
   Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
   400-line budget risk: Low|Medium|High
   ```
   *"The plain-text lines are the guard contract."*
5. **Mechanical Copy Contract.** Verbatim:
   > *"File content MUST NEVER pass through the model's Read/Write path to be copied — a
   > model that summarizes, truncates, or alters even one byte while reporting success
   > corrupts the audit trail silently. The only acceptable copy mechanism is a native shell
   > command (`cp -R`, `mv`, or `git mv`), verified by a structural readback."*
   >
   > *"An empty `diff -r` (no differences) is the only passing evidence… A skipped or missing
   > `diff -r` also FAILS the phase — agent self-report is never sufficient."*
6. **Distinción `blockedReasons` vs `notes`:**
   > *"`notes` is a separate, always-present array of informational diagnostics. A non-empty
   > `notes` NEVER blocks anything… `blockedReasons` stays reserved for genuine blockers."*
7. **Envelope de retorno de subagente** y la regla de la última acción:
   > *"Your FINAL output MUST be text (the return envelope), NOT a tool call… When a
   > sub-agent's last action is a tool call, the parent agent receives only the tool result —
   > your text response (the actual analysis) is lost."*

### 2.4 Formato de las delta specs (adoptado)

```markdown
## ADDED Requirements
### Requirement: Registro de movimientos
El sistema MUST registrar cada entrada, salida y ajuste con fecha, usuario,
sucursal, producto, cantidad y motivo.

#### Scenario: Entrada por compra
- GIVEN un producto existente en la sucursal activa
- WHEN se registra una entrada de 10 unidades
- THEN el saldo aumenta en 10

## MODIFIED Requirements
(copiar el bloque COMPLETO del requisito + todos sus escenarios,
 porque el archive reemplaza el bloque entero)

## REMOVED Requirements
### Requirement: Ajuste manual sin autorización
(Reason: reemplazado por el flujo de aprobación)
```

### 2.5 RDD — Receipt-Driven Development

Ciclo: `STATUS → START (congela candidato) → captura ligada por tokens → approved +
acknowledgement → burn → política del repositorio`.

- **Profundidad por riesgo congelado**, no por juicio del modelo: `passive` ⇒ 0 lentes ·
  `medium` ⇒ 1 lente · `high` ⇒ **4R canónico: Risk, Resilience, Readability, Reliability**
  + refutador + validador dirigido.
- **Una sola corrección acotada** por candidato inmutable. Sin bucles "hasta que esté limpio".
- El cierre **quema la autoridad**: ningún recibo autoriza delivery.

### 2.6 Lo que se descarta y por qué

| Descartado | Razón |
|---|---|
| El monolito Go de 373k líneas | Nuestro alcance es mucho menor; replicar la escala sería un error. |
| La dependencia de Engram | Memoria de un vendor como default. Debe ser un plugin sustituible. |
| La maquinaria de RDD | `internal/cli` con 325 archivos, auditorías de 132 KB, oleadas de simplificación ("wave6/wave7"). Señal de que el subsistema se les fue de las manos. |
| El vocabulario denso | El orquestador genérico tiene 439 líneas. El propio agente se pierde; por eso necesitan un gatekeeper. |
| 230 paquetes | Granularidad que paga solo con su escala. Empezamos con 20. |
| Telemetría opt-out con colector propio | Opt-in, con preview, off por defecto. |

### 2.7 Fuentes

- https://github.com/Gentleman-Programming/gentle-ai
- `internal/components/agentguidance/routing.go` (el protocolo ODD)
- `internal/assets/skills/_shared/sdd-status-contract.md` (el contrato de estado)
- `internal/assets/skills/_shared/sdd-phase-common.md` (el envelope de fase)
- `internal/assets/skills/sdd-archive/SKILL.md` (el contrato mecánico de copia)
- `AI_POLICY.md`, `docs/trigger-rules.md`, `docs/review-integration.md`

---

## 3. DeepSeek Harness (DSH) — patrones de arquitectura

**Nivel de verificación:** alto. Inspección directa de 241 paquetes instalados.

### 3.1 Los tres patrones que se adoptan

**a) Composición declarativa por capas.** Todo el producto es un árbol de filas YAML
(`dsh-base/cordis.patch.yml`, 487 líneas) con bundles de superficie encima. Orden:
bundles → parche del perfil → parche del home → overlays `--patch`. Último gana por fila.

> Semántica que hay que documentar desde el día uno (lección aprendida): **un parche
> REEMPLAZA el bloque `config` completo, no hace merge profundo.** Hay que reafirmar todos
> los campos que se conservan.

**b) Seam / Provider / Consumer.** Contrato sin sufijo; implementaciones con sufijo por
tecnología (`-local`, `-jsonl`, `-sqlite`, `-worker-thread`, `-in-process`). Se repite ~15
veces y es lo que explica por qué 230 paquetes no son una maraña. Permite cambiar LLM,
persistencia, sandbox y ejecución de workflows sin tocar consumidores.

**c) "Model-visible ⟺ logged".** Verbatim del informe:
> Event sourcing con **surface derivada**: el historial del modelo es una proyección del log
> append-only, nunca un dato almacenado aparte. Las peticiones se congelan (`deep-freeze`)
> antes del dispatch y nunca se reescriben.

Consecuencia: replay exacto, fork barato, compactación no destructiva, auditoría completa.
*"Es barato si se decide al principio y carísimo de retrofitear."*

### 3.2 Otros patrones con valor directo

| # | Patrón | Aplicación en ValmenHarness |
|---|---|---|
| 1 | Fail-loud en arranque, fail-soft en runtime | Config inválida al boot ⇒ no arranca con línea etiquetada. Edición inválida en caliente ⇒ conserva la última buena y avisa. |
| 2 | Compare-and-set con `expectedRevision` | Las escrituras concurrentes fallan explícito en vez de pisarse. |
| 3 | Códigos de error estables, enrutado por código | Mensajes localizables sin romper la lógica. |
| 4 | Formatos en disco versionados en el nombre (`session.v3.jsonl.zstd`) | El formato de tickets y recibos lleva versión y migraciones adyacentes. |
| 5 | Contadores de tokens **disjuntos** (input sin cachear; cacheRead/cacheWrite aparte) | Evita el error clásico de doble conteo en el reporte de costos. |
| 6 | "Durable antes de esperar" | Los eventos de reintento/planificación se escriben antes de dormir. Un crash no deja trabajo invisible. |
| 7 | Conformance suites compartidas | Un backend nuevo se valida contra el contrato, no contra el implementador anterior. |
| 8 | Invariantes de runtime como companions `./invariant` por paquete | Autodiagnóstico de composiciones vivas. |
| 9 | Plantilla de documentación de paquete fija (Resumen / Uso / Contrato / **Model Experience** / Limitaciones) | Lo que hace navegable un monorepo. Se replica desde el primer paquete. |
| 10 | `--dump-config` con comentarios de procedencia | Saber de qué capa vino cada valor. Muy útil para depurar routing. |

### 3.3 Lo que se descarta

- El framework `cordis` (Dependency Injection con fibers): potente pero es un runtime
  completo. Nuestro motor es mucho más pequeño; se usa inyección explícita por constructor.
- La granularidad de 230 paquetes.
- `window.__DSH_BOOT__` y el modelo lazy-CJS: es la solución de DSH a un problema de escala
  de plugins de navegador que nosotros no vamos a tener. Nuestra web usa Vite estándar.
- El acoplamiento a un solo proveedor LLM.

### 3.4 Rutas de referencia (para consultar después)

```
<DSH>/dsh-base/cordis.patch.yml          ← el fichero clave de composición
<DSH>/dsh-llm/lib/types/index.d.ts       ← LlmAdapter, registerAdapter
<DSH>/dsh-llm/lib/types/types.d.ts       ← GenerateOptions, ContentBlockMap, TokenUsage
<DSH>/dsh-session/lib/types/surface.d.ts ← el modelo de surface derivada
<DSH>/dsh-session-projection/README.md   ← el contrato de proyecciones
<DSH>/dsh-tool-todo/lib/types/index.js   ← mejor ejemplo mínimo de plugin
<DSH>/dsh-settings/README.md             ← resolución en 3 capas con compare-and-set
<DSH>/dsh-credentials/README.md          ← credenciales por referencia, nunca por valor
<DSH>/dsh-spill-policy/README.md         ← presupuesto de contexto en cadena
```

---

## 4. SaiOpenCloud — auditoría del flujo actual

**Nivel de verificación:** alto. Lectura directa del repositorio.

### 4.1 Las decisiones de diseño que se preservan (y por qué)

| Decisión | Por qué funcionó |
|---|---|
| Frontmatter YAML **restringido** | El CLI usa solo la stdlib de Python. No puede fallar por una construcción YAML inesperada. |
| Bloques JSON *fenced* append-only | El agente añade, nunca reescribe. Garantía de auditoría. |
| `POINT-NNN` inmutable y monótono, máximo 20 | Una lista de hallazgos no se convierte en tickets nuevos ni pierde historia. |
| **Tres máquinas de estado separadas** | Confundir "cerrado" con "publicado" es el error clásico. |
| No existe `completed` | Es ambiguo. Se usan estados con salida obligatoria verificable. |
| `approved` siempre se conserva | Si el gate no era exigible, el plan registra la razón. |
| SHA de 40 caracteres o `worktree:sha256:` | Referencia inmutable al artefacto probado. |
| Reapertura `closed → changes_requested` solo si `unreleased` | Un bug posterior a la release es un ticket nuevo con `related_ticket`. |
| Routing de modelo como **recomendación, nunca autoridad** | *"Un routing de modelo nunca concede autoridad ni sustituye un gate."* |

### 4.2 El CLI actual

```bash
python3 tools/agentic/ticket.py \
  {create,validate,add-point,transition,release-publish,qa-start,qa-close,
   add-evidence,add-retest,close-attempt,add-ai-usage,index,active,resume}
```

2.171 líneas. Regenera `docs/tickets/index.md` después de cada mutación.

### 4.3 La deuda real medida

| Deuda | Magnitud |
|---|---|
| `AGENTS.md` como fuente de verdad, con `CLAUDE.md` legado al lado | 2 fuentes, 1 marcada legado |
| 12 agentes duplicados en `.codex/agents/*.toml` y `.opencode/agents/*.md` | 24 archivos, 1 divergencia ya detectada |
| `.claude/drafts/` | 989 archivos |
| `.claude/*-backup-*/` | 4 directorios |
| `.claude/telemetry.jsonl` | 142 KB sin uso declarado |
| `.claude/reasoning_bank.sqlite` | 331 KB |
| Sin entidad "feature" | Bloquea el trabajo grande |
| Gates 100% humanos | Cuello de botella |
| `## Consumo de IA` con `confidence: low` | No medido |
| `CLAUDE.md` referencia `docs/claudio-backlog.json`, `docs/claudio-status.md` y comandos `claudio` | Ya no existen |
| `CLAUDE.md` dice `django-tenant-schemas`; el código usa `django-tenants` | Documentación desactualizada |

---

## 5. Contraste de los tres orígenes

| Dimensión | gentle-ai | SaiOpenCloud | DSH | ValmenHarness |
|---|---|---|---|---|
| Qué es | Binario Go de 373k líneas | Config + CLI Python en un repo | Harness TS de 230 paquetes | Producto instalable multi-proyecto |
| Alcance | 16 agentes, muy amplio | 1 proyecto, muy profundo | 1 producto, 1 proveedor | Multi-proyecto, multi-proveedor |
| Estado | En disco, motor determinista | En archivos `ticket.md` | Event log + proyecciones | Archivos canónicos + índice derivado |
| Gates | SDD con consentimiento | 100% humanos | Permisos y aprobación one-shot | Declarativos, humanos o Jev |
| Workflow grande | SDD con OpenSpec | **No tiene** | Goals y workflows JS | **Features con spec y descomposición** |
| Revisión | RDD con candidato congelado | Skill de revisión final | — | Adversarial por riesgo |
| Extensión | Adaptadores por agente | Skills | Plugins por DI | Skills · tools · procesos · plugins |
| GUI | TUI en Go | Visor HTML local | Web con plugins de cliente | Mission Control |
| Madurez | Alta ingeniería, baja estabilización (981 issues) | Probada en producción, 1 proyecto | Release candidate | Por construir |

**El diferencial de ValmenHarness** es la intersección: la disciplina de evidencia de
gentle-ai, la pragmática de tickets de SaiOpenCloud, la arquitectura componible de DSH, y el
gate automático auditable con Jev — que ninguno de los tres tiene.
