'use client'

// EL DÍA DE UNA PERSONA — panel lateral de 440 px en la compu, hoja desde abajo en el teléfono.
//
// Es UN componente: el mismo contenido con dos marcos por CSS. Dos componentes serían dos lugares
// donde una regla (qué motivo, cuándo hay tardanza, desde cuándo se mueve) se corrige en uno solo.
//
// No navega: se abre encima de la lista, que queda en su lugar (Figma: «la interfaz no se mueve
// mientras se trabaja»). Cierra con ×, con Escape y tocando afuera.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { hrefCorregirEnHoras, muestraTardanza, tienePresentismo, type FilaDeCarga } from '@/features/administracion/services/cargaDeAsistencia'
import { motivosDeDiaNoTrabajado } from '@/features/administracion/services/motivoDeAusencia'
import { jornadaPorDefecto } from '@/features/administracion/services/jornadaPorDefecto'
import { ChipsDeTardanza, EstadoSegmentado, HorasDeObra, LineaDeGuardado } from './ControlesDeFila'
import { ObraDeLaPersona } from './ObraDeLaPersona'
import type { AccionesDeLaCarga, DiaDeLaCarga } from './tipos'

const MOTIVOS = motivosDeDiaNoTrabajado()
const ROTULO = 'text-[11px] tracking-[0.06em] text-faint'

export function PanelDeLaPersona({ fila, dia, acciones, onCerrar }: {
  fila: FilaDeCarga; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga; onCerrar: () => void
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])
  const { persona } = fila
  const guardado = acciones.guardadoDe(persona.id)
  return (
    <>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} data-testid="panel-persona-fondo" className="fixed inset-0 z-30 bg-ink/45 md:bg-transparent" />
      <aside
        role="dialog" aria-label={`Día de ${persona.nombre}`} data-testid="panel-persona"
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[92vh] flex-col rounded-t-[16px] bg-surface md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:border-l md:border-line md:shadow-card"
      >
        <div className="flex justify-center pt-2 md:hidden"><span className="h-1 w-10 rounded-full bg-line-strong" /></div>
        <header className="flex items-start justify-between gap-3 border-b border-line-hairline px-4 pb-3 pt-3 md:px-6 md:pb-4 md:pt-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-[17px] font-semibold text-ink">{persona.nombre}</h2>
            <p className="text-[12.5px] text-faint md:text-[12px]" data-testid="panel-subtitulo">
              {[persona.categoria ?? (persona.esJefe ? 'Jefe de obra' : null), dia.rotuloDia].filter(Boolean).join(' · ')}
              {guardado && <> · <LineaDeGuardado estado={guardado} testid="estado-guardado" /></>}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" data-testid="panel-persona-cerrar" className="flex h-11 w-11 shrink-0 items-center justify-center text-[20px] text-muted hover:text-ink md:h-8 md:w-8 md:text-[18px]">×</button>
        </header>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4 md:gap-6 md:px-6 md:py-5">
          <SeccionEstado fila={fila} dia={dia} acciones={acciones} />
          <SeccionHoras fila={fila} dia={dia} acciones={acciones} />
          <section className="flex flex-col gap-2">
            <span className={ROTULO}>OBRA</span>
            <ObraDeLaPersona fila={fila} dia={dia} acciones={acciones} />
          </section>
          <section className="flex flex-col gap-1.5 text-[12.5px]">
            <span className={ROTULO}>MÁS</span>
            {/* TRAMO DE LICENCIA: la corrección de la grilla (`corregirJornada`). Reimplementarla acá sería la
                segunda definición de la acción más delicada de Horas. */}
            <Link prefetch={false} href={hrefCorregirEnHoras(dia.fecha, persona.nombre)} data-testid="licencia-varios-dias" className="flex min-h-11 items-center text-muted underline hover:text-ink md:min-h-0">Licencia por varios días</Link>
            <Link prefetch={false} href={hrefCorregirEnHoras(dia.fecha, persona.nombre)} data-testid="ver-quincena" className="flex min-h-11 items-center text-muted underline hover:text-ink md:min-h-0">Ver su quincena</Link>
          </section>
        </div>
      </aside>
    </>
  )
}

