import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { esquemaDelPortal, hoyEnObra } from '../datosObra'
import { estadoDePago, pesos, diaMes } from '../../cronograma'
import { costurarRecibos, type ReciboDelPortal } from '../../recibos'
import { IconoEstado, Vacio, Fila, Rubro } from '../../Piezas'
import { IconoDescarga } from '../../iconos'
import { recibosDelCliente } from './datos'

// FACTURAS Y RECIBOS — una lista sola.
//
// No hay dos pestañas ni dos tablas: una factura y su recibo son el mismo hecho visto en dos momentos.
// La pagada muestra el número de recibo en la misma fila; separarlos obligaría al cliente a cruzar
// dos listas para contestar «¿esta ya la pagué?».
//
// SON LAS FACTURAS DEL CLIENTE, DE TODAS SUS OBRAS (26/08/2026). Antes mostraba las de la obra elegida
// arriba; el dueño lo rechazó —«me sirve por cliente y q cada cliente tenga todas sus obras»—: quien
// busca una factura busca un NÚMERO, y no tiene por qué acordarse de en qué obra la emitimos.
//
// ═══ LOS RECIBOS SON ARCHIVOS, NO TEXTO (26/08/2026) ═══
//
// `esquema_pago.recibo_numero` existe y está VACÍO en los 79 pagos de los cinco clientes: los recibos
// que la empresa emite viven como PDF en la carpeta de Drive del cliente, y nadie los miraba. Ahora
// se registran en `public.recibo_cliente` y esta pantalla los muestra:
//
//   · si el número del recibo coincide con el `recibo_numero` de un pago que ya está en la lista, es
//     EL MISMO HECHO: se le cuelga la descarga a esa fila, no se dibuja otra;
//   · si no coincide con nada, es una fila propia — con su obra si la tiene, y SIN renglón de obra
//     si no. Los 23 de hoy no dicen de qué obra son y así es como el dueño pidió dejarlos.
//
// Sólo aparece lo que TIENE número de factura o es un recibo. Un certificado todavía sin facturar no
// es una factura vacía: no está en esta pantalla, está en Pagos como «sin factura».

export const dynamic = 'force-dynamic'

/** El icono que BAJA el archivo. Sin archivo no se dibuja nada: un botón que no hace nada es una
 *  promesa que el sistema no cumple, y ésta estuvo dibujada sin funcionar hasta hoy. */
function Descarga({ recibo }: { recibo: ReciboDelPortal | undefined }) {
  if (!recibo?.descargaEn) return <span className="min-h-11 min-w-11" aria-hidden />
  return (
    <a
      href={recibo.descargaEn}
      className="grid min-h-11 min-w-11 place-items-center text-faint hover:text-marca"
      title={recibo.nombreArchivo}
      aria-label={`Descargar ${recibo.numero ? `recibo ${recibo.numero}` : recibo.nombreArchivo}`}
    >
      <IconoDescarga tamano={18} />
    </a>
  )
}

export default async function Facturas() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const [{ pagos, bloques }, { recibos, noSePudoLeer }] = await Promise.all([
    esquemaDelPortal(acceso),
    recibosDelCliente(acceso),
  ])
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos
  // POR FECHA, NO POR OBRA. La lista se lee para encontrar una factura, y lo que uno recuerda de una
  // factura es cuándo fue, no de qué obra era. Las que no tienen fecha van al final, no al principio.
  const facturas = pagos.filter((p) => p.facturaNumero).sort((a, b) =>
    (b.fechaPago ?? b.fechaPrevista ?? '').localeCompare(a.fechaPago ?? a.fechaPrevista ?? ''))
  const { archivoDelPago, sueltos } = costurarRecibos(facturas, recibos)
  const variasObras = bloques.length > 1
  const sinFacturar = pagos.length - facturas.length

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-[-.01em]">Facturas y recibos</h1>
        <span className="text-[12.5px] text-faint">
          {facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}
          {recibos.length ? ` · ${recibos.length === 1 ? '1 recibo' : `${recibos.length} recibos`}` : ''}
        </span>
      </div>

      {!montos ? <p className="mt-4 text-[13.5px] text-muted">{loQueSiPuedeVer(acceso)}</p> : null}

      {facturas.length === 0 && sueltos.length === 0 ? (
        <div className="mt-6">
          <Vacio>
            {pagos.length
              ? 'Todavía no registramos el número de ninguna factura de este plan.'
              : 'Todavía no publicamos el plan de pagos.'}
          </Vacio>
        </div>
      ) : null}

      {facturas.length ? (
        <div className="mt-5">
          {facturas.map((p) => {
            const estado = estadoDePago(p, hoy)
            const archivo = archivoDelPago.get(p.id)
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
                <Descarga recibo={archivo} />
              </Fila>
            )
          })}
        </div>
      ) : null}

      {sueltos.length ? (
        <>
          {/* EL RECIBO QUE NO ESTÁ PEGADO A NINGUNA FACTURA IGUAL SE MUESTRA. Es un papel real que la
              empresa le dio al cliente; esconderlo porque el esquema todavía no lo nombra lo haría
              desaparecer, que es exactamente el estado del que venimos. */}
          <Rubro derecha={facturas.length ? 'no atados a una factura' : undefined}>RECIBOS</Rubro>
          <div>
            {sueltos.map((r) => (
              <Fila key={r.id}>
                <IconoEstado estado="pagado" />
                <span className="min-w-0 flex-1 basis-[38%] truncate font-mono text-sm">
                  {/* SIN NÚMERO NO SE INVENTA UNO: se muestra el nombre del archivo, que es lo que
                      de verdad se sabe de ese papel. */}
                  {r.numero ? `Recibo ${r.numero}` : r.nombreArchivo}
                </span>
                <span className="tnum w-[70px] font-mono text-[13px] text-muted">{diaMes(r.fecha)}</span>
                {/* SIN OBRA NO HAY RENGLÓN DE OBRA. Un rótulo fabricado se lee como el nombre real. */}
                {variasObras ? (
                  <span className="hidden w-[150px] truncate text-[12.5px] text-faint sm:block">{r.obraNombre}</span>
                ) : null}
                <span className="w-[118px] text-[12.5px]" />
                {montos ? (
                  <span className="tnum w-[118px] text-right font-mono text-[15px] text-muted">
                    {/* NULL NO ES 0. El comprobante no declara un importe único y así se dice. */}
                    {r.monto == null ? 'sin importe' : pesos(r.monto, r.moneda)}
                  </span>
                ) : null}
                <Descarga recibo={r} />
              </Fila>
            ))}
          </div>
        </>
      ) : null}

      {sinFacturar ? (
        <p className="mt-3 text-[12.5px] text-faint">
          {sinFacturar === 1 ? 'Hay 1 pago del plan todavía sin facturar' : `Hay ${sinFacturar} pagos del plan todavía sin facturar`} — están en Pagos.
        </p>
      ) : null}

      {/* UN CERO POR ERROR DE LECTURA Y UN CERO REAL SE VEN IGUAL SI NO SE DICE. */}
      {/* LOS ESTADOS DE CUENTA NO SE PIERDEN: se dice dónde están. Sacarlos de acá sin decirlo haría
          creer que se borraron. */}
      <p className="mt-2 text-[12.5px] text-faint">
        Los estados de cuenta y los papeles de cada obra están en Documentos.
      </p>

      {noSePudoLeer ? (
        <p className="mt-3 text-[12.5px] text-warn">
          No pudimos leer los recibos en este momento — lo que ves arriba puede estar incompleto.
        </p>
      ) : null}
    </>
  )
}
