---
name: planificacion
description: Usar antes de implementar un ticket, o cuando se pida diseñar, revisar o ajustar su plan. Aplica a funcionalidades, errores, mejoras, sincronización, integraciones, seguridad y cambios de despliegue o runtime.
version: 1.2.0
origen: valmen
---

# Planificación

Producir un plan proporcional y verificable dentro de la sección `## Plan` del ticket. Planificar no autoriza implementar, crear migraciones, desplegar ni operar Git.

## De dónde sale el stack

Este plan vale para cualquier proyecto porque **no lleva el stack escrito dentro**. Las versiones, los servicios y las convenciones salen de:

1. `.valmen/rules/stack.md` — el stack que este proyecto declara.
2. Las reglas bajo `.valmen/rules/` que apliquen al impacto del ticket.
3. Los archivos reales del repositorio, que son la última palabra.

Si una regla contradice lo que hay en el código, gana el código y la regla se corrige. Confirmar rutas y versiones en los archivos reales antes de proponer dependencias o comandos: un plan que asume una versión sin comprobarla produce un paso que falla al ejecutarse.

## Fuentes y límites

Leer `AGENTS.md`, las reglas del proyecto y el ticket completo. Si la solicitud es solo una revisión, informar en modo de solo lectura: **no crear ni modificar tickets por inferencia**. La identidad del ticket se resuelve antes de cualquier escritura.

No asumir hosts, direcciones, imágenes, versiones de runtime, credenciales ni estado de entornos. Un dato operativo no confirmado queda como dependencia pendiente, no como comando ejecutable supuesto.

## Investigación previa

- Preservar problema, usuario afectado y comportamiento actual y esperado. Identificar archivos, quién llama a qué y el flujo real, con búsquedas acotadas. **Separar evidencia de hipótesis** y anotar las decisiones que siguen pendientes.
- Clasificar tipo e impactos según las reglas del proyecto. Un cambio de tipo sencillo puede tocar un componente crítico: **no reducir la compuerta cambiando la clasificación**.
- Mantener los hallazgos de la misma funcionalidad como puntos del ticket, sin renumerar ni reutilizar identificadores.
- Relacionar cada paso, criterio de aceptación y prueba con el punto que lo origina.

## Diseño de pantallas con UI UX Pro Max

Si el ticket toca pantallas y `valmen skills external` muestra `ui-ux-pro-max` como **habilitada**, el diseño del plan se apoya en ella: se lee `.valmen/external-skills/ui-ux-pro-max/SKILL.md` antes de decidir estructura, jerarquía y estados. Si está declarada sin revisión, deshabilitada o no declarada, no se lee: contenido que una persona no revisó no se ejecuta, y el plan sigue sin ella.

## Contenido del plan

Pasos concretos y ordenados, no una lista de componentes genérica. Un error pequeño puede requerir dos pasos reales —corrección dirigida y prueba de regresión—; una integración necesita contratos y orden de despliegue.

| Sección del ticket | Contenido requerido |
|---|---|
| Diagnóstico | Flujo y archivos comprobados, causa o hipótesis, impactos, riesgos y supuestos. |
| Plan | Alcance y exclusiones; pasos con archivos y responsable; dependencias; qué compuerta aplica; compatibilidad, orden de despliegue y reversión según el riesgo. |
| Criterios de aceptación | Resultados observables por flujo y por punto, incluidos permisos, aislamiento y errores pertinentes. |
| Pruebas | Comandos exactos, directorio de ejecución, resultado esperado, comprobaciones manuales y requisitos de entorno. |

Un anexo extenso puede vivir junto al ticket y quedar enlazado desde `## Plan`; el alcance y la aprobación permanecen en el ticket. Añadir pseudocódigo cuando aclare orden de eventos, transacciones, reintentos o ramas de negocio. Una omisión de pseudocódigo no omite la compuerta del plan.

## Controles por impacto

Esta tabla es el corazón de la skill: dice qué tiene que estar resuelto **antes** de implementar. Ajustar los nombres a los del proyecto; los impactos son los del contrato del harness.

| Impacto | Debe quedar resuelto antes de implementar |
|---|---|
| Aislamiento entre inquilinos o clientes | Contexto correcto, separación de datos, permisos y pruebas entre inquilinos. |
| Sincronización o trabajo sin conexión | Clave natural real, regla de resolución de conflictos, operación idempotente, compatibilidad de contratos, orden de eventos, acuse de recibo, reconexión, colisión de identificadores, ausencia de duplicados y reversión. |
| Operaciones masivas que disparan señales | Mecanismo vigente del proyecto; localizarlo antes de usarlo, no inventar un ayudante. |
| Integraciones o canales en tiempo real | Contratos existentes, errores y reintentos, compatibilidad, orden de despliegue, pruebas de integración y reversión. |
| Agentes o servicios locales | Instalación y actualización, permisos, contrato entre local y nube, escucha solo en dirección local, pruebas aplicables y reversión. |
| Contenedores o migraciones | Copia verificable, despliegue gradual, compatibilidad con datos y clientes existentes, pruebas, orden de despliegue y reversión **antes** de mutar. |
| Autenticación o seguridad | Alcance explícito, permisos, regresión y revisión de seguridad. La deuda fuera de alcance exige otro ticket con su aprobación. |
| Entrega o despliegue | Simulación previa, ramas y remotos, diferencia entre entornos, versión, manifiesto, tickets, compuertas, pruebas, artefactos inmutables y reversión. |

