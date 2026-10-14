# Verificación — Perfiles de modelos por fase y por ejecutor

Feature: `perfiles-de-modelos` · generado el 2026-10-14 desde el registro de tickets.

Tickets del grafo: 10 · cerrados: 10 · pendientes: 0.

## Tickets

### FEATURE-ADAPTER-PERFILES-MODELOS-20261007 — Definir perfiles con nombre (Claude Code, Codex, OpenCode Go y personalizados), mixtos, validados contra el catálogo

- Estado: closed · QA: approved
- Cierre técnico: Implementación en el commit 276ef2e; ver ## Implementación.
- Cierre funcional: Cumple los criterios; pruebas en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ADAPTER-RESOLUCION-PERFIL-20261007 — Elegir el perfil por proyecto y por ejecutor, que el preset no lo sobrescriba y mostrar el modelo efectivo con su origen

- Estado: closed · QA: approved
- Cierre técnico: Implementación en el commit 4b05b86; ver ## Implementación.
- Cierre funcional: Cumple los criterios; verificación mecánica y suite en verde.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### SECURITY-ENGINE-DESPACHO-POR-PROVEEDOR-20261007 — Lanzar cada fase con el ejecutor y el modelo de su proveedor, y detenerse si no está autorizado

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Lanzar cada fase con el ejecutor y el modelo de su proveedor, y detenerse si no está autorizado
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ENGINE-REGISTRO-MODELO-FASE-20261007 — Registrar el modelo realmente usado por fase, compararlo con el declarado y decir «sin reportar» el costo ausente

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Registrar el modelo realmente usado por fase, compararlo con el declarado y decir «sin reportar» el costo ausente
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-MC-PERFILES-MODELOS-20261007 — Crear, editar y elegir perfiles desde Mission Control

- Estado: closed · QA: approved
- Cierre técnico: Endpoints /api/perfiles y sección Perfiles en la vista Modelos; ver ## Implementación.
- Cierre funcional: Se crean, editan y eligen perfiles de modelos desde Mission Control.
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007 — Mostrar el modelo efectivo, su origen y el realmente usado por fase

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Mostrar el modelo efectivo, su origen y el realmente usado por fase
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-CLI-PERFILES-MODELOS-20261007 — Listar, mostrar y elegir perfiles por CLI y desde Hermes

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Listar, mostrar y elegir perfiles por CLI y desde Hermes
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ADAPTER-CONTEXTO-FASES-SUBAGENTE-20261007 — Proveer a la sesión el modelo de cada fase y avisar si el cliente no admite subagentes

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Proveer a la sesión el modelo de cada fase y avisar si el cliente no admite subagentes
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### FEATURE-ENGINE-ORQUESTACION-INTERACTIVA-20261007 — Delegar cada fase a un subagente con el modelo del perfil sin cambiar el modelo de la sesión anfitriona

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Delegar cada fase a un subagente con el modelo del perfil sin cambiar el modelo de la sesión anfitriona
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

### IMPROVEMENT-ADAPTER-CONTRATO-PERFILES-20261007 — Documentar en AGENTS.md y en la skill de flujo cómo se ejecuta por fases

- Estado: closed · QA: approved
- Cierre técnico: Implementado y entregado desde su worktree; compuerta qa-mechanical en approve; suite completa en verde en main.
- Cierre funcional: Documentar en AGENTS.md y en la skill de flujo cómo se ejecuta por fases
- Evidencia:
  - automated-test: Pruebas del ticket y suite completa en verde (ver ## Pruebas)

## Pendiente del PO

Nada: todos los tickets están cerrados.
