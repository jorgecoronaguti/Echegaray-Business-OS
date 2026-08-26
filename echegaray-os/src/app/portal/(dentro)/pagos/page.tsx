import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { obrasDelCliente, obraElegida } from '../../datos'
import { obraDetalle, pagosDeObra, hoyEnObra } from '../datosObra'
import { estadoDePago, proximoPago, resumenDeCobro, pesos, diaMes, ROTULO_ESTADO } from '../../cronograma'
import { IconoEstado, Vacio, Fila, TINTA } from '../../Piezas'

// PAGOS — el cronograma completo, y la FUENTE del próximo pago del Inicio.
//
// Anticipo, certificados y fondo de reparo en una sola lista, en el orden que puso el administrador.
// La fila del próximo va resaltada en amarillo: el amarillo es selección, y acá lo seleccionado es
// «esto es lo que sigue».
//
// EL FONDO DE REPARO VA ÚLTIMO Y NO SUMA A «PENDIENTE»: no es un pago que el cliente deba hacer, es
// plata retenida que se le devuelve. Mezclarlo con la deuda sería cobrarle dos veces en la lectura.

export const dynamic = 'force-dynamic'

export default async function Pagos({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const obras = await obrasDelCliente(sesion.clienteId)
  const elegida = obraElegida(obras, (await searchParams).obra)
  if (!elegida) return <Vacio>Todavía no tenemos ninguna obra asociada a su mail.</Vacio>

  const [obra, pagos] = await Promise.all([obraDetalle(elegida.id), pagosDeObra(elegida.id)])
  const hoy = hoyEnObra()
  const proximo = proximoPago(pagos)
  const r = resumenDeCobro(pagos, obra?.contrato ?? null, hoy)

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Cronograma de pagos</h1>
        <span className="text-[12.5px] text-faint">
          {pagos.length === 1 ? '1 pago' : `${pagos.length} pagos`}
        </span>
      </div>

      {pagos.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no cargamos el plan de pagos de esta obra.</Vacio></div>
      ) : (
        <div className="mt-5">
          {pagos.map((p) => {
            const estado = estadoDePago(p, hoy)
            const esProximo = p.id === proximo?.id
            return (
              <Fila key={p.id} resaltada={esProximo}>
                <IconoEstado estado={esProximo ? 'proximo' : estado} />
                <span className="min-w-0 flex-1 basis-[40%] truncate text-sm">{p.rotulo}</span>
                <span className="tnum w-[74px] font-mono text-[13px] text-muted">
                  {p.tipo === 'fondo_reparo' && !p.fechaPrevista ? 'al final' : diaMes(p.fechaPrevista)}
                </span>
                <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto)}</span>
                {/* Una factura pagada muestra su RECIBO: es el comprobante que le sirve al cliente. */}
                <span className={`w-[112px] text-right text-[12.5px] ${esProximo ? 'font-semibold text-ink' : TINTA[estado]}`}>
                  {p.reciboNumero ? `Recibo ${p.reciboNumero}` : esProximo ? 'próximo' : ROTULO_ESTADO[estado]}
                </span>
              </Fila>
            )
          })}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-x-12 gap-y-5 border-t border-line-strong pt-5">
        <Total rotulo="Contrato" monto={r.contrato} />
        <Total rotulo="Pagado" monto={r.pagado} />
        <Total rotulo="Falta certificar" monto={r.faltaCertificar} />
      </div>
      {r.sinMonto ? (
        <p className="mt-3 text-[12.5px] text-faint">
          {r.sinMonto === 1 ? '1 pago sin monto cargado' : `${r.sinMonto} pagos sin monto cargado`} — no entran en estos totales.
        </p>
      ) : null}
    </>
  )
}

function Total({ rotulo, monto }: { rotulo: string; monto: number | null }) {
  return (
    <div>
      <p className="text-[11px] tracking-[.09em] text-faint">{rotulo.toUpperCase()}</p>
      <p className="tnum mt-1 font-mono text-[19px] font-semibold">{pesos(monto)}</p>
    </div>
  )
}
