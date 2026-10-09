---
schema_version: 2
id: IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009
title: Atribuir a cada ticket el consumo real de los subagentes que lo trabajaron
type: IMPROVEMENT
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-09
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009

## Solicitud original

El PO pidió el 2026-10-09 saber si el harness mejora o «estamos perdiendo el tiempo y es mejor hacer todo directo», y eligió «arreglemos las fugas» antes de un experimento A/B, con la opción «Consumo real»: que el harness lea tokens y tiempo de los transcripts por ticket en vez de dejar «manual:» sin números. Hallazgo: en la corrida orquestada de vista-agentes todos los tickets quedaron con consumo `manual:` sin números, porque la sesión orquestadora toca varios tickets y queda «compartida» (packages/server/src/timeline.ts:451-482), y los subagentes —uno por ticket, con el ticket en su primer mensaje— se cuentan dentro de ella (timeline.ts:162). El consumo real sí está en los transcripts: medido a mano, 31 subagentes Opus y Sonnet, ~135 M de lectura de caché.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Cada decisión lleva su pregunta al PO y la opción por defecto con la que se planifica si no responde.

**Decisiones del PO (2026-10-09, por AskUserQuestion, respuestas literales):**
- Atribución: «Por lo que escribió (Recomendado)» —el subagente se atribuye al ticket en cuyo registro escribió—. Resuelve la decisión 1.
- REVIEW de la compuerta de plan: «Partir 4 y repetir (Recomendado)» —C3, C4, C15 y C28 se parten en criterios de una sola afirmación y se repite la compuerta—.
- Supuestos: «Acepto las cinco (Recomendado)». Resuelve las decisiones 2 a 6 con su opción por defecto.

Con eso no queda ninguna decisión pendiente; las seis siguientes quedan como registro de la pregunta y de la opción elegida.

1. **Con qué criterio un subagente es de un ticket.** Pregunta: ¿un subagente se atribuye por lo que **escribió** en el registro (como hoy la sesión, `packages/server/src/claude.ts:523-531`) o por el primer ticket de su primer mensaje (como la vista Agentes, `packages/server/src/agentes.ts:236-241`)? Por defecto: por lo que escribió; con exactamente un ticket escrito es propio de ese ticket, con dos o más sigue compartido y sin escrituras sigue dentro de la sesión madre. Motivo con datos reales de la sesión `4f9b1b12-ced4-4132-9151-c3a025ede085` (32 subagentes): por escrituras, 31 resuelven a un solo ticket y 1 (un intento previo de este ticket, sin escrituras) queda en la madre; por «el primer mensaje nombra un solo ticket», 3 (`a70522d5`, `a9098c4f`, `a9bce27a`) quedarían compartidos porque su brief cita tickets relacionados, ~16,3 M de caché leída. Además conserva la prueba vigente «el prompt de un subagente no atribuye» (`tests/claude.test.ts:671`).
2. **Qué referencia de sesión lleva la entrada de un subagente.** Pregunta: ¿`<sesión>/agent-<id>` o el id del subagente solo? Por defecto: `<sesión>/agent-<id>` (por ejemplo `4f9b1b12-…/agent-a5d16add…`), con `source` `claude:<sesión>/agent-<id>`: es única, se encuentra en disco y la deduplicación de `sessionNumbersOwner` (`packages/engine/src/append.ts:326`) la trata como otra sesión.
3. **Qué pasa con la sesión madre.** Pregunta: ¿la madre compartida sigue sin números? Por defecto: sí, sigue compartida y sin números; su nota informa el total **sin** los subagentes ya atribuidos a un ticket, para que ninguna cifra cuente dos veces el mismo gasto.
4. **Una madre ya registrada con números.** Pregunta: ¿qué pasa si la madre es propia de un ticket y ya quedó registrada con números que incluían a sus subagentes? Por defecto: si la referencia de la madre ya está en el bloque `## Consumo de IA` de algún ticket con números, sus subagentes no se separan (ya están contados en ella); el bloque es append-only y no se corrige.
5. **Varios subagentes del mismo ticket.** Pregunta: ¿una entrada por subagente o una sola sumada? Por defecto: una entrada por subagente (análisis, plan, implementación), cada una con su modelo; el total del ticket es la suma que ya hace `reporte_consumo`.
6. **Costo y tiempo.** Pregunta: ¿se calcula un costo en dólares y se registra la duración? Por defecto: sin costo —el harness no tiene tabla de precios y Claude Code es suscripción (`packages/server/src/timeline.ts:1301-1303`)—, se registran tokens; la duración (primer a último evento del subagente) va solo en `notes`, sin campo nuevo.

