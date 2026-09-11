import { SeccionEsqueleto } from '@/shared/components/carga'

// PROVEEDORES — la banda de áreas, el título, las dos vistas («Proveedores» · «Nombres sin
// resolver») con el buscador, y la lista. Sin esto la pantalla caía en el fallback del grupo
// `(main)`, que son dos rectángulos grises: el contenido real llegaba y todo saltaba de lugar.
export default function Cargando() {
  return <SeccionEsqueleto cols={6} filas={9} anchoTitulo="w-32" vistas={2} />
}
