const EXCEL_FILE = 'Excel_maestro_curso_igualdad_demo_1.xlsx';

const state = {
  data: null,
  role: 'student',
  page: 'home',
  month: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const esc = value =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[character]
  );

const truthy = value =>
  value === true ||
  ['sí', 'si', 'true', '1'].includes(String(value).toLowerCase());

const asDate = value => {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  const date = new Date(value);
  return isNaN(date) ? null : date;
};

const fmtDate = (
  value,
  options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }
) => {
  const date = asDate(value);

  return date
    ? new Intl.DateTimeFormat('es-ES', options).format(date)
    : '—';
};

const fmtDateTime = value =>
  fmtDate(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

const pct = value => `${Math.round((Number(value) || 0) * 100)}%`;

window.addEventListener('DOMContentLoaded', () => {
  bindStatic();
  loadExcel();
});

function bindStatic() {
  $('#retry').onclick = loadExcel;

  $('#filePicker').onchange = event => {
    const file = event.target.files[0];

    if (file) {
      file.arrayBuffer()
        .then(parseWorkbook)
        .catch(showError);
    }
  };

  $$('[data-role]').forEach(button => {
    button.onclick = () => enter(button.dataset.role);
  });

  $('#logout').onclick = () => {
    state.page = 'home';
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
  };

  $('#closeDialog').onclick = () => {
    $('#moduleDialog').close();
  };

  $('#heroAction').onclick = () => {
    go('program');

    const module = currentModule();

    if (module) {
      openModule(module.ID_MODULO);
    }
  };

  $('#prevMonth').onclick = () => {
    state.month = new Date(
      state.month.getFullYear(),
      state.month.getMonth() - 1,
      1
    );

    renderCalendar();
  };

  $('#nextMonth').onclick = () => {
    state.month = new Date(
      state.month.getFullYear(),
      state.month.getMonth() + 1,
      1
    );

    renderCalendar();
  };
}

async function loadExcel() {
  $('#loading').classList.remove('hidden');
  $('#errorActions').classList.add('hidden');
  $('#loadingMessage').textContent = 'Leyendo el Excel maestro…';

  try {
    const response = await fetch(encodeURI(EXCEL_FILE), {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`No se encontró ${EXCEL_FILE}`);
    }

    parseWorkbook(await response.arrayBuffer());
  } catch (error) {
    showError(error);
  }
}

function parseWorkbook(buffer) {
  if (!window.XLSX) {
    throw new Error(
      'No se pudo cargar el lector de Excel. Comprueba la conexión a Internet.'
    );
  }

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true
  });

  const requiredSheets = [
    'CONFIGURACION',
    'ALUMNOS',
    'MODULOS',
    'LECCIONES',
    'MATERIALES',
    'PROGRESO',
    'CALENDARIO',
    'AVISOS'
  ];

  const missingSheets = requiredSheets.filter(
    name => !workbook.Sheets[name]
  );

  if (missingSheets.length) {
    throw new Error(
      `Faltan hojas necesarias: ${missingSheets.join(', ')}`
    );
  }

  const sheet = name =>
    XLSX.utils
      .sheet_to_json(workbook.Sheets[name], {
        range: 4,
        defval: null,
        raw: true
      })
      .filter(row =>
        Object.values(row).some(
          value => value !== null && value !== ''
        )
      );

  const configuration = Object.fromEntries(
    sheet('CONFIGURACION').map(row => [
      row.CLAVE,
      row.VALOR
    ])
  );

  state.data = {
    cfg: configuration,
    students: sheet('ALUMNOS'),

    modules: sheet('MODULOS').sort(
      (a, b) => a.ORDEN - b.ORDEN
    ),

    lessons: sheet('LECCIONES'),
    materials: sheet('MATERIALES'),

    tasks: workbook.Sheets.TAREAS
      ? sheet('TAREAS')
      : [],

    progress: sheet('PROGRESO'),
    events: sheet('CALENDARIO'),
    notices: sheet('AVISOS'),

    attendance: workbook.Sheets.ASISTENCIA
      ? sheet('ASISTENCIA')
      : []
  };

  const dates = [
    ...state.data.events.map(event =>
      asDate(event.FECHA_INICIO)
    ),
    ...state.data.modules.map(module =>
      asDate(module.FECHA_APERTURA)
    )
  ]
    .filter(Boolean)
    .sort((a, b) => a - b);

  state.month = dates[0]
    ? new Date(
        dates[0].getFullYear(),
        dates[0].getMonth(),
        1
      )
    : new Date();

  document.documentElement.style.setProperty(
    '--purple',
    configuration.COLOR_PRINCIPAL || '#5B2F78'
  );

  document.documentElement.style.setProperty(
    '--coral',
    configuration.COLOR_ACENTO || '#D46657'
  );

  renderBase();

  $('#loading').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

