# Auditoría ValmenHarness — 26 de septiembre de 2026

> Qué está hecho, qué falta, qué está frenando los tickets, y hacia dónde va.
> Todo lo numérico sale del registro real de SaiOpenCloud, no de estimaciones.

---

## 1. Estado del harness — qué está hecho y qué está sin commitear

### Construido y funcionando (verificado en disco)

| Pieza | Dónde | Estado |
|---|---|---|
| Motor de tickets con máquina de 3 estados independientes | `packages/engine`, `packages/core` | ✅ 93 tickets reales operados |
| Gates mecánicos + evaluación Jev + escalado humano | `packages/gate*` | ✅ con recibos append-only |
| Servidor MCP — 38 herramientas, ciclo completo del ticket | `packages/mcp` | ✅ conectado a Hermes y opencode |
| Memoria léxica (decisions.md + errors.md + aprendizajes) | `.valmen/memory/` | ✅ 240 entradas indexadas en SaiOpenCloud |
| Estándares con propuesta/decisión humana | `ver/proponer/decidir_estandar` | ✅ 2 aceptados ayer (pantalla de factura) |
| Detector de secretos propio | `packages/engine/secrets.ts` | ✅ en gates y en `valmen secrets` |
| Puente Hermes: notify, brief, gate-decide con token HMAC | `valmen hermes *` | ✅ con techo de riesgo por código |
| Mission Control (app web + tablero) | `packages/server` | ✅ operativo |
| Consumo de IA medido por ticket | `registrar_consumo_ia` | ✅ 81 tickets cerrados con consumo declarado |
| Plantilla `django-angular-multitenant` | `templates/` | ✅ primera plantilla lista |
| Feature: descomponer → materializar → anexar | `packages/engine/features.ts` | ✅ la última pieza **sin commitear** |

### Sin commitear en el harness (15 archivos, +689 líneas, 2 tests nuevos)

Trabajo del 25-sep que resuelve un caso real (la pantalla de factura acumuló más de 20 hallazgos y el tope de puntos obligaba a abrir tickets huérfanos):

1. **`anexar_ticket_a_feature`** — engine + MCP + CLI + botón en Mission Control. Un ticket nacido fuera del grafo entra a su feature sin tocar su estado.
2. **Tope de puntos 20 → 100** — divergencia deliberada de `ticket.py`, documentada en `tests/puntos.test.ts`.
3. Tests: `tests/anexar-a-feature.test.ts`, `tests/puntos.test.ts`.

**Acción: listo para commit cuando lo autorices.** No hay nada roto; es funcionalidad nueva con sus pruebas.

---

## 2. Por qué los tickets "sencillos" demoran — el diagnóstico con números

Medí los 93 tickets del registro. Los gates y el flujo cuestan centavos y segundos. El costo está en otro lado:

| Síntoma | Evidencia | Causa raíz |
|---|---|---|
| Un ticket de congruencia de UI (13 puntos) consumió **8.7M tokens de entrada** | 11 sesiones de opencode registradas | Cada reanudación re-lee el ticket completo + historial |
| La pantalla de factura acumuló **21 sesiones** entre feature y mejoras | 3.8M + 8.7M + 1.5M tokens | La UI se descubre probándola: cada ciclo PO→punto→corrección paga el contexto entero otra vez |
| Un bugfix acotado (cobranza) cerró con **39K tokens** | 2 sesiones, 0 puntos | Diagnóstico claro → plan → una línea → tests. El flujo completo funcionó en minutos |
| Gaps de 55 minutos dentro de un ticket | eventos del ticket de congruencia | Espera de pruebas del PO entre ciclo y ciclo — no es el agente, es el retest humano |

**Conclusión: no es el flujo de gates ni la ejecución de opencode por separado. Es la combinación de (a) pantallas grandes donde los hallazgos llegan por tandas y (b) cada reanudación pagando el contexto completo.** Un bugfix con causa clara fluye en minutos y centavos; una pantalla que se descubre probándola multiplica sesiones.

### La palanca más barata (Ola 1 de la hoja de ruta)

`reanudar_ticket` hoy entrega el documento entero. Con un resumen estructurado (estado, plan, puntos abiertos, último recibo, instrucción de leer secciones bajo demanda), el ticket de 8.7M tokens pasa a una fracción **desde el primer día, sin tocar ningún gate**. Después: cascada verificada (B2) y presupuestos adaptativos (C2).

---

## 3. Respuestas concretas a tus decisiones

### ¿Otro perfil de Hermes para el harness?

**No hace falta crearlo ya.** El patrón multiproyecto con lo que existe hoy es:

```
proyecto nuevo → valmen adopt (una tarde) → mcp_servers.valmen-<proyecto> en el perfil → listo
```

