// LA ACTIVIDAD DEL CLIENTE, EN EL COSTADO (dueño, 12/09/2026 13:10).
//
// «El CRM admin en cada cliente tiene secciones inútiles y repetitivas.» «Actividad» era una SOLAPA:
// para ver qué pasó con un cliente había que dejar de mirar sus trabajos. Es lo contrario de cómo se
// usa — la historia se lee de reojo mientras se mira otra cosa—, así que ahora vive al costado, con
// los últimos hechos y la nota nueva, y la línea entera se abre con «Ver toda la actividad».
//
// ═══ ESTE RESUMEN NO INCLUYE LOS DOCUMENTOS, Y LO DICE ═══
//
// La línea completa se arma con seis fuentes; dos de ellas —los documentos vinculados y los archivos
// de Drive— son 49 KB de los 90 que pesa la ficha de Messina (medido el 12/09/2026), y arrastrarlos
// en la cara que todos abren es exactamente lo que la migración 20260911T1200 acaba de sacar. Así que
// el costado se arma sin ellos y el renglón del pie lo declara: una lista que omite en silencio
// miente por omisión, y ésa es la regla que `BloqueActividad` ya tenía escrita.
//
// EL NÚMERO DE EVENTOS NO SE PUBLICA acá arriba: sería el total de una lista recortada por fuente, o
// sea un total que no cuenta lo mismo que la lista que se abre al lado.

import Link from 'next/link'
import { Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { V } from '@/shared/components/v2/patron'
import { fecha } from '@/features/obras/components/formato'
import type { LineaDeTiempo } from '../types'

/** Cuántos hechos entran en el costado sin empujar la identidad fuera de la pantalla. */
export const TOPE_COSTADO = 8

export function ActividadReciente({ linea, puedeEscribir, crearNota, urlTodo }: {
  linea: LineaDeTiempo
  puedeEscribir: boolean
  crearNota?: AccionFormulario
  urlTodo: string
}) {
  const visibles = linea.eventos.slice(0, TOPE_COSTADO)
  return (
    <div data-testid="actividad-reciente">
      {visibles.length === 0
        ? (
          <p style={{ fontSize: '12px', color: V.tenue, padding: '6px 0' }} data-testid="actividad-reciente-vacia">
            Todavía no hay nada con fecha para mostrar de este cliente.
          </p>
          )
        : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 0' }}>
            {visibles.map((e) => (
              <li key={e.clave} style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: '10.5px', color: V.tenue, flexShrink: 0 }}
                >
                  {fecha(e.fecha)}
                </span>
                {/* LA NOTA LLEVA EL FILO AMARILLO DE LA MARCA, igual que en la línea completa: es lo
                    único que escribió una persona. Es identidad, no estado — por eso no lleva texto
                    encima ni fondo (el amarillo da 1,6:1 sobre blanco). */}
                <span
                  className={`truncate ${e.tipo === 'nota' ? 'border-l-2 border-marca pl-2' : ''}`}
                  style={{ fontSize: '12px', color: V.tintaSuave, minWidth: 0 }}
                  title={e.detalle ? `${e.titulo} — ${e.detalle}` : e.titulo}
                >
                  {e.href ? <Link href={e.href} className="hover:underline">{e.titulo}</Link> : e.titulo}
                </span>
              </li>
            ))}
          </ul>
          )}

      <p style={{ fontSize: '12px', paddingTop: 10 }}>
        <Link href={urlTodo} data-testid="ver-toda-actividad" style={{ color: V.tinta, fontWeight: 500 }}>
          Ver toda la actividad →
        </Link>
      </p>

      {/* LO QUE ESTE RESUMEN NO PUEDE MOSTRAR, DICHO AL LADO DE LA LISTA. */}
      <p style={{ fontSize: '11px', color: V.tenue, paddingTop: 6, lineHeight: 1.45 }} data-testid="actividad-reciente-alcance">
        Los documentos y los archivos de Drive no entran en este resumen: están en la lista completa.
        {linea.sinFecha > 0 && ` ${linea.sinFecha} registro${linea.sinFecha === 1 ? '' : 's'} sin fecha guardada no se puede${linea.sinFecha === 1 ? '' : 'n'} ubicar.`}
      </p>

      {puedeEscribir && crearNota && (
        <details data-testid="alta-nota" style={{ paddingTop: 12 }}>
          <summary className="flex h-control cursor-pointer select-none items-center rounded-control border border-dashed border-line-strong px-3 text-[12.5px] text-faint transition-colors hover:text-ink">
            Agregar nota…
          </summary>
          <div className="pt-3">
            <FormAccion accion={crearNota} testid="form-nota" enviar="Guardar nota" limpiarAlOk mensajeOk="Nota guardada.">
              <Campo label="Qué pasó" ayuda="Queda firmada con tu nombre y la fecha de hoy. Lo que no se escribe se pierde.">
                <textarea name="texto" required minLength={2} maxLength={4000} rows={3} className={CTRL}
                  placeholder="Llamé al arquitecto: la certificación de agosto entra recién en septiembre." />
              </Campo>
            </FormAccion>
          </div>
        </details>
      )}
    </div>
  )
}
