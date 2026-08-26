import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../sesion'
import { accesoDelPortal } from '../datos'
import { loQueSiPuedeVer } from '../permisos'
import { esquemaDelPortal, hoyEnObra, type PagoConObra } from './datosObra'
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
//
// ═══ SIN `puede_ver_montos` NO HAY IMPORTES, Y NO HAY «$ 0» ═══
//
// La pantalla se reordena: el número grande deja de ser plata y pasa a ser la FECHA del próximo
// vencimiento, que es lo que ese contacto sí tiene derecho a saber. Las tres líneas de totales se
// retiran enteras. Tapar los importes con un guión sería peor que no mostrarlos: «—» se lee «este
// pago no tiene importe», y seis renglones así dicen que la empresa no le facturó nada.

export const dynamic = 'force-dynamic'

export default async function Inicio() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const { pagos, bloques, contratos } = await esquemaDelPortal(acceso)
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos

  const proximo = proximoPago(pagos) as PagoConObra | null
  const r = resumenDeCobro(pagos, null, hoy)
  const siguen = loQueSigue(pagos, bloques.length > 1 ? 4 : 2) as PagoConObra[]
  const variasObras = bloques.length > 1

  return (
    // EN EL TELÉFONO LA PRIMARIA VA ABAJO, después de las tres líneas —así lo dibuja la maqueta y así
    // cae bajo el pulgar—. En escritorio va al lado del monto. Es el MISMO botón: `display:contents`
    // deja que el orden lo decida el contenedor de afuera en vez de duplicar el bloque.
    <section className="flex flex-col">
      <div className="contents md:flex md:flex-wrap md:items-end md:gap-x-10">
        <div>
          <p className="text-[11px] tracking-[.09em] text-faint">
            {montos ? 'PRÓXIMO PAGO' : 'PRÓXIMO VENCIMIENTO'}
          </p>
          {proximo ? (
            <>
              <p className="tnum mt-1.5 font-mono text-[38px] font-semibold leading-none tracking-[-.025em] md:text-[40px]">
                {montos ? pesos(proximo.monto, proximo.moneda) : diaMes(proximo.fechaPrevista)}
              </p>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted">
                <IconoPagos tamano={17} />
                {montos ? <span className="tnum">{diaMes(proximo.fechaPrevista)}</span> : null}
                <span className="text-faint">{montos ? '· ' : ''}{proximo.rotulo}</span>
                {/* CON VARIAS OBRAS HAY QUE DECIR DE CUÁL ES. Un monto sin obra obliga a adivinar. */}
                {variasObras ? <span className="text-faint">· {proximo.obraNombre || 'sin obra asignada'}</span> : null}
              </p>
            </>
          ) : (
            // NO SE DIBUJA UN CERO. Sin cronograma publicado no hay próximo pago, y decir «$ 0» sería
            // afirmar que no debe nada.
            <p className="mt-2 max-w-[420px] text-[15px] text-muted">
              {pagos.length ? 'No queda ningún pago pendiente.' : 'Todavía no publicamos el plan de pagos.'}
            </p>
          )}
        </div>

        {/* «Transferir» es una acción sobre plata. Sin permiso de montos no se ofrece: mandaría a una
            pantalla a informar un pago cuyo importe esta persona no puede ver. */}
        {montos ? (
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
        ) : null}
      </div>

      {montos ? (
        <>
          <div className="order-2 mt-8 border-t border-line md:order-none">
            {/* SIN PLAN PUBLICADO NO SE ESCRIBE «$ 0». Un cero acá afirma que no debe nada. */}
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
        </>
      ) : (
        // QUÉ SÍ PUEDE VER. Una pantalla más corta sin explicación se lee como una pantalla rota.
        <p className="order-2 mt-8 border-t border-line pt-4 text-[13.5px] text-muted md:order-none">
          {loQueSiPuedeVer(acceso)}
        </p>
      )}

      {/* ── SUS OBRAS ─────────────────────────────────────────────────────────────────────────── */}
      {variasObras ? (
        <div className="order-4 md:order-none">
          <Rubro derecha={`${bloques.length} obras`}>SUS OBRAS</Rubro>
          {bloques.map((b) => {
            const suyo = resumenDeCobro(b.pagos, b.obraId ? contratos.get(b.obraId) ?? null : null, hoy)
            const sig = proximoPago(b.pagos)
            return (
              <Link key={b.obraId ?? 'sin-obra'} href="/portal/pagos" className="block">
                <Fila>
                  <span className="min-w-0 flex-1 basis-[45%] truncate text-sm">{b.nombre}</span>
                  <span className="w-[150px] text-[12.5px] text-muted">
                    {sig ? `sigue ${diaMes(sig.fechaPrevista)}` : 'al día'}
                  </span>
                  {montos ? (
                    <span className="tnum w-[120px] text-right font-mono text-[15px]">
                      {pesos(suyo.hayPlan ? suyo.pendiente : null)}
                    </span>
                  ) : null}
                </Fila>
              </Link>
            )
          })}
        </div>
      ) : null}

      <div className="order-5 md:order-none">
        <Rubro derecha={contratoDeLaUnica(bloques, contratos, montos)}>LO QUE SIGUE</Rubro>
        {siguen.length ? (
          siguen.map((p) => (
            <Fila key={p.id}>
              <IconoEstado estado={estadoDePago(p, hoy)} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.rotulo}</span>
              {variasObras ? (
                <span className="hidden w-[150px] truncate text-[12.5px] text-faint sm:block">{p.obraNombre}</span>
              ) : null}
              <span className="tnum w-[70px] font-mono text-[13px] text-muted">{diaMes(p.fechaPrevista)}</span>
              {montos ? (
                <span className="tnum w-[120px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
              ) : null}
            </Fila>
          ))
        ) : (
          <Vacio>No hay pagos programados por delante.</Vacio>
        )}
      </div>
    </section>
  )
}

/** El contrato al costado del rubro, sólo con UNA obra y con permiso de montos. */
function contratoDeLaUnica(
  bloques: { obraId: string | null }[],
  contratos: Map<string, number | null>,
  montos: boolean,
): string | undefined {
  if (!montos || bloques.length !== 1 || bloques[0].obraId === null) return undefined
  const c = contratos.get(bloques[0].obraId)
  return c == null ? undefined : `contrato ${pesos(c)}`
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
