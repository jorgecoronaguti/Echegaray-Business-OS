#!/usr/bin/env node
// PROVEEDORES Y MATERIALES — CON QUIÉN SE GASTA, QUÉ SE LE DEBE Y QUÉ SE LE COMPRA.
//
// EL PEDIDO (21/07). "Agreguemos todo esto en la pestaña Materiales, se debe llamar 'Proveedores y
// Materiales'. Hacé una auditoría súper profunda de Compras y llevá la información de los
// proveedores acá: saldos en cuenta corriente, cheques, fechas, todo."
//
// POR QUÉ UNA SOLA PESTAÑA Y NO DOS. Porque son la misma pregunta vista de dos lados: "a quién le
// compro" y "a quién le debo" se contestan con las mismas 738 filas de Compras. Tenerlas separadas
// obligaba a saltar de pestaña para responder lo único que importa —¿a este proveedor le debo o le
// pagué, y qué le compro?— y esa es exactamente la falta de visibilidad que el dueño describió.
//
// ═══ LA SEGUNDA VUELTA (21/07): FALTABA AFIP ═══
//
// El dueño: "no me gusta lo que hiciste con proveedores, falta información de números de cheques,
// números de facturas emitidas. No usaste el recurso de integrarse a AFIP. La regla de oro es que se
// base en el OS y ahí está eso."
//
// Tenía razón y era el punto ciego más caro. El OS ya replica los libros de IVA en la tabla
// comprobantes_arca —443 comprobantes recibidos y 16 emitidos, con CUIT, punto de venta, número,
// CAE y fecha— y yo estaba construyendo una cuenta corriente de proveedores mirando sólo Compras,
// que es lo que alguien cargó a mano. Cruzarlas da el número que justifica la vuelta entera:
//
//   AFIP tiene 443 comprobantes de compra por $197.442.458
//   · 372 están en Compras   ($126.251.048)
//   · 71 NO ESTÁN            ($71.191.410) — Acerolatina $19,6M, Alumetal $18,9M, Friolatina $18,5M
//
// ═══ LA TERCERA VUELTA (21/07): LOS $71,19M NO ERAN $71,19M ═══
//
// Ese número de arriba está MAL y se deja escrito a propósito, porque el error enseña. Dos causas,
// las dos encontradas al ir a buscar factura por factura en vez de confiar en el total:
//
// 1. EL CRUCE EMPAREJABA SÓLO POR N° DE COMPROBANTE, y 223 filas de Compras no tienen número. La
//    factura de ALUMETAL por $18.166.381 SÍ estaba cargada (fila 669) con el número vacío, y la de
//    $75.415 estaba como "0038-0002471" — le falta un dígito. Emparejando también por proveedor +
//    importe aparecen 9 comprobantes por $38.411.092 que nunca faltaron.
//
// 2. LAS NOTAS DE CRÉDITO SE CONTABAN COMO COMPRAS. Ver lib/comprobante-arca.mjs: 13 notas por
//    $20.976.638 sumadas en vez de restadas. Una nota de crédito "que falta en Compras" no es carga
//    faltante — es plata que el proveedor devolvió, y buscarla manda a alguien a perseguir un gasto
//    que no existe.
//
// LA LECCIÓN, que vale más que el número: un total grande y redondo invita a reportarlo. Los $71,19M
// sobrevivieron porque nadie los abrió. Al abrirlos, casi todo se explicaba.
//
// Y AHORA HAY NÚMEROS, no sólo totales: cada deuda muestra su comprobante (punto de venta y número)
// y el número del cheque que la paga. Un saldo sin el documento que lo respalda no se puede reclamar
// ni pagar: hay que poder decirle al proveedor "te debo la 0038-00025090 y te di el cheque 314".
//
// ═══ LO QUE ENCONTRÓ LA AUDITORÍA DE COMPRAS, Y QUE ESTA PESTAÑA MUESTRA ═══
//
// 1. EL PLAZO. Medido factura contra pago, proveedor por proveedor: Alumetal da 4 días, Corralón
//    Progreso 7, DUPEC 9, y TODO EL RESTO paga a 0 días. La empresa casi no usa el crédito de sus
//    proveedores —que es gratis— y en cambio estuvo en descubierto casi todo julio al 62,78% anual.
//    Es la conclusión más cara del archivo y hasta hoy no estaba a la vista en ningún lado.
//
// 2. LA CARGA ESTÁ PROLIJA donde importa: de 105 proveedores, sólo UNO aparece con dos grafías
//    ("Linarc SAS" y "Linarc"). Un saldo de cuenta corriente se parte en dos cuando el mismo
//    proveedor está escrito de dos formas, así que esto se controla y se muestra.
//
// 3. EL INSTRUMENTO. Un cheque emitido y no debitado es una deuda con fecha cierta que no se puede
//    renegociar; una deuda sin cheque todavía se puede conversar. Son dos cosas distintas y por eso
//    van en columnas separadas.
//
// TODO ES FÓRMULA sobre Compras y sobre Cheques Emitidos. Lo único propio son los NOMBRES —de
// proveedor, de familia, de obra— que son rótulos, no números.
//
//   node orquestador/scripts/proveedores-materiales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { FAMILIAS, SIN_FAMILIA, formulaFamilia, familiaDeMaterial, RUBROS_CON_FAMILIA } from '../lib/familia-material.mjs'
import { NOMBRES } from '../lib/sheet-pestanas.mjs'
import { partir, filasHuerfanas, ref as refPestana } from '../lib/partir-pestana.mjs'
import { anchosSegunContenido } from '../lib/nota-celda.mjs'
import { fusionar, sobrantes, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro, detectarArranqueEnFrio, autoRespetarReescritura } from '../lib/respetar-ediciones.mjs'
import { firmaGuardia, sellarFirma } from '../lib/firma-tab.mjs'
import { ESTADO_DEUDA } from '../lib/cuentas-por-pagar.mjs'
/** El estado de Compras para lo pactado que todavía no es deuda firme. Convive con "Pendiente". */
const ESTADO_PROYECTADO = 'Proyectado'
import { formulaComercial } from '../lib/orden-deuda.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { normComprobante, esLlaveUtil } from '../lib/cheques-cobertura.mjs'
import { signo, esNotaDeCredito } from '../lib/comprobante-arca.mjs'
import { analizar as analizarNC, facturasAnuladasCargadas, clave as claveNC } from '../lib/notas-credito.mjs'
import { cruzar, verificar } from '../lib/cobertura-arca.mjs'
import { ARCA as N_ARCA, PROVEEDORES as N_PROV, publicar } from '../lib/rangos-nombrados.mjs'
import {
  COLS_PROVEEDOR, COLS_FACTURA, COLS_LIBRETA,
  rangosCompras, formulaPorProveedor, formulaPorFactura, formulaControl,
  reservaPara, filasLibreta, verificarMigracionNotas,
} from '../lib/proveedores-deuda-viva.mjs'
import { query } from '../lib/db.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { INK, MUTED, HAIR } from '../lib/estilo-statement.mjs'
import { R, IMPORTE, arcaPorComprobante, arcaPorComprobanteVentas, totalLibro } from '../lib/arca-formula.mjs'
import { formatear as formatearCuit } from '../lib/cuit.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = NOMBRES.proveedoresMateriales
const DRY = process.argv.includes('--dry')
// REGENERACIÓN INTENCIONAL (opt-in, apagado por defecto). Cuando el dueño pide explícitamente
// "regenerá esta pestaña", este flag saltea las dos guardas de SKIP (firma editada / auto-respeto de
// reescritura) que están para el worker autónomo 24×7. NO afecta la preservación: la fusión y
// notasAncladas siguen re-anclando los comentarios del dueño por proveedor/comprobante. Nunca se
// activa solo: hace falta --force en la línea de comandos o ORQ_PROV_FORCE=1 en el entorno.
const FORCE = process.argv.includes('--force') || process.env.ORQ_PROV_FORCE === '1'
// ALCANCE DE LA REGENERACIÓN (30/07). `--force` era GLOBAL: saltaba las guardas de skip de LAS DOS
// pestañas que este script escribe. Pero el dueño reescribió "Materiales" entera a mano (de 518
// rótulos míos quedan 38), así que un --force para arreglar el cuadro de deuda de "Proveedores" le
// habría pasado por encima a un trabajo que no tiene nada que ver con lo que se pidió. Una
// regeneración intencional tiene que poder apuntar a UNA pestaña.
//   --solo Proveedores   → sólo esa pestaña se escribe; la otra no se toca ni con --force
const iSolo = process.argv.indexOf('--solo')
const SOLO = iSolo >= 0 ? String(process.argv[iSolo + 1] ?? '').trim() : ''
const AÑO = 2026
const TOP = 30
/** Colchón de filas sobre la deuda actual, para que la tabla derrame sin pisar el bloque siguiente.
 *  ANTES ERA UN 40 FIJO y dejaba 27 filas muertas: el dueño vio la pestaña y dijo "es completamente
 *  inútil". Un cuadro con un agujero de treinta filas no se lee, por más que los números estén bien. */
// El colchón de filas que se reserva para que el QUERY derrame sin pisar el bloque de abajo.
// BAJÓ DE 8 A 2 (21/07): con 8 quedaban once filas en blanco a la vista en el medio de la pestaña, y
// el dueño lo señaló. El agente redimensiona cada 2 horas y el control del bloque 7 avisa si entre
// dos corridas entró más deuda de la que entra en la reserva, así que 2 alcanza.

// ═══ LAS COLUMNAS DE COMPRAS SE UBICAN POR NOMBRE, NO POR POSICIÓN FIJA ═══════════════════════════
//
// POR QUÉ (22/07). El dueño edita Compras a mano. Borró una columna y TODO lo que venía después se
// corrió una posición: "Rubro de caja" pasó de AC a AB, "Fecha de caja" de AD a AC, etc. El generador
// leía posiciones fijas (AC, AD, AE), así que empezó a leer FECHAS donde esperaba rubros → 0
// proveedores comerciales → la deuda y la cuenta corriente salieron VACÍAS. Y peor: al escribir la
// familia/orden en columnas fijas creó DUPLICADAS. La única defensa contra una planilla que una
// persona edita es ubicar cada columna por su ENCABEZADO. Estas variables son `let`: arrancan con la
// posición histórica y `mapearColumnasCompras()` (en main) las corrige según el encabezado real.
let COL_FAMILIA = 'Compras!$AE$4:$AE'
let COL_RUBRO = 'Compras!$AC$4:$AC'
let COL_FECHA = 'Compras!$AD$4:$AD'
let COL_COMERCIAL = 'Compras!$AJ$4:$AJ'
// COL_PAGADO ("Monto Pagado"): lo YA pagado de cada factura. La DEUDA real es Total − pagado, no el
// Total: un pago parcial reduce el saldo. El dueño lo marcó — estaba mostrando el Total entero.
let COL_PAGADO = 'Compras!$T$4:$T'
// LO PAGADO NO ESTÁ SÓLO EN T (27/07). El dueño confirmó: el pago de una factura puede estar en
// "Monto Pagado" (T), "Monto Parcial 1" (U) o "Monto Parcial 2" (W) — a veces T=0 y el pago entero
// está en U. Y un valor NEGATIVO/entre paréntesis en U o W NO es un pago: es el saldo que falta. Por
// eso `neta()` suma T + los positivos de U + los positivos de W. Restar sólo T inflaba la deuda.
let COL_PARCIAL1 = 'Compras!$U$4:$U'
let COL_PARCIAL2 = 'Compras!$W$4:$W'
// TIPO DE PAGO ("Tipo pago", col P): decide si la deuda todavía es del PROVEEDOR o ya se movió a un
// INSTRUMENTO. Una factura pagada con cheque o tarjeta ya no se le debe al proveedor (se la debés al
// cheque/tarjeta, que se cuentan en Cheques Emitidos, Tarjeta y CAJA). Contarla también acá es doble
// conteo — el "proveedor con deuda a quien ya pagaste". Por eso el hero desglosa directa/cheque/tarjeta.
let COL_TIPOPAGO = 'Compras!$P$4:$P'
const COL_OBRA = 'Compras!$J$4:$J'
// OJO CON EL NOMBRE: `COL_FACTURA` es la FECHA de la factura (col C), la que se resta contra la fecha
// de caja para medir el plazo. El NÚMERO de comprobante es la H y la categoría la B — las dos se usaban
// inline en cada fórmula; ahora tienen nombre porque la sección viva las referencia como rango abierto.
const COL_FACTURA = 'Compras!$C$4:$C'
const COL_COMPROBANTE = 'Compras!$H$4:$H'
const COL_CATEGORIA = 'Compras!$B$4:$B'
const COL_TOTAL = 'Compras!$O$4:$O'
const COL_PROV = 'Compras!$E$4:$E'
const COL_ESTADO = 'Compras!$X$4:$X'

/** Índices (0-based) de las columnas de Compras que el JS lee de cada fila. Se recalculan por nombre. */
const IDX = { rubro: 28, fechaCaja: 29, familia: 30, comercial: 35, pagado: 19, parcial1: 20, parcial2: 22, tipoPago: 15, obra: 9, prov: 4, total: 14, estado: 23, concepto: 11, detalle: 10 }


/** Los rubros que hacen que un proveedor sea COMERCIAL. Sueldos, ARCA o el banco no son proveedores
 *  a los que se les pueda pedir plazo, y mezclarlos tapa a los que sí. */
const RUBROS_COMERCIALES = [...RUBROS_CON_FAMILIA, 'Estructura', 'Servicios recurrentes']

/** El banco escribe "ALUMETAL S A" y Compras "Alumetal": sin normalizar, el cruce da cero. */
const normNombre = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\bS\.?\s?A\.?\s?S\.?\b|\bS\.?\s?A\.?\b|\bS\.?R\.?L\.?\b|\bSRL\b|\bSAS\b/g, '')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * LAS COLUMNAS DEL BLOQUE DE DEUDA LAS DECIDE EL DUEÑO, NO EL GENERADOR.
 *
 * REGLA DE ORO (22/07, textual): "Revisión de lo q la persona haya editado (yo o cualquier otro
 * usuario) respetarlo". El dueño agregó a mano las columnas "Tipo de Pago", "Categoría" y
 * "Comentarios" en la sección "qué se debe y cuándo", y el generador —que escribía por POSICIÓN
 * fija— le metía su "Instrumento" encima de "Tipo de Pago" y su "Categoría" encima de "Comentarios".
 *
 * Ahora se leen los encabezados REALES de la pestaña y cada dato va a la columna que el dueño rotuló.
 * Una columna que el generador no sabe llenar —"Comentarios"— queda VACÍA en la grilla, y la fusión
 * de preservar-anotaciones.mjs conserva lo que él escribió. Es la misma disciplina que ya se aplica a
 * Compras: nunca por posición, siempre por encabezado.
 */
/**
 * LAS NOTAS DE LA PERSONA SE ANCLAN AL PROVEEDOR, NO A LA FILA.
 *
 * POR QUÉ (22/07). Preservar por POSICIÓN alcanzaba mientras la lista no cambiaba. Entró un proveedor
 * nuevo (Mariana SA), la lista se reordenó, y todos los comentarios del dueño quedaron pegados al
 * proveedor equivocado: "Confirmar trueque con chatarra propia" terminó en La Aguilana cuando era de
 * La Isla Metal. Una nota vale por la ENTIDAD de la que habla, no por el renglón donde cayó.
 *
 * Lee el bloque de deuda que ya está en la pestaña y devuelve, para cada clave de negocio —nombre de
 * proveedor en las filas-cabecera, N° de comprobante en las de detalle—, lo que la persona escribió en
 * las columnas que el generador NO llena. Al reconstruir, cada nota vuelve a su proveedor.
 *
 * @param {any[][]} bloque filas del bloque de deuda ya escritas (desde la cabecera)
 * @param {object} L layout de columnas (layoutDeuda)
 * @returns {{porProveedor: Map<string, Map<number, any>>, porComprobante: Map<string, Map<number, any>>}}
 */
export function notasAncladas(bloque = [], L = {}) {
  const propias = new Set([L.prov, L.fecha, L.comp, L.imp, L.obra, L.pago, L.cat, L.instr].filter((i) => i >= 0))
  const porProveedor = new Map(); const porComprobante = new Map()
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  for (const fila of bloque) {
    const extra = new Map()
    for (let j = 0; j < (fila || []).length; j++) {
      if (propias.has(j)) continue
      const v = fila[j]
      if (v !== undefined && v !== null && String(v) !== '') extra.set(j, v)
    }
    if (!extra.size) continue
    const prov = norm(fila?.[L.prov])
    const comp = norm(fila?.[L.comp])
    // Una fila-cabecera tiene nombre de proveedor en la primera columna; una de detalle, no.
    if (prov) porProveedor.set(prov, extra)
    else if (comp && !/fac\.$/.test(comp)) porComprobante.set(comp, extra)
  }
  return { porProveedor, porComprobante }
}

