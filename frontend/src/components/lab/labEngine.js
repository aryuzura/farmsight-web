// Mesin hitung Laboratorium Prediksi. Murni (tanpa React) agar mudah dites.
//
// Catatan metode:
// - Prediksi tengah berasal dari forecast_kedepan.csv (model terbaik per produk, 4 minggu).
// - Minggu setelah horizon model diperpanjang dengan level rata-rata prediksi model.
// - Interval keyakinan: tengah +/- z * sigma, sigma = sigma_dipakai (residual test) dari
//   safety_stock_rop.csv. Di luar horizon model, sigma dilebarkan 10% per minggu.
// - Antarproduk dianggap independen (varians dijumlahkan).

export const MODEL_WEEKS_FALLBACK = 4;
export const WIDEN_PER_WEEK = 0.1;
export const SERVICE_Z = 1.645; // service level 95%, sama dengan pipeline safety stock.

// ---------- Statistik ----------

// Invers CDF normal (aproksimasi Acklam).
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q;
  let r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Interval dua sisi: confidence 90 (%) -> z = 1.645.
export const zFromConfidence = (confPct) => normInv(0.5 + confPct / 200);

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- Persiapan data ----------

// Gabungkan master produk dengan forecast per produk.
export function prepareProducts(produk = [], forecast = [], riwayat = []) {
  const fcBy = new Map();
  forecast.forEach((r) => {
    if (!fcBy.has(r.kode_produk)) fcBy.set(r.kode_produk, []);
    fcBy.get(r.kode_produk).push({ week: r.minggu_mulai, mean: Math.max(0, num(r.prediksi)) });
  });
  fcBy.forEach((rows) => rows.sort((a, b) => (a.week < b.week ? -1 : 1)));

  const histBy = new Map();
  riwayat.forEach((r) => {
    if (!histBy.has(r.kode_produk)) histBy.set(r.kode_produk, []);
    histBy.get(r.kode_produk).push(num(r.demand));
  });

  return produk.map((p) => {
    const fc = fcBy.get(p.kode_produk) ?? [];
    const hist = histBy.get(p.kode_produk) ?? [];
    const histMean = hist.length ? sum(hist) / hist.length : 0;
    const histSd = hist.length > 1
      ? Math.sqrt(sum(hist.map((x) => (x - histMean) ** 2)) / (hist.length - 1))
      : 0;
    const sigma = num(p.sigma_dipakai, NaN);
    const rmse = num(p.rmse, NaN);
    const sigmaUsed = Number.isFinite(sigma) ? sigma : Number.isFinite(rmse) ? rmse : histSd;
    const last52 = hist.slice(-52);
    return {
      kode: p.kode_produk,
      nama: p.nama_produk ?? p.kode_produk,
      kategori: p.kategori ?? '-',
      status: p.status_produk ?? '-',
      satuan: p.satuan_produk ?? 'unit',
      harga: num(p.harga_satuan),
      model: p.model_terbaik ?? null,
      keandalan: p.keandalan ?? null,
      catatan: p.catatan_keandalan ?? null,
      rataMinggu: num(p.d_rata_minggu, histMean),
      sigma: sigmaUsed,
      leadTime: num(p.lead_time_minggu, 1 / 7),
      safetyStock: num(p.safety_stock),
      rop: num(p.reorder_point),
      fc,
      terprediksi: fc.length > 0,
      histMean,
      histRecent: last52.length ? sum(last52) / last52.length : 0,
    };
  });
}

// Uplift permintaan pada minggu bazaar vs non-bazaar (data historis).
export function bazaarUplift(riwayat = []) {
  const acc = new Map();
  const add = (key, bz, y) => {
    if (!acc.has(key)) acc.set(key, { b: [0, 0], n: [0, 0] });
    const o = acc.get(key)[bz ? 'b' : 'n'];
    o[0] += y;
    o[1] += 1;
  };
  riwayat.forEach((r) => {
    const bz = num(r.ada_bazaar) > 0;
    add('*', bz, num(r.demand));
    add(r.kode_produk, bz, num(r.demand));
  });
  const calc = (o) => {
    if (!o || o.b[1] < 5 || o.n[1] < 5) return null;
    const mb = o.b[0] / o.b[1];
    const mn = o.n[0] / o.n[1];
    if (mn <= 0) return null;
    return Math.min(3, Math.max(0, mb / mn - 1));
  };
  const global = calc(acc.get('*')) ?? 0;
  return { global };
}

// ---------- Prediksi ----------

