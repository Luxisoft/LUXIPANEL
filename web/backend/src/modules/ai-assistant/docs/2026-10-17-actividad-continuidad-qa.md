# Gate QA integrado de actividad compacta y continuidad

Fecha: 2026-10-17. Resultado: **BLOCKED**. Revisión independiente anterior al despliegue.

## Decisión y evidencia principal

No autorizar infraestructura todavía. Hay dos incumplimientos reproducidos: una carrera de cierre/persistencia que pierde la notificación terminal y permite otra ejecución, y una recuperación incompleta de los detalles de tareas después de una recarga sin caché. QA no modificó producto para corregirlos: dejó pruebas que fallan con la implementación actual y asigna su corrección a los especialistas.

Estado final ejecutado:

| Validación | Resultado | Exit code |
| --- | --- | ---: |
| Backend: módulo ai-assistant completo, incluidas las pruebas QA nuevas | 97 archivos: 96 aprobados / 1 fallido; 967 pruebas aprobadas / 5 fallidas / 1 omitida (973) | 1 |
| Frontend: selección integrada del asistente, incluidas las pruebas QA nuevas | 14 archivos: 13 aprobados / 1 fallido; 127 pruebas aprobadas / 1 fallida (128) | 1 |
| Backend typecheck, repetido después de añadir QA | Sin diagnósticos | 0 |
| Frontend TypeScript, repetido después de añadir QA | 26 diagnósticos previos, salida idéntica a la inicial; cero diagnósticos nuevos | 2 |
| Comparación independiente de TypeScript contra HEAD en memoria | HEAD 26 / actual 26; cero añadidos, eliminados o diagnósticos en archivos tocados | 0 |
| Permisos/catálogo: entorno heredado | 15 aprobadas / 1 fallida por prerrequisito GitHub del fixture | 1 |
| Permisos/catálogo: entorno de pruebas explícito, explicado abajo | 3 archivos / 16 aprobadas | 0 |
| Chromium con componentes y CSS reales, HTTP/WS simulados | 360/1280 px × claro/oscuro; 28 casos de estado, teclado, truncación y espera CLI; sin pageErrors | 0 |
| i18n | 12 idiomas, 39 namespaces, 8573 claves por idioma, sin faltantes/extras/tipos/placeholders/vacíos | 0 |
| git diff --check | Sin errores | 0 |

Antes de incorporar las nuevas pruebas se reprodujeron los reportes: backend 96 archivos / 967 aprobadas / 1 omitida, salida 0 (26,05 s), y frontend 13 archivos / 122 aprobadas, salida 0 (12,58 s). Esto prueba que los casos fallidos nuevos cubren huecos reales; las cuentas iniciales no constituyen aprobación del gate final. La corrida backend final duró 36,91 s y la frontend final 14,43 s.

## Entorno y propiedad

Checkout original `/var/www/LUXIPANEL`, rama `developer`, HEAD `46abcb9aed44e78915cf488a9a2050ca8196c482`. Paquetes reales `web/backend` y `web/frontend`. Node 22.22.2; Vitest backend 3.2.7 / frontend 4.1.8. Los hashes de los doce archivos enumerados en `continuation-integrity-handoff.md` coinciden con la entrega de Mateo.

Se revisaron AGENTS, `web/CLAUDE.md`, las arquitecturas, README de ambos ámbitos, los contratos modulares, `api-activity.recovery.qa.md`, `continuation-integrity-handoff.md` y `docs/changes/README.md`. Se descubrieron módulos mediante `modules.list` y sus operaciones mediante `modules.describe`; se leyó la arquitectura a través de `modules.read`, revisión `2:0`. Obsidian no ofrece operaciones permitidas y el grafo no ofrece un canal utilizable en esta sesión. Se utilizó búsqueda de fuentes. Esto es una limitación de herramientas, no un timeout del servidor.

