'use client'

// UNA PERSONA, UN DÍA — la fila de la carga única de asistencia.
//
// ═══ LA FILA NO GUARDA SU PROPIA COPIA DE LA MARCA ═══
//
// La casilla vive en `CargaDeAsistencia`, fusionada con el servidor (`fusionarConElServidor`): así
// «Marcar a todos» del grupo y lo que otro usuario marcó desde el teléfono se ven en esta misma fila
// sin volver a montarla. La fila sólo decide qué se dibuja y avisa el toque hacia arriba.
//
// ═══ SIN OBRA NO HAY BOTONES DE MARCA ═══
//
// `guardarPresencia` exige obra y la jornada por defecto se imputa a esa obra: marcar «Está» sobre
// alguien sin obra obligaría a adivinarla. Primero se asigna (hoy o futuro) o, en un día pasado, se
// elige en qué obra trabajó — y recién ahí aparecen los botones.

import { useState } from 'react'
import type { CasillaPresencia, EstadoPresencia, ToqueDePresencia } from '@/features/administracion/services/presenciaDelDia'
import { tienePresentismo, type FilaDeCarga as Fila } from '@/features/administracion/services/cargaDeAsistencia'
import { motivosDeDiaNoTrabajado } from '@/features/administracion/services/motivoDeAusencia'
import { jornadaPorDefecto } from '@/features/administracion/services/jornadaPorDefecto'
import {
  ALTO, BotonMarca, HorasDeObra, LineaDeGuardado, MoverDeObra,
  type EstadoDeGuardado, type ObraElegible,
} from './ControlesDeFila'

const MOTIVOS = motivosDeDiaNoTrabajado()

