'use client'

// ═══ 06 · PARTE DIARIO (1440) y M08 (390) — porte literal del diseño ERP Obras, 23/09/2026 ═══
//
// LO QUE DIBUJA, EN EL ORDEN DEL DISEÑO
//
//   banda de nivel 3      las cuatro pantallas de Trabajo y, a la derecha, ‹ lunes 07/09/2026 ›
//   columna izquierda     «Qué se hizo hoy — un renglón por frente en curso»: Tarea · Hecho hoy ·
//                         Acumulado · % ítem · Quién y con qué; y debajo «Quién vino» en chips de 38 px
//   aside de 380 px       «Equipos en la obra hoy» · «Novedades del día» · la primaria «Guardar el parte»
//
// En el teléfono (M08): la fecha grande con ‹ ›, los frentes con el input de 84 px a la derecha y
// quién en la bajada, la gente con sus horas, y «Registrar el parte» de 48 px sobre la barra.
//
// LO QUE NO ESTÁ Y ESTABA: el clima (el dueño lo retiró), el selector de estado (el estado se
// deriva de los partes), el desplegable de una actividad por vez (ahora es un renglón por frente).
//
// TODO EL PARTE ES UN SOLO FORMULARIO: los renglones, las horas y la novedad viajan juntos a
// `guardarParteDiario`. El que carga a las 18:30 aprieta una vez.

import { startTransition, useActionState, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion, Persona } from '../../types'
import { TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL } from '../../types'
import type { EquipoDeParte, GenteDeParte, HoraDeJornada } from '../../services/ejecucionService'
import {
  bajadaHecho, celdaAcumulado, celdaPctItem, chipsDeGente, correr, DESTINO_LABEL, DESTINOS_NOVEDAD,
  estaBloqueada, fechaCortaDia, fechaLarga, nombreCorto, renglonesDelParte, resumenGente, rutaDeTarea,
  textoHoras, unidadDelInput, usoDelActivo, type ActivoEnObra, type DestinoNovedad, type ResumenPartes,
} from '../../services/parteDiario.ts'
import { useAnchoVentana } from '../useAnchoVentana'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { SubNavTrabajo } from '../SubNavTrabajo'

const EYEBROW: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
}
/** Las cinco columnas de «Qué se hizo hoy»: tarea · hecho · acumulado · % ítem · quién y con qué. */
const COLUMNAS = 'minmax(0,1fr) 132px 116px 96px minmax(0,1fr)'
const INPUT_HECHO: CSSProperties = {
  width: '62px', height: '30px', padding: '0 9px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
  font: 'inherit', fontSize: '13.5px', textAlign: 'right', background: C.superficie, color: C.tinta,
  fontVariantNumeric: 'tabular-nums',
}
const CHIP_26: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 8px',
  border: `1px solid ${C.borde}`, borderRadius: '6px', fontSize: '12px', color: C.tintaMedia,
  background: C.superficie, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer',
}

interface Props {
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  personas: Persona[]
  hoy: string
  registrosHH?: HoraDeJornada[]
  resumen: ResumenPartes[]
  gente: GenteDeParte[]
  equipos: EquipoDeParte[]
  activos: ActivoEnObra[]
  fallas: string[]
  guardar: (form: FormData) => Promise<ResultadoAccion>
}

/** Lo elegido en «Quién y con qué» de cada renglón. */
type Seleccion = Record<string, { personas: string[]; activos: string[] }>

