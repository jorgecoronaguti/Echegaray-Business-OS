'use client'

// IMPEDIMENTOS — LO QUE FRENA LA OBRA, ENTERO Y EDITABLE.
//
// El dueño (20/08), textual: *"IMPEDIMENTOS: Este bloque sí debe ser editable. Permitir
// + Impedimento. Campos mínimos: descripción, responsable si existe, fecha, estado, notas. Permitir
// cerrar/resolver. Persistir realmente."* Y los ubicó dentro de **Operación**, junto a pedidos,
// compras, herramientas y movimientos: es lo que la obra necesita para ejecutarse cada día.
//
// ═══ POR QUÉ VIVE ACÁ, Y QUÉ QUEDÓ DONDE ESTABA ═══
//
// El alta y la liberación vivían dentro de «Próximos trabajos», en Cronograma — y ahí la lista
// estaba FILTRADA a los impedimentos que tocaban la ventana de las próximas semanas. Servía para
// planificar; no servía para preguntar «¿qué tiene trabada esta obra?», porque un impedimento sobre
// una actividad de dentro de dos meses simplemente no aparecía. Acá se muestran TODOS.
//
// El Resumen muestra los ABIERTOS, de lectura y sin formulario: dos altas del mismo dato en dos
// pantallas se contestan distinto el día que a una se le agregue un campo. Una sola puerta de
// escritura, y está acá.
//
// SIN JERGA. Adentro el concepto se llama restricción y la tabla `obra_restriccion`; en la pantalla
// se lee «impedimento». El jefe de obra no tiene por qué aprender el vocabulario de un método para
// anotar que le falta un plano.
//
// UN IMPEDIMENTO SIN RESPONSABLE Y SIN FECHA NO ES GESTIÓN, ES UNA QUEJA ANOTADA. Los dos campos son
// obligatorios en el formulario porque son obligatorios en la acción del servidor: si el formulario
// los dejara pasar, el error volvería igual y la carga se perdería.

// ═══ LO QUE AGREGÓ EL DESIGN CANÓNICO (23/08 · pantalla 11) ═══
//
// CHIPS Todo · Sin resolver · Críticos, del lado del cliente: las filas ya viajaron enteras y un
// viaje de red por chip no ahorraría nada. La regla de qué es cada chip vive en
// `orquestador/lib/obra-operacion.mjs`, que es lo único de esta pantalla que se puede probar sin
// navegador.
//
// «+ IMPEDIMENTO» ES EL `summary` DEL MISMO `details` de siempre, pintado como la primaria. No es un
// botón nuevo al lado del viejo: promoverlo era el pedido, y duplicar la puerta de alta habría dado
// dos formularios que el día que a uno se le agregue un campo se contestan distinto. Sigue abriendo
// sin JavaScript, que es lo que clican los tests de navegador.
//
// SELECCIONAR UNA FILA ABRE EL PANEL (patrón de `TabTareas`): estado de cliente, sin navegación, sin
// esqueleto y sin salto de scroll.

import { useState } from 'react'
import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { Ayuda, CAMPO, Campo, Estado, Filtros, Nulo, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoBloqueo, IconoCompletar, IconoCrear } from '@/shared/components/iconos'
import {
  contarImpedimentos, filtrarImpedimentos,
} from '../../../../orquestador/lib/obra-operacion.mjs'
import {
  TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL, type Actividad, type Restriccion,
} from '../types'
import { PanelImpedimento } from './PanelImpedimento'
import { fecha } from './formato'

type Chip = 'todo' | 'sin_resolver' | 'criticos'
const CHIPS: { id: Chip; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'sin_resolver', label: 'Sin resolver' },
  { id: 'criticos', label: 'Críticos' },
]