No se cambió rama, ni se hicieron worktrees, copias del proyecto, commits o push. No se modificó implementación, auth, licencias, sesión, executor, dependencias, configuración ni servicios. Se conservaron los archivos modificados/no seguidos que existían al iniciar, incluidas las notas previas y los enlaces `dist`. No se usó la credencial de pruebas porque estas verificaciones no iniciaron sesión en una aplicación publicada.

## Hallazgo 1 — P1 / alta: cierre antes de terminar la persistencia

**Responsable: Mateo (backend), coordinando la secuencia de cierre con la cola.**

Fuentes: `web/backend/src/modules/ai-assistant/services/agent-run-registry.ts:476` asigna `run.done = true` antes de esperar `onComplete` en la línea 483; el terminal SSE se publica en la línea 502. `attach` deja de suscribir al cliente en la línea 588 cuando ve `done`. `start` solo conserva la exclusión si `!existing.done` en la línea 303; `activeRuns/isActive` dependen del mismo campo y `gracefulShutdown` omite ese run en la línea 661. `controllers/agent.controller.ts:332` utiliza ese attach para el transporte real y espera un terminal para cerrar la respuesta.

Reproducción automatizada exacta: desde `web/backend`, ejecutar el comando enfocado B2 de abajo. El fixture usa el registry y su contexto de executor reales, almacenamiento simulado y una promesa controlable; no modifica ningún servidor.

1. Ejecutar una generación con llamada, resultado confirmado, texto final y `done` del proveedor.
2. Mantener sin resolver `onComplete`, simulando una escritura de historial lenta.
3. Adjuntarse al mismo target y conversación durante esa espera.
4. Resolver la escritura, y repetir con una escritura rechazada.
5. En casos independientes, consultar activeRuns, invocar de nuevo start con la misma clave y solicitar gracefulShutdown mientras esa escritura sigue pendiente.

Resultados observados: el nuevo suscriptor acaba en `text`, nunca recibe el `done` ni el `error`; activeRuns devuelve una lista vacía para esa conversación; una segunda llamada a start ejecuta dos veces el espía de mutación; gracefulShutdown resuelve sin esperar la escritura. Las cinco pruebas fallan, tanto de forma aislada como en la suite del módulo. La mutación es un espía: no se ejecutó ninguna operación real de archivos.

Impacto: una reconexión puede quedarse esperando sin resultado ni error definitivo; el seguimiento deja de representar trabajo aún sin cerrar; se pierde la exclusión de ejecución y el apagado ordenado puede abandonar un guardado. La pérdida del terminal en attach se relaciona directamente con mover la emisión terminal después de onComplete sin separar el estado de cierre. La liberación de exclusión y la omisión del guardado ya son riesgos del uso previo de `run.done`; no se atribuyen todos los efectos como regresiones nuevas sin una ejecución histórica.

Cobertura faltante: suscribir durante una persistencia suspendida, tanto exitosa como rechazada, y mantener la propiedad del run durante ese intervalo. Los tests anteriores aguardaban completion o se suscribían antes de comenzar el cierre. La corrección debe conservar suscripción, exclusión, seguimiento y espera de persistencia sin bloquear la continuación legítima de la cola. No basta con adelantar otra vez `done` ni con repetir la herramienta.

Prueba entregada: `web/backend/src/modules/ai-assistant/services/continuation-integrity.qa.test.ts`, cinco casos, fallos en las líneas 51, 64, 80 y 95.

## Hallazgo 2 — P2 / media: historial del tablero sin archivos ni verificación

**Responsables: Mateo (snapshot backend) y Valentina (rehidratación frontend).**

Fuentes: `web/backend/src/modules/ai-assistant/models/team-task.types.ts:267` (`toTeamTaskSnapshot`) y `web/frontend/src/components/floating-assistant/assistant-api/team.ts:131` (`snapshotToTaskView`) omiten `artifacts`, `verify` e `isolation`. `chat-engine.ts:157` reconstruye el tablero con ese snapshot. `TeamTaskBoard.tsx:475` calcula los archivos exclusivamente con `task.artifacts`; en la línea 614 el botón de diferencias exige un número de archivos mayor que cero.

