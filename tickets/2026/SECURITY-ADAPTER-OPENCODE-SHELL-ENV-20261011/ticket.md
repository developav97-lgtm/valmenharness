---
schema_version: 2
id: SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011
title: OpenCode no deniega la lectura de .env por el shell (cat .env)
type: SECURITY
module: ADAPTER
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-11
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011

## Solicitud original

Hallado al probar SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 el 2026-10-11 con OpenCode 2.0.16 en modo --auto: la herramienta read sobre .env da «Permission denied: read», pero el shell ejecutó «cat .env» y devolvió su contenido. La configuración proyectada (.opencode/opencode.json) trae los patrones de .env solo en read y edit; las reglas del shell (bash) solo cubren formas de git. Decidir qué formas de lectura por shell (cat, head, tail, less, grep, sed, source) se deniegan para las rutas sensibles de SENSITIVE_PATH_GLOBS en packages/core/src/denied.ts, como ya hace la proyección de Claude Code con «cat .env», y qué límites quedan documentados.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
1. ¿Qué forma tiene la denegación de lectura por el shell de OpenCode? (a) **Por mención**: se niega todo comando `bash` que nombre una ruta sensible (un patrón `*<fragmento>*` por cada glob de `SENSITIVE_PATH_GLOBS`, unos 10 patrones); cubre cualquier lector, pero también frena `git check-ignore .env` o `echo .env >> .gitignore`. (b) **Por lector**: se niega un conjunto fijo de lectores (`cat`, `head`, `tail`, `less`, `more`, `grep`, `rg`, `sed`, `awk`, `source`) seguido de la ruta sensible, con y sin operador antes (`&&`, `;`, `|`); menos falsos positivos, pero un lector fuera de la lista (`python -c`, `xxd`, `od`) pasa y hay cientos de patrones por archivo de agente.

## Descripción funcional

- Alcance: la proyección de `valmen sync` hacia OpenCode: las reglas `permission.bash` de `.opencode/opencode.json` y de cada agente proyectado, a partir de `SENSITIVE_PATH_GLOBS` (`packages/core/src/denied.ts:45`). Fuera de alcance: Codex (sus reglas ya no expresan rutas y `docs/07-ADAPTADORES.md` lo declara) y Claude Code.
- Usuario o rol afectado: la persona que usa OpenCode con `.env`, claves o `.pem` en el proyecto, y los agentes de OpenCode de ese proyecto, incluida la ejecución autónoma (`--auto`).
- Comportamiento actual: con OpenCode 2.0.16 en `--auto`, la herramienta `read` sobre `.env` devuelve «Permission denied: read», pero `cat .env` por el shell se ejecutó y devolvió `SECRETO=abc123` (prueba del 2026-10-11 en un proyecto temporal con `valmen sync`).
- Comportamiento esperado: un comando de shell que lee una ruta de `SENSITIVE_PATH_GLOBS` queda denegado en OpenCode, igual que su `read`, con los límites que queden documentados y listados como «no aplicados» cuando no se puedan expresar.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): `opencodeRules()` (`packages/adapter/src/denied-clients.ts:130-141`) genera las rutas sensibles solo para las herramientas `read` y `edit` y, para `bash`, únicamente las formas de git de `DENIED_GIT_COMMANDS`; el objeto `bash` de `opencodeDenyPermission()` (`:146-152`) y de `opencodeAgentPermission()` (`:155-161`) no lleva ninguna ruta. En el archivo proyectado del laboratorio: `bash` sin ningún patrón con `env`, `read` con `.env`, `*/.env`, `.env.*`, `*/.env.*`.
- Corrección a la solicitud: la proyección de Claude Code tampoco escribe reglas `Bash` para rutas (`packages/adapter/src/claude-code.ts:73-74` solo emite `Read(...)` y `Edit(...)`); el `cat .env` denegado en `tests/denegaciones-claude-bypass.test.ts:29` lo bloquea el propio Claude Code, que aplica las reglas `Read` a los lectores de shell conocidos. OpenCode no tiene ese comportamiento: de ahí el hueco.
- Hipótesis pendientes: (1) que `permission.bash` con un patrón `cat *.env*` deniegue `cat .env`, `cat ./.env` y `cd x && cat .env` en 2.0.16; sin probar. (2) cuántos patrones soporta cada archivo de agente sin pasar el tope de tamaño de `agents-size.ts`.
- Consumidores afectados: `valmen sync` y `valmen doctor` (reporte de «no aplicadas»), los 17 archivos que `.opencode/` proyecta en un proyecto con el runtime `opencode`, y `tests/denegados-codex-opencode.test.ts` y `tests/proyeccion-denegados.test.ts`, que fijan el contenido proyectado.
- Archivos y flujo investigados: `packages/adapter/src/denied-clients.ts:100-200`, `packages/adapter/src/claude-code.ts:60-110`, `packages/core/src/denied.ts:40-60`, `tests/denegaciones-claude-bypass.test.ts:29`, y la prueba en vivo con `opencode run --standalone --auto --format json`. La memoria del proyecto (`valmen memory search`) no tiene nada resuelto sobre este síntoma.
- Riesgos y compatibilidad: un patrón por mención frena comandos legítimos que nombran `.env`; uno por lector deja pasar los lectores que no estén en la lista. En cualquiera, `python -c`, `$(<.env)` o un alias eluden el patrón: es un límite que se documenta, no se promete cerrar. Un archivo `.opencode/opencode.json` que la persona ya editó se fusiona sin pisar sus valores (R-PER-002).
- Impactos de sync, migración, Docker o despliegue: `sync` reescribe la proyección de OpenCode en los proyectos que lo usan (aditivo, fusionado); sin migración, contenedores ni despliegue. Es SECURITY: el plan lo aprueba siempre una persona.

