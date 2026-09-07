'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton, CAMPO, Campo, ErrorCampo } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { hs, leerHoras } from '../services/jornadaPorObra'
import { corregirJornada } from '../services/jornadaPorObraActions'
import type { CeldaObra, FilaSemanaObra } from '../services/semanaPorObra'

// EL ADMINISTRADOR CORRIGE TODO — el día de una persona: su obra, sus horas, si no vino, o sacarlo.
//
// ═══ POR QUÉ UN PANEL Y NO UN CONTROL MÁS EN CADA CELDA ═══
//
// La celda ya edita las horas al vuelo, que es el 95 % de las correcciones. Meterle además un
// selector de obra, un botón de ausencia y uno de borrar serían CUATRO controles por celda y
// treinta por fila: la grilla dejaría de leerse, que es para lo que existe. Lo que se hace poco y
// pesa mucho —mover un día de obra, borrarlo— va a un lugar donde se ve entero antes de tocarlo.
//
// ═══ LA ASIGNACIÓN NO SE CREA SOLA ═══
//
// Si la persona no está asignada a la obra destino, la acción vuelve SIN escribir y con
// `necesitaAsignacion`. Recién entonces aparece la casilla para asignarla, y hay que marcarla. Esa
// asignación es la que después decide a qué obra se le imputa el costo de esa persona: crearla en
// silencio haría que un dedo mal puesto la cambiara de obra sin que nadie lo decidiera.

type Estado = 'presente' | 'ausente' | 'borrar'

export interface ObraElegible {
  id: string
  nombre: string
}

