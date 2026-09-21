---
schema_version: 1
id: FEATURE-LOCALAGENTS-CATALOGO-DESCARGAS-20260910
title: Catálogo público de descargas para agentes locales
type: FEATURE
module: LOCALAGENTS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: true
docker_impact: false
risk_level: high
created: 2026-09-10
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# FEATURE-LOCALAGENTS-CATALOGO-DESCARGAS-20260910

## Solicitud original

Necesito reemplazar la distribución manual por Drive de los paquetes ZIP de los servicios Go de sincronización y comandas. Se requiere una pantalla pública de descargas accesible sin iniciar sesión, con la misma ruta en dev.<DOMINIO_ALT> y next.<DOMINIO_ALT>, donde dev muestre versiones de desarrollo y next únicamente versiones entregadas/estables. Desde Super Admin, personal interno debe poder cargar y publicar cada ZIP, seleccionando canal desarrollo o estable. Se usaría un bucket S3 compartido con prefijos separados por canal. La descarga debe ser libre; la carga y publicación deben permanecer protegidas.

## Descripción funcional

- Alcance: sustituir la entrega manual por Drive de paquetes ZIP de `saiopensync` y `saicomanda` por un catálogo público de Agentes Locales. El diseño admite el agente existente `saiprint` sin requerir que se publique en la primera entrega. Incluye registro/carga interna, catálogo público, descarga y promoción de canales; no cambia el protocolo, escucha, instalación ni actualización automática de los agentes Go.
- Usuario o rol afectado: cualquier visitante puede consultar y descargar los artefactos publicados; únicamente superusuarios de ValMenTech pueden cargar, publicar, retirar o promover una versión desde la aplicación Angular Super Admin.
- Comportamiento actual: los ZIP se generan localmente con los `Makefile` de cada agente y se entregan manualmente por Drive.
- Comportamiento esperado: la ruta pública Angular `/local-agents` está disponible sin sesión en `dev.<DOMINIO_ALT>` y `next.<DOMINIO_ALT>`. El despliegue `dev` muestra el canal `development`; `next` muestra exclusivamente `stable`. Super Admin permite crear borradores, cargar ZIPs, verificar su SHA-256, publicar y promover el mismo artefacto sin sobrescribir una versión existente.

## Diagnóstico

