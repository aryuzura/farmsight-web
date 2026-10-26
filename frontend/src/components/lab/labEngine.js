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

const groupBy = (rows, keyFn) => {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return m;
};

// Versi hasil tuning -> nama varian di validasi_event_test.csv.
const VARIAN_BY_VERSI = { event: 'croston_sadar_event', buta: 'croston_buta_event' };

// Gabungkan master produk dengan forecast per produk (+ data skenario bazar bila ada).
export function prepareProducts(produk = [], forecast = [], riwayat = [], skenario = null) {
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

  // Data skenario bazar (opsional).
  const bzBy = new Map((skenario?.bazar ?? []).map((r) => [r.kode_produk, r]));
  const ssBy = new Map((skenario?.ss_rop ?? []).map((r) => [r.kode_produk, r]));
  const tunBy = new Map((skenario?.versi_event ?? []).map((r) => [r.kode_produk, r]));
  const valBy = groupBy(skenario?.validasi ?? [], (r) => r.kode_produk);
  // Total prediksi skenario: rasio bazar/normal = pengali permintaan untuk mode pipeline.
  const scenSum = new Map();
  (skenario?.forecast ?? []).forEach((r) => {
    const e = scenSum.get(r.kode_produk) ?? { normal: 0, bazar: 0 };
    if (r.skenario === 'normal_tanpa_event') e.normal += num(r.prediksi);
    else if (r.skenario === 'asumsi_bazar_posisi_tak_pasti') e.bazar += num(r.prediksi);
    scenSum.set(r.kode_produk, e);
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

    let bz = null;
    const b = bzBy.get(p.kode_produk);
    if (b) {
      const s = ssBy.get(p.kode_produk);
      const t = tunBy.get(p.kode_produk);
      const sc = scenSum.get(p.kode_produk);
      const varian = t ? VARIAN_BY_VERSI[t.versi_dipilih] : null;
      const v = varian ? (valBy.get(p.kode_produk) ?? []).find((x) => x.varian === varian) : null;
      bz = {
        rasio: Math.max(0, num(b.rasio_event, 1)),
        bukti: b.bukti_event ?? '-',
        versi: t?.versi_dipilih ?? b.versi_event ?? null,
        hanyaSaatEvent: num(b.hanya_terjual_saat_event) > 0,
        nMingguEvent: num(b.n_minggu_event),
        nEventTerjual: num(b.n_event_terjual),
        dNormal: num(b.d_normal_minggu),
        dEvent: num(b.d_event_minggu),
        kebutuhanNormal: num(b.kebutuhan_4mgg_normal),
        kebutuhanBazar: num(b.kebutuhan_4mgg_dengan_bazar),
        tambahan: num(b.tambahan_unit_bazar),
        sigmaEvent: num(s?.sigma_event),
        ssEvent: s ? num(s.safety_stock_event) : null,
        ropEvent: s ? num(s.reorder_point_event) : null,
        ssBaseline: s ? num(s.ss_baseline_tanpa_event) : null,
        ropBaseline: s ? num(s.rop_baseline_tanpa_event) : null,
        pipelineRatio: sc && sc.normal > 0 ? sc.bazar / sc.normal : 1,
        validasi: v
          ? {
            varian,
            aktual: num(v.aktual_event_total),
            prediksi: num(v.prediksi_event_total),
            mae: num(v.mae_event),
            bias: num(v.bias_event),
          }
          : null,
      };
    }

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
      bz,
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

// ---------- Jadwal bazar/mini bazar pada prediksi ----------

// Frekuensi minggu event (bazaar atau mini bazaar digabung) dari riwayat. Flag event berlaku
// untuk seluruh toko pada minggu itu, jadi cukup satu nilai per minggu.
export function eventShare(riwayat = [], lastN = 26) {
  const byWeek = new Map();
  riwayat.forEach((r) => {
    const flag = num(r.ada_event ?? r.ada_bazaar) > 0;
    byWeek.set(r.minggu_mulai, (byWeek.get(r.minggu_mulai) ?? false) || flag);
  });
  const weeks = [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-lastN);
  const nEvent = weeks.filter(([, f]) => f).length;
  return { share: weeks.length ? nEvent / weeks.length : 0, nWeeks: weeks.length, nEvent };
}

// Daftar tanggal minggu prediksi (sama untuk semua produk).
export function horizonWeeks(products = [], horizon) {
  const p = products.find((x) => x.fc.length);
  return p ? productForecastSeries(p, horizon).map((r) => r.week) : [];
}

// Susun jadwal event per minggu.
// - auto: minggu event disebar merata sesuai frekuensi historis (perkiraan, BUKAN jadwal pasti).
// - manual: minggu yang ditandai pengguna.
// - none: tanpa event sama sekali.
export function makeEventConfig({ mode = 'auto', weeks = [], share = 0, manual = [], scale = 1, fallbackUplift = 0 }) {
  const manualSet = new Set(manual);
  let flags;
  if (mode === 'manual') flags = weeks.map((w) => manualSet.has(w));
  else if (mode === 'auto') flags = weeks.map((_, i) => Math.floor((i + 1) * share + 1e-9) > Math.floor(i * share + 1e-9));
  else flags = weeks.map(() => false);
  return { mode, flags, scale, fallbackUplift };
}

// ---------- Prediksi ----------

// Rangkaian prediksi satu produk (mean + sigma per minggu) sepanjang horizon.
// ev (opsional) = hasil makeEventConfig. Tanpa ev perilakunya sama seperti sebelumnya.
// Dengan ev: produk yang punya data skenario memakai level minggu biasa (d_normal_minggu) dan
// minggu event (d_event_minggu) dari pipeline, dengan bentuk mingguan model dipertahankan.
// Produk tanpa data skenario memakai uplift global pada minggu event.
export function productForecastSeries(prod, horizon, ev = null) {
  const base = prod.fc;
  if (!base.length) return [];
  const nModel = base.length;
  const level = sum(base.map((r) => r.mean)) / nModel;
  const lastWeek = base[nModel - 1].week;
  const bz = prod.bz;

  let fN = 1;
  let fE = 1;
  let dN = 0;
  let dE = 0;
  let absolute = false;
  if (ev) {
    if (bz && (bz.dNormal > 0 || bz.dEvent > 0)) {
      dN = bz.dNormal;
      dE = dN + Math.max(0, bz.dEvent - bz.dNormal) * ev.scale;
      if (level > 1e-9) {
        fN = dN / level;
        fE = dE / level;
      } else {
        absolute = true;
      }
    } else {
      fE = 1 + Math.max(0, ev.fallbackUplift) * ev.scale;
    }
  }

  const out = [];
  for (let h = 1; h <= horizon; h += 1) {
    const extrap = h > nModel;
    const widen = 1 + WIDEN_PER_WEEK * Math.max(0, h - nModel);
    const isEvent = !!(ev && ev.flags[h - 1]);
    const raw = extrap ? level : base[h - 1].mean;
    let mean = raw;
    if (ev) mean = absolute ? (isEvent ? dE : dN) : raw * (isEvent ? fE : fN);
    const sigmaBase = isEvent && bz ? Math.max(bz.sigmaEvent, prod.sigma) : prod.sigma;
    out.push({
      h,
      week: extrap ? addDays(lastWeek, 7 * (h - nModel)) : base[h - 1].week,
      mean,
      sigma: sigmaBase * widen,
      extrap,
      event: isEvent,
    });
  }
  return out;
}

// Prediksi agregat banyak produk. target: 'demand' | 'pendapatan'
export function buildForecast(products, horizon, confPct, target = 'demand', ev = null) {
  const z = zFromConfidence(confPct);
  const series = products.map((p) => ({ p, s: productForecastSeries(p, horizon, ev) }));
  const weeks = [];
  for (let h = 1; h <= horizon; h += 1) {
    let mean = 0;
    let varSum = 0;
    let week = null;
    let extrap = false;
    let event = false;
    series.forEach(({ p, s }) => {
      const row = s[h - 1];
      if (!row) return;
      const k = target === 'pendapatan' ? p.harga : 1;
      mean += row.mean * k;
      varSum += (row.sigma * k) ** 2;
      week = row.week;
      extrap = row.extrap;
      event = row.event;
    });
    const hw = z * Math.sqrt(varSum);
    weeks.push({ h, week, mean, lower: Math.max(0, mean - hw), upper: mean + hw, extrap, event });
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
  bazaarUpliftPct: 0,  // cadangan (produk tanpa data skenario), diisi dari data historis
  miniWeeks: 0,        // keputusan: minggu mini bazar
  miniStrengthPct: 40, // kekuatan mini bazar relatif terhadap bazar penuh (asumsi, bisa diubah)
  bazaarScalePct: 100, // skala lonjakan bazar terhadap rasio dari data skenario (100 = sesuai data)
  bazaarMode: 'manual', // 'manual' atau 'pipeline' (1 minggu bazar per 4 minggu, posisi belum pasti)
  useEventPolicy: false, // pakai SS/ROP rekomendasi bazar sebagai kebijakan stok
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

function miniWeekSet(n, horizon, taken) {
  const cands = [];
  for (let h = 1; h <= horizon; h += 1) if (!taken.has(h)) cands.push(h);
  const k = Math.min(Math.max(0, Math.round(n)), cands.length);
  const set = new Set();
  for (let i = 0; i < k; i += 1) set.add(cands[Math.floor(((i + 0.5) * cands.length) / k)]);
  return set;
}

// Rencana event per produk: pengali permintaan tiap minggu, plus bobot event (s) untuk SS/ROP.
// - manual: bazar penuh memakai rasio_event produk (skenario_bazar.csv); mini bazar memakai
//   sebagian lonjakan itu (miniStrengthPct). Produk tanpa data skenario memakai uplift global.
// - pipeline: pengali = total prediksi 'asumsi_bazar_posisi_tak_pasti' / 'normal_tanpa_event'.
function eventPlan(p, horizon, prm, fallbackUplift) {
  const flat = new Array(horizon).fill(1);
  const bz = p.bz;
  if (prm.bazaarMode === 'pipeline') {
    if (!bz) return { factors: flat, s: 0, scale: 1 };
    return { factors: flat.map(() => bz.pipelineRatio), s: 1, scale: 1 };
  }
  const full = bazaarWeekSet(prm.bazaarWeeks, horizon);
  const mini = miniWeekSet(prm.miniWeeks, horizon, full);
  const scale = bz ? prm.bazaarScalePct / 100 : 1;
  const uplift = bz ? Math.max(0, bz.rasio - 1) * scale : fallbackUplift;
  const ms = prm.miniStrengthPct / 100;
  const factors = flat.map((_, i) => {
    if (full.has(i + 1)) return 1 + uplift;
    if (mini.has(i + 1)) return 1 + uplift * ms;
    return 1;
  });
  const s = full.size > 0 ? 1 : mini.size > 0 ? ms : 0;
  return { factors, s, scale };
}

function scenarioForProduct(p, horizon, params, bzUplift, isScenario) {
  const series = productForecastSeries(p, horizon);
  const prm = isScenario ? params : DEFAULT_PARAMS;
  const demandMult = (1 + prm.demandPct / 100) * Math.pow(Math.max(0.01, 1 + prm.pricePct / 100), -prm.elasticity);
  const plan = eventPlan(p, horizon, prm, bzUplift);
  const price = p.harga * (1 + prm.pricePct / 100);

  const demand = series.map((s, i) => s.mean * demandMult * plan.factors[i]);

  const leadWeeks = p.leadTime * prm.ltMult + prm.delayDays / 7;
  const ssBase = SERVICE_Z * p.sigma * Math.sqrt(Math.max(p.leadTime, 0.01));

  // Saat ada event, sigma dan rata-rata permintaan untuk SS/ROP bergeser ke nilai event
  // (sigma_event & d_event_minggu dari ss_rop_skenario.csv), dibobot sesuai kekuatan event.
  let sigmaUse = p.sigma;
  let dBarBase = p.rataMinggu;
  if (p.bz && plan.s > 0) {
    const sigmaEvent = Math.max(p.bz.sigmaEvent, p.sigma);
    sigmaUse = p.sigma + (sigmaEvent - p.sigma) * plan.s;
    dBarBase = p.rataMinggu + Math.max(0, p.bz.dEvent - p.bz.dNormal) * plan.scale * plan.s;
  }

  const ssNew = SERVICE_Z * sigmaUse * demandMult * Math.sqrt(Math.max(leadWeeks, 0.01)) * (1 + prm.ssBoostPct / 100);
  const dBar = dBarBase * demandMult;
  const ropNew = dBar * leadWeeks + ssNew;

  // Kebijakan stok: order-up-to = ROP dasar + SS tambahan + permintaan rata-rata 1 minggu.
  let target = p.rop + ssBase * (prm.ssBoostPct / 100) + p.rataMinggu;
  if (prm.useEventPolicy && plan.s > 0) {
    // Kebijakan disiapkan untuk event (lead time normal, sebelum gangguan terjadi).
    const ssPol = SERVICE_Z * sigmaUse * Math.sqrt(Math.max(p.leadTime, 0.01));
    target = p.rop + (ssPol - ssBase) + (dBarBase - p.rataMinggu) * p.leadTime
      + ssPol * (prm.ssBoostPct / 100) + dBarBase;
  }
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

// Ringkasan data skenario bazar untuk produk terpilih (skenario_bazar.csv dkk).
export function bazaarSummary(products = []) {
  const rows = products
    .filter((p) => p.bz)
    .map((p) => ({ kode: p.kode, nama: p.nama, harga: p.harga, satuan: p.satuan, ...p.bz }))
    .sort((a, b) => b.tambahan - a.tambahan);
  return {
    rows,
    n: rows.length,
    kebutuhanNormal: sum(rows.map((r) => r.kebutuhanNormal)),
    kebutuhanBazar: sum(rows.map((r) => r.kebutuhanBazar)),
    tambahan: sum(rows.map((r) => r.tambahan)),
    tambahanRp: sum(rows.map((r) => r.tambahan * r.harga)),
    lemah: rows.filter((r) => r.bukti === 'lemah').length,
    batas: rows.filter((r) => r.rasio >= 4.995).length,
  };
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
