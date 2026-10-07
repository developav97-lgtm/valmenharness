---
schema_version: 2
id: aprobacion-autonoma-de-planes
title: Aprobación autónoma de planes y análisis
state: decomposed
created: 2026-10-07
updated: 2026-10-07
---

# Aprobación autónoma de planes y análisis

## Problema

Con las palabras del PO, el 2026-10-07:

> «la idea del arnés es poder ejecutar tickets de manera autónoma, ya sea que yo
> le diga: "Ejecuta este ticket", y que el ticket pueda pasar todas sus fases si
> cumple […] llegar incluso hasta el cierre y que se cierre solo, sin que yo
> tenga que intervenir»

> «el ticket pasa todas las compuertas. En este caso, para mí debería aprobarse
> […] yo debería autorizar si queda en review o en block»

> «un agente extra que pueda revisar y aprobar el plan como una segunda opinión
> […] un agente especializado en arquitectura o en resolución de problemas, como
> un agente que pueda simular a un senior desarrollador […] que el sistema quede
> como "aprobación realizada por el agente de revisión"»

> «que se pueda configurar esa parte de revisión de planes y revisión de análisis
> de manera autónoma por un agente, o que tenga que hacerlo manualmente yo, como
> está en este momento»

> «programo la jornada hoy en la noche […] el sistema ahí mismo pueda realizar el
> montaje de los análisis y los planes. Yo pueda dejar ya aprobados para que, al
> otro día, empiece la ejecución»

> «que SYNC, INTEGRATION y AGENT sí se puedan colocar como los otros»

Hoy, por R-CTRL-001, mover un ticket a `approved` exige una aprobación del plan
registrada por una persona, aunque las compuertas de análisis y plan hayan
aprobado. El ticket BUGFIX-CORE-PLAN-ESTRUCTURADO-GATE-20261007 lo mostró: las dos
compuertas en `approve` y la sesión detenida esperando una frase.

## Objetivo

Que la persona pueda declarar, una vez y por proyecto, que el análisis y el plan
se aprueben solos cuando la compuerta aprobó, y que un agente revisor decida los
que quedan en `review`, sin reabrir el hueco que R-CTRL-001 cerró: la autoridad
nace de una persona, la ejerce el código y el recibo dice quién aprobó.

## Alcance

- Dentro: una autorización permanente de aprobación de planes (y análisis) creada
  por una persona; aprobación automática cuando la compuerta está en `approve`
  vigente; un agente revisor para `review`, con modelo distinto al productor;
  atribución en el ticket y en el recibo; configuración por proyecto
  (manual, automática en `approve`, con agente revisor); uso en la jornada
  (aprobar al armarla y ejecutar al día siguiente).
- Fuera: SECURITY (siempre una persona); la aprobación de despliegues a producción;
  un `block` (solo una persona lo autoriza); cambiar R-CTRL-001 para los tickets
  sin autorización.

## Restricciones

- El agente que escribió el plan no puede aprobarlo ni elegir al revisor.
- La autorización la crea solo una persona, por un canal que el agente no
  controla, y se revoca al instante; no hay herramienta MCP que la cree.
- Los tickets con impactos de migración, contenedores o despliegue declarados
  siguen el gate humano salvo que la autorización los incluya de forma explícita.
- Depende de la feature `perfiles-de-modelos` para elegir el modelo del revisor.

## Artefactos

- `spec/aprobacion/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
