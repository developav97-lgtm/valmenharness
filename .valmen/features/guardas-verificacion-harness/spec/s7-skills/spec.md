# s7 — Presupuesto de las skills

Dominio de la proyección de skills (`packages/adapter/src/skills.ts`). Cada skill
se carga entera cuando se activa. Hoy solo hay mínimos (`tests/skills.test.ts:192-198`)
y un tope particular de 6 500 bytes para `corrida-orquestada`
(`tests/skill-corrida-orquestada.test.ts:26, 91`). El precedente es el
presupuesto del `AGENTS.md`: clave `agents-md-budget` en bytes, que avisa y no
bloquea (`packages/adapter/src/agents-size.ts:45-95`). Tamaños en
`.valmen/skills/` el 2026-10-10: `planificacion` 10 584 B,
`programar-trabajo-de-tickets` 11 772 B, `feature` 6 668 B, `revision-final`
6 554 B; las otras ocho, entre 3 631 y 6 125 B.

### Requirement: R-SKL-001 — `valmen sync` DEBE avisar de cada skill que pasa el presupuesto declarado

Una clave de `.valmen/config.yaml`, con la misma forma y validación que
`agents-md-budget`, fija el tope en bytes por skill. `sync` y `sync --check`
listan las skills que lo pasan con su tamaño y su estimación de tokens; avisa y
no bloquea. Sin la clave no hay aviso.

#### Scenario: Skill pasada de tamaño
- **GIVEN** un presupuesto de 6 500 bytes y `planificacion` con 10 584
- **WHEN** se corre `valmen sync`
- **THEN** la salida avisa `planificacion` con sus bytes y tokens estimados, y el comando sale con 0

### Requirement: R-SKL-002 — El catálogo publicado DEBE quedar bajo un tope comprobado por prueba

Una prueba exige que cada `skills/<id>/SKILL.md` del catálogo quede bajo el
presupuesto que declara este repositorio, y reemplaza el tope particular de
`tests/skill-corrida-orquestada.test.ts`.

#### Scenario: Skill del catálogo que crece
- **GIVEN** una skill del catálogo que pasa el tope
- **WHEN** se corre `npx vitest run`
- **THEN** la prueba falla con el nombre y el tamaño

### Requirement: R-SKL-003 — Las skills que pasan el tope DEBEN recortarse sin perder reglas

El detalle que no decide la conducta (ejemplos, formatos, historia) pasa a un
archivo de referencia que la skill cita y el agente lee solo cuando lo necesita.
Cada regla obligatoria de la versión anterior sigue en el cuerpo.

#### Scenario: Recorte de planificacion
- **GIVEN** la versión actual de `planificacion` y la recortada
- **WHEN** se comparan sus reglas obligatorias
- **THEN** todas siguen en el cuerpo, y lo que salió está en el archivo de referencia citado