export function BloqueImpedimentos({
  impedimentos, actividades, crear, liberar, hoy = new Date(), tipoInicial = 'material', vacio,
}: {
  /** TODOS los de la obra, abiertos y liberados. El filtro por ventana es de Próximos trabajos. */
  impedimentos: Restriccion[]
  /** Para poder colgar el impedimento de la actividad que frena. Opcional en el formulario. */
  actividades: Actividad[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
  /** Entra por parámetro para que «vencido» se pueda probar en cualquier fecha. */
  hoy?: Date
  /** El motivo con el que abre el formulario. En la sub-vista Clima ya viene puesto en `clima`. */
  tipoInicial?: string
  /** Qué decir cuando no hay ninguno. La sub-vista Clima dice otra cosa que la de Impedimentos. */
  vacio?: string
}) {
  const hoyIso = hoy.toISOString().slice(0, 10)
  const [chip, setChip] = useState<Chip>('todo')
  const [sel, setSel] = useState<string | null>(null)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada')
  const nombreDe = (id: string | null) => (id ? actividades.find((a) => a.id === id)?.nombre ?? null : null)
  // Los contadores se calculan SIEMPRE sobre la lista entera: un número que cambia según el chip
  // activo no sirve para decidir a cuál ir.
  const cuentaChip = contarImpedimentos(impedimentos, hoyIso) as Record<Chip, number>
  const visibles = filtrarImpedimentos(impedimentos, chip, hoyIso) as Restriccion[]
  const elegido = impedimentos.find((r) => r.id === sel) ?? null

  // LOS ABIERTOS PRIMERO, y entre ellos el compromiso más viejo arriba: lo vencido es lo que hay
  // que ir a destrabar hoy. Los liberados NO se esconden —son la historia de la obra— pero bajan.
  const orden = [...visibles].sort((a, b) => {
    const abiertoA = a.estado !== 'liberada' ? 0 : 1
    const abiertoB = b.estado !== 'liberada' ? 0 : 1
    if (abiertoA !== abiertoB) return abiertoA - abiertoB
    return (a.fecha_compromiso ?? '9999').localeCompare(b.fecha_compromiso ?? '9999')
  })

  return (
    <div className="flex flex-col gap-3.5" data-testid="bloque-impedimentos">
      {/* LA FILA DE MANDO: por dónde mirar (chips) y la única acción que escribe (+ Impedimento).
          El `details` es el de siempre; lo que cambió es que su `summary` se lee como la primaria
          de la pantalla en vez de como un enlace de texto al pie de una tabla. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {impedimentos.length > 0 && (
          <Filtros
            testid="chips-impedimentos"
            opciones={CHIPS.map((c) => ({
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {c.label}
                  <span className="font-mono text-[10.5px] tabular-nums text-faint">{cuentaChip[c.id]}</span>
                </span>
              ),
              onClick: () => setChip(c.id),
              activo: chip === c.id,
              testid: `chip-${c.id}`,
            }))}
          />
        )}
        <details data-testid="alta-impedimento" className="ml-auto w-full sm:w-auto sm:open:w-full">
          {/* Sigue siendo `details`/`summary`: es lo que abre sin JavaScript y lo que los tests de
              navegador clican. */}
          <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md bg-marca px-3.5 py-[7px] text-[12.5px] font-semibold leading-[18px] text-[color:var(--os-on-marca)] hover:brightness-[0.97]">
            <IconoCrear className="h-[13px] w-[13px]" />
            Impedimento
          </summary>
          <div className="mt-3 border-t border-[#EFEEEA] pt-3.5">
            <FormAccion accion={crear} testid="form-impedimento" enviar="Anotar" limpiarAlOk mensajeOk="Impedimento anotado.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo rotulo="Qué frena el trabajo" className="col-span-2 sm:col-span-4">
                  <input name="descripcion" required minLength={3} maxLength={300} className={CAMPO} placeholder="falta el plano de detalle del tanque" />
                </Campo>
                <Campo rotulo="Tipo">
                  <select name="tipo" required defaultValue={tipoInicial} className={CAMPO}>
                    {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Quién lo resuelve" ayuda="Con nombre: sin dueño no se resuelve solo.">
                  <input name="responsable" required minLength={2} maxLength={120} className={CAMPO} />
                </Campo>
                <Campo rotulo="Para cuándo" ayuda="La fecha comprometida, no un deseo.">
                  <input type="date" name="fecha_compromiso" required className={CAMPO} />
                </Campo>
                <Campo rotulo="Actividad que frena" ayuda="Opcional. Si se elige, la barra se marca en el Gantt.">
                  <select name="actividad_id" defaultValue="" className={CAMPO}>
                    <option value="">ninguna en particular</option>
                    {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </Campo>
              </div>
            </FormAccion>
          </div>
        </details>
      </div>

      {impedimentos.length === 0 ? (
        /* EL MATIZ NO SE PERDIÓ, DEJÓ DE SER UN PÁRRAFO. «Nadie los anotó» no es «no hay», y eso
           hay que poder leerlo — una vez, el que entra por primera vez. Clavado en la pantalla se
           lee cero veces y empuja el formulario hacia abajo. */
        <>
          <Vacio>{vacio ?? 'Sin impedimentos anotados.'}</Vacio>
          <Ayuda titulo="Por qué esto no significa que no haya" testid="ayuda-impedimentos-vacio">
            En una obra en ejecución, un tablero de impedimentos vacío rara vez significa que no
            haya: significa que nadie los anotó. Lo que no está acá no se gestiona.
          </Ayuda>
        </>
      ) : (
        /* LA LISTA Y EL PANEL, LADO A LADO EN ESCRITORIO. Debajo de `lg` el panel se pone encima —lo
           resuelve `PanelDetalle`—, así que acá la fila no necesita saber en qué pantalla está. */
        <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
        {orden.length === 0 ? (
          <Vacio>Ninguno con este filtro. Los otros siguen ahí.</Vacio>
        ) : (
        <Tabla testid="tabla-impedimentos" minWidth={720}>
          {/* LAS COLUMNAS SON LAS DEL CANÓNICO 23/08: IMPEDIMENTO · DÓNDE · ESTADO · RESPONSABLE ·
              FECHA. Dos cambios contra la versión anterior, y los dos son de lectura:
              · DÓNDE deja de ser un renglón chico debajo de la descripción y pasa a ser columna. El
                dibujo la pone ahí porque la pregunta de la mañana es «¿dónde está el problema?», y
                un dato que hay que ir a buscar bajo otro se lee después de todos los de su fila.
              · ESTADO deja de ser el color del texto de la descripción y pasa a ser la pastilla del
                sistema. El tono sobre el texto obliga a saber que el rojo quiere decir vencido;
                la pastilla lo escribe.
              TIPO se fue de la tabla porque el canónico no la dibuja — no se perdió: la muestra el
              panel, que es donde se mira un impedimento de a uno. */}
          <THead>
            <Th>Impedimento</Th><Th>Dónde</Th><Th>Estado</Th><Th>Responsable</Th><Th num>Fecha</Th><Th num />
          </THead>
          <tbody>
            {orden.map((r) => {
              const liberado = r.estado === 'liberada'
              const vencido = !liberado && !!r.fecha_compromiso && r.fecha_compromiso < hoyIso
              const act = nombreDe(r.actividad_id)
              return (
                <Tr
                  key={r.id}
                  {...{ 'data-testid': 'fila-impedimento' }}
                  /* LA EXCEPCIÓN SE MARCA CON LA REGLA INTERIOR DE 3px (`COMPONENTS.md`
                     §Transaction row): el compromiso vencido es lo que hay que ir a destrabar hoy y
                     tiene que encontrarse barriendo el borde, sin leer la fila. */
                  /* `seleccionada` y no un fondo propio: la marca de selección del sistema es la
                     regla amarilla a la izquierda, y pintar el fondo a mano acá haría que esta tabla
                     se seleccione distinto de todas las demás del OS. */
                  seleccionada={sel === r.id}
                  className={`cursor-pointer ${vencido ? 'border-l-[3px] border-l-neg' : ''}`}
                  /* Clic en la fila = abrir el detalle. El botón «Liberar» de la última columna
                     sigue siendo un botón: su `onClick` no burbujea hasta acá porque `BotonAccion`
                     vive dentro de su propio formulario, y por eso no hay que frenar el evento. */
                  onClick={() => setSel(sel === r.id ? null : r.id)}
                >
                  <Td fuerte>
                    <span className="flex items-start gap-2">
                      <span className={`mt-[3px] flex shrink-0 ${liberado ? 'text-pos' : vencido ? 'text-neg' : 'text-faint'}`}>
                        {liberado
                          ? <IconoCompletar className="h-[14px] w-[14px]" />
                          : <IconoBloqueo className="h-[14px] w-[14px]" />}
                      </span>
                      <span className="min-w-0">{r.descripcion}</span>
                    </span>
                  </Td>
                  {/* DÓNDE. Sin actividad no se escribe «toda la obra» —eso diría que frena todo—
                      sino la misma frase que ofrece el formulario al elegir. */}
                  <Td className="text-muted">{act ?? <Nulo>ninguna en particular</Nulo>}</Td>
                  <Td>
                    <Estado
                      tono={liberado ? 'pos' : vencido ? 'neg' : 'pendiente'}
                      clave={liberado ? 'liberado' : vencido ? 'vencido' : 'abierto'}
                    >
                      {liberado ? 'Resuelto' : vencido ? 'Vencido' : 'Abierto'}
                    </Estado>
                  </Td>
                  <Td>{r.responsable ?? <span className="text-[12.5px] text-warn">sin responsable</span>}</Td>
                  {/* LA FECHA LLEVA SU VERBO, como en el canónico: «vence 22/08» y «resuelto 16/08»
                      son dos hechos distintos y la columna sola no los distingue. El verbo sale del
                      estado de la fila, no de una segunda fuente. */}
                  <Td num className={`whitespace-nowrap ${vencido ? 'font-medium text-neg' : 'text-muted'}`}>
                    {liberado
                      ? (r.fecha_liberacion
                        ? <>resuelto {fecha(r.fecha_liberacion)}</>
                        : <Nulo>resuelto sin fecha</Nulo>)
                      : r.fecha_compromiso
                        ? <>{vencido ? 'venció' : 'vence'} {fecha(r.fecha_compromiso)}</>
                        : <Nulo>sin fecha</Nulo>}
                  </Td>
                  <Td num>
                    {liberado
                      ? <span className="text-[11px] uppercase tracking-[0.06em] text-faint">liberado</span>
                      : <BotonAccion accion={liberar} args={[r.id]} testid="liberar-impedimento">Liberar</BotonAccion>}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Tabla>
        )}
        </div>
        {elegido && (
          <PanelImpedimento
            impedimento={elegido}
            actividadNombre={nombreDe(elegido.actividad_id)}
            hoyIso={hoyIso}
            liberar={liberar}
            onCerrar={() => setSel(null)}
          />
        )}
        </div>
      )}

      {abiertos.length > 0 && (
        /* `div` y no `p`: `Ayuda` es un `details`, y un `details` dentro de un `p` es HTML
           inválido — el navegador lo saca del párrafo y la hidratación de React se queja. */
        <div className="text-[11.5px] text-faint">
          {abiertos.length} sin resolver de {impedimentos.length}.
          {/* QUÉ HACE «Liberar» va plegado: es ayuda de uso, no un estado que haya que leer. */}
          <Ayuda titulo="Qué pasa al liberar" testid="ayuda-liberar">
            Liberar marca el impedimento resuelto con la fecha de hoy. La fila no se borra: queda
            como historia de la obra, abajo de los abiertos.
          </Ayuda>
        </div>
      )}

    </div>
  )
}
