// REPLICAR LA NÓMINA A SUPABASE — la regla de oro del dueño (20/07):
// "todo replicado en Supabase para darle vida a la web en cuanto se quiera".
//
// Lo que sólo vive en una pestaña no lo puede mostrar la web, no lo puede cruzar el chat con otra
// cosa y no lo puede auditar nadie sin abrir la planilla. Las quincenas de jornales, las cargas
// sociales declaradas y la escala UOCRA estaban en ese estado.
//
// QUÉ NO HACE: no calcula nada nuevo. El Sheet sigue siendo donde se arma el cuadro; esto lo copia
// tal cual, con la marca de si cada fila es un DATO o una ESTIMACIÓN. Si acá se recalculara, habría
// dos versiones del mismo número — exactamente lo que la regla de realidad única prohíbe.

import { query } from './db.mjs'
// El parser de importes es el que YA existe y está testeado (maneja "$ 8.157.588" es-AR, donde el
// punto es separador de miles). Escribir un segundo parser acá creaba dos verdades sobre el mismo
// número: el primero que hice devolvía 0 para ese importe.
import { montoAR as num } from './egresos-por-area.mjs'
import { COL_REGISTRO, COL_PROYECCION } from './nomina-sync.mjs'
import { parsearAcuerdos, CATEGORIAS } from './uocra-acuerdos.mjs'

export { num }

/** Fecha de Sheets (serial o "dd/mm/yyyy") a ISO. PURA. Devuelve null si no es una fecha. */
export function fechaSheet(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    // Serial de Sheets: días desde el 30/12/1899.
    const ms = (Number(v) - 25569) * 86400000
    const d = new Date(ms)
    return Number.isFinite(ms) ? d.toISOString().slice(0, 10) : null
  }
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(String(v).trim())
  if (!m) return null
  const [, d, mes, a] = m
  const anio = a.length === 2 ? `20${a}` : a
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * NÚCLEO PURO: filas del cuadro de quincenas → registros para la base.
 * `hoy` se inyecta para poder testear el estado sin depender del día en que corra.
 */
