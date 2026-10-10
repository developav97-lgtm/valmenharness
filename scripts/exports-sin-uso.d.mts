/** La forma de la salida de `knip --reporter json` que este guion lee. */
export interface SalidaDeKnip {
  issues?: {
    file: string;
    exports?: { name: string; line?: number }[];
    types?: { name: string; line?: number }[];
    files?: ({ name: string } | string)[];
  }[];
}
export interface Resultado {
  exitCode: number;
  texto: string;
}
export type EjecutorDeKnip = (directorio: string) => SalidaDeKnip;
export function hallazgosDeKnip(json: SalidaDeKnip): string[];
export function compararConLineaBase(
  actual: string[],
  base: string[],
): { nuevas: string[]; sobrantes: string[] };
export function ejecutarKnip(directorio: string): SalidaDeKnip;
export function comprobar(directorio: string, ejecutar?: EjecutorDeKnip): Resultado;
