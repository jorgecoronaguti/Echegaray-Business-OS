import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import { plugin as shadcn } from '@shadcn/lint'

// ═══ @shadcn/lint: EL SISTEMA VISUAL, VERIFICABLE ═══
//
// Existe para una sola cosa: que un agente que escribe pantalla no tenga que adivinar el sistema
// visual del OS ni descubrirlo a fuerza de iteraciones. El error no dice sólo «esto está mal»:
// dice qué componente, qué token y qué variante usar. Eso es lo que se paga en menos vueltas.
//
// ── LO QUE SE MIDIÓ ANTES DE ELEGIR (601 .tsx de src/, las seis reglas en warn, 16/09/2026) ──
//
//   no-inline-styles       15.188 en 279 archivos   ← APAGADA
//   no-arbitrary-values     2.915 en 306 archivos   ← ACOTADA al color a mano
//   no-restyle                536 en  90 archivos   ← warn con `allow: layout` y dos contratos
//   no-unknown-classes        217 en 102 archivos   ← APAGADA: 217 falsos positivos de 217
//   no-raw-colors             202 en  20 archivos   ← warn
//   require-static-classes      6 en   3 archivos   ← corregidas las 6 → ERROR
//
// ── POR QUÉ `no-inline-styles` ESTÁ APAGADA ──
//
// Porque los 15.188 hallazgos NO son un defecto: son el sistema. El patrón del OS es
// `style={{ ...DERECHA, color: V.tinta }}`, con `V` el objeto de tokens medido de los mockups
// (`src/shared/components/v2/patron.tsx`, cada valor citando la línea del `.dc.html` de la que
// sale). Encenderla declararía deuda en todo el frontend y empujaría a un agente a reescribir
// pantallas para llegar a cero. El sistema visual no se cambia para complacer a un linter.
//
// ── POR QUÉ `no-unknown-classes` ESTÁ APAGADA ──
//
// El proyecto usa Tailwind v3.4 y el linter necesita v4 para leer el tema real
// (`__unstable__loadDesignSystem`). Sin eso cae a la gramática que trae el paquete y no conoce
// NINGÚN token propio: los 217 hallazgos son `rounded-control`, `rounded-card`, `h-control`,
// `h-fila`, `h-thead`, `portal-*`… todos declarados en `tailwind.config.ts` o en `globals.css`.
// Una regla que da 217 de 217 falsos positivos no se afina: se apaga. Se reevalúa con v4.
//
// La misma brecha tiene un segundo efecto, menor pero conviene saberlo: sin el tema cargado, los
// marcadores {{suggestions}} y {{tokens}} salen VACÍOS. Y {{variants}} / {{sizes}} también, porque
// el design system declara sus variantes con `Record<Variante, string>` y no con `cva`, que es lo
// único que el linter sabe leer. Por eso los mensajes de abajo nombran los tokens a mano y llevan
// texto de reserva en cada marcador.
//
// ── POR QUÉ `no-arbitrary-values` SÓLO MIRA COLORES ──
//
// Los px del OS están MEDIDOS del handoff (`text-[12.5px]`, `tracking-[-0.01em]`, anchos de
// panel): son decisión de diseño, no descuido. Y peor: por la misma brecha v3/v4, el reemplazo
// que sugiere la regla está calculado con la escala de v4. Se verificó compilando sus 266
// sugerencias con el Tailwind de este proyecto: 185 NO generan CSS (`h-3.75`, `gap-1.25`,
// `w-37.5`, `rounded-xs`, `max-w-95`…). Seguir la guía rompería el estilo en silencio.
// Lo que sí queda: el color escrito a mano (`border-[#E7E6E2]` cuando existe `border-line`),
// donde el problema es real —dos versiones del mismo color— y la guía es correcta.
// Los `[color:var(--os-…)]` quedan fuera a propósito: son la válvula para un token sin utilidad.
//
// ── POR QUÉ `no-restyle` Y `no-raw-colors` VAN EN `warn` Y NO EN `error` ──
//
// Sus hallazgos son deuda REAL —`text-muted` sobre `<Td>`, `text-slate-400` donde hay token—,
// pero llevarlos a cero es tocar decenas de pantallas cambiando píxeles que nadie miró. Eso lo
// mira el dueño antes, no un linter después. La cuenta de cada regla queda anotada en
// `.claude/rules/web.md` y sólo puede bajar.

