# Stack: Django multi-inquilino + Angular

Lo que este proyecto declara y contra lo que trabajan las skills. **Los archivos
reales del repositorio son la última palabra**: si algo de aquí contradice el
código, gana el código y este archivo se corrige.

## Plataformas

| Capa | Qué es | Dónde se comprueba |
|---|---|---|
| Backend | Django + Django REST Framework | `BackEnd/requirements.txt` |
| Multi-inquilino | Un esquema PostgreSQL por inquilino (`django-tenants`) | `BackEnd/requirements.txt` y las migraciones por esquema |
| Base de datos | PostgreSQL | `docker-compose.yml` |
| Interfaz | Angular con Angular Material | `FrontEnd/package.json` |
| Tiempo real | Node con Express, si el sistema lo tiene | `WebSocket/package.json` |
| Despliegue | Contenedores, con las migraciones antes del despliegue | los `buildspec`/pipelines |

**Las versiones se leen de los manifiestos, no de este archivo.** Este documento
queda como punto de partida de la plantilla: la primera tarea de un proyecto nuevo
es escribir las versiones que tiene de verdad, y cualquier requisito nuevo se
contrasta con las imágenes Docker antes de proponerlo.

## Cómo se corre y cómo se prueba

- **Backend**: `python BackEnd/manage.py test <app>`. Está declarado en
  `test-commands`, así que el gate mecánico puede correrlo desde un criterio de
  aceptación.
- **Interfaz**: el runner del proyecto (Karma/Jasmine en un Angular clásico). Va en
  `test-commands` igual que el del backend; sin declararlo, un criterio no puede
  verificarse solo.
- **Migraciones**: `manage.py makemigrations --check` tiene que salir limpio. Una
  migración que falta se descubre en producción, y en un multi-inquilino se
  descubre multiplicada por la cantidad de inquilinos.

## Convenciones que las skills necesitan

- **Formato regional e idioma**: fechas, números e importes con el formato del
  país donde opera el sistema, y una sola convención en todas las capas.
- **Configuración estricta del compilador** en la interfaz. Un Angular moderno
  activa las comprobaciones estrictas de plantillas: no se relajan dentro de un
  cambio funcional.
- **Pruebas con las utilidades que ya existen** en cada módulo, no con un ayudante
  nuevo por ticket.
- **Los modelos son de negocio; los esquemas, de infraestructura.** Un cambio de
  modelo no decide por sí solo cómo se propaga a los inquilinos.

## Lo que este documento NO es

No es el registro de decisiones: eso vive en `docs/decisions.md`, que la memoria
del harness indexa. Aquí va lo que hay que saber **antes** de tocar el código.
