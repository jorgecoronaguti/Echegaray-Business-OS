'use client'

// LOS DOCUMENTOS DE UN PROVEEDOR, EN SU FICHA — pedido del dueño, 09/09/2026:
// «permitime cargarle documentos a los proveedores como los contratos de subcontratistas o demás
// contenido audiovisual o PDF o Word o lo que sea que necesite cargar en app.ecsas.com.ar».
//
// ═══ POR QUÉ NO HAY MINIATURA NI PREVISUALIZACIÓN ═══
//
// El bucket es privado: mostrar el contenido serían tantas URLs firmadas como filas, pedidas por
// adelantado para papeles que quizá nadie mire. Acá se firma UNA por clic, con `download`, y el
// archivo baja con el nombre con el que se subió. Es la misma regla que ya aplica `PapelesDelProveedor`.
//
// ═══ «NO PUDE LEER» NO SE DIBUJA COMO «NO TIENE» ═══
//
// Es el defecto caro de esta pantalla: una lista vacía por un error de permisos afirma que un
// proveedor no tiene contrato guardado cuando la verdad es que nadie pudo mirar. Las dos ausencias
// son dos frases distintas.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconoDocumento } from '@/shared/components/iconos'
import { fechaCortaConAnio } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import { ROTULO_CATEGORIA, pesoLegible, type DocumentoProveedor } from '../../services/documentosProveedor'
import { darDeBajaDocumento, urlDelDocumento } from '../../services/documentosProveedorActions'
import { SubirDocumentoProveedor } from './SubirDocumentoProveedor'

const COLS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,120px)_minmax(0,70px)_minmax(0,1fr)_minmax(0,130px)]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.6fr)_minmax(0,120px)_minmax(0,70px)_minmax(0,130px)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

export function DocumentosDelProveedor({ proveedorId, documentos, truncado, error }: {
  proveedorId: string
  documentos: DocumentoProveedor[]
  truncado: boolean
  /** El error de lectura, si lo hubo. Con esto en mano la lista vacía NO afirma nada. */
  error: string | null
}) {
  return (
    <div data-testid="documentos-proveedor">
      <div className="mb-3 flex items-center justify-end">
        <SubirDocumentoProveedor proveedorId={proveedorId} />
      </div>

      <div className={`grid gap-[14px] ${COLS}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Documento</RotuloCol>
        <RotuloCol>Categoría</RotuloCol>
        <RotuloCol derecha>Fecha</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Quién</RotuloCol></span>
        <RotuloCol derecha>{' '}</RotuloCol>
      </div>

      {error && (
        <p style={{ fontSize: '12px', color: V.warn, paddingTop: 10 }} data-testid="documentos-sin-leer">
          No pude leer sus documentos: esta ficha no puede afirmar que no tenga ninguno.
        </p>
      )}

      {!error && documentos.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="documentos-vacio">
          No hay ningún documento guardado contra esta ficha.
        </p>
      )}

      {documentos.map((d) => <FilaDocumento key={d.id} documento={d} />)}

      {truncado && (
        <p style={{ fontSize: '11px', color: V.tenue, marginTop: 12 }} data-testid="documentos-truncados">
          Se listan los {documentos.length} más recientes.
        </p>
      )}
    </div>
  )
}

function FilaDocumento({ documento: d }: { documento: DocumentoProveedor }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function bajar() {
    if (ocupado) return
    setOcupado(true); setError(null)
    const r = await urlDelDocumento(d.id)
    setOcupado(false)
    if (!r.ok) { setError(r.error); return }
    // NO ES NAVEGACIÓN: la firma viene con `download`, así que el navegador guarda el archivo en vez
    // de dejar la pantalla. Por eso es un ancla creada al vuelo y no un `Link` ni un `<a>` dibujado.
    const a = document.createElement('a')
    a.href = r.dato
    a.rel = 'noopener'
    a.download = d.nombre_archivo
    a.click()
  }

  return (
    <div
      data-testid="fila-documento"
      className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#F2F1ED]`}
      style={{ height: ALTO_V2.cara, paddingLeft: 13, borderBottom: `1px solid ${V.lineaFila}` }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
          <IconoDocumento className="h-[14px] w-[14px]" />
        </span>
        <button
          type="button" onClick={() => { void bajar() }} disabled={ocupado}
          data-testid="bajar-documento" title={d.nombre_archivo}
          className="min-w-0 truncate text-left hover:underline underline-offset-2 disabled:opacity-60"
          style={{ fontSize: '12.5px', color: V.tinta }}
        >
          {d.nombre_archivo}
        </button>
        <span className="font-mono shrink-0" style={{ fontSize: '10.5px', color: V.inerte }}>
          {pesoLegible(d.tamano_bytes)}
        </span>
      </span>

      <span className="truncate" style={{ fontSize: '12px', color: V.tintaSuave }}>
        {ROTULO_CATEGORIA[d.categoria] ?? d.categoria}
      </span>

      <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}>
        {fechaCortaConAnio(d.creado_en) ?? '—'}
      </span>

      <span className={`grid ${SOLO_ANCHO}`}>
        {/* SIN NOMBRE NO SE ESCRIBE UN VACÍO: se dice que no se pudo identificar, que es otra cosa. */}
        <span className="truncate" style={{ fontSize: '12px', color: d.subido_por_nombre ? V.tintaSuave : V.tenue }}>
          {d.subido_por_nombre ?? 'sin identificar'}
        </span>
      </span>

      <Baja documentoId={d.id} error={error} onError={setError} />
    </div>
  )
}

/**
 * DAR DE BAJA EN DOS PASOS, y la baja es LÓGICA: el archivo queda en el bucket.
 *
 * Un solo clic sobre una fila de 46px de alto saca de la pantalla el contrato que alguien acaba de
 * subir. El segundo clic no es una ceremonia: es la diferencia entre un error de dedo y una decisión.
 */
function Baja({ documentoId, error, onError }: {
  documentoId: string
  error: string | null
  onError: (e: string | null) => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const router = useRouter()

  async function ejecutar() {
    setOcupado(true); onError(null)
    const r = await darDeBajaDocumento(documentoId)
    setOcupado(false); setConfirmando(false)
    if (!r.ok) { onError(r.error); return }
    router.refresh()
  }

  if (error) {
    return (
      <span className="truncate text-right" style={{ fontSize: '11px', color: V.neg }} data-testid="error-fila-documento">
        {error}
      </span>
    )
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {confirmando && (
        <button
          type="button" onClick={() => setConfirmando(false)}
          className="text-[11px]" style={{ color: V.tenue }}
        >
          no
        </button>
      )}
      <button
        type="button" disabled={ocupado} data-testid="baja-documento"
        onClick={() => { if (confirmando) void ejecutar(); else setConfirmando(true) }}
        className="text-[11px] underline underline-offset-2 disabled:opacity-60"
        style={{ color: confirmando ? V.neg : V.tenue }}
      >
        {ocupado ? 'dando de baja…' : confirmando ? 'confirmar baja' : 'dar de baja'}
      </button>
    </span>
  )
}
