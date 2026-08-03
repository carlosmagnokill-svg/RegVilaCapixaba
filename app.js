
const AUTH_CONFIG={csvUrl:'./acesso.csv',maxAttempts:5,lockMinutes:3,attemptsKey:'ebdAuthAttempts',lockUntilKey:'ebdAuthLockUntil',sessionKey:'ebdAuthenticated'};
let AUTH_RECORD=null,lockTimer=null;
function b64ToBytes(v){const b=atob(v);return Uint8Array.from(b,c=>c.charCodeAt(0))}
function bytesToB64(bytes){let b='';bytes.forEach(x=>b+=String.fromCharCode(x));return btoa(b)}
async function deriveHash(password,salt,iterations){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:b64ToBytes(salt),iterations:Number(iterations)},key,256);
  return bytesToB64(new Uint8Array(bits));
}
function safeEqual(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
function getAttempts(){return Number(localStorage.getItem(AUTH_CONFIG.attemptsKey)||0)}
function setAttempts(v){localStorage.setItem(AUTH_CONFIG.attemptsKey,String(v))}
function getLockUntil(){return Number(localStorage.getItem(AUTH_CONFIG.lockUntilKey)||0)}
function updateAttempts(){document.getElementById('attemptsInfo').textContent=`Tentativas restantes: ${Math.max(0,AUTH_CONFIG.maxAttempts-getAttempts())}`}
function formatCountdown(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`}
function clearLock(){localStorage.removeItem(AUTH_CONFIG.lockUntilKey);setAttempts(0);if(lockTimer){clearInterval(lockTimer);lockTimer=null}}
function applyLock(){
  const lockUntil=getLockUntil();
  const remain=lockUntil-Date.now();
  const input=document.getElementById('passwordInput');
  const btn=document.getElementById('loginBtn');
  const msg=document.getElementById('loginMessage');

  // Não existe bloqueio ativo: mantém a contagem atual de tentativas.
  if(!lockUntil){
    input.disabled=false;
    btn.disabled=false;
    updateAttempts();
    return false;
  }

  // O bloqueio existia e acabou: só então zera as tentativas.
  if(remain<=0){
    clearLock();
    input.disabled=false;
    btn.disabled=false;
    msg.textContent='';
    updateAttempts();
    if(lockTimer){
      clearInterval(lockTimer);
      lockTimer=null;
    }
    return false;
  }

  input.disabled=true;
  btn.disabled=true;
  msg.className='login-message error';
  msg.textContent=`Acesso bloqueado. Tente novamente em ${formatCountdown(remain)}.`;
  document.getElementById('attemptsInfo').textContent='Tentativas esgotadas';

  if(!lockTimer) lockTimer=setInterval(applyLock,1000);
  return true;
}
function unlock(){sessionStorage.setItem(AUTH_CONFIG.sessionKey,'1');document.body.classList.add('authenticated');document.getElementById('loginOverlay').style.display='none'}
async function loadAuth(){
  const r=await fetch(AUTH_CONFIG.csvUrl,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const t=await r.text();const p=Papa.parse(t,{header:true,skipEmptyLines:true});const row=p.data.find(x=>String(x.usuario||'').trim()==='dashboard')||p.data[0];
  if(!row?.salt||!row?.hash||!row?.iteracoes)throw new Error('acesso.csv inválido');AUTH_RECORD=row;
}
async function handleLogin(){
  if(applyLock())return;
  const input=document.getElementById('passwordInput'),btn=document.getElementById('loginBtn'),msg=document.getElementById('loginMessage');
  if(!input.value){msg.className='login-message error';msg.textContent='Digite a senha.';return}
  btn.disabled=true;msg.className='login-message';msg.textContent='Validando...';
  try{
    const candidate=await deriveHash(input.value,AUTH_RECORD.salt,AUTH_RECORD.iteracoes);
    if(safeEqual(candidate,AUTH_RECORD.hash)){clearLock();msg.className='login-message success';msg.textContent='Acesso autorizado.';setTimeout(unlock,250);return}
    const attempts=getAttempts()+1;setAttempts(attempts);
    if(attempts>=AUTH_CONFIG.maxAttempts){localStorage.setItem(AUTH_CONFIG.lockUntilKey,String(Date.now()+AUTH_CONFIG.lockMinutes*60000));applyLock()}
    else{msg.className='login-message error';msg.textContent='Senha incorreta.';btn.disabled=false;input.select();updateAttempts()}
  }catch(e){console.error(e);msg.className='login-message error';msg.textContent='Falha ao validar o acesso.';btn.disabled=false}
}
async function initAuth(){
  if(sessionStorage.getItem(AUTH_CONFIG.sessionKey)==='1'){unlock();return}
  try{
    await loadAuth();updateAttempts();applyLock();
    document.getElementById('loginBtn').addEventListener('click',handleLogin);
    document.getElementById('passwordInput').addEventListener('keydown',e=>{if(e.key==='Enter')handleLogin()});
    document.getElementById('togglePasswordBtn').addEventListener('click',()=>{const i=document.getElementById('passwordInput');i.type=i.type==='password'?'text':'password'});
  }catch(e){console.error(e);const m=document.getElementById('loginMessage');m.className='login-message error';m.textContent='Não foi possível carregar a configuração de acesso.';document.getElementById('loginBtn').disabled=true}
}

const $ = (id) => document.getElementById(id);
const ptNumber = new Intl.NumberFormat('pt-BR');
const pt1 = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1});
const pt2 = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const MONTHS = ['Todos','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DATA_URLS = {
  arquivo1: './BATISMO.csv',
  arquivo2: './FREQUENCIA_EBD.csv'
};

let FREQ_DATA = [];
let BAPTISM_DATA = [];
let charts = {};
let LOW_FREQUENCY_MODE = 'average';
let ACTIVE_MAIN_PAGE = 'frequency';

const normalize = s => String(s ?? '').trim().replace(/\s+/g,' ').toUpperCase();
const isoDate = s => new Date(`${s}T12:00:00`);
const fmtDate = d => new Intl.DateTimeFormat('pt-BR').format(d);
const totalPresence = r => Number(r.adult || 0) + Number(r.children || 0);
const weightedRate = rows => {
  const den = rows.reduce((s,r)=>s+Number(r.members||0),0);
  return den ? rows.reduce((s,r)=>s+totalPresence(r),0)/den*100 : 0;
};
const unique = a => [...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'pt-BR'));

function parseNumber(value){
  if(value === null || value === undefined || value === '') return 0;
  if(typeof value === 'number') return value;
  let s = String(value).trim().replace('%','');
  if(s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s = s.replace(',','.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseBRDate(value){
  const s = String(value ?? '').trim();
  if(!s) return null;
  const parts = s.split(/[\/\-]/);
  if(parts.length !== 3) return null;
  if(parts[0].length === 4) return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
  return `${parts[2]}-${String(parts[1]).padStart(2,'0')}-${String(parts[0]).padStart(2,'0')}`;
}

async function loadCSV(url){
  const response = await fetch(url, {cache:'no-store'});
  if(!response.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${response.status}`);
  const text = await response.text();
  return Papa.parse(text, {header:true, skipEmptyLines:true, transformHeader:h=>String(h).trim()}).data;
}

