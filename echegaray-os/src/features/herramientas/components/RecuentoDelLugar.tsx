'use client'

// RECUENTO DEL LUGAR — M05/D04 «Control físico». UNA pieza para las dos caras: el teléfono la muestra en
// `/campo/herramientas/recuento?en=` y la computadora en el panel al costado de Ubicaciones
// (`PanelRecuento`). Mismo nombre, mismos botones, misma regla.
//
// Lo esperado es lo que la base dice que hay en el lugar; el que cuenta escribe lo que ve. «Todo bien»
// iguala todo a lo esperado. Al final, dos salidas: «Ajustar el inventario a lo contado» (cada diferencia
// corrige la existencia por `ajustar_existencia`, con quién y cuándo) o «Guardar sin ajustar» (queda
// como evidencia, el inventario no se toca). Una línea en 0 nunca se ajusta: es una baja o un movimiento.
// Los campos empiezan VACÍOS: un recuento que ya viene lleno es uno que nadie hizo.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  lineasParaEnviar, resumenRecuento, sePuedeCerrar, textoCierre, textoResumen, todoBien, validarCantidad,
  type CierreRecuento, type ItemRecuento, type LineaEnCurso,
} from '../logica/recuento'
import { registrarRecuentoAction } from '../services/acciones-recuento'
import { MONO, V, botonPrimarioGrande, botonSecundarioGrande, eyebrow } from './estilo'
import { diaMes } from './formato'
import { IcoRodado } from './iconos'
import { primarioTelefono, secundarioTelefono } from './campo/MarcoTelefono'

export interface PropsRecuento {
  ubicacionId: string
  /** «OB-0012 · PISOS» · «Taller». */
  rotulo: string
  items: ItemRecuento[]
  /** La tabla del recuento todavía no existe en la base. */
  sinBase: boolean
  /** Alguien dejó un recuento abierto acá: se retoma (la base devuelve el mismo). */
  abiertoDesde?: string | null
  variante: 'telefono' | 'escritorio'
  /** Teléfono: adónde ir al terminar. */
  volverA: string
  /** Escritorio (`PanelRecuento`): en vez de navegar, cerrar el panel con el aviso. */
  onVolver?: (texto: string) => void
}