/**
 * EL ANCHO QUE EL BLOQUE DE DEUDA REALMENTE OCUPA — no el que el dueño rotuló.
 *
 * ═══ EL INCIDENTE DEL 30/07, Y POR QUÉ ESTA FUNCIÓN EXISTE ═══
 *
 * El dueño rotuló OCHO columnas (A–H: hasta "Comentarios"), pero escribe hasta la Q (índice 16): al
 * lado de Hormiserv y de Alumetal tenía su propia hoja de cálculo a mano —el nombre otra vez, los
 * importes, "cheque a 4 dias"—. `celdas()` generaba filas del ancho de los RÓTULOS, así que todo lo
 * que estaba de la columna 8 en adelante quedaba FUERA del footprint del generador: nunca se marcaba
 * con VACIO, y la fusión —que por diseño preserva lo que no es suyo— lo dejaba clavado EN SU FILA
 * FÍSICA. Las notas se re-anclaban bien al proveedor (notasAncladas hacía su trabajo), pero los restos
 * anchos se quedaban quietos mientras los proveedores se movían. Resultado, con la lista reordenada:
 *
 *   · la fila de Hormiserv mostrando los números de Alumetal (el residuo de las columnas 13–16, que
 *     Hormiserv no llena y por lo tanto no tapaba);
 *   · una fila huérfana con importes y sin proveedor al lado;
 *   · notas que el dueño había BORRADO reapareciendo, porque su residuo nunca se limpió.
 *
 * LA REGLA. Un generador tiene que ser dueño de TODO lo que su bloque ocupa. Si preserva por fila
 * física una zona donde las filas se reordenan, no está respetando al dueño: está mezclando su trabajo.
 * Lo que se respeta es la NOTA —anclada a su proveedor, que es de lo que habla— no el renglón.
 *
 * No agranda la pestaña ni cambia el formato: sólo declara hasta dónde llega el bloque para poder
 * limpiarlo. Si el dueño estrecha su zona, el ancho se estrecha con ella en la corrida siguiente.
 */
export function anchoBloque(cols = [], previo = []) {
  const anchoPrevio = (previo || []).reduce((mx, f) => Math.max(mx, (f || []).length), 0)
  return Math.max((cols || []).length, anchoPrevio)
}

/**
 * LIMPIA EL FOOTPRINT DE UNA FILA ESTRUCTURAL — la que el generador es dueño de punta a punta
 * (los TOTALES y el encabezado/conteos de ARCA). En esas filas una celda vacía es SUYA y va vacía:
 * se marca cada '' con el centinela VACIO para que la FUSIÓN la BORRE de verdad, en vez de dejar ''
 * —que la fusión preserva— y así revivir el fantasma de una versión más ancha (seriales de fecha
 * pintados como moneda "$46.162", rótulos viejos "Fecha correcta"/"Tipo"/"Factura A" en las columnas
 * D–I). Sólo toca los '': un valor —o una NOTA legítima del generador, como la conciliación en la
 * col I de los cruces ARCA— es no-vacío y queda intacto. NO se usa en filas de detalle ni en el
 * bloque de deuda: ahí puede haber notas del dueño, preservadas por otra vía (celdas()/VACIO +
 * notasAncladas). El resto del footprint —más allá del ancho de cada fila— ya lo limpia el relleno
 * con VACIO al partir la pestaña (cuadroP).
 */
export const estructural = (arr = []) => arr.map((c) => (c === '' ? VACIO : c))

export function layoutDeuda(headers) {
  const H = (headers || []).map((h) => String(h ?? '').trim())
  const base = ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra', 'Tipo de pago', 'Categoría']
  const cols = H.filter(Boolean).length >= 4 ? H : base
  const cual = (re) => cols.findIndex((h) => re.test(h))
  return {
    cols,
    prov: 0,
    fecha: cual(/pr[oó]ximo pago/i),
    comp: cual(/comprobante/i),
    imp: cual(/importe/i),
    obra: cual(/^obra/i),
    pago: cual(/tipo de pago/i),
    cat: cual(/categor/i),
    instr: cual(/instrumento/i),
  }
}

/**
 * SE FUERON `predicadoConDeuda` Y `soloConDeuda` (31/07), Y VALE DEJAR ESCRITO POR QUÉ.
 *
 * Existían para tapar un agujero del diseño viejo: la fila-cabecera de cada proveedor era una fila
 * FÍSICA con su nombre escrito, así que cuando se le pagaba, el nombre seguía ahí con un "−" al lado.
 * La cura era envolver cada celda en IF(hayDeuda; valor; "") para que la fila se vaciara sola.
 *
 * Con la sección 1 viva el problema no se tapa: no existe. La lista de proveedores SALE de
 * `UNIQUE(FILTER(...))` sobre Compras y el filtro de saldo > 0 va adentro de la misma fórmula, así que
 * un proveedor pagado no queda vacío — no está. Una fila que no se genera no hay que apagarla.
 */

