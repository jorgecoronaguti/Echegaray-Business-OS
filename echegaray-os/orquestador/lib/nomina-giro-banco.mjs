// EL GIRO BANCARIO DEL MES — CUÁNDO UN MES DE OFICINA O DE DIRECCIÓN SE DA POR PAGADO (25/09/2026).
//
// ═══ EL DEFECTO: $12,6 M DE «VENCIDO» FALSO CADA PRIMERO DE MES ═══
//
// El «Pagado» de Oficina y de Dirección en «Jornales por Quincena» sólo sabía leer dos fuentes: la
// planilla JORNALES («Oficina 26», cortada el 07/08) y `_PAGOS_NO_COMPRA_RAW`, que alguien carga a
// mano. Agosto se pagó entero y el Cash Flow lo marcaba deuda vencida hasta que se cargó a mano en
// `_PAGOS_NO_COMPRA_RAW`; septiembre repetía lo mismo el 01/10: Oficina $3,6 M + Dirección $9 M =
// $12,6 M VENCIDO apenas el corte del extracto pasara el 01/10, estuviera pagado o no.
//
// ═══ EL CRITERIO (declarado, porque el efectivo no se ve) ═══
//
// Regla del dueño: jefes y oficina cobran POR MES ($1.800.000 neto c/u), parte por banco (el recibo)
// y parte en efectivo; Dirección son retiros mensuales de los tres socios, parte por transferencia y
// parte en efectivo. El efectivo no deja rastro en el extracto, así que:
//
//   **EL MES SE CONSIDERA PAGADO CUANDO APARECE EN EL BANCO EL GIRO BANCARIO DEL MES.**
//
// Es una INFERENCIA, no un hecho: el banco prueba la parte bancaria; que el efectivo también salió se
// deduce de que las dos partes salen juntas. Si el giro no aparece, el mes sigue debiéndose y, pasada
// su fecha, el libro lo marca VENCIDO — que ahí sí es la alarma correcta.
//
// · OFICINA: los haberes de Maldonado y Nievas salen en el lote «Pago haberes» de fin de mes, sin
//   nombre (el extracto no trae beneficiario). Se reconocen por IMPORTE: medido en `_BANCO_RAW` y en
//   el certificado Santander del 18/09 (`haberes_acreditados_banco`, por CUIL), los dos jefes son los
//   ÚNICOS débitos «Sueldos» de $500.000 o más — 03/06 2×$1.360.865,60, 01/07 $1.807.057,16 y
//   $1.938.254,35, 31/07 2×$1.365.843,84, 31/08 2×$663.141,56 — y el haber más alto de un jornalero
//   fue $344.401,20 (30/06). Ventana: de cinco días antes del fin del mes al fin del mes más
//   `JORNALES_VENTANA_BANCO` (el mismo parámetro que ubica el lote de la segunda quincena).
// · DIRECCIÓN: transferencias a los beneficiarios que el dueño identificó como retiros —«A ana laura
//   echegaray ovi» (el retiro de Jorge Corona, 06/08), «A rodrigo alejandro j ech» (18/09)— y el lote
//   «Pago de honorarios» (01/06, 02/07, 03/08). Ventana: tres días antes del fin del mes a veinte días
//   después (agosto se pagó el 09/09, el 11/09 y el 17/09). Del retiro de Jorge Echegaray no hay un
//   solo débito en el extracto: su texto no se inventa acá.
//
// ═══ UNA SOLA DEFINICIÓN, DOS LECTORES ═══
//
// La fórmula de «Pagado» de la pestaña (`formulaGiro*`) y el libro (`giroDelMes`, red de seguridad por
// si la pestaña todavía no se regeneró) leen las MISMAS constantes de este archivo. Un test fija que
// las dos digan lo mismo sobre el extracto real de agosto.

/** Un haber de oficina: un débito «Sueldos» de al menos este importe (magnitud). */
export const UMBRAL_HABER_OFICINA = 500000
/** Días antes del fin del mes desde los que un haber cuenta como del mes (el 31/08 y el 31/07 caen el último día). */
export const OFICINA_DIAS_ANTES = 5
/** Si no se pasa el parámetro vivo, la ventana posterior de Oficina (= VENTANA_BANCO_DIAS de jornales). */
export const OFICINA_DIAS_DESPUES_DEFAULT = 10
export const DIRECCION_DIAS_ANTES = 3
export const DIRECCION_DIAS_DESPUES = 20
/** Beneficiarios de retiros de Dirección vistos en el extracto (minúsculas, texto del banco). */
export const BENEFICIARIOS_DIRECCION = Object.freeze(['ana laura echegaray', 'rodrigo alejandro j ech', 'pago de honorarios'])
const NATURALEZA_SUELDOS = 'Sueldos'
const RANGO_VENTANA = 'JORNALES_VENTANA_BANCO'

const EPOCA = Date.UTC(1899, 11, 30)
/** Serial de Sheets del último día del mes (1..12). */
export const finDeMesSerial = (anio, mes) => Math.round((Date.UTC(anio, mes, 0) - EPOCA) / 86400000)

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const regexBeneficiarios = () => BENEFICIARIOS_DIRECCION.map(esc).join('|')

/**
 * NÚCLEO PURO: el giro bancario del mes en los débitos del extracto.
 *
 * @param {Array<{fecha:number, concepto:string, importe:number, naturaleza:string}>} debitos de
 *   `debitosDelExtracto` (importe en magnitud positiva)
 * @param {{bloque:'Oficina'|'Dirección', anio:number, mes:number, diasDespues?:number}} o
 * @returns {{hay:boolean, fecha:number|null, importe:number, n:number}} `fecha` = el ÚLTIMO débito del
 *   giro (el mes se termina de pagar con el último peso)
 */
