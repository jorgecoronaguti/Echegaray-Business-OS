// ECONOMÍA DE LA OBRA — contrato, costo, certificación y resultado. La vista económica de ESTA obra,
// no un sistema financiero nuevo.
//
// ═══ QUÉ CAMBIÓ, Y POR QUÉ (19/08/2026) ═══
//
// Tenía tres tablas de tres columnas, y la tercera era «De dónde sale»: un párrafo por renglón, fijo
// en pantalla, con cosas como *"obra_canonica · se carga en Resumen › Editar la obra"* o *"presupuesto
// 3f2a1b8c · tabla presupuestos, versión aprobada"*. El dueño lo prohibió en dos reglas distintas
// —*"texto secundario corto"* y *"nada de explicaciones técnicas permanentes"*— y es la misma
// corrección que ya se hizo en el resumen de plan contra real.
//
// EL ORIGEN NO SE BORRA: SE MUEVE. Viaja en el `title` de cada renglón, así que sigue disponible para
// auditar —"¿de dónde sale este número?" se contesta apoyando el puntero— y deja de competir por la
// atención con la cifra, que es lo que la persona vino a mirar. Un origen que hay que leer todos los
// días para entender la pantalla significa que la pantalla no se entiende.
//
// ═══ LO QUE NO CAMBIA: DONDE FALTA UNA PUNTA, SE DICE CUÁL ═══
//
// `obra_plan_vs_real` anula el desvío cuando le falta un lado de la comparación. Acá NUNCA se rellena
// ese null con 0 ni con un guión mudo: se escribe qué falta. Un 0% de desvío sobre una obra sin
// presupuesto diría "vamos en presupuesto", que es exactamente lo contrario de la verdad.
//
// FRONTERA: esto NO reconstruye Finanzas. Flujo de Caja, Pagos, Cheques e Ingeniería Financiera
// siguen donde están; acá se leen las fuentes canónicas de esta obra y nada más.

import type { ReactNode } from 'react'
import {
  BotonAccion, Callout, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Certificado, PlanVsReal } from '../types'
import { fecha, plata } from './formato'

/** Un renglón: concepto ↔ cifra. El origen va en el `title`; el "qué falta", visible sólo si falta. */
function Linea({
  concepto, valor, origen, falta, fuerte = false, tono = 'ink',
}: {
  concepto: string
  valor: string | null
  origen: string
  falta?: string
  fuerte?: boolean
  tono?: 'ink' | 'neg' | 'warn' | 'pos'
}) {
  const color = { ink: 'text-ink', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' }[tono]
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0" title={origen}>
      <dt className="min-w-0 text-[13px] text-muted">
        {concepto}
        {valor == null && falta && <span className="block text-[11px] leading-snug text-faint">{falta}</span>}
      </dt>
      <dd className={`shrink-0 text-[13px] tabular-nums ${fuerte ? 'font-semibold' : 'font-medium'} ${valor == null ? 'text-faint' : color}`}>
        {valor ?? '—'}
      </dd>
    </div>
  )
}

/** El `testid` es del BLOQUE, no de su prosa: un test que se ata al texto se rompe cada vez que se
 *  mejora una etiqueta, y entonces se dejan de mejorar las etiquetas. */
function Bloque({ titulo, testid, children }: { titulo: string; testid: string; children: ReactNode }) {
  return (
    <section data-testid={testid}>
      <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{titulo}</h2>
      <dl>{children}</dl>
    </section>
  )
}

