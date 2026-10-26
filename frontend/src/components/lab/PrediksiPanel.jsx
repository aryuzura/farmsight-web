import React, { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MODEL_WEEKS_FALLBACK, buildForecast } from './labEngine';
import { Badge, CARD, Field, Notice, Segmented, Slider, Stat, fmtNum, fmtRp, fmtRpCompact, fmtWeek, selectClass } from './ui';

const TARGETS = [
  { id: 'demand', label: 'Demand (unit)' },
  { id: 'pendapatan', label: 'Pendapatan (Rp)' },
];

// Semua tabel memakai tinggi baris yang sama; lebih dari TABLE_MAX_ROWS baris bisa di-scroll.
const TABLE_ROW_H = 56;
const TABLE_HEAD_H = 40;
const TABLE_MAX_ROWS = 7;
const tableScrollStyle = { maxHeight: TABLE_HEAD_H + TABLE_ROW_H * TABLE_MAX_ROWS };
const headRowStyle = { height: TABLE_HEAD_H };
const bodyRowStyle = { height: TABLE_ROW_H };
const stickyHead = 'sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_#e5e7eb]';

const reliabilityTone =(k) => (k === 'tinggi' || k === 'baik' ? 'green' : k === 'cukup' ? 'amber' : k === 'rendah' ? 'red' : 'gray');

export function PredictionTooltip({ active, payload, label, isRp }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const f = (v) => (isRp ? fmtRp(v) : `${fmtNum(v, 2)} unit`);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-gray-900">Minggu {fmtWeek(label)}{d.extrap ? ' (perpanjangan)' : ''}</p>
      {d.actual != null && <p className="text-gray-700">Aktual: <b>{f(d.actual)}</b></p>}
      {d.mean != null && (
        <>
          <p className="text-teal-800">Prediksi: <b>{f(d.mean)}</b></p>
          <p className="text-gray-500">Rentang: {f(d.lower)} s/d {f(d.upper)}</p>
        </>
      )}
    </div>
  );
}

