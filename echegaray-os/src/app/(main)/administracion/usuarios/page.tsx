// U v2 · USUARIOS Y ACCESOS — quién entra al sistema, con qué nivel y a qué obras.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// La anatomía y el estado. Antes: `PageShell` + la barra del área + una tabla en caja dentro de un
// componente de cliente que guardaba el texto, el filtro, la fila abierta y el alta en `useState`.
// El v2 abre con la miga «Mi cuenta / Usuarios y accesos» —esta pantalla bajó al menú de la cuenta,
// no es una sección del área—, pone el nombre a 24px con «Invitar» como única primaria, y TODO el
// estado viaja en la URL: `?q=`, `?f=`, `?u=<id>`, `?alta=1`.
//
// Que el estado esté en la dirección no es prolijidad: es que «mirá los permisos de éste» se pueda
// mandar por chat, que el botón de atrás cierre el panel y que recargar no vuelva al principio.
//
// ═══ LA COLUMNA `$` ES LA QUE FALTABA ═══
//
// Permiso operativo y permiso económico son dos capacidades distintas. La lista mostraba el nivel y
// había que saberse de memoria cuál de los cinco ve margen; ahora tiene columna propia.
//
// ═══ ESTA PANTALLA ES LA QUE LLENA LA TABLA DE LA QUE DEPENDE TODO EL RLS ═══
//
// `ve_obra()` —la función que citan las policies de obras, actividades, asignaciones, restricciones,
// documentos y las cuatro tablas de Operación— contesta mirando `usuario_obra`. Asignar una obra
// desde acá le abre la obra a esa persona EN LA BASE, y quitarla se la cierra.
//
// ═══ EL CONTROL DE ACCESO DE LA PANTALLA NO ES EL CONTROL DE ACCESO ═══
//
// El `if` de abajo evita que un jefe de obra vea la lista de cuentas. No protege NADA más: las
// acciones de escritura viven en `usuariosActions.ts` y cada una vuelve a preguntar quién llama,
// porque una acción de servidor se puede invocar sin abrir jamás esta página.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, nombresDeConfiguracionSupabase } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { IconoCrear } from '@/shared/components/iconos'
import { BuscadorFilo } from '@/shared/components/v2/BuscadorFilo'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { PanelFilo, V } from '@/shared/components/v2/patron'
import { AccionPrimaria, Migas, TituloDeFicha } from '@/shared/components/v2/segundoNivel'
import {
  listarObrasElegibles, listarPersonasVinculables, listarUsuarios,
} from '@/features/usuarios/services/usuariosService'
import { TablaUsuarios } from '@/features/usuarios/components/TablaUsuarios'
import { AltaUsuario } from '@/features/usuarios/components/AltaUsuario'
import { PanelUsuario } from '@/features/usuarios/components/PanelUsuario'
import { coincide, FILTROS, esFiltro, type Filtro } from '@/features/usuarios/services/filtroUsuarios'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/usuarios'

type Busqueda = { q?: string; f?: string; u?: string; alta?: string }

const href = (sp: Busqueda, cambios: Busqueda = {}) => {
  const j = { ...sp, ...cambios }
  const p = new URLSearchParams()
  for (const k of ['q', 'f', 'u', 'alta'] as const) if (j[k]) p.set(k, j[k] as string)
  const qs = p.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
}

