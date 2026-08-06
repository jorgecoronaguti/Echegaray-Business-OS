#!/usr/bin/env node
// LA PESTAÑA `_MOVIMIENTOS` — el Libro Canónico, materializado en el archivo.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// Es una réplica `_RAW`: una fila por movimiento, ya clasificado y deduplicado, con su origen
// declarado. NO es un cuadro para leer — es la tabla de la que las vistas (CAJA, Semanal, Mensual)
// van a colgar con un SUMIFS corto en lugar de un SUMPRODUCT de ochocientos caracteres.
//
// La LÓGICA vive en lib/libro-movimientos.mjs y lib/libro-extractores.mjs (núcleo puro, probado en
// frío). Este script sólo hace lo que exige red: leer las fuentes, correr los extractores, y escribir.
//
// ═══ EL CONTROL VIAJA CON LA ESCRITURA ═══
//
// Después de escribir se RELEE el total del libro desde la pestaña y se compara contra el total
// calculado en memoria. La API contestando 200 no prueba nada — ya se encontró una pestaña donde la
// escritura por valores reporta éxito y no aterriza. Por eso además se escribe con
// `escribirValoresPorCeldas` (updateCells por sheetId), el camino que sí aterriza.
//
//   node orquestador/scripts/libro-movimientos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { deduplicar, separarInternas, sumar } from '../lib/libro-movimientos.mjs'
import {
  deCompras, deCobranzas, deChequesEmitidos, deBancoCargos,
  deTarjetaSinFactura, deImpuestosCalendario, deCartera,
  deJornalesQuincenas, deOficina, deDireccion, comprasPagadasConCheque,
  deCargasSociales, mesesCubiertos, cargasEnCompras, reemplazadasPorLaCadena, NOMBRES_CARGAS,
} from '../lib/libro-extractores.mjs'
import { cruzar, chequesDelRegistro } from '../lib/cruce-cheque-factura.mjs'
import { endososDeCartera } from '../lib/libro-endosos.mjs'
import { debitosDelExtracto, corteDelExtracto, pagosDeResumen, chequesCubiertosPorBanco } from '../lib/libro-respaldo-banco.mjs'
import { ROTULOS_CALENDARIO, CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { total } from '../lib/patron-pestana.mjs'
import { ubicarRegistro } from './cheques-emitidos-tablero.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = '_MOVIMIENTOS'
const DRY = process.argv.includes('--dry')

/** El serial de HOY en el huso del archivo (es-AR): el corte para vencidos. */
const hoySerial = () => Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000)

// `Cliente` va DESPUÉS de `Clave` y no al lado de `Obra`, que es donde se leería mejor: el portón
// (conciliar-libro.mjs) lee esta pestaña por índice —origen es el 13— y una columna insertada en el
// medio le corre tres campos SIN darle un error. Seguiría conciliando, contra los datos equivocados.
const ENCABEZADO = ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado',
  'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Origen', 'Fila', 'Clave', 'Cliente']

/** Los rangos con nombre de la nómina. El cash flow lee EXACTAMENTE éstos: una sola definición. */
const NOMBRES_NOMINA = [
  'JORNALES_REAL_PAGO', 'JORNALES_REAL_HASTA', 'JORNALES_REAL_PAGADO', 'JORNALES_REAL_TOTAL',
  'JORNALES_PROY_PAGO', 'JORNALES_PROY_HASTA', 'JORNALES_PROY_TOTAL',
  'OFICINA_PAGO', 'OFICINA_PAGADO', 'OFICINA_PROYECTADO',
  'DIRECCION_PAGO', 'DIRECCION_PAGADO', 'DIRECCION_PROYECTADO',
]

/**
 * TODO LO QUE EXIGE RED: leer las nueve fuentes y correr los extractores. La lógica es de los
 * extractores; acá sólo se resuelve DÓNDE está cada cosa —y se rompe si no está—.
 * @returns {Promise<Record<string, Array>>} los movimientos por fuente, sin deduplicar
 */
