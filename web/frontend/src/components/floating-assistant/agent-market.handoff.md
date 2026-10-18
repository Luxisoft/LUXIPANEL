# Market de agentes — entrega frontend

Fecha: 2026-10-17. Responsable: Valentina.

## Continuación acotada H1 — invalidación irreversible (2026-10-17)

**Entrega vigente de Valentina para recogida y nueva revalidación de QA.**
El gate de fuentes continúa pendiente de QA; esta entrega no acredita despliegue.
Se leyó primero el reporte independiente
`.cache/qa-market-final-20261017-camila/report.md` y sus dos suites.
Se reprodujeron exactamente **20 aprobadas y 7 fallidas**, antes de editar
producto. Los siete casos corresponden a los dos P2 de H1, no a siete defectos.
La evidencia previa de 687 pruebas no se usa para cerrar esta continuación.
H2 y H3–H6 conservan su aceptación previa; no se reescribieron sus áreas.

Checkout original `/var/www/LUXIPANEL`, rama `developer`, frontend en
`web/frontend` (alias `frontend`). Se leyeron `web/CLAUDE.md`, ambas
arquitecturas web, la documentación de voz/asistente, `MODULE-SDK-SPEC.md`
y `INFRA_LUXIPANEL.md`. El grafo no está expuesto en este run: se buscó
en fuentes. Se descubrieron y utilizaron `modules.list → describe →
read/execute`, módulos files/admin revisión `2:0`. El canal files acepta
el alias autorizado `frontend`; rechazó la ruta canónica como fuera de su
ámbito, sin ejecutar esa lectura. Las escrituras se hicieron por el alias,
que apunta al mismo checkout original.

### Mecanismo y alcance

- Cada objeto Session es la identidad de una operación y conserva
  `canceled` monotónico y `starting` hasta terminar la negociación.
  Un layout effect cancela el inicio al primer commit sin admisión o con otro
  contexto; volver a `canStart=true` no modifica ese objeto ni lo rescata.
  Las llamadas ya establecidas conservan Terminar, silenciar y las solicitudes.
- El ámbito capturado incluye target, cabeceras reales de sesión/CSRF y usuario
  del DOM, como el aislamiento del cliente API; solo vive en memoria, sin logs
  ni persistencia de cabeceras. ChatMain añade un `contextKey` interno con
  proveedor, agente vinculado y proyecto efectivo del chat. No cambia login,
  API, backend, configuración ni el contrato v1.
- Cada continuación de micrófono, creación/adopción, consulta previa, SDP,
  POST y SDP remoto comprueba propiedad de la operación y contexto. La
  invalidación también se ejecuta si se observa un cambio al resolver una
  promesa antes de otro render. Un recurso tardío se libera; no se vincula
  audio ni se inicia polling desde la operación cancelada.
- Un POST ya enviado puede devolver un id después de cancelar. Solo se cierra
  ese id si sigue vigente su usuario/sesión/target original; nunca se envía a
  una autenticación sustituta. Los callbacks de eventos, respuestas y refresco
  conservan su propietario; no actualizan ni liberan el intento nuevo.
- Para preservar la creación autorizada, ChatMain adopta los metadatos devueltos
  junto con el id y agente del chat en el mismo lote de estado. Así la lista
  de la renderización anterior, que todavía no conoce ese id, no provoca una
  falsa pérdida de admisión. `accept` sigue rechazando creaciones tardías.
  Se probó con metadatos e historial pendientes, sin omitir guards de admisión.

Inventario **solo de esta continuación**, relativo a `web/frontend`:

1. `src/components/floating-assistant/chat-pane/use-realtime-voice.tsx`.
2. `src/components/floating-assistant/chat-pane/ChatMain.tsx`.
3. `src/components/floating-assistant/chat-pane/use-realtime-voice.test.ts`:
   el mock API pasa a ser parcial y conserva las funciones reales de sesión;
   las 19 aserciones existentes no se sustituyen ni desactivan.
4. `src/components/floating-assistant/chat-pane/use-realtime-voice.context.test.ts`
   (nuevo): 18 probes originales y 17 variantes/positivos, total 35.
5. `src/components/floating-assistant/chat-pane/ChatMain.voice-context.test.ts`
   (nuevo): 9 probes originales y 6 integraciones adicionales, total 15.
6. Este handoff.

No se editó RealtimeRequests, PermissionView, Market, creación de perfiles,
modal, tipos externos aprobados, backend, login, infraestructura ni entorno.
La prop opcional `contextKey` es un contrato interno hook/ChatMain, actualizado
en ambos extremos; no requiere una ampliación ni un handoff backend.
Se preservaron las demás modificaciones preexistentes.

### Las siete regresiones exigidas

Nombres exactos que fallaron en `voice-invalidation-before.json` y pasan
en `voice-invalidation-final.json`:

1. H1: readmisión no revive el intento obsoleto durante createOffer
2. H1: readmisión no revive el intento obsoleto durante setLocalDescription
3. H1: sesión cambiada en el mismo target durante createOffer invalida el intento
4. H1: sesión cambiada en el mismo target durante setLocalDescription invalida el intento
5. H1 ChatMain real: recarga y readmisión en createOffer no reviven intento
6. H1 ChatMain real: recarga y readmisión en setLocalDescription no reviven intento
7. H1 ChatMain real: nueva sesión del mismo target no recupera SDP anterior

Los 20 probes positivos originales también están conservados y aprobados:
revocación persistente, ida/vuelta de target y conversación, navegación real
de proyecto, permisos/respuestas bloqueados, callbacks retenidos, Terminar y
liberación del input, acciones admitidas y un clic nuevo tras readmisión.
No se simula la sesión dentro del target: se usan `scopeHeaders(true)`,
`resolveTargetScope()` y sessionStorage reales con valores ficticios.

Las variantes cubren nuevo inicio autorizado antes de resolver el anterior,
sesión con `canStart` siempre true e ida/vuelta, usuario, CSRF y proyecto,
detección sin render, micrófono tardío, `accept` tardío, consulta previa,
POST exitoso tardío, SDP remoto tardío, eventos WebRTC antiguos, fallo tardío,
callbacks y respuestas de otra sesión. Se comprueban por separado recursos
de cada intento, reproducción de audio, polling e input-lock del intento nuevo.
Las promesas son controladas; el hook usa temporizadores simulados y avanza
1500 ms explícitamente para comprobar el polling vigente.
ChatMain monta useChatPane, hook y RealtimeRequests reales; sus seis casos
adicionales cubren nuevos clics, error de catálogo, creación autorizada con
lecturas pendientes y creación tardía tras cambio de sesión.

