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
import { ubicarCuadro } from './nomina-sync.mjs'

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
  for (const r of filas) {
    const desde = fechaSheet(r?.[0])
    if (!desde) continue
    if (/^total/i.test(String(r?.[0] ?? ''))) continue
    const hasta = fechaSheet(r?.[1])
    // En curso = la quincena todavía no terminó. Distinguirlo importa: su total va a SEGUIR
    // subiendo, y presentarlo como cerrado haría creer que la quincena costó menos de lo que costó.
    const estado = hasta && new Date(hasta) >= hoy ? 'en_curso' : 'cerrada'
    out.push({
      desde, hasta, estado,
      dias_habiles: Math.round(num(r?.[2])) || null,
      personas: Math.round(num(r?.[3])) || null,
      hs_correspondientes: num(r?.[4]) || null,
      hs_reales: num(r?.[5]) || null,
      banco: num(r?.[6]), adelanto: num(r?.[7]), total_recibo: num(r?.[8]), total: num(r?.[9]),
    })
  }
  for (const p of proyectadas) {
    const desde = fechaSheet(p?.[0])
    if (!desde || out.some((o) => o.desde === desde)) continue   // la en curso ya está como dato
    out.push({
      desde, hasta: fechaSheet(p?.[1]), estado: 'proyectada',
      dias_habiles: Math.round(num(p?.[2])) || null,
      personas: Math.round(num(p?.[3])) || null,
      hs_correspondientes: num(p?.[4]) || null, hs_reales: null,
      banco: 0, adelanto: 0, total_recibo: 0, total: num(p?.[5]),
    })
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

/** Lee las pestañas y replica. El Sheet manda; esto copia. */
export async function replicarNomina(google, { file_id = CASH_FLOW, hoy = new Date() } = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }

  // Se lee la pestaña ENTERA y se ubica cada bloque por su encabezado. Leer rangos fijos fue el
  // error que rompió esto: la planilla se reordena (el dueño borra filas, mueve bloques) y un rango
  // clavado empieza a leer otra cosa — o nada, y la réplica queda en cero sin avisar.
  const [hoja, cargas] = await Promise.all([
    google.readSheetValues(file_id, 'Jornales por Quincena!A1:J200').catch(() => []),
    google.readSheetValues(file_id, 'Cargas Sociales!A1:H60').catch(() => []),
  ])
  const buscar = (re, desde = 0) => hoja.findIndex((r, i) => i >= desde && (r ?? []).some((c) => re.test(String(c ?? '').trim())))

  const u = ubicarCuadro(hoja)
  const cuadro = u.encontrado ? hoja.slice(u.filaInicio - 1, u.filaInicio - 1 + u.filas) : []

  const hProy = buscar(/^TOTAL PROYECTADO$/i)
  let proy = []
  if (hProy >= 0) {
    const fin = hoja.findIndex((r, i) => i > hProy && /^total$/i.test(String(r?.[0] ?? '').trim()))
    proy = hoja.slice(hProy + 1, fin > 0 ? fin : hProy + 20)
  }

  const hUocra = buscar(/^Básico \$\/hora$/i)
  let uocra = []
  if (hUocra >= 0) uocra = hoja.slice(hUocra + 1, hUocra + 7).filter((r) => String(r?.[0] ?? '').trim())

  // Las cargas sociales: la fila de encabezado es la que trae los períodos YYYY-MM.
  const hCargas = cargas.findIndex((r) => (r ?? []).some((c) => /^\d{4}-\d{2}$/.test(String(c ?? '').trim())))
  const bloqueCargas = hCargas >= 0 ? cargas.slice(hCargas, hCargas + 8) : []

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

  // ── Cargas sociales declaradas (el cuadro 1 de la pestaña: concepto × período) ──
  const periodos = (bloqueCargas[0] ?? []).slice(1).map((p) => String(p ?? '').trim()).filter((p) => /^\d{4}-\d{2}$/.test(p))
  let nCargas = 0, totalCargas = 0
  await query("delete from public.cargas_sociales_periodo where tipo='declarado'")
  for (const fila of bloqueCargas.slice(1)) {
    const concepto = String(fila?.[0] ?? '').trim()
    if (!concepto || /^total/i.test(concepto)) continue
    // for, no forEach: un callback async dentro de forEach NO se espera, y las inserciones
    // quedarían corriendo sueltas mientras la función ya devolvió el resumen.
    for (let i = 0; i < periodos.length; i++) {
      const per = periodos[i]
      const monto = num(fila?.[i + 1])
      if (!monto) continue
      nCargas++; totalCargas += monto
      await query(
        `insert into public.cargas_sociales_periodo (periodo,concepto,concepto_nombre,monto,tipo)
         values ($1,$2,$3,$4,'declarado')
         on conflict (periodo,concepto,tipo) do update set monto=excluded.monto, sincronizado_en=now()`,
        [per, concepto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 40), concepto, monto],
      )
    }
  }

  // ── Escala UOCRA ──
  let nUocra = 0
  for (const f of uocra) {
    const cat = String(f?.[0] ?? '').trim()
    if (!cat) continue
    const esMensual = /sereno/i.test(cat)
    await query(
      `insert into public.uocra_escala (vigencia_desde,zona,categoria,basico_hora,no_remunerativo_mensual,mensual,cct,fuente)
       values ('2026-07-01','A',$1,$2,$3,$4,'76/75',$5)
       on conflict (vigencia_desde,zona,categoria) do update set
         basico_hora=excluded.basico_hora, no_remunerativo_mensual=excluded.no_remunerativo_mensual,
         mensual=excluded.mensual, fuente=excluded.fuente`,
      [cat, esMensual ? null : num(f?.[1]) || null, num(f?.[3]) || null,
        esMensual ? num(f?.[2]) || null : null,
        'Acuerdo UOCRA-CAMARCO-FAEC 19/5/2026 (EX-2026-52565909) — dato externo, verificar contra la escala oficial'],
    )
    nUocra++
  }

  return {
    quincenas: quincenas.length,
    quincenas_proyectadas: quincenas.filter((q) => q.estado === 'proyectada').length,
    total_jornales: quincenas.filter((q) => q.estado !== 'proyectada').reduce((a, q) => a + q.total, 0),
    cargas: nCargas, total_cargas: totalCargas, uocra: nUocra,
  }
}
