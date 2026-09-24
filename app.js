const SHEET_ID = '1rCYDhM3QbOf5ZgHmo-46jk3vQk4oypppvtpHbTmAaL4';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const STORAGE_KEY = 'igualdad-en-practica-progreso-v1';
const INCIDENT_STORAGE_KEY = 'igualdad-en-practica-incidencias-demo-v1';
const EVALUATION_STORAGE_KEY = 'igualdad-en-practica-evaluaciones-demo-v1';

const state = { data: null, page: 'home', month: null, completed: loadCompleted(), currentSessionId: null };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const truthy = value => value === true || ['sí','si','true','1'].includes(String(value).toLowerCase());

window.addEventListener('DOMContentLoaded', () => { bindStatic(); loadCourse(); });

function bindStatic() {
  $('#retry').onclick = loadCourse;
  $$('[data-role]').forEach(button => button.onclick = enter);
  $('#logout').onclick = () => { state.page = 'home'; $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); };
  $('#closeSession').onclick = () => $('#sessionDialog').close();
  $('#closeIncident').onclick = () => $('#incidentDialog').close();
  $('#incidentForm').onsubmit = saveIncident;
  $('#closeEvaluation').onclick = () => $('#evaluationDialog').close();
  $('#evaluationForm').onsubmit = saveEvaluation;
  $('#resourceModule').onchange = renderResources;
  $('#resourceType').onchange = renderResources;
  $('#heroAction').onclick = () => state.currentSessionId ? openSession(state.currentSessionId) : go('program');
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
    const activities = normalizeActivities(calendar.filter(row => row.ID && truthy(row.PUBLICAR)));
    const sessions = groupActivitiesIntoSessions(activities);
    const resources = materials.filter(row => row.ID_MATERIAL && truthy(row.VISIBLE)).map(normalizeResource);
    attachMaterialsToSessions(sessions,resources);
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

