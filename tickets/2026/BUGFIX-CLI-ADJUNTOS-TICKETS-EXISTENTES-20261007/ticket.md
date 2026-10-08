---
schema_version: 2
id: BUGFIX-CLI-ADJUNTOS-TICKETS-EXISTENTES-20261007
title: Los adjuntos de diseño anexados después de materializar no llegan a los tickets
type: BUGFIX
module: CLI
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-07
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-CLI-ADJUNTOS-TICKETS-EXISTENTES-20261007

## Solicitud original

Pedido del PO (2026-10-07, desde la sesión de SaiOpenCloud): «quiero corregir ese error tambien en el harness para que a la proxima no toque hacer esto». Contexto: la feature superadmin-ampliacion de SaiOpenCloud se materializó en 44 tickets y después se anexaron sus 15 pantallas con valmen feature asset add. Ningún ticket quedó con la sección Referencias de diseño, que es el mecanismo de FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006 para que las pantallas se construyan contra el diseño aprobado. En la feature anterior (precarga-catalogos) ese mismo hueco hizo que las pantallas salieran distintas al diseño. Fallas observadas: (1) La sección Referencias de diseño solo se escribe al crear el ticket (packages/engine/src/materialize.ts:276-305), y materialize no toca un ticket que ya existe (materialize.ts:20, :446). feature asset add y anexar_adjunto_a_feature no actualizan los tickets de la feature, así que un adjunto tardío nunca llega a ellos. (2) materialize solo avisa cuando la feature cita un enlace externo de diseño sin copia local: creó los 44 tickets con tres avisos y siguió. (3) feature asset add acepta como prototipo un .dc.html, que es la fuente del lienzo de diseño (Artifact tipo Design): depende de ./support.js, x-dc, sc-for y {{huecos}}, así que no se puede abrir en el navegador para comparar, a diferencia del HTML autónomo de precarga-catalogos. (4) La cita se resuelve por archivo de spec y no por requisito (assetsForRequirements, packages/engine/src/feature-assets.ts:309-326): un ticket que cubre un requisito de un dominio recibe todos los adjuntos citados en ese spec.md. Comportamiento esperado: un adjunto anexado después de materializar llega a la sección Referencias de diseño de los tickets de la feature que lo citan, al menos mientras no hayan empezado la implementación, y de forma determinista, sin que un agente edite el ticket a mano. Materializar con enlaces externos de diseño sin copia local no pasa en silencio. Un .dc.html se detecta al anexarlo y se pide (o se genera) su versión autónoma. Cómo se resuelve cada punto (actualizar al anexar, comando de refresco, bloqueo o bandera explícita) se decide en el análisis y el plan.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el recorrido de los adjuntos de diseño de una feature hasta sus tickets en el motor (`packages/engine/src/feature-assets.ts`, `packages/engine/src/materialize.ts`) y sus tres entradas (CLI `valmen feature asset add|list` y `valmen feature materialize`, herramientas MCP `anexar_adjunto_a_feature` y `materializar_feature`, endpoint `POST /api/features/:slug/materialize`). Cuatro fallas: (P1) un adjunto anexado después de materializar no llega a los tickets ya escritos; (P2) materializar con enlaces de diseño externos sin copia local solo avisa y sigue; (P3) un `.dc.html` (fuente del lienzo de diseño, no autónoma) se acepta como prototipo; (P4) la cita se resuelve por archivo de spec y no por requisito. Fuera de alcance: generar la versión autónoma de un `.dc.html` (el motor no toca la red ni renderiza) y reescribir tickets ya en implementación.
- Usuario o rol afectado: el PO que anexa el diseño aprobado de una feature y los agentes que implementan y validan sus pantallas (skills `validacion-ui` y `revision-final` comparan contra `### Referencias de diseño`).
- Comportamiento actual: `valmen feature asset add` copia el archivo y lo anota en el manifiesto, y nada más; los tickets ya materializados no reciben la sección. `materialize` crea todos los tickets aunque la feature cite enlaces externos sin copia (solo los lista en «Avisos»). Un `.dc.html` queda como `kind: prototipo`. Un ticket recibe todos los adjuntos citados en cualquier parte del `spec.md` de su dominio. Caso real: SaiOpenCloud `superadmin-ampliacion`, 44 tickets materializados y 15 pantallas anexadas después, ningún ticket con Referencias de diseño.
- Comportamiento esperado: anexar (o un refresco explícito) actualiza de forma determinista la sección `### Referencias de diseño` de los tickets de la feature que todavía no empezaron la implementación, con un evento en el ticket, e informa los que no se tocaron y por qué; materializar con enlaces externos sin copia se detiene salvo una bandera explícita; un `.dc.html` se rechaza al anexarlo pidiendo la exportación autónoma; la cita se resuelve primero por el cuerpo del requisito.

