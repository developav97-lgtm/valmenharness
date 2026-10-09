# Aprobaciones de Claude en la feature vista-agentes

Delegación del PO (2026-10-08): «como ves estoy aprobando con tus recomendaciones […] vamos a seguir tus
recomendaciones para este feature, entonces vas a colocar que se aprueba por claude y la razón de la decisión
para al final de la sesión con el feature revises las aprobaciones para ver si hay que refinar las compuertas».

Alcance: REVIEW de compuertas de esta feature. SECURITY, un `block`, despliegues, la opción B (texto de pregunta
y respuesta, que amplía la lista blanca del lector) y el cierre de QA siguen siendo del PO.

Hasta aquí el PO aprobó cada REVIEW con su propia frase («Recomiendo A/B…»); los registros de abajo son los que
Claude decide desde la delegación.

## Lo que el PO aprobó antes de la delegación (para la revisión final de compuertas)

| Ticket | Compuerta | Motivo del REVIEW | Decisión del PO |
|---|---|---|---|
| FEATURE-SERVER-SESION-PRINCIPAL | análisis | `nombra_archivos_reales` 0.79 | aprobó |
| IMPROVEMENT-WEB-VISTA-RENOMBRAR-AGENTES | plan | C10-C12 manuales en 0.90 (3.ª REVIEW) | aprobó |
| FEATURE-SERVER-PREGUNTA-PENDIENTE | análisis | `nombra_archivos_reales` 0.67 (precheck sin git) | aprobó |
| FEATURE-WEB-MOTOR-ESCENA | análisis / plan | 0.29 (precheck sin git) / 11 criterios 0.75-0.88 | aprobó ambos |
| FEATURE-WEB-VISTA-LIENZO | análisis / plan | 0.63 / 9 criterios 0.77-0.89 tras dos vueltas | aprobó ambos |
| IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO | análisis / plan | 0.79 / 7 criterios 0.79-0.90 tras dos vueltas | aprobó ambos |
| FEATURE-WEB-MUNDO-PASTELERIA | plan | 12 criterios en banda (C31 en 0.13) | pidió dos vueltas más (en curso) |

Patrones a revisar al final: `cascade` falla sin detalle en el análisis; el precheck dice «raíz no es un
repositorio git» desde el worktree y baja `nombra_archivos_reales`; los criterios manuales rozan 0.90 o quedan
debajo aunque el plan los cubra.

## Decisiones de Claude

(Se anexan abajo: ticket · compuerta · recibo · decisión · razón.)

- **FEATURE-WEB-MUNDO-PASTELERIA · plan · GR-20261009-FEATURE-WEB-MUNDO-PASTELERIA-20261008-plan-3** · approve por
  claude (REVIEW). Razón: tras tres vueltas los criterios son atómicos (media 0.926), 9 de 13 en banda están
  exactamente en 0.90 y el evaluador es inconsistente (C37 marcado compuesto con la misma forma que C34-C36,
  aprobados).
  Hallazgo: `approval-eligibility` dice NO ELEGIBLE porque `APA-20261008-c2d3a3` «no lista el módulo WEB (lista
  todos)»: la autorización con «todos» no cubre un módulo concreto. La aprobación del plan sigue siendo de una persona.

- **FEATURE-WEB-MUNDO-PASTELERIA · plan** · aprobado por la autorización APA-20261009-2cf4af (creada por el PO),
  no por Claude. Hubo que commitear la autorización en main y traerla a la rama del worktree: las autorizaciones
  viven en `.valmen/approval/` y un worktree creado antes no las ve. Hallazgo para la revisión final.

- **FEATURE-WEB-MUNDO-CONTROL · análisis · GR-20261009-FEATURE-WEB-MUNDO-CONTROL-20261008-analysis-1** · approve por
  claude (REVIEW). Razón: un solo punto bajo (`nombra_archivos_reales` 0.77, patrón ya visto: el precheck no
  comprueba citas desde el worktree), el resto en 0.91 o más, y el diagnóstico cita lo que ya existe en main.
  Supuestos decididos por Claude con la opción por defecto propuesta (el PO delegó seguir mis recomendaciones):
  títulos de panel «Telemetría», «Misiones en espera» y «Misiones cerradas»; Chakra Petch sin descargar, con
  fuente de respaldo; el punto del ticket se desliza por la pista y el operador se queda en su consola; cinco
  consolas, y desde el sexto agente dos comparten; franja de turno sin «OLA» y pregunta derivada de la estación;
  se acepta que el operador camine hasta la dirección antes de salir (corregirlo cambia el motor, fuera de alcance).