- Archivos y flujo investigados: `LocalAgents/saiopensync/Makefile` y `LocalAgents/saicomanda/Makefile` ya producen paquetes Windows completos mediante `make package-windows VERSION=<semver>`; ambos incluyen ejecutable, instalador, desinstalador y README. También existe `LocalAgents/saiprint`, que usa el mismo patrón. `BackEnd/SuperAdmin` es una app de `SHARED_APPS` que opera en el schema `public`, con JWT y permiso `IsSuperUser`; el frontend ya cuenta con el proyecto Angular `FrontEnd/projects/superadmin`. La aplicación cliente principal usa `FrontEnd/src/app/app-routing.module.ts`; `BackEnd/SaiOpenCloud/urls.py` expone `/superadmin/api/`. El proyecto ya integra S3 privado para certificados, pero su bucket de imágenes es público y no es apto para estos ZIP.
- Causa raíz o hipótesis: no existe un registro central e inmutable de artefactos ni un flujo de publicación por ambiente; por ello el equipo usa un enlace externo manual y no hay trazabilidad, checksum ni rollback desde la plataforma.
- Riesgos y compatibilidad: una descarga pública hace deliberadamente públicos los paquetes publicados; los objetos no pueden contener credenciales, configuraciones de clientes ni binarios no aprobados. La API no aceptará un parámetro de canal de un visitante: el canal se decide en la configuración de cada despliegue. Las versiones y sus objetos S3 son inmutables; retirar una publicación no borra el objeto y permite rollback. La carga debe comprobar ZIP, tamaño permitido, versión SemVer, plataforma, SHA-256 y duplicados; el backend nunca expondrá claves S3. El enlace descargable será temporal y solamente para versiones publicadas.
- Impactos de sync, migración, Docker o despliegue: no modifica OfflineSync/SincSaiCloud, contratos ni binarios de los agentes, por eso `sync_impact: false`. Sí afecta la distribución de LocalAgents y requiere una migración en `public` para catálogo y artefactos. Requiere configuración declarada por pipeline para seleccionar el canal público de cada entorno, un bucket privado compartido con prefijos separados y rollback documentado. No se modifica Docker ni `ALLOWED_HOSTS`.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-10 para el alcance descrito en este plan, incluido el control central de releases, migración en `public`, bucket privado compartido y los canales `development`/`stable`. Es `FEATURE`, requiere migración y afecta la distribución de LocalAgents; cualquier cambio material de alcance o arquitectura requiere renovar esta aprobación.
- Ajuste de alcance aprobado explícitamente por el PO el 2026-09-10: el catálogo público conservará la tarjeta de la versión vigente de cada agente y ofrecerá un desplegable de versiones anteriores. Solo incluirá releases `published` del canal configurado por ambiente; borradores y releases retiradas siguen sin exponerse. SuperAdmin incorporará el enlace `← Inicio`, pues no existe un listado intermedio de agentes.
- Alcance de canal: `development` y `stable`. La configuración de despliegue —no una consulta HTTP ni un valor editable desde UI— resuelve el canal: `dev` publica solamente `development` y `next` solamente `stable`. El artefacto puede convivir en ambos canales si se promueve explícitamente; no se duplica ni se reemplaza el ZIP.
- Decisión pendiente de arquitectura: confirmar si el registro global de releases reside en un único control plane (un Super Admin/API y una base `public` compartidos por ambos despliegues) o si cada ambiente mantiene su catálogo y la promoción replica metadatos de forma controlada. Un bucket S3 compartido por sí solo comparte bytes, pero no las filas de catálogo ni su estado. La implementación queda bloqueada hasta definir esta opción; se recomienda control plane único porque cumple la carga única solicitada y evita divergencias.
- Pasos ordenados:
  1. Crear en `BackEnd/SuperAdmin` modelos compartidos en schema `public` para release y artefacto: agente, SemVer, canal, estado (`draft`, `published`, `withdrawn`), plataforma/arquitectura, nombre original, tamaño, SHA-256, key/version de S3, notas, fechas y actor. Añadir migración compatible solo para `public`, restricciones de unicidad e inmutabilidad tras publicación.
  2. Crear un servicio S3 de artefactos privado, separado del bucket público de imágenes. Definir claves inmutables bajo `local-agents/<canal>/<agente>/<versión>/<plataforma>-<arquitectura>/`; cargar usando permisos de runtime ya aprovisionados, cifrado gestionado y sin retornar bucket/key al navegador. Calcular el hash en servidor y rechazar archivos que no coincidan con el hash declarado, no sean ZIP o reusen una versión/plataforma existente.
  3. Exponer APIs Super Admin protegidas por `PublicSchemaMixin`, `SuperAdminJWTAuthentication` e `IsSuperUser` para listar, crear borrador, adjuntar artefacto, publicar, retirar y promover. Registrar acciones de auditoría para carga, publicación, retiro y promoción con versión/canal/hash, extendiendo las acciones permitidas de auditoría. No utilizar Django Admin.
  4. Exponer una API pública de solo lectura para catálogo y descarga, con permisos explícitos `AllowAny`, rate limit y filtro interno por el canal configurado en el despliegue. Solo devuelve releases `published` y genera una redirección o URL S3 prefirmada de duración corta para el artefacto solicitado; nunca lista borradores, retirados, keys S3 ni un canal diferente.
  5. Añadir la pantalla pública `FrontEnd/src/app/local-agents` y la ruta `/local-agents`: tarjetas por agente con versión, fecha, sistema operativo, tamaño, SHA-256, notas y botón de descarga. Debe funcionar sin token, presentar estado vacío por canal y errores claros. No integrarla a menús autenticados.
  6. Añadir en `FrontEnd/projects/superadmin` la ruta protegida `/local-agents/releases`, APIs, tipos y pantalla de gestión: carga de ZIP, versión/canal/plataforma/notas, revisión de hash/estado, publicación, retiro y promoción. Añadir acceso desde el encabezado del panel.
  7. Añadir pruebas Django de aislamiento en schema `public`, autorización de Super Admin, validaciones de carga/hash/duplicado, visibilidad pública por canal y expiración/formato del enlace; pruebas Angular para ambas pantallas. Ejecutar pruebas Go existentes como comprobación de que el empaquetado no se modifica.
  8. Ajustar la consulta pública para identificar la release vigente por agente/plataforma/arquitectura y recuperar sus versiones históricas publicadas del mismo canal. En Angular, mostrar el historial bajo demanda en tabla con versión, nombre, peso, fecha de publicación y descarga; mantener el enlace de descarga existente y no aceptar selección de canal del visitante.
  9. Añadir el enlace `← Inicio` en la gestión de releases de SuperAdmin, con destino a `/`, y pruebas dirigidas para que el histórico no filtre estados no públicos ni canales ajenos.
