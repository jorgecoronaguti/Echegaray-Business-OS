'use client'

// EL PANEL DE UN RODADO O MÁQUINA (Mantenimiento, lado derecho; dueño 02/10).
//
// Un solo panel para cualquier fila de Mantenimiento que sea un rodado o una máquina —venga de «Reportado»,
// «En el taller» o «Revisión técnica»—. Antes cada fila abría uno distinto: la de revisión mostraba sólo la
// RTO y el seguro; la otra, la ficha de herramienta, sin vigencias. El dueño no encontraba dónde cargar una
// falla ni un service porque la puerta cambiaba según la tabla que tocara.
//
// Tres bloques, cada uno con SU acción: «Estado y arreglos» (reportar una falla, llevarlo al mecánico),
// «Revisiones» (cargar RTO, seguro, service, inspección) e «Historial» (todo junto, lo último primero).
// Cargar algo reemplaza el panel por su formulario —con el nombre de lo que se carga arriba y «Volver»—
// y al guardar vuelve acá con la confirmación escrita. Nada se guarda sin que la pantalla lo diga.

import Link from 'next/link'
import { useState } from 'react'
import { historialDeRodado } from '../logica/historial-rodado'
import {
  MIGRACION_REVISION, NOMBRE_RESULTADO, NOMBRE_REVISION, seRevisa, semaforo, textoLecturaRevision, TIPOS_POR_CLASE, UNIDAD_LECTURA, vigenteDe,
  type TipoRevision,
} from '../logica/revision'
import { useHerramientas } from './Espacio'
import { FormularioFalla } from './FormularioFalla'
import { FormularioRevision } from './FormularioRevision'
import { LibroDeVida } from './LibroDeVida'
import { AZUL, MONO, V, botonPrimarioGrande, eyebrow, vacio } from './estilo'
import { diaMesAnio } from './formato'

const COLOR = { neg: V.neg, warn: V.warn, pos: V.pos, tenue: V.tenue } as const
const CORTO = 5

type Vista = { t: 'resumen' } | { t: 'falla' } | { t: 'revision'; tipo: TipoRevision }