export function RecuentoDelLugar({ ubicacionId, rotulo, items, sinBase, abiertoDesde, variante, volverA, onVolver }: PropsRecuento) {
  const router = useRouter()
  const tel = variante === 'telefono'
  const [lineas, setLineas] = useState<LineaEnCurso[]>(() => items.map((i) => ({ activoId: i.id, esperado: i.esperado, texto: '' })))
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState<'ajustar' | 'guardar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ cierre: CierreRecuento; aplicado: boolean } | null>(null)

  const r = resumenRecuento(lineas)
  const listo = sePuedeCerrar(r) && !sinBase
  const porId = new Map(items.map((i) => [i.id, i]))
  const escribir = (id: string, texto: string) => setLineas((ls) => ls.map((l) => (l.activoId === id ? { ...l, texto } : l)))
  const anotar = (id: string, nota: string) => setLineas((ls) => ls.map((l) => (l.activoId === id ? { ...l, nota } : l)))

  async function cerrar(aplicar: boolean) {
    if (!listo || enviando) return
    setEnviando(aplicar ? 'ajustar' : 'guardar')
    setError(null)
    const res = await registrarRecuentoAction({ ubicacion: ubicacionId, lineas: lineasParaEnviar(lineas), aplicar, observaciones: obs })
    setEnviando(null)
    if (!res.ok) return setError(res.error)
    setHecho({ cierre: res.dato, aplicado: aplicar })
    router.refresh()
  }

  const volver = () => {
    if (hecho && onVolver) return onVolver(textoCierre(hecho.cierre, hecho.aplicado))
    router.push(volverA)
    router.refresh()
  }

  const primario = tel ? primarioTelefono : botonPrimarioGrande
  const secundario = tel ? secundarioTelefono : botonSecundarioGrande
  const altoCampo = tel ? 52 : 38
  const pie = tel
    ? { position: 'sticky' as const, bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column' as const, gap: 8 }
    : { marginTop: 'auto', paddingTop: 18, display: 'flex', flexDirection: 'column' as const, gap: 8 }

  if (hecho) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="recuento-hecho">
          <h1 style={{ fontSize: '19px', fontWeight: 600 }}>{hecho.aplicado ? 'Inventario ajustado a lo contado' : 'Recuento guardado sin ajustar'}</h1>
          <div style={{ fontSize: '14px', color: V.tintaSuave, lineHeight: 1.5 }}>{textoCierre(hecho.cierre, hecho.aplicado)}</div>
          {!hecho.aplicado && hecho.cierre.con_diferencia > 0 && (
            <div style={{ fontSize: '13px', color: V.apagado, lineHeight: 1.5 }}>Las diferencias quedaron en el historial de cada activo como evidencia. El inventario sigue diciendo lo de antes.</div>
          )}
        </div>
        <div className="bg-surface" style={pie}>
          <button type="button" onClick={volver} style={{ ...primario, width: '100%' }} data-testid="volver-recuento">Volver</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tel && <h1 style={{ fontSize: '19px', fontWeight: 600 }}>{rotulo}</h1>}
        <div style={{ fontSize: '13px', color: V.apagado }}>
          Lo esperado es lo que la base dice que hay acá. Escribí lo que contás; lo que no cuentes queda sin contar.
        </div>
      </div>

      {sinBase && (
        <div role="alert" style={{ fontSize: '13px', color: V.warn, lineHeight: 1.5 }} data-testid="recuento-sin-base">
          Falta aplicar la migración 20260923T1700 del recuento: todavía no se puede registrar. El resto del módulo anda igual.
        </div>
      )}
      {abiertoDesde && !sinBase && (
        <div style={{ fontSize: '13px', color: V.apagado, lineHeight: 1.5 }} data-testid="recuento-abierto">
          Hay un recuento de este lugar abierto desde el {diaMes(abiertoDesde)} que nadie cerró: lo que cargues ahora lo retoma y lo cierra.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: '13.5px', fontWeight: 500 }} data-testid="resumen-recuento">{textoResumen(r)}</span>
        <button type="button" onClick={() => setLineas(todoBien)} disabled={items.length === 0} style={{ ...secundario, height: tel ? 40 : 32, padding: '0 14px' }} data-testid="todo-bien">
          Todo bien
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="lineas-recuento">
        {items.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado }}>No hay nada registrado en este lugar: no hay qué contar.</div>}
        {lineas.map((l, i) => {
          const it = porId.get(l.activoId)!
          const c = validarCantidad(l.texto)
          const dif = c.ok && c.valor != null ? c.valor - l.esperado : null
          const enCero = c.ok && c.valor === 0
          const tono = !c.ok ? V.neg : dif == null ? V.apagado : dif === 0 ? V.pos : V.warn
          return (
            <div key={l.activoId} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: tel ? '12px 0' : '10px 0', borderBottom: i < lineas.length - 1 ? `1px solid ${V.linea}` : undefined }} data-testid="linea-recuento">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label htmlFor={`contado-${l.activoId}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: tel ? '15px' : '13.5px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {it.clase === 'rodado' && <IcoRodado tam={14} color={V.apagado} />}
                    <span className="truncate">{it.nombre}</span>
                  </span>
                  <span style={{ fontSize: '12.5px', color: V.apagado, display: 'flex', gap: 8 }}>
                    <span style={{ fontFamily: MONO }}>{it.patente ?? it.codigo}</span>
                    <span>esperado {l.esperado}</span>
                    {dif != null && dif !== 0 && <span style={{ color: tono, fontWeight: 500 }} data-testid="diferencia">{dif > 0 ? `+${dif}` : dif}</span>}
                  </span>
                </label>
                <input
                  id={`contado-${l.activoId}`} inputMode="numeric" autoComplete="off" value={l.texto} placeholder="–"
                  onChange={(e) => escribir(l.activoId, e.target.value)} aria-label={`Contado de ${it.nombre}`} data-testid="contado"
                  style={{ width: tel ? 96 : 84, height: altoCampo, textAlign: 'center', border: `1px solid ${!c.ok ? V.neg : dif != null && dif !== 0 ? V.warn : V.grafito}`, borderRadius: 6, fontSize: tel ? '22px' : '17px', fontWeight: 600, letterSpacing: '-.01em', color: V.tinta, flexShrink: 0 }}
                />
              </div>
              {!c.ok && <div role="alert" style={{ fontSize: '12.5px', color: V.neg }}>{c.error}</div>}
              {enCero && (
                <div style={{ fontSize: '12.5px', color: V.warn, lineHeight: 1.5 }} data-testid="aviso-cero">
                  En 0 no se ajusta: si no está, es una baja (robada, perdida, descartada) o un movimiento. Queda registrado en el recuento.
                </div>
              )}
              {dif != null && dif !== 0 && (
                <input
                  value={l.nota ?? ''} onChange={(e) => anotar(l.activoId, e.target.value)} maxLength={400} placeholder="Nota · opcional (qué pasó)"
                  aria-label={`Nota de ${it.nombre}`} data-testid="nota-linea"
                  style={{ height: tel ? 44 : 34, padding: '0 12px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13.5px', color: V.tinta }}
                />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="obs-recuento" style={eyebrow}>Observaciones · opcional</label>
        <textarea id="obs-recuento" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} rows={2} data-testid="observaciones-recuento"
          style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: 12, fontSize: tel ? '15px' : '13.5px', minHeight: 56, color: V.tinta }} />
      </div>

      {error && <div role="alert" style={{ fontSize: '13px', color: V.neg, lineHeight: 1.5 }} data-testid="error-recuento">{error}</div>}

      <div className="bg-surface" style={pie}>
        <div style={{ fontSize: '12.5px', color: r.conDiferencia ? V.warn : V.apagado, textAlign: tel ? 'center' : 'left' }}>
          {r.contados === 0 ? 'Contá al menos uno para cerrar.' : r.conDiferencia === 0 ? 'Sin diferencias: cerrar deja todo como está.' : `${r.conDiferencia} con diferencia${r.faltan ? ` · faltan ${r.faltan}` : ''}${r.sobran ? ` · sobran ${r.sobran}` : ''}${r.enCero.length ? ` · ${r.enCero.length} en 0 (no se ajusta)` : ''}`}
        </div>
        <button type="button" onClick={() => cerrar(true)} disabled={!listo || !!enviando} data-testid="cerrar-ajustando"
          style={{ ...primario, width: '100%', opacity: listo ? 1 : 0.45 }}>
          {enviando === 'ajustar' ? 'Ajustando…' : 'Ajustar el inventario a lo contado'}
        </button>
        <button type="button" onClick={() => cerrar(false)} disabled={!listo || !!enviando} data-testid="cerrar-sin-ajustar"
          style={{ ...secundario, width: '100%', flex: '0 0 auto', opacity: listo ? 1 : 0.45 }}>
          {enviando === 'guardar' ? 'Guardando…' : 'Guardar sin ajustar'}
        </button>
      </div>
    </>
  )
}
