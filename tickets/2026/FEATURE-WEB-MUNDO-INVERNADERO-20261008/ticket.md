---
schema_version: 2
id: FEATURE-WEB-MUNDO-INVERNADERO-20261008
title: Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo
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

# FEATURE-WEB-MUNDO-INVERNADERO-20261008

## Solicitud original

Parte del sprint: Los tres mundos completos y validados contra el prototipo.
- R-ESC-011: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada
- R-MUN-001: Cada mundo DEBE implementar la misma interfaz sobre el motor
- R-MUN-002: Cada mundo DEBE dar un puesto propio a la sesión principal
- R-MUN-003: Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje
- R-MUN-006: El invernadero DEBE ser el cultivo del prototipo
- R-MUN-007: Los personajes DEBEN ser los sprites del prototipo
- R-MUN-008: Cada mundo DEBE pasar la validación visual contra el prototipo
Depende de: FEATURE-WEB-VISTA-LIENZO-20261008, IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

Comportamiento esperado: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada Cada mundo DEBE implementar la misma interfaz sobre el motor Cada mundo DEBE dar un puesto propio a la sesión principal Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje El invernadero DEBE ser el cultivo del prototipo Los personajes DEBEN ser los sprites del prototipo Cada mundo DEBE pasar la validación visual contra el prototipo
Comportamiento actual: la spec no lo declara; se establece en el análisis, leyendo el código.

### Fuera de alcance

Lo que el grafo asignó a otros tickets y este no hace:
- R-ESC-011: lo cubre IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008 (Marco con tokens del tema, celular, iPad y reduced-motion)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-ESC-011: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008 (Motor de escena con estaciones, movimiento, estados visuales, interfaz de mundo y tests sin lienzo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-001: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-002: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-003: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-007: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008 (Mundo pastelería con obrador, personajes, señal de pregunta, estático declarado y validación contra el prototipo)
- R-MUN-008: lo cubre FEATURE-WEB-MUNDO-CONTROL-20261008 (Mundo centro de control con sala, personajes, señal de pregunta, estático declarado y validación contra el prototipo)

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

- [ ] R-ESC-011: El marco DEBE usar los tokens del tema y cada mundo su paleta marcada (solo la parte de «Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo»; el resto lo cubre IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008, FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008)
- [ ] R-MUN-001: Cada mundo DEBE implementar la misma interfaz sobre el motor (solo la parte de «Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo»; el resto lo cubre FEATURE-WEB-MOTOR-ESCENA-20261008, FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008)
- [ ] R-MUN-002: Cada mundo DEBE dar un puesto propio a la sesión principal (solo la parte de «Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo»; el resto lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008)
- [ ] R-MUN-003: Cada mundo DEBE representar los cuatro estados visuales y la pregunta pendiente con su propio lenguaje (solo la parte de «Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo»; el resto lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008)
- [ ] R-MUN-006: El invernadero DEBE ser el cultivo del prototipo
- [ ] R-MUN-007: Los personajes DEBEN ser los sprites del prototipo (solo la parte de «Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo»; el resto lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008)
- [ ] R-MUN-008: Cada mundo DEBE pasar la validación visual contra el prototipo (solo la parte de «Mundo invernadero con cultivo, personajes, señal de pregunta, estático declarado y validación contra el prototipo»; el resto lo cubre FEATURE-WEB-MUNDO-PASTELERIA-20261008, FEATURE-WEB-MUNDO-CONTROL-20261008)

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
    "at": "2026-10-08T23:30:59.658Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
