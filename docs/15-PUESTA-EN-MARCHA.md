# Puesta en marcha

Para quien llega nuevo: instalar el harness en su máquina y dejarlo funcionando en su
proyecto. **Veinte minutos**, y la mitad es leer.

Está escrito para que lo siga **una persona o un agente**. Si lo va a hacer un agente,
al final está [el texto exacto que hay que pegarle](#para-el-agente-el-texto-que-se-le-pega).

---

## Lo que hace falta

| Qué | Detalle |
|---|---|
| **Node 22 o superior** | `node --version`. El motor no tiene dependencias; Node es todo lo que necesita. |
| **git** | El estado del trabajo vive en archivos versionados. |
| **Un agente de código** | Claude Code, opencode, codex o DSH. El harness se instala **dentro** del que ya uses: no lo reemplaza. |
| **Una credencial, o una suscripción** | Claude Code y codex se leen de su propio CLI: si ya los tenés autenticados, no hay nada que pegar. |

Comprobalo de una vez:

```bash
node --version && git --version && claude --version
```

---

## 1. Instalar el harness (una vez por máquina)

Todavía no está publicado en npm: se instala desde el repositorio.

```bash
git clone https://github.com/developav97-lgtm/valmenharness.git ~/valmenharness
cd ~/valmenharness
npm install
npm run build
```

Y dejar el comando a mano, en un directorio que ya esté en el `PATH`:

```bash
ln -sf ~/valmenharness/packages/cli/dist/main.js ~/.local/bin/valmen
ln -sf ~/valmenharness/packages/mcp/dist/main.js ~/.local/bin/valmen-mcp
valmen --version
```

> Si preferís `npm link`, funciona igual: `cd ~/valmenharness/packages/cli && npm link`.
> La diferencia es que `npm link` escribe en el prefijo global de npm y el enlace no.

---

## 2. Poner en marcha el proyecto (una vez por proyecto)

Desde la raíz del proyecto, con el agente cerrado:

```bash
cd ~/mi-proyecto
valmen adopt      # perfila el proyecto y escribe .valmen/ — no borra nada
valmen sync       # proyecta .valmen/ a AGENTS.md y a las skills de cada agente
valmen doctor     # dice qué falta, con el comando que lo arregla
```

`adopt` **no decide nada por vos**: mira el proyecto, detecta el stack, arma
`.valmen/config.yaml` y deja vacíos los archivos donde van las reglas del equipo
(`.valmen/rules/`) y los agentes del proyecto (`.valmen/agents/`). Escribir esas reglas es
trabajo de la persona que conoce el sistema, no del instalador.

`doctor` es el comando al que vas a volver cada vez que algo no ande. No escribe nada: lee,
diagnostica y **dice el comando exacto**. Sale con código 2 si falta algo bloqueante, así que
sirve en un guion de instalación.

---

## 3. Elegir el proveedor y los modelos

Acá se decide **qué modelo ejecuta el harness** —los gates, la descomposición de features, el
chat de configuración—. No es el modelo con el que trabaja tu agente: eso lo configura tu
agente, en tu agente.

### Claude Code (suscripción, sin factura por token)

```bash
valmen provider list          # mirá en qué estado está
valmen provider test claude-code
valmen provider models claude-code
```

No hay nada que pegar: el harness **lee** el token que Claude Code ya guardó, y nunca lo
reescribe —el `refresh_token` es de su CLI, y dos clientes renovando a la vez rompen la
sesión—. Dónde vive ese token depende del sistema, y esto se descubrió mirando una máquina
real:

| Sistema | Dónde está |
|---|---|
| **macOS** | En el llavero, entrada `Claude Code-credentials`. **No** hay archivo. |
| **Linux y Windows** | `~/.claude/.credentials.json` |

Si el token caducó, el harness lo dice con la fecha y con el comando que lo arregla:

```text
La sesión de Claude Code caducó el 2026-04-29 10:06 (UTC). El harness no la renueva
—el `refresh_token` es de su CLI y dos clientes renovando a la vez rompen la sesión—.
Ejecutá `claude` una vez y volvé a intentar.
```

### Anthropic con clave de API (factura por token)

```bash
valmen provider set anthropic --key sk-ant-api03-…
```

La clave **se prueba antes de guardarse**: si el proveedor no responde 200, no se escribe
nada y el error es el del proveedor, sin parafrasear. La clave nunca se vuelve a mostrar —
`provider list` dice que está configurada y cuánto mide, que es lo que permite notar una
truncada sin exponerla.

### Otros proveedores

```bash
valmen provider list                       # los que hay, con su estado
valmen provider set deepseek --key sk-…    # cualquiera de clave de API
valmen provider test deepseek --model deepseek-v4.1-flash
valmen provider models deepseek            # su catálogo, en vivo
```

Las credenciales quedan en `~/.valmen/.credentials.yaml`, con permisos `600`, conservando
los comentarios del archivo.

### Los modelos, rol por rol

El harness solo elige el modelo de **lo que él ejecuta**: los cuatro roles que tienen quién
los consuma.

```bash
valmen routing show
```

```text
  rol             proveedor       modelo                          origen
  gate-evaluator  claude-code     claude-sonnet-5                 preset
  gate-judge      claude-code     claude-sonnet-5                 preset
  orchestrator    claude-code     claude-sonnet-5                 preset
  architect       claude-code     claude-opus-4-8                 preset
```

Para un equipo que trabaja con Claude, el preset que ya viene hecho es `suscripcion`:

```bash
valmen routing set --preset suscripcion      # los cuatro roles a Claude
valmen routing set architect --provider claude-code --model claude-opus-4-8 --effort high
valmen routing clear architect               # vuelve al preset
```

Presets: `quality`, `balanced`, `economy`, `suscripcion`. Se cambia en cualquier momento y
aplica en la corrida siguiente: no hay que reiniciar nada.

> **Lo que se gana y lo que se pierde.** El evaluador por defecto es `typesafe/jev-1.13`, que
> emite **probabilidades calibradas**: el veredicto de un gate es entonces un conjunto de
> comparaciones numéricas y sale igual dos veces. Con Claude como evaluador el gate pasa a ser
> el juicio de un modelo: funciona, y deja de ser reproducible entre corridas. `valmen routing
> show` lo dice solo, porque el aviso sale del modelo declarado y no de una bandera.

---

## 4. Conectar el agente

El harness se usa por **dos puertas**, y las dos llaman al mismo motor: el CLI (`valmen …`) y
el servidor MCP. Con el MCP conectado, el agente no necesita que le dictes comandos.

```bash
valmen mcp --install     # opencode.json y .mcp.json de Claude Code
valmen mcp --global      # además, el config.toml de codex (es de la persona, no del proyecto)
valmen mcp               # imprime el fragmento exacto de cada agente, sin escribir nada
```

| Agente | Archivo | Alcance |
|---|---|---|
| **Claude Code** | `.mcp.json` | proyecto — **es el único que se versiona** |
| **opencode** | `opencode.json` | proyecto |
| **codex** | `~/.codex/config.toml` | global: la raíz sale del directorio de trabajo |
| **DSH** | `~/.dsh/profiles/<perfil>/cordis.patch.yml` | global, y además hay que instalar el puente |
| **Hermes** | `~/.hermes/config.yaml` | global, con la raíz de cada proyecto en su entrada |

`--install` **conserva** lo que ya estuviera declarado en esos archivos: agrega la entrada del
harness y deja el resto igual.

Reiniciá el agente después de instalarlo. En Claude Code, `/mcp` tiene que listar `valmen`
como conectado; si no, `valmen mcp` imprime la ruta que se escribió en `.mcp.json` y ese es el
primer lugar donde mirar.

---

## 5. El primer ticket

El registro vive en `tickets/` (o en `docs/tickets/` si el proyecto venía de ahí: el CLI lo
detecta solo).

```bash
valmen create --id BUGFIX-DEMO-PRIMERO-20260925 \
  --title "El listado no pagina" \
  --type BUGFIX --module DEMO \
  --request "Cuando entro al listado con más de veinte filas, no puedo pasar a la página siguiente."

valmen validate --all     # el contrato del ticket
valmen active             # lo que está en curso
valmen serve              # Mission Control: http://127.0.0.1:4173
```

A partir de ahí el recorrido es siempre el mismo —análisis, plan, aprobación de una persona,
implementación, entrega, QA, cierre— y está contado entero, con quién decide cada paso y
cuánto cuesta, en [`13-RECORRIDO-COMPLETO.md`](13-RECORRIDO-COMPLETO.md).

**Lo que ninguna puerta puede hacer** es aprobar: no existe la herramienta, y no es un olvido.
Aprobar una compuerta, aprobar una QA o aceptar un estándar son decisiones de una persona, y
el agente las **cita**; nunca las escribe.

---

## 6. Decidir desde el celular (opcional)

El harness no integra mensajería: delega en [Hermes Agent](https://github.com/NousResearch/hermes-agent),
que ya habla veintiuna plataformas. Lo que se construye es el puente.

```bash
valmen hermes status                  # qué falta, de las cuatro cosas que pueden faltar
valmen hermes connect                 # declara el servidor y le instala la skill
valmen hermes connect --dry-run       # muestra lo que escribiría, sin escribir
valmen hermes connect --name valmen-otro-proyecto   # un segundo proyecto son dos entradas
valmen hermes test                    # un mensaje de prueba al celular
valmen hermes notify                  # avisa de los gates que esperan decisión
valmen hermes brief                   # el parte: lo que espera, lo que se detuvo, lo que se cerró
```

Qué es global y qué es de cada proyecto, porque es la confusión más común:

| Pieza | Alcance |
|---|---|
| `~/.hermes/config.yaml` con la entrada MCP | **global**, y cada entrada lleva la raíz de su proyecto |
| La skill `valmen` (cómo se usa el harness) | **global**: el harness es el mismo en todos los proyectos |
| El relé (`hermes relay --install`) | **global** |
| Las reglas del proyecto | **del proyecto**: van en `AGENTS.md` y en `.valmen/rules/`, y llegan a Hermes por el prompt `reglas-del-proyecto` |
| El flujo de trabajo del equipo (quién implementa, quién verifica, qué se aprueba) | **del proyecto**: va en una skill del perfil de Hermes, si el equipo quiere que el agente lo siga al pie de la letra |

Lo que se gana: una compuerta que espera una decisión llega al celular, y los gates de riesgo
`low` o `normal` traen un código corto para decidirlos a distancia. **El techo de riesgo lo
aplica el motor**: no se emite token para riesgo `high` o `critical`, ni para un ticket con
impacto de migración, contenedores o sincronización. No hay parámetro para saltearlo.

---

## Para el agente: el texto que se le pega

Esto es lo que se le pega a Claude Code —o a opencode, o a codex— cuando ya está instalado el
harness y hay que configurar un proyecto. Es el camino que hace que **no** haya que abrir la
pantalla ni tocar un archivo a mano.

```text
Estoy en un proyecto que quiero trabajar con el harness ValmenHarness. El harness ya está
instalado en mi máquina y el comando `valmen` está en el PATH.

Quiero que hagas la puesta en marcha y que te detengas cada vez que haga falta una decisión
mía. El procedimiento está en el repo del harness; la ruta es ~/valmenharness si no te la
indico otra.

1. Leé ~/valmenharness/docs/15-PUESTA-EN-MARCHA.md y seguí esa guía paso por paso. Es la
   fuente: no la reemplaces por tu criterio ni por lo que recuerdes.
2. Corré `valmen doctor` y mostrame el resultado tal como sale.
3. Hacé lo que no requiere ninguna decisión mía: `valmen adopt` y `valmen sync`.
4. Pará y preguntame lo que sí la requiere: qué proveedor usar, qué modelos, si conectar
   Hermes. No elijas por mí y no configures ninguna credencial sin que te lo diga.
5. Cuando te conteste, aplicá lo que decidí con `valmen provider set` y `valmen routing set`,
   y mostrame `valmen routing show`.
6. Conectá el MCP con `valmen mcp --install` y decime qué tengo que reiniciar.
7. Al final, volvé a correr `valmen doctor` y mostrame qué quedó y qué falta.
8. No crees tickets, no escribas en el registro y no apruebes nada: eso también lo decide una
   persona, y es justamente lo que el harness protege.
```

Lo que el agente **no** puede hacer, ni con este texto ni con otro: aprobar una compuerta,
escribir la confirmación de nadie, ni ampliar lo que se le autorizó. Si te dice que lo hizo,
el registro lo desmiente.

---

## Problemas comunes

**`valmen: command not found`.** El enlace no está en el `PATH`, o el `PATH` de tu shell no
incluye `~/.local/bin`. Probá con la ruta completa
(`~/valmenharness/packages/cli/dist/main.js --version`) y agregá el directorio al `PATH`.

**`No se encontró el directorio de tickets`.** El CLI detecta `tickets/` y `docs/tickets/`
solo. Si el registro está en otro sitio, se dice con `--tickets-dir <ruta>`.

**El agente no ve las herramientas del harness.** El MCP se declara **por proyecto** en
`.mcp.json` y `opencode.json`, y hay que reiniciar el agente después. `valmen mcp` imprime lo
que debería estar escrito, para compararlo con lo que hay.

**Un gate se queda sin modelo.** `valmen routing show` dice de dónde sale el modelo de cada
rol. Si el rol apunta a un proveedor sin credencial, `valmen doctor` lo marca con el comando
que lo arregla.

**`El proveedor respondió HTTP 401`.** Si es un proveedor de suscripción, la sesión de su CLI
caducó: corré su CLI una vez (`claude`, `codex`). Si es de clave, `valmen provider test <id>`
dice si la clave sirve, sin gastar un gate.

**El cierre se rechaza por el consumo.** Es a propósito: `## Consumo de IA` tiene que tener al
menos una entrada, con los números de la sesión y una fuente que apunte de verdad a donde
salieron (`opencode:`, `hermes:`, `codex:`, `manual:`, `process:`). Se registra con
`valmen add-ai-usage`, o con la herramienta `registrar_consumo_ia` desde el agente.

**Quiero ver qué está pasando sin terminal.** `valmen serve` levanta Mission Control en
`http://127.0.0.1:4173`: tickets, features, gates, estándares, proveedores y consumo. Con
`--host 0.0.0.0` se mira desde una tablet en la misma red —y queda dicho que **no tiene
autenticación**: la frontera de confianza es la red—.

---

## Cómo saber que quedó bien

```bash
valmen doctor          # sin ✗ : los avisos son opcionales de verdad
valmen routing show    # los cuatro roles con proveedor y modelo
valmen mcp             # el fragmento que tu agente tiene que tener declarado
valmen validate --all  # el registro, contra el contrato
```

Y la prueba de verdad: **pedile al agente que cree un ticket**. Si aparece en
`valmen active` con su estado, la puerta del agente está conectada y el motor está escribiendo
donde tiene que escribir.
