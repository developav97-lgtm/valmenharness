# ValmenHarness

Harness agéntico empresarial: motor determinista de estado + especificaciones + gates
configurables, que se instala **dentro** de cualquier agente de código (Claude Code, Codex,
opencode, Cursor…) sin reemplazarlo.

**Estado:** diseño — pendiente de aprobación.
**Fecha:** 2026-09-20

## Documentos

| Documento | Contenido |
|---|---|
| [`docs/00-VISION.md`](docs/00-VISION.md) | Qué es, por qué existe, a quién sirve, qué NO es |
| [`docs/01-ARQUITECTURA.md`](docs/01-ARQUITECTURA.md) | Las tres capas, el layout `.valmen/`, los contratos |
| [`docs/02-MOTOR.md`](docs/02-MOTOR.md) | Motor de workflow: tickets, features, artefactos, estados |
| [`docs/03-GATES.md`](docs/03-GATES.md) | Gates humanos y automáticos, integración TypeSafe Jev |
| [`docs/04-PROVEEDORES.md`](docs/04-PROVEEDORES.md) | Providers, routing de modelos, esfuerzo, costos |
| [`docs/05-PLUGINS.md`](docs/05-PLUGINS.md) | Arquitectura de plugins, tools y procesos |
| [`docs/06-CONTROL-APP.md`](docs/06-CONTROL-APP.md) | Mission Control: la app web local |
| [`docs/07-ADAPTADORES.md`](docs/07-ADAPTADORES.md) | Cómo se proyecta a Codex/Claude/opencode |
| [`docs/08-ADOPCION.md`](docs/08-ADOPCION.md) | `valmen adopt`: migrar un proyecto existente |
| [`docs/09-MIGRACION-SAICLOUD.md`](docs/09-MIGRACION-SAICLOUD.md) | Plan concreto para reemplazar la config de SaiOpenCloud |
| [`docs/10-ROADMAP.md`](docs/10-ROADMAP.md) | Fases, MVP y criterios de aceptación |
| [`docs/11-OPEN-QUESTIONS.md`](docs/11-OPEN-QUESTIONS.md) | Decisiones abiertas que necesitan tu respuesta |
| [`docs/12-FUNCIONALIDADES-PROXIMAS.md`](docs/12-FUNCIONALIDADES-PROXIMAS.md) | Catálogo de funcionalidades propuestas, priorizadas |
| [`docs/13-RECORRIDO-COMPLETO.md`](docs/13-RECORRIDO-COMPLETO.md) | **Un ticket de principio a fin: las 8 escenas, con quién decide y qué cuesta** |
| [`docs/99-REFERENCIAS.md`](docs/99-REFERENCIAS.md) | Hallazgos verificados de la investigación (gentle-ai, DSH, Jev, SaiOpenCloud) |

## Resumen en 10 líneas

1. Un producto instalable que da a cualquier proyecto un **motor de workflow determinista**
   con estado en archivos versionados por git.
2. Se instala **dentro** de Claude, Codex u opencode — no los reemplaza.
3. `valmen adopt` analiza un proyecto existente, separa las reglas del proyecto de las del
   harness, y genera `AGENTS.md` con ambas.
4. One source → todas las proyecciones (`.codex/`, `.claude/`, `.opencode/`). Se acabó migrar
   a mano.
5. **SDD/ODD** para trabajo grande: spec con deltas, design, tasks, descomposición en tickets
   con grafos y sprints.
6. **Gates declarativos**: mecánicos primero, humanos donde el riesgo lo exige, y
   **automáticos con TypeSafe Jev** ($0.00003 por verificación).
7. El gate nunca le pregunta al modelo si aprueba: le pregunta hechos, y el código decide con
   umbrales. Cada decisión deja un **recibo auditable**.
8. **Procesos encadenables**: el deploy llama a actualizar manuales, con gates y evidencia.
9. **Mission Control**: app web en localhost con tickets, features, gates, costos,
   configuración por chat y control desde el celular vía Hermes.
10. **MVP = 3–5 semanas** para reemplazar el flujo actual de SaiOpenCloud con equivalencia
    verificada sobre sus 57 tickets en producción.

## Por dónde empezar a leer

- Si quieres el panorama: este README y [`docs/00-VISION.md`](docs/00-VISION.md).
- **Si quieres ver si esto funciona de verdad: [`docs/13-RECORRIDO-COMPLETO.md`](docs/13-RECORRIDO-COMPLETO.md).**
  Un ticket real de principio a fin: qué decide el motor, qué decide un modelo, dónde entras
  tú, y cuánto cuesta cada paso.
