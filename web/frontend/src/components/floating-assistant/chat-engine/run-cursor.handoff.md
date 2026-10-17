# Consumidor frontend de runId/cursor — entrega de Valentina

Fecha: 2026-10-17. Checkout original `/var/www/LUXIPANEL`, rama `developer`.
Ruta real del área: `/var/www/LUXIPANEL/web/frontend`; `frontend/` es el alias autorizado.

**Contrato integrado en fuentes y regresiones propias. Gate independiente todavía FAIL (3/5).**
No se habilita despliegue: Camila debe adaptar y repetir sus fixtures al contrato confirmado.
No se ejecutaron build, prebuild, restart, commit, push, cambio de rama, worktree ni copia de fuentes.

## Coordinación y documentación obligatoria

Leídos AGENTS.md, web/CLAUDE.md, arquitectura frontend/backend, referencias del SDK,
README de notas públicas, `history-identity.handoff.md` y estos documentos backend:

- `web/backend/src/modules/ai-assistant/docs/2026-10-17-run-cursor-contract-mateo.md`.
- `web/backend/src/modules/ai-assistant/docs/2026-10-17-gate-integrado-camila.md`.

El contrato de Mateo se consume sin editar backend ni inventar campos persistidos.
Su runId identifica un buffer, no una solicitud histórica ni una clave idempotente.
El mensaje de coordinación de Marin se respondió en este chat; el canal actual no
expone `agents.send_message` ni otros agentes accesibles. Este archivo es la entrega
revisable para Marin, Mateo y Camila; no afirma recepción ni aprobación independiente.

Se descubrieron modules.list/describe y se usaron files.read/write, revisión 2:0.
El grafo no expone herramientas invocables. Files rechaza las rutas canónicas fuera
del alias de frontend; las escrituras de código se hicieron mediante el alias autorizado.
La nota pública raíz y las cachés de Vitest requirieron el permiso de escritura del
workspace. No fue un fallo de conexión del servidor.

## Delta propio y contrato

Rutas relativas a `web/frontend/`:

| Archivo | Responsabilidad |
| --- | --- |
| `src/components/floating-assistant/assistant-api/agent-stream.ts` | Tipos exactos stream_state/recovery/runId; cuarto argumento opcional runId en streamAgentResume; query codificado; frames sin id usan seq=-1; cancelar/liberar lector al abandonar replay. |
| `src/components/floating-assistant/chat-engine.ts` | Recuperación común de resume/adopt; attach explícito al buffer reconciliado; tres intentos por llamada y backoff existente; guardas de target/conversación/AbortController; no drenar continuaciones locales desde resume. |
| `src/components/floating-assistant/chat-engine/stream-apply.ts` | Metadatos antes de dedup/terminal; rechazar terminal ajeno; reconciliación REST conservadora; conservar turnos/archivos y consola CLI persistida. |
| `src/components/floating-assistant/chat-engine/types.ts` | runId y reconcileRun en LiveChat; lastSeq pertenece al buffer identificado. |
| `src/components/floating-assistant/chat-engine/history-identity.ts` | Extrae findSavedRequestIndex sin relajar las guardas de contexto único, timestamps y adjuntos; reloadHistory sigue exigiendo el resultado al final. |
| `src/components/floating-assistant/chat-engine/run-cursor.test.ts` | 37 regresiones permanentes nuevas; transporte fetch/SSE, motor y reducer reales; tres cruzan además el registry backend original. |
| `src/components/floating-assistant/chat-engine/run-cursor.handoff.md` | Esta entrega. |

Nota pública nueva, conservando las anteriores:
`docs/changes/2026-10-17-reconexion-segura-entre-ejecuciones.json` (tres frases).

Se preservaron los cambios preexistentes del árbol compartido. No se editaron
send.ts, history.ts, la UI de consola/final, catálogos, autenticación, permisos,
licencia, executor, variables de entorno, dependencias, configuración ni backend.
Los tests de historial anteriores permanecen byte a byte iguales.

### Interpretación del wire

- `stream_state` se trata antes de aplicar contenido al turno. POST original puede
  asociar su buffer; una reapertura sin identidad exige primero evidencia REST.
- Se envía `runId` junto con el último seq aplicado. Se deduplica dentro de esa
  ejecución, manteniendo las guardas de contexto del dueño del stream.
- `AGENT_STREAM_RECONCILE_REQUIRED` con id=-1 no avanza el cursor, no es un error
  del proveedor y no borra actividad/permiso ni cierra A.
- Para B vivo se identifica en REST el resultado de A y el usuario siguiente,
  conserva A y abre B explícitamente con fromSeq=-1. Un cambio posterior a C
  vuelve a reconciliar; el replay no se concatena sobre A ni sobre B ya guardado.
