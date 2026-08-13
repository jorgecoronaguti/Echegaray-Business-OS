// LOS INSUMOS DEL PLAN DE TRES RODADOS — datos con fuente, cero aritmética.
//
// ═══ POR QUÉ ESTÁ SEPARADO DEL CÁLCULO (13/08/2026) ═══
//
// Mismo corte que `rodados-datos.mjs` ↔ `rodados-financiacion.mjs`: acá vive lo que alguien TRANSCRIBIÓ
// de una fuente (un precio, un saldo del Cash Flow, una tasa de la base) y en `rodados-plan.mjs` vive
// lo que se DERIVA. Cuando el dueño corrige un precio o la Badlar se mueve, se toca un solo archivo y
// las siete tablas se recalculan solas. Un número derivado guardado como constante es una mentira con
// fecha de vencimiento, y en este repo ya costó caro.
//
// ═══ LA ESTRUCTURA DE LA DECISIÓN, QUE NO SE RECALCULA ACÁ ═══
//
// Tres unidades. La primera se necesita en SEPTIEMBRE 2026 y FONDEFIN tarda ~120 días (ver
// `llegaATiempo` en linea-fondefin.mjs): no llega. Por eso la unidad 1 va por el crédito UVA que ya
// está aprobado, y las unidades 2 y 3 por FONDEFIN — que además sólo financia pick-up CABINA SIMPLE,
// así que son C31 y no C32. Renunciar a FONDEFIN por la urgencia de la primera sería pagar las tres
// unidades al costo de la más apurada.

import { PRESUPUESTOS_RODADOS } from './rodados-datos.mjs'
import { CONDICION_FONDEFIN, GASTOS_OTORGAMIENTO, DEMORA_TRAMITE_DIAS } from './linea-fondefin.mjs'
import { ACUERDO } from './banco-santander.mjs'
import { TASAS } from './costo-descubierto.mjs'
import { IPC } from './ipc-publicado.mjs'

/** El presupuesto real del C32, con precio: de ahí salen anticipo, financiado y gastos de retiro. */
export const C32 = PRESUPUESTOS_RODADOS.find((p) => p.clave === 'dfsk-c32-doble-cabina-lepont')

/**
 * EL C31 CABINA SIMPLE — la unidad que FONDEFIN sí financia.
 *
 * No hay presupuesto cerrado de concesionaria: es PRECIO DE LISTA publicado. Por eso `gastosRetiro`
 * va en null y no en un número: en el C32 los gastos de retiro con prenda fueron $3.600.000 sobre un
 * precio de unidad de $33.400.000, y aplicar esa proporción al C31 es una ANALOGÍA, no un presupuesto.
 * El cálculo la usa marcada como estimación; nunca como si fuera el dato.
 */
export const C31 = {
  modelo: 'DFSK C31 Cabina Simple 0km',
  precioLista: 29_400_000,
  rangoPublicado: { min: 29_400_000, max: 29_500_000 },
  gastosRetiro: null, // DESCONOCIDO — no hay presupuesto de concesionaria
  fuente: 'listas de precios oficiales DFSK Argentina publicadas en agosto 2026 ($29.400.000–$29.500.000). Se usa el piso del rango.',
  desconocido: [
    'gastos de retiro, patentamiento, flete y sellado del C31 — el ROP FONDEFIN los excluye expresamente del financiamiento: son aporte propio',
    'si Le Pont (u otra concesionaria) sostiene ese precio de lista en una operación con prenda a favor de Fiduciaria',
    'plazo de entrega del C31 0km — si supera al desembolso, corre la fecha de todo el plan',
  ],
}

/** El calendario de la operación. Las fechas son DECISIÓN del dueño, no un cálculo. */
export const CALENDARIO = {
  mesCarpetaFondefin: '2026-08',
  mesEntregaU1: '2026-09',
  mesPrimeraCuotaU1: '2026-10',
  mesDesembolsoFondefin: '2026-12', // carpeta agosto + ~120 días de trámite
  mesPrimeraCuotaFondefin: '2027-01', // vence el 15 del mes siguiente al desembolso
  demoraTramiteDias: DEMORA_TRAMITE_DIAS,
  fuente: 'decisión del dueño 13/08/2026 (la unidad 1 se necesita en septiembre) + DEMORA_TRAMITE_DIAS de linea-fondefin.mjs',
}