## Descripción funcional

- Alcance: el lector de sesiones de Claude Code (`packages/server/src/claude.ts`) y la foto de consumo (`guardarFotoEnTicket`, `packages/server/src/timeline.ts:1305`) separan a cada subagente que trabajó un solo ticket y le registran a ese ticket sus tokens. Fuera de alcance: los lectores de opencode, codex y Hermes, una tabla de precios y la vista Agentes.
- Usuario o rol afectado: el PO, que mide si el harness ahorra o cuesta (`reporte_consumo`, `## Consumo de IA` de cada ticket), y el cierre de cada ticket de una corrida orquestada.
- Comportamiento actual: en una corrida orquestada la sesión madre trabaja varios tickets y queda compartida; los subagentes —uno por ticket y fase— se suman dentro de ella, y cada ticket recibe una entrada sin números. En la corrida vista-agentes todos los tickets quedaron con `manual:` o compartida sin números.
- Comportamiento esperado: cada subagente que escribió en el registro de un solo ticket deja en ese ticket una entrada propia con modelo y tokens (entrada, salida, total, caché leída en la nota); los subagentes del mismo ticket se suman como entradas separadas; la madre sigue compartida y sin números, y ningún gasto se cuenta dos veces.

## Diagnóstico

Memoria consultada (`buscar_memoria` «consumo de IA sesión compartida subagentes ticket manual sin números»): sin antecedente; AP-002, AP-003, AP-007 y AP-008 no tratan el consumo.

- Causa comprobada (con `ruta:línea`):
  - `packages/server/src/claude.ts:602-609`: los transcripts de `subagents/agent-*.jsonl` se leen con `leerTranscripcion` sobre **el mismo** `acumulado` de la madre; sus mensajes, tokens y tickets escritos se funden con los de ella.
  - `packages/server/src/claude.ts:614-615`: la atribución se calcula una sola vez sobre ese acumulado fundido; como cada subagente escribe en su ticket (`leerLlamada`, `claude.ts:329-367`), la madre suma N tickets trabajados y `compartida = tickets.length > 1`.
  - `packages/server/src/timeline.ts:473`: `sesionDeClaude` convierte la compartida en `reparto`, y `timeline.ts:1394-1410` registra esa sesión **sin números** en cada ticket. El gasto de los subagentes queda dentro de esa entrada sin números: ningún ticket lo recibe.
  - `packages/server/src/claude.ts:663`: de los subagentes solo sobrevive el conteo (`subagentes`), que `timeline.ts:1267-1268` menciona en la nota.
  - Medido con datos reales (script de solo lectura sobre `~/.claude/projects/-Users-juanandrade-Desktop-ValmenHarness/4f9b1b12-ced4-4132-9151-c3a025ede085/subagents/`): 32 subagentes con `meta.json` (`model` opus o sonnet, `description`); 31 escribieron en el registro de exactamente un ticket (`valmen transition|gate --id`, `mcp__valmen__mover_ticket`…), 1 no escribió. Por ticket hay de 1 a 3 subagentes (p. ej. `FEATURE-SERVER-SESION-PRINCIPAL-20261008`: 3, con 257 073 de entrada, 4 513 416 de caché leída y 26 836 de salida). El primer mensaje de 3 subagentes nombra 2 o 3 tickets porque el brief cita tickets relacionados, aunque escribieron en uno solo.
