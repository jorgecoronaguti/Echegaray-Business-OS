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
// No asigna a la persona a la obra destino y no asienta un tramo de varios días: eso sigue siendo del
// panel, que muestra el desglose antes de tocar nada. Un día repartido entre dos obras no llega hasta
// acá (ver `GrillaAsistenciaObra`): elegir a cuál de las dos se le imputa no es una edición en línea.
//
// ═══ LA OBRA DEL DÍA SE ELIGE ACÁ (dueño, 15/09/2026) ═══
//
// *«no existe la posibilidad de marcarle hs en una obra determinada de días anteriores»*. El editor
// imputaba siempre a la obra de hoy de la fila, y sin obra de hoy pedía «elegí la obra» sin ofrecer
// ninguna. La lista es la del DÍA (`obraDeLaCelda`): las activas y las cerradas que estaban en marcha.

import { useState, useTransition } from 'react'
import { InlineEdit, type OpcionInline, type ResultadoInline } from '@/shared/components/ds'
import { hs } from '../../services/jornadaPorObra'
import { marcarTardanza } from '../../services/presenciaDelDiaActions'
import {
  estadoElegidoDeCelda, opcionesDeEstadoDeCelda, planDeCelda, TRABAJO,
  type CorreccionDeCelda,
} from '../../services/edicionDeCelda'

