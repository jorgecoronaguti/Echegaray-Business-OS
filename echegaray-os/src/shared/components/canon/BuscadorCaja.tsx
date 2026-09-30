'use client'

import { C } from './estilos'
import { IcoBuscar } from './iconos'

/**
 * LA CAJA DE BÚSQUEDA DE LA FRANJA DE TÍTULO — con caja, no el hairline del DS.
 *
 * `ds/Controles.tsx` dibuja el buscador con SÓLO borde inferior, y lo argumenta: «un buscador con
 * borde completo arriba de una tabla sin caja es la caja que la tabla no tiene». El argumento era
 * correcto cuando la tabla no tenía caja. Acá la tabla SÍ tiene caja (`TarjetaTabla`), así que el
 * zip le pone caja también al buscador: `border:1px solid #E7E6E2;borderRadius:6px;padding:4px 8px`.
 *
 * El ANCHO lo fija el mockup y cambia por pantalla (236 en `14` y `27`, 238 en `22` y `24`, 230 en
 * `25`, 214 en `15`). No se unifica: son los anchos que equilibran cada franja de título.
 */
export function BuscadorCaja({
  value,
  onChange,
  placeholder,
  ancho,
  testid = 'buscador',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ancho: number
  testid?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: C.superficie,
        border: `1px solid ${C.linea}`,
        borderRadius: 6,
        padding: '4px 8px',
        width: ancho,
        maxWidth: '100%',
      }}
    >
      <span style={{ display: 'flex', color: C.tenue }}><IcoBuscar /></span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={testid}
        style={{ border: 'none', background: 'transparent', fontSize: '12px', color: C.tinta, width: '100%', padding: 0, outline: 'none' }}
      />
    </div>
  )
}
