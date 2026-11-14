<template>
  <main class="pharma-shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">COLD CHAIN · ENVIRONMENTAL CONTROL</div>
        <h1>Pharmaceutical Storage Monitor</h1>
        <p class="muted">Live conditions, traceable readings and inspection records</p>
      </div>
      <div class="connect-pill" :class="apiOk ? 'connected' : 'disconnected'">
        <span class="pulse-dot"></span>{{ apiOk ? 'API CONNECTED' : 'API UNAVAILABLE' }}
      </div>
    </header>

    <section class="section-heading">
      <div><span class="section-index">01</span><h2>Storage overview</h2></div>
      <span class="muted">Refreshes every 5 seconds</span>
    </section>
    <section class="metric-grid">
      <article class="metric-card">
        <div class="metric-label"><span class="metric-icon blue">°</span><span>TEMPERATURE</span></div>
        <div class="metric-value">{{ fmt(latest?.temperature, 1) }}<small>°C</small></div>
        <div class="meter"><i :style="{width: gauge(latest?.temperature, -10, 50) + '%', background: '#54a5ff'}"></i></div>
        <div class="metric-foot"><span>Configured range</span><b>{{ limits.temp }}</b></div>
      </article>
      <article class="metric-card">
        <div class="metric-label"><span class="metric-icon violet">% </span><span>RELATIVE HUMIDITY</span></div>
        <div class="metric-value">{{ fmt(latest?.humidity, 1) }}<small>% RH</small></div>
        <div class="meter"><i :style="{width: gauge(latest?.humidity, 0, 100) + '%', background: '#aa8cff'}"></i></div>
        <div class="metric-foot"><span>Configured range</span><b>{{ limits.humidity }}</b></div>
      </article>
      <article class="metric-card">
        <div class="metric-label"><span class="metric-icon amber">☼</span><span>LIGHT EXPOSURE</span></div>
        <div class="metric-value">{{ fmt(latest?.light_percentage, 1) }}<small>%</small></div>
        <div class="meter"><i :style="{width: gauge(latest?.light_percentage, 0, 100) + '%', background: '#ffbd58'}"></i></div>
        <div class="metric-foot"><span>Configured maximum</span><b>{{ limits.light }}</b></div>
        <div class="sub-reading">LDR raw · {{ latest ? latest.light_raw : '—' }} / 4095</div>
      </article>
      <article class="metric-card score-card">
        <div class="metric-label"><span class="metric-icon green">✦</span><span>MEDICINE STORAGE SCORE</span></div>
        <div class="score-row">
          <div class="score-ring" :style="{background: scoreGradient}"><div><strong>{{ fmt(score?.overall_score, 1) }}</strong><small>/ 100</small></div></div>
          <div><div class="status-chip" :class="statusClass(score?.status)">{{ score?.status || 'Unavailable' }}</div><p class="muted score-caption">Weighted environmental index</p></div>
        </div>
        <div class="metric-foot"><span>Temperature · 45%</span><b>{{ fmt(score?.temperature_score, 0) }}</b></div>
        <div class="metric-foot"><span>Humidity · 35%</span><b>{{ fmt(score?.humidity_score, 0) }}</b></div>
        <div class="metric-foot"><span>Light · 20%</span><b>{{ fmt(score?.light_score, 0) }}</b></div>
      </article>
    </section>

    <section class="status-strip">
      <div class="status-item"><span class="mini-label">DEVICE</span><span class="status-chip" :class="latest?.device_status === 'online' ? 'safe' : 'danger'">{{ latest?.device_status || 'offline' }}</span></div>
      <div class="status-item"><span class="mini-label">DEVICE ID</span><b>{{ latest?.device_id || configuredDevice }}</b></div>
      <div class="status-item"><span class="mini-label">LAST SENSOR UPDATE</span><b>{{ dateTime(latest?.timestamp) }}</b></div>
      <div class="status-item"><span class="mini-label">SENSOR RECORDS</span><b>{{ health?.counts?.readings ?? '—' }}</b></div>
      <div class="status-item"><span class="mini-label">SYSTEM HEALTH</span><b :class="apiOk ? 'text-safe' : 'text-danger'">{{ apiOk ? 'Operational' : 'Unavailable' }}</b></div>
    </section>

    <section class="section-heading analytics-heading">
      <div><span class="section-index">02</span><h2>Historical analytics</h2></div>
      <label class="range-select">TIME WINDOW
        <select v-model="range"><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option></select>
      </label>
    </section>
    <section class="chart-grid">
      <article class="panel chart-panel"><div class="panel-title"><div><span class="chart-dot blue-bg"></span><b>Temperature</b></div><span class="muted">°C</span></div>
        <svg viewBox="0 0 600 150" role="img" aria-label="Temperature history chart"><path class="gridline" d="M0 30H600 M0 75H600 M0 120H600"/><polyline v-if="chartLine('temperature', -10, 50)" :points="chartLine('temperature', -10, 50)" class="line-blue"/><text x="4" y="18">50°</text><text x="4" y="145">−10°</text></svg>
        <div class="chart-footer"><span>{{ history.length }} readings</span><span>Oldest → newest</span></div>
      </article>
      <article class="panel chart-panel"><div class="panel-title"><div><span class="chart-dot violet-bg"></span><b>Relative humidity</b></div><span class="muted">% RH</span></div>
        <svg viewBox="0 0 600 150" role="img" aria-label="Humidity history chart"><path class="gridline" d="M0 30H600 M0 75H600 M0 120H600"/><polyline v-if="chartLine('humidity', 0, 100)" :points="chartLine('humidity', 0, 100)" class="line-violet"/><text x="4" y="18">100%</text><text x="4" y="145">0%</text></svg>
        <div class="chart-footer"><span>{{ history.length }} readings</span><span>Oldest → newest</span></div>
      </article>
      <article class="panel chart-panel"><div class="panel-title"><div><span class="chart-dot amber-bg"></span><b>Light exposure</b></div><span class="muted">%</span></div>
        <svg viewBox="0 0 600 150" role="img" aria-label="Light exposure history chart"><path class="gridline" d="M0 30H600 M0 75H600 M0 120H600"/><polyline v-if="chartLine('light_percentage', 0, 100)" :points="chartLine('light_percentage', 0, 100)" class="line-amber"/><text x="4" y="18">100%</text><text x="4" y="145">0%</text></svg>
        <div class="chart-footer"><span>{{ history.length }} readings</span><span>Oldest → newest</span></div>
      </article>
    </section>

    <section class="section-heading">
      <div><span class="section-index">03</span><h2>Environmental alerts</h2></div>
      <span class="alert-count" :class="activeAlerts.length ? 'has-alerts' : ''">{{ activeAlerts.length }} active</span>
    </section>
    <section class="panel alerts-panel">
      <div v-if="!activeAlerts.length" class="empty-state"><span class="empty-check">✓</span><div><b>No active alerts</b><p>Conditions are within configured limits or no readings have arrived yet.</p></div></div>
      <div v-for="alert in activeAlerts" :key="alert.alert_id" class="alert-row">
        <span class="severity-mark" :class="alert.severity"></span>
        <div class="alert-copy"><div><span class="status-chip" :class="statusClass(alert.severity)">{{ alert.severity }}</span><b>{{ alert.alert_type.replaceAll('_', ' ') }}</b></div><p>{{ alert.description }}</p><small>{{ dateTime(alert.timestamp) }} · {{ alert.device_id }}</small></div>
        <button class="button subtle" :disabled="alert.acknowledged" @click="acknowledge(alert)">{{ alert.acknowledged ? 'Acknowledged' : 'Acknowledge' }}</button>
      </div>
      <details class="history-details"><summary>Alert history · {{ alertHistory.length }} records</summary>
        <div v-if="!alertHistory.length" class="muted history-empty">No recovered or historical alerts yet.</div>
        <div v-for="alert in alertHistory" :key="alert.alert_id" class="history-row"><span class="history-severity" :class="statusClass(alert.severity)">{{ alert.severity }}</span><span>{{ alert.description }}</span><time>{{ dateTime(alert.timestamp) }}</time></div>
      </details>
    </section>

    <section class="section-heading">
      <div><span class="section-index">04</span><h2>Inspection management</h2></div>
      <span class="muted">Request a documented storage inspection</span>
    </section>
    <section class="inspection-grid">
      <article class="panel inspection-form"><label for="inspection-notes">INSPECTION NOTES <span class="muted">optional · up to 1000 characters</span></label>
        <textarea id="inspection-notes" v-model="inspectionNotes" maxlength="1000" placeholder="Reason, location, or observations for the inspection…"></textarea>
        <div class="form-footer"><span class="form-message" :class="formError ? 'text-danger' : 'text-safe'">{{ formMessage }}</span><button class="button primary" :disabled="submitting || !apiOk" @click="requestInspection">{{ submitting ? 'Submitting…' : 'Request inspection' }}</button></div>
      </article>
      <article class="panel inspection-list"><div class="panel-title"><b>Recent inspections</b><span class="muted">{{ inspections.length }} records</span></div>
        <div v-if="!inspections.length" class="muted history-empty">No inspection requests recorded.</div>
        <div v-for="inspection in inspections.slice(0, 6)" :key="inspection.inspection_id" class="inspection-row"><span class="inspection-icon">◎</span><div><b>{{ inspection.status.replaceAll('_', ' ') }}</b><p>{{ inspection.notes || 'No notes supplied' }}</p><small>{{ inspection.device_id }} · {{ dateTime(inspection.timestamp) }}</small></div></div>
      </article>
    </section>

    <footer class="footnote">Prototype demonstration limits only · Follow the specific medicine manufacturer’s labeling and applicable regulations.</footer>
  </main>
