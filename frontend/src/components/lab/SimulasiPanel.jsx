import React, { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DEFAULT_PARAMS, bazaarSummary, simulate } from './labEngine';
import { Badge, CARD, Notice, Segmented, Slider, Stat, fmtNum, fmtPct, fmtRp, fmtRpCompact, fmtSigned, fmtWeek } from './ui';

const PRESETS = [
  { id: 'reset', label: 'Reset (kondisi normal)', params: {} },
  { id: 'telat', label: 'Pasokan terlambat 2 minggu', params: { delayDays: 14 } },
  { id: 'putus', label: 'Pemasok kirim separuh', params: { supplyCutPct: 50, delayDays: 7 } },
  { id: 'lonjak', label: 'Lonjakan permintaan +50%', params: { demandPct: 50 } },
  { id: 'pipeline', label: 'Bazar sesuai pipeline (1 per 4 minggu)', params: { bazaarMode: 'pipeline' } },
  { id: 'bazaar', label: 'Tambah 3 minggu bazar', params: { bazaarWeeks: 3 } },
  { id: 'mini', label: 'Tambah 3 minggu mini bazar', params: { miniWeeks: 3 } },
  { id: 'siap', label: 'Bazar 2 minggu, stok disiapkan', params: { bazaarWeeks: 2, useEventPolicy: true } },
  { id: 'harga', label: 'Naik harga 15%', params: { pricePct: 15 } },
];

const sigPct = (v) => `${v > 0 ? '+' : ''}${v}%`;

// Semua tabel memakai tinggi baris yang sama; lebih dari TABLE_MAX_ROWS baris bisa di-scroll.
const TABLE_ROW_H = 56;
const TABLE_HEAD_H = 40;
const TABLE_MAX_ROWS = 7;
const tableScrollStyle = { maxHeight: TABLE_HEAD_H + TABLE_ROW_H * TABLE_MAX_ROWS };
const headRowStyle = { height: TABLE_HEAD_H };
const bodyRowStyle = { height: TABLE_ROW_H };
const stickyHead = 'sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_#e5e7eb]';

function GroupTitle({ title, caption, tone }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Badge tone={tone}>{title}</Badge>
      <span className="text-xs text-gray-500">{caption}</span>
    </div>
  );
}

const buktiTone = (b) => (b === 'cukup' || b === 'kuat' ? 'green' : b === 'lemah' ? 'amber' : 'gray');
const versiLabel = (v) => (v === 'event' ? 'Sadar event' : v === 'buta' ? 'Buta event' : v === 'sarimax' ? 'SARIMAX' : v ?? '-');

