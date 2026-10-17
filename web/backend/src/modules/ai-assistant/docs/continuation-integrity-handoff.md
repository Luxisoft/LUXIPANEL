# Entrega backend: continuidad, persistencia y cierre verificado

## Corrección posterior al gate QA — entrega vigente, 2026-10-17

Responsable: Mateo. Destinatarios: líder, Valentina y QA.
Referencia autoritativa del bloqueo previo:
[2026-10-17-actividad-continuidad-qa.md](2026-10-17-actividad-continuidad-qa.md).
Esta sección sustituye las conclusiones y cuentas de la entrega anterior,
conservada al final como histórico. **No aprueba el trabajo global ni el despliegue.**

P1 corregido y comprobado en backend: las cinco pruebas QA originales pasan
sin modificar sus assertions. P2: productor backend corregido con un contrato
aditivo; falta integrar el consumidor de Valentina y repetir el contrato cruzado.
No se exige todavía verde el test frontend ni se presenta como ejecutado en esta
intervención.

### Ámbito y archivos de esta corrección

Se trabajó exclusivamente sobre el checkout original `/var/www/LUXIPANEL`,
rama `developer`. El alias `backend/` apunta a `web/backend/`.
Se leyeron AGENTS, `web/CLAUDE.md` (no existe CLAUDE en la raíz),
las arquitecturas, README del módulo, las secciones aplicables del SDK y ambos
documentos de QA/continuidad. Se descubrieron `modules.list` y
`modules.describe`; Files se usó mediante `modules.read` y
`modules.execute`, revisión `2:0`, con las rutas autorizadas del alias.
No hay canal de grafo utilizable ni operaciones Obsidian permitidas en esta
sesión; se buscó en las fuentes. No fue un fallo de conexión.

Rutas exactas relativas a `/var/www/LUXIPANEL`:

| Archivo | Delta propio de esta intervención |
| --- | --- |
| `web/backend/src/modules/ai-assistant/services/agent-run-registry.ts` | Distingue proveedor terminado de guardado/cierre asentado; conserva ownership y suscripción; entrega un único terminal tras persistencia; difiere la cola y espera los guardados al apagar. |
| `web/backend/src/modules/ai-assistant/services/turn-queue.service.ts` | Solicita un drenado diferido cuando el run aún posee la conversación; no espera su propia finalización ni consume el turno antes de tiempo. |
| `web/backend/src/modules/ai-assistant/models/team-task.types.ts` | Añade los detalles opcionales del snapshot y reutiliza la proyección compacta SSE; los tokens también se copian por lista explícita de campos. |
| `web/backend/src/modules/ai-assistant/services/agent-run-lifecycle.test.ts` | Archivo nuevo, 14 regresiones con registry, cola y persistencia reales y proveedores/almacenamiento simulados. |
| `web/backend/src/modules/ai-assistant/models/team-task.snapshot.test.ts` | Archivo nuevo, 8 casos de JSON, compatibilidad, ceros, estados y exclusión de datos privados. |
| `web/backend/src/modules/ai-assistant/services/turn-queue.service.test.ts` | Solo se amplía el doble del registry con `deferQueueDrain`; no se relaja ninguna expectativa existente. |
| `web/backend/src/modules/ai-assistant/docs/continuation-integrity-handoff.md` | Esta actualización de entrega y contrato. |

Los cambios de otros autores, incluidos los anteriores de los archivos compartidos,
se conservaron. No se modificaron frontend, QA existente, auth/licencia/sesión,
executor, eventos compartidos, configuración, dependencias ni servicios.
No hubo worktrees, copias del proyecto, cambio de rama, commit ni push.
Se leyó la nota de QA `docs/changes/2026-10-17-actividad-compacta-continuidad.json`:
no afirma despliegue ni el nuevo snapshot; se conservó sin editar ni duplicar.

### P1: secuencia de cierre y continuidad

1. Durante generación, traducción, persistencia y `onComplete`, `done` sigue
   siendo falso. `closing` distingue que el proveedor ya terminó, sin liberar
   la clave target/conversación. `start` duplicado reutiliza el mismo run;
   `attach`, `activeRuns`, `isActive`, el contador y el contexto conservan
   su comportamiento de ejecución activa durante el guardado.
2. Tanto `done` como `error` del proveedor, incluidas excepciones del
   generador, esperan a que `onComplete` se asiente. Si guardar/cerrar falla,
   el terminal explica que el guardado no se pudo confirmar; no declara éxito
   ni repite una mutación.
