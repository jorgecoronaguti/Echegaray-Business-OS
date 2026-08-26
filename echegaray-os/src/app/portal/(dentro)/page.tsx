import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../sesion'
import { obrasDelClientePara } from '../datos'
import { obrasDetalle, pagosDeObras, hoyEnObra, type PagoConObra } from './datosObra'
import { proximoPago, resumenDeCobro, loQueSigue, estadoDePago, pesos, diaMes } from '../cronograma'
import { IconoEstado, Rubro, Vacio, Fila } from '../Piezas'
import { IconoPagos, IconoBanco, IconoDescarga } from '../iconos'

// INICIO — abre por LO QUE HAY QUE HACER, no por un cartel de deuda.
//
// El número grande es el PRÓXIMO PAGO. El vencido, el pendiente y el pagado van abajo, en letra chica:
// el cliente entra a saber qué le toca ahora, no a que le recuerden cuánto debe. Es la decisión del
// módulo y no una preferencia estética.
//
// ═══ TODAS SUS OBRAS, NO UNA (26/08/2026) ═══
//
// Antes se elegía una obra en una barra de arriba y todo lo de abajo hablaba de esa. El dueño lo
// rechazó —«me sirve por cliente y q cada cliente tenga todas sus obras»— y tiene razón: el próximo
// pago de un cliente es el más cercano de TODAS sus obras, y con una obra por pantalla había que
// mirar cuatro para saber cuál era.
//
// El próximo pago no se calcula acá: sale de `cronograma.ts`, la misma función que usa Pagos. Si cada
// pantalla resolviera por su cuenta, Inicio y Pagos podrían mostrar dos pagos distintos el mismo día.

export const dynamic = 'force-dynamic'

