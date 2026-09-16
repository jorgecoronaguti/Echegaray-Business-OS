// LA RETRIBUCIÓN DE UNA PERSONA EN EL AÑO — la sección «Retribución» del legajo. Dueño, 16/09/2026.
//
// Textual: *«rehacer ese historial de $/h que has hecho en los legajos de cada uno: quiero que sea una
// SECCIÓN, y quiero los montos totales que se le ha pagado a cada uno en 2026, y valor hora blanco y negro»*.
//
// ═══ NO CALCULA UN SUELDO: LEE LOS QUE LA LIQUIDACIÓN YA CALCULÓ ═══
//
// Cada fila es LA LÍNEA DE LA PERSONA EN EL CUADRO DE ESA QUINCENA, tal cual la publica
// `getLiquidacionDeLaQuincena` —con sus overrides, su espejo de JORNALES, su blanco real o estimado y su
// presentismo—. Volver a multiplicar horas por $/h acá sería una segunda definición de «cuánto cobra», y
// las dos pantallas discreparían el día que alguien corrija una celda. Para una quincena cerrada, la
// línea es la foto del cierre porque eso es lo que la Liquidación devuelve para ella.
//
// Lo único que este módulo decide es PRESENTACIÓN: qué quincenas entran en el año, cómo se agrupan los
// mensuales, cómo se suman los totales y cómo se ordenan los historiales.
//
// ═══ LO SELLADO SE MUESTRA COMO ESTÁ, Y LO QUE LE FALTA SE DICE ═══
//
// Las quincenas cerradas antes del 14/09/2026 se sellaron sin el modelo blanco + negro: su línea trae
// `porBanco` = lo GIRADO que el extracto vio (0 si no lo vio) y `sueldo: null`. Reescribirlas acá con el
// recibo real sería una segunda foto del cierre. En cambio, el recibo real del período —que la sección
// ya lee para el historial— viaja como REFERENCIA (`reciboReal`) para que la celda pueda decir «hay un
// recibo de $184.576 que el sello no tomó». Y una fila con `sinNeto` no escribe banco $0: escribe que
// falta el neto, que es lo que la Liquidación afirma de ella.
//
// ═══ EL MENSUAL SE LEE POR MES, Y CÓMO ═══
//
// La Liquidación arma a Oficina quincena por quincena con el neto mensual ENTERO en cada una
// (`cobraDe`): dos filas de $1.800.000 en un mes son el mismo sueldo visto dos veces, no $3.600.000. El
// dueño pidió «mes para mensuales», y la lectura coherente es: el importe del mes es el de la ÚLTIMA
// quincena que lo tiene —la más nueva ya sabe lo que la anterior sabía— y lo PAGADO se suma, porque un
// adelanto de la 1ª y el saldo de la 2ª son dos platas distintas que salieron. El saldo sale de la misma
// función que usa el cuadro (`pagoDeLaLinea`). Es una INFERENCIA de presentación, declarada acá y
// pendiente de que el dueño la confirme; no cambia ninguna cifra de la Liquidación.
//
// ═══ SIN PERMISO NO ES SIN DATO ═══
//
// El jefe de obra abre este legajo y la RLS de `liquida_sueldos()` le devolvería cero filas sin error:
// «no hay liquidaciones» y «no puedo verlas» se dibujarían igual. El permiso entra como dato.
//
// Puro: sin base, sin React. Se prueba en `retribucionDelLegajo.test.ts`.

import { pagoDeLaLinea, totalesDePago, type PagoDeLaLinea } from './pagoDeLaQuincena.ts'
import { cabeceraQuincena, correrQuincena, nombreDelMes, quincenaDe, type Quincena } from './quincena.ts'
import type { ModalidadDeLiquidacion } from './liquidacionQuincena.ts'
import type { EstadoDelBlanco } from './sueldoBlancoNegro.ts'
import { periodoOrdenable } from './reglasDelRecibo.ts'
import { porcentajeDeVariacion, type ReciboDelLegajo } from './valorHoraDelLegajo.ts'
import { periodoDeRecibo } from './liquidacionCuadros.ts'
import { pesos } from '../components/liquidacion/formato.ts'

/** Una línea de recibo real, con el neto para la referencia de la fila. */
export interface ReciboDelBlanco extends ReciboDelLegajo {
  neto: number | null
}

/** Lo que esta sección lee de una `LineaConOverrides` de la Liquidación. Ninguna cuenta se repite acá. */
export interface LineaRetribuida {
  modalidad: ModalidadDeLiquidacion
  horas: number | null
  /** Hay $/h y horas pero el blanco no tiene neto: la Liquidación no afirma el total. */
  sinNeto: boolean
  /** $/h negro pactado. `null` en mensuales (tienen `netoMensual`) o sin tarifa. */
  valorHora: number | null
  netoMensual: number | null
  sinTarifa: boolean
  /** `null` fuera del modelo blanco + negro (Oficina, finales, quincena cerrada). */
  sueldo: { estado: EstadoDelBlanco } | null
  /** Los saldos de la fila, calculados por `pagoDeLaQuincena.ts`. */
  pago: PagoDeLaLinea
}

