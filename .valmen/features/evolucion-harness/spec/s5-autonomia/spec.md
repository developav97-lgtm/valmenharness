# S5 — Autonomía acotada

Requisitos de la quinta ola: tickets elegibles ejecutados de punta a punta sin
intervención, con la elegibilidad decidida por configuración auditable y la
evidencia de calibración delante. Se construye al final, con las olas
anteriores en producción.

## R-S5-001 — Elegibilidad por configuración

DEBE existir una sección `autonomous:` en `.valmen/config.yaml` que declare:
tipos de ticket elegibles, riesgo máximo, módulos excluidos, condiciones
requeridas (plan aprobado, tests declarados, sin impactos críticos) y límites
(máximo concurrente, máximo por día, presupuesto por ticket, condiciones de
parada). El agente NO DEBE poder tomar un ticket fuera de esa lista: el motor
ofrece solo lo que cumple los criterios declarados.

## R-S5-002 — Ejecución desatendida hasta `awaiting_user_tests`

`valmen run` DEBE llevar un ticket elegible desde su estado actual hasta
`awaiting_user_tests` sin intervención: análisis, plan, gates automáticos,
implementación y entrega del contrato de pruebas. La prueba del responsable, el
cierre de QA y cualquier gate de riesgo alto SIGUEN siendo de una persona, sin
excepción declarable.

## R-S5-003 — Colisiones de escritura antes de paralelizar

Antes de ejecutar dos tickets en paralelo sobre el mismo repositorio, el motor
DEBE contrastar los archivos que cada plan declara tocar y aplicar la política
configurada (`warn`, `serialize` o `block`). La detección es mecánica: archivos
declarados, no inferencia del modelo.

## R-S5-004 — Promoción de gates por evidencia

Un gate híbrido SOLO DEBE promoverse a automático cuando la calibración contra
decisiones humanas registradas muestre el umbral cumplido (la simulación con
las últimas N decisiones), y la promoción queda registrada con su evidencia.
Sin ese número, el gate NO DEBE promoverse aunque la configuración lo pida.

## R-S5-005 — Parada segura

Cumplida una condición de parada (gate bloqueado dos veces, fallo de pruebas,
secreto detectado, presupuesto superado), la ejecución DEBE detenerse dejando
el ticket en un estado válido del contrato, con el motivo en el recibo y el
aviso emitido. Una corrida detenida NO DEBE reintentarse sola.
