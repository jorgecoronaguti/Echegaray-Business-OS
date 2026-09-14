// LA SOLAPA «COMPROBANTES» DE LA FICHA DE UN PROVEEDOR — pedido del dueño, 14/09/2026:
// «necesito q proveedores guarde los comprobantes de cada una de las compras q le corresponde,
// asi como haces con compras».
//
// Una fila por compra del año —tenga papel o no—, porque la pregunta es «de qué compras me falta el
// respaldo», y una lista de papeles sola no la contesta. La lectura y sus reglas están en
// `comprobantesProveedorService.ts` y `comprobantesProveedor.ts`; acá sólo se dibuja.
//
// ═══ A 390px LA TABLA SCROLLEA ADENTRO ═══
//
// Seis columnas no entran en un teléfono y ninguna sobra: soltar el número o el papel dejaría la
// fila sin decir de qué compra es o si tiene respaldo. La caja hace `overflow-x: auto` con un ancho
// mínimo propio, así que el documento no se ensancha.

import { BuscadorFilo } from '@/shared/components/v2/BuscadorFilo'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import { Aviso } from '@/shared/components/ds'
import {
  aniosDe, contarPapeles, delAnio, filtrarComprobantes, SIN_FECHA,
  type AnioFiltro, type FiltroPapel, type FiltrosComprobantes,
} from '../../services/comprobantesProveedor'
import type { ComprasConPapel } from '../../services/comprobantesProveedorService'
import type { ServiceResult } from '../../services/comprasSheetService'
import { COLS_COMPROBANTES, FilaComprobanteProveedor } from './FilaComprobanteProveedor'

/** Ancho mínimo de la tabla: la suma de las columnas fijas y los pisos, más los gaps. */
const ANCHO_MINIMO = 760

const PAPEL: { clave: FiltroPapel; etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todas' },
  { clave: 'con', etiqueta: 'Con comprobante' },
  { clave: 'sin', etiqueta: 'Sin comprobante' },
]

export function ComprobantesDelProveedor({ proveedorId, lectura, filtros, anioActual }: {
  proveedorId: string
  lectura: ServiceResult<ComprasConPapel>
  filtros: FiltrosComprobantes
  anioActual: number
}) {
  if (lectura.error !== null) {
    return <Aviso tono="neg" titulo="No pude leer las compras de este proveedor">{lectura.error}</Aviso>
  }
  const { filas, truncado, papelesSinLeer } = lectura.data
  const base = `/administracion/proveedores/${proveedorId}`
  const url = (cambio: { anio?: AnioFiltro; papel?: FiltroPapel }) => {
    const p = new URLSearchParams({ vista: 'comprobantes' })
    const anio = cambio.anio ?? filtros.anio
    const papel = cambio.papel ?? filtros.papel
    if (anio !== anioActual) p.set('anio', String(anio))
    if (papel !== 'todos') p.set('papel', papel)
    if (filtros.numero) p.set('n', filtros.numero)
    return `${base}?${p.toString()}`
  }

  const delAnioElegido = delAnio(filas, filtros.anio)
  const cuentas = contarPapeles(delAnioElegido)
  const visibles = filtrarComprobantes(delAnioElegido, filtros)

  return (
    <div data-testid="comprobantes-proveedor">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 24px', marginBottom: 8 }}>
        <FiltrosSuaves
          testid="filtro-anio"
          opciones={aniosDe(filas, anioActual).map((a) => ({
            clave: String(a), etiqueta: a === SIN_FECHA ? 'sin fecha' : String(a),
            href: url({ anio: a }), activo: a === filtros.anio,
          }))}
          conteo={{ n: delAnioElegido.length, total: filas.length, sustantivo: 'compras' }}
        />
        <FiltrosSuaves
          testid="filtro-papel"
          opciones={PAPEL.map((o) => ({
            ...o, href: url({ papel: o.clave }), activo: o.clave === filtros.papel,
            // Si los papeles no se leyeron, los conteos no se dibujan: un 0 afirmaría algo no medido.
            cuenta: o.clave === 'todos' ? undefined : (papelesSinLeer ? null : cuentas[o.clave]),
          }))}
          conteo={{ n: visibles.length, total: delAnioElegido.length, sustantivo: 'del año' }}
        />
        <BuscadorFilo
          accion={base} q={filtros.numero ?? undefined} placeholder="Buscar por número"
          oculto={{
            vista: 'comprobantes',
            anio: filtros.anio === anioActual ? undefined : String(filtros.anio),
            papel: filtros.papel === 'todos' ? undefined : filtros.papel,
          }}
          testid="buscar-comprobante"
        />
      </div>

      <div style={{ overflowX: 'auto' }} data-testid="caja-scroll-comprobantes">
        <div style={{ minWidth: ANCHO_MINIMO }}>
          <div className={`grid gap-[14px] ${COLS_COMPROBANTES}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
            <RotuloCol>Fecha</RotuloCol>
            <RotuloCol>Comprobante</RotuloCol>
            <RotuloCol>Obra</RotuloCol>
            <RotuloCol derecha>Importe</RotuloCol>
            <RotuloCol>Estado</RotuloCol>
            <RotuloCol>Papel</RotuloCol>
          </div>
          {visibles.map((c) => (
            <FilaComprobanteProveedor key={`${c.fila}-${c.clave ?? ''}`} c={c} papelesSinLeer={papelesSinLeer} />
          ))}
        </div>
      </div>

      {visibles.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="comprobantes-vacio">
          {delAnioElegido.length === 0
            ? (filtros.anio === SIN_FECHA ? 'Ninguna compra sin fecha.' : `Sin compras en ${filtros.anio}.`)
            : 'Ninguna compra coincide.'}
        </p>
      )}
      {truncado && (
        <p style={{ fontSize: '11px', color: V.warn, paddingTop: 8 }} data-testid="comprobantes-truncado">
          La lectura llegó al tope: puede haber compras que no se listan.
        </p>
      )}
    </div>
  )
}