export interface QuincenaRetribuida {
  quincena: Quincena
  /** El estado del cuadro donde cayó la persona. `null` = no está en el plantel de esa quincena. */
  estado: 'abierta' | 'cerrada' | null
  linea: LineaRetribuida | null
}

export interface EntradaDeRetribucion {
  /** `liquidaSueldos(rol)`. `false` = no se leyó nada. */
  puedeVer: boolean
  anio: number
  /** De la más vieja a la más nueva o al revés: acá se ordenan. */
  quincenas: readonly QuincenaRetribuida[]
  /** Las líneas de recibo real de la persona: el historial del blanco y la referencia de cada fila. */
  recibos: readonly ReciboDelBlanco[]
  errores: readonly string[]
}

export interface FilaDeRetribucion {
  /** `desde` de la quincena (o de la primera del mes). Sirve de `key` y de enlace a la Liquidación. */
  desde: string
  periodo: string
  /** `fuera` = la persona no está en el plantel de esa quincena: la fila se dibuja vacía, no en cero. */
  estado: 'abierta' | 'cerrada' | 'fuera'
  mensual: boolean
  horas: number | null
  /** $/h negro, o el neto mensual si `mensual`. */
  tarifa: number | null
  sinTarifa: boolean
  /** El banco de esta fila es un neto ESTIMADO, no un recibo real. */
  bancoEstimado: boolean
  /** La Liquidación no pudo afirmar el neto: la celda del banco lo dice en vez de escribir $0. */
  sinNeto: boolean
  /** El neto del recibo REAL de este período, si el estudio lo cargó. Referencia, no la cifra de la fila. */
  reciboReal: number | null
  pago: PagoDeLaLinea | null
}

export interface TotalesDeRetribucion {
  horas: number
  negro: number
  blanco: number
  total: number
  pagadoBanco: number
  pagadoEfectivo: number
  pagado: number
  saldo: number
  /** Filas con línea pero sin saldo que afirmar: no suman a negro/blanco/total y el pie lo dice. */
  sinSaldo: number
  /** Filas cuyo banco la Liquidación no pudo afirmar (`sinNeto`): su total está incompleto. */
  sinNeto: number
  /** Cuántas filas tienen línea de la Liquidación. */
  liquidadas: number
}

export interface FilaDelBlanco {
  periodo: string
  categoria: string | null
  valorHora: string
  variacion: string | null
}

export interface CifraDelAnio {
  rotulo: string
  valor: string | null
  falta?: string
  titulo?: string
}

export interface RetribucionDelLegajo {
  puedeVer: boolean
  anio: number
  /** De la más nueva a la más vieja. */
  filas: FilaDeRetribucion[]
  totales: TotalesDeRetribucion
  cifras: CifraDelAnio[]
  /** El $/h del recibo real, período por período, de la más nueva a la más vieja. */
  historialBlanco: FilaDelBlanco[]
  errores: string[]
}

/**
 * LAS QUINCENAS DEL AÑO QUE YA EMPEZARON, de la primera de enero a la que contiene `hoy`.
 *
 * Se camina con `correrQuincena` y no sumando quince días: es la misma aritmética de bordes que usa
 * la Liquidación, y una segunda daría una quincena de más en los meses de 31.
 */
export function quincenasDelAnio(anio: number, hoy: string): Quincena[] {
  const tope = hoy.slice(0, 4) === String(anio) ? quincenaDe(hoy) : null
  if (hoy.slice(0, 4) < String(anio)) return []
  const lista: Quincena[] = []
  let q = quincenaDe(`${anio}-01-01`)
  while (q.desde.slice(0, 4) === String(anio) && (!tope || q.desde <= tope.desde)) {
    lista.push(q)
    q = correrQuincena(q, 1)
  }
  return lista
}

const suma = (valores: readonly (number | null)[]): number | null =>
  valores.some((v) => v != null) ? Math.round(valores.reduce<number>((a, v) => a + (v ?? 0), 0) * 100) / 100 : null

/** El neto del recibo real de cada período (`Q1-09/2026`), el mayor si el estudio cargó dos. */
type NetoPorPeriodo = ReadonlyMap<string, number>

export function netosPorPeriodo(recibos: readonly ReciboDelBlanco[]): NetoPorPeriodo {
  const m = new Map<string, number>()
  for (const r of recibos) {
    if (r.neto == null || !Number.isFinite(r.neto)) continue
    m.set(r.periodo, Math.max(r.neto, m.get(r.periodo) ?? -Infinity))
  }
  return m
}