export function giroDelMes(debitos = [], { bloque, anio, mes, diasDespues = null }) {
  const fin = finDeMesSerial(anio, mes)
  const oficina = bloque === 'Oficina'
  const desde = fin - (oficina ? OFICINA_DIAS_ANTES : DIRECCION_DIAS_ANTES)
  const hasta = fin + (oficina ? (diasDespues ?? OFICINA_DIAS_DESPUES_DEFAULT) : DIRECCION_DIAS_DESPUES)
  const re = new RegExp(regexBeneficiarios())
  const suyos = (debitos ?? []).filter((d) => {
    if (!(Number.isFinite(d?.fecha) && d.fecha >= desde && d.fecha <= hasta)) return false
    if (oficina) return d.naturaleza === NATURALEZA_SUELDOS && Number(d.importe) >= UMBRAL_HABER_OFICINA
    return Number(d.importe) > 0 && re.test(String(d.concepto ?? '').toLowerCase())
  })
  if (!suyos.length) return { hay: false, fecha: null, importe: 0, n: 0 }
  return {
    hay: true,
    fecha: Math.max(...suyos.map((d) => d.fecha)),
    importe: Math.round(suyos.reduce((a, d) => a + Number(d.importe), 0) * 100) / 100,
    n: suyos.length,
  }
}

// ── LA MISMA REGLA, COMO FÓRMULA es-AR (separador «;») ───────────────────────────────────────────

const F = "'_BANCO_RAW'!$A$4:$A"
const B = "'_BANCO_RAW'!$B$4:$B"
const C = "'_BANCO_RAW'!$C$4:$C"
const N = "'_BANCO_RAW'!$F$4:$F"
const fin = (anio, mes) => `EOMONTH(DATE(${anio};${mes};1);0)`

/** Cuántos haberes de oficina hay en la ventana del mes (0 = no apareció el giro). */
export function formulaGiroOficinaN(anio, mes) {
  return `COUNTIFS(${N};"${NATURALEZA_SUELDOS}";${C};"<=-${UMBRAL_HABER_OFICINA}";`
    + `${F};">="&(${fin(anio, mes)}-${OFICINA_DIAS_ANTES});${F};"<="&(${fin(anio, mes)}+${RANGO_VENTANA}))`
}

/** La fecha del último haber de oficina del mes (0 si no hay). */
export function formulaGiroOficinaFecha(anio, mes) {
  return `MAXIFS(${F};${N};"${NATURALEZA_SUELDOS}";${C};"<=-${UMBRAL_HABER_OFICINA}";`
    + `${F};">="&(${fin(anio, mes)}-${OFICINA_DIAS_ANTES});${F};"<="&(${fin(anio, mes)}+${RANGO_VENTANA}))`
}

const condicionesDireccion = (anio, mes) => [
  `REGEXMATCH(LOWER(${B}&"");"${regexBeneficiarios()}")`,
  `(IF(ISNUMBER(${C});${C};0)<0)`,
  `(IF(ISNUMBER(${F});${F};0)>=${fin(anio, mes)}-${DIRECCION_DIAS_ANTES})`,
  `(IF(ISNUMBER(${F});${F};0)<=${fin(anio, mes)}+${DIRECCION_DIAS_DESPUES})`,
]

/** Cuántos débitos de retiro hay en la ventana del mes (0 = no apareció el giro). */
export function formulaGiroDireccionN(anio, mes) {
  return `IFERROR(SUMPRODUCT(${condicionesDireccion(anio, mes).join('*')});0)`
}

/** La fecha del último débito de retiro del mes (0 si no hay). */
export function formulaGiroDireccionFecha(anio, mes) {
  return `IFERROR(MAX(FILTER(${F};${condicionesDireccion(anio, mes).join(';')}));0)`
}

const sinIgual = (f) => String(f).replace(/^=/, '')

/**
 * NÚCLEO PURO: la celda «Pagado» de un mes de OFICINA que todavía no cerró, con el giro adentro.
 *
 * Lo que ya sabían las fuentes (planilla y `_PAGOS_NO_COMPRA_RAW`) sigue valiendo; si el giro del mes
 * apareció, el mes vale lo pactado (`base × factor`, la MISMA expresión que la «Proyectado» de la
 * fila). MAX y no suma: el giro no es un pago adicional, es la prueba de que el mes se pagó.
 *
 * @param {{base:string, conBloque:boolean, ajustada:string, anio:number, mes:number}} o `base` = la
 *   expresión numérica de las fuentes (sin «=»); `ajustada` = lo pactado del mes
 */
export function formulaPagadoOficinaConGiro({ base, conBloque, ajustada, anio, mes }) {
  const n = formulaGiroOficinaN(anio, mes)
  const b = sinIgual(base)
  const conGiro = `MAX(${b};IF(${n}>0;${ajustada};0))`
  return conBloque ? `=${conGiro}` : `=IF(AND(N(${b})=0;${n}=0);"";${conGiro})`
}

/**
 * NÚCLEO PURO: la celda «Pagado» de un mes de DIRECCIÓN con el giro adentro. El giro sólo cuenta desde
 * el mes en que empiezan los retiros («Desde», la misma compuerta que usa «Proyectado»): los
 * «Pago de honorarios» de junio y julio son anteriores al bloque y no se reinterpretan.
 *
 * @param {{pagado:string, pactado:string, celdaPago:string, celdaDesde:string, anio:number, mes:number}} o
 */
export function formulaPagadoDireccionConGiro({ pagado, pactado, celdaPago, celdaDesde, anio, mes }) {
  const n = formulaGiroDireccionN(anio, mes)
  return `=MAX(${sinIgual(pagado)};IF(AND(${n}>0;N(${celdaPago})>=N(${celdaDesde});N(${celdaDesde})>0);${pactado};0))`
}