export function PanelCorreccionJornada({ fila, dias, etiquetas, obras, jornada, alCerrar }: {
  fila: FilaSemanaObra
  dias: string[]
  etiquetas: string[]
  obras: ObraElegible[]
  /** La jornada pactada de la obra elegida. Es lo que vale una ausencia. */
  jornada: number
  alCerrar: () => void
}) {
  const primero = fila.celdas.find((c) => c.estado === 'horas' || c.estado === 'ausente') ?? fila.celdas[0]
  const [fecha, setFecha] = useState(primero?.fecha ?? dias[0])
  const celda = fila.celdas.find((c) => c.fecha === fecha) ?? null
  const cargado = celda?.estado === 'horas' || celda?.estado === 'ausente'

  const [obraDestino, setObraDestino] = useState(fila.obra.id)
  const [estado, setEstado] = useState<Estado>(celda?.estado === 'ausente' ? 'ausente' : 'presente')
  const [texto, setTexto] = useState(celda?.horas !== null && celda?.horas !== undefined ? hs(celda.horas) : '')
  const [asignar, setAsignar] = useState(false)
  const [pedirAsignacion, setPedirAsignacion] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, arrancar] = useTransition()

  // AL CAMBIAR DE DÍA, EL FORMULARIO SE RELLENA CON LO DE ESE DÍA. Sin esto, elegir el jueves y
  // guardar escribiría en el jueves las horas que se estaban viendo del lunes.
  const elegirDia = (f: string) => {
    const c = fila.celdas.find((x) => x.fecha === f) ?? null
    setFecha(f)
    setEstado(c?.estado === 'ausente' ? 'ausente' : 'presente')
    setTexto(c?.horas !== null && c?.horas !== undefined ? hs(c.horas) : '')
    setAviso(null)
    setPedirAsignacion(false)
    setAsignar(false)
  }

  const { horas, error } = leerHoras(texto)
  const invalido = estado === 'presente' && (error !== null || horas === null)

  const guardar = () => {
    setAviso(null)
    arrancar(async () => {
      const r = await corregirJornada({
        persona_id: fila.persona.id,
        fecha,
        // ORIGEN: de dónde salen HOY las horas. `null` cuando el día no tiene nada cargado — sin
        // origen no hay movimiento, y un borrado sin origen barrería filas de otras obras.
        obra_origen: cargado ? fila.obra.id : null,
        obra_destino: obraDestino,
        estado,
        horas: estado === 'ausente' ? (jornada > 0 ? jornada : 1) : horas,
        asignar,
      })
      if (r.ok) {
        setAviso({ ok: true, texto: r.mensaje })
        setPedirAsignacion(false)
        return
      }
      setAviso({ ok: false, texto: r.error })
      if (r.necesitaAsignacion) setPedirAsignacion(true)
    })
  }

  return (
    <aside
      data-testid="panel-correccion"
      style={{
        border: `1px solid ${V.linea}`, borderRadius: 8, padding: '14px 16px',
        background: '#FFFFFF', marginTop: 12, maxWidth: 460,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>{fila.persona.nombre}</p>
          <p style={{ fontSize: '11.5px', color: V.tenue }}>
            Corregir un día · hoy figura en {fila.obra.nombre}
          </p>
        </div>
        <button type="button" onClick={alCerrar} data-testid="cerrar-correccion"
          style={{ fontSize: '12px', color: V.apagado }}>
          Cerrar
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        <Campo rotulo="Día">
          <select value={fecha} onChange={(e) => elegirDia(e.target.value)} className={CAMPO} data-testid="correccion-dia">
            {dias.map((d, i) => (
              <option key={d} value={d}>{etiquetas[i]}{marcaDe(fila.celdas.find((c) => c.fecha === d))}</option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Obra" ayuda="Cambiarla mueve el día entero a la obra elegida.">
          <select value={obraDestino} onChange={(e) => { setObraDestino(e.target.value); setPedirAsignacion(false) }}
            className={CAMPO} data-testid="correccion-obra">
            {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </Campo>

        <Campo rotulo="Qué pasó ese día">
          <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)}
            className={CAMPO} data-testid="correccion-estado">
            <option value="presente">Trabajó</option>
            <option value="ausente">No vino</option>
            <option value="borrar" disabled={!cargado}>Sacar lo cargado</option>
          </select>
        </Campo>

        {estado === 'presente' && (
          <Campo rotulo="Horas" ayuda="La unidad es la hora. Se acepta la coma: 8,8.">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal"
              className={CAMPO} data-testid="correccion-horas" />
          </Campo>
        )}
        {estado === 'presente' && error && <ErrorCampo>{error}</ErrorCampo>}
        {estado === 'ausente' && (
          <p style={{ fontSize: '11.5px', color: V.tenue }}>
            {/* SE GUARDA CON HORAS Y NO CON CERO: `registros_hh` exige horas > 0, y
                `tipo_hora = 'ausencia'` es lo que hace que no cuenten como trabajo. */}
            Se registra como ausencia de {jornada > 0 ? `${hs(jornada)} hs` : 'la jornada'}. No suma
            horas trabajadas a la obra.
          </p>
        )}

        {pedirAsignacion && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '12.5px', color: V.tinta }}>
            <input type="checkbox" checked={asignar} onChange={(e) => setAsignar(e.target.checked)}
              data-testid="correccion-asignar" style={{ marginTop: 3 }} />
            <span>Asignarla también a esa obra, desde ese día.</span>
          </label>
        )}

        {aviso && (
          <Aviso tono={aviso.ok ? 'info' : 'neg'} testid="acuse-correccion">{aviso.texto}</Aviso>
        )}

        <div>
          <Boton type="button" variante="primaria" onClick={guardar}
            disabled={pendiente || invalido || (pedirAsignacion && !asignar)}
            data-testid="guardar-correccion">
            {pendiente ? 'Guardando…' : 'Guardar la corrección'}
          </Boton>
        </div>
      </div>
    </aside>
  )
}

/** Lo que ya tiene ese día, al lado del nombre del día. Sin esto hay que cerrar el panel para saber
 *  sobre qué se está por escribir. */
function marcaDe(c: CeldaObra | undefined): string {
  if (!c) return ''
  if (c.estado === 'horas') return ` · ${hs(c.horas ?? 0)} hs`
  if (c.estado === 'ausente') return ' · no vino'
  if (c.estado === 'no_laborable') return ' · feriado'
  if (c.estado === 'otra_obra') return ' · está en otra obra'
  return ' · sin cargar'
}
