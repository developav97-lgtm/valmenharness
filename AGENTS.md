<!-- GENERADO POR valmen — NO EDITAR A MANO -->
<!-- valmen v0.0.1 -->
<!-- fuente: -->
<!--   .valmen/config.yaml -->
<!--   .valmen/rules/estandares-proceso.md -->
<!--   .valmen/rules/proyecto.md -->
<!--   .valmen/rules/stack.md -->
<!-- regenerar: valmen sync -->
<!-- verificar:  valmen sync --check -->

# ValmenHarness

## Estándares de proceso

Reglas que este proyecto ya decidió. **No son preferencias**: cada una salió de
una corrección que hubo que hacer, y su motivo va escrito para que se pueda
discutir cuando cambie.

## Cuándo se usa la cascada verificada

En un gate con proposiciones que solo un modelo puede responder se corre el evaluador `cascade` cuando el artefacto tiene sustancia y el veredicto cierra una transición —el análisis de un ticket con diagnóstico escrito, el plan de un cambio que toca código, el cierre con criterios declarados—, y se corre el evaluador de siempre cuando el gate se resuelve en código, cuando el cambio es de texto o de configuración, o cuando el estado no cambió desde la corrida anterior. El evaluador elegido se declara al correr el gate: el recibo lo guarda, y sin eso la decisión no se puede auditar después.

**Por qué:** La cascada gasta tres llamadas donde el evaluador de siempre gasta una —produce el modelo barato, verifica cada proposición y solo lo que el verificador no respalda vuelve al modelo superior—, así que se paga cuando el veredicto importa y el artefacto tiene sustancia. La referencia medida es ~7% del costo con 0 errores adicionales (docs/auditoria-20260926).

## Gateway y avisos por Telegram

La entrega y los avisos de la jornada (arranque, awaiting_user_tests, compuertas en REVIEW) salen por el bot de Telegram del perfil del proyecto —TELEGRAM_ALLOWED_USERS del .env—; Slack queda como canal secundario apagado. Un nuevo aviso se agrega al vigilante de avisos, no a un mensaje suelto.

**Por qué:** Migración decidida por el PO el 2026-09-30: los DM de Slack a veces no llegaban al celular y la gateway ya sirve Telegram en ambos perfiles; un solo canal de avisos evita revisar dos aplicaciones para lo mismo.

## Registro de tickets: traducir lo nuevo del pedido antes de crear

Si el pedido nombra algo que el código no tiene —parámetro, permiso, campo, bandera, columna, migración—, se traduce a campo real con búsqueda antes de crear el ticket; si no aparece, se pregunta una vez al PO y el ticket no se registra con el hueco. Lo que quede sin decidir se escribe en la sección «Supuestos y decisiones pendientes» del ticket, cada elemento con su pregunta, y el análisis no planifica sobre la adivinanza.

**Por qué:** BUGFIX-RESTAURANTE-MESERO-BORRAR-BONIFICAR-20260929 pidió «el nuevo parámetro bonificado» sin especificarlo: tres corridas de compuerta de plan y dos escaladas hasta que el PO resolvió usar el parámetro bonus que ya vive en AdmInvoiceParam.

## Escalada tras dos bloqueos semánticos equivalentes

Tras dos bloqueos consecutivos del mismo gate por la misma proposición semántica, cuando el artefacto ya incorpora la corrección comprobable, se documentan ambos recibos y la evidencia; una autorización explícita vigente del PO permite continuar sin una tercera corrida. La aprobación queda atribuida a esa política humana, nunca al modelo.

**Por qué:** Evita gastar una tercera llamada idéntica y deja evidencia para calibrar el evaluador, sin que la compuerta amplíe su propia autoridad.

## Una contradicción interna del evaluador no debe producir un bloqueo automático

En FEATURE-ADAPTER-CAPACIDADES-20261001, el gate analysis bloqueó cuatro veces diagnostico_explica_el_sintoma (0.04, 0.02, 0.08) mientras el mismo recibo clasificaba el análisis como completa y daba >=0.97 a causa_especifica, nombra_archivos_reales y riesgos_cubren_impactos. El refinamiento debe detectar esa contradicción: si clasificación es completa y las tres comprobaciones estructurales superan approveAt, una única proposición semántica contradictoria no puede decidir block; se degrada a review y exige decisión humana. La corrección se valida con una prueba determinista del vector de recibo anterior, que debe devolver review, y con un caso control donde falla causa o archivos, que debe seguir devolviendo block.

