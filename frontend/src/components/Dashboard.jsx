import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fetchApi } from '../api';


const BusinessHealthGauge = ({ score }) => {
  const validScore =
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 100;

  // Setengah lingkaran dari kiri ke kanan.
  const cx = 120;
  const cy = 110;
  const radius = 78;

  const polarToCartesian = (angle) => {
    const radians = (angle * Math.PI) / 180;

    return {
      x: cx + radius * Math.cos(radians),
      y: cy - radius * Math.sin(radians),
    };
  };

  const describeArc = (startAngle, endAngle) => {
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // Jarum bergerak dari 180° (0) sampai 0° (100).
  const needleAngle = validScore ? 180 - (score / 100) * 180 : 90;
  const needleLength = 58;

  const needleX =
    cx + needleLength * Math.cos((needleAngle * Math.PI) / 180);
  const needleY =
    cy - needleLength * Math.sin((needleAngle * Math.PI) / 180);

  return (
    <div className="mx-auto mt-4 w-full max-w-xs">
      <svg
        viewBox="0 0 240 168"
        role="img"
        aria-label={
          validScore
            ? `Business Health Score ${score} dari 100`
            : 'Business Health Score belum tersedia'
        }
        className="h-auto w-full overflow-visible"
      >
        {/* Jalur abu-abu ketika skor belum tersedia */}
        {!validScore && (
          <path
            d={describeArc(180, 0)}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="14"
            strokeLinecap="round"
          />
        )}

        {/* Meteran merah, kuning, dan hijau */}
        {validScore && (
          <>
            <path
              d={describeArc(180, 120)}
              fill="none"
              stroke="#f87171"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d={describeArc(120, 60)}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d={describeArc(60, 0)}
              fill="none"
              stroke="#4ade80"
              strokeWidth="14"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Skala */}
        {[0, 20, 40, 60, 80, 100].map((value) => {
          const angle = 180 - (value / 100) * 180;
          const outer = polarToCartesian(angle);
          const inner = {
            x: cx + 68 * Math.cos((angle * Math.PI) / 180),
            y: cy - 68 * Math.sin((angle * Math.PI) / 180),
          };
          const label = {
            x: cx + 98 * Math.cos((angle * Math.PI) / 180),
            y: cy - 98 * Math.sin((angle * Math.PI) / 180),
          };

          return (
            <g key={value}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="white"
                strokeWidth="2"
                opacity={validScore ? 0.9 : 0.4}
              />
              <text
                x={label.x}
                y={label.y}
                fill="white"
                fontSize="10"
                textAnchor="middle"
                dominantBaseline="middle"
                opacity={0.85}
              >
                {value}
              </text>
            </g>
          );
        })}

        {/* Jarum */}
        {validScore && (
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}

        {/* Poros jarum */}
        <circle
          cx={cx}
          cy={cy}
          r="7"
          fill="white"
          stroke="#0f766e"
          strokeWidth="3"
        />

        {/* Nilai tengah */}
        <text
          x={cx}
          y="142"
          fill="white"
          fontSize="25"
          fontWeight="700"
          textAnchor="middle"
        >
          {validScore
            ? Number(score).toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })
            : '—'}
        </text>

        <text
          x={cx}
          y="160"
          fill="rgba(255,255,255,0.8)"
          fontSize="11"
          textAnchor="middle"
        >
          {validScore ? 'DARI 100' : 'SKOR BELUM TERSEDIA'}
        </text>
      </svg>
    </div>
  );
};

const Dashboard = () => {
  const [forecastData, setForecastData] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchRingkasanProduk, setSearchRingkasanProduk] = useState('');
  const [searchProdukPerhatian, setSearchProdukPerhatian] = useState('');

  // State untuk data dashboard tambahan
  const [dashboardKpi, setDashboardKpi] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [revenueForecastData, setRevenueForecastData] = useState([]);
  const [dashboardProducts, setDashboardProducts] = useState([]);
  const [operationalScore, setOperationalScore] = useState(null);
  const [dashboardDataError, setDashboardDataError] = useState('');

  // Horizon forecast pendapatan (jumlah minggu ke depan yang ditampilkan).
  const [forecastHorizon, setForecastHorizon] = useState(4);

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

    // Produk aktif = bukan 'tidak_aktif_terbaru'.
    const activeProducts = mergedProducts.filter(
      (item) => item.status_produk !== 'tidak_aktif_terbaru'
    );

    const activeCount = activeProducts.length;

    const activeModeledCount = activeProducts.filter(
      (item) =>
        item.model_terbaik !== null &&
        String(item.model_terbaik).trim() !== ''
    ).length;

    const activeHeuristicCount = activeProducts.filter(
      (item) =>
        !item.model_terbaik && item.tier_model === 'heuristik'
    ).length;

    // Produk dengan catatan stok dan ROP yang dapat dibandingkan.
    const ropComparable = mergedProducts.filter(
      (item) => item.stok_tercatat !== null && item.ROP !== null
    );

    const ropAboveCount = ropComparable.filter(
      (item) => item.stok_tercatat > item.ROP
    ).length;

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

      activeCount,
      activeModeledCount,
      activeHeuristicCount,
      ropComparableCount: ropComparable.length,
      ropAboveCount,

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

  /*
   * Forecast pendapatan menurut horizon.
   * Backend mengirim satu baris per minggu. Horizon N minggu = N minggu
   * pertama, jadi angkanya sama persis dengan data backend. Horizon
   * maksimum mengikuti jumlah minggu pada forecast_kedepan.csv.
   */
  const forecastView = useMemo(() => {
    const dateShort = (date) =>
      date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
      });

    const dateLong = (date) =>
      date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

    const weeks = (Array.isArray(revenueForecastData)
      ? revenueForecastData
      : []
    )
      .map((item) => ({
        minggu_mulai: item.minggu_mulai ?? item.tanggal ?? null,
        pendapatan: normalizeNumber(
          item.estimasi_pendapatan ?? item.forecast_pendapatan
        ),
        demand: normalizeNumber(item.total_prediksi_demand),
        produk: normalizeNumber(item.jumlah_produk),
      }))
      .filter(
        (item) =>
          item.minggu_mulai &&
          item.pendapatan !== null &&
          !Number.isNaN(new Date(`${item.minggu_mulai}T00:00:00`).getTime())
      )
      .sort((a, b) =>
        String(a.minggu_mulai).localeCompare(String(b.minggu_mulai))
      );

    const maxWeeks = weeks.length;
    const horizon = Math.min(
      Math.max(Number(forecastHorizon) || 1, 1),
      Math.max(maxWeeks, 1)
    );

    let running = 0;

    const rows = weeks.slice(0, horizon).map((item, index) => {
      running += item.pendapatan;

      const start = new Date(`${item.minggu_mulai}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      return {
        ...item,
        minggu_ke: index + 1,
        tanggalLabel: dateShort(start),
        rentang: `${dateShort(start)} – ${dateLong(end)}`,
        kumulatif: running,
      };
    });

    const totalDemand = rows.reduce(
      (total, item) => total + (item.demand ?? 0),
      0
    );

    return {
      rows,
      maxWeeks,
      horizon,
      totalRevenue: running,
      totalDemand,
      averageRevenue: rows.length > 0 ? running / rows.length : null,
      productCount: rows.reduce(
        (max, item) => Math.max(max, item.produk ?? 0),
        0
      ),
      periodLabel:
        rows.length > 0
          ? `${rows[0].rentang.split(' – ')[0]} sampai ${rows[rows.length - 1].rentang.split(' – ')[1]}`
          : '',
    };
  }, [revenueForecastData, forecastHorizon]);

  /*
   * Skor kesehatan bisnis.
   * 1) Jika backend mengirim skor_kesehatan_bisnis, nilai itu dipakai.
   * 2) Jika belum, dihitung skor gabungan SEMENTARA dari indikator
   *    yang benar-benar ada di data, dengan bobot yang ditampilkan
   *    terbuka pada kartu agar mudah diperiksa dan diubah.
   */
  const healthInfo = useMemo(() => {
    const backendScore = normalizeNumber(
      dashboardKpi?.skor_kesehatan_bisnis
    );

    if (backendScore !== null) {
      return {
        score: backendScore,
        label: dashboardKpi?.label_kesehatan_bisnis ?? null,
        komponen: dashboardKpi?.komponen_skor_kesehatan_bisnis ?? [],
        source: 'backend',
      };
    }

    const utilisasi = normalizeNumber(
      operationalScore?.skor_operasional
    );

    const kepatuhanRop =
      dashboardData.ropComparableCount > 0
        ? (dashboardData.ropAboveCount /
            dashboardData.ropComparableCount) *
          100
        : null;

    const cakupanModel =
      dashboardData.activeCount > 0
        ? (dashboardData.activeModeledCount /
            dashboardData.activeCount) *
          100
        : null;

    const komponen = [
      { nama: 'Utilisasi stok', nilai: utilisasi, bobot: 40 },
      { nama: 'Stok di atas ROP', nilai: kepatuhanRop, bobot: 30 },
      { nama: 'Produk aktif bermodel', nilai: cakupanModel, bobot: 30 },
    ];

    const tersedia = komponen.filter((item) => item.nilai !== null);

    if (tersedia.length < 2) {
      return { score: null, label: null, komponen, source: 'none' };
    }

    const totalBobot = tersedia.reduce(
      (total, item) => total + item.bobot,
      0
    );

    const score =
      tersedia.reduce(
        (total, item) => total + item.nilai * item.bobot,
        0
      ) / totalBobot;

    const label =
      score >= 75 ? 'Baik' : score >= 50 ? 'Cukup' : 'Perlu perhatian';

    return { score, label, komponen, source: 'sementara' };
  }, [dashboardKpi, operationalScore, dashboardData]);

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

    {
      const inactiveCount = total - dashboardData.activeCount;
      const unmodeled =
        dashboardData.activeCount -
        dashboardData.activeModeledCount -
        dashboardData.activeHeuristicCount;

      result.push({
        type: unmodeled > 0 ? 'warning' : 'info',
        icon: '🧠',
        title: 'Cakupan model pada produk aktif',
        description:
          `${dashboardData.activeModeledCount} dari ${dashboardData.activeCount} produk aktif memiliki model peramalan. ` +
          `${dashboardData.activeHeuristicCount} produk aktif memakai metode heuristik karena data penjualannya belum cukup, ` +
          `dan ${inactiveCount} produk tidak aktif sengaja tidak diprediksi.` +
          (unmodeled > 0
            ? ` ${unmodeled} produk aktif belum dimodelkan.`
            : ''),
        action:
          'Evaluasi kualitas model dengan metrik error, dan tambah data penjualan agar produk heuristik dapat dimodelkan.',
      });
    }

    // --- Tren penjualan: 90 hari terakhir vs 90 hari sebelumnya ---
    const trendPoints = (Array.isArray(trendData) ? trendData : [])
      .map((item) => ({
        time: new Date(item.tanggal).getTime(),
        value: normalizeNumber(item.pendapatan) ?? 0,
      }))
      .filter((item) => Number.isFinite(item.time));

    if (trendPoints.length > 0) {
      const lastTime = Math.max(...trendPoints.map((item) => item.time));
      const day = 24 * 60 * 60 * 1000;

      const recent = trendPoints
        .filter((item) => item.time > lastTime - 90 * day)
        .reduce((total, item) => total + item.value, 0);

      const previous = trendPoints
        .filter(
          (item) =>
            item.time <= lastTime - 90 * day &&
            item.time > lastTime - 180 * day
        )
        .reduce((total, item) => total + item.value, 0);

      const lastDate = new Date(lastTime).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      if (previous > 0) {
        const change = ((recent - previous) / previous) * 100;
        const naik = change >= 0;

        result.push({
          type: naik ? 'success' : 'warning',
          icon: '📈',
          title: `Pendapatan 90 hari terakhir ${naik ? 'naik' : 'turun'} ${formatNumber(Math.abs(change), 1)}%`,
          description:
            `Sampai ${lastDate}, pendapatan 90 hari terakhir Rp ${formatNumber(recent, 0)} ` +
            `dibandingkan Rp ${formatNumber(previous, 0)} pada 90 hari sebelumnya.`,
          action: naik
            ? 'Pastikan stok produk yang laris cukup untuk menjaga momentum.'
            : 'Tinjau produk dan periode yang menurun, lalu cocokkan dengan stok dan kegiatan penjualan.',
        });
      } else {
        result.push({
          type: 'info',
          icon: '📈',
          title: 'Tren penjualan belum dapat dibandingkan',
          description:
            `Data transaksi tersedia sampai ${lastDate}, tetapi belum ada pembanding 90 hari sebelumnya.`,
          action:
            'Lengkapi riwayat transaksi agar perbandingan antarperiode dapat dihitung.',
        });
      }
    } else {
      result.push({
        type: 'info',
        icon: '📈',
        title: 'Tren penjualan belum dapat dinilai',
        description:
          'Data transaksi berdasarkan tanggal belum berhasil dimuat dari backend.',
        action:
          'Pastikan endpoint /api/dashboard/tren-penjualan aktif.',
      });
    }

    // --- Prediksi permintaan ---
    const forecastWeeks = Array.isArray(revenueForecastData)
      ? revenueForecastData
      : [];

    if (forecastWeeks.length > 0) {
      const totalDemand = forecastWeeks.reduce(
        (total, item) =>
          total + (normalizeNumber(item.total_prediksi_demand) ?? 0),
        0
      );

      const productCount = Math.max(
        ...forecastWeeks.map(
          (item) => normalizeNumber(item.jumlah_produk) ?? 0
        )
      );

      result.push({
        type: 'info',
        icon: '🔮',
        title: `Prediksi permintaan tersedia untuk ${forecastWeeks.length} minggu ke depan`,
        description:
          `Total prediksi ${formatNumber(totalDemand, 1)} unit dari ${productCount} produk yang memiliki model. ` +
          `Produk dengan metode heuristik (${dashboardData.activeHeuristicCount} produk aktif) belum memiliki prediksi per minggu.`,
        action:
          'Gunakan prediksi sebagai perkiraan kasar dan pantau akurasinya terhadap penjualan aktual.',
      });
    } else {
      result.push({
        type: 'info',
        icon: '🔮',
        title: 'Prediksi permintaan belum tersedia',
        description:
          'Data prediksi mingguan belum berhasil dimuat dari backend.',
        action:
          'Pastikan endpoint /api/dashboard/forecast-pendapatan aktif.',
      });
    }

    // --- Pendapatan ---
    const totalPendapatan = normalizeNumber(dashboardKpi?.total_pendapatan);
    const totalForecast = normalizeNumber(
      dashboardKpi?.total_forecast_pendapatan
    );

    if (totalPendapatan !== null) {
      result.push({
        type: 'info',
        icon: '💰',
        title: `Pendapatan historis Rp ${formatNumber(totalPendapatan, 0)}`,
        description:
          `Berasal dari ${formatNumber(dashboardKpi?.total_transaksi ?? 0, 0)} transaksi. ` +
          (totalForecast !== null
            ? `Estimasi pendapatan periode forecast Rp ${formatNumber(totalForecast, 0)}, dihitung dari prediksi demand dikali harga satuan dan hanya mencakup produk yang memiliki prediksi.`
            : 'Estimasi pendapatan forecast belum tersedia.'),
        action:
          'Bandingkan estimasi dengan realisasi tiap minggu sebelum dipakai untuk perencanaan.',
      });
    } else {
      result.push({
        type: 'info',
        icon: '💰',
        title: 'Pendapatan belum dapat dihitung',
        description:
          'Data KPI pendapatan belum berhasil dimuat dari backend.',
        action:
          'Pastikan endpoint /api/dashboard/kpi aktif.',
      });
    }

    return result;
  }, [
    dashboardData,
    dashboardKpi,
    trendData,
    revenueForecastData,
  ]);

  const cardClass =
    'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm';

  const lowReliabilityCount = forecastData.filter(
    (item) => item.model_terbaik && item.keandalan === 'rendah'
  ).length;

  const sortedProducts = [
    ...(Array.isArray(dashboardProducts) ? dashboardProducts : []),
  ].sort(
    (a, b) =>
      (normalizeNumber(b.pendapatan) ?? 0) -
      (normalizeNumber(a.pendapatan) ?? 0)
  );

  
  // Filter pencarian pada tabel Ringkasan Penjualan Produk.
  const filteredSortedProducts = sortedProducts.filter((item) => {
    const keyword = searchRingkasanProduk.trim().toLowerCase();

    // Jika kolom pencarian kosong, tampilkan seluruh produk.
    if (!keyword) return true;

    const nama = String(
      item.nama_produk ?? item.nama ?? ''
    ).toLowerCase();

    const kode = String(
      item.kode_produk ?? item.produk ?? ''
    ).toLowerCase();

    return nama.includes(keyword) || kode.includes(keyword);
  });

  // Filter pencarian pada tabel Produk yang Perlu Diperhatikan.
  const filteredAttentionProducts = dashboardData.products
    .filter(
      (item) =>
        item.stok_tercatat !== null ||
        item.ROP !== null ||
        item.Safety_Stock !== null ||
        !item.model_terbaik
    )
    .filter((item) => {
      const keyword = searchProdukPerhatian.trim().toLowerCase();

      // Jika kolom pencarian kosong, tampilkan seluruh produk.
      if (!keyword) return true;

      const nama = String(item.nama_produk ?? '').toLowerCase();
      const kode = String(item.kode_produk ?? '').toLowerCase();

      return nama.includes(keyword) || kode.includes(keyword);
    })
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
    });


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
              const rawScore = healthInfo.score;

              const score =
                rawScore !== null && rawScore >= 0 && rawScore <= 100
                  ? rawScore
                  : null;

              const label = healthInfo.label;
              const komponen = healthInfo.komponen;

              return (
                <>
                  {/* Diagram meteran */}
                  <BusinessHealthGauge score={score} />

                  <div className="mt-3 text-center">
                    <span className="inline-flex rounded-full bg-white/15 px-3 py-1.5 text-sm">
                      {score === null
                        ? 'Belum dapat dihitung'
                        : label || 'Skor tersedia'}
                    </span>
                  </div>

                  <p className="mt-4 text-center text-sm leading-6 text-teal-50">
                    {score === null
                      ? 'Skor belum dapat dihitung karena indikator yang tersedia belum cukup.'
                      : healthInfo.source === 'backend'
                      ? 'Skor dihitung oleh backend berdasarkan indikator bisnis yang tersedia. Periksa komponen penilaian untuk memahami hasilnya.'
                      : 'Skor gabungan sementara dari tiga indikator pada data yang terhubung, dengan bobot yang ditampilkan di bawah. Bukan penilaian bisnis menyeluruh.'}
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
                          <span>
                            {item.nama ?? 'Indikator'}
                            {item.bobot != null && (
                              <span className="ml-1 text-xs text-teal-200">
                                (bobot {item.bobot}%)
                              </span>
                            )}
                          </span>
                          <span className="font-semibold">
                            {item.nilai == null
                              ? 'Belum tersedia'
                              : formatNumber(item.nilai, 1)}
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
                  ? `${trendData.length} hari transaksi`
                  : 'Belum tersedia'}
              </p>
              <p className="mt-3 text-sm leading-5 text-gray-500">
                Jumlah tanggal yang memiliki transaksi pada data tren.
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
                {dashboardData.activeCount > 0
                  ? `${dashboardData.activeModeledCount} dari ${dashboardData.activeCount} produk aktif`
                  : 'Belum tersedia'}
              </p>
              <p className="mt-3 text-sm leading-5 text-gray-500">
                Produk aktif yang memiliki model peramalan.{' '}
                {dashboardData.activeHeuristicCount} produk aktif memakai
                metode heuristik. Ini cakupan pemodelan, bukan ukuran
                akurasi.
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
              {forecastView.maxWeeks > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Total {forecastView.maxWeeks} minggu ke depan. Atur
                  horizon di bagian Forecast Pendapatan.
                </p>
              )}
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
                {['berhasil', 'berhasil_dihitung'].includes(
                  operationalScore?.status
                )
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
                  <XAxis
                    dataKey="tanggal"
                    tick={{ fontSize: 11 }}
                    minTickGap={40}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => `Rp ${formatNumber(value, 0)}`}
                  />
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
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Forecast Pendapatan
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Estimasi pendapatan dari prediksi demand dikali harga
                satuan, untuk horizon yang Anda pilih.
              </p>
            </div>

            {forecastView.maxWeeks > 0 && (
              <div className="shrink-0">
                <p
                  id="horizon-label"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Horizon forecast
                </p>

                <div
                  role="radiogroup"
                  aria-labelledby="horizon-label"
                  className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1"
                >
                  {Array.from(
                    { length: forecastView.maxWeeks },
                    (_, index) => index + 1
                  ).map((weeks) => {
                    const selected = forecastView.horizon === weeks;

                    return (
                      <button
                        key={weeks}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setForecastHorizon(weeks)}
                        className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                          selected
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-white hover:text-gray-900'
                        }`}
                      >
                        {weeks} minggu
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {forecastView.rows.length > 0 ? (
            <>
              <p className="mt-4 text-sm text-gray-600">
                Periode: <strong>{forecastView.periodLabel}</strong>
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-purple-50 p-4">
                  <p className="text-xs font-medium text-purple-700">
                    Total estimasi pendapatan
                  </p>
                  <p className="mt-1 text-2xl font-bold text-purple-900">
                    Rp {formatNumber(forecastView.totalRevenue, 0)}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-500">
                    Rata-rata per minggu
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    Rp {formatNumber(forecastView.averageRevenue, 0)}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-500">
                    Total prediksi demand
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatNumber(forecastView.totalDemand, 1)} unit
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-500">
                    Produk dengan prediksi
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {forecastView.productCount} produk
                  </p>
                </div>
              </div>

              <div className="mt-6 h-96">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                    data={forecastView.rows}
                    margin={{ top: 24, right: 16, left: 8, bottom: 8 }}
                    >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="tanggalLabel" tick={{ fontSize: 12 }} />
                    <YAxis
                        tick={{ fontSize: 11 }}
                        domain={[0, 'auto']}
                        width={56}
                        tickFormatter={(value) =>
                        new Intl.NumberFormat('id-ID', {
                            notation: 'compact',
                            maximumFractionDigits: 1,
                        }).format(value)
                        }
                    />
                    <Tooltip
                        cursor={{ fill: 'rgba(124, 58, 237, 0.08)' }}
                        content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload;

                        return (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md">
                            <p className="font-semibold text-gray-900">
                                Minggu ke-{row.minggu_ke}
                            </p>
                            <p className="mb-2 text-xs text-gray-500">{row.rentang}</p>
                            <p className="text-purple-700">
                                Kumulatif: <strong>Rp {formatNumber(row.kumulatif, 0)}</strong>
                            </p>
                            <p className="text-gray-600">
                                Minggu ini: Rp {formatNumber(row.pendapatan, 0)}
                            </p>
                            </div>
                        );
                        }}
                    />
                    <Legend />

                    <Bar
                        dataKey="kumulatif"
                        name="Estimasi kumulatif"
                        fill="#7c3aed"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={80}
                    >
                        <LabelList
                        dataKey="kumulatif"
                        position="insideTop"
                        formatter={(value) =>
                            new Intl.NumberFormat('id-ID', {
                            notation: 'compact',
                            maximumFractionDigits: 1,
                            }).format(value)
                        }
                        style={{ fontSize: 12, fontWeight: 600, fill: '#ffffff' }}
                        />
                    </Bar>

                    <Line
                        type="monotone"
                        dataKey="kumulatif"
                        name="Garis kumulatif"
                        stroke="#0f766e"
                        strokeWidth={3}
                        dot={{ r: 5, fill: '#ffffff', stroke: '#0f766e', strokeWidth: 2 }}
                        activeDot={{ r: 7 }}
                    />
                    </ComposedChart>
                </ResponsiveContainer>
                </div>

              <p className="mt-4 text-xs leading-5 text-gray-500">
                Ini estimasi, bukan pendapatan aktual. Hanya mencakup{' '}
                {forecastView.productCount} produk yang memiliki prediksi
                model; produk dengan metode heuristik dan produk tidak
                aktif tidak termasuk, jadi totalnya lebih rendah dari
                pendapatan sebenarnya.{' '}
                {lowReliabilityCount > 0 &&
                  `${lowReliabilityCount} produk berkeandalan rendah. `}
                Gunakan sebagai perkiraan kasar. Horizon maksimum{' '}
                {forecastView.maxWeeks} minggu sesuai data prediksi yang
                tersedia.
              </p>
            </>
          ) : (
            <p className="mt-5 rounded-xl bg-gray-50 p-6 text-sm text-gray-500">
              Data forecast pendapatan belum tersedia. Pastikan
              forecast_kedepan.csv dan harga satuan produk tersedia.
            </p>
          )}
        </section>

        
        {/* RINGKASAN PRODUK DARI CSV */}
        <section className={cardClass}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
            <h2 className="text-xl font-bold text-gray-900">
                Ringkasan Penjualan Produk
            </h2>
            <p className="mt-1 text-sm text-gray-500">
                Cari produk dan gulir tabel tanpa memperpanjang halaman.
            </p>
            </div>

            <span className="text-sm text-gray-500">
            {filteredSortedProducts.length} produk
            </span>
        </div>

        <div className="mt-4">
            <input
            type="text"
            value={searchRingkasanProduk}
            onChange={(e) => setSearchRingkasanProduk(e.target.value)}
            placeholder="Cari nama atau kode produk..."
            aria-label="Cari nama atau kode produk pada ringkasan penjualan"
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                <tr>
                    <th className="whitespace-nowrap px-4 py-3">Produk</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                    Unit Terjual
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                    Pendapatan
                    </th>
                </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                {filteredSortedProducts.length > 0 ? (
                    filteredSortedProducts.map((item, index) => (
                    <tr
                        key={`${item.nama_produk ?? item.kode_produk ?? 'produk'}-${index}`}
                        className="hover:bg-gray-50"
                    >
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {item.nama_produk ??
                            item.nama ??
                            item.kode_produk ??
                            '—'}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {item.unit_terjual == null
                            ? '—'
                            : formatNumber(item.unit_terjual, 0)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {item.pendapatan == null
                            ? '—'
                            : `Rp ${formatNumber(item.pendapatan, 0)}`}
                        </td>
                    </tr>
                    ))
                ) : (
                    <tr>
                    <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-gray-500"
                    >
                        Tidak ada produk yang cocok dengan pencarian.
                    </td>
                    </tr>
                )}
                </tbody>
            </table>
            </div>
        </div>

        <p className="mt-2 text-xs text-gray-400">
            Gulir ke bawah untuk melihat baris lainnya. Geser ke samping jika
            tabel melebihi lebar layar.
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
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                <h2 className="text-xl font-bold text-gray-900">
                    Produk yang Perlu Diperhatikan
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                    Stok menggunakan catatan siklus terbaru per produk.
                </p>
                </div>

                <span className="text-sm text-gray-500">
                {filteredAttentionProducts.length} produk
                </span>
            </div>

            <div className="mt-4">
                <input
                type="text"
                value={searchProdukPerhatian}
                onChange={(e) => setSearchProdukPerhatian(e.target.value)}
                placeholder="Cari nama atau kode produk..."
                aria-label="Cari nama atau kode produk yang perlu diperhatikan"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                    <tr>
                        <th className="whitespace-nowrap px-4 py-3">Kode</th>
                        <th className="whitespace-nowrap px-4 py-3">Nama Produk</th>
                        <th className="whitespace-nowrap px-4 py-3">Model</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                        Catatan Stok
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                        Safety Stock
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                        ROP
                        </th>
                        <th className="whitespace-nowrap px-4 py-3">Status</th>
                    </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                    {filteredAttentionProducts.length > 0 ? (
                        filteredAttentionProducts.map((item, index) => {
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
                            <td className="whitespace-nowrap px-4 py-3 font-semibold">
                                {item.kode_produk}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                                {item.nama_produk}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                                {item.model_terbaik
                                ? String(item.model_terbaik).toUpperCase()
                                : 'Belum tersedia'}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                                {formatNumber(item.stok_tercatat)}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                                {formatNumber(item.Safety_Stock)}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                                {formatNumber(item.ROP)}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                                <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                                >
                                {status}
                                </span>
                            </td>
                            </tr>
                        );
                        })
                    ) : (
                        <tr>
                        <td
                            colSpan={7}
                            className="px-4 py-8 text-center text-gray-500"
                        >
                            Tidak ada produk yang cocok dengan pencarian.
                        </td>
                        </tr>
                    )}
                    </tbody>
                </table>
                </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-gray-400">
                Catatan stok berasal dari siklus dengan tanggal akhir paling baru
                yang tersedia. Jika sisa stok dicatat per siklus dan bukan saldo
                berjalan, angka ini tidak boleh dianggap sebagai stok aktual saat
                ini. Verifikasi stok fisik sebelum mengambil keputusan pengadaan.
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
