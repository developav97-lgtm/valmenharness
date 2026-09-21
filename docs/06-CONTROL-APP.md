# 06 — Mission Control: la app de control

El pedido: _"quiero que hagamos una app de control, puede ser con node o lo que me
recomiendes. La idea sería que corriera como este harness de deepseek que corre en
localhost y que aquí tengamos la app web de control: que podamos ver la configuración,
cambiarla manualmente o por chat, que lleve sus conversaciones, poder ver los tickets,
revisarlos y demás, ver estados como si fuera un mission control bien bonito y moderno.
También se puedan configurar los proveedores, poder ejecutar selección de modelos y
esfuerzo o automático según el proceso."_

## 1. Decisión de arquitectura

**Una app web que corre en localhost, servida por el mismo binario del CLI.**

```bash
valmen serve                 # → http://127.0.0.1:4173 (puerto libre autodetectado)
valmen serve --port 4173 --open
```

Razones de esta forma y no una app de escritorio:

| Criterio                               | Web en localhost                 | Escritorio (Electron/Tauri)    |
| -------------------------------------- | -------------------------------- | ------------------------------ |
| Reutiliza el motor                     | Sí, mismo proceso Node           | Necesita IPC o un sidecar      |
| Acceso desde el celular                | Sí (en la red local o por túnel) | No                             |
| Actualización                          | Un `npm i -g valmen@latest`      | Rebuild y firma por plataforma |
| Superficie de código                   | Una                              | Una por SO                     |
| `localhost` como frontera de confianza | Sí, igual que DSH                | Igual                          |

Se adopta la misma frontera de confianza que DSH: el servidor escucha **solo en
`127.0.0.1`**, y expone el estado con un token de proceso convertido en cookie firmada. Para
acceso remoto (celular), no se abre el puerto: se usa un túnel o el puente de Hermes.

## 2. Las pantallas

### 2.1 Mission Control (inicio)

La vista que responde "¿qué está pasando?" en tres segundos.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ValmenHarness · SaiOpenCloud                          ▼ balanced   ⚙  👤   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌── EN CURSO ──────────────────┐  ┌── REQUIERE TU DECISIÓN ──────────────┐ │
│  │ ● FEATURE-INVENTARIO-API     │  │ ⚠  2 gates esperando aprobación      │ │
│  │   implement · 47m · $0.82    │  │    · plan(BUGFIX-POS-FILTRO)         │ │
│  │   ████████████░░░░░  62%     │  │      Jev: 0.58 banda media           │ │
│  │                              │  │    · deploy v1.42.0                  │ │
│  │ ● BUGFIX-RESTAURANTE-CAJA    │  │      frase requerida                 │ │
│  │   analyze · 3m · $0.04       │  │                          [Revisar →] │ │
│  │   ███░░░░░░░░░░░░░░   9%     │  └──────────────────────────────────────┘ │
│  └──────────────────────────────┘                                           │
│                                                                             │
│  ┌── FEATURES ─────────────────────────────────────────────────────────────┐│
│  │ modulo-inventario    in_progress    S1 2/2  S2 1/3  S3 0/1     6 tickets ││
│  │ cierre-multisucursal complete       ───────────────────────    4 tickets ││
│  │ diAN-getacquirer     blocked        falta decisión de proveedor  1 tkt  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌── HOY ───────────────────────┐  ┌── COSTO ─────────────────────────────┐ │
│  │ 4 tickets cerrados           │  │ hoy      $3.41   ████████░░░░  (17%) │ │
│  │ 2 gates automáticos aprobados│  │ mes     $61.20   ██████░░░░░░  (61%) │ │
│  │ 1 gate escalado a humano     │  │ gates   $0.0004  (0.01% del total)   │ │
│  │ 1 bloqueo: credencial AWS    │  │ proyección mes  $98  ⚠ sobre $80     │ │
│  └──────────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                             │
│  ┌── ACTIVIDAD EN VIVO ────────────────────────────────────────────────────┐│
│  │ 14:41  gate.plan      approve  0.94  FEATURE-INVENTARIO-API   $0.00014  ││
│  │ 14:39  commit         a3f1c9d   FEATURE-INVENTARIO-API                  ││
│  │ 14:36  tool.codegraph impact   12 archivos   (0 tokens)                 ││
│  │ 14:32  gate.plan      review   0.58  BUGFIX-POS-FILTRO  → humano        ││
│  │ 14:28  ticket.created         BUGFIX-RESTAURANTE-CAJA                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Tickets

Lista con filtros por estado, tipo, módulo, impacto y responsable. Vista de detalle con
todas las secciones del ticket canónico renderizadas, y las acciones disponibles según el
estado actual (no aparece un botón que el motor va a rechazar).

