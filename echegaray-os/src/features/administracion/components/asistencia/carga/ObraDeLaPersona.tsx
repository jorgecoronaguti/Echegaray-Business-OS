'use client'

// LA OBRA DE UNA PERSONA, DESDE SU PANEL — dónde está, a dónde va y qué pases ya están programados.
//
// Junta en un solo lugar lo que antes eran tres enlaces en cada fila («Mover de obra», «Planificar días
// siguientes», el panel del plan). Las escrituras son las de siempre: `cambiarObraActual` para mover o
// programar y `cancelarPaseProgramado` para deshacer un pase; la lectura, `leerPlanDeObra`. Qué viaja lo
// decide `entradaDePase`, con la misma validación que la acción.
//
// ═══ LA LISTA DE PASES SE RELEE DESPUÉS DE CADA ESCRITURA ═══
//
// Programar dos pases pisados es el error que después nadie entiende: la lista tiene que mostrar lo que
// la base tiene, no lo que el panel cree que mandó.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiarObraActual, cancelarPaseProgramado, leerPlanDeObra } from '@/features/administracion/services/obraActualActions'
import { papelesDeTramos, type TramoDeAsignacion } from '@/features/administracion/services/planDeObraActual'
import { DESTINO_SIN_OBRA, entradaDePase, type FilaDeCarga } from '@/features/administracion/services/cargaDeAsistencia'
import { LineaDeGuardado, type EstadoDeGuardado } from './ControlesDeFila'
import type { AccionesDeLaCarga, DiaDeLaCarga } from './tipos'

const CTRL = 'h-11 rounded-control border border-line bg-surface px-2 text-[14px] text-ink md:h-9 md:text-[13px]'

/** `2026-09-23` → `mié 23 sep`. Se planifica por día de la semana, no por fecha suelta. */
function diaCorto(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '').replace(',', '')
}

function usePases(personaId: string, hoy: string) {
  const [tramos, setTramos] = useState<TramoDeAsignacion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const releer = useCallback(async () => {
    const r = await leerPlanDeObra(personaId)
    // NO PODER LEER NO ES «SIN PASES»: una lista vacía afirmaría que no hay nada programado.
    if (r.ok) { setTramos(r.tramos); setError(null) } else { setTramos([]); setError(r.error) }
  }, [personaId])
  useEffect(() => {
    let vivo = true
    leerPlanDeObra(personaId).then((r) => {
      if (!vivo) return
      if (r.ok) { setTramos(r.tramos); setError(null) } else { setTramos([]); setError(r.error) }
    })
    return () => { vivo = false }
  }, [personaId])
  const programados = papelesDeTramos(tramos ?? [], hoy).filter((x) => x.papel === 'programado').map((x) => x.tramo)
    .sort((a, b) => (a.desde ?? '').localeCompare(b.desde ?? ''))
  return { programados, leyendo: tramos === null, error, releer }
}

