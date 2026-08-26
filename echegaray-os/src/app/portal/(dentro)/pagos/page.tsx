import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { obrasDelClientePara } from '../../datos'
import { obrasDetalle, pagosDeObras, hoyEnObra, type PagoConObra } from '../datosObra'
import { estadoDePago, proximoPago, resumenDeCobro, pesos, diaMes, ROTULO_ESTADO } from '../../cronograma'
import { IconoEstado, Vacio, Fila, TINTA } from '../../Piezas'

// PAGOS — el cronograma de TODAS las obras del cliente, agrupado por obra.
//
// ═══ POR QUÉ TODAS JUNTAS (26/08/2026) ═══
//
// Antes esta pantalla mostraba UNA obra, la que se elegía en una barra de arriba. El dueño lo probó y
// lo rechazó: «me sirve por cliente y q cada cliente tenga todas sus obras». El motivo es del negocio:
// un cliente con cuatro obras no quiere saber cuánto debe en la Mampostería, quiere saber cuánto debe.
// Con una obra por pantalla tenía que sumar cuatro pantallas de memoria.
//
// Cada obra conserva su bloque y su total —una certificación pertenece a una obra y mezclarlas sería
// perder de qué se está hablando— y abajo va el total del cliente, que es el número que buscaba.
//
// EL FONDO DE REPARO VA ÚLTIMO Y NO SUMA A «PENDIENTE»: no es un pago que el cliente deba hacer, es
// plata retenida que se le devuelve. Mezclarlo con la deuda sería cobrarle dos veces en la lectura.

export const dynamic = 'force-dynamic'

export default async function Pagos() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const obras = await obrasDelClientePara(sesion.mail, sesion.clienteId)
  if (!obras.length) return <Vacio>Todavía no tenemos ninguna obra asociada a su mail.</Vacio>

  const [detalles, porObra] = await Promise.all([obrasDetalle(obras.map((o) => o.id)), pagosDeObras(obras)])
  const hoy = hoyEnObra()
  const contratoDe = new Map(detalles.map((d) => [d.id, d.contrato]))
  const todos = obras.flatMap((o) => porObra.get(o.id) ?? [])
  const total = resumenDeCobro(todos, sumaDeContratos(obras.map((o) => contratoDe.get(o.id) ?? null)), hoy)

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Cronograma de pagos</h1>
        <span className="text-[12.5px] text-faint">
          {todos.length === 1 ? '1 pago' : `${todos.length} pagos`}
          {obras.length > 1 ? ` · ${obras.length} obras` : ''}
        </span>
      </div>

      {todos.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no cargamos el plan de pagos.</Vacio></div>
      ) : (
        obras.map((o) => (
          <BloqueObra
            key={o.id}
            nombre={o.nombre}
            contrato={contratoDe.get(o.id) ?? null}
            pagos={porObra.get(o.id) ?? []}
            hoy={hoy}
            // Con una sola obra el encabezado del bloque sobra: ya lo dice la barra de arriba.
            conTitulo={obras.length > 1}
          />
        ))
      )}

      {/* EL TOTAL DEL CLIENTE. Sólo cuando hay más de una obra: con una sería el mismo número dos veces. */}
      {obras.length > 1 && todos.length ? (
        <div className="mt-9 border-t-2 border-ink pt-5">
          <p className="text-[11px] tracking-[.09em] text-faint">TODAS SUS OBRAS</p>
          <div className="mt-3 flex flex-wrap gap-x-12 gap-y-5">
            <Total rotulo="Contrato" monto={total.contrato} />
            <Total rotulo="Pagado" monto={total.hayPlan ? total.pagado : null} />
            <Total rotulo="Pendiente" monto={total.hayPlan ? total.pendiente : null} />
            <Total rotulo="Falta certificar" monto={total.faltaCertificar} />
          </div>
          {total.sinMonto ? <SinMonto cuantos={total.sinMonto} /> : null}
        </div>
      ) : null}
    </>
  )
}

/**
 * EL CONTRATO DEL CLIENTE ES LA SUMA DE LOS DE SUS OBRAS — y `null` si falta alguno.
 *
 * Sumar los que están y callar los que no daría un contrato más chico que el real, presentado con la
 * misma cara de dato cierto. Prefiere no decir nada antes que decir un número al que le falta una obra.
 */
function sumaDeContratos(montos: (number | null)[]): number | null {
  if (!montos.length || montos.some((m) => m == null)) return null
  return montos.reduce((a: number, m) => a + (m as number), 0)
}

function BloqueObra({
  nombre, contrato, pagos, hoy, conTitulo,
}: { nombre: string; contrato: number | null; pagos: PagoConObra[]; hoy: string; conTitulo: boolean }) {
  const proximo = proximoPago(pagos)
  const r = resumenDeCobro(pagos, contrato, hoy)

  return (
    <section className="mt-7">
      {conTitulo ? (
        <div className="flex flex-wrap items-baseline gap-2.5 border-b border-line pb-2">
          <h2 className="text-[15px] font-semibold tracking-[-.01em]">{nombre}</h2>
          <span className="text-[12px] text-faint">
            {pagos.length === 0 ? 'sin plan' : pagos.length === 1 ? '1 pago' : `${pagos.length} pagos`}
          </span>
        </div>
      ) : null}

      {pagos.length === 0 ? (
        // NULL NO ES CERO. Sin cronograma cargado no se dibuja «$ 0»: se dice que falta cargarlo.
        <p className="mt-3 text-[13.5px] text-muted">Todavía no cargamos el plan de pagos de esta obra.</p>
      ) : (
        <>
          <div className="mt-2">
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
                  <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
                  {/* Una factura pagada muestra su RECIBO: es el comprobante que le sirve al cliente. */}
                  <span className={`w-[112px] text-right text-[12.5px] ${esProximo ? 'font-semibold text-ink' : TINTA[estado]}`}>
                    {p.reciboNumero ? `Recibo ${p.reciboNumero}` : esProximo ? 'próximo' : ROTULO_ESTADO[estado]}
                  </span>
                </Fila>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-12 gap-y-4 border-t border-line-strong pt-4">
            <Total rotulo="Contrato" monto={r.contrato} />
            <Total rotulo="Pagado" monto={r.hayPlan ? r.pagado : null} />
            <Total rotulo="Falta certificar" monto={r.faltaCertificar} />
          </div>
          {r.sinMonto ? <SinMonto cuantos={r.sinMonto} /> : null}
        </>
      )}
    </section>
  )
}

function SinMonto({ cuantos }: { cuantos: number }) {
  return (
    <p className="mt-3 text-[12.5px] text-faint">
      {cuantos === 1 ? '1 pago no entra en estos totales' : `${cuantos} pagos no entran en estos totales`} — sin monto cargado o en otra moneda.
    </p>
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