- Hipótesis pendientes:
  - El prefiltro `contenido.includes(ticketId)` (`claude.ts:584`) mira solo la transcripción madre. En la sesión real la madre nombra cada ticket (34, 56 y 7 apariciones de tres ids comprobados), pero un orquestador que pase el brief solo por archivo dejaría fuera al subagente. Se comprueba en la prueba con una madre que no nombra el ticket.
  - El filtro de 60 días por `mtime` (`claude.ts:573`) usa el archivo de la madre; un subagente no extiende su vida. No se cambia.
- Consumidores afectados: `guardarConsumoDeSesiones` (`packages/cli/src/commands.ts:1972`), llamado desde el cierre del CLI (`packages/cli/src/main.ts:1201`, `:1305`) y del MCP (`packages/mcp/src/tools.ts:3355`, `:3459`); la línea de tiempo de Mission Control (`leerLineaDeTiempo`, `timeline.ts:362`, y `consultar`, `timeline.ts:1052-1061`, que es el camino real en esta máquina porque existe `~/.local/share/opencode/opencode.db`); `lineaSoloDeClaude` (`timeline.ts:478-510`); `sessionNumbersOwner` y `addAiUsage` (`packages/engine/src/append.ts:326-395`); las pruebas `tests/claude.test.ts:631-699` y `tests/timeline.test.ts:578-…`, `:916-…`.
- Archivos y flujo investigados: cierre → `guardarConsumoDeSesiones` → `guardarFotoEnTicket` → `leerLineaDeTiempo(ticketId)` → `leerSesionesDeClaude` (`claude.ts:544-671`: `leerTranscripcion` de madre y subagentes, `atribucion`, totales) → `sesionDeClaude` → `addAiUsage` por sesión pendiente, con `sesionesRegistradas` (`timeline.ts:1438`) para no repetir referencias. La vista Agentes (`agentes.ts:236-241`) ya saca el ticket del primer mensaje del subagente, pero no lee tokens.
- Riesgos y compatibilidad:
  - Doble conteo: si un subagente se separa, la madre debe dejar de sumarlo; si la madre ya quedó registrada con números (madre propia), separarlo después duplicaría el gasto en un bloque append-only. Se cubre con la decisión 4 y un criterio.
  - Entradas ya registradas no se reescriben (append-only); la foto nueva solo añade entradas con referencia `<sesión>/agent-<id>`, que `sesionesRegistradas` deduplica.
  - La prueba `tests/claude.test.ts:632` espera hoy que el gasto del subagente se sume a la madre propia del mismo ticket; con la decisión por defecto 4 se mantiene para madres ya registradas y cambia para las demás: el plan dirá cuál de los dos casos cubre esa prueba y la ajusta explícitamente.
  - Costo: queda `null` con marca «suscripción» (`timeline.ts:1301`); no se inventan precios.
