// ACTIVIDAD — qué pasó con este cliente, en orden, y de dónde salió cada cosa.
//
// ═══ TODO LO QUE SE VE ACÁ OCURRIÓ, Y TIENE SU FECHA GUARDADA ═══
//
// No hay una tabla de eventos: la lista se DERIVA de los registros que ya existen (la ficha, los
// contactos, las obras, los documentos, los certificados). Un registro sin fecha no se muestra —ni
// al principio, ni al final, ni «sin fecha»—, se cuenta y se declara abajo. Una línea de tiempo que
// omite en silencio miente por omisión.
//
// ═══ ES UN TIMELINE, NO UNA TABLA (Design Handoff V2) ═══
//
// Tenía tres columnas con encabezado —Fecha, Qué pasó, Origen— y un encabezado de tabla sobre una
// historia es ruido: nadie necesita que le recuerden que la columna de fechas tiene fechas. El
// componente del sistema (`COMPONENTS.md` §Timeline) da la fila que corresponde: fecha mono ·
// origen en versalitas `faint` · el hecho · el importe a la derecha.
//
// ═══ LA ÚNICA EXCEPCIÓN: LA NOTA MANUAL ═══
//
// «Llamé al arquitecto y la certificación de agosto entra recién en septiembre» no está guardado en
// ninguna fila y no se deduce de ninguna columna: o se escribe, o se pierde. Es lo único que este
// bloque ESCRIBE, y va DEBAJO de la línea de tiempo —como en el handoff— porque se escribe después
// de leer lo que ya pasó, no antes.
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
import { Aviso, Timeline, type Evento } from '@/shared/components/ds'
import { Campo, CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { fecha, plata } from '@/features/obras/components/formato'
import type { EventoCliente, LineaDeTiempo } from '../types'

/** Cuántos hechos entran sin empujar el resto del record fuera de la pantalla. */
const TOPE = 12

/** La fecha del timeline es corta —`19/08`— porque la columna mide 52px y el año casi nunca
 *  desambigua: lo que se lee es el orden, y el año completo está en el registro de origen. */
// LA FECHA DEL TIMELINE LLEVA EL AÑO, Y NO ES UN DETALLE.
//
// Se recortaba a `dd/mm` para ganar ancho en la columna del `Timeline`. Pero la actividad de un
// cliente abarca años: «20/08» a secas no dice de cuándo es, y en una lista ordenada de más nuevo a
// más viejo el ojo asume que todo es reciente. El año es el dato que separa «lo cobró el mes
// pasado» de «lo cobró en 2024» — y con dos dígitos entra igual.

function aEvento(e: EventoCliente): Evento {
  return {
    id: e.clave,
    fecha: fecha(e.fecha),
    tipo: e.fuente,
    texto: (
      // La nota es lo único que escribió una persona: lleva el amarillo de la marca como marca de
      // agua vertical, que es identidad y no estado. Sin texto encima —#FDC900 da 1,6:1 sobre
      // blanco— y sin fondo de color: distingue el renglón sin gritarlo.
      <span className={e.tipo === 'nota' ? 'block border-l-2 border-marca pl-2' : 'block'}>
        {e.href ? (
          <Link href={e.href} className="hover:underline">{e.titulo}</Link>
        ) : (
          e.titulo
        )}
        {e.detalle && <span className="block text-[11px] text-faint">{e.detalle}</span>}
      </span>
    ),
    // El importe se formatea ACÁ. La función que arma la lista devuelve el número: un '$1.500.000'
    // calculado río arriba ya no se puede sumar ni comparar.
    derecha: e.monto != null ? plata(e.monto) : undefined,
  }
}

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
    <div className="space-y-3" data-testid="tabla-actividad">
      {/* EL AVISO VA ARRIBA DE TODO. Debajo, se lee después de haber escrito la nota y apretado el
          botón — o sea, después de perder el tiempo que el aviso existe para ahorrar. */}
      {notasNoDisponibles && <Aviso tono="warn">{notasNoDisponibles}</Aviso>}

      <Timeline
        testid="timeline-cliente"
        eventos={visibles.map(aEvento)}
        total={eventos.length}
        vacio="Todavía no hay nada con fecha para mostrar de este cliente."
        verTodo={
          <Link href={urlTodo} data-testid="ver-toda-actividad" className="text-muted hover:text-ink hover:underline">
            Ver todo ({eventos.length}) →
          </Link>
        }
      />

      {/* LA VUELTA. `Timeline` sólo dibuja «Ver todo» cuando está recortando —cuando ya se
          desplegó todo, `total` y lo mostrado coinciden y el pie desaparece—, así que el camino de
          regreso lo pone la pantalla. Sin él, desplegar la actividad es un viaje de ida. */}
      {todo && eventos.length > TOPE && (
        <p className="text-[12.5px]">
          <Link href={urlPoco} className="text-muted hover:text-ink hover:underline">← Ver sólo los últimos {TOPE}</Link>
        </p>
      )}

      {puedeEscribir && crearNota && <Nota accion={crearNota} />}
      <Pie sinFecha={sinFecha} puedeVerContractuales={puedeVerContractuales} />
    </div>
  )
}

/** El alta de la nota: un campo y un botón, plegado tras el renglón punteado del handoff. Abierto
 *  permanentemente sería un formulario compitiendo con la historia que se vino a leer. */
function Nota({ accion }: { accion: AccionFormulario }) {
  return (
    <details data-testid="alta-nota">
      <summary className="flex h-control cursor-pointer select-none items-center rounded-control border border-dashed border-line-strong px-3 text-[12.5px] text-faint transition-colors hover:text-ink">
        Agregar nota…
      </summary>
      <div className="pt-3">
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
      {/* LA AUSENCIA SE EXPLICA, no se disimula. Sin este renglón, un jefe de obra vería la historia
          de un cliente sin sus certificaciones ni sus cobranzas y la leería como la historia
          completa — que es peor que no mostrarle nada. */}
      {!puedeVerContractuales && (
        <p>Las certificaciones, facturaciones y cobranzas sólo las ve quien administra la economía; esta historia las omite.</p>
      )}
      <p>
        Se arma con lo que ya está registrado. No hay un registro de quién hizo cada cosa, y de la
        ficha consta la última modificación, no cada una.
      </p>
    </div>
  )
}
