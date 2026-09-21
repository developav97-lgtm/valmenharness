# 11 — Decisiones abiertas

Estas son las preguntas que necesito que respondas antes de escribir la primera línea de
código. Están ordenadas por cuánto bloquean.

---

## Bloqueantes — sin esto no se puede empezar

### Q1. Nombre y comando

Propuse **ValmenHarness** con el comando `valmen` y la carpeta `.valmen/`. ¿Te sirve?

Cosas a considerar antes de decidir:
- El nombre de la carpeta queda en **todos** los repos que se adopten, y en el `AGENTS.md`
  de cada uno. Cambiarlo después es una migración.
- ¿Va a ser un producto que se venda/comparta fuera, o queda interno? Si se comparte, conviene
  un nombre más neutro (`.harness/`, `.agent/`, `.workflow/`).
- Alternativas: `valmen` · `harness` · `vah` · `arsto` · `nexo` · `tejido`

---

### Q2. Licencia y repositorio

| Pregunta | Opciones |
|---|---|
| ¿Licencia? | Interno propietario · MIT · Apache 2.0 · dual (interno libre, comercial pago) |
| ¿Repo? | Nuevo repo privado · dentro de una organización de GitHub · dentro de `ValMenTech/` |
| ¿Se publica en npm? | Público · registro privado (GitHub Packages / Verdaccio) · solo `git clone` + build local |

Recomendación: **repo privado nuevo + licencia interna + publicación en registro privado.**
Permite compartirlo con clientes sin abrirlo, y cambiar de opinión después es fácil
(abrir es irreversible; cerrar es trivial).

---

### Q3. Equipo

¿Cuántas personas trabajan en esto, y con qué dedicación?

- Si eres solo tú: las duraciones del roadmap asumen una persona a tiempo completo.
- Si son varias: las Fases 3 y 4 (gates y web) pueden ir en paralelo.
- ¿Alguien más va a usar el harness en otro proyecto desde el principio? Eso cambia la
  prioridad de las plantillas (B6).

---

### Q4. Alcance del MVP

Confirmar que el MVP es **Fases 0–2** (equivalencia del motor + adopción de la
configuración), con estos criterios:

- ✅ Reemplaza `ticket.py` con equivalencia verificada sobre los 57 tickets
- ✅ `.valmen/` como fuente de verdad
- ✅ `AGENTS.md`, `.codex/`, `.opencode/` generados
- ❌ Sin gates automáticos
- ❌ Sin app web
- ❌ Sin features grandes

¿De acuerdo, o quieres adelantar algo? (Mi recomendación: no adelantar. La equivalencia
primero es lo que permite poner esto en producción sin riesgo, y son solo 3–5 semanas.)

---

### Q5. Compatibilidad con `ticket.py`

¿El modo coexistencia es requisito, o se puede reemplazar directamente?

- **Coexistencia (recomendado):** cero disrupción, pero el paquete de compatibilidad es
  ~1.500 líneas y hay que mantenerlo mientras dure la transición.
- **Reemplazo:** más limpio, pero rompe cualquier script o hábito que dependa de `ticket.py`
  (incluido `Abrir gestor de tickets.command`, el `ticket_viewer.py` y los tests existentes).

---

## Importantes — afectan el diseño

### Q6. "La creación de tickets es bajo demanda"

Tu `AGENTS.md` dice: *"La creación de tickets es bajo demanda: solo se crea o reutiliza un
ticket canónico cuando el PO lo pide explícitamente."*

¿Es **política de SaiOpenCloud** (se preserva como regla del proyecto) o **del harness**
(configurable, con otro default)?

Recomendación: política del proyecto. Es una decisión de gestión, no del motor.

---

### Q7. Umbrales de gate

Propuse `approve_at: 0.90`, `block_at: 0.10`, con la banda media al humano.

¿Te parece bien empezar ahí y calibrar con `valmen gate simulate`? Alternativa más
conservadora: `0.95 / 0.05` (más casos al humano, menos riesgo). Alternativa más agresiva:
`0.85 / 0.15`.

