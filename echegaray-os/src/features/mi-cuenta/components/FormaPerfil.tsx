'use client'

// LA FOTO Y LOS DATOS PERSONALES — la única parte de Mi cuenta que ESCRIBE en el perfil.
//
// ═══ ARRASTRAR Y SOLTAR, PERO TAMBIÉN UN BOTÓN ═══
//
// El handoff pide arrastrar y soltar. Solo con eso, la foto sería imposible de cambiar desde un
// teléfono —donde no hay nada que arrastrar— y desde un teclado. El área es una etiqueta de un
// input de archivo: se puede soltar encima, tocar, o llegar con el tabulador.
//
// ═══ LOS CAMPOS QUE GOBIERNA ADMINISTRACIÓN NO SE DIBUJAN COMO CAMPOS ROTOS ═══
//
// Cargo y legajo van en `surface-quiet` con su nota al lado. Un `disabled` sin explicación produce
// el mismo llamado telefónico que no mostrarlos: «¿por qué no puedo cambiar mi cargo?».
//
// ═══ Y EL EMAIL NO CAMBIA DE UN CLIC ═══
//
// Cambiarlo dispara una verificación al correo NUEVO. Si cambiara al instante, cualquiera con una
// sesión abierta se queda con la cuenta. La pantalla lo dice antes de que la persona apriete, no
// después.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, Nulo } from '@/shared/components/ds'
import { CAMPO } from '@/shared/components/ds'
import { FormAccion, Campo } from '@/shared/components/ui'
import { guardarPerfil, pedirCambioDeEmail, quitarFoto, subirFoto } from '../services/actions'
import { AVATAR_LADO_MINIMO } from '../types'
import { Avatar } from './Avatar'

export function FormaPerfil({
  nombre, email, telefono, avatarUrl, cargo, legajoNombre, legajoAlta, vinculoDisponible = true,
}: {
  nombre: string
  email: string | null
  telefono: string | null
  avatarUrl: string | null
  cargo: string | null
  legajoNombre: string | null
  legajoAlta: string | null
  /** `false` = la base no tiene todavía la columna del vínculo. La ausencia se explica por su causa
   *  real: mandar a alguien a pedirle a Administración algo que Administración no puede hacer es
   *  peor que no decir nada. */
  vinculoDisponible?: boolean
}) {
  return (
    <section className="min-w-0">
      <Foto nombre={nombre} url={avatarUrl} />

      <h2 className="mt-8 text-[11px] font-medium tracking-[0.04em] text-faint">Datos personales</h2>
      <div className="mt-3">
        <FormAccion accion={guardarPerfil} testid="form-perfil" enviar="Guardar cambios" mensajeOk="Datos guardados.">
          <div className="space-y-3.5">
            <Campo label="Nombre y apellido">
              <input name="nombre" defaultValue={nombre} required minLength={2} maxLength={120} className={CAMPO} />
            </Campo>
            <Campo label="Teléfono" ayuda="A dónde te busca el OS. El del legajo lo administra Administración.">
              <input name="telefono" defaultValue={telefono ?? ''} maxLength={60} className={CAMPO} placeholder="264 15 555-1180" />
            </Campo>
          </div>
        </FormAccion>
      </div>

      <CambioDeEmail email={email} />

      {/* LO QUE DEFINE ADMINISTRACIÓN. Se ve, no se toca, y se dice por qué. */}
      <h2 className="mt-8 text-[11px] font-medium tracking-[0.04em] text-faint">Lo define Administración</h2>
      <div className="mt-3 space-y-3.5">
        <Gobernado rotulo="Cargo" valor={cargo} falta="sin nivel asignado" />
        <Gobernado
          rotulo="Legajo vinculado"
          valor={legajoNombre ? `${legajoNombre}${legajoAlta ? ` · alta ${fechaCorta(legajoAlta)}` : ''}` : null}
          falta={vinculoDisponible
            ? 'tu cuenta no está vinculada a un legajo'
            : 'el vínculo con el legajo todavía no está aplicado en esta base'}
        />
      </div>
    </section>
  )
}

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