### Verificación de esta entrega

Entorno simulado happy-dom; API, WebRTC, captura y proveedores sustituidos por
fixtures. Sin credenciales, proveedores reales, datos operativos ni navegador.
Vitest se ejecutó serialmente, siempre con `--maxWorkers=1`.

| Ejecución | Resultado | Evidencia ignorada en .cache |
| --- | --- | --- |
| Antes de editar producto: dos suites portadas de QA | salida 1; 20 pasan / 7 fallan / 0 omitidas; 3,432 s | voice-invalidation-before.json y .log |
| Tras corrección inicial: 27 probes + 32 existentes | salida 0; 59/59; 6,397 s | voice-invalidation-after.json y .log |
| Selección integrada final: 15 archivos | salida 0; **203/203**, 0 fallos/omitidas/todo; 21,678 s | voice-invalidation-final.json y .log |
| Tras precisar tipos de los mocks nuevos: suite afectada | salida 0; 35/35; 1,235 s | voice-invalidation-typed-fixture.json y .log |
| TypeScript final | salida 0; **cero diagnósticos**; 25,923 s | voice-invalidation-typecheck-final.json y .log |
| git diff --check | salida 0 | voice-invalidation-diff-check.log |

Los tiempos de Vitest proceden de sus JSON (startTime/endTime). Las filas se
solapan: no se suman como pruebas distintas. La selección integrada contiene
las 32 existentes y los 27 probes originales. Los únicos cambios posteriores
a esas 203 pruebas fueron anotaciones explícitas de mocks en la suite nueva
y este documento. Se reejecutó esa suite y el typecheck completo.
Un primer typecheck encontró tres anotaciones no invocables de los mocks;
se precisaron sus firmas, sin supresiones ni cambios de configuración.
Los avisos auxiliares de conexión rechazada al localhost ficticio del runner
persisten; no son evidencia de logs ni disponibilidad de producción.

Selección exacta de las 203 pruebas (todas bajo
`src/components/floating-assistant/chat-pane/`):

| Archivo | Casos |
| --- | ---: |
| use-realtime-voice.context.test.ts | 35 |
| use-realtime-voice.test.ts | 19 |
| ChatMain.voice-context.test.ts | 15 |
| ChatMain.market-review.test.ts | 8 |
| ask-permission.test.ts | 5 |
| voice-message.test.ts | 4 |
| use-prompt-dictation.test.ts | 4 |
| reactbits/PromptBar.integration.test.ts | 16 |
| reactbits/PromptBar.voice-exclusive.test.ts | 6 |
| agent-chat-handoff.test.ts | 7 |
| team-execution.render.test.ts | 64 |
| agent-shortcut-activity.test.ts | 5 |
| use-chat-pane-derived.projects.test.ts | 2 |
| turn-view.container.test.ts | 12 |
| turn-view.quick-actions.test.ts | 1 |

Comandos desde `web/frontend` (las ejecuciones guardaron stdout/stderr en los
.log del mismo nombre, conservando el código de salida):

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/components/floating-assistant/chat-pane/use-realtime-voice.context.test.ts src/components/floating-assistant/chat-pane/ChatMain.voice-context.test.ts --maxWorkers=1 --reporter=json --outputFile=.cache/voice-invalidation-before.json --silent

NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run \
  src/components/floating-assistant/chat-pane/use-realtime-voice.context.test.ts \
  src/components/floating-assistant/chat-pane/ChatMain.voice-context.test.ts \
  src/components/floating-assistant/chat-pane/use-realtime-voice.test.ts \
  src/components/floating-assistant/chat-pane/ChatMain.market-review.test.ts \
  src/components/floating-assistant/chat-pane/ask-permission.test.ts \
  src/components/floating-assistant/chat-pane/voice-message.test.ts \
  src/components/floating-assistant/chat-pane/use-prompt-dictation.test.ts \
  src/components/floating-assistant/chat-pane/reactbits/PromptBar.integration.test.ts \
  src/components/floating-assistant/chat-pane/reactbits/PromptBar.voice-exclusive.test.ts \
  src/components/floating-assistant/chat-pane/agent-chat-handoff.test.ts \
  src/components/floating-assistant/chat-pane/team-execution.render.test.ts \
  src/components/floating-assistant/chat-pane/agent-shortcut-activity.test.ts \
  src/components/floating-assistant/chat-pane/use-chat-pane-derived.projects.test.ts \
  src/components/floating-assistant/chat-pane/turn-view.container.test.ts \
  src/components/floating-assistant/chat-pane/turn-view.quick-actions.test.ts \
  --maxWorkers=1 --reporter=json --outputFile=.cache/voice-invalidation-final.json --silent

NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/components/floating-assistant/chat-pane/use-realtime-voice.context.test.ts --maxWorkers=1 --reporter=json --outputFile=.cache/voice-invalidation-typed-fixture.json --silent
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
git diff --check
```

El comando de baseline documenta la corrida anterior a editar producto y
ampliar los dos archivos; ejecutarlo sobre la fuente final ejecuta sus 50 casos
actuales y no reproduce un fallo esperado. No se restauró una versión vieja
del producto ni se creó una copia/worktree para obtener ese resultado.

No se modificaron textos de producto ni catálogos: no se ejecutó i18n por
rutina. No se repitieron las 687 pruebas ni la auditoría ajena de tipos.

### Pendientes y límites

- Nueva revalidación independiente de QA antes de aceptar H1 y el gate de
  fuentes. Las pruebas de autora no declaran ese gate aprobado.
- Un POST ya emitido no se puede deshacer desde el navegador antes de recibir
  su respuesta. Tras cambiar autenticación, se libera el audio local sin
  intentar cerrar el id antiguo usando la sesión nueva; el cierre remoto en
  ese ámbito anterior no queda confirmado por estas pruebas.
- Sin build/restart por instrucción expresa: siguen reservados para Andrés,
  junto con logs, HTTP autenticado y navegador/SPA desplegada.
- Sin nota pública `docs/changes`, commits, push, copias, worktrees ni cambio
  de rama. Los artefactos de .cache permanecen ignorados. No se enviaron
  acuses ni mensajes repetidos; esta entrega queda disponible para team.collect
  (esa herramienta no está expuesta en este run).

---

## Entrega anterior — correctiva posterior al rechazo de QA (histórica)

Esta sección conserva la entrega anterior de la corrección de los seis hallazgos.
Fue revalidada por QA: H2 aprobado y H1 rechazado por los dos P2 documentados arriba.
Sus recuentos no sustituyen la evidencia de la continuación vigente.
Actualizada tras los dos huecos de voz reproducidos por Camila: corrección de
autora y evidencia final listas para team.collect. H1/H2 requieren nueva
revalidación de QA; H3–H6 fueron aprobados en fuente/pruebas por Camila, con
la limitación de recuperación local aceptada. No se envían más notificaciones
entre agentes ni se modifica el registro de tareas.
Las 609 pruebas y el inventario de la primera implementación, conservados debajo,
son evidencia histórica: **no se reutilizan como validación de esta correctiva**.

Antes de escribir se comprobó por lectura del registro de tareas que
`d57f44c8-702b-42b4-ac9e-32f8edff0f4d` estaba `done`, con
`finishedAt=2026-10-17T23:37:19.320Z`. No se abrió otro escritor ni se modificó
el registro. Checkout original `/var/www/LUXIPANEL`, rama `developer`;
`frontend` resuelve a `web/frontend`. Se conservaron las ediciones existentes.
No había canal de grafo invocable. Se descubrieron módulos y revisiones:
`files`/`admin` revisión `2:0`; se usaron lecturas y escrituras protegidas.
El CLAUDE vigente está en `web/CLAUDE.md`, no en la raíz.

### Solución por hallazgo

1. **Voz activa y catálogo rechazado.** `ChatMain` conserva el objeto de voz
   mientras la sesión está activa, aunque el catálogo pase por loading/error.
   `useRealtimeVoice.canStart` separa el permiso de iniciar de la capacidad de
   terminar: tampoco renueva/inicia tras perder admisión mientras espera el
   micrófono o consultas iniciales. Además, vuelve a comprobar la admisión
   después de createOffer y setLocalDescription: si se pierde durante cualquiera
   de esas esperas, libera micrófono/peer/input-lock y no hace POST de sesión.
   La validez de una sesión existente se mantiene separada de esa admisión:
   Terminar y silenciar siguen disponibles cuando el catálogo se bloquea.
   Se probaron evento agents-updated, promesa GET rechazada, cierre, ausencia de
   un nuevo inicio y preservación del borrador/adjuntos; también las dos esperas
   SDP con promesas controladas, hook real, WebRTC y micrófono simulados.

2. **Caminos alternativos de envío en histórico.** La admisión común vive en
   `use-chat-pane-derived`, usa el binding persistido (incluido projectId:null)
   y alimenta tanto la UI como `use-chat-pane-actions.send`.
   Sugerencias, retry, answer/aprobación, compositor, cola y audio no crean ni
   envían ni recortan historial cuando la admisión falla. Las respuestas no
   cambian primero el modo de aprobación. Se revalida después de esperar
   opciones y de crear una conversación, comprobando ámbito/binding actuales.
   Un fallo al crear desde una sugerencia conserva el borrador original y sus
   adjuntos. La petición explícita de un chat general nuevo sigue admitida y no
   recontextualiza el histórico.

   La misma admisión llega ahora a las solicitudes de voz mediante canRespond.
   RealtimeRequests deshabilita opciones de respuesta y Aprobar/Aprobar siempre;
   el hook revalida inmediatamente antes de los POST, incluso con callbacks
   retenidos o una aprobación encolada justo antes de perder admisión.
   Rechazar permanece disponible y no concede acciones. Una negativa local
   rechaza la promesa para que la UI libere su estado pendiente. Si vuelve la
   admisión, la pregunta conservada puede responderse. Se usa el texto existente
   agentMarket.readOnly del catálogo, sin nuevas claves.
   Las aserciones son llamadas simuladas del frontend; **no acreditan ejecución
   real del backend**.

3. **Catálogo tardío con proveedor ya activo.** `AssistantPanel.launchAgent`
   toma el texto/adjuntos más recientes después de todas las esperas, también si
   no tiene que activar proveedor. Comprueba target/sesión, proveedor/hilo/agente,
   proyecto del pane y workspace, ruta y pestaña. Los eventos de navegación y
   permisos invalidan una solicitud pendiente. La regresión reproduce catálogo
   diferido con edición simultánea; otras cubren cambio de proyecto, hilo,
   target, sesión y ruta.

4. **POST de perfil con resultado incierto.** Se completó el enfoque frontend
   decidido por Marin, sin ampliar la API. El cliente conserva status/code y
   trata una respuesta sin id válido como incierta. Antes del POST se marca un
   bloqueo local por **usuario, sesión y target**; se comprueba antes de cada
   creación y permanece al cerrar/reabrir y al navegar SPA en el mismo ámbito.
   Un GET vacío, fallido o con el mismo nombre nunca lo levanta ni acredita que
   el perfil no se creó. Un rechazo HTTP definitivo permite corregir/reintentar.

   La recuperación requiere selección EXPLÍCITA de un id. Hace GET nuevo,
   encuentra ese id exacto y exige canEditProfile antes de abrir edición PUT.
   Un id ausente o sin permiso mantiene el bloqueo. No hay inferencia por nombre,
   timestamps ni diferencias del catálogo, ni aviso de éxito del POST original.
   Los tests comprueban que elegir un id no llama onEditorDone ni realiza PUT
   hasta que el usuario guarda el perfil elegido.

   **Aislamiento adicional, verificado en esta continuación.** Las nuevas pruebas
   reprodujeron tres fallos de la versión anterior: marca visible en otra sesión,
   GET tardío aceptado después de cambiar usuario y POST incierto antiguo visible
   en la sesión nueva. Se corrigieron en profile-create-recovery,
   use-agents-tab y el guard de AgentEditor. La identidad local incluye usuario,
   target y cabeceras de sesión; las respuestas se descartan tras un cambio.
   La clave persistida es un digest SHA-256, nunca las cabeceras o credenciales.
   sessionStorage guarda solamente ese identificador opaco y un booleano.
   El control Crear permanece deshabilitado mientras se prepara/lee la marca;
   el handler también espera y revalida el ámbito antes de cualquier POST.

   **Regresiones del caso 4:** 26 pruebas en
   `agents-tab/profile-create-recovery.test.ts`, incluidas en la suite final.
   Cubren persistencia seguida de respuesta perdida; GET vacío/fallido/nombre
   coincidente; recuperación con id ausente/equivocado/sin permiso; aislamiento
   entre usuarios, sesiones y targets; GET y POST tardíos tras cada cambio;
   cierre/remontaje; navegación SPA con AssistantView, Market, ModalShell,
   AgentProfileDialog y editor reales; ausencia de datos privados persistidos;
   preparación diferida de la marca con clics simultáneos y cambio de target;
   Web Crypto no disponible y almacenamiento que rechaza escritura.
   En la prueba SPA solo se simulan transporte, contenido del chat y eventos
   del router; el cierre avanza 250 ms con temporizadores controlados.
   Esto acredita integración frontend en DOM simulado, no un navegador desplegado.

   **Limitación aceptada:** v1 no permite identificar automáticamente la operación
   cuya respuesta se perdió. Si el usuario no puede identificar un perfil
   existente, la incertidumbre y el bloqueo siguen activos. No se solicita una
   ampliación backend para cerrar esta corrección. La marca local no garantiza
   deduplicación entre dispositivos/pestañas independientes o después de borrar
   almacenamiento. Sin Web Crypto o sin storage utilizable, el respaldo en
   memoria conserva el bloqueo y aislamiento durante la vida del documento,
   incluidos desmontajes y navegación SPA, sin prometer persistencia al recargar
   por completo. No se guardan formularios, cabeceras ni secretos.

5. **Cerrar asignación durante PUT rechazado.** `ModalShell.closeDisabled`
   bloquea antes de iniciar la salida y también protege cierres desde contexto,
   Escape, fondo y chrome. Market lo activa mientras guarda; no queda
   pointer-events-none después de BUSY. La regresión usa promesa controlada,
   avanza 250 ms tras los intentos de cierre, rechaza PUT y comprueba que sigue
   accesible para revisar el catálogo, sin una segunda mutación.

6. **Nombre accesible del diálogo.** ModalShell crea un id estable con useId
   para el título semántico de ModalNavbar y lo referencia con aria-labelledby.
   Ofrece ariaLabel/ariaLabelledBy para chrome personalizado. Se comprueban rol,
   referencia al título y nombre visible, estabilidad y unicidad entre diálogos.
   También se comprueba que el cierre estructurado llame una sola vez al
   consumidor tras 200 ms: el header ya no vuelve a iniciar su propia salida.
   Se conservan el controlador externo y el chrome personalizado.

### Archivos de esta correctiva

Rutas relativas a `web/frontend`, inventario acumulado de esta correctiva:

- `src/components/floating-assistant/AssistantPanel.tsx`
- `src/components/floating-assistant/AssistantPanel.agent-launch.test.ts`
- `src/components/floating-assistant/AgentMarket.tsx`
- `src/components/floating-assistant/AgentMarket.test.ts`
- `src/components/floating-assistant/assistant-api/agents.ts`
- `src/components/floating-assistant/assistant-api/agents.market.test.ts`
- `src/components/floating-assistant/agents-tab/use-agents-tab.tsx`
- `src/components/floating-assistant/agents-tab/AgentEditor.tsx`
- `src/components/floating-assistant/agents-tab/profile-create-recovery.ts` (nuevo)
- `src/components/floating-assistant/agents-tab/profile-create-recovery.test.ts` (nuevo)
- `src/components/floating-assistant/chat-pane/ChatMain.tsx`
- `src/components/floating-assistant/chat-pane/ChatMain.market-review.test.ts` (nuevo)
- `src/components/floating-assistant/chat-pane/use-chat-pane-derived.tsx`
- `src/components/floating-assistant/chat-pane/use-chat-pane-actions.tsx`
- `src/components/floating-assistant/chat-pane/use-realtime-voice.tsx`
- `src/components/floating-assistant/chat-pane/use-realtime-voice.test.ts`
- `src/components/floating-assistant/chat-pane/RealtimeRequests.tsx`
- `src/components/floating-assistant/chat-pane/ask-permission.tsx`
- `src/components/floating-assistant/chat-pane/ask-permission.test.ts`
- `src/components/ui/ModalShell.tsx`
- `src/components/ui/ModalNavbar.tsx`
- `src/components/ui/ModalShell.test.ts` (nuevo)
- `src/i18n/{ar,bn,de,en,es,fr,hi,it,ja,ko,pt,ru}/assistant/part2.ts`
- Este `agent-market.handoff.md`.

No se cambiaron contratos HTTP, rutas de login ni permisos backend. Las nuevas
props compartidas son internas de frontend y opcionales; los consumidores
conservan sus valores predeterminados. PermissionView.canApprove es opcional,
por defecto true: las pruebas comprueban los tres botones del consumidor previo
sin esa prop. La voz pasa la admisión explícita. No se cambió configuración de tipos.

En la última continuación se editaron únicamente use-realtime-voice.tsx y su
prueba, RealtimeRequests.tsx, ask-permission.tsx y su prueba,
ChatMain.market-review.test.ts y este handoff. Los demás cambios del inventario
acumulado se conservaron.

### Evidencia final nueva y reproducible

Se escribieron primero regresiones y se observaron los fallos: control de voz
ausente; create llamado desde sugerencia retirada; snapshot viejo de borrador;
dos POST; pointer-events-none persistente; aria-labelledby ausente.
La primera corrida de cuatro archivos registró 12 fallos/30 aprobadas; también
detectó fixtures incompletos de la prueba nueva de chat, corregidos antes de
validar. Ese total no representa doce defectos del producto. La reproducción
de chat se repitió con sus API simuladas completas antes del arreglo.

La ampliación del caso 4 reprodujo **3 fallos/18 aprobadas** antes del arreglo
(21 casos, 2,06 s). Después se completaron las 26 regresiones del archivo,
sin omitir ni desactivar casos. Un error nuevo de tipos en el fixture de
workspace (null en lugar de proveedor/modo válidos) se corrigió en la prueba;
el typecheck final vuelve a cero, sin supresiones ni cambios de configuración.

La continuación de voz reprodujo **8 fallos/10 aprobadas** antes de modificar
producto (18 pruebas; 0,988 s; salida 1). Son ocho aserciones fallidas de los dos
huecos de admisión, no ocho defectos nuevos. Tras corregirlos se añadieron la
carrera del clic encolado y tres casos de compatibilidad del componente común.
La corrida focal final del **2026-10-17, 19:36 America/Bogota** fue:

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/components/floating-assistant/chat-pane/use-realtime-voice.test.ts src/components/floating-assistant/chat-pane/ChatMain.market-review.test.ts src/components/floating-assistant/chat-pane/ask-permission.test.ts --maxWorkers=1 --reporter=dot --silent
```

