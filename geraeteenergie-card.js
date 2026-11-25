/*
 * Geräteenergie-Karte für Home Assistant  –  v1.2.0
 * Zeigt den heutigen Verbrauch jedes Geräts aus den Energie-Einstellungen („Geräteverbrauch“)
 * als waagrechten Balken. Der senkrechte Strich markiert, wie viel das Gerät in den letzten
 * N Tagen im Schnitt bis zur gleichen Uhrzeit verbraucht hat; was heute darüber liegt, ist rot.
 * Die blasse Fläche reicht bis zum Ø eines ganzen Tages. Ein Tipp auf ein Gerät öffnet seinen Verlauf.
 * Alle Einstellungen gehen auch im Bearbeiten-Dialog der Karte.
 *
 * type: custom:geraeteenergie-card
 * title: Geräteenergie      # optional, Überschrift
 * days: 30                  # optional, Standard-Zeitraum in Tagen (1–90, Standard 30)
 * day_options: [7, 10, 30]  # optional, Zeiträume im Umschalter (Auswahl wird je Gerät gemerkt); [] blendet ihn aus
 * compare: time             # optional, time = Ø bis zur gleichen Uhrzeit, day = Ø ganzer Tage
 * scale: shared             # optional, shared = gemeinsame kWh-Achse, device = jeder Balken auf eigener Skala
 * hide_zero: false          # optional, Geräte ohne Verbrauch heute und ohne Ø ausblenden
 * max_devices: 12           # optional, höchstens so viele Geräte zeigen
 * decimals: 2               # optional, feste Nachkommastellen (sonst automatisch)
 *
 * Quelle: https://github.com/bryce2071/geraeteenergie-card (MIT-Lizenz)
 */