Recomendación: **empezar en 0.95/0.05**, medir un mes, y bajar a 0.90/0.10 con datos.

---

### Q8. Proveedores que quieres conectar primero

Mi propuesta de orden, por lo que ya tienes y por lo que cuesta menos:

1. **OpenRouter** (una API key da acceso a 446 modelos, incluido Jev) — el más rentable
2. **Claude Code OAuth** (ya tienes plan Max)
3. **Codex OAuth** (ya tienes plan)
4. **CodeGraph MCP** (ya lo usas)
5. DeepSeek directo, Moonshot, Zhipu (chinos)

¿Falta alguno que uses? ¿Tienes API key de OpenRouter ya?

**Nota:** para probar definitivamente que Jev funciona necesito una API key de OpenRouter
para hacer una llamada real (~$0.00003). Sin eso, el diseño asume el contrato documentado,
que verifiqué contra la documentación oficial pero no ejecuté.

---

### Q9. Presupuestos

Propuse:

```yaml
budgets:
  per_ticket:  { soft: 2.00, hard: 8.00 }
  per_feature: { soft: 15.00, hard: 60.00 }
  per_day:     { soft: 20.00, hard: 80.00 }
```

¿Son razonables para tu operación? ¿Tienes una referencia de cuánto gastas hoy en tokens por
ticket?

---

### Q10. Acceso remoto

¿Quieres acceso al Mission Control desde fuera de tu red (celular, otra oficina)?

- **No** (solo localhost + Hermes por mensajería) → más simple y más seguro. Es lo que
  recomiendo para el MVP.
- **Sí** → hay que decidir cómo: túnel (Tailscale/Cloudflare), servidor con autenticación, o
  desplegarlo en algo como un VPS. Cambia bastante el modelo de seguridad.

---

## Menores — se pueden decidir sobre la marcha

### Q11. Idioma

¿El producto queda en español (documentación, UI, mensajes) o bilingüe?

Los agentes responden en español por el contexto, pero:
- ¿La UI en español o inglés?
- ¿Los nombres de los estados y tipos de ticket en inglés (como hoy: `intake`, `planned`,
  `FEATURE`) o traducidos?
- ¿El código y los identificadores en inglés (estándar) o español?

Recomendación: **código e identificadores en inglés** (es lo que hace todo el ecosistema,
y evita problemas con librerías), **UI y documentación en español**, **estados del workflow
en inglés** como hoy (cambiarlos rompería los 57 tickets existentes).

---

### Q12. ¿El harness se usa a sí mismo para construirse?

Sería lo lógico y lo más convincente: el propio repo de ValmenHarness con su `.valmen/`, sus
tickets y sus gates. Y es la mejor prueba de que funciona.

Riesgo: al principio el harness es inmaduro y construir el harness con el harness ralentiza.
Recomendación: **empezar a usarlo a partir de la Fase 3**, cuando ya hay motor y gates.
Las Fases 0–2 se construyen con el flujo actual.

---

### Q13. Migración del `ticket_viewer.py`

¿Se retira cuando exista Mission Control, o se deja como está?

Recomendación: dejarlo, marcar en su README que Mission Control lo reemplaza, y retirarlo
solo cuando lleves un mes sin usarlo.

---

### Q14. Los 989 drafts de `.claude/drafts/`

¿Hay algo que rescatar ahí? Son notificaciones acumuladas desde abril. Si hay decisiones o
patrones valiosos, conviene un proceso de rescate (una pasada de análisis que proponga
extraer lo relevante a `.valmen/rules/` o `docs/decisions.md`).

---

### Q15. ¿Qué proyecto sigue a SaiOpenCloud?

El harness se valida mejor con un segundo proyecto. Si ya sabes cuál es, la plantilla se
diseña pensando en él desde el principio. Si es otro stack (no Django+Angular), conviene
saberlo ahora y no después.

---

### Q16. Vocabulario nuevo: ¿schema v2, o no añadir nada? ✅ RESUELTA