/** Las condiciones de la línea FONDEFIN que gobiernan el cuadro de cuotas. Del ROP 05-2026. */
export const FONDEFIN = {
  tna: CONDICION_FONDEFIN.tna,
  cuotasTotales: 48,
  cuotasDeGracia: 6, // de CAPITAL: durante la gracia se pagan sólo intereses
  gastosOtorgamiento: GASTOS_OTORGAMIENTO, // 2% DETRAÍDO del desembolso
  coberturaPrenda: 2.0, // la prenda debe cubrir el 200% del financiamiento
  tope: 150_000_000,
  /**
   * IVA SOBRE INTERESES — NO ES UN DATO, ES UN SUPUESTO DEL PEOR CASO.
   *
   * `CONDICION_FONDEFIN.iva_sobre_intereses` es `null` a propósito: el ROP no lo trata y Fiduciaria
   * San Juan SAPEM no es entidad de la Ley 21.526, así que NO se puede asumir el 10,5% bancario. Se
   * calcula con 21% porque es el techo (la alícuota general) y porque un costo subestimado es el
   * error caro. Que sea supuesto y no dato viaja pegado al número en `esPiso`.
   */
  ivaSobreInteresesSupuesto: 0.21,
  ivaSobreInteresesDeclarado: CONDICION_FONDEFIN.iva_sobre_intereses, // null = desconocido
  bandaIva: [0, 0.105, 0.21],
  fuente: CONDICION_FONDEFIN.fuente,
}

/** El crédito UVA de la unidad 1. Sale del presupuesto real, no se tipea. */
export const UVA = {
  capital: C32.formasDePago.find((f) => f.clave === 'a-efectivo').financiado,
  anticipoEfectivo: C32.formasDePago.find((f) => f.clave === 'a-efectivo').anticipoEfectivo,
  precioTotal: C32.total,
  cuotas: 24,
  tnaNominal: 0,
  fuente: 'presupuesto Le Pont S.A. del 06/08/2026 (rodados-datos.mjs) · crédito Santander UVA vía concesionaria',
}

/**
 * INFLACIÓN — dos números y ninguno es "la" inflación.
 *
 * `ipcUltimos3` son HECHOS del INDEC ya publicados (abr/may/jun 2026), encadenados y anualizados: es
 * lo que pasó. `rem` es la EXPECTATIVA del REM del BCRA: es lo que se espera. Se calcula con el IPC
 * como base porque un hecho le gana a un pronóstico, y el REM va como sensibilidad. La diferencia no
 * es menor: 29,8% contra 23,9% anual mueve la tasa real de FONDEFIN casi 6 puntos.
 */
export const INFLACION = {
  mesesIpc: IPC.slice(-3), // abr, may, jun 2026
  remMensual: 0.018,
  fuenteIpc: 'INDEC — IPC nivel general (ipc-publicado.mjs, contrastado contra los acumulados oficiales)',
  fuenteRem: 'REM del BCRA — mediana de expectativas de inflación mensual, ~1,8%',
  limite: 'el UVA sigue al CER, que replica al IPC con ~1,5 mes de rezago. Acá se lo trata SIN rezago: sobreestima levemente la cuota de los primeros meses y no cambia el resultado real.',
}

/**
 * LOS SALDOS DE CIERRE PROYECTADOS DEL CASH FLOW — foto, con su defecto conocido adentro.
 *
 * `semanaMasAjustada` no es decoración: el saldo de CIERRE de diciembre ($28,2M) esconde que dentro
 * del mes la caja baja a $20,3M. Una compra que "entra" en el cierre puede perforar el descubierto
 * la semana del 28/12. El colchón real se mide contra ese mínimo, no contra el cierre.
 */
export const CAJA = {
  cierres: [
    { mes: '2026-08', cierre: 120_156_586 },
    { mes: '2026-09', cierre: 177_268_970 },
    { mes: '2026-10', cierre: 103_995_822 },
    { mes: '2026-11', cierre: 69_687_963 },
    { mes: '2026-12', cierre: 28_200_688 },
  ],
  semanaMasAjustada: { semanaDel: '2026-12-28', cierre: 20_347_514 },
  acuerdoDescubierto: ACUERDO.importe,
  fuente: 'Sheet "Flujo de Caja - Cash Flow", pestaña Cash Flow Mensual, saldos de cierre proyectados leídos el 13/08/2026',
}

/**
 * EL COBRO EN DÓLARES QUE EL CASH FLOW NO CONVIRTIÓ.
 *
 * El anticipo de Quattropani entró al Sheet como "15.400" —el importe en USD— sin multiplicar por el
 * tipo de cambio. La corrección NO es el importe convertido: es el convertido MENOS lo que ya está
 * cargado, porque sumar los $22.984.869,60 completos contaría dos veces esos $15.400. Es exactamente
 * el tipo de error que un test barato caza y una planilla no.
 */
export const CORRECCION_USD = {
  concepto: 'anticipo Quattropani cobrado el 31/07/2026',
  usd: 15_400,
  tipoCambio: 1_492.524,
  yaCargadoEnElSheet: 15_400, // el importe en USD, tomado como si fueran pesos
  desdeMes: '2026-07',
  estado: 'CORRECCIÓN CONOCIDA Y EN CURSO — todavía no aplicada al Sheet',
  fuente: 'cobro del 31/07/2026, TC 1.492,524 · defecto detectado en el Cash Flow: no convierte los cobros en USD',
}