export function EditorCeldaAsistencia({
  celda, persona, personaId, fecha, hoy, obraOrigen, obraDestino, obras, rotuloDia, guardar, cerrar, abrirPanel, alMarcarTardanza,
}: {
  celda: { estado: string; horas: number | null; motivo: string | null; tardanza?: { llegoTarde: boolean; salioAntes: boolean } | null }
  persona: string
  /** Para marcar la tardanza (`marcarTardanza`). Sin él, el editor no la ofrece. */
  personaId?: string
  /** Después de marcar: la grilla se vuelve a leer (`router.refresh()`), igual que tras una corrección. */
  alMarcarTardanza?: () => void
  fecha: string
  hoy: string
  obraOrigen: string | null
  /** La obra que viene elegida (`obraDeLaCelda().inicial`). `null` = hay que elegirla. */
  obraDestino: string | null
  /** Las obras que admiten horas ESE día (`obraDeLaCelda().opciones`). */
  obras: OpcionInline[]
  /** `jue 10/09`. El editor tapa la celda que se tocó: sin el día escrito no se sabe cuál se está
   *  corrigiendo, y ya se corrigió el día equivocado por eso. */
  rotuloDia: string
  guardar: (c: CorreccionDeCelda) => Promise<ResultadoInline>
  cerrar: () => void
  abrirPanel: () => void
}) {
  const [estado, setEstado] = useState(estadoElegidoDeCelda(celda))
  const [obra, setObra] = useState(obraDestino ?? '')
  const [errorObra, setErrorObra] = useState<string | null>(null)
  const [tardanza, setTardanza] = useState(celda.tardanza ?? { llegoTarde: false, salioAntes: false })
  const [avisoTardanza, setAvisoTardanza] = useState<string | null>(null)
  const [marcando, arrancarMarca] = useTransition()

  // LA TARDANZA ESCRIBE `asistencia_dia`, NO `registros_hh` (15/09/2026): es la marca del jefe sobre la
  // presencia, y una sola pierde el presentismo de la quincena. Va por su propia acción, con la guarda
  // de quincena cerrada adentro; se acusa lo que la base devolvió.
  const marcar = (cual: 'llegoTarde' | 'salioAntes') => {
    if (!personaId) return
    const siguiente = { ...tardanza, [cual]: !tardanza[cual] }
    setAvisoTardanza(null)
    arrancarMarca(async () => {
      const r = await marcarTardanza({
        persona_id: personaId, fecha, llego_tarde: siguiente.llegoTarde, salio_antes: siguiente.salioAntes,
      })
      if (!r.ok) { setAvisoTardanza(r.error); return }
      setTardanza(siguiente)
      setAvisoTardanza(r.mensaje)
      alMarcarTardanza?.()
    })
  }

  // EL PLAN SE ARMA EN LA REGLA, NO ACÁ. Los campos escriben la misma corrección; lo único que
  // cambia entre ellos es cuál de los valores acaba de moverse. `destino` viaja explícito porque el
  // selector de obra lo cambia en el mismo gesto en que guarda, antes de que el estado se actualice.
  const enviar = async (p: { estado: string; horas: string }, destino = obra): Promise<ResultadoInline> => {
    const plan = planDeCelda({ ...p, fecha, hoy, obraOrigen, obraDestino: destino || null })
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
      // TIEMPO REAL: con el editor abierto la grilla no se refresca debajo, aunque el foco esté en un
      // botón del editor y no en un campo (ver `SELECTOR_EN_EDICION`). Se atiende al cerrarlo.
      data-en-edicion="1"
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

      {/* SIN OBRA EN UN DÍA QUE NO PASÓ: las horas a futuro no se cargan (`planDeCelda`), así que el
          selector sólo ofrecería una decisión que después se rechaza. */}
      {fecha <= hoy && (
        <div className="mb-1 flex items-center gap-1">
          <span className="w-[38px] shrink-0 text-[11.5px] text-muted">Obra</span>
          <select
            data-testid="editor-celda-obra"
            aria-label={`Obra del ${fecha} de ${persona}`}
            value={obra}
            onChange={(e) => {
              const v = e.target.value
              setObra(v)
              setErrorObra(null)
              // CON HORAS YA CARGADAS, CAMBIAR LA OBRA ES MOVER ESE DÍA: se guarda en el gesto, con
              // las mismas horas. Sin horas, sólo queda elegida para el número que se escriba.
              if (v && celda.estado === 'horas' && celda.horas !== null && v !== obraOrigen) {
                void enviar({ estado: TRABAJO, horas: String(celda.horas) }, v)
                  .then((r) => { if (!r.ok) setErrorObra(r.error) })
              }
            }}
            className="w-[168px] rounded-control border border-line bg-canvas px-1 py-0.5 text-[12px]"
          >
            <option value="">Elegí la obra</option>
            {obras.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
        </div>
      )}
      {errorObra && <p data-testid="editor-celda-obra-error" className="mb-1 text-[11px] text-neg">{errorObra}</p>}

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
          guardar={(v) => {
            setEstado(v)
            // ELEGIR «TRABAJÓ» NO ES VACIAR: con el campo de horas en blanco, lo que falta es el número.
            if (v === TRABAJO && celda.horas === null) return Promise.resolve({ ok: false, error: 'Poné cuántas horas hizo' })
            return enviar({ estado: v, horas: String(celda.horas ?? '') })
          }}
        />
      </div>

      {/* LA TARDANZA, SÓLO SOBRE UN DÍA TRABAJADO QUE YA PASÓ. Sobre una ausencia o una licencia no se
          marca (CHECK de la base), y a futuro no hay nada que haya pasado. */}
      {personaId && celda.estado === 'horas' && fecha <= hoy && (
        <div className="mt-1 flex items-center gap-1" role="group" aria-label={`Tardanza del ${fecha} de ${persona}`}>
          <span className="w-[38px] shrink-0 text-[11.5px] text-muted">Marca</span>
          <BotonTardanza rotulo="Llegó tarde" activo={tardanza.llegoTarde} testid="editor-celda-llego-tarde"
            disabled={marcando} onClick={() => marcar('llegoTarde')} />
          <BotonTardanza rotulo="Salió antes" activo={tardanza.salioAntes} testid="editor-celda-salio-antes"
            disabled={marcando} onClick={() => marcar('salioAntes')} />
        </div>
      )}
      {avisoTardanza && (
        <p data-testid="editor-celda-tardanza-aviso" className="mb-1 mt-1 text-[11px] text-warn">{avisoTardanza}</p>
      )}

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

/** Ámbar cuando está marcada: no es una falta (vino), pero es plata que se pierde. */
function BotonTardanza({ rotulo, activo, testid, disabled, onClick }: {
  rotulo: string; activo: boolean; testid: string; disabled: boolean; onClick: () => void
}) {
  return (
    <button
      type="button" aria-pressed={activo} data-testid={testid} disabled={disabled} onClick={onClick}
      className={`h-8 rounded-control border px-2 text-[11.5px] ${
        activo ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-canvas text-muted hover:text-ink'
      }`}
    >
      {rotulo}
    </button>
  )
}
