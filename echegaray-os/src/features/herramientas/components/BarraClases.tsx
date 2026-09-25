'use client'

// LA BARRA DE CLASES — Herramientas · Maquinarias · Rodados · EPP · Ropa de trabajo · Todo, SIEMPRE a la vista.
//
// ═══ POR QUÉ VIVE ACÁ Y NO ADENTRO DEL INVENTARIO (dueño, 22/09/2026) ═══
//
// Textual: *«al hacer en alguna de las secciones las otras desaparecen, no quedan marcadas con la
// posibilidad de acceder a las otras»*. La barra estaba dibujada dentro de `VistaInventario`, y el
// Inventario bifurca a tres vistas distintas según la clase (`VistaRodados`, `VistaMaquinarias` y él
// mismo). Al elegir Maquinarias o Rodados se dibujaba OTRA vista, que no tenía la barra: la fila
// entera desaparecía y no había forma de saltar a otra clase sin volver atrás.
//
// La clase es un FILTRO, no otra pantalla (la misma corrección del dueño que sacó Rodados y
// Maquinarias de la barra de funciones). Un filtro se ve siempre, con el puesto marcado y los otros a
// un clic. Por eso la barra se dibuja ARRIBA de la bifurcación, en la página, y cada vista sigue
// trayendo sus columnas propias.
//
// Las cuentas son las mismas de antes: los activos VIVOS de cada clase que pasan los demás filtros
// (búsqueda, ubicación, categoría, especial). No se recalculan de otra manera acá.

import { useRouter } from 'next/navigation'
import { candidatos, queryDe, type FiltroClase, type Filtros } from '../logica/inventario'
import type { Parque } from '../logica/parque'
import { IcoEquipo, IcoRodado, IcoTaller } from './iconos'
import { V } from './estilo'

const CLASES: { v: FiltroClase; t: string; ico?: React.ReactNode }[] = [
  { v: 'herramienta', t: 'Herramientas', ico: <IcoTaller tam={13} /> },
  { v: 'equipo', t: 'Maquinarias', ico: <IcoEquipo tam={13} /> },
  { v: 'rodado', t: 'Rodados', ico: <IcoRodado tam={13} /> },
  // EPP y ropa de trabajo (dueño, 25/09/2026): salieron de «Todo» a su propia solapa. Van por talle y
  // se entregan a una persona desde su legajo.
  { v: 'epp', t: 'EPP' },
  { v: 'ropa', t: 'Ropa de trabajo' },
  { v: 'todo', t: 'Todo' },
]

export function BarraClases({ parque, filtros }: { parque: Parque; filtros: Filtros }) {
  const router = useRouter()
  // Cambiar de clase cierra la ficha abierta: se está eligiendo QUÉ mirar, no cuál.
  const ir = (clase: FiltroClase) => router.replace(`/herramientas/inventario${queryDe({ ...filtros, clase, activo: null })}`, { scroll: false })
  const cuenta = (c: FiltroClase) => candidatos(parque, { ...filtros, clase: c, estado: 'todos' }).filter((a) => a.estado !== 'baja').length
  return (
    <div
      data-testid="barra-clases" data-no-imprimir
      style={{
        // Debajo del header de la app (44) y de la barra de funciones (39): las dos barras quedan
        // fijas mientras se recorre el listado.
        position: 'sticky', top: 83, zIndex: 15, background: '#FFFFFF', borderBottom: `1px solid ${V.linea}`,
        minHeight: 38, display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', flexWrap: 'wrap', fontSize: '13px',
      }}
    >
      {CLASES.map((c) => {
        const on = filtros.clase === c.v
        return (
          <button
            key={c.v} type="button" onClick={() => ir(c.v)} data-testid={`clase-${c.v}`}
            aria-current={on ? 'page' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 38, fontWeight: on ? 500 : 400, color: on ? V.tinta : V.apagado }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: on ? `inset 0 -1.5px 0 ${V.tinta}` : 'none', paddingBottom: 3 }}>
              {c.ico}{c.t} <span style={{ color: V.tenue, fontWeight: 400 }}>{cuenta(c.v)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
