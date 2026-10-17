# QA — actividad API compacta del chat

Fecha: 2026-10-17. Rama de trabajo: developer. Implementación in situ; sin cambios de rama, copias del proyecto, commits ni push manuales.

## Resultado visual y estados

La actividad API reutiliza ThoughtLine con entradas explícitas id/label/status, visibles por defecto incluso al terminar. La etiqueta procede del nombre de la llamada: ToolTrace no tiene un título independiente. Los parámetros y resultados íntegros permanecen en una única Consola del servidor etiquetada API, con Ver historial. Las llamadas repetidas conservan sus ids y no se fusionan por nombre.

Solo un tool_result satisfactorio confirma una llamada. Una llamada sin resultado sigue en curso únicamente mientras el turno está activo; al interrumpirse, fallar o terminar sin resultado se muestra Resultado no confirmado. Las preguntas y permisos producen En espera. Un error se indica inmediatamente, incluso durante streaming. El resultado de team.assign confirma la asignación; el estado del equipo mantiene el resumen en ejecución mientras haya tareas pendientes o activas.

La lista puede plegarse con teclado sin ocultar el estado de error/espera de la barra de consola. TeamExecutionContent, TeamExecutionAttention, TeamTaskBoard, preguntas, permisos, planes, archivos modificados y respuesta permanecen en sus secciones. El historial CLI y su respuesta de respaldo conservan su recorrido original.

## Archivos reales

Rutas relativas a la raíz del proyecto:

- `web/frontend/src/components/floating-assistant/chat-pane/turn-view.tsx`: composición actividad → consola → archivos → respuesta.
- `web/frontend/src/components/floating-assistant/chat-pane/api-activity.ts`: estados derivados de la traza y del equipo.
- `web/frontend/src/components/floating-assistant/chat-pane/tool-disclosure.tsx`: historial API, estados y controles accesibles.
- `web/frontend/src/components/floating-assistant/chat-pane/reactbits/ThoughtLine.tsx` y `ThoughtLine.css`: entradas explícitas, SVG, foco, objetivos de 44 px y texto legible.
- `web/frontend/src/components/floating-assistant/chat-pane/team-execution.render.test.ts` y `turn-view.container.test.ts`: pruebas de comportamiento.
- `web/frontend/src/components/floating-assistant/i18n.tsx` y `web/frontend/src/i18n/{ar,bn,de,en,es,fr,hi,it,ja,ko,pt,ru}/assistant/part1.ts`: espera y resultado no confirmado.
- `docs/changes/2026-10-17-resumen-compacto-actividad-chat.json`: nota nueva de publicación, con cuatro beneficios verificados.

Solo cambia la presentación y su tipado interno. No cambia ningún contrato compartido de API, esquema persistido, autenticación, licencia ni ejecución.

## Verificaciones ejecutadas

