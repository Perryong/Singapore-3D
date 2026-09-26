import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTimetable, nowSelection, selectServices, departureStatus, stationStatus, timelineEnd, formatMinute, selectionFromURL } from './last-trains.mjs';
const data=JSON.parse(readFileSync(new URL('../../data/explore/last-trains.json',import.meta.url)));
const stations=JSON.parse(readFileSync(new URL('../../data/explore/stations.geojson',import.meta.url))).features;
validateTimetable(data,stations);
assert.equal(formatMinute(1440),'00:00 +1 day');
assert.equal(formatMinute(1439),'23:59');
assert.deepEqual(departureStatus(1460,1459),{status:'remaining',remainingMinutes:1});
assert.equal(departureStatus(1460,1460).status,'due');
assert.equal(departureStatus(1460,1461).status,'passed');
assert.equal(stationStatus({services:[{minute:1400,status:'published'}],complete:false},1500).status,'unavailable');
assert.equal(stationStatus({services:[{minute:1501,status:'published'}],complete:false},1500).partial,true);
assert.deepEqual(nowSelection(new Date('2026-09-25T16:20:00Z'),data),{serviceDate:'2026-09-25',minute:1460,preview:false});
assert.deepEqual(nowSelection(new Date('2026-09-26T04:00:00Z'),data),{serviceDate:'2026-09-26',minute:1260,preview:true});
const selected=selectServices(data,'mrt-bugis','2026-09-26');
assert.equal(selected.complete,false); // EW coverage missing
assert.equal(selected.exceptionVerified,false);
assert.ok(selected.services.some(s=>s.destination==='Expo'&&s.minute===1441));
const fallback=selectionFromURL('?serviceDate=2026-02-30&minute=1440.5&lastStation=bad',data,new Date('2026-09-26T04:00:00Z'));
assert.equal(fallback.serviceDate,'2026-09-26'); assert.equal(fallback.stationId,null); assert.equal(fallback.preview,true);
const extended=structuredClone(data); extended.overrides=[{serviceId:data.services[0].id,date:'2026-09-26',minute:1590,status:'published'}];
assert.equal(timelineEnd(extended,'2026-09-26'),1590);
assert.equal(selectServices(extended,data.services[0].stationId,'2026-09-26').services[0].minute,1590);
for(const mutate of [d=>d.services.push(d.services[0]),d=>d.sources['sbs-DT'].url='javascript:alert(1)',d=>d.services[0].stationId='bad',d=>d.services[0].rules.push(d.services[0].rules[0])]){
 const bad=structuredClone(data); mutate(bad); assert.throws(()=>validateTimetable(bad,stations));
}
console.log('Last-train checks passed: provenance, dates, midnight, partial coverage, overrides and URLs.');
