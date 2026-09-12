// CONTACTOS — con quién se habla en la empresa del cliente.
//
// ═══ POR QUÉ LA EDICIÓN VIAJA EN LA URL ═══
//
// `?contacto=<id>` abre el formulario debajo de esa fila. La página es un componente de servidor: sin
// esto habría que volverla de cliente entera para tener un botón que despliega un formulario. Además
// la dirección queda compartible —«corregile el teléfono a éste»— y volver atrás cierra la edición,
// que es lo que el navegador ya sabe hacer.
//
// ═══ EDITAR EXISTE PORQUE BORRAR Y RECARGAR NO ES EDITAR ═══
//
// Hasta acá sólo había alta y baja: corregir un dígito de un teléfono obligaba a borrar la persona y
// volver a cargarla, y con eso se perdía la fecha en la que entró a la relación — que es un evento
// de la solapa Actividad. Un dato histórico no se puede tirar para arreglar un typo.
//
// ═══ LA AUSENCIA SE DICE POR SU NOMBRE (Design Handoff V2) ═══
//
// Había un «—» en teléfono, en cargo y en email. Un guión no dice nada: quien lo mira no sabe si el
// contacto no tiene teléfono, si nadie lo cargó, o si la columna se rompió. El handoff lo pide
// explícito —*"«sin teléfono» cuando falta"*— y es la regla 8 de UX_PRINCIPLES aplicada a texto.

import { Nulo, Tabla, THead, Th, Tr, Td, Vacio } from '@/shared/components/ds'
import { Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { AbrirAcciones, AccionEnlace, AccionesContacto, LineaDeAcciones } from './AccionesContacto'
import type { Contacto } from '../types'

function CamposContacto({ c }: { c?: Contacto }) {
  const v = (x: string | null | undefined) => x ?? ''
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Campo label="Nombre" ancho="col-span-2"><input name="nombre" defaultValue={v(c?.nombre)} required minLength={2} maxLength={120} className={CTRL} /></Campo>
      <Campo label="Cargo o función" ancho="col-span-2"><input name="rol" defaultValue={v(c?.rol)} maxLength={120} className={CTRL} placeholder="jefe de compras" /></Campo>
      <Campo label="Teléfono" ancho="col-span-2"><input name="telefono" defaultValue={v(c?.telefono)} maxLength={60} className={CTRL} /></Campo>
      <Campo label="Email" ancho="col-span-2"><input type="email" name="email" defaultValue={v(c?.email)} maxLength={160} className={CTRL} /></Campo>
      <Campo label="Notas" ancho="col-span-2 sm:col-span-4"><input name="notas" defaultValue={v(c?.notas)} maxLength={400} className={CTRL} /></Campo>
    </div>
  )
}

