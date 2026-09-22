import { redirect } from 'next/navigation'

// Igual que Rodados: la clase es el filtro del Inventario, no una solapa.
export default function MaquinariasPage() {
  redirect('/herramientas/inventario?clase=equipo')
}
