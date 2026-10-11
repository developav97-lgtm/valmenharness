# Verificación de criterios: cómo vota el gate de plan

Los comandos permitidos los declara el proyecto en `test-commands` (`.valmen/config.yaml`), y el prefijo se compara por palabra completa. El tiempo máximo de cada comando son 30 segundos y se cambia con `test-timeout` (en segundos): una suite que corre dentro de `docker compose` tarda más, y el gate la corta con un error que parece del comando y no del tope.

Un criterio sin anotación detiene el gate: la ambigüedad se resuelve sola a favor de «seguramente está bien». Un criterio que solo verifica una persona se marca `verify: manual`, que es una declaración, no una omisión.

El gate de plan decide en código, sin preguntarle al modelo, los criterios que se leen en el texto. Un criterio `verify: manual` se cita como «Cn» (o dentro de un rango «Cn–Cm») en el paso del plan que lo verifica: sin esa cita vota 0, y también vota 0 un manual compuesto —una frase con «y» u «o» son dos criterios—, que hay que partir. Un `test:` que solo afirma que la prueba pasa o que el monorepo compila se decide igual: lo cita un paso y el plan nombra el archivo de prueba del comando. El tope de 40 del precheck cuenta afirmaciones y no líneas, así que partir un criterio compuesto no lo supera.

Las dudas del evaluador entre 0,80 y 0,90 suelen venir de criterios compuestos: escríbelos atómicos desde el principio.