No introducir secretos ni valores de respaldo en planes, ejemplos o evidencia. No modificar listas de hosts permitidos como parte de un cambio funcional.

## Aprobación y transición

Todo ticket necesita plan. La aprobación explícita del responsable es obligatoria cuando el tipo o el impacto la exigen según las reglas del proyecto, y **siempre** ante aislamiento de datos, sincronización, agentes locales, contenedores, migraciones, seguridad o despliegue, cualquiera que sea el tipo declarado.

Presentar alcance, pasos, criterios, pruebas y riesgos. Si hace falta aprobación, **detenerse en `planned` y pedirla**. No interpretar el silencio, la urgencia, una herramienta exitosa ni una aprobación anterior de distinto alcance como autorización del plan actual.

Solo tras recibirla, registrar en `## Plan` la línea de aprobación explícita con fecha, alcance y referencia a la confirmación real. La forma que el motor reconoce es esta —y para un ticket crítico es la única que vale—:

```markdown
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
```
Si la compuerta no se exige, registrar la razón concreta. Esa excepción **no aplica a los impactos críticos**: pasar la validación mecánica no demuestra autorización.

Mover el estado con el harness, no editando el campo a mano: un salto que la tabla del contrato no permite se rechaza. Preservar el historial de aprobaciones al ajustar el plan; un cambio material necesita aprobación renovada antes de implementar.

## Estados del ticket

```text
ticket:  intake → analyzed → planned → approved → in_progress
                 ↘ blocked ──────────────────────↗
         → awaiting_user_tests → in_qa ─┬→ changes_requested → in_progress ↗
                                       └→ qa_approved → closed
                                                          ↘ changes_requested
                                                            (solo unreleased)
point:   open → analyzed → in_progress → awaiting_retest → verified → closed
         ↘ not_reproducible | deferred | duplicate   (requieren motivo)
release: not_applicable | unreleased → planned → released
```

Las tres máquinas de estado son **independientes**. Confundir «cerrado» con «publicado» es el error clásico: un ticket puede estar cerrado y seguir sin publicar. No existe el estado `completed`: es ambiguo, y cada estado tiene una salida obligatoria verificable. Se mueve con el harness (`mover_ticket`), que rechaza un salto que la tabla no permite; entrar a `approved` exige antes la aprobación de una persona registrada.

## Cómo se verifica un criterio

Cada criterio de aceptación declara **cómo se verifica**, en un comentario debajo:

```markdown
- [ ] El endpoint rechaza cantidades negativas con HTTP 400
      <!-- test: python BackEnd/manage.py test ModInventory -->
- [ ] La pantalla muestra el saldo actualizado
      <!-- verify: manual -->
```

El gate `qa-mechanical` corre los comandos declarados antes de que el ticket pase a las pruebas del responsable, y la entrega no avanza sin ese recibo. Los comandos permitidos los declara el proyecto en `test-commands` (`.valmen/config.yaml`), y el prefijo se compara por palabra completa. El tiempo máximo de cada comando son 30 segundos y se cambia con `test-timeout` (en segundos): una suite que corre dentro de `docker compose` tarda más, y el gate la corta con un error que parece del comando y no del tope.

Un criterio sin anotación detiene el gate: la ambigüedad se resuelve sola a favor de «seguramente está bien». Un criterio que solo verifica una persona se marca `verify: manual`, que es una declaración, no una omisión.

El gate de plan decide en código, sin preguntarle al modelo, los criterios que se leen en el texto. Un criterio `verify: manual` se cita como «Cn» (o dentro de un rango «Cn–Cm») en el paso del plan que lo verifica: sin esa cita vota 0, y también vota 0 un manual compuesto —una frase con «y» u «o» son dos criterios—, que hay que partir. Un `test:` que solo afirma que la prueba pasa o que el monorepo compila se decide igual: lo cita un paso y el plan nombra el archivo de prueba del comando. El tope de 40 del precheck cuenta afirmaciones y no líneas, así que partir un criterio compuesto no lo supera.

## Handoff

Entregar el identificador y la ruta del ticket, el plan vigente, el estado de la compuerta, quién es responsable de qué, el orden de trabajo, las pruebas y las decisiones pendientes. **Delegar no amplía los archivos ni las acciones aprobadas.**

El plan debe prever la entrega posterior: comandos, directorio, resultado esperado, validaciones manuales y requisitos de entorno. Las pruebas locales no sustituyen la confirmación del responsable ni una omisión explícita y documentada. No incluir confirmaciones, envíos, etiquetas ni despliegues automáticos como pasos de implementación: cada entrega queda sujeta a las compuertas del proyecto.
