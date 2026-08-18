// ACTIVIDAD — qué pasó con este cliente, en orden, y de dónde salió cada cosa.
//
// ═══ TODO LO QUE SE VE ACÁ OCURRIÓ, Y TIENE SU FECHA GUARDADA ═══
//
// No hay una tabla de eventos: la lista se DERIVA de los registros que ya existen (la ficha, los
// contactos, las obras, los documentos, los certificados). Un registro sin fecha no se muestra —ni
// al principio, ni al final, ni «sin fecha»—, se cuenta y se declara abajo. Una línea de tiempo que
// omite en silencio miente por omisión.
//
// ═══ LA ÚNICA EXCEPCIÓN: LA NOTA MANUAL ═══
//
// «Llamé al arquitecto y la certificación de agosto entra recién en septiembre» no está guardado en
// ninguna fila y no se deduce de ninguna columna: o se escribe, o se pierde. Es lo único que este
// bloque ESCRIBE, y va arriba de la línea de tiempo porque escribir una es un acto de tres segundos
// que se abandona si hay que buscar el formulario.
//
// MIENTRAS LA MIGRACIÓN NO ESTÉ APLICADA, EL BLOQUE LO DICE. `notasNoDisponibles` viene del
// servicio y se muestra: una ficha cuyas notas no se pudieron leer no puede verse igual que una
// ficha que no tiene ninguna, y el formulario nunca contesta «guardado» sobre una fila que no entró.
//
// ═══ POR QUÉ SE RECORTA ═══
//
// La ficha más cargada tiene 214 documentos vinculados. Aun agrupados por día, la línea de tiempo
// completa empuja obras, contactos y documentos tres pantallas hacia abajo, y el record deja de ser
// una pantalla. Se muestran los últimos y el resto está a un clic —en la URL, no en un estado del
// navegador—, con el total dicho al lado: recortar en silencio sería el mismo defecto que omitir.

import Link from 'next/link'
import { Callout, Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { fecha, plata } from '@/features/obras/components/formato'
import type { EventoCliente, LineaDeTiempo } from '../types'

/** Cuántos hechos entran sin empujar el resto del record fuera de la pantalla. */
const TOPE = 12

export function BloqueActividad({
  linea, puedeVerContractuales, puedeEscribir = false, crearNota, todo = false, urlTodo, urlPoco,
}: {
  linea: LineaDeTiempo
  /** `certificados` sólo es legible por administración y dirección. Si el que mira no llega, la
   *  pantalla lo dice: una historia recortada presentada como completa es peor que un aviso. */
  puedeVerContractuales: boolean
  /** Escribir una nota es de Administración, igual que el resto de la escritura del maestro. */
  puedeEscribir?: boolean
  crearNota?: AccionFormulario
  todo?: boolean
  urlTodo: string
  urlPoco: string
}) {
  const { eventos, sinFecha, notasNoDisponibles } = linea
  const visibles = todo ? eventos : eventos.slice(0, TOPE)

  return (
    <div className="space-y-3">
      {/* EL AVISO VA ANTES DEL FORMULARIO. Debajo, se lee después de haber abierto «+ Nota», escrito
          la nota y apretado el botón — o sea, después de perder el tiempo que el aviso existe para
          ahorrar. La capacidad se sigue mostrando: esconderla haría que nadie supiera que existe. */}
      {notasNoDisponibles && <Callout tono="warn">{notasNoDisponibles}</Callout>}
      {puedeEscribir && crearNota && <Nota accion={crearNota} />}

      {eventos.length === 0 ? (
        <Callout tono="neutral">Todavía no hay nada con fecha para mostrar de este cliente.</Callout>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="tabla-actividad" className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="w-24 px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Qué pasó</th>
                <th className="w-32 px-3 py-2.5 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>{visibles.map((e) => <Fila key={e.clave} e={e} />)}</tbody>
          </table>
        </div>
      )}

      {eventos.length > TOPE && (
        <p className="text-[12px] text-faint" data-testid="pie-mas-actividad">
          {todo ? (
            <>Se muestran los {eventos.length} hechos registrados.{' '}
              <Link href={urlPoco} className="text-ink underline underline-offset-2">Ver sólo los últimos</Link>.</>
          ) : (
            <>Se muestran los {TOPE} más recientes de {eventos.length}.{' '}
              <Link href={urlTodo} className="text-ink underline underline-offset-2" data-testid="ver-toda-actividad">Ver todos</Link>.</>
          )}
        </p>
      )}

      <Pie sinFecha={sinFecha} puedeVerContractuales={puedeVerContractuales} />
    </div>
  )
}

function Fila({ e }: { e: EventoCliente }) {
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="px-4 py-2.5 align-top text-[12px] tabular-nums text-muted">{fecha(e.fecha)}</td>
      <td className="px-3 py-2.5">
        {/* La nota es lo único que escribió una persona: lleva el amarillo de la marca como marca de
            agua vertical, que es identidad y no estado. Sin texto encima —#FDC900 da 1,6:1 sobre
            blanco— y sin fondo de color: distingue el renglón sin gritarlo. */}
        <span className={e.tipo === 'nota' ? 'block border-l-2 border-marca pl-2' : 'block'}>
          {e.href ? (
            <Link href={e.href} className="text-[13px] text-ink hover:underline">{e.titulo}</Link>
          ) : (
            <span className="text-[13px] text-ink">{e.titulo}</span>
          )}
          {/* El importe se formatea ACÁ. La función que arma la lista devuelve el número: un
              '$1.500.000' calculado río arriba ya no se puede sumar ni comparar. */}
          {e.monto != null && <span className="ml-2 text-[12px] tabular-nums text-muted">{plata(e.monto)}</span>}
          {e.detalle && <span className="block text-[11px] text-faint">{e.detalle}</span>}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top text-[12px] text-muted">{e.fuente}</td>
    </tr>
  )
}

/** El alta de la nota: un campo y un botón, plegado. Abierto permanentemente sería un formulario
 *  compitiendo con la historia que se vino a leer. */
function Nota({ accion }: { accion: AccionFormulario }) {
  return (
    <details className="rounded-xl border border-line bg-white" data-testid="alta-nota">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-[13px] font-medium text-ink">+ Nota</summary>
      <div className="border-t border-line p-4">
        <FormAccion accion={accion} testid="form-nota" enviar="Guardar nota" limpiarAlOk mensajeOk="Nota guardada.">
          <Campo label="Qué pasó" ayuda="Queda firmada con tu nombre y la fecha de hoy. Lo que no se escribe se pierde.">
            <textarea name="texto" required minLength={2} maxLength={4000} rows={3} className={CTRL}
              placeholder="Llamé al arquitecto: la certificación de agosto entra recién en septiembre." />
          </Campo>
        </FormAccion>
      </div>
    </details>
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
