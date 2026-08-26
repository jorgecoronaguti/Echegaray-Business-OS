import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { contratoDelConjunto, esquemaDelPortal, hoyEnObra } from '../datosObra'
import { estadoDePago, proximoPago, resumenDeCobro, pesos, diaMes, ROTULO_ESTADO } from '../../cronograma'
import { IconoEstado, Vacio, Fila, TINTA } from '../../Piezas'
import { grillaDelMes } from '@/features/clientes/services/reglasEsquema'
import { Calendario } from './Calendario'

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

export default async function Pagos({ searchParams }: { searchParams: Promise<{ vista?: string; mes?: string; ver?: string; obra?: string }> }) {
  const q = await searchParams
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const { pagos, bloques, contratos } = await esquemaDelPortal(acceso)
  const hoy = hoyEnObra()
  const montos = acceso.puedeVerMontos
  const total = resumenDeCobro(pagos, contratoDelConjunto(bloques, contratos), hoy)
  const proximo = proximoPago(pagos)
  /** La misma URL con UN parámetro cambiado. Conserva el resto: elegir una obra no puede tirar el
   *  filtro de estado ni sacarte del calendario. */
  const con = (cambio: Record<string, string | null>) => {
    const u = new URLSearchParams()
    const base: Record<string, string | null> = { vista: q.vista ?? null, mes: q.mes ?? null, ver: q.ver ?? null, obra: q.obra ?? null, ...cambio }
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v)
    const s = u.toString()
    return s ? `/portal/pagos?${s}` : '/portal/pagos'
  }
  const enCalendario = q.vista === 'calendario'
  // EL MES QUE ABRE: el del próximo pago, y si no queda ninguno, el de hoy. Abrir siempre en el mes
  // corriente le mostraría un calendario vacío a quien tiene todo por delante o todo pagado.
  const mes = /^\d{4}-\d{2}$/.test(q.mes ?? '')
    ? q.mes as string
    : (proximo?.fechaPrevista ?? hoy).slice(0, 7)

  // POR FECHA, que es como se lee un cronograma. Lo que no tiene fecha —el fondo de reparo, un pago
  // todavía sin programar— va al final: es lo único que no se puede ubicar en el tiempo.
  const porFecha = (lista: typeof pagos) => [...lista].sort((a, b) => {
    const fa = a.fechaPago ?? a.fechaPrevista
    const fb = b.fechaPago ?? b.fechaPrevista
    if (!fa && !fb) return a.orden - b.orden
    if (!fa) return 1
    if (!fb) return -1
    return fa.localeCompare(fb) || a.orden - b.orden
  })
  // LAS OBRAS ANTERIORES, APARTE. Son cobros de trabajo previo para el mismo cliente: se le muestran
  // —los pagó y tiene derecho a verlos— pero abajo, en gris, y sin sumar al contrato en curso.
  const enOrden = porFecha(pagos.filter((p) => !p.historico))
  const anteriores = porFecha(pagos.filter((p) => p.historico))

  // ═══ EL FILTRO: TODOS · POR COBRAR · PAGADOS ═══
  //
  // Con 21 pagos el cronograma se lee para dos cosas distintas: «qué me falta» y «qué ya pagué». En
  // una lista sola hay que barrerla entera para cualquiera de las dos. El filtro va en la URL —no en
  // estado del navegador— para que sobreviva a un refresco y se pueda compartir.
  //
  // LOS TOTALES NO SE FILTRAN. Son del cronograma completo: recalcularlos sobre lo filtrado haría
  // que «Pagado» cambiara al tocar una pastilla, que es la forma más rápida de perderle la confianza
  // a un número.
  const ver = q.ver === 'pagados' || q.ver === 'pendientes' ? q.ver : 'todos'

  // ═══ EL FILTRO POR OBRA ═══
  //
  // Con cuatro obras en una sola lista, «¿cómo viene Pisos Industriales?» obliga a barrer 21 filas
  // leyendo el renglón chico de cada una. La obra se elige de las que REALMENTE tienen pagos, no de
  // todas las del cliente: ofrecer una obra que filtra a cero es un botón que lleva a nada.
  //
  // Se cruza con el filtro de estado y viaja en la URL, así que «los pagos pendientes de Pisos» es
  // una dirección que se comparte. Y vale para las dos vistas: en el calendario, filtrar por obra es
  // justamente «cómo me cae el mes de ESTA obra».
  const conPagos = [...new Map(enOrden.filter((p) => p.obraId)
    .map((p) => [p.obraId as string, p.obraNombre])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'))
  const obra = conPagos.some(([id]) => id === q.obra) ? q.obra : null

  const porObra = (lista: typeof enOrden) => (obra ? lista.filter((p) => p.obraId === obra) : lista)
  const delEstado = porObra(enOrden)
  const visibles = ver === 'pagados' ? delEstado.filter((p) => p.fechaPago)
    : ver === 'pendientes' ? delEstado.filter((p) => !p.fechaPago)
    : delEstado
  const nPagados = delEstado.filter((p) => p.fechaPago).length
  const totalAnterior = anteriores.reduce((a, p) => a + (p.moneda === 'ARS' && p.monto != null ? p.monto : 0), 0)

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

      {/* LISTADO · CALENDARIO — el mismo interruptor de la pantalla 32. Son dos preguntas distintas:
          el listado contesta «qué me toca pagar», el calendario «cómo me cae el mes». */}
      {pagos.length ? (
        <div className="mt-4 flex items-center gap-1 self-start rounded-[8px] border border-line p-[3px]">
          <Solapa a={con({ vista: null, mes: null })} activa={!enCalendario}>Listado</Solapa>
          <Solapa a={con({ vista: 'calendario', mes })} activa={enCalendario}>Calendario</Solapa>
        </div>
      ) : null}

      {/* Sólo bajo el listado: en el calendario la distinción ya la da la fecha. */}
      {pagos.length && !enCalendario ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Pastilla a={con({ ver: null })} activa={ver === 'todos'}>{`Todos ${delEstado.length}`}</Pastilla>
          <Pastilla a={con({ ver: 'pendientes' })} activa={ver === 'pendientes'}>
            {/* «PENDIENTE», NO «POR COBRAR». El portal lo lee el CLIENTE: para él eso no es algo que
                va a cobrar, es algo que tiene que pagar. Y es la palabra que usa la pestaña Cobranzas
                y la ficha del cliente — el mismo estado no puede llamarse distinto según la pantalla. */}
            {`Pendiente ${delEstado.length - nPagados}`}
          </Pastilla>
          <Pastilla a={con({ ver: 'pagados' })} activa={ver === 'pagados'}>{`Pagados ${nPagados}`}</Pastilla>
        </div>
      ) : null}

      {/* POR OBRA — sólo con más de una: una pastilla que no elige nada es ruido. */}
      {conPagos.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Pastilla a={con({ obra: null })} activa={!obra}>Todas las obras</Pastilla>
          {conPagos.map(([id, nombre]) => (
            <Pastilla key={id} a={con({ obra: id })} activa={obra === id}>{nombre}</Pastilla>
          ))}
        </div>
      ) : null}

      {pagos.length === 0 ? (
        <div className="mt-6"><Vacio>Todavía no publicamos el plan de pagos.</Vacio></div>
      ) : enCalendario ? (
        <Calendario
          pagos={porObra(pagos)}
          mes={mes}
          semanas={grillaDelMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)))}
          hoy={hoy}
          montos={montos}
          enlaceDeMes={(ym) => con({ vista: 'calendario', mes: ym })}
        />
      ) : (
        <>
          {/* EL ENCABEZADO EXISTE PORQUE AHORA HAY TRES NÚMEROS EN LA FILA. Con uno solo se entendía
              sin rótulo; con tres, sin encabezado hay que adivinar cuál es cuál. */}
          {montos ? (
            <div className="mt-5 hidden items-center gap-3 border-b border-line pb-1.5 text-[10.5px] tracking-[.08em] text-faint lg:flex">
              <span className="w-[19px]" />
              <span className="flex-1 basis-[38%]">CONCEPTO</span>
              <span className="w-[74px]">FECHA</span>
              <span className="w-[112px] text-right">NETO</span>
              <span className="w-[96px] text-right">IVA</span>
              <span className="w-[118px] text-right">TOTAL</span>
              <span className="w-[112px]" />
            </div>
          ) : null}

          {visibles.length === 0 ? (
            <div className="mt-6">
              <Vacio>{ver === 'pagados' ? 'Todavía no hay ningún pago cobrado.' : 'No queda ningún pago por cobrar.'}</Vacio>
            </div>
          ) : null}
          <div className="mt-5 lg:mt-0">
            {visibles.map((p) => {
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
                  {/* NETO · IVA · TOTAL. El cliente factura con IVA discriminado y un solo importe no
                      le sirve para conciliar contra su contabilidad. En pantalla angosta el neto y el
                      IVA se ocultan —el total es lo que no puede faltar— y siguen en el detalle. */}
                  {montos ? (
                    <>
                      <span className="tnum hidden w-[112px] text-right font-mono text-[13px] text-muted lg:block">
                        {pesos(p.neto, p.moneda)}
                      </span>
                      <span className="tnum hidden w-[96px] text-right font-mono text-[13px] text-muted lg:block">
                        {pesos(p.iva, p.moneda)}
                      </span>
                      <span className="tnum w-[118px] text-right font-mono text-[15px]">{pesos(p.monto, p.moneda)}</span>
                    </>
                  ) : null}
                  {/* Una factura pagada muestra su RECIBO: es el comprobante que le sirve al cliente. */}
                  <span className={`w-[112px] text-right text-[12.5px] ${esProximo ? 'font-semibold text-ink' : TINTA[estado]}`}>
                    {p.reciboNumero ? `Recibo ${p.reciboNumero}` : esProximo ? 'próximo' : ROTULO_ESTADO[estado]}
                  </span>
                </Fila>
              )
            })}
          </div>

          {/* ── COBROS DE OBRAS ANTERIORES ─────────────────────────────────────────────────────
              En gris, como los destinos que todavía no navegan: dice «esto ya pasó y no es de lo que
              estamos haciendo» sin esconderlo y sin necesitar la pantalla de Terminadas. */}
          {anteriores.length ? (
            <section className="mt-10 opacity-60">
              <div className="flex flex-wrap items-baseline gap-2.5 border-b border-line pb-2">
                <h2 className="text-[13px] font-semibold tracking-[-.01em] text-muted">Cobros de obras anteriores</h2>
                <span className="text-[11.5px] text-faint">
                  {anteriores.length === 1 ? '1 cobro' : `${anteriores.length} cobros`} · ya pagados
                </span>
                {montos ? (
                  <span className="tnum ml-auto font-mono text-[13px] text-muted">{pesos(totalAnterior)}</span>
                ) : null}
              </div>
              <div>
                {anteriores.map((p) => (
                  <Fila key={p.id}>
                    <IconoEstado estado="pagado" />
                    <span className="min-w-0 flex-1 basis-[38%]">
                      <span className="block truncate text-[13.5px] text-muted">{p.rotulo}</span>
                      {p.obraNombre ? (
                        <span className="block truncate text-[11px] text-faint">{p.obraNombre}</span>
                      ) : null}
                    </span>
                    <span className="tnum w-[74px] font-mono text-[12.5px] text-faint">{diaMes(p.fechaPrevista)}</span>
                    {montos ? (
                      <>
                        <span className="tnum hidden w-[112px] text-right font-mono text-[12.5px] text-faint lg:block">
                          {pesos(p.neto, p.moneda)}
                        </span>
                        <span className="tnum hidden w-[96px] text-right font-mono text-[12.5px] text-faint lg:block">
                          {pesos(p.iva, p.moneda)}
                        </span>
                        <span className="tnum w-[118px] text-right font-mono text-[13.5px] text-muted">
                          {pesos(p.monto, p.moneda)}
                        </span>
                      </>
                    ) : null}
                    <span className="w-[112px] text-right text-[12px] text-faint">pagado</span>
                  </Fila>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] text-faint">
                Trabajo anterior que ya nos pagó. No entra en los totales de arriba, que son de las obras en curso.
              </p>
            </section>
          ) : null}

          {/* UN SOLO JUEGO DE TOTALES, al pie de la lista. */}
          {montos ? (
            <>
              <div className="mt-6 flex flex-wrap gap-x-12 gap-y-5 border-t-2 border-ink pt-5">
                <Total rotulo="Contrato" monto={total.contrato} />
                {/* PAGADO, ABIERTO EN NETO E IVA: es lo que el cliente cruza contra su libro de IVA
                    compras. Los dos de abajo son PARTES del de arriba, no sumandos aparte, y por eso
                    van en letra chica debajo y no como dos columnas más. */}
                <div>
                  <p className="text-[11px] tracking-[.09em] text-faint">PAGADO</p>
                  <p className="tnum mt-1 font-mono text-[19px] font-semibold">{pesos(total.hayPlan ? total.pagado : null)}</p>
                  <p className="tnum mt-1 font-mono text-[11.5px] text-faint">
                    neto {pesos(total.netoPagado)} · IVA {pesos(total.ivaPagado)}
                  </p>
                </div>
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

/** Una pastilla de filtro: el mismo patrón que los filtros de la cartera del OS. */
function Pastilla({ a, activa, children }: { a: string; activa: boolean; children: string }) {
  return (
    <Link
      href={a}
      aria-current={activa ? 'page' : undefined}
      className={
        'flex min-h-9 items-center rounded-full px-3.5 text-[12.5px] transition-colors ' +
        (activa ? 'bg-ink font-semibold text-canvas' : 'border border-line text-muted hover:text-ink')
      }
    >
      {children}
    </Link>
  )
}

function Solapa({ a, activa, children }: { a: string; activa: boolean; children: string }) {
  return (
    <Link
      href={a}
      aria-current={activa ? 'page' : undefined}
      className={
        'flex min-h-9 items-center rounded-[6px] px-3 text-[12.5px] ' +
        (activa ? 'bg-marca font-semibold text-ink' : 'text-muted hover:text-ink')
      }
    >
      {children}
    </Link>
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