export default async function Inicio() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const obras = await obrasDelClientePara(sesion.mail, sesion.clienteId)
  if (!obras.length) return <Vacio>Todavía no tenemos ninguna obra asociada a su mail. Escribinos y lo resolvemos.</Vacio>

  const [detalles, porObra] = await Promise.all([obrasDetalle(obras.map((o) => o.id)), pagosDeObras(obras)])
  const hoy = hoyEnObra()
  const contratoDe = new Map(detalles.map((d) => [d.id, d.contrato]))
  const todos = obras.flatMap((o) => porObra.get(o.id) ?? [])

  const proximo = proximoPago(todos) as PagoConObra | null
  const r = resumenDeCobro(todos, null, hoy)
  const siguen = loQueSigue(todos, obras.length > 1 ? 4 : 2) as PagoConObra[]

  return (
    // EN EL TELÉFONO LA PRIMARIA VA ABAJO, después de las tres líneas —así lo dibuja la maqueta y así
    // cae bajo el pulgar—. En escritorio va al lado del monto. Es el MISMO botón: `display:contents`
    // deja que el orden lo decida el contenedor de afuera en vez de duplicar el bloque.
    <section className="flex flex-col">
      <div className="contents md:flex md:flex-wrap md:items-end md:gap-x-10">
        <div>
          <p className="text-[11px] tracking-[.09em] text-faint">PRÓXIMO PAGO</p>
          {proximo ? (
            <>
              <p className="tnum mt-1.5 font-mono text-[38px] font-semibold leading-none tracking-[-.025em] md:text-[40px]">
                {pesos(proximo.monto, proximo.moneda)}
              </p>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted">
                <IconoPagos tamano={17} />
                <span className="tnum">{diaMes(proximo.fechaPrevista)}</span>
                <span className="text-faint">· {proximo.rotulo}</span>
                {/* CON VARIAS OBRAS HAY QUE DECIR DE CUÁL ES. Un monto sin obra obliga a adivinar. */}
                {obras.length > 1 ? <span className="text-faint">· {proximo.obraNombre}</span> : null}
              </p>
            </>
          ) : (
            // NO SE DIBUJA UN CERO. Sin cronograma cargado no hay próximo pago, y decir «$ 0» sería
            // afirmar que no debe nada.
            <p className="mt-2 max-w-[420px] text-[15px] text-muted">
              {todos.length ? 'No queda ningún pago pendiente.' : 'Todavía no cargamos el plan de pagos.'}
            </p>
          )}
        </div>

        <div className="order-3 mt-7 flex items-center gap-2.5 md:order-none md:ml-auto md:mt-0">
          <Link
            href="/portal/transferir"
            className="flex min-h-[46px] items-center gap-[9px] rounded-[6px] bg-marca px-5 text-sm font-semibold text-ink"
          >
            <IconoBanco tamano={18} />
            <span>Transferir</span>
          </Link>
          <Link
            href="/portal/pagos"
            title="Ver el cronograma completo"
            aria-label="Ver el cronograma completo"
            className="grid min-h-[46px] min-w-[46px] place-items-center rounded-[6px] border border-line-strong bg-surface text-muted hover:border-faint hover:text-ink"
          >
            <IconoDescarga tamano={18} />
          </Link>
        </div>
      </div>

      <div className="order-2 mt-8 border-t border-line md:order-none">
        {/* SIN PLAN CARGADO NO SE ESCRIBE «$ 0». Un cero acá afirma que no debe nada. */}
        <LineaResumen rotulo="Vencido" monto={r.hayPlan ? r.vencido : null} estado="vencido" />
        <LineaResumen rotulo="Pendiente" monto={r.hayPlan ? r.pendiente : null} estado="programado" />
        <LineaResumen rotulo="Pagado" monto={r.hayPlan ? r.pagado : null} estado="pagado" />
      </div>
      {r.sinMonto ? (
        // LO QUE LA SUMA NO ESTÁ CONTANDO SE DICE. Callarlo haría que el total parezca completo.
        <p className="order-2 mt-2 text-[12.5px] text-faint md:order-none">
          {r.sinMonto === 1 ? 'Hay 1 pago que no entra en estas sumas' : `Hay ${r.sinMonto} pagos que no entran en estas sumas`} — sin monto cargado o en otra moneda.
        </p>
      ) : null}

      {/* ── SUS OBRAS ─────────────────────────────────────────────────────────────────────────── */}
      {obras.length > 1 ? (
        <div className="order-4 md:order-none">
          <Rubro derecha={`${obras.length} obras`}>SUS OBRAS</Rubro>
          {obras.map((o) => {
            const pagos = porObra.get(o.id) ?? []
            const suyo = resumenDeCobro(pagos, contratoDe.get(o.id) ?? null, hoy)
            const sig = proximoPago(pagos)
            return (
              <Link key={o.id} href="/portal/pagos" className="block">
                <Fila>
                  <span className="min-w-0 flex-1 basis-[45%] truncate text-sm">{o.nombre}</span>
                  <span className="w-[150px] text-[12.5px] text-muted">
                    {/* Una obra sin plan no dice «$ 0»: dice que falta cargarlo. */}
                    {!pagos.length ? 'sin plan cargado' : sig ? `sigue ${diaMes(sig.fechaPrevista)}` : 'al día'}
                  </span>
                  <span className="tnum w-[120px] text-right font-mono text-[15px]">
                    {pesos(suyo.hayPlan ? suyo.pendiente : null)}
                  </span>
                </Fila>
              </Link>
            )
          })}
        </div>
      ) : null}

      <div className="order-5 md:order-none">
        <Rubro derecha={obras.length === 1 && contratoDe.get(obras[0].id) != null
          ? `contrato ${pesos(contratoDe.get(obras[0].id) ?? null)}`
          : undefined}>
          LO QUE SIGUE
        </Rubro>
        {siguen.length ? (
          siguen.map((p) => (
            <Fila key={p.id}>
              <IconoEstado estado={estadoDePago(p, hoy)} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.rotulo}</span>
              {obras.length > 1 ? (
                <span className="hidden w-[150px] truncate text-[12.5px] text-faint sm:block">{p.obraNombre}</span>
              ) : null}
              <span className="tnum w-[70px] font-mono text-[13px] text-muted">{diaMes(p.fechaPrevista)}</span>
              <span className="tnum w-[120px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
            </Fila>
          ))
        ) : (
          <Vacio>No hay pagos programados por delante.</Vacio>
        )}
      </div>
    </section>
  )
}

function LineaResumen({ rotulo, monto, estado }: { rotulo: string; monto: number | null; estado: 'vencido' | 'programado' | 'pagado' }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-[15px]">
      <IconoEstado estado={estado} />
      <span className="flex-1 text-sm">{rotulo}</span>
      <span className={`tnum font-mono text-[15px] ${monto == null ? 'text-faint' : ''}`}>{pesos(monto)}</span>
    </div>
  )
}
