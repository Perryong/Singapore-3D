#!/usr/bin/env python3
"""Import SBS operator schedules and captured SGTrains SMRT schedules.
Run: python3 tools/fetch_last_trains.py [--cached path/to/sbs.html]
"""
import argparse
import datetime as dt
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://www.sbstransit.com.sg/first-train-last-train'

class Tables(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.tables, self.table, self.row, self.cell = [], None, None, None
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        if tag == 'table': self.table = []
        elif tag == 'tr' and self.table is not None: self.row = []
        elif tag in ('td', 'th') and self.row is not None: self.cell = []
    def handle_data(self, text):
        if self.cell is not None: self.cell.append(text)
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row); self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table); self.table = None

def parse_time(text):
    text = text.strip().lower()
    if text in ('-', '–'): return None
    match = re.fullmatch(r'(\d{1,2})[.:](\d{2})\s*(am|pm)', text)
    if not match: raise ValueError('Invalid departure: ' + text)
    h, m = int(match[1]), int(match[2])
    if not 1 <= h <= 12 or not 0 <= m < 60: raise ValueError(text)
    minute = (h % 12 + (12 if match[3] == 'pm' else 0)) * 60 + m
    if minute < 12 * 60: minute += 1440
    if not 1260 <= minute <= 1800: raise ValueError('Outside evening service: ' + text)
    return minute

def parse_sbs(html):
    records = []
    expected = {'Expo': ('DT', 35), 'Bukit Panjang': ('DT', 35), 'HarbourFront': ('NE', 17), 'Punggol Coast': ('NE', 17)}
    found = set()
    for table in Tables(html).tables:
        if not table or not table[0] or not table[0][0].startswith('Towards '): continue
        destination = table[0][0][8:]
        if destination not in expected: continue
        line, count = expected[destination]
        if table[0] != ['Towards '+destination, 'First Trains', 'Last Trains']:
            raise ValueError('Changed table headers: ' + destination)
        days = table[1]
        if line == 'DT' and days != ['Mondays to Saturdays', 'Sundays/Public Holidays', 'Mondays to Sundays/Public Holidays']:
            raise ValueError('Changed DT day headers')
        if line == 'NE' and days != ['Weekdays', 'Saturdays', 'Sundays/Public Holidays', 'Weekdays', 'Weekends/Public Holidays']:
            raise ValueError('Changed NE day headers')
        rows = table[2:]
        if len(rows) != count or destination in found: raise ValueError('Incomplete or duplicate table')
        found.add(destination)
        for row in rows:
            if len(row) != (4 if line == 'DT' else 6): raise ValueError('Changed timetable columns')
            code = row[0].split()[0]
            if not re.fullmatch(line+r'\d+', code): raise ValueError('Invalid station code')
            values = [(range(1,8), row[-1])] if line == 'DT' else [(range(1,6), row[-2]), ([6,7], row[-1])]
            rules = []
            for weekdays, value in values:
                minute = parse_time(value)
                rules.append(dict(weekdays=list(weekdays), dayClass='regular', validFrom=None, validTo=None, minute=minute, status='published' if minute is not None else 'not-applicable'))
            holiday = dict(rules[-1], weekdays=list(range(1,8)), dayClass='holiday')
            rules.append(holiday)
            records.append(dict(id=code+'-'+destination.lower().replace(' ', '-'), stationCode=code, line=line, destination=destination, sourceId='sbs-'+line, rules=rules))
    if found != set(expected): raise ValueError('Missing MRT tables')
    return records

