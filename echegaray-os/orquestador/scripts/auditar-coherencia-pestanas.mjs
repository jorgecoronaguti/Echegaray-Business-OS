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
import { PASOS_RETIRADOS } from '../lib/flujo-caja-pasos.mjs'

/**
 * PESTAÑAS SIN DUEÑO ACTIVO — deuda declarada, no un fallo de hoy.
 *
 * `Materiales` está vieja desde el 14/08 y eso NO es un descuido: su generador se retiró porque cada
 * corrida apilaba una capa sobre el archivo del dueño. Llamarla «atrasada» pondría el control en rojo
 * todos los días por una decisión tomada a propósito, y un control que grita siempre deja de leerse.
 * Se dice lo que es: nadie la mantiene, y el motivo está escrito en `PASOS_RETIRADOS`.
 */
const SIN_DUENO = new Set(PASOS_RETIRADOS
  .filter((p) => /materiales/i.test(String(p.script ?? '')))
  .map(() => 'Materiales'))

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
    tieneGenerador: SIN_DUENO.has(p) ? false : undefined,
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

  // ═══ LAS COLUMNAS DE NÓMINA SE RESUELVEN POR ENCABEZADO, NO POR ÍNDICE (08/09/2026) ═══
  //
  // Esto leía Nómina con índices del layout viejo (… ADELANTO · POR BANCO · EN EFECTIVO · TOTAL A
  // PAGAR). La pestaña intercaló «YA TRANSFERIDO» entre ADELANTO y POR BANCO, y el índice 4 pasó a
  // leer los adelantos por banco ($94.796) donde el cruce esperaba lo que se transfiere; el 6, «EN
  // EFECTIVO» donde esperaba el total. Publicó «obreros · lo que se les TRANSFIERE ✗ $94.796 vs
  // $3.640.000» —un rojo fabricado por el lector—. Se busca la fila «Persona» y el rótulo exacto.
  const colNomina = (rotulo) => {
    const enc = (nomina ?? []).find((x) => String((x ?? [])[0] ?? '').trim() === 'Persona')
    const i = enc ? enc.findIndex((c) => String(c ?? '').trim().toUpperCase() === rotulo) : -1
    return i >= 0 ? i : null
  }
  const deNomina = (re, rotulo) => { const i = colNomina(rotulo); return i == null ? null : num(porRotulo(nomina, re, i)) }
  // «POR BANCO» sale de los recibos de la quincena (`_RECIBOS_RAW`). Hasta que se cargan vale 0, y
  // Jornales publica entonces el lote de la quincena anterior como estimación: comparar cero contra
  // esa estimación es un ✗ por construcción. Sin recibos, el cruce es NO VERIFICABLE y se dice.
  const porBanco = (re) => { const v = deNomina(re, 'POR BANCO'); return v != null && v > 0 ? v : null }
  const SIN_RECIBOS = 'Nómina publica POR BANCO = 0: los recibos de la quincena no están cargados y Jornales muestra la estimación (lote anterior)'

  // A · La oficina de la quincena, dicha por las dos pestañas que la pagan.
  cruces.push(cruzar({
    que: 'oficina · lo que se le paga a los 2', izquierda: 'Nómina', derecha: 'Jornales por Quincena',
    a: deNomina(/^⇒\s*2 persona/, 'TOTAL A PAGAR'),
    b: num(porRotulo(jornales, /^Oficina/, 3)),
  }))

  // A bis · CÓMO SE REPARTE ese pago. Que el TOTAL coincida no alcanza: el 31/08 las dos pestañas
  // cerraban en $3.600.000 y diferían en $473.716,88 entre banco y efectivo, porque Jornales
  // publicaba la mitad calculada en vez de lo que dicen los recibos. Un total que cierra con un
  // reparto que no cierra es plata mal transferida con cara de estar bien.
  const bancoOficina = porBanco(/^⇒.*de oficina/)
  cruces.push(cruzar({
    que: 'oficina · lo que se le TRANSFIERE', izquierda: 'Nómina', derecha: 'Jornales por Quincena',
    a: bancoOficina, b: num(porRotulo(jornales, /^Oficina/, 6)), nota: bancoOficina == null ? SIN_RECIBOS : null,
  }))
  const bancoObreros = porBanco(/^⇒\s*\d+ persona\(s\)$/)
  cruces.push(cruzar({
    que: 'obreros · lo que se les TRANSFIERE', izquierda: 'Nómina', derecha: 'Jornales por Quincena',
    a: bancoObreros, b: num(porRotulo(jornales, /^Obreros/, 6)), nota: bancoObreros == null ? SIN_RECIBOS : null,
  }))

  // B · CUÁNTA GENTE COBRA ESTA QUINCENA — y no «cuánta gente hay», que es otra pregunta.
  //
  // La primera versión cruzaba el ⇒ de Plantel (19) contra Jornales (17) y daba rojo. No era un
  // defecto de las pestañas: Plantel es el plantel del AÑO —incluye a los dos que ya cobraron su
  // liquidación final— y Jornales es quién cobra AHORA. Comparar los dos es la trampa de «una vista
  // que cambia de significado»: dos números correctos que no hablan de lo mismo.
  //
  // Lo que sí tiene que cerrar es Nómina contra Jornales: las dos contestan la MISMA pregunta, y de
  // hecho Jornales cita a Nómina desde el 31/08. Si alguna vez difieren, una de las dos se
  // desconectó.
  const personasNomina = num(String(porRotulo(nomina, /^⇒\s*\d+ persona\(s\)$/, 0) ?? '').replace(/\D/g, ''))
  const personasOficina = num(porRotulo(nomina, /^⇒.*de oficina/, 1)) ?? num(String(porRotulo(nomina, /^⇒.*de oficina/, 0) ?? '').replace(/\D/g, ''))
  const personasJornales = num(porRotulo(jornales, /^Obreros/, 1))
  cruces.push(cruzar({
    que: 'obreros que cobran esta quincena', izquierda: 'Nómina', derecha: 'Jornales por Quincena',
    a: personasNomina, b: personasJornales, tolerancia: 0,
  }))
  cruces.push(cruzar({
    que: 'lo que se le paga a los obreros', izquierda: 'Nómina', derecha: 'Jornales por Quincena',
    a: deNomina(/^⇒\s*\d+ persona\(s\)$/, 'TOTAL A PAGAR'), b: num(porRotulo(jornales, /^Obreros/, 3)),
  }))
  // El plantel del año se INFORMA, no se cruza: su universo es otro a propósito.
  const personasPlantel = num(String(porRotulo(plantel, /^⇒\s*\d+ persona/, 0) ?? '').replace(/\D/g, ''))
  if (personasPlantel != null && personasNomina != null && personasOficina != null) {
    console.log(`\n  ℹ Plantel declara ${personasPlantel} persona(s) del AÑO; esta quincena cobran `
      + `${personasNomina} obrero(s) + ${personasOficina} de oficina. La diferencia son los que ya cobraron su liquidación final.`)
  }

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
    // La causa, cuando el cruce la sabe: «no se pudo leer» esconde que la celda SÍ se leyó y vale 0.
    const detalle = c.estado === COHERENCIA.NO_VERIFICABLE ? (c.nota ?? 'no se pudo leer una de las dos')
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