```
┌─ FEATURE-INVENTARIO-API-20260921 ───────────────────────────────────────────┐
│ FEATURE · inventario · in_progress · riesgo normal · unreleased             │
│ Feature: modulo-inventario  ·  Sprint S1  ·  depende de: MODELO             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Solicitud │ Descripción │ Diagnóstico │ Plan │ Criterios │ Puntos │ … │ ⏱   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ## Plan                                                       [editar ✎]   │
│  Aprobado por gate `plan` el 2026-09-21 14:41 (recibo GR-…-0007)            │
│                                                                             │
│  1. Crear modelos MovimientoInventario y SaldoInventario con índices…       │
│  2. Endpoint POST /api/inventario/movimientos/ con validación…              │
│  3. Registrar en OfflineSync con natural key (sucursal, producto, fecha)…   │
│  …                                                                          │
│                                                                             │
│  ── RECIBO DEL GATE ──────────────────────────────────────────────────────  │
│  calculo:  cubre_todos_los_criterios  0.96 ✓                                │
│            corresponde_a_la_investigacion  0.93 ✓                           │
│            pasos_ejecutables  0.91 ✓                                        │
│            criterios_verificables  0.94 ✓                                   │
│            compatibilidad_hacia_atras  0.92 ✓     (sync_impact: true)       │
│  modelo:   typesafe/jev-1.13-20260917 · 412 ms · $0.000135                  │
│  checks:   4 mecánicos pasaron, 1 aviso (412 líneas estimadas)              │
│                                              [ver estado congelado 🔍]      │
│                                                                             │
│  ── PUNTOS ────────────────────────────────────────────────────────────────  │
│  POINT-001  closed      El endpoint no valida unidades negativas            │
│  POINT-002  in_progress El movimiento no se registra en la cola de sync     │
│                                                                             │
│  ── CONSUMO DE IA ─────────────────────────────────────────────────────────  │
│  $0.82 · 412k in / 38k out · implementer (deepseek-v4-flash) 71%            │
│                            architect (opus-4.6) 28%                         │
│                            gates (jev-1.13) 0.02%                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Ejecutar QA mecánica] [Entregar a pruebas del PO] [Ver diff] [Conversación]│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Features

Vista de la feature grande, con el grafo de tickets y el seguimiento de cobertura.

```
┌─ modulo-inventario ─────────────────────────────────────────────────────────┐
│ in_progress · spec v3 (2 deltas) · 6 tickets · $4.12 acumulado              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ESPECIFICACIÓN                                                             │
│  requisitos 14 · cubiertos 14 · verificados 9 · gaps 0 ✓                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ R1  Registro de movimientos          ✓ verificado   [API, MODELO]     │  │
│  │ R2  Saldo por sucursal               ✓ verificado   [API]             │  │
│  │ R3  Aprobación de ajustes            ◐ en curso     [API]             │  │
│  │ R4  Reporte de kardex                ○ pendiente    [REPORTES]        │  │
│  │ …                                                                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  PLAN DE EJECUCIÓN                                          [reordenar ⇅]   │
│                                                                             │
│   S1 · Modelo de datos y API de movimientos                                 │
│    ✓ FEATURE-INVENTARIO-MODELO    closed      $1.02                         │
│    ● FEATURE-INVENTARIO-API       in_progress $0.82  ████████░░ 62%         │
│                                                                             │
│   S2 · Pantallas de consulta                                                │
│    ○ FEATURE-INVENTARIO-PANTALLA-SALDOS   pending  (depende de: API)        │
│    ○ FEATURE-INVENTARIO-PANTALLA-MOVIMIENTOS  pending                       │
│    ○ FEATURE-INVENTARIO-PANTALLA-AJUSTES  pending                           │
│                                                                             │
│   S3 · Reportes                                                             │
│    ○ FEATURE-INVENTARIO-REPORTES   pending  (depende de: PANTALLA-SALDOS)   │
│                                                                             │
│  ── HUECOS Y CAMBIOS ─────────────────────────────────────────────────────  │
│  + 2026-09-24  delta v3: se agregó R14 "exportable a Excel"                 │
│      → ticket nuevo propuesto: FEATURE-INVENTARIO-EXPORTABLE                │
│      → impacto en S1: ninguno   [aceptar] [descartar]                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Agregar requisito] [Descomponer de nuevo] [Simular sprint] [Archivar]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Gate en revisión (la pantalla más importante)

Cuando un gate escala a humano, esta pantalla es la que decide si el sistema es confiable.
Muestra **exactamente** lo que vio el modelo, con las probabilidades, y permite discrepar.

