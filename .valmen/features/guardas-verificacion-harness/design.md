# Diseño — Guardas y verificación del propio harness

Decisiones técnicas propuestas. Cada una se confirma en el plan del ticket que
la implementa; la revisión del grafo es el momento barato de cambiarlas.

## D1 — De dónde salen los comandos válidos (s1)

- A) Extraer los comandos del texto de `USAGE` con expresiones regulares.
  Barato, pero valida contra la ayuda y no contra lo que el CLI despacha: un
  comando documentado y sin despacho pasaría.
- B) **Propuesta:** una tabla declarativa de comandos y banderas que usan el
  despacho, el parser y la prueba de coherencia. `USAGE` sigue siendo texto,
  pero la prueba exige que todo comando citado allí esté en la tabla.

## D2 — Cómo se detectan las exportaciones sin uso (s2)

- A) **Propuesta:** `knip` como dependencia de desarrollo, con su salida JSON
  comparada contra una línea base versionada por un script propio. Entiende
  workspaces, entradas `bin` y pruebas sin configuración a mano.
- B) Un script propio con la API del compilador de TypeScript, que ya es
  dependencia. Evita una dependencia nueva, pero hay que mantener la resolución
  de entradas y de workspaces.

## D3 — Dónde vive la medición de fricción (s3)

- **Propuesta:** `bench/friccion/` en la raíz, fuera de los workspaces de
  `packages/*`, compilado aparte y sin importar nada de `packages/`: recibe el
  binario por `--binary` y lo maneja como caja negra. Así puede medir un binario
  viejo con el mismo código y no puede romper el build del producto. El costo
  es que el CI no lo compila solo: se agrega un paso.

## D4 — La revisión del diff es una compuerta nueva (s4)

- A) Ampliar `qa-mechanical`. Mezcla comandos deterministas con preguntas a un
  modelo en un mismo recibo.
- B) **Propuesta:** una compuerta `code-review` en `GATES`
  (`packages/gate/src/definitions.ts:377-381`), exigida junto con
  `qa-mechanical` al pasar de `in_progress` a `awaiting_user_tests`. El riesgo
  lo calcula el motor (reutilizando `CATEGORIAS_DE_RUTA` de
  `packages/engine/src/qa-eligibility.ts:26-33`, extraído a un módulo común). Los
  revisores corren con `claude -p` sin herramientas, como el juez actual
  (`packages/credentials/src/claude-cli.ts:132-165`), con el diff y los archivos
  tocados en el prompt; los dos de SECURITY corren a la vez. El árbol revisado
  es `<commit>^{tree}` si hay commit y, si no, el hash de
  `packages/engine/src/references.ts:145-192`.

## D5 — Una sola lista de lo prohibido (s5)

- **Propuesta:** la lista de rutas sensibles y comandos que nunca se
  automatizan se mueve a `@valmen/core` (sin red ni disco, como exige el
  paquete). De ella leen `integration-rules.ts`, `qa-agent-git.ts`,
  `worktree-git.ts` y el adaptador de Claude Code. Un cambio en la lista llega al
  motor y a los agentes a la vez.

## D6 — Cómo se reemplaza el modelo en la prueba de punta a punta (s6)

- **Propuesta:** una variable `VALMEN_BASE_URL_<TRANSPORTE>` (y una para jev),
  leída en `packages/credentials/src/endpoints.ts`, que solo acepta
  `127.0.0.1` o `localhost`. Para el transporte `claude-code` se usa
  `VALMEN_CLAUDE_BIN`, que ya existe, apuntando a un ejecutable que lee el guion.
  No se agrega una costura de inyección al CLI: la prueba ejercita el binario
  tal como lo usa una persona.

## D7 — Presupuesto y referencias de las skills (s7)

- **Propuesta:** clave `skill-budget` en bytes, con la misma validación que
  `agents-md-budget`. Este repositorio declara 6 500, el tope que ya usa
  `tests/skill-corrida-orquestada.test.ts`. El detalle recortado va a
  `.valmen/skills/<id>/referencias/*.md`, y la proyección copia esa carpeta
  junto al `SKILL.md` en cada runtime. Con ese tope, `feature` (6 668 B) y
  `revision-final` (6 554 B) también quedan apenas por encima y entran en el
  recorte.
