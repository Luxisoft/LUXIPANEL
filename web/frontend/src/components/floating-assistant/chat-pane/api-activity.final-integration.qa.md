# Integración frontend de actividad y cierre: entrega final a QA

Fecha: 2026-10-17. Responsable: Valentina.
**Lista para QA conjunto en fuentes y pruebas; no desplegada.**
El typecheck global conserva 22 diagnósticos anteriores fuera de los archivos
modificados: no se declara aprobado el gate global.

## Proyecto, base y coordinación

Se trabajó únicamente en el checkout original `/var/www/LUXIPANEL`, rama
`developer`. El alias `frontend/` resuelve a `web/frontend/`; el backend
canónico está en `web/backend/`. No existe `CLAUDE.md` en la raíz:
se leyó `web/CLAUDE.md`, las arquitecturas, el README del asistente, la
especificación de módulos y `docs/changes/README.md`.

Se conservaron la implementación compacta, las traducciones y los cambios
anteriores. No se editaron backend, infraestructura, dependencias, configuración,
autenticación, licencias ni executor. No hubo copias, worktrees, cambio de rama,
commit, push, build ni restart. Las salidas `dist` ya existían y no se tocaron.

El contrato se contrastó con los tres handoffs backend, especialmente
`web/backend/src/modules/ai-assistant/docs/continuation-integrity-handoff.md`,
y con las fuentes actuales. Las sumas del modelo de snapshots
`ecf2d40284d81848a8cb7aa5f316449a9b18bb135021daf24b0861fcc0e8251a`
y del registry
`a832ec7251c9e36d3641aca89eac88fc028d5f152337cfac942dd478fd33ba59`
coinciden con la entrega vigente de Mateo.
No había otro agente accesible en el canal de coordinación; este documento
entrega al líder y Mateo el consumo verificado, sin afirmar una respuesta
humana recibida. La prueba cruzada backend → JSON → frontend se ejecutó sin
modificar su archivo ni sus expectativas.

Se descubrieron los módulos con `modules.list/describe` y se usaron
`modules.read/execute`, revisión `2:0`, para archivos frontend. El grafo
no ofrecía herramientas invocables; se buscó en fuentes.
El canal Files rechazó la nota pública fuera de su alcance frontend; se creó
con el permiso específico de escritura en el workspace, sin sobrescribir notas.

## Contrato consumido

| Señal existente | Comportamiento comprobado |
| --- | --- |
| `text.phase = commentary` | Progreso en los detalles de actividad, también después de la última llamada. |
| `text.phase = final_answer` | Respuesta separada; copiar/voz usan el resultado presentado. |
| `done.pending` / historial `pending` | Cierra ese stream, mantiene resultado pendiente y no declara éxito del equipo. |
| `apiActivity.events` | Recupera orden, ids, entradas, resultados y comentarios; `truncated` conserva el aviso de detalle limitado. |
| `error`, pregunta, permiso, interrupción | Conservan su estado; no habilitan el envío automático de continuaciones locales. |
| SSE `seq` | Una secuencia ya aplicada no duplica texto ni llamadas. |
| Snapshot `artifacts?/verify?/isolation?` | Conserva contadores, cero, verificaciones y rama; ausencia compatible con historiales antiguos. |
| `GET /agent/stream` HTTP 204 | Consulta historial; por sí solo no acredita que la respuesta ya esté disponible. |
| HTTP 401/403/503 del stream | Conserva el mensaje del backend; no se interpreta como ausencia de ejecución. |

El backend mantiene la autoridad del cierre y emite el terminal después de
persistir. No se añadieron endpoints, estados compartidos ni campos de contrato.
El booleano devuelto por `reloadHistory` es un resultado interno frontend para
no adoptar un stream después de una lectura fallida.

## Cambios propios de esta continuación

Rutas relativas a `web/frontend/`; los demás archivos modificados del
checkout pertenecían a la entrega anterior y se conservaron.

