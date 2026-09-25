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

## Idioma

Todo se escribe en **español**: las respuestas, los commits, la documentación y
los mensajes de error del harness. Incluye lo que un agente contesta en la
conversación, no solo lo que queda en un archivo —una respuesta en otro idioma es
un cambio de idioma que nadie pidió, y quien la lee tiene que traducir para
seguir—.

El código sigue igual: identificadores en inglés donde el proyecto ya los tiene,
y los nombres del dominio como los nombra el negocio.

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

**El modo directo no relaja los gates de impacto.** Un cambio que se vaya a
aplicar **sobre un proyecto real** y toque sincronización, migraciones,
contenedores, autenticación o despliegue exige ticket, plan aprobado y gate
humano, aunque el pedido haya sido "cámbiame este texto". El agente lo dice y se
detiene: no sigue sin el ticket, y tampoco lo abre por su cuenta.

Esa condición no es un tecnicismo, y sin ella esta regla se contradice con la de
arriba. Los gates de impacto protegen los datos y los clientes de un proyecto en
uso: son irreversibles para alguien que no está en la conversación. En un
repositorio que **es** el producto que se construye —y que lo declara en sus
reglas— la protección equivalente son las pruebas antes de decir que algo
funciona y la confirmación antes de commitear, así que su modo directo no se
interrumpe al escribir autenticación. Para un proyecto adoptado la condición se
cumple siempre, y la regla le sigue valiendo igual que antes.

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
y configuración— se registra como **feature**: brief, spec con requisitos, diseño,
descomposición en tickets con grafo de dependencias y seguimiento del conjunto. Si
quien la pide prefiere tickets sueltos, se hacen tickets sueltos: la forma del
registro la decide quien lo pide, no el agente que lo recibe.

El recorrido tiene un orden y se sigue **siempre igual** —está escrito en la skill
`feature`, que se lee antes de empezar—:

```text
valmen feature new <slug> --title "…"     el brief, en draft
spec/<dominio>/spec.md                    los requisitos, en RFC 2119
valmen feature decompose <slug>           el arquitecto propone el grafo
   ↳ se revisa con la persona             es el momento barato de corregir
valmen feature materialize <slug>         los tickets existen, en intake
```

Hasta el último paso los tickets son **un plan**: un ticket del grafo no tiene
`ticket.md`, no está en `intake` y ninguna compuerta lo mira. Y cada ticket nace
en `intake` con el flujo de siempre: análisis, plan, aprobación de una persona,
implementación, entrega y QA — en el orden que dicen las dependencias.

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

### Antes de diagnosticar, buscar en la memoria

El proyecto acumula lo que ya decidió y lo que ya falló. Antes de investigar un
ticket, `buscar_memoria` con el módulo y el síntoma:

> el problema que estás por diagnosticar puede estar resuelto desde hace meses,
> con su causa raíz escrita y el porqué de la decisión.

Buscar cuesta una llamada. No buscar cuesta rediagnosticar algo que alguien ya pagó
por entender, y volver a decidir lo que ya se decidió. Cuando la búsqueda devuelve
algo, el diagnóstico lo **cita**: un ticket que repite un error conocido se explica
mucho mejor diciendo cuál es y por qué volvió.

Y lo que este trabajo enseñe —una causa raíz que costó encontrar, un patrón que se
repite— se guarda con `guardar_aprendizaje` cuando se descubre, no al final.

### Los estándares del proyecto, y cómo crecen

Los estándares viven en `.valmen/rules/estandares-<área>.md` y llegan acá en el
`valmen sync`: alineación, formato de montos, tema claro y oscuro, convenciones
de código. Se leen **antes** de escribir la primera línea de una pantalla o de un
modelo, no después de que alguien corrija: la regla que no se lee se descubre por
una devolución, y esa devolución ya se pagó.

Cuando el trabajo enseñe algo que no está escrito —hubo que aclararlo dos veces,
una corrección reveló que la regla existía solo en la cabeza de alguien, apareció
un caso que ninguna regla cubre—, se propone con `proponer_estandar`:
la regla en imperativo, el motivo con el caso concreto, y los tickets donde se
vio. La propuesta **no está en vigor** hasta que una persona la acepte; no la
apliques como si lo estuviera.

Y la decisión se puede pedir por donde sea. Si la persona dice «aceptá los
estándares propuestos», se aceptan con `decidir_estandar` —o
`valmen estandar aceptar pendientes --instruccion "…"`— citando **sus** palabras:
el registro guarda la frase que autorizó la regla. Si no dio ninguna, se le pide;
no se escribe por ella.

Si el cambio toca pantallas, antes de entregar se corre `revisar_presentacion`:
avisa de los colores escritos a mano en lo que el cambio agrega, que son los que
rompen el modo oscuro. No bloquea, y un color legítimo —una marca, una
impresión— se marca en la línea con `valmen:allow-color` y su motivo.

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
el prefijo se compara por palabra completa. El tiempo máximo de cada comando son
30 segundos, y se cambia con `test-timeout` (en segundos): una suite que corre
dentro de `docker compose` tarda más, y el gate la corta con un error que parece
del comando y no del tope. Un criterio sin anotación detiene el
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

Y **los criterios que se verificaron quedan marcados** con `- [x]` en el ticket.
Una casilla sin marcar en un ticket entregado —o peor, cerrado— dice que nadie
comprobó ese criterio: el registro afirma a la vez que el trabajo está aprobado y
que hay criterios que nadie miró. Los que se corren por comando se marcan cuando
el recibo del gate mecánico dice que pasaron; los `verify: manual`, cuando quien
prueba confirma el resultado, no antes. Un criterio que dejó de aplicar no se
marca en falso: se dice por qué en la entrega.

Los commits se crean solo tras la confirmación de las pruebas. Antes de
commitear, revisar el estado del repositorio, identificar los archivos
atribuibles al ticket y excluir los ajenos sin modificarlos. Los cambios ajenos
conocidos no bloquean la entrega.

Y **el consumo de IA queda registrado antes de cerrar**: `## Consumo de IA` lleva
una entrada por sesión que trabajó el ticket, con los números de la sesión y no de
una estimación. Sin consumo el motor no prepara el cierre —no es una
recomendación: se rechaza—, y la fuente tiene que decir de dónde salieron los
números con un prefijo que apunte de verdad ahí: `opencode:` su base,
`hermes:` la suya, `codex:` la sesión, `manual:` una sesión sin agregado —con el
motivo en las notas— y `process:` una corrida del harness. Un `hermes:` que apunta
a la base de OpenCode diría una cosa y mostraría otra, y el costo dejaría de ser
verificable. Y una sesión que sirvió **varios** tickets se declara con `manual:` y
sin números, diciendo cuáles y dónde quedó su gasto completo: un reparto a ojo es
un número inventado con forma de medición, y el hueco declarado se ve.

**Una sesión por ticket**, además, es lo que hace posible ese número: una
conversación que atendió cinco tickets tiene un solo costo y ningún modo de
repartirlo, así que el consumo por ticket se vuelve una estimación justo donde el
registro promete un dato.

Y antes de commitear, `valmen secrets`: un secreto commiteado no se descommitea
—queda en el historial aunque el commit siguiente lo borre—. Si el hallazgo es
legítimo (una prueba, un ejemplo), la línea se marca con `valmen:allow-secret` y
deja de aparecer.

No se mezclan tickets en un commit. No se usan `git add -A` sin revisión ni
autocommits.

## Registro de trabajo

El registro de tickets vive en `tickets/`. Los comandos del harness lo usan por defecto.
