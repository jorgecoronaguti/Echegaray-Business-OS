'use client'

// LOS CONTROLES DE LA CARGA DEL DÍA — estado, tardanza y horas. Una sola definición para la fila de la
// compu, la lista del teléfono y el panel/ficha de la persona: dos versiones del mismo botón terminan
// diciendo dos cosas distintas del mismo día.
//
// Cada control llama a una acción que YA existía (`guardarPresencia`, `quitarPresencia`, `guardarJornada`):
// esta pantalla no agrega ni una escritura.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { guardarJornada } from '@/features/administracion/services/jornadaPorObraActions'
import { hs } from '@/features/administracion/services/jornadaPorObra'
import { envioDeHoras } from '@/features/administracion/services/cargaDeAsistencia'
import type { CasillaPresencia, EstadoPresencia } from '@/features/administracion/services/presenciaDelDia'

export const ALTO = 'min-h-[44px] md:min-h-[36px]'

export type EstadoDeGuardado = { tipo: 'guardando' | 'ok' | 'error'; texto?: string } | null

export interface ObraElegible { id: string; nombre: string }

export function LineaDeGuardado({ estado, testid }: { estado: EstadoDeGuardado; testid: string }) {
  if (!estado) return null
  return (
    <span
      className={`text-[12px] ${estado.tipo === 'error' ? 'text-neg' : 'text-muted'}`}
      data-testid={testid} data-tipo={estado.tipo} role={estado.tipo === 'error' ? 'alert' : undefined}
    >
      {estado.tipo === 'guardando' ? 'guardando…' : estado.tipo === 'ok' ? (estado.texto ? `✓ ${estado.texto}` : '✓ guardado') : `No se guardó: ${estado.texto}`}
    </span>
  )
}

/** El indicador sutil de la fila: un glifo, con el texto entero en el `title`. El detalle está en el panel. */
export function MarcaDeGuardado({ estado }: { estado: EstadoDeGuardado }) {
  if (!estado) return null
  const glifo = estado.tipo === 'guardando' ? '…' : estado.tipo === 'ok' ? '✓' : '!'
  const titulo = estado.tipo === 'error' ? `No se guardó: ${estado.texto}` : estado.tipo === 'ok' ? 'guardado' : 'guardando…'
  return (
    <span
      title={titulo} aria-label={titulo} data-testid="guardado-fila" data-tipo={estado.tipo}
      className={`inline-block w-3 text-center text-[12px] ${estado.tipo === 'error' ? 'font-semibold text-neg' : 'text-faint'}`}
    >
      {glifo}
    </span>
  )
}

const ESTADOS: { e: EstadoPresencia; rotulo: string; activo: string }[] = [
  { e: 'presente', rotulo: 'Presente', activo: 'bg-pos-soft text-pos font-medium' },
  { e: 'ausente', rotulo: 'Ausente', activo: 'bg-neg-soft text-neg font-medium' },
  { e: 'licencia', rotulo: 'Licencia', activo: 'bg-surface-sunken text-ink font-medium' },
]

/**
 * PRESENTE · AUSENTE · LICENCIA como UN control segmentado: son respuestas excluyentes a la misma
 * pregunta. Tocar el activo lo desmarca (`casillaTrasToque`). `grande` es el del panel y la ficha.
 */
