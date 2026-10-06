# Evidencia: `corresponde_a_la_investigacion` da ~0.00 con el resto del recibo aprobado

Para quien tome `IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005` (R-CPRE-004,
R-CPRE-005, R-CPRE-012). Reúne el patrón de AP-008 con el tercer caso, que es el
único **reproducible**, y un experimento que aísla la causa. Se recogió el 2026-10-06
en la sesión de `IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005`, con la
autorización del PO para anexar «la mayor evidencia posible».

## Conclusión

En el caso reproducible, la causa es la **proposición**, no el artefacto: pregunta si
los *archivos* del plan y del diagnóstico coinciden, y un plan que crea archivos
nuevos incumple su cláusula «no» por construcción. Al agregar al diagnóstico una línea
con los archivos que el plan toca, el valor pasa de 0.003 a 0.993. Las dos hipótesis de
AP-008 —la línea de aprobación pendiente (R-CPRE-012) y el diagnóstico largo
(R-CPRE-003)— **no explican** este caso: quitar la línea no cambió el valor, y el
diagnóstico más largo fue el que aprobó.

## Qué pregunta la proposición

`packages/gate/src/definitions.ts:74-85`:

| campo | texto |
|---|---|
| `description` (lo que se lee en el recibo) | «El plan responde a lo que dice el diagnóstico» |
| `instructions` (lo que se le pregunta al modelo) | «Los archivos y componentes que `plan` propone modificar son los mismos que `investigacion` identifica como causa del problema o ubicación del cambio.» |
| `criteria.yes` | «Los archivos de `plan` y de `investigacion` coinciden.» |
| `criteria.no` | «`plan` modifica archivos que `investigacion` no menciona, o al contrario.» |

La descripción pregunta por **correspondencia**; las instrucciones y los criterios
preguntan por **igualdad de conjuntos de archivos**. Es el desajuste que R-CPRE-004
pide corregir («preguntar lo mismo que dice su descripción»). Con la cláusula «no»
tal como está, cualquier plan que cree un archivo (una prueba nueva, un módulo) o que
deje fuera uno que el diagnóstico menciona como consumidor queda en «no».

## Experimento

Mismo evaluador y política en todas las corridas: gate `plan`, `cascade`
(`gpt-6-luna` produce y verifica, `gpt-6.1-sol` escala), `approveAt` 0.9,
`blockAt` 0.1. Cada variante corrió en un proyecto de prueba aparte (en el scratchpad
de la sesión), con copia de `config.yaml` y `routing.yaml`, sin tocar el registro real.

| estado evaluado | stateHash (inicio) | `corresponde_a_la_investigacion` | verificador sobre la respuesta barata | veredicto |
|---|---|---|---|---|
| real, recibo `…-plan-1` (plan 8 003 car., criterios 2 515) | `e28bd9ba…` | 0.006 | 0.31 | block (por otras tres proposiciones; ver abajo) |
| real, recibo `…-plan-2` (plan 10 248 car., criterios 2 756) | `86d55075…` | 0.003 | 0.29 | approve |
| **V0** igual al estado de `plan-2` | `86d55075…` (idéntico) | 0.003 | 0.70 | approve |
| **V1** V0 sin la línea «Gate de plan y aprobación…» | `a5f7945d…` | 0.003 | 0.29 | approve |
| **V2** V0 + una línea en `investigacion` con los 13 archivos del plan | `34b020c6…` | **0.993** | 0.69 | review (por `criterio_09`, no relacionado) |

Lectura:

- **V0 reproduce el recibo real**: mismo `stateHash`, mismo 0.003. El valor es estable,
  no un tropiezo de una llamada.
- **V1 descarta la línea de aprobación** como causa (R-CPRE-012 no explica este caso).
- **V2 es el único cambio que mueve el valor**, y lo mueve a 0.993. Su diagnóstico es
  *más largo* que el de V0 (≈ 600 caracteres más), lo que descarta el largo como causa
  (R-CPRE-003 tampoco).
- El verificador (el modelo barato) dio 0.29–0.70 a su propia respuesta en las cinco
  corridas y el modelo superior la corrigió cada vez: el desacuerdo es constante, no del
  estado.

Los archivos del plan que el diagnóstico real **no** nombra (tercer caso, estado actual
del ticket): `packages/adapter/src/rule-projection.ts` y `agents-size.ts` (nuevos),
`packages/adapter/src/index.ts`, `tests/respuesta-agents-md.test.ts` y
`tests/agents-md-tamano.test.ts` (nuevos), `docs/07-ADAPTADORES.md`. A la inversa, el
diagnóstico nombra `adopt-rules.ts` y `.valmen/rules/como-se-responde.md`, que el plan
no modifica.

### Por qué el recibo del caso 3 bloqueó en `plan-1`

`plan-1` bloqueó por cuatro proposiciones: `corresponde_a_la_investigacion` (0.006,
descriptiva, **no** decide), y tres que se atendieron con cambios al ticket porque
señalaban defectos reales: `criterio_07` (criterio compuesto cuyo comando no cubría las
pruebas de MCP que nombraba), `cubre_todos_los_criterios` y
`compatibilidad_hacia_atras` (el plan no declaraba qué cambia y qué no). Tras esos
cambios, `plan-2` aprobó con la proposición todavía en 0.003. Es decir: el valor de `corresponde_a_la_investigacion`
no se movió con mejoras reales del plan (se le agregó una sección de trazabilidad
hallazgo → paso, y no cambió).