3. `drainConversationQueue` consulta
   `deferQueueDrain(key, drain: () => Promise<void>, targetId?)` antes del
   mutex de cola. Si hay un run activo, guarda una única solicitud de drenado
   en ese run y retorna inmediatamente. Así el `await drainConversationQueue`
   que ya existe dentro de `onComplete` no espera su propio `completion`.
   Repetir el aviso no crea dos despachos.
4. Tras asentarse `onComplete`, liberar la clave (`done = true`) y publicar
   el terminal ocurre sin ningún `await` intermedio. Solo después se ejecuta
   el drenado diferido, si el guardado tuvo éxito y no hubo stop/apagado.
   Un fallo preparando el siguiente turno deja su entrada durable en cola;
   no transforma el terminal anterior en otro error ni lo duplica.
5. No se cambió la firma de `onComplete`. Esto cubre sus tres productores:
   `services/turn-queue.service.ts`, `services/cli-run-recovery.service.ts`
   y `services/team-tasks/worker-spawn.ts`. El último puede encolar una
   corrección desde su verificación antes de salir de `onDone`: el listener
   de retry solicita el mismo drenado diferido, o drena normalmente si el
   guardado ya terminó. El caso nuevo verifica que esa continuación no se pierde.
6. La cola mantiene sus validaciones de admisión, usuario y target, y la
   lectura del último mensaje para bloquear continuaciones automáticas ante
   error, pregunta o interrupción. No se cambian permisos ni se inventan éxitos.
   Los listeners de tareas siguen comprobando un sucesor activo o en cola antes
   de cerrar una tarea por el evento del turno anterior.

`gracefulShutdown` espera el `completion` de API y de CLI cuyo cierre/guardado
ya comenzó. Un CLI todavía ejecutándose queda desacoplado, conservando su
recuperación. No se etiqueta retroactivamente como interrumpido un guardado ya
iniciado. Se marca el run para impedir su continuación diferida y los avisos
tardíos que lleguen mientras el run retenido ya está cerrado; se omiten los
eventos de cierre que podrían despertar otro turno durante ese apagado.
La reconciliación durable queda para el siguiente arranque.
El timeout existente sigue acotando la espera: agotarlo no confirma que un
guardado terminó ni libera artificialmente el ownership. El contador
`flushed` indica runs seleccionados para espera, no una garantía adicional
si venció ese timeout. Se limpia el temporizador cuando la espera termina.

No es una garantía de ejecución exactamente una vez frente a cualquier caída
del proceso o del almacenamiento. No se agregaron reintentos de herramientas
ni esperas de la ejecución completa del siguiente turno.

### P2: contrato exacto para Valentina

Productor:
`web/backend/src/modules/ai-assistant/models/team-task.types.ts`,
`TeamTaskSnapshot` y `toTeamTaskSnapshot`.
Se conserva el endpoint
`GET /api/ai/conversations/:id/team-tasks` y todos los campos anteriores.

Los tres campos son **opcionales**, no `null`. Si la tarea antigua no tiene
el bloque correspondiente, se omite. Se tipan mediante los mismos miembros
de `TeamTaskView` y se generan reutilizando `toTaskView`.

```ts
artifacts?: {
  filesChangedTotal?: number;
  insertions?: number;
  deletions?: number;
  tokens?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimated: boolean;
    overBudget?: boolean;
  };
};
verify?: {
  state: "running" | "passed" | "failed" | "skipped";
  attempts: number;
};
isolation?: {
  mode: "worktree" | "lease" | "none";
  branch?: string;
  integrated?: boolean;
};
```

Semántica y sanitización:

- Los contadores presentes, incluido cero, se conservan sin recalcularlos
  desde el texto. No se fabrica un resultado cuando no existe.
- `verify` conserva exactamente su estado e intentos; `skipped` o
  `failed` nunca equivalen a `passed`. La ausencia significa que no hay
  detalle de verificación guardado, no una verificación aprobada.
- `isolation` conserva modo y rama no vacía. Para mantener paridad con la
  proyección SSE existente, `integrated` solo se emite cuando es verdadero;
  falso/ausente se omite. `tokens.estimated = false` y
  `tokens.overBudget = false` sí se conservan cuando corresponden.
