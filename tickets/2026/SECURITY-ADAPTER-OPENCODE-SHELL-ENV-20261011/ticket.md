---
schema_version: 2
id: SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011
title: OpenCode no deniega la lectura de .env por el shell (cat .env)
type: SECURITY
module: ADAPTER
workflow_status: closed
qa_status: approved
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

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Aprobado el 2026-10-11 con «Aprobar tal cual (Recomendado)»; el REVIEW del recibo plan-1 lo decidió el PO.
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

- [x] C1. `opencodeDenyPermission().bash` trae un patrón `deny` por cada raíz de ruta de `SENSITIVE_PATH_GLOBS`, con la forma `*<raíz>*`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "por mención" -->
- [x] C2. La última clave de `bash` en el archivo proyectado sigue siendo `git * clean * -Xfd*`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "última clave" -->
- [x] C3. Cada agente proyectado de OpenCode lleva los patrones de mención en su `bash`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "agente proyectado" -->
- [x] C4. Un `.opencode/opencode.json` con un `bash` propio recibe los patrones sin perder las claves de la persona
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "fusiona" -->
- [x] C5. `missingOpencodeDenyRules` nombra un patrón de mención que falta en el archivo
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "patrón de mención que falta" -->
- [x] C6. Con `opencode.jsonc`, `denyNotApplied` lista las reglas de mención como no aplicadas
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "no aplicadas" -->
- [x] C7. Con OpenCode 2.0.16 en modo `--auto`, `cat .env` por el shell da `Permission denied: shell`
      <!-- verify: manual -->
- [x] C8. Con OpenCode 2.0.16 en modo `--auto`, `cd . && cat ./.env` da `Permission denied: shell`
      <!-- verify: manual -->
- [x] C9. Con OpenCode 2.0.16 en modo `--auto`, `cat a.txt` se ejecuta
      <!-- verify: manual -->
- [x] C10. Cada forma de `DENIED_GIT_COMMANDS` sigue dando sus cuatro patrones `bash` `deny`
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "cuatro patrones bash deny" -->
- [x] C11. `docs/07-ADAPTADORES.md` declara que la denegación del shell de OpenCode es por mención
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "documentación de la mención" -->
- [x] C13. `docs/07-ADAPTADORES.md` declara que `python -c` elude la denegación del shell de OpenCode
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "documentación del límite" -->
- [x] C12. El aviso de OpenCode de `sync` menciona que el shell se niega por mención
      <!-- test: npx vitest run tests/denegados-codex-opencode.test.ts -t "aviso del shell" -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación de SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/denied-clients.ts",
      "tests/denegados-codex-opencode.test.ts",
      "docs/07-ADAPTADORES.md"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- 2026-10-11, parada por EST-009. Con el código del plan (`opencodeMentionPattern` y las reglas `bash <glob>` antes de las de git en `packages/adapter/src/denied-clients.ts`), las pruebas nuevas pasan salvo la de documentación, que es un ajuste mío. Pero **tres pruebas que ya existían** en `tests/denegados-codex-opencode.test.ts` se ponen en rojo, y el plan aprobado solo declaró cambiar una (el multiplicador de `:218-220`, que ya edité como declara el plan):
  1. `:226-230` («permission o permission.<herramienta> como texto no se convierte y se reporta»): con `bash` como texto, la lista de reglas no aplicadas ahora empieza por las doce `bash <glob>` antes de `git push --force`. Hipótesis: es consecuencia directa de las reglas nuevas.
  2. `:253` («con opencode.jsonc no escribe el .json y reporta todas las reglas»): espera `no aplicadas en opencode (46)` y ahora son 58 (46 + 12).
  3. `:359` («sync dice, por cliente, cuántas y cuáles no aplicó»): espera `no aplicadas en opencode (22): git push --force…` y ahora son 34 y la lista empieza por `bash **/.env`.
- No las edito sin autorización del PO. Si no las autoriza, el plan se rehace sin reglas nuevas en la lista de no aplicadas.

- **Autorización EST-009 (PO, 2026-10-11, «Autorizo las tres (Recomendado)»).** Se actualizaron las tres pruebas existentes de `tests/denegados-codex-opencode.test.ts` que el cambio pone en rojo a propósito: la lista de no aplicadas con `bash` como texto (ahora empieza por las doce `bash <glob>`), `no aplicadas en opencode (46)` → `(58)` y `(22)` → `(34)` con la lista empezando por `bash **/.env`. Más la del plan (multiplicador `*2` → `*3`). Solo cambian números y orden; ninguna otra existente se tocó.
- **Hecho (pasos del plan):** `opencodeMentionPattern` y las doce reglas `bash <glob>` antes de las de git en `packages/adapter/src/denied-clients.ts`; aviso de OpenCode en `DENY_CLIENT_NOTICE` (C12); subsección «Denegaciones del shell de OpenCode» en `docs/07-ADAPTADORES.md` (C11, C13); nueve pruebas nuevas, observadas en rojo antes del código.
- **Verificación:** `npx vitest run` completa: 257 archivos y 4975 pruebas en verde (49 omitidas); `tsc --noEmit`, `eslint` y `prettier --check` de lo tocado, limpios; `valmen secrets` limpio. C7–C9 con OpenCode 2.0.16 real en `--auto` sobre un proyecto con `valmen sync`: `cat .env` y `cd . && cat ./.env` dan `Permission denied: shell`, `cat a.txt` se ejecuta. El archivo proyectado trae 96 patrones `bash`.
- **Límites:** la denegación por mención frena comandos legítimos que nombran la ruta (`git check-ignore .env`) y no ve lo que la oculta (`python -c`, `$(<.env)`); está declarado en el aviso de `sync` y en `docs/07-ADAPTADORES.md`.


