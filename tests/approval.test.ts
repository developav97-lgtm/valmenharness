/**
 * El token de aprobación remota.
 *
 * Esta suite prueba una frontera de seguridad, así que la mayoría de los casos
 * afirman **negativas**. Lo que importa no es que un token funcione cuando todo
 * está bien: es que no se emita cuando no corresponde, que no sirva para otro
 * sujeto, que no sobreviva a un cambio del artefacto y que no se pueda usar dos
 * veces.
 *
 * El caso central es el techo de riesgo. El diseño lo promete desde antes de que
 * existiera el código —«el motor lo hace cumplir: un token emitido para un gate
 * crítico no se emite nunca, aunque el plugin esté mal configurado»— y esa frase
 * solo vale si hay un test que la sostenga. Las otras tres reglas de la frontera
 * —firma, vigencia y un solo uso— se prueban por el mismo motivo.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/index.js";
import {
  IMPACTOS_NO_REMOTOS,
  RIESGO_APROBABLE_REMOTAMENTE,
  appendApproval,
  approvalLogPath,
  codigoPara,
  mintApproval,
  motivoDeTecho,
  normalizarCodigo,
  pendingApprovals,
  readApprovalLog,
  resolveApprovalCode,
  ultimoIntento,
  verifyApproval,
  type CeilingInput,
  type MintRequest,
} from "../packages/engine/src/index.js";

const SECRETO = "un-secreto-de-prueba-suficientemente-largo";
const AHORA = new Date("2026-09-23T12:00:00.000Z");

let raiz: string;
let paths: RegistryPaths;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "aprobacion-"));
  paths = { root: raiz, ticketsDir: "tickets" };
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

function techo(extra: Partial<CeilingInput> = {}): CeilingInput {
  return { subjectType: "ticket", riskLevel: "normal", impacts: [], ...extra };
}

function pedido(extra: Partial<MintRequest> = {}): MintRequest {
  return {
    secret: SECRETO,
    gate: "plan",
    ticket: "FEATURE-INVENTARIO-API-20260921",
    receipt: "GR-0001",
    stateHash: "sha256:aaaa",
    revision: "rev-1",
    ceiling: techo(),
    now: AHORA,
    nonce: "nonce-fijo-para-que-el-codigo-sea-estable",
    ...extra,
  };
}

/** Emite y falla el test si no se pudo, para no repetir el desempaquetado. */
function emitir(extra: Partial<MintRequest> = {}) {
  const r = mintApproval(pedido(extra));
  if (!r.ok) throw new Error(`no se pudo emitir: ${r.refusal}`);
  return r.issued;
}