export function BloqueContactos({
  contactos, enEdicion, menuAbierto, urlDe, urlMenuDe, editar, crear, borrar, puedeEditar = true,
}: {
  contactos: Contacto[]
  /** El id del contacto cuyo formulario está abierto, o null. Viene de la URL. */
  enEdicion: string | null
  /** El id del contacto cuya línea de acciones está abierta. Uno a la vez, porque es un parámetro. */
  menuAbierto: string | null
  /** Arma la dirección de esta misma solapa con —o sin— un contacto en edición. */
  urlDe: (contactoId: string | null) => string
  /** Ídem para la línea de acciones. */
  urlMenuDe: (contactoId: string | null) => string
  editar: (contactoId: string) => AccionFormulario
  crear: AccionFormulario
  borrar: (contactoId: string) => Promise<ResultadoAccion>
  /** Ver el contacto de un cliente es operativo; administrar la agenda, no. */
  puedeEditar?: boolean
}) {
  return (
    <div className="space-y-3" data-testid="contactos-cliente">
      {/* EL ALTA VA ARRIBA. Debajo de una lista larga, «agregar un contacto» no la encuentra nadie
          —y el bloque se queda vacío para siempre—. */}
      {puedeEditar && (
        <details className="rounded-card border border-line bg-surface" data-testid="alta-contacto">
          <summary className="cursor-pointer select-none px-3.5 py-2 text-[12.5px] text-ink">+ Agregar contacto</summary>
          <div className="border-t border-line p-3.5">
            <FormAccion accion={crear} testid="form-contacto" enviar="Agregar" limpiarAlOk mensajeOk="Contacto agregado.">
              <CamposContacto />
            </FormAccion>
          </div>
        </details>
      )}

      {contactos.length === 0 ? (
        <Vacio>Este cliente no tiene contactos cargados. Se agregan acá.</Vacio>
      ) : (
        <Tabla testid="tabla-contactos" minWidth={240}>
          <THead>
            <Th>Contacto</Th>
            {puedeEditar && <Th className="w-[52px]" />}
          </THead>
          <tbody>
            {contactos.map((c) => (
              <FilaContacto
                key={c.id} c={c} abierta={enEdicion === c.id} menu={menuAbierto === c.id}
                urlDe={urlDe} urlMenuDe={urlMenuDe} editar={editar} borrar={borrar}
                puedeEditar={puedeEditar}
              />
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  )
}

function FilaContacto({
  c, abierta, menu, urlDe, urlMenuDe, editar, borrar, puedeEditar = true,
}: {
  c: Contacto
  abierta: boolean
  menu: boolean
  urlDe: (contactoId: string | null) => string
  urlMenuDe: (contactoId: string | null) => string
  editar: (contactoId: string) => AccionFormulario
  borrar: (contactoId: string) => Promise<ResultadoAccion>
  puedeEditar?: boolean
}) {
  const columnas = puedeEditar ? 2 : 1
  return (
    <>
      <Tr seleccionada={abierta || menu}>
        {/* ═══ UN CONTACTO POR RENGLÓN, NO CUATRO COLUMNAS (dueño, 12/09/2026) ═══

            Eran cuatro columnas —nombre, rol, mail, teléfono— en una tabla de 620px de ancho mínimo,
            y este bloque vive en el COSTADO de la ficha, que mide 300. La tabla se desplazaba adentro
            del panel y lo que quedaba a la vista era «jmillan@juar…»: medido a 1280, el mail arranca
            en x=1189 y termina en 1354, con el costado terminando en 1260. Un dato que exige arrastrar
            una barra horizontal de 300px para leerse no está publicado.

            Apilado, el mail entra entero en el ancho que hay. Se queda como TABLA —y no como una lista
            suelta— porque la línea de acciones expande DENTRO de la fila (`colSpan`), que es la forma
            que el handoff pide para poder mostrar el error de la base al lado de la acción. */}
        <Td fuerte className="py-2">
          <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
            <span>{c.nombre}</span>
            <span className="text-[12px] text-ink-soft">
              {c.rol ?? <Nulo>sin rol declarado</Nulo>}
              {' · '}
              {c.telefono
                ? <span className="font-mono tabular-nums">{c.telefono}</span>
                : <Nulo>sin teléfono</Nulo>}
            </span>
            {/* SIN MAIL NO SE LE PUEDE MANDAR NADA: ni la invitación al portal, ni el recordatorio
                de cobranza. Va en ÁMBAR y no en el gris de las demás ausencias porque bloquea, que
                es la definición de `warn` del sistema.

                `break-all` y no `truncate`: una dirección de correo no se abrevia. Cortarla por la
                mitad de una palabra es feo y es legible; cortarla con puntos suspensivos la vuelve
                inútil, que es de lo que se quejó el dueño. El `title` viaja igual para copiarla. */}
            {c.email
              ? (
                  <a
                    href={`mailto:${c.email}`} title={c.email}
                    className="break-all text-[12px] hover:underline"
                  >
                    {c.email}
                  </a>
                )
              : <span className="text-[12.5px] text-warn" data-testid="contacto-sin-mail">sin mail cargado</span>}
          </div>
        </Td>
        {puedeEditar && (
          <Td className="align-top text-right">
            <AbrirAcciones
              href={urlMenuDe(menu ? null : c.id)}
              abierto={menu}
              etiqueta="Acciones del contacto"
              testid="acciones-contacto"
            />
          </Td>
        )}
      </Tr>
      {menu && puedeEditar && (
        <LineaDeAcciones columnas={columnas} testid="acciones-contacto-abierto">
          <AccionEnlace
            href={urlDe(abierta ? null : c.id)}
            testid={abierta ? 'cerrar-contacto' : 'editar-contacto'}
          >
            {abierta ? 'Cerrar edición' : 'Editar'}
          </AccionEnlace>
          <AccionesContacto contactoId={c.id} borrar={borrar} />
        </LineaDeAcciones>
      )}
      {abierta && (
        <tr className="border-b border-[#EFEEEA] bg-surface-quiet">
          <td colSpan={columnas} className="py-3">
            <FormAccion accion={editar(c.id)} testid="form-editar-contacto" enviar="Guardar" mensajeOk="Contacto guardado.">
              <CamposContacto c={c} />
            </FormAccion>
          </td>
        </tr>
      )}
    </>
  )
}