## Diagnóstico

- Memoria consultada: `buscar_memoria` («adjuntos de diseño feature asset add materializar tickets existentes») no devuelve antecedentes del síntoma (solo AP-001…AP-006, de compuertas). El origen es FEATURE-CLI-ADJUNTOS-FEATURE-Y-CORRIDA-AUTONOMA-20261006, que introdujo los adjuntos.
- Causa comprobada (con `ruta:línea`):
  - P1: la sección solo se arma dentro de la solicitud del alta: `referenciasDe` (`packages/engine/src/materialize.ts:317-340`) se llama únicamente desde el bucle de creación (`packages/engine/src/materialize.ts:484-507`, argumento en :497), que recorre `faltantes` = tickets sin `ticket.md` (`packages/engine/src/materialize.ts:432`); los existentes van a `skipped` (`packages/engine/src/materialize.ts:481`) por la regla «un ticket que ya existe no se toca» (`packages/engine/src/materialize.ts:20-21`). `attachFeatureAsset` (`packages/engine/src/feature-assets.ts:166-252`) solo escribe la copia y el manifiesto (:231, :247) y no conoce el registro de tickets. Las citas del pedido (materialize.ts:276-305 y :446) están corridas respecto del código actual; las vigentes son las de esta línea.
  - P2: `externalLinkWarnings` (`packages/engine/src/feature-assets.ts:279-299`) declara en su contrato que «el aviso no bloquea» (:276-277); `materializeFeature` lo devuelve como `warnings` después de escribir (`packages/engine/src/materialize.ts:517`) y `renderMaterialization` lo imprime como «Avisos» (`packages/engine/src/materialize.ts:562-564`). La prueba `tests/feature-assets.test.ts:195` fija ese comportamiento («materialize lo informa sin bloquear»).
  - P3: el tipo se decide solo por extensión: `.html` → `prototipo` (`packages/engine/src/feature-assets.ts:66`, aplicado en :242); no se mira ni el nombre `*.dc.html` ni el contenido (`./support.js`, `x-dc`, `sc-for`, `{{…}}`).
  - P4: `assetsForRequirements` (`packages/engine/src/feature-assets.ts:309-326`) lee el archivo completo de cada fuente (`r.source`, el `spec.md` del dominio, :315-321) y filtra por `includes(a.path)` (:322); el cuerpo de cada requisito ya está disponible como `LocatedRequirement.body` (`packages/engine/src/spec.ts:123-136`) y no se usa.
