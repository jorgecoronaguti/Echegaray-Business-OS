// NOTIFICACIONES — qué avisa el OS y por dónde.
//
// ═══ POR QUÉ ESTA PANTALLA NO TIENE UN SOLO INTERRUPTOR ═══
//
// El handoff incluye la solapa. Antes de dibujarla se fue a buscar dónde se guardaría lo que se
// elija, y NO EXISTE: no hay tabla de preferencias, ni de suscripciones, ni una columna en
// `perfiles`. Dibujar seis interruptores que se apagan al recargar sería un mockup —lo que el brief
// prohíbe explícitamente— y, peor, alguien apagaría un aviso creyendo que lo apagó.
//
// Lo que sí se puede hacer, y es lo que hace, es DECIR LA VERDAD: qué se avisa hoy, por qué canal, y
// que elegirlo todavía no se puede. Eso convierte una solapa vacía en una respuesta.
//
// Cuando exista el modelo —una tabla `preferencia_aviso` por usuario y por tipo—, esta pantalla se
// llena y la explicación se va. La deuda queda escrita acá y no en la cabeza de alguien.

import { MiCuentaShell, Dato } from '@/features/mi-cuenta/components/MiCuentaShell'
import { Aviso } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

export default function NotificacionesPage() {
  return (
    <MiCuentaShell
      titulo="Notificaciones"
      descripcion="Qué te avisa el OS, y por dónde."
    >
      <div className="max-w-[620px]">
        <Aviso tono="info" titulo="Todavía no se puede elegir qué recibir" testid="sin-preferencias">
          El OS no guarda preferencias de aviso por persona: no hay dónde. Poner interruptores acá
          daría la sensación de haber apagado algo que se seguiría mandando igual. Cuando existan, se
          configuran desde esta pantalla.
        </Aviso>

        <h2 className="mb-2 mt-8 text-[11px] font-medium tracking-[0.04em] text-faint">Lo que el OS avisa hoy</h2>
        <div className="border-t border-line">
          <Dato rotulo="Chat interno" ancho="w-[170px]">
            Los mensajes del canal de tu obra y lo que se ancle a una actividad o a un impedimento.
          </Dato>
          <Dato rotulo="Reportes" ancho="w-[170px]">
            Los reportes automáticos se publican dentro del OS. No se envían por email ni por
            WhatsApp sin autorización explícita.
          </Dato>
          <Dato rotulo="Tu email" ancho="w-[170px]">
            Sólo lo de la cuenta: verificar un cambio de email y recuperar la contraseña.
          </Dato>
        </div>
      </div>
    </MiCuentaShell>
  )
}
