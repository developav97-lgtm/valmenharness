# 00 — Visión

## 1. El problema real

Hoy el conocimiento agéntico de ValMenTech vive en un solo repositorio, atado a un solo
runtime, y se migra a mano cada vez que cambia la herramienta:

- La configuración nació en Claude (`.claude/`, `CLAUDE.md`), se migró a Codex (`.codex/`,
  `AGENTS.md`, `docs/agentic/`) y después a opencode (`.opencode/`, `opencode.json`).
- Cada migración dejó **capas de legado**: hoy SaiOpenCloud tiene `.claude/` con 989
  archivos en `drafts/`, `CLAUDE.md` marcado como legado, `AGENTS.md` como fuente de
  verdad, `.codex/` y `.opencode/` con los mismos 12 agentes duplicados en dos formatos.
- El flujo de tickets (`tools/agentic/ticket.py`, 2.171 líneas) es **excelente y único**,
  pero está casado con ese repositorio: rutas, tipos, gates y estados están hardcodeados
  para SaiOpenCloud.
- No existe forma de decir "el gate de plan lo aprueba Jev si cumple estos 6 criterios".
  Todos los gates son humanos o no existen.
- **No hay forma de manejar una feature grande.** Un módulo nuevo (inventario: pantallas,
  componentes, reportes, configuración) no cabe en un ticket, y no hay entidad que
  agrupe spec + descomposición + seguimiento.

La consecuencia: cada proyecto nuevo empieza de cero, cada migración de herramienta cuesta
días, y el techo de complejidad que el sistema soporta es "un ticket a la vez".

## 2. La tesis

> **El harness no es el agente. El harness es el contrato que hace confiable al agente.**

Tres convicciones guían el diseño:

**a) El estado vive en el disco, no en la conversación.**
Hoy el estado vive en el contexto del modelo y en los `.md`. Si el modelo se compacta,
pierde el hilo; si dos máquinas miran el mismo repo, ven cosas distintas. El motor debe
poder responder `valmen status --json` con la verdad derivada de archivos, y esa respuesta
debe ser la misma para el agente, para ti y para la app web.

**b) Un gate sin evidencia es una opinión.**
El flujo actual de SaiOpenCloud ya tiene esta disciplina (el CLI rechaza un cierre sin
QA, no admite `completed`, exige SHA de 40 caracteres, exige motivo para `deferred`). Eso
se conserva y se generaliza: **cada decisión de gate deja un recibo** con las preguntas
evaluadas, las probabilidades, el modelo que las evaluó, el costo y el resultado. Un gate
ejecutado por un LLM es auditable; un "el agente revisó y aprobó" no lo es.

**c) La autonomía se gana por evidencia, no por configuración.**
El sistema arranca con gates humanos donde el riesgo es alto y los va moviendo a
automático **solo donde el historial demuestra que el gate automático acierta**. Se mide:
de las veces que Jev dijo `approve`, ¿cuántas el humano habría aprobado igual? Esa tasa
es la que autoriza subir el nivel de autonomía.

## 3. Qué es ValmenHarness

Un producto instalable que se incorpora dentro de proyectos existentes y les da:

| Capacidad | Qué resuelve |
|---|---|
| **Motor determinista** | Tickets, features, estados, transiciones y evidencia en archivos versionados con git. Sin estado en el contexto del modelo. |
| **SDD (Spec-Driven Development)** | Nada se implementa sin spec. Para trabajo grande: spec → design → tasks → apply → verify → archive, con deltas de spec versionados. |
| **ODD (Organic Driven Development)** | Para trabajo pequeño: un documento de feature, protocolo de 7 pasos, sin ceremonia. |
| **Gates declarativos** | Un archivo de config define qué se valida en cada transición. El gate puede ser mecánico (`pytest`, `git diff --check`), humano (aprobación por Telegram) o por modelo. |
| **Gates automáticos con Jev** | El modelo de decisión `typesafe/jev-1.13` responde preguntas booleanas tipadas sobre la spec, el plan y la investigación. El código convierte probabilidades en `approve` / `block` / `review`. |
| **Routing de modelos por rol** | El orquestador es Opus/K3; la implementación es un modelo barato; el gate es Jev. Configurable por proceso, no por capricho. |
| **Plugins / procesos** | El paso a paso del deploy, la actualización de manuales, `migrate-tenant.sh`, se declaran como procesos que se pueden encadenar a otros procesos. |
| **Mission Control** | App web en localhost: tickets, features, conversaciones, configuración, providers, costos, recibos de gate. |
| **Proyección multi-agente** | Un solo `.valmen/` genera `AGENTS.md` + `.codex/` + `.claude/` + `.opencode/` coherentes. Sin migrar a mano. |

## 4. Los cinco invariantes no negociables

1. **Autorización antes de acción.** Investigar, explicar, revisar, auditar y comparar son
   operaciones *read-only* salvo pedido explícito de implementación. Esto resuelve el modo
   de fallo más común de los agentes.
