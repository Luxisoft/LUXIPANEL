# Corrección P1 de identidad del historial — entrega frontend

Fecha: 2026-10-17. Responsable: Valentina.

**P1 de solicitud no admitida corregido en fuentes y pruebas. Gate conjunto
sigue FAIL: 3/5 reproducciones integradas, dos fallos de reconexión/cursores.**
Esta entrega sustituye únicamente la correlación por texto descrita en
`../chat-pane/api-activity.final-integration.qa.md`; no acredita despliegue.

## Checkout, propiedad y delta

Checkout original `/var/www/LUXIPANEL`, rama `developer`.
Se leyeron AGENTS.md, web/CLAUDE.md (no existe CLAUDE.md raíz), arquitectura
frontend, arquitectura backend, README del asistente, especificación de
módulos, docs/changes/README.md y los informes de Camila y de continuidad.
Se conservaron los cambios previos del árbol compartido.

Archivos relativos a `web/frontend/`:

| Archivo | Delta de este encargo |
| --- | --- |
| `src/components/floating-assistant/chat-engine/stream-apply.ts` | Importa la guarda nueva y reemplaza solo la correlación de `reloadHistory`. La guarda cubre pending, interrupted y completionPending, también fuera de un resume activo. Se conservan las guardas de target, conversación, AbortController y referencia de turnos. |
| `src/components/floating-assistant/chat-engine/history-identity.ts` | Helper nuevo que exige contexto histórico único y posición del resultado correspondiente. |
| `src/components/floating-assistant/chat-engine/history-identity.test.ts` | 25 regresiones permanentes mediante dispatchSend, resume, reloadHistory y extracción de archivos reales; solo se simulan transportes. |
| `src/components/floating-assistant/chat-engine/api-activity.test.ts` | Dos fixtures de recuperación ahora incluyen el usuario identificado y su timestamp. Antes solo contenían una respuesta sin solicitud. Se conservan las expectativas de resultado, tablero y actividad; el acceso al turno usa el último elemento. |
| `src/components/floating-assistant/chat-engine/history-identity.handoff.md` | Esta entrega para líder, Mateo y QA. |

Nota pública **nueva**, sin reemplazar las anteriores:
`docs/changes/2026-10-17-identidad-historial-solicitudes-asistente.json`.
Tres frases acotadas a la recuperación del historial.

No se modificaron backend, chat-engine.ts, send.ts, contratos API/DTO, eventos
SSE, cursores, autenticación, permisos, aislamiento, configuración, dependencias
ni catálogos i18n. El delta de stream-apply de este encargo no cambia applyEvent.
No hubo copias de fuentes, worktrees, cambio de rama, commit, push, build ni restart.

Se descubrieron modules.list/describe y se utilizaron modules.read/execute,
Files revisión 2:0, con el alias autorizado `frontend/`.
El grafo no ofrecía herramientas invocables; se buscaron fuentes.
Files rechazó la ruta canónica web/frontend y luego aceptó el alias configurado.
La nota fuera de frontend requirió el permiso específico de escritura del
workspace después del rechazo por alcance de Files; se creó con modo exclusivo,
sin sobrescribir otra nota. Vitest requirió permiso por su caché temporal.

## Contrato consumido y comportamiento

No se propone ni implementa el contrato run/cursor de Mateo en esta fase.
`hasSavedRequestOutcome(local, saved): boolean` es exclusivamente frontend y
usa los campos ya existentes: rol, texto mostrado, createdAt y adjuntos.

Para aceptar el historial mientras existe un resultado local sin confirmar:

1. Debe existir un usuario inmediatamente antes del resultado local.
   El historial leído debe acabar con usuario correspondiente y asistente.
2. El usuario debe coincidir en texto, marca auto/compacted y metadatos de
   adjuntos (nombre, MIME y transcripción). No se comparan las URL: un adjunto
   local data: se transforma en una URL persistida al admitirse.
3. Si había contexto anterior, se exige encontrar **todo ese bloque una sola
   vez** en el historial remoto, conservando rol, texto, timestamp y metadatos.
   La nueva solicitud tiene que estar inmediatamente después del bloque.
   Se admiten filas antiguas adicionales al principio de la página.