export function FilaDeCarga({ fila, casilla, estado, fecha, hoy, rotuloDia, obras, nombres, soloLectura, puedeMover, onToque }: {
  fila: Fila
  casilla: CasillaPresencia
  estado: EstadoDeGuardado
  fecha: string
  hoy: string
  rotuloDia: string
  /** Obras activas: las que se ofrecen para mover, asignar o repartir horas. */
  obras: ObraElegible[]
  nombres: Readonly<Record<string, string>>
  /** El motivo por el que la fila no se puede tocar (quincena cerrada, permiso del día), o `null`. */
  soloLectura: string | null
  puedeMover: boolean
  onToque: (personaId: string, obraId: string, toque: ToqueDePresencia) => void
}) {
  const { persona } = fila
  // EN UN DÍA PASADO, QUIEN NO TIENE OBRA SE MARCA EN LA QUE SE ELIJA. No es una asignación: es la obra
  // de la marca de ese día, la misma columna que ya escribe `guardarPresencia`.
  const [obraElegida, setObraElegida] = useState('')
  const obraId = fila.obraId ?? (obraElegida || null)
  const noVino = casilla.estado === 'ausente' || casilla.estado === 'licencia'
  const toque = (t: ToqueDePresencia) => { if (obraId) onToque(persona.id, obraId, t) }
  const tocarEstado = (boton: EstadoPresencia) => toque({ tipo: 'estado', boton })

  return (
    <li
      className="flex flex-col gap-2 border-b border-line py-3 md:flex-row md:items-start md:gap-4"
      data-testid="fila-carga" data-persona={persona.id} data-estado={casilla.estado ?? 'sin_marcar'}
    >
      <div className="min-w-0 md:w-56 md:shrink-0">
        <p className="truncate text-[15px] text-ink md:text-[14px]">{persona.nombre}</p>
        <p className="truncate text-[12px] text-muted">
          {[persona.categoria, persona.esJefe ? 'mensual · sin presentismo' : null].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {soloLectura ? (
          <p className="text-[12.5px] text-muted" data-testid="fila-solo-lectura">
            {etiquetaEstado(casilla)} · {soloLectura}
          </p>
        ) : !obraId ? (
          <SinObra fila={fila} fecha={fecha} hoy={hoy} obras={obras} puedeMover={puedeMover} rotuloDia={rotuloDia} onElegir={setObraElegida} />
        ) : (
          <>
            <div className="flex gap-2" role="group" aria-label={`Presencia de ${persona.nombre}`}>
              <BotonMarca testid="esta" rotulo="Está" activo={casilla.estado === 'presente'} tono="pos" onClick={() => tocarEstado('presente')} aria={`${persona.nombre} está`} />
              <BotonMarca testid="no-vino" rotulo="No vino" activo={casilla.estado === 'ausente'} tono="neg" onClick={() => tocarEstado('ausente')} aria={`${persona.nombre} no vino`} />
              <BotonMarca testid="licencia" rotulo="Licencia" activo={casilla.estado === 'licencia'} tono="neutro" onClick={() => tocarEstado('licencia')} aria={`${persona.nombre} está de licencia`} />
            </div>
            {/* LA TARDANZA, VISIBLE SOBRE «SIN MARCAR» Y «ESTÁ»: tocarla declara presente (17/09/2026).
                Quien cobra por mes no la ve: no tiene presentismo que perder (decisión 2). */}
            {!noVino && tienePresentismo(persona) && (
              <div className="flex gap-2" role="group" aria-label={`Tardanza de ${persona.nombre}`}>
                <BotonMarca testid="llego-tarde" rotulo="Llegó tarde" activo={casilla.llego_tarde === true} tono="warn" onClick={() => toque({ tipo: 'tardanza', marca: 'llego_tarde' })} aria={`${persona.nombre} llegó tarde`} />
                <BotonMarca testid="salio-antes" rotulo="Salió antes" activo={casilla.salio_antes === true} tono="warn" onClick={() => toque({ tipo: 'tardanza', marca: 'salio_antes' })} aria={`${persona.nombre} salió antes`} />
              </div>
            )}
            {noVino && (
              <select
                aria-label={`Por qué no vino ${persona.nombre}`} data-testid="motivo" value={casilla.motivo ?? ''}
                onChange={(e) => toque({ tipo: 'motivo', boton: casilla.estado as 'ausente' | 'licencia', motivo: e.target.value || null })}
                className={`${ALTO} w-full rounded-control border border-line bg-surface px-2 text-[13px] text-ink md:w-72`}
              >
                <option value="">¿Por qué? (se puede cargar después)</option>
                {MOTIVOS.map((m) => <option key={m.clave} value={m.clave}>{m.etiqueta}{m.tipo === 'licencia' ? ' · licencia' : ''}</option>)}
              </select>
            )}
            <LineaDeGuardado estado={estado} testid="estado-guardado" />
          </>
        )}
      </div>

      {casilla.estado === 'presente' && obraId && (
        <Horas fila={fila} obraId={obraId} fecha={fecha} obras={obras} nombres={nombres} deshabilitado={soloLectura !== null} />
      )}

      {puedeMover && fila.obraId && !soloLectura && (
        <div className="md:w-56 md:shrink-0">
          <MoverDeObra persona={persona} obraActual={fila.obraId} fecha={fecha} hoy={hoy} obras={obras} rotuloDia={rotuloDia} />
        </div>
      )}
    </li>
  )
}

const etiquetaEstado = (c: CasillaPresencia): string =>
  c.estado === 'presente' ? 'Presente' : c.estado === 'ausente' ? 'No vino' : c.estado === 'licencia' ? 'Licencia' : 'Sin marcar'

/** Las horas del día en su obra y en las otras obras donde ya tiene horas, más la opción de repartir
 *  el día en una segunda obra (decisión 4: «5 + 4»). */
function Horas({ fila, obraId, fecha, obras, nombres, deshabilitado }: {
  fila: Fila; obraId: string; fecha: string; obras: ObraElegible[]
  nombres: Readonly<Record<string, string>>; deshabilitado: boolean
}) {
  const [otra, setOtra] = useState('')
  const [repartir, setRepartir] = useState(false)
  const usadas = new Set([obraId, ...fila.otrasObras.map((o) => o.obraId)])
  const comun = { personaId: fila.persona.id, nombre: fila.persona.nombre, fecha, deshabilitado }
  return (
    <div className="flex flex-wrap items-end gap-3 md:shrink-0" data-testid="horas-del-dia">
      <HorasDeObra {...comun} obraId={obraId} obraNombre={nombres[obraId] ?? obraId} horas={fila.horas} sugerencia={jornadaPorDefecto(fecha)} />
      {fila.otrasObras.map((o) => (
        <HorasDeObra key={o.obraId} {...comun} obraId={o.obraId} obraNombre={nombres[o.obraId] ?? o.obraId} horas={o.horas} sugerencia={null} />
      ))}
      {otra && <HorasDeObra {...comun} obraId={otra} obraNombre={nombres[otra] ?? otra} horas={null} sugerencia={null} />}
      {!deshabilitado && !otra && (repartir ? (
        <select
          value="" onChange={(e) => setOtra(e.target.value)} data-testid="repartir-obra" aria-label={`Otra obra de ${fila.persona.nombre} ese día`}
          className={`${ALTO} rounded-control border border-line bg-surface px-2 text-[13px] text-ink`}
        >
          <option value="">¿Qué otra obra?</option>
          {obras.filter((o) => !usadas.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      ) : (
        <button type="button" onClick={() => setRepartir(true)} data-testid="abrir-repartir" className={`${ALTO} px-1 text-[12px] text-muted underline hover:text-ink`}>
          + otra obra
        </button>
      ))}
    </div>
  )
}

function SinObra({ fila, fecha, hoy, obras, puedeMover, rotuloDia, onElegir }: {
  fila: Fila; fecha: string; hoy: string; obras: ObraElegible[]; puedeMover: boolean; rotuloDia: string
  onElegir: (obraId: string) => void
}) {
  const pasado = fecha < hoy
  return (
    <div className="flex flex-col gap-2" data-testid="fila-sin-obra">
      <p className="text-[12.5px] text-warn">
        {fila.porque === 'varias-asignaciones' ? 'Tiene dos obras asignadas ese día: no elijo por vos.' : 'Sin obra ese día.'}
      </p>
      {pasado ? (
        <select
          value="" onChange={(e) => onElegir(e.target.value)} data-testid="marcar-en-obra" aria-label={`Obra donde trabajó ${fila.persona.nombre}`}
          className={`${ALTO} w-full rounded-control border border-line bg-surface px-2 text-[13px] text-ink md:w-72`}
        >
          <option value="">¿En qué obra trabajó ese día?</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      ) : puedeMover ? (
        <MoverDeObra persona={fila.persona} obraActual={null} fecha={fecha} hoy={hoy} obras={obras} rotuloDia={rotuloDia} />
      ) : (
        <p className="text-[12px] text-muted">La asigna Administración o el jefe de obra.</p>
      )}
    </div>
  )
}
