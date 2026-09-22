import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaInventario } from '@/features/herramientas/components/VistaInventario'
import { VistaRodados } from '@/features/herramientas/components/VistaRodados'
import { VistaMaquinarias } from '@/features/herramientas/components/VistaMaquinarias'
import { BarraClases } from '@/features/herramientas/components/BarraClases'
import { filtrosDeURL } from '@/features/herramientas/logica/inventario'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'

// D02 · INVENTARIO — lista + ficha en split. `?activo=<código>` abre la ficha (lo usa `/h/<código>`).
//
// ═══ LA CLASE ES EL FILTRO, NO OTRA PANTALLA (dueño, 22/09/2026) ═══
//
// «esto esta mal porque mezcla funciones con categorias». Rodados y Maquinarias dejaron de ser solapas: son
// este mismo Inventario con `?clase=`, y cada clase trae SUS columnas —un rodado se mira por km, verificación
// y papeles; una herramienta de mano, no—. La ficha (`?activo=`) sigue siendo la del Inventario para todos.
//
// La barra de clases se dibuja ACÁ, arriba de la bifurcación, no adentro de una de las tres vistas:
// dueño, 22/09, «al hacer en alguna de las secciones las otras desaparecen». Vivía dentro de
// `VistaInventario`, así que al elegir Maquinarias o Rodados —que son otras vistas— desaparecía.
export const dynamic = 'force-dynamic'

export default async function InventarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const lectura = await leerParque()
  const crudo = Array.isArray(sp.activo) ? sp.activo[0] : sp.activo
  const activo = crudo ? normalizarCodigo(crudo) : null
  const filtros = filtrosDeURL(sp)
  return (
    <Marco lectura={lectura}>
      {(l) => (
        <>
          <BarraClases parque={l.parque} filtros={filtros} />
          {filtros.clase === 'rodado' && !activo ? <VistaRodados parque={l.parque} />
            : filtros.clase === 'equipo' && !activo ? <VistaMaquinarias parque={l.parque} />
            : <VistaInventario filtros={filtros} activo={activo} />}
        </>
      )}
    </Marco>
  )
}
