# Invariantes de esta arquitectura

Cada una de estas reglas salió de un incidente en producción. No son preferencias
de estilo: son cosas que ya rompieron algo una vez, y la explicación de por qué
están escritas así está en el registro de errores del proyecto que las destiló.

## Despliegue y migraciones

1. **Las migraciones corren antes del despliegue, y el canario se acota por
   esquema.** En un multi-inquilino, migrar «todo» en un entorno que comparte base
   con producción migra producción. Un canario que no declara su esquema no es un
   canario: es un despliegue.

2. **Un cambio de modelo lleva su migración en el mismo cambio.** `makemigrations
   --check` limpio antes de entregar. Un modelo sin migración funciona en la máquina
   donde se escribió y falla en cada inquilino que todavía no la tiene.

3. **La versión visible se sube en un solo sitio y en el mismo paso.** Si el número
   que muestra la aplicación y el de la release viven en dos archivos, tarde o
   temprano dicen cosas distintas, y el que miente es el que ve el cliente.

## Datos y sincronización

4. **`bulk_create` y `bulk_update` no disparan señales.** Cualquier cosa que dependa
   de `post_save` —colas de sincronización, auditoría, índices de búsqueda— **no se
   alimenta** con una operación masiva. Se registra explícitamente o se usa el
   camino que sí dispara.

5. **Una operación masiva respeta los guardas de sincronización.** Si existen
   banderas para no encolar ni emitir señales durante una importación, se respetan:
   saltárselas deja la cola con registros que nadie va a poder conciliar.

6. **El número de documento se consume después de persistir, nunca antes.** Un
   consecutivo gastado sin documento es un hueco que después no se puede explicar
   —ni ante el cliente, ni ante la autoridad fiscal—.

## Cliente

7. **El estado del servidor en el navegador no es caché de descarte.** Los almacenes
   locales (IndexedDB y compañía) sobreviven al despliegue: un cambio de permisos,
   de catálogo o de configuración **no llega** hasta que ese almacén se invalida.
   Todo dato que el cliente cachee necesita su forma de invalidarse, y el cambio que
   lo introduce es el que tiene que escribirla.

8. **El cliente no inventa lo que no tiene.** Cuando un dato falta en el almacén
   local, se pide y se dice por qué si falla. Rellenar con un valor por defecto
   convierte un error visible en un dato equivocado silencioso.

## Cómo se usa esto

Estas reglas se citan en el plan y en el diagnóstico de un ticket que las toque, y
el registro de errores del proyecto —indexado por `buscar_memoria`— tiene el caso
concreto de cada una. Si alguna deja de ser cierta para este proyecto, se corrige
aquí: una regla que ya no aplica y sigue escrita enseña a ignorar el archivo.
