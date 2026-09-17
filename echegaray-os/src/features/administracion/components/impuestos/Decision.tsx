// LO DE ARRIBA DE LA PANTALLA DE IMPUESTOS: si los datos sirven hoy, en qué vista está parado, y la
// respuesta a «cuánto tengo que pagar, cuándo, y qué está atrasado». Server Components.
//
// ═══ «DE ESO» Y NO «AL LADO» ═══
//
// La versión anterior ponía «A pagar en 30 días $11,5 M» y «Cargas sociales en 30 días $10,7 M» como
// dos cifras hermanas del mismo tamaño. Se leían como $22 M. Acá hay UN número grande —el total— y lo
// que es parte de él se escribe debajo como parte: «de eso, cargas sociales…», «de eso, vencido…».
import Link from 'next/link'
import { plata } from '@/shared/utils/format'
import { ddmm, type frescura, type PosicionImpuesto } from '../../services/impuestos'
import { nombreLlano, TITULO_VISTA, type decision, type porImpuesto, type Vista } from '../../services/impuestosVista'
import { MarcaEstimado, SaldoAFavor, Vence } from './piezas'
import { SolapaVisible } from './SolapaVisible'

type Frescura = ReturnType<typeof frescura>
type DatosDecision = ReturnType<typeof decision>

/** Hasta cuándo llega cada fuente. Lo viejo o lo que falló se dice con palabras, no con un ▲. */
export function LineaFrescura({ fr }: { fr: Frescura }) {
  const horas = fr.horasDesdeSincronizacion
  return (
    <p data-testid="impuestos-frescura" className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-faint">
      <span>Datos:</span>
      {fr.fuentes.map((f) => (
        <span key={f.nombre} data-vieja={f.vieja ? '' : undefined} className={f.fallo ? 'text-neg' : f.vieja ? 'text-warn' : ''}>
          {f.nombre} {f.al ? `al ${ddmm(f.al)}` : 'sin fecha'}
          {f.fallo ? ' (no se pudo leer)' : f.vieja ? ' (desactualizado)' : ''}
        </span>
      ))}
      <span className={fr.sincronizacionVieja ? 'text-warn' : ''}>
        · {horas === null ? 'nunca se actualizó' : `actualizado hace ${Math.max(0, Math.round(horas))} h`}
      </span>
    </p>
  )
}

export interface Solapa { vista: Vista; cuenta?: number; alerta?: boolean }

/**
 * LAS SOLAPAS. Texto subrayado —el nivel 3 de `CabeceraSeccion`—, no una tercera barra con fondo. En
 * el teléfono miden 44 px de alto y la fila se desliza DENTRO de sí misma: la página no se corre.
 * Son enlaces (`?ver=`): se comparten, el botón atrás vuelve, y no mandan JavaScript al teléfono.
 */