El perfil `saiopencloud` ya demuestra que funciona (`valmen-saicloud` con `cwd` fijo + hook `valmen-decide.py`). Para el propio ValmenHarness la pregunta no es de perfil sino de proceso: hoy trabaja en "modo directo" por decisión escrita en su AGENTS.md. **Mi recomendación: adoptarlo como segundo proyecto con gates reales** — es la mejor prueba de que la adopción toma menos de una tarde, y le da al harness su propio registro auditable. Lo montamos cuando digas.

### Playwright en el MCP

No entra como herramienta MCP nueva. Entra como **un tercer verbo en los criterios de aceptación**:

```markdown
- [ ] La factura manual calcula el ICO al agregar el producto
      <!-- test: playwright tests/pos/creacion-manual.spec.ts -->
```

El gate mecánico lo ejecuta (prefijo autorizado en `test-commands`, mismo mecanismo que hoy), el video/traza queda como evidencia del recibo, y el PO decide por ticket si lo quiere. **Cero modelo en el camino crítico, cero cambios en la máquina de estados.** El Playwright MCP interactivo sirve para explorar y grabar el test; lo que entra al gate es el test guardado en el repo.

### Manuales del sistema + RAG

El proceso de SaiOpenCloud (`PROCESO-MANUALES.md`) es mejor que lo que proponen la mayoría de herramientas comerciales — no se reinventa, se **integra**:

1. El paso 6 del deploy (`manuales`) ya está diseñado en el recorrido: detectar pantallas tocadas por los tickets de la release → marcar desactualizados → regenerar `.md` con esa metodología → auditar con citas al código → PDF.
2. Los `.md` quedan como fuente de verdad (portal y PDF son proyecciones).
3. El RAG es el paso siguiente natural: manuales + `decisions.md` + `errors.md` + tickets cerrados, todos en markdown versionado. Un indexador a una base vectorial (pgvector o Qdrant local) y un agente "pregúntale al sistema" que responde con cita al documento. La memoria léxica actual ya resolvió la mitad del problema sin embeddings — el RAG la complementa, no la reemplaza.

---

## 4. Entregables de esta auditoría

| Archivo | Qué es |
|---|---|
| `docs/auditoria-20260926/flujo-mcp.html` | **Mapa gráfico del flujo de un ticket**, de punta a punta, con quién decide y qué cuesta cada paso |
| `docs/auditoria-20260926/estado-y-tiempos.html` | Dashboard del estado medido: números, tickets más caros, hallazgos |
| `docs/auditoria-20260926/hoja-de-ruta.html` | Las 5 olas propuestas, ordenadas por retorno/esfuerzo |
| `docs/auditoria-20260926/mercado-y-calificacion.html` | Calificación del MCP (8/10), 12 competidores en 4 categorías con precios, las 10 capacidades para ser vendible, modelo open-core y riesgos |

### Fuentes de la investigación de mercado

devin.ai/pricing · factory.com/pricing · docs.github.com/copilot (planes y billing) · cursor.com/pricing · coderabbit.ai/pricing · greptile.com (vs CodeRabbit) · linearb.com (pricing 2026) · swarmia (comparativa) · linear.app/integrations/agents · github.com/langchain-ai/langgraph · github.com/crewAIInc/crewAI · openhands (SaaS with Alex / aicoderscope)

---

## 5. Calificación adelantada del MCP (la versión completa llega con el análisis de mercado)

| Dimensión | Nota | Comentario corto |
|---|---|---|
| Contrato y completitud | 9/10 | El ciclo entero del ticket sin terminal; lo que no se expone (aprobar gates) está ausente **a propósito** |
| Diseño de seguridad | 9/10 | La aprobación nunca viaja por MCP; techo de riesgo en código, no en configuración |
| Costo de operación | 9/10 | Gates mecánicos $0, Jev $0.0001; el gasto real está en las sesiones de desarrollo, no en el harness |
| Ergonomía del agente | 7/10 | `reanudar_ticket` entrega demasiado contexto — es la mejora #1 identificada |
| Multiproyecto | 6/10 | Funciona por `cwd` por servidor; falta la vista de portafolio |
| Observabilidad | 7/10 | `reporte_consumo`/`reporte_valor` hechos; faltan series temporales y trazas |

**Nota global: 8/10 como herramienta interna. El salto a producto vendible depende de la investigación de mercado que está corriendo.**

---

## 6. Lo que necesito de ti (decisiones, no trabajo)

1. **¿Commiteo lo pendiente del harness?** (anexar a feature + tope de puntos + tests — listo y probado)
2. **¿Adopto ValmenHarness como segundo proyecto valmen?** — una tarde, gates reales, dogfooding completo
3. **¿Arranco la Ola 1?** El primer entregable sería la reanudación compacta del ticket — el mayor ahorro inmediato
4. **¿Qué proyecto sigue para multiproyecto?** (¿LocalAgents? ¿alguno nuevo?)
5. **Playwright:** ¿lo montamos como piloto sobre un ticket de pantalla real? Sugiero el próximo que toque la factura manual
