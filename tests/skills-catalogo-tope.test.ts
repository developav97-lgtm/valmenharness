/**
 * El catálogo de skills cabe en el presupuesto y el recorte no perdió reglas
 * (R-SKL-002, R-SKL-003).
 *
 * `skill-budget` avisa sin bloquear; esta prueba es lo que impide que el catálogo del propio
 * harness vuelva a pasarse sin que nadie lo vea. Una prueba por regla, con una tabla: el
 * inventario sale de los encabezados, las frases en negrita y las prohibiciones del cuerpo
 * antes del recorte, y cada fila se busca en el cuerpo que queda. Lo que se movió a
 * `referencias/` está citado desde el cuerpo y existe.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readSkillBudget } from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";

const REPO = process.cwd();
const CATALOGO = join(REPO, "skills");
const COPIAS = join(REPO, ".valmen", "skills");
const CONFIG = readFileSync(join(REPO, ".valmen", "config.yaml"), "utf8");

let lab: string;
beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-catalogo-tope-"));
  delete process.env["HERMES_HOME"];
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function escribir(ruta: string, contenido: string): void {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, contenido, "utf8");
}

/** El cuerpo sin negritas ni saltos de línea, para buscar frases aunque se reajusten. */
const plano = (t: string): string => t.replace(/\*\*/g, "").replace(/\s+/g, " ");

const idsDelCatalogo = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();

const pesoDe = (dir: string, id: string): number =>
  Buffer.byteLength(readFileSync(join(dir, id, "SKILL.md"), "utf8"), "utf8");

/** Las skills que pasan del presupuesto, con el mensaje que nombra cada una y su tamaño. */
function excesos(dir: string, presupuesto: number): string[] {
  return idsDelCatalogo(dir)
    .filter((id) => pesoDe(dir, id) > presupuesto)
    .map((id) => `${id} pesa ${pesoDe(dir, id)} B y el presupuesto es ${presupuesto} B`);
}

const archivosDeReferencias = (dir: string, id: string): string[] => {
  const carpeta = join(dir, id, "referencias");
  return existsSync(carpeta)
    ? readdirSync(carpeta)
        .filter((n) => n.endsWith(".md"))
        .sort()
    : [];
};

const citadasEnElCuerpo = (dir: string, id: string): string[] => [
  ...new Set(
    [
      ...readFileSync(join(dir, id, "SKILL.md"), "utf8").matchAll(
        /referencias\/([\w.-]+\.md)/g,
      ),
    ].map((m) => m[1] as string),
  ),
];

/** Las citas del cuerpo que no existen y las referencias que ninguna cita nombra. */
function citasRotas(dir: string): string[] {
  return idsDelCatalogo(dir).flatMap((id) => {
    const hay = archivosDeReferencias(dir, id);
    return citadasEnElCuerpo(dir, id)
      .filter((nombre) => !hay.includes(nombre))
      .map((nombre) => `${id}: cita referencias/${nombre} y no existe`);
  });
}
function huerfanas(dir: string): string[] {
  return idsDelCatalogo(dir).flatMap((id) => {
    const citadas = citadasEnElCuerpo(dir, id);
    return archivosDeReferencias(dir, id)
      .filter((nombre) => !citadas.includes(nombre))
      .map((nombre) => `${id}: referencias/${nombre} no está citada desde el cuerpo`);
  });
}

function skillSintetica(
  dir: string,
  id: string,
  cuerpo: string,
  referencias: string[],
): void {
  escribir(
    join(dir, id, "SKILL.md"),
    `---\nname: ${id}\ndescription: x\nversion: 1.0.0\norigen: valmen\n---\n\n${cuerpo}\n`,
  );
  for (const nombre of referencias)
    escribir(join(dir, id, "referencias", nombre), "detalle\n");
}

// --- El presupuesto ----------------------------------------------------------------------