// Dasar data skenario bazar: rasio lonjakan, kebutuhan 4 minggu, SS/ROP event, dan validasi uji.
function BazaarDataCard({ summary }) {
  const { rows } = summary;
  return (
    <div className={CARD}>
      <h3 className="font-semibold text-gray-900">Dasar data skenario bazar</h3>
      <p className="mb-3 text-sm text-gray-500">
        Lonjakan, safety stock, dan ROP saat bazar diambil dari hasil pipeline per produk. Mini bazar memakai sebagian lonjakan yang sama.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kebutuhan 4 minggu, normal" value={fmtNum(summary.kebutuhanNormal, 1)} sub="unit, semua produk terpilih" />
        <Stat label="Kebutuhan 4 minggu, dengan bazar" value={fmtNum(summary.kebutuhanBazar, 1)} sub="1 minggu bazar, posisi belum pasti" tone="teal" />
        <Stat label="Tambahan unit karena bazar" value={`+${fmtNum(summary.tambahan, 1)}`} sub={`Setara ${fmtRpCompact(summary.tambahanRp)}`} tone="amber" />
        <Stat label="Bukti event lemah" value={`${summary.lemah} / ${summary.n}`} sub={`${summary.batas} produk memakai batas rasio 5x`} tone={summary.lemah > 0 ? 'amber' : 'default'} />
      </div>
      {summary.lemah > 0 && (
        <div className="mt-3">
          <Notice tone="amber">
            {summary.lemah} produk berbukti lemah: penjualannya jarang tercatat saat bazar, sehingga rasio lonjakan memakai batas 5x atau perkiraan heuristik. Anggap hasilnya sebagai perkiraan kasar, dan turunkan "Skala lonjakan bazar" bila dirasa terlalu tinggi.
          </Notice>
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <div className="overflow-y-auto" style={tableScrollStyle}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500" style={headRowStyle}>
                <th className={`pr-2 ${stickyHead}`}>Produk</th>
                <th className={`pr-2 text-right ${stickyHead}`}>Rasio bazar</th>
                <th className={`pr-2 ${stickyHead}`}>Bukti</th>
                <th className={`pr-2 text-right ${stickyHead}`}>Kebutuhan 4 mgg</th>
                <th className={`pr-2 text-right ${stickyHead}`}>SS biasa - event</th>
                <th className={`pr-2 text-right ${stickyHead}`}>ROP biasa - event</th>
                <th className={stickyHead}>Uji pada minggu event</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kode} className="border-b border-gray-100" style={bodyRowStyle}>
                  <td className="pr-2 text-gray-700">{r.nama}<span className="block text-xs text-gray-400">{versiLabel(r.versi)} ({r.satuan})</span></td>
                  <td className="pr-2 text-right tabular-nums font-medium">{fmtNum(r.rasio, 2)}x</td>
                  <td className="pr-2"><Badge tone={buktiTone(r.bukti)}>{r.bukti}</Badge></td>
                  <td className="pr-2 text-right tabular-nums">{fmtNum(r.kebutuhanNormal, 1)} - {fmtNum(r.kebutuhanBazar, 1)}<span className="block text-xs text-amber-700">+{fmtNum(r.tambahan, 1)}</span></td>
                  <td className="pr-2 text-right tabular-nums text-gray-600">{r.ssEvent == null ? '-' : `${fmtNum(r.ssBaseline, 1)} - ${fmtNum(r.ssEvent, 1)}`}</td>
                  <td className="pr-2 text-right tabular-nums text-gray-600">{r.ropEvent == null ? '-' : `${fmtNum(r.ropBaseline, 1)} - ${fmtNum(r.ropEvent, 1)}`}</td>
                  <td className="text-xs text-gray-600">
                    {r.validasi
                      ? <>Aktual {fmtNum(r.validasi.aktual, 0)}, prediksi {fmtNum(r.validasi.prediksi, 0)}<span className="block text-gray-400">bias {fmtSigned(r.validasi.bias, (x) => fmtNum(x, 1))} per minggu</span></>
                      : <span className="text-gray-400">Tidak diuji</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SimulasiPanel({ selected, horizon, conf, target, params, setParams, scopeLabel }) {
  const isRp = target === 'pendapatan';
  const set = (k) => (v) => setParams((p) => ({ ...p, [k]: v }));

  const sim = useMemo(
    () => simulate(selected, horizon, params, params.bazaarUpliftPct / 100),
    [selected, horizon, params],
  );
  const { normal: nm, scenario: sc } = sim;

  const SKIP_CHANGED = ['bazaarUpliftPct', 'bazaarScalePct', 'miniStrengthPct', 'useEventPolicy'];
  const changed = Object.keys(DEFAULT_PARAMS).some(
    (k) => !SKIP_CHANGED.includes(k) && params[k] !== DEFAULT_PARAMS[k],
  );
  const bzSummary = useMemo(() => bazaarSummary(selected), [selected]);
  const hasBz = bzSummary.n > 0;
  const eventActive = params.bazaarMode === 'pipeline' || params.bazaarWeeks > 0 || params.miniWeeks > 0;
  const disrupted = params.delayDays > 0 || params.ltMult > 1 || params.supplyCutPct > 0;

  const applyPreset = (preset) =>
    setParams((p) => ({
      ...DEFAULT_PARAMS,
      bazaarUpliftPct: p.bazaarUpliftPct,
      ...preset.params,
    }));

  // ---------- Data grafik ----------
  const chartSold = nm.weeks.map((w, i) => ({
    week: w.week,
    normal: isRp ? w.revenue : w.sold,
    simulasi: isRp ? sc.weeks[i].revenue : sc.weeks[i].sold,
    hilang: isRp ? sc.weeks[i].lostRev : sc.weeks[i].unmet,
  }));
  const chartStock = nm.weeks.map((w, i) => ({ week: w.week, normal: w.stock, simulasi: sc.weeks[i].stock }));

  const fmtVal = (v) => (isRp ? fmtRp(v) : `${fmtNum(v, 1)} unit`);
  const fmtAxis = (v) => (isRp ? fmtRpCompact(v) : fmtNum(v, 0));
  const tooltipStyle = { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 };

  // ---------- Ringkasan dampak ----------
  const dRev = sc.revenue - nm.revenue;
  const dRevPct = nm.revenue > 0 ? dRev / nm.revenue : 0;
  const dFill = sc.fillRate - nm.fillRate;
  const risk = !changed ? null : sc.fillRate >= 0.98 && sc.stockoutProducts === 0 ? { tone: 'green', label: 'Aman' } : sc.fillRate >= 0.9 ? { tone: 'amber', label: 'Waspada' } : { tone: 'red', label: 'Kritis' };

  const bullets = [];
  const recs = [];
  if (changed) {
    bullets.push(
      `Pendapatan ${dRev >= 0 ? 'naik' : 'turun'} ${fmtRp(Math.abs(dRev))} (${fmtSigned(dRevPct * 100, (x) => `${fmtNum(x, 1)}%`)}) selama ${horizon} minggu.`,
    );
    if (sc.lostRevenue - nm.lostRevenue > 1) {
      bullets.push(`Sekitar ${fmtNum(sc.unmet - nm.unmet, 1)} unit permintaan tidak terlayani, setara ${fmtRp(sc.lostRevenue - nm.lostRevenue)} potensi pendapatan hilang.`);
    }
    if (sc.stockoutProducts > nm.stockoutProducts) {
      bullets.push(`${sc.stockoutProducts} produk mengalami kehabisan stok, ${sc.stockoutWeeks} dari ${horizon} minggu terdampak.`);
    }
    if (sc.fillRate >= 0.999 && dRev !== 0) {
      bullets.push('Seluruh permintaan masih dapat dipenuhi dengan kebijakan stok saat ini.');
    }
    if (eventActive) {
      bullets.push(
        params.bazaarMode === 'pipeline'
          ? `Skenario pipeline: 1 minggu bazar tiap 4 minggu, posisinya belum pasti sehingga permintaan dibagi rata (prediksi dari forecast_skenario_mingguan).`
          : `${params.bazaarWeeks} minggu bazar penuh dan ${params.miniWeeks} minggu mini bazar (${params.miniStrengthPct}% dari lonjakan bazar) dalam ${horizon} minggu${hasBz ? ', lonjakan per produk sesuai data skenario' : ''}.`,
      );
    }
    if (disrupted) {
      const dSS = sc.safetyStock - nm.safetyStock;
      if (dSS > 0.05) recs.push(`Menurut rumus service level 95%, safety stock perlu naik sekitar ${fmtNum(dSS, 1)} unit (dari ${fmtNum(nm.safetyStock, 1)} ke ${fmtNum(sc.safetyStock, 1)}) dan titik pesan ulang (ROP) ke ${fmtNum(sc.rop, 1)} unit bila gangguan ini berlanjut.`);
      recs.push('Siapkan pemasok cadangan atau pesan lebih awal untuk produk dengan fill rate terendah (lihat tabel dampak per produk).');
    }
    if (eventActive && !disrupted) {
      const dSS = sc.safetyStock - nm.safetyStock;
      if (dSS > 0.05) recs.push(`Saat bazar, sigma permintaan lebih besar: safety stock sebaiknya naik dari ${fmtNum(nm.safetyStock, 1)} ke ${fmtNum(sc.safetyStock, 1)} unit dan ROP ke ${fmtNum(sc.rop, 1)} unit (total produk terpilih).`);
    }
    if (eventActive && !params.useEventPolicy && sc.fillRate < nm.fillRate - 0.005) {
      recs.push('Fill rate turun karena kebijakan stok saat ini belum mengantisipasi bazar. Aktifkan "Siapkan stok sesuai SS/ROP bazar" untuk melihat dampaknya bila stok disiapkan.');
    }
    if (params.demandPct > 0 || eventActive) {
      recs.push(`Siapkan stok tambahan sekitar ${fmtNum(Math.max(0, sc.demand - nm.demand), 1)} unit selama ${horizon} minggu untuk menampung kenaikan permintaan.`);
    }
    if (params.pricePct !== 0) {
      recs.push(params.pricePct > 0
        ? `Kenaikan harga ${params.pricePct}% menurunkan volume ${fmtPct(1 - sc.demand / Math.max(nm.demand, 1e-9), 0)}; pendapatan ${dRev >= 0 ? 'masih naik' : 'ikut turun'}. Sesuaikan sensitivitas harga bila perlu.`
        : `Penurunan harga ${Math.abs(params.pricePct)}% menaikkan volume ${fmtPct(sc.demand / Math.max(nm.demand, 1e-9) - 1, 0)}; pastikan stok cukup.`);
    }
    if (params.ssBoostPct > 0) {
      recs.push(`Tambahan safety stock ${params.ssBoostPct}% memperbaiki fill rate ${fmtSigned(dFill * 100, (x) => `${fmtNum(x, 1)} poin`)} terhadap kondisi normal, dengan biaya stok lebih besar (rata-rata stok ${fmtNum(sc.avgStock, 1)} unit).`);
    }
  }

  // ---------- Tabel perbandingan ----------
  const rows = [
    { label: 'Permintaan (unit)', n: nm.demand, s: sc.demand, f: (v) => fmtNum(v, 1), better: 'neutral' },
    { label: 'Penjualan terpenuhi (unit)', n: nm.sold, s: sc.sold, f: (v) => fmtNum(v, 1), better: 'up' },
    { label: 'Pendapatan', n: nm.revenue, s: sc.revenue, f: fmtRp, better: 'up' },
    { label: 'Pendapatan hilang (kehabisan stok)', n: nm.lostRevenue, s: sc.lostRevenue, f: fmtRp, better: 'down' },
    { label: 'Tingkat pemenuhan (fill rate)', n: nm.fillRate, s: sc.fillRate, f: (v) => fmtPct(v, 1), better: 'up', pp: true },
    { label: 'Minggu terjadi kehabisan', n: nm.stockoutWeeks, s: sc.stockoutWeeks, f: (v) => fmtNum(v, 0), better: 'down' },
    { label: 'Produk berisiko kehabisan', n: nm.stockoutProducts, s: sc.stockoutProducts, f: (v) => fmtNum(v, 0), better: 'down' },
    { label: 'Rata-rata stok (unit)', n: nm.avgStock, s: sc.avgStock, f: (v) => fmtNum(v, 1), better: 'neutral' },
    { label: 'Safety stock rekomendasi (unit)', n: nm.safetyStock, s: sc.safetyStock, f: (v) => fmtNum(v, 1), better: 'neutral' },
    { label: 'Titik pesan ulang / ROP (unit)', n: nm.rop, s: sc.rop, f: (v) => fmtNum(v, 1), better: 'neutral' },
  ];

  const deltaTone = (r) => {
    const d = r.s - r.n;
    if (Math.abs(d) < 1e-9 || r.better === 'neutral') return 'text-gray-600';
    return (d > 0) === (r.better === 'up') ? 'text-emerald-700' : 'text-rose-700';
  };

  const perProduct = sc.perProduct
    .map((p, i) => ({ ...p, n: nm.perProduct[i], dRev: p.revenue - nm.perProduct[i].revenue }))
    .sort((a, b) => a.dRev - b.dRev);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900">
        <span className="font-semibold">Basis simulasi:</span>
        <span>{scopeLabel}</span><span aria-hidden="true">·</span>
        <span>{horizon} minggu</span><span aria-hidden="true">·</span>
        <span>keyakinan {conf}%</span>
        <span className="text-teal-700">(ubah di bagian Prediksi di atas)</span>
      </div>

      <div className={CARD}>
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                p.id === 'reset' ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100' : 'border-teal-300 bg-white text-teal-800 hover:bg-teal-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <GroupTitle title="Keputusan operasional" caption="Hal yang bisa Anda putuskan" tone="teal" />
            <Slider label="Ubah harga jual" value={params.pricePct} onChange={set('pricePct')} min={-30} max={50} step={1} format={sigPct} hint="Harga naik menurunkan volume sesuai sensitivitas harga." />
            <Slider label="Sensitivitas permintaan terhadap harga" value={params.elasticity} onChange={set('elasticity')} min={0} max={3} step={0.1} format={(v) => fmtNum(v, 1)} minLabel="0 (tidak peka)" maxLabel="3 (sangat peka)" />
            <div className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-800">Bazar dan mini bazar</span>
                {hasBz && (
                  <Segmented
                    label="Cara menyusun bazar"
                    value={params.bazaarMode}
                    onChange={set('bazaarMode')}
                    options={[{ id: 'manual', label: 'Atur sendiri' }, { id: 'pipeline', label: 'Skenario pipeline' }]}
                  />
                )}
              </div>
              {params.bazaarMode === 'pipeline' && hasBz ? (
                <p className="text-sm text-gray-600">
                  Memakai prediksi skenario dari pipeline: 1 minggu bazar tiap 4 minggu dengan posisi belum pasti, jadi lonjakan dibagi rata ke semua minggu. Pilih "Atur sendiri" untuk menentukan jumlah minggu bazar dan mini bazar.
                </p>
              ) : (
                <>
                  <Slider label="Minggu bazar penuh" value={params.bazaarWeeks} onChange={set('bazaarWeeks')} min={0} max={Math.min(horizon, 12)} step={1} format={(v) => `${v} minggu`} hint="Disebar merata dalam periode prediksi." />
                  <Slider label="Minggu mini bazar" value={params.miniWeeks} onChange={set('miniWeeks')} min={0} max={Math.min(horizon, 12)} step={1} format={(v) => `${v} minggu`} hint="Ditempatkan di minggu yang belum dipakai bazar penuh." />
                  <Slider label="Kekuatan mini bazar" value={params.miniStrengthPct} onChange={set('miniStrengthPct')} min={10} max={100} step={5} format={(v) => `${v}%`} minLabel="10%" maxLabel="100% (sama dengan bazar penuh)" hint="Asumsi: bagian lonjakan bazar penuh yang terjadi saat mini bazar. Data pipeline belum membedakan keduanya." />
                  {hasBz ? (
                    <Slider label="Skala lonjakan bazar" value={params.bazaarScalePct} onChange={set('bazaarScalePct')} min={0} max={200} step={10} format={(v) => `${v}%`} minLabel="0%" maxLabel="200%" hint="100% = rasio lonjakan per produk sesuai data skenario." />
                  ) : (
                    <Slider label="Lonjakan permintaan saat bazaar" value={params.bazaarUpliftPct} onChange={set('bazaarUpliftPct')} min={0} max={300} step={5} format={sigPct} hint="Data skenario belum tersedia; nilai awal diambil dari data historis (minggu bazaar vs biasa)." />
                  )}
                </>
              )}
              {hasBz && (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-700" checked={params.useEventPolicy} onChange={(e) => set('useEventPolicy')(e.target.checked)} />
                  <span>Siapkan stok sesuai SS/ROP bazar<span className="block text-xs text-gray-500">Target stok memakai safety stock dan ROP saat event dari data skenario.</span></span>
                </label>
              )}
            </div>
            <Slider label="Tambah safety stock" value={params.ssBoostPct} onChange={set('ssBoostPct')} min={0} max={200} step={10} format={sigPct} />
          </div>
          <div className="space-y-5">
            <GroupTitle title="Gangguan" caption="Hal di luar kendali yang diuji" tone="red" />
            <Slider tone="rose" label="Perubahan permintaan pasar" value={params.demandPct} onChange={set('demandPct')} min={-60} max={200} step={5} format={sigPct} />
            <Slider tone="rose" label="Keterlambatan pasokan tambahan" value={params.delayDays} onChange={set('delayDays')} min={0} max={28} step={1} format={(v) => `${v} hari`} />
            <Slider tone="rose" label="Pengali lead time" value={params.ltMult} onChange={set('ltMult')} min={1} max={5} step={0.5} format={(v) => `${fmtNum(v, 1)}x`} />
            <Slider tone="rose" label="Pasokan yang tidak terkirim" value={params.supplyCutPct} onChange={set('supplyCutPct')} min={0} max={100} step={5} format={(v) => `${v}%`} />
            <Slider tone="amber" label="Stok awal terhadap level target" value={params.startStockPct} onChange={set('startStockPct')} min={0} max={200} step={10} format={(v) => `${v}%`} hint="Kurangi untuk menguji kondisi stok menipis di awal periode." />
          </div>
        </div>
      </div>

      {hasBz ? (
        <BazaarDataCard summary={bzSummary} />
      ) : (
        <Notice tone="blue">Data skenario bazar belum ditemukan (skenario_bazar.csv dan file terkait). Simulasi bazar memakai lonjakan global dari data historis.</Notice>
      )}

      {!changed && (
        <Notice tone="blue">
          Skenario masih sama dengan kondisi normal. Geser slider atau pilih salah satu preset di atas untuk melihat dampaknya.
        </Notice>
      )}

      {/* Ringkasan dampak */}
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Ringkasan dampak operasional terhadap bisnis</h3>
          {risk && <Badge tone={risk.tone}>Risiko: {risk.label}</Badge>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pendapatan simulasi" value={fmtRpCompact(sc.revenue)} sub={`${fmtSigned(dRev, fmtRpCompact)} (${fmtSigned(dRevPct * 100, (x) => `${fmtNum(x, 1)}%`)}) vs normal`} tone={dRev < -1 ? 'rose' : dRev > 1 ? 'green' : 'default'} />
          <Stat label="Fill rate" value={fmtPct(sc.fillRate, 1)} sub={`Normal ${fmtPct(nm.fillRate, 1)}`} tone={sc.fillRate < 0.9 ? 'rose' : sc.fillRate < 0.98 ? 'amber' : 'green'} />
          <Stat label="Pendapatan hilang" value={fmtRpCompact(sc.lostRevenue)} sub={`${fmtNum(sc.unmet, 1)} unit tak terlayani`} tone={sc.lostRevenue > 1 ? 'rose' : 'default'} />
          <Stat label="Produk berisiko kehabisan" value={`${sc.stockoutProducts} / ${selected.length}`} sub={`${sc.stockoutWeeks} dari ${horizon} minggu terdampak`} tone={sc.stockoutProducts > 0 ? 'amber' : 'default'} />
        </div>

        {changed && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-800">
              <p className="mb-1 font-semibold">Apa yang terjadi</p>
              <ul className="list-disc space-y-1 pl-5">{bullets.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            {recs.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <p className="mb-1 font-semibold">Saran tindakan</p>
                <ul className="list-disc space-y-1 pl-5">{recs.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Perbandingan */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-gray-900">{isRp ? 'Pendapatan' : 'Penjualan terpenuhi'} mingguan: Normal vs Simulasi</h3>
          <div className="h-72" role="img" aria-label="Grafik perbandingan skenario normal dan simulasi">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartSold} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={62} />
                <Tooltip labelFormatter={fmtWeek} formatter={(v, n) => [fmtVal(v), n]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="hilang" name={isRp ? "Pendapatan hilang (simulasi)" : "Tidak terlayani (simulasi)"} fill="#fda4af" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line type="monotone" dataKey="normal" name="Normal" stroke="#64748b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="simulasi" name="Simulasi" stroke="#0f766e" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-gray-900">Level stok akhir minggu: Normal vs Simulasi</h3>
          <div className="h-72" role="img" aria-label="Grafik level stok normal dan simulasi">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartStock} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} width={44} />
                <Tooltip labelFormatter={fmtWeek} formatter={(v, n) => [`${fmtNum(v, 1)} unit`, n]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="normal" name="Normal" stroke="#64748b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="simulasi" name="Simulasi" stroke="#e11d48" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <h3 className="mb-3 font-semibold text-gray-900">Perbandingan skenario</h3>
        <div className="overflow-y-auto" style={tableScrollStyle}>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500" style={headRowStyle}>
              <th className={`pr-3 ${stickyHead}`}>Indikator</th>
              <th className={`pr-3 text-right ${stickyHead}`}>Normal</th>
              <th className={`pr-3 text-right ${stickyHead}`}>Simulasi</th>
              <th className={`text-right ${stickyHead}`}>Selisih</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.s - r.n;
              return (
                <tr key={r.label} className="border-b border-gray-100" style={bodyRowStyle}>
                  <td className="pr-3 text-gray-700">{r.label}</td>
                  <td className="pr-3 text-right tabular-nums">{r.f(r.n)}</td>
                  <td className="pr-3 text-right font-medium tabular-nums">{r.f(r.s)}</td>
                  <td className={`text-right tabular-nums font-medium ${deltaTone(r)}`}>
                    {r.pp ? fmtSigned(d * 100, (x) => `${fmtNum(x, 1)} poin`) : fmtSigned(d, r.f)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <h3 className="mb-3 font-semibold text-gray-900">Dampak per produk (terdampak terparah di atas)</h3>
        <div className="overflow-y-auto" style={tableScrollStyle}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500" style={headRowStyle}>
              <th className={`pr-3 ${stickyHead}`}>Produk</th>
              <th className={`pr-3 text-right ${stickyHead}`}>Fill rate normal</th>
              <th className={`pr-3 text-right ${stickyHead}`}>Fill rate simulasi</th>
              <th className={`pr-3 text-right ${stickyHead}`}>Selisih pendapatan</th>
              <th className={`pr-3 text-right ${stickyHead}`}>SS rekomendasi</th>
              <th className={`text-right ${stickyHead}`}>ROP rekomendasi</th>
            </tr>
          </thead>
          <tbody>
            {perProduct.map((p) => (
              <tr key={p.kode} className="border-b border-gray-100" style={bodyRowStyle}>
                <td className="pr-3 text-gray-700">{p.nama}</td>
                <td className="pr-3 text-right tabular-nums">{fmtPct(p.n.fillRate, 0)}</td>
                <td className={`pr-3 text-right font-medium tabular-nums ${p.fillRate < 0.9 ? 'text-rose-700' : ''}`}>{fmtPct(p.fillRate, 0)}</td>
                <td className={`pr-3 text-right tabular-nums ${p.dRev < -1 ? 'text-rose-700' : p.dRev > 1 ? 'text-emerald-700' : 'text-gray-500'}`}>{fmtSigned(p.dRev, fmtRpCompact)}</td>
                <td className="pr-3 text-right tabular-nums">{fmtNum(p.safetyStock, 1)}</td>
                <td className="text-right tabular-nums">{fmtNum(p.rop, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Metode: permintaan skenario = prediksi tengah dikali perubahan permintaan, efek harga, dan lonjakan bazar/mini bazar. Stok disimulasikan dengan kebijakan order-up-to (target = ROP + permintaan 1 minggu), pasokan tiba setelah lead time ditambah keterlambatan, dikurangi bagian yang tidak terkirim. SS = 1,645 x sigma x akar(lead time) (service level 95%, sama dengan pipeline data).
        </p>
      </div>
    </div>
  );
}
