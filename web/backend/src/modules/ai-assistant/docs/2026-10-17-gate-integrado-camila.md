# Gate QA integrado — actividad compacta y cierre del asistente

Fecha: 2026-10-17. Responsable: Camila, verificación independiente.
**FAIL para deploy.** Hay dos defectos P1 reproducidos en recuperación/cierre.
No se autoriza la publicación funcional del candidato ni se afirma despliegue.
El producto y los archivos de otros responsables permanecen sin cambios.

## Identidad y alcance

Checkout original /var/www/LUXIPANEL, rama real developer, HEAD
46abcb9aed44e78915cf488a9a2050ca8196c482. Los cambios backend/frontend están
directamente en ese checkout: no hay una rama de integración que deba fusionarse.
No se crearon worktrees, copias de fuentes, commits ni pushes; no se ejecutaron
builds, reinicios ni despliegues.

Leídos AGENTS.md, web/CLAUDE.md, ambas ARCHITECTURE.md, README ai-assistant,
docs/changes/README.md y los handoffs vigentes:
- web/backend/src/modules/ai-assistant/docs/continuation-integrity-handoff.md
- web/frontend/src/components/floating-assistant/chat-pane/api-activity.final-integration.qa.md

Las 14 sumas vigentes de esos handoffs coinciden con los archivos actuales.
El manifiesto QA registra 100 archivos modificados/nuevos preexistentes; ninguno
cambió entre su captura y la comprobación anterior a redactar este informe.
Configuraciones TypeScript, dependencias y lockfiles no tienen delta frente a HEAD.
No hay delta en auth, licencia, executor ni middleware de autenticación.

Se descubrieron modules.list y modules.describe; monitor.cpu_top se consultó
mediante modules.read con revisión 2:0. El grafo no ofrecía herramientas
invocables y Obsidian no ofrecía operaciones permitidas: no fue un timeout.
No se realizó ninguna mutación de módulos ni se eludieron sus permisos.
No se pudo registrar la nota opcional en Obsidian.

## Evidencia y comandos ejecutados

Directorio propio e ignorado de artefactos:
web/frontend/.cache/qa-integrated-gate-20261017-camila/
Los archivos summary.json, typecheck-baseline.json y los .txt conservan salidas
y resultados. Los casos independientes están en races.test.ts; los lanzadores
no modifican fuentes, ni la configuración del proyecto, ni evidencia ajena.

Todos los procesos de test/typecheck/navegador se ejecutaron secuencialmente,
con límite de heap 2560 MiB y un trabajador de Vitest.

| Comprobación | Exit | Resultado |
| --- | ---: | --- |
| Typecheck backend | 0 | Sin diagnósticos |
| Suite del área ai-assistant backend | 0 | 99 archivos; 994 aprobadas, 1 omitida; 35,43 s |
| Suite floating-assistant frontend | 0 | 54 archivos; 357 aprobadas, 0 omitidas; 40,03 s |
| Typecheck frontend actual | 2 | 22 diagnósticos |
| Comparación TypeScript HEAD/actual en memoria | 0 | HEAD 26, actual 22, añadidos 0, eliminados 4, diagnósticos en archivos tocados 0 |
| Reproducciones independientes finales | 1 | 1 archivo; 3 fallos, 2 controles aprobados; 1,26 s |
| Chromium sobre fuentes actuales | 0 | 360/1280 px × claro/oscuro; 28 estados + 4 recorridos de archivos; sin pageerror |
| i18n audit | 0 | 12 idiomas, 39 namespaces, 8573 claves/idioma; cero faltantes/extras/tipos/placeholders/vacíos |
| Platform bindings | 0 | Sin dependencias específicas de plataforma |
| git diff --check | 0 | Sin errores de whitespace |

Comandos backend, cwd /var/www/LUXIPANEL/web/backend:

```sh
env NODE_OPTIONS=--max-old-space-size=2560 npm run typecheck
env NODE_OPTIONS=--max-old-space-size=2560 npm test -- src/modules/ai-assistant --pool=threads --maxWorkers=1 --minWorkers=1 --reporter=dot --silent
```

Comandos frontend, cwd /var/www/LUXIPANEL/web/frontend:

```sh
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/components/floating-assistant --maxWorkers=1 --no-file-parallelism --reporter=dot --silent
node --max-old-space-size=2560 node_modules/typescript/bin/tsc --noEmit --pretty false
node --expose-gc --max-old-space-size=2560 scripts/qa-activity-typecheck-baseline.mjs
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node .cache/qa-integrated-gate-20261017-camila/run-races.mjs
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node .cache/qa-integrated-gate-20261017-camila/run-browser.mjs
npm run i18n:audit
npm run check:platform-bindings
```

