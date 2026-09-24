// LO DE ARRIBA DE LA PANTALLA DE IMPUESTOS: el número que se decide, de cuándo son los datos, las
// solapas y los avisos de una línea. Server Components.
//
// ═══ UN NÚMERO, Y LO QUE ES PARTE DE ÉL EN CHICO ═══
//
// Dueño, 17/09/2026: «más sencillo, claro, minimalista». La primera versión rehecha tenía tres
// columnas de cifras arriba; ahora hay UN número —a pagar en 30 días— y debajo, en una línea chica,
// cuánto de eso es estimado. Lo vencido, si hay, también: es lo único que ya cuesta intereses.
// Lo que salió de acá (a favor, próximo, sin identificar) está en las solapas y en el historial.
import Link from 'next/link'
import { plata } from '@/shared/utils/format'
import { ddmm, type frescura, type PosicionImpuesto } from '../../services/impuestos'
import { NOMBRE_LLANO, nombreLlano, TITULO_VISTA, mesLargo, type decision, type porImpuesto, type proyeccionDelMes, type Vista } from '../../services/impuestosVista'
import { MarcaEstimado, SaldoAFavor, Vence } from './piezas'
import { SolapaVisible } from './SolapaVisible'

type Frescura = ReturnType<typeof frescura>
type DatosDecision = ReturnType<typeof decision>
type FilaResumen = ReturnType<typeof porImpuesto>[number]

/** La línea completa de fuentes: vive en «Todo el historial». Lo viejo o fallido se dice con palabras. */
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

/**
 * «datos al 16/09»: la fecha de ARCA, que es la fuente diaria. Si alguna fuente está vieja o falló,
 * lo dice en la misma línea y lleva al historial, donde está el detalle por fuente.
 */
export function DatosAl({ fr, rutaHistorial }: { fr: Frescura; rutaHistorial: string }) {
  const arca = fr.fuentes.find((f) => f.nombre === 'ARCA')
  const problemas = fr.fuentes.filter((f) => f.fallo || f.vieja).length + (fr.sincronizacionVieja ? 1 : 0)
  return (
    <p data-testid="impuestos-datos-al" className="text-[12px] text-faint">
      datos al {arca?.al ? ddmm(arca.al) : 'sin fecha'}
      {problemas > 0 && (
        <> · <Link prefetch={false} href={rutaHistorial} className="text-warn underline-offset-2 hover:underline">
          {problemas === 1 ? '1 fuente desactualizada' : `${problemas} fuentes desactualizadas`}
        </Link></>
      )}
    </p>
  )
}

export interface Solapa { vista: Vista; cuenta?: number; alerta?: boolean }

/**
 * LAS SOLAPAS. Texto subrayado, sin fondo. En el teléfono miden 44 px y la fila se desliza DENTRO de
 * sí misma. Son enlaces (`?ver=`): se comparten y el botón atrás vuelve.
 */
export function Solapas({ solapas, activa, ruta }: { solapas: Solapa[]; activa: Vista; ruta: string }) {
  return (
    <nav aria-label="Vistas de impuestos" data-testid="impuestos-solapas" className="relative -mx-5 overflow-x-auto border-b border-line-hairline px-5">
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
                {s.cuenta ? <span className={`font-mono text-[11px] tabular-nums ${s.alerta ? 'text-neg' : 'text-faint'}`}>{s.cuenta}</span> : null}
              </Link>
            </li>
          )
        })}
      </ul>
      <SolapaVisible activa={activa} />
    </nav>
  )
}

/** EL NÚMERO. `data-metrica` y el testid `impuestos-franja` se conservan. */
export function NumeroClave({ d }: { d: DatosDecision }) {
  return (
    <div data-testid="impuestos-franja" data-metrica="A pagar en 30 días">
      <div className="text-[13px] text-muted">A pagar en 30 días</div>
      <div className="mt-1 font-mono text-[40px] font-semibold leading-none tabular-nums text-ink">{plata(d.total)}</div>
      <p className="mt-2 flex flex-wrap gap-x-3 text-[13px] text-muted">
        {d.todoEstimado
          ? <span data-metrica="Estimado">todo estimado</span>
          : d.estimado.cantidad > 0 && <span data-metrica="Estimado">de eso, estimado <span className="font-mono tabular-nums">{plata(d.estimado.total)}</span></span>}
        {d.vencido.cantidad > 0 && (
          <span data-metrica="Vencido" className="text-neg">además, vencido sin pago <span className="font-mono tabular-nums">{plata(d.vencido.total)}</span></span>
        )}
        {d.sinImporte > 0 && <span className="text-warn">{d.sinImporte} sin importe, no sumado</span>}
      </p>
    </div>
  )
}

