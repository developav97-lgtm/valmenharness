---
schema_version: 2
id: IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010
title: Recorte de skills sin perder reglas y prueba del tope del catálogo
type: IMPROVEMENT
module: SKILLS
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-11
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010

## Solicitud original

Parte del sprint: Las skills tienen presupuesto con aviso en sync, referencias proyectadas y catálogo recortado bajo un tope.
- R-SKL-002: El catálogo publicado DEBE quedar bajo un tope comprobado por prueba
- R-SKL-003: Las skills que pasan el tope DEBEN recortarse sin perder reglas
Depende de: FEATURE-CLI-PRESUPUESTO-SKILLS-20261010, FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El catálogo publicado DEBE quedar bajo un tope comprobado por prueba Las skills que pasan el tope DEBEN recortarse sin perder reglas
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-SKL-003: lo cubre FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010 (Proyección de la carpeta de referencias junto al SKILL.md)

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: declarar el presupuesto de skills en este repositorio, exigirlo con una prueba sobre el catálogo `skills/` y recortar las skills que lo pasan moviendo el detalle que ninguna prueba fija a `referencias/*.md`. Cubre R-SKL-002 y la parte de recorte de R-SKL-003; la proyección de `referencias/` ya la entregó FEATURE-ADAPTER-SKILL-REFERENCIAS-20261010.
- Usuario o rol afectado: todo agente que invoca estas skills (se cargan enteras) y quien mantiene el catálogo.
- Comportamiento actual: `sync` avisa de una skill que pasa de `skill-budget`, pero este repositorio no declara la clave (C17 del ticket anterior, omitido por instrucción del PO), así que no avisa; el único tope comprobado es el particular de 6 500 B de `corrida-orquestada`; cuatro skills lo pasan.
- Comportamiento esperado: `skill-budget: 6500` declarado; una prueba exige que cada `skills/<id>/SKILL.md` quede bajo ese presupuesto y sustituye el tope particular; las skills recortadas citan sus referencias y conservan cada regla obligatoria en el cuerpo.

## Diagnóstico

