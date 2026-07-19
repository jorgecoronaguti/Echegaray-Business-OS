// LEGAJOS (área Personas). El dueño: "no llevamos los legajos, hay que hacerlo" → greenfield de
// LECTURA. No inventa una tabla: LEE la carpeta real del data room
// (administracion/ALTAS - BAJAS - HM - EPP - DNI/) ya indexada en public.drive_index y arma la foto
// de completitud. Requisitos de un legajo activo (default del dueño): ALTA (IERIC) + DNI + HM
// (examen médico / historia médica) + EPP (constancia de entrega). Un archivo BAJA ⇒ la persona se
// fue (inactiva) y su completitud ya no es riesgo. El valor: qué ACTIVO no tiene examen médico / DNI /
// alta = exposición ART e IERIC concreta. 0 API, evidencia trazable (siempre muestra los archivos).
import { query } from './db.mjs'

export const RAIZ_LEGAJOS = 'administracion/ALTAS - BAJAS - HM - EPP - DNI/'
const BASE = RAIZ_LEGAJOS.split('/').filter(Boolean).length // administracion + carpeta = 2
export const REQUERIDOS = ['alta', 'dni', 'hm', 'epp']

const sinAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const segmentos = (p) => String(p || '').split('/').filter(Boolean)

/** Clasifica un archivo por su nombre en el tipo de documento del legajo. PURA. */
export function clasificarDoc(name) {
  const n = sinAcento(String(name || '')).toLowerCase()
  if (/baja/.test(n)) return 'baja'
  if (/\bdni\b|dni[ .\-_]|documento/.test(n)) return 'dni'
  if (/\bepp\b|epp[ .\-_]|entrega.*element/.test(n)) return 'epp'
  if (/\bhm\b|hm[ .\-_]|historia|apto|examen|preocup/.test(n)) return 'hm'
  if (/\balta\b|^alta|f\.?web|fweb|ieric/.test(n)) return 'alta'
  return 'otro'
}

/** Normaliza el nombre de una persona (carpeta o archivo suelto) a una clave estable. PURA. */
export function personaKey(raw) {
  let s = sinAcento(String(raw || '')).replace(/\.pdf$/i, '')
  s = s.replace(/\d{1,2}[:/.]\d{1,2}[:/.]\d{2,4}/g, ' ') // fechas tipo 21:1:26 en el nombre
  s = s.replace(/^(alta|baja|dni|hm|epp)\b[\s\-–_]*/i, '') // prefijo de tipo de doc
  s = s.replace(/\b(alta|baja|dni|hm|epp|documento|apto|examen|constancia|de|del|la|el)\b/gi, ' ')
  return s.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

const keyTokens = (raw) => personaKey(raw).split(' ').filter((t) => t.length >= 3)

/**
 * CORE PURO (testeable sin DB): recibe las filas indexadas bajo la raíz de legajos
 * ([{name, path, is_folder}]) y arma completitud por persona + resumen de riesgo.
 * Universo de personas = las carpetas por-persona. Archivos dentro de la carpeta se atribuyen por la
 * carpeta (alta confianza); archivos sueltos se atribuyen por coincidencia de nombre (inferencia).
 */
export function analizarLegajos(filas) {
  const folders = filas.filter((r) => r.is_folder)
  const files = filas.filter((r) => !r.is_folder)
  const personas = new Map()
  for (const f of folders) {
    const key = personaKey(f.name)
    if (key) personas.set(key, { nombre: f.name, toks: keyTokens(f.name), docs: new Set(), archivos: [] })
  }
  let porCarpeta = 0, porNombre = 0, sinAtribuir = 0
  const sueltosSinDueno = []
  for (const f of files) {
    const s = segmentos(f.path).length
    if (s === BASE + 2) { // archivo dentro de una carpeta persona
      const parts = segmentos(f.path)
      const p = personas.get(personaKey(parts[parts.length - 2]))
      if (p) { p.docs.add(clasificarDoc(f.name)); p.archivos.push(f.name); porCarpeta++ } else sinAtribuir++
    } else { // archivo suelto: atribuir por tokens de apellido/nombre
      const ft = keyTokens(f.name)
      let best = null, score = 0
      for (const p of personas.values()) {
        const ov = ft.filter((t) => p.toks.includes(t)).length
        if (ov > score) { score = ov; best = p }
      }
      if (best && score >= 1) { best.docs.add(clasificarDoc(f.name)); best.archivos.push('(suelto) ' + f.name); porNombre++ }
      else { sinAtribuir++; sueltosSinDueno.push(f.name) }
    }
  }
  const lista = []
  const faltaPorDoc = { alta: 0, dni: 0, hm: 0, epp: 0 }
  let completos = 0, incompletos = 0, inactivos = 0
  for (const p of personas.values()) {
    const inactivo = p.docs.has('baja')
    const falta = REQUERIDOS.filter((d) => !p.docs.has(d))
    const fila = { persona: p.nombre, activo: !inactivo, docs: [...p.docs].filter((d) => d !== 'otro' && d !== 'baja'), falta, archivos: p.archivos }
    lista.push(fila)
    if (inactivo) { inactivos++; continue }
    if (falta.length === 0) completos++
    else { incompletos++; for (const d of falta) if (d in faltaPorDoc) faltaPorDoc[d]++ }
  }
  lista.sort((a, b) => (a.activo === b.activo ? 0 : a.activo ? -1 : 1) || a.falta.length - b.falta.length)
  return {
    resumen: {
      personas: personas.size, activos: completos + incompletos, completos, incompletos, inactivos,
      activos_sin_examen_medico: faltaPorDoc.hm, activos_sin_dni: faltaPorDoc.dni,
      activos_sin_alta: faltaPorDoc.alta, activos_sin_epp: faltaPorDoc.epp,
    },
    legajos: lista,
    atribucion: { por_carpeta: porCarpeta, por_nombre_inferido: porNombre, sin_dueno: sinAtribuir },
    sueltos_sin_dueno: sueltosSinDueno,
  }
}

/** Foto de completitud de legajos leyendo el data room (public.drive_index). 0 API. */
export async function estadoLegajos() {
  const { rows } = await query(
    `select name, path, is_folder from public.drive_index where path like $1 || '%' order by path`,
    [RAIZ_LEGAJOS])
  if (!rows.length) return { error: `no hay nada indexado bajo "${RAIZ_LEGAJOS}" — ¿corrió el índice del data room?` }
  return {
    ...analizarLegajos(rows),
    fuente: `data room · ${RAIZ_LEGAJOS} (public.drive_index)`,
    criterio: 'legajo activo completo = ALTA + DNI + HM (examen médico) + EPP; con BAJA = inactivo. Sueltos atribuidos por nombre son inferencia — verificar contra el archivo.',
  }
}
