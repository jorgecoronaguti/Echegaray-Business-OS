'use client'

// «CARGAR COMPROBANTE» — la acción primaria de la pantalla 24, que ahora CARGA.
//
// ═══ QUÉ CAMBIÓ Y POR QUÉ (25/08/2026) ═══
//
// Hasta hoy este botón abría un texto que explicaba que la carga se hacía por Mattermost. El
// argumento era bueno —una segunda puerta sin OCR ni cruces cargaría comprobantes que nadie
// verificó— pero la conclusión estaba equivocada, y el dueño la corrigió: *«la carga de comprobantes
// se debe hacer de la misma manera que se hace vía bot del OS»*. No hay dos circuitos: hay uno, y
// esta pantalla es otra puerta al mismo. El archivo va al bucket, la fila a la cola, y el worker de
// la VM lo procesa con el mismo código que el bot — con sus tres cruces (proveedor por CUIT, obra,
// duplicado), su freno de mano y su registro de idempotencia.
//
// ═══ SE ABRE EN EL LUGAR ═══
//
// *«necesito que la pantalla permita que si quiero editar edite ahí mismo, no me sirve que me
// cargue y me lleve a otro lado»*. El panel cuelga del botón: no navega, no abre un modal que tape
// la lista, y al terminar deja el resultado escrito abajo, en la fila de cada archivo.
//
// La caja del botón es la del canónico (`24`, línea 76): amarillo #FDC900, radio 6, 12,5px, peso
// 600, padding 6/11, hover #EEBE00.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { C, IcoSubir } from '@/shared/components/canon'
import { MAX_ARCHIVOS, archivoAceptable } from '../services/comprobanteEntrada'
import { subirComprobantes } from '../services/comprobanteEntradaActions'

const PANEL: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, width: 380, maxWidth: '86vw',
  background: C.superficie, border: `1px solid ${C.linea}`, borderRadius: 10,
  boxShadow: '0 8px 24px rgba(31,31,30,.10)', padding: 12,
}

export function CargarComprobante() {
  const [abierto, setAbierto] = useState(false)
  const [elegidos, setElegidos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [encima, setEncima] = useState(false)
  const [pendiente, arrancar] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()

  /** Valida ANTES de subir: un archivo malo en el medio dejaría medio lote en el bucket. */
  function agregar(nuevos: File[]) {
    setMensaje(null)
    const juntos = [...elegidos, ...nuevos].slice(0, MAX_ARCHIVOS)
    const malo = juntos.map((f) => archivoAceptable({ name: f.name, type: f.type, size: f.size })).find((r) => !r.ok)
    setError(malo && !malo.ok ? malo.error : null)
    setElegidos(juntos)
  }

  function enviar() {
    if (!elegidos.length || error) return
    const form = new FormData()
    for (const f of elegidos) form.append('archivos', f)
    arrancar(async () => {
      const r = await subirComprobantes(form)
      // EL ERROR DEL SERVIDOR SE MUESTRA SIEMPRE: es la única prueba de lo que pasó. Un panel que se
      // cierra en silencio le hace creer a alguien que cargó un gasto que no existe.
      if (!r.ok) { setError(r.error); return }
      setElegidos([]); setError(null); setMensaje(r.mensaje ?? 'Subido.')
      if (input.current) input.current.value = ''
      router.refresh()
    })
  }

  return (
    <div style={{ position: 'relative' }} data-testid="cargar-comprobante">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        data-testid="abrir-carga"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] bg-[#FDC900] px-[11px] py-[6px] text-[12.5px] font-semibold text-[#1F1F1E] transition-colors hover:bg-[#EEBE00]"
      >
        <IcoSubir s={14} />
        Cargar comprobante
      </button>

      {abierto && (
        <div style={PANEL} data-testid="panel-carga">
          <ZonaDeArrastre
            encima={encima}
            pendiente={pendiente}
            onEncima={setEncima}
            onArchivos={agregar}
            onElegir={() => input.current?.click()}
          />
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
            className="hidden"
            data-testid="archivos-comprobante"
            onChange={(e) => agregar([...(e.target.files ?? [])])}
          />

          <ListaElegidos
            elegidos={elegidos}
            onQuitar={(i) => { setElegidos(elegidos.filter((_, k) => k !== i)); setError(null) }}
          />

          {error && <p className="mt-2 text-[11.5px]" style={{ color: C.neg }} data-testid="error-carga">{error}</p>}
          {mensaje && <p className="mt-2 text-[11.5px]" style={{ color: C.pos }} data-testid="ok-carga">{mensaje}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={pendiente || !elegidos.length || !!error}
              data-testid="enviar-carga"
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#FDC900] px-[11px] py-[6px] text-[12.5px] font-semibold text-[#1F1F1E] transition-colors hover:bg-[#EEBE00] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendiente ? 'Subiendo…' : `Cargar${elegidos.length ? ` ${elegidos.length}` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => { setAbierto(false); setMensaje(null) }}
              className="rounded-[6px] border px-[11px] py-[6px] text-[12.5px]"
              style={{ borderColor: C.linea, color: C.tintaSuave, background: C.superficie }}
            >
              Cerrar
            </button>
          </div>

          <QuePasaDespues />
        </div>
      )}
    </div>
  )
}

/** Los archivos elegidos, con su peso y la salida para sacar el que se coló. */
function ListaElegidos({ elegidos, onQuitar }: { elegidos: File[]; onQuitar: (i: number) => void }) {
  if (!elegidos.length) return null
  return (
    <ul className="mt-2 max-h-[168px] overflow-auto" data-testid="elegidos">
      {elegidos.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2 py-[3px]">
          <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: C.tintaSuave }}>{f.name}</span>
          <span className="font-mono text-[10.5px]" style={{ color: C.tenue }}>{Math.round(f.size / 1024)} KB</span>
          <button
            type="button"
            onClick={() => onQuitar(i)}
            className="text-[11px] underline underline-offset-2"
            style={{ color: C.tenue }}
          >
            quitar
          </button>
        </li>
      ))}
    </ul>
  )
}

