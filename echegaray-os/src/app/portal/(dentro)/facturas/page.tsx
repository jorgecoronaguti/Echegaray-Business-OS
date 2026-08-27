import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { esquemaDelPortal, hoyEnObra } from '../datosObra'
import { estadoDePago, pesos, diaMes } from '../../cronograma'
import { IconoEstado, Vacio, Rubro } from '../../Piezas'
import { IconoDescarga } from '../../iconos'
import { papelesDePlata, type PapelDePlata } from './datos'
import { porNumeroDeFactura, porNumeroDeRecibo } from '../../comprobantes'

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

  // ═══ UNA FILA POR FACTURA, NO POR COBRO (26/08/2026) ═══
  //
  // «La factura 220 está repetida tres veces.» Y era cierto: tres cobros del cronograma llevan ese
  // número —el anticipo partido en dos monedas y su IVA— y la pantalla dibujaba uno por cobro. Pero
  // el cliente recibió UNA factura: acá se lista el COMPROBANTE, no la línea del plan.
  //
  // Los importes se suman POR MONEDA. Sumar pesos con dólares daría un número que no existe, y el
  // anticipo de Quattropani está declarado justamente así: una parte en cada una.
  const porFactura = new Map<string, typeof pagos>()
  for (const p of pagos.filter((x) => x.facturaNumero)) {
    const k = p.facturaNumero as string
    porFactura.set(k, [...(porFactura.get(k) ?? []), p])
  }
  const facturas = [...porFactura.values()].map((lineas) => {
    const enPesos = lineas.filter((l) => l.moneda === 'ARS' && l.monto != null)
    const enDolares = lineas.filter((l) => l.moneda === 'USD' && l.monto != null)
    return {
      ...lineas[0],
      montoARS: enPesos.length ? enPesos.reduce((a, l) => a + (l.monto as number), 0) : null,
      montoUSD: enDolares.length ? enDolares.reduce((a, l) => a + (l.monto as number), 0) : null,
      // La fecha del comprobante es la del cobro más viejo que lo lleva: el IVA se factura después.
      fechaPrevista: lineas.map((l) => l.fechaPago ?? l.fechaPrevista).filter(Boolean).sort()[0] ?? null,
      cuantas: lineas.length,
    }
  })
    // ═══ EN ORDEN DE SERIE, NO EN EL ORDEN DEL CRONOGRAMA (27/08/2026) ═══
    //
    // Salían en el orden en que aparecen las líneas del plan —por `orden` y después por fecha—, que
    // no tiene nada que ver con la numeración de ARCA: a Inter Motor le publicaba 201, 228, 211. El
    // cliente busca «la 211», no «la tercera de la lista». El comparador y por qué el número manda
    // sobre el punto de venta, en `comprobantes.ts`.
    .sort(porNumeroDeFactura)
  const recibos = papeles.filter((p) => p.categoria === 'recibo').sort(porNumeroDeRecibo)
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
              // ═══ EN EL TELÉFONO, DOS RENGLONES; EN ESCRITORIO, UNA FILA ═══
              //
              // Seis columnas en 390px no entran: el número de factura se recortaba, el importe
              // quedaba pegado al borde y el icono de descarga se salía de la pantalla — «la UI se
              // corta, la UX es confusa y no se pueden ver ni descargar las facturas».
              //
              // Abajo de `sm` la fila se apila: arriba el número y el importe, que es lo que se
              // busca; abajo la fecha, la obra y el recibo, en letra chica. El botón de descarga
              // queda SIEMPRE a la derecha y con 44px de lado, que es lo mínimo que un pulgar
              // acierta. Nada se oculta: cambia de lugar.
              <div key={p.id} className="flex min-h-11 items-start gap-2 border-b border-line sm:items-center sm:gap-3">
                <Envoltorio href={papel?.verEn}>
                  <span className="mt-[3px] shrink-0 sm:mt-0"><IconoEstado estado={estado} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex min-w-0 items-baseline justify-between gap-3 sm:flex-1">
                      <span className="tnum min-w-0 truncate font-mono text-[13.5px] sm:text-sm">{p.facturaNumero}</span>
                      {montos ? (
                        <span className="tnum shrink-0 font-mono text-[15px] sm:hidden">{importe(p)}</span>
                      ) : null}
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-faint sm:contents">
                      <span className="tnum shrink-0 font-mono sm:w-[70px] sm:text-[13px] sm:text-muted">
                        {diaMes(p.fechaPrevista)}
                      </span>
                      {variasObras && p.obraNombre ? (
                        <span className="min-w-0 truncate sm:w-[140px] sm:text-[12.5px]">{p.obraNombre}</span>
                      ) : null}
                      {/* El recibo va pegado a su factura: es la respuesta a «¿ésta ya la pagué?». */}
                      <span className="shrink-0 text-pos sm:w-[110px] sm:text-[12.5px]">
                        {p.reciboNumero ? `Recibo ${p.reciboNumero}` : ''}
                      </span>
                      {/* SIN ARCHIVO SE DICE. Una fila que no abre nada y no explica por qué se toca
                          diez veces antes de que alguien concluya que está rota. No lo está: esa
                          factura todavía no está en la carpeta de Drive de la obra. */}
                      {!papel ? (
                        <span className="shrink-0 text-faint sm:text-[12px]">sin archivo</span>
                      ) : null}
                    </span>
                    {montos ? (
                      <span className="tnum hidden w-[150px] text-right font-mono text-[15px] sm:block">
                        {importe(p)}
                      </span>
                    ) : null}
                  </span>
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

/**
 * EL IMPORTE DE UNA FACTURA, con las dos monedas si las tiene.
 *
 * «U$S 15.400 + $ 7.130.000» no es una suma sin hacer: es el anticipo de Quattropani tal como se
 * cobró, una parte en cada moneda. Convertirlo a un solo número necesitaría un tipo de cambio que
 * nadie declaró para ese día.
 */
function importe(f: { montoARS: number | null; montoUSD: number | null }): string {
  const partes = [
    f.montoUSD == null ? null : pesos(f.montoUSD, 'USD'),
    f.montoARS == null ? null : pesos(f.montoARS),
  ].filter(Boolean)
  return partes.length ? partes.join(' + ') : '—'
}

/** La fila entera abre el papel cuando lo hay; cuando no, es texto y no finge ser un botón. */
function Envoltorio({ href, children }: { href?: string; children: React.ReactNode }) {
  const clase = 'flex min-w-0 flex-1 items-start gap-2 py-[13px] sm:items-center sm:gap-3 sm:py-[15px]'
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
