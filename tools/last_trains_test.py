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