export function ParteDiarioCliente({
  obraId, actividades, partes, personas, hoy, registrosHH, resumen, gente, equipos, activos, fallas, guardar,
}: Props) {
  const telefono = useAnchoVentana() < 768
  const [dia, setDia] = useState(hoy)
  const renglones = useMemo(() => renglonesDelParte(actividades), [actividades])
  const resumenDe = useMemo(() => new Map(resumen.map((r) => [r.actividad_id, r])), [resumen])
  const chips = useMemo(() => chipsDeGente(personas, registrosHH, dia), [personas, registrosHH, dia])

  // LO YA CARGADO ESE DÍA, por renglón: el input arranca con eso y guardar lo corrige, no lo duplica.
  const cargado = useMemo(() => {
    const delDia = partes.filter((p) => p.fecha === dia)
    const porAct = new Map<string, { hecho: number | null; personas: string[]; activos: string[] }>()
    for (const p of delDia) {
      const prev = porAct.get(p.actividad_id) ?? { hecho: null, personas: [], activos: [] }
      const h = p.cantidad ?? p.avance_pct
      prev.hecho = h == null ? prev.hecho : (prev.hecho ?? 0) + h
      for (const g of gente) if (g.ejecucion_id === p.id && !prev.personas.includes(g.persona_id)) prev.personas.push(g.persona_id)
      for (const e of equipos) if (e.ejecucion_id === p.id && e.activo_id && !prev.activos.includes(e.activo_id)) prev.activos.push(e.activo_id)
      porAct.set(p.actividad_id, prev)
    }
    return porAct
  }, [partes, gente, equipos, dia])

  // El formulario se remonta por día (`key`): lo tipeado para el lunes no se arrastra al martes.
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="parte-diario">
      {!telefono && (
        <SubNavTrabajo obraId={obraId} sub="parte" derecha={<NavFecha dia={dia} hoy={hoy} cambiar={setDia} />} />
      )}
      {telefono && <SubNavTrabajo obraId={obraId} sub="parte" />}
      {fallas.length > 0 && (
        <div data-testid="parte-lectura-fallida" style={{ padding: '10px 30px 0', fontSize: '12.5px', color: C.neg }}>
          No se pudo leer parte del parte: {fallas.join(' · ')}
        </div>
      )}
      <Formulario
        key={dia} obraId={obraId} dia={dia} hoy={hoy} cambiarDia={setDia} telefono={telefono}
        renglones={renglones} resumenDe={resumenDe} chips={chips} activos={activos} personas={personas}
        cargado={cargado} guardar={guardar}
      />
    </div>
  )
}