- Rollback, backup, canario u orden de despliegue cuando aplique: antes de migrar, realizar backup verificable de la base de datos `public`; desplegar primero backend compatible y migración, luego Super Admin y pantalla pública, y por último configurar los canales por pipeline. Publicar como canario un ZIP ya verificado de un agente en `development`, descargarlo desde `dev` y validar hash/contenido en una máquina autorizada. Tras validación explícita, promover ese mismo artefacto a `stable` y comprobar `next`. Rollback: retirar la release nueva y volver a publicar la release estable anterior; los objetos S3 se conservan, no se sobrescriben ni eliminan durante el rollback. Si falla la migración, aplicar el procedimiento de reversión aprobado tras restaurar el backup; no se actualiza ningún agente instalado automáticamente.

## Criterios de aceptación

- [ ] Un visitante sin sesión puede abrir `/local-agents` en `dev` y descargar únicamente artefactos `published` del canal `development`.
- [ ] Un visitante sin sesión puede abrir `/local-agents` en `next` y descargar únicamente artefactos `published` del canal `stable`; no puede forzar el otro canal por query, ruta o API.
- [ ] El catálogo expone agente, versión, plataforma, fecha, tamaño, SHA-256 y notas, y no expone buckets, keys, credenciales, borradores ni releases retiradas.
- [ ] Un superusuario puede cargar un ZIP, con versión SemVer, agente, plataforma y canal; el sistema calcula/verifica SHA-256 y rechaza duplicados, extensiones inválidas y archivos corruptos.
- [ ] Una publicación y una promoción quedan auditadas. Promover no altera el binario ni vuelve a cargarlo.
- [ ] Retirar una versión impide nuevas descargas y permite volver a la versión anterior sin pérdida de artefactos.
- [ ] La tarjeta pública muestra una sola release vigente por agente/plataforma/arquitectura del canal configurado y permite desplegar sus versiones anteriores `published` con versión, nombre, peso, fecha y descarga.
- [ ] El histórico público no expone borradores, retiradas, buckets, keys ni releases del otro canal; cada descarga mantiene el nombre legible configurado para el ZIP.
- [ ] La pantalla de SuperAdmin de agentes incluye `← Inicio` y retorna al inicio del panel.
- [ ] Los paquetes existentes de sincronización y comandas continúan construyéndose y ejecutándose sin cambio de protocolo, configuración ni exposición de red.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Publicar release falla por dependencia no importada",
    "status": "verified",
    "severity": "high",
    "actual": "Al pulsar Publicar, el endpoint devuelve NameError porque timezone no está definido.",
    "expected": "Publicar debe cambiar el borrador a publicado y retornar una respuesta exitosa.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Acciones de release no son operables ni claras",
    "status": "verified",
    "severity": "normal",
    "actual": "Publicar y Promover se muestran como texto sin controles visuales; no existe acción explícita para eliminar un borrador y los avisos no diferencian éxito y error.",
    "expected": "Cada acción debe ser un botón accesible con etiqueta clara, confirmación y estado; los borradores deben poder eliminarse explícitamente.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-003",
    "title": "Histórico público descargable y navegación de catálogo",
    "status": "verified",
    "severity": "normal",
    "actual": "El catálogo público solo expone las releases actuales sin una vista organizada de versiones anteriores, y la gestión de agentes no ofrece retorno explícito al inicio.",
    "expected": "Cada agente publicado permite consultar y descargar sus versiones históricas publicadas del canal del ambiente; SuperAdmin muestra un enlace Volver al inicio.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: modelos/migración/API/servicio de artefactos en `BackEnd/SuperAdmin`; configuración de canal y límite en `BackEnd/SaiOpenCloud/settings.py`; pantalla pública Angular en `FrontEnd/src/app/local-agents`; pantalla y cliente de gestión en `FrontEnd/projects/superadmin`.