Reproducción automatizada exacta: desde `web/frontend`, ejecutar F2. La prueba convierte una tarea con estado done, dos archivos cambiados, verificación passed y metadatos de aislamiento mediante las funciones reales backend → JSON → frontend.

Reproducción de usuario que debe repetirse en la aplicación candidata: completar una tarea que produzca diferencias, observar su contador y botón de diferencias, recargar la página sin estado local y reabrir la conversación una vez terminado el stream. El snapshot conserva agente, conversación hija y estado, pero no los metadatos que permiten abrir las diferencias. No se eliminaron archivos del servidor: se pierde su acceso desde este historial de UI.

Resultado de fuente/fixture: el formato SSE conserva `{filesChangedTotal:2, insertions:5, deletions:1}`; el restaurado obtiene `artifacts === undefined`. La misma omisión existe para verificación/aislamiento. La nueva prueba falla en su primera comparación, línea 170. Las comprobaciones siguientes de verify/isolation quedan después de esa aserción; su pérdida está constatada en ambos mapeadores, no se cuentan como pruebas ejecutadas aparte.

Clasificación de baseline: el modelo backend, el adaptador frontend y TeamTaskBoard son byte a byte iguales a HEAD. Es una carencia previa que permanece en el alcance exigido de historial íntegro, no una regresión atribuida al nuevo diseño compacto. Impide aprobar ese requisito del gate.

Cobertura faltante: una recarga sin caché de tareas terminales con artifacts, verify e isolation. La prueba que preserva un tablero ya residente en memoria pasa, pero no representa F5 ni un navegador nuevo. Añadir además la comprobación del botón de diferencias en la aplicación candidata; no inventar datos a partir del texto del agente.

## Contratos contrastados y resultados

| Contrato | Evidencia y límite |
| --- | --- |
| `text.phase = commentary / final_answer` | Guard backend, captura de actividad, persistencia y reducers frontend reales: el avance no contamina la respuesta final; ids distintos de la misma herramienta sobreviven al JSON. |
| `tool_use {id,name,input}` / `tool_result {id,success,output}` | Resultados, errores e identidad de llamada conservados; replay del mismo seq no duplica eventos. La deduplicación de SSE no implica ejecución exactamente una vez ante cualquier caída; ver hallazgo 1. |
| `done.pending` → `ConversationMessage.pending` → `ChatTurn.completionPending` | El stream se cierra sin declarar done/success; una tarea pendiente conserva texto final vacío al recargar. El indicador local pending no mantiene el chat generando artificialmente. |
| `ask`, permiso, `error`, `interrupted` | Las suites de estados y el contrato cruzado mantienen espera/error/parada. No existe un estado público blocked añadido; bloqueo se representa con los campos existentes. |
| `apiActivity {events,truncated}` | Recarga por ids, comentarios posteriores a herramientas, resultados huérfanos y advertencia de truncación. Límite existente: 200 eventos, 32.000 caracteres retenidos, detalle individual acotado a 4.000; el saneamiento puede ocultar secretos. No se promete conservación ilimitada. |
| Tablero SSE / snapshot persistido | Conserva identidades y un tablero local al refrescar; ignora snapshots obsoletos/otro target. No conserva detalles de tareas en una recarga fría: hallazgo 2. |
| `queueTurnId` / `__queue_receipt` | Recibo interno, no DTO público. Tests del repositorio y cola comprueban entrega idempotente, dos mensajes distintos con el mismo texto, fallo de guardado y contexto antes de consumir la cola. |
| Recogida y reanudación del líder | Suites de cola/equipo cubren collect con timeout, tareas aún pendientes, nudge durable, enqueue fallido, no duplicar recogida y detener continuación automática por pregunta/error/interrupción. Sigue bloqueada la garantía integrada durante el cierre del registry. |
| Permisos y aislamiento | Suites de módulo/MCP/grafo, waiters por target y frontend ante cambio de target aprobadas. No se alteraron guards ni selección de executor. No se probó acceso de usuarios reales contra ambos servidores. |
| Consola única | Pruebas de contenedor/TurnView y Chromium: una consola por mensaje, controles de detalles, respuesta separada, estados pendientes/fallidos/no confirmados sin éxito. |