async function loadSheet(sheetName) {
  const response = await fetch(`https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(sheetName)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo leer ${sheetName} (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`La pestaña ${sheetName} no tiene un formato válido.`);
  return rows;
}

function normalizeActivities(rows) {
  let previousDate=null,previousDay='',previousModule='';
  return rows.map(row=>{
    const courseDay=String(row.DIA_CURSO||previousDay).trim(),rawModule=String(row.MODULO||'').trim();
    if(rawModule)previousModule=rawModule;
    let date=asDate(row.FECHA); if(!date&&courseDay&&courseDay===previousDay)date=previousDate;
    if(date)previousDate=date; if(courseDay)previousDay=courseDay;
    return { id:String(row.ID), module:rawModule||previousModule||'Próximos módulos', courseDay, weekday:String(row.DIA_SEMANA||'').trim(), date, title:String(row.ACTIVIDAD_PRINCIPAL||row.ACTIVIDADES_ESPECIFICAS||'Actividad del curso').trim(), details:String(row.ACTIVIDADES_ESPECIFICAS||'').trim(), webResource:String(row.RECURSOS_WEB||'').trim(), presentation:String(row.RECURSOS_PRESENTACIONES||'').trim(), link:String(row.ENLACE||'').trim() };
  }).filter(item=>item.date);
}

function groupActivitiesIntoSessions(activities) {
  const groups=new Map();
  activities.forEach(activity=>{
    const dateKey=`${activity.date.getFullYear()}-${activity.date.getMonth()+1}-${activity.date.getDate()}`,key=`${activity.module}|${activity.courseDay||dateKey}|${dateKey}`;
    if(!groups.has(key))groups.set(key,{id:`session-${activity.id}`,module:activity.module,courseDay:activity.courseDay,weekday:activity.weekday,date:activity.date,activities:[]});
    groups.get(key).activities.push(activity);
  });
  return [...groups.values()].map(session=>{
    const titles=unique(session.activities.map(item=>item.title).filter(Boolean));
    return {...session,title:sessionTitle(titles),details:unique(session.activities.map(item=>item.details).filter(Boolean)).join(' · '),links:session.activities.flatMap(item=>[['Contenido',item.link],['Recurso web',item.webResource],['Presentación',item.presentation]].filter(([,url])=>/^https?:\/\//i.test(url)).map(([label,url])=>({label,url,activity:item.title})))};
  }).sort((a,b)=>a.date-b.date);
}

function sessionTitle(titles){if(!titles.length)return'Sesión del curso';if(titles.length===1)return titles[0];return `${titles[0]} y ${titles.length-1} actividades más`;}
function unique(values){return [...new Set(values)]}

function normalizeResource(row) {
  return { id:String(row.ID_MATERIAL), date:asDate(row.FECHA), module:String(row.MODULO||'').trim(), title:String(row.TITULO||'Material del curso').trim(), type:String(row.TIPO||'Material del curso').trim(), link:String(row.ENLACE||'').trim(), sourceRow:String(row.FILA_ORIGEN||'').trim() };
}

function attachMaterialsToSessions(sessions,resources){resources.filter(resource=>/^https?:\/\//i.test(resource.link)).forEach(resource=>{const session=sessions.find(item=>sameDay(item.date,resource.date)&&keyText(item.module)===keyText(resource.module));if(session&&!session.links.some(item=>item.url===resource.link))session.links.push({label:resource.type,url:resource.link,activity:resource.title})})}
function keyText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase()}

function buildModules(sessions) {
  const groups = new Map();
  sessions.forEach(session => { const key=session.module||'Bloque final'; if(!groups.has(key))groups.set(key,[]); groups.get(key).push(session); });
  return [...groups.entries()].map(([name, items], index) => {
    const match=String(name).match(/(?:m[oó]dulo\s*)?(\d+)/i), number=match?Number(match[1]):index;
    return { id:`module-${number}`, number, order:number, available:[0,1].includes(number), name, title:name==='Bloque final'?'Bloque final del curso':name, sessions:items.sort((a,b)=>a.date-b.date), start:items.reduce((min,item)=>!min||item.date<min?item.date:min,null), end:items.reduce((max,item)=>!max||item.date>max?item.date:max,null) };
  }).sort((a,b)=>a.order-b.order);
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(Math.round((value - 25569) * 86400 * 1000));
  const spanish=String(value).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(spanish)return new Date(+spanish[3],+spanish[2]-1,+spanish[1]);
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

function go(page) { state.page=page; $$('.page').forEach(section=>section.classList.toggle('active',section.id===`page-${page}`)); $$('#nav button').forEach(button=>button.classList.toggle('active',button.dataset.page===page)); const button=$(`#nav [data-page="${page}"]`); $('#topTitle').textContent=button?button.textContent.trim():'Aula'; if(page==='program'){ $('#moduleGrid').classList.remove('hidden'); $('#moduleView').classList.add('hidden'); } window.scrollTo({top:0,behavior:'smooth'}); }
function renderAll() { renderHome(); renderModules(); renderResources(); renderPersonal(); renderCalendar(); }

function renderHome() {
  const {cfg,sessions,resources}=state.data, ordered=[...sessions].sort((a,b)=>a.date-b.date), today=startOfDay(new Date()), next=ordered.find(session=>session.date>=today)||ordered[ordered.length-1],currentModule=state.data.modules.find(module=>module.available&&module.sessions.some(session=>session.id===next?.id)),completed=currentModule?.sessions.filter(session=>state.completed.has(session.id)).length||0,progress=currentModule?.sessions.length?completed/currentModule.sessions.length:0;
  $('#homeEyebrow').textContent='Tu aula'; $('#welcome').textContent='Buenos días.'; $('#homeIntro').textContent='Consulta el programa actualizado y continúa tu recorrido por el curso.'; $('#courseEdition').textContent=`Edición ${cfg.EDICION||'2026–2027'}`;
  state.currentSessionId=next?.id||null;
  $('#heroCard').dataset.number=next?.courseDay||'•'; $('#heroTitle').textContent=next?.title||'Programa del curso'; $('#heroText').textContent=next?`${sameDay(next.date,today)?'Sesión de hoy':'Próxima sesión'} · ${fmtDate(next.date)}${next.details?` · ${next.details}`:''}`:'Consulta las sesiones publicadas.'; $('#heroAction').textContent=next?'Ir a la sesión':'Ver programa';
  $('#progressValue').textContent=`${Math.round(progress*100)}%`; $('#progressText').textContent=currentModule?`${currentModule.title} · ${completed} de ${currentModule.sessions.length} sesiones realizadas`:'Todavía no hay un módulo disponible'; $('#progressBar').style.width=`${Math.round(progress*100)}%`;
  $('#nextDate').textContent=next?fmtDate(next.date,{day:'2-digit',month:'short'}):'—'; $('#nextEvent').textContent=next?.title||'Sin sesiones próximas';
  $('#homeNotices').innerHTML=ordered.filter(session=>session.date>=today).slice(0,3).map(sessionRow).join('')||'<div class="card empty">No hay sesiones próximas.</div>';
  $$('[data-home-session]').forEach(button=>button.onclick=()=>openSessionFromProgram(button.dataset.homeSession));
  $('#page-home .section-title h2').textContent='Próximas sesiones'; $('#resourceCount').textContent=`${resources.length} recursos`;
}

function renderModules() {
  const modules=state.data.modules; $('#moduleCount').textContent=`${modules.length} módulos`;
  $('#moduleGrid').innerHTML=modules.map(module=>{const done=module.sessions.filter(session=>state.completed.has(session.id)).length,locked=!module.available,percent=Math.round(done/module.sessions.length*100);return `<article class="card module ${locked?'locked':''}"><span class="module-no">${String(module.number).padStart(2,'0')}</span><span class="tag">${locked?'Próximamente':`${done}/${module.sessions.length}`}</span><h3>${esc(module.title)}</h3><p>${locked?'Este módulo todavía no está disponible.':`${module.sessions.length} sesiones programadas entre ${fmtDate(module.start,{day:'2-digit',month:'short'})} y ${fmtDate(module.end,{day:'2-digit',month:'short'})}.`}</p><div class="module-meta"><span>${module.sessions.length} sesiones</span>${locked?'':`<span>${percent}%</span>`}</div>${locked?'':`<div class="bar"><span style="width:${percent}%"></span></div>`}<button class="ghost" ${locked?'disabled':`data-module="${esc(module.id)}"`}>${locked?'No disponible':'Entrar al módulo'}</button></article>`}).join('');
  $$('[data-module]').forEach(button=>button.onclick=()=>openModule(button.dataset.module));
}

function openModule(id, focusSessionId=null) {
  const module=state.data.modules.find(item=>item.id===id); if(!module||!module.available)return;
  go('program'); $('#moduleGrid').classList.add('hidden');
  const view=$('#moduleView'); view.classList.remove('hidden');
  view.innerHTML=`<div class="module-view-head"><button class="ghost" id="backModules">← Módulos</button><div><p class="eyebrow">${esc(module.name)} · ${module.sessions.length} sesiones</p><h2>${esc(module.title)}</h2></div></div><div class="session-grid">${module.sessions.map(sessionCard).join('')}</div>`;
  $('#backModules').onclick=()=>{view.classList.add('hidden');$('#moduleGrid').classList.remove('hidden');};
  view.querySelectorAll('[data-session]').forEach(button=>button.onclick=()=>openSession(button.dataset.session));
  if(focusSessionId){ const card=view.querySelector(`[data-session-card="${CSS.escape(String(focusSessionId))}"]`); card?.scrollIntoView({behavior:'smooth',block:'center'}); }
}

function sessionCard(session) {
  const done=state.completed.has(session.id),hasResource=sessionLinks(session).length>0;
  return `<article class="card session-card" data-session-card="${esc(session.id)}"><span class="chip">${fmtDate(session.date,{weekday:'long',day:'2-digit',month:'short'})}</span><h3>${esc(session.title)}</h3><p>${esc(session.details||'Consulta el contenido y los materiales de esta sesión.')}</p><div class="session-actions"><button class="primary" data-session="${esc(session.id)}">Abrir sesión</button>${hasResource?'':'<span class="helper">Material pendiente</span>'}${done?'<span class="tag">Realizada ✓</span>':''}</div></article>`;
}

function sessionLinks(session) { return unique((session.links||[]).map(link=>link.url)).map(url=>session.links.find(link=>link.url===url)); }

function openSession(id) {
  const session=state.data.sessions.find(item=>item.id===id); if(!session)return;
  $('#sessionEyebrow').textContent=`${session.module||'Programa'} · ${fmtDate(session.date)}`; $('#sessionTitle').textContent=session.title; $('#sessionDescription').textContent=session.details||'Contenido de la sesión.';
  $('#sessionActivityList').innerHTML=session.activities.map(activity=>`<li><strong>${esc(activity.title)}</strong>${activity.details?`<br><small>${esc(activity.details)}</small>`:''}</li>`).join('');
  const links=sessionLinks(session),done=state.completed.has(session.id); $('#sessionResources').innerHTML=`${links.length?links.map(link=>`<a class="primary" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}${link.activity?` · ${esc(link.activity)}`:''}</a>`).join(''):'<p class="helper">Los materiales de esta sesión se publicarán aquí cuando estén disponibles.</p>'}<button class="${done?'ghost':'primary'}" id="toggleSessionDone">${done?'Marcar como pendiente':'Marcar sesión realizada'}</button>`;
  $('#toggleSessionDone').onclick=()=>{toggleCompleted(session.id);openSession(session.id)};
  if(!$('#sessionDialog').open)$('#sessionDialog').showModal();
}

function renderResources() {
  const published=state.data.resources.filter(resource=>/^https?:\/\//i.test(resource.link)).sort((a,b)=>(a.date||0)-(b.date||0));
  const moduleSelect=$('#resourceModule'),typeSelect=$('#resourceType'),moduleValue=moduleSelect.value,typeValue=typeSelect.value;
  if(moduleSelect.options.length===1)unique(published.map(item=>item.module).filter(Boolean)).forEach(value=>moduleSelect.add(new Option(value,value)));
  if(typeSelect.options.length===1)unique(published.map(item=>item.type).filter(Boolean)).forEach(value=>typeSelect.add(new Option(value,value)));
  moduleSelect.value=moduleValue;typeSelect.value=typeValue;
  const resources=published.filter(item=>(!moduleValue||item.module===moduleValue)&&(!typeValue||item.type===typeValue)); $('#resourceCount').textContent=`${published.length} recursos`;
  $('#resourceGrid').innerHTML=resources.map(resource=>`<article class="card resource"><span class="resource-type">${esc(resource.type)}${resource.module?` · ${esc(resource.module)}`:''}</span><h3>${esc(resource.title)}</h3><p>${resource.date?fmtDate(resource.date):'Material del curso'} · Disponible en línea.</p><a class="ghost" href="${esc(resource.link)}" target="_blank" rel="noopener">Abrir recurso</a></article>`).join('')||'<div class="card empty">No hay materiales publicados con estos filtros.</div>';
}

function renderPersonal() {
  const today=startOfDay(new Date()),available=state.data.modules.filter(module=>module.available),current=available.find(module=>module.start<=today&&module.end>=today)||available.find(module=>module.end>=today)||available[available.length-1],sessions=current?.sessions||[],done=sessions.filter(session=>state.completed.has(session.id)).length,percentage=sessions.length?Math.round(done/sessions.length*100):0,next=state.data.sessions.find(session=>session.date>=today),incidents=loadIncidents(),evaluations=loadEvaluations(),pending=available.filter(module=>module.end<today&&!evaluations.some(item=>item.moduleId===module.id));
  $('#personalProgress').textContent=current?current.title:'Módulo actual';
  const incidentLabels={absence:'Ausencia',late:'Retraso',early:'Salida anticipada',other:'Otra incidencia'};
  const moduleSummary=state.data.modules.map(module=>{const count=module.sessions.filter(session=>state.completed.has(session.id)).length,percent=module.sessions.length?Math.round(count/module.sessions.length*100):0;return `<div class="status-item"><div><strong>${esc(module.title)}</strong><p>${module.available?`${count} de ${module.sessions.length} sesiones realizadas`:'Todavía no disponible'}</p></div><span class="tag">${module.available?`${percent}%`:'Bloqueado'}</span></div>`}).join('');
  $('#personalDashboard').innerHTML=`<article class="card dashboard-card"><p class="eyebrow">Progreso del módulo actual</p><h2>${esc(current?.title||'Sin módulo activo')}</h2><div class="gauge" style="--value:${percentage*1.8}deg"><span class="gauge-value">${percentage}%</span></div><div class="metric-row"><div class="metric"><strong>${done}</strong><span>realizadas</span></div><div class="metric"><strong>${Math.max(0,sessions.length-done)}</strong><span>pendientes</span></div><div class="metric"><strong>${sessions.length}</strong><span>sesiones</span></div></div></article><article class="card dashboard-card"><p class="eyebrow">Siguiente paso</p><h2>${next?esc(next.title):'Curso finalizado'}</h2><p>${next?`${fmtDate(next.date)} · ${esc(next.module)}`:'No hay más sesiones publicadas.'}</p>${next?`<button class="primary" data-dashboard-session="${esc(next.id)}">Continuar</button>`:''}<div class="section"><p class="eyebrow">Evaluaciones</p><div class="status-list">${pending.length?pending.map(module=>`<div class="status-item"><div><strong>${esc(module.title)}</strong><p>Pendiente de completar</p></div><button class="ghost" data-evaluate="${esc(module.id)}">Evaluar</button></div>`).join(''):'<div class="status-item"><div><strong>Al día</strong><p>No tienes evaluaciones pendientes.</p></div><span class="tag">✓</span></div>'}</div></div></article><article class="card dashboard-card full-span"><p class="eyebrow">Progreso por módulos</p><h2>Vista general</h2><div class="status-list">${moduleSummary}</div></article><article class="card dashboard-card full-span"><p class="eyebrow">Ausencias e incidencias</p><h2>Mis comunicaciones</h2><div class="status-list">${incidents.length?incidents.slice().reverse().map(item=>{const session=state.data.sessions.find(candidate=>candidate.id===item.sessionId);return `<div class="status-item"><div><strong>${incidentLabels[item.type]||'Incidencia'} · ${session?fmtDate(session.date):'Sesión'}</strong><p>${esc(item.note||session?.title||'Sin observaciones')}</p></div><span class="tag">Registrada</span></div>`}).join(''):'<div class="status-item"><div><strong>Sin comunicaciones</strong><p>No has registrado ausencias ni incidencias.</p></div></div>'}</div></article>`;
  $$('[data-dashboard-session]').forEach(button=>button.onclick=()=>openSessionFromProgram(button.dataset.dashboardSession));
  $$('[data-evaluate]').forEach(button=>button.onclick=()=>openEvaluation(button.dataset.evaluate));
}

function toggleCompleted(id) { state.completed.has(id)?state.completed.delete(id):state.completed.add(id); localStorage.setItem(STORAGE_KEY,JSON.stringify([...state.completed])); renderPersonal(); renderModules(); renderHome(); }
function loadCompleted() { try{return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'))}catch{return new Set()} }
function completedCount() { return state.data.sessions.filter(session=>state.completed.has(session.id)).length; }

function sessionRow(session) { return `<article class="card row"><strong>${fmtDate(session.date,{day:'2-digit',month:'short'})}</strong><div><strong>${esc(session.title)}</strong><br><small>${esc(session.weekday)}${session.module?` · ${esc(session.module)}`:''}</small></div><button class="ghost" data-home-session="${esc(session.id)}">Ver sesión</button></article>`; }
function renderCalendar() {
  const date=state.month||new Date(),year=date.getFullYear(),month=date.getMonth(); $('#monthTitle').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(date);
  let html=['L','M','X','J','V','S','D'].map(day=>`<div class="weekday">${day}</div>`).join(''); const first=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  for(let index=0;index<first;index++)html+='<div></div>';
  for(let day=1;day<=days;day++){const current=new Date(year,month,day),sessions=state.data.sessions.filter(session=>sameDay(session.date,current));html+=`<div class="day ${[0,6].includes(current.getDay())?'weekend':''} ${sessions.length?'has-event':''}"><strong class="day-number">${day}</strong>${sessions.map(session=>`<button class="calendar-session" data-calendar-session="${esc(session.id)}">${esc(session.title)}</button>`).join('')}${sessions.length?`<div class="day-actions"><button class="add-incident" data-incident="${esc(sessions[0].id)}" aria-label="Comunicar ausencia o incidencia" title="Comunicar ausencia o incidencia">+</button></div>`:''}</div>`}
  $('#calendarGrid').innerHTML=html;
  $$('[data-calendar-session]').forEach(button=>button.onclick=()=>openSessionFromProgram(button.dataset.calendarSession));
  $$('[data-incident]').forEach(button=>button.onclick=()=>openIncident(button.dataset.incident));
}

function openSessionFromProgram(id) {
  const session=state.data.sessions.find(item=>item.id===id),module=state.data.modules.find(item=>item.sessions.some(candidate=>candidate.id===id));
  if(module?.available){openModule(module.id,id);openSession(id);}else{showToast('Este módulo todavía no está disponible.');}
}

function openIncident(id) {
  const session=state.data.sessions.find(item=>item.id===id); if(!session)return;
  $('#incidentSessionId').value=id; $('#incidentSession').textContent=`${fmtDate(session.date)} · ${session.title}`; $('#incidentType').value='absence'; $('#incidentNote').value=''; $('#incidentDialog').showModal();
}

function saveIncident(event) {
  event.preventDefault();
  const records=loadIncidents(),id=$('#incidentSessionId').value;
  records.push({id:`demo-${Date.now()}`,sessionId:id,type:$('#incidentType').value,note:$('#incidentNote').value.trim(),createdAt:new Date().toISOString()});
  localStorage.setItem(INCIDENT_STORAGE_KEY,JSON.stringify(records)); $('#incidentDialog').close(); renderPersonal(); showToast('Comunicación guardada en este dispositivo.');
}

function loadIncidents(){try{return JSON.parse(localStorage.getItem(INCIDENT_STORAGE_KEY)||'[]')}catch{return[]}}
const evaluationQuestions=['Los contenidos del módulo me han resultado útiles.','Las explicaciones han sido claras.','Las actividades me han ayudado a comprender los contenidos.','Puedo aplicar lo aprendido en situaciones reales.','Mi valoración global del módulo es positiva.'];
function openEvaluation(moduleId){const module=state.data.modules.find(item=>item.id===moduleId);if(!module)return;$('#evaluationModule').value=moduleId;$('#evaluationEyebrow').textContent=module.title;$('#evaluationQuestions').innerHTML=evaluationQuestions.map((question,index)=>`<div class="question"><strong>${esc(question)}</strong><div class="scale">${[1,2,3,4,5].map(value=>`<label>${value}<input type="radio" name="evaluation-${index}" value="${value}" required></label>`).join('')}</div></div>`).join('');$('#evaluationComment').value='';$('#evaluationDialog').showModal()}
function saveEvaluation(event){event.preventDefault();const moduleId=$('#evaluationModule').value,records=loadEvaluations(),answers=evaluationQuestions.map((_,index)=>Number(new FormData(event.currentTarget).get(`evaluation-${index}`)));records.push({id:`evaluation-${Date.now()}`,moduleId,answers,comment:$('#evaluationComment').value.trim(),createdAt:new Date().toISOString()});localStorage.setItem(EVALUATION_STORAGE_KEY,JSON.stringify(records));$('#evaluationDialog').close();renderPersonal();showToast('Evaluación guardada. Gracias por tu valoración.')}
function loadEvaluations(){try{return JSON.parse(localStorage.getItem(EVALUATION_STORAGE_KEY)||'[]')}catch{return[]}}
function showToast(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600)}

function startOfDay(date){return new Date(date.getFullYear(),date.getMonth(),date.getDate())}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
window.COURSE_DATA_SOURCE=SHEET_URL;
