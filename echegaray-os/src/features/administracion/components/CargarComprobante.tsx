'use client'

// «CARGAR COMPROBANTE» — la acción primaria de la pantalla 24, que ahora CARGA de verdad.
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
// ═══ EL 500 QUE ROMPÍA LA PANTALLA ═══
//
// La primera versión mandaba los archivos DENTRO de la Server Action: una foto de celular de 4,4 MB
// devolvía «Body exceeded 1 MB limit» y la pantalla caía en el error genérico de React. Ahora el
// archivo va del navegador al bucket sin escala (`services/subidaDirecta.ts`) y la acción recibe
// sólo el renglón. Nada de lo que la persona hace acá puede terminar en una pantalla en blanco: lo
// que falla, falla POR ARCHIVO y se dice con nombre y motivo.
//
// ═══ SE ABRE EN EL LUGAR ═══
//
// *«necesito que la pantalla permita que si quiero editar edite ahí mismo, no me sirve que me
// cargue y me lleve a otro lado»*. El panel cuelga del botón: no navega, no abre un modal que tape
// la lista, y al terminar deja el resultado escrito abajo, en la fila de cada archivo.
//
// La caja del botón es la del canónico (`24`, línea 76): amarillo #FDC900, radio 6, 12,5px, peso
// 600, padding 6/11, hover #EEBE00.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, IcoSubir } from '@/shared/components/canon'
import { MAX_ARCHIVOS } from '../services/comprobanteEntrada'
import { revisarLote } from '../services/subidaComprobantes'
import { subirLote, type EstadoArchivo } from '../services/subidaDirecta'

const PANEL: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, width: 380, maxWidth: '86vw',
  background: C.superficie, border: `1px solid ${C.linea}`, borderRadius: 10,
  boxShadow: '0 8px 24px rgba(31,31,30,.10)', padding: 12,
}

interface Elegido {
  id: string
  archivo: File
  mediaType: string
  estado: EstadoArchivo
  error: string | null
}

/**
 * EL ESTADO DE UNA CARGA, APARTE DE SU DIBUJO.
 *
 * Se separa del componente porque lo que decide —qué entra, qué se reintenta, qué se dice— no tiene
 * nada que ver con el markup portado del canónico, y mezclarlos dejaba una función de 112 líneas
 * donde no se podía leer ninguna de las dos cosas.
 */
function useCarga() {
  const [elegidos, setElegidos] = useState<Elegido[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const router = useRouter()

  /**
   * Lo que no se puede subir NO entra a la lista, y se dice cuál y por qué. El resto sigue: antes,
   * un `.xlsx` colado entre cinco fotos bloqueaba el botón para las cinco.
   */
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
    const { resultados, reparto } = await subirLote(
      elegidos.map(({ id, archivo, mediaType }) => ({ id, archivo, mediaType })), marcar,
    )
    // LOS QUE ENTRARON SE VAN DE LA LISTA, LOS QUE FALLARON SE QUEDAN. Dejar los buenos invita a
    // subirlos de nuevo; sacar los malos los perdería sin que nadie pueda reintentarlos.
    const entraron = new Set(resultados.filter((r) => r.ok).map((r) => r.id))
    setElegidos((prev) => prev.filter((e) => !entraron.has(e.id)))
    setMensaje(reparto.mensaje); setError(reparto.error)
    setSubiendo(false)
    if (reparto.subidos) router.refresh()
  }

  return {
    elegidos, aviso, error, mensaje, subiendo, agregar, enviar,
    quitar: (id: string) => { setElegidos(elegidos.filter((e) => e.id !== id)); setAviso(null) },
    olvidarMensaje: () => setMensaje(null),
  }
}

type Carga = ReturnType<typeof useCarga>

export function CargarComprobante() {
  const [abierto, setAbierto] = useState(false)
  const carga = useCarga()

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
        <PanelDeCarga carga={carga} onCerrar={() => { setAbierto(false); carga.olvidarMensaje() }} />
      )}
    </div>
  )
}

/** El panel que cuelga del botón. Mismo árbol y mismos px que el canónico `24`. */
function PanelDeCarga({ carga, onCerrar }: { carga: Carga; onCerrar: () => void }) {
  const [encima, setEncima] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div style={PANEL} data-testid="panel-carga">
      <ZonaDeArrastre
        encima={encima}
        pendiente={carga.subiendo}
        onEncima={setEncima}
        onArchivos={carga.agregar}
        onElegir={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
        className="hidden"
        data-testid="archivos-comprobante"
        onChange={(e) => { carga.agregar([...(e.target.files ?? [])]); e.target.value = '' }}
      />
      <ListaElegidos elegidos={carga.elegidos} subiendo={carga.subiendo} onQuitar={carga.quitar} />
      <Mensajes aviso={carga.aviso} error={carga.error} mensaje={carga.mensaje} />
      <Acciones carga={carga} onCerrar={onCerrar} />
      <QuePasaDespues />
    </div>
  )
}

