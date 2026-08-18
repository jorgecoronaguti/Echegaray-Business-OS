// ECONOMÍA DE LA OBRA — presupuestado, costo real, desvío, contratado, margen, y el ciclo
// certificado → facturado → cobrado.
//
// ═══ CADA NÚMERO CON SU ORIGEN AL LADO ═══
//
// No es adorno ni prolijidad: es lo que hace auditable la pantalla. "Desvío de costo −12%" sin decir
// contra qué presupuesto y con qué comprobantes es una afirmación que nadie puede verificar, y una
// afirmación que nadie puede verificar no debería mover una decisión de plata.
//
// ═══ Y DONDE FALTA UNA PUNTA, SE DICE CUÁL ═══
//
// La vista `obra_plan_vs_real` anula el desvío cuando le falta un lado de la comparación. Esta
// pantalla NUNCA rellena ese null con 0 ni con un guión mudo: escribe qué falta y dónde se carga.
// Un 0% de desvío sobre una obra sin presupuesto diría "vamos en presupuesto", que es exactamente
// lo contrario de la verdad.

import type { ReactNode } from 'react'
import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { Certificado, PlanVsReal } from '../types'
import { desvio, fecha, plata } from './formato'

/** Una línea económica: el número, de dónde sale, y —si no hay número— qué falta para que haya. */
function Linea({
  concepto, valor, origen, falta,
}: {
  concepto: string
  valor: string | null
  origen: string
  falta?: string
}) {
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="px-4 py-2.5 text-[13px] text-ink">{concepto}</td>
      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-ink">
        {valor ?? <span className="font-normal text-warn">no determinado</span>}
      </td>
      <td className="px-3 py-2.5 text-[11px] leading-snug text-faint">
        {valor ? origen : (falta ?? origen)}
      </td>
    </tr>
  )
}

function Tabla({ titulo, testid, children }: { titulo: string; testid?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-[13px] font-semibold text-ink">{titulo}</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table data-testid={testid} className="w-full min-w-[520px] text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-4 py-2 font-medium">Concepto</th>
            <th className="px-3 py-2 text-right font-medium">Monto</th>
            <th className="px-3 py-2 font-medium">De dónde sale</th>
          </tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function TabEconomia({
  plan, certificados, crearCert, borrarCert,
}: {
  plan: PlanVsReal | null
  certificados: Certificado[]
  crearCert: AccionFormulario
  borrarCert: (certificadoId: string) => Promise<ResultadoAccion>
}) {
  if (!plan) {
    return <Callout tono="neg">No pude leer el plan contra real de esta obra.</Callout>
  }

  const sinPresupuesto = plan.costo_presupuestado == null
  // `costo_real` llega en 0 cuando la obra existe pero no tiene un solo comprobante imputado. Ese 0
  // es real —la vista lo calcula— pero significa "todavía nadie cargó nada", no "salió gratis".
  const sinComprobantes = !plan.costo_real

  return (
    <div className="space-y-5">
      <Tabla titulo="Costo" testid="economia-costo">
        <Linea
          concepto="Costo directo presupuestado"
          valor={plan.costo_presupuestado == null ? null : plata(plan.costo_presupuestado)}
          origen={`presupuesto ${plan.presupuesto_id ? plan.presupuesto_id.slice(0, 8) : ''} · tabla presupuestos, versión aprobada`}
          falta="No hay ningún presupuesto atado a esta obra en el eje canónico. Se carga en el módulo de presupuestos."
        />
        <Linea
          concepto="Costo real acumulado"
          valor={sinComprobantes ? null : plata(plan.costo_real)}
          origen="Compras: comprobantes imputados a esta obra"
          falta="Ningún comprobante de Compras está imputado a esta obra. No es que costó $0."
        />
        <Linea
          concepto="Desvío de costo"
          valor={plan.desvio_costo_pct == null ? null : desvio(plan.desvio_costo_pct)}
          origen="(costo real − presupuestado) ÷ presupuestado"
          falta={sinPresupuesto && sinComprobantes
            ? 'Faltan las dos puntas: el presupuesto y los comprobantes.'
            : sinPresupuesto ? 'Falta el presupuesto: sin él no hay contra qué medir el gasto.'
              : 'Faltan comprobantes imputados: todavía no hay gasto que comparar.'}
        />
      </Tabla>

      <Tabla titulo="Contrato y margen" testid="economia-margen">
        <Linea
          concepto="Monto contratado"
          valor={plan.monto_contratado == null ? null : plata(plan.monto_contratado)}
          origen="obra_canonica · se carga en Resumen › Editar la obra"
          falta="Nadie cargó el monto del contrato. Se carga en Resumen › Editar la obra."
        />
        <Linea
          concepto="Margen esperado"
          valor={plan.margen_esperado == null ? null : plata(plan.margen_esperado)}
          origen="presupuesto aprobado · margen_esperado en pesos"
          falta="Sale del presupuesto, y esta obra no tiene uno cargado."
        />
        <Linea
          concepto="Margen actual"
          valor={plan.margen_actual == null ? null : plata(plan.margen_actual)}
          origen="contratado − costo real (percibido a hoy, no proyectado a fin de obra)"
          falta={plan.monto_contratado == null
            ? 'Falta el monto contratado.'
            : 'Falta el costo real: ningún comprobante imputado.'}
        />
        <Linea
          concepto="Monto presupuestado (venta)"
          valor={plan.monto_presupuestado == null ? null : plata(plan.monto_presupuestado)}
          origen="presupuesto aprobado · lo que se cotizó"
          falta="Esta obra no tiene presupuesto cargado."
        />
      </Tabla>

      <Tabla titulo="Certificación y cobranza" testid="economia-cobranza">
        <Linea
          concepto="Certificado"
          valor={plan.certificado == null ? null : plata(plan.certificado)}
          origen={`suma de ${certificados.length} certificado(s) de esta obra`}
          falta="Todavía no hay ningún certificado cargado."
        />
        <Linea
          concepto="Facturado"
          valor={plan.facturado == null ? null : plata(plan.facturado)}
          origen="certificados con fecha y monto de facturación"
          falta="Ningún certificado tiene facturación cargada."
        />
        <Linea
          concepto="Cobrado"
          valor={plan.cobrado == null ? null : plata(plan.cobrado)}
          origen="certificados con fecha y monto de cobranza"
          falta="Ningún certificado tiene cobranza cargada."
        />
        <Linea
          concepto="Pendiente de certificar"
          valor={plan.pendiente_certificar == null ? null : plata(plan.pendiente_certificar)}
          origen="contratado − certificado"
          falta="Falta el monto contratado: sin contrato no se sabe cuánto queda por certificar."
        />
        <Linea
          concepto="Pendiente de cobrar"
          valor={certificados.length ? plata(plan.pendiente_cobrar) : null}
          origen="certificado − cobrado"
          falta="Sin certificados cargados no hay nada pendiente de cobrar que calcular."
        />
      </Tabla>

      {certificados.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="tabla-certificados" className="w-full min-w-[700px] text-left">
            <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
              <th className="px-4 py-2 font-medium">N°</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Certificado</th>
              <th className="px-3 py-2 text-right font-medium">Facturado</th>
              <th className="px-3 py-2 text-right font-medium">Cobrado</th>
              <th className="px-3 py-2 text-right font-medium"></th>
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
      )}

      <details className="rounded-xl border border-line bg-white" data-testid="alta-certificado">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Cargar un certificado</summary>
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