export function mapearQuincenas(filas = [], { hoy = new Date(), proyectadas = [] } = {}) {
  const out = []
  const R = COL_REGISTRO
  for (const r of filas) {
    if (/^(total|⇒)/i.test(String(r?.[0] ?? '').trim())) continue
    const hasta = fechaSheet(r?.[R.hasta])
    // La columna "Quincena" viene del archivo JORNALES y trae el día sin año ("5/1", "16/7"), así que
    // fechaSheet devuelve null y la quincena se perdía: la réplica marcaba 0 cerradas y $0. El año
    // sale de "Hasta", que sí es una fecha real.
    let desde = fechaSheet(r?.[R.desde])
    if (!desde && hasta) {
      const m = /^(\d{1,2})[/-](\d{1,2})$/.exec(String(r?.[R.desde] ?? '').trim())
      if (m) desde = `${hasta.slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    if (!desde) continue
    // En curso = la quincena todavía no terminó. Distinguirlo importa: su total va a SEGUIR
    // subiendo, y presentarlo como cerrado haría creer que la quincena costó menos de lo que costó.
    const estado = hasta && new Date(hasta) >= hoy ? 'en_curso' : 'cerrada'
    out.push({
      desde, hasta, estado,
      dias_habiles: Math.round(num(r?.[R.dias])) || null,
      personas: Math.round(num(r?.[R.personas])) || null,
      hs_correspondientes: num(r?.[R.hs_previstas]) || null,
      hs_reales: num(r?.[R.hs_reales]) || null,
      banco: num(r?.[R.banco]), adelanto: num(r?.[R.adelanto]),
      total_recibo: num(r?.[R.total_recibo]), total: num(r?.[R.total]),
    })
  }
  const P = COL_PROYECCION
  for (const p of proyectadas) {
    const desde = fechaSheet(p?.[P.desde])
    if (!desde || out.some((o) => o.desde === desde)) continue   // la en curso ya está como dato
    out.push({
      desde, hasta: fechaSheet(p?.[P.hasta]), estado: 'proyectada',
      dias_habiles: Math.round(num(p?.[P.dias])) || null,
      personas: Math.round(num(p?.[P.personas])) || null,
      hs_correspondientes: null, hs_reales: null,
      banco: 0, adelanto: 0, total_recibo: 0, total: num(p?.[P.total]),
    })
  }
  return out
}

/**
 * NÚCLEO PURO: la réplica entera de la escala del convenio, desde los acuerdos parseados.
 *
 * ═══ POR QUÉ SE REHIZO (06/08 — defecto B18) ═══
 *
 * Esto leía el encabezado "Básico $/hora" de la pestaña Jornales. Ese encabezado NO EXISTE desde el
 * rediseño del 23/07: la búsqueda devolvía −1, el bucle no iteraba, y la réplica quedaba en cero sin
 * dar un error. Las filas que hoy tiene `public.uocra_escala` se cargaron fuera del repositorio.
 *
 * Peor: escribía `vigencia_desde = '2026-07-01'` a fuego para TODA fila y una `fuente` con el número
 * de expediente escrito a mano. Un dato replicado con una vigencia inventada es peor que ninguno.
 *
 * Ahora sale del MISMO parser que usa el motor salarial: cada escalón con su período real, su fila en
 * la réplica y el acuerdo del que cuelga. Una capacidad, una fuente.
 *
 * @param {Array} escalones salida de parsearAcuerdos
 * @returns {{vigencia_desde:string, categoria:string, basico_hora:number|null, mensual:number|null, fuente:string}[]}
 */
export function mapearEscala(escalones = []) {
  const out = []
  for (const e of escalones) {
    for (const cat of CATEGORIAS) {
      const v = e.categorias?.[cat]
      if (!v || !v.basico) continue
      // El Sereno cobra por MES, las otras cuatro por HORA. Meter un valor mensual en la columna de
      // $/hora fue lo que hizo que un Sereno pareciera cobrar $980.858 la hora.
      const esMensual = cat === 'Sereno'
      out.push({
        vigencia_desde: `${e.periodo}-01`,
        categoria: cat,
        basico_hora: esMensual ? null : v.basico,
        mensual: esMensual ? v.basico : null,
        // NO SE INVENTA. La suma no remunerativa NO está en la réplica —su pie de página lo dice— así
        // que la columna va nula y no en cero: cero significaría "no hay", y lo cierto es "no se sabe".
        no_remunerativo_mensual: null,
        fuente: `${e.acuerdo ?? 'acuerdo sin rótulo'} · ${e.rotulo} · réplica _UOCRA_RAW (IMPORTHTML a un sitio de terceros: verificar contra la escala oficial)`,
      })
    }
  }
  return out
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Texto del resultado. PURO. */
export function formatReplica(r) {
  if (!r || r.error) return `No pude replicar: ${r?.error ?? 'sin datos'}`
  const L = ['RÉPLICA A SUPABASE', '']
  L.push(`  Quincenas de jornales: ${r.quincenas} (${r.quincenas_proyectadas} proyectadas) · ${$(r.total_jornales)}`)
  L.push(`  Cargas sociales: ${r.cargas} registro(s) · ${$(r.total_cargas)}`)
  L.push(`  Escala UOCRA: ${r.uocra} categoría(s)`)
  L.push('')
  L.push('  La web ya puede leer todo esto desde public.nomina_por_mes sin abrir el Sheet.')
  return L.join('\n')
}

const CASH_FLOW = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const TAB_JORNALES = 'Jornales por Quincena'

/** Lee las pestañas y replica. El Sheet manda; esto copia. */
export async function replicarNomina(google, { file_id = CASH_FLOW, hoy = new Date() } = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }

  // ═══ LOS BLOQUES SE UBICAN POR SU RANGO CON NOMBRE (06/08) ═══
  //
  // Antes se buscaban por encabezado: "Desde", "TOTAL PROYECTADO", "Básico $/hora". Los tres
  // desaparecieron en el rediseño del 23/07 y las tres búsquedas devolvían −1 — sin error, sin aviso,
  // con las tres réplicas en cero durante semanas. Es el mismo defecto que dejó a `jornal_quincena`
  // sin quincenas y que `sync-caja-nucleo.mjs` ya había curado con este patrón.
  //
  // SI FALTA UN ANCLA, NO SE REPLICA ESE BLOQUE Y SE DICE. Replicar con filas adivinadas es cómo se
  // llenó la base de datos que nadie podía explicar.
  const nombrados = new Map((await google.getNamedRanges(file_id).catch(() => [])).map((r) => [r.name, r.range]))
  const avisos = []
  const filasDe = async (nombre) => {
    const r = nombrados.get(nombre)
    if (!r || r.startRowIndex == null) { avisos.push(`falta el rango con nombre ${nombre}: corré jornales-pestana.mjs`); return [] }
    return google.readSheetValues(file_id, `${TAB_JORNALES}!A${r.startRowIndex + 1}:N${r.endRowIndex}`).catch(() => [])
  }
  const [cuadro, proy, rawUocra] = await Promise.all([
    filasDe('JORNALES_REAL_HASTA'),
    filasDe('JORNALES_PROY_HASTA'),
    google.readSheetValues(file_id, '_UOCRA_RAW!A1:K300').catch(() => []),
  ])
  for (const a of avisos) console.warn(`  ⚠ ${a}`)

  // Las cargas sociales declaradas salen de la réplica de los PDF, NO de la pestaña: la pestaña las
  // muestra con el rótulo del mes ("ene-26") y la réplica las tiene con su período y su CÓDIGO, que
  // es lo que identifica un concepto de la DDJJ sin depender de cómo se escribió el nombre.
  const f931 = await google.readSheetValues(file_id, '_F931_RAW!A4:G200').catch(() => [])

  // ── Quincenas ──
  const quincenas = mapearQuincenas(cuadro, { hoy, proyectadas: proy })
  await query("delete from public.jornales_quincena where origen='flujo_caja_sheet'")
  for (const q of quincenas) {
    await query(
      `insert into public.jornales_quincena
         (desde,hasta,dias_habiles,personas,hs_correspondientes,hs_reales,banco,adelanto,total_recibo,total,estado)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (desde,origen) do update set
         hasta=excluded.hasta, dias_habiles=excluded.dias_habiles, personas=excluded.personas,
         hs_correspondientes=excluded.hs_correspondientes, hs_reales=excluded.hs_reales,
         banco=excluded.banco, adelanto=excluded.adelanto, total_recibo=excluded.total_recibo,
         total=excluded.total, estado=excluded.estado, sincronizado_en=now()`,
      [q.desde, q.hasta, q.dias_habiles, q.personas, q.hs_correspondientes, q.hs_reales,
        q.banco, q.adelanto, q.total_recibo, q.total, q.estado],
    )
  }

  // ── Cargas sociales declaradas, desde _F931_RAW (período · código · concepto · monto) ──
  let nCargas = 0, totalCargas = 0
  if (f931.length) await query("delete from public.cargas_sociales_periodo where tipo='declarado'")
  for (const f of f931) {
    const periodo = String(f?.[0] ?? '').replace(/^'/, '').trim()
    const codigo = String(f?.[1] ?? '').trim()
    const nombre = String(f?.[2] ?? '').trim()
    const monto = num(f?.[3])
    if (!/^\d{4}-\d{2}$/.test(periodo) || !codigo || !monto) continue
    nCargas++; totalCargas += monto
    await query(
      `insert into public.cargas_sociales_periodo (periodo,concepto,concepto_nombre,monto,tipo)
       values ($1,$2,$3,$4,'declarado')
       on conflict (periodo,concepto,tipo) do update set monto=excluded.monto, concepto_nombre=excluded.concepto_nombre, sincronizado_en=now()`,
      [periodo, codigo, nombre, monto],
    )
  }

  // ── Escala UOCRA, desde el parser de acuerdos ──
  const { escalones, problemas } = parsearAcuerdos(rawUocra ?? [])
  for (const p of problemas.slice(0, 3)) console.warn(`  ⚠ _UOCRA_RAW: ${p}`)
  const escala = mapearEscala(escalones)
  for (const e of escala) {
    await query(
      `insert into public.uocra_escala (vigencia_desde,zona,categoria,basico_hora,no_remunerativo_mensual,mensual,cct,fuente)
       values ($1,'A',$2,$3,$4,$5,'76/75',$6)
       on conflict (vigencia_desde,zona,categoria) do update set
         basico_hora=excluded.basico_hora, no_remunerativo_mensual=excluded.no_remunerativo_mensual,
         mensual=excluded.mensual, fuente=excluded.fuente`,
      [e.vigencia_desde, e.categoria, e.basico_hora, e.no_remunerativo_mensual, e.mensual, e.fuente],
    )
  }
  const nUocra = escala.length

  return {
    quincenas: quincenas.length,
    quincenas_proyectadas: quincenas.filter((q) => q.estado === 'proyectada').length,
    total_jornales: quincenas.filter((q) => q.estado !== 'proyectada').reduce((a, q) => a + q.total, 0),
    cargas: nCargas, total_cargas: totalCargas, uocra: nUocra,
  }
}