- Ajuste de historial en curso: `BackEnd/SuperAdmin/views.py` selecciona una release vigente por agente/plataforma/arquitectura del canal y sirve las versiones anteriores publicadas solo bajo demanda con `history_for`; `FrontEnd/src/app/local-agents` agrega el desplegable y tabla accesible de historial; `FrontEnd/projects/superadmin/.../local-agent-releases.component.html` incorpora `← Inicio`.
- Pruebas añadidas: `BackEnd/SuperAdmin/tests/test_api.py` cubre selección de release vigente e histórico público; `FrontEnd/src/app/local-agents/local-agents.component.spec.ts` cubre la carga diferida del historial.
- Decisiones técnicas: `LocalAgentArtifact` representa un único ZIP inmutable y `LocalAgentRelease` lo publica por canal, de modo que promover crea solo metadatos y no duplica el objeto S3. El bucket se configura por ambiente, permanece privado y la API pública solo emite URLs prefirmadas de corta duración para releases publicados en el canal configurado. El valor por defecto del canal es `stable` para evitar exposición accidental de desarrollo.
- Compatibilidad preservada: no se alteraron los Makefiles, protocolos, configuración, escucha de red ni binarios de `saiopensync`, `saicomanda` o `saiprint`; no se modificó `ALLOWED_HOSTS`.
- Commits atribuibles al ticket:
  - `b550f49f948dfcbd119d3f01cb04f66dd2af7915` — catálogo público con release vigente, histórico descargable bajo demanda, navegación `← Inicio` y pruebas de regresión.

## Pruebas

- Comandos para el PO:
  1. Desde la raíz: `docker compose run --rm backend python manage.py migrate_schemas --shared`.
  2. Desde la raíz: `docker compose run --rm backend python manage.py test SuperAdmin.tests.test_api.LocalAgentReleaseApiTests`.
  3. Desde `FrontEnd`: `npm test -- --watch=false --browsers=ChromeHeadless`.
  4. Desde `FrontEnd`: `npx ng build --project=superadmin --configuration=development && npx ng build --configuration=development`.
  5. Desde `LocalAgents/saiopensync` y desde `LocalAgents/saicomanda`: `go test ./...`.
