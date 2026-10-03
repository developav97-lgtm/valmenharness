/** Proyección temporal de una ventana; no selecciona ni controla procesos. */
import { JOURNEY_ID_RE, type JourneyWindowInput } from "./journeys.js";

export type JourneyWindowState = "upcoming" | "open" | "closed";

export interface JourneyWindowStatus {
  readonly state: JourneyWindowState;
  readonly allowsNewDispatch: boolean;
  /** Invariante: cerrar la ventana jamás manda detener actividad existente. */
  readonly interruptsActiveWork: false;
}

/** Valida y congela una ventana que puede guardarse en una revisión de jornada. */
export function createJourneyWindow(input: JourneyWindowInput): JourneyWindowInput {
  if (!JOURNEY_ID_RE.test(input.windowId)) {
    throw new Error("windowId debe ser un identificador portable no vacío, sin rutas ni espacios.");
  }
  assertIsoInstant(input.startsAt, "startsAt");
  assertIsoInstant(input.endsAt, "endsAt");
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new Error("endsAt debe ser posterior a startsAt.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone }).format(0);
  } catch {
    throw new Error("timeZone debe ser una zona horaria IANA reconocida.");
  }
  return Object.freeze({ ...input });
}

/** Determina el permiso de un inicio nuevo, con fin exclusivo y sin efectos laterales. */
export function evaluateJourneyWindow(
  input: JourneyWindowInput,
  at: string,
): JourneyWindowStatus {
  const window = createJourneyWindow(input);
  assertIsoInstant(at, "at");
  const instant = Date.parse(at);
  const state: JourneyWindowState = instant < Date.parse(window.startsAt)
    ? "upcoming"
    : instant < Date.parse(window.endsAt) ? "open" : "closed";
  return Object.freeze({
    state,
    allowsNewDispatch: state === "open",
    interruptsActiveWork: false,
  });
}

function assertIsoInstant(value: string, field: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${field} debe ser un instante ISO 8601 canónico.`);
  }
}