El nuevo `backend-contract.qa.test.ts` carga fuentes backend en memoria mediante TypeScript con una lista explícita de dependencias, conserva la lógica real de registry/guard/saneamiento/persistencia/normalización y simula únicamente executor, logging y almacenamiento. Pasa eventos JSON al reducer frontend y recupera el mensaje mediante historyTurn/reloadHistory. Sus cinco casos normales pasan. No sustituye una integración de storage/HTTP real ni la navegación del router Astro.

## Baseline de los 26 diagnósticos frontend

No se aceptó solamente el antes/después de Valentina. `scripts/qa-activity-typecheck-baseline.mjs` lee los blobs Git de HEAD, construye un CompilerHost en memoria y ejecuta el mismo compilador con dependencias y tipos generados actualmente instalados. No crea worktree, copia de fuentes ni cambia el checkout. Comparó 1468 raíces de HEAD y 1474 del candidato anterior a las pruebas QA nuevas: 26 diagnósticos en cada uno, mismos archivos/posiciones/códigos/mensajes, cero añadidos/eliminados, cero en archivos tocados. Coinciden también las cabeceras del baseline previo de Valentina.

Tras añadir las pruebas QA se repitió tsc: su salida fue textualmente idéntica a la corrida inicial independiente, con los mismos 26 diagnósticos. El comparador de delta sale 0; **el typecheck completo sigue fallando con salida 2**. La comparación usa el entorno de dependencias/tipos generados vigente, no reconstruye una instalación histórica.

Rutas relativas a `web/frontend`:

| Archivo y línea | Cuenta / código | Clasificación |
| --- | --- | --- |
| `src/components/floating-assistant/ChatPane.tsx:31` | 1 · TS2339 | Producto previo: surface ausente en WorkspaceState |
| `src/components/floating-assistant/chat-pane/reactbits/ChatScrollReveal.test.ts:28` | 1 · TS2352 | Fixture previo: IntersectionObserverEntry incompleto |
| `src/components/floating-assistant/chat-ui-state.ts:173` | 2 · TS2783 | Producto previo: model/effort duplicados |
| `src/components/floating-assistant/default-reasoning.test.ts:33` | 1 · TS2322 | Fixture previo: VoiceConfigPatch/State incompatibles |
| `src/components/workspace/credentials/AgentCredentialFields.tsx:3` | 1 · TS2339 | Producto previo: agentsTab ausente |
| `src/components/workspace/credentials/AssistantCredentialSettings.tsx:72` | 1 · TS2339 | Producto previo: agentsTab ausente |
| `src/lib/diagnostics/browser.ts:27` | 1 · TS2339 | Producto previo: target sobre never |
| `src/scripts/extracted/components/floating-terminal/startup.test.ts:6` | 8 · TS2345; líneas 6–12 | Fixtures previos: falta status en ApiResponse |
| `src/scripts/extracted/lib/mail-sudo.ts:7` | 1 · TS2353 | Producto previo: previousError fuera del contrato |
| `src/scripts/extracted/pages/panel/expo/read.test.ts:24` | 1 · TS2345 | Fixture previo: falta status en ApiResponse |
| `src/scripts/extracted/pages/panel/hosting/provider-settings.ts:1` | 3 · TS2307/TS7006; líneas 1, 95, 107 | Producto previo: import extraído no declarado y dos any derivados |
| `src/scripts/extracted/pages/panel/mail/account-catalog.ts:7` | 1 · TS2322 | Producto previo: domain opcional/incompatible |
| `src/scripts/extracted/pages/panel/mail/index-script1.ts:8` | 1 · TS2307 | Producto previo: módulo extraído no declarado |
| `src/scripts/extracted/pages/panel/users/hosting-templates.ts:3` | 2 · TS2307/TS7006; líneas 3, 25 | Producto previo: import y any derivado |
| `src/scripts/extracted/pages/panel/users/role-permissions.ts:4` | 1 · TS2307 | Producto previo: módulo extraído no declarado |

