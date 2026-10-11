import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import ModelPerformance from './components/ModelPerformance';
import InventoryTable from './components/InventoryTable';
import LaboratoriumPrediksi from './components/LaboratoriumPrediksi';

// Menu navbar. `id` dipakai sebagai activeTab.
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'data', label: 'Data Inventaris' },
  { id: 'mlops', label: 'Pemantauan Model' },
  { id: 'lab', label: 'Laboratorium Prediksi' },
];

const NAV_FONT = {
  fontFamily:
    "'Barlow Semi Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif",
};

const BrandIcon = () => (
  <img
    src="/logo.png"
    alt="Logo FarmSight"
    className="h-10 w-10 shrink-0 object-contain"
  />
);

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Font navbar dimuat sekali dari Google Fonts.
  useEffect(() => {
    const id = 'farmsight-nav-font';
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }, []);

  const changeTab = (id) => {
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* NAVBAR: tetap di atas saat halaman di-scroll */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
        <nav
          aria-label="Navigasi utama"
          style={NAV_FONT}
          className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 rounded-full border border-gray-200 bg-white/90 px-4 py-2.5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md sm:px-8"
        >
          {/* Kiri: logo dan nama */}
          <button
            type="button"
            onClick={() => changeTab('dashboard')}
            className="flex shrink-0 items-center gap-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="FarmSight, ke Dashboard"
          >
            <BrandIcon />
            <span className="hidden text-2xl font-semibold tracking-tight text-slate-900 sm:block">
              FarmSight
            </span>
          </button>

          {/* Tengah: menu */}
          <div className="flex min-w-0 items-center gap-5 overflow-x-auto sm:gap-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => changeTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative shrink-0 whitespace-nowrap py-2 text-lg transition-colors focus:outline-none focus-visible:text-blue-700 ${
                    active
                      ? 'font-semibold text-slate-900'
                      : 'font-normal text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600 transition-opacity ${
                      active ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Kanan: akun / toko */}
          <div className="flex shrink-0 items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white"
              aria-hidden="true"
            >
              TFB
            </div>
            <span className="hidden text-lg font-semibold text-slate-900 md:block">
              Toko Farm Berkah
            </span>
          </div>
        </nav>
      </header>

      {/* pt-28: ruang agar konten tidak tertutup navbar yang fixed */}
      <main className="mx-auto max-w-7xl px-4 pb-8 pt-28">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'data' && <InventoryTable />}
        {activeTab === 'mlops' && <ModelPerformance />}
        {activeTab === 'lab' && <LaboratoriumPrediksi />}
      </main>
    </div>
  );
}

export default App;
