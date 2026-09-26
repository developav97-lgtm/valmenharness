# S4 — Pruebas de interfaz con Playwright, opt-in

Requisitos de la cuarta ola: las pruebas de escritorio/navegador entran al
gate mecánico como un verbo más de los criterios, decididas por el agente y
confirmadas por la persona — nunca impuestas.

## R-S4-001 — El verbo `playwright` en los criterios

Un criterio de aceptación DEBE poder declararse como
`<!-- test: playwright <ruta-del-spec> -->`. El gate mecánico lo ejecuta con el
mismo mecanismo de prefijos autorizados: `playwright` (o `npx playwright test`)
DEBE poder declararse en `test-commands` del proyecto, y el recibo guarda el
resultado con su artefacto (video o traza) referenciado.

## R-S4-002 — El agente propone, la persona decide

Cuando un plan toca una pantalla, el agente DEBE declarar en el plan si
recomienda cubrir el criterio con Playwright y por qué — pero la prueba NO DEBE
escribirse ni registrarse sin la confirmación de la persona. Un plan que no la
recomienda NO DEBE ser penalizado por ello: la ausencia de Playwright no es un
hallazgo.

## R-S4-003 — Configuración equilibrada por proyecto

El proyecto DEBE poder declarar en `.valmen/config.yaml` una sección
`playwright:` con: el comando exacto, el proyecto/navegador por defecto, el
timeout propio (distinto del de los tests de backend) y el modelo de agente
recomendado para escribir y mantener los specs — un identificador de proveedor
y modelo equilibrado en costo, configurable por el proyecto, que el enrutado
usa cuando el ticket es de pruebas de interfaz. Sin esa sección, el verbo NO
DEBE estar disponible: un proyecto sin Playwright configurado no recibe planes
que lo propongan.

## R-S4-004 — El spec vive en el repo, no en la sesión

Lo que entra al gate DEBE ser un test guardado en el repositorio del proyecto,
determinista y repetible sin modelo. El Playwright MCP interactivo PUEDE usarse
para explorar y grabar, pero la evidencia del gate sale de la ejecución del
archivo, no de la sesión del agente.

## R-S4-005 — El tercer verbo: validación en el ambiente desplegado

Un criterio de interfaz DEBE poder declararse `<!-- verify: dev -->`, que es la
validación que hoy se hace a mano: la persona prueba la pantalla en el ambiente
de desarrollo ya desplegado. El proyecto DEBE declarar en `.valmen/config.yaml`
la URL de ese ambiente y, si aplica, el esquema o la rama que lo alimenta:

```yaml
verify-dev:
  url: "https://dev.saiopencloud.co"
  branch: dev            # la rama que alimenta ese ambiente
```

Reglas:

- `verify: dev` es una **declaración explícita**, no una omisión: el criterio
  queda pendiente de la prueba de la persona, igual que `verify: manual`, y el
  ticket NO DEBE pasar a QA hasta que esa prueba se confirme.
- Un criterio `verify: dev` DEJA el ticket fuera de la integración automática
  (R-S5-006), porque su verificación depende de una persona. Es el complemento
  exacto del caso de backend: lo que se prueba con `test:` puede integrarse
  solo; lo que se prueba mirando una pantalla, no.
- Si el ambiente no está declarado, `verify: dev` DEBE rechazarse al validar el
  ticket: prometer una verificación contra un ambiente que no existe es peor
  que no declararla.

