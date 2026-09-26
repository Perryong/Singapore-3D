const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const minuteOK = n => Number.isInteger(n) && n >= 1260 && n <= 1800;
const statusOK = r => ['published','unavailable','not-applicable'].includes(r.status) && (r.status === 'published' ? minuteOK(r.minute) : r.minute === null);
const applicable = (r,date) => (!r.validFrom || date>=r.validFrom) && (!r.validTo || date<=r.validTo);
export function validateTimetable(data, stations) {
 const fail = () => { throw new Error('Invalid last-train timetable'); };
 if(data?.schemaVersion!==1 || data.timezone!=='Asia/Singapore' || !Array.isArray(data.services) || !Array.isArray(data.overrides) || !data.coverage || !data.sources || !Array.isArray(data.calendar?.years) || !Array.isArray(data.calendar?.holidays)) fail();
 const stationIds=new Set(stations.map(s=>s.properties.id)), serviceIds=new Set();
 for(const source of Object.values(data.sources)) {
  let url; try { url=new URL(source.url); } catch { fail(); }
  if(url.protocol!=='https:' || !['www.sbstransit.com.sg','sbstransit.com.sg','journey.smrt.com.sg','www.smrt.com.sg'].includes(url.hostname) || !Number.isFinite(Date.parse(source.retrievedAt))) fail();
 }
 for(const s of data.services) {
  if(typeof s.id!=='string' || serviceIds.has(s.id) || !stationIds.has(s.stationId) || !s.destination || !data.sources[s.sourceId] || !Array.isArray(s.rules) || !s.rules.length) fail();
  const station=stations.find(f=>f.properties.id===s.stationId);
  if(!station.properties.codes.split('-').includes(s.stationCode) || !s.stationCode.startsWith(s.line)) fail();
  serviceIds.add(s.id);
  for(const [i,r] of s.rules.entries()) {
   if(!statusOK(r) || !['regular','holiday'].includes(r.dayClass) || !Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7) || (r.validFrom && !dateOK(r.validFrom)) || (r.validTo && !dateOK(r.validTo)) || (r.validFrom&&r.validTo&&r.validFrom>r.validTo)) fail();
   if(s.rules.slice(0,i).some(p=>p.dayClass===r.dayClass && p.weekdays.some(d=>r.weekdays.includes(d)) && (p.validFrom||'0000')<=(r.validTo||'9999') && (r.validFrom||'0000')<=(p.validTo||'9999'))) fail();
  }
 }
 const overrides=new Set();
 for(const o of data.overrides) {
  const key=o.serviceId+o.date;
  if(!serviceIds.has(o.serviceId)||!dateOK(o.date)||!statusOK(o)||overrides.has(key)) fail();
  overrides.add(key);
 }
 for(const id of stationIds) {
  const c=data.coverage[id];
  if(!c || typeof c.enumerationComplete!=='boolean' || !Array.isArray(c.expectedServiceIds) || new Set(c.expectedServiceIds).size!==c.expectedServiceIds.length || c.expectedServiceIds.some(sid=>!data.services.some(s=>s.id===sid&&s.stationId===id))) fail();
  if(data.services.some(s=>s.stationId===id&&!c.expectedServiceIds.includes(s.id))) fail();
 }
 if(data.calendar.years.some(y=>!Number.isInteger(y)||y<2000||y>2100) || data.calendar.holidays.some(d=>!dateOK(d))) fail();
 return data;
}
export function selectServices(data, stationId, serviceDate) {
 if(!dateOK(serviceDate)) return {services:[],complete:false,exceptionVerified:false};
 const weekday=new Date(serviceDate+'T12:00:00Z').getUTCDay()||7;
 const holiday=data.calendar.holidays.includes(serviceDate);
 const covered=data.calendar.years.includes(Number(serviceDate.slice(0,4)));
 const services=data.services.filter(s=>s.stationId===stationId).map(s=>{
  const override=data.overrides.find(o=>o.serviceId===s.id&&o.date===serviceDate);
  const rule=override || s.rules.find(r=>r.dayClass===(holiday?'holiday':'regular')&&r.weekdays.includes(weekday)&&applicable(r,serviceDate));
  return {...s,...(rule||{minute:null,status:'unavailable'}),overridden:!!override};
 });
 const manifest=data.coverage[stationId];
 return {services,complete:!!manifest?.enumerationComplete && services.length>0 && services.every(s=>s.status!=='unavailable'),exceptionVerified:covered && services.length>0 && services.every(s=>s.overridden)};
}
export function departureStatus(departureMinute, minute) {
 if(!minuteOK(departureMinute)) return {status:'unavailable',remainingMinutes:null};
 return {status:departureMinute>minute?'remaining':departureMinute===minute?'due':'passed',remainingMinutes:Math.max(0,departureMinute-minute)};
}
export function stationStatus(selection, minute) {
 const states=selection.services.filter(s=>s.status==='published').map(s=>departureStatus(s.minute,minute).status);
 return {status:states.includes('remaining')?'remaining':states.includes('due')?'due':selection.complete&&states.length?'passed':'unavailable',partial:!selection.complete};
}
export function timelineEnd(data, serviceDate) {
 return Math.max(1560,...Object.keys(data.coverage).flatMap(id=>selectServices(data,id,serviceDate).services.filter(s=>s.status==='published').map(s=>s.minute)));
}
export function nowSelection(now, data) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`, minute=Number(parts.hour)*60+Number(parts.minute);
 const previous=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 if(minute+1440<=timelineEnd(data,previous)) return {serviceDate:previous,minute:minute+1440,preview:false};
 return {serviceDate:today,minute:minute>=1260?minute:1260,preview:minute<1260};
}
export function formatMinute(minute) {
 return `${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}${minute>=1440?' +1 day':''}`;
}
export function selectionFromURL(search, data, now=new Date()) {
 const p=new URLSearchParams(search), fallback=nowSelection(now,data);
 const date=p.get('serviceDate'), raw=p.get('minute'), minute=raw?.trim()?Number(raw):NaN;
 const valid=dateOK(date)&&minuteOK(minute)&&minute<=timelineEnd(data,date);
 return {...(valid?{serviceDate:date,minute,preview:true}:{...fallback,preview:true}),stationId:Object.hasOwn(data.coverage,p.get('lastStation'))?p.get('lastStation'):null};
}
