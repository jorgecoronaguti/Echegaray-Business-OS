// LO QUE SE LE PAGÓ A LA GENTE EN EL AÑO, EN BLANCO Y EN NEGRO, SIN CARGAS SOCIALES.
//
// Dueño, 22/09/2026: *«la sección "nómina" del módulo de analíticas no es de utilidad así como está;
// tiene que salir lo pagado en conceptos negro y blanco de todo el año, sin cargas sociales»*.
//
// ═══ QUÉ MOSTRABA ANTES Y POR QUÉ NO SERVÍA ═══
//
// `nomina_por_mes` publica COSTO DE NÓMINA = jornales + cargas sociales, importado de la planilla, y
// desde agosto sólo publica un FACTOR (2,04) en la columna de pesos. Tres defectos a la vez: mezcla
// las cargas —que el dueño pidió sacar—, no separa blanco de negro, y se queda muda medio año.
//
// ═══ DE DÓNDE SALE CADA PESO AHORA ═══
//
//   BLANCO   `recibo_sueldo_linea.neto` — el neto del recibo del estudio, período por período. Es la
//            definición del OS («blanco = lo que paga el recibo»), la misma que usa la Liquidación.
//   NEGRO    lo cobrado en la quincena MENOS el neto de su recibo. Lo cobrado es `liquidacion_linea`
//            (`cobra_manual` si alguien la escribió, si no `cobra`: horas × $/h), que es la plata en
//            mano de la persona y NO lleva ninguna carga social adentro.
//   CARGAS   no entran en ningún lado: ni `cargas_sociales`, ni F931, ni contribuciones del recibo.
//            El neto del recibo es lo que cobra el trabajador, no lo que le cuesta a la empresa.
//
// ═══ LAS TRES COSAS QUE ESTO NO PUEDE AFIRMAR, Y LAS PUBLICA ═══
//
//   · UNA QUINCENA SIN CERRAR NO VALE 0. `liquidacion_linea` sella `cobra` al cerrar; mientras está
//     abierta la columna es 0, y sumarla diría que en septiembre no se le pagó nada a nadie. Un mes
//     sin ninguna quincena cerrada no publica cifras: dice «en curso».
//   · SIN RECIBO CARGADO, TODO ES NEGRO — y es una inferencia, no un hecho. Puede ser real (quien no
//     está registrado cobra todo en mano) o puede ser un recibo que nadie subió. Se cuenta y se dice.
//   · EL RECIBO MAYOR QUE LO COBRADO existe (6 casos en 2026): el negro se apoya en 0 —no puede ser
//     negativo— y la diferencia se declara en vez de esconderse en la resta.
//
// ═══ EL LÍMITE QUE HAY QUE SABER: «PAGADO» ACÁ ES «LIQUIDADO Y CERRADO» ═══
//
// `liquidacion_linea` tiene `pagado_banco` y `pagado_efectivo` —lo registrado como entregado por cada
// canal— y NO se usan. Medido el 22/09/2026 sobre las 31 quincenas cerradas de 2026: lo registrado
// cubre el 58 % de lo liquidado en enero, el 63 % en marzo y el 90 % en agosto. Ese hueco es REGISTRO
// que falta, no plata que no salió —a nadie se le debe media quincena de enero—, así que medir con
// esa columna dibujaría una nómina que crece 30 puntos en el año sin que nadie cobre un peso más.
// Por eso la medida es la quincena CERRADA: la decisión de pago ya tomada y sellada. El día que el
// registro por canal esté completo pasa a ser la fuente buena, y la cuenta se cambia acá.
//
// LAS LIQUIDACIONES FINALES QUEDAN AFUERA (período `FINAL-MM/AAAA`): no son quincena y el dueño ya
// decidió que no entran en el costo de mano de obra.
//
// Puro: sin base, sin React. Se prueba en `nominaPagada.test.ts` con las cifras reales de 2026.

const n = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const r2 = (x: number): number => Math.round(x * 100) / 100
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Una cabecera de `liquidacion_quincena`. */
export interface FilaQuincena { id: string; desde: string; estado: string }
/** Una línea de `liquidacion_linea`: lo sellado al cerrar, con lo escrito a mano si lo hay. */
export interface FilaLinea { liquidacion_id: string; persona_id: string; cobra: unknown; cobra_manual?: unknown }
/** Una línea de `recibo_sueldo_linea`: el recibo real del estudio. */
export interface FilaRecibo { persona_id: string; periodo: string; neto: unknown }
/** `persona_directorio`: sólo el nombre, para el detalle del mes. */
export interface FilaPersona { id: string; nombre_completo: unknown }

export type EstadoMesPagado = 'cerrado' | 'parcial' | 'sin_cerrar'

/** Un aviso con cuántos casos y cuántos pesos hay detrás. `n === 0` = nada que decir. */
export interface Aviso { n: number; importe: number }

