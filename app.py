from flask import Flask, render_template, request, jsonify
import requests
import os
from datetime import datetime

app = Flask(__name__)

API_KEY  = os.environ.get("OWM_API_KEY", "2fa27bcfb5e78502ee951f35ce96e114")
BASE_URL = "https://api.openweathermap.org/data/2.5"
AIR_URL  = "https://api.openweathermap.org/data/2.5/air_pollution"

def fmt_time(ts, tz=0):
    return datetime.utcfromtimestamp(ts + tz).strftime("%I:%M %p")

def fmt_date(ts, tz=0):
    return datetime.utcfromtimestamp(ts + tz).strftime("%A, %d %b %Y | %I:%M %p")

def build_response(cur):
    lat, lon = cur["coord"]["lat"], cur["coord"]["lon"]
    tz = cur.get("timezone", 0)

    fc = requests.get(f"{BASE_URL}/forecast",
        params={"lat": lat, "lon": lon, "appid": API_KEY, "units": "metric"},
        timeout=10).json()

    # AQI
    aqi_val, aqi_label, pm25, pm10, co, no2, o3 = "N/A", "N/A", 0, 0, 0, 0, 0
    try:
        ar = requests.get(AIR_URL, params={"lat": lat, "lon": lon, "appid": API_KEY}, timeout=8).json()
        lst = ar.get("list", [{}])[0]
        aqi_val = lst.get("main", {}).get("aqi", 0)
        comp = lst.get("components", {})
        pm25, pm10, co, no2, o3 = (round(comp.get(k,0),1) for k in ["pm2_5","pm10","co","no2","o3"])
        aqi_label = {1:"Good",2:"Fair",3:"Moderate",4:"Poor",5:"Very Poor"}.get(aqi_val,"N/A")
    except: pass

    # UV index from onecall or forecast
    uv = "N/A"
    try:
        uv_r = requests.get(f"{BASE_URL}/uvi",
            params={"lat": lat, "lon": lon, "appid": API_KEY}, timeout=8)
        if uv_r.status_code == 200:
            uv_val = uv_r.json().get("value", 0)
            uv_label = "Low" if uv_val < 3 else "Moderate" if uv_val < 6 else "High" if uv_val < 8 else "Very High"
            uv = f"{uv_val} ({uv_label})"
    except: pass

    current = {
        "city": cur["name"], "country": cur["sys"]["country"],
        "date": fmt_date(cur["dt"], tz),
        "temp": round(cur["main"]["temp"]),
        "feels_like": round(cur["main"]["feels_like"]),
        "temp_min": round(cur["main"]["temp_min"]),
        "temp_max": round(cur["main"]["temp_max"]),
        "desc": cur["weather"][0]["description"].title(),
        "icon": cur["weather"][0]["icon"],
        "condition": cur["weather"][0]["main"],
        "humidity": cur["main"]["humidity"],
        "wind_speed": round(cur["wind"]["speed"] * 3.6, 1),
        "pressure": cur["main"]["pressure"],
        "visibility": round(cur.get("visibility",0) / 1000, 1),
        "uv": uv,
        "clouds": cur["clouds"]["all"],
        "sunrise": fmt_time(cur["sys"]["sunrise"], tz),
        "sunset":  fmt_time(cur["sys"]["sunset"],  tz),
        "aqi": aqi_val, "aqi_label": aqi_label,
        "pm25": pm25, "pm10": pm10, "co": co, "no2": no2, "o3": o3,
    }

    # Hourly (next 8 = 24h)
    hourly = []
    for item in fc["list"][:8]:
        hourly.append({
            "time": fmt_time(item["dt"], tz),
            "temp": round(item["main"]["temp"]),
            "icon": item["weather"][0]["icon"],
            "desc": item["weather"][0]["description"].title(),
            "rain": round(item.get("pop",0)*100),
        })

    # 5-day daily
    today = datetime.utcfromtimestamp(cur["dt"]+tz).strftime("%Y-%m-%d")
    seen, daily = set(), []
    for item in fc["list"]:
        d = datetime.utcfromtimestamp(item["dt"]+tz)
        ds = d.strftime("%Y-%m-%d")
        if ds == today or ds in seen: continue
        seen.add(ds)
        daily.append({
            "day":      d.strftime("%a"),
            "date":     d.strftime("%d %b"),
            "temp_max": round(item["main"]["temp_max"]),
            "temp_min": round(item["main"]["temp_min"]),
            "icon":     item["weather"][0]["icon"],
            "desc":     item["weather"][0]["description"].title(),
            "humidity": item["main"]["humidity"],
            "wind":     round(item["wind"]["speed"]*3.6,1),
            "rain":     round(item.get("pop",0)*100),
        })
        if len(daily) == 5: break

    return {"current": current, "hourly": hourly, "daily": daily}, None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/weather")
def api_weather():
    city = request.args.get("city","").strip()
    lat  = request.args.get("lat")
    lon  = request.args.get("lon")
    try:
        if lat and lon:
            r = requests.get(f"{BASE_URL}/weather",
                params={"lat":lat,"lon":lon,"appid":API_KEY,"units":"metric"}, timeout=10)
        elif city:
            r = requests.get(f"{BASE_URL}/weather",
                params={"q":city,"appid":API_KEY,"units":"metric"}, timeout=10)
        else:
            return jsonify({"error":"Provide city or coordinates."}), 400

        if r.status_code == 404: return jsonify({"error":"City not found. Please try again."}), 404
        if r.status_code == 401: return jsonify({"error":"Invalid API key."}), 401
        r.raise_for_status()
        data, err = build_response(r.json())
        if err: return jsonify({"error": err}), 404
        return jsonify(data)
    except requests.exceptions.ConnectionError:
        return jsonify({"error":"Network error. Check your connection."}), 503
    except requests.exceptions.Timeout:
        return jsonify({"error":"Request timed out. Try again."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