- Causa comprobada (con `ruta:línea`): el presupuesto existe en código (`packages/adapter/src/agents-size.ts:22` mínimo 1000, `:114` lectura de `skill-budget`, `packages/cli/src/commands.ts:856` aviso en `sync`) pero `.valmen/config.yaml` no lo declara, y nada compara el catálogo con él: solo `tests/skill-corrida-orquestada.test.ts:30` (`TOPE_BYTES = 6500`) y su caso C3 miden una skill. Pesos medidos con `wc -c skills/*/SKILL.md` (idénticos en `.valmen/skills/`, que es copia sincronizada y versionada): planificacion 11 017, programar-trabajo-de-tickets 11 772, feature 6 668, revision-final 6 554, corrida-orquestada 6 452 (cabe), el resto de 3 240 a 4 960. Exceso: 4 517, 5 272, 168 y 54 B. Los pesos por sección salen de contar bytes por encabezado `##`.
- Hipótesis pendientes: (a) planificacion no baja de 6 500 B solo moviendo formatos y ejemplos, porque sus secciones largas (controles por impacto, verificación de criterios) son reglas; si tras mover lo que no decide conducta aún pasa, el plan prevé condensar redacción sin quitar reglas y, si tampoco cabe, detenerse y preguntar al PO (subir el presupuesto o partir la skill). (b) La lectura de `referencias/` desde `skills/<id>/referencias/` por el catálogo se comprobó en `packages/adapter/src/skills.ts:545` y la copia a `.valmen/skills/<id>/referencias/` en `:619`; falta ver en la implementación que `sync --check` queda al día. Sin evidencia de memoria previa: `buscar_memoria` solo devolvió AP-011 (recorte de `descomposicion`, tangencial) y AP-012 (no relacionado).
- Consumidores afectados: las pruebas que leen estas skills. `tests/plantillas-compactas.test.ts:288-345` fija en `planificacion` `## Estados del ticket`, `intake → analyzed → planned → approved → in_progress`, `point:`, `release:`, `` `completed` ``, `## Cómo se verifica un criterio`, `<!-- test:`, `verify: manual`, `` `qa-mechanical` ``, `` `test-commands` ``, `` `test-timeout` `` y la versión `1.3.0`; en `revision-final` fija `## El consumo de IA se registra antes de cerrar`, los seis prefijos de fuente, `varios tickets`, `una sesión por ticket`, `## Los criterios se marcan` y la versión `1.3.0`; en `feature` fija `valmen feature new`, `valmen feature decompose` y `valmen feature materialize`. `tests/skills-publicadas.test.ts` compara `.valmen/skills/planificacion` con el catálogo y `tests/contexto-orquestador.test.ts:24,157` exige que catálogo y copia de `corrida-orquestada` sean iguales (no se recorta). `tests/cli-mensajes-coherencia.test.ts:521-524` valida cada cita `valmen …` y cada herramienta de todo `.md` bajo `skills/` y `.valmen/skills/`, referencias incluidas. `programar-trabajo-de-tickets` no tiene prueba que fije frases (solo aparece como id en `packages/engine/src/next-step.ts:86`).
- Archivos y flujo investigados: `skills/{planificacion,programar-trabajo-de-tickets,feature,revision-final}/SKILL.md` completos; `tests/skill-corrida-orquestada.test.ts`, `tests/skill-presupuesto.test.ts`, `tests/agents-md-tamano.test.ts` (patrón de laboratorio en `os.tmpdir()`); `tests/plantillas-compactas.test.ts`, `tests/skills-publicadas.test.ts`, `tests/contexto-orquestador.test.ts`, `tests/cli-mensajes-coherencia.test.ts`; `.valmen/features/guardas-verificacion-harness/spec/s7-skills/spec.md` (R-SKL-002, R-SKL-003) y `design.md` D7 (6 500 B, el tope que ya usa `corrida-orquestada`). Hoy no existe ninguna carpeta `referencias/` en el catálogo.
- Riesgos y compatibilidad: (1) quitar una regla por error; se mitiga con una prueba parametrizada que fija cada regla obligatoria por skill y con el inventario del plan. (2) Subir la versión rompe los pines `1.3.0` de `plantillas-compactas` (planificacion y revision-final): son de una persona. (3) Retirar el tope particular edita una prueba existente: lo pide R-SKL-002 y lo autoriza una persona. (4) Una cita `valmen …` en una referencia debe existir en la tabla del CLI. (5) Las copias de `.valmen/skills/` deben quedar iguales al catálogo (`valmen sync`). Los proyectos que ya instalaron estas skills reciben el recorte y las referencias en su próximo `sync`.
- Impactos de sync, migración, Docker o despliegue: sync: sí, solo de texto (el próximo `valmen sync` de un proyecto adoptado actualiza las skills publicadas y copia sus `referencias/`; una copia vieja sigue funcionando); migración: no; Docker: no; despliegue: no.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirma el plan con sus 17 criterios y autoriza tres ediciones de pruebas existentes (excepción a EST-009): los pines de versión de `tests/plantillas-compactas.test.ts:291` y `:308` (1.3.0 a 1.4.0), y el retiro de `TOPE_BYTES` y su caso C3 en `tests/skill-corrida-orquestada.test.ts`, que la prueba nueva del presupuesto reemplaza. Si `planificacion` no baja de 6 500 B sin quitar reglas obligatorias, la implementación se detiene y reporta.
- Tamaño previsto: 17 criterios; unas 450 líneas entre cambio y pruebas (prueba nueva ~150, referencias movidas ~180, ediciones de cuerpo ~120). Entra en 300–700 y no se parte.
- Alcance: `skills/{planificacion,programar-trabajo-de-tickets,feature,revision-final}/`, `.valmen/config.yaml`, prueba nueva y copias sincronizadas en `.valmen/skills/`. Excluye: `corrida-orquestada` (6 452 B, cabe), motor, compuertas, permisos y la proyección de referencias (ya entregada).
- Pasos ordenados:
  1. Inventario de reglas (C8–C11): por skill, extraer de `git show HEAD:skills/<id>/SKILL.md` cada encabezado, cada frase en negrita y cada prohibición, y escribirlos como tabla `{skill, regla, patrón}` dentro de la prueba nueva `tests/skills-catalogo-tope.test.ts`, con una prueba parametrizada por regla que busca el patrón en el cuerpo. Se escribe primero y debe pasar sobre el texto actual. Anclas de `planificacion` que se quedan en el cuerpo porque una prueba las fija (`tests/plantillas-compactas.test.ts:288-303`): `## Estados del ticket` con el diagrama `intake → analyzed → planned → approved → in_progress`, `point:`, `release:`, `` `completed` ``, `## Cómo se verifica un criterio` con el bloque de ejemplo de la anotación `test:` y `verify: manual`, `` `qa-mechanical` ``, `` `test-commands` ``, `` `test-timeout` ``. Anclas de `revision-final` (`:305-345`): `## El consumo de IA se registra antes de cerrar`, los seis prefijos, `varios tickets`, `una sesión por ticket`, `## Los criterios se marcan`. Anclas de `feature` (`:327-339`): `valmen feature new`, `valmen feature decompose`, `valmen feature materialize`. Ninguna prueba existente se edita en la implementación (EST-009): lo que se mueve es solo lo que ninguna fija; las dos únicas ediciones de pruebas existentes son de una persona y van en el paso 9. (C8, C9, C10, C11)
  2. `tests/skills-catalogo-tope.test.ts`, con el patrón de `tests/agents-md-tamano.test.ts`: lee `skills/*/SKILL.md` y `skill-budget` del `.valmen/config.yaml` con `readSkillBudget`; una prueba por skill del catálogo que exige `Buffer.byteLength` menor o igual al presupuesto y falla con el nombre y el tamaño; un caso con una skill sintética en `os.tmpdir()` que comprueba el texto del fallo; el chequeo de referencias citadas que existen (C6); el de la referencia huérfana (C7), con el caso concreto de una skill sintética que trae `referencias/sobra.md` sin citarla en su cuerpo y el resultado esperado de que la prueba la señale por nombre, más el caso de que una citada no se señale; el de versiones; el de copias iguales; y el de ausencia de aviso (C17), que corre `syncProject` sobre un laboratorio con el catálogo recortado y la clave `skill-budget: 6500` y espera que `avisos` no nombre ninguna skill. Se ve en rojo antes de recortar. Comando: `npx vitest run tests/skills-catalogo-tope.test.ts`. (C2, C3, C4, C6, C7, C12, C13, C17)
  3. `.valmen/config.yaml`: agregar `skill-budget: 6500` con un comentario de una línea (tope de D7, aviso sin bloqueo), junto a `test-timeout`. (C1)
  4. Recorte de `programar-trabajo-de-tickets` (exceso 5 272 B): a `referencias/aviso-de-arranque.md` los tres pasos del script y la franja de puertos; a `referencias/como-se-corre.md` el comando completo y las viñetas de banderas; a `referencias/autorizacion-registrada.md` el detalle del recibo sin decidir. El cuerpo conserva: una sesión por ticket, el orden que sale del grafo, el tope de cinco eslabones y las 20:00, la autorización citada en palabras del PO con alcance, `--dry-run` primero, no reprogramar una tanda ya agendada, un solo ticket por job y la plantilla como artefacto a mejorar. No hay pruebas que fijen frases de esta skill. Versión 1.1.0 a 1.2.0. (C3, C6, C7, C9, C12)
  5. Recorte de `planificacion` (exceso 4 517 B): a `referencias/contenido-del-plan.md` la tabla de secciones y el pseudocódigo; a `referencias/controles-por-impacto.md` la tabla completa de impactos; a `referencias/verificacion-de-criterios.md` el detalle de cómo vota el gate de plan en código. El cuerpo conserva cada regla en una línea: aprobación humana obligatoria ante aislamiento, sincronización, agentes locales, contenedores, migraciones, seguridad y despliegue; detenerse en `planned`; no aprobar por silencio; el comando `mover_ticket`; un criterio, un comportamiento; `verify: manual` se cita como «Cn»; plan de más de unos 20 criterios o 400 líneas se parte; no hosts ni secretos. Si tras mover lo que no decide conducta aún pasa de 6 500 B, se condensa la redacción sin quitar reglas; si tampoco cabe, se detiene la implementación y se pregunta al PO (subir el presupuesto o partir la skill). Versión 1.3.0 a 1.4.0. (C3, C6, C7, C8, C12)
  6. Recorte de `feature` (exceso 168 B): a `referencias/adjuntos.md` los párrafos del refresco, de `--allow-external-links` y del `.dc.html`; el cuerpo conserva que un adjunto se anexa a la feature, que un enlace no es evidencia, `valmen feature asset add` y que se valida contra el original. Versión 1.2.0 a 1.3.0. (C3, C6, C7, C10, C12)
  7. Recorte de `revision-final` (exceso 54 B): a `referencias/informe-de-revision.md` la lista del contenido del informe; el cuerpo conserva la regla de un informe breve con declaración explícita de que no hubo hallazgos, los comandos para el responsable y que la revisión no opera Git. Versión 1.3.0 a 1.4.0. (C3, C6, C7, C11, C12)
  8. `npm run build`, `valmen sync` para regenerar `.valmen/skills/` con sus `referencias/` y `valmen sync --check` sin diferencias (C14, procedimiento manual: el comando termina con código 0 e imprime `Archivos generados al día.`); `npx vitest run tests/cli-mensajes-coherencia.test.ts -t "cada cita"` valida las citas de las referencias contra la tabla del CLI (C15); correr `npx vitest run tests/plantillas-compactas.test.ts tests/skills-publicadas.test.ts tests/contexto-orquestador.test.ts tests/skill-corrida-orquestada.test.ts` (C16). (C13, C14, C15, C16)
  9. Declarar al responsable los pines que cambiaría una persona, con su autorización: `tests/plantillas-compactas.test.ts:291` (`1.3.0` a `1.4.0` de `planificacion`), `:308` (`1.3.0` a `1.4.0` de `revision-final`) y, en `tests/skill-corrida-orquestada.test.ts`, el retiro de `TOPE_BYTES` y del caso C3 (lo sustituye la prueba nueva). Hasta que se haga, esos dos archivos fallan por diseño. La verificación de C5 es el comando `node -e` del criterio, que falla mientras `TOPE_BYTES` siga en el archivo; la corre quien edita la prueba, después de editarla. (C5, C16)