| Archivo | Cambio |
| --- | --- |
| `src/components/floating-assistant/chat-engine.ts` | Reconexión y cierre acotados al target, conversación y AbortController vigentes; descarta snapshots de ejecuciones del target anterior; EOF sin terminal sigue recuperable. |
| `src/components/floating-assistant/chat-engine/stream-apply.ts` | Conserva traza al fallar/no estar disponible la lectura del cierre; no sustituye un turno nuevo/parado con una lectura anterior; un corte posterior a un terminal no revoca su resultado. |
| `src/components/floating-assistant/chat-engine/send.ts` | Un envío anterior no cierra al que lo sustituyó; frena continuaciones locales ante error/pregunta/permiso/pendiente; seguimiento de cola ligado al target; conserva el tablero al enviar. |
| `src/components/floating-assistant/assistant-api/agent-stream.ts` | Diferencia 204 de errores HTTP y de una respuesta sin cuerpo. |
| `src/components/floating-assistant/chat-pane/helpers.ts` | Archivos modificados desde llamadas confirmadas `files.write` o `modules.execute` con `tool: files.write`, tanto en vivo como desde historial; rutas exactas y sin inferir cambios del texto de una lectura. |
| `src/components/floating-assistant/chat-pane/turn-view.tsx` | Mantiene una consola y la estética existente; controles de archivos de 44 px, foco visible y contraste; etiqueta tomada de `providersTab.showModifiedFiles`, con las traducciones existentes. |
| `src/components/floating-assistant/ChatPane.tsx` | Retira la suscripción/efecto inoperante a `WorkspaceState.surface`, propiedad inexistente. |
| `src/components/floating-assistant/chat-ui-state.ts` | Inicializa modelo/esfuerzo mediante fallback sin duplicar propiedades. |
| `src/components/floating-assistant/chat-pane/reactbits/ChatScrollReveal.test.ts` | Fixture válido de IntersectionObserverEntry, sin cast incompatible. |
| `src/components/floating-assistant/CliUsageBars.test.ts` | Aísla la señal de arranque para probar las cuotas; mantiene las aserciones y no cambia el componente. |
| `scripts/qa-api-activity.mjs` | Añade comprobación de archivos restaurados, teclado, editor, traducción y accesibilidad al arnés de navegador existente. |

Tres archivos nuevos aportan **44 regresiones**:

- `src/components/floating-assistant/chat-engine/reconnect-finalization.test.ts`: 21 casos.
- `src/components/floating-assistant/assistant-api/agent-stream.recovery.test.ts`: 6 casos.
- `src/components/floating-assistant/chat-pane/modified-files.recovery.test.ts`: 17 casos, incluidos los doce idiomas.

Nota pública nueva:
`docs/changes/2026-10-17-continuidad-historial-interfaz-asistente.json`.
Tiene cuatro frases verificadas; se validó JSON, esquema y cantidad.
Este handoff es nuevo; no reemplaza los informes históricos.

## Verificación ejecutada

Todos los comandos desde `/var/www/LUXIPANEL/web/frontend`.

Suite completa del asistente sobre el código final:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant --maxWorkers=1 --no-file-parallelism --reporter=dot --silent
```

Resultado: **54 archivos, 357 pruebas aprobadas, cero fallos/omitidas,
salida 0, 52,11 s**. Incluye las seis pruebas cruzadas con el código backend
actual, recarga fría y diff del tablero, API/CLI, historial, permisos, planes,
colas, cancelaciones, navegación, reconexión y los doce locales.
No equivale a la suite del monorepo completo.

Comando focal reproducible de las tres suites nuevas:

```bash
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine/reconnect-finalization.test.ts src/components/floating-assistant/assistant-api/agent-stream.recovery.test.ts src/components/floating-assistant/chat-pane/modified-files.recovery.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Los 44 casos están incluidos en la corrida completa anterior; ese comando
focal se proporciona para reproducción, no se contabiliza como otra corrida.

Otras comprobaciones:

```bash
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
node --expose-gc --max-old-space-size=2560 scripts/qa-activity-typecheck-baseline.mjs
npm run i18n:audit
npm run check:platform-bindings
node --check scripts/qa-api-activity.mjs
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node scripts/qa-api-activity.mjs
git -C /var/www/LUXIPANEL diff --check -- web/frontend docs/changes/2026-10-17-continuidad-historial-interfaz-asistente.json
```

| Comprobación | Resultado |
| --- | --- |
| TSC inicial | 26 diagnósticos, salida 2. |
| Comparación HEAD en memoria | HEAD 26 / actual 22; añadidos 0, eliminados 4, en archivos tocados 0; salida 0 del comparador. Sin copias de fuentes ni worktrees. |
| TSC final, después de los últimos cambios | 22 diagnósticos anteriores, salida 2; no se declara verde. |
| i18n audit | 12 idiomas, 39 namespaces, 8573 claves por idioma; cero faltantes, extras, tipos, placeholders o textos vacíos. |
| i18n de archivos renderizados | Los doce catálogos reales pasan en Vitest, incluida la etiqueta y el título del editor. |
| Platform bindings / sintaxis / diff check | Salida 0. |
| Chromium | 360/1280 px × claro/oscuro; 28 estados de actividad y cuatro recorridos de archivos, sin errores de página. |
| Accesibilidad acotada | Enter/Espacio, foco, controles de 44 px, ARIA, sin desbordamiento; cero infracciones en las reglas axe ejecutadas. |

No se añadieron claves ni se modificaron fuentes de traducción en esta
continuación; se reutilizaron los catálogos ya integrados. No se editaron
derivados ni se ejecutó prebuild.

Evidencia de reproducción y ajustes intermedios:

- La base focal heredada pasó 15 archivos / 142 casos.
- Las nuevas regresiones de reconexión dieron 20 fallos / 1 aprobada antes de
  corregir: pérdida de recuperación, eventos tardíos, EOF y continuaciones.
- La primera suite completa dio 337 aprobadas / 3 fallidas en CliUsageBars:
  su fixture no activaba la señal de arranque. Código y pruebas de cuotas,
  junto con startup-state, no tenían cambios frente a HEAD. Se corrigió solo
  la preparación del test, conservando todas las expectativas.
- La nueva prueba de archivos primero requirió completar el mock del sondeo;
  aquel intento no ejecutó casos. No se presenta como una reproducción del bug.
- La revisión visual detectó contraste 4,36:1 en una ruta sobre el fondo hover;
  el token foreground lo corrigió. La inspección de las capturas detectó la
  etiqueta inglesa de respaldo; se corrigió la ubicación de su clave y se
  añadieron las doce regresiones de idioma.

Persisten avisos anteriores de conexiones rechazadas al localhost:3000 del
arnés y algunos avisos de act en las suites heredadas; no son diagnóstico del
servidor conectado ni fallos nuevos de las pruebas. No se consultaron
proveedores reales. Vitest y el comparador requirieron permiso por caché y
subproceso Git en el sandbox; Chromium usó permiso para el servidor de prueba.

Los artefactos ignorados viven en
`web/frontend/.cache/api-activity-contract-qa/`: `verification.json`,
`light|dark-360|1280.png` y `files-light|dark-360|1280.png`.
El arnés usa componentes y CSS actuales con HTTP/WS simulados:
`production=false`, `success=true`, `cleanup=true`.
Navegador y servidor de pruebas quedaron cerrados.
La apertura de archivos verifica la ruta entregada al editor, sin leer archivos
de producción; el diff del equipo se verifica con React y transporte simulado.

## Baseline de typecheck restante

Rutas relativas a `web/frontend/`; todas fuera de los archivos intervenidos.

| Archivo | Diagnósticos |
| --- | ---: |
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

La comparación usa HEAD `46abcb9aed44e78915cf488a9a2050ca8196c482`:
1468 raíces de baseline / 1479 actuales. `savedHeadersMatch=false` se debe a
que el archivo histórico todavía contiene los cuatro errores corregidos; la
comparación autoritativa de diagnósticos HEAD/actual tiene cero añadidos.
No se silenciaron errores con exclusiones, casts de producción o cambios de config.