## Plan

- Gate de plan y aprobación:
- Decisión del PO (2026-10-11, «Por mención (Recomendado)»): se niega todo comando `bash` que nombre una ruta sensible. Comprobado en OpenCode 2.0.16 en un laboratorio: el patrón `*.env*` niega `cat .env` y `cd . && cat ./.env`, deja pasar `cat a.txt` y niega también `git check-ignore .env` (el falso positivo que se acepta).
- Tamaño previsto: 13 criterios; unas 60 líneas de producción y unas 120 de pruebas.
- Pasos ordenados:
  1. `packages/adapter/src/denied-clients.ts`: añadir `opencodeMentionPatterns(glob)` junto a `opencodePathPatterns` (`:105`): del glob toma el nombre base sin `**/` ni `/**` y devuelve `*<raíz>*` (`.env`, `.env.*` → `*.env*`; `.credentials`; `id_rsa` e `id_rsa.pub` → `*id_rsa*`; `id_ed25519`; `*.pem` → `*.pem*`; `*.key`; `*.p12`; `~/.ssh/**` → `*.ssh/*`). Cubre C1.
  2. Mismo archivo, `opencodeRules()` (`:130-141`): para cada glob de `SENSITIVE_PATH_GLOBS` añadir una regla `bash <glob>` con esos patrones, **antes** de las de git, para que la última clave de `bash` siga siendo `git * clean * -Xfd*`. Cubre C1, C2, C10.
  3. Mismo archivo, `opencodeAgentPermission()` (`:155-161`) y `mergeOpencodeDenyConfig` (`:239`): sin cambio de código si leen `opencodeRules()`; comprobar que cada agente proyectado y la fusión con un `.opencode/opencode.json` existente llevan los patrones sin pisar los de la persona. Cubre C3, C4.
  4. `missingOpencodeDenyRules` y `denyNotApplied` (`:178`, `:279-330`): sin cambio de código si leen `opencodeRules()`; comprobar que nombran un patrón borrado y que con `opencode.jsonc` las reglas nuevas salen como no aplicadas. Cubre C5, C6.
  5. `DENY_CLIENT_NOTICE.opencode` (`:41-42`) y `docs/07-ADAPTADORES.md`: decir que la denegación del shell es por mención (frena comandos legítimos que nombran la ruta) y que `python -c`, `$(<archivo)` o un alias la eluden. Cubre C11, C12, C13.
  6. Pruebas, primero en rojo (EST-010): en `tests/denegados-codex-opencode.test.ts`, una prueba por C1…C6 y C10, y la de regresión de los cuatro patrones de git. **Prueba existente que cambia a propósito (EST-009, la autoriza este plan):** la de `:218-220`, que cuenta las reglas no aplicadas cuando `permission` es texto, pasa de `SENSITIVE_PATH_GLOBS.length * 2 + DENIED_GIT_COMMANDS.length + 1` a `SENSITIVE_PATH_GLOBS.length * 3 + DENIED_GIT_COMMANDS.length + 1`, porque hay una regla `bash` por glob más. Ninguna otra existente se edita; si otra se pone en rojo, se detiene y se reporta.
  7. Verificación manual en un proyecto temporal con `valmen sync` y OpenCode 2.0.16 en `--auto`: `cat .env`, `cd . && cat ./.env` y `cat a.txt`. Cubre C7, C8, C9.
