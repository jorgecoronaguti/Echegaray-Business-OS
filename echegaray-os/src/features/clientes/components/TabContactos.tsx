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

import Link from 'next/link'
import { BotonAccion, Callout, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
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

export function TabContactos({
  contactos, enEdicion, urlDe, editar, crear, borrar,
}: {
  contactos: Contacto[]
  /** El id del contacto cuyo formulario está abierto, o null. Viene de la URL. */
  enEdicion: string | null
  /** Arma la dirección de esta misma solapa con —o sin— un contacto en edición. */
  urlDe: (contactoId: string | null) => string
  editar: (contactoId: string) => AccionFormulario
  crear: AccionFormulario
  borrar: (contactoId: string) => Promise<ResultadoAccion>
}) {
  return (
    <div className="space-y-3">
      {contactos.length === 0 ? (
        <Callout tono="neutral">
          Este cliente no tiene contactos cargados. Se agregan acá abajo.
        </Callout>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table data-testid="tabla-contactos" className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium">Cargo</th>
                <th className="px-3 py-2.5 font-medium">Teléfono</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {contactos.map((c) => (
                <FilaContacto
                  key={c.id} c={c} abierta={enEdicion === c.id}
                  urlDe={urlDe} editar={editar} borrar={borrar}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-xl border border-line bg-white" data-testid="alta-contacto">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">Agregar un contacto</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={crear} testid="form-contacto" enviar="Agregar" limpiarAlOk mensajeOk="Contacto agregado.">
            <CamposContacto />
          </FormAccion>
        </div>
      </details>
    </div>
  )
}

function FilaContacto({
  c, abierta, urlDe, editar, borrar,
}: {
  c: Contacto
  abierta: boolean
  urlDe: (contactoId: string | null) => string
  editar: (contactoId: string) => AccionFormulario
  borrar: (contactoId: string) => Promise<ResultadoAccion>
}) {
  return (
    <>
      <tr className={`border-b border-line/60 ${abierta ? 'bg-slate-50' : ''}`}>
        <td className="px-4 py-2.5 text-[13px] text-ink">{c.nombre}</td>
        <td className="px-3 py-2.5 text-[12px] text-muted">{c.rol ?? '—'}</td>
        <td className="px-3 py-2.5 text-[12px] tabular-nums text-muted">{c.telefono ?? '—'}</td>
        <td className="px-3 py-2.5 text-[12px] text-muted">
          {c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : '—'}
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="inline-flex items-center gap-2">
            <Link
              href={urlDe(abierta ? null : c.id)}
              data-testid={abierta ? 'cerrar-contacto' : 'editar-contacto'}
              className="rounded-control border border-line px-2.5 py-1 text-[12px] text-muted hover:bg-slate-50"
            >{abierta ? 'Cerrar' : 'Editar'}</Link>
            <BotonAccion accion={borrar} args={[c.id]} testid="borrar-contacto" tono="peligro">Borrar</BotonAccion>
          </span>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-line/60 bg-slate-50">
          <td colSpan={5} className="px-4 py-3">
            <FormAccion accion={editar(c.id)} testid="form-editar-contacto" enviar="Guardar" mensajeOk="Contacto guardado.">
              <CamposContacto c={c} />
            </FormAccion>
          </td>
        </tr>
      )}
    </>
  )
}
