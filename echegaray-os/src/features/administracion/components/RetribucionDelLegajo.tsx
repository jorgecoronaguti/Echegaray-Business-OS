// LA SECCIÓN «RETRIBUCIÓN» DEL LEGAJO. Dueño, 16/09/2026: *«quiero que sea una SECCIÓN, y quiero los
// montos totales que se le ha pagado a cada uno en 2026, y valor hora blanco y negro»*.
//
// ═══ QUÉ HAY Y EN QUÉ ORDEN ═══
//
//   1. Lo vigente: $/h negro (pactado), $/h del recibo (blanco) y el básico de convenio — los mismos
//      tres números de la tira de arriba, porque la sección tiene que poder leerse sola.
//   2. El año en cinco cifras: liquidado, consta pagado, negro, blanco, horas.
//   3. La tabla del año, quincena por quincena (mes por mes para un mensual), con lo que la Liquidación
//      calculó para cada una. Cada período enlaza a su quincena en Liquidación: ahí se corrige, acá se lee.
//   4. Los dos historiales de $/h, a la vista y no bajo un `<details>`: eso fue lo que el dueño pidió rehacer.
//
// ═══ SIN TARJETAS, SIN PÁRRAFOS ═══
//
// Las cifras son números con su rótulo chico arriba y aire entre ellos —el dibujo de `DatoDelValorHora`—;
// la trazabilidad va al `title`. La tabla tiene la cabecera y la densidad de los cuadros de Liquidación,
// que es la pantalla contra la que se verifica cada número de ésta.
//
// LA REGLA NO ESTÁ ACÁ: este archivo pinta lo que `retribucionDelLegajo.ts` ya armó.

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { DatoDelValorHora } from './ValorHoraDelLegajo'
import type { DatoDelRotulo, RotuloValorHora } from '../services/valorHoraDelLegajo'
import type { CifraDelAnio, FilaDeRetribucion, RetribucionDelLegajo as Retribucion } from '../services/retribucionDelLegajo'
import { avisoDeExcedente } from '../services/pagoDeLaQuincena'
import { horas, pesos } from './liquidacion/formato'

const COLUMNAS: readonly { rotulo: string; titulo: string }[] = [
  { rotulo: 'Período', titulo: 'La quincena (o el mes, para un mensual). Enlaza a su quincena en Liquidación.' },
  { rotulo: 'Horas', titulo: 'Las horas cargadas que tomó la Liquidación.' },
  { rotulo: '$/h negro', titulo: 'El $/h pactado vigente en esa quincena; para un mensual, el neto del mes.' },
  { rotulo: 'Negro', titulo: 'Lo que el recibo no paga.' },
  { rotulo: 'Banco', titulo: 'El neto del recibo: real, o estimado y marcado «est.». En una quincena sellada, lo girado que vio el extracto.' },
  { rotulo: 'Total', titulo: 'Banco + negro.' },
  { rotulo: 'Pagado', titulo: 'Lo que consta pagado: adelantos, giros y lo registrado en la Liquidación (banco + efectivo).' },
  { rotulo: 'Saldo', titulo: 'Total − pagado. Negativo = cobró de más por un lado; pasa al otro.' },
]

const ROTULO: CSSProperties = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
  color: V.tenue, whiteSpace: 'nowrap',
}

const cifraComoDato = (c: CifraDelAnio): DatoDelRotulo => ({
  rotulo: c.rotulo, valor: c.valor, falta: c.falta ?? null, detalle: null,
  tono: c.valor === null ? 'falta' : 'normal', titulo: c.titulo ?? null,
})

function Celda({ children, izquierda = false, fuerte = false, title, tono, colSpan }: {
  children?: ReactNode; izquierda?: boolean; fuerte?: boolean; title?: string; tono?: string; colSpan?: number
}) {
  return (
    <td title={title} colSpan={colSpan} style={{
      textAlign: izquierda ? 'left' : 'right', fontSize: '12.5px', fontWeight: fuerte ? 600 : 400,
      color: tono ?? (fuerte ? V.tinta : V.tintaSuave), padding: '9px 8px', whiteSpace: 'nowrap',
      borderBottom: `1px solid ${V.lineaFila}`,
    }}>{children}</td>
  )
}

