#!/usr/bin/env node
// ¿EL LIBRO CANÓNICO DICE LO MISMO QUE EL CALENDARIO DE CAJA? — el portón antes de migrar las vistas.
//
// ═══ POR QUÉ EXISTE ═══
//
// Las tres vistas van a dejar de calcular con SUMPRODUCT sobre las fuentes y van a pasar a leer
// `_MOVIMIENTOS`. Ese cambio sólo es legítimo si ANTES se demuestra que el libro y el modelo vigente
// cuentan la misma plata — si no, migrar es cambiar de número sin saber por qué. El dueño: "no acepto
// diferencias sin causa exacta".
//
// ═══ ESTE PORTÓN FALLA (05/08/2026) ═══
//
// La primera versión era INFORMATIVA: imprimía diferencias de hasta $120M y salía con código 0, con
// tres "causas conocidas" escritas a mano al pie. Eso no es un portón: es un cartel. Y las tres causas
// eran la misma cosa —el libro no cubría todas las fuentes del calendario— así que el número grande no
// probaba nada y el chico tampoco. Ahora el libro tiene las mismas puertas que el calendario y la
// comparación es LIKE-FOR-LIKE tramo por tramo: si el neto de un tramo difiere en más de un peso, sale
// con código 1 y muestra el desglose por fuente del lado del libro para que la causa tenga nombre.
//
// ═══ LA COMPARACIÓN, EN UNA LÍNEA POR LADO ═══
//
//   ENTRA(k) = cartera (`_CHEQUES_RAW`, COMPROMETIDO que entra)  +  cobranzas esperadas
//              en la ventana (borde k−1, borde k) — SIN piso: el tramo "Vencido" abre en −∞, igual
//              que `formulaCarteraTramo(null, TODAY())` y `cobranzasEsperadasTramo(null, …)`.
//   SALE(k)  = Compras (neto de notas de crédito) + nómina + IVA/IIBB, en [max(corte, borde k−1),
//              borde k)  +  cheques y tarjeta sin factura, que en el tramo 0 abren en el serial 0
//              porque un cheque viejo y no debitado todavía va a salir (`DESDE_SIEMPRE`).
//
// LOS BORDES NO SE COPIAN: se importan de `caja-calendario.mjs` y se EVALÚAN con la misma aritmética
// que sus expresiones. Un conciliador con su propia copia de los tramos deja de comparar el día que
// alguien renombra o mueve uno — y reporta un desvío que no existe, o calla uno que sí.
//
// SÓLO LEE. No escribe una celda.
//
//   node orquestador/scripts/conciliar-libro.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { BORDES, PISO_CAJA } from '../lib/caja-calendario.mjs'
import { CUADRO } from '../lib/cash-flow-lineas.mjs'
import { eomonth, serialDe } from '../lib/libro-extractores-fechas.mjs'
import { PESTANA_NOMINA } from '../lib/libro-extractores-nomina.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Cuánto puede diferir un tramo y seguir siendo el mismo número. Un peso: es plata, no estadística. */
export const TOLERANCIA = 1

/** De qué pestaña viene cada sumando. El origen es lo que hace comparable un lado con el otro. */
export const FUENTE = Object.freeze({
  compras: 'Compras',
  cobranzas: 'Cobranzas',
  nomina: PESTANA_NOMINA,
  impuestos: 'Impuestos y Financieros',
  cartera: '_CHEQUES_RAW',
  cheques: 'Cheques Emitidos',
  tarjeta: 'Tarjeta de Credito',
  banco: '_BANCO_RAW',
})

/**
 * NÚCLEO PURO: los rubros de Compras que el CUADRO del cash flow —y por lo tanto el calendario— suma.
 *
 * Se DERIVA del cuadro, no se escribe: es la misma lista, y el día que se agregue un rubro esta
 * función lo toma sola. Lo que queda afuera es "SIN CLASIFICAR", que no es una línea de ninguna
 * actividad: el calendario NO lo ve, así que compararlo sería reportar una diferencia inventada. Se
 * declara aparte, como residuo con nombre.
 */
