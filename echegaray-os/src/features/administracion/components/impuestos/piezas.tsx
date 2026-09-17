// LAS PIEZAS CHICAS DE LA PANTALLA DE IMPUESTOS. Server Components puros: ningún handler, ningún estado.
//
// Existen para que la misma cosa se diga igual en las siete vistas: una fecha estimada, un importe
// desconocido, el estado y el origen del número. Antes cada tabla tenía su variante («supuesto»,
// «vence supuesto», «sin dato», «sin importe», «—») y el que lee tenía que aprender cuatro dialectos.
import type { ReactNode } from 'react'
import { plata } from '@/shared/utils/format'
import { ddmm, type PosicionImpuesto } from '../../services/impuestos'
import { enDias, FUENTE_LLANA, type Tono } from '../../services/impuestosVista'

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

/** Vacío de una línea. Dice qué significa, no por qué técnicamente. */
export const Vacio = ({ children, testid }: { children: ReactNode; testid?: string }) => (
  <p data-testid={testid ?? 'vacio'} className="border-t border-line py-4 text-[13px] text-muted">{children}</p>
)
