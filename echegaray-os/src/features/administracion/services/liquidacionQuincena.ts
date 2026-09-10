// QUÉ COBRA CADA PERSONA EN UNA QUINCENA Y POR QUÉ CANAL SALE.
//
// Es lo que hoy contesta la pestaña «Nómina» del Flujo de Caja. El dueño (09/09/2026) pidió el
// módulo en la web; la pestaña se da de baja cuando esto esté verificado, y la baja la hace él.
//
// ═══ LA CADENA, Y NINGÚN ESLABÓN SE INVENTA ═══
//
//   COBRA         obreros: horas liquidables × $/hora de la persona
//                 oficina: el neto mensual acordado
//                 final:   la mitad blanca del recibo final × 2
//   − ADELANTO          lo entregado a cuenta en efectivo        (nomina_adelanto)
//   − YA TRANSFERIDO    girado por banco ANTES del lote           (nomina_adelanto)
//   − POR BANCO         el neto del recibo, girado en el lote     (nomina_recibo_neto + extracto)
//   = EN EFECTIVO
//
//   TOTAL A PAGAR = POR BANCO + EN EFECTIVO
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NO SQL ═══
//
// Porque el número decide plata que se entrega en mano y tiene que poder probarse sin base: los
// casos que importan —el que no tiene tarifa cargada, el que faltó sin motivo, el que ya cobró un
// adelanto, el recibo que el extracto todavía no muestra girado— son cuatro tests de segundos. Una
// vista SQL con esa lógica adentro sólo se puede probar contra datos reales, que cambian.
//
// ═══ LO QUE ESTE ARCHIVO NO DECIDE ═══
//
// Cuántas horas vale un día no se decide acá: eso es `horasLiquidablesDelDia` y la tabla motivo →
// paga de `liquidacionDeAusencias.ts`, que es la única definición del repo. Cuál es la ventana de la
// quincena tampoco: es `quincena.ts`. Acá se multiplica y se resta, nada más.
//
// ═══ NULL NO ES CERO, Y ES LA REGLA QUE MÁS PLATA PROTEGE ═══
//
// Sin tarifa cargada, COBRA es `null` y la fila dice «sin tarifa». Un cero ahí liquidaría a alguien
// en $ 0 con la misma cara con la que muestra un importe correcto — el mismo defecto que el repo ya
// pagó con «recibo sin liquidación nunca es $ 0».

import {
  horasLiquidablesDelDia, horasDeAusencia, type RegistroLiquidable,
} from './liquidacionDeAusencias.ts'
import { horasEsperadasDeDias, jornadaPorDefecto } from './jornadaPorDefecto.ts'
import { diasDeLaQuincenaSinDomingos, type Quincena } from './quincena.ts'

/** Los tres cuadros de la pestaña. Cada uno se cierra por su cuenta. */
export type GrupoLiquidacion = 'obreros' | 'oficina' | 'final'

/**
 * CÓMO SE LE PAGA A ESTA LÍNEA, que es lo mismo que decir QUÉ TARIFA HAY QUE EXIGIRLE.
 *
 *   hora     el valor hora de `persona_tarifa`. Sin él no hay COBRA: null, nunca cero.
 *   mensual  el neto mensual de `persona_tarifa`. Oficina cobra un neto acordado por definición,
 *            así que su valor hora es NULL SIEMPRE — y eso no es «sin tarifa», es otra tarifa.
 *   ninguna  la liquidación final no sale de una tarifa: sale del recibo del estudio × 2.
 */
export type ModalidadDeLiquidacion = 'hora' | 'mensual' | 'ninguna'

/**
 * La modalidad la impone el CUADRO, no la tarifa que haya cargada. Derivarla de la tarifa haría que
 * a quien no tiene ninguna no se le pueda exigir ninguna: el caso que el cierre existe para frenar.
 */
export function modalidadDe(grupo: GrupoLiquidacion): ModalidadDeLiquidacion {
  if (grupo === 'oficina') return 'mensual'
  if (grupo === 'final') return 'ninguna'
  return 'hora'
}

/** Una fila de `registros_hh` de la ventana. `horas` viaja como texto desde PostgREST. */
export interface RegistroDeQuincena extends RegistroLiquidable {
  fecha: string
}

/** Una fila de `asistencia_dia`: la presencia DECLARADA, que es un estado y no un derivado. */
export interface PresenciaDeQuincena {
  fecha: string
  estado: 'presente' | 'ausente' | 'licencia'
  motivo: string | null
}

