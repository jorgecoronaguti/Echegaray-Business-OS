// LAS FOTOS DE UN ACTIVO, todas (migración 20261001T1800): de la más nueva a la más vieja, con el día y
// quién la subió. Son evidencia del estado del equipo (dueño, 01/10), así que no se borran ni se editan
// desde acá: cada una abre el original para mirarlo entero.
//
// Sin hooks ni `'use client'`: la usan la ficha de escritorio (cliente) y la del teléfono (servidor).

import type { FotoDeActivo } from '../logica/fotos'
import { SUPERFICIE, V, vacio } from './estilo'
import { diaMesAnio } from './formato'

export function Fotos({ fotos, nombres, alt, variante }: {
  /** Ya ordenadas (`fotosDe`). */
  fotos: FotoDeActivo[]
  /** usuario_id → nombre (el mismo `parque.nombres` del resto del módulo). */
  nombres: Record<string, string>
  alt: string
  variante: 'telefono' | 'escritorio'
}) {
  if (fotos.length === 0) return null
  const telefono = variante === 'telefono'
  return (
    <div data-testid="fotos-activo" style={{
      display: 'grid', gap: 8,
      // 390 px de teléfono: tres por fila, cada una se achica antes de empujar la página de costado.
      gridTemplateColumns: telefono ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(96px, 1fr))',
    }}>
      {fotos.map((f) => {
        const quien = f.subida_por ? nombres[f.subida_por] : undefined
        return (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" data-testid="foto-activo"
            style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, color: 'inherit' }}>
            <span style={{ display: 'block', aspectRatio: '4 / 3', border: `1px solid ${V.linea}`, borderRadius: 6, background: SUPERFICIE, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- foto pública del bucket `herramientas`, tamaño libre */}
              <img src={f.url} alt={alt} loading="lazy" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', fontSize: telefono ? '12px' : '11.5px', lineHeight: 1.35, color: V.apagado, overflowWrap: 'anywhere' }}>
              <span>{diaMesAnio(f.creado_en)}</span>
              <span style={quien ? undefined : vacio}>{quien ?? 'sin registro'}</span>
            </span>
          </a>
        )
      })}
    </div>
  )
}
