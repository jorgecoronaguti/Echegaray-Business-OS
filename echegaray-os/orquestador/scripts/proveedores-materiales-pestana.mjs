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
import { bloqueControlArca, FILA_BLOQUE, MONTOS_BLOQUE } from '../lib/control-arca-bloque.mjs'
// "El mismo proveedor" se define UNA vez, en lib/: ver el comentario junto a RUBROS_COMERCIALES.
import { tituloDeSeccion } from '../lib/proveedores-titulos.mjs'
import { normNombre } from '../lib/razon-social.mjs'
import { NOMBRES } from '../lib/sheet-pestanas.mjs'
import { partir, mapaDeFilas, filasHuerfanas, referenciasFuera, ref as refPestana } from '../lib/partir-pestana.mjs'
import { anchosSegunContenido } from '../lib/nota-celda.mjs'
import { fusionar, sobrantes, VACIO, estructural } from '../lib/preservar-anotaciones.mjs'
import { obrasConMateriales } from '../lib/obras-con-materiales.mjs'
import { sumaNetaSheet } from '../lib/costo-materiales.mjs'
import { bloqueMaterialesPorObra } from '../lib/materiales-por-obra.mjs'
import { conEdicionesRespetadas, guardarRegistro, detectarArranqueEnFrio, autoRespetarReescritura, leerRegistro, esRotulo } from '../lib/respetar-ediciones.mjs'
// El respaldo de las notas por proveedor: sobrevive a que la lista de deuda cambie. Ver lib/proveedor-notas.mjs.
import { claveProv, conciliarNotas, leerNotas, guardarNotas, borrarNotas, marcarEscritas, yaEscritas } from '../lib/proveedor-notas.mjs'
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
// El libro de ARCA se limpia de repetidos EN EL ORIGEN, antes de derivar nada. Ver el lib: filtrar
// una derivación arregló la sección 4 y dejó Trielec repetido cuatro veces en la 3.
import { sinComprobantesRepetidos } from '../lib/arca-duplicados.mjs'
import { ARCA as N_ARCA, publicar, desalineados } from '../lib/rangos-nombrados.mjs'
// Los rótulos del bloque de cobertura y a qué nombre cuelga cada línea, en UN solo lugar: el que
// escribe la fila y el que la busca leen la misma constante. Ver el lib — la copia doble ya dejó
// dos nombres apuntando a un CUIT.
import { CABECERA_ARCA, LINEAS_ARCA, NOMBRES_ARCA, destinosDeArca, dondeViveCadaNombre } from '../lib/bloque-arca-nombres.mjs'
// Lo que el dueño YA decidió sobre un hallazgo puntual: se cuenta y se lista, pero no vuelve a
// ocupar la línea de aviso. Ver lib/decisiones-hallazgos.mjs.
import { CONTROLES, decidir, explicarDecisiones } from '../lib/decisiones-hallazgos.mjs'
import { query } from '../lib/db.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { INK, MUTED, HAIR } from '../lib/estilo-statement.mjs'
import { R, IMPORTE, arcaPorComprobante, totalLibro } from '../lib/arca-formula.mjs'
import { formatear as formatearCuit } from '../lib/cuit.mjs'
// El CUIT se cruza por RAZÓN SOCIAL contra ARCA, y sólo si es inequívoco. Ver lib/cuit-por-nombre.mjs.
import { emparejarCuit } from '../lib/cuit-por-nombre.mjs'
// La forma del cuadro de deuda se LEE de la grilla que se escribe, no se recuerda de antes.
import { bloqueDeDeuda, clasificarDeuda } from '../lib/deuda-geometria.mjs'
// Un texto nunca lleva formato de plata, y se decide por CONTENIDO. Ver el lib: la lista de defectos
// cambiaba en cada corrida porque se mantenían rangos por bloque en vez de mirar la celda.
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
// HASTA DÓNDE LLEGA LA MANO DE ESTE GENERADOR. Las secciones 1 y 2 de "Proveedores" son tablas
// dinámicas nativas que hacen otros scripts: acá se calcula la FRONTERA —la fila del primer bloque
// propio— y se escribe de ahí para abajo, nunca por encima. Ver lib/proveedores-frontera.mjs.
import {
  SECCIONES_MATERIALES, PRIMERA_GENERADA, nSeccion, fronteraSegura, finDeDinamica,
  anclasDeDinamicas, verificarFronteraBajoDinamicas, anchoALimpiar, aAnchoCompleto,
  ANCHOS_PROVEEDORES,
} from '../lib/proveedores-frontera.mjs'
import { parrafosQueNoEntran } from '../lib/proveedores-rotulos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = NOMBRES.proveedoresMateriales
// EL TÍTULO DEL PRIMER BLOQUE QUE ESCRIBE ESTE GENERADOR — la FRONTERA de la pestaña "Proveedores".
// Es UNA sola constante: la usa el `push` que lo escribe y la usa `buscarFrontera` para encontrarlo
// en la pestaña. Si fueran dos textos, el día que cambie uno la frontera dejaría de aparecer y —bien—
// no se escribiría nada, pero por el motivo equivocado.
const TITULO_FRONTERA = 'NOTAS DE CRÉDITO'
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
// ═══ CÓDIGO QUE SE CALCULA PARA TIRARSE, Y POR QUÉ SIGUE ACÁ (05/08) ═══
//
// `TOP`, `deudaAgrupada` y el renglón del "resto" arman las secciones 1 y 2 como TEXTO. Desde que
// las dos son tablas dinámicas nativas, el tramo que las contiene queda ARRIBA de la frontera y se
// descarta al partir: se calcula entero en cada corrida y no llega al archivo. Sacarlo sería lo
// correcto, y NO se saca en este pase porque no es un borrado: `deudaAgrupada` alimenta también
// `deudaGrupos`, el rango con nombre `$TOTPROV`, los grupos +/- de la pestaña y la conciliación de
// notas del dueño, repartidos en 2.200 líneas. Es un refactor con riesgo propio —el de romper lo que
// sí se escribe— y merece su propio pase, con su propia verificación contra el archivo.
//
// Lo que cuesta dejarlo: tiempo de CPU y confusión al leer. Lo que costaría sacarlo mal: el cuadro
// de deuda del dueño. Mientras siga acá, la regla es que NADIE agregue nada nuevo a este tramo.
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
// El CUIT que el OS resuelve en Compras (proveedores-cuenta-corriente.mjs). Se lee para CONTAR los
// que faltan: un hueco se cuenta una vez, no se rotula "(falta)" en sesenta filas de la vista.
let COL_CUITOS = 'Compras!$AM$4:$AM'
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
const COL_FACTURA = 'Compras!$C$4:$C'
const COL_TOTAL = 'Compras!$O$4:$O'
// EL NETO Y EL IVA — LAS DOS COLUMNAS QUE EL **COSTO** DE MATERIALES NECESITA Y LA DEUDA NO.
//
// Esta pestaña mide dos cosas distintas con la misma palabra y por eso convivían dos criterios:
//   · lo que se DEBE a un proveedor → "Total" (O), con IVA: es la plata que va a salir.
//   · lo que COSTÓ el material (por familia, por mes, por obra) → NETO, porque el IVA es crédito
//     fiscal y la venta contra la que se compara también se mide neta.
// La regla del neto vive UNA sola vez, en lib/costo-materiales.mjs, y OBRAS emite la misma.
let COL_NETO = 'Compras!$M$4:$M'
let COL_IVA = 'Compras!$N$4:$N'
const COL_PROV = 'Compras!$E$4:$E'
const COL_ESTADO = 'Compras!$X$4:$X'
const CH = "'Cheques Emitidos'"

/** Índices (0-based) de las columnas de Compras que el JS lee de cada fila. Se recalculan por nombre. */
const IDX = { rubro: 28, fechaCaja: 29, familia: 30, comercial: 35, pagado: 19, parcial1: 20, parcial2: 22, tipoPago: 15, obra: 9, prov: 4, neto: 12, iva: 13, total: 14, estado: 23, concepto: 11, detalle: 10 }


/** Los rubros que hacen que un proveedor sea COMERCIAL. Sueldos, ARCA o el banco no son proveedores
 *  a los que se les pueda pedir plazo, y mezclarlos tapa a los que sí. */
const RUBROS_COMERCIALES = [...RUBROS_CON_FAMILIA, 'Estructura', 'Servicios recurrentes']

// "EL MISMO PROVEEDOR" SE DEFINE UNA SOLA VEZ (05/08).
//
// Ac\u00e1 viv\u00eda una copia local de la normalizaci\u00f3n ("ALUMETAL S A" = "Alumetal"). Cuando el control de
// ARCA de las otras pesta\u00f1as empez\u00f3 a usar la de `lib/razon-social.mjs`, las dos copias produjeron
// dos listas distintas de "facturado que Compras no tiene": la pesta\u00f1a mostraba ARCA_FALTAN_MONTO y
// remit\u00eda a un detalle calculado con OTRO criterio. Dos cifras parecidas con nombres parecidos es
// exactamente lo que hace desconfiar del archivo.
//
// La compartida adem\u00e1s reconoce S.A.U. y S.H., que la local no: el cambio no s\u00f3lo unifica, corrige.
// Puede mover levemente ARCA_FALTAN_MONTO \u2014 hay que mirarlo renderizado.
// (el import est\u00e1 arriba, con los dem\u00e1s)

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/** El costo NETO de los materiales que cumplen `criterios`, como sub-expresión (sin '='). */
const netoExpr = (criterios) => sumaNetaSheet({ neto: COL_NETO, iva: COL_IVA, total: COL_TOTAL, criterios })
/** Lo mismo, como celda. */
const netoMateriales = (criterios) => `=${netoExpr(criterios)}`

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

// LIMPIA EL FOOTPRINT DE UNA FILA ESTRUCTURAL — la que el generador es dueño de punta a punta (los
// TOTALES y el encabezado/conteos de ARCA). Nació acá, pero el mismo defecto estaba sin curar en
// Recurrentes y en Estructura, así que la definición se mudó a `lib/preservar-anotaciones.mjs` —donde
// vive el centinela— y las tres pestañas usan una sola. Se re-exporta porque el test de este script la
// importa de acá.
export { estructural }

// ═══ LA COLUMNA E NO LA ESCRIBEN LAS TABLAS DE TEXTO ═══
//
// Separa los dos cuadros de la posición, así que las tablas de la frontera para abajo la SALTEAN:
// A·B·C·D · F·G. Ver ANCHOS_PROVEEDORES — donde también está por qué la E dejó de medir 28px: la
// dinámica del cuadro de detalle sí la ocupa (un pivot no puede saltear columnas) y con esa raja el
// tipo de pago salía cortado en cinco caracteres, veinticuatro veces.
//
// Se escribe con este nombre y no con un '' pelado por dos razones. Una: un '' en el medio de una
// fila se lee como un campo que alguien olvidó llenar, y el próximo que toque esta tabla lo va a
// "arreglar" metiendo un dato ahí. Dos: `estructural` lo convierte en el centinela VACIO, así que la
// celda queda declarada como MÍA y vacía — si una corrida anterior escribió algo ahí, se limpia en
// vez de quedar clavado.
const AIRE = ''

/** `anchoObras` es una CANTIDAD de columnas, no un número de fila: traducirlo lo rompería. */
const NO_ES_FILA = new Set(['anchoObras'])

/**
 * LOS MARCADORES DE LA GRILLA, LLEVADOS A LAS FILAS REALES DE UNA PESTAÑA.
 *
 * `g` trae ~40 marcadores (`fArcaN`, `fam0`, `cabAfip`, …) en coordenadas de la grilla ANTES de
 * partirla en dos pestañas. De ellos salen dos cosas que tienen que coincidir con la fila donde el
 * dato quedó escrito de verdad: dónde formatea cada bloque y a qué celda apunta cada rango con
 * nombre. El que no pertenece a esta pestaña da `null` — no se formatea ni se publica.
 *
 * ═══ POR QUÉ DELEGA EN `mapaDeFilas` Y NO REHACE LA CUENTA (05/08) ═══
 *
 * Porque la rehacía, y le faltaba un caso. El bucle inline hacía `f - t.desde + t.desdeFila`, y el
 * tramo de "Materiales" NO declara `desdeFila` —arranca en la fila 4, como cualquier pestaña propia
 * del generador, y ese 4 vive en las opciones de `partir`—. Resultado: `undefined` en la suma, `NaN`
 * en los ~20 marcadores de Materiales, `null` en el JSON de la API y un `startRowIndex` ausente, que
 * para Sheets significa "desde el principio de la hoja". El formato de un bloque cayendo sobre la
 * pestaña entera, sin un solo error.
 *
 * `partir` reubica las FÓRMULAS con la misma cuenta. Si las dos discrepan, el nombre apunta a una
 * fila y el dato está en otra: exactamente el defecto que este archivo tiene que evitar.
 *
 * @param {Record<string, unknown>} g la grilla con sus marcadores
 * @param {Array<{titulo:string, desde:number, hasta:number, desdeFila?:number}>} tramos
 * @param {string} titulo la pestaña cuyos marcadores se quieren
 * @param {{desdeFila?:number}} [opts] la fila de arranque por defecto — la misma que recibe `partir`
 */
export function traducirMarcadores(g, tramos, titulo, { desdeFila = 1 } = {}) {
  const donde = mapaDeFilas(tramos, { desdeFila })
  const t = (n) => { const d = donde.get(n); return d && d.titulo === titulo ? d.fila : null }
  const out = {}
  for (const [k, v] of Object.entries(g || {})) {
    if (NO_ES_FILA.has(k) || k === 'marcas' || k === 'filas') out[k] = v
    else if (typeof v === 'number') out[k] = t(v)
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v.map(t).filter(Boolean)
    else out[k] = v
  }
  return out
}

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
    // LA COLUMNA DE COMENTARIOS. No entra en `propias` (las que el generador manda): sigue siendo del
    // dueño y se re-ancla por proveedor. El índice hace falta para rellenarla desde el respaldo de
    // notas cuando quedó vacía — ver ponerDelRespaldo y lib/proveedor-notas.mjs.
    nota: cual(/comentario/i),
  }
}

/**
 * PREDICADO VIVO DE DEUDA — HACE QUE LA FILA-CABECERA DE UN PROVEEDOR DESAPAREZCA SOLA CUANDO SE LO PAGA.
 *
 * EL BUG QUE ARREGLA (28/07). La fila-cabecera de cada proveedor se materializa en JS: su NOMBRE era un
 * texto fijo y sólo el importe una fórmula. Al pasar el proveedor a estado "Pagado" en Compras, el
 * importe caía a 0 —se veía "−"— pero el nombre seguía escrito, así que el proveedor ya pagado quedaba
 * LISTADO igual, con un guión. El dueño lo marcó: "un proveedor sin deuda pendiente NO se lista".
 *
 * La cura es envolver cada celda de la cabecera en IF(hayDeuda; valor; "") con este predicado, de modo
 * que la fila entera quede VACÍA en el mismo instante en que cambia el estado en Compras —sin esperar a
 * que corra el agente cada 2 h—. `estado ≠ Pagado` ya lo garantiza condProv (filtra ESTADO_DEUDA =
 * "Pendiente"); esto agrega `saldo > 0` sobre el saldo NETO (Total − pagos), que es exactamente el mismo
 * número que suma el importe de la fila. Así el cuadro lista SÓLO proveedores con saldo pendiente > 0.
 *
 * @param {string} netaExpr saldo neto del proveedor (sin el `=`), tal como lo arma neta()
 * @returns {string} un predicado booleano para usar dentro de un IF de Sheets
 */
export const predicadoConDeuda = (netaExpr) => `ROUND(${netaExpr};0)>0`

/**
 * ENVUELVE EL VALOR DE UNA CELDA-CABECERA para que quede VACÍA cuando el proveedor no tiene deuda
 * pendiente. Con `texto:true` el valor es el NOMBRE del proveedor y entra como literal de cadena
 * (comillas escapadas); si no, es una subexpresión de fórmula (próximo pago, conteo de facturas,
 * importe), a la que se le quita el `=` inicial para anidarla dentro del IF.
 *
 * Es-AR: usa `;` como separador de argumentos y `""` como valor vacío — ninguna coma nueva, para que
 * el localizador de fórmulas no la confunda con un decimal.
 *
 * @param {string} pred predicado de predicadoConDeuda()
 * @param {string} valor el nombre (texto) o la subexpresión de fórmula
 * @param {{texto?:boolean}} [opts]
 * @returns {string} una fórmula `=IF(pred; valor; "")`
 */
export const soloConDeuda = (pred, valor, { texto = false } = {}) =>
  texto
    ? `=IF(${pred};"${String(valor).replace(/"/g, '""')}";"")`
    : `=IF(${pred};${String(valor).replace(/^=/, '')};"")`

