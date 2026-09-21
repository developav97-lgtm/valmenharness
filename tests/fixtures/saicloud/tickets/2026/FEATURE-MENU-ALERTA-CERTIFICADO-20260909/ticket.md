---
schema_version: 1
id: FEATURE-MENU-ALERTA-CERTIFICADO-20260909
title: Alerta de vencimiento del certificado electrónico en el menú principal
type: FEATURE
module: MENU
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-09
updated: 2026-09-17
related_ticket: FEATURE-SUPERADMIN-CERTIFICADOS-DIAN-20260831
target_release: 6.2.5
released_in: 6.2.5
---

# FEATURE-MENU-ALERTA-CERTIFICADO-20260909

## Solicitud original

En el menú principal, fuera de la alerta «¡Información importante!» de pendientes de facturación, mostrar una indicación visual sobre los botones de aplicaciones cuando el certificado electrónico venza en 30 días o menos, o ya esté vencido. Primero se debe consultar el certificado cargado en Compañía y usar su fecha de vencimiento. Si no existe, solo si AdmSettingPos.type_binario es Electronic se debe consultar pos/consult_certificate; si el tipo es distinto no se consulta el binario. Si no hay certificado ni en Compañía ni mediante la consulta Electronic, no se muestra mensaje. La alerta debe ser amarilla cuando está próxima a vencer y roja cuando ya venció, con un texto que indique los días restantes o los días de vencimiento.

## Descripción funcional

- Alcance: incorporar al menú principal una alerta visual independiente de la alerta desplegable `¡Información importante!`, ubicada sobre o junto a las tarjetas de aplicaciones y visible en las variantes de escritorio y móvil. La alerta comunica exclusivamente la vigencia del certificado electrónico.
- Usuario o rol afectado: usuarios autenticados de tenants que tengan un certificado electrónico próximo a vencer o vencido; no se limita al rol `ADMIN`, pues los usuarios que entran al menú deben poder conocer el riesgo operativo. El certificado y sus secretos permanecen inaccesibles.
- Comportamiento actual: `MenuComponent` carga `Setting` desde IndexedDB y muestra, solo en escritorio, una alerta de órdenes pendientes por sincronizar o enviar. El certificado cargado directamente en Compañía puede consultarse mediante `GET /api/dian/certificate/`, que devuelve únicamente metadatos seguros, incluidos `valid_until` e `is_expired`. Para integración Electronic existe `GET pos/consult_certificate`, cuyo binario reporta `no_after`; el menú aún no usa ninguna de las dos fuentes.
- Comportamiento esperado: al inicializar el menú, se consulta primero el certificado seguro de Compañía. Si existe, `valid_until` es la única fecha usada y no se consulta el binario. Si no existe, se consulta `Setting.pos_setting.type_binario`; solo cuando sea exactamente `Electronic` se consulta `pos/consult_certificate` y se usa `no_after`. Con integración distinta, configuración POS ausente, fecha inválida, fallo de red o ausencia de certificado en ambas fuentes, el menú sigue operativo y no muestra alerta. Una fecha a 30 días calendario o menos, incluido el día de vencimiento, muestra amarillo con `El certificado electrónico vence en N día(s)`; una fecha anterior a hoy muestra rojo con `El certificado electrónico está vencido hace N día(s)`. La indicación no altera ni reutiliza la alerta de pedidos pendientes.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/mod-general/menu/menu.component.ts` obtiene `Setting` y módulos durante `ngOnInit`; `menu.component.html` contiene las tarjetas de aplicaciones y la alerta existente de sincronización; `menu.component.spec.ts` ya cubre el comportamiento de dicha alerta. `FrontEnd/src/app/common/services/general.service.ts` expone `getDianCertificate()` con autenticación y timeout. `FrontEnd/src/app/common/services/point-of-sale.service.ts` expone `getCertificate()` para `pos/consult_certificate`. En backend, `BackEnd/ModAdmin/views/dian.py` devuelve `null` si no hay certificado de Compañía sin revelar archivo, contraseña o almacenamiento; `BackEnd/ModPos/views/functions.py` reenvía al binario `certificate-status` y la pantalla POS existente consume `no_after`.
- Causa raíz o hipótesis: el menú no tiene hoy un estado de vigencia ni una secuencia que priorice el certificado administrado directamente por Compañía frente a la fuente histórica del binario; por ello no comunica el vencimiento y podría terminar consultando una integración no electrónica si se añadiera la llamada sin guard.
- Riesgos y compatibilidad: no se debe mostrar un falso vencimiento por zona horaria ni tratar un error de consulta como certificado vencido. Se calculará la diferencia usando fechas calendario `YYYY-MM-DD` en la zona de negocio Colombia, evitando desfases por la hora UTC. Las respuestas actuales pueden ser `null`, un objeto de metadatos o texto JSON del binario; la normalización debe tolerar esos contratos y omitir formatos desconocidos. La llamada al binario se mantiene condicionada en cliente para no afectar tenants Bipanes u otras integraciones; no se cambiarán secretos, endpoints existentes, permisos ni la semántica de la alerta de sincronización.
- Hallazgo QA de POINT-003: la primera previsualización interpretó el parámetro desde `window.location.search`. En Angular con hash routing, la URL publicada `/#/home?certificateAlertPreview=expired` conserva la consulta dentro de `window.location.hash`, por lo que el valor nunca se encontraba y se ejecutaba el flujo real. La corrección debe extraer la consulta del fragmento sin relajar la restricción de host ni crear llamadas adicionales.
- Hallazgo visual de POINT-004: en el breakpoint móvil el contenedor principal elimina su padding horizontal para acomodar la grilla de aplicaciones; la alerta hereda ese ancho completo y queda pegada a ambos bordes. El margen debe aplicarse a la alerta dentro del breakpoint móvil, sin alterar la grilla ni el layout de escritorio.
- Impactos de sync, migración, Docker o despliegue: no se identifican cambios de OfflineSync, SincSaiCloud, LocalAgents, WebSocket, migraciones, Docker ni despliegue. El ticket depende funcionalmente de `FEATURE-SUPERADMIN-CERTIFICADOS-DIAN-20260831`: mientras ese ticket cambia la administración del certificado, este conserva su contrato público de lectura `GET /api/dian/certificate/` y no duplica dicha administración.

