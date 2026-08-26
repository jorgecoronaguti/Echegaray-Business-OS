// 26 v2 · LAS CARAS DE LA FICHA DE UN CLIENTE — `26 · Cliente Ficha v2.dc.html` (108-230).
//
// Obras, presupuestos y actividad, sin caja: encabezado de 26px cerrado por un filo `#D7D5CF`,
// filas de 40-42px con divisor `#EDECE8` y sangría de 13px. Es el criterio 3 del patrón.
//
// ═══ LO QUE NO SE DIBUJA, Y POR QUÉ ═══
//
//   COSTO REAL   estaba en la tabla de agosto y el mockup 26 no lo trae. La ficha del cliente es la
//                cara COMERCIAL de la relación —qué se contrató y cómo va—; el costo vive en la
//                obra, que es donde se decide sobre él. Sigue a un clic, en `/obras/[id]`.
//   AVANCE       sólo se dibuja como barra cuando `avance_pct` es una fracción 0-100 real. Una obra
//                sin cronograma no tiene 0 % de avance: no tiene avance, y lo dice con palabras.

import Link from 'next/link'
import { CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { IconoObra, IconoPresupuesto } from '@/shared/components/iconos'
import { plata } from '@/features/obras/components/formato'
import { ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'

/** Verde hecho · azul en curso · gris el resto. Nunca sólo color: al lado va siempre la palabra. */
const PUNTO_ESTADO: Record<string, string> = {
  activa: '#175CD3', pausada: '#B54708', cerrada: '#067647',
}

const COLS_OBRAS
  = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,150px)_minmax(0,140px)]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,140px)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

/** OBRA · ESTADO · JEFE DE OBRA · CONTRATADO. `26v2:110-146`. */
export function ObrasDelCliente({ obras, veEconomia, vacio }: {
  obras: ObraPanel[]
  /** El jefe de obra no ve el precio de venta. Lo decide la RLS; acá se deja de dibujar la columna. */
  veEconomia: boolean
  vacio: string
}) {
  return (
    <div data-testid="obras-del-cliente">
      <div className={`grid gap-[14px] ${COLS_OBRAS}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Obra</RotuloCol>
        <RotuloCol>Estado</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Jefe de obra</RotuloCol></span>
        <RotuloCol derecha>{veEconomia ? 'Contratado' : 'Etapa'}</RotuloCol>
      </div>

      {obras.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="obras-cliente-vacio">
          {vacio}
        </p>
      )}

      {obras.map((o) => (
        <Link
          key={o.obra_id} href={`/obras/${o.obra_id}`} prefetch={false} data-testid="fila-obra-cliente"
          className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS_OBRAS} hover:bg-[#F2F1ED]`}
          style={{
            height: 42, paddingLeft: 13, borderBottom: `1px solid ${V.lineaFila}`,
            // Una obra sin monto contratado bloquea: no se puede decir qué se le facturó al cliente.
            boxShadow: veEconomia && o.monto_contratado == null ? FILO_BLOQUEA : 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
              <IconoObra className="h-[15px] w-[15px]" />
            </span>
            <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
              {o.nombre}
            </span>
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              aria-hidden
              style={{
                width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                background: PUNTO_ESTADO[o.estado] ?? V.inerte,
              }}
            />
            <span style={{ fontSize: '12px', color: V.tintaSuave, flexShrink: 0 }}>{o.estado}</span>
            {/* BARRA SÓLO SI EL VALOR ES UNA FRACCIÓN REAL. Sin cronograma no hay 0 %. */}
            {o.avance_pct != null
              ? (
                  <>
                    <span
                      aria-hidden
                      style={{ display: 'flex', height: 4, width: 70, borderRadius: 2, background: V.lineaFila, flexShrink: 0, marginLeft: 2, overflow: 'hidden' }}
                    >
                      <span style={{ width: `${Math.max(0, Math.min(100, o.avance_pct))}%`, background: V.grafito, borderRadius: 2 }} />
                    </span>
                    <span className="font-mono tabular-nums shrink-0" style={{ fontSize: '11.5px', color: V.apagado }}>
                      {o.avance_pct} %
                    </span>
                  </>
                )
              : (
                  <span className="truncate" style={{ fontSize: '11.5px', color: V.tenue }}>
                    {o.n_actividades ? 'sin avance cargado' : 'sin cronograma'}
                  </span>
                )}
          </span>

          <span className={`grid ${SOLO_ANCHO}`}>
            <span className="truncate" style={{ fontSize: '12px', color: o.jefe_obra ? V.tintaSuave : V.tenue }}>
              {o.jefe_obra ?? 'sin jefe asignado'}
            </span>
          </span>

          {veEconomia
            ? (
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: '12px', color: o.monto_contratado == null ? V.warn : V.tinta, textAlign: 'right' }}
                >
                  {o.monto_contratado == null ? 'sin monto' : plata(o.monto_contratado)}
                </span>
              )
            : (
                <span style={{ fontSize: '12px', color: V.tenue, textAlign: 'right' }}>
                  {o.etapa ? ETAPA_LABEL[o.etapa] : 'etapa sin declarar'}
                </span>
              )}
        </Link>
      ))}
    </div>
  )
}