```
┌─ GATE: plan ─────────────────────────────────────────── FEATURE-INVENTARIO-API│
│ Escalado a humano · Jev no alcanzó el umbral en 1 de 5 proposiciones        │
├─────────────────────────────────────────────────────────────────────────────┤
│  RESULTADO AUTOMÁTICO                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ cubre_todos_los_criterios        0.58  ⚠ EN BANDA (necesita ≥0.90)      ││
│  │   peso 3 · la proposición con más peso del gate                         ││
│  │ corresponde_a_la_investigacion   0.93  ✓                                ││
│  │ pasos_ejecutables                0.91  ✓                                ││
│  │ criterios_verificables           0.94  ✓                                ││
│  │ compatibilidad_hacia_atras       0.92  ✓                                ││
│  │ clasificación: falta_alcance (0.44) vs completo (0.31)                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ¿POR QUÉ DUDA?  El criterio "El kardex muestra el saldo inicial y final por│
│  fecha" no aparece en ningún paso del plan.                                  │
│                                                                             │
│  ┌── ESTADO QUE VIO EL MODELO ────────────────────────────── [expandir 🔍] ┐│
│  │ solicitud · investigación · plan · criterios · reglas · diff            ││
│  │ sha256:9c2e… · 14.2 KB · congelado 14:32:07                             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌── TU DECISIÓN ──────────────────────────────────────────────────────────┐│
│  │  [ ✓ Aprobar ]   [ ✗ Rechazar con motivo ]   [ ↻ Devolver al agente ]   ││
│  │                                                                         ││
│  │  Aprobar esta vez:  ○ solo este ticket   ○ y promover el gate a auto    ││
│  │  Motivo (opcional, queda en el recibo):                                 ││
│  │  ┌───────────────────────────────────────────────────────────────────┐  ││
│  │  │ El criterio del kardex es de S3 (REPORTES), no de este ticket.    │  ││
│  │  └───────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ── HISTORIAL DE ESTA PROPOSICIÓN ────────────────────────────────────────  │
│  última 20 evaluaciones: 17× ≥0.90 · 3× banda media (todas aprobadas)       │
│  → Sugerencia: si el criterio de S3 se excluye del estado, esta proposición │
│    sube a ~0.95 y el gate pasa a auto.               [aplicar sugerencia]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

El "↻ Devolver al agente" cierra el bucle: el motivo se anexa al ticket y el agente
reintenta. **Exactamente un reintento correctivo**, como en el patrón gatekeeper: si el
segundo intento vuelve a fallar, el sistema para y no entra en bucle.

### 2.5 Conversaciones

El historial de sesiones, con la misma disciplina que DSH: log append-only, proyección
derivada, y posibilidad de reanudar o bifurcar.

```
┌─ Conversaciones ────────────────────────────────────────────────────────────┐
│ 🔍 buscar…                                        [nueva] [por ticket ▾]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ ● FEATURE-INVENTARIO-API · implementación del endpoint                     │
│   14:41 · 47m · deepseek-v4-flash · $0.82 · 38 mensajes                    │
│   └ vinculada al ticket · 2 subagentes · 14 llamadas a tools               │
│                                                                             │
│ ○ Análisis del error de sincronización en caja                             │
│   ayer 18:02 · 12m · opus-4.6 · $0.31 · 9 mensajes                         │
│                                                                             │
│ ○ [subagente] explorer · mapa de dependencias de inventario                 │
│   ayer 14:22 · 2m · glm-4.7-flash · $0.01 · 4 mensajes                     │
│                                                                             │
│ ○ [gate] plan · evaluación automática                                       │
│   ayer 14:20 · 412ms · jev-1.13 · $0.0001 · 5 preguntas                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Dentro de una conversación: árbol de turnos, llamadas a tools colapsables con su entrada y
salida, el diff de cada edición, y el costo acumulado. Se puede **reanudar** (continúa la
sesión) o **bifurcar** (nueva rama desde un turno, sin tocar el original).

### 2.6 Configuración

Todo lo que hoy está en archivos, editable con formularios **y** con el editor de texto
crudo, con un diff antes de guardar.

