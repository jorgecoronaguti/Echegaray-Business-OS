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
// LOS ÍNDICES DE COLUMNA SE IMPORTAN, NO SE TIPEAN. Estaban escritos a mano acá y el rediseño de la
// pestaña del 23/07 los dejó corridos: la réplica leía la columna de al lado sin dar un solo error.
// Ahora vienen del módulo que ESCRIBE el cuadro, así que un cambio de layout se propaga solo.
import { ubicarCuadro, COL_REGISTRO, COL_PROYECCION } from './nomina-sync.mjs'

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
 *
 * ⚠ LOS ÍNDICES DE COLUMNA SALEN DE `COL_REGISTRO` / `COL_PROYECCION` (lib/nomina-sync.mjs), el módulo
 * que ESCRIBE el cuadro. Estaban tipeados acá y el rediseño del 23/07 los dejó corridos.
 */
export function mapearQuincenas(filas = [], { hoy = new Date(), proyectadas = [] } = {}) {
  const R = COL_REGISTRO, P = COL_PROYECCION
  const out = []
  for (const r of filas) {
    if (/^total/i.test(String(r?.[0] ?? ''))) continue
    const hasta = fechaSheet(r?.[R.hasta])
    // La columna "Desde" viene del archivo JORNALES y trae el día sin año ("5/1", "16/7"), así que
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
      desde, hasta, estado, fecha_pago: fechaSheet(r?.[R.pago]),
      dias_habiles: Math.round(num(r?.[R.dias])) || null,
      personas: Math.round(num(r?.[R.personas])) || null,
      hs_correspondientes: num(r?.[R.hs_previstas]) || null,
      hs_reales: num(r?.[R.hs_reales]) || null,
      banco: num(r?.[R.banco]), adelanto: num(r?.[R.adelanto]),
      total_recibo: num(r?.[R.total_recibo]), total: num(r?.[R.total]),
    })
  }
  for (const p of proyectadas) {
    const desde = fechaSheet(p?.[P.desde])
    if (!desde || out.some((o) => o.desde === desde)) continue   // la en curso ya está como dato
    out.push({
      desde, hasta: fechaSheet(p?.[P.hasta]), estado: 'proyectada', fecha_pago: fechaSheet(p?.[P.pago]),
      dias_habiles: Math.round(num(p?.[P.dias])) || null,
      personas: Math.round(num(p?.[P.personas])) || null,
      hs_correspondientes: num(p?.[P.valores_hoy]) || null, hs_reales: null,
      // EL TOTAL PROYECTADO ES `total`, NO EL AJUSTE POR INFLACIÓN. Leía el índice 5 —que en el layout
      // nuevo es "A valores de hoy" y en el momento del rediseño cayó sobre "Ajuste inflación"— y las
      // diez quincenas proyectadas quedaron cargadas en la base por $10,54 en total: la suma de los
      // coeficientes 1,02 · 1,04 · … O sea que la web mostraba $2 de jornales para agosto en vez de
      // $13,8M. No dio error: $2 es un número perfectamente válido.
      banco: 0, adelanto: 0, total_recibo: 0, total: num(p?.[P.total]),
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
  // ═══ TRES ANCLAS MUERTAS, Y LA RÉPLICA VACIABA LA BASE SIN DECIR NADA (verificado el 31/07) ═══
  //
  // Medido contra la pestaña real, las tres búsquedas de esta función devolvían "no encontrado":
  //   · `ubicarCuadro` ancla en el rótulo "Desde" y el encabezado del registro dice "Quincena" (fila 17)
  //   · /^TOTAL PROYECTADO$/i — el rótulo real es "⇒ Total a pagar hasta diciembre" (fila 28)
  //   · /^Básico \$\/hora$/i — el rótulo real es "· Escala del convenio, por hora:" (fila 51)
  //
  // Y abajo hay un `delete from jornales_quincena` que corría IGUAL. O sea: cada corrida borraba las
  // 24 quincenas de la base e insertaba cero. La base tenía la foto del 20/07 congelada, y
  // `nomina_por_mes` —que lee la web— se habría quedado en cero jornales la próxima vez.
  //
  // AHORA SE UBICA POR RANGO CON NOMBRE, que es lo que la pestaña mueve sola, con los rótulos actuales
  // como respaldo. Y si no encuentra el cuadro, NO BORRA: fallar sin escribir es recuperable; borrar y
  // no escribir, no.
  const [hoja, cargas, nombrados] = await Promise.all([
    google.readSheetValues(file_id, 'Jornales por Quincena!A1:M200').catch(() => []),
    google.readSheetValues(file_id, 'Cargas Sociales!A1:H60').catch(() => []),
    google.getNamedRanges ? google.getNamedRanges(file_id).catch(() => []) : Promise.resolve([]),
  ])
  const buscar = (re, desde = 0) => hoja.findIndex((r, i) => i >= desde && (r ?? []).some((c) => re.test(String(c ?? '').trim())))
  const porNombre = new Map(nombrados.map((r) => [r.name, r.range]))
  /** Las filas de un bloque, ubicadas por su rango con nombre (0-based, fin excluyente). */
  const bloquePorNombre = (nombre) => {
    const r = porNombre.get(nombre)
    return r?.startRowIndex == null ? null : hoja.slice(r.startRowIndex, r.endRowIndex)
  }

  // El registro de quincenas reales.
  let cuadro = bloquePorNombre('JORNALES_REAL_HASTA')
  if (!cuadro?.length) {
    const u = ubicarCuadro(hoja)
    const h = u.encontrado ? u.filaInicio - 1 : buscar(/^Quincena$/i) + 1
    cuadro = h > 0 ? hoja.slice(h, h + (u.filas || 40)).filter((r) => String(r?.[0] ?? '').trim() && !/^(⇒|·)/.test(String(r?.[0]))) : []
  }

  // La proyección.
  let proy = bloquePorNombre('JORNALES_PROY_HASTA')
  if (!proy?.length) {
    const hProy = buscar(/^(TOTAL PROYECTADO|Quincena)$/i)
    if (hProy >= 0) {
      const fin = hoja.findIndex((r, i) => i > hProy && /^(⇒|total)/i.test(String(r?.[0] ?? '').trim()))
      proy = hoja.slice(hProy + 1, fin > 0 ? fin : hProy + 20)
    } else proy = []
  }

  // La escala UOCRA: no tiene rango con nombre, así que va por rótulo — el ACTUAL y el viejo.
  const hUocra = buscar(/^(·\s*)?(Básico \$\/hora|Escala del convenio, por hora:)$/i)
  let uocra = []
  if (hUocra >= 0) {
    uocra = hoja.slice(hUocra + 1, hUocra + 7)
      // Los rótulos del bloque vienen con el prefijo de sub-ítem ("   · Oficial"): se limpia para que
      // la categoría entre a la base como "Oficial" y no como "· Oficial".
      .map((r) => [String(r?.[0] ?? '').replace(/^\s*·\s*/, '').replace(/\s+—.*$/, '').trim(), ...(r ?? []).slice(1)])
      .filter((r) => r[0])
  }

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