function pick(row, candidates){
  const keys = Object.keys(row);
  for(const candidate of candidates){
    const found = keys.find(k => normalize(k) === normalize(candidate));
    if(found) return row[found];
  }
  return '';
}

function transformFrequency(rows){
  return rows.map(r => {
    const date = parseBRDate(pick(r,['Data','DATA']));
    return {
      date,
      area: String(pick(r,['Área','Area'])).trim(),
      polo: String(pick(r,['Pólo','Polo'])).trim(),
      church: String(pick(r,['Igreja'])).trim(),
      pastor: String(pick(r,['Pastor'])).trim(),
      members: parseNumber(pick(r,['Memb. Total','Memb Total','Membros Total'])),
      adult: parseNumber(pick(r,['Presença. Adulto','Presença Adulto','Presenca Adulto'])),
      children: parseNumber(pick(r,['Presença. CIAS','Presença CIAS','Presenca CIAS'])),
      freqSource: parseNumber(pick(r,['Frequência %','Frequencia %']))
    };
  }).filter(r => r.date && r.area && r.polo && r.church);
}

function transformBaptism(rows){
  return rows.map(r => ({
    area: String(pick(r,['Área','Area'])).trim(),
    polo: String(pick(r,['Pólo','Polo'])).trim(),
    church: String(pick(r,['Igreja'])).trim(),
    b2025: parseNumber(pick(r,['B.2025','B2025','Batismos 2025'])),
    b2026: parseNumber(pick(r,['B.2026','B2026','Batismos 2026'])),
    m2026: parseNumber(pick(r,['M.2026','M2026'])),
    v2026: parseNumber(pick(r,['V.2026','V2026'])),
    tg2026: parseNumber(pick(r,['TG.2026','TG2026']))
  })).filter(r => r.area || r.polo || r.church);
}

function showLoadError(error){
  console.error(error);
  const target = document.querySelector('.dashboard-shell');
  const alert = document.createElement('div');
  alert.style.cssText = 'margin:12px 0;padding:14px;border-radius:7px;background:#fff1f2;color:#991b1b;border:1px solid #fecdd3;font:600 12px Montserrat,Arial';
  alert.innerHTML = `Não foi possível carregar as bases CSV.<br><small>${error.message}</small>`;
  target.prepend(alert);
}

function fillSelect(el, options, selected='', allLabel='Todos'){
  el.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '';
  el.appendChild(placeholder);

  const all = document.createElement('option');
  all.value = 'Todos';
  all.textContent = allLabel;
  el.appendChild(all);

  options.forEach(v=>{
    const o=document.createElement('option');
    o.value=v;
    o.textContent=v;
    el.appendChild(o);
  });

  el.value = (selected === '' || selected === 'Todos' || options.includes(selected)) ? selected : '';
}

