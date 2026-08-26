import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { contratoDelConjunto, esquemaDelPortal, hoyEnObra, type BloqueDeObra } from '../datosObra'
import { estadoDePago, proximoPago, resumenDeCobro, pesos, diaMes, ROTULO_ESTADO } from '../../cronograma'
import { IconoEstado, Vacio, Fila, TINTA } from '../../Piezas'

// PAGOS — el cronograma de TODAS las obras del cliente, agrupado por obra.
//
// ═══ POR QUÉ TODAS JUNTAS (26/08/2026) ═══
//
// Antes esta pantalla mostraba UNA obra, la que se elegía en una barra de arriba. El dueño lo probó y
// lo rechazó: «me sirve por cliente y q cada cliente tenga todas sus obras». El motivo es del negocio:
// un cliente con cuatro obras no quiere saber cuánto debe en la Mampostería, quiere saber cuánto debe.
//
// Cada obra conserva su bloque y su total —una certificación pertenece a una obra y mezclarlas sería
// perder de qué se está hablando— y abajo va el total del cliente, que es el número que buscaba.
//
// EL BLOQUE «Sin obra asignada» NO ES UN DESCARTE. `esquema_pago` es por cliente y su `obra_id` es
// opcional: hay pagos acordados que todavía no cuelgan de una obra. Se muestran, al final, dichos
// como lo que son. Esconderlos ocultaría plata comprometida; repartirlos inventaría a quién pertenece.
//
// EL FONDO DE REPARO VA ÚLTIMO Y NO SUMA A «PENDIENTE»: no es un pago que el cliente deba hacer, es
// plata retenida que se le devuelve. Mezclarlo con la deuda sería cobrarle dos veces en la lectura.

export const dynamic = 'force-dynamic'

export default async function Pagos() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion.mail, sesion.clienteId)
  if (!acceso) redirect('/portal/login')

  const { pagos, bloques, contratos } = await esquemaDelPortal(acceso)
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos
  const total = resumenDeCobro(pagos, contratoDelConjunto(bloques, contratos), hoy)

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Cronograma de pagos</h1>
        <span className="text-[12.5px] text-faint">
          {pagos.length === 1 ? '1 pago' : `${pagos.length} pagos`}
          {bloques.length > 1 ? ` · ${bloques.length} obras` : ''}
        </span>
      </div>

      {!montos ? (
        <p className="mt-4 text-[13.5px] text-muted">{loQueSiPuedeVer(acceso)}</p>
      ) : null}

      {pagos.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no publicamos el plan de pagos.</Vacio></div>
      ) : (
        bloques.map((b) => (
          <BloqueObra
            key={b.obraId ?? 'sin-obra'}
            bloque={b}
            contrato={b.obraId ? contratos.get(b.obraId) ?? null : null}
            hoy={hoy}
            montos={montos}
            // Con un solo bloque el encabezado sobra: ya lo dice la barra de arriba.
            conTitulo={bloques.length > 1}
          />
        ))
      )}

      {/* EL TOTAL DEL CLIENTE. Sólo con más de una obra: con una sería el mismo número dos veces. */}
      {montos && bloques.length > 1 && pagos.length ? (
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

function BloqueObra({
  bloque, contrato, hoy, montos, conTitulo,
}: { bloque: BloqueDeObra; contrato: number | null; hoy: string; montos: boolean; conTitulo: boolean }) {
  const { pagos } = bloque
  const proximo = proximoPago(pagos)
  const r = resumenDeCobro(pagos, contrato, hoy)

  return (
    <section className="mt-7">
      {conTitulo ? (
        <div className="flex flex-wrap items-baseline gap-2.5 border-b border-line pb-2">
          <h2 className="text-[15px] font-semibold tracking-[-.01em]">{bloque.nombre}</h2>
          <span className="text-[12px] text-faint">
            {pagos.length === 1 ? '1 pago' : `${pagos.length} pagos`}
          </span>
        </div>
      ) : null}

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

      {montos ? (
        <>
          <div className="mt-4 flex flex-wrap gap-x-12 gap-y-4 border-t border-line-strong pt-4">
            <Total rotulo="Contrato" monto={r.contrato} />
            <Total rotulo="Pagado" monto={r.hayPlan ? r.pagado : null} />
            <Total rotulo="Falta certificar" monto={r.faltaCertificar} />
          </div>
          {r.sinMonto ? <SinMonto cuantos={r.sinMonto} /> : null}
        </>
      ) : null}
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
