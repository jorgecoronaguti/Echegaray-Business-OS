// «EN MANOS DE LA GENTE» FUERA DE COMPRAS — D09 (Analíticas · Caja) y D10 (Economía de la obra).
//
// Acá el efectivo a rendir es UNA cifra, no una operación: se lee y se enlaza a Compras · Efectivo a
// rendir, donde se entrega, se revisa y se devuelve. La cuenta es la de D01 (`quienTieneEfectivo` sobre
// `efectivo_entrega_saldo`): una cifra, una definición.
//
// ═══ LO QUE NO SE DIBUJA, Y POR QUÉ ═══
// · El «2,6 % de lo que salió» de D09: divide una POSICIÓN de hoy por un FLUJO del período elegido. Son dos
//   ventanas de tiempo distintas (regla de oro 3) y el porcentaje no significa nada si el período cambia.
// · En D10, el tramo claro dentro de la barra de materiales y «Queda = plan − real − proyección»: viven en
//   la solapa Economía (`TabEconomia`), que no se tocó. La cifra va aparte y dice que no suma a consumido.
//
// Sin la migración 20260922T1500 lo dice en una línea y no rompe la pantalla que la contiene.

import Link from 'next/link'
import { ddmm, numero, pesos, quienTieneEfectivo } from '../logica/entregas'
import { MIGRACION } from '../logica/formularios'
import { urlEfectivo } from '../logica/url'
import { leerEnManos } from '../services/datos'
import { MONO, V, cifra, eyebrow } from './estilo'

const nota = { fontSize: '12.5px', color: V.apagado, lineHeight: 1.5, paddingLeft: 14, borderLeft: `2px solid ${V.linea}` } as const

export async function EfectivoEnManos({ obra }: { obra?: string }) {
  const lectura = await leerEnManos(obra)
  if (lectura.estado !== 'ok') {
    return (
      <p style={{ fontSize: '12.5px', color: V.tenue }} data-testid="efectivo-en-manos-sin-lectura">
        {lectura.estado === 'falta_migracion'
          ? `Efectivo a rendir todavía no está publicado en esta base (migración ${MIGRACION}).`
          : `No se pudo leer el efectivo en manos de la gente: ${lectura.mensaje}`}
      </p>
    )
  }
  const { total, filas } = quienTieneEfectivo(lectura.entregas, lectura.hoy, obra)
  return obra ? <DeLaObra total={total} filas={filas} /> : <EnCaja total={total} filas={filas} />
}

type Filas = ReturnType<typeof quienTieneEfectivo>['filas']

function Cifra({ rotulo, total, bajada }: { rotulo: string; total: number; bajada: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }} data-testid="efectivo-en-manos-cifra">
      <div style={eyebrow}>{rotulo}</div>
      <div style={{ ...cifra, color: total > 0 ? V.warn : V.tenue }}>{pesos(total)}</div>
      <div style={{ fontSize: '12.5px', color: total > 0 ? V.warn : V.apagado }}>{bajada}</div>
    </div>
  )
}

const cabeza = { display: 'grid', gap: 16, height: 32, alignItems: 'center', borderBottom: `1px solid ${V.lineaFuerte}`, ...eyebrow } as const
const renglon = { display: 'grid', gap: 16, minHeight: 46, alignItems: 'center', borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13.5px' } as const

/** D09 — la cifra y «Quién tiene efectivo, y desde cuándo», dentro de «Lo que se está gastando». */
function EnCaja({ total, filas }: { total: number; filas: Filas }) {
  const cols = 'minmax(0,1.2fr) minmax(0,1.2fr) 110px 60px'
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]" data-testid="caja-efectivo-en-manos">
      <Cifra rotulo="En manos de la gente" total={total}
        bajada={filas.length ? `${filas.length} ${filas.length === 1 ? 'entrega' : 'entregas'} sin rendir · a hoy, no del período` : 'nadie tiene efectivo de la empresa'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Quién tiene efectivo, y desde cuándo</div>
        {filas.length > 0 && (
          <div>
            <div style={{ ...cabeza, gridTemplateColumns: cols }}>
              <div>Persona</div><div>Destino</div><div style={{ textAlign: 'right' }}>Sin rendir</div><div style={{ textAlign: 'right' }}>Días</div>
            </div>
            {filas.map((f) => (
              <Link key={f.codigo} href={urlEfectivo({ entrega: f.codigo })} prefetch={false} style={{ ...renglon, gridTemplateColumns: cols }} data-testid="caja-quien-tiene">
                <span className="truncate">{f.persona}</span>
                <span className="truncate" style={{ color: V.apagado }}>{f.destino}</span>
                {/* SIN ROJO EN LA MÁS VIEJA: el diseño la pintaba «vencida», y no hay plazo (dueño, 22/09). */}
                <span style={{ textAlign: 'right', fontFamily: MONO }}>{numero(f.sinRendir)}</span>
                <span style={{ textAlign: 'right', fontFamily: MONO, color: V.apagado }}>{f.dias}</span>
              </Link>
            ))}
          </div>
        )}
        <div style={nota}>
          Analíticas sólo lee. Para entregar, reclamar o imputar se va a{' '}
          <Link href={urlEfectivo({})} prefetch={false} style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>Compras · Efectivo a rendir</Link>
          {' '}— la fila enlaza ahí.
        </div>
      </div>
    </div>
  )
}

/** D10 — «Proyección · efectivo en manos» y «Efectivo en esta obra». No suma a consumido. */
function DeLaObra({ total, filas }: { total: number; filas: Filas }) {
  const cols = 'minmax(0,1fr) 110px 110px'
  const bajada = filas.length === 1
    ? `${filas[0].persona} · sin rendir desde el ${ddmm(filas[0].desde)}`
    : filas.length ? `${filas.length} personas sin rendir` : 'nadie tiene efectivo de esta obra'
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]" style={{ paddingTop: 24, marginTop: 8, borderTop: `1px solid ${V.linea}` }} data-testid="obra-efectivo-en-manos">
      <Cifra rotulo="Proyección · efectivo en manos" total={total} bajada={bajada} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Efectivo en esta obra</div>
        {filas.length > 0 && (
          <div>
            <div style={{ ...cabeza, gridTemplateColumns: cols }}>
              <div>Quién</div><div style={{ textAlign: 'right' }}>Sin rendir</div><div>Desde</div>
            </div>
            {filas.map((f) => (
              <Link key={f.codigo} href={urlEfectivo({ entrega: f.codigo })} prefetch={false} style={{ ...renglon, gridTemplateColumns: cols }} data-testid="obra-quien-tiene">
                <span className="truncate">{f.persona}</span>
                <span style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 600 }}>{numero(f.sinRendir)}</span>
                <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}>{ddmm(f.desde)} · {f.dias} d</span>
              </Link>
            ))}
          </div>
        )}
        <div style={{ fontSize: '13px', color: V.apagado }}>
          {filas.length ? 'Nadie más tiene efectivo de esta obra' : 'Nadie tiene efectivo de esta obra'}
        </div>
        <div style={nota}>
          Sumarlo a consumido mostraría un gasto que todavía no tiene comprobante: por eso va como cifra propia y
          no entra en lo consumido hasta que su fila de Compras exista.
        </div>
      </div>
    </div>
  )
}
