# 04 — Proveedores y routing de modelos

El pedido: *"quisiera poder usar la autenticación para cuentas con plan, ya sea Codex o
Claude, que se puedan conectar, opencode go también o DeepSeek. Y poder configurar los
proveedores, ejecutar selección de modelos y esfuerzo, o automático según el proceso. Que
pueda incluir todo tipo de modelos chinos o los comerciales de EE.UU."*

## 1. Tres formas de autenticarse

El harness no asume que tengas API keys. Asume que tienes **acceso a modelos** por
cualquiera de estas vías, y las trata como ciudadanos de primera clase.

### 1.1 Suscripción (OAuth / token de CLI)

Usa el plan que ya pagas. El harness detecta, reutiliza o lanza el flujo de login.

| Proveedor | Método | Qué se reutiliza |
|---|---|---|
| **Claude (plan Pro/Max)** | OAuth de Claude Code | Si `claude` CLI está autenticado, el vault lee el token existente. Si no, lanza el flujo en el navegador. |
| **ChatGPT / Codex (plan Plus/Pro)** | OAuth de Codex | Igual, desde `~/.codex/auth.json`. |
| **opencode go (Zen)** | Token de sesión de opencode | Igual, desde la config de opencode. |
| **GitHub Copilot** | OAuth de dispositivo | Flujo de device code. |
| **Gemini (plan Google AI)** | OAuth | Flujo en navegador. |

**Regla de convivencia:** el harness **lee** esas credenciales pero **no las reescribe ni las
rota**. Si detecta que el archivo de auth del CLI cambió, recarga. Esto evita el modo de
fallo clásico: dos herramientas peleándose por el mismo refresh token.

**Advertencia legal/operativa a documentar en el producto:** usar una suscripción de
consumo para automatización puede violar los términos del proveedor. El harness **avisa al
usuario una vez** cuando activa un provider de suscripción para uso automatizado, y ofrece
la alternativa de API key. No lo bloquea: es decisión del usuario y es su cuenta. Pero el
aviso queda registrado en el recibo de la primera ejecución.

### 1.2 API key (facturación por uso)

El camino recomendado para automatización, especialmente para gates (Jev cuesta $0.04/M).

```yaml
# ~/.valmen/.credentials.yaml — cifrado, chmod 600, nunca en el repo
version: 1
refs:
  OPENROUTER_API_KEY: "sk-or-…"
  DEEPSEEK_API_KEY:   "sk-…"
  MOONSHOT_API_KEY:   "sk-…"
  ZHIPU_API_KEY:      "…"
records:
  provider/openrouter:  { kind: api-key, ref: OPENROUTER_API_KEY }
  provider/deepseek:    { kind: api-key, ref: DEEPSEEK_API_KEY }
  oauth/claude-code:    { kind: oauth, payload: { … } }   # leído, no escrito
```

La configuración referencia **nombres de credencial**, nunca valores. Un archivo de config
compartido en git nunca contiene un secreto.

### 1.3 Local (Ollama, LM Studio, vLLM)

Para clasificación barata y gates mecánicos sin costo. Sin credenciales; se detecta en
`localhost` y se declara como provider.

## 2. Arquitectura de providers

Modelo **seam / provider / consumer**, igual que en el resto del sistema.

```
@valmen/llm                 (seam: LlmProvider, LlmTransport, ModelResolver)
@valmen/llm-openai-compat   (provider: cubre ~40 endpoints compatibles con OpenAI)
@valmen/llm-anthropic       (provider: Messages API)
@valmen/llm-google          (provider: Gemini)
@valmen/llm-jev             (provider: TypeSafe Jev / System One — NO es chat)
@valmen/auth-oauth          (seam: flujos OAuth y device code)
@valmen/auth-vault          (seam: almacenamiento de credenciales)
```

**Decisión clave:** *un* adapter `openai-compat` cubre la mayoría del mercado. Se declara
como configuración, no como código:

