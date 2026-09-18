# ListaDo

Gestor de tareas de la universidad: entregas, exámenes, prácticas y estudio, con
control de fechas, prioridades, carga de trabajo, compañeros de equipo y horario
de clases. HTML + CSS + JavaScript sin paso de compilación.

Funciona de dos maneras:

- **Sin cuenta** — todo se guarda en el navegador. Basta abrir `index.html`.
- **Con cuenta** (rellenando `js/config.js`) — los datos viven en PostgreSQL
  (Supabase), se sincronizan entre el móvil y el ordenador, y el horario se puede
  compartir con los compañeros de clase mediante un código. Sigue funcionando sin
  conexión: los cambios se encolan y suben solos al volver la red.

## Cómo abrirlo

Opción rápida: doble clic en `index.html`.

Opción recomendada (evita restricciones de algunos navegadores con `file://`):

```bash
python3 servidor.py
```

y abrir <http://localhost:4173>. Ese script es un servidor estático mínimo que
además desactiva la caché del navegador: si editas un `.js` o el `.css`, al
recargar ves el cambio y no la versión antigua.

Ojo: `file://` y `http://localhost:4173` son dos almacenes distintos para el
navegador, así que las tareas guardadas en uno no aparecen en el otro. Elige una
forma de abrirlo y quédate con ella.

La primera vez puedes pulsar **Cargar datos de ejemplo** para ver la app llena y
luego **Borrar todo** cuando quieras empezar en limpio.

