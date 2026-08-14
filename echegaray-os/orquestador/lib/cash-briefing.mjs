// BRIEFING DE CAJA (mañanero) — determinístico sobre datos LIMPIOS del Cash Flow (0 razonamiento
// del modelo). Piso firme: cada número sale de una columna estructurada, verificable, barato y
// rápido, para correr solo cada mañana. NUNCA inventa. Complementa al briefingEjecutivo (DB) con
// la foto de CAJA real de la planilla: saldo hoy, cobranzas del mes, vencimientos de la semana.
export const CASHFLOW_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function parseMonto(s) {
  // UNA CELDA LEÍDA CON `UNFORMATTED_VALUE` YA VIENE COMO NÚMERO, Y ENTONCES EL PUNTO ES DECIMAL.
  // Sin esta rama, 429048.5 se convertía en 4290485: el parser lo trata como separador de miles y
  // devuelve una magnitud diez veces mayor sin dar error. Es el mismo defecto que ya obligó a leer las
  // fechas con UNFORMATTED — sólo que acá el que se rompe es el importe.
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const t = String(s ?? '').trim()
  // NOTACIÓN CONTABLE: "($ 531.000,00)" son PARÉNTESIS, y en contabilidad los paréntesis son el
  // signo menos. Sin esto, las notas de crédito entraban como cargos POSITIVOS.
  //
  // Medido el 20/07: tres notas de crédito (DUPEC $531.000 y dos de Corralón Progreso) se replicaron
  // en Supabase con el signo invertido, y la réplica quedó $1.093.849 por encima del Sheet — el doble
  // de cada nota, porque no sólo no restaban: sumaban. Se descubrió recién al contrastar el total del
  // núcleo contra el control de la planilla, que es exactamente para lo que sirve ese control.
  //
  // El formato de la celda no es asunto del parser en general, PERO el paréntesis no es formato: es
  // el signo. Un parser que lo tira devuelve un número con la magnitud correcta y el sentido opuesto,
  // que es peor que no devolver nada.
  const negativo = /^\(.*\)$/.test(t)
  const n = Number(t.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return negativo ? -Math.abs(n) : n
}
/** "DD/MM/YYYY" o "DD/MM/YY" (es-AR) → Date, o null. */
export function parseFecha(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s ?? '').trim())
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}
export const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR')

/**
 * Lee SOLO columnas estructuradas del Cash Flow. `hoy` inyectable para test.
 *
 * `opts.spreadsheetId` permite apuntar a OTRO libro —una copia, un escenario— pero NO a cualquier
 * planilla: este lector está atado a la estructura del Flujo de Fondos (pestañas `Caja`,
 * `Cobranzas`, `Compras`, `Cheques Emitidos` con sus filas de encabezado). Contra un libro con otra
 * forma no falla: devuelve ceros, que es peor. Quien lo apunte a otro lado tiene que verificar la
 * estructura antes — para eso está `verificarEstructuraFlujo`.
 */
