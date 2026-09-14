import { Aviso, Vacio } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { getCostoObraQuincena, type LineaDeCostoObra } from '../../../services/costoObraQuincena'
import { rotuloQuincena, type Quincena } from '../../../services/quincena'
import { ALTO_LIQ } from './tabla'

// PANTALLA 6 · LA QUINCENA CARGADA A LA OBRA (handoff v2).
//
// ═══ UNA SOLA DEFINICIÓN (20260915T0500) ═══
//
// El costo NO se calcula acá: sale de `public.costo_mo_quincena`, la misma función que suma la ficha y
// la cartera del CRM. Costo = recibo del estudio (costo total empleador) + la parte en negro, repartido
// entre obras por horas. Antes esta solapa hacía horas × $/h × multiplicador promedio 1,671 sobre todo
// el $/h y cargaba el mes entero del jefe: Quattropani 01–14/09 daba $6,15 M donde el modelo del dueño
// da ≈ $3,86 M.
//
// ═══ EL CONSUMO % SÓLO EXISTE CON BASE ═══
//
// Sin mano de obra presupuestada dice «sin base», nunca 0 %: un 0 % se lee como «no consumió nada».
//
// ═══ UN FALTA_DATO NO SUMA Y SE NOMBRA ═══
//
// Quien no tiene tarifa no entra al costo ni como cero ni como «parcial»: se escribe con sus horas.

const MONO = "'IBM Plex Mono', monospace"
const miles = (n: number | null): string => (n == null ? '—' : Math.round(n).toLocaleString('es-AR'))
const horas = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** Rojo sólo pasarse del presupuesto; ámbar desde 75 % (criterio declarado del mockup: 31 % verde, 78 % ámbar). */
function colorDelConsumo(consumo: number): string {
  if (consumo > 100) return V.neg
  if (consumo >= 75) return V.warn
  return V.pos
}

const suma = (ls: readonly LineaDeCostoObra[], k: 'costo' | 'blanco' | 'negro'): number | null =>
  ls.some((l) => l[k] != null) ? ls.reduce((s, l) => s + (l[k] ?? 0), 0) : null

export async function SolapaCostoObra({ quincena }: { quincena: Quincena; hoy?: string }) {
  const supabase = await createClient()
  const { lineas, selladoEn, errores } = await getCostoObraQuincena(supabase, quincena)
  const estructura = lineas.find((l) => l.obraId == null) ?? null
  const sinDato = lineas.flatMap((l) => l.sinDato.map((s) => ({ ...s, obra: l.rotulo })))
  return (
    <section data-testid="solapa-costo-obra">
      {errores.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}
      <h3 style={titulo}>La quincena cargada a la obra</h3>
      <p style={bajada}>
        Costo = recibo del estudio (costo total empleador) + la parte en negro, repartido entre obras por horas.
        Las licencias pagas van a la obra asignada ese día. Sin recibo del período todavía, el blanco es estimado.
        {selladoEn
          ? ` Quincena sellada el ${selladoEn.slice(8, 10)}/${selladoEn.slice(5, 7)}.`
          : ' En vivo: se sella al cerrar la quincena.'}
      </p>
      {lineas.length === 0 ? (
        <Vacio>No hay horas ni recibos en esta quincena. Las horas se cargan en la solapa Asistencia.</Vacio>
      ) : (
        <Cuadro quincena={quincena} lineas={lineas} estructura={estructura} />
      )}
      {sinDato.length > 0 && (
        <p data-testid="obras-sin-costo" style={{ fontSize: '11.5px', color: V.warn, margin: '10px 0 0' }}>
          Sin dato, no suman: {sinDato.map((s) => `${s.nombre} ${horas(s.horas)} h en ${s.obra}`).join(' · ')}.
          Falta su tarifa ($/h negro o neto mensual).
        </p>
      )}
    </section>
  )
}

