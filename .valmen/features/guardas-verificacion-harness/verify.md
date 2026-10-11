# Verificación — Guardas y verificación del propio harness

Feature: `guardas-verificacion-harness` · generado el 2026-10-11 desde el registro de tickets.

Tickets del grafo: 17 · cerrados: 17 · pendientes: 0.

## Tickets

### FEATURE-CLI-TABLA-COMANDOS-20261010 — Tabla declarativa de comandos y banderas que usa el despacho

- Estado: closed · QA: approved
- Cierre técnico: Tabla declarativa de comandos y banderas (packages/cli/src/command-table.ts) que usan el parser y el despacho de main.ts; una bandera no declarada para el comando sale con código 2 y lista las válidas; se corrigen --version y validate --inventada; prueba de coherencia entre tabla, ramas de despacho y USAGE.
- Cierre funcional: El CLI valmen rechaza una bandera mal escrita nombrando las que sí existen, y la ayuda, la tabla y el despacho no pueden divergir sin que una prueba falle.
- Evidencia:
  - automated-test: npx vitest run tests/cli-tabla-comandos.test.ts: 27 de 27; suite completa en main tras integrar la ola: 234 archivos y 4008 pruebas en verde; npx tsc --build tsconfig.build.json y npx tsc --noEmit -p tsconfig.json sin salida; compuerta qa-mechanical con evaluador command: APPROVE (C1 a C20)

### FEATURE-CLI-PRUEBA-MENSAJES-20261010 — Prueba de coherencia de los mensajes de bloqueo del CLI y el MCP

- Estado: closed · QA: approved
- Cierre técnico: Prueba de coherencia que recorre todo mensaje del CLI y del MCP que cita un comando o bandera con comillas invertidas y comprueba que existen en la tabla de comandos y en DEFINICIONES; corrige las dos citas reales con bandera inexistente (hermes.ts:636 y routing.ts:145); reemplaza el bloque C20 de tests/skill-corrida-orquestada.test.ts; saca 10 entradas de la línea base de exportaciones.
- Cierre funcional: Un mensaje de bloqueo ya no puede nombrar un comando o una bandera que no existe sin que una prueba falle.
- Evidencia:
  - automated-test: npx vitest run tests/cli-mensajes-coherencia.test.ts: 18 de 18; hermes-notify, roles-ejecucion, routing, skill-corrida-orquestada y cli-tabla-comandos en verde; suite completa de main: 242 archivos y 4298 pruebas en verde; tsc sin errores; compuerta qa-mechanical (command): APPROVE; C22 verificado por el orquestador: grep -c 'los comandos citados (C20)' tests/skill-corrida-orquestada.test.ts da 0

### CHORE-CI-EXPORTS-SIN-USO-20261010 — Guarda de exportaciones sin uso con knip y línea base decreciente

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado por comandos; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Comandos de los criterios en verde en main y pasos manuales reproducidos en laboratorio desechable (docs/guia-pruebas-jornada-20261010.md)

### FEATURE-BENCH-FRICCION-RUNNER-20261010 — Medición de fricción aislada sobre un binario valmen con clasificador

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado por comandos; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Comandos de los criterios en verde en main y pasos manuales reproducidos en laboratorio desechable (docs/guia-pruebas-jornada-20261010.md)

### FEATURE-BENCH-FRICCION-CORPUS-20261010 — Corpus inicial de rechazos y comparación de dos corridas

- Estado: closed · QA: approved
- Cierre técnico: Corpus de ocho recorridos del CLI valmen que provocan un bloqueo (salto ilegal de estado, compuerta sin recibo, sync --check desactualizado, integración con árbol sucio, resume inexistente, bandera mal escrita, QA sin build, cierre sin consumo), con su clasificación en banda, fuera de banda, callejón sin salida o rechazo correcto, y el comando compare de dos corridas.
- Cierre funcional: Se puede medir cuánto se atasca quien opera el CLI y comparar dos versiones del binario. Primera medición del binario actual: 2 en banda, 4 fuera de banda, 1 callejón sin salida (cierre sin Consumo de IA) y 1 rechazo correcto.
- Evidencia:
  - automated-test: npx vitest run --config bench/friccion/vitest.config.ts: 6 archivos y 83 pruebas en verde; suite completa de main en verde (4298); tsc de bench y de la raíz sin errores; compuerta qa-mechanical (command): APPROVE; C38 verificado por el orquestador: npx tsc -p bench/friccion/tsconfig.build.json, cli.js list (8 recorridos), dos corridas de run contra packages/cli/dist/main.js y compare: diferencia 0 en los seis totales