Para usarla con cuenta y desde el móvil, mira [Base de datos y cuenta](#base-de-datos-y-cuenta)
y [Publicar en Netlify](#publicar-en-netlify).

## Qué hace

**Asignaturas** — nombre, abreviatura, profesor/a y color. El color identifica a la
asignatura en toda la app (etiquetas, calendario, gráficas).

**Tareas** — título, asignatura, tipo (entrega, examen, práctica, proyecto,
exposición, lectura, estudio, otro), fecha y hora límite, prioridad, estado, horas
estimadas, peso en la
nota, notas libres, subtareas con barra de progreso y **equipo** (los compañeros que
participan).

**Cinco vistas** (barra lateral o teclas `1`–`5`):

| Vista | Para qué sirve |
| --- | --- |
| Panel | Lo urgente de un vistazo: qué clase toca ahora, atrasadas, hoy, próximos 7 días |
| Tareas | Lista completa con filtros (incluido por compañero), orden y agrupación |
| Calendario | Mes a mes, para ver dónde se acumulan las entregas |
| Horario | Rejilla semanal de clases, con la franja de «ahora» y la importación |
| Asignaturas | Ficha de cada una con su carga y su siguiente entrega |
| Equipo | Fichero de compañeros: quién es quién y en qué anda cada uno |
| Estadísticas | Avance, horas pendientes, carga por asignatura y por semana |

**Añadir rápido** (en el Panel) — una línea de texto y listo:

```
Memoria práctica 3 @BBDD !alta mañana ~3h #entrega %20
```

| Sintaxis | Significado |
| --- | --- |
| `@BBDD` | Asignatura (por abreviatura, nombre o iniciales) |
| `!alta` `!media` `!baja` | Prioridad |
| `#entrega` `#examen` `#practica` `#proyecto` `#lectura` `#estudio` | Tipo |
| `~3h` | Horas estimadas |
| `%20` | Peso en la nota (%) |
| `hoy` `mañana` `viernes` `12/03` `+5d` `+2s` `en 3 dias` | Fecha límite |

Lo que no encaje en ningún atajo se queda como título de la tarea.

## Crear una tarea

El formulario es una **pantalla completa** (ya no un diálogo) con el calendario
de clases al lado: al elegir la asignatura se marcan con su color los días en que
tienes clase, con la hora, y aparecen atajos como **«Próxima clase · Lun 21
sept»** y **«La siguiente · Jue 24 sept»** — que es como de verdad se dictan las
entregas. Pulsar uno rellena la fecha y también la hora de inicio de esa clase.

El calendario marca además los días en los que **ya tienes tareas**, con un punto
naranja, para no acumular tres entregas el mismo día.

En el móvil no hay dos columnas: el calendario aparece justo debajo de la fecha,
las casillas son grandes para el dedo y los botones de guardar se quedan pegados
abajo, así que no hay que subir para confirmar. La pantalla tiene su propia URL
(`#/task/<id>`), así que se puede recargar sin perder nada.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `N` | Nueva tarea |
| `/` | Buscar |
| `1`–`7` | Cambiar de vista |
| `Enter` | Guardar (en formularios) / añadir subtarea |
| `Esc` | Cerrar diálogo o menú |

Además: clic en el círculo marca la tarea como hecha, clic en la etiqueta de estado
la va rotando (pendiente → en curso → hecha) y al borrar aparece **Deshacer**
durante unos segundos.

## Equipo

En la vista **Equipo** se guardan los compañeros: nombre, alias, correo, teléfono,
color, las asignaturas que compartís y notas libres («lleva la parte de SQL»,
«coincide conmigo los martes»). El buscador filtra por cualquiera de esos campos.

Dentro de cada tarea hay un apartado **Equipo** con un buscador: escribe y
selecciona a quien participe. Los elegidos aparecen como fichas con avatar, y en
las tarjetas de tarea se ven sus iniciales apiladas. Si escribes un nombre que no
existe, el propio buscador ofrece **crear ese compañero al vuelo**, sin salir del
formulario.

Desde la ficha de un compañero puedes **ver sus tareas** (filtra la lista por él) o
crearle una directamente. Al borrar a alguien, sus tareas no se borran: sólo se le
quita de ellas.

## Horario y qué clase toca ahora

El **Panel** y la vista **Horario** muestran una franja con la clase en curso
(cuánto queda y una barra de avance) y la siguiente («en 1 h 20 min», «mañana a las
10:00»). Se refresca sola cada 30 segundos.

Una nota importante sobre macOS: **una página web no puede leer Calendario.app ni
ningún dato del sistema** —el navegador lo impide por seguridad—. Lo que sí usa
ListaDo es el **reloj y la zona horaria de tu Mac** (`new Date()`), que es
justamente lo que hace falta para saber qué toca ahora. Para meter el horario hay
tres caminos:

1. **A mano** — botón *Clase*. Puedes marcar varios días a la vez y crea una copia
   en cada uno; o pulsar directamente un hueco de la rejilla y se rellena el día y
   la hora.
2. **Archivo `.ics`** — el formato que exportan Calendario.app, Google Calendar y
   casi todos los campus virtuales. Ahí está el puente con macOS: exporta el
   calendario de tus clases y arrástralo. Se leen las repeticiones semanales
   (`RRULE`/`BYDAY`, así que un evento «lunes y jueves» crea las dos clases), se
   respetan `TZID` y las horas en UTC, y se ignoran los eventos de día completo
   (festivos), que no tienen hora.
3. **Lista de texto o `.csv`** — una clase por línea. El separador (`;`, `,` o
   tabulador) se detecta solo, la cabecera es opcional y las horas valen escritas
   de cualquier forma (`9`, `9:00`, `9.30`, `9h`, o un rango junto `9:00-11:00`):

   ```
   dia;inicio;fin;asignatura;aula;profesor
   lunes;09:00;11:00;Programación Avanzada;Aula 2.4;M. Herrero
   X;12:00;14:00;Ética y Sociedad;Aula 0.3
   ```

   Los días valen en número (1 = lunes), por nombre (`lunes`, `lun`, `monday`) o
   por letra (`L M X J V S D`).

Al importar, cada clase se **empareja con tu asignatura** por nombre o abreviatura
para heredar su color; si no existe, se crea (puedes desmarcarlo). Las clases
repetidas se saltan, se avisa línea por línea de lo que no se ha entendido, y hay
una vista previa antes de confirmar. El diálogo también permite reemplazar el
horario entero de golpe.

La vista Horario avisa además de los **solapes** y se puede ver por semana completa
o día a día.

## Base de datos y cuenta

Con `js/config.js` rellenado, ListaDo deja de ser sólo local:

- **PostgreSQL en Supabase** — 9 tablas con claves ajenas y seguridad por filas
  (RLS). El esquema está en [db/schema.sql](db/schema.sql) y sus reglas se
  comprueban con [db/pruebas-locales.sql](db/pruebas-locales.sql).
- **Login** con correo y contraseña, incluido recuperar la contraseña.
- **Local-first** — la app nunca espera a la red. Cada cambio se aplica en
  memoria, se guarda en el navegador y se apunta en una cola que se vacía en
  segundo plano. Veinte ediciones seguidas de la misma tarea se convierten en una
  sola escritura. El indicador de la cabecera dice si todo está subido, si hay
  cambios en cola o si no hay conexión.
- **Conflictos** — gana la escritura más reciente de cada fila. Para una persona
  con dos dispositivos es suficiente.

### Puesta en marcha

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → pegar [db/schema.sql](db/schema.sql) → *Run*. Es reejecutable.
3. **Authentication → Sign In / Providers → Email**: decidir si quieres
   *Confirm email* (con ella activada, el registro pide abrir el correo).
4. **Settings → API**: copiar *Project URL* y la clave *anon public* en
   [js/config.js](js/config.js).

La clave `anon` es pública por diseño y puede ir en el repositorio: lo que
protege los datos son las políticas RLS. La clave `service_role` **no debe
aparecer nunca** en el frontend.

## Grupos: compartir asignaturas y horario

Al registrarte se te crea tu propio **grupo** con un código de 6 caracteres
(`5XQVS6`). Ese grupo es el marco académico: **las asignaturas y el horario le
pertenecen**.

- Pasas el código a un compañero, él lo escribe en **Grupo → Entrar**, y ve tus
  mismas asignaturas y tu mismo horario **en vivo**: si cambias un aula, la ve.
- Sus **tareas y sus compañeros de equipo siguen siendo sólo suyos**. Puede crear
  su tarea sobre tu asignatura de Bases de Datos sin que tú la veas.
- Sólo quien creó el grupo edita las asignaturas y el horario; los demás los ven.
  (Para que todos puedan editarlos, cambia `public.owns_group(group_id)` por
  `true` en las cuatro políticas de escritura de `subjects` y `classes`.)
- **Salir del grupo** te deja una copia propia, ya editable. Al cambiar de grupo,
  tus tareas se reasignan emparejando las asignaturas por nombre o abreviatura.
- El dueño puede **cambiar el código** si se ha repartido de más.

## En el móvil

La navegación está abajo, donde llega el pulgar: una barra fija con las cuatro
vistas de uso diario —**Panel, Tareas, Calendario y Horario**— más **Más**, que
abre un panel deslizante con el resto (Asignaturas, Equipo, Estadísticas, Grupo)
y las opciones de datos. Ocho iconos en una sola barra saldrían a 51 px cada uno
en una pantalla de 412 px, ilegibles; de ahí el reparto.

Los contadores van sobre el icono: las tareas sin terminar en **Tareas** y, en
rojo, las atrasadas en **Panel**. Al crear o editar una tarea la barra se
esconde, porque ahí abajo están los botones de guardar.

## Instalar en el móvil

La app es una PWA. En Chrome para Android, al abrir la web aparece el botón
**Instalar la app** en la barra lateral (o *Añadir a la pantalla de inicio* en el
menú del navegador). Una vez instalada:

- Abre a pantalla completa, sin barra de navegador, con su propio icono.
- Funciona sin conexión: el armazón se guarda en caché y los datos en el
  dispositivo.
- Si dejas el icono pulsado, hay atajos directos a **Nueva tarea** y a **Horario**.

Los datos nunca se guardan en caché: sólo la app. Las llamadas a la base siempre
van a la red, y de lo que no sale se encarga la cola.

## Publicar en Netlify

No hay paso de compilación: se publican los archivos tal cual.

```bash
git init                       # ya hecho, si clonaste este repo
git add -A
git commit -m "ListaDo"
git remote add origin git@github.com:TU-USUARIO/listado.git
git push -u origin main
```

Después, en [app.netlify.com](https://app.netlify.com): *Add new site* → *Import
an existing project* → elige el repositorio. Deja el comando de compilación vacío
y el directorio de publicación en `.` ([netlify.toml](netlify.toml) ya lo
configura, junto con las cabeceras de seguridad).

**Un paso que se olvida:** en Supabase → **Authentication → URL Configuration**,
pon tu dirección de Netlify en *Site URL* y en *Redirect URLs*. Sin eso, el
enlace de recuperar contraseña no vuelve a tu sitio.

## Datos y copias de seguridad

Sin cuenta, todo vive en `localStorage` bajo la clave `listado.v1` y nada sale
del navegador. Con cuenta, la copia local pasa a ser una caché (una por usuario,
`listado.v1.<id>`) y el original está en la base de datos.

El botón **Exportar** sigue funcionando en los dos casos y es la forma de
llevarte los datos fuera de la app.
Como eso significa que los datos están atados a ese navegador y perfil:

- **Exportar** descarga un `.json` con todo (guárdalo de vez en cuando).
- **Importar** restaura una copia (reemplaza lo que haya).
- **Borrar todo** deja la app vacía.

Al cargar, los datos se normalizan: los campos que falten se rellenan y lo inválido
(fechas imposibles, tipos desconocidos, asignaturas inexistentes) se corrige, así
que un archivo editado a mano no rompe la app.

## Estructura

```
servidor.py           Servidor local sin caché, con las cabeceras de producción
netlify.toml          Publicación y cabeceras de seguridad (CSP incluida)
manifest.webmanifest  Datos de la PWA (nombre, iconos, atajos)
sw.js                 Service worker: caché del armazón; nunca de los datos
icons/                Iconos de instalación (192, 512 y maskable)
db/schema.sql         Tablas, RLS y funciones de grupo (PostgreSQL / Supabase)
db/pruebas-locales.sql  38 comprobaciones de seguridad del esquema
index.html            Esqueleto: barra lateral, cabecera, contenedor de vista
css/styles.css        Estilos y tokens de color (tema claro / oscuro / automático)
js/utils.js           DOM, fechas ISO locales, parser de "añadir rápido"
js/icons.js           Juego de iconos SVG en línea
js/importers.js       Lectura de horarios en .ics (iCalendar) y .csv/texto
js/config.js          URL y clave pública de Supabase (vacío = sólo local)
js/api.js             Sesión, lectura y escritura contra la base de datos
js/sync.js            Cola de cambios: sincronización sin bloquear la interfaz
js/auth-ui.js         Pantalla de entrada, registro y recuperación
js/store.js           Modelo, persistencia, CRUD, filtros y consultas
js/ui.js              Piezas reutilizables: tarjeta de tarea, etiquetas, avisos
js/modals.js          Formularios (tarea, asignatura, compañero, clase),
                      importador de horario y confirmaciones
js/views/*.js         Una vista por archivo (dashboard, tasks, calendar,
                      schedule, subjects, team, stats, group) más
                      task-editor.js: crear y editar tareas con el calendario
js/app.js             Rutas por hash, delegación de eventos, atajos, tema, copias
```

Cómo encaja: cualquier cambio pasa por `store`, que guarda y avisa a `app`, que
vuelve a pintar la vista actual. Las vistas sólo generan HTML; los clics se
gestionan por delegación con atributos `data-action`, `data-app`, `data-cal`,
`data-subject` y `data-filter`. Los scripts son clásicos (sin módulos ES) para que
la app también funcione abriendo el archivo directamente.

Las fechas se guardan como `YYYY-MM-DD` en hora local, no como `Date` en UTC: así
una entrega del día 1 no se convierte en día 30 al serializar.

## Iconos

No hay emojis ni librerías externas de iconos: se dibujan como SVG en línea desde
`js/icons.js` (trazo de 24×24, al estilo Lucide). El motivo es práctico —los emojis
cambian de forma en cada sistema operativo y no se pueden colorear, y un CDN de
iconos rompería el uso sin conexión y con `file://`—. Cada icono hereda el color
del texto (`currentColor`) y el tamaño de la fuente, así que funciona igual en tema
claro y oscuro.

Se usan de dos maneras:

- Desde JavaScript: `LD.icons.svg('calendar-days', { cls: 'ic-lg' })`.
- En el HTML estático: `<span data-icon="search"></span>`, que `app.js` rellena al
  arrancar.

Para añadir uno nuevo, mete el contenido del `<svg>` en el registro de
`js/icons.js` y llámalo por su nombre; `LD.icons.names()` lista los disponibles y
avisa por consola si se pide uno que no existe. Ojo: dentro de un `<option>` sólo
cabe texto, así que los desplegables de tipo van sin icono a propósito.

## Ideas para siguientes versiones

- Tareas repetitivas (prácticas semanales, entregas cada dos semanas).
- Semanas A/B en el horario, y avisar de entregas que caen en día de clase.
- Nota media calculada con el peso de cada entrega ya corregida.
- Vista de tablero (kanban) por asignatura.
- Reparto de subtareas entre los compañeros del equipo.
- Recordatorios del navegador y exportación a `.ics` para el calendario del móvil.
- Sincronización en vivo (Supabase Realtime) para ver los cambios al instante en
  el otro dispositivo, sin esperar a volver a la pestaña.