```yaml
# ~/.valmen/providers.yaml
providers:
  openrouter:
    transport: openai-compat
    base_url: https://openrouter.ai/api/v1
    auth: { kind: api-key, ref: OPENROUTER_API_KEY }
    capabilities: [tools, structured-output, streaming, reasoning-effort]
    models_endpoint: /models          # catálogo refrescable
    attribution: { referer: "https://valmen.local", title: "ValmenHarness" }

  deepseek:
    transport: openai-compat
    base_url: https://api.deepseek.com/v1
    auth: { kind: api-key, ref: DEEPSEEK_API_KEY }

  moonshot:                           # Kimi K-series
    transport: openai-compat
    base_url: https://api.moonshot.cn/v1
    auth: { kind: api-key, ref: MOONSHOT_API_KEY }

  zhipu:                              # GLM
    transport: openai-compat
    base_url: https://open.bigmodel.cn/api/paas/v4
    auth: { kind: api-key, ref: ZHIPU_API_KEY }

  qwen:                               # Alibaba
    transport: openai-compat
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    auth: { kind: api-key, ref: QWEN_API_KEY }

  minimax:
    transport: openai-compat
    base_url: https://api.minimax.chat/v1
    auth: { kind: api-key, ref: MINIMAX_API_KEY }

  claude-code:                        # suscripción vía OAuth
    transport: anthropic
    base_url: https://api.anthropic.com
    auth: { kind: oauth, source: claude-cli }

  codex:                              # suscripción vía OAuth
    transport: openai-responses
    base_url: https://chatgpt.com/backend-api/codex
    auth: { kind: oauth, source: codex-cli }

  opencode-zen:                       # opencode go
    transport: openai-compat
    base_url: https://opencode.ai/zen/v1
    auth: { kind: token, source: opencode-cli }

  jev:                                # NO es chat. Endpoint distinto.
    transport: systemone
    base_url: https://openrouter.ai/api
    endpoints: { decide: /alpha/decisions }
    auth: { kind: api-key, ref: OPENROUTER_API_KEY }
    role: evaluator                   # no puede ser agente

  ollama:
    transport: openai-compat
    base_url: http://127.0.0.1:11434/v1
    auth: { kind: none }
    local: true
```

Un provider nuevo del montón (cualquier endpoint compatible con OpenAI) es **30 líneas de
YAML**, no un paquete npm. Eso es lo que hace real el "todo tipo de modelos chinos o
comerciales de EE.UU.".

## 3. Catálogo de modelos y capacidades

Cada modelo declara lo que puede hacer, y el motor **falla cerrado** si se le pide algo que
no soporta.

```yaml
# Fragmento de ~/.valmen/models/catalog.yaml (generado + editable)
models:
  - id: anthropic/claude-opus-4.6
    provider: openrouter
    context: 200000
    reasoning_effort: [off, low, medium, high]
    modalities: [text, image]
    capabilities: [tools, structured-output, prompt-cache]
    pricing: { input: 15.00, output: 75.00, cache_read: 1.50 }

  - id: deepseek/deepseek-v4-flash
    provider: openrouter
    context: 1048576
    reasoning_effort: [off, low, high, max]
    capabilities: [tools, structured-output]
    pricing: { input: 0.036, output: 0.071 }

  - id: typesafe/jev-1.13
    provider: jev
    role: evaluator
    context: 32000
    capabilities: [structured-output]
    pricing: { input: 0.042, output: 0.0 }
    versions: [typesafe/jev-1.13-20260917]
```

`valmen model refresh` regenera el catálogo desde los endpoints `/models` de cada provider
activo y preserva las anotaciones manuales (precios negociados, alias internos).

## 4. Routing: modelo por rol, no por capricho

El pedido: *"con los agentes quiero que pueda ser automático, aunque para procesos
específicos como la aprobación sin humanos se seleccione y configure un modelo para que
siempre lo use — aquí por ejemplo Jev — aunque el usuario podría cambiarlo si quiere."*

Eso es exactamente un sistema de routing **por rol de workflow**.

### 4.1 Definición de roles

**Tres roles, y los tres se ejecutan.** La lista tuvo trece y se recortó a tres
después de comprobar cuáles tenían quién los consumiera de verdad: el harness los
declaraba, la pantalla los mostraba con selectores y botón de probar, y el trabajo
real lo ejecutaba el agente con su propio modelo. Una lista de trece roles donde
diez no hacen nada es peor que una de tres: parece configuración activa.

```yaml
# .valmen/routing.yaml
roles:
  # ── Los que el harness ejecuta ──
  gate-evaluator:    "Responde las proposiciones de un gate.       valmen gate"
  gate-judge:        "Resuelve un gate cuando Jev no puede decidir.  valmen gate --evaluator llm-judge"
  orchestrator:      "Propone cambios de configuración.            POST /api/chat/config"
```

**Los otros diez roles no se configuran aquí, y el motivo es estructural: el
harness no es un runtime de agentes.** Declara el proceso, guarda el estado y
evalúa compuertas, y solo puede elegir el modelo de lo que él mismo ejecuta. Explorar,
escribir y editar lo hace opencode, con su propia configuración de modelos; el
harness le dice **qué** hay que hacer y **con qué evidencia**, no con qué modelo.

