---
name: feature
description: Usar cuando alguien pide una funcionalidad que excede un ticket —varias pantallas, reportes, configuración, varios módulos o varios eslabones— y hay que registrarla como feature, escribir su spec, descomponerla en tickets y ponerlos a trabajar. Aplica también cuando alguien dice «necesito crear un feature para…» y explica en lenguaje natural.
---

# Feature

Una feature es trabajo que **no cabe en un ticket**: un módulo con varias pantallas, reportes y configuración, o una cadena que se implementa por eslabones. Su recorrido tiene un orden, y este documento existe para que se haga **siempre igual**: lo que cambia es el contenido, no el método.

## Antes de crear nada

**La forma del registro la decide quien lo pide.** Si la funcionalidad cabe en un ticket, se hace un ticket; si quiere tickets sueltos en vez de una feature, se hacen tickets sueltos. Se propone y se espera respuesta; no se abre por cuenta propia.

Y antes de escribir el brief, devolver **el alcance en tus palabras**, en una lista corta —qué entra, qué no, qué queda para después—, para que la persona lo corrija. Es el paso más barato de todo el recorrido y el único que evita descomponer lo que no se pidió.

## El recorrido, en orden

1. **El brief.** `valmen feature new <slug> --title "<título>"`. Nace en `draft`, en `.valmen/features/<slug>/feature.md`. El problema y el objetivo se escriben ahí, con las palabras de quien lo pidió: es lo que después permite decir si la feature sirvió.
2. **La spec.** Es lo que convierte el pedido en algo verificable, y **sin ella no hay descomposición**: el grafo se comprueba contra los requisitos. Un archivo por dominio, `.valmen/features/<slug>/spec/<dominio>/spec.md`:

   ```markdown
   ### Requirement: R-VENT-001 — El sistema DEBE registrar cada ajuste

   El ajuste queda con su motivo y su usuario.

   #### Scenario: Ajuste por conteo
   - **GIVEN** una bodega con diferencia entre sistema y físico
   - **WHEN** se registra el ajuste
   - **THEN** el saldo queda igual al contado y el movimiento conserva el motivo
   ```

   El identificador es `R-<DOMINIO>-<NNN>` y **el enunciado exige una palabra normativa** (DEBE, NO DEBE, DEBERÍA, PUEDE). Un requisito sin ella no es un requisito y la compuerta lo rechaza. Los requisitos se escriben con lo que la persona pidió, no con lo que a ti te parece que debería hacer.
3. **El diseño.** `design.md`, cuando hay una decisión técnica que tomar: alternativas, la elegida y por qué. Si no hay decisión, no se inventa un documento.
4. **La descomposición.** `valmen feature decompose <slug>` (o el botón en la vista de la feature). El arquitecto —el modelo del rol `architect`, no tú— propone el grafo: sprints, tickets con sus dependencias y qué requisito cubre cada uno. Tarda, y cuesta una llamada.
5. **La revisión del grafo, con la persona.** Es el momento barato de corregir: cuántos tickets salieron, si el orden tiene sentido, si algo quedó fuera. Se lee el `tickets.yaml` o el tablero, y se decide. Un grafo que no le sirve se corrige acá, no después de implementarlo.
6. **Los tickets.** `valmen feature materialize <slug>` —o el botón «Escribir los que faltan» del tablero— los crea en el registro, en `intake`, con su solicitud armada desde la spec. Hasta este paso el grafo era un plan: un ticket que no existe no se puede trabajar ni mirar por una compuerta.
7. **El trabajo, ticket por ticket.** Cada uno sigue el flujo normal —análisis, plan, **aprobación de la persona**, implementación, entrega, QA— y **el orden lo dicen las dependencias**: el tablero marca cuál está listo para empezar y cuál espera a otro que no está cerrado.

## Lo que no se hace

- **No se abre la feature por cuenta propia.** El registro es de la persona; se propone y se espera.
- **No se descompone sin spec.** El grafo se comprueba contra los requisitos: sin requisitos no hay nada que repartir.
- **No se inventan requisitos.** La spec la revisa quien pidió la funcionalidad.
- **No se empieza un ticket que espera a otro.** Una dependencia sin cerrar no es una sugerencia de orden: trabajar antes produce retrabajo.
- **No se mezclan los impactos críticos.** Migración, despliegue y sincronización exigen gate humano: van en su propio ticket, no como un detalle dentro de otro.
- **No se escribe la aprobación de nadie.** La compuerta de plan y la QA las decide una persona, con sus palabras.

## Cómo saber que salió bien

- `valmen feature show <slug>` — el estado, los artefactos y el grafo.
- El **tablero** de la feature en Mission Control: dónde está cada ticket y cuál se puede empezar.
- `valmen drift` — si el plan cita archivos o símbolos que no existen, aparece antes de implementar.
- La compuerta de cobertura: **cada requisito con al menos un ticket**. Un hueco detiene la descomposición, y se arregla en el grafo.