Total: 15 diagnósticos en producto y 11 en fixtures, 15 archivos, todos previos. Ninguno se corrigió en esta tarea. No se atribuye ninguno al cambio compacto ni a los archivos QA añadidos.

## Integración omitida y entorno de permisos

La única prueba omitida del módulo es `services/providers/cli/resource-launch.test.ts:30`, `keeps detached exit tracking and cleanup outside a terminated scope`, condicionada por `LXP_RESOURCE_INTEGRATION=1`. Lanza un scope systemd real con un comando de espera, fuerza su límite de un segundo y comprueba salida 124 y limpieza. No es un test de login ni un test pendiente de la persistencia API; las dos pruebas portables del mismo archivo sí pasaron. Los archivos de ese mecanismo de lanzamiento no forman parte de esta corrección. No se activó la prueba de scopes reales, no se acredita su integración física y no se la usa como excusa para ignorar los dos bloqueos. Si se exige validar el runtime CLI completo de la release, deberá ejecutarse aparte en su entorno autorizado.

La ampliación a `shared/agent-capability` y `shared/module-operations` dio inicialmente 15 aprobadas y 1 fallo en `registry.test.ts:26`: el actor ficticio local sin vínculo GitHub fue rechazado por el guard real con 403. Test, registry, session middleware y política GitHub son idénticos a HEAD. Al establecer exclusivamente para el proceso de test `NODE_ENV=test LUXIPANEL_GITHUB_REQUIRED=false`, pasaron los 16 casos. Es un prerrequisito de entorno para ese fixture, no una regresión de permisos de los cambios revisados. No se editó .env ni se cambió la política del servicio; esa corrida no acredita el requisito de vínculo GitHub real. Se conservan ambos resultados, no se presenta la primera corrida como verde.

## Comandos reproducibles

B1, desde `/var/www/LUXIPANEL/web/backend` (suite final: salida 1; typecheck: salida 0):

```bash
env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck
npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=2 --minWorkers=1 --reporter=dot --silent
```

B2, reproducción mínima del bloqueo de cierre, mismo directorio (salida 1, cinco fallos):

```bash
npm test -- src/modules/ai-assistant/services/continuation-integrity.qa.test.ts --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=verbose
```

B3, validación adicional y su diferencia de entorno (salidas 1 y 0 respectivamente):

```bash
npm test -- src/shared/agent-capability src/shared/module-operations --pool=threads --maxWorkers=2 --minWorkers=1 --reporter=dot --silent
env NODE_ENV=test LUXIPANEL_GITHUB_REQUIRED=false npm test -- src/shared/agent-capability src/shared/module-operations --pool=threads --maxWorkers=2 --minWorkers=1 --reporter=dot --silent
```

