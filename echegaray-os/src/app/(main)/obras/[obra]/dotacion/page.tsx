// 08 · OBRA DOTACIÓN Y PROYECCIÓN — el motor HH → dotación → duración, visible.
//
// ═══ LA PANTALLA CONTESTA DOS PREGUNTAS OPUESTAS ═══
//
// «Con esta gente, ¿cuándo termino?» y «Para terminar tal día, ¿cuánta gente necesito?». La
// segunda es la que se usa de verdad cuando el cliente pone una fecha, y es la que devuelve
// **no alcanza** cuando el tope del frente lo impide. NULL no es cero: prometer una fecha que el
// tope impide se descubre el día de la entrega.
//
// ═══ LA URL ES LA MEMORIA DEL SIMULADOR, Y «APLICAR AL PLAN» LA CONVIERTE EN PLAN ═══
//
// Las dotaciones elegidas viajan en `?dot=<frente>~<n>`: el mismo link abre la misma simulación del
// otro lado del chat. Mientras están en la URL no son un plan —si el plan cambia debajo, el link
// deja de significar lo que significaba—; se vuelven plan cuando alguien las aplica, y ahí se
// escriben en `dotacion_prevista`, que es la capacidad con la que el motor calcula la duración de
// cada actividad sin cuadrilla asignada.
//
// Desde el Design del 23/08 el stepper NO navega para llegar a esa URL: recalcula en el navegador
// con la misma función pura que corre el servidor y sincroniza la barra de direcciones con
// `replaceState`. Antes cada clic era una vuelta completa —tabla remontada y esqueleto incluido—
// para ver el mismo frente con un número distinto. Ver `SimuladorDotacion.tsx`.
//
// ═══ ESTA PANTALLA NO HABLA DE PLATA ═══
//
// HH, dotación, capacidad y rendimiento NO son dato económico: el jefe de obra los ve. Precio,
// costo y margen no se piden en ninguna de las lecturas.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getCapacidadPonderada, getInsumosCronograma, getPersonasDisponibles,
} from '@/features/obras/services/cronogramaObraService'
import { getObra } from '@/features/obras/services/obrasService'
import { armarCronograma } from '@/features/obras/services/cronogramaMotor'
import {
  dotacionNecesaria, frentesDe, rubrosDe, sumaCompleta, type Frente,
} from '@/features/obras/services/dotacion'
import { aplicarDotacionAlPlan } from '@/features/obras/services/actionsPlan'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { SimuladorDotacion } from '@/features/obras/components/SimuladorDotacion'
import { TablaRubrosHH } from '@/features/obras/components/TablaRubrosHH'
import { Callout } from '@/shared/components/ui'
import { Ayuda } from '@/shared/components/ds'
import { CalendarioObra } from '../../../../../../orquestador/lib/calendario-obra.mjs'

export const dynamic = 'force-dynamic'

type Params = Promise<{ obra: string }>
type Search = Promise<{ dot?: string | string[] }>

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))
const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

/** `?dot=Piso~4&dot=Techo~2`. La dotación se acota a 0–99: un `dot=x~99999` desde la barra de
 *  direcciones no puede hacer que la pantalla dibuje un plantel imposible como si fuera una opción. */
function dotacionesDe(raw: string | string[] | undefined): Record<string, number> {
  const lista = raw === undefined ? [] : (Array.isArray(raw) ? raw : [raw])
  const salida: Record<string, number> = {}
  for (const par of lista) {
    const i = par.lastIndexOf('~')
    if (i <= 0) continue
    const n = Number(par.slice(i + 1))
    if (!Number.isInteger(n) || n < 0 || n > 99) continue
    salida[par.slice(0, i)] = n
  }
  return salida
}

