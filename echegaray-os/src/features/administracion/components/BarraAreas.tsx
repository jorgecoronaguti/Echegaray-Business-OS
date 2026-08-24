// LA BARRA DE ÁREAS DE LA ENTRADA — nivel 2 con el contador adentro (Design 23/08/2026, pantalla 00).
//
// Es la MISMA barra de `NavAdministracionTabs`, con dos datos más pegados al nombre: cuánto hay del
// otro lado y si algo reclama trabajo. Se dibuja sólo acá y no en las otras trece pantallas del área
// a propósito: adentro de Personas, el contador de Documentos no decide nada y cada número cuesta una
// consulta por página vista.
//
// NINGUNA ÁREA SE MARCA ACTIVA. La entrada está POR ENCIMA de las diez, no adentro de ninguna: pintar
// «Clientes» con la regla amarilla —como hace el mockup— diría que estamos parados ahí, y el clic
// navega a otro lado. El h1 contesta dónde estamos.
//
// El ⚠ va con `title` y `aria-label`: un icono solo, sin texto, es ilegible para quien no ve el color
// y para quien no sabe qué significa el triángulo.

import { Tabs } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import type { AreaAdmin } from '../services/homeAdministracion'

export function BarraAreas({ areas }: { areas: AreaAdmin[] }) {
  return (
    // `nav-admin-secciones` es el nombre que ya usa la barra del área en el resto de las pantallas:
    // para quien prueba, esta ES esa barra. Y `ir-<clave>` se conserva porque era el identificador de
    // la lista de maestros que esta barra absorbe.
    <div data-testid="nav-admin-secciones" className="mb-4">
      <Tabs
        testid="tabs-administracion"
        tabs={areas.map((a) => ({
          href: a.href,
          testid: `ir-${a.clave}`,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {a.titulo}
              {/* SIN LECTURA NO HAY CONTADOR — NUNCA UN CERO. Si la consulta falló el número no
                  aparece; un «0» diría «no hay ninguno», que es otra afirmación. */}
              {a.cuenta !== null && (
                <span className="font-mono text-[11px] tabular-nums text-faint">{a.cuenta}</span>
              )}
              {a.aviso && (
                <span
                  data-testid={`aviso-${a.clave}`}
                  title={a.aviso}
                  aria-label={a.aviso}
                  className="inline-flex text-warn"
                >
                  <IconoProblema className="h-[13px] w-[13px]" />
                </span>
              )}
            </span>
          ),
        }))}
      />
    </div>
  )
}
