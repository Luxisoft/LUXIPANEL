# Market de agentes — entrega frontend

Fecha: 2026-10-17. Responsable: Valentina.

## Correctiva posterior al rechazo de QA — 2026-10-17

Esta sección es la entrega vigente de la corrección de los seis hallazgos.
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
   micrófono o consultas iniciales. La sesión activa sigue siendo terminable.
   Se probaron evento agents-updated, promesa GET rechazada, cierre, ausencia de
   un nuevo inicio y preservación del borrador/adjuntos; también el hook real
   con WebRTC y micrófono simulados.

2. **Caminos alternativos de envío en histórico.** La admisión común vive en
   `use-chat-pane-derived`, usa el binding persistido (incluido projectId:null)
   y alimenta tanto la UI como `use-chat-pane-actions.send`.
   Sugerencias, retry, answer/aprobación, compositor, cola y audio no crean ni
   envían ni recortan historial cuando la admisión falla. Las respuestas no
   cambian primero el modo de aprobación. Se revalida después de esperar
   opciones y de crear una conversación, comprobando ámbito/binding actuales.
   Un fallo al crear desde una sugerencia conserva el borrador original y sus
   adjuntos. La petición explícita de un chat general nuevo sigue admitida y no
   recontextualiza el histórico. Las aserciones son llamadas simuladas del
   frontend; **no acreditan ejecución real del backend**.

3. **Catálogo tardío con proveedor ya activo.** `AssistantPanel.launchAgent`
   toma el texto/adjuntos más recientes después de todas las esperas, también si
   no tiene que activar proveedor. Comprueba target/sesión, proveedor/hilo/agente,
   proyecto del pane y workspace, ruta y pestaña. Los eventos de navegación y
   permisos invalidan una solicitud pendiente. La regresión reproduce catálogo
   diferido con edición simultánea; otras cubren cambio de proyecto, hilo,
   target, sesión y ruta.

4. **POST de perfil con resultado incierto.** El cliente conserva status/code
   también en creación; una respuesta sin id válido es incierta.
   `profile-create-recovery` mantiene un bloqueo local antes del POST, separado
   por usuario/target; persiste solamente una marca booleana en sessionStorage,
   nunca formulario, credenciales ni cabeceras. Impide repetir la creación tras
   pérdida de respuesta, incluso al cerrar/reabrir el editor. Un rechazo HTTP
   definitivo permite corregir/reintentar. Revisar el catálogo hace solo GET.
   El usuario puede elegir explícitamente un id existente, que se relee y exige
   canEditProfile antes de pasar a edición PUT. No se infiere identidad por
   nombre, timestamps ni diferencias del catálogo. Se probaron persistencia
   seguida de respuesta perdida, dos perfiles con el mismo nombre, recuperación
   por id, ausencia de otro POST, remontaje y rechazo definitivo.

   **Límite/dependencia:** el contrato v1 no devuelve una identidad recuperable
   de la operación si se pierde la respuesta del POST. No es posible confirmar
   automáticamente qué perfil creó ese intento ni demostrar que no se aplicó
   mediante un catálogo vacío. Si el usuario no identifica el perfil, el estado
   sigue incierto y la creación bloqueada. Automatizarlo requiere que backend
   admita una identidad de operación acotada a usuario/target, registre
   atómicamente su resultado y permita consultarlo/repetirlo sin duplicar.
   Esta propuesta **no está implementada ni se presupone disponible**.
   La marca local no sustituye ese contrato entre pestañas, dispositivos o
   después de borrar almacenamiento; si sessionStorage no permite escribir,
   la protección conserva solo la memoria del documento.
   No se tocó backend. La dependencia se intentó enviar al líder; su buzón
   rechazó los mensajes por capacidad. Camila recibió el hallazgo por el canal
   asíncrono (mensaje 575636a0-fee3-446d-8a03-f6d2b2479d9d).

   **Límites concretos para la revalidación de Camila (revisión de fuente).**
   `reload()` no limpia la marca de creación incierta: ni un GET vacío, ni un
   error, ni la presencia de un nombre coincidente prueban que el POST no ocurrió.
   `recoverProfile(id)` relee el catálogo y exige ese id exacto con
   `canEditProfile === true`; sin él o con GET fallido mantiene el bloqueo.
   Elegirlo abre su edición, sin anunciar éxito del POST original.
   El desmontaje del editor no borra la marca; memoria de módulo y sessionStorage
   la conservan durante navegación SPA en el mismo ámbito. Las respuestas de
   recuperación se descartan si cambian target o cabeceras de sesión respecto al
   montaje. La marca persistida contiene solo el booleano por usuario/target,
   no una identidad de sesión u operación ni datos que permitan atribuir el POST.

   Las cuatro regresiones de `agents-tab/profile-create-recovery.test.ts`
   acreditan pérdida de respuesta tras persistir sin segundo POST, selección
   explícita por id entre nombres iguales, cierre/remontaje y rechazo definitivo.
   La navegación SPA real, los GET vacíos/fallidos y los cambios de target/sesión
   durante recuperación quedan como comprobaciones específicas de QA; la
   inspección anterior no se presenta como nuevas pruebas ejecutadas.
   La recuperación automática descrita arriba es una limitación del contrato,
   no una ampliación backend solicitada por esta entrega. La corrección ofrece
   bloqueo seguro con incertidumbre explícita y recuperación manual.

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