</template>

<script>
export default {
  data() {
    return {
      latest: null, health: null, history: [], activeAlerts: [], alertHistory: [], inspections: [],
      apiOk: false, range: '24h', timer: null, inspectionNotes: '', submitting: false,
      formMessage: '', formError: false, configuredDevice: ''
    }
  },
  computed: {
    score() { return this.latest?.medicine_storage_score || null },
    limits() {
      const value = this.health?.limits
      return value ? { temp: `${value.temperature_c[0]}–${value.temperature_c[1]} °C`, humidity: `${value.humidity_percent[0]}–${value.humidity_percent[1]}%`, light: `≤ ${value.light_max_percent}%` }
        : { temp: '—', humidity: '—', light: '—' }
    },
    scoreGradient() {
      const value = Number(this.score?.overall_score)
      const degrees = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) * 3.6 : 0
      return `conic-gradient(#52d6ad ${degrees}deg, #263748 ${degrees}deg)`
    }
  },
  watch: {
    range() { this.refresh() }
  },
  methods: {
    async getJson(url) {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`)
      return body
    },
    async refresh() {
      try {
        const [latestResult, healthResult] = await Promise.all([this.getJson('/api/latest'), this.getJson('/api/health')])
        this.latest = latestResult.data
        this.health = healthResult
        this.configuredDevice = healthResult.device_id || ''
        const query = new URLSearchParams({ limit: '120' })
        const chartDevice = this.latest?.device_id || this.configuredDevice
        if (chartDevice) query.set('device_id', chartDevice)
        const duration = this.range === '1h' ? 3600000 : this.range === '7d' ? 604800000 : 86400000
        query.set('start', new Date(Date.now() - duration).toISOString())
        const results = await Promise.all([
          this.getJson(`/api/history?${query}`),
          this.getJson('/api/alerts?active=true&limit=50'), this.getJson('/api/alerts?active=false&limit=25'),
          this.getJson('/api/inspections?limit=10')
        ])
        this.history = [...(results[0].data || [])].reverse()
        this.activeAlerts = results[1].data || []
        this.alertHistory = results[2].data || []
        this.inspections = results[3].data || []
        this.apiOk = healthResult.ok === true
      } catch (error) {
        this.apiOk = false
        this.formMessage = error.message
        this.formError = true
      }
    },
    fmt(value, digits = 1) {
      return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits)
    },
    gauge(value, min, max) {
      if (value === null || value === undefined || value === '') return 0
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return 0
      return Math.max(0, Math.min(100, ((numeric - min) / (max - min)) * 100))
    },
    statusClass(value) {
      const status = String(value || '').toLowerCase()
      if (['excellent', 'good', 'info', 'online'].includes(status)) return 'safe'
      if (['warning'].includes(status)) return 'warning'
      if (['critical', 'offline', 'danger'].includes(status)) return 'danger'
      return 'neutral'
    },
    dateTime(value) {
      if (!value) return 'Waiting for first reading'
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
    },
    chartLine(field, min, max) {
      const points = this.history.filter(item => Number.isFinite(Number(item[field])))
      if (!points.length) return ''
      const width = 600, height = 150, inset = 14
      return points.map((item, index) => {
        const x = points.length < 2 ? width / 2 : inset + index * (width - inset * 2) / (points.length - 1)
        const ratio = Math.max(0, Math.min(1, (Number(item[field]) - min) / (max - min)))
        const y = height - inset - ratio * (height - inset * 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    },
    async requestInspection() {
      this.submitting = true
      this.formMessage = ''
      try {
        const response = await fetch('/api/inspection', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: this.latest?.device_id || this.configuredDevice, notes: this.inspectionNotes }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error?.message || 'Inspection request failed.')
        this.inspectionNotes = ''
        this.formMessage = 'Inspection request recorded.'
        this.formError = false
        await this.refresh()
      } catch (error) {
        this.formMessage = error.message
        this.formError = true
      } finally { this.submitting = false }
    },
    async acknowledge(alert) {
      try {
        const response = await fetch(`/api/alerts/${encodeURIComponent(alert.alert_id)}/acknowledge`, { method: 'PATCH' })
        if (!response.ok) throw new Error('Unable to acknowledge alert.')
        await this.refresh()
      } catch (error) { this.formMessage = error.message; this.formError = true }
    }
  },
  mounted() {
    this.refresh()
    this.timer = window.setInterval(() => this.refresh(), 5000)
  },
  unmounted() { window.clearInterval(this.timer) }
}
</script>

<style>
.pharma-shell{--bg:#0b1118;--panel:#111b25;--line:#243444;--text:#e7edf4;--muted:#8fa0b1;--green:#52d6ad;max-width:1500px;margin:0 auto;padding:22px 26px 30px;color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);min-height:100vh;box-sizing:border-box}
.pharma-shell *{box-sizing:border-box}.topbar{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding:8px 2px 22px;margin-bottom:24px}.eyebrow,.mini-label,.range-select,.inspection-form label{font-size:10px;font-weight:800;letter-spacing:.12em;color:#8093a5}.topbar h1{font-size:25px;letter-spacing:-.035em;margin:7px 0 4px;font-weight:700}.topbar p{margin:0}.muted{color:var(--muted);font-size:12px}.connect-pill{display:flex;align-items:center;gap:9px;border:1px solid var(--line);border-radius:999px;padding:9px 13px;font-size:10px;letter-spacing:.08em;font-weight:800}.connected{color:var(--green)}.disconnected{color:#ff7378}.pulse-dot{width:7px;height:7px;border-radius:100%;background:currentColor;box-shadow:0 0 10px currentColor}.section-heading{display:flex;justify-content:space-between;align-items:center;margin:23px 0 13px}.section-heading>div{display:flex;align-items:center;gap:10px}.section-index{color:#52d6ad;font:700 11px ui-monospace,monospace}.section-heading h2{font-size:15px;margin:0;font-weight:650;letter-spacing:-.01em}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric-card,.panel{background:linear-gradient(150deg,#131e29,#101923);border:1px solid #223241;border-radius:13px}.metric-card{min-height:174px;padding:17px 17px 14px}.metric-label{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.09em;font-weight:800;color:#9aaaba}.metric-icon{width:23px;height:23px;display:grid;place-items:center;border-radius:7px;font-weight:800}.blue{color:#54a5ff;background:#18334d}.violet{color:#b89cff;background:#302449}.amber{color:#ffbd58;background:#41321c}.green{color:#52d6ad;background:#18392f}.metric-value{font-size:34px;letter-spacing:-.06em;font-weight:700;margin:16px 0 10px}.metric-value small{font-size:12px;letter-spacing:0;color:#8fa0b1;margin-left:5px;font-weight:600}.meter{height:4px;background:#253442;border-radius:9px;overflow:hidden}.meter i{height:100%;display:block;border-radius:9px;transition:width .3s}.metric-foot{display:flex;justify-content:space-between;align-items:center;color:#8fa0b1;font-size:10px;margin-top:11px}.metric-foot b{color:#dbe5ef;font-size:11px;font-weight:600}.sub-reading{font-size:10px;color:#778b9e;margin-top:7px}.score-card{grid-column:span 1}.score-row{display:flex;align-items:center;gap:13px;margin:12px 0 6px}.score-ring{height:61px;width:61px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}.score-ring>div{height:49px;width:49px;border-radius:50%;background:#111b25;display:flex;align-items:center;justify-content:center;flex-direction:column}.score-ring strong{font-size:15px;line-height:16px}.score-ring small{font-size:8px;color:var(--muted)}.status-chip{display:inline-flex;align-items:center;text-transform:uppercase;letter-spacing:.07em;font-size:9px;font-weight:800;padding:5px 8px;border-radius:999px;border:1px solid transparent}.safe{color:#5de0b5;background:#16382f;border-color:#245447}.warning{color:#ffca71;background:#40331d;border-color:#5b4724}.danger{color:#ff8186;background:#431f27;border-color:#612c35}.neutral{color:#a9bac9;background:#263441;border-color:#354859}.score-caption{margin:6px 0 0;font-size:10px}.status-strip{display:flex;flex-wrap:wrap;gap:0;margin-top:12px;border:1px solid var(--line);border-radius:11px;background:#0f1821}.status-item{flex:1 1 150px;display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:13px 16px;border-right:1px solid var(--line)}.status-item:last-child{border-right:0}.status-item>b{font-size:11px}.analytics-heading{margin-top:29px}.range-select{display:flex;align-items:center;gap:10px}.range-select select{background:#111b25;color:#dce6ef;border:1px solid #293c4c;border-radius:7px;padding:7px 10px;font-size:11px}.chart-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.panel{padding:16px}.chart-panel svg{width:100%;height:140px;margin-top:14px;overflow:visible}.chart-panel svg text{font-size:9px;fill:#7e91a3}.gridline{fill:none;stroke:#263644;stroke-width:1;stroke-dasharray:4 5}.chart-panel polyline{fill:none;stroke-width:2.7;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.line-blue{stroke:#54a5ff}.line-violet{stroke:#b89cff}.line-amber{stroke:#ffbd58}.panel-title{display:flex;align-items:center;justify-content:space-between;font-size:12px}.panel-title>div{display:flex;align-items:center;gap:9px}.chart-dot{height:8px;width:8px;border-radius:50%}.blue-bg{background:#54a5ff}.violet-bg{background:#b89cff}.amber-bg{background:#ffbd58}.chart-footer{display:flex;justify-content:space-between;color:#8295a7;font-size:10px}.alert-count{font-size:10px;color:#89a0b1;border:1px solid var(--line);border-radius:999px;padding:6px 10px}.has-alerts{color:#ff8186;background:#431f27;border-color:#612c35}.alerts-panel{padding:0 16px}.empty-state{display:flex;align-items:center;gap:13px;padding:21px 4px}.empty-check{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:#5de0b5;background:#16382f;font-size:16px}.empty-state b{font-size:12px}.empty-state p{font-size:11px;color:#8fa0b1;margin:4px 0 0}.alert-row{display:flex;align-items:center;gap:13px;padding:15px 3px;border-bottom:1px solid var(--line)}.severity-mark{width:8px;height:8px;border-radius:50%;flex-shrink:0}.severity-mark.critical{background:#ff636d;box-shadow:0 0 12px #ff636d}.severity-mark.warning{background:#f4b84d;box-shadow:0 0 9px #f4b84d}.severity-mark.info{background:#54a5ff}.alert-copy{flex:1}.alert-copy>div{display:flex;align-items:center;gap:8px}.alert-copy b{font-size:11px;text-transform:capitalize}.alert-copy p{font-size:11px;color:#c0cbd5;margin:7px 0 4px}.alert-copy small,.inspection-row small{font-size:9px;color:#7e91a3}.button{border:1px solid transparent;border-radius:7px;padding:9px 12px;font-size:10px;font-weight:750;cursor:pointer;white-space:nowrap}.button:disabled{opacity:.5;cursor:not-allowed}.button.subtle{color:#a8bac9;background:#1b2935;border-color:#2e4151}.button.primary{background:#39b895;color:#062219}.history-details{border-top:1px solid var(--line);padding:13px 2px}.history-details summary{cursor:pointer;font-size:10px;color:#9eafbd}.history-empty{padding:13px 0}.history-row{display:grid;grid-template-columns:68px minmax(0,1fr) 165px;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #1e2c38;font-size:10px;color:#c0cbd5}.history-row time{text-align:right;color:#7e91a3;font-size:9px}.history-severity{font-size:8px;text-transform:uppercase;font-weight:800}.inspection-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.inspection-form label{display:flex;justify-content:space-between;align-items:center}.inspection-form textarea{display:block;width:100%;min-height:95px;resize:vertical;margin:12px 0;background:#0c141c;color:#e7edf4;border:1px solid #293b4b;border-radius:8px;padding:11px;font-family:inherit;font-size:12px;outline:none}.inspection-form textarea:focus{border-color:#39b895}.form-footer{display:flex;justify-content:space-between;align-items:center;gap:10px}.form-message{font-size:10px}.inspection-list{max-height:270px;overflow:auto}.inspection-row{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}.inspection-icon{height:23px;width:23px;border-radius:7px;background:#193447;color:#66bfff;display:grid;place-items:center}.inspection-row b{font-size:11px;text-transform:capitalize}.inspection-row p{margin:4px 0;font-size:10px;color:#96a8b7}.footnote{border-top:1px solid var(--line);margin-top:24px;padding-top:14px;text-align:center;font-size:9px;color:#768a9c}.text-safe{color:#5de0b5}.text-danger{color:#ff8186}
@media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.chart-grid{grid-template-columns:1fr}.chart-panel svg{height:160px}}
@media(max-width:620px){.pharma-shell{padding:16px 12px 24px}.topbar{align-items:flex-start;gap:12px}.topbar h1{font-size:19px}.connect-pill{font-size:8px;padding:8px}.metric-grid{grid-template-columns:1fr}.metric-card{min-height:155px}.section-heading{align-items:flex-start;gap:9px}.section-heading>.muted{font-size:9px;text-align:right}.status-item{flex:1 1 50%;border-bottom:1px solid var(--line)}.status-item:nth-child(2n){border-right:0}.status-item:last-child{border-bottom:0}.inspection-grid{grid-template-columns:1fr}.history-row{grid-template-columns:58px minmax(0,1fr);}.history-row time{grid-column:2;text-align:left}.alert-row{align-items:flex-start;flex-wrap:wrap}.alert-copy{min-width:calc(100% - 30px)}.alert-row .button{margin-left:21px}.form-footer{align-items:flex-start;flex-direction:column}}
</style>