Salida **0; 3 archivos; 32 aprobadas; cero fallos u omitidas; 3,74 s**.
El hook y los botones de RealtimeRequests/PermissionView son reales en las
regresiones de voz; las APIs/WebRTC están simuladas. ChatMain verifica que
canStart pasa de true a false durante loading/error del catálogo y ante
históricos bloqueados. La suite de voz tiene 19 pruebas; ChatMain, 8; y
ask-permission, 5. Esas 32 están incluidas en el total integrado, no se suman.

La suite final se volvió a ejecutar completa el **2026-10-17, 19:37–19:39
America/Bogota**, después del último ajuste de código y pruebas. Sustituye los
resultados anteriores de 653 y 675 pruebas; no los suma ni los recicla como
evidencia. Se dividió en ocho lotes seriales por el límite de duración del canal
protegido. Se comprobaron los JSON y los nombres de archivo: 76 únicos, sin
duplicados, todos con success:true.

| Lote | Archivos | Aprobadas | Fallos / omitidas / todo |
| --- | ---: | ---: | --- |
| 1 | 10 | 59 | 0 / 0 / 0 |
| 2 | 10 | 74 | 0 / 0 / 0 |
| 3 | 10 | 125 | 0 / 0 / 0 |
| 4 | 10 | 69 | 0 / 0 / 0 |
| 5 | 10 | 123 | 0 / 0 / 0 |
| 6 | 10 | 57 | 0 / 0 / 0 |
| 7 | 10 | 45 | 0 / 0 / 0 |
| 8 | 6 | 135 | 0 / 0 / 0 |
| **Total** | **76** | **687** | **0 / 0 / 0** |