function showError(error) {
  console.error(error);

  $('#loadingMessage').textContent =
    `No he podido leer el Excel. ${error.message || error}`;

  $('#errorActions').classList.remove('hidden');
}

function renderBase() {
  const { cfg, students } = state.data;

  const courseName =
    cfg.NOMBRE_CURSO || 'Igualdad en práctica';

  $('#brandName').textContent = courseName;
  $('#sideBrand').textContent = courseName;
  document.title = `${courseName} · Aula`;

  const student =
    students.find(item =>
      String(item.ROL)
        .toLowerCase()
        .includes('alumn')
    ) || students[0];

  $('#studentAccess').textContent = student
    ? `Acceder como ${student.NOMBRE}`
    : 'Acceder como alumna';

  $('#teacherAccess').textContent =
    `Acceder como ${cfg.PROFESORA || 'profesora'}`;
}

function enter(role) {
  state.role = role;

  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');

  renderNav();
  renderAll();
  go('home');
}

function renderNav() {
  const studentNavigation = [
    ['home', '⌂', 'Inicio'],
    ['program', '▦', 'Programa'],
    ['calendar', '□', 'Fechas'],
    ['resources', '◇', 'Recursos'],
    ['progress', '↗', 'Progreso']
  ];

  const teacherNavigation = [
    ['home', '⌂', 'Resumen'],
    ['students', '◎', 'Alumnado'],
    ['calendar', '□', 'Calendario'],
    ['notices', '!', 'Avisos'],
    ['resources', '◇', 'Materiales']
  ];

  const items =
    state.role === 'teacher'
      ? teacherNavigation
      : studentNavigation;

  $('#nav').innerHTML = items
    .map(
      ([id, icon, label]) =>
        `<button data-page="${id}">
          <i>${icon}</i>${label}
        </button>`
    )
    .join('');

  $$('#nav button').forEach(button => {
    button.onclick = () => go(button.dataset.page);
  });

  const student = state.data.students[0];

  const teacherName =
    state.data.cfg.PROFESORA || 'Profesora';

  $('#userName').textContent =
    state.role === 'teacher'
      ? teacherName
      : [student?.NOMBRE, student?.APELLIDOS]
          .filter(Boolean)
          .join(' ');

  $('#userRole').textContent =
    state.role === 'teacher'
      ? 'Profesora'
      : 'Alumna';
}

function go(page) {
  state.page = page;

  $$('.page').forEach(section => {
    section.classList.toggle(
      'active',
      section.id === `page-${page}`
    );
  });

  $$('#nav button').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.page === page
    );
  });

  const navigationButton =
    $(`#nav [data-page="${page}"]`);

  $('#topTitle').textContent = navigationButton
    ? navigationButton.textContent.trim()
    : 'Aula';

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function renderAll() {
  renderHome();
  renderModules();
  renderResources();
  renderProgress();
  renderStudents();
  renderNotices();
  renderCalendar();
  renderEvents();
}

function currentStudent() {
  return (
    state.data.students.find(student =>
      String(student.ROL)
        .toLowerCase()
        .includes('alumn')
    ) || state.data.students[0]
  );
}

function studentProgress() {
  const student = currentStudent();

  return state.data.progress.filter(
    progress =>
      !student ||
      progress.ID_ALUMNO === student.ID_ALUMNO
  );
}

function currentModule() {
  const progress = studentProgress();

  const activeProgress = progress.find(item =>
    String(item.ESTADO)
      .toLowerCase()
      .includes('curso')
  );

  return state.data.modules.find(
    module =>
      module.ID_MODULO ===
      (
        activeProgress?.ID_MODULO ||
        state.data.modules[0]?.ID_MODULO
      )
  );
}

