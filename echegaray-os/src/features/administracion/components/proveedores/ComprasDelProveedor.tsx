// LA LISTA DE COMPRAS DE UN PROVEEDOR, CON SU COMPROBANTE AL LADO — la cara «Compras» de la ficha.
//
// Pedido del dueño, 14/09/2026: «no quiero una solapa de comprobantes en proveedores, quiero los
// comprobantes adjuntos al lado de cada compra hecha, tal como aparece en pestaña compras».
//
// Es UNA lista: la de compras que la ficha ya tenía, ahora leída de `proveedor_compra` (CUIT, o
// nombre resuelto si la compra no trae CUIT) y con la columna del papel a la derecha. La solapa
// «Comprobantes» que la duplicaba salió, y con ella la cara «Papeles».
//
// Desde el 15/09/2026 la columna Obra es el MISMO desplegable de Compras: quien revisa las facturas
// de un proveedor las imputa acá, sin cambiar de pantalla.
//
// ═══ A 390px SCROLLEA ADENTRO ═══
//
// Seis columnas no entran en un teléfono y ninguna sobra. La caja hace `overflow-x: auto` con ancho
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
import { ANCHO_MINIMO_COMPRAS, COLS_COMPROBANTES } from './columnasComprobantes'
import { FilaComprobanteProveedor } from './FilaComprobanteProveedor'

const PAPEL: { clave: FiltroPapel; etiqueta: string }[] = [
  { clave: 'todos', etiqueta: 'Todas' },
  { clave: 'con', etiqueta: 'Con comprobante' },
  { clave: 'sin', etiqueta: 'Sin comprobante' },
]

export function ComprasDelProveedor({ proveedorId, lectura, filtros, anioActual, opcionesObra }: {
  proveedorId: string
  lectura: ServiceResult<ComprasConPapel>
  filtros: FiltrosComprobantes
  anioActual: number
  /** El MISMO desplegable que Compras. Vacío ⇒ la obra se ve pero no se elige. */
  opcionesObra: string[]
}) {
  if (lectura.error !== null) {
    return <Aviso tono="neg" titulo="No pude leer las compras de este proveedor">{lectura.error}</Aviso>
  }
  const { filas, truncado, papelesSinLeer, obraEditable } = lectura.data
  // «Compras» es la cara por defecto: su URL no lleva `vista`.
  const base = `/administracion/proveedores/${proveedorId}`
  const url = (cambio: { anio?: AnioFiltro; papel?: FiltroPapel }) => {
    const p = new URLSearchParams()
    const anio = cambio.anio ?? filtros.anio
    const papel = cambio.papel ?? filtros.papel
    if (anio !== anioActual) p.set('anio', String(anio))
    if (papel !== 'todos') p.set('papel', papel)
    if (filtros.numero) p.set('n', filtros.numero)
    const qs = p.toString()
    return qs ? `${base}?${qs}` : base
  }

  const delAnioElegido = delAnio(filas, filtros.anio)
  const cuentas = contarPapeles(delAnioElegido)
  const visibles = filtrarComprobantes(delAnioElegido, filtros)

  return (
    <div data-testid="compras-proveedor">
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
            anio: filtros.anio === anioActual ? undefined : String(filtros.anio),
            papel: filtros.papel === 'todos' ? undefined : filtros.papel,
          }}
          testid="buscar-compra"
        />
      </div>

      <div style={{ overflowX: 'auto' }} data-testid="caja-scroll-compras">
        <div style={{ minWidth: ANCHO_MINIMO_COMPRAS }}>
          <div className={`grid gap-[14px] ${COLS_COMPROBANTES}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
            <RotuloCol>Fecha</RotuloCol>
            <RotuloCol>Concepto</RotuloCol>
            <RotuloCol>Obra</RotuloCol>
            <RotuloCol derecha>Importe</RotuloCol>
            <RotuloCol>Estado</RotuloCol>
            <RotuloCol>Comprobante</RotuloCol>
          </div>
          {visibles.map((c) => (
            <FilaComprobanteProveedor key={`${c.fila}-${c.clave ?? ''}`} c={c}
              papelesSinLeer={papelesSinLeer} proveedorId={proveedorId} opcionesObra={opcionesObra}
              // SIN OPCIONES NO SE EDITA: un desplegable vacío deja elegir «sin imputar» y nada más,
              // que es una forma de borrar la obra sin poder ponerle otra.
              obraEditable={obraEditable && opcionesObra.length > 0}
            />
          ))}
        </div>
      </div>

      {visibles.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="compras-vacio">
          {delAnioElegido.length === 0
            ? (filtros.anio === SIN_FECHA ? 'Ninguna compra sin fecha.' : `Sin compras en ${filtros.anio}.`)
            : 'Ninguna compra coincide.'}
        </p>
      )}
      {truncado && (
        <p style={{ fontSize: '11px', color: V.warn, paddingTop: 8 }} data-testid="compras-truncado">
          La lectura llegó al tope: puede haber compras que no se listan.
        </p>
      )}
    </div>
  )
}
