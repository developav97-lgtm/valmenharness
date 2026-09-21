# ValmenHarness

**Harness agéntico empresarial.** Motor determinista de estado, especificaciones y gates
configurables que se instala **dentro** del agente de código que ya usas —Claude Code, Codex,
opencode, Cursor— sin reemplazarlo.

> **Estado: en construcción.** El MVP está en desarrollo activo. Lo que funciona hoy está
> listado abajo con su evidencia; lo que no, también.

## El problema

El desarrollo agéntico funciona, pero el conocimiento de *cómo* trabajar se pierde y se
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

| Capacidad | Estado |
|---|---|
| **Parser del contrato de tickets** — frontmatter restringido, 15 secciones, 7 bloques JSON append-only | Implementado y verificado contra 57 tickets reales |
| **Validador con equivalencia literal** — mismas reglas, mismos mensajes, mismos códigos de salida | 29 tests, incluye el lado del rechazo |
| **Schema v2** — tipos `CHORE`/`DOCS`, estado `blocked`, enum cerrado de evidencia | Definido |
| **CLI `valmen`** — `validate`, `list`, `show`, `index` | En curso |
| **Migración de tickets a v2** | En curso |
| **Spec-Driven Development** — features con spec, deltas RFC 2119, descomposición en tickets | Diseñado |
| **Gates automáticos con TypeSafe Jev** — probabilidades tipadas, umbrales en código | Diseñado |
| **Proyección multi-agente** — un `.valmen/`, N agentes generados | Diseñado |
| **Mission Control** — app web local | Diseñado |

## La tesis

> **El harness no es el agente. El harness es el contrato que hace confiable al agente.**

Cinco invariantes, no negociables:

1. **Autorización antes de acción.** Investigar, explicar, revisar y auditar son operaciones
   *read-only* salvo pedido explícito de implementación.
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

| Afirmación | Cómo se verificó |
|---|---|
| El parser acepta los 57 tickets reales | Test de equivalencia sobre el fixture de producción |
| Reproduce la volumetría exacta | 1.851 eventos · 137 puntos · 166 ciclos QA · 177 evidencias · 137 retests · 61 cierres |
| El validador rechaza lo mismo | 22 tests de rechazo con mensaje y código de salida exactos |
| Los códigos de salida son cinco, no tres | Extraídos del código fuente: `2` esquema, `3` invariante, `4` historial, `5` referencia, `6` ambiguo |
| `evidence.kind` divergió a 30 valores | Causa raíz: es el **único** campo del contrato sin validar |
| 55 de 137 puntos quedaron en `verified` | `BLOCKING_POINT_STATES` excluye `verified` a propósito; no hay regla de cierre |

## Empezar

```bash
git clone <repo> && cd valmenharness
npm install
npm test
```

Los tests corren contra un fixture de 57 tickets reales incluido en el repositorio. **No
requieren red ni claves de API**: el motor es determinista y se prueba sin llamar a ningún
modelo.

```bash
npm run typecheck   # tsc estricto
npm run test        # 29 tests de equivalencia
```

## Estructura

```
packages/
  core/          Dominio puro: contrato, parser, validador. Cero I/O de red.
  cli/           Superficie de comandos (en curso)
tests/
  fixtures/      57 tickets reales + plantilla, para la suite de equivalencia
  equivalence-*  Aceptar y rechazar lo mismo que el CLI de referencia
docs/            Diseño completo: visión, arquitectura, motor, gates, roadmap
```

## Diseño

El diseño completo —15 documentos— vive en [`docs/`](docs/README.md). Los más útiles para
evaluar el proyecto:

| Documento | Contenido |
|---|---|
| [`docs/00-VISION.md`](docs/00-VISION.md) | Qué es, la tesis, los invariantes, qué NO es |
| [`docs/13-RECORRIDO-COMPLETO.md`](docs/13-RECORRIDO-COMPLETO.md) | Un ticket de principio a fin: quién decide y cuánto cuesta |
| [`docs/03-GATES.md`](docs/03-GATES.md) | Gates automáticos con TypeSafe Jev, verificado contra el OpenAPI |
| [`docs/09-MIGRACION-SAICLOUD.md`](docs/09-MIGRACION-SAICLOUD.md) | El contrato real verificado y el plan de migración |
| [`docs/10-ROADMAP.md`](docs/10-ROADMAP.md) | Fases y criterios de aceptación |
| [`docs/12-FUNCIONALIDADES-PROXIMAS.md`](docs/12-FUNCIONALIDADES-PROXIMAS.md) | Catálogo priorizado de funcionalidades propuestas |

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
