// IMPUESTOS — qué se debe al fisco, cuándo vence, qué está atrasado y cuánta plata hay a favor
// (dueño, 16/09/2026: «tener siempre registrado IVA, Ganancias, Ingresos Brutos y demás impuestos, todo
// bien en Supabase y llevado a app.ecsas.com.ar»).
//
// ═══ REHECHA EL 17/09/2026, DOS VECES ═══
//
// Dueño: «es espantosa, inentendible y así no tiene uso alguno». Era una sola columna de 4.125 px con
// cinco tablas. La primera versión rehecha no le alcanzó: «necesito que sea más sencillo, claro,
// minimalista y con gráficos». Ahora el resumen tiene TRES cosas —el número a pagar en 30 días, un
// gráfico de barras por mes y los próximos cinco vencimientos—; cada impuesto tiene su solapa con su
// gráfico, su número y la tabla plegada; lo demás (fuentes, agenda completa, todos los períodos, pagos
// sin identificar) está en «Todo el historial». Nada se quitó: se reubicó.
//
// ═══ QUIÉN LA VE ═══
//
// `veEconomia()` —Dirección y Administración—, igual que la RLS de las tablas (`ve_economia()`,
// 20260916T2000). La ruta está en `RUTAS_SOLO_ECONOMIA`. La fuente es `impuesto_posicion`; esta
// página no calcula ningún impuesto. El tiempo real vive en el layout (`RefrescarEnVivo`).
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { C } from '@/shared/components/canon'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { plata } from '@/shared/utils/format'
import { frescura, hoyAR, porPeriodo, separarProyeccion, type PagoSinImputar, type PosicionImpuesto } from '@/features/administracion/services/impuestos'
import { getPosicion, getSinImputar, getUltimaSincronizacion } from '@/features/administracion/services/impuestosService'
import { cargasSociales } from '@/features/administracion/services/impuestosCargas'
import {
  decision, IMPUESTOS_DE_VISTA, porImpuesto, proyeccionDelMes, TITULO_VISTA, vistaDe, type VistaImpuesto,
} from '@/features/administracion/services/impuestosVista'
import {
  AvisoSinIdentificar, CifrasDeImpuesto, DatosAl, LineaFrescura, NumeroClave, ProyeccionFinDeMes, Solapas, type Solapa,
} from '@/features/administracion/components/impuestos/Decision'
import { Agenda, ProximosCortos } from '@/features/administracion/components/impuestos/Agenda'
import { GraficoImpuesto, GraficoResumen } from '@/features/administracion/components/impuestos/graficos'
import { MesAMes, TablaSinImputar } from '@/features/administracion/components/impuestos/TablasImpuestos'
import { SeccionCargasSociales } from '@/features/administracion/components/impuestos/CargasSociales'
import { Plegada, Seccion } from '@/features/administracion/components/impuestos/piezas'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/impuestos'
const HISTORIAL = `${RUTA}?ver=historial`
const ANCLA_SIN_IDENTIFICAR = 'sin-identificar'

type Resumen = ReturnType<typeof porImpuesto>
/** `filas` es lo REGISTRADO; `proyeccion`, la estimación a fin de mes de la pestaña — nunca se mezclan. */
interface Datos { filas: PosicionImpuesto[]; proyeccion: PosicionImpuesto[]; pagos: PagoSinImputar[]; hoy: string; resumen: Resumen; fr: ReturnType<typeof frescura> }

