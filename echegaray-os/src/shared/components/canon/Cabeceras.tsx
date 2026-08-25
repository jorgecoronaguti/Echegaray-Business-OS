import Link from 'next/link'
import type { ReactNode } from 'react'
import { C, PAGINA } from './estilos'

// LAS DOS CABECERAS DEL PORTE.
//
// El zip tiene exactamente dos: la de una CARTERA (título + buscador + chips + acción, sobre el
// fondo de la página) y la de un DETALLE (banda blanca con miga de pan, título grande, línea de
// campos y —en las fichas— solapas). No hay una tercera, y por eso no se parametriza una sola que
// haga las dos: terminaría con seis banderas para elegir cuál de las dos dibuja.

/**
 * LA FRANJA DE UNA CARTERA — `14`, `22`, `24`, `25`, `27`.
 * `padding:14px 20px 10px`, título 19px/600, y la acción primaria empujada con `marginLeft:auto`.
 *
 * El título va en 19px y NO en el 21px del detalle: una lista se entra y se recorre, una ficha se
 * lee. El zip los escribe distintos en las nueve pantallas y la diferencia es la jerarquía.
 */
export function FranjaCartera({
  titulo,
  subtitulo,
  children,
  accion,
  testid,
}: {
  titulo: string
  /** `27` pone «de obras, personas, proveedores y clientes» al lado del título, en 12px. */
  subtitulo?: string
  /** Buscador y chips de filtro, en el orden del mockup. */
  children?: ReactNode
  accion?: ReactNode
  testid?: string
}) {
  return (
    <div style={PAGINA.titulo} data-testid={testid}>
      <h1 style={{ fontSize: '19px', fontWeight: 600, color: C.tinta, margin: 0 }}>{titulo}</h1>
      {subtitulo && <span style={{ fontSize: '12px', color: C.apagado }}>{subtitulo}</span>}
      {children}
      {accion && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{accion}</div>}
    </div>
  )
}

/**
 * LA BANDA BLANCA DE UN DETALLE — `15`, `16`, `23`, `26`.
 * `background:#FFFFFF;borderBottom:1px solid #E7E6E2;padding:9px 20px 0`.
 *
 * ═══ POR QUÉ NO ES EL `EntityHeader` DEL DS ═══
 *
 * Porque el DS dibuja los campos como pares rótulo/valor apilados y el zip los dibuja como UNA
 * línea de 12px separada por puntos medios, tres píxeles debajo del título. Son dos objetos
 * distintos; el que está en producción hoy ocupa el doble de alto que el del mockup y empuja la
 * tabla —que es lo que se vino a mirar— fuera de la primera pantalla en un MacBook de 13".
 */
export function BandaDetalle({
  miga,
  titulo,
  antesDelTitulo,
  pastillas,
  acciones,
  campos,
  solapas,
  testid,
}: {
  /** El último elemento es el actual y va en `#3A3A38` sin enlace. */
  miga: { texto: string; href?: string }[]
  titulo: string
  /** El código de la partida en `16`, que va ANTES del título en mono 13px. */
  antesDelTitulo?: ReactNode
  pastillas?: ReactNode
  acciones?: ReactNode
  campos?: ReactNode
  solapas?: ReactNode
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ background: C.superficie, borderBottom: `1px solid ${C.linea}`, padding: '9px 20px 0', flexShrink: 0 }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '11.5px', color: C.tenue, flexWrap: 'wrap' }}>
        {miga.map((m, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span>/</span>}
            {m.href ? (
              <Link href={m.href} style={{ color: C.tenue }} className="hover:text-[#3A3A38]">{m.texto}</Link>
            ) : (
              <span style={{ color: C.tintaSuave }}>{m.texto}</span>
            )}
          </span>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
        {antesDelTitulo}
        <h1 style={{ fontSize: '21px', fontWeight: 600, color: C.tinta, letterSpacing: '-.01em', margin: 0 }}>{titulo}</h1>
        {pastillas}
        {acciones && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{acciones}</div>}
      </div>
      {campos}
      {solapas}
    </div>
  )
}

/**
 * LA BANDA DE UNA FICHA CON AVATAR — `23` y `26`. El avatar es un cuadrado de 44px con radio 10 en
 * `#F2F1ED`, y el título y la línea de campos van a su derecha, no debajo.
 */
export function BandaFicha({
  miga,
  avatar,
  titulo,
  pastillas,
  campos,
  acciones,
  solapas,
  testid,
}: {
  miga: { texto: string; href?: string }[]
  avatar: ReactNode
  titulo: string
  pastillas?: ReactNode
  campos?: ReactNode
  acciones?: ReactNode
  solapas?: ReactNode
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ background: C.superficie, borderBottom: `1px solid ${C.linea}`, padding: '9px 20px 0', flexShrink: 0 }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '11.5px', color: C.tenue, flexWrap: 'wrap' }}>
        {miga.map((m, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span>/</span>}
            {m.href ? (
              <Link href={m.href} style={{ color: C.tenue }} className="hover:text-[#3A3A38]">{m.texto}</Link>
            ) : (
              <span style={{ color: C.tintaSuave }}>{m.texto}</span>
            )}
          </span>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: 10, background: C.avatar, color: C.tintaSuave,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {avatar}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '21px', fontWeight: 600, color: C.tinta, letterSpacing: '-.01em', margin: 0 }}>{titulo}</h1>
            {pastillas}
          </div>
          {campos}
        </div>
        {acciones && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{acciones}</div>}
      </div>
      {solapas}
    </div>
  )
}

/** Las iniciales de un nombre para el avatar. Dos letras, como en `25` y `26`. */
export function iniciales(nombre: string | null): string {
  const limpio = (nombre ?? '').trim()
  if (!limpio) return '—'
  const partes = limpio.split(/\s+/).filter(Boolean)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}
