// LOS NÚMEROS DE LOS GRÁFICOS DE IMPUESTOS — sin React ni Supabase.
//
// Dueño, 17/09/2026: «necesito que sea más sencillo, claro, minimalista y con gráficos». Acá no se
// dibuja nada: se decide qué suma cada barra, para que el SVG sólo pinte y el criterio se pruebe.
//
// ═══ DOS EJES DE TIEMPO, CADA UNO EN SU GRÁFICO ═══
//
// El resumen responde «cuánto se pagó y cuánto falta, mes a mes»: agrupa por MES DE VENCIMIENTO, que
// es cuando sale la plata. Una obligación sin fecha de vencimiento (lo cargado desde Compras, el
// impuesto al cheque) cae en el mes de su período, que para esas filas es el mes en que se pagó.
// La solapa de un impuesto responde «cuánto dio cada período y cuánto se pagó de eso»: agrupa por
// PERÍODO. Nunca se mezclan los dos criterios en un mismo gráfico.
import { cuotaDePlan } from './impuestosCargas.ts'
import type { PosicionImpuesto } from './impuestos.ts'
import { IMPUESTOS_DE_VISTA, type VistaImpuesto } from './impuestosVista.ts'

export const SERIES: VistaImpuesto[] = ['iva', 'iibb', 'cargas', 'ganancias', 'otros']

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '2026-09' → 'sep' (y 'sep 26' en enero o cuando cambia el año, para no perder la referencia). */
export const etiquetaMes = (mes: string, conAnio = false) =>
  `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]}${conAnio ? ` ${mes.slice(2, 4)}` : ''}`

/** Los meses de la ventana, del más viejo al más nuevo, alrededor del mes de `hoy`. */
export function ventana(hoy: string, atras: number, adelante: number) {
  const anio = Number(hoy.slice(0, 4))
  const mes = Number(hoy.slice(5, 7)) - 1
  return Array.from({ length: atras + adelante + 1 }, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - atras + i, 1))
    return d.toISOString().slice(0, 7)
  })
}

const vistaDe = (f: PosicionImpuesto): VistaImpuesto =>
  SERIES.find((v) => IMPUESTOS_DE_VISTA[v].includes(f.impuesto)) ?? 'otros'

const faltaPagar = (f: PosicionImpuesto) => f.estado !== 'pagado' && (f.pendiente === null || f.pendiente > 0)

export interface Capa { vista: VistaImpuesto; pagado: number; falta: number; faltaEstimada: number; sinImporte: number }
export interface MesDePago { mes: string; actual: boolean; capas: Capa[]; pagado: number; falta: number }

/**
 * EL GRÁFICO DEL RESUMEN: por mes de vencimiento, lo pagado y lo que falta pagar de cada impuesto.
 * `falta` suma sólo importes conocidos; `sinImporte` cuenta lo que no suma; `faltaEstimada` es la
 * parte de `falta` cuyo estado es estimado. Lo pagado con saldo en la base no «falta» (manda el estado).
 */
export function porMesDePago(filas: PosicionImpuesto[], hoy: string, atras = 11, adelante = 2): MesDePago[] {
  const actual = hoy.slice(0, 7)
  return recortarInicio(ventana(hoy, atras, adelante).map((mes) => {
    const delMes = filas.filter((f) => (f.vencimiento ?? f.periodo).slice(0, 7) === mes)
    const capas = SERIES.map((vista): Capa => {
      const propias = delMes.filter((f) => vistaDe(f) === vista)
      const pendientes = propias.filter(faltaPagar)
      return {
        vista,
        pagado: propias.reduce((s, f) => s + (f.pagado > 0 ? f.pagado : 0), 0),
        falta: pendientes.reduce((s, f) => s + (f.pendiente ?? 0), 0),
        faltaEstimada: pendientes.filter((f) => f.estado === 'estimado').reduce((s, f) => s + (f.pendiente ?? 0), 0),
        sinImporte: pendientes.filter((f) => f.pendiente === null).length,
      }
    })
    return {
      mes, actual: mes === actual, capas,
      pagado: capas.reduce((s, c) => s + c.pagado, 0),
      falta: capas.reduce((s, c) => s + c.falta, 0),
    }
  }))
}

