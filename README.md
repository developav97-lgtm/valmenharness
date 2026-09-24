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
| **Gates con tres evaluadores** — `command`, `jev` y `llm-judge` detrás de un mismo contrato             | Implementado y verificado                          |
| **Calibración del gate de plan** — 57 tickets reales, $0.0074, 25% de aprobación                       | Verificado contra el endpoint real                 |
| **Pantalla de gate** — ejecuta, muestra el recibo congelado y recoge la decisión humana                 | Verificado contra el endpoint real                 |
| **Adaptadores por agente** — `.codex/`, `.claude/`, `.opencode/` desde una sola fuente                  | Implementado y verificado                          |
| **Mission Control** — tickets, gate en revisión, configuración y proveedores desde la app                 | Implementado y verificado                          |
| **Routing por rol** — tres presets, trece roles, y el modelo llega a la llamada real                     | Implementado y verificado                          |
| **Chat de configuración** — el modelo propone, el código valida, el humano dispone                       | Verificado contra el modelo real                   |
| **Spec-Driven Development** — features con spec, deltas RFC 2119, descomposición en tickets            | Diseñado                                           |

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
npm run test        # 248 tests
```

## Estructura

```
packages/
  core/          Dominio puro: contrato, parser, validador, migración, fs.
  adapter/       Proyección de .valmen/ a AGENTS.md y adopción de proyectos.
  gate/          Motor de decisión y recibos. Lógica pura, sin red.
  gate-command/  Evaluador determinista por comando. Sin coste, sin red.
  gate-jev/      Evaluador con TypeSafe Jev: probabilidades calibradas.
  gate-llm-judge/ Evaluador con un modelo de chat, como alternativa.
  credentials/   Resolución de credenciales, en un solo lugar.
  server/        Mission Control: servidor local y pantalla de proveedores.
  mcp/           Servidor MCP: el harness al alcance de un agente.
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
valmen gate plan --id BUGFIX-POS-ALGO-20260921    # evalúa el plan y emite recibo
valmen serve                                       # Mission Control en 127.0.0.1
valmen mcp --install                               # el harness, al alcance del agente
valmen hermes connect                              # y el aviso de compuertas al celular
valmen hermes brief                                # lo que espera, lo que se detuvo, lo que se cerró
```

### Desde el agente, sin terminal

```bash
valmen mcp --install   # declara el servidor en opencode.json y en .mcp.json
valmen mcp --global    # y en el config.toml de codex; `valmen mcp` imprime el de DSH
```

A partir de ahí, el flujo no empieza en una consola: se le describe un problema al
agente y el agente crea el ticket, escribe el diagnóstico, valida contra el
contrato, evalúa la compuerta y mueve el estado. Treinta y seis herramientas, y
todas llaman al mismo motor que el CLI —dos implementaciones podrían dar dos
veredictos sobre el mismo ticket, que es justo lo que el harness existe para
impedir.

Y donde el cliente no hable MCP, el camino sigue abierto: `valmen` es un CLI, así
que cualquier agente con una shell —opencode, codex, Claude Code, DSH— hace lo
mismo escribiendo el comando. Las dos puertas son la misma: el MCP es el CLI con
otro transporte.

**Lo que no hay también es el diseño:** no existe herramienta para aprobar una
compuerta. La aprobación es de una persona, y un agente que pudiera dársela
convertiría el control en un trámite. Un agente recorre
`intake → analyzed → planned` y no puede cruzar a `approved`. Lo mismo vale para
lo que la persona decide con sus palabras —la QA aprobada, una exención, un
estándar que entra en vigor—: el agente las **cita**, nunca las escribe.

### Desde el celular

El harness no integra mensajería: delega en [Hermes Agent](https://github.com/NousResearch/hermes-agent),
que ya habla veintiuna plataformas. Lo que se construye es el puente.

```bash
valmen hermes connect   # declara el servidor en ~/.hermes/config.yaml y le instala la skill
valmen hermes status    # qué falta, de las cuatro cosas que pueden faltar
valmen hermes test      # un mensaje de prueba: lo primero que hay que correr
```

A partir de ahí, una compuerta que espera una decisión llega al celular:

```bash
valmen hermes notify    # avisa de los gates que esperan y de los procesos detenidos
valmen hermes brief     # el parte: lo que espera, lo que se detuvo, lo que se cerró
```

El aviso de un gate de riesgo `low` o `normal` trae un código corto, y la decisión vuelve
por donde el agente no la controla:

```bash
valmen gate-decide --code 5YF9-4NR5 --decision approve --actor juan
```

**El techo de riesgo lo aplica el motor, no la configuración.** No se emite token para
riesgo `high` o `critical`, ni para un ticket con impacto de migración, contenedores o
sincronización, ni para un gate de proceso —un paso de despliegue se aprueba en la máquina,
con el diff delante—. No hay parámetro para saltearlo, y hay un test que lo afirma.

Y no hay herramienta MCP para aprobar, por la misma razón que no la hay para nada de esto:
si la aprobación viajara como herramienta, el harness no podría distinguir una decisión
humana de una aserción del agente, y una inyección de prompt en el cuerpo de un ticket
bastaría para aprobar.

### Mission Control

```bash
valmen serve                # → http://127.0.0.1:4173
```

El servidor **no tiene lógica de negocio**: cada endpoint llama al mismo motor
que el CLI. Si un botón de la interfaz y un comando pudieran divergir, lo que se
ve en pantalla sería una mentira.

La primera pantalla es la **configuración de proveedores**, y resuelve un problema
concreto: configurar una clave no debería exigir editar un archivo ni exportar una
variable.

- **Se prueba antes de guardar.** Una clave mal pegada falla en la pantalla, no en
  la mitad de un gate. Si la prueba falla no se escribe nada.
- **La clave nunca se vuelve a mostrar.** El estado informa si está configurada y
  cuánto mide —para notar una clave truncada— pero no su valor.
- **Los proveedores de suscripción no se pegan a mano**: se lee el token del CLI
  que ya los autenticó, para no crear un segundo origen de verdad.
- El archivo de credenciales queda con permisos `600` y conserva sus comentarios.

### Gates automáticos

El gate no le pregunta a un modelo si aprueba algo: le pide **hechos
verificables** y el código decide con umbrales.

```bash
valmen gate plan --id <TICKET> --dry-run   # evalúa sin escribir el recibo
```

`approve` sale con 0; `block` y `review` con 3. Cada evaluación deja un recibo
append-only en `.valmen/receipts/` con el contexto congelado, las probabilidades,
la versión exacta del modelo y el coste medido.

**Tres evaluadores, elegidos por lo que el gate necesita:**

| Evaluador   | Cuándo                                        | Coste    | Latencia |
| ----------- | --------------------------------------------- | -------- | -------- |
| `command`   | todas las proposiciones tienen un comando     | **$0**   | ~50 ms   |
| `jev`       | hace falta juicio semántico · **por defecto** | $0.00007 | <1 s     |
| `llm-judge` | cuando Jev no está disponible                 | $0.0009  | 1–30 s   |

La selección es automática y aplica el orden que ahorra dinero: **lo decidible en
código se decide en código**. `--evaluator` fuerza uno concreto.

Un gate de 7 proposiciones cuesta **~$0.00006** y tarda menos de un segundo.

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