Un rol declarado sin consumidor no es documentación de intención: es una promesa
que la interfaz no puede cumplir. Por eso se retiraron `spec-author`, `architect`,
`critic`, `explorer`, `implementer`, `test-author`, `doc-writer`, `verifier`,
`classifier` y `summarizer`, y hay una prueba que impide que vuelvan por descuido.

### 4.2 Resolución en cuatro capas

El modelo de un rol se resuelve con precedencia, y **la capa más específica gana**:

```
1. Override de sesión          valmen process run deploy --model gate-evaluator=kimi/k2
2. Override por proceso        .valmen/processes/deploy.yaml → steps[].model
3. Override por proyecto       .valmen/routing.yaml → roles.gate-evaluator
4. Preset global               ~/.valmen/models/presets.yaml → presets[activo].gate-evaluator
5. Default del sistema         (tabla de abajo)
```

### 4.3 Presets

Un preset es un conjunto coherente de decisiones. El usuario cambia una palabra y cambia
todo el perfil de costo/calidad.

```yaml
# Los presets que trae el harness, tal como están en packages/adapter/src/routing.ts
presets:
  quality:
    description: "Máxima calidad. Para trabajo crítico o cuando el coste no importa."
    orchestrator:   { provider: openrouter, model: openai/gpt-5.6-luna-pro, effort: high }
    gate-evaluator: { provider: openrouter, model: typesafe/jev-1.13, effort: auto }
    gate-judge:     { provider: openrouter, model: anthropic/claude-opus-4.6, effort: high }

  balanced:                                   # DEFAULT
    description: "El equilibrio por defecto: razonamiento caro donde decide, ejecución barata donde repite."
    orchestrator:   { provider: openrouter, model: moonshotai/kimi-k3, effort: medium }
    gate-evaluator: { provider: openrouter, model: typesafe/jev-1.13, effort: auto }
    gate-judge:     { provider: openrouter, model: deepseek/deepseek-v4-flash, effort: medium }

  economy:
    description: "Lo más barato que sigue funcionando. Para volumen alto y trabajo repetitivo."
    orchestrator:   { provider: openrouter, model: z-ai/glm-5.3-flash, effort: auto }
    gate-evaluator: { provider: openrouter, model: typesafe/jev-1.13, effort: auto }
    gate-judge:     { provider: openrouter, model: deepseek/deepseek-v4-flash, effort: medium }

  chino:                                      # alternativo: stack no-EE.UU.
    description: "Modelos chinos de primera línea. Coste bajo, calidad alta."
    orchestrator:   { provider: moonshot, model: kimi-k3, effort: medium }
    gate-evaluator: { provider: openrouter, model: typesafe/jev-1.13, effort: auto }
    gate-judge:     { provider: moonshot, model: kimi-k3, effort: medium }

  subscription:                               # sin coste por token
    description: "Usa los planes que ya pagas. Sin facturación por uso."
    orchestrator:   { provider: claude-code, model: opus }
    gate-evaluator: { provider: openrouter, model: typesafe/jev-1.13, effort: auto }
    gate-judge:     { provider: codex, model: gpt-5.6-terra, effort: medium }
```

Estos dos últimos son ejemplos de lo que un proyecto puede escribir, no presets que
vengan incluidos: los tres que trae el harness están arriba, y solo cubren los roles
que el harness ejecuta.

### 4.4 El rol `gate-evaluator` es especial

Por decisión de diseño, y porque fue un pedido explícito:

```yaml
gate-evaluator:
  default: { provider: jev, model: typesafe/jev-1.13 }
  rationale: >
    Jev no genera texto: emite probabilidades. Eso hace que el gate sea un conjunto de
    comparaciones numéricas que el código controla, en vez de otro prompt que hay que
    parsear. Cuesta $0.00003 por verificación, con respuesta en <600 ms.
  override: allowed          # el usuario puede cambiarlo, pero ve esta explicación
  fallback: gate-judge       # si Jev no está disponible
```

Si el usuario cambia `gate-evaluator` a un modelo de chat, el motor lo acepta, **exige un
JSON Schema de salida** y aplica el mismo contrato de umbrales sobre campos estructurados.
La calidad baja, el sistema sigue funcionando, y el recibo registra el cambio.

#### 4.4bis Qué se midió al cambiar el evaluador, y por qué el aviso es concreto

Un gate de 14 proposiciones (el gate de plan sobre un ticket con seis criterios de
aceptación), evaluado por las dos vías:

