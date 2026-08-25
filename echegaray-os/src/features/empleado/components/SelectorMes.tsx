import Link from 'next/link'
import { C, HOVER_SUAVE } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'

// EL NAVEGADOR DE PERÍODO — porte literal de la franja de `M06 · Mis horas.dc.html`.
//
// El mockup no dibuja dos pestañas: dibuja una barra blanca con `‹`, el nombre del período centrado
// con su rango debajo, y `›` a la derecha APAGADO cuando no hay período siguiente. Es el mismo
// gesto que un calendario de teléfono y no obliga a leer dos etiquetas para elegir una.
//
// LA VENTANA VIAJA EN LA URL para que volver a la pantalla devuelva al mes que se estaba mirando:
// con estado local, cada vuelta reinicia a «este mes» y quien está revisando julio lo pierde.
//
// EL `›` APAGADO NO ES UN ENLACE: no hay mes siguiente al actual, y un objetivo que no lleva a
// ningún lado enseña a desconfiar de los objetivos.

export function SelectorMes({
  base, actual, titulo, rango,
}: {
  base: string
  actual: 'mes' | 'mes-pasado'
  /** «Este mes» / «Julio 2026». Lo arma la pantalla, que es la que sabe qué ventana pidió. */
  titulo: string
  /** `01/08 – 31/08`. */
  rango: string
}) {
  const enElActual = actual === 'mes'
  return (
    <div
      data-testid="selector-mes"
      style={{
        background: C.surface, borderBottom: `1px solid ${C.linea}`, display: 'flex',
        alignItems: 'center', gap: 8, padding: '8px 12px',
      }}
    >
      <Link
        href={`${base}?ver=mes-pasado`}
        data-testid="mes-mes-pasado"
        title="Período anterior"
        aria-label="Período anterior"
        aria-current={!enElActual ? 'page' : undefined}
        className={HOVER_SUAVE}
        style={{
          width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: enElActual ? C.muted : C.tenue, flexShrink: 0,
        }}
      >
        <Icono nombre="volver" tamano={20} />
      </Link>
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: C.muted }}>{rango}</div>
      </div>
      {enElActual ? (
        <span
          aria-disabled
          title="No hay un período posterior a éste"
          style={{
            width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: C.lineaFuerte, flexShrink: 0, cursor: 'not-allowed',
          }}
        >
          <Icono nombre="siguiente" tamano={20} />
        </span>
      ) : (
        <Link
          href={`${base}?ver=mes`}
          data-testid="mes-mes"
          title="Período siguiente"
          aria-label="Período siguiente"
          className={HOVER_SUAVE}
          style={{
            width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: C.muted, flexShrink: 0,
          }}
        >
          <Icono nombre="siguiente" tamano={20} />
        </Link>
      )}
    </div>
  )
}
