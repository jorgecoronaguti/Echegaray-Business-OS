import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { contratoDelConjunto, esquemaDelPortal, hoyEnObra } from '../datosObra'
import { estadoDePago, proximoPago, resumenDeCobro, pesos, diaMes, ROTULO_ESTADO } from '../../cronograma'
import { IconoEstado, Vacio, Fila, TINTA } from '../../Piezas'

// PAGOS — UN SOLO LISTADO, ordenado por fecha. El mismo que ve administración en la ficha.
//
// ═══ POR QUÉ DEJÓ DE SER UN BLOQUE POR OBRA (26/08/2026) ═══
//
// Estaba partido en una sección por obra, cada una con su propio «Contrato · Pagado · Falta
// certificar», y otro juego de totales al final. El dueño lo miró y lo dijo así: «mostrá los pagos
// como se muestran en la vista del CRM de admin, es decir como listado; esto confunde y no sirve».
//
// Tiene razón por dos motivos. El primero es que cuatro juegos de totales en una pantalla no se
// comparan: se suman de memoria. El segundo es más grave — el cliente no lee su cronograma por obra,
// lo lee por FECHA: «¿qué me toca pagar y cuándo?». Partido por obra, el pago del 28/08 aparecía
// después del 15/09 de la obra anterior.
//
// LA OBRA NO SE PIERDE: va como renglón chico bajo el concepto, que es exactamente lo que hace la
// pantalla 32 del CRM. Y los cobros que no son de una obra —los que en Cobranzas dicen «de todas las
// obras»— entran en la misma lista sin fingir que pertenecen a una.
//
// EL FONDO DE REPARO VA ÚLTIMO Y NO SUMA A «PENDIENTE»: no es un pago que el cliente deba hacer, es
// plata retenida que se le devuelve. Mezclarlo con la deuda sería cobrarle dos veces en la lectura.

export const dynamic = 'force-dynamic'

export default async function Pagos() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const { pagos, bloques, contratos } = await esquemaDelPortal(acceso)
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos
  const total = resumenDeCobro(pagos, contratoDelConjunto(bloques, contratos), hoy)
  const proximo = proximoPago(pagos)

  // POR FECHA, que es como se lee un cronograma. Lo que no tiene fecha —el fondo de reparo, un pago
  // todavía sin programar— va al final: es lo único que no se puede ubicar en el tiempo.
  const enOrden = [...pagos].sort((a, b) => {
    const fa = a.fechaPago ?? a.fechaPrevista
    const fb = b.fechaPago ?? b.fechaPrevista
    if (!fa && !fb) return a.orden - b.orden
    if (!fa) return 1
    if (!fb) return -1
    return fa.localeCompare(fb) || a.orden - b.orden
  })

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Cronograma de pagos</h1>
        <span className="text-[12.5px] text-faint">
          {pagos.length === 1 ? '1 pago' : `${pagos.length} pagos`}
          {bloques.length > 1 ? ` · ${bloques.length} obras` : ''}
        </span>
      </div>

      {!montos ? <p className="mt-4 text-[13.5px] text-muted">{loQueSiPuedeVer(acceso)}</p> : null}

      {pagos.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no publicamos el plan de pagos.</Vacio></div>
      ) : (
        <>
          <div className="mt-5">
            {enOrden.map((p) => {
              const estado = estadoDePago(p, hoy)
              const esProximo = p.id === proximo?.id
              return (
                <Fila key={p.id} resaltada={esProximo}>
                  <IconoEstado estado={esProximo ? 'proximo' : estado} />
                  <span className="min-w-0 flex-1 basis-[38%]">
                    <span className="block truncate text-sm">{p.rotulo}</span>
                    {/* LA OBRA, ABAJO Y CHICA — igual que en la pantalla 32. Sin obra no se escribe
                        un texto inventado: la línea simplemente no tiene renglón de abajo. */}
                    {p.obraNombre ? (
                      <span className="block truncate text-[11.5px] text-faint">{p.obraNombre}</span>
                    ) : null}
                  </span>
                  <span className="tnum w-[74px] font-mono text-[13px] text-muted">
                    {p.tipo === 'fondo_reparo' && !p.fechaPrevista ? 'al final' : diaMes(p.fechaPrevista)}
                  </span>
                  {montos ? (
                    <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
                  ) : null}
                  {/* Una factura pagada muestra su RECIBO: es el comprobante que le sirve al cliente. */}
                  <span className={`w-[112px] text-right text-[12.5px] ${esProximo ? 'font-semibold text-ink' : TINTA[estado]}`}>
                    {p.reciboNumero ? `Recibo ${p.reciboNumero}` : esProximo ? 'próximo' : ROTULO_ESTADO[estado]}
                  </span>
                </Fila>
              )
            })}
          </div>

          {/* UN SOLO JUEGO DE TOTALES, al pie de la lista. */}
          {montos ? (
            <>
              <div className="mt-6 flex flex-wrap gap-x-12 gap-y-5 border-t-2 border-ink pt-5">
                <Total rotulo="Contrato" monto={total.contrato} />
                <Total rotulo="Pagado" monto={total.hayPlan ? total.pagado : null} />
                <Total rotulo="Pendiente" monto={total.hayPlan ? total.pendiente : null} />
                <Total rotulo="Falta certificar" monto={total.faltaCertificar} />
              </div>
              {total.sinMonto ? (
                <p className="mt-3 text-[12.5px] text-faint">
                  {total.sinMonto === 1 ? '1 pago no entra en estos totales' : `${total.sinMonto} pagos no entran en estos totales`} — sin monto cargado o en otra moneda.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
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
