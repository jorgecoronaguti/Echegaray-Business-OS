// CAMBIAR LA CONTRASEÑA — plegado, con la actual y con la confirmación obligatoria.
//
// Va plegado porque cambiar la contraseña se hace dos veces por año: un formulario abierto de forma
// permanente compite con la información que la pantalla vino a dar.
//
// SE PIDE LA ACTUAL (23/09/2026). Sin ella, una sesión olvidada abierta en cualquier máquina cambia
// la contraseña y deja afuera al dueño de la cuenta. La comprueba el servidor contra Auth
// (`cambiarContrasenaConLaActual`), no esta pantalla.
//
// SE PIDE LA NUEVA DOS VECES A PROPÓSITO. Un error de tipeo deja a la persona afuera del sistema, y
// afuera no puede entrar a arreglarlo: el costo de un campo de más es mucho menor que el de un
// llamado para resetear una cuenta.

import { CAMPO } from '@/shared/components/ds'
import { Campo, FormAccion } from '@/shared/components/ui'
import { cambiarContrasenaConLaActual } from '../services/seguridadActions'

export function CambiarContrasena() {
  return (
    <details data-testid="cambiar-contrasena">
      <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">
        Cambiar la contraseña
      </summary>
      <div className="max-w-[420px] pt-3">
        <FormAccion
          accion={cambiarContrasenaConLaActual}
          testid="form-contrasena"
          enviar="Cambiar la contraseña"
          limpiarAlOk
          mensajeOk="Listo. La próxima vez que entres, usá la nueva."
        >
          <div className="space-y-3.5">
            <Campo label="Contraseña actual">
              <input type="password" name="actual" required autoComplete="current-password" className={CAMPO} />
            </Campo>
            <Campo label="Contraseña nueva" ayuda="Al menos 6 caracteres. Que no sea la que usás en otro lado.">
              <input type="password" name="password" required minLength={6} autoComplete="new-password" className={CAMPO} />
            </Campo>
            <Campo label="Repetila">
              <input type="password" name="password2" required minLength={6} autoComplete="new-password" className={CAMPO} />
            </Campo>
          </div>
        </FormAccion>
      </div>
    </details>
  )
}