- Impactos de sync, migración, Docker o despliegue: ninguno — cambia la lectura local de transcripts y las entradas nuevas del bloque `## Consumo de IA`; sin esquema, sin contenedores y sin despliegue.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Decisión del PO el 2026-10-09 por AskUserQuestion: «Aprobar el plan (Recomendado)»; registrada por persona porque la vía por autorización falla por el defecto del stateHash con archivos_citados.
- Alcance: `packages/server/src/claude.ts`, `packages/server/src/timeline.ts`, `packages/engine/src/append.ts` (una función de lectura nueva), `tests/claude.test.ts`, `tests/timeline.test.ts` y, si hace falta, `tests/helpers/claude.ts`. Exclusiones: lectores de opencode, codex y Hermes; vista Agentes (`agentes.ts`); tabla de precios; entradas ya registradas (append-only).
- Pasos ordenados:
  1. `packages/engine/src/append.ts`: exportar `sessionNumbersAnywhere(paths, sessionReference): string | null`, igual que `sessionNumbersOwner` (`append.ts:326`) pero sin excluir el ticket propio; sale del paquete por el `export * from "./append.js"` de `packages/engine/src/index.ts:79`. (C30)
  2. `packages/server/src/claude.ts`: extraer `acumuladoVacio()` y `sesionDesdeAcumulado(id, ruta, acumulado, subagentes)` desde `leerSesionesDeClaude` (`claude.ts:586-596` y `:620-666`) sin cambiar el resultado. Añadir a `SesionDeClaude` los campos opcionales `sesionMadre` (id de la madre) y `terminaEn` (marca del último evento); `leerTranscripcion` (`claude.ts:418-421`) guarda también la marca máxima en el acumulado, para la duración `terminaEn - startedAt`. (C1, C23)
  3. `packages/server/src/claude.ts` `leerSesionesDeClaude`, bucle de subagentes (`claude.ts:602-609`): leer cada `subagents/agent-<id>.jsonl` en un acumulado propio (`acumuladoVacio()`); calcular `atribucion` sobre ese acumulado, que solo cuenta lo que el subagente escribió en el registro (`leerLlamada`, `claude.ts:329-367`), porque su prompt no atribuye (`claude.ts:487`, `esSubagente`). Con exactamente un ticket trabajado y sin que la opción nueva `madreYaContada?: (idMadre) => boolean` marque a la madre, emitir una sesión aparte con id `<sesión>/agent-<id>`, `sesionMadre`, `compartida: false` y `tickets` igual a ese único ticket; con cero o con dos o más tickets, fundir su acumulado en el de la madre con la nueva `fundir(destino, origen)` (une `mensajes`, `llamadas`, `intervenciones`, `mensajesDelRegistro`, `resultadosConError` y `tickets`), como hoy. La atribución y los totales de la madre se calculan después, sin los subagentes separados. (C1, C5–C12)
  4. `packages/server/src/claude.ts` `sesionDesdeAcumulado`: los tokens de la sesión del subagente salen con la misma aritmética de `claude.ts:624-627`: `inputTokens` = `input_tokens` + `cache_creation_input_tokens` (5 + 50 = 55), `cacheReadTokens` = `cache_read_input_tokens` (500) y `outputTokens` = `output_tokens` (20); `model` es el de `modelos[0]`, el modelo del subagente que más produjo. (C2–C4, C20)
  5. `packages/server/src/claude.ts`, mismo bucle de subagentes: una transcripción ilegible se trata como hoy. Si `readFileSync` falla, el `try/catch` de `claude.ts:604-608` la salta; si sus líneas no son JSON, `leerTranscripcion` las ignora (`claude.ts:410-416`), su acumulado queda sin mensajes ni tickets, `atribucion` devuelve vacío y se funde en la madre sin aportar nada. La madre se devuelve igual, con `subagentes` contándola. (C14)
  6. `packages/server/src/claude.ts`: el prefiltro `contenido.includes(ticketId)` (`claude.ts:584`) pasa también si algún archivo de `archivosDeSubagentes(ruta)` contiene el id; con `ticketId`, el filtro de `claude.ts:616` se aplica a cada sesión emitida por separado: se devuelven las sesiones de subagente de ese ticket aunque la madre no lo trabaje, y una sesión de subagente de otro ticket no se devuelve. (C13, C28)
  7. `packages/server/src/timeline.ts` `sesionDeClaude` (`timeline.ts:451-475`): para la sesión de un subagente devuelve `source: "claude"`, `provider: "anthropic"`, `model` igual al del subagente y `costUsd: null`, sin `reparto` porque no es compartida; `SesionDeAgente` (`timeline.ts:87`) gana `sesionMadre?` y `duracionMs?`, que se copian. Con eso `guardarFotoEnTicket` arma `model` como `anthropic/<modelo del subagente>` (`timeline.ts:1357-1360`) y, por `costUsd === null`, omite `estimated_cost_usd` (`timeline.ts:1369-1371`). (C20, C21, C31)
  8. `packages/server/src/timeline.ts` `detalleDeTokensDeClaude` (`timeline.ts:1258-1270`): con `sesionMadre` añade «Subagente de la sesión <madre>.», la duración «Duración N min.» (redondeo de `duracionMs / 60000`) y conserva «Caché leída N tokens.». (C22–C24)
  9. `packages/server/src/timeline.ts`: `leerLineaDeTiempo` y `consultar` (`timeline.ts:362`, `:1052`) aceptan la opción `madreYaContada` y la pasan a `leerSesionesDeClaude`; `guardarFotoEnTicket` (`timeline.ts:1305`) la arma con `sessionNumbersAnywhere(paths, idMadre) !== null`. La entrada del subagente usa `source` `claude:<sesión>/agent-<id>` (la rama de `timeline.ts:1334-1337` usa `sesion.id`) y `session_reference` `<sesión>/agent-<id>`; sus números son `input_tokens` = `inputTokens` (55), `output_tokens` = `outputTokens` (20) y `total_tokens` = entrada + salida + razonamiento 0 (75), por `timeline.ts:1361-1365`. Dos subagentes del mismo ticket dejan dos entradas porque cada uno es una sesión. `sesionesRegistradas` (`timeline.ts:1438`) deduplica por esa referencia en la segunda foto. La madre compartida sigue en la rama sin números (`timeline.ts:1394-1410`) y el total de su nota ya excluye a los separados porque su acumulado no los incluye. (C15–C19, C25–C27, C29, C30)
  10. `tests/claude.test.ts`: nuevo `describe("los subagentes con ticket propio")` con transcripts sintéticos escritos por `escribirSesionDeClaude` (`tests/helpers/claude.ts`) en el HOME temporal `home` que crea `mkdtempSync` en `beforeEach` (`tests/claude.test.ts:45`); cada llamada pasa `{ home }` y ninguna usa `homedir()`. Un caso por criterio, incluido el subagente con líneas `"esto no es json"`. La prueba `:632` se conserva sin cambios porque su subagente no escribe en el registro. (C1–C14, C32, C33)
  11. `tests/timeline.test.ts`: nuevo `describe` dentro de «guardar el consumo en el ticket» (`tests/timeline.test.ts:916`) con el HOME temporal `lab` (`mkdtempSync`, `tests/timeline.test.ts:72`), dos tickets en el registro, una madre compartida y subagentes sintéticos; lee el bloque `## Consumo de IA` y comprueba `source`, `session_reference`, números, `model`, ausencia de `estimated_cost_usd`, `notes`, la segunda foto, la foto de TICKET_B, la madre ya registrada y `leerLineaDeTiempo` con `ticketId`. (C15–C31, C32, C33)
  12. Verificación: `npx tsc --build tsconfig.build.json`, `npx vitest run tests/claude.test.ts tests/timeline.test.ts` y la comprobación manual C35 con un script de solo lectura sobre la sesión real. (C34, C35)
