# @valmen/mcp

El harness al alcance de un agente. Este paquete es el servidor MCP que permite que
**opencode, codex, Claude Code o DSH** creen tickets, los validen, evalúen compuertas y muevan
su estado **sin que nadie escriba un comando**.

Y donde el cliente no hable MCP, el camino sigue abierto: `valmen` es un CLI, así que
cualquier agente con una shell puede hacer lo mismo escribiendo el comando. Las dos puertas
llaman a las mismas funciones —el MCP **es** el CLI con otro transporte—, así que no hay un
camino de segunda.

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

# Escribe las dos configuraciones de proyecto: opencode.json y .mcp.json
# (el de Claude Code). Sin `--install` solo imprime los fragmentos.
valmen mcp --install

# Añade además la sección al config.toml global de codex
valmen mcp --global

# El fragmento de DSH, que va en el perfil y necesita su paquete
valmen mcp

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

Las treinta y cuatro herramientas. Ninguna es una segunda implementación: las de lectura llaman a
las mismas funciones que el CLI, y las de escritura al mismo motor.

| Herramienta            | Qué hace                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| `crear_ticket`         | Alta en `intake`; devuelve la ruta del archivo                    |
| `ver_ticket`           | Resumen del ticket: frontmatter, secciones y bloques              |
| `listar_tickets`       | Filtra por estado, tipo, módulo, texto, puntos, impacto y fechas  |
| `validar_ticket`       | Contrato del ticket; sin `id`, todo el registro                   |
| `mover_ticket`         | Aplica la tabla de estados, y reabre un cerrado con su motivo     |
| `anotar_punto`         | Un hallazgo, con `actual`, `expected` y sus archivos              |
| `mover_punto`          | El ciclo del punto: analizado, en curso, por retestar, verificado |
| `anotar_evidencia`     | La prueba de algo hecho, enlazada a su punto                      |
| `reanudar_ticket`      | Contexto para retomar trabajo empezado                            |
| `evaluar_compuerta`    | Evalúa un gate y escribe el recibo                                |
| `simular_compuerta`    | Mide un gate sobre el histórico, para calibrar                    |
| `ver_features`         | Las features del proyecto, o una con su brief y sus artefactos    |
| `descomponer_feature`  | El grafo de tickets de una feature, propuesto por el `architect`  |
| `ver_procesos`         | Los procesos declarados, o uno con sus pasos y parámetros         |
| `estado_proceso`       | Las corridas, y dónde se detuvo la que espera una decisión        |
| `ejecutar_proceso`     | Corre un proceso; se detiene en el primer gate sin aprobar        |
| `reporte_cierres`      | Reporte de lo cerrado en un rango, por fecha de cierre            |
| `calibrar_compuerta`   | Un gate contra el histórico, con sus falsos aprobados y bloqueos  |
| `manifiesto_entrega`   | La versión y los tickets de una entrega; no publica nada          |
| `indexar_registro`     | Regenera el índice, o dice si se desincronizó                     |
| `revisar_secretos`     | Credenciales en el cambio pendiente, o en el texto que se le pase  |
| `reporte_consumo`      | Evaluaciones, coste y cuánto se decidió en código, con la calibración |
| `reporte_valor`        | Lo mismo ticket por ticket: qué costó cada cierre y qué dejó        |
| `revisar_drift`        | Lo que el ticket cita —archivos, símbolos, tickets— y no existe     |
| `buscar_memoria`       | Lo que el proyecto ya decidió y ya falló, por sus palabras         |
| `guardar_aprendizaje`  | Anexa lo que este trabajo enseñó, cuando se descubre               |
| `ver_estandares`       | Las reglas en vigor y las propuestas que todavía no lo están       |
| `proponer_estandar`    | Propone una convención que el trabajo enseñó; no la pone en vigor  |
| `decidir_estandar`     | Acepta o descarta una propuesta, **con las palabras de la persona** |
| `revisar_presentacion` | Colores fijos en lo que el cambio agrega a las pantallas           |
| `iniciar_qa`           | Abre el ciclo con su ambiente y la referencia de lo probado       |
| `anotar_retest`        | El resultado de retestar un punto                                 |
| `cerrar_qa`            | Cierra el ciclo: hallazgos, o la aprobación con la frase del PO   |
| `preparar_cierre`      | Los dos resúmenes y el impacto de release, antes de cerrar        |

Todas aceptan un `root` opcional que gana sobre el directorio de trabajo, para una sesión que
trabaje sobre dos repositorios. Se declara en todos los esquemas, no solo se lee: un argumento
que el servidor acepta pero el esquema no declara lo rechaza cualquier cliente que valide
antes de llamar.

**El resultado es texto, y en tres casos además dato.** `ver_ticket`, `listar_tickets` y
`evaluar_compuerta` devuelven `structuredContent` junto al informe, para que un agente ramifique por estado o por
veredicto sin interpretar prosa. Donde el dato **ya existe en disco** y se lee tal cual —el
frontmatter con el `parseTicket` del motor, el recibo recién anexado a `.valmen/receipts/`— se
declara `outputSchema`; donde habría que inventar una segunda representación del texto, no.
Dos formas del mismo hecho se desincronizan, y la que se desincroniza es siempre la que nadie
mira. El test afirma la lista exacta de las que lo tienen, para que una herramienta nueva no lo
decida por costumbre.

**Un fallo de herramienta es un resultado, no un error de protocolo.** El agente recibe
`isError: true` con el mensaje del motor —«Falta `type`, y es obligatorio»— y puede corregir.
Un error JSON-RPC lo dejaría sin el motivo.

### Las skills, como prompts

El harness publica además las skills del proyecto —`.valmen/skills/*/SKILL.md`— como
**prompts** del protocolo: `prompts/list` las lista y `prompts/get` devuelve su
procedimiento como mensaje.

Es la pieza que vuelve el servidor agnóstico de verdad. Hoy las skills se **proyectan** a
`.opencode/skills/`, `.claude/skills/` y `.codex/skills/`, y eso funciona con esos tres
clientes y con ningún otro: cada agente nuevo exige escribir un adaptador, y el adaptador es
una copia que se desincroniza. Como prompt las recibe cualquier cliente que hable el
protocolo, sin escribir una línea más — y se sirven desde `.valmen/skills/`, que es la
fuente, así que no hay copia que pueda quedar vieja.

Sin argumentos, a propósito: las skills del harness resuelven por sí solas qué leer, y
declarar argumentos que no usan sería inventar un contrato que nadie escribió.

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

Falta la segunda mitad de C4 —el harness como *cliente* MCP— y la mitad semántica del detector
de drift, que necesita el vínculo requisito ↔ ticket. Ver
`docs/12-FUNCIONALIDADES-PROXIMAS.md`.

**Nada escribe en stdout salvo el protocolo.** Un `console.log` perdido o un aviso de Node
rompen la sesión del agente de una forma que después nadie sabe explicar; los diagnósticos van
a stderr, que el cliente sí muestra.
