# Entrega frontend: actividad compacta y estados de ejecución

Fecha: 2026-10-17. Implementación en el repositorio original, rama `developer`. La ruta autorizada `/var/www/LUXIPANEL/frontend` resuelve a `/var/www/LUXIPANEL/web/frontend`.

## Resultado de esta entrega

La actividad API reutiliza ThoughtLine y ExecutionDisclosure, cerrados por defecto. El usuario puede abrir la lista de llamadas y el historial completo con teclado o ratón; la apertura elegida se conserva durante streaming, permisos y cierre del turno. Los resultados, errores y tableros de agentes siguen disponibles.

Los eventos de llamadas API marcan el límite entre el texto anterior de proceso y el texto posterior. Mientras hay ejecución activa, el texto vive en el detalle del proceso. Al terminar, se muestra el último tramo recibido como respuesta; copiar y leer en voz alta usan ese mismo tramo. El texto original y el contexto enviado al proveedor permanecen íntegros. Una reproducción del mismo id de llamada no desplaza ese límite.

El resumen distingue espera, ejecución, error, detención y resultado no confirmado. Una asignación satisfactoria no completa al trabajador: las tareas pendientes, canceladas y las verificaciones en curso conservan su estado. Una ejecución API sin respuesta final tampoco aparece como completada. Las consolas CLI conservan sus errores al recargarse.

Se corrigió el contraste del indicador animado y de los nombres/estados de llamadas expandidas con los tokens existentes. No se añadieron claves de traducción en esta continuación; se conservaron las dos claves previas en los doce idiomas.

## Estado previo relevante

Había 19 archivos modificados del cambio anterior, además de `api-activity.ts`, `api-activity.qa.md`, la nota compartida de publicación y las salidas `dist` sin seguimiento. Se conservaron esos cambios; no hubo checkout, copias del proyecto, commits ni push.

Se leyó `web/CLAUDE.md` (la ruta antigua en la raíz no existe), las arquitecturas y el README del asistente. La referencia visual utilizable fue la captura local del ajuste anterior; esta entrega cambia su apertura inicial a compacta, sin afirmar una coincidencia con las miniaturas originales.

La evidencia anterior de `api-activity.qa.md` describe la versión con lista abierta y texto API sin separar. Para el comportamiento y verificaciones finales de esta continuación prevalece este documento.

## Archivos intervenidos en esta continuación

Todos bajo `/var/www/LUXIPANEL/frontend/`:

| Ruta relativa | Alcance |
| --- | --- |
| `src/components/floating-assistant/chat-pane/turn-view.tsx` | Resumen compacto, separación de proceso/respuesta, copia/voz, estados y aviso de respuesta ausente. |
| `src/components/floating-assistant/chat-pane/api-activity.ts` | Estados derivados de herramientas, tareas y verificaciones. |
| `src/components/floating-assistant/chat-pane/tool-disclosure.tsx` | Estados de consola en vivo/histórica, contraste y accesibilidad de controles. |
| `src/components/floating-assistant/chat-pane/reactbits/ThoughtLine.tsx` | Apertura automática configurable; API permanece compacta y conserva cambios manuales. |
| `src/components/floating-assistant/chat-engine/types.ts` | Límite de presentación opcional `ChatTurn.apiTextOffset`, interno del frontend. |
| `src/components/floating-assistant/chat-engine/stream-apply.ts` | Captura del límite en llamadas únicas, sin cambiar texto original ni reproducción por id. |
| `src/components/floating-assistant/chat-engine/stream-apply.test.ts` | Regresiones de límites, varias llamadas, replay y aislamiento de API/CLI. |
| `src/components/floating-assistant/chat-pane/team-execution.render.test.ts` | Regresiones de presentación, copia, estados, apertura y respuesta ausente. |
| `src/components/floating-assistant/chat-pane/api-activity.completion.qa.md` | Esta entrega y handoff. |

Los cambios heredados de CSS, i18n y `turn-view.container.test.ts` siguen presentes. No se alteraron los tipos de contrato `AgentEvent` ni `ConversationMessage`, backend, configuración o procesos del panel.

## Verificación ejecutada