- Impactos declarados: ninguno — sin sincronización, migración ni contenedores.
- Rollback (obligatorio): revertir el commit del ticket en la rama; el lector vuelve a fundir los subagentes en la madre. Las entradas de consumo ya escritas con referencia `<sesión>/agent-<id>` quedan (append-only) y siguen siendo correctas; una foto posterior con el código revertido registraría la madre sin números si es compartida, sin duplicar.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. `leerSesionesDeClaude` devuelve, para un subagente sintético que escribió solo en el registro de TICKET_A, una sesión propia con id `<sesión>/agent-<id>`.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C2. Esa sesión del subagente trae `inputTokens` 55 (entrada 5 más creación de caché 50).
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C3. Esa sesión del subagente trae `cacheReadTokens` 500.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C4. Esa sesión del subagente trae `outputTokens` 20.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C5. Esa sesión del subagente tiene `compartida` en `false`.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C6. Esa sesión del subagente tiene TICKET_A como único ticket.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C7. La sesión madre deja de sumar los tokens del subagente separado.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C8. La sesión madre deja de contar a TICKET_A como trabajado cuando solo lo escribió el subagente separado.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C9. Un subagente que escribió en el registro de dos tickets sigue sumado dentro de la sesión madre.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C10. Un subagente sin escrituras en el registro sigue sumado dentro de la sesión madre.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C11. El primer mensaje de un subagente que nombra TICKET_B sin escribir en su registro no lo atribuye a TICKET_B.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C12. Dos subagentes que escribieron en el registro de TICKET_A producen dos sesiones propias de TICKET_A.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C13. Con `ticketId` TICKET_A se encuentra el subagente aunque la transcripción madre no nombre TICKET_A.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C14. Un subagente con transcripción ilegible no tumba la sesión madre.
      <!-- test: npx vitest run tests/claude.test.ts -->
