---
schema_version: 2
id: BUGFIX-CLI-CANAL-DECISION-20261005
title: La decisión de una compuerta tomada por el CLI queda registrada con el canal mission-control
type: BUGFIX
module: CLI
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-CLI-CANAL-DECISION-20261005

## Solicitud original

Solicitud del PO el 2026-10-05, tras cerrar BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004: «sigamos tu recomendacion pero no podemos olvidar la pantalla» (la recomendación incluía abrir este ticket aparte). Hallazgo de ese ticket, comprobado de punta a punta el 2026-10-05: `valmen gate-decide --id <ID> --receipt <recibo> --decision approve --actor <nombre> --reason <frase>` llama a `recordHumanDecision` sin pasar `channel` (`packages/cli/src/main.ts`, alrededor de la línea 777), y esa función usa por defecto `mission-control` (`packages/server/src/gates.ts:630`). Resultado: una decisión tomada por el CLI queda en el recibo y en el evento `gate-approved` del ticket con «canal mission-control», que es falso, y justo ahora que el ticket guarda quién firmó y por qué canal, un informe que lea solo el ticket atribuye al canal equivocado la firma. Mission Control y el enlace de Telegram sí identifican su canal (`server.ts:1347` acepta `channel`; `hermes.ts:622` pasa `CANAL_REMOTO`). Aviso de coordinación: al registrar esto, `packages/cli/src/main.ts` tenía cambios sin commitear de otra sesión; quien lo tome debe esperar a que ese archivo esté limpio o coordinar, y no mezclar ese trabajo en su commit.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- ¿Qué valor identifica el canal del CLI en `humanDecision.channel`? Hoy existen `mission-control` (el defecto de `recordHumanDecision`, `packages/server/src/gates.ts:630`) y `hermes-celular` (`CANAL_REMOTO`, `packages/cli/src/hermes.ts:538`); para el CLI no hay ninguno. Recomendación del que abrió el ticket: `cli`. Hasta que el PO lo confirme, el análisis no planifica sobre otro valor.
- ¿Las decisiones ya registradas con «canal mission-control» que en realidad tomó el CLI se corrigen? Los recibos son append-only y no se reescriben, y el CLI no deja marca para distinguirlas de las de Mission Control. Recomendación: no se corrigen; se deja dicho en la entrega desde qué fecha el canal es fiable.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
- Causa raíz o hipótesis:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1.
  2.
- Rollback:

## Criterios de aceptación

<!-- Una afirmación verificable por criterio. Una frase con «y» son dos criterios:
     cada uno se despliega como una proposición propia, y una que agrupa varias
     afirmaciones cae en banda de revisión aunque el plan la cubra entera. -->
- [ ]

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

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
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-05",
    "at": "2026-10-06T03:08:46.802Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