El intento inicial de Vitest dentro del sandbox no inició tests por caché de
solo lectura; se ejecutó correctamente con el permiso correspondiente.
El comparador también requirió permiso para su subproceso Git.
El primer arranque del lanzador QA propio combinó el include del proyecto y
seleccionó pruebas adicionales; lo detuve (exit 130), corregí solo su filtro
y ejecuté únicamente los casos indicados. Esa ejecución abortada no acredita
una suite global ni se suma a las cifras anteriores.

La única prueba omitida de backend es
src/modules/ai-assistant/services/providers/cli/resource-launch.test.ts:30,
condicionada por LXP_RESOURCE_INTEGRATION=1; no se crearon scopes systemd.
Los rechazos de almacenamiento/proveedor de fixtures y avisos localhost:3000
de tests no son diagnósticos del target ni acreditan el estado del servicio vivo.

## P1 — se pierde el cierre al reconectar con el cursor de la ejecución anterior

Responsables para asignación: Mateo (registry/SSE) y Valentina (reconexión/reducer).
No se envió ninguna delegación ni se modificó implementación.

Referencias del código actual:
- web/backend/src/modules/ai-assistant/services/agent-run-registry.ts:335 reemplaza el buffer anterior; :347 inicia events vacío.
- web/backend/src/modules/ai-assistant/services/agent-run-registry.ts:622 aplica fromSeq al buffer de la ejecución actual; :630 devuelve una suscripción aparente aunque no haya emitido nada.
- web/backend/src/modules/ai-assistant/controllers/agent.controller.ts:327 y :332 esperan un evento terminal o el cierre del socket.
- web/frontend/src/components/floating-assistant/chat-engine.ts:798 envía el lastSeq conservado.
- web/frontend/src/components/floating-assistant/chat-engine/stream-apply.ts:24 descarta toda secuencia menor o igual, sin identificar a qué ejecución pertenece.

Reproducción exacta (proveedor/almacenamiento simulados, registry, drenado diferido
y reducer reales; serialización JSON entre productor y consumidor):
1. Iniciar A con 12 avances y una respuesta; detener su persistencia con una promesa.
2. Desconectar al cliente después de seq=12, antes del terminal; conservar ese cursor.
3. Registrar una continuación con deferQueueDrain y liberar el guardado de A.
4. B reemplaza A en la misma conversación y empieza sus secuencias en 0.
5. Reconectar solicitando desde 13, como hace el controlador al recibir fromSeq=12.

Dos manifestaciones reproducidas:
- Si B ya terminó con dos eventos, attach devuelve una función, B.done=true y
  se reciben **cero eventos**. La espera SSE sin terminal se deduce del controlador
  citado; no se ejecutó HTTP de producción.
- Si B sigue vivo, llegan seq=[0,1], pero el reducer los descarta. La UI conserva
  «Primera respuesta» y queda interrupted=true en vez de adoptar «Segunda respuesta».
  El siguiente intento puede entrar en el caso del buffer terminado.

Impacto: pérdida del cierre visible y de los detalles del siguiente turno después
de una desconexión; no satisface continuidad fiable aunque el servidor haya terminado.
Las funciones de ejecución de A/B se invocaron una vez cada una: **no se reprodujo
duplicación de herramientas**. La prueba de control, reconexión durante persistencia
del mismo run sin sucesor, pasa y recibe exactamente un terminal.

Cobertura faltante: desconexión en onComplete + drenado real de un sucesor +
cursor del predecesor + aplicación frontend, tanto con B vivo como ya terminado.
Las pruebas existentes verifican esas partes por separado.

Criterio de corrección: distinguir ejecución y secuencia o reconciliar de forma
explícita el historial al cambiar de ejecución, sin repetir el prompt ni atribuir
el terminal de B a A. Conservar ambos turnos y sus archivos; nunca dejar un SSE
aparentemente conectado sin forma de completar la recuperación.
El manejo del buffer terminado ya aparece en HEAD; la deduplicación frontend
por seq es nueva. No se atribuye todo el defecto a una sola intervención.

Evidencia: races.test.ts:66 y :79; races-final.txt.

## P1 — una solicitud que no llegó al servidor se sustituye por una respuesta antigua

Responsable para asignación: Valentina.
Referencia: web/frontend/src/components/floating-assistant/chat-engine/stream-apply.ts:321,
especialmente :324–326, y sustitución del historial en :328–333.