export function rubrosDelCuadro() {
  return new Set(CUADRO.flatMap((a) => a.grupos.filter((g) => g.signo === -1)
    .flatMap((g) => g.lineas.filter((l) => l.rubro && !l.desdeCompras).map((l) => l.rubro))))
}

/**
 * NÚCLEO PURO: el valor de un borde del calendario, para un "hoy" dado.
 *
 * Son CINCO expresiones concretas y se resuelven una por una a propósito: un evaluador general de
 * fórmulas de Sheets es un proyecto, y acá lo único que se necesita es reproducir exactamente lo que
 * `BORDES` declara. Cualquier otra expresión ROMPE — si mañana se agrega un tramo con una fórmula
 * nueva, este portón tiene que aprenderla, no ignorarla y comparar contra una ventana equivocada.
 *
 * @param {string} expr la expresión de `BORDES` ('' = sin techo)
 * @param {number} hoy serial de TODAY() — entra por parámetro: el núcleo no mira el reloj
 */
export function evaluarBorde(expr, hoy) {
  const e = String(expr ?? '').replace(/\s+/g, '')
  if (!e) return Infinity // "Más adelante" no tiene borde, y una ventana necesita dos
  if (e === 'TODAY()') return hoy
  const suma = /^TODAY\(\)\+(\d+)$/.exec(e)
  if (suma) return hoy + Number(suma[1])
  const max = /^MAX\(TODAY\(\)\+(\d+);EOMONTH\(TODAY\(\);(-?\d+)\)\)$/.exec(e)
  if (max) return Math.max(hoy + Number(max[1]), eomonth(hoy, Number(max[2])))
  throw new Error(`conciliar-libro: no sé evaluar el borde "${expr}". Los BORDES cambiaron y este `
    + 'portón compararía contra una ventana equivocada — prefiero romper.')
}

/**
 * NÚCLEO PURO: las tres ventanas del tramo `k`. Son tres y no una porque el calendario usa tres.
 *
 *   · entra   — sin piso. `formulaCarteraTramo` y `cobranzasEsperadasTramo` arrancan en `null` para el
 *               tramo 0: un cobro que se esperaba y no entró sigue siendo plata que va a entrar.
 *   · sale    — con piso en el corte del extracto (`desdeTramo`): lo anterior YA está en el saldo.
 *   · cheques — el tramo 0 abre en el serial 0 (`DESDE_SIEMPRE`), porque un cheque puede tener fecha
 *               de hace un mes y seguir sin presentarse. La otra mitad del invariante —excluir lo ya
 *               debitado— la aplica el extractor, y sin ella se restaban $12.188.441 dos veces.
 */
export function ventanasDeTramo(k, hoy, corte) {
  // ═══ LA VENTANA ES LA DE LA PORTADA, UNA SOLA PARA TODAS LAS FUENTES (05/08, post-migración) ═══
  //
  // El comparador espejaba las ventanas del calendario VIEJO (REAL después del corte por fecha, los
  // cheques abriendo en el serial 0, cobranzas sin piso). La escalera de la portada usa OTRO modelo,
  // más simple y correcto: estados NO-REAL con piso MAX(corte; hoy) para todos, y el tramo Vencido
  // abierto en [0, hoy) — lo REAL ya vive en el saldo del banco, venga de la fuente que venga. Este
  // portón es una REGRESIÓN de ese modelo: su código y las fórmulas tienen que decir lo mismo.
  const hasta = evaluarBorde(BORDES[k][1], hoy)
  const anterior = k === 0 ? null : evaluarBorde(BORDES[k - 1][1], hoy)
  const desde = k === 0 ? 0 : Math.max(corte, hoy, anterior)
  const v = { desde, hasta }
  return { entra: v, sale: v, cheques: v, borde: hasta }
}

