// MIS HORAS — cuánto trabajé, cuándo, en qué obra y en qué actividad.
//
// ═══ ES LA MISMA HORA QUE VE LA OBRA ═══
//
// Sale de `mi_hh_dia`, que es `registros_hh` acotada a mi persona por la base. No hay un segundo
// registro de asistencia: si esta pantalla sumara distinto que la obra, habría dos verdades sobre
// cuánto trabajó la misma persona el mismo día, y ninguna forma de saber cuál va a la liquidación.
//
// ═══ NO SE EDITA ACÁ, Y LA PANTALLA LO DICE ═══
//
// Corregir una imputación es un acto de la obra: la carga el jefe de obra contra una actividad. Si
// el trabajador pudiera corregirse las horas, el parte dejaría de ser un control y pasaría a ser una
// declaración. Lo que sí hace esta pantalla es que el error se VEA, que es lo que hoy no pasaba.
//
// ═══ LOS DÍAS SIN REGISTRO NO APARECEN COMO 0 ═══
//
// Un renglón «15/08 · 0,00 HH» afirma que ese día la persona estuvo y no trabajó. La tabla lista lo
// imputado; el pie dice cuántos días distintos hay detrás del total para que «148 HH» no se lea como
// un mes completo cuando son 18 días.

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getHorasPropias, getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { esPeriodo, PERIODO_LABEL, PERIODOS, rotulo, ventanaDe, type Periodo } from '@/features/mi-cuenta/services/periodo'
import { hh, resumen, sinFecha } from '@/features/mi-cuenta/services/horas'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { ElegirPeriodo } from '@/features/mi-cuenta/components/ElegirPeriodo'
import { MisHoras } from '@/features/mi-cuenta/components/MisHoras'
import { Aviso, Filtros, Num } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

type Query = { periodo?: string; desde?: string; hasta?: string }

export default async function MisHorasPage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams
  const periodo: Periodo = esPeriodo(q.periodo) ? q.periodo : 'mes'
  // HOY SE CALCULA EN EL SERVIDOR Y EN LOCAL, no en UTC: a las 21 de San Juan, `toISOString()` ya
  // dice mañana, y «este mes» arrancaría el 1° del mes siguiente el último día de cada mes.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const v = ventanaDe(periodo, hoy, { desde: q.desde, hasta: q.hasta })

  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return <MiCuentaShell titulo="Mis horas"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>

  const perfil = await getPerfilPropio(supabase, user.id)
  if (!perfil.data?.persona_id) {
    return <MiCuentaShell titulo="Mis horas"><SinVinculo que="tus horas" disponible={perfil.data?.vinculoDisponible ?? true} /></MiCuentaShell>
  }

  const horas = await getHorasPropias(supabase, v.desde, v.hasta)
  if (horas.error) {
    return <MiCuentaShell titulo="Mis horas"><Aviso tono="neg" titulo="No pude leer tus horas">{horas.error}</Aviso></MiCuentaShell>
  }

  const filas = horas.data ?? []
  const r = resumen(filas, v.desde, v.hasta)
  const huerfanas = sinFecha(filas)
  const url = (p: Periodo) => `/mi-cuenta/horas?periodo=${p}`

  return (
    <MiCuentaShell titulo="Mis horas">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Filtros
          testid="periodo"
          opciones={PERIODOS.map((p) => ({
            label: PERIODO_LABEL[p],
            href: p === 'elegir' ? `${url(p)}&desde=${v.desde}&hasta=${v.hasta}` : url(p),
            activo: periodo === p,
            testid: `periodo-${p}`,
          }))}
        />
        {/* LA VENTANA SIEMPRE A LA VISTA. Un total sin su período declarado no se puede verificar
            contra nada — ni contra un recibo, ni contra el parte de la obra. */}
        <span className="ml-auto font-mono text-[12px] tabular-nums text-faint" data-testid="ventana">{rotulo(v)}</span>
      </div>

      {periodo === 'elegir' && <ElegirPeriodo desde={v.desde} hasta={v.hasta} />}

      <div className="mt-7 flex flex-wrap gap-x-12 gap-y-5" data-testid="totales">
        {/* EL TOTAL DEL PERÍODO ES EL NÚMERO DE LA PANTALLA, y en el teléfono es lo único que entra
            arriba del pliegue: 30px ahí, 20 en escritorio, donde compite con la tabla entera. */}
        <Total rotulo="HH del período" valor={hh(r.trabajadas)} sub={`${r.dias} día${r.dias === 1 ? '' : 's'}`} grande />
        <Total rotulo="Normales" valor={hh(r.porTipo.normal)} />
        {/* LOS EXTRAS SÓLO APARECEN SI LOS HUBO. Un «Extras 50%: 0,00» permanente ocupa lugar para
            decir que no pasó nada; el modelo los distingue, así que cuando hay, se muestran. */}
        {r.porTipo.extra_50 > 0 && <Total rotulo="Extras 50%" valor={hh(r.porTipo.extra_50)} />}
        {r.porTipo.extra_100 > 0 && <Total rotulo="Extras 100%" valor={hh(r.porTipo.extra_100)} />}
        {(r.porTipo.ausencia > 0 || r.porTipo.licencia > 0) && (
          <Total
            rotulo="Ausencias y licencias"
            valor={hh(r.porTipo.ausencia + r.porTipo.licencia)}
            sub="no suman al total"
          />
        )}
        <Total
          rotulo="Obras"
          valor={String(r.obras.length)}
          sub={r.obras.map((o) => o.obra).join(' · ') || undefined}
        />
      </div>

      <div className="mt-8">
        <MisHoras r={r} />
      </div>

      <div className="mt-3 max-w-[820px] space-y-1 text-[11px] leading-relaxed text-faint">
        {huerfanas > 0 && (
          <p>
            {huerfanas} imputación{huerfanas === 1 ? '' : 'es'} a tu nombre no tiene{huerfanas === 1 ? '' : 'n'} fecha
            guardada, así que no entra{huerfanas === 1 ? '' : 'n'} en ningún período.
          </p>
        )}
        <p>
          Son las horas que la obra imputó a tu nombre. Si falta un día o hay un error, se corrige en
          la obra: acá no se editan. Los días sin registro no aparecen como 0.
        </p>
      </div>
    </MiCuentaShell>
  )
}

/** Un total del período: rótulo chico, número grande en mono, y su contexto al lado. Sin cards y sin
 *  gráficos — `COMPONENTS.md` §Status bar. */
function Total({ rotulo, valor, sub, grande }: { rotulo: string; valor: string; sub?: string; grande?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-muted">{rotulo}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <Num className={`font-semibold tracking-[-0.01em] text-ink ${grande ? '!text-[28px] sm:!text-[20px]' : '!text-[20px]'}`}>{valor}</Num>
        {sub && <span className="min-w-0 truncate text-[11.5px] text-faint">{sub}</span>}
      </div>
    </div>
  )
}
