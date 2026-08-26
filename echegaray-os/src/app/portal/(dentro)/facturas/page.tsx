import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { esquemaDelPortal, hoyEnObra } from '../datosObra'
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
//
// SON LAS FACTURAS DEL CLIENTE, DE TODAS SUS OBRAS (26/08/2026). Antes mostraba las de la obra elegida
// arriba; el dueño lo rechazó —«me sirve por cliente y q cada cliente tenga todas sus obras»—: quien
// busca una factura busca un NÚMERO, y no tiene por qué acordarse de en qué obra la emitimos.
//
// ═══ LOS NÚMEROS DE FACTURA TODAVÍA NO TIENEN DÓNDE VIVIR ═══
//
// `esquema_pago` no tiene `factura_numero` ni `recibo_numero`: llegan en una migración escrita y sin
// aplicar. Hasta que se aplique, esta pantalla queda vacía y lo DICE, en vez de mostrar filas sin
// número que se leerían como facturas sin identificar.

export const dynamic = 'force-dynamic'

export default async function Facturas() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const { pagos, bloques } = await esquemaDelPortal(acceso)
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos
  // POR FECHA, NO POR OBRA. La lista se lee para encontrar una factura, y lo que uno recuerda de una
  // factura es cuándo fue, no de qué obra era. Las que no tienen fecha van al final, no al principio.
  const facturas = pagos.filter((p) => p.facturaNumero).sort((a, b) =>
    (b.fechaPago ?? b.fechaPrevista ?? '').localeCompare(a.fechaPago ?? a.fechaPrevista ?? ''))
  const variasObras = bloques.length > 1
  const sinFacturar = pagos.length - facturas.length

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Facturas y recibos</h1>
        <span className="text-[12.5px] text-faint">
          {facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}
        </span>
      </div>

      {!montos ? <p className="mt-4 text-[13.5px] text-muted">{loQueSiPuedeVer(acceso)}</p> : null}

      {facturas.length === 0 ? (
        <div className="mt-6">
          <Vacio>
            {pagos.length
              ? 'Todavía no registramos el número de ninguna factura de este plan.'
              : 'Todavía no publicamos el plan de pagos.'}
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
                {/* CON VARIAS OBRAS HAY QUE DECIR DE CUÁL ES. Se oculta en pantalla angosta, donde la
                    fila no entra: ahí manda el número de factura, que es por lo que se busca. */}
                {variasObras ? (
                  <span className="hidden w-[150px] truncate text-[12.5px] text-faint sm:block">{p.obraNombre}</span>
                ) : null}
                {/* El recibo va pegado a su factura: es la respuesta a «¿ésta ya la pagué?». */}
                <span className="w-[118px] text-[12.5px] text-pos">
                  {p.reciboNumero ? `Recibo ${p.reciboNumero}` : ''}
                </span>
                {montos ? (
                  <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
                ) : null}
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
