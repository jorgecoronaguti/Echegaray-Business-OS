import { redirect } from 'next/navigation'

// Los RODADOS no son una solapa: son el Inventario filtrado por clase (dueño, 22/09/2026: la barra mezclaba
// funciones con categorías). La ruta se conserva porque está enlazada desde Analíticas, desde el teléfono y
// desde los QR: lleva al mismo lugar con el filtro puesto.
export default function RodadosPage() {
  redirect('/herramientas/inventario?clase=rodado')
}
