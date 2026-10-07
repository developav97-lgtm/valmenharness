---
schema_version: 2
id: SECURITY-MC-ESCRITURAS-AUTENTICADAS-20261005
title: Rechazar escrituras sin autenticación fuera de la máquina local
type: SECURITY
module: MC
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-MC-ESCRITURAS-AUTENTICADAS-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CTRL-003: Mission Control NO DEBE aceptar escrituras sin autenticación cuando escucha fuera de la máquina local
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que Mission Control, cuando escucha en una dirección distinta de la local, rechace con 401 toda petición que escribe —mover un ticket, decidir una compuerta, aprobar un proceso, editar la configuración— si no trae un token válido (R-CTRL-003); que el servidor genere o lea ese token al arrancar con `--host` no local; y que la interfaz lo envíe. Fuera de alcance: cifrado (TLS), usuarios múltiples, la autenticación de lectura y el cambio del servidor MCP.
- Usuario o rol afectado: quien abre Mission Control a la red (una tablet, el celular) y todo el que alcance esa dirección.
- Comportamiento actual: con `--host 0.0.0.0` el servidor imprime «No hay autenticación — la frontera de confianza es tu red» (`packages/cli/src/main.ts:1532`): cualquiera en la red puede decidir compuertas, aprobar despliegues o reescribir la configuración.
- Comportamiento esperado: con escucha local (`127.0.0.1`, `localhost`, `::1`) nada cambia. Con otra dirección, el arranque exige un token —`VALMEN_TOKEN` o uno generado e impreso una vez— y todo método que no sea GET, HEAD u OPTIONS sin `Authorization: Bearer <token>` responde 401 y no registra nada; con token incorrecto, también. La interfaz guarda el token que la persona pega y lo envía en cada escritura.

## Diagnóstico

- Archivos y flujo investigados: `serve` en `packages/cli/src/main.ts:1487` decide la dirección con `--host` y escucha con `servidor.listen`; `createMissionControl` y `handleRequest` (`packages/server/src/server.ts:1913` y `:1926`) atienden toda petición `/api/` pasando por un único punto antes del despacho, donde se puede decidir; el contexto del servidor es `ServerContext`; la interfaz llama al servidor con la función `api` de `packages/server/web/index.html`. El endpoint de aprobación de procesos está en `server.ts:572`.
- Causa raíz o hipótesis: la frontera de confianza se declaró la máquina y `--host` la abre sin un mecanismo que la reemplace; el servidor no sabe en qué dirección escucha, así que no puede exigir nada. Comprobado: no hay lectura de cabeceras de autorización en `server.ts`. El punto común de `handleRequest` permite una sola comprobación para todas las escrituras, en lugar de repartirla por endpoint, que es donde se olvidaría una.
- Riesgos y compatibilidad: es autenticación, por eso exige tu aprobación del plan. La comparación del token es de tiempo constante; el token no se guarda en disco ni se registra en logs; sin `--host` el comportamiento es idéntico. El token protege contra quien alcanza la dirección, no contra quien ve el tráfico: sin TLS viaja en claro, y el aviso del arranque lo dice. Un cliente que ya escribe contra un servidor expuesto (la pantalla, Hermes por el celular) necesita el token: la pantalla lo pide al recibir un 401 y Hermes lo recibe por su configuración. El aviso de las jornadas no debe abrir el servidor: el vigilante de avisos sale por Telegram y no consume el servidor.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: pendiente
- Alcance: la comprobación del token en el servidor, su generación en el arranque, el envío desde la interfaz y la ayuda. Exclusiones: TLS, usuarios múltiples, autenticación de lectura y el servidor MCP.
- Pasos ordenados:
  1. En `packages/server/src/server.ts` agregar a `ServerContext` los campos opcionales `listenHost` y `token`, y la función exportada `exigirTokenEnEscritura(context, request)` que, si el servidor escucha fuera de la máquina local y el método escribe, compara el `Authorization: Bearer` con el token en tiempo constante y devuelve el 401 con un cuerpo que no revela el token; llamarla al inicio de `handleRequest`, antes del despacho de `/api/`.
  2. En `packages/cli/src/main.ts:1487` calcular si la dirección es local; si no lo es, leer `VALMEN_TOKEN` o generar un token aleatorio de 32 bytes, pasarlo en el contexto, imprimirlo una vez en el arranque y reemplazar el aviso de «no hay autenticación» por uno que dice que las escrituras exigen token y que el tráfico no va cifrado.
  3. En `packages/server/web/index.html` hacer que la función `api` envíe `Authorization: Bearer` con el token guardado en `localStorage` en las escrituras y que, ante un 401, pida el token a la persona una vez y repita la petición.
  4. Crear `tests/escrituras-autenticadas.test.ts`: con escucha local las escrituras pasan sin token; con escucha en `0.0.0.0` un POST sin token a `/api/processes/gates/deploy/approve` devuelve 401 y no registra nada, uno con token incorrecto también, uno con token correcto procede, las lecturas siguen sin token, y la comparación no depende de la longitud ni del contenido; correr `npx vitest run tests/escrituras-autenticadas.test.ts`, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
  5. Verificar en el navegador contra un servidor de laboratorio con `--host 0.0.0.0`: una escritura sin token pide el token y con él procede.
- Rollback: revertir el commit del ticket; sin `--host` el servidor se comporta como antes, y quien lo exponga a la red vuelve al aviso anterior sin token.

## Criterios de aceptación

- [ ] Con escucha fuera de la máquina local, un POST de escritura sin token responde 401 y no registra nada
      <!-- test: npx vitest run tests/escrituras-autenticadas.test.ts -->
- [ ] Un token incorrecto también responde 401 y la respuesta no revela el token
      <!-- test: npx vitest run tests/escrituras-autenticadas.test.ts -->
- [ ] Con el token correcto la escritura procede y las lecturas no lo exigen
      <!-- test: npx vitest run tests/escrituras-autenticadas.test.ts -->
- [ ] Con escucha local nada cambia: las escrituras pasan sin token
      <!-- test: npx vitest run tests/escrituras-autenticadas.test.ts -->
- [ ] La interfaz pide el token ante un 401 y lo envía en las escrituras siguientes
      <!-- verify: manual -->

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
    "at": "2026-10-06T01:51:49.995Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T02:29:10.181Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T02:30:10.422Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