function bootstrapFilters(){
  const years = unique(FREQ_DATA.map(r=>String(isoDate(r.date).getFullYear())));

  fillSelect($('yearFilter'), years, '');
  $('monthFilter').innerHTML = [
    '<option value=""></option>',
    ...MONTHS.map((m,i)=>`<option value="${i===0?'Todos':i}">${m}</option>`)
  ].join('');
  $('monthFilter').value='';

  fillSelect($('areaFilter'), unique(FREQ_DATA.map(r=>r.area)), '');
  fillSelect($('poloFilter'), [], '');
  fillSelect($('churchFilter'), [], '');

  ['yearFilter','monthFilter','areaFilter','poloFilter','churchFilter'].forEach(id=>{
    $(id).addEventListener('change', ()=>{
      if(id==='areaFilter' || id==='poloFilter') refreshDependentFilters(id);
      render();
    });
  });

  $('clearFiltersBtn').addEventListener('click', clearAllFilters);
  $('tabAverage').addEventListener('click',()=>{LOW_FREQUENCY_MODE='average';render();});
  $('tabLatest').addEventListener('click',()=>{LOW_FREQUENCY_MODE='latest';render();});
}

function refreshDependentFilters(changed){
  const area = $('areaFilter').value || '';
  const currentPolo = $('poloFilter').value || '';
  const currentChurch = $('churchFilter').value || '';

  if(!area){
    fillSelect($('poloFilter'), [], '');
    fillSelect($('churchFilter'), [], '');
    return;
  }

  const baseArea = FREQ_DATA.filter(r=>area==='Todos' || r.area===area);
  fillSelect(
    $('poloFilter'),
    unique(baseArea.map(r=>r.polo)),
    changed==='areaFilter' ? '' : currentPolo
  );

  const polo = $('poloFilter').value || '';
  if(!polo){
    fillSelect($('churchFilter'), [], '');
    return;
  }

  const basePolo = baseArea.filter(r=>polo==='Todos' || r.polo===polo);
  fillSelect(
    $('churchFilter'),
    unique(basePolo.map(r=>r.church)),
    changed ? '' : currentChurch
  );
}

function clearAllFilters(){
  $('yearFilter').value='';
  $('monthFilter').value='';
  $('areaFilter').value='';
  fillSelect($('poloFilter'), [], '');
  fillSelect($('churchFilter'), [], '');
  render();
}

function selectedRows(){
  const year=$('yearFilter').value, month=$('monthFilter').value, area=$('areaFilter').value, polo=$('poloFilter').value, church=$('churchFilter').value;
  return FREQ_DATA.filter(r=>{
    const d=isoDate(r.date);
    return (!year||year==='Todos'||String(d.getFullYear())===year) &&
      (!month||month==='Todos'||d.getMonth()+1===Number(month)) &&
      (!area||area==='Todos'||r.area===area) &&
      (!polo||polo==='Todos'||r.polo===polo) &&
      (!church||church==='Todos'||r.church===church);
  });
}

function selectedBaptisms(){
  const area=$('areaFilter').value, polo=$('poloFilter').value, church=$('churchFilter').value;
  return BAPTISM_DATA.filter(r=>
    (!area||area==='Todos'||normalize(r.area)===normalize(area)) &&
    (!polo||polo==='Todos'||normalize(r.polo)===normalize(polo)) &&
    (!church||church==='Todos'||normalize(r.church)===normalize(church))
  );
}

function destroy(name){ if(charts[name]) charts[name].destroy(); }

function renderGauge(rate){
  destroy('gauge');
  charts.gauge = new Chart($('gaugeChart'),{
    type:'doughnut',
    data:{datasets:[{data:[Math.min(rate,100),Math.max(100-rate,0)],backgroundColor:['#9f0012','#eceeef'],borderWidth:0,circumference:180,rotation:270}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{enabled:false}},animation:{duration:450}}
  });
}

function commonScales(max=80){
  return {
    y:{beginAtZero:true,max,grid:{color:'#e7e9ed',borderDash:[2,3]},ticks:{font:{size:9},callback:v=>v+'%'}},
    x:{grid:{display:false},ticks:{font:{size:9},maxRotation:0,minRotation:0}}
  };
}

const labelPlugin = {
  id:'valueLabels',
  afterDatasetsDraw(chart){
    const {ctx}=chart; ctx.save(); ctx.fillStyle='#151515';ctx.textAlign='center';ctx.font='600 9px Montserrat';
    chart.getDatasetMeta(0).data.forEach((el,i)=>{
      const val=chart.data.datasets[0].data[i];
      if(val==null) return;
      ctx.fillText(pt2.format(val)+'%',el.x,el.y-7);
    }); ctx.restore();
  }
};

