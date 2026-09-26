# S2 — Multiproyecto

Requisitos de la segunda ola: el harness deja de ser de un solo proyecto. El
propio ValmenHarness y crm-valment se adoptan como proyectos registrados, y
Mission Control aprende a mirarlos a todos a la vez.

## R-S2-001 — El harness se adopta a sí mismo

ValmenHarness DEBE trabajar con su propio registro: `.valmen/` como fuente de
verdad, `valmen sync` verificable en CI, y el trabajo de evolución registrado
como features y tickets — empezando por esta. El «modo directo» PUEDE seguir
para cambios triviales, pero la funcionalidad nueva DEBE pasar por el flujo.

## R-S2-002 — Adopción asistida de un proyecto nuevo

`valmen adopt` DEBE bastar para dejar un proyecto operable en una sesión:
reglas iniciales extraíbles del `AGENTS.md` existente, `test-commands`
detectados del stack, y la plantilla `django-angular-multitenant` sugerida
cuando el stack coincide. La adopción NO DEBE pisar reglas ni documentos que el
proyecto ya tiene: lo que existe se respeta y se dice.

## R-S2-003 — crm-valment adoptado

El proyecto crm-valment DEBE quedar adoptado con su registro propio: reglas
extraídas de su `AGENTS.md` y sus perfiles de ejecución (V1/I1/D1/R1/C1)
preservados como reglas del proyecto, no reemplazados. Sus `DECISIONS.md` y
`ERRORS.md` DEBEN quedar como fuentes de memoria.

## R-S2-004 — Perfil de Hermes por proyecto

Cada proyecto adoptado DEBE poder declararse como un servidor MCP propio en la
configuración de Hermes (`valmen-<proyecto>` con su `cwd`), de modo que un
perfil de Hermes por proyecto vea solo su registro. La puesta en marcha de un
perfil nuevo DEBE quedar documentada en un solo comando o checklist.

## R-S2-005 — Vista de portafolio en Mission Control

Mission Control DEBE ofrecer una vista que agregue los proyectos declarados:
qué compuertas esperan decisión, qué procesos se detuvieron, y el consumo del
mes por proyecto. Los proyectos SE DECLARAN en una lista con su raíz; la vista
NO DEBE exigir que compartan registro ni máquina.