/** Una quincena (o un mes) del año. Lo que falta se escribe con su motivo, nunca como $0. */
function FilaDelAnio({ f, hrefLiquidacion }: { f: FilaDeRetribucion; hrefLiquidacion: string }) {
  const periodo = (
    <>
      <Link href={`${hrefLiquidacion}${f.desde}`} style={{ color: V.tinta, textDecoration: 'none' }}>{f.periodo}</Link>
      <span style={{ marginLeft: 8, fontSize: '11px', color: V.tenue }}>
        {f.estado === 'cerrada' ? 'cerrada' : f.estado === 'abierta' ? 'abierta' : ''}
      </span>
    </>
  )
  if (!f.pago) {
    return (
      <tr data-testid="retribucion-fila" data-estado="fuera">
        <Celda izquierda>{periodo}</Celda>
        <Celda colSpan={7} izquierda tono={V.tenue}>fuera del plantel de esta quincena</Celda>
      </tr>
    )
  }
  const p = f.pago
  const negativo = p.saldoTotal != null && p.saldoTotal < 0
  const referencia = f.reciboReal != null && f.reciboReal !== p.banco
    ? `recibo real del período: ${pesos(f.reciboReal)} — no es lo que tomó esta quincena` : undefined
  return (
    <tr data-testid="retribucion-fila" data-estado={f.estado}>
      <Celda izquierda>{periodo}</Celda>
      <Celda>{horas(f.horas)}</Celda>
      <Celda tono={f.sinTarifa ? V.warn : undefined} title={f.sinTarifa ? 'sin tarifa vigente en persona_tarifa' : undefined}>
        {f.sinTarifa ? 'sin tarifa' : f.mensual ? `${pesos(f.tarifa)} / mes` : pesos(f.tarifa)}
      </Celda>
      <Celda>{pesos(p.negro)}</Celda>
      {f.sinNeto
        ? <Celda tono={V.warn} title="La Liquidación no pudo afirmar el neto de esta quincena: no hay recibo ni estimado.">sin neto</Celda>
        : (
          <Celda title={referencia ?? (f.bancoEstimado ? 'neto estimado: todavía no hay recibo real de este período' : undefined)}>
            {pesos(p.banco)}{f.bancoEstimado && <span style={{ marginLeft: 4, fontSize: '11px', color: V.tenue }}>est.</span>}
          </Celda>
        )}
      <Celda fuerte title={f.sinNeto ? 'sin neto no se afirma el total' : undefined}>{f.sinNeto ? '—' : pesos(p.total)}</Celda>
      <Celda title={`banco ${pesos(p.pagadoBanco)} · efectivo ${pesos(p.pagadoEfectivo)}`}>{pesos(p.pagado)}</Celda>
      <Celda fuerte tono={negativo ? V.warn : undefined} title={avisoDeExcedente(p) ?? undefined}>
        {f.sinNeto ? '—' : pesos(p.saldoTotal)}
      </Celda>
    </tr>
  )
}