function renderMonthly(rows){
  const map = new Map();
  rows.forEach(r=>{
    const d=isoDate(r.date), key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push(r);
  });
  const entries=[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const labels=entries.map(([k])=>{const [y,m]=k.split('-');return `${MONTHS[Number(m)].slice(0,3).toLowerCase()}/${y.slice(-2)}`});
  const vals=entries.map(([,v])=>weightedRate(v));
  destroy('monthly');
  charts.monthly=new Chart($('monthlyChart'),{type:'bar',plugins:[labelPlugin],data:{labels,datasets:[{label:'% Participação',data:vals,backgroundColor:'#2869b5',barPercentage:.62,categoryPercentage:.75}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:15}},scales:commonScales(Math.max(80,Math.ceil((Math.max(...vals,0)+10)/10)*10)),plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,font:{size:9}}},tooltip:{callbacks:{label:c=>pt2.format(c.raw)+'%'}}}}});
}

function renderWeekly(rows){
  const map=new Map();
  rows.forEach(r=>{ if(!map.has(r.date))map.set(r.date,[]);map.get(r.date).push(r); });
  const entries=[...map.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);
  const labels=entries.map(([k])=>fmtDate(isoDate(k)));
  const vals=entries.map(([,v])=>weightedRate(v));
  destroy('weekly');
  charts.weekly=new Chart($('weeklyChart'),{type:'bar',plugins:[labelPlugin],data:{labels,datasets:[{label:'% Participação',data:vals,backgroundColor:'#28913e',barPercentage:.62,categoryPercentage:.75}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:15}},scales:commonScales(Math.max(80,Math.ceil((Math.max(...vals,0)+10)/10)*10)),plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,font:{size:9}}},tooltip:{callbacks:{label:c=>pt2.format(c.raw)+'%'}}}}});
}


function buildLowFrequencyRows(rows, mode='average'){
  const grouped = new Map();
  rows.forEach(r=>{
    const key=[r.area,r.polo,r.church].join('|||');
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(r);
  });

  return [...grouped.entries()]
    .map(([key,values])=>{
      const [area,polo,church]=key.split('|||');
      const dates=values.map(v=>v.date).sort((a,b)=>b.localeCompare(a));
      const latestDate=dates[0]||'';
      const base = mode==='latest'
        ? values.filter(v=>v.date===latestDate)
        : values;
      return {area,polo,church,date:latestDate,rate:weightedRate(base)};
    })
    .filter(x=>x.rate<50)
    .sort((a,b)=>a.rate-b.rate || a.church.localeCompare(b.church,'pt-BR'));
}

function updateLowTabs(){
  const avg=LOW_FREQUENCY_MODE==='average';
  $('tabAverage').classList.toggle('active',avg);
  $('tabLatest').classList.toggle('active',!avg);
  $('lowTabContext').textContent=avg?'Período consolidado':'Última data disponível de cada igreja';
}

function renderLow(rows){
  updateLowTabs();
  const allLow=buildLowFrequencyRows(rows,LOW_FREQUENCY_MODE);
  const chartLow=allLow.slice(0,25);

  $('emptyState').hidden=chartLow.length>0;
  $('lowChart').style.display=chartLow.length?'block':'none';
  destroy('low');

  if(chartLow.length){
    charts.low=new Chart($('lowChart'),{
      type:'bar',
      plugins:[labelPlugin],
      data:{
        labels:chartLow.map(x=>x.church),
        datasets:[{
          data:chartLow.map(x=>x.rate),
          backgroundColor:'#d90916',
          barPercentage:.54,
          categoryPercentage:.82
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        layout:{padding:{top:15}},
        scales:{
          y:{beginAtZero:true,max:60,grid:{color:'#e7e9ed',borderDash:[2,3]},ticks:{font:{size:8},callback:v=>v+'%'}},
          x:{grid:{display:false},ticks:{font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:function(v){const l=this.getLabelForValue(v);return l.length>18?l.slice(0,17)+'…':l}}}
        },
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{
            title:items=>chartLow[items[0].dataIndex].church,
            label:c=>{
              const item=chartLow[c.dataIndex];
              const lines=[`Frequência: ${pt2.format(c.raw)}%`,`Área: ${item.area}`,`Pólo: ${item.polo}`];
              if(LOW_FREQUENCY_MODE==='latest'&&item.date) lines.push(`Data: ${fmtDate(isoDate(item.date))}`);
              return lines;
            }
          }}
        }
      }
    });
  }

  renderLowFrequencyTable(allLow);
}

function renderLowFrequencyTable(rows){
  const tbody=$('lowFrequencyTableBody');
  const empty=$('emptyTableState');
  const showDate=LOW_FREQUENCY_MODE==='latest';

  tbody.innerHTML='';
  empty.hidden=rows.length>0;
  $('lowFrequencyCount').textContent=ptNumber.format(rows.length);
  $('dateHeader').hidden=!showDate;

  rows.forEach((item,index)=>{
    const tr=document.createElement('tr');
    const dateCell=showDate && item.date
      ? `<td class="date-cell">${fmtDate(isoDate(item.date))}</td>`
      : '';

    tr.innerHTML=`
      <td class="index-cell">${index+1}</td>
      ${dateCell}
      <td>${item.area}</td>
      <td>${item.polo}</td>
      <td>${item.church}</td>
      <td class="frequency-cell">${pt2.format(item.rate)}%</td>
    `;
    tbody.appendChild(tr);
  });
}