/** ‹ lunes 07/09/2026 › — mono, en la banda. La flecha de adelante muere en hoy: un parte de mañana no es un hecho. */
function NavFecha({ dia, hoy, cambiar }: { dia: string; hoy: string; cambiar: (d: string) => void }) {
  const flecha: CSSProperties = {
    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: C.tintaSuave,
    padding: '0 2px', fontFamily: 'inherit', lineHeight: 1,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12.5px', color: C.tintaSuave }}>
      <button type="button" aria-label="Día anterior" data-testid="dia-anterior" style={flecha}
        onClick={() => cambiar(correr(dia, -1))}>‹</button>
      <label style={{ position: 'relative', display: 'inline-flex' }}>
        <span data-testid="parte-fecha" style={{ fontFamily: MONO, color: C.tinta, fontWeight: 500 }}>{fechaLarga(dia)}</span>
        <input type="date" value={dia} max={hoy} aria-label="Jornada del parte" data-testid="dia-ejecucion"
          onChange={(e) => e.target.value && cambiar(e.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
      </label>
      <button type="button" aria-label="Día siguiente" data-testid="dia-siguiente" disabled={dia >= hoy}
        style={{ ...flecha, color: dia >= hoy ? C.bordeFuerte : C.tintaSuave }}
        onClick={() => cambiar(correr(dia, 1))}>›</button>
    </div>
  )
}

function Formulario({
  obraId, dia, hoy, cambiarDia, telefono, renglones, resumenDe, chips, activos, personas, cargado, guardar,
}: {
  obraId: string
  dia: string
  hoy: string
  cambiarDia: (d: string) => void
  telefono: boolean
  renglones: Actividad[]
  resumenDe: Map<string, ResumenPartes>
  chips: ReturnType<typeof chipsDeGente>
  activos: ActivoEnObra[]
  personas: Persona[]
  cargado: Map<string, { hecho: number | null; personas: string[]; activos: string[] }>
  guardar: (form: FormData) => Promise<ResultadoAccion>
}) {
  const [sel, setSel] = useState<Seleccion>(() => {
    const s: Seleccion = {}
    for (const r of renglones) {
      const c = cargado.get(r.id)
      s[r.id] = { personas: c?.personas ?? [], activos: c?.activos ?? [] }
    }
    return s
  })
  const [abierto, setAbierto] = useState<string | null>(null)
  const [destino, setDestino] = useState<DestinoNovedad | null>(null)
  const [horas, setHoras] = useState<Record<string, string>>({})
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_p, datos) => guardar(datos), null)

  const usados = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const [id, s] of Object.entries(sel)) m.set(id, new Set(s.activos))
    return m
  }, [sel])

  const alternar = (act: string, tipo: 'personas' | 'activos', id: string) => setSel((s) => {
    const fila = s[act] ?? { personas: [], activos: [] }
    const lista = fila[tipo].includes(id) ? fila[tipo].filter((x) => x !== id) : [...fila[tipo], id]
    return { ...s, [act]: { ...fila, [tipo]: lista } }
  })

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(() => ejecutar(new FormData(e.currentTarget)))
  }

  const nombreDe = (id: string) => {
    const p = personas.find((x) => x.id === id)
    return p ? nombreCorto(p.nombre_completo) : '—'
  }
  const activoDe = (id: string) => activos.find((a) => a.id === id)?.nombre ?? '—'

  const camposOcultos = (
    <>
      <input type="hidden" name="fecha" value={dia} />
      {renglones.map((r) => (
        <span key={r.id}>
          <input type="hidden" name={`personas_${r.id}`} value={(sel[r.id]?.personas ?? []).join(',')} />
          <input type="hidden" name={`activos_${r.id}`} value={(sel[r.id]?.activos ?? []).join(',')} />
        </span>
      ))}
    </>
  )

  const resultado = estado != null && (
    <p data-testid={estado.ok ? 'form-ejecucion-ok' : 'form-ejecucion-error'} style={{
      fontSize: '12px', color: estado.ok ? C.pos : C.neg, margin: 0,
    }}>{estado.ok ? estado.mensaje ?? 'Parte guardado.' : estado.error}</p>
  )

  const selector = (act: string) => abierto === act && (
    <div data-testid={`parte-elegir-${act}`} style={{
      position: 'absolute', zIndex: 5, top: '30px', left: 0, minWidth: '240px', maxHeight: '260px', overflowY: 'auto',
      background: C.superficie, border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', padding: '6px 0',
    }}>
      <div style={{ ...EYEBROW, padding: '4px 10px' }}>Personas</div>
      {personas.length === 0 && <div style={{ padding: '4px 10px', fontSize: '12px', color: C.tenue }}>sin plantel asignado</div>}
      {personas.map((p) => (
        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', fontSize: '12.5px', cursor: 'pointer' }}>
          <input type="checkbox" checked={sel[act]?.personas.includes(p.id) ?? false} onChange={() => alternar(act, 'personas', p.id)} />
          {nombreCorto(p.nombre_completo)}
        </label>
      ))}
      <div style={{ ...EYEBROW, padding: '8px 10px 4px' }}>Equipos en la obra</div>
      {activos.length === 0 && <div style={{ padding: '4px 10px', fontSize: '12px', color: C.tenue }}>sin activos ubicados en esta obra</div>}
      {activos.map((a) => (
        <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', fontSize: '12.5px', cursor: 'pointer' }}>
          <input type="checkbox" checked={sel[act]?.activos.includes(a.id) ?? false} onChange={() => alternar(act, 'activos', a.id)} />
          <Ico d={P.equipo} s={13} />{a.nombre}
        </label>
      ))}
      <div style={{ padding: '6px 10px 2px' }}>
        <button type="button" onClick={() => setAbierto(null)} style={{ ...CHIP_26, height: '24px' }}>Listo</button>
      </div>
    </div>
  )

  // ═══════════════════════════════ M08 · TELÉFONO ═══════════════════════════════
  if (telefono) {
    const cuadro: CSSProperties = {
      width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', color: C.tintaSuave, background: C.superficie, cursor: 'pointer',
    }
    const nCargados = renglones.filter((r) => cargado.get(r.id)?.hecho != null).length
    return (
      <form onSubmit={enviar} data-testid="form-ejecucion" style={{ padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {camposOcultos}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" aria-label="Día anterior" data-testid="dia-anterior" style={cuadro} onClick={() => cambiarDia(correr(dia, -1))}>
            <Ico d={P.izquierda} s={14} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div data-testid="parte-fecha" style={{ fontSize: '15px', fontWeight: 600 }}>{fechaCortaDia(dia)}</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>
              {nCargados === 0 ? 'sin parte cargado' : `${nCargados} ${nCargados === 1 ? 'frente' : 'frentes'} con parte`}
            </div>
          </div>
          <button type="button" aria-label="Día siguiente" data-testid="dia-siguiente" disabled={dia >= hoy}
            style={{ ...cuadro, color: dia >= hoy ? C.bordeFuerte : C.tintaSuave }} onClick={() => cambiarDia(correr(dia, 1))}>
            <Ico d={P.derecha} s={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
            <div style={EYEBROW}>Frentes en curso</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{renglones.length}</div>
          </div>
          {renglones.length === 0 && <div style={{ fontSize: '12.5px', color: C.tenue, padding: '8px 0' }}>sin frentes en curso</div>}
          {renglones.map((r, i) => {
            const bloq = estaBloqueada(r)
            const quien = (sel[r.id]?.personas ?? []).map(nombreDe).join(', ')
            return (
              <div key={r.id} data-testid={`parte-renglon-${r.id}`} style={{
                minHeight: '52px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px',
                borderBottom: i === renglones.length - 1 ? 'none' : `1px solid ${C.borde}`, position: 'relative',
              }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}
                  onClick={() => !bloq && setAbierto((v) => (v === r.id ? null : r.id))}>
                  <div>{r.nombre}{bloq && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: C.neg, fontWeight: 500, marginLeft: '6px' }}>
                      <Ico d={P.bloqueo} s={11} />bloqueada
                    </span>
                  )}</div>
                  <div style={{ fontSize: '12px', color: C.tintaSuave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bajadaHecho(r)}{quien && ` · ${quien}`}
                  </div>
                </div>
                {bloq
                  ? <span style={{ fontSize: '12px', color: C.tenue, fontStyle: 'italic' }}>no se registra</span>
                  : (
                    <div style={{
                      height: '36px', width: '84px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                      padding: '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontFamily: MONO, fontSize: '13px',
                      flexShrink: 0, gap: '4px',
                    }}>
                      <input name={`hecho_${r.id}`} type="text" inputMode="decimal" data-testid={`parte-hecho-${r.id}`}
                        defaultValue={cargado.get(r.id)?.hecho ?? ''} aria-label={`Hecho hoy en ${r.nombre}`}
                        style={{ width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', textAlign: 'right' }} />
                      <span style={{ color: C.tenue, flexShrink: 0 }}>{unidadDelInput(r)}</span>
                    </div>
                    )}
                {selector(r.id)}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
            <div style={EYEBROW}>Gente</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{resumenGente(chips, false)}</div>
          </div>
          {chips.length === 0 && <div data-testid="parte-sin-plantel" style={{ fontSize: '12.5px', color: C.tenue, padding: '8px 0' }}>Sin personas asignadas a esta obra</div>}
          {chips.map((c, i) => {
            const p = personas.find((x) => x.id === c.id)
            return (
              <div key={c.id} style={{
                minHeight: '56px', display: 'flex', alignItems: 'center', gap: '10px',
                borderBottom: i === chips.length - 1 ? 'none' : `1px solid ${C.borde}`,
              }}>
                <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.persona} s={14} /></span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '14px' }}>{c.nombre}</div>
                  <div style={{ fontSize: '12px', color: C.tintaSuave }}>{p?.categoria ?? p?.especialidad ?? 'sin categoría'}</div>
                </div>
                {c.estado === 'ausente'
                  ? <span style={{ fontSize: '12px', color: C.tintaSuave }}>ausente</span>
                  : (
                    <div style={{
                      height: '36px', width: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${c.estado === 'sin_marcar' && !horas[c.id] ? C.warn : C.bordeFuerte}`,
                      borderRadius: '6px', fontFamily: MONO, fontSize: '13px',
                    }}>
                      <input name={`hh_${c.id}`} type="text" inputMode="decimal" aria-label={`Horas de ${c.nombre}`}
                        value={horas[c.id] ?? (c.horas != null ? String(c.horas).replace('.', ',') : '')}
                        placeholder={c.estado === 'sin_marcar' ? '—' : ''}
                        onChange={(e) => setHoras((h) => ({ ...h, [c.id]: e.target.value }))}
                        style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', font: 'inherit', textAlign: 'center' }} />
                    </div>
                    )}
              </div>
            )
          })}
        </div>

        <Novedades destino={destino} setDestino={setDestino} renglones={renglones} />
        {resultado}

        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie,
          borderTop: `1px solid ${C.borde}`, zIndex: 10, margin: '0 auto', maxWidth: '430px',
        }}>
          <button type="submit" disabled={pendiente} data-testid="form-ejecucion-enviar" style={{
            width: '100%', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            borderRadius: '6px', background: C.marca, color: C.grafito, fontSize: '14px', fontWeight: 600, border: 'none',
            fontFamily: 'inherit', cursor: 'pointer',
          }}><Ico d={P.ok} s={15} />{pendiente ? 'Registrando…' : 'Registrar el parte'}</button>
        </div>
      </form>
    )
  }

  // ═══════════════════════════════ 06 · ESCRITORIO ═══════════════════════════════
  return (
    <form onSubmit={enviar} data-testid="form-ejecucion" style={{
      padding: '22px 30px 30px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '52px', alignItems: 'start',
    }}>
      {camposOcultos}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Qué se hizo hoy</div>
            <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>un renglón por frente en curso</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: COLUMNAS, gap: '20px', height: '32px', alignItems: 'center',
              borderBottom: `1px solid ${C.borde}`, ...EYEBROW,
            }}>
              <div>Tarea</div><div>Hecho hoy</div><div>Acumulado</div><div>% ítem</div><div>Quién y con qué</div>
            </div>
            {renglones.length === 0 && (
              <div data-testid="parte-sin-frentes" style={{ padding: '16px 0', fontSize: '12.5px', color: C.tenue }}>
                sin frentes en curso
              </div>
            )}
            {renglones.map((r, i) => {
              const bloq = estaBloqueada(r)
              const acum = celdaAcumulado(r)
              const ruta = rutaDeTarea(r)
              const manual = r.metodo_avance !== 'cantidad'
              const ultimo = i === renglones.length - 1
              return (
                <div key={r.id} data-testid={`parte-renglon-${r.id}`} style={{
                  display: 'grid', gridTemplateColumns: COLUMNAS, gap: '20px', minHeight: '60px', alignItems: 'center',
                  borderBottom: ultimo ? 'none' : `1px solid ${C.borde}`, fontSize: '13.5px',
                  ...(bloq ? { borderLeft: `2px solid ${C.neg}`, paddingLeft: '12px', marginLeft: '-12px' } : {}),
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
                    {ruta && <div style={{ fontSize: '11.5px', color: C.tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ruta}</div>}
                  </div>
                  {bloq
                    ? <div style={{ fontSize: '12.5px', color: C.neg }}>bloqueada</div>
                    : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <input name={`hecho_${r.id}`} type="text" inputMode="decimal" placeholder="—"
                          data-testid={`parte-hecho-${r.id}`} defaultValue={cargado.get(r.id)?.hecho ?? ''}
                          aria-label={`Hecho hoy en ${r.nombre}`} style={INPUT_HECHO} />
                        <span style={{ fontSize: '12.5px', color: manual ? C.warn : C.tintaSuave }}>{unidadDelInput(r)}</span>
                      </div>
                      )}
                  <div style={{ fontSize: '12.5px', color: acum.tono === 'warn' ? C.warn : C.tintaSuave, fontVariantNumeric: 'tabular-nums' }}>
                    {acum.texto}
                  </div>
                  <div style={{ fontSize: '12.5px', color: C.tintaSuave, fontVariantNumeric: 'tabular-nums' }}>
                    {celdaPctItem(r, resumenDe.get(r.id))}
                  </div>
                  <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '8px 0' }}>
                    {(sel[r.id]?.personas ?? []).map((id) => (
                      <button key={id} type="button" style={CHIP_26} title="Quitar" onClick={() => alternar(r.id, 'personas', id)}>
                        {nombreDe(id)}
                      </button>
                    ))}
                    {(sel[r.id]?.activos ?? []).map((id) => (
                      <button key={id} type="button" style={CHIP_26} title="Quitar" onClick={() => alternar(r.id, 'activos', id)}>
                        <Ico d={P.equipo} s={13} />{activoDe(id)}
                      </button>
                    ))}
                    {!bloq && (
                      <button type="button" aria-label="Elegir quién y con qué" data-testid={`parte-mas-${r.id}`}
                        onClick={() => setAbierto((v) => (v === r.id ? null : r.id))}
                        style={{ ...CHIP_26, width: '26px', padding: 0, justifyContent: 'center', border: `1px dashed ${C.bordeFuerte}`, color: C.tenue }}>
                        <Ico d={P.mas} s={13} />
                      </button>
                    )}
                    {selector(r.id)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Quién vino</div>
            <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{resumenGente(chips)}</div>
          </div>
          {chips.length === 0 && <div data-testid="parte-sin-plantel" style={{ fontSize: '12.5px', color: C.tenue }}>Sin personas asignadas a esta obra</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {chips.map((c) => {
              const editando = horas[c.id] !== undefined
              const sinMarcar = c.estado === 'sin_marcar' && !horas[c.id]
              const color = sinMarcar ? C.warn : c.estado === 'ausente' ? C.tintaSuave : C.tinta
              return (
                <label key={c.id} data-testid={`parte-gente-${c.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: '9px', height: '38px', padding: '0 13px',
                  border: `1px solid ${sinMarcar ? C.warn : C.borde}`, borderRadius: '6px', fontSize: '13.5px', color,
                  cursor: c.estado === 'ausente' ? 'default' : 'text',
                }}>
                  {c.nombre}
                  {c.estado === 'ausente'
                    ? <span style={{ fontSize: '12.5px' }}>ausente</span>
                    : editando || c.estado === 'sin_marcar'
                      ? (
                        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px', fontSize: '12.5px', color: sinMarcar ? C.warn : C.tintaSuave }}>
                          <input name={`hh_${c.id}`} type="text" inputMode="decimal" placeholder="sin marcar"
                            aria-label={`Horas de ${c.nombre}`} value={horas[c.id] ?? ''}
                            onChange={(e) => setHoras((h) => ({ ...h, [c.id]: e.target.value }))}
                            style={{
                              width: sinMarcar ? '68px' : '34px', border: 'none', outline: 'none', background: 'transparent',
                              font: 'inherit', fontFamily: MONO, color: 'inherit', padding: 0,
                            }} />
                          {!sinMarcar && 'hs'}
                        </span>
                        )
                      : <span style={{ color: C.tintaSuave, fontSize: '12.5px' }}>{textoHoras(c.horas ?? 0)}</span>}
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: '26px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          <div style={EYEBROW}>Equipos en la obra hoy</div>
          {activos.length === 0 && <div data-testid="parte-sin-activos" style={{ fontSize: '12.5px', color: C.tenue }}>sin activos ubicados en esta obra</div>}
          {activos.map((a, i) => (
            <div key={a.id} data-testid={`parte-activo-${a.id}`} style={{
              display: 'flex', alignItems: 'center', gap: '8px', minHeight: '30px', fontSize: '13.5px',
              borderBottom: i === activos.length - 1 ? 'none' : `1px solid ${C.bordeLista}`,
            }}>
              <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.equipo} s={14} /></span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
              <span style={{ fontSize: '12.5px', color: C.tintaSuave, whiteSpace: 'nowrap' }}>{usoDelActivo(a.id, usados)}</span>
            </div>
          ))}
        </div>
        <Novedades destino={destino} setDestino={setDestino} renglones={renglones} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <button type="submit" disabled={pendiente} data-testid="form-ejecucion-enviar" style={{
            height: '38px', border: 0, borderRadius: '6px', background: C.marca, color: C.grafito, font: 'inherit',
            fontSize: '13.5px', fontWeight: 600, cursor: 'pointer',
          }}>{pendiente ? 'Guardando…' : 'Guardar el parte'}</button>
          {resultado}
        </div>
      </aside>
    </form>
  )
}

/** «Novedades del día»: el textarea de 72 px y los tres destinos. Impedimento y Pedido piden lo que sus
 *  acciones exigen —la base rechaza un impedimento sin responsable y un pedido sin material—. */
function Novedades({ destino, setDestino, renglones }: {
  destino: DestinoNovedad | null
  setDestino: (d: DestinoNovedad | null) => void
  renglones: Actividad[]
}) {
  const campo: CSSProperties = {
    boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 9px', border: `1px solid ${C.borde}`,
    borderRadius: '6px', font: 'inherit', fontSize: '12.5px', background: C.superficie, color: C.tinta,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
      <div style={EYEBROW}>Novedades del día</div>
      <textarea name="novedad" placeholder="Lo que pasó y no entra en un número" maxLength={1000}
        data-testid="parte-novedad" aria-label="Novedades del día" style={{
          boxSizing: 'border-box', width: '100%', height: '72px', padding: '10px', border: `1px solid ${C.bordeFuerte}`,
          borderRadius: '6px', font: 'inherit', fontSize: '13px', resize: 'none', background: C.superficie, color: C.tinta,
        }} />
      <input type="hidden" name="novedad_destino" value={destino ?? ''} />
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {DESTINOS_NOVEDAD.map((d) => {
          const activo = destino === d
          return (
            <button key={d} type="button" data-testid={`parte-destino-${d}`} aria-pressed={activo}
              onClick={() => setDestino(activo ? null : d)} style={{
                ...CHIP_26, border: `1px solid ${activo ? C.grafito : C.borde}`,
                background: activo ? C.grafito : C.superficie, color: activo ? C.superficie : C.tintaMedia,
              }}>{DESTINO_LABEL[d]}</button>
          )
        })}
      </div>
      {destino && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} data-testid={`parte-novedad-${destino}`}>
          <select name="novedad_actividad" aria-label="Sobre qué tarea" defaultValue={renglones[0]?.id ?? ''} style={campo}>
            {renglones.length === 0 && <option value="">sin frentes en curso</option>}
            {renglones.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          {destino === 'impedimento' && (
            <>
              <select name="impedimento_tipo" defaultValue="material" aria-label="Tipo de impedimento" style={campo}>
                {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
              </select>
              <input name="impedimento_responsable" maxLength={120} placeholder="Quién lo resuelve" style={campo} aria-label="Quién lo resuelve" />
              <input type="date" name="impedimento_compromiso" aria-label="Para cuándo" style={campo} />
            </>
          )}
          {destino === 'pedido' && (
            <>
              <input name="pedido_material" maxLength={160} placeholder="Qué material" style={campo} aria-label="Qué material" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <input name="pedido_cantidad" inputMode="decimal" placeholder="Cantidad" style={campo} aria-label="Cantidad" />
                <input name="pedido_unidad" maxLength={24} placeholder="Unidad" style={campo} aria-label="Unidad" />
                <select name="pedido_urgencia" defaultValue="semana" aria-label="Urgencia" style={campo}>
                  <option value="hoy">Hoy</option>
                  <option value="semana">Esta semana</option>
                  <option value="cuando_se_pueda">Cuando se pueda</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