export interface MesPagado {
  /** `AAAA-MM`. */
  mes: string
  /** Neto de los recibos del mes. `null` = ninguna quincena cerrada: no hay nada que afirmar. */
  blanco: number | null
  negro: number | null
  total: number | null
  estado: EstadoMesPagado
  quincenasCerradas: number
  quincenasAbiertas: number
  /** Personas-quincena cobradas sin recibo cargado: su pago entero se cuenta como negro. */
  sinRecibo: Aviso
  /** Recibos de un período cerrado sin línea de liquidación: su neto suma al blanco sin quincena detrás. */
  sinLinea: Aviso
  /** El recibo superó lo cobrado: el negro se apoya en 0 y acá va la diferencia. */
  reciboMayor: Aviso
}

export interface PersonaPagada {
  personaId: string
  nombre: string
  blanco: number
  negro: number
  total: number
  /** No tiene recibo cargado en el mes: todo su pago está contado como negro. */
  sinRecibo: boolean
  /** Tiene recibo y no tiene línea de quincena: sólo se le puede afirmar el blanco. */
  sinLinea: boolean
  /** El recibo superó lo cobrado, por tanto. `null` = no pasó. */
  reciboMayor: number | null
}

export interface NominaPagada {
  anio: number
  meses: MesPagado[]
  /** La suma de los meses con al menos una quincena cerrada. `null` = ninguno. */
  total: { blanco: number; negro: number; total: number; meses: number } | null
  /** Qué parte del total salió en negro. `null` sin total. */
  pctNegro: number | null
  /** El detalle por persona de cada mes con cifras. */
  porPersona: Map<string, PersonaPagada[]>
  avisos: { sinRecibo: Aviso; sinLinea: Aviso; reciboMayor: Aviso; mesesSinCerrar: number; quincenasAbiertas: number }
}

/**
 * EL PERÍODO DE RECIBO DE UNA QUINCENA: `2026-08-16` → `Q2-08/2026`. Es el formato de
 * `recibo_sueldo_linea.periodo` y el de `periodoDeRecibo` en Liquidación: una quincena que empieza
 * del 16 en adelante es la segunda del mes.
 */
export function periodoDeQuincena(desde: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return null
  const dia = Number(desde.slice(8, 10))
  return `${dia >= 16 ? 'Q2' : 'Q1'}-${desde.slice(5, 7)}/${desde.slice(0, 4)}`
}

/** El mes de un período de recibo: `Q2-08/2026` → `2026-08`. `FINAL-…` y lo que no se entiende, `null`. */
export function mesDePeriodo(periodo: string): string | null {
  const m = /^Q[12]-(\d{2})\/(\d{4})$/.exec(periodo)
  return m ? `${m[2]}-${m[1]}` : null
}

