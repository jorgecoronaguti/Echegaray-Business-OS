import type { CSSProperties, ReactNode } from 'react'
import { P } from '../estilos'

// LAS PIEZAS CHICAS QUE EL `29` REPITE — un encabezado de bloque, un rótulo de dato, un aviso.
//
// Están acá y no en el canon de Administración porque el portal las escribe distinto: el encabezado
// de bloque del `29` es un icono #91918B + título de 12,5px/600 + una nota a la derecha, cerrado con
// una línea de 1px, y NO lleva la caja blanca con radio que llevan los bloques del OS interno.

/** El encabezado de una sección: icono, título, y a la derecha lo que aclare (`29:239`, `29:419`). */
export function TituloBloque({ icono, titulo, nota, accion, separacion = 10 }: {
  icono?: ReactNode
  titulo: string
  nota?: string | null
  accion?: ReactNode
  /** `29` usa 10px, 12px cuando abajo va una grilla de fotos. */
  separacion?: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      paddingBottom: separacion, borderBottom: `1px solid ${P.linea}`,
    }}>
      {icono && <span style={{ display: 'flex', color: P.tenue }}>{icono}</span>}
      <div style={{ fontSize: '12.5px', fontWeight: 600, color: P.tinta }}>{titulo}</div>
      {nota && <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: P.tenue }}>{nota}</span>}
      {accion && <div style={{ marginLeft: nota ? undefined : 'auto' }}>{accion}</div>}
    </div>
  )
}

/** Un dato de la franja superior: rótulo en versalitas y valor grande (`29:57`, `29:388`). */
export function DatoFranja({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10.5px', color: P.tenue, letterSpacing: '.05em' }}>{rotulo}</div>
      {children}
    </div>
  )
}

/** El avatar redondo de iniciales del header (`29:37`) y del teléfono (`30:69`). */
export function Avatar({ iniciales, s = 28 }: { iniciales: string; s?: number }) {
  return (
    <div style={{
      width: s, height: s, borderRadius: s / 2, background: P.avatar, color: P.tintaSuave,
      fontSize: '10.5px', fontWeight: 600, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      {iniciales}
    </div>
  )
}

/**
 * LO QUE SE DIBUJA CUANDO NO SE PUDO LEER — nunca una lista vacía.
 *
 * Un portal vacío le dice al cliente «Echegaray no te emitió nada», que es una afirmación sobre la
 * relación comercial. Cuando el service devuelve un motivo, se muestra EL MOTIVO.
 */
export function AvisoPortal({ texto, tono = 'neutro' }: {
  texto: string
  tono?: 'neutro' | 'atencion'
}) {
  const ambar = tono === 'atencion'
  return (
    <div style={{
      background: ambar ? P.ambarFondo : P.superficie,
      border: `1px solid ${ambar ? P.ambarBorde : P.linea}`,
      borderRadius: 10, padding: '13px 16px',
      fontSize: '12.5px', lineHeight: 1.5, color: ambar ? P.warn : P.apagado,
    }}>
      {texto}
    </div>
  )
}

/** El estado vacío de una sección que sí se pudo leer y no tiene nada. Una línea, sin caja. */
export function VacioPortal({ texto }: { texto: string }) {
  return (
    <div style={{ fontSize: '12px', color: P.tenue, padding: '14px 0' }}>{texto}</div>
  )
}

/** La barra de avance de la cabecera y de la tabla de rubros (`29:60`, `29:174`). */
export function BarraPortal({ pct, color, ancho, alto = 5 }: {
  /** 0–100. */
  pct: number | null
  color?: string
  /** Ancho fijo en px; sin él, la barra ocupa lo que le den. */
  ancho?: number
  alto?: number
}) {
  const estilo: CSSProperties = {
    width: ancho ?? undefined, flex: ancho ? undefined : 1,
    height: alto, background: P.pista, borderRadius: 3, overflow: 'hidden',
  }
  // `null` dibuja la pista vacía, no una barra al 0 %: «sin avance cargado» y «no arrancó» se ven
  // igual de vacíos, y la diferencia la escribe el rótulo de al lado, no la barra.
  const ancho_pct = pct === null ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div style={estilo}>
      {pct !== null && (
        <div style={{ height: '100%', width: `${ancho_pct}%`, background: color ?? P.info }} />
      )}
    </div>
  )
}