const NOTA =
  'Tokens: tailwind.config.ts · Componentes: src/shared/components · ' +
  'Reglas y excepciones: .claude/rules/web.md'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    // Sólo `src/`: `orquestador/` es Node, no tiene pantallas ni Tailwind.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { shadcn },
    settings: {
      shadcn: {
        // El design system NO vive en `@/components/ui` (esa carpeta no existe: el alias venía de
        // la plantilla SaaS y quedó fósil — por eso el linter avisaba que no reconocía ningún
        // componente). Vive acá, y el prefijo cubre ds/, ui/, v2/, canon/, movil/ y carga/ de una.
        // `components.json` quedó apuntando al mismo lugar.
        ui: '@/shared/components',
        // No se declaran `mergeFunctions` ni `variantFunctions`: se buscó y este repo no tiene
        // `cn`, `clsx`, `cva`, `twMerge` ni helper propio — las clases se componen con plantillas
        // de texto. Declarar funciones inexistentes sería configuración que no gobierna nada.
        note: NOTA,
      },
    },
    rules: {
      'shadcn/no-restyle': [
        'warn',
        {
          // `layout` = margen, ancho/alto, posición, flex/grid. Colocar un componente es del que
          // lo coloca; pintarlo y medirlo por dentro es del componente.
          allow: ['layout'],
          contracts: [
            {
              // LOS ICONOS TOMAN EL COLOR DEL CONTEXTO. Se dibujan con `currentColor`, así que
              // `text-faint` sobre un `<IconoDocumento>` no está reestilando el componente: le
              // está diciendo en qué tono habla la fila donde está. Es una excepción explícita
              // del sistema — no se silencia archivo por archivo.
              pattern: '^Icono',
              allow: ['layout', 'color'],
            },
            {
              // LOS ESQUELETOS DE CARGA DIBUJAN, NO DECIDEN. `Linea` y `Bloque`
              // (`src/shared/components/carga`) son un rectángulo gris del tamaño que le pidan:
              // su única API es el className. Quien dibuja el esqueleto elige si esa barra es
              // pastilla y si late, porque eso es la FORMA de la pantalla que está por llegar, no
              // la identidad del componente. Se abren esos dos grupos y nada más: el color del
              // hueco sigue siendo del componente.
              pattern: '^(Linea|Bloque)$',
              allow: ['layout', 'rounded', 'animate'],
            },
          ],
          message: {
            color:
              '"{{className}}" pinta <{{component}}> desde afuera. El color lo decide el ' +
              'componente ({{file}}). Si el estado ya existe, usá su variante ' +
              '({{variants|el componente no expone variantes}}); si no existe, se agrega ahí, no acá.',
            typography:
              '"{{className}}" cambia la tipografía de <{{component}}> desde afuera. El cuerpo y ' +
              'el peso son suyos ({{file}}): si hace falta otro tratamiento, va como variante del ' +
              'componente ({{variants|el componente no expone variantes}}), no como clase local.',
            spacing:
              'El espacio interior de <{{component}}> es suyo ({{file}}). Usá un tamaño ' +
              '({{sizes|el componente no expone tamaños}}) o poné el espacio afuera: {{around}}.',
            default:
              '"{{className}}" ({{category}}) no se pone desde afuera en <{{component}}>: ' +
              'pertenece al componente ({{file}}). Reusá lo que ya existe antes de crear otro.',
          },
        },
      ],
      'shadcn/no-raw-colors': [
        'warn',
        {
          message:
            '"{{className}}" es la paleta cruda de Tailwind y el OS no la usa. Tokens: texto ' +
            'text-ink / text-ink-soft / text-muted / text-faint · fondo bg-surface / ' +
            'bg-surface-quiet / bg-surface-sunken / bg-canvas · borde border-line / ' +
            'border-line-strong / border-line-hairline · estado text-pos|neg|warn|info y sus ' +
            '-soft. Están en tailwind.config.ts.',
        },
      ],
      'shadcn/no-arbitrary-values': [
        'warn',
        {
          // `deny` sin `allow` = se revisa SÓLO esto y lo demás queda exento (docs/rules.md).
          // Los px medidos del handoff pasan; el color escrito a mano, no.
          deny: [
            'bg-[#*]',
            'text-[#*]',
            'border-[#*]',
            'divide-[#*]',
            'ring-[#*]',
            'fill-[#*]',
            'stroke-[#*]',
            'from-[#*]',
            'via-[#*]',
            'to-[#*]',
            'shadow-[#*]',
            'outline-[#*]',
            'accent-[#*]',
            'caret-[#*]',
            'decoration-[#*]',
          ],
          message:
            '"{{className}}" clava un color a mano. Ese color ya existe como token del sistema ' +
            '(surface, ink, line, muted, faint, marca, pos, neg, warn, info en ' +
            'tailwind.config.ts): un hex repetido es el sistema visual teniendo dos versiones del ' +
            'mismo color, y la que se corrija va a ser una sola.',
        },
      ],
      'shadcn/require-static-classes': [
        'error',
        {
          message:
            'El className de <{{component}}> se arma en tiempo de ejecución. Tailwind genera el ' +
            'CSS escaneando el texto del archivo: una clase interpolada puede salir sin CSS y ' +
            'dejar el elemento sin estilo. Escribí la clase entera en cada rama del ternario, o ' +
            'pasale al componente una prop de variante y que él elija.',
        },
      ],
      // Apagadas a propósito. El porqué, medido, está en la cabecera de este archivo.
      'shadcn/no-inline-styles': 'off',
      'shadcn/no-unknown-classes': 'off',
    },
  },
  {
    // ═══ UNA FEATURE NO IMPORTA DE OTRA (auditoría externa del 23/09/2026) ═══
    //
    // Medido con rg ese día: 78 imports a `features/auth`, 53 a `features/administracion`, 46 a
    // `features/obras`. Los de auth eran, casi todos, el Rol y las reglas de permiso —eso se mudó a
    // `shared/auth`, que es donde va un concepto que cruzan todos los dominios—. Los demás siguen, y
    // cada uno convierte dos dominios en uno solo: después no se puede tocar ninguno sin romper el
    // otro.
    //
    // VA EN `warn` Y NO EN `error` A PROPÓSITO: hay más de cien y romper el lint hoy obliga a un
    // refactor grande en el medio de la operación. El warning marca lo que se agrega de acá en
    // adelante, que es lo que se quiere frenar. Los imports a `features/auth/types*` quedan
    // permitidos: son las puertas que mantienen vivos los enlaces viejos hacia `shared/auth`.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['warn', {
        patterns: [{
          group: ['@/features/*', '../../*/services/*', '../../*/components/*'],
          message:
            'Una feature no importa de otra: lo compartido va en src/shared/ (o en Postgres, si es un '
            + 'concepto del negocio). Los tipos de identidad y permisos están en @/shared/auth.',
        }],
      }],
    },
  },
  {
    // Las puertas de compatibilidad SÍ reexportan de otro lado: es su único trabajo.
    files: ['src/features/auth/types/index.ts', 'src/features/auth/types/areas.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // EL DESIGN SYSTEM SE ESTILIZA A SÍ MISMO. Un componente que no puede declarar su propio
    // color, su propio alto ni un `ring-[3px]` no es un componente: es una plantilla.
    files: ['src/shared/components/**'],
    rules: {
      'shadcn/no-restyle': 'off',
      'shadcn/no-arbitrary-values': 'off',
      'shadcn/require-static-classes': 'off',
    },
  },
]

export default eslintConfig
