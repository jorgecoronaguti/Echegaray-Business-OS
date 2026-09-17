// LOS DOS GRÁFICOS DE IMPUESTOS, ARMADOS EN EL SERVIDOR. Server Components: calculan columnas, escala
// y detalle con `services/impuestosGrafico.ts` y le pasan al SVG cliente sólo lo que tiene que pintar.
import { plata } from '@/shared/utils/format'
import type { PosicionImpuesto } from '../../services/impuestos'
import { escala, etiquetaMes, porMesDePago, porPeriodoDeImpuesto, SERIES } from '../../services/impuestosGrafico'
import { mesLargo, TITULO_VISTA, type VistaImpuesto } from '../../services/impuestosVista'
import { GraficoMensual, type ColorSerie, type ColumnaGrafico, type Detalle, type EntradaLeyenda } from './GraficoMensual'

/** Un color por impuesto, fijo: el IVA es azul en el resumen y en su solapa. */
export const COLOR: Record<VistaImpuesto, ColorSerie> = { iva: 1, iibb: 2, cargas: 3, ganancias: 4, otros: 5 }

const etiqueta = (mes: string, i: number) => etiquetaMes(mes, i === 0 || mes.endsWith('-01'))

const escalaDe = (columnas: ColumnaGrafico[]) => {
  const valores = columnas.flatMap((c) => [c.tramos.reduce((s, t) => s + t.valor, 0), c.fondo?.valor ?? 0, c.punto ?? 0])
  return escala(Math.min(0, ...valores), Math.max(0, ...valores))
}

/** Pagado y falta pagar por mes de vencimiento, una capa por impuesto. */
export function GraficoResumen({ filas, hoy }: { filas: PosicionImpuesto[]; hoy: string }) {
  const meses = porMesDePago(filas, hoy)
  const columnas: ColumnaGrafico[] = meses.map((m, i) => {
    const detalle: Detalle[] = []
    for (const c of m.capas) {
      if (c.pagado > 0) detalle.push({ rotulo: `${TITULO_VISTA[c.vista]} pagado`, valor: plata(c.pagado), color: COLOR[c.vista] })
      if (c.falta > 0) {
        const est = c.faltaEstimada >= c.falta ? ' (estimado)' : c.faltaEstimada > 0 ? ' (parte estimada)' : ''
        detalle.push({ rotulo: `${TITULO_VISTA[c.vista]} falta pagar${est}`, valor: plata(c.falta), color: COLOR[c.vista], rayado: true })
      }
      if (c.sinImporte > 0) detalle.push({ rotulo: `${TITULO_VISTA[c.vista]} sin importe`, valor: String(c.sinImporte) })
    }
    return {
      clave: m.mes, etiqueta: etiqueta(m.mes, i), etiquetaLarga: `${mesLargo(m.mes)}${m.actual ? ' (este mes)' : ''}`, actual: m.actual,
      tramos: [
        ...m.capas.map((c) => ({ color: COLOR[c.vista], valor: c.pagado })),
        ...m.capas.map((c) => ({ color: COLOR[c.vista], valor: c.falta, rayado: true })),
      ],
      detalle,
    }
  })
  const presentes = SERIES.filter((v) => meses.some((m) => m.capas.some((c) => c.vista === v && (c.pagado > 0 || c.falta > 0))))
  const leyenda: EntradaLeyenda[] = [
    ...presentes.map((v) => ({ rotulo: TITULO_VISTA[v], color: COLOR[v] })),
    { rotulo: 'lleno: pagado · rayado: falta pagar' },
  ]
  return (
    <GraficoMensual
      testid="grafico-resumen" titulo="Impuestos pagados y por pagar, por mes de vencimiento"
      columnas={columnas} leyenda={leyenda} escala={escalaDe(columnas)} angosto={{ atras: 5, adelante: 2 }}
    />
  )
}

/** Una solapa: impuesto del período (rayado), pagado (lleno) y saldo a favor (línea), por período. */
export function GraficoImpuesto({ filas, vista, hoy }: { filas: PosicionImpuesto[]; vista: VistaImpuesto; hoy: string }) {
  const color = COLOR[vista]
  const periodos = porPeriodoDeImpuesto(filas, vista, hoy)
  const columnas: ColumnaGrafico[] = periodos.map((p, i) => ({
    clave: p.mes, etiqueta: etiqueta(p.mes, i), etiquetaLarga: `${mesLargo(p.mes)}${p.estimado ? ' · estimado' : ''}`, actual: p.actual,
    fondo: p.determinado === null ? null : { valor: p.determinado, color },
    tramos: [{ color, valor: p.pagado }],
    punto: p.aFavor,
    detalle: [
      ...(p.determinado === null ? [] : [{ rotulo: 'Impuesto del período', valor: plata(p.determinado), color, rayado: true }]),
      ...(p.pagado > 0 ? [{ rotulo: 'Pagado', valor: plata(p.pagado), color }] : []),
      ...(p.aFavor === null ? [] : [{ rotulo: 'A favor', valor: plata(p.aFavor), linea: true }]),
    ],
  }))
  const leyenda: EntradaLeyenda[] = [
    { rotulo: 'Impuesto del período', color, rayado: true },
    { rotulo: 'Pagado', color },
    ...(periodos.some((p) => p.aFavor !== null) ? [{ rotulo: 'Saldo a favor', linea: true }] : []),
  ]
  return (
    <GraficoMensual
      testid={`grafico-${vista}`} titulo={`${TITULO_VISTA[vista]}: impuesto del período, pagado y saldo a favor`}
      columnas={columnas} leyenda={leyenda} escala={escalaDe(columnas)}
    />
  )
}