Todos los comandos finalizaron con salida 0. Informes locales ignorados:
`.cache/market-voice-review-batch-{1..8}.json`, todos con success:true.
Reproducción exacta desde `web/frontend` (sin build):

```sh
python3 - <<'PY'
import os, subprocess
files = subprocess.check_output([
    "rg", "--files", "src/components/floating-assistant",
    "src/components/workspace", "src/components/ui",
    "-g", "*.test.ts", "-g", "*.test.tsx",
], text=True).splitlines()
files = sorted(files + [
    "src/lib/assistant-request.test.ts", "src/lib/search-target.test.ts",
    "src/lib/panel-routes.test.ts", "src/lib/auth.test.ts",
    "src/middleware.permissions.test.ts",
])
env = dict(os.environ, NODE_ENV="test", NODE_OPTIONS="--max-old-space-size=2560")
for offset in range(0, len(files), 10):
    batch = offset // 10 + 1
    subprocess.run([
        "./node_modules/.bin/vitest", "run", *files[offset:offset + 10],
        "--maxWorkers=1", "--reporter=json",
        f"--outputFile=.cache/market-voice-review-batch-{batch}.json", "--silent",
    ], env=env, check=True)
PY
```

Incluye la suite del asistente, ModalShell y sus consumidores, PermissionView,
workspace y regresiones de rutas/permisos.
El runner sigue mostrando avisos auxiliares de conexión rechazada a
localhost:3000; no hubo fallos ni pruebas omitidas. Esto no diagnostica el
servicio de producción ni acredita logs de un despliegue.

```sh
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
npm run i18n:split
node scripts/i18n-audit-coverage.mjs
git -C /var/www/LUXIPANEL diff --check -- web/frontend
```

- Typecheck **salida 0, cero diagnósticos**, última ejecución **24,619 s** tras
  completar la continuación de voz el 2026-10-17.
  La línea base antes de editar también fue salida 0 (25,813 s).
  **Remanentes externos exactos: ninguno en este checkout.** Los cinco archivos
  de la corrección externa ya estaban modificados al entrar; no se editaron en
  esta correctiva. No se aplicaron any, supresiones, exclusiones ni strict más
  permisivo para ocultar errores.
- i18n: evidencia de la fase anterior de esta correctiva, conservada sin repetir
  la generación en la continuación de voz, que reutiliza agentMarket.readOnly.
  Tres textos nuevos en los doce catálogos fuente. Split **salida 0**:
  39 namespaces × 12 idiomas = 468 JSON, versión `0a6379a6f6ef`.
  Auditoría **salida 0**, 8631 claves, cero faltantes, extras, diferencias de
  tipo/placeholders o vacíos. Derivados regenerados por el script.
- Diff check: **salida 0**.

### Corrección externa de los 19 diagnósticos: aplicada y conservada

Trazabilidad solicitada por coordinación el **2026-10-17**, conservada en esta
entrega final sin volver a editar esos cinco archivos.
Estos cinco archivos ya estaban corregidos al comenzar esta correctiva UI;
se cotejó su diff y se conservaron sin nuevas ediciones. No queda un arreglo
de tipos pendiente que deba asignarse de nuevo. Rutas relativas a `web/frontend`:

| Archivo | Corrección ya presente |
| --- | --- |
| `src/lib/diagnostics/browser.ts` | El listener recibe `Event` y estrecha a `ErrorEvent`; mantiene el tratamiento de errores de recursos. |
| `src/types/extracted-scripts.d.ts` | Reexporta los tipos fuente de permission-editor y mail-server-settings; declara `previousError` conforme a la implementación de sudo. |
| `src/scripts/extracted/components/floating-terminal/startup.test.ts` | Añade `status: 200` a respuestas satisfactorias y tipa la promesa diferida con `ApiResponse`. |
| `src/scripts/extracted/pages/panel/expo/read.test.ts` | Completa el status de las respuestas simuladas satisfactorias. |
| `src/scripts/extracted/pages/panel/mail/account-catalog.ts` | Deriva `AccountOption` de `MailAccount` mediante `Pick`, conservando el dominio opcional del respaldo local. |