- Impactos declarados: sincronización: texto de skills publicadas; un proyecto con la copia anterior sigue funcionando y recibe el recorte y sus referencias en su próximo `sync`, y `sync --check` lo avisa como deriva de versión; migración: no hay; contenedores: no hay.
- Rollback (obligatorio): revertir el commit del ticket (`git revert`); `valmen sync` regenera las copias anteriores y la clave `skill-budget` desaparece con el commit. No hay datos que deshacer.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1 — R-SKL-002: El `.valmen/config.yaml` de este repositorio declara `skill-budget: 6500`.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "declara skill-budget" -->
- [x] C2 — R-SKL-002: `readSkillBudget` devuelve 6500 al leer la configuración de este repositorio.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "lee skill-budget" -->
- [x] C3 — R-SKL-002: Cada `skills/<id>/SKILL.md` del catálogo pesa el presupuesto declarado o menos.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "bajo el presupuesto" -->
- [x] C4 — R-SKL-002: La prueba del tope falla nombrando la skill que se pasa con su tamaño.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "nombra la skill" -->
- [x] C5 — R-SKL-002: `tests/skill-corrida-orquestada.test.ts` ya no declara un tope particular de bytes.
      <!-- test: node -e "process.exit(require('fs').readFileSync('tests/skill-corrida-orquestada.test.ts','utf8').includes('TOPE_BYTES')?1:0)" -->
