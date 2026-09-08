// ANOTACIONES — lo que el empleador observa de una persona y hoy se pierde en un WhatsApp.
//
// El dueño, 08/09/2026: *«quiero que dejes dentro de la ficha de cada persona un lugar para hacer
// anotaciones»*.
//
// ═══ POR QUÉ EL CAMPO VA ARRIBA Y LA LISTA ABAJO ═══
//
// Es lo contrario de la nota del cliente, donde el formulario va DEBAJO de la línea de tiempo. Acá
// el bloque se abre para ESCRIBIR —la lista es contexto, no el destino—, y bajar hasta el final de
// veinte anotaciones para encontrar el campo convierte el gesto de diez segundos en uno de treinta.
// La lista, cronológica descendente: lo último que pasó es lo que importa.
//
// ═══ NO SE EDITA NI SE BORRA, Y NO HAY BOTÓN QUE LO SUGIERA ═══
//
// Decisión del dueño: la anotación queda. Si algo salió mal escrito, se agrega otra. La base
// tampoco tiene policy de update ni delete: si esta pantalla dibujara el botón, el servidor lo
// rechazaría igual — y un botón que siempre falla es peor que ninguno.
//
// ═══ CADA UNA DICE QUIÉN Y CUÁNDO ═══
//
// Sin autor y sin hora, «llegó tarde» es un rumor. La firma la pone la base (`auth.uid()` por
// DEFAULT, exigido por la policy): no viaja en el formulario y no se puede falsificar.
//
// Sin categorías ni etiquetas: texto libre. El dueño pidió *un lugar para anotar*, y un catálogo de
// categorías inventado por el sistema es exactamente lo que hace que nadie anote.

import { Aviso } from '@/shared/components/ds'
import { Campo, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { ZONA_OBRA } from '@/features/jefe/services/zona'
import { TarjetaFicha } from './FichaCanonica'
import { CampoAnotacion } from './CampoAnotacion'
import { autorDeAnotacion, LARGO_MAXIMO } from '../services/anotacionesPersona'
import type { AnotacionDePersona } from '../services/anotacionesService'

const ICONO = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 4h16v12H8l-4 4z" />
  </svg>
)

/** CUÁNDO, con hora. Una anotación del mismo día es lo normal —tres de la misma semana se
 *  distinguen por la hora— y el huso se fija: si dependiera del reloj del servidor, la misma
 *  anotación diría dos horas distintas según dónde corra la función. */
function cuando(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: ZONA_OBRA,
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function AnotacionesDeLaPersona({ anotaciones, puedeEscribir, anotar, pendiente }: {
  anotaciones: AnotacionDePersona[]
  /** Hoy es el mismo alcance que ver, pero son dos preguntas distintas: ver la ficha de alguien y
   *  escribir en ella ya se separaron una vez en este repo. */
  puedeEscribir: boolean
  anotar?: AccionFormulario
  /** El aviso de que la migración no está aplicada. `null` cuando la tabla existe. */
  pendiente: string | null
}) {
  return (
    <TarjetaFicha
      titulo="Anotaciones" icono={ICONO} testid="bloque-anotaciones"
      indicador={anotaciones.length > 0
        ? `${anotaciones.length}`
        : <span className="font-sans text-[11.5px] text-faint">—</span>}
    >
      {/* EL AVISO VA ARRIBA DEL CAMPO. Debajo se leería después de escribir la anotación y apretar
          el botón, o sea después de perder el tiempo que el aviso existe para ahorrar. */}
      {pendiente && (
        <div className="px-3.5 pt-3">
          <Aviso tono="warn">{pendiente}</Aviso>
        </div>
      )}

      {puedeEscribir && anotar && (
        <div className="border-b border-line-hairline px-3.5 py-3">
          <FormAccion
            accion={anotar} testid="form-anotacion" enviar="Anotar" tactil
            limpiarAlOk mensajeOk="Anotado." bloqueado={pendiente != null}
            motivoBloqueo={pendiente != null ? 'No se puede guardar todavía' : undefined}
          >
            <Campo label="Qué observaste" ayuda="Queda con tu nombre y la fecha. No se edita ni se borra: para corregir, anotá otra. Ctrl+Enter guarda.">
              <CampoAnotacion maxLength={LARGO_MAXIMO} deshabilitado={pendiente != null} />
            </Campo>
          </FormAccion>
        </div>
      )}

      {anotaciones.length === 0
        ? (
            <p className="px-3.5 py-3 text-[12px] text-faint" data-testid="anotaciones-vacio">
              {/* Corto, y sin repetir lo que el aviso de arriba ya dijo cuando falta la migración. */}
              {pendiente ? 'No se pueden leer todavía.' : 'Sin anotaciones.'}
            </p>
          )
        : anotaciones.map((a) => (
            <article
              key={a.id} data-testid="fila-anotacion"
              className="border-b border-line-hairline px-3.5 py-2.5 last:border-0"
            >
              <p className="flex items-baseline gap-2 text-[11px] text-faint">
                <time dateTime={a.creado_en} className="shrink-0 font-mono tabular-nums">{cuando(a.creado_en)}</time>
                <span className="min-w-0 truncate">{autorDeAnotacion(a.autor)}</span>
              </p>
              {/* `whitespace-pre-line`: quien escribió tres renglones quiso tres renglones. */}
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-[1.55] text-ink">{a.texto}</p>
            </article>
          ))}
    </TarjetaFicha>
  )
}
