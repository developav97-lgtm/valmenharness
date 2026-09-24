/**
 * El token de aprobación remota: cómo se aprueba un gate desde el celular.
 *
 * Un gate humano solo sirve si el humano está disponible. Si está en una reunión
 * o en la calle, el gate se convierte en un cuello de botella, y el cuello de
 * botella es lo que hace que la gente busque cómo saltárselo. La solución no es
 * relajar el gate: es llevar el gate donde está la persona.
 *
 * Este archivo es la mitad que hace que eso sea seguro. Tres reglas lo gobiernan,
 * y las tres existen porque la alternativa es un agujero:
 *
 * 1. **El token lo emite el harness, no el agente.** Codifica `{gate, ticket,
 *    recibo, hash del estado congelado, revisión, expiración, nonce}` y va firmado
 *    con HMAC. Quien lo presente no puede cambiar el sujeto: la firma cubre el
 *    contenido, así que un token emitido para el plan de un ticket no aprueba el
 *    de otro, ni el mismo ticket después de que alguien lo editó.
 * 2. **Es de un solo uso, y el registro de uso es append-only.** Se consume
 *    anexando, no reescribiendo: el invariante 4 del harness también vale acá, y
 *    la razón es la misma —dentro de seis meses hay que poder ver qué se aprobó,
 *    cuándo y con qué token—.
 * 3. **El techo de riesgo lo aplica este código.** No la configuración, no el
 *    plugin, no el canal. Un token emitido para un gate crítico **no se emite
 *    nunca**, aunque alguien configure mal el resto: es la diferencia entre «el
 *    celular no debería poder» y «el celular no puede». Un teléfono perdido no
 *    puede ser un vector de despliegue, y eso no se sostiene con disciplina.
 *
 * Lo que este archivo **no** hace es decidir. Emite y verifica credenciales; la
 * decisión la sigue registrando `recordHumanDecision`, que es la misma función
 * que usa el botón de Mission Control. Si la aprobación por celular escribiera el
 * recibo por su cuenta, habría dos caminos para aprobar y el día que divergieran
 * el recibo de uno no describiría al otro.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { RegistryPaths } from "./discovery.js";

/**
 * El alfabeto del código corto.
 *
 * Base32 de Crockford, sin `I`, `L`, `O` ni `U`: los tres primeros porque se
 * confunden con `1` y `0` al dictarlos o al copiarlos de una pantalla de celular
 * —que es exactamente donde se van a leer—, y la `U` porque Crockford la excluye
 * para no formar palabras involuntarias. Un código que se transcribe mal es un
 * código que falla por una razón que no tiene nada que ver con lo que se estaba
 * decidiendo.
 */
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** La versión del formato. Si cambia lo que se firma, cambia esto. */
const VERSION = 1;

/** Lo que viaja firmado dentro del token. */
export interface ApprovalClaims {
  readonly version: number;
  readonly gate: string;
  readonly ticket: string;
  readonly receipt: string;
  /** El hash del contexto congelado que vio el evaluador. */
  readonly stateHash: string;
  /** La revisión del sujeto al emitir. */
  readonly revision: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Lo que hace que dos tokens del mismo gate no sean el mismo token. */
  readonly nonce: string;
}