| Evaluador                     | Esfuerzo | Duración real | Coste     | Resultado |
| ----------------------------- | -------- | ------------- | --------- | --------- |
| Jev 1.13                      | —        | **0,8 s**     | $0,000158 | block     |
| `deepseek-v4-flash` como juez | auto     | **> 90 s**    | —         | timeout   |
| `deepseek-v4-flash` como juez | low      | **36,2 s**    | $0,000730 | block     |

Dos cosas que salieron de esta medición:

1. **Con razonamiento por defecto, el juez no termina.** 3 480 tokens de salida, casi todos
   de razonamiento, y el límite de 90 s se agota leyendo el cuerpo. La pantalla de modelos
   advierte de esto al elegir un modelo de chat, en vez de dejar que el usuario lo descubra
   en mitad de un gate.
2. **La latencia del recibo estaba mal medida.** Se calculaba al recibir las **cabeceras**
   —`fetch` resuelve ahí— y no al terminar de leer el cuerpo. En Jev la diferencia es de
   milisegundos y no se notaba; en un modelo que razona, el recibo decía 3 s cuando habían
   pasado 36. Corregido, y el timeout durante la lectura ahora se reporta con su límite en
   vez de como un error de transporte sin explicación.

**Jev cuesta 4,6 veces menos y tarda 45 veces menos** en el mismo gate, y además emite
probabilidades en vez de texto. Eso es lo que justifica que sea el valor por defecto en los
tres presets.

## 5. Esfuerzo de razonamiento

El esfuerzo es una capacidad **del modelo exacto**, no del provider. El motor valida antes
de cualquier I/O y falla con `UNSUPPORTED_REASONING_EFFORT` si no aplica.

```yaml
effort_policy:
  off:      "Clasificación, extracción, resúmenes mecánicos."
  low:      "Tareas mecánicas con algo de ambigüedad."
  medium:   "Implementación estándar, exploración."
  high:     "Diseño, revisión, análisis de causa raíz."
  max:      "Descomposición de features grandes, decisiones irreversibles."
  auto:     "El motor elige según el rol y el tamaño del artefacto (default por rol)."
```

`effort: auto` es lo que pediste como *"automático según el proceso"*: el motor conoce el rol
y mide el tamaño del input, y elige dentro del rango que el rol permite.

> **No implementado.** La regla de `auto` que elige según el tamaño del input es
> diseño, no código: hoy `auto` significa «no enviar preferencia de esfuerzo» y el
> valor lo decide el proveedor. La tabla de rangos describe la intención para los
> roles que se retiraron, así que se conserva como referencia de qué se pensó, no
> como contrato vigente. El único rol donde el esfuerzo importa hoy es
> `gate-evaluator`, y su valor sale del routing.

| Rol | Rango permitido | Regla de `auto` |
|---|---|---|
| `classifier` | off, low | off |
| `explorer` | off, low, medium | low |
| `implementer` | low, medium, high | medium si el plan tiene ≥5 pasos, si no low |
| `architect` | medium, high, max | high; max si la feature tiene >3 dominios de spec |
| `critic` | high, max | high |
| `orchestrator` | medium, high | medium |

## 6. Control de costo

### 6.1 Presupuesto por unidad de trabajo

```yaml
budgets:
  per_ticket:    { soft: 2.00, hard: 8.00, currency: USD }
  per_feature:   { soft: 15.00, hard: 60.00 }
  per_day:       { soft: 20.00, hard: 80.00, action: notify }
  per_gate_call: { hard: 0.05 }
```

Al cruzar el `soft`, el sistema avisa y **sugiere degradar** el routing de los roles de
ejecución. Al cruzar el `hard`, **para el trabajo automático** y pasa el ticket a
`awaiting_user_tests` con el motivo registrado. Nunca sigue gastando en silencio.

### 6.2 Trazabilidad de consumo

SaiOpenCloud ya tiene la sección `## Consumo de IA` en su esquema de tickets, con campos
para tokens, costo, modelo, esfuerzo, fuente y confianza. Se conserva **exactamente**, y
además se llena automáticamente porque ahora el harness es quien hace las llamadas:

```json
{
  "kind": "ai-usage",
  "id": "CONSUMO-004",
  "date": "2026-09-21",
  "session_reference": "sess_a3f1c9",
  "model": "typesafe/jev-1.13-20260917",
  "reasoning_effort": null,
  "input_tokens": 2841,
  "output_tokens": 31,
  "total_tokens": 2872,
  "estimated_cost_usd": 0.000135,
  "source": "Medido por el harness (OpenRouter usage.cost)",
  "confidence": "high",
  "notes": "Gate `plan` del ticket FEATURE-INVENTARIO-API-20260921."
}
```