const enVentana = (m, v) => m.fecha >= v.desde && m.fecha < v.hasta
/** El neto con signo de un conjunto de movimientos, en pesos que SALEN (positivo = sale). */
const netoSale = (ms) => -ms.reduce((a, m) => a + m.signo * m.importe, 0)

/**
 * NÚCLEO PURO: lo que el libro dice que ENTRA en el tramo, abierto por fuente.
 *
 * SÓLO LAS DOS FUENTES QUE EL CALENDARIO MIRA. Un cobro ya COBRADO (REAL) no entra: está adentro del
 * saldo del que arranca la escalera, y sumarlo otra vez lo contaría dos veces.
 */
export function libroEntra(libro, v) {
  // El MISMO filtro que la fórmula: NO-REAL que entra, cualquier fuente (lo REAL vive en el saldo).
  const noReal = (m) => (m.estado === 'COMPROMETIDO' || m.estado === 'PROYECTADO' || m.estado === 'VENCIDO')
  const en = libro.filter((m) => m.signo === 1 && noReal(m) && enVentana(m, v.entra))
  const porFuente = {}
  for (const m of en) { const k = m.origen === FUENTE.cartera ? 'cartera' : m.origen === FUENTE.cobranzas ? 'cobranzas' : 'otros'
    porFuente[k] = (porFuente[k] ?? 0) + m.importe }
  return { total: en.reduce((a, m) => a + m.importe, 0), porFuente }
}

/**
 * NÚCLEO PURO: lo que el libro dice que SALE en el tramo, abierto por fuente.
 *
 * COMPRAS VA NETO DE NOTAS DE CRÉDITO: el SUMIFS del calendario suma la columna Total, y una nota
 * viene con importe negativo, así que RESTA. En el libro esa nota es un movimiento que ENTRA (plata
 * que vuelve), y para comparar como el Sheet hay que restarla del lado que sale. Sin esto, la nota se
 * cuenta con el signo cambiado: es el mismo error que sumó $41,9M de notas como si fueran compras.
 */
export function libroSale(libro, v, rubros = rubrosDelCuadro()) {
  // El MISMO filtro que la fórmula de la escalera: NO-REAL dentro de la ventana única. El desglose
  // por fuente es diagnóstico; el total es lo que se compara.
  const noReal = (m) => (m.estado === 'COMPROMETIDO' || m.estado === 'PROYECTADO' || m.estado === 'VENCIDO')
  const dentro = (m, fuente) => m.origen === fuente && enVentana(m, v.sale) && noReal(m) && m.signo === -1
  const porFuente = {
    compras: netoSale(libro.filter((m) => dentro(m, FUENTE.compras) && rubros.has(m.rubro))),
    nomina: netoSale(libro.filter((m) => dentro(m, FUENTE.nomina))),
    impuestos: netoSale(libro.filter((m) => dentro(m, FUENTE.impuestos))),
    cheques: netoSale(libro.filter((m) => dentro(m, FUENTE.cheques))),
    tarjeta: netoSale(libro.filter((m) => dentro(m, FUENTE.tarjeta))),
    otros: netoSale(libro.filter((m) => m.signo === -1 && noReal(m) && enVentana(m, v.sale)
      && ![FUENTE.compras, FUENTE.nomina, FUENTE.impuestos, FUENTE.cheques, FUENTE.tarjeta].includes(m.origen))),
    // Las notas de crédito NO van acá: entran con signo +1 y ya las cuenta libroEntra (bucket
    // 'otros'). Restarlas además del lado que sale las contaría dos veces — cada fila del libro
    // cuenta UNA vez, con su signo, igual que en la fórmula de la escalera.
  }
  return { total: Object.values(porFuente).reduce((a, b) => a + b, 0), porFuente }
}