/** Una emisión, tal como queda en el registro. */
export interface IssuedApproval {
  readonly kind: "approval-issued";
  readonly code: string;
  readonly token: string;
  readonly gate: string;
  readonly ticket: string;
  readonly receipt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** Un uso, tal como queda en el registro. */
export interface ConsumedApproval {
  readonly kind: "approval-consumed";
  readonly code: string;
  readonly consumedAt: string;
  readonly actor: string;
  readonly decision: "approve" | "reject";
}

export type ApprovalLogEntry =
  IssuedApproval | ConsumedApproval | UndeliveredApproval | ProcessNotice;

/**
 * Un aviso de algo que se detuvo y que **no se decide a distancia**.
 *
 * Una corrida de proceso parada en un gate espera a una persona, igual que un
 * gate de ticket, y por eso también tiene que llegar al celular. Lo que no tiene
 * es código: aprobar un paso de proceso es aprobar el camino por el que se
 * despliega, y eso exige la máquina. Así que se avisa y no se ofrece decidir.
 *
 * Entra en este registro y no en uno propio porque el registro es **lo que el
 * puente ya avisó**, y las dos cosas lo son. El nombre del archivo
 * —`approvals.jsonl`— quedó corto para lo que guarda, y se deja: renombrarlo
 * obligaría a migrar un archivo de estado para ganar una palabra.
 */
export interface ProcessNotice {
  readonly kind: "process-notice";
  readonly runId: string;
  readonly processId: string;
  /** El paso donde se detuvo. */
  readonly step: string;
  readonly notifiedAt: string;
}

/**
 * Un intento cuyo mensaje no salió.
 *
 * Existe porque «emitido» y «avisado» no son lo mismo, y confundirlos rompe el
 * reintento justo cuando más hace falta: si un token emitido contara como aviso,
 * una corrida con Hermes caído dejaría el gate marcado como notificado, y la
 * siguiente —ya con Hermes sano— lo saltearía en silencio. La persona no recibiría
 * nada y el harness creería que avisó.
 *
 * El token sigue siendo válido —el código se imprimió en la terminal y quien lo
 * tenga puede usarlo—, pero **no cuenta como aviso**: es un intento que hay que
 * repetir.
 */
export interface UndeliveredApproval {
  readonly kind: "approval-undelivered";
  readonly code: string;
  readonly attemptedAt: string;
  /** Qué dijo el canal. Es lo único que permite arreglar el destino. */
  readonly detail: string;
}

/** Lo que se sabe de un sujeto para decidir si su gate admite aprobación remota. */
export interface CeilingInput {
  readonly subjectType: "ticket" | "feature" | "release" | "process";
  readonly riskLevel: string;
  /** Los impactos que el ticket declara: `migration_impact`, `docker_impact`, … */
  readonly impacts: readonly string[];
}

/**
 * Los niveles de riesgo que se pueden aprobar sin estar en la máquina.
 *
 * `high` y `critical` quedan fuera, y no es una preferencia: un gate de riesgo
 * alto exige ver el diff completo y escribir una frase literal, y ninguna de las
 * dos cosas se puede hacer desde una notificación de chat.
 */
export const RIESGO_APROBABLE_REMOTAMENTE: readonly string[] = ["low", "normal"];

/**
 * Los impactos que cierran la puerta remota.
 *
 * Son los mismos tres que el harness trata como gates de impacto en todas partes
 * —sincronización, migraciones, contenedores— y la razón es la misma: son
 * irreversibles para alguien que no está en la conversación. Un ticket que migra
 * datos no se aprueba desde una pantalla de cinco pulgadas.
 */
export const IMPACTOS_NO_REMOTOS: readonly string[] = [
  "migration_impact",
  "docker_impact",
  "sync_impact",
];

/**
 * Por qué este sujeto **no** admite aprobación remota. `null` si sí la admite.
 *
 * Devuelve el motivo y no un booleano porque el motivo es lo que se escribe en el
 * registro y lo que se le muestra a quien lo intentó. «No se puede» sin decir por
 * qué es la respuesta que hace que alguien busque la forma de rodearlo.
 */
export function motivoDeTecho(input: CeilingInput): string | null {
  if (input.subjectType !== "ticket") {
    return (
      `los gates de ${input.subjectType === "process" ? "un proceso" : `una ${input.subjectType}`} ` +
      "no se aprueban a distancia: el camino de despliegue y de release exige la máquina"
    );
  }

  if (!RIESGO_APROBABLE_REMOTAMENTE.includes(input.riskLevel)) {
    return (
      `el riesgo es \`${input.riskLevel}\`, y a distancia solo se aprueban ` +
      `${RIESGO_APROBABLE_REMOTAMENTE.join(" y ")}`
    );
  }

  const declarados = input.impacts.filter((i) => IMPACTOS_NO_REMOTOS.includes(i));
  if (declarados.length > 0) {
    return (
      `el ticket declara ${declarados.join(", ")}, y un cambio irreversible para ` +
      "datos o contenedores se aprueba con el diff delante"
    );
  }

  return null;
}

/** El secreto con el que se firma. Sin él no hay token, y se dice. */
export type Secret = string;

function firmar(secret: Secret, contenido: string): Buffer {
  return createHmac("sha256", secret).update(contenido).digest();
}

/** Compara dos firmas sin filtrar por tiempo cuánto se parecen. */
function firmaValida(secret: Secret, contenido: string, recibida: Buffer): boolean {
  const esperada = firmar(secret, contenido);
  if (esperada.length !== recibida.length) return false;
  return timingSafeEqual(esperada, recibida);
}

/**
 * El código corto que la persona teclea o dicta.
 *
 * Se deriva del `nonce` con el mismo secreto, así que no hace falta guardarlo
 * para reconocerlo: se recalcula. Pero **sí** se guarda junto al token, porque
 * quien responde el código no manda el token y el harness tiene que poder pasar
 * de uno al otro sin adivinar.
 */
export function codigoPara(secret: Secret, nonce: string): string {
  const bytes = firmar(secret, `codigo:${nonce}`);
  let salida = "";
  for (let i = 0; i < 8; i += 1) {
    salida += ALFABETO[(bytes[i] as number) % ALFABETO.length];
  }
  return `${salida.slice(0, 4)}-${salida.slice(4)}`;
}

/** El resultado de emitir. */
export type MintOutcome =
  | { readonly ok: true; readonly issued: IssuedApproval }
  | { readonly ok: false; readonly refusal: string };

/** Lo que hace falta para emitir un token. */
export interface MintRequest {
  readonly secret: Secret;
  readonly gate: string;
  readonly ticket: string;
  readonly receipt: string;
  readonly stateHash: string;
  readonly revision: string;
  readonly ceiling: CeilingInput;
  readonly now: Date;
  /** Cuántas horas vale. Por defecto, 24. */
  readonly ttlHours?: number | undefined;
  /** El nonce, para las pruebas. */
  readonly nonce?: string | undefined;
}

/** El token, tal como se firma: `cuerpo.firma`, las dos en base64url. */
export function mintApproval(request: MintRequest): MintOutcome {
  // La regla dura, primero y antes que cualquier otra cosa. Se comprueba acá y no
  // en quien llama porque este es el único camino por el que se emite un token:
  // si la comprobación viviera en el canal o en la configuración, un segundo
  // camino la olvidaría, y el olvido no se vería hasta que alguien aprobara un
  // despliegue desde el colectivo.
  const motivo = motivoDeTecho(request.ceiling);
  if (motivo !== null) return { ok: false, refusal: motivo };

  const ttl = request.ttlHours ?? 24;
  const expira = new Date(request.now.getTime() + ttl * 3_600_000);
  const nonce = request.nonce ?? randomBytes(16).toString("base64url");

  const claims: ApprovalClaims = {
    version: VERSION,
    gate: request.gate,
    ticket: request.ticket,
    receipt: request.receipt,
    stateHash: request.stateHash,
    revision: request.revision,
    issuedAt: request.now.toISOString(),
    expiresAt: expira.toISOString(),
    nonce,
  };

  const cuerpo = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const firma = firmar(request.secret, cuerpo).toString("base64url");

  return {
    ok: true,
    issued: {
      kind: "approval-issued",
      code: codigoPara(request.secret, nonce),
      token: `${cuerpo}.${firma}`,
      gate: request.gate,
      ticket: request.ticket,
      receipt: request.receipt,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
    },
  };
}

/** Por qué un token no sirve. */
export type TokenRefusal = "malformado" | "firma-invalida" | "vencido";

/** Lo que devuelve verificar. */
export type VerifyOutcome =
  | { readonly ok: true; readonly claims: ApprovalClaims }
  | { readonly ok: false; readonly refusal: TokenRefusal; readonly detail: string };

/**
 * Verifica un token: forma, firma y vigencia.
 *
 * **No** comprueba si el estado del sujeto cambió. Eso no se puede hacer acá
 * —este módulo no lee el registro— y por eso el `stateHash` viaja en las
 * claims: quien verifica lo compara contra el estado actual del ticket antes de
 * aplicar la decisión. Una aprobación de un artefacto que ya cambió es la mentira
 * más cara que puede registrar un gate, y el hash es lo que la hace detectable.
 */
export function verifyApproval(secret: Secret, token: string, now: Date): VerifyOutcome {
  const partes = token.split(".");
  if (partes.length !== 2) {
    return { ok: false, refusal: "malformado", detail: "el token no tiene cuerpo y firma" };
  }

  const [cuerpo, firmaTexto] = partes as [string, string];
  let recibida: Buffer;
  try {
    recibida = Buffer.from(firmaTexto, "base64url");
  } catch {
    return { ok: false, refusal: "malformado", detail: "la firma no es base64url" };
  }

  if (!firmaValida(secret, cuerpo, recibida)) {
    return {
      ok: false,
      refusal: "firma-invalida",
      detail: "la firma no corresponde a este cuerpo, o el secreto no es el mismo",
    };
  }

  let claims: ApprovalClaims;
  try {
    claims = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8"),
    ) as ApprovalClaims;
  } catch {
    return { ok: false, refusal: "malformado", detail: "el cuerpo no es JSON" };
  }