/** El prendario del Ford que ya se paga. Las cuotas 27–60 NO están en la proyección del Cash Flow. */
export const PRENDARIO_FORD = {
  cuota: 1_282_811,
  cuotaPrimeraNoCargada: 27,
  cuotaUltima: 60,
  mesPrimeraNoCargada: '2027-01',
  mesUltima: '2029-10',
  cft: 0.651,
  tna: 0.389,
  fuente: 'préstamo prendario Santander 039101464204 (condiciones_financieras) · cuadro de amortización del banco',
  limite: 'las cuotas 27 a 60 (34 × $1.282.811 = $43.615.558) NO están cargadas en el Cash Flow: desde enero 2027 hay que sumarlas a mano.',
}

/**
 * EGRESOS MENSUALES REALES — el denominador contra el que se mide si la carga es sostenible.
 *
 * Sólo meses CERRADOS (clase='real'). Agosto queda afuera aunque tenga datos: está en curso y su
 * total todavía se mueve. Medir la sostenibilidad contra un mes incompleto la haría ver mejor.
 */
export const EGRESOS_REALES = {
  meses: [
    { mes: '2026-01', total: 67_033_849.60 },
    { mes: '2026-02', total: 47_233_569.72 },
    { mes: '2026-03', total: 54_014_909.85 },
    { mes: '2026-04', total: 71_855_749.20 },
    { mes: '2026-05', total: 51_645_202.33 },
    { mes: '2026-06', total: 75_869_745.58 },
    { mes: '2026-07', total: 77_157_305.76 },
  ],
  fuente: "public.egreso_rubro_mes (clase='real'), 13 rubros, leída el 13/08/2026",
  incluye: 'materiales, nómina completa, cargas sociales, gremiales, estructura, servicios, impuestos y el rubro Financiero — que ya contiene la cuota del prendario Ford',
}

/**
 * LAS FUENTES DE FONDOS A COMPARAR.
 *
 * `cft` es el ÚNICO campo que afirma un total (misma regla que `costoEfectivo` en
 * condiciones-financieras.mjs): sin CFT publicado, lo que sale es un PISO. `tea` es la TEA que la
 * base publica, que capitaliza la TNA SIN IVA — verificado: (1+0,389/12)^12−1 = 46,64% = la TEA
 * cargada del prendario. Por eso el IVA se agrega en el cálculo y no se asume incluido.
 */
export const FUENTES_DE_FONDOS = [
  {
    clave: 'fondefin', entidad: 'Fiduciaria San Juan SAPEM', producto: 'FONDEFIN Bienes de Capital',
    tna: CONDICION_FONDEFIN.tna, iva: FONDEFIN.ivaSobreInteresesSupuesto, ivaEsSupuesto: true,
    tea: null, cft: null, sirveParaRodados: true,
    nota: 'sólo pick-up CABINA SIMPLE 0km · trámite ~120 días · desembolso directo al proveedor · prenda al 200%',
  },
  {
    clave: 'uva-santander', entidad: 'Banco Santander', producto: 'Crédito UVA rodado (vía Le Pont)',
    tna: 0, iva: 0, ivaEsSupuesto: false, tea: null, cft: null, indexado: true, sirveParaRodados: true,
    nota: 'TNA 0% NOMINAL: el costo es el ajuste del capital por UVA/CER. Disponible ya, sin espera. Presupuesto vencido el 10/08.',
  },
  {
    clave: 'plazo-fijo-badlar', entidad: 'sistema financiero', producto: 'Plazo fijo / Badlar bancos privados',
    tna: 0.228125, iva: 0, ivaEsSupuesto: false, tea: null, cft: null, esColocacion: true, sirveParaRodados: false,
    nota: 'NO es fondeo: es la vara del costo de oportunidad de pagar al contado con caja propia',
  },
  {
    clave: 'descubierto', entidad: 'Banco Santander', producto: 'Acuerdo de descubierto N°00007',
    tna: TASAS.tna, iva: TASAS.iva + TASAS.percepcion, ivaEsSupuesto: false,
    tea: null, cft: ACUERDO.cft, sirveParaRodados: false,
    nota: 'límite $18.200.000 y es el colchón de la operación diaria: consumirlo para comprar un rodado deja a la empresa sin red',
  },
  {
    clave: 'prendario-mercado', entidad: 'Banco Santander', producto: 'Préstamo prendario (el del Ford)',
    tna: 0.389, iva: null, ivaEsSupuesto: false, tea: 0.4664, cft: 0.651, sirveParaRodados: true,
    nota: 'es la alternativa REAL si FONDEFIN no sale: misma garantía, cuatro veces la tasa',
  },
  {
    clave: 'tarjeta', entidad: 'Banco Santander', producto: 'Tarjeta Visa Business',
    tna: 0.779, iva: 0.21, ivaEsSupuesto: false, tea: 1.1277, cft: null, sirveParaRodados: false,
    nota: 'ni el límite ni el plazo dan para un rodado: entra sólo como referencia del techo de costo',
  },
]

export const FUENTE_TASAS = 'public.condiciones_financieras leída el 13/08/2026 · descubierto y su IVA verificados contra el cargo real del banco del 14/07 (costo-descubierto.mjs)'
