
import React, { useState, useEffect } from 'react';
import { fetchApi } from '../api';

const ModelPerfomance = () => {
  const [models, setModels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await fetchApi('/api/forecast');

        if (!Array.isArray(data)) {
          throw new Error('Format data forecasting tidak valid.');
        }

        if (!cancelled) {
          console.log('Model Performance API:', data);
          console.log(
            'Kolom evaluasi model:',
            Object.keys(data[0] ?? {})
          );

          setModels(
            data.map((item) => ({
              kode_produk: item.kode_produk ?? '-',
              nama_produk: item.nama_produk ?? '-',
              model_terbaik: item.model_terbaik ?? null,
              RMSE: item.RMSE ?? null,
              Safety_Stock: item.Safety_Stock ?? null,
              ROP: item.ROP ?? null
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Model Performance error:', err);
          setError(
            err.message || 'Gagal memuat data pemantauan model.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  const formatMetric = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return 'Belum tersedia';
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number.toLocaleString('id-ID', {
          maximumFractionDigits: 2
        })
      : 'Belum tersedia';
  };

  const filteredModels = models.filter((item) => {
    const query = searchTerm.trim().toLowerCase();

    return (
      String(item.kode_produk).toLowerCase().includes(query) ||
      String(item.nama_produk).toLowerCase().includes(query) ||
      String(item.model_terbaik ?? '').toLowerCase().includes(query)
    );
  });

  const modeledCount = models.filter(
    (item) =>
      item.model_terbaik !== null &&
      String(item.model_terbaik).trim() !== ''
  ).length;

  const notModeledCount = models.length - modeledCount;

  const safetyStockCount = models.filter(
    (item) => item.Safety_Stock !== null
  ).length;

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        Memuat pemantauan model...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg bg-red-50 text-red-700">
        <h2 className="font-semibold">
          Gagal memuat pemantauan model
        </h2>
        <p className="mt-1">{error}</p>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-2 rounded-lg border border-red-300"
        >
          Muat Ulang Halaman
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Pemantauan Model
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Ringkasan hasil demand forecasting dan parameter
              pengelolaan persediaan FarmSight.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang Data
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Total Produk</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">
              {models.length}
            </p>
          </div>

          <div className="p-4 rounded-lg border border-green-200 bg-green-50">
            <p className="text-sm text-green-700">
              Produk dengan Model
            </p>
            <p className="text-3xl font-bold text-green-800 mt-2">
              {modeledCount}
            </p>
          </div>

          <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
            <p className="text-sm text-amber-700">
              Model Belum Tersedia
            </p>
            <p className="text-3xl font-bold text-amber-800 mt-2">
              {notModeledCount}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Detail Pemantauan Model
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Evaluasi model dan parameter persediaan berdasarkan data API.
            </p>
          </div>

          <span className="text-sm text-gray-500">
            {filteredModels.length} dari {models.length} produk
          </span>
        </div>

        <div className="relative mb-4">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>

          <input
            type="text"
            className="w-full pl-10 p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-900"
            placeholder="Cari kode, nama produk, atau model..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm text-left text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Kode</th>
                <th className="px-5 py-3 whitespace-nowrap">Nama Produk</th>
                <th className="px-5 py-3 whitespace-nowrap">Model Terbaik</th>
                <th className="px-5 py-3 whitespace-nowrap text-right">RMSE</th>
                <th className="px-5 py-3 whitespace-nowrap text-right">Safety Stock</th>
                <th className="px-5 py-3 whitespace-nowrap text-right">Reorder Point (ROP)</th>
                <th className="px-5 py-3 whitespace-nowrap">Status Model</th>
              </tr>
            </thead>

            <tbody>
              {filteredModels.map((item, index) => (
                <tr
                  key={`${item.kode_produk}-${index}`}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {item.kode_produk}
                  </td>

                  <td className="px-5 py-4 text-gray-800">
                    {item.nama_produk}
                  </td>

                  <td className="px-5 py-4">
                    {item.model_terbaik ? (
                      <span className="inline-flex px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold">
                        {String(item.model_terbaik).toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        Belum tersedia
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4 text-right">
                    {formatMetric(item.RMSE)}
                  </td>

                  <td className="px-5 py-4 text-right">
                    {formatMetric(item.Safety_Stock)}
                  </td>

                  <td className="px-5 py-4 text-right">
                    {formatMetric(item.ROP)}
                  </td>

                  <td className="px-5 py-4">
                    {item.model_terbaik ? (
                      <span className="text-green-700 font-medium">
                        Tersedia
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium">
                        Belum tersedia
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredModels.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-gray-500"
                  >
                    Tidak ada data yang sesuai dengan pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Nilai yang kosong ditampilkan sebagai &quot;Belum tersedia&quot;.
          Nilai nol tetap ditampilkan sebagai nol.
        </p>
      </div>
    </div>
  );
};

export default ModelPerfomance;