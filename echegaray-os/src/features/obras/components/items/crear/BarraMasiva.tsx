'use client'

// C09 · MC10 — ACCIONES MASIVAS · VARIAS A LA VEZ. Porte literal de `C09.html` y `MC10.html`.
//
//   escritorio  la barra grafito de 44 (radio 8, `padding:0 12px`, 12,5 blanco): «6 seleccionadas» 600 y los
//               siete botones de 30 con borde blanco al 25 % —Mover a… · Cuadrilla · Correr fechas · Método ·
//               Ponderación · Responsable · Archivar— y «✕ Esc» al 70 % a la derecha
//               debajo del árbol, la caja de la acción (`margin-top:16px; padding:14px 16px`, borde line, radio
//               8, 13px): el rótulo 600, los chips de 32, la aclaración muted y «Aplicar a N» a la derecha
//   teléfono    «6 seleccionadas» 14/600 + «✕ Salir» 12,5 muted; el panel grafito fijo abajo (`padding:12px
//               16px 18px`, grilla de 2 columnas, botones de 44 con ícono 13) y, con una acción abierta, sus
//               controles arriba de la grilla
//
// El resultado que se informa es el EFECTO —cuántas quedaron escritas— y no cuántas se tildaron.

import { useEffect, useState, type ReactNode } from 'react'
import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Chip, ESTILO_PRIMARIA_32, Resultado, estiloControl } from './Piezas'
import { CORRIMIENTOS } from '../../../services/estructura'
import type { Persona } from '../../../types'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

export type AccionMasiva = 'mover' | 'cuadrilla' | 'fechas' | 'metodo' | 'ponderacion' | 'responsable' | 'archivar'
const ACCIONES: { id: AccionMasiva; label: string; d: ReactNode }[] = [
  { id: 'mover', label: 'Mover a…', d: P.flecha },
  { id: 'cuadrilla', label: 'Cuadrilla', d: P.cuadrilla },
  { id: 'fechas', label: 'Correr fechas', d: P.fecha },
  { id: 'metodo', label: 'Método', d: P.paso },
  { id: 'ponderacion', label: 'Ponderación', d: P.avance },
  { id: 'responsable', label: 'Responsable', d: P.persona },
  { id: 'archivar', label: 'Archivar', d: P.cerrar },
]

export interface DatosMasivos {
  contenedores: { id: string; nombre: string }[]
  cuadrillas: { id: string; nombre: string }[]
  personas: Persona[]
}