describe("el techo de riesgo, que es la regla dura", () => {
  it("no emite token para riesgo `high`", () => {
    const r = mintApproval(pedido({ ceiling: techo({ riskLevel: "high" }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toContain("high");
  });

  it("no emite token para riesgo `critical`", () => {
    const r = mintApproval(pedido({ ceiling: techo({ riskLevel: "critical" }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toContain("critical");
  });

  it("no emite token cuando el ticket declara cualquier impacto duro", () => {
    // Los tres, uno por uno: un `filter` que se olvidara de uno dejaría pasar
    // justo el caso que ese impacto protege.
    for (const impacto of IMPACTOS_NO_REMOTOS) {
      const r = mintApproval(pedido({ ceiling: techo({ impacts: [impacto] }) }));
      expect(r.ok, `${impacto} debería cerrar la puerta`).toBe(false);
      if (!r.ok) expect(r.refusal).toContain(impacto);
    }
  });

  it("no emite token para un gate de proceso, ni de feature, ni de release", () => {
    for (const tipo of ["process", "feature", "release"] as const) {
      const r = mintApproval(pedido({ ceiling: techo({ subjectType: tipo }) }));
      expect(r.ok, `${tipo} debería cerrar la puerta`).toBe(false);
    }
  });

  it("emite para un ticket de riesgo `low` o `normal` sin impactos", () => {
    for (const riesgo of RIESGO_APROBABLE_REMOTAMENTE) {
      expect(mintApproval(pedido({ ceiling: techo({ riskLevel: riesgo }) })).ok).toBe(true);
    }
  });

  it("la negativa explica el motivo, que es lo que evita que se busque el rodeo", () => {
    // «No se puede» sin decir por qué es la respuesta que hace que alguien
    // intente rodear el control. El motivo se escribe en el registro y se le
    // muestra a quien lo intentó.
    const motivo = motivoDeTecho(techo({ riskLevel: "critical" }));
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("critical");
    expect((motivo as string).length).toBeGreaterThan(40);

    const porImpacto = motivoDeTecho(techo({ impacts: ["migration_impact"] }));
    expect(porImpacto).toContain("migration_impact");
    expect(porImpacto).toContain("diff");
  });

  it("el techo lo aplica la emisión y no quien llama", () => {
    // Es la diferencia entre «el celular no debería poder» y «el celular no
    // puede». Se comprueba en la única función que produce un token: si la
    // comprobación viviera en el canal o en la configuración, un segundo camino
    // la olvidaría y el olvido no se vería hasta que alguien aprobara un
    // despliegue desde el colectivo.
    for (const riesgo of ["high", "critical"]) {
      const r = mintApproval(pedido({ ceiling: techo({ riskLevel: riesgo }) }));
      expect(r.ok).toBe(false);
      // Y no hay forma de pedirlo salteando: no existe un parámetro para eso.
      expect(Object.keys(pedido())).not.toContain("force");
    }
  });
});

describe("la firma", () => {
  it("un token legítimo se verifica y devuelve sus claims", () => {
    const emitido = emitir();
    const r = verifyApproval(SECRETO, emitido.token, AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.gate).toBe("plan");
      expect(r.claims.ticket).toBe("FEATURE-INVENTARIO-API-20260921");
      expect(r.claims.receipt).toBe("GR-0001");
      expect(r.claims.stateHash).toBe("sha256:aaaa");
      expect(r.claims.revision).toBe("rev-1");
    }
  });

  it("no verifica con otro secreto", () => {
    const emitido = emitir();
    const r = verifyApproval("otro-secreto-distinto", emitido.token, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toBe("firma-invalida");
  });

  it("no verifica si alguien cambió el sujeto del cuerpo", () => {
    // El ataque obvio: tomar el token de un ticket de bajo riesgo y reescribirle
    // el identificador para aprobar otro. La firma cubre el contenido, así que
    // cambiar un byte invalida el token entero.
    const emitido = emitir();
    const [cuerpo, firma] = emitido.token.split(".") as [string, string];
    const claims = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    claims["ticket"] = "SECURITY-OTRO-TICKET-20260921";
    const adulterado = `${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.${firma}`;

    const r = verifyApproval(SECRETO, adulterado, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toBe("firma-invalida");
  });

  it("no verifica si alguien estira la expiración", () => {
    const emitido = emitir();
    const [cuerpo, firma] = emitido.token.split(".") as [string, string];
    const claims = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    claims["expiresAt"] = "2099-01-01T00:00:00.000Z";
    const adulterado = `${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.${firma}`;

    expect(verifyApproval(SECRETO, adulterado, AHORA).ok).toBe(false);
  });

  it("rechaza un token malformado sin lanzar", () => {
    for (const basura of ["", "sin-punto", "a.b.c", "!!!.???"]) {
      const r = verifyApproval(SECRETO, basura, AHORA);
      expect(r.ok, basura).toBe(false);
    }
  });
});

describe("la vigencia", () => {
  it("vale 24 horas por defecto", () => {
    const emitido = emitir();
    expect(emitido.expiresAt).toBe("2026-09-24T12:00:00.000Z");
    expect(
      verifyApproval(SECRETO, emitido.token, new Date("2026-09-24T11:59:59Z")).ok,
    ).toBe(true);
  });

  it("no vale después de vencer", () => {
    const emitido = emitir();
    const r = verifyApproval(SECRETO, emitido.token, new Date("2026-09-24T12:00:01Z"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toBe("vencido");
  });

  it("la vida del token se puede acortar", () => {
    const emitido = emitir({ ttlHours: 1 });
    expect(emitido.expiresAt).toBe("2026-09-23T13:00:00.000Z");
    expect(
      verifyApproval(SECRETO, emitido.token, new Date("2026-09-23T13:30:00Z")).ok,
    ).toBe(false);
  });
});

describe("el código corto", () => {
  it("se deriva del nonce, así que el mismo nonce da el mismo código", () => {
    expect(codigoPara(SECRETO, "abc")).toBe(codigoPara(SECRETO, "abc"));
    expect(codigoPara(SECRETO, "abc")).not.toBe(codigoPara(SECRETO, "abd"));
  });

  it("usa un alfabeto sin letras que se confunden al dictarlo", () => {
    // El código se lee de una pantalla de celular y se dicta. `I`/`1` y `O`/`0`
    // se transcriben mal, y el fallo aparece como «código inválido», que manda a
    // buscar el problema donde no está.
    for (let i = 0; i < 200; i += 1) {
      const codigo = codigoPara(SECRETO, `nonce-${i}`);
      expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(codigo).not.toMatch(/[ILOU]/);
    }
  });

  it("se normaliza al compararlo: minúsculas, espacios y guiones de más", () => {
    expect(normalizarCodigo("abcd-1234")).toBe("ABCD1234");
    expect(normalizarCodigo("ABCD 1234")).toBe("ABCD1234");
    expect(normalizarCodigo(" ab-cd-12-34 ")).toBe("ABCD1234");
  });
});

describe("el registro de emisiones y usos", () => {
  it("encuentra el token por su código", () => {
    const emitido = emitir();
    appendApproval(paths, emitido);
    const r = resolveApprovalCode(paths, emitido.code, AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pending.token).toBe(emitido.token);
  });

  it("lo encuentra aunque el código venga mal escrito", () => {
    const emitido = emitir();
    appendApproval(paths, emitido);
    const r = resolveApprovalCode(
      paths,
      emitido.code.toLowerCase().replace("-", " "),
      AHORA,
    );
    expect(r.ok).toBe(true);
  });

  it("no encuentra un código que no se emitió, y lo dice sin culpar a nadie", () => {
    const r = resolveApprovalCode(paths, "ZZZZ-ZZZZ", AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toContain("no corresponde");
  });

  it("no deja usar dos veces el mismo código", () => {
    // Un token de un solo uso que se pudiera reusar no es de un solo uso, y el
    // caso real no es un atacante: es alguien que responde dos veces al mismo
    // mensaje porque no vio la confirmación.
    const emitido = emitir();
    appendApproval(paths, emitido);
    appendApproval(paths, {
      kind: "approval-consumed",
      code: emitido.code,
      consumedAt: AHORA.toISOString(),
      actor: "juan",
      decision: "approve",
    });

    const r = resolveApprovalCode(paths, emitido.code, AHORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toContain("ya se usó");
  });

  it("distingue «ya se usó» de «venció», que son dos cosas distintas", () => {
    // Un código vencido es una notificación que nadie miró a tiempo; uno usado es
    // una decisión que ya se tomó. Confundirlos hace que alguien vuelva a decidir
    // algo decidido, o que crea que su decisión no se registró.
    const emitido = emitir();
    appendApproval(paths, emitido);
    const despues = new Date("2026-09-26T12:00:00Z");
    const r = resolveApprovalCode(paths, emitido.code, despues);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toContain("venció");
  });

  it("el registro es append-only: consumir no reescribe lo emitido", () => {
    const emitido = emitir();
    appendApproval(paths, emitido);
    const antes = readFileSync(approvalLogPath(paths), "utf8");

    appendApproval(paths, {
      kind: "approval-consumed",
      code: emitido.code,
      consumedAt: AHORA.toISOString(),
      actor: "juan",
      decision: "approve",
    });

    const despues = readFileSync(approvalLogPath(paths), "utf8");
    expect(despues.startsWith(antes)).toBe(true);
    expect(readApprovalLog(paths)).toHaveLength(2);
  });

  it("una línea corrupta no borra el resto del registro", () => {
    const emitido = emitir();
    appendApproval(paths, emitido);
    writeFileSync(
      approvalLogPath(paths),
      readFileSync(approvalLogPath(paths), "utf8") + "{esto no es json\n",
      "utf8",
    );

    const entradas = readApprovalLog(paths);
    expect(entradas).toHaveLength(1);
    expect(resolveApprovalCode(paths, emitido.code, AHORA).ok).toBe(true);
  });

  it("sin registro, no hay pendientes y no falla", () => {
    expect(pendingApprovals(paths, AHORA)).toEqual([]);
  });

  it("marca vencido y consumido en el estado de cada emisión", () => {
    const emitido = emitir();
    appendApproval(paths, emitido);

    const vigente = pendingApprovals(paths, AHORA)[0];
    expect(vigente?.consumed).toBe(false);
    expect(vigente?.expired).toBe(false);

    const tarde = pendingApprovals(paths, new Date("2026-09-30T00:00:00Z"))[0];
    expect(tarde?.expired).toBe(true);
  });

  it("dos emisiones del mismo gate son dos tokens distintos", () => {
    // El nonce es lo que lo garantiza. Sin él, dos notificaciones del mismo gate
    // producirían el mismo token, y consumir una consumiría la otra.
    const primera = mintApproval(pedido({ nonce: undefined }));
    const segunda = mintApproval(pedido({ nonce: undefined }));
    expect(primera.ok && segunda.ok).toBe(true);
    if (primera.ok && segunda.ok) {
      expect(primera.issued.token).not.toBe(segunda.issued.token);
      expect(primera.issued.code).not.toBe(segunda.issued.code);
    }
  });
});

describe("un aviso que no salió", () => {
  /** Un intento fallido, tal como lo anota el canal. */
  function sinEntregar(code: string, cuando: Date = AHORA): void {
    appendApproval(paths, {
      kind: "approval-undelivered",
      code,
      attemptedAt: cuando.toISOString(),
      detail: "no se pudo ejecutar `hermes`",
    });
  }

  it("no cuenta como pendiente: hay un gate esperando y nadie se enteró", () => {
    // Es la diferencia entre «emitido» y «avisado». Si un intento fallido contara
    // como aviso, un reintento con el canal ya sano saltearía el gate en silencio:
    // la persona no recibiría nada y el harness creería que avisó.
    const emitido = emitir();
    appendApproval(paths, emitido);
    expect(pendingApprovals(paths, AHORA)[0]?.awaitingDecision).toBe(true);

    sinEntregar(emitido.code);
    const despues = pendingApprovals(paths, AHORA)[0];
    expect(despues?.awaitingDecision).toBe(false);
    expect(despues?.undelivered).toBe(true);
  });

  it("el token sigue sirviendo: el código quedó impreso en la terminal", () => {
    // No se invalida, porque quien lo tenga puede usarlo. Lo que se pierde es la
    // cuenta de «ya avisado», no la credencial.
    const emitido = emitir();
    appendApproval(paths, emitido);
    sinEntregar(emitido.code);

    expect(resolveApprovalCode(paths, emitido.code, AHORA).ok).toBe(true);
  });

  it("`ultimoIntento` dice cuándo se intentó por última vez", () => {
    const emitido = emitir();
    appendApproval(paths, emitido);
    expect(ultimoIntento(paths, emitido.ticket, emitido.receipt)).toBe(emitido.issuedAt);

    const masTarde = new Date("2026-09-23T18:00:00Z");
    sinEntregar(emitido.code, masTarde);
    expect(ultimoIntento(paths, emitido.ticket, emitido.receipt)).toBe(
      masTarde.toISOString(),
    );
  });

  it("sin intentos, `ultimoIntento` es `null` y no una fecha inventada", () => {
    expect(ultimoIntento(paths, "TICKET-QUE-NO-EXISTE", "GR-1")).toBeNull();
  });

  it("un consumo no mueve la ventana de reintento", () => {
    // Contarlo haría que decidir reiniciara la espera, que es justo cuando ya no
    // hay nada que reintentar.
    const emitido = emitir();
    appendApproval(paths, emitido);
    appendApproval(paths, {
      kind: "approval-consumed",
      code: emitido.code,
      consumedAt: "2026-09-23T20:00:00.000Z",
      actor: "juan",
      decision: "approve",
    });
    expect(ultimoIntento(paths, emitido.ticket, emitido.receipt)).toBe(emitido.issuedAt);
  });
});