def parse_sgtrains(capture, stations):
    """Parse captured public station tables; reject missing pages or changed columns."""
    lookup = {f['properties']['id']: f['properties'] for f in stations}
    expected = {sid for sid,p in lookup.items() if re.search(r'(NS|EW|CG|CC|CE|TE)\d',p['codes'])}
    headings = {'North-South Line': ('NS',), 'East-West Line': ('EW','CG'),
                'Circle Line': ('CC','CE'), 'Thomson-East Coast Line': ('TE',)}
    seen, records, sources = set(), [], {}
    for page in capture['pages']:
        sid = page['stationId']
        if sid not in expected or sid in seen: raise ValueError('Unknown or duplicate station page')
        seen.add(sid)
        p = lookup[sid]
        from urllib.parse import urlparse, parse_qs
        url = urlparse(page['url'])
        if (page['name'] != p['name'] or url.scheme != 'https' or url.netloc != 'www.sgtrains.com'
            or url.path != '/guide-traintiming' or parse_qs(url.query).get('station') != [p['name']]):
            raise ValueError('Station source mismatch')
        source_id = 'sgtrains-'+sid
        sources[source_id] = dict(url=page['url'],retrievedAt=capture['retrievedAt'],updated=None,label='SGTrains · secondary source')
        sections = re.split(r'(?m)^(.+ (?:Line|LRT)) \((?:SMRT Trains|SBS Transit)\)\s*$',page['text'])
        covered = set()
        for i in range(1,len(sections),2):
            heading, body = sections[i:i+2]
            if heading not in headings: continue
            codes = [c for c in p['codes'].split('-') if c.startswith(headings[heading])]
            if len(codes)!=1: raise ValueError('Line/station mismatch: '+sid)
            code=codes[0]
            if code in covered: raise ValueError('Duplicate line table')
            covered.add(code)
            rows=[list(map(str.strip,row.split('|'))) for row in body.splitlines() if '|' in row]
            if len(rows)<5 or rows[0]!=['Train to','First train','Last train'] or rows[2] not in [
                ['Mon–Sat','Sun & PH','Daily'], ['Mon–Fri','Sat','Sun & PH','Daily']]:
                raise ValueError('Changed timetable header: '+sid)
            notes = body.split('Destination Notes',1)[1].split('* * *')[0].strip() if 'Destination Notes' in body else ''
            for row in rows[4:]:
                if len(row)!=len(rows[2])+1: raise ValueError('Changed timetable columns: '+sid+repr(row))
                destination, value=row[0],row[-1]
                if value=='–': minute=None
                else:
                    if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',value): raise ValueError('Invalid last departure')
                    h,m=map(int,value.split(':'));minute=h*60+m+(1440 if h<12 else 0)
                    if not 1260<=minute<=1800: raise ValueError('Outside evening service')
                rules=[dict(weekdays=list(range(1,8)),dayClass=day,validFrom=None,validTo=None,minute=minute,
                            status='published' if minute is not None else 'not-applicable') for day in ['regular','holiday']]
                records.append(dict(id=code+'-'+re.sub(r'[^a-z0-9]+','-',destination.lower()).strip('-'),
                    stationCode=code,line=headings[heading][0],destination=destination,sourceId=source_id,rules=rules,note=notes))
        required={c for c in p['codes'].split('-') if c.startswith(('NS','EW','CG','CC','CE','TE'))}
        if covered!=required: raise ValueError('Missing line table: '+sid)
    if seen!=expected: raise ValueError('Missing SMRT station pages')
    return records,sources

def build_snapshot(records, stations, sources, coverage=None, calendar=None):
    lookup = {c: f['properties']['id'] for f in stations for c in re.findall(r'[A-Z]+\d+[A-Z]?',f['properties']['codes'])}
    services, seen = [], set()
    for r in records:
        if r['stationCode'] not in lookup or r['id'] in seen: raise ValueError('Unknown code or duplicate service: '+r['id'])
        seen.add(r['id']); services.append(dict(r, stationId=lookup[r['stationCode']]))
    manifest = {}
    for f in stations:
        p=f['properties']; codes=re.findall(r'[A-Z]+\d+[A-Z]?',p['codes'])
        station_services=[r['id'] for r in services if r['stationId']==p['id']]
        complete=all(any(r['stationCode']==c for r in services) for c in codes) and bool(station_services)
        manifest[p['id']]=dict(expectedServiceIds=station_services, enumerationComplete=complete, reason='' if complete else 'Some line schedules are unavailable in this snapshot.')
    return dict(schemaVersion=1, timezone='Asia/Singapore', retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(), sources=sources, services=services, overrides=[], coverage=coverage or manifest, calendar=calendar or {'years': [], 'holidays': [], 'source': None})

def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--cached',type=Path); parser.add_argument('--smrt-capture',type=Path,default=ROOT/'tools/fixtures/last-trains/sgtrains.json'); args=parser.parse_args()
    html=args.cached.read_text() if args.cached else subprocess.check_output(['curl','-fsSL','--retry','2','--max-time','60',URL],text=True)
    stations=json.loads((ROOT/'data/explore/stations.geojson').read_text())['features']
    sources={ 'sbs-'+line: dict(url=URL, retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(), updated=date) for line,date in [('DT','2025-02-28'),('NE','2024-12-10')] }
    # Fail on changed editions so source dates cannot silently become stale metadata.
    if '28 February 2025' not in html or '10 Dec 2024' not in html: raise ValueError('Source edition changed; review timetable and metadata')
    extra, secondary_sources=parse_sgtrains(json.loads(args.smrt_capture.read_text()),stations)
    data=build_snapshot(parse_sbs(html)+extra,stations,sources | secondary_sources)
    path=ROOT/'data/explore/last-trains.json'; temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n'); temporary.replace(path)
    print(f"Imported {len(data['services'])} directional records at {len({r['stationId'] for r in data['services']})} stations; date exceptions explicitly unverified.")
if __name__=='__main__': main()
