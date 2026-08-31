#!/usr/bin/env node
// ¿ESTÁN TODAS AL DÍA Y CONDICEN ENTRE SÍ?
//
//   node orquestador/scripts/auditar-coherencia-pestanas.mjs
//
// Contesta las dos preguntas que el dueño hizo el 31/08/2026 y que hasta hoy se contestaban a mano,
// una pestaña por vez: «el control de todas las pestañas es para determinar q todas estan
// actualizadas y condicen entre si».
//
// NO ESCRIBE NADA. Lee el Sheet, lee `sheet_tab_firma` y decide con `lib/coherencia-pestanas.mjs`,
// que es núcleo puro y tiene los casos rojos probados.
//
// SALE 1 SI ALGO DISCREPA O SI ALGO NO SE PUDO MIRAR. Un control que sale 0 sin haber podido mirar
// es peor que no tenerlo: este repo ya pagó $4,1 M por uno así.
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { getTokenFor, OAUTH_SCOPES } from '../lib/google-oauth.mjs'
import { query } from '../lib/db.mjs'
import { frescuraDe, cruzar, veredicto, FRESCURA, COHERENCIA } from '../lib/coherencia-pestanas.mjs'
import { SUBCONTRATISTAS_CON_LIQUIDACION } from '../lib/nomina-banco-recibo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const CUENTA = process.env.ORQ_SHEETS_CUENTA || 'jorge@ecsas.com.ar'

/** Las del Flujo de Fondos que el OS mantiene. Las réplicas `_RAW` van aparte: su frescura la
 *  gobierna su fuente, no este pipeline. */
const MANTENIDAS = [
  'Compras', 'Jornales por Quincena', 'Nómina', 'Plantel', 'Cargas Sociales',
  'Impuestos y Financieros', 'Recurrentes', 'Estructura', 'Materiales', 'Proveedores',
  'Cobranzas', 'OBRAS', 'Tarjeta de Credito', 'Cheques Recibidos', 'Cheques Emitidos',
  'CAJA', 'Cash Flow Semanal', 'Cash Flow Mensual', 'Calendario de Cobros', 'SUBCONTRATISTAS',
]

