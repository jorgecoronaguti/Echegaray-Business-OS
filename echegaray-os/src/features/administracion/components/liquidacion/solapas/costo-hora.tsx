import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import {
  alicuotasVigentes, costoDeHora, escaleraDeCategorias, multiplicadorDeCosto,
  CONCEPTOS_COSTO, ROTULO_CONCEPTO,
  type Alicuota, type FilaDeCategoria,
} from '../../../services/costoHora'
import { getAlicuotas, getPlantelParaEscalera, getValorHoraVigente } from '../../../services/costoLecturas'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { totalesDeCuadro } from '../../../services/liquidacionQuincena'
import type { Quincena } from '../../../services/quincena'
import { FilaAlicuota } from './AlicuotaEditor'

// PANTALLA 5 · EL COSTO REAL DE UNA HORA (handoff v2 §5, R9).
//
// Lo que la obra recibe hoy es el $/h de bolsillo, y eso subestima la mano de obra un 52 %. Esta
// pantalla hace visible el multiplicador y quién lo compone.
//
// ═══ LA ESCALERA ARRIBA, EL VERSIONADO ABAJO ═══
//
// El mockup dibuja dos columnas —la cuenta bolsillo→costo a la izquierda, la tabla por categoría a
// la derecha— con las alícuotas como `<input>` sueltos. Un input suelto pisaría la fila vigente, y
// R9 exige lo contrario: cambiar una alícuota GUARDA UNA VERSIÓN con su fecha y su fuente, para que
// la obra vieja conserve la suya. Se resuelven las dos cosas: arriba la escalera del mockup, con la
// alícuota como número; abajo, plegado, el editor que versiona. Plegado porque cargar alícuotas se
// hace tres veces al año y leer el multiplicador, todos los días.
//
// ═══ SIN ALÍCUOTAS NO SE INVENTA UN 1,524 ═══
//
// El número del handoff es el EJEMPLO del dueño, no un default: sembrarlo acá convertiría una
// ilustración en un costo cargado a una obra real. Con la tabla vacía la pantalla dice «sin
// cargar» y qué lo destraba, y el impacto en la quincena no se publica.

const MONO = "'IBM Plex Mono', monospace"

const miles = (n: number | null): string =>
  n == null ? '—' : Math.round(n).toLocaleString('es-AR')

const mult = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const pct = (n: number): string =>
  `${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`

