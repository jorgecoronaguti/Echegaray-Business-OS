import type { ReactNode } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import { PieFijo as PieMovil } from '@/shared/components/movil/Piezas'

// LAS PIEZAS DE M08 — el grupo y su fila, medidos en `M08 · Mis documentos y recibos.dc.html`.
//
// El pie fijo y el botón del pie viven ahora en `shared/components/movil/Piezas`: son los mismos en
// las quince pantallas del teléfono, y tenerlos dos veces era cómo terminaban midiendo distinto.
// Acá quedó lo que es propio de M08: el encabezado de grupo con su icono y su conteo, y la fila con
// la pastilla «nuevo», el estado escrito con su color y la acción a la derecha.

export { PieMovil as PieFijo }

/**
 * EL BOTÓN DEL PIE DE M08 — CONTORNO, no relleno.
 *
 * El mockup lo dibuja con `border:1px solid #E7E6E2` y fondo blanco: «Subir un papel mío» es una
 * acción secundaria de una pantalla de consulta, no la primaria del día. Apagado dice QUÉ FALTA
 * —«No te falta ningún papel»— en vez de «Subir» en gris, que se lee como un sistema roto.
 */
export function BotonPie({
  children, disabled, type = 'submit', icono = 'subir', testid,
}: {
  children: ReactNode
  disabled?: boolean
  type?: 'submit' | 'button'
  icono?: NombreIcono
  testid?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      data-testid={testid}
      style={{
        width: '100%', minHeight: 52, borderRadius: R.control,
        border: `1px solid ${C.linea}`, background: disabled ? C.inerte : C.surface,
        color: disabled ? C.faint : C.ink, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 600,
        fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Icono nombre={icono} tamano={20} />
      {children}
    </button>
  )
}

/** El encabezado de grupo de M08: icono, el para-qué-sirve y cuántos hay a la derecha. No es
 *  plegable: los tres grupos entran en una pantalla y plegarlos escondería el apto médico vencido
 *  detrás de un toque. */
export function Grupo({ titulo, cuenta, icono = 'doc', children, testid }: {
  titulo: string
  cuenta: number
  icono?: NombreIcono
  children: ReactNode
  testid?: string
}) {
  return (
    <section style={{ marginBottom: 18 }} data-testid={testid}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
        <span style={{ display: 'flex', color: C.muted, flexShrink: 0 }}><Icono nombre={icono} tamano={17} /></span>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{titulo}</h2>
        <span style={{
          marginLeft: 'auto', fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
          fontSize: 12.5, color: C.muted,
        }}>
          {cuenta}
        </span>
      </div>
      <div style={{
        background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, overflow: 'hidden',
      }}>
        {children}
      </div>
    </section>
  )
}

/**
 * UNA FILA DENTRO DE UN GRUPO DE M08.
 *
 * El estado se escribe con su color —`vencido` en rojo, `vence en 20 días` en ámbar— porque son dos
 * cosas distintas: una es una cuenta regresiva y la otra un hecho consumado. La ausencia se nombra
 * («sin cargar») y nunca se deja el renglón en blanco: un hueco se lee como que todavía está
 * cargando.
 */
export function FilaGrupo({
  titulo, nota, tono = 'faint', href, accion, marca, testid, destacada, icono,
}: {
  titulo: ReactNode
  nota: ReactNode
  tono?: 'faint' | 'warn' | 'neg' | 'pos'
  href?: string
  accion?: ReactNode
  /** La pastilla «nuevo» del mockup, a la derecha del título. */
  marca?: string
  testid?: string
  destacada?: boolean
  icono?: NombreIcono
}) {
  const color = tono === 'neg' ? C.neg : tono === 'warn' ? C.warn : tono === 'pos' ? C.pos : C.faint
  const cuerpo = (
    <>
      {icono && (
        <span style={{ display: 'flex', color, flexShrink: 0 }}><Icono nombre={icono} tamano={20} /></span>
      )}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 13.5, fontWeight: destacada ? 600 : 400, color: C.ink, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {titulo}
          </span>
          {marca && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: C.ink, background: C.marca,
              borderRadius: 9, padding: '1px 7px', flexShrink: 0,
            }}>
              {marca}
            </span>
          )}
        </span>
        <span style={{
          display: 'block', fontSize: 11.5, color, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {nota}
        </span>
      </span>
      {accion}
    </>
  )
  const estilo = {
    display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', minHeight: 60,
    borderBottom: `1px solid ${C.divisor}`, background: destacada ? C.marcaTenue : 'transparent',
    color: C.ink,
  }
  return href
    ? <a href={href} data-testid={testid} style={estilo}>{cuerpo}</a>
    : <div data-testid={testid} style={estilo}>{cuerpo}</div>
}