/** LA BARRA (escritorio) y la cabecera de la selección (teléfono). Sólo elige la acción. */
export function BarraMasiva({ n, accion, setAccion, alSalir, resultado }: {
  n: number
  accion: AccionMasiva | null
  setAccion: (a: AccionMasiva | null) => void
  alSalir: () => void
  resultado: { ok: boolean; texto: string } | null
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') alSalir() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [alSalir])
  return (
    <>
      <div className="hidden md:flex" data-testid="barra-masiva" style={{ minHeight: '44px', alignItems: 'center', gap: '8px', padding: '0 12px', margin: '12px 20px 8px', background: C.grafito, color: C.superficie, borderRadius: '8px', fontSize: '12.5px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, marginRight: '8px' }} data-testid="masiva-conteo">{n} {n === 1 ? 'seleccionada' : 'seleccionadas'}</span>
        {ACCIONES.map((a) => (
          <button key={a.id} type="button" onClick={() => setAccion(accion === a.id ? null : a.id)} data-testid={`masiva-${a.id}`} aria-pressed={accion === a.id}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0 10px', height: '30px', borderRadius: '6px', border: `1px solid ${accion === a.id ? C.superficie : C.sobreGrafitoBorde}`, background: 'transparent', color: C.superficie, font: 'inherit', cursor: 'pointer' }}>
            <Ico d={a.d} s={12} />{a.label}
          </button>
        ))}
        <button type="button" onClick={alSalir} data-testid="masiva-salir" style={{ marginLeft: 'auto', color: C.sobreGrafitoTenue, display: 'inline-flex', gap: '5px', alignItems: 'center', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}>
          <Ico d={P.cerrar} s={12} />Esc
        </button>
      </div>
      {resultado && <div className="hidden md:block" style={{ margin: '0 20px 8px' }}><Resultado r={resultado} /></div>}

      <div className="flex md:hidden" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>{n} {n === 1 ? 'seleccionada' : 'seleccionadas'}</div>
        <button type="button" onClick={alSalir} data-testid="masiva-salir-telefono" style={{ font: 'inherit', fontSize: '12.5px', color: C.tintaSuave, display: 'inline-flex', gap: '5px', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
          <Ico d={P.cerrar} s={12} />Salir
        </button>
      </div>
      {resultado && <div className="md:hidden" style={{ margin: '0 16px 8px' }}><Resultado r={resultado} /></div>}
    </>
  )
}

/** LA CAJA DE LA ACCIÓN (C09, debajo del árbol) Y EL PANEL GRAFITO DEL TELÉFONO (MC10). Es la que escribe. */
export function CajaMasiva({ ids, datos, aplicar, alAplicado, accion, setAccion }: {
  ids: string[]
  datos: DatosMasivos
  aplicar: AccionFormulario
  alAplicado: (r: { ok: boolean; texto: string }) => void
  accion: AccionMasiva | null
  setAccion: (a: AccionMasiva | null) => void
}) {
  const [valor, setValor] = useState('')
  const [dias, setDias] = useState<number>(5)
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = ids.length

  const enviar = async () => {
    if (!accion || pendiente || n === 0) return
    setPendiente(true)
    const form = new FormData()
    for (const id of ids) form.append('id', id)
    form.set('accion', accion)
    if (accion === 'mover') form.set('padre_id', valor)
    if (accion === 'cuadrilla') form.set('cuadrilla_id', valor)
    if (accion === 'fechas') form.set('dias', String(dias))
    if (accion === 'metodo') form.set('metodo', valor || 'cantidad')
    if (accion === 'ponderacion') form.set('ponderacion', valor)
    if (accion === 'responsable') form.set('responsable_id', valor)
    const r = await aplicar(form)
    setPendiente(false)
    if (r.ok) { setError(null); setAccion(null); setValor(''); alAplicado({ ok: true, texto: r.mensaje ?? 'Aplicado.' }) }
    else setError(r.error)
  }
  const rotulo = ACCIONES.find((a) => a.id === accion)?.label ?? ''
  const aclaracion = accion === 'fechas' ? `${n} ${n === 1 ? 'tarea' : 'tareas'} · sólo días hábiles · la línea base no se toca`
    : accion === 'metodo' ? 'cantidad exige unidad y cantidad objetivo · los contenedores quedan afuera'
      : accion === 'ponderacion' ? 'el mismo peso para cada una · vacío = sin cargar'
        : accion === 'mover' ? 'adentro del contenedor elegido, al final'
          : accion === 'archivar' ? 'salen del árbol y de los promedios; la historia queda' : null

  const controles = (alto: 32 | 44, claro: boolean) => {
    const estilo = { ...estiloControl(alto), width: 'auto', minWidth: '200px', color: claro ? C.superficie : C.tinta, background: 'transparent', borderColor: claro ? C.sobreGrafitoBorde : C.bordeFuerte }
    const sel = (opciones: { id: string; nombre: string }[], vacio: string, testid: string) => (
      <select value={valor} onChange={(e) => setValor(e.target.value)} data-testid={testid} style={estilo}>
        <option value="" style={{ color: C.tinta }}>{vacio}</option>
        {opciones.map((o) => <option key={o.id} value={o.id} style={{ color: C.tinta }}>{o.nombre}</option>)}
      </select>
    )
    switch (accion) {
      case 'mover': return sel(datos.contenedores, 'a la raíz (rubro)', 'masiva-mover')
      case 'cuadrilla': return sel(datos.cuadrillas, 'quitar la cuadrilla', 'masiva-cuadrilla')
      case 'responsable': return sel(datos.personas.map((p) => ({ id: p.id, nombre: p.nombre_completo })), 'quitar el responsable', 'masiva-responsable')
      case 'fechas': return <div style={{ display: 'flex', gap: '6px' }}>{CORRIMIENTOS.map((c) => <Chip key={c.id} activo={dias === c.dias} onClick={() => setDias(c.dias)} alto={alto === 44 ? 36 : 32} testid={`correr-${c.id}`}>{c.label}</Chip>)}</div>
      case 'metodo': return <div style={{ display: 'flex', gap: '6px' }}>{(['cantidad', 'pasos', 'manual'] as const).map((m) => <Chip key={m} activo={(valor || 'cantidad') === m} onClick={() => setValor(m)} alto={alto === 44 ? 36 : 32} testid={`metodo-masivo-${m}`}>{m === 'cantidad' ? 'Cantidad' : m === 'pasos' ? 'Pasos' : 'Manual'}</Chip>)}</div>
      case 'ponderacion': return <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="%" aria-label="Ponderación" data-testid="masiva-ponderacion" style={{ ...estiloControl(alto, true), width: '90px', color: claro ? C.superficie : C.tinta, background: 'transparent', borderColor: claro ? C.sobreGrafitoBorde : C.bordeFuerte }} />
      default: return null
    }
  }

  return (
    <>
      {accion && (
        <div className="hidden md:flex" data-testid="caja-masiva" style={{ margin: '16px 20px 30px', alignItems: 'center', gap: '14px', padding: '14px 16px', border: `1px solid ${C.borde}`, borderRadius: '8px', fontSize: '13px', flexWrap: 'wrap', color: C.tinta }}>
          <span style={{ fontWeight: 600 }}>{rotulo}</span>
          {controles(32, false)}
          {aclaracion && <span style={{ color: C.tintaSuave }}>{aclaracion}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {error && <span style={{ fontSize: '12px', color: C.neg }} data-testid="masiva-error">{error}</span>}
            <button type="button" onClick={enviar} disabled={pendiente} data-testid="masiva-aplicar" style={ESTILO_PRIMARIA_32}><Ico d={P.ok} s={13} />{pendiente ? 'Aplicando…' : `Aplicar a ${n}`}</button>
          </span>
        </div>
      )}

      <div className="flex md:hidden" data-testid="panel-masivo-telefono" style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', background: C.grafito, color: C.superficie, padding: '12px 16px 18px', flexDirection: 'column', gap: '8px', zIndex: 25 }}>
        {accion && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{rotulo}</div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none' }}>{controles(44, true)}</div>
            {aclaracion && <div style={{ fontSize: '12px', color: C.sobreGrafitoTenue }}>{aclaracion}</div>}
            {error && <div style={{ fontSize: '12px', color: C.marca }}>{error}</div>}
            <button type="button" onClick={enviar} disabled={pendiente} data-testid="masiva-aplicar-telefono" style={{ font: 'inherit', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px', background: C.marca, color: C.grafito, fontSize: '14px', fontWeight: 600, border: 0, cursor: 'pointer' }}>
              <Ico d={P.ok} s={15} />{pendiente ? 'Aplicando…' : `Aplicar a ${n}`}
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {ACCIONES.filter((a) => a.id !== 'responsable').map((a) => (
            <button key={a.id} type="button" onClick={() => { setAccion(accion === a.id ? null : a.id); setValor('') }} data-testid={`masiva-telefono-${a.id}`} aria-pressed={accion === a.id}
              style={{ font: 'inherit', height: '44px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', border: `1px solid ${accion === a.id ? C.superficie : C.sobreGrafitoBorde}`, borderRadius: '6px', fontSize: '13px', background: 'transparent', color: C.superficie, cursor: 'pointer' }}>
              <Ico d={a.d} s={13} />{a.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