4. Si no había contexto anterior, se requiere coincidencia exacta y única
   del timestamp del propio usuario, además de sus datos. El texto solo no
   sirve como identidad.
5. Una respuesta de un usuario posterior, un contexto truncado/reescrito o
   ambiguo y la ausencia de evidencia devuelven false. La lectura no sustituye
   los turnos locales ni acredita éxito.
6. El dueño actual de resume conserva su cierre habitual: después del 204
   sin resultado correlacionado, vuelve a interrupted y mantiene la recuperación
   acotada por lecturas. No se reenvía el POST ni se drenan añadiduras o cola local.

Las fechas se comparan por igualdad; no se presupone sincronización entre
reloj del navegador y servidor. Un resultado persistido propio con pending,
error, interrupción o pregunta conserva ese estado y bloquea la continuación.
Los terminales de otros runs no se usan como evidencia en esta reconciliación.

**Límite deliberado:** si el contexto previo no puede compararse de forma
exacta (por ejemplo, timestamps locales distintos de los guardados, compacción,
historial parcial o continuación sin usuario identificable), el resultado sigue
sin confirmarse. Esta fase prioriza evitar un cierre falso; no garantiza
recuperación automática de esos casos sin la siguiente integración de identidad.
Tampoco reconstruye archivos o actividad que nunca fueron persistidos.
No añade un identificador de petición ni garantiza correlación entre clientes
concurrentes mediante un identificador nuevo.

## Regresiones permanentes

Las 25 nuevas pruebas cubren:

- Texto idéntico/distinto, API/CLI y con/sin adjuntos tras un POST que falla
  antes de admisión, GET stream 204 y REST anterior: cuatro entradas conservadas,
  respuesta nueva vacía e interrupted; un solo intento del POST.
- Agotamiento del presupuesto existente de recuperación por lecturas, sin
  envío automático del prompt, cola o añadidura.
- Recarga directa de historial interrumpido fuera de resume y colisión entre
  el timestamp de la nueva solicitud y el anterior.
- Historial sin contexto, contexto cambiado o sin timestamps, solo usuario,
  solo asistente, respuesta de un sucesor y contexto duplicado ambiguo.
- Persistencia tardía legítima con el mismo texto, primero solo historial
  anterior, luego usuario nuevo sin respuesta y finalmente su resultado.
  Conserva los dos turnos, el adjunto y los archivos anteriores/actuales;
  permite una página con filas más antiguas y no duplica el envío.
- Restauración de pending, error, cancelación y pregunta del turno correcto,
  conservando archivos y sin drenar continuaciones.
- Usuario ya identificado por timestamp y ausencia de evidencia para identificarlo.

Los dos fixtures antiguos ajustados siguen comprobando resultado, tablero y
actividad. No se modificaron las reproducciones ni el runner de Camila.

## Comandos, salidas y cifras

Todos los comandos desde `/var/www/LUXIPANEL/web/frontend`, salvo git diff.
Las pruebas y typecheck se ejecutaron en serie, con heap de 2560 MiB.

Focal final:

```sh
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant/chat-engine/history-identity.test.ts src/components/floating-assistant/chat-engine/reconnect-finalization.test.ts src/components/floating-assistant/chat-engine/api-activity.test.ts src/components/floating-assistant/chat-engine/send.test.ts --maxWorkers=1 --no-file-parallelism --reporter=dot
```

**Exit 0: 4 archivos, 67 aprobadas, 0 fallos; 1,75 s.**

Área completa:

```sh
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant --maxWorkers=1 --no-file-parallelism --reporter=dot --silent
```

**Exit 0: 55 archivos, 382 aprobadas, 0 fallos/omitidas; 39,46 s.**
Incluye los contratos cruzados existentes, aislamiento y tests de traducciones.
No equivale a la suite de todo el frontend o del monorepo.
Persisten avisos del arnés por conexiones rechazadas a localhost:3000;
no son evidencia del servicio publicado.

Typecheck:

```sh
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
```