describe("el presupuesto del catálogo (R-SKL-002)", () => {
  it("C1: el config.yaml de este repositorio declara skill-budget: 6500", () => {
    expect(CONFIG).toMatch(/^skill-budget:\s*6500\s*$/m);
  });

  it("C2: readSkillBudget lee skill-budget de este repositorio", () => {
    expect(readSkillBudget(parseConfig(CONFIG))).toBe(6500);
  });

  const ids = idsDelCatalogo(CATALOGO);
  it.each(ids)("C3: %s está bajo el presupuesto", (id) => {
    const tope = readSkillBudget(parseConfig(CONFIG)) as number;
    expect(
      pesoDe(CATALOGO, id),
      `${id} pesa ${pesoDe(CATALOGO, id)} B`,
    ).toBeLessThanOrEqual(tope);
  });

  it("C4: la comprobación nombra la skill que se pasa con su tamaño", () => {
    skillSintetica(lab, "cabe", "corto", []);
    skillSintetica(lab, "grande", "x".repeat(2000), []);
    const peso = pesoDe(lab, "grande");

    expect(excesos(lab, 1000)).toEqual([
      `grande pesa ${peso} B y el presupuesto es 1000 B`,
    ]);
    expect(excesos(lab, peso)).toEqual([]);
  });
});

// --- Las referencias ---------------------------------------------------------------------

describe("las referencias del catálogo (R-SKL-003)", () => {
  it("C6: cada referencia citada existe en el catálogo", () => {
    expect(citasRotas(CATALOGO)).toEqual([]);
  });

  it("C6: una cita sin archivo se señala por skill y nombre", () => {
    skillSintetica(lab, "demo", "Detalle en `referencias/falta.md`.", ["otra.md"]);
    expect(citasRotas(lab)).toEqual(["demo: cita referencias/falta.md y no existe"]);
  });

  it("C7: ninguna referencia huérfana en el catálogo", () => {
    expect(huerfanas(CATALOGO)).toEqual([]);
  });

  it("C7: una referencia que el cuerpo no cita se señala por nombre y una citada no", () => {
    skillSintetica(lab, "demo", "Detalle en `referencias/usada.md`.", [
      "usada.md",
      "sobra.md",
    ]);
    expect(huerfanas(lab)).toEqual([
      "demo: referencias/sobra.md no está citada desde el cuerpo",
    ]);
  });
});

// --- Las reglas que no se pierden --------------------------------------------------------

type Regla = readonly [regla: string, patron: string];

