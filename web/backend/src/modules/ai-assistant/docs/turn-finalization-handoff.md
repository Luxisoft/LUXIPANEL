# Entrega backend: finalización y recogida de resultados

Fecha: 2026-10-17. Trabajo en el proyecto original, rama `developer`, exclusivamente en backend. La ruta autorizada `backend/` resuelve a `web/backend/`. No se hicieron builds, reinicios, commits ni push.

## Causa constatada

La secuencia «avance → herramienta → avance → herramienta → respuesta» se concatenaba en `agent-run-registry.ts` y se persistía como una sola respuesta. El registro también podía usar el terminal CLI completo como respuesta cuando no había final estructurado. Claude tenía un fallback a todos los textos assistant y Gemini unía mensajes de distintas rondas.

Los cuatro bucles API podían emitir `done` al agotar rondas o recibir una respuesta vacía; una respuesta truncada tampoco se distinguía correctamente del éxito. Los cierres y la reconciliación de trabajadores podían interpretar texto anterior, una pregunta o contenido parcial como tarea completada. El aviso al líder marcaba `nudged` antes de guardar el turno de recogida, por lo que un fallo de encolado podía perder esa entrega.

Las regresiones reproducen esos caminos con eventos y resultados controlados. No se dispuso del stream original de la captura: no se atribuye su tarjeta de error a una causa de red, memoria o permisos no comprobada.

## Corrección entregada

| Rutas relativas al módulo | Comportamiento |
| --- | --- |
| `services/turn-finalization.ts`, `agent.service.ts`, `cli-run-recovery.service.ts` | Mantienen provisional la respuesta hasta comprobar el cierre del proveedor y el tablero del target. Una ejecución con delegaciones pendientes termina su stream con `done.pending: true`, sin publicar una respuesta final. La recuperación se conecta al trabajo existente. |
| `services/agent-run-registry.ts`, `cli-stream-format.ts`, `providers/cli/{bridge-run,recovered-run}.ts` | Persisten/traducen solo la respuesta final; conservan el terminal aparte. EOF sin cierre, salida fallida o falta de final estructurado son error. Los trabajos CLI separados del stream permanecen pendientes. |
| `services/providers/{openai-api,openai-responses,claude-api,gemini-api}.provider.ts`, `api-loop.ts` | Diferencian respuesta final, truncamiento, límite de rondas y respuesta vacía. `operationStatus: unconfirmed` detiene el bucle API con el mensaje y siguiente paso estructurados; no vuelve a pedir otra ejecución al proveedor. |
| `services/api-activity.ts`, `models/api-activity.types.ts`, `assistant-message-persistence.ts`, `repositories/conversations/types.ts` | Guardan avance, llamadas y resultados API aparte del contenido final; preservan orden e identificadores, aplican ocultación de secretos y límites de detalle. |
| `services/team-tasks/{persisted-outcome,service,worker-spawn,lifecycle,waiters}.ts` | Las preguntas/delegaciones no cierran trabajadores. Se usa el último mensaje real y su estado; error y cancelación no son éxito. Las esperas se aíslan por target y conversación. |
| `services/turn-queue.service.ts`, `repositories/agent-queue.repository.ts` | El turno con resultados se guarda antes de reconocer la entrega. `teamTaskIds` permite reconocer una entrega ya encolada tras reinicio y evitar duplicados. Las lecturas del tablero recuperan avisos perdidos sin relanzar trabajadores. Una cancelación humana no drena automáticamente la cola. |
| `services/conversation-message-normalizer.ts` | Una recarga no convierte el log de un turno pendiente en respuesta final. Los mensajes antiguos se conservan. |
| `backend/src/shared/events/index.ts` | Añade `AI_TURN_SETTLED` para el ciclo interno del equipo; `AI_CHAT_FINISHED` queda reservado a turnos sin pregunta ni trabajo pendiente. Los errores terminales siguen notificándose como errores. |

Se mantienen las cuotas, permisos, cancelación, límites de rondas y verificación ejecutable de las tareas. No hay cambios de autenticación, licencia, sesión, executor, configuración ni variables de entorno. El seguimiento del aporte del líder conserva su semántica de delta de código; las contribuciones de trabajadores siguen sujetas a su verificación y al cierre del lote existente.

## Contrato para Valentina

Se leyó `frontend/src/components/floating-assistant/chat-pane/api-activity.completion.qa.md`. Esta entrega responde a su solicitud de separar el proceso API de la respuesta y conservar la traza al recargar. No había un agente frontend accesible mediante el canal de coordinación; este documento constituye el handoff concreto, no una confirmación de integración recibida.

Campos opcionales y compatibles en backend:

- SSE `text.phase`: `commentary` o `final_answer`. Los avances previos a una herramienta se etiquetan como commentary; Responses conserva su fase explícita incluso después de la última llamada. CLI mantiene su terminal actual. El texto final traducido lleva `final_answer`.
- SSE `done.pending: true`: termina el stream actual, pero el trabajo de fondo/equipo aún requiere cierre o recogida. No significa éxito. No mantener abierta la conexión ni confundirlo con el indicador local de generación activa.
- Historial `ConversationMessage.pending?: boolean`: registra ese resultado del turno. Un turno posterior puede resolverlo; no mantener como pendiente el chat entero por un mensaje histórico anterior.
- Historial `ConversationMessage.apiActivity?: { events, truncated?: true }`: `events` contiene `text` con fase commentary, `tool_use` y `tool_result`, en orden. Conserva ids de llamadas; dos llamadas con el mismo nombre siguen siendo distintas. `content` y `textTranslated` contienen únicamente la respuesta, sin concatenar la actividad.
- La identidad existente del mensaje y su `ts` no cambian. El orden del array corresponde a la actividad de ese mensaje; no es un cursor SSE nuevo. Preguntas, errores y cancelaciones conservan sus campos existentes. El tablero de tareas sigue siendo autoritativo.

