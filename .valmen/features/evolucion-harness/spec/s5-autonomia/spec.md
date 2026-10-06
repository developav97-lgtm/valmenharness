# S5 — Autonomía acotada

Requisitos de la quinta ola: tickets elegibles ejecutados de punta a punta hasta
las pruebas del responsable, con la elegibilidad decidida por configuración
auditable y la evidencia de calibración delante. Se construye al final, con las
olas anteriores en producción.

### Requirement: R-S5-001 — Elegibilidad por configuración — DEBE existir una sección `autonomous:` en `.valmen/config.yaml` que declare:

DEBE existir una sección `autonomous:` en `.valmen/config.yaml` que declare:
tipos de ticket elegibles, riesgo máximo, módulos excluidos, condiciones
requeridas (plan aprobado, tests declarados, sin impactos críticos) y límites
(máximo concurrente, máximo por día, presupuesto por ticket, condiciones de
parada). El agente NO DEBE poder tomar un ticket fuera de esa lista: el motor
ofrece solo lo que cumple los criterios declarados.

### Requirement: R-S5-002 — Ejecución desatendida hasta `awaiting_user_tests` — `valmen run` DEBE llevar un ticket elegible desde su estado actual hasta

`valmen run` DEBE llevar un ticket elegible desde su estado actual hasta
`awaiting_user_tests` sin intervención: análisis, plan, gates automáticos,
implementación y entrega del contrato de pruebas. La prueba del responsable y
cualquier gate de riesgo alto SIGUEN siendo de una persona.

### Requirement: R-S5-003 — Colisiones de escritura antes de paralelizar — DEBE contrastar los archivos que cada plan declara tocar y aplicar la política

Antes de ejecutar dos tickets en paralelo sobre el mismo repositorio, el motor
DEBE contrastar los archivos que cada plan declara tocar y aplicar la política
configurada (`warn`, `serialize` o `block`). La detección es mecánica: archivos
declarados, no inferencia del modelo.

### Requirement: R-S5-004 — Promoción de gates por evidencia — Un gate híbrido SOLO DEBE promoverse a automático cuando la calibración contra

Un gate híbrido SOLO DEBE promoverse a automático cuando la calibración contra
decisiones humanas registradas muestre el umbral cumplido (la simulación con
las últimas N decisiones), y la promoción queda registrada con su evidencia.
Sin ese número, el gate NO DEBE promoverse aunque la configuración lo pida.

### Requirement: R-S5-005 — Parada segura — secreto detectado, presupuesto superado), la ejecución DEBE detenerse dejando

Cumplida una condición de parada (gate bloqueado dos veces, fallo de pruebas,
secreto detectado, presupuesto superado), la ejecución DEBE detenerse dejando
el ticket en un estado válido del contrato, con el motivo en el recibo y el
aviso emitido. Una corrida detenida NO DEBE reintentarse sola.

### Requirement: R-S5-007 — Validación semántica ampliada por etapa — El proyecto DEBE poder declarar proposiciones adicionales de Jev por etapa del

El proyecto DEBE poder declarar proposiciones adicionales de Jev por etapa del
flujo, para que la persona no tenga que revisar a mano lo que la validación ya
comprobó. Cada proposición añadida DEBE quedar en el recibo con su respuesta, su
umbral y su costo, y el veredicto lo decide el código aplicando los umbrales,
no el modelo.

Las proposiciones adicionales NO DEBEN poder ampliar la autoridad de una
compuerta: una proposición no puede desbloquear lo que otra bloqueó, ni
promover un gate a automático. Añadir validación endurece o informa; nunca
relaja.

Cuando un consumidor prepare una validación de integración, la proposición que
decide DEBE verificar que lo implementado corresponde al plan aprobado y a la
solicitud original, y que no hay cambios fuera del alcance declarado.

## Requisitos trasladados

Los siguientes requisitos salieron de esta feature el 2026-10-06, por decisión
del PO, porque sus tickets ahora pertenecen a `autonomia-confiable`. Esta
referencia conserva el historial; no declara que esa feature mantenga el mismo
alcance literal ni habilita por sí misma integración, push o cierre automáticos.

- `R-S5-006` — integración desatendida: seguimiento en
  `FEATURE-ENGINE-REGLAS-INTEGRACION-20260926` e
  `INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926`.
- `R-S5-008` — preparación y migración del ambiente de pruebas: seguimiento en
  `FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926` e
  `FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926`.
- `R-S5-009` — configuración de políticas desde Mission Control: seguimiento
  en `FEATURE-MC-POLITICAS-AUTONOMAS-20260926`.
- `R-S5-010` — autorización persistida para cierre: seguimiento en
  `SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926`.
