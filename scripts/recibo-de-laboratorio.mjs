#!/usr/bin/env node
/**
 * Escribe un recibo en banda de revisión para un ticket de laboratorio.
 *
 * El contrato de Hermes necesita un gate que **espere una decisión humana**, y
 * conseguirlo con una evaluación de verdad exige un proveedor de modelo y gasta
 * dinero. Este ayudante lo construye con el mismo `buildReceipt` del motor y el
 * estado real del ticket, así que el hash que queda en el recibo corresponde al
 * artefacto: con un hash inventado, la comprobación de obsolescencia rechazaría la
 * decisión y el contrato estaría midiendo otra cosa.
 *
 * Uso: `node scripts/recibo-de-laboratorio.mjs <raíz> <ticket> <id-del-recibo>`
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { DEFAULT_POLICY, buildReceipt, decide } from "../packages/gate/dist/index.js";
import { buildGateState } from "../packages/engine/dist/index.js";

const [root, ticket, recibo] = process.argv.slice(2);
if (root === undefined || ticket === undefined || recibo === undefined) {
  throw new Error("faltan argumentos: <raíz> <ticket> <id-del-recibo>");
}

const texto = readFileSync(join(root, "tickets", "2026", ticket, "ticket.md"), "utf8");
const proposiciones = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "¿cubre los criterios?" },
];
// 0.72 cae entre `blockAt` y `approveAt`, así que el veredicto es `review` y el
// recibo queda escalado a una persona. Es el único caso que tiene sentido avisar.
const respuestas = [{ id: "cubre_todos_los_criterios", kind: "noul", value: 0.72 }];

const construido = buildReceipt({
  id: recibo,
  gate: "plan",
  propositions: proposiciones,
  policy: DEFAULT_POLICY,
  subject: { type: "ticket", id: ticket, revision: "1" },
  decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
  state: buildGateState(texto),
  answers: respuestas,
  mechanicalChecks: [
    { id: "criterios_presentes", description: "hay criterios", result: "pass" },
  ],
  model: null,
  usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.00042 },
  latencyMs: 500,
  decidedAt: "2026-09-24T05:00:00Z",
});

const destino = join(root, ".valmen", "receipts", `${ticket}.jsonl`);
mkdirSync(dirname(destino), { recursive: true });
appendFileSync(destino, `${JSON.stringify(construido)}\n`, "utf8");
console.log(
  `${recibo} escrito para ${ticket} (${construido.outcome}, escalado a ${construido.escalatedTo})`,
);
