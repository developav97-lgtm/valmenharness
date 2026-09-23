# @valmen/mcp

El harness al alcance de un agente. Este paquete es el servidor MCP que permite que
**opencode, codex o Claude Code** creen tickets, los validen, evalúen compuertas y muevan su
estado **sin que nadie escriba un comando**.

## Resumen

Un servidor MCP es un proceso que un agente lanza como hijo y con el que habla JSON-RPC 2.0
por stdin y stdout. Este implementa los tres métodos que un cliente usa de verdad
—`initialize`, `tools/list` y `tools/call`— **sin ninguna dependencia**: el camino crítico del
harness se ejecuta dentro de la herramienta de otra persona, y no debería poder romperse
porque cambió una dependencia transitiva.

El ejecutable es `valmen-mcp`.

## Uso

```bash
# Lo que hay que declarar en cada agente, sin escribir nada
valmen mcp

# Lo escribe en la configuración del proyecto (opencode.json), conservando
# los servidores MCP que ya estuvieran declarados
valmen mcp --install

# Añade además la sección al config.toml global de codex
valmen mcp --global

# Comprobar que arranca, sin hablar el protocolo
valmen-mcp --check
```

La entrada que se declara **no lleva rutas absolutas**: el ejecutable se resuelve por el
`PATH` y el directorio de trabajo es `"."`, el del propio archivo de configuración. Un archivo
versionado con la ruta de una máquina no arranca en ninguna otra, y el síntoma —«la
herramienta no existe»— no dice por qué.

### La trampa del `PATH`, que es el primer fallo real

Una aplicación de escritorio lanzada desde el Finder **no hereda el `PATH` de tu shell**: en
macOS recibe los directorios de `/etc/paths`, que son `/usr/local/bin`, `/usr/bin`, `/bin`,
`/usr/sbin` y `/sbin`. Los sitios donde la gente instala binarios —`~/.local/bin`,
`/opt/homebrew/bin`— no están ahí, así que un `valmen-mcp` perfectamente instalado no se
encuentra, y el agente se queda sin herramientas sin dar ningún error que lo explique.

Se comprueba en un segundo, y conviene hacerlo antes de culpar al agente:

```bash
# El PATH que ve una app del Finder
env -i PATH="$(tr '\n' ':' < /etc/paths)" sh -c 'command -v valmen-mcp'
```

En un Mac con Homebrew, `/opt/homebrew/bin` **sí** está en el `PATH` que recibe la app
—aunque no en `/etc/paths`— y es escribible por el usuario, así que es el sitio correcto:

```bash
ln -sf "$(command -v valmen)"     /opt/homebrew/bin/valmen
ln -sf "$(command -v valmen-mcp)" /opt/homebrew/bin/valmen-mcp
```

En Linux, `/usr/local/bin` con `sudo`. Y abrir el agente desde una terminal también vale,
porque ahí sí hereda el `PATH` completo.

## Contrato

Las diez herramientas. Ninguna es una segunda implementación: las de lectura llaman a las
mismas funciones que el CLI, y las de escritura al mismo motor.

| Herramienta              | Qué hace                                              |
| ------------------------ | ----------------------------------------------------- |
| `crear_ticket`           | Alta en `intake`; devuelve la ruta del archivo        |
| `ver_ticket`             | Resumen del ticket: frontmatter, secciones y bloques  |
| `listar_tickets`         | Tickets activos, con filtros por estado, tipo, módulo, texto y fechas |
| `anotar_punto`           | Un hallazgo, con `actual` y `expected` separados      |
| `anotar_evidencia`       | La prueba de algo hecho, enlazada a su punto          |
| `validar_ticket`         | Contrato del ticket; sin `id`, todo el registro       |
| `evaluar_compuerta`      | Evalúa un gate y escribe el recibo                    |
| `mover_ticket`           | Aplica la tabla de estados del contrato               |
| `reanudar_ticket`        | Contexto para retomar trabajo empezado                |
| `simular_compuerta`      | Mide un gate sobre el histórico, para calibrar        |

Todas aceptan un `root` opcional que gana sobre el directorio de trabajo, para una sesión que
trabaje sobre dos repositorios. Se declara en todos los esquemas, no solo se lee: un argumento
que el servidor acepta pero el esquema no declara lo rechaza cualquier cliente que valide
antes de llamar.

**El resultado es texto, y en dos casos además dato.** `ver_ticket` y `evaluar_compuerta`
devuelven `structuredContent` junto al informe, para que un agente ramifique por estado o por
veredicto sin interpretar prosa. Donde el dato **ya existe en disco** y se lee tal cual —el
frontmatter con el `parseTicket` del motor, el recibo recién anexado a `.valmen/receipts/`— se
declara `outputSchema`; donde habría que inventar una segunda representación del texto, no.
Dos formas del mismo hecho se desincronizan, y la que se desincroniza es siempre la que nadie
mira. El test afirma la lista exacta de las que lo tienen, para que una herramienta nueva no lo
decida por costumbre.

**Un fallo de herramienta es un resultado, no un error de protocolo.** El agente recibe
`isError: true` con el mensaje del motor —«Falta `type`, y es obligatorio»— y puede corregir.
Un error JSON-RPC lo dejaría sin el motivo.

## Limitaciones

**No hay herramienta para aprobar una compuerta, y no es un olvido.** La aprobación es una
decisión humana: vive en Mission Control y en `valmen gate-decide`. Un agente que pudiera
aprobarse a sí mismo convertiría el control en un trámite.

Tampoco hay forma de saltar la tabla de estados. Un agente puede recorrer
`intake → analyzed → planned` y **no puede cruzar** a `approved`: el motor exige la línea de
aprobación explícita del PO en el plan, y la plantilla la deja vacía.

**Las que deciden siguen fuera, y son más que las compuertas.** Cerrar un ciclo de QA con
veredicto del PO, publicar una release y aprobar una compuerta de proceso son la misma clase
de cosa: un agente puede prepararlas, reunir la evidencia y anotar el resultado que una
persona le dio —con sus palabras—, pero el veredicto no se lo puede dar.

Anotar el consumo de IA tampoco está, y no por olvido: el gasto real vive en la base de datos
de opencode, y un modelo que declara lo que gastó lo está estimando. Lo escribe quien lo mide.

Falta la segunda mitad de C4 —el harness como *cliente* MCP— y las herramientas que dependen
de trabajo que todavía no existe (`descomponer_feature`, `process_run`, `usage_report`,
`memory_*`, `drift_check`). Ver `docs/12-FUNCIONALIDADES-PROXIMAS.md`.

**Nada escribe en stdout salvo el protocolo.** Un `console.log` perdido o un aviso de Node
rompen la sesión del agente de una forma que después nadie sabe explicar; los diagnósticos van
a stderr, que el cliente sí muestra.
