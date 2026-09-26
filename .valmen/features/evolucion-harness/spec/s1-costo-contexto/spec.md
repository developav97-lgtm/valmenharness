# S1 — Costo y contexto

Requisitos de la primera ola: que un ticket sencillo deje de pagar el contexto
completo en cada reanudación, y que el costo de una corrida se mida contra lo
típico antes de pagarlo de más.

## R-S1-001 — Reanudación compacta

`reanudar_ticket` DEBE ofrecer un modo compacto que entregue el estado del
ticket de forma estructurada: identificador, estado, plan (las secciones que
sigan vigentes), puntos abiertos con su estado, el último recibo de compuerta y
la instrucción de leer secciones completas bajo demanda. El modo completo DEBE
seguir disponible. El modo compacto DEBE ser el que el servidor MCP entregue por
defecto a un agente que retoma.

## R-S1-002 — Cascada verificada

El sistema DEBE documentar y habilitar el patrón de cascada: un modelo barato
produce, un evaluador verifica la respuesta contra el contexto, y solo si la
verificación falla se escala a un modelo superior. La cascada SE APLICA primero
a la clasificación de tickets y a la exploración. Cada escalamiento DEBE quedar
en el recibo con el motivo.

## R-S1-003 — Presupuestos adaptativos

El sistema DEBE declarar el costo típico por tipo de ticket (aprendido de los
cierres registrados) y avisar cuando una corrida lo supera: notificación a 1.5×,
degradación del enrutado a 2×, pausa con consulta a la persona a 3×. Los
multiplicadores DEBEN ser configurables por proyecto.

## R-S1-004 — Modo pregunta (`valmen ask`)

DEBE existir un modo de consulta en el que el motor no concede permisos de
escritura al agente, reforzado por el mecanismo y no por la instrucción. El modo
pregunta NO DEBE poder crear tickets, mover estados ni escribir archivos.
