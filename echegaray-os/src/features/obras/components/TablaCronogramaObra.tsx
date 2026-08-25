'use client'

// LA COLUMNA IZQUIERDA DEL CRONOGRAMA — PORTE LITERAL de `07 · Obra Cronograma.dc.html`.
//
// Medidas leídas de los estilos inline del mockup, no reinterpretadas:
//
//   columna    `width:340px; flexShrink:0; borderRight:1px solid #E7E6E2`
//   cabecera   `height:46px; background:#FAFAF8; padding:0 14px 9px`, rótulos 10px `letterSpacing:.05em`
//   fila       `height:36px; gap:8px; padding:0 14px; borderBottom:1px solid #F1F0EC`
//   rubro      11,5px/600 con `letterSpacing:.05em` · actividad 12,5px/400, sangrada 14px
//   desvío     IBM Plex Mono 11,5px, a la derecha
//
// ═══ EL DESVÍO ES LA ÚNICA CIFRA DE ESTA COLUMNA ═══
//
// El mockup pone «ACTIVIDAD» a la izquierda y «DESVÍO» a la derecha, y nada más. Estado, fechas,
// avance y HH viven en el árbol de Tareas (mockup 03): una tabla de seis columnas al lado de un
// Gantt son dos pantallas peleando por el mismo ancho, y ninguna de las dos entra.
//
// ═══ Y ES EL DESVÍO PROYECTADO, NO EL DE LA LÍNEA BASE ═══
//
// `forecast_fin − fin_plan`, la misma definición que la cartera (01). Ver `cronogramaPlan.ts`: el
// desvío contra la base da 0 en las once obras vivas porque el sellado copió el plan.

import { useState } from 'react'
import { oracionDeActividad } from '../services/nombreDeActividad'
import type { FilaPlan } from '../services/cronogramaPlan'
import { C, MONO } from './canon/tokens'

/** El desvío en palabras y en color, con los cortes del mockup: más de 5 días es rojo.
 *  `null` NO es «en fecha»: es que no hay forecast con el cual medirlo. Se escribe «—» y lo dice el
 *  `title`, como en el zip — decir «en fecha» convertiría lo no medido en una obra cumplida. */
export function textoDesvio(d: number | null): { texto: string; color: string; ayuda: string } {
  if (d == null) return { texto: '—', color: C.tenue, ayuda: 'Sin forecast: el desvío no se puede medir' }
  if (d === 0) return { texto: 'en fecha', color: C.pos, ayuda: 'El fin proyectado coincide con el plan' }
  if (d < 0) return { texto: `${d} d`, color: C.pos, ayuda: 'Proyectada antes del fin de plan' }
  return {
    texto: `+${d} d`,
    color: d > 5 ? C.neg : C.warn,
    ayuda: 'Días entre el fin de plan y el fin proyectado',
  }
}

const ALTO_CABECERA = 46

export interface Props {
  filas: FilaPlan[]
  /** La `clave` de la fila seleccionada. Es la clave y no el id de actividad: un rubro no tiene id,
   *  y comparando `null === null` las diez cabeceras se pintaban seleccionadas todas juntas. */
  seleccionada: string | null
  alSeleccionar: (clave: string) => void
  cerrados: ReadonlySet<string>
  plegar: (clave: string) => void
  altoFila: number
  altoCabecera: number
}

export function TablaCronogramaObra({
  filas, seleccionada, alSeleccionar, cerrados, plegar, altoFila, altoCabecera = ALTO_CABECERA,
}: Props) {
  return (
    <div style={{ width: '340px', flexShrink: 0, borderRight: `1px solid ${C.borde}` }}>
      <div style={{
        height: altoCabecera, borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo,
        display: 'flex', alignItems: 'flex-end', padding: '0 14px 9px',
      }}>
        <span style={{ fontSize: '10px', color: C.tenue, letterSpacing: '.05em' }}>ACTIVIDAD</span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: C.tenue, letterSpacing: '.05em' }}>DESVÍO</span>
      </div>
      {filas.map((f) => (
        <Fila
          key={f.clave} fila={f} altoFila={altoFila}
          selecta={seleccionada === f.clave}
          cerrada={cerrados.has(f.clave)}
          alSeleccionar={alSeleccionar}
          plegar={plegar}
        />
      ))}
    </div>
  )
}

