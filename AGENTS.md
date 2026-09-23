<!-- GENERADO POR valmen — NO EDITAR A MANO -->
<!-- valmen v0.0.1 -->
<!-- fuente: -->
<!--   .valmen/config.yaml -->
<!--   .valmen/rules/proyecto.md -->
<!--   .valmen/rules/stack.md -->
<!-- regenerar: valmen sync -->
<!-- verificar:  valmen sync --check -->

# ValmenHarness

## Cómo se trabaja en este repositorio

Este repositorio **es** el harness, no un proyecto que lo usa. Se trabaja en
**modo directo**: se hace y se prueba, sin abrir tickets ni features. El registro
es el producto que estamos construyendo; usarlo como proceso para construirlo
añade ceremonia sin añadir información.

Eso no relaja nada de lo demás: las pruebas se corren antes de decir que algo
funciona, lo que toca interfaz se verifica en el navegador, y los commits siguen
la misma disciplina de siempre. Lo que no se hace es registrar el trabajo.

Cuando alguien pida un ticket —o cuando el cambio se vaya a aplicar sobre un
proyecto real y toque los gates de impacto— se abre y se sigue el flujo completo.

`tickets/` conserva lo que ya está registrado. No se borra: es el historial, y
los tickets que quedaron a medias se retoman cuando alguien lo pida.

## Stack y arquitectura

Monorepo de TypeScript con npm workspaces. Node 24. Sin dependencias externas en
el motor: `@valmen/core` no toca la red y solo `fs.ts` toca el disco.

Los paquetes se parten cuando duele, no antes. Hoy son diez y el orden importa:
`core` no depende de nadie; `adapter` y `gate` dependen de `core`; `engine` es el
motor del registro y lo consumen el CLI y el servidor.

## Pruebas

`npx vitest run`. Los tests de equivalencia contra la implementación de referencia
están desactivados por defecto: se activan con `VALMEN_REFERENCE_TICKET_PY`.

## Flujo de trabajo

El registro de trabajo vive en `<registro>/YYYY/<TICKET-ID>/ticket.md`. Un ticket
conserva su historial completo: no se reemplaza por archivos de sesión ni se
mueve cuando cambia de estado.

### Modo directo, sin registro

Consultas, diagnósticos, exploración, cambios visuales o de contenido que no
alteran funcionalidad, prototipos desechables, y cambios de la propia
configuración del harness.

**El modo directo no relaja los gates de impacto.** Un cambio que toque
sincronización, migraciones, contenedores, autenticación o despliegue exige
ticket, plan aprobado y gate humano, aunque el pedido haya sido "cámbiame este
texto". El agente lo dice y se detiene: no sigue sin el ticket, y tampoco lo
abre por su cuenta.

### Autorización antes de acción

Investigar, explicar, revisar, auditar, comparar y proponer son operaciones
**read-only** salvo que el pedido autorice explícitamente un cambio. Es el
primer paso del protocolo, no una recomendación.

### Quién decide que hace falta un ticket

**La persona, no el agente.** Abrir un ticket escribe en el repositorio, y
escribir exige autorización: la regla que vale para el código vale para el
registro. El agente puede proponerlo —una línea, con el motivo— y esperar
respuesta. No lo abre por su cuenta, ni siquiera cuando el trabajo cumple de
sobra las condiciones para tenerlo.

Un pedido de trabajo no es un pedido de registro. Cuando alguien dice
"hagámoslo", el modo por defecto es el directo: se hace y se prueba.

Cuando sí se pide, esto es lo que lo justifica: dos o más pasos de
implementación con archivos distintos, o un progreso que conviene recuperar tras
una interrupción. Un cambio trivial y comprendido no crea artefactos durables.

Una funcionalidad que excede un ticket —un módulo con varias pantallas, reportes
y configuración— se registra como **feature**: spec, diseño, descomposición en
tickets con grafo de dependencias y seguimiento del conjunto. Si quien la pide
prefiere tickets sueltos, se hacen tickets sueltos: la forma del registro la
decide quien lo pide, no el agente que lo recibe.

### Estados del ticket

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

Las tres máquinas de estado son **independientes**. Confundir "cerrado" con
"publicado" es el error clásico: un ticket puede estar cerrado y seguir sin
publicar.

No existe el estado `completed`: es ambiguo. Cada estado tiene una salida
obligatoria verificable.

### Gates

