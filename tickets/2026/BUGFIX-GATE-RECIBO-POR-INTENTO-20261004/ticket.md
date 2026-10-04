---
schema_version: 2
id: BUGFIX-GATE-RECIBO-POR-INTENTO-20261004
title: Identificar cada recibo por ticket e intento, no por fecha y compuerta
type: BUGFIX
module: GATE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-04
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-RECIBO-POR-INTENTO-20261004

## Solicitud original

Hallazgo de la revisión del 2026-10-04, orden del PO ese día: «si este toca arreglarlo si creermos el bugfix». El id de un recibo se arma como GR-<fecha UTC>-<compuerta> (packages/gate/src/receipt.ts), sin ticket ni número de intento: en .valmen/receipts/ hay 373 líneas con 26 ids distintos y 24 ids compartidos por varios tickets (GR-20260929-analysis lo comparten 11; GR-20260927-plan, 7). vigentes() en packages/engine/src/usage.ts y currentReceipts() en packages/engine/src/receipts.ts colapsan por ese id, así que el reporte de consumo del 2 al 4 de octubre cuenta 9 evaluaciones en 4 tickets cuando esos archivos tienen 193 líneas en 36, los reintentos del mismo día del mismo gate se pisan entre sí y la calibración que serviría para promover un gate híbrido a automático se calcula sobre recibos cruzados. Además la decisión humana no cambia actor, que queda en model, así que un gate escalado y aprobado por el PO sigue contando como decisión del modelo.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que el identificador de un recibo nombre la corrida que lo produjo —ticket, compuerta e intento— y no el día, y que los colapsadores (`currentReceipts`, `vigentes`) y el informe de consumo dejen de mezclar corridas y tickets distintos.
- Usuario o rol afectado: quien lee el consumo y la calibración —el PO y quien decide promover un gate híbrido— y quien registra una decisión humana con `gate-decide --receipt`.
- Comportamiento actual: `packages/engine/src/gate.ts:502` arma el id como `GR-<YYYYMMDD UTC>-<gateId>` cuando no se le pasa uno; en el registro hay 373 líneas con 26 ids distintos y 24 de esos ids los comparten varios tickets (`GR-20260929-analysis`, 11 tickets). `currentReceipts` (`packages/engine/src/receipts.ts:56`) y `vigentes` (`packages/engine/src/usage.ts:117`) colapsan por ese id, y `readAllReceipts` + `currentReceipts` en `packages/server/src/portafolio.ts:92` lo hacen sobre todo el registro: el informe de consumo del 2 al 4 de octubre cuenta 9 evaluaciones en 4 tickets mientras esos archivos tienen 193 líneas en 36, y los reintentos del mismo día del mismo gate se pisan entre sí.
- Comportamiento esperado: dos corridas del mismo gate del mismo ticket el mismo día tienen identificadores distintos y las dos sobreviven al colapso; dos tickets distintos que corren el mismo gate el mismo día no comparten identificador; la decisión humana se anexa, con el mismo identificador de su corrida, al recibo que le corresponde; y los recibos ya escritos —cuyo id no nombra ticket ni intento— se siguen leyendo.

## Diagnóstico