/** `2026-03` → sí, `2026-13` → no. Lo que llega por la URL no se cree. */
export function leerMes(crudo: unknown): string | null {
  const s = Array.isArray(crudo) ? crudo[0] : crudo
  if (typeof s !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return null
  return s
}

const vacio = (): Aviso => ({ n: 0, importe: 0 })
const sumar = (a: Aviso, importe: number): void => { a.n++; a.importe = r2(a.importe + importe) }

interface Acumulado {
  cerradas: number
  abiertas: number
  periodosCerrados: Set<string>
  personas: Map<string, { cobra: number; blanco: number; conLinea: boolean; conRecibo: boolean }>
}

/**
 * LO PAGADO EN EL AÑO, MES A MES Y PERSONA POR PERSONA.
 *
 * Todo lo que entra son filas ya leídas. `anio` es el año calendario que se mira; las quincenas y
 * los recibos de otro año no se cuentan (una serie que mezcla años no se puede leer de corrido).
 */
export function pagoDeNomina(d: {
  quincenas: readonly FilaQuincena[]
  lineas: readonly FilaLinea[]
  recibos: readonly FilaRecibo[]
  personas: readonly FilaPersona[]
  anio: number
}): NominaPagada {
  const anio = String(d.anio)
  const quincenas = new Map(d.quincenas.filter((q) => q.desde?.slice(0, 4) === anio).map((q) => [q.id, q]))
  const meses = new Map<string, Acumulado>()
  const acumulado = (mes: string): Acumulado => {
    const a = meses.get(mes) ?? { cerradas: 0, abiertas: 0, periodosCerrados: new Set<string>(), personas: new Map() }
    meses.set(mes, a)
    return a
  }
  for (const q of quincenas.values()) {
    const a = acumulado(q.desde.slice(0, 7))
    if (q.estado === 'cerrada') {
      a.cerradas++
      const p = periodoDeQuincena(q.desde)
      if (p) a.periodosCerrados.add(p)
    } else a.abiertas++
  }
  const dePersona = (a: Acumulado, personaId: string) => {
    const p = a.personas.get(personaId) ?? { cobra: 0, blanco: 0, conLinea: false, conRecibo: false }
    a.personas.set(personaId, p)
    return p
  }
  // LO COBRADO SÓLO DE LAS QUINCENAS CERRADAS: una abierta todavía no selló `cobra` y vale 0 en la base.
  for (const l of d.lineas) {
    const q = quincenas.get(l.liquidacion_id)
    if (!q || q.estado !== 'cerrada') continue
    const p = dePersona(acumulado(q.desde.slice(0, 7)), l.persona_id)
    p.cobra = r2(p.cobra + (n(l.cobra_manual) ?? n(l.cobra) ?? 0))
    p.conLinea = true
  }
  // EL BLANCO, SÓLO DE LOS PERÍODOS QUE YA CERRARON: el recibo de una quincena abierta entraría sin
  // su negro al lado y el mes saldría 100 % en blanco.
  for (const r of d.recibos) {
    const mes = mesDePeriodo(r.periodo)
    const neto = n(r.neto)
    if (!mes || mes.slice(0, 4) !== anio || neto == null) continue
    const a = meses.get(mes)
    if (!a || !a.periodosCerrados.has(r.periodo)) continue
    const p = dePersona(a, r.persona_id)
    p.blanco = r2(p.blanco + neto)
    p.conRecibo = true
  }

  const nombres = new Map(d.personas.map((p) => [p.id, texto(p.nombre_completo)]))
  const porPersona = new Map<string, PersonaPagada[]>()
  const avisos = { sinRecibo: vacio(), sinLinea: vacio(), reciboMayor: vacio(), mesesSinCerrar: 0, quincenasAbiertas: 0 }
  const filas: MesPagado[] = [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, a]) => {
    const estado: EstadoMesPagado = a.cerradas === 0 ? 'sin_cerrar' : a.abiertas > 0 ? 'parcial' : 'cerrado'
    avisos.quincenasAbiertas += a.abiertas
    const f: MesPagado = {
      mes, blanco: null, negro: null, total: null, estado,
      quincenasCerradas: a.cerradas, quincenasAbiertas: a.abiertas,
      sinRecibo: vacio(), sinLinea: vacio(), reciboMayor: vacio(),
    }
    if (estado === 'sin_cerrar') { avisos.mesesSinCerrar++; return f }
    const gente: PersonaPagada[] = []
    let blanco = 0
    let negro = 0
    for (const [personaId, p] of a.personas) {
      // SIN RECIBO, TODO LO COBRADO ES NEGRO. Con recibo, el negro es el resto —nunca negativo—.
      const suNegro = p.conRecibo ? Math.max(0, r2(p.cobra - p.blanco)) : p.cobra
      const mayor = p.conRecibo && p.blanco > p.cobra ? r2(p.blanco - p.cobra) : null
      if (p.cobra > 0 && !p.conRecibo) { sumar(f.sinRecibo, p.cobra); sumar(avisos.sinRecibo, p.cobra) }
      if (p.conRecibo && !p.conLinea) { sumar(f.sinLinea, p.blanco); sumar(avisos.sinLinea, p.blanco) }
      if (mayor != null) { sumar(f.reciboMayor, mayor); sumar(avisos.reciboMayor, mayor) }
      blanco = r2(blanco + p.blanco)
      negro = r2(negro + suNegro)
      if (p.blanco > 0 || suNegro > 0) {
        gente.push({
          personaId, nombre: nombres.get(personaId) ?? 'sin nombre en el directorio',
          blanco: p.blanco, negro: suNegro, total: r2(p.blanco + suNegro),
          sinRecibo: !p.conRecibo, sinLinea: p.conRecibo && !p.conLinea, reciboMayor: mayor,
        })
      }
    }
    f.blanco = blanco
    f.negro = negro
    f.total = r2(blanco + negro)
    porPersona.set(mes, gente.sort((x, y) => y.total - x.total || x.nombre.localeCompare(y.nombre)))
    return f
  })

  const conCifras = filas.filter((m) => m.total != null)
  const total = conCifras.length ? {
    blanco: r2(conCifras.reduce((s, m) => s + (m.blanco ?? 0), 0)),
    negro: r2(conCifras.reduce((s, m) => s + (m.negro ?? 0), 0)),
    total: r2(conCifras.reduce((s, m) => s + (m.total ?? 0), 0)),
    meses: conCifras.length,
  } : null
  return {
    anio: d.anio, meses: filas, total, porPersona, avisos,
    pctNegro: total && total.total > 0 ? total.negro / total.total : null,
  }
}

/** El mes que abre el detalle: el pedido si tiene cifras; si no, el último que las tenga. */
export function mesDelDetalle(p: NominaPagada, pedido: string | null): string | null {
  const conCifras = p.meses.filter((m) => m.total != null).map((m) => m.mes)
  if (pedido && conCifras.includes(pedido)) return pedido
  return conCifras.at(-1) ?? null
}