La entrega previa, fechada **2026-10-17**, registró este comando para los
consumidores afectados (terminal, Expo, catálogo/API de correo, política de
proveedor y etiquetas de permisos):

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/scripts/extracted/components/floating-terminal/startup.test.ts src/scripts/extracted/pages/panel/expo/read.test.ts src/scripts/extracted/pages/panel/mail/accounts.loading.test.ts src/scripts/extracted/lib/mail-api-client.test.ts src/scripts/extracted/pages/panel/hosting/provider-policy.test.ts src/lib/permission-labels.test.ts --maxWorkers=1 --reporter=dot --silent
```

Salida registrada: **0; 6 archivos; 48 aprobadas; cero fallos u omitidas;
3,44 s**. Esta evidencia es previa, no se volvió a ejecutar por la actualización
de coordinación ni se suma a las **687 pruebas de la suite final de esta correctiva UI**.

El comando de tipos, ejecutado antes y después de las correcciones UI, fue:

```sh
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
```

Ambas ejecuciones registradas en esta correctiva del **2026-10-17** terminaron
con **salida 0 y cero diagnósticos**: línea base 25,813 s; final 24,619 s.
Remanentes exactos: **0**. No se añadió `any`, exclusión, supresión ni relajación
de strict para obtener ese resultado. Las 48 pruebas anteriores no se repitieron en esta continuación; sí se ejecutaron
la suite final de 687 y el typecheck final descritos arriba.

No hubo build, restart, commit, push, cambio de rama, worktree, copia de
checkout, nota docs/changes, ediciones backend/LP/móvil/desktop/infra/.env ni
mutaciones de datos reales. La implementación y sus regresiones de autora quedan cerradas; QA integrada
en navegador y con backend real conserva su gate independiente pendiente. Andrés conserva la fase posterior
de compilación/reinicio/verificación. La publicación corresponde al panel.


La decisión de mantener la recuperación manual y el bloqueo seguro queda aplicada.
La evidencia backend 381/381 en 16 suites y typecheck 0 fue comunicada por Marin
(contrato backend, sección de línea 317); no se ejecutó ni se atribuye a esta
entrega frontend. Camila aprobó H3–H6 en fuente/pruebas según su último informe;
los dos huecos de H1/H2 corregidos aquí quedan disponibles para su revalidación.
El gate integrado de QA no se declara aprobado por esta entrega de autora.

---

Implementación en el checkout original `developer`, solo `web/frontend`.
Entrega final de desarrollo UI: Market, navegación y permisos implementados y
verificados localmente. Inventario: **11 archivos nuevos y 50 modificados**;
suite completa **609/609**, revisión final de navegación **113/113** y
typecheck del checkout **salida 0**. La corrección externa de tipos se documenta
por separado abajo. La validación integrada en navegador y el despliegue siguen
pendientes; este informe no acredita publicación.

## Comportamiento y contrato consumido

Se cotejó el contrato v1 de
`web/backend/src/modules/ai-assistant/docs/agent-market-contract.md` con los tipos
y servicios actuales de Mateo. Se coordinó por el canal de agentes, sin modificar
backend ni solicitarle cambios adicionales al DTO.
QA comunicó después tres defectos backend que conservan este mismo shape:
carrera al incorporar una asignación durante la admisión de un chat sin
proyecto, alias de herramientas con diferencias entre DTO y ejecución, y
superiores/conexiones fuera del equipo contextual. Su corrección corresponde
a Mateo y su nueva validación integrada a QA; esta entrega no acredita esos
arreglos ni introduce excepciones de permisos o cambios de proyecto.

- Entrada visible Market desde Agentes IA, búsqueda global del panel, bus v1 y
  drawer; `agentes` conserva compatibilidad como alias. El chat permanece montado.
- Ruta dedicada `src/pages/panel/assistant/market.astro`, con enlace
  `/panel/assistant/market` y URL pública canónica `/assistant/market` según el
  middleware existente. Exige sesión y vista `panel.assistant`, incluso con
  `__lxp_internal__`; el layout permite la visita autorizada con menú oculto.
  Reutiliza el asistente persistente y los textos Market de los 12 catálogos.
  Navegación SPA, Atrás/Adelante y volver al chat conservan la instancia y el
  borrador; solicitudes duplicadas no crean dos navegaciones.
- Contrato exclusivamente frontend: `AssistantPanel.onNavigateTab` comunica
  acciones al wrapper `AssistantView`, que usa el router de Astro. La lectura
  de ruta no genera historial; el drawer sigue usando navegación local.
  `InternalModuleHost` emite `lxp:internal-modules:route-changed` tras sus cambios
  de historial para sincronizar apertura/cierre de módulos sin swap de Astro.
  Este complemento no modifica los endpoints ni DTO consumidos.
- Al volver del Market, home admite `panel.assistant` además del permiso legado
  `panel.dashboard`; antes un usuario con solo vista de asistente podía rebotar
  entre `/` y el redirect `/assistant`. `hasView` separa acceso de visibilidad:
  layout y home conservan el asistente con menú oculto, mientras un menú visible
  sin permiso de vista no lo monta. Se mantiene la sesión obtenida del backend,
  los scopes de target y las comprobaciones de acciones; no se cambia el login.
- Catálogo completo: `GET /api/ai/agents?contextProjectId=P`; la comprobación de
  miembros al cambiar de proyecto usa `GET /api/ai/agents?projectId=P`.
  No se combinan ambos parámetros. El cliente también tipa `q` y `technology`.
  El Market filtra localmente nombre, descripción, especialidad, tecnologías,
  proveedor, rol efectivo y pertenencia, sin hacer búsquedas por cada pulsación.
- Se consumen `context.projectId/membership/directAssignment/effectiveAssignment/
  effectiveConfig`, `capabilities`, `execution` y las asignaciones visibles.
  Las acciones requieren capacidades explícitas; `relation:shared`, el equipo
  global y la posición de `projectIds` no conceden permisos de ejecución.
- `PUT /api/ai/agents/:id/assignments/:projectId` incorpora o configura;
  `DELETE` retira, previa confirmación, sin borrar perfil ni historial.
  Ambas operaciones son síncronas, 200 y sin jobs. Se espera el resultado y se
  emite `lxp:assistant:agents-updated` antes de recargar. Un resultado incierto
  requiere releer el catálogo antes de repetir, también dentro del editor.
- El cliente dispone de `GET /agents/:id/assignments?projectId=P`; la interfaz
  aprovecha el DTO contextual ya recibido para evitar una lectura redundante.
  Conserva status/code para permisos, ocupación, herencia y resultado desconocido.
- El editor de asignación envía exclusivamente los campos modificados:
  cargo, instrucciones, rol, superior, conexiones, herramientas, supervisión,
  rutas, servidores e índices. Null hereda, listas vacías restringen a ninguno.
  En una personalización heredada muestra la fila directa conservada o los
  valores predeterminados; no muestra valores del padre que PUT no copiaría.
- `AgentProfileDialog` edita el perfil global en un único modal. Crear/editar
  incluye especialidad y tecnologías; el payload global omite `projectIds` y
  `teamId`. Se conservan modelo, proveedor, credenciales redactadas y recursos.
- El selector y los accesos conservan proyecto/subproyecto y borrador con
  adjuntos. El historial de retirados sigue accesible y se distingue como
  histórico. Un chat persistido conserva `projectId`, incluido null; no se
  recontextualiza al abrirlo ni se habilita envío por su mera presencia.
- Se preservan historial, actividad, accesos y registro de lectura anteriores.
  La actividad heredada consulta solo los propietarios de los buzones legados,
  por separado de los agentes compartidos, y deduplica conversaciones.
- Formularios y lecturas descartan respuestas de targets/sesiones anteriores;
  cambios de permisos invalidan el catálogo y se comprueban antes de mutar.

## Archivos de este aporte

Rutas relativas a `web/frontend`. Los archivos marcados como nuevos no existían
en el checkout inicial; el resto conserva los cambios previos de historial/actividad.

Nuevos:

```text
src/components/floating-assistant/AgentMarket.tsx
src/components/floating-assistant/AgentAssignmentEditor.tsx
src/components/floating-assistant/AgentProfileDialog.tsx
src/components/floating-assistant/agent-market-state.ts
src/components/floating-assistant/AgentMarket.test.ts
src/components/floating-assistant/agent-market-state.test.ts
src/components/floating-assistant/assistant-api/agents.market.test.ts
src/components/floating-assistant/agent-market.handoff.md
src/components/floating-assistant/AssistantView.route.test.ts
src/lib/panel-routes.test.ts
src/pages/panel/assistant/market.astro
```

Modificados:

```text
ARCHITECTURE.md
src/components/floating-assistant/README.md
src/components/floating-assistant/AgentsTab.tsx
src/components/floating-assistant/AssistantPanel.tsx
src/components/floating-assistant/AssistantPanel.agent-launch.test.ts
src/components/floating-assistant/AssistantView.tsx
src/components/floating-assistant/FloatingAssistantDrawer.test.ts
src/components/floating-assistant/ProjectAgentsDialog.tsx
src/components/floating-assistant/agents-tab/AgentEditor.tsx
src/components/floating-assistant/agents-tab/draft.ts
src/components/floating-assistant/agents-tab/use-agents-tab.tsx
src/components/floating-assistant/assistant-api/agents.ts
src/components/floating-assistant/chat-pane/ChatMain.tsx
src/components/floating-assistant/chat-pane/ChatSidebar.tsx
src/components/floating-assistant/chat-pane/agent-chat-handoff.test.ts
src/components/floating-assistant/chat-pane/agent-shortcut-activity.test.ts
src/components/floating-assistant/chat-pane/reactbits/PromptBar.tsx
src/components/floating-assistant/chat-pane/reactbits/PromptBar.integration.test.ts
src/components/floating-assistant/chat-pane/use-agent-shortcut-activity.ts
src/components/floating-assistant/chat-pane/use-chat-pane-derived.tsx
src/components/floating-assistant/default-reasoning.test.ts
src/components/floating-assistant/i18n.tsx
src/components/floating-assistant/project-modal/ProjectModalView.tsx
src/components/floating-assistant/project-modal/agent-scope.ts
src/components/floating-assistant/project-modal/project-agents.test.ts
src/components/workspace/credentials/AgentCredentialFields.tsx
src/components/workspace/InternalModuleHost.tsx
src/layouts/PanelLayout.astro
src/lib/assistant-request.ts
src/lib/assistant-request.test.ts
src/lib/auth.ts
src/lib/auth.test.ts
src/lib/panel-routes.ts
src/lib/search-catalog.ts
src/middleware.ts
src/middleware.permissions.test.ts
src/pages/panel/index.astro
vitest.config.ts
src/i18n/es/assistant/part2.ts
src/i18n/en/assistant/part2.ts
src/i18n/fr/assistant/part2.ts
src/i18n/de/assistant/part2.ts
src/i18n/it/assistant/part2.ts
src/i18n/pt/assistant/part2.ts
src/i18n/ar/assistant/part2.ts
src/i18n/bn/assistant/part2.ts
src/i18n/hi/assistant/part2.ts
src/i18n/ja/assistant/part2.ts
src/i18n/ko/assistant/part2.ts
src/i18n/ru/assistant/part2.ts
```

`FloatingAssistantDrawer.tsx`, `project-history.ts`, `AgentsListView.tsx`,
`agents-tab/messages.ts` y `use-team-agent-picker.ts` reutilizan sus mecanismos
existentes; no se crearon duplicados ni se cambiaron sus contratos.
`i18n.tsx` incluye los tipos de agentsTab que faltaban; la mezcla del catálogo
de credenciales y el fixture de razonamiento corrigen errores de tipos del área.

## Verificación reproducible

Desde `web/frontend`, primera verificación del Market:

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/components/floating-assistant src/lib/assistant-request.test.ts src/lib/search-target.test.ts --maxWorkers=1 --reporter=dot --silent
```