- Síntoma observable: el informe de consumo del rango 2026-10-02 a 2026-10-04 devuelve 9 evaluaciones en 4 tickets mientras `.valmen/receipts/` tiene 193 líneas en 36 archivos para esas fechas; `GR-20260929-analysis` aparece en los recibos de 11 tickets distintos. El análisis de FEATURE-ENGINE-MODELO-INTENTO-20261001 registra seis corridas del mismo gate el 3 de octubre entre 06:13 y 07:17 con el mismo id, así que cualquier lectura que colapse por id ve una sola.
- Archivos y flujo investigados: `packages/engine/src/gate.ts:502-503` (id por defecto), `packages/gate/src/receipt.ts:262-320` (construcción y `recordHumanDecision`, que exige un recibo escalado y sin decisión previa), `packages/engine/src/receipts.ts` (`readReceipts` devuelve la historia; `currentReceipts` colapsa por id), `packages/engine/src/usage.ts:117` (`vigentes`), `packages/server/src/portafolio.ts:92` (colapso sobre todo el registro), `packages/server/src/gates.ts:585` (busca el vigente por `receipt.id === receiptId`), `packages/cli/src/main.ts:229,760` (`gate-decide --receipt`) y `packages/cli/src/hermes.ts:1200`.
- Causa raíz o hipótesis: el id se pensó como identificador de la compuerta de ese día, porque el diseño append-only necesita un id estable al que anexar la decisión humana (encabezado de `receipts.ts`). Ese requisito pide un id estable por corrida, no por día: al no incluir ticket ni intento, dos corridas del mismo gate el mismo día —un reintento tras un bloqueo, o corridas de tickets distintos— comparten identificador, y el colapso que existe para que la decisión humana no borre el veredicto del modelo termina borrando corridas y cruzando tickets.
- Riesgos y compatibilidad: el registro es append-only y los recibos escritos no se reescriben, así que el formato viejo debe seguir leyéndose (id sin ticket ni intento, orden por `decidedAt`). Un `gate-decide` con un id viejo debe seguir encontrando su recibo. Ningún veredicto cambia y no se reescribe historial.
- Impactos de sync, migración, Docker o despliegue: ninguno. No hay migración: los archivos existentes se leen como están.

## Plan

- Gate de plan y aprobación: pendiente de aprobación del PO.
- Pasos ordenados:
  1. En `packages/engine/src/gate.ts`, componer el id por defecto con ticket, compuerta e intento —`GR-<YYYYMMDD>-<gateId>-<n>`, con el número de corrida vigente para ese ticket y compuerta leído de `readReceipts`— y conservar `options.receiptId` como camino explícito.
  2. En `packages/engine/src/receipts.ts`, colapsar por corrida sin cruzar tickets y leer de forma tolerante los ids viejos, sin ticket ni intento, ordenando por `decidedAt`.
  3. En `packages/engine/src/usage.ts`, contar una evaluación por corrida —reintentos incluidos— sin colapsar entre tickets, y dejar la calibración leyendo lo mismo que lee el informe.
  4. En `packages/server/src/portafolio.ts` y `packages/server/src/gates.ts`, ajustar la búsqueda del recibo vigente para que `gate-decide --receipt` siga encontrando su recibo, viejo o nuevo, y la vista no muestre dos veces la misma corrida.
  5. Cubrir con pruebas las dos corridas del mismo gate el mismo día, los dos tickets con el mismo gate el mismo día, la anexión de la decisión humana al recibo correcto, el recuento del informe con reintentos y la lectura de los recibos viejos; correr focales, compilación y suite completa.
- Rollback: revertir el cambio devuelve el id al formato por fecha; los recibos nuevos ya escritos siguen leyéndose porque el lector acepta los dos formatos y no se reescribe ningún recibo histórico.

## Criterios de aceptación

- [ ] R-1: Dos corridas del mismo gate del mismo ticket el mismo día quedan con identificadores distintos y `currentReceipts` conserva las dos.
      <!-- test: npx vitest run tests/receipt-identity.test.ts -->
- [ ] R-2: Dos tickets distintos que corren el mismo gate el mismo día no comparten el identificador de sus recibos.
      <!-- test: npx vitest run tests/receipt-identity.test.ts -->
- [ ] R-3: El informe de consumo cuenta una evaluación por corrida, incluidos los reintentos del mismo día, y no cuenta recibos de otro ticket.
      <!-- test: npx vitest run tests/usage-report.test.ts -->
- [ ] R-4: La decisión humana se anexa al recibo de su corrida con el mismo identificador y `gate-decide --receipt` lo encuentra; un recibo que ya tiene decisión humana se rechaza.
      <!-- test: npx vitest run tests/gate-human-decision.test.ts -->
- [ ] R-5: Los recibos ya escritos, cuyo identificador no nombra ticket ni intento, se siguen leyendo y la calibración no cambia de resultado por el formato nuevo.
      <!-- test: npx vitest run tests/receipts-compat.test.ts -->

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
    "date": "2026-10-04",
    "at": "2026-10-04T22:38:49.593Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