## Plan

- Alcance y exclusiones: incluye la lectura priorizada de metadatos de certificado, el fallback Electronic al binario, el cálculo de días y el aviso visual responsive dentro del menú. Excluye cargar, reemplazar o eliminar certificados; cambiar la integración del tenant; alterar el envío de facturas, la alerta de sincronización, APIs de certificados, sincronización, migraciones y Docker.
- Gate de plan: aprobado explícitamente por el PO el 2026-09-09 en esta conversación, para implementar el alcance completo descrito: aviso independiente cerca de las tarjetas, umbral de 30 días calendario, prioridad de Compañía y fallback exclusivo `Electronic`. Es obligatorio por tratarse de un ticket `FEATURE` visible para usuarios.
- Revisión de alcance 2026-09-09 — aprobada explícitamente por el PO en esta conversación: incorporar una previsualización exclusivamente visual y no persistente para validar los dos estados en `dev.saiopencloud.co` y `localhost`. Con `?certificateAlertPreview=warning` o `?certificateAlertPreview=expired`, el menú mostrará el estado correspondiente y una etiqueta `Vista de prueba`; no consultará API/binario ni alterará certificados. Cualquier otro host, incluido producción, ignora el parámetro. Esta restricción por hostname es necesaria porque `buildspec-front-dev.yml` usa `--configuration production`, por lo que `environment.production` no puede distinguir DEV de producción.
- Pasos ordenados:
  1. Frontend — ownership `FrontEnd/src/app/mod-general/menu/menu.component.ts`: declarar un estado tipado y una función pura para normalizar `valid_until` de Compañía o `no_after` del binario y calcular `warning`, `expired` o ausencia. Tras obtener `Setting`, consultar `GeneralService.getDianCertificate()`; si el resultado tiene fecha válida, detener el flujo. Solo con respuesta sin certificado y `Setting?.pos_setting?.type_binario === 'Electronic'`, invocar el servicio POS y normalizar su JSON. Capturar errores/fechas inválidas sin bloquear la carga ni crear aviso.
  2. Frontend — ownership `FrontEnd/src/app/mod-general/menu/menu.component.html` y `menu.component.css`: renderizar una banda o tarjeta accesible, visualmente separada de `syncAlertDropdown` y posicionada sobre/junto a las aplicaciones, con icono y texto de estado. Aplicar amarillo para próximo vencimiento y rojo para vencido; mantener contraste legible, no interceptar el clic de las tarjetas y adaptarla a escritorio y móvil.
  3. Frontend — ownership `FrontEnd/src/app/mod-general/menu/menu.component.spec.ts`: ampliar los dobles de servicios y añadir pruebas de precedencia de Compañía, fallback Electronic, no llamada al binario para tipo diferente/missing, ausencia y error silenciosos, umbral exacto de 30 días, vencimiento y texto/color calculados. Conservar las pruebas de la alerta de sincronización como regresión independiente.
  4. Verificación integrada: ejecutar las pruebas unitarias dirigidas y el build Angular vigente. Comprobar manualmente que la alerta se muestra sin afectar la entrada a Administración, Restaurante, Punto de Venta, Logística, Cartera o Salir, ni el desplegable de `¡Información importante!`.
  5. Cambio solicitado durante pruebas DEV — ownership `FrontEnd/src/app/mod-general/menu/menu.component.ts`, `menu.component.html` y `menu.component.spec.ts`: si el PO aprueba la revisión, reconocer únicamente en `dev.saiopencloud.co` y `localhost` los parámetros `certificateAlertPreview=warning|expired`, renderizar el aviso con etiqueta visible `Vista de prueba` y salir antes de las consultas reales. Añadir pruebas de cada estado, de la ausencia de llamadas a Compañía/binario y de que un host distinto ignora el parámetro. No crear endpoint, persistencia, cambio de certificado, flag global ni comportamiento productivo.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni cambio de datos; no requiere backup ni canario de esquema. El cambio es autocontenido en el frontend. Para rollback, restaurar el build anterior del frontend o revertir únicamente las rutas atribuibles a este ticket; el fallo de la consulta ya queda degradado a ausencia de aviso, sin afectar navegación ni facturación.

