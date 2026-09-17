// IMPUESTOS — qué se debe al fisco, cuándo vence, qué está atrasado y cuánta plata hay a favor
// (dueño, 16/09/2026: «tener siempre registrado IVA, Ganancias, Ingresos Brutos y demás impuestos, todo
// bien en Supabase y llevado a app.ecsas.com.ar»).
//
// ═══ REHECHA EL 17/09/2026 ═══
//
// Dueño: «es espantosa, inentendible y así no tiene uso alguno». Era una sola columna de 4.125 px con
// cinco tablas, dos cifras que se leían como sumables y el vocabulario del sincronizador. Ahora:
// arriba la decisión (cuánto, cuándo, qué venció), la agenda por urgencia y una fila por impuesto;
// cada impuesto en su solapa (`?ver=`) y todo lo que había en «Todo el historial». Nada se quitó: el
// inventario función → lugar nuevo está en el mensaje del commit.
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
import { frescura, hoyAR, porPeriodo, saldosAFavor, type PagoSinImputar, type PosicionImpuesto } from '@/features/administracion/services/impuestos'
import { getPosicion, getSinImputar, getUltimaSincronizacion } from '@/features/administracion/services/impuestosService'
import { cargasSociales } from '@/features/administracion/services/impuestosCargas'
import {
  decision, IMPUESTOS_DE_VISTA, porImpuesto, TITULO_VISTA, vistaDe, type Vista, type VistaImpuesto,
} from '@/features/administracion/services/impuestosVista'
import { CifrasDeImpuesto, Decision, LineaFrescura, Solapas, type Solapa } from '@/features/administracion/components/impuestos/Decision'
import { Agenda, PorImpuesto } from '@/features/administracion/components/impuestos/Agenda'
import { MesAMes, TablaSinImputar } from '@/features/administracion/components/impuestos/TablasImpuestos'
import { SeccionCargasSociales } from '@/features/administracion/components/impuestos/CargasSociales'
import { Seccion } from '@/features/administracion/components/impuestos/piezas'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/impuestos'
const ANCLA_SIN_IDENTIFICAR = 'sin-identificar'

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

  // El reloj entra una sola vez, acá: las reglas de `impuestos.ts` son puras y se prueban sin esperar.
  const ahora = new Date()
  const hoy = hoyAR(ahora)
  const filas = posicion.data
  const pagos = sinImputar.data ?? []
  const resumen = porImpuesto(filas, hoy)

  const solapas: Solapa[] = [
    { vista: 'resumen' },
    ...resumen.map((r) => ({ vista: r.vista, cuenta: r.vencidas || undefined, alerta: r.vencidas > 0 })),
    { vista: 'historial' },
  ]

  return (
    <Marco>
      <CabeceraSeccion
        testid="vistas-impuestos"
        espacioPanel={false}
        vistas={[{ clave: 'impuestos', titulo: 'Impuestos', cuenta: null, activa: true, href: RUTA }]}
      />
      <div className="px-5 pb-12 pt-3">
        <LineaFrescura fr={frescura(sinc.data, ahora)} />
        <div className="mt-3">
          <Solapas solapas={solapas} activa={vista} ruta={RUTA} />
        </div>
        <Contenido vista={vista} filas={filas} pagos={pagos} hoy={hoy} resumen={resumen} />
      </div>
    </Marco>
  )
}

function Contenido({ vista, filas, pagos, hoy, resumen }: {
  vista: Vista; filas: PosicionImpuesto[]; pagos: PagoSinImputar[]; hoy: string; resumen: ReturnType<typeof porImpuesto>
}) {
  if (vista === 'resumen') return <Resumen filas={filas} pagos={pagos} hoy={hoy} resumen={resumen} />
  if (vista === 'historial') {
    return (
      <>
        <Seccion testid="bloque-periodos" titulo="Todos los impuestos, mes por mes" resumen={`${filas.length} registros`}>
          <MesAMes testid="impuestos-periodos" filas={porPeriodo(filas)} conImpuesto vacio="Todavía no hay ningún impuesto cargado." />
        </Seccion>
        <SinIdentificar pagos={pagos} />
      </>
    )
  }
  const r = resumen.find((x) => x.vista === vista)
  return <DeUnImpuesto vista={vista} filas={filas} hoy={hoy} r={r} />
}

function Resumen({ filas, pagos, hoy, resumen }: { filas: PosicionImpuesto[]; pagos: PagoSinImputar[]; hoy: string; resumen: ReturnType<typeof porImpuesto> }) {
  const d = decision(filas, hoy)
  return (
    <>
      <Decision
        d={d}
        saldos={saldosAFavor(filas)}
        otrosAFavor={resumen.flatMap((r) => (r.otroAFavor ? [r.otroAFavor] : []))}
        sinIdentificar={{ total: pagos.reduce((s, p) => s + p.importe, 0), cantidad: pagos.length }}
        rutaSinIdentificar={`#${ANCLA_SIN_IDENTIFICAR}`}
      />
      <Seccion testid="bloque-vencimientos" titulo="Vencimientos de los próximos 30 días" resumen={d.vencido.cantidad ? `incluye lo vencido de los últimos 45 días` : undefined}>
        <Agenda lista={d.lista} vacio="Nada pendiente con vencimiento en los próximos 30 días." />
      </Seccion>
      <Seccion testid="bloque-por-impuesto" titulo="Por impuesto">
        <PorImpuesto filas={resumen} ruta={RUTA} />
      </Seccion>
      <SinIdentificar pagos={pagos} />
    </>
  )
}

function DeUnImpuesto({ vista, filas, hoy, r }: {
  vista: VistaImpuesto; filas: PosicionImpuesto[]; hoy: string; r: ReturnType<typeof porImpuesto>[number] | undefined
}) {
  const propias = filas.filter((f) => IMPUESTOS_DE_VISTA[vista].includes(f.impuesto))
  const proximos = decision(propias, hoy)
  const cargas = vista === 'cargas' ? cargasSociales(filas, hoy) : null
  return (
    <>
      {r && <CifrasDeImpuesto r={r} />}
      <Seccion testid="bloque-vencimientos" titulo="Vencimientos de los próximos 30 días" resumen={proximos.cantidad ? plata(proximos.total) : undefined}>
        <Agenda lista={proximos.lista} vacio={`Nada de ${TITULO_VISTA[vista]} vence en los próximos 30 días.`} testid={vista === 'cargas' ? 'cargas-proximos' : 'impuestos-vencimientos'} />
      </Seccion>
      {cargas
        ? <SeccionCargasSociales c={cargas} />
        : (
          <Seccion testid="bloque-periodos" titulo="Mes por mes">
            <MesAMes testid="impuestos-periodos" filas={porPeriodo(propias)} conImpuesto={vista === 'otros'} vacio={`Todavía no hay nada de ${TITULO_VISTA[vista]} cargado.`} />
          </Seccion>
        )}
    </>
  )
}

function SinIdentificar({ pagos }: { pagos: PagoSinImputar[] }) {
  if (!pagos.length) return null
  return (
    <Seccion
      testid="bloque-sin-imputar"
      id={ANCLA_SIN_IDENTIFICAR}
      titulo="Pagos al fisco sin identificar"
      resumen={`${pagos.length} · ${plata(pagos.reduce((s, p) => s + p.importe, 0))} · falta saber a qué impuesto corresponden`}
    >
      <TablaSinImputar pagos={pagos} />
    </Seccion>
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