function renderHome() {
  const {
    cfg,
    events,
    notices
  } = state.data;

  const student = currentStudent();
  const teacher = cfg.PROFESORA || 'Profesora';
  const module = currentModule();
  const progress = studentProgress();

  const average = progress.length
    ? progress.reduce(
        (sum, item) =>
          sum + (Number(item.PORCENTAJE) || 0),
        0
      ) /
      Math.max(
        state.data.modules.length,
        progress.length
      )
    : 0;

  $('#homeEyebrow').textContent =
    state.role === 'teacher'
      ? 'Panel de profesora'
      : 'Tu aula';

  $('#welcome').textContent =
    `Buenos días, ${
      state.role === 'teacher'
        ? teacher
        : student?.NOMBRE || ''
    }.`;

  $('#homeIntro').textContent =
    state.role === 'teacher'
      ? 'Resumen actualizado con los datos del Excel maestro.'
      : 'Continúa por donde lo dejaste y consulta las próximas fechas.';

  $('#courseEdition').textContent =
    `Edición ${cfg.CURSO || ''}`;

  $('#heroCard').dataset.number = String(
    module?.ORDEN || 1
  ).padStart(2, '0');

  $('#heroTitle').textContent =
    state.role === 'teacher'
      ? 'Estado general del curso'
      : module?.TITULO || 'Programa del curso';

  $('#heroText').textContent =
    state.role === 'teacher'
      ? `${state.data.students.length} alumno/a(s) · ` +
        `${state.data.modules.length} módulos · ` +
        `${state.data.materials.filter(
          item => truthy(item.VISIBLE)
        ).length} materiales visibles`
      : module?.DESCRIPCION ||
        'Consulta los contenidos publicados.';

  $('#heroAction').textContent =
    state.role === 'teacher'
      ? 'Ver programa'
      : 'Abrir módulo';

  $('#progressValue').textContent = pct(average);

  $('#progressText').textContent =
    state.role === 'teacher'
      ? 'Progreso medio registrado'
      : 'Avance total del programa';

  $('#progressBar').style.width = pct(average);

  const upcomingEvent =
    events
      .map(event => ({
        ...event,
        date: asDate(event.FECHA_INICIO)
      }))
      .filter(event =>
        event.date && event.date >= new Date()
      )
      .sort((a, b) => a.date - b.date)[0] ||
    events
      .map(event => ({
        ...event,
        date: asDate(event.FECHA_INICIO)
      }))
      .filter(event => event.date)
      .sort((a, b) => a.date - b.date)[0];

  $('#nextDate').textContent = upcomingEvent
    ? fmtDate(upcomingEvent.date, {
        day: '2-digit',
        month: 'short'
      })
    : '—';

  $('#nextEvent').textContent =
    upcomingEvent?.TITULO ||
    'Sin eventos próximos';

  $('#homeNotices').innerHTML =
    notices
      .filter(
        notice =>
          String(notice.ESTADO).toLowerCase() ===
          'publicado'
      )
      .slice(0, 3)
      .map(noticeHtml)
      .join('') ||
    '<div class="card empty">No hay avisos publicados.</div>';
}

function moduleStatus(module) {
  const progress = studentProgress().find(
    item => item.ID_MODULO === module.ID_MODULO
  );

  if (progress) {
    return {
      label: progress.ESTADO || 'Disponible',
      progress:
        Number(progress.PORCENTAJE) || 0,
      locked: String(progress.ESTADO)
        .toLowerCase()
        .includes('bloq')
    };
  }

  const openingDate =
    asDate(module.FECHA_APERTURA);

  return {
    label:
      openingDate && openingDate > new Date()
        ? 'Próximamente'
        : module.ESTADO || 'Disponible',

    progress: 0,

    locked: Boolean(
      openingDate && openingDate > new Date()
    )
  };
}

function renderModules() {
  const modules = state.data.modules;

  $('#moduleCount').textContent =
    `${modules.length} módulos`;

  $('#moduleGrid').innerHTML = modules
    .map(module => {
      const status = moduleStatus(module);

      return `
        <article class="card module ${
          status.locked ? 'locked' : ''
        }">
          <span class="module-no">
            ${String(module.ORDEN).padStart(2, '0')}
          </span>

          <span class="tag">
            ${esc(status.label)}
          </span>

          <h3>${esc(module.TITULO)}</h3>

          <p>
            ${esc(
              module.DESCRIPCION ||
              'Contenido programado en el itinerario formativo.'
            )}
          </p>

          <div class="module-meta">
            <span>${esc(module.DURACION || '')}</span>

            <span>
              ${
                status.progress
                  ? pct(status.progress)
                  : fmtDate(
                      module.FECHA_APERTURA,
                      {
                        day: '2-digit',
                        month: 'short'
                      }
                    )
              }
            </span>
          </div>

          <button
            class="ghost"
            data-module="${esc(module.ID_MODULO)}"
            ${status.locked ? 'disabled' : ''}
          >
            ${
              status.locked
                ? 'Pendiente'
                : 'Ver contenido'
            }
          </button>
        </article>
      `;
    })
    .join('');

  $$('[data-module]').forEach(button => {
    button.onclick = () =>
      openModule(button.dataset.module);
  });
}

