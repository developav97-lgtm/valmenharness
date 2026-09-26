# S5 — Autonomía acotada

Requisitos de la quinta ola: tickets elegibles ejecutados de punta a punta sin
intervención —incluida la integración—, con la elegibilidad decidida por
configuración auditable, las migraciones al esquema de pruebas declaradas por
proyecto, y la evidencia de calibración delante. Se construye al final, con las
olas anteriores en producción.

## R-S5-001 — Elegibilidad por configuración

DEBE existir una sección `autonomous:` en `.valmen/config.yaml` que declare:
tipos de ticket elegibles, riesgo máximo, módulos excluidos, condiciones
requeridas (plan aprobado, tests declarados, sin impactos críticos) y límites
(máximo concurrente, máximo por día, presupuesto por ticket, condiciones de
parada). El agente NO DEBE poder tomar un ticket fuera de esa lista: el motor
ofrece solo lo que cumple los criterios declarados.

## R-S5-002 — Ejecución desatendida hasta `awaiting_user_tests`

`valmen run` DEBE llevar un ticket elegible desde su estado actual hasta
`awaiting_user_tests` sin intervención: análisis, plan, gates automáticos,
implementación y entrega del contrato de pruebas. La prueba del responsable y
cualquier gate de riesgo alto SIGUEN siendo de una persona, salvo lo que declara
R-S5-006 y R-S5-010.

## R-S5-003 — Colisiones de escritura antes de paralelizar

Antes de ejecutar dos tickets en paralelo sobre el mismo repositorio, el motor
DEBE contrastar los archivos que cada plan declara tocar y aplicar la política
configurada (`warn`, `serialize` o `block`). La detección es mecánica: archivos
declarados, no inferencia del modelo.

## R-S5-004 — Promoción de gates por evidencia

Un gate híbrido SOLO DEBE promoverse a automático cuando la calibración contra
decisiones humanas registradas muestre el umbral cumplido (la simulación con
las últimas N decisiones), y la promoción queda registrada con su evidencia.
Sin ese número, el gate NO DEBE promoverse aunque la configuración lo pida.

## R-S5-005 — Parada segura

Cumplida una condición de parada (gate bloqueado dos veces, fallo de pruebas,
secreto detectado, presupuesto superado), la ejecución DEBE detenerse dejando
el ticket en un estado válido del contrato, con el motivo en el recibo y el
aviso emitido. Una corrida detenida NO DEBE reintentarse sola.

## R-S5-006 — Integración desatendida (commit y push) bajo condiciones

`valmen run` DEBE poder commitear y hacer push sin intervención cuando **todas**
estas condiciones se cumplen, y NO DEBE integrar cuando alguna falte:

1. El tipo del ticket está en la lista de tipos integrables (por defecto
   BUGFIX, CHORE, DOCS, IMPROVEMENT).
2. El riesgo es `normal` o menor, y no hay impactos de migración, contenedores,
   autenticación, sincronización ni despliegue.
3. El diff **no toca archivos de interfaz** — el cambio es de backend, pruebas
   o documentación. Un cambio que toca una pantalla nunca se integra solo.
4. Los criterios declarados con `<!-- test: … -->` existen y **pasan**, con su
   recibo del gate mecánico. Un criterio `verify: manual` o `verify: dev` deja
   el ticket fuera de la integración automática.
5. La validación semántica aprueba (R-S5-007).
6. `valmen secrets` y `valmen drift` no reportan hallazgos sobre el cambio.

La rama destino DEBE ser la declarada por el proyecto y NO DEBE ser una rama de
producción: `dev` sí, `main`/`production` no — y el motor NO DEBE aceptar una
configuración que apunte a producción. El push DEBE ser al remoto configurado,
nunca `--force`, y NO DEBE crear ni mover tags de release.

Un proyecto que no declare `autonomous.integration` (o lo declare en `false`)
NO DEBE integrar nada: el comportamiento de hoy, donde la persona confirma el
commit, sigue siendo el defecto.

## R-S5-007 — Validación semántica ampliada por etapa

El proyecto DEBE poder declarar proposiciones adicionales de Jev por etapa del
flujo, para que la persona no tenga que revisar a mano lo que la validación ya
comprobó. Cada proposición añadida DEBE quedar en el recibo con su respuesta, su
umbral y su costo, y el veredicto lo decide el código aplicando los umbrales,
no el modelo.

Las proposiciones adicionales NO DEBEN poder ampliar la autoridad de una
compuerta: una proposición no puede desbloquear lo que otra bloqueó, ni
promover un gate a automático. Añadir validación endurece o informa; nunca
relaja.

Para la integración desatendida, la proposición que decide DEBE verificar que lo
implementado corresponde al plan aprobado y a la solicitud original, y que no
hay cambios fuera del alcance declarado.

## R-S5-008 — Migración automática al esquema de pruebas

El proyecto DEBE poder declarar en `.valmen/config.yaml` la migración que se
ejecuta para dejar el esquema de pruebas al día, con su comando exacto, el
esquema destino y si corre sola:

```yaml
migrations:
  auto: false          # el defecto es no ejecutar nada
  command: "python BackEnd/manage.py migrate --schema={schema}"
  schema: dev
  allowed-schemas: [dev, test, staging]   # nunca un esquema de producción
```

Reglas:

- El esquema destino DEBE estar en `allowed-schemas`. Un esquema fuera de esa
  lista detiene la corrida con el motivo; el motor NO DEBE ejecutar una
  migración contra producción aunque la configuración lo pida.
- La ejecución DEBE quedar en el recibo con el comando exacto, el esquema, el
  resultado y la duración, y DEBE correr **antes** de las pruebas que dependen
  del esquema.
- Un fallo DEBE detener la corrida y avisar; NO DEBE continuar con el esquema a
  medias ni reintentar sola.
- `auto: false` significa que el comando se prepara y se informa, pero lo
  ejecuta una persona.

## R-S5-009 — Todo lo anterior se configura desde la interfaz

Las secciones `autonomous`, `migrations`, `playwright` y las proposiciones
adicionales por etapa DEBEN poder verse y editarse desde Mission Control, con
las mismas validaciones del archivo: un valor que el motor rechazaría en el
YAML DEBE rechazarse también en la pantalla. La pantalla NO DEBE permitir
declarar una rama de producción como destino de push ni un esquema fuera de la
lista permitida.

## R-S5-010 — Cierre desatendido con autorización permanente

El cierre de un ticket elegible PUEDE automatizarse **solo** cuando la persona
dejó una autorización permanente y registrada con sus palabras —el equivalente
a «si es de backend y las pruebas pasan, cerralo»—, escrita con
`--instruccion` y conservada en el recibo del cierre.

Sin esa autorización, el cierre sigue pidiendo la confirmación de la persona, y
el agente NO DEBE escribir por ella. La autorización DEBE poder revocarse, DEBE
aplicar solo a los tipos y condiciones declarados, y NO DEBE cubrir nunca: QA
eximida, release, despliegue, ni un ticket con puntos abiertos.
