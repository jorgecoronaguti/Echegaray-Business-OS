import Link from 'next/link'
import type { FichaObra } from '../types/fichaObra'
import { ConfianzaBadge } from '@/shared/components/ConfianzaBadge'
import { ESTADO_ECONOMICO_CLASSNAME } from '@/features/control-economico/types'
import { AlertaCard } from '@/features/dashboard/components/AlertaCard'
import { ESTADO_ACCION_LABEL } from '@/features/acciones/types'
import type { Accion } from '@/features/acciones/types'

const money = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const pct = (v: number) => `${v.toFixed(0)}%`

function accionParaAlerta(alerta: FichaObra['riesgosDecisiones'][number], acciones: Accion[]): Accion | undefined {
  return acciones.find((a) => a.alerta_origen_id === alerta.id)
}

function SeccionResumen({ ficha }: { ficha: FichaObra }) {
  const { resumen } = ficha
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-resumen">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Resumen — en 30 segundos</h2>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${ESTADO_ECONOMICO_CLASSNAME[resumen.estadoEconomico]}`}>
          {resumen.estadoEconomicoLabel}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Avance físico</dt>
          <dd className="font-semibold">
            {resumen.avance.valor != null ? pct(resumen.avance.valor) : '—'}{' '}
            <ConfianzaBadge naturaleza={resumen.avance.naturaleza} />
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Tendencia</dt>
          <dd className="font-semibold">{resumen.tendencia.valor ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Margen esperado (hoy)</dt>
          <dd className="font-semibold">
            {resumen.margenEsperado.valor != null ? money(resumen.margenEsperado.valor) : '—'}{' '}
            <ConfianzaBadge naturaleza={resumen.margenEsperado.naturaleza} />
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Margen forecast (al cierre)</dt>
          <dd className="font-semibold">
            {resumen.margenForecast.valor != null ? money(resumen.margenForecast.valor) : '—'}{' '}
            <ConfianzaBadge naturaleza={resumen.margenForecast.naturaleza} />
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Caja generada (real)</dt>
          <dd className="font-semibold">{money(resumen.cajaGenerada)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Caja pendiente de cobro</dt>
          <dd className="font-semibold">{money(resumen.cajaPendienteCobro)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-gray-500">Principal riesgo</dt>
          <dd className="font-semibold">{resumen.principalRiesgo?.titulo ?? 'Sin riesgos detectados'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-gray-500">Próxima acción</dt>
          <dd className="font-semibold">{resumen.proximaAccion?.titulo ?? 'Sin acciones pendientes'}</dd>
        </div>
      </dl>
    </div>
  )
}

function SeccionEconomia({ economia }: { economia: FichaObra['economia'] }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-economia">
      <h2 className="text-xl font-semibold">Economía</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody>
          <tr>
            <td className="pr-4 text-gray-500">Contratado</td>
            <td className="font-medium">{money(economia.contratado)}</td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Presupuesto (costo directo)</td>
            <td className="font-medium">
              {economia.presupuestado.valor != null ? money(economia.presupuestado.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={economia.presupuestado.naturaleza} />
            </td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Costo real acumulado</td>
            <td className="font-medium">
              {economia.costoRealAcumulado.valor != null ? money(economia.costoRealAcumulado.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={economia.costoRealAcumulado.naturaleza} />
            </td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Comprometido / Pagado</td>
            <td className="font-medium">
              {money(economia.costoComprometido)} / {money(economia.costoPagado)}
            </td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">ETC (costo restante estimado)</td>
            <td className="font-medium">
              {economia.etc.valor != null ? money(economia.etc.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={economia.etc.naturaleza} />
            </td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">EAC (costo total estimado al cierre)</td>
            <td className="font-medium">
              {economia.eac.valor != null ? money(economia.eac.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={economia.eac.naturaleza} />
            </td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Margen esperado (hoy)</td>
            <td className="font-medium">
              {economia.margenEsperado.valor != null ? money(economia.margenEsperado.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={economia.margenEsperado.naturaleza} />
            </td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Margen forecast (al cierre)</td>
            <td className="font-medium">
              {economia.margenForecast.valor != null ? money(economia.margenForecast.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={economia.margenForecast.naturaleza} />
            </td>
          </tr>
        </tbody>
      </table>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-gray-400">Cómo se calculó ETC/EAC</summary>
        <p className="mt-1 text-xs text-gray-500">{economia.eac.explicacion}</p>
      </details>
    </div>
  )
}

function SeccionProduccion({ produccion }: { produccion: FichaObra['produccion'] }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-produccion">
      <h2 className="text-xl font-semibold">Producción</h2>
      <p className="mt-1 text-sm">
        Avance físico promedio:{' '}
        <span className="font-semibold">{produccion.avance.valor != null ? pct(produccion.avance.valor) : '—'}</span>{' '}
        <ConfianzaBadge naturaleza={produccion.avance.naturaleza} />
      </p>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="pr-4">Actividad</th>
            <th className="pr-4">Semana</th>
            <th className="pr-4">Objetivo</th>
            <th className="pr-4">Real</th>
            <th className="pr-4">Causa de desvío</th>
          </tr>
        </thead>
        <tbody>
          {produccion.actividades.map((a) => (
            <tr key={a.id}>
              <td className="pr-4">{a.actividad}</td>
              <td className="pr-4">{a.semana_inicio}</td>
              <td className="pr-4">{a.avance_objetivo != null ? pct(a.avance_objetivo) : '—'}</td>
              <td className="pr-4">{a.avance_real != null ? pct(a.avance_real) : '—'}</td>
              <td className="pr-4">{a.causa_desvio ?? '—'}</td>
            </tr>
          ))}
          {produccion.actividades.length === 0 && (
            <tr>
              <td colSpan={5} className="pt-2 text-gray-500">
                Sin actividades planificadas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function SeccionHH({ hh }: { hh: FichaObra['hh'] }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-hh">
      <h2 className="text-xl font-semibold">HH y productividad</h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">HH estimadas</dt>
          <dd className="font-semibold">{hh.estimada ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">HH reales</dt>
          <dd className="font-semibold">{hh.real}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Desvío</dt>
          <dd className="font-semibold">{hh.desvioPorcentual != null ? `${hh.desvioPorcentual}%` : '—'}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-gray-500">
        {hh.semanas.length} semana(s) registradas: {hh.semanas.map((s) => `${s.semana} (${s.horas}h)`).join(', ') || '—'}
      </p>
    </div>
  )
}

function SeccionCertificacionCobranza({ cc }: { cc: FichaObra['certificacionCobranza'] }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-certificacion-cobranza">
      <h2 className="text-xl font-semibold">Certificación y cobranza</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody>
          <tr>
            <td className="pr-4 text-gray-500">Certificado</td>
            <td className="font-medium">{money(cc.certificado)}</td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Facturado</td>
            <td className="font-medium">{money(cc.facturado)}</td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Cobrado</td>
            <td className="font-medium">{money(cc.cobrado)}</td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Pendiente de certificar</td>
            <td className="font-medium">{money(cc.pendienteCertificar)}</td>
          </tr>
          <tr>
            <td className="pr-4 text-gray-500">Cobranza proyectada (sin certificado formal)</td>
            <td className="font-medium">
              {cc.cobranzaProyectadaSinCertificar.valor != null ? money(cc.cobranzaProyectadaSinCertificar.valor) : '—'}{' '}
              <ConfianzaBadge naturaleza={cc.cobranzaProyectadaSinCertificar.naturaleza} />
            </td>
          </tr>
        </tbody>
      </table>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-gray-400">Por qué certificado/facturado están en $0</summary>
        <p className="mt-1 text-xs text-gray-500">{cc.cobranzaProyectadaSinCertificar.explicacion}</p>
      </details>
    </div>
  )
}

function SeccionCostos({ costos }: { costos: FichaObra['costos'] }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-costos">
      <h2 className="text-xl font-semibold">Costos</h2>
      <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">Comprometido</dt>
          <dd className="font-semibold">{money(costos.porEstado.comprometido)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pendiente</dt>
          <dd className="font-semibold">{money(costos.porEstado.pendiente)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pagado</dt>
          <dd className="font-semibold">{money(costos.porEstado.pagado)}</dd>
        </div>
      </dl>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="pr-4">Concepto</th>
            <th className="pr-4">Monto</th>
          </tr>
        </thead>
        <tbody>
          {costos.porConcepto.slice(0, 10).map((c) => (
            <tr key={c.concepto}>
              <td className="pr-4">{c.concepto}</td>
              <td className="pr-4">{money(c.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {costos.pendienteClasificarNota && (
        <p className="mt-2 text-xs text-amber-700" data-testid="ficha-obra-costo-pendiente-clasificar">
          {costos.pendienteClasificarNota}
        </p>
      )}
    </div>
  )
}

function SeccionRiesgosDecisiones({ ficha }: { ficha: FichaObra }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-riesgos-decisiones">
      <h2 className="text-xl font-semibold">Riesgos y decisiones</h2>
      {ficha.riesgosDecisiones.length === 0 && <p className="mt-2 text-sm text-gray-500">Sin riesgos detectados.</p>}
      <ul className="mt-3 space-y-3">
        {ficha.riesgosDecisiones.map((alerta) => (
          <AlertaCard key={alerta.id} alerta={alerta} accionExistente={accionParaAlerta(alerta, ficha.acciones)} />
        ))}
      </ul>
    </div>
  )
}

function SeccionAcciones({ acciones }: { acciones: FichaObra['acciones'] }) {
  return (
    <div className="rounded border p-4" data-testid="ficha-obra-acciones">
      <h2 className="text-xl font-semibold">Acciones</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="pr-4">Título</th>
            <th className="pr-4">Estado</th>
            <th className="pr-4">Responsable</th>
            <th className="pr-4">Fecha límite</th>
          </tr>
        </thead>
        <tbody>
          {acciones.map((a) => (
            <tr key={a.id}>
              <td className="pr-4">{a.titulo}</td>
              <td className="pr-4">{ESTADO_ACCION_LABEL[a.estado]}</td>
              <td className="pr-4">{a.responsable ?? '—'}</td>
              <td className="pr-4">{a.fecha_limite ?? '—'}</td>
            </tr>
          ))}
          {acciones.length === 0 && (
            <tr>
              <td colSpan={4} className="pt-2 text-gray-500">
                Sin acciones registradas para esta obra.{' '}
                <Link href="/acciones" className="underline">
                  Ver Centro de Acción
                </Link>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function FichaObraView({ ficha }: { ficha: FichaObra }) {
  return (
    <div className="space-y-6" data-testid="ficha-obra">
      <SeccionResumen ficha={ficha} />
      <SeccionEconomia economia={ficha.economia} />
      <SeccionProduccion produccion={ficha.produccion} />
      <SeccionHH hh={ficha.hh} />
      <SeccionCertificacionCobranza cc={ficha.certificacionCobranza} />
      <SeccionCostos costos={ficha.costos} />
      <SeccionRiesgosDecisiones ficha={ficha} />
      <SeccionAcciones acciones={ficha.acciones} />
    </div>
  )
}