function openModule(id) {
  const module = state.data.modules.find(
    item => item.ID_MODULO === id
  );

  if (!module) return;

  const lessons = state.data.lessons
    .filter(
      lesson =>
        lesson.ID_MODULO === id &&
        truthy(lesson.PUBLICADA)
    )
    .sort((a, b) => a.ORDEN - b.ORDEN);

  $('#dialogEyebrow').textContent =
    `Módulo ${String(module.ORDEN).padStart(2, '0')} · ` +
    `${module.DURACION || ''}`;

  $('#dialogTitle').textContent =
    module.TITULO;

  $('#dialogDescription').textContent =
    module.DESCRIPCION || '';

  $('#lessonList').innerHTML = lessons.length
    ? lessons
        .map(
          lesson => `
            <li>
              <strong>${esc(lesson.TITULO)}</strong>
              <br>
              <small>
                ${esc(lesson.TIPO || 'Contenido')} ·
                ${esc(lesson.MINUTOS || '—')} min
              </small>
            </li>
          `
        )
        .join('')
    : '<li>Las lecciones todavía no están publicadas.</li>';

  $('#moduleDialog').showModal();
}

function renderResources() {
  const resources = state.data.materials
    .filter(item => truthy(item.VISIBLE))
    .sort(
      (a, b) =>
        (a.ORDEN || 0) - (b.ORDEN || 0)
    );

  $('#resourceCount').textContent =
    `${resources.length} recursos`;

  $('#resourceGrid').innerHTML =
    resources
      .map(resource => {
        const validLink =
          /^https?:\/\//.test(
            resource.ENLACE || ''
          );

        return `
          <article class="card resource">
            <span class="resource-type">
              ${esc(resource.TIPO || 'Recurso')} ·
              ${esc(resource.ID_MODULO || 'General')}
            </span>

            <h3>${esc(resource.TITULO)}</h3>

            <p>
              ${
                validLink
                  ? 'Recurso disponible en línea.'
                  : 'Pendiente de incorporar el enlace definitivo.'
              }
            </p>

            ${
              validLink
                ? `
                  <a
                    class="ghost"
                    href="${esc(resource.ENLACE)}"
                    target="_blank"
                    rel="noopener"
                  >
                    Abrir recurso
                  </a>
                `
                : `
                  <button class="ghost" disabled>
                    Pendiente
                  </button>
                `
            }
          </article>
        `;
      })
      .join('') ||
    '<div class="card empty">No hay materiales visibles.</div>';
}

function renderProgress() {
  const progress = studentProgress();
  const modules = state.data.modules;

  $('#progressHeading').textContent =
    state.role === 'teacher'
      ? 'Progreso registrado.'
      : 'Tu progreso.';

  $('#progressIntro').textContent =
    'Una fila por módulo, según la hoja PROGRESO.';

  $('#progressList').innerHTML = modules
    .map(module => {
      const moduleProgress = progress.find(
        item =>
          item.ID_MODULO === module.ID_MODULO
      );

      return `
        <article class="card row">
          <strong>
            ${String(module.ORDEN).padStart(2, '0')} ·
            ${esc(module.TITULO)}
          </strong>

          <div>
            <span>
              ${esc(
                moduleProgress?.ESTADO ||
                'Sin iniciar'
              )}
            </span>

            <div class="bar">
              <span
                style="width:${
                  pct(
                    moduleProgress?.PORCENTAJE || 0
                  )
                }"
              ></span>
            </div>
          </div>

          <strong>
            ${pct(
              moduleProgress?.PORCENTAJE || 0
            )}
          </strong>
        </article>
      `;
    })
    .join('');
}

