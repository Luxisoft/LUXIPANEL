<!-- documentation-status-20261013 -->
> **Documento histórico o de planificación.** Conserva propuestas, resultados y límites de su fecha; no acredita el estado ni la publicación actuales. Consultar la [referencia vigente](../README.md) y el código antes de ejecutar sus instrucciones. Clasificado el 13 de octubre de 2026.

# Revisión de solicitudes y carga de LUXIPANEL

Implementación publicada entre el 30 de septiembre y el 1 de octubre de 2026 UTC. Hora local: 30 de septiembre, Bogotá. APIs antes que los clientes. Sin commits ni push. Se conservaron los cambios ajenos y la arquitectura web activa mediante publicaciones selectivas; no se sustituyó producción por todo el árbol de trabajo.

## Comportamiento implementado

| Área | Resultado |
| --- | --- |
| Principal y asistente | Solo el proveedor visible inicia lecturas. Agentes, roles, proyectos, configuración y conectores usan `/api/ai/bootstrap`; compatibilidad con servidores anteriores. |
| Historial | Una petición inicial, 15 conversaciones; cursor estable por identidad, servidor y filtros. Otra página únicamente por desplazamiento real o acción explícita. Sin recorrer automáticamente todo el historial. |
| Grupos | Proyectos/agentes consultan su página al abrir el grupo. Los totales se calculan sobre metadatos autorizados, sin leer los mensajes de cada chat. |
| Apertura | `/messages?include=meta,session,context` reúne mensajes, metadatos, contexto y sesiones. Las tareas de equipo siguen siendo una lectura independiente del chat seleccionado. |
| Búsqueda | Índice persistente incremental de mensajes, reconstrucción en segundo plano, indicador de indexado incompleto en 12 idiomas y reintento explícito. No sondeos automáticos del índice. |
| Caché | Deducción de GET pendientes y caché de 20 s solo para rutas autorizadas explícitamente; claves incluyen sesión, servidor y cabeceras. Mutaciones, logout y cambios de ámbito invalidan; respuestas anteriores se descartan. Datos vivos comparten solo solicitudes pendientes (TTL 0). |
| Recarga web | Bootstrap saneado conserva su expiración original durante 20 s en sessionStorage de la misma pestaña. Cambio de identidad o servidor impide reutilización. No se persisten historiales ni transcripciones. |
| Hosting | Una página inicial de 10 filas, filtro y orden en servidor, resumen y totales completos. Eliminado el bucle de hasta 100 páginas de 100 cuentas. |
| Correo | Página inicial de 10 filas sin uso pesado; uso diferido de la misma página. Filtros/orden/totales autorizados en servidor. Selectores solicitan bajo demanda un catálogo mínimo completo para no limitar sus opciones a la página visible. |
| DataTable | Paginación/filtro/orden externos opcionales; preferencias 10/20/50/100, selección por ID, reinicio al cambiar datos, sin sumas parciales presentadas como totales. |
| Ajustes/conectores | Estado agregado y saneado, sin secretos ni pruebas remotas de cada proveedor; detalles de edición conservan sus endpoints. |
| Iconos/JS | Sustituida la fuente Tabler completa por SVG críticos (~21 KB gzip); iconos raros bajo demanda. Monaco no se precarga en la primera vista; sus assets y Mermaid conservan carga diferida. |
| Android | Historial y grupos por páginas de 15; consultas agrupadas, invalidación y pausa de lecturas en módulos ocultos. Sesiones directas conservan transporte directo. Usuarios y Copias respetan visibilidad. |
| Windows | Asistente directo y administrado con páginas de 15, grupos bajo demanda, bootstrap, apertura agrupada y pausa de lecturas ocultas. Mantiene streams y sesiones. |
| Proxy administrado | Admite rutas completas o relativas y conserva query/cursor después de validar la ruta; mantiene propiedad del servidor. Rechaza escapes de namespace. |

## Revisión del resto de módulos

La revisión extendió la coordinación de lecturas a consumidores de catálogos y tablas mediante el cliente común. Se conservaron los contratos propios de cada módulo:

- Mensajería interna: una lista HTTP, con tres lecturas independientes de repositorio/directorio en paralelo; no una petición por conversación. Mensajes consultados al abrir. Presencia, unread y streams permanecen vivos.
- Usuarios/roles, Copias, Cron, Webhooks, NGINX, Bases de datos, Firewall y Obsidian: lecturas equivalentes autorizadas comparten caché breve; no se precargan APIs de módulos ocultos. Catálogos de recursos del sistema conservan su respuesta completa cuando las acciones y selectores la necesitan.
- Archivos/SQL: apertura y consultas explícitas; no se almacenan lecturas arbitrarias de archivos ni resultados SQL en la nueva caché.
- Monitor: lecturas vivas no se convierten en snapshots de 20 s; la pausa por visibilidad conserva alertas y recursos activos.
- Ajustes, Expo, NGINX, Copias y Obsidian conservan la carga progresiva ya publicada y documentada en `module-loading-2026-09-29.md`.

La paginación en servidor se añadió a las colecciones crecientes identificadas (historial, Correo y Hosting). No se convirtió todo catálogo finito de sistema en una tabla paginada. Esta revisión no representa QA funcional de todas las operaciones de todos los módulos.

## Verificación

Pruebas dirigidas: cursores y ámbito (6), repositorio (24), búsqueda (2), Hosting (1), saneado de conectores (1), Correo/catálogo (4), proxy administrado (35); frontend final (25) y caché web (5); controlador/API/listas Android (50), transporte y apertura (4), desktop API/binarios (5). Los conjuntos se solapan: no sumar como total de casos únicos.