export function EstadoSegmentado({ estado, nombre, onElegir, deshabilitado, grande = false }: {
  estado: EstadoPresencia | null; nombre: string; onElegir: (e: EstadoPresencia) => void
  deshabilitado?: boolean; grande?: boolean
}) {
  const alto = grande ? 'h-12 md:h-10 text-[14px] md:text-[13px]' : 'h-[30px] px-3 text-[12px]'
  return (
    <div
      role="group" aria-label={`Estado de ${nombre}`} data-testid="estado-segmentado"
      className={`${grande ? 'grid w-full grid-cols-3' : 'inline-flex w-max'} overflow-hidden rounded-control border border-line bg-surface`}
    >
      {ESTADOS.map(({ e, rotulo, activo }, i) => (
        <button
          key={e} type="button" disabled={deshabilitado} aria-pressed={estado === e} data-testid={`estado-${e}`}
          aria-label={`${nombre}: ${rotulo}`} onClick={() => onElegir(e)}
          className={`${alto} ${i > 0 ? 'border-l border-line' : ''} transition-colors disabled:opacity-50 ${
            estado === e ? activo : 'text-muted hover:bg-surface-quiet hover:text-ink'
          }`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}

const TARDANZAS = [['llego_tarde', 'Llegó tarde'], ['salio_antes', 'Salió antes']] as const

/** Llegó tarde · Salió antes. Activos sólo sobre presente o sin marcar —tocar declara presente—. */
export function ChipsDeTardanza({ casilla, nombre, activos, onTocar, grande = false }: {
  casilla: CasillaPresencia; nombre: string; activos: boolean
  onTocar: (marca: 'llego_tarde' | 'salio_antes') => void; grande?: boolean
}) {
  const forma = grande ? 'h-11 md:h-8 rounded-control md:rounded-full px-3 text-[14px] md:text-[12px]' : 'h-7 rounded-full px-2.5 text-[12px]'
  return (
    <div className={grande ? 'grid grid-cols-2 gap-2 md:flex' : 'flex gap-2'} role="group" aria-label={`Tardanza de ${nombre}`}>
      {TARDANZAS.map(([marca, rotulo]) => {
        const on = casilla[marca] === true && casilla.estado === 'presente'
        return (
          <button
            key={marca} type="button" disabled={!activos} aria-pressed={on} data-testid={marca.replace('_', '-')}
            aria-label={`${nombre} ${rotulo.toLowerCase()}`} onClick={() => onTocar(marca)}
            className={`${forma} border transition-colors disabled:opacity-40 ${on ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-surface text-faint hover:text-ink'}`}
          >
            {on && grande ? `▲ ${rotulo}` : rotulo}
          </button>
        )
      })}
    </div>
  )
}

/**
 * LAS HORAS DE UNA PERSONA EN UNA OBRA, ESE DÍA. Guarda al salir del campo o con Enter, por
 * `guardarJornada`: vacío es «sin horas», cero es un error, el número corrige. La jornada por defecto
 * va como placeholder, nunca como valor. `compacto` es la celda de la fila: sin rótulo y con el acuse
 * reducido a un glifo.
 */
export function HorasDeObra({ personaId, nombre, obraId, obraNombre, fecha, horas, sugerencia, deshabilitado, compacto = false }: {
  personaId: string; nombre: string; obraId: string; obraNombre: string; fecha: string
  horas: number | null; sugerencia: number | null; deshabilitado?: boolean; compacto?: boolean
}) {
  const router = useRouter()
  const servidor = horas === null ? '' : hs(horas)
  const [borrador, setBorrador] = useState<{ base: string; texto: string }>({ base: servidor, texto: servidor })
  // LO QUE OTRO USUARIO GUARDÓ ENTRA SI NO SE ESTÁ EDITANDO ESTA CASILLA (tiempo real, 16/09/2026).
  if (borrador.base !== servidor && borrador.texto === borrador.base) setBorrador({ base: servidor, texto: servidor })
  const [estado, setEstado] = useState<EstadoDeGuardado>(null)
  const [, arrancar] = useTransition()

  const confirmar = () => {
    const envio = envioDeHoras({ personaId, obraId, fecha, antes: horas, texto: borrador.texto })
    if (envio.tipo === 'nada') return
    if (envio.tipo === 'error') { setEstado({ tipo: 'error', texto: envio.error }); return }
    const texto = borrador.texto.trim()
    setEstado({ tipo: 'guardando' })
    arrancar(async () => {
      const r = await guardarJornada(envio.entrada)
      if (r.ok) { setEstado({ tipo: 'ok', texto: r.aviso }); setBorrador({ base: texto, texto }); router.refresh() }
      else setEstado({ tipo: 'error', texto: r.error })
    })
  }

  const input = (
    <input
      inputMode="decimal" value={borrador.texto} disabled={deshabilitado}
      placeholder={sugerencia === null ? '—' : hs(sugerencia)}
      aria-label={`Horas de ${nombre} en ${obraNombre}`} data-testid="input-horas"
      onChange={(e) => { setBorrador({ ...borrador, texto: e.target.value }); setEstado(null) }}
      onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onClick={(e) => e.stopPropagation()}
      className={`${compacto ? 'h-8 w-14' : 'h-11 w-24 md:h-9 md:w-[88px]'} rounded-control border px-2 text-right font-mono text-[13px] tabular-nums text-ink disabled:opacity-50 ${
        estado?.tipo === 'error' ? 'border-neg' : compacto ? 'border-transparent bg-transparent hover:border-line focus:border-line focus:bg-surface' : 'border-line bg-surface'
      }`}
    />
  )
  if (compacto) {
    return <span className="inline-flex items-center justify-end gap-1" data-testid="horas-de-obra" data-obra={obraId}>{input}<MarcaDeGuardado estado={estado} /></span>
  }
  return (
    <div className="contents" data-testid="horas-de-obra" data-obra={obraId}>
      <span className="text-[13px] text-ink md:text-[13px]">{obraNombre}</span>
      {input}
      {estado && <span className="col-span-2 -mt-1"><LineaDeGuardado estado={estado} testid="estado-horas" /></span>}
    </div>
  )
}
