---
schema_version: 2
id: evolucion-harness
title: Evolución del harness: olas S1–S5 desde la auditoría del 26-sep
state: draft
created: 2026-09-26
updated: 2026-09-26
---

# Evolución del harness: olas S1–S5 desde la auditoría del 26-sep

## Problema

La auditoría del 26-sep (docs/auditoria-20260926/) midió el harness en uso real
sobre SaiOpenCloud: 93 tickets, 28.3M tokens de entrada, ~$4.67 estimados. Tres
hallazgos:

1. **El costo no es el flujo, es la re-contextualización.** Un ticket de UI con
   13 puntos quemó 8.7M tokens en 11 sesiones: cada `reanudar_ticket` entrega el
   documento entero. Un bugfix acotado cierra en ~40K tokens.
2. **El harness se construye en modo directo**, sin su propio registro: la
   ceremonia se evita, pero también la evidencia. Esta feature es el dogfooding:
   el harness se gestiona con el harness.
3. **La investigación de mercado** (12 competidores, docs/auditoria-20260926/
   mercado-y-calificacion.html) marcó las capacidades que faltan para ser
   vendible: headless, paralelismo, sandboxes, observabilidad, revisión
   adversarial, integración con Linear/Jira.

## Objetivo

Ejecutar las olas de la hoja de ruta como sprints del grafo, cada una con sus
tickets en intake, sin relajar ninguna compuerta humana existente.

## Alcance

- Dentro: las cinco olas de docs/auditoria-20260926/hoja-de-ruta.html
  (S1 costo/contexto, S2 multiproyecto, S3 manuales, S4 Playwright, S5 autonomía
  acotada), más las capacidades del análisis de mercado que se aprueben.
- Fuera: cambiar la máquina de estados del ticket, exponer aprobación de gates
  por MCP, telemetría obligatoria. Lo que la sección E de
  docs/12-FUNCIONALIDADES-PROXIMAS.md dice que no se construye.

## Restricciones

- Ninguna ola relaja una decisión humana existente: deploys, cierres de QA y
  umbrales siguen siendo de una persona.
- Cada ticket nace en intake con el flujo completo: análisis, plan, aprobación.
- El motor sigue sin dependencias externas en el camino crítico (invariante 1 y
  la sección E: ni orquestador de contenedores ni DSL propio).

## Artefactos

- `spec/<dominio>/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.