// LA PRIMERA LÍNEA DE CONTENIDO ES TRABAJO, NO UN MAESTRO — criterio 1 del patrón v2.
//
// Lo primero que ve quien entra a Proveedores no es la lista de proveedores: es lo que hay que
// hacer. La lista está debajo, donde va lo que no reclama nada.
//
// ═══ CRITERIO 2: CADA FILA DICE QUÉ BLOQUEA Y TRAE SU VERBO ═══
//
// No es un chip que cuenta. Son tres cosas en la misma fila: LA CIFRA (ámbar, tabular, alineada a
// la derecha para que dos filas se comparen de un vistazo), QUÉ BLOQUEA y EL VERBO que lo resuelve.
// QUIÉNES son esas señales y qué dicen lo decide `services/senalesProveedores.ts`, que se prueba
// sin React; acá sólo se dibuja. Una cifra en ausencia se escribe «—» y nunca 0.

import Link from 'next/link'
import { IconoProveedor } from '@/shared/components/iconos'
import { resumirTrabajo, type SenalDeTrabajo } from '../../services/senalesProveedores'
import { ALTO_V2, FILO_BLOQUEA, V } from './patron'

export type { SenalDeTrabajo }

export function LoQuePideTrabajo({ senales }: { senales: SenalDeTrabajo[] }) {
  return (
    <section style={{ padding: '24px 20px 0' }} data-testid="lo-que-pide-trabajo">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: V.tinta, letterSpacing: '-.01em' }}>
          Lo que pide trabajo
        </h2>
        <span style={{ fontSize: '12px', color: V.tenue }} data-testid="trabajo-resumen">
          {resumirTrabajo(senales)}
        </span>
      </div>

      {senales.length === 0
        ? (
            <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 2 }} data-testid="trabajo-vacio">
              Ningún proveedor sin CUIT y ningún nombre de Compras sin resolver.
            </p>
          )
        : senales.map((s, i) => (
            <Link
              key={s.clave}
              href={s.href}
              data-testid={`senal-${s.clave}`}
              className="grid cursor-pointer items-center gap-[14px] grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_200px] hover:bg-[#F2F1ED]"
              style={{
                height: ALTO_V2.trabajo,
                borderTop: `1px solid ${V.lineaFila}`,
                // Sólo la última cierra abajo: entre filas el filo superior de la siguiente alcanza,
                // y duplicarlo dibujaría una línea de 2px que el mockup no tiene.
                borderBottom: i === senales.length - 1 ? `1px solid ${V.lineaFila}` : 'none',
                boxShadow: FILO_BLOQUEA,
              }}
            >
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '15px', fontWeight: 600, color: V.warn, textAlign: 'right' }}
                data-testid={`senal-${s.clave}-n`}
              >
                {s.numero ?? '—'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerteTrabajo, flexShrink: 0 }}>
                  <IconoProveedor className="h-[14px] w-[14px]" />
                </span>
                <span className="truncate" style={{ fontSize: '12.5px', color: V.tinta }}>{s.texto}</span>
              </span>
              <span className="truncate" style={{ fontSize: '12px', color: V.apagado }}>{s.bloquea}</span>
              <span style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta, textAlign: 'right', paddingRight: 2 }}>
                {s.accion} →
              </span>
            </Link>
          ))}
    </section>
  )
}