export async function cashBriefing(google, hoy = new Date(), opts = {}) {
  const ID = opts.spreadsheetId || CASHFLOW_ID
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const fin7 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 7)
  const dentro7 = (d) => d && d >= hoy0 && d <= fin7
  const mesActual = `${MESES[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}` // "jul-26"

  // 1) CAJA — último saldo por cuenta (ledger Fecha·Cuenta·Saldo).
  //
  // POR ENCABEZADO, NO POR POSICIÓN. Bug real (2026-07-20): la pestaña Caja ganó una columna "ID"
  // al principio y este parseo, que leía índices fijos, pasó a tomar la FECHA como cuenta y el
  // NOMBRE DE LA CUENTA como saldo → parseMonto de un texto = 0. El briefing diario informaba
  // caja $0 sin fallar ni avisar. Una columna nueva no puede convertir el saldo de la empresa en
  // cero en silencio: se localizan las columnas por su título.
  const cajaRaw = await google.readSheetValues(ID, 'Caja!A1:H200').catch(() => [])
  const hIdx = cajaRaw.findIndex((r) => (r || []).some((c) => /^\s*cuenta\s*$/i.test(String(c ?? ''))))
  const head = (cajaRaw[hIdx] || []).map((c) => String(c ?? '').trim().toLowerCase())
  const col = (re, def) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : def }
  const iFecha = col(/^fecha del saldo/, col(/^fecha/, 0))
  const iCuenta = col(/^cuenta/, 1)
  // "Saldo en pesos" (con la USD ya convertida por la pestaña), NUNCA "Saldo en moneda de origen":
  // el regex viejo /^saldo/ tomaba la columna de ORIGEN y la cuenta en dólares entraba como U$S 581
  // en vez de ~$865.000 → la caja quedaba subcontada. Bug real 23/07 (con el rediseño de CAJA).
  const iSaldo = col(/^saldo en pesos/, col(/^saldo/, 2))
  // ═══ EL TOTAL SALE DE LA FILA "TOTAL DISPONIBILIDADES" DE LA PESTAÑA — UNA FUENTE ═══
  //
  // POR QUÉ (23/07). La pestaña CAJA se rediseñó en secciones (1..10). Este parseo sumaba TODA fila
  // con un rótulo y un número, así que levantaba filas de sección y control —"⇒ TOTAL QUE SALIÓ DE
  // LA CUENTA", "Control: lo que el extracto dice", "Costo financiero del descubierto"— y daba una
  // caja de $384.000.000 falsa (la real es ~$17M). El motor de Ingeniería Financiera lo mostró.
  //
  // La pestaña YA computa su propio "Total disponibilidades" (con la USD convertida): es la fuente
  // única del total, y además MARCA dónde terminan las cuentas. Debajo viven las secciones que no son
  // disponibilidades. Se lee ese total y se cortan las cuentas ahí; nada de re-sumar a mano.
  const iTotal = cajaRaw.findIndex((r, i) => i > hIdx && /^total disponibilidades/i.test(String(r?.[0] ?? '').trim()))
  const desde = hIdx >= 0 ? hIdx + 1 : 4
  const hasta = iTotal > hIdx ? iTotal : cajaRaw.length
  const saldos = new Map()
  for (let i = desde; i < hasta; i++) {
    const r = cajaRaw[i]
    const cuenta = String(r?.[iCuenta] ?? '').trim()
    if (!cuenta || r?.[iSaldo] == null || String(r?.[iSaldo]).trim() === '') continue
    const monto = parseMonto(r?.[iSaldo])
    // Un saldo que no parsea a número NO es cero: es una fila que no entendimos. Se saltea.
    if (!Number.isFinite(monto) || (monto === 0 && !/^[\s$]*0/.test(String(r[iSaldo])))) continue
    const f = parseFecha(r?.[iFecha]); const prev = saldos.get(cuenta)
    if (!prev || (f && (!prev.f || f >= prev.f))) saldos.set(cuenta, { saldo: monto, f, fecha: String(r?.[iFecha] ?? '').trim() })
  }
  // El total autoritativo es el de la pestaña cuando existe (una fuente); si no —esquema simple, como
  // el mock del test—, se suma lo detectado.
  const cajaTotal = iTotal > hIdx
    ? parseMonto(cajaRaw[iTotal]?.[iSaldo])
    : [...saldos.values()].reduce((s, v) => s + v.saldo, 0)

  // 2) COBRANZAS del mes en curso (02_Cobranzas: R idx17 "Mes cobro", O idx14 Estado, M idx12 Total,
  //    G idx6 Obra/Cliente, Q idx16 "Fecha cobro" fecha real) + VENCIDAS (fecha de cobro ya pasó y
  //    sin cobrar = plata que debería estar y no está). "Vencida" NO interpreta la taxonomía de
  //    estados (Pendiente/Proyectado/Facturado…): solo "no Cobrado" + fecha de cobro < hoy. Honesto.
  const cob = await google.readSheetValues(ID, 'Cobranzas!A5:R2000').catch(() => [])
  let cobrado = 0, porCobrar = 0, entra7 = 0
  const vencidas = []
  for (const r of cob) {
    const estado = String(r?.[14] ?? '').trim()
    const cobradoYa = /cobrado/i.test(estado)
    const monto = parseMonto(r?.[12])
    // cobranzas del mes en curso (por "Mes cobro (auto)")
    if (String(r?.[17] ?? '').trim().toLowerCase() === mesActual) {
      if (cobradoYa) cobrado += monto; else porCobrar += monto
    }
    // Por "Fecha cobro" real (idx16), sin cobrar: VENCIDA (pasada) o ENTRA esta semana (dentro 7d)
    if (!cobradoYa && monto > 0) {
      const fc = parseFecha(r?.[16])
      if (fc && fc < hoy0) vencidas.push({ cliente: String(r?.[6] ?? '').trim() || '(sin cliente)', estado, fecha: String(r?.[16]).trim(), monto, dias: Math.round((hoy0 - fc) / 86400000) })
      else if (dentro7(fc)) entra7 += monto
    }
  }
  vencidas.sort((a, z) => z.dias - a.dias)
  const totalVencido = vencidas.reduce((s, v) => s + v.monto, 0)

  // 3) VENCIMIENTOS próximos 7 días — Cheques Emitidos (registro FISICO/ECHEQ: E idx4 proveedor,
  //    F idx5 monto, I idx8 fecha pago, K idx10 DEBITADO) + Tarjeta (H idx7 fecha, E idx4 monto,
  //    J idx9 DEBITADO). La pestaña se llama "Cheques Emitidos" (antes "Cheques", renombrada en el
  //    rediseño): apuntar al nombre viejo devolvía [] y el briefing informaba $0 de vencimientos.
  const chq = await google.readSheetValues(ID, 'Cheques Emitidos!A1:L997').catch(() => [])
  const cheques = []
  for (const r of chq) {
    if (!/^(fisico|echeq)$/i.test(String(r?.[0] ?? '').trim())) continue // sólo filas del registro
    if (/^si$/i.test(String(r?.[10] ?? '').trim())) continue // ya debitado: ya salió de la cuenta
    const f = parseFecha(r?.[8]); if (dentro7(f)) cheques.push({ proveedor: String(r?.[4] ?? '').trim(), monto: parseMonto(r?.[5]), fecha: String(r?.[8]).trim() })
  }
  const tar = await google.readSheetValues(ID, 'Tarjeta de Credito!A3:J998').catch(() => [])
  const tarjeta = []
  for (const r of tar) { if (/^si$/i.test(String(r?.[9] ?? '').trim())) continue; const f = parseFecha(r?.[7]); if (dentro7(f)) tarjeta.push({ proveedor: String(r?.[2] ?? '').trim(), monto: parseMonto(r?.[4]), fecha: String(r?.[7]).trim() }) }
  const totalVenc = [...cheques, ...tarjeta].reduce((s, v) => s + v.monto, 0)

  return {
    fecha: hoy.toLocaleDateString('es-AR'),
    caja: { total: cajaTotal, cuentas: [...saldos.entries()].map(([cuenta, v]) => ({ cuenta, saldo: v.saldo, al: v.fecha })) },
    cobranzas_mes: { mes: mesActual, cobrado, por_cobrar: porCobrar },
    cobranzas_vencidas: { total: totalVencido, items: vencidas },
    vencimientos_7dias: { total: totalVenc, cheques, tarjeta },
    // PROYECCIÓN de caja a 7 días (ESTIMADA, no hecho): caja hoy + lo que tiene fecha de cobro esta
    // semana (sin cobrar) − lo que hay que pagar esta semana. Asume que se cobra lo prometido; NO
    // incluye lo vencido (fecha ya fallada = incierto). Responde "¿cierro la semana en positivo?".
    proyeccion_7dias: { caja_hoy: cajaTotal, entra: entra7, sale: totalVenc, proyectado: cajaTotal + entra7 - totalVenc },
  }
}