- Impactos declarados:
  - Sincronización: `valmen sync` suma patrones `bash` al `.opencode/opencode.json` y a los agentes de los proyectos con el runtime `opencode`; es aditivo y la fusión no pisa valores de la persona (R-PER-002). Los clientes que no actualicen no los tienen hasta correr `sync`.
  - Migración: ninguna. Contenedores: ninguno.
- Rollback (obligatorio): revertir el commit del ticket devuelve el generador; los patrones ya escritos en los `.opencode/opencode.json` de los proyectos quedan hasta que la persona los borre, porque la fusión nunca elimina claves. Un patrón que estorba se borra a mano del archivo del proyecto; `sync` lo vuelve a sumar mientras el generador lo tenga.

## Criterios de aceptación

- [ ] C1. `opencodeDenyPermission().bash` trae un patrón `deny` por cada raíz de ruta de `SENSITIVE_PATH_GLOBS`, con la forma `*<raíz>*`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "por mención" -->
- [ ] C2. La última clave de `bash` en el archivo proyectado sigue siendo `git * clean * -Xfd*`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "última clave" -->
- [ ] C3. Cada agente proyectado de OpenCode lleva los patrones de mención en su `bash`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "agente proyectado" -->
- [ ] C4. Un `.opencode/opencode.json` con un `bash` propio recibe los patrones sin perder las claves de la persona
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "fusiona" -->
- [ ] C5. `missingOpencodeDenyRules` nombra un patrón de mención que falta en el archivo
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "patrón de mención que falta" -->
- [ ] C6. Con `opencode.jsonc`, `denyNotApplied` lista las reglas de mención como no aplicadas
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "no aplicadas" -->
- [ ] C7. Con OpenCode 2.0.16 en modo `--auto`, `cat .env` por el shell da `Permission denied: shell`
      <!-- verify: manual -->
- [ ] C8. Con OpenCode 2.0.16 en modo `--auto`, `cd . && cat ./.env` da `Permission denied: shell`
      <!-- verify: manual -->
- [ ] C9. Con OpenCode 2.0.16 en modo `--auto`, `cat a.txt` se ejecuta
      <!-- verify: manual -->
- [ ] C10. Cada forma de `DENIED_GIT_COMMANDS` sigue dando sus cuatro patrones `bash` `deny`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "cuatro patrones bash deny" -->
- [ ] C11. `docs/07-ADAPTADORES.md` declara que la denegación del shell de OpenCode es por mención
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "documentación de la mención" -->
- [ ] C13. `docs/07-ADAPTADORES.md` declara que `python -c` elude la denegación del shell de OpenCode
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "documentación del límite" -->
- [ ] C12. El aviso de OpenCode de `sync` menciona que el shell se niega por mención
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "aviso del shell" -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

## QA

```json
[]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[]
```

## Consumo de IA

```json
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-11",
    "at": "2026-10-11T17:51:05.430Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-11",
    "at": "2026-10-11T18:08:13.429Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-11",
    "at": "2026-10-11T18:37:19.448Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