export interface PresupuestoDeFicha {
  presupuesto_id: string
  nombre: string
  estado: string | null
  revision: number | string | null
  total: number | null
  /**
   * El verbo de la fila, YA RESUELTO por la página. Objeto y no función: una arrow creada en un
   * Server Component y pasada como prop compila, pasa `build` y revienta en producción con React
   * #419 dejando la pantalla en blanco.
   */
  accion?: { texto: string; href: string }
}

const COLS_PRES
  = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,140px)_minmax(0,150px)]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,150px)]'

/** PRESUPUESTO · ESTADO · MONTO · verbo. `26v2:183-201`. */
export function PresupuestosDelCliente({ filas }: { filas: PresupuestoDeFicha[] }) {
  return (
    <div data-testid="presupuestos-del-cliente">
      <div className={`grid gap-[14px] ${COLS_PRES}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Presupuesto</RotuloCol>
        <RotuloCol>Estado</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Monto</RotuloCol></span>
        <RotuloCol derecha />
      </div>

      {filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="presupuestos-vacio">
          Este cliente no tiene ningún presupuesto cargado.
        </p>
      )}

      {filas.map((p) => {
        const v = p.accion
        return (
          <Link
            key={p.presupuesto_id} href={`/presupuestos/${p.presupuesto_id}`} prefetch={false}
            data-testid="fila-presupuesto"
            className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS_PRES} hover:bg-[#F2F1ED]`}
            style={{ height: 42, paddingLeft: 13, borderBottom: `1px solid ${V.lineaFila}` }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <IconoPresupuesto className="h-[15px] w-[15px]" />
              </span>
              <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
                {p.nombre}
              </span>
              {p.revision != null && (
                <span className="font-mono shrink-0" style={{ fontSize: '10.5px', color: V.inerte }}>
                  rev. {p.revision}
                </span>
              )}
            </span>

            <span className="truncate" style={{ fontSize: '12px', color: p.estado ? V.tintaSuave : V.tenue }}>
              {p.estado ?? 'sin estado'}
            </span>

            <span className={`grid ${SOLO_ANCHO}`}>
              {/* SIN TOTAL NO ES $ 0: el presupuesto existe y todavía no está valorizado. */}
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '12px', color: p.total == null ? V.tenue : V.tinta, textAlign: 'right' }}
              >
                {p.total == null ? 'sin valorizar' : plata(p.total)}
              </span>
            </span>

            <span
              style={{
                fontSize: '12.5px', fontWeight: 500, textAlign: 'right', paddingRight: 2,
                color: v ? V.tinta : V.lupa,
              }}
            >
              {v ? `${v.texto} →` : ''}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