export default async function ImpuestosPage({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  const vista = vistaDe((await searchParams).ver)
  const supabase = await createClient()
  const [perfil, posicion, sinImputar, sinc] = await Promise.all([
    getPerfilActual(supabase), getPosicion(supabase), getSinImputar(supabase), getUltimaSincronizacion(supabase),
  ])
  if (!veEconomia(perfil.data?.rol ?? null)) {
    return <Marco><Aviso tono="info">Esta pantalla es de Dirección y Administración.</Aviso></Marco>
  }
  const error = posicion.error ?? sinImputar.error ?? sinc.error
  if (error || !posicion.data) {
    return <Marco><div data-testid="impuestos-error"><Aviso tono="neg" titulo="No pude leer los impuestos">{error}</Aviso></div></Marco>
  }

  // El reloj entra una sola vez, acá: las reglas de los servicios son puras y se prueban sin esperar.
  const ahora = new Date()
  const hoy = hoyAR(ahora)
  const { registrado, proyeccion } = separarProyeccion(posicion.data)
  const datos: Datos = { filas: registrado, proyeccion, pagos: sinImputar.data ?? [], hoy, resumen: porImpuesto(registrado, hoy), fr: frescura(sinc.data, ahora) }
  const solapas: Solapa[] = [
    { vista: 'resumen' },
    ...datos.resumen.map((r) => ({ vista: r.vista, cuenta: r.vencidas || undefined, alerta: r.vencidas > 0 })),
    { vista: 'historial' },
  ]

  return (
    <Marco>
      <CabeceraSeccion
        testid="vistas-impuestos"
        espacioPanel={false}
        vistas={[{ clave: 'impuestos', titulo: 'Impuestos', cuenta: null, activa: true, href: RUTA }]}
      />
      <div className="px-5 pb-16 pt-1">
        <DatosAl fr={datos.fr} rutaHistorial={HISTORIAL} />
        <div className="mt-3"><Solapas solapas={solapas} activa={vista} ruta={RUTA} /></div>
        {vista === 'resumen' ? <Resumen d={datos} />
          : vista === 'historial' ? <Historial d={datos} />
            : <DeUnImpuesto vista={vista} d={datos} />}
      </div>
    </Marco>
  )
}

/** EL RESUMEN: el número, el gráfico, cinco vencimientos. Y una línea si hay pagos sin identificar. */
function Resumen({ d }: { d: Datos }) {
  const dec = decision(d.filas, d.hoy)
  return (
    <>
      <div className="mt-8"><NumeroClave d={dec} /></div>
      <div className="mt-4"><ProyeccionFinDeMes p={proyeccionDelMes(d.proyeccion)} /></div>
      <div className="mt-10"><GraficoResumen filas={d.filas} hoy={d.hoy} /></div>
      <Seccion testid="bloque-vencimientos" titulo="Próximos vencimientos">
        <ProximosCortos lista={dec.lista} verTodos={HISTORIAL} vacio="Nada vence en los próximos 30 días." />
      </Seccion>
      <div className="mt-4">
        <AvisoSinIdentificar total={d.pagos.reduce((s, p) => s + p.importe, 0)} cantidad={d.pagos.length} ruta={`${HISTORIAL}#${ANCLA_SIN_IDENTIFICAR}`} />
      </div>
    </>
  )
}

/** UNA SOLAPA: número, gráfico del impuesto, sus vencimientos y la tabla plegada. */
function DeUnImpuesto({ vista, d }: { vista: VistaImpuesto; d: Datos }) {
  const propias = d.filas.filter((f) => IMPUESTOS_DE_VISTA[vista].includes(f.impuesto))
  const r = d.resumen.find((x) => x.vista === vista)
  const proximos = decision(propias, d.hoy)
  return (
    <>
      {r && <div className="mt-8"><CifrasDeImpuesto r={r} /></div>}
      <div className="mt-4"><ProyeccionFinDeMes p={proyeccionDelMes(d.proyeccion, IMPUESTOS_DE_VISTA[vista])} /></div>
      <div className="mt-10"><GraficoImpuesto filas={d.filas} vista={vista} hoy={d.hoy} /></div>
      {proximos.cantidad > 0 && (
        <Seccion testid="bloque-vencimientos" titulo="Próximos vencimientos" resumen={plata(proximos.total)}>
          <ProximosCortos lista={proximos.lista} max={10} vacio="" testid={vista === 'cargas' ? 'cargas-proximos' : 'impuestos-vencimientos'} />
        </Seccion>
      )}
      {vista === 'cargas'
        ? <SeccionCargasSociales c={cargasSociales(d.filas, d.hoy)} />
        : (
          <Plegada testid="bloque-periodos" titulo="Mes por mes" resumen={`${propias.length} registros`}>
            <MesAMes testid="impuestos-periodos" filas={porPeriodo(propias)} conImpuesto={vista === 'otros'} vacio={`Todavía no hay nada de ${TITULO_VISTA[vista]} cargado.`} />
          </Plegada>
        )}
    </>
  )
}

/** TODO EL HISTORIAL: las fuentes, la agenda completa, todos los períodos y los pagos sin identificar. */
function Historial({ d }: { d: Datos }) {
  const dec = decision(d.filas, d.hoy)
  const total = d.pagos.reduce((s, p) => s + p.importe, 0)
  return (
    <>
      <div className="mt-6"><LineaFrescura fr={d.fr} /></div>
      <Seccion testid="bloque-agenda" titulo="Vencimientos de los próximos 30 días" resumen={dec.vencido.cantidad ? 'incluye lo vencido de los últimos 45 días' : undefined}>
        <Agenda lista={dec.lista} vacio="Nada pendiente con vencimiento en los próximos 30 días." />
      </Seccion>
      {d.pagos.length > 0 && (
        <Seccion testid="bloque-sin-imputar" id={ANCLA_SIN_IDENTIFICAR} titulo="Pagos al fisco sin identificar"
          resumen={`${d.pagos.length} · ${plata(total)} · falta saber a qué impuesto corresponden`}>
          <TablaSinImputar pagos={d.pagos} />
        </Seccion>
      )}
      <Seccion testid="bloque-periodos" titulo="Todos los impuestos, mes por mes" resumen={`${d.filas.length} registros`}>
        <MesAMes testid="impuestos-periodos" filas={porPeriodo(d.filas)} conImpuesto vacio="Todavía no hay ningún impuesto cargado." />
      </Seccion>
    </>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      <NavAdministracion />
      {children}
    </div>
  )
}
