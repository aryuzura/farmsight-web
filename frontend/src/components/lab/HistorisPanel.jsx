import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DIMENSIONS, METRICS, exploreHistory } from './labEngine';
import { CARD, Field, Notice, Segmented, Slider, Stat, fmtNum, fmtPct, fmtRp, fmtRpCompact, fmtWeek, selectClass } from './ui';

const COLORS = ['#0f766e', '#14b8a6', '#2dd4bf', '#0ea5e9', '#6366f1', '#8b5cf6', '#f59e0b', '#f97316', '#ef4444', '#94a3b8'];

export default function HistorisPanel({ riwayat, products }) {
  const [metric, setMetric] = useState('pendapatan');
  const [dimension, setDimension] = useState('produk');
  const [kategori, setKategori] = useState('semua');
  const [status, setStatus] = useState('semua');
  const [periodVal, setPeriodVal] = useState(null); // null = semua periode
  const [grain, setGrain] = useState('mingguan');

  // Rentang data tersedia (minggu), dipakai sebagai batas slider periode.
  const maxWeeks = useMemo(() => {
    const weeks = riwayat.map((r) => r.minggu_mulai).filter(Boolean).sort();
    if (!weeks.length) return 4;
    const span = (new Date(weeks[weeks.length - 1]) - new Date(weeks[0])) / (7 * 24 * 3600 * 1000);
    return Math.max(4, Math.round(span) + 1);
  }, [riwayat]);
  const sliderVal = periodVal === null ? maxWeeks : Math.min(periodVal, maxWeeks);
  const period = sliderVal >= maxWeeks ? 0 : sliderVal;

  const produkMap = useMemo(() => new Map(products.map((p) => [p.kode, p])), [products]);
  const kategoriList = useMemo(() => [...new Set(products.map((p) => p.kategori))].sort(), [products]);

  const result = useMemo(
    () => exploreHistory(riwayat, produkMap, { metric, dimension, kategori, status, periodWeeks: period }),
    [riwayat, produkMap, metric, dimension, kategori, status, period],
  );

  const isRp = metric === 'pendapatan';
  const fmtVal = (v) => (isRp ? fmtRp(v) : fmtNum(v, 1));
  const fmtAxis = (v) => (isRp ? fmtRpCompact(v) : fmtNum(v, 0));
  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? '';
  const dimMeta = DIMENSIONS.find((d) => d.id === dimension);
  const horizontal = ['produk', 'kategori', 'status'].includes(dimension);
  const breakdown = horizontal ? result.breakdown.slice(0, 10) : result.breakdown;
  const trendData = grain === 'mingguan' ? result.trend : result.trendMonthly;

  const top = result.breakdown[0];
  const insights = [];
  if (top && horizontal && result.breakdown.length > 1) {
    insights.push(`${top.name} adalah kontributor terbesar (${fmtPct(top.share, 0)} dari total ${metricLabel.toLowerCase()}).`);
  }
  if (dimension === 'bazaar' && result.breakdown.length === 2) {
    const [biasa, baz] = result.breakdown;
    if (biasa.value > 0) insights.push(`Rata-rata per minggu saat bazaar ${fmtNum(baz.value / biasa.value, 1)}x minggu biasa.`);
  }
  if (dimension === 'bulan' && result.breakdown.length > 2) {
    const sorted = [...result.breakdown].sort((a, b) => b.value - a.value);
    insights.push(`Bulan terkuat ${sorted[0].name}, terlemah ${sorted[sorted.length - 1].name} (rata-rata per minggu).`);
  }
  if (result.growth !== null) {
    insights.push(`13 minggu terakhir ${result.growth >= 0 ? 'naik' : 'turun'} ${fmtPct(Math.abs(result.growth), 0)} dibanding 13 minggu sebelumnya.`);
  }

  const tooltipStyle = { borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 };

  return (
    <div className="space-y-4">
      <div className={`${CARD} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <Field label="Metrik">
          <select className={selectClass} value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Bedah berdasarkan dimensi">
          <select className={selectClass} value={dimension} onChange={(e) => setDimension(e.target.value)}>
            {DIMENSIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Kategori">
          <select className={selectClass} value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="semua">Semua kategori</option>
            {kategoriList.map((k) => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Status produk">
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="semua">Semua</option>
            <option value="aktif">Aktif</option>
            <option value="tidak_aktif">Tidak aktif</option>
          </select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <Slider
            label="Periode terakhir"
            value={sliderVal}
            onChange={(v) => setPeriodVal(v >= maxWeeks ? null : v)}
            min={4}
            max={maxWeeks}
            step={1}
            format={(v) => (v >= maxWeeks ? 'Semua periode' : `${v} minggu terakhir`)}
            minLabel="4 mgg"
            maxLabel={`Semua (${maxWeeks} mgg)`}
          />
        </div>
      </div>

      {result.trend.length === 0 ? (
        <Notice tone="amber">Tidak ada data untuk kombinasi filter ini. Coba longgarkan filter kategori, status, atau periode.</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={`Total ${metricLabel}`} value={isRp ? fmtRpCompact(result.total) : fmtNum(result.total, 0)} sub={`${result.nProduk} produk, ${result.trend.length} minggu`} tone="teal" />
            <Stat label="Rata-rata per minggu" value={isRp ? fmtRpCompact(result.avgWeek) : fmtNum(result.avgWeek, 1)} />
            <Stat label="Minggu puncak" value={result.peak ? (isRp ? fmtRpCompact(result.peak.value) : fmtNum(result.peak.value, 0)) : '-'} sub={result.peak ? `Minggu ${fmtWeek(result.peak.week)}` : ''} />
            <Stat
              label="Tren 13 minggu"
              value={result.growth === null ? '-' : `${result.growth >= 0 ? '+' : '-'}${fmtPct(Math.abs(result.growth), 0)}`}
              sub="vs 13 minggu sebelumnya"
              tone={result.growth === null ? 'default' : result.growth >= 0 ? 'green' : 'rose'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className={`${CARD} lg:col-span-3`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">Tren {metricLabel}</h3>
                <Segmented label="Granularitas" value={grain} onChange={setGrain} options={[{ id: 'mingguan', label: 'Mingguan' }, { id: 'bulanan', label: 'Bulanan' }]} />
              </div>
              <div className="h-72" role="img" aria-label={`Grafik tren ${metricLabel}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11 }} minTickGap={28} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={62} />
                    <Tooltip labelFormatter={fmtWeek} formatter={(v, n) => [fmtVal(v), n]} contentStyle={tooltipStyle} />
                    {grain === 'mingguan' ? (
                      <>
                        <Line type="monotone" dataKey="value" name="Aktual" stroke="#99f6e4" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="ma" name="Rata-rata 4 minggu" stroke="#0f766e" strokeWidth={2.5} dot={false} />
                      </>
                    ) : (
                      <Bar dataKey="value" name="Total bulanan" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${CARD} lg:col-span-2`}>
              <h3 className="mb-1 font-semibold text-gray-900">Berdasarkan {dimMeta?.label.toLowerCase()}</h3>
              <p className="mb-3 text-xs text-gray-500">{result.avgBreakdown ? 'Rata-rata per minggu' : horizontal && result.breakdown.length > 10 ? 'Total, 10 teratas' : 'Total'}</p>
              <div className="h-72" role="img" aria-label={`Grafik berdasarkan ${dimMeta?.label}`}>
                <ResponsiveContainer width="100%" height="100%">
                  {horizontal ? (
                    <BarChart data={breakdown} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" tickFormatter={fmtAxis} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={dimension === 'produk' ? 120 : 80} tick={{ fontSize: 11 }} interval={0} />
                      <Tooltip formatter={(v) => [fmtVal(v), metricLabel]} contentStyle={tooltipStyle} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {breakdown.map((b, i) => <Cell key={b.name} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart data={breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={58} />
                      <Tooltip formatter={(v) => [fmtVal(v), metricLabel]} contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {insights.length > 0 && (
            <Notice tone="blue">
              <p className="mb-1 font-semibold">Temuan cepat</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {insights.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </Notice>
          )}
        </>
      )}
    </div>
  );
}
