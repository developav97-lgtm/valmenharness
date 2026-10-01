# Estándares propuestos

Reglas que el trabajo enseñó y que **todavía no están en vigor**. Las decide una
persona —desde Mission Control o pidiéndoselo a un agente— y al aceptarlas
pasan a `.valmen/rules/estandares-<área>.md`, que es lo que llega al
`AGENTS.md`. La decisión queda escrita con la frase que la autorizó.

### [EST-001] Cuándo se usa la cascada verificada

- **Área:** proceso
- **Propuesto:** 2026-09-27
- **Estado:** aceptado
- **Decidido:** 2026-09-27 · «si acepto el estandar»

**Regla:** En un gate con proposiciones que solo un modelo puede responder se corre el evaluador `cascade` cuando el artefacto tiene sustancia y el veredicto cierra una transición —el análisis de un ticket con diagnóstico escrito, el plan de un cambio que toca código, el cierre con criterios declarados—, y se corre el evaluador de siempre cuando el gate se resuelve en código, cuando el cambio es de texto o de configuración, o cuando el estado no cambió desde la corrida anterior. El evaluador elegido se declara al correr el gate: el recibo lo guarda, y sin eso la decisión no se puede auditar después.

**Por qué:** La cascada gasta tres llamadas donde el evaluador de siempre gasta una —produce el modelo barato, verifica cada proposición y solo lo que el verificador no respalda vuelve al modelo superior—, así que se paga cuando el veredicto importa y el artefacto tiene sustancia. La referencia medida es ~7% del costo con 0 errores adicionales (docs/auditoria-20260926).

### [EST-002] Gateway y avisos por Telegram

- **Área:** proceso
- **Propuesto:** 2026-10-01
- **Estado:** aceptado
- **Decidido:** 2026-10-01 · «Slack apagado y avisos por Telegram con los dos vigías reescritos; lo confirmo el 2026-09-30 después de probar la recepción en Telegram»

**Regla:** La entrega y los avisos de la jornada (arranque, awaiting_user_tests, compuertas en REVIEW) salen por el bot de Telegram del perfil del proyecto —TELEGRAM_ALLOWED_USERS del .env—; Slack queda como canal secundario apagado. Un nuevo aviso se agrega al vigilante de avisos, no a un mensaje suelto.

**Por qué:** Migración decidida por el PO el 2026-09-30: los DM de Slack a veces no llegaban al celular y la gateway ya sirve Telegram en ambos perfiles; un solo canal de avisos evita revisar dos aplicaciones para lo mismo.
