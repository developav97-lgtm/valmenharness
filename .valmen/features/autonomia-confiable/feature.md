---
schema_version: 2
id: autonomia-confiable
title: Autonomía confiable: compuertas precisas, control en código y jornadas con QA por agente
state: decomposed
created: 2026-10-05
updated: 2026-10-05
---

# Autonomía confiable: compuertas precisas, control en código y jornadas con QA por agente

## Problema

Con las palabras del PO, el 2026-10-05:

> «la idea es poder ir programando tareas para cada dia y que se ejecuten solas,
> pues por ahora me toca a mi aprobar el test, aunque esto tambien quisiera que
> fuera mas autonomo»

> «hay cosas que son de backend entonces normalmente se corren los test, se
> puede ejecutar peticiones y ver la respuesta o solo el test, y con eso al yo
> ejecutarlos pues debe salir el mismo resultado entonces, por ejemplo ahi
> deberia aprobar y poder cerrarse con QA ejecutado por el agente»

> «hemos presentado como algunas fallas en la parte de las compuertas porque las
> ha rechazado por que valida cosas que no deberia […] quisiera poder afinarlo y
> que se escriban mejor los analisis y pruebas y que puedan pasar con los
> criterios bien definidos»

> «si toca tomar una decision necesito que solo me devuelvan la opcion en que
> afecta para poder decidir no una chorrera esto debe ser para todos los
> proyectos que monten el harness»

