// EL COSTO DE DESVINCULAR EN LA CONSTRUCCIÓN. NO ES EL DE LA LCT, Y LA DIFERENCIA ES ENORME.
//
// ═══ EL PEDIDO (26/08/2026, textual del dueño) ═══
//
// *"calculá el costo de echar a cada persona y agregalo en la pestaña Jornales por Quincena del
// Sheet Flujo de Fondos, considerando todas las implicancias legales y contables"*.
//
// ═══ EL RÉGIMEN, VERIFICADO CONTRA EL TEXTO DE LA LEY — NO DE MEMORIA ═══
//
// Los 17 obreros están bajo `UOCRA — Ley 22.250 (construcción)` (`public.personas.convenio_colectivo`).
// El texto ordenado se leyó el 27/08/2026 en la Biblioteca Electrónica de ARCA/AFIP
// (`biblioteca.afip.gob.ar/dcp/LEY_C_022250_1980_07_11`). Lo que dice, y que gobierna cada número
// de este módulo:
//
//   · ART. 15 — El Fondo de Cese Laboral se integra con un aporte MENSUAL a cargo del empleador:
//     **12% durante el primer año** de prestación de servicios y **8% a partir del año de
//     antigüedad**, sobre "la remuneración mensual, en dinero, ... en concepto de salarios básicos y
//     adicionales establecidos en la convención colectiva". El CCT NO puede modificar esos aportes.
//     Y el párrafo que cambia todo: *"El sistema ... REEMPLAZA AL RÉGIMEN DE PREAVISO Y DESPIDO
//     contemplados por la Ley de Contrato de Trabajo"*.
//     ⇒ **No hay indemnización por antigüedad (art. 245 LCT) ni preaviso indemnizable.** Las dos
//     líneas valen CERO, y no por omisión: por texto expreso.
//
//   · ART. 16 — El depósito va dentro de los primeros 15 días del mes siguiente al devengamiento, y
//     el pago directo al trabajador que cesa está PROHIBIDO salvo el caso del artículo siguiente.
//
//   · ART. 17 — Al cese: entrega de la Libreta de Aportes dentro de las 48 horas, y **se abona en
//     forma directa el aporte correspondiente a los días trabajados del lapso cuyo plazo de depósito
//     todavía no venció**. Eso —y sólo eso— del Fondo de Cese sale de la caja el día del despido.
//
//   · ART. 18 — Si el empleador no cumple y el trabajador lo intima por 2 días hábiles: indemnización
//     de 30 a 90 días de retribución, MÁS otros 30 días si además no estaba inscripto (art. 13).
//     Es la contingencia, no el costo normal: se declara, no se suma.
//
//   · ART. 30 — La mora en el depósito actualiza la deuda por la variación del índice de precios
//     mayoristas. Un Fondo de Cese atrasado no se congela: crece.
//
//   · ART. 35 — La ley es de orden público y excluye a la LCT en lo que ella contempla; **en lo demás
//     la LCT se aplica supletoriamente**. La ley no dice nada de vacaciones ni de aguinaldo: por eso
//     esos dos conceptos SÍ se liquidan, y se liquidan por LCT (arts. 121/123 y 150/155/156).
//
// ═══ LA CONSECUENCIA ECONÓMICA, QUE ES EL PUNTO ═══
//
// El costo del despido ya se fue pagando mes a mes. Lo que sale de la caja el día del cese es una
// fracción chica: los haberes devengados, las vacaciones y el SAC proporcionales, y el aporte del
// mes que todavía no se depositó. El grueso —el fondo acumulado— es plata del trabajador que ya
// debería estar depositada en su cuenta. **Por eso este módulo separa DESEMBOLSO de YA DEPOSITADO:
// no es lo mismo lo que sale de la caja que lo que se le entrega.**

/** Art. 15 Ley 22.250. No son parámetros: son la ley, y el CCT no puede tocarlos. */
export const FCL_PRIMER_ANIO = 0.12
export const FCL_DESDE_UN_ANIO = 0.08
/** La jornada legal de la construcción: 8 horas. Un día de vacación vale eso (art. 155 inc. b LCT). */
export const HORAS_POR_JORNADA = 8
export const FUENTE_LEY = 'Ley 22.250 (texto ordenado) — biblioteca.afip.gob.ar, leído el 27/08/2026'

const dia = 86400000
const aDia = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null)

/**
 * NÚCLEO PURO: la antigüedad en años, con su fracción, entre dos fechas.
 * Devuelve `null` cuando falta cualquiera de las dos — un cálculo sin fecha de ingreso no se inventa.
 */