(() => {
  const TAG = "geraeteenergie-card";
  const EDITOR_TAG = `${TAG}-editor`;
  const VERSION = "1.2.0";
  if (customElements.get(TAG)) return;

  const DEFAULT_DAYS = 30;
  const DEFAULT_OPTIONS = [7, 10, 30];
  const MAX_DAYS = 90;
  const STEP_MS = 5 * 60 * 1000; // Home Assistant schreibt alle 5 Minuten Statistiken
  const STORE_KEY = `${TAG}:days`;
  const EPS = 0.001; // 1 Wh – weniger gilt nicht als „über Ø“
  const WIDE = "minmax(120px, 190px) minmax(0, 1fr) 172px";

  const STYLE = `
    :host {
      display: block;
      --ge-base: var(--energy-grid-consumption-color, #488fc2);
      --ge-over: var(--error-color, #db4437);
      --ge-mark: var(--primary-text-color, #212121);
      --ge-band: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.08);
      --ge-grid: var(--divider-color, rgba(127, 127, 127, 0.25));
    }
    [hidden] { display: none !important; }
    ha-card { height: 100%; box-sizing: border-box; }
    .head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 4px 12px; padding: 16px 16px 6px; }
    .titles { flex: 1 1 170px; min-width: 0; }
    .title {
      font-family: var(--ha-card-header-font-family, inherit);
      font-size: var(--ha-card-header-font-size, 24px);
      color: var(--ha-card-header-color, var(--primary-text-color));
      line-height: 32px; letter-spacing: -0.012em;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sub { color: var(--secondary-text-color); font-size: 13px; line-height: 18px; }
    .toggle-wrap { flex: none; display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; }
    .toggle-unit { color: var(--secondary-text-color); font-size: 12px; }
    .toggle {
      display: inline-flex; overflow: hidden;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3)); border-radius: 999px;
    }
    .toggle button {
      font: inherit; font-size: 12px; line-height: 16px; min-width: 34px; padding: 4px 9px; margin: 0; border: 0;
      background: none; color: var(--secondary-text-color); cursor: pointer; white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .toggle button + button { border-left: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3)); }
    .toggle button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    .content { padding: 4px 16px 14px; container-type: inline-size; }
    .msg { color: var(--secondary-text-color); font-size: 14px; padding: 6px 0 4px; }
    .msg.error { color: var(--ge-over); }
    .rows { display: flex; flex-direction: column; --grid-n: 4; }
    .row {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name val" "bar bar";
      column-gap: 12px; row-gap: 6px; align-items: baseline;
      padding: 6px 8px; margin: 0 -8px; border-radius: 8px; cursor: pointer; outline: none;
      --inset: 0px;
    }
    .row:hover, .row:focus-visible { background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.05); }
    .row.static { cursor: default; }
    .name {
      grid-area: name; min-width: 0; color: var(--primary-text-color); font-size: 14px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .val {
      grid-area: val; color: var(--secondary-text-color); font-size: 13px; white-space: nowrap;
      font-variant-numeric: tabular-nums; text-align: right;
    }
    .val .now { color: var(--primary-text-color); font-weight: 500; }
    .row.over .val .now { color: var(--ge-over); }
    .val .delta { color: var(--ge-over); font-size: 12px; margin-left: 4px; }
    .val .delta:empty { display: none; }
    .track {
      grid-area: bar; position: relative; height: 14px; align-self: center;
      background-image: linear-gradient(to right, var(--ge-grid) 1px, transparent 1px);
      background-size: calc(100% / var(--grid-n)) 100%;
      box-shadow: inset -1px 0 0 var(--ge-grid);
    }
    .rows.nogrid .track { background-image: none; box-shadow: none; }
    .track > div { position: absolute; top: var(--inset); bottom: var(--inset); left: 0; width: 0; }
    .track > .band { background: var(--ge-band); border-radius: 0 3px 3px 0; transition: width 0.6s ease; }
    .track > .seg { transition: left 0.6s ease, width 0.6s ease; }
    .track > .base { background: var(--ge-base); border-radius: 0 3px 3px 0; }
    .track > .base.has { min-width: 2px; }
    .row.over .track > .base { border-radius: 0; }
    .track > .over { background: var(--ge-over); border-radius: 0 3px 3px 0; }
    .track > .mark {
      width: 2px; margin-left: -1px; top: calc(var(--inset) - 4px); bottom: calc(var(--inset) - 4px);
      background: var(--ge-mark); border-radius: 1px; transition: left 0.6s ease;
    }
    .axis { position: relative; height: 16px; margin-top: 4px; }
    .ticks span {
      position: absolute; top: 0; transform: translateX(-50%); color: var(--secondary-text-color);
      font-size: 11px; line-height: 16px; white-space: nowrap; font-variant-numeric: tabular-nums;
    }
    .ticks span.first { transform: none; }
    .ticks span.last { transform: translateX(-100%); }
    .legend {
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 10px;
      color: var(--secondary-text-color); font-size: 12px; line-height: 16px;
    }
    .lg { display: inline-flex; align-items: center; gap: 6px; }
    .sw { display: inline-block; width: 12px; height: 10px; border-radius: 2px; }
    .sw.base { background: var(--ge-base); }
    .sw.over { background: var(--ge-over); }
    .sw.band { background: var(--ge-band); box-shadow: inset 0 0 0 1px var(--ge-grid); }
    .sw.mark { width: 2px; height: 14px; border-radius: 1px; background: var(--ge-mark); margin: 0 5px; }
    .stamp { margin-left: auto; }
    .stamp.error { color: var(--ge-over); }
    @container (min-width: 560px) {
      .row { grid-template-columns: ${WIDE}; grid-template-areas: "name bar val"; row-gap: 0; padding: 0 8px; align-items: center; --inset: 10px; }
      .name { text-align: right; }
      .val { text-align: left; }
      .track { height: 38px; }
      .axis-row { display: grid; grid-template-columns: ${WIDE}; grid-template-areas: ". bar ."; column-gap: 12px; }
      .axis-row .axis { grid-area: bar; }
    }
  `;

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const toMs = (v) => (typeof v === "number" ? v : Date.parse(v));
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const sumChange = (rows) => rows.reduce((a, r) => a + (Number.isFinite(r.change) ? r.change : 0), 0);
  const lastEnd = (sets, from) => {
    let t = from;
    sets.forEach((set) =>
      Object.values(set).forEach((rows) =>
        rows.forEach((r) => {
          t = Math.max(t, toMs(r.end));
        }),
      ),
    );
    return t;
  };

  // Achse mit runden Schritten (1, 2, 2,5, 5 × 10ⁿ) und etwas Luft nach oben
  const niceScale = (peak) => {
    if (!(peak > 0)) return { max: 1, step: 0.25 };
    const rough = peak / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const n = rough / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    return { max: Math.ceil((peak * 1.04) / step - 1e-9) * step, step };
  };
  const decimalsOf = (x) => {
    for (let d = 0; d < 4; d += 1) if (Math.abs(Math.round(x * 10 ** d) - x * 10 ** d) < 1e-6) return d;
    return 4;
  };
  const validDays = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_DAYS;
  const cleanOptions = (list) =>
    [...new Set(list.map((x) => Number(String(x).trim())).filter(validDays))].sort((a, b) => a - b);

  class GeraeteenergieCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._rows = new Map();
      this._onVisible = () => {
        if (document.visibilityState === "visible" && this._connected && this._isStale()) this._refresh();
      };
    }

    setConfig(config) {
      const cfg = { ...(config || {}) };
      const days = cfg.days === undefined ? DEFAULT_DAYS : Number(cfg.days);
      if (!validDays(days)) throw new Error(`'days' muss eine ganze Zahl zwischen 1 und ${MAX_DAYS} sein.`);
      const raw = cfg.day_options === undefined ? DEFAULT_OPTIONS : cfg.day_options;
      if (!Array.isArray(raw)) throw new Error("'day_options' muss eine Liste sein, z. B. [7, 10, 30].");
      const options = cleanOptions(raw);
      if (options.length && !options.includes(days)) options.push(days);
      options.sort((a, b) => a - b);
      if (cfg.compare !== undefined && cfg.compare !== "time" && cfg.compare !== "day") {
        throw new Error("'compare' muss 'time' (gleiche Uhrzeit) oder 'day' (ganze Tage) sein.");
      }
      const max = Number(cfg.max_devices);
      const dec = Number(cfg.decimals);
      this._config = {
        ...cfg,
        title: cfg.title === undefined ? "Geräteenergie" : cfg.title,
        days,
        day_options: options,
        compare: cfg.compare === "day" ? "day" : "time",
        scale: cfg.scale === "device" ? "device" : "shared",
        hide_zero: cfg.hide_zero === true,
        max_devices: Number.isInteger(max) && max > 0 ? max : 0,
        decimals: Number.isInteger(dec) && dec >= 0 && dec <= 3 ? dec : null,
      };
      this._days = this._storedDays() || days;
      this._built = false;
      this._rows = new Map();
      this._histKey = null;
      this._loadedAt = 0;
      if (this._hass) {
        this._render();
        this._kick();
      }
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first && this._config) {
        this._render();
        this._kick();
      }
    }

    connectedCallback() {
      this._connected = true;
      document.addEventListener("visibilitychange", this._onVisible);
      this._kick();
    }

    disconnectedCallback() {
      this._connected = false;
      document.removeEventListener("visibilitychange", this._onVisible);
      clearTimeout(this._timer);
      this._timer = null;
    }

    getCardSize() {
      const n = this._data ? this._data.items.length : 10;
      return Math.max(4, Math.ceil((n * 40 + 130) / 50));
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6 };
    }

    static getStubConfig() {
      return { title: "Geräteenergie", days: DEFAULT_DAYS, day_options: DEFAULT_OPTIONS.slice() };
    }

    static async getConfigElement() {
      await loadHaForm();
      return document.createElement(EDITOR_TAG);
    }

    // ---------- Daten ----------

    // Die Auswahl im Umschalter gilt nur, solange der Standard-Zeitraum derselbe ist
    _storedDays() {
      const opts = this._config.day_options;
      if (opts.length < 2) return null;
      try {
        const s = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
        return s && s.base === this._config.days && opts.includes(s.days) ? s.days : null;
      } catch (e) {
        return null;
      }
    }

    _isStale() {
      return !this._loadedAt || Date.now() - this._loadedAt > 2 * 60 * 1000;
    }

    _kick() {
      if (!this._hass || !this._config || !this._connected || this._loading) return;
      if (this._isStale() || !this._data) this._refresh();
      else this._schedule();
    }

    _schedule() {
      clearTimeout(this._timer);
      this._timer = null;
      if (!this._connected) return;
      const now = Date.now();
      // kurz nach jedem 5-Minuten-Raster, dann sind die neuen Statistiken geschrieben
      const next = Math.floor(now / STEP_MS) * STEP_MS + STEP_MS + 20 * 1000;
      this._timer = setTimeout(() => {
        this._timer = null;
        this._refresh();
      }, Math.max(10 * 1000, next - now));
    }

    async _refresh() {
      if (this._loading) {
        this._again = true;
        return;
      }
      this._loading = true;
      clearTimeout(this._timer);
      try {
        await this._load();
        this._error = null;
      } catch (err) {
        this._error = (err && (err.message || err.code)) || String(err);
        console.warn(`${TAG}:`, err);
      }
      this._loading = false;
      this._loadedAt = Date.now();
      this._render();
      if (this._again) {
        this._again = false;
        this._refresh();
        return;
      }
      this._schedule();
    }

    _stats(start, end, ids, period) {
      if (!ids.length || end <= start) return Promise.resolve({});
      return this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: ids,
        period,
        units: { energy: "kWh" },
        types: ["change"],
      });
    }

    async _load() {
      const hass = this._hass;
      if (!this._devices || Date.now() - this._devicesAt > 30 * 60 * 1000) {
        const prefs = await hass.callWS({ type: "energy/get_prefs" });
        this._devices = ((prefs && prefs.device_consumption) || [])
          .filter((d) => d && d.stat_consumption)
          .map((d, idx) => ({ id: d.stat_consumption, name: String(d.name || "").trim(), idx }));
        this._devicesAt = Date.now();
      }
      const ids = this._devices.map((d) => d.id);
      const now = new Date();
      const today = startOfDay(now);

      // Heute: volle Stunden aus der Langzeitstatistik, dazu die laufende Stunde aus der 5-Minuten-Statistik
      const hourly = (await this._stats(today, now, ids, "hour")) || {};
      const covered = lastEnd([hourly], today.getTime());
      const recent =
        covered < now.getTime() - 60 * 1000 ? (await this._stats(new Date(covered), now, ids, "5minute")) || {} : {};
      // so weit reichen die heutigen Daten – bis zu dieser Uhrzeit wird mit den Vortagen verglichen
      const cutoff = new Date(Math.min(lastEnd([hourly, recent], today.getTime()), now.getTime()));

      // Stundenwerte der letzten N vollen Tage – nur neu laden bei neuem Tag, anderen Geräten
      // oder wenn mehr Tage gebraucht werden als schon geladen sind (kürzere Zeiträume nutzen dieselben Daten)
      const days = this._days;
      const histKey = `${today.getTime()}|${ids.join(",")}`;
      if (this._histKey !== histKey || this._histDays < days) {
        this._hist = (await this._stats(addDays(today, -days), today, ids, "hour")) || {};
        this._histKey = histKey;
        this._histDays = days;
      }
      const bounds = [];
      for (let k = 1; k <= days; k += 1) {
        const start = addDays(today, -k);
        const end = addDays(today, 1 - k);
        const target = new Date(start);
        target.setHours(cutoff.getHours(), cutoff.getMinutes(), 0, 0);
        bounds.push({ start: start.getTime(), end: end.getTime(), target: Math.min(target.getTime(), end.getTime()) });
      }

      const items = this._devices.map((d) => {
        const rows = [...(hourly[d.id] || []), ...(recent[d.id] || [])];
        const st = hass.states[d.id];
        const ref = this._reference(this._hist[d.id] || [], bounds);
        return {
          id: d.id,
          idx: d.idx,
          name: d.name || (st && st.attributes.friendly_name) || d.id,
          today: Math.max(0, sumChange(rows)),
          part: ref ? ref.part : null,
          full: ref ? ref.full : null,
          n: ref ? ref.n : 0,
          entity: !!st,
        };
      });
      this._data = { items, days, at: now, cutoff };
    }

    // Ø je Tag – ganzer Tag und bis zur gleichen Uhrzeit wie heute (angebrochene Stunde anteilig)
    _reference(rows, bounds) {
      const acc = bounds.map(() => ({ full: 0, part: 0, has: false }));
      rows.forEach((r) => {
        if (!Number.isFinite(r.change)) return;
        const s = toMs(r.start);
        const e = toMs(r.end);
        const k = bounds.findIndex((b) => s >= b.start && s < b.end);
        if (k < 0) return;
        const a = acc[k];
        const t = bounds[k].target;
        a.has = true;
        a.full += r.change;
        if (e <= t) a.part += r.change;
        else if (s < t) a.part += (r.change * (t - s)) / (e - s);
      });
      const used = acc.filter((a) => a.has);
      if (!used.length) return null;
      const mean = (key) => Math.max(0, used.reduce((x, a) => x + a[key], 0) / used.length);
      return { full: mean("full"), part: mean("part"), n: used.length };
    }

    // ---------- Darstellung ----------

    _numberLocale() {
      const loc = (this._hass && this._hass.locale) || {};
      switch (loc.number_format) {
        case "comma_decimal":
          return ["en-US", "en"];
        case "decimal_comma":
          return ["de", "es", "it"];
        case "space_comma":
          return ["fr", "sv", "cs"];
        case "system":
          return undefined;
        default:
          return loc.language || (this._hass && this._hass.language) || "de";
      }
    }

    _fmt(value, decimals) {
      try {
        return new Intl.NumberFormat(this._numberLocale(), {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
      } catch (e) {
        return value.toFixed(decimals);
      }
    }

    _kwh(v) {
      if (this._config.decimals !== null) return this._fmt(v, this._config.decimals);
      if (Math.abs(v) < 0.0005) return "0";
      if (v < 0.005) return `< ${this._fmt(0.01, 2)}`;
      return this._fmt(v, v >= 100 ? 0 : v >= 10 ? 1 : 2);
    }

    _time(date) {
      try {
        const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || "de";
        return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(date);
      } catch (e) {
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
    }

    _build() {
      const cfg = this._config;
      const toggle =
        cfg.day_options.length > 1
          ? `<div class="toggle-wrap"><div class="toggle" role="group" aria-label="Zeitraum für den Durchschnitt">${cfg.day_options
              .map((d) => `<button type="button" data-days="${d}" aria-label="${d} Tage">${d}</button>`)
              .join("")}</div><span class="toggle-unit">Tage</span></div>`
          : "";
      this.shadowRoot.innerHTML = `
        <style>${STYLE}</style>
        <ha-card>
          <div class="head">
            <div class="titles">
              ${cfg.title ? `<div class="title">${esc(cfg.title)}</div>` : ""}
              <div class="sub"></div>
            </div>
            ${toggle}
          </div>
          <div class="content">
            <div class="msg"></div>
            <div class="chart" hidden>
              <div class="rows"></div>
              <div class="axis-row"><div class="axis"><div class="ticks"></div></div></div>
              <div class="legend">
                <span class="lg"><i class="sw base"></i>heute</span>
                <span class="lg"><i class="sw over"></i>über Ø</span>
                <span class="lg"><i class="sw mark"></i><span class="lg-mark"></span></span>
                <span class="lg lg-band"><i class="sw band"></i>Ø ganzer Tag</span>
                <span class="stamp"></span>
              </div>
            </div>
          </div>
        </ha-card>`;
      this.shadowRoot.querySelectorAll(".toggle button").forEach((b) => {
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const d = Number(b.dataset.days);
          if (d === this._days) return;
          this._days = d;
          try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify({ days: d, base: this._config.days }));
          } catch (e) {
            /* ohne Speicher gilt die Auswahl bis zum Neuladen */
          }
          this._render();
          this._refresh();
        });
      });
      this._rows = new Map();
      this._built = true;
    }

    _makeRow(item) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="name"></div>
        <div class="val"><span class="now"></span><span class="delta"></span><span class="avg"></span></div>
        <div class="track"><div class="band"></div><div class="seg base"></div><div class="seg over"></div><div class="mark"></div></div>`;
      if (item.entity) {
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.addEventListener("click", () => this._moreInfo(item.id));
        row.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            this._moreInfo(item.id);
          }
        });
      } else {
        row.classList.add("static");
      }
      return row;
    }

    _model() {
      const cfg = this._config;
      let items = this._data.items.map((it) => ({ ...it, ref: cfg.compare === "day" ? it.full : it.part }));
      if (cfg.hide_zero) items = items.filter((it) => it.today > EPS || (it.full !== null && it.full > EPS));
      const fullOf = (it) => (it.full === null ? -1 : it.full);
      items.sort((a, b) => b.today - a.today || fullOf(b) - fullOf(a) || a.idx - b.idx);
      if (cfg.max_devices) items = items.slice(0, cfg.max_devices);
      const peak = items.reduce((m, it) => Math.max(m, it.today, it.ref || 0, it.full || 0), 0);
      return { items, scale: niceScale(peak) };
    }

    _render() {
      if (!this._config || !this._hass) return;
      if (!this._built) this._build();
      const root = this.shadowRoot;
      const cfg = this._config;
      const byTime = cfg.compare === "time";
      const days = this._data ? this._data.days : this._days;
      const until = this._data ? this._time(this._data.cutoff) : "";

      root.querySelector(".sub").textContent = byTime
        ? until
          ? `Heute bis ${until} · Ø der letzten ${days} Tage bis ${until}`
          : `Heute · Ø der letzten ${days} Tage bis zur gleichen Uhrzeit`
        : `Heute im Vergleich zum Ø der letzten ${days} Tage`;
      root.querySelectorAll(".toggle button").forEach((b) => b.classList.toggle("on", Number(b.dataset.days) === this._days));

      const msg = root.querySelector(".msg");
      const chart = root.querySelector(".chart");
      if (!this._data || !this._data.items.length) {
        msg.hidden = false;
        msg.classList.toggle("error", !!this._error);
        msg.textContent = this._error
          ? `Daten konnten nicht geladen werden: ${this._error}`
          : this._data
            ? "Im Energie-Dashboard sind keine Geräte eingetragen."
            : "Lade Verbrauchsdaten …";
        chart.hidden = true;
        return;
      }
      msg.hidden = true;
      chart.hidden = false;

      const { items, scale } = this._model();
      const rowsEl = root.querySelector(".rows");
      const steps = Math.max(1, Math.round(scale.max / scale.step));
      rowsEl.style.setProperty("--grid-n", String(steps));
      rowsEl.classList.toggle("nogrid", cfg.scale === "device");

      // neue Zeilen erst anlegen, dann füllen – so wachsen die Balken beim ersten Mal aus 0 heraus
      const wanted = new Set(items.map((it) => it.id));
      for (const [id, row] of this._rows) {
        if (!wanted.has(id)) {
          row.remove();
          this._rows.delete(id);
        }
      }
      let added = false;
      items.forEach((it) => {
        if (!this._rows.has(it.id)) {
          const row = this._makeRow(it);
          rowsEl.appendChild(row);
          this._rows.set(it.id, row);
          added = true;
        }
      });
      if (added) void rowsEl.offsetWidth;
      items.forEach((it, i) => {
        const max = cfg.scale === "device" ? niceScale(Math.max(it.today, it.ref || 0, it.full || 0)).max : scale.max;
        this._fillRow(this._rows.get(it.id), it, i, max, days, byTime ? until : "");
      });

      // Achse
      const axisRow = root.querySelector(".axis-row");
      axisRow.hidden = cfg.scale === "device";
      if (!axisRow.hidden) {
        const dec = decimalsOf(scale.step);
        root.querySelector(".ticks").innerHTML = Array.from({ length: steps + 1 }, (_, k) => {
          const cls = k === 0 ? "first" : k === steps ? "last" : "";
          return `<span class="${cls}" style="left:${(k / steps) * 100}%">${this._fmt(k * scale.step, dec)}${k === steps ? " kWh" : ""}</span>`;
        }).join("");
      }

      root.querySelector(".lg-mark").textContent = byTime ? `Ø bis ${until}` : `Ø ${days} Tage`;
      root.querySelector(".lg-band").hidden = !byTime;
      const stamp = root.querySelector(".stamp");
      stamp.textContent = [byTime ? "" : `Stand ${this._time(this._data.at)}`, this._error ? "Aktualisierung fehlgeschlagen" : ""]
        .filter(Boolean)
        .join(" · ");
      stamp.classList.toggle("error", !!this._error);
    }

    _fillRow(row, it, order, max, days, until) {
      const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
      const hasRef = it.ref !== null;
      const over = hasRef ? it.today - it.ref : 0;
      const isOver = hasRef && over >= EPS;
      const base = hasRef ? Math.min(it.today, it.ref) : it.today;

      row.style.order = String(order);
      row.classList.toggle("over", isOver);
      row.querySelector(".name").textContent = it.name;
      row.querySelector(".now").textContent = `${this._kwh(it.today)} kWh`;
      let delta = "";
      if (isOver && it.ref > EPS) {
        const p = Math.round((it.today / it.ref - 1) * 100);
        delta = p > 999 ? "> +999 %" : `+${this._fmt(p, 0)} %`;
      }
      row.querySelector(".delta").textContent = delta;
      row.querySelector(".avg").textContent = ` · Ø ${hasRef ? this._kwh(it.ref) : "–"}`;

      row.querySelector(".band").style.width = it.full !== null ? `${pct(it.full)}%` : "0";
      const b = row.querySelector(".seg.base");
      b.style.width = `${pct(base)}%`;
      b.classList.toggle("has", base >= EPS);
      const o = row.querySelector(".seg.over");
      o.style.left = `${pct(hasRef ? it.ref : 0)}%`;
      o.style.width = isOver ? `${pct(it.today) - pct(it.ref)}%` : "0";
      const m = row.querySelector(".mark");
      m.hidden = !hasRef;
      m.style.left = `${pct(hasRef ? it.ref : 0)}%`;

      const fewer = it.n && it.n < days ? ` (nur ${it.n} Tage mit Daten)` : "";
      let refTxt = "noch kein Durchschnitt";
      if (hasRef && until) {
        refTxt = `Ø der letzten ${days} Tage bis ${until}: ${this._kwh(it.ref)} kWh, ganzer Tag: ${this._kwh(it.full)} kWh${fewer}`;
      } else if (hasRef) {
        refTxt = `Ø der letzten ${days} Tage ${this._kwh(it.ref)} kWh${fewer}`;
      }
      const overTxt = isOver ? `, ${this._kwh(over)} kWh darüber` : "";
      row.title = `${it.name}: heute${until ? ` bis ${until}` : ""} ${this._kwh(it.today)} kWh – ${refTxt}${overTxt}`;
      row.setAttribute("aria-label", row.title);
    }

    _moreInfo(entityId) {
      const ev = new Event("hass-more-info", { bubbles: true, composed: true });
      ev.detail = { entityId };
      this.dispatchEvent(ev);
    }
  }

  // ---------- Bearbeiten-Dialog ----------

  // ha-form lädt Home Assistant erst bei Bedarf – notfalls über den Editor einer eingebauten Karte nachladen
  const loadHaForm = async () => {
    if (customElements.get("ha-form")) return;
    try {
      const helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null;
      const card = helpers ? await helpers.createCardElement({ type: "button" }) : null;
      if (card && card.constructor.getConfigElement) await card.constructor.getConfigElement();
    } catch (e) {
      /* dann bleibt der Code-Editor */
    }
  };

  const EDITOR_SCHEMA = [
    { name: "title", selector: { text: {} } },
    { name: "days", required: true, selector: { number: { min: 1, max: MAX_DAYS, step: 1, mode: "box", unit_of_measurement: "Tage" } } },
    {
      name: "day_options",
      selector: {
        select: {
          multiple: true,
          custom_value: true,
          options: [7, 10, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} Tage` })),
        },
      },
    },
    {
      name: "compare",
      selector: {
        select: {
          options: [
            { value: "time", label: "bis zur gleichen Uhrzeit" },
            { value: "day", label: "ganze Tage" },
          ],
        },
      },
    },
    {
      name: "scale",
      selector: {
        select: {
          options: [
            { value: "shared", label: "gemeinsame kWh-Achse" },
            { value: "device", label: "jeder Balken eigene Skala" },
          ],
        },
      },
    },
    { name: "hide_zero", selector: { boolean: {} } },
  ];
  const EDITOR_LABELS = {
    title: "Überschrift",
    days: "Standard-Zeitraum",
    day_options: "Zeiträume im Umschalter",
    compare: "Vergleich",
    scale: "Skala",
    hide_zero: "Geräte ohne Verbrauch ausblenden",
  };
  const EDITOR_HELPERS = {
    days: `Mit diesem Zeitraum startet die Karte (1–${MAX_DAYS} Tage).`,
    day_options: "Eigene Zahl eintippen und mit Enter hinzufügen; ein leerer Umschalter wird ausgeblendet.",
    compare: "Womit der heutige Verbrauch verglichen wird.",
  };

  class GeraeteenergieCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = { ...(config || {}) };
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
    }

    _render() {
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
        this._form.computeHelper = (s) => EDITOR_HELPERS[s.name] || "";
        this._form.addEventListener("value-changed", (ev) => this._changed(ev));
        this.appendChild(this._form);
      }
      const c = this._config;
      this._form.hass = this._hass;
      this._form.schema = EDITOR_SCHEMA;
      this._form.data = {
        title: c.title === undefined ? "Geräteenergie" : c.title,
        days: c.days === undefined ? DEFAULT_DAYS : c.days,
        day_options: (Array.isArray(c.day_options) ? c.day_options : DEFAULT_OPTIONS).map(String),
        compare: c.compare || "time",
        scale: c.scale || "shared",
        hide_zero: c.hide_zero === true,
      };
    }

    _changed(ev) {
      ev.stopPropagation();
      const v = (ev.detail && ev.detail.value) || {};
      const config = { ...this._config, ...v, day_options: cleanOptions(Array.isArray(v.day_options) ? v.day_options : []) };
      if (v.days === undefined || v.days === null || v.days === "") delete config.days;
      else config.days = Number(v.days);
      if (!config.hide_zero) delete config.hide_zero;
      this._config = config;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    }
  }

  customElements.define(EDITOR_TAG, GeraeteenergieCardEditor);
  customElements.define(TAG, GeraeteenergieCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: TAG,
    name: "Geräteenergie mit Durchschnitt",
    description: "Verbrauch heute je Gerät, mit Strich für den Ø der letzten Tage bis zur gleichen Uhrzeit; was darüber liegt, ist rot.",
  });
  console.info(`%c GERAETEENERGIE-CARD %c ${VERSION} `, "color:#fff;background:#488fc2;font-weight:600", "color:#488fc2");
})();
