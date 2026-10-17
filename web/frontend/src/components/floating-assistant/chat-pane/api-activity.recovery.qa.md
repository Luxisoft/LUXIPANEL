# Actividad API compacta: integración y recuperación verificadas

## Corrección del último bloqueo frontend — evidencia vigente, 2026-10-17

Responsable: Valentina. Entrega al líder, Mateo y QA. Esta sección sustituye las
cuentas de verificación de la entrega anterior, conservada debajo como histórico.
**El bloqueo frontend del snapshot está corregido en fuentes y pruebas; no se
declara aprobado el gate global ni desplegada la aplicación.**

### Contrato confirmado y cambio exacto

Se leyó el handoff ACTUALIZADO
`web/backend/src/modules/ai-assistant/docs/continuation-integrity-handoff.md`
y se contrastó con `models/team-task.types.ts` del backend. Su SHA-256
`ecf2d40284d81848a8cb7aa5f316449a9b18bb135021daf24b0861fcc0e8251a`
coincide con la entrega vigente de Mateo. Es un consumo del contrato compartido
ya entregado, sin nuevos endpoints, eventos ni firmas de callbacks.

Únicos archivos de producto/pruebas/informe escritos en este turno, relativos
a `web/frontend/`:

| Archivo | Cambio propio |
| --- | --- |
| `src/components/floating-assistant/assistant-api/team.ts` | `TeamTaskSnapshot` incorpora `artifacts?`, `verify?` e `isolation?` mediante los miembros de `TeamTaskView`; `snapshotToTaskView` conserva los tres bloques si existen. `TeamTaskArtifacts.tokens` incorpora `overBudget?: boolean`. Se actualiza el comentario del DTO. |
| `src/components/floating-assistant/chat-engine/team-snapshot.test.ts` | Archivo nuevo: 14 regresiones del adaptador real, `teamApi`, `refreshTeamTasks` y `TeamTaskBoard`, con transporte/almacenamiento simulado. |
| `src/components/floating-assistant/chat-pane/api-activity.recovery.qa.md` | Esta actualización técnica; conserva el informe anterior. |

`chat-engine.ts` y `TeamTaskBoard.tsx` se revisaron y no necesitaron cambios.
El primero conserva la mezcla compatible con historial antiguo y la guarda ante
eventos posteriores a la lectura; el segundo vuelve a recibir los contadores,
la verificación y la rama que necesita para su UI existente y el botón de diff.

Los bloques son **opcionales, no null**. Un historial antiguo no recibe objetos
de evidencia vacíos ni una verificación inventada. Se conservan los contadores
cero, los intentos y los estados `running/passed/failed/skipped`; `failed` y
`skipped` no se convierten en éxito. Se preservan los tres modos de aislamiento
`worktree/lease/none`. La proyección backend omite rama vacía y solo emite
`integrated` cuando es true; `tokens.estimated=false` y
`tokens.overBudget=false` sí se conservan, y `overBudget` ausente sigue ausente.

Se consumen los objetos compactos ya saneados por el productor: el frontend no
añade al snapshot listas de archivos, diff, logs, comandos, rutas de aislamiento,
SHA/PR, instrucciones, usuario ni sesión. Tampoco introduce un parser nuevo de
datos corruptos. El contenido del diff se solicita por el endpoint existente
solo al abrirlo; no se reconstruye desde el texto del agente.

### Reproducción y verificación actual

Directorio de todos los comandos siguientes: `/var/www/LUXIPANEL/web/frontend`.

Se reprodujo primero el comando focal solicitado, con **5 aprobadas / 1 fallida,
salida 1**, duración 1,17 s. La pérdida estaba en `restored.artifacts`; las
aserciones de `verify/isolation` seguían detrás de esa primera comparación:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Después del cambio se ejecutaron QA original y las nuevas regresiones juntas:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts src/components/floating-assistant/chat-engine/team-snapshot.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Resultado: **2 archivos, 20 pruebas aprobadas, salida 0, 2,22 s**: las seis de QA
y las catorce nuevas. La prueba original de recarga fría alcanza y aprueba TODAS
sus aserciones: artifacts `{filesChangedTotal:2,insertions:5,deletions:1}`,
verify `{state:"passed",attempts:1}` e isolation
`{mode:"lease",branch:"developer",integrated:true}`. No se editó su archivo ni
se relajó ninguna expectativa.

