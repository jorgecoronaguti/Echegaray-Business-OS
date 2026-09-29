'use client'

// «EXPORTAR PARA EL ESTUDIO» — descarga las novedades de una quincena (Excel o PDF) para el contador.
//
// Acción secundaria y discreta: es texto en la barra de filtros, y la elección de quincena aparece recién al
// abrirla (la pantalla no se mueve). Descarga por `fetch` + enlace temporal y no por un `<a href>` a la ruta:
// así el teléfono guarda el archivo sin navegar fuera de la pantalla, y un error (sin permiso, sin datos) se
// dice acá en vez de mostrar una página en blanco. NO envía nada: el archivo queda en el dispositivo y lo manda
// quien lo descargó.

import { useState } from 'react'
import { V } from '@/shared/components/v2/patron'

type Formato = 'xlsx' | 'pdf'

const BOTON = { padding: '6px 12px', borderRadius: 6, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' } as const

export function ExportarParaElEstudio({ quincenas, actual }: {
  quincenas: { desde: string; texto: string }[]
  actual: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [desde, setDesde] = useState(actual)
  const [ocupado, setOcupado] = useState<Formato | null>(null)
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)

  async function bajar(formato: Formato) {
    setOcupado(formato)
    setMensaje(null)
    try {
      const res = await fetch(`/administracion/personas/novedades-estudio?quincena=${encodeURIComponent(desde)}&formato=${formato}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 404 ? 'sin permiso' : `error ${res.status}`)
      const blob = await res.blob()
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `novedades-estudio.${formato}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const fuera = Number(res.headers.get('X-Novedades-Excluidos') ?? 0)
      setMensaje({
        tono: 'ok',
        texto: `${res.headers.get('X-Novedades-Personas') ?? '?'} personas en el archivo${fuera > 0 ? ` · ${fuera} sin blanco estimable quedaron fuera` : ''}`,
      })
    } catch (e) {
      setMensaje({ tono: 'error', texto: `No se pudo generar el archivo: ${e instanceof Error ? e.message : 'error desconocido'}` })
    } finally {
      setOcupado(null)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} data-testid="exportar-estudio-abrir"
        style={{ ...BOTON, background: 'transparent', border: 0, color: V.apagado, textDecoration: 'underline', padding: '6px 4px' }}>
        Exportar para el estudio
      </button>
    )
  }
  return (
    <div data-testid="exportar-estudio" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <select value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Quincena a exportar" data-testid="exportar-estudio-quincena"
        style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${V.linea}`, fontSize: '12.5px', background: '#FFFFFF', color: V.tinta }}>
        {quincenas.map((q) => <option key={q.desde} value={q.desde}>{q.texto}</option>)}
      </select>
      {(['xlsx', 'pdf'] as const).map((f) => (
        <button key={f} type="button" disabled={ocupado != null} onClick={() => bajar(f)} data-testid={`exportar-estudio-${f}`}
          style={{ ...BOTON, border: 0, background: V.grafito, color: '#FFFFFF', opacity: ocupado ? 0.6 : 1 }}>
          {ocupado === f ? 'Generando…' : f === 'xlsx' ? 'Excel' : 'PDF'}
        </button>
      ))}
      <button type="button" onClick={() => { setAbierto(false); setMensaje(null) }}
        style={{ ...BOTON, background: 'transparent', border: 0, color: V.apagado, fontWeight: 400 }}>cerrar</button>
      {mensaje && (
        <span role="status" data-testid="exportar-estudio-mensaje"
          style={{ fontSize: '12px', color: mensaje.tono === 'error' ? V.warn : V.apagado, flexBasis: '100%' }}>{mensaje.texto}</span>
      )}
    </div>
  )
}
