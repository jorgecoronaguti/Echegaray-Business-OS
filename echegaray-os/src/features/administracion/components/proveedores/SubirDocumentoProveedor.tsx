'use client'

// SUBIR UN DOCUMENTO A LA FICHA DE UN PROVEEDOR — pedido del dueño, 09/09/2026:
// «permitime cargarle documentos a los proveedores como los contratos de subcontratistas o demás
// contenido audiovisual o PDF o Word o lo que sea que necesite cargar en app.ecsas.com.ar».
//
// ═══ SE ABRE EN EL LUGAR ═══
//
// El panel cuelga del botón: no navega, no abre un modal que tape la lista, y al terminar deja el
// resultado escrito abajo. Es la misma pieza que ya existe en Compras (`CargarComprobante`), con
// dos diferencias que sí importan: acá se elige CATEGORÍA antes de subir —porque un contrato y una
// póliza no se buscan igual— y no hay lista blanca de tipos.
//
// ═══ LA CATEGORÍA ES DEL LOTE, NO DE CADA ARCHIVO ═══
//
// Quien sube tres páginas de un contrato escaneado las sube juntas y son las tres «contrato». Pedir
// la categoría archivo por archivo sería tres desplegables para una sola decisión; si hay que
// mezclar, se hace en dos tandas y eso es explícito.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IcoSubir } from '@/shared/components/canon'
import { V } from '@/shared/components/v2/patron'
import {
  CATEGORIAS, MAX_ARCHIVOS, MAX_BYTES, ROTULO_CATEGORIA, revisarLote,
  type CategoriaDocumento,
} from '../../services/documentosProveedor'
import { subirDocumentos, type EstadoArchivo } from '../../services/subidaDocumentoProveedor'

const TOPE_MB = MAX_BYTES / (1024 * 1024)

const PANEL: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, width: 380, maxWidth: '86vw',
  background: '#FFFFFF', borderRadius: 10, padding: 12,
  // Sin sombra: este lenguaje despega un panel flotante con BORDE, no con elevación.
  border: `1px solid ${V.lineaFuerte}`,
}

const PRIMARIO = 'inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] bg-[#FDC900] px-[11px]'
  + ' py-[6px] text-[12.5px] font-semibold text-[#1F1F1E] transition-colors hover:bg-[#EEBE00]'
  + ' disabled:cursor-not-allowed disabled:opacity-50'

interface Elegido {
  id: string
  archivo: File
  mediaType: string
  estado: EstadoArchivo
  error: string | null
}

/** El estado de una carga, aparte de su dibujo: lo que decide no es el markup. */
function useCarga(proveedorId: string) {
  const [elegidos, setElegidos] = useState<Elegido[]>([])
  const [categoria, setCategoria] = useState<CategoriaDocumento>('contrato')
  const [descripcion, setDescripcion] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const router = useRouter()

  function agregar(nuevos: File[]) {
    setMensaje(null); setError(null)
    const previos = new Map(elegidos.map((e) => [e.archivo, e]))
    const revision = revisarLote([...elegidos.map((e) => e.archivo), ...nuevos])
    setElegidos(revision.aceptados.map(({ archivo, mediaType }) => previos.get(archivo)
      ?? { id: crypto.randomUUID(), archivo, mediaType, estado: 'en cola' as const, error: null }))
    setAviso(revision.aviso)
  }

  function marcar(id: string, estado: EstadoArchivo, motivo?: string) {
    setElegidos((prev) => prev.map((e) => (e.id === id ? { ...e, estado, error: motivo ?? null } : e)))
  }

  async function enviar() {
    if (!elegidos.length || subiendo) return
    setSubiendo(true); setAviso(null); setMensaje(null); setError(null)
    const { resultados, reparto } = await subirDocumentos(
      elegidos.map(({ id, archivo, mediaType }) => ({ id, archivo, mediaType })),
      { proveedorId, categoria, descripcion }, marcar,
    )
    // LOS QUE ENTRARON SE VAN DE LA LISTA, LOS QUE FALLARON SE QUEDAN: dejar los buenos invita a
    // subirlos de nuevo, sacar los malos los pierde sin que nadie pueda reintentarlos.
    const entraron = new Set(resultados.filter((r) => r.ok).map((r) => r.id))
    setElegidos((prev) => prev.filter((e) => !entraron.has(e.id)))
    setMensaje(reparto.mensaje); setError(reparto.error)
    setSubiendo(false)
    if (reparto.subidos) { setDescripcion(''); router.refresh() }
  }

  return {
    elegidos, categoria, descripcion, aviso, error, mensaje, subiendo,
    agregar, enviar, setCategoria, setDescripcion,
    quitar: (id: string) => { setElegidos(elegidos.filter((e) => e.id !== id)); setAviso(null) },
    olvidarMensaje: () => setMensaje(null),
  }
}

