'use client'

// LOS DOCUMENTOS DE UN PROVEEDOR — pedido del dueño, 09/09/2026:
// «permitime cargarle documentos a los proveedores como los contratos de subcontratistas o demás
// contenido audiovisual o PDF o Word o lo que sea que necesite cargar en app.ecsas.com.ar».
//
// ═══ UN SOLO COMPONENTE, DOS ANCHOS ═══
//
// El 09/09 el dueño volvió con la captura del PANEL LATERAL de la cartera: «sigo sin tener forma de
// cargarle docs a proveedores». Tenía razón — la sección existía sólo en la ficha completa, y el
// panel es donde trabaja. Acá no se duplicó nada: la MISMA lista, el MISMO botón de subida y la
// MISMA baja en dos pasos se dibujan con `variante`. Lo que cambia es el ancho disponible —1.000px
// en la ficha, 344px en el panel—, y una tabla de cinco columnas dentro de 344px no es una tabla:
// es una columna con el nombre cortado. Duplicar el componente para eso habría dejado dos subidas
// que se desincronizan a la primera corrección.
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
// son dos estados distintos y siguen siéndolo — lo que se fue (decisión del dueño, 09/09) es la
// PROSA: cada una se dice en una línea, no en un párrafo.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconoDocumento } from '@/shared/components/iconos'
import { fechaCortaConAnio } from '@/shared/components/canon/formato'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, RotuloPanel, V } from '@/shared/components/v2/patron'
import { ROTULO_CATEGORIA, pesoLegible, type DocumentoProveedor } from '../../services/documentosProveedor'
import { darDeBajaDocumento, urlDelDocumento } from '../../services/documentosProveedorActions'
import { SubirDocumentoProveedor } from './SubirDocumentoProveedor'

const COLS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,120px)_minmax(0,70px)_minmax(0,1fr)_minmax(0,130px)]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.6fr)_minmax(0,120px)_minmax(0,70px)_minmax(0,130px)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

/** `panel` = el lateral de la cartera (344px). `ficha` = la cara Documentos de la ficha completa. */
export type VarianteDocumentos = 'ficha' | 'panel'

export function DocumentosDelProveedor({ proveedorId, documentos, truncado, error, variante = 'ficha' }: {
  proveedorId: string
  documentos: DocumentoProveedor[]
  truncado: boolean
  /** El error de lectura, si lo hubo. Con esto en mano la lista vacía NO afirma nada. */
  error: string | null
  variante?: VarianteDocumentos
}) {
  const enPanel = variante === 'panel'
  return (
    <div data-testid="documentos-proveedor" style={enPanel ? { marginTop: 20 } : undefined}>
      {enPanel
        ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <RotuloPanel cuenta={documentos.length || undefined}>Documentos</RotuloPanel>
              <SubirDocumentoProveedor proveedorId={proveedorId} />
            </div>
          )
        : (
            <>
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
            </>
          )}

      {/* DOS AUSENCIAS, DOS ESTADOS. «no pude leerlos» va en ámbar porque es trabajo pendiente de
          alguien; «0 documentos» es un hecho leído y se dice apagado. */}
      {error && (
        <p style={{ fontSize: '12px', color: V.warn, padding: '7px 0' }} data-testid="documentos-sin-leer">
          no pude leerlos
        </p>
      )}

      {!error && documentos.length === 0 && (
        <p style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }} data-testid="documentos-vacio">
          0 documentos
        </p>
      )}

      {documentos.map((d) => (enPanel
        ? <FilaCompacta key={d.id} documento={d} />
        : <FilaAncha key={d.id} documento={d} />))}

      {truncado && (
        <p style={{ fontSize: '11px', color: V.tenue, marginTop: 12 }} data-testid="documentos-truncados">
          Se listan los {documentos.length} más recientes.
        </p>
      )}
    </div>
  )
}

/**
 * BAJAR EL ARCHIVO: una firma por clic, nunca una por fila al montar.
 *
 * Devuelve el gesto y en qué anda. El error va al estado de la fila —el mismo que muestra el de la
 * baja— porque en 344px no entran dos renglones de error para la misma fila.
 */
function useDescarga(d: DocumentoProveedor, onError: (e: string | null) => void) {
  const [ocupado, setOcupado] = useState(false)

  async function bajar() {
    if (ocupado) return
    setOcupado(true); onError(null)
    const r = await urlDelDocumento(d.id)
    setOcupado(false)
    if (!r.ok) { onError(r.error); return }
    // NO ES NAVEGACIÓN: la firma viene con `download`, así que el navegador guarda el archivo en vez
    // de dejar la pantalla. Por eso es un ancla creada al vuelo y no un `Link` ni un `<a>` dibujado.
    const a = document.createElement('a')
    a.href = r.dato
    a.rel = 'noopener'
    a.download = d.nombre_archivo
    a.click()
  }

  return { ocupado, bajar: () => { void bajar() } }
}

/** El nombre del archivo, que es el botón que lo baja. Idéntico en los dos anchos. */
function NombreDescargable({ documento: d, ocupado, onBajar }: {
  documento: DocumentoProveedor
  ocupado: boolean
  onBajar: () => void
}) {
  return (
    <button
      type="button" onClick={onBajar} disabled={ocupado}
      data-testid="bajar-documento" title={d.nombre_archivo}
      className="min-w-0 truncate text-left hover:underline underline-offset-2 disabled:opacity-60"
      style={{ fontSize: '12.5px', color: V.tinta }}
    >
      {d.nombre_archivo}
    </button>
  )
}

/** LA FILA DE LA FICHA: cinco columnas, porque ahí el ancho existe. */
function FilaAncha({ documento: d }: { documento: DocumentoProveedor }) {
  const [error, setError] = useState<string | null>(null)
  const { ocupado, bajar } = useDescarga(d, setError)

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
        <NombreDescargable documento={d} ocupado={ocupado} onBajar={bajar} />
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
 * LA FILA DEL PANEL: dos renglones, el mismo ritmo que `PapelesDelProveedor`.
 *
 * Arriba QUÉ ARCHIVO es —lo único que se busca de un vistazo—, abajo de qué sirve, de cuándo y de
 * quién. La categoría no se puede perder: es la diferencia entre un contrato y una póliza cuando el
 * archivo se llama `escaneo_003.pdf`.
 */
function FilaCompacta({ documento: d }: { documento: DocumentoProveedor }) {
  const [error, setError] = useState<string | null>(null)
  const { ocupado, bajar } = useDescarga(d, setError)

  return (
    <div
      data-testid="fila-documento"
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
    >
      <span style={{ display: 'flex', color: V.inerte, flexShrink: 0, paddingTop: 2 }}>
        <IconoDocumento className="h-[14px] w-[14px]" />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <NombreDescargable documento={d} ocupado={ocupado} onBajar={bajar} />
          <span className="font-mono shrink-0" style={{ marginLeft: 'auto', fontSize: '10.5px', color: V.inerte }}>
            {pesoLegible(d.tamano_bytes)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <span className="truncate" style={{ fontSize: '10.5px', color: V.tenue, minWidth: 0 }}>
            {ROTULO_CATEGORIA[d.categoria] ?? d.categoria} · {fechaCortaConAnio(d.creado_en) ?? 'sin fecha'} ·{' '}
            {d.subido_por_nombre ?? 'sin identificar'}
          </span>
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <Baja documentoId={d.id} error={error} onError={setError} />
          </span>
        </div>
      </div>
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