- La lista explícita de campos excluye `filesChanged`, `diffPreview`,
  logs, comandos de verificación, rutas del aislamiento, SHA/URL de PR,
  instrucciones completas, usuario y sesión. En tokens tampoco se propagan
  propiedades extra del sidecar. Son objetos de valores JSON, sin referencias
  al objeto de tokens original; no se agregan secretos ni credenciales al DTO.
  Es una proyección tipada, no un nuevo parser de datos corruptos ni un
  detector de secretos dentro de los campos textuales públicos preexistentes.

Acción pendiente de Valentina, **sin editarla en este turno**:
ampliar el tipo `TeamTaskSnapshot` y copiar los tres bloques opcionales en
`snapshotToTaskView` de
`web/frontend/src/components/floating-assistant/assistant-api/team.ts`.
Mantener ausencia compatible para servidores/historiales antiguos y no perder
ceros ni estados `failed/skipped`. Revisar sus consumidores
`web/frontend/src/components/floating-assistant/chat-engine.ts` y
`web/frontend/src/components/floating-assistant/TeamTaskBoard.tsx`.
El backend ya conserva tras JSON
`artifacts={filesChangedTotal:2,insertions:5,deletions:1}`,
`verify={state:"passed",attempts:1}` e
`isolation={mode:"lease",branch:"developer",integrated:true}`.
El test cruzado de QA debe volver a pasar tras integrar el consumidor:
`web/frontend/src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts`,
caso `keeps files and verification accessible after a cold persisted task snapshot`.

Esta entrega comunica el contrato al líder y a Valentina mediante este documento;
no afirma que el consumidor haya sido adaptado o aceptado todavía.

### Evidencia reproducible y límites

Todos los comandos backend se ejecutaron desde
`/var/www/LUXIPANEL/web/backend`, con tests en `pool=threads`, sin builds
ni reinicios.

| Validación final | Resultado | Exit |
| --- | --- | ---: |
| `env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck` | Sin diagnósticos; repetido después de la última corrección de apagado | 0 |
| `npm test -- src/modules/ai-assistant/services/continuation-integrity.qa.test.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=verbose` | 1 archivo / 5 aprobadas; repetido sobre el código final | 0 |
| `npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=2 --minWorkers=1 --reporter=dot --silent` | 99 archivos / **994 aprobadas, 1 omitida (995)**; 23,81 s | 0 |
| `git diff --check` | Sin errores de whitespace | 0 |

Regresión adicional reproducible:

```bash
npm test -- src/modules/ai-assistant/services/agent-run-lifecycle.test.ts src/modules/ai-assistant/models/team-task.snapshot.test.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=verbose
```

Los 22 casos nuevos de esos dos archivos están incluidos en la suite completa
final; ese comando conjunto se ofrece para reproducción, no como otra corrida
adicional contabilizada.

La reproducción inicial del comando QA exacto dio **5 fallos, salida 1**.
Tras la primera corrección pasó **5/5, salida 0**, sin editar ese archivo.
Los tres archivos focales (cola, lifecycle inicial y snapshot) dieron **53
aprobadas, salida 0**. La primera suite completa corregida dio **99 archivos,
992 aprobadas y una omitida, salida 0**, 24,27 s. La revisión añadió dos
regresiones de drenado tardío después de apagar: antes de la guarda final
dieron **2 fallos / 12 aprobadas, salida 1**; tras corregirlas, lifecycle más
QA original dieron **19 aprobadas, salida 0**, 1,42 s. Las cuentas vigentes
de la tabla incluyen también esos dos casos.

Los tests nuevos usan el registry, la cola, la persistencia y el contexto de
executor reales con almacenamiento/proveedores simulados. Cubren sucesión
API/CLI única, reconexión, propiedad, usuario/target, errores de proveedor y
guardado, fallo de despacho, retry de verificación y apagado durante guardado.
Los logs de rechazo de almacenamiento, proveedor y permisos corresponden a
fixtures intencionales; no acreditan problemas ni arranque limpio de servicios vivos.

La **única omitida** es
`web/backend/src/modules/ai-assistant/services/providers/cli/resource-launch.test.ts:30`,
`keeps detached exit tracking and cleanup outside a terminated scope`.
Requiere `LXP_RESOURCE_INTEGRATION=1`, crea un scope systemd real, provoca su
límite de ejecución y comprueba salida 124 y limpieza. No se activó para no
mutar el host en esta tarea. Sus dos casos portables sí se ejecutan.
No es un fallo pendiente de persistencia API ni un test de login.