export function antiguedad(ingreso, corte) {
  const a = aDia(ingreso); const b = aDia(corte)
  if (!a || !b || b < a) return null
  let anios = b.getFullYear() - a.getFullYear()
  const aniv = new Date(a.getFullYear() + anios, a.getMonth(), a.getDate())
  if (aniv > b) anios -= 1
  const desdeAniv = new Date(a.getFullYear() + anios, a.getMonth(), a.getDate())
  const meses = (b.getFullYear() - desdeAniv.getFullYear()) * 12 + (b.getMonth() - desdeAniv.getMonth())
    - (b.getDate() < desdeAniv.getDate() ? 1 : 0)
  return { anios, meses, dias: Math.round((b - a) / dia) }
}

/** NÚCLEO PURO: 12% en el primer año, 8% a partir del año de antigüedad (art. 15). */
export function alicuotaFcl(ingreso, corte) {
  const a = antiguedad(ingreso, corte)
  if (!a) return null
  return a.anios >= 1 ? FCL_DESDE_UN_ANIO : FCL_PRIMER_ANIO
}

/**
 * NÚCLEO PURO: los días CORRIDOS de vacaciones que corresponden por antigüedad (art. 150 LCT).
 * La antigüedad se mide al 31 de diciembre del año que corresponden (art. 151, último párrafo).
 */
export function diasVacacionesPorAntiguedad(aniosAlCierre) {
  const n = Number(aniosAlCierre)
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= 5) return 14
  if (n <= 10) return 21
  if (n <= 20) return 28
  return 35
}

