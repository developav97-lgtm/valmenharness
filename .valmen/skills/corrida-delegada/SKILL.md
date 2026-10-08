---
name: corrida-delegada
description: Usar cuando el PO delega, en un solo pedido, una feature completa o una lista de tickets para que se trabajen uno tras otro —el agente decide las compuertas, ejecuta las pruebas, aprueba el QA y cierra—, o cuando haya que activar, verificar o retomar esa corrida. No aplica a un ticket suelto sin delegación.
version: 1.1.0
origen: valmen
---

# Corrida delegada

El PO pide una vez —«corre la feature», «haz estos cinco tickets»— y el agente los trabaja en orden. **La delegación es del PO y queda con sus palabras**: cada decisión que tomes en su nombre las cita. Sin ellas no hay corrida.

## Activar

1. Pide o localiza la frase literal del PO. No la parafrasees ni la completes.
2. `valmen delegation grant --feature <slug> --quote "<sus palabras>"` (o `--tickets A,B,C` para una lista). Queda en `.valmen/delegations/DEL-….jsonl`. En el MCP: `delegar_corrida`.
3. Verifica con `valmen delegation status`: alcance, palabras, qué ticket sigue y qué está detenido y por qué.

## Por cada ticket, en orden

`valmen delegation next` dice cuál sigue (orden de dependencias; salta cerrados y los que esperan al PO). Una sesión de trabajo por ticket cuando se pueda.

1. `valmen resume --id <ID>`, y escribe análisis, plan y criterios **en el ticket**, cada criterio con `<!-- test: -->` o `<!-- verify: manual -->`. Si `resume` trae «Delegación de la fase», lanza el subagente que indica; no cambies el modelo de esta sesión.
2. `valmen delegation advance --id <ID> [--reason "<por qué>"] [--evaluator cascade]`. Corre las compuertas `analysis` y `plan`, aprueba el plan citando la delegación y deja el ticket en `in_progress`. Una **REVIEW** se aprueba solo si el criterio dice que no debe bloquear: pasa ese porqué en `--reason`. Declara el evaluador (`cascade` con sustancia).
3. Implementa. **Las pruebas por consola o Docker las ejecutas tú**, con su propia base de datos de pruebas si hay más de una sesión.
4. `valmen secrets` y commit local del ticket. Sin push: solo cuando el PO lo ordene.
5. Si dieron lo esperado: `valmen delegation close --id <ID> --files a,b --environment <dónde> --tests "<qué corrió y qué dio>" --tests-passed --technical-summary … --functional-summary … --release-impact …`. Anota el punto con sus archivos, arranca el QA con el HEAD vigente, aprueba, declara el consumo `manual:` y cierra.

En el MCP: `avanzar_ticket_delegado` y `cerrar_ticket_delegado`.

## Dónde te detienes y consultas

- **BLOCK** de una compuerta: se corrige el artefacto y se vuelve a correr, o se consulta. Nunca se aprueba.
- **Gate humano duro**: ticket con impacto de sincronización, migración o contenedores, riesgo crítico, seguridad, despliegue, o un force-push. El comando se detiene solo; no lo rodees.
- Un ticket **fuera del alcance** de la delegación.

## Lo que queda del PO

Un ticket visual, o con criterios `verify: manual` sin marcar, queda en `awaiting_user_tests` y sigues con el siguiente. Cuando el PO confirma, `delegation close --po-confirmation "<sus palabras literales>"` lo cierra con el HEAD de ese momento. No confirmes por él lo que solo él puede verificar.

Si la feature trae adjuntos de diseño (`.valmen/features/<slug>/assets/`), compara lo construido contra ellos antes de entregar cualquier pantalla.

## Cerrar la feature

Cuando todos los tickets del grafo estén cerrados:

1. `valmen feature verify <slug>`: escribe `verify.md` desde el registro.
2. `valmen feature advance <slug> --to complete` (pasa por `in_progress`). Con tickets que esperan al PO, `--pendientes-del-po` los acepta y los deja anotados como suyos.
3. Entrega un resumen corto con lo pendiente del PO: pruebas manuales, migraciones, despliegue.

Mantén un resumen vivo de lo hecho y lo que falta en la memoria del proyecto: si se compacta el contexto, la corrida se retoma con `valmen delegation status`.
