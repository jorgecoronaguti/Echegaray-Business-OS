'use client'

// LA TABLA DEL DÍA EN LA COMPU — filas de 48 px agrupadas por obra.
//
// Una fila responde lo de todos los días: estado, tardanza y horas. Lo excepcional —el motivo de una
// ausencia, repartir horas, mover de obra, un pase— NO vive en la fila: está en el panel que abre
// «Detalle ›» o un clic en la fila. Con esos enlaces en cada renglón la tabla era «una mezcla de
// botones» (dueño, 17/09/2026) y cada fila medía tres renglones.

import type { MouseEvent } from 'react'
import { jornadaPorDefecto } from '@/features/administracion/services/jornadaPorDefecto'
import { hs } from '@/features/administracion/services/jornadaPorObra'
import { muestraTardanza, tienePresentismo, type FilaDeCarga, type GrupoDeCarga } from '@/features/administracion/services/cargaDeAsistencia'
import { etiquetaDeMotivo } from '@/features/administracion/services/motivoDeAusencia'
import { ChipsDeTardanza, EstadoSegmentado, HorasDeObra, MarcaDeGuardado } from './ControlesDeFila'
import type { AccionesDeLaCarga, DiaDeLaCarga } from './tipos'

const COLUMNAS = 'grid grid-cols-[minmax(180px,300px)_minmax(140px,220px)_236px_196px_88px_minmax(72px,1fr)] items-center gap-4 px-4'

export function TablaDelDia({ grupos, dia, acciones }: { grupos: GrupoDeCarga[]; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  return (
    <div className="mx-8 overflow-hidden rounded-card border border-line bg-surface" data-testid="tabla-del-dia">
      <div className={`${COLUMNAS} h-9 border-b border-line text-[11px] tracking-[0.06em] text-faint`}>
        <span>PERSONA</span><span>OBRA DEL DÍA</span><span>ESTADO</span><span>TARDANZA</span><span className="text-right">HORAS</span><span />
      </div>
      {grupos.map((g) => {
        const sinMarcar = g.filas.filter((f) => !acciones.casillaDe(f).estado).length
        return (
          <section key={g.obraId ?? 'sin-obra'} data-testid="grupo-obra" data-obra={g.obraId ?? 'sin-obra'}>
            <div className="flex h-9 items-center justify-between border-b border-line-hairline bg-surface-quiet px-4">
              <h2 className="truncate text-[12px] font-semibold uppercase tracking-[0.04em] text-ink">
                {g.nombre} <span className="font-normal text-faint">· {g.filas.length}</span>
              </h2>
              {g.obraId && dia.sePuede.marcar && sinMarcar > 0 && (
                <button type="button" onClick={() => acciones.marcarGrupo(g)} data-testid="marcar-todos-grupo" className="text-[12px] text-ink underline hover:text-ink-soft">
                  Marcar presentes ({sinMarcar})
                </button>
              )}
            </div>
            {g.filas.map((f) => <Fila key={f.persona.id} fila={f} dia={dia} acciones={acciones} />)}
          </section>
        )
      })}
    </div>
  )
}

// UN CLIC EN LA FILA ABRE EL PANEL, salvo que haya caído sobre un control: tocar «Ausente» no puede
// además abrir un panel encima.
const esControl = (e: MouseEvent) => (e.target as HTMLElement).closest('button, input, select, a') !== null

function Fila({ fila, dia, acciones }: { fila: FilaDeCarga; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  const { persona } = fila
  const casilla = acciones.casillaDe(fila)
  const obraId = acciones.obraDe(fila)
  const marcable = dia.sePuede.marcar && obraId !== null
  const detalle = [persona.categoria, persona.esJefe ? 'mensual' : null].filter(Boolean).join(' · ') || '—'
  return (
    <div
      className={`${COLUMNAS} h-12 cursor-pointer border-b border-line-hairline last:border-b-0 hover:bg-surface-quiet`}
      data-testid="fila-carga" data-persona={persona.id} data-estado={casilla.estado ?? 'sin_marcar'}
      onClick={(e) => { if (!esControl(e)) acciones.abrir(persona.id) }}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium text-ink">{persona.nombre}</span>
        <span className="truncate text-[12px] text-faint">{detalle}</span>
      </div>
      <span className={`truncate text-[13px] ${obraId ? 'text-ink-soft' : 'text-warn'}`}>
        {obraId ? (dia.nombres[obraId] ?? obraId) : fila.porque === 'varias-asignaciones' ? 'Dos obras asignadas' : 'Sin obra'}
      </span>
      <div className="min-w-0" title={casilla.estado && casilla.estado !== 'presente' ? (etiquetaDeMotivo(casilla.motivo) ?? 'Sin motivo: se elige en Detalle') : undefined}>
        <EstadoSegmentado estado={casilla.estado} nombre={persona.nombre} deshabilitado={!marcable} onElegir={(e) => acciones.tocar(fila, { tipo: 'estado', boton: e })} />
      </div>
      {tienePresentismo(persona) ? (
        <ChipsDeTardanza
          casilla={casilla} nombre={persona.nombre}
          activos={marcable && dia.sePuede.tardanza && muestraTardanza(persona, casilla.estado)}
          onTocar={(marca) => acciones.tocar(fila, { tipo: 'tardanza', marca })}
        />
      ) : <span className="text-[12px] text-faint">sin presentismo</span>}
      <CeldaHoras fila={fila} obraId={obraId} dia={dia} presente={casilla.estado === 'presente'} />
      <div className="flex items-center justify-end gap-2">
        <MarcaDeGuardado estado={acciones.guardadoDe(persona.id)} />
        <button type="button" onClick={() => acciones.abrir(persona.id)} aria-label={`Abrir el día de ${persona.nombre}`} data-testid="abrir-detalle" className="h-[44px] md:h-[30px] px-2 text-[12px] text-muted hover:text-ink">
          Detalle ›
        </button>
      </div>
    </div>
  )
}

function CeldaHoras({ fila, obraId, dia, presente }: { fila: FilaDeCarga; obraId: string | null; dia: DiaDeLaCarga; presente: boolean }) {
  const otras = fila.otrasObras.reduce((t, o) => t + o.horas, 0)
  if (!presente || !obraId) {
    return <span className="text-right font-mono text-[13px] tabular-nums text-faint">{otras > 0 ? hs(otras) : '—'}</span>
  }
  return (
    <span className="flex items-center justify-end" title={otras > 0 ? `+ ${hs(otras)} h en otra obra` : undefined}>
      <HorasDeObra
        compacto personaId={fila.persona.id} nombre={fila.persona.nombre} obraId={obraId} obraNombre={dia.nombres[obraId] ?? obraId}
        fecha={dia.fecha} horas={fila.horas} sugerencia={jornadaPorDefecto(dia.fecha)} deshabilitado={!dia.sePuede.horas}
      />
      {otras > 0 && <span className="pl-1 font-mono text-[11px] text-faint">+{hs(otras)}</span>}
    </span>
  )
}
