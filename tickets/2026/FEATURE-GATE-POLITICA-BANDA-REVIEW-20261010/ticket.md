---
schema_version: 2
id: FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010
title: Un REVIEW exige una proposición bajo 0,80 o varias en la banda
type: FEATURE
module: GATE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-10
updated: 2026-10-10
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010

## Solicitud original

Hoy decide() (packages/gate/src/decide.ts:442) da review si alguna proposición queda entre blockAt y approveAt (política por defecto 0,10 y 0,90, DEFAULT_POLICY en decide.ts:330). Medido el 2026-10-10 sobre 4 916 valores de los recibos cascade: el 8,2 % cae en 0,85 a 0,90 aunque el motivo del propio modelo diga que el criterio está cubierto, y por debajo de 0,85 hay solo un 3 %; en la jornada JOR-20261010 lo flojo de verdad apareció por debajo de 0,80 (C17 en 0,12 y C7 en 0,75 del recorte, C13 y C14 en 0,00 de Codex) y los REVIEW con mínimo entre 0,80 y 0,90 se aprobaron todos sin cambios (110 de 110 en el registro). Se pide una política de banda opcional por compuerta: REVIEW solo si alguna proposición queda bajo un piso (propuesto 0,80) o si 3 o más quedan entre ese piso y approveAt; el resto aprueba. Condiciones: (1) un gate no amplía su propia autoridad: el cambio de umbral lo firma una persona en la configuración (gate-thresholds con approved-by y reason), nunca el agente, y sin firma todo queda como hoy; (2) el plan incluye una repetición determinista de los recibos del registro (.valmen/receipts/*.jsonl) que lista, antes y después, qué decisiones cambiarían, con el caso control de un recibo con una proposición en 0,12 que debe seguir dando review o block; (3) calibrar_compuerta hoy se niega a proponer porque hay 25 decisiones humanas y 0 rechazos y exige 20 y 5: la repetición de recibos es la evidencia alternativa, y el ticket debe decirlo. Decisión del PO del 2026-10-10: «Política de banda con repetición de recibos».

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Causa comprobada (con `ruta:línea`):
- Hipótesis pendientes:
- Consumidores afectados:
- Archivos y flujo investigados:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando, y los criterios que cubre, por ejemplo
       «(C1, C2)». Un paso que no dice dónde ni con qué se toca no se puede ejecutar ni
       revisar, y la compuerta lo lee así. -->
  1.
  2.
- Impactos declarados:
  <!-- Una línea por cada impacto que el ticket declara, con las palabras de su proposición:
       sincronización (datos ya sincronizados y clientes que todavía no se actualizaron),
       migración (orden de aplicación y reversión) o contenedores (imagen y publicación). -->
- Rollback (obligatorio):

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

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
    "date": "2026-10-10",
    "at": "2026-10-11T04:20:49.228Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
