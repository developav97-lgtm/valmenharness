# Guía de pruebas de la jornada del 2026-10-10

Nueve tickets esperan cierre. Todo lo automático ya corre en verde en `main`; lo que sigue es lo que **solo una persona** puede comprobar. Cada paso dice qué hacer y qué debe verse.

## Laboratorio desechable (una vez)

Los pasos que modifican archivos se hacen en una copia, nunca en el repo real:

```bash
LAB=/tmp/lab-pruebas && git clone -q /Users/juanandrade/Desktop/ValmenHarness $LAB/repo
cp -Rc /Users/juanandrade/Desktop/ValmenHarness/node_modules $LAB/repo/node_modules
cd $LAB/repo && npm run build
```

`B` = binario del CLI: `node /Users/juanandrade/Desktop/ValmenHarness/packages/cli/dist/main.js`.

## Cómo se cierra

- Tickets verificables por comando: decir «cierra <ID>» y el orquestador corre el ciclo de QA.
- Los dos SECURITY: solo se cierran con su frase literal (p. ej. «Apruebo el cierre de SECURITY-… tras revisar el diff»).

## 1. CHORE-CI-EXPORTS-SIN-USO-20261010 (C23, ya reproducido por el orquestador)

En el laboratorio, crear `packages/engine/src/zz-sonda.ts` con `export function funcionDeSondaSinConsumidor(): number { return 1; }` y añadir `export * from "./zz-sonda.js";` a `packages/engine/src/index.ts`. Correr `npm run exports:check`.
Esperado: código 1 y «Exportación sin consumidor: `funcionDeSondaSinConsumidor` en `packages/engine/src/zz-sonda.ts:1`». Sin la sonda, código 0.
C18 y C20–C22: el paso exacto está en el criterio de cada uno dentro del ticket (`## Criterios de aceptación`).

## 2. FEATURE-BENCH-FRICCION-RUNNER-20261010 (C38, C39, reproducidos)

```bash
git clone -q . /tmp/lab-pruebas/anterior && git -C /tmp/lab-pruebas/anterior checkout -q HEAD~5
# npm ci o copiar node_modules, npm run build en esa copia
node bench/friccion/dist/cli.js run --binary /tmp/lab-pruebas/anterior/packages/cli/dist/main.js --out /tmp/a.json --etiqueta HEAD~5
node bench/friccion/dist/cli.js run --binary packages/cli/dist/main.js --out /tmp/b.json
```

Esperado: C38 → el resultado trae `binario.etiqueta = HEAD~5` y su sha256; C39 → `corpus.sha256` igual en ambos (visto: `6aea438fc06e50e2…`). Corrida real: 8 recorridos, 0 fallidos.

## 3. FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010 (C19)

Parte de `sync` (reproducida): proyecto con `.valmen/skills/demo/referencias/ejemplo.md`, correr `valmen sync` → aparece `.claude/skills/demo/referencias/ejemplo.md` y `sync --check` da 0.
Parte manual: abrir Claude Code en ese proyecto, invocar la skill `demo` y comprobar que lee `referencias/ejemplo.md` cuando el SKILL.md la nombra.

## 4. IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010 (C14, C17)

C14 (reproducida): directorio temporal con `.valmen/config.yaml` (`name: Demo`), `valmen sync` y luego `valmen sync --check` → código 0 y «Archivos generados al día.».
C17: ver su criterio en el ticket.

## 5. FEATURE-CLI-PRESUPUESTO-SKILLS-20261010 (C20, C17)

C20: leer `docs/07-ADAPTADORES.md` §6.3 y confirmar que explica el presupuesto de skills (`skill-budget`) y qué pasa al excederlo. C17 quedó para el recorte (ticket 4).

## 6. FEATURE-CREDENTIALS-URL-BASE-PRUEBA-20261010 (C33, revisión de seguridad)

Leer «Revisión de seguridad del diff» en `## Implementación` del ticket y el diff del commit `2eb3e34`. Puntos a juzgar: la cadena `VALMEN_BASE_URL_*` completa o falla con `TEST_URL_INCOMPLETE`; límite conocido: consumidores que no son compuerta (revisor, descomposición, simulación) no comprueban la cadena.

## 7. FEATURE-CLI-PRUEBA-CASCADA-GUIONADA-20261010 (C35, revisión de seguridad)

Mismo recorrido con el diff del commit `2fa8e2a`: la cascada guionada no debe poder usarse contra un endpoint real sin la cadena completa.

## 8. SECURITY-CLI-PROYECCION-DENEGADOS-20261010 (solo el PO cierra)

Reproducido: proyecto con `valmen sync` → `.claude/settings.json` con **108** reglas `deny`; al borrar una, `valmen sync --check` sale con código 2.
Manual: C29–C31 e2e con `VALMEN_CLAUDE_BYPASS_E2E=1` y la prueba e2e que cita el criterio en el ticket (≈0,03 USD, usa Claude real). C35 y C37: leer la nota de límites (`env`/`command git clean -f` permitido).

## 9. SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010 (solo el PO cierra)

C3 (reproducido con Codex 0.160.1 de ChatGPT.app):

```bash
/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex execpolicy check -r <proyecto>/.codex/rules/valmen.rules git reset --hard
```

Esperado: `"decision":"forbidden"`. Con `git status`: `matchedRules: []`.
C13/C14 con OpenCode 2.0.16: el paso exacto está en el criterio del ticket.
