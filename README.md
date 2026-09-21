# ValmenHarness

**Harness agéntico empresarial.** Motor determinista de estado, especificaciones y gates
configurables que se instala **dentro** del agente de código que ya usas —Claude Code, Codex,
opencode, Cursor— sin reemplazarlo.

> **Estado: en construcción.** El MVP está en desarrollo activo. Lo que funciona hoy está
> listado abajo con su evidencia; lo que no, también.

## El problema

El desarrollo agéntico funciona, pero el conocimiento de _cómo_ trabajar se pierde y se
duplica:

- **La configuración vive atada a un runtime.** Cambiar de agente obliga a migrar prompts,
  agentes y skills a mano: los mismos 12 perfiles en dos o tres formatos, divergiendo en
  silencio.
- **El estado vive en la conversación.** Si el modelo se compacta, se pierde el hilo. Dos
  máquinas miran el mismo repositorio y ven cosas distintas.
- **Los gates son humanos o no existen.** Un "el agente revisó y aprobó" no es auditable.
- **No hay forma de manejar una feature grande.** Un módulo nuevo —pantallas, componentes,
  reportes, configuración— no cabe en un ticket.
- **Los campos que dependen de que un humano los llene, no se llenan.** Verificado: 1 entrada
  de trazabilidad de consumo en 57 tickets.

## Qué hace

| Capacidad                                                                                              | Estado                                             |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Parser del contrato de tickets** — frontmatter restringido, 15 secciones, 7 bloques JSON append-only | Implementado y verificado contra 57 tickets reales |
| **Validador con equivalencia literal** — mismas reglas, mismos mensajes, mismos códigos de salida      | 29 tests, incluye el lado del rechazo              |
| **Schema v2** — tipos `CHORE`/`DOCS`, estado `blocked`, enum cerrado de evidencia                      | Definido                                           |
| **CLI `valmen`** — `validate`, `list`, `show`, `index`, `migrate`, `sync`, `adopt`                     | Implementado y verificado                          |
| **Migración de tickets a v2** — no toca el historial append-only, idempotente                          | Implementado y verificado                          |
| **Proyección a `AGENTS.md`** — `.valmen/` es la fuente única                                           | Implementado y verificado                          |
| **Adopción de un proyecto existente** — perfila, no borra nada                                         | Implementado y verificado                          |
| **Spec-Driven Development** — features con spec, deltas RFC 2119, descomposición en tickets            | Diseñado                                           |
| **Gates automáticos con TypeSafe Jev** — probabilidades tipadas, umbrales en código                    | Diseñado                                           |
| **Adaptadores por agente** — `.codex/`, `.claude/`, `.opencode/`                                       | Diseñado                                           |
| **Mission Control** — app web local                                                                    | Diseñado                                           |

## La tesis

> **El harness no es el agente. El harness es el contrato que hace confiable al agente.**

Cinco invariantes, no negociables:

1. **Autorización antes de acción.** Investigar, explicar, revisar y auditar son operaciones
   _read-only_ salvo pedido explícito de implementación.
2. **El código manda sobre el modelo.** Lo decidible en código se decide en código. Un modelo
   solo evalúa proposiciones semánticas que el código no puede computar.
3. **Nada de bytes por el modelo.** Copiar o archivar artefactos usa comandos de shell con
   verificación estructural. Un modelo que resume o trunca corrompe la auditoría en silencio.
4. **Un solo escritor.** Ningún archivo tiene dos escritores concurrentes sin coordinación.
5. **Los gates humanos son bloqueantes.** Mientras falte una aprobación exigida, el motor no
   escribe, no publica y no despliega.

## Estado de verificación

Los números de este repositorio no son estimaciones. Se obtuvieron auditando 57 tickets reales
de un proyecto en producción y el CLI que los gestiona:

