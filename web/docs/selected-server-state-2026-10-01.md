<!-- documentation-status-20261013 -->
> **Documento histórico o de planificación.** Conserva propuestas, resultados y límites de su fecha; no acredita el estado ni la publicación actuales. Consultar la [referencia vigente](../README.md) y el código antes de ejecutar sus instrucciones. Clasificado el 13 de octubre de 2026.

# Estado por servidor seleccionado — 2026-10-01

## Alcance y resultado

Revisión de las secciones de LUXIPANEL solicitadas: notificaciones, configuración de módulos, proveedores IA CLI, estadísticas, configuración global, cachés y ejecuciones. La selección del lateral izquierdo determina el executor de las APIs autenticadas y de los comandos remotos.

Se corrigieron lecturas y escrituras ancladas al host del panel, conexiones sin la cabecera de la pestaña y registros de ejecuciones que compartían únicamente el ID de conversación. Los cambios se publicaron el **2026-10-01 a las 10:21 (America/Bogota)**, después de que el usuario solicitara el despliegue.

| Sección | Estado comprobado y cambios |
| --- | --- |
| Notificaciones | Historial, contador, lectura, borrado, preferencias de entrega y logs usan el executor del servidor. SSE filtra por servidor y destinatario. La campana envía la conexión de la pestaña tanto en HTTP como en el transporte SSE mediante `fetch`, limpia su estado al cambiar de servidor y descarta respuestas antiguas. |
| Configuración de módulos | Activación, orden, visibilidad y acceso HTTP/WS se consultan en el servidor seleccionado. Se retiraron los cambios de contexto al host del panel en las rutas de administración, `/api/me/modules`, módulos instalados, conectores, herramientas IA y configuración de caché. El catálogo estático continúa siendo código de la instalación. |
| Proveedores IA CLI | La configuración de proveedor está aislada por servidor y usuario; la comprobación del binario y los comandos CLI ya reciben el executor seleccionado. Se comprobó el aislamiento de configuración y uso con los repositorios reales. |
| Estadísticas | Uso de IA, cuota CLI y métricas de Monitor consultan el executor del servidor. El acceso WS de Monitor comprueba la activación del módulo en ese mismo destino. |
| Configuración global | Lectura, escritura y borrado pasan el executor explícito a `settingsRepository` y al archivo de configuración del servidor. Las imágenes nuevas de marca remota se guardan en `${LUXIPANEL_CONFIG_DIR}/branding`; sus previews autenticados incluyen la conexión y verifican el destino. |
| Cachés | Programación y métricas persistentes de cache-engine usan los archivos del servidor; su activación hereda la configuración de módulos de ese destino. Los contadores de notificaciones y las cachés efímeras de respuesta incluyen el servidor en la clave. |
| Ejecuciones | Los comandos CLI se ejecutan mediante SSH en el destino. El registro de turnos, suscripciones, parada, prompts de aprobación y trabajos CLI separa servidor e ID. Los feeds y eventos de progreso de tareas filtran el servidor. Recuperación MCP verifica destino y propietario; una conexión HTTP explícita vencida produce `BRIDGE_SESSION_REQUIRED`, sin consultar el servidor de la cookie. |

## Dónde sigue corriendo el panel

El proceso Node de LUXIPANEL coordina las APIs, SSE/WS y registros de ejecuciones. Las cachés breves de respuesta y esos registros viven en su memoria, separados por servidor. Los archivos persistentes de las secciones anteriores y los procesos CLI pertenecen al destino. La inferencia API se realiza en el proveedor IA elegido.

El vault de conexiones, las identidades del panel, los registros de dispositivos y VAPID siguen siendo infraestructura de la instalación del panel. El login utiliza su marca pública; el workspace autenticado utiliza los ajustes del servidor conectado.

## Validación ejecutada

