// NÓMINA Y COBRANZA — dos lecturas de la empresa, al final del módulo. (Caja vive en VistaCaja.tsx:
// desde el 18/09/2026 es la pestaña CAJA leída de su espejo, no un cálculo sobre egresos.)
//
// Diseño v6: columnas mensuales (nómina apilada blanco/negro), barras por área, la banda de
// antigüedad apilada y la tabla de clientes con el verbo del día.
// Lo que el diseño trae escrito a mano (3.053,5 h, 396 h, «27 de 30») sale acá de los datos o no sale.
import Link from 'next/link'
import { millones, pctEntero } from '../services/formato'
import { bandasDeCobranza, cifrasCobranza, cobranza, legajos, type FilaCobranza } from '../services/empresa'
import type { NominaPagada, PersonaPagada } from '../services/nominaPagada'
import type { LineaDeNomina, NominaConCosto } from '../services/costoNomina'
import { aUrl, type Filtros } from '../services/filtros'
import type { ClaveBanda } from '../../clientes/services/reglasCobranza'
import { documentosDeCobranzas } from '../../clientes/services/documentoDeCobranza'
import { diaMes, diaMesAnio } from '../../clientes/services/cobranzaFormato'
import { agendaDeCobro, cuando, proximoPorCliente, type AgendaDeCobro, type CobroProximo } from '../services/cobrosProximos'
import { ancho, Cabecera, ENCABEZADO, FilaDeCifras, rotuloMes, Seccion, SinLectura, Valor } from './Piezas'
import { Torta } from './Torta'
import { ColumnaConDetalle } from './ColumnaConDetalle'
import { detalleDeColumna } from '../services/detalleColumna'

/**
 * Columnas mensuales con el valor arriba y el mes abajo; `partes` se apilan de arriba hacia abajo.
 *
 * ═══ EL ANCHO MÍNIMO DE UNA COLUMNA LO FIJA SU ETIQUETA (QA visual, 22/09/2026) ═══
 *
 * En 390 px y con nueve meses, la columna quedaba en ~41 px y «$ 18,06 M» mide 53: las etiquetas se
 * pisaban entre sí —18,06 sobre 19,34 sobre 19,92— y «en curso» salía cortado en «en curs…». Un
 * número pisado por el de al lado no es un número. Con `minmax(56px, 1fr)` la columna nunca baja del
 * ancho de su etiqueta y, cuando no entran todas, el gráfico se corre en su propia caja (la página
 * sigue sin scroll lateral). En pantalla grande no cambia nada: ahí la columna ya mide más de 56.
 *
 * ═══ ABRE EN ENERO, Y ASÍ SE QUEDA ═══
 *
 * En el teléfono el gráfico arranca en `scrollLeft: 0`, así que lo primero que se ve es enero y el mes
 * en curso queda a la derecha del borde hasta que se corre. Se probó apoyarlo al final con `dir="rtl"`
 * en la caja y `dir="ltr"` en la grilla, para no volver cliente un componente de servidor: NO
 * funciona y es peor. Medido en 390 px (QA visual, 22/09/2026): en un contenedor `rtl` lo scrolleable
 * es el desborde de la IZQUIERDA, y el de la grilla queda a la derecha, así que el navegador deja de
 * registrar desborde —`scrollWidth == clientWidth == 358` con contenido de 568—, `scrollLeft` vuelve a
 * 0 con cualquier valor, y cuatro meses de Nómina y seis de Caja quedan recortados SIN forma de
 * llegar a ellos. Abrir en enero es un costo chico al lado de perder cuatro meses, y el mes en curso
 * ya lo dice el cuadro de abajo, que los tiene todos.
 *
 * Límite conocido: `overflow-x: auto` computa la `y` en `auto` por spec, así que algo que sobresalga
 * POR ARRIBA de la grilla se recortaría. Hoy el contenido mide exactamente el alto de la caja.
 */
