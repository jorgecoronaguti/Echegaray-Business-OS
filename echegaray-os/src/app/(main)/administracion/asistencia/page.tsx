// 19c v2 · CORRECCIONES DE ASISTENCIA — la cola de lo que el plantel pidió corregir.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// Era una lista de bloques con el formulario de resolución REPETIDO en cada fila: cinco pedidos
// dibujaban cinco formularios, y ninguno mostraba contra qué se estaba comparando. El v2 la convierte
// en una COLA con panel: la lista prioriza —cuántas horas mueve cada pedido— y el panel resuelve uno
// con las dos mitades a la vista, «lo que quedó registrado» contra «lo que pide».
//
// Y aparece la columna DIFERENCIA, que es lo que hace priorizable la bandeja: un pedido que suma
// media hora y uno que suma seis no se atienden igual, y hasta hoy los dos se veían idénticos.
//
// ═══ POR QUÉ ES UNA PANTALLA Y NO UN BLOQUE DENTRO DE PERSONAS ═══
//
// `/administracion/personas` es el MAESTRO: quién trabaja acá, con qué legajo y qué categoría. Un
// pedido de corrección no es un atributo de una persona, es una COLA DE TRABAJO con dos salidas
// —aprobar o rechazar— y con antigüedad, que es lo que ordena atenderla. Meterla adentro de la ficha
// de cada persona la volvería invisible: nadie abre sesenta legajos a ver si alguno pidió algo.
//
// ═══ APROBAR ESCRIBE EN LA ASISTENCIA REAL ═══
//
// El botón no cambia el estado del pedido: llama a `aprobar_correccion_asistencia()`, que inserta la
// salida en `asistencia_marca` y recién entonces marca la solicitud, en la misma transacción. La
// prueba de que ocurrió es `marca_id` — se muestra en el panel de las resueltas justamente para que
// el efecto se pueda mirar, en vez de creerle al estado.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { PanelFilo, V } from '@/shared/components/v2/patron'
import { Migas, TitularDeCola, PantallaV2 } from '@/shared/components/v2/segundoNivel'
import { ColaDeCorrecciones, PanelCorreccion } from '@/features/administracion/components/BandejaCorrecciones'
import { getCorrecciones } from '@/features/administracion/services/correccionAsistenciaService'
import { titularDeLaBandeja } from '@/features/administracion/services/bandejaCorrecciones'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/asistencia'

type Busqueda = { ver?: string; c?: string }

const href = (sp: Busqueda, cambios: Busqueda = {}) => {
  const j = { ...sp, ...cambios }
  const p = new URLSearchParams()
  if (j.ver) p.set('ver', j.ver)
  if (j.c) p.set('c', j.c)
  const qs = p.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
}

export default async function CorreccionesAsistenciaPage({ searchParams }: {
  searchParams: Promise<Busqueda>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)

  // LA PUERTA NO ES LA CERRADURA: la policy de `solicitud_correccion_asistencia` y el portero de
  // `aprobar_correccion_asistencia()` deciden de verdad. Este `if` evita mostrarle a alguien del
  // nivel campo una pantalla que le va a salir vacía.
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <PantallaV2>
        <Migas volverA="/administracion" padre="Trabajo" actual="Correcciones de asistencia" />
        <div style={{ padding: '16px 20px' }}>
          <Aviso tono="info">Esta pantalla es de Administración.</Aviso>
        </div>
      </PantallaV2>
    )
  }

  const [pendientes, aprobadas, rechazadas] = await Promise.all([
    getCorrecciones(supabase, 'pendiente'),
    getCorrecciones(supabase, 'aprobada'),
    getCorrecciones(supabase, 'rechazada'),
  ])

  const resueltas = [...(aprobadas.data ?? []), ...(rechazadas.data ?? [])]
    .sort((a, b) => ((a.resuelta_en ?? '') < (b.resuelta_en ?? '') ? 1 : -1))
    .slice(0, 30)

  const verResueltas = sp.ver === 'resueltas'
  const filas = verResueltas ? resueltas : (pendientes.data ?? [])
  const abierta = [...(pendientes.data ?? []), ...resueltas].find((c) => c.id === sp.c) ?? null
  const t = titularDeLaBandeja(pendientes.data ?? [])

  return (
    <PantallaV2>
      <Migas volverA="/administracion" padre="Trabajo" actual="Correcciones de asistencia" />

      {/* EL NÚMERO GRANDE ES LA COLA, NO LO RESUELTO: se abre esta pantalla para saber cuánto falta. */}
      <TitularDeCola
        testid="titular-correcciones"
        numero={(pendientes.data ?? []).length}
        titulo={t.titular}
        resumen={t.subtitular}
        tono={(pendientes.data ?? []).length > 0 ? 'warn' : undefined}
        derecha="La corrige Administración, no el jefe de obra: la HH es la base de la liquidación."
      />

      {pendientes.error && (
        <div style={{ padding: '0 20px 12px' }} data-testid="correcciones-error">
          <Aviso tono="neg" titulo="No pude leer los pedidos">{pendientes.error}</Aviso>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'stretch', padding: '0 20px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FiltrosSuaves
            testid="filtros-correcciones"
            conteo={{ n: filas.length, total: (pendientes.data ?? []).length + resueltas.length }}
            opciones={[
              {
                clave: 'pendientes', etiqueta: 'Sin resolver', activo: !verResueltas,
                href: href(sp, { ver: undefined, c: undefined }),
              },
              {
                clave: 'resueltas', etiqueta: 'Últimas resueltas', activo: verResueltas,
                href: href(sp, { ver: 'resueltas', c: undefined }),
              },
            ]}
          />
        </div>
        {abierta && <span className="hidden shrink-0 lg:block lg:w-[420px]" aria-hidden />}
      </div>

      <div style={{ padding: '12px 20px 24px', display: 'flex', alignItems: 'stretch' }} className="flex-col lg:flex-row">
        <div className="min-w-0 flex-1">
          <ColaDeCorrecciones
            filas={filas}
            abierta={abierta?.id}
            hrefDe={(id) => href(sp, { c: sp.c === id ? undefined : id })}
            // SIN LECTURA NO HAY VACÍO. Un «no hay nada pendiente» cuando la consulta falló afirma
            // algo que no se sabe: el error de arriba ya lo dice y acá no se agrega otra versión.
            vacio={pendientes.error
              ? 'No pude leer los pedidos. Esta pantalla no puede afirmar que no haya ninguno.'
              : verResueltas
                ? 'Todavía no se resolvió ningún pedido.'
                : 'No queda ninguna corrección sin resolver. Los pedidos salen de «Mi información · Asistencia» o del parte del jefe de obra.'}
          />

          <p
            style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 12, maxWidth: 780, textWrap: 'pretty' }}
            data-testid="nota-correcciones"
          >
            Cada pedido lo hace la persona desde su celular o el jefe de obra desde el parte.
            Resolverlo reescribe la marca y recalcula las HH del mes — queda el registro de quién lo
            cambió y por qué. «Marca escrita: NO» en una aprobada es una inconsistencia y hay que
            mirarla: quiere decir que el estado del pedido cambió y la asistencia no. La OBRA del día
            no se dibuja porque la bandeja no la trae, y cruzarla contra la asignación vigente daría
            la obra de hoy y no la del día que se corrige.
          </p>
        </div>

        {abierta && (
          <PanelFilo testid="panel-lateral-correccion">
            <PanelCorreccion c={abierta} cerrarHref={href(sp, { c: undefined })} />
          </PanelFilo>
        )}
      </div>
    </PantallaV2>
  )
}