- [x] C15. `guardarFotoEnTicket` escribe en TICKET_A una entrada con `source` `claude:<sesión>/agent-<id>`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C16. Esa entrada lleva `session_reference` `<sesión>/agent-<id>`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C17. Esa entrada lleva `input_tokens` 55.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C18. Esa entrada lleva `output_tokens` 20.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C19. Esa entrada lleva `total_tokens` 75.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C20. Esa entrada lleva `model` `anthropic/<modelo del subagente>`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C21. Esa entrada no lleva `estimated_cost_usd`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C22. Las `notes` de esa entrada nombran la sesión madre.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C23. Las `notes` de esa entrada dicen la duración del subagente en minutos.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C24. Las `notes` de esa entrada dicen la caché leída del subagente.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C25. La sesión madre compartida queda registrada en TICKET_A sin `input_tokens`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C26. Las `notes` de la madre compartida informan un total de tokens que excluye a los subagentes separados.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C27. Guardar la foto de TICKET_A dos veces deja una sola entrada por subagente.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C28. La foto de TICKET_B no registra en TICKET_B el subagente de TICKET_A.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C29. Dos subagentes de TICKET_A dejan dos entradas con números en TICKET_A.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C30. Una madre ya registrada con números en un ticket no separa a sus subagentes en una foto posterior.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C31. La línea de tiempo de un ticket (`leerLineaDeTiempo` con `ticketId`) muestra la sesión del subagente con `source` `claude`.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] C32. Las pruebas nuevas escriben sus transcripts sintéticos en un HOME temporal creado con `mkdtempSync`.
      <!-- verify: manual -->
- [x] C33. Las pruebas nuevas no leen `~/.claude` del HOME real.
      <!-- verify: manual -->
- [x] C34. `npx tsc --build tsconfig.build.json` termina con código 0.
      <!-- test: npx tsc --build tsconfig.build.json -->
- [x] C35. Con la sesión real `4f9b1b12-ced4-4132-9151-c3a025ede085`, la línea de tiempo de `FEATURE-WEB-MUNDO-PASTELERIA-20261008` muestra dos sesiones de subagente propias de ese ticket.
      <!-- verify: manual -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/append.ts",
      "packages/server/src/claude.ts",
      "packages/server/src/timeline.ts",
      "tests/claude.test.ts",
      "tests/timeline.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/engine/src/append.ts`: `sessionNumbersAnywhere(paths, sessionReference)`, la misma búsqueda de `sessionNumbersOwner` sin excluir ningún ticket (ambas comparten `sessionNumbersFound`).
- `packages/server/src/claude.ts`: `acumuladoVacio`, `fundir` y `sesionDesdeAcumulado` extraídos de `leerSesionesDeClaude`; `SesionDeClaude` gana `sesionMadre` y `terminaEn`; cada subagente se lee en su acumulado y, si escribió en el registro de exactamente un ticket y la madre no está ya contada (`madreYaContada`), sale como sesión `<sesión>/agent-<id>`; si no, se funde en la madre como antes. El prefiltro por `ticketId` mira también los archivos de subagentes.
- `packages/server/src/timeline.ts`: `SesionDeAgente` gana `sesionMadre` y `duracionMs`; `leerLineaDeTiempo` y `consultar` pasan `madreYaContada`; `guardarFotoEnTicket` la arma con `sessionNumbersAnywhere`; la nota del subagente dice la sesión madre, la duración y la caché leída, y la de la madre compartida aclara que su total no incluye a los subagentes con ticket propio.
- `tests/claude.test.ts` y `tests/timeline.test.ts`: pruebas nuevas con transcripts sintéticos en un HOME temporal.

## Pruebas

Directorio: raíz del repositorio (el worktree de la rama `valmen/ticket-consumo-subagentes-por-ticket`). Sin requisitos de ambiente: los transcripts son sintéticos y viven en un HOME temporal (`mkdtempSync`); ninguna prueba lee `~/.claude` real. Ninguna prueba depende de la hora (la ventana de 60 días mira el `mtime` del archivo recién escrito).

