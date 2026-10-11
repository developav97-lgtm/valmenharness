/**
 * Qué es una ruta del repositorio: sus categorías y si es un archivo de prueba.
 *
 * Estas dos clasificaciones tienen **una sola definición**, aquí, y la leen quienes necesitan saber
 * de qué clase es lo que toca un diff: la elegibilidad de QA por agente (¿puede un agente
 * aprobarse esto?), el qa-agent (¿el diff trae una prueba nueva?) y el riesgo de la revisión
 * (¿cuánto cuidado pide?). Tres copias de una expresión regular se separan en silencio, y la que se
 * separa decide algo distinto sin que ninguna prueba lo vea (D4 de la feature
 * guardas-verificacion-harness).
 */

/**
 * Las categorías de ruta, en el orden en que se evalúan. `critica` dice si tocarlas sube la
 * revisión a riesgo alto: «pantallas» no lo es —cambia lo que se ve, no lo que protege—, las otras
 * cinco sí.
 */
const CATEGORIAS_DE_RUTA: readonly {
  readonly nombre: string;
  readonly patron: RegExp;
  readonly critica: boolean;
}[] = [
  {
    nombre: "pantallas",
    patron:
      /(^|\/)(templates|FrontEnd|frontend|web|static)\/|\.(html|tsx|jsx|vue|svelte|css|scss)$/i,
    critica: false,
  },
  { nombre: "migraciones", patron: /(^|\/)migrations?\/|\.sql$/i, critica: true },
  {
    nombre: "configuración de despliegue",
    patron:
      /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.dockerignore|nginx[^/]*|k8s|helm|terraform|deploy)(\/|$)/i,
    critica: true,
  },
  {
    nombre: "autenticación",
    patron:
      /(^|\/)(auth[^/]*|login[^/]*|permissions?[^/]*|passwords?[^/]*|jwt[^/]*|oauth[^/]*|credentials?[^/]*)(\/|\.|$)/i,
    critica: true,
  },
  {
    nombre: "CI",
    patron:
      /(^|\/)(\.github\/workflows|\.gitlab-ci\.ya?ml|\.circleci|azure-pipelines[^/]*|Jenkinsfile)(\/|$)/i,
    critica: true,
  },
  {
    nombre: "el registro y la configuración del harness (.valmen/)",
    patron: /^\.valmen\//,
    critica: true,
  },
];

/** Los archivos de prueba: lo que vive bajo `tests/`, `test/`, `__tests__/` o `spec/`, y su nombre. */
const ES_PRUEBA =
  /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$/i;

/**
 * **Todas** las categorías que casan con una ruta, en el orden de la lista. La ruta se espera ya
 * normalizada (sin `./` inicial). Devolver todas y no la primera importa para el riesgo: una ruta
 * como «frontend/src/auth/login.tsx» casa con «pantallas» antes que con «autenticación», y la
 * primera sola la dejaría fuera de las críticas.
 */
export function categoriasDeRuta(
  ruta: string,
): { readonly nombre: string; readonly critica: boolean }[] {
  return CATEGORIAS_DE_RUTA.filter(({ patron }) => patron.test(ruta)).map(
    ({ nombre, critica }) => ({
      nombre,
      critica,
    }),
  );
}

/** Si la ruta es un archivo de prueba. */
export function esArchivoDePrueba(ruta: string): boolean {
  return ES_PRUEBA.test(ruta);
}
