import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { C } from './estilos'
import { IcoBuscar } from './iconos'

// LOS CONTROLES DE LA FRANJA DE TÍTULO — medidos de los `.dc.html`.
//
// ═══ EL COLOR DE FONDO VA POR CLASE, NO INLINE ═══
//
// Todos estos controles tienen `style-hover` en el mockup. Un `background` inline le gana a
// cualquier `hover:` de Tailwind, así que el fondo y su hover viajan JUNTOS en `className` y sólo
// la geometría va en `style`. Mezclarlos al revés deja el control muerto al pasar el mouse, que es
// la clase de detalle por el que una pantalla «no se siente» como el mockup aunque mida igual.

type Comun = {
  children?: ReactNode
  /** Cuando hay `href` se dibuja un enlace; cuando hay `onClick`, un botón. */
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
  testid?: string
  style?: CSSProperties
}

function Control({ href, onClick, type = 'button', disabled, title, testid, clase, style, children }: Comun & { clase: string }) {
  if (href && !disabled) {
    return (
      <Link href={href} title={title} data-testid={testid} className={clase} style={style}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} data-testid={testid} className={clase} style={style}>
      {children}
    </button>
  )
}

/**
 * LA ACCIÓN PRIMARIA, EN AMARILLO DE MARCA.
 * `display:flex;gap:6px;background:#FDC900;color:#1F1F1E;fontSize:12.5px;fontWeight:600;
 *  borderRadius:6px;padding:6px 11px` · hover `#EEBE00`. Idéntico en `14`, `15`, `16`, `22`, `24`,
 * `26` y `27`.
 *
 * Nota declarada: `globals.css` dice que el amarillo NO puede ser el color de acción porque da
 * 1,6:1 contra blanco. Acá gana el zip, que lo usa como botón primario en las nueve pantallas — y
 * el texto va en #1F1F1E sobre el amarillo, que sí contrasta (11,4:1). Lo que el token prohibía era
 * texto CLARO sobre amarillo, no el amarillo como fondo.
 */
export function BotonMarca({ children, ...p }: Comun) {
  return (
    <Control
      {...p}
      clase="inline-flex items-center gap-1.5 rounded-[6px] bg-[#FDC900] px-[11px] py-[6px] text-[12.5px] font-semibold text-[#1F1F1E] transition-colors hover:bg-[#EEBE00] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </Control>
  )
}

/**
 * LA ACCIÓN SECUNDARIA: caja blanca con borde.
 * `background:#FFFFFF;border:1px solid #E7E6E2;color:#3A3A38;fontSize:12.5px;borderRadius:6px;
 *  padding:6px 11px` · hover borde `#D7D5CF` y texto `#1F1F1E`. `15` (Rubro, Base maestra), `26`.
 */
export function BotonPlano({ children, fuerte = false, ...p }: Comun & { fuerte?: boolean }) {
  return (
    <Control
      {...p}
      clase={`inline-flex items-center gap-1.5 rounded-[6px] border border-[#E7E6E2] bg-white px-[11px] py-[6px] text-[12.5px] transition-colors hover:border-[#D7D5CF] hover:text-[#1F1F1E] disabled:cursor-not-allowed disabled:opacity-50 ${
        fuerte ? 'font-medium text-[#1F1F1E]' : 'text-[#3A3A38]'
      }`}
    >
      {children}
    </Control>
  )
}

/**
 * EL BOTÓN DE SOLO ICONO, 30×30. Lleva SIEMPRE `title`: sin él es un cuadrado que nadie sabe qué
 * hace. `width:30px;height:30px;borderRadius:6px;border:1px solid #E7E6E2;color:#6B6B67`.
 * `14`, `15`, `16`, `23`, `26`.
 */
export function BotonIcono({ children, title, ...p }: Comun & { title: string }) {
  return (
    <Control
      {...p}
      title={title}
      clase="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] border border-[#E7E6E2] text-[#6B6B67] transition-colors hover:border-[#D7D5CF] hover:text-[#1F1F1E] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="sr-only">{title}</span>
      {children}
    </Control>
  )
}

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

/**
 * EL CHIP DE ATENCIÓN de `22` y `24`: «14 sin CUIT: no se pueden facturar».
 *
 * No es un aviso, es un FILTRO con cara de aviso — se toca y la tabla de abajo se recorta a esas
 * filas. Por eso el número va primero y en 13px/600: lo que decide si vale la pena tocarlo es
 * cuántos hay. Con cero no se dibuja, y esa decisión la toma la pantalla, no el chip: un chip que
 * dice «0 sin imputar» es una fila de interfaz que no lleva a ningún lado.
 */
export function ChipAtencion({
  n,
  texto,
  tono,
  href,
  onClick,
  icono,
  testid,
}: {
  n: ReactNode
  texto: string
  tono: 'warn' | 'neg'
  href?: string
  onClick?: () => void
  icono: ReactNode
  testid?: string
}) {
  const color = tono === 'neg' ? C.neg : C.warn
  const fondo = tono === 'neg' ? '#FEF6F5' : '#FDF6EE'
  const borde = tono === 'neg' ? '#F3DDDA' : '#F0E1CD'
  return (
    <Control
      href={href}
      onClick={onClick}
      testid={testid}
      clase="inline-flex items-center gap-[7px] rounded-[7px] border transition-colors hover:bg-white"
      style={{ background: fondo, borderColor: borde, padding: '6px 11px' }}
    >
      <span style={{ display: 'flex', color, flexShrink: 0 }}>{icono}</span>
      <span className="font-mono tabular-nums" style={{ fontSize: '13px', fontWeight: 600, color }}>{n}</span>
      <span style={{ fontSize: '12px', color: C.tintaSuave }}>{texto}</span>
    </Control>
  )
}

/**
 * EL CONTADOR QUE VA DENTRO DE UN CHIP DE FILTRO, en el gris que le da el zip: `#B9B7B1` cuando el
 * chip está activo (sobre grafito) y `#91918B` cuando no. `ds/Filtros` no puede pintarlo solo
 * —recibe el `label` como nodo opaco— y sin esto el contador del chip activo sale blanco y pesa
 * igual que la palabra.
 */
export function CuentaChip({ n, activo }: { n: ReactNode; activo: boolean }) {
  return (
    <span className="font-mono tabular-nums" style={{ fontSize: '10.5px', color: activo ? '#B9B7B1' : C.tenue }}>
      {n}
    </span>
  )
}
