---
schema_version: 2
id: operacion-entrega-harness
title: Operación y entrega del harness
state: decomposed
created: 2026-10-10
updated: 2026-10-10
---

# Operación y entrega del harness

## Problema

Sale de la misma comparación con gentle-ai del 2026-10-10
(Gentleman-Programming/gentle-ai, `66bf3e1`, v4.0.0) que originó la feature
`guardas-verificacion-harness`. El PO preguntó si había más que las ocho
propuestas y decidió: «las 8 que enumeraste en un feature y las otras en otro
feature». Estas son las otras, de menor peso, que Valmen no tiene:

- `valmen sync` sobrescribe las proyecciones sin respaldo y no tiene vista
  previa de lo que va a escribir: `--check` solo dice si están al día.
- La entrega no tiene tope de tamaño ni estrategia para partir un cambio grande
  en piezas revisables.
- Un ciclo de QA ya registra la versión probada (`build_reference`,
  `packages/engine/src/append.ts:525-587`), pero no lo que quedó sin cubrir:
  `findings` se escribe siempre vacío (`append.ts:604, 682`), así que el
  resultado no declara su alcance.
- El PO ve nueve estados y dos desvíos donde le bastaría saber si el trabajo
  está en curso, en verificación, listo o esperando una decisión suya. La web
  ya agrupa estados en tres lugares que no coinciden entre sí
  (`packages/server/web/index.html:4071-4082`, `:6337-6339`, `:5662-5673`), y
  el vigilante de Telegram no avisa cuando un ticket pasa a esperar al PO.
- Los worktrees integrados se acumulan (107 MB en `.claude/worktrees/` el
  2026-10-10) y solo hay `journey worktree remove --id`, de a uno; un worktree
  que no sigue el patrón `ticket-<slug>` no lo limpia nada.
- Cuántas pruebas lleva un cambio no está escrito para el flujo completo (va
  como estándar EST-010, no como ticket).

## Objetivo

Que operar el harness sea reversible y legible: `sync` muestra antes y respalda
lo que sobrescribe, la entrega se mide y se parte cuando excede un tamaño
revisable, la QA declara qué no cubrió, el PO lee el estado en cuatro palabras
y se entera cuando algo lo espera, y lo que se acumula se limpia viendo
primero qué se borraría.

## Alcance

- Dentro:
  - `valmen sync --dry-run` y respaldo de cada archivo que `sync` va a
    sobrescribir.
  - Tope orientativo del tamaño de la entrega por ticket, con aviso y una
    estrategia declarada para partir lo que lo excede.
  - El cierre del ciclo de QA registra lo que quedó sin cubrir.
  - Cuatro estados públicos (Trabajando, Verificando, Listo, Necesita tu
    decisión) calculados por una sola función, usados por la vista web, y un
    aviso de Telegram cuando un ticket pasa a «Necesita tu decisión».
  - Limpieza de worktrees integrados y de respaldos de `sync` viejos, con vista
    previa por defecto y confirmación explícita.
- Fuera:
  - El estándar EST-010 (prueba primero): se decide con `decidir_estandar`.
  - Borrar recibos, tickets, eventos o cualquier bloque append-only.
  - Abrir PRs remotos o empujar: la entrega sigue siendo local y la decide una
    persona.
  - Lo de guardas y verificación: va en `guardas-verificacion-harness`.

## Restricciones

- Los estados públicos son una proyección: la máquina de estados del ticket no
  cambia y el motor sigue rechazando los saltos ilegales.
- La limpieza nunca toca el registro (`tickets/`, recibos, eventos, QA) y no
  borra un worktree con cambios sin integrar.
- El tope de tamaño avisa, no bloquea: partir un cambio lo decide una persona.
- Un aviso nuevo de Telegram entra por el vigilante de avisos (EST-002).

## Artefactos

- `spec/<dominio>/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