/** LO QUE PASA DESPUÉS, DICHO ANTES. Sin esto, la demora del worker se lee como «se perdió»: del
 *  otro lado hay alguien con el papel todavía en la mano. */
function QuePasaDespues() {
  return (
    <p className="mt-2 text-[11px] leading-relaxed" style={{ color: C.tenue }}>
      El OS lee cada comprobante, lo cruza contra ARCA, contra el banco y contra lo ya cargado, y lo
      escribe en la pestaña Compras del Flujo de Fondos. Tarda hasta un minuto y el estado de cada
      archivo aparece abajo. Nunca carga dos veces el mismo comprobante.
    </p>
  )
}

/** El rectángulo punteado. Separado para que el componente de arriba no pase de 50 líneas. */
function ZonaDeArrastre({
  encima, pendiente, onEncima, onArchivos, onElegir,
}: {
  encima: boolean
  pendiente: boolean
  onEncima: (v: boolean) => void
  onArchivos: (f: File[]) => void
  onElegir: () => void
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onEncima(true) }}
      onDragLeave={() => onEncima(false)}
      onDrop={(e) => { e.preventDefault(); onEncima(false); onArchivos([...(e.dataTransfer?.files ?? [])]) }}
      onClick={onElegir}
      data-testid="zona-arrastre"
      className="cursor-pointer rounded-[8px] border border-dashed px-3 py-5 text-center"
      style={{
        borderColor: encima ? C.grafito : C.lineaFuerte,
        background: encima ? C.seleccion : C.superficieTenue,
        opacity: pendiente ? 0.6 : 1,
      }}
    >
      <div className="flex items-center justify-center gap-2">
        <span style={{ display: 'flex', color: C.tenue }}><IcoSubir s={15} /></span>
        <span className="text-[12px]" style={{ color: C.tintaSuave }}>
          Arrastrá las fotos acá o <span className="underline underline-offset-2">elegí los archivos</span>
        </span>
      </div>
      <p className="mt-1 text-[10.5px]" style={{ color: C.tenue }}>
        JPG · PNG · HEIC · PDF · hasta {MAX_ARCHIVOS} por vez · 5 MB cada uno
      </p>
    </div>
  )
}
