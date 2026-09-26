from pathlib import Path
from fetch_last_trains import parse_time, parse_sbs, build_snapshot
assert parse_time('11.59pm') == 1439
assert parse_time('12.00am') == 1440
assert parse_time('12.20am') == 1460
assert parse_time('-') is None
for text in ['', '25:99', '1.75am']:
    try: parse_time(text)
    except ValueError: pass
    else: raise AssertionError(text)
html = Path('tools/fixtures/last-trains/sbs.html').read_text()
records = parse_sbs(html)
assert len(records) == 104
assert next(r for r in records if r['stationCode']=='DT14' and r['destination']=='Expo')['rules'][0]['minute'] == 1441
assert next(r for r in records if r['stationCode']=='DT35' and r['destination']=='Expo')['rules'][0]['status'] == 'not-applicable'
try: parse_sbs(html.replace('Last Trains','Unknown column'))
except ValueError: pass
else: raise AssertionError('Changed headers must fail')
print('Last-train parser checks passed')
import json
stations = json.loads(Path('data/explore/stations.geojson').read_text())['features']
for bad in [records + [records[0]], [dict(records[0], stationCode='DT999')]]:
    try: build_snapshot(bad, stations, {})
    except ValueError: pass
    else: raise AssertionError('Unknown code / duplicate accepted')
# Failed refreshes must not replace a working snapshot.
import tempfile, sys
import fetch_last_trains as importer
old_root, old_args = importer.ROOT, sys.argv
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory); (root/'data/explore').mkdir(parents=True)
    output = root/'data/explore/last-trains.json'; output.write_text('previous snapshot')
    (root/'data/explore/stations.geojson').write_text(json.dumps({'features':stations}))
    invalid = root/'bad.html'; invalid.write_text('changed layout')
    importer.ROOT = root; sys.argv = ['fetch_last_trains.py','--cached',str(invalid)]
    try: importer.main()
    except ValueError: pass
    else: raise AssertionError('Invalid source accepted')
    assert output.read_text() == 'previous snapshot'
importer.ROOT, sys.argv = old_root, old_args
print('Import rejection and snapshot preservation checks passed')

from fetch_last_trains import parse_sgtrains
capture=json.loads(Path('tools/fixtures/last-trains/sgtrains.json').read_text())
extra, sources=parse_sgtrains(capture, stations)
khatib=[r for r in extra if r['stationCode']=='NS14']
assert next(r for r in khatib if r['destination']=='Jurong East')['rules'][0]['minute']==1466
assert next(r for r in khatib if r['destination']=='Yishun')['rules'][0]['status']=='not-applicable'
assert any(r['stationCode']=='CG2' and 'Tanah Merah' in r.get('note','') for r in extra)
for invalid in [dict(capture,pages=capture['pages'][:-1]),dict(capture,pages=capture['pages']+[capture['pages'][0]])]:
    try: parse_sgtrains(invalid,stations)
    except ValueError: pass
    else: raise AssertionError('Incomplete or duplicate station capture accepted')
bad=json.loads(json.dumps(capture));bad['pages'][0]['text']=bad['pages'][0]['text'].replace('Daily','Unknown')
try: parse_sgtrains(bad,stations)
except ValueError: pass
else: raise AssertionError('Changed day header accepted')
print('SMRT alternative-source checks passed')