function grilla({ obras, proveedores, resto, deudaAgrupada, faltanEnCompras, emitidas, notasCredito, anuladasCargadas, cruce, deudaCols, deudaPrevio, libretaPrevia = [] }) {
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  const nombres = FAMILIAS.map(([n]) => n)
  const meses = Array.from({ length: 12 }, (_, m) => `1/${m + 1}/${AÑO}`)

  push([`PROVEEDORES Y MATERIALES ${AÑO}`])
  push(['Las mismas 738 filas de Compras vistas de los dos lados: a quién le compro y a quién le debo. Todo por fecha de PAGO, no de factura. Acá no hay ningún importe escrito: son fórmulas sobre Compras y sobre Cheques Emitidos, así que se corrige allá y cambia solo.'])
  push([])

  // ── POSICIÓN (hero) — LA PANTALLA ABRE CON LA POSICIÓN, IGUAL QUE IMPUESTOS ──────────────────────
  //
  // Menos es más: antes de las siete tablas, un resumen vertical contesta de un vistazo lo único que
  // importa al abrir —cuánto se debe, cuánto ya venció, cuánto no cae en ninguna semana, y cuánto
  // facturó AFIP que Compras todavía no tiene—. Cada número es una fórmula viva sobre Compras o un
  // rango con nombre de ARCA: ni uno pegado, y el que quiera el detalle lo tiene en las tablas de
  // abajo. Es el layout que el dueño aprobó para Impuestos: resumen vertical arriba, detalle debajo.
  // LA DEUDA ES NETA DE PAGOS PARCIALES: Total menos Monto Pagado. `neta(condiciones)` devuelve la
  // fórmula SUMIFS(Total;cond) − SUMIFS(Monto Pagado;cond) para cualquier juego de condiciones. Es lo
  // que el dueño marcó: un pago parcial baja el saldo, así que sumar el Total entero lo sobreestima.
  const condComercial = `${COL_ESTADO};"${ESTADO_DEUDA}";${COL_COMERCIAL};1`
  // El otro estado de Compras que corresponde a esta pestaña: "Proyectado" = compras pactadas que
  // todavía no son deuda firme. Sólo las COMERCIALES entran acá; el estado Proyectado también carga
  // $137,9M de proyecciones NO comerciales (ARCA/nómina/plan financiero, con fecha en la columna de
  // rubro) que viven fuera de Proveedores. Por eso se filtra por COL_COMERCIAL=1, igual que la deuda.
  const condProyectado = `${COL_ESTADO};"${ESTADO_PROYECTADO}";${COL_COMERCIAL};1`
  // Total − (T + positivos de U + positivos de W). El filtro ">0" excluye los saldos negativos/entre
  // paréntesis de U/W, que son "lo que falta", no pagos (regla confirmada por el dueño el 27/07).
  const neta = (conds) => `SUMIFS(${COL_TOTAL};${conds})-SUMIFS(${COL_PAGADO};${conds})-SUMIFS(${COL_PARCIAL1};${conds};${COL_PARCIAL1};">0")-SUMIFS(${COL_PARCIAL2};${conds};${COL_PARCIAL2};">0")`
  // EL SELLO ES VIVO, NO UN TEXTO CONGELADO: los importes de esta pestaña son fórmulas sobre Compras,
  // así que la posición está "en vivo al" día en que se abre. El listado de facturas de abajo se
  // reconstruye cuando corre el agente, y el aviso "⚠ Faltan N facturas" (más abajo) cubre ese desfase.
  const bPos = push(['="POSICIÓN DE PROVEEDORES · importes en vivo al "&TEXT(TODAY();"dd/mm/yyyy")&" · en pesos"'])
  const pos0 = filas.length + 1
  // Esta pestaña es SÓLO proveedores comerciales. La deuda con ARCA, impuestos y nómina NO va acá —
  // vive en "Impuestos y Financieros" (regla 9, no duplicar). Por eso el hero abre con la deuda
  // comercial como titular y no con un "total con terceros" que mezcle las dos cosas.
  // DESGLOSE POR TIPO DE PAGO (27/07, regla confirmada por el dueño). El titular sigue siendo el total,
  // pero abajo se parte en: directa (efectivo/transferencia sin pagar — la única que todavía se le paga
  // al proveedor) + comprometido vía cheque + vía tarjeta. Cheque y tarjeta ya no son deuda del
  // proveedor: el instrumento las cuenta en Cheques Emitidos / Tarjeta / CAJA. Sin este desglose, una
  // factura pagada con cheque figura como "proveedor con deuda a quien ya pagaste".
  const condDirecta = `${condComercial};${COL_TIPOPAGO};"<>Cheque";${COL_TIPOPAGO};"<>Tarjeta Crédito"`
  const condCheque = `${condComercial};${COL_TIPOPAGO};"Cheque"`
  const condTarjeta = `${condComercial};${COL_TIPOPAGO};"Tarjeta Crédito"`
  const posTotal = push(['DEUDA CON PROVEEDORES COMERCIALES', `=${neta(condComercial)}`, 'El total. Abajo, cuánto es deuda directa y cuánto ya tiene instrumento asignado (cheque/tarjeta), que se paga por esa vía, no al proveedor. La deuda con ARCA/impuestos/nómina vive en Impuestos y Financieros.'])
  push(['  · directa — efectivo/transferencia sin pagar', `=${neta(condDirecta)}`, 'Lo único que todavía se le paga DIRECTO al proveedor. Es la deuda real de esta pestaña.'])
  push(['  · comprometido vía cheque', `=${neta(condCheque)}`, '⚠ Factura con cheque asignado: al proveedor ya le diste el cheque. Registrar ese cheque en Cheques Emitidos cierra el circuito (la caja baja por ahí).'])
  push(['  · comprometido vía tarjeta', `=${neta(condTarjeta)}`, '⚠ Factura cargada a la tarjeta. Debería estar en Tarjeta de Credito.'])
  push([])
  // Estado "Proyectado" de Compras, sólo comerciales: pactado pero todavía no es deuda firme, así que
  // va aparte del titular para no inflar la deuda. Las proyecciones no comerciales ($137,9M) no entran.
  const posProy = push(['Compras comerciales proyectadas', `=${neta(condProyectado)}`, `=COUNTIFS(${condProyectado};${COL_TOTAL};"<>")&" compras estado ""Proyectado"" — pactadas, aún no deuda firme. Excluye proyecciones de ARCA/nómina/financieras."`])
  push([])
  const posPlazo = push(['Plazo de pago promedio', `=IFERROR(SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))/SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0));"")`, 'días entre factura y pago — casi no se usa el crédito del proveedor, que es gratis'])
  const posFaltan = push(['Facturado por AFIP que Compras no tiene', `=${N_ARCA.faltanMonto}`, `=${N_ARCA.faltanN}&" comprobantes con CAE que ninguna otra pestaña ve"`])
  const pos1 = filas.length
  push([])

  // ── 1 · LA DEUDA, DOCUMENTO POR DOCUMENTO, ORDENADA POR FECHA DE PAGO ───────────────────────────────────────────────────────
  //
  // ═══ SE REHIZO ENTERO (21/07) — TENÍA UN BUG QUE MOSTRABA FILAS EQUIVOCADAS ═══
  //
  // El dueño: "esta pestaña ha quedado con mal formato, además quiero que se respete algún orden,
  // fecha de pago, monto de deuda... este no es formato clase mundial". Yendo a ordenarla apareció
  // algo peor que el formato: la misma pestaña mostraba TRES totales de deuda distintos
  // ($8.963.047 en el bloque 1, $34.292.994 acá, $16.447.674 en el control).
  //
  // LA CAUSA. El script leía Compras, FILTRABA las filas sin importe y recién después calculaba el
  // número de fila con el índice del array:
  //     compras.filter(...).map((f, i) => ({ fila: i + 4 }))
  // Cada fila descartada corría todo el índice hacia arriba, así que las referencias apuntaban a
  // filas que no eran. Por eso figuraba como deuda la fila 355 (Gerson Castro, $4.000.000) que en
  // Compras dice "Pagado". Es exactamente el mismo error que ya había documentado en
  // cheques-cobertura-sheet.mjs —"filtrar antes de saber la fila corre todas las marcas hacia
  // arriba"— y lo volví a cometer en otro archivo. La lección estaba escrita y no alcanzó.
  //
  // LA SOLUCIÓN NO ES ARREGLAR EL ÍNDICE, es sacarle al bloque la posibilidad de tener el bug: una
  // lista de referencias a filas fijas es frágil por naturaleza (además, si alguien INSERTA una fila
  // en Compras, todas se corren en silencio). Ahora es UNA SOLA FÓRMULA VIVA —QUERY— que se
  // reconstruye sola en cada recálculo del Sheet, no cada 2 horas cuando corre el agente.
  //
  // Y ORDENADA POR FECHA DE PAGO, que es lo que se pidió: la pregunta de este bloque es "¿qué pago
  // primero?", y para contestarla el orden por fecha es la respuesta, no un detalle estético.
  //
  // POR QUÉ QUERY Y NO SORT(FILTER(...)): SORT necesita las columnas juntas y armarlas pide un
  // literal de array, que NO es portable al separador es-AR ({"a"\"b"} vs {"a";"b"}) — ya rompió
  // una vez en esta misma pestaña. El texto del QUERY va entre comillas y el localizador de
  // fórmulas respeta los literales, así que sus comas llegan intactas.
  const b1 = push(['1 · QUÉ SE DEBE Y CUÁNDO'])
  push(['Dos tablas VIVAS: no hay una sola fila escrita acá. Cada bloque es una fórmula sobre Compras, así que un proveedor nuevo aparece solo, el pagado se va solo, y ninguna de las dos cosas espera a que corra un agente. Pendiente se decide por el ESTADO de Compras, nunca por la fecha. Tus comentarios van en la LIBRETA del final: desde ahí vuelven solos al proveedor que nombran, aunque la lista se reordene.'])
  push([])
  // Las columnas de Compras, todas ABIERTAS y ubicadas por encabezado. `rangosCompras` corta la corrida
  // si alguna llegara acotada a una fila final: un rango con techo se fosiliza y deja de ver lo nuevo.
  const RC = rangosCompras({
    prov: COL_PROV, estado: COL_ESTADO, comercial: COL_COMERCIAL, total: COL_TOTAL,
    pagado: COL_PAGADO, parcial1: COL_PARCIAL1, parcial2: COL_PARCIAL2, fecha: COL_FECHA,
    comprobante: COL_COMPROBANTE, obra: COL_OBRA, tipoPago: COL_TIPOPAGO, categoria: COL_CATEGORIA,
  })
  // Las notas que hoy están ancladas a cada proveedor en la pestaña. Se leen ACÁ, antes de rehacer el
  // bloque, y viajan a la libreta: el rediseño borra las filas donde viven, así que si no se migran se
  // pierden. `verificarMigracionNotas` (en main) corta la corrida si alguna no llegó.
  const L = layoutDeuda(deudaCols)
  const NOTAS = notasAncladas(deudaPrevio || [], L)
  // LA LIBRETA SE SIEMBRA CON LA GRAFÍA DE COMPRAS, no con la clave normalizada. `notasAncladas`
  // indexa en minúsculas (para poder emparejar), pero escribir "hormiserv" en la pestaña es escribir
  // un nombre que el dueño no usa. VLOOKUP en Sheets es insensible a mayúsculas, así que emparejaría
  // igual — pero la libreta la lee una persona, y un nombre en minúscula se lee como un error.
  const canonDeuda = new Map(deudaAgrupada.map((gp) => [String(gp.nombre).trim().toLowerCase(), gp.nombre]))
  const notasPorProveedor = new Map(
    [...NOTAS.porProveedor.entries()].map(([k, m]) => [canonDeuda.get(k) ?? k, [...m.values()].map(String).join(' · ')]),
  )
  // La libreta decide sola si se siembra (está vacía: hay que migrar lo que el bloque viejo va a borrar)
  // o si no se toca ni una celda (ya tiene contenido del dueño). Ver `filasLibreta`.
  const libreta = filasLibreta(notasPorProveedor, libretaPrevia)
  // EL ANCHO QUE SE LIMPIA es el que el bloque viejo REALMENTE ocupaba, no el de los rótulos: el dueño
  // escribía hasta la Q y lo que el generador no marca con VACIO la fusión lo deja clavado en su fila
  // física (incidente del 30/07). Con la lista viva reordenándose sola, un residuo así le pone a un
  // proveedor los números de otro. Cada fila del bloque nace VACIO de punta a punta.
  const ANCHO = Math.max(anchoBloque(L.cols, deudaPrevio), COLS_FACTURA.length)
  /** Una fila del bloque: el ancla en su columna y el resto VACIO (mío y va vacío → la fusión lo borra). */
  const filaBloque = (celdas = []) => {
    const f = Array.from({ length: ANCHO }, () => VACIO)
    celdas.forEach((v, i) => { f[i] = v })
    return f
  }
  /** Reserva el derrame: el ancla y sus filas de abajo, todas limpias para que la tabla pueda caer. */
  const reservar = (formula, reserva) => {
    const ancla = push(filaBloque([formula]))
    for (let i = 1; i < reserva; i++) push(filaBloque())
    return { ancla, fin: filas.length }
  }

  // ── 1A · LA DEUDA POR PROVEEDOR ─────────────────────────────────────────────────────────────────
  // Era la fila-cabecera de cada grupo del +/-, materializada por el JS. Ahora es UNA fórmula: la lista
  // sale de UNIQUE(FILTER(...)) sobre Compras y se ordena por saldo. Al desaparecer las filas físicas
  // desaparece también el +/- (no se puede agrupar lo que todavía no existe) — se cambió colapsar por
  // estar vivo, que es lo que se pidió.
  const cabDeudaProv = push(filaBloque(COLS_PROVEEDOR))
  const resProv = reservaPara(deudaAgrupada.length)
  const provSpill = reservar(formulaPorProveedor({ rangos: RC, libreta: N_PROV.libreta, reserva: resProv }), resProv)
  // EL CONTROL QUE PUEDE FALLAR, en lugar del aviso que describía el defecto ("⚠ Faltan N facturas…
  // aparecen cuando corre el agente"). La columna 4 del bloque es el saldo: su suma tiene que dar el
  // mismo peso que el titular. Si el derrame se truncó contra la reserva, o si el criterio dejó de
  // coincidir con el del hero, este renglón lo dice con el número exacto.
  const ctrlProv = push(filaBloque([formulaControl({
    rangos: RC,
    rangoSaldo: `$${letra(3)}$${provSpill.ancla}:$${letra(3)}$${provSpill.fin}`,
    que: 'el detalle por proveedor',
  })]))
  push([])

  // ── 1B · FACTURA POR FACTURA, ORDENADA POR FECHA DE PAGO ────────────────────────────────────────
  // Eran filas con la fila de Compras cableada (`Compras!$X$671`): insertar una fila allá corría todas
  // las referencias en silencio. Ahora las siete columnas se filtran y se ordenan JUNTAS, en una sola
  // operación, sobre rangos abiertos.
  const cabDeudaFac = push(filaBloque(COLS_FACTURA))
  const nPendientes = deudaAgrupada.reduce((n, gp) => n + gp.filas.length, 0)
  const resFac = reservaPara(nPendientes, { minimo: 30 })
  const facSpill = reservar(formulaPorFactura({ rangos: RC, reserva: resFac }), resFac)
  const ctrlFac = push(filaBloque([formulaControl({
    rangos: RC,
    rangoSaldo: `$${letra(3)}$${facSpill.ancla}:$${letra(3)}$${facSpill.fin}`,
    que: 'el detalle factura por factura',
  })]))
  push([])

  // ── 2 · CUENTA CORRIENTE POR PROVEEDOR — EL PERFIL, NO LA DEUDA ──────────────────────────────────
  // La DEUDA de cada proveedor está ARRIBA (bloque 1, agrupada con el +/-). Acá va sólo el PERFIL: con
  // quién se gasta, cuánto, si AFIP tiene más facturado de lo cargado, y con qué plazo paga. Se sacaron
  // las diez columnas de deuda que repetían el bloque de arriba (regla 9) y hacían de esto una pared de
  // dieciséis columnas ilegible. Menos es más: siete columnas, cada una con un trabajo.
  const b2 = push(['2 · CUENTA CORRIENTE POR PROVEEDOR'])
  push(['Con quién se gasta y con qué plazo. El plazo —días entre factura y pago— es el dato clave: pagar a 0 días empuja al descubierto al 62,78% anual cuando el crédito del proveedor es gratis. La deuda de cada uno está arriba, agrupada. Sólo comerciales.'])
  const cabProv = push(['Proveedor', 'CUIT', 'Comprobantes', `Comprado ${AÑO}`, 'Plazo promedio', 'Qué se le compra'])
  const p0 = filas.length + 1
  for (const p of proveedores) {
    const f = filas.length + 1
    push([
      p.nombre,
      p.cuit ? formatearCuit(p.cuit) : '',
      // Cuántos comprobantes (facturas) emitió el proveedor en el año — el dueño lo pidió de vuelta.
      `=COUNTIF(${COL_PROV};$A${f})`,
      `=SUMIF(${COL_PROV};$A${f};${COL_TOTAL})`,
      // EL PLAZO REAL: días entre la fecha de factura y la fecha en que salió la plata, por SUMPRODUCT.
      `=IFERROR(SUMPRODUCT((${COL_PROV}=$A${f})*ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0)))/SUMPRODUCT((${COL_PROV}=$A${f})*ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA}));"")`,
      p.familia,
    ])
  }
  const p1 = filas.length
  const fSub = push([`Subtotal de estos ${proveedores.length}`, '', `=SUM($C${p0}:$C${p1})`, `=SUM($D${p0}:$D${p1})`, '', ''])
  push([`Resto de proveedores comerciales (${resto.cantidad})`, '', '', `=$D$TOTPROV-$D${fSub}`, '', 'ninguno llega al 1% del total'])
  const fTotProv = push(['TOTAL PROVEEDORES COMERCIALES', '',
    `=COUNTIFS(${COL_ESTADO};"<>";${COL_COMERCIAL};1)`,
    RUBROS_COMERCIALES.map((r) => `SUMIF(${COL_RUBRO};"${r}";${COL_TOTAL})`).join('+').replace(/^/, '='),
    '', ''])
  push([])

  // ── 5 · LAS NOTAS DE CRÉDITO ────────────────────────────────────────────────────────────────
  // La pregunta que el libro de IVA NO contesta: una nota de crédito puede ser una DEVOLUCIÓN (el
  // costo de la obra baja de verdad) o una REFACTURACIÓN (el costo sigue, sólo cambió de número y
  // de mes). Las dos son "tipo 3". Ver lib/notas-credito.mjs.
  const b5 = push([`5 · NOTAS DE CRÉDITO`])
  push(['Una nota de crédito puede significar dos cosas opuestas y el libro de IVA las escribe igual. Si el proveedor volvió a facturar, el costo SIGUE existiendo: sólo cambió de número y muchas veces de mes. Darlo por ahorrado es el error caro. Cada nota se cruza contra las facturas del mismo CUIT: la que anula tiene que dar el MISMO importe al peso, la que la reemplaza da parecido.'])
  const cabNC = push(['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', 'Qué es', 'Anula la factura', 'La reemplaza', '', ''])
  const nc0 = filas.length + 1
  // El IMPORTE sale del libro por CUIT + número; lo que el OS aporta es la CLASIFICACIÓN (devolución
  // o refacturación), que no está en ningún libro y es criterio, no dato.
  for (const n of notasCredito) {
    const f = filas.length + 1
    push([n.proveedor, n.comprobante, n.fecha, arcaPorComprobante(`"${n.cuit ?? ''}"`, `$B${f}`, '-1'), n.que, n.anula, n.reemplaza, '', ''])
  }
  const nc1 = filas.length
  push(estructural(['TOTAL ACREDITADO', '', '', `=SUM($D${nc0}:$D${nc1})`, '', '', '', '', '']))
  push([])
  let cabAnu = 0, anu0 = 0, anu1 = 0
  if (anuladasCargadas.length) {
    push([`⚠ COMPRAS TIENE CARGADA LA FACTURA ANULADA — ${anuladasCargadas.length} caso(s)`])
    push(['El importe cierra, así que ningún control lo ve. Pero el comprobante que está cargado fue ANULADO por una nota de crédito y reemplazado por otro: el número no existe más para AFIP y el costo quedó imputado al mes viejo. Hay que corregir el N° de comprobante y la fecha en Compras.'])
    cabAnu = push(['Proveedor', 'Cargada en Compras', 'Fecha cargada', 'Importe', 'Corresponde', 'Fecha correcta', '', '', ''])
    anu0 = filas.length + 1
    for (const m of anuladasCargadas) {
      const f = filas.length + 1
      push([m.proveedor, m.cargada, m.fechaCargada, arcaPorComprobante(`"${m.cuit ?? ''}"`, `$B${f}`, '1'), m.corresponde, m.fechaCorrecta, '', '', ''])
    }
    anu1 = filas.length
    push([])
  }

  // ── 6 · LO QUE AFIP TIENE Y COMPRAS NO ──────────────────────────────────────────────────────────────
  const b6 = push([`6 · FACTURADO A LA EMPRESA QUE NO ESTÁ EN COMPRAS — ${faltanEnCompras.length} comprobantes`])
  push([`Sale del libro de IVA COMPRAS de ARCA, que el OS ya replica. Se cruza contra Compras por N° de comprobante y, cuando ese número no está cargado, por proveedor + importe. Lo que queda acá está facturado a la empresa con CAE y no lo ve ninguna otra pestaña: no es un error de fórmula, es carga que falta.`])
  const cabAfip = push(['Proveedor según AFIP', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '', '', '', ''])
  const afip0 = filas.length + 1
  for (const r of faltanEnCompras) {
    const f = filas.length + 1
    push([r.nombre, r.cuit ? formatearCuit(r.cuit) : '', r.comprobante, r.fecha,
      r.cuit ? arcaPorComprobante(`$B${f}`, `$C${f}`, '1') : r.importe, '', '', '', ''])
  }
  const afip1 = filas.length
  push(estructural(['TOTAL SIN CARGAR', '', '', '', `=SUM($E${afip0}:$E${afip1})`, '', '', '', '']))
  push([])

  // ── 7 · CONTROL Y AUDITORÍA DE CARGA ────────────────────────────────────────────────────────────
  const b7 = push(['7 · CONTROL Y AUDITORÍA DE CARGA'])
  const ctrl = filas.length + 1
  push([`${RUBROS_CON_FAMILIA[0]} (rubro de Compras)`, `=SUMIF(${COL_RUBRO};"${RUBROS_CON_FAMILIA[0]}";${COL_TOTAL})`, 'Es la misma línea del Cash Flow Mensual.'])
  push([`${RUBROS_CON_FAMILIA[1]} (rubro de Compras)`, `=SUMIF(${COL_RUBRO};"${RUBROS_CON_FAMILIA[1]}";${COL_TOTAL})`, ''])
  push(['⇒ Diferencia contra el total de materiales (tiene que ser $0)', `=$B${ctrl}+$B${ctrl + 1}-${letra(13)}$TOTFAM`, 'Distinto de cero = hay materiales que ninguna familia está mirando.'])
  // ESTE CONTROL ESTABA MAL Y VALE DEJARLO ESCRITO: la primera versión era =X-Y-(X-Y), que da cero
  // SIEMPRE, mire lo que mire. Un control que no puede fallar no controla nada — es peor que no
  // tenerlo, porque da tranquilidad gratis.
  // La deuda con ARCA/impuestos/nómina NO se controla acá: es de la pestaña Impuestos y Financieros
  // (regla 9). Esta pestaña sólo mira proveedores comerciales.
  push(['Sin describir — plata que no se sabe en qué se gastó', `=SUMIF(${COL_FAMILIA};"${SIN_FAMILIA}";${COL_TOTAL})`, 'Filas que dicen "materiales varios", "???" o están vacías. No se les inventa familia: hay que describirlas en Compras.'])
  const fCuenta1 = push(['Sin describir — cuántas facturas son', `=COUNTIF(${COL_FAMILIA};"${SIN_FAMILIA}")`, ''])
  const fCompFecha = push(['⚠ N° de comprobante que Sheets guardó como FECHA',
    '=SUMPRODUCT((Compras!$E$4:$E<>"")*ISNUMBER(Compras!$H$4:$H))',
    '⚠ Se escribió "5-4163" y Sheets lo leyó como mayo de 4163: la celda guarda 826666. Se ve bien por el formato, pero el número dejó de ser un texto y ya no cruza contra Cheques Emitidos ni contra ARCA. Se arregla en Compras poniendo un apóstrofo delante.'])
  const fCuenta2 = push(['Facturas de proveedor sin N° de comprobante — cuántas son', `=SUMPRODUCT((${COL_PROV}<>"")*(Compras!$H$4:$H="")*(${COL_TOTAL}<>0))`,
    '⚠ Sin número no se puede ligar un pago a su factura, ni hoy ni nunca. Es lo que hace que 40 de los 89 cheques no se puedan imputar.'])
  push(['Facturas de proveedor sin N° de comprobante — cuánta plata', `=SUMPRODUCT((${COL_PROV}<>"")*(Compras!$H$4:$H="")*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))`, ''])
  push(['Deuda sin fecha de pago', `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")-SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_FECHA};">0")`,
    '⚠ Esta plata no aparece en ninguna semana ni mes del cash flow: sin fecha, el cuadro no la puede ubicar.'])
  push([])
  // ── LAS COLUMNAS DE PAGO SE CONTRADICEN ENTRE SÍ ────────────────────────────────────────────────
  // El auditor marcaba 10 columnas de Compras "cargadas y no leídas". Fui a ver si el OS debía
  // empezar a leerlas: NO. Ver lib/consistencia-compras.mjs — 128 filas dicen "Pagado" con el monto
  // pagado vacío. Leer una columna a medio llenar es peor que no leerla; lo que corresponde es
  // mostrar la contradicción para que se resuelva en el origen.
  push(['⚠ Filas que dicen "Pagado" pero no dicen cuánto se pagó',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)>0)*(NOT(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)))`,
    '⚠ Cantidad de filas. La columna "Monto Pagado" está a medio llenar: el cash flow usa el TOTAL (columna O) justamente por eso. Si esta columna se completara, el cuadro podría pasar a lo efectivamente pagado.'])
  push(['  · cuánta plata representan',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(NOT(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))`,
    'Es lo que desaparecería del cuadro si el OS leyera "Monto Pagado" con la carga como está hoy.'])
  push(['⚠ Marcadas "Pagado" con un monto pagado MENOR al total',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>1))`,
    '⚠ Cantidad de filas. Acá el dato NO falta: contradice al estado. O quedó un saldo sin pagar, o el estado está mal.'])
  push(['  · el saldo que esas filas dicen que falta pagar',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>1)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)))`,
    'Si es deuda, no está en la cuenta corriente de arriba: la fila dice "Pagado".'])
  push(['⚠ Segunda cuota de un pago parcial que cae en otro mes',
    `=SUMPRODUCT((Compras!$S$4:$S="Parcial")*(IF(ISNUMBER(Compras!$W$4:$W);Compras!$W$4:$W;0)>0)*ISNUMBER(Compras!$V$4:$V)*(TEXT(IF(ISNUMBER(Compras!$V$4:$V);Compras!$V$4:$V;0);"yyyy-mm")<>TEXT(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0);"yyyy-mm"))*IF(ISNUMBER(Compras!$W$4:$W);Compras!$W$4:$W;0))`,
    '⚠ El cuadro suma el total en UNA fecha de caja, así que esta plata queda en el mes equivocado. Es error de criterio, no de carga: el cash flow es de caja y la segunda cuota sale otro mes.'])
  push([])
  push(['Plazo promedio ponderado de toda la compra comercial',
    `=IFERROR(SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))/SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0));"")`,
    'Días. Cada día que se estira este número es un día menos de descubierto al 62,78% anual.'])

  // ── 8 · LOS NÚMEROS DE ARCA, EN UN SOLO LUGAR ───────────────────────────────────────────────
  // Estos son los únicos números del archivo que NO salen del Sheet: salen del libro de IVA que el
  // OS replica desde ARCA. Viven acá —una pestaña réplica, con origen declarado— y el Cash Flow
  // Mensual los mira por RANGO CON NOMBRE en vez de tenerlos pegados. Ver lib/rangos-nombrados.mjs.
  const b8 = push(['8 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer'])
  push(['Cualquier pestaña que necesite estas cifras las referencia por nombre (ARCA_COMPRAS_TOTAL, ARCA_FALTAN_MONTO…). Si se copiaran, el día que ARCA traiga un comprobante nuevo habría dos verdades en el archivo y nadie sabría cuál mirar.'])
  const cabArca = push(estructural(['Concepto', 'Cantidad', 'Monto', '', '', '', '', '', '']))
  // LOS QUE SALEN DEL LIBRO VAN COMO FÓRMULA sobre _ARCA_RAW: se carga un comprobante en ARCA, el
  // agente refresca la réplica y estos números se mueven solos.
  const cuentaArca = (libro, signo) => `=SUMPRODUCT((${R}!$B$4:$B="${libro}")*(${R}!$F$4:$F=${signo}))`
  const fArcaN = push(estructural(['Comprobantes de compra (neto de notas de crédito)',
    cuentaArca('Compras', 1), totalLibro('Compras'), '', '', '', '', '', '']))
  const fArcaNotas = push(estructural(['  · notas de crédito (restan)',
    cuentaArca('Compras', -1), `=SUMPRODUCT((${R}!$B$4:$B="Compras")*(${R}!$F$4:$F=-1)*${IMPORTE})`, '', '', '', '', '', '']))
  // ═══ ESTOS DOS NO PUEDEN SER UNA FÓRMULA, Y ES IMPORTANTE DECIRLO ═══
  //
  // Salen del algoritmo de conciliación del OS (lib/cobertura-arca.mjs): cruza cada comprobante de
  // ARCA contra Compras por número normalizado y, cuando el número no está cargado, por proveedor +
  // importe. Esa normalización —quitar ceros, guiones y espacios de formatos que se escribieron de
  // seis maneras distintas— no se puede escribir en una fórmula de Sheets sin que dé un número
  // DISTINTO al real, y un número parecido pero equivocado es peor que uno declarado.
  //
  // Así que se pegan, y se declaran: son un resultado de conciliación, con su fecha de corte, igual
  // que el dato de origen de una réplica. Lo que NO se hace es disfrazarlos de fórmula.
  // La col I lleva una NOTA de conciliación LEGÍTIMA (no una fórmula, no basura): estructural() sólo
  // convierte los '' en VACIO, así que esa nota —al ser no-vacía— se conserva y sólo se limpian D–H.
  const fArcaEn = push(estructural(['  · cargados en Compras, por N° de comprobante', cruce.porNumero.length, cruce.totales.porNumero, '', '', '', '', '',
    `Conciliación del OS al ${new Date().toISOString().slice(0, 10)} — no es una fórmula: el cruce normaliza números escritos de seis formas distintas.`]))
  const fArcaSinNum = push(estructural(['  · cargados SIN su N° de comprobante', cruce.porImporte.length, cruce.totales.porImporte, '', '', '', '', '',
    'Conciliación del OS: se encontraron por proveedor + importe porque el N° de comprobante no está cargado en Compras.']))
  // Los que faltan sí tienen fórmula: son exactamente las filas de la tabla de arriba.
  const fArcaFaltan = push(estructural(['  · ⚠ sin cargar en Compras',
    `=COUNTIF($A$${afip0}:$A$${afip1};"<>")`, `=SUM($E$${afip0}:$E$${afip1})`, '', '', '', '', '', '']))
  const fArcaVentas = push(estructural(['Comprobantes emitidos (ventas)',
    cuentaArca('Ventas', 1), totalLibro('Ventas'), '', '', '', '', '', '']))
  push([])

  // ── 9 · LO QUE LA EMPRESA FACTURÓ ───────────────────────────────────────────────────────────────
  push([`9 · FACTURAS EMITIDAS — control cruzado contra Cobranzas (esto es VENTAS, no proveedores)`])
  push(['Las facturas que emitió la empresa según AFIP, con su cliente y su CAE. El cruce contra Cobranzas es por N° de comprobante NORMALIZADO (0001-00000203 = 01-0000203): una emitida que Cobranzas no tiene es plata facturada que nadie sigue.'])
  const cabEmi = push(['Cliente', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '¿Está en Cobranzas?', '', '', ''])
  const emi0 = filas.length + 1
  for (const r of emitidas) {
    push([r.nombre, r.cuit ? formatearCuit(r.cuit) : '', r.comprobante, r.fecha,
      // Igual que las compras: el importe sale del libro, no de un número calculado afuera. El
      // signo va en la fórmula porque una nota de crédito emitida también resta.
      arcaPorComprobanteVentas(`$C${filas.length + 1}`),
      // El estado es una CONCILIACIÓN del OS (comprobante normalizado), no un LIKE literal que fallaba
      // en las 16. Es texto, no un número pegado: dice si esa factura ya está en el ledger de cobros.
      r.enCobranzas ? '✓ está en Cobranzas' : '⚠ NO está en Cobranzas', '', '', ''])
  }
  const emi1 = filas.length
  push(estructural(['TOTAL FACTURADO', '', '', '', `=SUM($E${emi0}:$E${emi1})`, '', '', '', '']))
  push([])

  // ── 10 · LA LIBRETA — EL ÚNICO BLOQUE QUE ES DEL DUEÑO ──────────────────────────────────────────
  //
  // POR QUÉ EXISTE, Y POR QUÉ VA AL FINAL. Con la sección 1 viva, las filas de la deuda se reordenan
  // solas en cada recálculo. Un comentario escrito a mano AL LADO de una de esas filas no las sigue: se
  // queda clavado en su renglón y termina describiendo al proveedor equivocado —es el incidente del
  // 30/07, que antes se compensaba re-anclando las notas en cada corrida del generador—. Reconstruir el
  // anclaje una vez cada dos horas dejó de alcanzar el día que el cuadro pasó a moverse solo.
  //
  // Acá la nota se ancla POR CONSTRUCCIÓN: vive en una fila con el nombre del proveedor, y la tabla viva
  // la trae con un VLOOKUP contra el rango con nombre PROV_LIBRETA. Se puede escribir, borrar y
  // reordenar sin que ningún generador la toque: si la libreta tiene contenido, el OS no escribe ni una
  // celda de datos (ver `filasLibreta`). Va al FINAL de la pestaña porque su rango es ABIERTO hacia
  // abajo — así se pueden agregar proveedores sin que nadie republique nada.
  const b10 = push(['10 · LIBRETA DE PROVEEDORES — tus notas'])
  push(['Escribí acá: una fila por proveedor, el nombre igual que en Compras. La nota aparece sola en la tabla de deuda de arriba, al lado de SU proveedor, ordene como ordene. Ningún agente reescribe este bloque.'])
  const cabLibreta = push([...COLS_LIBRETA])
  const lib0 = filas.length + 1
  for (const f of libreta.filas) push([...f])
  const lib1 = filas.length
  push([])

  // ── 3 · FAMILIA × MES ───────────────────────────────────────────────────────────────────────────
  const b3 = push(['3 · POR FAMILIA Y POR MES'])
  const cabFam = push(['Familia', ...meses, `Total ${AÑO}`, '% del total', 'Civil', 'Mantenimiento'])
  const fam0 = filas.length + 1
  for (const n of [...nombres, SIN_FAMILIA]) {
    const f = filas.length + 1
    const clave = n === SIN_FAMILIA ? `"${SIN_FAMILIA}"` : `$A${f}`
    push([
      n === SIN_FAMILIA ? `${SIN_FAMILIA} — falta describir qué se compró` : n,
      ...meses.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};${clave};${COL_FECHA};">="&${letra(i + 1)}$${cabFam};${COL_FECHA};"<"&EOMONTH(${letra(i + 1)}$${cabFam};0)+1)`),
      `=SUMIF(${COL_FAMILIA};${clave};${COL_TOTAL})`,
      `=IFERROR(${letra(13)}${f}/${letra(13)}$TOTFAM;0)`,
      `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};${clave};${COL_RUBRO};"${RUBROS_CON_FAMILIA[0]}")`,
      `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};${clave};${COL_RUBRO};"${RUBROS_CON_FAMILIA[1]}")`,
    ])
  }
  const fam1 = filas.length
  const totFam = push(['TOTAL MATERIALES',
    ...meses.map((_, i) => `=SUM(${letra(i + 1)}${fam0}:${letra(i + 1)}${fam1})`),
    `=SUM(${letra(13)}${fam0}:${letra(13)}${fam1})`, '',
    `=SUM(${letra(15)}${fam0}:${letra(15)}${fam1})`,
    `=SUM(${letra(16)}${fam0}:${letra(16)}${fam1})`,
  ])
  push([])

  // ── 4 · FAMILIA × OBRA ──────────────────────────────────────────────────────────────────────────
  const b4 = push(['4 · POR OBRA'])
  const cabObra = push(['Familia', ...obras, 'Total', 'Control (tiene que dar $0)'])
  const obra0 = filas.length + 1
  for (const n of [...nombres, SIN_FAMILIA]) {
    const f = filas.length + 1
    push([
      n === SIN_FAMILIA ? `${SIN_FAMILIA} — falta describir qué se compró` : n,
      ...obras.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};LEFT($A${f};${n.length});${COL_OBRA};${letra(i + 1)}$${cabObra})`),
      `=SUM(${letra(1)}${f}:${letra(obras.length)}${f})`,
      `=SUMIF(${COL_FAMILIA};LEFT($A${f};${n.length});${COL_TOTAL})-${letra(obras.length + 1)}${f}`,
    ])
  }
  const obra1 = filas.length
  push(['TOTAL POR OBRA',
    ...obras.map((_, i) => `=SUM(${letra(i + 1)}${obra0}:${letra(i + 1)}${obra1})`),
    `=SUM(${letra(obras.length + 1)}${obra0}:${letra(obras.length + 1)}${obra1})`,
    `=SUM(${letra(obras.length + 2)}${obra0}:${letra(obras.length + 2)}${obra1})`,
  ])
  push([])

  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string'
    ? c.replaceAll('$TOTFAM', String(totFam)).replaceAll('$TOTPROV', String(fTotProv)).replaceAll('$TOTDEUDA', String(fTotProv))
    : c)))

  // ═══ EL GENERADOR ES DUEÑO DE SU GRILLA — CÓMO SE LIMPIA SU FOOTPRINT ═══
  // El vacío del generador se LIMPIA (VACIO), para que un valor de una corrida más ancha no sobreviva.
  // Se resuelve en TRES lugares, cada uno donde corresponde, sin barrer rangos a ciegas:
  //   1. BLOQUE DE DEUDA: cada fila arranca all-VACIO (celdas()); las columnas que el dueño agregó y
  //      el generador no llena (Comentarios) recuperan su contenido por notasAncladas.
  //   2. FILAS ESTRUCTURALES (totales + encabezado/conteos de ARCA): estructural() marca sus ''
  //      internos como VACIO en el punto de creación, conservando notas legítimas (col I de ARCA).
  //   3. MÁS ALLÁ DEL ANCHO DE CADA FILA (incluidas las separadoras push([])): el relleno con VACIO
  //      al partir la pestaña (cuadroP, más abajo en main) lo limpia. Antes rellenaba con '' y
  //      sobrevivía texto viejo —p. ej. el título de la sección 2 duplicado.
  // Un barrido global aquí borraría notas del dueño en las filas de detalle: por eso NO se hace.

  // LAS NOTAS POR COMPROBANTE NO TIENEN LIBRETA, Y SE DICE. La libreta se indexa por PROVEEDOR, que es
  // la entidad de la que hablan las notas del dueño hoy. Si alguna estaba pegada a una fila de detalle
  // (anclada al N° de comprobante), no hay dónde re-anclarla: se reporta para que él la reubique, no se
  // borra en silencio. Es información, no una falla del rediseño.
  const notasHuerfanas = [...NOTAS.porComprobante.entries()]
    .map(([k, m]) => ({ tipo: 'comprobante', clave: k, texto: [...m.values()].map(String).join(' · ') }))
  return {
    filas: resuelto, notasHuerfanas, anchoDeuda: ANCHO, cabArca,
    // Lo que main necesita para verificar la migración ANTES de escribir una sola celda.
    notasPorProveedor, libreta,
    marcas: { bPos, b1, b2, b3, b4, b5, b6, b7, b8, b10, fin: filas.length },
    bPos, pos0, pos1, posTotal, posProy, posPlazo, posFaltan, cuentas: [fCuenta1, fCuenta2], fCompFecha,
    afip0, afip1, emi0, emi1, nc0, nc1, cabNC, cabAnu, anu0, anu1,
    fArcaN, fArcaNotas, fArcaEn, fArcaSinNum, fArcaFaltan, fArcaVentas,
    // La sección viva: dos bloques, cada uno con su encabezado, su ancla, su reserva y su control.
    deudaL: L,
    cabDeudaProv, provAncla: provSpill.ancla, provFin: provSpill.fin, ctrlProv,
    cabDeudaFac, facAncla: facSpill.ancla, facFin: facSpill.fin, ctrlFac,
    cabLibreta, lib0, lib1,
    cabAfip, cabEmi, p0, p1, fSub, fTotProv, cabProv, fam0, fam1, totFam, obra0, obra1, cabFam, cabObra, ctrl,
    anchoObras: obras.length,
  }
}

