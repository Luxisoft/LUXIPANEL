# Contrato de recuperación por ejecución — entrega backend

Fecha: 2026-10-17. Responsable: Mateo.
**Backend implementado y validado; consumidor frontend pendiente de asignación.**
Esta entrega no cambia el gate integrado a PASS y no autoriza build/restart.
El contrato se entregó al comienzo y se confirma aquí tras las pruebas.

## Alcance y diagnóstico

Checkout original `/var/www/LUXIPANEL`, rama `developer`.
Se preservaron los cambios previos del registro de ejecuciones y los archivos
de otros responsables. Sin copias del proyecto, worktrees, cambio de rama,
commits, push, build, restart ni despliegue.

A podía terminar de guardar, entregar la conversación a B y perder su buffer.
El cursor numérico de A se aplicaba entonces a B: un buffer corto no entregaba
ningún terminal y un buffer vivo reiniciaba sus secuencias. Además, el controlador
fabricaba `done` cuando el buffer desaparecía antes de attach, y esperaba
indefinidamente si ya se había consumido el terminal.

La corrección identifica el buffer con un UUID, exige identidad al reanudar un
cursor y da una señal explícita de reconciliación cuando la identidad no coincide.
No conserva buffers ilimitados ni traslada el historial al proceso del panel.

Leídos AGENTS.md, web/CLAUDE.md (el CLAUDE.md de la raíz ya no existe),
arquitectura backend, documentación del módulo, referencias de arquitectura/SDK
de web y docs/changes/README.md; informe de Camila, handoff de continuidad
y races.test.ts de QA, sin editar evidencia ajena.
Se descubrieron modules.list/describe y se usaron files.read/write con revisión
2:0. El canal del grafo no expuso herramientas invocables. La nota pública,
fuera del ámbito Files del agente, se creó con permiso de ejecución escalado.
No hubo una avería de conexión del servidor.

## Contrato HTTP/SSE confirmado

Ámbito siempre: target conectado + usuario autorizado + conversación.
`runId` identifica **un buffer en memoria**, no un mensaje histórico, una tarea
de equipo ni una clave idempotente de solicitud. Es nuevo incluso si se reconstruye
el seguimiento de un CLI después de un reinicio; no se reinicia el CLI para ello.

### Apertura o replay completo

GET `/api/ai/agent/stream?conversationId=...&runId=<actual>&fromSeq=-1`.
También se puede omitir el cursor, equivalente a -1. Sin runId y desde cero
se permite adoptar/reproducir el buffer actual; esto por sí solo **no** acredita
que pertenezca a una solicitud local pendiente.

Una conexión aceptada empieza con este frame de transporte, **sin línea id**:

```text
data: {"type":"stream_state","runId":"<actual>","nextSeq":14,"replayFromSeq":0,"done":true}

```

Campos exactos:
- `runId: string`: UUID opaco del buffer seleccionado.
- `nextSeq: number`: longitud del buffer en el momento de attach.
- `replayFromSeq: number`: siguiente evento solicitado, inclusive.
- `done: boolean`: el buffer ya publicó su terminal; puede ser éxito, pending
  o error. **No significa tarea verificada ni éxito del turno.**

Después se transmiten eventos ordinarios sin cambiar sus campos existentes.
Cada payload añade `runId`; la secuencia está únicamente en la línea SSE id:

```text
id: 12
data: {"type":"text","phase":"final_answer","delta":"Respuesta A","runId":"<actual>"}

id: 13
data: {"type":"done","runId":"<actual>"}

```

Los `pending`, errores, herramientas, archivos, preguntas, permisos, usos y fases
mantienen sus payloads existentes. El registro solo publica su terminal después
de esperar persistencia/cierre; ese comportamiento previo se conserva.
El camino efímero sin conversationId sigue con su contrato anterior.

### Reconexión al mismo run

GET `...?conversationId=...&runId=<A>&fromSeq=12` pide desde 13.
`Last-Event-ID: 12`, cuando está presente, tiene precedencia sobre el query.
El cursor de wire representa el último evento aplicado, no el siguiente.
Se aceptan enteros seguros desde -1 y menores que Number.MAX_SAFE_INTEGER;
vacíos, listas, decimales, texto y valores fuera de rango no se convierten
silenciosamente en replay desde cero.

La deduplicación del consumidor usa `(target, conversationId, runId, seq)`.
El registro reproduce cada evento posterior al cursor una sola vez y suscribe
en el mismo tramo síncrono. La conexión sigue ligada a A aunque B empiece
después; no salta automáticamente al sucesor.

Si A está terminado y el cursor ya consumió su terminal,
`replayFromSeq === nextSeq`: solo llega `stream_state` con `done:true`
y HTTP se cierra. No se duplica ni fabrica un terminal. Si al cliente le falta
evidencia del resultado, debe consultar historial; ese frame no sustituye
la correlación del turno ni la verificación de una tarea.