- Para B guardado se restauran sus mensajes desde REST sin duplicar su replay.
  Solo un resultado correlacionado y buffer terminado permiten limpiar espejos
  antiguos de actividad/permiso.
- Un buffer agotado `done:true, replayFromSeq===nextSeq` solo motiva una lectura:
  no fabrica terminal ni éxito. 204, EOF y errores HTTP de GET tampoco acreditan
  resultado del proveedor. Los fallos de GET quedan recuperables.
- Los resultados pending/error/pregunta/cancelación, adjuntos, tablero existente
  y evidencias de archivos conservan su semántica. El log CLI guardado conserva
  la consola completa; no se antepone su consola viva parcial.
- Recuperar no reenvía prompts ni drena cola/añadiduras locales, incluso al recuperar
  un resultado válido. Esas continuaciones se conservan pendientes: es un cambio
  deliberado del comportamiento de resume requerido por este encargo.

## Regresiones y límites del contrato

Las 37 pruebas nuevas cubren A:12 → B:0 vivo/terminado, mismo run, cursor inválido
o sin identidad, buffer agotado, B → C durante REST, deduplicación de texto/uso,
adopción de usuario persistido, POST rechazado, POST no admitido con texto idéntico,
terminal ajeno, fallos REST/HTTP, aislamiento por target/dueño/turnos y ausencia de
envíos/drain. Verifican ambos pares usuario/respuesta, adjuntos y archivos, resultados
pendientes/errores/preguntas/permisos/cancelación, evidencia parcial y consola CLI.

Tres pruebas `registry → SSE bytes → actual client` cargan en memoria el registry
backend original con una lista explícita de dependencias. Simulan exclusivamente
I/O, proveedor y almacenamiento; mantienen onComplete bloqueado, drenado diferido,
cursores reales y conteo de una ejecución/un guardado por run. No copian fuentes,
no importan dist y no levantan servicios reales. El adaptador HTTP reproduce el
wire documentado; no acredita HTTP/proxy ni autorización de producción.

**Límite deliberado para Mateo:** no existe correlación histórica por runId en
este contrato. Sin contexto histórico único o timestamp de usuario identificable,
o con un buffer CLI reconstruido que cambia runId sin demostrar la relación con
su solicitud, se conserva la solicitud/resultado sin confirmar. No se adivina
identidad por texto, relojes aproximadamente cercanos ni terminales. Los tests
verifican esta negativa conservadora; no se promete recuperación automática de
esos casos ni de archivos nunca persistidos.

Si el criterio de salida exige recuperar automáticamente también esos casos,
queda pendiente un contrato adicional de Mateo: una identidad estable de solicitud
o mensaje persistido y su relación autoritativa con cada buffer. Un campo solo en
SSE o reutilizar el UUID del buffer como id de mensaje no basta. No se implementó
ese cambio de esquema ni se condicionó la corrección a reenviar el prompt.

## Verificación

Todos los comandos desde `/var/www/LUXIPANEL/web/frontend`, serializados, heap 2560 MiB;
Vitest con un trabajador y sin paralelismo entre archivos.

- Focal final: `env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine/run-cursor.test.ts src/components/floating-assistant/chat-engine/history-identity.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot --silent`.
  **Exit 0; 2 archivos, 62 aprobadas (37 nuevas + 25 de historial); 2,82 s.**
- Typecheck final: `node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false`.
  **Exit 2; baseline 22 / actual 22 / añadidos 0 / eliminados 0.**
  Se comparan ruta, línea, columna, código y mensaje normalizado contra
  `.cache/qa-integrated-gate-20261017-camila/typecheck-baseline.json`.
  Ninguno de esos diagnósticos está en archivos del delta. No se silencian errores
  ni se presenta como typecheck global aprobado.
- Suite completa final: `env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant --maxWorkers=1 --no-file-parallelism --reporter=dot --silent`.
  **Exit 0; 56 archivos, 419 aprobadas, 0 fallos/omitidas; 43,79 s.**
  No equivale a la suite completa del monorepo.
- i18n: `npm run i18n:audit`.
  **Exit 0; 12 idiomas, 39 namespaces, 8573 claves por idioma; cero faltantes,
  extras, diferencias de tipos/placeholders o valores vacíos.** No se añadieron
  claves ni se regeneraron catálogos.
- `git diff --check`: exit 0 antes de redactar esta entrega.

Evidencia propia ignorada:
`.cache/qa-run-cursor-20261017-valentina.json`.
El lanzador propio del mismo nombre .mjs ejecuta typecheck, suite del área, audit
y whitespace en serie, conserva salidas completas y huellas. No toca repros QA.

