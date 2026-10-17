# Market de agentes — entrega frontend

Fecha: 2026-10-17. Responsable: Valentina.

Implementación en el checkout original `developer`, solo `web/frontend`.
Market y sus regresiones están implementados. La validación integrada en
navegador y el despliegue siguen pendientes; este informe no acredita publicación.

## Comportamiento y contrato consumido

Se cotejó el contrato v1 de
`web/backend/src/modules/ai-assistant/docs/agent-market-contract.md` con los tipos
y servicios actuales de Mateo. Se coordinó por el canal de agentes, sin modificar
backend ni solicitarle cambios adicionales al DTO.

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

```sh
npm run i18n:split
node scripts/i18n-audit-coverage.mjs
```

Ambas salidas **0**. Generación: **39 namespaces × 12 idiomas = 468 JSON**,
versión `26dcabe22be1`. Auditoría: **8628 claves**, 43 nuevas del Market en los
12 idiomas, cero faltantes, extras, tipos, placeholders incompatibles o vacíos.
Solo se editaron fuentes; el script regeneró los derivados y el catálogo público.

```sh
NODE_OPTIONS=--max-old-space-size=2560 ./node_modules/.bin/tsc --noEmit --pretty false
```

Salida **2: 19 errores, todos fuera de los archivos modificados del área**.
No se silencian ni se excluyen archivos para conseguir un resultado verde.

| Archivo relativo a frontend | Ubicación | Cantidad y diagnóstico |
| --- | --- | --- |
| `src/lib/diagnostics/browser.ts` | 27:33 | 1, TS2339: target sobre never |
| `src/scripts/extracted/components/floating-terminal/startup.test.ts` | 6:161; 7:170 y 7:322; 8:158; 9:149; 10:346; 11:542; 12:152 | 8, TS2345: fixtures ApiResponse sin status |
| `src/scripts/extracted/lib/mail-sudo.ts` | 7:46 | 1, TS2353: previousError no admitido |
| `src/scripts/extracted/pages/panel/expo/read.test.ts` | 24:118 | 1, TS2345: fixture ApiResponse sin status |
| `src/scripts/extracted/pages/panel/hosting/provider-settings.ts` | 1:76; 95:66; 107:81 | 3: import de permission-editor no resuelto y dos parámetros any implícitos |
| `src/scripts/extracted/pages/panel/mail/account-catalog.ts` | 7:72 | 1, TS2322: domain opcional donde se exige string |
| `src/scripts/extracted/pages/panel/mail/index-script1.ts` | 8:41 | 1, TS2307: import de mail-server-settings no resuelto |
| `src/scripts/extracted/pages/panel/users/hosting-templates.ts` | 3:94; 25:71 | 2: import de permission-editor no resuelto y parámetro any implícito |
| `src/scripts/extracted/pages/panel/users/role-permissions.ts` | 4:56 | 1, TS2307: import de permission-editor no resuelto |

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
   En el descubrimiento de esta sesión, `modules.describe("browser")` no
   devolvió operaciones; usar el canal browser disponible en QA/líder. Esto
   no acredita un fallo de conexión del servidor.
2. Líder: asignar los 19 errores externos al Market antes del cierre global.
   El typecheck de todo frontend continúa fallando aunque esta área no reporte errores.
3. Andrés: build limpio serial y restart exclusivamente en la fase autorizada,
   seguido de proceso online, logs, HTTP y flujos reales. Esta entrega no ejecutó
   ni solicita adelantar esa fase.
4. QA registra la nota consolidada de cambios cuando corresponda. El panel
   confirma la publicación; este aporte no la da por terminada.
