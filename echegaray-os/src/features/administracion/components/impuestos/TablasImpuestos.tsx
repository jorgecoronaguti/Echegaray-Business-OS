// EL DETALLE MES POR MES Y LOS PAGOS SIN IDENTIFICAR. Server Components puros.
// Qué fila entra lo decide `services/impuestos.ts`; acá sólo se dibuja.
//
// ═══ SÓLO LAS COLUMNAS QUE TIENEN ALGO ═══
//
// La tabla vieja tenía nueve columnas para todos los impuestos, y en el F931 o el impuesto al cheque
// «Créditos» y «A favor» eran una columna entera de «—». Acá cada vista muestra las columnas en las que
// al menos una fila tiene dato; la que no tiene nada no se dibuja. Ningún dato se pierde: si mañana una
// fila trae créditos, la columna aparece.
//
// ═══ EN EL TELÉFONO NO ES TABLA ═══
//
// A 390 px nueve columnas obligaban a deslizar de costado. Cada período es un renglón: período e
// importe a pagar arriba, estado y pagado al medio, el resto abajo en chico.
import type { ReactNode } from 'react'
import { plata } from '@/shared/utils/format'
import { ddmm, type PagoSinImputar, type PosicionImpuesto } from '../../services/impuestos'
import { columnasConDato, estadoLlano, NOMBRE_LLANO, periodoCorto, type Columna } from '../../services/impuestosVista'
import { EstadoTexto, Importe, Origen, Vacio, Vence } from './piezas'

const ROTULO: Record<Columna, { corto: string; ayuda: string }> = {
  determinado: { corto: 'Impuesto del período', ayuda: 'El impuesto del período según la declaración o el cálculo' },
  creditos: { corto: 'Créditos', ayuda: 'Lo que se descuenta del impuesto del período, según la declaración o el cálculo' },
  a_pagar: { corto: 'A pagar', ayuda: 'Lo que la declaración o el cálculo deja para pagar' },
  pagado: { corto: 'Pagado', ayuda: 'VEP y débitos del banco imputados a esta obligación' },
  saldo_a_favor: { corto: 'A favor', ayuda: 'Saldo a favor que deja el período' },
}

const valor = (f: PosicionImpuesto, c: Columna): ReactNode =>
  c === 'pagado' ? (f.pagado ? plata(f.pagado) : <span className="text-faint">—</span>) : <Importe n={f[c]} falta="sin dato" />

const TH = 'h-8 px-3 text-[12px] font-normal text-faint first:pl-0 last:pr-0'
const TD = 'h-10 px-3 text-[13px] first:pl-0 last:pr-0'

