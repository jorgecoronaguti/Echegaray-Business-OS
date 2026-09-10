// EL RÓTULO DE SECCIÓN — un filo y una palabra, no una tarjeta.
//
// Lo usan el plantel (`TablaPersonas`) y la grilla de Horas de Liquidación para separar Jefes de
// obra de Obreros. Es UNA definición: el dueño pidió que el orden y la diferenciación no cambien
// entre pantallas de Personal, y dos rótulos parecidos en dos archivos se separan solos.
//
// Es el mismo rótulo de 11px versalita tenue que ya usan las columnas (`RotuloCol`): dentro de la
// lista no puede aparecer un tercer nivel tipográfico. Va SIN card, sin fondo y sin icono — un
// bloque con caja por grupo convertiría una lista de trabajo en dos tableros.
//
// El primero no lleva filo arriba: el encabezado de columnas ya trae el suyo y dos líneas seguidas
// a 8px se leen como un borde grueso. Los que siguen sí, con 8px de aire, que es lo que separa un
// grupo del anterior sin abrir un hueco.

import { RotuloCol, V } from '@/shared/components/v2/patron'

export function RotuloDeGrupo({ texto, primero }: { texto: string; primero: boolean }) {
  return (
    <div data-testid="rotulo-grupo" style={{
      display: 'flex', alignItems: 'center', height: 32,
      marginTop: primero ? 0 : 8,
      paddingTop: primero ? 0 : 8,
      borderTop: primero ? undefined : `1px solid ${V.linea}`,
    }}>
      <RotuloCol>{texto}</RotuloCol>
    </div>
  )
}
