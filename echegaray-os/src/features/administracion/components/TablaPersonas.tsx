// EL LISTADO DE PERSONAL — y ninguna columna de más.
//
// El dueño, textual: *"PERSONA | CATEGORÍA | CUADRILLA | OBRA ACTUAL | ESTADO. Nada más. NO mostrar
// en la tabla DNI, CUIL, sueldo, teléfono, documentación ni métricas."*
//
// Después pidió las fechas: *"una columna que indique fecha de alta en activos y de alta y baja en
// inactivos"*. ALTA está siempre. BAJA sólo en el filtro Inactivos, que es donde significa algo: en
// el plantel esa columna sería un guión en las diecisiete filas, y una columna que nunca tiene dato
// es ancho gastado en no decir nada.
//
// No es sólo una decisión visual: lo que la tabla no muestra tampoco se pide a la base. El listado
// sale de `persona_directorio`, que no publica documento ni retribución, así que ese dato no viaja
// al navegador aunque alguien abra las herramientas de desarrollo.
//
// CUADRILLA y OBRA ACTUAL son DERIVADAS —de la pertenencia vigente y de la asignación vigente—, no
// columnas guardadas. Por eso no pueden quedar desactualizadas respecto de la ficha.

import Link from 'next/link'
import { esCategoriaDeConvenio, etiquetaCategoria, type PersonaEnDirectorio } from '../types'

/** dd/mm/aaaa. Una fecha sin cargar se dice, no se dibuja como un guión que puede leerse como cero. */
function fecha(iso: string | null) {
  if (!iso) return <span className="text-faint">sin cargar</span>
  const [a, m, d] = iso.slice(0, 10).split('-')
  return <span className="tabular-nums">{`${d}/${m}/${a}`}</span>
}

export function TablaPersonas({
  personas, conBaja = false,
}: {
  personas: PersonaEnDirectorio[]
  /** El listado de Inactivos agrega la fecha de baja. */
  conBaja?: boolean
}) {
  if (personas.length === 0) {
    return (
      <p data-testid="personas-vacio" className="px-1 py-6 text-[13px] text-muted">
        No hay personas que coincidan con lo buscado.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table data-testid="tabla-personas" className="w-full min-w-[820px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3.5 py-2 font-medium">Persona</th>
            <th className="px-3 py-2 font-medium">Categoría</th>
            <th className="px-3 py-2 font-medium">Cuadrilla</th>
            <th className="px-3 py-2 font-medium">Obra actual</th>
            <th className="px-3 py-2 font-medium">Alta</th>
            {conBaja && <th className="px-3 py-2 font-medium">Baja</th>}
            <th className="px-3 py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr
              key={p.id}
              data-testid="fila-persona"
              className="border-b border-line/60 last:border-0 hover:bg-surface-quiet"
            >
              <td className="px-3.5 py-2">
                {/* La fila entera lleva a la ficha: en un listado de trabajo, apuntar a un lápiz de
                    16px con el dedo es la diferencia entre usarlo y no usarlo. */}
                <Link
                  href={`/administracion/personas/${p.id}`}
                  className="block min-w-0"
                  data-testid="abrir-persona"
                >
                  <span className="text-[13px] text-ink hover:underline">{p.nombre_completo}</span>
                  {/* EL OFICIO, NO LA CATEGORÍA. Acá decía el puesto, y el puesto traía el CARGO de
                      la nómina —que ES la categoría del convenio—: la fila mostraba «OFICIAL» debajo
                      del nombre y «Ayudante» en la columna CATEGORÍA, dos respuestas al mismo hecho y
                      distintas. La especialidad es lo que esta línea puede decir que la columna no.
                      El puesto sólo aparece cuando dice algo que no es una categoría, como JEFE DE
                      OBRA. */}
                  {(p.especialidad ?? p.puesto) && (
                    <span className="block truncate text-[11px] text-faint">{p.especialidad ?? p.puesto}</span>
                  )}
                </Link>
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">
                {etiquetaCategoria(p.categoria)}
                {/* Un código mal importado no se esconde ni se corrige solo: se marca para que
                    alguien lo mire. Naranja porque es un problema de dato, no una decoración. */}
                {p.categoria && !esCategoriaDeConvenio(p.categoria) && (
                  <span className="block text-[10px] text-warn">fuera de convenio</span>
                )}
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">{p.cuadrilla ?? '—'}</td>
              <td className="px-3 py-2 text-[12px]">
                {/* SIN ASIGNAR NO ES UN HUECO: es una respuesta, y se escribe. Y la obra va por su
                    NOMBRE — el id es el slug de la URL, que en ninguna otra pantalla del OS se
                    muestra. */}
                {p.obra_actual_id
                  ? (
                      <Link href={`/obras/${p.obra_actual_id}`} className="text-ink hover:underline">
                        {p.obra_actual ?? p.obra_actual_id}
                      </Link>
                    )
                  : <span className="text-faint">sin asignar</span>}
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">{fecha(p.fecha_ingreso)}</td>
              {conBaja && (
                <td className="px-3 py-2 text-[12px] text-muted">
                  {/* SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE. De los 45 legajos cerrados, 22
                      no tienen baja documentada: decir «sin papel de baja» es el dato, y un guión
                      ahí haría pensar que falta cargarla cuando lo que falta es el papel. */}
                  {p.fecha_egreso ? fecha(p.fecha_egreso) : <span className="text-faint">sin papel de baja</span>}
                </td>
              )}
              <td className="px-3 py-2 text-[12px]">
                {/* EL ESTADO SALE DE `en_la_empresa`, NO DE LA FECHA: hay 15 personas que se
                    fueron sin baja documentada y por la fecha figurarían activas. */}
                {p.en_la_empresa
                  ? <span className="text-muted">activa</span>
                  : <span className="text-faint">inactiva</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
