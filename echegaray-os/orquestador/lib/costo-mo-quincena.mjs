// EL COSTO DE MANO DE OBRA DE UNA QUINCENA, POR OBRA Y PERSONA — espejo en JS de la definición SQL.
//
// ═══ LA DEFINICIÓN VIVE EN POSTGRES ═══
//
// `public.costo_mo_quincena_calculo` (migración 20260915T0800) es la única que consumen las pantallas:
// la ficha y la cartera del CRM, «Costo a la obra» de Liquidación y el sellado de la quincena. Este
// módulo existe para dos cosas: probar la regla sin base (`costo-mo-quincena.test.mjs`) y comparar las
// dos implementaciones sobre los datos reales (`costo-mo-quincena.pg.test.mjs`). Si alguien cambia una
// sola, la comparación se pone roja.
//
// ═══ EL MODELO (dueño, 14/09/2026) ═══
//
//   OBRERO    costo = costo_total_empleador del recibo + negro
//             negro = (horas − horas del recibo) × $/h negro  (+ el recargo de extras de la planilla)
//             sin recibo: blanco = mitad de las horas × piso de la categoría × factor costo/bruto
//             (mediana de SUS recibos con costo empleador, o la del plantel). Marcado «estimado».
//   JEFE      (neto_mensual) costo = costo_total_empleador + (neto_mensual/2 − neto del recibo).
//             MEDIO sueldo por quincena; no depende de las horas cargadas. Sin recibo: estimado.
//   REPARTO   proporcional a las horas de la persona en cada obra (la cuenta de `horasDelDia`).
//             Licencia/ausencia paga → la obra de la fila, o la asignada ese día; si no, Estructura.
//   SIN TARIFA → FALTA_DATO con sus horas. El total queda null, nunca 0.
//
// El multiplicador promedio de cargas (1,671) NO interviene: las cargas ya están en el recibo.

import { obraDeLaAsignacionDelDia } from './asignacion-del-dia.mjs'

/** Los motivos con `paga: true` de `PAGA_POR_MOTIVO` (liquidacionDeAusencias.ts). El test los compara. */
export const MOTIVOS_QUE_PAGAN = Object.freeze([
  'enfermedad', 'accidente', 'accidente_in_itinere', 'vacaciones', 'licencia_especial', 'franco',
  'lluvia', 'sin_tarea', 'permiso',
])

const TRABAJADAS = new Set(['normal', 'extra_50', 'extra_100'])
/** `extras =4+3*1,5` → 1,5 · `extras =9+2` → 1. La misma expresión que `coeficienteDeLaFila`. */
const RE_EXTRA = /extras\s*=\s*[0-9]+(?:[.,][0-9]+)?\s*\+\s*[0-9]+(?:[.,][0-9]+)?(?:\s*\*\s*([0-9]+(?:[.,][0-9]+)?))?/

const iso = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : null)
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const txt = (n) => (n == null ? '—' : String(Math.round(n * 100) / 100))

