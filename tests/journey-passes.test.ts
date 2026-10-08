import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import {
  leerPasadas,
  pasadasPath,
  registrarPasada,
  resumenDePasadas,
  type RegistroDePasada,
} from "../packages/engine/src/index.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-pasadas-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const en = (minuto: number, journeyId = "JOR-1"): RegistroDePasada => ({
  kind: "journey-pass",
  version: 1,
  journeyId,
  at: new Date(Date.UTC(2026, 9, 7, 8, minuto)).toISOString(),
  estado: "sin-candidato",
  ticketId: null,
  detalle: "nada",
});

it("anexa una línea journey-pass sin reescribir las anteriores", () => {
  registrarPasada(root, { journeyId: "JOR-1", estado: "despachado", ticketId: "T-1", detalle: "uno", at: "2026-10-07T08:00:00.000Z" });
  const antes = readFileSync(pasadasPath(root), "utf8");
  registrarPasada(root, { journeyId: "JOR-1", estado: "error", ticketId: null, detalle: "dos", at: "2026-10-07T08:15:00.000Z" });
  const despues = readFileSync(pasadasPath(root), "utf8");
  expect(despues.startsWith(antes)).toBe(true);
  expect(despues.trim().split("\n")).toHaveLength(2);
  expect(JSON.parse(despues.trim().split("\n")[0] as string)).toMatchObject({ kind: "journey-pass", version: 1, journeyId: "JOR-1", estado: "despachado", ticketId: "T-1" });
});

it("leerPasadas ignora una línea ilegible y devuelve las demás", () => {
  registrarPasada(root, { journeyId: "JOR-1", estado: "despachado", ticketId: "T-1", detalle: "uno" });
  appendFileSync(pasadasPath(root), '{"kind":"journey-pass","vers\n', "utf8");
  registrarPasada(root, { journeyId: "JOR-1", estado: "ya-despachado", ticketId: "T-1", detalle: "tres" });
  expect(leerPasadas(root).map((p) => p.detalle)).toEqual(["uno", "tres"]);
});

it("sin archivo no hay pasadas", () => {
  expect(leerPasadas(root)).toEqual([]);
});

it("con dos o más pasadas, la próxima es la última más la mediana de los intervalos", () => {
  const resumen = resumenDePasadas([en(0), en(15), en(30), en(75)], "JOR-1");
  expect(resumen.ultima?.at).toBe(en(75).at);
  expect(resumen.cadenciaMs).toBe(15 * 60_000);
  expect(resumen.proxima).toBe(new Date(Date.parse(en(75).at) + 15 * 60_000).toISOString());
});

it("solo cuenta las pasadas de su jornada", () => {
  const resumen = resumenDePasadas([en(0, "JOR-2"), en(10), en(40, "JOR-2"), en(20)], "JOR-1");
  expect(resumen.ultima?.at).toBe(en(20).at);
  expect(resumen.cadenciaMs).toBe(10 * 60_000);
});

it("con menos de dos pasadas la cadencia y la próxima son null", () => {
  expect(resumenDePasadas([], "JOR-1")).toEqual({ ultima: null, cadenciaMs: null, proxima: null });
  const una = resumenDePasadas([en(0)], "JOR-1");
  expect(una.ultima?.at).toBe(en(0).at);
  expect(una.cadenciaMs).toBeNull();
  expect(una.proxima).toBeNull();
});