/**
 * LA PROYECCIÓN A FIN DE MES, APARTE (dueño, 24/09/2026). Es la estimación del mes entero que calcula la
 * pestaña «Impuestos y Financieros» (su sección 7): se rotula como estimación y NO se suma al número de
 * arriba, que es lo registrado. Sin filas no se dibuja.
 */
export function ProyeccionFinDeMes({ p }: { p: ReturnType<typeof proyeccionDelMes> }) {
  if (!p.filas.length || !p.periodo) return null
  return (
    <div data-testid="impuestos-proyeccion" data-metrica="Proyección a fin de mes" className="text-[13px] text-muted">
      <span>Proyección a fin de {mesLargo(p.periodo).split(' ')[0]} · estimación </span>
      <span className="font-mono tabular-nums text-ink">{plata(p.total)}</span>
      {p.filas.length > 1 && (
        <span className="ml-2 text-faint">
          ({p.filas.map((f) => `${NOMBRE_LLANO[f.impuesto]} ${plata(f.a_pagar ?? 0)}`).join(' · ')})
        </span>
      )}
    </div>
  )
}

/** El aviso de una línea de los pagos sin identificar; el detalle está en el historial. */
export function AvisoSinIdentificar({ total, cantidad, ruta }: { total: number; cantidad: number; ruta: string }) {
  if (!cantidad) return null
  return (
    <p data-testid="aviso-sin-identificar" data-metrica="Pagos sin imputar" className="text-[13px]">
      <Link prefetch={false} href={ruta} className="inline-flex min-h-[44px] items-center text-warn underline-offset-2 hover:underline lg:min-h-0">
        {cantidad === 1 ? '1 pago' : `${cantidad} pagos`} al fisco sin identificar · {plata(total)} ›
      </Link>
    </p>
  )
}

/**
 * EL NÚMERO DE UNA SOLAPA: cuánto falta pagar de ese impuesto, y en líneas chicas lo próximo que vence
 * y lo que hay a favor (estimado apagado, declarado en tinta).
 */
export function CifrasDeImpuesto({ r }: { r: FilaResumen }) {
  const saldos = [...r.aFavor, ...(r.otroAFavor ? [r.otroAFavor] : [])]
  return (
    <div data-testid={`cifras-${r.vista}`} data-metrica="Falta pagar">
      <div className="text-[13px] text-muted">Falta pagar</div>
      <div className="mt-1 font-mono text-[40px] font-semibold leading-none tabular-nums text-ink">{plata(r.faltaPagar)}</div>
      <ul className="mt-3 flex flex-col gap-1 text-[13px] text-muted">
        {(r.vencidas > 0 || r.estimados > 0 || r.sinImporte > 0) && (
          <li className="flex flex-wrap gap-x-3">
            {r.vencidas > 0 && <span className="text-neg">{r.vencidas} vencido{r.vencidas > 1 ? 's' : ''} sin pago</span>}
            {r.estimados > 0 && <span>{r.estimados} estimado{r.estimados > 1 ? 's' : ''}</span>}
            {r.sinImporte > 0 && <span className="text-warn">{r.sinImporte} sin importe, no sumado</span>}
          </li>
        )}
        <li data-metrica="Próximo vencimiento" className="flex flex-wrap items-baseline gap-x-2">
          <span>Próximo:</span>
          {r.proximo ? (
            <>
              <span className="text-ink">{nombreLlano(r.proximo)}</span>
              <span className="font-mono tabular-nums text-ink">{r.proximo.pendiente === null ? 'sin importe' : plata(r.proximo.pendiente)}</span>
              <MarcaEstimado estado={r.proximo.estado} />
              <Vence fecha={r.proximo.vencimiento} confianza={r.proximo.vencimiento_confianza} dias={r.proximo.dias} />
            </>
          ) : <span>nada vence en 30 días</span>}
        </li>
        <li data-metrica="A favor" className="flex flex-wrap items-baseline gap-x-2">
          <span>A favor:</span>
          {saldos.length
            ? saldos.map((s: PosicionImpuesto) => <SaldoAFavor key={`${s.impuesto}-${s.periodo}-${s.concepto}`} s={s} conNombre={saldos.length > 1} />)
            : <span>sin saldo a favor</span>}
        </li>
      </ul>
    </div>
  )
}
