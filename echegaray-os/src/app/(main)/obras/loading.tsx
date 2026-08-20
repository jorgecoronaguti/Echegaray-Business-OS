import { PantallaEsqueleto, EncabezadoEsqueleto, TablaEsqueleto, Linea } from '@/shared/components/carga'

// EL RESUMEN DE OBRAS MIENTRAS CARGA — la misma tabla, sin los datos.
//
// Es la pantalla que el dueño reportó hoy: *"al acceder al «obras» la app no responde, no se mueve,
// nada"*. Siete columnas porque son las de `page.tsx` (Obra · Cliente · Etapa · Avance · Plazo ·
// Contratado · Costo real); si alguna se agregara y acá no, la tabla saltaría al llegar el dato —
// que es exactamente el defecto que un esqueleto existe para evitar.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-28" />
      {/* La línea de vistas del área (Resumen · Gantt) mantiene su lugar: es lo único de esta
          pantalla que NO depende del servidor y desaparecer sería un salto gratis. */}
      <div className="mb-5 flex gap-4 border-b border-line pb-2.5">
        <Linea className="h-2.5 w-16" />
        <Linea className="h-2.5 w-12" />
      </div>
      <TablaEsqueleto cols={7} filas={8} />
    </PantallaEsqueleto>
  )
}
