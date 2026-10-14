# Verificación — Vista Agentes: escenas animadas de la ejecución, sesión principal y preguntas pendientes

Feature: `vista-agentes` · generado el 2026-10-14 desde el registro de tickets.

Tickets del grafo: 11 · cerrados: 11 · pendientes: 0.

## Tickets

### FEATURE-SERVER-SESION-PRINCIPAL-20261008 — Lector emite la sesión principal como fila propia

- Estado: closed · QA: approved
- Cierre técnico: El lector devuelve la sesión orquestadora como primera fila (principal: true, ticket null) con su estado y última herramienta; la vista la excluye de la cuenta de agentes vivos.
- Cierre funcional: La vista Agentes muestra ahora la sesión principal junto a sus subagentes.
- Evidencia:
  - manual-test: Suite completa en verde y validación del PO con una corrida real en Mission Control

### FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008 — Fila declara la pregunta pendiente sin copiar su texto, con test de lista blanca

- Estado: closed · QA: approved
- Cierre técnico: Campo aditivo pregunta en cada fila de GET /api/corrida/agentes, derivado de la AskUserQuestion abierta: id, nombre y hora, sin copiar texto (opción A). is_error cuenta como respondida; vale para la sesión principal y los subagentes; ventana propia VENTANA_RESPUESTA_MS.
- Cierre funcional: El endpoint dice cuándo un agente espera la respuesta de una persona y desde cuándo, base del aviso de pregunta pendiente de la vista Agentes.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa (216 archivos, 3581 pruebas) en verde tras integrar en main

### IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008 — Renombrar Corrida a Agentes y redirigir rutas viejas

- Estado: closed · QA: approved
- Cierre técnico: Rutas y nombre de la vista concentrados en una constante en index.html: #/agentes es la ruta; #/corrida y #/jornadas la muestran sin reescribir la URL y con el menú marcado. Endpoint y clases CSS sin cambios.
- Cierre funcional: La vista que se llamaba «Corrida» ahora se llama «Agentes» en menú, ruta y título, y los enlaces guardados siguen funcionando.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa (3552 pruebas) en verde; C10-C12 verificados en Mission Control

### FEATURE-WEB-MOTOR-ESCENA-20261008 — Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo

- Estado: closed · QA: approved
- Cierre técnico: Motor de escena en cliente (web/agentes/motor.js y su .d.ts): ocho estaciones = ocho estados del ticket, desplazamiento por agente, estados visuales e interfaz de mundo, sin dibujar; agente nuevo en blocked/changes_requested va a intake con marca de desvío. Probado de forma determinista.
- Cierre funcional: Base común para que los tres mundos animados muestren a cada agente recorriendo las estaciones de su ticket; aún no hay pantalla hasta el ticket del lienzo.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa (216 archivos, 3581 pruebas) en verde tras integrar en main

### FEATURE-WEB-VISTA-LIENZO-20261008 — Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados

- Estado: closed · QA: approved
- Cierre técnico: Lienzo montado desde el motor (montaje.js) con selector de mundo recordado, avisos de pregunta y estáticos declarados en ARCHIVOS_WEB; la vista carga la escena con import dinámico.
- Cierre funcional: La vista Agentes dibuja una escena animada con selector de mundo y aviso de pregunta pendiente.
- Evidencia:
  - test: vitest de 5 archivos del ticket: 69 pruebas en verde; tsc --build tsconfig.build.json sin errores; comprobación en navegador con filas simuladas (lienzo, tres miniaturas, aviso, mundo recordado tras recargar, mismo canvas entre refrescos)
  - manual-test: Suite completa en verde y validación del PO con una corrida real en Mission Control

### IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008 — Marco con tokens del tema, celular, iPad y reduced-motion

- Estado: closed · QA: approved
- Cierre técnico: Marco con tokens del tema, paneles en rejilla desde 700 px, avisos con CSS propio y bucle del lienzo reducido con prefers-reduced-motion.
- Cierre funcional: La vista Agentes se adapta a celular, iPad y modo oscuro, y respeta la preferencia de menos movimiento.
- Evidencia:
  - manual-test: Suite completa en verde y validación del PO con una corrida real en Mission Control

### FEATURE-WEB-MUNDO-PASTELERIA-20261008 — Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo

- Estado: closed · QA: approved
- Cierre técnico: Mundo pastelería sobre el motor (mundos/pasteleria.js y sprites.js) con paneles Comandas, En espera y Vitrina; las capturas contra el prototipo (C34-C39) no se produjeron y el PO validó el mundo a ojo.
- Cierre funcional: Un obrador animado donde cada ticket recorre las mesas hasta la vitrina.
- Evidencia:
  - manual-test: Suite completa en verde y validación del PO con una corrida real en Mission Control

### FEATURE-WEB-MUNDO-CONTROL-20261008 — Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo

