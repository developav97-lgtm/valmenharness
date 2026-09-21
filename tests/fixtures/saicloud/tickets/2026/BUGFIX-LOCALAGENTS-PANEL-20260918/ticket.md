---
schema_version: 1
id: BUGFIX-LOCALAGENTS-PANEL-20260918
title: Gestion de agentes locales con carga sin feedback, listado plano y catalogo en next
type: BUGFIX
module: LOCALAGENTS
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-18
updated: 2026-09-18
related_ticket: FEATURE-LOCALAGENTS-CATALOGO-DESCARGAS-20260910
target_release: null
released_in: null
---

# BUGFIX-LOCALAGENTS-PANEL-20260918

## Solicitud original

Reporte del PO (2026-09-18): (1) al pulsar Cargar borrador en el panel Super Admin no existe indicador de carga ni mensaje, por lo que no se sabe si el ZIP se esta subiendo; (2) el listado de releases muestra todas las versiones de ambos canales y estados (p. ej. 6 filas de saiopensync 1.3.7/1.3.8/1.3.9) y saicomanda 1.2.1 se pierde en medio; se pide una organizacion por agente que muestre la version vigente por canal y permita desplegar el historial; (3) la ruta publica https://next.<DOMINIO_ALT>/#/local-agents no carga las versiones estables porque la peticion sale a next.<DOMINIO>, que no tiene tenant, y devuelve No tenant for 'next.<DOMINIO>'; el host publico del backend de produccion verificado es admin.<DOMINIO>.

## Descripción funcional

- Alcance: corregir tres defectos de la gestión y el catálogo de agentes locales. (1) La carga de un borrador en Super Admin debe mostrar progreso y bloquear el botón mientras dura. (2) El listado de releases de Super Admin debe agruparse por agente, mostrar la versión vigente de cada canal y los borradores pendientes, y dejar las versiones anteriores bajo un desplegable. (3) El catálogo público servido en `next.<DOMINIO_ALT>` debe consultar el host público del backend de producción (`admin.<DOMINIO>`) en lugar de `next.<DOMINIO>`, que no tiene tenant. No cambia el modelo de datos, los contratos de API, los canales, los binarios Go ni el bucket S3.
- Usuario o rol afectado: personal interno ValMenTech que carga, publica, retira o promueve releases desde el panel Super Admin (`admin.<DOMINIO_ALT>`); visitantes sin sesión que descargan instaladores desde `/local-agents` en `dev.<DOMINIO_ALT>` y `next.<DOMINIO_ALT>`.
- Comportamiento actual: el botón `Cargar borrador` no muestra spinner ni se deshabilita, así que no hay señal de que el ZIP se esté subiendo; el listado pinta todas las releases de ambos canales y todos los estados en una sola columna (saiopensync acumula 6 filas y saicomanda 1.2.1 queda oculta en medio); en `next` la petición pública sale a `https://next.<DOMINIO>/...` y responde 404 `No tenant for 'next.<DOMINIO>'`, dejando la página sin versiones.
- Comportamiento esperado: la carga del borrador muestra un estado de progreso visible con el botón deshabilitado y un aviso de éxito o error al terminar; el listado de Super Admin agrupa por agente con las tarjetas de la versión vigente por canal, los borradores pendientes y un desplegable de versiones anteriores; el catálogo de `next` lista y descarga únicamente releases `published` del canal `stable` consultando `https://admin.<DOMINIO>`.

## Diagnóstico

- Archivos y flujo investigados:
  - `FrontEnd/projects/superadmin/src/app/features/local-agent-releases/local-agent-releases.component.ts:16-22` es el único responsable de subir/publicar/retirar/promover: `upload()` llama al API sin estado de carga y `message` es un único aviso sin tipo; el HTML (`local-agent-releases.component.html:4,16`) pinta `message` en una sola clase `notice` y nunca deshabilita el botón; el CSS no tiene estilos de error ni de espera.
  - `FrontEnd/projects/superadmin/src/app/core/api/superadmin-api.service.ts:86` (`listLocalAgentReleases`) consume `GET local-agents/releases/`, que en `BackEnd/SuperAdmin/views.py:490-492` devuelve todas las releases (`draft`, `published`, `withdrawn`) de ambos canales sin agrupar. El componente las recorre con un `*ngFor` plano.
  - `FrontEnd/src/app/local-agents/local-agents.component.ts:57-63` (`apiBase()`) reemplaza `.<DOMINIO_ALT>` por `.<DOMINIO>` en cualquier subdominio; verificado en vivo el 2026-09-18: `https://next.<DOMINIO>/superadmin/api/local-agents/public/releases/` responde 404 (`No tenant`), `https://admin.<DOMINIO>/superadmin/api/local-agents/public/releases/` responde 200 y `https://dev.<DOMINIO>/...` responde 200. El nodo raíz `*.<DOMINIO>` enrutado al backend de producción es `admin.<DOMINIO>` (Domain público de Ohio, ALB Ohio default → target group de producción según `docs/aws/plan-ejecucion.md:730-748`).