// Rangkaian prediksi satu produk (mean + sigma per minggu) sepanjang horizon.
export function productForecastSeries(prod, horizon) {
  const base = prod.fc;
  if (!base.length) return [];
  const nModel = base.length;
  const level = sum(base.map((r) => r.mean)) / nModel;
  const lastWeek = base[nModel - 1].week;
  const out = [];
  for (let h = 1; h <= horizon; h += 1) {
    const extrap = h > nModel;
    const widen = 1 + WIDEN_PER_WEEK * Math.max(0, h - nModel);
    out.push({
      h,
      week: extrap ? addDays(lastWeek, 7 * (h - nModel)) : base[h - 1].week,
      mean: extrap ? level : base[h - 1].mean,
      sigma: prod.sigma * widen,
      extrap,
    });
  }
  return out;
}

// Prediksi agregat banyak produk. target: 'demand' | 'pendapatan'
export function buildForecast(products, horizon, confPct, target = 'demand') {
  const z = zFromConfidence(confPct);
  const series = products.map((p) => ({ p, s: productForecastSeries(p, horizon) }));
  const weeks = [];
  for (let h = 1; h <= horizon; h += 1) {
    let mean = 0;
    let varSum = 0;
    let week = null;
    let extrap = false;
    series.forEach(({ p, s }) => {
      const row = s[h - 1];
      if (!row) return;
      const k = target === 'pendapatan' ? p.harga : 1;
      mean += row.mean * k;
      varSum += (row.sigma * k) ** 2;
      week = row.week;
      extrap = row.extrap;
    });
    const hw = z * Math.sqrt(varSum);
    weeks.push({ h, week, mean, lower: Math.max(0, mean - hw), upper: mean + hw, extrap });
  }

  const perProduct = series.map(({ p, s }) => {
    const k = target === 'pendapatan' ? p.harga : 1;
    const total = sum(s.map((r) => r.mean)) * k;
    const hw = z * Math.sqrt(sum(s.map((r) => r.sigma ** 2))) * k;
    return { kode: p.kode, nama: p.nama, model: p.model, keandalan: p.keandalan, total, lower: Math.max(0, total - hw), upper: total + hw };
  });

  const total = sum(weeks.map((w) => w.mean));
  const hwTotal = z * Math.sqrt(sum(series.map(({ p, s }) => {
    const k = target === 'pendapatan' ? p.harga : 1;
    return sum(s.map((r) => (r.sigma * k) ** 2));
  })));
  return {
    z,
    weeks,
    perProduct,
    total: { mean: total, lower: Math.max(0, total - hwTotal), upper: total + hwTotal },
  };
}

// ---------- Simulasi what-if ----------

export const DEFAULT_PARAMS = {
  demandPct: 0,        // lonjakan/penurunan permintaan eksternal (%)
  pricePct: 0,         // keputusan: ubah harga (%)
  elasticity: 1,       // sensitivitas permintaan terhadap harga
  bazaarWeeks: 0,      // keputusan: tambahan minggu bazaar
  bazaarUpliftPct: 0,  // diisi dari data historis
  ssBoostPct: 0,       // keputusan: tambah safety stock (%)
  startStockPct: 100,  // stok awal terhadap level target (%)
  ltMult: 1,           // gangguan: pengali lead time
  delayDays: 0,        // gangguan: keterlambatan pasokan tambahan (hari)
  supplyCutPct: 0,     // gangguan: pasokan yang tidak terkirim (%)
};

function bazaarWeekSet(n, horizon) {
  const set = new Set();
  const k = Math.min(Math.max(0, Math.round(n)), horizon);
  for (let i = 0; i < k; i += 1) set.add(Math.floor(((i + 0.5) * horizon) / k) + 1);
  return set;
}

// Simulasi stok satu produk. demandSeries & price & kebijakan stok dari opsi.
function runInventory({ demand, target, startStock, leadWeeks, supplyFactor, price }) {
  const H = demand.length;
  const arrivals = new Array(H + 2).fill(0);
  let stock = startStock;
  const rows = [];
  for (let t = 0; t < H; t += 1) {
    // Posisi persediaan = stok + pipeline yang belum tiba.
    let pipeline = 0;
    for (let k = t; k < arrivals.length; k += 1) pipeline += arrivals[k];
    const order = Math.max(0, target - (stock + pipeline)) * supplyFactor;
    const whole = Math.floor(leadWeeks);
    const frac = leadWeeks - whole;
    if (t + whole < arrivals.length) arrivals[t + whole] += order * (1 - frac);
    if (t + whole + 1 < arrivals.length) arrivals[t + whole + 1] += order * frac;

    stock += arrivals[t];
    const sold = Math.min(demand[t], stock);
    stock -= sold;
    rows.push({ demand: demand[t], sold, unmet: demand[t] - sold, stock, revenue: sold * price, lostRev: (demand[t] - sold) * price });
  }
  return rows;
}

