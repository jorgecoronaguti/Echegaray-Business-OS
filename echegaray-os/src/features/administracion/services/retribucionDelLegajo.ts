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
import { pesos } from '../components/liquidacion/formato.ts'

/** Lo que esta sección lee de una `LineaConOverrides` de la Liquidación. Ninguna cuenta se repite acá. */
export interface LineaRetribuida {
  modalidad: ModalidadDeLiquidacion
  horas: number | null
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
  /** Las líneas de recibo real de la persona, para el historial del blanco. */
  recibos: readonly ReciboDelLegajo[]
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

const filaDeQuincena = (q: QuincenaRetribuida): FilaDeRetribucion => ({
  desde: q.quincena.desde,
  periodo: cabeceraQuincena(q.quincena),
  estado: q.linea && q.estado ? q.estado : 'fuera',
  mensual: q.linea?.modalidad === 'mensual',
  horas: q.linea?.horas ?? null,
  tarifa: q.linea ? (q.linea.modalidad === 'mensual' ? q.linea.netoMensual : q.linea.valorHora) : null,
  sinTarifa: q.linea?.sinTarifa ?? false,
  bancoEstimado: q.linea?.sueldo?.estado === 'estimado' && q.linea.pago.banco != null,
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
    bancoEstimado: ultima.linea.sueldo?.estado === 'estimado' && pago.banco != null,
    pago,
  }
}

/**
 * LAS FILAS DEL AÑO. Un mes cuyas líneas son todas mensuales se lee en una fila; cualquier otro, por
 * quincena. Una persona que cambió de modalidad a mitad de año se ve con las dos formas, cada una en
 * su tramo: forzarla a una sola inventaría un neto mensual que no tuvo o partiría uno que sí.
 */
export function filasDeRetribucion(quincenas: readonly QuincenaRetribuida[]): FilaDeRetribucion[] {
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
    else filas.push(...mes.map(filaDeQuincena))
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
  }
}

const horasTexto = (n: number): string => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`

/** Las cuatro cifras de arriba. Sin ninguna fila liquidada se escribe el motivo, nunca $0. */
export function cifrasDelAnio(anio: number, t: TotalesDeRetribucion): CifraDelAnio[] {
  const nada = t.liquidadas === 0
  const cifra = (rotulo: string, valor: string, titulo: string): CifraDelAnio =>
    nada ? { rotulo, valor: null, falta: 'sin liquidaciones', titulo } : { rotulo, valor, titulo }
  return [
    cifra(`pagado ${anio}`, pesos(t.pagado),
      `banco ${pesos(t.pagadoBanco)} + efectivo ${pesos(t.pagadoEfectivo)}: lo que consta pagado en las quincenas del año (adelantos, giros y lo registrado en la Liquidación).`),
    cifra(`negro ${anio}`, pesos(t.negro),
      `Lo que el recibo no paga, sumado sobre las quincenas con saldo que afirmar${t.sinSaldo > 0 ? ` (${t.sinSaldo} fuera de la suma)` : ''}.`),
    cifra(`blanco ${anio}`, pesos(t.blanco),
      `El neto del recibo (real o estimado), sumado sobre las quincenas con saldo que afirmar${t.sinSaldo > 0 ? ` (${t.sinSaldo} fuera de la suma)` : ''}.`),
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
    const texto = anterior == null ? null : porcentajeDeVariacion(r.valorHora, anterior)
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
  const filas = filasDeRetribucion(e.quincenas)
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
