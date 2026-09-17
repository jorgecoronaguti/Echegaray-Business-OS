// LOS BLOQUES DE LA PANTALLA DE IMPUESTOS. Server Components puros: ningún handler, ningún estado.
// Qué fila entra en cada bloque lo decide `services/impuestos.ts`; acá sólo se dibuja.
//
// SIN RUIDO (limpieza 17/09/2026, mismo criterio que Liquidación): el estado es TEXTO, no pastilla —60
// cápsulas iguales no dejaban ver el único «vencido»—; sólo se colorea lo que pide acción. Los
// encabezados van en caja normal. Mismas columnas, mismos testids, mismo `data-estado`.
//
// NULL SE ESCRIBE COMO AUSENCIA. Un IVA cuyo a pagar no se conoce dice «sin dato», no «$0»: cero es
// «no hay que pagar» y es una afirmación que el OS no puede hacer.
import type { ReactNode } from 'react'
import { Nulo, Num, Tabla, Td, Th as ThDs, THead, Tr, Vacio, type TonoEstado } from '@/shared/components/ds'
import { plata } from '@/shared/utils/format'
import {
  ddmm, NOMBRE_FUENTE, NOMBRE_IMPUESTO, rotuloPeriodo,
  type PagoSinImputar, type PosicionImpuesto, type Vencimiento,
} from '../../services/impuestos'
import { cuotaDePlan } from '../../services/impuestosCargas'

const importe = (n: number | null, falta = 'sin dato') => (n === null ? <Nulo>{falta}</Nulo> : <Num>{plata(n)}</Num>)

/**
 * El rótulo de una obligación: impuesto, período y —si no es la DDJJ— el concepto. La cuota de un plan
 * se nombra por el plan («Cuota 3/3 · Plan F931 W303094»): «F931 jun-26 · Plan F931 …» repetía el F931.
 */
export const nombreObligacion = (f: Pick<PosicionImpuesto, 'impuesto' | 'periodo' | 'concepto'>) => {
  const c = cuotaDePlan(f.concepto)
  if (c) return `Cuota ${c.n}/${c.de} · ${c.plan}`
  return `${NOMBRE_IMPUESTO[f.impuesto]} ${rotuloPeriodo(f.periodo)}${f.concepto === 'ddjj' ? '' : ` · ${f.concepto}`}`
}

/** El encabezado en caja normal: 10px versalita espaciada en tres tablas seguidas era la mitad del ruido. */
export const Th = ({ children, num }: { children?: ReactNode; num?: boolean }) => (
  <ThDs num={num}><span className="text-[11px] normal-case tracking-normal">{children}</span></ThDs>
)

const TONO_TEXTO: Record<TonoEstado, string> = { neg: 'text-neg', warn: 'text-warn', pos: 'text-faint', curso: 'text-muted', pendiente: 'text-muted', nulo: 'text-faint' }

/** El estado como palabra. Conserva `data-testid="estado"` y `data-estado`: los tests leen eso, no el color. */
export function EstadoTexto({ tono, clave, children }: { tono: TonoEstado; clave?: string; children: ReactNode }) {
  return <span data-testid="estado" data-estado={clave} className={`whitespace-nowrap text-[12px] ${TONO_TEXTO[tono]}`}>{children}</span>
}

export function estadoDe(f: PosicionImpuesto, dias?: number): { tono: TonoEstado; texto: string } {
  if (dias !== undefined && dias < 0) return { tono: 'neg', texto: 'vencido' }
  if (f.estado === 'pagado') return { tono: 'pos', texto: 'pagado' }
  if (f.estado === 'estimado') return { tono: 'pendiente', texto: f.detalle?.parcial ? 'estimado · parcial' : 'estimado' }
  if ((f.pendiente ?? 0) > 0) return { tono: 'warn', texto: 'presentada · a pagar' }
  return { tono: 'pendiente', texto: 'presentada' }
}

/** «DDJJ · 31/08»: de dónde sale el número y hasta cuándo llega esa fuente. */
const fuenteDe = (f: PosicionImpuesto) => (
  <span className="whitespace-nowrap text-[12px] text-faint">
    {NOMBRE_FUENTE[f.fuente]}{f.datos_al ? ` · ${ddmm(f.datos_al)}` : ''}
  </span>
)

