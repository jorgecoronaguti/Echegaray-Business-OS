'use client'

// REPORTAR UN PROBLEMA desde escritorio — lo mismo que M07: cambia el estado, NUNCA la ubicación.
// «No la encuentro» no da de baja: deja un reporte para que alguien la busque.

import { useState } from 'react'
import { reportarProblemaAction } from '../services/acciones'
import type { TipoIncidencia } from '../types'
import { useHerramientas } from './Espacio'
import { Bloque, ErrorPanel, PanelLateral } from './PanelLateral'
import { botonPrimarioGrande, botonSecundarioGrande, V } from './estilo'

export const TIPOS: { v: TipoIncidencia; t: string; d: string }[] = [
  { v: 'fallando', t: 'Anda pero está fallando', d: 'queda «requiere mantenimiento»' },
  { v: 'no_anda', t: 'No anda', d: 'queda «fuera de servicio»' },
  { v: 'no_encontrada', t: 'No la encuentro', d: 'avisa al taller, no la da de baja' },
]

export function PanelReportar({ ids, onHecho }: { ids: string[]; onHecho: (t: string) => void }) {
  const { parque, cerrar } = useHerramientas()
  const activos = ids.map((id) => parque.activoPorId.get(id)).filter((a) => a && a.estado !== 'baja')
  const [tipo, setTipo] = useState<TipoIncidencia | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!tipo) return
    setEnviando(true)
    setError(null)
    let hechos = 0
    for (const a of activos) {
      const fd = new FormData()
      fd.set('activo', a!.id)
      fd.set('tipo', tipo)
      fd.set('texto', texto)
      const r = await reportarProblemaAction(fd)
      if (!r.ok) {
        setEnviando(false)
        return setError(hechos ? `Se reportaron ${hechos} de ${activos.length}. ${r.error}` : r.error)
      }
      hechos++
    }
    setEnviando(false)
    onHecho(activos.length === 1 ? `Problema reportado: ${activos[0]!.nombre}. No se movió de lugar.` : `${hechos} problemas reportados. Nada se movió de lugar.`)
  }

  return (
    <PanelLateral
      testid="panel-reportar" titulo="Reportar un problema" onCerrar={cerrar}
      subtitulo={activos.length === 1 ? activos[0]!.nombre : `${activos.length} activos`}
      pie={
        <>
          <button type="button" data-testid="confirmar-reporte" disabled={!tipo || enviando || !activos.length} onClick={enviar} style={{ ...botonPrimarioGrande, opacity: tipo ? 1 : 0.45 }}>
            {enviando ? 'Reportando…' : 'Reportar'}
          </button>
          <button type="button" onClick={cerrar} style={botonSecundarioGrande}>Cancelar</button>
        </>
      }
    >
      <Bloque rotulo="Qué le pasa" primero>
        <div role="radiogroup">
          {TIPOS.map((t, i) => (
            <label key={t.v} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 50, borderBottom: i < TIPOS.length - 1 ? `1px solid ${V.linea}` : undefined, cursor: 'pointer' }}>
              <input type="radio" name="tipo" checked={tipo === t.v} onChange={() => setTipo(t.v)} style={{ width: 16, height: 16, accentColor: V.grafito }} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px' }}>{t.t}</span>
                <span style={{ fontSize: '12.5px', color: V.apagado }}>{t.d}</span>
              </span>
            </label>
          ))}
        </div>
      </Bloque>
      <Bloque rotulo="Contalo en una línea">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={400} rows={3} style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: 10, fontSize: '13.5px' }} />
        <div style={{ fontSize: '12.5px', color: V.apagado, borderLeft: `2px solid ${V.linea}`, paddingLeft: 12 }}>No se mueve: sigue donde está. El taller decide si la retira.</div>
      </Bloque>
      <ErrorPanel texto={error} />
    </PanelLateral>
  )
}