export function PanelRodado({ id, onCerrar }: { id: string; onCerrar?: () => void }) {
  const { parque, refrescar } = useHerramientas()
  const [vista, setVista] = useState<Vista>({ t: 'resumen' })
  const [aviso, setAviso] = useState<string | null>(null)
  const [todo, setTodo] = useState(false)
  const a = parque.activoPorId.get(id)
  if (!a) return null
  if (!seRevisa(a)) return <div style={{ fontSize: '13px', color: V.apagado }}>Este panel es de rodados y máquinas vivos.</div>

  const unidad = UNIDAD_LECTURA[a.clase]
  const titulo = a.patente && !a.nombre.includes(a.patente) ? `${a.nombre} · ${a.patente}` : a.nombre
  const hecho = (t: string) => { setAviso(t); setVista({ t: 'resumen' }); refrescar() }
  const volver = () => setVista({ t: 'resumen' })

  const cabecera = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em' }}>{a.nombre}</div>
        <div style={{ fontSize: '12.5px', color: V.apagado }}>
          <span style={{ fontFamily: MONO }}>{a.codigo}</span>{a.patente && !a.nombre.includes(a.patente) ? ` · ${a.patente}` : ''}
          {' · '}<Link href={`/herramientas/inventario?clase=todo&activo=${encodeURIComponent(a.codigo)}`} prefetch={false} style={{ color: AZUL }}>ver la ficha completa</Link>
        </div>
      </div>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar" data-testid="cerrar-panel-rodado"
          style={{ width: 28, height: 28, borderRadius: 6, fontSize: '18px', lineHeight: 1, color: V.tenue, border: `1px solid ${V.linea}` }}>×</button>
      )}
    </div>
  )

  if (vista.t !== 'resumen') {
    const que = vista.t === 'falla' ? 'Reportar una falla' : `Cargar ${NOMBRE_REVISION[vista.tipo]}`
    return (
      <div data-testid="panel-rodado" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {cabecera}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 14, borderTop: `1px solid ${V.linea}` }}>
          <button type="button" onClick={volver} style={{ alignSelf: 'flex-start', fontSize: '12.5px', color: V.apagado }} data-testid="volver-panel-rodado">‹ Volver a {a.nombre}</button>
          <h2 style={{ fontSize: '15px', fontWeight: 600 }} data-testid="titulo-accion">{que}</h2>
        </div>
        {vista.t === 'falla'
          ? <FormularioFalla activo={a.id} nombre={a.nombre} variasFotos={parque.fotos != null} onHecho={hecho} onCancelar={volver} />
          : <FormularioRevision key={vista.tipo} activo={a.id} clase={a.clase} tipoInicial={vista.tipo} tipoFijo onCancelar={volver} onHecho={hecho} />}
      </div>
    )
  }

  const sinBase = parque.revisionesVigentes == null
  const hoy = new Date()
  const historial = historialDeRodado(a.id, { revisiones: parque.revisiones, eventos: parque.eventos, incidencias: parque.incDe.get(a.id) }, unidad)
  const visibles = todo ? historial : historial.slice(0, CORTO)

  return (
    <div data-testid="panel-rodado" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {cabecera}

      {aviso && <div role="status" style={{ fontSize: '13px', color: V.pos, lineHeight: 1.5 }} data-testid="panel-rodado-aviso">{aviso}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="bloque-fallas">
        <div style={{ ...eyebrow, paddingTop: 10 }}>Estado y arreglos</div>
        {parque.eventos == null ? (
          <>
            <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración 20260930T2300 del libro de vida: los arreglos todavía no se cargan, pero sí se puede reportar una falla.</div>
            <div><button type="button" onClick={() => { setAviso(null); setVista({ t: 'falla' }) }} style={botonPrimarioGrande} data-testid="reportar-falla">Reportar una falla</button></div>
          </>
        ) : (
          <LibroDeVida
            activo={a} eventos={parque.eventos} nombres={parque.nombres} sinHistorial
            proveedores={(parque.proveedores ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))}
            alReportar={() => setVista({ t: 'falla' })}
          />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="revision-vigentes">
        <div style={{ ...eyebrow, paddingTop: 10, paddingBottom: 4 }}>Revisiones</div>
        {sinBase ? (
          <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración {MIGRACION_REVISION} de la ficha de revisión: todavía no se puede cargar.</div>
        ) : TIPOS_POR_CLASE[a.clase].map((tipo) => {
          const r = vigenteDe(parque.revisionesVigentes, a.id, tipo)
          const s = semaforo(r, hoy)
          return (
            <div key={tipo} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr) auto', gap: 12, alignItems: 'baseline', minHeight: 36, borderBottom: `1px solid ${V.linea}`, fontSize: '13px' }} data-testid={`vigente-${tipo}`}>
              <span style={{ fontWeight: 500 }}>{NOMBRE_REVISION[tipo]}</span>
              <span style={{ color: COLOR[s.tono], fontWeight: s.alerta ? 500 : 400, ...(s.tono === 'tenue' ? vacio : {}) }}>
                {s.texto}{r?.resultado && r.resultado !== 'rechazado' ? ` · ${NOMBRE_RESULTADO[r.resultado].toLowerCase()}` : ''}{r?.lectura != null ? ` · ${textoLecturaRevision(r.lectura, unidad)}` : ''}
              </span>
              <button type="button" onClick={() => { setAviso(null); setVista({ t: 'revision', tipo }) }} aria-label={`Cargar ${NOMBRE_REVISION[tipo]}`}
                style={{ fontSize: '12.5px', color: AZUL, minHeight: 32 }} data-testid={`cargar-${tipo}`}>
                {r ? 'Cargar nueva' : 'Cargar'}
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="historial-rodado">
        <div style={{ ...eyebrow, paddingTop: 10 }}>Historial <span style={{ color: V.tenue }}>{historial.length}</span></div>
        {historial.length === 0 && <div style={{ ...vacio, fontSize: '12.5px' }}>Sin fallas, arreglos ni revisiones cargadas.</div>}
        {visibles.map((r) => (
          <div key={r.clave} style={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: 12, fontSize: '12.5px' }} data-testid="renglon-historial">
            <div style={{ color: V.tenue }}>{diaMesAnio(r.fecha)}</div>
            <div style={{ color: V.tintaSuave }}>
              <b style={{ fontWeight: 500, color: r.clase === 'falla' ? V.neg : undefined }}>{r.titulo}</b>
              {r.detalle ? <span style={{ color: V.apagado }}> · {r.detalle}</span> : null}
            </div>
          </div>
        ))}
        {historial.length > CORTO && (
          <button type="button" onClick={() => setTodo(!todo)} style={{ alignSelf: 'flex-start', fontSize: '12.5px', color: AZUL }} data-testid="historial-ver-todo">
            {todo ? 'Ver menos' : `Ver todo (${historial.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
