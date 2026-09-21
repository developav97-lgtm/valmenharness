# 10 — Roadmap y MVP

## 1. Definición del MVP

**El MVP es la Fase 1 + Fase 2.** Su promesa es acotada y verificable:

> Instalar el harness en SaiOpenCloud y que `.valmen/` pase a ser la fuente de verdad de la
> configuración agéntica, con `AGENTS.md`, `.codex/` y `.opencode/` generados desde ahí —
> **sin perder un solo ticket ni romper el flujo que ya funciona**.

Lo que el MVP **sí** entrega:

- `valmen` CLI que reemplaza a `ticket.py` con equivalencia verificada sobre los 57 tickets.
- `.valmen/rules/` con las 41 reglas del proyecto extraídas de `AGENTS.md` y `CLAUDE.md`.
- `valmen sync` que genera `AGENTS.md` + `.codex/agents/*.toml` + `.opencode/agents/*.md`
  desde `.valmen/agents/*.md` — una sola fuente.
- Las 13 skills en `.valmen/skills/`, enlazadas a los 3 agentes.
- `valmen doctor` y `valmen sync --check` para CI.
- Modo coexistencia: `ticket.py` sigue funcionando.

Lo que el MVP **no** entrega (y está bien): gates automáticos, features grandes, la app web,
procesos encadenables. Cada uno es una fase siguiente que aporta valor por sí sola.

**Por qué este MVP:** es el único que puedes poner en producción sobre un proyecto con
clientes activos sin asumir riesgo funcional, y resuelve el dolor que originó todo —la
migración manual de configuración entre agentes.

## 2. Estado de niveles de capacidad

