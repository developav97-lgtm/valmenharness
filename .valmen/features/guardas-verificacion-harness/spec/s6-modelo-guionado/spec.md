# s6 — Prueba de punta a punta con modelo guionado

Dominio de las pruebas de las compuertas que llaman a un modelo. Hoy todo pasa
por `callChat` (`packages/credentials/src/chat.ts:166`): `claude -p` como
subproceso (`packages/credentials/src/claude-cli.ts:132-165, 376`) o `fetch` con
tres dialectos. Las URL base están fijas por transporte
(`packages/credentials/src/endpoints.ts:129-238`) y jev llama directo a
OpenRouter (`packages/gate-jev/src/jev.ts:25, 207`). Las pruebas simulan el
modelo inyectando `judge`, `jev`, `fetchImpl` o `cliRunner` (p. ej.
`tests/cascada-verificada.test.ts:176`), pero el CLI `valmen gate` no tiene
costura (`packages/cli/src/main.ts:1630`), así que nada prueba el camino real
—binario, configuración de `routing.yaml`, transporte, recibo— sin gastar
tokens. `VALMEN_CLAUDE_BIN` ya permite apuntar a un `claude` falso
(`tests/claude-cli.test.ts:616-637`). La referencia es
`docs/testing-agents-deterministically.md` de gentle-ai (`66bf3e1`).

### Requirement: R-GUI-001 — Los transportes HTTP DEBEN aceptar una URL base de prueba por variable de entorno

Una variable de entorno documentada reemplaza la URL base de un transporte (y la
de jev) solo cuando apunta a `127.0.0.1` o `localhost`; cualquier otro valor es
un error. Sin la variable, el comportamiento no cambia.

#### Scenario: URL externa rechazada
- **GIVEN** la variable apuntando a un host que no es `127.0.0.1` ni `localhost`
- **WHEN** corre una compuerta
- **THEN** falla diciendo que la URL de prueba solo admite localhost

### Requirement: R-GUI-002 — Una prueba DEBE correr `valmen gate` con la cascada completa contra un modelo guionado local

Un servidor HTTP local y un `claude` falso devuelven una secuencia guionada de
respuestas. La prueba corre el binario compilado como subproceso sobre un
registro temporal, recorre productor, verificador y escalado de la cascada, y
comprueba el recibo escrito: evaluador, proposiciones, respuestas, resultado y
que no hubo llamadas fuera de localhost.

#### Scenario: Verificador que no respalda una proposición
- **GIVEN** un guion donde el productor aprueba y el verificador rechaza una proposición
- **WHEN** se corre `valmen gate analysis --id <ID>` sobre el ticket temporal
- **THEN** la proposición vuelve al modelo de escalado y el recibo guarda las tres respuestas

### Requirement: R-GUI-003 — La prueba DEBE correr en `npm test` sin claves ni red

Corre en el CI de `.github/workflows/verificacion.yml` sin secretos. Si el
binario no está compilado, la prueba falla diciendo qué compilar; no se salta en
silencio.

#### Scenario: CI sin credenciales
- **GIVEN** el CI sin ninguna variable `*_API_KEY`
- **WHEN** corre `npm test`
- **THEN** la prueba de punta a punta pasa y no abre conexiones fuera de localhost

### Requirement: R-GUI-004 — Un guion que se agota NO DEBE producir un recibo aprobado

Si el modelo guionado recibe más llamadas que respuestas tiene, responde un
error y la compuerta falla o escala, nunca aprueba.

#### Scenario: Llamada de más
- **GIVEN** un guion con dos respuestas y una cascada que hace tres llamadas
- **WHEN** corre la compuerta
- **THEN** el recibo no es `approve` y la prueba reporta la llamada sin guion