export interface HorasDeQuincena {
  /** Horas que se liquidan en toda la ventana. */
  horas: number
  /** Días con al menos una hora liquidable. */
  dias: number
  /**
   * Días DECLARADOS PRESENTES a los que nadie les cargó una sola hora.
   *
   * VALEN CERO Y SE CUENTAN. Presencia y horas imputadas son dos cosas distintas (regla del repo:
   * la presencia nunca se deriva de las horas) — y la vuelta tampoco vale: derivar 9 horas de un
   * «vino» sería fabricar el dato que se está por pagar. Pero un cero mudo esconde exactamente el
   * caso donde alguien trabajó y nadie cargó, así que la línea publica el número y la pantalla lo
   * muestra al lado de las horas.
   */
  presentesSinHoras: number
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100

const numero = (v: number | string | null | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * LAS HORAS LIQUIDABLES DE UNA PERSONA EN LA QUINCENA.
 *
 * Día por día, sin domingos —el dueño los sacó de la consideración el 08/09/2026— y con la misma
 * precedencia que la grilla de asistencia:
 *
 *   1. Si el día tiene registros de horas, manda `horasLiquidablesDelDia`: lo trabajado gana y la
 *      ausencia declarada al lado no se suma (regla contra el doble conteo).
 *   2. Si no tiene ninguno pero el jefe declaró ausencia o licencia, vale lo que valga su MOTIVO:
 *      la jornada del día si paga, cero si no. Sin motivo, cero.
 *   3. Un día declarado presente y sin horas vale cero, y se cuenta aparte.
 */
export function horasDeQuincena(
  q: Quincena,
  registros: readonly RegistroDeQuincena[],
  presencias: readonly PresenciaDeQuincena[] = [],
): HorasDeQuincena {
  const declarada = new Map(presencias.map((p) => [p.fecha, p]))
  let horas = 0
  let dias = 0
  let presentesSinHoras = 0
  for (const fecha of diasDeLaQuincenaSinDomingos(q)) {
    const delDia = registros.filter((r) => r.fecha === fecha)
    const p = declarada.get(fecha)
    let h = 0
    if (delDia.length > 0) {
      h = horasLiquidablesDelDia(delDia)
    } else if (p?.estado === 'ausente' || p?.estado === 'licencia') {
      h = horasDeAusencia({
        tipo: p.estado === 'ausente' ? 'ausencia' : 'licencia',
        motivo: p.motivo,
        jornada: jornadaPorDefecto(fecha),
      })
    } else if (p?.estado === 'presente') {
      presentesSinHoras++
    }
    if (h > 0) { horas += h; dias++ }
  }
  return { horas: redondear2(horas), dias, presentesSinHoras }
}

/**
 * LAS HORAS QUE LA QUINCENA ESPERA — el denominador de «cargadas / esperadas».
 *
 * Se suma día por día con `jornadaPorDefecto` (9 de L a J, 8 los V) sobre la misma ventana sin
 * domingos que usa `horasDeQuincena`: si el numerador recorriera trece días y el denominador
 * quince, el porcentaje de la pantalla de cierre nunca llegaría al 100 %. La 1ª de septiembre de
 * 2026 espera 97 h, no las 61,6 que la app publicaba multiplicando por una jornada promedio.
 */
export function horasEsperadasDeQuincena(q: Quincena): number {
  return horasEsperadasDeDias(diasDeLaQuincenaSinDomingos(q))
}

/** La tarifa vigente de una persona. Exactamente una de las dos, nunca las dos (CHECK de la base). */
export interface TarifaVigente {
  valorHora: number | null
  netoMensual: number | null
  desde: string
  origen: string
}

/** Lo que la pantalla necesita saber de una persona para liquidarla. */
export interface EntradaDeLinea {
  personaId: string
  nombre: string
  /** `null` = no se pudo calcular. Cero horas cargadas ES cero, y eso sí es un número. */
  horas: number | null
  tarifa: TarifaVigente | null
  /** Efectivo entregado a cuenta (`nomina_adelanto`, concepto de este grupo). */
  adelanto: number
  /** Girado por banco ANTES del lote de haberes (`nomina_adelanto`). */
  yaTransferido: number
  /** El neto del recibo del estudio contable (`nomina_recibo_neto`). `null` = no hay recibo. */
  reciboNeto: number | null
  /** ¿El extracto muestra el giro de ese recibo en el lote de haberes? */
  giroEnElLote: boolean
  /** Sólo liquidaciones finales: la mitad blanca que liquidó el estudio. El total es el doble. */
  mitadBlanca?: number | null
}

export interface LineaLiquidada {
  personaId: string
  nombre: string
  horas: number | null
  valorHora: number | null
  /** El neto mensual acordado (Oficina). XOR con `valorHora`: nunca los dos. */
  netoMensual: number | null
  /** Qué tarifa exige esta línea. La pantalla de cierre la lee para saber qué le falta. */
  modalidad: ModalidadDeLiquidacion
  /** `null` = falta un dato para poder decirlo. NUNCA cero por defecto. */
  cobra: number | null
  adelanto: number
  yaTransferido: number
  porBanco: number
  enEfectivo: number | null
  total: number | null
  efectivoRedondeado: number | null
  /** No hay tarifa cargada para esa persona: la fila lo dice y no inventa $ 0. */
  sinTarifa: boolean
  /**
   * HAY RECIBO Y EL EXTRACTO NO MUESTRA EL GIRO. No es «por banco»: un recibo es lo que el estudio
   * liquidó, no la prueba de que la plata salió. Se muestra aparte para que alguien lo mire.
   */
  reciboSinGiro: boolean
  /** De dónde salió la tarifa. Ningún importe sin origen a la vista. */
  origenTarifa: string | null
}

/**
 * UNA LÍNEA. La cadena entera, en el orden en que la escribió el dueño.
 *
 * `efectivoRedondeado` viaja como está guardado y NO participa de ninguna cuenta: son los billetes
 * que él entrega en mano y los escribe él. Calcularlo sería reemplazar su decisión por una cuenta.
 */
export function liquidarLinea(
  e: EntradaDeLinea,
  grupo: GrupoLiquidacion,
  efectivoRedondeado: number | null = null,
): LineaLiquidada {
  const valorHora = e.tarifa?.valorHora ?? null
  const netoMensual = e.tarifa?.netoMensual ?? null
  const modalidad = modalidadDe(grupo)
  const cobra = cobraDe(e, grupo, valorHora)
  // EL RECIBO SIN GIRO NO ES «POR BANCO». Que el estudio haya liquidado $215.564 no dice que el
  // banco los haya movido: hasta que el lote aparece en el extracto, esa plata sigue por pagar y
  // tiene que salir en efectivo o esperar. Contarla como girada le paga de menos a la persona.
  const porBanco = e.giroEnElLote && e.reciboNeto != null ? redondear2(e.reciboNeto) : 0
  const enEfectivo = cobra == null
    ? null
    : redondear2(cobra - e.adelanto - e.yaTransferido - porBanco)
  return {
    personaId: e.personaId,
    nombre: e.nombre,
    horas: e.horas,
    valorHora,
    netoMensual,
    modalidad,
    cobra,
    adelanto: redondear2(e.adelanto),
    yaTransferido: redondear2(e.yaTransferido),
    porBanco,
    enEfectivo,
    total: enEfectivo == null ? null : redondear2(porBanco + enEfectivo),
    efectivoRedondeado,
    // «SIN TARIFA» ES POR MODALIDAD. Antes era `tarifa == null`, y eso dejaba pasar como cargada
    // una tarifa de la modalidad equivocada; ahora falta la que ESTA línea cobra. La gente de
    // Oficina tiene valor hora NULL por definición y NO está sin tarifa: tiene un neto mensual.
    sinTarifa: faltaLaTarifa(modalidad, valorHora, netoMensual),
    reciboSinGiro: e.reciboNeto != null && !e.giroEnElLote,
    origenTarifa: e.tarifa?.origen ?? null,
  }
}

/**
 * ¿Le falta a esta línea la tarifa que su modalidad exige? R1: NULL nunca es cero.
 *
 * SE EXPORTA porque la grilla de la solapa «Horas» tiene que decidir lo MISMO. Hasta el 10/09/2026
 * marcaba «sin retribución» a toda fila con `valorHora == null`, y publicaba a los dos jefes de
 * obra de Oficina —que cobran un neto mensual acordado— como pendientes de una tarifa que nadie
 * les va a cargar nunca. El cierre ya lo había corregido; la grilla tenía su propia copia.
 */
export function faltaLaTarifa(
  modalidad: ModalidadDeLiquidacion, valorHora: number | null, netoMensual: number | null,
): boolean {
  if (modalidad === 'hora') return valorHora == null
  if (modalidad === 'mensual') return netoMensual == null
  return false
}

/** COBRA, según el cuadro. Cada grupo cobra por una razón distinta y ninguna es la del otro. */
function cobraDe(
  e: EntradaDeLinea, grupo: GrupoLiquidacion, valorHora: number | null,
): number | null {
  if (grupo === 'oficina') {
    const neto = e.tarifa?.netoMensual ?? null
    return neto == null ? null : redondear2(neto)
  }
  if (grupo === 'final') {
    // LA MITAD BLANCA POR DOS. El acuerdo con el personal es 50/50 (`nomina-banco-recibo.mjs`): lo
    // que el estudio liquida en blanco es la mitad de lo que se paga. Sin recibo final no hay
    // mitad, y sin mitad no hay total: `null`, nunca cero.
    return e.mitadBlanca == null ? null : redondear2(e.mitadBlanca * 2)
  }
  if (valorHora == null || e.horas == null) return null
  return redondear2(e.horas * valorHora)
}

export interface TotalesDeCuadro {
  personas: number
  horas: number
  cobra: number
  adelanto: number
  yaTransferido: number
  porBanco: number
  enEfectivo: number
  total: number
  /** Cuántas líneas no se pudieron liquidar. El total de arriba NO las incluye, y hay que decirlo. */
  sinTarifa: number
  /** Cuántas tienen recibo sin giro confirmado en el extracto. */
  reciboSinGiro: number
}

/**
 * LOS TOTALES DE UN CUADRO.
 *
 * LAS LÍNEAS SIN COBRA NO SUMAN Y SE CUENTAN. Sumarlas como cero daría un total que parece completo
 * y le falta gente; omitirlas sin decirlo sería lo mismo con menos evidencia. El contador `sinTarifa`
 * es lo que permite que la pantalla escriba «faltan 3».
 */
export function totalesDeCuadro(lineas: readonly LineaLiquidada[]): TotalesDeCuadro {
  const t: TotalesDeCuadro = {
    personas: lineas.length,
    horas: 0, cobra: 0, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 0, total: 0,
    sinTarifa: 0, reciboSinGiro: 0,
  }
  for (const l of lineas) {
    if (l.sinTarifa || l.cobra == null) t.sinTarifa++
    if (l.reciboSinGiro) t.reciboSinGiro++
    t.horas += numero(l.horas)
    if (l.cobra == null) continue
    t.cobra += l.cobra
    t.adelanto += l.adelanto
    t.yaTransferido += l.yaTransferido
    t.porBanco += l.porBanco
    t.enEfectivo += numero(l.enEfectivo)
    t.total += numero(l.total)
  }
  for (const k of ['horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total'] as const) {
    t[k] = redondear2(t[k])
  }
  return t
}

/**
 * LA TARJETA DE ARRIBA: POR BANCO · EN EFECTIVO · TOTAL de toda la quincena.
 *
 * `cierra` es la condición que el dueño puso con esas palabras —«las dos primeras dan la tercera»— y
 * es un dato de la tarjeta, no un `assert`: si alguna vez no cierra, la pantalla lo tiene que
 * mostrar en vez de romperse y dejar de mostrar la liquidación entera.
 */
export interface TarjetaDeQuincena {
  porBanco: number
  enEfectivo: number
  total: number
  cierra: boolean
}

/**
 * DE QUÉ CUADRO SALE CADA PESO DE LA TARJETA.
 *
 * EL DEFECTO QUE ESTO CIERRA (09/09/2026): la tarjeta decía «TOTAL DE LA QUINCENA $7.782.724» y el
 * pie de Obreros sumaba $4.182.724. Los dos números eran correctos y ninguno mentía —la diferencia
 * son los $3.600.000 de Oficina, dos netos MENSUALES de $1.800.000— pero la tarjeta no decía que
 * sumaba los tres cuadros, así que la única lectura posible era «uno de los dos está mal». Un total
 * que no se puede descomponer no se puede auditar.
 *
 * Y deja a la vista algo que hay que decidir y no decide esta pantalla: el neto de Oficina es
 * MENSUAL y la tarjeta es QUINCENAL, así que aparece entero en las dos quincenas del mes. Mientras
 * el dueño no defina si se parte en dos, el desglose lo muestra separado en vez de esconderlo dentro
 * de un solo número.
 */
export interface ParteDeLaTarjeta {
  rotulo: string
  personas: number
  total: number
}

export function desgloseDeQuincena(
  cuadros: readonly { titulo: string; totales: TotalesDeCuadro }[],
): ParteDeLaTarjeta[] {
  return cuadros
    .filter((c) => c.totales.personas > 0)
    .map((c) => ({ rotulo: c.titulo, personas: c.totales.personas, total: c.totales.total }))
}

export function tarjetaDeQuincena(cuadros: readonly TotalesDeCuadro[]): TarjetaDeQuincena {
  const porBanco = redondear2(cuadros.reduce((s, c) => s + c.porBanco, 0))
  const enEfectivo = redondear2(cuadros.reduce((s, c) => s + c.enEfectivo, 0))
  const total = redondear2(cuadros.reduce((s, c) => s + c.total, 0))
  return { porBanco, enEfectivo, total, cierra: redondear2(porBanco + enEfectivo) === total }
}

/**
 * LA TARIFA VIGENTE AL DÍA `fecha`: la de mayor `desde` que ya haya empezado.
 *
 * Se elige por FECHA y no «la última cargada» porque recalcular una quincena de marzo tiene que
 * usar la tarifa de marzo. Con «la última» un aumento de septiembre reliquidaría el año entero.
 */
export function tarifaVigenteAl(
  tarifas: readonly TarifaVigente[], fecha: string,
): TarifaVigente | null {
  let mejor: TarifaVigente | null = null
  for (const t of tarifas) {
    if (t.desde > fecha) continue
    if (!mejor || t.desde > mejor.desde) mejor = t
  }
  return mejor
}