function grilla({ obras, proveedores, resto, deudaAgrupada, faltanEnCompras, notasCredito, anuladasCargadas, cruce, deudaCols, deudaPrevio, notasBase = new Map() }) {
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  const nombres = FAMILIAS.map(([n]) => n)
  const meses = Array.from({ length: 12 }, (_, m) => `1/${m + 1}/${AÑO}`)

  push([`PROVEEDORES Y MATERIALES ${AÑO}`])
  // SIN EL "738": era un número pegado en una frase —el día que Compras tenga 900 filas, miente— y
  // además empujaba el párrafo por encima de lo que entra en la pestaña.
  push(['Las mismas filas de Compras vistas de los dos lados: a quién le compro y a quién le debo. Todo por fecha de PAGO, no de factura. Ningún importe escrito: son fórmulas sobre Compras y Cheques Emitidos, así que se corrige allá y cambia solo.'])
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
  const b1 = push([tituloDeSeccion('deuda')])
  // AVISO VIVO DE DESFASAJE. El detalle de abajo son filas físicas: existen cuando corre el agente.
  // Los IMPORTES son fórmulas y se mueven solos, pero una factura de un proveedor NUEVO no tiene fila
  // hasta la próxima corrida. Esta línea compara —en vivo— el total real contra la suma de lo listado
  // y avisa el hueco, para que el cuadro nunca engañe aunque esté desactualizado. Se llena más abajo,
  // cuando el bloque ya tiene coordenadas.
  // Sin subtítulo de prosa: la tabla se explica sola (menos es más). Fila en blanco de respiro.
  push([])
  // Las columnas son las que el dueño dejó en la pestaña (nombre y orden). Ver layoutDeuda.
  const L = layoutDeuda(deudaCols)
  // Las notas del dueño vuelven a SU proveedor / SU comprobante, no a la fila donde estaban.
  const NOTAS = notasAncladas(deudaPrevio || [], L)
  // EL BLOQUE ES DUEÑO DE TODO SU ANCHO, no sólo de las columnas rotuladas. Ver anchoBloque(): el dueño
  // escribe más a la derecha de lo que rotuló, y lo que el generador no marca con VACIO la fusión lo deja
  // clavado en la FILA FÍSICA — con la lista reordenada eso le pone a un proveedor los números de otro
  // (incidente del 30/07). Cada celda del bloque nace VACIO y sólo sobrevive lo que se RE-ANCLA a su
  // proveedor / comprobante: así una nota viaja con la entidad de la que habla, y un residuo no viaja.
  const ANCHO = anchoBloque(L.cols, deudaPrevio)
  const celdas = () => Array.from({ length: ANCHO }, () => VACIO)
  // Toda nota re-anclada se marca como USADA: la que no encuentra a su proveedor se reporta al final en
  // vez de desaparecer sin decirlo. Un dato del dueño no se pierde en silencio.
  const usadas = new Set()
  const ponerNotas = (arr, mapa, clave) => {
    const k = String(clave ?? '').trim().toLowerCase()
    const extra = mapa.get(k)
    if (extra) { usadas.add(`${mapa === NOTAS.porProveedor ? 'p' : 'c'}|${k}`); for (const [j, v] of extra) arr[j] = v }
    return arr
  }
  // ═══ LA NOTA VUELVE DEL RESPALDO SI LA PESTAÑA NO LA TIENE ═══
  //
  // "recien puse pagado en compras y no borro el agrupar segun corresponde". Cuando un proveedor se
  // paga sale de la lista, y con la nota viviendo SÓLO en la columna Comentarios, pagarle borraba lo
  // que el dueño escribió sobre él (le pasó a FEMENIA). Ahora la nota vive en public.proveedor_notas y
  // vuelve sola cuando el proveedor reaparece. Lo que él escribe en la pestaña sigue ganando: esto
  // rellena únicamente la celda que quedó VACÍA.
  const notasPuestas = new Set()
  const ponerDelRespaldo = (arr, nombre) => {
    if (L.nota < 0) return arr
    const ya = String(arr[L.nota] ?? '')
    if (ya && ya !== VACIO) return arr        // lo que él escribió manda
    const clave = claveProv(nombre)
    const guardada = notasBase.get(clave)
    if (guardada?.nota) { arr[L.nota] = guardada.nota; notasPuestas.add(clave) }
    return arr
  }
  const fAviso = push([])
  const cabDoc = push([...L.cols])
  const deudaGrupos = []
  const deudaHeaders = []
  const qLit = (s) => String(s ?? '').replace(/"/g, '""')
  for (const gp of deudaAgrupada) {
    const key = qLit(gp.nombre)
    const condProv = `${COL_PROV};"${key}";${COL_ESTADO};"${ESTADO_DEUDA}"`
    const conFecha = `${condProv};${COL_FECHA};">0"`
    // Fila-cabecera del proveedor: total NETO (Total − Monto Pagado) y próximo pago por fórmula viva.
    // Es la que queda a la vista cuando el grupo está colapsado; las facturas se pliegan debajo.
    // CADA CELDA SE GATEA CON `predicadoConDeuda`: si el saldo neto del proveedor no es > 0 (lo pagaron,
    // o sus notas de crédito lo cubren), la fila-cabecera queda VACÍA sola. Sin esto el proveedor pagado
    // seguía listado con un "−". La lista muestra SÓLO proveedores con saldo pendiente > 0, en vivo.
    const netaProv = neta(condProv)
    const pred = predicadoConDeuda(netaProv)
    const hCel = celdas()
    hCel[L.prov] = soloConDeuda(pred, gp.nombre, { texto: true })
    if (L.fecha >= 0) hCel[L.fecha] = soloConDeuda(pred, `IF(COUNTIFS(${conFecha})=0;"sin fecha";MINIFS(${COL_FECHA};${conFecha}))`)
    if (L.comp >= 0) hCel[L.comp] = soloConDeuda(pred, `COUNTIFS(${COL_PROV};"${key}";${COL_ESTADO};"${ESTADO_DEUDA}";${COL_TOTAL};"<>")&" fac."`)
    if (L.imp >= 0) hCel[L.imp] = soloConDeuda(pred, netaProv)
    ponerNotas(hCel, NOTAS.porProveedor, gp.nombre)
    ponerDelRespaldo(hCel, gp.nombre)
    const hRow = push(hCel)
    deudaHeaders.push(hRow)
    const inicio = filas.length + 1
    for (const inv of gp.filas) {
      const rr = inv.fila
      const rowNum = filas.length + 1
      const pend = `Compras!$X$${rr}="${ESTADO_DEUDA}"`
      // Cada factura referencia SU fila de Compras; si allá se marca pagada, la celda se vacía sola.
      // Cada dato va a LA COLUMNA QUE EL DUEÑO ROTULÓ. Las que él agregó y el generador no llena
      // —"Comentarios"— quedan vacías: la fusión conserva lo que escribió ahí.
      const c = celdas()
      if (L.fecha >= 0) c[L.fecha] = `=IF(${pend};Compras!$${letra(IDX.fechaCaja)}$${rr};"")`
      if (L.comp >= 0) c[L.comp] = `=IF(${pend};Compras!$H$${rr}&"";"")`
      // Saldo de ESTA factura = Total − pagado. Pagado = T + los positivos de U y W (MAX(0;·) descarta
      // el saldo negativo/entre paréntesis, que no es un pago). Misma regla que neta(), fila a fila.
      if (L.imp >= 0) c[L.imp] = `=IF(${pend};Compras!$O$${rr}-Compras!$${letra(IDX.pagado)}$${rr}-MAX(0;Compras!$${letra(IDX.parcial1)}$${rr})-MAX(0;Compras!$${letra(IDX.parcial2)}$${rr});"")`
      if (L.obra >= 0) c[L.obra] = `=IF(${pend};Compras!$J$${rr};"")`
      if (L.instr >= 0 && L.comp >= 0) {
        const cc = `$${letra(L.comp)}${rowNum}`
        c[L.instr] = `=IF(NOT(${pend});"";IF(${cc}="";"—";IFERROR(INDEX(${CH}!$A$2:$A;MATCH(${cc};${CH}!$H$2:$H;0))&" "&INDEX(${CH}!$B$2:$B;MATCH(${cc};${CH}!$H$2:$H;0));"—")))`
      }
      // Tipo de pago (Compras col P) y Categoría (Compras col B), de la misma fila de Compras.
      if (L.pago >= 0) c[L.pago] = `=IF(${pend};Compras!$P$${rr}&"";"")`
      if (L.cat >= 0) c[L.cat] = `=IF(${pend};Compras!$B$${rr}&"";"")`
      ponerNotas(c, NOTAS.porComprobante, inv.comprobante)
      push(c)
    }
    deudaGrupos.push({ inicio, fin: filas.length })
  }
  const cabDocFin = filas.length
  // El aviso, ahora que el bloque tiene coordenadas. Todo por fórmula: el hueco se calcula solo.
  {
    const cA = `$${letra(L.prov)}$${cabDoc + 1}:$${letra(L.prov)}$${cabDocFin}`
    const cD = `$${letra(L.imp)}$${cabDoc + 1}:$${letra(L.imp)}$${cabDocFin}`
    // Sólo las filas-cabecera tienen nombre en la primera columna: SUMIF sobre ellas da lo LISTADO.
    const falta = `(${neta(condComercial)})-SUMIF(${cA};"?*";${cD})`
    const listadasN = deudaAgrupada
      .map((gp) => `COUNTIFS(${COL_PROV};"${qLit(gp.nombre)}";${COL_ESTADO};"${ESTADO_DEUDA}";${COL_TOTAL};"<>")`)
      .join('+') || '0'
    const totalN = `COUNTIFS(${COL_ESTADO};"${ESTADO_DEUDA}";${COL_COMERCIAL};1;${COL_TOTAL};"<>")`
    const avisoFila = L.cols.map(() => VACIO)
    avisoFila[0] = `=IF(ROUND(${falta};0)=0;"";"⚠ Faltan "&TEXT((${totalN})-(${listadasN});"0")&" factura(s) por "&TEXT(${falta};"$#,##0")&" que este listado todavía no muestra — aparecen cuando corre el agente. El total de arriba ya las cuenta.")`
    filas[fAviso - 1] = avisoFila
  }
  push([])

  // ── 2 · CUENTA CORRIENTE POR PROVEEDOR — EL PERFIL, NO LA DEUDA ──────────────────────────────────
  // La DEUDA de cada proveedor está ARRIBA (bloque 1, agrupada con el +/-). Acá va sólo el PERFIL: con
  // quién se gasta, cuánto, si AFIP tiene más facturado de lo cargado, y con qué plazo paga. Se sacaron
  // las diez columnas de deuda que repetían el bloque de arriba (regla 9) y hacían de esto una pared de
  // dieciséis columnas ilegible. Menos es más: siete columnas, cada una con un trabajo.
  const b2 = push([tituloDeSeccion('cuentaCorriente')])
  push(['Con quién se gasta y con qué plazo. El plazo —días entre factura y pago— es el dato clave: pagar a 0 días empuja al descubierto al 62,78% anual cuando el crédito del proveedor es gratis. La deuda de cada uno está arriba, agrupada. Sólo comerciales.'])
  const cabProv = push(['Proveedor', 'CUIT', 'Comprobantes', `Comprado ${AÑO}`, 'Plazo promedio', 'Qué se le compra'])
  const p0 = filas.length + 1
  // LAS CELDAS VACÍAS DE ESTE BLOQUE LLEVAN CENTINELA, NO ''. Las seis columnas de la cuenta corriente
  // son todas del generador: el dueño no escribe acá. `fusionar` interpreta '' como "el generador no
  // tiene nada en esta celda" y CONSERVA lo que hubiera antes — así sobrevivió el texto "CUIT" de un
  // encabezado de otro diseño metido en la fila de Mariana SA y en la del subtotal. El centinela dice
  // "es mía y va vacía", que es la verdad.
  for (const p of proveedores) {
    const f = filas.length + 1
    push([
      p.nombre,
      p.cuit ? formatearCuit(p.cuit) : VACIO,
      // Cuántos comprobantes (facturas) emitió el proveedor en el año — el dueño lo pidió de vuelta.
      `=COUNTIF(${COL_PROV};$A${f})`,
      `=SUMIF(${COL_PROV};$A${f};${COL_TOTAL})`,
      // EL PLAZO REAL: días entre la fecha de factura y la fecha en que salió la plata, por SUMPRODUCT.
      `=IFERROR(SUMPRODUCT((${COL_PROV}=$A${f})*ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0)))/SUMPRODUCT((${COL_PROV}=$A${f})*ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA}));"")`,
      p.familia,
    ])
  }
  const p1 = filas.length
  const fSub = push([`Subtotal de estos ${proveedores.length}`, VACIO, `=SUM($C${p0}:$C${p1})`, `=SUM($D${p0}:$D${p1})`, VACIO, VACIO])
  push([`Resto de proveedores comerciales (${resto.cantidad})`, VACIO, VACIO, `=$D$TOTPROV-$D${fSub}`, VACIO, 'ninguno llega al 1% del total'])
  const fTotProv = push(['TOTAL PROVEEDORES COMERCIALES', VACIO,
    `=COUNTIFS(${COL_ESTADO};"<>";${COL_COMERCIAL};1)`,
    RUBROS_COMERCIALES.map((r) => `SUMIF(${COL_RUBRO};"${r}";${COL_TOTAL})`).join('+').replace(/^/, '='),
    '', ''])
  push([])

  // ── 5 · LAS NOTAS DE CRÉDITO ────────────────────────────────────────────────────────────────
  // La pregunta que el libro de IVA NO contesta: una nota de crédito puede ser una DEVOLUCIÓN (el
  // costo de la obra baja de verdad) o una REFACTURACIÓN (el costo sigue, sólo cambió de número y
  // de mes). Las dos son "tipo 3". Ver lib/notas-credito.mjs.
  // EL NÚMERO NO SE ESCRIBE A MANO: sale de SECCIONES_PROVEEDORES, donde las dinámicas ocupan el 1 y
  // el 2. Antes decía "5" acá y la pestaña mostraba "3", porque una renumeración al momento de
  // escribir lo corregía: dos lugares diciendo el mismo número es un lugar de más.
  const b5 = push([`${nSeccion(PRIMERA_GENERADA)} · ${TITULO_FRONTERA}`])
  push(['Una nota de crédito puede significar dos cosas opuestas y el libro de IVA las escribe igual. Si el proveedor volvió a facturar, el costo SIGUE: cambió de número y casi siempre de mes. Darlo por ahorrado es el error caro. Se cruza contra el mismo CUIT.'])
  // ═══ SIETE CAMPOS EN SEIS COLUMNAS, Y EL QUE SOBRABA NO HACÍA FALTA (04/08) ═══
  //
  // La columna E es el aire de la pestaña (28px, separador de los dos cuadros de la posición) y
  // ninguna tabla la usa: ver ANCHOS_PROVEEDORES. Eso deja A·B·C·D·F·G para una tabla que tenía siete
  // campos. El que se fue no se recortó a la fuerza: "Anula la factura" y "La reemplaza" son UN hecho
  // —esta nota anula la 0004-00002971 y la reemplaza por la 0006-00003002—, y leerlo partido en dos
  // columnas obligaba a cruzarlas con la vista. Ahora es una sola: "0004-00002971 → 0006-00003002".
  const cabNC = push(estructural(['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', AIRE, 'Qué es', 'Anula → la reemplaza', '', '']))
  const nc0 = filas.length + 1
  // El IMPORTE sale del libro por CUIT + número; lo que el OS aporta es la CLASIFICACIÓN (devolución
  // o refacturación), que no está en ningún libro y es criterio, no dato.
  //
  // ═══ POR QUÉ VA `estructural` Y NO UN '' PELADO (04/08) ═══
  //
  // El dueño lo vio: una nota de crédito de Trielec repetida tres veces, con "Anula la factura" y "La
  // reemplaza" mostrando comprobantes de OTRO proveedor. No era un cruce mal hecho: eran RESTOS. Una
  // nota que hoy no anula nada trae `n.anula` vacío, y un '' significa "esta celda no es mía,
  // conservá lo que había" — así que la fusión dejaba clavado el valor de la corrida anterior, que
  // pertenecía al proveedor que ocupaba esa fila física antes. Estas filas son del generador de punta
  // a punta: su vacío es SUYO y se limpia.
  for (const n of notasCredito) {
    const f = filas.length + 1
    const cadena = [n.anula, n.reemplaza].filter(Boolean).join(' → ')
    push(estructural([n.proveedor, n.comprobante, n.fecha, arcaPorComprobante(`"${n.cuit ?? ''}"`, `$B${f}`, '-1'), AIRE, n.que, cadena, '', '']))
  }
  const nc1 = filas.length
  push(estructural(['TOTAL ACREDITADO', '', '', `=SUM($D${nc0}:$D${nc1})`, '', '', '', '', '']))
  push([])

  // ── 4 · LO QUE ARCA FACTURÓ Y COMPRAS NO TIENE ──────────────────────────────────────────────────
  //
  // ═══ ACÁ SE FUSIONÓ LA VIEJA SECCIÓN "LA PLOMERÍA" ═══
  //
  // Eran dos secciones contestando la misma pregunta: una decía "56 comprobantes sin cargar" en forma
  // de lista y la otra, veinte filas más abajo, decía "56 · $15.518.622" en forma de cifra. Un cuadro
  // que se explica en dos lugares se contradice en uno de los dos. Ahora el control de cobertura
  // ENCABEZA la lista: primero cuánto de lo que ARCA registró está cargado y cuánto no, y debajo el
  // detalle de lo que falta. El control se lee de una sola pasada y decide una sola cosa: cargar.
  const b6 = push([`${nSeccion('faltanEnCompras')} · LO QUE ARCA FACTURÓ Y COMPRAS NO TIENE — ${faltanEnCompras.length} comprobantes`])
  const cabArca = push(estructural([CABECERA_ARCA, 'Comprobantes', 'Monto', '', '', '', '', '', '']))
  // EL RÓTULO SALE DE `LINEAS_ARCA`, NO DE UN LITERAL ACÁ. Es el mismo texto que después busca el
  // reapuntado de los rangos con nombre: escrito dos veces, se desincronizó (el "SIN" en mayúsculas
  // que dejó ARCA_SIN_NUMERO_* apuntando a un CUIT durante días).
  const rotuloArca = (nombre) => LINEAS_ARCA.find((l) => l.n === nombre).texto
  // LOS QUE SALEN DEL LIBRO VAN COMO FÓRMULA sobre _ARCA_RAW: se carga un comprobante en ARCA, el
  // agente refresca la réplica y estos números se mueven solos.
  const cuentaArca = (libro, signo) => `=SUMPRODUCT((${R}!$B$4:$B="${libro}")*(${R}!$F$4:$F=${signo}))`
  const fArcaN = push(estructural([rotuloArca(N_ARCA.comprobantes),
    cuentaArca('Compras', 1), totalLibro('Compras'), '', '', '', '', '', '']))
  const fArcaNotas = push(estructural([rotuloArca(N_ARCA.notasN),
    cuentaArca('Compras', -1), `=SUMPRODUCT((${R}!$B$4:$B="Compras")*(${R}!$F$4:$F=-1)*${IMPORTE})`, '', '', '', '', '', '']))
  // ═══ ESTOS DOS NO PUEDEN SER UNA FÓRMULA, Y ES IMPORTANTE DECIRLO ═══
  //
  // Salen del algoritmo de conciliación del OS (lib/cobertura-arca.mjs): cruza cada comprobante de
  // ARCA contra Compras por número normalizado y, cuando el número no está cargado, por proveedor +
  // importe. Esa normalización —quitar ceros, guiones y espacios de formatos que se escribieron de
  // seis maneras distintas— no se puede escribir en una fórmula de Sheets sin que dé un número
  // DISTINTO al real, y un número parecido pero equivocado es peor que uno declarado.
  //
  // Se pegan, y se declaran AL PIE DE LA SECCIÓN, una sola vez. Antes cada una llevaba su declaración
  // en la columna I: dos párrafos sueltos derramados a la derecha de la tabla, que en el PDF se leen
  // como basura. Una explicación que se repite fila por fila es una explicación mal ubicada.
  const fArcaEn = push(estructural([rotuloArca(N_ARCA.enComprasN), cruce.porNumero.length, cruce.totales.porNumero, '', '', '', '', '', '']))
  const fArcaSinNum = push(estructural([rotuloArca(N_ARCA.sinNumeroN), cruce.porImporte.length, cruce.totales.porImporte, '', '', '', '', '', '']))
  // Los que faltan sí tienen fórmula: son exactamente las filas de la tabla de abajo.
  const fArcaFaltan = push(estructural([rotuloArca(N_ARCA.faltanN), '', '', '', '', '', '', '', '']))
  // LA CIFRA DE VENTAS SE QUEDA, EL DETALLE NO. Alimenta ARCA_VENTAS_N/MONTO, que consume el Cash
  // Flow Mensual por rango con nombre; su detalle —el cruce contra Cobranzas— es de Cobranzas.
  const fArcaVentas = push(estructural([rotuloArca(N_ARCA.ventasN),
    cuentaArca('Ventas', 1), totalLibro('Ventas'), '', '', '', '', '', '']))
  push([])
  // El importe salta a la F por la misma razón: la E es el aire de la pestaña y mide 28px — ahí es
  // donde "$970.226" se veía como "$970".
  const cabAfip = push(estructural(['Proveedor según ARCA', 'CUIT', 'Comprobante', 'Fecha', AIRE, 'Importe', '', '', '']))
  const afip0 = filas.length + 1
  for (const r of faltanEnCompras) {
    const f = filas.length + 1
    push(estructural([r.nombre, r.cuit ? formatearCuit(r.cuit) : '', r.comprobante, r.fecha, AIRE,
      r.cuit ? arcaPorComprobante(`$B${f}`, `$C${f}`, '1') : r.importe, '', '', '']))
  }
  const afip1 = filas.length
  push(estructural(['TOTAL SIN CARGAR', '', '', '', AIRE, `=SUM($F${afip0}:$F${afip1})`, '', '', '']))
  // Ahora que las filas de la tabla existen, la línea del control las cuenta. Se escribe acá porque
  // una fórmula que se apunta a sí misma antes de que su rango exista es el defecto de "un nombre no
  // se reapunta a una grilla que todavía no se escribió".
  filas[fArcaFaltan - 1][1] = `=COUNTIF($A$${afip0}:$A$${afip1};"<>")`
  filas[fArcaFaltan - 1][2] = `=SUM($F$${afip0}:$F$${afip1})`
  push([])
  // 306 CARACTERES NO ENTRAN EN NINGÚN ANCHO. El auditor lo reportaba como A261 cortado: la frase
  // terminaba en "…que el OS replica en" y el resto no se leía. Ensanchar no es una opción —la fila
  // ya derrama sobre la pestaña entera— así que se escribe menos. Tope: ver `caracteresQueEntran`.
  push([`Del libro de IVA de ARCA, que el OS replica en ${R}. "Cargados por proveedor + importe" y "sin cargar" son conciliación del OS al ${new Date().toISOString().slice(0, 10)}, no fórmula: normaliza seis formas de escribir un N° de comprobante. Sheets no sabe.`])
  push([])

  // ── 5 · LO QUE HAY QUE CORREGIR EN COMPRAS ──────────────────────────────────────────────────────
  //
  // ═══ POR QUÉ ESTA SECCIÓN SE REHIZO ENTERA (04/08) ═══
  //
  // Era "CONTROL Y AUDITORÍA DE CARGA" y tenía tres defectos que se veían juntos en el PDF:
  //
  // 1. UNA COLUMNA DE PROSA POR FILA. Cada control llevaba un párrafo al lado explicando qué mirar. El
  //    dueño los borraba a mano y volvían en cada corrida. La regla que salió de ahí: si un número
  //    necesita un párrafo al lado, el número está mal elegido. Lo que explique, explica UNA vez al pie.
  //
  // 2. ESA PROSA ESTABA CORRIDA DE FILA. "Materiales Mantenimiento" mostraba el comentario de "cantidad
  //    de filas"; "cuánta plata" mostraba el de "días". No era un error de cálculo: estas filas se
  //    escribían con `push([...])` y un '' pelado, y un '' significa "esta celda no es mía, conservá lo
  //    que había". Cuando el bloque cambió de alto, la fusión dejó clavado el texto del inquilino
  //    anterior de cada fila física. La misma clase de defecto que ya se había pagado en las notas de
  //    crédito. Ahora todo el bloque va con `estructural()`: su vacío es SUYO y se limpia.
  //
  // 3. UN CONTADOR DIBUJADO COMO PLATA. '⚠ "Pagado" con monto MENOR al total | $5' son CINCO FILAS, no
  //    cinco pesos. Se venía parcheando fila por fila con un formato de excepción, y cada control nuevo
  //    volvía a nacer con formato moneda. La causa raíz es de estructura, no de formato: cantidades e
  //    importes compartían la columna B. Se separan: B es SIEMPRE cuánto (filas/comprobantes) y C es
  //    SIEMPRE plata. Cada una declara su formato en cada corrida y ninguna hereda.
  const b7 = push([`${nSeccion('control')} · LO QUE HAY QUE CORREGIR EN COMPRAS`])
  const cabCtrl = push(estructural(['Qué está mal cargado', 'Filas', 'Plata', '', '', '', '', '', '']))
  const ctrl = filas.length + 1
  push(estructural(['Facturas sin N° de comprobante',
    `=SUMPRODUCT((${COL_PROV}<>"")*(Compras!$H$4:$H="")*(${COL_TOTAL}<>0))`,
    `=SUMPRODUCT((${COL_PROV}<>"")*(Compras!$H$4:$H="")*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))`, '', '', '', '', '', '']))
  push(estructural(['Compras sin describir en qué se gastó',
    `=COUNTIF(${COL_FAMILIA};"${SIN_FAMILIA}")`,
    `=SUMIF(${COL_FAMILIA};"${SIN_FAMILIA}";${COL_TOTAL})`, '', '', '', '', '', '']))
  const fCompFecha = push(estructural(['N° de comprobante guardado como fecha',
    '=SUMPRODUCT((Compras!$E$4:$E<>"")*ISNUMBER(Compras!$H$4:$H))', '', '', '', '', '', '', '']))
  // ── LAS COLUMNAS DE PAGO SE CONTRADICEN ENTRE SÍ ────────────────────────────────────────────────
  // El auditor marcaba 10 columnas de Compras "cargadas y no leídas". Fui a ver si el OS debía
  // empezar a leerlas: NO. Ver lib/consistencia-compras.mjs — hay filas que dicen "Pagado" con el
  // monto pagado vacío. Leer una columna a medio llenar es peor que no leerla; lo que corresponde es
  // mostrar la contradicción para que se resuelva en el origen.
  push(estructural(['Dicen "Pagado" y no dicen cuánto',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)>0)*(NOT(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)))`,
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(NOT(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))`, '', '', '', '', '', '']))
  push(estructural(['Dicen "Pagado" por menos que el total',
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>1))`,
    `=SUMPRODUCT((${COL_ESTADO}="Pagado")*(IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>0)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)>1)*(IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0)-IF(ISNUMBER(Compras!$T$4:$T);Compras!$T$4:$T;0)))`, '', '', '', '', '', '']))
  push(estructural(['2ª cuota parcial que cae en otro mes', '',
    `=SUMPRODUCT((Compras!$S$4:$S="Parcial")*(IF(ISNUMBER(Compras!$W$4:$W);Compras!$W$4:$W;0)>0)*ISNUMBER(Compras!$V$4:$V)*(TEXT(IF(ISNUMBER(Compras!$V$4:$V);Compras!$V$4:$V;0);"yyyy-mm")<>TEXT(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0);"yyyy-mm"))*IF(ISNUMBER(Compras!$W$4:$W);Compras!$W$4:$W;0))`, '', '', '', '', '', '']))
  push(estructural(['Deuda sin fecha de pago', '',
    `=SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}")-SUMIFS(${COL_TOTAL};${COL_ESTADO};"${ESTADO_DEUDA}";${COL_FECHA};">0")`, '', '', '', '', '', '']))
  const fAnuCtrl = push(estructural(['Factura anulada, cargada igual en Compras',
    anuladasCargadas.length, '', '', '', '', '', '', '']))
  // EL HUECO DE CUIT SE CUENTA ACÁ, no se rotula fila por fila en la cuenta corriente. Sin CUIT una
  // compra no cruza contra el libro de IVA de ARCA: es lo que hace que la cobertura de arriba no
  // pueda cerrar por número y tenga que caer a proveedor + importe.
  push(estructural(['Compras de un proveedor sin CUIT',
    `=SUMPRODUCT((${COL_PROV}<>"")*(${COL_COMERCIAL}=1)*(${COL_CUITOS}=""))`, '', '', '', '', '', '', '']))
  // ESTE CONTROL ESTABA MAL Y VALE DEJARLO ESCRITO: la primera versión era =X-Y-(X-Y), que da cero
  // SIEMPRE, mire lo que mire. Un control que no puede fallar no controla nada — es peor que no
  // tenerlo, porque da tranquilidad gratis.
  // La deuda con ARCA/impuestos/nómina NO se controla acá: es de la pestaña Impuestos y Financieros
  // (regla 9). Esta pestaña sólo mira proveedores comerciales.
  // LAS DOS PATAS DE LA RESTA MIDEN CON EL MISMO CRITERIO. Se comparan el total por RUBRO y el total
  // por FAMILIA, que son dos agregaciones del mismo conjunto: si una fuera en neto y la otra con IVA,
  // este control mostraría permanentemente el IVA de todos los materiales y se leería como un error
  // de carga que nadie puede corregir.
  const fDif = push(estructural(['⇒ Materiales sin familia (tiene que dar —)', '',
    `=${RUBROS_CON_FAMILIA.map((r) => netoExpr(`${COL_RUBRO};"${r}"`)).join('+')}-${letra(13)}$TOTFAM`, '', '', '', '', '', '']))
  const ctrl1 = filas.length
  push([])
  // EL PLAZO NO ES UN DEFECTO DE CARGA: es la métrica de la sección, y va sola, con su unidad propia.
  const fPlazo = push(estructural(['Plazo promedio ponderado de compra comercial',
    `=IFERROR(SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*(IF(ISNUMBER(${COL_FECHA});${COL_FECHA};0)-IF(ISNUMBER(${COL_FACTURA});${COL_FACTURA};0))*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0))/SUMPRODUCT(ISNUMBER(${COL_FACTURA})*ISNUMBER(${COL_FECHA})*IF(ISNUMBER(${COL_TOTAL});${COL_TOTAL};0));"")`, '', '', '', '', '', '', '']))
  push([])
  // EL DETALLE DE LO ÚNICO QUE NO SE PUEDE CORREGIR SIN SABER QUÉ NÚMERO PONER.
  let cabAnu = 0, anu0 = 0, anu1 = 0
  if (anuladasCargadas.length) {
    cabAnu = push(estructural(['Factura anulada cargada en Compras', 'Cargada como', 'Fecha cargada', 'Importe', AIRE, 'Corresponde', 'Fecha correcta', '', '']))
    anu0 = filas.length + 1
    for (const m of anuladasCargadas) {
      const f = filas.length + 1
      push(estructural([m.proveedor, m.cargada, m.fechaCargada, arcaPorComprobante(`"${m.cuit ?? ''}"`, `$B${f}`, '1'), AIRE, m.corresponde, m.fechaCorrecta, '', '']))
    }
    anu1 = filas.length
    push([])
  }
  // LA ÚNICA PROSA DE LA SECCIÓN, AL PIE Y UNA SOLA VEZ — Y CORTA. Tenía 368 caracteres y el auditor
  // la reportaba cortada (A283): media explicación se perdía justo donde dice qué hacer.
  push(['Sin N° de comprobante un pago no se liga a su factura, ni hoy ni nunca. Sin familia, no se sabe en qué se gastó. Una factura anulada y cargada igual no la ve ningún control: el importe cierra. Todo se corrige en Compras; acá sólo se mide.'])
  push([])

  // ── 3 · FAMILIA × MES ───────────────────────────────────────────────────────────────────────────
  // "Materiales" es una pestaña propia y entera del generador: sus secciones arrancan en 1.
  const b3 = push([`${nSeccion('familiaMes', SECCIONES_MATERIALES)} · POR FAMILIA Y POR MES`])
  const cabFam = push(['Familia', ...meses, `Total neto ${AÑO}`, '% del total', 'Civil', 'Mantenimiento'])
  const fam0 = filas.length + 1
  for (const n of [...nombres, SIN_FAMILIA]) {
    const f = filas.length + 1
    const clave = n === SIN_FAMILIA ? `"${SIN_FAMILIA}"` : `$A${f}`
    const deLaFamilia = `${COL_FAMILIA};${clave}`
    push([
      n === SIN_FAMILIA ? `${SIN_FAMILIA} — falta describir qué se compró` : n,
      ...meses.map((_, i) => netoMateriales(`${deLaFamilia};${COL_FECHA};">="&${letra(i + 1)}$${cabFam};${COL_FECHA};"<"&EOMONTH(${letra(i + 1)}$${cabFam};0)+1`)),
      netoMateriales(deLaFamilia),
      `=IFERROR(${letra(13)}${f}/${letra(13)}$TOTFAM;0)`,
      ...RUBROS_CON_FAMILIA.map((r) => netoMateriales(`${deLaFamilia};${COL_RUBRO};"${r}"`)),
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
  const b4 = push([`${nSeccion('obra', SECCIONES_MATERIALES)} · POR OBRA`])
  // "Sin obra" y no "Control (tiene que dar $0)": el rótulo largo no entraba en su columna y se leía
  // cortado a la mitad ("Control (tiene que "), y encima decía CÓMO se calcula en vez de QUÉ es. Lo
  // que la columna mide es la plata de esa familia que no tiene obra imputada. Que tenga que dar cero
  // lo dice el formato, que la pinta en rojo apenas deja de darlo.
  // LAS FILAS SALEN DE `lib/materiales-por-obra.mjs`, que emite el criterio ÚNICO de costo de
  // material. Acá sólo se las empuja a la grilla: la fila "TOTAL POR OBRA" es el número que OBRAS
  // cita por rótulo, y tenerlo escrito en dos lugares es lo que hacía que las dos pestañas difirieran.
  const porObra = bloqueMaterialesPorObra({
    obras, familias: [...nombres, SIN_FAMILIA], sinFamilia: SIN_FAMILIA,
    rangos: { neto: COL_NETO, iva: COL_IVA, total: COL_TOTAL, familia: COL_FAMILIA, obra: COL_OBRA },
    filaCabecera: filas.length + 1,
  })
  const cabObra = push(porObra.cabecera)
  const obra0 = filas.length + 1
  for (const fila of porObra.detalle) push(fila)
  const obra1 = filas.length
  push(porObra.total)
  push([])

  // ── 5 · EL CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO ─────────────────────────────────────────────
  //
  // "TOTAL MATERIALES" por familia y el total por rubro son DOS AGREGACIONES DE COMPRAS. Que den lo
  // mismo prueba que ninguna familia se perdió — no prueba nada sobre si Compras está bien. El dueño
  // lo dijo en una palabra: "pésimo eso". Éste compara contra el libro de IVA de ARCA, que el OS no
  // escribe, por FECHA DE FACTURA. Ver lib/control-arca-bloque.mjs.
  const arca0 = filas.length + 1
  for (const b of bloqueControlArca({
    titulo: `${nSeccion('controlArca', SECCIONES_MATERIALES)} · RESPALDO FISCAL — contra el libro de IVA de ARCA`,
    rubros: [...RUBROS_CON_FAMILIA], fila0: arca0,
  })) push(b)
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

  // Las notas que no encontraron a su proveedor en la lista nueva (le pagaron, o cambió de nombre en
  // Compras). Se DEVUELVEN para reportarlas: el bloque ya se limpia a su ancho real, así que sin este
  // aviso el dato del dueño se iría sin dejar rastro. Queda en el log de la corrida, y el snapshot
  // previo del pipeline lo tiene entero.
  const notasHuerfanas = [
    ...[...NOTAS.porProveedor.entries()].filter(([k]) => !usadas.has(`p|${k}`)).map(([k, m]) => ({ tipo: 'proveedor', clave: k, texto: [...m.values()].map(String).join(' · ') })),
    ...[...NOTAS.porComprobante.entries()].filter(([k]) => !usadas.has(`c|${k}`)).map(([k, m]) => ({ tipo: 'comprobante', clave: k, texto: [...m.values()].map(String).join(' · ') })),
  ]
  return { filas: resuelto, notasHuerfanas, notasPuestas, anchoDeuda: ANCHO, cabArca, arca0, marcas: { bPos, b1, b2, b3, b4, b5, b6, b7, fin: filas.length }, bPos, pos0, pos1, posTotal, posProy, posPlazo, posFaltan, fCompFecha, afip0, afip1, nc0, nc1, cabNC, cabAnu, anu0, anu1, fArcaN, fArcaNotas, fArcaEn, fArcaSinNum, fArcaFaltan, fArcaVentas, cabDoc, cabDocFin, deudaL: L, deudaHeaders, deudaGrupos, cabAfip, cabCtrl, p0, p1, fSub, fTotProv, cabProv, fam0, fam1, totFam, obra0, obra1, cabFam, cabObra, ctrl, ctrl1, fAnuCtrl, fDif, fPlazo, anchoObras: obras.length }
}

/**
 * LA GUARDA DE LAS DINÁMICAS — Y POR QUÉ CAMBIÓ DE ROL (04/08).
 *
 * Nació abortando la corrida ENTERA con sólo encontrar una tabla dinámica en la sección 1. Evitaba
 * el desastre grande (reescribir la dinámica como texto y matarla), pero producía uno lento: todo lo
 * que vive DEBAJO de las dinámicas dejó de actualizarse, y el dueño terminó mirando cuadros viejos
 * con restos de una corrida anterior. Un martillo donde hacía falta un límite.
 *
 * HOY VERIFICA UNA SOLA COSA: que la FRONTERA calculada —la fila del primer bloque que este script
 * escribe— caiga DEBAJO de la última dinámica. Si cae adentro, la detección de la frontera está
 * fallando y escribir sería destruir: ahí sí aborta.
 *
 * Pregunta por la grilla con `includeGridData` porque es el único modo de saber si una celda ES una
 * dinámica; ni `readSheetValues` ni `getSheetMeta` lo dicen (una dinámica no tiene valor ni fórmula
 * propios). FALLA CERRADO: si la consulta no se puede hacer, aborta igual — "no pude verificar" no
 * es permiso.
 *
 * 'Proveedores' literal y NO `${PESTAÑA}`: en este script esa constante vale 'Proveedores y
 * Materiales' (el nombre del PASO, no el de la pestaña), y con ella la consulta devuelve
 * 400 "Unable to parse range" — o sea, la guarda abortaba siempre por el motivo equivocado.
 *
 * @param {object} google
 * @param {{frontera:number, visible:any[][], pestana?:string}} arg
 * @returns {Promise<{ancla:number, fin:number}[]>} las dinámicas encontradas, con lo que ocupan
 */
export async function abortarSiHayDinamica(google, { frontera = null, visible = [], pestana = 'Proveedores' } = {}) {
  // `frontera: null` es el MODO LECTURA, y existe por un orden que estaba al revés: la frontera se
  // calculaba primero y las dinámicas después, así que cuando el título ancla desapareció de la
  // columna A no había con qué ubicarse y la pestaña se congelaba entera. Ahora las dinámicas se leen
  // primero —son un hecho de la API, no un rótulo— y sirven de ancla de respaldo (`fronteraSegura`).
  // Con una frontera ya calculada, el modo sigue siendo el de siempre: verificar y abortar.
  let grid = null
  try {
    // LA PESTAÑA ENTERA, no sólo hasta la frontera: una dinámica anclada DEBAJO cae dentro de lo que
    // se va a escribir, y el mismo control la atrapa (su fin queda >= frontera). Todo el ancho,
    // además, porque una dinámica puede estar anclada en cualquier columna, no sólo en la A.
    grid = await google.getGridData?.(ID, `${pestana}!A1:Z`)
  } catch (e) {
    throw new Error(`no pude verificar si hay tablas dinámicas en "${pestana}" (${e.message}). `
      + 'No escribo: no poder verificar nunca es permiso para pisar.')
  }
  const dinamicas = anclasDeDinamicas(grid).map((a) => ({ ancla: a.fila, col: a.col, fin: finDeDinamica(visible, a.fila) }))
  if (process.env.ORQ_PISAR_DINAMICA_PROVEEDORES === 'si') {
    console.warn('  ⚠ ORQ_PISAR_DINAMICA_PROVEEDORES=si: no verifico la frontera contra las dinámicas, a pedido explícito')
    return dinamicas
  }
  if (frontera !== null) verificarFronteraBajoDinamicas({ frontera, dinamicas })
  if (!dinamicas.length && frontera !== null) {
    // No es motivo para abortar —escribir de la frontera para abajo sigue siendo correcto—, pero sí
    // para decirlo: si las dinámicas desaparecieron, las secciones 1 y 2 no las mantiene nadie.
    console.warn(`  ⚠ "${pestana}" no tiene ninguna tabla dinámica arriba de la fila ${frontera}: `
      + 'las secciones 1 y 2 las hace proveedores-dos-cuadros.mjs / proveedores-pivot-aplicar.mjs y '
      + 'hoy no están. Este generador NO las rehace.')
  }
  return dinamicas
}

const money = (n) => Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/**
 * EL CRUCE CONTRA COBRANZAS, CON LO QUE EL DUEÑO YA DECIDIÓ DESCONTADO DE LA LÍNEA DE AVISO.
 *
 * ═══ POR QUÉ (13/08) ═══
 *
 * Este aviso reaparecía con los mismos $129.499.724 en cada corrida —cada dos horas— después de que
 * el dueño contestara "no considerarlas" sobre las dos facturas mayores (0001-00000208 por $75M y
 * 0001-00000213 por $40M, las dos al CUIT 30716490498). Un aviso siempre rojo se ignora, y con él se
 * ignora el día que aparezca una factura nueva de verdad. Ese es todo el costo de no tener registro.
 *
 * SE LIBERA EL COMPROBANTE, NO EL CONTROL. La clave es el número de factura; la forma, su importe y
 * su CUIT. Si mañana el importe de esa factura cambia, el dueño decidió sobre otra cosa y el aviso
 * vuelve solo — sin eso, el registro sería una alfombra. Ver lib/decisiones-hallazgos.mjs.
 *
 * LO LIBERADO SE SIGUE CONTANDO Y LISTANDO, con quién decidió, cuándo y su palabra textual. Lo único
 * que pierde es el `⚠`, que es lo que hace figurar al paso entre los que "no cierran".
 *
 * @param {Array<{comprobante:string, cuit:any, fecha:string, importe:number}>} emitidas
 * @returns el veredicto completo: vivos, silenciados, caducadas y rotas
 */
export function reportarVentasSinCobranza(emitidas = [], { log = console.warn, ...opts } = {}) {
  const dec = decidir(CONTROLES.ventasSinCobranza, emitidas.map((r) => ({
    ...r, clave: r.comprobante, forma: { importe: r.importe, cuit: r.cuit ?? '' },
  })), opts)
  if (dec.vivos.length) {
    const plata = dec.vivos.reduce((a, r) => a + r.importe, 0)
    log(`  ⚠ VENTAS (no es de esta pestaña): ${dec.vivos.length} factura(s) emitidas que Cobranzas no tiene, `
      + `${money(plata)}. Su lugar es la pestaña Cobranzas; acá sólo se avisa.`)
    for (const r of dec.vivos) log(`     ${r.comprobante}  ${String(r.fecha).padStart(10)}  CUIT ${r.cuit ?? '—'}  ${money(r.importe)}`)
  }
  explicarDecisiones(dec, log, { detalle: (h) => `${h.comprobante}  ${String(h.fecha).padStart(10)}  ${money(h.importe)}` })
  return dec
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ═══ NINGÚN GENERADOR PISA UNA TABLA DINÁMICA QUE NO CREÓ ═══
  //
  // Las secciones 1 y 2 de Proveedores dejaron de ser bloques de fórmulas: hoy son tablas dinámicas
  // nativas (04/08/2026, pedido del dueño), y las hacen otros dos scripts. Este generador mantiene
  // vivo TODO LO QUE VA DEBAJO y no toca una sola fila de arriba.
  //
  // La verificación no se puede hacer acá: necesita la FRONTERA, y la frontera se lee de la pestaña
  // (`buscarFrontera`, más abajo, junto con la lectura del bloque de deuda). Va justo antes de la
  // partición, que es el último momento antes de escribir una celda.
  //
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
  COL_CUITOS = fijar('cuitOS', COL_CUITOS, 'CUIT (OS)')
  COL_PAGADO = fijar('pagado', COL_PAGADO, 'Monto Pagado')
  COL_PARCIAL1 = fijar('parcial1', COL_PARCIAL1, 'Monto Parcial 1')
  COL_PARCIAL2 = fijar('parcial2', COL_PARCIAL2, 'Monto Parcial 2')
  COL_TIPOPAGO = fijar('tipoPago', COL_TIPOPAGO, 'Tipo pago')
  // El neto y el IVA del COSTO de materiales. Se ubican por rótulo como todo lo demás: si "Importe"
  // se corriera y esto leyera la columna de al lado, el cuadro por obra saldría plausible y falso.
  COL_NETO = fijar('neto', COL_NETO, 'Importe')
  COL_IVA = fijar('iva', COL_IVA, 'IVA')
  console.log(`  Compras por encabezado: Rubro=${letra(IDX.rubro)} · Fecha de caja=${letra(IDX.fechaCaja)} · Familia=${letra(IDX.familia)} · ¿Comercial?=${letra(IDX.comercial)} · Pagado=${letra(IDX.pagado)} · Parcial1=${letra(IDX.parcial1)} · Parcial2=${letra(IDX.parcial2)} · Importe=${letra(IDX.neto)} · IVA=${letra(IDX.iva)}`)

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
    // ═══ EL MISMO SALDO QUE LA FÓRMULA, NO OTRO (31/07) ═══
    //
    // El dueño: "la pestaña de proveedores no es una pestaña viva y no esta contemplando el estado
    // actual de los proveedores a los q se les adeuda en su cuadro 1, no me da confianza".
    //
    // Medido: el titular decía $13.715.178 y la lista sumaba $8.046.266. La diferencia, $5.668.912, era
    // Angel Fernandez y Gruas San Blas — dos proveedores a los que se les debe y que NO estaban
    // cableados en el cuadro. Dos definiciones del mismo saldo:
    //
    //   · el titular (fórmula viva):  Total − Pagado − Parcial1(>0) − Parcial2(>0)
    //   · quién aparece (este JS):    Total − Pagado, IGNORANDO los parciales
    //
    // Y el dueño escribe el saldo que falta en Parcial 1 como NEGATIVO entre paréntesis —"($ 544.500)",
    // su convención confirmada el 27/07—. Con el importe en "Monto Pagado" esas dos filas daban saldo
    // cero y quedaban afuera; él lo movió a Parcial 1, el titular se actualizó solo, y la lista no
    // podía sumar un proveedor hasta la corrida siguiente.
    const saldoDeFila = (fila) => parseMonto(fila?.[IDX.total]) - parseMonto(fila?.[IDX.pagado])
      - Math.max(0, parseMonto(fila?.[IDX.parcial1])) - Math.max(0, parseMonto(fila?.[IDX.parcial2]))
    const imp = saldoDeFila(f)
    const a = deudaMap.get(nombre) ?? { nombre, total: 0, filas: [] }
    a.total += imp
    a.filas.push({ fila: i + 4, comprobante: String(f?.[7] ?? '').trim() })
    deudaMap.set(nombre, a)
  })
  // Sólo grupos con saldo neto a favor del proveedor. Un proveedor cuyas notas de crédito superan sus
  // facturas pendientes no es una deuda: no va en la lista de "qué se debe".
  // ═══ SE CABLEA A TODO EL QUE TENGA UNA FILA PENDIENTE — NO SÓLO AL QUE HOY DEBE ═══
  //
  // Cada fila del cuadro está gateada por un predicado VIVO (`soloConDeuda`): si el saldo no es > 0, la
  // fila se vacía sola. Entonces sobre-incluir es GRATIS y sub-incluir es el defecto: un proveedor que
  // no está cableado no puede aparecer aunque se le empiece a deber, y hay que esperar al generador.
  //
  // Con esto, el cuadro reacciona en el momento en que él toca Compras: la fila ya existe y su fórmula
  // la muestra o la esconde. Eso es lo que hace la pestaña VIVA, y es lo que faltaba.
  // ═══ SOBRE-INCLUIR NO ERA GRATIS (31/07) ═══
  //
  // Acá estaba escrito que cablear a todo el que tenga una fila Pendiente es GRATIS, porque el predicado
  // vivo vacía la fila del que no debe. NO es gratis, y el dueño lo vio cuatro veces: "proveedores es
  // una vergüenza", "me rompiste proveedores nuevamente".
  //
  // Lo que producía: por cada proveedor ya pagado quedaba un par de filas con el nombre y el comentario
  // del dueño (que SÍ se escribe, viene del respaldo) pero con "0 fac." y "—" en el importe. Cuatro de
  // esas —Con-Sec, DUPEC, Angel Fernandez, Leandro Rojas— quedaban intercaladas entre los proveedores
  // reales, y el cuadro se leía como si estuviera corrupto. Peor: dos de ellas sumaban $468.542 que el
  // titular no cuenta (el titular filtra por ¿Comercial?=1) y el aviso "⚠ Faltan 2 facturas" quedaba
  // encendido para siempre, apuntando a una diferencia que era del propio listado.
  //
  // El cuadro contesta UNA pregunta: a quién le debo HOY. Un proveedor al que no se le debe no va, y su
  // comentario no se pierde: vive en public.proveedor_notas y vuelve solo el día que reaparezca (es
  // exactamente para eso que existe el respaldo). El precio es que un proveedor nuevo con deuda entra en
  // la corrida siguiente, no al instante. Barato al lado de un cuadro que no se puede leer.
  const deudaAgrupada = [...deudaMap.values()]
    .filter((p) => p.total > 0.5)
    .sort((a, b) => b.total - a.total)

  // ── AFIP: LA FUENTE FISCAL ─────────────────────────────────────────────────────────────────────
  // comprobantes_arca es el libro de IVA que el OS ya replica. Es la única fuente que dice qué se
  // facturó DE VERDAD: Compras dice lo que alguien cargó.
  //
  // CON SIGNO (21/07): una NOTA DE CRÉDITO resta. En el libro hay 13 por $20.976.638 y se estaban
  // sumando como compras: $197.442.458 declarados contra $155.489.182 reales. Y una nota de crédito
  // no puede figurar como "falta cargar en Compras" — no es una compra que nadie anotó, es plata
  // que el proveedor devolvió. Ver lib/comprobante-arca.mjs.
  //
  // ═══ Y SIN REPETIDOS, ACÁ ARRIBA, ANTES DE CUALQUIER DERIVACIÓN (04/08) ═══
  //
  // La réplica recibe el mismo comprobante en más de una descarga del libro y no tiene clave única.
  // El primer arreglo filtraba `cruce.faltan` —una derivación— y por eso tapó la sección 4 y dejó
  // "Trielec · 0038-00000003 · -$509.980" repetido CUATRO veces en la 3: las notas de crédito salen
  // de otra derivación del mismo origen. Todo lo que sigue —el cruce contra Compras, el análisis de
  // notas de crédito, las anuladas cargadas— cuelga de estas dos listas. Se limpian una vez, acá.
  const rArcaCrudo = (await query(
    "select tipo_comprobante, emisor_nombre, emisor_cuit, punto_venta, numero, fecha_emision, imp_total from comprobantes_arca where tipo_libro='R' order by fecha_emision",
  )).rows
  const eArcaCrudo = (await query(
    "select tipo_comprobante, receptor_cuit, punto_venta, numero, fecha_emision, imp_total from comprobantes_arca where tipo_libro='E' order by fecha_emision desc",
  )).rows
  const rArca = sinComprobantesRepetidos(rArcaCrudo)
  // En el libro de VENTAS el emisor es siempre la empresa: la identidad no necesita el CUIT (que
  // además no viene en la consulta — ahí el CUIT es el del RECEPTOR).
  const eArca = sinComprobantesRepetidos(eArcaCrudo, { emisorUnico: true })
  const repetidos = (rArcaCrudo.length - rArca.length) + (eArcaCrudo.length - eArca.length)
  if (repetidos > 0) {
    console.log(`  ○ ${repetidos} comprobante(s) repetidos en comprobantes_arca: se usan una sola vez `
      + '(clave tipo + emisor + punto de venta + número + importe). El duplicado entra en la réplica: '
      + 'el arreglo de fondo es del importador.')
  }

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

  // SIN FILTRO DE DUPLICADOS ACÁ: `cruce.faltan` ya viene de un libro sin repetidos (ver arriba). Un
  // segundo filtro sobre esta derivación es lo que hizo creer que el defecto estaba resuelto cuando
  // sólo lo estaba en esta sección.
  const faltanEnCompras = cruce.faltan
    .map((r) => ({
      nombre: canon(r.emisor_nombre), cuit: r.emisor_cuit,
      comprobante: `${String(r.punto_venta).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`,
      fecha: fecha(r.fecha_emision), importe: Number(r.imp_total),
    }))
    .sort((a, b) => b.importe - a.importe)
  // ═══ LAS FACTURAS EMITIDAS YA NO SE ESCRIBEN EN ESTA PESTAÑA (04/08) ═══════════════════════════
  //
  // El bloque "7 · FACTURAS EMITIDAS — control cruzado contra Cobranzas" llevaba su propia confesión
  // en el título: "(esto es VENTAS, no proveedores)". Veinte filas de clientes, CUIT e importes
  // cobrados dentro del cuadro de lo que la empresa DEBE. Es un error de categoría, no un exceso de
  // información: quien abre Proveedores para decidir a quién pagar no tiene por qué tropezarse con
  // las ventas, y quien busca las ventas jamás las buscaría acá.
  //
  // El cruce en sí es valioso —una factura emitida que Cobranzas no tiene es plata facturada que
  // nadie sigue— y su lugar es la pestaña de Cobranzas. Mientras esa pestaña no exista rehecha, el
  // cruce NO se tira: se sigue calculando y se REPORTA por el log de la corrida, que es donde el OS
  // deja lo que todavía no tiene pestaña. Escribir una versión peor en el lugar equivocado, no.
  const cobranzas = await google.readSheetValues(ID, 'Cobranzas!A5:G400')
  const cobranzasPorComp = new Set()
  for (const c of cobranzas) {
    const k = normComprobante(c?.[4])
    if (esLlaveUtil(k)) cobranzasPorComp.add(k)
  }
  const emitidasSinCobranza = eArca
    .filter((r) => !esNotaDeCredito(r.tipo_comprobante))
    .map((r) => ({
      comprobante: `${String(r.punto_venta).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`,
      cuit: r.receptor_cuit, fecha: fecha(r.fecha_emision), importe: Number(r.imp_total),
    }))
    .filter((r) => !cobranzasPorComp.has(normComprobante(r.comprobante)))
  reportarVentasSinCobranza(emitidasSinCobranza)

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

  // LOS EMISORES DE ARCA, PARA CRUZAR EL CUIT POR RAZÓN SOCIAL. En Compras el dueño escribe "Alumetal"
  // y ARCA dice "ALUMETAL S A": la igualdad exacta dejaba 22 proveedores sin CUIT. El cruce por tokens
  // los resuelve, y ante dos candidatos NO elige — un CUIT ajeno hace transferir a otra cuenta.
  const emisoresArca = [...new Map(rArca.filter((r) => r.emisor_cuit)
    .map((r) => [String(r.emisor_cuit), { nombre: r.emisor_nombre, cuit: String(r.emisor_cuit) }])).values()]
  let cuitsCruzados = 0; const sinCuit = []
  const proveedores = comerciales.slice(0, TOP).map((p) => {
    const k = normNombre(p.nombre)
    const ch = chequesPorProv.get(k) ?? []
    // 1º el match exacto de nombre que ya existía; 2º el cruce por razón social contra ARCA.
    const porNombre = porCuit.get(k)?.cuit
    const cruzado = porNombre ? null : emparejarCuit(p.nombre, emisoresArca)
    if (cruzado) cuitsCruzados++
    if (!porNombre && !cruzado) sinCuit.push(p.nombre)
    return {
      nombre: p.nombre,
      cuit: porNombre ?? cruzado?.cuit ?? '',
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

  // La lista de deuda se AGRUPA por proveedor en JS (para el +/- y para re-anclar las notas del dueño a
  // SU proveedor), pero NINGÚN importe ni estado se materializa: cada celda de la fila es una fórmula
  // VIVA sobre Compras, y la cabecera se gatea con predicadoConDeuda para que el proveedor que se paga
  // desaparezca solo. Los grupos salen de deudaAgrupada, calculado más abajo.

  // ═══ LA LISTA DE OBRAS SALE DE LOS DATOS (04/08) ═══
  //
  // Estaba escrita a mano acá, y por eso un cliente nuevo no aparecía NUNCA solo: entró Quattropani ·
  // Melisa García SAS con $32.937.000 y el desglose por obra siguió mostrando las mismas ocho
  // columnas de siempre, $32.937.000 por debajo del total por familia de la sección de arriba. Ahora
  // se deriva de "Cliente / Asignación" filtrando por rubro de material — ver lib/obras-con-materiales.
  // Los nombres van EXACTOS a como están en Compras ("MESSINA", no "MESSINAS"): son el criterio
  // literal del SUMIFS.
  const obras = obrasConMateriales(compras, { rubros: RUBROS_CON_FAMILIA, monto: parseMonto, colObra: IDX.obra, colRubro: IDX.rubro, colNeto: IDX.neto, colIva: IDX.iva, colTotal: IDX.total })
  console.log(`  obras con materiales imputados (de los datos, por monto): ${obras.join(' · ')}`)
  // LO QUE EDITÓ LA PERSONA MANDA: se leen los encabezados reales del bloque de deuda para escribir
  // cada dato en la columna que el dueño rotuló, y para no pisar las que él agregó (Comentarios).
  let deudaCols = null
  let deudaPrevio = []
  /** La pestaña "Proveedores" tal como se ve hoy. De acá sale la frontera. */
  let vistaProveedores = []
  try {
    // SIN TECHO DE FILAS (28/07). Antes se leía `A1:AZ80`: con 80 filas el bloque de deuda —que puede
    // pasar de 100 filas cuando hay muchos proveedores— quedaba CORTADO, y las notas del dueño en los
    // proveedores de abajo no las capturaba `notasAncladas`. Como cada fila de deuda se genera con el
    // centinela VACIO en las columnas del dueño (que la fusión BORRA salvo que la nota se re-ancle), una
    // nota que no se leyó se PERDÍA en cada corrida — el "no respeta mis ediciones" que marcó el dueño.
    // Se lee el bloque entero (todas las filas) para que ninguna nota quede fuera de la re-ancla.
    const prevP = await google.readSheetValues(ID, `'Proveedores'!A1:BZ`)
    vistaProveedores = prevP || []
    const iCab = (prevP || []).findIndex((f) => /proveedor\s*\/\s*factura/i.test(String(f?.[0] ?? '')))
    if (iCab >= 0) {
      deudaCols = prevP[iCab]
      // El bloque va desde la cabecera hasta el título de la sección siguiente ("2 · …").
      const fin = prevP.findIndex((f, k) => k > iCab && /^\s*2\s*·/.test(String(f?.[0] ?? '')))
      deudaPrevio = prevP.slice(iCab + 1, fin > iCab ? fin : undefined)
    }
  } catch { /* la pestaña todavía no existe: se usa el layout por defecto */ }
  if (deudaCols) console.log(`  columnas de deuda según la pestaña (las del dueño): ${deudaCols.filter(Boolean).join(' · ')}`)

  // ═══ LA FRONTERA: DE ESTA FILA PARA ABAJO ES MÍO, DE ACÁ PARA ARRIBA NO ═══
  //
  // Arriba viven la cabecera, el bloque de posición (fórmulas vivas que se mantienen solas) y las dos
  // tablas dinámicas. Se busca por el TÍTULO del primer bloque generado y NUNCA por un número de
  // fila: el bloque de arriba crece y se achica solo, y una fila fija escribiría adentro de una
  // dinámica el día que aparezca un proveedor nuevo.
  //
  // Si no se encuentra, esta pestaña no se escribe — pero la corrida sigue: "Materiales" es una
  // pestaña entera del generador y no tiene por qué quedarse vieja por un problema de la otra.
  //
  // Y SE BUSCA EN ESTE ORDEN: primero las dinámicas, después el título. Al revés —como estaba— el día
  // que el título desaparece de la columna A no queda con qué ubicarse y la pestaña se congela entera
  // sin que nadie se entere: el "⛔ no escribo" sale por un log que nadie mira. Las dinámicas son un
  // hecho estructural de la API y sirven de ancla de respaldo. Ver lib/proveedores-frontera.mjs.
  let frontera = null
  let dinamicas = []
  try {
    dinamicas = await abortarSiHayDinamica(google, { frontera: null, visible: vistaProveedores })
    const f = fronteraSegura({ visible: vistaProveedores, titulo: TITULO_FRONTERA, dinamicas })
    frontera = f.fila
    verificarFronteraBajoDinamicas({ frontera, dinamicas })
    console.log(`  frontera de "${NOMBRES.proveedores}": fila ${frontera} `
      + (f.por === 'titulo' ? `("${TITULO_FRONTERA}")` : '(el título ancla NO está en la columna A: me ubico debajo de la última dinámica)')
      + ' — escribo de ahí para abajo'
      + `${dinamicas.length ? ` · ${dinamicas.length} tabla(s) dinámica(s) arriba, la última termina en la fila ${Math.max(...dinamicas.map((d) => d.fin))}` : ''}`)
  } catch (e) {
    // FALLA CERRADO PARA ESTA PESTAÑA: no se escribe una sola celda de "Proveedores".
    console.error(`  ⛔ "${NOMBRES.proveedores}" NO se escribe en esta corrida: ${e.message}`)
    frontera = null
  }
  // EL RESPALDO DE NOTAS, ANTES DE CONSTRUIR. Una nota vale por el proveedor del que habla, no por si
  // hoy le debemos: si se le pagó, sale de la lista y su celda desaparece — pero la nota no.
  const notasBase = await leerNotas(ID).catch((e) => { console.warn(`  ⚠ no pude leer el respaldo de notas: ${e.message}`); return new Map() })
  if (cuitsCruzados) console.log(`  🔗 ${cuitsCruzados} CUIT resuelto(s) cruzando la razón social de ARCA`)
  if (sinCuit.length) console.log(`  ○ ${sinCuit.length} sin CUIT (ARCA no los tiene o el nombre no alcanza para decidir): ${sinCuit.slice(0, 6).join(' · ')}${sinCuit.length > 6 ? ' …' : ''}`)
  const g = grilla({ obras, proveedores, resto, deudaAgrupada, faltanEnCompras, notasCredito, anuladasCargadas, cruce, deudaCols, deudaPrevio, notasBase })
  const ancho = Math.max(...g.filas.map((f) => f.length))
  const cuadro = g.filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r })
  console.log(`${PESTAÑA}: ${cuadro.length} filas x ${ancho} columnas`)
  // UN PÁRRAFO QUE NO ENTRA SE VE CORTADO, y en una fila que derrama sobre toda la pestaña no hay
  // ancho que lo arregle: hay que escribir menos. Se avisa acá, con el número, para que no sea una
  // discusión de gustos — es el defecto `texto_cortado` que el auditor reportaba como A261 y A283.
  for (const p of parrafosQueNoEntran(g.filas, { anchoPx: ANCHOS_PROVEEDORES.reduce((a, b) => a + b, 0) })) {
    console.log(`  ⚠ párrafo de ${p.largo} caracteres y entran ${p.entran}: "${p.texto.slice(0, 60)}…"`)
  }
  console.log(`  bloque de deuda: ${g.anchoDeuda} columnas de ancho real (los rótulos son ${g.deudaL?.cols?.length ?? '?'}) — se limpia todo ese ancho y las notas se re-anclan a su proveedor`)
  if (g.notasHuerfanas?.length) {
    // NO se pierde en silencio: queda en el log, textual, y el snapshot previo lo conserva entero.
    console.log(`  ⚠ ${g.notasHuerfanas.length} nota(s) del dueño SIN proveedor en la lista nueva (le pagaron, o cambió el nombre en Compras):`)
    for (const n of g.notasHuerfanas) console.log(`     ${n.tipo} "${n.clave}": ${n.texto}`)
  }
  console.log(`  ${comerciales.length} proveedores comerciales de ${acc.size} · top ${proveedores.length} listados, ${resto.cantidad} en "resto"`)
  if (DRY) {
    // ═══ EN SECO, LA PREGUNTA ÚTIL NO ES "CUÁNTAS FILAS" SINO "QUÉ TE VOY A PISAR" ═══
    //
    // POR QUÉ (23/07). El dueño preguntó qué edición suya había vuelto pisada y nombró esta pestaña.
    // Con `--dry` cortando acá, lo único que se veía era el tamaño del cuadro — inútil para
    // contestarle. Ahora en seco se lee la pestaña y se listan los rótulos que el generador quiere
    // escribir y HOY NO ESTÁN: o los cambió él, o cambió el generador. Es la lista que hay que
    // mirar juntos antes de dejar correr la primera escritura con Regla 0.
    //
    // Y SE COMPARA CONTRA LA PESTAÑA QUE SE VA A ESCRIBIR, desde la frontera. Antes se leía la vieja
    // "Proveedores y Materiales", que ya se retiró: la lectura fallaba, quedaba vacía y el seco
    // listaba las 500 filas como si el dueño hubiera borrado todo. Un informe así no se mira.
    if (!frontera) {
      console.log(`--dry: no escribí nada. ⛔ sin frontera no puedo comparar "${NOMBRES.proveedores}" — arriba está el motivo.`)
      return
    }
    const bloque = g.filas.slice(g.marcas.b5 - 1, g.marcas.b3 - 1)
    const frio = detectarArranqueEnFrio(bloque, vistaProveedores.slice(frontera - 1))
    console.log(`--dry: no escribí nada. Escribiría ${bloque.length} filas en "${NOMBRES.proveedores}" desde la fila ${frontera} `
      + `(hasta la ${frontera + bloque.length - 1}) y ${g.filas.length - g.marcas.b3 + 1} en "${NOMBRES.materiales}" desde la 4.`)
    if (!frio.length) console.log('       Ningún rótulo mío falta en la pestaña — no tengo nada tuyo que pisar.')
    else {
      console.log(`       ⚠ ${frio.length} rótulo(s) que yo escribiría y HOY NO ESTÁN en "${NOMBRES.proveedores}":`)
      for (const x of frio) console.log(`      fila ${String(x.fila + frontera - 1).padStart(3)} · "${String(x.mio).slice(0, 70)}"`)
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
  const FILA0 = 4   // título, subtítulo, una vacía, y recién ahí el contenido
  // ═══ EL TRAMO DE "Proveedores" EMPIEZA EN LA FRONTERA, NO EN LA FILA 1 ═══
  //
  // La posición (hero) y las secciones 1 y 2 ya NO son de este generador: el hero son fórmulas vivas
  // que se mantienen solas y las otras dos son tablas dinámicas. El tramo arranca en el título del
  // primer bloque propio (M.b5) y ATERRIZA en la frontera leída de la pestaña, así que sus fórmulas
  // se reubican a las filas REALES donde van a quedar.
  const TRAMOS = [
    { titulo: NOMBRES.proveedores, desde: M.b5, hasta: M.b3 - 1, desdeFila: frontera ?? FILA0, enFrontera: true,
      saltear: frontera ? null : 'no pude ubicar la frontera en la pestaña',
      subtitulo: 'Qué se debe y a quién: la posición arriba, la deuda agrupada por proveedor (con el +/- para abrir sus facturas), la cuenta corriente con su plazo, las notas de crédito y lo que AFIP facturó que Compras no tiene. Todo son fórmulas sobre Compras y ARCA — ni un importe escrito.',
      anchos: [230, 132, 142, 104, 132, 132, 124, 172, 124, 124, 124, 124, 136, 116, 104, 240] },
    { titulo: NOMBRES.materiales, desde: M.b3, hasta: M.fin, desdeFila: FILA0,
      subtitulo: 'En qué se va la plata: por familia de material y por mes, y la misma plata abierta por obra. Sale de la columna "Familia de material" de Compras, que el OS calcula con una sola definición.',
      anchos: [236, ...Array(12).fill(96), 116, 78, 116, 116] },
  ]

  // NINGUNA FILA SE PIERDE. Es la regla que el dueño puso después del rollback: "falta información
  // relevante de la que antes sí contaba". Lo que va del arranque hasta la frontera —título viejo,
  // hero y las dos secciones que hoy son dinámicas— se declara acá como territorio que este script
  // NO escribe: no se pierde, lo mantiene otro (el hero, el propio Sheet; las secciones 1 y 2,
  // proveedores-dos-cuadros.mjs y el pivot de la sección 2).
  const huerfanas = filasHuerfanas(g.filas, [...TRAMOS, { titulo: '(lo mantienen las dinámicas)', desde: 1, hasta: M.b5 - 1 }])
  if (huerfanas.length) {
    throw new Error(`${huerfanas.length} fila(s) quedarían afuera del reparto y se perderían: `
      + huerfanas.slice(0, 5).map((h) => `${h.fila} "${h.contenido}"`).join(' · '))
  }
  // NI UNA FÓRMULA MIRANDO ARRIBA DE LA FRONTERA. Lo de arriba salió del reparto, así que una
  // referencia a esas filas no se puede reubicar: quedaría apuntando a una fila de la dinámica y
  // devolvería un número —el equivocado— sin un solo error. Hoy no hay ninguna (los únicos cruces son
  // $TOTFAM, que vive en Materiales, y $TOTPROV, que sólo se usa dentro de la sección 2).
  const colgadas = referenciasFuera(g.filas, TRAMOS)
  if (colgadas.length) {
    throw new Error(`${colgadas.length} fórmula(s) apuntan a filas que ya no escribe este generador `
      + '(el hero o las secciones 1 y 2, que son tablas dinámicas): quedarían mirando la fila equivocada. '
      + colgadas.slice(0, 5).map((c) => `${c.titulo} fila ${c.fila}: ${c.ref} en "${c.formula}"`).join(' · '))
  }

  const partes = partir(g.filas, TRAMOS, { desdeFila: FILA0 })

  // LA NUMERACIÓN YA VIENE BIEN DESDE EL CÓDIGO. Acá había una renumeración por pestaña que reescribía
  // el "N · " de cada título contando bloques. Sobra desde que el número sale de SECCIONES_PROVEEDORES
  // (las dinámicas ocupan el 1 y el 2, lo generado arranca en el 3) y sobre todo MENTIRÍA: contando
  // sólo lo que este script escribe, "NOTAS DE CRÉDITO" volvería a ser el bloque 1.

  const traducir = (titulo) => traducirMarcadores(g, TRAMOS, titulo, { desdeFila: FILA0 })

  let hojas = await google.getSheetMeta(ID)
  const escritas = []
  for (const [i, t] of TRAMOS.entries()) {
    // EL ALCANCE, ANTES DE CUALQUIER LECTURA O ESCRITURA DE ESTA PESTAÑA. Con --solo, la que no fue
    // nombrada no se toca ni con --force: es la diferencia entre "regenerá el cuadro de deuda" y
    // "regenerá las dos pestañas", que no es lo mismo cuando el dueño reescribió una de las dos.
    if (SOLO && t.titulo !== SOLO) { console.log(`  ⏭ ${t.titulo}: fuera del alcance (--solo ${SOLO}), no la toco`); continue }
    if (t.saltear) { console.log(`  ⛔ ${t.titulo}: ${t.saltear} — no escribo una sola celda de esta pestaña`); continue }
    // LA FILA DONDE ARRANCA LO QUE SE ESCRIBE. 1 en una pestaña propia del generador; la FRONTERA en
    // "Proveedores", donde arriba viven el hero y las dos dinámicas. TODO lo que sigue —lecturas,
    // fusión, cola, formato— se corre con este offset: escribir una sola fila por encima de la
    // frontera reemplaza una tabla dinámica por texto y la mata en silencio.
    const filaArranque = t.enFrontera ? t.desdeFila : 1
    // EL TÍTULO VA EN ORACIÓN, NO EN VERSALITA. Una pestaña entera gritando es la marca de una
    // planilla, no de un statement: la versalita se reserva para los títulos de sección.
    // En la pestaña con frontera NO hay título ni subtítulo propios: están arriba de la frontera y
    // son de otro. El bloque arranca directo en su primer título de sección.
    const filasP = t.enFrontera ? [...partes[i].filas] : [[t.titulo], [t.subtitulo], [], ...partes[i].filas]
    // EL ALTO NO SE RELLENA ACÁ. La cola de un diseño anterior más largo la resuelve el barrido de
    // cola, más abajo, y mejor: manda la cola entera y deja que `no-borrar` verifique celda por celda
    // qué se puede probar del generador. Emitir filas vacías hasta el footprint viejo sería un segundo
    // mecanismo, más romo, borrando encima del primero.
    // EL BLOQUE ES DUEÑO DE TODO SU ANCHO: lo que no llena, lo LIMPIA. El ancho no lo decide la fila
    // más larga del día —si hoy hay menos columnas que ayer, las de ayer quedarían clavadas— sino el
    // declarado del bloque. Ver lib/proveedores-frontera.mjs: es el defecto de las columnas "Anula la
    // factura" / "La reemplaza", que mostraban restos de otro proveedor.
    const anchoP = anchoALimpiar({ nuevas: filasP, declarado: t.anchos.length })
    // LOS ANCHOS SALEN DEL CONTENIDO, con los declarados como piso: un ancho escrito a mano se queda
    // corto en cuanto cambia un rótulo, y el texto se corta sin que nadie se entere.
    t.anchos = anchosSegunContenido(filasP, { base: t.anchos, max: 300 })
    const cuadroP = aAnchoCompleto(filasP, anchoP, VACIO)
    /** La última fila (1-indexada) que ocupa el bloque en la pestaña. */
    const filaFin = filaArranque + cuadroP.length - 1

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
    if ((hoja.rows ?? 0) < filaFin + 10) reqG.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filaFin + 30 } }, fields: 'gridProperties.rowCount' } })
    if ((hoja.cols ?? 0) < anchoP) reqG.push({ appendDimension: { sheetId: hoja.sheetId, dimension: 'COLUMNS', length: anchoP - (hoja.cols ?? 0) + 2 } })
    if (reqG.length) await google.spreadsheetBatchUpdate(ID, reqG)

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
    // LAS DOS LECTURAS ARRANCAN EN LA FRONTERA, igual que la escritura: así el índice 0 de `previo`,
    // de `visible` y de `cuadroP` es la MISMA fila de la pestaña. Leer desde A1 y escribir desde la
    // frontera desalinea la fusión y la Regla 0 celda por celda — el defecto de la grilla mezclada.
    const anchoLeer = Math.max(anchoP, hoja.cols ?? anchoP)
    const previo = await google.readSheetValues(
      ID, `${refPestana(t.titulo)}!A${filaArranque}:${letra(anchoLeer - 1)}${filaFin}`, { render: 'FORMULA' },
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
    // ═══ ESTA LECTURA NO PUEDE FALLAR EN SILENCIO (31/07) ═══
    //
    // El dueño: "me rompiste proveedores nuevamente". La pestaña quedó con filas ENTRELAZADAS: dos
    // "Gerson Castro", dos "Alumetal", fechas dibujadas "$46.234" y su propio aviso avisando que
    // faltaban 2 facturas. La causa fue este `.catch(() => previo)`: cuando la API contestó 429, la
    // lectura del TEXTO VISIBLE se reemplazó por `previo`, que viene con render FORMULA. La Regla 0
    // compara rótulo por rótulo contra ese texto, así que juzgó "=IF(...)" donde tenía que leer "Gerson
    // Castro": decidió mal celda por celda y la grilla salió mezclada — la mitad del bloque nuevo y la
    // mitad del viejo.
    //
    // Un fallback que cambia la SEMÁNTICA del dato es peor que un error: el error se ve, el fallback
    // escribe. Si no se puede leer lo que la pestaña muestra, no se puede decidir qué es del dueño, y
    // entonces NO SE ESCRIBE. Falla cerrado y la corrida siguiente lo hace bien.
    const visible = await google.readSheetValues(
      // Sin techo de filas: ver la nota de caja-pestana.mjs. "TOTAL FACTURADO" vive en la fila 202 y
      // toda lectura acotada a la grilla nueva lo daba por borrado.
      ID, `${refPestana(t.titulo)}!A${filaArranque}:${letra(anchoLeer - 1)}`,
    ).catch((e) => {
      throw new Error(`no pude leer el texto visible de "${t.titulo}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas y la pestaña sale mezclada.`)
    })
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
    // EL RANGO ARRANCA EN LA FRONTERA. Con `A1` acá se escribiría el bloque entero encima del hero y
    // de las dos tablas dinámicas: la escritura las reemplaza por texto y las mata sin un solo error.
    await google.batchUpdateValues(ID, [{ range: `${refPestana(t.titulo)}!A${filaArranque}`, values: fusion }], { yaGuardado: FORCE })
    if (conservadas.length) console.log(`  ✋ ${t.titulo}: ${conservadas.length} celda(s) escritas por el dueño — CONSERVADAS, no se borra nada`)

    // ═══ LA COLA DE UN DISEÑO ANTERIOR MÁS LARGO ═══
    //
    // "Lo que esté MÁS abajo no se toca" protege lo que el dueño anota debajo de la tabla, y por eso
    // sigue siendo la regla. Pero deja huérfana para siempre la cola de un diseño anterior MÁS LARGO:
    // un rediseño escribió 241 filas, se volvió al diseño de 199, y las filas 200 a 242 quedaron ahí
    // —una segunda copia de las facturas emitidas, una sección de ARCA repetida, una "libreta" que ya
    // no existía—. El dueño lo vio antes que ningún control: "dejaste un desastre en proveedores".
    //
    // No se limpia con clearValues (eso ya borró su trabajo varias veces): se borra SÓLO lo que se
    // puede PROBAR que es del generador — un rótulo del registro, o una forma que sólo produce él (un
    // importe, una fecha, un CUIT, un rótulo de sección). Lo que no se puede probar se conserva y se
    // dice, para que no se vaya sin dejar rastro.
    //
    // ═══ POR QUÉ ESTE BARRIDO NO LIMPIABA NADA (13/08) ═══
    //
    // Escribía cadenas vacías sobre la cola… y `no-borrar.mjs` —la guarda sin bypass que corre al
    // final de TODA escritura— las revertía celda por celda: "si el valor nuevo está vacío y el
    // destino tiene algo, gana el destino". El generador imprimía "🧹 limpié N filas" y no limpiaba
    // ninguna. Así sobrevivió el fragmento de las filas 229-230 de "Proveedores", que decía 456
    // comprobantes / $179.091.614 donde el bloque vivo dice 380 / $126.944.008: $52,1M de
    // contradicción publicados en la pestaña que el dueño lee.
    //
    // Ahora el pedido de vaciar viaja con el registro de rótulos (`vaciarPropio`) y lo VERIFICA la
    // guarda, sobre el destino que ella misma relee. Por eso ya no hace falta elegir filas acá: se
    // manda la cola entera y la decisión se toma celda por celda, que es la granularidad correcta —la
    // fila 229 real tiene tres celdas probadamente mías y una nota que no lo es, y con la decisión por
    // fila esa nota congelaba a las otras tres para siempre.
    //
    // CON TECHO. La cola se mira hasta MAX_COLA filas más abajo del bloque, no hasta el final de la
    // hoja: rellenar a ciegas hasta el borde ya borró 14 fechas del dueño, y una copia huérfana vive
    // pegada al bloque (las que se midieron están a ±50 filas, el alto de la dinámica de la sección 2).
    const MAX_COLA = 120
    const colaCruda = await google.readSheetValues(
      ID, `${refPestana(t.titulo)}!A${filaFin + 1}:${letra(anchoLeer - 1)}${filaFin + MAX_COLA}`,
    ).catch(() => [])
    if (colaCruda.length) {
      const { mios } = await leerRegistro(ID, t.titulo).catch(() => ({ mios: [] }))
      const vacias = colaCruda.map(() => Array.from({ length: anchoP }, () => ''))
      await google.batchUpdateValues(
        ID, [{ range: `${refPestana(t.titulo)}!A${filaFin + 1}`, values: vacias }],
        { yaGuardado: FORCE, vaciarPropio: { mios } },
      )
      console.log(`  🧹 ${t.titulo}: reviso la cola (filas ${filaFin + 1}–${filaFin + colaCruda.length}) — se vacía sólo lo que se prueba mío`)
    }
    await sellarFirma(google, ID, t.titulo, refPestana(t.titulo))
    await guardarRegistro(ID, t.titulo, cuadroFinal, ediciones, visible, candidatos)
      .catch((e) => console.warn(`  ⚠ ${t.titulo}: no pude guardar el registro de rótulos: ${e.message}`))

    const gP = { ...traducir(t.titulo), filas: cuadroP }
    await formatear(google, hoja.sheetId, gP, anchoP, cuadroP.length, { filaArranque })

    // ═══ EL TÍTULO, LOS ANCHOS DE COLUMNA Y LAS FILAS CONGELADAS SON DE LA PESTAÑA ENTERA ═══
    //
    // Y la pestaña entera ya no es de este generador cuando hay frontera: el título vive arriba, y el
    // ancho de una columna vale también para las filas de las tablas dinámicas. Tocarlos desde acá es
    // escribir por encima de la frontera por otra vía — la del formato, que no deja error pero deja
    // los cuadros del dueño descuadrados. En la pestaña con frontera, no se tocan.
    if (t.enFrontera) console.log(`  ${t.titulo}: no toco el título, los anchos de columna ni las filas congeladas — son de toda la pestaña, y arriba de la fila ${filaArranque} manda otro`)
    else await google.spreadsheetBatchUpdate(ID, [
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: anchoP }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { bold: true, fontSize: 15, foregroundColor: INK, fontFamily: 'Arial' }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)' } },
      { updateBorders: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: anchoP }, bottom: { style: 'SOLID', width: 1, color: HAIR } } },
      { repeatCell: { range: { sheetId: hoja.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: anchoP }, cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
      { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
      // LOS ANCHOS SON EL MOTIVO DE TODO ESTO. Cada pestaña declara los suyos según lo que lleva su
      // única tabla, que es exactamente lo que no se podía hacer con las ocho apiladas.
      ...t.anchos.map((px, j) => ({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
      { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    ])
    // LA GRILLA ESCRITA VIAJA CON LA PESTAÑA: los grupos +/- y los rangos con nombre se calculan DESPUÉS
    // de escribir, y tienen que mirar la forma que quedó, no la que se planeó. Ver lib/deuda-geometria.
    escritas.push({ titulo: t.titulo, filas: cuadroP.length, filaArranque, filaFin, sheetId: hoja.sheetId, grid: cuadroP })
    console.log(`  ${t.titulo.padEnd(32)} ${String(cuadroP.length).padStart(4)} filas x ${anchoP} columnas (filas ${filaArranque}–${filaFin} de la pestaña)`)
  }

  // ═══ EL BLOQUE DE DEUDA YA NO LO ESCRIBE ESTE GENERADOR ═══
  //
  // La sección 1 es una tabla dinámica. Todo lo que sigue —el respaldo de comentarios por proveedor y
  // los grupos +/-— es maquinaria DE ESE BLOQUE, y correrla sobre lo que hoy derrama la dinámica sería
  // leer sus celdas como si fueran mías: guardaría en public.proveedor_notas textos que no son notas,
  // y borraría los grupos +/- que arma el otro script. Se ejecuta sólo si el bloque de deuda está de
  // verdad en lo que se escribió.
  const conDeuda = escritas.find((e) => e.titulo === NOMBRES.proveedores && bloqueDeDeuda(e.grid || []))
  if (!conDeuda) {
    console.log('  ⏭ el bloque de deuda es una tabla dinámica: no toco el respaldo de comentarios ni los grupos +/- — son suyos, no míos')
  }

  // ═══ EL RESPALDO DE NOTAS, DESPUÉS DE ESCRIBIR ═══
  //
  // Se relee la columna Comentarios de la pestaña y se concilia con el respaldo: lo que el dueño
  // escribió gana y se guarda; lo que borró estando el proveedor EN la lista (y habiéndola escrito yo
  // antes) se borra; lo que puse desde el respaldo se marca, para poder distinguir la próxima vez un
  // borrado suyo de una nota que todavía no llegó a la pestaña. Ver lib/proveedor-notas.mjs.
  try {
    const hojaP = conDeuda
    if (hojaP) {
      const L = g.deudaL
      const vistas = await google.readSheetValues(ID, `${refPestana(NOMBRES.proveedores)}!A${hojaP.filaArranque}:${letra(Math.max(g.anchoDeuda, 8) - 1)}${hojaP.filaFin}`)
      const enPestana = new Map(); const presentes = new Set()
      for (const gp of deudaAgrupada) presentes.add(claveProv(gp.nombre))
      for (const f of vistas) {
        const nombre = String(f?.[L.prov] ?? '').trim()
        if (!nombre || !presentes.has(claveProv(nombre))) continue
        enPestana.set(claveProv(nombre), String(f?.[L.nota] ?? '').trim())
      }
      const { guardar, borrar } = conciliarNotas(enPestana, notasBase, presentes, yaEscritas(notasBase))
      // La grafía que se guarda es la que él usa hoy en Compras.
      const grafia = new Map(deudaAgrupada.map((gp) => [claveProv(gp.nombre), gp.nombre]))
      if (guardar.length) { await guardarNotas(ID, guardar.map((x) => ({ ...x, proveedor: grafia.get(x.clave) ?? x.clave }))); console.log(`  📓 respaldo de notas: ${guardar.length} guardada(s)`) }
      // ═══ EL BORRADO AUTOMÁTICO ESTÁ APAGADO (31/07) ═══
      //
      // La conciliación borró 10 de las 14 notas del dueño en una corrida del pipeline: leyó "celda
      // vacía" donde las notas SÍ estaban en la pestaña (11 visibles), así que el discriminador falló y
      // el mecanismo destruyó dato suyo. No pude reproducirlo en el momento, y un mecanismo que borra
      // trabajo del dueño y no se puede verificar NO PUEDE ESTAR ACTIVO: se reporta y no se ejecuta.
      //
      // Con --borrar-notas se ejecuta, para cuando se pueda probar en frío qué lo disparó.
      if (borrar.length) {
        if (process.argv.includes('--borrar-notas')) {
          await borrarNotas(ID, borrar)
          console.log(`  🗑 respaldo de notas: ${borrar.length} borrada(s) por --borrar-notas (${borrar.join(', ')})`)
        } else {
          console.log(`  ⚠ la conciliación cree que borraste ${borrar.length} nota(s) (${borrar.join(', ')}) — NO las borro: este discriminador ya destruyó 10 notas tuyas una vez. Con --borrar-notas se aplica.`)
        }
      }
      if (g.notasPuestas?.size) { await marcarEscritas(ID, [...g.notasPuestas]); console.log(`  📓 ${g.notasPuestas.size} nota(s) devueltas desde el respaldo a su proveedor`) }
    }
  } catch (e) { console.warn(`  ⚠ no pude conciliar el respaldo de notas: ${e.message}`) }

  // Los nombres, DESPUÉS de escribir: se corren de fila según cuántas notas de crédito o
  // proveedores haya, y publicarlos antes los dejaría apuntando a la geometría vieja, en silencio.
  // ═══ SI LA PESTAÑA NO SE ESCRIBIÓ, ACÁ NO SE TOCA NADA ═══
  //
  // POR QUÉ (31/07). `hojaArca` es undefined cuando la pestaña quedó fuera de la corrida —candado del
  // dueño, firma editada, --solo apuntando a la otra— y la línea siguiente hacía `hojaArca.sheetId`:
  // el script MORÍA ahí. Se caía justo después de escribir, así que se perdían en silencio los grupos
  // +/-, los rangos con nombre, el respaldo de notas y la verificación de celdas en error. Un skip es
  // una decisión legítima del sistema; tiene que terminar la corrida, no abortarla.
  // El contador de defectos que decide si se puede retirar la pestaña vieja. Se declara ACÁ porque
  // un rango con nombre apuntando a basura cuenta como defecto igual que una celda en `#REF!`: las
  // dos hacen que otra pestaña muestre un número equivocado sin dar error.
  let err = 0
  const hojaArca = escritas.find((e) => e.titulo === NOMBRES.proveedores)
  if (!hojaArca) {
    console.log(`  ⏭ "${NOMBRES.proveedores}" no se escribió en esta corrida: no toco sus grupos +/- ni sus rangos con nombre. La geometría de la pestaña sigue siendo la de su última escritura, que es lo correcto.`)
  } else {
    // Los marcadores traducidos del PLAN ya no se usan acá y no vuelven: son la foto de índices
    // calculados mientras se armaba la grilla, la misma que descolocó los grupos +/- y los doce
    // rangos con nombre. Lo que decide es la grilla escrita.

    // ── LA FUNCIÓN AGRUPAR (el +/-): un grupo de filas por proveedor en la deuda ───────────────────
    // El dueño la pidió por nombre: "te pedí la función agrupar". Cada proveedor de la deuda es un grupo
    // colapsable — la fila-cabecera (total + próximo pago) queda a la vista y sus facturas se pliegan
    // con el +/-. Primero se BORRAN los grupos viejos (la API los APILA, no los reemplaza; sin esto el
    // agente que rehace el cuadro cada 2 horas dejaría una escalera de +/- creciendo sola) y recién
    // después se crean los nuevos.
    //
    // ═══ LOS GRUPOS SALEN DE LA GRILLA ESCRITA, NO DE ÍNDICES PREVIOS (31/07) ═══
    //
    // Medido en el archivo vivo: había once +/- corridos dos filas — uno de ellos plegaba dos filas
    // VACÍAS, y las dos facturas del último proveedor quedaban afuera de todo grupo. Venían de
    // `deudaGrupos`, números de fila calculados mientras se armaba la grilla y traducidos por `donde`:
    // la misma foto vieja que descolocaba el formato. Ahora se clasifica la grilla que se escribió.
    //
    // ═══ Y SÓLO SI EL BLOQUE DE DEUDA ES MÍO ═══
    //
    // Con la sección 1 hecha tabla dinámica, `geo` da null y lo único que quedaba de este tramo era el
    // BORRADO de todos los grupos de la pestaña: le sacaría el +/- a un cuadro que no armé yo. Los
    // rangos con nombre de ARCA, en cambio, apuntan a un bloque que sí escribo y se siguen publicando.
    if (!conDeuda) console.log('  ⏭ los grupos +/- son de la tabla dinámica: no los toco (ni los borro)')
    else {
      const geo = (() => {
        const b = bloqueDeDeuda(hojaArca.grid || [])
        if (!b) return null
        const L = g.deudaL || {}
        return clasificarDeuda(hojaArca.grid || [], {
          prov: L.prov ?? 0, comp: L.comp ?? 2, imp: L.imp ?? 3, desde: b.desde, hasta: b.hasta,
        })
      })()
      const gruposPrevios = (await google.getRowGroups(ID)).find((x) => x.sheetId === hojaArca.sheetId)?.grupos ?? []
      const reqGr = gruposPrevios.map((v) => ({ deleteDimensionGroup: { range: { sheetId: hojaArca.sheetId, dimension: 'ROWS', startIndex: v.startIndex, endIndex: v.endIndex } } }))
      // MOSTRAR TODAS LAS FILAS primero: borrar un grupo colapsado deja las filas con hiddenByUser=true, y
      // esas quedan ocultas aunque el grupo nuevo abra expandido. Se limpia toda la pestaña de una.
      reqGr.push({ updateDimensionProperties: { range: { sheetId: hojaArca.sheetId, dimension: 'ROWS', startIndex: 3, endIndex: hojaArca.filas }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
      let nGrupos = 0
      for (const gp of (geo?.grupos ?? [])) {
        const range = { sheetId: hojaArca.sheetId, dimension: 'ROWS', startIndex: gp.inicio - 1, endIndex: gp.fin }
        reqGr.push({ addDimensionGroup: { range } })
        // ABIERTOS por defecto: el dueño quiere VER el N° de comprobante de cada factura sin tener que
        // desplegar. El +/- queda igual para plegar el proveedor que no interese. (Antes arrancaban
        // colapsados y parecía que los comprobantes no estaban.)
        reqGr.push({ updateDimensionGroup: { dimensionGroup: { range, depth: 1, collapsed: false }, fields: 'collapsed' } })
        // FORZAR VISIBLE: borrar un grupo colapsado deja las filas con hiddenByUser=true, y expandir el
        // grupo nuevo NO las vuelve a mostrar. Sin esto, algunas facturas quedaban ocultas en silencio.
        reqGr.push({ updateDimensionProperties: { range, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
        nGrupos++
      }
      if (reqGr.length) await google.spreadsheetBatchUpdate(ID, reqGr)
      console.log(`  función agrupar: ${nGrupos} grupos de deuda (uno por proveedor con facturas), expandidos`
        + `${geo ? ` · ${geo.cabeceras.length} proveedores, ${geo.detalles.length} facturas, ${geo.vacias.length} fila(s) en reserva` : ''}`)
    }
    // ═══ LA FILA SE CALCULA DESDE LA GRILLA ESCRITA, EN LA MISMA CORRIDA (13/08) ═══
    //
    // El 05/08 esto dejó de usar los índices del plan —que ya habían descolocado los grupos +/-— y
    // pasó a releer la columna A de la pestaña quedándose con la ÚLTIMA fila cuyo texto empezaba con
    // el rótulo. Medido hoy en el archivo vivo: la pestaña tiene TRES copias del bloque (una fósil en
    // la 126, la buena en la 177-182 y un fragmento huérfano en la 229-230), así que "el último"
    // resultó ser el fragmento huérfano y ARCA_EN_COMPRAS_N/MONTO quedaron publicados sobre
    // 456 · $179.091.614 mientras el bloque bueno dice 380 · $126.944.008. Anclar en "el último" es
    // anclar en la posición: no dice nada sobre cuál de las tres copias es la de esta corrida.
    //
    // Lo único que este generador PUEDE afirmar es qué escribió él, y eso está en `hojaArca.grid`:
    // fila `i` de la grilla es la fila `filaArranque + i` de la pestaña, la misma aritmética con la
    // que se acaban de clasificar los grupos de deuda acá arriba. Los rótulos vienen de
    // `LINEAS_ARCA`, la misma constante con la que se escribieron. Ver lib/bloque-arca-nombres.mjs.
    const { destinos: destinosArca, faltan: sinRotulo, cabecera, cabeceras } =
      destinosDeArca(hojaArca.grid || [], hojaArca.filaArranque)
    if (cabecera) console.log(`  bloque de cobertura de ARCA en la fila ${cabecera} de "${NOMBRES.proveedores}" (de la grilla escrita, no de releer la pestaña)`)
    if (cabeceras > 1) { err++; console.log(`  ⚠ ${cabeceras} cabeceras "${CABECERA_ARCA}" en la grilla que escribo: el bloque está duplicado en mi propio cuadro y no sé cuál es el bueno`) }
    // ═══ UNA LÍNEA QUE NO SE EMITE NO DEJA SU NOMBRE DONDE ESTABA ═══
    //
    // Antes esto avisaba y seguía: "sus rangos con nombre NO se reapuntan — se quedan donde estaban".
    // Es la peor de las opciones. Un nombre clavado en la fila de un layout anterior no da error, no
    // descuadra y no se ve en la pestaña que lo define: se ve tres pestañas más allá mostrando un
    // CUIT donde prometía plata. Es exactamente lo que le pasó a ARCA_SIN_NUMERO_N el 13/08.
    //
    // Los seis rótulos los escribe ESTE generador dos párrafos más arriba, con la misma constante. Si
    // uno no está en la grilla, no falta un dato del negocio: está roto el generador. Se cuenta como
    // error —no se retira ninguna pestaña vieja y la corrida sale con código != 0— y el control de
    // más abajo dice a dónde quedó apuntando cada nombre huérfano.
    if (sinRotulo.length) {
      err += sinRotulo.length
      console.log(`  ⚠ ${sinRotulo.length} línea(s) del bloque ARCA no están en la grilla que escribí: `
        + `${sinRotulo.join(' · ')}. Sus rangos con nombre quedan donde estaban y eso NO es seguro — se verifica abajo.`)
    }
    const nombres = await publicar(google, ID, hojaArca.sheetId, destinosArca, { titulo: NOMBRES.proveedores })
    console.log(`  ${nombres.nombres} rangos con nombre publicados: el Cash Flow los referencia en vez de copiarlos`
      + (nombres.verificado ? '' : ' — ⚠ NO pude releerlos: no sé a qué apuntan'))
    // ═══ LO QUE PRUEBA LA PUBLICACIÓN ES EL DATO LEÍDO EN SU DESTINO ═══
    // Un 200 de la API sólo dice que el nombre existe. Que apunte a un importe donde promete un
    // importe se sabe releyendo. Cuando no da, el daño no se ve acá: se ve en Recurrentes, en
    // Estructura, en Materiales y en el Cash Flow Mensual, que muestran lo que haya en esa celda.
    for (const m of nombres.malApuntados) {
      console.log(`  ⚠ RANGO CON NOMBRE MAL APUNTADO: ${m.name} → ${refPestana(NOMBRES.proveedores)}!${letra(m.col - 1)}${m.fila} `
        + `= ${JSON.stringify(m.valor)} (${m.encontro}, se esperaba ${m.espera}). Las pestañas que lo leen van a mostrar eso.`)
    }
    if (nombres.malApuntados.length) err += nombres.malApuntados.length

    err += await verificarNombresVivos(google, hojaArca.sheetId)
  }

  // ═══ VERIFICACIÓN ANTES DE RETIRAR LA PESTAÑA VIEJA ═══
  // No se borra nada hasta comprobar que las cuatro nuevas están escritas y sin errores.
  for (const e of escritas) {
    // SÓLO EL TRAMO ESCRITO: una celda en error arriba de la frontera es de la dinámica, no mía, y
    // contarla haría que este generador se frene por un defecto que no puede arreglar.
    const v = await google.readSheetValues(ID, `${refPestana(e.titulo)}!A${e.filaArranque}:T${e.filaFin}`)
    v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) { err++; if (err <= 8) console.log(`  ⚠ ${e.titulo}!${letra(j)}${e.filaArranque + i} = ${c}`) } }))
  }
  console.log(err ? `\n⚠ ${err} celdas en error: NO retiro la pestaña vieja` : '\n✓ las cuatro pestañas, sin una sola celda en error')
  // ═══ ESTO SALE CON CÓDIGO != 0, NO CON UN AVISO (13/08) ═══
  //
  // Hasta hoy la corrida terminaba en 0 con los avisos impresos, y el pipeline la contaba entre las
  // pestañas rehechas: un ⚠ en un log de 60 pasos no lo lee nadie dos veces. Un rango con nombre mal
  // apuntado es plata equivocada mostrada en otra pestaña — el criterio de la casa es que eso es peor
  // que no escribir. Las celdas ya están escritas cuando se llega acá, así que "abortar" sólo puede
  // significar dos cosas, y se hacen las dos: no se retira ninguna pestaña vieja (arriba) y el paso
  // se reporta como FALLADO. El pipeline sigue con los demás generadores; ver flujo-caja-rehacer-todo.
  if (err) process.exitCode = 1

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

  console.log(`  ARCA: ${g.afip1 - g.afip0 + 1} comprobantes facturados que Compras no tiene`)
}

/**
 * DÓNDE QUEDARON APUNTANDO LOS DOCE NOMBRES — LEÍDO DEL ARCHIVO, NO DE LA LISTA QUE SE MANDÓ.
 *
 * ═══ UN CONTROL NO SE VALIDA CONTRA LA INFORMACIÓN QUE PRODUCE ═══
 *
 * `publicar` verifica el destino que se le PIDIÓ y, si no convence, no publica. Está bien: apuntar a
 * basura es peor. Pero entonces el nombre se queda donde estaba y ESO no lo mira nadie. El 13/08
 * salieron por esa puerta ARCA_COMPRAS_TOTAL (fila 126, un número de comprobante) y ARCA_SIN_NUMERO_N
 * (fila 129, un CUIT), y la corrida cerró informando "1 celda en error".
 *
 * Acá se relee la tabla de rangos con nombre DEL ARCHIVO —otra fuente que la que produjo el
 * resultado— y se vuelve a preguntar lo mismo que promete cada nombre: ¿hay un importe donde dice
 * importe, un entero donde dice contador? Lo que no da, se grita y se cuenta como error.
 *
 * @param {object} google
 * @param {number} sheetId la pestaña donde tienen que vivir los doce
 * @returns {Promise<number>} cuántos nombres quedaron apuntando a algo que no es lo que prometen
 */
async function verificarNombresVivos(google, sheetId) {
  const rangos = await google.getNamedRanges(ID).catch(() => null)
  // NO PODER LEER NO ES "ESTÁ BIEN". Se dice que no se verificó y no se inventa un cero tranquilizador.
  if (!rangos) { console.log('  ⚠ no pude releer los rangos con nombre del archivo: NO sé a dónde quedaron apuntando'); return 1 }

  const { destinos, ausentes, enOtraPestana } = dondeViveCadaNombre(NOMBRES_ARCA, rangos, sheetId)
  let malos = 0
  for (const n of ausentes) { malos++; console.log(`  ⚠ ${n} NO existe en el archivo: toda fórmula que lo cite da #NAME?`) }
  for (const n of enOtraPestana) { malos++; console.log(`  ⚠ ${n} quedó apuntando FUERA de "${NOMBRES.proveedores}": ya no significa lo que promete`) }
  if (!destinos.length) return malos

  const f0 = Math.min(...destinos.map((d) => d.fila)), f1 = Math.max(...destinos.map((d) => d.fila))
  const c0 = Math.min(...destinos.map((d) => d.col)), c1 = Math.max(...destinos.map((d) => d.col))
  // UNA sola lectura del rectángulo que los cubre a todos, y SIN formatear: "$209.231.271" formateado
  // es un string y un número de comprobante también, así que el formato borra justo la distinción.
  const leido = await google.readSheetValues(
    ID, `${refPestana(NOMBRES.proveedores)}!${letra(c0 - 1)}${f0}:${letra(c1 - 1)}${f1}`, { render: 'UNFORMATTED_VALUE' },
  ).catch(() => null)
  if (!leido) { console.log('  ⚠ no pude releer las celdas de los rangos con nombre: NO verifico a qué apuntan'); return malos + 1 }

  for (const m of desalineados(destinos, (d) => (leido[d.fila - f0] || [])[d.col - c0])) {
    malos++
    console.log(`  ⚠ RANGO CON NOMBRE QUE QUEDÓ MAL: ${m.name} vive en ${refPestana(NOMBRES.proveedores)}!${letra(m.col - 1)}${m.fila} `
      + `= ${JSON.stringify(m.valor)} (${m.encontro}, promete ${m.espera}). Toda pestaña que lo cite muestra eso HOY.`)
  }
  if (!malos) console.log(`  ✓ los ${destinos.length} rangos con nombre de ARCA apuntan a lo que prometen — verificado releyendo el archivo`)
  return malos
}

/**
 * @param {object} google
 * @param {number} sheetId
 * @param {object} g marcadores ya traducidos a filas REALES de la pestaña (1-indexadas)
 * @param {number} ancho
 * @param {number} filas cuántas filas ocupa el bloque
 * @param {{filaArranque?:number}} [opts] la fila real donde empieza `g.filas[0]`. Es 1 en una pestaña
 *        propia y la FRONTERA cuando arriba hay tablas dinámicas: todo lo que se calcula por índice
 *        de la grilla se corre con este offset. Sin él, el reset de formato del principio —que borra
 *        bordes, notas y colores de `r(0, filas)`— caería sobre las dinámicas.
 */
async function formatear(google, sheetId, g, ancho, filas, { filaArranque = 1 } = {}) {
  /** El desplazamiento 0-indexado entre la grilla y la pestaña. */
  const F0 = filaArranque - 1
  // LA PIEL ES DE STATEMENT: sin barras de color, la estructura se marca con tipografía (tinta INK,
  // versalita apagada MUTED) y líneas finas (HAIR). Ver lib/estilo-statement.mjs. Las bandas azules
  // y grises que había antes son justo lo que hace ver una pestaña como planilla y no como JPMorgan.
  const r = (r0, r1, c0 = 0, c1 = ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  // La columna "Comentarios" del dueño (la que agregó a la derecha del todo): nunca se trunca. Se deja
  // DERRAMAR sobre las columnas vacías de la derecha, como la nota al margen de un statement, en vez de
  // cortarla en el borde de la celda. Antes quedaba en CLIP a 108px y se comía media frase.
  const iComent = ((g.deudaL || {}).cols || []).findIndex((h) => /coment/i.test(String(h ?? '')))
  // ═══ PRIMERO SE BORRA TODO, DESPUÉS SE PINTA ═══
  //
  // POR QUÉ (21/07). Este formateador sólo APLICABA formatos, nunca los sacaba. Mientras el layout
  // no cambió, no se notó. El día que reordené los bloques, las bandas azules de los encabezados
  // viejos quedaron pintadas en las filas donde estaban antes —en el medio de la nada— y la pestaña
  // se volvió ilegible. El dueño: "esa pestaña es completamente inútil", y tenía razón.
  //
  // Un formato es tan persistente como un dato: si el cuadro se rehace entero, el formato también.
  const req = [
    { unmergeCells: { range: r(F0, F0 + filas) } },
    // ═══ LAS NOTAS VIEJAS TAMBIÉN SE BORRAN ═══
    //
    // clearValues borra el VALOR de una celda, no su NOTA (comentario). Cuando la pestaña cambia de
    // layout, las notas viejas quedan pegadas a la celda por posición y terminan describiendo el dato
    // equivocado: en el PDF se veía "⇒ Diferencia contra el total" colgada de una fila de PEREZ
    // GARCIA. Un formato es tan persistente como un dato, y una nota también: si el cuadro se rehace
    // entero, las notas viejas se van con él.
    { repeatCell: { range: r(F0, F0 + filas, 0, Math.max(ancho, 26)), cell: {}, fields: 'note' } },
    {
      // EL RESET CUBRE LAS COLUMNAS DE SOBRA, no sólo las que tienen dato. La hoja tiene más columnas
      // que la tabla (Materiales: 19 vs 17), y las de sobra guardaban un relleno oscuro de un layout
      // viejo —se veía como un rectángulo negro en la esquina del título—. clearValues no lo saca; el
      // reset de formato sí, pero sólo si llega hasta esas columnas.
      repeatCell: {
        range: r(F0, F0 + filas, 0, Math.max(ancho, 26)),
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
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: F0, endIndex: F0 + filas }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
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
  req.push({ updateBorders: { range: r(F0, F0 + filas, 0, Math.max(ancho, 26)), top: { style: 'NONE' }, bottom: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' }, innerHorizontal: { style: 'NONE' }, innerVertical: { style: 'NONE' } } })
  // UN ENCABEZADO ES TEXTO, NUNCA PLATA. Arriba se aplica moneda a la columna B en adelante de TODA la
  // pestaña (es lo correcto para las cinco tablas de importes que lleva), y este ayudante vestía los
  // encabezados sin devolverles su formato de número: "Próximo pago", "Comprobante", "Obra" y "Tipo de
  // Pago" quedaban con formato de moneda. Son 45 de los 58 defectos que encontró auditar-pantalla.mjs
  // en esta pestaña. No mueven un peso: hacen que la pestaña se lea como un borrador.
  const encabezadoStmt = (row, c0 = 0, c1 = ancho) => {
    fmt(r(row - 1, row, c0, c1), 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy',
      { numberFormat: { type: 'TEXT' }, textFormat: { bold: true, fontSize: 9, foregroundColor: MUTED }, backgroundColor: { red: 1, green: 1, blue: 1 }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
    hairBottom(row, c0, c1)
  }
  const totalStmt = (row, c0 = 0, c1 = ancho) => {
    fmt(r(row - 1, row, c0, c1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, foregroundColor: INK }, backgroundColor: { red: 1, green: 1, blue: 1 } })
    hairTop(row, c0, c1)
  }

  fmt(r(F0, F0 + filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })

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

  // `k` es el índice en la GRILLA y `k + F0` la fila de la PESTAÑA: mezclarlos formatea el renglón de
  // al lado, y con la frontera puesta ese renglón puede ser de una tabla dinámica.
  for (const k of titulos) {
    const i = k + F0
    // Sección en tinta con una línea fina arriba — nada de barra celeste.
    fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, fontSize: 11, foregroundColor: INK }, backgroundColor: { red: 1, green: 1, blue: 1 } })
    hairTop(i + 1)
    // La línea de abajo es la explicación del bloque: sólo si tiene texto largo y nada en B.
    const sig = g.filas[k + 1]
    if (sig && String(sig[0] ?? '').length > 40 && !String(sig[1] ?? '').trim()) {
      fmt(r(i + 1, i + 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
        { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' })
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } })
    }
  }
  // El título y el subtítulo de la PESTAÑA viven en sus filas 1 y 2, y con frontera no son de este
  // generador: ahí arriba mandan el hero y las dinámicas. Se visten sólo cuando el bloque arranca en
  // la fila 1, o sea cuando la pestaña entera es suya.
  if (F0 === 0) {
    fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 15, foregroundColor: INK } })
    if (String(g.filas[1]?.[0] ?? '').length > 40) {
      fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
        { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' })
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } })
    }
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
    // E es el aire y F·G llevan "Qué es" y la cadena de comprobantes: texto de punta a punta. El rango
    // sigue al layout, que cambió al saltear la E — un rango de formato clavado en las columnas viejas
    // es como se dibuja un importe con formato de texto sin que nadie lo note.
    fmt({ ...r(g.nc0 - 1, g.nc1, 4, 7) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }
  if (g.anu0 && g.anu1 >= g.anu0) {
    fmt({ ...r(g.anu0 - 1, g.anu1, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    // "Fecha correcta" se corrió de la F a la G al saltear el aire de la E.
    fmt({ ...r(g.anu0 - 1, g.anu1, 6, 7) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
    fmt({ ...r(g.anu0 - 1, g.anu1, 1, 2) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    // Y "Corresponde" (un N° de comprobante, texto) de la E a la F.
    fmt({ ...r(g.anu0 - 1, g.anu1, 5, 6) }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  }
  // Los bloques documentales: comprobante y N° de cheque son TEXTO, y las fechas, fechas.
  fmt({ ...r(g.afip0 - 1, g.afip1, 1, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
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
  // ═══ LA GEOMETRÍA SALE DE LA GRILLA QUE SE ESCRIBE (31/07) ═══════════════════════════════════════
  //
  // EL DEFECTO, medido en el archivo vivo: los valores del cuadro tenían 12 proveedores (filas 19–43)
  // y el formato/negrita/+- tenían 11 (19–41). La última cabecera quedó sin negrita y sus dos facturas
  // dibujadas como plata: la fecha de pago se leía "$46.259". Nadie lo vio porque los controles suman.
  //
  // La causa era el método: estos números de fila se calculaban ARMANDO la grilla, y entre ese momento
  // y el dibujo hay una fusión, una Regla 0 y un candado que pueden cambiar o saltear la escritura. Un
  // índice guardado antes de escribir es la foto de una geometría que puede no ser la que quedó.
  //
  // Ahora se ubica el bloque por el TEXTO de su encabezado y se clasifica cada fila por su FORMA
  // (nombre de proveedor → cabecera; comprobante/importe sin nombre → factura suya; ni una ni otra →
  // vacía). Ver lib/deuda-geometria.mjs. Vale para cualquier cantidad de proveedores y facturas.
  const bloqueD = bloqueDeDeuda(g.filas || [])
  const LD = g.deudaL || {}
  const geoD = bloqueD ? clasificarDeuda(g.filas || [], {
    prov: LD.prov ?? 0, comp: LD.comp ?? 2, imp: LD.imp ?? 3, desde: bloqueD.desde, hasta: bloqueD.hasta,
  }) : null
  if (bloqueD && geoD) {
    const d0 = bloqueD.desde
    const d1 = bloqueD.hasta
    // El formato sigue LAS COLUMNAS DEL DUEÑO, no posiciones fijas: si él mueve "Categoría" o agrega
    // "Comentarios", cada formato acompaña. Las columnas que el generador no llena quedan como texto.
    const L = g.deudaL || {}
    const col1 = (i, fields, cell) => { if (i >= 0) fmt({ ...r(d0 - 1, d1, i, i + 1) }, fields, cell) }
    const FTXT = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat'
    const txtChico = { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9 } }
    for (let i = 0; i < (L.cols?.length ?? 0); i++) col1(i, FTXT, txtChico)
    col1(L.fecha, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: E.NUM.fecha, horizontalAlignment: 'LEFT' })
    col1(L.comp, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
    col1(L.imp, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
    // Comentarios: nota al margen en gris, que derrama a la derecha (OVERFLOW) en vez de truncarse.
    if (iComent >= 0) col1(iComent, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.textFormat',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
    // LA NEGRITA VA DONDE HAY UN PROVEEDOR, no en las filas que alguien contó antes. Se pinta fila por
    // fila desde la clasificación: así una factura de más en el medio del cuadro no descoloca nada.
    for (const h of geoD.cabeceras) {
      fmt({ ...r(h - 1, h, 0, Math.max((L.imp ?? 3) + 1, 4)) }, 'userEnteredFormat.textFormat', { textFormat: { bold: true, foregroundColor: INK, fontSize: 10 } })
    }
    // LAS FILAS VACÍAS DEL CUADRO VUELVEN A TEXTO. Una fila que quedó de una geometría más larga —o el
    // proveedor al que le pagaron y su fórmula ahora devuelve ""— tenía el formato moneda de la columna
    // entera: cualquier residuo se dibujaba como plata o como "$46.259" donde iba una fecha.
    for (const v of geoD.vacias) {
      fmt({ ...r(v - 1, v, 0, ancho) }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat',
        { numberFormat: { type: 'TEXT' }, textFormat: { bold: false, fontSize: 9 } })
    }
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
  // ═══ EL BLOQUE "RESPALDO FISCAL" NO DECLARABA SU FORMATO — Y B52 MOSTRABA "$1" (14/08/2026) ═══
  //
  // Es la única de las tres pestañas que comparten `bloqueControlArca` que no formateaba el bloque:
  // heredaba la moneda de la columna B entera. La fórmula de la cobertura estaba perfecta (0,6614 =
  // 66,1%) y la celda la dibujaba como "$1". El valor NO se toca —sigue siendo la fracción— y lo que
  // se corrige es la celda, igual que con las fechas-serial del Calendario.
  //
  // Los desplazamientos los declara el bloque, que es quien decide el orden de sus filas: escritos a
  // mano acá serían la cuarta copia del mismo número (ver control-arca-bloque.mjs · FILA_BLOQUE).
  if (g.arca0) {
    const fArca = (i) => g.arca0 - 1 + i
    fmt({ ...r(fArca(MONTOS_BLOQUE.desde), fArca(MONTOS_BLOQUE.hasta), 1, 2) },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
    fmt({ ...r(fArca(FILA_BLOQUE.cobertura), fArca(FILA_BLOQUE.cobertura + 1), 1, 2) },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.porcentaje, horizontalAlignment: 'RIGHT' })
    fmt({ ...r(fArca(FILA_BLOQUE.global), fArca(FILA_BLOQUE.global + 1), 1, 2) },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
    // El veredicto es una frase que derrama sobre el ancho del bloque: con formato de moneda, un
    // texto no se rompe, pero la celda queda alineada a la derecha y se lee como si fuera una cifra.
    fmt({ ...r(fArca(FILA_BLOQUE.veredicto), fArca(FILA_BLOQUE.veredicto + 1), 1, 2) },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.texto, horizontalAlignment: 'LEFT' })
  }
  // UNA CANTIDAD DE COMPROBANTES NO ES PLATA. La columna B del bloque de ARCA mostraba "$16" donde
  // dice cuántas facturas emitidas hay: el formato moneda de la columna entera se lo comía.
  if (g.fArcaN && g.fArcaVentas) fmt({ ...r(g.fArcaN - 1, g.fArcaVentas, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: E.NUM.cantidad, horizontalAlignment: 'CENTER' })
  fmt({ ...r(g.fSub, g.fSub + 1, 5, 6) }, 'userEnteredFormat', E.nota())
  // ═══ LA COLUMNA "FECHA" MOSTRABA 46193, 46132, 46119 — Y NO EN TODAS LAS FILAS ═══
  //
  // EL DEFECTO (04/08, lo vio el dueño en el render). En la sección 4 unas filas mostraban "26/2/2026"
  // y otras "46193": el número de serie crudo, en la MISMA columna.
  //
  // LA CAUSA ERA MÍA, y de la peor clase: había DOS `fmt` sobre el mismo rango. El primero declaraba
  // DATE y el segundo, dos líneas más abajo, lo pisaba con TEXT. Quedó así al desarmar el bucle que
  // formateaba a la vez esta tabla y la de facturas emitidas —el bucle recorría columnas 3-4 para una
  // y 1-3 para la otra, y al separarlos copié el rango equivocado—.
  //
  // Con formato TEXT sobre una celda cuyo VALOR ya se guardó como fecha (el string "26/2/2026" entra
  // por USER_ENTERED y Sheets lo convierte a serial), lo que se ve es el número. Y no en todas las
  // filas porque el bloque cambió de alto y de posición: cada fila cayó sobre una celda con la
  // herencia de formato que le tocó. Es la definición del defecto que este archivo persigue hace
  // semanas — UNA COLUMNA QUE NO DECLARA SU FORMATO EN CADA CORRIDA MUESTRA EL DE AYER.
  //
  // Queda UNA sola declaración por columna, de punta a punta del footprint del bloque:
  //   B y C (CUIT, Comprobante) → TEXTO   · se declara más arriba
  //   D (Fecha)                 → DATE    · acá
  //   E (Importe)               → moneda  · la pasada por contenido
  fmt({ ...r(g.afip0 - 1, g.afip1, 3, 4) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: E.NUM.fecha, horizontalAlignment: 'CENTER' })
  for (const f of [g.cabDoc, g.cabAfip, g.cabCtrl]) {
    if (f) encabezadoStmt(f)
  }
  fmt({ ...r(g.fam0 - 1, g.totFam), startColumnIndex: 14, endColumnIndex: 15 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  // ═══ EL FORMATO DE LA SECCIÓN 5 SE DECLARA ENTERO, NO POR EXCEPCIONES (04/08) ═══
  //
  // Acá había un formato de TEXTO en itálica desde la columna C hasta el final del ancho: era la
  // columna de PROSA, la que el dueño borraba a mano y volvía en cada corrida. Ya no existe. Y detrás
  // venían dos parches fila por fila —"esta celda es un contador, no plata"— que había que agregar de
  // nuevo cada vez que nacía un control. La causa raíz era estructural: cantidades e importes
  // compartían la columna B. Ahora B es SIEMPRE cuánto y C es SIEMPRE plata, y las dos declaran su
  // formato de punta a punta del bloque: ninguna hereda de la columna ni de la corrida anterior.
  if (g.ctrl && g.ctrl1 >= g.ctrl) {
    fmt({ ...r(g.ctrl - 1, g.ctrl1, 1, 2) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.cantidad, horizontalAlignment: 'RIGHT' })
    fmt({ ...r(g.ctrl - 1, g.ctrl1, 2, 3) }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
    // Nada a la derecha de la plata: el ancho del bloque es A·B·C y lo que sobra se limpia.
    fmt({ ...r(g.ctrl - 1, g.ctrl1), startColumnIndex: 3, endColumnIndex: ancho }, 'userEnteredFormat.numberFormat',
      { numberFormat: { type: 'TEXT' } })
  }
  fmt(r(g.ctrl - 2, g.ctrl - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
  g.filas.forEach((f, i) => { if (/^⇒/.test(String(f[0] ?? ''))) fmt(r(i + F0, i + F0 + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } }) })
  if (g.fCompFecha) fmt(r(g.fCompFecha - 1, g.fCompFecha, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0" comprobantes"' } })
  // El plazo ponderado son días, no pesos. SE BUSCA POR SU RÓTULO, no por "la última fila": al partir
  // la pestaña dejó de ser la última (debajo quedaron ARCA y emitidas), así que `filas-1` formateaba
  // una celda vacía del final y el plazo real quedaba con formato moneda mostrando "$1" en vez de
  // "0,7 días". Otro defecto que sólo se ve en el PDF, no en un control que suma.
  // El "no está" se decide ANTES de sumarle el offset: con la frontera, un -1 + 1 + F0 daba un número
  // positivo y se formateaba una fila cualquiera de la pestaña.
  const iPlazo = g.filas.findIndex((f) => /^Plazo promedio ponderado/.test(String(f?.[0] ?? '')))
  const filaPlazo = iPlazo >= 0 ? iPlazo + 1 + F0 : 0
  if (filaPlazo > 0) fmt(r(filaPlazo - 1, filaPlazo, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0.0" días"' } })

  // ═══ UN TEXTO NUNCA LLEVA FORMATO DE PLATA — POR CONTENIDO, NO POR BLOQUE (31/07) ═══
  //
  // El formato moneda se aplica a la columna B en adelante de TODA la pestaña (correcto: son cinco
  // tablas de importes) y después cada bloque le devuelve el suyo a las columnas que no son plata. Ese
  // camino se queda corto SIEMPRE: cada tabla nueva, cada columna que el dueño agrega y cada fila de
  // "resto" que cae fuera del rango declarado vuelve a aparecer como texto dibujado con formato de
  // moneda. Volvieron 52 después de arreglar los 45 de los encabezados: la lista cambia, la clase de
  // defecto no.
  //
  // Acá se cierra por CONTENIDO: si la celda que el generador escribe es TEXTO —ni fórmula, ni número,
  // ni importe, ni fecha; la misma definición que usa la Regla 0 para decidir qué es un rótulo— su
  // formato es TEXTO. No hay bloque que declarar ni rango que mantener: vale para lo que ya está y para
  // lo que se agregue mañana. Las celdas que produce una FÓRMULA no entran acá (no se puede saber su
  // tipo sin evaluarla): esas siguen dependiendo de la declaración de su bloque.
  {
    // Sus rangos vienen en coordenadas de la GRILLA (fila 1 = primera fila del bloque): se corren a
    // las de la pestaña. Sin esto, con frontera, pintaría las filas de las dinámicas.
    const { requests: rTxt, celdas } = requestsTextoPorContenido(sheetId, g.filas || [])
    req.push(...rTxt.map((x) => (x.repeatCell?.range
      ? { ...x, repeatCell: { ...x.repeatCell, range: { ...x.repeatCell.range, startRowIndex: x.repeatCell.range.startRowIndex + F0, endRowIndex: x.repeatCell.range.endRowIndex + F0 } } }
      : x)))
    if (celdas) console.log(`  ${celdas} celda(s) de TEXTO con su formato de texto (no de plata) — por contenido, no por bloque`)
  }

  // LOS ANCHOS DE COLUMNA Y LA REJA SON DE LA PESTAÑA ENTERA, no del bloque: valen también para las
  // filas de las tablas dinámicas, que este generador no gobierna. Con frontera no se tocan.
  if (F0 === 0) {
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ancho }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
    // La reja apagada es el mayor salto de "planilla" a "statement". Va con la columna congelada.
    req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1, hideGridlines: true } }, fields: 'gridProperties(frozenColumnCount,hideGridlines)' } })
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

// Sólo corre cuando se invoca directo (node …/proveedores-materiales-pestana.mjs). Importarlo desde
// un test NO dispara main() —que toca Google y la base—: así el test puede probar los helpers puros.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
