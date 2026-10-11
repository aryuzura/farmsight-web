
import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '../api';

const ModelPerfomance = () => {
  const [models, setModels] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const [forecastResponse, inventoryResponse] = await Promise.all([
          fetchApi('/api/forecast'),
          fetchApi('/api/inventory'),
        ]);

        if (
          !Array.isArray(forecastResponse) ||
          !Array.isArray(inventoryResponse)
        ) {
          throw new Error('Format data forecasting atau inventaris tidak valid.');
        }

        if (cancelled) return;

        const normalizeNumber = (value) => {
          if (
            value === null ||
            value === undefined ||
            value === '' ||
            typeof value === 'boolean'
          ) {
            return null;
          }

          const number = Number(value);
          return Number.isFinite(number) ? number : null;
        };

        setModels(
          forecastResponse.map((item) => ({
            kode_produk: String(
              item.kode_produk ?? item.produk ?? '-'
            ).trim().toUpperCase(),
            nama_produk: item.nama_produk ?? item.nama ?? '-',
            model_terbaik: item.model_terbaik ?? item.model ?? null,
            RMSE: normalizeNumber(item.RMSE ?? item.rmse),
            Safety_Stock: normalizeNumber(
              item.Safety_Stock ?? item.safety_stock
            ),
            ROP: normalizeNumber(item.ROP ?? item.rop),
            status_produk: item.status_produk ?? null,
            tier_model: item.tier_model ?? null,
            keandalan: item.keandalan ?? null,
          }))
        );

        setInventory(inventoryResponse);
      } catch (err) {
        if (!cancelled) {
          console.error('Model Performance error:', err);
          setError(err.message || 'Gagal memuat data pemantauan model.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizeNumber = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      typeof value === 'boolean'
    ) {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const formatMetric = (value, digits = 2) => {
    if (value === null || value === undefined || value === '') {
      return 'Belum tersedia';
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number.toLocaleString('id-ID', {
          maximumFractionDigits: digits,
        })
      : 'Belum tersedia';
  };

  const formatNumber = (value) => {
    return Number(value ?? 0).toLocaleString('id-ID', {
      maximumFractionDigits: 2,
    });
  };

  const getCode = (item) =>
    String(item?.kode_produk ?? item?.produk ?? '')
      .trim()
      .toUpperCase();

  const getDateValue = (item) => {
    const candidates = [
      item?.tanggal_siklus_berakhir,
      item?.tanggal_barang_keluar,
      item?.tanggal_barang_masuk,
      item?.tanggal_pemesanan,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const date = new Date(candidate);

      if (!Number.isNaN(date.getTime())) {
        return date.getTime();
      }
    }

    return 0;
  };

  // Ringkasan model dan inventaris.
  const summary = useMemo(() => {
    const latestInventoryByProduct = new Map();

    inventory.forEach((item) => {
      const code = getCode(item);
      if (!code) return;

      const stock = normalizeNumber(item.sisa_stok);
      if (stock === null) return;

      const timestamp = getDateValue(item);
      const existing = latestInventoryByProduct.get(code);

      if (!existing || timestamp > existing.timestamp) {
        latestInventoryByProduct.set(code, {
          kode_produk: code,
          sisa_stok: stock,
          timestamp,
        });
      }
    });

    const products = models.map((item) => {
      const stockRecord = latestInventoryByProduct.get(item.kode_produk);

      return {
        ...item,
        stok_tercatat: stockRecord?.sisa_stok ?? null,
      };
    });

    const modeledCount = products.filter(
      (item) =>
        item.model_terbaik !== null &&
        String(item.model_terbaik).trim() !== ''
    ).length;

    const rmseCount = products.filter(
      (item) => item.RMSE !== null
    ).length;

    const safetyStockCount = products.filter(
      (item) => item.Safety_Stock !== null
    ).length;

    const ropCount = products.filter(
      (item) => item.ROP !== null
    ).length;

    const matchedInventoryCount = products.filter(
      (item) => item.stok_tercatat !== null
    ).length;

    const totalBarangMasuk = inventory.reduce(
      (total, item) =>
        total + (normalizeNumber(item.jumlah_produk_masuk) ?? 0),
      0
    );

    const totalDemandAktual = inventory.reduce(
      (total, item) =>
        total + (normalizeNumber(item.demand_aktual_siklus) ?? 0),
      0
    );

    const rasioPemakaianKeseluruhan =
      totalBarangMasuk > 0
        ? (totalDemandAktual / totalBarangMasuk) * 100
        : null;

    const siklusTidakCocok = inventory.filter(
      (item) => Number(item.flag_siklus_tidak_cocok) === 1
    ).length;

    const siklusLeadTimeNegatif = inventory.filter(
      (item) => Number(item.flag_lt_negatif) === 1
    ).length;

    const riskProducts = products.filter(
      (item) =>
        item.stok_tercatat !== null &&
        item.ROP !== null &&
        item.stok_tercatat <= item.ROP
    );

    return {
      products,
      modeledCount,
      notModeledCount: products.length - modeledCount,
      rmseCount,
      safetyStockCount,
      ropCount,
      matchedInventoryCount,
      riskProducts,
      totalBarangMasuk,
      totalDemandAktual,
      rasioPemakaianKeseluruhan,
      siklusTidakCocok,
      siklusLeadTimeNegatif,
    };
  }, [models, inventory]);

  const filteredModels = summary.products.filter((item) => {
    const query = searchTerm.trim().toLowerCase();

    return (
      String(item.kode_produk).toLowerCase().includes(query) ||
      String(item.nama_produk).toLowerCase().includes(query) ||
      String(item.model_terbaik ?? '').toLowerCase().includes(query)
    );
  });

  const cardClass =
    'rounded-xl border border-gray-200 bg-white p-5 shadow-sm';

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        Memuat pemantauan model dan inventaris...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-700">
        <h2 className="font-semibold">
          Gagal memuat pemantauan model
        </h2>
        <p className="mt-1">{error}</p>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2"
        >
          Muat Ulang Halaman
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Pemantauan Model
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Pemantauan hasil demand forecasting, evaluasi model,
              dan parameter pengelolaan persediaan FarmSight.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            ↻ Muat Ulang Data
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total Produk</p>
            <p className="mt-2 text-3xl font-bold text-gray-800">
              {models.length}
            </p>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-700">Produk dengan Model</p>
            <p className="mt-2 text-3xl font-bold text-green-800">
              {summary.modeledCount}
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-700">Model Belum Tersedia</p>
            <p className="mt-2 text-3xl font-bold text-amber-800">
              {summary.notModeledCount}
            </p>
          </div>
        </div>
      </section>

      {/* RINGKASAN PEMODELAN DAN INVENTARIS */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Ringkasan Pemodelan dan Inventaris
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Ringkasan cakupan model, evaluasi, dan pemakaian persediaan
            berdasarkan data API yang tersedia.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={cardClass}>
            <p className="text-sm text-gray-500">
              Produk dalam Respons Forecast
            </p>
            <p className="mt-2 text-3xl font-bold">
              {summary.products.length}
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">Model Tersedia</p>
            <p className="mt-2 text-3xl font-bold text-teal-700">
              {summary.modeledCount}
              <span className="ml-1 text-base text-gray-400">
                / {summary.products.length}
              </span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{
                  width: `${
                    summary.products.length
                      ? (summary.modeledCount / summary.products.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">
              Produk dengan Catatan Stok
            </p>
            <p className="mt-2 text-3xl font-bold text-blue-700">
              {summary.matchedInventoryCount}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Kode produk cocok dengan data forecasting
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">
              Evaluasi RMSE Tersedia
            </p>
            <p className="mt-2 text-3xl font-bold text-purple-700">
              {summary.rmseCount}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Produk memiliki nilai RMSE
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">Total Barang Masuk</p>
            <p className="mt-2 text-3xl font-bold text-blue-700">
              {formatNumber(summary.totalBarangMasuk)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Akumulasi jumlah pada seluruh catatan siklus
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">
              Total Permintaan Aktual
            </p>
            <p className="mt-2 text-3xl font-bold text-teal-700">
              {formatNumber(summary.totalDemandAktual)}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Akumulasi demand pada catatan siklus
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">
              Rasio Pemakaian Keseluruhan
            </p>
            <p className="mt-2 text-3xl font-bold text-purple-700">
              {summary.rasioPemakaianKeseluruhan === null
                ? 'Belum tersedia'
                : `${formatNumber(summary.rasioPemakaianKeseluruhan)}%`}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Total demand dibagi total barang masuk
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-gray-500">
              Siklus dengan Ketidaksesuaian
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-700">
              {summary.siklusTidakCocok}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Catatan dengan flag siklus tidak cocok
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          <p>
            <strong>Catatan interpretasi data:</strong> Total barang masuk
            dan permintaan aktual merupakan akumulasi catatan siklus,
            bukan jumlah transaksi atau pendapatan. Catatan stok terakhir
            bukan jaminan stok fisik saat ini.
          </p>
          <p className="mt-2">
            Siklus dengan lead time negatif: {summary.siklusLeadTimeNegatif}.
            Safety Stock tersedia untuk {summary.safetyStockCount} produk
            dan ROP tersedia untuk {summary.ropCount} produk.
          </p>
        </div>
      </section>

      {/* DETAIL PEMANTAUAN MODEL */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Detail Pemantauan Model
            </h3>
            <p className="mt-1 text-sm text-gray-500">
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
            className="w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 pl-10 text-gray-900"
            placeholder="Cari kode, nama produk, atau model..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="whitespace-nowrap px-5 py-3">Kode</th>
                <th className="whitespace-nowrap px-5 py-3">Nama Produk</th>
                <th className="whitespace-nowrap px-5 py-3">Model Terbaik</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">RMSE</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">
                  Safety Stock
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right">
                  Reorder Point (ROP)
                </th>
                <th className="whitespace-nowrap px-5 py-3">Status Model</th>
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
                      <span className="inline-flex rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {String(item.model_terbaik).toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-gray-400">Belum tersedia</span>
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
                      <span className="font-medium text-green-700">
                        Tersedia
                      </span>
                    ) : item.tier_model === 'heuristik' ? (
                      <span className="font-medium text-blue-700">
                        Metode heuristik
                      </span>
                    ) : item.status_produk === 'tidak_aktif_terbaru' ? (
                      <span className="font-medium text-gray-500">
                        Tidak aktif
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">
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

        <p className="mt-4 text-xs text-gray-500">
          Nilai kosong ditampilkan sebagai "Belum tersedia".
          Nilai nol tetap ditampilkan sebagai nol.
        </p>
      </section>

      <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        FarmSight · Demand Forecasting &amp; Inventory Optimization
        <br />
        Toko Farm Berkah
      </footer>
    </div>
  );
};

export default ModelPerfomance;