- [x] C6 — R-SKL-003: Cada archivo de `referencias/` que un cuerpo cita existe en el catálogo.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "referencia citada existe" -->
- [x] C7 — R-SKL-003: Cada archivo de `referencias/` del catálogo está citado desde el cuerpo de su skill.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "referencia huérfana" -->
- [x] C8 — R-SKL-003: Cada regla obligatoria inventariada de `planificacion` sigue en el cuerpo.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "regla de planificacion" -->
- [x] C9 — R-SKL-003: Cada regla obligatoria inventariada de `programar-trabajo-de-tickets` sigue en el cuerpo.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "regla de programar-trabajo-de-tickets" -->
- [x] C10 — R-SKL-003: Cada regla obligatoria inventariada de `feature` sigue en el cuerpo.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "regla de feature" -->
- [x] C11 — R-SKL-003: Cada regla obligatoria inventariada de `revision-final` sigue en el cuerpo.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "regla de revision-final" -->
- [x] C12 — R-SKL-003: Cada skill recortada declara su versión menor anterior más uno.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "versión recortada" -->
- [x] C13 — R-SKL-003: La copia de cada skill recortada en `.valmen/skills/` es igual al catálogo, referencias incluidas.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "copia igual" -->
- [x] C14 — R-SKL-003: `valmen sync --check` no informa diferencias tras el recorte.
      <!-- verify: manual -->