Directorio de todos los comandos: `/var/www/LUXIPANEL/frontend`.

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-pane/team-execution.render.test.ts src/components/floating-assistant/chat-pane/turn-view.container.test.ts src/components/floating-assistant/chat-engine.test.ts src/components/floating-assistant/chat-engine/stream-apply.test.ts src/components/floating-assistant/chat-pane/ask-permission.test.ts src/components/floating-assistant/chat-engine/history-outcome.test.ts src/components/floating-assistant/chat-engine/send.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
npm run i18n:audit
npm run check:platform-bindings
git diff --check
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node .cache/api-activity-completion-qa.mjs
```

| Comprobación | Resultado |
| --- | --- |
| Baseline focalizado antes de editar | 3 archivos, 63 pruebas, salida 0. |
| Regresiones finales | 7 archivos, 85 pruebas, salida 0; 8,75 s. |
| Typecheck inicial y final | Salida 2 en ambos: los mismos 26 diagnósticos previos, ninguno en los archivos intervenidos. No se declara aprobado el typecheck global. |
| i18n | Salida 0: 12 idiomas, 39 namespaces, 8572 claves por idioma, cero faltantes/extras/errores de placeholders. |
| Enlaces de plataforma | Salida 0. |
| Espacios/formato de diff | Salida 0. |
| Chromium con componentes y estilos reales | Salida 0: 360 y 1280 px, temas claro y oscuro; cuatro combinaciones. |
| Accesibilidad del área modificada | Enter/Espacio, foco visible, controles de 44 px, referencias ARIA válidas, sin desbordamiento; cero infracciones de contraste, nombre de botón y valores ARIA en los estados probados, también con detalles abiertos. |

Las suites existentes de permisos/historial emiten avisos de act y de conexiones rechazadas al servicio local del arnés; el comando termina con 85/85 y salida 0. No son evidencia de fallo del servidor target. El primer intento de Vitest en el sandbox no pudo escribir su caché; se ejecutó mediante la aprobación correspondiente. La prueba visual exigió corregir su configuración de dependencias y luego detectó y permitió corregir dos problemas reales de contraste.

Artefactos ignorados: `.cache/api-activity-completion-qa.mjs`, `.cache/api-activity-completion/verification.json` y capturas `light-360.png`, `dark-360.png`, `light-1280.png`, `dark-1280.png`. La prueba usa HTTP/WS simulados, no credenciales ni servicios de producción. Chromium y su servidor de pruebas se cerraron.

Los 26 errores previos se distribuyen así:

| Archivo (relativo al frontend) | Cantidad |
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

## Handoff necesario a Mateo y al líder

La parte frontend está implementada y probada dentro del alcance recibido. El cierre completo del comportamiento tras recarga depende del backend: `ConversationMessage` no transporta llamadas API ni separa narración y respuesta, y `historyTurn()` reconstruye `tools: []`. Al recargar ese historial, el frontend conserva todo el texto guardado; no inventa llamadas ni interpreta párrafos como eventos.

Solicitud concreta a Mateo: acordar y entregar persistencia de la traza API y una separación explícita entre avance y respuesta final, tanto en eventos como en mensajes guardados, preservando identidad del mensaje y secuencia. El límite local basado en llamadas resuelve la presentación observada en vivo; no puede separar dos textos semánticamente distintos recibidos después de la última llamada, ni reconstruirse cuando el historial omite la traza. Se necesita una prueba conjunta SSE → persistencia → recarga antes de certificar ese recorrido.

La continuidad y la decisión de dar un trabajo por terminado pertenecen al motor del servidor/proveedor. Esta UI conserva estados y no repite mutaciones automáticamente; no garantiza finalización ante interrupciones. Las pruebas de cola verifican la continuidad ya existente, no una política nueva del servidor.

No había un agente Mateo activo en el canal de coordinación de esta sesión. Este documento deja la solicitud concreta para el líder; no afirma una aprobación de contrato recibida. `modules.list` y `modules.describe` no ofrecieron herramientas de Obsidian ni del grafo, por lo que no fue posible leer/publicar la nota allí. Las operaciones de archivos usaron el canal protegido de módulos con revisión descubierta.

La nota compartida `docs/changes/2026-10-17-resumen-compacto-actividad-chat.json` ya existía al entrar y queda para revisión del líder, conforme a la instrucción de no editar documentación compartida.

## Checklist para QA y Andrés

- [x] API general y de agente: actividad cerrada, llamadas distintas aunque repitan nombre, entradas/resultados íntegros al expandir.
- [x] Apertura conservada durante streaming, permiso y finalización; error/espera accesibles con historial cerrado.
- [x] Preguntas y aprobación de plan accesibles; tablero de agentes único y aislamiento al cambiar chat/target en las regresiones.
- [x] Avances previos a herramientas en el proceso; respuesta/copiar usan el último tramo. Texto API antiguo sin metadatos conservado.
- [x] Error durante ejecución y recargado CLI, resultado incierto, falta de respuesta final, cancelación, espera y verificación de agentes.
- [x] Teclado, foco, contraste y tamaños táctiles en claro/oscuro y móvil/escritorio con datos simulados.
- [ ] Mateo: persistencia API y separación explícita del último avance/final, con prueba de recarga desde servidor.
- [ ] Responsable del typecheck global: resolver los 26 errores previos antes de certificar una comprobación global limpia.
- [ ] Andrés: fase exclusiva, un solo build por máquina; preparar salida Astro limpia según el destino real de `dist`, preservando la release vigente.
- [ ] Andrés: `NODE_OPTIONS=--max-old-space-size=2560 npm run build` (prebuild ejecuta i18n audit/split) y después `pm2 restart luxipanel-frontend`.
- [ ] Andrés: comprobar proceso online, HTTP, carga de chunks y logs; después QA en el panel instalado con proveedores reales, navegación SPA y cambio de target.

No se ejecutaron build ni reinicio del panel. Esta entrega no acredita despliegue, instalación ni publicación en GitHub.
