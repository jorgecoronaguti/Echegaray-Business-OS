// LOS COMPROBANTES DEL PROVEEDOR — «el comprobante ES la compra», una sola tabla.
//
// `design/screens/proveedores-compras.md` §5c. Las columnas son las que el handoff pide y que la
// fuente puede contestar: Fecha · Tipo/número · Concepto · Obra · Total. La columna de estado de
// sincronización NO está: `costos_obra` no publica un estado por fila, y dibujar «Sincronizada»
// para todo el mundo sería un control validado contra la misma información que produce.

import { Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import type { ComprobanteProveedor } from '../services/fichaProveedor'

// ═══ EL IMPORTE TAMBIÉN LO VE EL JEFE DE OBRA, Y ES UNA DECISIÓN ═══
//
// El dueño, 19/08: *«los costos de las obras… y lo que se lleva gastado, sí tienen que ver»*. Lo
// que el jefe de obra no ve es el PRECIO (contratado, margen, certificado), no el costo. Y la base
// ya recortó las FILAS: `costos_obra_select` usa `ve_obra_texto(obra_texto)`, así que sólo llegan
// los comprobantes de sus obras. Esconder la columna en el front mientras PostgREST la manda igual
// sería teatro — la pantalla quedaría más angosta que la base y nadie sabría que el agujero sigue.
export function TablaComprobantes({
  filas,
  truncado,
  total,
}: {
  filas: ComprobanteProveedor[]
  truncado: boolean
  total: number
}) {
  if (filas.length === 0) {
    return <Vacio>Ningún comprobante de Compras está vinculado a este proveedor.</Vacio>
  }
  return (
    <>
      <Tabla testid="tabla-comprobantes" minWidth={720}>
        <THead>
          <Th>Fecha</Th>
          <Th>Comprobante</Th>
          <Th>Concepto</Th>
          <Th>Obra</Th>
          <Th>Pago</Th>
          <Th num>Total</Th>
        </THead>
        <tbody>
          {filas.map((f) => (
            // LA FILA TRANSACCIONAL, MISMA REGLA QUE COMPRAS (COMPONENTS.md §Transaction row): la
            // excepción se marca con la regla interior de 3px en el borde izquierdo, no con una
            // pastilla al final. Acá la excepción es una sola —el comprobante que no llega a
            // ninguna obra—, y es la que hace que el costo de esa obra esté incompleto.
            <Tr
              key={f.id}
              data-testid="fila-comprobante-proveedor"
              className={f.obra_texto?.trim() ? '' : 'shadow-[inset_3px_0_0_var(--os-warn)]'}
            >
              <Td num className="text-muted">{fecha(f.fecha)}</Td>
              <Td>
                <span className="font-mono text-[12px] tabular-nums text-ink">
                  {f.comprobante?.trim() || <Nulo>sin número</Nulo>}
                </span>
                {f.tipo?.trim() && <span className="ml-2 text-[10.5px] text-faint">{f.tipo}</span>}
              </Td>
              <Td className="max-w-0 truncate">{f.concepto?.trim() || <Nulo>sin concepto</Nulo>}</Td>
              <Td className={`max-w-0 truncate ${f.obra_texto?.trim() ? '' : 'text-warn'}`}>
                {f.obra_texto?.trim() || 'sin imputar'}
              </Td>
              <Td className="text-muted">{f.modalidad?.trim() || <Nulo>sin dato</Nulo>}</Td>
              <Td num>
                {f.total === null || f.total === undefined
                  ? <Nulo>sin importe</Nulo>
                  : <span className={f.total < 0 ? 'text-pos' : 'text-ink'}>{plata(f.total)}</span>}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
      {truncado && (
        <p className="mt-2 text-[11px] text-warn" data-testid="comprobantes-truncados">
          Se listan {filas.length} de {total > filas.length ? total : 'más'} comprobantes: los más
          recientes primero. Lo que falta no está vacío, está fuera del tope de esta pantalla.
        </p>
      )}
    </>
  )
}
