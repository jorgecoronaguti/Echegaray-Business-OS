'use client'

// UNA COMPRA DEL PROVEEDOR Y SU PAPEL — la fila de la solapa «Comprobantes».
//
// ═══ NINGUNA ACCIÓN PROPIA ═══
//
// «Ver comprobante» pide la firma con `urlDelAdjunto`, la acción de Compras: el `storage_path` se lee
// de `compra_adjunto` con la sesión de quien mira, así que es el MISMO archivo y la MISMA cerradura.
// «Vincular» abre `AccionesCompra`, el pie del panel de Compras, entero: busca los papeles sueltos y
// los cuelga con `vincularAdjunto`. Lo que se vincula acá aparece en Compras porque es la misma fila.
//
// No hay «subir un archivo a esta compra» porque Compras tampoco lo tiene: su carga web mete un
// comprobante NUEVO en la cola del bot, y si ya estaba cargado el bot lo da por duplicado y no lo
// cuelga de la fila existente. Ofrecerlo acá sería un segundo circuito.
//
// ═══ LA FILA SE ABRE HACIA ABAJO Y NO EN UN MODAL ═══
//
// El buscador de sueltos necesita ver el nombre del archivo y abrirlo antes de elegir: en una celda
// de 150px no entra. Se abre debajo de SU fila, sin tapar las demás.

import { useState } from 'react'
import { AccionesCompra } from '../AccionesCompra'
import { urlDelAdjunto } from '../../services/comprasAdjuntoActions'
import { accionDeFila } from '../../services/comprobantesProveedor'
import { pastillaDe } from '../../services/comprasSheet'
import type { CompraConPapel } from '../../services/comprobantesProveedorService'
import { fechaCortaConAnio, pesos } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, V } from '@/shared/components/v2/patron'

export const COLS_COMPROBANTES
  = 'grid-cols-[76px_minmax(150px,1.2fr)_minmax(130px,1fr)_110px_84px_150px]'

export function FilaComprobanteProveedor({ c, papelesSinLeer }: { c: CompraConPapel; papelesSinLeer: boolean }) {
  const [abierta, setAbierta] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const accion = accionDeFila(c)
  const estado = pastillaDe(c.estado)
  const [papel] = c.adjuntos

  async function ver() {
    if (!papel) return
    setError(null); setAbriendo(true)
    const r = await urlDelAdjunto(papel.id)
    setAbriendo(false)
    if (!r.ok) { setError(r.error); return }
    // `null` = el navegador bloqueó la pestaña: sin esto el clic «no hace nada» y parece perdido.
    if (!window.open(r.dato, '_blank', 'noopener,noreferrer')) setError('El navegador bloqueó la pestaña.')
  }

  return (
    <div data-testid="fila-comprobante-proveedor" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
      <div
        className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS_COMPROBANTES}`}
        style={{ height: ALTO_V2.cara, paddingLeft: 13 }}
      >
        <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: c.fecha ? V.apagado : V.warn }}>
          {fechaCortaConAnio(c.fecha) ?? 'sin fecha'}
        </span>

        <span
          className="truncate font-mono" style={{ fontSize: '12px', color: c.comprobante ? V.tinta : V.tenue }}
          // UN VÍNCULO POR NOMBRE ES UN CÁLCULO: la compra no trae CUIT. Se dice sin un párrafo.
          title={c.via === 'nombre' ? 'La compra no trae CUIT: se vinculó por el nombre resuelto' : undefined}
        >
          {c.comprobante ? `${c.tipo ? `${c.tipo} ` : ''}${c.comprobante}` : 'sin número'}
          {c.via === 'nombre' && <span style={{ color: V.tenue }}> · por nombre</span>}
        </span>

        <span className="truncate" style={{ fontSize: '12px', color: c.obra_texto?.trim() ? V.tintaSuave : V.neg }}>
          {c.obra_texto?.trim() || 'sin obra imputada'}
        </span>

        {/* SIN IMPORTE NO ES $ 0. */}
        <span className="font-mono tabular-nums" style={{ fontSize: '12px', textAlign: 'right', color: c.total === null ? V.warn : V.tinta }}>
          {c.total === null ? 'sin importe' : pesos(c.total)}
        </span>

        {/* El estado es la columna «Estado» de la pestaña, con la misma pastilla que Compras. */}
        <span style={{ fontSize: '11.5px', color: estado.color }} data-testid="estado-compra">{estado.texto}</span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', minWidth: 0 }}>
          {papelesSinLeer
            // NO PUDE LEER ≠ NO TIENE: afirmar «sin comprobante» sería mentir sobre el respaldo.
            ? <span style={{ color: V.warn }} data-testid="papel-sin-leer">no pude leer</span>
            : accion === 'ver'
              ? (
                  <button
                    type="button" onClick={ver} disabled={abriendo} data-testid="ver-comprobante"
                    title={papel?.nombre}
                    className="cursor-pointer truncate"
                    style={{ border: 0, background: 'none', padding: 0, color: V.tinta, textDecoration: 'underline', textUnderlineOffset: 2 }}
                  >
                    {abriendo ? 'abriendo…' : 'Ver comprobante ↗'}
                    {c.adjuntos.length > 1 && <span style={{ color: V.tenue }}> +{c.adjuntos.length - 1}</span>}
                  </button>
                )
              : (
                  <>
                    <span style={{ color: V.tenue }} data-testid="sin-comprobante">sin comprobante</span>
                    {accion === 'vincular' && (
                      <button
                        type="button" onClick={() => setAbierta((v) => !v)} data-testid="abrir-vincular"
                        className="cursor-pointer"
                        style={{ border: 0, background: 'none', padding: 0, color: V.tinta, textDecoration: 'underline', textUnderlineOffset: 2 }}
                      >
                        {abierta ? 'cerrar' : 'Vincular'}
                      </button>
                    )}
                  </>
                )}
        </span>
      </div>

      {error && <p style={{ fontSize: '11.5px', color: V.warn, padding: '0 0 8px 13px' }} data-testid="error-ver">{error}</p>}
      {abierta && c.clave && (
        <div style={{ padding: '0 13px 14px' }} data-testid="vincular-desde-proveedor">
          <AccionesCompra clave={c.clave} filaCompras={c.fila} />
        </div>
      )}
    </div>
  )
}
