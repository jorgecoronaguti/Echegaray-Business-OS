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
import { AccionesContacto } from './AccionesContacto'
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
  contactos, enEdicion, urlDe, editar, crear, borrar, puedeEditar = true,
}: {
  contactos: Contacto[]
  /** El id del contacto cuyo formulario está abierto, o null. Viene de la URL. */
  enEdicion: string | null
  /** Arma la dirección de esta misma solapa con —o sin— un contacto en edición. */
  urlDe: (contactoId: string | null) => string
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
        <Tabla testid="tabla-contactos" minWidth={620}>
          <THead>
            <Th>Nombre</Th>
            <Th className="w-[170px]">Rol</Th>
            <Th className="w-[220px]">Mail</Th>
            <Th className="w-[140px]">Teléfono</Th>
            {puedeEditar && <Th className="w-[52px]" />}
          </THead>
          <tbody>
            {contactos.map((c) => (
              <FilaContacto
                key={c.id} c={c} abierta={enEdicion === c.id}
                urlDe={urlDe} editar={editar} borrar={borrar} puedeEditar={puedeEditar}
              />
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  )
}

function FilaContacto({
  c, abierta, urlDe, editar, borrar, puedeEditar = true,
}: {
  c: Contacto
  abierta: boolean
  urlDe: (contactoId: string | null) => string
  editar: (contactoId: string) => AccionFormulario
  borrar: (contactoId: string) => Promise<ResultadoAccion>
  puedeEditar?: boolean
}) {
  const columnas = puedeEditar ? 5 : 4
  return (
    <>
      <Tr seleccionada={abierta}>
        <Td fuerte>{c.nombre}</Td>
        <Td>{c.rol ?? <Nulo>sin rol declarado</Nulo>}</Td>
        <Td>
          {c.email
            ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
            : <Nulo>sin mail</Nulo>}
        </Td>
        <Td>
          {c.telefono
            ? <span className="font-mono text-[12.5px] tabular-nums">{c.telefono}</span>
            : <Nulo>sin teléfono</Nulo>}
        </Td>
        {puedeEditar && (
          <Td className="text-right">
            <AccionesContacto
              contactoId={c.id}
              href={urlDe(abierta ? null : c.id)}
              enEdicion={abierta}
              borrar={borrar}
            />
          </Td>
        )}
      </Tr>
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
