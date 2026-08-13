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
// ═══ UNA COLUMNA NO ES UNA FOTO: EL ESTADO DE COMPRAS SE ESCRIBE VIVO (07/08) ═══
//
// Todas las columnas son valores pegados salvo la H de las filas que salen de Compras sin pagar: esa
// va como FÓRMULA contra la columna Estado de Compras. Un estado pegado convertía cada pago del dueño
// en plata comprometida hasta la regeneración siguiente (medido: 5 pagos, $3.553.544). El criterio,
// lo que queda afuera y por qué, en lib/libro-estado-vivo.mjs.
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
import { deRecurrentes } from '../lib/libro-extractores-recurrentes.mjs'
import { deEstructura, diaTipicoDeEstructura, PESTANA_ESTRUCTURA } from '../lib/libro-extractores-estructura.mjs'
import { deObras, conciliarConObras } from '../lib/libro-extractores-obras.mjs'
import { cruzar, chequesDelRegistro } from '../lib/cruce-cheque-factura.mjs'
import { endososDeCartera } from '../lib/libro-endosos.mjs'
import { debitosDelExtracto, corteDelExtracto, pagosDeResumen, chequesCubiertosPorBanco } from '../lib/libro-respaldo-banco.mjs'
import { ROTULOS_CALENDARIO, CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { coberturaPorRubro, huecosDeCobertura, problemasDeRol, verificarCobertura } from '../lib/cash-flow-cobertura.mjs'
import { fechaDeSerial } from '../lib/libro-extractores-fechas.mjs'
import { celdaEstado, celdaImporte, columnaEstadoDeCompras, columnasVivasDeCompras, exigirColumnasNeteo, estadosDecorados } from '../lib/libro-estado-vivo.mjs'
import { total } from '../lib/patron-pestana.mjs'
import { leerTipoCambio, RANGO_TC } from '../lib/tipo-cambio.mjs'
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
  // ═══ ESTRUCTURA SE LEE HASTA AD, Y SU FALTA NO ROMPE EL LIBRO ═══
  //
  // Hasta la AD porque los doce meses visibles llegan a la M y el bloque AUXILIAR con el real de cada
  // mes —contra el que se netea la provisión— vive de la S a la AD. Leyendo menos, el real llegaría
  // vacío y la proyección se emitiría ENCIMA de las facturas ya cargadas.
  //
  // Y es lectura blanda, al revés que el neteo de obras que aborta dos bloques más abajo. La asimetría
  // es deliberada: sin neteo el libro sale con plata CONTADA DOS VECES —un número equivocado que se
  // lee como bueno—; sin Estructura sale INCOMPLETO en una línea que el control de cobertura nombra en
  // esta misma corrida. Incompleto y gritado se puede decidir; equivocado y silencioso, no.
  const estructura = await google.readSheetValues(ID, `'${PESTANA_ESTRUCTURA}'!A1:AD`,
    { render: 'UNFORMATTED_VALUE' }).catch((e) => {
    console.warn(`  ⚠ no pude leer ${PESTANA_ESTRUCTURA} (${e.message}): la línea Estructura queda sin `
      + 'proyección de meses futuros. El control de cobertura de abajo lo va a gritar.')
    return null
  })
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

  // ═══ EL TIPO DE CAMBIO, PARA LOS COBROS EN DÓLARES (13/08/2026) ═══
  //
  // Cobranzas tiene filas en U$S y hasta hoy entraban al libro como pesos (los 15.400 de Quattropani,
  // $22.969.470 de menos). Se lee acá —el extractor es puro, no toca la red— del mismo rango con
  // nombre que citan las fórmulas del archivo. La lectura NO rompe la corrida: `deCobranzas` aborta
  // sólo si además hay filas en dólares que valuar. Sin USD, un TC ausente no le hace falta a nadie.
  const { tc: tipoCambio } = await leerTipoCambio(google, ID)
  if (tipoCambio === null) {
    console.warn(`  ⚠ no pude leer ${RANGO_TC}. Si Cobranzas tiene alguna fila en dólares, la extracción `
      + 'va a abortar nombrándola: sin tipo de cambio no se puede valuar y el monto nativo sería falso.')
  }

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

  // ═══ EL ESTADO DE LAS FILAS DE COMPRAS SE ESCRIBE VIVO (07/08) ═══
  //
  // La letra viaja desde acá porque se RESUELVE POR RÓTULO sobre la misma fuente que leen los
  // extractores: escribir "X" en la fórmula la dejaría apuntando a la columna vieja el día que la
  // planilla mueva una columna, mientras el extractor se adapta solo. Ver lib/libro-estado-vivo.mjs.
  const colEstadoCompras = columnaEstadoDeCompras(compras)
  const colsVivas = columnasVivasDeCompras(compras)
  // ═══ LAS OBRAS FUTURAS ENTRAN CON IMPORTE VIVO: MAX(0; planificado − real de Compras) ═══
  //
  // El módulo de datos (lib/obras-datos.mjs) se está construyendo en paralelo: el import es dinámico
  // y con guarda para que este script corra igual sin él — la fuente sale vacía y el aviso lo dice.
  // Al mergear la rama que lo trae, se activa solo, sin tocar una línea de acá.
  const OBRAS_FUTURAS = await import('../lib/obras-datos.mjs').then((m) => m.OBRAS_FUTURAS ?? []).catch(() => [])
  if (!OBRAS_FUTURAS.length) {
    console.warn('  ⚠ obras futuras: lib/obras-datos.mjs no existe todavía o no publica OBRAS_FUTURAS — la fuente Obras sale vacía.')
  }
  // ═══ SIN NETEO NO SE PUBLICA: ABORTA, Y EL MENSAJE DICE QUÉ COLUMNA FALTÓ (13/08/2026) ═══
  //
  // `exigirColumnasNeteo` tira con el rótulo adentro ("Fecha factura") en lugar de degradar a importes
  // pegados. El criterio, y por qué un dato muerto en silencio es peor que una corrida caída, viven
  // con la función en lib/libro-estado-vivo.mjs. Sin obras futuras no hay nada que netear y no hay
  // nada que exigir: la corrida no depende de un encabezado que no va a usar.
  const colsNeteo = OBRAS_FUTURAS.length ? exigirColumnasNeteo(compras) : null
  const obrasFuturas = deObras(OBRAS_FUTURAS, colsNeteo, corte, (m) => console.warn(`  · ${m}`))
  if (obrasFuturas.resumen.movimientos) {
    console.log(`  obras futuras: ${obrasFuturas.resumen.obras} obra(s) · ${obrasFuturas.resumen.movimientos} egreso(s) `
      + `proyectado(s) · ${pesos(obrasFuturas.resumen.totalProyectado)} planificado (con neteo vivo contra Compras)`)
  }
  // LA CONCILIACIÓN CONTRA LA PESTAÑA OBRAS, IMPRESA EN CADA CORRIDA. Sin esto, un egreso que se cae
  // —una obra a la que le sacaron las fechas, un monto que quedó en cero— deja el cash flow corto y
  // coherente consigo mismo: nadie se entera hasta que el dueño lo nota. Ver `conciliarConObras`.
  {
    const c = conciliarConObras(OBRAS_FUTURAS, obrasFuturas.movimientos)
    console.log(`  OBRAS → libro: ${pesos(c.enElLibro)} de ${pesos(c.caja)} de egresos de caja proyectados`
      + ` · ${pesos(c.porJornales)} de MO va por Jornales · ${pesos(c.noCaja)} de máquina propia no es caja`)
    for (const x of c.faltan) {
      console.warn(`  ⚠ OBRAS declara "${x.obra} · ${x.concepto} · ${x.proveedor}" por ${pesos(x.monto)} `
        + 'y NO llegó al libro: el cash flow lo va a mostrar de menos.')
    }
  }
  // ═══ LA ESTRUCTURA DE SEPTIEMBRE A DICIEMBRE, QUE EL CUADRO NO MOSTRABA (13/08/2026) ═══
  //
  // La proyección la calcula la pestaña `Estructura` (que corre antes que este script en el pipeline);
  // acá sólo se lee y se netea contra el real que la propia pestaña publica en su bloque auxiliar. El
  // día típico sale de las filas reales del rubro en Compras: sin él no se proyecta, porque una fecha
  // inventada pone plata en una semana donde no está y el cuadro semanal la muestra ahí.
  const gastosEstructura = deEstructura(estructura ?? [], corte, {
    diaTipico: diaTipicoDeEstructura(compras),
    aviso: (m) => console.warn(`  ⚠ ${m}`),
  })
  if (gastosEstructura.resumen.meses) {
    console.log(`  estructura: ${gastosEstructura.resumen.subrubros} sub-rubro(s) · ${gastosEstructura.resumen.meses} `
      + `mes(es) proyectado(s) · ${pesos(gastosEstructura.resumen.total)} (neto de lo ya facturado)`)
  }
  if (gastosEstructura.resumen.excluido) {
    console.log(`  · estructura: ${pesos(gastosEstructura.resumen.excluido)} de "Equipos y rodados (inversión)" `
      + 'quedan FUERA del flujo — una compra de equipo es una decisión, no una necesidad de caja que se repite.')
  }

  const decorados = estadosDecorados(compras)
  if (decorados.length) {
    console.warn(`  ⚠ ${decorados.length} fila(s) de Compras dicen "Pagado" con decoración `
      + `(${decorados.slice(0, 3).map((d) => `f${d.fila} "${d.valor}"`).join(', ')}). El generador las lee bien; `
      + 'la fórmula viva de la columna H no las va a autopromover hasta la corrida siguiente.')
  }

  return {
    colEstadoCompras,
    colsVivas,
    fuentes: {
      Compras: deCompras(compras, corte, { cruce, cargasCubiertas }),
      // La provisión de los servicios recurrentes (Movistar, seguros, honorarios): lo esperado del
      // mes menos lo ya materializado en Compras. Sin esto, el mes en curso no debía ningún
      // recurrente y el pago real le pegaba a LIBRE (07/08). Ver libro-extractores-recurrentes.mjs.
      Recurrentes: deRecurrentes(compras, corte, (m) => console.log(`  · ${m}`)),
      // Los egresos de caja de las obras futuras (materiales/alquileres/combustible). La MO va por
      // Jornales y la máquina propia no es caja: el extractor no los emite NUNCA — ver
      // lib/libro-extractores-obras.mjs. El importe es fórmula: se descuenta solo cuando la factura
      // real entra a Compras.
      Obras: obrasFuturas.movimientos,
      // Los gastos de estructura de los meses que todavía no llegaron, leídos de la pestaña que ya los
      // calcula. Netos de lo facturado: la factura real entra por Compras, la provisión se apaga sola.
      Estructura: gastosEstructura.movimientos,
      'Cargas Sociales': cargas,
      Cobranzas: deCobranzas(cobranzas, corte, { endosos, excluidos, tipoCambio }),
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
  const { fuentes: porFuente, excluidos, corteBanco, debitosBanco, colEstadoCompras, colsVivas } = await extraerDeLasFuentes(google, corte)
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

  imprimirCobertura(consolidado, corte)

  // LO QUE SE AUTOPROMUEVE SE CUENTA. Es la mitad del COMPROMETIDO que ya no espera a la próxima
  // corrida para desaparecer cuando el dueño marca el pago: sin el número, el cambio es invisible.
  const vivas = consolidado.filter((m) => String(celdaEstado(m, colEstadoCompras)).startsWith('='))
  console.log(`  ${'— estado vivo'.padEnd(14)} ${String(vivas.length).padStart(4)} fila(s) de Compras escriben su estado `
    + `como fórmula contra Compras!${colEstadoCompras} · ${pesos(sumar(vivas, {}).total)} `
    + '— pasan solas a REAL cuando la fila dice "Pagado"')

  if (DRY) { console.log('\n--dry: no escribí nada.'); return }
  await escribirYVerificar(google, consolidado, colEstadoCompras, colsVivas)
}

/**
 * ═══ LA COBERTURA DEL CUADRO, IMPRESA EN CADA CORRIDA (13/08/2026) ═══
 *
 * Es el instrumento de la regla de oro 8 —*"nada queda suelto y sin considerar"*— sobre la única
 * pregunta que un cash flow incompleto no contesta solo: **¿cada línea tiene dueño y llega hasta
 * diciembre?** El 13/08 Materiales y Estructura se cortaban en agosto, el cuadro cerraba consigo mismo
 * y sobre él se decidió una compra de rodados. Sin este bloque, la única forma de enterarse era que el
 * dueño mirara la pestaña columna por columna.
 *
 * Se imprime la tabla ENTERA, no sólo lo que falla: una línea que se llenó también es información, y
 * la lista completa es lo que permite comparar contra la corrida de ayer.
 */
function imprimirCobertura(consolidado, corte) {
  const hoy = fechaDeSerial(corte)
  const ctx = { anio: hoy.getUTCFullYear(), mesDesde: hoy.getUTCMonth() + 1, fechaDe: fechaDeSerial }
  console.log(`\nCOBERTURA DEL CUADRO — de ${ctx.mesDesde}/${ctx.anio} a 12/${ctx.anio}, sobre lo PENDIENTE`)
  for (const c of coberturaPorRubro(consolidado, ctx)) {
    const meses = [...Array(12 - ctx.mesDesde + 1)].map((_, i) => (c.meses.has(ctx.mesDesde + i) ? '█' : '·')).join('')
    console.log(`  ${c.rubro.padEnd(38)} ${meses}  ${pesos(c.monto).padStart(16)}  ${c.horizonte} · ${c.dueno}`)
  }
  for (const a of huecosDeCobertura(consolidado, ctx)) {
    console.log(`  ${a.nivel === 'HUECO' ? '⚠ HUECO' : '· declarado'}: ${a.texto}`)
  }
  for (const p of problemasDeRol(consolidado)) console.log(`  ⚠ ROL: ${p}`)
  // Los problemas ESTÁTICOS (una línea sin dueño) no dependen del dato: si aparecen, alguien agregó
  // una línea al cuadro sin decir de dónde sale, y eso se arregla en el código, no en la planilla.
  for (const p of verificarCobertura()) console.log(`  ⚠ SIN DUEÑO: ${p}`)
}

/**
 * LA ESCRITURA Y SU EVIDENCIA. Van juntas a propósito: la API contestando 200 no prueba que el dato
 * aterrizó —ya se encontró una pestaña donde la escritura por valores reporta éxito y no llega—, así
 * que quien escribe es quien relee y compara contra lo que tenía en memoria.
 *
 * LA COMPARACIÓN SIGUE SIENDO VÁLIDA CON LA COLUMNA H VIVA (07/08): se releen A:C —fecha, signo,
 * importe—, que se escriben como valores y no cambiaron de naturaleza. La H es la única celda que
 * ahora puede ser fórmula, y no entra en el total que se compara. Si algún día la evidencia se
 * extendiera al estado, hay que releer con `UNFORMATTED_VALUE` (que trae el RESULTADO de la fórmula)
 * y compararlo contra `celdaEstado`, no contra `m.estado`: para una fila autopromovida el archivo
 * dice REAL y la memoria del generador dice PROYECTADO, y las dos tienen razón.
 */
async function escribirYVerificar(google, consolidado, colEstadoCompras = null, colsVivas = null) {
  // ── ESPEJO, ordenada por fecha, con encabezado ──────────────────────────────────────────────────
  const ordenados = consolidado.slice().sort((a, b) => a.fecha - b.fecha)
  const filas = [ENCABEZADO, ...ordenados
    // LA COLUMNA H NO ES `m.estado` NI LA C ES `m.importe`: son lo que las celdas vivas deciden
    // escribir. Para las filas de Compras todavía impagas, H es una FÓRMULA que se pregunta sola si
    // el dueño ya marcó el pago, y C es el SALDO VIVO Total−Pagado — un pago PARCIAL descuenta la
    // COMPROMETIDA en el acto, sin esperar regeneración (07/08, "cuando se pagan los compromisos
    // deben salir de ahí"). Criterio y exclusiones en lib/libro-estado-vivo.mjs. Las filas de Obras
    // traen su propia fórmula (`importeVivo`, el neteo contra Compras): tiene precedencia porque su
    // origen no es Compras y `celdaImporte` la dejaría pegada.
    .map((m) => [m.fecha, m.signo, m.importeVivo ?? celdaImporte(m, colsVivas), m.moneda, m.concepto, m.rubro, m.actividad,
      celdaEstado(m, colEstadoCompras),
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
  // ═══ EL NETEO DE OBRAS PUEDE HABER ABSORBIDO PLATA ANTES DE LA RELECTURA ═══
  //
  // La C de una fila de Obras es MAX(0; planificado − real de Compras): si la factura real ya entró,
  // el archivo rinde MENOS que el planificado en memoria — y eso es lo CORRECTO, no un descuadre. La
  // evidencia lo tolera ACOTADO: el valor releído tiene que caer en [0, planificado]; la diferencia
  // se declara como neteo absorbido y se ajusta el total en memoria, así la comparación sigue siendo
  // exacta al peso para todas las demás filas. Un valor fuera del rango sí es una escritura rota.
  let ajusteNeteo = 0
  let neteoFuera = 0
  ordenados.forEach((m, i) => {
    if (!m.importeVivo) return
    const val = Number(releido?.[i]?.[2])
    if (!Number.isFinite(val) || val < -0.01 || val > m.importe + 0.01) {
      neteoFuera++
      console.log(`  ✗ Obras f${i + 2}: la fórmula de neteo rindió ${JSON.stringify(releido?.[i]?.[2])} `
        + `y el planificado es ${pesos(m.importe)} — fuera de [0, planificado], la escritura no sirve.`)
      return
    }
    ajusteNeteo += m.signo * (val - m.importe)
  })
  if (ajusteNeteo !== 0) {
    console.log(`  · neteo de Obras ya absorbido por Compras al releer: ${pesos(ajusteNeteo)} (facturas reales que ya entraron)`)
  }
  const totalMemoria = sumar(consolidado, {}).total + ajusteNeteo
  const cierra = Math.abs(totalArchivo - totalMemoria) < 1 && neteoFuera === 0
  console.log(`\nQUEDÓ ESCRITO: ${filasArchivo} movimiento(s) en ${PESTAÑA}`)
  console.log(`  total releído del archivo : ${pesos(totalArchivo)}`)
  console.log(`  total calculado en memoria: ${pesos(totalMemoria)}`)
  console.log(cierra ? '  ✓ el archivo y la memoria dicen lo mismo' : '  ✗ NO CIERRAN: la escritura no aterrizó entera. NO uses este libro.')
  if (!cierra) process.exitCode = 1
}

const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
