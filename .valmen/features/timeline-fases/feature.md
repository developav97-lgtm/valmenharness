---
schema_version: 2
id: timeline-fases
title: Ver por ticket la duración de cada fase y la transición en vivo
state: complete
created: 2026-09-29
updated: 2026-10-05
---

# Ver por ticket la duración de cada fase y la transición en vivo

## Problema

El PO opera la jornada desde el celular/iPad y quedó «medio ciego»: Mission
Control solo muestra la etapa *validada* del ticket (análisis hecho, plan
aprobado…), no cuándo empezó each fase ni cuánto duró, y el panel de kanban solo
dice «in progress». El caso que lo motivó: le avisaron un ticket, luego otro con
<30 min de diferencia, y el siguiente pasó +30 min sin aviso — no tenía cómo
distinguir «sigue andando normal» de «se bloqueó y espera mi decisión» salvo por
el aviso pasivo, con hasta 10 min de retraso entre corridas del vigilante.

## Objetivo

Que, para cada ticket del registro, Mission Control muestre la línea de tiempo
de sus fases —análisis, plan, implementación, entrega, QA— con hora de inicio,
hora de fin y duración de cada una, y que la transición se vea en vivo en cuanto
ocurre (SSE ya existe, `/api/events`), sin leer el ticket a mano.

## Alcance

- Dentro:
  - Exponer por API y pintar en la UI la línea de fases por ticket, con
    duración por fase y la transición en curso («implementando, empezó 14:12,
    lleva 23 min»).
  - Fuente primaria: las transiciones de estado del registro ValMen
    (`tickets/YYYY/<ID>/ticket.md`, bloques append-only de eventos) — es la
    fuente de verdad del flujo.
  - Enriquecer cada fase con sus sesiones de timeline ya existentes
    (`/api/timeline`, consumos y costes por etapa).
  - El equivalente desde kanban (`task_events` de
    `~/.hermes/kanban/boards/<board>/kanban.db`) como fuente complementaria
    cuando el ticket corre bajo el dispatcher de Hermes.
- Fuera:
  - Cualquier acción sobre el ticket desde la línea de tiempo (solo lectura).
  - Notificaciones push de aviso — las sigue el vigilante Slack.
  - Exponer la línea de tiempo fuera del tailnet.

## Restricciones

- La UI llama a sus APIs con rutas absolutas (`/api/...`): el endpoint nuevo se
  monta bajo la misma raíz; no se introduce prefijo de ruta.
- Los bloques append-only del registro no se reescriben: la línea de tiempo se
  *deriva leyendo*, nunca escribe.
- Modo oscuro: ningún color fijo en lo que esta feature agregue (valores del
  tema).
- Español en todo lo que la pantalla muestre.

## Artefactos

- `spec/<dominio>/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