function Cuadro({ quincena, lineas, estructura }: {
  quincena: Quincena; lineas: LineaDeCostoObra[]; estructura: LineaDeCostoObra | null
}) {
  const obras = lineas.filter((l) => l.obraId != null)
  const gente = lineas.reduce((s, l) => Math.max(s, l.gente), 0)
  return (
    <div data-testid="cuadro-costo-obra" style={cuadro}>
      <div style={cabecera}>
        <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{rotuloQuincena(quincena)} · por obra</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <Cifra rotulo="A OBRA" valor={miles(suma(obras, 'costo'))} testid="total-a-obra" />
          <Cifra rotulo="A ESTRUCTURA" valor={miles(estructura?.costo ?? null)} tono={V.warn} testid="total-a-estructura" />
        </div>
      </div>
      {/* A 390 px LAS OCHO COLUMNAS NO ENTRAN: ruedan dentro de su caja y la página no se desborda. */}
      <div className="overflow-x-auto" style={{ padding: '18px 22px 0' }}>
        <div style={{ minWidth: 820, display: 'flex', flexDirection: 'column', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
          <div data-testid="encabezado-obras" style={{ ...renglon, height: ALTO_LIQ.renglonBajo, alignItems: 'end', paddingBottom: 9, borderBottom: `1px solid ${V.linea}`, ...rotuloColumna }}>
            <div>Obra</div>
            <div style={der}>HH</div>
            <div style={der}>Gente</div>
            <div style={der}>Blanco</div>
            <div style={der}>Negro</div>
            <div style={der}>Costo</div>
            <div style={der}>MO presupuestada</div>
            <div style={der}>Consumido</div>
          </div>
          {lineas.map((l) => <FilaDeObra key={l.obraId ?? 'estructura'} l={l} />)}
          <div data-testid="total-obras" style={{ ...renglon, height: ALTO_LIQ.filaTotalAlta, alignItems: 'center', borderTop: `1px solid ${V.grafito}`, fontWeight: 600 }}>
            <div>{obras.length} obra{obras.length === 1 ? '' : 's'} · {gente} persona{gente === 1 ? '' : 's'}</div>
            <div style={der}>{horas(lineas.reduce((s, l) => s + l.horas, 0))}</div>
            <div />
            <div style={der}>{miles(suma(lineas, 'blanco'))}</div>
            <div style={der}>{miles(suma(lineas, 'negro'))}</div>
            <div style={der}>{miles(suma(lineas, 'costo'))}</div>
            {/* NO SE SUMA UN TOTAL DE PRESUPUESTO: el denominador estaría incompleto. */}
            <div />
            <div />
          </div>
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}

function FilaDeObra({ l }: { l: LineaDeCostoObra }) {
  const sinObra = l.obraId == null
  const tituloCosto = l.estimado > 0
    ? `Incluye ${miles(l.estimado)} estimado: quincena sin recibo del estudio todavía (mitad de las horas × piso × factor).`
    : undefined
  return (
    <div data-testid="fila-obra" style={{ ...renglon, minHeight: sinObra ? 58 : 52, alignItems: 'center', borderBottom: `1px solid ${V.linea}`, background: sinObra ? V.hover : undefined }}>
      <div style={{ color: V.tinta }}>
        {l.rotulo}
        {l.sinDato.length > 0 && (
          <span data-testid="obra-sin-tarifa" style={{ marginLeft: 8, fontSize: '11.5px', color: V.warn }}>
            {l.sinDato.length} sin dato
          </span>
        )}
      </div>
      <div style={{ ...der, color: sinObra ? V.warn : V.tinta }}>{horas(l.horas)}</div>
      <div style={{ ...der, color: V.apagado }}>{l.gente}</div>
      <div style={der}>{miles(l.blanco)}</div>
      <div style={der}>{miles(l.negro)}</div>
      <div style={{ ...der, fontWeight: 500, color: sinObra ? V.warn : V.tinta }} title={tituloCosto}>
        {miles(l.costo)}
        {l.estimado > 0 && <span data-testid="costo-estimado" style={{ marginLeft: 4, fontSize: '10.5px', color: V.tenue }}>est.</span>}
      </div>
      <div style={{ ...der, color: V.tenue }}>
        {sinObra ? '—' : l.presupuesto == null
          ? <span data-testid="sin-cargar-mo">sin cargar</span>
          : <span style={{ color: V.apagado }}>{miles(l.presupuesto)}</span>}
      </div>
      <div style={{ ...der, color: l.consumo == null ? V.tenue : colorDelConsumo(l.consumo) }}>
        {sinObra ? '—' : l.consumo == null
          ? <span data-testid="sin-base">sin base</span>
          : `${l.consumo.toLocaleString('es-AR', { maximumFractionDigits: 0 })} %`}
      </div>
    </div>
  )
}

function Cifra({ rotulo, valor, tono, testid }: { rotulo: string; valor: string; tono?: string; testid: string }) {
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: '11px', color: tono ?? V.tenue, fontFamily: MONO, letterSpacing: '.05em' }}>{rotulo}</span>
      <span style={{ fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tono ?? V.tinta }}>{valor}</span>
    </div>
  )
}

const der = { textAlign: 'right' as const }
const titulo = { fontSize: '15px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const bajada = { fontSize: '12.5px', color: V.apagado, margin: '0 0 16px', maxWidth: 760 }
const cuadro = {
  maxWidth: 1240, background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`,
  borderRadius: 10, overflow: 'hidden' as const,
}
const cabecera = {
  padding: '20px 22px 17px', display: 'flex', alignItems: 'flex-end' as const,
  justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' as const,
  borderBottom: `1px solid ${V.linea}`,
}
// `minmax(0,…)` en la primera: a 390 px un mínimo fijo desbordaba el cuadro.
const renglon = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 62px 60px 100px 100px 110px 130px 100px',
  gap: 14,
}
const rotuloColumna = {
  fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue,
  textTransform: 'uppercase' as const,
}
