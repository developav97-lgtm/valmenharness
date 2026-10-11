/**
 * El corpus de recorridos: operaciones que el motor rechaza y cómo dejar un escenario donde
 * las rechace. Cada recorrido es datos, no código: el ejecutor lo arma, lo corre y lo clasifica.
 *
 * Son los ocho rechazos frecuentes que nombra R-FRI-003, en su orden. Los que pasan por un
 * estado avanzado del ticket lo alcanzan con comandos públicos del binario, uno tras otro,
 * sin modelo; el ticket de partida es un texto fijo (`ticketDeLaMedicion`), porque `create`
 * escribe la fecha del día y haría que el mismo corpus se armara distinto cada vez.
 */
import type { PasoDeArmado, Recorrido } from "./tipos.js";

const TICKET = "FEATURE-FRICCION-SALTO-20261010";

/** El ticket de los recorridos que pasan por estados avanzados. */
const TICKET_AVANZADO = "FEATURE-FRICCION-AVANZADO-20261010";

/** Su identificador da el worktree `.claude/worktrees/ticket-integra` y la rama `valmen/ticket-integra`. */
const TICKET_INTEGRA = "FEATURE-FRICCION-INTEGRA-20261010";

const CONFIGURACION_MINIMA = [
  "name: Medicion de friccion",
  "project-id: medicion-friccion",
  "tickets-dir: tickets",
  "",
].join("\n");

/** La configuración que autoriza el comando que declaran los criterios del ticket fijo. */
const CONFIGURACION_CON_PRUEBAS = `${CONFIGURACION_MINIMA}test-commands:\n  - node --version\n`;

/**
 * El texto fijo de un ticket listo para pasar por analyzed, planned y approved: diagnóstico,
 * plan con su línea de aprobación, un criterio que se verifica con `node --version` y el
 * resultado del responsable ya escrito en `## Pruebas`.
 */
function ticketDeLaMedicion(id: string): string {
  return `---
schema_version: 2
id: ${id}
title: Ticket de la medición de fricción
type: FEATURE
module: FRICCION
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

# ${id}

## Solicitud original

Pedido de prueba de la medición de fricción.

### Supuestos y decisiones pendientes

Ninguno.

## Descripción funcional

- Alcance: un ticket de prueba que solo existe para llevarlo por los estados del flujo.
- Usuario o rol afectado: la medición de fricción.
- Comportamiento actual: no hay ninguno.
- Comportamiento esperado: el ticket recorre el flujo sin modelo.

## Diagnóstico

- Causa comprobada (con \`ruta:línea\`): no es un defecto; es un ticket de prueba (\`bench/friccion/src/recorridos.ts:1\`).
- Hipótesis pendientes: ninguna.
- Consumidores afectados: ninguno.
- Archivos y flujo investigados: \`bench/friccion/src/recorridos.ts\`.
- Riesgos y compatibilidad: ninguno.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. \`bench/friccion/src/recorridos.ts\`: no se cambia nada (C1).
  2. \`bench/friccion/src/medicion.ts\`: no se cambia nada (C1).
- Impactos declarados: ninguno de sincronización, migración ni contenedores.
- Rollback (obligatorio): no hay nada que revertir.

## Criterios de aceptación

- [ ] C1: node informa su versión
      <!-- test: node --version -->

## Puntos

\`\`\`json
[]
\`\`\`

## Implementación

No hay código que implementar.

## Pruebas

- Directorio: la raíz del escenario.
- Comando: \`node --version\`.
- Resultado esperado: node informa su versión.
- Resultado del PO: la prueba pasó.

## QA

\`\`\`json
[]
\`\`\`

## Evidencia

\`\`\`json
[]
\`\`\`

## Retests

\`\`\`json
[]
\`\`\`

## Cierre

\`\`\`json
[]
\`\`\`

## Consumo de IA

\`\`\`json
[]
\`\`\`

## Release

Sin publicar todavía.

## Eventos

\`\`\`json
[]
\`\`\`
`;
}

function transicion(id: string, estado: string): PasoDeArmado {
  return { binario: ["transition", "--id", id, "--entity", "ticket", "--to", estado] };
}

function crear(id: string): PasoDeArmado {
  return {
    binario: [
      "create",
      "--id",
      id,
      "--title",
      "Ticket de la medición de fricción",
      "--type",
      "FEATURE",
      "--module",
      "FRICCION",
      "--request",
      "Pedido de prueba de la medición de fricción",
    ],
  };
}

/** El ticket fijo, en `in_progress`: lo que hace falta para pedir la entrega. */
function hastaEnCurso(id: string): PasoDeArmado[] {
  return [
    { archivo: { ruta: ".valmen/config.yaml", contenido: CONFIGURACION_CON_PRUEBAS } },
    {
      archivo: {
        ruta: `tickets/2026/${id}/ticket.md`,
        contenido: ticketDeLaMedicion(id),
      },
    },
    transicion(id, "analyzed"),
    transicion(id, "planned"),
    {
      binario: [
        "approve-plan",
        "--id",
        id,
        "--actor",
        "friccion",
        "--source",
        "cli",
        "--quote",
        "Aprobar tal cual",
      ],
    },
    transicion(id, "approved"),
    transicion(id, "in_progress"),
  ];
}

/** Lo anterior, más la verificación mecánica y la entrega: el ticket queda en `in_qa`. */
function hastaEnQa(id: string): PasoDeArmado[] {
  return [
    ...hastaEnCurso(id),
    { binario: ["gate", "qa-mechanical", "--id", id, "--evaluator", "command"] },
    transicion(id, "awaiting_user_tests"),
    transicion(id, "in_qa"),
  ];
}

