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

import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { Ayuda, CAMPO, Campo, Estado, Nulo, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoBloqueo, IconoCompletar, IconoCrear } from '@/shared/components/iconos'
import {
  TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL, type Actividad, type Restriccion,
} from '../types'
import { fecha } from './formato'

export function BloqueImpedimentos({
  impedimentos, actividades, crear, liberar, hoy = new Date(),
}: {
  /** TODOS los de la obra, abiertos y liberados. El filtro por ventana es de Próximos trabajos. */
  impedimentos: Restriccion[]
  /** Para poder colgar el impedimento de la actividad que frena. Opcional en el formulario. */
  actividades: Actividad[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
  /** Entra por parámetro para que «vencido» se pueda probar en cualquier fecha. */
  hoy?: Date
}) {
  const hoyIso = hoy.toISOString().slice(0, 10)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada')
  const nombreDe = (id: string | null) => (id ? actividades.find((a) => a.id === id)?.nombre ?? null : null)

  // LOS ABIERTOS PRIMERO, y entre ellos el compromiso más viejo arriba: lo vencido es lo que hay
  // que ir a destrabar hoy. Los liberados NO se esconden —son la historia de la obra— pero bajan.
  const orden = [...impedimentos].sort((a, b) => {
    const abiertoA = a.estado !== 'liberada' ? 0 : 1
    const abiertoB = b.estado !== 'liberada' ? 0 : 1
    if (abiertoA !== abiertoB) return abiertoA - abiertoB
    return (a.fecha_compromiso ?? '9999').localeCompare(b.fecha_compromiso ?? '9999')
  })

  return (
    <div className="flex flex-col gap-3.5" data-testid="bloque-impedimentos">
      {impedimentos.length === 0 ? (
        /* EL MATIZ NO SE PERDIÓ, DEJÓ DE SER UN PÁRRAFO. «Nadie los anotó» no es «no hay», y eso
           hay que poder leerlo — una vez, el que entra por primera vez. Clavado en la pantalla se
           lee cero veces y empuja el formulario hacia abajo. */
        <>
          <Vacio>Sin impedimentos anotados.</Vacio>
          <Ayuda titulo="Por qué esto no significa que no haya" testid="ayuda-impedimentos-vacio">
            En una obra en ejecución, un tablero de impedimentos vacío rara vez significa que no
            haya: significa que nadie los anotó. Lo que no está acá no se gestiona.
          </Ayuda>
        </>
      ) : (
        <Tabla testid="tabla-impedimentos" minWidth={720}>
          <THead>
            <Th>Qué frena</Th><Th>Tipo</Th><Th>Responsable</Th><Th num>Compromiso</Th><Th num />
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
                  className={vencido ? 'border-l-[3px] border-l-neg' : ''}
                >
                  <Td fuerte>
                    <span className="flex items-start gap-2">
                      <span className={`mt-[3px] flex shrink-0 ${liberado ? 'text-pos' : vencido ? 'text-neg' : 'text-faint'}`}>
                        {liberado
                          ? <IconoCompletar className="h-[14px] w-[14px]" />
                          : <IconoBloqueo className="h-[14px] w-[14px]" />}
                      </span>
                      <span className="min-w-0">
                        <Estado
                          tono={liberado ? 'pos' : vencido ? 'neg' : 'pendiente'}
                          clave={liberado ? 'liberado' : vencido ? 'vencido' : 'abierto'}
                        >
                          {r.descripcion}
                        </Estado>
                        <span className="mt-0.5 block text-[11px] text-faint">
                          {act ?? 'no frena una actividad en particular'}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td>{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}</Td>
                  <Td>{r.responsable ?? <span className="text-[12.5px] text-warn">sin responsable</span>}</Td>
                  <Td num className={`whitespace-nowrap ${vencido ? 'font-medium text-neg' : 'text-muted'}`}>
                    {r.fecha_compromiso ? fecha(r.fecha_compromiso) : <Nulo>sin fecha</Nulo>}
                    {vencido && ' · vencido'}
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

      <details data-testid="alta-impedimento">
        {/* Sigue siendo `details`/`summary`: es lo que abre sin JavaScript y lo que los tests de
            navegador clican. Lo que cambia es el «+» de texto por el icono de crear del sistema. */}
        <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
          <IconoCrear className="h-[13px] w-[13px]" />
          Anotar impedimento
        </summary>
        <div className="mt-3 border-t border-[#EFEEEA] pt-3.5">
          <FormAccion accion={crear} testid="form-impedimento" enviar="Anotar" limpiarAlOk mensajeOk="Impedimento anotado.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo rotulo="Qué frena el trabajo" className="col-span-2 sm:col-span-4">
                <input name="descripcion" required minLength={3} maxLength={300} className={CAMPO} placeholder="falta el plano de detalle del tanque" />
              </Campo>
              <Campo rotulo="Tipo">
                <select name="tipo" required defaultValue="material" className={CAMPO}>
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
  )
}
