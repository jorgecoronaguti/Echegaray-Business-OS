// P0 (jul-2026) — Guardarraíles de EDICIÓN de documentos. Nacen de 3 reclamos concretos del
// dueño sobre el chat editando Sheets: (1) inundaba de color, (2) ignoraba "sin gráficos",
// (3) cantaba "listo" sin verificar. Esto NO sube el costo de API: son heurísticas 0-API que
// producen ~400 tokens de guía (se cachean) — mucho menos que cargar las SKILL.md completas.

/**
 * Extrae las RESTRICCIONES explícitas del pedido del dueño ("sin gráficos", "sin colores",
 * "sacá X"). Parsear su propio texto es 0 API y evita el re-pedido (que cuesta el doble).
 * Conservador a propósito: mejor NO detectar que inventar una restricción que el dueño no puso.
 * @param {string} txt directiva del dueño
 * @returns {string[]} reglas duras a inyectar en el prompt (vacío si no hay restricciones)
 */
export function extraerRestricciones(txt) {
  const t = String(txt || '').toLowerCase()
  const reglas = []
  // "cosa" negada: un marcador de quitar/negar cerca (≤18 chars, sin cruzar coma/punto) de la
  // cosa, o la cosa seguida de un marcador. Sin \b de cierre tras el verbo: uno terminado en
  // vocal acentuada (sacá, quitá) no tiene frontera de palabra ASCII y el \b lo rompería.
  const negado = (cosa) =>
    new RegExp(`\\b(sin|no|nada de|ning[uú]n|fuera|sac|quit|elimin|borr|evit|men[oa]s)\\w*[^.,;]{0,18}${cosa}`, 'i').test(t) ||
    new RegExp(`${cosa}[^.,;]{0,12}\\b(no|fuera|de m[aá]s|sobran|sacar|quitar|eliminar)`, 'i').test(t)
  if (negado('gr[aá]fic')) reglas.push('PROHIBIDO cualquier gráfico. Si el archivo ya tiene gráficos, ELIMINALOS.')
  if (negado('colo') || negado('relleno') || negado('fondo')) reglas.push('Formato SOBRIO: nada de filas ni bloques pintados; color solo para señalar un estado/alerta puntual.')
  if (negado('negrita') || negado('formato')) reglas.push('Minimizá el formato: solo lo indispensable para que se lea, nada decorativo.')
  if (negado('f[oó]rmula')) reglas.push('No agregues fórmulas nuevas donde no te las pidieron.')
  if (negado('pesta[ñn]|hoja|solapa')) reglas.push('No crees pestañas nuevas salvo que se pidan explícitamente.')
  return reglas
}

// DOCTRINA DE DISEÑO — destilado operativo de la skill google-sheets-business-systems. Es el
// criterio que le faltaba al chat al editar (por qué inundaba de color): dárselo cuesta ~250
// tokens cacheados, no las 4 SKILL.md completas.
export const DOCTRINA_EDICION =
  '\n\nDOCTRINA DE EDICIÓN (criterio de diseño OBLIGATORIO, destilado de la skill google-sheets-business-systems): ' +
  'SOBRIEDAD. El color SEÑALA, no decora: PROHIBIDO pintar filas enteras o bloques de rojo/azul/amarillo, y prohibidos los fondos saturados. Paleta mínima: fondo neutro (blanco/gris muy claro), UN color de acento tenue para encabezados, y a lo sumo un resaltado suave (verde=ok / ámbar=atención / rojo claro=alerta) para señalar UN estado puntual. Si el archivo ya está inundado de color, LIMPIALO. ' +
  'La JERARQUÍA se logra con negrita, bordes finos, tamaño y ESPACIADO — nunca con relleno. Encabezados en negrita, fondo tenue y congelados (drive_freeze). Números SIEMPRE formateados (moneda $ es_AR, % o fecha DD/MM/YYYY), alineados a la derecha, tabular. Ajustá anchos (drive_auto_resize). ' +
  'UN DATO VIVE EN UN SOLO LUGAR: lo que debe ACTUALIZARSE SOLO va como TABLA DINÁMICA (drive_add_pivot) o fórmula que referencia la pestaña fuente — NUNCA números pegados a mano. Fórmulas en es_AR (separador ";", coma decimal). ' +
  'ENTENDÉ ANTES DE TOCAR: leé la estructura real y respetá el modelo del tablero; no reinventes secciones que ya existen.'

// VERIFICACIÓN antes de cerrar — dentro de la MISMA tarea (mismo tope de iteraciones/costo).
export const VERIFICACION_EDICION =
  '\n\nVERIFICACIÓN ANTES DE DECIR "LISTO" (OBLIGATORIO, en esta misma tarea): después de escribir, RELEÉ con drive_read el rango que tocaste y confrontalo contra el pedido y las restricciones de arriba. Si algo no cumple (quedó un gráfico que pediste sacar, se pintó de más, falta un dato, una fórmula da #ERROR!), CORREGILO ahora. Recién cuando cumple, cerrá con UNA línea (qué quedó y en qué rango). NUNCA digas "listo/reconstruida" sin haber releído y confirmado.'