/**
 * LAS TRES FRANJAS CONVIVEN A PROPÓSITO. Un lote de cinco puede tener a la vez un archivo que ni
 * siquiera se pudo elegir (aviso), dos que no entraron (error) y tres que sí (mensaje). Mostrar una
 * sola de las tres es la forma más rápida de que alguien crea que cargó lo que no cargó.
 */
function Mensajes({ aviso, error, mensaje }: { aviso: string | null; error: string | null; mensaje: string | null }) {
  return (
    <>
      {aviso && <p className="mt-2 text-[11.5px]" style={{ color: C.warn }} data-testid="aviso-carga">{aviso}</p>}
      {error && <p className="mt-2 text-[11.5px]" style={{ color: C.neg }} data-testid="error-carga">{error}</p>}
      {mensaje && <p className="mt-2 text-[11.5px]" style={{ color: C.pos }} data-testid="ok-carga">{mensaje}</p>}
    </>
  )
}

/** La caja del botón primario es la del canónico (`24`, línea 76). */
function Acciones({ carga, onCerrar }: { carga: Carga; onCerrar: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={() => { void carga.enviar() }}
        disabled={carga.subiendo || !carga.elegidos.length}
        data-testid="enviar-carga"
        className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#FDC900] px-[11px] py-[6px] text-[12.5px] font-semibold text-[#1F1F1E] transition-colors hover:bg-[#EEBE00] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {carga.subiendo ? 'Subiendo…' : `Cargar${carga.elegidos.length ? ` ${carga.elegidos.length}` : ''}`}
      </button>
      <button
        type="button"
        onClick={onCerrar}
        className="rounded-[6px] border px-[11px] py-[6px] text-[12.5px]"
        style={{ borderColor: C.linea, color: C.tintaSuave, background: C.superficie }}
      >
        Cerrar
      </button>
    </div>
  )
}

/** El color con el que se lee cada estado. `subiendo` no es bueno ni malo: está en curso. */
const TINTA_ESTADO: Record<EstadoArchivo, string> = {
  'en cola': C.tenue, subiendo: C.info, subido: C.pos, 'falló': C.neg,
}

/**
 * Los archivos elegidos, con su peso, en qué anda cada uno y la salida para sacar el que se coló.
 *
 * ═══ EL PROGRESO ES POR ARCHIVO PORQUE ES LO QUE SE SABE ═══
 *
 * `supabase-js` no avisa cuántos bytes lleva subidos: lo que se sabe de verdad es si un archivo
 * está en cola, viajando, arriba o caído. Se muestra eso. Una barra que avanza sola mientras el
 * archivo no se mueve sería un número inventado, y de esos ya se pagó el precio.
 */
function ListaElegidos({
  elegidos, subiendo, onQuitar,
}: {
  elegidos: Elegido[]
  subiendo: boolean
  onQuitar: (id: string) => void
}) {
  if (!elegidos.length) return null
  const terminados = elegidos.filter((e) => e.estado === 'subido' || e.estado === 'falló').length
  return (
    <>
      {subiendo && <BarraDeLote hechos={terminados} total={elegidos.length} />}
      <ul className="mt-2 max-h-[168px] overflow-auto" data-testid="elegidos">
        {elegidos.map((f) => (
          <li key={f.id} className="py-[3px]" data-testid="elegido" data-estado={f.estado}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: C.tintaSuave }}>{f.archivo.name}</span>
              <span className="font-mono text-[10.5px]" style={{ color: C.tenue }}>{Math.round(f.archivo.size / 1024)} KB</span>
              {f.estado === 'en cola' && !subiendo ? (
                <button type="button" onClick={() => onQuitar(f.id)} className="text-[11px] underline underline-offset-2" style={{ color: C.tenue }}>
                  quitar
                </button>
              ) : (
                <span className="text-[11px]" style={{ color: TINTA_ESTADO[f.estado] }}>{f.estado}</span>
              )}
            </div>
            {f.error && <p className="text-[10.5px] leading-snug" style={{ color: C.neg }}>{f.error}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Cuántos archivos del lote ya terminaron. Es un conteo real, no una estimación de bytes. */
function BarraDeLote({ hechos, total }: { hechos: number; total: number }) {
  return (
    <div className="mt-2" data-testid="barra-lote" data-hechos={hechos} data-total={total}>
      <div style={{ height: 4, background: C.pista, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: 4, width: `${Math.round((hechos / Math.max(1, total)) * 100)}%`, background: C.marca, transition: 'width .2s' }} />
      </div>
      <p className="mt-1 text-[10.5px]" style={{ color: C.tenue }}>{hechos} de {total} listos</p>
    </div>
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
      onDragOver={(e) => { e.preventDefault(); if (!pendiente) onEncima(true) }}
      onDragLeave={() => onEncima(false)}
      // Mientras el lote viaja, la zona está apagada (0,6 de opacidad) y NO acepta: dejar sumar
      // archivos a una tanda que ya salió los dejaría en la lista sin subir, marcados «en cola»
      // sobre algo que nadie va a mandar.
      onDrop={(e) => { e.preventDefault(); onEncima(false); if (!pendiente) onArchivos([...(e.dataTransfer?.files ?? [])]) }}
      onClick={() => { if (!pendiente) onElegir() }}
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
