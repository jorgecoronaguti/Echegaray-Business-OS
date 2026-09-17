// LA AGENDA DE VENCIMIENTOS Y EL RESUMEN POR IMPUESTO. Server Components.
//
// ═══ UNA FILA QUE SIRVE EN LAS DOS PANTALLAS ═══
//
// En la computadora cada vencimiento es una fila de cinco columnas alineadas (fecha, qué, cuánto,
// estado, origen). En el teléfono la misma fila se reacomoda en tres renglones —qué y cuánto arriba,
// cuándo y estado en el medio, origen abajo— con `order`, sin duplicar el marcado: una tabla de cinco
// columnas a 390 px obligaba a deslizar de costado para ver el importe, que es lo único que se vino a
// mirar.
import Link from 'next/link'
import { plata } from '@/shared/utils/format'
import { rotuloPeriodo, type Vencimiento } from '../../services/impuestos'
import {
  agenda, estadoLlano, FUENTE_LLANA, nombreLlano, TITULO_URGENCIA, type porImpuesto,
} from '../../services/impuestosVista'
import { EstadoTexto, Importe, Origen, Vacio, Vence } from './piezas'

const FILA = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-3 text-[13px] md:grid-cols-[256px_minmax(0,1fr)_140px_180px_200px] md:items-baseline md:gap-y-0 md:py-2.5'

function FilaVencimiento({ f }: { f: Vencimiento }) {
  const e = estadoLlano(f, f.dias)
  return (
    <li className={FILA} data-impuesto={f.impuesto} data-periodo={f.periodo}>
      <div className="order-3 md:order-none"><Vence fecha={f.vencimiento} confianza={f.vencimiento_confianza} dias={f.dias} /></div>
      <div className="order-1 min-w-0 font-medium text-ink md:order-none">{nombreLlano(f)}</div>
      <div className="order-2 text-right text-ink md:order-none"><Importe n={f.pendiente} /></div>
      <div className="order-4 text-right md:order-none md:text-left"><EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto></div>
      <div className="order-5 col-span-2 md:order-none md:col-span-1"><Origen f={f} /></div>
    </li>
  )
}

/** Los rótulos de columna, sólo en la computadora: en el teléfono cada dato se entiende por su lugar. */
const Encabezado = () => (
  <div aria-hidden className="hidden h-8 items-center border-b border-line text-[12px] text-faint md:grid md:grid-cols-[256px_minmax(0,1fr)_140px_180px_200px] md:gap-x-3">
    <span>Vence</span><span>Qué</span><span className="text-right">Cuánto</span><span>Estado</span><span>De dónde sale</span>
  </div>
)

/**
 * LA AGENDA: vencido, esta semana, dentro de 30 días. Cada grupo con su subtotal. El vencido va primero
 * y en rojo porque es lo único de la pantalla que ya costó algo (intereses).
 */
export function Agenda({ lista, vacio, testid = 'impuestos-vencimientos' }: { lista: Vencimiento[]; vacio: string; testid?: string }) {
  if (!lista.length) return <Vacio>{vacio}</Vacio>
  return (
    <div data-testid={testid}>
      <Encabezado />
      {agenda(lista).map((g) => (
        <div key={g.urgencia} data-urgencia={g.urgencia} className="mt-3 first-of-type:mt-0">
          <h3 className={`flex flex-wrap items-baseline gap-x-2 border-b border-line py-2 text-[12px] font-semibold ${g.urgencia === 'vencido' ? 'text-neg' : 'text-ink'}`}>
            {TITULO_URGENCIA[g.urgencia]}
            <span className="font-mono font-normal tabular-nums">{plata(g.total)}</span>
            {g.sinImporte > 0 && <span className="font-normal text-warn">+ {g.sinImporte} sin importe</span>}
          </h3>
          <ul>{g.filas.map((f) => <FilaVencimiento key={`${f.impuesto}-${f.periodo}-${f.concepto}`} f={f} />)}</ul>
        </div>
      ))}
    </div>
  )
}

type FilaResumen = ReturnType<typeof porImpuesto>[number]

const COLS_RESUMEN = 'md:grid-cols-[180px_160px_minmax(0,1fr)_minmax(0,1fr)_120px]'

/**
 * UNA FILA POR IMPUESTO: cuánto falta pagar (sin ventana), lo próximo que vence, cuánto hay a favor y
 * hasta qué mes hay datos. La fila entera es el enlace a su solapa: en el teléfono, 44 px o más.
 */
export function PorImpuesto({ filas, ruta }: { filas: FilaResumen[]; ruta: string }) {
  return (
    <div data-testid="impuestos-por-impuesto">
      <div aria-hidden className={`hidden h-8 items-center gap-x-3 border-b border-line text-[12px] text-faint md:grid ${COLS_RESUMEN}`}>
        <span>Impuesto</span><span className="text-right">Falta pagar</span><span>Lo próximo</span><span>A favor</span><span>Datos hasta</span>
      </div>
      <ul>
        {filas.map((r) => (
          <li key={r.vista} data-vista={r.vista}>
            <Link
              prefetch={false}
              href={`${ruta}?ver=${r.vista}`}
              className={`grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-3 text-[13px] hover:bg-surface-quiet md:items-baseline md:gap-y-0 md:py-2.5 ${COLS_RESUMEN}`}
            >
              <span className="font-medium text-ink">
                {r.titulo} <span aria-hidden className="text-faint">›</span>
              </span>
              <span className="text-right">
                <span className="font-mono tabular-nums text-ink">{plata(r.faltaPagar)}</span>
                {(r.estimados > 0 || r.sinImporte > 0) && (
                  <span className="block text-[12px] text-faint">
                    {[r.estimados ? `${r.estimados} estimado${r.estimados > 1 ? 's' : ''}` : null, r.sinImporte ? `${r.sinImporte} sin importe` : null].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="col-span-2 text-muted md:col-span-1">
                {r.vencidas > 0 && <span className="mr-2 text-neg">{r.vencidas} vencido{r.vencidas > 1 ? 's' : ''}</span>}
                {r.proximo
                  ? <><span className="block">{nombreLlano(r.proximo)}</span><Vence fecha={r.proximo.vencimiento} confianza={r.proximo.vencimiento_confianza} dias={r.proximo.dias} /></>
                  : r.vencidas ? null : <span className="text-faint">nada en 30 días</span>}
              </span>
              <span className="col-span-2 text-muted md:col-span-1">
                {r.aFavor.length
                  ? r.aFavor.map((s) => (
                    <span key={s.impuesto}>
                      <span className="md:hidden">A favor </span>
                      <span className="font-mono tabular-nums text-ink">{plata(s.saldo_a_favor)}</span>
                      <span className="text-[12px] text-faint"> {rotuloPeriodo(s.periodo)} · {FUENTE_LLANA[s.fuente]}</span>
                    </span>
                  ))
                  : <span className="text-faint md:inline hidden">—</span>}
              </span>
              <span className="col-span-2 text-[12px] text-faint md:col-span-1">
                {r.ultimoPeriodo ? <><span className="md:hidden">datos hasta </span>{rotuloPeriodo(r.ultimoPeriodo)}</> : '—'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
