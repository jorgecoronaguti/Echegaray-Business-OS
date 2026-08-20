// USUARIOS — QUIÉN ENTRA AL SISTEMA Y QUÉ VE.
//
// ═══ ESTA PANTALLA ES LA QUE LLENA LA TABLA DE LA QUE DEPENDE TODO EL RLS ═══
//
// `ve_obra()` —la función que citan las policies de obras, actividades, asignaciones,
// restricciones, documentos y las cuatro tablas de Operación— contesta mirando `usuario_obra`.
// Hasta hoy esa tabla se llenaba a mano en Supabase. Asignar una obra desde acá le abre la obra a
// esa persona EN LA BASE, y quitarla se la cierra: no es una preferencia de interfaz.
//
// ═══ EL CONTROL DE ACCESO DE LA PANTALLA NO ES EL CONTROL DE ACCESO ═══
//
// Este `if` evita que un jefe de obra vea la lista de cuentas. No protege NADA más: las acciones de
// escritura viven en `usuariosActions.ts` y cada una vuelve a preguntar quién llama, porque una
// acción de servidor se puede invocar sin abrir jamás esta página. La puerta es esto; la cerradura
// está allá.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, nombresDeConfiguracionSupabase } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { PageShell } from '@/shared/components/ui'
import { Aviso } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { listarObrasElegibles, listarUsuarios } from '@/features/usuarios/services/usuariosService'
import { UsuariosManager } from '@/features/usuarios/components/UsuariosManager'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])

  // Cambiar un rol es la puerta a la economía: queda en Dirección y Administración aunque el jefe
  // de obra ya entre al resto de Administración.
  if (!usuario || !veEconomia(perfil.data?.rol)) {
    return (
      <PageShell title="Usuarios" subtitle="Sólo Dirección y Administración gestionan las cuentas del sistema.">
        <NavAdministracion />
        <Aviso tono="info">No tenés permiso para ver esta pantalla.</Aviso>
      </PageShell>
    )
  }

  // ═══ UNA PANTALLA EN BLANCO NO DICE QUÉ FALTA (19/08/2026) ═══
  //
  // Esta es la ÚNICA pantalla del sistema que necesita la clave de servicio: es la que llama a
  // `auth.admin.listUsers`, porque las cuentas viven en el esquema `auth` y no hay forma de leerlas
  // con la sesión de una persona. Si esa variable no está en el entorno, `createAdminClient()` tira
  // y Next devuelve un 500 con el mensaje omitido "para no filtrar detalles sensibles" — así que el
  // administrador ve *"This page couldn't load"* y no tiene forma de saber qué hacer.
  //
  // Medido en producción el 19/08: las trece rutas del MVP abren y ÉSTA daba 500. El resto de la
  // Administración —personas, proveedores, pendientes, clientes— anda, porque entra con la sesión.
  //
  // Se atrapa y se NOMBRA lo que falta. El nombre de la variable no es un secreto; su valor sí, y no
  // se toca. Un fallo de configuración que se explica solo se arregla en un minuto; uno en blanco
  // cuesta una sesión entera de diagnóstico.
  let lista: Awaited<ReturnType<typeof listarUsuarios>>
  let obras: Awaited<ReturnType<typeof listarObrasElegibles>>
  try {
    const admin = createAdminClient()
    ;[lista, obras] = await Promise.all([listarUsuarios(admin), listarObrasElegibles(admin)])
  } catch {
    const presentes = nombresDeConfiguracionSupabase()
    return (
      <PageShell
        title="Usuarios"
        subtitle="Esta pantalla no puede abrir porque le falta una variable de entorno."
      >
        <NavAdministracion />
        <div className="max-w-[680px]" data-testid="usuarios-sin-configuracion">
        <Aviso tono="neg" titulo="Falta la clave de servicio de Supabase">
          <p>
            Falta la <strong>clave de servicio de Supabase</strong> en las variables de entorno de
            este despliegue. Es la única pantalla que la necesita: las cuentas viven en el esquema de
            autenticación y no se pueden leer con la sesión de una persona.
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
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Usuarios"
      subtitle="Quién entra al sistema, con qué nivel y a qué obras."
    >
      <NavAdministracion />
      {lista.error ? (
        <Aviso tono="neg" titulo="No pude leer las cuentas">{lista.error}</Aviso>
      ) : (
        <UsuariosManager
          usuarios={lista.data ?? []} obras={obras}
          actorId={usuario.id} rolActor={perfil.data?.rol ?? null}
        />
      )}
    </PageShell>
  )
}
