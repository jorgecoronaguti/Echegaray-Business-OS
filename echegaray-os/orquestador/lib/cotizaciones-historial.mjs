// BIBLIOTECA DE COTIZACIONES · LEÍDA DEL DATA ROOM (área Comercial).
//
// Corrección de un error propio: se creó `public.cotizaciones` como tabla vacía a llenar a mano,
// cuando el historial comercial COMPLETO ya vive en el data room —
// `administracion/PRESUPUESTOS/<CLIENTE>/<TRABAJO>/…` — con 53 clientes y ~400 trabajos cotizados.
// Regla del dueño: todo sale de `administracion` (o de la carpeta compartida con el service account);
// el OS lo LEE, no se lo pide cargado.
//
// Esta capacidad NO reemplaza a `cotizaciones` (que sirve para registrar el resultado: ganada/perdida
// y el margen con que se cotizó). Son complementarias: el data room dice QUÉ se cotizó históricamente;
// la tabla dice CÓMO salió. 0 API — lee public.drive_index.
import { query } from './db.mjs'

export const RAIZ_PRESUPUESTOS = 'administracion/PRESUPUESTOS/'

const sinAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Clasifica un archivo del expediente de cotización por su nombre. PURA. */
export function tipoArchivoCotizacion(name) {
  const n = sinAcento(String(name || '')).toLowerCase()
  if (/planilla.*cotiz|cotiz.*planilla|\.xlsm?$|\.xlsx$/.test(n)) return 'planilla_cotizacion'
  if (/presupuesto|cotizacion|oferta/.test(n)) return 'presupuesto'
  if (/pliego|espec|condicion/.test(n)) return 'pliego'
  if (/plano|\bpl-|dwg/.test(n)) return 'plano'
  if (/orden de compra|\boc\b|\bo\/c\b/.test(n)) return 'orden_compra'
  if (/remito/.test(n)) return 'remito'
  if (/adicional/.test(n)) return 'adicional'
  if (/acta|recepcion/.test(n)) return 'acta'
  return 'otro'
}

/**
 * CORE PURO (testeable sin DB): recibe las filas indexadas bajo PRESUPUESTOS
 * ([{path, name, is_folder, modified_time}]) y arma el historial por cliente y trabajo.
 * Estructura real del data room: PRESUPUESTOS/<CLIENTE>/<TRABAJO>/<archivos…>
 */
export function analizarHistorial(filas, raiz = RAIZ_PRESUPUESTOS) {
  const seg = (p) => String(p || '').slice(raiz.length).split('/').filter(Boolean)
  const clientes = new Map()
  for (const f of filas) {
    const s = seg(f.path)
    if (!s.length) continue
    const cliente = s[0]
    if (!clientes.has(cliente)) clientes.set(cliente, { cliente, trabajos: new Map(), sueltos: 0, ultima: null })
    const c = clientes.get(cliente)
    if (f.modified_time && (!c.ultima || f.modified_time > c.ultima)) c.ultima = f.modified_time
    // Un TRABAJO es una carpeta bajo el cliente. Un archivo suelto a nivel cliente
    // (ej. "Capacitacion.pdf") NO es un trabajo cotizado — contarlo inflaba el historial.
    const esCarpetaTrabajo = s.length === 2 && f.is_folder
    const esArchivoDeTrabajo = s.length >= 3
    if (!esCarpetaTrabajo && !esArchivoDeTrabajo) { if (!f.is_folder) c.sueltos++; continue }
    const trabajo = s[1]
    if (!c.trabajos.has(trabajo)) c.trabajos.set(trabajo, { trabajo, archivos: 0, tipos: new Set(), ultima: null })
    const t = c.trabajos.get(trabajo)
    if (!f.is_folder) { t.archivos++; t.tipos.add(tipoArchivoCotizacion(f.name)) }
    if (f.modified_time && (!t.ultima || f.modified_time > t.ultima)) t.ultima = f.modified_time
  }
  const lista = [...clientes.values()].map((c) => ({
    cliente: c.cliente,
    n_trabajos: c.trabajos.size,
    n_archivos: [...c.trabajos.values()].reduce((s, t) => s + t.archivos, 0) + c.sueltos,
    ultima_actividad: c.ultima ? String(c.ultima).slice(0, 10) : null,
    trabajos: [...c.trabajos.values()]
      .sort((a, b) => String(b.ultima || '').localeCompare(String(a.ultima || '')))
      .map((t) => ({ trabajo: t.trabajo, archivos: t.archivos, tipos: [...t.tipos], ultima: t.ultima ? String(t.ultima).slice(0, 10) : null })),
  })).sort((a, b) => b.n_trabajos - a.n_trabajos)
  return {
    clientes: lista.length,
    trabajos_cotizados: lista.reduce((s, c) => s + c.n_trabajos, 0),
    archivos: lista.reduce((s, c) => s + c.n_archivos, 0),
    historial: lista,
  }
}

/** Historial de cotizaciones del data room. Si se pasa `cliente`, filtra (match parcial). 0 API. */
export async function historialCotizaciones({ cliente } = {}) {
  const { rows } = await query(
    `select path, name, is_folder, modified_time from public.drive_index where path like $1 || '%'`,
    [RAIZ_PRESUPUESTOS])
  if (!rows.length) return { error: `no hay nada indexado bajo "${RAIZ_PRESUPUESTOS}" — ¿corrió el índice del data room?` }
  const r = analizarHistorial(rows)
  const base = {
    fuente: `data room · ${RAIZ_PRESUPUESTOS} (public.drive_index)`,
    criterio: 'es el historial de lo que se COTIZÓ (expedientes en el data room). No dice si se ganó ni con qué margen — para eso está el registro de cotizaciones del OS.',
  }
  if (!cliente) {
    return { ...base, clientes: r.clientes, trabajos_cotizados: r.trabajos_cotizados, archivos: r.archivos,
      top_clientes: r.historial.slice(0, 15).map(({ trabajos, ...c }) => c) }
  }
  const q = sinAcento(String(cliente)).toLowerCase()
  const match = r.historial.filter((c) => sinAcento(c.cliente).toLowerCase().includes(q))
  if (!match.length) {
    return { ...base, error: `no encontré cotizaciones de "${cliente}"`, clientes_disponibles: r.historial.slice(0, 20).map((c) => c.cliente) }
  }
  return { ...base, encontrados: match.length, clientes: match }
}