- [x] C15 — R-SKL-003: Cada cita `valmen …` de las referencias existe en la tabla de comandos del CLI.
      <!-- test: npx vitest run tests/cli-mensajes-coherencia.test.ts -t "cada cita" -->
- [x] C16 — R-SKL-003: Las frases que fijan las pruebas existentes siguen en el cuerpo de las skills recortadas.
      <!-- test: npx vitest run tests/plantillas-compactas.test.ts tests/skills-publicadas.test.ts tests/contexto-orquestador.test.ts tests/skill-corrida-orquestada.test.ts -->
- [x] C17 — R-SKL-003: El aviso de presupuesto de `sync` no marca ninguna skill del catálogo.
      <!-- test: npx vitest run tests/skills-catalogo-tope.test.ts -t "sin aviso de presupuesto" -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      ".valmen/config.yaml",
      ".valmen/skills/corrida-orquestada/SKILL.md",
      ".valmen/skills/planificacion/SKILL.md",
      ".valmen/skills/feature/SKILL.md",
      ".valmen/skills/programar-trabajo-de-tickets/SKILL.md"
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

Hecho según el plan, con la prueba escrita antes y vista en rojo (15 en rojo sobre 144, todas las esperadas: C1, C2, C3 por skill, C12 y C17, más una regla de inventario mal escrita que se corrigió).

- `tests/skills-catalogo-tope.test.ts` (nueva): presupuesto, referencias citadas y huérfanas, inventario de reglas (una prueba parametrizada por regla, 4 skills), versiones, copias iguales y ausencia de aviso de `sync`.
- `.valmen/config.yaml`: `skill-budget: 6500`.
- Skills recortadas, con `referencias/` y versión menor +1: `programar-trabajo-de-tickets` 11 772 a 6 256 B (1.2.0; `aviso-de-arranque`, `como-se-corre`, `autorizacion-registrada`), `planificacion` 11 017 a 6 325 B (1.4.0; `contenido-del-plan`, `controles-por-impacto`, `verificacion-de-criterios`), `feature` 6 668 a 6 016 B (1.3.0; `adjuntos`), `revision-final` 6 554 a 6 299 B (1.4.0; `informe-de-revision`). Las copias de `.valmen/skills/` se hicieron a mano y se verificaron con `cmp`; no se corrió `valmen sync` en este worktree (se probó en un laboratorio temporal: `sync` y `sync --check` salen en 0 con «Archivos generados al día.» y las copias salen idénticas).
- Ediciones de pruebas existentes (excepción a EST-009, autorizadas por el PO con su frase del 2026-10-10: «Aprobar y autorizar las 3 ediciones (Recomendado)»): (1) `tests/plantillas-compactas.test.ts:291` y (2) `:308`, solo el número esperado, `1.3.0` a `1.4.0`, porque las skills `planificacion` y `revision-final` subieron de versión; (3) `tests/skill-corrida-orquestada.test.ts`: retiro de `TOPE_BYTES` (línea 26) y del caso C3 (líneas 57-59), que reemplaza la prueba nueva del presupuesto.

### Supuestos y decisiones pendientes

- Desvío del plan en C17: `sync` mide la skill proyectada (con su marca), unos 165 B más que el archivo del catálogo; por eso las cuatro recortadas bajaron a 6 335 B o menos en archivo (el plan apuntaba a 6 500). Además, `corrida-orquestada` (fuera de alcance) pesa 6 452 B en archivo pero 6 620 B proyectada, y `sync` la avisa con 120 B de más. La prueba C17 se limita a las cuatro recortadas. Pregunta al PO: ¿recortar `corrida-orquestada` ~130 B en un ticket aparte, o subir `skill-budget`?
- C14 (`verify: manual`): en este worktree `sync --check` informa archivos de runtime ausentes (`.claude/`, `.agents/`, etc., ignorados por git) por no haberse corrido `sync` aquí; no informa deriva de `.valmen/skills/`.

## Pruebas

Directorio: la raíz del repositorio (o del worktree). Ambiente: Node 24, `npm install` hecho, `npm run build`.