**Decisión (2026-09-21): schema v2 único, con migración directa de los 57 tickets.
El usuario eligió reemplazo directo de `ticket.py` (Q5), lo que elimina la restricción que
hacía necesaria la opción de v1 congelado.**

El razonamiento original era: si `ticket.py` sigue vivo durante la coexistencia, no se puede
escribir `schema_version: 2` porque el CLI de Python lo rechaza. Pero al elegir **reemplazo
directo**, `ticket.py` deja de ser una restricción. Mantener dos vocabularios en paralelo
sería ahora complejidad sin contrapartida.

**Lo que se hace:**

1. Un solo esquema: `schema_version: 2`, con los tipos `CHORE` y `DOCS` y el estado `blocked`.
2. Los 57 tickets se migran con `valmen migrate` — operación **idempotente**, con recibo, y
   que **no toca los bloques JSON append-only** (los 1.851 eventos, 137 puntos, 166 ciclos de
   QA y demás se conservan byte a byte).
3. El historial de `state` de las transiciones, que hoy vive embebido en el string `details`,
   se conserva tal cual en los eventos históricos y se estructura en los nuevos
   (ver §2bis.2 del documento de migración).
4. `evidence.kind` pasa a enum cerrado con vía de escape `x-*`. Los 30 valores históricos
   **no se reescriben**: se mantiene una tabla de normalización en `.valmen/config.yaml` para
   que los reportes agreguen correctamente, que es donde el problema se manifestaba.

**Regla de integridad que se conserva:** `valmen` nunca reescribe los bloques append-only de
un ticket. La migración toca el frontmatter y nada más.

<details>
<summary>Planteo original de la pregunta (se conserva como registro)</summary>

Encontré una contradicción en mi propio diseño al leer el validador. El diseño propone añadir
dos tipos de ticket (`CHORE`, `DOCS`) y un estado (`blocked`). Pero:

```python
TICKET_TYPES = { "FEATURE", "BUGFIX", "IMPROVEMENT", "SYNC",
                 "INTEGRATION", "AGENT", "SECURITY", "CLAUDIO" }   # conjunto CERRADO
TICKET_TRANSITIONS = { ... }        # mapa CERRADO, sin `blocked`
if fields["schema_version"] != "1":
    fail("schema_version debe ser el entero literal 1.")          # HARDCODEADO
```

Un ticket `CHORE-...` sería rechazado hoy. Y si `valmen` empezara a escribir
`schema_version: 2`, **el CLI de Python los rechazaría y el modo coexistencia se rompería el
primer día**.

| Opción | Qué implica |
|---|---|
| (a) v1 congelado + v2 para tickets nuevos | Los 57 tickets mantienen las reglas actuales exactas. Coste: mantener dos vocabularios en paralelo. |
| (b) Un solo esquema: no añadir nada | Simplicidad total. Pierdes `CHORE`/`DOCS`/`blocked`. |
| (c) Migrar los 57 tickets a v2 | **(elegida)** Reescribe el frontmatter de los 57 tickets; los bloques append-only no se tocan. |

</details>

---

## Lo que NO necesito que decidas

Para que no pierdas tiempo en cosas que puedo resolver solo:

- **Estructura interna de los paquetes**, el esquema del ticket, el formato de los recibos,
  el diseño de la API web: son decisiones técnicas que propongo y tú revisas en el diseño
  (este documento).
- **Elección de librerías** (Hono, Zod, Vite, Tailwind): estándar, reversible, sin impacto en
  el diseño.
- **El formato de los archivos generados**: el contrato ya está definido por cada agente
  (Codex lee TOML, Claude lee MD, etc.).
- **La integración de Jev**: verificada contra la documentación oficial. Solo falta la
  llamada real cuando haya API key.

---

## Cómo responder

No hace falta que contestes las 15. Con esto me desbloqueas:

1. **Q1** (nombre), **Q2** (licencia/repo), **Q4** (alcance del MVP), **Q5** (compatibilidad)
2. **Q8** (proveedores y si tienes API key de OpenRouter)
3. Cualquier **Q** de las "importantes" que tengas opinión formada

El resto lo propongo yo en la implementación y lo revisas ahí.
