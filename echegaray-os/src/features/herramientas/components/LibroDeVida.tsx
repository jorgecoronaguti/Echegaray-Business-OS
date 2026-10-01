'use client'

// LIBRO DE VIDA DEL ACTIVO — el estado arriba, lo abierto (en el mecánico, hay que llevarlo) con su botón para
// avanzarlo, el historial de arreglos y lo que cuesta lo cargado. Una pieza para las dos caras: la ficha del
// escritorio (`LibroDeVidaFicha`) y la pantalla del teléfono (`/campo/herramientas/a/<código>/novedad`).
//
// Vale para herramientas, equipos y rodados (20261001T0800): lo que está en el mecánico es lo mismo en los tres.
// El costo es la suma de lo que se cargó, evento por evento: no se reparte ni se estima por unidad.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { admiteArreglo, atrasado, diasFuera, diaMesAnioIso, hoyIso, plazoDias, renglonDeLibro } from '../logica/arreglo'
import {
  NOMBRE_DISPONIBILIDAD, NOMBRE_SITUACION, NOMBRE_TIPO_EVENTO, TONO_DISPONIBILIDAD, abiertos, costoAcumulado, disponibilidadDe, historialEventos, tallerDe,
  type Evento,
} from '../logica/evento'
import type { Activo } from '../types'
import { useHerramientas } from './Espacio'
import { FormularioArreglo } from './FormularioArreglo'
import { FormularioEvento } from './FormularioEvento'
import { V, botonPrimarioGrande, botonSecundario, eyebrow, vacio } from './estilo'
import { pesos } from './formato'
import { numeroAr } from '../logica/verificacion'

const COLOR = { pos: V.pos, warn: V.warn, neg: V.neg } as const

/** Qué formulario está abierto: uno nuevo, o el de un evento (pasa al mecánico, vuelve, o se resolvió sin mecánico). */
type Abierto = { nuevo: 'arreglo' | 'novedad' } | { evento: string; modo: 'mecanico' | 'volvio' | 'hecho' } | null