function compareQuantity(value, operator, target){
  if(!operator || target === '' || target === null || target === undefined) return true;

  const numericValue = Number(value || 0);
  const numericTarget = Number(target);

  if(!Number.isFinite(numericTarget)) return true;

  switch(operator){
    case '>': return numericValue > numericTarget;
    case '<': return numericValue < numericTarget;
    case '=': return numericValue === numericTarget;
    case '<=': return numericValue <= numericTarget;
    case '>=': return numericValue >= numericTarget;
    default: return true;
  }
}

function selectedBaptismPageRows(){
  const area=$('batAreaFilter').value;
  const polo=$('batPoloFilter').value;
  const church=$('batChurchFilter').value;
  const quantityOperator=$('batQuantityOperator').value;
  const quantityValue=$('batQuantityValue').value;

  return BAPTISM_DATA.filter(r=>
    (!area||area==='Todos'||normalize(r.area)===normalize(area)) &&
    (!polo||polo==='Todos'||normalize(r.polo)===normalize(polo)) &&
    (!church||church==='Todos'||normalize(r.church)===normalize(church)) &&
    compareQuantity(r.b2026, quantityOperator, quantityValue)
  );
}

function refreshBaptismDependentFilters(changed){
  const area=$('batAreaFilter').value||'';
  const currentPolo=$('batPoloFilter').value||'';
  const currentChurch=$('batChurchFilter').value||'';

  if(!area){
    fillSelect($('batPoloFilter'),[],'');
    fillSelect($('batChurchFilter'),[],'');
    return;
  }

  const areaRows=BAPTISM_DATA.filter(r=>area==='Todos'||r.area===area);
  fillSelect(
    $('batPoloFilter'),
    unique(areaRows.map(r=>r.polo)),
    changed==='area'?'':currentPolo
  );

  const polo=$('batPoloFilter').value||'';
  if(!polo){
    fillSelect($('batChurchFilter'),[],'');
    return;
  }

  const poloRows=areaRows.filter(r=>polo==='Todos'||r.polo===polo);
  fillSelect(
    $('batChurchFilter'),
    unique(poloRows.map(r=>r.church)),
    changed?'':currentChurch
  );
}

function clearBaptismFilters(){
  $('batAreaFilter').value='';
  fillSelect($('batPoloFilter'),[],'');
  fillSelect($('batChurchFilter'),[],'');
  $('batQuantityOperator').value='';
  $('batQuantityValue').value='';
  renderBaptism();
}

function bootstrapBaptismFilters(){
  fillSelect($('batAreaFilter'),unique(BAPTISM_DATA.map(r=>r.area)),'');
  fillSelect($('batPoloFilter'),[],'');
  fillSelect($('batChurchFilter'),[],'');

  $('batAreaFilter').addEventListener('change',()=>{
    refreshBaptismDependentFilters('area');
    renderBaptism();
  });
  $('batPoloFilter').addEventListener('change',()=>{
    refreshBaptismDependentFilters('polo');
    renderBaptism();
  });
  $('batChurchFilter').addEventListener('change',renderBaptism);
  $('batQuantityOperator').addEventListener('change',renderBaptism);
  $('batQuantityValue').addEventListener('input',renderBaptism);
  $('batClearFiltersBtn').addEventListener('click',clearBaptismFilters);
}

function calculateBaptismPace(b25,b26){
  const today=new Date();
  const year=today.getFullYear();
  const elapsedDays=Math.max(
    1,
    Math.floor(
      (Date.UTC(year,today.getMonth(),today.getDate())-Date.UTC(year,0,1))/86400000
    )
  );
  const projected=(b26/elapsedDays)*365;
  return b25 ? ((projected-b25)/b25)*100 : (b26?100:0);
}

function groupBaptisms(rows,field){
  const map=new Map();
  rows.forEach(r=>{
    const key=r[field]||'Não informado';
    if(!map.has(key)) map.set(key,{b2025:0,b2026:0,members:0,visitors:0,total:0});
    const item=map.get(key);
    item.b2025+=Number(r.b2025||0);
    item.b2026+=Number(r.b2026||0);
    item.members+=Number(r.m2026||0);
    item.visitors+=Number(r.v2026||0);
    item.total+=Number(r.tg2026||0);
  });
  return [...map.entries()].map(([label,values])=>({label,...values}));
}