```
┌─ Configuración ─────────────────────────────────────────────────────────────┐
│ [General] [Gates] [Routing] [Proveedores] [Modelos] [Procesos] [Skills]     │
│ [Plugins] [Adaptadores] [Permisos] [Presupuestos] [Avanzado]                │
├─────────────────────────────────────────────────────────────────────────────┤
│  GATES                                                                      │
│  ┌────────────────┬──────────┬─────────────┬──────────┬───────────────────┐ │
│  │ Gate           │ Modo     │ Evaluador   │ Umbral   │ Últimas 30        │ │
│  ├────────────────┼──────────┼─────────────┼──────────┼───────────────────┤ │
│  │ intake         │ auto ▾   │ —           │ —        │ 30✓ 0✗ 0⚠        │ │
│  │ analysis       │ hybrid ▾ │ jev ▾       │ .90/.10  │ 24✓ 3✗ 3⚠        │ │
│  │ plan           │ hybrid ▾ │ jev ▾       │ .90/.10  │ 23✓ 4✗ 3⚠        │ │
│  │ qa             │ human  ▾ │ —           │ —        │ —                 │ │
│  │ deploy         │ human 🔒 │ —           │ —        │ —                 │ │
│  └────────────────┴──────────┴─────────────┴──────────┴───────────────────┘ │
│                                                                             │
│  plan.yaml                                        [formulario] [texto]      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ id: plan                                                                ││
│  │ mode: hybrid                     ← cambia a auto si la precisión ≥98%   ││
│  │ evaluation:                                                             ││
│  │   evaluator: jev                                                        ││
│  │   questions:                                                            ││
│  │     - id: cubre_todos_los_criterios                                     ││
│  │       weight: 3                                                         ││
│  │ …                                                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ── PROBAR ANTES DE GUARDAR ───────────────────────────────────────────────  │
│  [▶ Simular sobre los últimos 30 tickets]   →  ver §9 de 03-GATES.md        │
│                                                                             │
│  ┌─ DIFF ──────────────────────────────────────────────────────────────────┐│
│  │ - mode: hybrid                          [Guardar] [Guardar y sincronizar]│
│  │ + mode: auto                                                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6bis Requisito: la configuración de proveedores vive en la app, no en archivos

**Requisito explícito del usuario**, y con razón: _"me parece tedioso tener que agregar las
API keys por allá y que toque estar ejecutando comandos. Eso debería poder cambiarse desde la
app web: ir a Configuración → Proveedores y actualizar ahí."_

El flujo objetivo, sin tocar un archivo ni un comando:

```
Configuración → Proveedores → [ + Agregar proveedor ]

  Proveedor    [ OpenRouter            ▾ ]
  Clave        [ ••••••••••••••••••••  ]  [ Probar conexión ]
  Estado       ● verificada · 446 modelos · $0.00 este mes

  Proveedor    [ DeepSeek              ▾ ]
  Clave        [ ••••••••••••••••••••  ]  [ Probar conexión ]
  Estado       ○ sin verificar
```

Lo que la pantalla debe hacer bien:

| Requisito                                                     | Por qué                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Probar conexión** antes de guardar                          | Una clave mal pegada debe fallar en la pantalla, no en la mitad de un gate. |
| **Nunca mostrar la clave** después de guardarla               | El campo se vacía al guardar y solo se puede reemplazar, no leer.           |
| **Botón de rotación**                                         | Rotar una clave no debería requerir recordar dónde vive el archivo.         |
| **Distinguir suscripción de API key**                         | Un token de plan (Claude, Codex, opencode) se lee del CLI; no se pega.      |
| **Verificar contra el endpoint real**                         | El estado de OpenRouter se prueba con una llamada, no con un `ping`.        |
| **Escribir en `~/.valmen/.credentials.yaml` con `chmod 600`** | La app es una interfaz sobre el archivo, no un almacén paralelo.            |

**Consecuencia de diseño:** el archivo de credenciales deja de ser la superficie de uso y pasa
a ser un detalle de implementación. Nadie debería tener que saber que existe.

Esta pantalla es requisito de la **Fase 4 (Mission Control)** y es la primera que hay que
construir, porque sin ella cada prueba de proveedor exige abrir un archivo y exportar una
variable.

### 2.7 Proveedores y modelos

```
┌─ Proveedores ───────────────────────────────────────────────────────────────┐
│  ┌──────────────┬──────────────┬──────────────┬─────────┬─────────────────┐ │
│  │ Proveedor    │ Auth         │ Estado       │ Modelos │ Costo mes       │ │
│  ├──────────────┼──────────────┼──────────────┼─────────┼─────────────────┤ │
│  │ OpenRouter   │ API key      │ ● activo     │ 446     │ $52.18          │ │
│  │ Claude Code  │ OAuth (plan) │ ● activo     │ 4       │ incluido        │ │
│  │ Codex        │ OAuth (plan) │ ● activo     │ 5       │ incluido        │ │
│  │ opencode zen │ token        │ ● activo     │ 12      │ incluido        │ │
│  │ DeepSeek     │ API key      │ ○ sin clave  │ 6       │ —               │ │
│  │ Moonshot     │ API key      │ ● activo     │ 4       │ $8.90           │ │
│  │ Zhipu (GLM)  │ API key      │ ● activo     │ 3       │ $2.10           │ │
│  │ Ollama local │ ninguna      │ ● activo     │ 7       │ $0              │ │
│  │ TypeSafe Jev │ API key (OR) │ ● activo     │ 1       │ $0.09           │ │
│  └──────────────┴──────────────┴──────────────┴─────────┴─────────────────┘ │
│                                                    [+ agregar proveedor]    │
│                                                                             │
│  ── ROUTING · preset activo: balanced ──────────────  [quality] [economy]   │
│  ┌──────────────────┬───────────────────────────────┬──────────┬─────────┐ │
│  │ Rol              │ Modelo                        │ Esfuerzo │ Costo   │ │
│  ├──────────────────┼───────────────────────────────┼──────────┼─────────┤ │
│  │ orchestrator     │ claude-opus-4.6      ▾        │ medium ▾ │ $4.20   │ │
│  │ architect        │ claude-opus-4.6      ▾        │ high   ▾ │ $7.11   │ │
│  │ implementer      │ deepseek-v4-flash    ▾        │ auto   ▾ │ $18.42  │ │
│  │ explorer         │ glm-4.7-flash        ▾        │ auto   ▾ │ $3.98   │ │
│  │ gate-evaluator   │ typesafe/jev-1.13  🔒 ▾       │ —        │ $0.09   │ │
│  │ gate-judge       │ deepseek-v3.2        ▾        │ medium ▾ │ $0.61   │ │
│  └──────────────────┴───────────────────────────────┴──────────┴─────────┘ │
│                                                                             │
│  🔒 gate-evaluator usa Jev por defecto porque emite probabilidades en vez de │
│     texto: el gate son comparaciones numéricas que controla el código, no    │
│     otro prompt que hay que parsear. Cuesta $0.00003 por verificación.       │
│     Es configurable, pero si lo cambias el gate pierde reproducibilidad.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. El agente de configuración por chat

