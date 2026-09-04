// PANTALLA 24 · COMPRAS — el libro de compras de ARCA, con su control.
//
// ═══ QUÉ DECISIÓN CAMBIA ═══
//
// Tres, y las tres cuestan plata: a qué obra se le carga cada gasto (sin eso el costo real de la
// obra está incompleto y su margen es una ficción), si un comprobante que se parece a otro es el
// mismo gasto pagado dos veces, y si un papel que el OS no pudo clasificar está entrando mal a los
// cuadros de IVA. Hoy nada de eso tenía pantalla: la asignación a obra vivía escondida en
// `/control-obras/costos` y los duplicados no se miraban en ningún lado.
//
// ═══ QUIÉN LA VE, Y POR QUÉ NO LLEVA PORTERO ECONÓMICO ═══
//
// `esAdministracion()` — Dirección, Administración y Jefe de Obra —, igual que el resto de
// `(main)/administracion`. NO lleva `veEconomia()`, y es una decisión, no un olvido: una compra es
// COSTO, no PRECIO. La línea del 19/08 es exactamente ésa, textual del dueño: *«los costos de las
// obras… y lo que se lleva gastado, sí tienen que ver»*. Lo que el jefe de obra no ve es cuánto se
// vendió la obra, y eso no aparece acá.
//
// Y coincide con la base: la policy de `comprobantes_arca` (20260716140000) es
// `for select to authenticated using (true)` con grant de tabla. Poner un portero económico en el
// front mientras PostgREST publica el mismo importe a cualquier sesión sería teatro — la pantalla
// quedaría más angosta que la base y el agujero seguiría abierto sin que nadie lo vea.
//
// ═══ LA LISTA ES LA PESTAÑA COMPRAS, NO EL LIBRO DE ARCA (25/08/2026) ═══
//
// Pedido del dueño, textual: *«la sección "compras" en app.ecsas tiene que replicar toda la
// información que actualmente se concentra en pestaña Compras de Sheet Flujo de Fondos»*.
//
// Hasta hoy esta pantalla listaba `comprobante_compra` —la vista del libro de compras de ARCA— y su
// propio texto de ayuda afirmaba que «la pestaña Compras del Sheet es una proyección de lo mismo, no
// una segunda versión». Medido el 25/08 contra las dos fuentes: ARCA tiene 632 comprobantes y la
// pestaña 882 filas. No son la misma población y no podían serlo — ARCA no puede tener el gasto sin
// factura, los sueldos, los impuestos, las boletas, ni la imputación a obra que el dueño escribe a
// mano. La afirmación era falsa y estaba escrita en la pantalla.
//
// Ahora la lista es `public.compra_sheet` (la réplica fiel, ver `20260825T1200`). EL CONTROL CONTRA
// ARCA NO SE BORRÓ: sigue entero detrás del chip «Control ARCA» (`?f=arca`), con su imputación a
// obra, sus duplicados y su panel. Son dos preguntas distintas —qué gastó la empresa y qué le
// reconoce AFIP— y las dos siguen teniendo respuesta; lo que no puede seguir es que la pantalla
// llame «Compras» a una población distinta de la que el dueño llama Compras.
//
// ═══ «CARGAR COMPROBANTE» SUBE ARCHIVOS, Y ENTRA POR EL CIRCUITO DEL BOT (25/08/2026) ═══
//
// Hasta el 24/08 este botón explicaba que la carga se hacía sólo por Mattermost, con un argumento
// correcto —una segunda puerta sin OCR ni cruces cargaría comprobantes que nadie verificó— y una
// conclusión equivocada. El dueño la corrigió, textual: *«la carga de comprobantes se debe hacer de
// la misma manera que se hace vía bot del OS: cargo archivo multimedia al canal carga de
// comprobantes y la carga se debe hacer en app ecsas y en sheet flujo de fondos, todo respaldado en
// BD»*.
//
// La realidad única se respeta igual, y por eso esta pantalla NO carga nada: encola. El archivo va
// al bucket privado `comprobantes`, la fila a `public.comprobante_entrada`, y el worker de la VM lo
// procesa con EXACTAMENTE el mismo código que el bot (`comunicacion/comprobantes/circuito.mjs`) —
// visión, los tres cruces, el freno de mano de Sheets y el registro de idempotencia. Un circuito,
// dos puertas. El estado de cada archivo vuelve leyendo esa misma fila.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { getObrasCanonicas } from '@/features/control-obras/services/costosObraService'
import { Aviso, Ayuda, BuscadorURL, Num } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { C, FranjaCartera, PAGINA } from '@/shared/components/canon'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { AtencionCompras, FiltrosCompras } from '@/features/administracion/components/EstadosDeControl'
import { CargarComprobante } from '@/features/administracion/components/CargarComprobante'
import { EntradasSubidas } from '@/features/administracion/components/EntradasSubidas'
import { TablaCompras } from '@/features/administracion/components/TablaCompras'
import { PanelCompra } from '@/features/administracion/components/PanelCompra'
import {
  filtroDe, obrasFrecuentes, ROTULO_FILTRO, type FiltroCompras,
} from '@/features/administracion/services/comprasEstado'
import { TablaComprasSheet } from '@/features/administracion/components/TablaComprasSheet'
import { PanelCompraSheet } from '@/features/administracion/components/PanelCompraSheet'
import { AdjuntosSueltos } from '@/features/administracion/components/AdjuntosSueltos'
import { FiltrosSheet } from '@/features/administracion/components/FiltrosSheet'
import {
  conteosDe, filtroDe as filtroSheetDe, pasa, ROTULO as ROTULO_SHEET, totalesDe, type FiltroSheet,
} from '@/features/administracion/services/comprasSheet'
import {
  getAdjuntosSueltos, getComprasSheet, TOPE as TOPE_SHEET,
} from '@/features/administracion/services/comprasSheetService'
import {
  getCompra, getCompras, getConteos, getObrasDelEmisor, getParecidos, TOPE,
} from '@/features/administracion/services/comprasService'
import { getEntradas } from '@/features/administracion/services/comprobanteEntradaService'
import { claveIdentidad, getIdentidades } from '@/features/administracion/services/identidadProveedorService'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/compras'