La revisión de alcance del mismo día (artefacto «Panorama Valmen Harness»,
https://claude.ai/artifact/8CBSG3sy1HwjmGqFUxfUV8) midió el registro del harness
y el de SaiOpenCloud:

1. **Las compuertas casi nunca aprueban solas.** `analysis` aprueba el 18% en
   SaiOpenCloud y el 17% en el harness; de 108 revisiones decididas por una
   persona, 107 terminaron aprobadas. La banda de revisión es casi toda falsa
   alarma. Las causas: proposiciones que no aplican al tipo de ticket, evidencia
   que no llega al evaluador, defectos de código (comentarios de plantilla
   evaluados como criterios, recorte silencioso a 12 criterios, la regla AP-004
   incompleta) y un umbral único para dos evaluadores que puntúan distinto.
2. **El control depende de textos.** `approved` se alcanza con una frase en
   `## Plan` (`packages/core/src/validate.ts:258`); la QA del responsable se
   acredita con texto que nadie verifica quién escribió; 38 avances con la
   compuerta en block o review quedaron sin firma; la frase del despliegue no la
   lee ningún código y una aprobación vieja sirve para despliegues futuros.
3. **La autonomía de hoy funciona por prompt.** Las jornadas por cron de Hermes
   avanzan porque el prompt de cada eslabón ordena aprobar análisis, plan y QA
   «como delegado». El motor de jornadas, autorización y despacho existe, pero
   nada lo conecta.
4. **Las respuestas son largas.** Claude Code responde 378 palabras de media en
   SaiOpenCloud contra 162–208 de Codex en el mismo repositorio; el harness no
   proyecta ninguna regla de formato de respuesta y el AGENTS.md de SaiOpenCloud
   pesa 54 KB.

## Objetivo

Que una jornada programada lleve tickets solos hasta las pruebas del responsable
—y, en backend elegible, hasta el cierre por una política que el responsable
autorizó—, sobre compuertas que aprueban lo que está bien escrito y bloquean lo
que no, con cada aprobación atribuible a un actor verificable, y con respuestas
cortas en todos los clientes y proyectos.

Se sabe que sirvió cuando:

- La mayoría de los análisis y planes aprueban sin persona, y la mayoría de las
  revisiones que llegan a una persona terminan con un cambio, no con una
  aprobación sin cambios.
- Ningún ticket avanza con una compuerta en block o review sin firma, y
  `approved` solo se alcanza con una aprobación registrada con actor.
- Una jornada de tres tickets llega sola a `awaiting_user_tests`, con avisos por
  Telegram y sin aprobaciones escritas por el agente.
- 20 tickets en sombra de QA por agente coinciden al 100% con el veredicto del
  responsable antes de que la política cierre tickets.
- La media de respuesta de Claude Code en SaiOpenCloud baja de 150 palabras.

## Alcance

- Dentro, en seis sprints:
  1. **Compuertas sin defectos** (`spec/s1-compuertas-defectos`).
  2. **Compuertas precisas** (`spec/s2-compuertas-precision`).
  3. **Control en el código** (`spec/s3-control-codigo`).
  4. **Respuesta concisa** (`spec/s4-respuesta-concisa`), independiente de los
     demás: puede correr en paralelo.
  5. **Jornada autónoma** (`spec/s5-jornada-autonoma`).
  6. **QA por agente en backend** (`spec/s6-qa-agente`), incluidas las FEATURE de
     backend sin impactos, con periodo en sombra.
- Fuera: push al remoto, merge a main y despliegue desatendido; proposiciones Jev
  adicionales (`FEATURE-CONFIG-PROPOSICIONES-JEV-20260926`,
  `FEATURE-ENGINE-VALIDAR-PROPOSICIONES-JEV-20260926`); edición de políticas desde
  Mission Control (`FEATURE-MC-POLITICAS-AUTONOMAS-20260926`); cambios a la
  máquina de estados del ticket.
- Para después, en otra feature: QA visual con Playwright y mejora propia del
  harness (ola 7 de la revisión). `FEATURE-CLI-DOCTOR-CAPACIDADES-20261001` y
  `FEATURE-CLI-VERIFICACION-TEMPORAL-20261001` siguen en
  `control-jornadas-ejecucion`. Los ajustes sin código (ola 0) van en modo
  directo, fuera de la feature.

## Restricciones

- **Orden.** Los sprints 1–3 se cierran antes de empezar el 5 y el 6: la
  autonomía se construye sobre compuertas precisas y aprobaciones auditables. El
  sprint 4 no depende de ninguno.
- **Lo humano sigue humano.** Siguen vigentes las «Acciones que nunca se
  automatizan» de AGENTS.md, y se agrega una: crear o ampliar una autorización
  permanente de QA. Los tickets de esta feature que cambian una compuerta, una
  autorización o el despacho se aprueban por una persona aunque la autonomía ya
  exista: un gate no amplía su propia autoridad.
- **Apagado por defecto.** Cada capacidad nueva nace apagada y se enciende por
  configuración del proyecto.
- **Compatibilidad del registro.** Los recibos y tickets históricos se siguen
  leyendo y validando; una plantilla nueva no invalida un ticket cerrado.
- **Motor sin red.** `@valmen/core` sigue sin dependencias externas y sin tocar la
  red; la ejecución HTTP y de procesos vive fuera de `core`.
- **Evidencia por sprint.** Cada sprint deja medido su criterio de salida en
  `verify.md`.

## Relación con el trabajo existente

Se reutilizan siete tickets sin modificar sus bytes ni su estado; el análisis de
cada uno fija el alcance que le toca aquí y lo escribe en su ticket:

| Ticket | Sprint | Requisito que cubre aquí |
|---|---|---|
| `BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004` | 1 | R-CDEF-004 |
| `FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926` | 1 | R-CDEF-007 (configuración) |
| `FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926` | 1 | R-CDEF-007 (ejecución) |
| `INTEGRATION-HERMES-DESPACHO-JORNADA-20261001` | 5 | R-JORN-011 |
| `FEATURE-ENGINE-REGLAS-INTEGRACION-20260926` | 5 | R-JORN-009 (reglas; sin push) |
| `INTEGRATION-GIT-INTEGRACION-AUTONOMA-20260926` | 5 | R-JORN-009 (commit; sin push) |
| `SECURITY-ENGINE-CIERRE-AUTORIZADO-20260926` | 6 | R-QAAG-001 |

- `evolucion-harness` (S5): esta feature concreta R-S5-006 sin el push, R-S5-008
  como preparación del ambiente de pruebas y R-S5-010 como QA por agente. Los
  tickets reutilizados conservan su lugar en ese grafo; las dependencias que
  valen para trabajarlos son las de este.
- `control-jornadas-ejecucion`: el motor de jornadas (`journeys.ts`,
  `journey-selection.ts`, `journey-authorization.ts`, `journey-dispatch.ts`) se
  consume, no se redefine.
- Aprendizajes y estándares que esta feature resuelve: AP-004 (contradicción
  interna), AP-007 (avance sin firma), AP-017 de SaiOpenCloud (comentario como
  criterio), AP-002 y AP-015 de SaiOpenCloud (ambiente de pruebas), EST-001
  (no repetir una compuerta sobre el mismo estado).

## Autorizaciones

- 2026-10-05, decisiones de la revisión: «Listo vamos con las recomendaciones de
  decisión» (orden compuertas y control primero; una feature con las olas como
  sprints; QA por agente incluyendo FEATURE de backend con sombra de 20 tickets;
  concisión inmediata en ValMenTech).
- 2026-10-05, alcance devuelto y confirmado: «Si confirmo».
- 2026-10-05, inicio de la feature: «Si dale empecemos».

Estas autorizaciones permiten escribir el brief, la spec y el diseño, y
descomponer. No aprueban planes de implementación ni materializan tickets.

- 2026-10-05, revisión del grafo: «Si vamos con A en ambas que es tu
  recomendación». La pregunta tenía dos decisiones: materializar el grafo
  consolidado de 45 tickets en vez del de 89 del arquitecto, y aceptar la
  aprobación del plan en el chat cuando la persona está presente (opción B de
  D1 en `design.md`). Esta autorización permite materializar los tickets en
  `intake`; no aprueba ningún plan.

## Artefactos

- `spec/s1-compuertas-defectos/spec.md` — defectos de código de las compuertas.
- `spec/s2-compuertas-precision/spec.md` — proposiciones, plantillas y calibración.
- `spec/s3-control-codigo/spec.md` — aprobaciones, despliegue, cierre y consumo.
- `spec/s4-respuesta-concisa/spec.md` — contrato de respuesta y contexto.
- `spec/s5-jornada-autonoma/spec.md` — jornada diaria con dos fases.
- `spec/s6-qa-agente/spec.md` — QA por agente bajo autorización.
- `design.md` — decisiones técnicas y alternativas.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