function scenarioForProduct(p, horizon, params, bzUplift, isScenario) {
  const series = productForecastSeries(p, horizon);
  const prm = isScenario ? params : DEFAULT_PARAMS;
  const demandMult = (1 + prm.demandPct / 100) * Math.pow(Math.max(0.01, 1 + prm.pricePct / 100), -prm.elasticity);
  const bz = bazaarWeekSet(isScenario ? prm.bazaarWeeks : 0, horizon);
  const bzFactor = 1 + (isScenario ? bzUplift : 0);
  const price = p.harga * (1 + prm.pricePct / 100);

  const demand = series.map((s) => s.mean * demandMult * (bz.has(s.h) ? bzFactor : 1));

  const leadWeeks = p.leadTime * prm.ltMult + prm.delayDays / 7;
  const ssBase = SERVICE_Z * p.sigma * Math.sqrt(Math.max(p.leadTime, 0.01));
  const ssNew = SERVICE_Z * p.sigma * demandMult * Math.sqrt(Math.max(leadWeeks, 0.01)) * (1 + prm.ssBoostPct / 100);
  const dBar = p.rataMinggu * demandMult;
  const ropNew = dBar * leadWeeks + ssNew;

  // Kebijakan stok: order-up-to = ROP dasar + SS tambahan + permintaan rata-rata 1 minggu.
  const target = p.rop + ssBase * (prm.ssBoostPct / 100) + p.rataMinggu;
  const rows = runInventory({
    demand,
    target,
    startStock: target * (prm.startStockPct / 100),
    leadWeeks,
    supplyFactor: 1 - prm.supplyCutPct / 100,
    price,
  });
  return {
    kode: p.kode,
    nama: p.nama,
    rows: rows.map((r, i) => ({ ...r, week: series[i].week })),
    safetyStock: ssNew,
    rop: ropNew,
    leadWeeks,
    price,
  };
}

function summarize(perProduct, horizon) {
  const weeks = [];
  for (let i = 0; i < horizon; i += 1) {
    const rows = perProduct.map((pp) => pp.rows[i]).filter(Boolean);
    weeks.push({
      week: rows[0]?.week ?? null,
      demand: sum(rows.map((r) => r.demand)),
      sold: sum(rows.map((r) => r.sold)),
      unmet: sum(rows.map((r) => r.unmet)),
      stock: sum(rows.map((r) => r.stock)),
      revenue: sum(rows.map((r) => r.revenue)),
      lostRev: sum(rows.map((r) => r.lostRev)),
    });
  }
  const demand = sum(weeks.map((w) => w.demand));
  const sold = sum(weeks.map((w) => w.sold));
  const revenue = sum(weeks.map((w) => w.revenue));
  const lostRevenue = sum(weeks.map((w) => w.lostRev));
  const stockoutProducts = perProduct.filter((pp) => pp.rows.some((r) => r.unmet > 0.25)).length;
  const stockoutWeeks = weeks.filter((w) => w.unmet > 0.25).length;
  const avgStock = weeks.length ? sum(weeks.map((w) => w.stock)) / weeks.length : 0;
  return {
    weeks,
    demand,
    sold,
    unmet: demand - sold,
    revenue,
    lostRevenue,
    fillRate: demand > 0 ? sold / demand : 1,
    stockoutProducts,
    stockoutWeeks,
    avgStock,
    endStock: weeks.length ? weeks[weeks.length - 1].stock : 0,
    safetyStock: sum(perProduct.map((pp) => pp.safetyStock)),
    rop: sum(perProduct.map((pp) => pp.rop)),
    perProduct: perProduct.map((pp) => {
      const d = sum(pp.rows.map((r) => r.demand));
      const s = sum(pp.rows.map((r) => r.sold));
      return {
        kode: pp.kode,
        nama: pp.nama,
        demand: d,
        sold: s,
        revenue: sum(pp.rows.map((r) => r.revenue)),
        fillRate: d > 0 ? s / d : 1,
        safetyStock: pp.safetyStock,
        rop: pp.rop,
      };
    }),
  };
}

export function simulate(products, horizon, params, bzUplift) {
  const normal = summarize(products.map((p) => scenarioForProduct(p, horizon, params, bzUplift, false)), horizon);
  const scenario = summarize(products.map((p) => scenarioForProduct(p, horizon, params, bzUplift, true)), horizon);
  return { normal, scenario };
}