Reproducción exacta mediante dispatchSend y resume reales:
1. Cargar una conversación con la solicitud «Comprueba el estado» y su respuesta
   anterior; el run anterior ya no está retenido.
2. Enviar otra vez ese mismo texto. Simular que el POST falla en transporte antes
   de llegar al servidor; el motor conserva cuatro entradas y la nueva respuesta
   queda interrupted=true.
3. Recuperar la conexión: GET stream devuelve legítimamente 204 porque no empezó
   otra ejecución, y REST devuelve el historial anterior de dos entradas.
4. Ejecutar resume: reloadHistory compara solo el texto del último usuario.
   Al coincidir, acepta la respuesta anterior como resultado del turno reciente.

Resultado observado: cuatro entradas pasan a dos, desaparece el turno sin resolver
y queda «Resultado anterior» sin indicador de interrupción. El POST original se
intentó una vez y no se repitió. No se necesita suponer una caché atrasada: esa
respuesta REST es correcta cuando la nueva solicitud no llegó a iniciarse.
El control con un texto distinto conserva las cuatro entradas y la interrupción.

Impacto: falso resultado final y pérdida local de la solicitud pendiente; el usuario
puede creer que se comprobó un estado actual usando información de un turno anterior.
Cobertura faltante: historial con texto repetido + error de envío antes de admisión
+ 204 + rehidratación, con control de identidad/posición del turno.
Criterio de corrección: correlacionar el resultado con el turno real, sin usar
igualdad de prosa como identificación; si falta evidencia, conservar la solicitud
y el resultado no confirmado. Verificar también que no drene continuaciones locales
basándose en ese falso cierre.
El reemplazo de historial existía en HEAD; la nueva guarda por texto es insuficiente.
No se afirma que este comportamiento se haya introducido íntegramente en esta entrega.

Evidencia: races.test.ts:93; races-final.txt (idéntico falla, distinto pasa).

## Typecheck y fallo ajeno: baseline demostrado

typecheck-baseline.json contiene cada diagnóstico con ruta/línea/código/mensaje.
Se compilaron fuentes HEAD en memoria y fuentes actuales con las mismas dependencias
y tipos generados: 1468 raíces HEAD / 1479 actuales. No hubo reset, stash, checkout,
exclusiones, casts nuevos ni copias de fuentes. Los 22 diagnósticos actuales
coinciden exactamente con un subconjunto de HEAD; ninguno está en archivo tocado.
El comparador no usa el viejo typecheck-before.txt como autoridad
(savedHeadersMatch=false refleja cuatro errores ya eliminados).

| Archivo relativo a web/frontend | Diagnósticos |
| --- | ---: |
| src/components/floating-assistant/default-reasoning.test.ts | 1 |
| src/components/workspace/credentials/AgentCredentialFields.tsx | 1 |
| src/components/workspace/credentials/AssistantCredentialSettings.tsx | 1 |
| src/lib/diagnostics/browser.ts | 1 |
| src/scripts/extracted/components/floating-terminal/startup.test.ts | 8 |
| src/scripts/extracted/lib/mail-sudo.ts | 1 |
| src/scripts/extracted/pages/panel/expo/read.test.ts | 1 |
| src/scripts/extracted/pages/panel/hosting/provider-settings.ts | 3 |
| src/scripts/extracted/pages/panel/mail/account-catalog.ts | 1 |
| src/scripts/extracted/pages/panel/mail/index-script1.ts | 1 |
| src/scripts/extracted/pages/panel/users/hosting-templates.ts | 2 |
| src/scripts/extracted/pages/panel/users/role-permissions.ts | 1 |

Además, el arranque QA de selección demasiado amplia mostró un fallo ajeno:
src/lib/assistant-request.test.ts:279, create con agentId/projectId null.
Se aisló y se repitió contra HEAD mediante overlay Vite en memoria:
**actual 10 aprobadas / 1 fallida, exit 1; HEAD 10 / 1, exit 1**, mismo caso y error.
La evidencia de HEAD enumera 29 módulos realmente sustituidos por sus blobs HEAD,
incluidos agent-stream.ts, conversations.ts, team.ts y el test.
El test y vitest.config.ts coinciden con HEAD. Es preexistente, no una regresión
atribuida a este delta, y se mantiene sin corregir por alcance QA.
No se afirma que toda la suite frontend ni el gate global de tipado estén verdes.

```sh
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 npm run test:unit -- src/lib/assistant-request.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
env NODE_ENV=test NODE_OPTIONS=--max-old-space-size=2560 node .cache/qa-integrated-gate-20261017-camila/run-head-triage.mjs
```

