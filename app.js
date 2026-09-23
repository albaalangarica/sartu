const SHEET_ID = '1rCYDhM3QbOf5ZgHmo-46jk3vQk4oypppvtpHbTmAaL4';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const STORAGE_KEY = 'igualdad-en-practica-progreso-v1';

const state = { data: null, page: 'home', month: null, completed: loadCompleted() };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const truthy = value => value === true || ['sí','si','true','1'].includes(String(value).toLowerCase());

window.addEventListener('DOMContentLoaded', () => { bindStatic(); loadCourse(); });

function bindStatic() {
  $('#retry').onclick = loadCourse;
  $$('[data-role]').forEach(button => button.onclick = enter);
  $('#logout').onclick = () => { state.page = 'home'; $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); };
  $('#closeDialog').onclick = () => $('#moduleDialog').close();
  $('#heroAction').onclick = () => go('calendar');
  $('#prevMonth').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); };
  $('#nextMonth').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); };
}

async function loadCourse() {
  $('#loading').classList.remove('hidden');
  $('#login').classList.add('hidden');
  $('#errorActions').classList.add('hidden');
  $('#loadingMessage').textContent = 'Conectando con el programa del curso…';
  try {
    const [configuration, calendar, materials] = await Promise.all([
      loadSheet('CONFIGURACION'), loadSheet('CALENDARIO_WEB'), loadSheet('MATERIALES_WEB')
    ]);
    const cfg = Object.fromEntries(configuration.map(row => [row.CLAVE, row.VALOR]));
    const sessions = calendar.filter(row => row.ID && truthy(row.PUBLICAR)).map(normalizeSession).filter(row => row.date);
    const resources = materials.filter(row => row.ID_MATERIAL && truthy(row.VISIBLE)).map(normalizeResource);
    if (!sessions.length) throw new Error('El calendario no contiene sesiones publicables.');
    state.data = { cfg, sessions, resources, modules: buildModules(sessions) };
    const firstDate = [...sessions].sort((a, b) => a.date - b.date)[0].date;
    state.month = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    renderBase();
    $('#loading').classList.add('hidden');
    $('#login').classList.remove('hidden');
  } catch (error) {
    console.error(error);
    $('#loadingMessage').textContent = `No he podido conectar con el programa. ${error.message || error}`;
    $('#errorActions').classList.remove('hidden');
  }
}

function loadSheet(sheetName) {
  return new Promise((resolve, reject) => {
    const callback = `sheetCallback_${sheetName.replace(/\W/g, '')}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error(`Tiempo de espera agotado al leer ${sheetName}.`)), 15000);
    function finish(error, rows) { clearTimeout(timer); delete window[callback]; script.remove(); error ? reject(error) : resolve(rows); }
    window[callback] = response => {
      if (!response || response.status === 'error') {
        const message = response?.errors?.[0]?.detailed_message || `No se pudo leer ${sheetName}.`;
        finish(new Error(message)); return;
      }
      const columns = response.table.cols.map((column, index) => column.label || column.id || `COL_${index}`);
      const rows = response.table.rows.map(row => Object.fromEntries(columns.map((column, index) => {
        const cell = row.c[index]; return [column, cell ? (cell.v ?? cell.f ?? '') : ''];
      })));
      finish(null, rows);
    };
    script.onerror = () => finish(new Error('El Google Sheets no está disponible para lectura pública.'));
    const tqx = encodeURIComponent(`out:json;responseHandler:${callback}`);
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=${tqx}&sheet=${encodeURIComponent(sheetName)}&headers=1`;
    document.head.appendChild(script);
  });
}

function normalizeSession(row) {
  return { id:String(row.ID), module:String(row.MODULO||'').trim(), courseDay:row.DIA_CURSO||'', weekday:String(row.DIA_SEMANA||'').trim(), date:asDate(row.FECHA), title:String(row.ACTIVIDAD_PRINCIPAL||row.ACTIVIDADES_ESPECIFICAS||'Sesión del curso').trim(), details:String(row.ACTIVIDADES_ESPECIFICAS||'').trim(), webResource:String(row.RECURSOS_WEB||'').trim(), presentation:String(row.RECURSOS_PRESENTACIONES||'').trim(), link:String(row.ENLACE||'').trim() };
}

function normalizeResource(row) {
  return { id:String(row.ID_MATERIAL), date:asDate(row.FECHA), module:String(row.MODULO||'').trim(), title:String(row.TITULO||'Material del curso').trim(), type:String(row.TIPO||'Material del curso').trim(), link:String(row.ENLACE||'').trim() };
}

