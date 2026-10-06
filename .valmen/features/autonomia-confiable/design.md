# Diseño — autonomia-confiable

Decisiones técnicas que la spec deja abiertas. Cada una con las alternativas, la
elegida y por qué. Lo que no aparece aquí se resuelve en el plan de cada ticket.

## D1 — Fuentes de la aprobación del plan (R-CTRL-001, R-JORN-004)

| Alternativa | Efecto |
|---|---|
| A. Solo enlace firmado (Telegram) y Mission Control autenticado | Máxima verificabilidad; obliga a salir del chat para aprobar cada plan |
| B. A más el chat interactivo: el agente registra la frase literal de la persona, y en una ejecución desatendida esa fuente se rechaza | Conserva el flujo de hoy en sesiones con la persona presente; las jornadas solo aprueban por token |

**Elegida: B.** Las fuentes se declaran por proyecto (`approvals.sources`); el
motor reconoce una ejecución desatendida por la identidad de ejecución que pone
el despacho (`FEATURE-CORE-IDENTIDAD-EJECUCION-20261001`) y en ella rechaza la
fuente `chat`. **Riesgo aceptado:** en una sesión interactiva la fuente `chat`
depende de que el agente cite bien; el evento guarda la frase y la sesión para
auditarlo. Un proyecto que quiera A lo declara.

Confirmada por el PO el 2026-10-05: «Si vamos con A en ambas que es tu
recomendación» (en esa pregunta, «A» era aceptar el chat con la persona presente,
que aquí es la opción B).

## D2 — Más criterios que el tope (R-CDEF-002)

| Alternativa | Efecto |
|---|---|
| A. La compuerta `plan` falla y pide partir el ticket | Obliga a tickets chicos; rompe tickets grandes ya en curso |
| B. Evaluar en tandas del tamaño del tope | Costo lineal en criterios; nada se pierde |

**Elegida: B**, con un aviso de la revisión previa (R-CPRE-008) cuando un ticket
pasa de 12 criterios. `qa-mechanical` corre todos los comandos siempre.

## D3 — Cómo se reconoce una falla del entorno (R-CDEF-006)

**Elegida:** patrones incorporados por runner conocido (Django `manage.py test`,
vitest, `ng test`, `go test`) —resumen de pruebas ausente, errores de conexión,
base existente, comando inexistente, tope de tiempo— más patrones que el proyecto
puede agregar en `.valmen/config.yaml`. Descartado: pedirle al modelo que
clasifique la salida, porque es decidible en código (invariante 1).

## D4 — Dónde corre `qa-agent` (R-QAAG-003)

| Alternativa | Efecto |
|---|---|
| A. El mismo árbol de trabajo | El agente controla lo que se corre |
| B. `git worktree` limpio del árbol entregado, con scripts del commit base | Aislado sin dependencias nuevas |
| C. Sandbox de contenedores del harness | Dependencia externa en el camino crítico |

**Elegida: B.** Los proyectos que prueban dentro de Docker siguen usando sus
propios comandos autorizados; el harness no orquesta contenedores.

## D5 — Ejecutor del criterio `http:` (R-QAAG-007)

**Elegida:** un paquete evaluador nuevo, `@valmen/gate-http`, con el mismo
contrato que `gate-command` y `gate-jev`. `core` sigue sin red. Las peticiones
salen solo hacia `http-checks.allowed-hosts`; la gramática de aserciones es
cerrada (status, cabecera, rutas JSON con `==`, `>=`, `~=`).

## D6 — Dónde viven las autorizaciones de QA (R-QAAG-001)

**Elegida:** `.valmen/authorizations.jsonl`, append-only, cada entrada firmada con
el secreto HMAC de aprobaciones existente (`packages/engine/src/approval.ts`). Las
escriben solo el endpoint de Mission Control autenticado y el enlace firmado; la
revocación es otra entrada. Descartado: una sección de `config.yaml`, porque el
agente puede editar ese archivo y la firma no se podría verificar.

## D7 — Disparador de la jornada (R-JORN-002, R-JORN-011)

| Alternativa | Efecto |
|---|---|
| A. launchd en macOS | Sin modelo, sobrevive reinicios; exige la Mac despierta |
| B. Job de Hermes sin agente | Reutiliza la gateway de avisos; requiere Hermes |
| C. Tareas programadas de Claude Code | Gasta una sesión de modelo por cada avance |

**Elegida: A por defecto, B opcional.** C se descarta para el avance; sirve para
sesiones de trabajo, no para el reloj.

## D8 — Rama del commit por ticket (R-JORN-009)

**Elegida:** la rama que declara `execution.work-branch`, con defecto
`valmen/jornada-<AAAAMMDD>`. La validación rechaza `main`, `master`,
`production` y las ramas que el proyecto marque como protegidas. Sin push: la
integración al remoto queda fuera de esta feature.

## D9 — Contrato de respuesta en Claude Code (R-RESP-001 a R-RESP-003)

**Elegida:** las tres capas. El output style entra al prompt de sistema y
sobrevive a la compactación; el bloque de CLAUDE.md fija la precedencia sobre los
CLAUDE.md de directorios superiores (el caso de `ValMenTech/CLAUDE.md`); AGENTS.md
lleva el contrato para los demás clientes. Un hook por turno queda como
alternativa si la medición del sprint no baja de 150 palabras.

## Riesgos

- **Autonomía construida antes de tiempo.** Mitigación: el orden de sprints es
  restricción del brief; la jornada y `qa-agent` nacen apagados.
- **El agente edita lo que lo controla.** Mitigación: elegibilidad excluye
  `.valmen/` y scripts de pruebas; `qa-agent` toma scripts del commit base; las
  autorizaciones se firman.
- **Regresión en tickets históricos.** Mitigación: cada cambio de validación trae
  una prueba que valida el registro completo de los dos repositorios.
- **Ejecutor con permisos amplios.** `claude` corre con `bypassPermissions`; el
  tiempo máximo y la parada con aviso (R-JORN-007) acotan el daño, y el commit
  por ticket deja cada cambio reversible.