/** Un porcentaje sobre una base, sólo si las dos puntas existen y la base no es cero. */
function pct(valor: number | null | undefined, base: number | null | undefined): string | null {
  if (valor == null || !base) return null
  return `${(valor / base * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

export function TabEconomia({
  plan, certificados, crearCert, borrarCert,
}: {
  plan: PlanVsReal | null
  certificados: Certificado[]
  crearCert: AccionFormulario
  borrarCert: (certificadoId: string) => Promise<ResultadoAccion>
}) {
  if (!plan) return <Callout tono="neg">No pude leer el plan contra real de esta obra.</Callout>

  const sinPresupuesto = plan.costo_presupuestado == null
  // `costo_real` llega en 0 cuando la obra existe pero no tiene un solo comprobante imputado. Ese 0
  // es real —la vista lo calcula— pero significa "todavía nadie cargó nada", no "salió gratis".
  const sinComprobantes = !plan.costo_real
  const desvioPesos = plan.costo_presupuestado != null && plan.costo_real
    ? plan.costo_real - plan.costo_presupuestado : null

  return (
    <div className="space-y-6">
      {/* Cuatro bloques en dos columnas: entran en una pantalla sin scroll y se comparan de un vistazo.
          Sin recuadro por bloque — son cuatro listas de definición, no cuatro tarjetas. */}
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <Bloque titulo="Contrato" testid="economia-contrato">
          <Linea
            concepto="Contratado" fuerte
            valor={plan.monto_contratado == null ? null : plata(plan.monto_contratado)}
            origen="El monto del contrato de la obra. Se carga en Resumen › Editar la obra."
            falta="Nadie lo cargó todavía. Se carga en Resumen › Editar la obra."
          />
          <Linea
            concepto="Presupuestado (venta)"
            valor={plan.monto_presupuestado == null ? null : plata(plan.monto_presupuestado)}
            origen="Lo que se cotizó, del presupuesto aprobado de esta obra."
            falta="Esta obra no tiene presupuesto cargado."
          />
        </Bloque>

        <Bloque titulo="Costo" testid="economia-costo">
          <Linea
            concepto="Presupuesto"
            valor={plan.costo_presupuestado == null ? null : plata(plan.costo_presupuestado)}
            origen="Costo directo presupuestado, de la versión aprobada del presupuesto."
            falta="Sin presupuesto: no hay contra qué medir el gasto."
          />
          <Linea
            concepto="Costo real"
            valor={sinComprobantes ? null : plata(plan.costo_real)}
            origen="Suma de los comprobantes de Compras imputados a esta obra."
            falta="Ningún comprobante imputado. No es que costó $0."
          />
          <Linea
            concepto="Desvío" fuerte
            valor={desvioPesos == null ? null
              : `${desvioPesos > 0 ? '+' : ''}${plata(desvioPesos)}` +
                (pct(desvioPesos, plan.costo_presupuestado) ? ` · ${plan.desvio_costo_pct}%` : '')}
            origen="Costo real menos presupuesto. Positivo = se gastó de más."
            falta={sinPresupuesto && sinComprobantes ? 'Faltan las dos puntas.'
              : sinPresupuesto ? 'Falta el presupuesto.' : 'Faltan comprobantes imputados.'}
            tono={desvioPesos != null && desvioPesos > 0 ? 'neg' : 'pos'}
          />
        </Bloque>

        <Bloque titulo="Certificación" testid="economia-certificacion">
          <Linea
            concepto="Certificado"
            valor={plan.certificado == null ? null : plata(plan.certificado)}
            origen={`Suma de los ${certificados.length} certificado(s) cargados en esta obra.`}
            falta="Todavía no hay ningún certificado cargado."
          />
          <Linea
            concepto="Facturado"
            valor={plan.facturado == null ? null : plata(plan.facturado)}
            origen="Certificados que ya tienen fecha y monto de facturación."
            falta="Ningún certificado tiene facturación cargada."
          />
          <Linea
            concepto="Cobrado"
            valor={plan.cobrado == null ? null : plata(plan.cobrado)}
            origen="Certificados que ya tienen fecha y monto de cobranza."
            falta="Ningún certificado tiene cobranza cargada."
          />
          <Linea
            concepto="Pendiente de cobrar" fuerte
            valor={certificados.length ? plata(plan.pendiente_cobrar) : null}
            origen="Certificado menos cobrado: la plata que ya se ganó y todavía no entró."
            falta="Sin certificados no hay nada pendiente de cobrar."
            tono={plan.pendiente_cobrar ? 'warn' : 'ink'}
          />
          <Linea
            concepto="Pendiente de certificar"
            valor={plan.pendiente_certificar == null ? null : plata(plan.pendiente_certificar)}
            origen="Contratado menos certificado: lo que queda por certificar del contrato."
            falta="Falta el monto contratado."
          />
        </Bloque>

        <Bloque titulo="Resultado" testid="economia-resultado">
          <Linea
            concepto="Margen esperado"
            valor={plan.margen_esperado == null ? null
              : `${plata(plan.margen_esperado)}${pct(plan.margen_esperado, plan.monto_presupuestado) ? ` · ${pct(plan.margen_esperado, plan.monto_presupuestado)}` : ''}`}
            origen="El margen del presupuesto aprobado, en pesos, y sobre la venta cotizada."
            falta="Sale del presupuesto, y esta obra no tiene uno cargado."
          />
          <Linea
            concepto="Margen actual" fuerte
            valor={plan.margen_actual == null ? null
              : `${plata(plan.margen_actual)}${pct(plan.margen_actual, plan.monto_contratado) ? ` · ${pct(plan.margen_actual, plan.monto_contratado)}` : ''}`}
            // ES A HOY, NO A FIN DE OBRA, y decirlo importa: un margen alto al 20% de avance no
            // significa que la obra vaya bien, significa que todavía no se gastó.
            origen="Contratado menos costo real, a hoy. NO es una proyección a fin de obra."
            falta={plan.monto_contratado == null ? 'Falta el monto contratado.' : 'Falta el costo real.'}
            tono={plan.margen_actual != null && plan.margen_actual < 0 ? 'neg' : 'ink'}
          />
        </Bloque>
      </div>

      {certificados.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Certificados</h2>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table data-testid="tabla-certificados" className="w-full min-w-[640px] text-left">
              <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 text-right font-medium">Certificado</th>
                <th className="px-3 py-2 text-right font-medium">Facturado</th>
                <th className="px-3 py-2 text-right font-medium">Cobrado</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr></thead>
              <tbody>
                {certificados.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-[13px] text-ink">
                      {c.numero ?? 'sin número'}
                      {c.descripcion && <span className="block text-[11px] text-faint">{c.descripcion}</span>}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-muted">{fecha(c.fecha_certificacion)}</td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{plata(c.monto_certificado)}</td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">
                      {c.monto_facturado == null ? <span className="text-faint">sin facturar</span> : plata(c.monto_facturado)}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">
                      {c.monto_cobrado == null ? <span className="text-faint">sin cobrar</span> : plata(c.monto_cobrado)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <BotonAccion accion={borrarCert} args={[c.id]} testid="borrar-certificado" tono="peligro">Borrar</BotonAccion>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="rounded-lg border border-line bg-surface" data-testid="alta-certificado">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">+ Cargar certificado</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={crearCert} testid="form-certificado" enviar="Cargar certificado" limpiarAlOk mensajeOk="Certificado cargado.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Campo label="Número"><input name="numero" maxLength={40} className={CTRL} placeholder="3" /></Campo>
              <Campo label="Fecha de certificación"><input type="date" name="fecha_certificacion" required className={CTRL} /></Campo>
              <Campo label="Monto certificado ($)" ancho="col-span-2">
                <input type="number" name="monto_certificado" required min="0.01" step="0.01" className={CTRL} />
              </Campo>
              <Campo label="Descripción" ancho="col-span-2 sm:col-span-4">
                <input name="descripcion" maxLength={200} className={CTRL} placeholder="qué se certificó" />
              </Campo>
              {/* LAS ETAPAS VAN DE A PARES. La base rechaza un monto sin su fecha, y con razón: un
                  facturado sin fecha no se puede ubicar en el flujo de fondos. */}
              <Campo label="Fecha de facturación" ayuda="Opcional, pero va junto con el monto."><input type="date" name="fecha_facturacion" className={CTRL} /></Campo>
              <Campo label="Monto facturado ($)"><input type="number" name="monto_facturado" min="0.01" step="0.01" className={CTRL} /></Campo>
              <Campo label="Fecha de cobranza" ayuda="Opcional, pero va junto con el monto."><input type="date" name="fecha_cobranza" className={CTRL} /></Campo>
              <Campo label="Monto cobrado ($)"><input type="number" name="monto_cobrado" min="0.01" step="0.01" className={CTRL} /></Campo>
            </div>
          </FormAccion>
        </div>
      </details>
    </div>
  )
}
