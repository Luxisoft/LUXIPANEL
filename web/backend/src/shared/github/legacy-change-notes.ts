// SPDX-License-Identifier: AGPL-3.0-only
import type { PublicChangeNote } from "./change-notes.js";
/** Reviewed descriptions of public changes made before explicit update notes existed.
 * Keys match exact commits; notes are shown only if that commit belongs to the selected history.
 * Empty entries are test-only changes, without a new user-facing feature.
 */
export const legacyChangeNotes: Record<string, PublicChangeNote[]> = {
  "ce4c6e9fb0a6c0a25b3c0bc4a04800f0d2054dbe": [{ title: "Avisos centrados en las actualizaciones", changes: ["El botón de versiones deja de mostrar avisos de actividad de la comunidad y señala únicamente versiones o cambios pendientes de instalar."] }],
  "43e0e40db8ed7651a97ec0b326f83d3ce6821218": [{ title: "Versiones y ramas en un mismo lugar", changes: ["Puedes elegir una rama desde el panel de versiones, revisar sus novedades y actualizar cuando lo decidas.", "Los avisos usan un color por rama y disponen de una ayuda para identificarlo.", "Las notificaciones de nuevos cambios abren directamente la rama correspondiente."] }],
  "6aff768fdb6c6a7daae0fbf10ba6096feb9cbc92": [{ title: "Aportes del asistente sobre el proyecto original", changes: ["Los nuevos turnos trabajan en el proyecto original sin crear una copia separada para cada conversación.", "El envío automático conserva los cambios de cada tarea y detecta conflictos entre trabajos simultáneos."] }],
  "aa9f83d40951f8b6104271a3348f7ac8e9032a74": [{ title: "Acceso directo a tus servidores", changes: ["Las sesiones que acceden directamente a un servidor pueden administrarlo sin vincular una cuenta de GitHub.", "Publicar aportes sigue requiriendo una identidad verificada."] }],
  "3589f4bf040096b529775c2bf9e9edd1a8f57be2": [{ title: "Elegir al agente desde el chat", changes: ["El selector del compositor muestra el puesto y el nombre de cada miembro del equipo.", "Al elegir un agente, el menú lateral filtra sus conversaciones y mantiene la organización por proyectos y subproyectos."] }],
  "c394ec9f41f8b7f5f551b13cd9bcaf1342c5114e": [{ title: "Delegaciones que respetan el contexto del trabajo", changes: ["Los agentes delegados conservan el directorio de trabajo y el modo de aprobación de la tarea original."] }],
  "b7150ce21e483cf0df17ab7568bbe552ff48d702": [],
  "c4bc504571c4cb6442ed0880b041060bf3a4fc34": [],
  "7704685b0bdf8b815c1f834ef27da249cfd4e694": [{ title: "Continuidad de las conversaciones con agentes", changes: ["Se mejora el cambio entre conversaciones de los agentes y la conservación de su contexto.", "Los aportes de tareas delegadas esperan la verificación del trabajo antes de publicarse."] }],
  "4d5c403c1f3327272b7cc2955ec2285fbbc283ec": [{ title: "Mejoras del asistente y los aportes automáticos", changes: ["Se incorporan mejoras del chat y la interacción por voz en los clientes de LUXIPANEL.", "Los cambios del propietario pueden guardarse y enviarse automáticamente, conservando su atribución y las comprobaciones de publicación."] }],
  "b82d457e0fa432c6073bb6e99fba1c1d40758423": [{ title: "Correcciones al publicar sitios estáticos", changes: ["Se corrige la preparación y entrega de las vistas previas de sitios estáticos.", "Se refuerzan las comprobaciones previas a publicar una versión."] }],
  "0e1f8cd4692b8289f06736a3c43a5053c193acfc": [{ title: "Configuración de GitHub más fiable", changes: ["Se reconocen correctamente las operaciones de configuración que GitHub confirma sin devolver contenido."] }],
  "06c4a5508ce8b46efb2cb75f4987b486753856f4": [],
  "60dc5fb2b91e359fb6c2be1eea65357c13482b0d": [{ title: "Primera versión pública de LUXIPANEL", changes: ["La versión 2.0.3 reúne el panel web, el cliente de escritorio y la aplicación móvil.", "Las actualizaciones manuales conservan la configuración del servidor y el estado de sus módulos."] }],
  "1653ca3592284489a120c6da4829fdc0422d4e45": [{ title: "Editor de credenciales disponible", changes: ["La distribución incluye los componentes necesarios para mostrar el editor de credenciales."] }],
  "1a1dba583dcdfa55c04b1ae49a9d3867a75c1182": [{ title: "Instalaciones completas desde una compilación limpia", changes: ["Se incluyen los archivos auxiliares que necesitan las funciones del panel para ejecutarse correctamente."] }],
  "f65300bde882195d1ff6fa46e7c5a34a1ebcafa1": [],
  "e8d3a53786bbb7394a85d7b883629ab91b64ba0b": []
};
