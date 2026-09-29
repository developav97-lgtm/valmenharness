---
name: manuales-usuario-final
description: Usar al crear, actualizar o auditar el manual de usuario final de una pantalla. El código real siempre manda: se leen el componente y su template completos antes de escribir una línea, y toda ambigüedad va a la sección de pendientes en vez de inventarse.
version: 1.0.0
origen: valmen
---

# Manuales de usuario final

Un manual describe una pantalla para quien la usa, no para quien la programa. Este documento fija **cómo se escribe** —qué se lee antes, qué tono se usa y qué no se inventa— y declara la plantilla que el manual tiene que seguir. Lo que cambia es el contenido de cada pantalla; la forma, no.

## Regla de oro

Ningún manual se escribe ni se corrige por intuición de «cómo debería funcionar». Se leen **el componente y su template completos —nunca solo uno de los dos—** antes de escribir una línea. Si el `.ts` dice una cosa y el template otra, gana el código real, y la diferencia se declara como pendiente.

## Reglas duras

- **El sujeto es el sistema o la pantalla, nunca «Acá se…».** «La pantalla lista las órdenes», no «Acá se listan las órdenes» ni «Es la pantalla que…».
- **Los pasos van en infinitivo impersonal**, en el orden real del flujo. «Seleccionar el cliente», «Presionar Guardar». Ni «Seleccione» ni «Se selecciona».
- **Los mensajes de error se copian literales del código**, no se parafrasean ni se traducen. Si el código dice «No se pudo guardar la orden», el manual dice exactamente eso.
- **Cero rutas técnicas en el texto que lee el usuario final.** Nada de `src/app/…`, `component.ts` ni nombres de archivo. La única ruta del manual vive en la línea `<!-- rutas-fuente: … -->`, que no se muestra.
- **`**¿Dónde encontrarla?:**` usa navegación en lenguaje de menú**, nunca la ruta técnica de la aplicación.
- **Toda ambigüedad va en `## ⚠️ Pendiente de validación con el equipo`.** Lo que no se pudo verificar en el código no se completa por lo que parece: se deja escrito como pendiente.
- **El mensaje de error sin respaldo en el código no se escribe.** Se copia del código o se declara como pendiente; no se inventa una frase verosímil.
- **El código ISO sale de la fuente oficial del proyecto y no se inventa.** El prefijo del manual se toma de esa fuente, no de una suposición.

## Cómo se escribe

1. Leer completos el componente y su template de la pantalla.
2. Recolectar del código qué muestra la pantalla, cómo se usa, qué campos tiene, qué mensajes de error emite y qué no está claro.
3. Escribir el manual con la plantilla de abajo, reemplazando sus marcadores. Los mensajes de error se pegan tal cual aparecen en el código.
4. Completar `<!-- rutas-fuente: … -->` con los archivos que se leyeron, separados por coma, para que el chequeo de frescura pueda cruzar el manual con el código.
5. Dejar en pendientes todo lo que el código no responda.

`valmen manuales plantilla` emite este mismo esqueleto; con `--escribir --destino <ruta>` lo deja en disco sin pisar un manual existente, y con `--forzar` lo reescribe. **No se commitea**: el commit lo decide una persona.

## La plantilla

Todo manual se escribe con esta forma exacta:

<!-- plantilla:inicio -->
```markdown
# [Nombre de la pantalla]

**Módulo:** ...
**¿Dónde encontrarla?:** ...
**Última actualización:** YYYY-MM-DD
**Código:** [prefijo-ISO]
**Versión:** V1
<!-- rutas-fuente: … -->

## ¿Qué es esta pantalla?

## ¿Cómo se usa?

## Campos del formulario

## Qué hacer si algo sale mal

## Tips y cosas a tener en cuenta

## ⚠️ Pendiente de validación con el equipo

```
<!-- plantilla:fin -->