- Si quieres evaluar la arquitectura: [`docs/01-ARQUITECTURA.md`](docs/01-ARQUITECTURA.md).
- Si te interesa el gate automático con Jev: [`docs/03-GATES.md`](docs/03-GATES.md).
- Si quieres el plan concreto para SaiOpenCloud: [`docs/09-MIGRACION-SAICLOUD.md`](docs/09-MIGRACION-SAICLOUD.md).
- **Si vas a responder:** [`docs/11-OPEN-QUESTIONS.md`](docs/11-OPEN-QUESTIONS.md).

## Tres hallazgos de tus propios datos que justifican el proyecto

Todos salieron de auditar los 57 tickets reales y el código de `ticket.py` (ver
[`09-MIGRACION-SAICLOUD.md` §2bis](docs/09-MIGRACION-SAICLOUD.md)):

1. **`evidence.kind` divergió a 30 valores distintos — y encontré la causa exacta.**
   Todos los demás enums del esquema están guardados por el validador
   (`severity no pertenece al esquema`, transiciones no permitidas, estados inventados).
   **`evidence.kind` es el único que no se valida**: el código solo hace `validate_text()`,
   un string no vacío. La deriva no fue indisciplina — fue un hueco. `automated`,
   `automated_test`, `automated-test` y `test` conviven como si fueran cosas distintas, y
   cualquier reporte que agrupe por ese campo da un número **silenciosamente incorrecto**.

2. **`## Consumo de IA` tiene 1 entrada en 57 tickets.** El esquema es correcto y previó la
   honestidad del caso (`confidence: low`), pero un campo que depende de que un humano lo
   llene no se llena. Cuando el motor hace la llamada, `usage.cost` viene en la respuesta y
   el registro pasa a `confidence: high` sin intervención humana.

3. **55 de los 137 puntos quedaron en `verified`, no en `closed`.** `BLOCKING_POINT_STATES`
   excluye `verified` **a propósito**, así que un punto puede quedar verificado sin cerrarse y
   el ticket cierra igual. Pero **no existe regla sobre qué debería pasar al cerrar**. Un
   reporte de "puntos cerrados" da 81 cuando la realidad son 137. Mismo patrón que el punto 1:
   un hueco en el contrato no da error, da un número equivocado.

**La buena noticia:** `ticket.py` es un validador real y estricto. Rechaza saltos de fase,
estados inventados, severidades fuera del esquema, y **planes vacíos o con placeholders** —
un agente no puede marcar un ticket como `planned` con un plan sin escribir. Eso se hereda
tal cual.

**Y una corrección que me hice a mí mismo:** mi diseño afirmaba que existía
`awaiting_user_tests → changes_requested`. **No existe** — ese estado tiene una única salida,
`in_qa`. No era un hueco: es una decisión deliberada de tu contrato, y mi diseño la estaba
contradiciendo. Corregido en el diseño y en el recorrido.

La matriz de transiciones completa (11 de ticket, 9 de punto, 3 de release) y las 1.122
ejecuciones reales están extraídas y reconcilian sin residuos. **Ese es el conjunto de datos
de aceptación de la Fase 1** — no *"los 57 validan"*, sino *"las 1.122 transiciones se
reproducen exactamente, se rechaza lo mismo que hoy, y los códigos de salida coinciden"*.

## Una contradicción del diseño que hay que decidir antes de la Fase 1

El diseño propone añadir los tipos `CHORE` y `DOCS` y el estado `blocked`. Al leer el
validador resulta que **hoy eso es imposible**:

```python
TICKET_TYPES = { "FEATURE", ... }    # conjunto CERRADO
TICKET_TRANSITIONS = { ... }         # mapa CERRADO, sin `blocked`
if fields["schema_version"] != "1":  # HARDCODEADO
    fail("schema_version debe ser el entero literal 1.")
```

Si `valmen` empezara a escribir `schema_version: 2`, **el CLI de Python los rechazaría y el
modo coexistencia se rompería el primer día**.

La resolución propuesta es **v1 congelado + v2 opt-in**: los 57 tickets mantienen las reglas
actuales exactas (así la suite de equivalencia sigue siendo verificable), y los tickets nuevos
nacen en v2 con el vocabulario ampliado. Regla de integridad: `valmen` **jamás escribe v2 en
un ticket v1**.

La alternativa honesta es **no añadir nada** y registrar el trabajo interno como
`IMPROVEMENT`. Es una pérdida menor de expresividad a cambio de no mantener dos vocabularios
en paralelo.

Está en [`docs/11-OPEN-QUESTIONS.md`](docs/11-OPEN-QUESTIONS.md) como **Q16** y explicada en
[`docs/09-MIGRACION-SAICLOUD.md` §2ter](docs/09-MIGRACION-SAICLOUD.md).
