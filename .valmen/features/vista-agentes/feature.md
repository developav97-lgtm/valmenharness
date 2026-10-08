---
schema_version: 2
id: vista-agentes
title: Vista Agentes: escenas animadas de la ejecución, sesión principal y preguntas pendientes
state: decomposed
created: 2026-10-08
updated: 2026-10-08
---

# Vista Agentes: escenas animadas de la ejecución, sesión principal y preguntas pendientes

## Problema

La vista «Corrida» de Mission Control muestra la ejecución orquestada como una
tabla de subagentes, y al PO le faltan tres cosas, con sus palabras del
2026-10-08:

- «Actualmente no veo la sesión principal que se está ejecutando en el sistema.
  Cuando abro la sesión, los agentes comienzan a ejecutarse y puedo verlos, pero
  la sesión principal no aparece.» El lector solo emite una fila por subagente
  (`packages/server/src/agentes.ts`, `leerAgentesDeCorrida`): localiza la sesión
  orquestadora pero nunca la devuelve.
- «Ese nombre corrida como que casi no me gusta, quisiera algo como agentes o
  ejecución.» Y sobre la forma: «quiero algo como animado con más estilo […]
  como base podemos tomar el pixel agents […] pero aquí es donde quiero algo
  mejor que eso»; «me gustaría que cada ticket se mostrara en cada estado de
  forma animada. Por ejemplo, como en una pastelería: cada sesión representa una
  fase para producir el pastel final. Quisiera que el agente recorra las mesas,
  realizando cada acción hasta completar y entregar el ticket»; «animaciones de
  este estilo, configurables para que podamos seleccionar una única opción al
  inicio»; y tras el primer boceto: «que verdaderamente se sientan como espacios
  agénticos diferentes».
- «Cuando la persona principal (por ejemplo, Anita) responda una pregunta en el
  sistema, se muestre visualmente la pregunta y la respuesta, o al menos indique
  que hay una respuesta pendiente.» Hoy el lector marca al agente como
  `esperando` cuando tiene una herramienta sin resultado, pero no dice que es una
  pregunta ni a quién le toca.

## Objetivo

Que la vista se llame «Agentes», muestre la sesión principal junto a sus
subagentes, y represente la ejecución como una escena animada en la que cada
agente recorre las ocho estaciones del ticket —una por estado del flujo— hasta
entregarlo; que el PO elija una vez entre tres mundos (pastelería, centro de
control, invernadero), cada uno con su propio espacio, personajes y paneles; y
que una pregunta pendiente para una persona se vea en la escena y en un aviso,
con quién debe responder y desde cuándo (opción A), dejando el texto de la
pregunta y la respuesta (opción B) como último eslabón con decisión escrita del
PO.

El prototipo aprobado por el PO es `assets/vista-agentes.html`: los tres mundos
se construyen y se validan contra él.

## Alcance

- Dentro:
  - Renombrar la vista «Corrida» a «Agentes» en menú, ruta (`#/agentes`, con
    `#/corrida` y `#/jornadas` redirigiendo) y títulos. El proceso se sigue
    llamando «ejecución» en código y texto.
  - La sesión principal (orquestadora) como fila propia de
    `GET /api/corrida/agentes`, con estado y última herramienta, y como puesto
    propio en cada mundo.
  - Un campo de pregunta pendiente por agente en el mismo endpoint, derivado de
    la herramienta `AskUserQuestion` abierta sin resultado: a quién le toca,
    desde cuándo y cuándo se respondió. Sin texto (opción A).
  - Un motor de escena en el cliente: ocho estaciones = ocho estados del ticket,
    posición objetivo y desplazamiento por agente, estados visuales
    (trabajando, esperando, terminó, principal), selector de mundo recordado en
    el navegador y miniaturas dibujadas por el mismo código del mundo. Se prueba
    con tests deterministas sin dibujar.
  - Tres mundos sobre ese motor: pastelería, centro de control e invernadero,
    con su escena, sus personajes, su tipografía y sus paneles, tal como los
    muestra el prototipo.
  - El aviso de pregunta pendiente sobre la escena y su representación en cada
    mundo (lámpara en la ventanilla, teléfono rojo, regadera que espera), y el
    aviso de «respondió» cuando se cierra.
  - Opción B, como último ticket: mostrar el texto de la pregunta y de la
    respuesta. Amplía la lista blanca del lector de transcripts, así que el
    ticket lleva la decisión del PO en «Supuestos y decisiones pendientes» y no
    se implementa sin ella.
- Fuera:
  - El mundo «línea de metro» del segundo boceto: el PO lo descartó.
  - Acciones sobre el ticket o el agente desde la vista: es solo lectura.
  - Avisos por Telegram: los sigue el vigilante de avisos.
  - Cualquier escritura sobre transcripts, registro o jornada.
  - Sonido y mundos adicionales: entran después con el mismo motor.

## Restricciones

- El código manda sobre el modelo: nada de esta feature llama a un modelo; la
  estación, el estado y la pregunta pendiente se deciden en código a partir de
  lo que ya expone el lector.
- Solo lectura. El lector de transcripts sigue siendo lista blanca: no copia
  texto de prompts, entradas ni resultados, salvo lo que la opción B habilite
  con decisión escrita.
- La vista se refresca con el mecanismo que ya existe
  (`programarRefrescoDeCorrida`, sin llamadas de escritura); la escena no se
  reinicia en cada refresco, solo cambia sus datos.
- El marco (cabecera, selector, avisos, tablas) usa los tokens del tema y
  respeta el modo oscuro. Cada mundo tiene su propia paleta en el lienzo y en sus
  paneles; esos colores se marcan con `valmen:allow-color` y su motivo.
- Español en todo lo que la pantalla muestre. Celular e iPad: el lienzo escala y
  los paneles se apilan; `prefers-reduced-motion` reduce la animación.
- Los archivos estáticos se sirven solo desde el mapa declarado
  (`loadStatics`): lo que se agregue al cliente se declara ahí.

## Artefactos

- `spec/s1-datos-agentes/spec.md` — endpoint: sesión principal y pregunta pendiente.
- `spec/s2-motor-escena/spec.md` — renombrado, motor de escena, selector y aviso.
- `spec/s3-mundos/spec.md` — los tres mundos contra el prototipo.
- `design.md` — alternativas y decisión técnica.
- `assets/vista-agentes.html` — el prototipo aprobado por el PO (tres mundos).
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
