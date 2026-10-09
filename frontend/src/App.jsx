import React, { useState, useEffect } from 'react';

function App() {
  const [forecastData, setForecastData] = useState([]);
  const [summary, setSummary] = useState({ total_products: 0, active_alerts: 0, model_used: 'Loading...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ambil data prediksi demand dari backend FastAPI
    fetch('http://localhost:8000/api/demand-forecast')
      .then(res => res.json())
      .then(data => {
        setForecastData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Gagal memuat data:", err);
        setLoading(false);
      });

    // Ambil ringkasan dashboard
    fetch('http://localhost:8000/api/dashboard-summary')
      .then(res => res.json())
      .then(data => setSummary(data))
      .catch(err => console.error("Gagal memuat ringkasan:", err));
  }, []);

  // Filter pencarian berdasarkan ID atau Nama Produk
  const filteredData = forecastData.filter(item => 
    item.product_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.product_name && item.product_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-green-700 text-white p-4 shadow-md flex justify-between items-center px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">FarmSight Dashboard</h1>
          <p className="text-xs text-green-200">Sistem Perencanaan Permintaan & Manajemen Inventaris Pertanian</p>
        </div>
        <div className="text-sm bg-green-800 px-3 py-1.5 rounded-lg border border-green-600">
          Model: <span className="font-semibold">{summary.model_used}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-8 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-between">
            <span className="text-gray-500 text-sm font-medium">Total Produk Dipantau</span>
            <span className="text-2xl font-bold text-gray-800 mt-2">{summary.total_products} Produk</span>
          </div>
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-between">
            <span className="text-gray-500 text-sm font-medium">Peringatan Restock (ROP)</span>
            <span className="text-2xl font-bold text-amber-600 mt-2">{summary.active_alerts} Item Perlu Dipesan</span>
          </div>
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-between">
            <span className="text-gray-500 text-sm font-medium">Status Sistem</span>
            <span className="text-2xl font-bold text-green-600 mt-2">Sinkron & Aktif</span>
          </div>
        </div>

        {/* Data Table Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-700">Hasil Prediksi & Metrik Stok</h2>
            <input 
              type="text"
              placeholder="Cari ID Produk..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-600 w-full sm:w-64"
            />
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-green-50 text-green-800 text-sm">
                  <th className="p-3 border-b-2 border-green-200">ID Produk</th>
                  <th className="p-3 border-b-2 border-green-200">Nama Produk</th>
                  <th className="p-3 border-b-2 border-green-200">Forecast Value (Permintaan)</th>
                  <th className="p-3 border-b-2 border-green-200">Safety Stock</th>
                  <th className="p-3 border-b-2 border-green-200">Reorder Point (ROP)</th>
                  <th className="p-3 border-b-2 border-green-200">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-gray-500 italic">
                      Menghubungkan ke server backend FarmSight...
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 border-b border-gray-100 text-sm">
                      <td className="p-3 font-medium text-gray-800">{row.product_id}</td>
                      <td className="p-3 text-gray-700">{row.product_name || '-'}</td>
                      <td className="p-3 text-gray-700 font-semibold text-green-700">{row.forecast_value}</td>
                      <td className="p-3 text-gray-700">{row.safety_stock}</td>
                      <td className="p-3 text-gray-700">{row.rop}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          row.forecast_value > (row.rop || 0) 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {row.status || (row.forecast_value > (row.rop || 0) ? 'Aman' : 'Perlu Restock')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-gray-500 italic">
                      Tidak ada data produk yang cocok dengan pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;