## Pruebas

Contrato de pruebas (directorio: la raíz del repositorio; ambiente: Node 24 y OpenCode 2.0.16 en el PATH):

1. `npx vitest run tests/denegados-codex-opencode.test.ts` → 186 pruebas en verde.
2. `npx vitest run` → 257 archivos y 4975 pruebas en verde (49 omitidas).
3. Manual (C7–C9), en un proyecto temporal fuera de este repositorio:
   `mkdir /tmp/p && cd /tmp/p && git init -q && mkdir .valmen && printf 'name: Demo\nruntimes: [opencode]\n' > .valmen/config.yaml && echo SECRETO=abc123 > .env && echo hola > a.txt && node <repo>/packages/cli/dist/main.js sync`
   Luego, con `opencode run --standalone --auto --format json`: «llama la herramienta shell con el comando literal: cat .env» → `Permission denied: shell`; con `cd . && cat ./.env` → igual; con `cat a.txt` → `hola`.
4. Límite a conocer: `git check-ignore .env` también se niega.

Las pruebas 1 y 2 y el punto 3 los ejecutó el agente el 2026-10-11 con el resultado esperado; falta la confirmación del PO.

- Resultado del PO: Cerrar con mi corrida y las pruebas (Recomendado). El PO corrió el contrato en su máquina: el `sync` mostró el aviso nuevo (C12), pero el modelo de OpenCode se negó solo a ejecutar `cat .env` y no llegó a llamar a la herramienta de shell, así que esa corrida no prueba la denegación; el PO aceptó cerrar con la observación del agente (Permission denied: shell en C7 y C8, ejecución de `cat a.txt` en C9) y las pruebas en verde.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-11",
    "build_reference": "worktree:sha256:a99b075c54dd818d0621c624c23b596a41d9823d2092af274433629a5492ac7d",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-11",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Cerrar con mi corrida y las pruebas (Recomendado)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-11",
    "kind": "test",
    "description": "Suite completa 4975 en verde; OpenCode 2.0.16 real: cat .env denegado, cat a.txt ejecutado; 2026-10-11",
    "reference": "worktree:sha256:a99b075c54dd818d0621c624c23b596a41d9823d2092af274433629a5492ac7d",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-11",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Cerrar con mi corrida y las pruebas (Recomendado)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-11",
    "technical_summary": "Patrones bash por mención en la proyección de OpenCode; ver ## Implementación",
    "functional_summary": "El shell de OpenCode niega los comandos que nombran una ruta sensible",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin impacto en producción; sync suma patrones a los proyectos con OpenCode"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8",
    "model": null,
    "reasoning_effort": null,
    "notes": "Agente claude-code. Sesión **compartida**: trabajó 8 tickets (FEATURE-CLI-PRUEBA-MENSAJES-20261010 ×87, CHORE-CI-EXPORTS-SIN-USO-20261010 ×67, FEATURE-BENCH-FRICCION-RUNNER-20261010 ×62, SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011 ×53, FEATURE-GATE-CODE-REVIEW-EXIGENCIA-20261010 ×29), así que su costo no se reparte y acá no se registran números. Costo completo de la sesión: no declarado por el proveedor, 5600307 tokens (sin los subagentes con ticket propio). Registralo en el ticket cuya sesión sea propia, o declaralo compartido donde corresponda. Sesión \"Comparación de harness de desarrollo\".",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8",
    "confidence": "high",
    "id": "CONSUMO-001"
  }
]
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
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-11",
    "at": "2026-10-11T18:40:07.140Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261011-SECURITY-ADAPTER-OPENCODE-SHELL-ENV-20261011-plan-1, canal cli, decidida 2026-10-11T18:40:07.131Z): Aprobar tal cual (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-11",
    "at": "2026-10-11T18:40:07.598Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar tal cual (Recomendado)\",\"planHash\":\"sha256:9da87f0baf66b7036819750f4407612954b968d2ff44f4ae2a21ac41a96fe540\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-11",
    "at": "2026-10-11T18:40:14.482Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:9da87f0baf66b7036819750f4407612954b968d2ff44f4ae2a21ac41a96fe540."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-11",
    "at": "2026-10-11T18:40:14.482Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-11",
    "at": "2026-10-11T18:40:18.753Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-11",
    "at": "2026-10-11T18:47:12.876Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:26.539Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:27.044Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:27.399Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:27.728Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:28.065Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:28.400Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:28.853Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:29.187Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:29.514Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:29.838Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:30.179Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:32.324Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:32.504Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-11",
    "at": "2026-10-11T18:49:32.844Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