- Causa raíz o hipótesis: (1) la carga no modela el estado asíncrono de un POST multipart que puede tardar; (2) la API de gestión entrega el historial completo y el componente lo presenta sin agrupar porque no existe una vista jerárquica; (3) el mapeo de `apiBase()` asumió que todo subdominio de frontend tiene un tenant homónimo en el backend, pero `next` solo existe como frontend PWA y no como dominio en la base compartida; además `next.<DOMINIO>` no está registrado ni enrutado al backend de producción.
- Riesgos y compatibilidad: los tres cambios son de frontend. No se modifica la API, los modelos, las migraciones, el canal público (que sigue resuelto por `LOCAL_AGENT_PUBLIC_CHANNEL` de cada task definition), los agentes Go ni el bucket S3. El canal mostrado en `next` queda garantizado por el backend de destino (`stable` por default), y el de `dev` se conserva (`development`). Compatibilidad hacia atrás: no hay consumidores de la API pública distintos de la pantalla; el desplegable de historial usa el mismo endpoint existente.
- Impactos de sync, migración, Docker o despliegue: `sync_impact: false` (no toca OfflineSync/SincSaiCloud), `migration_impact: false`, `docker_impact: false`. El cambio se entrega por los pipelines existentes de frontend (`buildspec-front-dev.yml` para dev y el pipeline de release para `next`). Afecta la distribución de LocalAgents, por lo que el plan conserva gate humano explícito del PO.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-18 en esta conversación. Confirmó crear ticket `BUGFIX` con plan, la opción `next → admin.<DOMINIO>` para el punto 3 y la organización "por agente: vigente por canal + historial colapsable" para el punto 2. Es un cambio de LocalAgents con gate humano explícito; el alcance aprobado no incluye backend, migración, Docker ni DNS.
- Pasos ordenados:
  1. POINT-003 — `FrontEnd/src/app/local-agents/local-agents.component.ts`: reemplazar el mapeo ciego por un mapa explícito de frontends de producción (`next.<DOMINIO_ALT>` → `https://admin.<DOMINIO>`) conservando `dev.<DOMINIO_ALT>` → `https://dev.<DOMINIO>`, `admin.<DOMINIO_ALT>` → `https://admin.<DOMINIO>` y same-origin para local; cubrir con pruebas unitarias que la petición de catálogo, historial y descarga usen el host correcto.
  2. POINT-002 — `FrontEnd/projects/superadmin/src/app/features/local-agent-releases/local-agent-releases.component.ts`: calcular agrupación por agente con la misma regla del backend (`published` vigente por agente/plataforma/arquitectura/canal ordenando `published_at` desc, `created_at` desc, `pk` desc), borradores del agente e historial (publicadas no vigentes y retiradas); etiquetas de canal/estado en español.
  3. POINT-002 — `local-agent-releases.component.html`/`.css`: render por agente con tarjetas "Estable/Desarrollo (vigente)" y "Borradores", acciones existentes (publicar, retirar, promover, eliminar) y un desplegable "Ver versiones anteriores (N)" por agente con las acciones permitidas sobre cada versión.
  4. POINT-001 — `local-agent-releases.component.ts`/`.html`/`.css`: estado `uploading` con botón deshabilitado y texto "Cargando borrador…", deshabilitar el selector de archivo mientras sube, y avisos diferenciados de éxito (verde) y error (rojo); conservar el mensaje de error del backend cuando exista.
  5. Pruebas y verificación: specs Angular de `FrontEnd/src/app/local-agents` (mapeo de hosts) y `FrontEnd/projects/superadmin` (agrupación y estados de carga); builds de desarrollo de ambas aplicaciones. No se ejecutan pruebas Go porque no se modifica `LocalAgents/`.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migraciones ni datos que respaldar. Rollback = revertir el commit de frontend y redesplegar los pipelines existentes. Orden de despliegue: dev primero (validación visual del PO), y el cambio llega a `next` con la próxima release `dev` → `production`. No se crean tags, PR ni despliegues como parte de este ticket.

## Criterios de aceptación