/** La URL de una vista de esta pantalla. Todo el estado vive acá: se comparte y vuelve con «atrás». */
function url({ f, q, c, o }: { f?: FiltroCompras; q?: string; c?: string; o?: string }): string {
  const p = new URLSearchParams()
  // `f=arca` es lo que MANTIENE abierta esta vista: sin él, cualquier clic dentro del control
  // fiscal caería en la pestaña Compras y la persona perdería dónde estaba.
  p.set('f', 'arca')
  // El filtro propio del control viaja en `fa` para no pelearse con el de la pestaña. Que sean dos
  // parámetros y no uno es a propósito: son dos vistas con dos vocabularios distintos, y meterlos en
  // la misma llave haría que «sinObra» de una significara otra cosa en la otra.
  if (f && f !== 'capturadas') p.set('fa', f)
  if (q) p.set('q', q)
  if (c) p.set('c', c)
  // La obra que dejó elegida un atajo del panel. Viaja en la URL como todo el resto del estado: sin
  // eso, el atajo tendría que ser un componente de cliente con estado propio para no perderse.
  if (o) p.set('o', o)
  const s = p.toString()
  return s ? `${RUTA}?${s}` : RUTA
}

/**
 * EL RUTEO DE LA PANTALLA. `?f=arca` abre el control contra el libro de ARCA —que es todo lo que
 * había acá hasta el 25/08 y sigue igual—; cualquier otra cosa abre la pestaña Compras, que es lo
 * que el dueño llama Compras.
 */
export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; fa?: string; c?: string; o?: string; s?: string }>
}) {
  const sp = await searchParams
  if (sp.f === 'arca') return <ControlArca searchParams={searchParams} />
  return <PestanaCompras sp={sp} />
}