1. `npx vitest run tests/claude.test.ts tests/timeline.test.ts` — esperado: 78 pruebas pasan (C1–C31).
2. `npx vitest run tests/consumo-fiable.test.ts tests/linea-de-tiempo-interfaz.test.ts tests/actividad-agentes.test.ts tests/api-rutas.test.ts tests/mcp-server.test.ts tests/dogfooding-registro.test.ts` — esperado: 165 pruebas pasan (regresión).
3. `npx tsc --build tsconfig.build.json` — esperado: código 0 (C34).

Resultado en esta rama: 1, 2 y 3 en verde.

Validaciones manuales:
- C32 y C33: los bloques nuevos de ambos archivos crean su HOME con `mkdtempSync` y pasan `home` al lector; ninguno llama al lector sin `home`.
- C35: lectura de solo lectura (sin escribir en ningún ticket) sobre la sesión real `4f9b1b12-ced4-4132-9151-c3a025ede085` con `leerSesionesDeClaude(<raíz>)`: 33 subagentes quedaron atribuidos a 17 tickets, y `FEATURE-WEB-MUNDO-PASTELERIA-20261008` muestra dos sesiones de subagente propias. La cifra crece con la sesión viva.

- Resultado del PO: Cerrarlos (Recomendado). Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: Pruebas del ticket y suite completa en verde; qa-mechanical approve

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-09",
    "build_reference": "commit:00b0558788fcfdaa36730e24ac6d7ae7c90e092d",
    "environment": "macOS, Node 24, main tras integrar; suite completa 231 archivos y 3927 pruebas en verde",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-09",
    "kind": "automated-test",
    "description": "Pruebas del ticket y suite completa en verde; qa-mechanical approve",
    "reference": "worktree:sha256:2f91138accd25c0e683e11b0e34ff41f28dd4807971c345c282e09dc4620b3a3",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "Cerrarlos (Recomendado)"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-09",
    "technical_summary": "Cada subagente de una corrida orquestada se atribuye al ticket en cuyo registro escribió y su consumo (tokens, sin costo por falta de tabla de precios) se guarda en ese ticket; la sesión madre sigue compartida y sin números.",
    "functional_summary": "Cada ticket de una corrida orquestada muestra lo que costó en tokens, en vez de quedar sin números.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": "anthropic/claude-sonnet-5-5",
    "reasoning_effort": null,
    "notes": "Subagente de implementación de la corrida orquestada de la sesión 4f9b1b12-ced4-4132-9151-c3a025ede085. No expone los números de su propia sesión; al cerrar, la foto de consumo registrará el subagente con sus tokens medidos.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion-orquestada",
    "confidence": "low",
    "id": "CONSUMO-001"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-09",
    "at": "2026-10-09T14:34:09.772Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T14:39:00.067Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T14:41:03.127Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T14:51:56.159Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009-plan-2, canal cli, decidida 2026-10-09T14:51:56.150Z): PO por AskUserQuestion: \"Aprobar el plan (Recomendado)\" (REVIEW con 15 criterios en banda por ruido de jev; cascade falló por salida estructurada de haiku)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T15:02:09.774Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009-plan-4, canal cli, decidida 2026-10-09T15:02:09.768Z): PO por AskUserQuestion: \"Aprobar el plan (Recomendado)\" (solo C35 en banda, 0.83, comprobación manual por diseño)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T15:03:13.894Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar el plan (Recomendado)\",\"planHash\":\"sha256:a206bd40ac8cc4a5cbcd90873fe2871450e9eca93144809bd0a75c07cf479043\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T15:03:14.414Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:a206bd40ac8cc4a5cbcd90873fe2871450e9eca93144809bd0a75c07cf479043."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T15:03:14.414Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T15:03:46.351Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T15:10:27.445Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-09",
    "at": "2026-10-09T15:15:20.308Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:14.765Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:15.004Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:15.154Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:15.301Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:15.443Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:15.652Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:15.881Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:16.019Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:16.162Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:16.294Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:16.434Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:16.575Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-10-09",
    "at": "2026-10-09T16:59:16.713Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