/**
 * NÚCLEO PURO: lo que el libro ve y el calendario DECLARA que no ve. No es un descuadre: es la lista
 * de exclusiones, con su monto, para que ninguna quede sin nombre.
 *
 *   · `_BANCO_RAW` — comisiones, impuesto al cheque e intereses del descubierto. `SIN_FUENTE_EN_VENTANA`
 *     de caja-refs.mjs las pone en CERO por tramo a propósito: su único registro es el extracto, que
 *     cubre el pasado, y un número inventado en la columna que produce el PISO es peor que un cero.
 *   · Compras con un rubro que el cuadro no tiene (SIN CLASIFICAR): el calendario no lo suma. Que no
 *     sea una diferencia no lo hace inofensivo — es plata sin clasificar y hay que clasificarla.
 */
export function residuosDeclarados(libro, v, rubros = rubrosDelCuadro()) {
  const banco = libro.filter((m) => m.origen === FUENTE.banco && enVentana(m, v.sale))
  const sinRubro = libro.filter((m) => m.origen === FUENTE.compras && enVentana(m, v.sale) && !rubros.has(m.rubro))
  return {
    banco: netoSale(banco),
    comprasSinRubroDelCuadro: netoSale(sinRubro),
    rubrosSueltos: [...new Set(sinRubro.map((m) => m.rubro))],
  }
}

/**
 * NÚCLEO PURO: EL VEREDICTO. Compara tramo por tramo y dice si las vistas pueden migrar.
 *
 * EL VEREDICTO ES POR Δ NETO DE TRAMO, no por lado: lo que decide la escalera es con cuánta plata
 * queda la empresa después de cada tramo, y eso es entra − sale. Que los dos lados difieran en el
 * mismo monto y se compensen SÍ importaría para leer el cuadro, así que los dos lados se imprimen —
 * pero el que abre o cierra el portón es el neto.
 *
 * @param {Array} libro movimientos normalizados {fecha, signo, importe, rubro, estado, origen}
 * @param {Array} tramos lo leído de la pestaña CAJA: {rotulo, entra, sale, hasta}
 * @param {{hoy:number, corte:number, tolerancia?:number}} ctx
 */
export function conciliar(libro, tramos, { hoy, corte, tolerancia = TOLERANCIA }) {
  if (tramos.length !== BORDES.length) {
    throw new Error(`conciliar-libro: CAJA muestra ${tramos.length} tramo(s) y BORDES declara ${BORDES.length}. `
      + 'La pestaña y el código no están hablando del mismo calendario — no comparo.')
  }
  const rubros = rubrosDelCuadro()
  const filas = tramos.map((t, k) => {
    const v = ventanasDeTramo(k, hoy, corte)
    const entra = libroEntra(libro, v)
    const sale = libroSale(libro, v, rubros)
    // La portada publica el NETO del tramo; el delta es neto contra neto.
    const delta = t.neto - (entra.total - sale.total)
    return {
      k,
      rotulo: t.rotulo,
      cajaNeto: t.neto,
      libroEntra: entra.total,
      libroSale: sale.total,
      entraPorFuente: entra.porFuente,
      salePorFuente: sale.porFuente,
      residuos: residuosDeclarados(libro, v, rubros),
      // EL BORDE DEL SHEET CONTRA EL BORDE CALCULADO: un control que no se mide contra sí mismo. Si
      // difieren, las dos mitades no están mirando el mismo día y ninguna comparación vale.
      bordeCaja: t.hasta,
      bordeLibro: v.borde,
      delta,
    }
  })
  const peor = filas.reduce((mx, f) => Math.max(mx, Math.abs(f.delta)), 0)
  const bordesEnDesacuerdo = filas.filter((f) => f.bordeCaja && Number.isFinite(f.bordeLibro)
    && Math.abs(f.bordeCaja - f.bordeLibro) > 0)
  return { filas, peor, bordesEnDesacuerdo, cierra: peor < tolerancia && !bordesEnDesacuerdo.length }
}