## Los casos anteriores

| caso | recibo | `corresponde…` | estado recuperable |
|---|---|---|---|
| `BUGFIX-GATE-LECTOR-CRITERIOS-20261005` | `…-plan-1`, stateHash `7aa93785…` | 0.003 | **No**: el hash del texto actual no coincide (el ticket cambió) |
| `BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004` | `…-plan-1`, stateHash `a34d94d1…` | 0.009 | **No**: ídem |
| `IMPROVEMENT-ADAPTER-CONTRATO-RESPUESTA-20261005` | `…-plan-1` y `…-plan-2` | 0.006 y 0.003 | **Sí**: `estados/` (los tres estados reproducen su hash) |

Como indicio, y **con la advertencia de que usa el texto actual de esos dos tickets y
no el evaluado**, el plan de cada uno nombra archivos que su diagnóstico no nombra:
`tests/gate-lector-criterios.test.ts`, `tests/fixtures/lector-criterios-recibos.json`,
`tests/gate-mecanico.test.ts`, `docs/03-GATES.md` (primero) y
`tests/firma-de-compuerta.test.ts`, `docs/03-GATES.md` (segundo): siempre pruebas o
documentación. Es consistente con la causa de arriba, pero no la prueba en
esos dos casos.

## Cómo reproducirlo

1. Armar un proyecto de prueba (fuera del repositorio) con `.valmen/config.yaml` y
   `.valmen/routing.yaml` copiados y `tickets/2026/<ID>/ticket.md` en estado `planned`.
2. Poner en las secciones del ticket lo que dice `estados/<variante>.json`
   (`solicitud`, `investigacion`, `plan`, `criterios`; `id`, `tipo`, `modulo`, `riesgo`
   e `impactos` salen del frontmatter). El motor calcula `stateHash` como
   `hashState(buildGateState(texto))`; el de la variante tiene que coincidir con el de
   la tabla antes de fiarse del resultado.
3. `evaluar_compuerta` con `gate: plan`, `evaluator: cascade` y `root` apuntando al
   proyecto de prueba. El recibo queda en el `.valmen/receipts/` de ese proyecto.

Los cuatro recibos completos están en `recibos/` (copias exactas por `cp`, comparadas
con `cmp`). Ojo: en los proyectos de prueba el recibo de cada variante se numeró
`…-plan-1`, así que el id **no** distingue entre `ticket-real.jsonl` y los
`experimento-*.jsonl`: distingue el `stateHash`.

## Límites de esta evidencia

- Una corrida por variante, salvo V0 (que repite el valor del recibo real). No se midió
  la varianza más allá de eso.
- Un solo evaluador (`cascade`, familia `codex`). No se probó `jev`, `llm-judge` ni
  otro proveedor, así que no se sabe si el desajuste de la proposición se manifiesta
  igual con ellos.
- V2 agrega al diagnóstico una línea con los archivos del plan: prueba que la
  proposición mide cobertura de archivos, no que ese sea el diagnóstico correcto de
  un caso real.
- Los dos primeros casos no se pudieron reconstruir; sobre ellos solo hay el indicio de
  arriba.
- En V2, `criterio_09` quedó en 0.888 (el motor lo señaló como criterio que «agrupa 4
  afirmaciones», que es el asunto de R-CPRE-005, no de este). En V0 y V1 ese mismo
  criterio dio 1.00: otra muestra de variación entre corridas del mismo estado
  casi idéntico.

## Pistas para el ticket (no son decisiones)

- Alinear `instructions` y `criteria` con `description`: preguntar si cada cambio del
  plan está **justificado** por el diagnóstico (causa, ubicación o consumidor) y tratar
  los archivos nuevos —pruebas, módulos, documentación— como parte esperada del plan,
  no como incumplimiento.
- Partirla en proposiciones atómicas (R-CPRE-005): «el plan modifica lo que el
  diagnóstico identifica» y «el plan no ignora una causa que el diagnóstico nombra».
- El recibo muestra un 0.00 y dice «approve»: una proposición descriptiva con 0.00 que
  no decide confunde a quien lee el número. Decidir si debe votar, o si debe dejar de
  mostrarse con el mismo formato que las que votan.
- Para validar la corrección: usar `estados/plan-2.json` (debe subir de 0.003) y
  `estados/experimento-v2-diagnostico-con-archivos.json` (debe seguir alto), más un caso
  control donde el plan sí contradiga al diagnóstico (debe seguir bajo).

## Contenido

```text
estados/    el estado exacto que vio el evaluador, por variante (JSON; su hash reproduce el del recibo)
  analisis-1.json                               compuerta de análisis del caso 3 (aprobó; diagnóstico y plantilla de plan)
  plan-1.json  plan-2.json                      los dos recibos reales del caso 3
  experimento-v0-igual-a-plan-2.json            idéntico a plan-2.json
  experimento-v1-sin-linea-de-aprobacion.json
  experimento-v2-diagnostico-con-archivos.json
recibos/    los recibos completos, tal como los escribió el motor (JSONL)
  ticket-real.jsonl                             análisis-1, plan-1 y plan-2 del caso 3
  experimento-v0.jsonl  experimento-v1.jsonl  experimento-v2.jsonl
```
