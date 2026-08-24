// LA CUENTA DEL CLIENTE — solapa «Cuenta» del canónico 26. Sólo con permiso económico.
//
// ═══ QUÉ MUESTRA, Y QUÉ NO PUEDE MOSTRAR TODAVÍA ═══
//
// El mockup dibuja la relación económica con el cliente. De esa relación esta base contesta hoy DOS
// cosas, y las dos por obra: lo CONTRATADO (lo que el cliente se comprometió a pagar) y el COSTO
// REAL imputado (lo que llevamos gastado en su obra). Las dos salen de `obra_panel`, que es la
// misma fuente que la tabla de Obras de esta ficha: la solapa no puede discrepar con la de al lado.
//
// LO QUE FALTA SE DICE, NO SE INVENTA: certificado, facturado y cobrado por cliente no existen como
// dato consolidado en esta base —viven en el Sheet de Cobranzas y todavía no tienen vista propia—,
// así que acá no hay saldo. Un «saldo» calculado como contratado − costo sería un margen disfrazado
// de cuenta corriente: mezclaría devengado con percibido y contradiría las reglas 4 y 5 del OS.
//
// Y NO SE ESCRIBE MARGEN. Es la prohibición viva del resumen (canon 23/08): el margen de una obra
// se lee en la obra, junto a su cascada.

import { Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { plata } from '@/features/obras/components/formato'
import type { ObraPanel } from '@/features/obras/types'

/** Suma sólo lo que tiene número. `null` cuando ninguna obra lo trae: sumar nada no da cero. */
function suma(obras: ObraPanel[], campo: 'monto_contratado' | 'costo_real'): number | null {
  const con = obras.filter((o) => o[campo] != null)
  return con.length === 0 ? null : con.reduce((s, o) => s + (o[campo] ?? 0), 0)
}

export function FichaCuenta({ obras }: { obras: ObraPanel[] }) {
  if (obras.length === 0) {
    return <Vacio>Este cliente todavía no tiene obras: no hay cuenta que mostrar.</Vacio>
  }
  const contratado = suma(obras, 'monto_contratado')
  const costo = suma(obras, 'costo_real')
  const sinMonto = obras.filter((o) => o.monto_contratado == null).length

  return (
    <div data-testid="ficha-cuenta">
      <Tabla testid="tabla-cuenta" minWidth={520}>
        <THead>
          <Th>Obra</Th>
          <Th>Estado</Th>
          <Th num>Contratado</Th>
          <Th num>Costo real</Th>
        </THead>
        <tbody>
          {obras.map((o) => (
            <Tr key={o.obra_id} data-testid="fila-cuenta">
              <Td fuerte className="max-w-0"><span className="block truncate">{o.nombre}</span></Td>
              <Td>{o.estado}</Td>
              <Td num>{o.monto_contratado == null ? <Nulo>sin cargar</Nulo> : plata(o.monto_contratado)}</Td>
              <Td num>{o.costo_real == null ? <Nulo>sin imputar</Nulo> : plata(o.costo_real)}</Td>
            </Tr>
          ))}
        </tbody>
        <tfoot>
          <Tr>
            <Td colSpan={2} fuerte>
              Total
              {/* UN TOTAL QUE SE COME LAS OBRAS SIN MONTO MIENTE HACIA ABAJO. Se dice cuántas
                  quedaron afuera, al lado del número, no al pie en letra chica. */}
              {sinMonto > 0 && (
                <span className="ml-2 text-[11.5px] font-normal text-warn" data-testid="cuenta-sin-monto">
                  {sinMonto} sin contratado cargado
                </span>
              )}
            </Td>
            <Td num>{contratado == null ? <Nulo>sin cargar</Nulo> : <Num>{plata(contratado)}</Num>}</Td>
            <Td num>{costo == null ? <Nulo>sin imputar</Nulo> : <Num>{plata(costo)}</Num>}</Td>
          </Tr>
        </tfoot>
      </Tabla>
      <p className="mt-3 max-w-[620px] text-[11.5px] leading-relaxed text-muted">
        Certificado, facturado y cobrado no están en esta solapa porque esta base todavía no los
        consolida por cliente. No es que valgan cero: no hay fuente. El estado de cobranza se mira
        hoy en el Flujo de Caja.
      </p>
    </div>
  )
}