- [ ] POINT-001: al pulsar `Cargar borrador` se ve un estado de progreso, el botón y el selector quedan deshabilitados, y al terminar aparece un aviso diferenciado de éxito o de error.
- [ ] POINT-002: la gestión Super Admin muestra por agente la versión vigente de Estable y de Desarrollo, los borradores pendientes, y un desplegable con las versiones anteriores; `saicomanda 1.2.1` deja de quedar oculta entre las filas de `saiopensync`.
- [ ] POINT-002: las acciones de publicar, retirar, promover y eliminar borrador siguen operando sobre cada tarjeta y refrescan el listado agrupado.
- [ ] POINT-003: `https://next.<DOMINIO_ALT>/#/local-agents` lista las versiones `stable` publicadas y sus descargas responden 200 consultando `admin.<DOMINIO>`; `dev.<DOMINIO_ALT>` sigue mostrando el canal `development` y `localhost` sigue usando el mismo origen.
- [ ] POINT-004: en pantallas anchas el listado de clientes aprovecha el ancho disponible, muestra todas las columnas sin recortes (incluida `Últ. orden` con fecha y hora legibles) y solo usa scroll horizontal como respaldo en pantallas pequeñas.
- [ ] No hay cambios en backend, modelos, migraciones, Docker, agentes Go ni bucket S3.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Cargar borrador sin indicador de progreso ni aviso",
    "status": "verified",
    "severity": "normal",
    "actual": "Al pulsar Cargar borrador el panel no muestra spinner, boton deshabilitado ni mensaje mientras el ZIP viaja al backend; el usuario no sabe si la carga esta en curso y puede reintentar.",
    "expected": "Mientras la carga esta en curso debe verse un estado visible de progreso y el boton deshabilitado; al terminar debe aparecer un aviso claro de exito o de error.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Listado de releases plano mezcla canales, estados y versiones",
    "status": "verified",
    "severity": "normal",
    "actual": "La gestion Super Admin lista todas las releases de ambos canales y todos los estados en una sola columna; saiopensync acumula 6 filas por versiones y canales y saicomanda 1.2.1 queda perdida en medio.",
    "expected": "El listado debe organizarse por agente mostrando la version vigente de cada canal y los borradores pendientes, con las versiones anteriores disponibles bajo un desplegable por agente.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-003",
    "title": "Catalogo publico en next consulta un host sin tenant",
    "status": "verified",
    "severity": "high",
    "actual": "En https://next.<DOMINIO_ALT>/#/local-agents la peticion sale a https://next.<DOMINIO>/superadmin/api/local-agents/public/releases/ y responde 404 No tenant for next.<DOMINIO>, por lo que no se listan las versiones estables. Verificado que https://admin.<DOMINIO>/superadmin/api/local-agents/public/releases/ responde 200 con el canal estable.",
    "expected": "El catalogo publico en next debe consultar el host publico del backend de produccion y mostrar unicamente las versiones estables publicadas.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-004",
    "title": "Listado de clientes recortado por contenedor angosto",
    "status": "verified",
    "severity": "normal",
    "actual": "El listado de clientes del panel Super Admin vive en un contenedor max-w-6xl centrado, deja espacio sin usar a los lados en pantallas anchas y obliga a scroll horizontal; la columna Ult. orden queda cortada y muestra solo el inicio de la fecha.",
    "expected": "El listado debe aprovechar el ancho disponible de la pantalla, mostrar todas las columnas sin recortes y mantener el scroll horizontal solo como respaldo en pantallas pequenas.",
    "evidence": [],
    "affected_files": [],
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