### Otro run, identidad ausente o cursor inválido

No se reproducen eventos de B usando el cursor de A. Se entrega **un solo**
frame, sin suscribir al cliente, y se cierra SSE:

```text
id: -1
data: {"type":"error","message":"La conexión ya no identifica con certeza esta ejecución. Recupera el historial y comprueba el turno pendiente antes de continuar.","code":"AGENT_STREAM_RECONCILE_REQUIRED","runId":"<B>","recovery":{"reason":"run_changed","runId":"<B>","requestedRunId":"<A>","nextSeq":4,"done":true}}

```

`recovery.done` también puede ser false con B vivo. `requestedRunId` se incluye
solo si fue proporcionado. El mensaje legible no es una clave de protocolo.
La prioridad exacta de `reason` es:
1. `run_changed`: runId proporcionado distinto del actual, incluso desde -1.
2. `cursor_out_of_range`: siguiente secuencia no entera segura, negativa
   o mayor que la longitud actual del buffer.
3. `run_id_required`: siguiente secuencia mayor que cero y sin runId.

El id -1 no es un evento del buffer y **no actualiza el cursor**.
Este error es de recuperación del transporte, **no un fallo del proveedor**.
El consumidor debe tratar `code` antes de la deduplicación, el cierre normal
por error/done, la limpieza del estado de trabajo o el drenado de continuaciones.
El runId raíz y `recovery.runId` identifican B; no autorizan cerrar A.

### Ausencia de buffer / permisos

204 conserva el significado de “ningún buffer accesible”. Puede corresponder
a GC, a una ejecución que nunca se admitió, a ausencia tras reinicio o a la
ocultación por permisos ya existente. No confirma admisión, guardado ni éxito.
Si el buffer desaparece entre la comprobación y la suscripción, se devuelve
204 sin abrir SSE ni fabricar `done`. Se mantiene la recuperación CLI existente
y la comprobación de propiedad de la conversación.

Los errores HTTP previos a SSE mantienen su contrato existente; no son terminales
de la solicitud. El nuevo protocolo no agrega un reenvío del prompt.

## Reconciliación para el consumidor

Al recibir el error especial, conservar la solicitud local pendiente, ambas
respuestas ya conocidas y los archivos. Bloquear el drenado local basado en
un supuesto cierre. Consultar historial y estado en el mismo target/usuario.
La persistencia de A precede al inicio de B; si B terminó, su persistencia
precede al terminal. Un fallo de persistencia sigue siendo error y no se
transforma en éxito por un estado de buffer terminado.

No correlacionar por igualdad del texto del prompt, por 204, por EOF ni por
un terminal ajeno. Solo después de reconciliar se adopta explícitamente B
y se reinicia su cursor. Un replay de B no se concatena a A ni se duplica sobre
B ya cargado del historial. Si B cambia mientras se reconcilia, un attach con
su runId detecta de nuevo el cambio. Si falta evidencia histórica suficiente,
se conservan solicitud/resultado como no confirmados, sin drenar ni reenviar
POST; no hay garantía nueva de correlación histórica por runId.

`stream_state` es metadato de transporte: procesarlo antes de aplicar eventos
al último turno. La apertura desde cero sin identidad no acredita pertenencia
a un turno pendiente. Conservar preguntas, errores, interrupciones y
verificación pendiente. La asignación del consumidor y sus pruebas de
historial/posición siguen siendo la siguiente fase del líder.

### Compatibilidad explícita

Los IDs numéricos y payloads existentes se conservan; runId es aditivo y
stream_state es un nuevo frame. Clientes antiguos mantienen apertura/replay
desde cero, pero una reconexión con cursor sin runId ahora recibe una señal
segura de reconciliación. **No hay compatibilidad de reanudación numérica sin
identidad**: permitirla adivinaría a qué ejecución pertenece el cursor.
Backend y consumidor deben integrarse antes del gate/deploy.

El control de mismo run sigue pasando cuando envía su identidad. El arnés QA
anterior usa attach numérico sin runId y su reducer no consume este contrato;
no se afirma 5/5 integrado con ese consumidor. Camila conserva races.test.ts:
la siguiente fase debe integrar el transporte/consumidor y mantener las
comprobaciones de ambos turnos/archivos, mismo run, texto distinto y ausencia
de duplicación, sin rebajar assertions de resultado ni reenviar prompts.

## Contrato interno y archivos de esta intervención

- `services/agent-run-registry.ts`: añade runId por ejecución; el callback
  Subscriber añade un tercer argumento runId (los dos anteriores se conservan);
  attach añade quinto parámetro opcional `{runId?, onState?}`.
  Los eventos del buffer y callbacks onComplete no cambian.
  `fromSeq` interno es la siguiente secuencia, inclusive, desde 0.
