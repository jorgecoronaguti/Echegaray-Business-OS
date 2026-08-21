// NUEVO PAQUETE — el alta de un subcontrato dentro del alcance de una actividad.
//
// LA ACTIVIDAD SE PIDE EN EL ALTA aunque la base la deje vacía. Un paquete sin actividad vinculada
// no se puede comparar contra hacerlo con gente propia, no descuenta del alcance propio y no sabe
// de qué rubro es: existe, pero no sirve para lo único que esta pantalla decide. Se pide, y si
// alguien igual lo carga suelto la tabla lo dice con todas las letras.
//
// EL PRECIO SÓLO PARA QUIEN VE ECONOMÍA. No se dibuja gris: no se dibuja. Y no viaja por la tabla
// —la 3400 revocó esa columna— sino por `subcontrato_fijar_precio`, en un segundo paso de la misma
// acción, para que un rechazo del precio no se lleve puesta el alta entera.

import { CAMPO, Campo, Plegable } from '@/shared/components/ds'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import type { ActividadElegible } from '../services/subcontratosService'

export function FormNuevoPaquete({
  actividades, economia, accion,
}: {
  actividades: ActividadElegible[]
  economia: boolean
  accion: AccionFormulario
}) {
  return (
    <Plegable titulo="Nuevo paquete" testid="abrir-nuevo-paquete">
      <FormAccion
        accion={accion}
        testid="form-nuevo-paquete"
        enviar="Crear el paquete"
        limpiarAlOk
        mensajeOk="Paquete creado."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Qué se subcontrata" ayuda="Ej.: «Tabiques de yeso · Eje 1–4»">
            <input name="nombre" className={CAMPO} required maxLength={120} />
          </Campo>
          <Campo rotulo="Subcontratista" ayuda="El nombre tal como se lo conoce en obra.">
            <input name="proveedor_texto" className={CAMPO} maxLength={120} />
          </Campo>
          <Campo rotulo="Dentro de qué actividad" ayuda="Sin esto no hay contra qué compararlo.">
            <select name="actividad_id" className={CAMPO} defaultValue="">
              <option value="">— elegir —</option>
              {actividades.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.seccion ? `${a.seccion} · ` : ''}{a.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Cantidad">
              <input name="cantidad" type="number" step="0.01" min="0" className={CAMPO} />
            </Campo>
            <Campo rotulo="Unidad">
              <input name="unidad" className={CAMPO} maxLength={12} placeholder="m²" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Inicio de plan"><input name="fecha_inicio_plan" type="date" className={CAMPO} /></Campo>
            <Campo rotulo="Fin de plan"><input name="fecha_fin_plan" type="date" className={CAMPO} /></Campo>
          </div>
          {economia && (
            <Campo rotulo="Precio contratado" ayuda="Se guarda por la función con portero económico.">
              <input name="precio_contratado" type="number" step="0.01" min="0" className={CAMPO} />
            </Campo>
          )}
          <Campo rotulo="Alcance, en palabras" className="sm:col-span-2">
            <input name="alcance" className={CAMPO} maxLength={300} />
          </Campo>
        </div>
      </FormAccion>
    </Plegable>
  )
}