La primera corrida de las nuevas pruebas tuvo 3 fallos y 28 aprobadas: GET
401/403/503 se confundía con un terminal del proveedor. Se corrigió y quedó
cubierto permanentemente. La ejecución focal final y la suite final sustituyen
las cifras intermedias. El primer intento de Vitest en sandbox no inició pruebas
por caché de solo lectura; se repitió con el permiso correspondiente.
La salida de pruebas anteriores incluye conexiones rechazadas a localhost:3000
del arnés; no son diagnósticos de disponibilidad del servicio desplegado.

## Aviso concreto a Camila: el runner anterior no consume el contrato nuevo

Runner intacto ejecutado:

```sh
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node .cache/qa-integrated-gate-20261017-camila/run-races.mjs
```

**Última repetición: exit 1; 3 aprobadas / 2 fallidas, 5 casos; 2,06 s. Gate FAIL.**
La primera ejecución de este turno dio el mismo 3/5 en 1,20 s; ambas dejaron intactos los fixtures.

1. El control same-run llama attach con cursor numérico y sin quinto argumento
   `{ runId: first.run.runId }`. Según el contrato de Mateo debe recibir
   reconciliación, no done; por eso falla la expectativa de un terminal.
2. El sucesor vivo llama solo applyEvent desde el callback viejo. No serializa
   el tercer argumento runId ni stream_state, no invoca resume ni proporciona
   REST con la posición persistida de A/B. El reducer conserva A interrumpido,
   como exige el nuevo protocolo; no debe sustituirlo por la respuesta de B.
3. El sucesor terminado acepta cualquier error como cierre y pasa, pero eso no
   acredita conservación de A/B. Los dos controles de POST no admitido pasan.

Adaptación mínima propuesta, a cargo exclusivo de QA:

- Same-run debe enviar su identidad conservando la expectativa de un terminal.
- Las variantes de sucesor deben pasar por el transporte/motor reales, con
  stream_state y runId serializados y REST actualizado después de persistencia.
  El cursor interno de registry es fromSeq wire + 1.
- El fixture necesita timestamps/contexto/adjuntos persistidos para correlacionar
  solicitudes, tal como demanda el contrato; no basta igualdad de texto.
- Mantener las expectativas anteriores y añadir ambos turnos/archivos, B vivo y
  terminado, sucesor durante REST, una ejecución por run y ningún reenvío/drain.
  El resultado terminal de B no debe usarse para cerrar una solicitud no admitida.
- Repetir los cinco escenarios después de esa adaptación sin editar producto ni
  debilitar assertions. Las nuevas pruebas propias no sustituyen el gate independiente.

No se editaron races.test.ts ni run-races.mjs; sus SHA-256 y los del backend
coinciden con los handoffs previos. El registro de huellas final se conserva en
la evidencia propia. `history-identity.test.ts` conserva SHA-256
`f756e9d70db1f4d15c3dea06653536c49c70a302e2f8051b2f3b007c3f78ddbb`.

## Huellas finales para revisión

SHA-256 de las fuentes propias, rutas relativas a web/frontend:

```text
f50b9406f2398927f154c26764036dcf588f6c576ddca6c6062969b79d576d87  src/components/floating-assistant/assistant-api/agent-stream.ts
cd1ccdd20cbbee8ec32d16a3a4f4672d5e09e6ed1f35f7b1d3e8fc455cfbd123  src/components/floating-assistant/chat-engine.ts
6b60b58a674fcc55478c0b835af8094ab9ce0d291eed968bb72fe37ab5ce6c14  src/components/floating-assistant/chat-engine/stream-apply.ts
3c75dce471962097c74de77d657b3266606e78752fa6c7741cedafd985d8a6a7  src/components/floating-assistant/chat-engine/types.ts
ba58dc45570631ea44ddc849824ca3ef599672fbd68e2231ff26b28a6ad8dda8  src/components/floating-assistant/chat-engine/history-identity.ts
ebaf1a449d7aa8b8f9405122dfdcd74c3b2493d15d4f5fe9927ae442fc780e26  src/components/floating-assistant/chat-engine/run-cursor.test.ts
```

## Entrega y fase reservada

Marin/Mateo/Camila: consumidor listo para revisión conjunta, con el gate independiente
pendiente y los límites históricos indicados. No se afirma aprobación ni cierre
global de las carreras fuera de la evidencia descrita.

Andrés conserva build/restart/online/HTTP tras el PASS independiente; no se
ejecutaron en esta intervención. Tampoco se verificaron candidato instalado,
login real, SSE por proxy real, proveedor externo, navegación Astro instalada
ni acceso multiusuario físico. El aporte no afirma publicación en GitHub.
