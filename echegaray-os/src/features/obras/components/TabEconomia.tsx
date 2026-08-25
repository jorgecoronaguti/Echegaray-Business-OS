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
// ═══ QUÉ CAMBIÓ, Y POR QUÉ (22/08/2026) ═══
//
// El bloque «Resultado» publicaba «Margen actual» = contratado − costo real. No es margen: le falta
// todo lo que queda por gastar, y el costo real de esta casa no incluye la mano de obra (se imputa
// a Estructura). Ahora los números salen de `obra_economia`, que separa VENTA / COSTO OBJETIVO /
// COSTO REAL / COMPROMETIDO / ETC / EAC / MARGEN COTIZADO / MARGEN FINAL PROYECTADO, y publica NULL
// donde no hay base. Sin base, la pantalla dice «Margen proyectado no disponible» y por qué — no
// muestra una resta parcial con nombre de margen.
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
import type { Certificado, EconomiaObra } from '../types'
import type { PlanDeEconomia } from '../services/obrasService'
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
  plan, economia, certificados, crearCert, borrarCert, veComercial = true,
}: {
  /** LAS OCHO COLUMNAS QUE ESTA SOLAPA DIBUJA, no la vista entera: pedir `obra_plan_vs_real`
   *  completa cuesta el doble de trabajo en la base y era parte de por qué el workspace de la obra
   *  se caía por `statement timeout`. El tipo es un `Pick<>` a propósito — agregar acá una lectura
   *  del plan que no esté en `COLUMNAS_PLAN.economia` no compila. */
  plan: PlanDeEconomia | null
  /** El panel económico (`obra_economia`). `null` = no llegó: no se dibuja margen ninguno. */
  economia: EconomiaObra | null
  certificados: Certificado[]
  crearCert: AccionFormulario
  borrarCert: (certificadoId: string) => Promise<ResultadoAccion>
  /**
   * ═══ POR QUÉ ESTO NO ES «OCULTAR UNA COLUMNA» (19/08/2026) ═══
   *
   * El dato ya no llega: la base devuelve NULL a quien no es Administración, y la columna cruda ni
   * siquiera está al alcance de `authenticated`. Este flag NO protege nada — protege Postgres.
   *
   * Lo que arregla es el CARTEL. Sin él, un jefe de obra veía «Contratado —» con la explicación
   * *"Nadie lo cargó todavía"* al lado, que para él es MENTIRA: el contrato puede estar cargado y
   * él no puede verlo. Dar una explicación falsa de una ausencia es peor que no explicarla: fabrica
   * un hecho. Los dos bloques que sólo hablan de contrato, venta y margen no se dibujan.
   */
  veComercial?: boolean
}) {
  if (!plan) return <Callout tono="neg">No pude leer el plan contra real de esta obra.</Callout>

  const e = economia
  const sinObjetivo = e?.costo_objetivo == null
  // `costo_real` llega en 0 cuando la obra existe pero no tiene un solo comprobante imputado. Ese 0
  // es real —la vista lo calcula— pero significa "todavía nadie cargó nada", no "salió gratis".
  const sinComprobantes = !e?.costo_real_n_comprobantes
  const desvioPesos = e && e.costo_objetivo != null && e.costo_real != null && !sinComprobantes
    ? e.costo_real - e.costo_objetivo : null
  // LA COBERTURA DEL COSTO REAL, dicha al lado del número. La mano de obra se carga con rótulos que
  // el diccionario clasifica como Estructura y por eso casi nunca llega a una obra: un costo sin
  // una hora adentro no sostiene ninguna conclusión sobre rentabilidad.
  const sinManoDeObra = !sinComprobantes && !e?.costo_real_mano_de_obra
  /**
   * EXPLICAR MAL UNA AUSENCIA FABRICA UN HECHO — la misma regla del `veComercial` de más abajo.
   *
   * El costo objetivo, el forecast y los dos márgenes salen de fuentes con portero económico
   * (`presupuestos` con RLS `ve_economia()`, `obra_forecast_economico` con el portero adentro). Para
   * el nivel Obras llegan en null SIEMPRE, tenga o no la obra un presupuesto cargado: decirle
   * «esta obra no tiene presupuesto» sería afirmar algo que esta pantalla no puede saber.
   */
  const falta = (razon: string) =>
    veComercial ? razon : 'Sale del presupuesto de la obra, que no llega a este nivel.'

  return (
    <div className="space-y-6">
      {/* Cuatro bloques en dos columnas: entran en una pantalla sin scroll y se comparan de un vistazo.
          Sin recuadro por bloque — son cuatro listas de definición, no cuatro tarjetas. */}
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {veComercial && (
        <Bloque titulo="Venta" testid="economia-contrato">
          <Linea
            concepto="Contratado"
            valor={e?.venta_contratada == null ? null : plata(e.venta_contratada)}
            origen="El monto del contrato de la obra. Se carga en Resumen › Editar la obra."
            falta="Nadie lo cargó todavía. Se carga en Resumen › Editar la obra."
          />
          <Linea
            concepto="Adicionales aprobados"
            valor={e?.adicionales_aprobados == null ? null : plata(e.adicionales_aprobados)}
            origen={`${e?.n_adicionales_aprobados ?? 0} adicional(es) con fecha y monto de aprobación. Los cotizados sin aprobar no suman: todavía no son venta.`}
            falta="Ningún adicional aprobado en esta obra."
          />
          <Linea
            concepto="Venta contratada" fuerte
            valor={e?.venta_total == null ? null : plata(e.venta_total)}
            origen="Contrato más adicionales aprobados: lo que el cliente debe pagar por esta obra."
            falta="Falta el monto contratado."
          />
        </Bloque>
        )}

        <Bloque titulo="Costo" testid="economia-costo">
          <Linea
            concepto="Costo objetivo"
            valor={e?.costo_objetivo == null ? null : plata(e.costo_objetivo)}
            origen={e?.costo_objetivo_origen ?? 'Lo que se cotizó que iba a costar.'}
            falta={falta('Sin presupuesto: no hay contra qué medir el gasto.')}
          />
          <Linea
            concepto="Costo real a hoy"
            valor={sinComprobantes ? null : plata(e?.costo_real ?? null)}
            origen={`Comprobantes de Compras imputados a esta obra${
              e?.costo_real_n_comprobantes ? ` (${e.costo_real_n_comprobantes}).` : '.'
            } Es lo que se logró imputar, no todo lo que la obra consumió.`}
            falta="Ningún comprobante imputado. No es que costó $0."
          />
          {sinManoDeObra && (
            <p className="py-1 text-[11px] leading-snug text-warn" data-testid="costo-sin-mano-de-obra">
              Sin una hora adentro: la mano de obra de esta obra está imputada a Estructura. El costo
              real está incompleto y ningún margen calculado sobre él es defendible.
            </p>
          )}
          <Linea
            concepto="Costo comprometido"
            valor={e?.costo_comprometido == null ? null : plata(e.costo_comprometido)}
            origen="Lo pedido y todavía no facturado."
            falta={e?.costo_comprometido_estado ?? 'No disponible.'}
          />
          <Linea
            concepto="Desvío contra el objetivo"
            valor={desvioPesos == null ? null
              : `${desvioPesos > 0 ? '+' : ''}${plata(desvioPesos)}` +
                (pct(desvioPesos, e?.costo_objetivo) ? ` · ${pct(desvioPesos, e?.costo_objetivo)}` : '')}
            origen="Costo real menos costo objetivo. Positivo = se gastó de más."
            falta={sinComprobantes && !sinObjetivo ? 'Faltan comprobantes imputados.'
              : falta(sinComprobantes ? 'Faltan las dos puntas.' : 'Falta el costo objetivo.')}
            tono={desvioPesos != null && desvioPesos > 0 ? 'neg' : 'pos'}
          />
          <Linea
            concepto="Costo restante proyectado"
            valor={e?.costo_restante_proyectado == null ? null : plata(e.costo_restante_proyectado)}
            origen="Lo que falta gastar para terminar: costo final proyectado menos costo real."
            falta={falta('Sin proyección no hay restante: no se estima lo que falta a ojo.')}
          />
          <Linea
            concepto="Costo final proyectado" fuerte
            valor={e?.costo_final_proyectado == null ? null : plata(e.costo_final_proyectado)}
            origen={e?.base_del_forecast ?? 'Lo que va a costar terminar la obra.'}
            falta={falta(e?.base_del_forecast ?? 'No hay base para proyectar el costo a fin de obra.')}
          />
        </Bloque>

        {/* CERTIFICAR ES FACTURARLE AL CLIENTE: es precio, no costo. Antes se dibujaba para todos y
            al jefe de obra le quedaban cuatro líneas vacías y un botón que la base iba a rechazar —
            un control que no puede funcionar es peor que un control que no está. */}
        {/* ═══ POR QUÉ LA CERTIFICACIÓN SIGUE DETRÁS DEL PRECIO (20/08/2026) ═══

            El 19/08 quedó escrito en un test que el dueño había declarado la certificación
            «operativa» y que el jefe de obra tenía que verla. Ese día se abrió el bloque acá y el
            test se puso verde. Medido hoy contra la base, con el token de un jefe:

              obra_plan_vs_real → certificado: null · facturado: null · cobrado: null
              certificados      → `certificados_select` es `ve_economia()`: cero filas

            O sea que el bloque no le mostraría la certificación: le mostraría CUATRO GUIONES, cada
            uno con su explicación —«Todavía no hay ningún certificado cargado»— sobre una obra que
            sí podría tenerlos. Es exactamente la explicación falsa de una ausencia que el resto de
            esta pantalla existe para evitar.

            Abrir el bloque sin abrir el dato no es mostrar: es mentir con más celdas. Si el dueño
            quiere que la vea, lo que se mueve primero es `certificados_select` y la máscara de
            `obra_plan_vs_real`; esta línea va detrás, nunca adelante. */}
        {veComercial && (
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
          {/* COBRADO Y POR COBRAR SALEN DE COBRANZAS, no de `certificados`. Mientras salían de ahí,
              quattropani mostraba «cobrado —» y «pendiente 0» con $79,3M cobrados y $59,1M
              agendados: un cero calculado sobre dos ausencias afirmaba que no quedaba nada por
              cobrar. Van con IVA porque es lo que entra al banco. */}
          <Linea
            concepto="Cobrado"
            valor={plan.cobrado == null ? null : plata(plan.cobrado)}
            origen="Cobranzas con estado cobrado y fecha ya pasada, con IVA: lo que entró al banco."
            falta="No hay ninguna cobranza cargada para esta obra."
          />
          <Linea
            concepto="Por cobrar (proyectado)" fuerte
            valor={plan.por_cobrar_proyectado == null ? null : plata(plan.por_cobrar_proyectado)}
            origen="Cobranzas agendadas y todavía no cobradas. Es una proyección de entrada, no una resta contable."
            falta="No hay ninguna cobranza cargada para esta obra."
            tono={plan.por_cobrar_proyectado ? 'warn' : 'ink'}
          />
          <Linea
            concepto="Pendiente de certificar"
            valor={plan.pendiente_certificar == null ? null : plata(plan.pendiente_certificar)}
            origen="Contratado menos certificado: lo que queda por certificar del contrato."
            falta="Falta el monto contratado."
          />
        </Bloque>
        )}

        {/* ═══ POR QUÉ NO HAY «MARGEN ACTUAL» (22/08/2026) ═══

            Había uno y era `contratado − costo real`: sobre quattropani daba $64.713.000 —66% de
            rentabilidad— con TRES facturas de materiales imputadas, la obra al 86% de avance y una
            hora registrada. No era un error de cálculo: la resta da eso. Estaba mal NOMBRADO, y el
            nombre es lo que decide.

            Un margen necesita las dos puntas cerradas: la venta entera y el costo ENTERO, que
            incluye lo que falta gastar. Sin forecast no hay margen a fin de obra, y publicar la
            resta parcial con nombre de margen es peor que no publicar nada — la ausencia se
            investiga, un número cómodo se cree. */}
        {veComercial && (
        <Bloque titulo="Margen" testid="economia-resultado">
          <Linea
            concepto="Margen cotizado" fuerte
            valor={e?.margen_cotizado == null ? null
              : `${plata(e.margen_cotizado)}${pct(e.margen_cotizado, e.venta_total) ? ` · ${pct(e.margen_cotizado, e.venta_total)}` : ''}`}
            origen="Venta contratada menos costo objetivo: el margen con el que se vendió la obra."
            falta={e?.venta_total == null
              ? 'Margen cotizado no disponible: falta el monto contratado.'
              : 'Margen cotizado no disponible: esta obra no tiene costo objetivo (ni presupuesto congelado ni presupuesto cargado).'}
            tono={e?.margen_cotizado != null && e.margen_cotizado < 0 ? 'neg' : 'ink'}
          />
          <Linea
            concepto="Margen final proyectado" fuerte
            valor={e?.margen_final_proyectado == null ? null
              : `${plata(e.margen_final_proyectado)}${pct(e.margen_final_proyectado, e.venta_total) ? ` · ${pct(e.margen_final_proyectado, e.venta_total)}` : ''}`}
            origen="Venta contratada menos costo final proyectado: con qué margen va a terminar la obra."
            falta={`Margen proyectado no disponible. ${
              e?.venta_total == null ? 'Falta el monto contratado.'
                : e?.base_del_forecast ?? 'No hay base para proyectar el costo a fin de obra.'
            }`}
            tono={e?.margen_final_proyectado != null && e.margen_final_proyectado < 0 ? 'neg' : 'ink'}
          />
          <Linea
            concepto="Margen del presupuesto"
            valor={plan.margen_esperado == null ? null
              : `${plata(plan.margen_esperado)}${pct(plan.margen_esperado, plan.monto_presupuestado) ? ` · ${pct(plan.margen_esperado, plan.monto_presupuestado)}` : ''}`}
            origen="El margen que declara el presupuesto aprobado, sobre la venta cotizada."
            falta="Sale del presupuesto, y esta obra no tiene uno cargado."
          />
        </Bloque>
        )}
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

      {veComercial && (
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
      )}
    </div>
  )
}
