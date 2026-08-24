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
//
// ═══ CINCO HECHOS, CINCO LUGARES (Design 23/08/2026, pantalla 19) ═══
//
// El canónico junta OBRA / CUADRILLA en una columna y titula la otra «ROL», pero en el modelo son
// CINCO cosas distintas y ninguna se deduce de otra: el OFICIO es lo que sabe hacer, la CATEGORÍA
// UOCRA es lo que cobra, el ROL es qué hace en esta obra, la CUADRILLA es con quién y la OBRA es
// dónde. Colapsarlas para parecerse al mockup es exactamente el defecto que esta tabla ya arregló
// una vez —mostraba «OFICIAL» debajo del nombre y «Ayudante» en CATEGORÍA, dos respuestas al mismo
// hecho—. Se preserva la separación y se adapta lo visual: el oficio bajo el nombre, el rol bajo la
// obra, categoría y cuadrilla en su columna.

// ═══ EL PULSO DEL DÍA (Design 23/08, pantalla 19) ═══
//
// «Nada más salvo razón operativa fuerte» seguía valiendo, y las tres columnas nuevas —HOY, HH MES,
// PAPELES— son exactamente esa razón: el canónico no dibuja un directorio, dibuja el estado del
// plantel hoy. Ninguna sale de `persona_directorio`; llegan agrupadas desde la página, y por eso son
// OPCIONALES: sin `pulso` la tabla es la de antes, que es lo que necesita cualquier pantalla que la
// reuse sin pagar las tres lecturas extra.
//
// Cada silencio se escribe con su palabra —«sin fichar», «sin HH», «sin legajo»— y ninguno es 0. El
// porqué de cada uno está en `services/pulsoDelPlantel.ts`, que es donde vive la regla.

import Link from 'next/link'
import { Tabla, THead, Th, Tr, Td, Nulo, Estado } from '@/shared/components/ds'
import { Avatar } from '@/shared/components/Avatar'
import { esCategoriaDeConvenio, etiquetaCategoria, type PersonaEnDirectorio } from '../types'
import { oficioVisible } from '../services/vocabularioPersona'
import {
  HOY_LABEL, HOY_TONO, estadoHoy, horasVisibles, lecturaDePapeles,
  type EstadoDePapeles, type MarcaDeHoy,
} from '../services/pulsoDelPlantel'

/** Las tres lecturas del día, ya agrupadas por persona. Cada `disponible` en false apaga SU columna:
 *  una lectura que falló no se dibuja como «no hay nada». */
export interface PulsoDelPlantel {
  marcas: Map<string, MarcaDeHoy>
  hh: Map<string, number>
  papeles: Map<string, EstadoDePapeles>
  hoyDisponible: boolean
  hhDisponible: boolean
  /** En false la columna PAPELES no se dibuja: sin fuente de vencimientos sería una columna vacía
   *  prometiendo un control que nadie está haciendo. */
  papelesDisponible: boolean
}

/** dd/mm/aa en mono. Una fecha sin cargar se dice; un guión se lee como cero o como «no aplica». */
function Fecha({ iso, falta }: { iso: string | null; falta: string }) {
  if (!iso) return <Nulo>{falta}</Nulo>
  const [a, m, d] = iso.slice(0, 10).split('-')
  return <span className="font-mono text-[11.5px] tabular-nums text-muted">{`${d}/${m}/${a.slice(2)}`}</span>
}