- `controllers/agent.controller.ts`: lee la identidad, serializa metadatos,
  resuelve el buffer agotado/ausente y limpia suscripción/heartbeat/listener
  incluso en replay síncrono o desconexión.
- `services/agent-run-registry.test.ts`: el control existente de cursor ahora
  envía el runId del mismo run; conserva sus assertions.
- `services/agent-stream-cursor.test.ts`: 22 regresiones nuevas permanentes.
- Este handoff y nota nueva
  `docs/changes/2026-10-17-recuperacion-cursor-ejecucion-asistente.json`.

No cambios de frontend, autenticación, licencia, executor, DTO persistido,
variables de entorno, retención, límites de ejecución, cancelación, despacho
de tareas recuperadas ni sus gates de verificación. Se preserva el guardado
de actividad/archivos existente. No se afirma ejecución exactamente una vez
ante cualquier caída: los tests acreditan ausencia de repetición por replay.

## Verificación reproducible

Directorio: `/var/www/LUXIPANEL/web/backend`.
Todo se ejecutó serialmente con heap máximo de 2560 MiB y un worker de Vitest.

| Comando | Exit | Resultado |
| --- | ---: | --- |
| `env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck` | 0 | Sin diagnósticos |
| `env NODE_OPTIONS=--max-old-space-size=2560 npm test -- src/modules/ai-assistant/services/agent-stream-cursor.test.ts src/modules/ai-assistant/services/agent-run-registry.test.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=dot --silent` | 0 | 2 archivos, 39 pruebas; 1,79 s |
| `env NODE_OPTIONS=--max-old-space-size=2560 npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=dot --silent` | 0 | 100 archivos, 1016 aprobadas, 1 omitida; 35,98 s |
| `git diff --check` | 0 | Sin errores de whitespace |

La omitida sigue siendo `services/providers/cli/resource-launch.test.ts`,
integración opt-in con LXP_RESOURCE_INTEGRATION=1. No se crearon scopes reales.
Las pruebas nuevas usan registry, persistencia y serialización SSE reales
con storage/proveedor y objetos Request/Response simulados: no acreditan
HTTP de producción, red real, autorización multiusuario física ni QA visual.

Cobertura nueva: A retenido en persistencia con cursor 12; sucesor B vivo y
terminado; error de identidad con longitud menor y cursor sin identidad que
sí cabe en B; replay después de adopción explícita; ambas respuestas y
actividad de archivos A/B en historial; una ejecución y un guardado por run;
ningún terminal duplicado; otro target; identidad antes de datos; último
terminal ya consumido; cierre del cliente sin abortar/repetir; cursor inválido;
204 por inexistencia/propiedad/GC entre comprobación y attach.

El primer lanzamiento de tests no llegó a iniciarlos por caché de solo lectura;
se ejecutaron con el permiso correspondiente. La primera ejecución nueva dio
9 fallos de fixture HTTP y 30 aprobadas: faltaba envolver la petición simulada
en el contexto de Executor que aplica el middleware real. Se corrigió el fixture,
sin cambiar las guardas de producto; la ejecución dirigida y la suite posterior
pasaron con los resultados anteriores. Los errores de storage/proveedores
provocados por otras pruebas son fixtures, no diagnósticos del servicio vivo.

SHA-256 de las fuentes/pruebas y nota validadas, rutas relativas al módulo salvo nota:

```text
08691d523ab39ea176d1a5a8b9689c985a5ef4a4e45a5d8e40e3314688b7c64a  services/agent-run-registry.ts
35f81639dc838629b1d4caa08ef44a7db3b9f7fd311c8759a93988fe8079ae66  controllers/agent.controller.ts
cdd5c691b1208409089155b87e1a7c5af915c76efced3ba88c995c362f1c69a3  services/agent-run-registry.test.ts
9fccef6e6904ddc3deebc4a3e21bf7e4504a47ecb098c0a854fbb4588fa1d5b0  services/agent-stream-cursor.test.ts
8197e3191f56258244408e6fa2e2f0bff19702aa6aea8c25d05f75e7b80d32e1  docs/changes/2026-10-17-recuperacion-cursor-ejecucion-asistente.json
```

## Entrega al líder y Valentina

El canal de coordinación solo expuso al agente actual; no había un destino
Valentina disponible. El contrato se entrega mediante este archivo accesible,
sin afirmar un acuerdo humano recibido ni asignarle ediciones en esta fase.
La corrección de correlación de historial de Valentina permanece fuera
de este delta. Falta integrar el consumidor del contrato y repetir QA
independiente antes de cualquier build/restart. Infraestructura conserva
esa fase; esta entrega no está desplegada y no confirma publicación en GitHub.
