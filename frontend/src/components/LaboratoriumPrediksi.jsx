import React, { useEffect, useMemo, useState } from 'react';
import { fetchApi } from '../api';
import HistorisPanel from './lab/HistorisPanel';
import PrediksiPanel from './lab/PrediksiPanel';
import SimulasiPanel from './lab/SimulasiPanel';
import { DEFAULT_PARAMS, bazaarUplift, prepareProducts } from './lab/labEngine';
import { Notice, SectionHeader } from './lab/ui';

const SECTIONS = [
  { id: 'lab-eksplorasi', label: '1. Eksplorasi' },
  { id: 'lab-prediksi', label: '2. Prediksi' },
  { id: 'lab-simulasi', label: '3. Simulasi' },
];

const LaboratoriumPrediksi = () => {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Pengaturan prediksi dipakai bersama oleh bagian Prediksi dan Simulasi.
  const [scope, setScope] = useState('semua');
  const [horizon, setHorizon] = useState(8);
  const [conf, setConf] = useState(90);
  const [target, setTarget] = useState('demand');
  const [params, setParams] = useState(DEFAULT_PARAMS);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchApi('/api/lab/data');
        if (!Array.isArray(data?.produk) || !Array.isArray(data?.riwayat) || !Array.isArray(data?.forecast)) {
          throw new Error('Format data laboratorium prediksi tidak valid.');
        }
        if (!cancelled) {
          setRaw(data);
          // Uplift bazaar awal diambil dari data historis.
          const { global } = bazaarUplift(data.riwayat);
          setParams((p) => ({ ...p, bazaarUpliftPct: Math.round((global * 100) / 5) * 5 }));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Gagal memuat data laboratorium prediksi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const products = useMemo(
    () => (raw ? prepareProducts(raw.produk, raw.forecast, raw.riwayat) : []),
    [raw],
  );
  const modeled = useMemo(() => products.filter((p) => p.terprediksi), [products]);
  const selected = useMemo(
    () => (scope === 'semua' ? modeled : modeled.filter((p) => p.kode === scope)),
    [modeled, scope],
  );
  const scopeLabel = scope === 'semua' ? `Semua produk terprediksi (${modeled.length})` : selected[0]?.nama ?? scope;

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat Laboratorium Prediksi...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-700">
        <h2 className="font-semibold">Gagal memuat Laboratorium Prediksi</h2>
        <p className="mt-1">{error}</p>
        <p className="mt-1 text-sm">Pastikan backend FastAPI berjalan di http://127.0.0.1:8000.</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Laboratorium Prediksi</h1>
          <p className="text-sm text-gray-500">Jelajahi kinerja historis, hasilkan prediksi permintaan, dan uji keputusan sebelum dijalankan.</p>
        </div>
        <div className="flex gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <section aria-labelledby="lab-eksplorasi">
        <SectionHeader id="lab-eksplorasi" step="1" title="Eksplorasi bisnis" subtitle="Analisis performa historis berdasarkan berbagai dimensi data." />
        <HistorisPanel riwayat={raw.riwayat} products={products} />
      </section>

      <section aria-labelledby="lab-prediksi">
        <SectionHeader id="lab-prediksi" step="2" title="Prediksi permintaan" subtitle="Atur target, jangka waktu, dan tingkat keyakinan dengan slider." />
        {selected.length === 0 ? (
          <Notice tone="amber">Belum ada produk yang memiliki prediksi model. Jalankan pipeline forecasting terlebih dahulu.</Notice>
        ) : (
          <PrediksiPanel
            products={products}
            riwayat={raw.riwayat}
            scope={scope}
            setScope={setScope}
            horizon={horizon}
            setHorizon={setHorizon}
            conf={conf}
            setConf={setConf}
            target={target}
            setTarget={setTarget}
            selected={selected}
          />
        )}
      </section>

      <section aria-labelledby="lab-simulasi">
        <SectionHeader id="lab-simulasi" step="3" title="Simulasi skenario (what-if)" subtitle="Uji keputusan operasional dan hadapi potensi gangguan secara virtual sebelum dieksekusi." />
        {selected.length > 0 && (
          <SimulasiPanel
            selected={selected}
            horizon={horizon}
            conf={conf}
            target={target}
            params={params}
            setParams={setParams}
            scopeLabel={scopeLabel}
          />
        )}
      </section>
    </div>
  );
};

export default LaboratoriumPrediksi;
