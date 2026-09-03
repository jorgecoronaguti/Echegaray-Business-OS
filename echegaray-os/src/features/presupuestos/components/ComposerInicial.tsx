'use client'

// EL ARRANQUE — porte literal del estado `esVacio` de «Presupuestos v5 · entorno xsas»
// (líneas 52-73 del mockup): el legajo se tira acá, o se describe la obra con las propias
// palabras. Sin documentación el cómputo queda marcado como «a mano» — xsas calcula y pone
// precios, pero ninguna cantidad se le atribuye a él (texto literal del mockup).

import { useCallback, useRef, useState } from 'react'
import { C } from '@/shared/components/canon'
import { archivoValido, tamanoLegible } from '../services/trabajoCotizarApi'

const IconoSubir = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#91918B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
)

const IconoEnviar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h13" /><path d="M12 5l7 7-7 7" />
  </svg>
)

export function ComposerInicial({ enviando, error, onEnviar }: {
  enviando: boolean
  error: string | null
  onEnviar: (mensaje: string, archivos: File[]) => void
}) {
  const [mensaje, setMensaje] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [rechazo, setRechazo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const agregar = useCallback((lista: FileList | File[]) => {
    const validos: File[] = []
    let motivo: string | null = null
    for (const f of Array.from(lista)) {
      const m = archivoValido(f, archivos.length + validos.length)
      if (m) motivo = `${f.name}: ${m}`
      else validos.push(f)
    }
    setRechazo(motivo)
    if (validos.length) setArchivos((prev) => [...prev, ...validos])
  }, [archivos.length])

  const puedeEnviar = (mensaje.trim().length > 0 || archivos.length > 0) && !enviando
  const enviar = () => { if (puedeEnviar) onEnviar(mensaje.trim(), archivos) }

  return (
    <div className="flex flex-1 items-center justify-center px-20 py-16" data-testid="composer-inicial">
      <div className="w-full" style={{ maxWidth: 700 }}>
        <h2 className="m-0 text-[32px] font-semibold" style={{ letterSpacing: '-.022em', color: C.tinta }}>
          Contame qué hay que cotizar
        </h2>
        <p className="mt-3.5 max-w-[580px] text-[14.5px] leading-[1.7]" style={{ color: C.tintaSuave, textWrap: 'pretty' }}>
          Tirá el legajo como vino del cliente. xsas separa las láminas, reconstruye el alcance y
          arma el cómputo. Después lo hablamos: cada cosa que cambies acá se ve en el presupuesto de
          al lado.
        </p>

        <ZonaDeArchivos onAbrir={() => inputRef.current?.click()} onSoltar={agregar} />
        <input
          ref={inputRef} type="file" multiple className="hidden" data-testid="input-archivos"
          onChange={(e) => { if (e.target.files?.length) agregar(e.target.files); e.target.value = '' }}
        />

        {archivos.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-2" data-testid="archivos-elegidos">
            {archivos.map((f, i) => (
              <ChipArchivo key={`${f.name}-${i}`} nombre={f.name} tamano={f.size}
                onQuitar={() => setArchivos((prev) => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
        {rechazo && <p className="mt-2 text-[11.5px]" style={{ color: C.neg }} data-testid="archivo-rechazado">{rechazo}</p>}

        <div className="mt-[30px] flex items-center gap-4">
          <span className="h-px flex-1" style={{ background: C.linea }} />
          <span className="text-[11.5px]" style={{ color: C.tenue }}>o sin documentación</span>
          <span className="h-px flex-1" style={{ background: C.linea }} />
        </div>

        <div className="mt-6 flex items-center gap-3.5 pb-3.5" style={{ borderBottom: `1px solid ${C.lineaFuerte}` }}>
          <input
            value={mensaje} onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
            placeholder="«Necesito cotizar cierre perimetral para Messinas»"
            className="flex-1 border-0 bg-transparent text-[14px] outline-none" data-testid="input-mensaje"
          />
          <span
            role="button" data-testid="boton-enviar" aria-disabled={!puedeEnviar}
            onClick={enviar}
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full"
            style={{
              cursor: puedeEnviar ? 'pointer' : 'default',
              color: puedeEnviar ? C.grafito : '#C9C8C2',
              background: puedeEnviar ? C.marca : C.lineaFila,
            }}
          >
            <IconoEnviar />
          </span>
        </div>
        <p className="mt-3 text-[11.5px] leading-[1.7]" style={{ color: C.tenue }}>
          Sin documentación queda marcado como cómputo a mano. xsas calcula y pone precios, pero
          ninguna cantidad se le atribuye a él.
        </p>
        {error && <p className="mt-3 text-[12.5px]" style={{ color: C.neg }} data-testid="error-arranque">{error}</p>}
      </div>
    </div>
  )
}

function ZonaDeArchivos({ onAbrir, onSoltar }: { onAbrir: () => void; onSoltar: (l: FileList) => void }) {
  const [sobre, setSobre] = useState(false)
  return (
    <div
      onClick={onAbrir}
      onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); if (e.dataTransfer.files.length) onSoltar(e.dataTransfer.files) }}
      data-testid="zona-archivos"
      className="mt-[34px] flex cursor-pointer flex-col items-center gap-4 rounded-[10px] border border-dashed px-10 py-11"
      style={{ borderColor: sobre ? C.grafito : C.lineaFuerte, background: C.superficieTenue }}
    >
      <IconoSubir />
      <span className="text-[15px] font-medium" style={{ color: C.tinta }}>Arrastrá planos, pliego, memoria o el cómputo del cliente</span>
      <span className="max-w-[460px] text-center text-[12.5px] leading-[1.7]" style={{ color: C.apagado }}>PDF · DWG · DXF · fotos de croquis · Excel · Word</span>
      <span className="rounded-[6px] px-3.5 py-2.5 text-[12.5px] font-semibold" style={{ color: C.grafito, background: C.marca }}>Elegir archivos</span>
    </div>
  )
}

function ChipArchivo({ nombre, tamano, onQuitar }: { nombre: string; tamano: number; onQuitar: () => void }) {
  const ext = (nombre.split('.').pop() ?? '').toUpperCase()
  return (
    <span className="flex items-center gap-2 rounded-[5px] border px-2.5 py-1.5 text-[11.5px]" style={{ borderColor: C.linea, color: C.tintaSuave }}>
      <span className="font-mono text-[9.5px]" style={{ color: C.tenue }}>{ext}</span>
      <span className="font-mono">{nombre}</span>
      <span className="font-mono" style={{ color: C.tenue }}>{tamanoLegible(tamano)}</span>
      <span role="button" onClick={onQuitar} className="cursor-pointer" style={{ color: C.tenue }} aria-label={`quitar ${nombre}`}>×</span>
    </span>
  )
}
