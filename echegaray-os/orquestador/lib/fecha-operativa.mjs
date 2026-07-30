// FECHA OPERATIVA Y TEXTO — helpers puros que comparten el registro y las consultas.
//
// POR QUÉ ESTÁN ACÁ Y NO EN LA INTERFAZ. Nacieron en `comunicacion/asistencia-ui.mjs`, que
// es la capa de chat. Cuando llegaron las consultas, `lib/asistencia-consultas.mjs` tuvo
// que importarlos de ahí: una dependencia de `lib/ → comunicacion/`, al revés de como van
// las capas. No había ciclo, pero la próxima cosa que necesitara una fecha operativa iba a
// arrastrar la interfaz entera detrás.
//
// Son funciones puras de fecha y texto: no saben de Mattermost, ni de Sheets, ni de la
// base. `asistencia-ui.mjs` las sigue re-exportando, así que su superficie no cambia.

import { normalizarClave } from './jornales-estructura.mjs'

export const TIMEZONE = 'America/Argentina/San_Juan'

/**
 * FECHA OPERATIVA en la zona de la empresa. Nunca UTC: a las 21:30 de San Juan, UTC ya es
 * el día siguiente, y la asistencia se cargaría (o se consultaría) en la columna equivocada.
 */
export function fechaOperativaSanJuan(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

/** ISO → DD/MM/YYYY (como lo escribe y lo lee la empresa). */
export function fechaAr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '')
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const nombreDia = (d) => DIAS[d] ?? '—'

/** Texto libre de fecha ("29/07", "29/7/2026") → ISO, con el año de contexto. */
export function fechaDesdeTexto(texto, isoContexto) {
  const m = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/.exec(String(texto || ''))
  if (!m) return null
  const d = +m[1]
  const mes = +m[2]
  let anio = m[3] ? +m[3] : Number(String(isoContexto || '').slice(0, 4))
  if (anio < 100) anio += 2000
  if (!Number.isFinite(anio) || mes < 1 || mes > 12 || d < 1 || d > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Normaliza el texto entrante: saca la mención al bot, acentos y espacios repetidos. */
export function limpiar(texto) {
  return normalizarClave(String(texto ?? '').replace(/@[\w.\-]+/g, ' ')).toLowerCase()
}