/** NÚCLEO PURO: los días del año calendario (bisiesto incluido). */
export const diasDelAnio = (anio) => ((anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 366 : 365)

/**
 * NÚCLEO PURO: vacaciones proporcionales al cese (art. 156 LCT).
 *
 * "Indemnización equivalente al salario correspondiente al período de descanso proporcional a la
 * fracción del año trabajada". La fracción se mide desde el 1 de enero —o desde el ingreso, si entró
 * en el año— hasta el cese.
 */
export function vacacionesProporcionales({ ingreso, cese, jornalDiario }) {
  const c = aDia(cese); const i = aDia(ingreso)
  if (!c || !i || c < i) return null
  const anio = c.getFullYear()
  const desde = i.getFullYear() === anio ? i : new Date(anio, 0, 1)
  const trabajados = Math.round((c - desde) / dia) + 1
  const ant = antiguedad(i, new Date(anio, 11, 31))
  const diasVac = diasVacacionesPorAntiguedad(ant ? ant.anios : 0)
  const proporcion = trabajados / diasDelAnio(anio)
  const dias = diasVac * proporcion
  return { diasVac, diasTrabajados: trabajados, dias, importe: dias * Number(jornalDiario || 0) }
}

/**
 * NÚCLEO PURO: SAC proporcional al cese (arts. 121/123 LCT).
 *
 * La mitad de la MAYOR remuneración mensual devengada dentro del semestre, proporcional al tiempo
 * trabajado en ese semestre. Se le pasa el mejor mes ya calculado: quién es el mejor mes depende de
 * la planilla, no de la ley, y mezclarlo acá haría que este módulo dependiera del Sheet.
 */
export function sacProporcional({ cese, ingreso, mejorRemuneracionMensual }) {
  const c = aDia(cese); const i = aDia(ingreso)
  if (!c) return null
  const anio = c.getFullYear()
  const primerSemestre = c.getMonth() < 6
  const iniSem = new Date(anio, primerSemestre ? 0 : 6, 1)
  const finSem = primerSemestre ? new Date(anio, 5, 30) : new Date(anio, 11, 31)
  const desde = i && i > iniSem ? i : iniSem
  const trabajados = Math.max(0, Math.round((c - desde) / dia) + 1)
  const delSemestre = Math.round((finSem - iniSem) / dia) + 1
  const importe = (Number(mejorRemuneracionMensual || 0) / 2) * (trabajados / delSemestre)
  return { diasTrabajados: trabajados, diasDelSemestre: delSemestre, importe }
}

/**
 * NÚCLEO PURO: el aporte al Fondo de Cese que se paga EN MANO al cesar (art. 17).
 *
 * Es el del lapso cuyo plazo de depósito todavía no venció. Con el plazo del art. 16 —primeros 15
 * días del mes siguiente— el 27/08 eso es el mes de agosto entero: el de julio venció el 15/08.
 * Todo lo anterior tiene que estar DEPOSITADO, no se paga acá; si no lo está, no es "costo del
 * despido": es mora del art. 30 más la contingencia del art. 18.
 */
export function fclPagoDirecto({ remuneracionNoDepositada, alicuota }) {
  const r = Number(remuneracionNoDepositada || 0)
  // Sin alícuota no hay número: `Number(null)` da 0 y un cero acá se leería como "no le corresponde
  // nada", que es otra cosa. Un aporte que no se puede calcular se declara, no se estima en cero.
  if (alicuota == null) return null
  const a = Number(alicuota)
  if (!Number.isFinite(a)) return null
  return r * a
}

/**
 * NÚCLEO PURO: LA LIQUIDACIÓN FINAL COMPLETA DE UNA PERSONA.
 *
 * Separa lo que SALE DE LA CAJA de lo que YA ESTÁ DEPOSITADO. Es la distinción que pidió el dueño y
 * la que hace que este número sirva para decidir: el fondo acumulado no es un desembolso nuevo, es
 * plata del trabajador que se le entrega con la libreta.
 *
 * @param {{nombre:string, ingreso:Date, cese:Date, categoria:string, basicoHora:number,
 *          horasDevengadasPendientes:number, remuneracionNoDepositada:number,
 *          mejorRemuneracionMensual:number, fclDevengadoAcumulado:number|null}} p
 */
export function liquidacionFinal(p = {}) {
  const basicoHora = Number(p.basicoHora || 0)
  const jornalDiario = basicoHora * HORAS_POR_JORNADA
  const ant = antiguedad(p.ingreso, p.cese)
  const alicuota = alicuotaFcl(p.ingreso, p.cese)
  const vac = vacacionesProporcionales({ ingreso: p.ingreso, cese: p.cese, jornalDiario })
  const sac = sacProporcional({ cese: p.cese, ingreso: p.ingreso, mejorRemuneracionMensual: p.mejorRemuneracionMensual })
  const haberes = Number(p.horasDevengadasPendientes || 0) * basicoHora
  const fcl = fclPagoDirecto({ remuneracionNoDepositada: p.remuneracionNoDepositada, alicuota }) ?? 0
  const vacImporte = vac ? vac.importe : 0
  // SAC sobre vacaciones: la incidencia es práctica liquidatoria corriente, no texto expreso de la
  // LCT. Va en su propia línea justamente para que se pueda discutir sin tocar el resto.
  const sacSobreVac = vacImporte / 12
  const sacImporte = sac ? sac.importe : 0
  return {
    nombre: p.nombre ?? '',
    ingreso: p.ingreso ?? null,
    cese: p.cese ?? null,
    categoria: p.categoria ?? null,
    antiguedad: ant,
    basicoHora,
    jornalDiario,
    alicuota,
    haberes,
    vacaciones: vacImporte,
    diasVacaciones: vac ? vac.dias : null,
    sac: sacImporte,
    sacSobreVacaciones: sacSobreVac,
    fclPagoDirecto: fcl,
    // Preaviso e indemnización por antigüedad: CERO por el último párrafo del art. 15, no por olvido.
    preaviso: 0,
    indemnizacionAntiguedad: 0,
    desembolso: haberes + vacImporte + sacImporte + sacSobreVac + fcl,
    fclDevengadoAcumulado: p.fclDevengadoAcumulado ?? null,
  }
}

/** NÚCLEO PURO: los totales de un conjunto de liquidaciones. Suma lo que existe; no rellena huecos. */
export function totalizar(liquidaciones = []) {
  const cero = {
    personas: 0, haberes: 0, vacaciones: 0, sac: 0, sacSobreVacaciones: 0, fclPagoDirecto: 0,
    desembolso: 0, fclDevengadoAcumulado: 0, sinFondoMedible: 0,
  }
  return liquidaciones.reduce((t, l) => ({
    personas: t.personas + 1,
    haberes: t.haberes + (l.haberes || 0),
    vacaciones: t.vacaciones + (l.vacaciones || 0),
    sac: t.sac + (l.sac || 0),
    sacSobreVacaciones: t.sacSobreVacaciones + (l.sacSobreVacaciones || 0),
    fclPagoDirecto: t.fclPagoDirecto + (l.fclPagoDirecto || 0),
    desembolso: t.desembolso + (l.desembolso || 0),
    fclDevengadoAcumulado: t.fclDevengadoAcumulado + (l.fclDevengadoAcumulado || 0),
    sinFondoMedible: t.sinFondoMedible + (l.fclDevengadoAcumulado == null ? 1 : 0),
  }), cero)
}