const filaDeQuincena = (q: QuincenaRetribuida, netos: NetoPorPeriodo): FilaDeRetribucion => ({
  desde: q.quincena.desde,
  periodo: cabeceraQuincena(q.quincena),
  estado: q.linea && q.estado ? q.estado : 'fuera',
  mensual: q.linea?.modalidad === 'mensual',
  horas: q.linea?.horas ?? null,
  tarifa: q.linea ? (q.linea.modalidad === 'mensual' ? q.linea.netoMensual : q.linea.valorHora) : null,
  sinTarifa: q.linea?.sinTarifa ?? false,
  bancoEstimado: q.linea?.sueldo?.estado === 'estimado' && !q.linea.sinNeto && q.linea.pago.banco != null,
  sinNeto: q.linea?.sinNeto ?? false,
  reciboReal: q.linea ? netos.get(periodoDeRecibo(q.quincena)) ?? null : null,
  pago: q.linea?.pago ?? null,
})

/** UN MES DE UN MENSUAL EN UNA FILA: el importe de la última quincena, lo pagado de las dos. */
function filaDelMes(mes: readonly QuincenaRetribuida[]): FilaDeRetribucion {
  const conLinea = mes.filter((q) => q.linea)
  const ultima = conLinea[conLinea.length - 1] as QuincenaRetribuida & { linea: LineaRetribuida }
  const pago = pagoDeLaLinea({
    banco: ultima.linea.pago.banco,
    negro: ultima.linea.pago.negro,
    pagadoBanco: conLinea.reduce((a, q) => a + (q.linea?.pago.pagadoBanco ?? 0), 0),
    pagadoEfectivo: conLinea.reduce((a, q) => a + (q.linea?.pago.pagadoEfectivo ?? 0), 0),
  })
  const nombre = nombreDelMes(mes[0].quincena.desde)
  return {
    desde: mes[0].quincena.desde,
    periodo: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    estado: conLinea.every((q) => q.estado === 'cerrada') ? 'cerrada' : 'abierta',
    mensual: true,
    horas: suma(conLinea.map((q) => q.linea?.horas ?? null)),
    tarifa: ultima.linea.netoMensual,
    sinTarifa: ultima.linea.sinTarifa,
    bancoEstimado: ultima.linea.sueldo?.estado === 'estimado' && !ultima.linea.sinNeto && pago.banco != null,
    sinNeto: ultima.linea.sinNeto,
    reciboReal: null,
    pago,
  }
}

/**
 * LAS FILAS DEL AÑO. Un mes cuyas líneas son todas mensuales se lee en una fila; cualquier otro, por
 * quincena. Una persona que cambió de modalidad a mitad de año se ve con las dos formas, cada una en
 * su tramo: forzarla a una sola inventaría un neto mensual que no tuvo o partiría uno que sí.
 */
export function filasDeRetribucion(
  quincenas: readonly QuincenaRetribuida[], recibos: readonly ReciboDelBlanco[] = [],
): FilaDeRetribucion[] {
  const netos = netosPorPeriodo(recibos)
  const orden = [...quincenas].sort((a, b) => (a.quincena.desde < b.quincena.desde ? -1 : 1))
  const porMes = new Map<string, QuincenaRetribuida[]>()
  for (const q of orden) {
    const mes = q.quincena.desde.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), q])
  }
  const filas: FilaDeRetribucion[] = []
  for (const mes of porMes.values()) {
    const lineas = mes.filter((q) => q.linea)
    const mensual = lineas.length > 0 && lineas.every((q) => q.linea?.modalidad === 'mensual')
    if (mensual) filas.push(filaDelMes(mes))
    else filas.push(...mes.map((q) => filaDeQuincena(q, netos)))
  }
  return filas.reverse()
}

/** EL PIE: `totalesDePago` sobre las filas con línea —la misma suma que el cuadro de Pagos— más las horas. */
export function totalesDeRetribucion(filas: readonly FilaDeRetribucion[]): TotalesDeRetribucion {
  const conPago = filas.filter((f): f is FilaDeRetribucion & { pago: PagoDeLaLinea } => f.pago != null)
  const t = totalesDePago(conPago.map((f) => f.pago))
  return {
    horas: suma(conPago.map((f) => f.horas)) ?? 0,
    negro: t.negro, blanco: t.banco, total: t.total,
    pagadoBanco: t.pagadoBanco, pagadoEfectivo: t.pagadoEfectivo, pagado: t.pagado,
    saldo: t.saldoTotal, sinSaldo: t.sinSaldo, liquidadas: conPago.length,
    sinNeto: conPago.filter((f) => f.sinNeto).length,
  }
}