**Exit 2: exactamente los 22 diagnósticos anteriores, ninguno nuevo.**
Se compararon en memoria ubicación, código y mensaje completo con
`.cache/qa-integrated-gate-20261017-camila/typecheck-baseline.json`;
se normalizó únicamente la indentación del mensaje.
Resultado: baseline 22 / actual 22 / añadidos 0 / eliminados 0.
No se volvió a ejecutar ni modificar el comparador HEAD de la entrega anterior.
No se silenciaron errores ni se alteró tsconfig.

No se añadieron textos visibles ni claves; no hizo falta regeneración i18n.
No se ejecutaron i18n:split, prebuild ni build.

Reproducciones independientes intactas:

```sh
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node .cache/qa-integrated-gate-20261017-camila/run-races.mjs
```

**Exit 1: 3 aprobadas / 2 fallidas, 5 casos; 1,11 s.**
Las dos variantes POST no admitido (idéntico/distinto) pasan:
cuatro turnos, interrupted=true y un intento original.

Con el backend compartido presente en esa corrida:
- El sucesor terminado pasa su comprobación de recibir un terminal.
- El control same-run falla: recibió cero done en lugar de uno.
- El sucesor vivo falla: la UI conserva «Primera respuesta» y recibe un error
  de identidad; no adopta «Segunda respuesta».

Estas dos últimas comprobaciones requieren integrar/verificar el contrato
run/cursor; **no se atribuye su reparación a este delta ni se declara gate PASS**.
No se modificaron backend ni expectativas para volverlas verdes.

Evidencia previa a la corrección: la primera versión de la nueva suite,
21 casos, dio **12 fallos y 9 aprobados, exit 1**. Incluyó el falso cierre y
el drenado indebido de añadiduras. La suite final se amplió a 25 casos.
El primer intento en sandbox no inició pruebas porque Vitest no pudo escribir
su caché; no se cuenta como reproducción.

Evidencia propia ignorada:
`web/frontend/.cache/qa-history-identity-20261017-valentina.json`.
Contiene comandos, cifras, salida y comparación exacta de typecheck y hashes.
No incluye copias de fuentes ni se añade al aporte.

## Próxima integración y límites de entrega

Líder/Mateo/QA deben integrar después el contrato de identidad de ejecución y
cursor, conservando estas regresiones. Ante cambio de run, reconciliar A y B
sin usar el terminal de B como cierre de A y conservar ambos turnos/archivos.
Repetir los cinco casos de Camila sin debilitar controles y obtener un nuevo
gate conjunto antes de habilitar a Andrés.

Este documento es el handoff de coordinación; no se afirma una aceptación
recibida de otro responsable. No se ejecutaron proveedores reales, backend
tests, navegador del candidato instalado, SSE/REST de producción, login,
builds ni reinicios. No se declara publicación ni despliegue.

## Huellas de las fuentes y QA

SHA-256, rutas relativas a web/frontend:

```text
051dd858f01455741f97a446d6fe927b1218ac055f04208eef50374102159801  src/components/floating-assistant/chat-engine/stream-apply.ts
718088d743bf40b74a527b4ec1dcc86173b1665f2740e6ccb669d6829f897ccb  src/components/floating-assistant/chat-engine/history-identity.ts
f756e9d70db1f4d15c3dea06653536c49c70a302e2f8051b2f3b007c3f78ddbb  src/components/floating-assistant/chat-engine/history-identity.test.ts
74c03e8b02a716f58c861145724b995e56fde6f02fd73d22f3d80cf455bd99ea  src/components/floating-assistant/chat-engine/api-activity.test.ts
97d49abcdaa4701351d718b8c25e8548c2ecbf6a26dc7eac94856cf13dfd1a56  .cache/qa-integrated-gate-20261017-camila/races.test.ts
bf130904f19b9c143e95d576088dd87c42fbada0153323e22d7babbe7401f989  .cache/qa-integrated-gate-20261017-camila/run-races.mjs
```

Las dos huellas de los archivos de Camila coinciden con las capturadas antes de
la intervención. La nota pública tiene JSON válido, title/changes y tres frases.
