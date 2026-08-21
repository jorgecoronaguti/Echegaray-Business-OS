'use client'

import { EstadoError } from '@/shared/components/estado'

// PRESUPUESTOS. Boundary propio, por lo mismo que Clientes: el error de la cartera o de un
// presupuesto no debe borrar la barra de Administración que monta este layout.
//
// El cartel dice el mensaje REAL de la fuente. En este módulo eso importa más que en ningún otro:
// `cotizaciones` tiene RLS pero no tiene GRANT, así que hoy la base contesta «permission denied for
// table cotizaciones» — un mensaje que apunta exactamente al arreglo. Reemplazarlo por «no se pudo
// cargar» mandaría a buscar el defecto en el ruteo, que es la confusión que este módulo ya pagó una
// vez (17/08/2026).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