- **FEATURE-WEB-MUNDO-CONTROL · plan · GR-20261009-FEATURE-WEB-MUNDO-CONTROL-20261008-plan-1** · approve por claude
  (REVIEW) y aprobación del plan por la autorización APA-20261009-2cf4af. Razón: pasos, verificabilidad y rollback en
  0.99; la banda (27 criterios entre 0.55 y 0.89) viene de la redacción, y partir C36-C38 pasaría de 40 criterios (el
  precheck lo rechaza); la pastelería pasó con la misma forma.

- **FEATURE-WEB-MUNDO-INVERNADERO · análisis · GR-20261009-FEATURE-WEB-MUNDO-INVERNADERO-20261008-analysis-1** · approve por claude (REVIEW). Razón: un solo punto bajo
  (`nombra_archivos_reales` 0.81, patrón ya visto), el resto entre 0.91 y 0.95 y clasificación completa.
  Cinco decisiones de diseño resueltas por Claude con la opción por defecto del ticket (el PO delegó seguir mis
  recomendaciones): títulos de los tres paneles del invernadero; Caveat con pila de respaldo y sin descarga externa;
  gotas de la regadera sin azar y con duración fija; tope de tres sobres de la cola en el semillero; el jardinero que
  termina sale hacia el puesto principal del motor (no hacia el semillero, como en el prototipo).

- **FEATURE-WEB-MUNDO-INVERNADERO · plan · GR-20261009-FEATURE-WEB-MUNDO-INVERNADERO-20261008-plan-1** · approve por
  claude (REVIEW) y aprobación del plan por la autorización APA-20261009-2cf4af. Razón: pasos, verificabilidad y
  rollback en 0.99; ningún criterio bajó a zona de bloqueo (24 de 40 entre 0.80 y 0.89 por redacción); partir los
  siete compuestos choca con el tope de 40 y los otros dos mundos pasaron con la misma forma.

- **FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA · análisis · GR-20261009-FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008-analysis-1** · approve por claude (REVIEW). Razón: dos puntos en
  banda (`causa_especifica` 0.89, `nombra_archivos_reales` 0.75, patrón ya visto), el resto aprobado, y el
  diagnóstico cita lector, endpoint y `--host` con ruta:línea. La decisión de privacidad (R-DAT-004) es la frase
  literal del PO, no de Claude.
  Supuestos decididos por Claude y que el PO debe poder revisar (tocan privacidad): sin `--host` en 127.0.0.1 no se
  expone el texto (la señal es `writeToken`); recorte a 500 caracteres; el texto sale de
  `input.questions[].question` y la respuesta de `toolUseResult.answers`.
  Hallazgo de proceso: el subagente movió el ticket a `analyzed` antes de correr la compuerta de análisis; el
  brief la pone en `intake`.

- **FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA · plan · GR-20261009-FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA-20261008-plan-2**
  · approve por claude (REVIEW) y aprobación del plan por la autorización APA-20261009-2cf4af. Razón: tras dos
  vueltas C17, C19 y C20 salieron de la banda, los nueve restantes están entre 0.84 y 0.89 (forma de redacción) y el
  plan cubre no filtrado, `--host` y recorte con pruebas concretas.

- **FEATURE-SERVER-TEXTO-PREGUNTA-RESPUESTA · C24** · el PO decidió cambiar el comando del criterio a
  `npx tsc --build tsconfig.build.json` («Recomiendo A, cambia el comando de C24»), porque `tsc --noEmit -p
  tsconfig.json` da 10 avisos TS7016 previos (módulos `web/agentes/**` sin declaración importados por las
  pruebas). Hallazgo para la revisión final: los criterios de compilación deben usar la compilación real.

- **FEATURE-WEB-VISTA-TEXTO-PREGUNTA · análisis · GR-20261009-FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008-analysis-1** · approve por claude (REVIEW). Razón: un solo punto bajo
  (`nombra_archivos_reales` 0.76, patrón ya visto), ubica el cambio 0.95, causa específica 0.91, y el diagnóstico
  cita los tres consumidores con ruta:línea y el escapado ya existente (`textContent`, `fillText`).
  Supuestos decididos por Claude con la opción por defecto: el texto va en el aviso de los tres mundos y en la
  franja del centro de control, sin bocadillo en pastelería ni invernadero (como el prototipo); en la franja se
  recorta con «…»; sin `texto`, la franja conserva la pregunta inferida de hoy.

- **FEATURE-WEB-VISTA-TEXTO-PREGUNTA · plan · GR-20261009-FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008-plan-1** · approve
  por claude (REVIEW) y aprobación del plan por la autorización APA-20261009-2cf4af. Razón: sin BLOCK, media
  ponderada 0.926, 38 criterios de una sola afirmación y diez en banda (0.82-0.90) por redacción; el escapado tiene
  prueba (C7, C8, C20, C22, C23) y el caso sin `texto` también.