**Por qué:** Sale del aprendizaje AP-004 (2026-10-03), visto en FEATURE-ADAPTER-CAPACIDADES-20261001.
**Visto en:** FEATURE-ADAPTER-CAPACIDADES-20261001 (2026-10-04)

## Cómo se trabaja en este repositorio

Este repositorio **es** el harness, no un proyecto que lo usa, y se gestiona con
su propio registro: `.valmen/` es la **fuente de verdad** y `AGENTS.md` y las
skills son su proyección —la regenera `valmen sync`—. El trabajo de evolución se
registra como features y tickets.

El **modo directo** queda acotado a los **cambios triviales**: consultas,
diagnósticos, exploración, cambios visuales o de contenido que no alteran
funcionalidad, prototipos desechables y la configuración del propio harness.

La **funcionalidad nueva** pasa por el **flujo** completo: feature cuando excede
un ticket, y luego ticket, análisis, plan, aprobación de una persona,
implementación, entrega y QA.

Eso no relaja nada de lo demás: las pruebas se corren antes de decir que algo
funciona, lo que toca interfaz se verifica en el navegador, y los commits siguen
la misma disciplina de siempre.

`tickets/` conserva lo que ya está registrado. No se borra: es el historial, y
los tickets que quedaron a medias se retoman cuando alguien lo pida.

**Por qué:** la auditoría del 26-sep encontró que el harness se construía en modo
directo, sin su propio registro —la ceremonia se evitaba, pero también la
evidencia—, y el registro es lo que hace auditable el trabajo; el modo directo se
conserva para lo que no crea artefactos durables.

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
"hagámoslo", el modo por defecto es el directo: se hace y se prueba. Eso vale para un
pedido **que no nombra un ticket**: si nombra uno que ya existe, ese ticket manda y el
orden es el de «Continuar un ticket», justo debajo.

Cuando sí se pide, esto es lo que lo justifica: dos o más pasos de
implementación con archivos distintos, o un progreso que conviene recuperar tras
una interrupción. Un cambio trivial y comprendido no crea artefactos durables.

### Continuar un ticket

Un pedido como «continúa con el ticket X», «sigue con X» o «trabaja X» nombra un
ticket que ya existe, y entonces **el ticket manda, no el modo directo**. El orden es
siempre el mismo y no hace falta que el pedido lo repita:

1. `reanudar_ticket` (CLI: `valmen resume --id <ID>`) **primero**. Devuelve el estado
   y el **siguiente paso**, que el motor calcula a partir del estado, lo escrito en el
   ticket y los recibos de las compuertas: qué escribir, qué skill cargar, qué
   compuerta correr y dónde detenerse.
2. Hacer ese paso y volver a llamar a `reanudar_ticket` para el siguiente. Es el
   motor quien dice cuándo seguir; no se adivina el orden ni se salta una fase.
3. Seguir hasta el primer **alto** que el siguiente paso declare —una decisión de una
   persona, o las pruebas del responsable— y entregar ahí: qué se hizo, qué evidencia
   hay y qué decisión se necesita. Un alto no se supera: ni se aprueba lo que decide
   una persona, ni se mueve el ticket para esquivarlo.

Mientras el ticket no esté `approved`, **el código de la aplicación no se toca**: el
diagnóstico y el plan se escriben **en el ticket**. Un diagnóstico que se queda en la
conversación no existe para el registro, y una implementación sin plan aprobado salta
justo la compuerta que existe para evitarlo. Las skills que el siguiente paso nombra
se cargan antes de empezar esa fase.

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

### Antes de registrar: traducir lo nuevo del pedido

Un pedido que nombra algo que el código no tiene —un «parámetro nuevo», un
permiso, una bandera, una columna, una migración— no se registra con ese hueco.
Antes de crear el ticket, la palabra se traduce a campo real con búsqueda en el
código; si el campo no aparece, se pregunta **una vez** a la persona y el ticket
se registra con la respuesta. Lo que quede sin decidir se escribe en la sección
`### Supuestos y decisiones pendientes` del ticket, cada elemento con su
pregunta exacta, y el análisis empieza por ahí: planificar sobre la adivinanza
cuesta compuertas en banda y decisiones que el registro no puede auditar.

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