- Restricción comprobada: `### Referencias de diseño` vive dentro de `## Solicitud original` (la solicitud se pasa a `createTicket` en `packages/engine/src/materialize.ts:492-499`; la plantilla pone `### Supuestos y decisiones pendientes` a continuación, `packages/core/src/template.ts:76-80`). `validateRequest` documenta que la solicitud «se conserva literalmente» (`packages/core/src/validators.ts:78-83`). El parser tolera subencabezados dentro de la solicitud (`packages/core/src/parser.ts:130-183`), así que reemplazar solo el bloque generado no rompe las 15 secciones canónicas (`packages/core/src/contract.ts:59-75`). La escritura segura existe: `finalizeMutation` valida el registro, anexa el evento, revalida y escribe atómico (`packages/engine/src/mutate.ts:195-235`).
- Hipótesis pendientes: (H1) que ningún ticket de SaiOpenCloud tenga texto escrito a mano dentro de `### Referencias de diseño`; el reemplazo solo toca desde ese encabezado hasta el siguiente `### ` o `## Descripción funcional`, y se verifica con una prueba de que `### Supuestos y decisiones pendientes` queda intacto. (H2) que el corte de «no empezó la implementación» sea `intake`, `analyzed`, `planned` y `blocked`; si `approved` entra o no es decisión del PO (un plan aprobado contra otras referencias cambia materialmente).
- Consumidores afectados: CLI `featureAsset` (`packages/cli/src/features.ts:215-272`) y `materializeCommand` (`packages/cli/src/commands.ts:1799-1811`), ayuda `packages/cli/src/main.ts:381-415`; MCP `materializar_feature` (`packages/mcp/src/tools.ts:3111-3119`) y `anexar_adjunto_a_feature` (`packages/mcp/src/tools.ts:1920`, `:3159-3172`); servidor `POST /api/features/:slug/materialize` (`packages/server/src/server.ts:734-763`); skills que leen la sección: `.valmen/skills/feature/SKILL.md:45`, `.valmen/skills/validacion-ui/SKILL.md:41`, `.valmen/skills/revision-final/SKILL.md:34`; pruebas `tests/feature-assets.test.ts`, `tests/materializar-feature.test.ts` (:130 «sin adjuntos … ni avisos»), `tests/plantilla-y-materializacion.test.ts`.
- Archivos y flujo investigados: anexar → `attachFeatureAsset` → `assets/manifest.json`; materializar → `readDecomposition` (`packages/engine/src/materialize.ts:84-146`) → `faltantes` → `createTicket(request: solicitudDe(..., referenciasDe(...)))` → `escribirCriterios`; listar → `listFeatureAssets` + `externalLinkWarnings`.
- Riesgos y compatibilidad: (a) editar la solicitud de un ticket existente choca con «se conserva literalmente»: se limita al bloque generado por el motor y queda un evento `design-references-updated` con los adjuntos; (b) bloquear materialize por enlaces cambia el comportamiento de CLI, MCP y servidor para features con enlaces bibliográficos: se ofrece bandera explícita y `--dry-run` sigue informando sin bloquear; (c) rechazar `.dc.html` puede frenar al PO que solo tiene la fuente del lienzo: el mensaje dice cómo exportar la versión autónoma; (d) la cita por requisito reduce adjuntos en tickets que hoy reciben todos los del dominio: se conserva la caída a archivo y a «todos» cuando no hay cita a nivel de requisito.
- Impactos de sync, migración, Docker o despliegue: ninguno. Cambia el motor y la CLI del harness; no hay datos sincronizados, migraciones, contenedores ni despliegue. Los tickets de SaiOpenCloud se actualizan después, a pedido, con el comando de refresco.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Alcance y exclusiones: motor (`packages/engine/src/feature-assets.ts`, `packages/engine/src/materialize.ts`), CLI, MCP y servidor como consumidores. No se tocan tickets en `approved` o posteriores, no se edita el contrato de 15 secciones ni los bloques append-only, y no se refrescan los tickets de SaiOpenCloud dentro de este ticket (se hace después, a pedido, con el comando nuevo).
- Pasos ordenados:
  1. Cita por requisito (P4): en `packages/engine/src/feature-assets.ts`, `assetsForRequirements` recibe los requisitos cubiertos (`LocatedRequirement` con `body`, de `packages/engine/src/spec.ts`) y resuelve en tres niveles: citados en enunciado o cuerpo del requisito → citados en el `spec.md` del dominio → todos; `referenciasDe` en `packages/engine/src/materialize.ts` le pasa los requisitos y el texto de la sección dice qué nivel aplicó. (C12, C13)
  2. Rechazo del lienzo (P3): en `attachFeatureAsset` (`packages/engine/src/feature-assets.ts`), antes de copiar, una función `esFuenteDeLienzo` rechaza con `EXIT_SCHEMA` un nombre terminado en `.dc.html` o un `.html` cuyo contenido carga `support.js` o usa `<x-dc`/`sc-for`, sin escribir copia ni manifiesto; el mensaje pide exportar la versión autónoma del diseño. (C10, C11)
  3. Refresco determinista (P1): nueva función exportada `refreshDesignReferences(paths, slug, { write })` en `packages/engine/src/materialize.ts` que, para cada ticket del grafo (`readDecomposition`) que existe y está en `intake`, `analyzed`, `planned` o `blocked`, recalcula `referenciasDe` y reemplaza dentro de `## Solicitud original` solo el bloque desde `### Referencias de diseño` hasta el siguiente `### ` o `## Descripción funcional` (o lo inserta antes de `### Supuestos y decisiones pendientes`); escribe con `finalizeMutation` de `packages/engine/src/mutate.ts` y el evento `design-references-updated` con las rutas; sin diferencia no escribe; devuelve actualizados, sin cambios y omitidos con su estado. (C1, C2, C3, C4, C5)
  4. Disparo al anexar: `featureAsset` en `packages/cli/src/features.ts` (rama `add`) y el caso `anexar_adjunto_a_feature` en `packages/mcp/src/tools.ts` llaman a `refreshDesignReferences` tras un anexo nuevo e imprimen el informe; se agrega `valmen feature asset refresh <slug> [--dry-run]` en `packages/cli/src/features.ts` y su línea de ayuda en `packages/cli/src/main.ts`. (C1, C6, C14)
  5. Enlaces sin copia (P2): `materializeFeature` en `packages/engine/src/materialize.ts` calcula `externalLinkWarnings` antes de escribir y falla con `EXIT_INVARIANT` sin crear tickets si hay avisos, salvo la opción `allowExternalLinks`; `--dry-run` los devuelve sin fallar. La opción se expone como `--allow-external-links` en `materializeCommand` (`packages/cli/src/commands.ts`), `permitirEnlacesExternos` en `materializar_feature` (`packages/mcp/src/tools.ts`) y `allowExternalLinks` en `packages/server/src/server.ts`. Materializar también refresca los tickets existentes elegibles (`skipped`) con el paso 3. (C7, C8, C9)
  6. Pruebas: casos nuevos en `tests/feature-assets.test.ts` (con los nombres de los criterios) y en `tests/delegation-mcp.test.ts` (MCP); se ajusta `tests/feature-assets.test.ts:195` («materialize lo informa sin bloquear») a la nueva regla. Se corren `npx vitest run tests/feature-assets.test.ts tests/materializar-feature.test.ts tests/plantilla-y-materializacion.test.ts tests/delegation-mcp.test.ts` y `npx tsc --noEmit -p tsconfig.json`. (C1–C15)
  7. Documentación: `.valmen/skills/feature/SKILL.md` (línea 45) describe el refresco al anexar, el comando `asset refresh`, la bandera de enlaces y el rechazo del `.dc.html`; se regenera la proyección con `valmen sync` y se comprueba con `valmen sync --check`. (C16)
  8. Entrega: contrato en `## Pruebas` (comandos del paso 6, directorio `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-adjuntos-tickets-existentes`, resultado esperado «todas las pruebas pasan, tsc sin errores», validación manual de C17 sobre una copia de SaiOpenCloud), compuerta `qa-mechanical` con `valmen gate qa-mechanical --id BUGFIX-CLI-ADJUNTOS-TICKETS-EXISTENTES-20261007 --evaluator command`, `valmen secrets`, consumo de IA y paso a `awaiting_user_tests`. (C17)
