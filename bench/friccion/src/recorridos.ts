/**
 * El corpus de recorridos: operaciones que el motor rechaza y cómo dejar un escenario donde
 * las rechace. Cada recorrido es datos, no código: el ejecutor lo arma, lo corre y lo clasifica.
 *
 * Este ticket trae un solo recorrido, el salto ilegal de estado del escenario de R-FRI-002.
 * Los demás los agrega FEATURE-BENCH-FRICCION-CORPUS-20261010.
 */
import type { Recorrido } from "./tipos.js";

const TICKET = "FEATURE-FRICCION-SALTO-20261010";

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
];
