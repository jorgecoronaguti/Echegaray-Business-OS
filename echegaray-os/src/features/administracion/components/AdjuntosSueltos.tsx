'use client'

// LOS COMPROBANTES QUE NO ENCONTRARON SU FILA — y cómo colgarlos SIN SALIR DE ACÁ.
//
// ═══ POR QUÉ ESTA SUB-VISTA EXISTE ═══
//
// El backfill vincula lo que puede probar y deja el resto suelto a propósito: un adjunto colgado de
// la factura equivocada es PEOR que uno sin colgar, porque se ve como respaldo y no lo es. Lo que no
// se pudo probar no se adivina — se pone acá, donde una persona lo mira y lo decide.
//
// ═══ SE RESUELVE EN EL LUGAR ═══
//
// Pedido textual del dueño: «necesito que la pantalla permita que si quiero editar edite ahí mismo,
// no me sirve que me cargue y me lleve a otro lado». Se busca la compra, se elige y se vincula sin
// navegar. El papel se abre en una pestaña nueva porque es un archivo, no una pantalla.

import { useState, useTransition } from 'react'
import { C } from '@/shared/components/canon'
import {
  buscarCompras, urlDelAdjunto, vincularAdjunto, type CompraCandidata,
} from '../services/comprasAdjuntoActions'
import type { Adjunto } from '../services/comprasSheetService'

const fmt = (n: number | null) =>
  (n == null ? '—' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)

function Buscador({ adjunto, alVincular }: { adjunto: Adjunto; alVincular: () => void }) {
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState<CompraCandidata[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  function buscar() {
    setError(null)
    empezar(async () => {
      const r = await buscarCompras(q)
      if (!r.ok) { setError(r.error); setOpciones(null); return }
      setOpciones(r.dato)
    })
  }

  function elegir(c: CompraCandidata) {
    setError(null)
    empezar(async () => {
      const r = await vincularAdjunto(adjunto.id, c.clave)
      if (!r.ok) { setError(r.error); return }
      alVincular()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
          placeholder="Número de comprobante o proveedor"
          data-testid="buscar-compra-destino"
          style={{
            border: `1px solid ${C.linea}`, borderRadius: 6, padding: '4px 8px', fontSize: 12,
            width: 260, maxWidth: '100%',
          }}
        />
        <button
          type="button" onClick={buscar} disabled={pendiente}
          style={{
            border: `1px solid ${C.linea}`, borderRadius: 6, padding: '4px 10px', fontSize: 12,
            background: C.superficie, cursor: pendiente ? 'wait' : 'pointer',
          }}
        >
          Buscar
        </button>
      </div>

      {error && <span style={{ fontSize: 11.5, color: '#B42318' }} data-testid="error-vincular">{error}</span>}

      {/* UN RESULTADO VACÍO SE DICE. Sin esto, buscar y no ver nada se lee como «todavía está
          buscando» y la persona vuelve a apretar. */}
      {opciones?.length === 0 && (
        <span style={{ fontSize: 11.5, color: C.tenue }}>Ninguna compra coincide con eso.</span>
      )}

      {opciones?.map((c) => (
        <button
          key={c.fila} type="button" onClick={() => elegir(c)} disabled={pendiente}
          data-testid={`elegir-compra-${c.fila}`}
          style={{
            textAlign: 'left', border: `1px solid ${C.linea}`, borderRadius: 6, padding: '5px 9px',
            background: C.superficie, cursor: pendiente ? 'wait' : 'pointer', fontSize: 12,
          }}
        >
          <span style={{ color: C.tinta }}>{c.proveedor ?? 'sin proveedor'}</span>
          <span style={{ color: C.tenue, fontFamily: 'var(--font-plex-mono)', fontSize: 11 }}>
            {' · '}{c.comprobante}{' · '}{fmt(c.total)}
          </span>
        </button>
      ))}
    </div>
  )
}

export function AdjuntosSueltos({ adjuntos }: { adjuntos: Adjunto[] }) {
  const [resueltos, setResueltos] = useState<string[]>([])
  const quedan = adjuntos.filter((a) => !resueltos.includes(a.id))

  if (!adjuntos.length) {
    return (
      <div style={{ padding: '26px 14px', fontSize: 12.5, color: C.tintaSuave }} data-testid="sin-sueltos">
        No hay comprobantes sueltos: todos los archivos guardados encontraron su fila de Compras.
      </div>
    )
  }

  return (
    <div data-testid="adjuntos-sueltos" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* LO QUE YA SE RESOLVIÓ NO DESAPARECE DE GOLPE: queda dicho. Una fila que se esfuma deja a la
          persona sin saber si el clic hizo algo. */}
      {resueltos.length > 0 && (
        <div style={{ padding: '10px 14px', fontSize: 12, color: '#067647' }}>
          {resueltos.length} vinculado{resueltos.length > 1 ? 's' : ''}. Se ven en su fila al recargar.
        </div>
      )}
      {quedan.map((a) => (
        <div
          key={a.id}
          style={{
            display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 14px',
            borderBottom: `1px solid ${C.lineaFila}`,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <button
              type="button"
              onClick={async () => {
                const r = await urlDelAdjunto(a.id)
                if (r.ok) window.open(r.dato, '_blank', 'noopener,noreferrer')
              }}
              style={{
                border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                fontSize: 12.5, color: C.tinta, textDecoration: 'underline', textUnderlineOffset: 2,
              }}
            >
              {a.nombre}
            </button>
            <div style={{ fontSize: 11, color: C.tenue }}>
              {a.media_type} · {(a.bytes / 1024).toFixed(0)} KB
              {a.subido_at ? ` · ${new Date(a.subido_at).toLocaleDateString('es-AR')}` : ''}
            </div>
          </div>
          <Buscador adjunto={a} alVincular={() => setResueltos((r) => [...r, a.id])} />
        </div>
      ))}
    </div>
  )
}
