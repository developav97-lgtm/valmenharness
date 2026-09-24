# Cómo se trabaja en este repositorio

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