Este es el requisito más ambicioso del pedido: _"que se pueda configurar por medio de texto
como aquí en el chat, diciéndole al llm principal que quiere y que lo configure"_.

### 3.1 El problema de seguridad, resuelto primero

Un agente que edita su propia configuración puede ampliar su propia autoridad. Eso es
inaceptable. Tres reglas:

1. **El agente propone, el humano dispone.** Nunca escribe configuración directamente.
   Genera un _change set_ (un diff en memoria) que se muestra y se aprueba.
2. **Ciertos cambios requieren una segunda confirmación explícita**, aunque el humano ya
   haya aprobado el diff: cambiar un gate de `human` a `auto`, cambiar el evaluador de un
   gate, modificar presupuestos, habilitar un proveedor nuevo, o tocar permisos.
3. **Todo cambio de configuración es un ticket `CHORE`** con su recibo. El historial de por
   qué se cambió un gate está a un clic.

### 3.2 El flujo

```
┌─ Configurar por chat ───────────────────────────────────────────────────────┐
│                                                                             │
│  Tú: quiero que los tickets de tipo DOCS no pidan aprobación de plan, y que  │
│      los de SECURITY siempre la pidan aunque el riesgo sea bajo. Además,     │
│      sube el presupuesto por feature a 80 dólares.                           │
│                                                                             │
│  Agente: Entendido. Son tres cambios de configuración:                       │
│                                                                             │
│  1. gates/plan.yaml → applies_to.ticket_types                               │
│     Cambio: DOCS sale de la lista (nunca pedía gate por tipo, pero estaba    │
│     heredando el default de IMPROVEMENT). SECURITY ya estaba.               │
│                                                                             │
│  2. gates/plan.yaml → override de tipo SECURITY                             │
│     Nuevo:                                                                  │
│       SECURITY: { mode: human, escalate_after_rejections: 0 }               │
│     Efecto: un ticket SECURITY nunca aprueba automáticamente su plan,       │
│     sin importar la confianza de Jev.                                       │
│                                                                             │
│  3. config.yaml → budgets.per_feature.hard                                  │
│     Cambio: 60.00 → 80.00 USD                                               │
│     ⚠ Esto sube el techo de gasto automático de una feature de $60 a $80.   │
│                                                                             │
│  ┌─ DIFF ──────────────────────────────────────────────────────────────────┐│
│  │ .valmen/gates/plan.yaml                                                 ││
│  │   applies_to:                                                           ││
│  │ -   ticket_types: [FEATURE, SYNC, INTEGRATION, AGENT, SECURITY,         ││
│  │ -                  IMPROVEMENT]                                         ││
│  │ +   ticket_types: [FEATURE, SYNC, INTEGRATION, AGENT, SECURITY]         ││
│  │ + overrides:                                                            ││
│  │ +   SECURITY: { mode: human, escalate_after_rejections: 0 }             ││
│  │                                                                         ││
│  │ .valmen/config.yaml                                                     ││
│  │   budgets:                                                              ││
│  │     per_feature:                                                        ││
│  │ -     hard: 60.00                                                       ││
│  │ +     hard: 80.00                                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ⚠ El cambio 3 requiere confirmación adicional (modifica un presupuesto).    │
│    Escribe "SUBO PRESUPUESTO A 80" para confirmarlo, o dime que lo omita.    │
│                                                                             │
│  [Aplicar 1 y 2]  [Aplicar todo]  [Editar a mano]  [Cancelar]               │
│                                                                             │
│  ── El ticket CHORE-AGENTIC-CONFIG-GATES-20260921 registrará este cambio ── │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Alcance del agente de configuración

Puede configurar:

- Definiciones de gates: proposiciones, umbrales, pesos, modos, condicionales.
- Routing: rol → modelo, esfuerzo, presets, budgets.
- Procesos: pasos, encadenamientos, gates, condicionales.
- Skills y agentes: crear, editar, mejorar.
- Proveedores: añadir, probar conectividad, verificar capacidades.
- Reglas del proyecto: extraer de la documentación existente.
- Adaptadores: qué agentes se sincronizan y con qué formato.

**No puede**, bajo ninguna configuración: modificar sus propios permisos de ejecución,
deshabilitar el registro de recibos, cambiar la lista de acciones que nunca se automatizan,
ni alterar el contrato de gates humanos obligatorios (deploy, release, security, migration).

## 4. Arquitectura técnica de la app

```
┌───────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (React 19 + Vite + Tailwind 4)                                 │
│                                                                           │
│  Módulos cliente (mismo patrón que DSH: cada pantalla es un plugin)       │
│  ┌────────────┬────────────┬────────────┬────────────┬─────────────────┐  │
│  │ mission    │ tickets    │ features   │ gates      │ config          │  │
│  ├────────────┼────────────┼────────────┼────────────┼─────────────────┤  │
│  │ chat       │ providers  │ usage      │ processes  │ plugins         │  │
│  └────────────┴────────────┴────────────┴────────────┴─────────────────┘  │
│                              │                                            │
│                     conexión tipada (RPC + SSE)                           │
└──────────────────────────────┼────────────────────────────────────────────┘
                               │  http://127.0.0.1:4173
