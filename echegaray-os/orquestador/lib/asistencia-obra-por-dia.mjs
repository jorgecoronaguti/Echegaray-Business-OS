// ASISTENCIA (Sheet de nómina) → la obra de cada DÍA en `registros_hh`. Lógica pura: sin base, sin
// red, sin fechas del sistema. Lo que escribe está en `scripts/asistencia-obra-por-dia.mjs`.
//
// ═══ POR QUÉ EXISTE (08/09/2026) ═══
// JORNALES rotula la QUINCENA entera de cada persona con UNA sola obra («LA ESTRELLA · Cierre de
// Obra»), pero la persona trabajó en varias dentro de esa quincena. El importador de JORNALES no
// puede saberlo: la planilla no lo dice. Quien lo dice es la pestaña ASISTENCIA — un ledger diario,
// una fila por persona × día × obra, que carga el encargado. Esa pestaña es la fuente de «dónde
// estuvo cada uno», y JORNALES sigue siendo la fuente de CUÁNTAS HORAS se pagan.
//
// POR ESO ACÁ SÓLO SE MUEVE `obra_canonica_id`. Ni horas, ni tipo_hora, ni la fila: si esto tocara
// horas, dos fuentes estarían escribiendo el mismo número y el jornal dejaría de cuadrar con el
// recibo. La corrección a mano del 08/09 (152 filas) es exactamente lo que este módulo automatiza.
import {
  emparejarPersona, indicePersonas, norm, FALTA,
} from './jornales-a-registros-hh.mjs'
import { TIPOS_TRABAJADOS, fechaIso } from './asignaciones-desde-hh.mjs'

export const HOJA_ASISTENCIA = 'ASISTENCIA'
export const FUENTE_JORNALES = 'sheet:jornales'
/** Encabezados que la pestaña DEBE tener. Si el encargado renombra una, se para: leer por posición
 *  fija ya rompió otros lectores cuando alguien insertó una columna al principio (ID ASISTENCIA). */
export const CABECERAS = ['FECHA', 'CLIENTE', 'ID OBRA', 'NOMBRE', 'HORAS']

const DIA_MS = 86_400_000
/** Serial de Sheets → ISO. Época 1899-12-30 (la misma que usa Google, no la de Excel). */
export const serialAIso = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * DIA_MS).toISOString().slice(0, 10)

/** La celda de fecha llega como serial (UNFORMATTED_VALUE), como dd/mm/aaaa o ya como ISO. */
export function fechaDeCelda(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 ? serialAIso(v) : null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!m) return null
  const [, d, mes, a] = m
  const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** «AGUERO, CRISTIAN DOMINGO» → «AGUERO CRISTIAN DOMINGO»: la coma no es un token. */