Recordatorio de [`00-VISION.md` §8](00-VISION.md#8-principio-de-crecimiento-el-harness-sube-de-nivel):

| Nivel | Capacidad                                                          | Fase que lo alcanza |
| ----- | ------------------------------------------------------------------ | ------------------- |
| **0** | Registro: tickets y features en archivos, gates humanos            | **Fase 1** ✅ MVP   |
| **1** | Config unificada y proyectada; gates automáticos con Jev           | Fase 2–3            |
| **2** | Descomposición de features grandes; procesos encadenables          | Fase 5              |
| **3** | Verificación de implementación; criterios de aceptación como tests | Fase 5–6            |
| **4** | Semi-autonomía: tickets de bajo riesgo de punta a punta            | Fase 6              |
| **5** | Aprendizaje: presets y umbrales ajustados por evidencia            | Fase 6+             |

## 3. Fases en detalle

### Fase 0 — Fundación (1 semana)

Antes de escribir el motor, la infraestructura del propio producto.

| Entregable               | Detalle                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| Monorepo                 | pnpm workspaces + Turborepo + TypeScript estricto                     |
| CI propio                | lint, typecheck, test, build en cada PR                               |
| Corpus determinista      | `bench/journeys/` — el motor se prueba **sin llamar a ningún modelo** |
| Contratos versionados    | Los esquemas Zod se publican como JSON Schema con semver              |
| Documentación de paquete | Plantilla fija: Resumen / Uso / Contrato / Limitaciones               |
| Toolchain                | Node 22+, sin dependencias en el camino crítico                       |

**Decisión deliberada:** empezar por el corpus de pruebas, no por el código. Un harness que
no se puede probar sin gastar tokens es un harness que no se puede refactorizar.

### Fase 1 — Motor de tickets (2–3 semanas) · **MVP parte A**

Ver [`09-MIGRACION-SAICLOUD.md` §3](09-MIGRACION-SAICLOUD.md#fase-1--equivalencia-del-motor-de-tickets-23-semanas).

Criterio de aceptación duro: `diff` vacío entre `valmen ticket validate --all` y
`python3 tools/agentic/ticket.py validate --all` sobre los 57 tickets reales.

### Fase 2 — Adopción y proyección multi-agente (1–2 semanas) · **MVP parte B**

Ver [`09-MIGRACION-SAICLOUD.md` §3](09-MIGRACION-SAICLOUD.md#fase-2--adopción-de-la-configuración-12-semanas).

Criterio de aceptación: `valmen sync` reproduce `AGENTS.md`, los 12 agentes de Codex y los
12 de opencode desde una sola fuente, y `valmen sync --check` falla si alguien editó a mano.

### Fase 3 — Gates automáticos con Jev (1–2 semanas)

Ver [`03-GATES.md`](03-GATES.md) para el diseño completo.

Criterio de aceptación: sobre los últimos 30 tickets cerrados, el gate automático coincide
con la decisión humana en ≥90% y hay **cero falsos aprobados** en tickets de impacto crítico.

### Fase 4 — Mission Control (2–3 semanas)

Ver [`06-CONTROL-APP.md`](06-CONTROL-APP.md).

| #       | Entregable                                            | Criterio de aceptación                                                                             |
| ------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 4.1     | `valmen serve`                                        | **Verificado**: escucha solo en `127.0.0.1`, sin lógica de negocio propia                          |
| 4.2     | Vista de tickets                                      | **Verificado**: los 57 tickets del fixture, con los mismos filtros que el visor anterior            |
| 4.2bis  | Vista de features                                     | Una feature con su spec, sus deltas y los tickets que la implementan                                |
| 4.3     | Vista de gate en revisión                             | **Verificado**: recibo congelado, proposición por proposición, aviso de recibo obsoleto, y la decisión humana anexada sin reescribir el veredicto |
| 4.4     | Configuración editable                                | Formulario y texto crudo, con diff antes de guardar                                                |
| 4.5     | Routing de modelos                                    | **Verificado**: tres presets, resolución con origen visible, y el modelo llega a la llamada real    |
| 4.6     | Chat de configuración                                 | Propone cambios; nunca escribe directo                                                             |
| **4.7** | **Configuración de proveedores y claves en la app** ⚠ | **Verificado**: agregar, probar antes de guardar, reemplazar y borrar desde la interfaz. Ver abajo |

**El 4.7 es un requisito explícito del usuario y es bloqueante.** Sin él, la Fase 4 no está
terminada: cada prueba de proveedor seguiría exigiendo abrir un archivo y exportar una
variable de entorno.

| Requisito del 4.7                                         | Por qué                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Agregar un proveedor y pegar su clave desde la UI         | Nadie debería saber que existe un `.credentials.yaml`                      |
| **Probar la conexión antes de guardar**                   | Una clave mal pegada debe fallar en la pantalla, no en la mitad de un gate |
| Nunca volver a mostrar la clave guardada                  | El campo se vacía al guardar y solo se puede reemplazar                    |
| Botón de rotación                                         | Rotar no debe exigir recordar dónde vive el archivo                        |
| Distinguir suscripción de API key                         | Un token de plan (Claude, Codex, opencode) se lee del CLI; no se pega      |
| Escribir en `~/.valmen/.credentials.yaml` con `chmod 600` | La app es una interfaz sobre el archivo, no un almacén paralelo            |

Detalle completo en [`06-CONTROL-APP.md` §2.6bis](06-CONTROL-APP.md).

Criterio de aceptación de la fase: **un día completo de trabajo operado sin abrir la
terminal, y una clave de proveedor agregada, probada y rotada desde la app.**

**La vista de features (4.2bis) se mueve a la Fase 5.** Una feature es un objeto del
Spec-Driven Development, y ese formato todavía no existe: construir la pantalla antes que
el artefacto sería dibujar una lista vacía.

### Fase 5 — Features grandes y procesos (2–3 semanas)

Criterio de aceptación: el módulo de inventario especificado, descompuesto en tickets con
sprints, y con los dos primeros tickets implementados a través del harness.

### Fase 6 — Autonomía, memoria y observabilidad (continuo)

Ver [`12-FUNCIONALIDADES-PROXIMAS.md`](12-FUNCIONALIDADES-PROXIMAS.md) para el catálogo de
mejoras propuestas.

## 4. Orden de construcción del monorepo

Prioridad estricta. Cada paquete se termina antes de empezar el siguiente.

| #   | Paquete                                 | Fase | Por qué en este orden                                              |
| --- | --------------------------------------- | ---- | ------------------------------------------------------------------ |
| 1   | `@valmen/core`                          | 0–1  | Dominio puro, cero I/O. Todo depende de él.                        |
| 2   | `@valmen/fs`                            | 1    | Escritura atómica. Si esto está mal, todo lo demás corrompe datos. |
| 3   | `@valmen/engine`                        | 1    | Orquesta core + fs.                                                |
| 4   | `@valmen/cli`                           | 1    | Superficie. Hace el motor usable.                                  |
| 5   | `@valmen/compat-ticketpy`               | 1    | Adaptador de coexistencia. Reduce el riesgo de la migración.       |
| 6   | `@valmen/adopt`                         | 2    | Análisis de proyecto y clasificación de reglas.                    |
| 7   | `@valmen/adapter-generic`               | 2    | `AGENTS.md` + skills. Cubre 16 agentes con poco código.            |
| 8   | `@valmen/adapter-codex`                 | 2    | TOML, subagentes, hooks.                                           |
| 9   | `@valmen/adapter-opencode`              | 2    | Markdown, permisos, plugins.                                       |
| 10  | `@valmen/adapter-claude`                | 2    | Markdown, hooks en settings.                                       |
| 11  | `@valmen/gate` + `@valmen/gate-jev`     | 3    | El seam antes del provider.                                        |
| 12  | `@valmen/providers` + `@valmen/routing` | 3    | Necesario para los gates y para todo lo demás.                     |
| 13  | `@valmen/mcp`                           | 3    | Expone el motor a los agentes.                                     |
| 14  | `@valmen/server`                        | 4    | API HTTP + SSE.                                                    |
| 15  | `@valmen/web`                           | 4    | Mission Control.                                                   |
| 16  | `@valmen/feature` (en core)             | 5    | Spec, descomposición, grafo.                                       |
| 17  | `@valmen/plugins`                       | 5    | Loader y contratos.                                                |
| 18  | `plugins/deploy`, `plugins/manuals`     | 5    | Los dos procesos que pediste.                                      |
| 19  | `plugins/codegraph`                     | 5    | Integración MCP.                                                   |
| 20  | `plugins/memory`, `plugins/hermes`      | 6    | Autonomía y móvil.                                                 |

**Son 20 paquetes, no 200.** Lección de DSH: la granularidad agresiva paga solo con su
escala. Se parte un paquete cuando duela, no antes.

## 5. Decisiones que hay que tomar antes de la Fase 1

Estas bloquean el inicio. Ver [`11-OPEN-QUESTIONS.md`](11-OPEN-QUESTIONS.md):

1. Nombre definitivo del producto y del comando CLI.
2. Licencia (¿interno, MIT, propietario?).
3. Repositorio (¿nuevo repo privado, o dentro de ValMenTech?).
4. ¿Se publica en npm público o en un registro privado?
5. ¿Quién más trabaja en esto además de ti?
6. ¿El adaptador de compatibilidad con `ticket.py` es requisito o preferencia?

## 6. Presupuesto de construcción

Números honestos para el MVP (Fases 0–2):

| Rubro                            | Estimación                                                 |
| -------------------------------- | ---------------------------------------------------------- |
| Código del motor                 | ~6.000–9.000 líneas TS (core + fs + engine + cli + compat) |
| Adaptadores                      | ~1.500–2.500 líneas                                        |
| `adopt`                          | ~1.200–1.800 líneas                                        |
| Tests                            | ~4.000–6.000 líneas (proporción alta a propósito)          |
| Documentación                    | Los documentos de este repositorio, más la de paquete      |
| Esfuerzo                         | 3–5 semanas de una persona a tiempo completo               |
| Costo de tokens para construirlo | ~$80–250 (el propio harness no se usa todavía)             |

Si lo construimos con agentes (que es lo lógico, dado el proyecto), el costo de tokens para
las Fases 0–2 está en ese rango, y baja para fases posteriores porque el harness se empieza
a usar a sí mismo.

## 7. Métricas de éxito del producto

Medir, no opinar:

| Métrica                                  | Cómo se mide                                | Objetivo                     |
| ---------------------------------------- | ------------------------------------------- | ---------------------------- |
| Eliminación de config duplicada          | Archivos editados a mano por cambio         | 3 → 0                        |
| Tiempo de adopción de un proyecto nuevo  | `valmen adopt` en un repo no visto          | < 30 min                     |
| Precisión del gate automático            | `valmen gate simulate --last 30`            | ≥ 98% para promover a `auto` |
| Falsos aprobados en gates críticos       | Recibos con revisión humana posterior       | **0**                        |
| Costo por ticket                         | `valmen usage report`                       | < $1.00 en el percentil 50   |
| Costo de gates                           | `valmen usage report --role gate-evaluator` | < 0.5% del total             |
| Tickets cerrados por semana              | `valmen usage report`                       | crecimiento sostenido        |
| Tiempo humano por ticket                 | Gates que requieren humano                  | 4 → 1                        |
| Uso del modo headless                    | Tickets ejecutados sin intervención         | Fase 6, >20% del backlog     |
| Adopción por otro proyecto de ValMenTech | Proyectos con `.valmen/`                    | ≥3 al final de la Fase 6     |