export function Columnas({ meses, compacto = false }: {
  meses: {
    mes: string; valor: string | null; color?: string; nota?: string
    /** `nombre` y `monto` alimentan el detalle al pasar el mouse: cada tramo dice qué es y cuánto vale. */
    partes: { alto: number; clase: string; nombre?: string; monto?: number | null }[]
    /** El total para el detalle (número, no el texto de arriba de la barra). `null` = sin dato. */
    total?: number | null
    /** Sellos del mes para el detalle cuando no se dibujan bajo la barra. */
    notasDetalle?: string[]
    /** Rótulos bajo el mes. `corto` es el que entra en una columna de ~32 px (teléfono, con `compacto`). */
    sellos?: { largo: string; corto: string }[]
    /** Valor abreviado para el teléfono con `compacto` («33,2», sin «$» ni «M»: la unidad va en la leyenda). */
    valorCorto?: string
  }[]
  /**
   * LOS MESES ENTRAN TODOS EN LA PANTALLA DEL TELÉFONO (QA producción, 02/10/2026). Con `minmax(56px, 1fr)`
   * diez meses miden 632 px en una caja de 358: junio se cortaba y julio–octubre quedaban fuera de vista
   * sin pista alguna. Con `compacto` la columna es `minmax(0, 1fr)` (~32 px en 390), el valor se abrevia
   * y los sellos pasan a su forma corta; desde `lg` todo vuelve a ser como antes. Sólo lo pide Nómina:
   * Caja y Obras mantienen su deslizamiento declarado arriba.
   */
  compacto?: boolean
}) {
  const cruza = new Set(meses.map((m) => m.mes.slice(0, 4))).size > 1
  return (
    <div className={compacto ? '' : 'overflow-x-auto lg:overflow-visible'}>
      <div className={`grid h-[220px] items-end lg:gap-4 ${compacto ? 'gap-1' : 'gap-2'}`}
        style={{ gridTemplateColumns: `repeat(${Math.max(meses.length, 1)}, minmax(${compacto ? 0 : 56}px, 1fr))` }}>
        {meses.map((m, i) => {
          const detalle = detalleDeColumna({
            titulo: rotuloMes(m.mes, true), total: m.total === undefined ? (m.valor == null ? null : m.partes.reduce((n, p) => n + (p.monto ?? 0), 0)) : m.total,
            tramos: m.partes.filter((p) => p.nombre).map((p) => ({ nombre: p.nombre!, monto: p.monto ?? null })),
            sellos: [...(m.sellos?.map((t) => t.largo) ?? []), ...(m.notasDetalle ?? [])], sinDato: m.nota,
          })
          const posicion = i < meses.length / 2 ? 'inicio' : 'fin'
          return (
          <ColumnaConDetalle key={m.mes} detalle={detalle} posicion={posicion}
            colores={m.partes.filter((p) => p.nombre).map((p) => p.clase.split(' ')[0])}>
            <div className={`whitespace-nowrap text-[11px] font-semibold lg:text-[12.5px] ${m.valor == null ? 'font-normal text-faint' : m.color ?? 'text-ink'}`}>{m.valor == null ? m.nota : compacto && m.valorCorto ? <><span className="lg:hidden">{m.valorCorto}</span><span className="hidden lg:inline">{m.valor}</span></> : m.valor}</div>
            <div className="flex w-full max-w-[120px] flex-col overflow-hidden rounded-t-[2px]">
              {m.partes.map((p, j) => <div key={j} className={p.clase} style={{ height: `${Math.max(0, p.alto)}px` }} />)}
            </div>
            <div className="text-[11px] text-faint">{rotuloMes(m.mes, cruza)}</div>
            {m.sellos?.map((t) => (
              <div key={t.largo} className="-mt-1 whitespace-nowrap text-[11px] leading-[14px] text-muted">
                {compacto ? <><span className="lg:hidden">{t.corto}</span><span className="hidden lg:inline">{t.largo}</span></> : t.largo}
              </div>
            ))}
          </ColumnaConDetalle>
          )
        })}
      </div>
    </div>
  )
}

/**
 * NÓMINA — EL COSTO DE MANO DE OBRA POR MES Y, AL LADO, LO PAGADO A LA GENTE.
 *
 * Dueño, 02/10/2026: *«eso no está leyendo bien los costos de MO de personal»*. La solapa medía lo PAGADO
 * sin cargas (pedido del 22/09/2026) y por eso quedaba 31 % abajo del costo de MO de Obras: le faltaban
 * contribuciones, FCL y ART. Ahora el número principal y la barra son el COSTO —el de `costo_mo_quincena`,
 * el mismo de Obras, con su etiqueta «real» o «estimado» por mes— y lo pagado en blanco y en negro sigue,
 * como lectura secundaria rotulada «pagado» (lo pedido por el dueño no se quita). La diferencia entre las
 * dos —cargas, FCL y ART— tiene cifra propia para que el total cierre a la vista.
 *
 * Ninguna suma se hace acá: el costo sale de `costoNomina.ts` y lo pagado de `nominaPagada.ts`, y ambos
 * se prueban sin base. El año es CALENDARIO y fijo: el control de período no aplica a esta vista.
 */
