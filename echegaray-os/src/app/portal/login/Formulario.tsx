import { IconoAlerta, IconoMail } from '../iconos'

// LA PUERTA DEL PORTAL — sin formulario desde el 25/09/2026.
//
// Hasta ese día acá se escribía el mail y se entraba: sin código ni clave. Quien supiera el correo de
// un contacto veía todo lo de ese cliente. Ahora el cliente entra con su ENLACE PERSONAL, que
// Administración le manda desde la ficha del cliente («Copiar enlace de ingreso»). Esta pantalla sólo
// dice eso, y por qué un enlace dejó de andar, sin confirmar si un mail está habilitado o no.

export function Formulario({ enlaceVencido }: { enlaceVencido: boolean }) {
  return (
    <div className="flex flex-col" data-testid="portal-puerta">
      {/* EL LOGO COMPLETO, no el isotipo: la puerta es donde hay lugar y donde más importa que se
          reconozca de quién es la pantalla. */}
      <img src="/marca/logo.png" alt="Echegaray Construcciones" width={196} height={44}
        className="h-auto w-[196px] max-w-full" />
      <h1 className="mt-[26px] text-[28px] font-semibold tracking-[-.02em]">Ingresá</h1>

      {enlaceVencido ? (
        <p className="mt-5 flex max-w-[420px] items-start gap-[9px] text-neg" data-testid="portal-enlace-vencido">
          <IconoAlerta tamano={18} />
          <span className="text-[13.5px]">Ese enlace ya no sirve: pudo haberse renovado o el acceso cambió.</span>
        </p>
      ) : null}

      <p className="mt-5 flex max-w-[420px] items-start gap-[9px] text-muted">
        <IconoMail tamano={18} />
        <span className="text-[14px] leading-[1.5]">
          Se entra con el <strong className="font-semibold text-ink">enlace personal</strong> que le mandamos.
          Guárdelo: sirve para volver a entrar. Si no lo tiene o dejó de funcionar, pídaselo a su contacto
          en Echegaray Construcciones.
        </span>
      </p>
    </div>
  )
}
