# s3 — Lo que la QA no cubrió

Dominio del ciclo de QA: `iniciar_qa`, `cerrar_qa` y `anotar_retest`
(`packages/mcp/src/tools.ts:1798, 1829, 1859`; motor en
`packages/engine/src/append.ts:501, 631, 789`). El ciclo ya guarda la referencia
de build y el ambiente, y exige ambos al cerrar (`append.ts:525-587, 656-669`).
Lo que no guarda es lo que quedó sin cubrir: `findings` se escribe siempre vacío
(`append.ts:604, 682`). La referencia son los reportes de la comunidad de
gentle-ai que declaraban qué no habían probado
(`docs/architecture/the-organic-rdd-story.md`, `66bf3e1`).

### Requirement: R-QAC-001 — Cerrar un ciclo de QA DEBE declarar lo que quedó sin cubrir

`cerrar_qa` y `valmen qa-close` reciben una lista de lo no cubierto, un
elemento por línea, o la declaración explícita de que se cubrió todo. Cerrar sin
ninguna de las dos es un error que nombra el parámetro. Se guarda en la entrada
de cierre del bloque `QA`.

#### Scenario: Cierre con huecos
- **GIVEN** un ciclo de QA abierto
- **WHEN** se cierra con `approved` y sin cubrir «modo oscuro en iPad»
- **THEN** la entrada de cierre guarda ese elemento junto con el resultado y la confirmación del PO

#### Scenario: Cierre sin declarar
- **GIVEN** un ciclo de QA abierto
- **WHEN** se cierra sin lista ni declaración de cobertura completa
- **THEN** el cierre falla nombrando el parámetro que falta y el ticket no cambia

### Requirement: R-QAC-002 — Los ciclos cerrados antes del cambio DEBEN seguir leyéndose

Un ciclo sin el campo nuevo se lee como «sin declarar»; no se reescribe ni hace
fallar la validación del registro.

#### Scenario: Registro con ciclos viejos
- **GIVEN** el registro actual con ciclos cerrados sin el campo
- **WHEN** se corre `valmen validate --all`
- **THEN** no aparecen errores nuevos

### Requirement: R-QAC-003 — La vista del ticket DEBE mostrar lo no cubierto de cada ciclo

#### Scenario: Ticket con un ciclo que dejó huecos
- **GIVEN** un ticket cuyo último ciclo declaró dos elementos sin cubrir
- **WHEN** se abre el ticket en Mission Control
- **THEN** la sección de QA lista los dos elementos bajo el ciclo