function renderBaptismAreaChart(rows){
  const data=groupBaptisms(rows,'area').sort((a,b)=>b.b2026-a.b2026);
  destroy('baptismArea');
  charts.baptismArea=new Chart($('baptismAreaChart'),{
    type:'bar',
    data:{
      labels:data.map(x=>x.label.replace(' - ES','')),
      datasets:[
        {label:'2025',data:data.map(x=>x.b2025),backgroundColor:'#85000c'},
        {label:'2026',data:data.map(x=>x.b2026),backgroundColor:'#ffc52f'}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      scales:{
        y:{beginAtZero:true,grid:{color:'#e7e9ed'},ticks:{font:{size:9}}},
        x:{grid:{display:false},ticks:{font:{size:8},maxRotation:25,minRotation:0}}
      },
      plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:9}}}}
    }
  });
}

function renderBaptismPoloChart(rows){
  const data=groupBaptisms(rows,'polo').sort((a,b)=>b.b2026-a.b2026).slice(0,12);
  destroy('baptismPolo');
  charts.baptismPolo=new Chart($('baptismPoloChart'),{
    type:'bar',
    data:{labels:data.map(x=>x.label.replace(' - ES','')),datasets:[{data:data.map(x=>x.b2026),backgroundColor:'#2869b5'}]},
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      scales:{
        x:{beginAtZero:true,grid:{color:'#e7e9ed'},ticks:{font:{size:9}}},
        y:{grid:{display:false},ticks:{font:{size:8}}}
      },
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw} batismos`}}}
    }
  });
}

function renderBaptismChurchChart(rows){
  const data=[...rows]
    .sort((a,b)=>b.b2026-a.b2026||a.church.localeCompare(b.church,'pt-BR'))
    .slice(0,15);

  destroy('baptismChurch');
  charts.baptismChurch=new Chart($('baptismChurchChart'),{
    type:'bar',
    data:{labels:data.map(x=>x.church),datasets:[{data:data.map(x=>x.b2026),backgroundColor:'#28913e'}]},
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      scales:{
        x:{beginAtZero:true,grid:{color:'#e7e9ed'},ticks:{font:{size:9}}},
        y:{grid:{display:false},ticks:{font:{size:8},callback:function(v){const l=this.getLabelForValue(v);return l.length>28?l.slice(0,27)+'…':l}}}
      },
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw} batismos`}}}
    }
  });
}