export const limpiarNombre = (s) => String(s ?? '').replace(/[,.;]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Values de la pestaña (fila 1 = encabezados) → filas normalizadas.
 * @returns { filas, hallazgos }  `hallazgos` = filas que no se pueden usar, con su número de fila.
 */
export function filasDeValues(values = []) {
  const [cab = [], ...cuerpo] = values
  const idx = new Map(cab.map((c, i) => [norm(c).trim(), i]))
  const falta = CABECERAS.filter((c) => !idx.has(norm(c)))
  if (falta.length) throw new Error(`ASISTENCIA no tiene las columnas ${falta.join(', ')} — encabezados leídos: ${cab.join(' | ')}`)
  const col = (f, nombre) => f[idx.get(norm(nombre))]
  const filas = []; const hallazgos = []
  cuerpo.forEach((f, i) => {
    const fila1 = i + 2
    const fecha = fechaDeCelda(col(f, 'FECHA'))
    const nombre = limpiarNombre(col(f, 'NOMBRE'))
    const cliente = String(col(f, 'CLIENTE') ?? '').trim()
    const obra = String(col(f, 'ID OBRA') ?? '').trim()
    if (!fecha && !nombre && !cliente && !obra) return // fila vacía al pie: no es un hallazgo
    if (!fecha) { hallazgos.push({ tipo: 'fecha_ilegible', fila1, valor: col(f, 'FECHA') }); return }
    if (!nombre) { hallazgos.push({ tipo: 'sin_nombre', fila1, fecha }); return }
    filas.push({
      fila1, fecha, cliente, obra, nombre,
      horas: Number(col(f, 'HORAS') ?? 0) || 0,
      observacion: String(col(f, 'OBSERVACION') ?? '').trim(),
      encargado: String(col(f, 'ENCARGADO') ?? '').trim(),
      quincena: String(col(f, 'QUINCENA') ?? '').trim(),
      rotulo: `${cliente} :: ${obra}`,
    })
  })
  return { filas, hallazgos }
}


// ═══ EL ENCARGADO NO ESCRIBE EL NOMBRE COMPLETO (medido el 08/09/2026) ═══
// De los 19 nombres de la pestaña, 3 no emparejaban con `personas` por la forma del rótulo, no por
// ser otra gente: «PETINA RODRIGUEZ JAIRO E» (la inicial en lugar del nombre) y «JOFRE ALBERTO
// ISMAEL» (el legajo dice «JOFRE ISMAEL», sin el segundo nombre). Son 26 de 245 filas: sin estas
// dos segundas oportunidades, esos días nunca se corregirían y el tool no serviría para ellos.
// LAS DOS EXIGEN CANDIDATA ÚNICA y quedan marcadas con su `criterio`: el que lee la salida ve que
// no fue una coincidencia exacta. Lo que sigue sin resolver NO se adivina.
const soloTokens = (s) => norm(s).split(' ').filter((t) => t && !/^\d+$/.test(t))

/**
 * `emparejarPersona` (el mismo criterio que JORNALES) y, si falla, dos reglas más:
 *   · la última «palabra» es de 1–2 letras → es una inicial: se descarta y se reintenta.
 *   · los tokens de UNA sola persona están todos dentro del rótulo («JOFRE ISMAEL» ⊂ «JOFRE
 *     ALBERTO ISMAEL»): hace falta que sean 2 o más y que la candidata sea única.
 */
export function emparejarPersonaPlanilla(nombre, indice) {
  const directo = emparejarPersona(nombre, indice)
  if (directo.estado === 'ok') return { ...directo, criterio: 'exacto' }
  const ts = soloTokens(nombre)
  if (ts.length > 1 && ts.at(-1).length <= 2) {
    const sinInicial = emparejarPersona(ts.slice(0, -1).join(' '), indice)
    if (sinInicial.estado === 'ok') return { ...sinInicial, criterio: 'inicial_truncada' }
  }
  const contenidas = indice.filter((p) => p.tokens.length >= 2 && p.tokens.every((pt) => ts.includes(pt)))
  if (contenidas.length === 1) return { estado: 'ok', persona: contenidas[0], criterio: 'legajo_mas_corto' }
  return { ...directo, criterio: null }
}

/**
 * Filas de la planilla → un mapa `persona|fecha` con las obras canónicas de ese día.
 * Lo que no resuelve NO se inventa: sale en `sinPersona` / `sinObra` para que lo mire el dueño.
 * @param opts { personas, resolver }  mismos catálogos que el importador de JORNALES.
 */
export function agruparPorPersonaDia(filas, { personas = [], resolver }) {
  const indice = indicePersonas(personas)
  const dias = new Map(); const sinPersona = new Map(); const sinObra = new Map()
  const aproximadas = new Map()
  for (const f of filas) {
    const emp = emparejarPersonaPlanilla(f.nombre, indice)
    if (emp.estado !== 'ok') {
      const k = `${f.nombre}|${emp.estado}`
      if (!sinPersona.has(k)) sinPersona.set(k, { nombre: f.nombre, estado: emp.estado, candidatos: emp.candidatos ?? [], filas: 0 })
      sinPersona.get(k).filas++
      continue
    }
    if (emp.criterio !== 'exacto') {
      aproximadas.set(f.nombre, { nombre: f.nombre, persona: emp.persona.nombre_completo, criterio: emp.criterio })
    }
    const res = resolver({ cliente: f.cliente, obra: f.obra })
    if (!res.obra_id) {
      if (!sinObra.has(f.rotulo)) sinObra.set(f.rotulo, { rotulo: f.rotulo, filas: 0, dias: new Set() })
      const s = sinObra.get(f.rotulo); s.filas++; s.dias.add(f.fecha)
      continue
    }
    const clave = `${emp.persona.id}|${f.fecha}`
    let dia = dias.get(clave)
    if (!dia) { dia = { persona_id: emp.persona.id, persona: emp.persona.nombre_completo, fecha: f.fecha, obras: new Map() }; dias.set(clave, dia) }
    const prev = dia.obras.get(res.obra_id) ?? { horas: 0, rotulos: new Set() }
    prev.horas += f.horas; prev.rotulos.add(f.rotulo)
    dia.obras.set(res.obra_id, prev)
  }
  return {
    dias,
    aproximadas: [...aproximadas.values()],
    sinPersona: [...sinPersona.values()],
    sinObra: [...sinObra.values()].map((s) => ({ ...s, dias: [...s.dias].sort() })),
  }
}

const esTrabajada = (t) => TIPOS_TRABAJADOS.test(String(t ?? ''))

/**
 * Cruza el ledger diario con las filas de `registros_hh` y decide qué UNA columna se mueve.
 *
 * REGLAS, en este orden y sin excepción:
 *   · la planilla dice DOS obras ese día para esa persona → AMBIGUO: no se reparte, se lista.
 *   · la fila no es de JORNALES (`web:*`) → no se toca; si contradice a la planilla se lista.
 *   · la fila no es horas trabajadas (ausencia/licencia) → no se toca: no elige obra.
 *   · la obra ya es la de la planilla → coincide.
 *   · si no → CORREGIR `obra_canonica_id`.
 * @param hh  [{ id, persona_id, fecha, obra_canonica_id, tipo_hora, horas, fuente_legacy }]
 */
export function planDeCorreccion({ dias, hh = [] }) {
  const corregir = []; const contradiceWeb = []; const noTrabajadas = []
  const ambiguos = new Map(); let coinciden = 0; let sinPlanilla = 0
  for (const r of hh) {
    const fecha = fechaIso(r.fecha)
    const dia = dias.get(`${r.persona_id}|${fecha}`)
    if (!dia) { sinPlanilla++; continue }
    const obras = [...dia.obras.keys()]
    const base = { id: r.id, persona_id: r.persona_id, persona: dia.persona, fecha, tipo_hora: r.tipo_hora, horas: Number(r.horas ?? 0) }
    if (obras.length > 1) {
      const k = `${r.persona_id}|${fecha}`
      if (!ambiguos.has(k)) {
        ambiguos.set(k, {
          persona: dia.persona, fecha, registrada: r.obra_canonica_id,
          obras: obras.map((o) => ({ obra_id: o, horas: dia.obras.get(o).horas })).sort((a, b) => b.horas - a.horas),
        })
      }
      continue
    }
    const [obraPlanilla] = obras
    if (r.fuente_legacy !== FUENTE_JORNALES) {
      if (r.obra_canonica_id !== obraPlanilla) contradiceWeb.push({ ...base, fuente: r.fuente_legacy, base_obra: r.obra_canonica_id, planilla: obraPlanilla })
      continue
    }
    if (!esTrabajada(r.tipo_hora)) {
      if (r.obra_canonica_id !== obraPlanilla) noTrabajadas.push({ ...base, base_obra: r.obra_canonica_id, planilla: obraPlanilla })
      continue
    }
    if (r.obra_canonica_id === obraPlanilla) { coinciden++; continue }
    corregir.push({ ...base, de: r.obra_canonica_id, a: obraPlanilla, rotulos: [...dia.obras.get(obraPlanilla).rotulos] })
  }
  corregir.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.persona).localeCompare(String(b.persona)))
  return { corregir, ambiguos: [...ambiguos.values()], contradiceWeb, noTrabajadas, coinciden, sinPlanilla }
}

/** Días de la planilla que NO tienen ninguna fila trabajada en `registros_hh`: horas sin pagar o
 *  persona que ese día figura ausente en JORNALES. Nunca se crean filas acá — se listan. */
export function planillaSinHh({ dias, hh = [] }) {
  const conHh = new Set(hh.filter((r) => esTrabajada(r.tipo_hora)).map((r) => `${r.persona_id}|${fechaIso(r.fecha)}`))
  return [...dias.values()]
    .filter((d) => !conHh.has(`${d.persona_id}|${d.fecha}`))
    .map((d) => ({ persona: d.persona, fecha: d.fecha, obras: [...d.obras.keys()] }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// SÓLO la columna de obra, y sólo sobre filas de JORNALES. El `is distinct from` hace la escritura
// idempotente en la base misma: una segunda corrida devuelve 0 filas aunque el plan se recalcule.
export const SQL_CORREGIR_OBRA = `
  update public.registros_hh
     set obra_canonica_id = $2
   where id = $1
     and fuente_legacy = '${FUENTE_JORNALES}'
     and obra_canonica_id is distinct from $2
  returning id, obra_canonica_id`

export { FALTA }
