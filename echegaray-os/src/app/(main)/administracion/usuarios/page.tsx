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
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { Callout, PageShell } from '@/shared/components/ui'
import { listarObrasElegibles, listarUsuarios } from '@/features/usuarios/services/usuariosService'
import { UsuariosManager } from '@/features/usuarios/components/UsuariosManager'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])

  if (!usuario || !esAdministracion(perfil.data?.rol)) {
    return (
      <PageShell title="Usuarios" subtitle="Sólo Administración gestiona las cuentas del sistema." maxWidth="max-w-2xl">
        <Callout tono="neutral">No tenés permiso para ver esta pantalla.</Callout>
      </PageShell>
    )
  }

  const admin = createAdminClient()
  const [lista, obras] = await Promise.all([listarUsuarios(admin), listarObrasElegibles(admin)])

  return (
    <PageShell
      eyebrow="Administración"
      title="Usuarios"
      subtitle="Quién entra al sistema, con qué rol y a qué obras. Lo que se cambia acá cambia lo que esa persona puede ver."
    >
      {lista.error ? (
        <Callout tono="neg">No pude leer las cuentas: {lista.error}</Callout>
      ) : (
        <UsuariosManager usuarios={lista.data ?? []} obras={obras} actorId={usuario.id} />
      )}
    </PageShell>
  )
}