- Archivos cambiados:
  - `FrontEnd/src/app/local-agents/local-agents.component.ts`: `apiBase()` delega en `resolveLocalAgentApiBase(host, origin)`; el mapa explícito enruta `next.<DOMINIO_ALT>` → `https://admin.<DOMINIO>`, conserva `dev.<DOMINIO_ALT>` → `https://dev.<DOMINIO>` y `admin.<DOMINIO_ALT>` → `https://admin.<DOMINIO>`, y mantiene el origen actual fuera de esos dominios.
  - `FrontEnd/src/app/local-agents/local-agents.component.spec.ts`: pruebas de la función de resolución de host.
  - `FrontEnd/projects/superadmin/src/app/features/local-agent-releases/local-agent-releases.component.ts`: `buildGroups()` agrupa por agente con la release vigente por (plataforma, arquitectura, canal) y la misma regla del backend, separa borradores e historial, agrega etiquetas en español, `uploading` y `messageKind`.
  - `FrontEnd/projects/superadmin/src/app/features/local-agent-releases/local-agent-releases.component.html`: tarjetas de vigentes por canal, tarjetas de borradores, desplegable `Ver versiones anteriores (N)` por agente, spinner y botones deshabilitados durante la carga, avisos de éxito/error.
  - `FrontEnd/projects/superadmin/src/app/features/local-agent-releases/local-agent-releases.component.css`: conserva los estilos base; lo nuevo usa utilidades Tailwind para no exceder el presupuesto de estilos por componente.
  - `FrontEnd/projects/superadmin/src/app/features/local-agent-releases/local-agent-releases.component.spec.ts` (nuevo): 4 pruebas de agrupación, historial y estados de carga/error.
  - `FrontEnd/projects/superadmin/src/app/core/models/superadmin.models.ts`: `created_at` opcional en `LocalAgentRelease` para ordenar con el mismo criterio del backend.
  - `FrontEnd/projects/superadmin/src/app/features/clients-list/clients-list.component.html`: el contenedor pasa de `max-w-6xl` centrado a ancho completo con padding, el grid de tarjetas gana una columna en pantallas grandes y la celda `Últ. orden` usa la fecha formateada.
  - `FrontEnd/projects/superadmin/src/app/features/clients-list/clients-list.component.ts`: helper `lastOrderLabel` con formato `es-CO` (día/mes/año y hora).
  - `FrontEnd/projects/superadmin/src/app/features/clients-list/clients-list.component.spec.ts` (nuevo): 2 pruebas de creación y formato de la última orden.
- Decisiones técnicas: la versión vigente se calcula en el cliente replicando `_current_local_agent_releases` (publicadas, orden `published_at` desc → `created_at` desc → `pk` desc, una por agente/plataforma/arquitectura/canal) para no tocar la API; el historial muestra publicadas no vigentes y retiradas, y los borradores quedan siempre visibles para operarlos. El canal del catálogo público sigue resolviéndose por `LOCAL_AGENT_PUBLIC_CHANNEL` del backend de destino; el frontend solo corrige el host. `resolveLocalAgentApiBase` se exporta como función pura porque `window.location` no es configurable en Chrome y no puede espiarse en Karma.
- Compatibilidad preservada: no se modifican backend, modelos, migraciones, Docker, S3, contratos ni agentes Go; `dev` conserva el canal `development`, `next` obtiene `stable` y `localhost` conserva same-origin.
- Commits atribuibles al ticket:
  - `fb24509369e66e85a857c3084c2ae2e4570b659f` — commit funcional: progreso y avisos al cargar borradores, listado agrupado por agente con vigente por canal e historial, y enrutamiento del catálogo público de `next` a `admin.<DOMINIO>`, con las pruebas unitarias del alcance.
  - `1fb0c0e6779898bf984b963756e74d004787eda5` — commit funcional: listado de clientes a ancho completo, grid de tarjetas ampliado en pantallas grandes y `Últ. orden` con fecha y hora legibles, con prueba del helper.

## Pruebas

- Comandos para el PO:
  1. Desde `FrontEnd`: `npx ng test superadmin --watch=false --browsers=ChromeHeadless` → 6/6.
  2. Desde `FrontEnd`: `npx ng test --watch=false --browsers=ChromeHeadless --include='**/local-agents/local-agents.component.spec.ts'` → 5/5; el runner local termina después con la excepción conocida del patrón `--include`, ya documentada en el ticket original del catálogo.
  3. Desde `FrontEnd`: `npx ng build --project=superadmin --configuration=production` y `NODE_OPTIONS="--max-old-space-size=3072" npx ng build --configuration=production`.
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: las dos suites dirigidas terminan en verde y ambas compilaciones de producción finalizan sin errores ni advertencias de presupuesto.
- Validaciones manuales:
  - Super Admin (dev): abrir la gestión de agentes, pulsar `Cargar borrador` con un ZIP y comprobar spinner, botón y selector deshabilitados, y aviso verde al terminar; forzar un error (versión duplicada) y comprobar aviso rojo. Verificar que el listado muestra por agente la vigente de Estable y Desarrollo, los borradores, y que `Ver versiones anteriores (N)` despliega el historial sin mezclar agentes.
  - Catálogo público: tras desplegar el frontend a `next`, abrir `https://next.<DOMINIO_ALT>/#/local-agents` y confirmar que lista y descarga las versiones estables (`saicomanda 1.2.1`, `saiopensync 1.3.9`) consultando `admin.<DOMINIO>`; abrir `https://dev.<DOMINIO_ALT>/#/local-agents` y confirmar que conserva el canal `development`.
  - Listado de clientes (dev): abrir el panel en una pantalla ancha, activar la vista Tabla y confirmar que no hay scroll horizontal, que `Últ. orden` se ve completa con fecha y hora, y que en pantallas pequeñas el scroll horizontal sigue disponible como respaldo.
  - Nota: el punto 3 requiere que el frontend llegue a `next` mediante una release `dev` → `production`; en dev solo puede validarse que no hay regresión.