F1, desde `/var/www/LUXIPANEL/web/frontend` (suite final: salida 1; tsc: 2; comparador: 0; i18n: 0; navegador: 0):

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine src/components/floating-assistant/chat-engine.test.ts src/components/floating-assistant/chat-pane/team-execution.render.test.ts src/components/floating-assistant/chat-pane/turn-view.container.test.ts src/components/floating-assistant/chat-pane/ask-permission.test.ts src/components/floating-assistant/assistant-api/conversations-open.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
node --expose-gc --max-old-space-size=2560 scripts/qa-activity-typecheck-baseline.mjs
npm run i18n:audit
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node scripts/qa-api-activity.mjs
```

F2, contrato cruzado y reproducción mínima de la pérdida del snapshot (salida 1, cinco aprobadas y una fallida):

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Los intentos iniciales de Vitest en sandbox de solo lectura terminaron antes de ejecutar pruebas por no poder escribir su caché; se repitieron con el permiso del entorno. El comparador necesitó ejecutar el subproceso de lectura Git fuera del sandbox. La preparación del nuevo arnés cruzado tuvo errores de resolución de módulos antes de ejecutar casos; se corrigió únicamente el arnés. No se contabilizan esos fallos de preparación como bugs del producto ni como cobertura ejecutada.

## Navegador, logs y cobertura pendiente

El arnés existente usó Vite de pruebas, React/CSS de las fuentes candidatas, Chromium local y fixtures HTTP/WS aislados. Verificó Enter/Espacio, ARIA, objetivos de 44 px, ausencia de desbordamiento y reglas axe de contraste/nombre de botón/atributos ARIA. No es una auditoría completa de accesibilidad. Se cerraron el navegador y el servidor de prueba, salida 0. Artefactos ignorados: `web/frontend/.cache/api-activity-contract-qa/verification.json` y las cuatro capturas `light|dark-360|1280.png`. Se inspeccionó visualmente la captura móvil clara, consistente con la consola única y la respuesta separada. No son screenshots de la release instalada.

Se revisaron los logs de las pruebas: fallos provocados de almacenamiento/permisos/proveedor corresponden a fixtures. Persisten avisos del arnés frontend de act y conexiones rechazadas a su localhost:3000; también aparecieron antes de QA y las pruebas concluyeron. No demuestran caída del servidor conectado.

Se leyeron jlist y las últimas 25 líneas solicitadas de PM2 con el binario existente, sin arrancar daemon ni reiniciar aplicaciones: ambos procesos locales aparecen online; las muestras leídas fueron 21/5 líneas para backend/frontend y no contenían marcadores SyntaxError, ReferenceError, TypeError, ECONNREFUSED, ETIMEDOUT ni niveles JSON 40/50/60. El ejecutable no estaba en PATH y se localizó en la instalación existente del usuario. Estos procesos sirven la versión anterior: esa observación no verifica el candidato ni acredita arranque limpio de una nueva release.

**No ejecutado:** builds, reinicios, despliegue, HTTP/chunks del candidato publicado, proveedores externos, login real, tests e2e del router Astro con navegación SPA en la release candidata, integración física de scopes y suite completa de todos los módulos del monorepo. Se ejecutó la suite completa del módulo ai-assistant, la selección frontend descrita y las tres suites de permisos/catálogo; no se anuncia una cobertura global distinta.

## Archivos propios y entrega

QA creó exclusivamente:

- `web/backend/src/modules/ai-assistant/services/continuation-integrity.qa.test.ts`.
- `web/frontend/src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts`.
- `web/frontend/scripts/qa-activity-typecheck-baseline.mjs`.
- `web/backend/src/modules/ai-assistant/docs/2026-10-17-actividad-continuidad-qa.md` (este informe).
- `docs/changes/2026-10-17-actividad-compacta-continuidad.json` (nota nueva; solo comportamientos verificados, sin afirmar despliegue).

El resumen y las sumas del código validado se conservan en el artefacto ignorado `web/frontend/.cache/integrated-assistant-qa/evidence.json`. Las pruebas fallidas quedan activas; no se marcaron skip ni expected-failure ni se relajaron expectativas para aprobar.

El siguiente paso corresponde a los responsables de los dos hallazgos. Una vez corregidos deben repetirse B1/B2 y F1/F2, conservar cero diagnósticos nuevos y revalidar el historial frío y la reconexión durante guardado. Infraestructura tendrá su turno exclusivo de compilación/reinicio únicamente después de un nuevo gate aprobado; la comprobación instalada deberá incluir navegación SPA, recogida posterior única, cancelación, permisos y cambio de target. Este informe no confirma despliegue, instalación ni publicación en GitHub.
