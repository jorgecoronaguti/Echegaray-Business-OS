import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { esquemaDelPortal, hoyEnObra } from '../datosObra'
import { estadoDePago, pesos, diaMes } from '../../cronograma'
import { IconoEstado, Vacio, Rubro } from '../../Piezas'
import { IconoDescarga } from '../../iconos'
import { papelesDePlata, type PapelDePlata } from './datos'

// FACTURAS Y RECIBOS — lo que la empresa le emitió, con el papel al lado.
//
// ═══ DOS FUENTES QUE DICEN COSAS DISTINTAS Y LAS DOS HACEN FALTA ═══
//
// · El ESQUEMA (Cobranzas) sabe el número de factura, su fecha, su importe y si se cobró. No tiene
//   el papel.
// · El ESPEJO de Drive tiene el archivo —la factura escaneada, el recibo— pero de muchos no se puede
//   sacar un importe: los «Recibo N» son el estado de cuenta entero del cliente.
//
// Se muestran las dos, cada una con lo que sabe, y NUNCA se rellena una con la otra. Una factura sin
// archivo se lista igual (existe y el cliente la debe); un recibo sin importe se lista igual (se lo
// dieron y puede abrirlo). Lo que no se hace es inventar el dato que falta.
//
// EL ARCHIVO SE ABRE, NO SE BAJA: la fila lleva al visor del navegador y el icono de la derecha lo
// descarga con `?descargar=1`. Y sale por la MISMA ruta que Documentos —el espejo del OS—, no
// pidiéndoselo a Drive en el momento: eso es lo que devolvía «No encontrado» en los veintitrés.

export const dynamic = 'force-dynamic'

export default async function Facturas() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const [{ pagos, bloques }, papeles] = await Promise.all([esquemaDelPortal(acceso), papelesDePlata(acceso)])
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos
  const variasObras = bloques.length > 1

  const facturas = pagos.filter((p) => p.facturaNumero)
  const recibos = papeles.filter((p) => p.categoria === 'recibo')
  const archivosDeFactura = papeles.filter((p) => p.categoria === 'factura')
  const sinFacturar = pagos.length - facturas.length

  /** El archivo de una factura, si el espejo lo tiene. Se busca por el número dentro del título. */
  const archivoDe = (numero: string | null) => {
    if (!numero) return undefined
    const digitos = numero.replace(/\D/g, '')
    if (digitos.length < 3) return undefined
    return archivosDeFactura.find((a) => a.titulo.replace(/\D/g, '').includes(digitos))
  }

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

      {facturas.length === 0 && recibos.length === 0 ? (
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
            const papel = archivoDe(p.facturaNumero)
            return (
              <div key={p.id} className="flex min-h-11 items-center gap-3 border-b border-line">
                <Envoltorio href={papel?.verEn}>
                  <IconoEstado estado={estado} />
                  <span className="tnum min-w-0 flex-1 basis-[34%] truncate font-mono text-sm">{p.facturaNumero}</span>
                  <span className="tnum w-[70px] font-mono text-[13px] text-muted">
                    {diaMes(p.fechaPago ?? p.fechaPrevista)}
                  </span>
                  {variasObras && p.obraNombre ? (
                    <span className="hidden w-[140px] truncate text-[12.5px] text-faint sm:block">{p.obraNombre}</span>
                  ) : null}
                  {/* El recibo va pegado a su factura: es la respuesta a «¿ésta ya la pagué?». */}
                  <span className="hidden w-[110px] text-[12.5px] text-pos sm:block">
                    {p.reciboNumero ? `Recibo ${p.reciboNumero}` : ''}
                  </span>
                  {montos ? (
                    <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
                  ) : null}
                </Envoltorio>
                <Bajar en={papel?.verEn} que={`factura ${p.facturaNumero}`} />
              </div>
            )
          })}
        </div>
      ) : null}

      {recibos.length ? (
        <>
          {/* LOS RECIBOS ENVIADOS. Sin columna de importe: los archivos son el estado de cuenta del
              cliente y no declaran uno propio — de doce, sólo tres cerraron contra la resta de
              saldos. Poner un importe que no cierra en el portal de un cliente es peor que no poner
              ninguno; lo que sí se puede es darle el papel. */}
          <Rubro derecha="tocá para verlo">RECIBOS ENVIADOS</Rubro>
          <div>
            {recibos.map((r) => (
              <div key={r.id} className="flex min-h-11 items-center gap-3 border-b border-line">
                <Envoltorio href={r.verEn}>
                  <IconoEstado estado="pagado" />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.titulo}</span>
                  {r.fecha ? (
                    <span className="tnum w-[70px] font-mono text-[13px] text-muted">{diaMes(r.fecha)}</span>
                  ) : null}
                </Envoltorio>
                <Bajar en={r.verEn} que={r.titulo} />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {sinFacturar ? (
        <p className="mt-3 text-[12.5px] text-faint">
          {sinFacturar === 1 ? 'Hay 1 pago del plan todavía sin facturar' : `Hay ${sinFacturar} pagos del plan todavía sin facturar`} — están en Pagos.
        </p>
      ) : null}
    </>
  )
}

/** La fila entera abre el papel cuando lo hay; cuando no, es texto y no finge ser un botón. */
function Envoltorio({ href, children }: { href?: string; children: React.ReactNode }) {
  const clase = 'flex min-w-0 flex-1 items-center gap-3 py-[15px]'
  if (!href) return <div className={clase}>{children}</div>
  return <a href={href} target="_blank" rel="noreferrer" className={`${clase} hover:text-ink`}>{children}</a>
}

function Bajar({ en, que }: { en?: string; que: string }) {
  // Sin archivo NO se dibuja un icono apagado: un botón que no hace nada se toca igual.
  if (!en) return <span className="min-h-11 min-w-11" aria-hidden />
  return (
    <a
      href={`${en}?descargar=1`}
      aria-label={`Descargar ${que}`}
      title="Descargar"
      className="grid min-h-11 min-w-11 place-items-center rounded-[6px] text-faint hover:bg-surface-quiet hover:text-ink"
    >
      <IconoDescarga tamano={18} />
    </a>
  )
}
