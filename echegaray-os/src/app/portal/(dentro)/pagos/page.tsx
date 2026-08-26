import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { loQueSiPuedeVer } from '../../permisos'
import { contratoDelConjunto, esquemaDelPortal, hoyEnObra } from '../datosObra'
import { corto, estadoDePago, proximoPago, resumenDeCobro, pesos, diaMes, ROTULO_ESTADO } from '../../cronograma'
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

  const porObra = <T extends { obraId: string | null }>(lista: T[]) => (obra ? lista.filter((p) => p.obraId === obra) : lista)
  const delEstado = porObra(enOrden)
  const visibles = ver === 'pagados' ? delEstado.filter((p) => p.fechaPago)
    : ver === 'pendientes' ? delEstado.filter((p) => !p.fechaPago)
    : delEstado
  const nPagados = delEstado.filter((p) => p.fechaPago).length

  // ═══ LOS TOTALES SIGUEN AL FILTRO POR OBRA (26/08/2026) ═══
  //
  // «El total pagado que se muestra en el footer es confuso: ¿representa las obras que están siendo
  // mostradas?» No lo representaba, y por eso confundía: eran siempre los del cliente entero. Un pie
  // de tabla se lee como el total DE LA TABLA que tiene arriba.
  //
  // Ahora sigue a la obra elegida —y dice cuál—, y el contrato pasa a ser el de ESA obra. Lo que NO
  // lo mueve es el filtro de ESTADO, a propósito: si «Pagado» se pusiera en cero al tocar
  // «Pendiente», el número dejaría de significar algo. Lo que faltaba no era que cambiara, era que
  // se DIJERA — y eso lo hacen ahora las pastillas, que llevan su propio importe, y el rótulo del
  // pie, que declara su alcance.
  const deLaObra = porObra(pagos)
  // Con una obra elegida el contrato es el suyo y la cobertura es trivial; sin filtro, el del
  // conjunto, que además dice de cuántas obras salió. Son dos formas distintas y se mantienen
  // separadas: fundirlas obligaba a fingir que una obra sola tiene «cobertura».
  const contratoDeUnaObra = obra ? (contratos.get(obra) ?? null) : null
  const contratoDeTodas = obra ? null : contratoDelConjunto(bloques, contratos)
  const contratoDelFiltro = contratoDeUnaObra ?? contratoDeTodas
  // ═══ UNA CUENTA POR MONEDA (26/08/2026) ═══
  //
  // El contrato de Quattropani es en dólares y sus doce cobros también. El pie mostraba un contrato
  // en PESOS —el que guarda el registro de obras— y «Pendiente: sin cargar», porque ninguna línea en
  // pesos alimentaba la suma. Un contrato en una moneda al lado de cobros en otra no es un total: es
  // dos números que no se pueden comparar puestos uno al lado del otro.
  //
  // Ahora se cuenta cada moneda por separado y el CONTRATO acompaña a la columna de SU moneda: uno
  // en dólares arriba de una suma en pesos afirmaría una equivalencia que nadie calculó.
  const contratoARS = contratoDelFiltro?.moneda === 'ARS' ? contratoDelFiltro.monto : null
  const contratoUSD = contratoDelFiltro?.moneda === 'USD' ? contratoDelFiltro.monto : null
  const total = resumenDeCobro(deLaObra, contratoARS, hoy)
  const enDolares = resumenDeCobro(deLaObra, contratoUSD, hoy, 'USD')
  // QUÉ COLUMNAS SE DIBUJAN — sobre los NO históricos, que son los que alimentan las sumas. Con
  // `pagos` a secas, una obra cuyos únicos cobros en pesos son de trabajo anterior dibujaba una
  // columna «PAGADO» que decía «sin cargar»: una columna vacía pidiendo explicación.
  const enCurso = deLaObra.filter((p) => !p.historico)
  const hayPesos = enCurso.some((p) => p.moneda === 'ARS')
  const hayDolares = enCurso.some((p) => p.moneda === 'USD')
  const nombreDelFiltro = obra ? (conPagos.find(([id]) => id === obra)?.[1] ?? '') : null
  // De cuántas obras salió el contrato, y cuántas quedaron sin él. Con una obra elegida es esa sola.
  const cobertura = obra
    ? { obras: contratoDeUnaObra?.monto != null ? 1 : 0, sinContrato: contratoDeUnaObra?.monto == null ? 1 : 0 }
    : { obras: contratoDeTodas?.obras ?? 0, sinContrato: contratoDeTodas?.sinContrato ?? 0 }

  // LO QUE DICE CADA PASTILLA. Es el MISMO número que el pie —el neto de esa moneda— para que el
  // filtro y el total se puedan atar a ojo. Cuando hay dos monedas no se escribe importe en la
  // pastilla: no hay un número solo que las represente y sumarlas sería inventarlo.
  const importeDeFiltro = (cuantos: 'pagado' | 'pendiente'): string | null => {
    if (!montos || (hayPesos && hayDolares)) return null
    const r = hayDolares ? enDolares : total
    const n = cuantos === 'pagado' ? r.netoPagado : r.netoPendiente
    return n == null ? null : corto(n, hayDolares ? 'USD' : 'ARS')
  }

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
          {/* ═══ CADA PASTILLA LLEVA SU IMPORTE (26/08/2026) ═══
              «Los filtros de la sección Pagos deben indicar qué es lo que muestra cada concepto del
              footer.» El filtro decía cuántas filas y el pie cuánta plata, y no había forma de atar
              uno con otro sin sumar a mano. Ahora la pastilla escribe EL MISMO número que su columna
              del pie —el neto—, así que «Pendiente 10 · $ 109,6 M» y «PENDIENTE $ 109.592.878» se
              leen como lo que son: el conteo y el total de las mismas filas. */}
          <Pastilla a={con({ ver: null })} activa={ver === 'todos'}>{`Todos ${delEstado.length}`}</Pastilla>
          <Pastilla a={con({ ver: 'pendientes' })} activa={ver === 'pendientes'} monto={importeDeFiltro('pendiente')}>
            {/* «PENDIENTE», NO «POR COBRAR». El portal lo lee el CLIENTE: para él eso no es algo que
                va a cobrar, es algo que tiene que pagar. Y es la palabra que usa la pestaña Cobranzas
                y la ficha del cliente — el mismo estado no puede llamarse distinto según la pantalla. */}
            {`Pendiente ${delEstado.length - nPagados}`}
          </Pastilla>
          <Pastilla a={con({ ver: 'pagados' })} activa={ver === 'pagados'} monto={importeDeFiltro('pagado')}>
            {`Pagados ${nPagados}`}
          </Pastilla>
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
        </>
      )}

      {/* ═══ EL PIE: TRES NÚMEROS Y DE DÓNDE SALE CADA UNO ═══
          Está en las dos vistas —«que al final de los pagos salga lo total, pagado y pendiente en
          cada uno de los portales del cliente»— y sigue al filtro POR OBRA, no al de estado.
          Cada cifra dice ahora de cuántos cobros sale y cuál es su total con IVA: un número solo,
          sin su origen, obliga a sumar la lista a mano para saber si es el mismo. */}
      {montos ? (
        <>
          <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[11px] tracking-[.09em] text-faint">
              TOTALES DE {nombreDelFiltro ? nombreDelFiltro.toUpperCase() : 'TODAS SUS OBRAS'}
            </p>
            {/* EL ALCANCE SE DECLARA, no se deduce. Con un filtro de estado puesto, el pie muestra
                más filas que la lista de arriba: decirlo es la diferencia entre un total que no
                cierra y un total cuyo alcance el cliente entiende. */}
            {ver !== 'todos' ? (
              <p className="text-[11.5px] text-faint">
                del cronograma completo — arriba está filtrado por «{ver === 'pagados' ? 'Pagados' : 'Pendiente'}»
              </p>
            ) : null}
          </div>
          {/* LOS IMPORTES SON NETOS, SIN IVA, PORQUE EL CONTRATO ES NETO. Sumar los importes con IVA
              contra un contrato sin IVA daba un pie que no cerraba en ningún cliente: a Messina le
              decía «Contrato $5.008.661 · Pendiente $6.060.479» por la misma obra, que se lee como
              que debe más de lo que contrató. El total con impuesto sigue publicado, abajo y en
              letra chica, que es donde el cliente lo busca para su libro de IVA compras. */}
          <div className="mt-2 flex flex-wrap gap-x-12 gap-y-5 border-t-2 border-ink pt-5">
            {hayPesos ? (
              <Cifra
                rotulo={hayDolares ? 'CONTRATO ARS$' : 'CONTRATO'}
                neto={contratoARS}
                pie={contratoARS == null ? null : deQuienEsElContrato(cobertura)}
              />
            ) : null}
            {/* ═══ «U$S 63.000 + IVA», COMO LO DICE EL CONTRATO ═══
                El contrato de Quattropani se firmó por U$S 63.000 MÁS IVA, y así es como el cliente
                lo leyó. Publicar U$S 76.230 sería correcto de aritmética y ajeno al papel que él
                tiene: el número que reconoce es el neto, y el «+ IVA» es parte de cómo se pactó. */}
            {contratoUSD != null ? (
              <Cifra rotulo="CONTRATO US$" neto={contratoUSD} moneda="USD" pie={deQuienEsElContrato(cobertura)} />
            ) : null}
            {hayPesos ? (
              <>
                <Cifra
                  rotulo={hayDolares ? 'PAGADO ARS$' : 'PAGADO'}
                  neto={total.netoPagado}
                  conIva={total.pagado}
                  pie={cuantos(total.nPagado, 'cobrado')}
                />
                <Cifra
                  rotulo={hayDolares ? 'PENDIENTE ARS$' : 'PENDIENTE'}
                  neto={total.netoPendiente}
                  conIva={total.pendiente}
                  pie={cuantos(total.nPendiente, 'por pagar')}
                />
              </>
            ) : null}
            {hayDolares ? (
              <>
                <Cifra rotulo="PAGADO US$" neto={enDolares.netoPagado} conIva={enDolares.pagado} moneda="USD" pie={cuantos(enDolares.nPagado, 'cobrado')} />
                <Cifra rotulo="PENDIENTE US$" neto={enDolares.netoPendiente} conIva={enDolares.pendiente} moneda="USD" pie={cuantos(enDolares.nPendiente, 'por pagar')} />
              </>
            ) : null}
          </div>
          {/* SÓLO LO QUE DE VERDAD QUEDÓ AFUERA. Las líneas en otra moneda ya tienen su columna acá
              al lado: contarlas como «no entran» le avisaba a Quattropani que sus trece cobros
              quedaban fuera de un pie donde estaban los trece. */}
          {total.sinMonto + enDolares.sinMonto ? (
            <p className="mt-3 text-[12.5px] text-faint">
              {total.sinMonto + enDolares.sinMonto === 1
                ? '1 cobro no entra en estos totales'
                : `${total.sinMonto + enDolares.sinMonto} cobros no entran en estos totales`} — todavía sin importe cargado.
            </p>
          ) : null}
          {anteriores.length ? (
            <p className="mt-1.5 text-[12.5px] text-faint">
              Los {anteriores.length === 1 ? 'cobros' : `${anteriores.length} cobros`} de obras anteriores no están en estos totales.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  )
}

/** «de 1 obra» · «de 2 obras · 1 sin contrato cargado». El total nunca sale sin su cobertura. */
function deQuienEsElContrato({ obras, sinContrato }: { obras: number; sinContrato: number }): string {
  const base = obras === 1 ? 'de 1 obra' : `de ${obras} obras`
  return sinContrato ? `${base} · ${sinContrato === 1 ? '1 obra sin contrato cargado' : `${sinContrato} obras sin contrato cargado`}` : base
}

/** «3 cobros cobrados» — el conteo que ata la cifra del pie con las filas de arriba. */
const cuantos = (n: number, que: string): string => `${n === 1 ? '1 cobro' : `${n} cobros`} ${que}`

/**
 * UNA CIFRA DEL PIE: el neto grande, el «+ IVA», y debajo de dónde sale.
 *
 * El neto es el número que se compara con el contrato —que está en neto— y el que el cliente
 * reconoce del papel que firmó. El total con IVA va abajo, en chico, para quien concilia contra su
 * libro de compras. Sin el neto el pie no se puede comparar con el contrato; sin el total, no se
 * puede comparar con lo que transfirió. Los dos hacen falta y no son intercambiables.
 */
function Cifra({
  rotulo, neto, conIva, moneda = 'ARS', pie,
}: {
  rotulo: string
  neto: number | null
  conIva?: number | null
  moneda?: 'ARS' | 'USD'
  pie?: string | null
}) {
  return (
    <div>
      <p className="text-[11px] tracking-[.09em] text-faint">{rotulo}</p>
      <p className="tnum mt-1 font-mono text-[19px] font-semibold">
        {pesos(neto, moneda)}
        {neto != null ? <span className="text-[13px] font-normal text-muted"> + IVA</span> : null}
      </p>
      {/* El total con IVA sólo cuando aporta algo: si es igual al neto —un cobro en efectivo sin
          factura— repetirlo haría dudar de cuál de los dos es el bueno. */}
      {neto != null && conIva != null && Math.round(conIva) !== Math.round(neto) ? (
        <p className="tnum mt-1 font-mono text-[11.5px] text-faint">total {pesos(conIva, moneda)}</p>
      ) : null}
      {pie ? <p className="mt-1 text-[11.5px] text-faint">{pie}</p> : null}
    </div>
  )
}

/** Una pastilla de filtro: el mismo patrón que los filtros de la cartera del OS. */
function Pastilla({ a, activa, monto, children }: { a: string; activa: boolean; monto?: string | null; children: string }) {
  return (
    <Link
      href={a}
      aria-current={activa ? 'page' : undefined}
      className={
        'flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors ' +
        (activa ? 'bg-ink font-semibold text-canvas' : 'border border-line text-muted hover:text-ink')
      }
    >
      {children}
      {/* El importe en la misma pastilla, separado por un punto medio y en mono: es una cifra, y
          alineada con la del pie tiene que leerse como la misma. */}
      {monto ? <span className={`tnum font-mono ${activa ? 'opacity-80' : 'text-faint'}`}>· {monto}</span> : null}
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