- **Backend:** 249 pruebas aprobadas en 19 archivos, incluidas permisos HTTP/WS, módulos, notificaciones, configuración, cachés, estadísticas CLI, registro de turnos, recuperación MCP, aprobaciones y tareas de equipo.
- **Frontend:** 20 pruebas aprobadas en 6 archivos, incluidas campana, transporte SSE, cambios de servidor, respuestas atrasadas, previews de marca y cuota CLI.
- `pnpm exec tsc --noEmit` en backend: aprobado.
- Compilación esbuild de los cuatro scripts afectados: aprobada en `/tmp/luxipanel-server-scope-build`; comprobación de sintaxis del registro de builds aprobada.
- La prueba de aislamiento usa dos executors simulados con los repositorios reales. Incluye IDs de conversación y de trabajo CLI idénticos en ambos servidores y comprueba que parar, escribir o aprobar en uno no modifica el otro.
- Las pruebas HTTP requirieron salir del sandbox para abrir sus puertos locales; la ejecución final aprobó las 249 pruebas.

Logs finales: `/tmp/luxipanel-server-scope-backend-final.log` y `/tmp/luxipanel-server-scope-frontend-final.log`.

## Estado operativo y límites

### Despliegue y comprobaciones

- Publicación selectiva de **30 archivos del backend y 9 del frontend**, conservando el resto de los artefactos activos. Las bases de los 23 archivos con respaldo previo coincidían con producción; las otras diferencias se revisaron antes de publicar.
- Los dos servicios del panel se detuvieron durante el reemplazo y se reiniciaron con su configuración existente. `luxipanel-backend` y `luxipanel-frontend` quedaron `online`; los PID de los demás servicios administrados por PM2 se conservaron.
- Se verificaron sintaxis, imports y exports del backend, dependencias de navegador y hashes antes de publicar. Los scripts nuevos usan URLs con hash y conservan el adaptador API compartido de la versión activa.
- Salud local de API y login: **200**. Módulos instalados sin sesión: **401**. Los siete scripts publicados: **200**.
- **13 comprobaciones HTTPS aprobadas** en `https://backend.luxipanel.com`: salud, login, rutas protegidas de módulos y marca, layout público y siete scripts. El contenido descargado de cada script coincide por SHA-256 con el artefacto publicado.
- Cloudflare devuelve `403 / 1010` al agente de usuario de Python; la verificación con agente de navegador respondió correctamente. Una descarga tuvo una interrupción de red y aprobó al repetirla.
- Los servicios conservaron sus PID tras las comprobaciones posteriores y los logs revisados no contenían errores fatales de sintaxis, imports o puerto ocupado.

Respaldo y manifiesto de reversión: `.cache/selected-server-scope-release/backup-2026-10-01T15-21-21-120Z/`. Evidencia: `.cache/selected-server-scope-release/publication.json`, `public-smoke.json`, `backend-manifest.json` y `frontend-manifest.json`.

### Incidente de conexión comunicado después del despliegue

El usuario comunicó `ERR_CONNECTION_TIMED_OUT`. Al revisar a las 12:49–13:07, el dominio `backend.luxipanel.com`, API, frontend y Nginx respondían. Los registros mostraron errores 500 de estadísticas/recuperación coincidentes con el cierre de una sesión SSH mientras quedaban peticiones en curso.

Una comprobación con una sesión de prueba cuyo bridge había vencido reprodujo el cierre de la conexión y la terminación del proceso backend: el rechazo asíncrono de autenticación no llegaba al manejador de errores. Se corrigieron dos puntos:

- `getExecutor` / `getExecutorAsync` responden con el error tipado `BRIDGE_SESSION_REQUIRED` (HTTP 428) cuando desaparece el executor o su material SSH. No se sustituye el destino por el host local.
- Los cuatro middlewares de sesión capturan sus rechazos asíncronos y los entregan a Express mediante `next(error)`, también cuando un gate delegado ignora la Promise.

Publicación puntual del factory y middleware, reiniciando únicamente `luxipanel-backend`; frontend y demás procesos conservaron sus PID. **22 pruebas dirigidas** y `tsc --noEmit` aprobados. Las cuatro comprobaciones HTTP de bridge de cookie/pestaña vencido devolvieron 428, sin terminar el backend; los tokens de prueba se revocaron. Chromium abrió el login público con 200, formulario visible, FCP de 296 ms y sin errores JS ni recursos fallidos. La comprobación final HTTPS dio 200 para inicio/login/salud y 401 para módulos sin sesión, con los servicios estables tras las pruebas de expiración.