Con `confidence: high` porque es medido, no estimado. Eso mejora un campo que hoy el
esquema admite con `low`.

### 6.3 Reporte de costo

> **No implementado.** `valmen usage report` no existe todavía. Lo que sí existe es
> la **línea de tiempo por ticket** en Mission Control y el bloque `## Consumo de IA`
> del ticket, que registran el consumo real de una sesión de agente leyéndolo de la
> contabilidad del cliente. El reporte agregado por mes y por rol es lo que falta.

```bash
valmen usage report --month 2026-09

# Por rol
#   implementer       $18.42   (412 llamadas, 8.1M in / 0.9M out)   62%
#   architect          $7.11   ( 18 llamadas, 1.2M in / 0.3M out)   24%
#   gate-evaluator     $0.09   (641 llamadas, 1.8M in)               0.3%
#   explorer           $3.98   (289 llamadas, 3.4M in / 0.2M out)   13%
#
# Por ticket (top 5)
#   FEATURE-INVENTARIO-API-20260921   $4.12   ████████████░░░░
#   cierre-presupuesto por rol:
#     implementer 40%  architect 25%  explorer 15%  ...
```

## 7. Cómo se conecta con los agentes externos

Punto importante: el harness **no reemplaza** la selección de modelo de Codex, Claude o
opencode. Convive con ella.

| Escenario | Quién elige el modelo | Cómo |
|---|---|---|
| Trabajas dentro de Claude Code | Claude Code | El harness no interviene. El routing aplica a lo que el harness ejecuta (gates, procesos, subagentes propios). |
| Trabajas dentro de Codex | Codex (perfiles en `.codex/`) | `valmen sync` genera los perfiles con los modelos de tu preset, para que Codex use lo mismo. |
| Trabajas dentro de opencode | opencode (por sesión) | El adaptador de opencode genera los agentes con `model:` del preset; opencode puede sobreescribirlo por sesión. |
| Un proceso del harness corre un subagente | ValmenHarness | Routing completo: rol → preset → override. |
| Un gate automático valida | ValmenHarness | `gate-evaluator`, por defecto Jev. |

**Regla de transparencia:** cuando el harness delega en un agente externo, registra qué
modelo usó ese agente **si puede detectarlo**, y si no, registra `confidence: low` con
`source: "No reportado por <agente>"`. Es el comportamiento honesto que el esquema de
SaiOpenCloud ya anticipa.

## 8. Integración con CodeGraph (MCP)

SaiOpenCloud ya usa el MCP de CodeGraph para no gastar tokens consultando información.
Se integra como un caso de uso de primera clase, no como un extra.

```yaml
# .valmen/config.yaml
mcp:
  servers:
    codegraph:
      command: codegraph
      args: ["mcp"]
      index_dir: .codegraph
      auto_sync: true
      tools_allow: [codegraph_search, codegraph_node, codegraph_callers,
                    codegraph_callees, codegraph_impact, codegraph_explore, codegraph_files]

knowledge:
  providers:
    - id: codegraph
      kind: graph
      # El rol `explorer` prefiere el grafo antes de grep/read iterativo.
      prefer_for: [symbol_lookup, dependency_map, impact_analysis]
      fallback: [grep, read]
      cost_note: "Consultar el grafo cuesta ~$0 vs. leer 12 archivos (~8k tokens)."
```

Y se usa en dos lugares concretos del motor:

1. **Rol `explorer`.** Antes de leer archivos, consulta el grafo. Esto es lo que baja el
   costo de la fase de análisis, que hoy es la más token-intensiva por ticket.
2. **Evaluador `mcp` de gates.** El gate `plan` puede preguntarle a CodeGraph si los
   archivos que el plan declara son realmente los que contienen los símbolos afectados.
   Eso es un check **determinista** de "el plan corresponde con la investigación", mejor
   que preguntárselo a un modelo.

```yaml
# .valmen/gates/plan.yaml — check determinista con el grafo
checks:
  - id: archivos_del_plan_son_los_correctos
    kind: mcp
    server: codegraph
    tool: codegraph_impact
    args: { symbol: "{{ticket.claimed_entrypoint}}" }
    assert: "ticket.affected_files ⊇ response.affected_files"
    on_failure: review
```

Esto responde directamente a tu requisito *"revisar si lo que se pidió originalmente
corresponde con la investigación del caso"* con un mecanismo **exacto** en lugar de
semántico, siempre que sea posible.