La nueva regresión de consumidor parte de un chat sin tareas residentes, entrega
el snapshot a través de una respuesta JSON simulada del cliente HTTP, ejecuta
`teamApi.getConversationSnapshot` y `chatEngine.refreshTeamTasks` reales y
renderiza el tablero real. Comprueba contador, verificación y rama; pulsa el
botón de diff y verifica la solicitud por taskId, los dos archivos y el texto
del diff en el diálogo. Los demás casos cubren historial antiguo, cero y flags
de tokens, todos los estados de verificación, actualización desde snapshot,
conservación de detalles live ante un snapshot antiguo y descarte de datos
tardíos al cambiar target/conversación o recibir SSE más reciente.

Suite integrada final, misma selección de QA más el archivo nuevo incluido
en `chat-engine/`:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine src/components/floating-assistant/chat-engine.test.ts src/components/floating-assistant/chat-pane/team-execution.render.test.ts src/components/floating-assistant/chat-pane/turn-view.container.test.ts src/components/floating-assistant/chat-pane/ask-permission.test.ts src/components/floating-assistant/assistant-api/conversations-open.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
```

**15 archivos, 142 pruebas aprobadas, cero fallos/omitidas, salida 0, 14,22 s.**
Incluye historial, streaming API/CLI, replay, reconexión/adopción, cola,
agentes/tablero, preguntas/permisos, consola única, estados pendientes/fallidos
y separación de actividad y respuesta final. No es la suite completa del monorepo.

Comprobaciones adicionales ejecutadas:

```bash
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
node --expose-gc --max-old-space-size=2560 scripts/qa-activity-typecheck-baseline.mjs
npm run i18n:audit
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node scripts/qa-api-activity.mjs
git -C /var/www/LUXIPANEL diff --check -- web/frontend
```

| Comprobación | Exit | Resultado actual |
| --- | ---: | --- |
| TypeScript completo | 2 | 26 diagnósticos; no se declara verde. |
| Comparador contra HEAD en memoria | 0 | HEAD 26 / actual 26; mismos archivos, posiciones, códigos y mensajes; añadidos 0, eliminados 0, en archivos tocados 0. `savedHeadersMatch=true`; 1468 raíces HEAD / 1476 actuales. |
| i18n audit | 0 | 12 idiomas, 39 namespaces, 8573 claves por idioma; faltantes/extras/tipos/placeholders/vacíos: 0. |
| Chromium del área de actividad | 0 | 360/1280 px × claro/oscuro, 28 casos de estado, Enter/Espacio, foco, objetivos de 44 px, ARIA y ausencia de desbordamiento; sin infracciones de las reglas axe ejecutadas ni pageErrors. |
| Diff check frontend | 0 | Sin errores de whitespace. |

El comparador usó HEAD `46abcb9aed44e78915cf488a9a2050ca8196c482` en memoria,
sin crear copias del proyecto ni worktrees. La lista histórica de los 26
diagnósticos que figura más abajo sigue siendo exacta. No se modificaron
traducciones, por lo que no se necesitó regenerar i18n.

El arnés de Chromium existente se ejecutó sin editar: componentes/CSS reales,
HTTP/WS simulados, `production=false`, `success=true`, `cleanup=true`.
Se cerraron navegador y servidor de pruebas. Se inspeccionaron visualmente las
capturas nueva móvil clara y escritorio oscuro: mantienen la consola única y
la respuesta separada. Artefactos ignorados regenerados:
`.cache/api-activity-contract-qa/verification.json` y
`light|dark-360|1280.png`. El diff del tablero se comprobó con React/happy-dom;
estas capturas cubren actividad compacta, no la apertura del diff en la release
instalada ni una auditoría completa de accesibilidad.

Vitest requirió permiso de escritura de caché después de que el sandbox de
solo lectura impidiera su arranque; ese intento no ejecutó casos. El comparador
también necesitó permiso para su subproceso de lectura Git. La suite integrada
conserva los avisos previos de `act` y conexiones rechazadas al localhost:3000
del arnés; terminó con salida 0. No son evidencia de fallo del servidor conectado.

### Propiedad, coordinación y entrega restante

Se conservaron todos los cambios anteriores. No se tocaron backend, el test QA
original, `docs/changes`, auth/licencia/sesión/executor, dependencias, entorno
ni servicios. Se mantuvieron el checkout original y la rama `developer`, sin
copias, worktrees, commits ni push. Se leyeron CLAUDE/arquitecturas/README y el
informe QA previo. El catálogo de módulos no ofreció un canal de grafo utilizable
ni operaciones Obsidian; no se atribuye a una conexión caída. Las escrituras
frontend usaron `modules.execute/files.write`, revisión descubierta `2:0`.

Sumas SHA-256 finales de la corrección y de los límites relevantes:

| Archivo relativo al frontend, salvo indicación | SHA-256 |
| --- | --- |
| `src/components/floating-assistant/assistant-api/team.ts` | `5ffebc6e3e0b703a27d5737ad8b7f1ab9ebb91dbcb3715ff23fb9323d4cbef69` |
| `src/components/floating-assistant/chat-engine/team-snapshot.test.ts` | `27deef39f7ba06eecbba4fc8ac30c9fd56008781cc48de2009ccf9cbd84b855b` |
| `src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts`, sin cambios | `b9f494a86f8f59b8105f486389ae747ed898e80f7fe92c3dcc0b4462be679996` |
| `src/components/floating-assistant/chat-engine.ts`, sin cambios en este turno | `43f1153fea2f8eb14cfd7c996916cf7ad4622d99983e8a80c9d7448f92d0ef0f` |
| `src/components/floating-assistant/TeamTaskBoard.tsx`, sin cambios | `e43905f1cf638aae89362f66f234b78da75d57a3a74c2c738953af08afb93f51` |
| Raíz: `docs/changes/2026-10-17-actividad-compacta-continuidad.json`, sin cambios | `7aee89bbbc254070479e1d3ccd926df451a95c8a14e7c280769c6021e2abecd3` |

El contrato actualizado de Mateo se considera consumido y comprobado por el
test cruzado real backend → JSON → frontend. No había otro agente accesible
en el canal de coordinación; este informe es la entrega al líder y a QA,
sin afirmar una respuesta recibida de Mateo.

Las **994 pruebas backend aprobadas y una omitida** son evidencia de la entrega
de Mateo, no una corrida de este turno. La omitida sigue siendo
`services/providers/cli/resource-launch.test.ts`, condicionada por
`LXP_RESOURCE_INTEGRATION=1/systemd` real; no se activó ni se cuenta como
fallo pendiente de persistencia API.

Pendiente: revalidación independiente de QA y su decisión del gate conjunto.
Después corresponde el turno exclusivo de infraestructura y la verificación
instalada de recarga/diff, navegación SPA, conexión/target, HTTP/chunks y logs.
**No hubo build, restart, despliegue ni publicación manual; no se confirma el
fin global ni publicación en GitHub.**

---

## Entrega anterior conservada como histórico

Fecha: 2026-10-17. Entrega frontend en el proyecto original, rama `developer`.
La ruta autorizada `/var/www/LUXIPANEL/frontend` resuelve a `/var/www/LUXIPANEL/web/frontend`.

Este informe describe la continuación actual. Los resultados anteriores de `api-activity.qa.md` y `api-activity.completion.qa.md` se conservan como historial; sus limitaciones sobre la falta de un contrato API se sustituyen por la integración descrita aquí. No se reutilizan sus cuentas de pruebas como evidencia actual.

## Resultado y alcance

- La actividad API mantiene el diseño existente: resumen compacto, detalles de llamadas y una sola Consola del servidor por mensaje. Los avances se muestran en orden entre llamadas; la respuesta, copiar y leer en voz alta usan el texto final.
- Se consumen las fases explícitas incluso cuando hay avances después de la última llamada. Los mensajes antiguos sin metadatos conservan su texto; no se inventan herramientas ni se interpretan párrafos como eventos.
- La recarga reconstruye llamadas por identificador con sus entradas, resultados y errores, aunque varias llamadas tengan el mismo nombre. Conserva comentarios, resultados sin llamada y el indicador de historial limitado.
- Terminar un stream con trabajo pendiente no es completar la tarea. El estado persistido se separa del indicador local de generación. Las llamadas confirmadas pueden estar listas mientras el turno espera a los trabajadores. Una cancelación confirmada prevalece sobre una espera histórica cuando no quedan tareas activas.
- El sondeo ya existente del chat visible consulta los resultados pendientes y adopta un stream de recogida existente. No reenvía prompts ni inicia otra ejecución. Las lecturas simultáneas se agrupan; los errores conservan el estado pendiente.
- La recarga y la adopción conservan el tablero. Se descartan respuestas de otro target/conversación y un snapshot anterior no sobrescribe una actualización de tarea más reciente.
- Un cierre CLI no fabrica la respuesta desde la consola. Los canales se completan únicamente tras resultado final confirmado y cierre normal; un resultado provisional seguido de `done.pending` permanece pendiente.
- Los controles de historial CLI mantienen apertura manual, ARIA, foco visible y objetivos de al menos 44 px. La nueva advertencia de detalle omitido está en los doce idiomas.

No se modificaron backend, autenticación, licencias, executor, nginx, dependencias ni variables de entorno. No hubo build, reinicio, instalación, cambio de rama, copia del proyecto, worktree, commit ni push.

## Estado previo y propiedad

Se revisaron `web/CLAUDE.md` (la ruta antigua en la raíz no existe), las arquitecturas, el README del asistente, la especificación del módulo y `docs/changes/README.md`. Se recuperó el diseño del código/documentación existentes; no se afirma coincidencia con imágenes originales que no estaban disponibles.

El frontend ya contenía cambios de actividad compacta: ThoughtLine/CSS, tool-disclosure, turn-view, api-activity, límites locales de texto, pruebas y dos claves en los doce idiomas. Se conservaron. Los cambios de backend, las dos notas previas de `docs/changes`, las salidas dist y los informes QA anteriores ya existían al entrar y no se modificaron desde esta tarea.

No se editaron `docs/changes`: QA debe consolidar la nota nueva después de revisar la entrega conjunta. El canal protegido se descubrió con modules.list/describe y las escrituras frontend usaron files.write con la revisión descubierta. Obsidian y el grafo no ofrecieron herramientas utilizables; la exploración se hizo por fuentes. El canal de coordinación no tenía otro agente accesible, por lo que esta entrega documenta el handoff al líder y a Mateo, sin afirmar una confirmación recibida.

## Rutas de esta continuación

Todas estas rutas son relativas a `/var/www/LUXIPANEL/web/frontend/`; solo se escribió dentro del frontend.

- `scripts/qa-api-activity.mjs`
- `src/components/floating-assistant/assistant-api/agent-stream.ts`
- `src/components/floating-assistant/assistant-api/api-activity.ts`
- `src/components/floating-assistant/assistant-api/conversations.ts`
- `src/components/floating-assistant/chat-engine.ts`
- `src/components/floating-assistant/chat-engine/api-activity.test.ts`
- `src/components/floating-assistant/chat-engine/api-activity.ts`
- `src/components/floating-assistant/chat-engine/history.ts`
- `src/components/floating-assistant/chat-engine/pending-outcome.test.ts`
- `src/components/floating-assistant/chat-engine/stream-apply.ts`
- `src/components/floating-assistant/chat-engine/types.ts`
- `src/components/floating-assistant/chat-pane/api-activity.ts`
- `src/components/floating-assistant/chat-pane/team-execution.render.test.ts`
- `src/components/floating-assistant/chat-pane/tool-disclosure.tsx`
- `src/components/floating-assistant/chat-pane/turn-view.tsx`
- `src/components/floating-assistant/i18n.tsx`
- `src/i18n/ar/assistant/part1.ts`
- `src/i18n/bn/assistant/part1.ts`
- `src/i18n/de/assistant/part1.ts`
- `src/i18n/en/assistant/part1.ts`
- `src/i18n/es/assistant/part1.ts`
- `src/i18n/fr/assistant/part1.ts`
- `src/i18n/hi/assistant/part1.ts`
- `src/i18n/it/assistant/part1.ts`
- `src/i18n/ja/assistant/part1.ts`
- `src/i18n/ko/assistant/part1.ts`
- `src/i18n/pt/assistant/part1.ts`
- `src/i18n/ru/assistant/part1.ts`
- `src/components/floating-assistant/chat-pane/api-activity.recovery.qa.md` — este informe.

Los cambios heredados en `chat-engine/stream-apply.test.ts`, `chat-pane/turn-view.container.test.ts` y `chat-pane/reactbits/ThoughtLine.{tsx,css}` permanecen intactos respecto al inicio de esta continuación.

## Contrato frontend/backend consumido

Fuente de coordinación: `web/backend/src/modules/ai-assistant/docs/turn-finalization-handoff.md`, comprobada contra `models/api-activity.types.ts`, `services/providers/provider.types.ts`, `repositories/conversations/types.ts` y el guard de finalización. Los campos son aditivos; no se cambiaron rutas HTTP ni firmas de callbacks compartidos.

| Campo/evento | Uso frontend |
| --- | --- |
| SSE `text.phase?: commentary \| final_answer` | Commentary se conserva en el proceso; final_answer llega al texto de respuesta. Sin fase se conserva la compatibilidad con los límites observados de llamadas. |
| SSE `tool_use {id,name,input}` | Identidad de llamada por id; un replay no crea otra llamada ni desplaza la respuesta. |
| SSE `tool_result {id,success,output}` | Resultado de esa llamada. Una asignación satisfactoria no significa que el trabajador haya terminado. |
| SSE `done.pending?: true` | Cierra el stream y establece `ChatTurn.completionPending`; `ChatTurn.pending` queda false. |
| Historial `ConversationMessage.pending?: boolean` | Restaura ese resultado pendiente por turno. Un turno posterior puede resolver el trabajo; no deja todo el chat en generación activa. |
| Historial `apiActivity: {events,truncated?:true}` | Restaura orden, comentarios, llamadas y resultados. `content/textTranslated` ya contienen solo la respuesta y no se les aplica el offset legado. |
| SSE `error`, historial `error/interrupted` | Conservan el resultado fallido/detenido y los detalles. No se elevan a éxito por contener texto. |
| `team_task_update` y snapshot del tablero | Siguen siendo autoritativos para pending/running/done/failed/canceled, permisos y verificación. Se conserva una actualización local recibida después de iniciar la lectura del snapshot. |
| SSE `seq` | Descarta frames ya aplicados; deltas idénticos con una secuencia nueva se conservan. |

El proceso API persistido mantiene los límites/ocultación del backend: no es una copia ilimitada. La UI avisa cuando `truncated` está presente. El frontend no puede reconstruir eventos que nunca se guardaron en mensajes antiguos.

## Verificación actual

Directorio de ejecución: `/var/www/LUXIPANEL/web/frontend`.

Baseline antes de editar: **7 suites, 85 pruebas, salida 0**. Typecheck inicial: **salida 2, 26 diagnósticos**.

Comando de pruebas final:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine src/components/floating-assistant/chat-engine.test.ts src/components/floating-assistant/chat-pane/team-execution.render.test.ts src/components/floating-assistant/chat-pane/turn-view.container.test.ts src/components/floating-assistant/chat-pane/ask-permission.test.ts src/components/floating-assistant/assistant-api/conversations-open.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
```

