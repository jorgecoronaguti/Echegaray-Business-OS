---
name: autonomia-deploy-y-skills
description: Jorge autorizó explícitamente (2026-07-09) el deploy productivo y una autonomía ampliada para mantener las skills vivas con aprendizaje real -- después de una crisis de confianza real sobre la utilidad práctica del proyecto.
metadata:
  type: feedback
---

Contexto real: después de varios ciclos construyendo capacidades (Operabilidad Real, RLS/auditoría, Personas/Equipos, análisis de los 7 archivos clave), Jorge expresó frustración fuerte y genuina -- "no encuentro utilidad en nada de lo que hemos creado", "lo que sea que hayas hecho en localhost no se puede usar". La causa raíz real, no una excusa: el sistema nunca se desplegó (corría solo en `localhost:3000`), y las 16 skills expertas del proyecto eran marcos bien diseñados pero **nunca habían incorporado un solo aprendizaje real** -- todas decían "primera versión" en sus gaps.

**Autorización explícita obtenida (2026-07-09)**: "autorizo deploy de todo", "incorpora skills", "crea lo q haga falta", "gana autonomia".

**Deploy completado y verificado (2026-07-09)**: `https://echegaray-business-os.vercel.app` — proyecto importado desde GitHub (Root Directory `echegaray-os`), conectado al mismo Supabase real. Confirmado en vivo (`/login` responde 200). Al estar conectado a GitHub, **cada `git push` a `main` redespliega solo** -- Jorge no vuelve a tocar la UI de Vercel para actualizaciones normales.

## Qué cambia a partir de esto

1. **Deploy productivo (Vercel) ya está autorizado de forma permanente para este proyecto.** Redesplegar el mismo proyecto ya aprobado (nuevos commits, mismas variables de entorno) es autónomo -- no hace falta pedir permiso cada vez. Ver [[web-ux-deploy-operacion-producto]] (la skill misma documenta la regla actualizada). Solo requiere aprobación nueva: dar de alta un servicio/infraestructura distinta, dominio pago, upgrade de plan.

2. **Límite estructural real encontrado al ejecutar el primer deploy**: `vercel login` exige OAuth interactivo (navegador, GitHub/Google/email) -- ningún agente puede completarlo en nombre de Jorge. Cuando se necesite un login/autorización interactiva de este tipo (Vercel, un banco, ARCA), no reintentarlo en loop -- documentarlo como bloqueo real y pedir que la persona lo complete una vez; después de ese primer login, lo que sigue sí puede ser autónomo.

3. **Autonomía ampliada para mantener las skills vivas**: actualizar las secciones "Historial de aprendizaje"/"Gaps de conocimiento conocidos" de cualquier skill con hallazgos reales (clasificados correctamente como A/B/C/D/E, nunca inflados a regla sin validación) es ahora autónomo -- no hay que pedir permiso para registrar un aprendizaje real encontrado en la operación. Sigue sin ser autónomo: cualquier decisión de fondo (fiscal, contable, laboral, legal, financiera) que la skill señale como "consultar profesional real".

4. **Se creó `administracion-operativa-construccion`** como 17ª skill -- gap real: ninguna de las 16 anteriores cubría la ejecución administrativa cotidiana (vencimientos recurrentes, archivo de comprobantes, coordinación con el Estudio Contable), distinta de la decisión estratégica de [[gestion-empresarial-riesgos]].

## Por qué importa más allá de este ciclo

La lección de fondo no es técnica: **una skill bien diseñada que nunca se retroalimenta con hallazgos reales de la operación es tan inútil como un sistema que corre solo en localhost.** Ambas fallan por la misma razón -- se construyeron para existir, no para usarse. A partir de ahora, cada vez que una sesión encuentre un hallazgo real que confirme o contradiga un gap ya anotado en una skill, incorporarlo ahí mismo (con su clasificación de riesgo correcta) es parte del trabajo normal, no un paso opcional para "después".
