'use client'

// LA LISTA DEL DÍA EN EL TELÉFONO — una fila por persona y UN botón grande a la derecha.
//
// Parado en la obra, la pregunta es una sola: ¿vino? El botón marca presente sobre «sin marcar» y,
// sobre cualquier marca, abre la ficha (`botonDelTelefono`): un toque de más no puede borrar un
// presente con sus horas. Tocar el nombre abre la ficha con todo lo demás.

import { botonDelTelefono, type FilaDeCarga, type GrupoDeCarga } from '@/features/administracion/services/cargaDeAsistencia'
import { hs } from '@/features/administracion/services/jornadaPorObra'
import { MarcaDeGuardado } from './ControlesDeFila'
import type { AccionesDeLaCarga, DiaDeLaCarga } from './tipos'

const TONO = {
  pos: 'border-pos bg-pos-soft text-pos',
  neg: 'border-neg bg-neg-soft text-neg',
  neutro: 'border-line-strong bg-surface-sunken text-ink',
  vacio: 'border-line-strong bg-surface text-ink',
} as const

export function ListaDelDia({ grupos, dia, acciones }: { grupos: GrupoDeCarga[]; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  const varias = grupos.length > 1
  return (
    <div className="border-t border-line bg-surface" data-testid="lista-del-dia">
      {grupos.map((g) => (
        <section key={g.obraId ?? 'sin-obra'} data-testid="grupo-obra" data-obra={g.obraId ?? 'sin-obra'}>
          {varias && (
            <h2 className="flex h-9 items-center border-b border-line-hairline bg-surface-quiet px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink">
              <span className="truncate">{g.nombre}</span><span className="pl-1 font-normal text-faint">· {g.filas.length}</span>
            </h2>
          )}
          {g.filas.map((f) => <Fila key={f.persona.id} fila={f} dia={dia} acciones={acciones} />)}
        </section>
      ))}
    </div>
  )
}

function subtitulo(fila: FilaDeCarga, dia: DiaDeLaCarga, acciones: AccionesDeLaCarga): { texto: string; clase: string } {
  const c = acciones.casillaDe(fila)
  const obra = acciones.obraDe(fila)
  if (!obra) return { texto: 'Sin obra ese día', clase: 'text-warn' }
  if (c.estado === 'presente') {
    const tarde = [c.llego_tarde ? 'llegó tarde' : null, c.salio_antes ? 'salió antes' : null].filter(Boolean).join(' · ')
    const horas = fila.horas !== null ? `${hs(fila.horas)} h` : null
    if (tarde) return { texto: `▲ ${[tarde, horas].filter(Boolean).join(' · ')}`, clase: 'text-warn' }
    return { texto: [dia.nombres[obra] ?? obra, horas].filter(Boolean).join(' · '), clase: 'text-muted' }
  }
  const estado = c.estado === 'ausente' ? 'ausente' : c.estado === 'licencia' ? 'licencia' : 'sin marcar'
  return { texto: [fila.persona.categoria ?? (fila.persona.esJefe ? 'Jefe de obra' : null), estado].filter(Boolean).join(' · '), clase: 'text-faint' }
}

function Fila({ fila, dia, acciones }: { fila: FilaDeCarga; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  const { persona } = fila
  const casilla = acciones.casillaDe(fila)
  const boton = botonDelTelefono(casilla)
  const sub = subtitulo(fila, dia, acciones)
  const puedeMarcar = dia.sePuede.marcar && acciones.obraDe(fila) !== null
  const alTocar = () => (boton.accion === 'marcar' && puedeMarcar
    ? acciones.tocar(fila, { tipo: 'estado', boton: 'presente' })
    : acciones.abrir(persona.id))
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-line-hairline px-4 py-2" data-testid="fila-carga" data-persona={persona.id} data-estado={casilla.estado ?? 'sin_marcar'}>
      <button type="button" onClick={() => acciones.abrir(persona.id)} data-testid="abrir-ficha" className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left">
        <span className="w-full truncate text-[15px] font-medium text-ink">{persona.nombre}</span>
        <span className={`w-full truncate text-[12.5px] ${sub.clase}`}>{sub.texto} <MarcaDeGuardado estado={acciones.guardadoDe(persona.id)} /></span>
      </button>
      <button
        type="button" onClick={alTocar} data-testid="boton-presente" data-accion={boton.accion}
        aria-label={boton.accion === 'marcar' ? `Marcar presente a ${persona.nombre}` : `${persona.nombre}: ${boton.rotulo.replace('✓ ', '')}. Abrir su ficha`}
        className={`h-11 min-w-[104px] shrink-0 rounded-card border px-3 text-[14px] font-medium ${TONO[boton.tono]}`}
      >
        {boton.rotulo}
      </button>
    </div>
  )
}
