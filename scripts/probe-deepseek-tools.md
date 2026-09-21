# Receta verificada: salida estructurada de DeepSeek por herramienta

Probado el 21 de septiembre contra `https://api.deepseek.com/v1/chat/completions`
con `deepseek-chat`. **Funciona**: devuelve `tool_calls[0].function.arguments` con
las claves exactas que pide el esquema —`holds`, `confidence`, `reason`— y no las
traduce.

```bash
curl -X POST https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d @scripts/probe-deepseek-tools.json
```

Respuesta (recortada):

```json
{"criterio_01": {"holds": true, "confidence": 0.6, "reason": "El estado indica que…"}}
```

## Lo que NO funciona, y por qué está aquí

| Vía | Resultado |
| --- | --- |
| `response_format: {type: "json_schema"}` | HTTP 400 `This response_format type is unavailable now` |
| `response_format: {type: "json_object"}` | Devuelve `cumple` en vez de `holds` |
| `json_object` + la forma exacta en el prompt | Igual: `cumple` |
| `json_object` + «los nombres son literales, no los traduzcas» | Igual: `cumple` |
| `json_object` + un ejemplo relleno con `holds` | Igual: `cumple` |
| **`tools` + `tool_choice` forzado** | **`holds`, correcto** |

La conclusión: con `json_object` el esquema no se impone y el modelo lo
reinterpreta. La única vía que impone la forma del lado del servidor es la
herramienta.

## Lo que falta

`packages/gate-llm-judge/src/judge.ts` ya arma la petición por herramienta cuando
el proveedor declara `structuredOutput: "json-object"`, y ya lee
`tool_calls[0].function.arguments`. **Pero la llamada desde el juez sigue
devolviendo contenido vacío**, mientras que este mismo payload por `curl` sí
devuelve la herramienta. La diferencia está entre este payload mínimo y el que
arma el juez —que lleva el estado del ticket entero y un prompt de sistema
largo—, y es lo único que falta averiguar: comparar el cuerpo que envía el juez
con este archivo.

## Qué pasó al usarlo desde el juez, y por qué esto se cierra aquí

Con el payload mínimo de arriba, DeepSeek devuelve `tool_calls` con las claves
correctas. **Con el prompt real del juez —largo, en español, con el estado entero
del ticket— no.**

Se instrumentó el error para que dijera qué llegaba, y llegó esto:

```
El mensaje traía las claves [role, content, tool_calls]
y el contenido era "{\"criterio_01\">\n<｜｜DSML｜｜: true, \"confidence\": 0.95, …
```

O sea: emite un `tool_calls` **sin argumentos usables** y vuelca una versión a
medio formar en `content`, con sus tokens internos de herramienta
(`<｜｜DSML｜｜>`) a la vista. No es el transporte —la petición es la receta que
funciona— ni los nombres de las claves: es el modelo degradándose cuando la tarea
estructurada se complica.

**Conclusión: DeepSeek no sirve como juez de gates.** La decisión no es seguir
ajustando el prompt, es no ofrecerlo para ese rol. Y el harness ahora puede
decirlo con esta evidencia en vez de con una intuición.

OpenRouter impone el esquema del lado del servidor y no tiene este problema: es el
camino por el que el juez funciona hoy, y el que debe seguir siendo el
recomendado. Para usar una clave directa como juez habría que elegir un proveedor
que imponga la forma de verdad, no uno que la insinúe.
