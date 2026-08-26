// LA PRIMERA LÍNEA DE CONTENIDO ES TRABAJO, NO UN MAESTRO — criterio 1 del patrón v2.
//
// Lo primero que ve quien entra a una sección no es su lista: es lo que hay que hacer. La lista
// está debajo, donde va lo que no reclama nada. Es el mismo bloque en las ocho secciones
// (`22v2:60-79`, `25v2:40-56`, `19v2`, `17v2`, `27v2`), y por eso vive en `shared` y no en una.
//
// ═══ CRITERIO 2: CADA FILA DICE QUÉ BLOQUEA Y TRAE SU VERBO ═══
//
// No es un chip que cuenta. Son tres cosas en la misma fila: LA CIFRA (ámbar, tabular, alineada a
// la derecha para que dos filas se comparen de un vistazo), QUÉ BLOQUEA y EL VERBO que lo resuelve.
// QUIÉNES son esas señales lo decide el servicio de cada sección, que se prueba sin React; acá sólo
// se dibuja. Una cifra en ausencia se escribe «—» y nunca 0.
//
// EL ICONO LO ELIGE LA SEÑAL, NO LA PANTALLA (criterio 5: iconos sólo donde la columna mezcla
// tipos). Una sección cuyas señales son todas del mismo tipo pasa un icono único; una que mezcla
// —Clientes reclama datos del cliente y contratos de obra— manda uno por fila.

import Link from 'next/link'
import { resumirTrabajo, type SenalDeTrabajo } from './trabajo'
import { ALTO_V2, CAJA_CONTENIDO, FILO_BLOQUEA, V } from './patron'

export type { SenalDeTrabajo }

/** El componente de icono: la misma firma que todo el §11. */
type Icono = (p: { className?: string }) => React.ReactElement

export function TrabajoDeSeccion({ senales, icono, iconos, vacio, testid = 'lo-que-pide-trabajo' }: {
  senales: SenalDeTrabajo[]
  /** El icono de todas las filas cuando la sección no mezcla tipos. */
  icono: Icono
  /** Uno por `senal.icono` cuando sí los mezcla. Lo que falte cae en `icono`. */
  iconos?: Record<string, Icono>
  /** Qué se escribe cuando no hay nada que reclamar. El silencio a secas se lee como un error. */
  vacio: string
  testid?: string
}) {
  return (
    <section style={{ padding: '24px 20px 0' }} data-testid={testid}>
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
              {vacio}
            </p>
          )
        : senales.map((s, i) => {
            const Icono = (s.icono && iconos?.[s.icono]) || icono
            return (
              <Link
                key={s.clave}
                href={s.href}
                data-testid={`senal-${s.clave}`}
                className={`grid cursor-pointer items-center gap-[14px] ${CAJA_CONTENIDO} grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_200px] hover:bg-[#F2F1ED]`}
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
                    <Icono className="h-[14px] w-[14px]" />
                  </span>
                  <span className="truncate" style={{ fontSize: '12.5px', color: V.tinta }}>{s.texto}</span>
                </span>
                <span className="truncate" style={{ fontSize: '12px', color: V.apagado }}>{s.bloquea}</span>
                <span style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta, textAlign: 'right', paddingRight: 2 }}>
                  {s.accion} →
                </span>
              </Link>
            )
          })}
    </section>
  )
}
