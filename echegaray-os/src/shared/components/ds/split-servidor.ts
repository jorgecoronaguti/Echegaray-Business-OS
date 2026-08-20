import { cookies } from 'next/headers'

// EL ANCHO DEL SPLIT, LEÍDO EN EL SERVIDOR.
//
// La otra mitad de `useSplit`: el navegador guarda la cookie al soltar el divisor y el servidor la
// lee acá para que la primera pintura ya salga con el ancho elegido. Sin esto la pantalla nace con
// el default y se corrige sola a los pocos milisegundos — un salto visible justo en el workspace
// más pesado del sistema.
//
// Acotar acá también es parte del contrato: una cookie es un dato que el usuario puede editar, y
// un ancho de 40.000px llegado de afuera no puede romper el layout.
export async function anchoSplit(clave: string, porDefecto: number, min = 340, max = 760): Promise<number> {
  const bruto = (await cookies()).get(`split-${clave}`)?.value
  const n = bruto ? Number(bruto) : NaN
  if (!Number.isFinite(n)) return porDefecto
  return Math.min(max, Math.max(min, Math.round(n)))
}