function Fila({ fila, altoFila, selecta, cerrada, alSeleccionar, plegar }: {
  fila: FilaPlan
  altoFila: number
  selecta: boolean
  cerrada: boolean
  alSeleccionar: (clave: string) => void
  plegar: (clave: string) => void
}) {
  const d = textoDesvio(fila.desvio)
  const esRubro = fila.nivel === 0
  // EL HOVER DEL ZIP (`style-hover="background:#FAFAF8"`) NO EXISTE EN CSS INLINE: se resuelve con
  // estado local, que es la única traducción que este porte se permite. Ver `canon/Piezas.tsx`.
  const [encima, setEncima] = useState(false)
  const fondo = selecta ? C.marcaSuave : encima ? C.tenueFondo : 'transparent'
  // EL MISMO `testid` QUE EL GANTT ANTERIOR (`actividad-cronograma`): «una fila del cronograma con
  // el nombre de la actividad» es el mismo hecho, y media docena de pruebas de navegador lo miran
  // para comparar que el cronograma publica LAS MISMAS actividades que el resto del módulo.
  return (
    <button
      type="button"
      data-testid={esRubro ? 'rubro-cronograma' : 'actividad-cronograma'}
      data-sel={selecta ? '1' : undefined}
      aria-current={selecta ? 'true' : undefined}
      onClick={() => alSeleccionar(fila.clave)}
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '8px', height: altoFila,
        textAlign: 'left', padding: '0 14px', cursor: 'pointer', background: fondo,
        border: 'none', borderBottom: `1px solid ${C.bordeFila}`, font: 'inherit',
      }}
    >
      <span style={{
        paddingLeft: esRubro ? 0 : '14px', display: 'flex', alignItems: 'center', gap: '7px',
        minWidth: 0, flex: 1,
      }}>
        {esRubro && fila.nHijas > 0 && (
          <span
            role="button" tabIndex={0}
            aria-label={`${cerrada ? 'Abrir' : 'Cerrar'} ${fila.nombre}`}
            aria-expanded={!cerrada}
            data-testid="plegar-rubro"
            onClick={(e) => { e.stopPropagation(); plegar(fila.clave) }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault(); e.stopPropagation(); plegar(fila.clave)
            }}
            style={{ display: 'flex', color: C.tenue, flexShrink: 0, cursor: 'pointer' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" aria-hidden
              style={{ transform: cerrada ? 'rotate(0deg)' : 'rotate(90deg)' }}>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        )}
        <span style={{
          fontSize: esRubro ? '11.5px' : '12.5px', fontWeight: esRubro ? 600 : 400, color: C.tinta,
          letterSpacing: esRubro ? '.05em' : '0', textTransform: esRubro ? 'uppercase' : 'none',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {/* Se LEE en oración, se GUARDA como se cargó: el tracker viene gritado y treinta filas
              en mayúsculas no tienen silueta. El dato no se toca. */}
          {esRubro ? fila.nombre : oracionDeActividad(fila.nombre)}
        </span>
        {fila.tieneImpedimento && (
          <span title="Impedimento abierto" data-testid="marca-impedimento"
            style={{ display: 'flex', color: C.neg, flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M12 8v5M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
        )}
      </span>
      <span title={d.ayuda} data-testid="desvio-fila" style={{
        fontFamily: MONO, fontSize: '11.5px', color: d.color, flexShrink: 0,
      }}>{d.texto}</span>
    </button>
  )
}