Rutas relativas a `web/frontend`, exclusivamente el delta de este turno:

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
- `src/components/ui/ModalShell.tsx`
- `src/components/ui/ModalNavbar.tsx`
- `src/components/ui/ModalShell.test.ts` (nuevo)
- `src/i18n/{ar,bn,de,en,es,fr,hi,it,ja,ko,pt,ru}/assistant/part2.ts`
- Este `agent-market.handoff.md`.

No se cambiaron contratos HTTP, rutas de login ni permisos backend. Las nuevas
props compartidas son internas de frontend y opcionales; los consumidores
conservan sus valores predeterminados. No se cambió configuración de tipos.

### Evidencia nueva y reproducible

Se escribieron primero regresiones y se observaron los fallos: control de voz
ausente; create llamado desde sugerencia retirada; snapshot viejo de borrador;
dos POST; pointer-events-none persistente; aria-labelledby ausente.
La primera corrida de cuatro archivos registró 12 fallos/30 aprobadas; también
detectó fixtures incompletos de la prueba nueva de chat, corregidos antes de
validar. Ese total no representa doce defectos del producto. La reproducción
de chat se repitió con sus API simuladas completas antes del arreglo.

La suite final se dividió en ocho lotes seriales por el límite de duración del
canal protegido. Cada archivo se cuenta una sola vez; los lotes afectados por
los últimos ajustes sustituyen sus resultados anteriores.

| Lote | Archivos | Aprobadas | Fallos / omitidas / todo |
| --- | ---: | ---: | --- |
| 1 | 10 | 59 | 0 / 0 / 0 |
| 2 | 10 | 52 | 0 / 0 / 0 |
| 3 | 10 | 125 | 0 / 0 / 0 |
| 4 | 10 | 66 | 0 / 0 / 0 |
| 5 | 10 | 123 | 0 / 0 / 0 |
| 6 | 10 | 48 | 0 / 0 / 0 |
| 7 | 10 | 45 | 0 / 0 / 0 |
| 8 | 6 | 135 | 0 / 0 / 0 |
| **Total** | **76** | **653** | **0 / 0 / 0** |

Todos los comandos finalizaron con salida 0. Informes locales ignorados:
`.cache/market-review-batch-{1..8}.json`, todos con success:true.
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
        f"--outputFile=.cache/market-review-batch-{batch}.json", "--silent",
    ], env=env, check=True)
PY
```

Incluye la suite del asistente, sus consumidores del modal, los tres casos
nuevos del componente compartido, workspace y regresiones de rutas/permisos.
El runner sigue mostrando avisos auxiliares de conexión rechazada a
localhost:3000; no hubo fallos ni pruebas omitidas. Esto no diagnostica el
servicio de producción ni acredita logs de un despliegue.

```sh
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
npm run i18n:split
node scripts/i18n-audit-coverage.mjs
git -C /var/www/LUXIPANEL diff --check -- web/frontend
```

- Typecheck **salida 0, cero diagnósticos**, última ejecución 25,35 s.
  La línea base antes de editar también fue salida 0 (25,813 s).
  **Remanentes externos exactos: ninguno en este checkout.** Los cinco archivos
  de la corrección externa ya estaban modificados al entrar; no se editaron en
  esta correctiva. No se aplicaron any, supresiones, exclusiones ni strict más
  permisivo para ocultar errores.
- i18n: tres textos nuevos en los doce catálogos fuente. Split **salida 0**:
  39 namespaces × 12 idiomas = 468 JSON, versión `0a6379a6f6ef`.
  Auditoría **salida 0**, 8631 claves, cero faltantes, extras, diferencias de
  tipo/placeholders o vacíos. Derivados regenerados por el script.
- Diff check: **salida 0**.

### Corrección externa de los 19 diagnósticos: aplicada y conservada

Actualización documental solicitada por coordinación el **2026-10-17**.
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
de coordinación ni se suma a las **653 pruebas nuevas de la correctiva UI**.

El comando de tipos, ejecutado antes y después de las correcciones UI, fue:

```sh
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
```

Ambas ejecuciones registradas en esta correctiva del **2026-10-17** terminaron
con **salida 0 y cero diagnósticos**: línea base 25,813 s; final 25,35 s.
Remanentes exactos: **0**. No se añadió `any`, exclusión, supresión ni relajación
de strict para obtener ese resultado. Esta actualización solo completa la
trazabilidad documental; no afirma una ejecución adicional de tests o tsc.

No hubo build, restart, commit, push, cambio de rama, worktree, copia de
checkout, nota docs/changes, ediciones backend/LP/móvil/desktop/infra/.env ni
mutaciones de datos reales. QA integrada en navegador y con backend real sigue
pendiente; no se declara cierre de esos gates. Andrés conserva la fase posterior
de compilación/reinicio/verificación. La publicación corresponde al panel.

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
