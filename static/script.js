/* ═══════════════════════════════════════════════════════════════════════
   WeatherWise — script.js
═══════════════════════════════════════════════════════════════════════ */
"use strict";

/* ── DOM ──────────────────────────────────────────────────────────────── */
const cityInput   = document.getElementById("cityInput");
const searchBtn   = document.getElementById("searchBtn");
const locBtn      = document.getElementById("locBtn");
const locBtnBig   = document.getElementById("locBtnBig");
const loader      = document.getElementById("loader");
const errorToast  = document.getElementById("errorToast");
const errorMsg    = document.getElementById("errorMsg");
const mainContent = document.getElementById("mainContent");
const emptyState  = document.getElementById("emptyState");
const hourlyRow   = document.getElementById("hourlyRow");
const forecastGrid= document.getElementById("forecastGrid");
const recentWrap  = document.getElementById("recentWrap");
const recentChips = document.getElementById("recentChips");

/* ── Recent searches ─────────────────────────────────────────────────── */
let recent = JSON.parse(localStorage.getItem("ww_recent") || "[]");

function saveRecent(city) {
  recent = [city, ...recent.filter(c => c.toLowerCase() !== city.toLowerCase())].slice(0, 6);
  localStorage.setItem("ww_recent", JSON.stringify(recent));
}

function renderRecent() {
  if (recent.length === 0) { recentWrap.style.display = "none"; return; }
  recentWrap.style.display = "block";
  recentChips.innerHTML = recent.map(c =>
    `<span class="recent-chip" onclick="doSearch('${c}')">${c}</span>`
  ).join("");
}

/* ── Theme ───────────────────────────────────────────────────────────── */
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("ww_theme", t);
  document.getElementById("lightBtn").classList.toggle("active", t === "light");
  document.getElementById("darkBtn").classList.toggle("active",  t === "dark");
}
window.setTheme = setTheme;
setTheme(localStorage.getItem("ww_theme") || "dark");

/* ── Event listeners ─────────────────────────────────────────────────── */
searchBtn.addEventListener("click", () => {
  const c = cityInput.value.trim();
  if (c) doSearch(c);
});
cityInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { const c = cityInput.value.trim(); if (c) doSearch(c); }
});
locBtn.addEventListener("click",    getLocation);
locBtnBig.addEventListener("click", getLocation);