export function LibroDeVida({ activo, eventos, proveedores, nombres = {}, variante = 'escritorio', onCargado }: {
  activo: Pick<Activo, 'id' | 'estado' | 'nombre' | 'clase' | 'cantidad'>
  /** `null` = la migración todavía no está aplicada. */
  eventos: Evento[] | null
  proveedores: { id: string; nombre: string }[]
  /** Nombre de cada usuario por id: «quién lo llevó» cuando no se escribió otro nombre. */
  nombres?: Record<string, string>
  variante?: 'escritorio' | 'telefono'
  onCargado?: () => void
}) {
  const router = useRouter()
  const tel = variante === 'telefono'
  const hoy = hoyIso()
  const abiertosA = eventos ? abiertos(eventos, activo.id) : []
  const [formulario, setFormulario] = useState<Abierto>(tel && !abiertosA.length ? { nuevo: 'arreglo' } : null)
  const [aviso, setAviso] = useState<string | null>(null)
  if (eventos == null) {
    return <div style={{ fontSize: '12.5px', color: V.tenue }} data-testid="libro-sin-migracion">Falta aplicar la migración 20260930T2300 del libro de vida: todavía no se pueden cargar novedades.</div>
  }
  if (!admiteArreglo(activo) && !abiertosA.length) {
    return <div style={{ fontSize: '12.5px', color: V.tenue }} data-testid="libro-lote">Es un lote: el arreglo se carga por unidad. Para avisar que algo falla, usá «Reportar un problema».</div>
  }
  const nombre = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? null
  const disp = disponibilidadDe(activo, eventos)
  const tono = COLOR[TONO_DISPONIBILIDAD[disp]]
  const historial = historialEventos(eventos, activo.id)
  const costo = costoAcumulado(historial.filter((e) => e.situacion === 'hecho'))
  const cerrar = (t: string) => { setAviso(t); setFormulario(null); router.refresh(); onCargado?.() }
  const fuente = tel ? '15px' : '13px'
  const alto = tel ? 48 : 32
  const comun = { activo: activo.id, clase: activo.clase, proveedores, variante, onHecho: cerrar }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tel ? 16 : 12 }} data-testid="libro-de-vida">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: tel ? '17px' : '14px', fontWeight: 600, color: tono }} data-testid="disponibilidad">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tono, flexShrink: 0 }} />
        {NOMBRE_DISPONIBILIDAD[disp]}
      </div>

      {abiertosA.map((e) => {
        const dias = diasFuera(e, hoy)
        const tarde = atrasado(e, hoy)
        const mio = formulario && 'evento' in formulario && formulario.evento === e.id ? formulario.modo : null
        return (
          <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: tel ? '12px 0' : '8px 0', borderTop: `1px solid ${V.linea}` }} data-testid="evento-abierto">
            <div style={{ fontSize: fuente }}>
              <span style={{ fontWeight: 500 }}>{NOMBRE_TIPO_EVENTO[e.tipo]}</span> · {e.descripcion}
            </div>
            <div style={{ fontSize: tel ? '13px' : '12px', color: V.apagado }} data-testid="arreglo-estado">
              {NOMBRE_SITUACION[e.situacion]}
              {e.ingreso_taller ? ` desde ${diaMesAnioIso(e.ingreso_taller)}` : ` · aviso del ${diaMesAnioIso(e.fecha)}`}
              {dias != null ? ` · ${plazoDias(dias)}` : ''}
              {tallerDe(e, nombre) ? ` · ${tallerDe(e, nombre)}` : ''}
              {e.llevado_por || (e.creado_por && nombres[e.creado_por]) ? ` · lo llevó ${e.llevado_por || nombres[e.creado_por ?? '']}` : ''}
              {e.km != null ? ` · ${numeroAr(e.km)} km` : ''}
              {e.vuelta_estimada && <span style={tarde ? { color: V.warn } : undefined}> · vuelve {diaMesAnioIso(e.vuelta_estimada)}{tarde ? ' (atrasado)' : ''}</span>}
            </div>
            {mio === 'volvio' || mio === 'mecanico' ? (
              <FormularioArreglo {...comun} abierto={e} onCancelar={() => setFormulario(null)} />
            ) : mio === 'hecho' ? (
              <FormularioEvento activo={activo.id} clase={activo.clase} proveedores={proveedores} abierto={e} variante={variante} onHecho={cerrar} onCancelar={() => setFormulario(null)} />
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {e.situacion === 'en_taller' ? (
                  <button type="button" onClick={() => setFormulario({ evento: e.id, modo: 'volvio' })} style={{ ...botonPrimarioGrande, minHeight: alto, height: alto }} data-testid="arreglo-volvio">Ya volvió</button>
                ) : (
                  <>
                    <button type="button" onClick={() => setFormulario({ evento: e.id, modo: 'mecanico' })} style={{ ...botonSecundario, minHeight: alto }} data-testid="arreglo-al-mecanico">Lo llevé al mecánico</button>
                    <button type="button" onClick={() => setFormulario({ evento: e.id, modo: 'hecho' })} style={{ ...botonSecundario, minHeight: alto }} data-testid="avanzar-evento">Ya está resuelto</button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {aviso && <div role="status" style={{ fontSize: fuente, color: V.pos }} data-testid="evento-cargado">{aviso}</div>}

      {formulario && 'nuevo' in formulario ? (
        formulario.nuevo === 'arreglo'
          ? <FormularioArreglo {...comun} onCancelar={tel && !abiertosA.length ? undefined : () => setFormulario(null)} />
          : <FormularioEvento activo={activo.id} clase={activo.clase} proveedores={proveedores} variante={variante} onHecho={cerrar} onCancelar={() => setFormulario(null)} />
      ) : !formulario && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setAviso(null); setFormulario({ nuevo: 'arreglo' }) }} style={{ ...botonSecundario, minHeight: alto }} data-testid="cargar-arreglo">
            Lo llevé al mecánico
          </button>
          <button type="button" onClick={() => { setAviso(null); setFormulario({ nuevo: 'novedad' }) }} style={{ ...botonSecundario, minHeight: alto }} data-testid="cargar-novedad">
            Otra novedad
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${V.linea}`, paddingTop: 10 }}>
        <div style={{ ...eyebrow, display: 'flex', justifyContent: 'space-between' }}>
          <span>Arreglos y trabajos</span>
          <span style={{ textTransform: 'none', letterSpacing: 0 }} data-testid="costo-acumulado">
            {costo.cargados ? `${pesos(costo.total)} en ${costo.cargados} ${costo.cargados === 1 ? 'trabajo con costo' : 'trabajos con costo'}` : 'sin costos cargados'}
          </span>
        </div>
        {historial.length === 0 && <span style={{ ...vacio, fontSize: '12.5px' }}>Sin trabajos cargados.</span>}
        {historial.map((e) => (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', gap: 10, fontSize: tel ? '13px' : '12.5px' }} data-testid="evento-historial">
            <span style={{ color: V.tenue }}>{diaMesAnioIso(e.fecha)}</span>
            <span style={{ color: V.tintaSuave }}>
              {renglonDeLibro(e, {
                nombreTipo: NOMBRE_TIPO_EVENTO[e.tipo], taller: tallerDe(e, nombre), quien: e.creado_por ? nombres[e.creado_por] ?? null : null,
                hoy, pesos, numero: numeroAr,
              })}
              {e.situacion !== 'hecho' ? ` · ${NOMBRE_SITUACION[e.situacion].toLowerCase()}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** En la ficha del escritorio: para todo lo que admite arreglo (una unidad, no dada de baja). */
export function LibroDeVidaFicha({ id }: { id: string }) {
  const { parque } = useHerramientas()
  const a = parque.activoPorId.get(id)
  if (!a || a.estado === 'baja') return null
  const abierto = (parque.eventos ?? []).some((e) => e.activo_id === a.id && e.situacion !== 'hecho')
  // Un lote sin nada abierto no lleva la sección: sería un cartel permanente que no se puede usar.
  if (!admiteArreglo(a) && !abierto) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-libro-de-vida">
      <div style={{ ...eyebrow, paddingTop: 10 }}>Estado y arreglos</div>
      <LibroDeVida activo={a} eventos={parque.eventos ?? null} nombres={parque.nombres} proveedores={(parque.proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))} />
    </div>
  )
}