async function extraerDeLasFuentes(google, corte) {
  // ── LAS FUENTES, LEÍDAS SIN FORMATEAR: una fecha es un número o no es una fecha ─────────────────
  const leer = (r) => google.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' }).catch((e) => {
    throw new Error(`no pude leer ${r}: ${e.message}. Sin la fuente no hay libro — no escribo uno a medias.`)
  })
  // COBRANZAS SE LEE HASTA BB, no hasta AC: en BB vive "Valor banco", que es donde se marca un valor
  // ENDOSADO. Leyendo menos, esa columna llega vacía y el libro esperaría $20.000.000 de LA ESTRELLA
  // que ya se entregaron a Alumetal y nunca van a pasar por la cuenta.
  const [compras, cobranzas, cheques, banco, tarjeta, carteraRaw, impuestos] = await Promise.all([
    // RANGOS ABIERTOS, SIN TOPE DE FILA. El tope 500 dejó afuera las filas 501+ de Compras — los
    // $32,9M de Alumetal con fecha de caja esta semana entre ellas — y el portón lo gritó como
    // $35,17M de diferencia. Es la fila 200 de Cobranzas otra vez: un tope escrito hoy es una bomba
    // que explota el día que la pestaña crece, sin un solo error. Un rango abierto llega hasta la
    // última fila con datos, siempre.
    leer('Compras!A1:AN'), leer('Cobranzas!A1:BB'),
    leer("'Cheques Emitidos'!A1:M"), leer('_BANCO_RAW!A1:F'),
    leer("'Tarjeta de Credito'!A1:M"), leer('_CHEQUES_RAW!A1:L'),
    // ABIERTO también (06/08): el rediseño llevó los rótulos del calendario a las filas 55/65 y el
    // tope 60 dejó el IIBB afuera — la bomba que este mismo comentario describe, en la línea de abajo.
    leer(`'${CALENDARIO_IMPUESTOS.pestaña}'!A1:N`),
  ])
  // LA NÓMINA VIVE EN RANGOS CON NOMBRE, y por eso se lee por nombre: el rediseño del 23/07 movió las
  // quincenas de la fila 3 a la 41 y toda suma anclada a la fila habría seguido devolviendo un número
  // —el de las filas equivocadas— sin marcar un solo error.
  const leidos = await Promise.all(NOMBRES_NOMINA.map((n) => leer(n)))
  const R = Object.fromEntries(NOMBRES_NOMINA.map((n, i) => [n, leidos[i]]))

  // ═══ LA CADENA DE CARGAS SOCIALES SE LEE OPCIONAL, Y ESO ES DELIBERADO ═══
  //
  // Los tres nombres los publica `cargas-sociales-pestana.mjs`. Si todavía no corrió —o si alguien los
  // borró— la lectura falla, y romper acá dejaría al libro entero sin escribir por una fuente que hasta
  // ayer no existía. Sin la serie no hay meses cubiertos, así que las filas planas de Compras vuelven a
  // entrar solas: el cash flow queda como estaba, con la previsión tipeada a mano, y el aviso lo dice.
  const opcional = async (n) => {
    try { return await google.readSheetValues(ID, n, { render: 'UNFORMATTED_VALUE' }) } catch (e) {
      console.warn(`  ⚠ no pude leer ${n} (${e.message}). Las cargas del mes vuelven a salir de las filas `
        + 'planas de Compras — corré cargas-sociales-pestana.mjs para que publique la serie.')
      return null
    }
  }
  const [fechasCargas, f931Cargas, gremialesCargas] = await Promise.all([
    opcional(NOMBRES_CARGAS.fechas), opcional(NOMBRES_CARGAS.f931), opcional(NOMBRES_CARGAS.gremiales),
  ])

  // El registro de cheques se ubica por el DATO (FISICO/ECHEQ), no por una fila fija.
  const reg = ubicarRegistro(cheques.map((f) => [f?.[0]]))
  if (!reg) throw new Error('no encontré el registro de Cheques Emitidos: sin él el COMPROMETIDO queda afuera.')

  // LAS FILAS DEL IVA/IIBB SE UBICAN POR SU RÓTULO, con el mismo texto que las escribe
  // impuestos-pestana.mjs (por eso el contrato se importa y no se copia: el 30/07 se renombró de un
  // solo lado razonando sobre el número de fila y los dos cash flow quedaron sin poder regenerarse).
  const filaDeRotulo = (rot) => impuestos.findIndex((f) => String(f?.[0] ?? '').trim() === rot) + 1 || null
  const filasCal = { filaIva: filaDeRotulo(total(ROTULOS_CALENDARIO.iva)), filaIibb: filaDeRotulo(total(ROTULOS_CALENDARIO.iibb)) }
  if (!filasCal.filaIva || !filasCal.filaIibb) {
    throw new Error(`no encontré "${total(ROTULOS_CALENDARIO.iva)}" / "${total(ROTULOS_CALENDARIO.iibb)}" en `
      + `${CALENDARIO_IMPUESTOS.pestaña}. Una referencia a una fila muerta devuelve $0 sin un solo error: no extraigo.`)
  }

  // ═══ EL CRUCE SE COMPUTA UNA VEZ, ACÁ, Y LOS EXTRACTORES LO RECIBEN ═══
  //
  // Los extractores son funciones puras sobre las filas de UNA pestaña; el cruce necesita LAS DOS
  // (qué factura paga cada cheque vivo). Calcularlo dentro de cada extractor rompería la pureza y
  // —peor— podría dar dos repartos distintos: el criterio consume cada factura una sola vez, así que
  // dos corridas independientes emparejarían distinto y Compras diría una cosa y los cheques otra.
  // Es el mismo motivo por el que `cheques-cobertura-sheet` calcula sus respaldos una sola vez.
  const cruce = cruzar(chequesDelRegistro(cheques, { fila0: reg.primera }), comprasPagadasConCheque(compras))

  // ═══ EL EXTRACTO ES TESTIGO DE LO QUE LAS PESTAÑAS TODAVÍA NO SABEN (06/08) ═══
  //
  // Se arma UNA vez y lo comparten los tres consumidores porque `usados` tiene que ser el mismo Set:
  // un débito respalda a UN movimiento. Con un Set por extractor, Oficina y Dirección podrían
  // reclamar los mismos $3.000.000 y el libro daría por pagada plata que salió una sola vez.
  const extracto = {
    debitos: debitosDelExtracto(banco),
    corte: corteDelExtracto(banco),
    usados: new Set(),
  }
  const pagosTarjeta = pagosDeResumen(banco)
  // Los valores ENDOSADOS: el cobro que se registró y que nunca va a acreditar. La columna BB de
  // Cobranzas es la puerta que marca el dueño a mano y en el archivo vivo estaba vacía; ésta es la
  // que se actualiza sola desde el banco. Ver lib/libro-endosos.mjs.
  const endosos = endososDeCartera(carteraRaw)
  const excluidos = []

  // ═══ LA PRECEDENCIA DE LAS CARGAS SE RESUELVE ACÁ, UNA VEZ, Y LOS DOS EXTRACTORES LA RECIBEN ═══
  //
  // Es la misma forma que el cruce cheque↔factura: la decisión de qué puerta le toca a cada peso no se
  // toma dentro de un extractor —serían dos criterios que se desincronizan— sino en un solo lugar. El
  // hecho le gana a la proyección (el mes pagado en Compras la cadena no lo emite) y la cadena le gana
  // a la fila plana (los meses que publica, Compras no los aporta). Ver libro-extractores-cargas.mjs.
  const enCompras = cargasEnCompras(compras)
  const cargas = deCargasSociales(
    { fechas: fechasCargas, f931: f931Cargas, gremiales: gremialesCargas },
    corte, { mesesPagados: enCompras.mesesPagados, aviso: (m) => console.warn(`  · ${m}`) },
  )
  const cargasCubiertas = mesesCubiertos(cargas)
  const swap = reemplazadasPorLaCadena(enCompras, cargasCubiertas)
  console.log(`  cargas sociales: la cadena publica ${cargas.length} movimiento(s) en ${cargasCubiertas.size} mes(es) `
    + `y reemplaza ${swap.length} fila(s) previstas de Compras por ${pesos(swap.reduce((a, x) => a + x.total, 0))}`)

  return {
    fuentes: {
      Compras: deCompras(compras, corte, { cruce, cargasCubiertas }),
      'Cargas Sociales': cargas,
      Cobranzas: deCobranzas(cobranzas, corte, { endosos, excluidos }),
      'Cheques Emitidos': deChequesEmitidos(cheques, { fila0: reg.primera, cruce }),
      'Tarjeta de Credito': deTarjetaSinFactura(tarjeta, { pagos: pagosTarjeta }),
      _BANCO_RAW: deBancoCargos(banco, { fila0: 4 }),
      _CHEQUES_RAW: deCartera(carteraRaw),
      'Impuestos y Financieros': deImpuestosCalendario(impuestos, filasCal, new Date().getFullYear(), corte),
      Jornales: deJornalesQuincenas({
        reales: { pago: R.JORNALES_REAL_PAGO, hasta: R.JORNALES_REAL_HASTA, pagado: R.JORNALES_REAL_PAGADO, total: R.JORNALES_REAL_TOTAL },
        proyectadas: { pago: R.JORNALES_PROY_PAGO, hasta: R.JORNALES_PROY_HASTA, total: R.JORNALES_PROY_TOTAL },
      }, corte),
      Oficina: deOficina({ pago: R.OFICINA_PAGO, pagado: R.OFICINA_PAGADO, proyectado: R.OFICINA_PROYECTADO },
        corte, { extracto }),
      Dirección: deDireccion({ pago: R.DIRECCION_PAGO, pagado: R.DIRECCION_PAGADO, proyectado: R.DIRECCION_PROYECTADO },
        corte, { extracto }),
    },
    excluidos,
    corteBanco: extracto.corte,
    // Los débitos crudos viajan al orquestador: el respaldo de cheques contra el banco corre sobre
    // el libro ENTERO (necesita a los REAL para que consuman su débito primero), no dentro de un
    // extractor que sólo ve su pestaña.
    debitosBanco: extracto.debitos,
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const corte = hoySerial()
  const { fuentes: porFuente, excluidos, corteBanco, debitosBanco } = await extraerDeLasFuentes(google, corte)
  const todos = Object.values(porFuente).flat()
  // ═══ EL EXTRACTO CORRIGE LOS CHEQUES QUE LAS PESTAÑAS TODAVÍA DAN POR VIVOS (06/08) ═══
  //
  // `public.cheques` tenía corte 31/07 y el banco ya había debitado cheques que el libro seguía
  // contando como COMPROMETIDOS ($500.000 de Diesel, refs 314/315 del 24/07). La regla, su porqué y
  // sus guardas viven en lib/libro-respaldo-banco.mjs (`chequesCubiertosPorBanco`).
  const respaldo = chequesCubiertosPorBanco(todos, debitosBanco)
  for (const aviso of respaldo.avisos) console.log(`  ⚠ ${aviso}`)
  respaldo.cubiertos.forEach((d, i) => {
    const m = todos[i]
    console.log(`  ✓ cheque ${pesos(m.importe)} (${m.concepto?.slice(0, 40)}) ya debitado: `
      + `pasa a REAL al serial ${d.fecha} (débito _BANCO_RAW f${d.fila})`)
    todos[i] = { ...m, estado: 'REAL', fecha: d.fecha }
  })
  const { libro: dedup, colapsos } = deduplicar(todos)
  const { consolidado, internas, netoInterno } = separarInternas(dedup)

  console.log(`LIBRO CANÓNICO — corte ${new Date().toLocaleDateString('es-AR')} · extracto hasta el serial ${corteBanco}`)
  for (const [fuente, ms] of Object.entries(porFuente)) {
    const t = sumar(ms, {})
    console.log(`  ${fuente.padEnd(18)} ${String(ms.length).padStart(4)} movimiento(s) · neto ${pesos(t.total)}`)
  }
  // LA EXCLUSIÓN SE PUBLICA CON SU MONTO. Una plata que desaparece del cuadro sin que nadie diga
  // cuánta es indistinguible de un error — y ésta son $20.000.000.
  if (excluidos.length) {
    const total = excluidos.reduce((a, x) => a + (x.fila ? x.importe : 0), 0)
    console.log(`  ⊘ EXCLUIDOS por endoso: ${excluidos.filter((x) => x.fila).length} cobro(s) · ${pesos(total)} `
      + '— ese valor se entregó a un tercero y no va a acreditar nunca')
    for (const x of excluidos) console.log(`    · ${x.fila ? `Cobranzas f${x.fila} ${pesos(x.importe)}` : '⚠ sin emparejar'} — ${x.motivo}`)
  }
  console.log(`  ${'— deduplicado'.padEnd(18)} ${String(consolidado.length).padStart(4)} · ${colapsos.length} colapso(s) declarado(s) · internas ${internas.length} (neto ${pesos(netoInterno)})`)
  if (netoInterno !== 0) {
    console.log(`  ⚠ EL NETO INTERNO NO DA CERO: falta un lado de alguna transferencia interna — la caja consolidada está corrida en ${pesos(netoInterno)}.`)
  }
  for (const c of colapsos.slice(0, 8)) {
    console.log(`    · colapsó ${c.clave.slice(0, 44)} — se queda ${c.se_queda.pestana}:${c.se_queda.fila}, cae ${c.se_descarta.pestana}:${c.se_descarta.fila}`)
  }

  const porEstado = {}
  for (const e of ['REAL', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO']) {
    porEstado[e] = sumar(consolidado, { estados: [e] })
    console.log(`  ${e.padEnd(14)} ${String(porEstado[e].filas).padStart(4)} fila(s) · neto ${pesos(porEstado[e].total)}`)
  }

  if (DRY) { console.log('\n--dry: no escribí nada.'); return }
  await escribirYVerificar(google, consolidado)
}

/**
 * LA ESCRITURA Y SU EVIDENCIA. Van juntas a propósito: la API contestando 200 no prueba que el dato
 * aterrizó —ya se encontró una pestaña donde la escritura por valores reporta éxito y no llega—, así
 * que quien escribe es quien relee y compara contra lo que tenía en memoria.
 */
async function escribirYVerificar(google, consolidado) {
  // ── ESPEJO, ordenada por fecha, con encabezado ──────────────────────────────────────────────────
  const filas = [ENCABEZADO, ...consolidado
    .slice()
    .sort((a, b) => a.fecha - b.fecha)
    .map((m) => [m.fecha, m.signo, m.importe, m.moneda, m.concepto, m.rubro, m.actividad, m.estado,
      m.instrumento, m.contraparte, m.cuit, m.comprobante, m.obra, m.origen.pestana, m.origen.fila ?? '', m.clave,
      m.cliente])]

  let hojas = await google.getSheetMeta(ID)
  let hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: {
      title: PESTAÑA, gridProperties: { rowCount: filas.length + 50, columnCount: ENCABEZADO.length + 2 },
      hidden: true, // es una réplica de datos, no una vista: no compite en la barra de pestañas
    } } }])
    hojas = await google.getSheetMeta(ID)
    hoja = hojas.find((h) => h.title === PESTAÑA)
  }
  if (!hoja) throw new Error(`no pude crear ${PESTAÑA}`)
  // El alto de la hoja tiene que alcanzar ANTES de escribir: updateCells fuera de grilla es un 400.
  if ((hoja.rows ?? 0) < filas.length + 10) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: {
      properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filas.length + 50, columnCount: Math.max(hoja.cols ?? 0, ENCABEZADO.length + 2) } },
      fields: 'gridProperties.rowCount,gridProperties.columnCount' } }])
  }

  // ESPEJO: la pestaña es 100% generada, así que acá sí se limpia el excedente — pero limpiando el
  // TRAMO SOBRANTE con celdas vacías, no con clearValues sobre el archivo.
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:A`).catch(() => [])
  const altura = Math.max(previo.length, filas.length)
  const conColchon = [...filas, ...Array.from({ length: altura - filas.length }, () => ENCABEZADO.map(() => ''))]
  await google.escribirValoresPorCeldas(ID, hoja.sheetId, conColchon)

  // ── LA EVIDENCIA: el total releído del archivo, contra el calculado en memoria ──────────────────
  const releido = await google.readSheetValues(ID, `${PESTAÑA}!A2:C${filas.length}`, { render: 'UNFORMATTED_VALUE' })
  let totalArchivo = 0; let filasArchivo = 0
  for (const f of releido ?? []) {
    const signo = Number(f?.[1]); const imp = Number(f?.[2])
    if (Number.isFinite(signo) && Number.isFinite(imp)) { totalArchivo += signo * imp; filasArchivo++ }
  }
  const totalMemoria = sumar(consolidado, {}).total
  const cierra = Math.abs(totalArchivo - totalMemoria) < 1
  console.log(`\nQUEDÓ ESCRITO: ${filasArchivo} movimiento(s) en ${PESTAÑA}`)
  console.log(`  total releído del archivo : ${pesos(totalArchivo)}`)
  console.log(`  total calculado en memoria: ${pesos(totalMemoria)}`)
  console.log(cierra ? '  ✓ el archivo y la memoria dicen lo mismo' : '  ✗ NO CIERRAN: la escritura no aterrizó entera. NO uses este libro.')
  if (!cierra) process.exitCode = 1
}

const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