function SeccionEstado({ fila, dia, acciones }: { fila: FilaDeCarga; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  const { persona } = fila
  const casilla = acciones.casillaDe(fila)
  const marcable = dia.sePuede.marcar && acciones.obraDe(fila) !== null
  const noVino = casilla.estado === 'ausente' || casilla.estado === 'licencia'
  const certificado = dia.certificados[persona.id]
  return (
    <section className="flex flex-col gap-2">
      <span className={ROTULO}>ESTADO</span>
      <EstadoSegmentado grande estado={casilla.estado} nombre={persona.nombre} deshabilitado={!marcable} onElegir={(e) => acciones.tocar(fila, { tipo: 'estado', boton: e })} />
      {tienePresentismo(persona) ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <ChipsDeTardanza
            grande casilla={casilla} nombre={persona.nombre}
            activos={marcable && dia.sePuede.tardanza && muestraTardanza(persona, casilla.estado)}
            onTocar={(marca) => acciones.tocar(fila, { tipo: 'tardanza', marca })}
          />
          {casilla.estado === 'presente' && (casilla.llego_tarde || casilla.salio_antes) && <span className="text-[12px] text-warn">pierde presentismo</span>}
        </div>
      ) : <span className="text-[12px] text-faint">Mensual: sin presentismo.</span>}
      {noVino && (
        <select
          aria-label={`Motivo de ${persona.nombre}`} data-testid="motivo" value={casilla.motivo ?? ''} disabled={!marcable}
          onChange={(e) => acciones.tocar(fila, { tipo: 'motivo', boton: casilla.estado as 'ausente' | 'licencia', motivo: e.target.value || null })}
          className="h-11 rounded-control border border-line bg-surface px-2 text-[14px] text-ink md:h-9 md:text-[13px]"
        >
          <option value="">Motivo (se puede cargar después)</option>
          {MOTIVOS.map((m) => <option key={m.clave} value={m.clave}>{m.etiqueta}{m.tipo === 'licencia' ? ' · licencia' : ''}</option>)}
        </select>
      )}
      {certificado && <span className="truncate text-[12px] text-muted" data-testid="certificado-del-dia" title={certificado}>Certificado: {certificado}</span>}
    </section>
  )
}

function SeccionHoras({ fila, dia, acciones }: { fila: FilaDeCarga; dia: DiaDeLaCarga; acciones: AccionesDeLaCarga }) {
  const [otra, setOtra] = useState('')
  const [repartir, setRepartir] = useState(false)
  const obraId = acciones.obraDe(fila)
  if (acciones.casillaDe(fila).estado !== 'presente' || !obraId) return null
  const usadas = new Set([obraId, ...fila.otrasObras.map((o) => o.obraId)])
  const comun = { personaId: fila.persona.id, nombre: fila.persona.nombre, fecha: dia.fecha, deshabilitado: !dia.sePuede.horas }
  const nombre = (id: string) => dia.nombres[id] ?? id
  return (
    <section className="flex flex-col gap-2" data-testid="horas-del-dia">
      <span className={ROTULO}>HORAS DEL DÍA</span>
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <HorasDeObra {...comun} obraId={obraId} obraNombre={nombre(obraId)} horas={fila.horas} sugerencia={jornadaPorDefecto(dia.fecha)} />
        {fila.otrasObras.map((o) => <HorasDeObra key={o.obraId} {...comun} obraId={o.obraId} obraNombre={nombre(o.obraId)} horas={o.horas} sugerencia={null} />)}
        {otra && <HorasDeObra {...comun} obraId={otra} obraNombre={nombre(otra)} horas={null} sugerencia={null} />}
      </div>
      {dia.sePuede.horas && !otra && (repartir ? (
        <select value="" onChange={(e) => setOtra(e.target.value)} data-testid="repartir-obra" aria-label="Otra obra del día" className="h-11 rounded-control border border-line bg-surface px-2 text-[14px] text-ink md:h-9 md:text-[13px]">
          <option value="">¿Qué otra obra?</option>
          {dia.obras.filter((o) => !usadas.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      ) : (
        <button type="button" onClick={() => setRepartir(true)} data-testid="abrir-repartir" className="flex min-h-11 items-center self-start text-[12.5px] text-muted hover:text-ink md:min-h-0">
          + Repartir con otra obra
        </button>
      ))}
    </section>
  )
}
