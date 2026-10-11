import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import ModelPerformance from './components/ModelPerformance';
import InventoryTable from './components/InventoryTable'; // Import komponen baru

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <nav className="bg-blue-900 shadow-lg p-4 text-white flex justify-between items-center">
        <div className="text-2xl font-bold tracking-wider">FarmSight</div>
        <div className="flex space-x-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'dashboard' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}
          >
            Dashboard ROP
          </button>
          <button 
            onClick={() => setActiveTab('data')}
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'data' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}
          >
            Data Inventaris
          </button>
          <button 
            onClick={() => setActiveTab('mlops')}
            className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'mlops' ? 'bg-blue-700' : 'hover:bg-blue-800'}`}
          >
            Pemantauan Model
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'data' && <InventoryTable />}
        {activeTab === 'mlops' && <ModelPerformance />}
      </main>
    </div>
  );
}

export default App;