export function Bloque({ titulo, cuenta, children, testid }: { titulo: string; cuenta?: ReactNode; children: ReactNode; testid: string }) {
  return (
    <section data-testid={testid} className="mt-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{titulo}</h2>
        {cuenta !== undefined && <span className="text-[12px] text-faint">{cuenta}</span>}
      </div>
      {children}
    </section>
  )
}

export function TablaVencimientos({ lista }: { lista: Vencimiento[] }) {
  if (!lista.length) return <Vacio>Nada pendiente con vencimiento en los próximos 30 días.</Vacio>
  return (
    <Tabla testid="impuestos-vencimientos" minWidth={520}>
      <THead>
        <Th>Vence</Th><Th>Obligación</Th><Th num>Pendiente</Th><Th>Estado</Th><Th>Fuente</Th>
      </THead>
      <tbody>
        {lista.map((f) => {
          const e = estadoDe(f, f.dias)
          return (
            <Tr key={`${f.impuesto}-${f.periodo}-${f.concepto}`} compacta>
              <Td>
                <Num>{ddmm(f.vencimiento)}</Num>
                {f.vencimiento_confianza === 'supuesto' && <span className="ml-1 text-[11px] text-faint" title="Fecha supuesta: la DGR no publica una tabla verificable">supuesto</span>}
              </Td>
              <Td fuerte>{nombreObligacion(f)}</Td>
              <Td num>{f.pendiente === null ? <Nulo>sin importe</Nulo> : plata(f.pendiente)}</Td>
              <Td><EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto></Td>
              <Td>{fuenteDe(f)}</Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}

export function TablaPeriodos({ filas }: { filas: PosicionImpuesto[] }) {
  if (!filas.length) return <Vacio>El sincronizador todavía no escribió ninguna obligación.</Vacio>
  return (
    <Tabla testid="impuestos-periodos" minWidth={880}>
      <THead>
        <Th>Período</Th><Th>Impuesto</Th><Th num>Determinado</Th><Th num>Créditos</Th><Th num>A pagar</Th>
        <Th num>Pagado</Th><Th num>A favor</Th><Th>Estado</Th><Th>Fuente</Th>
      </THead>
      <tbody>
        {filas.map((f) => {
          const e = estadoDe(f)
          return (
            <Tr key={`${f.impuesto}-${f.periodo}-${f.concepto}`} compacta data-impuesto={f.impuesto} data-periodo={f.periodo}>
              <Td><Num>{rotuloPeriodo(f.periodo)}</Num></Td>
              <Td fuerte>{NOMBRE_IMPUESTO[f.impuesto]}{f.concepto === 'ddjj' ? '' : <span className="text-faint"> · {f.concepto}</span>}</Td>
              <Td num>{importe(f.determinado)}</Td>
              <Td num>{importe(f.creditos, '—')}</Td>
              <Td num>{importe(f.a_pagar)}</Td>
              <Td num>{f.pagado ? plata(f.pagado) : <Nulo>—</Nulo>}</Td>
              <Td num>{importe(f.saldo_a_favor, '—')}</Td>
              <Td><EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto></Td>
              <Td>{fuenteDe(f)}</Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}

export function TablaSinImputar({ pagos }: { pagos: PagoSinImputar[] }) {
  return (
    <Tabla testid="impuestos-sin-imputar" minWidth={520}>
      <THead>
        <Th>Fecha</Th><Th num>Importe</Th><Th>Movimiento</Th><Th>Fuente</Th>
      </THead>
      <tbody>
        {pagos.map((p, i) => (
          <Tr key={`${p.fecha}-${i}`} compacta>
            <Td><Num>{ddmm(p.fecha)}</Num></Td>
            <Td num>{plata(p.importe)}</Td>
            <Td><span className="block max-w-[420px] truncate">{p.descripcion ?? '—'}</span></Td>
            <Td><span className="text-[12px] text-faint">{p.fuente}</span></Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