- Estado: closed · QA: approved
- Cierre técnico: Mundo centro de control (mundos/control.js) con pista de misiones, consolas de operadores y franja de turno; las capturas contra el prototipo (C35-C39) no se produjeron y el PO validó el mundo a ojo.
- Cierre funcional: Una sala de control donde cada misión avanza por las estaciones del ticket.
- Evidencia:
  - manual-test: Suite completa en verde y validación del PO con una corrida real en Mission Control

### FEATURE-WEB-MUNDO-INVERNADERO-20261008 — Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo

- Estado: closed · QA: approved
- Cierre técnico: Mundo invernadero (mundos/invernadero.js) con canteros, jardinero y regadera sin azar; las capturas contra el prototipo (C36-C39) no se produjeron y el PO validó el mundo a ojo.
- Cierre funcional: Un jardín donde cada ticket es una planta que pasa de maceta en maceta.
- Evidencia:
  - browser: Navegador con fetch parcheado (servidor del worktree): C33 jardinero de x=579 a 679 (centro del sprite), C34 maceta dibujada durante el trayecto, C35 14 gotas en x 451-480 al responder. Sin capturas contra el prototipo (C36-C39, del PO). Diferencias a revisar: Caveat cae en Comic Sans MS (decisión 2); salida del jardinero hacia el semillero (75,296) en vez de (110,296) (decisión 5); lluvia durante la ventana de 60 s y no 2 s (decisión 3); tope de 3 sobres (decisión 4); las tablas y la cola dentro de los paneles conservan el fondo oscuro del marco, a diferencia del cuaderno del prototipo.
  - manual-test: Suite completa en verde y validación del PO con una corrida real en Mission Control

### FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008 — Lector expone texto de pregunta y respuesta con lista blanca ampliada, bajo decisión escrita del PO

- Estado: closed · QA: approved
- Cierre técnico: El lector expone pregunta.texto y pregunta.respuesta (lista blanca ampliada a la question y a answers, recortadas a 500) solo cuando el servidor no tiene writeToken, es decir, en loopback; fuera de loopback la pregunta trae solo desde y respondidaEn.
- Cierre funcional: La vista puede mostrar la pregunta de una persona y su respuesta, sin exponerlas si el servidor se abre a la red.
- Evidencia:
  - manual-test: Suite completa en verde; curl en ValmenHarness con pregunta abierta y respondida, y servidor con --host 0.0.0.0 sin texto

### FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008 — Vista muestra el texto de la pregunta y la respuesta

- Estado: closed · QA: approved
- Cierre técnico: El aviso de pregunta lee texto y respuesta de la fila (montaje.js, avisosDePregunta y cajaDeAviso, y la franja de control.js); todo texto se pinta con textContent o fillText, nunca como HTML; sin texto conserva el aviso de antes.
- Cierre funcional: El aviso sobre el lienzo muestra la pregunta pendiente con su texto y, al contestar, la respuesta.
- Evidencia:
  - ux-review: Revisión de UX de 1 archivo(s) de interfaz (packages/server/web/index.html); 0 color(es) fijo(s). Skills: ui-ux-pro-max no declarada (el proyecto no la declara en external-skills); impeccable no declarada (el proyecto no la declara en external-skills). Sin informe de Impeccable.
  - manual-test: Suite completa en verde y dos capturas del PO: pregunta abierta con texto y respuesta

## Pendiente del PO

  - criterio manual: C34 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema claro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C35 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema oscuro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C36 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema claro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C37 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema oscuro. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C38 — R-MUN-008: cada captura de la vista en `## Evidencia` va junto a la del prototipo tomada con el mismo ancho y el mismo tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C39 — R-MUN-008: cada diferencia observada con el prototipo queda anotada en `## Evidencia` con su motivo. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C35 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema claro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C36 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema oscuro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C37 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema claro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C38 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema oscuro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C39 — R-MUN-008: cada diferencia observada con el prototipo queda anotada en `## Evidencia` con su motivo. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C36 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema claro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C37 — R-MUN-008: `## Evidencia` contiene la captura de la vista en escritorio y tema oscuro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C38 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema claro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C39 — R-MUN-008: `## Evidencia` contiene la captura de la vista a 390 px y tema oscuro junto a la del prototipo con el mismo ancho y tema. — no aplica: no se produjeron las capturas y el PO validó el mundo a ojo el 2026-10-09
  - criterio manual: C27 (R-DAT-004): en SaiOpenCloud, el `curl` con `X-Valmen-Project` de SaiOpenCloud y una `AskUserQuestion` abierta devuelve `pregunta.texto` igual a la pregunta mostrada — no aplica: no probado en SaiOpenCloud y el PO acepta que funciona igual el 2026-10-09
  - criterio manual: C28 (R-DAT-004): en SaiOpenCloud, el mismo `curl` dentro de los 60 s posteriores a contestar devuelve `pregunta.respuesta` igual a la opción elegida — no aplica: no probado en SaiOpenCloud y el PO acepta que funciona igual el 2026-10-09