function buildModules(sessions) {
  const groups = new Map();
  sessions.forEach(session => { const key=session.module||'Bloque final'; if(!groups.has(key))groups.set(key,[]); groups.get(key).push(session); });
  return [...groups.entries()].map(([name, items], index) => ({ id:`module-${index+1}`, order:index+1, name, title:name==='Bloque final'?'Bloque final del curso':name, sessions:items.sort((a,b)=>a.date-b.date), start:items.reduce((min,item)=>!min||item.date<min?item.date:min,null), end:items.reduce((max,item)=>!max||item.date>max?item.date:max,null) }));
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
  const gviz=String(value).match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if(gviz)return new Date(+gviz[1],+gviz[2],+gviz[3],+(gviz[4]||0),+(gviz[5]||0),+(gviz[6]||0));
  const date=new Date(value); return Number.isNaN(date.getTime())?null:date;
}

function fmtDate(value, options={day:'2-digit',month:'short',year:'numeric'}) { const date=asDate(value); return date?new Intl.DateTimeFormat('es-ES',options).format(date):'—'; }

function renderBase() { const name=state.data.cfg.NOMBRE_CURSO||'Igualdad en práctica'; $('#brandName').textContent=name; $('#sideBrand').textContent=name; document.title=`${name} · Aula`; }
function enter() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); renderNav(); renderAll(); go('home'); }

function renderNav() {
  const items=[['home','⌂','Inicio'],['program','▦','Programa'],['calendar','□','Calendario'],['resources','◇','Recursos'],['progress','◎','Panel personal']];
  $('#nav').innerHTML=items.map(([id,icon,label])=>`<button data-page="${id}"><i>${icon}</i>${label}</button>`).join('');
  $$('#nav button').forEach(button=>button.onclick=()=>go(button.dataset.page));
  $('#userName').textContent='Mi aula'; $('#userRole').textContent='Alumna';
}

function go(page) { state.page=page; $$('.page').forEach(section=>section.classList.toggle('active',section.id===`page-${page}`)); $$('#nav button').forEach(button=>button.classList.toggle('active',button.dataset.page===page)); const button=$(`#nav [data-page="${page}"]`); $('#topTitle').textContent=button?button.textContent.trim():'Aula'; window.scrollTo({top:0,behavior:'smooth'}); }
function renderAll() { renderHome(); renderModules(); renderResources(); renderPersonal(); renderCalendar(); renderEvents(); }

function renderHome() {
  const {cfg,sessions,resources}=state.data, ordered=[...sessions].sort((a,b)=>a.date-b.date), today=startOfDay(new Date()), next=ordered.find(session=>session.date>=today)||ordered[ordered.length-1], completed=completedCount(), progress=sessions.length?completed/sessions.length:0;
  $('#homeEyebrow').textContent='Tu aula'; $('#welcome').textContent='Buenos días.'; $('#homeIntro').textContent='Consulta el programa actualizado y continúa tu recorrido por el curso.'; $('#courseEdition').textContent=`Edición ${cfg.EDICION||'2026–2027'}`;
  $('#heroCard').dataset.number=next?.courseDay||'•'; $('#heroTitle').textContent=next?.title||'Programa del curso'; $('#heroText').textContent=next?`${fmtDate(next.date)}${next.details?` · ${next.details}`:''}`:'Consulta las sesiones publicadas.'; $('#heroAction').textContent='Ver calendario';
  $('#progressValue').textContent=`${Math.round(progress*100)}%`; $('#progressText').textContent=`${completed} de ${sessions.length} sesiones marcadas como realizadas`; $('#progressBar').style.width=`${Math.round(progress*100)}%`;
  $('#nextDate').textContent=next?fmtDate(next.date,{day:'2-digit',month:'short'}):'—'; $('#nextEvent').textContent=next?.title||'Sin sesiones próximas';
  $('#homeNotices').innerHTML=ordered.filter(session=>session.date>=today).slice(0,3).map(sessionRow).join('')||'<div class="card empty">No hay sesiones próximas.</div>';
  $('#page-home .section-title h2').textContent='Próximas sesiones'; $('#resourceCount').textContent=`${resources.length} recursos`;
}

function renderModules() {
  const modules=state.data.modules; $('#moduleCount').textContent=`${modules.length} bloques`;
  $('#moduleGrid').innerHTML=modules.map(module=>{const done=module.sessions.filter(session=>state.completed.has(session.id)).length;return `<article class="card module"><span class="module-no">${String(module.order).padStart(2,'0')}</span><span class="tag">${done}/${module.sessions.length}</span><h3>${esc(module.title)}</h3><p>${module.sessions.length} actividades programadas entre ${fmtDate(module.start,{day:'2-digit',month:'short'})} y ${fmtDate(module.end,{day:'2-digit',month:'short'})}.</p><div class="module-meta"><span>${module.sessions.length} sesiones</span><span>${Math.round(done/module.sessions.length*100)}%</span></div><button class="ghost" data-module="${esc(module.id)}">Ver contenido</button></article>`}).join('');
  $$('[data-module]').forEach(button=>button.onclick=()=>openModule(button.dataset.module));
}

