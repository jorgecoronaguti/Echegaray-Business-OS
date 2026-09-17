// LA VISTA «CARGAS SOCIALES»: el F931 mes por mes y los planes de pago con sus cuotas. Server Components.
// Qué fila entra lo decide `services/impuestosCargas.ts` —la misma regla que escribe el bloque de la
// pestaña «Impuestos y Financieros»—; acá sólo se dibuja.
//
// ═══ LOS PLANES TERMINADOS NO SE BORRAN: SE PLIEGAN ═══
//
// Dos planes cancelados con seis cuotas cada uno eran catorce renglones de «pagada» entre el F931 y lo
// que falta pagar. Siguen estando —son historia de deuda y la pidieron—, dentro de un `<details>`
// nativo: se abre con un toque, sin JavaScript, y el que busca lo encuentra en el mismo lugar.
import { plata } from '@/shared/utils/format'
import type { PosicionImpuesto } from '../../services/impuestos'
import type { cargasSociales, CuotaPlan, PlanDePago } from '../../services/impuestosCargas'
import { estadoLlano, periodoCorto } from '../../services/impuestosVista'
import { EstadoTexto, Importe, Origen, Plegada, Vacio, Vence } from './piezas'

type Cargas = ReturnType<typeof cargasSociales>

const FILA = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-3 text-[13px] md:grid-cols-[120px_150px_150px_150px_220px_200px_minmax(0,1fr)] md:items-baseline md:py-2.5'

function FilaF931({ f }: { f: PosicionImpuesto }) {
  const e = estadoLlano(f)
  return (
    <li className={FILA} data-periodo={f.periodo}>
      <span className="order-1 font-medium text-ink md:order-none md:font-normal">{periodoCorto(f)}</span>
      {/* En el teléfono «Del mes» y «Pagado» comparten un renglón; en la computadora `md:contents`
          los devuelve a sus dos columnas sin duplicar el marcado. */}
      <span className="order-5 flex flex-wrap gap-x-3 text-[12px] text-muted md:contents">
        <span className="md:text-right md:text-[13px] md:text-ink">
          <span className="md:hidden">Del mes </span><Importe n={f.determinado} falta="sin dato" />
        </span>
        <span className="md:text-right md:text-[13px] md:text-ink">
          <span className="md:hidden">Pagado </span>{f.pagado ? <span className="font-mono tabular-nums">{plata(f.pagado)}</span> : <span className="text-faint">—</span>}
        </span>
      </span>
      <span className="order-2 text-right text-ink md:order-none">
        {f.pendiente === 0 ? <span className="text-faint">—</span> : <Importe n={f.pendiente} />}
      </span>
      <span className="order-4 text-right text-[12px] md:order-none md:text-left md:text-[13px]"><Vence fecha={f.vencimiento} confianza={f.vencimiento_confianza} /></span>
      <span className="order-3 md:order-none"><EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto></span>
      <span className="order-6 text-right md:order-none md:text-left"><Origen f={f} /></span>
    </li>
  )
}

function TablaF931({ filas }: { filas: PosicionImpuesto[] }) {
  if (!filas.length) return <Vacio>Todavía no hay ningún F931 cargado.</Vacio>
  return (
    <div data-testid="cargas-f931">
      <div aria-hidden className="hidden h-8 items-center gap-x-3 border-y border-line text-[12px] text-faint md:grid md:grid-cols-[120px_150px_150px_150px_220px_200px_minmax(0,1fr)]">
        <span>Mes</span><span className="text-right">Del mes</span><span className="text-right">Pagado</span><span className="text-right">Falta pagar</span>
        <span>Vence</span><span>Estado</span><span>De dónde sale</span>
      </div>
      <ul className="border-t border-line md:border-t-0">{filas.map((f) => <FilaF931 key={`${f.periodo}-${f.concepto}`} f={f} />)}</ul>
    </div>
  )
}

function Cuota({ plan, q }: { plan: string; q: CuotaPlan }) {
  return (
    <li data-cuota={`${q.n}/${q.de}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-2.5 pl-3 text-[13px] md:grid-cols-[160px_150px_minmax(0,1fr)_200px] md:items-baseline">
      <span className="text-muted" title={plan}>Cuota {q.n} de {q.de}</span>
      <span className="text-right text-ink"><Importe n={q.importe} falta="sin dato" /></span>
      <span className="text-[12px] text-muted md:text-[13px]"><Vence fecha={q.vencimiento} confianza={q.confianza} /></span>
      <span className="text-right md:text-left">
        <EstadoTexto tono={q.pagada ? 'pos' : 'warn'} clave={q.pagada ? 'pagada' : 'pendiente'}>
          {q.pagada ? 'Pagada' : q.estado === 'estimado' ? 'Falta pagar · importe estimado' : 'Falta pagar'}
        </EstadoTexto>
      </span>
    </li>
  )
}

function Plan({ p }: { p: PlanDePago }) {
  const abierto = p.saldo > 0 || p.sinImporte > 0
  return (
    <div data-plan={p.nombre} className="mt-3 first:mt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-2 text-[13px]">
        <span className="font-semibold text-ink">{p.nombre}</span>
        <span className="text-muted">{p.pagadas} de {p.cuotas.length} cuotas pagadas</span>
        <span className="ml-auto">
          {abierto
            ? <span className="text-warn">falta <span className="font-mono tabular-nums">{plata(p.saldo)}</span>{p.sinImporte ? ` + ${p.sinImporte} sin importe` : ''}</span>
            : <span className="text-faint">terminado</span>}
        </span>
      </div>
      <ul>{p.cuotas.map((q) => <Cuota key={q.n} plan={p.nombre} q={q} />)}</ul>
    </div>
  )
}

function Planes({ planes }: { planes: PlanDePago[] }) {
  if (!planes.length) return <Vacio>No hay planes de pago de F931 registrados.</Vacio>
  const abiertos = planes.filter((p) => p.saldo > 0 || p.sinImporte > 0)
  const terminados = planes.filter((p) => !abiertos.includes(p))
  return (
    <div data-testid="cargas-planes">
      {abiertos.map((p) => <Plan key={p.nombre} p={p} />)}
      {!abiertos.length && <Vacio>Ningún plan con cuotas por pagar.</Vacio>}
      {terminados.length > 0 && (
        <details className="group mt-3" data-testid="cargas-planes-terminados">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[13px] text-muted hover:text-ink">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
            Planes terminados ({terminados.length})
          </summary>
          {terminados.map((p) => <Plan key={p.nombre} p={p} />)}
        </details>
      )}
    </div>
  )
}

/** El detalle de la solapa: el F931 mes por mes y los planes, plegados. Planes abiertos si alguno debe. */
export function SeccionCargasSociales({ c }: { c: Cargas }) {
  const debe = c.planes.some((p) => p.saldo > 0 || p.sinImporte > 0)
  return (
    <div data-testid="bloque-cargas-sociales">
      <Plegada testid="cargas-f931-seccion" titulo="F931 mes por mes" resumen={`falta pagar entre F931 y planes: ${plata(c.pendienteTotal)}${c.pendienteSinImporte ? ` + ${c.pendienteSinImporte} sin importe` : ''}`}>
        <TablaF931 filas={c.periodos} />
      </Plegada>
      <Plegada testid="cargas-planes-seccion" titulo="Planes de pago" resumen={`${c.planes.length} plan${c.planes.length === 1 ? '' : 'es'}`} abierta={debe}>
        <Planes planes={c.planes} />
      </Plegada>
    </div>
  )
}