type Carga = ReturnType<typeof useCarga>

export function SubirDocumentoProveedor({ proveedorId }: { proveedorId: string }) {
  const [abierto, setAbierto] = useState(false)
  const carga = useCarga(proveedorId)

  return (
    <div style={{ position: 'relative' }} data-testid="subir-documento-proveedor">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        data-testid="abrir-subida-documento"
        className={PRIMARIO}
      >
        <IcoSubir s={14} />
        Subir documento
      </button>
      {abierto && (
        <PanelDeCarga carga={carga} onCerrar={() => { setAbierto(false); carga.olvidarMensaje() }} />
      )}
    </div>
  )
}

function PanelDeCarga({ carga, onCerrar }: { carga: Carga; onCerrar: () => void }) {
  const [encima, setEncima] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div style={PANEL} data-testid="panel-subida-documento">
      <ZonaDeArrastre
        encima={encima} pendiente={carga.subiendo} onEncima={setEncima}
        onArchivos={carga.agregar} onElegir={() => input.current?.click()}
      />
      <input
        ref={input} type="file" multiple className="hidden" data-testid="archivos-documento"
        onChange={(e) => { carga.agregar([...(e.target.files ?? [])]); e.target.value = '' }}
      />
      <ListaElegidos elegidos={carga.elegidos} subiendo={carga.subiendo} onQuitar={carga.quitar} />
      <Destino carga={carga} />
      {carga.aviso && <p className="mt-2 text-[11.5px]" style={{ color: V.warn }} data-testid="aviso-documento">{carga.aviso}</p>}
      {carga.error && <p className="mt-2 text-[11.5px]" style={{ color: V.neg }} data-testid="error-documento">{carga.error}</p>}
      {carga.mensaje && <p className="mt-2 text-[11.5px]" style={{ color: V.tinta }} data-testid="ok-documento">{carga.mensaje}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button" data-testid="enviar-documento" className={PRIMARIO}
          onClick={() => { void carga.enviar() }}
          disabled={carga.subiendo || !carga.elegidos.length}
        >
          {carga.subiendo ? 'Subiendo…' : `Guardar${carga.elegidos.length ? ` ${carga.elegidos.length}` : ''}`}
        </button>
        <button
          type="button" onClick={onCerrar} data-testid="cerrar-subida-documento"
          className="rounded-[6px] border px-[11px] py-[6px] text-[12.5px]"
          style={{ borderColor: V.linea, color: V.tintaSuave, background: '#FFFFFF' }}
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

/** Categoría y descripción: para qué sirve el papel y, si hace falta, cuál es. */
function Destino({ carga }: { carga: Carga }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <select
        value={carga.categoria} data-testid="categoria-documento" aria-label="Categoría"
        onChange={(e) => carga.setCategoria(e.target.value as CategoriaDocumento)}
        className="w-full rounded-[6px] border px-[9px] py-[6px] text-[12px]"
        style={{ borderColor: V.linea, color: V.tinta, background: '#FFFFFF' }}
      >
        {CATEGORIAS.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
      </select>
      <input
        type="text" value={carga.descripcion} maxLength={400} placeholder="Descripción (opcional)"
        data-testid="descripcion-documento" aria-label="Descripción"
        onChange={(e) => carga.setDescripcion(e.target.value)}
        className="w-full rounded-[6px] border px-[9px] py-[6px] text-[12px]"
        style={{ borderColor: V.linea, color: V.tinta, background: '#FFFFFF' }}
      />
    </div>
  )
}

const TINTA_ESTADO: Record<EstadoArchivo, string> = {
  'en cola': V.tenue, subiendo: V.apagado, subido: V.tinta, 'falló': V.neg,
}

/**
 * Los archivos elegidos, con su peso y en qué anda cada uno.
 *
 * El progreso es POR ARCHIVO porque es lo que se sabe: `supabase-js` no avisa cuántos bytes lleva
 * subidos, y una barra que avanza sola sobre un archivo que no se mueve es un número inventado.
 */
function ListaElegidos({ elegidos, subiendo, onQuitar }: {
  elegidos: Elegido[]; subiendo: boolean; onQuitar: (id: string) => void
}) {
  if (!elegidos.length) return null
  return (
    <ul className="mt-2 max-h-[168px] overflow-auto" data-testid="elegidos-documento">
      {elegidos.map((f) => (
        <li key={f.id} className="py-[3px]" data-testid="elegido-documento" data-estado={f.estado}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: V.tintaSuave }}>{f.archivo.name}</span>
            <span className="font-mono text-[10.5px]" style={{ color: V.tenue }}>{Math.round(f.archivo.size / 1024)} KB</span>
            {f.estado === 'en cola' && !subiendo ? (
              <button type="button" onClick={() => onQuitar(f.id)} className="text-[11px] underline underline-offset-2" style={{ color: V.tenue }}>
                quitar
              </button>
            ) : (
              <span className="text-[11px]" style={{ color: TINTA_ESTADO[f.estado] }}>{f.estado}</span>
            )}
          </div>
          {f.error && <p className="text-[10.5px] leading-snug" style={{ color: V.neg }}>{f.error}</p>}
        </li>
      ))}
    </ul>
  )
}

