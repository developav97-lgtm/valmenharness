---
schema_version: 2
id: guardas-verificacion-harness
title: Guardas y verificación del propio harness
state: decomposed
created: 2026-10-10
updated: 2026-10-10
---

# Guardas y verificación del propio harness

## Problema

El 2026-10-10 el PO pidió comparar Valmen con gentle-ai
(Gentleman-Programming/gentle-ai, revisado en `66bf3e1`, v4.0.0), con sus
palabras: «necesito que revises este repo […] y lo compares contra el nuestro y
me des puntos en lo que el uno le gane al otro y que cosas podríamos incluir en
el nuestro». Al ver la comparación decidió: «yo diría que todas en un feature
[…] podríamos hacer las 8 que enumeraste en un feature y las otras en otro
feature».

La comparación encontró que Valmen gobierna y audita bien el trabajo de los
tickets, pero verifica poco **al propio harness**:

- Un mensaje de rechazo del motor puede nombrar un comando o una bandera que no
  existe, o uno que existe y no saca del bloqueo; ninguna prueba lo comprueba.
- Nadie mide cuánto se atasca quien opera el CLI ni si el bloqueo le dice qué
  correr: se mide la precisión de las compuertas, no la fricción.
- Una función nueva que nadie llama pasa la compilación y las pruebas; una
  guarda escrita y desconectada se lee como cobertura.
- Una prueba vieja que falla puede editarse para que pase sin que nada lo
  impida (va como estándar EST-009, no como ticket).
- La revisión del código es una skill (`revision-final`): el recibo no queda
  atado al árbol exacto que se entrega, y la profundidad no depende del riesgo
  de lo que se tocó.
- «Acciones que nunca se automatizan» vive como texto en `AGENTS.md`; los
  permisos que `valmen sync` proyecta a los agentes no lo hacen cumplir.
- Probar la cascada y las compuertas de punta a punta exige gastar tokens.
- Las skills se cargan enteras y no tienen tope: hoy solo se exige un mínimo.

## Objetivo

Que el harness pruebe con código lo que hoy promete con texto: que cada mensaje
que nombra un comando nombre uno que existe, que el código nuevo sin uso no
entre, que la fricción del CLI se mida y se compare entre dos versiones, que la
revisión del diff quede atada al árbol entregado con una profundidad que sale
del riesgo, que los permisos de los agentes nieguen lo que nunca se automatiza,
que la cascada se pruebe sin gastar tokens y que las skills tengan presupuesto.

## Alcance

- Dentro:
  - Mensajes de rechazo del CLI y del MCP que nombran un comando: el comando y
    sus banderas existen, y una prueba lo comprueba sobre todos los mensajes.
  - Bloqueo en CI del código nuevo sin uso, con línea base de lo que ya existe.
  - Medición de fricción del CLI `valmen`: recorridos deterministas sin modelo
    en un registro temporal, que clasifican cada bloqueo y comparan dos binarios.
  - Revisión del diff congelado: recibo atado al hash del árbol, profundidad
    por el riesgo de lo tocado y dos revisores independientes para SECURITY.
  - Lista de rutas y comandos denegados proyectada por `valmen sync` a los
    permisos de cada agente que lo admita.
  - Prueba de punta a punta de la cascada y las compuertas con un modelo
    guionado local, sin claves ni tokens.
  - Presupuesto de tamaño de las skills, con aviso en `valmen sync`.
- Fuera:
  - El estándar EST-009 (una prueba existente en rojo no se edita): se decide
    con `decidir_estandar`, no se implementa en un ticket.
  - Borrar o «quemar» recibos al aprobar: choca con el invariante 4.
  - Retirar la fase de análisis y plan, o ampliar a más agentes.
  - Lo de operación y entrega: va en la feature `operacion-entrega-harness`.

## Restricciones

- El código manda sobre el modelo: la profundidad de la revisión, la
  clasificación de un bloqueo y la existencia de un comando se deciden en
  código; un modelo solo responde las proposiciones de la revisión.
- `@valmen/core` sigue sin red y sin dependencias externas; la medición de
  fricción y el modelo guionado viven fuera del motor y no entran al binario.
- Los recibos y eventos siguen siendo append-only.
- La lista de denegados no quita permisos que la persona ya configuró a mano:
  se suma, y lo que no puede escribir lo reporta.
- Un cambio de permisos de agentes es de seguridad: su ticket lleva gate humano.

## Artefactos

- `spec/<dominio>/spec.md` — requisitos RFC 2119 y escenarios.
- `design.md` — alternativas y decisión técnica.
- `tickets.yaml` — el grafo: sprints, cobertura y huecos.
- `verify.md` — la evidencia, al completar.