/** Lo anterior, más un ciclo de QA aprobado: el ticket queda en `qa_approved`. */
function hastaQaAprobada(id: string): PasoDeArmado[] {
  return [
    ...hastaEnQa(id),
    // `qa-start --build-reference worktree` exige un archivo versionado y modificado.
    { archivo: { ruta: "README.md", contenido: "base\n" } },
    { git: ["add", "README.md"] },
    { git: ["commit", "-q", "-m", "readme"] },
    { archivo: { ruta: "README.md", contenido: "base\ncambio\n" } },
    {
      binario: [
        "qa-start",
        "--id",
        id,
        "--environment",
        "local",
        "--build-reference",
        "worktree",
      ],
    },
    {
      binario: [
        "qa-close",
        "--id",
        id,
        "--result",
        "approved",
        "--po-confirmation",
        "Aprobado",
      ],
    },
    transicion(id, "qa_approved"),
  ];
}

export const RECORRIDOS: Recorrido[] = [
  {
    id: "salto-ilegal",
    nombre: "Salto ilegal de estado",
    bloquea: "mover un ticket de intake directamente a approved",
    armado: [
      {
        binario: [
          "create",
          "--id",
          TICKET,
          "--title",
          "Ticket de la medición de fricción",
          "--type",
          "FEATURE",
          "--module",
          "FRICCION",
          "--request",
          "Pedido de prueba de la medición de fricción",
        ],
      },
    ],
    operacion: ["transition", "--id", TICKET, "--entity", "ticket", "--to", "approved"],
  },
  {
    id: "entrega-sin-recibo",
    nombre: "Entrega sin la verificación mecánica",
    bloquea: "pasar un ticket a awaiting_user_tests sin el recibo de qa-mechanical",
    armado: hastaEnCurso(TICKET_AVANZADO),
    operacion: [
      "transition",
      "--id",
      TICKET_AVANZADO,
      "--entity",
      "ticket",
      "--to",
      "awaiting_user_tests",
    ],
  },
  {
    id: "sync-desactualizado",
    nombre: "sync --check con archivos desactualizados",
    bloquea: "comprobar la proyección cuando una regla nueva no se proyectó",
    armado: [
      { archivo: { ruta: ".valmen/config.yaml", contenido: CONFIGURACION_MINIMA } },
      { binario: ["sync"] },
      {
        archivo: {
          ruta: ".valmen/rules/regla-nueva.md",
          contenido: "# Regla nueva\n\nUna regla que se escribió después del sync.\n",
        },
      },
    ],
    operacion: ["sync", "--check"],
  },
  {
    id: "integracion-arbol-sucio",
    nombre: "Integración con el árbol del checkout sucio",
    bloquea: "integrar un worktree cuando el checkout principal tiene cambios sin commit",
    armado: [
      // Sin esto, la carpeta del worktree cuenta como un cambio del checkout principal.
      { archivo: { ruta: ".gitignore", contenido: ".claude/worktrees/\n" } },
      crear(TICKET_INTEGRA),
      { git: ["add", "-A"] },
      { git: ["commit", "-q", "-m", "ticket"] },
      {
        git: [
          "worktree",
          "add",
          "-q",
          "-b",
          "valmen/ticket-integra",
          ".claude/worktrees/ticket-integra",
        ],
      },
      {
        archivo: {
          ruta: ".claude/worktrees/ticket-integra/cambio-del-ticket.txt",
          contenido: "un cambio en la rama del ticket\n",
        },
      },
      { git: ["-C", ".claude/worktrees/ticket-integra", "add", "cambio-del-ticket.txt"] },
      { git: ["-C", ".claude/worktrees/ticket-integra", "commit", "-q", "-m", "cambio"] },
      { archivo: { ruta: "sin-commit.txt", contenido: "un archivo sin commit\n" } },
    ],
    operacion: ["journey", "worktree", "integrate", "--id", TICKET_INTEGRA],
  },
  {
    id: "resume-inexistente",
    nombre: "resume de un ticket que no existe",
    bloquea: "retomar un identificador que no está en el registro",
    armado: [crear(TICKET)],
    operacion: ["resume", "--id", "FEATURE-FRICCION-NO-EXISTE-20261010"],
  },
  {
    id: "bandera-mal-escrita",
    nombre: "Bandera mal escrita",
    bloquea: "retomar un ticket con --idd en vez de --id",
    armado: [crear(TICKET)],
    operacion: ["resume", "--idd", TICKET],
    rechazoCorrecto: {
      motivo:
        "R-MSG-003: la bandera no existe para el comando; el mensaje nombra las válidas y la salida es reescribir la operación",
    },
  },
  {
    id: "qa-sin-build",
    nombre: "QA sin referencia de build",
    bloquea: "abrir un ciclo de QA sin --build-reference",
    armado: hastaEnQa(TICKET_AVANZADO),
    operacion: ["qa-start", "--id", TICKET_AVANZADO, "--environment", "local"],
  },
  {
    id: "cierre-sin-consumo",
    nombre: "Cierre sin consumo de IA",
    bloquea:
      "anexar un intento de cierre aprobado cuando el ticket no registra consumo de IA",
    armado: hastaQaAprobada(TICKET_AVANZADO),
    operacion: [
      "close-attempt",
      "--id",
      TICKET_AVANZADO,
      "--technical-summary",
      "Resumen técnico de prueba",
      "--functional-summary",
      "Resumen funcional de prueba",
      "--qa-status",
      "approved",
      "--release-impact",
      "ninguno",
    ],
    variables: { referencia: "friccion" },
  },
];
