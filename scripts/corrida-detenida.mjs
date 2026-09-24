#!/usr/bin/env node
/**
 * Deja una corrida de proceso detenida esperando aprobación, como la dejaría el
 * motor cuando un gate no está aprobado. Lo usa el contrato de Hermes para
 * comprobar que un proceso detenido llega al celular.
 *
 * Uso: `node scripts/corrida-detenida.mjs <raíz> <proceso> <paso>`
 */
import { writeRun } from "../packages/engine/dist/index.js";

const [root, proceso, paso] = process.argv.slice(2);
if (root === undefined || proceso === undefined || paso === undefined) {
  throw new Error("faltan argumentos: <raíz> <proceso> <paso>");
}

const ahora = new Date().toISOString();
const runId = `${proceso}-${ahora.slice(0, 19).replace(/[:T]/g, "-")}`;

writeRun(root, {
  runId,
  processId: proceso,
  params: {},
  status: "waiting",
  pendingStep: paso,
  steps: [{ id: "build", status: "ok", at: ahora, detail: "npm run build" }],
  startedAt: ahora,
  updatedAt: ahora,
  reason: `espera aprobación de \`${paso}\``,
});

console.log(`corrida ${runId} detenida en ${paso}`);
