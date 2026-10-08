---
schema_version: 2
id: FEATURE-WEB-VISTA-LIENZO-20261008
title: Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados
type: FEATURE
module: WEB
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-08
updated: 2026-10-08
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-WEB-VISTA-LIENZO-20261008

## Solicitud original

Parte del sprint: Vista Agentes renombrada, motor de escena con tests deterministas, lienzo montado con selector, aviso y paneles, marco responsivo.
- R-ESC-005: La vista DEBE recordar el mundo elegido solo en el navegador
- R-ESC-006: La escena NO DEBE reiniciarse en cada refresco de datos
- R-ESC-007: El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo
- R-ESC-008: Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual
Depende de: IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES-20261008, FEATURE-WEB-MOTOR-ESCENA-20261008, FEATURE-SERVER-PREGUNTA-PENDIENTE-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: La vista DEBE recordar el mundo elegido solo en el navegador La escena NO DEBE reiniciarse en cada refresco de datos El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-006: lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008 (Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo)
- R-ESC-007: lo cubre FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008 (Vista muestra el texto de la pregunta y la respuesta)

### Referencias de diseño

Adjuntos que cita la spec del dominio de este ticket (ningún requisito suyo cita uno en particular). Se construye y se valida contra el original, no contra el texto de la spec:
- `.valmen/features/vista-agentes/assets/vista-agentes.html` — Prototipo aprobado por el PO el 2026-10-08: tres mundos (pastelería, centro de control, invernadero) con simulación, sesión principal y pregunta pendiente (sha256 0e54061e5fcc…)

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

- [ ] R-ESC-005: La vista DEBE recordar el mundo elegido solo en el navegador
- [ ] R-ESC-006: La escena NO DEBE reiniciarse en cada refresco de datos (solo la parte de «Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados»; el resto lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008)
- [ ] R-ESC-007: El aviso de pregunta pendiente DEBE decir a quién le toca y desde cuándo (solo la parte de «Vista Agentes con lienzo montado desde el motor, selector de mundo, aviso de pregunta, paneles y estáticos declarados»; el resto lo cubre FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008)
- [ ] R-ESC-008: Los paneles bajo el lienzo DEBEN mostrar la misma información que la tabla actual

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
    "date": "2026-10-08",
    "at": "2026-10-08T23:30:59.065Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