export function mediana(valores) {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Normaliza para comparar convenio y categoría: sin tildes, minúsculas, `_` entre palabras. */
export const claveDeTexto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** `{desde: 2026-08-16}` → `Q2-08/2026`: el formato de `recibo_sueldo_linea.periodo`. */
export const periodoDeQuincena = (q) =>
  `${Number(q.desde.slice(8, 10)) <= 15 ? 'Q1' : 'Q2'}-${q.desde.slice(5, 7)}/${q.desde.slice(0, 4)}`

/** `Q2-08/2026` → `2026-08-2`, ordenable como texto. `''` para FINAL u otro formato. */
const ordenDePeriodo = (p) => {
  const m = /^Q([12])-(\d{2})\/(\d{4})$/.exec(String(p ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const digitos = (c) => String(c ?? '').replace(/\D/g, '')
const esDe = (r, p) => r.persona_id === p.id || (r.persona_id == null && digitos(r.cuil) !== '' && digitos(r.cuil) === digitos(p.cuil))

function coeficiente(f) {
  if (f.tipo_hora !== 'extra_50' && f.tipo_hora !== 'extra_100') return 1
  const m = RE_EXTRA.exec(f.notas ?? '')
  if (m) return m[1] ? Number(m[1].replace(',', '.')) : 1
  return f.tipo_hora === 'extra_100' ? 2 : 1.5
}

/** La fila de mayor `desde` que ya empezó a `fecha`. */
function vigente(filas, fecha) {
  let v = null
  for (const f of filas) if (iso(f.desde) <= fecha && (!v || iso(f.desde) > iso(v.desde))) v = f
  return v
}

/** La obra de un día declarado (sin trabajo): la de la fila, o la asignación del día. */
function obraDelDiaDeclarado(filasDelDia, tramos, fecha) {
  const pagas = filasDelDia.filter((f) => MOTIVOS_QUE_PAGAN.includes(String(f.notas ?? '').trim()) && num(f.horas) > 0)
  if (pagas.length === 0) return null
  const max = Math.max(...pagas.map((f) => num(f.horas)))
  const conObra = pagas.find((f) => num(f.horas) === max && f.obra_canonica_id != null)
  const obra = conObra?.obra_canonica_id ?? obraDeLaAsignacionDelDia(tramos, fecha)
  return { obra: obra ?? null, horas: max }
}

/** Las horas de una persona en la quincena, por obra (null = Estructura), con la cuenta de `horasDelDia`. */
export function horasDeLaPersona(filas, tramos) {
  const porDia = new Map()
  for (const f of filas) porDia.set(iso(f.fecha), [...(porDia.get(iso(f.fecha)) ?? []), f])
  const porObra = new Map()
  const sumar = (obra, h) => porObra.set(obra, (porObra.get(obra) ?? 0) + h)
  let horas = 0, equivalentes = 0
  for (const [fecha, delDia] of porDia) {
    const trabajo = delDia.filter((f) => TRABAJADAS.has(f.tipo_hora))
    if (trabajo.length > 0) {
      // LO TRABAJADO GANA: la licencia declarada el mismo día no se suma al lado.
      for (const f of trabajo) {
        const h = num(f.horas) ?? 0
        sumar(f.obra_canonica_id ?? null, h)
        horas += h
        equivalentes += h * coeficiente(f)
      }
      continue
    }
    const d = obraDelDiaDeclarado(delDia, tramos, fecha)
    if (d) { sumar(d.obra, d.horas); horas += d.horas; equivalentes += d.horas }
  }
  return { porObra, horas, equivalentes }
}

/** Factor costo_total_empleador / bruto: la mediana de sus recibos quincenales, o la del plantel. */
function factorDeCosto(recibos, p) {
  const utiles = recibos.filter((r) => ordenDePeriodo(r.periodo) !== '' && num(r.costo_total_empleador) != null && num(r.bruto) > 0)
  const cociente = (r) => num(r.costo_total_empleador) / num(r.bruto)
  const suya = mediana(utiles.filter((r) => esDe(r, p)).map(cociente))
  if (suya != null) return { valor: suya, origen: 'persona' }
  const plantel = mediana(utiles.map(cociente))
  return plantel == null ? null : { valor: plantel, origen: 'plantel' }
}

/** Cociente neto/bruto para el neto estimado del jefe: la regla de `proporcionDelNeto`. */
function cocienteNeto(recibos, p, periodo) {
  const actual = ordenDePeriodo(periodo)
  const utiles = recibos.flatMap((r) => {
    const o = ordenDePeriodo(r.periodo), bruto = num(r.bruto), neto = num(r.neto)
    return o === '' || o.slice(0, 4) !== actual.slice(0, 4) || o >= actual || !(bruto > 0) || neto == null
      ? [] : [{ r, o, c: neto / bruto }]
  })
  const enRango = (c) => c >= 0.6 && c <= 0.9
  const propios = utiles.filter((u) => esDe(u.r, p)).sort((a, b) => (a.o < b.o ? 1 : -1)).slice(0, 6)
  const suya = propios.length >= 2 ? mediana(propios.map((u) => u.c)) : null
  if (suya != null && enRango(suya)) return { valor: suya, origen: 'persona' }
  const plantel = mediana(utiles.map((u) => u.c).filter(enRango))
  return plantel == null ? null : { valor: plantel, origen: 'plantel' }
}

/** El piso vigente de la categoría y el convenio de la persona al final de la quincena. */
function pisoDe(escalas, p, hasta) {
  const conv = claveDeTexto(p.convenio), cat = claveDeTexto(p.categoria)
  if (conv === '' || cat === '') return null
  const candidatas = escalas.filter((e) => claveDeTexto(e.convenio) === conv && claveDeTexto(e.categoria) === cat && num(e.valor_hora) > 0)
  return num(vigente(candidatas, hasta)?.valor_hora)
}

/** El blanco: costo empleador del recibo, o estimado. */
function blancoDe(c) {
  const { recibo, linea, horas, periodo } = c
  const manualHoras = num(linea?.horas_recibo_manual)
  if (recibo) {
    const hb = manualHoras ?? num(recibo.horas_blanco)
    const cte = num(recibo.costo_total_empleador)
    if (cte != null) return { costo: cte, hb, neto: num(recibo.neto), real: true, origen: `blanco: recibo ${periodo} costo total empleador` }
    const bruto = num(recibo.bruto)
    const costo = bruto == null || !c.factor ? null : bruto * c.factor.valor
    return { costo, hb, neto: num(recibo.neto), real: false, origen: `blanco: bruto recibo ${periodo} × factor ${txt(c.factor?.valor)} (${c.factor?.origen ?? 'sin factor'})` }
  }
  const hb = manualHoras ?? horas / 2
  const valor = num(linea?.valor_hora_recibo_manual) ?? c.piso
  const bruto = valor == null ? null : hb * valor
  const costo = bruto == null || !c.factor ? null : bruto * c.factor.valor
  const neto = bruto == null || !c.cociente ? null : bruto * c.cociente.valor
  return { costo, hb, neto, bruto, real: false, origen: `blanco: estimado ${txt(hb)} h × piso ${txt(valor)} × factor ${txt(c.factor?.valor)} (${c.factor?.origen ?? 'sin factor'})` }
}

/** El negro: horas que el recibo no paga × $/h negro, o medio sueldo mensual − neto. */
function negroDe(c, b) {
  // EL IMPORTE NEGRO ESCRITO A MANO EN LIQUIDACIÓN MANDA: es lo que se paga, y no hace falta tarifa para saberlo.
  const aMano = num(c.linea?.negro_manual)
  if (aMano != null) return { costo: aMano, estimado: false, origen: 'negro: escrito a mano en Liquidación' }
  const vh = num(c.linea?.valor_hora) ?? num(c.tarifa?.valor_hora)
  if (vh != null) {
    if (b.hb == null) return { costo: null, estimado: false, origen: 'negro: sin horas del recibo' }
    const unidades = num(c.linea?.horas_negro_manual) ?? Math.max(0, c.horas - b.hb) + c.recargo
    return { costo: unidades * vh, estimado: false, origen: `negro: ${txt(unidades)} h × $/h ${txt(vh)}` }
  }
  const nm = num(c.tarifa?.neto_mensual)
  if (nm == null) return { costo: null, estimado: false, origen: 'negro: sin tarifa (FALTA_DATO)' }
  if (b.neto == null) return { costo: null, estimado: false, origen: 'negro: sin neto del recibo ni estimado' }
  const deRecibo = c.recibo != null
  return {
    costo: nm / 2 - b.neto, estimado: !deRecibo,
    origen: `negro: ${txt(nm / 2)} − neto ${deRecibo ? 'recibo' : `est. (cociente ${txt(c.cociente?.valor)} ${c.cociente?.origen})`} ${txt(b.neto)}`,
  }
}

/** Una persona entera: horas, blanco, negro, estado. */
function costoDeLaPersona(p, e, periodo) {
  const filas = e.registros.filter((f) => f.persona_id === p.id)
  const tramos = e.asignaciones.filter((a) => a.persona_id === p.id).map((a) => ({ obra: a.obra_id, desde: a.desde, hasta: a.hasta }))
  const h = horasDeLaPersona(filas, tramos)
  const linea = e.lineas.find((l) => l.persona_id === p.id) ?? null
  const c = {
    // LAS HORAS ESCRITAS A MANO EN LIQUIDACIÓN (`horas_manual`) mandan para el blanco estimado y el negro;
    // el reparto entre obras sigue siendo por las horas cargadas.
    periodo, horas: num(linea?.horas_manual) ?? h.horas, recargo: Math.max(0, h.equivalentes - h.horas),
    recibo: e.recibos.find((r) => esDe(r, p) && String(r.periodo).trim() === periodo) ?? null,
    linea,
    tarifa: vigente(e.tarifas.filter((t) => t.persona_id === p.id), e.quincena.hasta),
    factor: factorDeCosto(e.recibos, p),
    cociente: cocienteNeto(e.recibos, p, periodo),
    piso: pisoDe(e.escalas, p, e.quincena.hasta),
  }
  const b = blancoDe(c)
  const n = negroDe(c, b)
  const falta = b.costo == null || n.costo == null
  return {
    persona: p, porObra: h.porObra, horas: h.horas, tarifa: c.tarifa, recibo: c.recibo,
    blanco: b.costo, negro: n.costo, total: falta ? null : b.costo + n.costo,
    estado: falta ? 'falta_dato' : b.real && !n.estimado ? 'real' : 'estimado',
    origen: `${b.origen} · ${n.origen}`,
  }
}

/** ¿Entra al plantel de la quincena? Horas, recibo del período, o sueldo mensual vigente y activo. */
function esDelPlantel(x, q) {
  if (x.persona.es_prueba === true) return false
  if (x.horas > 0 || x.recibo) return true
  const activo = (!x.persona.fecha_ingreso || iso(x.persona.fecha_ingreso) <= q.hasta)
    && (!x.persona.fecha_egreso || iso(x.persona.fecha_egreso) >= q.desde)
  return activo && num(x.tarifa?.neto_mensual) != null
}

const parte = (v, k) => (v == null ? null : v * k)
const PUESTO_TALLER = /taller|mec[aáÁ]nic/i

/**
 * ESTRUCTURA (dueño, 14/09/2026): «obra», ES-ADM (Administración) o ES-TAL (Taller). Sin obra va a
 * Administración, o a Taller si el puesto lo dice; una obra de tipo taller / estructura / administracion
 * tampoco es una obra.
 */
export function destinoDe(obra, tipos, persona = {}) {
  if (obra == null) return PUESTO_TALLER.test(String(persona.puesto ?? '')) ? 'ES-TAL' : 'ES-ADM'
  const t = String(tipos.get(obra) ?? '').toLowerCase()
  if (t === 'taller') return 'ES-TAL'
  return t === 'estructura' || t === 'administracion' ? 'ES-ADM' : 'obra'
}

/** El costo de la persona repartido por horas entre sus obras y Estructura. Sin horas, todo a Estructura. */
function repartir(x, q, tipos) {
  const base = x.horas > 0 ? [...x.porObra.entries()].filter(([, h]) => h > 0) : [[null, 0]]
  const acc = new Map()
  for (const [obra, horas] of base) {
    const destino = destinoDe(obra, tipos, x.persona)
    const clave = `${destino === 'obra' ? obra : ''}|${destino}`
    const a = acc.get(clave) ?? { obra: destino === 'obra' ? obra : null, destino, horas: 0 }
    a.horas += horas
    acc.set(clave, a)
  }
  return [...acc.values()].map(({ obra, destino, horas }) => {
    const k = x.horas > 0 ? horas / x.horas : 1
    return {
      quincena_desde: q.desde, quincena_hasta: q.hasta, obra_canonica_id: obra, persona_id: x.persona.id,
      horas, costo_blanco: parte(x.blanco, k), costo_negro: parte(x.negro, k), costo_total: parte(x.total, k),
      estado: x.estado, origen: x.origen, destino,
    }
  })
}

/** Las horas trabajadas sin persona (filas legacy): FALTA_DATO por obra o Estructura, nunca se pierden. */
function sinPersona(registros, q, tipos) {
  const acc = new Map()
  for (const f of registros) {
    if (f.persona_id != null || !TRABAJADAS.has(f.tipo_hora)) continue
    const destino = f.obra_canonica_id == null ? 'ES-ADM' : destinoDe(f.obra_canonica_id, tipos)
    const obra = destino === 'obra' ? f.obra_canonica_id : null
    const a = acc.get(`${obra ?? ''}|${destino}`) ?? { obra, destino, horas: 0 }
    a.horas += num(f.horas) ?? 0
    acc.set(`${obra ?? ''}|${destino}`, a)
  }
  return [...acc.values()].map(({ obra, destino, horas }) => ({
    quincena_desde: q.desde, quincena_hasta: q.hasta, obra_canonica_id: obra, persona_id: null, horas,
    costo_blanco: null, costo_negro: null, costo_total: null, estado: 'falta_dato', origen: 'horas sin persona (FALTA_DATO)', destino,
  }))
}

/**
 * EL COSTO DE LA QUINCENA. Entrada: las filas crudas de las mismas tablas que lee la función SQL.
 * `quincena.desde` es día 1 o 16; `corte` deja afuera las horas posteriores (la SQL usa `current_date`).
 */
export function costoManoDeObraDeLaQuincena(entrada) {
  const e = { lineas: [], asignaciones: [], escalas: [], tarifas: [], recibos: [], registros: [], personas: [], obras: [], ...entrada }
  const tipos = new Map(e.obras.map((o) => [o.id, o.tipo]))
  const q = { desde: iso(e.quincena.desde), hasta: iso(e.quincena.hasta) }
  const periodo = periodoDeQuincena(q)
  const corte = e.corte ?? q.hasta
  e.registros = e.registros.filter((f) => iso(f.fecha) >= q.desde && iso(f.fecha) <= q.hasta && iso(f.fecha) <= corte)
  const ids = new Set(e.personas.map((p) => p.id))
  const personas = [...e.personas]
  for (const f of e.registros) if (f.persona_id != null && !ids.has(f.persona_id)) { ids.add(f.persona_id); personas.push({ id: f.persona_id }) }
  const porPersona = personas.map((p) => costoDeLaPersona(p, e, periodo)).filter((x) => esDelPlantel(x, q))
  const filas = [...porPersona.flatMap((x) => repartir(x, q, tipos)), ...sinPersona(e.registros, q, tipos)]
  return { quincena: { ...q, periodo }, filas, personas: porPersona }
}