Evidencia y respaldo de esta corrección: `.cache/connection-timeout-20261001/` (`before/`, manifests/publicaciones `factory-*` y `auth-*`, `expired-bridge-smoke.json`, `browser-smoke.json`, `final-smoke.json`). La URL exacta que mostró el timeout no se recibió; no se afirma que toda ruta o red del usuario esté verificada.

### Validación pendiente

No se ejecutó QA autenticado de todos estos módulos contra otro servidor SSH real. Falta validar disponibilidad de CLI, cache-engine y cambios de servidor en ese entorno. La comprobación posterior del logo de ATS por SSH real se detalla abajo; los tests generales de aislamiento usan executors simulados con repositorios reales.

No se copió automáticamente el estado global antiguo del host a los destinos: los datos sin identificación fiable de servidor no pueden atribuirse de forma segura. Un destino sin configuración propia utiliza sus valores iniciales.

Se preservó el trabajo local preexistente. El checkout contiene numerosas modificaciones de otras sesiones, por lo que se prepararon candidatos aislados y se publicó únicamente el conjunto revisado.

La campana, antes mantenida únicamente en `public/scripts`, tiene ahora fuente en `src/scripts/extracted/layouts/notifications.js` y una entrada en `scripts/build-extracted.mjs`, junto con `notification-event-stream.ts`. Sus imports de Astro y los de configuración usan la nueva versión `20261001-server-scope`.

## Logo remoto que desaparecía al volver a ingresar

Diagnóstico confirmado en **ATS**: su configuración persistida `layout_logo` referenciaba `/branding/304f1ba48ecf267457b46a59cfaf62a7.png`, pero el archivo no existía en sus directorios de marca. La imagen de 11.936 bytes estaba únicamente en `public/branding` y `dist/client/branding` del panel A. La aplicación directa de esa URL en el navegador podía mostrar la copia de A durante la sesión; al volver, el layout remoto intentaba leer el archivo en ATS y devolvía 404.

Se recuperó el archivo exacto en `/etc/luxipanel/branding/` de ATS, después de comprobar la referencia vigente y la ausencia del destino. No se sobrescribió ningún archivo ni se modificó la configuración. La lectura posterior por SSH coincidió con el SHA-256 original: `e2c40fa327e856313ddca0bc81fdaa358de675bb499787eaeedaee16fb450862`. La corrección previa de uploads ya guarda las nuevas imágenes en el servidor seleccionado.

Cambios del frontend publicados el **2026-10-01 a las 13:48 de Bogotá**:

- Logos e iconos remotos se recuperan mediante fetch con el bridge de la pestaña y se presentan como URLs de objeto; la configuración conserva su ruta canónica.
- Los previews en Ajustes conservan explícitamente el servidor de su mapa y no utilizan la ruta estática de A para un upload remoto.
- El render SSR reenvía la cabecera del bridge y separa su caché por conexión. Las respuestas de imágenes que llegan después de cambiar servidor o conexión se descartan.
- Publicación selectiva de siete artefactos; únicamente se reinició el frontend. Backend y demás procesos conservaron sus PID.

Verificaciones: **38 tests frontend en seis archivos**; lectura de configuración y bytes mediante los controladores publicados con **dos conexiones SSH nuevas reales a ATS**; Chromium con dos contextos nuevos tanto antes como después de publicar; diez comprobaciones de salud/HTTPS/hash y servicios estables. La prueba de navegador usa una página y respuesta API controladas con los bytes previamente leídos de ATS y los scripts reales publicados; no sustituye una prueba de login interactivo del usuario de principio a fin.

Evidencia, scripts y respaldo: `.cache/remote-logo-20261001/` (`inspection.json`, `recovery.json`, `fresh-connections.json`, `browser-published.json`, `manifest.json`, `publication.json`, `final-smoke.json`, `backup-2026-10-01T18-48-55.876Z/`). Se recuperó únicamente la imagen cuya atribución a ATS se comprobó en su propia configuración.