/** El inventario del cuerpo antes del recorte: encabezados, negritas y prohibiciones. */
const INVENTARIO: Readonly<Record<string, readonly Regla[]>> = {
  planificacion: [
    ["encabezado: stack", "## De dónde sale el stack"],
    ["el plan no lleva el stack escrito dentro", "no lleva el stack escrito dentro"],
    ["encabezado: fuentes", "## Fuentes y límites"],
    [
      "no crear ni modificar tickets por inferencia",
      "no crear ni modificar tickets por inferencia",
    ],
    ["no asumir hosts, credenciales ni entornos", "No asumir hosts"],
    ["encabezado: investigación", "## Investigación previa"],
    ["separar evidencia de hipótesis", "Separar evidencia de hipótesis"],
    [
      "no reducir la compuerta cambiando la clasificación",
      "no reducir la compuerta cambiando la clasificación",
    ],
    [
      "puntos sin renumerar ni reutilizar identificadores",
      "sin renumerar ni reutilizar identificadores",
    ],
    ["encabezado: UI UX Pro Max", "## Diseño de pantallas con UI UX Pro Max"],
    ["una skill sin revisión no se lee", "no se lee"],
    ["encabezado: contenido del plan", "## Contenido del plan"],
    ["encabezado: controles por impacto", "## Controles por impacto"],
    ["no introducir secretos", "No introducir secretos"],
    ["no modificar listas de hosts permitidos", "No modificar listas de hosts permitidos"],
    ["encabezado: aprobación", "## Aprobación y transición"],
    [
      "aprobación humana obligatoria ante aislamiento, sincronización y despliegue",
      "aislamiento de datos, sincronización, agentes locales, contenedores, migraciones, seguridad o despliegue",
    ],
    ["detenerse en planned y pedirla", "detenerse en `planned` y pedirla"],
    [
      "no aprobar por silencio, urgencia ni aprobación anterior",
      "No interpretar el silencio",
    ],
    ["la línea de aprobación que reconoce el motor", "aprobado explícitamente por el PO"],
    ["la excepción no aplica a impactos críticos", "no aplica a los impactos críticos"],
    ["mover el estado con el harness: mover_ticket", "`mover_ticket`"],
    ["un cambio material necesita aprobación renovada", "aprobación renovada"],
    ["encabezado: estados", "## Estados del ticket"],
    ["las tres máquinas son independientes", "independientes"],
    ["encabezado: cómo se verifica un criterio", "## Cómo se verifica un criterio"],
    ["un criterio sin anotación detiene el gate", "sin anotación detiene el gate"],
    ["verify: manual se cita como Cn", "«Cn»"],
    [
      "un criterio, un comportamiento observable",
      "Un criterio, un comportamiento observable",
    ],
    ["un plan de más de unos 20 criterios o 400 líneas se parte", "unos 20 criterios"],
    ["encabezado: handoff", "## Handoff"],
    [
      "delegar no amplía los archivos ni las acciones aprobadas",
      "Delegar no amplía los archivos ni las acciones aprobadas",
    ],
    ["el plan prevé la entrega posterior", "El plan debe prever la entrega posterior"],
  ],
  "programar-trabajo-de-tickets": [
    ["encabezado: aviso de arranque", "## El aviso de arranque y la pantalla del ticket"],
    ["la tanda avisa cuando empieza y cuando termina", "cuando empieza y cuando termina"],
    ["cada eslabón en su propia sesión", "cada uno en su propia sesión"],
    ["encabezado: al cerrar", "## Al cerrar: el enlace y el siguiente eslabón"],
    ["ofrece adelantar, no adelanta", "No lo adelanta: la orden la da el PO"],
    ["encabezado: una sesión por ticket", "## Por qué una sesión por ticket"],
    [
      "el prompt de un eslabón no encadena a los demás",
      "el prompt de un eslabón no encadena a los demás creando jobs",
    ],
    ["una sesión por ticket hace posible el número", "una sesión por ticket"],
    ["encabezado: el orden", "## El orden, que no se escribe a mano"],
    [
      "el orden sale del grafo de la feature",
      "El orden sale del `tickets.yaml` de la feature",
    ],
    ["se saltean SYNC, SECURITY y MIGRATION", "`SYNC`, `SECURITY`, `MIGRATION`"],
    ["encabezado: cadencia", "## La cadencia y los topes"],
    [
      "tope de cinco eslabones por día y nada después de las 20:00",
      "Tope de cinco eslabones por día y nada después de las 20:00",
    ],
    ["la máquina tiene que estar despierta", "la máquina tiene que estar despierta"],
    ["encabezado: autorización", "## La autorización, citada"],
    ["la autorización va en palabras del PO con su alcance", "en sus palabras"],
    [
      "qué no habilita: commit, push, PR, tag ni despliegue",
      "commit, push, PR, tag ni despliegue",
    ],
    ["la aprobación delegada se registra", "aprobación delegada"],
    ["encabezado: cómo se corre", "## Cómo se corre"],
    ["--dry-run primero, siempre", "--dry-run` primero, siempre"],
    [
      "no reprogramar una tanda ya agendada",
      "A una tanda ya agendada no se le aplica la forma nueva volviéndola a programar",
    ],
    ["--implementador sesion u opencode", "--implementador"],
    ["--sin-aviso solo si el PO ya mira la corrida", "--sin-aviso"],
    ["encabezado: qué se verifica", "## Qué se verifica después"],
    ["cada job cita un solo ticket", "cada job cita un solo ticket"],
    ["dos jobs por eslabón", "dos jobs"],
    ["encabezado: al pulirla", "## Al pulirla"],
    ["la plantilla es el artefacto a mejorar", "La plantilla es el artefacto a mejorar"],
  ],
  feature: [
    ["encabezado: antes de crear nada", "## Antes de crear nada"],
    [
      "la forma del registro la decide quien lo pide",
      "La forma del registro la decide quien lo pide",
    ],
    ["devolver el alcance en tus palabras", "el alcance en tus palabras"],
    ["encabezado: el recorrido", "## El recorrido, en orden"],
    ["valmen feature new", "valmen feature new"],
    ["sin spec no hay descomposición", "sin ella no hay descomposición"],
    [
      "el requisito exige una palabra normativa",
      "el enunciado exige una palabra normativa",
    ],
    ["valmen feature decompose", "valmen feature decompose"],
    ["el arquitecto propone el grafo", "El arquitecto"],
    ["la revisión del grafo, con la persona", "La revisión del grafo, con la persona"],
    ["valmen feature materialize", "valmen feature materialize"],
    ["el orden lo dicen las dependencias", "el orden lo dicen las dependencias"],
    ["aprobación de la persona", "aprobación de la persona"],
    ["encabezado: adjuntos", "## Adjuntos: lo que nace con la feature"],
    ["un adjunto se anexa a la feature", "se anexan a la feature"],
    ["un enlace no es evidencia", "un enlace no es evidencia"],
    ["valmen feature asset add", "valmen feature asset add"],
    ["se valida contra el original", "se construye y se valida contra el original"],
    ["encabezado: lo que no se hace", "## Lo que no se hace"],
    ["no se abre la feature por cuenta propia", "No se abre la feature por cuenta propia"],
    ["no se descompone sin spec", "No se descompone sin spec"],
    ["no se inventan requisitos", "No se inventan requisitos"],
    [
      "no se empieza un ticket que espera a otro",
      "No se empieza un ticket que espera a otro",
    ],
    ["no se mezclan los impactos críticos", "No se mezclan los impactos críticos"],
    ["no se escribe la aprobación de nadie", "No se escribe la aprobación de nadie"],
    ["encabezado: cómo saber que salió bien", "## Cómo saber que salió bien"],
    ["valmen feature show", "valmen feature show"],
    ["valmen drift", "valmen drift"],
    ["cada requisito con al menos un ticket", "cada requisito con al menos un ticket"],
  ],
  "revision-final": [
    ["la revisión no despliega ni confirma cambios", "no declara un despliegue listo"],
    ["solo hallazgos sustentados", "únicamente hallazgos sustentados"],
    ["encabezado: stack", "## De dónde sale el stack"],
    ["revisar contra el patrón que ya usa el módulo", "el patrón que ya usa el módulo"],
    ["encabezado: revisión proporcional", "## Revisión proporcional"],
    [
      "excluir los cambios ajenos sin modificarlos",
      "excluir los cambios ajenos sin modificarlos",
    ],
    [
      "ausencia de datos sensibles o restos de depuración",
      "ausencia de datos sensibles o restos de depuración",
    ],
    ["bloqueante o no bloqueante", "bloqueante o no bloqueante"],
    [
      "no se borran ni se renumeran los ciclos previos",
      "no se borran ni se renumeran los ciclos previos",
    ],
    [
      "encabezado: se compara con el original",
      "## Lo que toca interfaz se compara con el original",
    ],
    ["encabezado: Impeccable", "## Lo que toca interfaz se revisa con Impeccable"],
    ["valmen ux review", "valmen ux review"],
    ["encabezado: criterios", "## Los criterios se marcan"],
    ["cada criterio verificado queda marcado con - [x]", "- [x]"],
    [
      "un criterio que dejó de aplicar no se borra ni se marca en falso",
      "no se borra ni se marca en falso",
    ],
    ["encabezado: consumo de IA", "## El consumo de IA se registra antes de cerrar"],
    ["prefijo opencode", "`opencode:`"],
    ["prefijo hermes", "`hermes:`"],
    ["prefijo codex", "`codex:`"],
    ["prefijo claude", "`claude:`"],
    ["prefijo manual", "`manual:`"],
    ["prefijo process", "`process:`"],
    ["una sesión que sirvió varios tickets se declara manual", "varios tickets"],
    ["una sesión por ticket", "Una sesión por ticket"],
    ["encabezado: informe", "## Informe y siguiente estado"],
    ["informe breve", "informe breve"],
    [
      "declaración explícita de que no se detectaron hallazgos",
      "una declaración explícita de que no se detectaron",
    ],
    ["comandos exactos para el responsable", "comandos exactos para el responsable"],
    ["queda en awaiting_user_tests", "`awaiting_user_tests`"],
    ["la revisión no opera Git por sí sola", "no opera Git por sí sola"],
  ],
};