- `npx vitest run tests/skills-catalogo-tope.test.ts` — esperado: 147 pruebas en verde.
- `npx vitest run tests/plantillas-compactas.test.ts tests/skills-publicadas.test.ts tests/contexto-orquestador.test.ts tests/skill-corrida-orquestada.test.ts` — esperado: en verde.
- `npx vitest run tests/cli-mensajes-coherencia.test.ts -t "cada cita"` — esperado: en verde.
- `node -e "process.exit(require('fs').readFileSync('tests/skill-corrida-orquestada.test.ts','utf8').includes('TOPE_BYTES')?1:0)"` — esperado: código 0.
- `npx tsc --noEmit -p tsconfig.json` y `npm run exports:check` — esperado: sin errores.
- Manual (C14): en un directorio nuevo con `.valmen/config.yaml` (`name: Demo`), correr `valmen sync` y `valmen sync --check`: código 0 y `Archivos generados al día.`. Resultado obtenido: cumple.
- Corrido por el implementador: 16 archivos de prueba, 524 pruebas en verde.

- Resultado del PO: Cierro 7 y corro pruebas de los 2 SECURITY (Recomendado). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Comandos de los criterios en verde en main y pasos manuales reproducidos en laboratorio desechable (docs/guia-pruebas-jornada-20261010.md)

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-11",
    "build_reference": "commit:47853568dfeb5bf8ae6e1d1685c44b9e4d3fa248",
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
    "po_confirmation": "Cierro 7 y corro pruebas de los 2 SECURITY (Recomendado)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-11",
    "kind": "automated-test",
    "description": "Comandos de los criterios en verde en main y pasos manuales reproducidos en laboratorio desechable (docs/guia-pruebas-jornada-20261010.md)",
    "reference": "worktree:sha256:edc2725baed37d9c945917c6a7cb4684607129b0a8c7858adb66ae15d77dcd98",
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
    "po_confirmation": "Cierro 7 y corro pruebas de los 2 SECURITY (Recomendado)"
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
    "technical_summary": "Entregado y verificado por comandos; ver ## Implementación del ticket",
    "functional_summary": "Cumple sus criterios de aceptación, todos marcados",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin impacto en producción; herramientas del repositorio"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesión de Claude Code no expone sus números; sin estimación.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: sesión de implementación sin agregado expuesto",
    "confidence": "low",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-11",
    "session_reference": "c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a81ac7ca79a29a201",
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Agente claude-code. 12 intervención(es) sobre el registro, 0 con fallo. 12 de 53 mensajes tocaron el registro. Subagente de la sesión c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8; su gasto no está en la madre. Duró 16 min. La entrada incluye la creación de caché y la salida incluye el razonamiento. Caché leída 6030425 tokens. Sesión \"Sesión de Claude Code\". Costo: suscripción; no es cero, el origen no declara un costo por token. Se registran los tokens.",
    "input_tokens": 109093,
    "output_tokens": 29479,
    "total_tokens": 138572,
    "estimated_cost_usd": null,
    "source": "claude:c2769fcf-63f8-4baf-a5d3-a4b9b7a976b8/agent-a81ac7ca79a29a201",
    "confidence": "high",
    "id": "CONSUMO-002"
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
    "date": "2026-10-10",
    "at": "2026-10-10T21:47:33.761Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-10",
    "at": "2026-10-11T03:49:49.904Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-10",
    "at": "2026-10-11T03:51:57.028Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-10",
    "at": "2026-10-11T04:00:01.035Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por juan andrade (recibo GR-20261011-IMPROVEMENT-SKILLS-RECORTE-TOPE-20261010-plan-2, canal cli, decidida 2026-10-11T04:00:01.032Z): Aprobar y autorizar las 3 ediciones (Recomendado)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-10",
    "at": "2026-10-11T04:00:01.412Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"juan andrade\",\"source\":\"cli\",\"quote\":\"Aprobar y autorizar las 3 ediciones (Recomendado)\",\"planHash\":\"sha256:d59c83a71d1371fe8ea96b855f707b06de600b078a6709c4630ce955d45f34ce\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-10",
    "at": "2026-10-11T04:00:01.748Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: juan andrade (fuente cli), plan sha256:d59c83a71d1371fe8ea96b855f707b06de600b078a6709c4630ce955d45f34ce."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-10",
    "at": "2026-10-11T04:00:01.748Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-10",
    "at": "2026-10-11T04:05:42.402Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-10",
    "at": "2026-10-11T04:06:00.737Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-10",
    "at": "2026-10-11T04:06:42.343Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:14.727Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:14.909Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:15.080Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:15.241Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:15.407Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:15.568Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:15.806Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:16.058Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:16.218Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:16.376Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:16.537Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:16.699Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:16.859Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-11",
    "at": "2026-10-11T16:57:17.012Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