/**
 * LA PREVISUALIZACIÓN DE LA SECCIÓN VIVA — para poder leerla antes de que toque el archivo real.
 *
 * Con la sección 1 hecha de fórmulas, todo el cuadro depende de CUATRO celdas. Un `--dry` que sólo
 * dijera "148 filas x 16 columnas" no sirve para revisar nada: lo que hay que poder mirar es qué
 * fórmula va en qué dirección, y qué filas quedan reservadas para el derrame.
 *
 * Las direcciones son las de la GRILLA (antes de partir la pestaña). `partir()` corre los bloques a su
 * pestaña y reubica las referencias; el desplazamiento se imprime para que la cuenta se pueda hacer.
 */
function previsualizarSeccionViva(g) {
  const dir = (fila, col = 0) => `${letra(col)}${fila}`
  const bloques = [
    ['1A · deuda POR PROVEEDOR', g.cabDeudaProv, g.provAncla, g.provFin, g.ctrlProv, COLS_PROVEEDOR],
    ['1B · FACTURA POR FACTURA', g.cabDeudaFac, g.facAncla, g.facFin, g.ctrlFac, COLS_FACTURA],
  ]
  console.log('\n══ SECCIÓN 1, CELDA POR CELDA (direcciones de la grilla, antes de partir la pestaña) ══')
  for (const [nombre, cab, ancla, fin, ctrl, cols] of bloques) {
    console.log(`\n── ${nombre}`)
    console.log(`   encabezados  ${dir(cab)}  ${cols.join(' | ')}`)
    console.log(`   ANCLA        ${dir(ancla)}  (derrama ${fin - ancla + 1} filas x ${cols.length} columnas hasta ${dir(fin, cols.length - 1)})`)
    console.log(`   ${g.filas[ancla - 1][0]}`)
    console.log(`   reserva      ${dir(ancla + 1)}:${dir(fin, g.anchoDeuda - 1)} — se escriben VACÍAS (la fusión las limpia) para que el derrame pueda caer`)
    console.log(`   CONTROL      ${dir(ctrl)}`)
    console.log(`   ${g.filas[ctrl - 1][0]}`)
  }
  console.log(`\n── LIBRETA (tus notas; el OS ${g.libreta.sembradas ? 'la SIEMBRA esta vez' : 'NO la toca'})`)
  console.log(`   encabezados  ${dir(g.cabLibreta)}  ${COLS_LIBRETA.join(' | ')}`)
  console.log(`   filas        ${g.lib1 >= g.lib0 ? `${dir(g.lib0)}:${dir(g.lib1, 1)}` : '(ninguna todavía)'} · rango con nombre ${N_PROV.libreta} desde ${dir(g.lib0)} y ABIERTO hacia abajo`)
  for (const f of g.libreta.filas.filter((x) => String(x?.[0] ?? '').trim())) console.log(`     ${f[0]} → ${f[1]}`)
  console.log('')
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // SIN FILTRAR: `comprasRaw` conserva el índice REAL de cada fila (i → fila i+4 de Compras). La
  // deuda referencia filas puntuales de Compras, así que necesita el número real; filtrar primero y
  // usar el índice del array filtrado apunta a la fila equivocada (bug ya documentado en el archivo).
  const comprasRaw = await google.readSheetValues(ID, 'Compras!A4:AK')
  const compras = comprasRaw.filter((f) => parseMonto(f?.[14]))

  // ═══ UBICAR LAS COLUMNAS DE COMPRAS POR SU ENCABEZADO ═══
  // El dueño edita Compras a mano; borró una columna y todo lo posterior se corrió una posición. Leer
  // por posición fija devolvía fechas donde iban rubros → deuda vacía. Se ubica cada columna que se
  // corrió (rubro, fecha de caja, familia) por su nombre en el encabezado (fila 3) y se corrigen tanto
  // la LETRA (para las fórmulas) como el ÍNDICE (para lo que lee el JS). Las columnas anteriores a la
  // borrada (proveedor, total, estado…) no se movieron, así que su posición histórica sigue firme.
  const cab = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const buscarCol = (nombre) => cab.findIndex((c) => String(c ?? '').trim().toLowerCase() === nombre.toLowerCase())
  const fijar = (clave, actual, nombre) => {
    const i = buscarCol(nombre)
    if (i < 0) { console.warn(`  ⚠ no encontré "${nombre}" en el encabezado de Compras; uso la posición histórica`); return actual }
    IDX[clave] = i
    return `Compras!$${letra(i)}$4:$${letra(i)}`
  }
  COL_RUBRO = fijar('rubro', COL_RUBRO, 'Rubro de caja')
  COL_FECHA = fijar('fechaCaja', COL_FECHA, 'Fecha de caja')
  COL_FAMILIA = fijar('familia', COL_FAMILIA, 'Familia de material')
  COL_COMERCIAL = fijar('comercial', COL_COMERCIAL, '¿Proveedor comercial? (OS)')
  COL_PAGADO = fijar('pagado', COL_PAGADO, 'Monto Pagado')
  COL_PARCIAL1 = fijar('parcial1', COL_PARCIAL1, 'Monto Parcial 1')
  COL_PARCIAL2 = fijar('parcial2', COL_PARCIAL2, 'Monto Parcial 2')
  COL_TIPOPAGO = fijar('tipoPago', COL_TIPOPAGO, 'Tipo pago')
  console.log(`  Compras por encabezado: Rubro=${letra(IDX.rubro)} · Fecha de caja=${letra(IDX.fechaCaja)} · Familia=${letra(IDX.familia)} · ¿Comercial?=${letra(IDX.comercial)} · Pagado=${letra(IDX.pagado)} · Parcial1=${letra(IDX.parcial1)} · Parcial2=${letra(IDX.parcial2)}`)

  // ═══ UN SOLO NOMBRE POR PROVEEDOR EN TODA LA PESTAÑA ═══════════════════════════════════════════
  //
  // EL DEFECTO (22/07). El dueño: "hay nombres repetidos en lugar de agruparlos". Y tenía razón: la
  // cuenta corriente mostraba "Alumetal" (como está en Compras) y las notas de crédito y lo facturado
  // por AFIP mostraban "ALUMETAL S A" (como lo declaró el emisor en su factura). Es la MISMA empresa
  // con dos nombres en la misma pestaña — 28 casos. Se ve como si fueran proveedores distintos.
  //
  // La regla es "no duplicar, un solo juego de rubros": también un solo nombre por entidad. Se arma
  // un mapa nombre-normalizado → grafía de Compras (la que el dueño lee), y TODO bloque muestra esa.
  // Los importes de esos bloques salen del libro por CUIT + comprobante, no por el nombre, así que
  // cambiar la grafía mostrada no mueve un peso — sólo agrupa lo que era la misma empresa.
  const grafias = new Map() // norm → Map(grafía → veces)
  for (const f of compras) {
    const raw = String(f?.[4] ?? '').trim()
    if (!raw) continue
    const k = normNombre(raw)
    if (!grafias.has(k)) grafias.set(k, new Map())
    const gm = grafias.get(k)
    gm.set(raw, (gm.get(raw) ?? 0) + 1)
  }
  const canonByKey = new Map()
  for (const [k, gm] of grafias) {
    // La grafía canónica es la MÁS FRECUENTE en Compras; a igualdad, la más larga (suele ser la más
    // completa: "Linarc SAS" antes que "Linarc"). Es la que ya usa la cuenta corriente.
    const mejor = [...gm.entries()].sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))[0][0]
    canonByKey.set(k, mejor)
  }
  /** El nombre único de una entidad: la grafía de Compras si la conocemos, si no la que vino. */
  const canon = (nombre) => canonByKey.get(normNombre(nombre)) ?? String(nombre ?? '').trim()

  // LOS PROVEEDORES SALEN DEL DATO, no de una lista mía: si mañana aparece uno nuevo y grande, entra
  // solo. Comercial = tiene al menos una compra en un rubro al que se le puede pedir plazo.
  const acc = new Map()
  for (const f of compras) {
    const nombre = String(f?.[4] ?? '').trim()
    if (!nombre) continue
    const a = acc.get(nombre) ?? { nombre, total: 0, deuda: 0, n: 0, comercial: false, fam: new Map() }
    a.total += parseMonto(f?.[14]); a.n++
    // La DEUDA de cada proveedor, para poder ordenar por ella. El importe que se muestra sigue
    // saliendo de una fórmula sobre Compras: esto es sólo el criterio de orden.
    if (String(f?.[23] ?? '').trim().toLowerCase() === ESTADO_DEUDA.toLowerCase()) a.deuda += parseMonto(f?.[14]) - parseMonto(f?.[IDX.pagado])
    if (RUBROS_COMERCIALES.includes(String(f?.[IDX.rubro] ?? '').trim())) a.comercial = true
    const fam = String(f?.[IDX.familia] ?? '').trim() || familiaDeMaterial({ concepto: f?.[IDX.concepto], detalle: f?.[IDX.detalle], proveedor: nombre })
    if (fam && fam !== SIN_FAMILIA) a.fam.set(fam, (a.fam.get(fam) ?? 0) + parseMonto(f?.[14]))
    acc.set(nombre, a)
  }
  // EL ORDEN LO PIDIÓ EL DUEÑO Y TIENE RAZÓN DE FONDO: "quiero que se respete algún orden, fecha de
  // pago, monto de deuda". Ordenar por lo COMPRADO ponía arriba a los proveedores a los que ya se
  // les pagó todo, y la pregunta de la tabla es a quién le debo. Primero los que tienen deuda, de
  // mayor a menor; después los demás por volumen, que ahí sí la pregunta es con quién se gasta.
  const comerciales = [...acc.values()].filter((p) => p.comercial)
    .sort((a, b) => (b.deuda - a.deuda) || (b.total - a.total))

  // ── LA DEUDA AGRUPADA POR PROVEEDOR — para la FUNCIÓN AGRUPAR del Sheet (el +/-) ─────────────────
  // El dueño pidió la función "agrupar": la deuda listada por proveedor, con el outline +/- del Sheet
  // para colapsar las facturas de cada uno. Se juntan las filas Pendientes por proveedor (su grafía de
  // Compras, que es también la clave del SUMIFS), guardando la fila de Compras de cada factura para
  // referenciarla con una fórmula viva. Ordenado por deuda de mayor a menor.
  const deudaMap = new Map()
  comprasRaw.forEach((f, i) => {
    const nombre = String(f?.[4] ?? '').trim()
    const esPend = String(f?.[23] ?? '').trim().toLowerCase() === ESTADO_DEUDA.toLowerCase()
    // "Comercial" tiene UNA sola definición: la columna materializada ¿Proveedor comercial? (OS), que
    // es la MISMA que suma el hero por SUMIFS. Re-derivarla acá con RUBROS_COMERCIALES daba un
    // universo distinto (dependía además de que IDX.rubro estuviera bien resuelto): el hero contaba 13
    // proveedores y el listado 12, y la suma no cerraba. Una fuente por concepto.
    const comercial = String(f?.[IDX.comercial] ?? '').trim() === '1'
    if (!nombre || !esPend || !comercial) return
    // El saldo real: Total menos lo ya pagado. Sólo para ordenar los grupos; los montos que se ven
    // salen de fórmulas (neta) sobre Compras. Se suman TODAS las filas, también las negativas (una
    // nota de crédito): así el detalle del grupo suma igual que su encabezado.
    const imp = parseMonto(f?.[IDX.total]) - parseMonto(f?.[IDX.pagado])
    const a = deudaMap.get(nombre) ?? { nombre, total: 0, filas: [] }
    a.total += imp
    a.filas.push({ fila: i + 4, comprobante: String(f?.[7] ?? '').trim() })
    deudaMap.set(nombre, a)
  })
  // Sólo grupos con saldo neto a favor del proveedor. Un proveedor cuyas notas de crédito superan sus
  // facturas pendientes no es una deuda: no va en la lista de "qué se debe".
  const deudaAgrupada = [...deudaMap.values()].filter((p) => p.total > 0.5).sort((a, b) => b.total - a.total)

  // ── AFIP: LA FUENTE FISCAL ─────────────────────────────────────────────────────────────────────
  // comprobantes_arca es el libro de IVA que el OS ya replica. Es la única fuente que dice qué se
  // facturó DE VERDAD: Compras dice lo que alguien cargó.
  //
  // CON SIGNO (21/07): una NOTA DE CRÉDITO resta. En el libro hay 13 por $20.976.638 y se estaban
  // sumando como compras: $197.442.458 declarados contra $155.489.182 reales. Y una nota de crédito
  // no puede figurar como "falta cargar en Compras" — no es una compra que nadie anotó, es plata
  // que el proveedor devolvió. Ver lib/comprobante-arca.mjs.
  const rArca = (await query(
    "select tipo_comprobante, emisor_nombre, emisor_cuit, punto_venta, numero, fecha_emision, imp_total from comprobantes_arca where tipo_libro='R' order by fecha_emision",
  )).rows
  const eArca = (await query(
    "select tipo_comprobante, receptor_cuit, punto_venta, numero, fecha_emision, imp_total from comprobantes_arca where tipo_libro='E' order by fecha_emision desc",
  )).rows

  // El cruce va por punto de venta + número normalizados: "0038-00025483" y "38-25483" son la misma
  // factura, y cada planilla la escribe a su manera.
  const enCompras = new Map()
  for (const f of compras) {
    const k = normComprobante(f?.[7])
    if (esLlaveUtil(k)) enCompras.set(k, { proveedor: String(f?.[4] ?? '').trim() })
  }
  const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-AR') : '')

  // EL CRUCE, UNA SOLA VEZ. La misma función que usa el bloque de cobertura del Cash Flow Mensual
  // (lib/cobertura-arca.mjs). Antes estaba escrito dos veces y las copias ya habían divergido.
  const filasParaCruce = compras
    .map((f, i) => ({ fila: i + 4, prov: normNombre(f?.[4]), total: parseMonto(f?.[14]) || parseMonto(f?.[12]), comprobante: normComprobante(f?.[7]) }))
    .filter((f) => f.prov && f.total > 0)
  const cruce = cruzar(rArca, filasParaCruce, { norm: normNombre, clave: (c) => normComprobante(`${c.punto_venta}-${c.numero}`) })
  const chequeo = verificar(cruce)
  if (!chequeo.ok) {
    // Si los grupos no reconstruyen el total, hay comprobantes que se cayeron de la clasificación y
    // el cuadro estaría mostrando menos de lo que ARCA registró. Se avisa fuerte, no se sigue igual.
    console.error(`⚠ el cruce contra ARCA no cierra: diferencia ${chequeo.diferencia}, ${chequeo.contados} de ${chequeo.esperados} comprobantes clasificados`)
  }

  const faltanEnCompras = cruce.faltan
    .map((r) => ({
      nombre: canon(r.emisor_nombre), cuit: r.emisor_cuit,
      comprobante: `${String(r.punto_venta).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`,
      fecha: fecha(r.fecha_emision), importe: Number(r.imp_total),
    }))
    .sort((a, b) => b.importe - a.importe)
  // ═══ EL CRUCE CONTRA COBRANZAS ESTABA ROTO — DABA "NO ESTÁ" EN TODAS ═══════════════════════════
  //
  // EL DEFECTO (22/07). La columna "¿Está en Cobranzas?" decía "⚠ NO" en las 16 facturas emitidas,
  // aunque varias SÍ están. La causa: ARCA escribe el comprobante "0001-00000203" y Cobranzas
  // "01-0000203" —la misma factura con otro relleno de ceros— y el LIKE literal nunca casaba. Se
  // normaliza con la misma función que el resto del archivo (normComprobante: 0001-00000203 → 1-203)
  // y, de paso, se trae el NOMBRE del cliente, que Cobranzas sí tiene y ARCA no (sólo guarda el CUIT).
  const cobranzas = await google.readSheetValues(ID, 'Cobranzas!A5:G400')
  const cobranzasPorComp = new Map()
  for (const c of cobranzas) {
    const k = normComprobante(c?.[4])
    if (esLlaveUtil(k) && !cobranzasPorComp.has(k)) cobranzasPorComp.set(k, String(c?.[6] ?? '').trim())
  }
  const emitidas = eArca.filter((r) => !esNotaDeCredito(r.tipo_comprobante)).map((r) => {
    const comprobante = `${String(r.punto_venta).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`
    const cliente = cobranzasPorComp.get(normComprobante(comprobante))
    return {
      nombre: cliente || (r.receptor_cuit ? `CUIT ${r.receptor_cuit}` : '(sin receptor)'),
      cuit: r.receptor_cuit, comprobante,
      fecha: fecha(r.fecha_emision), importe: Number(r.imp_total),
      enCobranzas: cliente !== undefined,
    }
  })

  // ── QUÉ HACE CADA NOTA DE CRÉDITO ──────────────────────────────────────────────────────────────
  // Saber que RESTA arregla la aritmética; esto contesta la pregunta de negocio. Ver
  // lib/notas-credito.mjs: una refacturación NO es un ahorro, y si Compras tiene cargada la factura
  // anulada, el importe cierra pero el comprobante ya no existe y el mes está mal.
  const analisisNC = analizarNC(rArca)
  const QUE = { refacturacion: 'REFACTURACIÓN — el costo sigue', devolucion: 'Devolución — el costo baja', revisar: '⚠ revisar (parcial o descuento)' }
  const comp = (c) => `${String(c.punto_venta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`
  const notasCredito = analisisNC.map((a) => ({
    proveedor: canon(a.nota.emisor_nombre),
    cuit: a.nota.emisor_cuit,
    comprobante: comp(a.nota),
    fecha: fecha(a.nota.fecha_emision),
    monto: -a.monto, // se muestra en negativo: es lo que resta
    que: QUE[a.clase],
    anula: a.anula.map(comp).join(' · '),
    reemplaza: a.refactura.map(comp).join(' · '),
  }))
  const anuladasCargadas = facturasAnuladasCargadas(analisisNC, new Set([...enCompras.keys()]), (c) => normComprobante(claveNC(c)))
    .map((m) => ({
      proveedor: canon(m.anulada.emisor_nombre),
      cuit: m.anulada.emisor_cuit,
      cargada: comp(m.anulada),
      fechaCargada: fecha(m.anulada.fecha_emision),
      monto: Number(m.anulada.imp_total),
      corresponde: m.reemplazos.map(comp).join(' / '),
      fechaCorrecta: m.reemplazos.map((r) => fecha(r.fecha_emision)).join(' / '),
    }))

  // Lo facturado por AFIP, por proveedor, para poder contrastarlo contra lo cargado en Compras.
  const porCuit = new Map()
  for (const r of rArca) {
    const s = signo(r.tipo_comprobante)
    if (s === null) continue // tipo desconocido: no se le adivina el signo
    const k = normNombre(r.emisor_nombre)
    const a = porCuit.get(k) ?? { cuit: r.emisor_cuit, total: 0 }
    a.total += s * Number(r.imp_total)
    porCuit.set(k, a)
  }

  // Los cheques y echeq emitidos sin debitar, con su NÚMERO: un instrumento sin número no sirve para
  // hablar con el proveedor.
  const tabCh = 'Cheques Emitidos'
  const cheques = (await google.readSheetValues(ID, `${tabCh}!A2:L400`))
    .map((f, i) => ({ fila: i + 2, tipo: f?.[0], numero: String(f?.[1] ?? '').trim(), proveedor: String(f?.[4] ?? '').trim(), monto: parseMonto(f?.[5]), comprobante: normComprobante(f?.[7]), debitado: String(f?.[10] ?? '').trim().toUpperCase() }))
    .filter((c) => c.monto > 0 && c.debitado !== 'SI')
  const chequesPorProv = new Map()
  for (const c of cheques) {
    const k = normNombre(c.proveedor)
    const a = chequesPorProv.get(k) ?? []
    a.push(c)
    chequesPorProv.set(k, a)
  }

  const proveedores = comerciales.slice(0, TOP).map((p) => {
    const k = normNombre(p.nombre)
    const ch = chequesPorProv.get(k) ?? []
    return {
      nombre: p.nombre,
      cuit: porCuit.get(k)?.cuit ?? '',
      arca: porCuit.get(k)?.total ?? '',
      // El N° de cheque se muestra CAPADO a los primeros seis: un proveedor con dieciséis cheques
      // (Corralón) derramaba una lista de tres renglones que tapaba la fila entera. La lista completa
      // vive en Cheques Emitidos, que es su lugar; acá alcanza con ver que hay varios y cuántos.
      cheques: (() => {
        const arr = ch.map((c) => `${/eche?q/i.test(c.tipo) ? 'e' : ''}${c.numero}`)
        return arr.length > 6 ? `${arr.slice(0, 6).join(' · ')} …+${arr.length - 6}` : arr.join(' · ')
      })(),
      familia: [...p.fam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    }
  })
  const resto = { cantidad: Math.max(0, comerciales.length - TOP) }

  // `deudaAgrupada` YA NO DECIDE QUÉ SE MUESTRA — sólo cuánto espacio reservar. Desde el 31/07 la lista
  // de la sección 1 la arma una fórmula sobre Compras: esta lectura en JS se usa nada más que para
  // dimensionar el derrame (`reservaPara`) y para migrar las notas del dueño a la libreta. Si queda
  // desactualizada, el cuadro NO miente: lo único que puede pasar es que el derrame se trunque contra la
  // reserva, y para eso está el control de reconciliación, que lo grita con el peso exacto.

  // Los nombres de obra son EXACTOS a como están en Compras (col J): "MESSINA", no "MESSINAS" —el
  // dueño lo marcó, esa columna salía vacía—. SUMIFS es insensible a mayúsculas, así que "Taller"
  // captura también "TALLER".
  const obras = ['LA ESTRELLA', 'San Francisco', 'MESSINA', 'ARCOR', 'Administracion', 'Almacen', 'Taller', 'SAINT GOBAIN']
  // LO QUE EDITÓ LA PERSONA MANDA: se leen los encabezados reales del bloque de deuda para escribir
  // cada dato en la columna que el dueño rotuló, y para no pisar las que él agregó (Comentarios).
  let deudaCols = null
  let deudaPrevio = []
  let libretaPrevia = []
  try {
    // SIN TECHO DE FILAS (28/07). Antes se leía `A1:AZ80`: con 80 filas el bloque de deuda —que puede
    // pasar de 100 filas cuando hay muchos proveedores— quedaba CORTADO, y las notas del dueño en los
    // proveedores de abajo no las capturaba `notasAncladas`. Como cada fila de deuda se genera con el
    // centinela VACIO en las columnas del dueño (que la fusión BORRA salvo que la nota se re-ancle), una
    // nota que no se leyó se PERDÍA en cada corrida — el "no respeta mis ediciones" que marcó el dueño.
    // Se lee el bloque entero (todas las filas) para que ninguna nota quede fuera de la re-ancla.
    const prevP = await google.readSheetValues(ID, `'Proveedores'!A1:BZ`)
    const iCab = (prevP || []).findIndex((f) => /proveedor\s*\/\s*factura/i.test(String(f?.[0] ?? '')))
    if (iCab >= 0) {
      deudaCols = prevP[iCab]
      // El bloque va desde la cabecera hasta el título de la sección siguiente ("2 · …").
      const fin = prevP.findIndex((f, k) => k > iCab && /^\s*2\s*·/.test(String(f?.[0] ?? '')))
      deudaPrevio = prevP.slice(iCab + 1, fin > iCab ? fin : undefined)
    }
    // LA LIBRETA QUE YA ESTÉ EN LA PESTAÑA. Si tiene aunque sea una fila, es del dueño y no se toca ni
    // una celda; si está vacía, se siembra con las notas del bloque viejo (que este rediseño borra).
    // SE BUSCA POR TEXTO, NO POR NÚMERO: `partir()` renumera los títulos de bloque por pestaña, así que
    // el "10 ·" de la grilla llega a la pestaña con otro número. Un ancla que depende de la numeración
    // se rompe la primera vez que se agrega o se saca un bloque, y en silencio.
    const iLib = (prevP || []).findIndex((f) => /LIBRETA DE PROVEEDORES/i.test(String(f?.[0] ?? '')))
    if (iLib >= 0) {
      const iCabLib = (prevP || []).findIndex((f, k) => k > iLib && /^proveedor$/i.test(String(f?.[0] ?? '').trim()))
      if (iCabLib > iLib) libretaPrevia = prevP.slice(iCabLib + 1).filter((f) => String(f?.[0] ?? '').trim() !== '')
    }
  } catch { /* la pestaña todavía no existe: se usa el layout por defecto */ }
  if (deudaCols) console.log(`  columnas de deuda según la pestaña (las del dueño): ${deudaCols.filter(Boolean).join(' · ')}`)
  const g = grilla({ obras, proveedores, resto, deudaAgrupada, faltanEnCompras, emitidas, notasCredito, anuladasCargadas, cruce, deudaCols, deudaPrevio, libretaPrevia })
  const ancho = Math.max(...g.filas.map((f) => f.length))
  const cuadro = g.filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r })
  console.log(`${PESTAÑA}: ${cuadro.length} filas x ${ancho} columnas`)
  console.log(`  sección 1 VIVA: por proveedor fila ${g.provAncla} (reserva ${g.provFin - g.provAncla + 1}) · factura por factura fila ${g.facAncla} (reserva ${g.facFin - g.facAncla + 1}) — dos anclas, cero filas escritas`)
  console.log(`  libreta: ${g.libreta.motivo}${g.libreta.sembradas ? ` (${g.libreta.sembradas} nota(s) migradas)` : ''}`)

  // ═══ LA MIGRACIÓN SE VERIFICA ANTES DE ESCRIBIR, NO DESPUÉS ═══
  //
  // Este rediseño BORRA las filas materializadas donde hoy viven los comentarios del dueño (pasan a la
  // libreta). Si una sola no llegó, la corrida se corta acá: en este archivo ya se destruyó trabajo suyo
  // más de una vez por rehacer un bloque que tenía datos, y "casi todas" no es un criterio aceptable.
  const mig = verificarMigracionNotas(g.notasPorProveedor, g.libreta.sembradas ? g.libreta.filas : libretaPrevia)
  if (!mig.ok) {
    throw new Error(`la migración de notas a la libreta perdería ${mig.perdidas.length} comentario(s) del dueño y NO se escribe nada: `
      + mig.perdidas.map((p) => `«${p}»`).join(' · ')
      + ` — agregá esas filas a la libreta (bloque 10) o pasá --force sabiendo lo que se pierde.`)
  }
  if (g.notasHuerfanas?.length) {
    // NO se pierde en silencio: queda en el log, textual, y el snapshot previo lo conserva entero.
    console.log(`  ⚠ ${g.notasHuerfanas.length} nota(s) ancladas a un COMPROBANTE, no a un proveedor: la libreta se indexa por proveedor, así que hay que reubicarlas a mano:`)
    for (const n of g.notasHuerfanas) console.log(`     ${n.tipo} "${n.clave}": ${n.texto}`)
  }
  console.log(`  ${comerciales.length} proveedores comerciales de ${acc.size} · top ${proveedores.length} listados, ${resto.cantidad} en "resto"`)
  if (DRY) {
    // ═══ LO PRIMERO QUE HAY QUE PODER MIRAR: QUÉ FÓRMULA VA EN QUÉ CELDA ═══
    // La sección 1 dejó de ser filas de datos y pasó a ser CUATRO celdas que deciden todo el cuadro. En
    // seco se imprimen enteras, con su dirección final en la pestaña, para poder leerlas antes de que
    // toquen el archivo real.
    previsualizarSeccionViva(g)
    // ═══ EN SECO, LA PREGUNTA ÚTIL NO ES "CUÁNTAS FILAS" SINO "QUÉ TE VOY A PISAR" ═══
    //
    // POR QUÉ (23/07). El dueño preguntó qué edición suya había vuelto pisada y nombró esta pestaña.
    // Con `--dry` cortando acá, lo único que se veía era el tamaño del cuadro — inútil para
    // contestarle. Ahora en seco se lee la pestaña y se listan los rótulos que el generador quiere
    // escribir y HOY NO ESTÁN: o los cambió él, o cambió el generador. Es la lista que hay que
    // mirar juntos antes de dejar correr la primera escritura con Regla 0.
    const anchoLeer = Math.max(ancho, 30)
    const vivo = await google.readSheetValues(ID, `${refPestana(PESTAÑA)}!A1:${letra(anchoLeer - 1)}${cuadro.length}`).catch(() => [])
    const frio = detectarArranqueEnFrio(cuadro, vivo)
    if (!frio.length) console.log('--dry: no escribí nada. Ningún rótulo mío falta en la pestaña — no tengo nada tuyo que pisar.')
    else {
      console.log(`--dry: no escribí nada. ⚠ ${frio.length} rótulo(s) que yo escribiría y HOY NO ESTÁN en "${PESTAÑA}":`)
      for (const x of frio) console.log(`      fila ${String(x.fila).padStart(3)} · "${String(x.mio).slice(0, 70)}"`)
      console.log('      Decime cuáles borraste o reescribiste VOS y los registro como tuyos.')
    }
    return
  }

  // ── LAS COLUMNAS QUE EL OS CALCULA EN COMPRAS: Familia y ¿Comercial? ─────────────────────────────
  // Se escriben en la MISMA columna que ya existe con ese encabezado (ubicada por nombre), NO en una
  // posición fija: escribir en posición fija después de que el dueño corrió las columnas es lo que dejó
  // columnas DUPLICADAS. Sus fórmulas referencian el rubro en su posición REAL. Las viejas columnas de
  // orden de deuda (AH/AI) ya no se escriben: la deuda se pliega con la función Agrupar del Sheet.
  const meta0 = await google.getSheetMeta(ID)
  const hojaCompras = meta0.find((s) => s.title === 'Compras')
  const colRubroRef = `$${letra(IDX.rubro)}$4:$${letra(IDX.rubro)}`
  const escribirColCompras = async (idx, encabezado, formula, ancho = 200) => {
    if ((hojaCompras.cols ?? 0) <= idx) await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId: hojaCompras.sheetId, dimension: 'COLUMNS', length: idx + 1 - (hojaCompras.cols ?? 0) } }])
    await google.spreadsheetBatchUpdate(ID, [
      { updateCells: {
        range: { sheetId: hojaCompras.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: idx, endColumnIndex: idx + 1 },
        rows: [
          { values: [{ userEnteredValue: { stringValue: encabezado }, userEnteredFormat: E.encabezado() }] },
          { values: [{ userEnteredValue: { formulaValue: formula } }] },
        ],
        fields: 'userEnteredValue,userEnteredFormat',
      } },
      { updateDimensionProperties: { range: { sheetId: hojaCompras.sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 }, properties: { pixelSize: ancho }, fields: 'pixelSize' } },
    ])
  }
  await escribirColCompras(IDX.familia, 'Familia de material', formulaFamilia(colRubroRef), 230)
  await escribirColCompras(IDX.comercial, '¿Proveedor comercial? (OS)', formulaComercial(RUBROS_COMERCIALES, `$${letra(IDX.rubro)}`))
  console.log(`  Compras: Familia (${letra(IDX.familia)}) y ¿Comercial? (${letra(IDX.comercial)}) reescritas en su columna real por encabezado`)

  // ═══ LA PARTICIÓN ═══════════════════════════════════════════════════════════════════════════
  //
  // Ocho tablas sobre las mismas columnas no se pueden formatear bien: la E es "Modalidad" en el
  // bloque 1, "Facturado según AFIP" en el 2 e "Importe" en el 6. Cada tema pasa a su pestaña, con
  // sus columnas y sus anchos. Las fórmulas se reubican solas (lib/partir-pestana.mjs) y ninguna
  // fila se pierde: `filasHuerfanas` lo verifica antes de escribir una sola celda.
  const M = g.marcas
  const TRAMOS = [
    { titulo: NOMBRES.proveedores, desde: M.bPos, hasta: M.b3 - 1,
      subtitulo: 'Qué se debe y a quién: la posición arriba, y abajo la deuda VIVA —por proveedor y factura por factura— que se mueve sola cada vez que se carga una compra, sin esperar a ningún agente. Después la cuenta corriente con su plazo, las notas de crédito, lo que AFIP facturó que Compras no tiene, y al final tu libreta de notas por proveedor.',
      anchos: [230, 132, 142, 104, 132, 132, 124, 172, 124, 124, 124, 124, 136, 116, 104, 240] },
    { titulo: NOMBRES.materiales, desde: M.b3, hasta: M.fin,
      subtitulo: 'En qué se va la plata: por familia de material y por mes, y la misma plata abierta por obra. Sale de la columna "Familia de material" de Compras, que el OS calcula con una sola definición.',
      anchos: [236, ...Array(12).fill(96), 116, 78, 116, 116] },
  ]

  // NINGUNA FILA SE PIERDE. Es la regla que el dueño puso después del rollback: "falta información
  // relevante de la que antes sí contaba". Las filas 1..b1-1 son el título de la pestaña vieja, que
  // se reemplaza por el título propio de cada pestaña nueva.
  const huerfanas = filasHuerfanas(g.filas, [...TRAMOS, { titulo: '(título viejo)', desde: 1, hasta: M.bPos - 1 }])
  if (huerfanas.length) {
    throw new Error(`${huerfanas.length} fila(s) quedarían afuera del reparto y se perderían: `
      + huerfanas.slice(0, 5).map((h) => `${h.fila} "${h.contenido}"`).join(' · '))
  }

  const FILA0 = 4   // título, subtítulo, una vacía, y recién ahí el contenido
  const partes = partir(g.filas, TRAMOS, { desdeFila: FILA0 })

  // LOS BLOQUES SE RENUMERAN POR PESTAÑA. Los rótulos vienen numerados en el orden en que se
  // construye la grilla (1, 2, 5, 6, 7, 8, 9 en proveedores y 3, 4 en materiales): dejarlos así
  // haría que la primera pestaña empiece en 1 y salte al 5, que se lee como si faltaran bloques.
  for (const parte of partes) {
    let n = 0
    for (const fila of parte.filas) {
      const t = String(fila?.[0] ?? '')
      if (/^\d+\s*·\s/.test(t)) fila[0] = t.replace(/^\d+\s*·\s/, `${++n} · `)
    }
  }

  // Dónde quedó cada fila vieja, para traducir los marcadores que usa el formateador.
  const donde = new Map()
  for (const t of TRAMOS) for (let f = t.desde; f <= t.hasta; f++) donde.set(f, { titulo: t.titulo, fila: f - t.desde + FILA0 })
  // `anchoObras` es una CANTIDAD de columnas, no un número de fila: traducirlo lo rompería.
  const NO_ES_FILA = new Set(['anchoObras'])
  const traducir = (titulo) => {
    const t = (n) => { const d = donde.get(n); return d && d.titulo === titulo ? d.fila : null }
    const out = {}
    for (const [k, v] of Object.entries(g)) {
      if (NO_ES_FILA.has(k) || k === 'marcas' || k === 'filas') out[k] = v
      else if (typeof v === 'number') out[k] = t(v)
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v.map(t).filter(Boolean)
      else out[k] = v
    }
    return out
  }

  // Las coordenadas finales de los marcadores en la pestaña "Proveedores". Se calculan ANTES del bucle
  // porque el nombre de la libreta hay que publicarlo antes de escribir las fórmulas que lo referencian.
  const tArca = traducir(NOMBRES.proveedores)

  let hojas = await google.getSheetMeta(ID)
  const escritas = []
  for (const [i, t] of TRAMOS.entries()) {
    // EL ALCANCE, ANTES DE CUALQUIER LECTURA O ESCRITURA DE ESTA PESTAÑA. Con --solo, la que no fue
    // nombrada no se toca ni con --force: es la diferencia entre "regenerá el cuadro de deuda" y
    // "regenerá las dos pestañas", que no es lo mismo cuando el dueño reescribió una de las dos.
    if (SOLO && t.titulo !== SOLO) { console.log(`  ⏭ ${t.titulo}: fuera del alcance (--solo ${SOLO}), no la toco`); continue }
    // EL TÍTULO VA EN ORACIÓN, NO EN VERSALITA. Una pestaña entera gritando es la marca de una
    // planilla, no de un statement: la versalita se reserva para los títulos de sección.
    const filasP = [[t.titulo], [t.subtitulo], [], ...partes[i].filas]
    const anchoP = Math.max(...filasP.map((f) => f.length), t.anchos.length)
    // LOS ANCHOS SALEN DEL CONTENIDO, con los declarados como piso: un ancho escrito a mano se queda
    // corto en cuanto cambia un rótulo, y el texto se corta sin que nadie se entere.
    t.anchos = anchosSegunContenido(filasP, { base: t.anchos, max: 300 })
    const cuadroP = filasP.map((f) => { const r = [...f]; while (r.length < anchoP) r.push(VACIO); return r })

    let hoja = hojas.find((h) => h.title === t.titulo)
    if (!hoja) {
      await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: t.titulo, gridProperties: { rowCount: cuadroP.length + 30, columnCount: Math.max(anchoP + 2, 12) } } } }])
      hojas = await google.getSheetMeta(ID)
      hoja = hojas.find((h) => h.title === t.titulo)
      console.log(`  pestaña "${t.titulo}" creada`)
    }
    // La grilla tiene que alcanzar ANTES de escribir: un rango que excede la hoja hace fallar el
    // batch entero y deja la pestaña a medio escribir.
    const reqG = []
    if ((hoja.rows ?? 0) < cuadroP.length + 10) reqG.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: cuadroP.length + 30 } }, fields: 'gridProperties.rowCount' } })
    if ((hoja.cols ?? 0) < anchoP) reqG.push({ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: anchoP - (hoja.cols ?? 0) + 2 } })
    if (reqG.length) await google.spreadsheetBatchUpdate(ID, reqG)

    // ═══ EL NOMBRE DE LA LIBRETA SE PUBLICA ANTES DE ESCRIBIR LAS FÓRMULAS QUE LO USAN ═══
    //
    // La sección 1 trae la nota de cada proveedor con `VLOOKUP(p;PROV_LIBRETA;2;FALSE)`. Si ese nombre
    // todavía no existe cuando entra la fórmula, la celda evalúa #NAME? — el IFERROR de la columna lo
    // tapa, así que la tabla no se cae, pero las diez notas del dueño quedarían INVISIBLES hasta la
    // corrida siguiente y eso se lee como "otra vez me borraste los comentarios". Publicarlo primero
    // cierra la ventana: cuando la fórmula llega, el nombre ya apunta a donde va la libreta.
    if (t.titulo === NOMBRES.proveedores && tArca.lib0) {
      await publicar(google, ID, hoja.sheetId, [{ name: N_PROV.libreta, fila: tArca.lib0, col: 1, cols: 2, abierto: true }])
        .then(() => console.log(`  ${N_PROV.libreta} publicado en A${tArca.lib0} (abierto hacia abajo), antes de escribir las fórmulas que lo miran`))
        .catch((e) => console.warn(`  ⚠ no pude publicar ${N_PROV.libreta} (${e.message}): las notas van a aparecer en la corrida siguiente`))
    }

    // ═══ NUNCA SE BORRA NADA DE LO QUE ESCRIBE EL DUEÑO — REGLA ABSOLUTA ═══
    //
    // Acá había un `clearValues` que limpiaba el rango entero y reescribía encima. El dueño anota a
    // mano en la pestaña y cada regeneración —el worker corre solo, 24×7— le borraba el trabajo. Su
    // instrucción, textual: "nunca podes borrar nada de lo q yo escribo... donde sea q yo haya
    // editado el sheet".
    //
    // Ya no se limpia: se FUSIONA. Se lee lo que hay (con render FORMULA, para no degradar una
    // fórmula preservada a número pegado), gana el generador donde TIENE contenido y se conserva lo
    // del dueño donde el generador deja vacío. Se lee el ancho COMPLETO de la hoja, no sólo anchoP,
    // para capturar lo que anotó a la derecha de la tabla. Y sólo se escriben las filas que el
    // generador produce: lo que esté MÁS abajo no se toca. Ver lib/preservar-anotaciones.mjs.
    const anchoLeer = Math.max(anchoP, hoja.cols ?? anchoP)
    const previo = await google.readSheetValues(
      ID, `${refPestana(t.titulo)}!A1:${letra(anchoLeer - 1)}${cuadroP.length}`, { render: 'FORMULA' },
    )
    // ═══ REGLA 0 — Y SI ADEMÁS REESCRIBIÓ UN TEXTO MÍO, GANA EL SUYO ═══
    //
    // POR QUÉ SE AGREGÓ (23/07). El dueño: "no estás respetando q yo hago ediciones en las pestañas
    // y me las ignoras". PRESERVAR (arriba) protege lo que el generador NO escribe: una nota al
    // margen, una columna propia. No alcanzaba: si él reescribe un rótulo que el generador SÍ
    // escribe, la fusión le da la razón al generador y su edición dura una sola corrida.
    // RESPETAR cubre justamente ese caso. Ver lib/respetar-ediciones.mjs.
    // La Regla 0 mira el TEXTO QUE SE VE, no la fórmula: `previo` viene con render FORMULA (hace
    // falta así para fusionar sin degradar fórmulas), y con eso una celda que muestra "ARCOR" por
    // fórmula devuelve "=QUERY(…)" y el rótulo parecería borrado. Ver lib/preservar-anotaciones.mjs.
    const visible = await google.readSheetValues(
      // Sin techo de filas: ver la nota de caja-pestana.mjs. "TOTAL FACTURADO" vive en la fila 202 y
      // toda lectura acotada a la grilla nueva lo daba por borrado.
      ID, `${refPestana(t.titulo)}!A1:${letra(anchoLeer - 1)}`,
    ).catch(() => previo)
    // LA FIRMA primero (respeto más fuerte: cualquier edición tuya). Después, la reescritura total.
    if (!FORCE && (await firmaGuardia(google, ID, t.titulo, refPestana(t.titulo))).editada) continue
    // AUTO-RESPETO (24/07): si reescribiste esta pestaña entera con otra estructura, la tomo como tuya
    // y no la piso — sin que tengas que candar nada. --force la salta (regeneración pedida a mano).
    if (!FORCE && (await autoRespetarReescritura(ID, t.titulo, cuadroP, visible)).reescrita) continue
    if (FORCE) console.log(`  ⚡ ${t.titulo}: --force, regeneración intencional (guardas de skip omitidas; comentarios re-anclados igual)`)
    const { grid: cuadroFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, t.titulo, cuadroP, visible)
    for (const r of respetadas) console.log(`  ✋ ${t.titulo}: respeto tu texto ("${String(r.suyo).slice(0, 40)}") en vez de "${String(r.mio).slice(0, 40)}"`)
    const fusion = fusionar(cuadroFinal, previo)
    const conservadas = sobrantes(cuadroFinal, previo)
    // En --force el write también pasa el portón (yaGuardado): es una regeneración intencional de ESTA
    // pestaña (Proveedores/Materiales), pedida a mano. La fusión ya preservó lo del dueño, así que el
    // portón sólo estaría bloqueando la actualización que justamente se pidió. No afecta a Compras (su
    // contenido se escribe por otro camino y sigue protegido).
    await google.batchUpdateValues(ID, [{ range: `${refPestana(t.titulo)}!A1`, values: fusion }], { yaGuardado: FORCE })
    if (conservadas.length) console.log(`  ✋ ${t.titulo}: ${conservadas.length} celda(s) escritas por el dueño — CONSERVADAS, no se borra nada`)
    await sellarFirma(google, ID, t.titulo, refPestana(t.titulo))
    await guardarRegistro(ID, t.titulo, cuadroFinal, ediciones, visible, candidatos)
      .catch((e) => console.warn(`  ⚠ ${t.titulo}: no pude guardar el registro de rótulos: ${e.message}`))

    const gP = { ...traducir(t.titulo), filas: cuadroP }
    await formatear(google, hoja.sheetId, gP, anchoP, cuadroP.length)

    // El título y el subtítulo de la pestaña, EN PIEL DE STATEMENT — igual que Impuestos: tinta sobre
    // blanco con una línea fina abajo, NO la barra teal oscura que usa el estilo de dashboard. La
    // barra rellena es justo lo que hace ver la pestaña como planilla y no como JPMorgan.
    await google.spreadsheetBatchUpdate(ID, [
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: anchoP }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { bold: true, fontSize: 15, foregroundColor: INK, fontFamily: 'Arial' }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)' } },
      { updateBorders: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: anchoP }, bottom: { style: 'SOLID', width: 1, color: HAIR } } },
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: anchoP }, cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
      { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
      // LOS ANCHOS SON EL MOTIVO DE TODO ESTO. Cada pestaña declara los suyos según lo que lleva su
      // única tabla, que es exactamente lo que no se podía hacer con las ocho apiladas.
      ...t.anchos.map((px, j) => ({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
      { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    ])
    escritas.push({ titulo: t.titulo, filas: cuadroP.length, sheetId: hoja.sheetId })
    console.log(`  ${t.titulo.padEnd(32)} ${String(cuadroP.length).padStart(4)} filas x ${anchoP} columnas`)
  }

  // Los nombres, DESPUÉS de escribir: se corren de fila según cuántas notas de crédito o
  // proveedores haya, y publicarlos antes los dejaría apuntando a la geometría vieja, en silencio.
  const hojaArca = escritas.find((e) => e.titulo === NOMBRES.proveedores)

  // ── SE VAN LOS GRUPOS DEL +/-, Y HAY QUE LIMPIARLOS ─────────────────────────────────────────────
  //
  // La deuda ya no tiene filas físicas por proveedor: no hay nada que agrupar. Pero los grupos VIEJOS
  // siguen en la pestaña, y dos cosas los hacen peligrosos si se los deja: la API los APILA (nunca los
  // reemplaza), y un grupo colapsado deja sus filas con `hiddenByUser=true` — o sea que el derrame nuevo
  // caería en filas OCULTAS y el cuadro se vería vacío sin que nada dé error. Se borran todos y se
  // fuerzan visibles todas las filas de la pestaña.
  const gruposPrevios = (await google.getRowGroups(ID)).find((x) => x.sheetId === hojaArca.sheetId)?.grupos ?? []
  const reqGr = gruposPrevios.map((v) => ({ deleteDimensionGroup: { range: { sheetId: hojaArca.sheetId, dimension: 'ROWS', startIndex: v.startIndex, endIndex: v.endIndex } } }))
  reqGr.push({ updateDimensionProperties: { range: { sheetId: hojaArca.sheetId, dimension: 'ROWS', startIndex: 3, endIndex: hojaArca.filas }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  if (reqGr.length) await google.spreadsheetBatchUpdate(ID, reqGr)
  console.log(`  ${gruposPrevios.length} grupo(s) +/- borrados y todas las filas forzadas visibles: el derrame no puede caer en filas ocultas`)
  const nombres = await publicar(google, ID, hojaArca.sheetId, [
    // LA LIBRETA, POR NOMBRE Y ABIERTA HACIA ABAJO. Por nombre porque el bloque se corre de fila según
    // cuántas notas de crédito o cuántos proveedores haya ese día, y una referencia por celda apuntaría
    // a otra cosa mañana en silencio. Abierta porque el dueño tiene que poder agregar un proveedor sin
    // que nadie republique nada.
    ...(tArca.lib0 ? [{ name: N_PROV.libreta, fila: tArca.lib0, col: 1, cols: 2, abierto: true }] : []),
    { name: N_ARCA.comprobantes, fila: tArca.fArcaN, col: 2 },
    { name: N_ARCA.total, fila: tArca.fArcaN, col: 3 },
    { name: N_ARCA.notasN, fila: tArca.fArcaNotas, col: 2 },
    { name: N_ARCA.notasMonto, fila: tArca.fArcaNotas, col: 3 },
    { name: N_ARCA.enComprasN, fila: tArca.fArcaEn, col: 2 },
    { name: N_ARCA.enComprasMonto, fila: tArca.fArcaEn, col: 3 },
    { name: N_ARCA.sinNumeroN, fila: tArca.fArcaSinNum, col: 2 },
    { name: N_ARCA.sinNumeroMonto, fila: tArca.fArcaSinNum, col: 3 },
    { name: N_ARCA.faltanN, fila: tArca.fArcaFaltan, col: 2 },
    { name: N_ARCA.faltanMonto, fila: tArca.fArcaFaltan, col: 3 },
    { name: N_ARCA.ventasN, fila: tArca.fArcaVentas, col: 2 },
    { name: N_ARCA.ventasMonto, fila: tArca.fArcaVentas, col: 3 },
  ].filter((x) => x.fila))
  console.log(`  ${nombres.nombres} rangos con nombre publicados: el Cash Flow los referencia en vez de copiarlos`)

  // ═══ VERIFICACIÓN ANTES DE RETIRAR LA PESTAÑA VIEJA ═══
  // No se borra nada hasta comprobar que las cuatro nuevas están escritas y sin errores.
  let err = 0
  for (const e of escritas) {
    const v = await google.readSheetValues(ID, `${refPestana(e.titulo)}!A1:T${e.filas}`)
    v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) { err++; if (err <= 8) console.log(`  ⚠ ${e.titulo}!${letra(j)}${i + 1} = ${c}`) } }))
  }
  console.log(err ? `\n⚠ ${err} celdas en error: NO retiro la pestaña vieja` : '\n✓ las cuatro pestañas, sin una sola celda en error')

  // Las pestañas que quedaron obsoletas: la original y las tres de la primera partición, que el
  // dueño pidió unificar el mismo día. Sólo se retiran si las nuevas quedaron sin una sola celda en
  // error — nunca se borra nada sobre un resultado que no se verificó.
  const OBSOLETAS = [PESTAÑA, 'Proveedores — Deuda', 'Proveedores — Cuenta Corriente', 'Proveedores — Control y ARCA']
  const meta2 = await google.getSheetMeta(ID)
  const retirar = OBSOLETAS.map((t) => meta2.find((h) => h.title === t)).filter(Boolean)
  if (!err && retirar.length) {
    await google.spreadsheetBatchUpdate(ID, retirar.map((h) => ({ deleteSheet: { sheetId: h.sheetId } })))
    console.log(`  retiradas: ${retirar.map((h) => `"${h.title}"`).join(', ')} — su contenido está en las dos de arriba`)
  }

  console.log(`  AFIP: ${g.afip1 - g.afip0 + 1} comprobantes facturados que Compras no tiene · ${g.emi1 - g.emi0 + 1} facturas emitidas listadas`)
}

