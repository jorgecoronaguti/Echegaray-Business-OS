// ACTIVIDAD — qué pasó con este cliente, en orden, y de dónde salió cada cosa.
//
// ═══ TODO LO QUE SE VE ACÁ OCURRIÓ, Y TIENE SU FECHA GUARDADA ═══
//
// No hay una tabla de eventos: la lista se DERIVA de los registros que ya existen (la ficha, los
// contactos, las obras, los documentos, los certificados). Un registro sin fecha no se muestra —ni
// al principio, ni al final, ni «sin fecha»—, se cuenta y se declara abajo. Una línea de tiempo que
// omite en silencio miente por omisión.
//
// ═══ LA COLUMNA «ORIGEN» ═══
//
// Dice de qué parte de la ficha viene el hecho, en el idioma de la empresa: Ficha, Contactos, Obras,
// Documentos, Certificación. Nunca el nombre de una tabla — quien lee esto no tiene por qué saber
// que existe `cliente_documento`. Va en la tabla y no en un tooltip porque cambia qué se está
// mirando, y no lleva color: no es un problema ni un logro.

import Link from 'next/link'
import { Callout } from '@/shared/components/ui'
import { fecha, plata } from '@/features/obras/components/formato'
import type { LineaDeTiempo } from '../types'

export function TabActividad({ linea, puedeVerContractuales }: {
  linea: LineaDeTiempo
  /** `certificados` sólo es legible por administración y dirección. Si el que mira no llega, la
   *  pantalla lo dice: una historia recortada presentada como completa es peor que un aviso. */
  puedeVerContractuales: boolean
}) {
  const { eventos, sinFecha } = linea

  if (eventos.length === 0) {
    return (
      <div className="space-y-3">
        <Callout tono="neutral">
          Todavía no hay nada con fecha para mostrar de este cliente.
        </Callout>
        <Pie sinFecha={sinFecha} puedeVerContractuales={puedeVerContractuales} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table data-testid="tabla-actividad" className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
              <th className="w-24 px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-3 py-2.5 font-medium">Qué pasó</th>
              <th className="w-32 px-3 py-2.5 font-medium">Origen</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.clave} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 align-top text-[12px] tabular-nums text-muted">{fecha(e.fecha)}</td>
                <td className="px-3 py-2.5">
                  {e.href ? (
                    <Link href={e.href} className="text-[13px] text-ink hover:underline">{e.titulo}</Link>
                  ) : (
                    <span className="text-[13px] text-ink">{e.titulo}</span>
                  )}
                  {/* El importe se formatea ACÁ. La función que arma la lista devuelve el número:
                      un '$1.500.000' calculado río arriba ya no se puede sumar ni comparar. */}
                  {e.monto != null && <span className="ml-2 text-[12px] tabular-nums text-muted">{plata(e.monto)}</span>}
                  {e.detalle && <span className="block text-[11px] text-faint">{e.detalle}</span>}
                </td>
                <td className="px-3 py-2.5 align-top text-[12px] text-muted">{e.fuente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pie sinFecha={sinFecha} puedeVerContractuales={puedeVerContractuales} />
    </div>
  )
}

/** Lo que la lista NO puede mostrar, dicho al lado de la lista y no en otra pantalla. */
function Pie({ sinFecha, puedeVerContractuales }: { sinFecha: number; puedeVerContractuales: boolean }) {
  return (
    <div className="space-y-1 text-[11px] leading-relaxed text-faint" data-testid="pie-actividad">
      {sinFecha > 0 && (
        <p>
          {sinFecha} registro{sinFecha === 1 ? '' : 's'} de este cliente no tiene{sinFecha === 1 ? '' : 'n'} fecha
          guardada, así que no se puede{sinFecha === 1 ? '' : 'n'} ubicar en la lista.
        </p>
      )}
      {!puedeVerContractuales && (
        <p>Las certificaciones, facturaciones y cobranzas sólo las ve administración.</p>
      )}
      <p>
        Se arma con lo que ya está registrado. No hay un registro de quién hizo cada cosa, y de la
        ficha consta la última modificación, no cada una.
      </p>
    </div>
  )
}
