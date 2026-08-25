// LAS SOLAPAS DE LA FICHA — el nivel 2 DENTRO del legajo.
//
// Son las preguntas que se le hacen a una persona: quién es, dónde estuvo, cuánto trabajó, qué
// papeles tiene, con qué cuenta entra y quién le tocó qué. Se dibujan con `Tabs` del design system
// —regla amarilla de 2px— en vez de con una tercera copia de la misma barra escrita a mano.
//
// ACÁ NO ESTÁ LA BARRA DEL ÁREA, y es a propósito: el legajo está un nivel por debajo de Personas y
// vuelve con el `← Personal` del encabezado. Poner las dos daría TRES niveles de navegación a la
// vista, que es lo que prohíbe `design/system/LAYOUT_RESPONSIVE.md`.
//
// ═══ QUÉ DICE EL DESIGN Y EN QUÉ SE APARTA ESTO (21/08/2026) ═══
//
// El design de la Ficha 360 lista cinco: Resumen · Legajo · Documentos · Usuario y permisos ·
// Auditoría. Acá hay seis, y las dos diferencias son deliberadas:
//
//   ASIGNACIONES y HORAS existen y el design no las tiene, porque el design las mete adentro de
//   Resumen. Adentro de Resumen ya ESTÁN —la asignación vigente y el historial reciente—; estas dos
//   solapas son el detalle completo, con el selector de período de la liquidación (día · semana ·
//   quincena · mes). Plegarlas dentro de Resumen para llegar al número cinco borraría ese selector,
//   que es lo que hace que las HH de esta pantalla coincidan con una quincena real.
//
//   LEGAJO no existe como solapa porque su contenido —identidad y datos laborales— ya está a la
//   vista en TODAS las solapas, en el aside. Está ahí por una decisión anotada en la propia ficha:
//   *«quién es esta persona es el contexto de todo lo demás, y perderlo al mirar sus horas obliga a
//   volver»*. Una solapa «Legajo» sería el mismo contenido dos veces, o mudarlo y perder el
//   contexto. Queda declarado como diferencia con el design, no como olvido.
//
// NINGUNA VISTA SE RENOMBRÓ: los cuatro valores de `?v=` que ya circulan siguen valiendo, así que no
// hace falta ningún redirect y ningún enlace guardado se rompe.

import { Tabs } from '@/shared/components/ds'

export const VISTAS_FICHA = [
  'resumen', 'asignaciones', 'horas', 'documentos', 'usuario', 'auditoria',
] as const
export type VistaFicha = (typeof VISTAS_FICHA)[number]

const LABEL: Record<VistaFicha, string> = {
  resumen: 'Resumen',
  asignaciones: 'Asignaciones',
  horas: 'Horas',
  documentos: 'Documentos',
  usuario: 'Usuario y permisos',
  auditoria: 'Auditoría',
}

export function NavFicha({
  activa, hrefDe, ocultar = [], cuentas = {},
}: {
  activa: VistaFicha
  hrefDe: (v: VistaFicha) => string
  /**
   * EL CONTADOR MONO DEL NIVEL 2 (Design 23/08, §Anatomía de ficha de entidad).
   *
   * Sólo se pasa el de las solapas cuyo número la página YA leyó. «Horas» no lo lleva a propósito:
   * su fuente es `registros_hh` entera, y contarla para pintar un número al lado de una solapa que
   * nadie abrió sería pagar la consulta cara en las seis vistas.
   */
  cuentas?: Partial<Record<VistaFicha, number | null>>
  /**
   * LAS QUE NO SE DIBUJAN PARA QUIEN MIRA.
   *
   * Hoy es una sola —«Usuario y permisos» para el que no ve la economía—. Se OCULTA en vez de
   * mostrarse deshabilitada por la misma razón por la que `/presupuestos` no aparece en la barra del
   * jefe de obra: una solapa que lleva a «no tenés permiso» es una pantalla más ancha que la base.
   *
   * ESTO NO ES LA CERRADURA. La página vuelve a decidir contra el rol de la sesión, y las acciones
   * contra la cookie.
   */
  ocultar?: readonly VistaFicha[]
}) {
  const visibles = VISTAS_FICHA.filter((v) => !ocultar.includes(v))
  return (
    <div className="mb-6" data-testid="nav-ficha-persona">
      <Tabs
        testid="tabs-ficha-persona"
        tabs={visibles.map((v) => ({
          href: hrefDe(v), label: LABEL[v], activo: v === activa, testid: `nav-ficha-${v}`,
          cuenta: cuentas[v] ?? null,
        }))}
      />
    </div>
  )
}
