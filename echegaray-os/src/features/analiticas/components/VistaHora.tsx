// COSTO POR HORA — dónde se trabajó y cuánto costó cada hora.
//
// Diseño v6: columnas de horas por cliente con su $/hora debajo, y la lista obra por obra con una
// barra y la marca del costo de la empresa (ámbar desde +20 %). Queda al final del módulo: no es
// presupuesto contra consumo, es la calidad de la mano de obra imputada.
//
// $/hora = mano de obra con recibo ÷ horas valorizadas (`costoPorHora`). Una mano de obra ESTIMADA
// es horas × tarifa: dividirla por las horas devuelve la tarifa, así que esas obras no se miden y se
// dicen aparte.
import { horasTexto, millones, pctConSigno, porHora } from '../services/formato'
import { rotuloEstimada, type ObraAnalitica } from '../services/obras'
import { costoPorHora, manoObraDe, UMBRAL_HORA_CARA } from '../services/agregados'
import { ancho, Cabecera, Seccion } from './Piezas'

export function VistaHora({ obras, periodo }: { obras: ObraAnalitica[]; periodo: string }) {
  const r = costoPorHora(obras)
  const mo = manoObraDe(obras)
  const est = rotuloEstimada(mo)
  const horas = obras.reduce<number | null>((a, o) => (o.gasto.horas == null ? a : (a ?? 0) + o.gasto.horas), null)
  const clientes = [...new Map(obras.map((o) => [o.clienteId, o.clienteNombre])).entries()].map(([id, nombre]) => {
    const propias = obras.filter((o) => o.clienteId === id)
    const h = propias.reduce<number | null>((a, o) => (o.gasto.horas == null ? a : (a ?? 0) + o.gasto.horas), null)
    return { id, nombre, horas: h, porHora: costoPorHora(propias).empresa }
  }).filter((c) => c.horas != null).sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0))
  const maxH = Math.max(1, ...clientes.map((c) => c.horas ?? 0))
  const maxPH = Math.max(1, ...r.puntos.map((p) => p.porHora))
  const cara = (ph: number | null) => ph != null && r.empresa != null && ph > r.empresa * (1 + UMBRAL_HORA_CARA)
  return (
    <>
      <Cabecera titulo="Costo por hora" detalle={`${periodo} · dónde se trabajó y cuánto costó cada hora`}
        cifras={[
          { rotulo: 'horas cargadas a obra', valor: horasTexto(horas), falta: 'sin horas' },
          { rotulo: 'mano de obra imputada', valor: millones(mo.manoObra), nota: est ?? undefined },
          { rotulo: 'costo por hora, empresa', valor: porHora(r.empresa), falta: 'sin medir', nota: r.noMedidas.length ? `sin las ${r.noMedidas.length} obras con mano de obra estimada` : undefined },
          // EL DISEÑO LA TRAE ESCRITA A MANO (3.053,5 h): el módulo no lee las horas de jefe fuera de obra.
          { rotulo: 'horas fuera de obra', valor: null, falta: 'sin registrar', nota: 'las horas de jefe no se leen acá' },
        ]} />
      <Seccion titulo="Horas por cliente" aclaracion="la altura son las horas; debajo, lo que costó cada una">
        <div className="grid h-[200px] grid-cols-[repeat(auto-fit,minmax(64px,1fr))] items-end gap-3 lg:gap-6">
          {clientes.map((c) => (
            <div key={c.id} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
              <div className="text-[12.5px] font-semibold text-ink">{horasTexto(c.horas)}</div>
              <div className="w-full max-w-[140px] rounded-t-[2px] bg-accent" style={{ height: `${((c.horas ?? 0) / maxH) * 130}px` }} />
              <div className="max-w-full truncate text-xs font-medium text-ink">{c.nombre}</div>
              <div className={`text-[11px] ${cara(c.porHora) ? 'text-warn' : 'text-muted'}`}>{porHora(c.porHora) ?? '—'}</div>
            </div>
          ))}
        </div>
      </Seccion>
      <Seccion titulo="Costo por hora, obra por obra" aclaracion="la raya vertical es el costo de la empresa; en ámbar, más de 20 % arriba" filo>
        <div className="flex flex-col pb-9">
          {r.puntos.map((p) => (
            <div key={p.obra.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2 hover:bg-surface-quiet lg:h-10 lg:grid-cols-[minmax(200px,1fr)_90px_minmax(200px,1.6fr)_100px] lg:gap-5 lg:py-0">
              <div className="flex min-w-0 flex-col gap-px">
                <div className="truncate text-[12.5px] font-medium text-ink">{p.obra.nombre}</div>
                <div className="text-[10.5px] text-faint">{p.obra.clienteNombre}</div>
              </div>
              <div className="hidden text-right text-xs text-muted lg:block">{horasTexto(p.obra.gasto.horasValorizadas)}</div>
              <div className="relative col-span-2 h-2.5 rounded-[2px] bg-line lg:col-span-1">
                <div className={`absolute inset-y-0 left-0 rounded-[2px] ${cara(p.porHora) ? 'bg-warn' : 'bg-accent'}`} style={{ width: ancho(p.porHora, maxPH) }} />
                {r.empresa != null ? <div className="absolute -bottom-1 -top-1 w-px bg-ink" style={{ left: ancho(r.empresa, maxPH) }} /> : null}
              </div>
              <div className={`row-start-1 whitespace-nowrap text-right text-[12.5px] font-semibold lg:row-auto ${cara(p.porHora) ? 'text-warn' : 'text-ink'}`} title={`${pctConSigno(p.contraEmpresa)} contra la empresa`}>
                {porHora(p.porHora)}
              </div>
            </div>
          ))}
          {r.noMedidas.length ? (
            <p className="pt-3 text-[11.5px] leading-normal text-muted">
              Sin medir, porque la mano de obra es estimada: {r.noMedidas.map((o) => `${o.nombre} (${rotuloEstimada(o.gasto)})`).join(' · ')}
            </p>
          ) : null}
        </div>
      </Seccion>
    </>
  )
}