export default async function DotacionObraPage(
  { params, searchParams }: { params: Params; searchParams: Search },
) {
  const { obra: obraId } = await params
  const sp = await searchParams
  const dotaciones = dotacionesDe(sp.dot)
  const supabase = await createClient()

  // LA FICHA DE LA OBRA VIAJA EN EL MISMO `Promise.all`, no en un `await` propio: la cabecera
  // canónica necesita nombre, cliente, etapa y fechas, y `insumos.obra` sólo trae lo que el motor
  // usa para calcular (días hábiles, jornada). Es una consulta más que sale en paralelo con las
  // cuatro que ya salían — la página sigue tardando lo que su lectura más lenta.
  const [{ data: insumos, error }, capacidad, disponibles, perfil, { data: obra }] = await Promise.all([
    getInsumosCronograma(supabase, obraId),
    getCapacidadPonderada(supabase),
    getPersonasDisponibles(supabase, obraId),
    getPerfilActual(supabase),
    getObra(supabase, obraId),
  ])
  // Aplicar la dotación cambia la duración calculada del plan: es de Administración y de la
  // jefatura de obra. La guarda de verdad vive en la acción; esto evita ofrecer el gesto.
  const puedeAplicar = esAdministracion(perfil.data?.rol ?? null)
  if (error?.startsWith(`la obra ${obraId} no existe`)) notFound()
  if (error || !insumos) {
    return <main className="p-4 lg:p-8"><Callout tono="neg">No pude leer la obra: {error ?? 'sin datos'}</Callout></main>
  }
  // Sin ficha no hay cabecera: `getObra` devuelve la ausencia como ausencia y decide quien pregunta.
  if (!obra) notFound()

  const hoy = new Date().toISOString().slice(0, 10)
  const crono = armarCronograma(insumos, 'proyeccion', hoy)
  const calendario = new CalendarioObra(insumos.obra.dias_habiles ?? [1, 2, 3, 4, 5], insumos.noLaborables)
  // El simulador arranca HOY: la pregunta es «si me pongo con N personas, ¿cuándo termino?».
  const desde = calendario.proximoHabil(hoy)
  const frentes = frentesDe(crono.actividades, {
    dotaciones, jornada: crono.jornada, desde,
    sumarDiasHabiles: (d: string, n: number) => calendario.sumarHabiles(d, n),
  })

  const hhPlan = sumar(crono.actividades.map((a) => (a.hh_plan == null ? null : Number(a.hh_plan))))
  const hhReal = sumar(crono.actividades.map((a) => (a.hh_real == null ? null : Number(a.hh_real))))
  // El total de HH que faltan NO admite sumandos ausentes: es el número que fija el plazo.
  const hhRest = sumaCompleta(frentes.map((f) => f.hhRestantes))
  const hhProy = hhRest == null ? null : (hhReal ?? 0) + hhRest

  const finPlan = crono.actividades
    .map((a) => (a.fin_plan ? String(a.fin_plan).slice(0, 10) : null))
    .filter((x): x is string => Boolean(x)).sort().at(-1) ?? null

  // EL CALENDARIO DE LA OBRA VIAJA RESUELTO, NO SUS REGLAS. El stepper recalcula en el navegador y
  // ahí no hay feriados ni no laborables: mandar los días hábiles ya listos es lo que impide que el
  // cliente arme un segundo calendario que el día del feriado diría otra fecha. Se manda sólo lo
  // que el peor caso puede necesitar —el frente más largo con UNA persona— y con techo, porque un
  // frente de 40.000 HH pediría diez años de fechas para una simulación que nadie va a hacer.
  const habiles = diasHabilesDe(calendario, desde, frentes, crono.jornada)
  const idxFinPlan = finPlan ? calendario.indice(desde, finPlan) : null

  return (
    // LA MISMA CABECERA QUE EL WORKSPACE (24/08 · C-CANON §12): una obra es un workspace, y la
    // banda grafito propia de esta pantalla la hacía parecer otra aplicación.
    <main className="min-h-screen bg-canvas pb-10">
      <div className="w-full px-4 pt-6 lg:px-10">
        <CabeceraDeObra
          obraId={obraId}
          obra={obra}
          // Dotación ES Personal — así lo marca el contrato (08): la pregunta que contesta es con
          // cuánta gente se llega, y esa es la solapa donde vive el plantel de la obra.
          vistaActiva="personal"
          pantalla="Dotación y proyección"
          kpis={[
            { rotulo: 'HH plan', valor: n0(hhPlan), falta: 'sin cargar' },
            { rotulo: 'Real', valor: n0(hhReal), falta: 'sin registro' },
            // Sin HH plan no hay base para proyectar: dice «sin base», nunca 0 — un 0 acá se leería
            // «no falta trabajo», que es la afirmación contraria a la verdadera.
            { rotulo: 'Proyectadas', valor: n0(hhProy), falta: 'sin base' },
          ]}
        />
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4 lg:px-10">
        {hhPlan == null && (
          <Callout tono="warn">
            <strong>Ninguna actividad de esta obra tiene HH del análisis cargadas.</strong>{' '}
            El motor de dotación divide HH por capacidad: sin HH no hay días, no hay fecha de fin y
            no hay dotación necesaria. Por eso la columna dice <em>sin dato</em> y no 0 — lo que
            falta es la carga, no el trabajo. Se carga al convertir el presupuesto en plan de obra.
          </Callout>
        )}

        <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <SimuladorDotacion
            obraId={obraId}
            frentes={frentes}
            dotIniciales={dotaciones}
            jornada={crono.jornada}
            habiles={habiles}
            idxFinPlan={idxFinPlan}
            disponibles={disponibles}
            puedeAplicar={puedeAplicar}
            // `.bind`, no una arrow: una función creada en un Server Component no cruza a un
            // componente cliente, compila igual y deja la pantalla en blanco en producción.
            aplicar={aplicarDotacionAlPlan.bind(null, obraId)}
          />

          <div className="flex flex-col gap-4">
            <AlReves hh={hhRest} jornada={crono.jornada} tope={topeMasBajo(frentes)} desde={desde} calendario={calendario} />
            <LimitesReales frentes={frentes} disponibles={disponibles} />
            <div className="rounded-card border border-line bg-surface p-4">
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Capacidad ponderada</h2>
              {/* 22/08/2026 · La explicación del ponderado baja a la ayuda: la lista de factores que
                  sigue ES el dato, y dos líneas de teoría encima la empujaban fuera de la primera
                  mirada cada vez que se abre la pantalla. */}
              <Ayuda titulo="Por qué no se cuentan cabezas" testid="ayuda-capacidad">
                Dos oficiales y dos ayudantes son cuatro personas y 3,2 de capacidad. Contar cabezas
                para dividir HH deja el plan un 20 % optimista.
              </Ayuda>
              {capacidad.data?.length
                ? (
                  <ul className="flex flex-col gap-1">
                    {capacidad.data.map((c) => (
                      <li key={c.nombre} className="flex items-baseline justify-between gap-3">
                        <span className="text-[12px] text-ink-soft">{c.nombre}</span>
                        <span className="text-[12px] text-ink tnum">
                          {c.factor.toLocaleString('es-AR', { minimumFractionDigits: 1 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
                : <p className="text-[12px] text-warn">No pude leer los factores de capacidad.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-ink">Plan · Real · Proyección por rubro</h2>
          {/* 22/08/2026 · De dónde sale la proyección baja a la ayuda. Lo que no se puede esconder
              —que un rubro sin base NO tiene proyección— sigue escrito en la tabla misma, celda por
              celda: la honestidad va en el dato, no en un párrafo encima del dato. */}
          <TablaRubrosHH filas={rubrosDe(crono.actividades)} />
          <Ayuda titulo="De dónde sale la proyección" testid="ayuda-proyeccion-rubros">
            Usa el rendimiento observado donde hay avance y HH reales; donde no lo hay, dice{' '}
            <em>sin base</em>. Nunca el plan disfrazado de proyección.
          </Ayuda>
        </section>
      </div>
    </main>
  )
}

function sumar(vs: (number | null)[]): number | null {
  const hay = vs.filter((v): v is number => v != null)
  return hay.length ? hay.reduce((a, b) => a + b, 0) : null
}

const topeMasBajo = (frentes: Frente[]): number | null => {
  const topes = frentes.map((f) => f.tope).filter((x): x is number => x != null)
  return topes.length ? Math.min(...topes) : null
}

/** El techo de fechas que se le manda al navegador: dos años de trabajo. Más que eso no es una
 *  simulación de dotación, es otra obra — y son 5.000 fechas viajando por cada carga de pantalla. */
const MAX_HABILES = 520

/**
 * LOS DÍAS HÁBILES QUE EL SIMULADOR PUEDE LLEGAR A NECESITAR.
 *
 * El peor caso es UNA persona en el frente más pesado: es la dotación mínima que todavía produce un
 * plazo. Se calcula sobre las HH restantes que ya trae cada frente para no mandar dos años de
 * fechas cuando la obra entera se termina en tres semanas.
 */
function diasHabilesDe(
  calendario: CalendarioObra, desde: string, frentes: Frente[], jornada: number,
): string[] {
  const peor = frentes.reduce((max, f) => {
    if (f.hhRestantes == null) return max
    const dias = Math.ceil(f.hhRestantes / (1 * (jornada || 8))) + f.diasTecnicos
    return Math.max(max, dias)
  }, 1)
  const n = Math.min(MAX_HABILES, Math.max(1, peor))
  return Array.from({ length: n }, (_, i) => calendario.sumarHabiles(desde, i))
}

/**
 * LOS LÍMITES REALES — Design 23/08 · 08.
 *
 * Lo que impide que más gente acorte el plazo, dicho con los números que la obra tiene cargados. No
 * inventa restricciones: un tope que nadie declaró se dice «sin declarar», y ahí el simulador deja
 * subir la dotación hasta el infinito porque nadie escribió dónde está el techo — que es un dato
 * faltante, no un permiso.
 */
function LimitesReales({ frentes, disponibles }: { frentes: Frente[]; disponibles: number | null }) {
  const tope = topeMasBajo(frentes)
  const enTope = frentes.filter((f) => f.limite === 'tope del frente').length
  const sinHH = frentes.filter((f) => f.hhRestantes == null).length
  const filas: { que: string; detalle: string; valor: string; tono: string }[] = [
    {
      que: 'Tope del frente más estrecho',
      detalle: tope == null
        ? 'ninguna actividad declara cuánta gente entra'
        : `${enTope} ${enTope === 1 ? 'frente está' : 'frentes están'} en su tope`,
      valor: tope == null ? 'sin declarar' : String(tope),
      tono: tope == null ? 'text-faint' : (enTope > 0 ? 'text-warn' : 'text-ink'),
    },
    {
      que: 'Plantel de la obra',
      detalle: 'personas con asignación vigente',
      valor: disponibles == null ? 'sin dato' : String(disponibles),
      tono: disponibles == null ? 'text-faint' : 'text-ink',
    },
    {
      que: 'Frentes sin HH cargadas',
      detalle: sinHH === 0 ? 'todos los frentes tienen con qué calcular' : 'no producen plazo con ninguna dotación',
      valor: sinHH === 0 ? 'ok' : String(sinHH),
      tono: sinHH === 0 ? 'text-pos' : 'text-warn',
    },
  ]
  return (
    // La cabecera con hairline y las filas a 11px de padding son las del canónico: son una TABLA
    // de restricciones, no una lista de viñetas, y la cabecera separada es lo que lo dice.
    <div className="overflow-hidden rounded-card border border-line bg-surface" data-testid="limites-reales">
      <div className="flex items-center gap-2 border-b border-surface-sunken px-4 py-2.5">
        <span aria-hidden className="text-[12px] text-warn">⚠</span>
        <h2 className="text-[13px] font-semibold text-ink">Límites reales</h2>
      </div>
      <ul className="flex flex-col">
        {filas.map((f) => (
          <li
            key={f.que} data-limite={f.que}
            className="flex items-center justify-between gap-3 border-b border-surface-sunken px-4 py-2.5 last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] text-ink">{f.que}</span>
              <span className="block text-[11px] text-faint">{f.detalle}</span>
            </span>
            <span className={`shrink-0 font-mono text-[12.5px] font-semibold tabular-nums ${f.tono}`}>{f.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * AL REVÉS: FIJÁ LA FECHA Y EL SISTEMA DICE LA DOTACIÓN — bloque quiet del canónico 08.
 *
 * Va sobre `surface-quiet` y no sobre una tarjeta blanca más: es la MISMA cuenta del simulador
 * corrida al revés, no un segundo dato. La superficie apagada lo dice sin un párrafo.
 *
 * Las fechas se ofrecen sobre el calendario real de la obra —no sobre días corridos— porque la
 * pregunta es cuántos días TRABAJADOS quedan. Y se ofrecen VARIAS y no una: la pregunta real del
 * jefe de obra no es «¿cuánta gente para el 25?» sino «¿a partir de cuándo esto se vuelve posible?».
 */
function AlReves({ hh, jornada, tope, desde, calendario }: {
  hh: number | null; jornada: number; tope: number | null; desde: string; calendario: CalendarioObra
}) {
  const objetivos = [4, 7, 11, 18].map((d) => ({ dias: d, fecha: calendario.sumarHabiles(desde, d - 1) }))
  return (
    <div className="rounded-card border border-line bg-surface-quiet p-4" data-testid="al-reves">
      <h2 className="text-[13px] font-semibold text-ink">Al revés</h2>
      <p className="mb-2.5 mt-0.5 text-[11px] text-muted">Fijá la fecha y el sistema dice la dotación.</p>
      {hh == null && (
        <p className="text-[12px] text-warn">
          Sin HH cargadas no hay cuenta inversa: no se puede decir cuánta gente hace falta para una
          fecha si no se sabe cuánto trabajo queda.
        </p>
      )}
      {hh != null && (
        <ul className="flex flex-col">
          {objetivos.map((o) => {
            const n = dotacionNecesaria(hh, o.dias, jornada, tope)
            return (
              <li
                key={o.dias} data-objetivo={o.dias}
                className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0"
              >
                <span className="min-w-0">
                  {/* LA FRASE ENTERA, no una etiqueta y un número sueltos: «Terminar el 02/09 →
                      necesitás 6 personas» se lee de un saque; «02/09 · 6» hay que armarlo. */}
                  <span className="text-[12.5px] text-ink-soft">Terminar el </span>
                  <span className="font-mono text-[12.5px] text-ink tabular-nums">{fmt(o.fecha)}</span>
                  <span className="block text-[10.5px] text-faint">
                    {o.dias} días hábiles{n == null ? ' · el tope del frente lo impide' : ''}
                  </span>
                </span>
                {/* NULL NO ES CERO: «no alcanza» es una respuesta —el tope del frente impide llegar
                    a esa fecha—, no un dato faltante. Prometer la fecha igual se descubre el día de
                    la entrega. */}
                <span className={`shrink-0 whitespace-nowrap ${n == null ? 'text-[12.5px] font-medium text-neg' : 'text-[12.5px] text-muted'}`}>
                  {n == null
                    ? 'no alcanza'
                    : (
                      <>
                        necesitás{' '}
                        <span className="font-mono text-[17px] font-semibold text-ink tabular-nums">{n}</span>
                        {n === 1 ? ' persona' : ' personas'}
                      </>
                      )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