function renderBaptismShareChart(rows){
  const data=groupBaptisms(rows,'area').filter(x=>x.b2026>0).sort((a,b)=>b.b2026-a.b2026);
  destroy('baptismShare');
  charts.baptismShare=new Chart($('baptismShareChart'),{
    type:'doughnut',
    data:{
      labels:data.map(x=>x.label.replace(' - ES','')),
      datasets:[{data:data.map(x=>x.b2026),backgroundColor:['#85000c','#ffc52f','#2869b5','#28913e','#d90916','#687182'],borderWidth:2,borderColor:'#fff'}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,cutout:'58%',
      plugins:{
        legend:{position:'right',labels:{boxWidth:10,font:{size:9}}},
        tooltip:{callbacks:{label:c=>{
          const total=c.dataset.data.reduce((s,v)=>s+v,0);
          const pct=total?c.raw/total*100:0;
          return `${c.label}: ${c.raw} (${pt1.format(pct)}%)`;
        }}}
      }
    }
  });
}

function renderBaptismTable(rows){
  const tbody=$('baptismTableBody');
  const empty=$('baptismEmptyState');
  const sorted=[...rows].sort((a,b)=>b.b2026-a.b2026||a.church.localeCompare(b.church,'pt-BR'));

  tbody.innerHTML='';
  empty.hidden=sorted.length>0;
  $('baptismTableCount').textContent=ptNumber.format(sorted.length);

  sorted.forEach((item,index)=>{
    const growth=item.b2025
      ? ((item.b2026/item.b2025)-1)*100
      : (item.b2026?100:0);

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="index-cell">${index+1}</td>
      <td>${item.area}</td>
      <td>${item.polo}</td>
      <td>${item.church}</td>
      <td>${ptNumber.format(item.b2025)}</td>
      <td class="baptism-value">${ptNumber.format(item.b2026)}</td>
      <td class="${growth>=0?'positive-cell':'negative-cell'}">${pt2.format(growth)}%</td>
      <td>${ptNumber.format(item.m2026)}</td>
      <td>${ptNumber.format(item.v2026)}</td>
      <td>${ptNumber.format(item.tg2026)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderBaptismNarrative(rows,b25,b26,growth,withBaptism,withoutBaptism){
  const areaRanking=groupBaptisms(rows,'area').sort((a,b)=>b.b2026-a.b2026);
  const leader=areaRanking[0];
  const trend=growth>=0?'crescimento':'redução';
  const leaderText=leader
    ? `${leader.label.replace(' - ES','')} lidera com ${ptNumber.format(leader.b2026)} batismos.`
    : 'Não há dados no recorte selecionado.';

  $('baptismNarrative').textContent=
    `Em 2026 foram registrados ${ptNumber.format(b26)} batismos, `+
    `uma ${trend} de ${pt2.format(Math.abs(growth))}% sobre 2025. `+
    `${leaderText} ${ptNumber.format(withBaptism)} igrejas registraram batismos e `+
    `${ptNumber.format(withoutBaptism)} ainda estão sem registro.`;
}

function renderBaptism(){
  const rows=selectedBaptismPageRows();
  const b25=rows.reduce((s,r)=>s+Number(r.b2025||0),0);
  const b26=rows.reduce((s,r)=>s+Number(r.b2026||0),0);
  const members=rows.reduce((s,r)=>s+Number(r.m2026||0),0);
  const visitors=rows.reduce((s,r)=>s+Number(r.v2026||0),0);
  const total=rows.reduce((s,r)=>s+Number(r.tg2026||0),0);
  const growth=b25?((b26/b25)-1)*100:(b26?100:0);
  const pace=calculateBaptismPace(b25,b26);
  const withBaptism=rows.filter(r=>Number(r.b2026||0)>0).length;
  const withoutBaptism=rows.filter(r=>Number(r.b2026||0)===0).length;

  $('batKpiB25').textContent=ptNumber.format(b25);
  $('batKpiB26').textContent=ptNumber.format(b26);
  $('batKpiGrowth').textContent=pt2.format(growth)+'%';
  $('batKpiPace').textContent=pt2.format(pace)+'%';
  $('batKpiWith').textContent=ptNumber.format(withBaptism);
  $('batKpiWithout').textContent=ptNumber.format(withoutBaptism);
  $('batKpiMembers').textContent=ptNumber.format(members);
  $('batKpiVisitors').textContent=ptNumber.format(visitors);
  $('batKpiTotal').textContent=ptNumber.format(total);

  renderBaptismNarrative(rows,b25,b26,growth,withBaptism,withoutBaptism);
  renderBaptismAreaChart(rows);
  renderBaptismPoloChart(rows);
  renderBaptismChurchChart(rows);
  renderBaptismShareChart(rows);
  renderBaptismTable(rows);

  const area=$('batAreaFilter').value;
  $('footerArea').textContent=(!area||area==='Todos')?'TODAS':area.replace(' - ES','');
}

function switchMainPage(page){
  ACTIVE_MAIN_PAGE=page;
  const frequency=page==='frequency';

  $('frequencyPage').hidden=!frequency;
  $('baptismPage').hidden=frequency;
  $('frequencyPage').classList.toggle('active',frequency);
  $('baptismPage').classList.toggle('active',!frequency);
  $('mainTabFrequency').classList.toggle('active',frequency);
  $('mainTabBaptism').classList.toggle('active',!frequency);

  $('dashboardTitle').textContent=frequency
    ? 'ESTATÍSTICA FREQUÊNCIA DE EBD'
    : 'ESTATÍSTICA DE BATISMOS';

  if(frequency){
    render();
  }else{
    renderBaptism();
  }

  window.scrollTo({top:0,behavior:'smooth'});
}

function bootstrapMainTabs(){
  $('mainTabFrequency').addEventListener('click',()=>switchMainPage('frequency'));
  $('mainTabBaptism').addEventListener('click',()=>switchMainPage('baptism'));
}

function render(){
  const rows=selectedRows();
  const rate=weightedRate(rows);
  const latestDate=rows.length?new Date(Math.max(...rows.map(r=>isoDate(r.date).getTime()))):null;
  const latestISO=latestDate?latestDate.toISOString().slice(0,10):null;
  const latestRows=latestISO?rows.filter(r=>r.date===latestISO):[];
  const members=latestRows.reduce((s,r)=>s+Number(r.members||0),0);

  $('overallFrequency').textContent=pt1.format(rate)+'%';
  $('kpiAreas').textContent=ptNumber.format(unique(rows.map(r=>r.area)).length);
  $('kpiChurches').textContent=ptNumber.format(unique(rows.map(r=>r.church)).length);
  $('kpiPoles').textContent=ptNumber.format(unique(rows.map(r=>r.polo)).length);
  $('kpiEbd').textContent=ptNumber.format(unique(rows.map(r=>r.date)).length);
  const below50Count = buildLowFrequencyRows(rows, LOW_FREQUENCY_MODE).length;
  $('kpiBelow50').textContent=ptNumber.format(below50Count);
  $('kpiMembers').textContent=ptNumber.format(members);
  const dateLabel=latestDate?fmtDate(latestDate):'--/--/----';
  $('kpiUpdate').textContent=dateLabel.length===10?`${dateLabel.slice(0,6)}${dateLabel.slice(-2)}`:dateLabel;
  $('headerUpdate').textContent=dateLabel;
  const area=$('areaFilter').value;
  $('footerArea').textContent=(!area||area==='Todos')?'TODAS':area.replace(' - ES','');
  const modeLabel=LOW_FREQUENCY_MODE==='latest'?'NA ÚLTIMA EBD':'NA MÉDIA GERAL';
  $('lowTitle').textContent=`IGREJAS ${(!area||area==='Todos')?'':`DA ÁREA ${area.replace(' - ES','')} `}ABAIXO DE 50% — ${modeLabel}`;

  renderGauge(rate);
  renderMonthly(rows);
  renderWeekly(rows);
  renderLow(rows);
}


window.exportDashboardPDF = async function exportDashboardPDF(){
  const button = $('downloadPdfBtn');
  if(!button) return;

  const originalLabel = button.innerHTML;
  try{
    button.disabled = true;
    button.innerHTML = '<span>⌛</span> Gerando PDF';

    if(typeof html2canvas === 'undefined' || !window.jspdf?.jsPDF){
      console.warn('Bibliotecas de PDF indisponíveis. Abrindo impressão do navegador como alternativa.');
      button.innerHTML = '<span>⌛</span> Abrindo impressão';
      setTimeout(() => window.print(), 100);
      return;
    }
    document.body.classList.add('pdf-exporting');

    // Aguarda a estabilização dos gráficos e das fontes antes da captura.
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 350));

    const captureTarget = document.body;
    const canvas = await html2canvas(captureTarget, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(document.documentElement.scrollWidth, 1600),
      windowHeight: document.documentElement.scrollHeight,
      imageTimeout: 15000,
      logging: false
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 3;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = canvas.width / canvas.height;
    const pageRatio = maxWidth / maxHeight;

    let renderWidth, renderHeight;
    if(imageRatio > pageRatio){
      renderWidth = maxWidth;
      renderHeight = renderWidth / imageRatio;
    }else{
      renderHeight = maxHeight;
      renderWidth = renderHeight * imageRatio;
    }

    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;
    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST');

    const activeArea = ACTIVE_MAIN_PAGE === 'baptism'
      ? $('batAreaFilter')?.value
      : $('areaFilter')?.value;
    const area = !activeArea || activeArea === 'Todos'
      ? 'Todas-as-Areas'
      : String(activeArea).replace(/[^\wÀ-ÿ-]+/g,'-');
    const date = new Date().toISOString().slice(0,10);
    pdf.save(`Relatorio-EBD-${area}-${date}.pdf`);
  }catch(error){
    console.error(error);
    alert('Não foi possível gerar o PDF. Verifique o console do navegador.');
  }finally{
    document.body.classList.remove('pdf-exporting');
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}


function datasetHeaderScore(rows, expectedHeaders){
  if(!Array.isArray(rows) || !rows.length) return 0;
  const headers = Object.keys(rows[0]).map(normalize);
  return expectedHeaders.reduce((score, group)=>{
    return score + (group.some(candidate=>headers.includes(normalize(candidate))) ? 1 : 0);
  }, 0);
}

function detectDatasets(firstRows, secondRows){
  const frequencyHeaders = [
    ['Data'],
    ['Área','Area'],
    ['Pólo','Polo'],
    ['Igreja'],
    ['Memb. Total','Memb Total','Membros Total'],
    ['Presença. Adulto','Presença Adulto','Presenca Adulto'],
    ['Presença. CIAS','Presença CIAS','Presenca CIAS']
  ];

  const baptismHeaders = [
    ['Área','Area'],
    ['Pólo','Polo'],
    ['Igreja'],
    ['B.2025','B2025','Batismos 2025'],
    ['B.2026','B2026','Batismos 2026']
  ];

  const ff = datasetHeaderScore(firstRows, frequencyHeaders);
  const sf = datasetHeaderScore(secondRows, frequencyHeaders);
  const fb = datasetHeaderScore(firstRows, baptismHeaders);
  const sb = datasetHeaderScore(secondRows, baptismHeaders);

  return {
    frequencyRows: ff >= sf ? firstRows : secondRows,
    baptismRows: fb >= sb ? firstRows : secondRows,
    diagnostics:{ff,sf,fb,sb}
  };
}

async function init(){
  try{
    const [firstRows, secondRows] = await Promise.all([
      loadCSV(DATA_URLS.arquivo1),
      loadCSV(DATA_URLS.arquivo2)
    ]);

    const detected = detectDatasets(firstRows, secondRows);
    FREQ_DATA = transformFrequency(detected.frequencyRows);
    BAPTISM_DATA = transformBaptism(detected.baptismRows);

    console.info('Diagnóstico das bases:', detected.diagnostics);
    console.info('Linhas válidas de frequência:', FREQ_DATA.length);
    console.info('Linhas válidas de batismos:', BAPTISM_DATA.length);

    if(!FREQ_DATA.length){
      const h1 = firstRows.length ? Object.keys(firstRows[0]).join(' | ') : 'arquivo vazio';
      const h2 = secondRows.length ? Object.keys(secondRows[0]).join(' | ') : 'arquivo vazio';
      throw new Error(`Nenhuma linha válida de frequência foi encontrada. Cabeçalhos BATISMO.csv: ${h1}. Cabeçalhos FREQUENCIA_EBD.csv: ${h2}.`);
    }

    bootstrapFilters();
    bootstrapBaptismFilters();
    bootstrapMainTabs();
    render();
  }catch(error){
    showLoadError(error);
  }
}
document.addEventListener('DOMContentLoaded',async()=>{await initAuth();init();});