const num = (v) => {
  const s = String(v ?? '').replace(/[^\d,.\-()]/g, '').replace(/\((.*)\)/, '-$1')
  if (!s) return null
  const n = Number(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
/**
 * Busca una fila por su RÓTULO en la columna A y devuelve la celda de la columna pedida.
 *
 * Por rótulo y nunca por posición: una fila insertada mueve todo menos el texto.
 *
 * EXIGE QUE LA CELDA PEDIDA TENGA ALGO, y eso no es un detalle: `Jornales por Quincena` tiene el
 * subtítulo «Obreros · quincena 17/8→31/8» tres filas ARRIBA de la fila de datos «Obreros · UOCRA».
 * Sin esta condición el control enganchaba el subtítulo, leía una celda vacía y publicaba «Plantel 19
 * · Jornales 2»: un rojo inventado, que es tan malo como un verde inventado.
 */
const porRotulo = (filas, re, col) => {
  const f = (filas ?? []).find((x) => re.test(String((x ?? [])[0] ?? '')) && String((x ?? [])[col] ?? '').trim() !== '')
  return f ? f[col] : null
}
const cuentaErrores = (filas) => (filas ?? []).flat()
  .filter((c) => /#(REF|VALUE|N\/A|NAME|ERROR|DIV|NUM|NULL)!|#¿/.test(String(c ?? ''))).length

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: OAUTH_SCOPES, getToken: getTokenFor(CUENTA), soloUsuario: true })

  // ── 1) FRESCURA ────────────────────────────────────────────────────────────
  let firmas = new Map(); let candados = new Set()
  try {
    const { rows } = await query('select pestana, max(escrito_en) escrito_en from public.sheet_tab_firma group by pestana')
    firmas = new Map(rows.map((r) => [r.pestana, r.escrito_en]))
  } catch (e) { console.error('⚠ no pude leer sheet_tab_firma:', String(e?.message ?? e).slice(0, 120)) }
  try {
    const { rows } = await query('select pestana from public.sheet_pestanas_bloqueadas')
    candados = new Set(rows.map((r) => r.pestana))
  } catch { /* sin tabla: ninguna trabada, y se ve en la salida */ }

  const frescuras = MANTENIDAS.map((p) => frescuraDe({
    pestana: p, escritoEn: firmas.get(p) ?? null, candado: candados.has(p),
  }))

  console.log('\n═══ 1 · ¿ESTÁ CADA UNA AL DÍA? ═══\n')
  for (const f of frescuras) {
    const marca = f.estado === FRESCURA.AL_DIA ? '✓' : f.estado === FRESCURA.CANDADO ? '🔒' : '⚠'
    console.log(`${marca} ${f.pestana.padEnd(24)} ${f.estado.padEnd(15)} ${f.horas == null ? '' : `hace ${f.horas} h`}`)
  }

  // ── 2) COHERENCIA ──────────────────────────────────────────────────────────
  const leer = async (p, r) => { try { return await google.readSheetValues(ID, `'${p}'!${r}`) } catch { return null } }
  const [nomina, jornales, plantel, subcon] = await Promise.all([
    leer('Nómina', 'A1:N200'), leer('Jornales por Quincena', 'A1:N120'),
    leer('Plantel', 'A1:Q140'), leer('SUBCONTRATISTAS', 'A1:L90'),
  ])

  const cruces = []

  // A · La oficina de la quincena, dicha por las dos pestañas que la pagan.
  cruces.push(cruzar({
    que: 'oficina · lo que se le paga a los 2', izquierda: 'Nómina', derecha: 'Jornales por Quincena',
    a: num(porRotulo(nomina, /^⇒\s*2 persona/, 6)),
    b: num(porRotulo(jornales, /^Oficina/, 3)),
  }))

  // B · Cuánta gente declara cada una. Un plantel que no coincide es un costo que no coincide.
  const personasPlantel = num(String(porRotulo(plantel, /^⇒\s*\d+ persona/, 0) ?? '').replace(/\D/g, ''))
  const personasJornales = (num(porRotulo(jornales, /^Obreros/, 1)) ?? 0) + (num(porRotulo(jornales, /^Oficina/, 1)) ?? 0)
  cruces.push(cruzar({
    que: 'cuánta gente hay', izquierda: 'Plantel', derecha: 'Jornales por Quincena',
    a: personasPlantel, b: personasJornales || null, tolerancia: 0,
  }))

  // C · Los subcontratistas que cobran por nómina, ¿figuran en su pestaña?
  const textoSub = (subcon ?? []).flat().map((c) => String(c ?? '').toUpperCase()).join(' | ')
  const enPestana = subcon == null ? null
    : Object.values(SUBCONTRATISTAS_CON_LIQUIDACION)
      .filter((n) => textoSub.includes(String(n).toUpperCase().split(' ')[0])).length
  cruces.push(cruzar({
    que: 'subcontratistas del grupo que cobran por nómina', izquierda: 'nomina-banco-recibo.mjs', derecha: 'SUBCONTRATISTAS',
    a: Object.keys(SUBCONTRATISTAS_CON_LIQUIDACION).length, b: enPestana, tolerancia: 0,
  }))

  // D · Celdas en error: cero es el único número aceptable en una pestaña calculada.
  for (const [p, filas] of [['Nómina', nomina], ['Jornales por Quincena', jornales], ['Plantel', plantel], ['SUBCONTRATISTAS', subcon]]) {
    cruces.push(cruzar({ que: `celdas en error en ${p}`, izquierda: p, derecha: 'cero', a: filas == null ? null : cuentaErrores(filas), b: 0, tolerancia: 0 }))
  }

  console.log('\n═══ 2 · ¿CONDICEN ENTRE SÍ? ═══\n')
  for (const c of cruces) {
    const marca = c.estado === COHERENCIA.CONDICE ? '✓' : c.estado === COHERENCIA.DISCREPA ? '✗' : '?'
    const detalle = c.estado === COHERENCIA.NO_VERIFICABLE ? 'no se pudo leer una de las dos'
      : `${c.izquierda} ${c.a} · ${c.derecha} ${c.b}${c.delta ? ` · difieren en ${c.delta.toLocaleString('es-AR')}` : ''}`
    console.log(`${marca} ${c.que.padEnd(46)} ${detalle}`)
  }

  const v = veredicto({ frescuras, cruces })
  console.log(`\n═══ VEREDICTO: ${v.color} ═══`)
  if (v.atrasadas.length) console.log(`  atrasadas: ${v.atrasadas.join(', ')}`)
  if (v.sinMirar.length) console.log(`  sin firma (no se pudieron mirar): ${v.sinMirar.join(', ')}`)
  if (v.discrepan) console.log(`  ${v.discrepan} cruce(s) que NO cierran`)
  if (v.ciegos) console.log(`  ${v.ciegos} cruce(s) que no se pudieron verificar`)
  process.exitCode = v.salida
}

main().catch((e) => { console.error('falló:', e?.message ?? e); process.exit(1) })