export function ObraDeLaPersona({ fila, dia, acciones }: { fila: FilaDeCarga; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  const obraId = acciones.obraDe(fila)
  const pasado = dia.fecha < dia.hoy
  return (
    <div className="flex flex-col gap-2" data-testid="obra-de-la-persona">
      <p className="text-[13px] text-ink">
        {obraId
          ? <>{dia.fecha === dia.hoy ? 'Hoy en' : `El ${dia.rotuloDia} en`} <span className="font-medium">{dia.nombres[obraId] ?? obraId}</span></>
          : <span className="text-warn">{fila.porque === 'varias-asignaciones' ? 'Tiene dos obras asignadas ese día: no elijo por vos.' : 'Sin obra ese día.'}</span>}
      </p>
      {/* EN UN DÍA PASADO, QUIEN NO TIENE OBRA SE MARCA EN LA QUE SE ELIJA: es la obra de la marca de ese
          día, no una asignación. */}
      {pasado && !fila.obraId && (
        <select value={obraId ?? ''} onChange={(e) => acciones.elegirObra(fila.persona.id, e.target.value)} data-testid="marcar-en-obra" aria-label="Obra donde trabajó ese día" className={CTRL}>
          <option value="">¿En qué obra trabajó ese día?</option>
          {dia.obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      )}
      {dia.puedeMover ? <Mover fila={fila} dia={dia} /> : <p className="text-[12px] text-faint">La mueve Administración o el jefe de obra.</p>}
    </div>
  )
}

function Mover({ fila, dia }: { fila: FilaDeCarga; dia: DiaDeLaCarga }) {
  const router = useRouter()
  const { persona } = fila
  const [destino, setDestino] = useState('')
  const [otroDia, setOtroDia] = useState(dia.fecha > dia.hoy)
  const [desde, setDesde] = useState(dia.fecha > dia.hoy ? dia.fecha : '')
  const [vuelve, setVuelve] = useState(false)
  const [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState<EstadoDeGuardado>(null)
  const [pendiente, arrancar] = useTransition()
  const pases = usePases(persona.id, dia.hoy)
  const envio = entradaDePase({ personaId: persona.id, destino, desde: otroDia ? desde : dia.hoy, hasta: vuelve ? hasta || null : null, hoy: dia.hoy })
  const esHoySinVuelta = !otroDia && !(vuelve && hasta)

  const confirmar = () => {
    if (!envio.ok) { setEstado({ tipo: 'error', texto: envio.error }); return }
    setEstado({ tipo: 'guardando' })
    arrancar(async () => {
      const r = await cambiarObraActual(envio.entrada)
      if (r.ok) { setEstado({ tipo: 'ok', texto: r.mensaje }); setDestino(''); await pases.releer(); router.refresh() }
      else setEstado({ tipo: 'error', texto: r.error })
    })
  }
  const cancelar = (tramoId: string) => arrancar(async () => {
    setEstado({ tipo: 'guardando' })
    const r = await cancelarPaseProgramado({ persona_id: persona.id, tramo_id: tramoId })
    setEstado(r.ok ? { tipo: 'ok', texto: 'Pase cancelado.' } : { tipo: 'error', texto: r.error })
    if (r.ok) { await pases.releer(); router.refresh() }
  })

  return (
    <>
      <select value={destino} onChange={(e) => { setDestino(e.target.value); setEstado(null) }} data-testid="destino-mover" aria-label={`Mover a ${persona.nombre} a`} className={CTRL}>
        <option value="">Mover a otra obra…</option>
        {dia.obras.filter((o) => o.id !== fila.obraId).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        {fila.obraId && <option value={DESTINO_SIN_OBRA}>Sin obra (cierra la asignación)</option>}
      </select>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Desde cuándo">
        {([[false, 'Desde hoy'], [true, 'Desde otro día']] as const).map(([valor, rotulo]) => (
          <button key={rotulo} type="button" aria-pressed={otroDia === valor} onClick={() => setOtroDia(valor)} data-testid={valor ? 'desde-otro-dia' : 'desde-hoy'}
            className={`h-11 rounded-control border text-[14px] md:h-9 md:text-[13px] ${otroDia === valor ? 'border-accent bg-accent text-surface' : 'border-line bg-surface text-ink hover:bg-surface-quiet'}`}>
            {rotulo}
          </button>
        ))}
      </div>
      {otroDia && <input type="date" value={desde} min={dia.hoy} onChange={(e) => setDesde(e.target.value)} aria-label="Primer día en la otra obra" data-testid="pase-desde" className={CTRL} />}
      <label className="flex min-h-11 items-center gap-2 text-[12.5px] text-muted md:min-h-0">
        <input type="checkbox" checked={vuelve} onChange={(e) => setVuelve(e.target.checked)} data-testid="pase-vuelve" />
        Vuelve a su obra después del
        {vuelve && <input type="date" value={hasta} min={otroDia ? desde || dia.hoy : dia.hoy} onChange={(e) => setHasta(e.target.value)} aria-label="Último día en la otra obra" data-testid="pase-hasta" className="h-9 rounded-control border border-line bg-surface px-2 text-[13px] text-ink" />}
      </label>
      <button type="button" onClick={confirmar} disabled={pendiente || !destino} data-testid="confirmar-mover"
        className="h-11 rounded-control border border-accent bg-surface text-[14px] font-medium text-ink hover:bg-surface-quiet disabled:opacity-50 md:h-9 md:text-[13px]">
        {esHoySinVuelta ? 'Mover desde hoy' : 'Programar pase'}
      </button>
      <LineaDeGuardado estado={estado} testid="estado-mover" />
      {pases.error && <p className="text-[12px] text-neg" data-testid="pases-error">No pude leer sus pases: {pases.error}</p>}
      {pases.programados.length > 0 && (
        <ul className="mt-1 border-t border-line-hairline" data-testid="pases-programados">
          {pases.programados.map((t) => (
            <li key={t.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-line-hairline text-[12.5px] md:min-h-10" data-testid="pase-programado">
              <span className="min-w-0 truncate">desde {t.desde ? diaCorto(t.desde) : '—'}{t.hasta ? ` al ${diaCorto(t.hasta)}` : ''} → <span className="font-medium">{t.nombre}</span></span>
              <button type="button" onClick={() => cancelar(t.id)} disabled={pendiente} data-testid="cancelar-pase" className="min-h-11 shrink-0 px-2 text-[12px] text-muted underline hover:text-ink md:min-h-0">Cancelar</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
