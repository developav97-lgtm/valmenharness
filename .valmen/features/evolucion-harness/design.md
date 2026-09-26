# Diseño — Evolución del harness

Las decisiones técnicas de las cinco olas y las que bajó la persona el 26-sep-2026.

## D1 — Reanudación compacta: contrato nuevo, no resumen del modelo

`reanudar_ticket` gana un parámetro `modo: compacto | completo`, con `compacto`
por defecto en el servidor MCP. El resumen lo arma el **motor** desde la
máquina de estados y los bloques del ticket —estado, plan vigente, puntos
abiertos, último recibo, instrucción «lee la sección X con ver_ticket si la
necesitas»— y no un modelo: es decidible en código, así que se decide en código
(invariante 1). El documento entero sigue a una llamada.

Alternativa descartada: resumir con un modelo barato. Es no determinista sobre
el artefacto más auditado del sistema, y ahorra tokens de entrada pagando con
fidelidad del contexto — justo donde el contexto manda.

## D2 — Las capacidades nuevas son opt-in y confirmadas, por diseño

Decisión de la persona (26-sep): *«no quiero que sea obligación, el agente
debería indicar si aplica y consultarlo con el usuario antes de escribir la
ejecución y mandarla»*. Se aplica a Playwright (R-S4-002) y se generaliza:

- Una capacidad nueva que escribe o ejecuta nace **apagada**: sin la sección en
  `.valmen/config.yaml`, el verbo no existe para el proyecto (R-S4-003).
- El agente **propone y justifica** en el plan; la persona confirma antes de
  escribir. La ausencia de la capacidad nunca es un hallazgo del gate.
- El gate mecánico valida lo declarado; no exige lo no declarado.

## D3 — Roles de ejecución con modelo por rol, heredados de crm-valment

crm-valment ya decidió perfiles de ejecución (V1 mecánico / I1 acotado / D1
crítico / R1 revisión / C1 cierre) con modelo y esfuerzo por perfil. La Ola 1
los incorpora como **enrutado por rol declarativo** en `routing.yaml`:

```yaml
roles:
  explore:    { model: deepseek-v4.1-flash }   # barato, volumen
  implement:  { model: <equilibrado> }          # costo medio
  verify:     { model: deepseek-v4.1-flash }   # mecánico
  ui-specs:   { model: <equilibrado-elegido> }  # specs Playwright, por proyecto
```

El «modelo equilibrado para este proceso» que pidió la persona es **una entrada
de configuración por proyecto**, no un modelo fijo del harness: cada proyecto
declara el suyo (candidatos razonables hoy: `deepseek-v4.1-flash` para
exploración/verificación, y para implementación y specs el que el proyecto
mida mejor en `reporte_valor` — esa es justamente la capacidad 10 del análisis
de mercado: benchmark propio sobre los tickets reales del cliente).

## D4 — La cascada verificada entra por la clasificación y la exploración

El patrón (barato produce → evaluador verifica → escala solo si falla) se aplica
primero donde el error es barato y el volumen alto: clasificar el tipo del
ticket y explorar el código. La descomposición de features y el análisis de
causa raíz quedan en el modelo fuerte hasta que la evidencia de la cascada lo
justifique. Cada escalamiento queda en el recibo con su motivo.

## D5 — Manuales: proceso encadenado al deploy, no feature del motor

Los manuales son un **proceso declarativo** (`actualizar-manuales`) que el
deploy encadena, no una máquina de estados nueva. La metodología de escritura
vive como **skill del proyecto** (la de SaiOpenCloud ya existe y es buena: no
se reinventa, se declara). La base vectorial es un **plugin**: el motor publica
el corpus (tres colecciones con origen y fecha); el indexador y la base son
sustituibles (sección E de 12-FUNCIONALIDADES: nada de vendor obligatorio).

## D6 — Portafolio: agregación por declaración, no registro compartido

Cada proyecto conserva su `.valmen/` y su máquina (invariante 5: el estado vive
en disco, y dos proyectos no comparten escritor). Mission Control recibe una
lista de raíces declaradas y **agrega lectura**: gates pendientes, procesos
detenidos, consumo del mes. Escribir sigue siendo por proyecto, con su MCP
propio — que es además cómo Hermes lo monta por perfil (R-S2-004).
