import urllib.request, json, os, csv
from datetime import datetime

now = datetime.now()
hour = now.hour
LOG_FILE = os.path.join(os.path.dirname(__file__), 'calibration_log.csv')

def fetch(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)

def get_wind_temp(lat, lng):
    url = f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&hourly=windspeed_10m,temperature_2m&wind_speed_unit=kn&timezone=America%2FLos_Angeles&forecast_days=1&models=icon_seamless'
    d = fetch(url)
    idx = next(i for i,t in enumerate(d['hourly']['time']) if int(t[11:13])==hour)
    return round(d['hourly']['windspeed_10m'][idx],1), round(d['hourly']['temperature_2m'][idx],1)

def get_temp(lat, lng):
    url = f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&hourly=temperature_2m&timezone=America%2FLos_Angeles&forecast_days=1&models=icon_seamless'
    d = fetch(url)
    idx = next(i for i,t in enumerate(d['hourly']['time']) if int(t[11:13])==hour)
    return round(d['hourly']['temperature_2m'][idx],1)

print('Fetching data...')
crissy_wind, crissy_temp = get_wind_temp(37.8037, -122.4668)
alameda_wind, alameda_temp = get_wind_temp(37.7627, -122.2721)
coyote_wind, coyote_temp = get_wind_temp(37.5889, -122.3277)
inland_temp = get_temp(37.6819, -121.7680)

timestamp = now.strftime('%Y-%m-%d %H:%M')
crissy_diff = round(inland_temp - crissy_temp, 1)
alameda_diff = round(inland_temp - alameda_temp, 1)
coyote_diff = round(inland_temp - coyote_temp, 1)

# write header if file doesn't exist
write_header = not os.path.exists(LOG_FILE)
with open(LOG_FILE, 'a', newline='\n') as f:
    writer = csv.writer(f)
    if write_header:
        writer.writerow([
            'timestamp', 'inland_temp',
            'crissy_icon', 'crissy_coast_temp', 'crissy_diff', 'crissy_actual',
            'alameda_icon', 'alameda_coast_temp', 'alameda_diff', 'alameda_actual',
            'coyote_icon', 'coyote_coast_temp', 'coyote_diff', 'coyote_actual',
        ])
    writer.writerow([
        timestamp, inland_temp,
        crissy_wind, crissy_temp, crissy_diff, '',
        alameda_wind, alameda_temp, alameda_diff, '',
        coyote_wind, coyote_temp, coyote_diff, '',
    ])

print(f'Time: {timestamp}')
print(f'Inland (Livermore): {inland_temp}C')
print()
print(f'Crissy Field:  ICON={crissy_wind}kt  coast={crissy_temp}C  diff={crissy_diff}C  actual=???')
print(f'Alameda Beach: ICON={alameda_wind}kt  coast={alameda_temp}C  diff={alameda_diff}C  actual=???')
print(f'Coyote Point:  ICON={coyote_wind}kt  coast={coyote_temp}C  diff={coyote_diff}C  actual=???')
print()
print(f'Row added to {LOG_FILE}')
print('Open the CSV and fill in the actual columns (crissy_actual, alameda_actual, coyote_actual)')