Evidencias: extra-test-current.txt y extra-test-head.txt.

## Cobertura integrada ejecutada y límites

Las suites ejecutadas incluyen los seis contratos backend→JSON→frontend actuales,
estados pending/running, verificación fallida/omitida, progreso separado del final,
errores y operación unconfirmed, preguntas/aprobaciones, cancelación, aislamiento
por target/usuario simulado, conservación de artifacts/verify/isolation y ceros,
archivos confirmados y detalles al recargar. No se rebajaron assertions.

Chromium usó componentes/CSS actuales con HTTP/WS simulados, no el sitio publicado.
Se verificaron consola única, respuesta/copiar separada del avance, estados cerrados
visibles, detalles limitados, Enter/Espacio, ARIA, foco y controles de 44 px.
Axe cubrió solo color-contrast, button-name y aria-valid-attr-value; cero infracciones.
No equivale a una auditoría completa de accesibilidad.
Se inspeccionaron visualmente dark-360.png y files-light-1280.png.
El arnés comprueba la ruta enviada al editor, sin leer un archivo de producción.
verification.json declara production=false, success=true, cleanup=true; navegador
y servidor de fixtures cerrados. Los 12 catálogos se comprobaron con audit y tests,
sin acreditar revisión lingüística humana de cada traducción.

No se ejecutaron login real, proveedores externos, persistencia remota real, SSE/REST
del candidato instalado, recorrido completo Astro SPA instalado, permisos reales
de varios usuarios/servidores, systemd físico ni suite completa del monorepo.
No se usó la credencial de pruebas. No se consultaron logs de PM2 como evidencia
del candidato: todavía no se compiló/reinició en esta intervención.

## Notas públicas

Las cuatro notas nuevas pasan JSON, campos title/changes y cantidad 1–8:
- docs/changes/2026-10-17-actividad-compacta-continuidad.json (4 frases)
- docs/changes/2026-10-17-cierre-tareas-asistente.json (3)
- docs/changes/2026-10-17-continuidad-historial-interfaz-asistente.json (4)
- docs/changes/2026-10-17-resumen-compacto-actividad-chat.json (4)

No contienen credenciales, servidores, rutas internas, conversaciones, tareas ni
commits; no prometen despliegue ya realizado. El lenguaje es apto para publicación.
Los comportamientos de UI/estados/archivos tienen cobertura acotada arriba.
La frase de reconexión sin mezclar respuestas de la nota de continuidad **no se
aprueba como garantía general** mientras persistan ambos P1; debe corregirse el
producto o acotarse esa afirmación por su responsable antes de publicar.
No se editaron las notas. Esta QA no cambia producto y no genera nota pública nueva.

## Condiciones de salida y verificaciones posteriores

Antes de habilitar a Andrés: resolver ambos P1, repetir las reproducciones con
aserciones de cierre y conservación de ambos turnos, suites del área y typechecks,
y volver a contrastar notas y huellas del código. Los errores previos de typecheck
deben permanecer identificados; este informe no los convierte en aprobados.

Después de un nuevo gate favorable, solo Andrés realiza los builds serializados
y sus reinicios. Verificar el destino real de dist antes de limpiar Astro;
heap 2560 MiB, un build por máquina, restart posterior, PM2 online y HTTP.
Si cambiara .env bajo PM2, reevaluar ecosystem con --update-env.
No se ejecutó ningún comando de despliegue en esta QA.

En el candidato instalado se debe comprobar:
1. Identidad de revisión/recursos y ausencia de chunks antiguos; no usar UI vieja
   como evidencia del código revisado.
2. Chat general y de agente API/CLI, carga dura y navegación SPA: una consola,
   progreso/final separados, detalle y archivos/diff tras recarga.
3. Desconectar durante persistencia, con sucesor vivo y terminado, y durante un
   envío que no llega; incluir solicitudes idénticas y fallo de lectura de historial.
   Contar ejecuciones en el backend y no repetir mutaciones inciertas.
4. Preguntas, permisos, denegaciones, cancelación, pending y verificación requerida:
   no éxito ficticio ni continuaciones automáticas peligrosas.
5. Cambio de target/usuario y respuestas tardías; validar permisos reales del diff
   y del editor, teclado, móvil/escritorio y los doce idiomas.
6. Logs de ambos procesos desde el arranque, online, HTTP, SSE a través del proxy
   y recuperación tras recarga, documentando cualquier punto no ejecutado.

Resultado entregado: gate QA **FAIL** con evidencia reproducible.
Build/restart/HTTP y publicación siguen pendientes; GitHub lo confirma el panel.
