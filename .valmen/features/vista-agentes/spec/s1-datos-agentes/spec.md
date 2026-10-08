# s1 — Datos de agentes: sesión principal y pregunta pendiente

Dominio del endpoint `GET /api/corrida/agentes` y del lector
`packages/server/src/agentes.ts`. Todo es lectura; la lista blanca de metadatos
no cambia salvo lo que R-DAT-004 habilite con decisión escrita.

### Requirement: R-DAT-001 — El endpoint DEBE devolver la sesión principal como una fila propia

La sesión orquestadora que el lector ya localiza (`sesionOrquestadora`) se
devuelve como primera fila, con `principal: true`, su estado (`trabajando`,
`esperando`, `termino`), su última herramienta y la hora, y `ticket: null`.
Las filas de subagentes llevan `principal: false`.

#### Scenario: Sesión orquestadora con subagentes vivos
- **GIVEN** una sesión de Claude Code con `subagents/agent-*.jsonl` modificados dentro de la ventana
- **WHEN** se consulta `GET /api/corrida/agentes`
- **THEN** la primera fila es la sesión principal con `principal: true`, `ticket: null` y su última herramienta, y le siguen las filas de los subagentes

#### Scenario: Sesión orquestadora sin subagentes todavía
- **GIVEN** una sesión reciente del proyecto sin carpeta `subagents/`
- **WHEN** se consulta el endpoint
- **THEN** la respuesta es la lista vacía, como hoy: la sesión principal solo se emite cuando hay una corrida orquestada

### Requirement: R-DAT-002 — Cada fila DEBE declarar su pregunta pendiente sin copiar su texto

Cuando la última herramienta abierta sin resultado de un agente es
`AskUserQuestion`, la fila lleva `pregunta: { desde: <ISO>, respondidaEn: null }`
y el agente queda `esperando`. Cuando esa herramienta recibe su resultado, la
fila lleva `pregunta: { desde, respondidaEn: <ISO> }` durante los 60 segundos
siguientes y luego `pregunta: null`. Nunca se copia el texto de la pregunta ni
de la respuesta.

#### Scenario: Pregunta abierta
- **GIVEN** un transcript de subagente cuyo último `tool_use` es `AskUserQuestion` sin `tool_result`
- **WHEN** se lee la fila del agente
- **THEN** `estado` es `esperando`, `pregunta.desde` es la hora del `tool_use` y `pregunta.respondidaEn` es `null`

#### Scenario: Pregunta respondida hace menos de un minuto
- **GIVEN** el mismo transcript con el `tool_result` de esa herramienta hace 20 segundos, según el reloj inyectado
- **WHEN** se lee la fila
- **THEN** `pregunta.respondidaEn` es la hora del resultado y el estado vuelve a `trabajando`

#### Scenario: Herramienta abierta que no es una pregunta
- **GIVEN** un transcript cuyo último `tool_use` es `Bash` sin resultado
- **WHEN** se lee la fila
- **THEN** `pregunta` es `null` y el estado sigue siendo `esperando`, como hoy

### Requirement: R-DAT-003 — El endpoint NO DEBE copiar contenido del transcript

La fila sigue siendo lista blanca: nombre de la herramienta, horas, modelo,
esfuerzo, rama, carpeta, ticket y fases. Ningún campo nuevo lleva texto de
prompts, entradas de herramientas ni resultados.

#### Scenario: Respuesta sin contenido
- **GIVEN** cualquier transcript con texto en prompts, entradas y resultados
- **WHEN** se serializa la respuesta del endpoint
- **THEN** ninguno de esos textos aparece en la respuesta

### Requirement: R-DAT-004 — El endpoint PUEDE exponer el texto de la pregunta y la respuesta solo con decisión escrita del PO

Es la opción B. Amplía la lista blanca a la entrada de `AskUserQuestion` y a su
resultado, y por eso no se implementa hasta que el ticket lleve, en «Supuestos y
decisiones pendientes», la decisión del PO con sus palabras: si se habilita, cómo
se habilita y para qué proyectos. Habilitada, la fila lleva
`pregunta.texto` y `pregunta.respuesta`; sin habilitar, R-DAT-002 se cumple tal
cual.

#### Scenario: Opción B habilitada por el PO
- **GIVEN** la decisión escrita y la habilitación que esa decisión defina
- **WHEN** hay una pregunta abierta o respondida hace menos de un minuto
- **THEN** la fila lleva `pregunta.texto` y, si la hay, `pregunta.respuesta`, y nada más del transcript

#### Scenario: Opción B sin habilitar
- **GIVEN** un proyecto sin esa habilitación
- **WHEN** hay una pregunta abierta
- **THEN** la fila cumple R-DAT-002 y no lleva `texto` ni `respuesta`
