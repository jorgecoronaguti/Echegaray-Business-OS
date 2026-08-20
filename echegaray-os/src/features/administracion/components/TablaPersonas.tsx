// EL LISTADO DE PERSONAL — y ninguna columna de más.
//
// El dueño, textual: *"PERSONA | CATEGORÍA | CUADRILLA | OBRA ACTUAL | ESTADO. Nada más. NO mostrar
// en la tabla DNI, CUIL, sueldo, teléfono, documentación ni métricas."* Después pidió las fechas:
// ALTA está siempre; BAJA sólo en el filtro Inactivos, que es donde significa algo —en el plantel
// sería un hueco en las diecisiete filas, y una columna que nunca tiene dato es ancho gastado.
//
// No es sólo una decisión visual: lo que la tabla no muestra TAMPOCO SE LE PIDE A LA BASE. El
// listado sale de `persona_directorio` y `personasService` nombra sus catorce columnas una por una,
// así que el día que la vista crezca, el documento y la retribución no se cuelan al navegador por
// un `select('*')`.
//
// CUADRILLA y OBRA ACTUAL son DERIVADAS —de la pertenencia vigente y de la asignación vigente—, no
// columnas guardadas. Por eso no pueden quedar desactualizadas respecto de la ficha.

import Link from 'next/link'
import { Tabla, THead, Th, Tr, Td, Nulo } from '@/shared/components/ds'
import { esCategoriaDeConvenio, etiquetaCategoria, type PersonaEnDirectorio } from '../types'

/** dd/mm/aa en mono. Una fecha sin cargar se dice; un guión se lee como cero o como «no aplica». */
function Fecha({ iso, falta }: { iso: string | null; falta: string }) {
  if (!iso) return <Nulo>{falta}</Nulo>
  const [a, m, d] = iso.slice(0, 10).split('-')
  return <span className="font-mono text-[11.5px] tabular-nums text-muted">{`${d}/${m}/${a.slice(2)}`}</span>
}

export function TablaPersonas({
  personas, conBaja = false,
}: {
  personas: PersonaEnDirectorio[]
  /** El listado de Inactivos agrega la fecha de baja. */
  conBaja?: boolean
}) {
  return (
    <Tabla testid="tabla-personas" minWidth={880}>
      <THead>
        <Th>Persona</Th>
        <Th>Categoría</Th>
        <Th>Cuadrilla</Th>
        <Th>Obra actual</Th>
        <Th>Alta</Th>
        {conBaja && <Th>Baja</Th>}
        <Th>Estado</Th>
      </THead>
      <tbody>
        {personas.map((p) => (
          <Tr key={p.id} data-testid="fila-persona">
            <Td fuerte className="w-[28%]">
              {/* La fila entera lleva a la ficha: en un listado de trabajo, apuntar a un lápiz de
                  16px con el dedo es la diferencia entre usarlo y no usarlo. */}
              <Link href={`/administracion/personas/${p.id}`} className="block min-w-0" data-testid="abrir-persona">
                <span className="text-[13px] text-ink hover:underline">{p.nombre_completo}</span>
                {/* EL OFICIO, NO LA CATEGORÍA. Acá decía el puesto, y el puesto traía el CARGO de la
                    nómina —que ES la categoría del convenio—: la fila mostraba «OFICIAL» debajo del
                    nombre y «Ayudante» en la columna CATEGORÍA, dos respuestas al mismo hecho y
                    distintas. El puesto sólo aparece cuando dice algo que no es una categoría. */}
                {(p.especialidad ?? p.puesto) && (
                  <span className="block truncate text-[11px] text-faint">{p.especialidad ?? p.puesto}</span>
                )}
              </Link>
            </Td>
            <Td className="w-[130px]">
              <span className="text-[12px] text-muted">{etiquetaCategoria(p.categoria)}</span>
              {/* Un código mal importado no se esconde ni se corrige solo: se marca para que alguien
                  lo mire. Ámbar porque es una falta de dato que bloquea, no una decoración. */}
              {p.categoria && !esCategoriaDeConvenio(p.categoria) && (
                <span className="block text-[10px] text-warn">fuera de convenio</span>
              )}
            </Td>
            <Td className="w-[130px]">
              {p.cuadrilla
                ? <span className="text-[12px] text-muted">{p.cuadrilla}</span>
                : <Nulo>sin cuadrilla</Nulo>}
            </Td>
            <Td className="w-[210px]">
              {/* SIN ASIGNAR NO ES UN HUECO: es una respuesta, y se escribe. Y la obra va por su
                  NOMBRE — el id es el slug de la URL, que en ninguna otra pantalla se muestra. */}
              {p.obra_actual_id
                ? (
                    <Link href={`/obras/${p.obra_actual_id}`} className="text-[12px] text-ink hover:underline">
                      {p.obra_actual ?? p.obra_actual_id}
                    </Link>
                  )
                : <Nulo>sin asignar</Nulo>}
            </Td>
            <Td className="w-[90px]"><Fecha iso={p.fecha_ingreso} falta="sin cargar" /></Td>
            {conBaja && (
              <Td className="w-[110px]">
                {/* SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE. De los 45 legajos cerrados, 22 no
                    tienen baja documentada: «sin papel de baja» ES el dato, y un guión ahí haría
                    pensar que falta cargarla cuando lo que falta es el papel. */}
                <Fecha iso={p.fecha_egreso} falta="sin papel de baja" />
              </Td>
            )}
            <Td className="w-[90px]">
              {/* EL ESTADO SALE DE `en_la_empresa`, NO DE LA FECHA: hay 15 personas que se fueron sin
                  baja documentada y por la fecha figurarían activas. Sin punto de color: en una
                  columna de diecisiete filas iguales el punto es ruido, no señal. */}
              {p.en_la_empresa
                ? <span data-estado="activa" className="text-[12px] text-muted">activa</span>
                : <span data-estado="inactiva" className="text-[12px] text-faint">inactiva</span>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
