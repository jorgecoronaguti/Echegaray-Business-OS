// LOS ESQUELETOS — la forma de la pantalla que viene, no un cuadrado gris.
//
// Un esqueleto genérico y un spinner dicen lo mismo ("esperá"), pero el esqueleto dice además QUÉ
// está por aparecer: cuántas columnas, dónde el título, dónde la tabla. Cuando llega el contenido no
// hay salto —los bloques ya están donde va el dato— y la espera se siente más corta que el reloj.
// Por eso cada `loading.tsx` de este OS dibuja SU pantalla, y estas piezas son sólo el vocabulario.
//
// EL COLOR ES `surface-sunken`, el token de "pista apagada" que ya usa el sistema. Un esqueleto no
// es un estado: no lleva color semántico ni el amarillo de la marca. El único movimiento es el
// `animate-pulse` de Tailwind, y bajo `motion-safe`.

export function Linea({ className = '' }: { className?: string }) {
  return <span className={`block h-3 rounded bg-surface-sunken ${className}`} />
}

export function Bloque({ className = '' }: { className?: string }) {
  return <div className={`rounded-card bg-surface-sunken ${className}`} />
}

/** El encabezado de `PageShell`: el mismo hueco que va a ocupar el título real. */
export function EncabezadoEsqueleto({ ancho = 'w-40' }: { ancho?: string }) {
  return (
    <header className="mb-6">
      <Linea className={`h-5 ${ancho}`} />
      <Linea className="mt-2.5 h-3 w-72 max-w-full" />
    </header>
  )
}

/**
 * UNA TABLA CON SUS COLUMNAS. `cols` no es decoración: con el número real de columnas de la pantalla
 * que viene, el ancho de cada una queda donde va a quedar y la tabla no se reacomoda al llegar.
 */
export function TablaEsqueleto({ cols, filas = 6 }: { cols: number; filas?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface motion-safe:animate-pulse" data-testid="esqueleto-tabla">
      <div className="flex gap-4 border-b border-line px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Linea key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }, (_, i) => (
            // La primera columna es siempre el nombre de la cosa: más larga, y más oscura.
            <Linea key={i} className={i === 0 ? 'h-3 flex-1' : 'h-3 flex-1 opacity-70'} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** El marco compartido por todos los `loading.tsx`: mismo contenedor y mismo margen que `PageShell`. */
export function PantallaEsqueleto({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas" data-testid="esqueleto-carga" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">{children}</div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

// ═══ EL ESQUELETO DE UNA SECCIÓN DE ÁREA (11/09/2026) ═══
//
// Las secciones raíz de Administración —Clientes, Personal, Proveedores, Compras— dibujan SIEMPRE la
// misma estructura, y en este orden: la barra de áreas de nivel 2 (`NavAdministracion`, que cada
// página renderiza como primer hijo de su `PageShell`), el título, la fila de vistas con el buscador
// (`CabeceraSeccion`) y la tabla.
//
// POR QUÉ IMPORTA QUE EL ESQUELETO TENGA ESA FORMA Y NO DOS BLOQUES GRISES. El fallback del grupo
// `(main)` dibuja un rectángulo de 96px y otro de 224px: cuando llega el contenido real, la barra de
// áreas aparece donde no había nada y todo lo de abajo salta. Con la banda y la fila de vistas
// reservadas, lo que llega ocupa el lugar que ya estaba marcado.
//
// LA BANDA DE ÁREAS NO SE DIBUJA DE VERDAD ACÁ, y no puede: `NavAdministracion` es asíncrona —lee el
// rol para saber qué secciones mostrar— y un `loading.tsx` que espera una consulta deja de ser lo
// que se pinta al instante. Se reserva su alto (37px: el de `BarraAreas`) y nada más.
//
// ═══ HASTA DÓNDE LLEGA ESTO, MEDIDO Y NO SUPUESTO (11/09/2026) ═══
//
// ESTE ESQUELETO NO APARECE AL HACER CLIC. Comprobado contra el build de producción en local, con la
// respuesta RSC retrasada 6 s a propósito y contextos de navegador nuevos para que no hubiera caché:
// al hacer clic en un enlace de la barra de áreas NO se monta ningún `loading.tsx` —ni éste ni el
// genérico del grupo `(main)`—; el router deja la pantalla anterior tal cual hasta que llega el
// payload. La causa es `prefetch={false}` en esas barras: sin precarga el router no tiene el árbol de
// la ruta y no sabe qué frontera de carga montar (Next 16 sólo precarga hasta el `loading.tsx` más
// cercano cuando el destino es dinámico, que es justo lo que aquí está apagado).
//
// DÓNDE SÍ SE VE: en la carga completa del documento —entrar por la URL, recargar, volver del login—,
// que llega por streaming y saca primero el marco y este esqueleto.
//
// LO QUE CUBRE LA NAVEGACIÓN POR CLIC ES `IndicadorNavegacion`: barra fina arriba y, a los 500 ms, el
// cartel «Cargando…». Medido en producción sobre 20 navegaciones reales, aparece entre 34 y 536 ms
// SIEMPRE. O sea que la pantalla no se queda muda; se queda con el contenido viejo.
//
// SI ALGÚN DÍA SE QUIERE EL ESQUELETO AL CLIC, el cambio es sacar `prefetch={false}` de las barras de
// navegación (NO de las listas: ahí está medido que cuesta decenas de renders) y medir ANTES el costo
// en pasadas por el middleware. No se hizo acá porque no se midió.
export function SeccionEsqueleto({
  cols, filas = 8, anchoTitulo = 'w-36', vistas = 2,
}: { cols: number; filas?: number; anchoTitulo?: string; vistas?: number }) {
  return (
    <div data-testid="esqueleto-carga" aria-busy="true" aria-live="polite">
      {/* La banda de áreas, a sangre y con el filo inferior que apoya en el header. */}
      <div className="h-[37px] border-b border-line bg-surface" />
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">
        <Linea className={`h-5 ${anchoTitulo}`} />
        {/* La fila de vistas y el buscador: chips a la izquierda, caja de búsqueda a la derecha. */}
        <div className="mt-5 mb-5 flex items-center gap-3">
          {Array.from({ length: vistas }, (_, i) => (
            <Bloque key={i} className="h-6 w-28 motion-safe:animate-pulse" />
          ))}
          <Bloque className="ml-auto h-7 w-56 motion-safe:animate-pulse" />
        </div>
        <TablaEsqueleto cols={cols} filas={filas} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