| Afirmación                               | Cómo se verificó                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| El parser acepta los 57 tickets reales   | Test de equivalencia sobre el fixture de producción                                                  |
| Reproduce la volumetría exacta           | 1.851 eventos · 137 puntos · 166 ciclos QA · 177 evidencias · 137 retests · 61 cierres               |
| El validador rechaza lo mismo            | 22 tests de rechazo con mensaje y código de salida exactos                                           |
| La migración no toca el historial        | Comparación profunda de los 7 bloques JSON antes y después, sobre 57 tickets                         |
| Los códigos de salida son cinco, no tres | Extraídos del código fuente: `2` esquema, `3` invariante, `4` historial, `5` referencia, `6` ambiguo |
| `evidence.kind` divergió a 30 valores    | Causa raíz: es el **único** campo del contrato sin validar                                           |
| 55 de 137 puntos quedaron en `verified`  | `BLOCKING_POINT_STATES` excluye `verified` a propósito; no hay regla de cierre                       |

## Empezar

```bash
git clone <repo> && cd valmenharness
npm install
npm test
```

Los tests corren contra un fixture de 57 tickets reales incluido en el repositorio. **No
requieren red ni claves de API**: el motor es determinista y se prueba sin llamar a ningún
modelo.

> **Sobre el fixture.** Son 57 tickets de un proyecto en producción, con la estructura
> íntegra —15 secciones, 7 bloques JSON, 1.851 eventos, 137 puntos— y los datos
> identificables sustituidos: subdominios de tenants, rutas locales y nombres de clientes.
> La forma es la real, que es lo que hace útil la suite de equivalencia; el contenido
> sensible, no.

```bash
npm run typecheck   # tsc estricto
npm run test        # 96 tests
```

## Estructura

```
packages/
  core/          Dominio puro: contrato, parser, validador, migración, fs.
  adapter/       Proyección de .valmen/ a AGENTS.md y adopción de proyectos.
  cli/           Superficie de comandos.
tests/
  fixtures/      57 tickets reales, para las suites de equivalencia y migración
  equivalence-*  Aceptar y rechazar lo mismo que el CLI de referencia
  migrate        Historial intacto, idempotencia, abortar sin escribir
  adapters       Determinación de la proyección y detección de ediciones
  adopt          Perfil del proyecto, sin borrar nada
docs/            Diseño completo: visión, arquitectura, motor, gates, roadmap
```

## Uso

```bash
valmen adopt            # perfila el proyecto y crea .valmen/
valmen migrate          # lleva el registro al esquema vigente
valmen sync             # proyecta .valmen/ a AGENTS.md
valmen validate --all   # valida el registro
valmen index --check    # detecta un índice desactualizado (para CI)
```

`adopt` y `sync --check` son los dos comandos pensados para usarse primero:
el primero no escribe nada que el usuario no pueda revisar, y el segundo no
escribe nada en absoluto.

## Diseño

El diseño completo —15 documentos— vive en [`docs/`](docs/README.md). Los más útiles para
evaluar el proyecto:

| Documento                                                                    | Contenido                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`docs/00-VISION.md`](docs/00-VISION.md)                                     | Qué es, la tesis, los invariantes, qué NO es                     |
| [`docs/13-RECORRIDO-COMPLETO.md`](docs/13-RECORRIDO-COMPLETO.md)             | Un ticket de principio a fin: quién decide y cuánto cuesta       |
| [`docs/03-GATES.md`](docs/03-GATES.md)                                       | Gates automáticos con TypeSafe Jev, verificado contra el OpenAPI |
| [`docs/09-MIGRACION-SAICLOUD.md`](docs/09-MIGRACION-SAICLOUD.md)             | El contrato real verificado y el plan de migración               |
| [`docs/10-ROADMAP.md`](docs/10-ROADMAP.md)                                   | Fases y criterios de aceptación                                  |
| [`docs/12-FUNCIONALIDADES-PROXIMAS.md`](docs/12-FUNCIONALIDADES-PROXIMAS.md) | Catálogo priorizado de funcionalidades propuestas                |

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