Un gate es una condición que debe cumplirse antes de avanzar. Puede ser
mecánico, automático o humano.

| Qué se valida | Cómo |
|---|---|
| Esquema del ticket, plan real, criterios verificables | Mecánico: lo decide el código |
| Cobertura de requisitos, coherencia del plan con la investigación | Automático: un modelo responde proposiciones y el código aplica umbrales |
| Despliegue, release, seguridad, migraciones | Humano: aprobación explícita, sin excepción |

**Un gate nunca le pregunta a un modelo si aprueba.** Le pregunta hechos
verificables y el código decide. Cada decisión deja un recibo con la evidencia
que vio el evaluador, sus respuestas y su coste.

### Cómo se verifica un criterio

Cada criterio de aceptación declara **cómo se verifica**, en un comentario debajo:

```markdown
- [ ] El endpoint rechaza cantidades negativas con HTTP 400
      <!-- test: python BackEnd/manage.py test ModInventory -->
- [ ] La pantalla muestra el saldo actualizado
      <!-- verify: manual -->
```

El gate `qa-mechanical` corre los declarados antes de que el ticket pase a las
pruebas del responsable, y la entrega no avanza sin ese recibo. Los comandos
permitidos los declara el proyecto en `test-commands` (`.valmen/config.yaml`), y
el prefijo se compara por palabra completa. Un criterio sin anotación detiene el
gate: la ambigüedad se resuelve sola a favor de «seguramente está bien», y un
criterio que solo verifica una persona se marca `verify: manual` —que es una
declaración, no una omisión—.

### Acciones que nunca se automatizan

| Acción | Por qué |
|---|---|
| Aprobar un despliegue a producción | Irreversible para clientes activos. Exige frase literal. |
| Crear un tag de release publicado | Una release publicada es inmutable. |
| Force-push, reset destructivo, borrar tags | Riesgo de pérdida de trabajo irreversible. |
| Ampliar la autoridad de edición fuera del alcance declarado | Es el consentimiento que un modelo no puede darse a sí mismo. |
| Marcar QA como eximida | Exige motivo y confirmación explícita. |
| Modificar el gate que lo evalúa | Un gate no puede ampliar su propia autoridad. |
| Modificar credenciales o configuración de hosts permitidos | Regla dura. |

Estas acciones pueden **prepararse** automáticamente —dry-run, comandos listos,
evidencia reunida— pero su ejecución requiere una persona. El sistema entrega el
trabajo hecho y la decisión pendiente.

## Invariantes de operación

1. **El código manda sobre el modelo.** Lo decidible en código se decide en
   código. Un modelo solo evalúa proposiciones semánticas que el código no puede
   computar.
2. **Nada de bytes por el modelo.** Copiar, mover o archivar artefactos usa
   comandos de shell con verificación estructural. Un modelo que resume, trunca
   o altera un byte mientras reporta éxito corrompe la auditoría en silencio.
3. **Un solo escritor.** Ningún archivo tiene dos escritores concurrentes sin
   coordinación explícita.
4. **Los bloques append-only no se reescriben.** Eventos, puntos, ciclos de QA,
   evidencia y cierres se añaden, nunca se editan. Es lo que permite auditar un
   ticket meses después.
5. **El estado vive en disco, no en la conversación.** Dos máquinas y un agente
   deben obtener la misma respuesta del mismo registro.

## Entrega y documentación

Al terminar una implementación, se entrega el contrato de pruebas: comandos
exactos, directorio de ejecución, resultado esperado, validaciones manuales y
requisitos de ambiente. El ticket pasa a `awaiting_user_tests` y solo avanza con
el resultado del responsable o con una omisión explícita y documentada.

Los commits se crean solo tras la confirmación de las pruebas. Antes de
commitear, revisar el estado del repositorio, identificar los archivos
atribuibles al ticket y excluir los ajenos sin modificarlos. Los cambios ajenos
conocidos no bloquean la entrega.

Y antes de commitear, `valmen secrets`: un secreto commiteado no se descommitea
—queda en el historial aunque el commit siguiente lo borre—. Si el hallazgo es
legítimo (una prueba, un ejemplo), la línea se marca con `valmen:allow-secret` y
deja de aparecer.

No se mezclan tickets en un commit. No se usan `git add -A` sin revisión ni
autocommits.

## Registro de trabajo

El registro de tickets vive en `tickets/`. Los comandos del harness lo usan por defecto.
