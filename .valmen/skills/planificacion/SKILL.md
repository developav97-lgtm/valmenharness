---
name: planificacion
description: Usar antes de implementar un ticket, o cuando se pida diseñar, revisar o ajustar su plan. Aplica a funcionalidades, errores, mejoras, sincronización, integraciones, seguridad y cambios de despliegue o runtime.
version: 1.4.0
origen: valmen
---

# Planificación

Producir un plan proporcional y verificable en `## Plan`. Planificar no autoriza implementar, migrar, desplegar ni operar Git.

## De dónde sale el stack

Este plan vale para cualquier proyecto porque **no lleva el stack escrito dentro**. Versiones, servicios y convenciones salen de `.valmen/rules/stack.md`, de las reglas de `.valmen/rules/` que apliquen al impacto y de los archivos reales del repositorio, que son la última palabra: si una regla contradice el código, gana el código y la regla se corrige. Confirmar rutas y versiones en ellos antes de proponer comandos.

## Fuentes y límites

Leer `AGENTS.md`, las reglas del proyecto y el ticket. Si solo se pide una revisión, informar en solo lectura: **no crear ni modificar tickets por inferencia**. La identidad del ticket se resuelve antes de escribir.

No asumir hosts, direcciones, imágenes, versiones, credenciales ni estado de entornos. Un dato sin confirmar queda como dependencia pendiente.

## Investigación previa

- Preservar problema, usuario afectado y comportamiento actual y esperado; identificar archivos y flujo real con búsquedas acotadas. **Separar evidencia de hipótesis** y anotar lo pendiente.
- Clasificar tipo e impactos según las reglas del proyecto. Un tipo sencillo puede tocar algo crítico: **no reducir la compuerta cambiando la clasificación**.
- Mantener los hallazgos como puntos del ticket, sin renumerar ni reutilizar identificadores; cada paso, criterio y prueba se relaciona con su punto.

## Diseño de pantallas con UI UX Pro Max

Si el ticket toca pantallas y `valmen skills external` muestra `ui-ux-pro-max` como **habilitada**, se lee `.valmen/external-skills/ui-ux-pro-max/SKILL.md` antes de decidir estructura, jerarquía y estados. Si no está habilitada, no se lee: lo que una persona no revisó no se ejecuta.

## Contenido del plan

Pasos concretos y ordenados, con diagnóstico, plan, criterios y pruebas; la tabla de secciones y el pseudocódigo están en `referencias/contenido-del-plan.md`.

## Controles por impacto

Lo que debe quedar resuelto **antes** de implementar, por impacto, está en `referencias/controles-por-impacto.md`.

No introducir secretos ni valores de respaldo en planes, ejemplos o evidencia. No modificar listas de hosts permitidos como parte de un cambio funcional.

## Aprobación y transición

Todo ticket necesita plan. La aprobación explícita del responsable es obligatoria cuando el tipo o el impacto la exigen, y **siempre** ante aislamiento de datos, sincronización, agentes locales, contenedores, migraciones, seguridad o despliegue, cualquiera que sea el tipo declarado.

Presentar alcance, pasos, criterios, pruebas y riesgos; si hace falta aprobación, **detenerse en `planned` y pedirla**. No interpretar el silencio, la urgencia, una herramienta exitosa ni una aprobación anterior de otro alcance como autorización del plan.

Solo tras recibirla, registrar en `## Plan` la línea de aprobación con fecha, alcance y referencia a la confirmación real. La forma que reconoce el motor, la única válida en un ticket crítico:

```markdown
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
```
Si la compuerta no se exige, registrar la razón; esa excepción **no aplica a los impactos críticos**.

Mover el estado con el harness (`mover_ticket`), no editando el campo a mano. Preservar el historial de aprobaciones; un cambio material necesita aprobación renovada antes de implementar.

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

Las tres máquinas son **independientes**: un ticket cerrado puede seguir sin publicar. No existe el estado `completed`. Entrar a `approved` exige la aprobación registrada de una persona.

## Cómo se verifica un criterio

Cada criterio de aceptación declara **cómo se verifica**, en un comentario debajo:

```markdown
- [ ] El endpoint rechaza cantidades negativas con HTTP 400
      <!-- test: python BackEnd/manage.py test ModInventory -->
- [ ] La pantalla muestra el saldo actualizado
      <!-- verify: manual -->
```

El gate `qa-mechanical` corre los comandos declarados antes de las pruebas del responsable; sin su recibo la entrega no avanza. Los comandos permitidos salen de `test-commands` y el tiempo máximo de `test-timeout` (`.valmen/config.yaml`). Un criterio sin anotación detiene el gate.

Un `verify: manual` se cita como «Cn» en el paso del plan que lo verifica y uno compuesto se parte; cómo vota el gate de plan, en `referencias/verificacion-de-criterios.md`.

**Un criterio, un comportamiento observable**: ni compuestos («y») ni uno por cada aserción.

**Tamaño del plan**: `- Tamaño previsto:` («N líneas») contra `delivery-budget`; si pasa unos 20 criterios o el tope, `- Si excede el tope:` dice «se parte en tickets dependientes» o «sigue: motivo».

## Handoff

Entregar el ticket (identificador y ruta), el plan vigente, el estado de la compuerta, quién responde de qué, el orden, las pruebas y lo pendiente. **Delegar no amplía los archivos ni las acciones aprobadas.**

El plan debe prever la entrega posterior: comandos, directorio, resultado esperado, validaciones manuales y entorno. Las pruebas locales no sustituyen la confirmación del responsable. No incluir confirmaciones, envíos, etiquetas ni despliegues como pasos de implementación.