/** El marco de las tres salidas cortas: sin permiso, sin configuración y la pantalla real. */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col" style={{ background: V.fondo }}>
      {/* «Mi cuenta» y no la barra del área: el screen map baja Usuarios al menú de la cuenta. */}
      <Migas volverA="/mi-cuenta" padre="Mi cuenta" actual="Usuarios y accesos" />
      {children}
    </main>
  )
}

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])

  // Cambiar un rol es la puerta a la economía: queda en Dirección y Administración aunque el jefe
  // de obra ya entre al resto de Administración.
  if (!usuario || !veEconomia(perfil.data?.rol)) {
    return (
      <Marco>
        <TituloDeFicha titulo="Usuarios y accesos" bajada="Sólo Dirección y Administración gestionan las cuentas del sistema." />
        <div style={{ padding: '16px 20px' }}>
          <Aviso tono="info">No tenés permiso para ver esta pantalla.</Aviso>
        </div>
      </Marco>
    )
  }

  // ═══ UNA PANTALLA EN BLANCO NO DICE QUÉ FALTA (19/08/2026) ═══
  //
  // Es la ÚNICA pantalla del sistema que necesita la clave de servicio: llama a
  // `auth.admin.listUsers`, porque las cuentas viven en el esquema `auth`. Si esa variable no está,
  // `createAdminClient()` tira y Next devuelve un 500 con el mensaje omitido — así que el
  // administrador ve «This page couldn't load» y no tiene forma de saber qué hacer. Se atrapa y se
  // NOMBRA lo que falta: el nombre de la variable no es un secreto; su valor sí, y no se toca.
  let lista: Awaited<ReturnType<typeof listarUsuarios>>
  let obras: Awaited<ReturnType<typeof listarObrasElegibles>>
  let personas: Awaited<ReturnType<typeof listarPersonasVinculables>>
  try {
    const admin = createAdminClient()
    ;[lista, obras, personas] = await Promise.all([
      listarUsuarios(admin),
      listarObrasElegibles(admin),
      listarPersonasVinculables(admin),
    ])
  } catch {
    const presentes = nombresDeConfiguracionSupabase()
    return (
      <Marco>
        <TituloDeFicha titulo="Usuarios y accesos" bajada="Esta pantalla no puede abrir porque le falta una variable de entorno." />
        <div className="max-w-[680px]" style={{ padding: '16px 20px' }} data-testid="usuarios-sin-configuracion">
          <Aviso tono="neg" titulo="Falta la clave de servicio de Supabase">
            <p>
              Falta la <strong>clave de servicio de Supabase</strong> en las variables de entorno de
              este despliegue. Es la única pantalla que la necesita: las cuentas viven en el esquema
              de autenticación y no se pueden leer con la sesión de una persona.
            </p>
            <p className="mt-2">
              Se crea en <strong>Vercel → el proyecto → Settings → Environment Variables</strong>, con
              el nombre <strong>SUPABASE_SERVICE_ROLE_KEY</strong>, marcada para{' '}
              <strong>Production</strong> (y Preview si se usa), y después hay que volver a desplegar.
              El valor sale de <strong>Supabase → Project Settings → API → service_role</strong>.
            </p>
            {/* Sólo los NOMBRES que existen. Un nombre de variable no es un secreto; su valor sí, y
                acá no se lee ninguno. Sirve para distinguir «no está» de «está con otro nombre». */}
            <p className="mt-2 text-[12px]">
              Variables de Supabase presentes en este despliegue:{' '}
              {presentes.length ? <code>{presentes.join(' · ')}</code> : 'ninguna'}.
            </p>
          </Aviso>
        </div>
      </Marco>
    )
  }

  const todos = lista.data ?? []
  const filtro: Filtro = esFiltro(sp.f) ? sp.f : 'todos'
  const visibles = todos.filter((u) => coincide(u, sp.q ?? '', filtro))
  const alta = sp.alta === '1'
  // La cuenta abierta se busca en la lista COMPLETA: escribir en el buscador no puede cerrar de
  // golpe el panel que se estaba mirando.
  const abierto = alta ? null : todos.find((u) => u.id === sp.u) ?? null
  const sinNivel = todos.filter((u) => u.rol === null).length

  return (
    <Marco>
      <TituloDeFicha
        titulo="Usuarios y accesos"
        bajada="Quién entra, con qué nivel y a qué obras."
        acciones={
          <AccionPrimaria
            href={href(sp, { alta: '1', u: undefined })} testid="abrir-alta"
            icono={<IconoCrear className="h-[14px] w-[14px]" />}
          >
            Invitar
          </AccionPrimaria>
        }
      />

      {lista.error && (
        <div style={{ padding: '14px 20px 0' }}>
          <Aviso tono="neg" titulo="No pude leer las cuentas">{lista.error}</Aviso>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'stretch', padding: '22px 20px 0' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', rowGap: 12 }}>
          <FiltrosSuaves
            testid="filtro-usuarios"
            conteo={{ n: visibles.length, total: todos.length }}
            opciones={FILTROS.map((f) => ({
              clave: f.value, etiqueta: f.label, activo: filtro === f.value,
              href: href(sp, { f: f.value === 'todos' ? undefined : f.value, u: undefined, alta: undefined }),
            }))}
          />
          <BuscadorFilo
            accion={RUTA} q={sp.q} placeholder="Buscar cuenta"
            oculto={{ f: sp.f }} testid="buscar-usuario"
          />
        </div>
        {(alta || abierto) && <span className="hidden shrink-0 lg:block lg:w-[420px]" aria-hidden />}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start" style={{ padding: '12px 20px 24px' }}>
        <div className="min-w-0 flex-1">
          <TablaUsuarios
            usuarios={visibles}
            abierto={abierto?.id}
            hrefDe={(id) => href(sp, { u: sp.u === id ? undefined : id, alta: undefined })}
            vacio={lista.error
              ? 'No pude leer las cuentas. Esta pantalla no puede afirmar que no haya ninguna.'
              : 'Ninguna cuenta coincide con lo que buscás.'}
          />

          {/* NO ES UNA PREFERENCIA DE INTERFAZ, Y SE DICE. `usuario_obra` es la tabla que consulta
              `ve_obra()`. Lo que se toca acá cambia lo que esa persona puede LEER de la base, con
              esta pantalla abierta o sin ella. */}
          <p
            style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 12, maxWidth: 800, textWrap: 'pretty' }}
            data-testid="aviso-permisos"
          >
            Permiso operativo y permiso económico son dos capacidades distintas. El jefe de obra
            gestiona tareas, avance, HH, dotación y personal; no ve margen ni precio de venta — y eso
            lo hace cumplir la base, no esta pantalla. Asignar una obra acá le abre esa obra a la
            persona en la base; quitarla se la cierra.
            {sinNivel > 0 && ` Hay ${sinNivel} ${sinNivel === 1 ? 'cuenta' : 'cuentas'} sin nivel asignado: entran, y la base las trata como las menos privilegiadas.`}
          </p>
        </div>

        {alta && (
          <PanelFilo testid="panel-lateral-alta">
            <AltaUsuario cerrarHref={href(sp, { alta: undefined })} />
          </PanelFilo>
        )}
        {abierto && (
          <PanelFilo testid="panel-lateral-usuario">
            <PanelUsuario
              usuario={abierto}
              obras={obras}
              personas={personas}
              esUnoMismo={abierto.id === usuario.id}
              rolActor={perfil.data?.rol ?? null}
              cerrarHref={href(sp, { u: undefined })}
            />
          </PanelFilo>
        )}
      </div>
    </Marco>
  )
}
