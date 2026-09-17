// LAS PIEZAS CHICAS DE LA PANTALLA DE IMPUESTOS. Server Components puros: ningún handler, ningún estado.
//
// Existen para que la misma cosa se diga igual en las siete vistas: una fecha estimada, un importe
// desconocido, el estado y el origen del número. Antes cada tabla tenía su variante («supuesto»,
// «vence supuesto», «sin dato», «sin importe», «—») y el que lee tenía que aprender cuatro dialectos.
import type { ReactNode } from 'react'
import { plata } from '@/shared/utils/format'
import { ddmm, type PosicionImpuesto } from '../../services/impuestos'
import { enDias, FUENTE_LLANA, NOMBRE_LLANO, rotuloSaldo, type Tono } from '../../services/impuestosVista'

export const TONO: Record<Tono, string> = { neg: 'text-neg', warn: 'text-warn', pos: 'text-faint', neutro: 'text-muted' }

/** Una sección: título de 15px y, al lado, lo que suma. Sin caja: la sección se delimita con aire. */
export function Seccion({ titulo, resumen, children, testid, id }: {
  titulo: string; resumen?: ReactNode; children: ReactNode; testid: string; id?: string
}) {
  return (
    <section data-testid={testid} id={id} className="mt-8 scroll-mt-16">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
        {resumen !== undefined && <span className="text-[12px] text-muted">{resumen}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * UNA SECCIÓN PLEGADA: el detalle que se consulta, no el que se decide. `<details>` nativo: se abre con
 * un toque, sin JavaScript, fila de 44 px. Nada de lo que hay adentro se quitó: está a un toque.
 */
export function Plegada({ titulo, resumen, children, testid, abierta = false }: {
  titulo: string; resumen?: ReactNode; children: ReactNode; testid: string; abierta?: boolean
}) {
  return (
    <details data-testid={testid} open={abierta} className="group mt-8">
      <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center gap-x-3 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block w-2 text-faint transition-transform group-open:rotate-90">›</span>
        {titulo}
        {resumen !== undefined && <span className="text-[12px] font-normal text-muted">{resumen}</span>}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}

/** El estado como palabra. `data-testid="estado"` y `data-estado` (el de la base) se conservan. */
export function EstadoTexto({ tono, clave, children }: { tono: Tono; clave?: string; children: ReactNode }) {
  return <span data-testid="estado" data-estado={clave} className={`text-[12px] ${TONO[tono]}`}>{children}</span>
}

/**
 * NULL NO ES CERO. «$0» afirma que no hay nada que pagar; un importe que la base no tiene se escribe
 * como falta, en gris.
 */
export const Importe = ({ n, falta = 'sin importe' }: { n: number | null; falta?: string }) =>
  n === null
    ? <span className="text-[12px] text-faint" data-nulo="">{falta}</span>
    : <span className="font-mono tabular-nums">{plata(n)}</span>

/**
 * «10/10 · en 23 días · fecha estimada». La fecha estimada lo dice con palabras: la DGR y la seguridad
 * social no publican una tabla que el OS pueda verificar, y el dueño tiene que saber que ese día puede
 * no ser el día.
 */
export function Vence({ fecha, confianza, dias }: {
  fecha: string | null; confianza: PosicionImpuesto['vencimiento_confianza']; dias?: number
}) {
  if (!fecha) return <span className="text-[12px] text-faint">sin fecha</span>
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono tabular-nums">{ddmm(fecha)}</span>
      {dias !== undefined && <span className={`ml-1.5 text-[12px] ${dias < 0 ? 'text-neg' : 'text-muted'}`}>{enDias(dias)}</span>}
      {confianza === 'supuesto' && (
        <span className="ml-1.5 text-[12px] text-faint" data-supuesto="" title="Fecha estimada: el organismo no publica una tabla que el OS pueda verificar">
          fecha estimada
        </span>
      )}
    </span>
  )
}

/** «declaración jurada al 31/08»: de dónde sale el número y hasta cuándo llega esa fuente. */
export const Origen = ({ f }: { f: Pick<PosicionImpuesto, 'fuente' | 'datos_al'> }) => (
  <span className="text-[12px] text-faint">
    {FUENTE_LLANA[f.fuente]}{f.datos_al ? ` al ${ddmm(f.datos_al)}` : ''}
  </span>
)

/**
 * UN SALDO A FAVOR, CON SU PESO SEGÚN EL ESTADO. El de declaración jurada va en tinta y con peso; el
 * estimado va apagado y dice «estimado» antes del período: es un cálculo del OS sobre un mes sin
 * declarar y no se puede usar para decidir igual que uno declarado.
 */
export function SaldoAFavor({ s, conNombre = false, grande = false }: {
  s: PosicionImpuesto; conNombre?: boolean; grande?: boolean
}) {
  const r = rotuloSaldo(s)
  return (
    <span data-metrica={`${NOMBRE_LLANO[s.impuesto]} a favor`} data-estimado={r.estimado ? '' : undefined} className="inline-flex flex-wrap items-baseline gap-x-2">
      {conNombre && <span className={r.estimado ? 'text-muted' : 'text-ink'}>{NOMBRE_LLANO[s.impuesto]}</span>}
      <span className={`font-mono tabular-nums ${grande ? 'text-[15px]' : ''} ${r.estimado ? 'text-muted' : 'font-medium text-ink'}`}>{plata(s.saldo_a_favor)}</span>
      <span className="text-[12px] text-faint">{r.texto}</span>
    </span>
  )
}

/** «estimado» al lado de un importe cuyo estado en la base es estimado. */
export const MarcaEstimado = ({ estado }: { estado: PosicionImpuesto['estado'] }) =>
  estado === 'estimado' ? <span className="ml-1.5 text-[12px] text-muted" data-estimado="">estimado</span> : null

/** Vacío de una línea. Dice qué significa, no por qué técnicamente. */
export const Vacio = ({ children, testid }: { children: ReactNode; testid?: string }) => (
  <p data-testid={testid ?? 'vacio'} className="border-t border-line py-4 text-[13px] text-muted">{children}</p>
)
