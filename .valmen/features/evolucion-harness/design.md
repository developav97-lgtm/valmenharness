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

## D7 — La integración automática se decide por la naturaleza del cambio

Decisión de la persona (26-sep): *«si es algo netamente de back y las pruebas
unitarias pasan, podamos ejecutar también la compuerta, aprobar el commit y push
y poder cerrarlo»*. El criterio que hace esto seguro no es la confianza en el
agente: es que el cambio sea **verificable sin una persona**.

| Naturaleza del cambio | Verificación | Integración |
|---|---|---|
| Backend, tests declarados | `test:` corre en el gate mecánico | **Automática** si pasan |
| Pantalla / interfaz | `verify: manual` o `verify: dev` | **Nunca** — la prueba es de una persona |
| Migración, auth, sync, deploy | Gate humano por impacto | **Nunca** |

Por eso `verify: dev` y la integración automática son dos caras de la misma
regla: la presencia de una verificación humana en los criterios desactiva la
integración sola. No hace falta que el agente juzgue si el cambio es "de back":
el motor lo decide por los archivos que el diff toca y por cómo están anotados
los criterios.

La rama de destino se declara y se valida contra una lista de ramas no
productivas. Un `push` a `dev` no es un despliegue: el deploy sigue exigiendo la
frase literal, y esa parte no se toca.

## D8 — La migración es un comando declarado, no una capacidad del motor

El motor no sabe migrar: sabe ejecutar el comando que el proyecto declara, en el
esquema que el proyecto autoriza, y dejar el recibo. Tres decisiones concretas:

- **El esquema está en una lista blanca.** `--schema={schema}` con
  `allowed-schemas: [dev, test, staging]`. Un valor fuera de la lista detiene la
  corrida. Esto no es una validación de forma: es la diferencia entre migrar el
  esquema de pruebas y migrar el de un cliente.
- **Corre antes de las pruebas**, porque un test contra un esquema viejo falla
  por una razón que no tiene que ver con el cambio.
- **`auto: false` por defecto.** El comando se prepara y se informa; ejecutarlo
  solo es una decisión que se toma por proyecto, cuando el esquema es de
  pruebas y nadie más lo está usando. La regla de concurrencia de SaiOpenCloud
  —una base por corrida con `DB_NAME` propio— sigue valiendo.

## D9 — Más validación de Jev en vez de más confirmaciones humanas

Decisión de la persona: *«no tengo problemas en cuántos puntos le metamos
validación con Jev para validar que lo que se hizo cumple, porque muchas veces
las comprobaciones solo se repiten»*. Donde hoy hay una confirmación humana que
siempre da el mismo resultado, la salida correcta es **una proposición más**, no
un clic más.

Dos límites que la hacen segura:

1. **Una proposición no puede desbloquear lo que otra bloqueó** ni promover un
   gate a automático. Añadir validación endurece o informa; nunca relaja.
   Sin esto, "más proposiciones" sería una forma de bajar umbrales por la puerta
   de atrás.
2. **El veredicto lo aplica el código** con sus umbrales, y cada proposición
   queda en el recibo con su respuesta y su costo. Es el invariante 1: el modelo
   evalúa proposiciones, el código decide.

Las proposiciones se declaran por etapa (análisis, plan, integración, cierre) en
la configuración del proyecto, y se editan desde Mission Control igual que el
resto (R-S5-009).