export function TablaPersonas({
  personas, conBaja = false, pulso,
}: {
  personas: PersonaEnDirectorio[]
  /** El listado de Inactivos agrega la fecha de baja. */
  conBaja?: boolean
  /** Sin pulso la tabla es la de siempre: el día de hoy no se le pregunta a quien ya no está. */
  pulso?: PulsoDelPlantel
}) {
  const conPapeles = pulso?.papelesDisponible ?? false
  return (
    <Tabla testid="tabla-personas" minWidth={pulso ? 1180 : 880}>
      <THead>
        <Th>Persona</Th>
        {/* CATEGORÍA UOCRA y no «Categoría» a secas: es la del convenio, la que LIQUIDA. Debajo del
            nombre va el oficio, que es otra cosa; sin decir cuál es cuál las dos se leían como la
            misma pregunta contestada dos veces. */}
        <Th>Categoría UOCRA</Th>
        <Th>Cuadrilla</Th>
        <Th>Obra actual</Th>
        {/* LAS TRES DEL PULSO VAN JUNTAS Y ANTES DE LAS FECHAS: son lo que se mira todos los días;
            el alta se mira una vez por persona en la vida. */}
        {pulso && <Th>Hoy</Th>}
        {pulso && <Th>HH mes</Th>}
        {conPapeles && <Th>Papeles</Th>}
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
              <Link href={`/administracion/personas/${p.id}`} className="flex min-w-0 items-center gap-2.5" data-testid="abrir-persona">
                {/* LAS INICIALES, NO UNA SILUETA (Design 23/08, pantallas 19 y 20). En una tabla de
                    diecisiete apellidos parecidos —Agüero, Alaniz, Ochoa— el ancla del ojo es el
                    par de letras, no el nombre completo que hay que leer entero. Es el MISMO
                    componente de Mi cuenta y de la ficha: una sola definición de «cómo se ve una
                    persona» en todo el OS. Sin foto todavía: `persona_directorio` no publica una
                    URL de avatar y no se inventa una. */}
                <Avatar nombre={p.nombre_completo} url={null} lado={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink hover:underline">{p.nombre_completo}</span>
                  {/* EL OFICIO, NO LA CATEGORÍA. Acá decía el puesto, y el puesto traía el CARGO de
                      la nómina —que ES la categoría del convenio—: la fila mostraba «OFICIAL» debajo
                      del nombre y «Ayudante» en la columna CATEGORÍA, dos respuestas al mismo hecho
                      y distintas. El `??` pelado no alcanzaba porque no MIRABA el valor; la regla y
                      su prueba viven en `services/vocabularioPersona.ts`. */}
                  {oficioVisible(p.especialidad, p.puesto) && (
                    <span className="block truncate text-[11px] text-faint">
                      {oficioVisible(p.especialidad, p.puesto)}
                    </span>
                  )}
                </span>
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
                    <>
                      <Link href={`/obras/${p.obra_actual_id}`} className="text-[12px] text-ink hover:underline">
                        {p.obra_actual ?? p.obra_actual_id}
                      </Link>
                      {/* EL ROL ES EL QUINTO HECHO, Y ESTABA EN LA CONSULTA SIN LLEGAR A NADIE.
                          `persona_directorio` publica `rol_en_obra` y el listado lo pedía desde
                          siempre: la fila lo tiraba. No es la categoría (lo que cobra) ni el oficio
                          (lo que sabe hacer): es qué hace EN ESTA OBRA —capataz, integrante—, y
                          cuelga de la asignación, por eso vive acá y no en su propia columna. */}
                      {p.rol_en_obra?.trim() && (
                        <span className="block truncate text-[11px] text-faint">{p.rol_en_obra}</span>
                      )}
                    </>
                  )
                : <Nulo>sin asignar</Nulo>}
            </Td>

            {/* HOY — punto y palabra, y NUNCA la palabra «ausente». Que no haya marca incluye al que
                no tiene teléfono, al que no le dio permiso al GPS y al que faltó: son el mismo
                silencio visto desde acá, y convertirlo en una falta fabricaría una novedad de
                liquidación. Quién faltó lo declara el jefe de obra, que es quien lo ve. */}
            {pulso && (
              <Td className="w-[110px]">
                {pulso.hoyDisponible
                  ? (() => {
                      const e = estadoHoy(pulso.marcas.get(p.id))
                      return <Estado tono={HOY_TONO[e]} clave={e} testid="hoy-persona">{HOY_LABEL[e]}</Estado>
                    })()
                  : <Nulo>sin lectura</Nulo>}
              </Td>
            )}

            {/* HH MES — la persona sin imputaciones dice «sin HH», no 0. Las 19 filas legacy de
                `registros_hh` llegan sin `persona_id` y no se reparten por parecido de nombre: un 0
                acá afirmaría que alguien no trabajó en todo el mes. */}
            {pulso && (
              <Td className="w-[92px]">
                {!pulso.hhDisponible
                  ? <Nulo>sin lectura</Nulo>
                  : pulso.hh.has(p.id)
                    ? (
                        <span data-testid="hh-mes" className="font-mono text-[12px] tabular-nums text-muted">
                          {horasVisibles(pulso.hh.get(p.id) ?? 0)} h
                        </span>
                      )
                    : <Nulo>sin HH</Nulo>}
              </Td>
            )}

            {/* PAPELES — «sin legajo» y «al día» son dos respuestas opuestas que sin la cuenta de
                filas serían los mismos tres ceros: un legajo revisado y uno que nadie abrió nunca. */}
            {conPapeles && (
              <Td className="w-[112px]">
                {(() => {
                  const l = lecturaDePapeles(pulso?.papeles.get(p.id))
                  return l.tono === 'nulo'
                    ? <Nulo>{l.texto}</Nulo>
                    : <Estado tono={l.tono} clave={l.tono} testid="papeles-persona">{l.texto}</Estado>
                })()}
              </Td>
            )}

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