Resultado: **13 suites y 122 pruebas aprobadas, salida 0, 12,54 s**. Cubre estados API/CLI, fases antes/después de herramientas, replay, traducción, historial serializado, copia de respuesta, tareas pendientes, recogida posterior, modo CLI persistido, tablero, permisos, cola, recarga y aislamiento al cambiar de target.

```bash
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
npm run i18n:audit
npm run i18n:split
npm run check:platform-bindings
git -C /var/www/LUXIPANEL diff --check -- web/frontend
node --check scripts/qa-api-activity.mjs
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node scripts/qa-api-activity.mjs
```

| Comprobación | Salida | Evidencia |
| --- | ---: | --- |
| TypeScript final | 2 | Los mismos 26 diagnósticos iniciales; comparación textual exacta igual, cero añadidos. No se declara aprobado. |
| i18n audit | 0 | 12 idiomas, 39 namespaces, 8573 claves por idioma; cero faltantes/extras/tipos/placeholders/vacíos. |
| i18n split | 0 | 468 JSON derivados regenerados; versión 91ebb37bc087. No se editaron derivados a mano. |
| Platform bindings | 0 | Sin enlaces específicos de plataforma en package.json. |
| Diff check | 0 | Sin errores de espacios del frontend. |
| Sintaxis del arnés de navegador | 0 | Script válido. |
| Chromium + componentes/CSS reales | 0 | 360/1280 px × claro/oscuro; 4 combinaciones, 28 casos de estado. |
| Teclado y accesibilidad del área | 0 | Enter/Espacio, apertura conservada, ARIA válida, foco y 44 px, sin desbordamiento; sin infracciones de contraste/nombre de botón/atributos ARIA en las reglas ejecutadas. |