// ---------- Eksplorasi historis ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const DIMENSIONS = [
  { id: 'produk', label: 'Produk', avg: false },
  { id: 'kategori', label: 'Kategori', avg: false },
  { id: 'status', label: 'Status produk', avg: false },
  { id: 'bulan', label: 'Bulan (musiman)', avg: true },
  { id: 'kuartal', label: 'Kuartal', avg: true },
  { id: 'bazaar', label: 'Bazaar vs non-bazaar', avg: true },
];

export const METRICS = [
  { id: 'demand', label: 'Demand (unit)' },
  { id: 'pendapatan', label: 'Pendapatan (Rp)' },
  { id: 'n_transaksi', label: 'Transaksi' },
];

function weekMetric(r, metric) {
  return num(r[metric]);
}

export function exploreHistory(riwayat, produkMap, { metric, dimension, kategori, status, periodWeeks }) {
  let rows = riwayat
    .map((r) => ({ ...r, p: produkMap.get(r.kode_produk) }))
    .filter((r) => r.p);
  if (kategori !== 'semua') rows = rows.filter((r) => r.p.kategori === kategori);
  if (status !== 'semua') rows = rows.filter((r) => String(r.p.status).startsWith(status));

  if (periodWeeks) {
    const maxW = rows.reduce((m, r) => (r.minggu_mulai > m ? r.minggu_mulai : m), '');
    if (maxW) {
      const cutoff = addDays(maxW, -7 * periodWeeks);
      rows = rows.filter((r) => r.minggu_mulai > cutoff);
    }
  }

  // Tren mingguan (total semua produk terfilter).
  const byWeek = new Map();
  rows.forEach((r) => byWeek.set(r.minggu_mulai, (byWeek.get(r.minggu_mulai) ?? 0) + weekMetric(r, metric)));
  const trend = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, value]) => ({ week, value }));
  trend.forEach((t, i) => {
    const win = trend.slice(Math.max(0, i - 3), i + 1);
    t.ma = sum(win.map((x) => x.value)) / win.length;
  });

  const byMonth = new Map();
  trend.forEach((t) => {
    const key = t.week.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + t.value);
  });
  const trendMonthly = [...byMonth.entries()].map(([week, value]) => ({ week, value, ma: null }));

  // Dimensi.
  const dim = DIMENSIONS.find((d) => d.id === dimension) ?? DIMENSIONS[0];
  const groups = new Map();
  const weekSets = new Map();
  rows.forEach((r) => {
    let key;
    let order = 0;
    if (dimension === 'produk') key = r.p.nama;
    else if (dimension === 'kategori') key = r.p.kategori;
    else if (dimension === 'status') key = String(r.p.status).startsWith('aktif') ? 'Aktif' : 'Tidak aktif';
    else if (dimension === 'bulan') {
      const m = Number(r.minggu_mulai.slice(5, 7)) - 1;
      key = MONTHS[m];
      order = m;
    } else if (dimension === 'kuartal') {
      const q = Math.floor((Number(r.minggu_mulai.slice(5, 7)) - 1) / 3) + 1;
      key = `Q${q}`;
      order = q;
    } else {
      key = num(r.ada_bazaar) > 0 ? 'Minggu bazaar' : 'Minggu biasa';
      order = num(r.ada_bazaar) > 0 ? 1 : 0;
    }
    const g = groups.get(key) ?? { name: key, value: 0, order };
    g.value += weekMetric(r, metric);
    groups.set(key, g);
    if (!weekSets.has(key)) weekSets.set(key, new Set());
    weekSets.get(key).add(r.minggu_mulai);
  });
  let breakdown = [...groups.values()].map((g) => ({
    ...g,
    value: dim.avg ? g.value / Math.max(1, weekSets.get(g.name).size) : g.value,
  }));
  if (['bulan', 'kuartal', 'bazaar'].includes(dimension)) breakdown.sort((a, b) => a.order - b.order);
  else breakdown.sort((a, b) => b.value - a.value);
  const totalBreak = sum(breakdown.map((b) => b.value));
  breakdown = breakdown.map((b) => ({ ...b, share: totalBreak > 0 ? b.value / totalBreak : 0 }));

  const total = sum(trend.map((t) => t.value));
  const peak = trend.reduce((m, t) => (t.value > (m?.value ?? -1) ? t : m), null);
  const last = trend.slice(-13);
  const prev = trend.slice(-26, -13);
  const lastSum = sum(last.map((t) => t.value));
  const prevSum = sum(prev.map((t) => t.value));
  return {
    trend,
    trendMonthly,
    breakdown,
    avgBreakdown: dim.avg,
    total,
    avgWeek: trend.length ? total / trend.length : 0,
    peak,
    growth: prev.length >= 13 && prevSum > 0 ? lastSum / prevSum - 1 : null,
    nProduk: new Set(rows.map((r) => r.kode_produk)).size,
  };
}
