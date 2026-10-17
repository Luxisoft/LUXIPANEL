# Revisión de cierre de tareas recuperadas — entrega a QA e infraestructura

Fecha: 2026-10-17, hora del servidor (America/Bogota). Responsable: Mateo.
Trabajo en el original `/var/www/LUXIPANEL`, rama `developer`; backend real
`web/backend` (la ruta histórica `backend` resuelve allí). **No hay una rama
de tarea para integrar.** Sin copias, worktrees, cambios de rama, commit, push,
build, reinicio ni despliegue en esta intervención.

El checkout ya contenía la corrección amplia descrita en
[turn-finalization-handoff.md](turn-finalization-handoff.md), junto con cambios
frontend y salidas `dist` ajenos. Se conservaron. La suite inicial confirmó
942 pruebas aprobadas y una omitida; el typecheck inicial terminó con salida 0.
Se verificó en fuente que `guardTurnFinalization` envuelve tanto los nuevos
turnos como la recuperación CLI, y que el boot registra los listeners del
equipo. Esa evidencia no acredita que el código esté desplegado.

El defecto adicional se reprodujo en la reconciliación de una tarea huérfana:
`team-tasks/service.ts:reconcileRunningTask` lee la respuesta guardada del
trabajador y llama a `finalizeTask` con `skipVerify: true`. Aunque hubiera
una receta de verificación requerida, una respuesta con texto bastaba para
cerrarla como `done`, incluso si la verificación había fallado, se había
omitido o no tenía resultado confirmado.

La modificación de esta intervención se limita a **13 líneas añadidas** en
`services/team-tasks/lifecycle.ts`, dentro de `finalizeTaskInner`, y **70 líneas
añadidas** de regresiones en `services/team-tasks.service.test.ts`. Se compararon
ambos archivos con sus contenidos al iniciar esta revisión: solo contienen
esas adiciones sobre los cambios ajenos previos. La nota publicable nueva es
`docs/changes/2026-10-17-cierre-tareas-asistente.json`; no se sobrescribieron notas.

| Situación recuperada | Resultado comprobado |
| --- | --- |
| Receta requerida, sin verificación aprobada, y sin ejecución o reparación activa | Tarea `failed`, respuesta parcial conservada y mensaje que explica la verificación fallida o sin confirmar |
| Verificación ya `passed` | Puede cerrar `done` sin volver a ejecutar la receta |
| Verificación dentro de su ventana de actividad | Sigue `running` |
| Corrección aún en cola | Sigue `running` |
| Cancelación, pregunta humana, error o CLI recuperándose | Se conservan los guards existentes y sus pruebas |

No se relanzan trabajadores ni comandos al resolver este caso. El fallo
describe el cierre sin verificación acreditada; no afirma que los cambios
realizados por el trabajador hayan fallado. Se mantiene el estado previo de
verificación como evidencia y el error de cierre explica su incertidumbre.

Se usa el contrato actual `TeamTask.status/error/resultSummary/verify`; no hay
campos, firmas, eventos ni variables de entorno nuevos. No se modificaron
frontend, autenticación, licencia, sesión, executor ni persistencia compartida.
La otra punta puede seguir usando el estado de tarea y el error existentes.
La integración frontend de `done.pending`, fases de texto y `apiActivity`
pertenece al aporte anterior: su contrato y rutas están en el handoff enlazado,
y debe validarla el responsable frontend antes del cierre del conjunto.

Comandos desde `web/backend` y resultados observados:

| Validación | Comando | Resultado |
| --- | --- | --- |
| Base, antes de editar | `env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck` | Salida 0, sin errores |
| Suite base | `npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=2 --minWorkers=1` | Salida 0; 96 suites; 942 aprobadas, 1 omitida; 23,29 s |
| Reproducción, solo tests nuevos | `npm test -- src/modules/ai-assistant/services/team-tasks.service.test.ts --pool=threads --maxWorkers=1 --minWorkers=1` | Salida 1; 4 fallidas y 55 aprobadas: se recibía `done` sin verificación confirmada |
| Mismo comando tras corregir | Comando de reproducción anterior | Salida 0; 59 aprobadas; 1,45 s |
| Typecheck posterior | `env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck` | Salida 0, sin errores |
| Suite final | `npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=2 --minWorkers=1 --reporter=dot --silent` | Salida 0; 96 suites; 949 aprobadas, 1 omitida; 23,24 s |
| Formato | `git diff --check` desde el original | Salida 0 |

La prueba omitida es la integración preexistente de
`providers/cli/resource-launch.test.ts`, habilitada únicamente con
`LXP_RESOURCE_INTEGRATION=1`. No se ejecutaron scopes reales ni proveedores
externos. Los avisos de almacenamiento, ejecución o guards en los logs de Vitest
son fallos simulados por fixtures; no son un diagnóstico de los servicios vivos.

QA debe comprobar en la instalación integrada:

1. Recuperar una tarea con receta requerida, respuesta parcial y verificación
   ausente/fallida: no mostrar éxito ni repetir comandos; mostrar el error y
   conservar la respuesta del trabajador.
2. Recuperar una verificación aprobada, otra todavía activa y una corrección
   en cola: cierre correcto solo en la primera, sin ejecutar de nuevo la receta.
3. Dejar vencer `team.collect` con trabajadores activos: finalizar ese turno
   como pendiente y comprobar el turno posterior de recogida al concluir.
   No confundir ese cierre de stream con el cierre definitivo del trabajo.
4. Probar pregunta, cancelación y error del proveedor; mantener aprobaciones y
   estados honestos. Revisar la entrega tras un fallo de encolado y la recarga
   del historial con la integración frontend.

Andrés conserva en exclusiva los builds y reinicios. Para backend, desde
`web/backend`: `env NODE_OPTIONS=--max-old-space-size=2560 pnpm build`, seguido
del reinicio de `luxipanel-backend` según el ecosystem vigente y comprobación
PM2 online, HTTP de salud y logs. Confirmar primero el proceso y configuración
de la instalación. No se cambió ningún `.env` en esta intervención; si otro
aporte lo cambia, reiniciar reevaluando el ecosystem con `--only` y
`--update-env`. Un único build por máquina. Si también compila frontend Astro,
limpiar su `dist` previamente y aplicar el mismo límite de heap; terminar ese
build con su reinicio y verificación antes de otro build. Para ejecución remota
por `servers.exec`, usar el target descubierto y timeout de 300000–600000 ms.

Pendientes: integración y QA frontend, build/restart serializados y validación
online/HTTP/logs por infraestructura. Esta entrega no acredita publicación,
despliegue ni que cualquier tarea vaya a terminar pese a permisos, fallos o
espera humana; tampoco ofrece ejecución exactamente una vez ante cualquier
caída o fallo de almacenamiento.

Se descubrieron los módulos mediante el canal protegido. Obsidian y el grafo
no ofrecían herramientas permitidas en esta sesión; no se accedió a un vault
ni se publicó una nota allí. El lector de Files rechazó la ruta migrada por
su ámbito de proyecto; la revisión del código autorizado se realizó con las
herramientas del workspace. No hubo un fallo de conexión del servidor.