/* ── Geolocation ─────────────────────────────────────────────────────── */
function getLocation() {
  if (!navigator.geolocation) { showError("Geolocation not supported."); return; }
  showLoader();
  navigator.geolocation.getCurrentPosition(
    p => fetchWeather({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => { hideLoader(); showError("Location denied. Search by city instead."); }
  );
}

/* ── Fetch ───────────────────────────────────────────────────────────── */
async function doSearch(city) {
  cityInput.value = city;
  fetchWeather({ city });
}

async function fetchWeather({ city, lat, lon }) {
  showLoader();
  hideError();
  mainContent.style.display = "none";
  emptyState.style.display  = "none";

  try {
    let url = "/api/weather?";
    if (lat != null) url += `lat=${lat}&lon=${lon}`;
    else             url += `city=${encodeURIComponent(city)}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (!res.ok) { showError(data.error || "Failed to fetch."); emptyState.style.display = "flex"; renderRecent(); return; }

    if (city) saveRecent(data.current.city);
    render(data);

  } catch {
    showError("Network error. Please try again.");
    emptyState.style.display = "flex";
    renderRecent();
  } finally {
    hideLoader();
  }
}

/* ── Render ──────────────────────────────────────────────────────────── */
function render({ current: c, hourly, daily }) {

  /* Body condition class */
  const cond = (c.condition || "").toLowerCase();
  document.body.className =
    cond.includes("rain") || cond.includes("thunder") || cond.includes("drizzle") ? "cond-rain" :
    cond.includes("snow")  ? "cond-snow"  :
    cond.includes("cloud") ? "cond-cloud" :
    c.icon.endsWith("n")   ? "cond-night" :
    cond.includes("clear") || cond.includes("sun") ? "cond-clear" : "cond-default";

  /* Hero */
  set("heroCity",     `${c.city}, ${c.country}`);
  set("heroDatetime", c.date);
  set("heroTemp",     `${c.temp}°<span class="unit">C</span>`);
  set("heroDesc",     c.desc);
  set("heroFeels",    `${c.feels_like}°C`);
  setImg("heroIcon",  c.icon, c.desc);

  /* Stats mini */
  set("statHumidity",  c.humidity + "%");
  set("statWind",      c.wind_speed + " km/h");
  set("statPressure",  c.pressure + " hPa");
  set("statVisibility",c.visibility + " km");
  set("statUV",        c.uv || "N/A");

  /* Sun */
  set("heroSunrise", c.sunrise);
  set("heroSunset",  c.sunset);
  animateSun(c.sunrise, c.sunset);

  /* AQI */
  const aqiColors = {1:"#34d399",2:"#a3e635",3:"#facc15",4:"#fb923c",5:"#ef4444"};
  const badge = document.getElementById("aqiBadge");
  badge.textContent = c.aqi_label || "N/A";
  badge.style.background = (aqiColors[c.aqi] || "#60a5fa") + "22";
  badge.style.color = aqiColors[c.aqi] || "#60a5fa";
  set("aqiPm25", c.pm25 || "—");
  set("aqiPm10", c.pm10 || "—");
  set("aqiO3",   c.o3   || "—");
  set("aqiNo2",  c.no2  || "—");
  set("aqiCo",   c.co   || "—");

  /* Hourly */
  hourlyRow.innerHTML = "";
  hourly.forEach((h, i) => {
    const chip = document.createElement("div");
    chip.className = "hourly-chip";
    chip.style.animationDelay = i * 40 + "ms";
    chip.innerHTML = `
      <div class="h-time">${h.time}</div>
      <img class="h-icon" src="https://openweathermap.org/img/wn/${h.icon}@2x.png" alt="${h.desc}"/>
      <div class="h-temp">${h.temp}°</div>
      ${h.rain > 5 ? `<div class="h-rain">💧${h.rain}%</div>` : ""}
    `;
    hourlyRow.appendChild(chip);
  });

  /* 5-day */
  forecastGrid.innerHTML = "";
  daily.forEach((d, i) => {
    const card = document.createElement("div");
    card.className = "fc-card";
    card.style.animationDelay = i * 80 + "ms";
    card.innerHTML = `
      <div class="fc-day">${d.day}</div>
      <div class="fc-date">${d.date}</div>
      <img class="fc-icon" src="https://openweathermap.org/img/wn/${d.icon}@2x.png" alt="${d.desc}"/>
      <div class="fc-desc">${d.desc}</div>
      <div class="fc-temps">
        <span class="fc-max">${d.temp_max}°C</span>
        <span class="fc-min">${d.temp_min}°C</span>
      </div>
      <div class="fc-meta">
        <span class="fc-pill">💧${d.humidity}%</span>
        <span class="fc-pill">🌬${d.wind}km/h</span>
        ${d.rain > 5 ? `<span class="fc-pill">☔${d.rain}%</span>` : ""}
      </div>
    `;
    forecastGrid.appendChild(card);
  });

  mainContent.style.display = "grid";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function set(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "—";
}
function setImg(id, icon, alt) {
  const el = document.getElementById(id);
  if (el) { el.src = `https://openweathermap.org/img/wn/${icon}@4x.png`; el.alt = alt; }
}

function animateSun(riseStr, setStr) {
  const dot = document.getElementById("sunDot");
  if (!dot) return;
  function parseT(s) {
    const [time, per] = s.split(" ");
    let [h, m] = time.split(":").map(Number);
    if (per === "PM" && h !== 12) h += 12;
    if (per === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const now = new Date(), nm = now.getHours()*60+now.getMinutes();
  let t = (nm - parseT(riseStr)) / (parseT(setStr) - parseT(riseStr));
  t = Math.max(0, Math.min(1, t));
  const cx = (1-t)*(1-t)*10 + 2*(1-t)*t*100 + t*t*190;
  const cy = (1-t)*(1-t)*55 + 2*(1-t)*t*(-10) + t*t*55;
  dot.setAttribute("cx", cx.toFixed(1));
  dot.setAttribute("cy", cy.toFixed(1));
}

function showLoader() { loader.classList.add("show"); }
function hideLoader() { loader.classList.remove("show"); }
function showError(msg) { errorMsg.textContent = msg; errorToast.classList.add("show"); setTimeout(() => errorToast.classList.remove("show"), 5000); }
function hideError() { errorToast.classList.remove("show"); }

/* ── Auto-load ───────────────────────────────────────────────────────── */
(function init() {
  renderRecent();
  if (recent.length > 0) doSearch(recent[0]);
  else { emptyState.style.display = "flex"; renderRecent(); }
})();