- Impactos declarados: ninguno de sincronización, migración ni contenedores; el ticket declara `sync_impact`, `migration_impact` y `docker_impact` en `false`. Cambio de comportamiento visible para quien opera el harness: `materialize` ahora se detiene ante enlaces externos sin copia (D2).
- Rollback (obligatorio): revertir el commit del ticket en la rama (`git revert <hash>`) devuelve el motor, la CLI, el MCP y el servidor al comportamiento anterior. Los tickets ya refrescados conservan su bloque `### Referencias de diseño` y su evento `design-references-updated` (append-only, válidos con el contrato actual), así que no hay datos que deshacer; un bloque refrescado indebido se corrige con un nuevo refresco, nunca editando eventos.

## Criterios de aceptación

- [x] C1: Anexar un adjunto después de materializar escribe `### Referencias de diseño` en un ticket existente en `intake`.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "anexar después de materializar actualiza las referencias" -->
- [x] C2: El refresco deja en el ticket un evento `design-references-updated` con las rutas de los adjuntos.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "deja un evento design-references-updated" -->
- [x] C3: El refresco no modifica un ticket en `in_progress` y lo informa como omitido con su estado.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "no toca un ticket que empezó la implementación" -->
- [x] C4: El refresco conserva intacto el resto de la solicitud original, incluida `### Supuestos y decisiones pendientes`.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "conserva el resto de la solicitud" -->
- [x] C5: Refrescar sin cambios en los adjuntos no reescribe el ticket ni agrega eventos.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "refrescar sin cambios no escribe" -->
- [x] C6: `valmen feature asset refresh <slug> --dry-run` informa los tickets que actualizaría sin escribirlos.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "el refresco en seco informa sin escribir" -->
- [x] C7: Materializar una feature con un enlace externo sin copia local falla sin crear ningún ticket.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "materialize se detiene ante un enlace externo sin copia" -->
- [x] C8: Con `allowExternalLinks` materializar crea los tickets e informa los avisos.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "con permiso explícito materialize crea y avisa" -->
- [x] C9: Materializar en seco con enlaces sin copia devuelve los avisos sin fallar.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "en seco informa los enlaces sin fallar" -->
- [x] C10: Anexar un archivo `.dc.html` se rechaza sin escribir copia ni manifiesto.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "rechaza un .dc.html" -->
- [x] C11: Anexar un `.html` que carga `support.js` o usa `x-dc` se rechaza con el pedido de la versión autónoma.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "rechaza un html que depende del lienzo" -->
- [x] C12: Un ticket recibe solo los adjuntos citados en el cuerpo de los requisitos que cubre, aunque el mismo `spec.md` cite otros.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "la cita se resuelve por requisito" -->
- [x] C13: Si ningún requisito del ticket cita un adjunto, el ticket recibe los citados en el `spec.md` de su dominio.
  <!-- test: npx vitest run tests/feature-assets.test.ts -t "sin cita en el requisito usa la del archivo" -->