## Criterios para QA conjunto y límites

1. Chat general y de agente, API y CLI: actividad compacta, consola única,
   detalles desplegables, respuesta/copiar/voz separados del progreso.
2. Cortar la conexión durante el guardado: reanudar desde seq una sola vez,
   conservar llamadas y detalles, recibir el terminal o releer el resultado.
   Verificar en backend que no se inicia otra ejecución del prompt original.
3. Fallar la lectura del historial y luego recuperarla: sigue sin confirmación
   hasta disponer del resultado; no desaparecen la traza ni los archivos.
4. Cambiar target, cancelar y enviar otro turno durante una reanudación:
   eventos, errores y cierre anteriores no alteran el turno actual.
5. Pendientes, fallo de guardado, pregunta, permiso, verificación fallida/omitida
   o cancelación: no mostrar éxito ficticio ni enviar la continuación local.
6. Recarga fría de tareas: mismos contadores, verificación y rama; abrir diff.
   Escritura API confirmada: mismo archivo en vivo y tras recarga, enlace al
   editor; escritura fallida/sin resultado y una simple lectura no añaden cambios.
7. Probar teclado, claro/oscuro, móvil/escritorio, doce idiomas y navegación SPA
   en el candidato instalado después del gate de infraestructura.

Los reintentos de reconexión conservan su presupuesto acotado; no garantizan
cierre frente a un fallo permanente. La UI no vuelve a ejecutar herramientas
para reconstruir su estado. Una continuación local bloqueada se conserva; no
se garantiza que se envíe sin intervención tras un error o decisión humana.
Los historiales antiguos sin eventos no permiten reconstruir llamadas o
archivos nunca guardados. El detalle omitido por límites/sanitización no se
inventa. La lista estructurada reconoce las escrituras del catálogo confirmado,
no cambios arbitrarios inferidos de comandos o prosa.

Andrés conserva la única fase de compilación/reinicio, después de la aprobación
de QA. Revisar el destino real del enlace dist y preparar Astro limpio según el
procedimiento de release; un solo build por máquina con
`NODE_OPTIONS=--max-old-space-size=2560 npm run build`, seguido siempre de
`pm2 restart luxipanel-frontend` y verificación online, HTTP, chunks y logs.
Esos comandos **no se ejecutaron** aquí. La revisión con proveedores reales,
la instalación y el gate global quedan a sus responsables; no se anuncia
publicación GitHub ni despliegue.

## Identidad de las fuentes entregadas

```text
8ca3a80ab075ddc124ca2ee7ede5c17b9ec5fc053a4b70aff7249249a9a963a4  src/components/floating-assistant/chat-engine.ts
59d9c34cd9151779a240752ed6741ba4716863350cee38956a94866a2ed857ec  src/components/floating-assistant/chat-engine/send.ts
79bc7301b9a04871b1118f4f625d231d891267b7f9dbe42f2effc334ebfd8bb4  src/components/floating-assistant/chat-engine/stream-apply.ts
4cd26a4a94539e110610aede2d99c91d2dce18a3b9b9d74dd237961d4938d992  src/components/floating-assistant/assistant-api/agent-stream.ts
e788057eb1a938b4787021622b8107a5461bb0d55c618618b0d88fe05bb7b71a  src/components/floating-assistant/chat-pane/helpers.ts
6a4305960371876aacf96209a0b5e8ea4cc2850e7f3f523e55f782e354873243  src/components/floating-assistant/chat-pane/turn-view.tsx
b9f494a86f8f59b8105f486389ae747ed898e80f7fe92c3dcc0b4462be679996  src/components/floating-assistant/chat-engine/backend-contract.qa.test.ts
```

El test cruzado QA conserva la misma suma que al inicio. Las sumas restantes
identifican el código final de esta continuación; el panel gestiona la captura
y publicación del aporte.