## Criterios de aceptación

- [ ] POINT-001: la indicación de certificado se presenta junto a las tarjetas de aplicaciones, en escritorio y móvil, y no usa, altera ni abre el bloque `¡Información importante!` de órdenes pendientes.
- [ ] POINT-001: cuando `GET /api/dian/certificate/` entrega `valid_until` válido, la alerta usa exclusivamente esa fecha y no ejecuta `pos/consult_certificate`, aunque el tipo sea `Electronic`.
- [ ] POINT-001: sin certificado de Compañía, solo un `Setting.pos_setting.type_binario` exactamente `Electronic` habilita la consulta al binario y su `no_after`; para cualquier otro valor, configuración POS ausente, certificado ausente, formato inválido o error, no hay alerta ni llamada indebida al binario.
- [ ] POINT-001: una vigencia entre 0 y 30 días calendario muestra amarillo y el número correcto de días restantes; una fecha previa a hoy muestra rojo y los días correctos desde el vencimiento; una vigencia superior a 30 días no muestra aviso.
- [ ] POINT-001: el aviso no contiene archivo, contraseña, URL, bucket, llave ni otro secreto del certificado, conserva contraste y no bloquea clics ni la carga normal del menú.
- [ ] POINT-002: en `dev.saiopencloud.co` o `localhost`, `?certificateAlertPreview=warning` y `?certificateAlertPreview=expired` permiten a DEV/QA previsualizar cada tono con una etiqueta que identifique la simulación, sin consultar ni modificar certificados.
- [ ] POINT-002: el parámetro de previsualización se ignora fuera de los hosts permitidos; producción conserva exclusivamente la evaluación de certificados reales.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Advertir en el menú el vencimiento del certificado electrónico",
    "status": "closed",
    "severity": "high",
    "actual": "El menú principal solo muestra la alerta de pedidos pendientes y no informa el vencimiento del certificado. La consulta al binario puede ejecutarse sin verificar previamente que la integración sea Electronic.",
    "expected": "El menú muestra una alerta independiente junto a las aplicaciones únicamente cuando existe certificado y vence en 30 días o menos o ya venció. Prioriza el certificado almacenado en Compañía; solo consulta el binario si no existe certificado local y AdmSettingPos.type_binario es Electronic; en los demás casos no muestra alerta ni consulta el binario.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-007"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Habilitar previsualización reproducible de alertas de certificado para DEV y QA",
    "status": "closed",
    "severity": "normal",
    "actual": "En DEV el certificado vigente no activa ninguno de los estados visuales, y el certificado de Compañía y el binario coinciden; no existe una vía reproducible para validar los avisos amarillo y rojo sin alterar un certificado real.",
    "expected": "DEV y QA pueden solicitar de forma explícita una previsualización amarilla o roja sin consultar, modificar ni falsear certificados reales. Producción no expone esta previsualización.",
    "evidence": [
      "EVIDENCE-003"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-007"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-003",
    "title": "Reconocer previsualización en URLs con hash de Angular",
    "status": "closed",
    "severity": "normal",
    "actual": "La previsualización lee window.location.search, pero en la ruta Angular #/home?certificateAlertPreview=... el parámetro vive dentro de window.location.hash. Los enlaces publicados no activan el aviso.",
    "expected": "Los enlaces hash de Angular para warning y expired activan la previsualización en DEV sin consultar certificados; parámetros fuera de los hosts permitidos continúan ignorados.",
    "evidence": [
      "EVIDENCE-005"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-007"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-004",
    "title": "Separar lateralmente la alerta de certificado en móvil",
    "status": "closed",
    "severity": "low",
    "actual": "En la vista móvil la banda de alerta ocupa todo el ancho del contenedor y queda pegada a los bordes de la pantalla.",
    "expected": "En pantallas de hasta 767px, la alerta conserva una separación lateral uniforme respecto a los bordes sin alterar la grilla de aplicaciones ni el diseño de escritorio.",
    "evidence": [
      "EVIDENCE-007"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-007"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados:
  - `FrontEnd/src/app/mod-general/menu/menu.component.ts`: estado tipado de aviso, lectura priorizada de `getDianCertificate()`, fallback protegido a `PointOfSaleService.getCertificate()` y cálculo por fecha calendario.
  - `FrontEnd/src/app/mod-general/menu/menu.component.html`: banda informativa independiente y accesible antes de las tarjetas de aplicaciones.
  - `FrontEnd/src/app/mod-general/menu/menu.component.css`: variantes amarilla y roja con contraste y comportamiento responsive por flujo natural.
  - `FrontEnd/src/app/mod-general/menu/menu.component.spec.ts`: casos de regresión y bordes del flujo de certificado, incluida la previsualización autorizada para DEV/localhost.
- Decisiones técnicas:
  - `valid_until` de Compañía tiene precedencia absoluta sobre el binario; si existe fecha válida, no se consulta `pos/consult_certificate`.
  - El fallback solo se habilita con `Setting?.pos_setting?.type_binario === 'Electronic'`. Ausencia, error HTTP/JSON o fecha inválida termina silenciosamente sin impedir navegar.
  - Las fechas se interpretan como fecha calendario local al mediodía y se validan tras construirlas; se evita tanto el desfase UTC como la normalización de fechas imposibles de JavaScript.
  - El día de vencimiento se considera dentro del rango amarillo (`0` días) y una fecha anterior se muestra en rojo.
  - La previsualización se resuelve antes de cualquier consulta solamente si el host es `dev.saiopencloud.co` o `localhost`; sus dos valores están cerrados a `warning` y `expired`, agregan `Vista de prueba` y se ignoran en cualquier otro host.
  - La consulta de previsualización toma primero `location.search` y, para el hash routing de Angular, extrae la parte posterior a `?` de `location.hash`; así soporta `/#/home?certificateAlertPreview=...` sin enviar el parámetro al servidor.
  - En móvil (`max-width: 767px`) la alerta usa margen lateral de 12 px y conserva el margen inferior de 14 px; no se modificó la grilla móvil ni el estilo de escritorio.
- Compatibilidad preservada: no se cambió ningún endpoint, permiso, secreto, sincronización ni la alerta de órdenes pendientes. El componente continúa usando los contratos existentes `valid_until` y `no_after`; la nueva banda no captura clics de las tarjetas.
- Commits atribuibles al ticket:
  - `d311d8fc67498a582051ecd727262bf3e42bf13d` — agrega la alerta de vencimiento del certificado electrónico en el menú y sus pruebas.
  - `b3374616a9db6ac09e93ebb854e0bc6505b7538a` — incorpora la previsualización visual para DEV y QA.
  - `9da19f9dd4aaf0c2a998ee4afef5aadd80de8eab` — corrige la lectura del parámetro en rutas hash de Angular.
  - `c5fcdd1e1f0c3ea7856001702a87e4d9c70661de` — añade margen lateral a la alerta en móvil.
  - `95fcd36d` — registra el cierre funcional, QA aprobada y trazabilidad del ticket.

## Pruebas

- Comandos para el PO: ejecutar `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include='src/app/mod-general/menu/menu.component.spec.ts'` y `npx ng build FrontSaiOpenCloud`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: la prueba dirigida y el build terminan sin errores; los casos cubren prioridad de Compañía, fallback Electronic, no consulta para otros tipos, umbrales de 30 días, vencimiento, fecha imposible, ambas previsualizaciones DEV en rutas hash y la exclusión por host. Ejecución local: 11/11 pruebas exitosas y build de producción exitoso el 2026-09-09; Angular reportó tres selectores CSS omitidos durante la generación de índice, sin fallar la compilación.
- Validaciones manuales: en un tenant no productivo, comprobar por separado: certificado de Compañía a 30 días, certificado de Compañía vencido, certificado de Compañía a más de 30 días, ausencia de Compañía con Electronic y `no_after` próximo, ausencia de Compañía con tipo no Electronic y ausencia en ambas fuentes. Para la prueba visual reproducible en DEV, abrir `https://dev.saiopencloud.co/#/home?certificateAlertPreview=warning` y `https://dev.saiopencloud.co/#/home?certificateAlertPreview=expired`: confirmar tono, texto y etiqueta `Vista de prueba`; después abrir `https://dev.saiopencloud.co/#/home` sin parámetro y confirmar que se conserva el comportamiento real. En móvil (ancho <=767 px), confirmar que la banda conserva margen visible y uniforme a ambos lados, sin desalinear las tarjetas. Verificar cada vez la navegación de tarjetas y que el desplegable de pendientes conserva su comportamiento.
- Requisitos de ambiente o datos: usuarios autenticados de prueba; tenants no productivos que permitan configurar los escenarios sin registrar certificado, contraseñas ni URLs privadas en el ticket. Para fallback, un binario de prueba Electronic que responda un `no_after` controlado.
- Resultado comunicado por el PO: el PO confirmó que el despliegue en DEV está disponible, pero no puede validar visualmente los estados amarillo/rojo porque el certificado vigente no activa ninguna alerta y la fuente de Compañía y el binario coinciden. Solicita una vía reproducible para DEV y QA sin modificar certificados reales. En el retest de previsualización, los enlaces `/#/home?certificateAlertPreview=warning|expired` no mostraron el aviso y el navegador reportó un 504/contenido no disponible; el análisis local identificó que la previsualización no leía el query dentro de `location.hash`.
  Confirmación final del PO: el PO verificó en DEV las previsualizaciones `warning` y `expired`, confirmó que la alerta ya aparece y validó la separación lateral en la vista móvil; considera el ticket listo para cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-09",
    "build_reference": "commit:d311d8fc67498a582051ecd727262bf3e42bf13d",
    "environment": "DEV desplegado",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-09",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó que el despliegue está disponible en DEV, pero no puede validar visualmente las alertas porque el certificado vigente no activa los estados amarillo ni rojo; solicita una vía reproducible para DEV y QA."
  },
  {
    "id": "QA-003",
    "date": "2026-09-09",
    "build_reference": "commit:b3374616a9db6ac09e93ebb854e0bc6505b7538a",
    "environment": "DEV desplegado",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-09",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO verificó en DEV que los enlaces hash warning y expired no muestran la alerta y reportó 504/contenido no disponible."
  },
  {
    "id": "QA-005",
    "date": "2026-09-09",
    "build_reference": "commit:9da19f9d4e659e5e1de0a4c72b3f88d711ef4bb5",
    "environment": "DEV móvil desplegado",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-09-09",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó que la previsualización ya aparece en DEV y solicitó corregir el margen lateral de la banda en móvil."
  },
  {
    "id": "QA-007",
    "date": "2026-09-09",
    "build_reference": "commit:c5fcdd1e1f0c3ea7856001702a87e4d9c70661de",
    "environment": "DEV desplegado; validación visual escritorio y móvil",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-008",
    "date": "2026-09-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó en DEV que la alerta aparece en warning y expired, la navegación permanece operativa y la vista móvil conserva margen lateral."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-09",
    "kind": "automated-test",
    "description": "Prueba dirigida del menú: 8/8 casos exitosos para prioridad de Compañía, fallback Electronic, exclusión no Electronic, errores y fecha inválida.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-09",
    "kind": "build",
    "description": "npx ng build FrontSaiOpenCloud finalizó exitosamente el 2026-09-09; Angular informó tres selectores CSS omitidos durante index generation sin error de compilación.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-09",
    "kind": "automated-test",
    "description": "Prueba dirigida del menú: 11/11 casos exitosos, incluidos warning/expired en DEV, ausencia de llamadas reales durante la previsualización y bloqueo por host no autorizado.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-09",
    "kind": "build",
    "description": "npx ng build FrontSaiOpenCloud --configuration production finalizó exitosamente el 2026-09-09; Angular informó tres selectores CSS omitidos durante index generation sin error de compilación.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-09",
    "kind": "automated-test",
    "description": "Prueba dirigida del menú: 11/11 casos exitosos; warning y expired se verifican con location.hash equivalente a las URLs publicadas #/home?certificateAlertPreview=... .",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-09",
    "kind": "build",
    "description": "npx ng build FrontSaiOpenCloud --configuration production finalizó exitosamente el 2026-09-09 tras corregir la lectura de query desde location.hash.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-007",
    "date": "2026-09-09",
    "kind": "build",
    "description": "npx ng build FrontSaiOpenCloud --configuration production finalizó exitosamente el 2026-09-09 tras añadir margen lateral móvil de 12 px a la alerta.",
    "reference": null,
    "point_id": "POINT-004"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO verificó en DEV el comportamiento funcional y visual correspondiente, incluyendo previsualizaciones warning/expired y margen móvil."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-09",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO verificó en DEV el comportamiento funcional y visual correspondiente, incluyendo previsualizaciones warning/expired y margen móvil."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-09",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO verificó en DEV el comportamiento funcional y visual correspondiente, incluyendo previsualizaciones warning/expired y margen móvil."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-09",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO verificó en DEV el comportamiento funcional y visual correspondiente, incluyendo previsualizaciones warning/expired y margen móvil."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: alerta independiente en el menú con prioridad Compañía, fallback Electronic, cálculo calendario, previsualización segura y margen lateral móvil.
- Resultado comunicado por el PO: validado visualmente en DEV para warning/expired y móvil; navegación y bloque de pendientes conservados.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA-008 aprobada por confirmación explícita del PO; los cuatro puntos quedaron cerrados.
- Riesgo residual e impacto de release: sin cambios de datos, APIs, sincronización, migraciones ni Docker; permanece unreleased hasta PR `dev` → `production`.
- Texto visible al usuario cuando aplique: `El certificado electrónico vence en N día(s)` o `El certificado electrónico está vencido hace N día(s)`; previsualización incluye `Vista de prueba`.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-09",
    "technical_summary": "Implementación frontend con precedencia del certificado de Compañía, fallback Electronic controlado, cálculo calendario, previsualización segura DEV/localhost y margen responsive móvil.",
    "functional_summary": "El menú muestra alerta independiente amarilla hasta 30 días y roja al vencer; permite validar warning/expired en DEV y mantiene navegación y pendientes de facturación sin cambios.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó la validación visual y funcional final en DEV y autorizó cerrar el ticket.",
    "release_impact": "Sin impacto de migraciones, Docker o sincronización. El ticket queda cerrado funcionalmente y unreleased hasta formar parte de una release mediante PR dev -> production."
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
- Tickets relacionados: FEATURE-SUPERADMIN-CERTIFICADOS-DIAN-20260831

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-09",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-09",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-09",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-09",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-09",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-09",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-09",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-09",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-09",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-09",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-09",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-09",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-056",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-057",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-058",
    "date": "2026-09-09",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-008 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-059",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-060",
    "date": "2026-09-09",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-061",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-062",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-063",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