- Directorio de ejecución: raíz del repositorio para Django; `FrontEnd` para Angular; `LocalAgents/saiopensync` y `LocalAgents/saicomanda` para Go.
- Resultado esperado: cada suite dirigida finaliza correctamente; las validaciones manuales demuestran el aislamiento de canal, acceso público de descarga y el control exclusivo de Super Admin para publicación.
- Validaciones manuales: configurar `LOCAL_AGENT_ARTIFACT_BUCKET`, `LOCAL_AGENT_ARTIFACT_S3_REGION` y el canal del ambiente por pipeline (`development` en dev y `stable` en next); cargar un ZIP canario sin secretos, comprobar su SHA-256 local frente al catálogo, descargarlo sin sesión desde ambos dominios y verificar que cada dominio solo ve su canal; retirar/promover y comprobar el rollback. Verificar además que cada tarjeta pública muestra solo la versión vigente, que `Ver versiones anteriores` presenta únicamente releases publicadas del mismo agente/canal y que cada fila descarga el ZIP correcto. En SuperAdmin, comprobar `← Inicio`. La aplicación principal usa actualmente `HashLocationStrategy`, por lo que la ruta Angular desplegada se accede como `/#/local-agents` hasta que se apruebe/implemente una migración de routing y rewrites de infraestructura para la ruta limpia solicitada.
- Requisitos de ambiente o datos: bucket privado de artefactos y permisos de runtime confirmados por personal AWS autorizado; valor de canal por ambiente inyectado por los pipelines existentes; base de datos de cada ambiente respaldada antes de la migración. No se asumirán buckets, IAM, cuentas ni nombres de infraestructura sin evidencia del PO/autorizado.
- Resultado técnico local: `python3 BackEnd/manage.py check` y `python3 BackEnd/manage.py makemigrations --check --dry-run` finalizaron correctamente. La compilación Angular de Super Admin y de la aplicación principal finalizó correctamente. La prueba Django dirigida no pudo completarse porque existe una base `test_saiopencloud` previa y requiere la política local/PO para reutilizarla o eliminarla; no se eliminó. La prueba Angular dirigida ejecutó su caso correctamente pero el runner local termina con una excepción de patrón `--include`, por lo que no se considera una suite aprobada.
- Resultado técnico del ajuste de historial: `python3 BackEnd/manage.py test SuperAdmin.tests.test_api.LocalAgentReleaseApiTests --keepdb --noinput` ejecutó 4 pruebas correctamente con la base de pruebas existente; `npx ng build --configuration=development && npx ng build --project=superadmin --configuration=development` compiló ambas aplicaciones. La ejecución Angular dirigida reportó 2 pruebas exitosas, pero termina con el error conocido del runner al reaplicar el patrón `--include`; se conserva como limitación local, no como aprobación funcional.
- Resultado comunicado por el PO: la experiencia visual y las descargas de la entrega desplegada en dev funcionan; se solicita como ampliación el histórico público descargable y el enlace de navegación hacia Inicio en SuperAdmin.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-10",
    "build_reference": "commit:ac2cd8068177d7714d5161240bfaaaf601fb9a45",
    "environment": "dev.<DOMINIO>",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-10",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que la interfaz y descargas funcionan y solicita historial público descargable y navegación a Inicio."
  },
  {
    "id": "QA-003",
    "date": "2026-09-10",
    "build_reference": "commit:aaebab12dbedc49c6ad1128cf58a92ea7dfd4e55",
    "environment": "dev.<DOMINIO>",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-10",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma la validación funcional completa del catálogo de agentes locales en dev."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-10",
    "kind": "automated",
    "description": "La prueba Django dirigida valida que el catálogo entrega únicamente la release vigente y que el histórico público del mismo canal contiene solo versiones publicadas anteriores.",
    "reference": null,
    "point_id": "POINT-003"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-10",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que publicar funciona correctamente en dev."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-10",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que las acciones, avisos y controles visuales funcionan correctamente en dev."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-10",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que la versión vigente, el histórico descargable y el retorno a Inicio funcionan correctamente en dev."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional:
- Resultado comunicado por el PO:
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica):
- Riesgo residual e impacto de release:
- Texto visible al usuario cuando aplique:

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-10",
    "technical_summary": "Catálogo público y gestión SuperAdmin de releases implementados, con historial público descargable y control de canal.",
    "functional_summary": "El PO confirma que la operación completa funciona en dev y queda lista para una futura release productiva.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma la prueba funcional completa en dev y autoriza el cierre técnico del ticket.",
    "release_impact": "El ticket queda closed/unreleased; se incluirá en una release productiva mediante el flujo dev a production."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release:
- Versión objetivo:
- Versión publicada:
- Tickets relacionados:

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-10",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-10",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-10",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-10",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-10",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-10",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-10",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-10",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-10",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-10",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-10",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-10",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-10",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