### FEATURE-GATE-ARBOL-QA-RECIBO-20261010 — Recibo de qa-mechanical atado al árbol probado y rechazo si cambia

- Estado: closed · QA: approved
- Cierre técnico: El recibo de qa-mechanical guarda el árbol probado (testedTree, calculado en packages/engine/src/arbol-probado.ts sin tickets/, .valmen/ ni .valmen.lock) y la entrega a awaiting_user_tests lo compara con el árbol actual dentro de un repositorio git; un recibo sin árbol se rechaza y pide repetir qa-mechanical; los recibos ya escritos siguen leyéndose.
- Cierre funcional: Si el código cambia después de pasar la verificación mecánica, el motor ya no entrega el ticket y dice qué compuerta repetir; lo que se entrega es lo que se probó.
- Evidencia:
  - automated-test: npx vitest run tests/arbol-probado.test.ts: 21 de 21; tests/delegation.test.ts: 18 de 18; las 10 suites que importan el estado de la compuerta: 195 de 195; suite completa en main tras integrar la ola: 236 archivos y 4043 pruebas en verde; npx tsc --noEmit -p tsconfig.json: 0 errores; npm run exports:check sin hallazgos; compuerta qa-mechanical con evaluador command: APPROVE (23 de 23 criterios)

### FEATURE-ENGINE-RIESGO-REVISION-20261010 — Cálculo en código del riesgo de la revisión por lo tocado

- Estado: closed · QA: approved
- Cierre técnico: El riesgo bajo, medio o alto de un diff se calcula en código (packages/engine/src/review-risk.ts) a partir de las categorías de ruta críticas, los impactos declarados y el tipo SECURITY; CATEGORIAS_DE_RUTA se extrae a un módulo común (path-categories.ts) que también usa la elegibilidad de la QA por agente.
- Cierre funcional: El motor sabe cuán riesgoso es lo que un ticket cambió según lo que tocó y no según cuánto cambió.
- Evidencia:
  - automated-test: npx vitest run tests/riesgo-revision.test.ts: 42 de 42 (32 nacieron en rojo); 98 de 98 en las 3 pruebas existentes de elegibilidad y qa-agent sin editarlas; suite completa de main en verde (4298); tsc sin errores; compuerta qa-mechanical (command): APPROVE; C33 verificado por el orquestador: una sola definición de CATEGORIAS_DE_RUTA en packages/engine/src/path-categories.ts

### FEATURE-GATE-CODE-REVIEW-20261010 — Compuerta code-review con profundidad por riesgo y una corrección

- Estado: closed · QA: approved
- Cierre técnico: Compuerta code-review (packages/engine/src/code-review.ts y packages/gate-llm-judge/src/revisor-diff.ts): congela el diff contra la base, calcula el riesgo en código y revisa con profundidad según él (bajo sin revisores, medio uno, alto cuatro lentes, SECURITY dos revisores independientes); un hallazgo severo admite una sola corrección acotada; el recibo queda atado al árbol revisado. Se invoca a mano con valmen gate code-review --id <ID> y no afecta ninguna entrega: la exigencia en la entrega y la clave code-review: exigida son de FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010. Mission Control muestra una tarjeta más y valmen simulate y promote-gate rechazan code-review con un error limpio.
- Cierre funcional: El proyecto tiene una revisión del diff entregado cuya profundidad sale del riesgo de lo que se tocó y no de cuánto cambió, con recibo atado al árbol revisado. Hoy es opcional y manual.
- Evidencia:
  - automated-test: npx vitest run tests/code-review.test.ts tests/revisor-diff.test.ts tests/gate-view.test.ts tests/routing.test.ts: en verde; el comando de C31 (16 archivos): 628 pruebas en verde; suite completa de main tras limpiar los .js viejos: 250 archivos y 4701 pruebas en verde; npx tsc --noEmit -p tsconfig.json: 0 errores; npm run exports:check: sin hallazgos (439 entradas); compuerta qa-mechanical (command): APPROVE; los 33 criterios se verifican por comando y están marcados; el revisor contra un proveedor real no se probó (H2 y H4)