function openModule(id) { const module=state.data.modules.find(item=>item.id===id); if(!module)return; $('#dialogEyebrow').textContent=`${module.name} · ${module.sessions.length} sesiones`; $('#dialogTitle').textContent=module.title; $('#dialogDescription').textContent=`${fmtDate(module.start)} — ${fmtDate(module.end)}`; $('#lessonList').innerHTML=module.sessions.map(session=>`<li><strong>${fmtDate(session.date,{day:'2-digit',month:'short'})} · ${esc(session.title)}</strong>${session.details?`<br><small>${esc(session.details)}</small>`:''}</li>`).join(''); $('#moduleDialog').showModal(); }

function renderResources() {
  const resources=[...state.data.resources].sort((a,b)=>(a.date||0)-(b.date||0)); $('#resourceCount').textContent=`${resources.length} recursos`;
  $('#resourceGrid').innerHTML=resources.map(resource=>{const valid=/^https?:\/\//i.test(resource.link);return `<article class="card resource"><span class="resource-type">${esc(resource.type)}${resource.module?` · ${esc(resource.module)}`:''}</span><h3>${esc(resource.title)}</h3><p>${resource.date?fmtDate(resource.date):'Material del curso'}${valid?' · Disponible en línea.':' · Enlace pendiente de publicación.'}</p>${valid?`<a class="ghost" href="${esc(resource.link)}" target="_blank" rel="noopener">Abrir recurso</a>`:'<button class="ghost" disabled>Pendiente</button>'}</article>`}).join('')||'<div class="card empty">Todavía no hay materiales publicados.</div>';
}

function renderPersonal() {
  const sessions=[...state.data.sessions].sort((a,b)=>a.date-b.date), completed=completedCount(), percentage=sessions.length?Math.round(completed/sessions.length*100):0; $('#personalProgress').textContent=`${percentage}% completado`;
  $('#progressList').innerHTML=sessions.map(session=>{const checked=state.completed.has(session.id);return `<article class="card row"><strong>${fmtDate(session.date,{day:'2-digit',month:'short'})}</strong><div><strong>${esc(session.title)}</strong><br><small>${esc(session.module||'Bloque final')}</small></div><button class="${checked?'primary':'ghost'}" data-complete="${esc(session.id)}">${checked?'Realizada ✓':'Marcar realizada'}</button></article>`}).join('');
  $$('[data-complete]').forEach(button=>button.onclick=()=>toggleCompleted(button.dataset.complete));
}

function toggleCompleted(id) { state.completed.has(id)?state.completed.delete(id):state.completed.add(id); localStorage.setItem(STORAGE_KEY,JSON.stringify([...state.completed])); renderPersonal(); renderModules(); renderHome(); }
function loadCompleted() { try{return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'))}catch{return new Set()} }
function completedCount() { return state.data.sessions.filter(session=>state.completed.has(session.id)).length; }

function sessionRow(session) { return `<article class="card row"><strong>${fmtDate(session.date,{day:'2-digit',month:'short'})}</strong><div><strong>${esc(session.title)}</strong><br><small>${esc(session.weekday)}${session.module?` · ${esc(session.module)}`:''}</small></div>${/^https?:\/\//i.test(session.link)?`<a class="ghost" href="${esc(session.link)}" target="_blank" rel="noopener">Abrir</a>`:''}</article>`; }
function renderEvents() { const sessions=[...state.data.sessions].sort((a,b)=>a.date-b.date); $('#eventList').innerHTML=sessions.map(sessionRow).join('')||'<div class="card empty">No hay sesiones publicadas.</div>'; }

function renderCalendar() {
  const date=state.month||new Date(),year=date.getFullYear(),month=date.getMonth(); $('#monthTitle').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(date);
  let html=['L','M','X','J','V','S','D'].map(day=>`<div class="weekday">${day}</div>`).join(''); const first=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  for(let index=0;index<first;index++)html+='<div></div>';
  for(let day=1;day<=days;day++){const current=new Date(year,month,day),sessions=state.data.sessions.filter(session=>sameDay(session.date,current));html+=`<div class="day ${[0,6].includes(current.getDay())?'weekend':''} ${sessions.length?'has-event':''}"><strong>${day}</strong>${sessions.slice(0,2).map(session=>`<span>${esc(session.title)}</span>`).join('')}</div>`}
  $('#calendarGrid').innerHTML=html;
}

function startOfDay(date){return new Date(date.getFullYear(),date.getMonth(),date.getDate())}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
window.COURSE_DATA_SOURCE=SHEET_URL;