Desde `web/frontend`:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 timeout 120s npm run test:unit -- src/components/floating-assistant/chat-pane/team-execution.render.test.ts src/components/floating-assistant/chat-pane/turn-view.container.test.ts src/components/floating-assistant/chat-engine.test.ts src/components/floating-assistant/chat-engine/stream-apply.test.ts src/components/floating-assistant/chat-pane/ask-permission.test.ts src/components/floating-assistant/chat-engine/history-outcome.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
npm run i18n:audit
npm run i18n:split
npm run check:platform-bindings
timeout 180s node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
```

- Vitest: **6 archivos, 73 pruebas aprobadas, salida 0**, 7,81 s. El baseline de las tres suites indicadas inicialmente fue 54/54 con NODE_ENV=test.
- Se cubren éxito, error durante streaming y al terminar, llamada activa, resultado ausente, interrupción, detención, error del turno, permiso y pregunta; ids repetidos por nombre, expansión conservada durante streaming, tablero único y aislamiento por chat/target.
- Se comprueban texto final y parcial, plan/permisos accesibles con consola cerrada, historial CLI, herramientas CLI anidadas sin duplicación y respuesta CLI de respaldo.
- El entorno hereda NODE_ENV=production; las pruebas de React requieren NODE_ENV=test. El intento inicial sin ese ajuste fallaba al no disponer de act. No se cambió la configuración del servicio.
- Persisten avisos del arnés: conexiones locales rechazadas ya observadas en el baseline y avisos de act en la suite de permisos sin modificar. No se ocultaron; el comando final termina con 73/73.
- i18n: **12 idiomas, 39 namespaces, 8572 claves por idioma, cero faltantes, extras, errores de tipo, placeholders o textos vacíos**.
- i18n:split: **468 JSON derivados** regenerados mediante el script oficial. Los derivados no forman parte del aporte.
- check:platform-bindings: salida 0. git diff --check: salida 0.
- TypeScript: **26 errores anteriores al cambio y los mismos 26 después; cero diagnósticos añadidos**. No se presenta el typecheck global como aprobado.

Errores del baseline, por archivo relativo a web/frontend:

| Archivo | Diagnósticos |
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

La evidencia del baseline incluye, por ejemplo, WorkspaceState.surface en ChatPane, propiedades model/effort duplicadas en chat-ui-state, AssistantMessages.agentsTab en credenciales y módulos extraídos de permisos sin declaración. Ninguno corresponde a los archivos de implementación modificados.

## Navegador

Chromium con componentes y estilos reales servidos por Vite de prueba; datos HTTP y WebSocket simulados. No se hizo un build de producción. Cuatro combinaciones: **360 y 1280 px, claro y oscuro**.

- Enter y Espacio abren/cierran la consola y la actividad; aria-expanded sigue el estado y aria-controls apunta al contenido.
- Foco visible, objetivos de 44 px de alto y ancho superior a 44 px; sin desbordamiento horizontal.
- Axe: cero infracciones en las reglas de contraste, nombre de botón y atributos ARIA revisadas sobre actividad y barra de consola.
- Estados done/running/failed/unconfirmed visibles con historial cerrado; cero errores de página.
- Artefactos locales ignorados: `web/frontend/.cache/api-activity-qa/verification.json` y capturas `light-360.png`, `dark-360.png`, `light-1280.png`, `dark-1280.png`. El servidor de prueba y Chromium se cerraron.

Esto verifica la superficie modificada con datos simulados; no sustituye la comprobación sobre una release instalada con proveedores reales.

## Límites previos conservados

- AgentEvent transmite texto sin distinguir comentario de respuesta final. No se extraen párrafos ni se inventa narración: el texto recibido se conserva íntegro en la respuesta.
- historyTurn reconstruye tools: []. Después de recargar, una ejecución API antigua no puede reconstruir la lista de llamadas que no fue persistida. La prueba sin traza confirma que no se deducen llamadas del texto guardado.
- Las tareas, avisos y registros CLI que sí se recuperan mantienen sus recorridos existentes.
- Obsidian no ofrece herramientas permitidas en esta sesión: modules.list y modules.describe devolvieron el módulo sin operaciones utilizables. La entrega queda registrada aquí.

## Pendiente para QA e infraestructura

No se ejecutaron build, reinicio, instalación ni publicación. No se tocó dist ni los procesos del panel.

Infraestructura debe comprobar el destino real de dist, que es un enlace a una release, y preparar la salida limpia conforme al despliegue vigente. Después podrá ejecutar **un solo build por máquina** con `NODE_OPTIONS=--max-old-space-size=2560 npm run build`, seguido del reinicio del proceso correspondiente (`pm2 restart luxipanel-frontend` en el pipeline documentado). Debe verificar estado online, HTTP, carga de chunks y logs antes de declarar el despliegue completo; un reinicio o un build aislado no acreditan éxito.

QA sobre esa release: chat general y de agente, API/CLI, tres llamadas de equipo, espera/error con historial cerrado, abrir/cerrar durante streaming, plan/permisos, tablero sin duplicados, archivos y respuesta final, navegación SPA y cambio de target. Comprobar la recarga API teniendo en cuenta el límite previo documentado.
