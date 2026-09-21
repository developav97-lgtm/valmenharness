# Stack y arquitectura

Monorepo de TypeScript con npm workspaces. Node 24. Sin dependencias externas en
el motor: `@valmen/core` no toca la red y solo `fs.ts` toca el disco.

Los paquetes se parten cuando duele, no antes. Hoy son diez y el orden importa:
`core` no depende de nadie; `adapter` y `gate` dependen de `core`; `engine` es el
motor del registro y lo consumen el CLI y el servidor.

## Pruebas

`npx vitest run`. Los tests de equivalencia contra la implementación de referencia
están desactivados por defecto: se activan con `VALMEN_REFERENCE_TICKET_PY`.
