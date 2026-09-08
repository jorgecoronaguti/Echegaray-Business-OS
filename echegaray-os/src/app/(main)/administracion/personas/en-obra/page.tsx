// «EN OBRA AHORA» — DOS HECHOS SEPARADOS: quién fichó, y a quién se le cargó el día.
//
// ═══ EL ERROR QUE ESTA VERSIÓN CORRIGE ═══
//
// El dueño, 08/09/2026: *«una cosa es asistir y otra la carga de horas […] se ve "no fichado"
// cuando sí están todos, pero que no tengan horas cargadas aún no implica que no hayan fichado»*.
//
// La versión anterior leía SÓLO `presencia_del_dia` —que sale de `asistencia_marca`— y publicaba
// «0 de 17 fichados hoy · 17 sin fichar todavía» con diecisiete tarjetas «No fichó» debajo. Medido
// el 08/09/2026: `asistencia_marca` tiene CUATRO filas en toda su historia (20 y 25 de agosto),
// contra 339 registros de horas del último mes. El fichaje desde el celular todavía no está en
// uso, y la pantalla convertía esa capacidad sin estrenar en una afirmación diaria sobre gente que
// sí estaba trabajando.
//
// Ahora hay dos bloques y NUNCA se suman:
//
//   FICHAJE      `presencia_del_dia` ← `asistencia_marca`. Marcas de entrada/salida de la persona.
//                Sin una sola marca se dice UNA vez, arriba y en neutro. Cero tarjetas.
//   ASISTENCIA   `registros_hh` del día. Lo que carga el jefe o Administración: horas por obra,
//                ausencias y licencias declaradas, y quién queda «sin cargar todavía».
//
// ═══ LO QUE ESTA PANTALLA SIGUE SIN AFIRMAR ═══
//
// «Sin cargar» no es «ausente», y no se cuenta como falta en ningún lado. La ausencia es una
// decisión de alguien y deja su propia fila con `tipo_hora='ausencia'`. Y donde no hay coordenada
// dice «sin ubicación», nunca el punto de la obra.
//
// ═══ QUIÉN LA VE ═══
//
// Dirección, Administración y Jefe de obra. El nivel campo NO: ni siquiera puede abrir
// `/administracion` (`CAMPO_RUTAS_PERMITIDAS`). Esta comprobación es LA PUERTA —evita dibujar una
// pantalla que la base va a vaciar—, no la cerradura: `registros_hh` y `asistencia_marca` tienen
// su RLS y mandan ellas.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { BuscadorFilo } from '@/shared/components/v2/BuscadorFilo'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { NotaBloque, RotuloPanel, V } from '@/shared/components/v2/patron'
import { Migas, TitularDeCola, PantallaV2 } from '@/shared/components/v2/segundoNivel'
import { GrupoDeLaJornada } from '@/features/administracion/components/JornadaPorObra'
import { AsistenciaDeLaObra } from '@/features/administracion/components/AsistenciaDelDiaObra'
import {
  getEsperados, getObrasConGente, getPresencia,
} from '@/features/administracion/services/presenciaService'
import { getRegistrosDelDia } from '@/features/administracion/services/asistenciaDelDiaService'
import { getPresenciaDelDia } from '@/features/administracion/services/presenciaDelDiaService'
import {
  asistenciaDelDia, filtrarAsistencia, resumenAsistencia, resumenFichaje, textoFichaje,
} from '@/features/administracion/services/asistenciaDelDia'
import { jornadaPorObra } from '@/features/administracion/services/presenciaPorObra'

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

  // OJO CON EL NOMBRE: `presencia` en esta página es el FICHAJE (`asistencia_marca`) desde antes
  // que existiera `asistencia_dia`. Lo declarado por el jefe se llama `declarada` a propósito: dos
  // cosas distintas no pueden compartir nombre en la pantalla que existe para distinguirlas.
  const [presencia, esperados, obras, registros, declarada] = await Promise.all([
    getPresencia(supabase, fecha, obra),
    getEsperados(supabase, obra),
    getObrasConGente(supabase),
    getRegistrosDelDia(supabase, fecha, obra),
    // LA PRESENCIA DECLARADA POR EL JEFE (`asistencia_dia`, 08/09/2026). Sin filtro de obra: el
    // único de la tabla es (persona, fecha) y quien fue declarado en otra obra sigue estando
    // declarado. Qué se hace con las tres fuentes lo decide `combinarCeldaDia`, no esta página.
    getPresenciaDelDia(supabase, fecha, null),
  ])

  const fallo = presencia.error ?? registros.error
  if (fallo) {
    return (
      <PantallaV2>
        <Migas volverA="/administracion/personas" padre="Personal" actual="En obra ahora" />
        <div style={{ padding: '16px 20px' }}>
          <Aviso tono="neg" titulo="No pude leer la jornada" testid="presencia-error">{fallo}</Aviso>
        </div>
      </PantallaV2>
    )
  }

  const marcas = presencia.data ?? []
  const fichaje = resumenFichaje(marcas)
  // El fichaje se agrupa por obra con la MISMA función de siempre, pero sin lista de esperados: el
  // denominador «0 de 17» era justamente lo que convertía una capacidad sin usar en un reproche.
  const porObraFichaje = jornadaPorObra(marcas, [])

  const dia = asistenciaDelDia({
    esperados: esperados.data ?? [],
    registros: registros.data ?? [],
    presencia: declarada.data ?? [],
  })
  const visible = filtrarAsistencia(dia, q ?? '')
  const hayAlgo = dia.plantel > 0
  const hayResultado = visible.plantel > 0

  return (
    <PantallaV2>
      <Migas volverA="/administracion/personas" padre="Personal" actual="En obra ahora" />

      {/* EL NÚMERO ES LA ASISTENCIA CARGADA, no el fichaje: es el proceso que hoy existe de verdad
          y el que decide las HH de cada obra. El fichaje tiene su propia línea, más abajo. */}
      <TitularDeCola
        testid="titular-jornada"
        numero={visible.conHoras}
        titulo={`de ${visible.plantel} con horas cargadas hoy`}
        resumen={resumenAsistencia(visible)}
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
          conteo={{ n: visible.conHoras, total: visible.plantel }}
          opciones={[
            { clave: 'todas', etiqueta: 'Todas las obras', href: hrefObra(undefined, q), activo: !obra },
            ...(obras.data ?? []).map((o) => ({
              clave: o.id, etiqueta: o.nombre, href: hrefObra(o.id, q), activo: obra === o.id,
            })),
          ]}
        />
      </div>

      <div style={{ padding: '0 20px 24px' }}>
        {/* ── FICHAJE ────────────────────────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 22 }} data-testid="bloque-fichaje">
          <RotuloPanel cuenta={fichaje.hayMarcas ? `${fichaje.entradas}/${fichaje.salidas}` : undefined}>
            Fichaje de hoy
          </RotuloPanel>
          <p
            style={{ fontSize: '12.5px', color: fichaje.hayMarcas ? V.tinta : V.apagado }}
            data-testid="texto-fichaje"
          >
            {textoFichaje(fichaje)}
          </p>

          {fichaje.hayMarcas && (
            <div style={{ marginTop: 12 }}>
              {porObraFichaje.obras.map((o) => (
                <GrupoDeLaJornada
                  key={o.obraId ?? o.nombre}
                  titulo={o.nombre}
                  gente={o.gente}
                  conteo={String(o.gente.length)}
                  testid="obra-de-la-jornada"
                />
              ))}
              {porObraFichaje.sinObra.length > 0 && (
                <GrupoDeLaJornada
                  titulo="Fichó sin obra en la marca"
                  // LA CONSECUENCIA, NO EL ESTADO: la persona marcó y su hora no le pesa a ninguna
                  // obra, así que el costo de esa obra sale más barato de lo que fue.
                  nota="Marcó, pero la marca no dice en qué obra"
                  gente={porObraFichaje.sinObra}
                  conteo={String(porObraFichaje.sinObra.length)}
                  tono="warn"
                  testid="ficho-sin-obra"
                />
              )}
            </div>
          )}
        </section>

        {/* ── ASISTENCIA DEL DÍA ─────────────────────────────────────────────────────────────── */}
        <section data-testid="bloque-asistencia">
          <RotuloPanel cuenta={hayAlgo ? `${visible.conHoras}/${visible.plantel}` : undefined}>
            Asistencia de hoy · horas cargadas
          </RotuloPanel>

          {!hayAlgo && (
            <p style={{ fontSize: '12.5px', color: V.apagado, maxWidth: 720, lineHeight: 1.6 }} data-testid="jornada-vacia">
              Todavía no hay horas cargadas hoy y no hay nadie con asignación vigente. Las horas las
              carga el jefe de obra o Administración; las asignaciones, la solapa Personal de la obra.
            </p>
          )}

          {hayAlgo && !hayResultado && (
            <p style={{ fontSize: '12.5px', color: V.apagado }} data-testid="presencia-sin-resultado">
              Nadie de los que hoy están en la jornada coincide con «{q}».
            </p>
          )}

          {visible.obras.map((o) => (
            <AsistenciaDeLaObra key={o.obraId ?? o.nombre} obra={o} testid="obra-de-la-asistencia" />
          ))}
        </section>

        <NotaBloque testid="nota-jornada">
          Son dos hechos distintos: el FICHAJE lo marca la persona desde su teléfono (entrada y
          salida) y la ASISTENCIA son las horas que el jefe imputa a la obra — que a alguien no le
          hayan cargado las horas no significa que no haya venido ni que no haya marcado, y por eso
          acá dice «sin cargar» y nunca lo cuenta como falta. La ausencia y la licencia se declaran
          con su motivo al cargar el día.
          {' '}
          <Link href="/administracion/personas" style={{ color: V.tinta, fontWeight: 500 }}>
            Ir a Personal →
          </Link>
        </NotaBloque>
      </div>
    </PantallaV2>
  )
}
