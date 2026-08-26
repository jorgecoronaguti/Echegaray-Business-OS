// 19b v2 · «EN OBRA AHORA» — quién está, desde qué hora y dónde arrancó el día.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// El AGRUPADO. Antes: por estado —«en obra», «sin cerrar», «ya cerraron», «sin registrar»—, que
// contesta «¿quién tiene la jornada abierta?», una pregunta administrativa. El v2 agrupa POR OBRA,
// que es la pregunta que se hace a las siete de la mañana: «¿está completo el equipo del Depósito
// Norte?». El estado no se pierde: viaja en el punto y en la hora de cada tarjeta.
//
// Y el titular pasó a ser un número grande —«12 de 16 fichados hoy»— en vez de una línea de
// subtítulo: es el dato por el que se abre esta pantalla.
//
// ═══ QUIÉN LA VE ═══
//
// Dirección, Administración y Jefe de obra. El nivel campo NO: ni siquiera puede abrir
// `/administracion` (`CAMPO_RUTAS_PERMITIDAS`), y aunque llamara a PostgREST a mano, la policy de
// `asistencia_marca` le devuelve su propia fila y nada más. Esta comprobación es LA PUERTA —evita
// dibujar una pantalla que la base va a vaciar—, no la cerradura.
//
// ═══ LO QUE ESTA PANTALLA NO AFIRMA ═══
//
// «No fichó» no es «ausente», y no se cuenta como falta en ningún lado. Un operario sin teléfono,
// uno que le negó el permiso al GPS y uno que faltó se ven idénticos desde acá. Convertir esa
// ignorancia en una ausencia sería fabricar una novedad de liquidación con cara de dato — y por eso
// el titular publica FICHADOS y nunca ausencias.
//
// Y donde no hay coordenada dice «sin ubicación». Nunca el punto de la obra: un dato inventado se
// ve exactamente igual que uno real, y éste decide discusiones sobre si alguien estaba donde dijo.
//
// ═══ LO QUE EL MOCKUP PIDE Y NO SE DIBUJA ═══
//
//   JEFE DE OBRA al lado del nombre de la obra. Ni `presencia_del_dia` ni `persona_directorio`
//   publican quién la conduce, y ponerlo exigiría una consulta más para un rótulo. Queda pendiente.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { BuscadorFilo } from '@/shared/components/v2/BuscadorFilo'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { V } from '@/shared/components/v2/patron'
import { Migas, TitularDeCola, PantallaV2 } from '@/shared/components/v2/segundoNivel'
import { GrupoDeLaJornada } from '@/features/administracion/components/JornadaPorObra'
import {
  getEsperados, getObrasConGente, getPresencia,
} from '@/features/administracion/services/presenciaService'
import { agrupar, filtrarGrupos } from '@/features/administracion/services/presencia'
import { jornadaPorObra, titularDeLaJornada } from '@/features/administracion/services/presenciaPorObra'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/personas/en-obra'

const hoyISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** El filtro de obra CONSERVA la búsqueda: cambiar de obra no puede vaciar el buscador a espaldas
 *  de quien lo escribió. */
function hrefObra(obraId: string | undefined, q: string | undefined): string {
  const p = new URLSearchParams()
  if (obraId) p.set('obra', obraId)
  if (q) p.set('q', q)
  const qs = p.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
}