/** El rectángulo punteado. Sin `accept`: acá entra cualquier tipo, y esa es la decisión. */
function ZonaDeArrastre({ encima, pendiente, onEncima, onArchivos, onElegir }: {
  encima: boolean
  pendiente: boolean
  onEncima: (v: boolean) => void
  onArchivos: (f: File[]) => void
  onElegir: () => void
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!pendiente) onEncima(true) }}
      onDragLeave={() => onEncima(false)}
      onDrop={(e) => { e.preventDefault(); onEncima(false); if (!pendiente) onArchivos([...(e.dataTransfer?.files ?? [])]) }}
      onClick={() => { if (!pendiente) onElegir() }}
      data-testid="zona-arrastre-documento"
      className="cursor-pointer rounded-[8px] border border-dashed px-3 py-5 text-center"
      style={{
        borderColor: encima ? V.grafito : V.lineaFuerte,
        background: encima ? V.seleccion : V.fondo,
        opacity: pendiente ? 0.6 : 1,
      }}
    >
      <div className="flex items-center justify-center gap-2">
        <span style={{ display: 'flex', color: V.tenue }}><IcoSubir s={15} /></span>
        <span className="text-[12px]" style={{ color: V.tintaSuave }}>
          Arrastrá los archivos acá o <span className="underline underline-offset-2">elegilos</span>
        </span>
      </div>
      <p className="mt-1 text-[10.5px]" style={{ color: V.tenue }}>
        Cualquier tipo · hasta {MAX_ARCHIVOS} por vez · {TOPE_MB} MB cada uno
      </p>
    </div>
  )
}
