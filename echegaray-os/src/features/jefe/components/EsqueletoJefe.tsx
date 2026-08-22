import { Bloque, Linea } from '@/shared/components/carga'

// EL ESQUELETO DEL PERFIL JEFE DE OBRA — la forma de la pantalla que viene, en 520px.
//
// No se reusa `PantallaEsqueleto` de `shared/components/carga`: ése abre su propio contenedor de
// 1400px con `min-h-screen bg-canvas`, y acá el contenedor ya lo puso `ShellJefe`. Anidarlo mete
// una segunda pantalla adentro de la primera y el esqueleto aparece con el ancho del escritorio
// abajo de una barra de teléfono. El vocabulario —`Linea`, `Bloque`, el `animate-pulse` bajo
// `motion-safe`— sí es el mismo: eso es lo que hay que compartir.
//
// LAS MEDIDAS SON LAS REALES. `px-4` y `pt-4` son los del `Encabezado` de `Piezas`, y los bloques
// tienen el alto de los paneles que van a reemplazar: si el esqueleto no está donde va a estar el
// contenido, el salto al llegar es peor que no haber mostrado nada.

export function EsqueletoJefe({
  metricas = false, paneles = 2, testid = 'esqueleto-jefe',
}: {
  /** La franja de tres cifras que abren «Hoy» y «Personas». */
  metricas?: boolean
  paneles?: number
  testid?: string
}) {
  return (
    <div data-testid={testid} aria-busy="true" aria-live="polite">
      <div className="px-4 pb-2.5 pt-4">
        <Linea className="h-5 w-48" />
        <Linea className="mt-2 h-3 w-64 max-w-full" />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-6">
        {metricas && <Bloque className="h-[72px] motion-safe:animate-pulse" />}
        {Array.from({ length: paneles }, (_, i) => (
          <Bloque key={i} className="h-[132px] motion-safe:animate-pulse" />
        ))}
      </div>

      <span className="sr-only">Cargando…</span>
    </div>
  )
}