### CHORE-CORE-LISTA-DENEGADOS-20261010 — Lista única de rutas y comandos denegados en core

- Estado: closed · QA: approved
- Cierre técnico: Las listas de rutas sensibles y de banderas de git denegadas pasan a packages/core/src/denied.ts (la intersección de las cuatro listas del motor); el motor las lee desde core y cada módulo conserva su extra; una prueba de caracterización demuestra que el comportamiento del motor no cambia.
- Cierre funcional: Hay una sola lista de lo que un agente no puede tocar ni ejecutar, y el motor y la proyección a los agentes la comparten.
- Evidencia:
  - automated-test: npx vitest run tests/lista-denegados.test.ts y las 6 pruebas existentes de las listas: 244 de 244; suite completa de main en verde (4298); tsc sin errores; compuerta qa-mechanical (command): APPROVE; verificados por el orquestador: C16 (la línea base sin diferencias), C18 (eslint de los archivos tocados sale con 0) y C19 (el bloque 'el motor no cambia' pasa 62 de 62 sobre el árbol anterior al cambio, que no tiene packages/core/src/denied.ts)

### SECURITY-CLI-PROYECCION-DENEGADOS-20261010 — Sync proyecta denegaciones a settings.json de Claude Code

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - test: e2e con Claude Code real 3 de 3 y pruebas del ticket en verde, 2026-10-11

### SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 — Proyección de denegaciones a Codex y OpenCode con reporte del resto

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - test: Codex execpolicy forbidden; OpenCode read de .env denegado; pruebas del ticket en verde, 2026-10-11

### FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010 — URL base de prueba por variable de entorno en transportes HTTP

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Pruebas del ticket en verde; C33 por revisión del diff 2eb3e34 el 2026-10-11 sin hallazgos

### FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010 — Prueba de valmen gate con cascada completa y modelo guionado

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Pruebas del ticket en verde; C35 por revisión del diff 2fa8e2a el 2026-10-11 sin hallazgos

### FEATURE-CLI-PRESUPUESTO-SKILLS-20261010 — Clave skill-budget y aviso de valmen sync por skill que lo pasa

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado por comandos; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Comandos de los criterios en verde en main y pasos manuales reproducidos en laboratorio desechable (docs/guia-pruebas-jornada-20261010.md)

### FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010 — Proyección de la carpeta de referencias junto al SKILL.md

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Pruebas del ticket en verde; C19 probado por el PO en Claude Code real: la skill demo leyó referencias/ejemplo.md

### IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010 — Recorte de skills sin perder reglas y prueba del tope del catálogo

- Estado: closed · QA: approved
- Cierre técnico: Entregado y verificado por comandos; ver ## Implementación del ticket
- Cierre funcional: Cumple sus criterios de aceptación, todos marcados
- Evidencia:
  - automated-test: Comandos de los criterios en verde en main y pasos manuales reproducidos en laboratorio desechable (docs/guia-pruebas-jornada-20261010.md)

### FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010 — Exigir la revisión del diff al entregar un ticket y adaptar a quienes entregan

- Estado: closed · QA: approved
- Cierre técnico: Con la clave code-review: exigida en .valmen/config.yaml (leída del árbol de trabajo y de HEAD, de modo que quitarla sin commitear no la quita), la entrega a awaiting_user_tests pide además el recibo de code-review del árbol actual: packages/engine/src/revision-exigida.ts concentra la decisión (revisionPendiente) y la usan transition, next-step, journey-brief, la jornada autónoma y la corrida delegada; un review de code-review lo decide una persona, nunca la delegación. La clave NO se activa en este repositorio.
- Cierre funcional: Un proyecto puede exigir que todo ticket pase la revisión del diff antes de entregarse; sin la clave la entrega de ningún proyecto cambia.
- Evidencia:
  - automated-test: npx vitest run tests/code-review-exigida.test.ts tests/code-review-exigida-entregas.test.ts: 31 de 31 (nacieron en rojo); las 12 suites que el cambio puede romper: 249 de 249 sin editar ninguna prueba existente; suite completa de main tras integrar: 254 archivos y 4912 pruebas en verde; npx tsc --noEmit -p tsconfig.json: 0 errores; npm run format:check y npm run exports:check limpios; compuerta qa-mechanical (command): APPROVE; los 20 criterios se verifican por comando y están marcados

## Pendiente del PO

Nada: todos los tickets están cerrados.
