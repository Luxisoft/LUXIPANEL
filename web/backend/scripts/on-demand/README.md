# Backend bajo demanda

El socket de systemd conserva el puerto. Node recibe ese mismo descriptor y
termina tras 60 segundos sin trabajo. Se conserva la dirección IP del cliente,
el cuerpo original y las conexiones HTTP, SSE y WebSocket. Las tareas aceptadas
por los asistentes, backups y correo mantienen una reserva hasta finalizar.
Una conexión abierta mantiene su API activa: no se corta para ahorrar memoria.

Los wrappers de procesos conservan `util.promisify.custom`, `{ stdout, stderr }`
y `promise.child` de Node, también al reservar trabajo para comandos asíncronos.
La prueba real de activación comprueba ese contrato después de cargar el preload.

`units.mjs` prepara configuraciones y entornos privados a partir de PM2.
`switch-pm2.mjs` verifica un arranque real antes de retirar la entrada de PM2 y
restaura la configuración anterior si falla. Los secretos no pertenecen al repo.
`restart-app.mjs` reinicia el gestor correspondiente; una API inactiva conserva
su socket sin arrancar innecesariamente.

## Trabajos

`dispatcher.mjs` escucha PostgreSQL y cambios de la cola de archivos. Recupera
pendientes al arrancar y usa espera progresiva ante falta de recursos. No sondea
colas vacías. Los ejecutores viven en unidades independientes y continúan si
se reinicia el coordinador. Conservan las opciones de Node del proceso original
y leen los valores por defecto de `.env` al ejecutarse.

Los trabajos tienen límites individuales y el grupo `backend-jobs.slice` tiene
3 GiB de memoria máxima y una CPU. Se reserva memoria disponible del host antes
de admitirlos. La compilación y renderizado local comparten
`/run/lock/luxipanel-assistant-build.lock`; en este host el antiguo
`luxisoft-heavy-build.lock` apunta a él. Una espera a un proveedor de imágenes
o vídeo usa su propio candado. No reemplazar un candado ocupado ni lanzar otra
copia de un ejecutor que ya está trabajando.

`install-store.mjs`, `install-license.mjs` e `install-whatsapp.mjs` conservan las
tareas existentes mediante temporizadores finitos. Se deben instalar los
ejecutores compilados y validar sus consultas antes de usar `--activate`.
Una instalación con el antiguo candado de compilación debe migrarlo sin trabajo
activo; el instalador rechaza una sustitución silenciosa de ese candado.

## Panel

`resource-scan.ts` comprueba metadatos con los ejecutores del servidor correcto.
No importa proveedores de IA ni la API. Deposita eventos completos y durables;
`panel-clock-client.mjs` despierta la API para ejecutarlos. La capacidad privada
solo acepta eventos existentes, nunca órdenes ni credenciales de destinos.

Los eventos pasan por `pending`, `running` y `done`. Una ejecución interrumpida
queda en `needs-review`, porque repetir un envío externo podría duplicarlo.
Los recibos completados se conservan siete días. Los pendientes y los casos que
necesitan revisión no se borran automáticamente.

Las estadísticas se recogen al ver el monitor o cuando hay alertas habilitadas.
El historial de logs usa eventos del sistema de archivos y conserva las rutas
de logs anteriores. La migración diferida del panel espera conexiones y trabajo
existentes, verifica el arranque, activa su reloj y se deshabilita sola. Ante un
fallo se detiene para evitar ciclos de reinicios.

## Operación y reversión

Estado: `systemctl --user list-sockets 'backend-demand-*'`,
`systemctl --user list-timers 'backend-clock-*'` y
`systemctl --user list-units 'backend-job-*'`.
Un servicio inactivo con su socket activo es el estado esperado en reposo.

Los recibos y configuraciones anteriores quedan en el directorio privado de la
implementación. Para volver a PM2 se usa la configuración de una aplicación,
se drena su trabajo y se desactiva su socket antes de liberar el puerto. No usar
`pm2 resurrect` con el inventario completo: reintroduciría procesos retirados.
No revertir los manejadores de webhooks con eventos pendientes o ejecutándose,
ni borrar sus tablas o los estados privados de informes.

RealityOS conserva imágenes, volúmenes y configuraciones anteriores en recibos
privados y contenedores detenidos. Su despliegue debe aplicar el overlay generado
por `preserve_backend_runtime.py`, que conserva el socket del proxy, los límites
y `restart: no`. Verificarlo por el proxy en `8090`; no usar `compose start` a
ciegas, pues los contenedores de reversión también permanecen detenidos.
