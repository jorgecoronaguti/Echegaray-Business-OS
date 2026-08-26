import Link from 'next/link'
import { sesionDelPortal } from '../sesion'
import { obrasDelCliente, obraElegida } from '../datos'
import { obraDetalle, pagosDeObra, hoyEnObra } from './datosObra'
import { proximoPago, resumenDeCobro, loQueSigue, estadoDePago, pesos, diaMes } from '../cronograma'
import { IconoEstado, Rubro, Vacio, Fila } from '../Piezas'
import { IconoPagos, IconoBanco, IconoDescarga } from '../iconos'
import { redirect } from 'next/navigation'

// INICIO — abre por LO QUE HAY QUE HACER, no por un cartel de deuda.
//
// El número grande es el PRÓXIMO PAGO. El pendiente y el pagado van abajo, en letra chica: el cliente
// entra a saber qué le toca ahora, no a que le recuerden cuánto debe. Es la decisión del módulo y no
// una preferencia estética.
//
// EL PRÓXIMO PAGO NO SE CALCULA ACÁ: sale de `cronograma.ts`, la misma función que usa Pagos. Si cada
// pantalla resolviera por su cuenta, el Inicio y Pagos podrían mostrar dos pagos distintos el mismo
// día y el portal se contradiría solo.

export const dynamic = 'force-dynamic'

export default async function Inicio({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const obras = await obrasDelCliente(sesion.clienteId)
  const elegida = obraElegida(obras, (await searchParams).obra)
  if (!elegida) return <Vacio>Todavía no tenemos ninguna obra asociada a su mail. Escribinos y lo resolvemos.</Vacio>

  const [obra, pagos] = await Promise.all([obraDetalle(elegida.id), pagosDeObra(elegida.id)])
  const hoy = hoyEnObra()
  const proximo = proximoPago(pagos)
  const r = resumenDeCobro(pagos, obra?.contrato ?? null, hoy)
  const siguen = loQueSigue(pagos, 2)

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
        <div>
          <p className="text-[11px] tracking-[.09em] text-faint">PRÓXIMO PAGO</p>
          {proximo ? (
            <>
              <p className="tnum mt-1.5 font-mono text-[38px] font-semibold leading-none tracking-[-.025em] md:text-[40px]">
                {pesos(proximo.monto)}
              </p>
              <p className="mt-2.5 flex items-center gap-2 text-[13.5px] text-muted">
                <IconoPagos tamano={17} />
                <span className="tnum">{diaMes(proximo.fechaPrevista)}</span>
                <span className="text-faint">· {proximo.rotulo}</span>
              </p>
            </>
          ) : (
            // NO SE DIBUJA UN CERO. Sin cronograma cargado no hay próximo pago, y decir «$ 0» sería
            // afirmar que no debe nada.
            <p className="mt-2 max-w-[420px] text-[15px] text-muted">
              {pagos.length ? 'No queda ningún pago pendiente.' : 'Todavía no cargamos el plan de pagos de esta obra.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 md:ml-auto">
          <Link
            href={`/portal/transferir?obra=${elegida.id}`}
            className="flex min-h-[46px] items-center gap-[9px] rounded-[6px] bg-marca px-5 text-sm font-semibold text-ink"
          >
            <IconoBanco tamano={18} />
            <span>Transferir</span>
          </Link>
          <Link
            href={`/portal/pagos?obra=${elegida.id}`}
            title="Descargar resumen"
            aria-label="Descargar resumen"
            className="grid min-h-[46px] min-w-[46px] place-items-center rounded-[6px] border border-line-strong bg-surface text-muted hover:border-faint hover:text-ink"
          >
            <IconoDescarga tamano={18} />
          </Link>
        </div>
      </div>

      <div className="mt-8 border-t border-line">
        <LineaResumen rotulo="Vencido" monto={r.vencido} estado="vencido" />
        <LineaResumen rotulo="Pendiente" monto={r.pendiente} estado="programado" />
        <LineaResumen rotulo="Pagado" monto={r.pagado} estado="pagado" />
      </div>
      {r.sinMonto ? (
        // LO QUE LA SUMA NO ESTÁ CONTANDO SE DICE. Callarlo haría que el total parezca completo.
        <p className="mt-2 text-[12.5px] text-faint">
          {r.sinMonto === 1 ? 'Hay 1 pago sin monto cargado' : `Hay ${r.sinMonto} pagos sin monto cargado`}, no está en estas sumas.
        </p>
      ) : null}

      <Rubro derecha={obra?.contrato != null ? `contrato ${pesos(obra.contrato)}` : 'sin contrato cargado'}>
        LO QUE SIGUE
      </Rubro>
      {siguen.length ? (
        siguen.map((p) => (
          <Fila key={p.id}>
            <IconoEstado estado={estadoDePago(p, hoy)} />
            <span className="min-w-0 flex-1 truncate text-sm">{p.rotulo}</span>
            <span className="tnum w-[70px] font-mono text-[13px] text-muted">{diaMes(p.fechaPrevista)}</span>
            <span className="tnum w-[120px] text-right font-mono text-[15px]">{pesos(p.monto)}</span>
          </Fila>
        ))
      ) : (
        <Vacio>No hay pagos programados por delante.</Vacio>
      )}
    </>
  )
}

function LineaResumen({ rotulo, monto, estado }: { rotulo: string; monto: number; estado: 'vencido' | 'programado' | 'pagado' }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-[15px]">
      <IconoEstado estado={estado} />
      <span className="flex-1 text-sm">{rotulo}</span>
      <span className="tnum font-mono text-[15px]">{pesos(monto)}</span>
    </div>
  )
}