export async function SolapaCostoHora({ quincena, hoy }: { quincena: Quincena; hoy: string }) {
  const supabase = await createClient()
  const [{ alicuotas, errores }, liq, { porPersona, error: errTarifa }] = await Promise.all([
    getAlicuotas(supabase),
    getLiquidacionDeLaQuincena(supabase, quincena),
    getValorHoraVigente(supabase, quincena.hasta),
  ])
  const { personas, error: errPlantel } = await getPlantelParaEscalera(supabase, porPersona)

  // LA FECHA DE LA VERSIÓN ES EL ÚLTIMO DÍA DE LA QUINCENA, NO HOY. Mirar una quincena de marzo
  // tiene que mostrar la alícuota de marzo: es toda la razón por la que la tabla se versiona.
  const vigentes = alicuotasVigentes(alicuotas, quincena.hasta)
  const entero = multiplicadorDeCosto(vigentes, 1)
  const mitad = multiplicadorDeCosto(vigentes, 0.5)
  const escalera = escaleraDeCategorias(personas, entero.valor)

  const bolsillo = liq.cuadros
    .map((c) => totalesDeCuadro(c.lineas).cobra)
    .reduce((s, n) => s + n, 0) || null

  // LA COLUMNA DE LA IZQUIERDA MUESTRA UNA CATEGORÍA CONCRETA, no un promedio: el mockup usa
  // «Ayudante · 3.650». Se toma la de menor bolsillo publicable, que es la que más veces entra en
  // un presupuesto y la que peor queda cuando se cotiza con el $/h de bolsillo.
  const conBolsillo = escalera.filter((f) => f.bolsillo != null)
  const referencia: FilaDeCategoria | undefined = conBolsillo[conBolsillo.length - 1]

  const historial = (c: Alicuota['concepto']): Alicuota[] =>
    alicuotas.filter((a) => a.concepto === c)

  const fallas = [...errores, ...(errTarifa ? [errTarifa] : []), ...(errPlantel ? [errPlantel] : [])]

  return (
    <section data-testid="solapa-costo-hora">
      {fallas.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <h3 style={titulo}>El costo real de una hora</h3>
      <p style={bajada}>
        El $/h de bolsillo no es lo que cuesta la hora; contra el presupuesto se compara este.
      </p>

      <div data-testid="cuadro-costo-hora" style={cuadro}>
        <div data-testid="escalera-costo" style={{ width: 400, maxWidth: '100%', flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: '12.5px', fontWeight: 600 }}>
            {referencia ? referencia.categoria : 'Sin un $/h de referencia'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
            <Escalon rotulo="Bolsillo · lo que se le paga" testid="escalon-bolsillo">
              {referencia
                ? <span style={{ fontWeight: 500 }}>{miles(referencia.bolsillo)}</span>
                : <span style={{ color: V.tenue }}>sin cargar</span>}
            </Escalon>
            {CONCEPTOS_COSTO.map((c) => (
              <Escalon key={c} rotulo={ROTULO_CONCEPTO[c]} testid={`escalon-${c}`}>
                {/* R1 · SIN CARGAR NO ES 0 %. Un cero diría que ese concepto no cuesta nada. */}
                {vigentes[c]
                  ? <span>{pct(vigentes[c]!.porcentaje)}</span>
                  : <span data-testid={`sin-cargar-en-escalera-${c}`} style={{ color: V.tenue }}>sin cargar</span>}
              </Escalon>
            ))}
            <div data-testid="costo-por-hora" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              height: 40, borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
            }}>
              <span>Costo por hora</span>
              <span style={{ fontSize: '15px' }}>
                {miles(costoDeHora(referencia?.bolsillo ?? null, entero.valor))}
              </span>
            </div>
            <div data-testid="multiplicador" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              height: 32, fontSize: '11.5px', color: V.apagado,
            }}>
              <span>Multiplicador</span>
              <span style={{ color: entero.valor == null ? V.warn : V.apagado }}>
                {entero.valor == null ? 'sin cargar' : mult(entero.valor)}
              </span>
            </div>
            {/* EL MATIZ DE LA MITAD DECLARADA — §5. Con mitad recibo / mitad efectivo sólo lo blanco
                genera cargas. No es una opinión: sale de la columna `base` de cada fila cargada. */}
            <div data-testid="mult-mitad" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              height: 32, fontSize: '11.5px', color: V.apagado,
            }}>
              <span>Con mitad recibo / mitad efectivo</span>
              <span>{mitad.valor == null ? 'sin cargar' : mult(mitad.valor)}</span>
            </div>
            {entero.valor == null && (
              <p data-testid="sin-multiplicador" style={{ margin: '10px 0 0', fontSize: '11.5px', color: V.warn }}>
                Faltan las {entero.faltan.length} alícuotas. Cargalas abajo y la obra empieza a
                recibir su costo, no sólo sus horas.
              </p>
            )}
            {entero.valor != null && entero.faltan.length > 0 && (
              <p data-testid="faltan-alicuotas" style={{ margin: '10px 0 0', fontSize: '11.5px', color: V.warn }}>
                Suma lo cargado. Falta: {entero.faltan.map((f) => ROTULO_CONCEPTO[f]).join(', ')}.
              </p>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Lo que cambia al usar el costo y no el bolsillo</div>
          {/* Las tres columnas de números son fijas (86+96+110): a 390 px no entran y no se encogen. */}
          <div className="overflow-x-auto">
          <div style={{ minWidth: 380, display: 'flex', flexDirection: 'column', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
            <div data-testid="encabezado-categorias" style={{ ...renglon, height: 32, alignItems: 'end', paddingBottom: 8, borderBottom: `1px solid ${V.linea}`, ...rotuloColumna }}>
              <div>Categoría</div>
              <div style={{ textAlign: 'right' }}>Bolsillo</div>
              <div style={{ textAlign: 'right' }}>Costo real</div>
              <div style={{ textAlign: 'right' }}>Multiplicador</div>
            </div>
            {escalera.length === 0 && (
              <div style={{ padding: '16px 0', fontSize: '12.5px', color: V.apagado }}>
                Nadie del plantel tiene categoría ni $/h cargados: no hay escalera que dibujar.
              </div>
            )}
            {escalera.map((f) => (
              <div key={f.categoria} data-testid="fila-categoria" style={{ ...renglon, height: 46, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
                <div style={{ color: f.sinCategoria ? V.warn : V.tinta }}>
                  {f.categoria}
                  <span style={{ marginLeft: 8, fontSize: '11.5px', color: V.tenue }}>
                    {f.gente} {f.gente === 1 ? 'persona' : 'personas'}
                  </span>
                </div>
                <div style={{ textAlign: 'right', color: f.bolsillo == null ? V.tenue : V.tinta }}>
                  {/* VARIOS $/h EN LA MISMA CATEGORÍA NO SE PROMEDIAN: el promedio inventa un
                      bolsillo que nadie cobra y la columna de al lado lo multiplica por 1,5. */}
                  {f.bolsillo != null
                    ? miles(f.bolsillo)
                    : <span data-testid="categoria-sin-un-valor">
                        {f.valores.length === 0 ? 'sin tarifa' : `${f.valores.length} valores`}
                      </span>}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 500 }}>{miles(f.costoReal)}</div>
                <div style={{ textAlign: 'right', color: V.apagado }}>{mult(f.costoReal == null ? null : entero.valor)}</div>
              </div>
            ))}
            <div data-testid="quincena-entera" style={{ ...renglon, height: 52, alignItems: 'center', borderTop: `1px solid ${V.grafito}`, fontWeight: 600 }}>
              <div>La quincena entera</div>
              <div style={{ textAlign: 'right' }}>{miles(bolsillo)}</div>
              <div style={{ textAlign: 'right' }}>{miles(costoDeHora(bolsillo, entero.valor))}</div>
              <div />
            </div>
            <div data-testid="quincena-mitad" style={{ ...renglon, height: 32, alignItems: 'center', fontSize: '11.5px', color: V.apagado }}>
              <div>Con mitad recibo / mitad efectivo</div>
              <div />
              <div style={{ textAlign: 'right' }}>{miles(costoDeHora(bolsillo, mitad.valor))}</div>
              <div />
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* R9 · LO QUE EL MOCKUP NO DIBUJA Y LA BASE SÍ EXIGE: cada alícuota con su vigencia, su
          fuente y su historial. Plegado: se abre las tres veces al año que cambia una paritaria. */}
      <details data-testid="alicuotas-detalle" style={{ marginTop: 18 }}>
        <summary style={{ fontSize: '12.5px', color: V.apagado, cursor: 'pointer' }}>
          Alícuotas · fuente, vigencia y versiones
        </summary>
        <p style={{ ...bajada, margin: '10px 0 12px' }}>
          Cambiar una alícuota guarda una versión nueva con su fecha: la obra vieja conserva la suya.
        </p>
        <div className="overflow-x-auto">
        <table style={{ ...tabla, minWidth: 640 }}>
          <thead>
            <tr>
              {['Concepto', 'Alícuota', 'Pesa sobre', 'Rige desde', 'Fuente', ''].map((c, i) => (
                <th key={c} style={{ ...th, textAlign: i === 0 || i === 4 ? 'left' : 'right' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONCEPTOS_COSTO.map((c) => (
              <FilaAlicuota key={c} concepto={c} vigente={vigentes[c]} historial={historial(c)} hoy={hoy} />
            ))}
          </tbody>
        </table>
        </div>
      </details>
    </section>
  )
}

function Escalon({ rotulo, testid, children }: { rotulo: string; testid: string; children: React.ReactNode }) {
  return (
    <div data-testid={testid} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 42, borderBottom: `1px solid ${V.linea}`,
    }}>
      <span style={{ color: V.apagado }}>{rotulo}</span>
      {children}
    </div>
  )
}

const titulo = { fontSize: '15px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const bajada = { fontSize: '12.5px', color: V.apagado, margin: '0 0 16px', maxWidth: 720 }
// EL CUADRO DEL MOCKUP: 1240 px de tope, blanco, borde `line-2`, radio 10, padding 28, gap 48.
// `flexWrap` es lo único que no está en el mockup y es lo que evita que a 390 px las dos columnas
// se compriman a cuarenta píxeles: apiladas, cada una conserva su alto de fila.
const cuadro = {
  maxWidth: 1240, background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`,
  borderRadius: 10, padding: 28, display: 'flex', gap: 48, flexWrap: 'wrap' as const,
}
const renglon = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px 96px 110px', gap: 14,
}
const rotuloColumna = {
  fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue,
  textTransform: 'uppercase' as const,
}
const tabla = { width: '100%', borderCollapse: 'collapse' as const, fontVariantNumeric: 'tabular-nums' as const }
const th = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 8px', height: 30, verticalAlign: 'bottom' as const,
  whiteSpace: 'nowrap' as const,
}