export default async function EnObraPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; q?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase, user.id)
  if (!esAdministracion(perfil.data?.rol)) redirect('/obras')

  const { obra, q } = await searchParams
  const fecha = hoyISO()

  const [presencia, esperados, obras] = await Promise.all([
    getPresencia(supabase, fecha, obra),
    getEsperados(supabase, obra),
    getObrasConGente(supabase),
  ])

  if (presencia.error) {
    return (
      <PantallaV2>
        <Migas volverA="/administracion/personas" padre="Personal" actual="En obra ahora" />
        <div style={{ padding: '16px 20px' }}>
          <Aviso tono="neg" titulo="No pude leer la presencia" testid="presencia-error">{presencia.error}</Aviso>
        </div>
      </PantallaV2>
    )
  }

  // DOS CONTEOS DISTINTOS. `todos` dice si HAY jornada de la que hablar; `g`, si la búsqueda
  // encontró a alguien. Sin esa separación, escribir un apellido que no está mostraría el texto de
  // «nadie marcó asistencia hoy» —que es una afirmación sobre la obra, no sobre la búsqueda—.
  const todos = agrupar(presencia.data ?? [], esperados.data ?? [])
  const g = filtrarGrupos(todos, q ?? '')
  const marcas = [...g.enObra, ...g.faltaSalida, ...g.cerradas]
  const jornada = jornadaPorObra(marcas, g.sinRegistrar)
  const hayAlgo = todos.enObra.length + todos.faltaSalida.length + todos.cerradas.length
    + todos.sinRegistrar.length > 0
  const hayResultado = jornada.plantel > 0

  return (
    <PantallaV2>
      <Migas volverA="/administracion/personas" padre="Personal" actual="En obra ahora" />

      {/* EL NÚMERO CUENTA MARCAS HECHAS, no ausencias: hasta que cierre la jornada, sin marca están
          el que no tiene teléfono, el que le negó el permiso al GPS y el que faltó. */}
      <TitularDeCola
        testid="titular-jornada"
        numero={jornada.fichados}
        titulo={`de ${jornada.plantel} fichados hoy`}
        resumen={hayAlgo ? titularDeLaJornada(jornada) : 'Todavía no marcó nadie hoy'}
        derecha={`${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 12px', flexWrap: 'wrap', rowGap: 8 }}>
        <BuscadorFilo
          accion={RUTA}
          q={q}
          placeholder="Buscar persona, categoría u obra"
          oculto={{ obra }}
          testid="buscar-presencia"
        />
        <FiltrosSuaves
          testid="filtro-obra"
          // El conteo es el de la jornada VISIBLE sobre la esperada: dice cuánto de la gente que se
          // esperaba hoy ya está, sin un bloque de totales.
          conteo={{ n: jornada.fichados, total: jornada.plantel }}
          opciones={[
            { clave: 'todas', etiqueta: 'Todas las obras', href: hrefObra(undefined, q), activo: !obra },
            ...(obras.data ?? []).map((o) => ({
              clave: o.id, etiqueta: o.nombre, href: hrefObra(o.id, q), activo: obra === o.id,
            })),
          ]}
        />
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        {!hayAlgo && (
          <p style={{ fontSize: '12.5px', color: V.apagado, maxWidth: 720, lineHeight: 1.6 }} data-testid="jornada-vacia">
            Nadie marcó asistencia hoy y no hay nadie con asignación vigente en esta obra. La marca la
            hace cada persona desde su teléfono, en «Hoy»; las asignaciones las carga Administración
            desde la solapa Personal de la obra.
          </p>
        )}

        {hayAlgo && !hayResultado && (
          <p style={{ fontSize: '12.5px', color: V.apagado }} data-testid="presencia-sin-resultado">
            Nadie de los que hoy están en la jornada coincide con «{q}».
          </p>
        )}

        {jornada.obras.map((o) => (
          <GrupoDeLaJornada
            key={o.obraId ?? o.nombre}
            titulo={o.nombre}
            gente={o.gente}
            conteo={`${o.gente.length} de ${o.esperados}`}
            fraccion={o.esperados === 0 ? 0 : o.gente.length / o.esperados}
            completo={o.gente.length === o.esperados}
            testid="obra-de-la-jornada"
          />
        ))}

        {jornada.sinObra.length > 0 && (
          <GrupoDeLaJornada
            titulo="Fichó sin obra asignada"
            // LA CONSECUENCIA, NO EL ESTADO: la persona está trabajando y su hora no le pesa a
            // ninguna obra, así que el costo de esa obra sale más barato de lo que fue.
            nota="Está trabajando, pero sus horas no van a ninguna obra"
            gente={jornada.sinObra}
            conteo={String(jornada.sinObra.length)}
            tono="warn"
            verbo={{ texto: 'Asignar', href: '/obras' }}
            testid="ficho-sin-obra"
          />
        )}

        {jornada.sinFichar.length > 0 && (
          <GrupoDeLaJornada
            titulo="No fichó"
            nota="Puede no haber marcado todavía: no es una ausencia hasta que cierre la jornada"
            conteo={String(jornada.sinFichar.length)}
            apagado
            gente={jornada.sinFichar.map((e) => ({
              personaId: e.id,
              nombre: e.nombre_completo,
              rol: [e.categoria, e.obra_actual, e.cuadrilla].filter(Boolean).join(' · ') || null,
              entrada: null,
              estado: 'sin_registrar' as const,
              marca: null,
            }))}
            testid="no-ficho"
          />
        )}

        <p
          style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 18, maxWidth: 780, textWrap: 'pretty' }}
          data-testid="nota-jornada"
        >
          Cada tarjeta es una marca real hecha desde el celular de la persona o cargada por el jefe de
          obra. «No fichó» no es «ausente»: la ausencia se declara al cerrar la jornada, y hasta
          entonces afirmarla sería inventar una falta. El jefe de cada obra no se dibuja porque
          ninguna de las dos vistas que alimentan esta pantalla lo publica.
          {' '}
          <Link href="/administracion/personas" style={{ color: V.tinta, fontWeight: 500 }}>
            Ir a Personal →
          </Link>
        </p>
      </div>
    </PantallaV2>
  )
}