export function Solapas({ solapas, activa, ruta }: { solapas: Solapa[]; activa: Vista; ruta: string }) {
  return (
    <nav aria-label="Vistas de impuestos" data-testid="impuestos-solapas" className="relative -mx-5 overflow-x-auto border-b border-line px-5">
      <ul className="flex min-w-max gap-1">
        {solapas.map((s) => {
          const on = s.vista === activa
          return (
            <li key={s.vista}>
              <Link
                prefetch={false}
                href={s.vista === 'resumen' ? ruta : `${ruta}?ver=${s.vista}`}
                aria-current={on ? 'page' : undefined}
                data-testid={`solapa-${s.vista}`}
                className={`flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13px] lg:min-h-[40px] ${
                  on ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {TITULO_VISTA[s.vista]}
                {s.cuenta ? (
                  <span className={`font-mono text-[11px] tabular-nums ${s.alerta ? 'text-neg' : 'text-faint'}`}>{s.cuenta}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
      <SolapaVisible activa={activa} />
    </nav>
  )
}

/** Una cifra chica con su rótulo arriba. `data-metrica` queda para quien la lea desde un test. */
const Dato = ({ rotulo, children, metrica }: { rotulo: string; children: React.ReactNode; metrica: string }) => (
  <div data-metrica={metrica} className="min-w-0">
    <div className="text-[12px] text-muted">{rotulo}</div>
    <div className="mt-1 text-[13px] text-ink">{children}</div>
  </div>
)

/** El número grande y lo que es parte de él. */
function Total({ d }: { d: DatosDecision }) {
  return (
    <div data-metrica="A pagar en 30 días" className="min-w-0">
      <div className="text-[13px] text-muted">A pagar en los próximos 30 días</div>
      <div className="mt-1 font-mono text-[32px] font-semibold leading-none tabular-nums text-ink">
        {plata(d.total)}
      </div>
      <ul className="mt-2 flex flex-col gap-0.5 text-[13px] text-muted">
        <li>{d.cantidad === 1 ? '1 vencimiento' : `${d.cantidad} vencimientos`}</li>
        {d.vencido.cantidad > 0 && (
          <li data-metrica="Vencido" className="text-neg">
            de eso, vencido sin pago: <span className="font-mono tabular-nums">{plata(d.vencido.total)}</span> ({d.vencido.cantidad})
          </li>
        )}
        {d.todoEstimado
          ? <li data-metrica="Estimado">todo estimado: ninguno está declarado todavía</li>
          : d.estimado.cantidad > 0 && (
            <li data-metrica="Estimado">
              de eso, estimado: <span className="font-mono tabular-nums text-ink">{plata(d.estimado.total)}</span>
            </li>
          )}
        {d.cargas.cantidad > 0 && (
          <li data-metrica="Cargas sociales en 30 días">
            de eso, cargas sociales: <span className="font-mono tabular-nums text-ink">{plata(d.cargas.total)}</span>
          </li>
        )}
        {d.sinImporte > 0 && <li className="text-warn">{d.sinImporte} sin importe conocido: no están sumados</li>}
      </ul>
    </div>
  )
}

/**
 * LA RESPUESTA DE ARRIBA. Tres columnas en la computadora, una debajo de la otra en el teléfono:
 * el total, lo próximo que vence, y lo que hay a favor o sin identificar (lo que puede bajar lo que
 * se paga).
 */
export function Decision({ d, saldos, otrosAFavor, sinIdentificar, rutaSinIdentificar }: {
  d: DatosDecision
  saldos: PosicionImpuesto[]
  /** Saldos que no son de la declaración mensual (DDJJ anual de Ganancias), con su concepto. */
  otrosAFavor: PosicionImpuesto[]
  sinIdentificar: { total: number; cantidad: number }
  rutaSinIdentificar: string
}) {
  const p = d.proximo
  return (
    <div data-testid="impuestos-franja" className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
      <Total d={d} />
      <Dato rotulo="Lo próximo que vence" metrica="Próximo vencimiento">
        {p ? (
          <>
            <div className="font-medium">{nombreLlano(p)}</div>
            <div className="mt-0.5"><span className="font-mono text-[15px] tabular-nums">{p.pendiente === null ? 'sin importe' : plata(p.pendiente)}</span><MarcaEstimado estado={p.estado} /></div>
            <div className="mt-0.5"><Vence fecha={p.vencimiento} confianza={p.vencimiento_confianza} dias={p.dias} /></div>
          </>
        ) : <span className="text-muted">Nada vence en los próximos 30 días.</span>}
      </Dato>
      <Dato rotulo="A favor en el fisco" metrica="A favor">
        <ul className="flex flex-col gap-1">
          {[...saldos, ...otrosAFavor].map((s) => (
            <li key={`${s.impuesto}-${s.periodo}-${s.concepto}`}><SaldoAFavor s={s} conNombre /></li>
          ))}
          {!saldos.length && !otrosAFavor.length && <li className="text-muted">Sin saldo a favor.</li>}
          {sinIdentificar.cantidad > 0 && (
            <li data-metrica="Pagos sin imputar" className="mt-1">
              <Link prefetch={false} href={rutaSinIdentificar} className="inline-flex min-h-[44px] items-center text-warn underline-offset-2 hover:underline lg:min-h-0">
                {sinIdentificar.cantidad === 1 ? '1 pago' : `${sinIdentificar.cantidad} pagos`} al fisco sin identificar · {plata(sinIdentificar.total)}
              </Link>
            </li>
          )}
        </ul>
      </Dato>
    </div>
  )
}

type FilaResumen = ReturnType<typeof porImpuesto>[number]

/**
 * LO DE ARRIBA DE UNA SOLAPA DE IMPUESTO: cuánto falta pagar, lo próximo y lo que hay a favor. Es la
 * misma fila del resumen, dicha en grande para quien entró directo a ese impuesto.
 */
export function CifrasDeImpuesto({ r }: { r: FilaResumen }) {
  return (
    <div data-testid={`cifras-${r.vista}`} className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
      <div data-metrica="Falta pagar" className="min-w-0">
        <div className="text-[13px] text-muted">Falta pagar</div>
        <div className="mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums text-ink">{plata(r.faltaPagar)}</div>
        <div className="mt-2 text-[13px] text-muted">
          {[
            r.vencidas ? <span key="v" className="text-neg">{r.vencidas} vencido{r.vencidas > 1 ? 's' : ''} sin pago</span> : null,
            r.estimados ? <span key="e">{r.estimados} estimado{r.estimados > 1 ? "s" : ""}</span> : null,
            r.sinImporte ? <span key="s" className="text-warn">{r.sinImporte} sin importe, no sumado</span> : null,
          ].filter(Boolean).map((x, i) => <span key={i}>{i ? ' · ' : ''}{x}</span>)}
        </div>
      </div>
      <Dato rotulo="Lo próximo que vence" metrica="Próximo vencimiento">
        {r.proximo ? (
          <>
            <div className="font-medium">{nombreLlano(r.proximo)}</div>
            <div className="mt-0.5"><span className="font-mono text-[15px] tabular-nums">{r.proximo.pendiente === null ? 'sin importe' : plata(r.proximo.pendiente)}</span><MarcaEstimado estado={r.proximo.estado} /></div>
            <div className="mt-0.5"><Vence fecha={r.proximo.vencimiento} confianza={r.proximo.vencimiento_confianza} dias={r.proximo.dias} /></div>
          </>
        ) : <span className="text-muted">Nada vence en los próximos 30 días.</span>}
      </Dato>
      <Dato rotulo="A favor" metrica="A favor">
        {r.aFavor.length || r.otroAFavor ? (
          <div className="flex flex-col gap-1">
            {[...r.aFavor, ...(r.otroAFavor ? [r.otroAFavor] : [])].map((s) => (
              <SaldoAFavor key={`${s.impuesto}-${s.periodo}-${s.concepto}`} s={s} conNombre={r.aFavor.length > 1} grande />
            ))}
          </div>
        ) : <span className="text-muted">Sin saldo a favor.</span>}
      </Dato>
    </div>
  )
}