/** Texto listo para mostrar (markdown breve). */
export function formatBriefing(b) {
  const L = [`☀️ **Briefing de caja — ${b.fecha}** _(dato real, 0 API)_`, '']
  L.push('💵 **Caja hoy**')
  for (const c of b.caja.cuentas) L.push(`  • ${c.cuenta}: ${fmt(c.saldo)} _(al ${c.al})_`)
  if (b.caja.cuentas.length > 1) L.push(`  • **Total: ${fmt(b.caja.total)}**`)
  L.push('', `📥 **Cobranzas ${b.cobranzas_mes.mes}**: cobrado ${fmt(b.cobranzas_mes.cobrado)} · por cobrar ${fmt(b.cobranzas_mes.por_cobrar)}`)
  const venc = b.cobranzas_vencidas
  if (venc && venc.items.length) {
    L.push('', `🔴 **Cobranzas VENCIDAS: ${fmt(venc.total)}** _(fecha de cobro ya pasó, sin cobrar — llamar hoy)_`)
    for (const v of venc.items.slice(0, 8)) L.push(`  • ${v.cliente}: ${fmt(v.monto)} _(vencía ${v.fecha}, hace ${v.dias}d, ${v.estado})_`)
    if (venc.items.length > 8) L.push(`  • …y ${venc.items.length - 8} más`)
  }
  L.push('', `📤 **A pagar en 7 días: ${fmt(b.vencimientos_7dias.total)}**`)
  const items = [...b.vencimientos_7dias.cheques.map((c) => ({ ...c, t: 'cheque' })), ...b.vencimientos_7dias.tarjeta.map((c) => ({ ...c, t: 'tarjeta' }))]
    .sort((a, z) => (parseFecha(a.fecha) || 0) - (parseFecha(z.fecha) || 0))
  for (const it of items.slice(0, 12)) L.push(`  • ${it.fecha} · ${it.proveedor}: ${fmt(it.monto)} _(${it.t})_`)
  if (items.length > 12) L.push(`  • …y ${items.length - 12} más`)
  if (!items.length) L.push('  • Nada por vencer esta semana.')
  const p = b.proyeccion_7dias
  if (p) {
    const signo = p.proyectado < 0 ? '⚠️ ' : ''
    L.push('', `🔮 **Proyección caja 7 días (estimada): ${signo}${fmt(p.proyectado)}**`)
    L.push(`  _caja ${fmt(p.caja_hoy)} + entra ${fmt(p.entra)} − paga ${fmt(p.sale)} · asume que se cobra lo de esta semana; no cuenta lo vencido_`)
  }
  return L.join('\n')
}
