'use client'

// EN EL MECÁNICO — lo que está afuera ahora: cuáles son, dónde, desde cuándo, cuántos días lleva y cuándo vuelve.
// Sale de los arreglos abiertos (`activo_evento`, situación en_taller), la misma fuente que la ficha, el
// listado y el teléfono. Rojo/naranja sólo para lo atrasado: pasó la vuelta prometida y no volvió.

import { afuera, diaMesAnioIso, hoyIso, plazoDias, resumenAfuera } from '../logica/arreglo'
import { tallerDe } from '../logica/evento'
import type { Parque } from '../logica/parque'
import { SUPERFICIE, V, eyebrow } from './estilo'

const COLS = 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) 104px 72px'

export function ArreglosAfuera({ parque, elegido, onElegir }: { parque: Parque; elegido: string | null; onElegir: (codigo: string) => void }) {
  const lista = afuera(parque.eventos, parque.activoPorId, hoyIso())
  if (lista.length === 0) return null
  const r = resumenAfuera(lista)
  const nombre = (id: string) => parque.proveedorPorId.get(id)?.nombre ?? null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="grupo-en-el-mecanico">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600 }}>En el mecánico</h2>
        <span style={{ fontSize: '12.5px', color: V.apagado }} data-testid="resumen-en-el-mecanico">
          {r.cuantos} afuera{r.masViejo != null ? ` · el más viejo hace ${plazoDias(r.masViejo)}` : ''}
          {r.atrasados > 0 && <span style={{ color: V.warn }}> · {r.atrasados} {r.atrasados === 1 ? 'atrasado' : 'atrasados'}</span>}
        </span>
      </div>
      <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 30, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
        <div>Activo</div><div>Mecánico</div><div>Falla</div><div>Vuelve</div><div style={{ textAlign: 'right' }}>Días</div>
      </div>
      {lista.map(({ evento: e, activo: a, dias, atrasado }) => (
        <button
          key={e.id} type="button" data-testid="item-en-el-mecanico" className="hover:bg-surface-quiet" onClick={() => onElegir(a.codigo)}
          style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 42, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '13.5px', textAlign: 'left', background: elegido === a.codigo ? SUPERFICIE : undefined }}
        >
          <div style={{ fontWeight: 500 }}>{a.nombre}</div>
          <div style={{ color: V.tintaSuave }}>{tallerDe(e, nombre) ?? 'sin dato'}</div>
          <div style={{ color: V.apagado }}>{e.descripcion}</div>
          <div style={{ color: atrasado ? V.warn : e.vuelta_estimada ? V.tintaSuave : V.tenue, fontStyle: e.vuelta_estimada ? undefined : 'italic' }}>
            {e.vuelta_estimada ? diaMesAnioIso(e.vuelta_estimada) : 'sin fecha'}
          </div>
          <div style={{ textAlign: 'right', color: dias == null ? V.tenue : dias > 30 ? V.neg : V.apagado, fontWeight: dias != null && dias > 30 ? 500 : 400 }}>{dias == null ? '—' : `${dias} d`}</div>
        </button>
      ))}
    </div>
  )
}
