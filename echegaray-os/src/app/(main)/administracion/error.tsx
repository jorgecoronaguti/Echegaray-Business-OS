'use client'

import { EstadoError } from '@/shared/components/estado'

// ADMINISTRACIÓN — personas, legajos, cuadrillas, proveedores, usuarios, pendientes.
//
// Tiene boundary propio porque su layout monta `NavAdministracion`: si el error subiera al de
// `(main)`, la barra del área desaparecería junto con la pantalla y pasar de Personas a Proveedores
// —que probablemente sí funciona— exigiría volver a navegar desde arriba.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoError error={error} reset={reset} />
}