function renderStudents() {
  const students = state.data.students;

  $('#studentTable').innerHTML = students
    .map(student => {
      const progress = state.data.progress.filter(
        item =>
          item.ID_ALUMNO === student.ID_ALUMNO
      );

      const average = progress.length
        ? progress.reduce(
            (sum, item) =>
              sum +
              (Number(item.PORCENTAJE) || 0),
            0
          ) /
          Math.max(
            progress.length,
            state.data.modules.length
          )
        : 0;

      return `
        <tr>
          <td>
            <strong>
              ${esc(
                [
                  student.NOMBRE,
                  student.APELLIDOS
                ]
                  .filter(Boolean)
                  .join(' ')
              )}
            </strong>
          </td>

          <td>${esc(student.CORREO || '')}</td>

          <td>
            <span class="tag">
              ${esc(student.ESTADO || '')}
            </span>
          </td>

          <td>${pct(average)}</td>

          <td>
            ${fmtDateTime(student.ULTIMO_ACCESO)}
          </td>
        </tr>
      `;
    })
    .join('');
}

function noticeHtml(notice) {
  return `
    <article class="card notice">
      <span class="notice-mark">!</span>

      <div>
        <h3>${esc(notice.TITULO)}</h3>
        <p>${esc(notice.MENSAJE)}</p>
      </div>

      <time>
        ${fmtDateTime(notice.PUBLICACION)}
      </time>
    </article>
  `;
}

function renderNotices() {
  const notices = state.data.notices.sort(
    (a, b) =>
      (asDate(b.PUBLICACION) || 0) -
      (asDate(a.PUBLICACION) || 0)
  );

  $('#noticeList').innerHTML =
    notices.map(noticeHtml).join('') ||
    '<div class="card empty">No hay avisos.</div>';
}

function renderEvents() {
  const events = state.data.events
    .filter(event => truthy(event.VISIBLE))
    .sort(
      (a, b) =>
        (asDate(a.FECHA_INICIO) || 0) -
        (asDate(b.FECHA_INICIO) || 0)
    );

  $('#eventList').innerHTML =
    events
      .map(event => `
        <article class="card row">
          <strong>
            ${fmtDate(event.FECHA_INICIO, {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </strong>

          <div>
            <strong>${esc(event.TITULO)}</strong>
            <br>
            <small>
              ${esc(event.TIPO || 'Evento')} ·
              ${esc(event.ID_MODULO || 'General')}
            </small>
          </div>

          ${
            /^https?:\/\//.test(event.ENLACE || '')
              ? `
                <a
                  class="ghost"
                  href="${esc(event.ENLACE)}"
                  target="_blank"
                  rel="noopener"
                >
                  Abrir
                </a>
              `
              : ''
          }
        </article>
      `)
      .join('') ||
    '<div class="card empty">No hay eventos.</div>';
}

function renderCalendar() {
  const date = state.month || new Date();
  const year = date.getFullYear();
  const month = date.getMonth();

  $('#monthTitle').textContent =
    new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric'
    }).format(date);

  const weekdayNames = [
    'L',
    'M',
    'X',
    'J',
    'V',
    'S',
    'D'
  ];

  let html = weekdayNames
    .map(
      name =>
        `<div class="weekday">${name}</div>`
    )
    .join('');

  const firstWeekday =
    (new Date(year, month, 1).getDay() + 6) % 7;

  const daysInMonth =
    new Date(year, month + 1, 0).getDate();

  for (
    let index = 0;
    index < firstWeekday;
    index++
  ) {
    html += '<div></div>';
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    const currentDate =
      new Date(year, month, day);

    const key =
      currentDate.toISOString().slice(0, 10);

    const events = state.data.events.filter(
      event => {
        const eventDate =
          asDate(event.FECHA_INICIO);

        return (
          eventDate &&
          eventDate.toISOString().slice(0, 10) ===
            key
        );
      }
    );

    const tasks = state.data.tasks.filter(
      task => {
        const deadline =
          asDate(task.FECHA_LIMITE);

        return (
          deadline &&
          deadline.toISOString().slice(0, 10) ===
            key
        );
      }
    );

    const labels = [
      ...events.map(event => event.TITULO),
      ...tasks.map(task => task.TITULO)
    ];

    html += `
      <div class="day ${
        [0, 6].includes(currentDate.getDay())
          ? 'weekend'
          : ''
      } ${labels.length ? 'has-event' : ''}">
        <strong>${day}</strong>

        ${labels
          .slice(0, 2)
          .map(
            label =>
              `<span>${esc(label)}</span>`
          )
          .join('')}
      </div>
    `;
  }

  $('#calendarGrid').innerHTML = html;
}

function toast(message) {
  const element = $('#toast');

  element.textContent = message;
  element.classList.add('show');

  setTimeout(
    () => element.classList.remove('show'),
    2600
  );
}