- Requisitos de ambiente o datos: sesión de superusuario para la gestión; un ZIP de prueba sin secretos para la carga; para `next`, la release productiva con este cambio.
- Resultado técnico local: `ng test superadmin` 6/6 y la spec dirigida de `local-agents` 5/5 en verde; builds de producción de ambas aplicaciones sin errores ni advertencias de presupuesto. La suite completa de Karma del app principal se desconectó en 365/688 con 4 fallos preexistentes en `AdmSettingComponent`, `PosBranchCategoryComponent` y `ReleaseNotesService`, ajenos a este ticket; no se modificaron esos archivos.
- Resultado comunicado por el PO: el PO confirma el 2026-09-18 que las pruebas en dev están listas y autoriza el cierre del ticket. La validación visual del POINT-003 en `next` queda pendiente de la release `dev` → `production`; el enrutamiento ya está cubierto por pruebas unitarias y por la verificación del host público.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-18",
    "build_reference": "commit:1fb0c0e6779898bf984b963756e74d004787eda5",
    "environment": "dev.<DOMINIO_ALT> - panel Super Admin y catalogo publico dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-18",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma el 2026-09-18 que las pruebas funcionales en dev están listas y autoriza el cierre del ticket; la validación visual del POINT-003 en next queda pendiente de la release dev a production."
  }
]
```

## Evidencia

```json
[]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-18",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-18 que la carga de borradores en dev muestra progreso y avisos, y autoriza el cierre."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-18",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-18 que el listado agrupado por agente en dev funciona y autoriza el cierre."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-18",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO autoriza el cierre el 2026-09-18; la verificación visual en next queda pendiente de la release dev a production, con el enrutamiento cubierto por pruebas unitarias y la verificación del host publico."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-18",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-18 que el listado de clientes a ancho completo en dev funciona y autoriza el cierre."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: los cuatro puntos quedaron corregidos en frontend: carga de borradores con progreso y avisos, listado de releases agrupado por agente con vigente por canal e historial, catálogo público de `next` enrutado a `admin.<DOMINIO>` y listado de clientes a ancho completo con `Últ. orden` legible. Pruebas: `ng test superadmin` 6/6, spec dirigida de `local-agents` 5/5 y builds de producción de ambas aplicaciones sin errores. QA-002 aprobada con confirmación del PO.
- Resultado comunicado por el PO: el PO confirma el 2026-09-18 que las pruebas en dev están listas y autoriza el cierre del ticket.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): aprobada en QA-002; el PO confirma el resultado funcional en dev y autoriza el cierre.
- Riesgo residual e impacto de release: el POINT-003 solo se verá en `next` cuando el frontend llegue a producción mediante una release `dev` → `production`; no hay migraciones, backend, Docker ni cambios de sync. El ticket cierra `unreleased` y se incluirá en la próxima versión productiva.
- Texto visible al usuario cuando aplique: no aplica; son pantallas internas del panel ValMenTech y el catálogo público ya mostraba los textos existentes en español.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-18",
    "technical_summary": "Cuatro correcciones de frontend: progreso y avisos al cargar borradores, listado de releases agrupado por agente con vigente por canal e historial, catalogo publico de next enrutado a admin.<DOMINIO> y listado de clientes a ancho completo con Ult. orden legible. Sin cambios de backend, migraciones, Docker, S3 ni agentes Go.",
    "functional_summary": "El PO confirma que las pruebas en dev estan listas y autoriza el cierre; la validacion visual del punto 3 en next queda pendiente de la release dev a production.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma el 2026-09-18 el resultado funcional en dev y autoriza el cierre del ticket.",
    "release_impact": "El ticket queda closed/unreleased; se incluira en una release productiva mediante el flujo dev a production."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased
- Versión objetivo: null
- Versión publicada: null
- Tickets relacionados: FEATURE-LOCALAGENTS-CATALOGO-DESCARGAS-20260910

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-18",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-18",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-18",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-18",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-18",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-18",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-18",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-18",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-18",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-18",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-18",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-18",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-18",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-18",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
