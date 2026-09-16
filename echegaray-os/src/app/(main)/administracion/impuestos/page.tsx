// IMPUESTOS — qué se debe al fisco, cuándo vence, cuánto está inmovilizado a favor y de dónde sale cada
// número (dueño, 16/09/2026: «tener siempre registrado IVA, Ganancias, Ingresos Brutos y demás
// impuestos, todo bien en Supabase y llevado a app.ecsas.com.ar»).
//
// ═══ QUÉ DECISIÓN CAMBIA ═══
//
// Qué pagar en los próximos 30 días (y qué quedó vencido sin pago registrado), cuánta plata está a
// favor en el fisco, y si los números se pueden usar hoy: una fuente vieja se ve arriba, antes que el
// número que produjo.
//
// ═══ QUIÉN LA VE ═══
//
// `veEconomia()` —Dirección y Administración—, igual que la RLS de las tablas (`ve_economia()`,
// 20260916T2000). El jefe de obra entra a Administración pero no a esta ruta: el impuesto de la
// empresa es plata de la empresa, no costo de su obra. La ruta está en `RUTAS_SOLO_ECONOMIA`.
//
// La fuente es `impuesto_posicion`; esta página no calcula ningún impuesto.
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { Aviso, Franja, type Metrica } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { C } from '@/shared/components/canon'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { plata } from '@/shared/utils/format'
import {
  aPagarProximos, frescura, NOMBRE_FUENTE, NOMBRE_IMPUESTO, porPeriodo, rotuloPeriodo, saldosAFavor, ddmm,
} from '@/features/administracion/services/impuestos'
import { getPosicion, getSinImputar, getUltimaSincronizacion } from '@/features/administracion/services/impuestosService'
import {
  Bloque, TablaPeriodos, TablaSinImputar, TablaVencimientos,
} from '@/features/administracion/components/impuestos/TablasImpuestos'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/impuestos'

export default async function ImpuestosPage() {
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
  const hoy = ahora.toISOString().slice(0, 10)
  const proximos = aPagarProximos(posicion.data, hoy)
  const saldos = saldosAFavor(posicion.data)
  const fr = frescura(sinc.data, ahora)
  const pagosSinImputar = sinImputar.data ?? []
  const totalSinImputar = pagosSinImputar.reduce((s, p) => s + p.importe, 0)

  const metricas: Metrica[] = [
    {
      etiqueta: 'A pagar en 30 días',
      valor: plata(proximos.total),
      contexto: [
        `${proximos.lista.length} venc.`,
        proximos.vencidos ? `${proximos.vencidos} vencido${proximos.vencidos > 1 ? 's' : ''}` : null,
        proximos.sinImporte ? `${proximos.sinImporte} sin importe` : null,
      ].filter(Boolean).join(' · '),
      tono: proximos.vencidos ? 'neg' : proximos.total > 0 ? 'warn' : undefined,
    },
    ...saldos.map((s): Metrica => ({
      etiqueta: `${NOMBRE_IMPUESTO[s.impuesto]} a favor`,
      valor: plata(s.saldo_a_favor),
      contexto: `${rotuloPeriodo(s.periodo)} · ${NOMBRE_FUENTE[s.fuente]}`,
    })),
    { etiqueta: 'Pagos sin imputar', valor: plata(totalSinImputar), contexto: `${pagosSinImputar.length} mov.` },
  ]

  return (
    <Marco>
      <CabeceraSeccion
        testid="vistas-impuestos"
        espacioPanel={false}
        vistas={[{ clave: 'impuestos', titulo: 'Impuestos', cuenta: null, activa: true, href: RUTA }]}
      />
      <div style={{ padding: '0 20px 24px' }}>
        <p data-testid="impuestos-frescura" className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-faint">
          {fr.fuentes.map((f) => (
            <span key={f.nombre} data-vieja={f.vieja ? '' : undefined} className={f.fallo ? 'text-neg' : f.vieja ? 'text-warn' : ''}>
              {f.nombre} al {ddmm(f.al)}{f.fallo ? ' · no leyó' : f.vieja ? ' ▲' : ''}
            </span>
          ))}
          <span className={fr.sincronizacionVieja ? 'text-warn' : ''}>
            {fr.horasDesdeSincronizacion === null ? 'sin sincronizar' : `sincronizado hace ${Math.max(0, Math.round(fr.horasDesdeSincronizacion))} h`}
          </span>
        </p>
        <Franja testid="impuestos-franja" metricas={metricas} />

        <Bloque testid="bloque-vencimientos" titulo="A pagar en los próximos 30 días" cuenta={proximos.lista.length}>
          <TablaVencimientos lista={proximos.lista} />
        </Bloque>

        <Bloque testid="bloque-periodos" titulo="Por período" cuenta={posicion.data.length}>
          <TablaPeriodos filas={porPeriodo(posicion.data)} />
        </Bloque>

        {pagosSinImputar.length > 0 && (
          <Bloque testid="bloque-sin-imputar" titulo="Pagos al fisco sin imputar" cuenta={pagosSinImputar.length}>
            <TablaSinImputar pagos={pagosSinImputar} />
          </Bloque>
        )}
      </div>
    </Marco>
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