- [x] C14: La herramienta MCP `anexar_adjunto_a_feature` actualiza las referencias de los tickets existentes elegibles.
  <!-- test: npx vitest run tests/delegation-mcp.test.ts -t "anexar por MCP actualiza las referencias" -->
- [x] C15: El proyecto compila sin errores de tipos.
  <!-- test: npx tsc --noEmit -p tsconfig.json -->
- [x] C16: La skill `feature` documenta el refresco, la bandera de enlaces y el rechazo del `.dc.html`.
  <!-- verify: manual -->
- [ ] C17: Sobre una copia de la feature `superadmin-ampliacion` de SaiOpenCloud, `valmen feature asset refresh` deja `### Referencias de diseño` en sus tickets que no empezaron la implementación.
  <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/feature-assets.ts`: `esFuenteDeLienzo` y rechazo en `attachFeatureAsset` (P3); `assetsForRequirements` resuelve la cita en tres niveles (requisito, archivo, todos) (P4).
- `packages/engine/src/materialize.ts`: `refreshDesignReferences`, `refreshAfterAttach` y `renderDesignReferencesRefresh` (P1); `materializeFeature` se detiene ante enlaces externos sin copia salvo `allowExternalLinks` y refresca los tickets existentes elegibles (P2).
- Consumidores: `packages/cli/src/features.ts` (`asset add` refresca, `asset refresh [--dry-run]`), `packages/cli/src/commands.ts` y `main.ts` (`--allow-external-links`, ayuda), `packages/mcp/src/tools.ts` (`permitirEnlacesExternos`, refresco al anexar), `packages/server/src/server.ts` (`allowExternalLinks`).
- Documentación: `skills/feature/SKILL.md` y su copia en `.valmen/skills/feature/SKILL.md`; `valmen sync` corrido desde el worktree usa el paquete del checkout principal y no ve el cambio hasta integrar.
- Pruebas: `tests/feature-assets.test.ts` (nuevas y ajuste de «materialize lo informa sin bloquear») y `tests/delegation-mcp.test.ts`.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness/.claude/worktrees/ticket-adjuntos-tickets-existentes`.
- Comando: `npx vitest run tests/feature-assets.test.ts tests/materializar-feature.test.ts tests/plantilla-y-materializacion.test.ts tests/delegation-mcp.test.ts`. Resultado: 55 pruebas pasan.
- Comando: `npx tsc --noEmit -p tsconfig.json`. Resultado: sin errores.
- Validación manual (C17, sin verificar): sobre una copia de SaiOpenCloud `superadmin-ampliacion`, correr `valmen feature asset refresh superadmin-ampliacion --dry-run` y luego sin `--dry-run`, y comprobar que los tickets que no empezaron la implementación tienen `### Referencias de diseño` y el evento `design-references-updated`.
- Ambiente: Node 24, `npm ci` hecho; `npx tsc --build tsconfig.build.json` antes si el CLI no ve los exports nuevos.

## QA

```json
[]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-08",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": null,
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual: subagente de implementación claude-sonnet-5-5, sin números de sesión expuestos",
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
    "date": "2026-10-07",
    "at": "2026-10-07T19:58:10.277Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-08",
    "at": "2026-10-08T21:14:00.096Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-08",
    "at": "2026-10-08T21:15:28.497Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:33.403Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"cli\",\"quote\":\"La A (aprueba los 3 planes de bugfix con las recomendaciones)\",\"planHash\":\"sha256:71733a7080017c5ed26087f843914deb0a578c64488aa9eb6f8a804e5d3b34c2\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:33.834Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente cli), plan sha256:71733a7080017c5ed26087f843914deb0a578c64488aa9eb6f8a804e5d3b34c2."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-08",
    "at": "2026-10-08T21:20:33.834Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-08",
    "at": "2026-10-08T21:23:51.877Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-08",
    "at": "2026-10-08T21:29:33.291Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-08",
    "at": "2026-10-08T21:29:37.351Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