┌──────────────────────────────┼────────────────────────────────────────────┐
│  SERVIDOR (Hono sobre Node)  ▼                                            │
│                                                                           │
│  /api/rpc      invocación tipada (Zod valida argumentos y resultado)      │
│  /api/events   SSE: cambios de estado en vivo (index revisado, no polling)│
│  /api/stream   streaming de conversación                                  │
│  /            estáticos del frontend (build de Vite)                      │
│                                                                           │
│  Controladores:  ticketController · featureController · gateController    │
│                  configController · providerController · usageController  │
│                  processController · chatController                       │
│                       │                                                   │
│                       ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  @valmen/engine   — el mismo motor que usa el CLI                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

**Punto clave de diseño:** la app web **no tiene lógica de negocio**. Todos los
controladores llaman al motor. Esto garantiza que lo que ves en la web y lo que hace el
agente por CLI sean la misma cosa, con las mismas validaciones y los mismos gates. Si el
botón "Aprobar" y `valmen gate approve` divergieran, el sistema sería una mentira.

### 4.1 Actualización en vivo

El servidor observa `.valmen/` y los artefactos con `chokidar`. Cuando algo cambia
(porque tú lo editaste a mano, porque corrió un proceso, o porque un agente escribió):

```
fs change → invalidar caché del artefacto → recalcular proyección afectada
         → emitir evento SSE tipado → el módulo cliente actualiza su store
```

Sin polling. Y como el índice es derivado y reconstruible, un cambio externo nunca deja la
UI inconsistente: se recalcula.

### 4.2 Concurrencia y conflictos

Escenario real: la web abierta, un agente por CLI trabajando, y un proceso en background.

- Toda escritura pasa por el motor con **compare-and-set por revisión**. Si el archivo
  cambió desde que lo leíste, la escritura falla con `REVISION_CONFLICT` y te muestra el
  conflicto, en vez de pisar el cambio del agente.
- Las escrituras son atómicas (temp + fsync + rename). Nunca hay un archivo a medias.
- Un aviso visible en la UI cuando hay un agente trabajando en un ticket que estás editando.

## 5. Integración con Hermes (control desde el celular)

