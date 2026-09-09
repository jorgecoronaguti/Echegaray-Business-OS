// LA BARRA DE SOLAPAS DE LIQUIDACIÓN — nivel 3: subrayado grafito, sin fondo.
//
// El nivel 1 (Administración) es amarillo y el nivel 2 (Personal) grafito con subrayado de 2 px.
// Éste es el tercero y va más liviano: 1,5 px y 12,5 px de tipografía. Tres niveles con el mismo
// peso dejan de ser una jerarquía.
//
// UNA SOLAPA SIN PANTALLA NO ES UN ENLACE: se dibuja apagada. Prometer un clic que lleva a una
// pantalla en blanco es peor que no ofrecerlo.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { SOLAPAS, type ClaveDeSolapa } from './index'

export function BarraSolapas({ activa, hrefDe }: {
  activa: ClaveDeSolapa
  hrefDe: (solapa: ClaveDeSolapa) => string
}) {
  return (
    <div
      data-testid="solapas-liquidacion"
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '11px 0',
        fontSize: '12.5px', borderBottom: `1px solid ${V.linea}`,
      }}
    >
      {SOLAPAS.map((s) => {
        const esActiva = s.clave === activa
        const estilo: React.CSSProperties = {
          paddingBottom: 3,
          fontWeight: esActiva ? 600 : 400,
          color: esActiva ? V.tinta : (s.Componente ? V.apagado : V.tenue),
          boxShadow: esActiva ? `inset 0 -1.5px 0 ${V.grafito}` : undefined,
          textDecoration: 'none',
        }
        if (!s.Componente || esActiva) {
          return (
            <span key={s.clave} data-testid={`solapa-${s.clave}`} style={estilo}
              title={s.Componente ? undefined : 'Todavía no está construida.'}>{s.titulo}</span>
          )
        }
        return (
          <Link key={s.clave} href={hrefDe(s.clave)} prefetch={false}
            data-testid={`solapa-${s.clave}`} style={estilo}>{s.titulo}</Link>
        )
      })}
    </div>
  )
}