El navegador comprobó la recarga por la API HTTP de historial simulada, espera/error/interrupción sin abrir la consola, comentarios posteriores a la última llamada, detalle limitado y consola CLI pendiente. Se cerraron Chromium y el servidor de prueba. Las capturas mantienen el diseño existente. Esto no acredita proveedores reales ni la release instalada.

Las suites existentes emiten avisos de act y conexiones rechazadas al servicio local del arnés; también estaban en el baseline. No son evidencia de que el servidor conectado haya fallado. Vitest necesitó permiso para escribir su caché fuera del sandbox de solo lectura.

Artefactos ignorados:

- `.cache/api-activity-contract-qa/verification.json`
- `.cache/api-activity-contract-qa/light-360.png`, `dark-360.png`, `light-1280.png`, `dark-1280.png`
- `.cache/api-activity-contract-qa/typecheck-before.txt`
- `.cache/api-activity-contract-qa/typecheck-after.txt`
- `.cache/api-activity-contract-qa/tests-final.txt`

Diagnósticos preexistentes (rutas relativas al frontend):

| Archivo | Cantidad |
| --- | ---: |
| `src/components/floating-assistant/ChatPane.tsx` | 1 |
| `src/components/floating-assistant/chat-pane/reactbits/ChatScrollReveal.test.ts` | 1 |
| `src/components/floating-assistant/chat-ui-state.ts` | 2 |
| `src/components/floating-assistant/default-reasoning.test.ts` | 1 |
| `src/components/workspace/credentials/AgentCredentialFields.tsx` | 1 |
| `src/components/workspace/credentials/AssistantCredentialSettings.tsx` | 1 |
| `src/lib/diagnostics/browser.ts` | 1 |
| `src/scripts/extracted/components/floating-terminal/startup.test.ts` | 8 |
| `src/scripts/extracted/lib/mail-sudo.ts` | 1 |
| `src/scripts/extracted/pages/panel/expo/read.test.ts` | 1 |
| `src/scripts/extracted/pages/panel/hosting/provider-settings.ts` | 3 |
| `src/scripts/extracted/pages/panel/mail/account-catalog.ts` | 1 |
| `src/scripts/extracted/pages/panel/mail/index-script1.ts` | 1 |
| `src/scripts/extracted/pages/panel/users/hosting-templates.ts` | 2 |
| `src/scripts/extracted/pages/panel/users/role-permissions.ts` | 1 |

