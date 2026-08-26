import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { obrasDelCliente, obraElegida } from '../../datos'
import { pagosDeObra, hoyEnObra } from '../datosObra'
import { estadoDePago, pesos, diaMes } from '../../cronograma'
import { IconoEstado, Vacio, Fila } from '../../Piezas'
import { IconoDescarga } from '../../iconos'

// FACTURAS Y RECIBOS — una lista sola.
//
// No hay dos pestañas ni dos tablas: una factura y su recibo son el mismo hecho visto en dos momentos.
// La pagada muestra el número de recibo en la misma fila; separarlos obligaría al cliente a cruzar
// dos listas para contestar «¿esta ya la pagué?».
//
// Sólo aparece lo que TIENE número de factura. Un certificado todavía sin facturar no es una factura
// vacía: no está en esta pantalla, está en Pagos como «sin factura».

export const dynamic = 'force-dynamic'

export default async function Facturas({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const obras = await obrasDelCliente(sesion.clienteId)
  const elegida = obraElegida(obras, (await searchParams).obra)
  if (!elegida) return <Vacio>Todavía no tenemos ninguna obra asociada a su mail.</Vacio>

  const hoy = hoyEnObra()
  const todos = await pagosDeObra(elegida.id)
  const facturas = todos.filter((p) => p.facturaNumero)
  const sinFacturar = todos.length - facturas.length

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Facturas y recibos</h1>
        <span className="text-[12.5px] text-faint">
          {facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}
        </span>
      </div>

      {facturas.length === 0 ? (
        <div className="mt-6">
          <Vacio>
            {todos.length
              ? 'Todavía no emitimos ninguna factura de esta obra.'
              : 'Todavía no cargamos el plan de pagos de esta obra.'}
          </Vacio>
        </div>
      ) : (
        <div className="mt-5">
          {facturas.map((p) => {
            const estado = estadoDePago(p, hoy)
            return (
              <Fila key={p.id}>
                <IconoEstado estado={estado} />
                <span className="tnum min-w-0 flex-1 basis-[38%] truncate font-mono text-sm">{p.facturaNumero}</span>
                <span className="tnum w-[70px] font-mono text-[13px] text-muted">
                  {diaMes(p.fechaPago ?? p.fechaPrevista)}
                </span>
                {/* El recibo va pegado a su factura: es la respuesta a «¿ésta ya la pagué?». */}
                <span className="w-[118px] text-[12.5px] text-pos">
                  {p.reciboNumero ? `Recibo ${p.reciboNumero}` : ''}
                </span>
                <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto)}</span>
                <span className="grid min-h-11 min-w-11 place-items-center text-faint" aria-hidden>
                  <IconoDescarga tamano={18} />
                </span>
              </Fila>
            )
          })}
        </div>
      )}

      {sinFacturar ? (
        <p className="mt-3 text-[12.5px] text-faint">
          {sinFacturar === 1 ? 'Hay 1 pago del plan todavía sin facturar' : `Hay ${sinFacturar} pagos del plan todavía sin facturar`} — están en Pagos.
        </p>
      ) : null}
    </>
  )
}
