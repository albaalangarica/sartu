# Curso de igualdad — publicación en GitHub Pages

## Archivos que debe contener el repositorio

Coloca en la raíz del repositorio `albaalangarica/sartu` estos tres archivos:

1. `index.html`
2. `app.js`
3. `Excel_maestro_curso_igualdad_demo_1.xlsx`

El nombre del Excel debe conservarse exactamente. La web lo busca mediante una ruta relativa y transforma sus hojas en contenido visible cada vez que se carga.

## Publicación

En GitHub, entra en **Settings → Pages** y configura:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/ (root)**

Después guarda. GitHub mostrará la dirección pública cuando termine el despliegue.

## Actualizar el contenido

Para cambiar módulos, materiales, avisos, calendario o progreso, edita el Excel y sustituye en el repositorio el archivo anterior por el nuevo, manteniendo exactamente el mismo nombre y la misma estructura de hojas y encabezados.

La web lee estas hojas: `CONFIGURACION`, `ALUMNOS`, `MODULOS`, `LECCIONES`, `MATERIALES`, `TAREAS`, `PROGRESO`, `CALENDARIO`, `AVISOS` y `ASISTENCIA`.

## Límite de esta versión

GitHub Pages es una publicación estática. Puede leer el Excel, pero no modificarlo. Los cambios hechos desde la web no pueden guardarse en el libro sin añadir una capa intermedia (por ejemplo, Google Apps Script, Supabase o un pequeño servidor). Tampoco debe usarse esta versión para datos personales o contraseñas reales: todo archivo incluido en un repositorio público puede descargarse.

## Prueba local

No abras `index.html` con doble clic, porque el navegador puede bloquear la lectura del Excel. Sirve la carpeta con un servidor local; por ejemplo:

```bash
python -m http.server 8000
```

Después abre `http://localhost:8000`.