function Gobernado({ rotulo, valor, falta }: { rotulo: string; valor: string | null; falta: string }) {
  return (
    <div>
      <span className="mb-1 block text-[12.5px] text-ink-soft">{rotulo}</span>
      <div className="flex h-control items-center justify-between gap-3 rounded-control border border-[#EFEEEA] bg-surface-quiet px-2.5 max-lg:h-control-movil">
        <span className="min-w-0 truncate text-[12.5px] text-muted">{valor ?? falta}</span>
        <span className="shrink-0 text-[11px] text-faint">lo define Administración</span>
      </div>
    </div>
  )
}

/** La foto. Sube al bucket `avatares/<mi id>/…`; la policy de Storage no deja escribir en la carpeta
 *  de otro, así que «cambiar mi foto» no puede convertirse en «cambiarle la foto a otro». */
function Foto({ nombre, url }: { nombre: string; url: string | null }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)

  const enviar = (archivo: File | undefined) => {
    if (!archivo) return
    const form = new FormData()
    form.set('foto', archivo)
    iniciar(async () => {
      setError(null)
      const r = await subirFoto(form)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-5">
        <label
          onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => { e.preventDefault(); setSobre(false); enviar(e.dataTransfer.files[0]) }}
          className={`cursor-pointer rounded-full transition-shadow ${sobre ? 'ring-2 ring-marca' : ''}`}
          data-testid="soltar-foto"
        >
          <Avatar nombre={nombre} url={url} lado={88} />
          <input
            ref={input}
            type="file"
            name="foto"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            data-testid="elegir-foto"
            onChange={(e) => enviar(e.target.files?.[0])}
          />
        </label>

        <div className="min-w-0">
          <div className="text-[16px] font-semibold text-ink">{nombre || <Nulo>sin nombre</Nulo>}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-4">
            <Boton variante="discreta" onClick={() => input.current?.click()} disabled={pendiente} data-testid="cambiar-foto">
              {pendiente ? 'Subiendo…' : 'Cambiar foto'}
            </Boton>
            {url && (
              <Boton
                variante="discreta"
                disabled={pendiente}
                data-testid="quitar-foto"
                onClick={() => iniciar(async () => {
                  setError(null)
                  const r = await quitarFoto()
                  if (!r.ok) setError(r.error)
                  else router.refresh()
                })}
              >Quitar</Boton>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            JPG, PNG o WEBP, mínimo {AVATAR_LADO_MINIMO}×{AVATAR_LADO_MINIMO}. También podés
            arrastrarla encima. Se usa en el header, en los partes y en las cuadrillas.
          </p>
        </div>
      </div>
      {/* El mensaje es el de la fuente: si el bucket no existe todavía, se lee «Bucket not found» y
          no un «no se pudo» que no le sirve a nadie para arreglarlo. */}
      {error && <Aviso tono="neg" testid="error-foto">{error}</Aviso>}
    </div>
  )
}

/** El email de acceso: se muestra siempre, y el formulario de cambio se despliega sólo si se pide. */
function CambioDeEmail({ email }: { email: string | null }) {
  return (
    <div className="mt-6">
      <span className="mb-1 block text-[12.5px] text-ink-soft">Email de acceso</span>
      <div className="flex h-control items-center justify-between gap-3 rounded-control border border-[#EFEEEA] bg-surface-quiet px-2.5 max-lg:h-control-movil">
        <span className="min-w-0 truncate font-mono text-[12.5px] text-muted">{email ?? 'sin email'}</span>
        <span className="shrink-0 text-[11px] text-faint">cambiarlo requiere verificación</span>
      </div>
      <details className="mt-2" data-testid="cambiar-email">
        <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">Cambiar el email de acceso</summary>
        <div className="pt-3">
          <FormAccion
            accion={pedirCambioDeEmail}
            testid="form-email"
            enviar="Enviar verificación"
            mensajeOk="Te mandé un correo a la dirección nueva. El email de acceso cambia recién cuando confirmes ahí."
          >
            <Campo label="Email nuevo" ayuda="Vas a recibir un correo en esa dirección. Hasta que lo confirmes, seguís entrando con el de ahora.">
              <input type="email" name="email" required maxLength={160} className={CAMPO} />
            </Campo>
          </FormAccion>
        </div>
      </details>
    </div>
  )
}