El pedido: _"mirar integraciones con hermes agent para poder tener control desde el celular
o que se integren funcionalidades entre los dos"_.

### 5.1 Qué es Hermes realmente (verificado)

Hermes Agent es el agente de Nous Research: **terminal-native**, autónomo, con memoria
persistente, skills creadas por el propio agente, y —lo importante para nosotros— un
**messaging gateway que soporta 21+ plataformas**: Telegram, Discord, Slack, WhatsApp,
Signal, SMS, Matrix, entre otras.

Detalles relevantes para la integración:

| Aspecto                | Cómo funciona                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Secretos               | `~/.hermes/.env` (separado de la configuración)                                           |
| Configuración          | `~/.hermes/config.yaml`                                                                   |
| Proveedores            | Múltiples, incluido OpenRouter con `OPENROUTER_API_KEY`                                   |
| Routing de proveedor   | `provider_routing: { sort: price\|throughput\|latency, data_collection: deny }`           |
| Fallback               | `fallback_providers:` — cadena que cambia de modelo a mitad de sesión sin perder contexto |
| **Modelos auxiliares** | `auxiliary: { title, vision, compression }` → modelos baratos para tareas laterales       |
| Router de costo        | `openrouter/pareto-code` con `min_coding_score` — el más barato que supere el umbral      |

**La consecuencia de diseño más importante:** no hay que construir un gateway de mensajería.
Hermes ya tiene 21+. Lo que hay que construir es el **puente MCP** para que Hermes pueda
operar el harness, y el **webhook** para que el harness pueda empujarle notificaciones.