export function VistaNomina({ pagado, costo, personas, filtros, mes, hoy }: {
  pagado: NominaPagada | null
  /** El costo de MO por mes junto a lo pagado. `null` = la función de costo no se pudo leer. */
  costo: NominaConCosto | null
  personas: unknown[] | null
  filtros: Filtros
  /** El mes que abre el detalle por persona, ya elegido por la página. */
  mes: string | null
  /** El día de San Juan, para poder fechar el corte del mes en curso («al 22/09»). */
  hoy: string
}) {
  if (!pagado) return <SinLectura que="la liquidación de sueldos" />
  const l = personas ? legajos(personas) : null
  // Con sellos bajo el mes la barra mide 130 y no 170, para que la caja siga midiendo 220.
  const { total, meses, avisos, enCurso } = pagado
  const alDia = `${hoy.slice(8, 10)}/${hoy.slice(5, 7)}`
  // SIN LA FUNCIÓN DE COSTO la tabla sigue mostrando lo pagado: perder el costo no borra lo que ya se leía.
  const lineas: LineaDeNomina[] = costo?.lineas ?? meses.map((m) => ({ mes: m.mes, costo: null, pagado: m, diferencia: null }))
  const max = Math.max(1, ...lineas.map((x) => x.costo?.costo ?? 0))
  const detalle = mes ? pagado.porPersona.get(mes) ?? [] : []
  const maxPersona = Math.max(1, ...detalle.map((p) => p.total))
  const anio = costo?.costoAnio
  const sinTarifa = lineas.reduce((n, x) => n + (x.costo?.sinDato ?? 0), 0)
  return (
    <>
      <Cabecera titulo="Nómina" detalle={`año ${pagado.anio} · costo de mano de obra y lo pagado a la gente`}
        cifras={[
          { rotulo: 'costo de mano de obra', valor: millones(anio?.total), falta: 'sin leer',
            nota: anio ? `${anio.meses} ${anio.meses === 1 ? 'mes completo' : 'meses completos'} · ${anio.estimado > 0 ? `${millones(anio.estimado)} estimado` : 'todo real'}` : null },
          { rotulo: 'pagado en blanco', valor: millones(total?.blanco), falta: 'sin quincena cerrada', nota: 'neto de los recibos' },
          { rotulo: 'pagado en negro', valor: millones(total?.negro), falta: '—', tono: (pagado.pctNegro ?? 0) > 0.5 ? 'warn' : undefined,
            nota: pagado.pctNegro == null ? null : `${pctEntero(pagado.pctNegro)} del pagado` },
          { rotulo: 'cargas, FCL y ART', valor: millones(costo?.diferenciaAnio?.total), falta: '—',
            nota: costo?.diferenciaAnio ? `costo menos pagado · ${costo.diferenciaAnio.meses} meses` : null },
          // EL MES EN CURSO NO ENTRA ACÁ: la cabecera tiene CINCO columnas fijas por diseño.
          { rotulo: 'plantel', valor: l ? String(l.plantel) : null, nota: 'por pertenencia' },
        ]} />
      <Seccion titulo="El costo, mes a mes" arriba="pt-8"
        aclaracion="millones de $; con cargas, FCL y ART; cada mes dice si es real o estimado"
        detalle="Sale de costo_mo_quincena, la misma función que usa Obras. Real: costo total del empleador que figura en el recibo (desde julio). Estimado: bruto del recibo por un factor, porque los recibos de enero a junio no traen contribuciones cargadas. Blanco: lo que cuesta la parte registrada; negro: lo cobrado en mano. Un mes incompleto va atenuado y dice «parcial». Las personas sin tarifa no suman y no valen 0. El mes en curso crece cada día: el costo se modela con las horas cargadas hasta hoy, así que dos lecturas del mismo mes en días distintos no coinciden."
        leyenda={[{ color: 'bg-serie-1', rotulo: 'blanco (con cargas)' }, { color: 'bg-serie-2', rotulo: 'negro (en mano)' }]}>
        {costo == null ? <SinLectura que="el costo de mano de obra por quincena" /> : (
          <Columnas compacto meses={lineas.map((x) => {
            const c = x.costo
            if (c?.costo == null) return { mes: x.mes, valor: null, nota: 'sin medir', partes: [] }
            const apagado = c.parcial ? ' opacity-60' : ''
            return {
              mes: x.mes, valor: millones(c.costo), total: c.costo, color: c.parcial ? 'text-muted' : undefined,
              valorCorto: (c.costo / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
              sellos: [
                ...(c.parcial ? [{ largo: 'parcial', corto: 'parc.' }] : []),
                ...(c.etiqueta === 'real' ? [{ largo: 'real', corto: 'real' }]
                  : c.etiqueta === 'estimado' ? [{ largo: 'estimado', corto: 'est.' }]
                  : c.etiqueta ? [{ largo: 'mixto', corto: 'mixto' }] : []),
              ],
              partes: [
                { alto: (c.negro / max) * 130, clase: `bg-serie-2${apagado}`, nombre: 'Negro (en mano)', monto: c.negro },
                { alto: (c.blanco / max) * 130, clase: `bg-serie-1${apagado}`, nombre: 'Blanco (con cargas)', monto: c.blanco },
              ],
            }
          })} />
        )}
      </Seccion>
      {/* ═══ EL MES EN CURSO TIENE SECCIÓN PROPIA PORQUE TIENE OTRA VARA ═══
          Dueño, 22/09/2026: la sección «no muestra nada en el mes en curso». Mostraba «en curso» y
          nada más, porque `cobra` vale 0 hasta que la quincena cierra. Ahora publica lo ENTREGADO y
          registrado, con su fecha de corte y con la vara escrita: mezclarlo con el año, en cambio,
          sería sumar dos definiciones de «pagado» en una cifra sola. */}
      {enCurso ? (
        <Seccion titulo={`El mes en curso · ${rotuloMes(enCurso.mes, true)}`} filo
          aclaracion={`al ${alDia} · pagado a medias: ${enCurso.quincenasAbiertas} ${enCurso.quincenasAbiertas === 1 ? 'quincena abierta' : 'quincenas abiertas'}, ninguna cerrada`}
          detalle="La quincena abierta no selló `cobra` todavía, así que este mes no se puede medir como los cerrados. Lo que se publica es lo ENTREGADO y registrado por canal: blanco = depositado (pagado_banco), negro = plata en mano (pagado_efectivo). El reparto sale del canal de pago y no del recibo del estudio, que para este mes no tiene ninguna línea cargada. Por eso no se suma al total del año.">
          <FilaDeCifras cifras={[
            { rotulo: 'entregado', valor: millones(enCurso.total), falta: '—', nota: 'no suma al año' },
            { rotulo: 'depositado', valor: millones(enCurso.blanco), falta: '—', nota: 'blanco, por canal' },
            { rotulo: 'en mano', valor: millones(enCurso.negro), falta: '—', nota: 'negro, por canal' },
            { rotulo: 'gente cobrada', valor: String(enCurso.personas), nota: 'con pago registrado' },
            { rotulo: 'sin pago registrado', valor: String(enCurso.sinPagoRegistrado),
              tono: enCurso.sinPagoRegistrado > 0 ? 'warn' : undefined, nota: 'no es «cobró 0»' },
          ]} />
        </Seccion>
      ) : null}
      <Seccion titulo="Cada mes, en números" filo
        aclaracion={mes ? 'el mes elegido abre el detalle de abajo' : 'ningún mes con quincena cerrada todavía'}>
        <div className="flex flex-col">
          <div className={`hidden h-9 items-center gap-4 border-b border-line lg:grid lg:grid-cols-[110px_repeat(5,minmax(0,1fr))_72px] ${ENCABEZADO}`}>
            <div>Mes</div><div className="text-right">Costo MO</div><div className="text-right">Pagado blanco</div>
            <div className="text-right">Pagado negro</div><div className="text-right">Pagado total</div>
            <div className="text-right">Cargas, FCL, ART</div><div className="text-right">% negro</div>
          </div>
          {lineas.map((x) => <FilaMes key={x.mes} x={x} elegido={x.mes === mes} href={aUrl(filtros, { mes: x.mes })} alDia={alDia} />)}
        </div>
      </Seccion>
      {mes ? (
        <Seccion titulo={`Quién cobró en ${rotuloMes(mes, true)}`} filo
          aclaracion={`${detalle.length} ${detalle.length === 1 ? 'persona' : 'personas'} · lo que se le pagó, no lo que le costó a la empresa${
            meses.find((x) => x.mes === mes)?.medida === 'registro_por_canal' ? ` · al ${alDia}, mes en curso: lo entregado por banco y en efectivo` : ''}`}>
          <div className="flex flex-col">
            <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[minmax(0,1fr)_110px_110px_110px_120px] ${ENCABEZADO}`}>
              <div>Persona</div><div className="text-right">Blanco</div><div className="text-right">Negro</div>
              <div className="text-right">Total</div><div />
            </div>
            {detalle.length === 0
              ? <p className="py-4 text-sm text-faint">ninguna línea de liquidación cerrada en el mes</p>
              : detalle.map((p) => <FilaPersonaPagada key={p.personaId} p={p} max={maxPersona} />)}
          </div>
        </Seccion>
      ) : null}
      <Seccion titulo="Lo que no se puede decir" filo>
        <div className="grid gap-6 pb-9 sm:grid-cols-2">
          <Hueco que={avisos.sinRecibo.n ? `${avisos.sinRecibo.n} · ${millones(avisos.sinRecibo.importe)}` : '0'} falta="ninguno"
            porque="pagos sin recibo cargado" destraba="contados enteros en negro" />
          <Hueco que={avisos.reciboMayor.n ? `${avisos.reciboMayor.n} · ${millones(avisos.reciboMayor.importe)}` : '0'} falta="ninguno"
            porque="el recibo superó lo cobrado" destraba="el negro se apoya en 0" />
          <Hueco que={avisos.sinLinea.n ? `${avisos.sinLinea.n} · ${millones(avisos.sinLinea.importe)}` : '0'} falta="ninguno"
            porque="recibos sin línea de quincena" destraba="suman blanco sin negro al lado" />
          <Hueco que={`${avisos.mesesSinCerrar} · ${avisos.quincenasAbiertas} quincenas`}
            porque="meses sin ninguna quincena cerrada"
            destraba={avisos.mesesPorRegistro ? 'se miden por lo entregado, no por la quincena' : 'no valen 0: no publican cifra'} />
          <Hueco que={`${avisos.sinPagoRegistrado}`} falta="ninguno"
            porque="líneas abiertas sin pago registrado" destraba="no es «cobró 0»: no consta el pago" />
          <Hueco que={l ? `${l.sinCategoria} de ${l.plantel}` : null} falta="sin registrar"
            porque="legajos sin categoría" destraba="sin categoría no hay jornal" />
          <Hueco que={String(sinTarifa)} falta="ninguna" porque="personas sin tarifa en el costo" destraba="no suman al costo ni valen 0" />
        </div>
      </Seccion>
    </>
  )
}

/**
 * Una fila del cuadro mensual: el costo primero (con su sello real/estimado y «parcial» si el mes está
 * incompleto) y lo pagado después, con su rótulo. La diferencia sólo existe donde las dos medidas son
 * comparables; en un mes pagado «por canal» no se resta (sería llamar «cargas» a lo que falta registrar).
 * Un mes que no se pudo medir sigue sin publicar cifra: «sin medir», nunca un 0.
 */
function FilaMes({ x, elegido, href, alDia }: { x: LineaDeNomina; elegido: boolean; href: string; alDia: string }) {
  const c = x.costo
  const m = x.pagado
  const pct = m?.total ? (m.negro ?? 0) / m.total : null
  const porCanal = m?.medida === 'registro_por_canal'
  const sello = c?.costo == null ? null : c.etiqueta === 'en parte estimado' ? 'en parte estimado' : c.etiqueta
  return (
    <Link href={href} scroll={false}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-2.5 hover:bg-surface-quiet lg:grid-cols-[110px_repeat(5,minmax(0,1fr))_72px] lg:gap-4 lg:py-3 ${elegido ? 'bg-surface-quiet' : ''}`}>
      {/* EN EL TELÉFONO SÓLO EL MES Y EL COSTO, y lo pagado baja una línea con su palabra al lado:
          cifras sin encabezado —el encabezado es `lg:grid`— son cifras que nadie puede nombrar. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="whitespace-nowrap text-[13px] font-medium text-ink">{rotuloMes(x.mes, true)}</span>
          {c?.parcial ? <span className="whitespace-nowrap text-[11px] text-warn">parcial</span> : null}
          {sello ? <span className="whitespace-nowrap text-[11px] text-muted">{sello}</span> : null}
        </div>
        {c && c.sinDato > 0 ? <span className="text-[11px] text-warn">{c.sinDato} sin tarifa: no suman</span> : null}
        {porCanal ? <span className="text-[11px] leading-normal text-muted">pagado al {alDia}: lo registrado por canal</span> : null}
        <span className="text-[11px] tabular-nums text-muted lg:hidden">
          {m?.total == null ? 'pagado: sin medir' : `pagado ${millones(m.total)} · blanco ${millones(m.blanco)} · negro ${millones(m.negro)} · ${pctEntero(pct)} en negro`}
          {x.diferencia != null ? ` · cargas, FCL y ART ${millones(x.diferencia)}` : ''}
        </span>
      </div>
      <div className={`text-right text-[13px] font-semibold tabular-nums ${c?.parcial ? 'text-muted' : 'text-ink'}`}><Valor v={millones(c?.costo)} falta="sin medir" /></div>
      <div className="hidden text-right text-[13px] tabular-nums text-ink-soft lg:block"><Valor v={millones(m?.blanco)} falta="sin medir" /></div>
      <div className="hidden text-right text-[13px] tabular-nums text-ink-soft lg:block"><Valor v={millones(m?.negro)} falta="" /></div>
      <div className={`hidden text-right text-[13px] tabular-nums lg:block ${porCanal ? 'text-muted' : 'text-ink-soft'}`}><Valor v={millones(m?.total)} falta="" /></div>
      <div className="hidden text-right text-[13px] tabular-nums text-ink-soft lg:block"><Valor v={millones(x.diferencia)} falta="—" /></div>
      <div className={`hidden text-right text-[13px] tabular-nums lg:block ${(pct ?? 0) > 0.5 ? 'text-warn' : 'text-muted'}`}><Valor v={pctEntero(pct)} falta="" /></div>
    </Link>
  )
}

/** Una persona del mes elegido, con la barra de lo que cobró y la marca de lo que no se pudo afirmar. */
function FilaPersonaPagada({ p, max }: { p: PersonaPagada; max: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 lg:grid-cols-[minmax(0,1fr)_110px_110px_110px_120px] lg:gap-6 lg:py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink">{p.nombre}</span>
        {p.sinRecibo ? <span className="text-[11px] text-warn">sin recibo cargado: todo contado en negro</span> : null}
        {p.sinLinea ? <span className="text-[11px] text-warn">sin línea de quincena: sólo se puede afirmar el recibo</span> : null}
        {p.reciboMayor != null ? <span className="text-[11px] text-warn">el recibo supera lo cobrado en {millones(p.reciboMayor)}</span> : null}
        {p.porCanal ? <span className="text-[11px] text-muted">mes en curso: blanco = depositado, negro = en mano (el recibo del estudio todavía no está cargado)</span> : null}
        <span className="text-[11px] tabular-nums text-muted lg:hidden">blanco {millones(p.blanco)} · negro {millones(p.negro)}</span>
      </div>
      <div className="hidden text-right text-[13px] tabular-nums text-ink-soft lg:block">{millones(p.blanco)}</div>
      <div className="hidden text-right text-[13px] tabular-nums text-ink-soft lg:block">{millones(p.negro)}</div>
      <div className="text-right text-[13px] font-semibold tabular-nums text-ink">{millones(p.total)}</div>
      <div className="col-span-2 row-start-2 flex h-3 overflow-hidden rounded-[2px] lg:col-span-1 lg:row-auto">
        <div className="h-full bg-serie-1" style={{ width: ancho(p.blanco, max) }} />
        <div className="h-full bg-serie-2" style={{ width: ancho(p.negro, max) }} />
      </div>
    </div>
  )
}

/** Una tarjeta de hueco, con el mismo dibujo que las del Resumen: filo arriba, `que` 13px/500. */
function Hueco({ que, falta = 'sin registrar', porque, destraba }: {
  que: string | null; falta?: string; porque: string; destraba: string
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className={`text-[13px] font-medium tabular-nums ${que == null ? 'text-faint' : 'text-ink'}`}>{que ?? falta}</div>
      <div className="text-[11.5px] leading-normal text-muted">{porque}</div>
      <div className="font-mono text-[11px] text-faint">{destraba}</div>
    </div>
  )
}

const TONO_BANDA: Record<ClaveBanda, { fondo: string; texto: string }> = {
  por_vencer: { fondo: 'bg-pos', texto: 'text-pos' },
  d1_30: { fondo: 'bg-warn', texto: 'text-warn' },
  d31_60: { fondo: 'bg-warn', texto: 'text-warn' },
  d61_90: { fondo: 'bg-dato-mora', texto: 'text-dato-mora' },
  d90: { fondo: 'bg-neg', texto: 'text-neg' },
}

/**
 * COBRANZA — primero lo que entra, después lo que se debe.
 *
 * El dueño (21/09/2026): «la pestaña de Cobranza no es de utilidad si no me marca con claridad los
 * cobros próximos». La antigüedad sola no alcanza: el 21/09/2026 los $ 221,11 M de deuda estaban
 * enteros «por vencer», así que la pantalla decía «al día» y nada sobre los $ 29,06 M que entraban
 * al día siguiente. Por eso la agenda de cobro abre la vista y la antigüedad queda debajo.
 *
 * Las tres cifras del diseño v9 (por cobrar · a más de 60 días · al día) se quedan; al lado entran
 * las dos que el dueño pidió (7 y 30 días), que completan la fila de cinco de la cabecera.
 */
export function VistaCobranza({ cuenta, documentos, agenda, hoy, periodo }: {
  cuenta: unknown[] | null
  /** Filas de `cliente_cobranza` (deuda) recortadas por el período: de acá sale la acción del día. */
  documentos: unknown[] | null
  /** Las mismas filas SIN recortar por período: la agenda mira para adelante. `null` = no se leyeron. */
  agenda: unknown[] | null
  hoy: string
  periodo: string
}) {
  if (!cuenta) return <SinLectura que="la cuenta corriente" />
  const filas = cobranza(cuenta, documentos ?? [], hoy)
  const c = cifrasCobranza(filas)
  const bandas = bandasDeCobranza(cuenta)
  const maxSaldo = Math.max(1, ...filas.map((f) => f.saldo))
  const nombres = new Map(filas.map((f) => [f.clienteId, f.nombre] as const))
  const a = agendaDeCobro(documentosDeCobranzas(agenda ?? [], hoy), nombres, hoy)
  const proximos = proximoPorCliente(a)
  return (
    <>
      <Cabecera titulo="Cobranza" detalle={`${periodo} · emitido y no cobrado`}
        cifras={[
          { rotulo: 'por cobrar', valor: millones(c.porCobrar) },
          { rotulo: 'entra en 7 días', valor: a.en7 > 0 ? millones(a.en7) : null, falta: 'nada' },
          { rotulo: 'entra en 30 días', valor: a.en30 > 0 ? millones(a.en30) : null, falta: 'nada' },
          { rotulo: 'a más de 60 días', valor: c.masDe60 > 0 ? millones(c.masDe60) : null, falta: 'ninguno', tono: 'neg' },
          { rotulo: 'al día', valor: c.alDia > 0 ? millones(c.alDia) : null, falta: 'ninguno', tono: 'pos' },
        ]} />
      <CobrosProximos a={a} agenda={agenda} hoy={hoy} />
      <Seccion titulo="Antigüedad de lo que se debe" filo>
        {c.porCobrar > 0 ? (
          <Torta centro={millones(c.porCobrar)} centroNota="por cobrar"
            gajos={bandas.map((b) => ({ rotulo: b.rotulo.toLowerCase(), monto: b.monto, color: TONO_BANDA[b.clave].texto, falta: 'ninguno' }))} />
        ) : <p className="text-sm text-faint">nada por cobrar</p>}
      </Seccion>
      <Seccion titulo="Por cliente" filo>
        <div className="flex flex-col pb-9">
          {/* ═══ EL SALDO VA PEGADO AL NOMBRE, NO DEL OTRO LADO DE LA BARRA (diseño v9) ═══
              `gFilaCobro: '150px 96px minmax(0,1fr) 150px 170px'`. Estaba al revés: la barra entre
              el cliente y el saldo empujaba el número a 600 px de distancia. El dato que decide
              —cuánto se debe— quedaba detrás del adorno que sólo lo ilustra. */}
          <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[150px_96px_minmax(0,1fr)_150px_170px] ${ENCABEZADO}`}>
            <div>Cliente</div><div className="text-right">Saldo</div><div /><div>Antigüedad</div><div>Hoy</div>
          </div>
          {filas.map((f) => <FilaCliente key={f.clienteId} f={f} max={maxSaldo} documentos={documentos} proximo={proximos.get(f.clienteId) ?? null} />)}
        </div>
      </Seccion>
    </>
  )
}

/** El tono de una fila de la agenda: vencido, inminente, dentro del mes, más lejos. */
function tonoDeCobro(dias: number, vencido: boolean): { fondo: string; texto: string } {
  if (vencido || dias < 0) return { fondo: 'bg-neg', texto: 'text-neg' }
  if (dias <= 2) return { fondo: 'bg-warn', texto: 'text-warn' }
  if (dias <= 30) return { fondo: 'bg-accent', texto: 'text-ink' }
  return { fondo: 'bg-dato-referencia', texto: 'text-muted' }
}

/**
 * LA AGENDA: un comprobante por fila, en el día en que se cobra. Se muestran los vencidos y los
 * próximos 30 días —la ventana en la que se decide algo— y lo que queda después se dice en una línea
 * con su plata, nunca se esconde.
 */
function CobrosProximos({ a, agenda, hoy }: { a: AgendaDeCobro; agenda: unknown[] | null; hoy: string }) {
  if (agenda == null) return <Seccion titulo="Cobros próximos"><p className="text-sm text-muted">No se pudo leer Cobranzas.</p></Seccion>
  const cerca = a.filas.filter((f) => f.dias <= 30)
  const lejos = a.filas.filter((f) => f.dias > 30)
  const max = Math.max(1, ...a.filas.map((f) => f.monto))
  const aclaracion = [
    'por la fecha de cobro de Cobranzas, la única que existe: no hay promesa de pago',
    'no se recorta por el período de arriba',
    a.sinFecha.n ? `${a.sinFecha.n} sin fecha de cobro por ${millones(a.sinFecha.total)}: no entran en ningún día` : 'ninguno sin fecha de cobro',
  ].join(' · ')
  return (
    <Seccion titulo="Cobros próximos" aclaracion={aclaracion} arriba="pt-8">
      <div className="flex flex-col" data-testid="cobranza-proximos">
        <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[150px_110px_minmax(0,1fr)_150px_170px] ${ENCABEZADO}`}>
          <div>Cuándo</div><div className="text-right">Monto</div><div /><div>Cliente</div><div>Comprobante</div>
        </div>
        {cerca.length === 0 ? (
          <p className="py-4 text-sm text-faint">
            {a.filas.length ? `nada en los próximos 30 días · el primero es el ${diaMesAnio(a.primero?.fecha) ?? '—'}` : 'ningún comprobante de deuda con fecha de cobro'}
          </p>
        ) : cerca.map((f) => {
          const tono = tonoDeCobro(f.dias, f.vencido)
          return (
            <div key={f.id} data-testid="cobranza-proximo" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 hover:bg-surface-quiet lg:h-11 lg:grid-cols-[150px_110px_minmax(0,1fr)_150px_170px] lg:gap-6 lg:py-0">
              {/* EN EL TELÉFONO EL TIEMPO BAJA UNA LÍNEA antes que truncarse: «mañ…» no es una palabra. */}
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-ink">{diaMesAnio(f.fecha)}</span>
                <span className={`whitespace-nowrap text-[11.5px] ${tono.texto}`}>{cuando(f.dias)}</span>
              </div>
              <div className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-ink">{millones(f.monto)}</div>
              <div className="col-span-2 row-start-2 h-3 lg:col-span-1 lg:row-auto"><div className={`h-full rounded-[2px] ${tono.fondo}`} style={{ width: ancho(f.monto, max) }} /></div>
              <div className="truncate text-xs text-ink-soft">{f.cliente ?? <span className="text-faint">sin cliente en la cuenta corriente</span>}</div>
              <div className="truncate text-xs text-muted">{f.documento}</div>
            </div>
          )
        })}
        {lejos.length ? (
          <p className="pt-3 text-[11.5px] text-muted">
            y {lejos.length} {lejos.length === 1 ? 'comprobante' : 'comprobantes'} después de los 30 días por {millones(lejos.reduce((s, f) => s + f.monto, 0))} · el último, el {diaMesAnio(lejos[lejos.length - 1].fecha)}
          </p>
        ) : null}
        {a.vencido.n ? (
          <p className="pt-2 text-[11.5px] text-neg">▲ {a.vencido.n} {a.vencido.n === 1 ? 'comprobante vencido' : 'comprobantes vencidos'} por {millones(a.vencido.total)} · al {diaMesAnio(hoy)}</p>
        ) : null}
      </div>
    </Seccion>
  )
}

function FilaCliente({ f, max, documentos, proximo }: { f: FilaCobranza; max: number; documentos: unknown[] | null; proximo: CobroProximo | null }) {
  const tono = f.tramo ? TONO_BANDA[f.tramo] : { fondo: 'bg-dato-referencia', texto: 'text-faint' }
  // SIN ACCIÓN DEL DÍA, EL PRÓXIMO COBRO (dueño, 21/09/2026): un «—» no dice nada; «cobra el 22/09»
  // sí. Nunca se inventa: si el cliente no tiene documento con fecha, sigue diciendo por qué no hay.
  const sinVerbo = documentos == null ? 'no se pudo leer Cobranzas' : f.evaluado ? null : 'no evaluado'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 hover:bg-surface-quiet lg:h-[52px] lg:grid-cols-[150px_96px_minmax(0,1fr)_150px_170px] lg:gap-6 lg:py-0">
      <div className="truncate text-[13px] font-medium text-ink">{f.nombre}</div>
      <div className={`whitespace-nowrap text-right text-[13px] font-semibold ${f.estado === 'vencido' ? 'text-neg' : 'text-ink'}`}>{millones(f.saldo)}</div>
      <div className="col-span-2 row-start-2 h-3 lg:col-span-1 lg:row-auto"><div className={`h-full rounded-[2px] ${tono.fondo}`} style={{ width: ancho(f.saldo, max) }} /></div>
      <div className={`text-xs ${tono.texto}`}>{f.rotuloTramo ?? 'sin vencimiento'}</div>
      <div className="flex flex-col gap-0.5 text-right text-xs lg:text-left">
        {f.verbo ? <span className="text-ink-soft">{f.verbo}</span> : proximo ? null : <span className="text-faint">{sinVerbo ?? 'sin acción pendiente'}</span>}
        {proximo
          ? <span className={tonoDeCobro(proximo.dias, proximo.vencido).texto}>cobra el {diaMes(proximo.fecha)} · {cuando(proximo.dias)}</span>
          : <span className="text-faint">sin fecha de cobro</span>}
      </div>
    </div>
  )
}
