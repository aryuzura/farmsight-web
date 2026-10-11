
import React, { useState, useEffect } from 'react';
import { fetchApi } from '../api';

const InventoryTable = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadInventory = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await fetchApi('/api/inventory');

        if (!cancelled) {
          console.log('Inventory API:', data);
          console.log('Contoh data inventaris:', data?.[0]);

          setInventory(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Inventory error:', err);
          setError(
            err.message || 'Terjadi kesalahan saat memuat inventaris.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInventory();

    return () => {
      cancelled = true;
    };
  }, []);

  // Format tanggal YYYY-MM-DD tanpa menggeser hari.
  const formatDate = (value) => {
    if (!value) return '-';

    const text = String(value);
    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateOnly) {
      return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? text
      : date.toLocaleDateString('id-ID');
  };

  // Format angka menggunakan format Indonesia.
  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number.toLocaleString('id-ID')
      : String(value);
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        Memuat data inventaris...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-700 bg-red-50 rounded-lg">
        <h2 className="font-semibold">
          Gagal memuat inventaris
        </h2>

        <p>{error}</p>

        <p className="text-sm mt-2">
          Periksa backend dan endpoint /api/inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-semibold text-gray-700">
          Log Pergerakan Inventaris Terpadu
        </h2>

        <span className="text-sm text-gray-500">
          {inventory.length} data
        </span>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Data inventaris dari backend FarmSight.
      </p>

      {inventory.length === 0 ? (
        <p className="text-gray-500">
          Belum ada data inventaris yang tersedia.
        </p>
      ) : (
        <div className="overflow-auto max-h-96 rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  ID Produk
                </th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  Nama Item
                </th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  Tanggal Produksi
                </th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  Tanggal Pesanan
                </th>

                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  Stok Tersedia
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {inventory.map((item, idx) => (
                <tr
                  key={`${item.kode_produk ?? 'item'}-${idx}`}
                  className="hover:bg-gray-50"
                >
                  {/* ID Produk */}
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {item.kode_produk ?? '-'}
                  </td>

                  {/* Nama Item */}
                  <td className="px-6 py-4 text-sm font-medium text-blue-600">
                    {item.nama_produk ?? '-'}
                  </td>

                  {/* Tanggal Produksi: tanggal barang masuk */}
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(item.tanggal_barang_masuk)}
                  </td>

                  {/* Tanggal Pesanan */}
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(item.tanggal_pemesanan)}
                  </td>

                  {/* Sisa stok pada siklus */}
                  <td className="px-6 py-4 text-sm font-semibold text-gray-700 text-right whitespace-nowrap">
                    {formatNumber(item.sisa_stok)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InventoryTable;