No se ejecutaron builds, reinicios, despliegue, proveedores externos, frontend,
login real, QA visual del candidato instalado ni integración física systemd.
La orden explícita de no compilar/reiniciar prevalece en esta entrega.
Para el turno posterior de infraestructura, la referencia del paquete es
`env NODE_OPTIONS=--max-old-space-size=2560 npm run redeploy`
(build backend y restart de `luxipanel-backend` según package.json);
no ejecutarla hasta el nuevo gate y verificar después proceso online, HTTP y logs.

Pendientes globales: consumidor frontend, nueva QA integrada (incluido el
historial frío y botón de diferencias), revisión visual y finalmente despliegue
con build/restart serializados. El baseline frontend de 26 diagnósticos descrito
por QA no se revalidó ni se corrigió aquí. La nota pública existente permanece
bajo responsabilidad de QA. No se anuncia publicación en GitHub.

Sumas SHA-256 de la entrega actual, relativas al módulo:

```text
ecf2d40284d81848a8cb7aa5f316449a9b18bb135021daf24b0861fcc0e8251a  models/team-task.types.ts
f5a2ce0b9b95155e30563d8c5cb70776e7d70ca381567bc9ff9c8934d7bf267b  models/team-task.snapshot.test.ts
a832ec7251c9e36d3641aca89eac88fc028d5f152337cfac942dd478fd33ba59  services/agent-run-registry.ts
eca628b3e005b3b2ef16de9b2604dc4be51ce5a5c44d1e95f8b719ca19a6d1a7  services/agent-run-lifecycle.test.ts
2fee14f5c64aa80134c47c8b097432dbba0a9945f20b1fe5594ebfd77d0b76bf  services/turn-queue.service.ts
cb61f2a0bab55964af68a2aea4b1899bfbd1de78d4a53e0dddf7078898c5a6b7  services/turn-queue.service.test.ts
726cb7af0438bc6c4156193d6914d69c07b5d51a7836b3af7845d86282e4a374  services/continuation-integrity.qa.test.ts (QA conservado, no editado)
```

## Entrega anterior a QA — registro histórico

Las afirmaciones de cierre, compatibilidad y cuentas que siguen pertenecen a la
entrega anterior. El gate posterior encontró P1/P2 y la sección vigente de arriba
reemplaza sus conclusiones. Se conserva el registro para trazabilidad.

Fecha: 2026-10-17. Responsable: Mateo. Complementa, sin sustituir, [turn-finalization-handoff.md](turn-finalization-handoff.md) y [recovery-verification-handoff.md](recovery-verification-handoff.md).

### Alcance real y estado recuperado

Trabajo realizado en el proyecto original `/var/www/LUXIPANEL`, rama `developer`.
El alias `backend/` resuelve a `web/backend/`; el módulo real está en
`/var/www/LUXIPANEL/web/backend/src/modules/ai-assistant`.
Se compararon las fuentes con su contenido al inicio de esta intervención,
conservando las correcciones anteriores y los cambios ajenos.
Esta intervención modifica ocho archivos de producción, cuatro de pruebas y
añade este documento. No modifica frontend, `docs/changes`, infraestructura,
auth/licencias/sesión/executor, variables de entorno ni eventos compartidos.
No hubo copias del proyecto, worktrees, cambios de rama, commits, push,
builds, reinicios ni despliegue.

Se leyeron `AGENTS.md`, la arquitectura backend, la documentación del módulo
y las instrucciones de notas de actualización. El `CLAUDE.md` de la raíz
solicitada no existe; la guía vigente encontrada fue `web/CLAUDE.md`.
El canal protegido se descubrió mediante `modules.list` y `modules.describe`.
Obsidian no ofrece operaciones permitidas y el canal de grafo no está disponible
en este run: no se consultó un vault ni se atribuye esto a un fallo de conexión.
Files permitió leer usando el alias autorizado `backend/`; rechazó la ruta
migrada `web/` por su ámbito. La exploración de código usó el workspace autorizado.

La base actual, antes de editar, pasó `npm run typecheck` (salida 0) y
Vitest: **96 archivos, 949 pruebas aprobadas, una omitida**, salida 0, 23,57 s.
Los recuentos históricos de otros documentos no se usaron como validación.

### Defectos reproducidos y cambios exactos

Rutas relativas al módulo:

