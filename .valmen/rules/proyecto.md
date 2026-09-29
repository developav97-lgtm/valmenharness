# Cómo se trabaja en este repositorio

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
