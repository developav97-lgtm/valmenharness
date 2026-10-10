# s3 — Medición de fricción del CLI

Dominio nuevo: medir cuánto se atasca quien opera `valmen` y si cada bloqueo le
dice cómo salir. Hoy nada recorre el CLI para contar bloqueos; lo más cercano es
`scripts/medir-salida-s1-s3.mjs`, que mide validación y precisión de compuertas.
Las pruebas ya tienen con qué armar un registro temporal
(`tests/helpers/fixtures.ts:87,235`, `tests/helpers/ola.ts:27`,
`tests/helpers/worktree-lab.ts:25`). La referencia es `bench/` de gentle-ai
(`66bf3e1`, `bench/README.md`).

### Requirement: R-FRI-001 — La medición DEBE recorrer un binario `valmen` dado, sin modelo y aislada

Corre el binario que recibe por `--binary` como subproceso, cada recorrido en
un directorio temporal con su propio `HOME`, su registro y su repositorio git,
sin llamar a ningún modelo ni a la red. Vive fuera de `packages/` y no entra al
build ni a `npm test` del producto.

#### Scenario: Medir una versión anterior
- **GIVEN** el binario de un commit anterior y el actual
- **WHEN** se corre la medición contra cada uno
- **THEN** ambas corridas usan los mismos recorridos y escriben un archivo de resultados cada una, sin tocar `~/.valmen` ni el repositorio real

### Requirement: R-FRI-002 — Cada bloqueo DEBE clasificarse en código como en banda, fuera de banda o callejón sin salida

En banda: el mensaje nombra un comando que existe y, al correrlo, la operación
deja de estar bloqueada. Fuera de banda: bloquea sin nombrar una salida.
Callejón sin salida: nombra una salida que no existe o que no saca del bloqueo.
Un rechazo que el diseño declara correcto se marca como tal con su motivo y no
cuenta como fricción.

#### Scenario: Salto ilegal de estado
- **GIVEN** un ticket en `intake`
- **WHEN** el recorrido pide moverlo a `approved`
- **THEN** el bloqueo se clasifica según si el mensaje nombra la salida y si correrla destraba el ticket

### Requirement: R-FRI-003 — El corpus inicial DEBE cubrir los rechazos frecuentes del motor

Al menos: salto ilegal de estado, compuerta pedida sin su recibo previo,
`sync --check` desactualizado, integración con el árbol sucio, `resume` de un
ticket que no existe, bandera mal escrita, QA sin referencia de build y cierre
sin `## Consumo de IA`.

#### Scenario: Corpus mínimo
- **GIVEN** la medición recién instalada
- **WHEN** se lista el corpus
- **THEN** aparecen los ocho recorridos con su nombre y la operación que bloquean

### Requirement: R-FRI-004 — La medición DEBE comparar dos corridas y fallar si un recorrido no pudo medirse

`compare` muestra por recorrido y en total los bloqueos en banda, fuera de banda
y callejones de dos archivos de resultados. Una corrida en la que un recorrido
no pudo armar su escenario sale con código distinto de 0, después de escribir el
archivo de resultados; un recorrido que el binario no soporta se marca como no
soportado y no falla la corrida.

#### Scenario: Recorrido que no pudo armarse
- **GIVEN** un recorrido cuyo escenario falla al crearse
- **WHEN** termina la corrida
- **THEN** el archivo de resultados existe, marca ese recorrido como fallido y el proceso sale con código distinto de 0