function TablaDelAnio({ r, hrefLiquidacion }: { r: Retribucion; hrefLiquidacion: string }) {
  const t = r.totales
  if (r.filas.length === 0) {
    return <p data-testid="retribucion-vacia" style={{ margin: 0, fontSize: '12.5px', color: V.tenue }}>Sin quincenas en {r.anio}.</p>
  }
  return (
    <table data-testid="retribucion-tabla" style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
      <thead>
        <tr>
          {COLUMNAS.map((c, i) => (
            <th key={c.rotulo} title={c.titulo} style={{
              ...ROTULO, textAlign: i === 0 ? 'left' : 'right',
              borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 6px',
            }}>{c.rotulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.filas.map((f) => <FilaDelAnio key={f.desde} f={f} hrefLiquidacion={hrefLiquidacion} />)}
        <tr data-testid="retribucion-total">
          <Celda izquierda fuerte>⇒ {t.liquidadas} {t.liquidadas === 1 ? 'período' : 'períodos'}</Celda>
          <Celda fuerte>{horas(t.horas)}</Celda>
          <Celda />
          <Celda fuerte>{pesos(t.negro)}</Celda>
          <Celda fuerte>{pesos(t.blanco)}</Celda>
          <Celda fuerte>{pesos(t.total)}</Celda>
          <Celda fuerte title={`banco ${pesos(t.pagadoBanco)} · efectivo ${pesos(t.pagadoEfectivo)}`}>{pesos(t.pagado)}</Celda>
          <Celda fuerte tono={t.saldo < 0 ? V.warn : undefined}>{pesos(t.saldo)}</Celda>
        </tr>
      </tbody>
    </table>
  )
}

function ListaDeHistorial({ titulo, testid, filas }: {
  titulo: string
  testid: string
  filas: readonly { clave: string; primero: string; segundo: string; tercero: string | null; title?: string }[]
}) {
  return (
    <div data-testid={testid} style={{ minWidth: 260, flex: '1 1 260px', maxWidth: 520 }}>
      <span style={ROTULO}>{titulo}</span>
      {filas.length === 0
        ? <p style={{ margin: '8px 0 0', fontSize: '12px', color: V.tenue }}>sin historial</p>
        : (
          <ol style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
            {filas.map((f) => (
              <li key={f.clave} title={f.title} style={{
                display: 'flex', alignItems: 'baseline', gap: 16, padding: '5px 0',
                borderTop: `1px solid ${V.lineaFila}`, fontSize: '12px',
              }}>
                <span className="font-mono tabular-nums" style={{ color: V.tenue, minWidth: 92 }}>{f.primero}</span>
                <span className="font-mono tabular-nums" style={{ color: V.tinta, fontWeight: 600 }}>{f.segundo}</span>
                {f.tercero && <span style={{ color: V.apagado }}>{f.tercero}</span>}
              </li>
            ))}
          </ol>
        )}
    </div>
  )
}

function Historiales({ r, rotulo }: { r: Retribucion; rotulo: RotuloValorHora }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 34, rowGap: 20 }}>
      <ListaDeHistorial
        titulo="$/h negro · pactado" testid="historial-negro"
        filas={rotulo.historial.map((f) => ({
          clave: f.desde, primero: f.desde, segundo: f.valor, tercero: f.variacion,
          title: f.origen ? `origen: ${f.origen}` : undefined,
        }))}
      />
      <ListaDeHistorial
        titulo="$/h blanco · recibo" testid="historial-blanco"
        filas={r.historialBlanco.map((f) => ({
          clave: f.periodo, primero: f.periodo, segundo: f.valorHora,
          tercero: [f.categoria, f.variacion].filter(Boolean).join(' · ') || null,
        }))}
      />
    </div>
  )
}

/** LA SECCIÓN ENTERA. `r.puedeVer` ya viene decidido; sin permiso la página no llega hasta acá. */
export function RetribucionDelLegajo({ r, rotulo, hrefLiquidacion, testid = 'bloque-retribucion' }: {
  r: Retribucion
  rotulo: RotuloValorHora
  /** El prefijo del enlace a una quincena de Liquidación: se le pega el `desde`. */
  hrefLiquidacion: string
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div data-testid="retribucion-vigente" style={{ display: 'flex', flexWrap: 'wrap', gap: 34, rowGap: 14 }}>
        <DatoDelValorHora d={rotulo.pactado} />
        <DatoDelValorHora d={rotulo.recibo} />
        <DatoDelValorHora d={rotulo.piso} />
      </div>

      <div data-testid="retribucion-cifras" style={{ display: 'flex', flexWrap: 'wrap', gap: 34, rowGap: 14 }}>
        {r.cifras.map((c) => <DatoDelValorHora key={c.rotulo} d={cifraComoDato(c)} />)}
      </div>

      <TablaDelAnio r={r} hrefLiquidacion={hrefLiquidacion} />

      {(r.totales.sinSaldo > 0 || r.totales.sinNeto > 0) && (
        <p data-testid="retribucion-nota" style={{ margin: '-16px 0 0', fontSize: '11px', color: V.apagado }}>
          {r.totales.sinNeto > 0 && `${r.totales.sinNeto} sin neto afirmado: su banco y su total no están en el pie. `}
          {r.totales.sinSaldo > 0 && `${r.totales.sinSaldo} sin saldo que afirmar, fuera de la suma de negro, blanco y total.`}
        </p>
      )}

      <Historiales r={r} rotulo={rotulo} />

      {r.errores.length > 0 && (
        <p data-testid="retribucion-error" style={{ margin: 0, fontSize: '11px', color: V.warn }}>
          No pude leer {r.errores.join(' · ')}
        </p>
      )}
    </div>
  )
}