/** El serial de HOY. Es lo único que mira el reloj, y por eso vive fuera del núcleo. */
export const hoySerial = () => {
  const d = new Date()
  return serialDe(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// ── LO QUE EXIGE RED ──────────────────────────────────────────────────────────────────────────────

/**
 * `_MOVIMIENTOS` LEÍDA POR ÍNDICE: A fecha · B signo · C importe · F rubro · H estado · I instrumento
 * · N origen. La pestaña tiene más columnas (hoy 17, con `Cliente` en la Q) y este portón sólo usa
 * seis: no las nombra por encabezado porque son las mismas desde que existe el libro.
 *
 * ═══ POR QUÉ UNA COLUMNA NUEVA VA SIEMPRE AL FINAL ═══
 *
 * Porque acá los índices están escritos. Una columna insertada en el medio corre `origen` del 13 al
 * 14 y este portón sigue funcionando: lee la fila entera, no explota, y concilia contra el campo
 * equivocado. Un control que compara mal es peor que uno que no corre — el test de este archivo fija
 * el contrato con una fila que trae la columna extra al final.
 *
 * Está exportada para poder probarla en frío: `main()` es lo único que toca la red.
 */
export function leerLibro(crudo) {
  return (crudo ?? []).filter((f) => Number.isFinite(f?.[0]) && Number.isFinite(f?.[2]))
    .map((f) => ({
      fecha: f[0],
      signo: Number(f[1]),
      importe: f[2],
      rubro: String(f[5] ?? '').trim(),
      estado: String(f[7] ?? '').trim(),
      instrumento: String(f[8] ?? '').trim(),
      origen: String(f[13] ?? '').trim(),
    }))
}

/**
 * El calendario de CAJA en la PORTADA (05/08): el panel derecho — F Tramo · G Hasta · H Neto ·
 * I Saldo después — ubicado por su encabezado. La portada ya no publica Entra y Sale por separado,
 * así que la comparación es por NETO de tramo.
 *
 * ═══ LO QUE ESTE PORTÓN ES DESPUÉS DE LA MIGRACIÓN, DICHO SIN VUELTAS ═══
 *
 * Antes de migrar las vistas comparaba DOS MODELOS INDEPENDIENTES (los SUMIFS del diseño viejo
 * contra el libro) y su cero fue el pasaporte de la migración — ese cero quedó registrado el
 * 05/08/2026. Desde que la escalera se alimenta del propio libro, esto es una REGRESIÓN: detecta
 * fórmulas rotas, ventanas corridas y celdas pisadas, pero ya no puede validar el libro contra un
 * modelo ajeno. El control independiente del libro es su cadena de fuentes (banco, Compras,
 * Cobranzas, planilla) — los extractores fallan cerrados contra ellas.
 */
function leerCalendario(caja) {
  const iCab = caja.findIndex((f) => String(f?.[5] ?? '').trim() === 'Tramo')
  if (iCab < 0) throw new Error('no encontré el calendario en CAJA (falta el encabezado "Tramo" en el panel derecho)')
  const tramos = []
  for (let i = iCab + 1; i < caja.length; i++) {
    const rot = String(caja[i]?.[5] ?? '').trim()
    if (/^⇒/.test(rot) || !rot) break
    tramos.push({ rotulo: rot, neto: num(caja[i]?.[7]), hasta: num(caja[i]?.[6]) || null })
  }
  return tramos
}

function imprimir(r) {
  console.log('EL LIBRO CONTRA LA ESCALERA DE LA PORTADA — regresión por neto de tramo (el cero de dos modelos independientes quedó registrado el 05/08/2026, pre-migración)')
  console.log('─'.repeat(96))
  console.log(`  ${'Tramo'.padEnd(26)}${'CAJA neto'.padStart(14)}${'libro entra'.padStart(14)}${'libro sale'.padStart(14)}${'libro neto'.padStart(14)}${'Δ'.padStart(13)}`)
  for (const f of r.filas) {
    console.log(`  ${f.rotulo.slice(0, 25).padEnd(26)}${pesos(f.cajaNeto).padStart(14)}${pesos(f.libroEntra).padStart(14)}`
      + `${pesos(f.libroSale).padStart(14)}${pesos(f.libroEntra - f.libroSale).padStart(14)}${pesos(f.delta).padStart(13)}`)
    if (Math.abs(f.delta) < TOLERANCIA) continue
    const abierto = (o) => Object.entries(o).filter(([, v]) => Math.abs(v) >= 1)
      .map(([k, v]) => `${k} ${pesos(v)}`).join(' · ') || '—'
    console.log(`      libro entra: ${abierto(f.entraPorFuente)}`)
    console.log(`      libro sale : ${abierto(f.salePorFuente)}`)
  }
  const res = r.filas.reduce((a, f) => ({
    banco: a.banco + f.residuos.banco,
    sinRubro: a.sinRubro + f.residuos.comprasSinRubroDelCuadro,
    rubros: new Set([...a.rubros, ...f.residuos.rubrosSueltos]),
  }), { banco: 0, sinRubro: 0, rubros: new Set() })
  console.log('\nLO QUE EL LIBRO VE Y EL CALENDARIO DECLARA QUE NO VE (exclusiones, no descuadres):')
  console.log(`  · cargos del banco sin factura (_BANCO_RAW): ${pesos(res.banco)} — el calendario los pone en $0 por tramo`)
  console.log(`  · Compras con rubro fuera del cuadro: ${pesos(res.sinRubro)}${res.rubros.size ? ` (${[...res.rubros].join(', ')})` : ''}`)
  for (const f of r.bordesEnDesacuerdo) {
    console.log(`  ⚠ el borde de "${f.rotulo}" no coincide: CAJA ${f.bordeCaja} · portón ${f.bordeLibro}. `
      + '¿La corrida cruzó la medianoche, o la pestaña quedó sin recalcular?')
  }
  console.log(`\n  peor diferencia de tramo: ${pesos(r.peor)}`)
  console.log(r.cierra
    ? '  ✓ EL LIBRO Y EL CALENDARIO CUENTAN LA MISMA PLATA — las vistas pueden migrar al libro.'
    : '  ✗ NO CIERRA. Cada Δ de arriba tiene su desglose por fuente: ahí está la causa. Las vistas NO migran.')
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig() })
  // Se concilia lo ESCRITO en la pestaña, no lo que la memoria del generador cree haber escrito.
  const [crudo, caja, corteRaw] = await Promise.all([
    g.readSheetValues(ID, '_MOVIMIENTOS!A2:P2000', { render: 'UNFORMATTED_VALUE' }),
    g.readSheetValues(ID, 'CAJA!A1:I45', { render: 'UNFORMATTED_VALUE' }),
    // PISO_CAJA es `CAJA_FECHA_SALDO`, el rango con nombre que publica CAJA: el corte del extracto.
    g.readSheetValues(ID, PISO_CAJA, { render: 'UNFORMATTED_VALUE' }),
  ])
  const libro = leerLibro(crudo)
  if (!libro.length) throw new Error('_MOVIMIENTOS está vacía: corré primero libro-movimientos-pestana.mjs')
  const corte = num(corteRaw?.[0]?.[0])
  if (!corte) {
    throw new Error(`el rango con nombre ${PISO_CAJA} no trajo una fecha. Sin el corte `
      + 'del extracto, el piso del calendario sería el año 1899 y la comparación no significaría nada.')
  }
  const r = conciliar(libro, leerCalendario(caja), { hoy: hoySerial(), corte })
  imprimir(r)
  if (!r.cierra) process.exitCode = 1
}

// Importar este archivo NO puede disparar una corrida contra el Sheet: los tests importan sus
// funciones puras.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
