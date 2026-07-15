# PRP-022: Gestión de usuarios, roles y acceso multiusuario

> **Estado**: PENDIENTE — 2026-07-15
> **Subordinado a**: PRINCIPIO DE CONFIANZA y REALIDAD ÚNICA del `CLAUDE.md` raíz — cada dato tiene propietario y consumidor; sin identidad por persona no hay trazabilidad ni permisos reales.
> **Habilita a**: que Dirección (2), Operaciones (2), Administración y campo usen el mismo OS con lo que les corresponde. Prerrequisito de todo uso real más allá del dueño.

---

## Objetivo

Que cada integrante de Echegaray use el OS con **su identidad**, vea y haga **solo lo de su rol**, y que toda acción quede **atribuida a una persona**. Hoy el canal (extensión↔motor) usa un **token único compartido**: no hay quién-hizo-qué ni permisos por persona.

## Por qué

| Problema | Solución |
|---|---|
| Token único: nadie sabe quién pidió/aprobó qué | Identidad por usuario en el canal; toda operación lleva `principal` real |
| No se puede dar la extensión a otros sin darles todo | Rol define qué ve y qué puede aprobar/ejecutar |
| RLS de Supabase existe pero el canal no la usa | El motor actúa en nombre del usuario, no de un service-role anónimo |

**Valor**: desbloquea el uso por toda la organización (misión: "operador compartido por toda la organización") con control y trazabilidad.

## Estado real verificado (NO reconstruir)

- Tabla `public.perfiles` existe: `id, rol, nombre, timestamps`. **3 perfiles**, roles reales hoy: `direccion`, `jefe_obra`.
- Stack: Supabase Auth + Postgres + **RLS ya habilitada** en las tablas de negocio; muchas tablas ya tienen `creado_por/actualizado_por default auth.uid()`.
- Canal interactivo: **auth por Bearer único** (`ORQ_INTERACTIVE_TOKEN` en `worker.env`) — sin usuario. La extensión (0.8.0) es cliente fino.
- El Work Fabric ya tiene `orq.principals` (agentes) y clearances A–F; falta atar **principal humano** al canal.

## Fases

- **F1 — Identidad en el canal**: el usuario se autentica (Supabase Auth / magic link o Google) en la extensión; el motor valida el JWT y resuelve el `perfil` (id, rol). Reemplaza el token único por identidad por request (el token único queda solo como fallback de servicio interno). Toda `pending_operation`/`aprender`/acción queda con `principal` = ese usuario.
- **F2 — Roles y permisos**: definir el set mínimo real (`direccion`, `jefe_obra`, `administracion`, `campo`) y qué puede cada uno: qué detecciones ve (ej. campo no ve deuda fiscal), qué puede aprobar (solo Dirección aprueba Nivel E), qué obras ve (jefe_obra → sus obras). Mapear rol → capabilities del policy gate ya existente.
- **F3 — Alta/baja de usuarios**: pantalla mínima (solo Dirección) para invitar/dar de baja y asignar rol. Sin construir un IAM completo: lo justo para la organización real (~6-8 personas).
- **F4 — Trazabilidad**: toda acción del OS registra quién la originó y quién la aprobó; visible en Pendientes y en el ledger. Cierra "cada acuerdo tiene responsable" del CLAUDE.md.

## Criterios de éxito
- [ ] Dos personas distintas usan la extensión y el OS las distingue; cada operación queda atribuida a su `perfil`.
- [ ] Un `jefe_obra` NO ve/acciona lo que es exclusivo de `direccion` (verificable con RLS + gate de rol).
- [ ] Alta de un usuario nuevo con su rol sin tocar código.

## Dependencias y acción del dueño
- Depende de **PRP-024** (cuentas Google) si se elige login con Google Workspace.
- Acción del dueño: confirmar el organigrama real (personas × rol) y qué ve/hace cada rol.

## Riesgos
- No sobre-diseñar un sistema de permisos: empezar con 3-4 roles reales, no una matriz de 20 permisos. RLS es la línea de defensa dura; el gate de rol es la UX.
