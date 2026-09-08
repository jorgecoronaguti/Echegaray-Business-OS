'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, CAMPO, Campo, Drawer, ErrorCampo } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { hs, leerHoras } from '../services/jornadaPorObra'
import { corregirJornada } from '../services/jornadaPorObraActions'
import { motivosDeDiaNoTrabajado } from '../services/motivoDeAusencia'
import type { CeldaObra, FilaQuincenaObra } from '../services/quincenaPorObra'

// EL ADMINISTRADOR CORRIGE TODO — el día de una persona: su obra, sus horas, si no vino, o sacarlo.
//
// ═══ POR QUÉ UN PANEL Y NO UN CONTROL MÁS EN CADA CELDA ═══
//
// La celda ya edita las horas al vuelo, que es el 95 % de las correcciones. Meterle además un
// selector de obra, un botón de ausencia y uno de borrar serían CUATRO controles por celda y
// treinta por fila: la grilla dejaría de leerse, que es para lo que existe. Lo que se hace poco y
// pesa mucho —mover un día de obra, borrarlo— va a un lugar donde se ve entero antes de tocarlo.
//
// ═══ AL COSTADO, Y NO SE CIERRA AL GUARDAR ═══
//
// El dueño: *"la forma de editar tiene q ser q se abra esa pantalla pero al costado"*. Abajo de la
// grilla el panel empujaba la tabla y quedaba fuera de pantalla en cuanto había más de diez filas:
// había que scrollear para corregir y volver a scrollear para ver si el número cambió.
//
// Al guardar se refresca la grilla —`router.refresh()`, que vuelve a correr el server component—
// y el panel QUEDA ABIERTO con el acuse. Corregir es una tarea de varios días seguidos de la misma
// persona: cerrar el panel en el primero obligaría a volver a buscar la fila para el segundo.
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
  fila: FilaQuincenaObra
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
  const [motivo, setMotivo] = useState<string | null>(null)
  const [pendiente, arrancar] = useTransition()
  const motivos = motivosDeDiaNoTrabajado()
  const router = useRouter()

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
        // EL MOTIVO DECIDE SI ES AUSENCIA O LICENCIA. Vacaciones y parte médico son licencia;
        // faltar sin avisar, ausencia. Ninguna suma horas trabajadas.
        motivo: estado === 'ausente' ? motivo : null,
        asignar,
      })
      if (r.ok) {
        setAviso({ ok: true, texto: r.mensaje })
        setPedirAsignacion(false)
        // LA GRILLA SE VUELVE A LEER DE LA BASE. Sin esto el panel dice «guardado» y la celda de
        // atrás sigue mostrando el número viejo: la pantalla afirmaría dos cosas distintas del
        // mismo día. No se pinta un optimista — se relee el destino, que es la única evidencia.
        router.refresh()
        return
      }
      setAviso({ ok: false, texto: r.error })
      if (r.necesitaAsignacion) setPedirAsignacion(true)
    })
  }

  return (
    <Drawer
      testid="panel-correccion"
      titulo={fila.persona.nombre}
      subtitulo={`Corregir un día · hoy figura en ${fila.obra.nombre}`}
      onCerrar={alCerrar}
      pie={
        <Boton type="button" variante="primaria" onClick={guardar}
          disabled={pendiente || invalido || (pedirAsignacion && !asignar)}
          data-testid="guardar-correccion">
          {pendiente ? 'Guardando…' : 'Guardar la corrección'}
        </Boton>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
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
          <Campo rotulo="Por qué no vino" ayuda="Vacaciones, parte médico y ART quedan como licencia.">
            <select value={motivo ?? ''} onChange={(e) => setMotivo(e.target.value || null)}
              className={CAMPO} data-testid="correccion-motivo">
              <option value="">Sin declarar todavía</option>
              {motivos.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.etiqueta}{m.tipo === 'licencia' ? ' · licencia' : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}
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
      </div>
    </Drawer>
  )
}

/** Lo que ya tiene ese día, al lado del nombre del día. Sin esto hay que cerrar el panel para saber
 *  sobre qué se está por escribir. */
function marcaDe(c: CeldaObra | undefined): string {
  if (!c) return ''
  if (c.estado === 'horas') return ` · ${hs(c.horas ?? 0)} hs`
  if (c.estado === 'ausente') return ' · no vino'
  // «no laborable» y no «feriado»: desde que la grilla es por quincena, este estado también lo
  // tienen los sábados y los domingos, que no son feriados de nadie.
  if (c.estado === 'no_laborable') return ' · no laborable'
  if (c.estado === 'otra_obra') return ' · está en otra obra'
  return ' · sin cargar'
}
