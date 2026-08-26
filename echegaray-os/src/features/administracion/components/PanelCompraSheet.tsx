'use client'

// EL PANEL DE UNA FILA DE LA PESTAÑA COMPRAS — `24 · Compras v2`, líneas 265-320.
//
// ═══ QUÉ DEFECTO CIERRA (25/08/2026) ═══
//
// La fila no abría NADA: `hrefDe={() => RUTA}` devolvía la misma ruta, así que hacer clic recargaba
// la pantalla en el mismo lugar. La v2 abre un panel al costado con lo que la fila no puede mostrar
// sin volverse ilegible —forma de pago, tipo de costo, origen— y con el papel del comprobante, que
// es lo que el dueño pidió dos veces: *"que ahí existieran los archivos multimedia de las fotos que
// se han compartido desde siempre en el canal comprobantes gastos"*.
//
// ═══ POR QUÉ ACÁ SÍ HAY MINIATURA Y EN LA FILA NO ═══
//
// `CeldaComprobante` explica por qué la fila lleva un ícono: el bucket es privado, cada miniatura
// necesita su URL firmada, y dibujar 897 miniaturas serían 897 firmas por carga. Un panel es UNA
// fila a pedido: firmar sus papeles cuesta una firma por papel, una sola vez, y a ese tamaño una
// factura SÍ se lee. La regla no cambió; cambió cuántas filas se están mirando.
//
// ═══ LO QUE FALTA SE NOMBRA CON SU VERBO ═══
//
// El patrón de sección exige que cada fila que reclama algo diga QUÉ BLOQUEA y traiga su verbo. Acá
// eso es una banda ámbar arriba de las propiedades: sin obra el costo no impacta en ninguna obra;
// con deuda, queda plata sin pagar. El verbo lleva al filtro que junta a todas las que están igual.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { C, pesos } from '@/shared/components/canon'
import { COLOR_PROP, propiedadesDe, reclamoDe } from '../services/panelCompraSheet'
import { urlDelAdjunto } from '../services/comprasAdjuntoActions'
import type { Adjunto, FilaConPapel } from '../services/comprasSheetService'

const esImagen = (a: Adjunto) => a.media_type?.startsWith('image/')

/** UN papel. La firma se pide al montar y sólo para imágenes: un PDF se abre, no se previsualiza. */
function Papel({ a }: { a: Adjunto }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // `id` e `img` se sacan del objeto: `a` se recrea en cada render del padre y pedir la firma de
  // nuevo por eso serían N firmas por render sobre un bucket privado.
  const id = a.id
  const img = esImagen(a)
  useEffect(() => {
    if (!img) return
    let vivo = true
    urlDelAdjunto(id).then((r) => {
      if (!vivo) return
      if (r.ok) setSrc(r.dato)
      else setError(r.error)
    })
    return () => { vivo = false }
  }, [id, img])

  async function abrir() {
    const r = await urlDelAdjunto(a.id)
    if (r.ok) window.open(r.dato, '_blank', 'noopener')
    else setError(r.error)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }} data-testid={`papel-${a.id}`}>
      <button
        type="button"
        onClick={abrir}
        title={`Abrir ${a.nombre}`}
        style={{
          border: `1px solid ${C.linea}`, borderRadius: 7, overflow: 'hidden', background: C.superficie,
          padding: 0, cursor: 'pointer', display: 'block', width: '100%',
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={a.nombre} style={{ display: 'block', width: '100%', height: 168, objectFit: 'cover' }} />
        ) : (
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: img ? 168 : 52,
            fontSize: 12, color: C.tenue,
          }}
          >
            {error ?? (img ? 'cargando…' : `Abrir ${a.nombre}`)}
          </span>
        )}
      </button>
      <span style={{ fontSize: 10.5, color: C.tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {a.nombre}
      </span>
    </div>
  )
}

/**
 * `hrefsFiltro` es un OBJETO de URLs ya resueltas, no una función.
 *
 * Este componente es de cliente —`useEffect` pide la URL firmada del papel— y quien lo dibuja es un
 * Server Component. Una arrow creada allá y pasada como prop compila, pasa el typecheck, pasa el
 * `build`, y en producción tira React #419 dejando la pantalla en blanco: no es una server action y
 * no se puede serializar. Lo cazó `frontera-servidor-cliente.test.mjs`, que es el único control que
 * mira esto. Las tres URLs son tres strings: eso sí cruza la frontera.
 */
export function PanelCompraSheet({
  fila, cerrarHref, hrefsFiltro,
}: {
  fila: FilaConPapel
  cerrarHref: string
  hrefsFiltro: Record<string, string>
}) {
  const reclamo = reclamoDe(fila)
  return (
    <aside
      data-testid="panel-compra-sheet"
      style={{
        width: 372, flexShrink: 0, marginLeft: 24, borderLeft: `1px solid ${C.linea}`,
        paddingLeft: 24, display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.tinta, lineHeight: 1.25 }}>
            {fila.proveedor ?? 'sin proveedor'}
          </div>
          <div style={{ fontSize: 12, color: C.apagado, marginTop: 4, textWrap: 'pretty' }}>
            {fila.concepto ?? fila.detalle_obra ?? 'sin concepto'}
          </div>
        </div>
        <Link href={cerrarHref} data-testid="cerrar-panel-sheet" aria-label="Cerrar el panel" style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
        <span style={{
          fontFamily: 'var(--font-plex-mono)', fontSize: 26, fontWeight: 600, color: C.tinta,
          letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
        }}
        >
          {pesos(fila.total) ?? 'sin importe'}
        </span>
        <span style={{ fontSize: 12, color: C.apagado }}>{fila.estado ?? 'sin estado'}</span>
      </div>

      {reclamo && (
        <div
          data-testid="reclamo-compra"
          style={{
            display: 'flex', alignItems: 'center', gap: 9, marginTop: 14,
            borderTop: '1px solid #EDECE8', borderBottom: '1px solid #EDECE8',
            padding: '9px 0 9px 11px', boxShadow: 'inset 2px 0 0 #B54708',
          }}
        >
          <span style={{ display: 'flex', color: '#B54708', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" />
            </svg>
          </span>
          <span style={{ fontSize: 12, color: C.tintaSuave, flex: 1, minWidth: 0 }}>{reclamo.texto}</span>
          <Link href={hrefsFiltro[reclamo.filtro] ?? cerrarHref} style={{ fontSize: 12.5, fontWeight: 600, color: C.tinta, flexShrink: 0 }}>
            {reclamo.verbo} →
          </Link>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {propiedadesDe(fila).map((p) => (
          <div key={p.k} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid #F3F2EE' }}>
            <span style={{ fontSize: 11.5, color: C.tenue, width: 104, flexShrink: 0 }}>{p.k}</span>
            <span style={{ fontSize: 12, color: p.tono ? COLOR_PROP[p.tono] : C.tinta, minWidth: 0 }}>{p.v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.tenue, marginBottom: 8 }}>
          {fila.adjuntos.length ? `El papel · ${fila.adjuntos.length}` : 'El papel'}
        </div>
        {fila.adjuntos.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fila.adjuntos.map((a) => <Papel key={a.id} a={a} />)}
          </div>
        ) : (
          // NO es un hueco: un vacío se lee como «todavía no cargó». Esto es un dato y es trabajo.
          <p style={{ fontSize: 12, color: C.tenue, textWrap: 'pretty' }} data-testid="sin-papel">
            No hay archivo guardado de esta compra. Los que llegan por el canal de comprobantes se
            vinculan solos; éste se puede subir desde «Cargar comprobante».
          </p>
        )}
      </div>
    </aside>
  )
}
