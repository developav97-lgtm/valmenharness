/**
 * La unión de los registros append-only al integrar la rama de un worktree.
 */
import { describe, expect, it } from "vitest";

import { esRegistroUnible, unirRegistro } from "../packages/engine/src/index.js";

const RUTA = ".valmen/executions/events.jsonl";

const evento = (eventId: string, cursor: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ eventId, kind: "ejecucion.avance", occurredAt: "2026-10-08T10:00:00.000Z", cursor, receivedAt: `2026-10-08T10:00:0${cursor}.000Z`, ...extra });

const registro = (...lineas: string[]): string => (lineas.length === 0 ? "" : `${lineas.join("\n")}\n`);
const cursores = (texto: string): number[] => texto.split("\n").filter((l) => l !== "").map((l) => (JSON.parse(l) as { cursor: number }).cursor);
const ids = (texto: string): string[] => texto.split("\n").filter((l) => l !== "").map((l) => (JSON.parse(l) as { eventId: string }).eventId);

const e1 = evento("e1", 1);
const e2 = evento("e2", 2);
const base = registro(e1, e2);

describe("unirRegistro de eventos", () => {
  it("conserva cada evento de las dos versiones por eventId, sin duplicar el que ya estaba (C1)", () => {
    const ours = registro(e1, e2, evento("o3", 3));
    const theirs = registro(e1, e2, evento("t3", 3), evento("t4", 4));
    const r = unirRegistro({ ruta: RUTA, base, ours, theirs });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(ids(r.contenido)).toEqual(["e1", "e2", "o3", "t3", "t4"]);
      expect(r.incorporadas).toBe(2);
    }
  });

  it("un evento que las dos versiones añadieron igual (mismo hecho, otro cursor y recepción) no se duplica (C1)", () => {
    const ours = registro(e1, e2, evento("x", 3));
    const theirs = registro(e1, e2, evento("y", 3), evento("x", 4, { receivedAt: "2030-01-01T00:00:00.000Z" }));
    const r = unirRegistro({ ruta: RUTA, base, ours, theirs });
    expect(r.ok && ids(r.contenido)).toEqual(["e1", "e2", "x", "y"]);
  });

  it("deja los cursores consecutivos de 1 a N (C2)", () => {
    const ours = registro(e1, e2, evento("o3", 3), evento("o4", 4));
    const theirs = registro(e1, e2, evento("t3", 3), evento("t4", 4), evento("t5", 5));
    const r = unirRegistro({ ruta: RUTA, base, ours, theirs });
    expect(r.ok && cursores(r.contenido)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("lo único que cambia respecto de las dos versiones es el cursor de los entrantes (C3)", () => {
    const ours = registro(e1, e2, evento("o3", 3));
    const entrante = evento("t3", 3, { detalle: { b: 1, a: [1, 2] } });
    const theirs = registro(e1, e2, entrante);
    const r = unirRegistro({ ruta: RUTA, base, ours, theirs });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lineas = r.contenido.split("\n").filter((l) => l !== "");
    expect(lineas.slice(0, 3)).toEqual([e1, e2, evento("o3", 3)]);
    expect(JSON.parse(lineas[3] as string)).toEqual({ ...JSON.parse(entrante), cursor: 4 });
    expect(Object.keys(JSON.parse(lineas[3] as string))).toEqual(Object.keys(JSON.parse(entrante)));
  });

  it("un entrante que ya tiene el cursor que le toca se conserva byte a byte (C3)", () => {
    const entrante = evento("t3", 3);
    const r = unirRegistro({ ruta: RUTA, base, ours: base, theirs: registro(e1, e2, entrante) });
    expect(r.ok && r.contenido).toBe(registro(e1, e2, entrante));
  });

  it("un mismo eventId con contenido distinto no se une y se informa (C4)", () => {
    const ours = registro(e1, e2, evento("dup", 3, { kind: "a" }));
    const theirs = registro(e1, e2, evento("dup", 3, { kind: "b" }));
    const r = unirRegistro({ ruta: RUTA, base, ours, theirs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("eventId dup");
  });

  it("una versión que editó o borró una línea previa no se une (C5)", () => {
    const editada = registro(evento("e1", 1, { kind: "editado" }), e2);
    for (const [ours, theirs] of [
      [editada, registro(e1, e2, evento("t3", 3))],
      [registro(e1, e2, evento("o3", 3)), editada],
      [registro(e1), registro(e1, e2, evento("t3", 3))],
      [registro(e1, e2, evento("o3", 3)), registro(e2)],
    ] as const) {
      const r = unirRegistro({ ruta: RUTA, base, ours, theirs });
      expect(r.ok).toBe(false);
    }
    const r = unirRegistro({ ruta: RUTA, base, ours: editada, theirs: base });
    expect(!r.ok && r.motivo).toContain("main editó");
  });

  it("una de las versiones sin cambios devuelve la otra (C1)", () => {
    const theirs = registro(e1, e2, evento("t3", 3));
    const r = unirRegistro({ ruta: RUTA, base, ours: base, theirs });
    expect(r.ok && r.contenido).toBe(theirs);
  });
});

describe("unirRegistro de registros sin eventId", () => {
  it("une por línea idéntica, sin duplicar (C6)", () => {
    const ruta = ".valmen/journeys/pasadas.jsonl";
    const a = JSON.stringify({ pasada: 1 });
    const b = JSON.stringify({ pasada: 2 });
    const c = JSON.stringify({ pasada: 3 });
    const r = unirRegistro({ ruta, base: registro(a), ours: registro(a, b), theirs: registro(a, b, c) });
    expect(r.ok && r.contenido).toBe(registro(a, b, c));
    const recibos = unirRegistro({ ruta: ".valmen/receipts/FEATURE-X-Y-20261008.jsonl", base: registro(a), ours: registro(a, b), theirs: registro(a, c) });
    expect(recibos.ok && recibos.contenido).toBe(registro(a, b, c));
  });
});

describe("unirRegistro sin base común", () => {
  it("un registro creado en las dos versiones se une con la base vacía (C7)", () => {
    const r = unirRegistro({ ruta: RUTA, base: "", ours: registro(evento("o1", 1)), theirs: registro(evento("t1", 1), evento("t2", 2)) });
    expect(r.ok && ids(r.contenido)).toEqual(["o1", "t1", "t2"]);
    expect(r.ok && cursores(r.contenido)).toEqual([1, 2, 3]);
  });
});

describe("esRegistroUnible", () => {
  it("acepta solo la lista cerrada de registros (C8)", () => {
    for (const ruta of [RUTA, ".valmen/receipts/FEATURE-X-Y-20261008.jsonl", ".valmen/journeys/pasadas.jsonl", ".valmen/autonomous-stops.jsonl"]) {
      expect(esRegistroUnible(ruta)).toBe(true);
    }
  });

  it("rechaza ticket.md, el código y cualquier ruta fuera de la lista (C8)", () => {
    for (const ruta of [
      "tickets/2026/FEATURE-X-Y-20261008/ticket.md",
      "tickets/index.md",
      "packages/engine/src/index.ts",
      ".valmen/config.yaml",
      ".valmen/receipts/sub/otro.jsonl",
      ".valmen/receipts/x.json",
      ".valmen/executions/otro.jsonl",
      ".valmen/journeys/../config.yaml",
      ".valmen/journeys/../receipts/a.jsonl",
      "otro/.valmen/executions/events.jsonl",
      "",
    ]) {
      expect(esRegistroUnible(ruta)).toBe(false);
    }
  });
});