| Archivo | Cambio y efecto |
| --- | --- |
| `services/turn-finalization.ts` | Conserva el texto provisional como `commentary` cuando quedan tareas pendientes. Si el proveedor o la lectura de cierre lanza una excepción, conserva el avance recibido antes de propagarla. El avance no se convierte en respuesta final. |
| `services/assistant-message-persistence.ts` | Propaga el fallo de escritura del historial; ya no permite que el llamador interprete una escritura rechazada como guardada. |
| `services/agent-run-registry.ts` | Emite el terminal exitoso después de esperar `onComplete`. Un fallo de guardado/cierre produce un error comprensible, también en la notificación de cierre; una salida API sin respuesta final, pregunta ni trabajo pendiente ya no acepta `done` como evidencia suficiente. Se mantiene la guarda equivalente de CLI. |
| `services/team-tasks/worker-spawn.ts` | Borra el descriptor de recuperación CLI después de guardar la respuesta y propaga un fallo de cierre del tablero. La evidencia de recuperación se conserva cuando la escritura falla. |
| `services/turn-queue.service.ts` | Guarda el mensaje y reconstruye el contexto antes de retirar el turno de la cola. Si falla esa preparación, conserva el turno y no arranca el proveedor. También respeta error, interrupción y pregunta humana para continuaciones automáticas ajenas a la recogida de equipo. |
| `repositories/conversations/repository.ts` | Añade un recibo interno y acotado de la última entrega encolada, guardado en la misma transacción del historial. Repetir la entrega del mismo id no duplica el mensaje; dos turnos distintos con el mismo texto se conservan. |
| `services/team-tasks/service.ts` | Un evento de cierre anterior no cierra al trabajador mientras existe una continuación activa o en cola. Al terminar esa continuación, su resultado puede cerrar la tarea normalmente. |
| `services/team-tasks/lifecycle.ts` | Una receta requerida sin directorio confirmado termina con error de verificación no iniciada, conservando `verify.state = skipped`; ya no equivale a verificación aprobada ni ejecuta el comando en un directorio supuesto. |

Pruebas modificadas: `services/turn-finalization.test.ts`,
`services/turn-queue.service.test.ts`, `services/team-tasks.service.test.ts` y
`repositories/conversations.repository.test.ts`.
Se añadieron **18 casos** y se ajustó la expectativa de historial pendiente
para exigir que su último avance sobreviva a la recarga. La prueba de audio
mantiene sus comprobaciones; solo incorpora el argumento opcional del
repositorio en su expectativa.

Las regresiones reproducidas antes de las respectivas correcciones dieron:
- Cuatro archivos de pruebas: salida **1**, **13 fallidas / 131 aprobadas**.
- Verificación omitida y continuación del trabajador: salida **1**, **3 fallidas / 60 aprobadas**.
- Cierre API sin evidencia y error de cierre del tablero: salida **1**, **3 fallidas / 82 aprobadas**.

Los estados existentes siguen siendo autoritativos: `pending/running` no
equivalen a éxito, `failed/canceled` no se convierten en `done`, y la pregunta
o aprobación humana conserva sus controles. No se añadió un estado público
`blocked`: el bloqueo se representa con los campos existentes de pregunta,
permiso, error o interrupción. Siguen pasando las regresiones anteriores de
`team.collect` con timeout, recuperación, despertar del líder, aislamiento por
target, límites de proveedor y operación con resultado `unconfirmed`.

### Contrato para frontend y líder

No hay nuevos endpoints, campos de mensajes HTTP/SSE, estados públicos,
eventos compartidos ni cambios de firma de callbacks públicos.
Se reutilizan `text.phase`, `done.pending`, `ConversationMessage.pending`,
`apiActivity`, `error`, `ask`, `interrupted` y el tablero existentes.

La diferencia observable es temporal: `done` se entrega después de guardar
y cerrar el turno; un fallo en ese punto entrega `error`. Cuando el turno queda
pendiente, el texto que antes se descartaba llega al detalle de actividad y
persiste allí. La burbuja final sigue vacía hasta tener un resultado final.

El parámetro opcional `queueTurnId` es interno entre servicios/repositorio.
El recibo `__queue_receipt` vive aparte del array de mensajes dentro del sidecar
de esa conversación; **no forma parte del DTO devuelto al frontend**. Guarda
un único id de cola, sin texto, credenciales ni crecimiento por cada turno.
Usa el mismo executor y ámbito de usuario que el historial.

