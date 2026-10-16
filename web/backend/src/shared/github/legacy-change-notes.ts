// SPDX-License-Identifier: AGPL-3.0-only
import type { PublicChangeNote } from "./change-notes.js";
/** Reviewed descriptions of public changes made before explicit update notes existed.
 * Keys match exact commits; notes are shown only if that commit belongs to the selected history.
 * Empty entries are test-only changes, without a new user-facing feature.
 */
export const legacyChangeNotes: Record<string, PublicChangeNote[]> = {
  "57b29f8debd38687b18f02fc58fb99044655487a": [{ title: "Avisos centrados en las actualizaciones", changes: ["El botón de versiones deja de mostrar avisos de actividad de la comunidad y señala únicamente versiones o cambios pendientes de instalar."] }],
  "87d993db14a2f411a687e70a326a4123dfdcecf7": [{ title: "Versiones y ramas en un mismo lugar", changes: ["Puedes elegir una rama desde el panel de versiones, revisar sus novedades y actualizar cuando lo decidas.", "Los avisos usan un color por rama y disponen de una ayuda para identificarlo.", "Las notificaciones de nuevos cambios abren directamente la rama correspondiente."] }],
  "701d6aacbc0dbaf3113a7bea7665c981c7c2e3d2": [{ title: "Aportes del asistente sobre el proyecto original", changes: ["Los nuevos turnos trabajan en el proyecto original sin crear una copia separada para cada conversación.", "El envío automático conserva los cambios de cada tarea y detecta conflictos entre trabajos simultáneos."] }],
  "60f0ed9291595a04844c346172ea666ce4cb15b7": [{ title: "Acceso directo a tus servidores", changes: ["Las sesiones que acceden directamente a un servidor pueden administrarlo sin vincular una cuenta de GitHub.", "Publicar aportes sigue requiriendo una identidad verificada."] }],
  "ae32cd8aed632e45d1f61bd686742bdc8ae45f72": [{ title: "Elegir al agente desde el chat", changes: ["El selector del compositor muestra el puesto y el nombre de cada miembro del equipo.", "Al elegir un agente, el menú lateral filtra sus conversaciones y mantiene la organización por proyectos y subproyectos."] }],
  "15b44945d5fc5046668d4aabce7e6604703569cf": [{ title: "Delegaciones que respetan el contexto del trabajo", changes: ["Los agentes delegados conservan el directorio de trabajo y el modo de aprobación de la tarea original."] }],
  "e31171be0c6110602af58277aebce35ec10e1d45": [],
  "c1a4067ae21f773f3711f3e04d3337328872d1f2": [],
  "d2bba882d079c30f651c51a6cc324cc1720fe0f8": [{ title: "Continuidad de las conversaciones con agentes", changes: ["Se mejora el cambio entre conversaciones de los agentes y la conservación de su contexto.", "Los aportes de tareas delegadas esperan la verificación del trabajo antes de publicarse."] }],
  "b1ff7115744e525b7244794948555b41d4b884b6": [{ title: "Mejoras del asistente y los aportes automáticos", changes: ["Se incorporan mejoras del chat y la interacción por voz en los clientes de LUXIPANEL.", "Los cambios del propietario pueden guardarse y enviarse automáticamente, conservando su atribución y las comprobaciones de publicación."] }],
  "b82d457e0fa432c6073bb6e99fba1c1d40758423": [{ title: "Correcciones al publicar sitios estáticos", changes: ["Se corrige la preparación y entrega de las vistas previas de sitios estáticos.", "Se refuerzan las comprobaciones previas a publicar una versión."] }],
  "7a0bcac1bc8909bac1779f9eac958bfd45619a42": [{ title: "Configuración de GitHub más fiable", changes: ["Se reconocen correctamente las operaciones de configuración que GitHub confirma sin devolver contenido."] }],
  "867a1b573658ab9489f5ccfa667a5ef5b100be20": [],
  "7a763f202c041fb6178edcbf885d36819428fa9f": [{ title: "Primera versión pública de LUXIPANEL", changes: ["La versión 2.0.3 reúne el panel web, el cliente de escritorio y la aplicación móvil.", "Las actualizaciones manuales conservan la configuración del servidor y el estado de sus módulos."] }],
  "1c558e204d6f644fb88c4daa8d4b4423cddeb456": [{ title: "Editor de credenciales disponible", changes: ["La distribución incluye los componentes necesarios para mostrar el editor de credenciales."] }],
  "e192e47eb616675b3e4a39127df36f06c87418d5": [{ title: "Instalaciones completas desde una compilación limpia", changes: ["Se incluyen los archivos auxiliares que necesitan las funciones del panel para ejecutarse correctamente."] }],
  "8d01ece934bae242d8c17f6b90db09adb2be4b4b": [],
  "39217fe8aaa39ee4d57a1e3aef15e01fe5a1de78": []
};