  if (claims.version !== VERSION) {
    return {
      ok: false,
      refusal: "malformado",
      detail: `la versión del token es ${claims.version} y este harness emite la ${VERSION}`,
    };
  }

  if (new Date(claims.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      refusal: "vencido",
      detail: `venció el ${claims.expiresAt}`,
    };
  }

  return { ok: true, claims };
}

// ─────────────────────────────────────────────────────────────────────────────
// El registro de emisiones y usos, append-only.
//
// Un token de un solo uso necesita saber cuáles se usaron, y eso es estado. Podía
// vivir en memoria del proceso que notifica, pero entonces un reinicio del
// harness devolvía la vida a un token ya consumido —y el reinicio es justo lo que
// pasa entre que se notifica un gate y alguien lo mira en el celular—. En disco y
// append-only, el registro dice dentro de seis meses qué se aprobó y con qué.
// ─────────────────────────────────────────────────────────────────────────────

/** Dónde vive el registro. `.valmen/` es del proyecto, no del home. */
export function approvalLogPath(paths: RegistryPaths): string {
  return join(paths.root, ".valmen", "approvals.jsonl");
}

/** Lee el registro. Una línea ilegible no lo tumba: se saltea y se sigue. */
export function readApprovalLog(paths: RegistryPaths): ApprovalLogEntry[] {
  const path = approvalLogPath(paths);
  if (!existsSync(path)) return [];

  const entradas: ApprovalLogEntry[] = [];
  for (const linea of readFileSync(path, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor = JSON.parse(linea) as ApprovalLogEntry;
      if (
        valor.kind === "approval-issued" ||
        valor.kind === "approval-consumed" ||
        valor.kind === "approval-undelivered" ||
        valor.kind === "process-notice"
      ) {
        entradas.push(valor);
      }
    } catch {
      // Una línea a medio escribir por un proceso interrumpido no puede impedir
      // leer el resto: el registro es un diario, y un renglón ilegible no borra
      // los anteriores.
    }
  }
  return entradas;
}

