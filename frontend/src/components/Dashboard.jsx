import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fetchApi } from '../api';

const Dashboard = () => {
  const [forecastData, setForecastData] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // State untuk data dashboard tambahan
  const [dashboardKpi, setDashboardKpi] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [revenueForecastData, setRevenueForecastData] = useState([]);
  const [dashboardProducts, setDashboardProducts] = useState([]);
  const [operationalScore, setOperationalScore] = useState(null);
  const [dashboardDataError, setDashboardDataError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
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
          throw new Error('Format data API tidak valid.');
        }

        if (!cancelled) {
          setForecastData(forecastResponse);
          setInventoryData(inventoryResponse);

          // Debug: periksa struktur data API
          console.log('Jumlah data forecast:', forecastResponse.length);
          console.log(
            'Detail Forecast:',
            JSON.stringify(forecastResponse[0] ?? null, null, 2)
          );
          console.log('Jumlah data inventory:', inventoryResponse.length);
          console.log(
            'Detail Inventory:',
            JSON.stringify(inventoryResponse[0] ?? null, null, 2)
          );
          console.log(
            'Semua kolom forecast:',
            Object.keys(forecastResponse[0] ?? {})
          );
          console.log(
            'Semua kolom inventory:',
            Object.keys(inventoryResponse[0] ?? {})
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Dashboard error:', err);
          setError(err.message || 'Gagal memuat data Dashboard.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  // Memuat file dashboard tambahan tanpa mengganggu API lama.
  useEffect(() => {
    let cancelled = false;

    const loadExtraDashboard = async () => {
      const endpoints = [
        ['/api/dashboard/kpi', setDashboardKpi, null],
        ['/api/dashboard/tren-penjualan', setTrendData, []],
        [
          '/api/dashboard/forecast-pendapatan',
          setRevenueForecastData,
          [],
        ],
        ['/api/dashboard/produk', setDashboardProducts, []],
        [
          '/api/dashboard/skor-operasional',
          setOperationalScore,
          null,
        ],
      ];

      const results = await Promise.allSettled(
        endpoints.map(([url]) => fetchApi(url))
      );

      if (cancelled) return;

      const failed = [];

      results.forEach((result, index) => {
        const [url, setter, fallback] = endpoints[index];

        if (result.status === 'fulfilled') {
          setter(result.value);
        } else {
          setter(fallback);
          failed.push(url);
          console.warn(`Gagal memuat ${url}:`, result.reason);
        }
      });

      setDashboardDataError(
        failed.length
          ? `Data tambahan belum berhasil dimuat dari ${failed.join(', ')}`
          : ''
      );
    };

    loadExtraDashboard();

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

  const formatNumber = (value, digits = 2) => {
    if (value === null || value === undefined) {
      return 'Belum tersedia';
    }

    return Number(value).toLocaleString('id-ID', {
      maximumFractionDigits: digits,
    });
  };

  const getCode = (item) =>
    String(item?.kode_produk ?? item?.produk ?? '')
      .trim()
      .toUpperCase();

  // Mengurutkan catatan berdasarkan akhir siklus terlebih dahulu.
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

  const dashboardData = useMemo(() => {
    const normalizeForecast = forecastData.map((item) => ({
      kode_produk: getCode(item) || '-',
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
    }));

    /*
     * Data inventaris berupa catatan siklus.
     * Catatan terakhir dipakai sebagai referensi historis,
     * bukan sebagai jaminan stok fisik saat ini.
     */
    const latestInventoryByProduct = new Map();

    inventoryData.forEach((item) => {
      const code = getCode(item);
      if (!code) return;

      const stock = normalizeNumber(item.sisa_stok);
      if (stock === null) return;

      const timestamp = getDateValue(item);
      const existing = latestInventoryByProduct.get(code);

      if (!existing || timestamp > existing.timestamp) {
        latestInventoryByProduct.set(code, {
          kode_produk: code,
          nama_produk: item.nama_produk ?? '-',
          sisa_stok: stock,
          timestamp,
          tanggal_siklus_berakhir:
            item.tanggal_siklus_berakhir ?? null,
          tanggal_barang_keluar:
            item.tanggal_barang_keluar ?? null,
          tanggal_barang_masuk:
            item.tanggal_barang_masuk ?? null,
          tanggal_pemesanan:
            item.tanggal_pemesanan ?? null,
        });
      }
    });

    const mergedProducts = normalizeForecast.map((item) => {
      const inventory = latestInventoryByProduct.get(item.kode_produk);
      const currentStock = inventory?.sisa_stok ?? null;

      let stockStatus = 'Data stok belum tersedia';

      if (currentStock !== null && item.ROP !== null) {
        stockStatus =
          currentStock <= item.ROP
            ? 'Perlu perhatian'
            : 'Di atas ROP';
      } else if (currentStock !== null) {
        stockStatus = 'Catatan tersedia, ROP belum tersedia';
      }

      return {
        ...item,
        stok_tercatat: currentStock,
        tanggal_catatan_stok: inventory
          ? inventory.tanggal_siklus_berakhir ||
            inventory.tanggal_barang_keluar ||
            inventory.tanggal_barang_masuk ||
            inventory.tanggal_pemesanan
          : null,
        stockStatus,
      };
    });

    const modeledCount = mergedProducts.filter(
      (item) =>
        item.model_terbaik !== null &&
        String(item.model_terbaik).trim() !== ''
    ).length;

    const rmseCount = mergedProducts.filter(
      (item) => item.RMSE !== null
    ).length;

    const safetyStockCount = mergedProducts.filter(
      (item) => item.Safety_Stock !== null
    ).length;

    const ropCount = mergedProducts.filter(
      (item) => item.ROP !== null
    ).length;

    const matchedInventoryCount = mergedProducts.filter(
      (item) => item.stok_tercatat !== null
    ).length;

    // Ringkasan operasional dari seluruh catatan siklus.
    const totalBarangMasuk = inventoryData.reduce(
      (total, item) =>
        total + (normalizeNumber(item.jumlah_produk_masuk) ?? 0),
      0
    );

    const totalDemandAktual = inventoryData.reduce(
      (total, item) =>
        total + (normalizeNumber(item.demand_aktual_siklus) ?? 0),
      0
    );

    const totalSisaStokSiklus = inventoryData.reduce(
      (total, item) =>
        total + (normalizeNumber(item.sisa_stok) ?? 0),
      0
    );

    const rasioPemakaianKeseluruhan =
      totalBarangMasuk > 0
        ? totalDemandAktual / totalBarangMasuk
        : null;

    const siklusTidakCocok = inventoryData.filter(
      (item) => Number(item.flag_siklus_tidak_cocok) === 1
    ).length;

    const siklusLeadTimeNegatif = inventoryData.filter(
      (item) => Number(item.flag_lt_negatif) === 1
    ).length;

    const riskProducts = mergedProducts.filter(
      (item) =>
        item.stok_tercatat !== null &&
        item.ROP !== null &&
        item.stok_tercatat <= item.ROP
    );

    const missingModelProducts = mergedProducts.filter(
      (item) =>
        item.model_terbaik === null ||
        String(item.model_terbaik).trim() === ''
    );

    const chartData = mergedProducts
      .filter(
        (item) => item.Safety_Stock !== null || item.ROP !== null
      )
      .map((item) => ({
        kode_produk: item.kode_produk,
        Safety_Stock: item.Safety_Stock,
        ROP: item.ROP,
      }));

    return {
      products: mergedProducts,
      modeledCount,
      rmseCount,
      safetyStockCount,
      ropCount,
      matchedInventoryCount,
      riskProducts,
      missingModelProducts,
      chartData,

      inventoryLogCount: inventoryData.length,
      uniqueInventoryProducts: latestInventoryByProduct.size,

      totalBarangMasuk,
      totalDemandAktual,
      totalSisaStokSiklus,
      rasioPemakaianKeseluruhan,
      siklusTidakCocok,
      siklusLeadTimeNegatif,
    };
  }, [forecastData, inventoryData]);

  const insights = useMemo(() => {
    const result = [];
    const total = dashboardData.products.length;

    if (total === 0) return result;

    if (dashboardData.riskProducts.length > 0) {
      const names = dashboardData.riskProducts
        .slice(0, 4)
        .map((item) => item.nama_produk || item.kode_produk)
        .join(', ');

      result.push({
        type: 'danger',
        icon: '🚨',
        title: `${dashboardData.riskProducts.length} produk perlu perhatian stok`,
        description:
          'Catatan stok siklus terakhir menunjukkan jumlah pada atau di bawah ROP. ' +
          `Produk yang perlu diperiksa: ${names}` +
          (dashboardData.riskProducts.length > 4
            ? ', dan produk lainnya.'
            : '.'),
        action:
          'Periksa stok fisik dan parameter ROP sebelum merencanakan pengadaan.',
      });
    } else if (
      dashboardData.matchedInventoryCount === 0 ||
      dashboardData.ropCount === 0
    ) {
      result.push({
        type: 'warning',
        icon: '📦',
        title: 'Risiko stok belum dapat dinilai sepenuhnya',
        description:
          'Perbandingan stok dan ROP memerlukan kode produk yang cocok serta nilai ROP yang tersedia.',
        action:
          'Periksa kesesuaian kode produk dan kelengkapan parameter persediaan.',
      });
    } else {
      result.push({
        type: 'success',
        icon: '✓',
        title: 'Perbandingan catatan stok selesai',
        description:
          `${dashboardData.matchedInventoryCount} produk memiliki catatan stok yang cocok dengan data forecasting. ` +
          'Belum ditemukan catatan yang berada pada atau di bawah ROP berdasarkan parameter yang tersedia.',
        action:
          'Verifikasi catatan siklus dengan stok fisik sebelum mengambil keputusan.',
      });
    }

    result.push({
      type: dashboardData.siklusTidakCocok > 0 ? 'warning' : 'info',
      icon: '🔎',
      title: 'Pemeriksaan konsistensi siklus',
      description:
        `${dashboardData.siklusTidakCocok} catatan memiliki flag siklus tidak cocok dan ` +
        `${dashboardData.siklusLeadTimeNegatif} catatan memiliki flag lead time negatif.`,
      action:
        'Tinjau catatan yang memiliki flag sebelum menggunakannya untuk analisis persediaan.',
    });

    if (dashboardData.missingModelProducts.length > 0) {
      result.push({
        type: 'warning',
        icon: '🧠',
        title: 'Sebagian produk belum memiliki nama model',
        description:
          `${dashboardData.modeledCount} dari ${total} produk memiliki nama model. ` +
          `${dashboardData.missingModelProducts.length} produk lainnya belum memiliki nama model pada respons API.`,
        action:
          'Periksa status pemodelan dan kelengkapan data produk tersebut.',
      });
    } else {
      result.push({
        type: 'success',
        icon: '✓',
        title: 'Nama model tersedia',
        description: `Nama model tersedia untuk seluruh ${total} produk.`,
        action:
          'Tetap evaluasi kualitas model menggunakan metrik evaluasi.',
      });
    }

    result.push({
      type: 'info',
      icon: '📈',
      title: 'Tren penjualan belum dapat dinilai',
      description:
        'Data yang terhubung saat ini berupa catatan inventaris per siklus, bukan transaksi penjualan berdasarkan periode.',
      action:
        'Hubungkan data transaksi dengan tanggal dan kuantitas penjualan untuk menganalisis tren.',
    });

    result.push({
      type: 'info',
      icon: '🔮',
      title: 'Prediksi permintaan perlu dilengkapi',
      description:
        'Endpoint forecasting saat ini menyediakan RMSE dan parameter persediaan, tetapi belum mengirim nilai prediksi permintaan per produk.',
      action:
        'Sediakan nilai forecast beserta periode prediksinya dari backend.',
    });

    result.push({
      type: 'info',
      icon: '💰',
      title: 'Pendapatan belum dapat dihitung',
      description:
        'Data harga jual dan jumlah penjualan atau prediksi kuantitas belum tersedia bersama pada data yang terhubung.',
      action:
        'Hubungkan data transaksi dan harga jual untuk menghitung pendapatan aktual maupun estimasi.',
    });

    return result;
  }, [dashboardData]);

  const cardClass =
    'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm';

  const getInsightClass = (type) => {
    const classes = {
      danger: 'border-red-200 bg-red-50',
      warning: 'border-amber-200 bg-amber-50',
      success: 'border-green-200 bg-green-50',
      info: 'border-blue-200 bg-blue-50',
    };

    return classes[type] || classes.info;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
          <p className="font-medium text-gray-700">
            Memuat data Dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="rounded-2xl border border-red-200 bg-white p-6">
          <h2 className="text-xl font-bold text-red-700">
            Gagal memuat Dashboard
          </h2>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <p className="mt-2 text-sm text-gray-500">
            Pastikan endpoint /api/forecast dan /api/inventory aktif.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 text-gray-800 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-7">
        {/* HEADER */}
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">
              Business Intelligence
            </p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Dashboard FarmSight
            </h1>
            <p className="mt-2 text-gray-500">
              Ringkasan kondisi bisnis dan persediaan Toko Farm Berkah.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="self-start rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 sm:self-auto"
          >
            ↻ Muat Ulang Data
          </button>
        </header>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Data berhasil dihubungkan: {forecastData.length} produk forecasting
          dan {inventoryData.length} catatan inventaris.
          <p className="mt-1 text-xs text-blue-700">
            Catatan stok yang ditampilkan berasal dari siklus terbaru yang
            tersedia, bukan jaminan stok fisik saat ini.
          </p>
        </div>

        {/* BUSINESS HEALTH */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-teal-600 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold tracking-wide text-teal-100">
              BUSINESS HEALTH SCORE
            </p>

            {(() => {
              const score = normalizeNumber(
                dashboardKpi?.skor_kesehatan_bisnis
              );

              const label = dashboardKpi?.label_kesehatan_bisnis;
              const komponen =
                dashboardKpi?.komponen_skor_kesehatan_bisnis;

              return (
                <>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-5xl font-bold">
                      {score === null ? '—' : formatNumber(score, 1)}
                    </span>
                    <span className="pb-1 text-sm text-teal-100">/ 100</span>
                  </div>

                  <span className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1.5 text-sm">
                    {score === null
                      ? 'Belum dapat dihitung'
                      : label || 'Skor tersedia'}
                  </span>

                  <p className="mt-4 text-sm leading-6 text-teal-50">
                    {score === null
                      ? 'Skor belum tersedia dari backend. Diperlukan rumus penilaian yang transparan dan indikator aktual yang valid.'
                      : 'Skor dihitung oleh backend berdasarkan indikator bisnis yang tersedia. Periksa komponen penilaian untuk memahami hasilnya.'}
                  </p>

                  {Array.isArray(komponen) && komponen.length > 0 && (
                    <div className="mt-4 border-t border-white/20 pt-3">
                      <p className="mb-2 text-xs font-semibold text-teal-100">
                        Komponen penilaian
                      </p>

                      {komponen.map((item, index) => (
                        <div
                          key={`${item.nama ?? 'komponen'}-${index}`}
                          className="flex justify-between gap-3 py-1 text-sm"
                        >
                          <span>{item.nama ?? 'Indikator'}</span>
                          <span className="font-semibold">
                            {item.nilai == null
                              ? 'Belum tersedia'
                              : formatNumber(item.nilai, 2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 border-t border-white/20 pt-4">
                    <p className="text-xs text-teal-100">
                      Produk dalam data forecasting
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {forecastData.length} produk
                    </p>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
            <div className={cardClass}>
              <p className="text-sm font-medium text-gray-500">
                Tren Penjualan
              </p>
              <p className="mt-3 text-2xl font-bold">
                {trendData.length > 0
                  ? `${trendData.length} periode`
                  : 'Belum tersedia'}
              </p>
              <p className="mt-3 text-sm leading-5 text-gray-500">
                Jumlah periode pada data tren yang berhasil dimuat.
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-medium text-gray-500">
                Risiko Stok Historis
              </p>
              <p className="mt-3 text-2xl font-bold text-red-700">
                {dashboardData.matchedInventoryCount > 0 &&
                dashboardData.ropCount > 0
                  ? `${dashboardData.riskProducts.length} produk`
                  : 'Belum terukur'}
              </p>
              <p className="mt-3 text-sm leading-5 text-gray-500">
                Berdasarkan catatan siklus terakhir yang tersedia, bukan
                konfirmasi stok fisik saat ini.
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-medium text-gray-500">
                Produk dengan Model
              </p>
              <p className="mt-3 text-2xl font-bold">
                {dashboardKpi?.jumlah_produk_bermodel == null
                  ? 'Belum tersedia'
                  : `${formatNumber(
                      dashboardKpi.jumlah_produk_bermodel,
                      0
                    )} produk`}
              </p>
              <p className="mt-3 text-sm leading-5 text-gray-500">
                Cakupan pemodelan dari KPI backend, bukan indikator
                bahwa semua model memiliki akurasi tinggi.
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-medium text-gray-500">
                Prediksi Pendapatan
              </p>
              <p className="mt-3 text-2xl font-bold">
                {dashboardKpi?.total_forecast_pendapatan == null
                  ? 'Belum tersedia'
                  : `Rp ${formatNumber(
                      dashboardKpi.total_forecast_pendapatan,
                      0
                    )}`}
              </p>
              <p className="mt-3 text-sm leading-5 text-gray-500">
                Ditampilkan hanya jika backend menyediakan estimasi
                pendapatan dari data harga dan prediksi kuantitas.
              </p>
            </div>
          </div>
        </section>

        {/* KPI DARI FILE DASHBOARD BARU */}
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              KPI Bisnis dan Operasional
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Ringkasan dari data hasil pengolahan FarmSight.
            </p>
          </div>

          {dashboardDataError && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {dashboardDataError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={cardClass}>
              <p className="text-sm text-gray-500">Total Transaksi</p>
              <p className="mt-2 text-3xl font-bold">
                {dashboardKpi?.total_transaksi == null
                  ? '—'
                  : formatNumber(dashboardKpi.total_transaksi, 0)}
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">
                Total Pendapatan Historis
              </p>
              <p className="mt-2 text-2xl font-bold text-teal-700">
                {dashboardKpi?.total_pendapatan == null
                  ? 'Belum tersedia'
                  : `Rp ${formatNumber(dashboardKpi.total_pendapatan, 0)}`}
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">Prediksi Pendapatan</p>
              <p className="mt-2 text-2xl font-bold text-purple-700">
                {dashboardKpi?.total_forecast_pendapatan == null
                  ? 'Belum tersedia'
                  : `Rp ${formatNumber(
                      dashboardKpi.total_forecast_pendapatan,
                      0
                    )}`}
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">Skor Operasional</p>
              <p className="mt-2 text-3xl font-bold text-blue-700">
                {operationalScore?.skor_operasional == null
                  ? '—'
                  : formatNumber(operationalScore.skor_operasional, 2)}
                {operationalScore?.skor_operasional != null && (
                  <span className="text-base text-gray-400"> / 100</span>
                )}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {operationalScore?.status === 'berhasil_dihitung'
                  ? 'Rasio demand terhadap stok masuk, bukan skor kesehatan bisnis menyeluruh.'
                  : 'Belum dapat dihitung dari data yang tersedia.'}
              </p>
            </div>
          </div>
        </section>

        {/* TREN PENJUALAN */}
        <section className={cardClass}>
          <h2 className="text-xl font-bold text-gray-900">
            Tren Penjualan
          </h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">
            Pendapatan historis per tanggal berdasarkan data transaksi.
          </p>

          {trendData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(value) => formatNumber(value, 0)} />
                  <Legend />
                  <Bar
                    dataKey="pendapatan"
                    name="Pendapatan"
                    fill="#0f766e"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 p-6 text-sm text-gray-500">
              Data tren penjualan belum tersedia atau endpoint belum terhubung.
            </p>
          )}
        </section>

        {/* FORECAST PENDAPATAN */}
        <section className={cardClass}>
          <h2 className="text-xl font-bold text-gray-900">
            Forecast Pendapatan
          </h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">
            Estimasi pendapatan untuk periode forecast yang tersedia.
          </p>

          {revenueForecastData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueForecastData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => `Rp ${formatNumber(value, 0)}`}
                  />
                  <Legend />
                  <Bar
                    dataKey="forecast_pendapatan"
                    name="Prediksi Pendapatan"
                    fill="#7c3aed"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 p-6 text-sm text-gray-500">
              Data forecast pendapatan belum tersedia.
              Pastikan data harga jual dan prediksi kuantitas tersedia.
            </p>
          )}
        </section>

        {/* RINGKASAN PRODUK DARI CSV */}
        <section className={cardClass}>
          <h2 className="text-xl font-bold text-gray-900">
            Ringkasan Penjualan Produk
          </h2>

          <div className="mt-5 overflow-x-auto">
            {dashboardProducts.length > 0 ? (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3 text-right">Unit Terjual</th>
                    <th className="px-4 py-3 text-right">Pendapatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dashboardProducts.map((item, index) => (
                    <tr
                      key={`${item.nama_produk ?? item.kode_produk ?? 'produk'}-${index}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium">
                        {item.nama_produk ??
                          item.nama ??
                          item.kode_produk ??
                          '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.unit_terjual == null
                          ? '—'
                          : formatNumber(item.unit_terjual, 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.pendapatan == null
                          ? '—'
                          : `Rp ${formatNumber(item.pendapatan, 0)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-xl bg-gray-50 p-6 text-sm text-gray-500">
                Data produk belum tersedia.
              </p>
            )}
          </div>
        </section>

        {/* SUMMARY CARDS */}
        <section>
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Ringkasan Pemodelan dan Inventaris
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={cardClass}>
              <p className="text-sm text-gray-500">Produk dalam Respons Forecast</p>
              <p className="mt-2 text-3xl font-bold">
                {dashboardData.products.length}
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">Model Tersedia</p>
              <p className="mt-2 text-3xl font-bold text-teal-700">
                {dashboardData.modeledCount}
                <span className="ml-1 text-base text-gray-400">
                  / {dashboardData.products.length}
                </span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{
                    width: `${
                      dashboardData.products.length
                        ? (dashboardData.modeledCount /
                            dashboardData.products.length) *
                          100
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
                {dashboardData.matchedInventoryCount}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Kode produk cocok dengan data forecasting
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">Evaluasi RMSE Tersedia</p>
              <p className="mt-2 text-3xl font-bold text-purple-700">
                {dashboardData.rmseCount}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Produk memiliki nilai RMSE
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">Total Barang Masuk</p>
              <p className="mt-2 text-3xl font-bold text-blue-700">
                {formatNumber(dashboardData.totalBarangMasuk, 0)}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Akumulasi jumlah pada seluruh catatan siklus
              </p>
            </div>

            <div className={cardClass}>
              <p className="text-sm text-gray-500">Total Permintaan Aktual</p>
              <p className="mt-2 text-3xl font-bold text-teal-700">
                {formatNumber(dashboardData.totalDemandAktual, 0)}
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
                {dashboardData.rasioPemakaianKeseluruhan === null
                  ? 'Belum tersedia'
                  : `${formatNumber(
                      dashboardData.rasioPemakaianKeseluruhan * 100,
                      2
                    )}%`}
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
                {dashboardData.siklusTidakCocok}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Catatan dengan flag siklus tidak cocok
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-gray-500">
            Total barang masuk dan demand merupakan akumulasi catatan siklus,
            bukan jumlah transaksi penjualan atau pendapatan. Total sisa stok
            siklus tidak ditampilkan sebagai stok saat ini karena catatan
            antar-siklus tidak boleh dianggap sebagai saldo berjalan.
          </p>
        </section>

        {/* INSIGHTS */}
        <section>
          <h2 className="text-xl font-bold text-gray-900">
            Insight dan Rekomendasi Bisnis
          </h2>
          <p className="mb-4 mt-1 text-sm text-gray-500">
            Temuan otomatis berdasarkan data yang sudah terhubung.
          </p>

          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={`${insight.title}-${index}`}
                className={`rounded-2xl border p-5 ${getInsightClass(insight.type)}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{insight.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {insight.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      {insight.description}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-gray-800">
                      Rekomendasi: {insight.action}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* INVENTORY CHART */}
        <section className={cardClass}>
          <h2 className="text-xl font-bold text-gray-900">
            Safety Stock dan Reorder Point
          </h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">
            Parameter persediaan dari forecasting API, bukan stok aktual.
          </p>

          {dashboardData.chartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboardData.chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 45 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="kode_produk"
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={65}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatNumber(value)}
                    labelFormatter={(label) => `Produk: ${label}`}
                  />
                  <Legend />
                  <Bar
                    dataKey="Safety_Stock"
                    fill="#3b82f6"
                    name="Safety Stock"
                  />
                  <Bar
                    dataKey="ROP"
                    fill="#10b981"
                    name="Reorder Point (ROP)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 p-6 text-sm text-gray-500">
              Belum ada nilai Safety Stock atau ROP untuk ditampilkan.
            </p>
          )}
        </section>

        {/* PRODUCTS TABLE */}
        <section className={cardClass}>
          <h2 className="text-xl font-bold text-gray-900">
            Produk yang Perlu Diperhatikan
          </h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">
            Stok menggunakan catatan siklus terbaru per produk.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama Produk</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3 text-right">Catatan Stok</th>
                  <th className="px-4 py-3 text-right">Safety Stock</th>
                  <th className="px-4 py-3 text-right">ROP</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {dashboardData.products
                  .filter(
                    (item) =>
                      item.stok_tercatat !== null ||
                      item.ROP !== null ||
                      item.Safety_Stock !== null ||
                      !item.model_terbaik
                  )
                  .sort((a, b) => {
                    const aRisk =
                      a.stok_tercatat !== null &&
                      a.ROP !== null &&
                      a.stok_tercatat <= a.ROP;

                    const bRisk =
                      b.stok_tercatat !== null &&
                      b.ROP !== null &&
                      b.stok_tercatat <= b.ROP;

                    return Number(bRisk) - Number(aRisk);
                  })
                  .map((item, index) => {
                    let status = 'Parameter tersedia';
                    let statusClass = 'bg-blue-50 text-blue-700';

                    if (item.status_produk === 'tidak_aktif_terbaru') {
                      status = 'Tidak aktif';
                      statusClass = 'bg-gray-100 text-gray-600';
                    } else if (
                      item.stok_tercatat !== null &&
                      item.ROP !== null &&
                      item.stok_tercatat <= item.ROP
                    ) {
                      status = 'Perlu perhatian';
                      statusClass = 'bg-red-50 text-red-700';
                    } else if (
                      !item.model_terbaik &&
                      item.tier_model === 'heuristik'
                    ) {
                      status = 'Metode heuristik';
                      statusClass = 'bg-blue-50 text-blue-700';
                    } else if (!item.model_terbaik) {
                      status = 'Belum dimodelkan';
                      statusClass = 'bg-amber-50 text-amber-700';
                    } else if (item.ROP === null) {
                      status = 'ROP belum tersedia';
                      statusClass = 'bg-amber-50 text-amber-700';
                    } else if (item.stok_tercatat === null) {
                      status = 'Catatan stok tidak tersedia';
                      statusClass = 'bg-gray-100 text-gray-600';
                    } else {
                      status = 'Di atas ROP';
                      statusClass = 'bg-green-50 text-green-700';
                    }

                    return (
                      <tr
                        key={`${item.kode_produk}-${index}`}
                        className="hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-4 py-4 font-semibold">
                          {item.kode_produk}
                        </td>
                        <td className="px-4 py-4">{item.nama_produk}</td>
                        <td className="px-4 py-4">
                          {item.model_terbaik
                            ? String(item.model_terbaik).toUpperCase()
                            : 'Belum tersedia'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {formatNumber(item.stok_tercatat)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {formatNumber(item.Safety_Stock)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {formatNumber(item.ROP)}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-5 text-gray-400">
            Catatan stok berasal dari siklus dengan tanggal akhir paling
            baru yang tersedia. Jika sisa stok dicatat per siklus dan
            bukan saldo berjalan, angka ini tidak boleh dianggap sebagai
            stok aktual saat ini. Verifikasi stok fisik sebelum
            mengambil keputusan pengadaan.
          </p>
        </section>

        <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
          FarmSight · Demand Forecasting &amp; Inventory Optimization
          <br />
          Toko Farm Berkah
        </footer>
      </div>
    </div>
  );
};

export default Dashboard;
