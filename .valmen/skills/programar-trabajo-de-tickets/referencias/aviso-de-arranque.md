# El aviso de arranque, paso a paso

El aviso es un script y hace tres cosas, en este orden:

1. **Se asegura de que Mission Control del proyecto esté sirviendo y de que abra desde el
   celular.** Un servidor escuchando sólo en `127.0.0.1` da un enlace que no abre desde el
   teléfono, y el aviso que lo promete es una mentira: el script busca el puerto donde ya
   sirve ese proyecto (comprobando por `/api/health` que el `root` sea el del proyecto, no
   que algo escuche), y si escucha sólo en loopback lo releva en el mismo puerto con
   `--host 0.0.0.0`. Si no estaba sirviendo, lo levanta en el primer puerto libre.
2. **Comprueba que el harness sea el del árbol.** `dist/` no se versiona, así que un build
   atrás de `src/` deja al MCP y al CLI corriendo código viejo. Lo reconstruye **sólo con el
   árbol limpio**: con cambios a medias de otra sesión, reconstruir publicaría un build roto.
   Y después de reconstruir deja caer el proceso del MCP, que sigue siendo el del build
   viejo, para que la próxima llamada lo levante nuevo.
3. Imprime el aviso: el eslabón, el ticket, el proyecto, la hora, el enlace y el estado del
   árbol y del build.

El enlace lo arma una sola vez ese script. La sesión del eslabón lo reusa al entregar con
`--enlace` (imprime sólo la URL): así el enlace no se calcula dos veces con dos criterios, y
si la pantalla no está sirviendo el script no imprime nada y la sesión lo dice en vez de
inventar una URL.

«Actualizado» quiere decir que lo que el PO mira sea el código del árbol, y el enlace lo da
la IP de la máquina, no `127.0.0.1`. Por eso el estándar publica la pantalla en la red
local: la franja de puertos `4173-4199`, un proyecto por puerto, con la frontera de
confianza en la red doméstica.

## Probar el aviso

El aviso se prueba antes de esa hora, no en la hora: correrlo a mano en seco —con la copia
que dejó el `--dry-run`— dice si el enlace sale con la IP de la máquina y si Mission Control
queda sirviendo fuera de loopback (`lsof -nP -iTCP:<puerto> -sTCP:LISTEN` debe mostrar `*:`).
Un aviso que nunca se probó falla justo cuando el PO lo está esperando.