async function formatear(google, sheetId, g, ancho, filas) {
  // LA PIEL ES DE STATEMENT: sin barras de color, la estructura se marca con tipografía (tinta INK,
  // versalita apagada MUTED) y líneas finas (HAIR). Ver lib/estilo-statement.mjs. Las bandas azules
  // y grises que había antes son justo lo que hace ver una pestaña como planilla y no como JPMorgan.
  const r = (r0, r1, c0 = 0, c1 = ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  // ═══ PRIMERO SE BORRA TODO, DESPUÉS SE PINTA ═══
  //
  // POR QUÉ (21/07). Este formateador sólo APLICABA formatos, nunca los sacaba. Mientras el layout
  // no cambió, no se notó. El día que reordené los bloques, las bandas azules de los encabezados
  // viejos quedaron pintadas en las filas donde estaban antes —en el medio de la nada— y la pestaña
  // se volvió ilegible. El dueño: "esa pestaña es completamente inútil", y tenía razón.
  //
  // Un formato es tan persistente como un dato: si el cuadro se rehace entero, el formato también.
  const req = [
    { unmergeCells: { range: r(0, filas) } },
    // ═══ LAS NOTAS VIEJAS TAMBIÉN SE BORRAN ═══
    //
    // clearValues borra el VALOR de una celda, no su NOTA (comentario). Cuando la pestaña cambia de
    // layout, las notas viejas quedan pegadas a la celda por posición y terminan describiendo el dato
    // equivocado: en el PDF se veía "⇒ Diferencia contra el total" colgada de una fila de PEREZ
    // GARCIA. Un formato es tan persistente como un dato, y una nota también: si el cuadro se rehace
    // entero, las notas viejas se van con él.
    { repeatCell: { range: r(0, filas, 0, Math.max(ancho, 26)), cell: {}, fields: 'note' } },
    {
      // EL RESET CUBRE LAS COLUMNAS DE SOBRA, no sólo las que tienen dato. La hoja tiene más columnas
      // que la tabla (Materiales: 19 vs 17), y las de sobra guardaban un relleno oscuro de un layout
      // viejo —se veía como un rectángulo negro en la esquina del título—. clearValues no lo saca; el
      // reset de formato sí, pero sólo si llega hasta esas columnas.
      repeatCell: {
        range: r(0, filas, 0, Math.max(ancho, 26)),
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { bold: false, italic: false, fontSize: 10, foregroundColor: { red: 0, green: 0, blue: 0 } },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'CLIP',
          },
        },
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy',
      },
    },
    // Y la ALTURA vuelve al estándar. Va acá, ANTES que nada: una fila que quedó de 200px por un
    // formato viejo no se arregla sola, y las alturas específicas de más abajo tienen que ganarle
    // a ésta — el último pedido sobre el mismo rango es el que manda.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: filas }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
  ]
  // ═══ UN RANGO QUE NO EXISTE EN ESTA PESTAÑA SE DESCARTA, NO SE PINTA ═══
  //
  // Desde que la pestaña se partió en cuatro, este formateador corre una vez por pestaña con los
  // mismos marcadores: los bloques que se fueron a otra vienen en null. Sin este filtro, `r(null-1,
  // null)` produce un rango con NaN que la API acepta como "toda la hoja" y pinta cualquier cosa
  // encima. Es la misma clase de error que dejó bandas azules en el medio de la nada.
  const valido = (rg) => Number.isFinite(rg?.startRowIndex) && Number.isFinite(rg?.endRowIndex)
    && rg.startRowIndex >= 0 && rg.endRowIndex > rg.startRowIndex
  const fmt = (rg, fields, format) => { if (valido(rg)) req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } }) }
  // ═══ PIEL DE STATEMENT — la estructura se marca con TIPOGRAFÍA y LÍNEAS FINAS, no con barras de
  // color. Es lo que separa "cómo se ve en JPMorgan" de "una planilla". La reja se apaga; los
  // encabezados van en versalita apagada con una línea fina abajo; los totales, rulados; las
  // secciones, en tinta con una línea fina arriba. Ver lib/estilo-statement.mjs. Acá se usan los
  // MARCADORES conocidos (no la detección por contenido) porque muchos proveedores tienen nombre en
  // mayúsculas y la detección los confundiría con secciones.
  const hairBottom = (row, c0 = 0, c1 = ancho) => { if (row >= 1) req.push({ updateBorders: { range: r(row - 1, row, c0, c1), bottom: { style: 'SOLID', width: 1, color: HAIR } } }) }
  const hairTop = (row, c0 = 0, c1 = ancho) => { if (row >= 1) req.push({ updateBorders: { range: r(row - 1, row, c0, c1), top: { style: 'SOLID', width: 1, color: HAIR } } }) }
  // Los bordes viejos se limpian ANTES de poner las hairlines nuevas: una línea de un layout anterior
  // que quedó en el medio se lee como un error, igual que una banda de color huérfana.
  req.push({ updateBorders: { range: r(0, filas, 0, Math.max(ancho, 26)), top: { style: 'NONE' }, bottom: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' }, innerHorizontal: { style: 'NONE' }, innerVertical: { style: 'NONE' } } })
  const encabezadoStmt = (row, c0 = 0, c1 = ancho) => {
    fmt(r(row - 1, row, c0, c1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy',
      { textFormat: { bold: true, fontSize: 9, foregroundColor: MUTED }, backgroundColor: { red: 1, green: 1, blue: 1 }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
    hairBottom(row, c0, c1)
  }
  const totalStmt = (row, c0 = 0, c1 = ancho) => {
    fmt(r(row - 1, row, c0, c1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, foregroundColor: INK }, backgroundColor: { red: 1, green: 1, blue: 1 } })
    hairTop(row, c0, c1)
  }

  fmt(r(0, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 15, foregroundColor: INK } })

  // ═══ LOS TÍTULOS Y LAS EXPLICACIONES SE DETECTAN, NO SE ADIVINAN ═══
  //
  // Antes estaban a mano: `for (const i of [1, 4])`. Con nueve bloques que se reordenan, esos dos
  // números apuntaban a cualquier lado. Ahora se buscan por su forma —"N · TÍTULO" y la línea de
  // abajo— así que sobreviven a que los bloques cambien de orden.
  //
  // Y la explicación va MERGEADA a lo ancho con altura fija. Escrita en la columna A con ajuste de
  // línea, un párrafo de 300 caracteres en una columna de 250px hacía una fila de 200px de alto:
  // eso es el bloque azul gigante que hizo que la pestaña se volviera ilegible.
  const esTitulo = (t) => /^\d+\s*·\s/.test(String(t ?? '').trim())
  const titulos = []
  for (let i = 0; i < g.filas.length; i++) if (esTitulo(g.filas[i]?.[0])) titulos.push(i)

  for (const i of titulos) {
    // Sección en tinta con una línea fina arriba — nada de barra celeste.
    fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, fontSize: 11, foregroundColor: INK }, backgroundColor: { red: 1, green: 1, blue: 1 } })
    hairTop(i + 1)
    // La línea de abajo es la explicación del bloque: sólo si tiene texto largo y nada en B.
    const sig = g.filas[i + 1]
    if (sig && String(sig[0] ?? '').length > 40 && !String(sig[1] ?? '').trim()) {
      fmt(r(i + 1, i + 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
        { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' })
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } })
    }
  }
  // El subtítulo del encabezado de la pestaña, igual.
  if (String(g.filas[1]?.[0] ?? '').length > 40) {
    fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
      { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } })
  }

  // ═══ EL HERO: LA POSICIÓN, ARRIBA DE TODO ═══
  //
  // Resumen vertical sin encabezado de tabla (Concepto · Monto · una nota al lado). El total va
  // rulado y en negrita; las sub-líneas ("· de eso, ...") en gris; el plazo, en días, no en pesos.
  // Es el mismo patrón que el dueño aprobó en Impuestos, adaptado a las columnas de esta pestaña.
  if (g.bPos && g.pos0 && g.pos1) {
    // Título de la posición: tinta, sin barra; una línea fina arriba lo separa del subtítulo.
    // Derrama a la derecha (OVERFLOW): el sello "importes en vivo al dd/mm/yyyy" es más largo que la
    // columna A y sin esto se corta en "al 2…".
    fmt(r(g.bPos - 1, g.bPos), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor,userEnteredFormat.wrapStrategy',
      { textFormat: { bold: true, fontSize: 11, foregroundColor: INK }, backgroundColor: { red: 1, green: 1, blue: 1 }, wrapStrategy: 'OVERFLOW_CELL' })
    hairTop(g.bPos)
    // Concepto (A) en negrita suave; Monto (B) moneda a la derecha; la nota (C) en gris, sin plata.
    fmt(r(g.pos0 - 1, g.pos1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: false, fontSize: 11, foregroundColor: INK } })
    fmt(r(g.pos0 - 1, g.pos1, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
      { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT', textFormat: { bold: false, fontSize: 11, foregroundColor: INK } })
    fmt(r(g.pos0 - 1, g.pos1, 2, ancho), 'userEnteredFormat', E.nota())
    // El total con terceros: rulado arriba y en negrita, como un subtotal de statement.
    if (g.posTotal) {
      fmt(r(g.posTotal - 1, g.posTotal, 0, 2), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11, foregroundColor: INK } })
      hairTop(g.posTotal, 0, 2)
    }
    // El plazo son días, no pesos. Igual que en el control: la columna es de plata y esta celda no.
    if (g.posProy) hairTop(g.posProy, 0, 2)
    if (g.posPlazo) fmt(r(g.posPlazo - 1, g.posPlazo, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'NUMBER', pattern: '0.0" días"' }, horizontalAlignment: 'RIGHT' })
    // Lo de AFIP sin cargar es una alerta suave: es plata facturada que ninguna pestaña más ve.
    if (g.posFaltan) fmt(r(g.posFaltan - 1, g.posFaltan, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: false, fontSize: 11, foregroundColor: E.COLOR.alertaTexto } })
  }

  for (const f of [g.cabProv, g.cabFam, g.cabObra]) {
    if (f) encabezadoStmt(f)
  }
  fmt({ ...r(g.cabFam - 1, g.cabFam), startColumnIndex: 1, endColumnIndex: 13 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'DATE', pattern: 'mmm' } })
  for (const f of [g.fSub, g.fTotProv, g.totFam, g.obra1 + 1]) {
    if (f) totalStmt(f)
  }
  // BLOQUE 2 (perfil de proveedor, 7 columnas): B CUIT (texto centrado) · C-E plata (moneda general) ·
  // F plazo (días) · G qué se le compra (texto). Sin columnas de deuda ni de cheque: la deuda está
  // arriba, agrupada. Menos formato porque hay menos columnas — el objetivo es leerlo de un vistazo.
  // BLOQUE 2, 6 columnas: A proveedor · B CUIT (texto) · C comprobantes (cantidad) · D comprado
  // (moneda general) · E plazo (días) · F qué se le compra (texto).
  fmt({ ...r(g.p0 - 1, g.fTotProv, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.p0 - 1, g.fTotProv, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: E.NUM.cantidad, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.p0 - 1, g.fTotProv, 4, 5) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'NUMBER', pattern: '0" d";;""' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.p0 - 1, g.fTotProv, 5, 6) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
  // NOTAS DE CRÉDITO — el formato moneda general de la pestaña convierte una fecha en "$46.119"
  // (el número de serie del 7/4/2026 pintado como pesos). Ya pasó cinco veces en este archivo: un
  // control que suma no ve un defecto de pantalla. Cada columna del bloque dice qué es.
  if (g.nc0 && g.nc1 >= g.nc0) {
    // C = fecha de la nota · B y F/G = comprobantes, que son texto y no números con separador.
    fmt({ ...r(g.nc0 - 1, g.nc1, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.nc0 - 1, g.nc1, 1, 2) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt({ ...r(g.nc0 - 1, g.nc1, 4, 7) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }
  if (g.anu0 && g.anu1 >= g.anu0) {
    fmt({ ...r(g.anu0 - 1, g.anu1, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.anu0 - 1, g.anu1, 5, 6) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.anu0 - 1, g.anu1, 1, 2) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt({ ...r(g.anu0 - 1, g.anu1, 4, 5) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }
  // Los bloques documentales: comprobante y N° de cheque son TEXTO, y las fechas, fechas.
  for (const [a, b] of [[g.afip0, g.afip1], [g.emi0, g.emi1]]) {
    fmt({ ...r(a - 1, b, 1, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  }
  // EL BLOQUE 1 CAMBIÓ DE COLUMNAS al pasar a QUERY. Ahora:
  //   A fecha de pago (la que ordena) · B proveedor · C comprobante · D fecha factura
  //   E modalidad · F importe · G obra · H instrumento · I N° de cheque
  // La fecha SIN formato se ve como "46108" —el número de serie— y ya pasó seis veces en el
  // archivo: un control que suma no ve un defecto de pantalla.
  // LAS DOS TABLAS DE DEUDA SE FORMATEAN IGUAL. La de abajo —las que no tienen fecha de caja— derrama
  // las MISMAS columnas que la de arriba, así que si sólo se formatea la primera, la segunda hereda
  // el formato moneda de la columna entera y las fechas salen como "$46.198". Pasó, se vio en la
  // pantalla y por eso las dos van juntas en este bucle en vez de repetidas a mano.
  // ═══ EL FORMATO SIGUE AL ORDEN DE LAS COLUMNAS, Y ESTO YA FALLÓ UNA VEZ ═══
  //
  // Al unificar las pestañas, la tabla de deuda pasó a arrancar por Proveedor en vez de por Fecha de
  // pago. Los formatos quedaron donde estaban y el resultado fue mudo pero grave: el comprobante
  // "5-4163" cayó en una celda con formato de FECHA y se mostró como 826666 —el número de serie del
  // año 4163—, y la fecha de pago cayó en una de TEXTO y se mostró como 46108.
  //
  // Ninguno de los dos cambia un total en un peso, y por eso ningún control que suma los ve. Por eso
  // cada columna DECLARA su unidad acá, en el mismo orden que COL_DEUDA, en vez de repartirse en
  // cinco llamadas con índices sueltos.
  // ── BLOQUE 1: DEUDA AGRUPADA POR PROVEEDOR ──────────────────────────────────────────────────────
  // Columnas: A proveedor/(blanco) · B próximo pago/fecha · C cuenta/comprobante · D total/importe ·
  // E obra · F instrumento. La fila-cabecera de cada proveedor va en negrita tinta; las facturas de
  // abajo, normales, y el Sheet las pliega con el +/-.
  // ── LOS DOS BLOQUES VIVOS: EL FORMATO VA POR COLUMNA, PORQUE LAS FILAS NO EXISTEN ───────────────
  //
  // Antes se pintaba fila por fila (la cabecera de cada proveedor en negrita) porque las filas eran
  // físicas. Ahora el bloque es un derrame: las filas aparecen y desaparecen en cada recálculo, así que
  // el formato tiene que valer para TODA la reserva, exista o no un dato ahí. Cada columna declara su
  // unidad —fecha, moneda, texto— sobre el rango entero del bloque.
  const bloqueVivo = (ancla, fin, unidades) => {
    if (!ancla || !fin || fin < ancla) return
    const FTXT = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat'
    const NFMT = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment'
    // Piso: todo el bloque como texto chico. Después cada columna con unidad se corrige encima.
    fmt({ ...r(ancla - 1, fin, 0, ancho) }, FTXT, { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9 } })
    unidades.forEach((u, i) => {
      if (u === 'fecha') fmt({ ...r(ancla - 1, fin, i, i + 1) }, NFMT, { numberFormat: E.NUM.fecha, horizontalAlignment: 'LEFT' })
      if (u === 'moneda') fmt({ ...r(ancla - 1, fin, i, i + 1) }, NFMT, { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
      if (u === 'cantidad') fmt({ ...r(ancla - 1, fin, i, i + 1) }, NFMT, { numberFormat: E.NUM.cantidad, horizontalAlignment: 'CENTER' })
      // La nota derrama a la derecha en vez de cortarse a la mitad de una frase, como al margen de un
      // statement. Es la misma decisión que ya estaba tomada para la columna "Comentarios" del dueño.
      if (u === 'nota') fmt({ ...r(ancla - 1, fin, i, i + 1) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.textFormat',
        { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
    })
  }
  // El orden de las unidades es el de COLS_PROVEEDOR / COLS_FACTURA: es el mismo contrato que las fórmulas.
  bloqueVivo(g.provAncla, g.provFin, ['texto', 'fecha', 'cantidad', 'moneda', 'nota'])
  bloqueVivo(g.facAncla, g.facFin, ['texto', 'fecha', 'texto', 'moneda', 'texto', 'texto', 'texto'])
  // Los dos controles: un renglón que puede gritar, en cursiva y derramando, para que se lea completo.
  for (const c of [g.ctrlProv, g.ctrlFac]) {
    if (c) fmt({ ...r(c - 1, c, 0, ancho) }, 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.textFormat',
      { numberFormat: { type: 'TEXT' }, wrapStrategy: 'OVERFLOW_CELL', textFormat: { fontSize: 9, italic: true, foregroundColor: MUTED } })
  }
  // La libreta: es del dueño, así que sólo se le da unidad (texto) y su nota derrama.
  if (g.lib0 && g.lib1 >= g.lib0) {
    fmt({ ...r(g.lib0 - 1, g.lib1, 0, 1) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt({ ...r(g.lib0 - 1, g.lib1, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.textFormat',
      { numberFormat: { type: 'TEXT' }, wrapStrategy: 'OVERFLOW_CELL', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
  }

  // ── LOS DEFECTOS DE PANTALLA QUE ENCONTRÓ auditar-pantalla.mjs (21/07) ───────────────────────
  //
  // Todos son celdas que quedaron con el formato MONEDA que se aplica a la columna entera al
  // principio, y a las que nadie les devolvió el suyo. No cambian un total en un peso: hacen que la
  // pestaña se lea mal, que es lo que el dueño señaló tres veces. Ninguno los veía porque los
  // controles del archivo suman, y sumar no ve un encabezado con formato de plata.
  //
  // Los encabezados de las tablas de notas de crédito y de facturas anuladas: mostraban "Fecha",
  // "Importe" y "Qué es" como si fueran importes.
  for (const c of [g.cabNC, g.cabAnu, g.cabArca]) {
    if (c) encabezadoStmt(c, 0, 8)
  }
  // UNA CANTIDAD DE COMPROBANTES NO ES PLATA. La columna B del bloque de ARCA mostraba "$16" donde
  // dice cuántas facturas emitidas hay: el formato moneda de la columna entera se lo comía.
  if (g.fArcaN && g.fArcaVentas) fmt({ ...r(g.fArcaN - 1, g.fArcaVentas, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: E.NUM.cantidad, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.fSub, g.fSub + 1, 5, 6) }, 'userEnteredFormat', E.nota())
  // La columna de fecha del bloque de ARCA, que mostraba el serial como plata.
  fmt({ ...r(g.afip0 - 1, g.afip1, 3, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: E.NUM.fecha, horizontalAlignment: 'CENTER' })

  for (const [a, b] of [[g.afip0, g.afip1], [g.emi0, g.emi1]]) {
    fmt({ ...r(a - 1, b, 3, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  }
  fmt({ ...r(g.emi0 - 1, g.emi1, 5, 6) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 }, horizontalAlignment: 'LEFT' })
  for (const f of [g.cabDeudaProv, g.cabDeudaFac, g.cabLibreta, g.cabAfip, g.cabEmi]) {
    if (f) encabezadoStmt(f)
  }
  fmt({ ...r(g.fam0 - 1, g.totFam), startColumnIndex: 14, endColumnIndex: 15 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  // El bloque de control lleva explicación en la columna C: que no la formatee como plata.
  // ═══ EL CONTROL YA NO ES EL FINAL DE LA PESTAÑA — Y ESO ROMPÍA ARCA Y EMITIDAS ═══
  //
  // Este formato de TEXTO llegaba hasta `filas` (el fin de la pestaña) porque cuando se escribió, el
  // bloque de control era el último. Al partir la pestaña, ARCA (8) y las facturas emitidas (9)
  // quedaron DEBAJO del control, así que sus columnas de plata —el Monto de ARCA y el Importe
  // emitido— caían dentro de este rango y se mostraban como "155489181,6" y "208159104,8": el número
  // crudo, sin separador ni signo pesos. Se ve en el PDF y es exactamente lo que la regla 4 llama
  // impresentable. El TEXTO tiene que terminar donde termina el control: en el título del bloque 8.
  const finCtrl = g.cabArca ? g.cabArca - 2 : filas
  fmt({ ...r(g.ctrl - 1, finCtrl), startColumnIndex: 2, endColumnIndex: ancho }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true } })
  fmt(r(g.ctrl - 2, g.ctrl - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
  g.filas.forEach((f, i) => { if (/^⇒/.test(String(f[0] ?? ''))) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } }) })
  // UN CONTADOR NO ES PLATA. "46 facturas" dibujado como "$46" se lee como cuarenta y seis pesos.
  for (const f of g.cuentas) fmt(r(f - 1, f, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0" facturas"' } })
  if (g.fCompFecha) fmt(r(g.fCompFecha - 1, g.fCompFecha, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0" comprobantes"' } })
  // El plazo ponderado son días, no pesos. SE BUSCA POR SU RÓTULO, no por "la última fila": al partir
  // la pestaña dejó de ser la última (debajo quedaron ARCA y emitidas), así que `filas-1` formateaba
  // una celda vacía del final y el plazo real quedaba con formato moneda mostrando "$1" en vez de
  // "0,7 días". Otro defecto que sólo se ve en el PDF, no en un control que suma.
  const filaPlazo = g.filas.findIndex((f) => /^Plazo promedio ponderado/.test(String(f?.[0] ?? ''))) + 1
  if (filaPlazo > 0) fmt(r(filaPlazo - 1, filaPlazo, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0.0" días"' } })

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ancho }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  // La reja apagada es el mayor salto de "planilla" a "statement". Va con la columna congelada.
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1, hideGridlines: true } }, fields: 'gridProperties(frozenColumnCount,hideGridlines)' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

// Sólo corre cuando se invoca directo (node …/proveedores-materiales-pestana.mjs). Importarlo desde
// un test NO dispara main() —que toca Google y la base—: así el test puede probar los helpers puros.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
