// LA BARRA DE NIVEL 2 DE ADMINISTRACIÓN — el envoltorio que sabe QUIÉN está mirando.
//
// ═══ POR QUÉ ESTÁ PARTIDA EN DOS (21/08/2026) ═══
//
// Las solapas necesitan dos cosas que viven en lados opuestos: la RUTA ACTUAL, que sólo se sabe en
// el navegador (`usePathname`), y el ROL de quien mira, que sólo se sabe en el servidor. Mientras
// la barra fue un único componente de cliente, el rol no llegaba — y la barra le dibujaba
// «Usuarios» a un jefe de obra que el middleware después rebotaba.
//
// La alternativa era pasarle `rol` desde los doce lugares que la usan. Se descartó: dos de ellos
// son layouts que hoy no cargan el perfil, y una barra que hay que acordarse de alimentar bien en
// doce lugares se alimenta mal en el treceavo. Acá el rol lo busca ella, una vez, y ningún llamador
// cambia. `getPerfilActual` está memorizado por request, así que esta lectura no es un viaje más.
//
// SIN CONTADORES: acá la barra dibuja sólo los nombres. Los números los paga —y los muestra— la
// entrada de Administración, que es la única pantalla que los necesita para decidir a dónde ir.
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { destinosVisibles } from '../services/areasAdmin'
import { BarraAreas } from './BarraAreas'

export async function NavAdministracion() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  const areas = destinosVisibles(perfil.data?.rol ?? null)
    .map((d) => ({ ...d, cuenta: null, aviso: null }))
  return <BarraAreas areas={areas} />
}
