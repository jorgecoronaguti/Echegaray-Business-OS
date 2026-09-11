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
import { deduplicar, separarInternas, sumar, plataColapsada } from '../lib/libro-movimientos.mjs'
import {
  deCompras, deCobranzas, deChequesEmitidos, deBancoCargos,
  deTarjetaSinFactura, deImpuestosCalendario, debitosDeImpuestoAlCheque, deCartera,
  deJornalesQuincenas, deOficina, deDireccion, comprasPagadasConCheque,
  deCargasSociales, mesesCubiertos, cargasEnCompras, reemplazadasPorLaCadena, NOMBRES_CARGAS,
  RUBRO_GREMIALES,
} from '../lib/libro-extractores.mjs'
import { pagosGremialesDelBanco, explicarPago } from '../lib/cargas-pagos-banco.mjs'
import { leerBoletasIeric } from '../lib/cargas-boletas-ieric.mjs'
import { PESTAÑA as RAW_UOCRA } from './uocra-raw-pestana.mjs'
import { deRecurrentes } from '../lib/libro-extractores-recurrentes.mjs'
import { deEstructura, diaTipicoDeEstructura, PESTANA_ESTRUCTURA } from '../lib/libro-extractores-estructura.mjs'
// ═══ LOS MATERIALES PREVISTOS SALEN DEL CUADRO 5 DE LA PESTAÑA `OBRAS` (24/08/2026) ═══
//
// `deObras`/`conciliarConObras` (lib/libro-extractores-obras.mjs) leían los egresos de las CONSTANTES
// de obras-datos y ya no se llaman desde acá: el dueño editó esas fechas en la pestaña y su edición
// manda. De ese módulo se siguen usando el rubro, el SUMPRODUCT del neteo y `serialDeFecha`, que son
// comunes a los dos caminos.
import { serialDeFecha } from '../lib/libro-extractores-obras.mjs'
import {
  materialesPorObra, movimientosDeMaterialesPorPlazo, exigirNeteoDeMateriales,
} from '../lib/materiales-previstos.mjs'
// El nombre REAL de la pestaña lo publica su propio generador: escribirlo acá a mano es la segunda
// definición que se desincroniza el día que la pestaña se renombre.
// La medición de si la MO de las obras llegó de verdad al flujo. Ver la nota al pie de la
// conciliación con OBRAS: la línea que decía "$126.974.442 de MO va por Jornales" no medía nada.
import {
  demandaJornalPorQuincena, publicadasPorQuincena, coberturaDeManoDeObra, informeCobertura,
  fechaLocalDeSerial,
} from '../lib/obras-en-cash-flow.mjs'
import { cruzar, chequesDelRegistro } from '../lib/cruce-cheque-factura.mjs'
import { endososDeCartera } from '../lib/libro-endosos.mjs'
import { debitosDelExtracto, corteDelExtracto, pagosDeResumen, chequesCubiertosPorBanco } from '../lib/libro-respaldo-banco.mjs'
// EL CRUCE DEL RESTO DEL LIBRO (cargas sociales, impuestos, financiero). Corre sobre el libro
// ENTERO, como el de cheques: un extractor que sólo ve su pestaña no puede saber qué débito ya
// reclamó otro. Ver lib/libro-cruce-banco.mjs.
import { cruzarLibroContraBanco, aplicarCruce, VEREDICTO_CRUCE, GRITAN_CRUCE } from '../lib/libro-cruce-banco.mjs'
import { ROTULOS_CALENDARIO, CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { ROTULO as ROTULO_IMPUESTO_CHEQUE } from '../lib/impuesto-cheque.mjs'
import { coberturaPorRubro, huecosDeCobertura, problemasDeRol, verificarCobertura } from '../lib/cash-flow-cobertura.mjs'
import { fechaDeSerial, isoDeSerial } from '../lib/libro-extractores-fechas.mjs'
import { celdaEstado, celdaImporte, columnaEstadoDeCompras, columnasVivasDeCompras, exigirColumnasNeteo, estadosDecorados } from '../lib/libro-estado-vivo.mjs'
import { total } from '../lib/patron-pestana.mjs'
import { leerTipoCambio, RANGO_TC } from '../lib/tipo-cambio.mjs'
import { ubicarRegistro } from './cheques-emitidos-tablero.mjs'
// EL PLAN DE EGRESOS DE OBRA VIVE EN POSTGRES DESDE EL 07/09/2026 (ver el bloque que lo lee).
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = '_MOVIMIENTOS'
const DRY = process.argv.includes('--dry')

/** El serial de HOY en el huso del archivo (es-AR): el corte para vencidos. */
const hoySerial = () => Math.floor((Date.now() - Date.UTC(1899, 11, 30)) / 86400000)

/** Dos decimales — sumar pesos con coma flotante deja centavos que después no cierran contra el Sheet. */

// `Cliente` va DESPUÉS de `Clave` y no al lado de `Obra`, que es donde se leería mejor: el portón
// (conciliar-libro.mjs) lee esta pestaña por índice —origen es el 13— y una columna insertada en el
// medio le corre tres campos SIN darle un error. Seguiría conciliando, contra los datos equivocados.
const ENCABEZADO = ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado',
  'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Origen', 'Fila', 'Clave', 'Cliente']

