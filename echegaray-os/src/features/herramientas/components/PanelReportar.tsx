'use client'

// REPORTAR UN PROBLEMA desde escritorio — lo mismo que M07: cambia el estado, NUNCA la ubicación.
// «No la encuentro» no da de baja: deja un reporte para que alguien la busque.

import { useRef, useState } from 'react'
import { reportarProblemaAction } from '../services/acciones'
import { subirFotoDeActivo } from '../services/subida-foto'
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
  const [foto, setFoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function enviar() {
    if (!tipo) return
    setEnviando(true)
    setError(null)
    let hechos = 0
    for (const a of activos) {
      // La foto va del navegador al bucket; a la acción llega sólo la ruta (`logica/foto.ts`). Una por
      // reporte: si se reportan varios con la misma foto, cada incidencia lleva su copia.
      let ruta: string | undefined
      if (foto) {
        const s = await subirFotoDeActivo(foto, `incidencias/${a!.id}`)
        if (!s.ok) { setEnviando(false); return setError(hechos ? `Se reportaron ${hechos} de ${activos.length}. ${s.error}` : s.error) }
        ruta = s.ruta
      }
      const r = await reportarProblemaAction({ activo: a!.id, tipo, texto, foto: ruta })
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
        {/* La misma foto que M07 en el teléfono: desde la computadora se elige un archivo. */}
        <button type="button" onClick={() => input.current?.click()} data-testid="foto-reporte"
          style={{ height: 38, border: `1px dashed ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', color: foto ? V.pos : V.tinta }}>
          {foto ? 'Foto lista · cambiar' : 'Agregar foto'}
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        <div style={{ fontSize: '12.5px', color: V.apagado, borderLeft: `2px solid ${V.linea}`, paddingLeft: 12 }}>No se mueve: sigue donde está. El taller decide si la retira.</div>
      </Bloque>
      <ErrorPanel texto={error} />
    </PanelLateral>
  )
}