Se comprobó en fuente que frontend ya declara/consume los campos existentes en
`assistant-api/agent-stream.ts`, `assistant-api/conversations.ts`,
`chat-engine/stream-apply.ts` y `chat-engine/history.ts`.
No había otro agente accesible en el canal de coordinación: este documento
entrega el contrato al líder y a Valentina; no afirma un acuerdo humano recibido
ni sustituye su QA visual. La implementación no depende de cambios nuevos de frontend.

### Verificación reproducible del estado final

Desde `/var/www/LUXIPANEL/web/backend`:

```bash
env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck
npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=2 --minWorkers=1 --reporter=dot --silent
git diff --check
```

Resultado final actual: typecheck **salida 0, sin errores**; Vitest
**96 archivos aprobados, 967 pruebas aprobadas, una omitida**, salida **0**,
duración **33,45 s**. `git diff --check` terminó con salida **0**.
No se observaron fallos previos de typecheck en esta base ni errores nuevos
después de corregir. Los fallos intermedios fueron las reproducciones indicadas;
una expectativa de argumentos de la prueba de audio también se actualizó.

La única omitida es la integración preexistente de
`services/providers/cli/resource-launch.test.ts`, habilitada con
`LXP_RESOURCE_INTEGRATION=1`. No se ejecutaron proveedores externos ni scopes
reales. Los errores provocados de almacenamiento, proveedor o permisos en
los fixtures son intencionados, no diagnósticos de servicios vivos.

Sumas SHA-256 de los doce archivos de código/pruebas modificados por esta
intervención, relativas a `web/backend/src/modules/ai-assistant/`:

```text
b5aea342c66454efce04ed9ff234112a2dabdc7e5b47316d402f0a5351b5ccf4  repositories/conversations.repository.test.ts
c6d9194e4c507751d083a22861e4d922dbd38e7a8abf80a18b39cceb48757dfe  repositories/conversations/repository.ts
0085a528e8620781e3e070a9629c97ab25e763433f2b29f74e5719ef5540c33e  services/agent-run-registry.ts
44e962ee3b978c3b7210212f4cb7edd2598af6a414b01748f01237145ce5f8b2  services/assistant-message-persistence.ts
87352252f6950b267a25b8aff8f68a0a4fdf46df80ae80a5203b4f987e92f0c1  services/team-tasks.service.test.ts
92084ac301c65efdb58518df0daae910eb8bd2523c29a971116d27feef5f0da4  services/team-tasks/lifecycle.ts
f699d0659c7dd88e78642e55d20b0b655a6aecf4fb5ebb65b25d021112f1ed19  services/team-tasks/service.ts
6363c8689e4336cc81ea4758ebdf1f46788d6327c1608dbecf21ef1cbfb4997b  services/team-tasks/worker-spawn.ts
a6f8ad36e2be152a2d4400d6b6988bdf4075fd227070a8040cef50e494601dcb  services/turn-finalization.test.ts
e6d3f06722c047313903abdebbc7a354a987864538aa2e21cea6a458973ef9d5  services/turn-finalization.ts
4f7efea1fd3c5f596772e3548874d31f312f00f71ad8d498b87251baedc55aed  services/turn-queue.service.test.ts
d18639e4f96da091c7407205b630a0877cf6eeb78ffb849ea7154b2aecf83542  services/turn-queue.service.ts
```

### Entrega restante y límites

QA debe validar SSE → historial HTTP → recarga en el frontend integrado,
incluyendo el avance de un turno pendiente, el error de guardado, el timeout
de collect y la recogida posterior única. Debe comprobar que la continuación
automática queda bloqueada ante pregunta/interrupción/error y que el usuario
puede continuar explícitamente tras revisar el estado.

QA conserva la responsabilidad de la nota nueva en `docs/changes`.
Infraestructura conserva el turno exclusivo de build/restart y la verificación
online, HTTP y logs. Esta entrega está validada en fuente/pruebas, **no desplegada**.

No se agregaron bucles de reintento ni se repitieron mutaciones del servidor.
El recibo evita duplicar la entrega al historial; no garantiza ejecución
exactamente una vez entre almacenamiento y proceso ante cualquier caída.
Una caída tras consumir la cola y antes de arrancar el run conserva el mensaje
guardado, pero requiere reconciliar el estado; no se vuelve a ejecutar a ciegas.
Los fallos duraderos de conexión, almacenamiento, permisos o proveedor y la
espera humana siguen siendo bloqueos reales. Se mantienen los límites previos
de historial y actividad, sin prometer conservación ilimitada.
