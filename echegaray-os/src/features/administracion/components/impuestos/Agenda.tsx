// LOS VENCIMIENTOS. Server Components.
//
// Dos formas del mismo dato: la LISTA CORTA del resumen (máximo cinco renglones: fecha, qué, cuánto,
// estado en una palabra) y la AGENDA COMPLETA partida por urgencia, que vive en «Todo el historial».
// Ninguna es tabla: a 390 px una tabla de cinco columnas obligaba a deslizar de costado para ver el
// importe, y en la computadora la misma fila se alinea en columnas con `grid`.
import Link from 'next/link'
import { plata } from '@/shared/utils/format'
import { ddmm, type Vencimiento } from '../../services/impuestos'
import { agenda, enDias, estadoCorto, estadoLlano, nombreLlano, TITULO_URGENCIA } from '../../services/impuestosVista'
import { EstadoTexto, Importe, Origen, TONO, Vacio, Vence } from './piezas'

const CORTA = 'grid grid-cols-[92px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-3 text-[14px] md:grid-cols-[120px_minmax(0,1fr)_160px_150px] md:py-2.5'

/** LA LISTA CORTA. Fecha y «en n días» en la primera columna; el estado debajo del importe en el teléfono. */
export function ProximosCortos({ lista, max = 5, verTodos, vacio, testid = 'impuestos-vencimientos' }: {
  lista: Vencimiento[]; max?: number; verTodos?: string; vacio: string; testid?: string
}) {
  if (!lista.length) return <p data-testid="vacio" className="py-3 text-[14px] text-muted">{vacio}</p>
  return (
    <div data-testid={testid}>
      <ul>
        {lista.slice(0, max).map((f) => {
          const e = estadoCorto(f, f.dias)
          return (
            <li key={`${f.impuesto}-${f.periodo}-${f.concepto}`} className={CORTA} data-impuesto={f.impuesto} data-periodo={f.periodo}>
              <span className="flex flex-col">
                <span className="font-mono tabular-nums text-ink">{ddmm(f.vencimiento)}</span>
                <span className={`text-[12px] ${f.dias < 0 ? 'text-neg' : 'text-faint'}`}>{enDias(f.dias)}</span>
                {f.vencimiento_confianza === 'supuesto' && (
                  <span className="text-[12px] text-faint" data-supuesto="" title="Fecha estimada: el organismo no publica una tabla que el OS pueda verificar">fecha estimada</span>
                )}
              </span>
              <span className="min-w-0 text-ink">{nombreLlano(f)}</span>
              <span className="flex flex-col items-end md:contents">
                <span className="text-right font-mono tabular-nums text-ink"><Importe n={f.pendiente} /></span>
                <span className={`text-right text-[12px] md:text-left md:text-[13px] ${TONO[e.tono]}`} data-testid="estado" data-estado={f.estado}>{e.texto}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {verTodos && lista.length > max && (
        <Link prefetch={false} href={verTodos} className="inline-flex min-h-[44px] items-center text-[13px] text-muted hover:text-ink">
          Ver los {lista.length} vencimientos ›
        </Link>
      )}
    </div>
  )
}

const FILA = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-3 text-[13px] md:grid-cols-[256px_minmax(0,1fr)_140px_200px_200px] md:items-baseline md:gap-y-0 md:py-2.5'

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

/** LA AGENDA COMPLETA: vencido, esta semana, dentro de 30 días, cada grupo con su subtotal y el origen. */
export function Agenda({ lista, vacio, testid = 'impuestos-agenda' }: { lista: Vencimiento[]; vacio: string; testid?: string }) {
  if (!lista.length) return <Vacio>{vacio}</Vacio>
  return (
    <div data-testid={testid}>
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
