import type { CSSProperties, ReactNode } from 'react'
import { C, TARJETA } from './estilos'

// LOS BLOQUES DE LAS FICHAS Y LAS FRANJAS — `15`, `16`, `22`, `23`, `24`, `26`.

/**
 * LA FRANJA DE KPIs: una sola caja partida en columnas por un divisor interno, NO cuatro tarjetas
 * separadas. `15` y `23` y `26` la dibujan igual: `flex:1;minWidth:...;padding:11px 16px;
 * borderRight:1px solid #EFEEEA`, rótulo 10,5px con interletrado .04em y valor mono 20px/600.
 *
 * El `minWidth` de cada columna es lo que hace que la franja se parta en dos filas antes de apretar
 * un importe hasta romperlo. `15` usa 172px, `23` 164px y `26` 168px.
 */
export function FranjaKpis({
  kpis,
  minColumna = 172,
  padding = '11px 16px',
  testid,
}: {
  kpis: { rotulo: string; valor: ReactNode; detalle?: ReactNode; color?: string; testid?: string }[]
  minColumna?: number
  padding?: string
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ ...TARJETA, display: 'flex', gap: 0, flexWrap: 'wrap' }}>
      {kpis.map((k) => (
        <div key={k.rotulo} style={{ flex: 1, minWidth: minColumna, padding, borderRight: `1px solid ${C.lineaBloque}` }}>
          <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{k.rotulo}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
            <span
              data-testid={k.testid}
              className="font-mono tabular-nums"
              style={{ fontSize: '20px', fontWeight: 600, color: k.color ?? C.tinta, lineHeight: 1.15, whiteSpace: 'nowrap' }}
            >
              {k.valor}
            </span>
            {k.detalle !== undefined && (
              <span style={{ fontSize: '11px', color: C.tenue, whiteSpace: 'nowrap' }}>{k.detalle}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * UNA TARJETA CON TÍTULO: el bloque de las fichas y del análisis de partida.
 * Encabezado `padding:11px 14px|16px;borderBottom:1px solid #EFEEEA`, icono a la izquierda en
 * `apagado`, título 12,5px|13px/600, y un hueco a la derecha para el contador o la acción.
 */
export function TarjetaBloque({
  icono,
  titulo,
  derecha,
  children,
  tam = '12.5px',
  padding = 14,
  colorIcono = C.apagado,
  style,
  testid,
}: {
  icono?: ReactNode
  titulo: ReactNode
  derecha?: ReactNode
  children?: ReactNode
  tam?: string
  padding?: number
  colorIcono?: string
  style?: CSSProperties
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ ...TARJETA, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: `11px ${padding}px`, borderBottom: `1px solid ${C.lineaBloque}` }}>
        {icono && <span style={{ display: 'flex', color: colorIcono, flexShrink: 0 }}>{icono}</span>}
        <div style={{ fontSize: tam, fontWeight: 600, color: C.tinta }}>{titulo}</div>
        {derecha && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>{derecha}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * UNA FILA DE DATO del panel: icono · rótulo de ancho FIJO · valor.
 *
 * El ancho fijo del rótulo (104px en `14`, 96 en `23`, 92 en `26`) es lo que alinea los valores en
 * una columna. Con el rótulo libre, «CUIT» y «Condición pago» empujan el valor a dos sangrías
 * distintas y la lista deja de leerse de arriba abajo.
 */
export function FilaDato({
  icono,
  rotulo,
  valor,
  color = C.tinta,
  anchoRotulo = 104,
  testid,
}: {
  icono?: ReactNode
  rotulo: string
  valor: ReactNode
  color?: string
  anchoRotulo?: number
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: `1px solid ${C.lineaTenue}` }}>
      {icono && <span title={rotulo} style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}>{icono}</span>}
      <span style={{ fontSize: '11.5px', color: C.apagado, width: anchoRotulo, flexShrink: 0 }}>{rotulo}</span>
      <span style={{ fontSize: '12px', color, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {valor}
      </span>
    </div>
  )
}

/**
 * LA BARRA DE AVANCE: pista `#EAE7E6` de 5px con radio 3 y el relleno en el color del estado.
 * `23`, `25` y `26`.
 *
 * `pct` NULL no dibuja una barra en cero: una obra sin avance cargado y una obra que no arrancó son
 * cosas distintas, y una barra vacía las cuenta igual. Sin dato, la pista va sola.
 */
export function BarraAvance({ pct, color, ancho }: { pct: number | null; color: string; ancho?: number }) {
  return (
    <div style={{ flex: 1, height: 5, background: C.pista, borderRadius: 3, overflow: 'hidden', maxWidth: ancho }}>
      {pct !== null && <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />}
    </div>
  )
}

/**
 * LA PASTILLA DEL TÍTULO — más grande que la de la tabla y por eso NO es `ds/Estado`.
 * Tabla: 11px / radio 11 / padding 1.5px 8px. Título: 11,5px / radio 12 / padding 2px 10px.
 * `15` («Enviado · rev 1»), `16` («Con análisis»), `23`, `26`.
 */
export function PastillaTitulo({
  children,
  color,
  fondo,
  borde,
  testid,
}: {
  children: ReactNode
  color: string
  fondo: string
  borde: string
  testid?: string
}) {
  return (
    <span
      data-testid={testid}
      style={{
        fontSize: '11.5px', fontWeight: 500, color, background: fondo,
        border: `1px solid ${borde}`, borderRadius: 12, padding: '2px 10px', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

/** Las cinco ternas de color del zip, para la pastilla de título y para pintar valores sueltos. */
export const TONO = {
  pos: { color: C.pos, fondo: '#F1F9F4', borde: '#D6EBDF' },
  curso: { color: C.info, fondo: '#EFF5FF', borde: '#D6E4FB' },
  warn: { color: C.warn, fondo: '#FDF6EE', borde: '#F0E1CD' },
  neg: { color: C.neg, fondo: '#FEF6F5', borde: '#F3DDDA' },
  neutro: { color: C.apagado, fondo: '#FAFAF8', borde: '#E7E6E2' },
} as const

export type ClaveTono = keyof typeof TONO

/**
 * LA LÍNEA DE CAMPOS bajo el título: «Messina · 68 partidas · 18/08», separada por puntos medios en
 * `#D7D5CF`. Los separadores los pone ESTE componente y no quien lo llama: escritos a mano, la
 * pantalla que se olvida uno queda con dos campos pegados y nadie lo nota hasta el screenshot.
 */
export function LineaCampos({ campos, testid }: { campos: ReactNode[]; testid?: string }) {
  const vivos = campos.filter((c) => c !== null && c !== undefined && c !== false)
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '12px', color: C.apagado, marginTop: 3, flexWrap: 'wrap' }}>
      {vivos.map((c, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span style={{ color: C.lineaFuerte }}>·</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{c}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * LAS SOLAPAS DE UNA FICHA (`23`, `26`): subrayado AMARILLO de 2px por dentro, no un borde real.
 * `boxShadow:inset 0 -2px 0 #FDC900`. Con `border-bottom` la solapa activa mide 2px más que las
 * otras y el texto se corre — el zip usa sombra interior justamente para que no pase.
 */
export function SolapasFicha({
  solapas,
  testid = 'solapas',
}: {
  solapas: { clave: string; rotulo: string; n?: ReactNode; alerta?: boolean; href: string; activa: boolean }[]
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'stretch', marginTop: 10 }}>
      {solapas.map((s) => (
        <a
          key={s.clave}
          href={s.href}
          data-testid={`solapa-${s.clave}`}
          aria-current={s.activa ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', padding: '8px 11px',
            color: s.activa ? C.tinta : C.apagado,
            fontWeight: s.activa ? 600 : 400,
            boxShadow: s.activa ? `inset 0 -2px 0 ${C.marca}` : 'none',
          }}
        >
          {s.rotulo}
          {s.n !== undefined && (
            <span className="font-mono tabular-nums" style={{ fontSize: '10.5px', color: s.activa ? C.apagado : C.tenue }}>{s.n}</span>
          )}
          {s.alerta && <span style={{ display: 'flex', color: C.neg }}>{ALERTA_SOLAPA}</span>}
        </a>
      ))}
    </div>
  )
}

const ALERTA_SOLAPA = (
  <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" />
  </svg>
)