/** Anexa una entrada. Nunca reescribe. */
export function appendApproval(paths: RegistryPaths, entry: ApprovalLogEntry): string {
  const path = approvalLogPath(paths);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  return path;
}

/** Un token emitido que todavía se puede usar. */
export interface PendingApproval extends IssuedApproval {
  /** `true` si ya se consumió. */
  readonly consumed: boolean;
  /** `true` si venció respecto de `now`. */
  readonly expired: boolean;
  /**
   * `true` si el mensaje con el código nunca salió.
   *
   * El token sigue sirviendo —el código quedó impreso en la terminal—, pero el
   * aviso no llegó, así que **no cuenta como notificado** y hay que reintentarlo.
   * Es la diferencia entre «se emitió» y «se avisó», y sin ella un reintento con
   * Hermes ya sano saltearía el gate en silencio.
   */
  readonly undelivered: boolean;
  /** `true` si el aviso llegó y nadie decidió todavía. Lo que se llama pendiente. */
  readonly awaitingDecision: boolean;
}

/**
 * Los tokens emitidos, con su estado.
 *
 * Tres condiciones distintas que conviene no mezclar: **vencido** es que nadie lo
 * miró a tiempo; **consumido** es que ya se decidió; **sin entregar** es que el
 * aviso nunca salió. Un token vencido que nadie usó no es una decisión esperando
 * —es una notificación que se perdió— y presentarlo como pendiente haría creer que
 * el trabajo espera a alguien cuando en realidad el mensaje no llegó.
 */
export function pendingApprovals(paths: RegistryPaths, now: Date): PendingApproval[] {
  const registro = readApprovalLog(paths);
  const usados = new Set(
    registro
      .filter((e): e is ConsumedApproval => e.kind === "approval-consumed")
      .map((e) => e.code),
  );
  const sinEntregar = new Set(
    registro
      .filter((e): e is UndeliveredApproval => e.kind === "approval-undelivered")
      .map((e) => e.code),
  );

  return registro
    .filter((e): e is IssuedApproval => e.kind === "approval-issued")
    .map((e) => {
      const consumed = usados.has(e.code);
      const expired = new Date(e.expiresAt).getTime() <= now.getTime();
      const undelivered = sinEntregar.has(e.code);
      return {
        ...e,
        consumed,
        expired,
        undelivered,
        awaitingDecision: !consumed && !expired && !undelivered,
      };
    });
}