2. **El código manda sobre el modelo.** Lo decidible en código se decide en código. El LLM
   solo evalúa proposiciones semánticas que el código no puede computar.
3. **Nada de bytes por el modelo.** Copiar, mover o archivar artefactos usa comandos de
   shell con verificación estructural (`diff -r`). Un modelo que resume o trunca corrompe
   la auditoría en silencio.
4. **Un solo escritor.** Ningún archivo tiene dos escritores concurrentes sin coordinación
   explícita. La concurrencia se resuelve en el motor, no en la buena voluntad del agente.
5. **Los gates humanos son bloqueantes.** Mientras falte una aprobación exigida, el motor
   no escribe, no publica, no etiqueta y no despliega. Ni siquiera si el usuario insiste
   en la misma sesión sin pasar por el gate.

## 5. Qué NO es

- **No es un agente.** No trae su propio loop de tool-calling para reemplazar a Claude Code
  o Codex. Se instala dentro de ellos. *(Fase posterior: modo headless para jobs
  desatendidos.)*
- **No reemplaza los procesos únicos del proyecto.** El harness aporta el *cómo* (flujo,
  gates, evidencia); el proyecto aporta el *qué* (stack, reglas de dominio, invariantes de
  negocio). `valmen adopt` separa ambos y los mantiene separados.
- **No es un framework de prompts.** Es un binario/CLI con estado en disco y contratos
  versionados. Los prompts son una proyección, no la fuente.
- **No es un reemplazo de git, Jira o CI.** Los respeta y se integra.

## 6. Mercado / alcance

El diseño apunta a dos usos:

**Interno (fase 1–4).** ValMenTech. SaiOpenCloud primero, luego el resto del portafolio.
Objetivo: eliminar la migración manual de configuración, permitir features grandes, y
bajar el costo por ticket moviendo implementación a modelos baratos y gates a Jev.

**Producto (fase 5+).** Empresas que quieren incorporar desarrollo agéntico a proyectos
reales con trazabilidad. El diferencial frente a gentle-ai (que es excelente pero es un
binario Go monolítico con 981 issues abiertos y acoplamiento a su memoria Engram) es:
multi-proveedor real (modelos chinos y comerciales de EE.UU. en el mismo routing),
gates automáticos auditables con Jev, y una app de control que hace visible el estado.

## 7. Los tres orígenes de los que se toma

| Origen | Qué se toma | Qué se descarta |
|---|---|---|
| **gentle-ai** | SDD con deltas de spec y protocolo RFC 2119; ODD con documento único de feature; RDD con candidato congelado y profundidad por riesgo; disciplina de evidencia (`diff -r`, "agent self-report is never sufficient"); separación `blockedReasons` vs `notes`; contratos versionados; principio "nunca instala el agente, lo configura". | El monolito Go de 373k líneas; la dependencia de Engram; la maquinaria de RDD con oleadas de simplificación; el vocabulario de 439 líneas que el propio agente se pierde. |
| **SaiOpenCloud** | El esquema de tickets canónicos y su CLI; las tres máquinas de estado separadas (ticket / punto / release); `POINT-NNN` inmutable y append-only; la trazabilidad de consumo de IA; los gates transversales por impacto (sync, migración, docker, deploy); la aprobación literal (`APROBAR DEPLOY vX.Y.Z`). | El acoplamiento a rutas y tipos de SaiOpenCloud; la duplicación de agentes en dos formatos; la ausencia de entidad "feature". |
| **DSH** | Motor de plugins por composición (una raíz + capas de patch con último-gana); estado *event-sourced* donde el historial es un log append-only y el contexto del modelo es una proyección derivada; `$HOME` global (`~/.dsh`) + carpeta de proyecto; sesiones consultables; GUI compuesta de plugins de cliente; skills como archivos de sistema. | El acoplamiento a un solo proveedor LLM; el modelo de permisos; todo lo específico de DeepSeek. |

## 8. Principio de crecimiento: el harness sube de nivel

El producto está diseñado para que la capacidad suba sin reescribir:

- **Nivel 0 — Registro.** Tickets y features en archivos. Gates humanos.
- **Nivel 1 — Automatización de gates.** Jev + checks mecánicos validan análisis y plan.
- **Nivel 2 — Descomposición.** Una feature grande se parte en tickets automáticamente,
  con grafo de dependencias y validación de cobertura spec→tickets.
- **Nivel 3 — Verificación de implementación.** Los criterios de aceptación se convierten
  en tests ejecutables; el gate de QA corre y decide.
- **Nivel 4 — Semi-autonomía.** El sistema toma tickets del backlog y los lleva hasta
  `awaiting_user_tests` sin intervención, dejando solo los gates de riesgo alto al humano.
- **Nivel 5 — Aprendizaje.** La memoria acumula qué funcionó; los presets de routing y los
  umbrales de gate se ajustan por evidencia del historial.

Cada nivel se habilita con configuración, no con reescritura. El roadmap
([`10-ROADMAP.md`](10-ROADMAP.md)) llega a Nivel 2–3 en las fases 1–5.
