'use client'

// EL CASILLERO SE EDITA DONDE SE LEE (dueño, 10/09/2026).
//
// Textual: *«no me sirve no poder editar las horas desde ahí mismo, en el casillero de las horas»*.
// La grilla ya dejaba TIPEAR un número en los días trabajados, pero el estado del día —licencia,
// ausencia con motivo, o nada— sólo se cambiaba en el panel lateral, y las celdas de licencia y de
// futuro no aceptaban ni el número. Esto es la corrección completa en el lugar donde está el ojo:
// dos campos, anclados a la celda que se tocó.
//
// ═══ POR QUÉ DOS CAMPOS Y NO UNO ═══
//
// «8,5» y «licencia por enfermedad» no son el mismo tipo de dato y no se pueden pedir en el mismo
// control: un campo que acepte las dos cosas obliga a adivinar qué quiso decir quien escribió «e».
// Las horas se escriben; el estado se elige de una lista cerrada, que es lo que permite agrupar el
// ausentismo por causa.
//
// ═══ POR QUÉ EL CAMPO DE HORAS ES DE TEXTO Y NO `numero` ═══
//
// El teclado del teléfono en es-AR escribe COMA, y un `<input type="number">` con «8,5» adentro
// devuelve cadena vacía sin decir nada: la corrección se pierde en silencio. `leerHoras` acepta la
// coma desde siempre; lo que hace falta es no dejar que el navegador la tire antes. El formato de
// lectura lo pone `mostrar` (`hs`), así que la celda se lee «8,5» y se vuelve a tipear igual.
//
// ═══ LO QUE ESTE EDITOR NO HACE ═══
//
// No mueve el día de obra, no asigna a la persona a la obra destino y no asienta un tramo de varios
// días: eso sigue siendo del panel, que muestra el desglose antes de tocar nada. Un día repartido
// entre dos obras no llega hasta acá (ver `GrillaAsistenciaObra`): elegir a cuál de las dos se le
// imputa no es una edición en línea.

import { useState } from 'react'
import { InlineEdit, type ResultadoInline } from '@/shared/components/ds'
import { hs } from '../../services/jornadaPorObra'
import {
  estadoElegidoDeCelda, opcionesDeEstadoDeCelda, planDeCelda, TRABAJO,
  type CorreccionDeCelda,
} from '../../services/edicionDeCelda'

export function EditorCeldaAsistencia({
  celda, persona, fecha, hoy, obraOrigen, obraDestino, rotuloDia, guardar, cerrar, abrirPanel,
}: {
  celda: { estado: string; horas: number | null; motivo: string | null }
  persona: string
  fecha: string
  hoy: string
  obraOrigen: string | null
  obraDestino: string | null
  /** `jue 10/09`. El editor tapa la celda que se tocó: sin el día escrito no se sabe cuál se está
   *  corrigiendo, y ya se corrigió el día equivocado por eso. */
  rotuloDia: string
  guardar: (c: CorreccionDeCelda) => Promise<ResultadoInline>
  cerrar: () => void
  abrirPanel: () => void
}) {
  const [estado, setEstado] = useState(estadoElegidoDeCelda(celda))

  // EL PLAN SE ARMA EN LA REGLA, NO ACÁ. Los dos campos escriben la misma corrección; lo único que
  // cambia entre ellos es cuál de los dos valores acaba de moverse.
  const enviar = async (p: { estado: string; horas: string }): Promise<ResultadoInline> => {
    const plan = planDeCelda({ ...p, fecha, hoy, obraOrigen, obraDestino })
    if (!plan.ok) return { ok: false, error: plan.error }
    const r = await guardar(plan.correccion)
    // SE CIERRA SÓLO SI GUARDÓ. Cerrar sobre un error deja la pantalla como si hubiera andado, y el
    // mensaje que explica por qué no se guardó se va con el editor.
    if (r.ok) cerrar()
    return r
  }

  return (
    <div
      data-testid="editor-celda"
      // ESCAPE CIERRA DESDE CUALQUIERA DE LOS DOS CAMPOS. Dentro del campo lo atiende `InlineEdit`
      // —devuelve el valor original— y acá se cierra el editor: sin esto, la única salida de una
      // edición abierta por error es guardar algo.
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar() } }}
      className="absolute z-20 w-[228px] rounded-control border border-line-strong bg-canvas p-2 text-left shadow-lg"
      style={{ top: 30, left: '50%', transform: 'translateX(-50%)' }}
    >
      <p className="mb-1 truncate text-[11px] text-muted" title={`${persona} · ${rotuloDia}`}>
        {persona} · {rotuloDia}
      </p>

      <div className="flex items-center gap-1">
        <span className="w-[38px] shrink-0 text-[11.5px] text-muted">Horas</span>
        <InlineEdit
          valor={celda.horas}
          tipo="texto"
          falta="sin cargar"
          mostrar={(v) => hs(Number(v))}
          etiqueta={`Horas de ${persona} el ${fecha}`}
          testid="editor-celda-horas"
          alineado="right"
          ancho="w-[72px]"
          // ESCRIBIR UN NÚMERO DICE QUE TRABAJÓ, aunque el desplegable siga mostrando la licencia
          // que había: es el gesto que el dueño pidió —«editar las horas desde ahí mismo»— y
          // guardarlo como licencia con horas dejaría el número sin obra a la que imputarlo.
          guardar={(v) => enviar({ estado: TRABAJO, horas: v })}
        />
      </div>

      <div className="mt-1 flex items-center gap-1">
        <span className="w-[38px] shrink-0 text-[11.5px] text-muted">Día</span>
        <InlineEdit
          valor={estado}
          tipo="seleccion"
          opciones={[{ valor: '', etiqueta: 'Elegí qué fue ese día' }, ...opcionesDeEstadoDeCelda()]}
          etiqueta={`Estado del ${fecha} de ${persona}`}
          testid="editor-celda-estado"
          ancho="w-[168px]"
          guardar={(v) => { setEstado(v); return enviar({ estado: v, horas: String(celda.horas ?? '') }) }}
        />
      </div>

      <p className="mt-1.5 border-t border-line pt-1.5 text-[11px]">
        {/* LA SALIDA AL PANEL SIGUE EXISTIENDO y se nombra por lo que hace: mover el día de obra,
            asentar un tramo de varios días o asignar a la persona no son ediciones de una celda. */}
        <button type="button" data-testid="editor-celda-panel" onClick={abrirPanel}
          className="text-muted underline hover:text-ink">
          otra obra, tramo o asignación
        </button>
        <button type="button" data-testid="editor-celda-cerrar" onClick={cerrar}
          className="float-right text-muted hover:text-ink">
          cerrar
        </button>
      </p>
    </div>
  )
}