/**
 * LA VENTANA ARRANCA EN EL PRIMER MES CON DATOS. Con la base empezando en ene-26, oct-25 a dic-25 eran
 * tres columnas vacías que le robaban ancho a las que sí dicen algo. Sólo se recorta el PRINCIPIO: un
 * mes vacío en el medio es un dato (no hubo nada) y el mes actual y los próximos no se tocan nunca.
 */
export function recortarInicio(meses: MesDePago[]) {
  const conDato = (m: MesDePago) => m.pagado > 0 || m.falta > 0 || m.capas.some((c) => c.sinImporte > 0)
  const primero = meses.findIndex((m) => conDato(m) || m.actual)
  return primero <= 0 ? meses : meses.slice(primero)
}

export interface Periodo { mes: string; actual: boolean; determinado: number | null; pagado: number; aFavor: number | null; estimado: boolean }

/**
 * EL GRÁFICO DE UNA SOLAPA: por período, el impuesto del período, lo pagado y el saldo a favor. Sin
 * las cuotas de planes (su período es el de la deuda financiada: inflaría ese mes) ni la declaración
 * anual (un año entero en una barra mensual). Ambas siguen en sus tablas. `determinado` null = ninguna
 * fila del mes lo trae: no se dibuja una barra en cero.
 */
export function porPeriodoDeImpuesto(filas: PosicionImpuesto[], vista: VistaImpuesto, hoy: string, meses = 14): Periodo[] {
  const actual = hoy.slice(0, 7)
  const propias = filas.filter((f) => IMPUESTOS_DE_VISTA[vista].includes(f.impuesto)
    && !cuotaDePlan(f.concepto) && !(f.concepto !== 'ddjj' && /ddjj/i.test(f.concepto)))
  return ventana(hoy, meses - 1, 0).map((mes) => {
    const delMes = propias.filter((f) => f.periodo === mes)
    const conDeterminado = delMes.filter((f) => f.determinado !== null)
    // El mes en curso (parcial) no dibuja saldo: cuatro días de ventas contra un mes entero llevaban la
    // línea a cero sin que nada hubiera pasado. Misma regla que `saldosAFavor`.
    const conSaldo = delMes.filter((f) => f.concepto === 'ddjj' && f.saldo_a_favor !== null && !f.detalle?.parcial)
    return {
      mes,
      actual: mes === actual,
      determinado: conDeterminado.length ? conDeterminado.reduce((s, f) => s + (f.determinado as number), 0) : null,
      pagado: delMes.reduce((s, f) => s + (f.pagado > 0 ? f.pagado : 0), 0),
      aFavor: conSaldo.length ? conSaldo.reduce((s, f) => s + (f.saldo_a_favor as number), 0) : null,
      estimado: delMes.some((f) => f.estado === 'estimado'),
    }
  })
}

/**
 * LAS LÍNEAS DEL EJE: 0 y tres o cuatro escalones «redondos» (1, 2, 2,5 o 5 × 10ⁿ) que cubren el
 * máximo, y hacia abajo si hay negativos. Una escala que no arranca en cero miente el tamaño.
 */
export function escala(min: number, max: number) {
  const alto = Math.max(max, 0)
  const bajo = Math.min(min, 0)
  const rango = alto - bajo || 1
  const bruto = rango / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = ([1, 2, 2.5, 5, 10].find((m) => m * pot >= bruto) ?? 10) * pot
  const desde = Math.floor(bajo / paso) * paso
  const hasta = Math.ceil(alto / paso) * paso
  const marcas: number[] = []
  for (let v = desde; v <= hasta + paso / 2; v += paso) marcas.push(Math.round(v))
  return { desde, hasta, marcas }
}