Consumidores a adaptar por frontend: la copia de `AgentEvent` en `assistant-api/agent-stream.ts`, el DTO de historial, `stream-apply.ts` y `historyTurn()`. Commentary debe ir al detalle del proceso; copiar/voz usan la respuesta. Al recargar se reconstruyen herramientas por id desde `apiActivity`, sin aplicar el antiguo offset al `content` que ya está separado. Si falta el contrato en mensajes antiguos, mantener el comportamiento compatible sin inventar herramientas. Un `done.pending` debe mostrarse como espera/resultado pendiente, sin derivar una respuesta desde el terminal.

La traza conserva hasta 200 eventos y 32.000 caracteres de detalle; cada detalle mayor de 4.000 caracteres se omite antes de procesarlo. `truncated` permite avisarlo al usuario. No se garantiza una copia ilimitada ni sin ocultación de datos sensibles. Los contenidos históricos anteriores no se migran ni se reescriben semánticamente.

## Pruebas y evidencia

Regresiones nuevas: `turn-finalization.test.ts`, `providers/api-completion.test.ts`, `team-tasks/persisted-outcome.test.ts`, `team-tasks/waiters.test.ts`. Se amplían pruebas de parsers CLI, normalización de historial, tareas y cola. Cubren progreso/final con y sin traducción, pendientes, pregunta, EOF, final ausente, CLI de fondo, límites de API, truncamiento, error incierto sin repetición, entrega duradera/dedupe, aislamiento de target y cancelación.

La prueba de ida y vuelta ejecuta el registro real, la persistencia del mensaje y la normalización tras serializar/deserializar JSON, con repositorio simulado y executor comprobado. Verifica respuesta separada, traza ordenada, campos de pendiente y ocultación de secretos; no sustituye QA HTTP en producción. La prueba de límites detectó un procesamiento costoso de texto muy grande; el tamaño se comprueba ahora antes de ocultar sus datos, y la regresión pasa sin ampliar timeouts.

Los fixtures de contribuciones y MCP se actualizaron para aislar las dependencias de tablero, autorización y conexión GitHub de sus escenarios sintéticos. No se relajaron comprobaciones de producción.

Comandos ejecutados desde backend:

```bash
env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck
npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=2 --minWorkers=1
git diff --check
```

Resultados finales: typecheck con salida **0**; Vitest con **96 suites aprobadas, 942 pruebas aprobadas y 1 omitida**, salida **0**, duración 34,08 s. La omitida pertenece al escenario preexistente de lanzamiento de recursos CLI. `git diff --check` terminó con salida **0**. Los avisos de errores provocados por los fixtures no son evidencia de fallos en los servicios de producción.

## QA y límites de entrega

1. Integrar los campos anteriores en frontend y probar SSE → historial HTTP → recarga: avances en detalles, resultado final en burbuja/copia/voz, llamadas con igual nombre e ids distintos, traducción y error sin final.
2. Delegar una tarea que siga activa cuando cierre el líder: debe quedar pendiente; al terminar, recoger una sola vez y producir el resumen posterior. Simular fallo de encolado y recuperación del tablero; comprobar que no se vuelve a lanzar el trabajador.
3. Probar pregunta de un trabajador, cancelación humana, fallo verificable y límite del proveedor. Ninguno debe convertirse en éxito ni ignorar una aprobación pendiente. Ante resultado incierto, comprobar el estado de la operación antes de cualquier repetición manual.
4. Andrés mantiene exclusivamente build/restart y verificación de proceso online, HTTP y logs después de integrar frontend. Esta entrega no acredita un despliegue ni el funcionamiento de proveedores reales en el panel instalado.

No se promete terminar siempre: un fallo de conexión, presupuesto, autorización, almacenamiento o del proveedor puede requerir intervención. La recuperación añadida entrega resultados existentes; no implementa una transacción distribuida ni una garantía de exactamente una ejecución ante una caída en cualquier instrucción. Los proveedores CLI de texto plano conservan su compatibilidad y carecen de la señal estructurada disponible en Claude/Gemini/Codex. Sin fase ni frontera de herramienta no puede inferirse con certeza que un texto libre sea un avance.

El canal protegido de módulos fue consultado; no ofrecía operaciones de Obsidian ni del grafo para esta sesión. No se publicó nota en Obsidian. No se editaron frontend, infra ni documentación compartida.

## Nota publicable para el líder

El líder debe incorporar una nota NUEVA en `docs/changes/2026-10-17-finalizacion-y-resultados-asistente.json` tras revisar la integración. Se respeta la prohibición de editar documentación compartida desde esta tarea; no se alteró la nota frontend ya existente.

```json
{
  "title": "Respuestas finales y resultados del equipo más claros",
  "changes": [
    "El asistente separa los avances de la respuesta final y conserva la actividad de las herramientas en el historial.",
    "Los trabajos pendientes, las preguntas y las ejecuciones interrumpidas ya no se consideran completados por tener texto de avance.",
    "La recogida de resultados del equipo puede recuperarse tras un fallo de entrega sin volver a ejecutar las tareas."
  ]
}
```