for (const [id, reglas] of Object.entries(INVENTARIO)) {
  describe(`las reglas obligatorias de ${id} siguen en el cuerpo (R-SKL-003)`, () => {
    const cuerpo = plano(readFileSync(join(CATALOGO, id, "SKILL.md"), "utf8"));
    it.each(reglas.map(([regla, patron]) => ({ regla, patron })))(
      `regla de ${id}: $regla`,
      ({ patron }) => {
        expect(cuerpo).toContain(patron);
      },
    );
  });
}

// --- Versiones, copias y avisos ----------------------------------------------------------

const RECORTADAS: ReadonlyArray<{ id: string; anterior: string; esperada: string }> = [
  { id: "programar-trabajo-de-tickets", anterior: "1.1.0", esperada: "1.2.0" },
  { id: "planificacion", anterior: "1.3.0", esperada: "1.4.0" },
  { id: "feature", anterior: "1.2.0", esperada: "1.3.0" },
  { id: "revision-final", anterior: "1.3.0", esperada: "1.4.0" },
];

describe("la skill recortada sube su versión y su copia queda igual (R-SKL-003)", () => {
  it.each(RECORTADAS)(
    "C12: versión recortada de $id: $anterior pasa a $esperada",
    ({ id, esperada }) => {
      const texto = readFileSync(join(CATALOGO, id, "SKILL.md"), "utf8");
      expect(/^version:\s*(\S+)$/m.exec(texto)?.[1]).toBe(esperada);
    },
  );

  it.each(RECORTADAS)(
    "C13: copia igual de $id en .valmen/skills, referencias incluidas",
    ({ id }) => {
      expect(readFileSync(join(COPIAS, id, "SKILL.md"), "utf8")).toBe(
        readFileSync(join(CATALOGO, id, "SKILL.md"), "utf8"),
      );
      const nombres = archivosDeReferencias(CATALOGO, id);
      expect(archivosDeReferencias(COPIAS, id)).toEqual(nombres);
      for (const nombre of nombres) {
        expect(readFileSync(join(COPIAS, id, "referencias", nombre), "utf8")).toBe(
          readFileSync(join(CATALOGO, id, "referencias", nombre), "utf8"),
        );
      }
    },
  );

  // `sync` mide la skill proyectada (con su marca), unos 165 B más que el archivo del catálogo.
  // `corrida-orquestada` queda fuera del alcance del ticket y se señala aparte.
  it.each(RECORTADAS)("C17: sin aviso de presupuesto: sync no marca $id", ({ id }) => {
    escribir(join(lab, ".valmen", "config.yaml"), "name: Demo\nskill-budget: 6500\n");
    const r = syncProject(lab, "Demo", false);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain(`La skill \`${id}\` pasa del presupuesto`);
  });
});