Salida **0: 62 archivos, 481 pruebas aprobadas, cero fallos u omitidas**, 43,26 s.
Incluye filtros, incorporación/retirada, permisos, duplicación de envíos,
resultado incierto, personalización heredada, perfil separado, target/sesión,
navegación, subproyectos, historial inmutable y actividad previa.
Los fixtures se adaptaron al DTO contextual, conservando las aserciones de
comportamiento. Una espera fija para el render perezoso del historial pasó a
esperar el resultado visible. No se desactivó ninguna prueba.
El runner emitió avisos de solicitudes auxiliares a localhost:3000 sin servicio;
no provocaron fallos y no constituyen una comprobación del servicio desplegado.

Última suite completa tras incorporar la ruta, historial y permisos de retorno
(sustituye los totales provisionales anteriores):

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/components/floating-assistant src/components/workspace src/lib/assistant-request.test.ts src/lib/search-target.test.ts src/lib/panel-routes.test.ts src/lib/auth.test.ts src/middleware.permissions.test.ts --maxWorkers=1 --reporter=dot --silent
```

Salida **0: 70 archivos, 609 pruebas aprobadas, cero fallos u omitidas**, 58,80 s.
Incluye entrada directa interna/pública, instancia persistente, borrador y
subproyecto, SPA, Atrás/Adelante, cierre de módulos internos, duplicación de
eventos, fallo de navegación, carga/deshabilitado, cambio de target y acceso
con menú oculto. Las pruebas de permisos comprueban sesión, reescritura interna,
retorno a home con `panel.assistant`, compatibilidad con `panel.dashboard` y
denegación cuando solo existen permisos de menú o acciones.
La navegación Astro se simula en Vitest; no sustituye la comprobación real en
navegador. El caso de módulos internos sí monta su host y verifica su apertura
y cierre junto a la vista persistente. Se mantuvieron los avisos auxiliares de
localhost descritos arriba, sin fallos de pruebas.

Revisión final focalizada de navegación y permisos, sin nuevos cambios de
producto tras esa suite completa:

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/components/floating-assistant/AssistantView.route.test.ts src/lib/panel-routes.test.ts src/lib/auth.test.ts src/middleware.permissions.test.ts --maxWorkers=1 --reporter=dot --silent
```