Compilación backend, frontend aislado e i18n de 12 idiomas completadas; TypeScript Android y build TypeScript/Vite/Electron de Windows completados. La comprobación global frontend sigue mostrando errores previos fuera del alcance; no se reporta como aprobada.

Chromium real sobre HTTPS publicado, sesión autorizada temporal y mutaciones bloqueadas: cero errores JavaScript, 179/179 iconos SVG y cero descargas de fuente Tabler. Historial inicial una petición; scroll una siguiente petición con cursor. Una apertura de mensajes/metadatos/contexto/sesión, más tareas de equipo independientes. API: 15 de 604 conversaciones, segunda página sin solapamiento, cursor de otro filtro rechazado (400), bootstrap y estado agregado 200. Correo/Hosting publicados solicitan `page=1&limit=10`; Ajustes solicita el estado agregado al abrir Credenciales. Tokens de QA revocados. Verificados los hashes finales de 650 archivos publicados; nueve módulos adicionales abren sin errores JS. Icono legado `ti-shield-alert` usa alias SVG crítico y no dispara el catálogo completo.

## Mediciones

La comparación final sobre la web publicada, con baseline recuperada de respaldos y recarga **en la misma pestaña**, dio composer frío **7,63→5,28 s**, recarga **1,50→1,27 s**, recursos fríos **1.384.833→737.182 B** (47 % menos) y recarga **124.905→19.831 B**. Cero errores; historial 4→1 peticiones, Tabler 1→0. Evidencia `controlled-same-tab.json`. La ejecución previa con pestañas nuevas conservaba caché HTTP pero no sessionStorage y dio cálido 1,85→2,49 s; se conserva en `controlled-comparison-final.json` para no ocultar la diferencia entre escenarios. La tabla siguiente corresponde a una pasada anterior, no al resultado final.

Misma máquina, proxy HTTP, gzip, Chromium, latencia 150 ms, descarga 1,6 Mbps y CPU ×4. Una pasada por condición; tiempos variables, no equivalentes a la conexión del usuario. Composer significa que el control de chat es visible, no que terminen los streams permanentes.

| Pasada anterior | Anterior | Optimizada |
| --- | ---: | ---: |
| Composer frío | 15,96 s | 7,40 s |
| Composer con caché | 13,59 s | 2,32 s |
| Recursos fríos | 1.347.756 B | 735.713 B |
| Recursos con caché | 129.483 B | 63.025 B |
| Peticiones iniciales de historial | 4 | 1 |
| Fuente completa Tabler | 1 | 0 |

La primera pasada dio composer frío 7,87→5,21 s, pero cálido 1,69→2,65 s; motivó revisar e implementar la conservación acotada de bootstrap. No se garantiza un porcentaje fijo a partir de estas muestras. HTTPS público después de publicar: composer 4,03 s, sin limitación artificial y sin comparación anterior simultánea.

Evidencia: `.cache/performance-v2/controlled-comparison{,-first}.json`, `qa-published.json`, `qa-functional.json`, `qa-modules-published.json`, `qa-all-modules-published.json` y registros de pruebas. No copiar logs privados EAS o credenciales a informes públicos.

## Publicación y recuperación

- LUXIPANEL API: `.cache/performance-v2/backend-publication.json`; ampliación de catálogo Mail: `round2/backend-publication.json`.
- Proxy LP-LICENSE-SERVER: `proxy-publication.json`.
- Web: `web-publication.json`, `web-scroll-publication.json`, `web-scroll-versioned-publication.json`, `web-common-publication.json`, `web-icon-publication.json`. Assets primero, SSR al final, verificación de hashes anteriores, respaldo, restart PM2 y salud. Conservar assets antiguos para pestañas abiertas. La corrección de scroll maneja offsets negativos de listas invertidas.
- Windows 1.0.4: canal existente `https://api.luxisoft.com/public/desktop/download/windows/1.0.4`. SHA-256 `d2b0f68d35768b181106e1a0693c07926177b05ab21e8ac6540a6e30e49f35b8`, 143.853.079 bytes. Upload verificado, cambio de latest en transacción y descarga pública con hash comprobado. Release previa solo Windows; 1.0.3 conservada. Evidencia `windows-publication.json`, `windows-download-check.json`.
- Android **1.0.9/24**: APK EAS terminado y verificado; manifiesto `com.luxisoft.lxpanel`, firma v2 válida y certificado idéntico a 1.0.8. SHA-256 `e3c5fa8605b928fcc9e7f8124cce05a7098d93dc85d34509248a9d742491470a`, 172,192,418 bytes. Registrado como `app-preview/success` en el canal administrativo existente. [Instalación/QR](https://expo.dev/accounts/luxisoft/projects/lp-license-server-app/builds/b2ed0991-6d4d-41fb-ba41-451b97d59f4f). Evidencia `android-publication.json`. Versiones de app.json y desktop/package.json actualizadas tras verificar artefactos. Sin Play Store/iOS.

Para revertir, comprobar primero hashes activos y cambios posteriores. Restaurar archivos existentes desde los backups de cada manifiesto en orden inverso (iconos, cliente común, scroll versionado, scroll, web; Mail, API; proxy), reiniciar el proceso afectado y comprobar salud. Assets nuevos pueden conservarse. Para Windows, volver a marcar latest la release anterior en una transacción; no eliminar artefactos ni versiones. Los scripts de publicación no son idempotentes frente a cambios posteriores: no ejecutarlos de nuevo sin nueva baseline.

No se realizaron pruebas físicas en Android ni Windows; la comprobación de paquete/firma/hash no reemplaza esas pruebas.
