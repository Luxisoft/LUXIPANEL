<!-- documentation-status-20261013 -->
> **Documento histórico o de planificación.** Conserva propuestas, resultados y límites de su fecha; no acredita el estado ni la publicación actuales. Consultar la [referencia vigente](../README.md) y el código antes de ejecutar sus instrucciones. Clasificado el 13 de octubre de 2026.

# Sesión Expo móvil — 2026-10-04

## Evidencia y límites

El log vivo `/home/panel/luxipanel-native-completion-20261003/metro.log` mostraba `Unable to resolve react-native-reanimated` desde ThemeTransitionProvider. Node resolvía las tres librerías instaladas; Metro había seguido activo desde antes de instalarlas. Se reinició con `--clear`, conservando puerto8081, caché propia y urlRandomness Termv3x.

Bundle Android dev Hermes completo: HTTP200, 4005 módulos. El teléfono solicitó el manifiesto y el bundle real a las15:18 Colombia y recibió200, luego conectó /message y /hot. El usuario informó que seguía fallando. El error exacto en pantalla no fue recibido y `/json/list` no exponía runtime inspeccionable; no afirmar resuelto el fallo del teléfono por éxito del bundle.

La última compilación EAS development disponible era1.0.7-v18, del30junio2026, anterior a las dependencias nativas añadidas. Esto apunta a incompatibilidad del cliente instalado, pero no identifica por sí solo la versión exacta del teléfono. Recargar JS no incorpora módulos nativos. Se generó un cliente nuevo development con las fuentes actuales, que coinciden con los25 hashes de la entrega previa.

Una prueba manual SIN transform.engine=hermes falló por static class blocks en xterm unicode. El manifiesto real usaHermes; con sus parámetros el bundle compila. No se modificó Babel basándose en ese probe.

## Cliente preparado

Cliente Expo development 1.0.11-v30 generado y verificado, build a51e8c41-2008-44d8-9232-39e210e6ef4a. APK /var/www/LUXIPANEL/.cache/mobile-expo-error-20261004/artifacts/LUXIPANEL-Expo-Dev-1.0.11-v30.apk; SHA256 2334e38fce71b8f3d0845fd38357cca4214f7da970958b2bb62442b10a34abc2. Debuggable, firma válida y certificado coincidente con previewv30. Incluye librnskia.so, libreanimated.so y libworklets.so. Mantiene túnel termv3x-luxisoft-8081.exp.direct. Sin cambios de fuentes de ejecución ni publicación en tiendas. Pendiente instalación y confirmación del teléfono.

Descarga: https://expo.dev/artifacts/eas/KEde2bpl8sPB2X3Zg2MZGyUkymVRg7AEAyNqB13bquY.apk

Instalar como actualización del cliente de desarrollo y abrir la misma sesión Expo. Enlace: `exp+lp-license-server-app://expo-development-client/?url=https%3A%2F%2Ftermv3x-luxisoft-8081.exp.direct`.

Este APK es de desarrollo para Metro; el APK previewv30 sigue siendo el artefacto de prueba autónomo. No se publicó en tiendas ni se desplegó frontend/backend/desktop. Las672 pruebas y TypeScript corresponden a las mismas fuentes ya validadas, sin cambios de ejecución en esta intervención.

Evidencia: `.cache/mobile-expo-error-20261004/` (log previo, manifiesto, bundles, comparación de fuentes, petición del teléfono, estado/logEAS y verificación del APK). Firma y librerías comprobadas sobre el archivo descargado; sin pruebas físicas propias del teléfono.