/** Los rangos con nombre de la nómina. El cash flow lee EXACTAMENTE éstos: una sola definición. */
const NOMBRES_NOMINA = [
  'JORNALES_REAL_PAGO', 'JORNALES_REAL_HASTA', 'JORNALES_REAL_PAGADO', 'JORNALES_REAL_TOTAL',
  'JORNALES_REAL_BANCO',
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
  const [fechasCargas, f931Cargas, gremialesCargas, declaradoCargas, gremialesDeclarados] = await Promise.all([
    opcional(NOMBRES_CARGAS.fechas), opcional(NOMBRES_CARGAS.f931), opcional(NOMBRES_CARGAS.gremiales),
    opcional(NOMBRES_CARGAS.declarado), opcional(NOMBRES_CARGAS.gremialesDeclarado),
  ])
  // ═══ LA BOLETA, PARA SABER QUÉ PAGÓ CADA DÉBITO GREMIAL (10/09/2026) ═══
  //
  // El extracto dice cuánto salió y a qué CUIT; lo que ese débito CANCELA sale de la boleta. Sin la
  // réplica no hay apareo posible y la única consecuencia es que los gremiales vuelven a decidirse
  // sólo por Compras — el estado de ayer. Por eso es lectura opcional, como las cinco de arriba.
  const boletasUocra = await opcional(`'${RAW_UOCRA}'!A1:J`)
  // Y LAS DE IERIC/FODECO SE LEEN DEL PDF EN DRIVE (11/09/2026): no tienen réplica en el Sheet porque el
  // declarado de la pestaña no las incluye; ver lib/cargas-boletas-ieric.mjs. Sin base o sin Drive → [] y aviso.
  const boletasIeric = await leerBoletasIeric({ query, google, aviso: (m) => console.warn(`  ⚠ ${m}`) })

  // El registro de cheques se ubica por el DATO (FISICO/ECHEQ), no por una fila fija.
  const reg = ubicarRegistro(cheques.map((f) => [f?.[0]]))
  if (!reg) throw new Error('no encontré el registro de Cheques Emitidos: sin él el COMPROMETIDO queda afuera.')

  // LAS FILAS DEL IVA/IIBB SE UBICAN POR SU RÓTULO, con el mismo texto que las escribe
  // impuestos-pestana.mjs (por eso el contrato se importa y no se copia: el 30/07 se renombró de un
  // solo lado razonando sobre el número de fila y los dos cash flow quedaron sin poder regenerarse).
  const filaDeRotulo = (rot) => impuestos.findIndex((f) => String(f?.[0] ?? '').trim() === rot) + 1 || null
  // La del impuesto al cheque se ubica igual, y por la misma razón: su rótulo lo define
  // lib/impuesto-cheque.mjs y lo escribe impuestos-bloques.mjs importándolo.
  const filasCal = {
    filaIva: filaDeRotulo(total(ROTULOS_CALENDARIO.iva)),
    filaIibb: filaDeRotulo(total(ROTULOS_CALENDARIO.iibb)),
    filaCheque: filaDeRotulo(ROTULO_IMPUESTO_CHEQUE),
  }
  if (!filasCal.filaIva || !filasCal.filaIibb || !filasCal.filaCheque) {
    throw new Error(`no encontré "${total(ROTULOS_CALENDARIO.iva)}" / "${total(ROTULOS_CALENDARIO.iibb)}" / `
      + `"${ROTULO_IMPUESTO_CHEQUE}" en `
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
  // Y EL DECLARADO LE GANA A LA PROYECCIÓN (08/09): el F931 ya presentado entra por su importe de DDJJ,
  // COMPROMETIDO, salvo que Compras lo tenga pagado o un plan lo financie. Ver `obligacionDeclarada`.
  const enCompras = cargasEnCompras(compras)
  // ═══ Y EL PAGO GREMIAL LO PRUEBA EL BANCO, NO LA PLANILLA (10/09/2026) ═══
  //
  // El dueño prohibió cargar los gremiales en Compras. Desde acá la fuente de «pagada» es el débito:
  // se aparea contra la boleta en `cargas-pagos-banco.mjs` y se consume del MISMO `usados` que el
  // resto de los cruces — un débito respalda a una sola obligación.
  const pagosBanco = pagosGremialesDelBanco({
    debitos: extracto.debitos, boletas: boletasUocra ?? [], boletasIeric, usados: extracto.usados,
  })
  for (const a of pagosBanco.avisos) console.warn(`  ⚠ ${a}`)
  const porPeriodo = new Map([...pagosBanco.porPeriodo].map(([p, v]) => [`${p}·${RUBRO_GREMIALES}`, v]))
  for (const [, v] of pagosBanco.porPeriodo) console.log(`  gremiales pagados por el banco · ${explicarPago(v)}`)
  const cubiertosPorBanco = new Set()
  const cargas = deCargasSociales(
    {
      fechas: fechasCargas, f931: f931Cargas, gremiales: gremialesCargas,
      declarado: declaradoCargas, gremialesDeclarado: gremialesDeclarados,
    },
    corte, {
      mesesPagados: enCompras.mesesPagados,
      mesesFinanciados: enCompras.financiados,
      aviso: (m) => console.warn(`  · ${m}`),
      pagosDelBanco: porPeriodo,
      anotarCubierto: (c) => cubiertosPorBanco.add(c),
    },
  )
  const declarados = cargas.filter((m) => / · declarado /.test(String(m.origen?.fila ?? '')))
  if (declarados.length) {
    console.log(`  cargas sociales: ${declarados.length} obligación(es) DECLARADA(s) sin pagar en Compras → `
      + declarados.map((m) => `${m.concepto} ${pesos(m.importe)} el ${isoDeSerial(m.fecha)}`).join(' · '))
  }
  // EL MES QUE EL BANCO APAGÓ SIGUE CUBIERTO. `mesesCubiertos` mira los movimientos EMITIDOS, y una
  // obligación pagada no emite ninguno: sin esta unión, las filas planas de Compras de ese mes
  // volverían a entrar encima de la plata que ya salió de la cuenta.
  const cargasCubiertas = mesesCubiertos(cargas)
  for (const c of cubiertosPorBanco) cargasCubiertas.add(c)
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
  // ═══ LOS MATERIALES PREVISTOS SALEN DE `public.obra_egreso_proyectado` (07/09/2026) ═══
  //
  // Vinieron de tres fuentes en tres meses y el motivo del último salto está escrito entero en
  // `lib/materiales-previstos.mjs`: las constantes de obras-datos (hasta el 24/08) → el cuadro 5 de
  // la pestaña OBRAS, porque el dueño editaba ahí las fechas a mano → el REGISTRO, porque el 07/09 el
  // dueño sacó ese cuadro de la pestaña y su plan quedó sin celda.
  //
  // LA MUDANZA SE HIZO ANTES DE SACAR EL CUADRO, no después: los 17 ítems con las fechas que él
  // corrigió el 24/08 están en el registro con su celda de origen. Si se hubiera borrado primero, el
  // cash flow habría perdido $18,9M de egresos proyectados sin un solo error.
  //
  // SIN FALLBACK, A PROPÓSITO: si el registro no se puede leer o está vacío, salen CERO materiales y
  // se grita. Caer a las constantes sería republicar en silencio las fechas viejas que él ya corrigió
  // — exactamente el defecto que las dos mudanzas anteriores vinieron a arreglar.
  //
  // ═══ LA LLAVE DEL DUEÑO (24/08/2026): «esas proyecciones no deben considerarse por el momento» ═══
  //
  // Se conserva con su semántica: con ORQ_LIBRO_SIN_OBRAS=1 el libro sale sin «Materiales de obra
  // proyectados». Jornales, cargas, estructura y recurrentes NO pasan por acá.
  const sinObras = process.env.ORQ_LIBRO_SIN_OBRAS === '1'
  // La FICHA de cada obra (cliente y fecha de inicio) sigue viniendo de obras-datos: el registro no
  // publica ninguno de los dos y el SUMPRODUCT del neteo los necesita. Import dinámico con guarda,
  // como estaba: sin el módulo la ficha sale vacía y el aviso de cada obra lo dice.
  // ═══ LOS MATERIALES SE REPARTEN EN EL PLAZO DE LA OBRA, NETOS POR OBRA (08/09/2026) ═══
  //
  // Decisión del dueño sobre los $18,9M que el gráfico ponía el 01/10: «no se debe considerar de esa
  // manera; los costos de las obras están en OBRAS». `fecha_estimada` deja de leerse como vencimiento;
  // el costo de materiales de cada obra se reparte por días hábiles en lo que resta del plazo (mismo
  // criterio que la MO en `jornales-demanda-obras.mjs`) y se netea POR OBRA contra Compras (cliente +
  // «Detalles / Obra» ∋ alias). El porqué entero está en `lib/materiales-previstos.mjs`.
  //
  // La FICHA de cada obra (cliente, inicio, fin, patrón de Compras) sigue viniendo de obras-datos, que
  // es la transcripción de la pestaña OBRAS. Import dinámico con guarda: sin el módulo la ficha sale
  // vacía y cada obra se reporta como FALTA_DATO.
  const fichaObras = await import('../lib/obras-datos.mjs').then((m) => ({ obras: m.OBRAS_FUTURAS ?? [], patron: m.comprasObraDe ?? (() => null) })).catch(() => ({ obras: [], patron: () => null }))
  const OBRAS_FUTURAS = fichaObras.obras
  // SÓLO LOS MATERIALES: la mano de obra del registro se paga por Jornales y entra al libro por su
  // propia puerta (MAX(plantel; demanda de OBRAS)). Sumarla acá la contaría dos veces.
  const previstos = sinObras ? [] : await query(`select obra_rotulo, obra_clave, obra_canonica_id, concepto, familia, proveedor, monto,
      origen_pestana, to_char(fecha_estimada, 'YYYY-MM-DD') as fecha_estimada
    from public.obra_egreso_proyectado where tipo = 'material'
    order by obra_rotulo, concepto`)
    .then((r) => r.rows)
    .catch((e) => {
      console.error(`  ⚠⚠ NO PUDE LEER public.obra_egreso_proyectado (${e.message}). Los materiales `
        + 'previstos salen en CERO: no caigo a obras-datos.mjs porque eso republicaría las fechas '
        + 'viejas que el dueño ya corrigió a mano, y saldrían sin que nadie se entere.')
      return []
    })
  // Los alias de cada obra canónica: «Salones Comerciales» es SALÓN COMERCIAL. Es la MISMA tabla que usa
  // la web para imputar una compra a una obra — una fuente, no una segunda lista acá.
  const aliasPorObra = await query('select alias, obra_id from public.obra_alias where obra_id is not null')
    .then((r) => r.rows.reduce((m, x) => (m.set(x.obra_id, [...(m.get(x.obra_id) ?? []), x.alias]), m), new Map()))
    .catch(() => new Map())
  const porObra = materialesPorObra(previstos)
  const contextoObras = new Map(OBRAS_FUTURAS.map((o) => {
    const obra = String(o?.obra ?? '').trim()
    const canonica = porObra.get(obra)?.canonica ?? o?.clave
    return [obra, {
      clave: o?.clave, cliente: o?.cliente, inicioSerial: serialDeFecha(o?.inicio), inicio: o?.inicio, fin: o?.fin,
      patrones: [fichaObras.patron(o), o?.ventaTexto, ...(aliasPorObra.get(canonica) ?? [])].filter(Boolean),
    }]
  }))
  if (sinObras) {
    console.warn('  ⚠ materiales previstos: EXCLUIDOS por ORQ_LIBRO_SIN_OBRAS=1 (llave del dueño, 24/08) — el libro sale sin «Materiales de obra proyectados».')
  } else if (!previstos.length) {
    console.warn('  ⚠⚠ public.obra_egreso_proyectado NO TIENE MATERIALES: el cash flow sale sin un solo '
      + 'egreso de obra proyectado. Cargalos con `node orquestador/scripts/obras-previstos-cargar.mjs --aplicar`.')
  }
  // ═══ SIN NETEO NO SE PUBLICA: ABORTA, Y EL MENSAJE DICE QUÉ COLUMNA FALTÓ (13/08/2026) ═══
  //
  // `exigirColumnasNeteo` tira con el rótulo adentro ("Fecha factura") en lugar de degradar a importes
  // pegados. El criterio, y por qué un dato muerto en silencio es peor que una corrida caída, viven
  // con la función en lib/libro-estado-vivo.mjs. Sin materiales previstos no hay nada que netear.
  const colsNeteo = porObra.size ? exigirColumnasNeteo(compras) : null
  const obrasFuturas = movimientosDeMaterialesPorPlazo(porObra, {
    contexto: contextoObras, colsCompras: colsNeteo, corte, hoy: fechaLocalDeSerial(corte), aviso: (m) => console.warn(`  ⚠ ${m}`),
  })
  // Y ACÁ TAMPOCO SE DEGRADA: si alguna obra no pudo netear, aborta con la obra adentro.
  exigirNeteoDeMateriales(obrasFuturas)
  const plan = { resumen: { items: previstos.length } }
  if (obrasFuturas.resumen.movimientos) {
    console.log(`  materiales previstos (public.obra_egreso_proyectado): ${obrasFuturas.resumen.obras} obra(s) · `
      + `${plan.resumen.items} ítem(s) · ${obrasFuturas.resumen.movimientos} egreso(s) semanal(es) repartidos en el plazo · `
      + `${pesos(obrasFuturas.resumen.total)} planificado (neteo vivo POR OBRA contra Compras)`)
  }
  for (const t of obrasFuturas.terminadas) console.log(`  · «${t.obra}» terminó el ${t.fin}: ${pesos(t.previsto)} previstos NO se proyectan`)
  for (const f of obrasFuturas.sinPlazo) console.warn(`  ⚠ FALTA_DATO «${f.obra}»: ${f.motivo} — ${pesos(f.previsto)} previstos NO se proyectan`)
  // El control contra el total declarado por la pestaña se retiró el 07/09 (el registro llega tipado
  // desde Postgres: no hay nada que interpretar mal) y las filas omitidas por fecha ilegible dejaron de
  // existir el 08/09: la fecha ya no se lee. Lo que puede faltar ahora es el PLAZO, y se grita arriba.
  {
    // ═══ "$X DE MO VA POR JORNALES" ERA UNA AFIRMACIÓN, NO UNA MEDICIÓN (14/08/2026) ═══
    //
    // El bloque de arriba copiaba `moCargasPesos` de la explosión del dueño y lo daba por llegado (ya
    // no existe: la conciliación contra las constantes se reemplazó por el control contra el total que
    // publica el propio cuadro 5). Pero la MO de las obras SIGUE entrando al libro por otra puerta —la
    // pestaña Jornales, que esta medición no toca—, cuya celda proyectada es el PLANTEL ACTUAL con
    // su aumento: si ese número supera a la demanda de las obras, la MO de la obra está ADENTRO de lo
    // publicado; si queda corto, el cash flow muestra de menos y nada más lo diría. (Hasta el 14/08
    // la celda era `MAX(convenio; demanda)` y entonces este control NO PODÍA dar rojo: el MAX
    // garantizaba por construcción que lo publicado nunca fuera menor. Ahora sí puede.) Se mide contra lo que la planilla publica de verdad —dos fuentes
    // independientes, que es lo único que hace válido a un control— y se imprime siempre, también
    // cuando cubre el 100%: un control que sólo habla cuando falla no se distingue de uno apagado.
    if (OBRAS_FUTURAS.length) {
      const demanda = demandaJornalPorQuincena(OBRAS_FUTURAS, { desde: fechaLocalDeSerial(corte) })
      const publicadas = publicadasPorQuincena({ hasta: R.JORNALES_PROY_HASTA, total: R.JORNALES_PROY_TOTAL })
      for (const l of informeCobertura(coberturaDeManoDeObra(demanda, publicadas))) console.log(l)
      if (publicadas.sinFecha) {
        console.warn(`  ⚠ Jornales publica ${pesos(publicadas.sinFecha)} de quincenas proyectadas SIN fecha de cierre: `
          + 'no se pueden ubicar en el calendario y quedan fuera de esta medición.')
      }
      for (const s of demanda.sinEscala) {
        console.warn(`  ⚠ la categoría "${s}" tiene horas de obra y no tiene escala de convenio: su jornal no entra en la medición.`)
      }
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

  // Los cargos del banco se calculan UNA vez: los consume el libro y, además, el neteo del impuesto
  // al cheque proyectado necesita saber exactamente cuánto de ese impuesto ya entró por esta puerta.
  // Los cheques vivos que NO salen por su propia puerta porque el cruce dice que su factura ya los
  // lleva. Se juntan para publicarlos: sin la lista, un cheque que salió por Compras y uno que no
  // salió por ningún lado se ven igual desde afuera — la auditoría del 10/09 midió $8,2M sin poder
  // separarlos.
  const chequesPorCompras = []
  const cargosBanco = deBancoCargos(banco, { fila0: 4 })
  const anioDelLibro = new Date().getFullYear()

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
      // Los materiales previstos del cuadro 5 de OBRAS, con LAS FECHAS QUE EL DUEÑO EDITÓ A MANO. La
      // MO no está en ese cuadro (va por Jornales) y la máquina propia tampoco (no es caja): el
      // cuadro sólo lista egresos de caja, así que no hay nada que filtrar. El importe es fórmula: se
      // descuenta solo cuando la factura real entra a Compras. Ver lib/materiales-previstos.mjs.
      Obras: obrasFuturas.movimientos,
      // Los gastos de estructura de los meses que todavía no llegaron, leídos de la pestaña que ya los
      // calcula. Netos de lo facturado: la factura real entra por Compras, la provisión se apaga sola.
      Estructura: gastosEstructura.movimientos,
      'Cargas Sociales': cargas,
      Cobranzas: deCobranzas(cobranzas, corte, { endosos, excluidos, tipoCambio }),
      // ═══ LOS TRES RECIBEN `corte` DESDE EL 11/09/2026, Y NO ES UN PARÁMETRO DE MÁS ═══
      //
      // Estampaban 'COMPROMETIDO' a mano, sin pasar por `estadoContraCorte`. Un pendiente con fecha ya
      // pasada tiene que nacer VENCIDO: el Semanal ancla su arrastre en la semana del corte de caja, y
      // una columna anterior no publica saldo — el movimiento se pierde para siempre. Medido: $263.813,91
      // de diferencia entre `CFS!BB50` y `CFM!M50` por la cuota 2 de Pintureria Cordoba, vencida el 02/09.
      'Cheques Emitidos': deChequesEmitidos(cheques, { fila0: reg.primera, cruce, corte, aviso: (x) => chequesPorCompras.push(x) }),
      'Tarjeta de Credito': deTarjetaSinFactura(tarjeta, { pagos: pagosTarjeta, corte }),
      _BANCO_RAW: cargosBanco,
      _CHEQUES_RAW: deCartera(carteraRaw, { corte }),
      // El impuesto al cheque proyectado entra NETO de lo que el banco ya debitó en el mes: esos
      // débitos ya están en el Libro por `_BANCO_RAW`, y sumarlos dos veces sería el defecto del día.
      'Impuestos y Financieros': deImpuestosCalendario(impuestos, filasCal, anioDelLibro, corte,
        { yaDebitado: debitosDeImpuestoAlCheque(cargosBanco, anioDelLibro) }),
      // EL EXTRACTO TAMBIÉN ES TESTIGO DE LAS QUINCENAS (16/08). Con la columna "Pagado el"
      // desalineada, ocho quincenas entraban impagas y CAJA publicaba $70.431.250 de deuda que no
      // existía. `JORNALES_REAL_BANCO` es la parte que sale por transferencia: es lo único que el
      // banco puede confirmar, y es lo que se compara. Ver lib/jornales-testigos.mjs.
      Jornales: deJornalesQuincenas({
        reales: {
          pago: R.JORNALES_REAL_PAGO, hasta: R.JORNALES_REAL_HASTA, pagado: R.JORNALES_REAL_PAGADO,
          total: R.JORNALES_REAL_TOTAL, banco: R.JORNALES_REAL_BANCO,
        },
        proyectadas: { pago: R.JORNALES_PROY_PAGO, hasta: R.JORNALES_PROY_HASTA, total: R.JORNALES_PROY_TOTAL },
      }, corte, { extracto, aviso: (m) => console.warn(`  ⚠ ${m}`) }),
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
    // EL MISMO Set QUE YA CONSUMIÓ LA NÓMINA. El cruce del resto del libro corre después y tiene que
    // ver qué débitos están reclamados: con un Set nuevo, el lote de haberes que ya pagó una quincena
    // podría además "pagar" una obligación de otra naturaleza. Un débito respalda a UNO solo.
    usadosBanco: extracto.usados,
    // LA LISTA VIAJA CON EL RESTO: se declara acá adentro y `main()` la publica. El 10/09 a las
    // 18:34 quedó declarada y no devuelta, `main()` la nombró igual, y el libro murió con
    // «chequesPorCompras is not defined» ANTES de escribir: tres corridas (19:01, 21:02, 07:00)
    // dejaron CAJA y los dos Cash Flow leyendo el libro de las 17:01.
    chequesPorCompras,
  }
}

/**
 * EL CRUCE DEL RESTO DEL LIBRO CONTRA EL EXTRACTO, con su evidencia impresa.
 *
 * La decisión vive en `lib/libro-cruce-banco.mjs` (núcleo puro, probado en frío); acá sólo se le
 * arma el contexto y se MUESTRA lo que decidió. Se imprime todo: lo que retira, lo que grita y lo
 * que sobró del banco sin obligación que lo explique — una plata que cambia de estado sin que nadie
 * diga cuánta es indistinguible de un error.
 */
function cruceBanco(libro, debitos, corteBanco, usados) {
  const desdeExtracto = debitos.reduce((a, d) => (a === null || d.fecha < a ? d.fecha : a), null)
  const r = cruzarLibroContraBanco(libro, debitos, { corte: corteBanco, desdeExtracto, usados })
  for (const aviso of r.avisos) console.log(`  ⚠ ${aviso}`)
  let retirado = 0
  r.veredictos.forEach((v, i) => {
    if (v.veredicto !== VEREDICTO_CRUCE.banco) return
    retirado += libro[i].importe
    console.log(`  ✓ ${libro[i].concepto?.slice(0, 46)} ${pesos(libro[i].importe)}: ${v.motivo} `
      + `— pasa a REAL (_BANCO_RAW f${v.filas.join(', f')})`)
  })
  const gritan = [...r.veredictos.values()].filter((v) => GRITAN_CRUCE.includes(v.veredicto))
  if (retirado) console.log(`  → el extracto retira ${pesos(retirado)} de deuda que ya estaba pagada`)
  if (gritan.length) console.log(`  → ${gritan.length} obligación(es) que ninguna fuente prueba (ver deuda-evidencia-pago.mjs)`)
  for (const s of r.sobrantes) {
    console.log(`  ⚠ el banco pagó ${pesos(s.sobrante)} de ${s.naturaleza} el serial ${s.fecha} que NINGUNA `
      + `obligación del libro explica (_BANCO_RAW f${s.fila}) — falta cargar ese concepto`)
  }
  return r
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const corte = hoySerial()
  const {
    fuentes: porFuente, excluidos, corteBanco, debitosBanco, usadosBanco, colEstadoCompras, colsVivas, chequesPorCompras,
  } = await extraerDeLasFuentes(google, corte)
  let todos = Object.values(porFuente).flat()
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
  // ═══ Y EL RESTO DEL LIBRO TAMBIÉN SE CRUZA CONTRA EL EXTRACTO (17/08) ═══
  //
  // Hasta hoy el extracto sólo era testigo de la nómina y de los cheques: las cargas sociales, los
  // impuestos y el financiero decidían "pagado" por lo que dijera su pestaña de origen. Cuando nadie
  // marcó la pestaña, la plata figuraba debiéndose aunque el banco la hubiera pagado once días antes
  // — el F931 de julio ($7.074.772) con el pago de ARCA del 11/08 ya debitado. Ver lib/libro-cruce-banco.mjs.
  todos = aplicarCruce(todos, cruceBanco(todos, debitosBanco, corteBanco, usadosBanco))
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
  // ═══ EL COLAPSO SE PUBLICA CON SU PLATA (10/09/2026) ═══
  //
  // Se imprimían los OCHO primeros colapsos, sin un peso y sin `⚠`: los $6.732.878 de las quince
  // filas de Compras que chocan por (CUIT · comprobante · signo) no llegaban a ninguna celda de
  // ningún cash flow y nadie lo veía en la corrida. El `⚠` es lo que el pipeline levanta de la
  // salida, así que sin él el hallazgo no existe para el que lee el resumen.
  if (chequesPorCompras.length) {
    const t = chequesPorCompras.reduce((a, x) => a + x.importe, 0)
    console.log(`  ↪ ${chequesPorCompras.length} cheque(s) vivo(s) por ${pesos(t)} NO salen por «Cheques Emitidos»: `
      + 'su factura ya los lleva por Compras (cuotas comprometidas). No es un hueco — es la otra puerta:')
    for (const x of chequesPorCompras) {
      console.log(`      f${x.fila} ${String(x.proveedor).slice(0, 24).padEnd(26)} ${pesos(x.importe).padStart(14)} `
        + `→ Compras f${x.comprasQueLoCubren.join(', f')} (${x.confianza ?? 'sin confianza declarada'})`)
    }
  }
  const colapsada = plataColapsada(colapsos)
  if (colapsada.total > 0) {
    console.warn(`  ⚠ ${colapsos.length} colapso(s) de deduplicación dejaron ${pesos(colapsada.total)} FUERA del libro: `
      + 'la misma clave (CUIT · comprobante · signo, o el número del cheque) llegó más de una vez.')
    for (const o of colapsada.porOrigen) {
      console.warn(`      ${o.pestana}: ${pesos(o.monto)} · fila(s) ${o.filas.join(', ')}`)
    }
    console.warn('      NO se suman solas: pueden ser dos tramos de la misma factura (sumarlas es lo correcto) o la '
      + 'misma factura cargada dos veces (sumarlas inventaría plata). Lo decide quien cargó la fila.')
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