/** La tabla de la computadora. */
function TablaAncha({ filas, cols, conImpuesto }: { filas: PosicionImpuesto[]; cols: Columna[]; conImpuesto: boolean }) {
  return (
    <table className="hidden w-full border-collapse text-left md:table">
      <thead>
        <tr className="border-y border-line">
          <th className={TH}>Período</th>
          {conImpuesto && <th className={TH}>Impuesto</th>}
          {cols.map((c) => <th key={c} className={`${TH} text-right`} title={ROTULO[c].ayuda}>{ROTULO[c].corto}</th>)}
          <th className={TH}>Vence</th><th className={TH}>Estado</th><th className={TH}>De dónde sale</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => {
          const e = estadoLlano(f)
          return (
            <tr key={`${f.impuesto}-${f.periodo}-${f.concepto}`} data-impuesto={f.impuesto} data-periodo={f.periodo} className="border-b border-line-hairline">
              <td className={`${TD} text-ink`}>{periodoCorto(f)}</td>
              {conImpuesto && <td className={`${TD} text-ink`}>{NOMBRE_LLANO[f.impuesto]}</td>}
              {cols.map((c) => <td key={c} className={`${TD} text-right font-mono tabular-nums text-ink`}>{valor(f, c)}</td>)}
              <td className={TD}><Vence fecha={f.vencimiento} confianza={f.vencimiento_confianza} /></td>
              <td className={TD}><EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto></td>
              <td className={TD}><Origen f={f} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Los renglones del teléfono: lo que se paga arriba, el resto abajo y en chico. */
function ListaAngosta({ filas, cols, conImpuesto }: { filas: PosicionImpuesto[]; cols: Columna[]; conImpuesto: boolean }) {
  const resto = cols.filter((c) => c !== 'a_pagar')
  return (
    <ul className="border-t border-line md:hidden">
      {filas.map((f) => {
        const e = estadoLlano(f)
        return (
          <li key={`${f.impuesto}-${f.periodo}-${f.concepto}`} data-impuesto={f.impuesto} data-periodo={f.periodo}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-3 text-[13px]">
            <span className="font-medium text-ink">{conImpuesto ? `${NOMBRE_LLANO[f.impuesto]} · ` : ''}{periodoCorto(f)}</span>
            <span className="text-right text-ink">
              {cols.includes('a_pagar') ? <><span className="text-[12px] text-faint">A pagar </span><Importe n={f.a_pagar} falta="sin dato" /></> : null}
            </span>
            <EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto>
            <span className="text-right text-[12px] text-muted"><Vence fecha={f.vencimiento} confianza={f.vencimiento_confianza} /></span>
            <span className="col-span-2 flex flex-wrap gap-x-3 text-[12px] text-muted">
              {resto.map((c) => <span key={c}>{ROTULO[c].corto} <span className="font-mono tabular-nums text-ink-soft">{valor(f, c)}</span></span>)}
              <Origen f={f} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Período × impuesto. `conImpuesto` agrega la columna cuando la vista junta varios (Otros, Historial). */
export function MesAMes({ filas, testid, conImpuesto = false, vacio }: {
  filas: PosicionImpuesto[]; testid: string; conImpuesto?: boolean; vacio: string
}) {
  if (!filas.length) return <Vacio>{vacio}</Vacio>
  const cols = columnasConDato(filas)
  return (
    <div data-testid={testid}>
      <TablaAncha filas={filas} cols={cols} conImpuesto={conImpuesto} />
      <ListaAngosta filas={filas} cols={cols} conImpuesto={conImpuesto} />
    </div>
  )
}

const COMO: Record<string, string> = {
  vep: 'VEP', debito_automatico: 'débito automático', debito_bancario: 'débito del banco', retencion: 'retención', percepcion: 'percepción',
  // DEBIN: lo inicia el cobrador (PlusPagos cobra el IIBB de DGR San Juan) y el pagador lo acepta (19/09/2026).
  debin: 'DEBIN',
}

/** Los pagos al fisco que salieron pero no se sabe a qué impuesto van. */
export function TablaSinImputar({ pagos }: { pagos: PagoSinImputar[] }) {
  return (
    <ul data-testid="impuestos-sin-imputar" className="border-t border-line">
      {pagos.map((p, i) => (
        <li key={`${p.fecha}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line-hairline py-3 text-[13px] md:grid-cols-[88px_140px_minmax(0,1fr)_200px] md:items-baseline md:py-2.5">
          <span className="order-3 font-mono tabular-nums text-muted md:order-none">{ddmm(p.fecha)}</span>
          <span className="order-2 text-right font-mono tabular-nums text-ink md:order-none">{plata(p.importe)}</span>
          <span className="order-1 min-w-0 break-words text-ink md:order-none">{p.descripcion ?? 'sin descripción'}</span>
          <span className="order-4 text-right text-[12px] text-faint md:order-none md:text-left">
            {p.tipo ? `${COMO[p.tipo] ?? p.tipo} · ` : ''}{p.fuente === 'banco' ? 'extracto del banco' : p.fuente === 'compras' ? 'cargado en Compras' : p.fuente}
          </span>
        </li>
      ))}
    </ul>
  )
}