export default function PrediksiPanel({ products, riwayat, scope, setScope, horizon, setHorizon, conf, setConf, target, setTarget, selected }) {
  const isRp = target === 'pendapatan';
  const fc = useMemo(() => buildForecast(selected, horizon, conf, target), [selected, horizon, conf, target]);

  // Aktual 12 minggu terakhir untuk konteks grafik.
  const actual = useMemo(() => {
    const codes = new Set(selected.map((p) => p.kode));
    const byWeek = new Map();
    riwayat.forEach((r) => {
      if (!codes.has(r.kode_produk)) return;
      const v = isRp ? Number(r.pendapatan) || 0 : Number(r.demand) || 0;
      byWeek.set(r.minggu_mulai, (byWeek.get(r.minggu_mulai) ?? 0) + v);
    });
    return [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12).map(([week, actualValue]) => ({ week, actual: actualValue }));
  }, [selected, riwayat, isRp]);

  const chartData = useMemo(() => {
    const last = actual[actual.length - 1];
    const hist = actual.map((a, i) => ({
      ...a,
      // Sambungkan garis prediksi dari titik aktual terakhir.
      ...(i === actual.length - 1 ? { mean: a.actual, lower: a.actual, upper: a.actual, band: 0 } : {}),
    }));
    const fut = fc.weeks.map((w) => ({
      week: w.week,
      mean: w.mean,
      lower: w.lower,
      upper: w.upper,
      lowerBase: w.lower,
      band: w.upper - w.lower,
      extrap: w.extrap,
    }));
    if (last) hist[hist.length - 1] = { ...hist[hist.length - 1], lowerBase: last.actual };
    return [...hist, ...fut];
  }, [actual, fc]);

  const fmtAxis = (v) => (isRp ? fmtRpCompact(v) : fmtNum(v, 0));
  const nModel = Math.max(...selected.map((p) => p.fc.length), MODEL_WEEKS_FALLBACK);
  const single = selected.length === 1 ? selected[0] : null;
  const meanPerWeek = fc.total.mean / horizon;
  const lowReliability = selected.filter((p) => p.keandalan === 'rendah').length;

  const divergent = selected.filter((p) => p.histRecent > 0.5 && p.fc.length && (p.fc.reduce((a, r) => a + r.mean, 0) / p.fc.length) < p.histRecent * 0.3);

  return (
    <div className="space-y-4">
      <div className={`${CARD} grid gap-5 lg:grid-cols-4`}>
        <div className="space-y-4 lg:col-span-1">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Target prediksi</span>
            <Segmented label="Target prediksi" value={target} onChange={setTarget} options={TARGETS} />
          </div>
          <Field label="Cakupan produk">
            <select className={selectClass} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="semua">Semua produk terprediksi ({products.filter((p) => p.terprediksi).length})</option>
              {products.filter((p) => p.terprediksi).map((p) => (
                <option key={p.kode} value={p.kode}>{p.nama}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="lg:col-span-3 grid gap-6 sm:grid-cols-2">
          <Slider
            label="Jangka waktu prediksi"
            value={horizon}
            onChange={setHorizon}
            min={1}
            max={26}
            format={(v) => `${v} minggu`}
            minLabel="1 mgg"
            maxLabel="26 mgg (6 bln)"
            hint={horizon > nModel ? `Minggu ke-${nModel + 1}+ diperpanjang dari level model, interval melebar.` : `Dalam jangkauan model (${nModel} minggu).`}
          />
          <Slider
            label="Tingkat keyakinan"
            value={conf}
            onChange={setConf}
            min={50}
            max={99}
            format={(v) => `${v}%`}
            hint={`Rentang mencakup nilai aktual dengan peluang sekitar ${conf}%.`}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Total prediksi ${horizon} mgg`} value={isRp ? fmtRpCompact(fc.total.mean) : `${fmtNum(fc.total.mean, 1)} unit`} sub={isRp ? fmtRp(fc.total.mean) : undefined} tone="teal" />
        <Stat label={`Rentang ${conf}%`} value={isRp ? `${fmtRpCompact(fc.total.lower)} - ${fmtRpCompact(fc.total.upper)}` : `${fmtNum(fc.total.lower, 0)} - ${fmtNum(fc.total.upper, 0)}`} sub="Total kumulatif, batas bawah - atas" />
        <Stat label="Rata-rata per minggu" value={isRp ? fmtRpCompact(meanPerWeek) : `${fmtNum(meanPerWeek, 1)} unit`} />
        <Stat
          label={single ? 'Model terbaik' : 'Produk dimodelkan'}
          value={single ? (single.model ?? '-') : `${selected.length}`}
          sub={single ? (single.keandalan ? `Keandalan ${single.keandalan}` : '') : lowReliability ? `${lowReliability} berkeandalan rendah` : 'Semua berkeandalan cukup+'}
        />
      </div>

      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900">
            Prediksi {isRp ? 'pendapatan' : 'permintaan'} mingguan{single ? `: ${single.nama}` : ''}
          </h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-slate-500" /> Aktual</span>
            <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-teal-700" /> Prediksi</span>
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-4 rounded-sm bg-teal-200" /> Rentang {conf}%</span>
          </div>
        </div>
        <div className="h-80" role="img" aria-label="Grafik prediksi dengan rentang keyakinan">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={62} />
              <Tooltip content={<PredictionTooltip isRp={isRp} />} />
              <Area type="monotone" dataKey="lowerBase" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
              <Area type="monotone" dataKey="band" stackId="band" stroke="none" fill="#5eead4" fillOpacity={0.35} isAnimationActive={false} legendType="none" />
              <Line type="monotone" dataKey="actual" stroke="#64748b" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="mean" stroke="#0f766e" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 3 }} isAnimationActive={false} />
              {actual.length > 0 && <ReferenceLine x={actual[actual.length - 1].week} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Hari ini', fontSize: 11, fill: '#64748b', position: 'top' }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-2">
        {horizon > nModel && (
          <Notice tone="blue">
            Model menghasilkan prediksi {nModel} minggu. Minggu berikutnya memakai level rata-rata prediksi model dengan interval dilebarkan 10% per minggu, jadi anggap sebagai perkiraan kasar.
          </Notice>
        )}
        {divergent.length > 0 && (
          <Notice tone="amber">
            {divergent.map((p) => p.nama).join(', ')}: prediksi model jauh di bawah rata-rata 52 minggu terakhir. Biasanya karena penjualan produk ini mereda belakangan ini, bukan karena tidak ada permintaan. Tinjau sebelum dipakai untuk keputusan stok.
          </Notice>
        )}
        <Notice tone="blue">
          Karena permintaan tersendat-sendat (lumpy), batas bawah sering menyentuh 0 dan batas atas lebar. Itu mencerminkan ketidakpastian data, bukan kesalahan hitung.
        </Notice>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${CARD} overflow-x-auto`}>
          <h3 className="mb-3 font-semibold text-gray-900">Rincian per minggu</h3>
          <div className="overflow-y-auto" style={tableScrollStyle}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500" style={headRowStyle}>
                <th className={`px-0 pr-2 ${stickyHead}`}>Minggu</th>
                <th className={`pr-2 text-right ${stickyHead}`}>Prediksi</th>
                <th className={`text-right ${stickyHead}`}>Rentang {conf}%</th>
              </tr>
            </thead>
            <tbody>
              {fc.weeks.map((w) => (
                <tr key={w.h} className="border-b border-gray-100" style={bodyRowStyle}>
                  <td className="pr-2 text-gray-700">{w.h}. {fmtWeek(w.week)}{w.extrap && <span className="ml-1 text-xs text-amber-600">perp.</span>}</td>
                  <td className="pr-2 text-right tabular-nums font-medium">{isRp ? fmtRpCompact(w.mean) : fmtNum(w.mean, 2)}</td>
                  <td className="text-right tabular-nums text-gray-500">{isRp ? `${fmtRpCompact(w.lower)} - ${fmtRpCompact(w.upper)}` : `${fmtNum(w.lower, 1)} - ${fmtNum(w.upper, 1)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className={`${CARD} overflow-x-auto`}>
          <h3 className="mb-3 font-semibold text-gray-900">Per produk (total {horizon} minggu)</h3>
          <div className="overflow-y-auto" style={tableScrollStyle}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500" style={headRowStyle}>
                <th className={`pr-2 ${stickyHead}`}>Produk</th>
                <th className={`pr-2 text-right ${stickyHead}`}>Prediksi</th>
                <th className={`pr-2 text-right ${stickyHead}`}>Rentang</th>
                <th className={stickyHead}>Keandalan</th>
              </tr>
            </thead>
            <tbody>
              {[...fc.perProduct].sort((a, b) => b.total - a.total).map((p) => (
                <tr key={p.kode} className="border-b border-gray-100" style={bodyRowStyle}>
                  <td className="pr-2 text-gray-700">{p.nama}<span className="block text-xs text-gray-400">{p.model}</span></td>
                  <td className="pr-2 text-right tabular-nums font-medium">{isRp ? fmtRpCompact(p.total) : fmtNum(p.total, 1)}</td>
                  <td className="pr-2 text-right tabular-nums text-gray-500">{isRp ? `${fmtRpCompact(p.lower)} - ${fmtRpCompact(p.upper)}` : `${fmtNum(p.lower, 0)} - ${fmtNum(p.upper, 0)}`}</td>
                  <td><Badge tone={reliabilityTone(p.keandalan)}>{p.keandalan ?? '-'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
