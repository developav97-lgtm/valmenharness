// Registro de los mundos de la vista Agentes (FEATURE-WEB-VISTA-LIENZO-20261008).

import { mundo as control } from "./control.js";
import { mundo as invernadero } from "./invernadero.js";
import { mundo as pasteleria } from "./pasteleria.js";

export const MUNDOS = [pasteleria, control, invernadero];

export const MUNDO_POR_DEFECTO = "pasteleria";
