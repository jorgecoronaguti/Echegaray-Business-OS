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
  frentesDe, rubrosDe, sumaCompleta, TOPE_DOTACION, type Frente,
} from '@/features/obras/services/dotacion'
import { aplicarDotacionAlPlan } from '@/features/obras/services/actionsPlan'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
import { SimuladorDotacion } from '@/features/obras/components/SimuladorDotacion'
import { TablaRubrosHH } from '@/features/obras/components/TablaRubrosHH'
import { Callout } from '@/shared/components/ui'
import { Ayuda, Plegable } from '@/shared/components/ds'
import { CalendarioObra } from '../../../../../../orquestador/lib/calendario-obra.mjs'

export const dynamic = 'force-dynamic'

type Params = Promise<{ obra: string }>
type Search = Promise<{ dot?: string | string[] }>

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))

/** `?dot=Piso~4&dot=Techo~2`. La dotación se acota por `TOPE_DOTACION` —el MISMO tope que usa la
 *  escritura y que la pantalla consulta para no ofrecer un botón que no escribiría nada—: un
 *  `dot=x~99999` desde la barra de direcciones no puede dibujar un plantel imposible como opción. */
function dotacionesDe(raw: string | string[] | undefined): Record<string, number> {
  const lista = raw === undefined ? [] : (Array.isArray(raw) ? raw : [raw])
  const salida: Record<string, number> = {}
  for (const par of lista) {
    const i = par.lastIndexOf('~')
    if (i <= 0) continue
    const n = Number(par.slice(i + 1))
    if (!Number.isInteger(n) || n < 0 || n > TOPE_DOTACION) continue
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
  const rubros = rubrosDe(crono.actividades)
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
      {/* LA BANDA VA DE BORDE A BORDE (mockups 02/03/05/06): el aire de 20px es
          suyo, adentro. Envuelta en el padding de la página quedaba flotando. */}
      <>
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
      </>

      {hhPlan == null && (
        <div className="px-5 pt-3.5">
          <Callout tono="warn">
            <strong>Ninguna actividad de esta obra tiene HH del análisis cargadas.</strong>{' '}
            El motor de dotación divide HH por capacidad: sin HH no hay días, no hay fecha de fin y
            no hay dotación necesaria. Por eso los campos dicen <em>sin dato</em> y no 0 — lo que
            falta es la carga, no el trabajo. Se carga al convertir el presupuesto en plan de obra.
          </Callout>
        </div>
      )}

      {/* ═══ EL CUERPO ES EL DEL CANÓNICO: 428px + resto, y NADA MÁS ARRIBA DEL PLIEGUE ═══
          Había una tercera columna de 300px con «Al revés», «Límites reales» y «Capacidad
          ponderada». «Al revés» dejó de existir como bloque aparte porque el canónico lo absorbió:
          el modo **Duración** ES la cuenta inversa, hecha sobre el frente que se está mirando y con
          sus días técnicos descontados — la versión de la barra lateral corría sobre las HH de toda
          la obra y sin días técnicos, así que las dos podían contestar distinto a la misma
          pregunta. Los límites subieron a la columna derecha, donde el mockup los dibuja. */}
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

      {/* ═══ EL RESPALDO VA PLEGADO, DEBAJO DEL SIMULADOR (24/08 · canónico 08) ═══
          La tabla de rubros mide más alto que el simulador entero y se lee UNA vez —para entender
          de dónde salió el número— no cada vez que se mueve la dotación. Los factores de capacidad
          son de la misma clase: explican por qué cuatro personas no son cuatro, y esa explicación
          se necesita el primer día, no en cada carga de la pantalla. El mockup no dibuja ninguna de
          las dos; sacarlas del todo habría borrado de dónde salen los números de arriba. */}
      <div className="flex flex-col gap-4 px-5 pb-6">
        <Plegable titulo="Plan · Real · Proyección por rubro" testid="rubros-hh-plegable"
          cuenta={rubros.length}>
          {/* 22/08/2026 · De dónde sale la proyección baja a la ayuda. Lo que no se puede esconder
              —que un rubro sin base NO tiene proyección— sigue escrito en la tabla misma, celda por
              celda: la honestidad va en el dato, no en un párrafo encima del dato. */}
          <TablaRubrosHH filas={rubros} />
          <Ayuda titulo="De dónde sale la proyección" testid="ayuda-proyeccion-rubros">
            Usa el rendimiento observado donde hay avance y HH reales; donde no lo hay, dice{' '}
            <em>sin base</em>. Nunca el plan disfrazado de proyección.
          </Ayuda>
        </Plegable>

        <Plegable titulo="Capacidad ponderada" testid="capacidad-plegable"
          cuenta={capacidad.data?.length ?? 0}>
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
        </Plegable>
      </div>
    </main>
  )
}

function sumar(vs: (number | null)[]): number | null {
  const hay = vs.filter((v): v is number => v != null)
  return hay.length ? hay.reduce((a, b) => a + b, 0) : null
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
  // PISO DE 20 DÍAS: el modo **Duración** deja pedir hasta 10 días aunque el frente se haga en uno,
  // y sin fechas para ese pedido la pantalla contestaría «fuera de calendario» a una fecha que la
  // obra sí tiene. Veinte fechas más no se notan; una respuesta falsa sí.
  const n = Math.min(MAX_HABILES, Math.max(20, peor))
  return Array.from({ length: n }, (_, i) => calendario.sumarHabiles(desde, i))
}
