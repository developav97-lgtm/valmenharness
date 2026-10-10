# s2 — Código nuevo sin uso

Dominio del CI (`.github/workflows/verificacion.yml`) y de la calidad de los
paquetes. `@typescript-eslint/no-unused-vars` (vía `tseslint.configs.recommended`,
`eslint.config.js:23-52`) caza variables e imports sin usar dentro de un
archivo, pero nada detecta una exportación que ningún paquete, prueba ni
binario consume. El `tsconfig.json` no tiene `noUnusedLocals` y el comentario de
`eslint.config.js:7-8` atribuye a TypeScript una cobertura que viene del lint.

### Requirement: R-MUE-001 — El CI DEBE rechazar una exportación nueva que nada consume

Un paso del CI lista las exportaciones de `packages/*/src` sin consumidor
(ningún import desde otro módulo, prueba, script ni entrada `bin`) y las compara
con una línea base versionada. Una exportación sin consumidor que no está en la
línea base hace fallar el paso, nombrando el símbolo y el archivo.

#### Scenario: Función nueva que nadie llama
- **GIVEN** una función exportada en `packages/engine/src/` sin ningún import
- **WHEN** corre el CI
- **THEN** el paso falla con el nombre de la función y su archivo

#### Scenario: Símbolo usado solo por pruebas
- **GIVEN** una exportación que solo importa un archivo de `tests/`
- **WHEN** corre el paso
- **THEN** cuenta como consumida y no falla

### Requirement: R-MUE-002 — La línea base DEBE poder solo achicarse

Lo que hoy existe sin consumidor entra a la línea base al activar el paso. Una
entrada que deja de ser cierta (se borró el símbolo o ganó un consumidor) hace
fallar el paso hasta que se quita de la línea base; agregar entradas exige
editar el archivo a mano en el mismo commit, a la vista de la revisión.

#### Scenario: Se borra código muerto
- **GIVEN** un símbolo de la línea base que se elimina del código
- **WHEN** corre el paso
- **THEN** falla pidiendo quitar esa entrada de la línea base

### Requirement: R-MUE-003 — El paso DEBE correr también en local con un comando del package.json

`npm run` expone el mismo chequeo que corre el CI, para correrlo antes de
commitear. La herramienta elegida es una dependencia de desarrollo: no entra a
`@valmen/core` ni a ningún paquete publicado.

#### Scenario: Chequeo local
- **GIVEN** el árbol limpio de `main`
- **WHEN** se corre el script del package.json
- **THEN** sale con 0 y dice cuántas entradas tiene la línea base
