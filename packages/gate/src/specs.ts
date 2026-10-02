/** La forma del spec se decide aquí; quien conoce el repositorio consulta el disco. */
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

export interface RepositorioDeSpecs {
  readonly root: string;
  /** Recibe la ruta absoluta ya comprobada y dice si es un archivo regular. */
  readonly esArchivo: (ruta: string) => boolean;
}

/** No normaliza una ruta inválida en silencio: devuelve la ruta canónica o el motivo. */
export function specDelRepositorio(
  ruta: string | undefined,
  repo?: RepositorioDeSpecs,
): { readonly ruta: string } | { readonly motivo: string } {
  if (ruta === undefined || ruta.trim() === "") {
    return { motivo: "falta la ruta del spec: se requiere un archivo del repositorio" };
  }
  if (isAbsolute(ruta) || win32.isAbsolute(ruta) || /^[a-z]:/i.test(ruta)) {
    return { motivo: `el spec «${ruta}» debe tener una ruta relativa, no absoluta` };
  }
  if (repo === undefined) {
    return {
      motivo: `no se declaró el repositorio del spec «${ruta}»: no se puede comprobar que sea un archivo del repositorio`,
    };
  }

  const absoluta = resolve(repo.root, ruta);
  const relativa = relative(resolve(repo.root), absoluta);
  if (relativa === ".." || relativa.startsWith(`..${sep}`) || isAbsolute(relativa)) {
    return { motivo: `el spec «${ruta}» está fuera del repositorio` };
  }
  if (
    ruta.includes("\\") ||
    ruta.includes("\0") ||
    ruta.split("/").some((parte) => parte === "" || parte === "." || parte === "..") ||
    relativa.split(sep).join("/") !== ruta
  ) {
    return {
      motivo: `el spec «${ruta}» debe tener una ruta canónica, sin segmentos vacíos, «.» ni «..»`,
    };
  }
  if (!repo.esArchivo(absoluta)) {
    return { motivo: `el spec «${ruta}» no existe como archivo regular del repositorio` };
  }
  return { ruta };
}