Nótese además que la idea de "modelos auxiliares" de Hermes es exactamente nuestro concepto
de roles de routing (ver [`04-PROVEEDORES.md` §4](04-PROVEEDORES.md#4-routing-modelo-por-rol-no-por-capricho)).
Son diseños convergentes: la conclusión de que el modelo caro debe reservarse para el
razonamiento y los modelos baratos para las tareas laterales es la misma a la que llegamos
por otro camino.

### 5.2 El modelo de integración

La integración útil tiene **dos direcciones**, y la segunda es la valiosa:

**Dirección 1 — Tú → ValmenHarness (consulta y control desde el celular)**

Hermes se conecta como **cliente MCP** al servidor que expone ValmenHarness.

```
Tú (Hermes en el celular): "¿en qué va el módulo de inventario?"

Hermes → valmen MCP → feature.status(modulo-inventario)
       ← { status: in_progress, requisitos: 14/14, tickets: 4/6,
           siguiente: FEATURE-INVENTARIO-PANTALLA-SALDOS,
           bloqueo: null, costo: $4.12 }

Hermes: "El módulo de inventario está en progreso: 14 de 14 requisitos
         cubiertos, 4 de 6 tickets cerrados. Sigue la pantalla de saldos.
         Sin bloqueos. Lleva $4.12 de $80 de presupuesto."
```

**Dirección 2 — ValmenHarness → Tú (los gates llegan al celular)** ← **la importante**

Un gate humano solo sirve si el humano está disponible. Si el humano está en una reunión o
en la calle, el gate se convierte en un cuello de botella y el equipo empieza a buscar cómo
saltárselo. La solución es llevar el gate donde está la persona.

```
┌─ Telegram / WhatsApp / Slack / Signal (vía el gateway de Hermes) ───────────┐
│                                                                             │
│  ⚠ GATE PENDIENTE · plan                                                    │
│  Ticket: FEATURE-INVENTARIO-API-20260921                                    │
│  Sprint S1 · modulo-inventario · FEATURE · riesgo normal                    │
│                                                                             │
│  El plan propone 4 pasos para el endpoint de movimientos.                   │
│                                                                             │
│  Jev evaluó 5 proposiciones:                                                │
│    ✓ cubre todos los criterios          0.96                                │
│    ✓ corresponde a la investigación     0.93                                │
│    ✓ pasos ejecutables                  0.91                                │
│    ⚠ criterios verificables             0.72  ← banda media                 │
│    ✓ compatibilidad hacia atrás         0.92                                │
│                                                                             │
│  Motivo del escalado: el criterio de verificación del paso 3 es subjetivo.  │
│                                                                             │
│  Costo de esta evaluación: $0.00014                                         │
│                                                                             │
│  [ ✅ Aprobar ]   [ ❌ Rechazar ]   [ 📄 Ver el plan completo ]              │
│                                                                             │
│  Enlace válido por 24h · token de un solo uso                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Arquitectura del puente

```
ValmenHarness  ──servidor MCP──▶  Hermes (celular)  ──▶ Telegram, WhatsApp,
      ▲                            agente + gateway       Slack, Signal, SMS…
      │                                 │
      │                                 │ el humano pulsa ✅
      │                                 ▼
      └──── webhook firmado ◀── callback con token HMAC de un solo uso
                    │
                    ▼
          valmen gate approve <id> --token <token>
```

Componentes:

1. **`valmen mcp`** — servidor MCP que expone el motor: `ticket_list`, `ticket_show`,
   `feature_status`, `gate_list_pending`, `gate_approve`, `gate_reject`, `usage_report`,
   `process_run`. Es lo que permite que _cualquier_ cliente MCP (Hermes, Claude, Codex,
   opencode, Cursor) consulte y opere el harness.
2. **`@valmen/plugin-hermes`** — dos capacidades:
   - **Salida:** envía la notificación del gate a Hermes, que la distribuye por el canal
     configurado. El plugin no habla con Telegram directamente: delega en Hermes, que ya
     resolvió 21 plataformas.
   - **Entrada:** recibe el callback del botón, **verifica la firma HMAC** y ejecuta el
     comando del motor. El token codifica `{gate, sujeto, revisión, expiración}` y es de un
     solo uso, así que no se puede aprobar algo distinto de lo que se notificó, ni aprobar
     dos veces, ni reusar un token viejo tras un cambio en el ticket.
3. **Configuración** (`~/.valmen/config.yaml` del proyecto o global):
   ```yaml
   hermes:
     enabled: true
     endpoint: http://127.0.0.1:PORT/hermes # o el que use tu instancia
     notify_on:
       gate_review: [telegram]
       gate_blocked: [telegram]
       budget_soft: [telegram]
       process_failed: [telegram]
       run_completed: [] # silencioso; solo en el Mission Control
     approval:
       allowed_risk: [low, normal] # NUNCA high ni critical
       token_ttl: 24h
       single_use: true
   ```
4. **Regla de seguridad dura:** por el celular **solo se pueden aprobar o rechazar gates de
   riesgo `low` y `normal`**. Los gates críticos (deploy, migration, security, release,
   force-push) **solo se aprueban desde la máquina**, porque requieren frase literal escrita
   y ver el diff completo. El motor lo hace cumplir: un token emitido para un gate crítico no
   se emite nunca, aunque el plugin esté mal configurado. Esto evita que un celular perdido
   sea un vector de deploy.

### 5.4 Qué se delega a Hermes y qué no

| Tarea                                       | ¿Hermes?          | Razón                                                                       |
| ------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| Consultar estado de tickets y features      | **Sí**            | Read-only, valor alto desde el celular.                                     |
| Aprobar/rechazar gates de riesgo bajo       | **Sí**            | Desbloquea el flujo sin abrir el portátil.                                  |
| Recibir notificaciones de bloqueos y fallos | **Sí**            | Convierte un bloqueo silencioso en uno visible.                             |
| Lanzar un proceso desde el celular          | **Sí, con gate**  | `valmen process run` exige que el proceso sea de riesgo bajo o medio.       |
| Aprobar un deploy                           | **No**            | Frase literal desde la máquina. Regla dura.                                 |
| Editar configuración                        | **No**            | Requiere ver el diff; el chat de configuración vive en la app.              |
| Ejecutar código                             | **No**            | El harness no es un sandbox remoto.                                         |
| Ser el canal de mensajería                  | **Sí, es su rol** | En lugar de que el harness integre Telegram, Slack y WhatsApp por separado. |

### 5.5 Lo que gana el harness al no reimplementar mensajería

Al delegar el transporte en Hermes, el harness evita construir y mantener integraciones con
21 plataformas. El costo es una dependencia externa, mitigada porque el seam
`NotificationChannel` es sustituible:

```ts
interface NotificationChannel {
  readonly id: string; // 'hermes' | 'telegram-direct' | 'webhook' | 'email'
  notify(payload: GateNotification): Promise<DeliveryReceipt>;
}
```

Si Hermes no está disponible, el harness sigue funcionando: los gates quedan pendientes en
el Mission Control y en el CLI. La notificación es una comodidad, no un requisito del flujo.

## 6. Accesibilidad y otras vistas

- **Vista de operador** (modo pared): pantalla completa sin cromo, para un monitor en la
  oficina con el estado del equipo. Se actualiza sola.
- **Vista de reporte:** genera el daily standup y el reporte semanal que SaiOpenCloud ya
  tiene como skills, pero leyendo del motor en vez de releyendo tickets. Exportable a
  Markdown y PDF.
- **Vista de grafo:** el grafo de dependencias de una feature o de todo el backlog, con el
  camino crítico resaltado.
- **Modo TUI:** para quien prefiere terminal, un cliente TUI sobre la misma API. Fase 5.