## Entrega a QA, Mateo e infraestructura

La integración frontend del contrato que entregó Mateo está implementada y las regresiones actuales pasan. La persistencia del backend no se modificó ni se atribuyen sus pruebas a esta entrega. QA debe ejecutar la prueba conjunta con proveedores reales después del despliegue: avance → llamadas → respuesta, recarga HTTP, pendiente → recogida posterior, pregunta/aprobación, error incierto, corte de conexión y cambio de target.

El seguimiento pendiente añade una consulta de historial al sondeo ya existente solo para el chat visible que la necesita; no abre un nuevo temporizador ni reintenta mutaciones. Puede quedar pendiente si el backend no produce/persiste el cierre: la UI no inventa ese resultado.

Quedan fuera de esta entrega la reparación de los 26 errores globales previos, el build/reinicio exclusivo de infraestructura, la verificación online/HTTP/chunks/logs y la QA instalada. Infraestructura debe resolver el destino real del enlace dist y preparar la compilación Astro limpia según el procedimiento vigente, ejecutar un único build con el límite de memoria acordado y después reiniciar/verificar. No se afirma despliegue, instalación ni publicación en GitHub.

Comandos reservados a infraestructura, **no ejecutados** en esta entrega: preparar la salida limpia (`rm -rf dist` solo después de revisar el enlace/destino y el procedimiento de release), después `NODE_OPTIONS=--max-old-space-size=2560 npm run build` y `pm2 restart luxipanel-frontend`. Verificar online, HTTP, carga de chunks y logs antes de reportar éxito. Si cambia un .env, reevaluar el ecosystem con --only y --update-env.