/**
 * Cuándo fue el último intento de avisar de este recibo.
 *
 * Cuenta las emisiones y los intentos fallidos, no los consumos: lo que se quiere
 * saber es cuándo se intentó avisar por última vez, para no repetir el intento en
 * cada corrida de un cron cuando el canal está caído. Sin esto, un Hermes roto y
 * un cron cada cinco minutos dejan doscientos ochenta y ocho renglones por día en
 * el registro.
 */
export function ultimoIntento(
  paths: RegistryPaths,
  ticket: string,
  receipt: string,
): string | null {
  const codigos = new Set(
    readApprovalLog(paths)
      .filter(
        (e): e is IssuedApproval =>
          e.kind === "approval-issued" && e.ticket === ticket && e.receipt === receipt,
      )
      .map((e) => e.code),
  );
  if (codigos.size === 0) return null;

  const intentos = readApprovalLog(paths).flatMap((e) => {
    // Un aviso de proceso no tiene código y no entra en esta cuenta: su vida es
    // otra —se avisa una vez y la corrida sigue detenida— y mezclarlo movería
    // la ventana de reintento de un gate sin motivo.
    if (e.kind === "process-notice") return [];
    if (!codigos.has(e.code)) return [];
    if (e.kind === "approval-issued") return [e.issuedAt];
    if (e.kind === "approval-undelivered") return [e.attemptedAt];
    // Un consumo no es un intento de avisar: es una decisión. Contarlo movería
    // la ventana de reintento cada vez que alguien decide, que es justo cuando
    // ya no hay nada que reintentar.
    return [];
  });

  return intentos.sort().at(-1) ?? null;
}

/** El estado de un código, tal como lo ve quien lo responde. */
export type CodeOutcome =
  | { readonly ok: true; readonly pending: PendingApproval }
  | { readonly ok: false; readonly refusal: string };

/**
 * Pasa de un código corto al token que autoriza.
 *
 * Se normaliza lo que la persona escribe —minúsculas, espacios, guiones de más—
 * porque el código se dicta y se copia desde una pantalla de celular, y rechazar
 * `abcd1234` cuando el código es `ABCD-1234` sería rechazar por una razón que no
 * tiene nada que ver con lo que se está decidiendo.
 */
export function resolveApprovalCode(
  paths: RegistryPaths,
  code: string,
  now: Date,
): CodeOutcome {
  const normalizado = normalizarCodigo(code);
  const emitidos = pendingApprovals(paths, now).filter(
    (p) => normalizarCodigo(p.code) === normalizado,
  );

  if (emitidos.length === 0) {
    return {
      ok: false,
      refusal:
        "ese código no corresponde a ninguna aprobación emitida para este proyecto; " +
        "puede estar mal copiado, o ser de otro proyecto",
    };
  }

  const pendiente = emitidos[emitidos.length - 1] as PendingApproval;
  if (pendiente.consumed) {
    return { ok: false, refusal: `el código ${pendiente.code} ya se usó` };
  }
  if (pendiente.expired) {
    return {
      ok: false,
      refusal: `el código ${pendiente.code} venció el ${pendiente.expiresAt}`,
    };
  }

  return { ok: true, pending: pendiente };
}

/** Deja el código en la forma canónica: sin guiones ni espacios, en mayúsculas. */
export function normalizarCodigo(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * Las corridas de las que ya se avisó.
 *
 * Es la misma idea que el token vivo para un gate: el registro es la prueba de
 * que el aviso salió, y un contador aparte sería un segundo estado que se puede
 * desincronizar del primero. Una corrida detenida sigue detenida hasta que
 * alguien la retoma, así que sin esto un cron cada cinco minutos mandaría el mismo
 * aviso doscientas ochenta y ocho veces por día.
 */
export function corridasAvisadas(paths: RegistryPaths): Set<string> {
  return new Set(
    readApprovalLog(paths)
      .filter((e): e is ProcessNotice => e.kind === "process-notice")
      .map((e) => e.runId),
  );
}
