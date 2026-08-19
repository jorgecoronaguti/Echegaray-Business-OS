// EL FORMULARIO DEL LEGAJO — el mismo para el alta y para la edición.
//
// Separarlos deja que con el tiempo acepten cosas distintas, y el desvío recién se descubre cuando
// un dato cargado por una vía no aparece por la otra. Es el mismo criterio del resto del OS.
//
// ═══ QUÉ NO ESTÁ ACÁ, A PROPÓSITO ═══
//
// `retribucion_pactada`. El dueño no la pidió en la ficha y prohibió mostrarla en la tabla; una
// columna que nadie edita pero que igual viaja al navegador es superficie sin beneficio. Tampoco la
// publica `persona_legajo`, así que ni siquiera llega hasta acá.

import { Campo, CTRL } from '@/shared/components/ui'
import { CATEGORIAS_UOCRA, CATEGORIA_LABEL, esCategoriaDeConvenio, type Persona } from '../types'

/** Ofrece las cuatro del convenio y, si la persona tiene un valor que no es ninguna de ellas, lo
 *  agrega como opción marcada para que guardar no lo borre sin avisar. Hay tres personas reales con
 *  '1591', '6E60' y '004212' —códigos mal importados— y su ficha tiene que poder abrirse. */
function SelectCategoria({ valor }: { valor: string | null }) {
  const fueraDeConvenio = valor && !esCategoriaDeConvenio(valor) ? valor : null
  return (
    <select name="categoria" defaultValue={valor ?? ''} className={CTRL} data-testid="persona-categoria">
      <option value="">sin categoría</option>
      {CATEGORIAS_UOCRA.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
      {fueraDeConvenio && <option value={fueraDeConvenio}>{fueraDeConvenio} — fuera de convenio</option>}
    </select>
  )
}

const MODALIDADES = ['jornal', 'mensual', 'contrato', 'eventual'] as const

function Texto({ name, valor, label, ancho, tipo = 'text', max = 200, ayuda }: {
  name: string; valor: string | null; label: string; ancho?: string
  tipo?: string; max?: number; ayuda?: string
}) {
  return (
    <Campo label={label} ancho={ancho} ayuda={ayuda}>
      <input type={tipo} name={name} maxLength={max} defaultValue={valor ?? ''} className={CTRL} />
    </Campo>
  )
}

/** IDENTIDAD — quién es. Es lo que edita el panel lateral `?editar=identidad`. */
export function CamposIdentidad({ persona }: { persona: Persona | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* UN SOLO CAMPO, y no `nombre` + `apellido`: las 30 fichas reales están cargadas como un
          texto único («PEREZ JUAN CARLOS») y partirlo obliga a adivinar dónde termina el apellido.
          El motivo vive acá, en el código, y no como un párrafo permanente debajo del campo. */}
      <Campo label="Nombre y apellido" ancho="col-span-2">
        <input
          name="nombre_completo" required maxLength={200} className={CTRL}
          defaultValue={persona?.nombre_completo ?? ''} data-testid="persona-nombre"
        />
      </Campo>
      <Texto name="dni" label="DNI" valor={persona?.dni ?? null} max={12} />
      <Texto name="cuil" label="CUIL" valor={persona?.cuil ?? null} max={15} />
      <Texto name="fecha_nacimiento" label="Nacimiento" tipo="date" valor={persona?.fecha_nacimiento ?? null} />
      <Texto name="nacionalidad" label="Nacionalidad" valor={persona?.nacionalidad ?? null} max={80} />
      <Texto name="telefono" label="Teléfono" valor={persona?.telefono ?? null} max={40} />
      <Texto name="email" label="Email" tipo="email" valor={persona?.email ?? null} />
      <Texto name="domicilio" label="Domicilio" ancho="col-span-2" valor={persona?.domicilio ?? null} max={300} />
      <Texto
        name="contacto_emergencia" label="Contacto de emergencia" ancho="col-span-2"
        valor={persona?.contacto_emergencia ?? null} max={200}
      />
      <Texto
        name="contacto_emergencia_telefono" label="Teléfono de emergencia" ancho="col-span-2"
        valor={persona?.contacto_emergencia_telefono ?? null} max={40}
      />
    </div>
  )
}

/** LABORAL — la relación de trabajo. Es lo que edita el panel lateral `?editar=laboral`. */
export function CamposLaboral({ persona }: { persona: Persona | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Texto
        name="legajo" label="Legajo" valor={persona?.legajo ?? null} max={12}
        ayuda="El número de la nómina. Es con el que liquida Jornales."
      />
      <Texto name="fecha_ingreso" label="Ingreso" tipo="date" valor={persona?.fecha_ingreso ?? null} />
      <Texto
        name="fecha_egreso" label="Egreso" tipo="date" valor={persona?.fecha_egreso ?? null}
        ayuda="Cargar la fecha la saca del plantel. Para volver a incorporarla está el botón."
      />
      <Texto name="convenio_colectivo" label="Convenio" valor={persona?.convenio_colectivo ?? null} max={120} />
      <Campo label="Categoría"><SelectCategoria valor={persona?.categoria ?? null} /></Campo>
      <Texto name="especialidad" label="Especialidad" valor={persona?.especialidad ?? null} max={120} />
      <Texto name="puesto" label="Puesto u oficio" valor={persona?.puesto ?? null} max={120} />
      <Campo label="Modalidad">
        <select name="modalidad_liquidacion" defaultValue={persona?.modalidad_liquidacion ?? ''} className={CTRL}>
          <option value="">sin declarar</option>
          {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
          {persona?.modalidad_liquidacion
            && !(MODALIDADES as readonly string[]).includes(persona.modalidad_liquidacion) && (
            <option value={persona.modalidad_liquidacion}>{persona.modalidad_liquidacion}</option>
          )}
        </select>
      </Campo>
      <Texto name="notas" label="Notas" ancho="col-span-2" valor={persona?.notas ?? null} max={300} />
    </div>
  )
}

/**
 * EL ALTA — lo mínimo para que la persona exista, y nada más.
 *
 * El dueño: *"Para altas complejas, formulario progresivo, no una pared de campos."* Dar de alta a
 * alguien en obra pasa con el teléfono en la mano: pedirle veinte campos a quien sólo sabe el nombre
 * y la categoría hace que la carga se posponga, y una persona sin cargar no se puede asignar.
 *
 * El resto del legajo —documento, contacto, domicilio, convenio— se completa después en la ficha,
 * campo por campo, desde el panel lateral. Lo que falta se ve como «sin cargar», que es exactamente
 * lo que es.
 */
export function CamposAlta() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre y apellido" ancho="col-span-2">
        <input
          name="nombre_completo" required maxLength={200} className={CTRL}
          data-testid="persona-nombre" autoFocus
        />
      </Campo>
      <Campo label="Categoría"><SelectCategoria valor={null} /></Campo>
      <Campo label="Puesto u oficio"><input name="puesto" maxLength={120} className={CTRL} /></Campo>
      <Campo label="Ingreso" ancho="col-span-2"><input type="date" name="fecha_ingreso" className={CTRL} /></Campo>
    </div>
  )
}