/** LA PESTAÑA COMPRAS, entera. La lista que pidió el dueño. */
async function PestanaCompras({ sp }: { sp: { q?: string; f?: string; c?: string; s?: string } }) {
  const filtro = filtroSheetDe(sp.f)
  const q = sp.q?.trim().toLowerCase() || undefined

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '0 20px' }}><Aviso tono="info">Esta pantalla es de Administración.</Aviso></div>
      </Marco>
    )
  }

  // La identidad de los proveedores viaja en el mismo viaje que el resto: es una lectura chica
  // —una fila por TEXTO distinto, no por compra— y sin ella el panel no puede decir de quién es el
  // gasto. Si falla, el Map queda vacío y la pantalla dice «sin identificar»: nunca inventa un
  // proveedor porque no pudo leer.
  const [listado, sueltos, entradas, identidades] = await Promise.all([
    getComprasSheet(supabase),
    getAdjuntosSueltos(supabase),
    getEntradas(supabase),
    getIdentidades(supabase),
  ])

  if (listado.error || !listado.data) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '0 20px' }} data-testid="compras-error">
          <Aviso tono="neg" titulo="No pude leer la pestaña Compras">{listado.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const todas = listado.data.filas
  // LOS CONTEOS SALEN DE LA POBLACIÓN ENTERA, no de lo que se está mirando: si contaran lo filtrado,
  // el número de arriba dejaría de ser el de la empresa.
  const conteos = conteosDe(todas)
  const visibles = todas.filter((f) => {
    if (!pasa(f, filtro)) return false
    if (!q) return true
    return [f.proveedor, f.comprobante, f.concepto, f.detalle_obra, f.obra_texto, f.cuit]
      .some((v) => v?.toLowerCase().includes(q))
  })

  /**
   * LA URL DE LA VISTA DE LA PESTAÑA. Todo el estado viaja acá —filtro, búsqueda y la fila abierta—
   * para que el panel se comparta con un link y vuelva con «atrás». `s` es la fila del Sheet, y es
   * una llave distinta de la `c` del control ARCA a propósito: son dos poblaciones y abrir una no
   * puede dejar abierta la otra.
   */
  const urlSheet = ({ f = filtro, s: filaSel }: { f?: FiltroSheet; s?: number | null } = {}) => {
    const p = new URLSearchParams()
    if (f !== 'todo') p.set('f', f)
    if (sp.q) p.set('q', sp.q)
    if (filaSel != null) p.set('s', String(filaSel))
    const t = p.toString()
    return t ? `${RUTA}?${t}` : RUTA
  }
  const href = (f: FiltroSheet) => urlSheet({ f, s: null })

  // La fila abierta sale de lo que YA se leyó: abrir el panel no cuesta una consulta más.
  const filaAbierta = sp.s ? (todas.find((f) => f.fila === Number(sp.s)) ?? null) : null
  // Los totales del pie miran LO QUE SE ESTÁ VIENDO —la nota dice «6 de 882»—, a diferencia de los
  // conteos de los chips, que miran la población entera.
  const totalesVisibles = totalesDe(visibles)

  return (
    <Marco>
      <NavAdministracion />
      <FranjaCartera titulo="Compras" testid="franja-compras" accion={<CargarComprobante />}>
        <BuscadorURL
          accion={RUTA}
          q={sp.q}
          placeholder="Buscar comprobante o proveedor"
          oculto={{ f: filtro === 'todo' ? undefined : filtro }}
          ancho="w-[238px] max-w-full"
          variante="caja"
          testid="buscar-compra"
        />
        <FiltrosSheet
          conteos={conteos} activo={filtro} hrefDe={href} sueltos={sueltos.data?.length ?? 0}
        />
        {/* EL CONTROL CONTRA ARCA NO DESAPARECE: es otra pregunta y tiene su puerta. */}
        <Link href={`${RUTA}?f=arca`} data-testid="ir-control-arca" className="text-[12px] text-faint underline underline-offset-2">
          Control ARCA
        </Link>
      </FranjaCartera>

      <div style={{ padding: '0 20px' }}>
        <EntradasSubidas entradas={entradas.data ?? []} />
      </div>

      <div style={{ padding: '0 20px' }}>
        <Ayuda titulo="De dónde salen estas filas" testid="ayuda-compras">
          Es la pestaña Compras del Sheet Flujo de Caja, fila por fila: todo lo que la empresa gastó,
          con la obra que le asignó Dirección y el comprobante que se mandó por el chat. La FUENTE
          sigue siendo el Sheet — esto es su espejo, y se refresca solo. El libro que ARCA le
          reconoce a la empresa es otra cosa y vive en «Control ARCA»: ahí están 632 comprobantes
          fiscales, acá {todas.length} filas de gasto.
        </Ayuda>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        {filtro === 'sueltos' ? (
          <div style={{ background: C.superficie, border: `1px solid ${C.linea}`, borderRadius: 10, overflow: 'hidden' }}>
            <AdjuntosSueltos adjuntos={sueltos.data ?? []} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {/* LOS TOTALES Y LA NOTA AL PIE VIVEN EN LA COLUMNA DE LA LISTA (handoff v4). Estaban
                  debajo del split, así que al abrir el panel la nota quedaba cruzando por debajo de
                  los dos y decía «6 de 882» a lo ancho de una pantalla donde la lista ocupa la
                  mitad: el número se leía como si describiera el panel también. */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <TablaComprasSheet
                  filas={visibles}
                  seleccionada={filaAbierta?.fila}
                  hrefDe={(fila) => urlSheet({ s: fila === filaAbierta?.fila ? null : fila })}
                />
                <p className="mt-3 text-[11px] text-faint">
                  <Num className="text-faint">{visibles.length}</Num> de{' '}
                  <Num className="text-faint">{todas.length}</Num>
                  {filtro !== 'todo' && <> · {ROTULO_SHEET[filtro]}</>}
                  {q && <> · «{sp.q}»</>}
                  {(q || filtro !== 'todo') && (
                    <> · <Link href={RUTA} data-testid="quitar-filtros" className="underline underline-offset-2">Ver todo</Link></>
                  )}
                </p>
                {/* EL TOTAL NO SUMA LO QUE NO TIENE IMPORTE, y eso se dice. La suma trata el `null`
                    como 0 porque no puede hacer otra cosa; callarlo hace que el total se lea como
                    si estuviera completo, y el que lo compare contra el Sheet no va a saber por qué
                    no cierra. */}
                {totalesVisibles.sinImporte > 0 && (
                  <p className="mt-1 text-[11px] text-faint" data-testid="compras-sin-importe">
                    <Num className="text-faint">{totalesVisibles.sinImporte}</Num>
                    {totalesVisibles.sinImporte === 1 ? ' fila sin importe cargado' : ' filas sin importe cargado'}
                    {': queda fuera de la suma.'}
                  </p>
                )}
                {/* UN CONTROL QUE NO PUDO MIRAR TODO NO PUEDE DECIR «NO HAY MÁS». */}
                {listado.data.truncado && (
                  <p className="mt-1 text-[11.5px] text-warn" data-testid="compras-truncado">
                    Se muestran las {TOPE_SHEET} más recientes. Lo que falta no está vacío: está fuera
                    del tope de esta pantalla.
                  </p>
                )}
              </div>
              {filaAbierta && (
                <PanelCompraSheet
                  fila={filaAbierta}
                  identidad={identidades.data.get(claveIdentidad(filaAbierta.proveedor, filaAbierta.cuit))}
                  cerrarHref={urlSheet({ s: null })}
                  hrefsFiltro={{
                    sinObra: urlSheet({ f: 'sinObra', s: null }),
                    sinComprobante: urlSheet({ f: 'sinComprobante', s: null }),
                    aPagar: urlSheet({ f: 'aPagar', s: null }),
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Marco>
  )
}

/** EL CONTROL CONTRA EL LIBRO DE ARCA — sin cambios respecto del 24/08, sólo movido detrás de `?f=arca`. */
async function ControlArca({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; fa?: string; c?: string; o?: string; s?: string }>
}) {
  const sp = await searchParams
  const filtro = filtroDe(sp.fa)
  const q = sp.q?.trim() || undefined

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  // LA PUERTA NO ES LA CERRADURA: la RLS de `comprobantes_arca` decide qué filas salen. Este `if`
  // evita mostrarle la pantalla a quien no administra nada.
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '0 20px' }}><Aviso tono="info">Esta pantalla es de Administración.</Aviso></div>
      </Marco>
    )
  }

  // TODO EN UN VIAJE, panel incluido. `getCompra` esperaba a que terminara la lista para recién
  // ahí salir a buscar el comprobante abierto: cada clic en una fila pagaba dos idas a la base en
  // serie (~2,2s medidos en el QA del 24/08). El panel no depende de la lista para nada.
  const [listado, conteos, obras, abierta, entradas] = await Promise.all([
    getCompras(supabase, { q, filtro }),
    getConteos(supabase),
    getObrasCanonicas(supabase),
    sp.c ? getCompra(supabase, sp.c) : Promise.resolve(null),
    // LA COLA DE LO SUBIDO VA EN EL MISMO VIAJE. Es la lectura más chica de la pantalla y la que más
    // rápido cambia: pedirla aparte pagaría una ida a la base por cada refresco del polling.
    getEntradas(supabase),
  ])

  if (listado.error || !listado.data || conteos.error || !conteos.data) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '0 20px' }} data-testid="compras-error">
          <Aviso tono="neg" titulo="No pude leer el libro de compras">
            {listado.error ?? conteos.error}
          </Aviso>
        </div>
      </Marco>
    )
  }

  const { filas, total, truncado } = listado.data
  // Las dos lecturas del panel van juntas: son independientes entre sí y sólo ocurren con el panel
  // abierto. En serie agregaban un viaje de red a cada clic de la lista.
  const [parecidos, historialObras] = abierta
    ? await Promise.all([getParecidos(supabase, abierta.id), getObrasDelEmisor(supabase, abierta.emisor_cuit)])
    : [[], []]
  const atajos = obrasFrecuentes(historialObras, { excluir: abierta?.obra_texto ?? null })

  return (
    // SIN ENCABEZADO DE PÁGINA (24/08/2026, canónico 24). El «Compras» a 22px arriba de todo no
    // está en el mockup: la sub-navegación ya lo nombra con su contador, y el nombre de la lista
    // baja a la misma línea que el buscador y la acción primaria.
    <Marco>
      <NavAdministracion />

      {/* ═══ UNA SOLA LÍNEA DE CONTROL, Y LA ALARMA DEBAJO (canónico 24) ═══

          El mockup pone buscador, filtros y la acción primaria en el MISMO renglón, y recién debajo
          la banda suave de lo que pide trabajo. Antes eran dos bloques apilados —buscador arriba,
          seis KPIs grandes debajo— y la lista arrancaba a 190px del encabezado: en un portátil se
          veían cuatro filas del libro de compras. */}
      <FranjaCartera titulo="Control ARCA" testid="franja-compras" accion={<CargarComprobante />}>
        {/* 238px — `24`, línea 60. */}
        <BuscadorURL
          accion={RUTA}
          q={sp.q}
          placeholder="Buscar comprobante o proveedor"
          // `f=arca` VIAJA SIEMPRE EN EL BUSCADOR: sin él, buscar dentro del control fiscal
          // devolvía a la pestaña Compras, y el filtro del control se leía como filtro de la
          // pestaña —donde no existe—, así que la lista volvía a «todo» sin decir por qué.
          oculto={{ f: 'arca', fa: filtro === 'capturadas' ? undefined : filtro, c: sp.c }}
          ancho="w-[238px] max-w-full"
          variante="caja"
          testid="buscar-compra"
        />
        <FiltrosCompras
          conteos={conteos.data}
          activo={filtro}
          hrefDe={(f) => url({ f, q, c: sp.c })}
        />
      </FranjaCartera>

      {/* LO RECIÉN SUBIDO VA ARRIBA DE TODO lo demás y debajo de la acción que lo produjo: es lo
          único de esta pantalla que está pasando AHORA. La banda de atención cuenta problemas
          acumulados (653 sin imputar); esto contesta «la foto que acabo de sacar, ¿entró?». */}
      <div style={{ padding: '0 20px' }}>
        <EntradasSubidas entradas={entradas.data ?? []} />
      </div>

      <div style={PAGINA.atencion}>
        <AtencionCompras conteos={conteos.data} hrefDe={(f) => url({ f, q, c: sp.c })} />
      </div>

      {/* EL SUBTÍTULO EXPLICATIVO SE FUE ACÁ ADENTRO (Design 23/08). Lo que la pantalla muestra no
          se explica; lo que NO se ve —de dónde sale cada fila y qué manda cuando dos fuentes
          discrepan— sí hace falta, pero una vez y bajo demanda. */}
      <div style={{ padding: '0 20px' }}>
      <Ayuda titulo="De dónde salen estas filas" testid="ayuda-compras">
        Es el libro de compras que ARCA le reconoce a la empresa, comprobante por comprobante. El
        control vive en esta base: la pestaña Compras del Sheet es una proyección de lo mismo, no
        una segunda versión. El estado de cada fila se calcula —no se guarda—, así que imputar por
        otra puerta lo cambia igual.
      </Ayuda>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start" style={{ padding: '0 20px 20px' }}>
        <div className="min-w-0 flex-1">
          <TablaCompras
            filas={filas}
            seleccionado={abierta?.id}
            hrefDe={(id) => url({ f: filtro, q, c: id })}
          />
          <p className="mt-3 max-w-[820px] text-[11px] text-faint">
            <Num className="text-faint">{filas.length}</Num> de{' '}
            <Num className="text-faint">{total}</Num>
            {filtro !== 'capturadas' && <> · {ROTULO_FILTRO[filtro]}</>}
            {q && <> · «{q}»</>}
            {(q || filtro !== 'capturadas') && (
              <> · <Link href={RUTA} data-testid="quitar-filtros" className="underline underline-offset-2">Ver todo</Link></>
            )}
          </p>
          {/* UN CONTROL QUE NO PUDO MIRAR TODO NO PUEDE DECIR «NO HAY MÁS». El tope se dice como
              ADVERTENCIA y no como nota al pie: seis faltantes falsos ya costaron una investigación
              entera. Cuando no recorta no se escribe nada — normal silencioso. */}
          {truncado && (
            <p className="mt-1 max-w-[820px] text-[11.5px] text-warn" data-testid="compras-truncado">
              Se muestran los {TOPE} más recientes. Lo que falta no está vacío: está fuera del tope
              de esta pantalla.
            </p>
          )}
        </div>

        {abierta && (
          <PanelCompra
            compra={abierta}
            parecidos={parecidos}
            obras={obras}
            atajos={atajos}
            obraElegida={sp.o?.trim() || undefined}
            cerrarHref={url({ f: filtro, q })}
            hrefDe={(id) => url({ f: filtro, q, c: id })}
            hrefObra={(o) => url({ f: filtro, q, c: sp.c, o })}
          />
        )}
      </div>
    </Marco>
  )
}

/**
 * EL MARCO DEL CANON: fondo #F7F7F5 a toda la altura. `SelloDatoBueno` venía de `PageShell`, que
 * esta pantalla ya no usa — sin él, `error.tsx` pierde la hora del último dato bueno.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      {children}
    </div>
  )
}
