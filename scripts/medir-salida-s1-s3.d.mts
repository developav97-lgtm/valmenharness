export interface Ejecucion {
  status: number;
  stdout: string;
  stderr: string;
}
export type Ejecutor = (root: string, argumentos: string[]) => Ejecucion;
export interface Medicion {
  root: string;
  valida: boolean;
  ticketsValidos: number | null;
  salidaDeValidacion: string;
  precision: string;
  errorDePrecision: string;
}
export function ejecutarValmen(root: string, argumentos: string[]): Ejecucion;
export function medirRegistro(root: string, ejecutar?: Ejecutor): Medicion;
export function renderInforme(mediciones: Medicion[], fecha: string): string;
export function medirSalida(
  raices: string[],
  ejecutar?: Ejecutor,
  fecha?: string,
): { informe: string; exitCode: number; mediciones: Medicion[] };
