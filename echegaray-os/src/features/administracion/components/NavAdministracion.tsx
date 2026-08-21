// LA BARRA DE NIVEL 2 DE ADMINISTRACIÓN — el envoltorio que sabe QUIÉN está mirando.
//
// ═══ POR QUÉ ESTÁ PARTIDA EN DOS (21/08/2026) ═══
//
// Las solapas necesitan dos cosas que viven en lados opuestos: la RUTA ACTUAL, que sólo se sabe en
// el navegador (`usePathname`), y el ROL de quien mira, que sólo se sabe en el servidor. Mientras
// la barra fue un único componente de cliente, el rol no llegaba — y la barra le dibujaba
// «Usuarios» a un jefe de obra que el middleware después rebotaba.
//
// La alternativa era pasarle `rol` desde los trece lugares que la usan. Se descartó: dos de ellos
// son layouts que hoy no cargan el perfil, y una barra que hay que acordarse de alimentar bien en
// trece lugares se alimenta mal en el catorceavo. Acá el rol lo busca ella, una vez, y ningún
// llamador cambia.
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { NavAdministracionTabs } from './NavAdministracionTabs'

export async function NavAdministracion() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  return <NavAdministracionTabs rol={perfil.data?.rol ?? null} />
}
