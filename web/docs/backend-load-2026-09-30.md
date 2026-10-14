<!-- documentation-status-20261013 -->
> **Documento histórico o de planificación.** Conserva propuestas, resultados y límites de su fecha; no acredita el estado ni la publicación actuales. Consultar la [referencia vigente](../README.md) y el código antes de ejecutar sus instrucciones. Clasificado el 13 de octubre de 2026.

# Carga del backend: autenticación por módulo

Se acotaron los middleware de sesión de siete routers montados en la raíz:
Correo, Usuarios/Grupos/Preferencias, Dashboard, Sudo, Notificaciones,
Mensajería y Jobs. Antes ejecutaban `requireAuth` incluso cuando la petición
pertenecía a otro módulo. Cada pasada verificaba JWT/Redis, resolvía bridge y
executor y comprobaba la autorización actual.

Según el orden de registro de `server.ts`, una petición de Mensajería atravesaba
seis puertas de sesión; ahora llega únicamente a la de Mensajería. Jobs pasaba
por siete. Se mantiene la validación actual de permisos en la puerta del módulo
que atiende la petición, además de los controles de acción, tenant y CSRF.
MCP ya está montado en `/api/mcp` y no necesitaba este cambio.

Verificación: 91 pruebas en seis archivos y `pnpm exec tsc --noEmit` aprobados.
El test `router-auth-scope.test.ts` utiliza los routers reales y un adaptador
de sesión simulado: comprueba todas las rutas/métodos registrados, rechaza
anónimos, verifica fallthrough y límites de prefijo, y demuestra una sola
resolución para un stream autenticado de Mensajería con controlador simulado.
No es una medición de latencia autenticada de producción.

Para preparar los siete JS y manifiesto de hashes, desde `backend`:

```sh
node scripts/build-auth-scope-release.mjs
```

Salida: `.cache/backend-auth-scope/release`. No modifica `backend/dist`.
Antes de publicar, comprobar las huellas de los siete archivos activos,
respaldarlos, aplicar solamente estos artefactos y reiniciar el backend con
su gestor real. Verificar salud y rutas privadas, conservando reversión.

Publicado el 2026-09-30 a las 23:03:58 UTC. PM2 estaba instalado en
`/home/panel/.npm-global/bin/pm2`, fuera del PATH de la sesión; la conclusión
inicial de que faltaba acceso operativo era incorrecta. Se verificó que su
proceso activo ejecuta `backend/dist/server.js` y se aplicaron exclusivamente
las siete líneas de autenticación sobre los artefactos activos, con guardas
de hashes y respaldo. Reinicio de `luxipanel-backend` correcto, salud y login
HTTP 200, siete rutas privadas HTTP 401 y hashes publicados correctos.

Evidencia: `.cache/backend-auth-scope/publication.json`. Respaldo:
`.cache/backend-auth-scope/backup-1790809434476`. Publicación con reversión:
`backend/scripts/publish-auth-scope-release.mjs`; no repetir después de publicar
sin preparar una nueva base. No se midió aún una sesión autenticada real para
cuantificar la mejora de latencia. No se conoce por qué terminó la sesión
anterior; frontend v10 y carga progresiva previas ya se habían publicado.

## Medición de la página principal y candidato pendiente

El usuario confirmó 16,7 segundos en `https://backend.luxipanel.com/`.
La medición pública con Chromium y una sesión temporal válida encontró cinco
panes de proveedor montados al entrar, diez consultas de agentes, diez de roles,
cinco de conectores/proyectos y lecturas repetidas y paginadas de conversaciones.
El HTML respondió en unos 76 ms y el composer apareció a los 1,08 s desde este
host: esa conexión no reproduce la demora comunicada por el usuario.

Se encontró el trabajo anterior en `.cache/load-performance`, preparado a las
17:16 local y todavía sin publicar. Se verificaron sus fuentes/huellas y se
publicó únicamente la parte de la página principal a las 23:34:33 UTC: cuatro
assets nuevos y manifest SSR. Abre primero el proveedor visible, conserva los
visitados, comparte lecturas durante dos segundos por ámbito, entrega el
historial por páginas y coordina una sola reparación diferida. No se aplicaron
los candidatos de Usuarios/Monitor de ese paquete.

Comparación controlada mediante proxy local al SSR/API reales, Chromium,
descarga 1,6 Mbps, latencia 150 ms y CPU ×4:

| Medida | Activo anterior | Candidato |
| --- | ---: | ---: |
| Composer visible | 8,14 s | 7,77 s |
| Última lectura de catálogo/historial terminada en la ventana medida | 19,80 s | 10,84 s |
| Recursos transferidos en la ventana de observación | 3,68 MB | 1,82 MB |
| Lecturas de agentes/roles/conectores/proyectos | 10/10/5/5 | 1/1/1/1 |

Son mediciones simuladas de red/CPU, no los tiempos de la conexión del usuario.
El proxy bloqueó todas las mutaciones; no se ejecutó reparación real ni agente.
El proxy no comprimió las respuestas API, por lo que sus bytes no equivalen
exactamente a los transferidos por el HTTPS de producción. Los streams de
notificaciones/mensajería permanecen abiertos; su duración no equivale a espera
del chat. Persisten costes de assets: fuente Tabler completa ~457 KB y bundle
principal ~239 KB comprimido en HTTPS.

38 pruebas focalizadas, TypeScript acotado y sintaxis pasan. La prueba pública
posterior no tuvo errores JS: primer HTML tras reiniciar frontend 3,22 s,
composer 3,94 s; siguiente navegación HTML/DOM 0,73 s y composer 1,08 s. Recursos
observados 1,39 MB en frío y 0,12 MB con caché; el diagnóstico anterior observó
2,09 MB y 0,85 MB, respectivamente. Los tokens temporales se revocaron y no se
almacenaron. Falta confirmar el tiempo observado por el usuario tras recargar.

Informes: `.cache/load-performance/network-comparison.json`,
`.cache/backend-auth-scope/page-timing.json` y
`.cache/load-performance/home-publication.json`. Respaldos y hashes figuran en
el último. `publish-home.mjs` comprueba fuentes/manifest/artefactos y conserva
los assets anteriores; no repetir sobre otra publicación sin rebasar.
