import { PantallaEsqueleto, EncabezadoEsqueleto, Bloque, Linea } from '@/shared/components/carga'

// EL WORKSPACE DE UNA OBRA MIENTRAS LLEGA.
//
// Un esqueleto vale sólo si tiene la FORMA de lo que va a aparecer: si dibuja tres tarjetas y abajo
// llega un workspace partido, el salto es peor que no haber puesto nada — la persona empieza a leer
// una composición y se le reemplaza por otra. Éste dibuja lo que de verdad va a haber: encabezado de
// entidad, las siete solapas, la barra de vista, el reparto tabla | Gantt | panel, y la franja de
// métricas al pie.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-64" />
      <div className="mb-4 flex gap-5 border-b border-line pb-2.5">
        {/* LA CLAVE ES LA POSICIÓN, NO EL ANCHO. Las solapas repiten anchos, y usar el ancho de
            clave hacía que React avisara "two children with the same key" y pudiera omitir una. */}
        {['w-16', 'w-24', 'w-20', 'w-16', 'w-20', 'w-20', 'w-24'].map((w, i) => (
          <Linea key={i} className={`h-2.5 ${w}`} />
        ))}
      </div>
      <div className="mb-3 flex items-center gap-4">
        {['w-12', 'w-12', 'w-16', 'w-20'].map((w, i) => (
          <Linea key={i} className={`h-2.5 ${w}`} />
        ))}
        <span className="ml-auto flex gap-3">
          {['w-16', 'w-24', 'w-28'].map((w, i) => (
            <Linea key={i} className={`h-2.5 ${w}`} />
          ))}
        </span>
      </div>
      {/* El reparto de la pantalla: la tabla y el Gantt a la izquierda, el panel a la derecha. */}
      <div className="flex gap-2">
        <Bloque className="h-[420px] flex-1 motion-safe:animate-pulse" />
        <Bloque className="hidden h-[420px] w-[380px] shrink-0 motion-safe:animate-pulse lg:block" />
      </div>
      <div className="mt-3 flex gap-10 border-t border-line pt-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="space-y-1.5">
            <Linea className="h-2 w-16" />
            <Linea className="h-3 w-12" />
          </span>
        ))}
      </div>
    </PantallaEsqueleto>
  )
}
