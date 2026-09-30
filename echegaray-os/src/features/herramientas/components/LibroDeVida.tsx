'use client'

// LIBRO DE VIDA DEL RODADO — el estado operativo arriba, lo abierto con su botón para avanzarlo, el historial
// y lo que cuesta lo cargado. Una pieza para las dos caras: la ficha del escritorio (`LibroDeVidaFicha`) y la
// pantalla del teléfono (`/campo/herramientas/a/<código>/novedad`).
//
// El costo es la suma de lo que se cargó, evento por evento: no se reparte ni se estima por unidad.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  NOMBRE_DISPONIBILIDAD, NOMBRE_SITUACION, NOMBRE_TIPO_EVENTO, TONO_DISPONIBILIDAD, abiertos, costoAcumulado, disponibilidadDe, historialEventos, tallerDe,
  type Evento,
} from '../logica/evento'
import type { Activo } from '../types'
import { useHerramientas } from './Espacio'
import { FormularioEvento } from './FormularioEvento'
import { V, botonSecundario, eyebrow, vacio } from './estilo'
import { diaMesAnio, pesos } from './formato'
import { numeroAr } from '../logica/verificacion'

const COLOR = { pos: V.pos, warn: V.warn, neg: V.neg } as const

export function LibroDeVida({ activo, eventos, proveedores, variante = 'escritorio', onCargado }: {
  activo: Pick<Activo, 'id' | 'estado' | 'nombre'>
  /** `null` = la migración todavía no está aplicada. */
  eventos: Evento[] | null
  proveedores: { id: string; nombre: string }[]
  variante?: 'escritorio' | 'telefono'
  onCargado?: () => void
}) {
  const router = useRouter()
  const tel = variante === 'telefono'
  const [formulario, setFormulario] = useState<'nuevo' | string | null>(tel ? 'nuevo' : null)
  const [aviso, setAviso] = useState<string | null>(null)
  if (eventos == null) {
    return <div style={{ fontSize: '12.5px', color: V.tenue }} data-testid="libro-sin-migracion">Falta aplicar la migración 20260930T2300 del libro de vida: todavía no se pueden cargar novedades.</div>
  }
  const nombre = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? null
  const disp = disponibilidadDe(activo, eventos)
  const tono = COLOR[TONO_DISPONIBILIDAD[disp]]
  const abiertosA = abiertos(eventos, activo.id)
  const historial = historialEventos(eventos, activo.id)
  const costo = costoAcumulado(historial.filter((e) => e.situacion === 'hecho'))
  const cerrar = (t: string) => { setAviso(t); setFormulario(null); router.refresh(); onCargado?.() }
  const fuente = tel ? '15px' : '13px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tel ? 16 : 12 }} data-testid="libro-de-vida">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: tel ? '17px' : '14px', fontWeight: 600, color: tono }} data-testid="disponibilidad">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tono, flexShrink: 0 }} />
        {NOMBRE_DISPONIBILIDAD[disp]}
      </div>

      {abiertosA.map((e) => (
        <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: tel ? '12px 0' : '8px 0', borderTop: `1px solid ${V.linea}` }} data-testid="evento-abierto">
          <div style={{ fontSize: fuente }}>
            <span style={{ fontWeight: 500 }}>{NOMBRE_TIPO_EVENTO[e.tipo]}</span> · {e.descripcion}
          </div>
          <div style={{ fontSize: tel ? '13px' : '12px', color: V.apagado }}>
            {NOMBRE_SITUACION[e.situacion]} desde {diaMesAnio(e.fecha)}{tallerDe(e, nombre) ? ` · ${tallerDe(e, nombre)}` : ''}{e.km != null ? ` · ${numeroAr(e.km)} km` : ''}
          </div>
          {formulario === e.id ? (
            <FormularioEvento activo={activo.id} proveedores={proveedores} abierto={e} variante={variante} onHecho={cerrar} onCancelar={() => setFormulario(null)} />
          ) : (
            <button type="button" onClick={() => setFormulario(e.id)} style={{ ...botonSecundario, alignSelf: 'flex-start', minHeight: tel ? 48 : 32 }} data-testid="avanzar-evento">
              {e.situacion === 'pendiente' ? 'Pasó al mecánico o ya está hecho' : 'Ya volvió'}
            </button>
          )}
        </div>
      ))}

      {aviso && <div role="status" style={{ fontSize: fuente, color: V.pos }} data-testid="evento-cargado">{aviso}</div>}

      {formulario === 'nuevo' ? (
        <FormularioEvento activo={activo.id} proveedores={proveedores} variante={variante} onHecho={cerrar} onCancelar={tel ? undefined : () => setFormulario(null)} />
      ) : (
        <button type="button" onClick={() => { setAviso(null); setFormulario('nuevo') }} style={{ ...botonSecundario, alignSelf: 'flex-start', minHeight: tel ? 48 : 32 }} data-testid="cargar-novedad">
          Cargar novedad
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${V.linea}`, paddingTop: 10 }}>
        <div style={{ ...eyebrow, display: 'flex', justifyContent: 'space-between' }}>
          <span>Historial</span>
          <span style={{ textTransform: 'none', letterSpacing: 0 }} data-testid="costo-acumulado">
            {costo.cargados ? `${pesos(costo.total)} en ${costo.cargados} ${costo.cargados === 1 ? 'trabajo con costo' : 'trabajos con costo'}` : 'sin costos cargados'}
          </span>
        </div>
        {historial.length === 0 && <span style={{ ...vacio, fontSize: '12.5px' }}>Sin trabajos cargados.</span>}
        {historial.map((e) => (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', gap: 10, fontSize: tel ? '13px' : '12.5px' }} data-testid="evento-historial">
            <span style={{ color: V.tenue }}>{diaMesAnio(e.fecha)}</span>
            <span style={{ color: V.tintaSuave }}>
              {NOMBRE_TIPO_EVENTO[e.tipo]} · {e.descripcion}
              {tallerDe(e, nombre) ? ` · ${tallerDe(e, nombre)}` : ''}{e.km != null ? ` · ${numeroAr(e.km)} km` : ''}{e.costo != null ? ` · ${pesos(e.costo)}` : ''}
              {e.proximo_km != null ? ` · próximo a los ${numeroAr(e.proximo_km)} km` : ''}{e.proximo_fecha ? ` · próximo ${diaMesAnio(e.proximo_fecha)}` : ''}
              {e.situacion !== 'hecho' ? ` · ${NOMBRE_SITUACION[e.situacion].toLowerCase()}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** En la ficha del escritorio: sólo para rodados. */
export function LibroDeVidaFicha({ id }: { id: string }) {
  const { parque } = useHerramientas()
  const a = parque.activoPorId.get(id)
  if (!a || a.clase !== 'rodado' || a.estado === 'baja') return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-libro-de-vida">
      <div style={{ ...eyebrow, paddingTop: 10 }}>Estado y libro de vida</div>
      <LibroDeVida activo={a} eventos={parque.eventos ?? null} proveedores={(parque.proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))} />
    </div>
  )
}