Salida **0: 4 archivos, 113 pruebas aprobadas, cero fallos u omitidas**, 2,14 s.
Estos casos ya forman parte de las 609 pruebas anteriores; no se suman como
pruebas adicionales. Comprueban específicamente:

- `panel.assistant` permite Market y regreso al chat con menú oculto.
- `panel.dashboard` conserva acceso a inicio y no concede acceso a Market.
- Sin ninguno de esos permisos se deniega el acceso aunque el menú sea visible
  o existan permisos de acciones.
- SPA, Atrás/Adelante y apertura/cierre de módulos internos conservan chat,
  borrador y subproyecto sin duplicar entradas de historial.
- Se conservan login, sesión, autorización por target y separación entre
  permisos de vista, visibilidad del menú y acciones.

Análisis de sintaxis con `@astrojs/compiler.parse`, sin emitir ni ejecutar build:
**salida 0**, ningún error en `market.astro`, `panel/index.astro` y
`PanelLayout.astro`. Los dos primeros no tienen diagnósticos; el layout mantiene
17 sugerencias sobre scripts inline preexistentes, ajenas a estas líneas.

```sh
npm run i18n:split
node scripts/i18n-audit-coverage.mjs
```

Ambas salidas **0**. Generación: **39 namespaces × 12 idiomas = 468 JSON**,
versión `26dcabe22be1`. Auditoría: **8628 claves**, 43 nuevas del Market en los
12 idiomas, cero faltantes, extras, tipos, placeholders incompatibles o vacíos.
Solo se editaron fuentes; el script regeneró los derivados y el catálogo público.
La auditoría se repitió tras añadir la ruta: mismo total, salida 0 y ninguna
discrepancia. El complemento reutiliza las traducciones existentes del Market.

```sh
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
```

Resultado vigente **salida 0, cero diagnósticos**. Los 19 errores anteriores
fueron corregidos bajo el encargo externo autorizado antes de esta entrega;
no son un gate fallido ni un pendiente actual. No se rebajó tsconfig, no se
excluyeron pruebas ni se añadieron supresiones o `any`.

### Aporte externo de tipos, separado del inventario UI

Se conserva como entrega independiente ya aplicada, sin ampliarlo en este
cierre. Fueron cinco archivos y 48 pruebas focalizadas; no se modificaron los
archivos del Market para resolver estos errores.

| Archivo relativo a frontend | Corrección |
| --- | --- |
| `src/lib/diagnostics/browser.ts` | Evento base `Event` para estrechar a `ErrorEvent` y conservar los errores de recursos. |
| `src/types/extracted-scripts.d.ts` | Reexportaciones de los tipos fuente de permission-editor y mail-server-settings; `previousError` según la implementación existente de sudo. |
| `src/scripts/extracted/components/floating-terminal/startup.test.ts` | Respuestas simuladas con status 200 y promesa diferida tipada con ApiResponse. |
| `src/scripts/extracted/pages/panel/expo/read.test.ts` | Status 200 en respuestas simuladas satisfactorias. |
| `src/scripts/extracted/pages/panel/mail/account-catalog.ts` | AccountOption deriva de MailAccount y refleja el dominio opcional del respaldo local. |

```sh
NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/vitest run src/scripts/extracted/components/floating-terminal/startup.test.ts src/scripts/extracted/pages/panel/expo/read.test.ts src/scripts/extracted/pages/panel/mail/accounts.loading.test.ts src/scripts/extracted/lib/mail-api-client.test.ts src/scripts/extracted/pages/panel/hosting/provider-policy.test.ts src/lib/permission-labels.test.ts --maxWorkers=1 --reporter=dot --silent
```

Salida **0: 6 archivos, 48 pruebas aprobadas, cero fallos u omitidas**, 3,44 s.
El typecheck indicado arriba se ejecutó después de estas correcciones de tipos;
el cierre posterior solo actualiza este informe.

Desde la raíz, `git diff --check -- web/frontend`: **salida 0**.
Sin copias, worktrees, cambio de rama, commit, push, builds ni reinicios.
No se tocaron los dist preexistentes, backend, infraestructura ni docs/changes.

## Continuación coordinada

1. Camila: probar frontend y backend juntos con un perfil en dos proyectos,
   personalización heredada, retiro ocupado/confirmado, usuario compartido,
   historial previo, cambio de target y ambos modos vista/drawer. Verificar móvil,
   RTL, foco y contraste sobre el tema real. La revisión con datos simulados no
   acredita autorización real ni funcionamiento desplegado.
   Incluir entrada directa `/panel/assistant/market` y alias canónico, menú
   Agentes IA → Market, buscador, Atrás/Adelante, abrir/cerrar otro módulo y
   regreso al mismo chat con borrador. Comprobar sesión y permisos reales.
   Repetir la admisión concurrente de un chat con proyecto null, la equivalencia
   de alias de herramientas entre DTO y ejecución y la pertenencia de superiores
   y conexiones al equipo contextual después de las correcciones de Mateo.
   Las pruebas locales del frontend no resuelven esos tres pendientes integrados.
   En el descubrimiento de esta sesión, `modules.describe("browser")` no
   devolvió operaciones; usar el canal browser disponible en QA/líder. Esto
   no acredita un fallo de conexión del servidor.
2. Líder: recibir esta entrega final UI y secuenciar QA. La corrección externa
   de tipos ya verificada se mantiene separada; el checkout actual pasa tsc.
   No queda otra ampliación de frontend dentro de este encargo.
3. Andrés: build limpio serial y restart exclusivamente en la fase autorizada,
   seguido de proceso online, logs, HTTP y flujos reales. Esta entrega no ejecutó
   ni solicita adelantar esa fase.
4. QA registra la nota consolidada de cambios cuando corresponda. El panel
   confirma la publicación; este aporte no la da por terminada.