const horasTexto = (n: number): string => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`

/**
 * LAS CINCO CIFRAS DE ARRIBA. Sin ninguna fila liquidada se escribe el motivo, nunca $0.
 *
 * «LIQUIDADO» Y «CONSTA PAGADO» SON DOS NÚMEROS Y NO UNO. Lo liquidado es banco + negro de cada quincena
 * —lo que le corresponde—; lo pagado es lo que la base tiene como plata que salió (adelantos, giros y lo
 * registrado a mano). Hasta que las quincenas viejas no tengan sus pagos cargados, los dos se separan
 * por mucho, y un solo número los confundiría: «se le pagó $400.000 en el año» no es lo que pasó, es lo
 * que consta.
 */
export function cifrasDelAnio(anio: number, t: TotalesDeRetribucion): CifraDelAnio[] {
  const nada = t.liquidadas === 0
  const cifra = (rotulo: string, valor: string, titulo: string): CifraDelAnio =>
    nada ? { rotulo, valor: null, falta: 'sin liquidaciones', titulo } : { rotulo, valor, titulo }
  const fuera = t.sinSaldo > 0 ? ` (${t.sinSaldo} sin saldo que afirmar, fuera de la suma)` : ''
  const sinNeto = t.sinNeto > 0 ? ` ${t.sinNeto} quincena(s) sin neto afirmado: el banco de ésas no está.` : ''
  return [
    cifra(`liquidado ${anio}`, pesos(t.total),
      `banco + negro de cada quincena del año, como lo publica la Liquidación${fuera}.${sinNeto}`),
    cifra(`consta pagado ${anio}`, pesos(t.pagado),
      `banco ${pesos(t.pagadoBanco)} + efectivo ${pesos(t.pagadoEfectivo)}: lo que la base tiene como pagado (adelantos, giros y lo registrado en la Liquidación). No es lo liquidado: es lo que consta.`),
    cifra(`negro ${anio}`, pesos(t.negro), `Lo que el recibo no paga, sumado sobre las quincenas del año${fuera}.`),
    cifra(`blanco ${anio}`, pesos(t.blanco),
      `El neto del recibo (real o estimado) que tomó cada quincena${fuera}.${sinNeto} Las quincenas selladas antes del modelo blanco + negro traen sólo lo girado que vio el extracto.`),
    cifra(`horas ${anio}`, horasTexto(t.horas), 'Las horas cargadas que la Liquidación tomó en cada quincena del año.'),
  ]
}

/**
 * EL $/H DEL RECIBO, PERÍODO POR PERÍODO. Una fila por período (la de mayor $/h si el estudio cargó
 * dos), ordenadas por `periodoOrdenable` —no por texto: `Q2-08` es anterior a `Q1-09`— y con la
 * variación contra el período anterior que tenga $/h.
 */
export function historialDelBlanco(recibos: readonly ReciboDelLegajo[]): FilaDelBlanco[] {
  const porPeriodo = new Map<string, ReciboDelLegajo & { orden: string; valorHora: number }>()
  for (const r of recibos) {
    const orden = periodoOrdenable(r.periodo)
    if (orden === '' || r.valorHora == null || !Number.isFinite(r.valorHora)) continue
    const previo = porPeriodo.get(orden)
    if (!previo || r.valorHora > previo.valorHora) porPeriodo.set(orden, { ...r, orden, valorHora: r.valorHora })
  }
  const ascendente = [...porPeriodo.values()].sort((a, b) => (a.orden < b.orden ? -1 : 1))
  return ascendente.map((r, i) => {
    const anterior = i > 0 ? ascendente[i - 1].valorHora : null
    // SIN CAMBIO NO SE ESCRIBE «+0,0 %»: el estudio repite el $/h dos quincenas seguidas casi siempre, y
    // dieciséis renglones con un cero cada uno esconden los cuatro saltos que sí interesan.
    const texto = anterior == null || anterior === r.valorHora ? null : porcentajeDeVariacion(r.valorHora, anterior)
    return {
      periodo: r.periodo,
      categoria: r.categoria?.trim() || null,
      valorHora: pesos(r.valorHora),
      variacion: texto == null ? null : `${texto} vs ${anterior?.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`,
    }
  }).reverse()
}

/** LA SECCIÓN ENTERA, ARMADA DE UNA VEZ. */
export function armarRetribucion(e: EntradaDeRetribucion): RetribucionDelLegajo {
  if (!e.puedeVer) {
    return {
      puedeVer: false, anio: e.anio, filas: [], totales: totalesDeRetribucion([]),
      cifras: [], historialBlanco: [], errores: [],
    }
  }
  const filas = filasDeRetribucion(e.quincenas, e.recibos)
  const totales = totalesDeRetribucion(filas)
  return {
    puedeVer: true,
    anio: e.anio,
    filas,
    totales,
    cifras: cifrasDelAnio(e.anio, totales),
    historialBlanco: historialDelBlanco(e.recibos),
    errores: [...new Set(e.errores)],
  }
}
